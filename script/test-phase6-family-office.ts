/**
 * Phase 6 — Family Office Intelligence Layer validation tests.
 *
 * Pure unit tests for the five new engines plus their integration with the
 * Recommendation Engine V2 contract. No network, no DB.
 */

import {
  buildPortfolio,
  selectAllocationModel,
  MODEL_TEMPLATES,
} from '../client/src/lib/portfolioConstruction';
import {
  modelLifePlan,
  instanceFromTemplate,
  listLifeEventTemplates,
} from '../client/src/lib/lifePlanning';
import { analyseTaxStrategies } from '../client/src/lib/taxIntelligence';
import { buildExecutionPlan } from '../client/src/lib/executionOS';
import {
  emptyAdaptiveState,
  recordEvent,
  deriveAdjustments,
  applyAdaptiveLearning,
} from '../client/src/lib/adaptiveLearning';
import { buildCIOMemo, buildCIOParagraph } from '../client/src/lib/narrativeIntelligence';
import {
  computeUnifiedRecommendations,
  fromPortfolioConstruction,
  fromLifePlan,
  fromTaxIntelligence,
  fromExecutionOS,
  fromAdaptiveLearning,
  mergeSignals,
  type UnifiedSignals,
} from '../client/src/lib/recommendationEngine';

let failures = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(n: string) { console.log(`\n— ${n}`); }

// ─── A. Portfolio Construction ───────────────────────────────────────────────
section('Portfolio Construction');
{
  const baseline = buildPortfolio({});
  assert('returns a portfolio for empty inputs', baseline.targets.length > 0);
  assert('default model is balanced', baseline.model === 'balanced');
  assert('targets sum approximately to 1', Math.abs(baseline.targets.reduce((a, t) => a + t.target, 0) - 1) < 0.001);

  const stressed = buildPortfolio({ mcStressPressure: 0.7, mcSurvivalProbability: 0.4 });
  assert('severe stress → defensive', stressed.model === 'defensive');

  const cashflowSafe = buildPortfolio({ liquidityNeed: 0.8 });
  assert('high liquidity need → cashflow_safe', cashflowSafe.model === 'cashflow_safe');

  const propertyHeavy = buildPortfolio({ propertyBias: 0.7, leverageTolerance: 0.7 });
  assert('property bias high + leverage high → property_heavy', propertyHeavy.model === 'property_heavy');

  const fire = buildPortfolio({ fireUrgency: 0.85, riskTolerance: 0.5 });
  assert('high FIRE urgency → fire_first', fire.model === 'fire_first');

  const drifted = buildPortfolio({ current: { cash: 1000, offset: 9000, etf: 1000 } });
  assert('drift computed for non-empty current', drifted.targets.some(t => t.driftBand !== 'none'));
  assert('metrics produced', drifted.metrics.liquidityScore >= 0 && drifted.metrics.liquidityScore <= 100);
  assert('expected return is positive', drifted.metrics.expectedReturn > 0);
  assert('tilts emitted as record', typeof drifted.tilts === 'object');

  const allModels = Object.keys(MODEL_TEMPLATES);
  assert('all 9 allocation models registered', allModels.length === 9);
  assert('forceModel respected', selectAllocationModel({ forceModel: 'anti_fragile' }) === 'anti_fragile');
}

// ─── B. Life Planning ─────────────────────────────────────────────────────────
section('Life Planning');
{
  const empty = modelLifePlan({ events: [] });
  assert('empty events → zero lifetime cost', empty.summary.totalLifetimeNetCost === 0);
  assert('empty horizon yearly is 35', empty.yearly.length === 35);

  const events = [
    instanceFromTemplate('child_birth', '2027-06-01'),
    instanceFromTemplate('school_costs', '2030-01-01'),
  ];
  const plan = modelLifePlan({
    baseYear: 2026,
    horizonYears: 30,
    monthlySurplus: 4500,
    emergencyBuffer: 30000,
    events,
  });
  assert('events tracked', plan.events.length === 2);
  assert('lifetime net cost is positive (events cost money)', plan.summary.totalLifetimeNetCost > 0);
  assert('FIRE delay estimate populated', plan.summary.fireYearDelayEstimate > 0);
  assert('affected years present', plan.summary.affectedYears.length > 0);
  assert('worst year identified', plan.summary.worstYear !== null);
  assert('templates exhaustive', listLifeEventTemplates().length >= 18);

  // Career upgrade should net positive
  const upgrade = modelLifePlan({
    events: [instanceFromTemplate('career_upgrade', '2026-09-01')],
    monthlySurplus: 4500,
  });
  assert('career_upgrade reduces lifetime cost', upgrade.summary.totalLifetimeNetCost < 0);
}

// ─── C. Tax Intelligence ─────────────────────────────────────────────────────
section('Tax Intelligence');
{
  const minimal = analyseTaxStrategies({});
  assert('always returns a result for empty input', minimal != null);

  const heavy = analyseTaxStrategies({
    grossAnnual: 180_000,
    spouseGrossAnnual: 60_000,
    marginalTaxRate: 0.37,
    spouseMarginalTaxRate: 0.325,
    superCapRemaining: 12_000,
    ipCashflow: -3_500,
    offsetBalance: 80_000,
    mortgage: 650_000,
    mortgageRate: 0.0625,
    hasPrivateHealth: false,
    hasInvestmentProperty: true,
    equitiesOutsideSuper: 120_000,
    holdingYearsEquity: 0.5,
    unrealisedEquityGains: 20_000,
  });
  assert('produces strategy stack', heavy.allStrategies.length > 0);
  assert('top strategies capped at 5', heavy.topStrategies.length <= 5);
  assert('total saving > 0 for active household', heavy.totalEstimatedSaving > 0);
  assert('medicare levy warning when no PHI + high income', heavy.medicareLevySurchargeWarning === true);
  assert('FIRE withdrawal efficiency 0-100', heavy.fireWithdrawalEfficiencyScore >= 0 && heavy.fireWithdrawalEfficiencyScore <= 100);
  assert('ownership recommendations include something', heavy.ownership.length >= 1);
  assert('debt structure non-empty', heavy.debtStructure.length >= 1);
  assert('narrative populated', heavy.narrative.length > 0);

  const recRetiree = analyseTaxStrategies({
    drawdownPhase: true,
    superBalance: 800_000,
    drawdownExpenseTarget: 65_000,
  });
  assert('retirement_drawdown surfaces for retirees', recRetiree.allStrategies.some(s => s.id === 'retirement_drawdown'));
}

// ─── D. Execution OS ─────────────────────────────────────────────────────────
section('Execution OS');
{
  const base = buildExecutionPlan({
    cashOutsideOffset: 5_000,
    offsetBalance: 10_000,
    monthlyIncome: 19_000,
    monthlyExpenses: 13_000,
    monthlySurplus: 6_000,
    emergencyBufferTarget: 40_000,
    otherDebts: 8_000,
    superCapRemaining: 12_000,
    fireYearsToTarget: 14,
  });
  assert('roadmaps produced', base.roadmaps.length >= 3);
  assert('overall readiness 0-100', base.overallReadinessPct >= 0 && base.overallReadinessPct <= 100);
  assert('monthly missions emitted', base.monthlyMissions.length > 0);
  const buffer = base.roadmaps.find(r => r.id === 'emergency_buffer');
  assert('emergency buffer roadmap present', buffer !== undefined);
  assert('emergency buffer < 100% when underfunded', (buffer?.readinessPct ?? 100) < 100);
  const debt = base.roadmaps.find(r => r.id === 'debt_paydown');
  assert('debt paydown roadmap present when debt > 0', debt !== undefined);
  const fsr = base.roadmaps.find(r => r.id === 'fire_savings_rate');
  assert('savings rate roadmap present', fsr !== undefined);

  const blockedSurplus = buildExecutionPlan({ monthlySurplus: -200, monthlyExpenses: 14_000, monthlyIncome: 13_800 });
  assert('negative surplus → blockers raised', blockedSurplus.topBlockers.length > 0);
}

// ─── E. Adaptive Learning ────────────────────────────────────────────────────
section('Adaptive Learning');
{
  const s0 = emptyAdaptiveState();
  assert('empty state has no events', s0.events.length === 0);
  assert('baseline adjustments produced', deriveAdjustments(s0).urgencyMultiplier >= 0.7);

  const s1 = recordEvent(s0, { type: 'recommendation_ignored', at: new Date().toISOString(), ref: 'crypto_dca' });
  const s2 = recordEvent(s1, { type: 'recommendation_ignored', at: new Date().toISOString(), ref: 'crypto_dca' });
  const s3 = recordEvent(s2, { type: 'recommendation_ignored', at: new Date().toISOString(), ref: 'crypto_dca' });
  const adj = deriveAdjustments(s3);
  assert('ignored 3x → ranking multiplier suppressed', (adj.rankingMultiplierByActionType['crypto_dca'] ?? 1) < 1);

  const sPanic = recordEvent(s0, { type: 'drawdown_reaction', at: new Date().toISOString(), magnitude: -1 });
  assert('panic event raises panic score', sPanic.inferred.panicScore > 0);
  assert('panic event raises urgency multiplier', deriveAdjustments(sPanic).urgencyMultiplier > 1);

  const applied = applyAdaptiveLearning(s0, [
    { type: 'leverage_increased', at: new Date().toISOString() },
    { type: 'liquidity_decreased', at: new Date().toISOString() },
  ]);
  assert('apply returns adjustments + state', applied.adjustments != null && applied.state.events.length === 2);

  assert('explanation always present', applied.adjustments.explanation.length > 0);
}

// ─── F. Narrative Intelligence V2 ────────────────────────────────────────────
section('Narrative Intelligence V2');
{
  const stub = {
    id: 'x',
    title: 'Stub recommendation',
    actionType: 'etf_dca' as const,
    pillar: 'maintain_investing_discipline' as const,
    priorityRank: 1,
    confidenceScore: 0.7,
    urgency: 'this_quarter' as const,
    riskLevel: 'Med' as const,
    expectedFinancialImpact: { annualDollar: 5400, confidence: 0.7 },
    implementationSteps: [],
    whatCouldChangeRecommendation: ['Cash buffer drops', 'MC stress flag flips'],
    alternativeOptions: [],
    reviewTrigger: { condition: 'monthly', watchSignals: [] },
    sourceSignalsUsed: [],
    surfaces: ['action_centre' as const],
    reasoning: 'Discipline matters',
  };
  const memo = buildCIOMemo({ recommendation: stub });
  assert('CIO memo has headline', memo.headline.length > 0);
  assert('CIO memo has rationale', memo.rationale.length > 0);
  assert('CIO memo has tradeoffs', memo.tradeoffs.length > 0);
  assert('CIO memo has timing', memo.timing.length > 0);
  assert('CIO memo has downside path', memo.downsidePath.length > 0);
  const para = buildCIOParagraph({ recommendation: stub });
  assert('CIO paragraph non-empty', para.length > 0);
}

// ─── G. Integration: Phase 6 signals tilt recommendation ranking ────────────
section('Integration — Phase 6 tilts');
{
  const base: UnifiedSignals = {
    cashOutsideOffset: 5_000,
    offsetBalance: 10_000,
    mortgage: 600_000,
    otherDebts: 0,
    monthlyIncome: 19_000,
    monthlyExpenses: 13_000,
    monthlySurplus: 6_000,
    emergencyBufferTarget: 40_000,
    superContribAnnualised: 0,
    superCapRemaining: 12_000,
    marginalTaxRate: 0.37,
    etfExpectedReturn: 0.085,
  };

  // Without portfolio tilt, baseline ranking
  const baseline = computeUnifiedRecommendations(base);
  assert('baseline produces best move', baseline.bestMove != null);
  assert('baseline coverage non-empty', baseline.signalCoverage.length > 0);

  // With a portfolio that strongly pushes ETF: ETF DCA should appear higher in candidates
  const tilted = computeUnifiedRecommendations({
    ...base,
    portfolioTilts: { etfPush: 0.2, modelLabel: 'ETF-Heavy', liquidityScore: 60, taxEfficiencyScore: 60 },
  });
  assert('portfolio tilt does not break ranking', tilted.bestMove != null);

  // With life context, liquidity pillar should not be downgraded
  const life = computeUnifiedRecommendations({
    ...base,
    lifeContext: { fireYearDelayEstimate: 2.5, averageAnnualDrag: 12_000, stressProbability: 0.6, liquidityStressMonths: 8 },
  });
  assert('life context retains best move', life.bestMove != null);

  // Tax context: when super cap remaining and big saving, super action should rise
  const taxed = computeUnifiedRecommendations({
    ...base,
    taxContext: { totalEstimatedSaving: 9_000, longTermTaxDragPct: 0.4, fireWithdrawalEfficiencyScore: 60 },
  });
  assert('tax tilt does not break ranking', taxed.bestMove != null);

  // Adaptive multipliers must not promote crypto past safety items
  const dampened = computeUnifiedRecommendations({
    ...base,
    cashOutsideOffset: 0,
    offsetBalance: 0,
    adaptive: { rankingMultiplierByActionType: { etf_dca: 1.5 }, urgencyMultiplier: 1.4 },
  });
  assert('adaptive cannot promote past buffer pillar', dampened.bestMove.pillar === 'protect_liquidity');

  // Adapters wire results correctly
  const merged = mergeSignals(
    base,
    fromPortfolioConstruction({ tilts: { etfPush: 0.1 }, modelLabel: 'X', metrics: { liquidityScore: 50, taxEfficiencyScore: 50 } }),
    fromLifePlan({ events: [], summary: { fireYearDelayEstimate: 1.0, averageAnnualDrag: 0, stressProbability: 0.1, liquidityStressMonths: 0 } }),
    fromTaxIntelligence({ totalEstimatedSaving: 4000, longTermTaxDragPct: 0.3, fireWithdrawalEfficiencyScore: 70, topStrategies: [{ id: 'super_concessional' }] }),
    fromExecutionOS({ overallReadinessPct: 55, topBlockers: [] }),
    fromAdaptiveLearning({ rankingMultiplierByActionType: { etf_dca: 1.1 }, urgencyMultiplier: 1.0, riskScoreTilt: 0, pillarWeights: {}, monteCarloPriorityMultiplier: 1.0, explanation: 'ok' }),
  );
  assert('merge carries portfolioTilts', merged.portfolioTilts?.etfPush === 0.1);
  assert('merge carries lifeContext', merged.lifeContext?.fireYearDelayEstimate === 1.0);
  assert('merge carries taxContext', merged.taxContext?.topStrategyId === 'super_concessional');
  assert('merge carries executionContext', merged.executionContext?.overallReadinessPct === 55);
  assert('merge carries adaptive', merged.adaptive?.explanation === 'ok');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`✅ All Phase 6 family-office tests passed`);
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) failed`);
  process.exit(1);
}
