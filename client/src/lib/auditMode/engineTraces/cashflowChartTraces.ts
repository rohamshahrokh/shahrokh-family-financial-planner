/**
 * cashflowChartTraces.ts — Per-year cash-balance audit trace for the Plan
 * Execution Capacity / Cashflow chart.
 *
 * #FWL_Remaining_Bug_CashflowChart_Ignores_FundingSource
 *
 * Why this trace exists
 * ---------------------
 * The Plan Execution Capacity chart used to subtract a property's full
 * `deposit` from cash at the settlement year, even when the user funded that
 * deposit via Equity Release. That collapsed the 2028 cash point even though
 * Equity Release adds debt — not a cash drawdown.
 *
 * The fix routes `buildCashFlowSeries` through `applyFundingToProperties` so
 * `propertyDeposit` already reflects the cash-like portion only. This trace
 * proves the year used the canonical funding-aware path by showing
 * `propertyPurchaseCashUsed`, `propertyEquityReleased`, and
 * `propertyAssetSalesUsed` directly on the audit panel.
 */

import type { CalculationTrace } from "../calculationTrace";
import type { CashFlowYear } from "@/lib/finance";

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const ts = () => new Date().toISOString();

/** Stable trace id for a specific year on the cashflow chart. */
export function cashflowYearTraceId(year: number): string {
  return `cashflow:plan-execution:cash-balance:${year}`;
}

export interface CashflowYearTraceArgs {
  year: number;
  openingCash: number;
  /** From CashFlowYear.endingBalance. */
  closingCash: number;
  /** From CashFlowYear.netCashFlow. */
  netCashflow: number;
  /** From CashFlowYear.propertyPurchaseCashUsed (cash + offset deposit portion). */
  propertyPurchaseCashUsed: number;
  /** From CashFlowYear.propertyEquityReleased. */
  propertyEquityReleased: number;
  /** From CashFlowYear.propertyAssetSalesUsed. */
  propertyAssetSalesUsed: number;
  /** Optional acquisition costs (stamp duty etc.) — informational only. */
  propertyBuyingCosts?: number;
  /** Whether this year hosts an IP settlement event. */
  isAcquisitionYear: boolean;
}

/**
 * Build the per-year cashflow audit trace. Returns a CalculationTrace that
 * cleanly explains the funding-source decomposition for that year.
 */
export function buildCashflowYearTrace(a: CashflowYearTraceArgs): CalculationTrace {
  const id = cashflowYearTraceId(a.year);
  const buyingCosts = a.propertyBuyingCosts ?? 0;

  return {
    id,
    label: `Cashflow — ${a.year}`,
    finalValue: fmt$(a.closingCash),
    plainEnglish: a.isAcquisitionYear
      ? "Closing cash for this year reflects net cashflow PLUS the resolved funding source for any property that settles in this year. Equity-Release deposits do NOT subtract cash — they add debt. Asset-Sale deposits liquidate stocks/crypto. Only cash + offset deposits actually draw down liquid cash."
      : "Closing cash for this year = opening cash + net cashflow. No property settlement events in this year.",
    formula: "Closing Cash = Opening Cash + Net Cashflow (deposits already net of funding source)",
    expanded:
      `${fmt$(a.openingCash)} + ${fmt$(a.netCashflow)} = ${fmt$(a.closingCash)}`,
    inputs: [
      { label: "Opening cash",                      value: fmt$(a.openingCash),               source: "buildCashFlowSeries (prior year ending balance)" },
      { label: "Net cashflow (year)",               value: fmt$(a.netCashflow),               source: "CashFlowYear.netCashFlow" },
      { label: "Property purchase — cash used",     value: fmt$(a.propertyPurchaseCashUsed),  source: "FundingPlan.cashUsed + offsetUsed (after applyFundingToProperties)" },
      { label: "Property purchase — equity released", value: fmt$(a.propertyEquityReleased), source: "FundingPlan.equityReleased (does NOT reduce cash)" },
      { label: "Property purchase — asset sales",   value: fmt$(a.propertyAssetSalesUsed),    source: "FundingPlan.stocksSold + cryptoSold" },
      { label: "Property buying costs (incl.)",     value: fmt$(buyingCosts),                 source: "Σ stamp duty + legal + reno + inspection + setup" },
      { label: "Closing cash",                      value: fmt$(a.closingCash),               source: "CashFlowYear.endingBalance" },
    ],
    assumptions: [
      { label: "Cashflow series uses funded property records", source: "buildCashFlowSeries → applyFundingToProperties (canonical)" },
      { label: "Equity Release adds to debt, NOT a cash outflow", source: "propertyFundingAdapter" },
      { label: "Asset Sales realise cash from stocks/crypto holdings", source: "propertyFundingAdapter" },
    ],
    dataSource: "buildCashFlowSeries + aggregateCashFlowToAnnual",
    sourceEngine: "client/src/lib/finance.ts → applyFundingToProperties()",
    included: [
      { label: "Income, rental, NG refund" },
      { label: "Operating expenses + mortgage repayments" },
      { label: "Cash-like property deposits (cash + offset + asset sales)" },
      { label: "Stamp duty + acquisition costs (always cash)" },
    ],
    excluded: [
      { label: "Equity-release deposits", reason: "Funded by new debt — added to loan balance, not deducted from cash" },
    ],
    calculatedAt: ts(),
    relatedIds: [
      "property:funding-source:used",
      "property:funding-source:cash-impact",
      "property:funding-source:equity-release",
    ],
  };
}
