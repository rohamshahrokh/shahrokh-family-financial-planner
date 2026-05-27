/**
 * Sprint 17 Phase 17.2 — HouseholdLifeStage classifier tests.
 *
 * Run: npx tsx client/src/lib/__tests__/householdLifeStage.test.ts
 */

import { classifyHouseholdLifeStage } from "../householdState/classifier";
import { buildRecommendationContext } from "../recommendationContext/buildContext";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

function makeCtx(opts: { age: number; netWorth: number; targetFireAge: number; targetPassiveMonthly: number; swrPct?: number; monthlySurplus?: number; retired?: boolean }) {
  const inputs = {
    snapshot: {
      cash: opts.netWorth,
      monthly_income: 6000 + (opts.monthlySurplus ?? 0),
      monthly_expenses: 6000,
      current_age: opts.age,
      retired: opts.retired === true,
    },
  };
  const goal = {
    status: "SET",
    targetFireAge: opts.targetFireAge,
    targetPassiveMonthly: opts.targetPassiveMonthly,
    swrPct: opts.swrPct ?? 0.04,
    targetPassiveAnnual: opts.targetPassiveMonthly * 12,
    targetNetWorth: (opts.targetPassiveMonthly * 12) / (opts.swrPct ?? 0.04),
    goalSetTimestamp: "2026-01-01",
    source: "mc_fire_settings",
  };
  return buildRecommendationContext(inputs as any, goal as any);
}

// STATE_A: low progress
{
  const ctx = makeCtx({ age: 30, netWorth: 100_000, targetFireAge: 55, targetPassiveMonthly: 8_000 });
  const cls = classifyHouseholdLifeStage(ctx);
  assert(cls.primary === "STATE_A_ACCUMULATION", "low-progress → STATE_A");
}

// STATE_B: 50-85%
{
  const ctx = makeCtx({ age: 45, netWorth: 1_200_000, targetFireAge: 55, targetPassiveMonthly: 8_000 });
  const cls = classifyHouseholdLifeStage(ctx);
  assert(cls.primary === "STATE_B_ACCELERATING" || cls.primary === "STATE_C_NEAR_FIRE",
    `mid-progress → STATE_B or C (got ${cls.primary})`);
}

// STATE_C: 85-100%
{
  const ctx = makeCtx({ age: 50, netWorth: 2_100_000, targetFireAge: 55, targetPassiveMonthly: 8_000 });
  const cls = classifyHouseholdLifeStage(ctx);
  assert(cls.primary === "STATE_C_NEAR_FIRE" || cls.primary === "STATE_D_FIRE_ACHIEVED",
    `near-fire → STATE_C or D (got ${cls.primary})`);
}

// STATE_E: age ≥ target
{
  const ctx = makeCtx({ age: 67, netWorth: 1_500_000, targetFireAge: 65, targetPassiveMonthly: 5_000 });
  const cls = classifyHouseholdLifeStage(ctx);
  assert(cls.primary === "STATE_E_DECUMULATION", "age >= target → STATE_E");
}

// STATE_E via retired flag even when young
{
  const ctx = makeCtx({ age: 50, netWorth: 2_000_000, targetFireAge: 65, targetPassiveMonthly: 5_000, retired: true });
  const cls = classifyHouseholdLifeStage(ctx);
  assert(cls.primary === "STATE_E_DECUMULATION", "retired flag → STATE_E");
}

// Reasons array populated for every classification
{
  const ctx = makeCtx({ age: 30, netWorth: 50_000, targetFireAge: 55, targetPassiveMonthly: 8_000 });
  const cls = classifyHouseholdLifeStage(ctx);
  assert(Array.isArray(cls.reasons) && cls.reasons.length >= 2, "reasons array length >= 2");
}

console.log(process.exitCode ? "FAILED" : "PASSED");
