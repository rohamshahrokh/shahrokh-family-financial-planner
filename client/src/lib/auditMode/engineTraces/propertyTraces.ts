/**
 * propertyTraces.ts — Calculation traces for the Property page surfaces.
 *
 * These factories do NOT modify the property / equity engine math. They take
 * already-computed portfolio aggregates (value, loans, equity, LVR, monthly
 * cashflow) plus the formula constants used by the engine, and emit a
 * CalculationTrace explaining where each visible KPI came from.
 *
 * Trace ids follow the existing engineTraces convention:
 *   property:portfolio:value
 *   property:portfolio:loans
 *   property:portfolio:equity
 *   property:portfolio:lvr
 *   property:portfolio:cashflow
 *
 * Engines stay unchanged — the UI passes the already-computed numbers in.
 */

import type { CalculationTrace } from '../calculationTrace';

export interface PropertyPortfolioTraceArgs {
  portfolioValue: number;
  portfolioLoans: number;
  portfolioEquity: number;
  portfolioLVR: number;
  monthlyPortfolioCF: number;
  propertyCount: number;
}

const PROPERTY_PORTFOLIO_TRACE_IDS = [
  'property:portfolio:value',
  'property:portfolio:loans',
  'property:portfolio:equity',
  'property:portfolio:lvr',
  'property:portfolio:cashflow',
] as const;

export const PROPERTY_TRACE_IDS: readonly string[] = PROPERTY_PORTFOLIO_TRACE_IDS;

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function ts(): string {
  return new Date().toISOString();
}

export function buildPropertyValueTrace(a: PropertyPortfolioTraceArgs): CalculationTrace {
  return {
    id: 'property:portfolio:value',
    label: 'Portfolio Value',
    finalValue: fmt$(a.portfolioValue),
    plainEnglish:
      'The combined market value of every property you currently own, before subtracting any loans. This is the gross value used to compute Equity and LVR.',
    formula: 'Portfolio Value = Σ property.current_value (settled only)',
    expanded: `Σ over ${a.propertyCount} settled property line(s) = ${fmt$(a.portfolioValue)}`,
    inputs: [
      { label: 'Property count (settled)', value: a.propertyCount, source: 'property table' },
      { label: 'Sum of current_value', value: fmt$(a.portfolioValue), source: 'property.current_value' },
    ],
    assumptions: [
      { label: 'Only properties with status = settled', source: 'property page filter' },
      { label: 'Future / planned purchases excluded', source: 'isFuturePurchase flag' },
    ],
    dataSource: 'Supabase properties table — current_value column',
    sourceEngine: 'Property aggregate (UI selector)',
    included: [{ label: 'Each settled IP at its current market value' }],
    excluded: [
      { label: 'Planned / future property purchases', reason: 'Capacity model, not portfolio state' },
    ],
    calculatedAt: ts(),
  };
}

export function buildPropertyLoansTrace(a: PropertyPortfolioTraceArgs): CalculationTrace {
  return {
    id: 'property:portfolio:loans',
    label: 'Total Property Loans',
    finalValue: fmt$(a.portfolioLoans),
    plainEnglish:
      'The combined outstanding loan balance across every property you currently own. Used as the debt side of LVR and Equity.',
    formula: 'Total Loans = Σ property.loan_balance (settled only)',
    expanded: `Σ over ${a.propertyCount} settled property line(s) = ${fmt$(a.portfolioLoans)}`,
    inputs: [
      { label: 'Property count (settled)', value: a.propertyCount, source: 'property table' },
      { label: 'Sum of loan_balance', value: fmt$(a.portfolioLoans), source: 'property.loan_balance' },
    ],
    assumptions: [
      { label: 'Loan_balance reflects today, not original loan_amount', source: 'property page selector' },
    ],
    dataSource: 'Supabase properties table — loan_balance column',
    sourceEngine: 'Property aggregate (UI selector)',
    included: [{ label: 'Each settled IP loan at its current balance' }],
    excluded: [{ label: 'Offset balances', reason: 'Offset is netted at the cashflow level, not at LVR level' }],
    calculatedAt: ts(),
  };
}

export function buildPropertyPortfolioEquityTrace(a: PropertyPortfolioTraceArgs): CalculationTrace {
  return {
    id: 'property:portfolio:equity',
    label: 'Total Property Equity',
    finalValue: fmt$(a.portfolioEquity),
    plainEnglish:
      'How much of your property wealth is actually yours after paying off the outstanding loans. This is the equity figure used by Wealth Layers and the borrowing-power calculations.',
    formula: 'Equity = Portfolio Value − Total Loans',
    expanded: `${fmt$(a.portfolioValue)} − ${fmt$(a.portfolioLoans)} = ${fmt$(a.portfolioEquity)}`,
    inputs: [
      { label: 'Portfolio Value', value: fmt$(a.portfolioValue), source: 'property:portfolio:value' },
      { label: 'Total Loans', value: fmt$(a.portfolioLoans), source: 'property:portfolio:loans' },
    ],
    assumptions: [
      { label: 'No transaction / sale costs deducted', source: 'liquidatable layer applies its own costs' },
    ],
    dataSource: 'Derived from portfolio value and loans aggregates',
    sourceEngine: 'Property aggregate (UI selector)',
    included: [],
    excluded: [
      { label: 'Selling costs / agent commission', reason: 'Applied in liquidatable wealth, not raw equity' },
    ],
    calculatedAt: ts(),
    relatedIds: ['property:portfolio:value', 'property:portfolio:loans', 'forecast:property-equity'],
  };
}

export function buildPropertyLvrTrace(a: PropertyPortfolioTraceArgs): CalculationTrace {
  return {
    id: 'property:portfolio:lvr',
    label: 'Portfolio LVR',
    finalValue: fmtPct(a.portfolioLVR),
    plainEnglish:
      'Loan-to-Value Ratio across the whole property portfolio. LVR above 80% triggers Lenders Mortgage Insurance considerations and reduces borrowing capacity.',
    formula: 'LVR = Total Loans ÷ Portfolio Value × 100',
    expanded:
      a.portfolioValue > 0
        ? `${fmt$(a.portfolioLoans)} ÷ ${fmt$(a.portfolioValue)} × 100 = ${fmtPct(a.portfolioLVR)}`
        : '0 — no settled properties',
    inputs: [
      { label: 'Total Loans', value: fmt$(a.portfolioLoans), source: 'property:portfolio:loans' },
      { label: 'Portfolio Value', value: fmt$(a.portfolioValue), source: 'property:portfolio:value' },
    ],
    assumptions: [
      { label: 'LVR > 80% triggers LMI considerations', source: 'AU lender convention' },
    ],
    dataSource: 'Derived from portfolio value and loans aggregates',
    sourceEngine: 'Property aggregate (UI selector)',
    included: [],
    excluded: [],
    calculatedAt: ts(),
    relatedIds: ['property:portfolio:loans', 'property:portfolio:value'],
  };
}

export function buildPropertyCashflowTrace(a: PropertyPortfolioTraceArgs): CalculationTrace {
  return {
    id: 'property:portfolio:cashflow',
    label: 'Property Monthly Cashflow',
    finalValue: fmt$(a.monthlyPortfolioCF),
    plainEnglish:
      'Net monthly cashflow across every settled investment property — rent in, minus mortgage payments and running costs. Negative means the portfolio is in cash-drag (negative gearing territory).',
    formula:
      'Monthly CF = Σ ((annual rent × (1 − vacancy)) − interest − principal − running_costs) ÷ 12',
    expanded: `Σ over ${a.propertyCount} settled property line(s) = ${fmt$(a.monthlyPortfolioCF)} / month`,
    inputs: [
      { label: 'Property count (settled)', value: a.propertyCount, source: 'property table' },
      { label: 'Sum of monthly cashflow', value: fmt$(a.monthlyPortfolioCF), source: 'per-property monthlyCashFlow' },
    ],
    assumptions: [
      { label: 'Vacancy rate per property', source: 'property.vacancy_pct' },
      { label: 'Running costs include rates + management + insurance', source: 'property page calculator' },
      { label: 'Tax effects (NG) applied separately on the dashboard', source: 'calcNegativeGearing' },
    ],
    dataSource: 'Per-property `calcs` from the property page calculator',
    sourceEngine: 'Property page cashflow selector',
    included: [{ label: 'Rent × (1 − vacancy)' }, { label: 'Interest & principal' }, { label: 'Running costs' }],
    excluded: [
      { label: 'Tax refund / depreciation', reason: 'Applied at NG / tax-engine level' },
      { label: 'Capital growth', reason: 'Unrealised — affects Equity, not cashflow' },
    ],
    calculatedAt: ts(),
  };
}

export function buildAllPropertyPortfolioTraces(a: PropertyPortfolioTraceArgs): CalculationTrace[] {
  return [
    buildPropertyValueTrace(a),
    buildPropertyLoansTrace(a),
    buildPropertyPortfolioEquityTrace(a),
    buildPropertyLvrTrace(a),
    buildPropertyCashflowTrace(a),
  ];
}
