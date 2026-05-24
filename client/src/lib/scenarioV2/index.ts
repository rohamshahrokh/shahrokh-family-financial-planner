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
  derivedInputsHash,
  materialInputsHash,
  SNAPSHOT_HASH_KEYS,
  makeRng,
  deriveSeed,
  type SeededRng,
  type DerivedHashInputs,
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

// Sprint 2B — Household composition + HEM
export {
  HEM_TABLE_MONTHLY,
  HEM_PROVENANCE,
  deriveHousehold,
  resolveHemExpenses,
  summariseHemAudit,
  type HouseholdComposition,
  type HouseholdCompositionKind,
  type HemAudit,
  type HemExpenseMode,
  type HemResolveInput,
} from "./household";

// Sprint 2B — Wage shock
export {
  DEFAULT_WAGE_SHOCK,
  makeWageShockState,
  stepWageShock,
  snapshotWageShock,
  type WageShockParams,
  type WageShockState,
  type WageShockAuditRow,
} from "./wageShock";

// Sprint 2B — Survival engine
export {
  computeSurvivalMetrics,
  type SurvivalInput,
  type SurvivalMetrics,
} from "./survival";

// Sprint 2B — Forced sale reporting
export {
  buildForcedSaleReport,
  type ForcedSaleInput,
  type ForcedSaleReport,
  type ForcedSaleSimSummary,
} from "./forcedSale";

// Sprint 2B — Goal solver v1
export {
  runGoalSolver,
  STRATEGY_REGISTRY,
  type StrategyKind,
  type StrategyDescriptor,
  type GoalSolverInput,
  type GoalSolverPathResult,
  type GoalSolverResult,
} from "./goalSolver";

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

// Financial Intelligence Layer V1
export {
  buildFinancialIntelligence,
  detectTurningPoints,
  scanFragility,
  rankAssumptionDependencies,
  detectWeakestLink,
  detectRegimeDependency,
  assessBehaviouralSurvivability,
  scorePathRobustness,
  buildRecommendationDelta,
  detectDrift,
  buildExplainability,
  buildInsightCards,
  selectCriticalFindings,
} from "./intelligence";
export type {
  FinancialIntelligenceReport,
  TurningPoint,
  FragilityFinding,
  AssumptionImpact,
  AssumptionKey,
  WeakestLink,
  RegimeDependency,
  Regime,
  BehaviouralFinding,
  BehaviouralAxis,
  PathRobustness,
  RecommendationDelta,
  DriftFinding,
  ExplainabilityAnswers,
  InsightCard,
  InsightKind,
  InsightCategory,
  InsightSeverity,
  InsightConfidence,
  InsightThreshold,
  PriorContext,
} from "./intelligence";

// Autonomous Financial OS — Phase 3
export {
  buildAutonomousReport,
  buildMonitoringSignals,
  buildRecommendationEvolution,
  classifyRegime,
  detectOpportunities,
  detectTrajectoryDrift,
  buildPriorities,
  detectRebalancing,
  simulateLifeEvents,
  buildAutonomousAlerts,
  buildLongitudinal,
  buildRoadmap,
  summariseStrategicMemory,
  buildVisualisations,
} from "./autonomous";
export type {
  AutonomousReport,
  AlertChannel,
  AllocationSnapshot,
  AutonomousAlert,
  ChangeNarrative,
  ChartSeries,
  ChartSeriesPoint,
  DriftKind,
  IsoDate,
  LedgerSnapshot,
  LifeEventImpact,
  LifeEventKind,
  LongitudinalComparison,
  MacroRegime,
  MacroRegimeSignals,
  MonitoringDimension,
  MonitoringDirection,
  MonitoringSignal,
  OpportunityKind,
  OpportunityWindow,
  PriorityItem,
  PriorityUrgency,
  RebalanceKind,
  RebalanceSignal,
  RegimeClassification,
  RoadmapHorizon,
  RoadmapHorizonPlan,
  StrategicMemoryInput,
  TrajectoryDrift,
  VisualisationsBundle,
} from "./autonomous";
