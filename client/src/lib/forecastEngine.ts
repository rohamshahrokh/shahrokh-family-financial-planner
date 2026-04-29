/**
 * forecastEngine.ts
 * 
 * Central entry point for all forecast calculations.
 * Combines: snapshot, properties (with settlement dates), stocks, crypto,
 * planned transactions, recurring bills, budgets, and assumptions.
 * 
 * Used by: timeline.tsx, wealth-strategy.tsx, dashboard.tsx
 */

import {
  buildCashFlowSeries,
  projectNetWorth,
  aggregateCashFlowToAnnual,
  type CashFlowMonth,
  type CashFlowYear,
  type YearlyProjection,
} from './finance';

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
  assumptions: {
    inflation?: number;
    ppor_growth?: number;
    prop_growth?: number;
    stock_return?: number;
    crypto_return?: number;
    income_growth?: number;
  };
}

export interface ForecastOutput {
  monthly: CashFlowMonth[];
  annual: CashFlowYear[];
  netWorth: YearlyProjection[];
}

export function buildForecast(input: ForecastInput): ForecastOutput {
  const {
    snapshot, properties, stocks, cryptos,
    stockTransactions, cryptoTransactions, bills, assumptions,
    expenses, stockDCASchedules, cryptoDCASchedules,
    plannedStockOrders, plannedCryptoOrders,
  } = input;

  // Only planned transactions (don't double-count actuals which are in expenses)
  const plannedStockTx = (stockTransactions ?? []).filter((t: any) => t.status === 'planned');
  const plannedCryptoTx = (cryptoTransactions ?? []).filter((t: any) => t.status === 'planned');

  const monthly = buildCashFlowSeries({
    snapshot,
    expenses: expenses ?? [],
    properties,
    stockTransactions: plannedStockTx,
    cryptoTransactions: plannedCryptoTx,
    stockDCASchedules: stockDCASchedules ?? [],
    cryptoDCASchedules: cryptoDCASchedules ?? [],
    plannedStockOrders: plannedStockOrders ?? [],
    plannedCryptoOrders: plannedCryptoOrders ?? [],
    bills: bills ?? [],
    inflationRate: assumptions.inflation ?? 3,
    incomeGrowthRate: assumptions.income_growth ?? 3.5,
  });

  const annual = aggregateCashFlowToAnnual(monthly);

  const netWorth = projectNetWorth({
    snapshot,
    properties,
    stocks,
    cryptos,
    stockTransactions: plannedStockTx,
    cryptoTransactions: plannedCryptoTx,
    stockDCASchedules: stockDCASchedules ?? [],
    cryptoDCASchedules: cryptoDCASchedules ?? [],
    plannedStockOrders: plannedStockOrders ?? [],
    plannedCryptoOrders: plannedCryptoOrders ?? [],
    years: 10,
    inflation: assumptions.inflation ?? 3,
    ppor_growth: assumptions.ppor_growth ?? 6,
  });

  return { monthly, annual, netWorth };
}
