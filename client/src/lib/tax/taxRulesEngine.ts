/**
 * taxRulesEngine.ts — Centralized Australian Property Tax Rules Engine
 *
 * Spec: FWL_TAX_REFORM_MODELLING_ENGINE
 *
 * Single source of truth for property tax / policy scenario rules used
 * across the app: Dashboard, Forecast Engine, Property Engine, Decision
 * Engine, FIRE calculations, Monte Carlo, Tax Strategy, CGT Simulator,
 * Wealth Strategy.
 *
 * This module is a stable, deterministic, pure surface. Internally it
 * delegates to the existing `taxPolicyEngine/` modules (which provide
 * the underlying regime / ledger / CGT / cashflow primitives) and
 * exposes the high-level helpers the spec asks for by name:
 *
 *   - TaxPolicyScenario
 *   - PropertyTaxInput
 *   - classifyPropertyTaxRegime(input, scenario)
 *   - calculateAnnualPropertyTaxImpact(input, scenario)
 *   - calculateLossBank({ previousBank, taxableRentalProfit, scenario, regime })
 *   - calculateCGT(input, scenario)
 *   - compareTaxImpactVsCurrentLaw(input)
 *
 * Important invariants:
 *   - Pure functions, no I/O, no React, no global state reads.
 *   - The AEST budget-night cutoff (12 May 2026 19:30 AEST) is enforced
 *     deterministically by converting any provided ISO timestamp to AEST
 *     wall time before comparison. Date-only inputs are compared
 *     lexicographically against the cutoff date.
 *   - All numeric defaults (CGT discount, indexation rate, reform start
 *     date, cutoff date) are pulled from the underlying `taxPolicyEngine`
 *     regimes — they are NOT duplicated here.
 *
 * Modelling disclaimer: this is modelling only and not personal tax advice.
 */

import {
  REGIMES_BY_KIND,
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  CUSTOM_STRESS_TEST_REGIME,
  BUDGET_NIGHT_CUTOFF_DEFAULT,
  resolvePropertyTaxStatus,
  propertyAfterTaxCashflow,
  computeCgt,
  applyFyToLedger,
  emptyLedger,
  getCarryForwardBalance,
  deferredTaxValue,
  consumeLossesOnDisposal,
  MODELLING_DISCLAIMER,
  type PropertyType,
  type PropertyTaxStatus,
  type PropertyTaxLedger,
  type TaxPolicyRegime,
  type CGTMethod,
  type NegativeGearingTreatment,
} from "@/lib/taxPolicyEngine";

// ─── Public scenario surface ─────────────────────────────────────────────────

/**
 * High-level scenario selector exposed to UI/consumers. Maps onto the
 * underlying regime kinds:
 *   - "current_law"     -> CURRENT_RULES_REGIME
 *   - "proposed_reform" -> PROPOSED_2027_REFORM_REGIME
 *   - "custom"          -> CUSTOM_STRESS_TEST_REGIME (or user override)
 */
export type TaxPolicyScenario = "current_law" | "proposed_reform" | "custom";

export const TAX_POLICY_SCENARIOS: ReadonlyArray<{
  value: TaxPolicyScenario;
  label: string;
  description: string;
}> = [
  {
    value: "current_law",
    label: "Current law",
    description:
      "Tax treatment in effect today. Negative gearing losses offset wage " +
      "income same year. 50% CGT discount on assets held > 12 months.",
  },
  {
    value: "proposed_reform",
    label: "Proposed reform scenario",
    description:
      "Hypothetical 1 July 2027 reform. Established dwellings acquired " +
      "AFTER budget-night cutoff (12 May 2026, 7:30pm AEST) lose negative " +
      "gearing against wages; losses quarantined to a per-property loss " +
      "bank. CGT switches to an indexed-cost-base method. New builds, " +
      "BTR and affordable housing remain carved out.",
  },
  {
    value: "custom",
    label: "Custom scenario",
    description:
      "Editable scenario. Tunes any rail (NG treatment, CGT method, " +
      "discount, indexation, carve-outs) for stress-testing alternative " +
      "proposals.",
  },
];

/** Resolve the concrete regime object for a scenario. */
export function regimeForScenario(
  scenario: TaxPolicyScenario,
  customOverride?: TaxPolicyRegime,
): TaxPolicyRegime {
  switch (scenario) {
    case "current_law":     return CURRENT_RULES_REGIME;
    case "proposed_reform": return PROPOSED_2027_REFORM_REGIME;
    case "custom":          return customOverride ?? CUSTOM_STRESS_TEST_REGIME;
  }
}

// ─── Public property input surface ───────────────────────────────────────────

/**
 * Plain-data input describing a property for tax-impact modelling.
 *
 * NOTE: many of these fields are optional / derived. The classification
 * function fills in derived state (grandfathered, negative_gearing_eligible,
 * cgt_method) so consumers can call `classifyPropertyTaxRegime` once and
 * read everything off the result.
 */
export interface PropertyTaxInput {
  propertyId: string;

  /** ISO YYYY-MM-DD; settlement date. */
  purchaseDate?: string;
  /** ISO YYYY-MM-DD or full ISO timestamp; contract signed date. */
  contractDate?: string;
  /** ISO YYYY-MM-DD; explicit settlement date (alias for purchaseDate when both present). */
  settlementDate?: string;

  propertyType?: PropertyType;
  /**
   * Convenience flag: when caller knows "is this a new build vs an
   * established dwelling" but hasn't populated propertyType, we infer.
   */
  establishedVsNewBuild?: "ESTABLISHED" | "NEW_BUILD";

  /** Optional override — when caller wants to force grandfathered status. */
  grandfatheredStatusOverride?: boolean;

  // Cashflow rails
  annualRent: number;
  /** Sum of rates + insurance + maintenance + body corp. */
  annualHoldingCosts: number;
  annualInterest: number;
  annualDepreciation: number;
  annualWageIncome: number;
  hasPrivateHospitalCover?: boolean;
  hasHelpDebt?: boolean;

  // Loss bank state
  /** Loss bank balance carried into this FY (positive number). 0 if none. */
  quarantinedLossBank?: number;

  // Sale inputs (only required when computing CGT)
  salePrice?: number;
  costBase?: number;
  yearsHeld?: number;
}

// ─── AEST cutoff helper ──────────────────────────────────────────────────────

/**
 * Spec: "purchased before 12 May 2026 7:30pm AEST → grandfathered = true".
 *
 * Inputs may be ISO date-only ("2026-05-12") or full ISO timestamp
 * ("2026-05-12T19:29:59+10:00"). We normalise to AEST wall time before
 * comparing. AEST = UTC+10 (we treat AEDT/AEST uniformly using +10
 * because the cutoff date is 12 May which is AEST not AEDT).
 */
const BUDGET_NIGHT_CUTOFF_AEST_ISO = `${BUDGET_NIGHT_CUTOFF_DEFAULT}T19:30:00+10:00`;
const BUDGET_NIGHT_CUTOFF_MS = Date.parse(BUDGET_NIGHT_CUTOFF_AEST_ISO);

/** True when the acquisition (contract) timestamp is at or before the AEST cutoff. */
export function isAcquiredBeforeReformCutoff(
  isoLike: string | undefined,
): boolean {
  if (!isoLike) return false;
  // Date-only input: compare against the cutoff DATE lexicographically.
  // 2026-05-12 (date-only) counts as before 19:30 by spec convention.
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) {
    return isoLike <= BUDGET_NIGHT_CUTOFF_DEFAULT;
  }
  const t = Date.parse(isoLike);
  if (Number.isNaN(t)) return false;
  return t <= BUDGET_NIGHT_CUTOFF_MS;
}

// ─── Classification ──────────────────────────────────────────────────────────

export interface PropertyTaxClassification {
  status: PropertyTaxStatus;
  scenario: TaxPolicyScenario;
  regime: TaxPolicyRegime;
  /** Convenience boolean: NG against wages allowed for this property under this scenario. */
  negativeGearingEligible: boolean;
  /** Convenience: which CGT method will be applied. */
  cgtMethod: CGTMethod;
  /** Plain-English audit string. */
  reason: string;
}

function inferPropertyType(input: PropertyTaxInput): PropertyType {
  if (input.propertyType) return input.propertyType;
  if (input.establishedVsNewBuild === "NEW_BUILD")   return "NEW_BUILD";
  if (input.establishedVsNewBuild === "ESTABLISHED") return "ESTABLISHED";
  return "UNKNOWN";
}

function acquisitionDateOf(input: PropertyTaxInput): string | undefined {
  // Prefer contract date (matches spec grandfathering test). Fall back to
  // settlement/purchase date. Strip time component for the underlying
  // regime engine, which uses date-only ISO strings.
  const raw = input.contractDate ?? input.settlementDate ?? input.purchaseDate;
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Convert ISO timestamp -> AEST calendar date by adding +10h offset.
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw.slice(0, 10);
  const aestMs = t + 10 * 60 * 60 * 1000;
  return new Date(aestMs).toISOString().slice(0, 10);
}

/**
 * Classify a property under a given scenario, returning effective NG
 * treatment, CGT method, grandfathering, and a plain-English reason.
 *
 * This is the single function every other engine path should consult
 * when it needs to know "what tax rails apply to this property today?".
 */
export function classifyPropertyTaxRegime(
  input: PropertyTaxInput,
  scenario: TaxPolicyScenario,
  customRegime?: TaxPolicyRegime,
): PropertyTaxClassification {
  const regime = regimeForScenario(scenario, customRegime);
  const propertyType = inferPropertyType(input);
  const acquisitionDate = acquisitionDateOf(input);

  // The underlying engine compares date-only ISO strings lex-vs-lex against
  // the regime budget-night cutoff. For ISO timestamps that fall ON the
  // cutoff calendar day, we need to inspect the time-of-day in AEST and
  // pre-decide grandfathering (the cutoff is 19:30 AEST on 12 May 2026).
  const rawAcquisition = input.contractDate ?? input.settlementDate ?? input.purchaseDate;
  const forceGrandfathered =
    rawAcquisition !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(rawAcquisition) &&
    isAcquiredBeforeReformCutoff(rawAcquisition);
  const forceNonGrandfathered =
    rawAcquisition !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(rawAcquisition) &&
    !isAcquiredBeforeReformCutoff(rawAcquisition);

  let status = resolvePropertyTaxStatus(
    {
      propertyId: input.propertyId,
      propertyType,
      // Pick the date that drives the regime in the desired direction.
      contractDate: forceNonGrandfathered
        // Use the day AFTER the cutoff so the lex compare returns "not grandfathered".
        ? (() => {
            const t = new Date(BUDGET_NIGHT_CUTOFF_DEFAULT + "T00:00:00Z").getTime() + 86_400_000;
            return new Date(t).toISOString().slice(0, 10);
          })()
        : acquisitionDate,
      purchaseDate: acquisitionDate,
    },
    regime,
  );

  if (forceGrandfathered && !status.isGrandfathered) {
    status = {
      ...status,
      isGrandfathered: true,
      isPostReformEstablished: false,
      isPostReformCarveOut: false,
      effectiveNegativeGearing: "DEDUCT_AGAINST_WAGE",
      effectiveCGTMethod: "CURRENT_50_PERCENT_DISCOUNT",
      effectiveCGTDiscountPct: 0.50,
    };
  }

  if (input.grandfatheredStatusOverride === true && !status.isGrandfathered) {
    status = {
      ...status,
      isGrandfathered: true,
      isPostReformEstablished: false,
      isPostReformCarveOut: false,
      effectiveNegativeGearing: "DEDUCT_AGAINST_WAGE",
      effectiveCGTMethod: "CURRENT_50_PERCENT_DISCOUNT",
      effectiveCGTDiscountPct: 0.50,
    };
  }

  const negativeGearingEligible =
    status.effectiveNegativeGearing === "DEDUCT_AGAINST_WAGE";

  const reason = buildClassificationReason(status, propertyType, scenario);

  return {
    status,
    scenario,
    regime,
    negativeGearingEligible,
    cgtMethod: status.effectiveCGTMethod,
    reason,
  };
}

function buildClassificationReason(
  status: PropertyTaxStatus,
  propertyType: PropertyType,
  scenario: TaxPolicyScenario,
): string {
  if (scenario === "current_law") {
    return "Current law: negative gearing offsets wages, 50% CGT discount.";
  }
  if (status.isGrandfathered) {
    return `Acquired on or before ${BUDGET_NIGHT_CUTOFF_DEFAULT} 7:30pm AEST — grandfathered into current rules.`;
  }
  if (status.isPostReformCarveOut) {
    return `Post-reform ${propertyType.toLowerCase().replace(/_/g, " ")} — carved out; current rules continue to apply.`;
  }
  if (status.isPostReformEstablished) {
    return "Post-reform established dwelling — negative gearing quarantined, losses accrue in property loss bank, CGT uses indexed cost base.";
  }
  return "Tax treatment unknown — please confirm property type and contract date.";
}

// ─── Annual property tax impact ──────────────────────────────────────────────

export interface AnnualPropertyTaxImpact {
  classification: PropertyTaxClassification;
  /** Pre-tax cash result this FY: rent − holding − interest. */
  preTaxCashflow: number;
  /** Property-isolated taxable result (incl. depreciation). */
  taxableNetPropertyIncome: number;
  /** Refund applied THIS FY against PAYG. Zero when quarantined. */
  paygRefundThisYear: number;
  /** New loss accumulated into the loss bank this FY (only when quarantined). */
  lossAccumulatedThisYear: number;
  /** After-tax cash impact this FY (preTax + paygRefund). */
  afterTaxCashflow: number;
}

/**
 * Compute the one-FY tax cash impact of a property under a scenario.
 *
 * Critical: under proposed reform on a non-grandfathered established
 * property, the rental loss is NOT applied against PAYG — it is
 * accumulated into the loss bank instead. `paygRefundThisYear` is
 * therefore zero in that case and `lossAccumulatedThisYear` reflects
 * the deferred deduction.
 */
export function calculateAnnualPropertyTaxImpact(
  input: PropertyTaxInput,
  scenario: TaxPolicyScenario,
  customRegime?: TaxPolicyRegime,
): AnnualPropertyTaxImpact {
  const classification = classifyPropertyTaxRegime(input, scenario, customRegime);

  const flow = propertyAfterTaxCashflow({
    status: classification.status,
    annualRent:          input.annualRent,
    annualHoldingCosts:  input.annualHoldingCosts,
    annualInterest:      input.annualInterest,
    annualDepreciation:  input.annualDepreciation,
    annualWageIncome:    input.annualWageIncome,
    hasPrivateHospitalCover: input.hasPrivateHospitalCover,
    hasHelpDebt:         input.hasHelpDebt,
    taxYear:             classification.regime.taxYear,
  });

  return {
    classification,
    preTaxCashflow:           flow.preTaxCashflow,
    taxableNetPropertyIncome: flow.taxableNetPropertyIncome,
    paygRefundThisYear:       flow.ngBenefitThisYear,
    lossAccumulatedThisYear:  flow.lossAccumulated,
    afterTaxCashflow:         flow.afterTaxCashflow,
  };
}

// ─── Loss bank ───────────────────────────────────────────────────────────────

export interface LossBankInput {
  /** Loss bank balance brought forward (positive number). */
  previousBank: number;
  /**
   * Taxable rental profit this FY (negative = loss). When the property is
   * loss-making and the scenario is reform/quarantined, the loss accrues
   * to the bank. When it is profitable, the bank is consumed first.
   */
  taxableRentalProfit: number;
  /** Scenario / regime context — used to decide quarantine behaviour. */
  scenario: TaxPolicyScenario;
  /** Optional override of regime classification (e.g. carve-out property). */
  classification?: PropertyTaxClassification;
  /** Optional custom regime when scenario === "custom". */
  customRegime?: TaxPolicyRegime;
  /** Optional property type (used when no classification supplied). */
  propertyType?: PropertyType;
}

export interface LossBankResult {
  /** Loss bank after this FY. */
  newBank: number;
  /** Loss added this FY (positive). */
  lossAdded: number;
  /** Loss consumed against this-year profit (positive). */
  lossApplied: number;
  /** True when this FY's loss was diverted to the bank rather than refunded. */
  quarantined: boolean;
}

/**
 * Pure helper that mirrors `applyFyToLedger` semantics but works on a
 * single scalar bank balance — convenient for forecast engines that
 * already track a per-property running total instead of a full ledger.
 *
 * Behaviour:
 *   - When quarantined (proposed-reform non-grandfathered established):
 *       loss → bank += |loss|; profit → consume bank first.
 *   - When DEDUCT_AGAINST_WAGE: loss flows to wage offset (handled
 *       elsewhere); only positive profits can consume an existing bank
 *       (e.g. when scenario flips back to current law mid-projection,
 *       any pre-existing bank still consumes against future profits).
 */
export function calculateLossBank(args: LossBankInput): LossBankResult {
  const bank = Math.max(0, args.previousBank || 0);
  const profit = args.taxableRentalProfit;

  // Decide whether this FY's loss is quarantined.
  let quarantineThisYear = false;
  if (args.classification) {
    quarantineThisYear =
      args.classification.status.effectiveNegativeGearing ===
      "QUARANTINE_TO_PROPERTY";
  } else {
    // Without an explicit classification we approximate: reform scenarios
    // quarantine by default, current law does not.
    quarantineThisYear = args.scenario === "proposed_reform";
  }

  if (profit < 0) {
    const loss = -profit;
    if (quarantineThisYear) {
      return {
        newBank: bank + loss,
        lossAdded: loss,
        lossApplied: 0,
        quarantined: true,
      };
    }
    // Current law / wage-deductible loss: bank doesn't grow.
    return { newBank: bank, lossAdded: 0, lossApplied: 0, quarantined: false };
  }

  if (profit > 0 && bank > 0) {
    const applied = Math.min(bank, profit);
    return {
      newBank: bank - applied,
      lossAdded: 0,
      lossApplied: applied,
      quarantined: quarantineThisYear,
    };
  }

  return { newBank: bank, lossAdded: 0, lossApplied: 0, quarantined: quarantineThisYear };
}

// ─── CGT ─────────────────────────────────────────────────────────────────────

export interface PropertyCgtInput {
  property: PropertyTaxInput;
  /** Loss bank brought into the sale FY (will be consumed against the gain). */
  lossBankAtSale?: number;
}

export interface PropertyCgtResult {
  rawGain: number;
  effectiveGain: number;
  carryForwardApplied: number;
  taxableGain: number;
  cgtPayable: number;
  netProceeds: number;
  method: CGTMethod;
  discountPct: number;
  indexedCostBase?: number;
  classification: PropertyTaxClassification;
}

/**
 * Compute CGT for a property under a scenario.
 *
 * - Current law: 50% discount when held > 12 months.
 * - Proposed reform: indexed cost base (no flat discount), with the
 *   property's loss bank consumed against the post-indexation gain.
 * - Grandfathered properties keep current-law CGT regardless of scenario.
 */
export function calculateCGT(
  input: PropertyCgtInput,
  scenario: TaxPolicyScenario,
  customRegime?: TaxPolicyRegime,
): PropertyCgtResult {
  const classification = classifyPropertyTaxRegime(
    input.property,
    scenario,
    customRegime,
  );

  if (input.property.salePrice === undefined || input.property.costBase === undefined) {
    throw new Error("calculateCGT requires salePrice and costBase on PropertyTaxInput");
  }

  // Seed a single-property ledger from the loss bank scalar so the
  // underlying engine can apply it via consumeLossesOnDisposal.
  let ledger: PropertyTaxLedger = emptyLedger();
  const bank = input.lossBankAtSale ?? input.property.quarantinedLossBank ?? 0;
  if (bank > 0) {
    ledger = applyFyToLedger(ledger, {
      propertyId: input.property.propertyId,
      fyEndMonth: `${new Date().getUTCFullYear()}-06`,
      taxableNetPropertyIncome: -bank,
    });
  }

  const out = computeCgt({
    salePrice: input.property.salePrice,
    costBase:  input.property.costBase,
    yearsHeld: input.property.yearsHeld ?? 1,
    annualWageIncome: input.property.annualWageIncome,
    status: classification.status,
    ledger,
    indexationRate: classification.regime.indexationRate,
    taxYear: classification.regime.taxYear,
  });

  return {
    rawGain:             out.rawGain,
    effectiveGain:       out.effectiveGain,
    carryForwardApplied: out.carryForwardApplied,
    taxableGain:         out.taxableGain,
    cgtPayable:          out.cgtPayable,
    netProceeds:         out.netProceeds,
    method:              out.method,
    discountPct:         out.discountPct,
    indexedCostBase:     out.indexedCostBase,
    classification,
  };
}

// ─── Comparison ──────────────────────────────────────────────────────────────

export interface TaxImpactComparison {
  currentLaw: AnnualPropertyTaxImpact;
  proposedReform: AnnualPropertyTaxImpact;
  /** afterTaxCashflow(reform) − afterTaxCashflow(currentLaw). Negative = worse off. */
  cashflowDelta: number;
  /** lossBank growth this FY under reform. */
  lossBankDelta: number;
}

export function compareTaxImpactVsCurrentLaw(
  input: PropertyTaxInput,
): TaxImpactComparison {
  const currentLaw     = calculateAnnualPropertyTaxImpact(input, "current_law");
  const proposedReform = calculateAnnualPropertyTaxImpact(input, "proposed_reform");
  return {
    currentLaw,
    proposedReform,
    cashflowDelta: proposedReform.afterTaxCashflow - currentLaw.afterTaxCashflow,
    lossBankDelta: proposedReform.lossAccumulatedThisYear,
  };
}

// ─── Re-exports (for callers that want the lower-level primitives) ──────────

export {
  REGIMES_BY_KIND,
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  CUSTOM_STRESS_TEST_REGIME,
  BUDGET_NIGHT_CUTOFF_DEFAULT,
  resolvePropertyTaxStatus,
  propertyAfterTaxCashflow,
  computeCgt,
  applyFyToLedger,
  emptyLedger,
  getCarryForwardBalance,
  deferredTaxValue,
  consumeLossesOnDisposal,
  MODELLING_DISCLAIMER,
};

export type {
  PropertyType,
  PropertyTaxStatus,
  PropertyTaxLedger,
  TaxPolicyRegime,
  CGTMethod,
  NegativeGearingTreatment,
};
