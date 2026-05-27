/**
 * Sprint 17 Phase 17.0 — RecommendationContext tests.
 *
 * Run: npx tsx client/src/lib/__tests__/recommendationContext.test.ts
 */

import { buildRecommendationContext } from "../recommendationContext/buildContext";

function assert(cond: any, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok  - ${msg}`);
  }
}

// Test 1: Empty inputs → context still populates without throwing
{
  const ctx = buildRecommendationContext(null, null);
  assert(ctx.today != null, "today slice populated for null inputs");
  assert(ctx.plan != null, "plan slice populated for null inputs");
  assert(ctx.forecast != null, "forecast slice populated for null inputs");
  assert(ctx.forecast.feasibility === "UNREACHABLE", "no goal → UNREACHABLE");
}

// Test 2: Realistic demo seed (Sprint 16 #1)
{
  const inputs = {
    snapshot: {
      cash: 50_000,
      offset_balance: 30_000,
      mortgage: 600_000,
      other_debts: 15_000,
      ppor: 1_100_000,
      monthly_income: 18_000,
      monthly_expenses: 9_000,
      current_age: 38,
      roham_super_balance: 220_000,
      fara_super_balance: 80_000,
    },
    properties: undefined,
    stocks: undefined,
    cryptos: undefined,
    holdingsRaw: undefined,
    incomeRecords: undefined,
    expenses: undefined,
  };
  const goal = {
    status: "SET",
    targetFireAge: 55,
    targetPassiveMonthly: 10_000,
    swrPct: 0.04,
    targetPassiveAnnual: 120_000,
    targetNetWorth: 3_000_000,
    goalSetTimestamp: "2026-01-01",
    source: "mc_fire_settings",
  };
  const ctx = buildRecommendationContext(inputs, goal);
  assert(ctx.today.age === 38, "age extracted from snapshot");
  assert(ctx.today.cashflow.monthlyIncome === 18_000, "monthly income from snapshot");
  assert(ctx.today.cashflow.monthlySurplus === 9_000, "surplus computed");
  assert(ctx.plan.targetFireAge === 55, "target fire age extracted");
  assert(ctx.plan.swrPct === 0.04, "swr% preserved");
  assert(ctx.forecast.netWorthPath.length > 0, "forecast produces path");
  assert(typeof ctx.forecast.fireSuccessProbabilityBaseline === "number",
    "success prob is a number");
  assert(["ACHIEVABLE", "TIGHT", "UNREACHABLE"].includes(ctx.forecast.feasibility),
    "feasibility verdict in expected enum");
  assert(ctx.lifeStage != null, "lifeStage populated");
}

// Test 3: Scenario 14 (target unreachable) — should classify UNREACHABLE
{
  const inputs = {
    snapshot: {
      cash: 5_000,
      offset_balance: 0,
      mortgage: 0,
      other_debts: 0,
      monthly_income: 3_500,
      monthly_expenses: 3_400,
      current_age: 60,
    },
    properties: undefined, stocks: undefined, cryptos: undefined,
    holdingsRaw: undefined, incomeRecords: undefined, expenses: undefined,
  };
  const goal = {
    status: "SET", targetFireAge: 65, targetPassiveMonthly: 8_000,
    swrPct: 0.04, targetPassiveAnnual: 96_000, targetNetWorth: 2_400_000,
    goalSetTimestamp: "2026-01-01", source: "mc_fire_settings",
  };
  const ctx = buildRecommendationContext(inputs, goal);
  assert(ctx.forecast.feasibility === "UNREACHABLE",
    "scenario 14 marked UNREACHABLE");
  assert(typeof ctx.forecast.unreachableReason === "string",
    "unreachableReason populated");
}

// Test 4: Determinism — same inputs produce same hash
{
  const inputs = { snapshot: { cash: 1000, monthly_income: 2000, monthly_expenses: 1000, current_age: 30 } };
  const goal = { status: "SET", targetFireAge: 60, targetPassiveMonthly: 5000, swrPct: 0.04 };
  const a = buildRecommendationContext(inputs as any, goal as any);
  const b = buildRecommendationContext(inputs as any, goal as any);
  assert(a.meta.contextHash === b.meta.contextHash, "stable contextHash");
  assert(a.forecast.fireSuccessProbabilityBaseline === b.forecast.fireSuccessProbabilityBaseline,
    "deterministic success probability");
}

console.log(process.exitCode ? "FAILED" : "PASSED");
