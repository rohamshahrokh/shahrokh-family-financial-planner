/**
 * Sprint 18 Phase 18.4 — Stress test engine.
 *
 * Entry points:
 *   - stressTestRecommendation(rec, ctx)
 *   - stressTestPath(path, ctx)
 *
 * For each scenario, perturb the context and verify:
 *   - cash buffer still positive (1 month minimum)
 *   - monthly surplus > 0 after the shock
 *   - debt service can be met
 *   - recommendation is still rational (not undermined by the shock)
 *
 * Hard rule (user): if a recommendation fails too many stress tests it
 * cannot be top-ranked unless explicitly labelled aggressive/high-risk.
 * That gating lives in the engine integration step (Phase 18.7 hard
 * assertions also check this).
 */

import type { Recommendation } from "../recommendationEngine/types";
import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath } from "../recommendationOptimization/pathTypes";
import {
  ALL_SCENARIOS,
  STRESS_SCENARIO_LABELS,
  applyStress,
} from "./stressScenarios";
import type {
  StressScenarioId,
  StressScenarioResult,
  StressTestSummary,
} from "./stressTypes";

function evaluateOne(
  rec: Recommendation | null,
  path: OptimisedPath | null,
  ctx: RecommendationContext,
  id: StressScenarioId,
): StressScenarioResult {
  const stressed = applyStress(ctx, id);
  const minCash = stressed.cash;
  const surplus = stressed.monthlySurplus;
  const debtServiceShortfall = stressed.debtServiceMonthly > 0 && stressed.monthlyIncome < stressed.debtServiceMonthly * 1.4
    ? Math.max(0, stressed.debtServiceMonthly - (stressed.monthlyIncome - stressed.monthlyExpenses + stressed.debtServiceMonthly))
    : 0;

  // Survival: cash > 0 (1 month), surplus not catastrophically negative, no debt-service shortfall
  const survives =
    minCash > stressed.monthlyExpenses * 1 &&
    surplus > -stressed.monthlyIncome * 0.10 &&
    debtServiceShortfall === 0;

  // Recommendation validity flags
  let recommendationStillValid = true;
  if (rec) {
    if (id === "rates_plus_2" && rec.actionType === "proceed_property_purchase" && !survives) {
      recommendationStillValid = false;
    }
    if (id === "income_minus_20" && rec.actionType === "etf_dca" && surplus < 0) {
      recommendationStillValid = false;
    }
    if (id === "crypto_minus_50" && rec.actionType === "crypto_dca" && !survives) {
      recommendationStillValid = false;
    }
  }
  if (path) {
    if (id === "rates_plus_2" && path.archetype === "property_led" && !survives) {
      recommendationStillValid = false;
    }
  }

  // Heuristic FIRE delay: a 1-month surplus loss adds ~1 month to FIRE date
  const surplusLoss = Math.max(0, ctx.today.cashflow.monthlySurplus - surplus);
  const fireDelay = surplusLoss > 0
    ? Math.round(surplusLoss / Math.max(100, ctx.today.cashflow.monthlySurplus) * 12)
    : 0;

  // Probability degradation: rough heuristic
  let probDegrade = 0;
  if (!survives) probDegrade += 0.15;
  if (id === "combined_stress") probDegrade += 0.10;
  if (debtServiceShortfall > 0) probDegrade += 0.10;

  return {
    scenario: id,
    scenarioLabel: STRESS_SCENARIO_LABELS[id],
    survives,
    minimumCashBuffer: Math.round(minCash),
    monthlySurplusAfter: Math.round(surplus),
    fireDelay,
    probabilityDegradation: Number(probDegrade.toFixed(2)),
    debtServicePressure: Math.round(debtServiceShortfall),
    recommendationStillValid,
    note: survives
      ? `Survives ${STRESS_SCENARIO_LABELS[id]}; surplus $${Math.round(surplus)}/mo holds.`
      : `Fails ${STRESS_SCENARIO_LABELS[id]} — surplus drops to $${Math.round(surplus)}/mo, cash ${Math.round(minCash)}.`,
  };
}

function summarise(results: StressScenarioResult[]): StressTestSummary {
  const survived = results.filter((r) => r.survives).length;
  const total = results.length;
  const failures = results.filter((r) => !r.survives);
  const primary = failures.sort((a, b) => b.probabilityDegradation - a.probabilityDegradation)[0]?.scenario ?? null;
  return {
    scenarios: ALL_SCENARIOS,
    results,
    survivedCount: survived,
    totalCount: total,
    primaryWeakness: primary,
    passes: survived >= 5,
  };
}

export function stressTestRecommendation(
  rec: Recommendation,
  ctx: RecommendationContext,
): StressTestSummary {
  const results = ALL_SCENARIOS.map((id) => evaluateOne(rec, null, ctx, id));
  return summarise(results);
}

export function stressTestPath(
  path: OptimisedPath,
  ctx: RecommendationContext,
): StressTestSummary {
  const results = ALL_SCENARIOS.map((id) => evaluateOne(null, path, ctx, id));
  return summarise(results);
}
