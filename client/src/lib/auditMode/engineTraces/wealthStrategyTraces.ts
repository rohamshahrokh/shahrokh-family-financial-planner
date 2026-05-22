/**
 * wealthStrategyTraces.ts — Audit trace factories for the Wealth Strategy
 * Hub Data Summary KPIs.
 *
 * Inputs are the pre-computed metrics displayed on the Wealth Strategy Hub
 * page (AICoach Data Summary section). No engine math is recomputed here —
 * values are pinned from the page's existing scope and substituted into the
 * formula strings.
 */

import type { CalculationTrace } from '../calculationTrace';
import { hashTraceInputs } from '../calculationTrace';

export const WEALTH_STRATEGY_TRACE_IDS = [
  'wealth-strategy:cash-buffer',
  'wealth-strategy:savings-rate',
  'wealth-strategy:debt-to-assets',
  'wealth-strategy:freedom-progress',
  'wealth-strategy:net-position',
] as const;

export interface WealthStrategyTraceArgs {
  cash: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  monthlySurplus: number;
  totalAssets: number;
  totalDebt: number;
  investableAssets: number;
  fireTarget: number;
}

const now = () => new Date().toISOString();

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function buildCashBufferTrace(a: WealthStrategyTraceArgs): CalculationTrace {
  const months = a.monthlyExpenses > 0 ? a.cash / a.monthlyExpenses : 0;
  const inputs = [
    { label: 'Cash (current)', value: fmtMoney(a.cash), source: 'snap.cash' },
    { label: 'Monthly Expenses', value: fmtMoney(a.monthlyExpenses), source: 'snap.monthly_expenses' },
  ];
  return {
    id: 'wealth-strategy:cash-buffer',
    label: 'Cash Buffer (months of expenses)',
    finalValue: `${months.toFixed(1)} months`,
    plainEnglish: 'How many months your liquid cash would cover monthly expenses if income paused.',
    formula: 'Cash Buffer (months) = Cash / Monthly Expenses',
    expanded: `Cash Buffer = ${fmtMoney(a.cash)} / ${fmtMoney(a.monthlyExpenses)} = ${months.toFixed(2)} months`,
    inputs,
    assumptions: [
      { label: 'Healthy target', value: '≥ 3 months', source: 'Risk engine cash_buffer benchmark' },
    ],
    dataSource: 'Latest snapshot (cash) + monthly_expenses budget',
    sourceEngine: 'Wealth Strategy Hub (Data Summary)',
    included: [{ label: 'Cash account balance' }],
    excluded: [
      { label: 'Investments', reason: 'Not immediately liquid for emergency use' },
      { label: 'Property equity', reason: 'Illiquid' },
    ],
    calculatedAt: now(),
    inputHash: hashTraceInputs(inputs),
  };
}

export function buildSavingsRateTrace(a: WealthStrategyTraceArgs): CalculationTrace {
  const rate = a.monthlyIncome > 0 ? (a.monthlySurplus / a.monthlyIncome) * 100 : 0;
  const inputs = [
    { label: 'Monthly Surplus', value: fmtMoney(a.monthlySurplus), source: 'income − expenses' },
    { label: 'Monthly Income', value: fmtMoney(a.monthlyIncome), source: 'snap.monthly_income' },
  ];
  return {
    id: 'wealth-strategy:savings-rate',
    label: 'Savings Rate (%)',
    finalValue: `${rate.toFixed(1)}%`,
    plainEnglish: 'Share of monthly income that remains after expenses — the fuel for FIRE.',
    formula: 'Savings Rate = (Monthly Surplus / Monthly Income) × 100',
    expanded: `Savings Rate = (${fmtMoney(a.monthlySurplus)} / ${fmtMoney(a.monthlyIncome)}) × 100 = ${rate.toFixed(2)}%`,
    inputs,
    assumptions: [{ label: 'Healthy target', value: '≥ 20%', source: 'Help page guidance' }],
    dataSource: 'Latest snapshot monthly_income + monthly_expenses',
    sourceEngine: 'Wealth Strategy Hub (Data Summary)',
    included: [{ label: 'Take-home monthly income' }, { label: 'Total monthly expenses' }],
    excluded: [{ label: 'One-off bonuses', reason: 'Not in monthly_income field' }],
    calculatedAt: now(),
    inputHash: hashTraceInputs(inputs),
  };
}

export function buildDebtToAssetsTrace(a: WealthStrategyTraceArgs): CalculationTrace {
  const ratio = a.totalAssets > 0 ? (a.totalDebt / a.totalAssets) * 100 : 0;
  const inputs = [
    { label: 'Total Debt', value: fmtMoney(a.totalDebt), source: 'mortgage + other_debts' },
    { label: 'Total Assets', value: fmtMoney(a.totalAssets), source: 'Σ asset values' },
  ];
  return {
    id: 'wealth-strategy:debt-to-assets',
    label: 'Debt-to-Assets ratio (%)',
    finalValue: `${ratio.toFixed(1)}%`,
    plainEnglish: 'Leverage indicator — share of assets financed by debt.',
    formula: 'Debt-to-Assets = (Total Debt / Total Assets) × 100',
    expanded: `Debt-to-Assets = (${fmtMoney(a.totalDebt)} / ${fmtMoney(a.totalAssets)}) × 100 = ${ratio.toFixed(2)}%`,
    inputs,
    assumptions: [{ label: 'Healthy target', value: '< 40%', source: 'riskEngine debt_ratio benchmark' }],
    dataSource: 'Latest snapshot — mortgage, other_debts, all asset fields',
    sourceEngine: 'Wealth Strategy Hub (Data Summary)',
    included: [
      { label: 'Mortgage outstanding' },
      { label: 'Other personal debts' },
      { label: 'All asset categories (cash, super, stocks, crypto, property, cars)' },
    ],
    excluded: [{ label: 'Future tax liabilities', reason: 'Not modelled as debt here' }],
    calculatedAt: now(),
    inputHash: hashTraceInputs(inputs),
  };
}

export function buildFreedomProgressTrace(a: WealthStrategyTraceArgs): CalculationTrace {
  const pct = a.fireTarget > 0 ? Math.min(100, (a.investableAssets / a.fireTarget) * 100) : 0;
  const inputs = [
    { label: 'Investable Assets', value: fmtMoney(a.investableAssets), source: 'cash + offset + super + stocks + crypto' },
    { label: 'FIRE Target Capital', value: fmtMoney(a.fireTarget), source: '(annual income × 12) / 0.04' },
  ];
  return {
    id: 'wealth-strategy:freedom-progress',
    label: 'Freedom Progress (% of FIRE target)',
    finalValue: `${pct.toFixed(1)}%`,
    plainEnglish: 'How close your investable capital is to the FIRE target needed to retire.',
    formula: 'Freedom Progress = min(100, (Investable Assets / FIRE Target) × 100)',
    expanded: `Freedom Progress = min(100, (${fmtMoney(a.investableAssets)} / ${fmtMoney(a.fireTarget)}) × 100) = ${pct.toFixed(2)}%`,
    inputs,
    assumptions: [
      { label: 'SWR', value: '4%', source: 'FIRE Target denominator' },
      { label: 'Cap', value: '100%', source: 'Visual cap for KPI tile' },
    ],
    dataSource: 'Snapshot investable accounts + monthly income (for FIRE target)',
    sourceEngine: 'Wealth Strategy Hub (Data Summary)',
    included: [
      { label: 'Cash + offset' },
      { label: 'Superannuation balance' },
      { label: 'Stocks + crypto' },
    ],
    excluded: [
      { label: 'Property equity', reason: 'Treated separately — not pure investable capital' },
      { label: 'Cars', reason: 'Depreciating asset' },
    ],
    calculatedAt: now(),
    inputHash: hashTraceInputs(inputs),
  };
}

export function buildNetPositionTrace(a: WealthStrategyTraceArgs): CalculationTrace {
  const netWorth = a.totalAssets - a.totalDebt;
  const inputs = [
    { label: 'Total assets', value: fmtMoney(a.totalAssets), source: 'snapshot canonical sum' },
    { label: 'Total debt',   value: fmtMoney(a.totalDebt),   source: 'snapshot canonical sum' },
    { label: 'Investable assets', value: fmtMoney(a.investableAssets), source: 'snapshot.cash + offset + super + stocks + crypto' },
  ];
  return {
    id: 'wealth-strategy:net-position',
    label: 'Wealth Strategy — Household Net Position',
    finalValue: fmtMoney(netWorth),
    plainEnglish:
      'Household net position — the same canonical Net Worth shown on the Dashboard hero. Calculated as total assets minus total debt across all asset classes (PPOR, cash, offset, super, stocks, crypto, IP equity, cars, Iran property) and liabilities (mortgage, other debts).',
    formula: 'Net Position = Σ (asset values) − Σ (liabilities)',
    expanded: `Net Position = ${fmtMoney(a.totalAssets)} − ${fmtMoney(a.totalDebt)} = ${fmtMoney(netWorth)}`,
    inputs,
    assumptions: [
      { label: 'Source', value: 'Canonical snapshot', source: 'dashboardDataContract.selectNetWorth' },
      { label: 'Includes super', value: 'Yes (locked layer flagged separately)' },
    ],
    dataSource: 'Latest snapshot — canonical financial state',
    sourceEngine: 'Wealth Strategy Hub (Household state)',
    included: [
      { label: 'PPOR + IP equity' },
      { label: 'Cash + offset' },
      { label: 'Super (Roham + Fara)' },
      { label: 'Stocks + crypto holdings' },
      { label: 'Cars + Iran property' },
    ],
    excluded: [
      { label: 'Future cashflows', reason: 'Snapshot only — projection uses Forecast Engine.' },
    ],
    calculatedAt: now(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      'dashboard:net-worth',
      'wealth-strategy:cash-buffer',
      'wealth-strategy:savings-rate',
      'wealth-strategy:debt-to-assets',
      'wealth-strategy:freedom-progress',
    ],
  };
}

export function buildWealthStrategyTraces(a: WealthStrategyTraceArgs): CalculationTrace[] {
  return [
    buildCashBufferTrace(a),
    buildSavingsRateTrace(a),
    buildDebtToAssetsTrace(a),
    buildFreedomProgressTrace(a),
    buildNetPositionTrace(a),
  ];
}
