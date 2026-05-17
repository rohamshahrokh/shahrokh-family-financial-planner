/**
 * Adaptive Learning — pure event-driven state machine.
 *
 * Usage:
 *   const state0 = emptyAdaptiveState();
 *   const state1 = recordEvent(state0, { type: 'recommendation_ignored', at, ref: 'crypto_dca' });
 *   const adjustments = deriveAdjustments(state1);
 *
 * Adjustments decorate Recommendation Engine V2 outputs (ranking multipliers,
 * urgency tilts, risk tilts). They never override hard safety pillars.
 */

import type {
  AdaptiveAdjustments,
  AdaptiveEvent,
  AdaptiveLearningResult,
  AdaptiveState,
} from './types';

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

export function emptyAdaptiveState(): AdaptiveState {
  return {
    events: [],
    counters: {
      acceptedByActionType: {},
      ignoredByActionType: {},
      dismissedByActionType: {},
    },
    inferred: {
      riskShift: 0,
      leverageShift: 0,
      liquidityShift: 0,
      investingShift: 0,
      panicScore: 0,
      fireShift: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function recordEvent(state: AdaptiveState, ev: AdaptiveEvent): AdaptiveState {
  const next: AdaptiveState = {
    ...state,
    events: [...state.events, ev].slice(-200), // keep last 200 events in memory
    counters: {
      acceptedByActionType: { ...state.counters.acceptedByActionType },
      ignoredByActionType: { ...state.counters.ignoredByActionType },
      dismissedByActionType: { ...state.counters.dismissedByActionType },
    },
    inferred: { ...state.inferred },
    updatedAt: ev.at,
  };

  const ref = ev.ref ?? '_';
  switch (ev.type) {
    case 'recommendation_accepted':
      next.counters.acceptedByActionType[ref] = (next.counters.acceptedByActionType[ref] ?? 0) + 1;
      break;
    case 'recommendation_ignored':
      next.counters.ignoredByActionType[ref] = (next.counters.ignoredByActionType[ref] ?? 0) + 1;
      break;
    case 'recommendation_dismissed':
      next.counters.dismissedByActionType[ref] = (next.counters.dismissedByActionType[ref] ?? 0) + 1;
      break;
    case 'risk_pref_changed':
      next.inferred.riskShift = clamp(next.inferred.riskShift + (ev.magnitude ?? 0) * 0.2, -1, 1);
      break;
    case 'asset_pref_changed':
      next.inferred.investingShift = clamp(next.inferred.investingShift + (ev.magnitude ?? 0) * 0.15, -1, 1);
      break;
    case 'spending_increased':
      next.inferred.investingShift = clamp(next.inferred.investingShift - 0.05, -1, 1);
      next.inferred.fireShift = clamp(next.inferred.fireShift - 0.05, -1, 1);
      break;
    case 'spending_decreased':
      next.inferred.investingShift = clamp(next.inferred.investingShift + 0.05, -1, 1);
      next.inferred.fireShift = clamp(next.inferred.fireShift + 0.05, -1, 1);
      break;
    case 'leverage_increased':
      next.inferred.leverageShift = clamp(next.inferred.leverageShift + 0.15, -1, 1);
      break;
    case 'leverage_decreased':
      next.inferred.leverageShift = clamp(next.inferred.leverageShift - 0.15, -1, 1);
      break;
    case 'liquidity_increased':
      next.inferred.liquidityShift = clamp(next.inferred.liquidityShift + 0.15, -1, 1);
      break;
    case 'liquidity_decreased':
      next.inferred.liquidityShift = clamp(next.inferred.liquidityShift - 0.15, -1, 1);
      break;
    case 'drawdown_reaction':
      // Negative magnitude = panicked sell; positive = added on dip (anti-fragile).
      if ((ev.magnitude ?? 0) < 0) next.inferred.panicScore = clamp(next.inferred.panicScore + 0.15, 0, 1);
      else if ((ev.magnitude ?? 0) > 0) next.inferred.panicScore = clamp(next.inferred.panicScore - 0.05, 0, 1);
      break;
    case 'assumption_changed':
      // No direct shift — but recency could imply user is engaged. Caller may interpret.
      break;
  }
  return next;
}

export function recordEvents(state: AdaptiveState, events: AdaptiveEvent[]): AdaptiveState {
  return events.reduce((s, e) => recordEvent(s, e), state);
}

/**
 * Derive ranking / urgency adjustments from the current adaptive state.
 * Conservative bands — never moves a baseline by more than ~30%.
 */
export function deriveAdjustments(state: AdaptiveState): AdaptiveAdjustments {
  const rankingMultiplierByActionType: Record<string, number> = {};
  const totalSeen = (key: string) =>
    (state.counters.acceptedByActionType[key] ?? 0) +
    (state.counters.ignoredByActionType[key] ?? 0) +
    (state.counters.dismissedByActionType[key] ?? 0);

  const allKeys = Array.from(new Set<string>([
    ...Object.keys(state.counters.acceptedByActionType),
    ...Object.keys(state.counters.ignoredByActionType),
    ...Object.keys(state.counters.dismissedByActionType),
  ]));
  for (const key of allKeys) {
    const seen = totalSeen(key);
    if (seen <= 0) continue;
    const accepted = state.counters.acceptedByActionType[key] ?? 0;
    const ignored = state.counters.ignoredByActionType[key] ?? 0;
    const dismissed = state.counters.dismissedByActionType[key] ?? 0;
    const acceptanceRate = accepted / seen;
    // Penalise repeated ignores/dismisses on the same actionType.
    let m = 1.0 + 0.3 * (acceptanceRate - 0.5);
    if (ignored >= 3 && acceptanceRate < 0.3) m *= 0.7;
    if (dismissed >= 2) m *= 0.85;
    rankingMultiplierByActionType[key] = clamp(m, 0.55, 1.5);
  }

  const panic = state.inferred.panicScore;
  const lev = state.inferred.leverageShift;
  const liq = state.inferred.liquidityShift;
  const risk = state.inferred.riskShift;

  const urgencyMultiplier = clamp(1 + 0.4 * panic, 0.7, 1.6);
  const riskScoreTilt = clamp(-0.3 * risk + 0.2 * panic, -0.4, 0.4);

  const pillarWeights: AdaptiveAdjustments['pillarWeights'] = {
    protect_liquidity: 1 + 0.25 * Math.max(0, liq) + 0.15 * panic,
    stabilise_leverage: 1 - 0.2 * Math.min(0, -lev),
    maintain_investing_discipline: 1 + 0.15 * Math.max(0, risk),
  };

  const monteCarloPriorityMultiplier = clamp(1 + 0.5 * panic, 0.8, 1.7);

  const parts: string[] = [];
  if (panic > 0.3) parts.push('User has shown sell-into-drawdown behaviour — risk explanations emphasise downside protection.');
  if (lev < -0.3) parts.push('User trending deleverage — property/leverage suggestions de-prioritised.');
  if (liq > 0.3) parts.push('User prefers more liquidity — cash/offset suggestions weighted up.');
  if (risk > 0.4) parts.push('User trending more aggressive — wealth-pillar items boosted modestly.');
  if (parts.length === 0) parts.push('Adaptive layer is in baseline mode — no significant behavioural signal observed yet.');

  return {
    rankingMultiplierByActionType,
    urgencyMultiplier,
    riskScoreTilt,
    pillarWeights,
    monteCarloPriorityMultiplier,
    explanation: parts.join(' '),
  };
}

export function applyAdaptiveLearning(
  state: AdaptiveState,
  events: AdaptiveEvent[],
): AdaptiveLearningResult {
  const next = recordEvents(state, events);
  return { state: next, adjustments: deriveAdjustments(next) };
}
