/**
 * Tax Policy Engine — Public Surface
 *
 * Single import path for every downstream engine:
 *   import { resolvePropertyTaxStatus, computeCgt, propertyAfterTaxCashflow,
 *            applyFyToLedger, REGIMES_BY_KIND, MODELLING_DISCLAIMER }
 *     from "@/lib/taxPolicyEngine";
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE — "one central engine".
 *
 * Architecture note: scenarioV2/auTax.ts now delegates negative gearing and
 * CGT to this module. taxAlphaEngine, propertyBuyEngine, forecastEngine,
 * fireMonteCarlo, monteCarloEngine, and the Decision Engine import directly
 * from here in P1.
 *
 * Modelling disclaimer (must appear on every surface that renders these
 * outputs): "This is modelling only and not personal tax advice."
 */

export type {
  PropertyType,
  TaxPolicyRegime,
  TaxPolicyRegimeKind,
  CGTMethod,
  NegativeGearingTreatment,
  PropertyTypeOverrides,
  PropertyTaxStatus,
  PropertyTaxLedger,
  PropertyTaxLedgerEntry,
} from "./types";

export { DEFAULT_PROPERTY_TYPE, MODELLING_DISCLAIMER } from "./types";

export {
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  CUSTOM_STRESS_TEST_REGIME,
  REGIMES_BY_KIND,
  DEFAULT_REGIME_KIND,
  BUDGET_NIGHT_CUTOFF_DEFAULT,
  REFORM_START_DATE_DEFAULT,
  cloneRegime,
  isReformCarveOutType,
} from "./regimes";

export {
  resolvePropertyTaxStatus,
  type ResolveStatusInput,
} from "./grandfathering";

export {
  applyFyToLedger,
  emptyLedger,
  getCarryForwardBalance,
  consumeLossesOnDisposal,
  deferredTaxValue,
  type ApplyFyToLedgerInput,
  type ConsumeOnDisposalResult,
} from "./ledger";

export {
  computeCgt,
  type ComputeCgtInput,
  type ComputeCgtOutput,
} from "./cgt";

export {
  propertyAfterTaxCashflow,
  type PropertyAfterTaxCashflowInput,
  type PropertyAfterTaxCashflowOutput,
} from "./cashflow";

export {
  computeBreakEvens,
  type BreakEvenInput,
  type BreakEvenOutput,
} from "./breakeven";

export {
  DEFAULT_DECISION_ENGINE_WEIGHTS,
  compositeDecisionScore,
  type DecisionEngineWeights,
  type DecisionAxisScores,
} from "./decisionEngineWeights";
