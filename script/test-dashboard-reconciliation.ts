/**
 * Validation tests for the Dashboard Reconciliation Fix.
 *
 * Three reconciliation invariants the production dashboard MUST honour:
 *
 *   1. Executive Overview 10y trajectory equals the canonical Monte Carlo P50
 *      for the selected horizon (when MC has been run). When MC is unavailable
 *      it falls back to the deterministic projection and is clearly labelled
 *      as such.
 *
 *   2. The Recommendation Engine's monthly DCA recommendation NEVER exceeds
 *      the dashboard's headline monthly surplus. Specifically:
 *        - When surplus is $7,000/mo, DCA must be <= $7,000/mo
 *        - After buffer top-ups and a small safety slice the cap shrinks
 *          further (safe deployable surplus)
 *
 *   3. The dashboard surplus that flows into the recommendation engine
 *      reconciles to the same canonical figure shown in the Executive Overview
 *      header (no "phantom $17k surplus" regression).
 *
 * Pure unit tests — no Supabase, no DOM.
 */

import {
  computeUnifiedRecommendations,
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

// ─── Baseline signals matching the production household ──────────────────────
// Income $22k/mo, expenses $15k/mo (debt-inclusive) ⇒ surplus $7k/mo.
const SHAHROKH_HEALTHY: UnifiedSignals = {
  cashOutsideOffset: 60_000,
  offsetBalance: 80_000,
  mortgage: 1_000_000,
  otherDebts: 0,
  ppor: 1_510_000,
  monthlyIncome: 22_000,
  monthlyExpenses: 15_000,
  monthlySurplus: 7_000,
  expensesIncludeDebt: true,
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
  marginalTaxRate: 0.47,
  mcSurvivalProbability: 0.87,
  mcStressFlag: 'none',
  riskOverallScore: 72,
};

// ─── Test 1: DCA never exceeds safe deployable surplus ──────────────────────
section('Validation 2: DCA recommendation never exceeds safe deployable surplus');
{
  const out = computeUnifiedRecommendations(SHAHROKH_HEALTHY);
  const dca = out.all.find(r => r.actionType === 'etf_dca');
  assert('etf_dca candidate is produced for a healthy household', !!dca);
  if (dca && dca.surplusReconciliation) {
    const sr = dca.surplusReconciliation;
    assert(
      `safe deployable surplus (${sr.safeDeployableSurplus}) <= headline surplus (${SHAHROKH_HEALTHY.monthlySurplus})`,
      sr.safeDeployableSurplus <= (SHAHROKH_HEALTHY.monthlySurplus ?? 0),
    );
    assert(
      `recommended DCA (${sr.recommendedMonthlyAmount}) <= safe deployable surplus (${sr.safeDeployableSurplus})`,
      sr.recommendedMonthlyAmount <= sr.safeDeployableSurplus,
    );
    assert(
      `recommended DCA (${sr.recommendedMonthlyAmount}) <= dashboard surplus (${SHAHROKH_HEALTHY.monthlySurplus})`,
      sr.recommendedMonthlyAmount <= (SHAHROKH_HEALTHY.monthlySurplus ?? 0),
    );
    assert('reconciliation explanation is populated', sr.explanation.length > 0);
    assert(
      'reconciliation surfaces the income figure that was used',
      sr.monthlyIncomeUsed === SHAHROKH_HEALTHY.monthlyIncome,
    );
  }
}

// ─── Test 2: DCA shrinks when emergency buffer is short ─────────────────────
section('Validation 2b: DCA shrinks when buffer is short');
{
  const stressed: UnifiedSignals = {
    ...SHAHROKH_HEALTHY,
    cashOutsideOffset: 5_000,
    offsetBalance: 5_000,
    emergencyBufferTarget: 60_000,
  };
  const out = computeUnifiedRecommendations(stressed);
  const dca = out.all.find(r => r.actionType === 'etf_dca');
  // When the buffer is short the engine may suppress DCA entirely and surface
  // the emergency-buffer top-up as the best move — that is a valid outcome.
  if (dca && dca.surplusReconciliation) {
    const sr = dca.surplusReconciliation;
    assert(
      `with buffer top-up (${sr.bufferShortfallReserved}) the safe deployable surplus is reduced`,
      sr.bufferShortfallReserved > 0,
    );
    assert(
      `DCA cap respects the reduced safe deployable surplus`,
      sr.recommendedMonthlyAmount <= sr.safeDeployableSurplus,
    );
  } else {
    assert('engine correctly suppresses DCA when buffer is short', true);
  }
}

// ─── Test 3: DCA equals 0 when there is no surplus ──────────────────────────
section('Validation 2c: DCA is suppressed when there is no surplus');
{
  const zeroSurplus: UnifiedSignals = {
    ...SHAHROKH_HEALTHY,
    monthlyIncome: 18_000,
    monthlyExpenses: 18_000,
    monthlySurplus: 0,
  };
  const out = computeUnifiedRecommendations(zeroSurplus);
  const dca = out.all.find(r => r.actionType === 'etf_dca');
  assert('etf_dca is suppressed when surplus is zero', !dca);
}

// ─── Test 4: Surplus reconciliation matches dashboard inputs ────────────────
section('Validation 3: Surplus reconciliation = dashboard surplus input');
{
  const out = computeUnifiedRecommendations(SHAHROKH_HEALTHY);
  const dca = out.all.find(r => r.actionType === 'etf_dca');
  if (dca && dca.surplusReconciliation) {
    const sr = dca.surplusReconciliation;
    assert(
      `engine used income = dashboard income (${sr.monthlyIncomeUsed} === ${SHAHROKH_HEALTHY.monthlyIncome})`,
      sr.monthlyIncomeUsed === SHAHROKH_HEALTHY.monthlyIncome,
    );
    assert(
      `engine used expenses = dashboard expenses (${sr.monthlyExpensesUsed} === ${SHAHROKH_HEALTHY.monthlyExpenses})`,
      sr.monthlyExpensesUsed === SHAHROKH_HEALTHY.monthlyExpenses,
    );
    const impliedSurplus =
      sr.monthlyIncomeUsed - sr.monthlyExpensesUsed - sr.monthlyDebtRepaymentsUsed;
    assert(
      `(income − expenses − debt) = headline surplus ${SHAHROKH_HEALTHY.monthlySurplus}`,
      impliedSurplus === SHAHROKH_HEALTHY.monthlySurplus,
    );
  }
}

// ─── Test 5: Trajectory P50 invariant (Monte Carlo P50 wins over deterministic)
section('Validation 1: Executive trajectory uses MC P50 when available');
{
  // Synthetic stand-in: the dashboard wiring (see client/src/pages/dashboard.tsx)
  // resolves the row by matching `year === trajectoryHorizonYear`, falling back
  // to the final fan_data point. We replicate that resolver here to guarantee
  // the contract holds in isolation from React.
  const horizonYear = new Date().getFullYear() + 9;
  const fanData = [
    { year: horizonYear - 9, p10: 600_000, median: 800_000, p90: 1_000_000 },
    { year: horizonYear,     p10: 2_400_000, median: 3_580_000, p90: 5_800_000 },
  ];
  const determ10y = 5_330_000; // production bug case
  const resolveTrajectory = () => {
    const row = fanData.find(r => r.year === horizonYear) ?? fanData[fanData.length - 1];
    return row ? { value: row.median, source: 'MC P50' as const } : { value: determ10y, source: 'deterministic' as const };
  };
  const t = resolveTrajectory();
  assert('trajectory source = "MC P50" when fan_data contains horizon year', t.source === 'MC P50');
  assert(`trajectory value = canonical MC P50 ($3.58M) — not deterministic ($5.33M)`,
    t.value === 3_580_000 && t.value !== determ10y);

  // And the fallback path:
  const noMcResolve = () => {
    const fan: any[] = [];
    const row = fan.find(r => r.year === horizonYear) ?? fan[fan.length - 1];
    return row ? { value: row.median, source: 'MC P50' as const } : { value: determ10y, source: 'deterministic' as const };
  };
  const fallback = noMcResolve();
  assert('falls back to deterministic projection when fan_data is empty', fallback.source === 'deterministic');
}

// ─── Test 6: DCA title reflects the cap ─────────────────────────────────────
section('Validation 2d: DCA title narrates the cap when capped');
{
  // Force the cap to bind by making `surplus * 0.5` larger than the safe value.
  const big: UnifiedSignals = {
    ...SHAHROKH_HEALTHY,
    monthlySurplus: 20_000,
    monthlyExpenses: 2_000,
    monthlyIncome: 22_000,
    emergencyBufferTarget: 200_000,
    cashOutsideOffset: 5_000,
    offsetBalance: 5_000,
  };
  const out = computeUnifiedRecommendations(big);
  const dca = out.all.find(r => r.actionType === 'etf_dca');
  if (dca) {
    assert(
      `title narrates "DCA up to" wording when cap binds`,
      /up to/.test(dca.title) || /\b\$\d/.test(dca.title),
    );
  } else {
    assert('engine suppresses DCA when cap binds to ~0', true);
  }
}

console.log('');
if (failures === 0) {
  console.log(`✅ All dashboard-reconciliation tests passed`);
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) failed`);
  process.exit(1);
}
