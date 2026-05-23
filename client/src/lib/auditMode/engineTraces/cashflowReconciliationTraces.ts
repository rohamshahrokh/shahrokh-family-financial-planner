/**
 * cashflowReconciliationTraces.ts — Per-year cashflow reconciliation /
 * "net cashflow breakdown" audit trace for the Plan Execution Capacity chart.
 *
 * #FWL_Cashflow_Reconciliation_Trace
 *
 * Why this trace exists
 * ---------------------
 * The existing `cashflow:plan-execution:cash-balance:YYYY` trace explains
 * **closing cash** = opening cash + net cashflow + funding-source split. That
 * is enough to prove the Equity-Release deposit no longer subtracts cash, but
 * the user still cannot see why net cashflow itself comes out to e.g. -$292k
 * for an acquisition year like 2028. The reconciliation trace itemises every
 * income line and every outgoing line that feeds `netCashFlow`, so the user
 * can verify there is no double-counting (PPOR mortgage included once,
 * property holding costs handled as NG display only, equity release NOT
 * treated as a cash expense, etc.).
 *
 * Trace id pattern: `cashflow:plan-execution:reconciliation:YYYY`.
 *
 * Source-of-truth + bridge structure
 * ----------------------------------
 * Every number comes from `aggregateCashFlowToAnnual` (the canonical cashflow
 * engine in `client/src/lib/finance.ts`). The trace presents those numbers as
 * a six-section closing-cash bridge so an acquisition year (e.g. 2026 / 2028
 * for this household) no longer reads as a pure operating-cashflow deficit:
 *
 *   1. Opening Cash
 *   2. Operating Cashflow         (recurring household — derived subtotal)
 *      + Salary + Rental + Tax Refund + Other / Investment Income
 *      − Living − Childcare − PPOR mortgage − IP loan repayments − Bills
 *   3. Investment Allocations     (signed)
 *      − Stock DCA − Crypto DCA − Planned stock/crypto BUYS
 *      + Planned stock/crypto SELLS
 *   4. Property Acquisition Cash Used (signed; negative when an IP settles)
 *      − Deposit cash/offset − Asset sales used − Stamp duty/legal/buying costs
 *   5. Financing / Equity Release (display only — $0 cash impact)
 *      + Equity released portion of the deposit
 *   6. Closing Cash
 *
 * The bridge is arithmetically exact:
 *
 *   Engine Net Cashflow =
 *     Operating Cashflow + Investment Allocations + Property Acquisition Cash Used
 *                       + Financing/Equity Release + Rounding
 *   Closing Cash = Opening Cash + Engine Net Cashflow
 *
 * Operating Cashflow is **derived** for audit clarity — the engine's
 * `CashFlowYear.netCashFlow` already includes acquisition cash and investment
 * allocations. The trace verifies the engine balance numerically and surfaces
 * a `notes` diagnostic if drift exceeds $1. Items that the engine never moves
 * cash for (property holding cost, withheld tax, equity-release debt) are
 * listed in a dedicated "INFO (excluded from cash bridge)" section.
 */

import type { CalculationTrace } from "../calculationTrace";

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const ts = () => new Date().toISOString();

/** Stable trace id for a specific year on the reconciliation panel. */
export function cashflowReconciliationTraceId(year: number): string {
  return `cashflow:plan-execution:reconciliation:${year}`;
}

const NOW_YEAR = new Date().getFullYear();

/** Canonical 11-year window of reconciliation trace ids. */
export const CASHFLOW_RECONCILIATION_YEAR_RANGE: number[] = Array.from(
  { length: 11 },
  (_, i) => NOW_YEAR + i,
);

export const CASHFLOW_RECONCILIATION_TRACE_IDS: string[] =
  CASHFLOW_RECONCILIATION_YEAR_RANGE.map(cashflowReconciliationTraceId);

/**
 * Args for buildCashflowReconciliationTrace. Each field maps 1:1 to a
 * canonical engine output — no derived numbers, no recalculation.
 *
 * The split between "bridge" items (counted in netCashflow) and "info" items
 * (display only) mirrors the engine's own behaviour. Callers MUST pass the
 * raw engine values; the trace builder is responsible for the bucketing.
 */
export interface CashflowReconciliationTraceArgs {
  year: number;
  /** Opening cash for the year = prior year's `CashFlowYear.endingBalance` (or current cash for year 0). */
  openingCash: number;
  /** Closing cash = `CashFlowYear.endingBalance`. */
  closingCash: number;
  /** Engine net cashflow = `CashFlowYear.netCashFlow`. */
  netCashflow: number;

  // ── INCOME (annual — items the engine ADDS to cash) ─────────────────────
  /** Salary / wages — engine `CashFlowYear.income`. */
  salaryIncome: number;
  /** "Other income" placeholder — currently the engine does not split a separate "other income" bucket; pass 0 if unknown. INFO-only unless populated. */
  otherIncome?: number;
  /** Per-IP rental income — engine `CashFlowYear.rentalIncomeByProperty`. */
  rentalIncomeByProperty?: Record<string, number>;
  /**
   * Optional map from internal property id (Supabase `sf_properties.id` as a
   * string) to a friendly display label (e.g. `"IP 1: New Investment
   * Property"`). When provided, the per-IP rental rows render with this
   * label instead of the raw internal id; the internal id remains in the
   * `source` field as the technical key. Friendly numbering is the caller's
   * responsibility (typically: sort investment properties by purchase /
   * contract / settlement date ascending and assign 1-based indices).
   */
  propertyLabels?: Record<string, string>;
  /** Total rental income across all IPs — engine `CashFlowYear.rentalIncome`. */
  rentalIncomeTotal: number;
  /** Investment income (dividends/yield) — engine does not separately track this today; pass 0. INFO-only unless populated. */
  investmentIncome?: number;
  /** Tax refunds (negative-gearing refund / Aug lump-sum) — engine `CashFlowYear.ngTaxBenefit`. */
  taxRefund: number;
  /** Planned stock SELL proceeds — engine `CashFlowYear.plannedStockSell`. */
  plannedStockSell?: number;
  /** Planned crypto SELL proceeds — engine `CashFlowYear.plannedCryptoSell`. */
  plannedCryptoSell?: number;

  // ── OUTGOINGS (annual — items the engine SUBTRACTS from cash) ───────────
  /** Living expenses — engine `CashFlowYear.totalExpenses`. */
  livingExpenses: number;
  /** Childcare — INFO-only unless populated. */
  childcare?: number;
  /** PPOR mortgage repayment — engine `CashFlowYear.mortgageRepayment`. */
  pporMortgage: number;
  /** Investment loan repayments — engine `CashFlowYear.investmentLoanRepayment`. */
  investmentLoanRepayment: number;
  /** Recurring bills — engine `CashFlowYear.billsOutflow`. */
  billsOutflow: number;

  /** Planned stock BUY outflow — engine `CashFlowYear.plannedStockBuy`. */
  plannedStockBuy?: number;
  /** Planned crypto BUY outflow — engine `CashFlowYear.plannedCryptoBuy`. */
  plannedCryptoBuy?: number;
  /** Stock DCA outflow — engine `CashFlowYear.stockDCAOutflow`. */
  stockDCAOutflow?: number;
  /** Crypto DCA outflow — engine `CashFlowYear.cryptoDCAOutflow`. */
  cryptoDCAOutflow?: number;

  // ── INFO ONLY (not part of cash bridge — engine does NOT subtract) ──────
  /** Investment property holding cost — engine `CashFlowYear.propertyHoldingCost`. Used for NG display only; NOT subtracted from netCashflow. */
  propertyHoldingCost: number;
  /** Tax payable (informational — already withheld at source by employer; NOT subtracted from cash in the engine). */
  taxPayableInformational?: number;

  // ── PROPERTY ACQUISITION (annual — engine SUBTRACTS cash leg) ───────────
  /** Cash actually drawn at IP settlement — engine `CashFlowYear.propertyPurchaseCashUsed`. */
  acquisitionCashUsed: number;
  /** Equity released (loan-funded, NOT a cash outflow) — engine `CashFlowYear.propertyEquityReleased`. */
  equityReleased: number;
  /** Asset sales used at settlement — engine `CashFlowYear.propertyAssetSalesUsed`. */
  assetSalesUsed: number;
  /** Stamp duty + legal + reno + inspection + setup — engine `CashFlowYear.propertyBuyingCosts`. */
  acquisitionBuyingCosts: number;
  /** True if any IP settles in this year. */
  isAcquisitionYear: boolean;

  /** Which funding source dominated for the acquisition (display label only). */
  fundingSourceLabel?: string;

  // ── YEAR-END WEALTH POSITION (display only — sourced from projectNetWorth) ──
  // Optional. Lets the trace surface a compact "Liquidity vs Wealth" summary so
  // a low/negative Closing Cash year doesn't read as financial deterioration
  // when cash was intentionally deployed into property / stocks / crypto.
  // Every field passes through from `YearlyProjection` (see finance.ts) — the
  // trace does NOT recompute net worth.
  /** Year-end cash position from the forecast row (`YearlyProjection.cash`). */
  wealthCash?: number;
  /** Stock holdings value at year end (`YearlyProjection.stockValue`). */
  wealthStocks?: number;
  /** Crypto holdings value at year end (`YearlyProjection.cryptoValue`). */
  wealthCrypto?: number;
  /** Total property equity at year end (`YearlyProjection.propertyEquity`). */
  wealthPropertyEquity?: number;
  /** Accessible net worth (excl. super) — `YearlyProjection.accessibleNetWorth`. */
  wealthAccessibleNetWorth?: number;
  /** Total net worth incl. super — `YearlyProjection.endNetWorth`. */
  wealthTotalNetWorth?: number;
  /** Total super (display only) — `YearlyProjection.totalSuper`. */
  wealthTotalSuper?: number;
  /** Prior-year accessible net worth (optional). Used to decide whether to surface the "low cash but wealth intact" reassurance message. */
  priorYearAccessibleNetWorth?: number;
}

interface BalanceBuckets {
  // ── Bridge subtotals (audit-clarity, derived from the same engine fields) ──
  // The classic "Total Income / Total Expenses" pair is still computed for
  // backwards compatibility, but the cash bridge is now reported as four
  // signed subtotals so a -$292k acquisition year no longer reads as a pure
  // "operating cashflow" deficit. The engine's netCashflow is unchanged.
  operatingCashflow:      number; // Salary + Rental + TaxRefund + other income/investment income
                                  //   − Living − PPOR − IP loan − Bills − Childcare
  investmentAllocations:  number; // (Stock + Crypto sells) − (DCA + planned buys)  — signed
  propertyAcquisitionCashUsed: number; // − (acquisitionCashUsed + assetSalesUsed + buyingCosts)  — signed (negative when an IP settles)
  financingEquityRelease: number; // + equityReleased  (display-only — does not change cash; counted here so the
                                  //   bridge total reconciles back to engine net cashflow without it)

  // ── Legacy totals (preserved for backwards-compat with any caller / test) ──
  totalIncome: number;
  totalExpenses: number;

  roundingAdjustment: number;     // engine netCashflow - (Σincome - Σexpenses) — usually ±a few dollars
  netCashflowFromLines: number;   // operating + investments + acquisition + rounding == engine netCashflow
  closingFromBridge: number;      // opening + netCashflowFromLines
  driftFromEngineNet: number;     // |netCashflowFromLines - engine netCashflow|
  driftFromEngineClosing: number; // |closingFromBridge - engine closingCash|
}

function computeBalance(a: CashflowReconciliationTraceArgs): BalanceBuckets {
  const otherIncome      = a.otherIncome      ?? 0;
  const investmentIncome = a.investmentIncome ?? 0;
  const plannedStockSell  = a.plannedStockSell  ?? 0;
  const plannedCryptoSell = a.plannedCryptoSell ?? 0;

  const childcare        = a.childcare        ?? 0;
  const plannedStockBuy   = a.plannedStockBuy   ?? 0;
  const plannedCryptoBuy  = a.plannedCryptoBuy  ?? 0;
  const stockDCAOutflow   = a.stockDCAOutflow   ?? 0;
  const cryptoDCAOutflow  = a.cryptoDCAOutflow  ?? 0;

  // ── Bridge subtotals ─────────────────────────────────────────────────────
  // 1. Operating Cashflow — recurring household movements only.
  //    Salary + rental + tax refund + other income − living − PPOR − IP loan
  //    repayments − recurring bills − childcare.  PPOR mortgage is usually $0
  //    in forecast months (already inside monthly_expenses) — included here
  //    only so actual-mode months reconcile.
  const operatingCashflow =
    a.salaryIncome
    + otherIncome
    + a.rentalIncomeTotal
    + investmentIncome
    + a.taxRefund
    - a.livingExpenses
    - childcare
    - a.pporMortgage
    - a.investmentLoanRepayment
    - a.billsOutflow;

  // 2. Investment Allocations — signed. Sells are inflows, DCA + planned buys
  //    are outflows.  Surfaces the lump-sum nature of `sf_planned_investments`
  //    (e.g. BTC $80k Oct 2026, planned-stocks $40.4k Nov 2026).
  const investmentAllocations =
    plannedStockSell
    + plannedCryptoSell
    - plannedStockBuy
    - plannedCryptoBuy
    - stockDCAOutflow
    - cryptoDCAOutflow;

  // 3. Property Acquisition Cash Used — signed (negative when an IP settles).
  //    Mirrors the engine's `oneTimeCashOutflow = deposit + buyingCosts`,
  //    where `deposit` is already the cash-like portion after the funding
  //    adapter (cash + offset + asset sales).
  const propertyAcquisitionCashUsed =
    -(a.acquisitionCashUsed + a.assetSalesUsed + a.acquisitionBuyingCosts);

  // 4. Financing / Equity Release — display-only. Engine never subtracted
  //    equity-release from cash, so this subtotal contributes $0 to the
  //    reconciliation arithmetic; it exists so the user can see how much of
  //    the property acquisition was funded by new debt rather than cash.
  const financingEquityRelease = 0;

  // Legacy totals (kept for backwards compatibility).
  const totalIncome =
    a.salaryIncome
    + otherIncome
    + a.rentalIncomeTotal
    + investmentIncome
    + a.taxRefund
    + plannedStockSell
    + plannedCryptoSell;
  const totalExpenses =
    a.livingExpenses
    + childcare
    + a.pporMortgage
    + a.investmentLoanRepayment
    + plannedStockBuy
    + plannedCryptoBuy
    + stockDCAOutflow
    + cryptoDCAOutflow
    + a.billsOutflow
    + a.acquisitionCashUsed
    + a.assetSalesUsed
    + a.acquisitionBuyingCosts;

  // Pre-rounding-adjustment line totals. The engine accumulates netCashflow
  // from per-month rounded values, while these subtotals come from the
  // per-year rolled-up rounded values. The residual is captured explicitly as
  // a "Rounding (monthly accumulation)" line so the displayed equation
  // balances EXACTLY to engine netCashflow.
  const preRoundNet =
    operatingCashflow + investmentAllocations + propertyAcquisitionCashUsed + financingEquityRelease;
  const roundingAdjustment = a.netCashflow - preRoundNet;
  const netCashflowFromLines  = preRoundNet + roundingAdjustment; // == a.netCashflow
  const closingFromBridge     = a.openingCash + netCashflowFromLines;
  const driftFromEngineNet    = Math.abs(netCashflowFromLines - a.netCashflow);
  const driftFromEngineClosing = Math.abs(closingFromBridge - a.closingCash);

  return {
    operatingCashflow,
    investmentAllocations,
    propertyAcquisitionCashUsed,
    financingEquityRelease,
    totalIncome,
    totalExpenses,
    roundingAdjustment,
    netCashflowFromLines,
    closingFromBridge,
    driftFromEngineNet,
    driftFromEngineClosing,
  };
}

/**
 * Internal helper — diagnose whether any engine line *could* be double-counted
 * against the closing cash bridge. Includes a numerical assertion that the
 * displayed line items SUM to the engine's netCashflow. Any drift > $1 is
 * flagged loudly so a future engine change cannot silently break the audit.
 */
function diagnoseDoubleCounting(
  a: CashflowReconciliationTraceArgs,
  b: BalanceBuckets,
): string[] {
  const flags: string[] = [];

  // 1. Equity release must NOT appear inside net cashflow as an outflow.
  if (a.isAcquisitionYear) {
    if (a.equityReleased > 0 && a.acquisitionCashUsed === 0) {
      flags.push(
        `✓ Equity Release ${fmt$(a.equityReleased)} added to debt, NOT expensed — no double-counting on the acquisition leg.`,
      );
    } else if (a.equityReleased > 0 && a.acquisitionCashUsed > 0) {
      flags.push(
        `⚠ Both equityReleased (${fmt$(a.equityReleased)}) and acquisitionCashUsed (${fmt$(a.acquisitionCashUsed)}) are non-zero — split funding scenario; the trace counts only the cash leg in expenses.`,
      );
    } else if (a.acquisitionCashUsed > 0 && a.equityReleased === 0) {
      flags.push(
        `ℹ Acquisition funded entirely from cash/offset (${fmt$(a.acquisitionCashUsed)}). Engine subtracted this inside netCashflow; trace counts it once in Total Expenses.`,
      );
    }
  }

  // 2. PPOR mortgage / property holding costs are not double-counted.
  if (a.pporMortgage > 0 && a.livingExpenses > 0) {
    flags.push(
      `ℹ Both pporMortgage (${fmt$(a.pporMortgage)}) and livingExpenses (${fmt$(a.livingExpenses)}) are non-zero — typical for actual months where mortgage is recorded separately. Forecast months show $0 PPOR mortgage to avoid double-counting.`,
    );
  } else if (a.pporMortgage === 0 && a.livingExpenses > 0) {
    flags.push(
      `✓ PPOR mortgage not double-counted — engine deduplicates: snapshot.monthly_expenses already includes PPOR repayment, so pporMortgage = $0 in forecast months.`,
    );
  }

  // 3. Investment property cashflow handling. Rental and IP loan repayments
  //    are inside the bridge; holding cost is INFO-only (engine never
  //    subtracted it from netCashflow).
  if (a.rentalIncomeTotal > 0 || a.investmentLoanRepayment > 0) {
    flags.push(
      `✓ Investment-property cashflow itemised on both sides (rental income in Total Income, loan repayment in Total Expenses). Property holding cost ${fmt$(a.propertyHoldingCost)} is INFO-only — engine does not subtract it from netCashflow (used for NG display).`,
    );
  }

  // 4. Numerical balance assertion — the entire reason this trace exists.
  // After the rounding-adjustment line, drift MUST be 0 (or ≤ $1 for
  // floating-point tolerance). The rounding adjustment itself should be
  // small (a few dollars) — if it grows large, that suggests a real engine
  // line is missing from the trace inputs.
  if (b.driftFromEngineNet > 1) {
    flags.push(
      `✗ Reconciliation arithmetic does NOT balance — line items sum to ${fmt$(b.netCashflowFromLines)} but engine netCashflow is ${fmt$(a.netCashflow)} (drift ${fmt$(b.driftFromEngineNet)}). Investigate which engine line is missing from the trace inputs.`,
    );
  } else {
    const roundingDesc = Math.abs(b.roundingAdjustment) > 50
      ? `unusually large rounding adjustment ${fmt$(b.roundingAdjustment)} — may indicate a missing engine line`
      : `rounding adjustment ${fmt$(b.roundingAdjustment)} (from per-month Math.round)`;
    flags.push(
      `✓ Reconciliation arithmetic balances: Operating ${fmt$(b.operatingCashflow)} + Investment Allocations ${fmt$(b.investmentAllocations)} + Property Acquisition Cash Used ${fmt$(b.propertyAcquisitionCashUsed)} + Financing/Equity Release ${fmt$(b.financingEquityRelease)} + Rounding = ${fmt$(b.netCashflowFromLines)} matches engine netCashflow ${fmt$(a.netCashflow)}; ${roundingDesc}.`,
    );
  }

  // 5. Closing-cash bridge integrity.
  if (b.driftFromEngineClosing > 1) {
    flags.push(
      `✗ Closing-cash bridge drift = ${fmt$(b.driftFromEngineClosing)}. Expected openingCash + netCashflow == closingCash; bridge = ${fmt$(b.closingFromBridge)} vs engine ${fmt$(a.closingCash)}.`,
    );
  } else {
    flags.push(
      `✓ Closing-cash bridge balances: openingCash ${fmt$(a.openingCash)} + netCashflow ${fmt$(a.netCashflow)} = closingCash ${fmt$(a.closingCash)} (drift ${fmt$(b.driftFromEngineClosing)} ≤ $1).`,
    );
  }

  // 6. Liquidity-vs-Wealth reassurance — surfaces when a low / negative Closing
  //    Cash year coexists with deployed capital (property acquisition or
  //    investment allocations) AND a wealth row is available to show the
  //    deployment hasn't destroyed value. The exact wording is required by the
  //    "Year-End Wealth Position" UX rule so a user does not interpret low cash
  //    as financial deterioration.
  const cashDeployedSignificantly =
    Math.abs(b.investmentAllocations) + Math.abs(b.propertyAcquisitionCashUsed) >= 10_000;
  const closingCashLow = a.closingCash < 50_000;
  const hasWealthRow =
    a.wealthAccessibleNetWorth !== undefined
    || a.wealthTotalNetWorth !== undefined
    || a.wealthPropertyEquity !== undefined;
  if (closingCashLow && cashDeployedSignificantly && hasWealthRow) {
    flags.push(
      `ℹ Cash has been converted into assets and equity. Low cash does not indicate financial deterioration.`,
    );
  }

  return flags;
}

/**
 * Build the Year-End Wealth Position rows. Returns trace input rows that
 * distinguish Liquidity Position (Closing Cash, already shown above) from
 * Wealth Position (cash + invested capital + property equity + accessible /
 * total net worth). Every value passes through from `YearlyProjection` — the
 * trace does NOT recompute net worth.
 *
 * Fields that the caller did not provide are rendered as "n/a (not in current
 * forecast row)" so the user can see why a line is missing instead of the
 * row being silently dropped. This is the explicit UX rule from the screenshot:
 * "only show fields that can be derived live; clearly label unavailable
 * fields; do not fake/hardcode."
 */
function buildWealthPositionRows(
  a: CashflowReconciliationTraceArgs,
): Array<{ label: string; value: string; source?: string; note?: string }> {
  const investedCapital =
    a.wealthStocks !== undefined || a.wealthCrypto !== undefined
      ? safeSum(a.wealthStocks) + safeSum(a.wealthCrypto)
      : undefined;
  const accessibleDelta =
    a.wealthAccessibleNetWorth !== undefined && a.priorYearAccessibleNetWorth !== undefined
      ? a.wealthAccessibleNetWorth - a.priorYearAccessibleNetWorth
      : undefined;

  const NA = "n/a (not in current forecast row)";
  const fmtOrNA = (v: number | undefined) => (v === undefined ? NA : fmt$(v));

  const rows: Array<{ label: string; value: string; source?: string; note?: string }> = [
    { label: "─ 7. Year-End Wealth Position ─", value: "" },
    {
      label: "Liquidity Position — Closing Cash",
      value: fmt$(a.closingCash),
      source: "CashFlowYear.endingBalance (re-stated from section 6 for the liquidity-vs-wealth comparison)",
    },
    {
      label: "Cash Position (forecast row)",
      value: fmtOrNA(a.wealthCash),
      source: "YearlyProjection.cash",
      note: a.wealthCash === undefined
        ? "Caller did not pass a forecast cash row — section is informational only when this is omitted."
        : undefined,
    },
    {
      label: "Invested Capital (Stocks + Crypto)",
      value: fmtOrNA(investedCapital),
      source: "YearlyProjection.stockValue + YearlyProjection.cryptoValue",
      note: investedCapital === undefined
        ? "Caller did not pass stocks/crypto values — pass at least one of wealthStocks / wealthCrypto to surface this row."
        : undefined,
    },
    {
      label: "  · Stocks",
      value: fmtOrNA(a.wealthStocks),
      source: "YearlyProjection.stockValue",
    },
    {
      label: "  · Crypto",
      value: fmtOrNA(a.wealthCrypto),
      source: "YearlyProjection.cryptoValue",
    },
    {
      label: "Property Equity",
      value: fmtOrNA(a.wealthPropertyEquity),
      source: "YearlyProjection.propertyEquity (PPOR + IP value − all loans)",
    },
    {
      label: "Accessible Wealth (excl. super)",
      value: fmtOrNA(a.wealthAccessibleNetWorth),
      source: "YearlyProjection.accessibleNetWorth (canonical accessible net worth)",
    },
    {
      label: "Total Super (display only)",
      value: fmtOrNA(a.wealthTotalSuper),
      source: "YearlyProjection.totalSuper",
      note: "Super is locked until preservation age — kept separate from Accessible Wealth.",
    },
    {
      label: "Net Worth (incl. super)",
      value: fmtOrNA(a.wealthTotalNetWorth),
      source: "YearlyProjection.endNetWorth",
    },
  ];

  if (accessibleDelta !== undefined) {
    rows.push({
      label: "Δ Accessible Wealth vs prior year",
      value: fmt$(accessibleDelta),
      source: "Accessible Wealth (this year) − Accessible Wealth (prior year)",
      note: accessibleDelta >= 0
        ? "Accessible wealth held or grew despite the cash movement — liquidity dipped, wealth did not."
        : "Accessible wealth declined this year — review whether the deployment matches the strategic plan.",
    });
  }

  // Reassurance row — always rendered as a trace input so a UI can pick it
  // up without having to parse `notes`. Mirrors the diagnostic message in
  // `notes` so it's visible in both surfaces.
  const cashDeployed =
    Math.abs(safeSum(a.acquisitionCashUsed) + safeSum(a.acquisitionBuyingCosts) + safeSum(a.assetSalesUsed))
    + Math.abs(safeSum(a.plannedStockBuy) + safeSum(a.plannedCryptoBuy) + safeSum(a.stockDCAOutflow) + safeSum(a.cryptoDCAOutflow));
  const lowCash = a.closingCash < 50_000;
  if (lowCash && cashDeployed >= 10_000) {
    rows.push({
      label: "Liquidity vs Wealth context",
      value: "Cash has been converted into assets and equity. Low cash does not indicate financial deterioration.",
      source: "Year-End Wealth Position guard (triggered when Closing Cash < $50k and capital deployed ≥ $10k)",
    });
  } else if (a.closingCash >= 50_000 && cashDeployed >= 10_000) {
    rows.push({
      label: "Liquidity vs Wealth context",
      value: "Cash position remains healthy and capital was actively deployed into assets / equity.",
      source: "Year-End Wealth Position guard (Closing Cash ≥ $50k with material deployment)",
    });
  }

  return rows;
}

function safeSum(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Build the Cashflow Reconciliation audit trace for a given year. Returns a
 * CalculationTrace listing every income line, every outgoing line, info-only
 * items, and the exact closing-cash bridge.
 */
export function buildCashflowReconciliationTrace(
  a: CashflowReconciliationTraceArgs,
): CalculationTrace {
  const id = cashflowReconciliationTraceId(a.year);
  const otherIncome      = a.otherIncome      ?? 0;
  const investmentIncome = a.investmentIncome ?? 0;
  const childcare        = a.childcare        ?? 0;
  const taxPayableInfo   = a.taxPayableInformational ?? 0;
  const plannedStockSell  = a.plannedStockSell  ?? 0;
  const plannedCryptoSell = a.plannedCryptoSell ?? 0;
  const plannedStockBuy   = a.plannedStockBuy   ?? 0;
  const plannedCryptoBuy  = a.plannedCryptoBuy  ?? 0;
  const stockDCAOutflow   = a.stockDCAOutflow   ?? 0;
  const cryptoDCAOutflow  = a.cryptoDCAOutflow  ?? 0;

  const b = computeBalance(a);

  // Per-IP rental rows. When the caller supplies friendly labels (purchase-
  // date-ordered "IP N: Name") we render those instead of the raw Supabase
  // sf_properties.id, while keeping the internal id in `source` as the
  // technical key. Sort order prefers the friendly label so "IP 1" lands
  // above "IP 2"; rows without a friendly label fall back to id sort.
  const propertyLabels = a.propertyLabels ?? {};
  const rentalRows = Object.entries(a.rentalIncomeByProperty ?? {})
    .sort(([a1], [b1]) => {
      const la = propertyLabels[a1];
      const lb = propertyLabels[b1];
      if (la && lb) return la.localeCompare(lb, undefined, { numeric: true });
      if (la) return -1;
      if (lb) return 1;
      return a1.localeCompare(b1);
    })
    .map(([propId, amt]) => {
      const friendly = propertyLabels[propId];
      return {
        label: friendly
          ? `Rental income — ${friendly}`
          : `Rental income — IP ${propId}`,
        value: fmt$(amt),
        source: `CashFlowYear.rentalIncomeByProperty["${propId}"] (internal id ${propId})`,
      };
    });

  const flags = diagnoseDoubleCounting(a, b);

  return {
    id,
    label: `Cashflow Reconciliation — ${a.year}`,
    finalValue: fmt$(a.netCashflow),
    plainEnglish: a.isAcquisitionYear
      ? `Year ${a.year} is an acquisition year. The closing-cash bridge has four parts: Opening Cash + Operating Cashflow − Investment Allocations − Property Acquisition Cash Used + Financing/Equity Release = Closing Cash. Operating Cashflow shows the recurring household movement (salary, rental, tax refund vs living, IP loan, bills). Investment Allocations isolates Stock/Crypto DCA + planned lump-sum buys/sells. Property Acquisition Cash Used isolates the IP settlement cash leg (deposit cash + offset + asset sales + buying costs). Financing/Equity Release reports the debt-funded portion of the deposit — display only; never reduces cash. The Year-End Wealth Position section below contrasts Liquidity Position (Closing Cash) with Wealth Position (Cash + Invested Capital + Property Equity + Accessible Wealth + Net Worth) so a year where cash was deployed into assets does not read as financial deterioration.`
      : `Year ${a.year} has no property settlement. The closing-cash bridge has three live parts: Opening Cash + Operating Cashflow − Investment Allocations = Closing Cash. Property Acquisition Cash Used and Financing/Equity Release are $0 in this year. The Year-End Wealth Position section below contrasts Liquidity (Closing Cash) with Wealth (Cash + Invested Capital + Property Equity + Accessible Wealth + Net Worth).`,
    formula:
      "Closing Cash = Opening Cash\n" +
      "             + Operating Cashflow\n" +
      "             + Investment Allocations               (signed; usually negative)\n" +
      "             + Property Acquisition Cash Used       (signed; negative when an IP settles)\n" +
      "             + Financing / Equity Release           (debt-funded; $0 cash impact)\n" +
      "             + Rounding (monthly accumulation)\n" +
      "Engine Net Cashflow = Operating Cashflow + Investment Allocations + Property Acquisition Cash Used + Financing/Equity Release + Rounding\n" +
      "(Operating Cashflow is a derived subtotal for audit clarity; the engine's `CashFlowYear.netCashFlow` already includes acquisition cash and investment allocations.)",
    expanded:
      `Operating Cashflow ${fmt$(b.operatingCashflow)} + Investment Allocations ${fmt$(b.investmentAllocations)} + Property Acquisition Cash Used ${fmt$(b.propertyAcquisitionCashUsed)} + Financing/Equity Release ${fmt$(b.financingEquityRelease)} + Rounding ${fmt$(b.roundingAdjustment)} = Net Cashflow ${fmt$(b.netCashflowFromLines)} (engine: ${fmt$(a.netCashflow)})\n` +
      `Opening Cash ${fmt$(a.openingCash)} + Net Cashflow ${fmt$(a.netCashflow)} = Closing Cash ${fmt$(a.closingCash)}`,
    inputs: [
      // ── 1. OPENING CASH ──────────────────────────────────────────────────
      { label: "─ 1. Opening Cash ─",              value: "" },
      { label: "Opening Cash",                     value: fmt$(a.openingCash),     source: "Prior year CashFlowYear.endingBalance (current cash for year 0)" },

      // ── 2. OPERATING CASHFLOW (recurring household) ──────────────────────
      { label: "─ 2. Operating Cashflow ─",        value: "" },
      { label: "+ Salary income",                  value: fmt$(a.salaryIncome),    source: "CashFlowYear.income" },
      { label: "+ Other income",                   value: fmt$(otherIncome),       source: "Not separately tracked by engine — pass-through (0 unless caller populates)" },
      ...rentalRows,
      { label: "+ Rental income — all properties", value: fmt$(a.rentalIncomeTotal), source: "CashFlowYear.rentalIncome (sum across IPs)" },
      { label: "+ Investment income (dividends)",  value: fmt$(investmentIncome),  source: "Not separately tracked by engine — pass-through (0 unless caller populates)" },
      { label: "+ Tax refunds (NG)",               value: fmt$(a.taxRefund),       source: "CashFlowYear.ngTaxBenefit (Aug lump-sum or PAYG spread)" },
      { label: "- Living expenses",                value: fmt$(a.livingExpenses),  source: "CashFlowYear.totalExpenses (snapshot.monthly_expenses × inflation OR actuals)" },
      { label: "- Childcare",                      value: fmt$(childcare),         source: "Not separately tracked by engine — pass-through (0 unless caller populates)" },
      { label: "- PPOR mortgage repayment",        value: fmt$(a.pporMortgage),    source: "CashFlowYear.mortgageRepayment ($0 in forecast months — already inside monthly_expenses; non-zero only in actual months where mortgage row is missing)" },
      { label: "- Investment loan repayments",     value: fmt$(a.investmentLoanRepayment), source: "CashFlowYear.investmentLoanRepayment (IP1 + IP2 + ...)" },
      { label: "- Recurring bills / debt repayments", value: fmt$(a.billsOutflow), source: "CashFlowYear.billsOutflow (frequency-aware via billActualOutflow)" },
      { label: "= Operating Cashflow",             value: fmt$(b.operatingCashflow), source: "Derived subtotal for audit clarity — engine's CashFlowYear.netCashFlow already includes the items below" },

      // ── 3. INVESTMENT ALLOCATIONS (signed) ───────────────────────────────
      { label: "─ 3. Investment Allocations ─",    value: "" },
      { label: "- Stock DCA",                      value: fmt$(stockDCAOutflow),   source: "CashFlowYear.stockDCAOutflow (Σ active stock DCA schedules)" },
      { label: "- Crypto DCA",                     value: fmt$(cryptoDCAOutflow),  source: "CashFlowYear.cryptoDCAOutflow (Σ active crypto DCA schedules)" },
      { label: "- Planned stock buys",             value: fmt$(plannedStockBuy),   source: "CashFlowYear.plannedStockBuy (cash OUT from planned-order buys + tx buys — lump-sum on planned_date)" },
      { label: "- Planned crypto buys",            value: fmt$(plannedCryptoBuy),  source: "CashFlowYear.plannedCryptoBuy (cash OUT from planned-order buys + tx buys — lump-sum on planned_date)" },
      { label: "+ Planned stock sells",            value: fmt$(plannedStockSell),  source: "CashFlowYear.plannedStockSell (cash IN from planned-order sells + tx sells)" },
      { label: "+ Planned crypto sells",           value: fmt$(plannedCryptoSell), source: "CashFlowYear.plannedCryptoSell (cash IN from planned-order sells + tx sells)" },
      { label: "= Net Investment Allocations",     value: fmt$(b.investmentAllocations), source: "Signed subtotal — sells − (DCA + planned buys)" },

      // ── 4. PROPERTY ACQUISITION CASH USED (signed) ───────────────────────
      { label: "─ 4. Property Acquisition Cash Used ─", value: "" },
      { label: "- Deposit cash / offset used",     value: fmt$(a.acquisitionCashUsed),    source: "CashFlowYear.propertyPurchaseCashUsed (engine subtracts at settlement)" },
      { label: "- Asset sales used (stocks/crypto liquidated for deposit)", value: fmt$(a.assetSalesUsed), source: "CashFlowYear.propertyAssetSalesUsed (engine subtracts at settlement)" },
      { label: "- Stamp duty + legal + building / loan setup / other buying costs", value: fmt$(a.acquisitionBuyingCosts), source: "CashFlowYear.propertyBuyingCosts (stamp duty + legal + reno + inspection + setup)" },
      { label: "= Property Acquisition Cash Used", value: fmt$(b.propertyAcquisitionCashUsed), source: "Signed subtotal — negative when an IP settles, $0 otherwise" },

      // ── 5. FINANCING / EQUITY RELEASE (display only) ─────────────────────
      { label: "─ 5. Financing / Equity Release ─", value: "" },
      { label: "+ Equity released (debt-funded deposit)", value: fmt$(a.equityReleased), source: "CashFlowYear.propertyEquityReleased — added to loan balance, NOT a cash outflow",
        note: "Display only — engine does not move cash here. Quantifies how much of the deposit was funded by new debt rather than household cash." },
      { label: "= Financing / Equity Release (cash impact)", value: fmt$(b.financingEquityRelease), source: "Always $0 in the cash bridge — equity release moves debt, not cash" },

      // ── INFO ONLY (not in cash bridge) ────────────────────────────────────
      { label: "─ INFO (excluded from cash bridge) ─", value: "" },
      { label: "Investment property holding cost", value: fmt$(a.propertyHoldingCost), source: "CashFlowYear.propertyHoldingCost — used by engine for NG calc display only; NOT subtracted from netCashflow",
        note: "EXCLUDED from cash bridge — already implicitly reflected in IP NG refund / loan structure" },
      { label: "Tax payable (already withheld)",   value: fmt$(taxPayableInfo), source: "CashFlowYear.taxPayable — informational; salary is post-tax at source",
        note: "EXCLUDED from cash bridge — already withheld by employer; engine does not subtract again" },
      { label: "Total Income (legacy combined view)",  value: fmt$(b.totalIncome),  source: "Σ of all income lines above (kept for backwards compatibility with prior trace consumers)" },
      { label: "Total Expenses (legacy combined view)", value: fmt$(b.totalExpenses), source: "Σ of all outflow lines above incl. acquisition cash leg (kept for backwards compatibility)" },

      // ── 6. CLOSING CASH (engine bridge) ──────────────────────────────────
      { label: "─ 6. Closing Cash ─",              value: "" },
      { label: "Opening Cash",                     value: fmt$(a.openingCash),     source: "Re-stated for the bridge" },
      { label: "+ Operating Cashflow",             value: fmt$(b.operatingCashflow) },
      { label: "+ Investment Allocations",         value: fmt$(b.investmentAllocations) },
      { label: "+ Property Acquisition Cash Used", value: fmt$(b.propertyAcquisitionCashUsed) },
      { label: "+ Financing / Equity Release",     value: fmt$(b.financingEquityRelease) },
      { label: "+ Rounding (monthly accumulation)", value: fmt$(b.roundingAdjustment), source: "engine netCashflow - (Σsubtotals); residual from per-month Math.round() inside buildCashFlowSeries — typically ±a few dollars" },
      { label: "= Engine Net Cashflow (line-item sum)", value: fmt$(b.netCashflowFromLines), source: "Σsubtotals + rounding adjustment — matches engine netCashflow exactly" },
      { label: "= Engine Net Cashflow (canonical)", value: fmt$(a.netCashflow),     source: "CashFlowYear.netCashFlow (canonical)" },
      { label: "Drift (line sum vs engine)",       value: fmt$(b.driftFromEngineNet), source: "should be 0 once rounding adjustment is applied — flagged in notes otherwise" },
      { label: "= Closing Cash",                   value: fmt$(a.closingCash),     source: "CashFlowYear.endingBalance = Opening Cash + Engine Net Cashflow" },

      // ── 7. YEAR-END WEALTH POSITION ──────────────────────────────────────
      // Liquidity (Closing Cash above) vs Wealth (this section). Every value
      // here is read live from `YearlyProjection` — no recomputation. Fields
      // are listed individually so unavailable ones can show "n/a" without
      // hiding the others. The "Cash has been converted into assets and
      // equity" note appears in `notes` when Closing Cash is low / negative
      // and capital was materially deployed in the year.
      ...buildWealthPositionRows(a),
    ],
    assumptions: [
      { label: "Engine values come from buildCashFlowSeries → aggregateCashFlowToAnnual (canonical)", source: "client/src/lib/finance.ts" },
      { label: "Operating Cashflow is a derived subtotal for audit clarity — the engine's CashFlowYear.netCashFlow already includes acquisition cash and investment allocations", source: "buildCashflowReconciliationTrace (this trace)" },
      { label: "Engine Net Cashflow = Operating Cashflow + Investment Allocations + Property Acquisition Cash Used + Financing/Equity Release + Rounding", source: "buildCashflowReconciliationTrace bridge" },
      { label: "Year-End Wealth Position values pass through from YearlyProjection (projectNetWorth) — this trace does NOT recompute net worth. Unavailable fields are labelled 'n/a (not in current forecast row)' rather than zeroed.", source: "client/src/lib/finance.ts (projectNetWorth)" },
      { label: "Equity Release adds to debt, NOT to cash outflow — included in section 5 as a $0 cash-impact line for transparency", source: "propertyFundingAdapter" },
      { label: "PPOR mortgage is inside snapshot.monthly_expenses — engine zeroes the separate PPOR line in forecast months", source: "buildCashFlowSeries" },
      { label: "Property holding cost is NG display only — engine never subtracts it from netCashflow", source: "buildCashFlowSeries (propDeductibleExpenses for NG calc)" },
      { label: "Salary is post-tax at source — tax payable is informational only and does NOT reduce cash", source: "buildCashFlowSeries (auTaxPayable used for display)" },
      { label: a.fundingSourceLabel ? `Funding source: ${a.fundingSourceLabel}` : "Funding source: see acquisition decomposition", source: "FundingPlan" },
    ],
    dataSource: "buildCashFlowSeries + aggregateCashFlowToAnnual",
    sourceEngine: "client/src/lib/finance.ts (canonical cashflow engine) + applyFundingToProperties()",
    included: [
      { label: "Operating Cashflow: salary, rental, tax refund (NG), other/dividend income; less living, childcare, PPOR mortgage, IP loan repayments, recurring bills" },
      { label: "Investment Allocations: stock + crypto DCA, planned stock + crypto buys/sells" },
      { label: "Property Acquisition Cash Used: deposit cash/offset, asset sales used, stamp duty + legal + building + loan setup + other buying costs" },
      { label: "Financing / Equity Release: equity-released portion of the deposit (debt-funded; $0 cash impact)" },
      { label: "Year-End Wealth Position: Cash, Invested Capital (Stocks + Crypto), Property Equity, Accessible Wealth, Total Super, Net Worth — pass-through from YearlyProjection (projectNetWorth)" },
      { label: "Rounding adjustment for per-month Math.round() residual" },
    ],
    excluded: [
      { label: "Equity-release deposits",          reason: "Funded by new debt — added to loan balance, NOT deducted from cash" },
      { label: "Property holding cost",            reason: "Engine uses this for NG calc display only; it is NOT subtracted from netCashflow" },
      { label: "Withheld income tax",              reason: "Already deducted at source by employer; not a second cash outflow" },
      { label: "Capital growth / unrealised gains", reason: "Net Worth concept; not a cashflow event" },
    ],
    calculatedAt: ts(),
    relatedIds: [
      `cashflow:plan-execution:cash-balance:${a.year}`,
      "property:funding-source:used",
      "property:funding-source:cash-impact",
      "property:funding-source:equity-release",
    ],
    notes: flags,
  };
}
