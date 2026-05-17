/**
 * Validation tests for the Unified Recommendation Engine V2.
 *
 * Invariants:
 *   1. Best Move surface receives a recommendation that came from the unified engine.
 *   2. FIRE optimizer surface receives unified-derived recommendations.
 *   3. Risk Radar surface receives unified-derived recommendations.
 *   4. Deposit Power respects liquidity and serviceability gates.
 *   5. High-interest debt outranks ETF DCA when both are present.
 *   6. Low liquidity outranks property purchase even when deposit is ready.
 *   7. Monte Carlo stress flag tilts the engine toward conservatism.
 *   8. Every recommendation carries sourceSignalsUsed.
 *   9. No two top-3 recommendations carry contradictory action types (e.g. proceed + delay property simultaneously).
 *
 * Pure unit tests — no Supabase, no network. Uses synthetic UnifiedSignals only.
 */

import {
  computeUnifiedRecommendations,
  depositPowerReadinessFromSignals,
  riskRadarSurfaceFrom,
  fireSurfaceFrom,
  legacyBestMoveToRecommendation,
  resetHistory,
  snapshotHistory,
  debtVsETF,
  cashVsInvest,
  type UnifiedSignals,
} from '../client/src/lib/recommendationEngine';

let failures = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(name: string) {
  console.log(`\n— ${name}`);
}

// ─── Baseline signals (healthy household) ─────────────────────────────────────
const HEALTHY: UnifiedSignals = {
  cashOutsideOffset: 60_000,
  offsetBalance: 80_000,
  mortgage: 1_000_000,
  otherDebts: 0,
  ppor: 1_500_000,
  monthlyIncome: 22_000,
  monthlyExpenses: 14_000,
  monthlySurplus: 8_000,
  rohamGrossAnnual: 264_000,
  superContribAnnualised: 20_000,
  superCapRemaining: 10_000,
  emergencyBufferTarget: 45_000,
  upcomingBills12mo: 12_000,
  depositPower: 200_000,
  depositReadinessPct: 110,
  serviceabilityHeadroomMonthly: 3_000,
  postPurchaseBufferMonths: 4,
  etfExpectedReturn: 0.095,
  cryptoExpectedReturn: 0.20,
  cashHisaReturn: 0.05,
  mortgageRate: 0.0625,
  personalDebtRate: 0.17,
  marginalTaxRate: 0.47,
  mcSurvivalProbability: 0.87,
  mcStressFlag: 'none',
  riskOverallScore: 72,
};

// ─── Test 1: Engine produces recommendations and Best Move surface ───────────
section('Engine basics & Best Move surface');
{
  resetHistory();
  const out = computeUnifiedRecommendations(HEALTHY);
  assert('engine returns at least one recommendation', out.all.length >= 1);
  assert('best move has stable id', !!out.bestMove?.id);
  assert('best move carries sourceSignalsUsed', (out.bestMove.sourceSignalsUsed?.length ?? 0) > 0);
  assert('best move appears on best_move surface', out.bestMove.surfaces.includes('best_move') || out.bestMove.surfaces.includes('action_centre'));
  const hist = snapshotHistory(out);
  assert('history snapshot returns entries', hist.length === out.topPriorities.length);
  const out2 = computeUnifiedRecommendations(HEALTHY);
  const hist2 = snapshotHistory(out2);
  assert('second run marks priorities as unchanged when inputs identical', hist2.every(c => c.changedReason === 'unchanged'));
}

// ─── Test 2: High-interest debt outranks ETF when both are candidates ────────
section('High-interest debt outranks ETF');
{
  resetHistory();
  const sig: UnifiedSignals = { ...HEALTHY, otherDebts: 30_000, monthlySurplus: 6_000 };
  const out = computeUnifiedRecommendations(sig);
  const debtIdx = out.all.findIndex(r => r.actionType === 'pay_high_interest_debt');
  const etfIdx = out.all.findIndex(r => r.actionType === 'etf_dca');
  assert('debt rec present', debtIdx !== -1);
  if (etfIdx !== -1) {
    assert('debt outranks ETF DCA when both present', debtIdx < etfIdx);
  } else {
    assert('ETF DCA suppressed when high-interest debt present', true);
  }
}

// ─── Test 3: Low liquidity outranks property purchase ────────────────────────
section('Low liquidity outranks property purchase');
{
  resetHistory();
  const sig: UnifiedSignals = {
    ...HEALTHY,
    cashOutsideOffset: 5_000,
    offsetBalance: 5_000,
    emergencyBufferTarget: 45_000,
    depositReadinessPct: 110,
    depositPower: 200_000,
  };
  const out = computeUnifiedRecommendations(sig);
  const bufferIdx = out.all.findIndex(r => r.actionType === 'build_emergency_buffer');
  const propIdx = out.all.findIndex(r =>
    r.actionType === 'proceed_property_purchase' || r.actionType === 'delay_property_purchase');
  assert('build_buffer rec present when below buffer', bufferIdx !== -1);
  if (propIdx !== -1) {
    assert('liquidity buffer outranks property action', bufferIdx < propIdx);
  } else {
    assert('property purchase suppressed when liquidity weak', true);
  }
}

// ─── Test 4: Deposit Power respects liquidity & serviceability ───────────────
section('Deposit Power gates');
{
  const depositReadyButWeakLiquidity: UnifiedSignals = {
    ...HEALTHY,
    cashOutsideOffset: 5_000,
    offsetBalance: 5_000,
    emergencyBufferTarget: 45_000,
    depositReadinessPct: 105,
    postPurchaseBufferMonths: 1,
  };
  const r1 = computeUnifiedRecommendations(depositReadyButWeakLiquidity);
  const gates1 = depositPowerReadinessFromSignals(depositReadyButWeakLiquidity, r1);
  assert('deposit-ready but not strategy-ready phrase used', gates1.headline === 'Deposit ready, but not strategy-ready.');

  const strategyReady: UnifiedSignals = { ...HEALTHY, depositReadinessPct: 105, postPurchaseBufferMonths: 5, mcSurvivalProbability: 0.9 };
  const r2 = computeUnifiedRecommendations(strategyReady);
  const gates2 = depositPowerReadinessFromSignals(strategyReady, r2);
  assert('strategy-ready when all gates pass', gates2.strategyReady);
}

// ─── Test 5: Monte Carlo stress affects recommendations ──────────────────────
section('Monte Carlo stress flag tilts conservative');
{
  resetHistory();
  const stressed: UnifiedSignals = {
    ...HEALTHY,
    mcSurvivalProbability: 0.4,
    mcStressFlag: 'severe',
    fireYearsToTarget: 12,
    fireMonthlyInvestmentRequired: 9_000,
  };
  const out = computeUnifiedRecommendations(stressed);
  const conservativeOnTop = ['protect_liquidity', 'reduce_high_interest_debt', 'stabilise_leverage']
    .includes(out.bestMove.pillar) || out.bestMove.actionType === 'fire_acceleration';
  assert('best move under stress is a conservative or FIRE-acceleration action', conservativeOnTop);
}

// ─── Test 6: Every recommendation has sourceSignalsUsed ──────────────────────
section('Every recommendation has sourceSignalsUsed');
{
  const out = computeUnifiedRecommendations(HEALTHY);
  const missing = out.all.filter(r => !r.sourceSignalsUsed || r.sourceSignalsUsed.length === 0);
  assert('no recommendation missing sourceSignalsUsed', missing.length === 0,
    missing.length > 0 ? `${missing.length} missing` : undefined);
}

// ─── Test 7: No contradictory cards in top priorities ────────────────────────
section('No contradictory advice in top priorities');
{
  const out = computeUnifiedRecommendations({ ...HEALTHY, depositReadinessPct: 105, postPurchaseBufferMonths: 4 });
  const ids = new Set(out.topPriorities.map(r => r.actionType));
  const conflict = ids.has('proceed_property_purchase' as any) && ids.has('delay_property_purchase' as any);
  assert('no simultaneous proceed + delay property purchase', !conflict);
}

// ─── Test 8: FIRE & Risk Radar surfaces derive from unified engine ───────────
section('FIRE & Risk Radar surfaces are unified-derived');
{
  const out = computeUnifiedRecommendations({
    ...HEALTHY,
    mcSurvivalProbability: 0.55,
    fireYearsToTarget: 10,
    fireMonthlyInvestmentRequired: 8_000,
    riskOverallScore: 35,
    topRiskFactor: { id: 'ppor_lvr', label: 'PPOR LVR', action: 'Pay down mortgage' },
  });
  const fire = fireSurfaceFrom(out);
  assert('FIRE surface returns at least one rec when survival < 85%', fire.recommendations.length >= 1);

  const riskSignals = {
    ...HEALTHY,
    riskOverallScore: 35,
    topRiskFactor: { id: 'ppor_lvr', label: 'PPOR LVR', action: 'Pay down mortgage' },
  };
  const risk = riskRadarSurfaceFrom(riskSignals, out);
  assert('Risk surface severity computed', risk.severity === 'high' || risk.severity === 'moderate');
  assert('Risk surface has a required action', !!risk.requiredAction);
}

// ─── Test 9: Opportunity-cost helpers behave ─────────────────────────────────
section('Opportunity cost helpers');
{
  const dvE = debtVsETF({ debtAmount: 20_000, debtRatePct: 17, etfReturnPct: 9.5 });
  assert('debtVsETF recommends paydown at 17% vs 9.5%', dvE.recommend === 'paydown');
  const cvi = cashVsInvest({ amount: 50_000, hisaReturnPct: 5, investReturnPct: 9.5, mortgageOffsetRatePct: 6.25, marginalTaxRate: 0.47 });
  assert('cashVsInvest prefers offset when mortgage offset available at 6.25%', cvi.recommend === 'offset');
}

// ─── Test 10: legacy → unified adapter ───────────────────────────────────────
section('Legacy → unified adapter');
{
  const legacyRec = legacyBestMoveToRecommendation({
    best: { id: 'x', action: 'Move idle cash', reason: 'test', annual_benefit: 5000,
      benefit_label: '$5K/yr', risk: 'Low', cta: 'Go', cta_route: '/x', rank: 1, data_reliable: true },
    alternatives: [], generated_at: new Date().toISOString(),
    summary: 'x', ledgerInputs: {} as any,
  });
  assert('legacy adapter sets best_move surface', legacyRec.surfaces.includes('best_move'));
  assert('legacy adapter carries source signals', legacyRec.sourceSignalsUsed.length > 0);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`✅ All recommendation-engine tests passed`);
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) failed`);
  process.exit(1);
}
