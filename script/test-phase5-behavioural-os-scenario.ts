/**
 * Phase 5 — Behavioural Engine + Autonomous OS + Scenario Tree + Action Plan +
 * Recommendation V2 integration test suite.
 *
 * Run with:  tsx script/test-phase5-behavioural-os-scenario.ts
 * Exits 0 on all pass; 1 on any failure.
 */

import {
  inferBehaviouralProfile,
  PROFILE_DEFINITIONS,
  type BehaviouralProfile,
} from '../client/src/lib/behaviouralEngine';
import {
  runAutonomousOS,
  detectRefinanceOpportunity,
  detectLiquidityStress,
  detectFireDrift,
  detectPropertyReadiness,
  detectDebtPriority,
  detectOpportunityWindows,
  detectConcentrationRisk,
} from '../client/src/lib/autonomousOS';
import {
  buildScenarioTree,
  MACRO_REGIMES,
  futureWorldsPanel,
} from '../client/src/lib/scenarioTree';
import {
  buildActionPlans,
  explainabilityFor,
} from '../client/src/lib/actionPlanEngine';
import {
  computeUnifiedRecommendations,
  fromBehaviouralProfile,
  fromAutonomousOS,
  fromScenarioTree,
  mergeSignals,
  type UnifiedSignals,
} from '../client/src/lib/recommendationEngine';

let failures = 0;
function assert(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}
function section(name: string): void {
  console.log(`\n— ${name}`);
}

// ───────────────────────── Behavioural Engine ─────────────────────────────────
section('Behavioural Engine');
{
  const empty = inferBehaviouralProfile({});
  assert('empty input still produces a profile', !!empty.primary);
  assert('empty input has zero / very low confidence', empty.confidence <= 0.2);
  assert('profile carries label', !!empty.primaryLabel);

  const conservative = inferBehaviouralProfile({
    riskTolerance: -0.8,
    customThresholds: { drawdownPanicPct: 8, minimumBufferMonths: 12 },
    bufferPreferences: { targetMonths: 12 },
    decisionChoices: [{ id: 'build_emergency_buffer' }, { id: 'pay_high_interest_debt' }],
  });
  assert(
    'strong-conservative inputs map to a defensive profile',
    ['conservative_protector', 'cashflow_defender', 'volatility_sensitive', 'anti_debt'].includes(conservative.primary),
    conservative.primary,
  );

  const aggressive = inferBehaviouralProfile({
    riskTolerance: 0.9,
    customThresholds: { drawdownPanicPct: 50, maxLVRPct: 90 },
    decisionChoices: [{ id: 'etf_dca' }, { id: 'crypto_dca' }, { id: 'fire_acceleration' }],
    fireChoices: { targetAge: 40, leanFire: true },
  });
  assert(
    'aggressive inputs map to an aggressive/FIRE-leaning profile',
    ['aggressive_compounder', 'fire_accelerator', 'opportunistic_investor', 'drawdown_tolerant', 'leverage_maximiser'].includes(aggressive.primary),
    aggressive.primary,
  );

  assert(
    'profile definitions exist for all 10 archetypes',
    Object.keys(PROFILE_DEFINITIONS).length === 10,
  );

  // Determinism.
  const sameA = inferBehaviouralProfile({ riskTolerance: 0.2 });
  const sameB = inferBehaviouralProfile({ riskTolerance: 0.2 });
  assert('engine is deterministic', JSON.stringify(sameA) === JSON.stringify(sameB));
}

// ───────────────────────── Autonomous OS Detectors ────────────────────────────
section('Autonomous OS detectors');
{
  // Refinance detector — high mortgage rate
  const refi = detectRefinanceOpportunity({ mortgage: 600_000, mortgageRate: 0.075, marketMortgageRate: 0.058, cashOutsideOffset: 80_000, offsetBalance: 50_000 });
  assert('refinance detector fires on high rate', refi.some(f => f.id === 'refi_high_rate'));
  assert('refinance detector flags offset inefficiency', refi.some(f => f.id === 'refi_offset_inefficient'));
  assert('refinance detector flags market spread', refi.some(f => f.id === 'refi_market_spread'));

  // Liquidity detector
  const liq = detectLiquidityStress({ cashOutsideOffset: 2_000, offsetBalance: 1_000, monthlyExpenses: 8_000, emergencyBufferTarget: 50_000, upcoming12moCashLow: -5000, mortgage: 900_000, ppor: 1_100_000 });
  assert('liquidity weak buffer detected', liq.some(f => f.id === 'liq_buffer_weak'));
  assert('liquidity negative window detected', liq.some(f => f.id === 'liq_neg_cash_window'));
  assert('dangerous leverage detected', liq.some(f => f.id === 'liq_dangerous_leverage'));

  // FIRE drift
  const drift = detectFireDrift({ fireMonthlyInvestmentRequired: 4000, monthlyInvestActual: 1000, fireYearsToTarget: 30, expenseInflationLast12moPct: 0.08 });
  assert('fire drift detects under-investing', drift.some(f => f.id === 'fire_underinvesting'));
  assert('fire drift detects lifestyle inflation', drift.some(f => f.id === 'fire_lifestyle_inflation'));

  // Property readiness — all gates pass
  const propReady = detectPropertyReadiness({ depositReadinessPct: 1.0, serviceabilityHeadroomMonthly: 2000, postPurchaseBufferMonths: 6, hasIPStrategy: true });
  assert('property readiness — all gates clear', propReady.some(f => f.hints?.actionType === 'proceed_property_purchase'));

  // Property readiness — fail strategy gate
  const propNot = detectPropertyReadiness({ depositReadinessPct: 0.5, serviceabilityHeadroomMonthly: 100, postPurchaseBufferMonths: 1, hasIPStrategy: false });
  assert('property readiness — recommends delay when gates fail', propNot.some(f => f.hints?.actionType === 'delay_property_purchase'));

  // Debt priority
  const debt = detectDebtPriority({ personalDebtRate: 0.19, etfExpectedReturn: 0.09, marginalTaxRate: 0.325, mortgage: 0 });
  assert('debt priority elevates personal debt', debt.some(f => f.id === 'debt_personal_dominates'));

  // Opportunity windows
  const opp = detectOpportunityWindows({ rateRegime: 'cutting', marketDrawdownPct: 0.20, monthlySurplus: 6000 });
  assert('opportunity window — rate cuts', opp.some(f => f.id === 'opp_rate_cuts'));
  assert('opportunity window — drawdown DCA', opp.some(f => f.id === 'opp_undervaluation'));
  assert('opportunity window — surplus', opp.some(f => f.id === 'opp_strong_surplus'));

  // Concentration
  const conc = detectConcentrationRisk({ totalNetWorth: 1_000_000, propertyEquity: 850_000, cryptoValue: 0, etfValue: 10_000 });
  assert('concentration — property heavy', conc.some(f => f.id === 'conc_property_heavy'));
  assert('concentration — etf thin', conc.some(f => f.id === 'conc_etf_thin'));

  // Aggregator
  const report = runAutonomousOS({
    cashOutsideOffset: 2_000,
    offsetBalance: 1_000,
    monthlyExpenses: 8_000,
    monthlyIncome: 12_000,
    emergencyBufferTarget: 50_000,
    mortgageRate: 0.075,
    mortgage: 600_000,
    personalDebtRate: 0.19,
    etfExpectedReturn: 0.09,
    rateRegime: 'cutting',
    totalNetWorth: 1_000_000,
    propertyEquity: 850_000,
  });
  assert('runAutonomousOS aggregates findings', report.findings.length >= 5);
  assert('runAutonomousOS sorts by severity', (
    ['critical','elevated','watch','info'].indexOf(report.findings[0].severity) <=
    ['critical','elevated','watch','info'].indexOf(report.findings[report.findings.length - 1].severity)
  ));
  assert('runAutonomousOS reports input coverage', report.inputCoverage > 0 && report.inputCoverage <= 1);
  assert('runAutonomousOS detectorsRun has all 7', report.detectorsRun.length === 7);
}

// ───────────────────────── Scenario Tree ──────────────────────────────────────
section('Scenario Tree');
{
  const tree = buildScenarioTree({
    baseNetWorth: 1_500_000,
    baseFireYears: 15,
    horizonYears: 10,
  });
  assert('scenario tree returns branches', tree.branches.length > 0);
  const totalP = tree.branches.reduce((a, b) => a + b.probability, 0);
  assert('probabilities sum to ~1', Math.abs(totalP - 1) < 0.005, `sum=${totalP}`);
  assert('all branches carry keyDriver', tree.branches.every(b => !!b.keyDriver));
  assert('regimeTimeline emitted', tree.regimeTimeline.length > 0);
  assert('15 macro regimes catalogued', Object.keys(MACRO_REGIMES).length === 15);

  const panel = futureWorldsPanel({ baseNetWorth: 1_000_000 });
  assert('futureWorldsPanel returns 6 default branches', panel.length === 6);

  // Stress regime should worsen weighted insolvency vs base.
  const base = buildScenarioTree({ baseNetWorth: 1_000_000 });
  const stressed = buildScenarioTree({
    baseNetWorth: 1_000_000,
    regimeProbabilities: { recession: 0.5, stagflation: 0.3 },
  });
  assert(
    'stressed regime weighting raises weighted liquidity risk',
    (stressed.baseProbabilityWeighted.liquidityRisk ?? 0) > (base.baseProbabilityWeighted.liquidityRisk ?? 0),
  );
}

// ───────────────────────── Recommendation V2 integration ──────────────────────
section('Recommendation V2 integration');
{
  const HEALTHY: UnifiedSignals = {
    cashOutsideOffset: 80_000,
    offsetBalance: 60_000,
    mortgage: 600_000,
    otherDebts: 0,
    monthlyIncome: 16_000,
    monthlyExpenses: 9_000,
    monthlySurplus: 7_000,
    rohamGrossAnnual: 200_000,
    emergencyBufferTarget: 54_000,
    mortgageRate: 0.0625,
    personalDebtRate: 0.17,
    etfExpectedReturn: 0.095,
    marginalTaxRate: 0.325,
    cashHisaReturn: 0.05,
    fireYearsToTarget: 14,
    fireProgressPct: 0.35,
    superCapRemaining: 30_000,
    depositReadinessPct: 0.92,
    depositPower: 280_000,
  };

  const baseResult = computeUnifiedRecommendations(HEALTHY);
  assert('baseline produces ≥1 recommendation', baseResult.all.length > 0);
  assert('baseline emits top 3', baseResult.topPriorities.length > 0 && baseResult.topPriorities.length <= 3);

  // Behavioural overlay should not change pillar ordering of hard safety, but
  // CAN tilt within wealth tier.
  const aggressive = inferBehaviouralProfile({ riskTolerance: 0.9, customThresholds: { drawdownPanicPct: 40 } });
  const conservative = inferBehaviouralProfile({ riskTolerance: -0.9, bufferPreferences: { targetMonths: 12 } });

  const sigAgg = mergeSignals(HEALTHY, fromBehaviouralProfile(aggressive));
  const sigCon = mergeSignals(HEALTHY, fromBehaviouralProfile(conservative));
  const resAgg = computeUnifiedRecommendations(sigAgg);
  const resCon = computeUnifiedRecommendations(sigCon);
  assert('behavioural overlay does not break engine', resAgg.all.length > 0 && resCon.all.length > 0);
  assert('signal coverage includes behavioural_profile', resAgg.signalCoverage.includes('behavioural_profile'));

  // Autonomous OS findings injected via adapter add osFindings signal.
  const osReport = runAutonomousOS({
    cashOutsideOffset: 2_000, offsetBalance: 0, mortgage: 600_000, mortgageRate: 0.075,
    monthlyExpenses: 9_000, monthlyIncome: 16_000, emergencyBufferTarget: 54_000,
    rateRegime: 'cutting', etfExpectedReturn: 0.09,
  });
  const sigOS = mergeSignals(HEALTHY, fromAutonomousOS(osReport));
  const resOS = computeUnifiedRecommendations(sigOS);
  assert('signal coverage includes autonomous_os', resOS.signalCoverage.includes('autonomous_os'));

  // Scenario tree context injected.
  const tree = buildScenarioTree({ baseNetWorth: 1_500_000 });
  const sigTree = mergeSignals(HEALTHY, fromScenarioTree(tree));
  const resTree = computeUnifiedRecommendations(sigTree);
  assert('signal coverage includes scenario_tree', resTree.signalCoverage.includes('scenario_tree'));

  // Single source of advice — top recs still flow from V2.
  assert('top priorities still come from unified engine ids', resOS.topPriorities.every(r => !!r.id));
  assert('no two top-3 contradict (proceed + delay simultaneously)', !(
    resOS.topPriorities.some(r => r.actionType === 'proceed_property_purchase') &&
    resOS.topPriorities.some(r => r.actionType === 'delay_property_purchase')
  ));
}

// ───────────────────────── Action Plan Engine ─────────────────────────────────
section('Action Plan Engine');
{
  const signals: UnifiedSignals = {
    monthlyIncome: 16_000,
    monthlyExpenses: 9_000,
    monthlySurplus: 7_000,
    rohamGrossAnnual: 200_000,
    cashOutsideOffset: 60_000,
    offsetBalance: 40_000,
    mortgage: 600_000,
    otherDebts: 10_000,
    personalDebtRate: 0.18,
    mortgageRate: 0.062,
    etfExpectedReturn: 0.095,
    fireMonthlyInvestmentRequired: 4_000,
    fireYearsToTarget: 12,
    depositReadinessPct: 0.95,
    depositPower: 250_000,
    emergencyBufferTarget: 54_000,
    marginalTaxRate: 0.325,
  };
  const baseResult = computeUnifiedRecommendations(signals);
  const plans = buildActionPlans({ recommendations: baseResult.all, signals });
  assert('action plans produced', plans.plans.length > 0);

  const property = plans.plans.find(p => p.kind === 'property');
  if (property) {
    assert('property plan carries borrowing power', property.borrowingPowerEstimate! > 0);
    assert('property plan recommendationId is set', !!property.recommendationId);
  }
  const fire = plans.plans.find(p => p.kind === 'fire');
  if (fire) {
    assert('fire plan annualInvestmentTarget non-negative', (fire.annualInvestmentTarget ?? 0) >= 0);
  }
  const debt = plans.plans.find(p => p.kind === 'debt');
  if (debt) {
    assert('debt plan returns payoffOrder', debt.payoffOrder.length > 0);
  }

  // Explainability layer.
  if (baseResult.bestMove) {
    const exp = explainabilityFor(baseResult.bestMove, signals);
    assert('explainability returns up to 5 drivers', exp.drivers.length > 0 && exp.drivers.length <= 5);
    assert('explainability returns sensitivity rows', exp.sensitivity.length === 3);
    assert('explainability surfaces confidence', exp.confidence >= 0 && exp.confidence <= 1);
  }
}

// ───────────────────────── Summary ────────────────────────────────────────────
section('Summary');
if (failures > 0) {
  console.error(`\n${failures} failures`);
  process.exit(1);
} else {
  console.log('\nAll Phase 5 tests passed.');
}
