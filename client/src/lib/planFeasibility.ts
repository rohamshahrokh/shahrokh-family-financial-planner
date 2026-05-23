/**
 * planFeasibility.ts — Plan Feasibility (Funding Feasibility) layer.
 *
 * Pure derivation helper. Reads already-computed values (snapshot cash buckets,
 * `applyFundingToProperties` decomposition, `CashFlowYear` aggregates) and
 * returns a Funding Gap summary. **No engine calculations live here** — this
 * file does not import `finance.ts`, `forecastEngine.ts`, `monteCarloEngine.ts`,
 * `firePathEngine.ts`, or any other canonical engine. It is a planning-
 * validation layer that surfaces a fundable / not-fundable status without
 * blocking any downstream action.
 *
 * Definitions (per the user requirement):
 *   Available Liquidity = Cash + Offset
 *                       + (Equity Release enabled) sum of property
 *                         _fundingPlan.equityReleased across IPs
 *                       + (Asset Sales enabled)  sum of property
 *                         _fundingPlan.stocksSold + .cryptoSold across IPs
 *
 *   Required Liquidity  = Property Deposits (cash-like)
 *                       + Stamp Duty
 *                       + Buying Costs (legal + inspection + setup + reno)
 *                       + Planned Stock Purchases (lump-sum sf_planned_investments)
 *                       + Planned Crypto Purchases (lump-sum sf_planned_investments)
 *                       + DCA Contributions (monthly equivalent × 12 × active months)
 *                       + Other Lump-Sum Investments
 *
 *   Funding Gap = Available Liquidity − Required Liquidity
 *
 * Status thresholds (user spec):
 *   gap >  $50,000  → "Fully Funded"  (green)
 *   gap ∈ [0, 50k]  → "Tight Liquidity" (amber)
 *   gap <  0        → "Funding Gap"   (red); additionalFundingRequired = |gap|
 */

export type PlanFeasibilityStatus = "fully-funded" | "tight-liquidity" | "funding-gap";

export type PlanFeasibilityTone = "healthy" | "caution" | "risk";

export interface PlanFeasibilitySource {
  /** Source label, e.g. "Cash", "Offset", "Equity Release", "Asset Sales". */
  label: string;
  /** Live value in $ (always >= 0 — sources are inflows). */
  value: number;
  /** True when the source is user-enabled (controls whether it counts). */
  enabled: boolean;
  /** Optional sub-detail for the audit trace (e.g. "from IP #3"). */
  note?: string;
}

export interface PlanFeasibilityUse {
  /** Use label, e.g. "Property Deposits", "Stamp Duty", "Planned Stock Purchases". */
  label: string;
  /** Live value in $ (always >= 0 — uses are outflows). */
  value: number;
  /** Optional sub-detail for the audit trace. */
  note?: string;
}

export interface PlanFeasibilityResult {
  availableLiquidity: number;
  requiredLiquidity: number;
  fundingGap: number;
  status: PlanFeasibilityStatus;
  tone: PlanFeasibilityTone;
  statusLabel: string;          // "Fully Funded" | "Tight Liquidity" | "Funding Gap"
  additionalFundingRequired: number; // = max(0, -fundingGap)
  /** Per-source breakdown for the audit trace + UI tooltip. */
  sources: PlanFeasibilitySource[];
  /** Per-use breakdown for the audit trace + UI tooltip. */
  uses: PlanFeasibilityUse[];
  /** Horizon window applied to "Required Liquidity" — display-only label. */
  horizonLabel: string;
  /** True when the gap is negative (warning banner trigger). */
  hasFundingGap: boolean;
}

export interface PlanFeasibilityInputs {
  /**
   * Already-resolved cash buckets from the snapshot. The dashboard already
   * computes `totalLiquidCash` from cash + savings + emergency + other +
   * offset; here we accept the split so the audit trace can report each one.
   */
  cash: number;
  offsetBalance: number;
  savingsCash?: number;
  emergencyCash?: number;
  otherCash?: number;

  /** Already-funded property records (post `applyFundingToProperties`). */
  fundedProperties: Array<{
    type?: string;
    deposit?: number;
    stamp_duty?: number;
    legal_fees?: number;
    renovation_costs?: number;
    building_inspection?: number;
    loan_setup_fees?: number;
    _fundingPlan?: {
      cashUsed?: number;
      offsetUsed?: number;
      equityReleased?: number;
      stocksSold?: number;
      cryptoSold?: number;
    };
    settlement_date?: string;
    purchase_date?: string;
  }>;

  /**
   * Already-rolled-up annual cashflow data — only the planned-investment / DCA
   * line items are read here. Each row contributes to `Required Liquidity`
   * over the planning horizon.
   */
  cashflowAnnual: Array<{
    year: number;
    plannedStockBuy?: number;
    plannedCryptoBuy?: number;
    stockDCAOutflow?: number;
    cryptoDCAOutflow?: number;
  }>;

  /**
   * Optional planning horizon. Defaults to "current year" so the surfaced
   * Funding Gap matches the user's perception of "what's about to happen".
   * Pass `'10y'` to roll up the entire forecast window.
   */
  horizon?: "current-year" | "10y";

  /**
   * Whether the user has enabled Equity Release / Asset Sales as a funding
   * source. Defaults to "treat as enabled if the funding plan put non-zero
   * dollars through that source", so the existing per-property funding
   * choice already reflected in `fundedProperties._fundingPlan` is honoured
   * without re-reading the funding store.
   */
  equityReleaseEnabled?: boolean;
  assetSalesEnabled?: boolean;
}

const STATUS_FULLY_FUNDED_MIN = 50_000;

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickYears<T extends { year: number }>(
  rows: T[],
  horizon: "current-year" | "10y",
  thisYear: number,
): T[] {
  if (!Array.isArray(rows)) return [];
  if (horizon === "current-year") {
    return rows.filter((r) => r.year === thisYear);
  }
  return rows;
}

/**
 * Compute the Plan Feasibility result for the current planning state.
 *
 * Returns deterministic, audit-friendly values:
 *   - sources: every line that counts towards Available Liquidity.
 *   - uses:    every line that counts towards Required Liquidity.
 *   - status / tone / additionalFundingRequired derived from the gap.
 *
 * The caller is responsible for sourcing the inputs (already done by the
 * dashboard hook). This function performs no I/O and imports no engines.
 */
export function computePlanFeasibility(inputs: PlanFeasibilityInputs): PlanFeasibilityResult {
  const horizon = inputs.horizon ?? "current-year";
  const thisYear = new Date().getFullYear();
  const horizonLabel = horizon === "current-year" ? `${thisYear} window` : "10-year horizon";

  // ── Available Liquidity ────────────────────────────────────────────────
  // Cash includes everyday cash + savings + emergency + other (matches the
  // dashboard's totalLiquidCash split). Offset is broken out so the audit
  // trace can show each bucket.
  const cashBucket =
    safeNum(inputs.cash)
    + safeNum(inputs.savingsCash)
    + safeNum(inputs.emergencyCash)
    + safeNum(inputs.otherCash);
  const offsetBucket = safeNum(inputs.offsetBalance);

  // Sum equity-release + asset-sales across funded properties within the
  // horizon (an acquisition that settles in a later year still counts
  // because the user committed to it — the feasibility check is forward-
  // looking, not just this calendar year).
  let equityReleasePlanned = 0;
  let assetSalesPlanned = 0;
  for (const p of inputs.fundedProperties ?? []) {
    if (p.type === "ppor") continue;
    const plan = p._fundingPlan;
    if (!plan) continue;
    equityReleasePlanned += safeNum(plan.equityReleased);
    assetSalesPlanned += safeNum(plan.stocksSold) + safeNum(plan.cryptoSold);
  }
  const equityReleaseEnabled =
    inputs.equityReleaseEnabled ?? equityReleasePlanned > 0;
  const assetSalesEnabled =
    inputs.assetSalesEnabled ?? assetSalesPlanned > 0;

  const sources: PlanFeasibilitySource[] = [
    { label: "Cash", value: cashBucket, enabled: true, note: "Everyday + savings + emergency + other cash buckets" },
    { label: "Offset", value: offsetBucket, enabled: true, note: "Offset balance against the PPOR mortgage" },
    {
      label: "Equity Release",
      value: equityReleasePlanned,
      enabled: equityReleaseEnabled,
      note: equityReleaseEnabled
        ? "Sum of `_fundingPlan.equityReleased` across IPs (user has opted in via the per-property funding selector)"
        : "Disabled — Equity Release is not selected for any IP. Not counted toward Available Liquidity.",
    },
    {
      label: "Asset Sales",
      value: assetSalesPlanned,
      enabled: assetSalesEnabled,
      note: assetSalesEnabled
        ? "Sum of `_fundingPlan.stocksSold + _fundingPlan.cryptoSold` across IPs"
        : "Disabled — no IP funding plan draws on stocks/crypto. Not counted toward Available Liquidity.",
    },
  ];
  const availableLiquidity = sources
    .filter((s) => s.enabled)
    .reduce((acc, s) => acc + s.value, 0);

  // ── Required Liquidity ────────────────────────────────────────────────
  // Property: deposit (cash-like; equity-release already moved into the
  // loan) + stamp duty + legal + inspection + setup + reno. Buying costs
  // are split into "Stamp Duty" and "Buying Costs (other)" so the audit
  // trace matches the user's screenshot.
  let propertyDepositsTotal = 0;
  let stampDutyTotal = 0;
  let buyingCostsOtherTotal = 0;
  for (const p of inputs.fundedProperties ?? []) {
    if (p.type === "ppor") continue;
    // Only count properties whose settlement falls inside the horizon. An
    // IP whose settlement_date is in a future year still counts when
    // horizon === "10y" (default for the audit trace's full picture); but
    // the "current-year" view restricts to settlements this year.
    const settleStr = p.settlement_date || p.purchase_date;
    let inHorizon = true;
    if (settleStr && horizon === "current-year") {
      const yr = new Date(settleStr).getFullYear();
      inHorizon = yr === thisYear;
    }
    if (!inHorizon) continue;
    propertyDepositsTotal += safeNum(p.deposit);
    stampDutyTotal += safeNum(p.stamp_duty);
    buyingCostsOtherTotal +=
      safeNum(p.legal_fees)
      + safeNum(p.renovation_costs)
      + safeNum(p.building_inspection)
      + safeNum(p.loan_setup_fees);
  }

  // Planned-investment lump-sums + DCA contributions over the horizon. The
  // dashboard already supplies the annual roll-ups so we just sum the rows
  // that fall in the horizon window.
  const annualInHorizon = pickYears(inputs.cashflowAnnual ?? [], horizon, thisYear);
  let plannedStockBuysTotal = 0;
  let plannedCryptoBuysTotal = 0;
  let stockDcaTotal = 0;
  let cryptoDcaTotal = 0;
  for (const a of annualInHorizon) {
    plannedStockBuysTotal += safeNum(a.plannedStockBuy);
    plannedCryptoBuysTotal += safeNum(a.plannedCryptoBuy);
    stockDcaTotal += safeNum(a.stockDCAOutflow);
    cryptoDcaTotal += safeNum(a.cryptoDCAOutflow);
  }

  const uses: PlanFeasibilityUse[] = [
    { label: "Property Deposits", value: propertyDepositsTotal,
      note: "Cash-like deposit portion (post-funding-adapter) for IPs settling in horizon" },
    { label: "Stamp Duty", value: stampDutyTotal,
      note: "Sum of `sf_properties.stamp_duty` for IPs settling in horizon" },
    { label: "Buying Costs (legal + inspection + setup + reno)", value: buyingCostsOtherTotal,
      note: "Sum of legal_fees + building_inspection + loan_setup_fees + renovation_costs" },
    { label: "Planned Stock Purchases", value: plannedStockBuysTotal,
      note: "`CashFlowYear.plannedStockBuy` summed over horizon (sf_planned_investments + sf_stock_transactions lump-sums)" },
    { label: "Planned Crypto Purchases", value: plannedCryptoBuysTotal,
      note: "`CashFlowYear.plannedCryptoBuy` summed over horizon (sf_planned_investments + sf_crypto_transactions lump-sums)" },
    { label: "DCA Contributions (Stock + Crypto)", value: stockDcaTotal + cryptoDcaTotal,
      note: `Stock DCA $${Math.round(stockDcaTotal).toLocaleString()} + Crypto DCA $${Math.round(cryptoDcaTotal).toLocaleString()} (active schedules within horizon)` },
  ];
  const requiredLiquidity = uses.reduce((acc, u) => acc + u.value, 0);

  // ── Gap + status ───────────────────────────────────────────────────────
  const fundingGap = availableLiquidity - requiredLiquidity;
  let status: PlanFeasibilityStatus;
  let tone: PlanFeasibilityTone;
  let statusLabel: string;
  if (fundingGap > STATUS_FULLY_FUNDED_MIN) {
    status = "fully-funded";
    tone = "healthy";
    statusLabel = "Fully Funded";
  } else if (fundingGap >= 0) {
    status = "tight-liquidity";
    tone = "caution";
    statusLabel = "Tight Liquidity";
  } else {
    status = "funding-gap";
    tone = "risk";
    statusLabel = "Funding Gap";
  }
  const additionalFundingRequired = Math.max(0, -fundingGap);

  return {
    availableLiquidity: Math.round(availableLiquidity),
    requiredLiquidity: Math.round(requiredLiquidity),
    fundingGap: Math.round(fundingGap),
    status,
    tone,
    statusLabel,
    additionalFundingRequired: Math.round(additionalFundingRequired),
    sources: sources.map((s) => ({ ...s, value: Math.round(s.value) })),
    uses: uses.map((u) => ({ ...u, value: Math.round(u.value) })),
    horizonLabel,
    hasFundingGap: fundingGap < 0,
  };
}

// ─── Warning banner copy (single source of truth) ──────────────────────────
// Tests import these constants directly so the displayed copy can never drift
// from the user's required wording.

export const PLAN_FEASIBILITY_WARNING_HEADLINE =
  "This plan requires additional funding.";

export function planFeasibilityWarningDetail(gap: number): string {
  const abs = Math.abs(Math.round(gap));
  return `Planned investments and acquisitions exceed available liquidity by $${abs.toLocaleString()}.`;
}

export const PLAN_FEASIBILITY_WARNING_ASSUMPTION =
  "Cashflow projections assume this funding shortfall is resolved.";
