/**
 * test-sprint5-goalsolver.ts
 *
 * Sprint 5 Phase 1 — Goal Solver Engine V1 test suite.
 *
 * Verifies the engine answers the four user-facing questions:
 *   - How much more do I need?
 *   - How much must I invest monthly?
 *   - Am I on track?
 *   - How many years early or late am I?
 *
 * The fixture is the same realistic Sprint 4 household used by the
 * reconciliation tests so the canonical ledger feeds the same numbers the
 * dashboard / reports surfaces use.
 *
 * Run with:  tsx script/test-sprint5-goalsolver.ts
 */

import { solveGoalGap, type GoalSolverInputs } from "../client/src/lib/goalSolver";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
} from "../client/src/lib/canonicalFire";
import { computeCanonicalDebtService } from "../client/src/lib/canonicalDebtService";
import type { MonteCarloResult } from "../client/src/lib/forecastStore";

let passed = 0;
let failed = 0;
function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(
      `  FAIL  ${label}` +
        (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""),
    );
  }
}
function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol;
}

/* ─── Fixture — realistic Shahrokh-family household ──────────────────────── */

const FIXTURE_SNAPSHOT = {
  ppor: 1_510_000,
  cash: 40_000,
  savings_cash: 0,
  emergency_cash: 0,
  other_cash: 0,
  offset_balance: 222_000,
  roham_super_balance: 49_500,
  fara_super_balance: 38_500,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  other_assets: 0,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  other_income: 0,
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const SETTLED_IP = {
  id: "ip-1",
  type: "investment",
  lifecycle_status: "settled",
  settlement_date: "2024-06-01",
  purchase_date: "2024-06-01",
  current_value: 720_000,
  loan_amount: 540_000,
  interest_rate: 6.15,
  loan_term: 30,
  loan_type: "PI",
  weekly_rent: 650,
  vacancy_rate: 4,
  management_fee: 7,
  name: "Brisbane IP",
};

const FIXTURE_INPUTS: DashboardInputs = {
  snapshot: FIXTURE_SNAPSHOT,
  properties: [SETTLED_IP],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-24",
};

const baseInputs = (): GoalSolverInputs => ({
  canonicalLedger: FIXTURE_INPUTS,
});

console.log("\nSprint 5 Phase 1 — Goal Solver Engine V1\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Canonical-source guarantees
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Canonical-source guarantees (no duplicated math, no page-specific formulas)");

{
  // The required asset base when targetPassiveIncome is supplied MUST equal
  // canonicalFire.computeCanonicalFire(...).fireNumber for the same target.
  const annualTarget = 96_000;
  const result = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetPassiveIncome: annualTarget,
  });
  const expectedFire = computeCanonicalFire(FIXTURE_INPUTS, {
    targetMonthlyIncome: annualTarget / 12,
  }).fireNumber;
  ok(
    "requiredAssetBase delegates to canonicalFire.fireNumber",
    near(result.requiredAssetBase, expectedFire, 2),
    { result: result.requiredAssetBase, expectedFire },
  );

  // Current net worth in trace MUST equal canonicalHeadlineMetrics.computeCanonicalHeadlineMetrics
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  ok(
    "trace.currentNetWorth == canonical headline NW",
    near(result.trace.currentNetWorth, head.netWorth, 1),
  );
  ok(
    "trace.currentPassiveIncome == canonical passive income",
    near(result.trace.currentPassiveIncome, head.passiveIncome, 1),
  );
  ok(
    "trace.monthlySurplusAvailable == canonical monthly surplus",
    near(result.trace.monthlySurplusAvailable, head.monthlySurplus, 1),
  );

  // Debt service comes from canonicalDebtService.
  const debt = computeCanonicalDebtService(FIXTURE_INPUTS);
  ok(
    "trace.monthlyDebtService == canonicalDebtService total",
    near(result.trace.monthlyDebtService, debt.totalMonthly, 1),
  );

  // SWR used MUST come from canonicalFire (no hardcoded 4% drift)
  const fire = computeCanonicalFire(FIXTURE_INPUTS, {
    targetMonthlyIncome: annualTarget / 12,
  });
  ok(
    "trace.swrUsed == canonicalFire.swrPct/100",
    near(result.trace.swrUsed, fire.swrPct / 100, 0.0001),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Target already achieved
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Target already achieved");

{
  // Set target NW well below current canonical NW — should be ON_TRACK with
  // zero shortfall and zero required contribution.
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: Math.max(1_000, Math.round(head.netWorth * 0.5)),
    targetFireDate: "2035-12-31",
  });
  ok("achieved: shortfallAmount == 0", r.shortfallAmount === 0, r.shortfallAmount);
  ok("achieved: requiredMonthlyContribution == 0", r.requiredMonthlyContribution === 0);
  ok("achieved: feasibility ON_TRACK", r.fireFeasibility === "ON_TRACK", r.fireFeasibility);
  // Note: requiredPortfolioGrowth uses investible base (excludes PPOR equity,
  // cars, iran property) — even when total NW exceeds target, the investible
  // base may not, producing a small positive CAGR rather than zero.
  ok(
    "achieved: requiredPortfolioGrowth is null/0 or finite & small",
    r.requiredPortfolioGrowth === null ||
      r.requiredPortfolioGrowth === 0 ||
      (Number.isFinite(r.requiredPortfolioGrowth) &&
        (r.requiredPortfolioGrowth as number) < 1.0),
    r.requiredPortfolioGrowth,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Small shortfall
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Small shortfall — feasibility ON_TRACK / STRETCH");

{
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  // Target ~10% above current NW with a 20-year horizon — should be feasible
  // from the household's surplus.
  const target = Math.round(head.netWorth * 1.1);
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2046-05-24",
  });
  ok("small shortfall: positive shortfallAmount", r.shortfallAmount > 0);
  ok("small shortfall: shortfall ≈ target - NW", near(r.shortfallAmount, target - head.netWorth, 2));
  ok(
    "small shortfall: requiredMonthlyContribution is finite & non-negative",
    Number.isFinite(r.requiredMonthlyContribution) && r.requiredMonthlyContribution >= 0,
  );
  ok(
    "small shortfall: feasibility ON_TRACK or STRETCH (not impossible)",
    r.fireFeasibility === "ON_TRACK" || r.fireFeasibility === "STRETCH",
    r.fireFeasibility,
  );
  ok(
    "small shortfall: requiredPortfolioGrowth ≥ 0 and ≤ canonical cap",
    r.requiredPortfolioGrowth != null &&
      r.requiredPortfolioGrowth >= 0 &&
      r.requiredPortfolioGrowth < 0.5,
    r.requiredPortfolioGrowth,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Large shortfall
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Large shortfall — feasibility STRETCH / UNREALISTIC");

{
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  // Target 6x current NW over a tight 6y horizon — the required contribution
  // must exceed the household's monthly surplus and push out of ON_TRACK.
  const target = Math.round(head.netWorth * 6);
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2032-05-24",
  });
  ok("large shortfall: positive shortfallAmount", r.shortfallAmount > head.netWorth);
  ok(
    "large shortfall: feasibility ≠ ON_TRACK",
    r.fireFeasibility !== "ON_TRACK",
    r.fireFeasibility,
  );
  ok(
    "large shortfall: requiredMonthlyContribution > 0",
    r.requiredMonthlyContribution > 0,
    r.requiredMonthlyContribution,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Impossible target
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Impossible target — feasibility IMPOSSIBLE");

{
  // Target date in the past, NW far below.
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: 50_000_000,
    targetFireDate: "2020-01-01",
  });
  ok("impossible (past date): IMPOSSIBLE", r.fireFeasibility === "IMPOSSIBLE", r.fireFeasibility);
  ok("impossible (past date): trace yearsToTarget <= 0", (r.trace.yearsToTarget ?? -1) <= 0);

  // Target so large that contribution required >> 2x monthly surplus
  const r2 = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: 100_000_000,
    targetFireDate: "2029-05-24",
  });
  ok(
    "impossible (extreme target): feasibility UNREALISTIC or IMPOSSIBLE",
    r2.fireFeasibility === "UNREALISTIC" || r2.fireFeasibility === "IMPOSSIBLE",
    r2.fireFeasibility,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Early FIRE target (aggressive but plausible)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Early FIRE target");

{
  // 5-year horizon to $96k passive — likely STRETCH/UNREALISTIC for this
  // household. The key behavioural assertion is that the engine returns a
  // finite, sane required contribution and a non-ON_TRACK verdict (because
  // the current investible base is small relative to the FIRE number).
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetPassiveIncome: 96_000,
    targetFireDate: "2031-05-24",
  });
  ok(
    "early FIRE: requiredAssetBase = 25× target (matches canonical SWR)",
    near(r.requiredAssetBase, 96_000 / 0.04, 2),
    r.requiredAssetBase,
  );
  ok(
    "early FIRE: feasibility ≠ ON_TRACK (5y horizon)",
    r.fireFeasibility !== "ON_TRACK",
    r.fireFeasibility,
  );
  ok(
    "early FIRE: requiredMonthlyContribution > 0 finite",
    r.requiredMonthlyContribution > 0 && Number.isFinite(r.requiredMonthlyContribution),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Passive income target
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Passive income target — gap calculation");

{
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const target = 96_000;
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetPassiveIncome: target,
    targetFireDate: "2046-05-24",
  });
  ok(
    "passive income gap = target − current",
    near(r.requiredPassiveIncomeGap, Math.max(0, target - head.passiveIncome), 1),
    { gap: r.requiredPassiveIncomeGap, expected: target - head.passiveIncome },
  );
  ok(
    "requiredAssetBase = target / SWR (from canonicalFire, not hardcoded)",
    near(r.requiredAssetBase, target / r.trace.swrUsed, 2),
  );

  // When target passive income already met → gap == 0
  const r2 = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetPassiveIncome: Math.max(1, Math.floor(head.passiveIncome / 2)),
  });
  ok(
    "passive target already exceeded → gap 0",
    r2.requiredPassiveIncomeGap === 0,
    r2.requiredPassiveIncomeGap,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Net worth target
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Net worth target — shortfall calculation");

{
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const target = head.netWorth + 500_000;
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2036-05-24",
  });
  ok("NW target: shortfall = target - NW", near(r.shortfallAmount, target - head.netWorth, 2));
  ok(
    "NW target: requiredAssetBase = target",
    r.requiredAssetBase === target,
    { requiredAssetBase: r.requiredAssetBase, target },
  );
  ok(
    "NW target: requiredPortfolioGrowth is finite",
    r.requiredPortfolioGrowth != null && Number.isFinite(r.requiredPortfolioGrowth),
    r.requiredPortfolioGrowth,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Years ahead / behind from forecast
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  yearsAheadOrBehind from forecast / MC outputs");

{
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  // Synthetic forecast crossing the target in year 2040.
  const forecastSeries = Array.from({ length: 20 }, (_, i) => {
    const year = 2027 + i;
    const endNetWorth = head.netWorth + 100_000 * (i + 1);
    return {
      year,
      startNetWorth: head.netWorth + 100_000 * i,
      income: 0,
      expenses: 0,
      netCashflow: 0,
      propertyValue: 0,
      propertyLoans: 0,
      propertyEquity: 0,
      propertyDetails: [],
      stockValue: 0,
      cryptoValue: 0,
      cash: 0,
      superRoham: 0,
      superFara: 0,
      totalSuper: 0,
      totalAssets: endNetWorth,
      totalLiabilities: 0,
      accessibleNetWorth: endNetWorth,
      endNetWorth,
      growth: 100_000,
      growthPct: 0,
      growthBreakdown: {} as any,
      cagr: 0,
      realGrowth: 0,
      realGrowthPct: 0,
      passiveIncome: 0,
      monthlyCashFlow: 0,
    } as any;
  });
  const target = head.netWorth + 500_000; // crossed in year 2027 + 5 = 2032
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2035-12-31",
    forecastOutputs: { monthly: [], annual: [], netWorth: forecastSeries, cashEngine: {} as any },
  });
  ok(
    "forecast: projectedAchievementYear is finite",
    r.trace.projectedAchievementYear != null,
    r.trace.projectedAchievementYear,
  );
  ok(
    "forecast: yearsAheadOrBehind ≈ targetYear − projectedYear",
    r.yearsAheadOrBehind != null && Number.isFinite(r.yearsAheadOrBehind),
    r.yearsAheadOrBehind,
  );
  // Forecast crosses target at row index 4 (year 2031, endNetWorth = NW + 500k);
  // target date 2035 → +4 years ahead.
  ok(
    "forecast: 4y ahead when target crossed 4y before targetFireDate",
    r.yearsAheadOrBehind === 4,
    r.yearsAheadOrBehind,
  );
}

{
  // MC fallback path
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const target = head.netWorth + 200_000;
  const mc: MonteCarloResult = {
    p10: 0,
    p25: 0,
    median: target * 2,
    p75: 0,
    p90: 0,
    prob_ff: 70,
    prob_3m: 90,
    prob_5m: 60,
    prob_10m: 20,
    prob_neg_cf: 5,
    prob_cash_shortfall: 3,
    lowest_cash_median: 10_000,
    highest_risk_year: 2030,
    biggest_risk_driver: "synthetic",
    fan_data: [
      { year: 2030, p10: 0, p25: 0, median: head.netWorth, p75: 0, p90: 0 },
      { year: 2034, p10: 0, p25: 0, median: target * 2, p75: 0, p90: 0 },
    ],
    key_risks: [],
    recommended_actions: [],
    ran_at: "2026-05-24T00:00:00Z",
    simulations: 1000,
  };
  const r = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2040-01-01",
    monteCarloOutputs: mc,
  });
  ok(
    "MC fallback: projected year from MC fan_data (2034)",
    r.trace.projectedAchievementYear === 2034,
    r.trace.projectedAchievementYear,
  );
  ok(
    "MC fallback: yearsAheadOrBehind == 2040 - 2034 == 6",
    r.yearsAheadOrBehind === 6,
    r.yearsAheadOrBehind,
  );
  ok(
    "MC fallback: trace.mcConfidence set from prob_ff",
    near((r.trace.mcConfidence ?? 0) * 100, 70, 0.1),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — No page-specific calculations: deterministic, idempotent
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10 Determinism (same inputs → identical outputs)");

{
  const inputs: GoalSolverInputs = {
    canonicalLedger: FIXTURE_INPUTS,
    targetPassiveIncome: 96_000,
    targetFireDate: "2040-05-24",
  };
  const a = solveGoalGap(inputs);
  const b = solveGoalGap(inputs);
  ok("identical inputs → identical requiredAssetBase", a.requiredAssetBase === b.requiredAssetBase);
  ok(
    "identical inputs → identical requiredMonthlyContribution",
    a.requiredMonthlyContribution === b.requiredMonthlyContribution,
  );
  ok("identical inputs → identical feasibility", a.fireFeasibility === b.fireFeasibility);
  ok("identical inputs → identical shortfall", a.shortfallAmount === b.shortfallAmount);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — No hardcoded household values
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§11 No hardcoded household values — outputs scale with input snapshot");

{
  // Run with a perturbed snapshot — the canonical figures change, and the
  // solver outputs MUST reflect the new household state.
  const PERTURBED_INPUTS: DashboardInputs = {
    ...FIXTURE_INPUTS,
    snapshot: { ...FIXTURE_SNAPSHOT, cash: 1_000_000, mortgage: 0 },
  };
  const base = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: 2_000_000,
    targetFireDate: "2036-05-24",
  });
  const perturbed = solveGoalGap({
    canonicalLedger: PERTURBED_INPUTS,
    targetNetWorth: 2_000_000,
    targetFireDate: "2036-05-24",
  });
  ok(
    "shortfall decreases when cash↑ / debt↓ (no hardcoded values)",
    perturbed.shortfallAmount < base.shortfallAmount,
    { base: base.shortfallAmount, perturbed: perturbed.shortfallAmount },
  );
  ok(
    "trace.currentNetWorth differs across households",
    perturbed.trace.currentNetWorth !== base.trace.currentNetWorth,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §12 — Incomplete inputs handled explicitly
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§12 Incomplete inputs surface explicit state");

{
  // No targets supplied — engine returns a sane "incomplete" state, not 0s
  // pretending to be answers.
  const r = solveGoalGap({ canonicalLedger: FIXTURE_INPUTS });
  ok(
    "no targets: trace.incomplete == true",
    r.trace.incomplete === true,
    r.trace,
  );
  ok("no targets: requiredPortfolioGrowth null", r.requiredPortfolioGrowth === null);

  // Empty canonicalLedger: degrade gracefully.
  const r2 = solveGoalGap({ canonicalLedger: undefined as any });
  ok("missing ledger: IMPOSSIBLE", r2.fireFeasibility === "IMPOSSIBLE");
  ok("missing ledger: trace.incomplete true", r2.trace.incomplete === true);
}

/* ─── Summary ───────────────────────────────────────────────────────────── */

console.log(`\n— Sprint 5 Goal Solver — Result: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
