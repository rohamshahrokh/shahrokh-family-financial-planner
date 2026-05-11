/**
 * Registry public surface.
 *
 * Anything importing from "scenarioV2/registry" gets this module.
 * Anything not exported here is internal to the registry.
 */

// Formulas
export {
  // Pure helpers
  amortizationPayment,
  amortizationSchedule,
  interestOnlyPayment,
  offsetEffectiveRate,
  netRentalYield,
  propertyTotalReturn,
  liquidityRatio,
  dynamicLiquidityFloor,
  dsrBand,
  refinancePressureBand,
  downside,
  survivalProbability,
  fireCoverage,
  swrSustainableSpend,
  riskAdjustedReturn,
  concessionalSuperCap,
  divisionTwoNinetyThreeTax,
  superGuaranteeRate,
  SUPER_CONSTANTS_FY26,
  // Phase 2.5 — inflation, Sortino, APRA constants
  realDollars,
  realCagr,
  sortinoRatio,
  APRA_CONSTANTS,
  // Registry index
  FORMULA_REGISTRY,
  getFormula,
  listFormulas,
  // Types
  type FormulaSpec,
  type FormulaCategory,
  type AmortizationRow,
  type DynamicLiquidityCtx,
  type DynamicLiquidityResult,
  type DsrBand,
  type RefinancePressureBand,
} from "./formulas";

// Assumptions
export {
  ASSUMPTION_REGISTRY,
  MACRO_ASSUMPTIONS,
  ASSET_ASSUMPTIONS,
  TAX_ASSUMPTIONS,
  REGULATORY_ASSUMPTIONS,
  BEHAVIOURAL_ASSUMPTIONS,
  REGISTRY_VERSION,
  REGISTRY_LAST_REVIEWED,
  getAssumption,
  listAssumptions,
  assertAssumptionsConsistent,
  defaultBasePlanAssumptionsFromRegistry,
  type AssumptionSpec,
  type AssumptionCategory,
  type ConsistencyViolation,
} from "./assumptions";

// Scoring
export {
  compositeScore,
  validateScoreWeights,
  DEFAULT_SCORE_WEIGHTS,
  PROFILE_REGISTRY,
  getProfileWeights,
  listInvestorProfiles,
  type ScoreInputs,
  type ScoreWeights,
  type ScoreBreakdownEntry,
  type PenaltyEntry,
  type CompositeScore,
  type InvestorProfile,
  type InvestorProfileSpec,
} from "./scoring";
