/**
 * eventProcessor.ts
 *
 * Event-driven cash event system.
 * Every planned action (property purchase, stock buy, tax refund, asset sale, DCA, etc.)
 * is registered as a CashEvent and processed month-by-month into the ledger.
 *
 * This is the heart of the "event-driven" design: no annual shortcuts,
 * no % heuristics — every dollar hits the exact calendar month it belongs to.
 */

import { safeNum, dcaMonthlyEquiv, calcMonthlyRepayment } from './mathUtils';

// ─── Event Types ──────────────────────────────────────────────────────────────

export type CashEventType =
  | 'income'              // salary, bonus, other income
  | 'expense'             // living expenses, bills, childcare
  | 'rental_income'       // net rental from investment property
  | 'mortgage_ppor'       // PPOR mortgage repayment
  | 'mortgage_ip'         // investment property loan repayment
  | 'property_purchase'   // deposit + stamp duty + costs (one-time)
  | 'property_holding'    // ongoing monthly holding costs (rates, insurance, maint)
  | 'stock_buy'           // planned stock purchase (cash out)
  | 'stock_sell'          // planned stock sale (cash in)
  | 'crypto_buy'          // planned crypto purchase (cash out)
  | 'crypto_sell'         // planned crypto sale (cash in)
  | 'dca_stock'           // recurring DCA into stocks
  | 'dca_crypto'          // recurring DCA into crypto
  | 'tax_refund'          // ATO refund (NG lump-sum Aug or PAYG monthly)
  | 'tax_payable'         // tax payable (informational — employer withholds from salary)
  | 'debt_repayment'      // personal loan / credit card repayment
  | 'dividend'            // dividend income
  | 'other_income'        // manual one-time income entry
  | 'other_expense';      // manual one-time expense entry

/** A single cash event — one-time or recurring — with a direction sign encoded in amount. */
export interface CashEvent {
  /** ISO "YYYY-MM" key for the month this fires */
  monthKey: string;
  year: number;
  month: number;
  type: CashEventType;
  /** Positive = inflow, Negative = outflow */
  amount: number;
  /** Human-readable label shown on event markers */
  label: string;
  /** Optional: property/stock/crypto name */
  assetName?: string;
  /** Recurring: keep firing each month until endKey (inclusive) */
  recurring?: boolean;
  endKey?: string;
  /** For liquidity marker visual */
  icon?: '🏠' | '₿' | '📈' | '💰' | '💳' | '⚠' | '📉' | '🔁';
}

// ─── Input shapes ─────────────────────────────────────────────────────────────

export interface SnapshotForEngine {
  cash: number;
  monthly_income: number;
  monthly_expenses: number;
  mortgage: number;
  other_debts: number;
}

export interface PropertyForEngine {
  id: number;
  name?: string;
  address?: string;
  type: string;                  // 'ppor' | 'investment'
  purchase_date?: string;
  settlement_date?: string;
  rental_start_date?: string;
  loan_amount: number;
  interest_rate: number;
  loan_term: number;
  loan_type: string;             // 'principal_interest' | 'interest_only'
  weekly_rent: number;
  rental_growth: number;
  vacancy_rate: number;
  management_fee: number;
  council_rates: number;
  insurance: number;
  maintenance: number;
  capital_growth: number;
  projection_years: number;
  deposit?: number;
  stamp_duty?: number;
  legal_fees?: number;
  buyer_agent_fee?: number;
  renovation_costs?: number;
  building_inspection?: number;
  loan_setup_fees?: number;
  water_rates?: number;
  body_corporate?: number;
  land_tax?: number;
}

export interface StockTransactionForEngine {
  transaction_type: string; // 'buy' | 'sell'
  status: string;           // 'planned' | 'completed'
  transaction_date: string;
  total_amount: number;
  ticker?: string;
}

export interface CryptoTransactionForEngine {
  transaction_type: string;
  status: string;
  transaction_date: string;
  total_amount: number;
  symbol?: string;
}

export interface DCAScheduleForEngine {
  enabled: boolean;
  amount: number;
  frequency: string;
  start_date: string;
  end_date?: string | null;
  asset_type?: 'stock' | 'crypto';
  label?: string;
}

export interface PlannedOrderForEngine {
  action: string;           // 'buy' | 'sell'
  amount_aud: number;
  planned_date: string;
  status: string;           // 'planned'
  asset_type?: 'stock' | 'crypto';
  name?: string;
}

export interface BillForEngine {
  amount: number;
  frequency: string;
  next_due_date?: string;
  is_active?: boolean;
  bill_name?: string;
}

export interface ExpenseForEngine {
  date: string;
  amount: number;
  category: string;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function addMonths(key: string, n: number): string {
  const { year, month } = parseMonthKey(key);
  const date = new Date(year, month - 1 + n, 1);
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

/** Returns all "YYYY-MM" keys from start to end inclusive */
export function rangeKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let cur = startKey;
  while (cur <= endKey) {
    keys.push(cur);
    cur = addMonths(cur, 1);
  }
  return keys;
}

const ENGINE_START = '2025-01';
const ENGINE_END   = '2035-12';

// ─── Main event processor ─────────────────────────────────────────────────────

export interface ProcessEventsParams {
  snapshot: SnapshotForEngine;
  properties: PropertyForEngine[];
  stockTransactions: StockTransactionForEngine[];
  cryptoTransactions: CryptoTransactionForEngine[];
  stockDCASchedules: DCAScheduleForEngine[];
  cryptoDCASchedules: DCAScheduleForEngine[];
  plannedStockOrders: PlannedOrderForEngine[];
  plannedCryptoOrders: PlannedOrderForEngine[];
  bills: BillForEngine[];
  expenses: ExpenseForEngine[];
  inflationRate?: number;       // % annual, default 3
  incomeGrowthRate?: number;    // % annual, default 3.5
  ngRefundMode?: 'lump-sum' | 'payg';
  ngAnnualBenefit?: number;     // from calcNegativeGearing total
  annualSalaryIncome?: number;
}

/**
 * Builds a flat list of ALL cash events from ENGINE_START to ENGINE_END.
 * Each event has: monthKey, type, amount (±), label.
 *
 * The ledgerBuilder then accumulates these per month.
 */
export function processEvents(params: ProcessEventsParams): CashEvent[] {
  const events: CashEvent[] = [];
  const infl  = (params.inflationRate  ?? 3)   / 100;
  const incGr = (params.incomeGrowthRate ?? 3.5) / 100;
  const s = params.snapshot;

  // Build expense lookup for actual months
  const expenseLookup = new Map<string, { total: number; hasMortgage: boolean }>();
  for (const exp of params.expenses) {
    if (!exp.date) continue;
    const key = exp.date.substring(0, 7);
    const existing = expenseLookup.get(key) || { total: 0, hasMortgage: false };
    existing.total += safeNum(exp.amount);
    if ((exp.category || '').toLowerCase().includes('mortgage')) {
      existing.hasMortgage = true;
    }
    expenseLookup.set(key, existing);
  }

  const snapMortgage = safeNum(s.mortgage) || 1_200_000;
  const pporMonthlyPmt = calcMonthlyRepayment(snapMortgage, 6.5, 30);

  const investmentProps = params.properties.filter(p => p.type !== 'ppor');

  // Iterate every month from ENGINE_START → ENGINE_END
  const allKeys = rangeKeys(ENGINE_START, ENGINE_END);
  let monthIndex = 0;

  for (const key of allKeys) {
    const { year, month } = parseMonthKey(key);
    const yearsFromStart  = monthIndex / 12;
    const isActual = expenseLookup.has(key);

    // ── 1. INCOME ──────────────────────────────────────────────────────────
    const monthlyIncome = safeNum(s.monthly_income) * Math.pow(1 + incGr, yearsFromStart) || 22_000;

    if (!isActual) {
      // Forecast month: income is salary (post-tax is already the take-home; employer withholds)
      events.push({
        monthKey: key, year, month,
        type: 'income',
        amount: monthlyIncome,
        label: 'Salary income',
        icon: '💰',
      });
    }
    // For actual months, income & expenses are captured from expense records below

    // ── 2. EXPENSES (actual or forecast) ──────────────────────────────────
    if (isActual) {
      const rec = expenseLookup.get(key)!;
      // Actual tracked expenses (negative outflow)
      events.push({
        monthKey: key, year, month,
        type: 'expense',
        amount: -rec.total,
        label: 'Tracked expenses',
      });

      // If actuals don't include mortgage, still deduct PPOR repayment
      if (!rec.hasMortgage) {
        events.push({
          monthKey: key, year, month,
          type: 'mortgage_ppor',
          amount: -pporMonthlyPmt,
          label: 'PPOR mortgage',
          icon: '🏠',
        });
      }

      // Income side: add salary since actual expenses don't cancel salary
      events.push({
        monthKey: key, year, month,
        type: 'income',
        amount: monthlyIncome,
        label: 'Salary income',
        icon: '💰',
      });
    } else {
      // Forecast expenses grow with inflation
      const forecastExpenses = safeNum(s.monthly_expenses) * Math.pow(1 + infl, yearsFromStart) || 14_540;
      events.push({
        monthKey: key, year, month,
        type: 'expense',
        amount: -forecastExpenses,
        label: 'Living expenses',
      });

      // PPOR mortgage
      events.push({
        monthKey: key, year, month,
        type: 'mortgage_ppor',
        amount: -pporMonthlyPmt,
        label: 'PPOR mortgage',
        icon: '🏠',
      });
    }

    // ── 3. RECURRING BILLS (forecast months only — not in actuals) ─────────
    if (!isActual) {
      for (const bill of params.bills) {
        if (bill.is_active === false) continue;
        const billMonthly = dcaMonthlyEquiv(safeNum(bill.amount), bill.frequency || 'monthly');
        events.push({
          monthKey: key, year, month,
          type: 'expense',
          amount: -billMonthly,
          label: bill.bill_name ? `Bill: ${bill.bill_name}` : 'Recurring bill',
          icon: '💳',
        });
      }
    }

    // ── 4. INVESTMENT PROPERTIES ───────────────────────────────────────────
    const monthDate = new Date(year, month - 1, 1);

    for (const prop of investmentProps) {
      const settleDateStr = prop.settlement_date || prop.purchase_date;
      let settleDate: Date;
      if (settleDateStr) {
        settleDate = new Date(settleDateStr);
        settleDate.setDate(1);
      } else {
        settleDate = new Date(2025, 0, 1);
      }

      let rentalStartDate: Date;
      if (prop.rental_start_date) {
        rentalStartDate = new Date(prop.rental_start_date);
        rentalStartDate.setDate(1);
      } else {
        rentalStartDate = new Date(settleDate.getFullYear(), settleDate.getMonth() + 1, 1);
      }

      const propName = prop.name || prop.address || `IP #${prop.id}`;

      // One-time purchase costs (settlement month only)
      const isSettlementMonth = (
        monthDate.getFullYear() === settleDate.getFullYear() &&
        monthDate.getMonth() === settleDate.getMonth()
      );
      if (isSettlementMonth) {
        const purchaseCost =
          safeNum(prop.deposit)
          + safeNum(prop.stamp_duty)
          + safeNum(prop.legal_fees)
          + safeNum(prop.buyer_agent_fee)
          + safeNum(prop.renovation_costs)
          + safeNum(prop.building_inspection)
          + safeNum(prop.loan_setup_fees);

        if (purchaseCost > 0) {
          events.push({
            monthKey: key, year, month,
            type: 'property_purchase',
            amount: -purchaseCost,
            label: `${propName} — purchase costs`,
            assetName: propName,
            icon: '🏠',
          });
        }
      }

      // Ongoing: loan repayments (from settlement)
      if (monthDate >= settleDate) {
        const monthlyLoanPmt = calcMonthlyRepayment(
          safeNum(prop.loan_amount),
          safeNum(prop.interest_rate) || 6.5,
          safeNum(prop.loan_term)     || 30,
        );
        events.push({
          monthKey: key, year, month,
          type: 'mortgage_ip',
          amount: -monthlyLoanPmt,
          label: `${propName} — loan repayment`,
          assetName: propName,
        });
      }

      // Rental income (from rental start date)
      if (monthDate >= rentalStartDate) {
        const monthsSinceRental =
          (monthDate.getFullYear() - rentalStartDate.getFullYear()) * 12
          + (monthDate.getMonth() - rentalStartDate.getMonth());
        const yearsSinceRental = monthsSinceRental / 12;
        const annualRent = safeNum(prop.weekly_rent) * 52
          * (1 - safeNum(prop.vacancy_rate)    / 100)
          * (1 - safeNum(prop.management_fee)  / 100)
          * Math.pow(1 + (safeNum(prop.rental_growth) || 3) / 100, yearsSinceRental);
        const monthlyRent = annualRent / 12;

        events.push({
          monthKey: key, year, month,
          type: 'rental_income',
          amount: monthlyRent,
          label: `${propName} — rental income`,
          assetName: propName,
          icon: '🏠',
        });

        // Monthly holding costs
        const monthlyHolding = (
          safeNum(prop.council_rates)
          + safeNum(prop.insurance)
          + safeNum(prop.maintenance)
          + safeNum(prop.water_rates)
          + safeNum(prop.body_corporate)
          + safeNum(prop.land_tax)
        ) / 12;
        if (monthlyHolding > 0) {
          events.push({
            monthKey: key, year, month,
            type: 'property_holding',
            amount: -monthlyHolding,
            label: `${propName} — holding costs`,
            assetName: propName,
          });
        }
      }
    }

    // ── 5. STOCK TRANSACTIONS (planned buys/sells) ─────────────────────────
    for (const tx of params.stockTransactions) {
      if (tx.status !== 'planned') continue;
      if (!tx.transaction_date) continue;
      const txKey = tx.transaction_date.substring(0, 7);
      if (txKey !== key) continue;
      const sign = tx.transaction_type === 'buy' ? -1 : 1;
      events.push({
        monthKey: key, year, month,
        type: tx.transaction_type === 'buy' ? 'stock_buy' : 'stock_sell',
        amount: sign * safeNum(tx.total_amount),
        label: `${tx.ticker ?? 'Stock'} ${tx.transaction_type}`,
        assetName: tx.ticker,
        icon: tx.transaction_type === 'buy' ? '📈' : '📉',
      });
    }

    // ── 6. CRYPTO TRANSACTIONS (planned buys/sells) ────────────────────────
    for (const tx of params.cryptoTransactions) {
      if (tx.status !== 'planned') continue;
      if (!tx.transaction_date) continue;
      const txKey = tx.transaction_date.substring(0, 7);
      if (txKey !== key) continue;
      const sign = tx.transaction_type === 'buy' ? -1 : 1;
      events.push({
        monthKey: key, year, month,
        type: tx.transaction_type === 'buy' ? 'crypto_buy' : 'crypto_sell',
        amount: sign * safeNum(tx.total_amount),
        label: `${tx.symbol ?? 'Crypto'} ${tx.transaction_type}`,
        assetName: tx.symbol,
        icon: tx.transaction_type === 'buy' ? '₿' : '📉',
      });
    }

    // ── 7. STOCK DCA ───────────────────────────────────────────────────────
    for (const dca of params.stockDCASchedules) {
      if (!dca.enabled) continue;
      const dcaStart = new Date(dca.start_date);
      const dcaEnd   = dca.end_date ? new Date(dca.end_date) : null;
      if (monthDate < dcaStart) continue;
      if (dcaEnd && monthDate > dcaEnd) continue;
      const monthly = dcaMonthlyEquiv(safeNum(dca.amount), dca.frequency);
      events.push({
        monthKey: key, year, month,
        type: 'dca_stock',
        amount: -monthly,
        label: dca.label ? `Stock DCA: ${dca.label}` : 'Stock DCA',
        icon: '🔁',
      });
    }

    // ── 8. CRYPTO DCA ──────────────────────────────────────────────────────
    for (const dca of params.cryptoDCASchedules) {
      if (!dca.enabled) continue;
      const dcaStart = new Date(dca.start_date);
      const dcaEnd   = dca.end_date ? new Date(dca.end_date) : null;
      if (monthDate < dcaStart) continue;
      if (dcaEnd && monthDate > dcaEnd) continue;
      const monthly = dcaMonthlyEquiv(safeNum(dca.amount), dca.frequency);
      events.push({
        monthKey: key, year, month,
        type: 'dca_crypto',
        amount: -monthly,
        label: dca.label ? `Crypto DCA: ${dca.label}` : 'Crypto DCA',
        icon: '₿',
      });
    }

    // ── 9. PLANNED STOCK ORDERS (one-time) ────────────────────────────────
    for (const o of params.plannedStockOrders) {
      if (o.status !== 'planned') continue;
      if (!o.planned_date) continue;
      const oKey = o.planned_date.substring(0, 7);
      if (oKey !== key) continue;
      const sign = o.action === 'buy' ? -1 : 1;
      events.push({
        monthKey: key, year, month,
        type: o.action === 'buy' ? 'stock_buy' : 'stock_sell',
        amount: sign * safeNum(o.amount_aud),
        label: `${o.name ?? 'Stock'} order — ${o.action}`,
        assetName: o.name,
        icon: o.action === 'buy' ? '📈' : '📉',
      });
    }

    // ── 10. PLANNED CRYPTO ORDERS (one-time) ──────────────────────────────
    for (const o of params.plannedCryptoOrders) {
      if (o.status !== 'planned') continue;
      if (!o.planned_date) continue;
      const oKey = o.planned_date.substring(0, 7);
      if (oKey !== key) continue;
      const sign = o.action === 'buy' ? -1 : 1;
      events.push({
        monthKey: key, year, month,
        type: o.action === 'buy' ? 'crypto_buy' : 'crypto_sell',
        amount: sign * safeNum(o.amount_aud),
        label: `${o.name ?? 'Crypto'} order — ${o.action}`,
        assetName: o.name,
        icon: o.action === 'buy' ? '₿' : '📉',
      });
    }

    // ── 11. NEGATIVE GEARING TAX BENEFIT ──────────────────────────────────
    const ngAnnual  = safeNum(params.ngAnnualBenefit);
    const ngMode    = params.ngRefundMode ?? 'lump-sum';
    if (!isActual && ngAnnual > 0) {
      if (ngMode === 'payg') {
        events.push({
          monthKey: key, year, month,
          type: 'tax_refund',
          amount: ngAnnual / 12,
          label: 'NG tax benefit (PAYG)',
          icon: '💰',
        });
      } else if (month === 8 && year > 2025) {
        // Lump-sum ATO refund arrives in August
        events.push({
          monthKey: key, year, month,
          type: 'tax_refund',
          amount: ngAnnual,
          label: `ATO refund FY${year - 1}–${year}`,
          icon: '💰',
        });
      }
    }

    monthIndex++;
  }

  return events;
}
