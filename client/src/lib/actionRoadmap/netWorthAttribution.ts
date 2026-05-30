/**
 * actionRoadmap/netWorthAttribution.ts — Sprint 28B.
 *
 * Breaks the engine's terminal `medianFinalState` into asset-class
 * components for the Net Worth Attribution panel (Action Roadmap §S4).
 *
 * THIS MODULE PERFORMS NO FINANCIAL MATH. It reads already-projected
 * balances out of `PortfolioState` and groups them by category. The
 * reconciliation check compares the sum to the Monte Carlo `p50` at the
 * same horizon and surfaces drift — it does not adjust any value.
 *
 * Honesty rules:
 *   - Returns null when `finalState` is null (no engine result to break down).
 *   - PPOR identification: properties with `id === "ppor"` are treated as
 *     PPOR (matches `basePlan.ts` convention). Everything else is IP. When
 *     the engine does not tag a PPOR explicitly we still surface what's there.
 *   - Crypto / cars / Iran-property / other are merged into a single "Other"
 *     row by default so the table stays readable; crypto gets its own row
 *     only when > 0 (per architecture).
 *   - Reconciliation `withinTolerance` is true when |sum - p50| / |p50| ≤ 1%.
 *     When `fanP50AtHorizon` is null we still return `withinTolerance: true`
 *     (nothing to reconcile against) but `p50FromFan` stays null.
 */
import type { PortfolioState } from "../scenarioV2/types";

export type NetWorthCategory =
  | "ppor"
  | "investment_property"
  | "etf"
  | "super"
  | "cash"
  | "crypto"
  | "other";

export interface NetWorthComponent {
  category: NetWorthCategory;
  label: string;
  value: number;
  share: number; // 0..1
}

export interface NetWorthAttribution {
  components: NetWorthComponent[];
  total: number;
  reconciliation: {
    p50FromFan: number | null;
    p50FromSum: number;
    diffAbsolute: number;
    diffPct: number; // 0..1
    withinTolerance: boolean; // diffPct ≤ 0.01
  };
  source: "scenarioV2.medianFinalState";
}

export interface NetWorthAttributionInput {
  finalState: PortfolioState | null;
  fanP50AtHorizon: number | null;
}

const PPOR_ID = "ppor";

function propertyEquity(p: { marketValue: number; loanBalance: number; offsetBalance?: number }): number {
  // Sprint 30A.3: equity = market value - loan, matching the engine's
  // netWorth() in scenarioV2/tick.ts:842 (propsNet excludes offsetBalance).
  // Including offset previously drifted the attribution sum ~1% above the MC
  // P50 fan headline; aligning to the engine eliminates that drift.
  const value = Number.isFinite(p.marketValue) ? p.marketValue : 0;
  const loan = Number.isFinite(p.loanBalance) ? p.loanBalance : 0;
  return value - loan;
}

function numOr(v: number | undefined | null, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function selectNetWorthAttribution(input: NetWorthAttributionInput): NetWorthAttribution | null {
  const { finalState, fanP50AtHorizon } = input;
  if (!finalState) return null;

  const pporEquity = (finalState.properties ?? [])
    .filter((p) => p.id === PPOR_ID)
    .reduce((s, p) => s + propertyEquity(p), 0);
  const ipEquity = (finalState.properties ?? [])
    .filter((p) => p.id !== PPOR_ID)
    .reduce((s, p) => s + propertyEquity(p), 0);

  const etf = numOr(finalState.etfBalance);
  const superTotal = numOr(finalState.superRoham) + numOr(finalState.superFara);
  const cash = numOr(finalState.cash);
  const crypto = numOr(finalState.cryptoBalance);

  // "Other" bucket — cars / Iran property / other assets net of other debts.
  // Crypto stays out of this bucket because architecture wants its own row
  // when > 0; merging when zero keeps the table tidy.
  const otherAssetsNet =
    numOr(finalState.cars) +
    numOr(finalState.iranProperty) +
    numOr(finalState.otherAssets) -
    numOr(finalState.otherDebts);

  const rawComponents: NetWorthComponent[] = [];
  if (pporEquity !== 0) rawComponents.push({ category: "ppor", label: "PPOR equity", value: pporEquity, share: 0 });
  if (ipEquity !== 0)   rawComponents.push({ category: "investment_property", label: "Investment property equity", value: ipEquity, share: 0 });
  if (etf !== 0)        rawComponents.push({ category: "etf", label: "ETF", value: etf, share: 0 });
  if (superTotal !== 0) rawComponents.push({ category: "super", label: "Super", value: superTotal, share: 0 });
  if (cash !== 0)       rawComponents.push({ category: "cash", label: "Cash", value: cash, share: 0 });
  if (crypto > 0)       rawComponents.push({ category: "crypto", label: "Crypto", value: crypto, share: 0 });
  if (otherAssetsNet !== 0) rawComponents.push({ category: "other", label: "Other (cars, overseas, net of debts)", value: otherAssetsNet, share: 0 });

  const total = rawComponents.reduce((s, c) => s + c.value, 0);
  const denom = Math.abs(total) > 0 ? total : 1;
  const components = rawComponents.map((c) => ({ ...c, share: c.value / denom }));

  const p50 = fanP50AtHorizon != null && Number.isFinite(fanP50AtHorizon) ? fanP50AtHorizon : null;
  const diffAbsolute = p50 != null ? total - p50 : 0;
  const diffPct = p50 != null && Math.abs(p50) > 0 ? Math.abs(diffAbsolute) / Math.abs(p50) : 0;
  const withinTolerance = p50 != null ? diffPct <= 0.01 : true;

  return {
    components,
    total,
    reconciliation: {
      p50FromFan: p50,
      p50FromSum: total,
      diffAbsolute,
      diffPct,
      withinTolerance,
    },
    source: "scenarioV2.medianFinalState",
  };
}
