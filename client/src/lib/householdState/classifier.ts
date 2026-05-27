/**
 * Sprint 17 Phase 17.2 — HouseholdLifeStage classifier.
 *
 * Pure function over `RecommendationContext`. No file IO, no engine
 * dependency. Returns exactly one `HouseholdLifeStage` + reasons array.
 */

import type {
  HouseholdLifeStage,
  LifeStageClassification,
} from "./types";
import type { RecommendationContext } from "../recommendationContext/types";

const BOUNDARIES = {
  A_TO_B: 50,
  B_TO_C: 85,
  C_TO_D: 100,
} as const;

function distanceToBoundary(progress: number): number {
  // Distance to nearest of the three thresholds, normalised by half-band width
  const diffs = [
    Math.abs(progress - BOUNDARIES.A_TO_B),
    Math.abs(progress - BOUNDARIES.B_TO_C),
    Math.abs(progress - BOUNDARIES.C_TO_D),
  ];
  const min = Math.min(...diffs);
  // Within 5pp of boundary → confidence drops to 0.5; >=15pp → confidence ~1.
  return Math.max(0.4, Math.min(1, min / 15));
}

export function classifyHouseholdLifeStage(
  ctx: RecommendationContext,
): LifeStageClassification {
  const reasons: string[] = [];
  const fireNumber =
    ctx.plan.targetPassiveMonthly != null && ctx.plan.swrPct != null && ctx.plan.swrPct > 0
      ? (ctx.plan.targetPassiveMonthly * 12) / ctx.plan.swrPct
      : 0;
  const progressPct =
    fireNumber > 0 ? Math.max(0, (ctx.today.netWorth.total / fireNumber) * 100) : 0;
  const successProb = ctx.forecast.fireSuccessProbabilityBaseline ?? 0;
  const age = ctx.today.age;
  const targetAge = ctx.plan.targetFireAge;

  reasons.push(`FIRE progress: ${progressPct.toFixed(1)}%`);
  reasons.push(`Baseline success probability: ${(successProb * 100).toFixed(0)}%`);

  // Rule 1 — age-based decumulation (drawdown phase)
  if (age != null && targetAge != null && age >= targetAge) {
    reasons.push(`Current age (${age}) >= target FIRE age (${targetAge}); drawdown phase`);
    return {
      primary: "STATE_E_DECUMULATION",
      confidence: 0.9,
      reasons,
    };
  }
  if (ctx.today.householdProfile.retired) {
    reasons.push("Household profile flagged as retired");
    return {
      primary: "STATE_E_DECUMULATION",
      confidence: 0.85,
      reasons,
    };
  }

  // Rule 2 — FIRE achieved with high MC confidence
  if (progressPct >= BOUNDARIES.C_TO_D && successProb >= 0.75) {
    reasons.push("FIRE number reached AND baseline success >= 75%");
    return {
      primary: "STATE_D_FIRE_ACHIEVED",
      confidence: 0.9,
      reasons,
    };
  }

  // Rule 3 — near FIRE (85–100%)
  if (progressPct >= BOUNDARIES.B_TO_C) {
    reasons.push("Within 85% of FIRE number — near retirement zone");
    return {
      primary: "STATE_C_NEAR_FIRE",
      confidence: distanceToBoundary(progressPct),
      reasons,
    };
  }

  // Rule 4 — accelerating (50–85%)
  if (progressPct >= BOUNDARIES.A_TO_B) {
    reasons.push("Past 50% of FIRE number — accelerating accumulation");
    return {
      primary: "STATE_B_ACCELERATING",
      confidence: distanceToBoundary(progressPct),
      reasons,
    };
  }

  // Default — accumulation
  if (fireNumber <= 0) {
    reasons.push("FIRE target not set — defaulting to accumulation");
  } else {
    reasons.push("Below 50% of FIRE number — early accumulation");
  }
  return {
    primary: "STATE_A_ACCUMULATION",
    confidence: progressPct < 5 ? 1 : distanceToBoundary(progressPct),
    reasons,
  };
}
