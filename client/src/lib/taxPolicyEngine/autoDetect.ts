/**
 * Tax Policy Engine — Auto-Detect Resolver & Parallel-Pathway Comparison
 *
 * Spec: #FWL_DoNotOverride_CurrentTaxLogic
 *
 * Two responsibilities:
 *   1. AUTO_DETECT resolution: given a property + selector mode AUTO_DETECT,
 *      return the concrete regime that should apply (CURRENT_RULES if
 *      grandfathered, PROPOSED_2027_REFORM if post-cutoff, etc.). When
 *      metadata is missing, flag requiresUserConfirmation.
 *   2. Parallel-pathway comparison: helpers that run the SAME inputs through
 *      BOTH current rules AND proposed reform so any UI can render side-by-
 *      side outputs ("Current", "Reform", "Δ").
 *
 * Parallel-pathway rule: the legacy current-rules pipeline is never
 * replaced. CURRENT_RULES_REGIME is the canonical handle for it within the
 * new engine; calling existing scenarioV2/auTax / taxAlphaEngine /
 * propertyBuyEngine functions WITHOUT a regime still uses the unchanged
 * legacy implementation.
 */

import type {
  AutoDetectResolution,
  ConcreteRegimeKind,
  PropertyType,
  TaxPolicyRegime,
  TaxPolicyRegimeKind,
  PropertyTaxStatus,
  PropertyTaxLedger,
} from "./types";
import {
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  REGIMES_BY_KIND,
} from "./regimes";
import { resolvePropertyTaxStatus } from "./grandfathering";
import { propertyAfterTaxCashflow, type PropertyAfterTaxCashflowInput, type PropertyAfterTaxCashflowOutput } from "./cashflow";
import { computeCgt, type ComputeCgtInput, type ComputeCgtOutput } from "./cgt";

// ─── AUTO_DETECT resolver ────────────────────────────────────────────────────

export interface AutoDetectInput {
  propertyType?: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
  /**
   * Reform regime to consult for the cutoff date + carve-out list.
   * Defaults to PROPOSED_2027_REFORM_REGIME so callers don't have to wire
   * it through.
   */
  reformRegime?: TaxPolicyRegime;
}

/**
 * Decide which concrete regime should apply to a property when the user
 * has selected AUTO_DETECT.
 *
 * Rules (per #FWL_DoNotOverride_CurrentTaxLogic):
 *   - acquisitionDate ≤ budget-night cutoff → CURRENT_RULES (grandfathered)
 *   - acquisitionDate > cutoff AND propertyType = ESTABLISHED → PROPOSED_2027_REFORM
 *   - acquisitionDate > cutoff AND propertyType is a carve-out (NEW_BUILD /
 *     BUILD_TO_RENT / AFFORDABLE_HOUSING) → PROPOSED_2027_REFORM but the
 *     status resolver will pick up the carve-out override automatically.
 *   - missing date OR propertyType = UNKNOWN → CURRENT_RULES (safe legacy
 *     default) with requiresUserConfirmation = true.
 */
export function resolveAutoDetectedRegime(
  input: AutoDetectInput,
): AutoDetectResolution {
  const reform = input.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const cutoff = reform.budgetNightCutoff;
  const acquisitionDate = input.contractDate ?? input.purchaseDate;
  const propertyType = input.propertyType ?? "UNKNOWN";

  // Missing data → ambiguous. Fall back to CURRENT_RULES (preserves legacy
  // behaviour) and flag for confirmation.
  if (!acquisitionDate || !cutoff) {
    return {
      resolvedRegimeKind: "CURRENT_RULES",
      requiresUserConfirmation: true,
      reason:
        "Tax treatment unknown — acquisition date is missing. Defaulting to current rules; " +
        "please confirm the property's contract date.",
    };
  }
  if (propertyType === "UNKNOWN") {
    return {
      resolvedRegimeKind: acquisitionDate <= cutoff ? "CURRENT_RULES" : "PROPOSED_2027_REFORM",
      requiresUserConfirmation: true,
      reason:
        "Property type is not set. The reform's carve-outs (new build / BTR / affordable housing) " +
        "may apply — please confirm the property classification.",
    };
  }

  // Grandfathered → current rules.
  if (acquisitionDate <= cutoff) {
    return {
      resolvedRegimeKind: "CURRENT_RULES",
      requiresUserConfirmation: false,
      reason:
        `Acquired on or before the budget-night cutoff (${cutoff}) — grandfathered into current rules.`,
    };
  }

  // Post-cutoff: reform applies (carve-outs handled by the status resolver).
  const carveOutNote =
    propertyType === "NEW_BUILD" ||
    propertyType === "BUILD_TO_RENT" ||
    propertyType === "AFFORDABLE_HOUSING"
      ? " The property type is a reform carve-out, so current-rules treatment still applies via the regime's override."
      : "";
  return {
    resolvedRegimeKind: "PROPOSED_2027_REFORM",
    requiresUserConfirmation: false,
    reason:
      `Acquired after the budget-night cutoff (${cutoff}) — proposed 2027 reform applies.${carveOutNote}`,
  };
}

/**
 * Translate a selector value (any TaxPolicyRegimeKind, possibly AUTO_DETECT)
 * to the concrete regime that should be applied to a specific property.
 * Returns the regime object plus the AutoDetectResolution when AUTO_DETECT
 * was used (null otherwise).
 */
export interface ResolveSelectorOutput {
  regime: TaxPolicyRegime;
  autoDetect: AutoDetectResolution | null;
}

export function resolveSelector(
  selector: TaxPolicyRegimeKind,
  property: AutoDetectInput,
  customRegime?: TaxPolicyRegime,
): ResolveSelectorOutput {
  if (selector === "AUTO_DETECT") {
    const auto = resolveAutoDetectedRegime(property);
    return { regime: REGIMES_BY_KIND[auto.resolvedRegimeKind], autoDetect: auto };
  }
  if (selector === "CUSTOM_STRESS_TEST" && customRegime) {
    return { regime: customRegime, autoDetect: null };
  }
  return { regime: REGIMES_BY_KIND[selector as ConcreteRegimeKind], autoDetect: null };
}

// ─── Parallel-pathway comparison helpers ────────────────────────────────────

/**
 * Run the cashflow engine for ONE property under BOTH the current-rules
 * regime AND the proposed-reform regime, returning side-by-side outputs.
 *
 * This is the helper the UI uses to render the "Current | Reform | Δ"
 * comparison view called out in #FWL_DoNotOverride_CurrentTaxLogic.
 *
 * Importantly, this does NOT touch any existing engine. It runs the new
 * regime-aware cashflow path twice — once with CURRENT_RULES, once with
 * the reform — over the same inputs. The legacy scenarioV2/auTax pipeline
 * is unaffected and remains the authoritative source for any caller that
 * does not opt in.
 */
export interface CashflowComparisonInput {
  propertyId: string;
  propertyType?: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
  annualRent: number;
  annualHoldingCosts: number;
  annualInterest: number;
  annualDepreciation: number;
  annualWageIncome: number;
  hasPrivateHospitalCover?: boolean;
  hasHelpDebt?: boolean;
  reformRegime?: TaxPolicyRegime;
}

export interface CashflowComparisonOutput {
  current: PropertyAfterTaxCashflowOutput;
  reform: PropertyAfterTaxCashflowOutput;
  /** reform - current (negative = reform is worse than current). */
  delta: {
    preTaxCashflow: number;
    ngBenefitThisYear: number;
    lossAccumulated: number;
    afterTaxCashflow: number;
  };
}

export function compareCashflowBothRegimes(
  input: CashflowComparisonInput,
): CashflowComparisonOutput {
  const reform = input.reformRegime ?? PROPOSED_2027_REFORM_REGIME;

  const currentStatus = resolvePropertyTaxStatus(
    {
      propertyId: input.propertyId,
      propertyType: input.propertyType,
      contractDate: input.contractDate,
      purchaseDate: input.purchaseDate,
    },
    CURRENT_RULES_REGIME,
  );
  const reformStatus = resolvePropertyTaxStatus(
    {
      propertyId: input.propertyId,
      propertyType: input.propertyType,
      contractDate: input.contractDate,
      purchaseDate: input.purchaseDate,
    },
    reform,
  );

  const base: Omit<PropertyAfterTaxCashflowInput, "status"> = {
    annualRent: input.annualRent,
    annualHoldingCosts: input.annualHoldingCosts,
    annualInterest: input.annualInterest,
    annualDepreciation: input.annualDepreciation,
    annualWageIncome: input.annualWageIncome,
    hasPrivateHospitalCover: input.hasPrivateHospitalCover,
    hasHelpDebt: input.hasHelpDebt,
  };

  const current = propertyAfterTaxCashflow({ ...base, status: currentStatus });
  const reformOut = propertyAfterTaxCashflow({ ...base, status: reformStatus });

  return {
    current,
    reform: reformOut,
    delta: {
      preTaxCashflow: reformOut.preTaxCashflow - current.preTaxCashflow,
      ngBenefitThisYear: reformOut.ngBenefitThisYear - current.ngBenefitThisYear,
      lossAccumulated: reformOut.lossAccumulated - current.lossAccumulated,
      afterTaxCashflow: reformOut.afterTaxCashflow - current.afterTaxCashflow,
    },
  };
}

/**
 * Run the CGT engine for one disposal under BOTH regimes. Same parallel-
 * pathway contract as the cashflow comparison.
 */
export interface CgtComparisonInput {
  propertyId: string;
  propertyType?: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
  salePrice: number;
  costBase: number;
  yearsHeld: number;
  annualWageIncome: number;
  ledger: PropertyTaxLedger;
  reformRegime?: TaxPolicyRegime;
}

export interface CgtComparisonOutput {
  current: ComputeCgtOutput;
  reform: ComputeCgtOutput;
  delta: {
    cgtPayable: number;
    netProceeds: number;
    taxableGain: number;
  };
}

export function compareCgtBothRegimes(input: CgtComparisonInput): CgtComparisonOutput {
  const reform = input.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const currentStatus = resolvePropertyTaxStatus(
    {
      propertyId: input.propertyId,
      propertyType: input.propertyType,
      contractDate: input.contractDate,
      purchaseDate: input.purchaseDate,
    },
    CURRENT_RULES_REGIME,
  );
  const reformStatus = resolvePropertyTaxStatus(
    {
      propertyId: input.propertyId,
      propertyType: input.propertyType,
      contractDate: input.contractDate,
      purchaseDate: input.purchaseDate,
    },
    reform,
  );

  const baseCgt: Omit<ComputeCgtInput, "status"> = {
    salePrice: input.salePrice,
    costBase: input.costBase,
    yearsHeld: input.yearsHeld,
    annualWageIncome: input.annualWageIncome,
    ledger: input.ledger,
    indexationRate: reform.indexationRate,
  };

  const current = computeCgt({ ...baseCgt, status: currentStatus });
  const reformOut = computeCgt({ ...baseCgt, status: reformStatus });

  return {
    current,
    reform: reformOut,
    delta: {
      cgtPayable: reformOut.cgtPayable - current.cgtPayable,
      netProceeds: reformOut.netProceeds - current.netProceeds,
      taxableGain: reformOut.taxableGain - current.taxableGain,
    },
  };
}

/**
 * Convenience: resolve a status under BOTH regimes for one property.
 * Useful when UI wants to show "Under current rules: GRANDFATHERED /
 * Under reform: POST-REFORM ESTABLISHED" badges.
 */
export interface StatusComparisonInput {
  propertyId: string;
  propertyType?: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
  reformRegime?: TaxPolicyRegime;
}

export interface StatusComparisonOutput {
  current: PropertyTaxStatus;
  reform: PropertyTaxStatus;
}

export function compareStatusBothRegimes(
  input: StatusComparisonInput,
): StatusComparisonOutput {
  const reform = input.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  return {
    current: resolvePropertyTaxStatus(
      {
        propertyId: input.propertyId,
        propertyType: input.propertyType,
        contractDate: input.contractDate,
        purchaseDate: input.purchaseDate,
      },
      CURRENT_RULES_REGIME,
    ),
    reform: resolvePropertyTaxStatus(
      {
        propertyId: input.propertyId,
        propertyType: input.propertyType,
        contractDate: input.contractDate,
        purchaseDate: input.purchaseDate,
      },
      reform,
    ),
  };
}
