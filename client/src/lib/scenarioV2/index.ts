/**
 * Scenario Engine V2 — Public Entry Point
 *
 * Phase 1: only types and the feature flag are exported.
 * Subsequent phases will add: event store, tick, deltas, monte carlo, etc.
 *
 * V1 code may import { SCENARIO_ENGINE_V2 } from here. Anything else
 * imported by V1 is a bug — V1 must not depend on V2 logic.
 */
export { SCENARIO_ENGINE_V2, assertV2Enabled } from "./flag";
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
