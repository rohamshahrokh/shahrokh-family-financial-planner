/**
 * Sprint 18 Phase 18.1 — Path-level stress testing.
 *
 * Thin wrapper that runs each path through the Phase 18.4 stress engine and
 * produces a PathStressSummary. Kept here (not in stressTesting/) so that the
 * path optimisation module is internally cohesive.
 */

import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath, PathStressSummary } from "./pathTypes";
import { stressTestPath } from "../stressTesting/stressTestEngine";

export function attachPathStress(
  path: OptimisedPath,
  ctx: RecommendationContext,
): OptimisedPath {
  const stressed = stressTestPath(path, ctx);
  const survived = stressed.results.filter((r) => r.survives).length;
  const total = stressed.results.length;
  const failures = stressed.results.filter((r) => !r.survives);
  const summary: PathStressSummary = {
    scenariosTested: total,
    scenariosSurvived: survived,
    survivalRate: total > 0 ? survived / total : 1,
    mainWeakness: failures.length > 0
      ? `Fails ${failures.map((f) => f.scenario).slice(0, 2).join(" + ")}`
      : null,
  };
  return { ...path, stressTest: summary };
}
