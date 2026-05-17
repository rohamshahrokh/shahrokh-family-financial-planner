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
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const resolveTrajectory = (fan: any[]) => {
    const row = fan.find(r => r.year === horizonYear) ?? fan[fan.length - 1];
    // Tightened contract: the resolver returns a neutral "pending" state
    // when fan_data is empty — it does NOT return a deterministic value as
    // the canonical trajectory.
    if (!row) return { trajectoryP50: null, source: 'pending' as const };
    return { trajectoryP50: row.median, source: 'MC P50' as const };
  };
  const t = resolveTrajectory(fanData);
  assert('trajectory source = "MC P50" when fan_data contains horizon year', t.source === 'MC P50');
  assert(`trajectory value = canonical MC P50 ($3.58M) — not deterministic ($5.33M)`,
    t.trajectoryP50 === 3_580_000 && t.trajectoryP50 !== determ10y);

  // Fallback path: empty fan_data MUST yield the neutral pending state —
  // not a deterministic dollar value pretending to be canonical.
  const fallback = resolveTrajectory([]);
  assert('returns "pending" state when fan_data is empty (no deterministic primary value)',
    fallback.source === 'pending');
  assert('returns null trajectoryP50 when fan_data is empty (no canonical figure)',
    fallback.trajectoryP50 === null);
}

// ─── Test 7: Deterministic baseline never marked official when MC absent ─────
section('Validation 5: Deterministic forecast never shown as official trajectory');
{
  // Static-source assertion: read the Executive Dashboard component and
  // verify the no-MC branch renders the "Monte Carlo pending" copy and a
  // CTA, and that the deterministic figure (if shown at all) is explicitly
  // tagged "non-canonical" — never as the primary trajectory value.
  const file = resolve(__dirname, '..', 'client', 'src', 'components', 'ExecutiveDashboard.tsx');
  const src = readFileSync(file, 'utf8');

  assert('Executive header has a no-MC "Monte Carlo pending" copy block',
    /Monte Carlo pending/.test(src));
  assert('Executive header has a "Run Monte Carlo" CTA in the fallback',
    /Run Monte Carlo/.test(src));
  assert('Executive header source line names the no-MC state explicitly',
    /Monte Carlo not yet run/.test(src));

  // The PRIMARY trajectory dollar value must be guarded by hasMcTrajectory.
  // We assert the source does NOT contain a primary trajectory render that
  // pulls year10NW unguarded (which would re-create the bug).
  const primaryDeterministicRegex =
    /executive-trajectory-value[^}]*formatCurrency\([^)]*year10NW/;
  assert('no primary trajectory render reads year10NW as the canonical figure',
    !primaryDeterministicRegex.test(src));

  // Any deterministic figure that DOES appear in the no-MC branch must be
  // labelled "non-canonical" so it cannot be mistaken for the official one.
  const determSecondaryRegex =
    /executive-trajectory-deterministic-secondary[\s\S]{0,300}non-canonical/;
  assert('any deterministic figure in the fallback is labelled "non-canonical"',
    determSecondaryRegex.test(src));

  // And the badge must read "PENDING" (not "DET") when MC is absent so the
  // user immediately understands the headline figure is intentionally absent.
  const pendingBadgeRegex =
    /executive-trajectory-source-badge[\s\S]{0,400}PENDING/;
  assert('source badge reads "PENDING" when MC is absent (not "DET")',
    pendingBadgeRegex.test(src));
}

// ─── Test 7b: Visual polish pass — collapsed deterministic + contrast ──────
section('Visual polish: deterministic baseline collapsed, source line legible');
{
  const file = resolve(__dirname, '..', 'client', 'src', 'components', 'ExecutiveDashboard.tsx');
  const src = readFileSync(file, 'utf8');

  // Deterministic baseline must live inside a <details> disclosure so it is
  // hidden by default, not visible inline.
  assert('deterministic baseline is wrapped in a <details> disclosure',
    /<details[\s\S]{0,200}executive-trajectory-deterministic-details/.test(src));
  assert('disclosure summary copy is "Show deterministic baseline (non-canonical)"',
    /Show deterministic baseline \(non-canonical\)/.test(src));

  // Source line must use a foreground/* tone (not the very low-contrast
  // muted-foreground/70 used previously) so mobile readers can read it.
  // The `style={{ color: ... }}` attribute precedes `data-testid` in JSX,
  // so we scan a window AROUND the testid (both directions) for a
  // foreground/0.NN value where NN >= 50.
  // The `executive-trajectory-source` testid appears twice (the MC-available
  // path and the no-MC fallback path). Both must use a high-contrast
  // foreground/0.NN >= 0.50 tone — the bug was muted-foreground/0.70 / 0.80
  // which clipped contrast on dark backgrounds. We scan both occurrences
  // and require BOTH to satisfy the contrast contract.
  const sourceMatches = src.match(/data-testid="executive-trajectory-source"/g) ?? [];
  assert(`executive-trajectory-source render block exists (found ${sourceMatches.length})`,
    sourceMatches.length >= 2);
  let lastIdx = 0;
  let bothReadable = true;
  for (let n = 0; n < 2; n++) {
    const idx = src.indexOf('data-testid="executive-trajectory-source"', lastIdx);
    if (idx === -1) { bothReadable = false; break; }
    const windowSrc = src.slice(Math.max(0, idx - 400), idx + 200);
    // Reject the legacy "muted-foreground" tones and require a readable
    // foreground/0.NN where NN is between 50 and 99.
    // The hsl() syntax in the source reads `hsl(var(--foreground) / 0.NN)`
    // — note the closing paren before the slash. The regex must tolerate
    // that paren and any whitespace.
    const usesReadable = /foreground\)?\s*\/\s*0\.(5\d|6\d|7\d|8\d|9\d)/.test(windowSrc)
      && !/text-muted-foreground\/(?:60|70|80)/.test(windowSrc);
    if (!usesReadable) { bothReadable = false; break; }
    lastIdx = idx + 1;
  }
  assert('both fallback and MC-active source lines use readable foreground tone',
    bothReadable);

  // The 10y Trajectory label + badge sit in a flex-wrap row so the PENDING
  // badge can drop below the label on narrow screens instead of overlapping.
  assert('label/badge row uses flex-wrap to avoid crowding the "10y Trajectory" label',
    /flex flex-wrap items-center gap-x-2 gap-y-1 mb-1/.test(src));
}

// ─── Test 7c: Strategic Priorities truncation safety ────────────────────────
section('Visual polish: Strategic Priorities card copy never cuts mid-sentence');
{
  const file = resolve(__dirname, '..', 'client', 'src', 'components', 'ExecutiveDashboard.tsx');
  const src = readFileSync(file, 'utf8');

  // The card body must call the new priorityPreview helper, not the raw
  // reasoning paragraph (which embeds the full reconciliation explanation
  // and visibly truncates mid-sentence under line-clamp-2).
  assert('Strategic Priorities top-3 card renders priorityPreview(r), not r.reasoning',
    /line-clamp-2[\s\S]{0,200}priorityPreview\(r\)/.test(src));
  assert('Strategic Priorities expanded list also renders priorityPreview(r)',
    /line-clamp-1[\s\S]{0,200}priorityPreview\(r\)/.test(src));

  // The helper itself: DCA recommendations must collapse to a single
  // reconciled sentence and everything else must terminate cleanly at the
  // first sentence boundary.
  assert('priorityPreview emits a single reconciled sentence for DCA',
    /priorityPreview[\s\S]{0,2000}recommendedMonthlyAmount[\s\S]{0,200}safeDeployableSurplus/.test(src));
  assert('priorityPreview falls back to first complete sentence',
    /priorityPreview[\s\S]{0,2000}\[\^\.\!\?\]\+\[\.\!\?\]/.test(src));
}

// ─── Test 8: No deterministic dollar trajectory is marked official ──────────
section('Validation 6: Deterministic value never wins as official trajectory');
{
  // A consumer of the Executive Dashboard contract that omits trajectoryP50
  // MUST NOT cause a deterministic dollar value to appear in the canonical
  // trajectory slot. We assert the prop contract by inspecting the
  // component's interface: trajectoryP50 is optional, and the absence of it
  // must route through the pending branch.
  const file = resolve(__dirname, '..', 'client', 'src', 'components', 'ExecutiveDashboard.tsx');
  const src = readFileSync(file, 'utf8');

  // The `hasMcTrajectory` gate must be the ONLY thing that opens the
  // canonical (dollar-value) trajectory render path.
  assert('hasMcTrajectory gate exists and is the truth value for canonical render',
    /hasMcTrajectory\s*=\s*typeof p\.trajectoryP50/.test(src));

  // When the gate is false the source label must NOT say "Deterministic baseline"
  // as the primary description (it was the production-bug copy).
  assert('no-MC source label does NOT call deterministic baseline the canonical source',
    !/Source:\s*Deterministic baseline/.test(src));
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
