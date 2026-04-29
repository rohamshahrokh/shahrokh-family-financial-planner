/**
 * cashEngine.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║         CENTRAL CASH ENGINE — Single Source of Truth                ║
 * ║                                                                      ║
 * ║  ALL pages that display cash balances, net worth projections, or     ║
 * ║  cash flow charts MUST use this engine.                              ║
 * ║                                                                      ║
 * ║  Architecture:                                                       ║
 * ║    1. processEvents()  → flat list of CashEvents (event-driven)      ║
 * ║    2. buildLedger()    → monthly ledger (Opening → Closing)          ║
 * ║    3. evaluateLiquidity() → warnings + smart actions                 ║
 * ║                                                                      ║
 * ║  Monthly Ledger Structure (per month):                               ║
 * ║    Opening Cash                                                      ║
 * ║    + Inflows  (salary, rental, tax refund, asset sales)              ║
 * ║    − Outflows (expenses, mortgage, DCA, property costs, investing)   ║
 * ║    = Closing Cash                                                    ║
 * ║    → Dual model: Available Cash + Reserved Cash                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   import { runCashEngine } from '@/lib/cashEngine';
 *   const result = runCashEngine({ snapshot, properties, ... });
 *   // result.ledger   → LedgerMonth[]
 *   // result.annual   → LedgerYear[]
 *   // result.liquidity → LiquidityReport
 *   // result.cashByYear → Map<year, closingCash>
 */

import {
  processEvents,
  type ProcessEventsParams,
  type CashEvent,
} from './eventProcessor';

import {
  buildLedger,
  aggregateLedgerToAnnual,
  type LedgerMonth,
  type LedgerYear,
} from './ledgerBuilder';

import {
  evaluateLiquidity,
  type LiquidityReport,
} from './liquidityRules';

import { safeNum } from './mathUtils';

// ─── Public input type ────────────────────────────────────────────────────────

export interface CashEngineInput {
  snapshot: {
    cash: number;
    monthly_income: number;
    monthly_expenses: number;
    mortgage: number;
    other_debts: number;
  };
  properties: any[];
  stocks?: any[];
  cryptos?: any[];
  stockTransactions?: any[];
  cryptoTransactions?: any[];
  stockDCASchedules?: any[];
  cryptoDCASchedules?: any[];
  plannedStockOrders?: any[];
  plannedCryptoOrders?: any[];
  bills?: any[];
  expenses?: any[];             // tracked actual expense rows
  inflationRate?: number;       // % annual, default 3
  incomeGrowthRate?: number;    // % annual, default 3.5
  ngRefundMode?: 'lump-sum' | 'payg';
  ngAnnualBenefit?: number;
  annualSalaryIncome?: number;
  reservedCash?: number;        // emergency buffer to keep reserved, default $30k
}

// ─── Public output type ───────────────────────────────────────────────────────

export interface CashEngineOutput {
  /** Full month-by-month ledger (Jan 2025 → Dec 2035) */
  ledger: LedgerMonth[];
  /** Annual aggregates */
  annual: LedgerYear[];
  /** Liquidity warnings + smart actions */
  liquidity: LiquidityReport;
  /** Convenience lookup: year → December closing cash */
  cashByYear: Map<number, number>;
  /** All raw events (for debugging / event markers) */
  events: CashEvent[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runCashEngine(input: CashEngineInput): CashEngineOutput {
  const {
    snapshot,
    properties = [],
    stockTransactions = [],
    cryptoTransactions = [],
    stockDCASchedules = [],
    cryptoDCASchedules = [],
    plannedStockOrders = [],
    plannedCryptoOrders = [],
    bills = [],
    expenses = [],
    inflationRate,
    incomeGrowthRate,
    ngRefundMode,
    ngAnnualBenefit,
    annualSalaryIncome,
    reservedCash,
  } = input;

  // Build actual month keys set (for isActual tracking)
  const actualMonthKeys = new Set<string>();
  for (const exp of expenses) {
    if (exp?.date) actualMonthKeys.add(exp.date.substring(0, 7));
  }

  // Filter to planned-only transactions (actuals are in expenses, avoid double-counting)
  const plannedStockTx  = stockTransactions.filter((t: any)  => t.status === 'planned');
  const plannedCryptoTx = cryptoTransactions.filter((t: any) => t.status === 'planned');

  // 1. Process all events into a flat list
  const eventParams: ProcessEventsParams = {
    snapshot: {
      cash:             safeNum(snapshot.cash),
      monthly_income:   safeNum(snapshot.monthly_income),
      monthly_expenses: safeNum(snapshot.monthly_expenses),
      mortgage:         safeNum(snapshot.mortgage),
      other_debts:      safeNum(snapshot.other_debts),
    },
    properties:          properties as any[],
    stockTransactions:   plannedStockTx,
    cryptoTransactions:  plannedCryptoTx,
    stockDCASchedules:   stockDCASchedules,
    cryptoDCASchedules:  cryptoDCASchedules,
    plannedStockOrders:  plannedStockOrders,
    plannedCryptoOrders: plannedCryptoOrders,
    bills,
    expenses,
    inflationRate,
    incomeGrowthRate,
    ngRefundMode,
    ngAnnualBenefit,
    annualSalaryIncome,
  };

  const events = processEvents(eventParams);

  // 2. Build monthly ledger
  const ledger = buildLedger({
    events,
    openingCash:      safeNum(snapshot.cash),
    reservedCash:     reservedCash ?? 30_000,
    actualMonthKeys,
  });

  // 3. Aggregate to annual
  const annual = aggregateLedgerToAnnual(ledger);

  // 4. Evaluate liquidity
  const liquidity = evaluateLiquidity(ledger, reservedCash ?? 30_000);

  // 5. Build year → closingCash map (December or last available month)
  const cashByYear = new Map<number, number>();
  for (const m of ledger) {
    cashByYear.set(m.year, m.closingCash); // last month of year wins
  }

  return { ledger, annual, liquidity, cashByYear, events };
}

// ─── Convenience: get cash for a specific year ────────────────────────────────

export function getCashForYear(output: CashEngineOutput, year: number): number {
  return output.cashByYear.get(year) ?? 0;
}

// ─── Convenience: get dashboard KPI cards ─────────────────────────────────────

export interface CashKPICards {
  currentCash:         number;
  forecastCash2030:    number;
  forecastCash2035:    number;
  lowestFutureCash:    number;
  lowestFutureMonth:   string;
  nextMajorEvent:      string;
  bufferStatus:        'healthy' | 'at_risk' | 'depleted';
  bufferStatusLabel:   string;
}

export function getCashKPICards(
  output: CashEngineOutput,
  currentCash: number,
): CashKPICards {
  const { liquidity } = output;
  const bufferLabels = {
    healthy:  '✓ Buffer healthy',
    at_risk:  '⚠ Buffer at risk',
    depleted: '⚠ Buffer depleted',
  };

  return {
    currentCash,
    forecastCash2030:  liquidity.forecastCash2030,
    forecastCash2035:  liquidity.forecastCash2035,
    lowestFutureCash:  liquidity.lowestCashAmount,
    lowestFutureMonth: liquidity.lowestCashMonth?.label ?? '—',
    nextMajorEvent:    liquidity.nextMajorEvent
      ? `${liquidity.nextMajorEvent.icon ?? ''} ${liquidity.nextMajorEvent.label} (${liquidity.nextMajorEvent.monthKey})`
      : 'None planned',
    bufferStatus:      liquidity.emergencyBufferStatus,
    bufferStatusLabel: bufferLabels[liquidity.emergencyBufferStatus],
  };
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export type { LedgerMonth, LedgerYear } from './ledgerBuilder';
export type { LiquidityReport, LiquidityWarning, SmartAction } from './liquidityRules';
export type { CashEvent, CashEventType } from './eventProcessor';
