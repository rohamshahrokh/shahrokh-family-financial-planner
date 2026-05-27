/**
 * Sprint 18 Phase 18.1 — Path Optimiser.
 *
 * Generates candidate paths → applies feasibility + behavioural + stress
 * overlays → scores → returns ranked paths and a best path.
 *
 * HARD RULE (user verbatim):
 *   "The highest-return path must not automatically win. A slightly slower
 *    but much safer path should often rank first."
 *
 * The scoring weights enforce this: feasibility + liquidity + behavioural +
 * stress penalty all contribute. fire_acceleration is 0.25 of the weight,
 * not the only weight.
 */

import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath } from "./pathTypes";
import { generateCandidatePaths } from "./candidatePathGenerator";
import { scorePath } from "./pathScoring";
import { attachPathStress } from "./pathStressTest";
import { evaluatePathFeasibility } from "../feasibility/feasibilityEngine";
import { evaluatePathBehaviouralFit } from "../behaviouralFinance/behaviouralRisk";

export interface PathOptimisationResult {
  bestPath: OptimisedPath | null;
  candidatePaths: OptimisedPath[];
  rationale: string;
}

export function optimisePaths(ctx: RecommendationContext): PathOptimisationResult {
  const candidates = generateCandidatePaths(ctx);
  const enriched = candidates.map((p) => {
    const withFeasibility = evaluatePathFeasibility(p, ctx);
    const withBehavioural = evaluatePathBehaviouralFit(withFeasibility, ctx);
    const withStress = attachPathStress(withBehavioural, ctx);
    return scorePath(withStress, ctx);
  });

  const ranked = [...enriched].sort((a, b) => b.score - a.score);

  // Tie-breaking — never let infeasible paths win over feasible.
  ranked.sort((a, b) => {
    if (a.feasibility.feasible && !b.feasibility.feasible) return -1;
    if (!a.feasibility.feasible && b.feasibility.feasible) return 1;
    return b.score - a.score;
  });

  const bestPath = ranked[0] ?? null;

  const rationale = bestPath
    ? `Best path: ${bestPath.title} (${bestPath.score}/100). ` +
      `Chosen over ${ranked.slice(1).map((p) => p.archetype).join(", ")} based on ` +
      `feasibility + safety + behavioural fit, not raw FIRE acceleration alone.`
    : "No feasible path generated for this household.";

  return { bestPath, candidatePaths: ranked, rationale };
}
