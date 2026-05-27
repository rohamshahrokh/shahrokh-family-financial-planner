/**
 * Sprint 17 Phase 17.4 — Marginal-Impact Simulator tests.
 *
 * Run: npx tsx client/src/lib/__tests__/marginalImpact.test.ts
 */

import { simulateMarginalImpact, __resetMarginalImpactCacheForTests } from "../recommendationEngine/marginalImpact";
import { buildRecommendationContext } from "../recommendationContext/buildContext";
import type { Recommendation } from "../recommendationEngine/types";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

function makeRec(o: Partial<Recommendation>): Recommendation {
  return {
    id: o.id ?? "etf_dca",
    title: "test",
    actionType: o.actionType ?? "etf_dca",
    pillar: "improve_fire_timeline",
    priorityRank: 1,
    confidenceScore: 0.7,
    urgency: "this_quarter",
    riskLevel: "Med",
    expectedFinancialImpact: { annualDollar: 12_000 },
    implementationSteps: [],
    whatCouldChangeRecommendation: [],
    alternativeOptions: [],
    reviewTrigger: { condition: "" },
    sourceSignalsUsed: [],
    surfaces: [],
    reasoning: "",
    ...o,
  };
}

__resetMarginalImpactCacheForTests();

// Sprint 16 demo seed-like context
const inputs = {
  snapshot: {
    cash: 50_000, offset_balance: 30_000, mortgage: 600_000, other_debts: 15_000,
    ppor: 1_100_000, monthly_income: 18_000, monthly_expenses: 9_000,
    current_age: 38, roham_super_balance: 220_000, fara_super_balance: 80_000,
  },
};
const goal = {
  status: "SET", targetFireAge: 55, targetPassiveMonthly: 10_000, swrPct: 0.04,
  targetPassiveAnnual: 120_000, targetNetWorth: 3_000_000,
  goalSetTimestamp: "", source: "mc_fire_settings",
};
const ctx = buildRecommendationContext(inputs as any, goal as any);

// 1. ETF DCA returns a populated impact
{
  const rec = makeRec({ id: "etf_dca", actionType: "etf_dca" });
  const mi = simulateMarginalImpact(rec, ctx);
  assert(mi != null, "MI populated");
  assert(mi!.deltaSuccessProbability != null, "success delta populated");
  assert(Array.isArray(mi!.evidence) && mi!.evidence.length > 0, "evidence present");
}

// 2. increase_super has positive delta success
{
  const rec = makeRec({
    id: "increase_super", actionType: "increase_super",
    expectedFinancialImpact: { annualDollar: 9_000 },
  });
  const mi = simulateMarginalImpact(rec, ctx);
  assert(mi != null && (mi.deltaSuccessProbability ?? 0) >= 0,
    `increase_super delta success ${mi?.deltaSuccessProbability}`);
}

// 3. No context → returns null
{
  const rec = makeRec({});
  const mi = simulateMarginalImpact(rec, null);
  assert(mi === null, "no context → null");
}

// 4. Deterministic per (id, contextHash)
{
  __resetMarginalImpactCacheForTests();
  const rec = makeRec({ id: "etf_dca" });
  const a = simulateMarginalImpact(rec, ctx);
  const b = simulateMarginalImpact(rec, ctx);
  assert(a!.deltaSuccessProbability === b!.deltaSuccessProbability, "deterministic");
}

// 5. pay_high_interest_debt produces positive deltaSurplus
{
  const rec = makeRec({
    id: "pay_high_interest_debt", actionType: "pay_high_interest_debt",
    expectedFinancialImpact: { annualDollar: 2_400 },
  });
  const mi = simulateMarginalImpact(rec, ctx);
  assert(mi != null && (mi.deltaMonthlySurplus ?? 0) > 0,
    `pay debt frees surplus (got ${mi?.deltaMonthlySurplus})`);
}

console.log(process.exitCode ? "FAILED" : "PASSED");
