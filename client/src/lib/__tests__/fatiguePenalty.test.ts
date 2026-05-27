/**
 * Sprint 17 Phase 17.3 — Fatigue + state gating tests.
 *
 * Run: npx tsx client/src/lib/__tests__/fatiguePenalty.test.ts
 */

import {
  computeFatiguePenalty,
  applyFatiguePenalty,
  recordTopRecommendation,
  __resetFatigueHistoryForTests,
  readFatigueHistory,
} from "../recommendationEngine/fatiguePenalty";
import { isApplicableInState } from "../recommendationEngine/rules/registry";
import type { Recommendation } from "../recommendationEngine/types";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

function makeRec(id: string, pillar: any = "improve_fire_timeline"): Recommendation {
  return {
    id,
    title: id,
    actionType: id as any,
    pillar,
    priorityRank: 1,
    confidenceScore: 0.7,
    urgency: "this_quarter",
    riskLevel: "Med",
    expectedFinancialImpact: { annualDollar: 1000 },
    implementationSteps: [],
    whatCouldChangeRecommendation: [],
    alternativeOptions: [],
    reviewTrigger: { condition: "" },
    sourceSignalsUsed: [],
    surfaces: [],
    reasoning: "",
  };
}

__resetFatigueHistoryForTests();

// 1. No history → multiplier 1
{
  const rec = makeRec("etf_dca");
  const f = computeFatiguePenalty(rec);
  assert(f.multiplier === 1, "empty history → multiplier 1");
}

// 2. After 3 wins of same id, multiplier drops
{
  const rec = makeRec("etf_dca");
  recordTopRecommendation(rec);
  recordTopRecommendation(rec);
  recordTopRecommendation(rec);
  const f = computeFatiguePenalty(rec);
  assert(f.multiplier < 1 && f.multiplier >= 0.5,
    `3 wins → multiplier ${f.multiplier} in [0.5,1)`);
}

// 3. Floor at 0.5
{
  __resetFatigueHistoryForTests();
  const rec = makeRec("etf_dca");
  for (let i = 0; i < 20; i++) recordTopRecommendation(rec);
  const f = computeFatiguePenalty(rec);
  assert(f.multiplier === 0.5, `20 wins → multiplier floored at 0.5 (got ${f.multiplier})`);
}

// 4. Applied to base score
{
  __resetFatigueHistoryForTests();
  const rec = makeRec("etf_dca");
  recordTopRecommendation(rec);
  recordTopRecommendation(rec);
  recordTopRecommendation(rec);
  const r = applyFatiguePenalty(80, rec);
  assert(r.score < 80, `80 * mult → ${r.score} (must be < 80)`);
}

// 5. State gating — increase_super not applicable in STATE_C
{
  const applicable = isApplicableInState("increase_super", "STATE_C_NEAR_FIRE");
  assert(applicable === false, "increase_super not applicable in STATE_C_NEAR_FIRE");
}

// 6. State gating — etf_dca IS applicable in STATE_A
{
  const applicable = isApplicableInState("etf_dca", "STATE_A_ACCUMULATION");
  assert(applicable === true, "etf_dca applicable in STATE_A_ACCUMULATION");
}

// 7. reduce_leverage suppressed in absence of debt (via notSuitableIf in test 8 — here just sanity)
{
  __resetFatigueHistoryForTests();
  const hist = readFatigueHistory();
  assert(hist.length === 0, "reset clears history");
}

console.log(process.exitCode ? "FAILED" : "PASSED");
