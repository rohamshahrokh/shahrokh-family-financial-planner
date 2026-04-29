/**
 * ledgerBuilder.ts
 *
 * Takes the flat list of CashEvents from eventProcessor and accumulates them
 * into a month-by-month ledger with:
 *
 *   - Opening cash (= previous closing cash)
 *   - All inflows grouped
 *   - All outflows grouped
 *   - Net change
 *   - Available cash  (total liquid cash)
 *   - Reserved cash   (deposit / tax / emergency fund set-asides)
 *   - Closing cash    (= available + reserved)
 *
 * This is the "one true source" for every page that displays cash.
 */

import { safeNum } from './finance';
import type { CashEvent, CashEventType } from './eventProcessor';

// ─── Ledger row (one per calendar month) ─────────────────────────────────────

export interface LedgerMonth {
  key: string;          // "YYYY-MM"
  label: string;        // "Jan 2026"
  year: number;
  month: number;
  isActual: boolean;    // true when driven by real expense data

  // Inflows
  salaryIncome:    number;
  rentalIncome:    number;
  taxRefunds:      number;
  assetSaleProc:   number;   // stock/crypto sell proceeds
  otherIncome:     number;   // dividends, bonuses, manual
  totalInflows:    number;

  // Outflows
  livingExpenses:  number;
  mortgagePpor:    number;
  mortgageIp:      number;
  debtRepayments:  number;
  propertyPurchase: number;  // deposit + stamp duty + costs (one-time)
  propertyHolding: number;   // rates, insurance, maintenance
  stockInvesting:  number;   // DCA + planned buys (outflow)
  cryptoInvesting: number;   // DCA + planned buys (outflow)
  taxPayable:      number;   // informational display only
  otherExpenses:   number;
  totalOutflows:   number;   // always positive

  // Summary
  netCashFlow:     number;   // totalInflows - totalOutflows
  openingCash:     number;   // start of month
  closingCash:     number;   // end of month = openingCash + netCashFlow
  availableCash:   number;   // closingCash - reservedCash
  reservedCash:    number;   // user-configured reserve (default $30k)

  // Events in this month (for chart markers)
  events: CashEvent[];
}

export interface LedgerYear {
  year: number;
  totalInflows:    number;
  totalOutflows:   number;
  netCashFlow:     number;
  endingCash:      number;   // December closing cash (or last month)
  avgMonthlyCF:    number;
  hasActualMonths: number;   // count of actual (non-forecast) months
}

// ─── Inflow event types ───────────────────────────────────────────────────────

const INFLOW_TYPES = new Set<CashEventType>([
  'income', 'rental_income', 'tax_refund', 'stock_sell', 'crypto_sell',
  'dividend', 'other_income',
]);

const OUTFLOW_TYPES = new Set<CashEventType>([
  'expense', 'mortgage_ppor', 'mortgage_ip', 'property_purchase',
  'property_holding', 'stock_buy', 'crypto_buy', 'dca_stock', 'dca_crypto',
  'tax_payable', 'debt_repayment', 'other_expense',
]);

// ─── Build ledger ─────────────────────────────────────────────────────────────

export interface BuildLedgerParams {
  events: CashEvent[];
  openingCash: number;
  reservedCash?: number;           // default 30_000
  actualMonthKeys?: Set<string>;   // months that have real expense data
}

export function buildLedger(params: BuildLedgerParams): LedgerMonth[] {
  const { events, openingCash, actualMonthKeys } = params;
  const reservedTarget = safeNum(params.reservedCash) || 30_000;

  // Group events by monthKey
  const byMonth = new Map<string, CashEvent[]>();
  for (const ev of events) {
    const arr = byMonth.get(ev.monthKey) ?? [];
    arr.push(ev);
    byMonth.set(ev.monthKey, arr);
  }

  // Collect all unique keys in chronological order
  const allKeys = Array.from(byMonth.keys()).sort();

  const results: LedgerMonth[] = [];
  let runningCash = safeNum(openingCash);

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  for (const key of allKeys) {
    const monthEvents = byMonth.get(key) ?? [];
    const { year, month } = parseKey(key);
    const isActual = actualMonthKeys?.has(key) ?? false;

    // Aggregate inflows
    let salaryIncome    = 0;
    let rentalIncome    = 0;
    let taxRefunds      = 0;
    let assetSaleProc   = 0;
    let otherIncome     = 0;

    // Aggregate outflows (as positive numbers internally)
    let livingExpenses  = 0;
    let mortgagePpor    = 0;
    let mortgageIp      = 0;
    let debtRepayments  = 0;
    let propertyPurchase = 0;
    let propertyHolding = 0;
    let stockInvesting  = 0;
    let cryptoInvesting = 0;
    let taxPayable      = 0;
    let otherExpenses   = 0;

    for (const ev of monthEvents) {
      // Inflows (amount already positive)
      if (ev.type === 'income')        salaryIncome  += ev.amount;
      if (ev.type === 'rental_income') rentalIncome  += ev.amount;
      if (ev.type === 'tax_refund')    taxRefunds    += ev.amount;
      if (ev.type === 'stock_sell')    assetSaleProc += ev.amount;
      if (ev.type === 'crypto_sell')   assetSaleProc += ev.amount;
      if (ev.type === 'dividend')      otherIncome   += ev.amount;
      if (ev.type === 'other_income')  otherIncome   += ev.amount;

      // Outflows (amount already negative — take abs)
      if (ev.type === 'expense')            livingExpenses   += Math.abs(ev.amount);
      if (ev.type === 'mortgage_ppor')      mortgagePpor     += Math.abs(ev.amount);
      if (ev.type === 'mortgage_ip')        mortgageIp       += Math.abs(ev.amount);
      if (ev.type === 'debt_repayment')     debtRepayments   += Math.abs(ev.amount);
      if (ev.type === 'property_purchase')  propertyPurchase += Math.abs(ev.amount);
      if (ev.type === 'property_holding')   propertyHolding  += Math.abs(ev.amount);
      if (ev.type === 'stock_buy')          stockInvesting   += Math.abs(ev.amount);
      if (ev.type === 'dca_stock')          stockInvesting   += Math.abs(ev.amount);
      if (ev.type === 'crypto_buy')         cryptoInvesting  += Math.abs(ev.amount);
      if (ev.type === 'dca_crypto')         cryptoInvesting  += Math.abs(ev.amount);
      if (ev.type === 'tax_payable')        taxPayable       += Math.abs(ev.amount);
      if (ev.type === 'other_expense')      otherExpenses    += Math.abs(ev.amount);
    }

    const totalInflows  = salaryIncome + rentalIncome + taxRefunds + assetSaleProc + otherIncome;
    const totalOutflows = livingExpenses + mortgagePpor + mortgageIp + debtRepayments
      + propertyPurchase + propertyHolding + stockInvesting + cryptoInvesting
      + taxPayable + otherExpenses;

    const netCashFlow  = totalInflows - totalOutflows;
    const openingMonth = runningCash;
    runningCash       += netCashFlow;
    const closingCash  = runningCash;

    // Reserved: target $30k buffer, can't exceed closingCash
    const reservedCash  = Math.min(reservedTarget, Math.max(0, closingCash));
    const availableCash = closingCash - reservedCash;

    results.push({
      key,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      year,
      month,
      isActual,
      salaryIncome:     Math.round(salaryIncome),
      rentalIncome:     Math.round(rentalIncome),
      taxRefunds:       Math.round(taxRefunds),
      assetSaleProc:    Math.round(assetSaleProc),
      otherIncome:      Math.round(otherIncome),
      totalInflows:     Math.round(totalInflows),
      livingExpenses:   Math.round(livingExpenses),
      mortgagePpor:     Math.round(mortgagePpor),
      mortgageIp:       Math.round(mortgageIp),
      debtRepayments:   Math.round(debtRepayments),
      propertyPurchase: Math.round(propertyPurchase),
      propertyHolding:  Math.round(propertyHolding),
      stockInvesting:   Math.round(stockInvesting),
      cryptoInvesting:  Math.round(cryptoInvesting),
      taxPayable:       Math.round(taxPayable),
      otherExpenses:    Math.round(otherExpenses),
      totalOutflows:    Math.round(totalOutflows),
      netCashFlow:      Math.round(netCashFlow),
      openingCash:      Math.round(openingMonth),
      closingCash:      Math.round(closingCash),
      availableCash:    Math.round(availableCash),
      reservedCash:     Math.round(reservedCash),
      events:           monthEvents,
    });
  }

  return results;
}

// ─── Aggregate ledger to annual ────────────────────────────────────────────────

export function aggregateLedgerToAnnual(months: LedgerMonth[]): LedgerYear[] {
  const byYear = new Map<number, LedgerYear>();

  for (const m of months) {
    if (!byYear.has(m.year)) {
      byYear.set(m.year, {
        year:          m.year,
        totalInflows:  0,
        totalOutflows: 0,
        netCashFlow:   0,
        endingCash:    0,
        avgMonthlyCF:  0,
        hasActualMonths: 0,
      });
    }
    const yr = byYear.get(m.year)!;
    yr.totalInflows  += m.totalInflows;
    yr.totalOutflows += m.totalOutflows;
    yr.netCashFlow   += m.netCashFlow;
    yr.endingCash     = m.closingCash; // last month wins
    if (m.isActual) yr.hasActualMonths++;
  }

  for (const yr of byYear.values()) {
    const monthCount = months.filter(m => m.year === yr.year).length;
    yr.avgMonthlyCF = monthCount > 0 ? yr.netCashFlow / monthCount : 0;
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function parseKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

/** Returns the closing cash balance for a specific year (Dec or last month). */
export function getCashForYear(ledger: LedgerMonth[], year: number): number | undefined {
  // Find December or last available month for that year
  const yearMonths = ledger.filter(m => m.year === year);
  if (yearMonths.length === 0) return undefined;
  return yearMonths[yearMonths.length - 1].closingCash;
}

/** Find the lowest closing cash across all forecast months (for liquidity alerts). */
export function findLowestCashMonth(ledger: LedgerMonth[]): LedgerMonth | null {
  const forecast = ledger.filter(m => !m.isActual);
  if (forecast.length === 0) return null;
  return forecast.reduce((min, m) => m.closingCash < min.closingCash ? m : min, forecast[0]);
}

/** Find months with a significant one-time event (property buy, large stock order, etc.). */
export function findMajorEvents(ledger: LedgerMonth[], minAmount = 10_000): CashEvent[] {
  const major: CashEvent[] = [];
  for (const m of ledger) {
    for (const ev of m.events) {
      if (Math.abs(ev.amount) >= minAmount && [
        'property_purchase', 'stock_buy', 'crypto_buy',
        'stock_sell', 'crypto_sell', 'tax_refund',
      ].includes(ev.type)) {
        major.push(ev);
      }
    }
  }
  return major;
}
