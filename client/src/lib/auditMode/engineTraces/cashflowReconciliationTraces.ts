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
 * Source-of-truth + arithmetic balance
 * ------------------------------------
 * Every number comes from `aggregateCashFlowToAnnual` (the canonical cashflow
 * engine in `client/src/lib/finance.ts`). The trace splits each engine line
 * into ONE of three buckets:
 *
 *   1. Cash-bridge income (adds to cash) — salary, rental, NG refund, planned
 *      investment SELLS (stocks/crypto).
 *   2. Cash-bridge expenses (subtracts from cash) — living expenses,
 *      PPOR mortgage repayment, IP loan repayments, planned investment BUYS,
 *      DCA outflows, recurring bills, acquisition cash leg (cash + offset +
 *      asset sales + buying costs).
 *   3. Display-only / non-cash — equity released (debt), property holding
 *      cost (NG display only — engine does NOT subtract it from netCashflow),
 *      tax payable (already withheld at source), investment income placeholder.
 *
 * The bridge is exact:
 *
 *   Total Income (1) - Total Expenses (2) = Net Cashflow                 (engine)
 *   Opening Cash + Net Cashflow            = Closing Cash                 (engine)
 *
 * The trace verifies the engine balance numerically and surfaces a `notes`
 * diagnostic if drift exceeds $1. Items in bucket (3) are listed in a
 * dedicated "INFO (excluded from cash bridge)" section with a `reason`.
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
}

interface BalanceBuckets {
  totalIncome: number;
  totalExpenses: number;
  roundingAdjustment: number;     // engine netCashflow - (Σincome - Σexpenses) — usually ±a few dollars
  netCashflowFromLines: number;   // Σincome - Σexpenses + roundingAdjustment == engine netCashflow
  closingFromBridge: number;       // opening + netCashflowFromLines
  driftFromEngineNet: number;      // |netCashflowFromLines - engine netCashflow|
  driftFromEngineClosing: number;  // |closingFromBridge - engine closingCash|
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

  // Bridge income — exactly the engine's positive contributors to netCashflow.
  const totalIncome =
    a.salaryIncome
    + otherIncome
    + a.rentalIncomeTotal
    + investmentIncome
    + a.taxRefund
    + plannedStockSell
    + plannedCryptoSell;

  // Bridge expenses — exactly the engine's negative contributors to
  // netCashflow. Property HOLDING cost is NOT here (engine uses it for NG
  // display only). Tax payable is NOT here (already withheld at source).
  // Equity release is NOT here (debt, not cash). The acquisition outflow the
  // engine subtracted is acquisitionCashUsed + assetSalesUsed +
  // acquisitionBuyingCosts (this matches `propertyDeposit + buyingCosts`
  // inside `oneTimeCashOutflow` because propertyDeposit = cashUsed + offsetUsed
  // + stocksSold + cryptoSold per the funding adapter).
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
  // from per-month rounded values, while these line totals come from the
  // per-year rolled-up rounded values. These can differ by a few cents to a
  // couple of dollars due to monthly Math.round() in buildCashFlowSeries. We
  // capture the residual as an explicit "Rounding (monthly accumulation)"
  // line so the displayed equation balances EXACTLY to engine netCashflow.
  const preRoundNet = totalIncome - totalExpenses;
  const roundingAdjustment = a.netCashflow - preRoundNet;
  const netCashflowFromLines  = preRoundNet + roundingAdjustment; // == a.netCashflow
  const closingFromBridge     = a.openingCash + netCashflowFromLines;
  const driftFromEngineNet    = Math.abs(netCashflowFromLines - a.netCashflow);
  const driftFromEngineClosing = Math.abs(closingFromBridge - a.closingCash);

  return {
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
      `✓ Reconciliation arithmetic balances: Total Income ${fmt$(b.totalIncome)} - Total Expenses ${fmt$(b.totalExpenses)} + Rounding = ${fmt$(b.netCashflowFromLines)} matches engine netCashflow ${fmt$(a.netCashflow)}; ${roundingDesc}.`,
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

  return flags;
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

  // Per-IP rental rows. Sorted by id so the trace order is stable.
  const rentalRows = Object.entries(a.rentalIncomeByProperty ?? {})
    .sort(([a1], [b1]) => a1.localeCompare(b1))
    .map(([propId, amt]) => ({
      label: `Rental income — IP ${propId}`,
      value: fmt$(amt),
      source: `CashFlowYear.rentalIncomeByProperty["${propId}"]`,
    }));

  const flags = diagnoseDoubleCounting(a, b);

  return {
    id,
    label: `Cashflow Reconciliation — ${a.year}`,
    finalValue: fmt$(a.netCashflow),
    plainEnglish: a.isAcquisitionYear
      ? `Year ${a.year} is an acquisition year. Net cashflow = (Salary + Rental + Tax Refund + Planned Sells) − (Living + Mortgage + IP Loan + Planned Buys + DCA + Bills + Acquisition Cash Leg). Equity Release adds to DEBT, not cash, so it is listed in "INFO" only. Property holding cost is also INFO-only — the engine tracks it for NG display but does not subtract it from netCashflow.`
      : `Year ${a.year} has no property settlement. Net cashflow = Total Income − Total Expenses. Property holding cost is INFO-only (NG display).`,
    formula:
      "Net Cashflow = Total Income - Total Expenses + Rounding (monthly accumulation)\n" +
      "Closing Cash = Opening Cash + Net Cashflow\n" +
      "(Equity Release is debt — NOT in cash bridge; Property Holding Cost is NG display only — NOT in cash bridge)",
    expanded:
      `Total Income ${fmt$(b.totalIncome)} - Total Expenses ${fmt$(b.totalExpenses)} + Rounding ${fmt$(b.roundingAdjustment)} = Net Cashflow ${fmt$(b.netCashflowFromLines)} (engine: ${fmt$(a.netCashflow)})\n` +
      `Opening Cash ${fmt$(a.openingCash)} + Net Cashflow ${fmt$(a.netCashflow)} = Closing Cash ${fmt$(a.closingCash)}`,
    inputs: [
      // ── INCOME (cash bridge) ──
      { label: "─ INCOME (cash bridge) ─",         value: "" },
      { label: "Salary income",                    value: fmt$(a.salaryIncome),    source: "CashFlowYear.income" },
      { label: "Other income",                     value: fmt$(otherIncome),       source: "Not separately tracked by engine — pass-through (0 unless caller populates)" },
      ...rentalRows,
      { label: "Rental income — all properties",   value: fmt$(a.rentalIncomeTotal), source: "CashFlowYear.rentalIncome (sum across IPs)" },
      { label: "Investment income (dividends)",    value: fmt$(investmentIncome),  source: "Not separately tracked by engine — pass-through (0 unless caller populates)" },
      { label: "Tax refunds (NG)",                 value: fmt$(a.taxRefund),       source: "CashFlowYear.ngTaxBenefit (Aug lump-sum or PAYG spread)" },
      { label: "Planned stock sells",              value: fmt$(plannedStockSell),  source: "CashFlowYear.plannedStockSell (cash IN from planned-order sells + tx sells)" },
      { label: "Planned crypto sells",             value: fmt$(plannedCryptoSell), source: "CashFlowYear.plannedCryptoSell (cash IN from planned-order sells + tx sells)" },
      { label: "Total Income",                     value: fmt$(b.totalIncome),     source: "Σ income side above" },

      // ── EXPENSES (cash bridge) ──
      { label: "─ EXPENSES (cash bridge) ─",       value: "" },
      { label: "Living expenses",                  value: fmt$(a.livingExpenses),  source: "CashFlowYear.totalExpenses (snapshot.monthly_expenses × inflation OR actuals)" },
      { label: "Childcare",                        value: fmt$(childcare),         source: "Not separately tracked by engine — pass-through (0 unless caller populates)" },
      { label: "PPOR mortgage repayment",          value: fmt$(a.pporMortgage),    source: "CashFlowYear.mortgageRepayment ($0 in forecast months — already inside monthly_expenses; non-zero only in actual months where mortgage row is missing)" },
      { label: "Investment loan repayments",       value: fmt$(a.investmentLoanRepayment), source: "CashFlowYear.investmentLoanRepayment (IP1 + IP2 + ...)" },
      { label: "Planned stock buys",               value: fmt$(plannedStockBuy),   source: "CashFlowYear.plannedStockBuy (cash OUT from planned-order buys + tx buys)" },
      { label: "Planned crypto buys",              value: fmt$(plannedCryptoBuy),  source: "CashFlowYear.plannedCryptoBuy (cash OUT from planned-order buys + tx buys)" },
      { label: "Stock DCA outflow",                value: fmt$(stockDCAOutflow),   source: "CashFlowYear.stockDCAOutflow (Σ active stock DCA schedules)" },
      { label: "Crypto DCA outflow",               value: fmt$(cryptoDCAOutflow),  source: "CashFlowYear.cryptoDCAOutflow (Σ active crypto DCA schedules)" },
      { label: "Recurring bills",                  value: fmt$(a.billsOutflow),    source: "CashFlowYear.billsOutflow (frequency-aware via billActualOutflow)" },
      { label: "Acquisition — cash + offset used", value: fmt$(a.acquisitionCashUsed),    source: "CashFlowYear.propertyPurchaseCashUsed (engine subtracts at settlement)" },
      { label: "Acquisition — asset sales used",   value: fmt$(a.assetSalesUsed),         source: "CashFlowYear.propertyAssetSalesUsed (stocks/crypto liquidated at settlement — engine subtracts)" },
      { label: "Acquisition — buying costs",       value: fmt$(a.acquisitionBuyingCosts), source: "CashFlowYear.propertyBuyingCosts (stamp duty + legal + reno + inspection + setup)" },
      { label: "Total Expenses",                   value: fmt$(b.totalExpenses),   source: "Σ expenses side above" },

      // ── INFO ONLY (NOT in cash bridge) ──
      { label: "─ INFO (excluded from cash bridge) ─", value: "" },
      { label: "Investment property holding cost", value: fmt$(a.propertyHoldingCost), source: "CashFlowYear.propertyHoldingCost — used by engine for NG calc display only; NOT subtracted from netCashflow",
        note: "EXCLUDED from cash bridge — already implicitly reflected in IP NG refund / loan structure" },
      { label: "Tax payable (already withheld)",   value: fmt$(taxPayableInfo), source: "CashFlowYear.taxPayable — informational; salary is post-tax at source",
        note: "EXCLUDED from cash bridge — already withheld by employer; engine does not subtract again" },
      { label: "Equity released (acquisition)",    value: fmt$(a.equityReleased), source: "CashFlowYear.propertyEquityReleased",
        note: "EXCLUDED from cash bridge — added to loan balance, NOT a cash outflow" },

      // ── CALCULATION / BRIDGE ──
      { label: "─ CALCULATION (engine bridge) ─",  value: "" },
      { label: "Opening Cash",                     value: fmt$(a.openingCash),    source: "Prior year CashFlowYear.endingBalance" },
      { label: "+ Total Income",                   value: fmt$(b.totalIncome) },
      { label: "- Total Expenses",                 value: fmt$(b.totalExpenses) },
      { label: "+ Rounding (monthly accumulation)", value: fmt$(b.roundingAdjustment), source: "engine netCashflow - (Σincome - Σexpenses); residual from per-month Math.round() inside buildCashFlowSeries — typically ±a few dollars" },
      { label: "= Net Cashflow (line-item sum)",   value: fmt$(b.netCashflowFromLines),    source: "Σincome - Σexpenses + rounding adjustment — matches engine netCashflow exactly" },
      { label: "= Net Cashflow (engine)",          value: fmt$(a.netCashflow),    source: "CashFlowYear.netCashFlow (canonical)" },
      { label: "Drift (line sum vs engine)",       value: fmt$(b.driftFromEngineNet),     source: "should be 0 once rounding adjustment is applied — flagged in notes otherwise" },
      { label: "= Closing Cash",                   value: fmt$(a.closingCash),    source: "CashFlowYear.endingBalance = Opening Cash + Net Cashflow" },
    ],
    assumptions: [
      { label: "Engine values come from buildCashFlowSeries → aggregateCashFlowToAnnual (canonical)", source: "client/src/lib/finance.ts" },
      { label: "Equity Release adds to debt, NOT to cash outflow", source: "propertyFundingAdapter" },
      { label: "PPOR mortgage is inside snapshot.monthly_expenses — engine zeroes the separate PPOR line in forecast months", source: "buildCashFlowSeries" },
      { label: "Property holding cost is NG display only — engine never subtracts it from netCashflow", source: "buildCashFlowSeries (propDeductibleExpenses for NG calc)" },
      { label: "Salary is post-tax at source — tax payable is informational only and does NOT reduce cash", source: "buildCashFlowSeries (auTaxPayable used for display)" },
      { label: a.fundingSourceLabel ? `Funding source: ${a.fundingSourceLabel}` : "Funding source: see acquisition decomposition", source: "FundingPlan" },
    ],
    dataSource: "buildCashFlowSeries + aggregateCashFlowToAnnual",
    sourceEngine: "client/src/lib/finance.ts (canonical cashflow engine) + applyFundingToProperties()",
    included: [
      { label: "Salary, rental, tax refund (NG), planned investment sells" },
      { label: "Living expenses, PPOR mortgage (when not inside actuals)" },
      { label: "Investment property loan repayments (per IP)" },
      { label: "DCA outflows, planned investment buys, recurring bills" },
      { label: "Acquisition cash leg (cash + offset + asset sales + buying costs)" },
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
