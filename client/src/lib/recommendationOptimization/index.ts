/**
 * Sprint 18 Phase 18.1 — Public surface for path optimisation.
 */

export * from "./pathTypes";
export { generateCandidatePaths } from "./candidatePathGenerator";
export { scorePath } from "./pathScoring";
export { attachPathStress } from "./pathStressTest";
export { optimisePaths } from "./pathOptimizer";
export type { PathOptimisationResult } from "./pathOptimizer";
