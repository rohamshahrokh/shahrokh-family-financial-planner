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
  basePlanInventory,
  netWorthOfState,
  DEFAULT_ASSUMPTIONS,
  monthKey,
  addMonths,
  rangeKeys,
  type DerivedBasePlan,
} from "./basePlan";

// Asset scope types
export type { AssetScope, BasePlanAssetTag } from "./types";

// Assumptions inventory (audit P1.4)
export {
  collectAssumptionsUsed,
  type AssumptionRow,
  type AssumptionCategory,
} from "./assumptions";

// Events
export { buildEventStore, sortEvents, groupByMonth, monthsBetween } from "./events";

// Deltas
export { translateDelta } from "./deltas";

// Tick + helpers
export { tick, netWorth, monthlySurplusOf, type TickContext, type TickDraws, type ExtendedPortfolioState } from "./tick";

// AU Tax
export {
  computeWageTax,
  propertyAnnualTax,
  annualDepreciation,
  computeCgt,
  stampDutyByState,
  estimateLMI,
  type WageTaxInput,
  type WageTaxOutput,
  type CgtInput,
  type CgtOutput,
  type AuState,
  type DepreciationInputs,
} from "./auTax";

// Stochastic engine
export {
  ASSET_NAMES,
  DEFAULT_CORRELATION,
  DEFAULT_RATE_PROCESS,
  DEFAULT_INFLATION_REGIMES,
  CRYPTO_JUMPS,
  cholesky,
  drawCorrelatedNormals,
  studentT,
  drawJumpMultiplier,
  vasicekStep,
  inflationStep,
  sequenceRiskMetric,
  type CorrelationMatrix,
  type VasicekParams,
  type JumpDiffusionParams,
  type InflationRegimeParams,
  type AssetKey,
  type InflationRegime,
} from "./stochastic";

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

// Persistence
export {
  v2Persistence,
  v2Presets,
  v2LastAssumptions,
  deriveAssumptionsHash,
  type SavedScenario,
  type ScenarioSavePayload,
  type AssumptionPreset,
} from "./persistence";

// Narrative + recommendation engine
export {
  buildComparisonNarrative,
  type ScenarioNarrative,
  type ComparisonNarrative,
} from "./narrative";

// Premium PDF
export {
  generatePremiumPdf,
  type PdfData,
} from "./pdfReport";

// Quick decision PDF + pdfSafe helper
export {
  generateQuickDecisionPdf,
  pdfSafe,
  type QuickDecisionPdfData,
} from "./quickDecisionPdf";
