/**
 * Monte Carlo V4 — public entry point.
 *
 * V4 is the institutional-grade simulation engine: regime-aware macro,
 * dynamic rate dynamics, Australian property cycle model, household life
 * event engine, behavioural overlays, advanced risk metrics, allocation
 * optimiser, and advisor-grade explanations.
 *
 * V4 is ADDITIVE: it wraps the V3 canonical engine to preserve Dashboard
 * reconciliation, Decision Engine wiring, and existing UI surfaces. New
 * outputs live under `result.v4`.
 */
export * from "./rng";
export * from "./regimes";
export * from "./rates";
export * from "./property";
export * from "./events";
export * from "./behavioural";
export * from "./risk";
export * from "./optimizer";
export * from "./explanations";
export * from "./engineV4";
export { ASSUMPTION_GLOSSARY, getAssumptionExplanation } from "./glossary";
