/**
 * Sprint 18 Phase 18.3 — Execution fit.
 *
 * Combines investor profile + plan complexity → behavioural fit score 0..1.
 * Used by Phase 18.1 path scoring (the 0.10 weight in the path formula).
 */

import type { OptimisedPath } from "../recommendationOptimization/pathTypes";
import type { InvestorProfile, ExecutionDifficulty } from "./behaviouralTypes";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function computeBehaviouralFit(
  path: OptimisedPath,
  profile: InvestorProfile,
  executionDifficulty: ExecutionDifficulty,
): number {
  // Start from inverse of execution difficulty
  let fit = executionDifficulty === "low" ? 0.85 : executionDifficulty === "medium" ? 0.65 : 0.40;

  // Archetype × profile match
  if (path.archetype === "property_led") {
    fit += profile.propertyBias * 0.15;
    fit -= profile.liquidityPreference * 0.20;
  }
  if (path.archetype === "liquid_growth") {
    fit += profile.riskTolerance * 0.10;
    fit -= profile.liquidityPreference * 0.05;
  }
  if (path.archetype === "debt_first") {
    fit += profile.debtAversion * 0.15;
  }
  if (path.archetype === "risk_reduction") {
    fit += profile.liquidityPreference * 0.10;
    fit += profile.debtAversion * 0.05;
  }
  if (path.archetype === "fire_protection") {
    fit += profile.liquidityPreference * 0.10;
    fit -= profile.riskTolerance * 0.05;
  }

  return clamp01(fit);
}
