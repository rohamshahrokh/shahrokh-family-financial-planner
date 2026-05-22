/**
 * traceFactories.ts — Canonical trace metadata factories.
 *
 * These functions take canonical engine OUTPUTS (the same objects already
 * computed by `canonicalNetWorth`, `canonicalWealth`, `canonicalRiskSurface`,
 * `finance.projectNetWorth`, `fireMonteCarlo`, `propertyBuyEngine`, etc.) and
 * return a CalculationTrace suitable for `registerTrace`.
 *
 * Architectural rules
 * -------------------
 *   • Formulas are described as strings here — the actual MATH lives in the
 *     canonical engines and is NEVER duplicated. These factories only read
 *     the engine output and pin it to a human-readable trace.
 *   • Each factory is pure and synchronous: pass in the same canonical
 *     object and you get the same CalculationTrace.
 *   • The id namespace is `<surface>:<metric>`. New surfaces should follow
 *     the same convention — e.g. "dashboard:net-worth", "projection:cagr",
 *     "risk:axis:liquidity", "fire:number".
 *
 * The factories live in one file so a contributor can audit at a glance
 * exactly which formulas the platform is willing to display. Adding a new
 * trace = adding one factory here + one `registerTrace` call from the host
 * component or engine wrapper.
 */

import type { CanonicalNetWorthResult } from '../canonicalNetWorth';
import type { WealthLayers } from '../canonicalWealth';
import type {
  CanonicalRiskSurface,
  RadarPoint,
  FireFragility,
} from '../canonicalRiskSurface';
import type { WealthProjectionRow } from '@/components/ExecutiveDashboard';
import { formatCurrency } from '../finance';
import {
  hashTraceInputs,
  type CalculationTrace,
  type TraceInput,
} from './calculationTrace';

const fmt = (n: number) => formatCurrency(n, true);
const pct = (n: number, d = 2) =>
  Number.isFinite(n) ? `${n.toFixed(d)}%` : '—';

function nowIso(): string {
  return new Date().toISOString();
}

function buildHash(inputs: TraceInput[]): string {
  return hashTraceInputs(inputs);
}

// ─── Dashboard hero ─────────────────────────────────────────────────────────

export function buildNetWorthTrace(
  cnw: Pick<CanonicalNetWorthResult, 'netWorth' | 'components' | 'lastCalculatedAt'>,
): CalculationTrace {
  const c = cnw.components;
  const totalAssets =
    c.cashTotal + c.superTotal + c.ppor + c.ips + c.stocks +
    c.crypto + c.cars + c.iranProperty + c.otherAssets;
  const totalLiab = c.mortgage + c.ipsLoans + c.otherDebts;

  const inputs: TraceInput[] = [
    { label: 'Total Assets', value: fmt(totalAssets), source: 'selectCanonicalNetWorth.assets' },
    { label: 'Total Liabilities', value: fmt(totalLiab), source: 'selectCanonicalNetWorth.liabilities' },
  ];

  return {
    id: 'dashboard:net-worth',
    label: 'Net Worth',
    finalValue: fmt(cnw.netWorth),
    plainEnglish:
      'Your Net Worth is what you would have if you sold everything you own and paid off every dollar you owe. We sum every settled asset (cash, super, property, stocks, crypto, etc.) and subtract every liability (mortgages, IP loans, other debts).',
    formula: 'Net Worth = Total Assets − Total Liabilities',
    expanded: `Net Worth = ${fmt(totalAssets)} − ${fmt(totalLiab)} = ${fmt(cnw.netWorth)}`,
    inputs,
    assumptions: [
      { label: 'Includes offset balance', value: 'Yes', source: 'cashOffset = cash + savings + offset' },
      { label: 'IP value', value: 'Settled IPs only', source: 'plannedIpEquity excluded' },
    ],
    dataSource: 'sf_snapshot + properties + stocks + crypto + holdings (canonical ledger)',
    sourceEngine: 'canonicalNetWorth / dashboardDataContract.selectCanonicalNetWorth',
    included: [
      { label: 'Cash + Offset', value: fmt(c.cashTotal) },
      { label: 'Superannuation', value: fmt(c.superTotal) },
      { label: 'PPOR market value', value: fmt(c.ppor) },
      { label: 'Settled investment properties', value: fmt(c.ips) },
      { label: 'Stocks', value: fmt(c.stocks) },
      { label: 'Crypto', value: fmt(c.crypto) },
      { label: 'Cars', value: fmt(c.cars) },
      { label: 'Iran property', value: fmt(c.iranProperty) },
      { label: 'Other assets', value: fmt(c.otherAssets) },
      { label: 'PPOR mortgage', value: `−${fmt(c.mortgage)}`, reason: 'subtracted' },
      { label: 'Settled IP loans', value: `−${fmt(c.ipsLoans)}`, reason: 'subtracted' },
      { label: 'Other debts', value: `−${fmt(c.otherDebts)}`, reason: 'subtracted' },
    ],
    excluded: [
      { label: 'Planned IP equity', reason: 'Not yet settled — would inflate today\'s NW.' },
      { label: 'Forecast Monte Carlo growth', reason: 'Future projection, not a current balance.' },
    ],
    calculatedAt: cnw.lastCalculatedAt,
    inputHash: buildHash(inputs),
    relatedIds: ['dashboard:wealth-layers:gross', 'projection:total-nw'],
  };
}

export function buildMonthlySurplusTrace(args: {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtService: number;
  passiveIncome: number;
  surplus: number;
  investmentContributions?: number;
  scenarioId?: string;
}): CalculationTrace {
  const investmentContrib = args.investmentContributions ?? 0;
  const expensesOnly =
    args.monthlyExpenses - args.monthlyDebtService - investmentContrib;
  const inputs: TraceInput[] = [
    { label: 'After-tax income (monthly)', value: fmt(args.monthlyIncome), source: 'selectMonthlyIncome' },
    { label: 'Net passive / rental income', value: fmt(args.passiveIncome), source: 'selectPassiveIncome' },
    { label: 'Living expenses', value: fmt(Math.max(0, expensesOnly)), source: 'expenses ledger' },
    { label: 'Debt repayments', value: fmt(args.monthlyDebtService), source: 'selectMonthlyDebtService' },
    { label: 'Investment contributions', value: fmt(investmentContrib), source: 'DCA / contributions' },
  ];
  return {
    id: 'dashboard:monthly-surplus',
    label: 'Monthly Surplus',
    finalValue: fmt(args.surplus),
    plainEnglish:
      'Your Monthly Surplus is the cash left over each month after every recurring outflow. We start with after-tax income, add any net passive / rental income, then subtract living expenses, debt repayments, and investment contributions.',
    formula:
      'Monthly Surplus = After-Tax Income + Net Passive Income − Living Expenses − Debt Repayments − Investment Contributions',
    expanded: `Monthly Surplus = ${fmt(args.monthlyIncome)} + ${fmt(args.passiveIncome)} − ${fmt(Math.max(0, expensesOnly))} − ${fmt(args.monthlyDebtService)} − ${fmt(investmentContrib)} = ${fmt(args.surplus)}`,
    inputs,
    assumptions: [
      { label: 'Income basis', value: 'After-tax', source: 'australianTax.auTaxPayable' },
      { label: 'Passive income net', value: 'Of holding costs', source: 'selectPassiveIncome' },
    ],
    dataSource: 'income + expenses + bills + debts (canonical ledger)',
    sourceEngine: 'dashboardDataContract.selectMonthly*',
    included: [
      { label: 'Recurring bills' },
      { label: 'Loan repayments (P&I + IO)' },
      { label: 'Regular DCA contributions' },
    ],
    excluded: [
      { label: 'One-off events (planned IPs, lump sums)', reason: 'Surfaced in Forecast tab, not in today\'s surplus.' },
      { label: 'Tax refunds (NG)', reason: 'Lump-sum mode keeps refunds out of monthly surplus.' },
    ],
    calculatedAt: nowIso(),
    scenarioId: args.scenarioId,
    inputHash: buildHash(inputs),
  };
}

export function buildRiskStateTrace(args: {
  score: number;
  label: string;
  radar: RadarPoint[];
  scenarioId?: string;
}): CalculationTrace {
  const inputs: TraceInput[] = args.radar.map(p => ({
    label: p.axis,
    value: `${Math.round(p.score)} / 100`,
    note: p.detail,
  }));
  const avg =
    args.radar.length > 0
      ? args.radar.reduce((s, p) => s + p.score, 0) / args.radar.length
      : 0;
  return {
    id: 'dashboard:risk-state',
    label: 'Risk State',
    finalValue: `${Math.round(args.score)} / 100 · ${args.label}`,
    plainEnglish:
      'Risk State is the unweighted average of the eight Risk Radar axes (Liquidity, Leverage, Cashflow, Concentration, Property Exposure, Interest Rate, Tax Reform, FIRE Delay). Each axis is scored 0–100 where 100 means safest. The label (Strong / Stable / Watchlist / Stressed) is derived from the resulting score.',
    formula: 'Risk State = mean(axis_score_0..7)',
    expanded: `mean(${args.radar.map(p => Math.round(p.score)).join(', ')}) = ${avg.toFixed(1)}`,
    inputs,
    assumptions: [
      { label: 'Safe zone (radar)', value: '≥75', source: 'canonicalRiskSurface.SAFE_ZONE' },
      { label: 'Warning zone (radar)', value: '50–74', source: 'canonicalRiskSurface.WARNING_ZONE' },
    ],
    dataSource: 'canonical ledger + active tax regime',
    sourceEngine: 'canonicalRiskSurface.buildCanonicalRiskSurface',
    included: args.radar.map(p => ({ label: p.axis, value: Math.round(p.score) })),
    excluded: [
      { label: 'Best Move / Decision Engine output', reason: 'Risk score is structural, not advisory.' },
    ],
    calculatedAt: nowIso(),
    scenarioId: args.scenarioId,
    inputHash: buildHash(inputs),
  };
}

export function buildFireTimelineTrace(args: {
  fireYears: number | null;
  fireProgressPct: number;
  fireCurrentAmt: number;
  fireTargetAmt: number;
  surplus: number;
  swrPct?: number;
  annualExpenses?: number;
}): CalculationTrace {
  const annualSavings = args.surplus * 12;
  const gap = Math.max(0, args.fireTargetAmt - args.fireCurrentAmt);
  const inputs: TraceInput[] = [
    { label: 'FIRE target', value: fmt(args.fireTargetAmt), source: 'fireMonteCarlo target_capital' },
    { label: 'Current investable NW', value: fmt(args.fireCurrentAmt), source: 'firePathEngine.investableNW' },
    { label: 'Annual savings (surplus × 12)', value: fmt(annualSavings), source: 'dashboardDataContract' },
  ];
  if (args.annualExpenses) {
    inputs.push({ label: 'Annual living expenses', value: fmt(args.annualExpenses), source: 'expenses ledger' });
  }
  if (args.swrPct) {
    inputs.push({ label: 'Safe withdrawal rate (SWR)', value: pct(args.swrPct), source: 'assumptions.SWR' });
  }

  const fv = args.fireYears === null
    ? 'Pending surplus'
    : args.fireYears === 0
      ? 'FIRE met'
      : `${args.fireYears} yr`;

  return {
    id: 'dashboard:fire-timeline',
    label: 'FIRE Timeline',
    finalValue: fv,
    plainEnglish:
      'FIRE Timeline is the simple-savings time-to-target: how many years of saving your current monthly surplus would it take to close the gap to your FIRE Number. The Monte Carlo engine refines this with volatility and sequencing, but this headline number is the deterministic anchor.',
    formula:
      'Years to FIRE = (FIRE Target − Current Investable NW) / (Monthly Surplus × 12)\nFIRE Number = Annual Expenses / SWR',
    expanded: gap > 0 && annualSavings > 0
      ? `Years = (${fmt(args.fireTargetAmt)} − ${fmt(args.fireCurrentAmt)}) / ${fmt(annualSavings)} = ${(gap / annualSavings).toFixed(1)} yr`
      : args.fireProgressPct >= 100
        ? 'Already at or above FIRE target.'
        : 'Pending — surplus ≤ 0.',
    inputs,
    assumptions: [
      { label: 'Compounding ignored in headline', value: 'Yes', source: 'Monte Carlo refines this' },
      { label: 'Withdrawal-rule basis', value: 'SWR (Trinity-style)', source: 'fireMonteCarlo' },
    ],
    dataSource: 'firePathEngine + canonical surplus',
    sourceEngine: 'firePathEngineRegimeAware + dashboardDataContract',
    included: [
      { label: 'Current investable NW', value: fmt(args.fireCurrentAmt) },
      { label: 'Future monthly savings (× 12)', value: fmt(annualSavings) },
    ],
    excluded: [
      { label: 'Investment returns / compounding', reason: 'Deterministic headline; MC engine adds growth.' },
      { label: 'Inflation drag', reason: 'Modelled in MC simulation, not headline.' },
    ],
    calculatedAt: nowIso(),
    inputHash: buildHash(inputs),
  };
}

// ─── Wealth Layers ──────────────────────────────────────────────────────────

export function buildWealthLayerTraces(
  layers: WealthLayers,
  scenarioId?: string,
): Record<'gross' | 'accessible' | 'liquidatable' | 'fire', CalculationTrace> {
  const d = layers.drivers;
  const t = nowIso();

  const gross: CalculationTrace = {
    id: 'dashboard:wealth-layers:gross',
    label: 'Gross Net Worth',
    finalValue: fmt(layers.grossNetWorth),
    plainEnglish:
      'Gross Net Worth is the same value as the headline Net Worth — raw assets minus debt with no haircuts applied.',
    formula: 'Gross NW = Total Assets − Total Liabilities',
    expanded: `Gross NW = ${fmt(d.raw.assets.cashOffset + d.raw.assets.super + d.raw.assets.ppor + d.raw.assets.settledIpValue + d.raw.assets.stocks + d.raw.assets.crypto + d.raw.assets.cars + d.raw.assets.iranProperty + d.raw.assets.otherAssets)} − ${fmt(d.raw.liabilities.ppoMortgage + d.raw.liabilities.settledIpLoans + d.raw.liabilities.otherDebts)} = ${fmt(layers.grossNetWorth)}`,
    inputs: [
      { label: 'Total Assets (raw)', value: fmt(d.raw.assets.cashOffset + d.raw.assets.super + d.raw.assets.ppor + d.raw.assets.settledIpValue + d.raw.assets.stocks + d.raw.assets.crypto + d.raw.assets.cars + d.raw.assets.iranProperty + d.raw.assets.otherAssets) },
      { label: 'Total Liabilities (raw)', value: fmt(d.raw.liabilities.ppoMortgage + d.raw.liabilities.settledIpLoans + d.raw.liabilities.otherDebts) },
    ],
    assumptions: [{ label: 'Scenario', value: scenarioId ?? 'current_law' }],
    dataSource: 'canonical ledger',
    sourceEngine: 'canonicalWealth.computeWealthLayers',
    included: [],
    excluded: [{ label: 'Locked equity haircut', reason: 'No haircut applied at this layer.' }],
    calculatedAt: t,
    scenarioId,
  };

  const accessible: CalculationTrace = {
    id: 'dashboard:wealth-layers:accessible',
    label: 'Accessible Net Worth',
    finalValue: fmt(layers.accessibleNetWorth),
    plainEnglish:
      'Accessible Net Worth removes equity that is locked away today: super, Iran property, and cars. It represents wealth you could actually deploy.',
    formula: 'Accessible NW = Gross NW − (Super + Iran Property + Cars)',
    expanded: `Accessible NW = ${fmt(layers.grossNetWorth)} − ${fmt(d.lockedEquity)} = ${fmt(layers.accessibleNetWorth)}`,
    inputs: [
      { label: 'Gross NW', value: fmt(layers.grossNetWorth) },
      { label: 'Super', value: fmt(d.raw.assets.super) },
      { label: 'Iran property', value: fmt(d.raw.assets.iranProperty) },
      { label: 'Cars', value: fmt(d.raw.assets.cars) },
    ],
    assumptions: [{ label: 'Locked categories', value: 'super, iran property, cars' }],
    dataSource: 'canonical ledger',
    sourceEngine: 'canonicalWealth.computeWealthLayers',
    included: [
      { label: 'Cash + Offset' }, { label: 'PPOR equity' }, { label: 'Settled IP equity' },
      { label: 'Stocks' }, { label: 'Crypto' }, { label: 'Other assets' },
    ],
    excluded: [
      { label: 'Super', reason: 'Preservation age locked.' },
      { label: 'Iran property', reason: 'FX + jurisdictional liquidity constraints.' },
      { label: 'Cars', reason: 'Not realistically deployable as wealth.' },
    ],
    calculatedAt: t,
    scenarioId,
  };

  const liquidatable: CalculationTrace = {
    id: 'dashboard:wealth-layers:liquidatable',
    label: 'Liquidatable Wealth',
    finalValue: fmt(layers.liquidatableWealth),
    plainEnglish:
      'Liquidatable Wealth applies a ~3.5% selling cost to PPOR and settled IPs — the realistic cash you would clear after agents, conveyancing and disposal costs.',
    formula: 'Liquidatable = Accessible NW − Selling Costs (PPOR + IP value × selling-cost %)',
    expanded: `Liquidatable = ${fmt(layers.accessibleNetWorth)} − ${fmt(d.sellingCost)} = ${fmt(layers.liquidatableWealth)}`,
    inputs: [
      { label: 'Accessible NW', value: fmt(layers.accessibleNetWorth) },
      { label: 'Property selling cost', value: fmt(d.sellingCost), source: 'WEALTH_ASSUMPTIONS.propertySellingCostPct' },
    ],
    assumptions: [
      { label: 'Property selling-cost %', value: '~3.5%', source: 'canonicalWealth.WEALTH_ASSUMPTIONS' },
    ],
    dataSource: 'canonical ledger',
    sourceEngine: 'canonicalWealth.computeWealthLayers',
    included: [{ label: 'PPOR + IP disposal costs', value: fmt(d.sellingCost) }],
    excluded: [{ label: 'Stock/crypto disposal slippage', reason: 'Already implicit in market price.' }],
    calculatedAt: t,
    scenarioId,
  };

  const fire: CalculationTrace = {
    id: 'dashboard:wealth-layers:fire',
    label: 'FIRE Capital',
    finalValue: fmt(layers.fireCapital),
    plainEnglish:
      'FIRE Capital is the post-tax, post-regime capital you would actually have after liquidating to support a Trinity-style withdrawal lifestyle.',
    formula: 'FIRE Capital = Liquidatable − CGT on IP gain − Reform-regime drag',
    expanded: `FIRE Capital = ${fmt(layers.liquidatableWealth)} − ${fmt(d.cgtOnIp)} − ${fmt(d.reformDrag)} = ${fmt(layers.fireCapital)}`,
    inputs: [
      { label: 'Liquidatable Wealth', value: fmt(layers.liquidatableWealth) },
      { label: 'CGT on IP gain', value: fmt(d.cgtOnIp), source: 'WEALTH_ASSUMPTIONS marginal × (1 − discount)' },
      { label: 'Reform regime drag', value: fmt(d.reformDrag), source: 'WEALTH_ASSUMPTIONS.reformLiquidationDragPct' },
    ],
    assumptions: [
      { label: 'CGT discount', value: '50%', source: 'WEALTH_ASSUMPTIONS' },
      { label: 'Marginal tax rate', value: '~37%', source: 'WEALTH_ASSUMPTIONS' },
      { label: 'Scenario', value: scenarioId ?? 'current_law' },
    ],
    dataSource: 'canonical ledger + active tax regime',
    sourceEngine: 'canonicalWealth.computeWealthLayers',
    included: [
      { label: 'CGT on embedded IP gain' },
      { label: 'Reform-regime liquidation drag (when scenario = reform)' },
    ],
    excluded: [{ label: 'Stamp duty on re-entry', reason: 'Out-of-scope for FIRE realisation view.' }],
    calculatedAt: t,
    scenarioId,
  };

  return { gross, accessible, liquidatable, fire };
}

// ─── Projection rows ────────────────────────────────────────────────────────

export function buildProjectionRowTraces(
  rows: WealthProjectionRow[],
  startNW: number,
  layers: WealthLayers | null,
): CalculationTrace[] {
  const t = nowIso();
  const out: CalculationTrace[] = [];
  for (const row of rows) {
    const yearsFromNow = row.year - new Date().getFullYear();

    // Total NW trace.
    out.push({
      id: `projection:total-nw:${row.year}`,
      label: `Total NW · ${row.year}`,
      finalValue: fmt(row.totalNetWorth),
      plainEnglish: `The deterministic projection's Total Net Worth for ${row.year}. Comes from the canonical projectNetWorth engine — same engine the Wealth Strategy hub consumes.`,
      formula: 'Total NW = Cash + Property Equity + Stocks + Crypto + Super − Liabilities',
      expanded: `Total NW = ${fmt(row.cash)} + ${fmt(row.propertyEquity)} + ${fmt(row.stocks)} + ${fmt(row.crypto)} + ${fmt(row.superTotal)} − ${fmt(Math.abs(row.liabilities))} = ${fmt(row.totalNetWorth)}`,
      inputs: [
        { label: 'Cash', value: fmt(row.cash) },
        { label: 'Property Equity', value: fmt(row.propertyEquity) },
        { label: 'Stocks', value: fmt(row.stocks) },
        { label: 'Crypto', value: fmt(row.crypto) },
        { label: 'Super', value: fmt(row.superTotal) },
        { label: 'Liabilities', value: `−${fmt(Math.abs(row.liabilities))}` },
      ],
      assumptions: [
        { label: 'Single assumption set', value: 'Deterministic — no volatility', source: 'finance.projectNetWorth' },
      ],
      dataSource: 'finance.projectNetWorth (10y horizon)',
      sourceEngine: 'finance.projectNetWorth',
      included: [
        { label: 'Cash compounding @ savings rate' },
        { label: 'Property appreciation @ growth %' },
        { label: 'Equity DCA + market growth' },
        { label: 'Super employer + concessional contributions' },
      ],
      excluded: [
        { label: 'Volatility / drawdowns', reason: 'Deterministic; Monte Carlo handles this.' },
        { label: 'Behavioural friction', reason: 'Modelled in Decision Engine, not here.' },
      ],
      calculatedAt: t,
      relatedIds: [`projection:cagr:${row.year}`, `projection:growth:${row.year}`],
    });

    // CAGR trace.
    out.push({
      id: `projection:cagr:${row.year}`,
      label: `CAGR · ${row.year}`,
      finalValue: pct(row.cagrPct),
      plainEnglish: `Compound Annual Growth Rate from today through ${row.year}: the constant annual rate of return that would take today's Net Worth to the projected Total NW over that period.`,
      formula: 'CAGR = (Final Value / Starting Value) ^ (1 / Years) − 1',
      expanded: yearsFromNow > 0 && startNW > 0
        ? `CAGR = (${fmt(row.totalNetWorth)} / ${fmt(startNW)}) ^ (1 / ${yearsFromNow}) − 1 = ${pct(row.cagrPct)}`
        : 'Insufficient data (years ≤ 0 or starting NW ≤ 0).',
      inputs: [
        { label: 'Starting NW (today)', value: fmt(startNW) },
        { label: 'Final NW', value: fmt(row.totalNetWorth) },
        { label: 'Years', value: yearsFromNow },
      ],
      assumptions: [{ label: 'Compounding basis', value: 'Annual' }],
      dataSource: 'finance.projectNetWorth output',
      sourceEngine: 'finance.projectNetWorth',
      included: [],
      excluded: [],
      calculatedAt: t,
    });

    // Annual growth trace.
    out.push({
      id: `projection:growth:${row.year}`,
      label: `Annual Growth · ${row.year}`,
      finalValue: `${row.growth >= 0 ? '+' : ''}${fmt(row.growth)}`,
      plainEnglish: `The dollar change in Total NW from the previous year. Captures both organic growth (compounding) and capital flows (savings, DCA, debt paydown).`,
      formula: 'Annual Growth(y) = Total NW(y) − Total NW(y−1)',
      expanded: `Annual Growth = ${fmt(row.growth)}`,
      inputs: [{ label: 'Total NW (this year)', value: fmt(row.totalNetWorth) }],
      assumptions: [],
      dataSource: 'finance.projectNetWorth output',
      sourceEngine: 'finance.projectNetWorth',
      included: [],
      excluded: [],
      calculatedAt: t,
    });

    // Property Equity trace.
    out.push({
      id: `projection:property-equity:${row.year}`,
      label: `Property Equity · ${row.year}`,
      finalValue: fmt(row.propertyEquity),
      plainEnglish: `Property Equity in ${row.year}: the projected value of every PPOR and settled / planned IP minus the outstanding loan balance for that year.`,
      formula: 'Property Equity = Σ (Property Value − Loan Balance)',
      expanded: `Property Equity = ${fmt(row.propertyEquity)}`,
      inputs: [{ label: 'Property Equity', value: fmt(row.propertyEquity) }],
      assumptions: [
        { label: 'PPOR growth %', source: 'finance.projectProperty' },
        { label: 'IP growth %', source: 'finance.projectProperty' },
        { label: 'Loan amortisation', source: 'finance.calcLoanBalance' },
      ],
      dataSource: 'finance.projectNetWorth → projectProperty',
      sourceEngine: 'finance.projectProperty',
      included: [{ label: 'PPOR' }, { label: 'Settled IPs' }, { label: 'Planned IPs (after settlement)' }],
      excluded: [{ label: 'Selling costs / CGT', reason: 'Pre-realisation equity.' }],
      calculatedAt: t,
    });
  }

  // Aggregate CAGR for the table footer (today → final row).
  if (rows.length > 0 && layers) {
    const finalRow = rows[rows.length - 1];
    const years = finalRow.year - new Date().getFullYear();
    const finalCagr =
      startNW > 0 && years > 0
        ? (Math.pow(finalRow.totalNetWorth / startNW, 1 / years) - 1) * 100
        : 0;
    out.push({
      id: 'projection:cagr:overall',
      label: `Projection CAGR · ${years} yr`,
      finalValue: pct(finalCagr),
      plainEnglish: `The compound annual growth rate the deterministic projection implies from today (${fmt(startNW)}) to ${finalRow.year} (${fmt(finalRow.totalNetWorth)}).`,
      formula: 'CAGR = (Final Value / Starting Value) ^ (1 / Years) − 1',
      expanded: `CAGR = (${fmt(finalRow.totalNetWorth)} / ${fmt(startNW)}) ^ (1 / ${years}) − 1 = ${pct(finalCagr)}`,
      inputs: [
        { label: 'Starting NW', value: fmt(startNW) },
        { label: 'Final projected NW', value: fmt(finalRow.totalNetWorth) },
        { label: 'Years', value: years },
      ],
      assumptions: [{ label: 'Deterministic, no volatility', value: 'Yes' }],
      dataSource: 'finance.projectNetWorth output',
      sourceEngine: 'finance.projectNetWorth',
      included: [],
      excluded: [],
      calculatedAt: t,
    });
  }

  return out;
}

// ─── Risk Radar axes ────────────────────────────────────────────────────────

export function buildRiskAxisTraces(
  surface: CanonicalRiskSurface,
  scenarioId?: string,
): CalculationTrace[] {
  const t = nowIso();
  return surface.radar.current.map(point => ({
    id: `risk:axis:${point.axis.toLowerCase().replace(/\s+/g, '-')}`,
    label: `${point.axis} (Risk Radar)`,
    finalValue: `${Math.round(point.score)} / 100`,
    plainEnglish: `${point.axis} score on the canonical 8-axis Risk Radar. ${point.detail} Higher is safer.`,
    formula: 'Axis score ∈ [0, 100] from canonical inputs (see source engine)',
    expanded: `${point.axis} = ${Math.round(point.score)} (safe ≥ ${surface.radar.safeZone[surface.radar.current.indexOf(point)]}, warn ≥ ${surface.radar.warningZone[surface.radar.current.indexOf(point)]})`,
    inputs: [{ label: point.axis, value: Math.round(point.score), note: point.detail }],
    assumptions: [
      { label: 'Safe zone', value: surface.radar.safeZone[surface.radar.current.indexOf(point)], source: 'canonicalRiskSurface.SAFE_ZONE' },
      { label: 'Warning zone', value: surface.radar.warningZone[surface.radar.current.indexOf(point)], source: 'canonicalRiskSurface.WARNING_ZONE' },
    ],
    dataSource: 'canonical ledger + active tax regime',
    sourceEngine: `canonicalRiskSurface.score${point.axis.replace(/\s+/g, '')}`,
    included: [{ label: point.detail }],
    excluded: [],
    calculatedAt: t,
    scenarioId,
  }));
}

export function buildFireFragilityTrace(
  fragility: FireFragility,
  scenarioId?: string,
): CalculationTrace {
  return {
    id: 'risk:fire-fragility',
    label: 'FIRE Fragility',
    finalValue: `${fragility.level} · ${Math.round(fragility.score)} / 100`,
    plainEnglish:
      'FIRE Fragility scores how robust the household\'s path to FIRE is against shocks — combining leverage, liquid runway, appreciation reliance and post-tax liquidation value. Lower score means more fragile.',
    formula: 'Fragility = f(leverage, liquidity months, appreciation reliance, post-tax liquidation)',
    expanded: fragility.summary,
    inputs: [
      { label: 'Leverage %', value: pct(fragility.drivers.leveragePct, 1) },
      { label: 'Liquidity months', value: fragility.drivers.liquidityMonths.toFixed(1) },
      { label: 'Appreciation reliance %', value: pct(fragility.drivers.appreciationReliancePct, 1) },
      { label: 'Post-tax liquidation value', value: fmt(fragility.drivers.postTaxLiquidationValue) },
    ],
    assumptions: [{ label: 'Bands', value: 'stable / moderate / high', source: 'canonicalRiskSurface' }],
    dataSource: 'canonical wealth layers + ledger',
    sourceEngine: 'canonicalRiskSurface.buildCanonicalRiskSurface (fragility)',
    included: [
      { label: 'Total LVR' }, { label: 'Liquid runway months' },
      { label: 'IP appreciation contribution' }, { label: 'Post-CGT liquidation value' },
    ],
    excluded: [{ label: 'Behavioural risk (overspend, churn)', reason: 'Handled in Decision Engine.' }],
    calculatedAt: nowIso(),
    scenarioId,
  };
}

// ─── Generic factories — re-usable for any module that wants to wire a metric

/**
 * Property Equity (single property) — used by Property page widgets and the
 * Family Plan summary. Pure pass-through of canonical fields.
 */
export function buildPropertyEquityTrace(args: {
  id: string;
  label: string;
  propertyValue: number;
  loanBalance: number;
  source?: string;
}): CalculationTrace {
  const equity = args.propertyValue - args.loanBalance;
  return {
    id: args.id,
    label: args.label,
    finalValue: fmt(equity),
    plainEnglish:
      'Property Equity is the share of the property you actually own — its current market value minus the outstanding loan balance.',
    formula: 'Property Equity = Property Value − Loan Balance',
    expanded: `Property Equity = ${fmt(args.propertyValue)} − ${fmt(args.loanBalance)} = ${fmt(equity)}`,
    inputs: [
      { label: 'Property Value', value: fmt(args.propertyValue), source: args.source ?? 'sf_properties' },
      { label: 'Loan Balance', value: fmt(args.loanBalance), source: 'sf_properties.loan_balance' },
    ],
    assumptions: [{ label: 'Pre-selling-cost', value: 'Yes' }],
    dataSource: args.source ?? 'sf_properties',
    sourceEngine: 'propertyBuyEngine / canonical ledger',
    included: [{ label: 'Live market value' }, { label: 'Outstanding loan' }],
    excluded: [{ label: 'Selling costs', reason: 'Applied at Liquidatable Wealth layer.' }, { label: 'CGT', reason: 'Applied at FIRE Capital layer.' }],
    calculatedAt: nowIso(),
  };
}

/**
 * CGT — Gross Capital Gain. Generic for CGT simulator + tax-alpha cards.
 */
export function buildCgtGrossGainTrace(args: {
  id: string;
  label: string;
  salePrice: number;
  sellingCosts: number;
  adjustedCostBase: number;
}): CalculationTrace {
  const gain = args.salePrice - args.sellingCosts - args.adjustedCostBase;
  return {
    id: args.id,
    label: args.label,
    finalValue: fmt(gain),
    plainEnglish:
      'Gross Capital Gain is the raw gain before CGT discounts or offsets — sale proceeds minus selling costs minus the adjusted cost base (purchase price + improvements + acquisition costs).',
    formula: 'Gross Capital Gain = Sale Price − Selling Costs − Adjusted Cost Base',
    expanded: `Gross Capital Gain = ${fmt(args.salePrice)} − ${fmt(args.sellingCosts)} − ${fmt(args.adjustedCostBase)} = ${fmt(gain)}`,
    inputs: [
      { label: 'Sale price', value: fmt(args.salePrice) },
      { label: 'Selling costs', value: fmt(args.sellingCosts) },
      { label: 'Adjusted cost base', value: fmt(args.adjustedCostBase) },
    ],
    assumptions: [{ label: 'CGT discount applied separately', value: 'Yes' }],
    dataSource: 'CGT simulator inputs',
    sourceEngine: 'cgt-simulator',
    included: [{ label: 'Selling costs (agent, conveyancing)' }, { label: 'Acquisition costs (in ACB)' }],
    excluded: [{ label: '50% discount', reason: 'Applied AFTER gross gain.' }, { label: 'Loss bank offsets', reason: 'Applied AFTER gross gain.' }],
    calculatedAt: nowIso(),
  };
}

/**
 * FIRE Number — generic so any module that surfaces a FIRE target uses one
 * canonical formula instead of inventing its own.
 */
export function buildFireNumberTrace(args: {
  id: string;
  label: string;
  annualExpenses: number;
  swrPct: number;
}): CalculationTrace {
  const fireNumber = args.annualExpenses / (args.swrPct / 100);
  return {
    id: args.id,
    label: args.label,
    finalValue: fmt(fireNumber),
    plainEnglish:
      'FIRE Number is the capital that, at a Safe Withdrawal Rate, can support your annual expenses indefinitely. Trinity-style: 4% SWR = 25× annual expenses.',
    formula: 'FIRE Number = Annual Expenses / SWR',
    expanded: `FIRE Number = ${fmt(args.annualExpenses)} / ${pct(args.swrPct, 1)} = ${fmt(fireNumber)}`,
    inputs: [
      { label: 'Annual Expenses', value: fmt(args.annualExpenses), source: 'expenses ledger × 12' },
      { label: 'SWR', value: pct(args.swrPct, 1), source: 'assumptions' },
    ],
    assumptions: [{ label: 'SWR basis', value: 'Trinity-style (4% rule)', source: 'fireMonteCarlo' }],
    dataSource: 'canonical expenses + SWR assumption',
    sourceEngine: 'firePathEngineRegimeAware / fireMonteCarlo',
    included: [{ label: 'Recurring expenses' }, { label: 'Bills' }],
    excluded: [
      { label: 'One-off / lumpy expenses', reason: 'Smoothed into annual figure.' },
      { label: 'Inflation', reason: 'Modelled in MC simulation, not here.' },
    ],
    calculatedAt: nowIso(),
  };
}
