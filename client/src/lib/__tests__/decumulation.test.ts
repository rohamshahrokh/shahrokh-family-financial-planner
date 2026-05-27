/**
 * Sprint 17 Phase 17.7 — Decumulation builder tests.
 *
 * Run: npx tsx client/src/lib/__tests__/decumulation.test.ts
 */

import { buildGlidepathShift } from "../recommendationEngine/decumulation/glidepathShift";
import { buildReduceLeverageAtTarget } from "../recommendationEngine/decumulation/reduceLeverageAtTarget";
import { buildIncreaseCashReserve } from "../recommendationEngine/decumulation/increaseCashReserve";
import { buildSwrReview } from "../recommendationEngine/decumulation/swrReview";
import { buildIncomeProtection } from "../recommendationEngine/decumulation/incomeProtection";
import { buildUnreachableHonesty } from "../recommendationEngine/decumulation/unreachableHonesty";
import { buildRecommendationContext } from "../recommendationContext/buildContext";
import type { UnifiedSignals } from "../recommendationEngine/types";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

function signalsWithStage(stage: any, extra: Partial<UnifiedSignals> = {}): UnifiedSignals {
  return {
    lifeStage: stage,
    ...extra,
  };
}

// glidepathShift: fires only in STATE_C/D/E
{
  const a = buildGlidepathShift(signalsWithStage("STATE_A_ACCUMULATION"), []);
  const c = buildGlidepathShift(signalsWithStage("STATE_C_NEAR_FIRE"), []);
  const e = buildGlidepathShift(signalsWithStage("STATE_E_DECUMULATION"), []);
  assert(a === null, "glidepath: STATE_A → null");
  assert(c != null, "glidepath: STATE_C → built");
  assert(e != null, "glidepath: STATE_E → built");
  assert(c!.pillar === "decumulate_safely", "glidepath uses decumulate_safely pillar");
}

// reduceLeverageAtTarget: requires STATE_D/E AND mortgage>0
{
  const noMortgage = buildReduceLeverageAtTarget(signalsWithStage("STATE_D_FIRE_ACHIEVED", { mortgage: 0 }), []);
  const withMortgage = buildReduceLeverageAtTarget(signalsWithStage("STATE_D_FIRE_ACHIEVED", { mortgage: 400_000, mortgageRate: 0.058 }), []);
  assert(noMortgage === null, "reduce_leverage_at_target: no mortgage → null");
  assert(withMortgage != null, "reduce_leverage_at_target: with mortgage → built");
}

// increaseCashReserve: requires STATE_D/E AND cash < 24 months
{
  const enoughCash = buildIncreaseCashReserve(signalsWithStage("STATE_E_DECUMULATION", {
    cashOutsideOffset: 200_000, monthlyExpenses: 5_000,
  }), []);
  const lowCash = buildIncreaseCashReserve(signalsWithStage("STATE_E_DECUMULATION", {
    cashOutsideOffset: 30_000, monthlyExpenses: 5_000,
  }), []);
  assert(enoughCash === null, "increase_cash_reserve: 40 months → null");
  assert(lowCash != null, "increase_cash_reserve: 6 months → built");
}

// swrReview: fires in C/D/E
{
  const rec = buildSwrReview(signalsWithStage("STATE_D_FIRE_ACHIEVED"), []);
  assert(rec != null, "swr_review: STATE_D → built");
  assert(rec!.pillar === "decumulate_safely", "swr_review uses decumulate_safely");
}

// incomeProtection: requires single-income with dependents
{
  const noHP = buildIncomeProtection({} as any, []);
  assert(noHP === null, "income_protection: no household profile → null");

  // Use a real RecommendationContext
  const inputs = {
    snapshot: {
      cash: 50_000,
      monthly_income: 8_000,
      monthly_expenses: 6_000,
      current_age: 36,
      roham_gross_annual: 96_000,
      fara_gross_annual: 0,
      num_dependents: 2,
    },
  };
  const ctx = buildRecommendationContext(inputs as any, null);
  const signals: UnifiedSignals = { recommendationContext: ctx } as any;
  const rec = buildIncomeProtection(signals, []);
  assert(rec != null, "income_protection: single-income + dependents → built");
}

// unreachableHonesty: fires only for feasibility=UNREACHABLE, pillar prevent_failure
{
  const noFeasibility = buildUnreachableHonesty({ feasibility: "TIGHT" } as any, []);
  assert(noFeasibility === null, "unreachable_plan_review: TIGHT → null");
  const rec = buildUnreachableHonesty({ feasibility: "UNREACHABLE" } as any, []);
  assert(rec != null, "unreachable_plan_review: UNREACHABLE → built");
  assert(rec!.pillar === "prevent_failure", "unreachable uses prevent_failure pillar (fills empty top tier)");
  assert(rec!.urgency === "immediate", "unreachable is immediate");
}

console.log(process.exitCode ? "FAILED" : "PASSED");
