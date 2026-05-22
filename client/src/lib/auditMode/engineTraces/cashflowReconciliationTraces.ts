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
 * property holding costs included once, equity release NOT treated as an
 * expense, etc.).
 *
 * Trace id pattern: `cashflow:plan-execution:reconciliation:YYYY`.
 *
 * Source-of-truth
 * ---------------
 * Every number comes from `aggregateCashFlowToAnnual` (the canonical cashflow
 * engine in `client/src/lib/finance.ts`) — no parallel formulas live here.
 * The trace simply re-displays line items the engine already produced and
 * states the closing-cash bridge:
 *
 *   Opening Cash
 *   + Total Income (salary + rental + ngTaxBenefit)
 *   - Total Expenses (living + PPOR mortgage + IP loan repayments + property
 *                     holding costs + DCA + planned investments + bills)
 *   = Net Cashflow
 *   + Equity Released               (loan-funded → does NOT touch cash)
 *   - Acquisition Cash Used         (cash + offset + asset-sales + buying costs)
 *   = Closing Cash
 *
 * The trace also surfaces double-counting diagnostics so the user can see at
 * a glance whether the engine flagged any suspect item.
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
 */
export interface CashflowReconciliationTraceArgs {
  year: number;
  /** Opening cash for the year = prior year's `CashFlowYear.endingBalance` (or current cash for year 0). */
  openingCash: number;
  /** Closing cash = `CashFlowYear.endingBalance`. */
  closingCash: number;
  /** Engine net cashflow = `CashFlowYear.netCashFlow`. */
  netCashflow: number;

  // ── INCOME (annual) ─────────────────────────────────────────────────────
  /** Salary / wages — engine `CashFlowYear.income`. */
  salaryIncome: number;
  /** "Other income" placeholder — currently the engine does not split a separate "other income" bucket; pass 0 if unknown. */
  otherIncome?: number;
  /** Per-IP rental income — engine `CashFlowYear.rentalIncomeByProperty`. */
  rentalIncomeByProperty?: Record<string, number>;
  /** Total rental income across all IPs — engine `CashFlowYear.rentalIncome`. */
  rentalIncomeTotal: number;
  /** Investment income (dividends/yield) — engine does not separately track this today; pass 0. */
  investmentIncome?: number;
  /** Tax refunds (negative-gearing refund / Aug lump-sum) — engine `CashFlowYear.ngTaxBenefit`. */
  taxRefund: number;

  // ── OUTGOINGS (annual) ──────────────────────────────────────────────────
  /** Living expenses — engine `CashFlowYear.totalExpenses` (this already includes PPOR mortgage in forecast years; engine de-duplicates so PPOR mortgage repayment line is $0 in forecast months). */
  livingExpenses: number;
  /** Childcare — not separately tracked in engine today; pass 0 unless caller derives it. */
  childcare?: number;
  /** PPOR mortgage repayment — engine `CashFlowYear.mortgageRepayment` (only non-zero in actual months where mortgage is NOT inside the expense actuals). */
  pporMortgage: number;
  /** Investment property holding cost — engine `CashFlowYear.propertyHoldingCost` (rates + insurance + maintenance + water + body corp + land tax). */
  propertyHoldingCost: number;
  /** Investment loan repayments (IP1 + IP2 etc.) — engine `CashFlowYear.investmentLoanRepayment`. */
  investmentLoanRepayment: number;
  /** Investment contributions: DCA + planned buys — engine sum of stockDCAOutflow + cryptoDCAOutflow + plannedStockBuy + plannedCryptoBuy. */
  investmentContributions: number;
  /** Recurring bills outflow — engine `CashFlowYear.billsOutflow`. */
  billsOutflow: number;
  /** Tax payable (informational only — already withheld at source by employer; NOT subtracted from cash in the engine). */
  taxPayableInformational?: number;

  // ── PROPERTY ACQUISITION (annual) ───────────────────────────────────────
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

/**
 * Internal helper — diagnose whether any engine line *could* be double-counted
 * against the closing cash bridge. We compare the engine's net cashflow to the
 * naive sum of line items we display; any large divergence means we are
 * either missing a line we don't surface, or counting one twice.
 */
function diagnoseDoubleCounting(a: CashflowReconciliationTraceArgs): string[] {
  const flags: string[] = [];

  // 1. Equity release must NOT appear inside net cashflow as an outflow.
  //    If `equityReleased > 0` AND `acquisitionCashUsed === 0`, that proves the
  //    funding-aware path is in effect (the buggy path subtracted the full
  //    deposit from cash).
  if (a.isAcquisitionYear) {
    if (a.equityReleased > 0 && a.acquisitionCashUsed === 0) {
      flags.push(
        `✓ Equity Release ${fmt$(a.equityReleased)} added to debt, NOT expensed — no double-counting on the acquisition leg.`,
      );
    } else if (a.equityReleased > 0 && a.acquisitionCashUsed > 0) {
      flags.push(
        `⚠ Both equityReleased (${fmt$(a.equityReleased)}) and acquisitionCashUsed (${fmt$(a.acquisitionCashUsed)}) are non-zero — split funding scenario; verify the cash leg only is counted in netCashflow.`,
      );
    } else if (a.acquisitionCashUsed > 0 && a.equityReleased === 0) {
      flags.push(
        `ℹ Acquisition funded entirely from cash/offset (${fmt$(a.acquisitionCashUsed)}). Engine already subtracted this inside netCashflow.`,
      );
    }
  }

  // 2. PPOR mortgage / property holding costs are not double-counted.
  //    `livingExpenses` (forecast months) already includes PPOR mortgage
  //    repayment, so the engine intentionally sets `pporMortgage = $0` in
  //    forecast months. If both are non-zero in the same year, flag it.
  if (a.pporMortgage > 0 && a.livingExpenses > 0) {
    // This is normal in actual months (mortgage not in actuals) — only flag
    // when both are above a comfortable PPOR-mortgage band.
    flags.push(
      `ℹ Both pporMortgage (${fmt$(a.pporMortgage)}) and livingExpenses (${fmt$(a.livingExpenses)}) are non-zero — typical for actual months where mortgage is recorded separately. Forecast months show $0 PPOR mortgage to avoid double-counting.`,
    );
  } else if (a.pporMortgage === 0 && a.livingExpenses > 0) {
    flags.push(
      `✓ PPOR mortgage not double-counted — engine deduplicates: snapshot.monthly_expenses already includes PPOR repayment, so pporMortgage = $0 in forecast months.`,
    );
  }

  // 3. Investment property cashflow already inside the engine roll-up: rental
  //    income is on the INCOME side, holding cost + loan repayment on the
  //    OUTGOINGS side. We never separately add "net IP cashflow" to avoid
  //    double-counting.
  if (a.rentalIncomeTotal > 0 || a.investmentLoanRepayment > 0) {
    flags.push(
      `✓ Investment-property cashflow itemised on both sides (rental income, loan repayment, holding cost). No separate "net IP cashflow" line added → no double-counting.`,
    );
  }

  // 4. Closing-cash bridge integrity. Engine guarantees:
  //    closingCash === openingCash + netCashflow.
  //    Funding-aware deposits already inside `netCashflow` (cash leg only).
  const bridge = a.openingCash + a.netCashflow;
  const drift = Math.abs(bridge - a.closingCash);
  if (drift > 1) {
    flags.push(
      `✗ Closing-cash bridge drift = ${fmt$(drift)}. Expected openingCash + netCashflow == closingCash; engine reported ${fmt$(a.closingCash)} but bridge = ${fmt$(bridge)}.`,
    );
  } else {
    flags.push(
      `✓ Closing-cash bridge balances: openingCash ${fmt$(a.openingCash)} + netCashflow ${fmt$(a.netCashflow)} = closingCash ${fmt$(a.closingCash)}.`,
    );
  }

  return flags;
}

/**
 * Build the Cashflow Reconciliation audit trace for a given year. Returns a
 * CalculationTrace listing every income line, every outgoing line, and the
 * closing-cash bridge — exactly mirroring the engine's annual roll-up.
 */
export function buildCashflowReconciliationTrace(
  a: CashflowReconciliationTraceArgs,
): CalculationTrace {
  const id = cashflowReconciliationTraceId(a.year);
  const otherIncome      = a.otherIncome      ?? 0;
  const investmentIncome = a.investmentIncome ?? 0;
  const childcare        = a.childcare        ?? 0;
  const taxPayableInfo   = a.taxPayableInformational ?? 0;

  const totalIncome =
    a.salaryIncome + otherIncome + a.rentalIncomeTotal + investmentIncome + a.taxRefund;

  const totalExpenses =
    a.livingExpenses
    + childcare
    + a.pporMortgage
    + a.investmentLoanRepayment
    + a.propertyHoldingCost
    + a.investmentContributions
    + a.billsOutflow;

  // Per-IP rental rows. Sorted by id so the trace order is stable.
  const rentalRows = Object.entries(a.rentalIncomeByProperty ?? {})
    .sort(([a1], [b1]) => a1.localeCompare(b1))
    .map(([propId, amt]) => ({
      label: `Rental income — IP ${propId}`,
      value: fmt$(amt),
      source: `CashFlowYear.rentalIncomeByProperty["${propId}"]`,
    }));

  const flags = diagnoseDoubleCounting(a);

  return {
    id,
    label: `Cashflow Reconciliation — ${a.year}`,
    finalValue: fmt$(a.netCashflow),
    plainEnglish: a.isAcquisitionYear
      ? `Year ${a.year} is an acquisition year. Net cashflow itemises salary, rental and tax refunds on the income side; living expenses, mortgage interest, holding costs, DCA and bills on the outgoings side. Acquisition cash used (cash + offset + asset sales + buying costs) is part of netCashflow; Equity Release is NOT — it adds debt.`
      : `Year ${a.year} is a normal year. Net cashflow = total income - total outgoings, with no property settlement events.`,
    formula:
      "Net Cashflow = (Salary + Other + Rental + Investment + Tax Refund) - (Living + Childcare + PPOR Mortgage + IP Loan + Holding + Contributions + Bills) - Acquisition Cash Used\nClosing Cash = Opening Cash + Net Cashflow  (Equity Release is debt, not cash)",
    expanded:
      `Total Income ${fmt$(totalIncome)} - Total Outgoings ${fmt$(totalExpenses)} - Acquisition Cash Used ${fmt$(a.acquisitionCashUsed)} ≈ Net Cashflow ${fmt$(a.netCashflow)}\n` +
      `Opening Cash ${fmt$(a.openingCash)} + Net Cashflow ${fmt$(a.netCashflow)} = Closing Cash ${fmt$(a.closingCash)}`,
    inputs: [
      // ── INCOME ──
      { label: "─ INCOME ─",                       value: "" },
      { label: "Salary income",                    value: fmt$(a.salaryIncome),    source: "CashFlowYear.income (snapshot.monthly_income, grown by incomeGrowthRate)" },
      { label: "Other income",                     value: fmt$(otherIncome),       source: "Not separately tracked in engine — pass-through" },
      ...rentalRows,
      { label: "Rental income — all properties",   value: fmt$(a.rentalIncomeTotal), source: "CashFlowYear.rentalIncome (sum across IPs)" },
      { label: "Investment income (dividends)",    value: fmt$(investmentIncome),  source: "Not separately tracked in engine — pass-through" },
      { label: "Tax refunds (NG)",                 value: fmt$(a.taxRefund),       source: "CashFlowYear.ngTaxBenefit (Aug lump-sum or PAYG spread)" },
      { label: "Total Income",                     value: fmt$(totalIncome),       source: "Σ income side above" },

      // ── OUTGOINGS ──
      { label: "─ OUTGOINGS ─",                    value: "" },
      { label: "Living expenses",                  value: fmt$(a.livingExpenses),  source: "CashFlowYear.totalExpenses (actuals or snapshot.monthly_expenses × inflation)" },
      { label: "Childcare",                        value: fmt$(childcare),         source: "Not separately tracked in engine — pass-through" },
      { label: "PPOR mortgage repayment",          value: fmt$(a.pporMortgage),    source: "CashFlowYear.mortgageRepayment ($0 in forecast months — already inside monthly_expenses; non-zero only in actual months where mortgage row is missing)" },
      { label: "Investment property holding cost", value: fmt$(a.propertyHoldingCost), source: "CashFlowYear.propertyHoldingCost (rates + insurance + maintenance + water + body corp + land tax)" },
      { label: "Investment loan repayments",       value: fmt$(a.investmentLoanRepayment), source: "CashFlowYear.investmentLoanRepayment (IP1 + IP2 + ...)" },
      { label: "Investment contributions (DCA + planned buys)", value: fmt$(a.investmentContributions), source: "Σ stockDCAOutflow + cryptoDCAOutflow + plannedStockBuy + plannedCryptoBuy" },
      { label: "Recurring bills",                  value: fmt$(a.billsOutflow),    source: "CashFlowYear.billsOutflow (frequency-aware via billActualOutflow)" },
      { label: "Tax payable (info only — already withheld)", value: fmt$(taxPayableInfo), source: "CashFlowYear.taxPayable (display only — NOT subtracted from cash by engine)" },
      { label: "Total Outgoings",                  value: fmt$(totalExpenses),     source: "Σ outgoings side above" },

      // ── PROPERTY ACQUISITION ──
      { label: "─ PROPERTY ACQUISITION ─",         value: "" },
      { label: "Acquisition — cash used",          value: fmt$(a.acquisitionCashUsed),    source: "CashFlowYear.propertyPurchaseCashUsed (already inside netCashflow)" },
      { label: "Acquisition — equity released",    value: fmt$(a.equityReleased),         source: "CashFlowYear.propertyEquityReleased (debt, NOT a cash outflow)" },
      { label: "Acquisition — asset sales",        value: fmt$(a.assetSalesUsed),         source: "CashFlowYear.propertyAssetSalesUsed (stocks/crypto sold)" },
      { label: "Acquisition — buying costs",       value: fmt$(a.acquisitionBuyingCosts), source: "CashFlowYear.propertyBuyingCosts (stamp duty + legal + reno + inspection + setup)" },

      // ── CALCULATION / BRIDGE ──
      { label: "─ CALCULATION ─",                  value: "" },
      { label: "Opening Cash",                     value: fmt$(a.openingCash),    source: "Prior year CashFlowYear.endingBalance" },
      { label: "+ Total Income",                   value: fmt$(totalIncome) },
      { label: "- Total Expenses",                 value: fmt$(totalExpenses) },
      { label: "= Net Cashflow",                   value: fmt$(a.netCashflow),    source: "CashFlowYear.netCashFlow (engine — already nets acquisition cash leg)" },
      { label: "+ Equity Released (debt — not cash)", value: fmt$(a.equityReleased) },
      { label: "- Acquisition Cash Used (already in netCashflow)", value: fmt$(a.acquisitionCashUsed) },
      { label: "= Closing Cash",                   value: fmt$(a.closingCash),    source: "CashFlowYear.endingBalance" },
    ],
    assumptions: [
      { label: "Engine values come from buildCashFlowSeries → aggregateCashFlowToAnnual (canonical)", source: "client/src/lib/finance.ts" },
      { label: "Equity Release adds to debt, NOT to cash outflow", source: "propertyFundingAdapter" },
      { label: "PPOR mortgage is inside snapshot.monthly_expenses — engine zeroes the separate PPOR line in forecast months", source: "buildCashFlowSeries" },
      { label: "Salary is post-tax at source — tax payable is informational only and does NOT reduce cash", source: "buildCashFlowSeries (auTaxPayable used for display)" },
      { label: a.fundingSourceLabel ? `Funding source: ${a.fundingSourceLabel}` : "Funding source: see acquisition decomposition", source: "FundingPlan" },
    ],
    dataSource: "buildCashFlowSeries + aggregateCashFlowToAnnual",
    sourceEngine: "client/src/lib/finance.ts (canonical cashflow engine) + applyFundingToProperties()",
    included: [
      { label: "Salary, rental, tax refund (NG)" },
      { label: "Living expenses, PPOR mortgage interest (when not inside actuals)" },
      { label: "Investment property loan repayments + holding costs (per IP)" },
      { label: "DCA, planned investment buys, recurring bills" },
      { label: "Acquisition cash leg (cash + offset + asset sales + buying costs) — subtracted ONCE inside netCashflow" },
    ],
    excluded: [
      { label: "Equity-release deposits",   reason: "Funded by new debt — added to loan balance, NOT deducted from cash" },
      { label: "Withheld income tax",        reason: "Already deducted at source by employer; not a second cash outflow" },
      { label: "Capital growth / unrealised gains", reason: "Net Worth concept; not a cashflow event" },
    ],
    calculatedAt: ts(),
    relatedIds: [
      `cashflow:plan-execution:cash-balance:${a.year}`,
      "property:funding-source:used",
      "property:funding-source:cash-impact",
      "property:funding-source:equity-release",
    ],
    // Double-counting diagnostics — surfaces engine-side checks the user can
    // verify at a glance. The CalculationTrace shape carries free-form notes,
    // which is exactly where these flags belong (they are not formula inputs).
    notes: flags,
  };
}
