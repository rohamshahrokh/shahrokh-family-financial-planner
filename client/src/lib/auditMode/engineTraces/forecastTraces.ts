/**
 * forecastTraces.ts — Audit-mode trace factories for the Forecast Engine
 * surfaces (finance.projectNetWorth + canonicalWealth + dashboardDataContract).
 *
 * Most projection-row traces (Total NW per year, CAGR per year, Property Equity
 * per year) are already produced by `buildProjectionRowTraces` in traceFactories.ts
 * — this module adds the *headline* / single-value forecast surfaces:
 *
 *   - forecast:net-worth                Latest projected NW (final-year)
 *   - forecast:accessible-net-worth     Latest projected accessible NW
 *   - forecast:fire-capital             Latest FIRE Capital (post-tax)
 *   - forecast:liquidatable-wealth      Latest liquidatable wealth
 *   - forecast:property-equity          Latest projected property equity
 *   - forecast:cashflow                 Annual cashflow over forecast horizon
 *   - forecast:cagr                     Compound annual growth rate over horizon
 *
 * These complement the existing per-row projection traces by giving the
 * single-headline cards on the Dashboard / Forecast tab their own trace ids.
 */

import type { WealthLayers } from '../../canonicalWealth';
import type { WealthProjectionRow } from '@/components/ExecutiveDashboard';
import { formatCurrency } from '../../finance';
import {
  hashTraceInputs,
  type CalculationTrace,
  type TraceInput,
} from '../calculationTrace';

const fmt = (n: number) => formatCurrency(n, true);
const pct = (n: number, d = 2) =>
  Number.isFinite(n) ? `${n.toFixed(d)}%` : '—';
const nowIso = () => new Date().toISOString();
const SOURCE_ENGINE_FORECAST = 'finance.projectNetWorth + canonicalWealth.computeWealthLayers';

export interface ForecastHeadlineArgs {
  /** Today (year 0) baseline net worth. */
  startNetWorth: number;
  /** Latest projection row (final year of the forecast horizon). */
  finalRow: WealthProjectionRow;
  /** Canonical wealth layers at "now" (used for accessible / liquidatable / FIRE capital headlines). */
  layers: WealthLayers | null;
  /** Optional annual cashflow used by the dashboard cashflow card (annual surplus). */
  annualCashflow?: number;
  /** Scenario id (current_law / proposed_reform). */
  scenarioId?: string;
}

export function buildForecastNetWorthTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const years = args.finalRow.year - new Date().getFullYear();
  const inputs: TraceInput[] = [
    { label: 'Today NW', value: fmt(args.startNetWorth) },
    { label: `Projected NW (${args.finalRow.year})`, value: fmt(args.finalRow.totalNetWorth) },
    { label: 'Years projected', value: years },
  ];
  return {
    id: 'forecast:net-worth',
    label: `Forecast Net Worth · ${args.finalRow.year}`,
    finalValue: fmt(args.finalRow.totalNetWorth),
    plainEnglish:
      'The Total Net Worth from the deterministic forecast at the end of the projection horizon. Same engine the per-row projection table uses — projectNetWorth — just the final cell pinned as a headline.',
    formula: 'Total NW = Cash + Property Equity + Stocks + Crypto + Super − Liabilities  (compounded annually)',
    expanded: `${args.finalRow.year} Total NW = ${fmt(args.finalRow.cash)} + ${fmt(args.finalRow.propertyEquity)} + ${fmt(args.finalRow.stocks)} + ${fmt(args.finalRow.crypto)} + ${fmt(args.finalRow.superTotal)} − ${fmt(Math.abs(args.finalRow.liabilities))} = ${fmt(args.finalRow.totalNetWorth)}`,
    inputs,
    assumptions: [
      { label: 'Engine', value: 'finance.projectNetWorth (deterministic)' },
      { label: 'Volatility', value: 'None — MC handles stochastic' },
      { label: 'Scenario', value: args.scenarioId ?? 'current_law' },
    ],
    dataSource: 'projectionRows[final]',
    sourceEngine: SOURCE_ENGINE_FORECAST,
    included: [
      { label: 'Cash compounding' },
      { label: 'Property appreciation' },
      { label: 'Equity DCA + growth' },
      { label: 'Super contributions' },
    ],
    excluded: [
      { label: 'Volatility / drawdowns', reason: 'Handled in Monte Carlo.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [
      `projection:total-nw:${args.finalRow.year}`,
      'forecast:accessible-net-worth',
      'forecast:cagr',
    ],
    scenarioId: args.scenarioId,
  };
}

export function buildForecastAccessibleNetWorthTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const finalAccessible = args.finalRow.accessibleNetWorth;
  const inputs: TraceInput[] = [
    { label: `Projected accessible NW (${args.finalRow.year})`, value: fmt(finalAccessible) },
    { label: `Projected total NW (${args.finalRow.year})`, value: fmt(args.finalRow.totalNetWorth) },
  ];
  return {
    id: 'forecast:accessible-net-worth',
    label: `Forecast Accessible NW · ${args.finalRow.year}`,
    finalValue: fmt(finalAccessible),
    plainEnglish:
      'Accessible Net Worth from the forecast — the portion of total NW that is deployable (excludes super, Iran property, cars). Same layer logic as the dashboard "Accessible" card, but pinned at the final forecast year.',
    formula: 'Accessible NW = Total NW − (Super + Iran property + Cars)',
    expanded: `Accessible NW = ${fmt(args.finalRow.totalNetWorth)} − locked layers = ${fmt(finalAccessible)}`,
    inputs,
    assumptions: [
      { label: 'Locked categories', value: 'super, iran property, cars', source: 'canonicalWealth' },
      { label: 'Scenario', value: args.scenarioId ?? 'current_law' },
    ],
    dataSource: 'projectionRows[final].accessibleNetWorth',
    sourceEngine: SOURCE_ENGINE_FORECAST,
    included: [{ label: 'Deployable assets' }],
    excluded: [
      { label: 'Super preservation-age locked', reason: 'Counted separately.' },
      { label: 'Iran property', reason: 'FX + liquidity friction.' },
      { label: 'Cars', reason: 'Not realistically deployable.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['forecast:net-worth', 'forecast:liquidatable-wealth'],
    scenarioId: args.scenarioId,
  };
}

export function buildForecastFireCapitalTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const fireCapital = args.layers?.fireCapital ?? 0;
  const inputs: TraceInput[] = [
    { label: 'Liquidatable wealth (now)', value: fmt(args.layers?.liquidatableWealth ?? 0) },
    { label: 'CGT on IP gain', value: fmt(args.layers?.drivers.cgtOnIp ?? 0) },
    { label: 'Reform-regime drag', value: fmt(args.layers?.drivers.reformDrag ?? 0) },
    { label: 'FIRE Capital (now)', value: fmt(fireCapital) },
  ];
  return {
    id: 'forecast:fire-capital',
    label: 'Forecast FIRE Capital',
    finalValue: fmt(fireCapital),
    plainEnglish:
      'The post-tax capital actually available to fund a Trinity-style retirement, after subtracting CGT on IP gains and reform-regime liquidation drag from the liquidatable wealth. Same engine field the dashboard FIRE Capital card consumes.',
    formula: 'FIRE Capital = Liquidatable Wealth − CGT on IP gain − Reform-regime drag',
    expanded: `FIRE Capital = ${fmt(args.layers?.liquidatableWealth ?? 0)} − ${fmt(args.layers?.drivers.cgtOnIp ?? 0)} − ${fmt(args.layers?.drivers.reformDrag ?? 0)} = ${fmt(fireCapital)}`,
    inputs,
    assumptions: [
      { label: 'CGT discount', value: '50%', source: 'WEALTH_ASSUMPTIONS' },
      { label: 'Marginal rate', value: '~37%', source: 'WEALTH_ASSUMPTIONS' },
      { label: 'Scenario', value: args.scenarioId ?? 'current_law' },
    ],
    dataSource: 'canonicalWealth.layers.fireCapital',
    sourceEngine: 'canonicalWealth.computeWealthLayers',
    included: [
      { label: 'CGT on embedded IP gain' },
      { label: 'Reform-regime drag (when applicable)' },
    ],
    excluded: [
      { label: 'Stamp duty on re-entry', reason: 'Out of scope.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['forecast:liquidatable-wealth', 'dashboard:wealth-layers:fire'],
    scenarioId: args.scenarioId,
  };
}

export function buildForecastLiquidatableWealthTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const liquidatable = args.layers?.liquidatableWealth ?? 0;
  const inputs: TraceInput[] = [
    { label: 'Accessible NW (now)', value: fmt(args.layers?.accessibleNetWorth ?? 0) },
    { label: 'Property selling cost', value: fmt(args.layers?.drivers.sellingCost ?? 0) },
    { label: 'Liquidatable wealth (now)', value: fmt(liquidatable) },
  ];
  return {
    id: 'forecast:liquidatable-wealth',
    label: 'Forecast Liquidatable Wealth',
    finalValue: fmt(liquidatable),
    plainEnglish:
      'The cash you would actually clear after selling deployable assets — accessible NW minus agent / conveyancing / disposal costs (~3.5% on property by default).',
    formula: 'Liquidatable = Accessible NW − Selling Costs (PPOR + IP value × selling-cost %)',
    expanded: `Liquidatable = ${fmt(args.layers?.accessibleNetWorth ?? 0)} − ${fmt(args.layers?.drivers.sellingCost ?? 0)} = ${fmt(liquidatable)}`,
    inputs,
    assumptions: [
      { label: 'Property selling-cost %', value: '~3.5%', source: 'WEALTH_ASSUMPTIONS' },
      { label: 'Scenario', value: args.scenarioId ?? 'current_law' },
    ],
    dataSource: 'canonicalWealth.layers.liquidatableWealth',
    sourceEngine: 'canonicalWealth.computeWealthLayers',
    included: [{ label: 'Property disposal costs' }],
    excluded: [{ label: 'Stock/crypto disposal slippage', reason: 'Implicit in market price.' }],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['forecast:accessible-net-worth', 'forecast:fire-capital', 'dashboard:wealth-layers:liquidatable'],
    scenarioId: args.scenarioId,
  };
}

export function buildForecastPropertyEquityTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: `Property Equity (${args.finalRow.year})`, value: fmt(args.finalRow.propertyEquity) },
  ];
  return {
    id: 'forecast:property-equity',
    label: `Forecast Property Equity · ${args.finalRow.year}`,
    finalValue: fmt(args.finalRow.propertyEquity),
    plainEnglish:
      'Property equity at the end of the forecast horizon: sum of property values minus outstanding loan balances, projected via finance.projectProperty.',
    formula: 'Property Equity(y) = Σ (Property Value(y) − Loan Balance(y))',
    expanded: `Property Equity ${args.finalRow.year} = ${fmt(args.finalRow.propertyEquity)}`,
    inputs,
    assumptions: [
      { label: 'PPOR growth %', source: 'finance.projectProperty' },
      { label: 'IP growth %', source: 'finance.projectProperty' },
      { label: 'Loan amortisation', source: 'finance.calcLoanBalance' },
    ],
    dataSource: 'projectionRows[final].propertyEquity',
    sourceEngine: 'finance.projectProperty',
    included: [{ label: 'PPOR + settled IPs + planned IPs after settlement' }],
    excluded: [{ label: 'Selling costs / CGT', reason: 'Pre-realisation equity.' }],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: [`projection:property-equity:${args.finalRow.year}`],
    scenarioId: args.scenarioId,
  };
}

export function buildForecastCashflowTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const annualCashflow = args.annualCashflow ?? 0;
  const monthlyCashflow = annualCashflow / 12;
  const inputs: TraceInput[] = [
    { label: 'Monthly surplus (canonical)', value: fmt(monthlyCashflow) },
    { label: 'Annual cashflow (× 12)', value: fmt(annualCashflow) },
  ];
  return {
    id: 'forecast:cashflow',
    label: 'Forecast Cashflow (annual)',
    finalValue: fmt(annualCashflow),
    plainEnglish:
      'The annual household cashflow available for compounding — monthly surplus × 12. Drives the forecast\'s "savings injection" each year. Same monthly surplus the dashboard hero card uses.',
    formula: 'Annual Cashflow = Monthly Surplus × 12',
    expanded: `Annual Cashflow = ${fmt(monthlyCashflow)} × 12 = ${fmt(annualCashflow)}`,
    inputs,
    assumptions: [
      { label: 'Surplus source', value: 'selectMonthlySurplus', source: 'dashboardDataContract' },
      { label: 'Includes investment contributions', value: 'Implicit (already in expenses or DCA bucket)' },
    ],
    dataSource: 'dashboardDataContract.selectMonthlySurplus × 12',
    sourceEngine: 'dashboardDataContract',
    included: [
      { label: 'After-tax income' },
      { label: 'Net passive / rental income' },
      { label: 'Living expenses' },
      { label: 'Debt repayments' },
    ],
    excluded: [
      { label: 'One-off lump sums', reason: 'Surfaced in Events / Forecast row deltas instead.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['dashboard:monthly-surplus'],
    scenarioId: args.scenarioId,
  };
}

export function buildForecastCagrTrace(args: ForecastHeadlineArgs): CalculationTrace {
  const years = args.finalRow.year - new Date().getFullYear();
  const cagr = years > 0 && args.startNetWorth > 0
    ? (Math.pow(args.finalRow.totalNetWorth / args.startNetWorth, 1 / years) - 1) * 100
    : 0;
  const inputs: TraceInput[] = [
    { label: 'Starting NW (today)', value: fmt(args.startNetWorth) },
    { label: `Final NW (${args.finalRow.year})`, value: fmt(args.finalRow.totalNetWorth) },
    { label: 'Years', value: years },
  ];
  return {
    id: 'forecast:cagr',
    label: 'Forecast CAGR (overall)',
    finalValue: pct(cagr),
    plainEnglish:
      'The compound annual growth rate the deterministic forecast implies from today through the final forecast year. Equivalent to the per-row CAGR at the final year — pinned here as a single headline.',
    formula: 'CAGR = (Final NW / Starting NW)^(1 / Years) − 1',
    expanded: years > 0 && args.startNetWorth > 0
      ? `CAGR = (${fmt(args.finalRow.totalNetWorth)} / ${fmt(args.startNetWorth)})^(1/${years}) − 1 = ${pct(cagr)}`
      : '—',
    inputs,
    assumptions: [
      { label: 'Compounding basis', value: 'Annual' },
      { label: 'Deterministic', value: 'Yes — no volatility' },
    ],
    dataSource: 'projectionRows',
    sourceEngine: SOURCE_ENGINE_FORECAST,
    included: [],
    excluded: [],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['projection:cagr:overall', 'forecast:net-worth'],
    scenarioId: args.scenarioId,
  };
}

export function buildAllForecastHeadlineTraces(args: ForecastHeadlineArgs): CalculationTrace[] {
  return [
    buildForecastNetWorthTrace(args),
    buildForecastAccessibleNetWorthTrace(args),
    buildForecastFireCapitalTrace(args),
    buildForecastLiquidatableWealthTrace(args),
    buildForecastPropertyEquityTrace(args),
    buildForecastCashflowTrace(args),
    buildForecastCagrTrace(args),
  ];
}

export const FORECAST_TRACE_IDS = [
  'forecast:net-worth',
  'forecast:accessible-net-worth',
  'forecast:fire-capital',
  'forecast:liquidatable-wealth',
  'forecast:property-equity',
  'forecast:cashflow',
  'forecast:cagr',
] as const;
