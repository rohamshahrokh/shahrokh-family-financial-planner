/**
 * Sprint 18 Phase 18.3 — Plan complexity scoring.
 *
 * A path with 4 simultaneous actions across 3 pillars is harder to execute
 * than a 2-step path. Returns an executionDifficulty band and an adherence
 * estimate.
 */

import type { OptimisedPath } from "../recommendationOptimization/pathTypes";
import type { ExecutionDifficulty } from "./behaviouralTypes";

export interface PlanComplexityResult {
  executionDifficulty: ExecutionDifficulty;
  likelyAdherence: number;
  reasons: string[];
}

export function scorePlanComplexity(path: OptimisedPath): PlanComplexityResult {
  const stepCount = path.steps.length;
  const pillarSet = new Set(path.steps.map((s) => s.pillar));
  const reasons: string[] = [];

  let complexity = 0;
  if (stepCount >= 4) {
    complexity += 2;
    reasons.push(`${stepCount} sequential steps`);
  } else if (stepCount === 3) {
    complexity += 1;
  }
  if (pillarSet.size >= 3) {
    complexity += 1;
    reasons.push(`spans ${pillarSet.size} strategic pillars`);
  }
  if (path.archetype === "property_led") {
    complexity += 1;
    reasons.push("property purchase has irreversibility risk");
  }

  let executionDifficulty: ExecutionDifficulty;
  let likelyAdherence: number;
  if (complexity >= 3) {
    executionDifficulty = "high";
    likelyAdherence = 0.45;
  } else if (complexity === 2) {
    executionDifficulty = "medium";
    likelyAdherence = 0.70;
  } else {
    executionDifficulty = "low";
    likelyAdherence = 0.85;
  }
  return { executionDifficulty, likelyAdherence, reasons };
}
