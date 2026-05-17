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
  fromMonteCarloV5,
  mergeSignals,
  fromBestMoveLedger,
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

// ─── Test 11: Canonical MC shape (forecastStore) → adapter ──────────────────
section('Canonical Monte Carlo result → adapter');
{
  // Calm MC result: low cash-shortfall probability, high FF probability.
  const calmMC = {
    p10: 1_000_000, p25: 1_200_000, median: 1_500_000, p75: 1_800_000, p90: 2_100_000,
    prob_ff: 88, prob_3m: 80, prob_5m: 72, prob_10m: 55,
    prob_neg_cf: 8, prob_cash_shortfall: 5,
    lowest_cash_median: 60_000, highest_risk_year: 2030,
    biggest_risk_driver: 'Property growth volatility',
    fan_data: [], key_risks: [], recommended_actions: [],
    ran_at: new Date().toISOString(), simulations: 1000,
  };
  const calm = fromMonteCarloV5(calmMC);
  assert('calm MC → survival probability in 0-1 range',
    typeof calm.mcSurvivalProbability === 'number' && calm.mcSurvivalProbability! > 0.8);
  assert('calm MC → stress flag is none', calm.mcStressFlag === 'none');

  // Stressed MC result: high cash-shortfall + neg cashflow, rate-driver text.
  const stressedMC = {
    ...calmMC,
    prob_ff: 35,
    prob_neg_cf: 55,
    prob_cash_shortfall: 60,
    biggest_risk_driver: 'Interest rate shock',
  };
  const stressed = fromMonteCarloV5(stressedMC);
  assert('stressed MC → severe stress flag', stressed.mcStressFlag === 'severe');
  assert('stressed MC → rate stress active inferred from driver text',
    stressed.mcRateStressActive === true);
  assert('stressed MC → shortfall severity > 0.5',
    typeof stressed.mcShortfallSeverity === 'number' && stressed.mcShortfallSeverity! > 0.5);

  // Moderate MC result: middle band — survival ~75%, mid prob_neg_cf.
  const moderateMC = { ...calmMC, prob_ff: 75, prob_neg_cf: 25, prob_cash_shortfall: 22 };
  const moderate = fromMonteCarloV5(moderateMC);
  assert('moderate MC → moderate stress flag', moderate.mcStressFlag === 'moderate');
}

// ─── Test 12: Live MC result changes recommendations ─────────────────────────
section('Live MC stress changes recommendations');
{
  resetHistory();
  // Healthy base. Surplus is high so ETF DCA candidate appears.
  const base: UnifiedSignals = {
    ...HEALTHY,
    monthlySurplus: 8_000,
    otherDebts: 0,
    depositReadinessPct: 70,  // not strategy-ready, so property options inactive
    mcStressFlag: 'none',
    mcSurvivalProbability: 0.9,
  };
  const calm = computeUnifiedRecommendations(base);
  const calmHasETF = calm.all.some(r => r.actionType === 'etf_dca');
  assert('calm signals surface ETF DCA candidate', calmHasETF);

  // Now apply a stressed MC overlay via the adapter.
  resetHistory();
  const stressedOverlay = fromMonteCarloV5({
    p10: 0, p25: 0, median: 0, p75: 0, p90: 0,
    prob_ff: 30, prob_3m: 20, prob_5m: 10, prob_10m: 5,
    prob_neg_cf: 60, prob_cash_shortfall: 55,
    lowest_cash_median: -10_000, highest_risk_year: 2028,
    biggest_risk_driver: 'Interest rate shock',
    fan_data: [], key_risks: [], recommended_actions: [],
    ran_at: new Date().toISOString(), simulations: 1000,
  });
  const merged = mergeSignals(base, stressedOverlay, { fireYearsToTarget: 12, fireMonthlyInvestmentRequired: 9_000 });
  const stressed = computeUnifiedRecommendations(merged);

  // ETF score should drop and a conservative / fire-acceleration action should bubble up.
  const conservativePillars = ['protect_liquidity', 'reduce_high_interest_debt', 'stabilise_leverage'];
  const stressedTopPillar = stressed.bestMove.pillar;
  assert('best move pillar shifts toward conservatism under live MC stress',
    conservativePillars.includes(stressedTopPillar)
      || stressed.bestMove.actionType === 'fire_acceleration'
      || stressed.bestMove.actionType === 'reduce_leverage');

  // ETF DCA must not be best when MC stress is severe.
  assert('ETF DCA never ranks best under severe stress',
    stressed.bestMove.actionType !== 'etf_dca');
}

// ─── Test 13: mergeSignals dropping null/undefined ──────────────────────────
section('mergeSignals overlay semantics');
{
  const merged = mergeSignals(
    { cashOutsideOffset: 100, mortgage: 1_000_000 },
    { cashOutsideOffset: undefined, offsetBalance: 50 },
    { mortgage: 900_000 },
  );
  assert('mergeSignals keeps first non-undefined value', merged.cashOutsideOffset === 100);
  assert('mergeSignals adds new fields from later overlays', merged.offsetBalance === 50);
  assert('mergeSignals later overlay overrides earlier defined value', merged.mortgage === 900_000);
}

// ─── Test 14: fromBestMoveLedger normalises core ledger fields ──────────────
section('BestMoveLedger → UnifiedSignals adapter');
{
  const signals = fromBestMoveLedger({
    cash: 50_000,
    offsetBalance: 60_000,
    mortgage: 1_000_000,
    otherDebts: 5_000,
    monthlyIncome: 22_000,
    monthlyExpenses: 14_000,
    ppor: 1_500_000,
    plannedStockTotal: 0,
    plannedCryptoTotal: 0,
    billsRaw: [],
    properties: [],
    emergencyBuffer: 42_000,
    maxRefinanceLVR: 0.8,
    mortgageRate: 0.065,
    etfExpectedReturn: 0.09,
    cryptoExpectedReturn: 0.2,
    lowestFutureCash: 30_000,
    negativeCashMonths: [],
    rohamGrossAnnual: 264_000,
    superContribAnnual: 25_000,
    stocksValue: 100_000,
    cryptoValue: 5_000,
    depositPowerResult: {
      totalDepositPower: 200_000,
      readinessPct: 80,
      isReady: false,
      totalUsableEquity: 150_000,
      deployableCash: 50_000,
      fundingSources: [],
    },
  } as any);
  assert('ledger surplus derived from income − expenses', signals.monthlySurplus === 8_000);
  assert('ledger marginal tax at top bracket for $264k income', signals.marginalTaxRate === 0.47);
  assert('ledger emergency buffer carried across', signals.emergencyBufferTarget === 42_000);
  assert('ledger deposit readiness carried across', signals.depositReadinessPct === 80);
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
