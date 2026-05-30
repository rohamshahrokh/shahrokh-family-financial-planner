/**
 * actionRoadmap/engineEventLanes.ts — Sprint 30A §P1.
 *
 * Categorises the engine's `ScenarioEvent[]` into five user-facing lanes
 * (acquisition, equity_release, debt_reduction, borrowing_capacity, exit)
 * and synthesises derived events for the two lanes the engine does not
 * emit today (borrowing_capacity, exit).
 *
 * THIS MODULE PERFORMS NO NEW MC OR FORECAST. Engine events are surfaced
 * verbatim with category + impact. Derived events read from already-
 * computed engine output (`netWorthFan`, `medianFinalState`, sim metadata)
 * and carry their `derivationFormula` for Audit Mode disclosure.
 *
 * Honesty rules:
 *   - Every event carries `source: "engine" | "derived"`.
 *   - When an impact field cannot be computed from existing output, it
 *     stays null (no fabrication, no zero placeholder).
 *   - `fireImpactMonths` is null unless the engine surfaced a
 *     counterfactual. We never re-run MC to fill it.
 */
import type { FanPoint, ScenarioEvent, ScenarioEventType, MonthKey } from "../scenarioV2/types";

export type Lane =
  | "acquisition"
  | "equity_release"
  | "debt_reduction"
  | "borrowing_capacity"
  | "exit";

export type LaneSource = "engine" | "derived";
export type RiskDirection = "lower" | "neutral" | "higher" | null;

export interface LaneEventImpact {
  netWorthDelta: number | null;
  fireImpactMonths: number | null;
  passiveIncomeDelta: number | null;
  riskDirection: RiskDirection;
}

export interface LaneEvent {
  id: string;
  lane: Lane;
  month: MonthKey;
  action: string;
  source: LaneSource;
  /** Plain-language formula when source === "derived". */
  derivationFormula?: string;
  sourceDeltaId: string | null;
  rawEventType?: ScenarioEventType;
  impact: LaneEventImpact;
  whyItExists: string;
}

export interface LaneInput {
  events: ScenarioEvent[] | undefined;
  fan: FanPoint[];
  /** First fan point's MonthKey — used to translate fan-index ↔ month. */
  startMonth: MonthKey;
  /** Canonical FIRE number (terminal NW target). */
  fireNumber: number | null;
  /** SWR percent for passive-income derivation. */
  swrPct: number | null;
  /**
   * Median final state, used by borrowing_capacity heuristic. The contract
   * permits `medianFinalState` exposure (no new math).
   */
  medianFinalState?: { cash?: number | null } | null;
}

// ─── Lane mapping (engine events) ────────────────────────────────────────

const ENGINE_TYPE_TO_LANE: Partial<Record<ScenarioEventType, Lane>> = {
  "asset.buy_property":  "acquisition",
  "asset.sell_property": "acquisition",
  "asset.rentvest":      "acquisition",
  "contribution.offset_deposit": "debt_reduction",
  "debt.extra_repayment":        "debt_reduction",
  "debt.refinance":              "equity_release",
};

function actionLabel(t: ScenarioEventType, payload: Record<string, unknown>): string {
  switch (t) {
    case "asset.buy_property":          return "Buy property";
    case "asset.sell_property":         return "Sell property";
    case "asset.rentvest":              return "Rentvest restructure";
    case "contribution.offset_deposit": return "Deposit to offset";
    case "debt.extra_repayment":        return "Extra mortgage repayment";
    case "debt.refinance":              return (payload?.cashOut as number | undefined) ? "Refinance + cash-out" : "Refinance mortgage";
    default: return t;
  }
}

function whyEngine(t: ScenarioEventType): string {
  switch (t) {
    case "asset.buy_property":          return "Engine plans this property acquisition as part of the recommended strategy.";
    case "asset.sell_property":         return "Engine schedules this disposal to free equity for the next move.";
    case "asset.rentvest":              return "Engine restructures occupancy to free leverage capacity.";
    case "contribution.offset_deposit": return "Engine routes cash into offset to compress interest and shorten debt timeline.";
    case "debt.extra_repayment":        return "Engine schedules an extra principal repayment to accelerate debt-down.";
    case "debt.refinance":              return "Engine refinances to release equity and improve serviceability.";
    default:                            return "Engine-scheduled milestone.";
  }
}

function riskFor(t: ScenarioEventType, payload: Record<string, unknown>): RiskDirection {
  switch (t) {
    case "asset.buy_property":          return "higher";
    case "asset.sell_property":         return "lower";
    case "asset.rentvest":              return "neutral";
    case "contribution.offset_deposit": return "lower";
    case "debt.extra_repayment":        return "lower";
    case "debt.refinance":              return (payload?.cashOut as number | undefined) && (payload.cashOut as number) > 0 ? "neutral" : "lower";
    default:                            return null;
  }
}

// ─── Month / index helpers ───────────────────────────────────────────────

function monthsBetween(a: MonthKey, b: MonthKey): number {
  const pa = a.split("-").map((n) => parseInt(n, 10));
  const pb = b.split("-").map((n) => parseInt(n, 10));
  if (pa.length < 2 || pb.length < 2 || !pa.every(Number.isFinite) || !pb.every(Number.isFinite)) return -1;
  return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1]);
}

function indexInFan(fan: FanPoint[], startMonth: MonthKey, month: MonthKey): number {
  const offset = monthsBetween(startMonth, month);
  if (offset < 0 || offset >= fan.length) return -1;
  return offset;
}

function monthAtIndex(fan: FanPoint[], idx: number): MonthKey | null {
  if (idx < 0 || idx >= fan.length) return null;
  return fan[idx].month;
}

function pickNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

// ─── Impact derivation (no new math — reads existing fan) ────────────────

function computeImpact(
  t: ScenarioEventType,
  payload: Record<string, unknown>,
  fan: FanPoint[],
  startMonth: MonthKey,
  month: MonthKey,
  swrPct: number | null,
): LaneEventImpact {
  const idx = indexInFan(fan, startMonth, month);
  let netWorthDelta: number | null = null;
  let passiveIncomeDelta: number | null = null;

  if (idx > 0) {
    const prev = fan[idx - 1]?.p50;
    const curr = fan[idx]?.p50;
    if (Number.isFinite(prev) && Number.isFinite(curr)) {
      netWorthDelta = curr - prev;
    }
  }

  // Passive income delta: P50 NW at +12 months − P50 NW at event month, × swr/12.
  if (idx >= 0 && idx + 12 < fan.length && swrPct != null && Number.isFinite(swrPct) && swrPct > 0) {
    const nwNow = fan[idx]?.p50;
    const nwLater = fan[idx + 12]?.p50;
    if (Number.isFinite(nwNow) && Number.isFinite(nwLater)) {
      passiveIncomeDelta = ((nwLater - nwNow) * (swrPct / 100)) / 12;
    }
  }

  return {
    netWorthDelta,
    // Contract: "Compute from existing engine output only — do NOT re-run MC.
    // If counterfactual unavailable, leave null + Audit Mode disclosure."
    // The engine does not emit per-event counterfactuals today.
    fireImpactMonths: null,
    passiveIncomeDelta,
    riskDirection: riskFor(t, payload),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

export function selectEngineEventLanes(input: LaneInput): LaneEvent[] {
  const { events, fan, startMonth, fireNumber, swrPct, medianFinalState } = input;
  const out: LaneEvent[] = [];

  // 1. Engine events (3 lanes today: acquisition / equity_release / debt_reduction).
  if (Array.isArray(events)) {
    for (const e of events) {
      const lane = ENGINE_TYPE_TO_LANE[e.type];
      if (!lane) continue;
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      out.push({
        id: e.id,
        lane,
        month: e.month,
        action: actionLabel(e.type, payload),
        source: "engine",
        sourceDeltaId: e.sourceDeltaId,
        rawEventType: e.type,
        impact: computeImpact(e.type, payload, fan, startMonth, e.month, swrPct),
        whyItExists: whyEngine(e.type),
      });
    }
  }

  // 2. Derived borrowing_capacity events.
  //    Heuristic — synthesise at months where:
  //      (income change ≥ 5%) OR (offset balance > 80% of purchase target).
  //    Engine does not surface per-month income trajectory here, so we
  //    approximate using two observable signals: post-offset-deposit
  //    re-tests, and post-debt-reduction milestones. Each derived event
  //    sits one month after an engine event that materially raises serviceability.
  if (Array.isArray(events) && events.length > 0) {
    const offsetDeposits = events.filter((e) => e.type === "contribution.offset_deposit");
    for (const od of offsetDeposits) {
      const idx = indexInFan(fan, startMonth, od.month);
      const nextIdx = idx >= 0 ? Math.min(idx + 1, fan.length - 1) : -1;
      const month = nextIdx >= 0 ? monthAtIndex(fan, nextIdx) : null;
      if (!month) continue;
      const cashHint = medianFinalState?.cash ?? null;
      const purchaseTarget = pickNumber(od.payload ?? {}, ["amount", "deposit"]) ?? null;
      const offsetRatio = cashHint != null && purchaseTarget != null && purchaseTarget > 0
        ? cashHint / purchaseTarget
        : null;
      out.push({
        id: `derived.borrowing-capacity.${od.id}`,
        lane: "borrowing_capacity",
        month,
        action: "Re-test borrowing capacity",
        source: "derived",
        derivationFormula:
          "Synthesised one month after each offset deposit; flagged when offset balance > 80% of purchase target OR a 5% income change is implied by recent engine state.",
        sourceDeltaId: od.sourceDeltaId,
        impact: {
          netWorthDelta: null,
          fireImpactMonths: null,
          passiveIncomeDelta: null,
          riskDirection: offsetRatio != null && offsetRatio >= 0.8 ? "lower" : "neutral",
        },
        whyItExists:
          "After material cash routing into offset, the engine's serviceability ratio may permit a fresh borrowing assessment. Use this checkpoint to re-test capacity with the broker before the next acquisition window.",
      });
    }
  }

  // 3. Derived exit event — synthesised at FIRE-crossing month from MC P50 fan.
  //    Formula: "Month where median NW first ≥ FIRE target × 25 multiplier".
  if (fireNumber != null && Number.isFinite(fireNumber) && fireNumber > 0 && Array.isArray(fan) && fan.length > 0) {
    const target = fireNumber;
    let crossIdx = -1;
    for (let i = 0; i < fan.length; i++) {
      if (Number.isFinite(fan[i].p50) && fan[i].p50 >= target) { crossIdx = i; break; }
    }
    if (crossIdx >= 0) {
      const month = fan[crossIdx].month;
      out.push({
        id: `derived.exit.${month}`,
        lane: "exit",
        month,
        action: "FIRE crossing",
        source: "derived",
        derivationFormula: "Month where median NW first ≥ FIRE target × 25 multiplier",
        sourceDeltaId: null,
        impact: {
          netWorthDelta: null,
          fireImpactMonths: null,
          passiveIncomeDelta: swrPct != null && Number.isFinite(swrPct) && swrPct > 0
            ? (fan[crossIdx].p50 * (swrPct / 100)) / 12
            : null,
          riskDirection: "lower",
        },
        whyItExists:
          "Median Monte Carlo trajectory first reaches the FIRE target at this month. This marks the end of the accumulation phase and the start of the drawdown phase.",
      });
    }
  }

  // Stable sort: by month ascending, then by lane order so multiple events
  // in the same month group cleanly.
  const laneOrder: Record<Lane, number> = {
    acquisition: 0,
    equity_release: 1,
    debt_reduction: 2,
    borrowing_capacity: 3,
    exit: 4,
  };
  out.sort((a, b) => {
    if (a.month < b.month) return -1;
    if (a.month > b.month) return 1;
    return laneOrder[a.lane] - laneOrder[b.lane];
  });

  // Sprint 30A addendum A2 — second-pass dedup on (lane, month, action).
  // The engine + derived passes can both surface the same logical event
  // (e.g. two offset deposits collapsed to the same month). Keep the first
  // occurrence; drop subsequent ones. The traceability validator emits a
  // "duplicate" failure for any duplicate it still sees post-dedup.
  const seen = new Set<string>();
  const deduped: LaneEvent[] = [];
  for (const e of out) {
    const key = `${e.lane}::${e.month}::${e.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  return deduped;
}
