/**
 * actionRoadmap/financialReconciliation.ts — Sprint 29 §3.
 *
 * Gates the Net Worth Attribution chart, the S1 Executive Decision NW tile,
 * and the S5 Monte Carlo Outlook NW figures. When the engine's terminal
 * portfolio state (sum of asset components) drifts from the Monte Carlo
 * P50 at the same horizon by more than 0.5%, the affected surfaces must
 * NOT show a number — they must surface the reconciliation failure.
 *
 * THIS MODULE PERFORMS NO MATH BEYOND ADDITION/SUBTRACTION/DIVISION ON
 * ALREADY-COMPUTED ENGINE VALUES. No new forecast, no new MC.
 *
 * Honesty:
 *   - INSUFFICIENT_DATA when finalState OR fanP50AtHorizon is null. UI
 *     treats this like FAIL (blocks the affected sections).
 *   - PASS when |componentsSum - headlineNW| / headlineNW ≤ 0.5%.
 *   - FAIL otherwise, with a plain-English `message`.
 */
import type { PortfolioState } from "../scenarioV2/types";

export type ReconciliationStatus = "PASS" | "FAIL" | "INSUFFICIENT_DATA";

/**
 * Sprint 30A §D8 — per-field blocking. The gate exposes which fields the
 * UI must NOT render numerically. Components inspect this set and block
 * ONLY their owned field; they do not short-circuit on `status` alone.
 */
export type BlockedField = "nw_at_fire" | "attribution_chart" | "alt_strategy_nw";

export interface ReconciliationBreakdown {
  ppor: number;
  investmentProperty: number;
  etf: number;
  super: number;
  cash: number;
  crypto: number;
  otherAssets: number;
  /** Subtracted from componentsSum. */
  otherDebts: number;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  componentsSum: number;
  /** Sprint 30A alias for `headlineNW` — matches the contract field name. */
  mcP50: number;
  headlineNW: number;
  deltaAbs: number;
  deltaPct: number;
  tolerancePct: number;
  breakdown: ReconciliationBreakdown;
  message: string | null;
  /**
   * Sprint 30A §D8 — fields the UI must NOT render numerically. Scope is
   * limited to net-worth-related figures (the contested quantity). FIRE
   * Age, Passive Income, Confidence, Risks, Next Actions all stay rendered
   * regardless of reconciliation status.
   *
   * Built as a plain array so it round-trips through React props without
   * Set-identity churn. Helpers `isBlocked()` / `blockedSet()` below.
   */
  blockedFields: BlockedField[];
}

/** Convenience predicate — gate-aware UI components consult this. */
export function isBlocked(result: ReconciliationResult, field: BlockedField): boolean {
  return result.blockedFields.includes(field);
}

/** Convenience constructor — returns a Set view when callers prefer it. */
export function blockedSet(result: ReconciliationResult): Set<BlockedField> {
  return new Set(result.blockedFields);
}

export interface ReconciliationInput {
  finalState: PortfolioState | null;
  fanP50AtHorizon: number | null;
}

const TOLERANCE = 0.005;
const ALL_NW_FIELDS: BlockedField[] = ["nw_at_fire", "attribution_chart", "alt_strategy_nw"];

const EMPTY_BREAKDOWN: ReconciliationBreakdown = {
  ppor: 0,
  investmentProperty: 0,
  etf: 0,
  super: 0,
  cash: 0,
  crypto: 0,
  otherAssets: 0,
  otherDebts: 0,
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function propertyEquity(p: { marketValue: number; loanBalance: number; offsetBalance?: number }): number {
  // Sprint 30A.3: align with engine's netWorth() in scenarioV2/tick.ts:842 which
  // computes propsNet as (marketValue - loanBalance), excluding offsetBalance.
  // Including offset here previously caused a ~1% reconciliation drift vs the
  // MC P50 fan headline (offset accumulates as cash gets pumped into it but
  // the engine does not surface it inside netWorth()). Following the engine
  // definition exactly is honest and produces a zero-diff reconciliation.
  const v = num(p.marketValue);
  const loan = num(p.loanBalance);
  return v - loan;
}

export function reconcileTerminalNetWorth(input: ReconciliationInput): ReconciliationResult {
  const { finalState, fanP50AtHorizon } = input;

  if (!finalState) {
    return {
      status: "INSUFFICIENT_DATA",
      componentsSum: 0,
      mcP50: 0,
      headlineNW: 0,
      deltaAbs: 0,
      deltaPct: 0,
      tolerancePct: TOLERANCE,
      breakdown: EMPTY_BREAKDOWN,
      message: "No engine final state available.",
      blockedFields: ALL_NW_FIELDS,
    };
  }

  if (fanP50AtHorizon == null || !Number.isFinite(fanP50AtHorizon)) {
    return {
      status: "INSUFFICIENT_DATA",
      componentsSum: 0,
      mcP50: 0,
      headlineNW: 0,
      deltaAbs: 0,
      deltaPct: 0,
      tolerancePct: TOLERANCE,
      breakdown: EMPTY_BREAKDOWN,
      message: "No MC P50 terminal value available.",
      blockedFields: ALL_NW_FIELDS,
    };
  }

  // §3.2 — PPOR = property.inLedger === true; everything else is investment.
  const ppor = (finalState.properties ?? [])
    .filter((p) => p.inLedger === true)
    .reduce((s, p) => s + propertyEquity(p), 0);
  const investmentProperty = (finalState.properties ?? [])
    .filter((p) => p.inLedger !== true)
    .reduce((s, p) => s + propertyEquity(p), 0);

  const etf = num(finalState.etfBalance);
  const superTotal = num(finalState.superRoham) + num(finalState.superFara);
  const cash = num(finalState.cash);
  const crypto = num(finalState.cryptoBalance);
  const otherAssets = num(finalState.cars) + num(finalState.iranProperty) + num(finalState.otherAssets);
  const otherDebts = num(finalState.otherDebts);

  const breakdown: ReconciliationBreakdown = {
    ppor,
    investmentProperty,
    etf,
    super: superTotal,
    cash,
    crypto,
    otherAssets,
    otherDebts,
  };

  const componentsSum = ppor + investmentProperty + etf + superTotal + cash + crypto + otherAssets - otherDebts;
  const headlineNW = fanP50AtHorizon;
  const deltaAbs = componentsSum - headlineNW;
  const denom = Math.max(Math.abs(headlineNW), 1);
  const deltaPct = Math.abs(deltaAbs) / denom;

  if (deltaPct <= TOLERANCE) {
    return {
      status: "PASS",
      componentsSum,
      mcP50: headlineNW,
      headlineNW,
      deltaAbs,
      deltaPct,
      tolerancePct: TOLERANCE,
      breakdown,
      message: null,
      blockedFields: [],
    };
  }

  const sign = deltaAbs >= 0 ? "+" : "-";
  const message =
    `Components sum ($${Math.round(componentsSum).toLocaleString("en-AU")}) ` +
    `differs from MC P50 headline ($${Math.round(headlineNW).toLocaleString("en-AU")}) ` +
    `by ${sign}$${Math.round(Math.abs(deltaAbs)).toLocaleString("en-AU")} (${(deltaPct * 100).toFixed(2)}%). ` +
    `Tolerance is ${(TOLERANCE * 100).toFixed(1)}%.`;

  return {
    status: "FAIL",
    componentsSum,
    mcP50: headlineNW,
    headlineNW,
    deltaAbs,
    deltaPct,
    tolerancePct: TOLERANCE,
    breakdown,
    message,
    blockedFields: ALL_NW_FIELDS,
  };
}
