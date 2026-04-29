/**
 * forecastEngine.ts
 *
 * Central entry point for all forecast calculations.
 * Combines: snapshot, properties (with settlement dates), stocks, crypto,
 * planned transactions, recurring bills, budgets, and assumptions.
 *
 * Now supports three forecast modes:
 *   - 'profile'       → use single assumption set (conservative/moderate/aggressive)
 *   - 'year-by-year'  → use per-year assumptions from forecastStore
 *   - 'monte-carlo'   → use median from last MC run, or fall back to profile
 *
 * Used by: timeline.tsx, wealth-strategy.tsx, dashboard.tsx, reports.tsx
 */

import {
  buildCashFlowSeries,
  projectNetWorth,
  aggregateCashFlowToAnnual,
  type CashFlowMonth,
  type CashFlowYear,
  type YearlyProjection,
} from './finance';
import type { YearAssumptions } from './forecastStore';

export interface ForecastInput {
  snapshot: any;
  properties: any[];
  stocks: any[];
  cryptos: any[];
  stockTransactions: any[];
  cryptoTransactions: any[];
  bills: any[];
  expenses?: any[];
  stockDCASchedules?: any[];
  cryptoDCASchedules?: any[];
  plannedStockOrders?: any[];
  plannedCryptoOrders?: any[];
  // Standard flat assumptions (used in profile mode or as fallback)
  assumptions: {
    inflation?: number;
    ppor_growth?: number;
    prop_growth?: number;
    stock_return?: number;
    crypto_return?: number;
    income_growth?: number;
    expense_growth?: number;
  };
  // Per-year overrides — when provided, override flat assumptions year-by-year
  yearlyAssumptions?: YearAssumptions[];
  // Australian Negative Gearing
  ngRefundMode?: 'lump-sum' | 'payg';
  ngAnnualBenefit?: number;    // total NG tax benefit per year (from calcNegativeGearing)
  annualSalaryIncome?: number; // gross annual salary
}

export interface ForecastOutput {
  monthly: CashFlowMonth[];
  annual: CashFlowYear[];
  netWorth: YearlyProjection[];
}

// ─── Resolve effective assumptions for a given year ───────────────────────────
// If yearlyAssumptions is provided, pick the matching row; else use flat assumptions.

function resolveYearAssumptions(
  year: number,
  flat: ForecastInput['assumptions'],
  yearly: YearAssumptions[] | undefined
): { inflation: number; ppor_growth: number; income_growth: number } {
  if (yearly && yearly.length > 0) {
    const row = yearly.find(r => r.year === year) ?? yearly[0];
    return {
      inflation:     row.inflation,
      ppor_growth:   row.property_growth,
      income_growth: row.income_growth,
    };
  }
  return {
    inflation:     flat.inflation    ?? 3,
    ppor_growth:   flat.ppor_growth  ?? 6,
    income_growth: flat.income_growth ?? 3.5,
  };
}

export function buildForecast(input: ForecastInput): ForecastOutput {
  const {
    snapshot, properties, stocks, cryptos,
    stockTransactions, cryptoTransactions, bills, assumptions,
    expenses, stockDCASchedules, cryptoDCASchedules,
    plannedStockOrders, plannedCryptoOrders,
    yearlyAssumptions,
  } = input;

  // Only planned transactions (don't double-count actuals which are in expenses)
  const plannedStockTx  = (stockTransactions  ?? []).filter((t: any) => t.status === 'planned');
  const plannedCryptoTx = (cryptoTransactions ?? []).filter((t: any) => t.status === 'planned');

  // For the cash flow series we use the first year's assumptions (or flat)
  // The monthly engine doesn't yet support per-month assumptions,
  // so we use the first active year's values as the base.
  const currentYear = new Date().getFullYear();
  const firstYearAss = resolveYearAssumptions(currentYear + 1, assumptions, yearlyAssumptions);

  const monthly = buildCashFlowSeries({
    snapshot,
    expenses:             expenses         ?? [],
    properties,
    stockTransactions:    plannedStockTx,
    cryptoTransactions:   plannedCryptoTx,
    stockDCASchedules:    stockDCASchedules   ?? [],
    cryptoDCASchedules:   cryptoDCASchedules  ?? [],
    plannedStockOrders:   plannedStockOrders  ?? [],
    plannedCryptoOrders:  plannedCryptoOrders ?? [],
    bills:                bills ?? [],
    inflationRate:        firstYearAss.inflation,
    incomeGrowthRate:     firstYearAss.income_growth,
    // Australian NG
    ngRefundMode:         input.ngRefundMode,
    ngAnnualBenefit:      input.ngAnnualBenefit,
    annualSalaryIncome:   input.annualSalaryIncome,
  });

  const annual = aggregateCashFlowToAnnual(monthly);

  // projectNetWorth: pass per-year assumptions array if available
  // The engine will pick per-year growth rates when yearlyAssumptions is provided
  const netWorth = projectNetWorth({
    snapshot,
    properties,
    stocks,
    cryptos,
    stockTransactions:   plannedStockTx,
    cryptoTransactions:  plannedCryptoTx,
    stockDCASchedules:   stockDCASchedules   ?? [],
    cryptoDCASchedules:  cryptoDCASchedules  ?? [],
    plannedStockOrders:  plannedStockOrders  ?? [],
    plannedCryptoOrders: plannedCryptoOrders ?? [],
    years:               10,
    inflation:           firstYearAss.inflation,
    ppor_growth:         firstYearAss.ppor_growth,
    // Pass full yearly array — projectNetWorth will use per-year values when available
    yearlyAssumptions:   yearlyAssumptions ?? [],
  });

  return { monthly, annual, netWorth };
}

// ─── Helper: build assumptions from forecastStore state ───────────────────────
// Use this in page components that read from useForecastStore().

export function buildAssumptionsFromStore(
  mode: string,
  profile: string,
  yearlyAssumptions: YearAssumptions[],
  profileDefaults: Record<string, any>
): { assumptions: ForecastInput['assumptions']; yearlyAssumptions?: YearAssumptions[] } {
  if (mode === 'year-by-year' && yearlyAssumptions.length > 0) {
    const first = yearlyAssumptions[0];
    return {
      assumptions: {
        inflation:    first.inflation,
        ppor_growth:  first.property_growth,
        income_growth: first.income_growth,
        expense_growth: first.expense_growth,
      },
      yearlyAssumptions,
    };
  }
  const preset = profileDefaults[profile] ?? profileDefaults['moderate'];
  return {
    assumptions: {
      inflation:    preset.inflation,
      ppor_growth:  preset.property_growth,
      income_growth: preset.income_growth,
      expense_growth: preset.expense_growth,
    },
  };
}
