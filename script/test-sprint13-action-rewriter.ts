/**
 * Sprint 13 — action rewriter & source-label tests.
 *
 * Verifies that every engine action string produces a user-facing label that
 * does NOT echo internal jargon ("checkpoint", "median net worth checkpoint",
 * "Acquire investment property #1") and that selectSourceLabelFor() returns
 * the labels promised in the Sprint 13 brief.
 *
 * Run: `tsx script/test-sprint13-action-rewriter.ts`
 */

import {
  rewriteActionPlanEntry,
  selectSourceLabelFor,
  selectTop3UserFacingActions,
  selectRankedBlockers,
  selectFireGapSummary,
  selectDoNothingComparison,
} from "../client/src/lib/goalSolverView";
import type { GoalSolverProResult, ActionPlanEntry } from "../client/src/lib/goalSolverPro";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const todayYear = new Date().getFullYear();
const ctx = { todayYear };

const FORBIDDEN = ["checkpoint", "strategy_id", "ranked candidate", "sprint", "p50", "p90"];

function asEntry(action: string, year: number = todayYear): ActionPlanEntry {
  return {
    year,
    action,
    sourceStrategyId: "s-test",
    inputField: "scenarios.dimensions.test",
    enginesUsed: ["test"],
    inputsUsed: ["test"],
    auditNote: "test",
  };
}

console.log("\n[1/4] rewriteActionPlanEntry — known engine strings");

const cases: Array<{ raw: string; year: number; expectIn: string }> = [
  { raw: 'Acquire investment property #1 (strategy "Stock-Heavy")', year: todayYear + 2, expectIn: "Buy investment property" },
  { raw: "Delay investment property purchase to 2030", year: 2030, expectIn: "Delay property purchase" },
  { raw: "Set monthly contribution to $4,500/mo", year: todayYear, expectIn: "Set monthly investing to" },
  { raw: "Median net worth checkpoint: $1,250,000", year: todayYear + 5, expectIn: "net-worth milestone" },
  { raw: "Projected FIRE year (median): 2042", year: 2042, expectIn: "Reach FIRE by 2042" },
  { raw: "Stock DCA scheduled to begin", year: todayYear + 1, expectIn: "Start stock investing schedule" },
  { raw: "Reduce PPOR debt by $50,000", year: todayYear, expectIn: "Reduce non-investment debt" },
  { raw: "Release equity in 2031", year: 2031, expectIn: "Release property equity" },
  { raw: "Increase passive income to $48k/year", year: todayYear, expectIn: "Increase passive income" },
  { raw: "Delay FIRE by 3 years", year: todayYear + 3, expectIn: "Delay FIRE" },
  { raw: "Some unknown engine action with weird tokens", year: todayYear + 1, expectIn: "Adjust your plan" },
];

for (const c of cases) {
  const r = rewriteActionPlanEntry(asEntry(c.raw, c.year), ctx);
  assert(r.what.includes(c.expectIn), `"${c.raw.slice(0, 40)}…" → ${r.what}`);
  assert(r.when.length > 0, `  when present for "${c.raw.slice(0, 30)}…"`);
  assert(r.why.length > 5, `  why is a real sentence for "${c.raw.slice(0, 30)}…"`);
  const lower = r.what.toLowerCase();
  for (const banned of FORBIDDEN) {
    assert(!lower.includes(banned), `  output does not contain banned token "${banned}"`);
  }
}

console.log("\n[2/4] selectSourceLabelFor — every promoted metric has a human label");

const metricsToTest = [
  { key: "currentNetWorth" as const, expected: "Canonical Ledger" },
  { key: "targetNetWorth" as const, expected: "Dashboard Goal" },
  { key: "gap" as const, expected: "Forecast Engine" },
  { key: "probability" as const, expected: "Scenario Engine" },
  { key: "fireYear" as const, expected: "Path Simulation" },
  { key: "doNothingNetWorth" as const, expected: "Forecast Engine (baseline)" },
  { key: "doNothingFireDate" as const, expected: "Path Simulation" },
  { key: "recommendedAction" as const, expected: "Goal Solver" },
  { key: "blocker" as const, expected: "Goal Solver" },
];

for (const m of metricsToTest) {
  const r = selectSourceLabelFor(m.key);
  assert(r.label === m.expected, `${m.key} → "${r.label}" (expected "${m.expected}")`);
}

const auditCtx = selectSourceLabelFor("recommendedAction", { candidateRank: 17 });
assert(auditCtx.internalRef === "Ranked candidate #17", `recommendedAction picks up internalRef when candidateRank passed`);

const auditCtx2 = selectSourceLabelFor("recommendedAction", { strategyId: "s-fastest", strategyLabel: "Fastest FIRE" });
assert(auditCtx2.internalRef === "Strategy Fastest FIRE", `recommendedAction picks up internalRef when strategyLabel passed`);

console.log("\n[3/4] selectTop3UserFacingActions — end to end");

const mockResult: GoalSolverProResult = {
  empty: false,
  engineVersion: "test",
  seed: 1,
  targets: { targetFireYear: todayYear + 10, targetNetWorth: 3_000_000 },
  feasibility: {
    status: "STRETCH",
    probabilityOfSuccess: 0.62,
    medianFireYear: todayYear + 11,
    bestCaseFireYear: todayYear + 9,
    worstCaseFireYear: todayYear + 18,
    expectedFireYear: todayYear + 11,
    audit: emptyAudit(),
  },
  gap: { entries: [], incomplete: false, blockers: [], audit: emptyAudit() },
  requiredInputs: {
    requiredMonthlyDCA: 4500,
    requiredAdditionalCapital: 0,
    requiredAdditionalProperties: 1,
    requiredSavingsRate: 0.4,
    requiredFireNumber: 3_000_000,
    sourceStrategyId: "s-rec",
    sourceStrategyLabel: "Recommended",
    audit: emptyAudit(),
  },
  constraints: { checks: [], passed: 0, failed: 0, candidatesEvaluated: 12, candidatesPassing: 6, audit: emptyAudit() },
  blockers: [
    {
      constraint: "Monthly surplus too low",
      reason: "Increase savings by $1,200/month",
      strategiesEliminated: ["s-a", "s-b", "s-c"],
      audit: emptyAudit(),
    },
    {
      constraint: "Equity-release timing locked",
      reason: "Delay equity release to 2028",
      strategiesEliminated: ["s-d"],
      audit: emptyAudit(),
    },
    {
      constraint: "Risk limit exceeded",
      reason: "Lower equity exposure to ≤ 65%",
      strategiesEliminated: ["s-e", "s-f"],
      audit: emptyAudit(),
    },
  ],
  bestPath: {
    strategyId: "s-rec",
    label: "Recommended",
    probabilityFireByTarget: 0.62,
    medianFireYear: todayYear + 11,
    netWorthP50: 2_900_000,
    passiveIncomeP50: 70_000,
    probabilityCashShortfall: 0.05,
    probabilityNegativeCashflow: 0.1,
    robustScore: 0.7,
    propertyCount: 2,
    requiredMonthlyContribution: 4500,
    audit: emptyAudit(),
  },
  alternativePaths: [
    {
      objective: "fastestFire",
      label: "Fastest",
      path: {
        strategyId: "s-alt-1",
        label: "Fastest",
        probabilityFireByTarget: 0.42,
        medianFireYear: todayYear + 9,
        netWorthP50: 2_500_000,
        passiveIncomeP50: 55_000,
        probabilityCashShortfall: 0.08,
        probabilityNegativeCashflow: 0.15,
        robustScore: 0.55,
        propertyCount: 2,
        requiredMonthlyContribution: 5500,
        audit: emptyAudit(),
      },
      score: 0.7,
      audit: emptyAudit(),
    },
  ],
  actionPlan: [
    asEntry('Acquire investment property #1 (strategy "Stock-Heavy")', todayYear + 2),
    asEntry("Set monthly contribution to $4,500/mo", todayYear),
    asEntry("Median net worth checkpoint: $1,500,000", todayYear + 5),
    asEntry("Projected FIRE year (median): 2042", todayYear + 11),
  ],
  auditTrail: [],
};

const top3 = selectTop3UserFacingActions(mockResult);
assert(top3.length === 3, `selectTop3UserFacingActions returns exactly 3 actions, got ${top3.length}`);
for (const a of top3) {
  assert(a.what.length > 0, `action.what populated: "${a.what}"`);
  assert(a.when.length > 0, `action.when populated: "${a.when}"`);
  assert(a.why.length > 5, `action.why is a real sentence: "${a.why}"`);
  assert(a.sourceLabel === "Goal Solver", `action.sourceLabel = "Goal Solver"`);
  const lower = a.what.toLowerCase();
  for (const banned of FORBIDDEN) {
    assert(!lower.includes(banned), `  no banned token "${banned}" in "${a.what}"`);
  }
}

assert(selectTop3UserFacingActions(null).length === 0, `null result → []`);
assert(selectTop3UserFacingActions({ ...mockResult, empty: true }).length === 0, `empty result → []`);

console.log("\n[4/4] selectRankedBlockers / selectFireGapSummary / selectDoNothingComparison");

const blockers = selectRankedBlockers(mockResult);
assert(blockers.length === 3, `3 blockers returned`);
assert(blockers[0].rank === 1, `first blocker ranked #1`);
assert(blockers[0].impactScore >= 1 && blockers[0].impactScore <= 5, `impactScore in [1,5]: got ${blockers[0].impactScore}`);
assert(blockers[0].label === "Monthly surplus too low", `top blocker label preserved`);
assert(blockers[0].expectedBenefit.length > 0, `expectedBenefit non-empty`);

const fgs = selectFireGapSummary(mockResult, { netWorthNow: 1_200_000, fireNumber: 3_000_000 });
assert(fgs.currentNetWorth === 1_200_000, `currentNetWorth wired`);
assert(fgs.targetNetWorth === 3_000_000, `targetNetWorth wired`);
assert(fgs.gap === 1_800_000, `gap = target - current`);
assert(fgs.yearsRemaining! >= 0, `yearsRemaining ≥ 0`);
assert(fgs.probability === 0.62, `probability passed through`);

const dn = selectDoNothingComparison(mockResult, { netWorthNow: 1_200_000, annualPassiveIncome: 30_000 });
assert(dn.netWorth === 1_200_000, `do-nothing NW = current net worth`);
assert(dn.passiveIncome === 30_000, `do-nothing passive income = current passive income`);
assert(dn.fireYear === todayYear + 18, `do-nothing FIRE year = worst-case`);

// Empty-result paths
const emptyFgs = selectFireGapSummary(null, null);
assert(Object.keys(emptyFgs).length === 0, `empty result + no canonical → {}`);
const emptyDn = selectDoNothingComparison(null, null);
assert(emptyDn.netWorth === undefined, `empty do-nothing has no NW`);

console.log(`\n→ ${passed} passed, ${failed} failed (of ${passed + failed} assertions)`);
if (failed > 0) process.exit(1);

function emptyAudit() {
  return {
    enginesUsed: [],
    inputsUsed: [],
    assumptionsUsed: [],
    probabilitySource: "",
    pathSource: "",
    constraintSource: "",
    confidenceSource: "",
    howCalculated: "",
  };
}
