/**
 * recommendedActionsAdapter.ts
 *
 * Sprint 2C — Decision UX. Pure presentation-only adapter. Maps the
 * pre-existing engine outputs (Forecast, Risk, Goal Solver, Monte Carlo,
 * Recommendation engine) into a uniform "Recommended Action" shape consumed
 * by the Sprint 2C Recommended Actions panel.
 *
 * This module DOES NOT introduce a new engine. It DOES NOT run any
 * forecasting / Monte Carlo / risk math itself. It only re-labels and
 * re-shapes data the engines already produced.
 */

import type { Recommendation, UnifiedRecommendationResult } from './recommendationEngine/types';

export type ActionTone = 'proceed' | 'delay' | 'optimise' | 'monitor';
export type ActionRiskLevel = 'Low' | 'Medium' | 'High';

export interface RecommendedAction {
  id: string;
  /** Short, scannable title — "Buy IP #1 in Jul 2026" / "Delay IP #2 until 2028". */
  title: string;
  /** Tone classification for visual treatment. */
  tone: ActionTone;
  /** Plain English impact line — "Expected impact: +$1.1M net worth by 2035". */
  impactLabel: string;
  /** Optional secondary $ number used by the UI. */
  impactValue?: number;
  /** Plain English reasoning — sourced from the engine's reason text. */
  reason: string;
  /** Risk level — High/Medium/Low. */
  risk: ActionRiskLevel;
  /** 0-100 % confidence drawn from engine confidenceScore. */
  confidencePct: number;
  /** Optional execution window — "Jul 2026 / 2028". */
  whenLabel?: string;
  /** Which engines fed this action — used for transparency badges. */
  sourceEngines: string[];
}

export interface PlannedAcquisition {
  /** Friendly label, e.g. "IP #1" or "Brisbane IP". */
  name: string;
  /** Target ISO date (`yyyy-mm-dd`) — typically settlement_date. */
  targetDate?: string;
  /** Expected $ impact on net worth at the chosen horizon. */
  netWorthDeltaAtHorizon?: number;
  /** Pre/post liquidity stress probabilities (0-1). */
  liquidityStressBefore?: number;
  liquidityStressAfter?: number;
  /** Confidence band (0-1). */
  confidence?: number;
  /** Suggested delay until ISO date — if present, generates a Delay action. */
  delayUntil?: string;
}

export interface BuildRecommendedActionsInputs {
  /** Unified recommendation engine result (existing engine output). */
  unified?: UnifiedRecommendationResult | null;
  /** Planned acquisitions (from forecast / acquisition planner). */
  plannedAcquisitions?: PlannedAcquisition[];
  /** Horizon year used in "Net Worth by …" impact labels. */
  horizonYear?: number;
  /** Pin "today" for deterministic tests. */
  todayIso?: string;
}

/* ─── Formatters ────────────────────────────────────────────────────── */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [y, m] = iso.split('-');
  const mn = Number(m);
  if (!y || !mn || mn < 1 || mn > 12) return undefined;
  return `${MONTHS[mn - 1]} ${y}`;
}

function formatYearOnly(iso?: string): string | undefined {
  if (!iso) return undefined;
  const y = iso.split('-')[0];
  return y && /^\d{4}$/.test(y) ? y : undefined;
}

function formatNetWorthDelta(delta: number | undefined, horizonYear?: number): string {
  if (delta === undefined || !isFinite(delta)) return '—';
  const sign = delta >= 0 ? '+' : '−';
  const abs = Math.abs(delta);
  const mag = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M` : `$${Math.round(abs / 1000)}k`;
  return horizonYear
    ? `Expected impact: ${sign}${mag} Net Worth by ${horizonYear}`
    : `Expected impact: ${sign}${mag} Net Worth`;
}

function formatStressDelta(before?: number, after?: number): string | undefined {
  if (before === undefined || after === undefined) return undefined;
  return `Liquidity stress ${(before * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}%`;
}

function clampConfidence(c?: number): number {
  if (c === undefined || !isFinite(c)) return 50;
  // Heuristic: 0..1 = fraction, >1 = percent already. We then clamp to 0..100.
  // We treat values >1 as a percent — even 2.5 → 100 (clamped) — because the
  // upstream engines never emit percent above 100; values >100 are coding
  // bugs, not "very confident".
  const pct = c <= 1 ? c * 100 : c;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function tonePillFor(tone: ActionTone): { label: string; emoji: string } {
  switch (tone) {
    case 'proceed':  return { label: 'Proceed',   emoji: '✅' };
    case 'delay':    return { label: 'Delay',     emoji: '⏳' };
    case 'optimise': return { label: 'Optimise',  emoji: '⚙️' };
    case 'monitor':  return { label: 'Monitor',   emoji: '👀' };
  }
}

function recommendationRiskToActionRisk(r: Recommendation): ActionRiskLevel {
  if (r.riskLevel === 'High') return 'High';
  if (r.riskLevel === 'Med')  return 'Medium';
  return 'Low';
}

/* ─── Builders ──────────────────────────────────────────────────────── */

/**
 * Pure: synthesize Sprint 2C Recommended Actions from existing engine output.
 * Returns a deterministic, ordered list (proceed → delay → optimise → monitor).
 */
export function buildRecommendedActions(
  inputs: BuildRecommendedActionsInputs,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const horizonYear = inputs.horizonYear ?? new Date().getFullYear() + 10;

  /* 1) Acquisition actions (Buy / Delay) — from planner outputs only. */
  for (const acq of inputs.plannedAcquisitions ?? []) {
    if (acq.delayUntil) {
      // Delay action — produced when the planner has suggested a deferral.
      const when = formatYearOnly(acq.delayUntil) ?? acq.delayUntil;
      const stressLine = formatStressDelta(acq.liquidityStressBefore, acq.liquidityStressAfter);
      const reasonBits: string[] = [];
      if (stressLine) reasonBits.push(stressLine);
      reasonBits.push('Delaying acquisition reduces near-term liquidity stress.');
      actions.push({
        id: `delay:${acq.name}`,
        title: `Delay ${acq.name} until ${when}`,
        tone: 'delay',
        impactLabel: formatNetWorthDelta(acq.netWorthDeltaAtHorizon, horizonYear),
        impactValue: acq.netWorthDeltaAtHorizon,
        reason: reasonBits.join(' '),
        risk: acq.liquidityStressAfter !== undefined && acq.liquidityStressAfter > 0.3 ? 'High'
            : acq.liquidityStressAfter !== undefined && acq.liquidityStressAfter > 0.15 ? 'Medium'
            : 'Low',
        confidencePct: clampConfidence(acq.confidence),
        whenLabel: when,
        sourceEngines: ['Forecast', 'Risk', 'Goal Solver'],
      });
    } else {
      // Proceed action — typical buy recommendation.
      const when = formatWhen(acq.targetDate);
      actions.push({
        id: `buy:${acq.name}`,
        title: when ? `Buy ${acq.name} in ${when}` : `Buy ${acq.name}`,
        tone: 'proceed',
        impactLabel: formatNetWorthDelta(acq.netWorthDeltaAtHorizon, horizonYear),
        impactValue: acq.netWorthDeltaAtHorizon,
        reason: 'Goal Solver and Monte Carlo project this acquisition improves net worth at the chosen horizon while staying within the liquidity guardrails.',
        risk: acq.liquidityStressAfter !== undefined && acq.liquidityStressAfter > 0.3 ? 'High'
            : acq.liquidityStressAfter !== undefined && acq.liquidityStressAfter > 0.15 ? 'Medium'
            : 'Low',
        confidencePct: clampConfidence(acq.confidence),
        whenLabel: when,
        sourceEngines: ['Forecast', 'Monte Carlo', 'Goal Solver'],
      });
    }
  }

  /* 2) Recommendation engine outputs (top priorities) — only those NOT
        already mapped from acquisitions above. The recommendation engine
        already ranks safety > liquidity > debt > investing → we preserve
        that ordering. */
  const unified = inputs.unified;
  if (unified) {
    const seen = new Set(actions.map(a => a.id));
    for (const r of unified.topPriorities) {
      const id = `rec:${r.id}`;
      if (seen.has(id)) continue;
      const tone: ActionTone =
        r.actionType === 'delay_property_purchase' ? 'delay'
        : r.actionType === 'proceed_property_purchase' ? 'proceed'
        : r.actionType === 'tax_optimisation' || r.actionType === 'rebalance_portfolio' || r.actionType === 'refinance_restructure' ? 'optimise'
        : 'monitor';
      const impact = r.netWorthImpact?.delta ?? r.expectedFinancialImpact.annualDollar;
      const impactYear = r.netWorthImpact?.horizonYears
        ? new Date().getFullYear() + r.netWorthImpact.horizonYears
        : horizonYear;
      actions.push({
        id,
        title: r.title,
        tone,
        impactLabel: r.netWorthImpact
          ? formatNetWorthDelta(r.netWorthImpact.delta, impactYear)
          : (r.expectedFinancialImpact.label ?? formatNetWorthDelta(impact, horizonYear)),
        impactValue: impact,
        reason: r.reasoning,
        risk: recommendationRiskToActionRisk(r),
        confidencePct: clampConfidence(r.confidenceScore),
        sourceEngines: r.sourceSignalsUsed.map(humanSignal),
      });
    }
  }

  // Deterministic ordering: proceed → delay → optimise → monitor.
  const order: Record<ActionTone, number> = { proceed: 0, delay: 1, optimise: 2, monitor: 3 };
  return actions.sort((a, b) => {
    if (order[a.tone] !== order[b.tone]) return order[a.tone] - order[b.tone];
    return b.confidencePct - a.confidencePct;
  });
}

function humanSignal(s: string): string {
  switch (s) {
    case 'monte_carlo_v4': return 'Monte Carlo V4';
    case 'monte_carlo_v5': return 'Monte Carlo V5';
    case 'decision_engine': return 'Decision Engine';
    case 'fire_engine':     return 'FIRE Engine';
    case 'risk_engine':     return 'Risk Engine';
    case 'household_tax':   return 'Tax Engine';
    case 'investor_preference': return 'Investor Preference';
    case 'behavioural_profile': return 'Behavioural Profile';
    case 'property_readiness':  return 'Property Readiness';
    case 'autonomous_os':       return 'Autonomous OS';
    case 'scenario_tree':       return 'Scenario Tree';
    case 'debt_balances':       return 'Debt Engine';
    case 'cash_offset':         return 'Cash Engine';
    case 'snapshot':            return 'Snapshot';
    case 'ledger_income_expense': return 'Ledger';
    default: return s;
  }
}

/* ─── Display helpers (used by tests + UI) ──────────────────────────── */

export function visualClassForTone(tone: ActionTone): string {
  switch (tone) {
    case 'proceed':  return 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300';
    case 'delay':    return 'border-amber-500/40 bg-amber-500/5 text-amber-300';
    case 'optimise': return 'border-sky-500/40 bg-sky-500/5 text-sky-300';
    case 'monitor':  return 'border-slate-500/40 bg-slate-500/5 text-slate-300';
  }
}

export function tonePillLabel(tone: ActionTone): string {
  return tonePillFor(tone).label;
}

export function tonePillEmoji(tone: ActionTone): string {
  return tonePillFor(tone).emoji;
}
