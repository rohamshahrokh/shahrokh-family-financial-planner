/**
 * Sprint 18 Phase 18.3 — Behavioural risk evaluation.
 *
 * Entry points:
 *   - evaluateRecommendationBehaviour(rec, ctx)
 *   - evaluatePathBehaviouralFit(path, ctx)
 *
 * Output is attached as Recommendation.behaviouralRisk (additive) and
 * OptimisedPath.scoreComponents.behaviouralFitScore + behaviouralNote.
 */

import type { Recommendation } from "../recommendationEngine/types";
import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath } from "../recommendationOptimization/pathTypes";
import type {
  BehaviouralRisk,
  BehaviouralWarning,
  ExecutionDifficulty,
} from "./behaviouralTypes";
import { deriveInvestorProfile } from "./investorProfile";
import { scorePlanComplexity } from "./planComplexity";
import { computeBehaviouralFit } from "./executionFit";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function pushWarning(arr: BehaviouralWarning[], w: BehaviouralWarning) {
  arr.push(w);
}

function evaluateLeverageStress(
  warnings: BehaviouralWarning[],
  ctx: RecommendationContext,
) {
  const debt = ctx.today.netWorth.debt;
  const total = ctx.today.netWorth.total;
  const debtRatio = total > 0 ? debt / Math.max(1, total + debt) : 0;
  if (debtRatio > 0.55) {
    pushWarning(warnings, {
      kind: "high_leverage_stress",
      severity: "warning",
      message: `Debt is ${(debtRatio * 100).toFixed(0)}% of gross balance sheet — high-leverage actions add real risk.`,
    });
  }
}

function evaluateCashAnxiety(warnings: BehaviouralWarning[], ctx: RecommendationContext) {
  const cashRunway = ctx.today.cashflow.monthlyExpenses > 0
    ? ctx.today.netWorth.cash / ctx.today.cashflow.monthlyExpenses
    : Infinity;
  if (cashRunway < 2) {
    pushWarning(warnings, {
      kind: "cash_anxiety",
      severity: "warning",
      message: `Cash runway < 2 months — many households will hesitate or reverse investment decisions under that pressure.`,
    });
  }
}

function evaluateCryptoOverconfidence(warnings: BehaviouralWarning[], ctx: RecommendationContext) {
  const cryptoPct = ctx.today.netWorth.total > 0
    ? ctx.today.netWorth.crypto / ctx.today.netWorth.total
    : 0;
  if (cryptoPct > 0.30) {
    pushWarning(warnings, {
      kind: "crypto_overconfidence",
      severity: "warning",
      message: `Crypto concentration at ${(cryptoPct * 100).toFixed(0)}% — research shows households over-extrapolate recent gains and resist trimming.`,
    });
  }
}

function evaluatePropertyOverconfidence(warnings: BehaviouralWarning[], ctx: RecommendationContext) {
  const propertyPct = ctx.today.netWorth.total > 0
    ? ctx.today.netWorth.propertyEquity / ctx.today.netWorth.total
    : 0;
  if (propertyPct > 0.75) {
    pushWarning(warnings, {
      kind: "property_overconfidence",
      severity: "warning",
      message: `Property is ${(propertyPct * 100).toFixed(0)}% of net worth — anchoring bias makes diversification feel unsafe even when it's not.`,
    });
  }
}

function evaluateSurplusDiscipline(warnings: BehaviouralWarning[], ctx: RecommendationContext) {
  const surplusPct = ctx.today.cashflow.monthlyIncome > 0
    ? ctx.today.cashflow.monthlySurplus / ctx.today.cashflow.monthlyIncome
    : 0;
  if (surplusPct < 0.10) {
    pushWarning(warnings, {
      kind: "low_surplus_discipline",
      severity: "warning",
      message: `Monthly surplus < 10% of income — limited room for lifestyle creep before plans slip.`,
    });
  }
}

function evaluateFamilyStagePressure(warnings: BehaviouralWarning[], ctx: RecommendationContext) {
  if (ctx.today.householdProfile.hasDependents && ctx.today.householdProfile.singleIncome) {
    pushWarning(warnings, {
      kind: "family_stage_pressure",
      severity: "info",
      message: "Single-income family — recommendations should prioritise insurance + liquidity before growth bets.",
    });
  }
}

function evaluateRiskMismatch(
  warnings: BehaviouralWarning[],
  ctx: RecommendationContext,
  path: OptimisedPath | null,
) {
  const profile = deriveInvestorProfile(ctx);
  if (path && path.archetype === "property_led" && profile.liquidityPreference > 0.7) {
    pushWarning(warnings, {
      kind: "risk_tolerance_mismatch",
      severity: "info",
      message: "Household profile reads liquidity-anxious — property concentration may feel uncomfortable in practice.",
    });
  }
}

function executionNote(
  path: OptimisedPath | null,
  difficulty: ExecutionDifficulty,
  warnings: BehaviouralWarning[],
): string {
  if (!path) return "Single-step recommendation — execution is straightforward.";
  if (difficulty === "low") {
    return `Low-friction plan: ${path.steps.length} step${path.steps.length > 1 ? "s" : ""} over ~${path.steps[path.steps.length - 1]?.estimatedMonthsFromStart ?? 12} months. Easy to execute, low likelihood of fatigue.`;
  }
  if (difficulty === "high") {
    return `This path is financially attractive but behaviourally demanding because it spans ${new Set(path.steps.map((s) => s.pillar)).size} pillars and ${path.steps.length} steps. Slower but easier paths are often more likely to be followed through.`;
  }
  if (warnings.some((w) => w.severity === "warning")) {
    return `Medium-difficulty plan with behavioural friction points (${warnings.filter((w) => w.severity === "warning").length}). Plan adherence depends on guarding against ${warnings[0]?.kind.replace(/_/g, " ")}.`;
  }
  return `Medium-difficulty plan — manageable with quarterly check-ins.`;
}

export function evaluateRecommendationBehaviour(
  rec: Recommendation,
  ctx: RecommendationContext,
): BehaviouralRisk {
  const warnings: BehaviouralWarning[] = [];
  evaluateLeverageStress(warnings, ctx);
  evaluateCashAnxiety(warnings, ctx);
  evaluateCryptoOverconfidence(warnings, ctx);
  evaluatePropertyOverconfidence(warnings, ctx);
  evaluateSurplusDiscipline(warnings, ctx);
  evaluateFamilyStagePressure(warnings, ctx);

  // Map action types to difficulty
  let executionDifficulty: ExecutionDifficulty;
  switch (rec.actionType) {
    case "proceed_property_purchase":
    case "delay_property_purchase":
    case "refinance_restructure":
      executionDifficulty = "high";
      break;
    case "rebalance_concentration":
    case "glidepath_shift":
    case "swr_review":
      executionDifficulty = "medium";
      break;
    default:
      executionDifficulty = "low";
  }

  const baseAdherence = executionDifficulty === "low" ? 0.85 : executionDifficulty === "medium" ? 0.65 : 0.45;
  const warningPenalty = warnings.filter((w) => w.severity === "warning").length * 0.05;
  const likelyAdherence = clamp01(baseAdherence - warningPenalty);

  // Behavioural fit is the inverse of execution difficulty + warning load
  const behaviouralFitScore = clamp01(0.85 - (executionDifficulty === "high" ? 0.35 : executionDifficulty === "medium" ? 0.20 : 0.05) - warningPenalty);

  return {
    behaviouralFitScore: Number(behaviouralFitScore.toFixed(2)),
    executionDifficulty,
    likelyAdherence: Number(likelyAdherence.toFixed(2)),
    behaviourWarnings: warnings,
    note: executionNote(null, executionDifficulty, warnings),
  };
}

export function evaluatePathBehaviouralFit(
  path: OptimisedPath,
  ctx: RecommendationContext,
): OptimisedPath {
  const profile = deriveInvestorProfile(ctx);
  const complexity = scorePlanComplexity(path);
  const warnings: BehaviouralWarning[] = [];
  evaluateLeverageStress(warnings, ctx);
  evaluateCashAnxiety(warnings, ctx);
  evaluateCryptoOverconfidence(warnings, ctx);
  evaluatePropertyOverconfidence(warnings, ctx);
  evaluateSurplusDiscipline(warnings, ctx);
  evaluateFamilyStagePressure(warnings, ctx);
  evaluateRiskMismatch(warnings, ctx, path);

  const fit = computeBehaviouralFit(path, profile, complexity.executionDifficulty);
  const note = executionNote(path, complexity.executionDifficulty, warnings);

  return {
    ...path,
    behaviouralNote: note,
    scoreComponents: {
      ...path.scoreComponents,
      behaviouralFitScore: Number(fit.toFixed(2)),
    },
  };
}
