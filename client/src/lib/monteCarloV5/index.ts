/**
 * Monte Carlo V5 — public entry point.
 *
 * V5 is the realism + advisor-intelligence expansion on top of V4. It is
 * strictly additive: V4 functionality, canonical reconciliation, dashboard
 * projections, deterministic replay, and the Decision Engine integration
 * are unchanged.
 *
 * Modules:
 *   - regimesV5            : Phase 1 — V5 regime vocabulary + overlays
 *   - correlatedShocks     : Phase 2 — cross-asset correlation + cascades
 *   - householdRealism     : Phase 3 — AU household life-cycle realism
 *   - propertyRealismAU    : Phase 4 — Australian property cycle realism
 *   - portfolioIntelligence: Phase 5 — rebalancing, buffer, super caps
 *   - fireEngineV2         : Phase 6 — SWR bands, sequence risk, FIRE flavours
 *   - narrativeV3          : Phase 7 — multi-tone advisor narratives
 *   - transparency         : Phase 8 — driver / assumption breakdowns
 *   - preferenceWeights    : Phase 9 — preference-weighted re-ranking
 *   - projectionModes      : Phase 10 — canonical projection mode selector
 *   - validation           : Phase 11 — reconciliation + sanity warnings
 *   - engineV5             : Orchestrator
 */
export * from "./regimesV5";
export * from "./correlatedShocks";
export * from "./householdRealism";
export * from "./propertyRealismAU";
export * from "./portfolioIntelligence";
export * from "./fireEngineV2";
export * from "./narrativeV3";
export * from "./transparency";
export * from "./preferenceWeights";
export * from "./projectionModes";
export * from "./validation";
export { runMonteCarloV5, type MonteCarloV5Config, type MonteCarloV5Extras, type MonteCarloV5Result } from "./engineV5";
