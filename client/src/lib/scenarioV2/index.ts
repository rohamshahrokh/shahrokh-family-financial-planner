/**
 * Scenario Engine V2 — Public Entry Point
 *
 * The only file V1 code may import from. Anything not exported here is
 * internal to V2.
 */

// Flag
export { SCENARIO_ENGINE_V2, assertV2Enabled } from "./flag";

// Determinism foundation
export {
  canonicalJson,
  stableHash,
  snapshotHash,
  SNAPSHOT_HASH_KEYS,
  makeRng,
  deriveSeed,
  type SeededRng,
} from "./determinism";

// Types
export type {
  MonthKey,
  SnapshotHash,
  BasePlan,
  BasePlanAssumptions,
  ScenarioDelta,
  DeltaType,
  ScenarioEvent,
  ScenarioEventType,
  EventPriority,
  PortfolioState,
  PropertyState,
  ScenarioResult,
  FanPoint,
  ConfidenceBand,
} from "./types";

// Base plan
export {
  deriveBasePlan,
  DEFAULT_ASSUMPTIONS,
  monthKey,
  addMonths,
  rangeKeys,
  type DerivedBasePlan,
} from "./basePlan";

// Events
export { buildEventStore, sortEvents, groupByMonth, monthsBetween } from "./events";

// Deltas
export { translateDelta } from "./deltas";

// Tick + helpers
export { tick, netWorth, monthlySurplusOf, type TickContext } from "./tick";

// Borrowing
export {
  computeServiceability,
  type ServiceabilityInput,
  type ServiceabilityResult,
} from "./borrowing";

// Monte Carlo
export {
  runMonteCarlo,
  type MonteCarloInput,
  type MonteCarloOutput,
  type CashFanPoint,
} from "./monteCarlo";

// Risk metrics
export {
  computeRiskMetrics,
  type RiskMetrics,
  type RiskInput,
} from "./riskMetrics";

// Orchestrator
export {
  runScenarioV2,
  type RunScenarioInput,
  type ExtendedScenarioResult,
} from "./runScenario";
