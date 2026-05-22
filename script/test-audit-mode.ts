/**
 * Family Wealth Lab — Global Audit Mode / Calculation Trace test suite.
 *
 * Pure unit + static-grep tests (no DOM, no jsdom). Validates:
 *   1.  Registry behaviour (register/resolve/has/list/factory/reset)
 *   2.  Trace factories produce complete records with actual values
 *   3.  hashTraceInputs is deterministic + sensitive to order/value
 *   4.  Audit module surface: provider, hook, wrapper, panel, toggle
 *   5.  App.tsx mounts AuditModeProvider + CalculationTracePanel
 *   6.  Layout.tsx mounts AuditModeToggle in the header
 *   7.  ExecutiveDashboard wraps key metrics with AuditableMetric ids
 *   8.  ProjectionCardListMobile + CanonicalRiskSurface wrap their metrics
 *   9.  No engine math is duplicated in UI wrappers / trace factories
 *   10. Canonical engines (NW, wealth, risk, finance, tax) are untouched
 *
 * Run with:  tsx script/test-audit-mode.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  registerTrace, registerTraceFactory, resolveTrace, hasTrace,
  listTraceIds, unregisterTrace, __resetTraceRegistry,
} from '../client/src/lib/auditMode/auditRegistry';
import { hashTraceInputs, type CalculationTrace } from '../client/src/lib/auditMode/calculationTrace';
import {
  buildNetWorthTrace, buildMonthlySurplusTrace, buildFireNumberTrace,
  buildPropertyEquityTrace, buildCgtGrossGainTrace, buildProjectionRowTraces,
} from '../client/src/lib/auditMode/traceFactories';
import {
  buildAllMonteCarloTraces,
  MONTE_CARLO_TRACE_IDS,
  buildAllDecisionWinnerTraces,
  DECISION_WINNER_TRACE_IDS,
  buildAllBestMoveTraces,
  BESTMOVE_TRACE_IDS,
  buildAllFireTraces,
  FIRE_TRACE_IDS,
  buildAllForecastHeadlineTraces,
  FORECAST_TRACE_IDS,
  buildAllFinancialHealthTraces,
  FINANCIAL_HEALTH_TRACE_IDS,
  buildLegacyRiskCategoryTraces,
  buildLegacyRiskOverallTrace,
  LEGACY_RISK_RADAR_TRACE_IDS,
  buildAllDecisionCandidateTraces,
  buildDecisionRankingLogicTrace,
  buildDecisionTradeoffsTrace,
  buildDecisionLensTrace,
  buildLiveFinancialHealthTracesFromRiskRadar,
} from '../client/src/lib/auditMode/engineTraces';
import { COVERAGE_MANIFEST, REQUIRED_TRACE_IDS, ENGINE_LABELS } from '../client/src/lib/auditMode/coverageManifest';
import {
  buildWealthStrategyTraces,
  WEALTH_STRATEGY_TRACE_IDS,
} from '../client/src/lib/auditMode/engineTraces/wealthStrategyTraces';
import {
  buildAllPropertyPortfolioTraces,
  PROPERTY_TRACE_IDS,
} from '../client/src/lib/auditMode/engineTraces/propertyTraces';
import {
  buildAllFundingTraces,
  FUNDING_SOURCE_TRACE_IDS,
} from '../client/src/lib/auditMode/engineTraces/fundingSourceTraces';
import { ensureCoverageRegistered } from '../client/src/lib/auditMode/ensureCoverage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' - ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n- ${n}`);
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

// 1 - Registry
section('Registry');
__resetTraceRegistry();
const base: CalculationTrace = {
  id: 't:a', label: 'A', finalValue: '$1', plainEnglish: 'a', formula: 'f', expanded: 'f = 1',
  inputs: [], assumptions: [], dataSource: 'd', sourceEngine: 'e', included: [], excluded: [],
  calculatedAt: '2026-01-01T00:00:00.000Z',
};
registerTrace(base);
assert('register + has', hasTrace('t:a'));
assert('resolve returns trace', resolveTrace('t:a')?.label === 'A');
assert('listTraceIds includes id', listTraceIds().includes('t:a'));
let calls = 0;
registerTraceFactory('t:b', () => { calls++; return { ...base, id: 't:b', label: 'B' }; });
assert('factory is lazy', calls === 0);
assert('factory resolves', resolveTrace('t:b')?.label === 'B');
assert('factory invoked once on first resolve', calls === 1);
resolveTrace('t:b');
assert('factory re-invoked on each resolve', calls === 2);
unregisterTrace('t:a');
assert('unregister removes', !hasTrace('t:a'));
assert('resolve returns null for missing', resolveTrace('missing') === null);
__resetTraceRegistry();
assert('reset clears all', listTraceIds().length === 0);

// 2 - Trace factories
section('Trace factories');
const nw = buildNetWorthTrace({
  netWorth: 1_000_000,
  components: {
    cashTotal: 250_000, superTotal: 200_000, ppor: 800_000, ips: 700_000,
    stocks: 100_000, crypto: 50_000, cars: 30_000, iranProperty: 20_000,
    otherAssets: 10_000, mortgage: 600_000, ipsLoans: 500_000, otherDebts: 60_000,
  },
  lastCalculatedAt: '2026-01-01T00:00:00.000Z',
});
const REQ: (keyof CalculationTrace)[] = [
  'id','label','finalValue','plainEnglish','formula','expanded',
  'inputs','assumptions','dataSource','sourceEngine','included','excluded','calculatedAt',
];
for (const f of REQ) assert(`NW trace has '${String(f)}'`, (nw as any)[f] !== undefined && (nw as any)[f] !== null);
assert('NW formula: Total Assets - Total Liabilities', /Total Assets[^]*Total Liabilities/.test(nw.formula));
assert('NW expanded substitutes actual values', /\$[\d.]+/.test(nw.expanded));
assert('NW includes decomposition lines', nw.included.length >= 3);
assert('NW excludes planned IP equity', nw.excluded.some(e => /planned/i.test(e.label)));
assert('NW sourceEngine references canonical', /canonical/i.test(nw.sourceEngine));

const surplus = buildMonthlySurplusTrace({
  monthlyIncome: 18_000, monthlyExpenses: 11_000, monthlyDebtService: 4_000,
  passiveIncome: 1_200, surplus: 5_000,
});
assert('Surplus formula matches required text',
  /Surplus[^]*Income[^]*Living Expenses[^]*Debt Repayments[^]*Investment Contributions/i.test(surplus.formula));
assert('Surplus expanded includes "= $5"', /= \$5/.test(surplus.expanded));

const fire = buildFireNumberTrace({ id: 'x:fire', label: 'FIRE Number', annualExpenses: 100_000, swrPct: 4 });
assert('FIRE formula: Annual Expenses / SWR', /Annual Expenses[^]*SWR/i.test(fire.formula));
assert('FIRE Number ~ $2.50M', /\$2\.50M/.test(String(fire.finalValue)));

const peq = buildPropertyEquityTrace({ id: 'x:peq', label: 'Property Equity', propertyValue: 1_200_000, loanBalance: 700_000 });
assert('Property Equity formula', /Property Value[^]*Loan Balance/i.test(peq.formula));
assert('Property Equity = $500K', /\$500K/.test(String(peq.finalValue)));

const cgt = buildCgtGrossGainTrace({ id: 'x:cgt', label: 'CGT Gross Gain', salePrice: 900_000, sellingCosts: 25_000, adjustedCostBase: 600_000 });
assert('CGT formula: Sale - Selling - ACB', /Sale Price[^]*Selling Costs[^]*Adjusted Cost Base/i.test(cgt.formula));
assert('CGT gain = $275K', /\$275K/.test(String(cgt.finalValue)));

const rows = buildProjectionRowTraces(
  [{
    year: 2030, accessibleNetWorth: 1_500_000, totalNetWorth: 2_000_000, cagrPct: 12.5,
    growth: 200_000, cash: 100_000, liabilities: 500_000, propertyEquity: 1_400_000,
    stocks: 200_000, crypto: 50_000, superTotal: 250_000,
  }],
  1_000_000,
  null,
);
const ids = rows.map(r => r.id);
assert('row -> Total NW trace', ids.includes('projection:total-nw:2030'));
assert('row -> CAGR trace', ids.includes('projection:cagr:2030'));
assert('row -> Growth trace', ids.includes('projection:growth:2030'));
assert('row -> Property Equity trace', ids.includes('projection:property-equity:2030'));
const cagrT = rows.find(r => r.id === 'projection:cagr:2030')!;
assert('CAGR canonical formula', /Final Value[^]*Starting Value[^]*1\s*\/\s*Years/i.test(cagrT.formula));

// 3 - hash
section('hashTraceInputs');
const h1 = hashTraceInputs([{ label: 'A', value: 1 }, { label: 'B', value: 2 }]);
const h2 = hashTraceInputs([{ label: 'A', value: 1 }, { label: 'B', value: 2 }]);
const h3 = hashTraceInputs([{ label: 'B', value: 2 }, { label: 'A', value: 1 }]);
const h4 = hashTraceInputs([{ label: 'A', value: 1 }, { label: 'B', value: 3 }]);
assert('deterministic', h1 === h2);
assert('order-sensitive', h1 !== h3);
assert('value-sensitive', h1 !== h4);

// 4 - Module surface
section('Audit module surface');
const ctxSrc = read('client/src/lib/auditMode/AuditModeContext.tsx');
assert('AuditModeProvider exported', /export\s+function\s+AuditModeProvider/.test(ctxSrc));
assert('useAuditMode exported', /export\s+function\s+useAuditMode/.test(ctxSrc));
assert('context: auditMode + openTrace + closeTrace + toggleAuditMode',
  /auditMode:/.test(ctxSrc) && /openTrace/.test(ctxSrc) && /closeTrace/.test(ctxSrc) && /toggleAuditMode/.test(ctxSrc));

const amSrc = read('client/src/components/auditMode/AuditableMetric.tsx');
assert('AuditableMetric exported', /export\s+const\s+AuditableMetric/.test(amSrc));
assert('AuditableMetric renders <span> when off', /data-audit-mode=\"off\"/.test(amSrc));
assert('AuditableMetric renders <button> when on', /<button[\s\S]*type=\"button\"/.test(amSrc));
assert('AuditableMetric has no click indicator when off', /if\s*\(\s*!auditMode\s*\)/.test(amSrc));

const panelSrc = read('client/src/components/auditMode/CalculationTracePanel.tsx');
const PANEL_SECTIONS = [
  'trace-final-value','trace-section-plain-english','trace-section-formula',
  'trace-section-expanded','trace-section-inputs','trace-section-assumptions',
  'trace-section-included','trace-section-excluded','trace-section-provenance',
];
for (const s of PANEL_SECTIONS) assert(`Trace Panel renders '${s}'`, panelSrc.includes(s));

const togSrc = read('client/src/components/auditMode/AuditModeToggle.tsx');
assert('Toggle has button-audit-mode-toggle testid', /data-testid=\"button-audit-mode-toggle\"/.test(togSrc));
assert('Toggle label mentions Audit', /Audit/.test(togSrc));

// 5 - App wiring
section('Global wiring');
const layoutSrc = read('client/src/components/Layout.tsx');
assert('Layout imports AuditModeToggle', /AuditModeToggle/.test(layoutSrc));
assert('Layout renders <AuditModeToggle />', /<AuditModeToggle\s*\/>/.test(layoutSrc));

const appSrc = read('client/src/App.tsx');
assert('App imports AuditModeProvider', /AuditModeProvider/.test(appSrc));
assert('App imports CalculationTracePanel', /CalculationTracePanel/.test(appSrc));
assert('Provider mounted exactly once', (appSrc.match(/<AuditModeProvider/g) ?? []).length === 1);
assert('Panel mounted exactly once', (appSrc.match(/<CalculationTracePanel\s*\/>/g) ?? []).length === 1);

// 6 - Dashboard wiring
section('Dashboard hero + projection wiring');
const dashSrc = read('client/src/components/ExecutiveDashboard.tsx');
for (const id of ['dashboard:net-worth','dashboard:monthly-surplus','dashboard:risk-state','dashboard:fire-timeline']) {
  assert(`Hero metric wired: ${id}`, dashSrc.includes(`traceId="${id}"`));
}
assert('Wealth-layer values wrapped', /traceId=\{`dashboard:wealth-layers:\$\{layer\.id\}`\}/.test(dashSrc));
assert('Projection Total NW wrapped per row', /traceId=\{`projection:total-nw:\$\{row\.year\}`\}/.test(dashSrc));
assert('Projection CAGR wrapped per row', /traceId=\{`projection:cagr:\$\{row\.year\}`\}/.test(dashSrc));
assert('Projection Growth wrapped per row', /traceId=\{`projection:growth:\$\{row\.year\}`\}/.test(dashSrc));
assert('Overall projection CAGR wrapped', /traceId=\"projection:cagr:overall\"/.test(dashSrc));
assert('Dashboard registers traces via registerTrace', /registerTrace\(/.test(dashSrc));

const mobSrc = read('client/src/components/ProjectionCardListMobile.tsx');
assert('Mobile cards import AuditableMetric', /AuditableMetric/.test(mobSrc));
assert('Mobile cards wrap Total NW', /traceId=\{`projection:total-nw:\$\{row\.year\}`\}/.test(mobSrc));
assert('Mobile cards wrap CAGR', /traceId=\{`projection:cagr:\$\{row\.year\}`\}/.test(mobSrc));

const riskSrc = read('client/src/components/CanonicalRiskSurface.tsx');
assert('Risk surface imports AuditableMetric', /AuditableMetric/.test(riskSrc));
assert('Risk surface wraps each axis score', /traceId=\{`risk:axis:\$\{p\.axis\.toLowerCase\(\)/.test(riskSrc));
assert('Risk surface wraps FIRE fragility', /traceId=\"risk:fire-fragility\"/.test(riskSrc));

// 7 - No duplication / engines untouched
section('No engine duplication in UI; canonical engines untouched');
const factSrc = read('client/src/lib/auditMode/traceFactories.ts');
assert('traceFactories imports CanonicalNetWorthResult as TYPE',
  /import\s+type\s+\{[^}]*CanonicalNetWorthResult/.test(factSrc));
assert('traceFactories imports WealthLayers as TYPE',
  /import\s+type\s+\{[^}]*WealthLayers/.test(factSrc));
assert('traceFactories does NOT call computeCanonicalNetWorth/computeWealthLayers',
  !/computeCanonicalNetWorth\(|computeWealthLayers\(/.test(factSrc));
assert('traceFactories does NOT call buildCanonicalRiskSurface/projectNetWorth',
  !/buildCanonicalRiskSurface\(|projectNetWorth\(/.test(factSrc));
for (const f of ['client/src/lib/canonicalNetWorth.ts','client/src/lib/canonicalWealth.ts',
                 'client/src/lib/canonicalRiskSurface.ts','client/src/lib/finance.ts',
                 'client/src/lib/australianTax.ts']) {
  assert(`${f} does not import auditMode`, !/auditMode/.test(read(f)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 — Engine trace factories (Monte Carlo, Decision, FIRE, Forecast, FH)
// ─────────────────────────────────────────────────────────────────────────────
section('Engine trace factories — Monte Carlo');

const fakeMcResult: any = {
  probFireByTarget: 72.3,
  medianFireYear: 2042,
  p10FireYear: 2050,
  p90FireYear: 2038,
  neverFirePct: 8.2,
  fanData: [],
  fireYearHistogram: [],
  fireProbByAge: [{ age: 50, probability: 25 }, { age: 60, probability: 80 }],
  nwP10AtTarget: 2_300_000,
  nwP50AtTarget: 3_800_000,
  nwP90AtTarget: 5_400_000,
  offsetVsEtf: null,
  propAcquisitionProb: 0,
  probCashShortfall: 11.4,
  probNegCashflow: 13.7,
  highestRiskYear: 2029,
  biggestRiskDriver: 'mortgage rate jump',
  keyRisks: [],
  recommendedActions: [],
  ranAt: '2026-05-22T08:00:00.000Z',
  simulationCount: 5000,
  runtimeMs: 1234,
};
const fakeMcSettings: any = {
  currentAge: 36, targetFireAge: 55, targetPassiveMonthly: 20_000, swrPct: 4,
  simulationCount: 5000, meanStockReturn: 8.5, meanPropertyReturn: 5.5,
  meanCryptoReturn: 15, meanSuperReturn: 8, meanInflation: 3, meanIncomeGrowth: 3,
  meanExpenseGrowth: 3, meanMortgageRate: 6.5,
  volStocks: 18, volProperty: 6, volCrypto: 80, volSuper: 12, volInflation: 1.5,
  rhoStocksCrypto: 0.3, rhoInflationRates: 0.6, rhoRatesProperty: -0.3, rhoStocksProperty: 0.2,
};
const mcTraces = buildAllMonteCarloTraces(fakeMcResult, fakeMcSettings);
assert('MC traces produced for every required id',
  MONTE_CARLO_TRACE_IDS.every(id => mcTraces.some(t => t.id === id)),
  `expected ${MONTE_CARLO_TRACE_IDS.length}, got ${mcTraces.length}`);
const mcFireProb = mcTraces.find(t => t.id === 'mc:fire-probability')!;
assert('MC FIRE probability finalValue is %', /72\.3%/.test(String(mcFireProb.finalValue)));
const mcP50 = mcTraces.find(t => t.id === 'mc:p50-nw-at-target')!;
assert('MC P50 NW finalValue contains $', /\$/.test(String(mcP50.finalValue)));
assert('MC confidence band uses P90 − P10', /P90 NW − P10 NW/i.test(mcTraces.find(t => t.id === 'mc:confidence-bands')!.formula));
assert('MC neg-cashflow risk pins biggestRiskDriver', /mortgage rate jump/.test(String(mcTraces.find(t => t.id === 'mc:neg-cashflow-risk')!.expanded)));
assert('MC traces include calculatedAt timestamp', mcTraces.every(t => !!t.calculatedAt));
assert('MC traces have sourceEngine = fireMonteCarlo', mcTraces.every(t => /fireMonteCarlo/i.test(t.sourceEngine)));

section('Engine trace factories — Decision Engine winner');
const decisionTraces = buildAllDecisionWinnerTraces({
  winnerId: 'cand_001', winnerLabel: 'Property + ETF mix',
  totalScore: 78.4, baseScore: 84.2,
  weights: { survivalProbability: 0.30, liquidityFactor: 0.20, riskAdjustedReturn: 0.25, terminalNetWorth: 0.25 },
  breakdown: [
    { axis: 'survivalProbability', rawValue: 0.85, normalisedValue: 0.85, weight: 0.30, contribution: 25.5 },
    { axis: 'liquidityFactor',     rawValue: 0.72, normalisedValue: 0.72, weight: 0.20, contribution: 14.4 },
    { axis: 'riskAdjustedReturn',  rawValue: 0.07, normalisedValue: 0.70, weight: 0.25, contribution: 17.5 },
    { axis: 'terminalNetWorth',    rawValue: 3_500_000, normalisedValue: 0.70, weight: 0.25, contribution: 17.5 },
  ],
  penalties: [
    { id: 'refinancePressure', magnitude: 5.8, reason: 'elevated band', band: 'elevated' },
  ],
  rationale: ['Strong survival', 'Healthy liquidity', 'Top RAR'],
  headline: 'Property + ETF balances safety and growth.',
  whyWon: ['Beats runner-up on RAR by 2pp', 'Lower refinance pressure'],
  whatCouldInvalidate: ['Rates jump >75bps', 'Income falls >10%'],
  runnerUpReason: 'ETF-only ranked #2 for tighter liquidity but lower RAR.',
  investorProfile: 'balanced',
  generatedAt: '2026-05-22T08:00:00.000Z',
});
assert('Decision winner traces produced for every id',
  DECISION_WINNER_TRACE_IDS.every(id => decisionTraces.some(t => t.id === id)));
assert('Decision total score = 78', /78/.test(String(decisionTraces.find(t => t.id === 'decision:winner:total-score')!.finalValue)));
assert('Decision component scores expanded uses axis × weight × 100', /×/.test(decisionTraces.find(t => t.id === 'decision:winner:component-scores')!.expanded));
assert('Decision penalties trace lists refinancePressure', /refinancePressure/.test(decisionTraces.find(t => t.id === 'decision:winner:penalties')!.expanded));
assert('Decision why-this-ranks contains "Beats runner-up"', /Beats runner-up/.test(decisionTraces.find(t => t.id === 'decision:winner:why-this-ranks')!.expanded));
assert('Decision why-not-ranked-higher lists rate jump', /Rates jump/.test(decisionTraces.find(t => t.id === 'decision:winner:why-not-ranked-higher')!.expanded));
assert('Decision recommendation logic includes profile', /balanced/.test(decisionTraces.find(t => t.id === 'decision:winner:recommendation-logic')!.expanded));

section('Engine trace factories — Best Move (Recommendation engine)');
const bestMoveTraces = buildAllBestMoveTraces({
  id: 'rec_001', title: 'Build 3-month emergency buffer',
  actionType: 'build_emergency_buffer', pillar: 'protect_liquidity',
  priorityRank: 1, confidenceScore: 0.86, urgency: 'this_quarter', riskLevel: 'Low',
  expectedFinancialImpact: { annualDollar: 0, expectedReturnPct: 5.5, afterTaxReturnPct: 4.2, label: 'safety buffer' },
  liquidityImpact: { deltaDeployableCash: 10_000, deltaRunwayMonths: 1 },
  fireImpact: { yearsDelta: -0.2, probabilityDelta: 0.04 },
  netWorthImpact: { horizonYears: 10, delta: 5000 },
  riskReductionImpact: { points: 8, categoriesAffected: ['liquidity'] },
  opportunityCost: { description: 'cash held vs ETF', annualDollar: 800 },
  implementationSteps: [{ step: 'Open HISA' }],
  whatCouldChangeRecommendation: ['Income drop >15%', 'New large debt taken on'],
  alternativeOptions: [{ title: 'Skip', whyAlternative: 'high MC stress', tradeoff: 'fragility' }],
  reviewTrigger: { condition: 'buffer hits 3mo', reviewByISO: '2026-08-22T00:00:00.000Z', watchSignals: ['cash_offset'] },
  sourceSignalsUsed: ['snapshot', 'ledger_income_expense', 'cash_offset'],
  surfaces: ['best_move', 'risk', 'action_centre'],
  reasoning: 'Liquidity scoring shows <2 months runway; safety pillar overrides growth.',
  benefitLabel: '+ 1 month runway',
} as any);
assert('Best Move traces produced for every id',
  BESTMOVE_TRACE_IDS.every(id => bestMoveTraces.some(t => t.id === id)));
const bmTotal = bestMoveTraces.find(t => t.id === 'decision:bestmove:total-score')!;
assert('Best Move total score formula uses priorityRank', /priorityRank/.test(bmTotal.formula));
assert('Best Move why-this-ranks pins reasoning', /Liquidity scoring/.test(bestMoveTraces.find(t => t.id === 'decision:bestmove:why-this-ranks')!.expanded));

section('Engine trace factories — FIRE Engine');
const fireResult: any = {
  scenarios: [{ id: 'etf', label: 'ETF', fire_year: 2042 }, { id: 'property', label: 'Property', fire_year: 2045 }],
  best_scenario: 'etf', best_label: 'ETF', best_fire_year: 2042, fastest_vs_slowest_years: 3,
  target_capital: 6_000_000, target_passive_income: 20_000, current_progress_pct: 48,
  investable_now: 1_200_000, super_now: 300_000, total_nw_now: 2_500_000, fire_gap: 4_500_000,
  recommendation: '', semi_fire_year: 2038, data_coverage: 'full', missing_fields: [],
  sensitivity: {},
};
const fireSettings: any = {
  safe_withdrawal_rate: 4.0, desired_monthly_passive: 20_000,
  property_cagr: 5.0, etf_return_pct: 8.5, general_inflation_pct: 2.8, include_super_in_fire: true,
};
const fireTraces = buildAllFireTraces(fireResult, fireSettings);
assert('FIRE traces produced for every required id',
  FIRE_TRACE_IDS.every(id => fireTraces.some(t => t.id === id)));
assert('FIRE date finalValue = 2042', /2042/.test(String(fireTraces.find(t => t.id === 'fire:date')!.finalValue)));
assert('FIRE capital target uses Trinity formula', /Annual passive[^]*SWR|Passive[^]*SWR/i.test(fireTraces.find(t => t.id === 'fire:capital-target')!.formula));
assert('FIRE swr-used = 4.0%', /4\.0%/.test(String(fireTraces.find(t => t.id === 'fire:swr-used')!.finalValue)));
assert('FIRE passive-gap pins gap dollar', String(fireTraces.find(t => t.id === 'fire:passive-gap')!.finalValue).includes('M'));
assert('FIRE time-saved-lost = ±3yr', /±?3\s?yr/.test(String(fireTraces.find(t => t.id === 'fire:time-saved-lost')!.finalValue)));

section('Engine trace factories — Forecast headlines');
const forecastFinalRow: any = {
  year: 2036, accessibleNetWorth: 4_200_000, totalNetWorth: 5_500_000, cagrPct: 8.2,
  growth: 320_000, cash: 300_000, liabilities: 800_000, propertyEquity: 3_500_000,
  stocks: 800_000, crypto: 200_000, superTotal: 1_300_000,
};
const forecastLayers: any = {
  grossNetWorth: 2_500_000, accessibleNetWorth: 1_800_000,
  liquidatableWealth: 1_700_000, fireCapital: 1_500_000,
  drivers: {
    raw: { assets: {}, liabilities: {} },
    lockedEquity: 0, sellingCost: 70_000, cgtOnIp: 100_000, reformDrag: 50_000,
  },
};
const forecastTraces = buildAllForecastHeadlineTraces({
  startNetWorth: 2_500_000,
  finalRow: forecastFinalRow,
  layers: forecastLayers,
  annualCashflow: 60_000,
  scenarioId: 'current_law',
});
assert('Forecast headline traces produced for every required id',
  FORECAST_TRACE_IDS.every(id => forecastTraces.some(t => t.id === id)));
assert('Forecast NW final value contains $', /\$/.test(String(forecastTraces.find(t => t.id === 'forecast:net-worth')!.finalValue)));
assert('Forecast CAGR formula uses Final / Starting', /Final NW \/ Starting NW/.test(forecastTraces.find(t => t.id === 'forecast:cagr')!.formula));
assert('Forecast cashflow uses surplus × 12', /Monthly Surplus × 12/i.test(forecastTraces.find(t => t.id === 'forecast:cashflow')!.formula));
assert('Forecast property equity = 2036 row value', String(forecastTraces.find(t => t.id === 'forecast:property-equity')!.finalValue).includes('M'));

section('Engine trace factories — Financial Health (8-axis + Risk Radar legacy)');
const surface: any = {
  radar: {
    current: [
      { axis: 'Liquidity', score: 72, detail: '3.2 mo cover' },
      { axis: 'Leverage', score: 60, detail: '52% LVR' },
      { axis: 'Cashflow', score: 85, detail: '30% surplus' },
      { axis: 'Concentration', score: 75, detail: 'spread' },
      { axis: 'Property Exposure', score: 60, detail: '65% NW' },
      { axis: 'Interest Rate', score: 70, detail: '6.5% rate' },
      { axis: 'Tax Reform', score: 90, detail: 'current law' },
      { axis: 'FIRE Delay', score: 65, detail: 'on track' },
    ],
    safeZone: [75, 75, 75, 75, 75, 75, 75, 75],
    warningZone: [50, 50, 50, 50, 50, 50, 50, 50],
  },
  fragility: { level: 'stable', score: 75, summary: '', drivers: { leveragePct: 52, liquidityMonths: 3.2, appreciationReliancePct: 35, postTaxLiquidationValue: 1_500_000 } },
};
const fhTraces = buildAllFinancialHealthTraces(surface, { score: 72, label: 'Stable' }, 'current_law');
assert('FH traces produced for every required id',
  FINANCIAL_HEALTH_TRACE_IDS.every(id => fhTraces.some(t => t.id === id)));
assert('FH Liquidity finalValue = 72/100', /72\s*\/\s*100/.test(String(fhTraces.find(t => t.id === 'financial-health:liquidity')!.finalValue)));
assert('FH Overall expanded uses mean of axes', /mean\(/i.test(fhTraces.find(t => t.id === 'financial-health:overall')!.expanded));

const legacyResult: any = {
  overall_score: 68, overall_level: 'amber', overall_label: 'Moderate Risk',
  categories: [
    { id: 'debt', label: 'Debt Risk', icon: '🏦', score: 60, level: 'amber', factors: [{ id: 'debt_ratio', label: 'Debt-to-Assets', value: '55%', benchmark: '<40%', score: 55, level: 'amber', finding: '...', action: '...', weight: 35 }], summary: 'Moderate' },
    { id: 'cashflow', label: 'Cashflow Risk', icon: '💸', score: 80, level: 'green', factors: [], summary: 'Healthy' },
    { id: 'investment', label: 'Investment Risk', icon: '📈', score: 70, level: 'green', factors: [], summary: 'Spread' },
    { id: 'income', label: 'Income Risk', icon: '💼', score: 60, level: 'amber', factors: [], summary: 'Single' },
  ],
  top_risks: [], top_mitigations: [], alerts: [], radar_data: [], fragility_index: 32, data_coverage: 'full',
};
const legacyOverall = buildLegacyRiskOverallTrace(legacyResult);
const legacyCats = buildLegacyRiskCategoryTraces(legacyResult);
assert('Legacy overall finalValue contains 68/100', /68\s*\/\s*100/.test(String(legacyOverall.finalValue)));
assert('Legacy category traces = 4', legacyCats.length === 4);
assert('Legacy cat ids match required', LEGACY_RISK_RADAR_TRACE_IDS.slice(1).every(id => legacyCats.some(t => t.id === id)));

// ─────────────────────────────────────────────────────────────────────────────
// 9 — Coverage manifest
// ─────────────────────────────────────────────────────────────────────────────
section('Audit Coverage manifest');
assert('Manifest is non-empty', COVERAGE_MANIFEST.length > 0);
assert('Required ids array is non-empty', REQUIRED_TRACE_IDS.length > 0);
const requiredIdSet = new Set(REQUIRED_TRACE_IDS);
assert('Manifest covers all Monte Carlo ids', MONTE_CARLO_TRACE_IDS.every(id => requiredIdSet.has(id)));
assert('Manifest covers all Decision Winner ids', DECISION_WINNER_TRACE_IDS.every(id => requiredIdSet.has(id)));
assert('Manifest covers all Best Move ids', BESTMOVE_TRACE_IDS.every(id => requiredIdSet.has(id)));
assert('Manifest covers all FIRE ids', FIRE_TRACE_IDS.every(id => requiredIdSet.has(id)));
assert('Manifest covers all Forecast ids', FORECAST_TRACE_IDS.every(id => requiredIdSet.has(id)));
assert('Manifest covers all Financial Health ids', FINANCIAL_HEALTH_TRACE_IDS.every(id => requiredIdSet.has(id)));
assert('Manifest covers legacy risk-radar ids', LEGACY_RISK_RADAR_TRACE_IDS.every(id => requiredIdSet.has(id)));
const allEngines = new Set(COVERAGE_MANIFEST.map(e => e.engine));
for (const k of allEngines) assert(`Engine label exists for ${k}`, !!ENGINE_LABELS[k]);
assert('No duplicate ids in manifest',
  new Set(COVERAGE_MANIFEST.map(e => e.id)).size === COVERAGE_MANIFEST.length);

// ─────────────────────────────────────────────────────────────────────────────
// 10 — Coverage guard: every required id must be registerable
// ─────────────────────────────────────────────────────────────────────────────
section('Coverage guard — every required trace can be registered + resolved');
__resetTraceRegistry();
// Register every engine-trace bundle at once so the coverage check has no
// false negatives caused by host components not being mounted in the test.
mcTraces.forEach(registerTrace);
decisionTraces.forEach(registerTrace);
bestMoveTraces.forEach(registerTrace);
fireTraces.forEach(registerTrace);
forecastTraces.forEach(registerTrace);
fhTraces.forEach(registerTrace);
registerTrace(legacyOverall);
legacyCats.forEach(registerTrace);
buildWealthStrategyTraces({
  cash: 60_000, monthlyExpenses: 10_000, monthlyIncome: 18_000, monthlySurplus: 5_000,
  totalAssets: 2_000_000, totalDebt: 600_000, investableAssets: 700_000, fireTarget: 5_400_000,
}).forEach(registerTrace);
// Also register the pre-existing dashboard / wealth-layer / risk-fragility ids
// from PR #43 so the full manifest resolves green.
const nw2 = buildNetWorthTrace({
  netWorth: 1_000_000,
  components: {
    cashTotal: 250_000, superTotal: 200_000, ppor: 800_000, ips: 700_000,
    stocks: 100_000, crypto: 50_000, cars: 30_000, iranProperty: 20_000,
    otherAssets: 10_000, mortgage: 600_000, ipsLoans: 500_000, otherDebts: 60_000,
  },
  lastCalculatedAt: '2026-01-01T00:00:00.000Z',
});
registerTrace(nw2);
const surplus2 = buildMonthlySurplusTrace({
  monthlyIncome: 18_000, monthlyExpenses: 11_000, monthlyDebtService: 4_000,
  passiveIncome: 1_200, surplus: 5_000,
});
registerTrace(surplus2);
// Stub out dashboard:risk-state, dashboard:fire-timeline, wealth-layers, risk-fragility.
const stub = (id: string, label: string): CalculationTrace => ({
  id, label, finalValue: '—', plainEnglish: 'stub', formula: 'stub', expanded: 'stub',
  inputs: [], assumptions: [], dataSource: 'test-stub', sourceEngine: 'test-stub',
  included: [], excluded: [], calculatedAt: '2026-01-01T00:00:00.000Z',
});
for (const id of [
  'dashboard:risk-state', 'dashboard:fire-timeline',
  'dashboard:wealth-layers:gross', 'dashboard:wealth-layers:accessible',
  'dashboard:wealth-layers:liquidatable', 'dashboard:wealth-layers:fire',
  'risk:fire-fragility',
  // MC Expected Returns assumption traces (registered by AI Forecast Engine page)
  'assumptions:mc:expected-return:property',
  'assumptions:mc:expected-return:stocks',
  'assumptions:mc:expected-return:crypto',
  'assumptions:mc:expected-return:super',
]) {
  registerTrace(stub(id, id));
}
buildAllPropertyPortfolioTraces({
  portfolioValue: 1_000_000, portfolioLoans: 600_000, portfolioEquity: 400_000,
  portfolioLVR: 60, monthlyPortfolioCF: 100, propertyCount: 2,
}).forEach(registerTrace);
// Funding source / equity release / emergency buffer / negative gearing traces
// (Property page boundary — #FWL_Critical_StatePersistence_FundingSource_TaxRegime_Fix).
buildAllFundingTraces({
  plans: [{
    propertyId: 1, propertyName: 'IP1',
    plan: {
      source: 'equity-release', deposit: 150_000,
      cashUsed: 0, offsetUsed: 0, equityReleased: 150_000,
      stocksSold: 0, cryptoSold: 0, debtIncreaseFromEquityRelease: 150_000,
    },
  }],
  openingCash: 220_000,
  netCashflowOverHorizon: 50_000,
  closingCashAfterFunding: 220_000,
  monthlyExpenses: 14_540,
  existingLoanBalance: 1_200_000,
  activeRegimeKind: 'PROPOSED_2027_REFORM',
  activeRegimeLabel: 'Proposed 2027 reform',
  negativeGearing: [{
    propertyName: 'IP1',
    currentLawRefund: 8_000,
    reformRefund: 0,
    lossQuarantined: 18_000,
    carriedForwardLoss: 18_000,
    refundAppliedToCashflow: 0,
    appliedRefundScenario: 'proposed_reform',
  }],
}).forEach(registerTrace);

const missing = REQUIRED_TRACE_IDS.filter(id => !hasTrace(id));
assert(`All required trace ids are registerable (missing: ${missing.join(', ') || 'none'})`, missing.length === 0);
for (const id of REQUIRED_TRACE_IDS) {
  const t = resolveTrace(id);
  assert(`Trace ${id} resolves with a non-null record`, t !== null);
  if (t) {
    assert(`Trace ${id} has formula`, typeof t.formula === 'string' && t.formula.length > 0);
    assert(`Trace ${id} has expanded`, typeof t.expanded === 'string' && t.expanded.length > 0);
    assert(`Trace ${id} has calculatedAt`, typeof t.calculatedAt === 'string' && t.calculatedAt.length > 0);
    assert(`Trace ${id} has sourceEngine`, typeof t.sourceEngine === 'string' && t.sourceEngine.length > 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11 — Coverage host-component wiring (static grep)
// ─────────────────────────────────────────────────────────────────────────────
section('Coverage host-component wiring (static grep)');
const mcSrc = read('client/src/components/MonteCarloDashboard.tsx');
assert('MonteCarloDashboard imports AuditableMetric', /AuditableMetric/.test(mcSrc));
assert('MonteCarloDashboard imports buildAllMonteCarloTraces', /buildAllMonteCarloTraces/.test(mcSrc));
assert('MonteCarloDashboard registers MC traces', /buildAllMonteCarloTraces\(/.test(mcSrc));
for (const id of ['mc:fire-probability', 'mc:p10-nw-at-target', 'mc:p50-nw-at-target', 'mc:p90-nw-at-target', 'mc:confidence-bands', 'mc:neg-cashflow-risk', 'mc:reach-goal-probabilities']) {
  assert(`MonteCarloDashboard wraps ${id}`, mcSrc.includes(`traceId="${id}"`) || mcSrc.includes(`traceId=\`${id}\``));
}

const decSrc = read('client/src/pages/decision.tsx');
assert('decision.tsx imports buildAllDecisionWinnerTraces', /buildAllDecisionWinnerTraces/.test(decSrc));
for (const id of ['decision:winner:total-score', 'decision:winner:recommendation-logic', 'decision:winner:weightings', 'decision:winner:why-this-ranks', 'decision:winner:why-not-ranked-higher', 'decision:winner:component-scores', 'decision:winner:penalties']) {
  assert(`decision.tsx wraps ${id}`, decSrc.includes(`traceId="${id}"`));
}

const bmSrc = read('client/src/components/BestMoveCard.tsx');
assert('BestMoveCard imports buildAllBestMoveTraces', /buildAllBestMoveTraces/.test(bmSrc));
for (const id of ['decision:bestmove:recommendation-logic', 'decision:bestmove:total-score', 'decision:bestmove:why-this-ranks', 'decision:bestmove:weightings', 'decision:bestmove:component-scores', 'decision:bestmove:penalties', 'decision:bestmove:why-not-ranked-higher']) {
  assert(`BestMoveCard wraps ${id}`, bmSrc.includes(`traceId="${id}"`));
}

const fpSrc = read('client/src/pages/fire-path.tsx');
assert('fire-path.tsx imports buildAllFireTraces', /buildAllFireTraces/.test(fpSrc));
// fire-path uses both literal traceId="…" (best year, swr) and dynamic
// traceId={traceId} bound from a per-KPI object literal — both render to the
// same set of ids at runtime, so we accept either form in the static grep.
for (const id of ['fire:date', 'fire:capital-target', 'fire:swr-used', 'fire:passive-gap', 'fire:time-saved-lost']) {
  const wrapped =
    fpSrc.includes(`traceId="${id}"`) ||
    fpSrc.includes(`traceId='${id}'`) ||
    fpSrc.includes(`traceId: '${id}'`);
  assert(`fire-path.tsx wraps ${id}`, wrapped);
}

const rrSrc = read('client/src/pages/risk-radar.tsx');
assert('risk-radar.tsx imports legacy trace builders', /buildLegacyRiskOverallTrace/.test(rrSrc));
assert('risk-radar.tsx wraps overall score', /traceId="risk-radar:overall"/.test(rrSrc));
assert('risk-radar.tsx wraps each category', /traceId=\{`risk-radar:category:\$\{c\.id\}`\}/.test(rrSrc));

const dashSrc2 = read('client/src/components/ExecutiveDashboard.tsx');
assert('ExecutiveDashboard registers FH traces', /buildAllFinancialHealthTraces/.test(dashSrc2));
assert('ExecutiveDashboard registers Forecast headline traces', /buildAllForecastHeadlineTraces/.test(dashSrc2));

// ─────────────────────────────────────────────────────────────────────────────
// 12 — Engines untouched (extended)
// ─────────────────────────────────────────────────────────────────────────────
section('Engines untouched (Monte Carlo / FIRE / risk / decision / recommendation)');
for (const f of [
  'client/src/lib/fireMonteCarlo.ts',
  'client/src/lib/firePathEngine.ts',
  'client/src/lib/firePathEngineRegimeAware.ts',
  'client/src/lib/riskEngine.ts',
  'client/src/lib/forecastEngine.ts',
  'client/src/lib/scenarioV2/decisionEngine/candidateGenerator.ts',
  'client/src/lib/scenarioV2/registry/scoring.ts',
  'client/src/lib/recommendationEngine/engine.ts',
]) {
  assert(`${f} does not import auditMode`, !/auditMode/.test(read(f)));
}

// ─────────────────────────────────────────────────────────────────────────────
// 13 — Coverage Report panel + dev route mounted
// ─────────────────────────────────────────────────────────────────────────────
section('Coverage Report panel + dev route');
const reportSrc = read('client/src/components/auditMode/AuditCoverageReport.tsx');
assert('AuditCoverageReport exports component', /export\s+(function|const)\s+AuditCoverageReport|export\s+default\s+AuditCoverageReport/.test(reportSrc));
assert('AuditCoverageReport reads COVERAGE_MANIFEST', /COVERAGE_MANIFEST/.test(reportSrc));
assert('AuditCoverageReport subscribes to registry', /subscribeRegistry/.test(reportSrc));
assert('AuditCoverageReport has Total / Connected / Unconnected stats', /Total auditable metrics/.test(reportSrc) && /Connected/.test(reportSrc) && /Unconnected/.test(reportSrc));

const auditPageSrc = read('client/src/pages/audit-coverage.tsx');
assert('audit-coverage page mounts AuditCoverageReport', /<AuditCoverageReport/.test(auditPageSrc));

const appSrc2 = read('client/src/App.tsx');
assert('App.tsx mounts /audit-coverage route', /path="\/audit-coverage"/.test(appSrc2));
assert('App.tsx calls ensureCoverageRegistered at boot', /ensureCoverageRegistered\(\)/.test(appSrc2));

// ─────────────────────────────────────────────────────────────────────────────
// 14 — Wealth Strategy Hub trace factories
// ─────────────────────────────────────────────────────────────────────────────
section('Wealth Strategy Hub trace factories');
const wsArgs = {
  cash: 60_000, monthlyExpenses: 10_000, monthlyIncome: 18_000, monthlySurplus: 5_000,
  totalAssets: 2_000_000, totalDebt: 600_000, investableAssets: 700_000, fireTarget: 5_400_000,
};
const wsTraces = buildWealthStrategyTraces(wsArgs);
assert('Wealth Strategy traces = 5 (incl. net-position)', wsTraces.length === 5);
assert('Wealth Strategy ids match manifest', WEALTH_STRATEGY_TRACE_IDS.every(id => wsTraces.some(t => t.id === id)));
assert('Cash Buffer expanded contains 6.0 months', /6\.00 months/.test(wsTraces.find(t => t.id === 'wealth-strategy:cash-buffer')!.expanded));
assert('Savings Rate expanded contains 27.78%', /27\.78%/.test(wsTraces.find(t => t.id === 'wealth-strategy:savings-rate')!.expanded));
assert('Debt/Assets expanded contains 30.00%', /30\.00%/.test(wsTraces.find(t => t.id === 'wealth-strategy:debt-to-assets')!.expanded));
assert('Freedom Progress expanded contains 12.96%', /12\.96%/.test(wsTraces.find(t => t.id === 'wealth-strategy:freedom-progress')!.expanded));
for (const t of wsTraces) {
  assert(`WS trace ${t.id} has finalValue`, t.finalValue !== null && t.finalValue !== undefined);
  assert(`WS trace ${t.id} has formula`, t.formula.length > 0);
  assert(`WS trace ${t.id} has sourceEngine`, t.sourceEngine.length > 0);
}

// Static-grep: wealth-strategy.tsx wires the 4 KPIs.
const wsSrc = read('client/src/pages/wealth-strategy.tsx');
assert('wealth-strategy.tsx imports buildWealthStrategyTraces', /buildWealthStrategyTraces/.test(wsSrc));
assert('wealth-strategy.tsx imports AuditableMetric', /AuditableMetric/.test(wsSrc));
for (const id of WEALTH_STRATEGY_TRACE_IDS) {
  assert(`wealth-strategy.tsx wraps ${id}`, wsSrc.includes(`traceId="${id}"`));
}
// And manifest covers them.
for (const id of WEALTH_STRATEGY_TRACE_IDS) {
  assert(`Manifest covers ${id}`, REQUIRED_TRACE_IDS.includes(id));
}

// ─────────────────────────────────────────────────────────────────────────────
// 15 — Boot-time ensureCoverageRegistered: report sees 100% from manifest alone
// ─────────────────────────────────────────────────────────────────────────────
section('ensureCoverageRegistered — registry shows 100% coverage at boot');
__resetTraceRegistry();
// Pre-condition: empty registry → every id is unconnected.
assert('Before ensureCoverage: every manifest id is missing',
  COVERAGE_MANIFEST.every(e => !hasTrace(e.id)));
ensureCoverageRegistered();
// Post-condition: every manifest id is resolvable, with a complete trace shape.
const stillMissing = COVERAGE_MANIFEST.filter(e => !hasTrace(e.id)).map(e => e.id);
assert(`After ensureCoverage: every manifest id is registered (missing: ${stillMissing.join(', ') || 'none'})`,
  stillMissing.length === 0);
for (const e of COVERAGE_MANIFEST) {
  const t = resolveTrace(e.id);
  assert(`Boot trace ${e.id} resolves`, t !== null);
  if (t) {
    assert(`Boot trace ${e.id} has non-empty formula`, t.formula.length > 0);
    assert(`Boot trace ${e.id} has non-empty expanded`, t.expanded.length > 0);
    assert(`Boot trace ${e.id} has calculatedAt`, t.calculatedAt.length > 0);
    assert(`Boot trace ${e.id} has sourceEngine`, t.sourceEngine.length > 0);
  }
}
// Live overwrite must replace placeholder.
const sample = COVERAGE_MANIFEST[0];
const before = resolveTrace(sample.id);
registerTrace({
  ...(before as CalculationTrace),
  finalValue: 'LIVE-OVERWRITE',
  expanded: 'LIVE expanded',
});
const after = resolveTrace(sample.id);
assert(`Live registerTrace overwrites placeholder for ${sample.id}`, after?.finalValue === 'LIVE-OVERWRITE');

// Regression: AuditCoverageReport reads buildRows from registry; with
// ensureCoverageRegistered called at App boot, the rendered report would
// compute connected = COVERAGE_MANIFEST.length.
const connectedCount = COVERAGE_MANIFEST.filter(e => hasTrace(e.id)).length;
assert(`Coverage report Connected count = manifest length (got ${connectedCount}/${COVERAGE_MANIFEST.length})`,
  connectedCount === COVERAGE_MANIFEST.length);

// Engines-untouched extended for Wealth Strategy Hub: page does import auditMode,
// but the engine files it consumes (riskEngine, finance) still must not.
assert('client/src/lib/riskEngine.ts still does not import auditMode', !/auditMode/.test(read('client/src/lib/riskEngine.ts')));
assert('client/src/lib/finance.ts does not import auditMode', !/auditMode/.test(read('client/src/lib/finance.ts')));

// ─────────────────────────────────────────────────────────────────────────────
// 16 — Audit Coverage navigation: hidden when OFF, visible only when ON
// ─────────────────────────────────────────────────────────────────────────────
section('Audit Coverage nav — gated behind Audit Mode ON');
const layoutSrcNav = read('client/src/components/Layout.tsx');
assert('Layout imports useAuditMode', /useAuditMode/.test(layoutSrcNav));
assert('Layout reads auditMode flag', /const \{ auditMode \} = useAuditMode\(\)/.test(layoutSrcNav));
assert('Layout has Admin · Developer Tools section', /Admin · Developer Tools/.test(layoutSrcNav));
assert('Layout gates Admin Tools section on auditMode flag', /\{auditMode && \(/.test(layoutSrcNav));
assert('Layout exposes nav-audit-coverage test id', /data-testid="nav-audit-coverage"/.test(layoutSrcNav));
assert('Layout link target is /audit-coverage', /["\/]audit-coverage["]/.test(layoutSrcNav));
assert('Layout uses Microscope icon for Audit Coverage', /Microscope/.test(layoutSrcNav));
// The Audit Coverage nav appears ONLY inside the auditMode-gated branch — make
// sure no unconditional /audit-coverage Link is rendered in the sidebar.
const navAuditMatches = (layoutSrcNav.match(/data-testid="nav-audit-coverage"/g) ?? []).length;
assert('Layout renders exactly one Audit Coverage nav entry', navAuditMatches === 1);

// ─────────────────────────────────────────────────────────────────────────────
// 17 — Discoverability: representative non-/audit-coverage surfaces wire
//      AuditableMetric so users can open traces from where they appear.
// ─────────────────────────────────────────────────────────────────────────────
section('Discoverability — non-/audit-coverage surfaces wire AuditableMetric');
const exDashSrc = read('client/src/components/ExecutiveDashboard.tsx');
assert('ExecutiveDashboard wraps Best Move recommendation', /traceId="decision:bestmove:recommendation-logic"/.test(exDashSrc));
assert('ExecutiveDashboard wraps Best Move impact', /traceId="decision:bestmove:component-scores"/.test(exDashSrc));

const fcEngineSrc = read('client/src/pages/ai-forecast-engine.tsx');
assert('Forecast Engine page imports AuditableMetric', /AuditableMetric/.test(fcEngineSrc));
assert('Forecast Engine page wires P10', /traceId="mc:p10-nw-at-target"/.test(fcEngineSrc));
assert('Forecast Engine page wires P50', /traceId="mc:p50-nw-at-target"/.test(fcEngineSrc));
assert('Forecast Engine page wires P90', /traceId="mc:p90-nw-at-target"/.test(fcEngineSrc));
// Per-goal trace ids replaced the shared aggregate on the visible cards
// (the aggregate trace is still registered for cross-page consumers).
assert('Forecast Engine page wires reach-3m', /traceId="mc:reach-3m"/.test(fcEngineSrc));
assert('Forecast Engine page wires reach-5m', /traceId="mc:reach-5m"/.test(fcEngineSrc));
assert('Forecast Engine page wires reach-10m', /traceId="mc:reach-10m"/.test(fcEngineSrc));
assert('Forecast Engine page wires Financial Freedom Prob', /traceId="mc:financial-freedom-prob"/.test(fcEngineSrc));
assert('Forecast Engine page wires Negative Cashflow Risk', /traceId="mc:neg-cashflow-risk"/.test(fcEngineSrc));
assert('Forecast Engine page wires Cash Shortfall Risk', /traceId="mc:cash-shortfall-risk"/.test(fcEngineSrc));

const propertySrc = read('client/src/pages/property.tsx');
assert('Property page imports AuditableMetric', /from "@\/components\/auditMode\/AuditableMetric"/.test(propertySrc));
assert('Property page imports buildAllPropertyPortfolioTraces', /buildAllPropertyPortfolioTraces/.test(propertySrc));
assert('Property page wraps Portfolio Value', /property:portfolio:value/.test(propertySrc));
assert('Property page wraps Portfolio Loans', /property:portfolio:loans/.test(propertySrc));
assert('Property page wraps Portfolio Equity', /property:portfolio:equity/.test(propertySrc));
assert('Property page wraps Portfolio LVR', /property:portfolio:lvr/.test(propertySrc));
assert('Property page wraps Portfolio Cashflow', /property:portfolio:cashflow/.test(propertySrc));
// Confirm the property tile actually renders the value inside AuditableMetric.
assert('Property page renders AuditableMetric in KPI tile loop', /<AuditableMetric traceId=\{s\.traceId\}/.test(propertySrc));

// ─────────────────────────────────────────────────────────────────────────────
// 18 — Property portfolio trace factories produce complete records
// ─────────────────────────────────────────────────────────────────────────────
section('Property portfolio trace factories');
const propTraces = buildAllPropertyPortfolioTraces({
  portfolioValue: 2_400_000,
  portfolioLoans: 1_400_000,
  portfolioEquity: 1_000_000,
  portfolioLVR: 58.3,
  monthlyPortfolioCF: -250,
  propertyCount: 3,
});
assert('Property portfolio traces = 5', propTraces.length === 5);
for (const id of PROPERTY_TRACE_IDS) {
  const t = propTraces.find(x => x.id === id);
  assert(`Property trace ${id} present`, !!t);
  if (t) {
    assert(`Property trace ${id} has finalValue`, t.finalValue !== null && t.finalValue !== undefined);
    assert(`Property trace ${id} has formula`, t.formula.length > 0);
    assert(`Property trace ${id} has sourceEngine`, t.sourceEngine.length > 0);
    assert(`Property trace ${id} included in manifest`, REQUIRED_TRACE_IDS.includes(id));
  }
}
assert('Equity trace expanded uses actual values',
  /\$2,400,000 − \$1,400,000 = \$1,000,000/.test(
    propTraces.find(t => t.id === 'property:portfolio:equity')!.expanded));

// ─────────────────────────────────────────────────────────────────────────────
// 19 — Audit indicator — hover/focus class wired on AuditableMetric
// ─────────────────────────────────────────────────────────────────────────────
section('Audit indicator — hover/focus class wired');
const auditableSrc = read('client/src/components/auditMode/AuditableMetric.tsx');
assert('AuditableMetric uses fwl-audit-metric class', /fwl-audit-metric/.test(auditableSrc));
const cssSrc = read('client/src/index.css');
assert('index.css defines .fwl-audit-metric', /\.fwl-audit-metric\s*\{/.test(cssSrc));
assert('index.css defines :hover state', /\.fwl-audit-metric:hover/.test(cssSrc));

// ─────────────────────────────────────────────────────────────────────────────
// 19b — Native-page discoverability gaps (PR #44 QA follow-up)
// ─────────────────────────────────────────────────────────────────────────────
section('Native-page discoverability — Decision Engine');
const decisionSrc = read('client/src/pages/decision.tsx');
assert('decision.tsx imports per-candidate trace builder', /buildAllDecisionCandidateTraces/.test(decisionSrc));
assert('decision.tsx imports ranking-logic builder', /buildDecisionRankingLogicTrace/.test(decisionSrc));
assert('decision.tsx imports trade-off builder', /buildDecisionTradeoffsTrace/.test(decisionSrc));
assert('decision.tsx imports lens builder', /buildDecisionLensTrace/.test(decisionSrc));
assert('decision.tsx wires ranking-logic affordance', /traceId="decision:ranking-logic"/.test(decisionSrc));
assert('decision.tsx wires trade-off affordance', /traceId="decision:trade-off-analysis"/.test(decisionSrc));
assert('decision.tsx wires lens trace ids', /traceId=\{`decision:lens:\$\{lens\.key\}`\}/.test(decisionSrc));

const strategyCardSrc = read('client/src/components/decisionEngine/StrategyCard.tsx');
assert('StrategyCard wraps per-candidate score', /traceId=\{`decision:candidate:\$\{candidate\.id\}:total-score`\}/.test(strategyCardSrc));
assert('StrategyCard wraps per-candidate rationale', /traceId=\{`decision:candidate:\$\{candidate\.id\}:rationale`\}/.test(strategyCardSrc));
assert('StrategyCard wraps trade-off section', /traceId="decision:trade-off-analysis"/.test(strategyCardSrc));

section('Native-page discoverability — Risk Radar');
const riskRadarSrc = read('client/src/pages/risk-radar.tsx');
assert('risk-radar imports canonical financial-health builder', /buildLiveFinancialHealthTracesFromRiskRadar/.test(riskRadarSrc));
assert('risk-radar wires canonical Liquidity affordance', /traceId="financial-health:liquidity"/.test(riskRadarSrc));
assert('risk-radar wires canonical Leverage affordance', /traceId="financial-health:leverage"/.test(riskRadarSrc));
assert('risk-radar wires canonical Cashflow affordance', /traceId="financial-health:cashflow"/.test(riskRadarSrc));
assert('risk-radar wires canonical FIRE Progress affordance', /traceId="financial-health:fire-progress"/.test(riskRadarSrc));
assert('risk-radar wires canonical Overall Health affordance', /traceId="financial-health:overall"/.test(riskRadarSrc));
assert('risk-radar useMemo guards before early return (no hook order swap)', /useMemo\([\s\S]*?if \(!hasSnap\) return null;/.test(riskRadarSrc));

section('Native-page discoverability — Wealth Strategy Hub');
const wealthStratSrc = read('client/src/pages/wealth-strategy.tsx');
assert('wealth-strategy wires Net Position trace at hero', /traceId="wealth-strategy:net-position"/.test(wealthStratSrc));
assert('wealth-strategy wires Cash Buffer signal tile', /traceId="wealth-strategy:cash-buffer"[\s\S]{0,250}derived\.monthsBuffer/.test(wealthStratSrc));
assert('wealth-strategy wires Savings Rate signal tile', /traceId="wealth-strategy:savings-rate"[\s\S]{0,250}derived\.savingsRate/.test(wealthStratSrc));
assert('wealth-strategy wires Debt/Assets signal tile', /traceId="wealth-strategy:debt-to-assets"[\s\S]{0,250}derived\.debtToAsset/.test(wealthStratSrc));
assert('wealth-strategy wires Freedom Progress signal tile', /traceId="wealth-strategy:freedom-progress"[\s\S]{0,250}derived\.fireProgressPct/.test(wealthStratSrc));
// Hub-level live registration (NOT only in AICoach sub-component). The hub
// useEffect must build traces from `derived.*` and pass them to registerTrace
// so the live values overwrite the boot-time placeholders the moment the
// /wealth-strategy hub page mounts.
assert('wealth-strategy hub registers live traces from derived',
  /buildWealthStrategyTraces\(\{[\s\S]{0,400}cash: derived\.liquidity,[\s\S]{0,400}totalAssets: derived\.totalAssets,[\s\S]{0,400}fireTarget: derived\.requiredFIRE,[\s\S]{0,80}\}\)\.forEach\(registerTrace\)/.test(wealthStratSrc));
// Two distinct registration sites (hub + AICoach inner) so coverage is
// guaranteed regardless of which tab is active.
const wealthRegMatches = wealthStratSrc.match(/buildWealthStrategyTraces\(\{/g) ?? [];
assert('wealth-strategy buildWealthStrategyTraces called at hub AND AICoach', wealthRegMatches.length >= 2);

section('Native-page discoverability — Monte Carlo / AI Forecast Engine');
assert('ai-forecast-engine imports registerTrace', /import \{ registerTrace \} from "@\/lib\/auditMode\/auditRegistry"/.test(fcEngineSrc));
assert('ai-forecast-engine registers live mc traces in useEffect', /registerTrace\([\s\S]*?nwTrace\(/.test(fcEngineSrc));
assert('ai-forecast-engine registers live fire-probability id', /registerTrace\(\{[\s\S]{0,1200}id: 'mc:fire-probability'/.test(fcEngineSrc));
assert('ai-forecast-engine registers live confidence-bands id', /id: 'mc:confidence-bands'/.test(fcEngineSrc));
assert('ai-forecast-engine registers live median-fire-year id', /id: 'mc:median-fire-year'/.test(fcEngineSrc));
// Per-goal trace ids — each visible $X tile must open its own live trace,
// not the aggregate. The browser QA flagged that a single shared id is
// ambiguous in the trace panel.
assert('ai-forecast-engine $3M card uses mc:reach-3m', /traceId="mc:reach-3m"/.test(fcEngineSrc));
assert('ai-forecast-engine $5M card uses mc:reach-5m', /traceId="mc:reach-5m"/.test(fcEngineSrc));
assert('ai-forecast-engine $10M card uses mc:reach-10m', /traceId="mc:reach-10m"/.test(fcEngineSrc));
assert('ai-forecast-engine registers per-goal reach-3m trace', /registerTrace\(reachTrace\('mc:reach-3m'/.test(fcEngineSrc));
assert('ai-forecast-engine registers per-goal reach-5m trace', /registerTrace\(reachTrace\('mc:reach-5m'/.test(fcEngineSrc));
assert('ai-forecast-engine registers per-goal reach-10m trace', /registerTrace\(reachTrace\('mc:reach-10m'/.test(fcEngineSrc));

section('Native-page discoverability — Decision Engine universal affordance row');
const decisionSrc2 = read('client/src/pages/decision.tsx');
for (const id of [
  'decision:winner:component-scores',
  'decision:winner:weightings',
  'decision:winner:penalties',
  'decision:winner:why-this-ranks',
  'decision:winner:why-not-ranked-higher',
  'decision:ranking-logic',
  'decision:trade-off-analysis',
  'decision:winner:recommendation-logic',
]) {
  assert(`decision.tsx universal affordance row wires ${id}`,
    new RegExp(`<AuditableMetric traceId="${id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"`).test(decisionSrc2));
}

section('Trace factories — FIRE Progress numeric live (no redirect text)');
// Case 1: extras provided → numeric, formula uses actual values.
const fhWithExtras = buildLiveFinancialHealthTracesFromRiskRadar({
  overall_score: 67, overall_level: 'amber', overall_label: 'Moderate', fragility_index: 12,
  categories: [
    { id: 'debt',       label: 'Debt Risk',       icon: '🏦', score: 72, level: 'green', factors: [{ id: 'debt_ratio', label: 'Debt/Assets', value: '38%', benchmark: '<40%', score: 80, weight: 1, level: 'green', finding: 'OK', action: 'ok' }], summary: '' },
    { id: 'cashflow',   label: 'Cashflow Risk',   icon: '💸', score: 60, level: 'amber', factors: [{ id: 'cash_buffer', label: 'Cash Buffer', value: '4.2 months', benchmark: '≥3', score: 78, weight: 1, level: 'green', finding: '', action: '' }, { id: 'surplus_ratio', label: 'Surplus Ratio', value: '22%', benchmark: '≥20%', score: 70, weight: 1, level: 'green', finding: '', action: '' }], summary: '' },
    { id: 'investment', label: 'Investment Risk', icon: '📈', score: 55, level: 'amber', factors: [], summary: '' },
    { id: 'income',     label: 'Income Risk',     icon: '💼', score: 65, level: 'amber', factors: [], summary: '' },
  ],
  top_risks: [], alerts: [], radar_data: [], data_coverage: 'full' as any,
} as any, { investable: 600_000, annualExpenses: 264_000, swr: 0.04 });
const fhFireLive = fhWithExtras.find(x => x.id === 'financial-health:fire-progress')!;
assert('FIRE Progress finalValue is "N / 100" numeric',
  /^\d+\s*\/\s*100$/.test(String(fhFireLive.finalValue)));
assert('FIRE Progress finalValue is NOT "see FIRE Path"', !/see FIRE Path/i.test(String(fhFireLive.finalValue)));
assert('FIRE Progress expanded shows annual_expenses arithmetic',
  /annual_expenses\s*=\s*\$264,000/.test(fhFireLive.expanded));
assert('FIRE Progress expanded shows SWR',
  /SWR\s*=\s*4\.0%/.test(fhFireLive.expanded));
assert('FIRE Progress expanded shows FIRE_target_capital arithmetic',
  /FIRE_target_capital = annual_expenses \/ SWR = \$6,600,000/.test(fhFireLive.expanded));
assert('FIRE Progress source attributes "live page derivation"',
  /live page derivation/.test(fhFireLive.dataSource));
// Case 2: no extras + no fire_progress_pct → still a numeric 0 / 100, never redirect text.
const fhNoExtras = buildLiveFinancialHealthTracesFromRiskRadar({
  overall_score: 67, overall_level: 'amber', overall_label: 'Moderate', fragility_index: 12,
  categories: [
    { id: 'debt', label: 'Debt Risk', icon: '🏦', score: 72, level: 'green', factors: [], summary: '' },
    { id: 'cashflow', label: 'Cashflow Risk', icon: '💸', score: 60, level: 'amber', factors: [], summary: '' },
    { id: 'investment', label: 'Investment Risk', icon: '📈', score: 55, level: 'amber', factors: [], summary: '' },
    { id: 'income', label: 'Income Risk', icon: '💼', score: 65, level: 'amber', factors: [], summary: '' },
  ],
  top_risks: [], alerts: [], radar_data: [], data_coverage: 'full' as any,
} as any);
const fhFireNoExtras = fhNoExtras.find(x => x.id === 'financial-health:fire-progress')!;
assert('FIRE Progress fallback finalValue is "0 / 100" (numeric, never redirect)',
  String(fhFireNoExtras.finalValue) === '0 / 100');
assert('FIRE Progress fallback expanded never contains "see FIRE Path"',
  !/see FIRE Path/i.test(fhFireNoExtras.expanded));

// risk-radar.tsx wires the live extras (investable, annualExpenses, swr).
const riskRadarSrc2 = read('client/src/pages/risk-radar.tsx');
assert('risk-radar passes investable to buildLiveFinancialHealthTracesFromRiskRadar',
  /buildLiveFinancialHealthTracesFromRiskRadar\(resultWithFireProgress as any, \{[\s\S]{0,200}investable,/.test(riskRadarSrc2));
assert('risk-radar passes annualExpenses to live FH builder',
  /annualExpenses,/.test(riskRadarSrc2));
assert('risk-radar passes SWR to live FH builder', /swr:\s*0\.04/.test(riskRadarSrc2));

section('Trace factories — Decision Engine extended');
const candidateTraces = buildAllDecisionCandidateTraces({
  rank: 2,
  candidate: {
    id: 'cand-2',
    label: 'ETF DCA',
    headline: 'Steady DCA',
    score: {
      score: 64,
      baseScore: 71,
      breakdown: [
        { axis: 'survivalProbability', rawValue: 0.95, normalisedValue: 0.95, weight: 0.35, contribution: 33.25 },
        { axis: 'liquidityFactor',     rawValue: 1.5,  normalisedValue: 0.6,  weight: 0.25, contribution: 15.0 },
      ],
      penalties: [{ id: 'leverage', magnitude: 7, reason: 'IP LVR > 80%', band: 'elevated' }],
    },
    rationale: ['Liquidity buffer at 1.5×', 'Low default-prob exposure'],
  },
  investorProfile: 'balanced',
  generatedAt: '2026-05-22T00:00:00.000Z',
});
assert('Candidate trace bundle has 4 entries', candidateTraces.length === 4);
assert('Candidate total-score id matches pattern', candidateTraces[0].id === 'decision:candidate:cand-2:total-score');
assert('Candidate component-scores id matches pattern', candidateTraces[1].id === 'decision:candidate:cand-2:component-scores');
assert('Candidate score expanded shows arithmetic', /Score = 48\.25 − 7\.00 = 64\.00/.test(candidateTraces[0].expanded));

const rankingLogic = buildDecisionRankingLogicTrace({
  candidates: [
    { id: 'a', label: 'Top', score: 78, rank: 1 },
    { id: 'b', label: 'Runner', score: 64, rank: 2 },
  ],
  investorProfile: 'balanced',
  riskMode: 'balanced',
  weights: { survivalProbability: 0.35, liquidityFactor: 0.25 },
  totalGenerated: 12,
  totalDiscarded: 4,
  generatedAt: '2026-05-22T00:00:00.000Z',
});
assert('Ranking logic trace id', rankingLogic.id === 'decision:ranking-logic');
assert('Ranking logic expanded names every candidate', /#1 Top/.test(rankingLogic.expanded) && /#2 Runner/.test(rankingLogic.expanded));
assert('Ranking logic expanded names discarded count', /Filtered out \(behavioural \/ safety\): 4/.test(rankingLogic.expanded));

const tradeoffs = buildDecisionTradeoffsTrace({
  candidateLabel: 'ETF DCA',
  candidateId: 'cand-2',
  rank: 2,
  tradeOffs: { returnPotential: 0.6, riskExposure: 0.3, liquidity: 0.7, cashflowSafety: 0.8, taxEfficiency: 0.5, volatilityTolerance: 0.4 },
  investorProfile: 'balanced',
  generatedAt: '2026-05-22T00:00:00.000Z',
});
assert('Trade-off trace id', tradeoffs.id === 'decision:trade-off-analysis');
assert('Trade-off trace expanded shows all six axes', /Return potential/.test(tradeoffs.expanded) && /Volatility tolerance/.test(tradeoffs.expanded));

const lensTrace = buildDecisionLensTrace({
  lensKey: 'wealthMax',
  lensLabel: 'Wealth Max',
  winnerLabel: 'Levered Property',
  winnerId: 'cand-x',
  score: 82,
  whyThisWins: 'Emphasises terminal NW + RAR',
  investorProfile: 'balanced',
  generatedAt: '2026-05-22T00:00:00.000Z',
});
assert('Lens trace id', lensTrace.id === 'decision:lens:wealthMax');
assert('Lens trace finalValue mentions winner', /Levered Property/.test(String(lensTrace.finalValue)));

section('Trace factories — Live financial-health from risk-radar');
const fhLive = buildLiveFinancialHealthTracesFromRiskRadar({
  overall_score: 67,
  overall_level: 'amber',
  overall_label: 'Moderate',
  fragility_index: 12,
  categories: [
    { id: 'debt',       label: 'Debt Risk',       icon: '🏦', score: 72, level: 'green', factors: [{ id: 'debt_ratio', label: 'Debt/Assets', value: '38%', benchmark: '<40%', score: 80, weight: 1, level: 'green', finding: 'OK', action: 'ok' }], summary: '' },
    { id: 'cashflow',   label: 'Cashflow Risk',   icon: '💸', score: 60, level: 'amber', factors: [{ id: 'cash_buffer',   label: 'Cash Buffer',     value: '4.2 months', benchmark: '≥3', score: 78, weight: 1, level: 'green', finding: '', action: '' }, { id: 'surplus_ratio', label: 'Surplus Ratio', value: '22%', benchmark: '≥20%', score: 70, weight: 1, level: 'green', finding: '', action: '' }], summary: '' },
    { id: 'investment', label: 'Investment Risk', icon: '📈', score: 55, level: 'amber', factors: [], summary: '' },
    { id: 'income',     label: 'Income Risk',     icon: '💼', score: 65, level: 'amber', factors: [], summary: '' },
  ],
  top_risks: [],
  alerts: [],
  radar_data: [],
  data_coverage: 'full' as any,
  fire_progress_pct: 27.5,
} as any);
assert('Financial-health live bundle returns 5 traces', fhLive.length === 5);
for (const id of ['financial-health:liquidity', 'financial-health:leverage', 'financial-health:cashflow', 'financial-health:fire-progress', 'financial-health:overall']) {
  const t = fhLive.find(x => x.id === id);
  assert(`Live FH trace ${id} present`, !!t);
  if (t) {
    assert(`Live FH trace ${id} finalValue populated`, t.finalValue !== null && t.finalValue !== undefined && String(t.finalValue).length > 0);
    assert(`Live FH trace ${id} formula populated`, t.formula.length > 0);
    assert(`Live FH trace ${id} sourceEngine populated`, t.sourceEngine.length > 0);
  }
}
const fhFire = fhLive.find(x => x.id === 'financial-health:fire-progress')!;
assert('FIRE Progress trace pulls live fire_progress_pct', /27\.5/.test(fhFire.expanded));

section('Trace factories — Wealth Strategy net-position');
const wsTracesNP = buildWealthStrategyTraces({
  cash: 300_000, monthlyExpenses: 22_000, monthlyIncome: 32_000, monthlySurplus: 10_000,
  totalAssets: 4_000_000, totalDebt: 1_400_000, investableAssets: 700_000, fireTarget: 2_400_000,
});
assert('Wealth strategy bundle returns 5 traces (incl. net-position)', wsTracesNP.length === 5);
const netPos = wsTracesNP.find(x => x.id === 'wealth-strategy:net-position');
assert('Net Position trace present', !!netPos);
if (netPos) {
  assert('Net Position expanded uses actual values', /\$4,000,000 − \$1,400,000 = \$2,600,000/.test(netPos.expanded));
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 — Canonical engines remain untouched (extended)
// ─────────────────────────────────────────────────────────────────────────────
section('Canonical engines remain untouched (extended)');
const engineFilesToCheck = [
  'client/src/lib/equityEngine.ts',
  'client/src/lib/canonicalWealth.ts',
  'client/src/lib/canonicalRiskSurface.ts',
  'client/src/lib/recommendationEngine.ts',
  'client/src/lib/monteCarloEngine.ts',
  'client/src/lib/monteCarloCanonical.ts',
  'client/src/lib/monteCarloV4.ts',
  'client/src/lib/monteCarloV5.ts',
  'client/src/lib/taxPolicyEngine.ts',
  'client/src/lib/taxRulesEngine.ts',
];
for (const f of engineFilesToCheck) {
  try {
    const src = read(f);
    assert(`${f} does not import auditMode`, !/from\s+["'][^"']*auditMode["']/.test(src));
  } catch {
    // file optional — skip
  }
}

console.log(`\n${failures === 0 ? 'OK' : 'FAIL'} Audit Mode tests: ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);