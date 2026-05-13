/**
 * Tax Policy Engine — Regime Definitions
 *
 * Spec-aligned DEFAULTS for the three regimes. Every field is editable
 * via the Assumption Centre — these are seed values only.
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE §1, §10.
 */

import type {
  TaxPolicyRegime,
  TaxPolicyRegimeKind,
  ConcreteRegimeKind,
  PropertyTypeOverrides,
  PropertyType,
} from "./types";

// ─── Spec constants (defaults, not hard-coded engine values) ─────────────────

export const BUDGET_NIGHT_CUTOFF_DEFAULT = "2026-05-12";
export const REFORM_START_DATE_DEFAULT = "2027-07-01";

/** Carve-out property types under the proposed reform (spec §2, §3). */
const REFORM_CARVE_OUTS: PropertyType[] = [
  "NEW_BUILD",
  "BUILD_TO_RENT",
  "AFFORDABLE_HOUSING",
];

const carveOutOverrides: PropertyTypeOverrides = {
  // Carve-outs keep current rules.
  negativeGearing: "DEDUCT_AGAINST_WAGE",
  cgtMethod: "CURRENT_50_PERCENT_DISCOUNT",
  cgtDiscountPct: 0.50,
};

const reformPropertyTypeOverrides: TaxPolicyRegime["propertyTypeOverrides"] = {
  NEW_BUILD: carveOutOverrides,
  BUILD_TO_RENT: carveOutOverrides,
  AFFORDABLE_HOUSING: carveOutOverrides,
};

// ─── Default regimes ─────────────────────────────────────────────────────────

export const CURRENT_RULES_REGIME: TaxPolicyRegime = {
  kind: "CURRENT_RULES",
  label: "Current rules",
  description:
    "Tax treatment in effect today. Negative gearing losses offset wage income same year. " +
    "50% CGT discount on assets held > 12 months. No grandfathering boundary.",
  reformStartDate: undefined,
  budgetNightCutoff: undefined,
  defaultNegativeGearing: "DEDUCT_AGAINST_WAGE",
  defaultCGTMethod: "CURRENT_50_PERCENT_DISCOUNT",
  defaultCGTDiscountPct: 0.50,
  propertyTypeOverrides: {},
  indexationRate: 0.025,
  taxYear: "2025-26",
};

export const PROPOSED_2027_REFORM_REGIME: TaxPolicyRegime = {
  kind: "PROPOSED_2027_REFORM",
  label: "Proposed 2027 reform",
  description:
    "Hypothetical reform from 1 July 2027. Established dwellings acquired after " +
    "budget night (12 May 2026) lose negative-gearing-against-wages and the 50% CGT discount. " +
    "New builds, build-to-rent, and affordable housing are carved out. Properties acquired on or " +
    "before the cutoff are grandfathered.",
  reformStartDate: REFORM_START_DATE_DEFAULT,
  budgetNightCutoff: BUDGET_NIGHT_CUTOFF_DEFAULT,
  defaultNegativeGearing: "QUARANTINE_TO_PROPERTY",
  defaultCGTMethod: "INDEXED_COST_BASE",
  defaultCGTDiscountPct: 0.0,
  propertyTypeOverrides: reformPropertyTypeOverrides,
  indexationRate: 0.025,
  taxYear: "2025-26",
};

export const CUSTOM_STRESS_TEST_REGIME: TaxPolicyRegime = {
  kind: "CUSTOM_STRESS_TEST",
  label: "Custom stress test",
  description:
    "Editable regime. Start from the proposed reform defaults, then tune any rail " +
    "(NG treatment, CGT method, discount, indexation, carve-outs) to model alternate proposals.",
  reformStartDate: REFORM_START_DATE_DEFAULT,
  budgetNightCutoff: BUDGET_NIGHT_CUTOFF_DEFAULT,
  defaultNegativeGearing: "QUARANTINE_TO_PROPERTY",
  defaultCGTMethod: "INDEXED_COST_BASE",
  defaultCGTDiscountPct: 0.0,
  propertyTypeOverrides: reformPropertyTypeOverrides,
  indexationRate: 0.025,
  taxYear: "2025-26",
};

// ─── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Lookup for the three CONCRETE regimes. AUTO_DETECT is excluded
 * because it's a selector mode — it resolves to one of these per property
 * at evaluation time via resolveAutoDetectedRegime().
 */
export const REGIMES_BY_KIND: Record<ConcreteRegimeKind, TaxPolicyRegime> = {
  CURRENT_RULES: CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM: PROPOSED_2027_REFORM_REGIME,
  CUSTOM_STRESS_TEST: CUSTOM_STRESS_TEST_REGIME,
};

/**
 * The four selector values surfaced in the Tax Policy Regime UI.
 *  - AUTO_DETECT: choose per-property by date + type
 *  - CURRENT_RULES: force current rules everywhere (preserves legacy behaviour)
 *  - PROPOSED_2027_REFORM: force reform rules everywhere
 *  - CUSTOM_STRESS_TEST: editable regime
 */
export const REGIME_SELECTOR_OPTIONS: ReadonlyArray<{
  kind: TaxPolicyRegimeKind;
  label: string;
  description: string;
}> = [
  {
    kind: "AUTO_DETECT",
    label: "Auto-detect (recommended)",
    description:
      "Each property is evaluated under the regime that would actually apply to it: " +
      "grandfathered properties under current rules, post-cutoff established dwellings under " +
      "the reform, carve-outs (new build / BTR / affordable) under their eligible treatment.",
  },
  {
    kind: "CURRENT_RULES",
    label: "Current rules",
    description:
      "Force current Australian tax rules across all properties. Negative gearing offsets " +
      "wage income same year. 50% CGT discount over 12 months. This is the pre-reform world.",
  },
  {
    kind: "PROPOSED_2027_REFORM",
    label: "Proposed 2027 reform",
    description:
      "Force the hypothetical reform across all properties (ignoring grandfathering). Useful " +
      "to see the worst-case impact if the reform applied to everything.",
  },
  {
    kind: "CUSTOM_STRESS_TEST",
    label: "Custom stress test",
    description:
      "Editable regime. Tune every rail (NG treatment, CGT method, discount, indexation, carve-outs).",
  },
];

/**
 * Default selector value: AUTO_DETECT preserves legacy behaviour for
 * existing grandfathered properties while applying reform rules only to
 * post-cutoff acquisitions. Users can switch to CURRENT_RULES to fully
 * preserve the pre-reform pathway, or PROPOSED_2027_REFORM to see the
 * reform impact uniformly.
 */
export const DEFAULT_REGIME_KIND: TaxPolicyRegimeKind = "AUTO_DETECT";

/** Spec §22 — surfaces shown to user must include this disclaimer. */
export { MODELLING_DISCLAIMER } from "./types";

/** Convenience: deep-clone a regime so the user can edit without mutating defaults. */
export function cloneRegime(r: TaxPolicyRegime): TaxPolicyRegime {
  return {
    ...r,
    propertyTypeOverrides: { ...r.propertyTypeOverrides },
  };
}

/** True if the carve-out type is recognised by the proposed reform. */
export function isReformCarveOutType(t: PropertyType): boolean {
  return REFORM_CARVE_OUTS.includes(t);
}
