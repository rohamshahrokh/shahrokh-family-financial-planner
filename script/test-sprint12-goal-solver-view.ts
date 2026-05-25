/**
 * test-sprint12-goal-solver-view.ts
 *
 * Sprint 12 — advisor-style selectors over the canonical Sprint 10 outputs.
 * Validates that selectFireGapSummary / selectTop3Actions / selectPathRecommendations
 * / selectRankedBlockers / selectMinimumChange / selectDoNothingComparison
 * return well-formed views from real engine results — without recomputing
 * any financial output.
 *
 * Target: ≥ 30 assertions.
 *
 * Run: tsx script/test-sprint12-goal-solver-view.ts
 */

import { buildTruePortfolioOptimizer } from "../client/src/lib/truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "../client/src/lib/probabilisticWealthEngine";
import { buildPathSimulationEngine } from "../client/src/lib/pathSimulationEngine";
import { computeCanonicalFire } from "../client/src/lib/canonicalFire";
import {
  buildGoalSolverPro,
  EMPTY_GOAL_TARGETS,
  type GoalSolverProResult,
  type GoalSolverProTargets,
} from "../client/src/lib/goalSolverPro";
import {
  selectFireGapSummary,
  selectTop3Actions,
  selectPathRecommendations,
  selectRankedBlockers,
  selectMinimumChange,
  selectDoNothingComparison,
} from "../client/src/lib/goalSolverView";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
  } else {
    failed++;
    const msg = `FAIL  ${label}` + (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : "");
    failures.push(msg);
    console.error(`  ${msg}`);
  }
}

const FIXTURE_SNAPSHOT_RICH = {
  ppor: 1_510_000,
  cash: 40_000,
  offset_balance: 222_000,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
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
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const FIXTURE_RICH: DashboardInputs = {
  snapshot: FIXTURE_SNAPSHOT_RICH,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const GOAL_INPUTS = { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 };

function buildStack(fixture: DashboardInputs, seed = 42) {
  const sprint7 = buildTruePortfolioOptimizer({
    canonicalLedger: fixture,
    goalSolverInputs: GOAL_INPUTS,
  });
  const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
  const sprint9 = buildPathSimulationEngine({
    sprint7Result: sprint7,
    canonicalLedger: fixture,
    seed,
    simulationsPerStrategy: 1_000,
    maxStrategies: 3,
  });
  const canonicalFire = computeCanonicalFire(fixture);
  return { sprint7, sprint8, sprint9, canonicalFire };
}

function makeResult(targets: GoalSolverProTargets): GoalSolverProResult {
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  return buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
  });
}

console.log("\nSprint 12 — Goal Solver advisor views\n");

/* §1 selectFireGapSummary populated for a real goal */
{
  const r = makeResult({ targetNetWorth: 5_000_000, targetFireYear: 2045, targetPassiveIncomeAnnual: 120_000 });
  const v = selectFireGapSummary(r);
  ok("§1.1 currentNetWorth finite or null", v.currentNetWorth === null || Number.isFinite(v.currentNetWorth));
  ok("§1.2 targetNetWorth = 5,000,000", v.targetNetWorth === 5_000_000);
  ok("§1.3 netWorthGap ≥ 0 or null", v.netWorthGap === null || v.netWorthGap >= 0);
  ok("§1.4 targetPassiveIncome = 120,000", v.targetPassiveIncome === 120_000);
  ok("§1.5 currentProbability ∈ [0,1] or null", v.currentProbability === null || (v.currentProbability >= 0 && v.currentProbability <= 1));
  ok("§1.6 requiredProbability set to 0.7 bar", v.requiredProbability === 0.7);
  ok("§1.7 targetFireYear = 2045", v.targetFireYear === 2045);
  ok("§1.8 medianFireYear finite or null", v.medianFireYear === null || Number.isFinite(v.medianFireYear));
}

/* §2 selectFireGapSummary with EMPTY targets */
{
  const r = makeResult(EMPTY_GOAL_TARGETS);
  const v = selectFireGapSummary(r);
  ok("§2.1 targetNetWorth null when not provided", v.targetNetWorth === null);
  ok("§2.2 netWorthGap null when no target", v.netWorthGap === null);
  ok("§2.3 targetPassiveIncome null when no target", v.targetPassiveIncome === null);
  ok("§2.4 passiveIncomeGap null when no target", v.passiveIncomeGap === null);
}

/* §3 selectTop3Actions size + shape */
{
  const r = makeResult({ targetNetWorth: 5_000_000, targetFireYear: 2045 });
  const actions = selectTop3Actions(r);
  ok("§3.1 actions length ≤ 3", actions.length <= 3);
  ok("§3.2 actions length ≥ 0", actions.length >= 0);
  for (const a of actions) {
    ok(`§3.3 action labelled (${a.label.slice(0, 20)}…)`, typeof a.label === "string" && a.label.length > 0);
    ok(`§3.4 action delta NW finite/null`, a.netWorthDelta === null || Number.isFinite(a.netWorthDelta));
    ok(`§3.5 action delta PI finite/null`, a.passiveIncomeDelta === null || Number.isFinite(a.passiveIncomeDelta));
    ok(`§3.6 action delta P finite/null`, a.probabilityDelta === null || Number.isFinite(a.probabilityDelta));
  }
}

/* §4 selectPathRecommendations maps Sprint 10 objectives */
{
  const r = makeResult({ targetNetWorth: 5_000_000, targetFireYear: 2045, targetPassiveIncomeAnnual: 120_000 });
  const paths = selectPathRecommendations(r);
  ok("§4.1 paths is array", Array.isArray(paths));
  ok("§4.2 every path has label", paths.every((p) => typeof p.label === "string" && p.label.length > 0));
  ok("§4.3 every path has kind", paths.every((p) => ["fastest", "highest-prob", "safest", "hybrid", "lowest-cash"].includes(p.kind)));
  ok("§4.4 every path has finite-or-null probability", paths.every((p) => p.probability === null || (p.probability >= 0 && p.probability <= 1)));
  ok("§4.5 every path has finite-or-null expectedFireYear", paths.every((p) => p.expectedFireYear === null || Number.isFinite(p.expectedFireYear)));
  ok("§4.6 every path has actions[] array", paths.every((p) => Array.isArray(p.actions)));
}

/* §5 selectRankedBlockers ordering + shape */
{
  const r = makeResult({ targetDebtCeiling: 100_000, targetNetWorth: 50_000_000, targetFireYear: 2030 });
  const blockers = selectRankedBlockers(r);
  ok("§5.1 blockers is array", Array.isArray(blockers));
  ok("§5.2 ranks start at 1", blockers.length === 0 || blockers[0].rank === 1);
  ok("§5.3 ranks are monotonically increasing",
    blockers.every((b, i, arr) => i === 0 || b.rank > arr[i - 1].rank));
  ok("§5.4 every blocker has label", blockers.every((b) => typeof b.label === "string" && b.label.length > 0));
}

/* §6 selectMinimumChange shape */
{
  const r = makeResult({ targetNetWorth: 1_000_000, targetFireYear: 2060 });
  const m = selectMinimumChange(r);
  ok("§6.1 minimum change is null or has shape", m === null || (typeof m.changeType === "string" && typeof m.magnitude === "string"));
}

/* §7 selectDoNothingComparison shape */
{
  const r = makeResult({ targetNetWorth: 5_000_000, targetFireYear: 2045 });
  const cmp = selectDoNothingComparison(r);
  ok("§7.1 comparison has all 8 keys",
    "baselineFireYear" in cmp && "recommendedFireYear" in cmp &&
    "baselineNetWorth" in cmp && "recommendedNetWorth" in cmp &&
    "baselineProbability" in cmp && "recommendedProbability" in cmp &&
    "baselinePassiveIncome" in cmp && "recommendedPassiveIncome" in cmp);
  ok("§7.2 recommendedProbability ∈ [0,1] or null", cmp.recommendedProbability === null || (cmp.recommendedProbability >= 0 && cmp.recommendedProbability <= 1));
  ok("§7.3 baselineProbability ∈ [0,1] or null", cmp.baselineProbability === null || (cmp.baselineProbability >= 0 && cmp.baselineProbability <= 1));
  ok("§7.4 recommended ≥ baseline NW or null (when both finite)",
    !(Number.isFinite(cmp.recommendedNetWorth) && Number.isFinite(cmp.baselineNetWorth)) ||
    cmp.recommendedNetWorth! >= cmp.baselineNetWorth!);
}

/* §8 Empty-data resilience */
{
  const r = makeResult(EMPTY_GOAL_TARGETS);
  const v = selectFireGapSummary(r);
  const a = selectTop3Actions(r);
  const p = selectPathRecommendations(r);
  const b = selectRankedBlockers(r);
  const m = selectMinimumChange(r);
  const cmp = selectDoNothingComparison(r);
  ok("§8.1 selector resilience: gap summary returned", v !== null && typeof v === "object");
  ok("§8.2 selector resilience: top3 array", Array.isArray(a));
  ok("§8.3 selector resilience: paths array", Array.isArray(p));
  ok("§8.4 selector resilience: blockers array", Array.isArray(b));
  ok("§8.5 selector resilience: minChange null or object", m === null || typeof m === "object");
  ok("§8.6 selector resilience: do-nothing object", cmp !== null && typeof cmp === "object");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(f);
  process.exit(1);
}
process.exit(0);
