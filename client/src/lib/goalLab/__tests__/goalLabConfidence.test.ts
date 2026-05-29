/**
 * goalLabConfidence.test.ts — Sprint 26 P1
 *
 * Pure unit tests for the confidence scorer. No tsx/test runner used — the
 * file follows the same self-contained pattern as goalLabValidation.test.ts
 * so it can be run via `npx tsx <path>`.
 */

import {
  computeGoalLabConfidence,
  bandFromScore,
  CONFIDENCE_WEIGHTS,
  type ConfidenceInputs,
} from "../goalLabConfidence";
import type { CanonicalGoal } from "../../useCanonicalGoal";
import type { GoalLabPlanOutput } from "../orchestrator";

let passed = 0;
let failed = 0;
function expect(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
    failed++;
  }
}

const setGoal: CanonicalGoal = {
  status: "SET",
  targetFireAge: 50,
  targetPassiveMonthly: 8000,
  swrPct: 4,
  targetPassiveAnnual: 96000,
  targetNetWorth: 2400000,
  goalSetTimestamp: new Date().toISOString(),
  source: "mc_fire_settings",
};

const notSetGoal: CanonicalGoal = { status: "NOT_SET", reason: "test" };

const fakePlan = (opts: {
  templates: number;
  hasRec: boolean;
  score?: number | null;
  p50?: number | null;
}): GoalLabPlanOutput => ({
  generatedAt: new Date().toISOString(),
  inputsHash: "hash",
  templatesEvaluatedIds: Array.from({ length: opts.templates }, (_, i) => `t${i}` as any),
  rankedScenarios: Array.from({ length: opts.templates }, (_, i) => ({
    templateId: `t${i}`,
    templateLabel: `Test path ${i}`,
    promise: "test",
    scoreP50: opts.score ?? null,
    probabilityP50: opts.p50 ?? null,
  } as any)),
  picks: {
    recommended: opts.hasRec
      ? ({
          templateId: "t0",
          templateLabel: "Test path",
          promise: "test",
          scoreP50: opts.score ?? null,
          probabilityP50: opts.p50 ?? null,
        } as any)
      : null,
    safest: null, fastest: null, highestProbability: null,
    bestCashflow: null, bestHybrid: null, recommendedRationale: null,
  } as any,
  enginesUsed: {
    candidateGenerator: "test",
    scenarioRunner: "test",
    monteCarlo: "test",
    canonicalAdapter: "test",
  } as any,
  metrics: {
    totalMs: 100,
    candidateGenerationMs: 80,
    scenarioAndMonteCarloMs: 80,
    rankingMs: 1,
    templatesCount: opts.templates,
  } as any,
});

const baseInput = (over: Partial<ConfidenceInputs> = {}): ConfidenceInputs => ({
  goal: setGoal,
  hasLedger: true,
  netWorth: 500000,
  monthlySurplus: 4000,
  confirmed: { Q1: true, Q2: true, Q3: true, Q4: true, Q5: true, Q6: true },
  plan: fakePlan({ templates: 7, hasRec: true, score: 72, p50: 0.83 }),
  ...over,
});

console.log("── 1. Band thresholds ──");
expect("80 → High", bandFromScore(80) === "High");
expect("79 → Medium", bandFromScore(79) === "Medium");
expect("60 → Medium", bandFromScore(60) === "Medium");
expect("59 → Low", bandFromScore(59) === "Low");
expect("0 → Low", bandFromScore(0) === "Low");

console.log("── 2. Weights sum to 100 ──");
const weightSum = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
expect("weights sum = 100", weightSum === 100, `got ${weightSum}`);

console.log("── 3. Perfect inputs → High ──");
const perfect = computeGoalLabConfidence(baseInput());
expect("perfect score == 100", perfect.score === 100, `got ${perfect.score}`);
expect("perfect band == High", perfect.band === "High");
expect("perfect: all signals ok", perfect.okSignals.length === 6);
expect("perfect: no failing", perfect.failingSignals.length === 0);

console.log("── 4. No goal → goal-profile fails ──");
const noGoal = computeGoalLabConfidence(baseInput({ goal: notSetGoal }));
expect("score drops by goalProfile weight",
  noGoal.score === 100 - CONFIDENCE_WEIGHTS.goalProfile,
  `got ${noGoal.score}`);
expect("goal-profile signal not ok",
  noGoal.signals.find((s) => s.id === "goal-profile")?.ok === false);

console.log("── 5. No plan → scenario+rec+prob all fail ──");
const noPlan = computeGoalLabConfidence(baseInput({ plan: null }));
const expectedNoPlan =
  100 - CONFIDENCE_WEIGHTS.scenarioCoverage
      - CONFIDENCE_WEIGHTS.recommendation
      - CONFIDENCE_WEIGHTS.probability;
expect("score drops by all three engine signals",
  noPlan.score === expectedNoPlan,
  `expected ${expectedNoPlan} got ${noPlan.score}`);
expect("no plan → Low or Medium", noPlan.band !== "High");

console.log("── 6. P50 null → probability fails but rec passes ──");
const nullP50 = computeGoalLabConfidence(baseInput({
  plan: fakePlan({ templates: 7, hasRec: true, score: 60, p50: null }),
}));
expect("probability signal not ok",
  nullP50.signals.find((s) => s.id === "probability")?.ok === false);
expect("recommendation still ok",
  nullP50.signals.find((s) => s.id === "recommendation")?.ok === true);
expect("score = 100 - probabilityWeight",
  nullP50.score === 100 - CONFIDENCE_WEIGHTS.probability,
  `got ${nullP50.score}`);

console.log("── 7. Honesty — never fabricates probability ──");
const noP50 = computeGoalLabConfidence(baseInput({
  plan: fakePlan({ templates: 5, hasRec: true, score: 50, p50: null }),
}));
const probSignal = noP50.signals.find((s) => s.id === "probability");
expect("probability label says 'unavailable'",
  probSignal?.label === "Probability unavailable",
  `got ${probSignal?.label}`);
expect("probability detail does NOT contain '%' (no fake number)",
  !(probSignal?.detail ?? "").includes("%"),
  `got "${probSignal?.detail}"`);

console.log("── 8. Partial card confirmations linear-scale ──");
const halfCards = computeGoalLabConfidence(baseInput({
  confirmed: { Q1: true, Q2: true, Q3: true, Q4: true, Q5: false, Q6: false },
}));
// 2/4 optional cards confirmed → 50% of data weight = 7.5 → round = 8.
const dataSig = halfCards.signals.find((s) => s.id === "data-completeness")!;
expect("data signal contribution ≈ 50% of weight",
  Math.abs(dataSig.contribution - CONFIDENCE_WEIGHTS.dataCompleteness * 0.5) <= 1,
  `got contribution ${dataSig.contribution}`);
expect("data signal ok=false (need ≥3 of 4)",
  dataSig.ok === false);

console.log("── 9. Ledger missing → fails ──");
const noLedger = computeGoalLabConfidence(baseInput({
  hasLedger: false, netWorth: null, monthlySurplus: null,
}));
expect("ledger signal not ok",
  noLedger.signals.find((s) => s.id === "ledger")?.ok === false);
expect("ledger detail mentions snapshot not loaded",
  noLedger.signals.find((s) => s.id === "ledger")?.detail.toLowerCase().includes("snapshot not loaded"));

console.log("── 10. Worst case → Low band ──");
const worst = computeGoalLabConfidence({
  goal: notSetGoal,
  hasLedger: false,
  netWorth: null,
  monthlySurplus: null,
  confirmed: {},
  plan: null,
});
expect("worst score == 0", worst.score === 0, `got ${worst.score}`);
expect("worst band == Low", worst.band === "Low");

console.log("\n── Summary ──");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
