/**
 * Tax Policy Engine — Core Types
 *
 * Single source of truth for Australian tax policy regimes used across
 * scenarioV2, taxAlphaEngine, propertyBuyEngine, forecastEngine, FIRE,
 * Monte Carlo, and Decision Engine.
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE (sections 1, 2, 3, 9, 10).
 *
 * IMPORTANT: All policy parameters are intentionally data-driven so the
 * user can override any of them in the Assumption Centre. Nothing here is
 * hard-coded against a specific reform proposal — the defaults reflect the
 * spec, but the regime object is the contract.
 *
 * Modelling disclaimer (must be surfaced wherever these outputs are shown):
 *   "This is modelling only and not personal tax advice."
 */

import type { TaxYear } from "../australianTax";

// ─── Property classification ─────────────────────────────────────────────────

/**
 * Property type drives which policy rails apply to negative gearing
 * deductibility, CGT discount eligibility, and grandfathering.
 *
 * UNKNOWN exists so legacy saved properties (which predate this field)
 * default to the most conservative interpretation rather than silently
 * picking ESTABLISHED.
 */
export type PropertyType =
  | "ESTABLISHED"        // existing dwelling, post-cutoff = subject to reform
  | "NEW_BUILD"          // brand-new dwelling (off-the-plan or construction) — typically carved out
  | "BUILD_TO_RENT"      // institutional BTR — typically carved out
  | "AFFORDABLE_HOUSING" // NRAS-style affordable — typically carved out
  | "UNKNOWN";

/** Default conservative classification for legacy properties without an explicit type. */
export const DEFAULT_PROPERTY_TYPE: PropertyType = "UNKNOWN";

// ─── Policy regimes ──────────────────────────────────────────────────────────

/**
 * Tax policy regime selector. AUTO_DETECT is the meta-option that
 * resolves each property to a concrete regime at evaluation time based
 * on its contractDate + propertyType. CURRENT_RULES, PROPOSED_2027_REFORM,
 * and CUSTOM_STRESS_TEST are concrete regimes a scenario can be evaluated
 * under directly.
 *
 * Parallel-pathway rule (#FWL_DoNotOverride_CurrentTaxLogic):
 *   The legacy current-rules tax pipeline ALWAYS remains available. The
 *   new regime layer runs ALONGSIDE it, never instead of it. Every output
 *   surface can render both pathways simultaneously.
 */
export type TaxPolicyRegimeKind =
  | "AUTO_DETECT"
  | "CURRENT_RULES"
  | "PROPOSED_2027_REFORM"
  | "CUSTOM_STRESS_TEST";

/**
 * Concrete (non-AUTO_DETECT) regime kinds. AUTO_DETECT resolves to one
 * of these per-property and is never the *effective* regime applied to
 * a specific calculation.
 */
export type ConcreteRegimeKind = Exclude<TaxPolicyRegimeKind, "AUTO_DETECT">;

/**
 * Resolution outcome when AUTO_DETECT runs against a property. Engines
 * may use the `requiresUserConfirmation` flag to surface the
 * "Tax treatment unknown — please confirm" UI state.
 */
export interface AutoDetectResolution {
  resolvedRegimeKind: ConcreteRegimeKind;
  /** True when the property lacked enough metadata for a confident decision. */
  requiresUserConfirmation: boolean;
  /** Plain-English explanation of why this regime was chosen. */
  reason: string;
}

/** CGT calculation method — current rules use the 50% discount. */
export type CGTMethod =
  | "CURRENT_50_PERCENT_DISCOUNT"
  | "INDEXED_COST_BASE"
  | "CUSTOM";

/**
 * Negative gearing treatment for non-grandfathered properties under a regime.
 *
 *   DEDUCT_AGAINST_WAGE: classic NG — losses offset wage income same year (current rules).
 *   QUARANTINE_TO_PROPERTY: losses cannot offset wage; carry forward against future
 *                           property income / CGT only (proposed reform default).
 *   ABOLISH: no deduction, no carry-forward (extreme stress test).
 */
export type NegativeGearingTreatment =
  | "DEDUCT_AGAINST_WAGE"
  | "QUARANTINE_TO_PROPERTY"
  | "ABOLISH";

/**
 * Per-property-type rule overrides. For each PropertyType, a regime can:
 *   - allow normal NG against wages (carve-out)
 *   - force quarantining
 *   - keep the current 50% CGT discount even if the regime defaults to a lower one
 *
 * If a PropertyType key is absent from this map, the regime defaults apply.
 */
export interface PropertyTypeOverrides {
  negativeGearing?: NegativeGearingTreatment;
  cgtMethod?: CGTMethod;
  /** Optional: a regime can give certain types a richer discount (e.g. 60% for new builds). */
  cgtDiscountPct?: number;
}

/**
 * A fully-resolved tax policy regime. This is the contract every engine
 * (cashflow, CGT, forecast, FIRE, MC, decision) consumes.
 *
 * All numeric rails are *editable* — the Assumption Centre surfaces them
 * verbatim. Defaults below are spec-aligned but not hard-coded into the
 * engines themselves.
 */
export interface TaxPolicyRegime {
  /** Concrete regime kind. AUTO_DETECT is a selector, not a regime, so it cannot appear here. */
  kind: ConcreteRegimeKind;
  /** Human-readable name surfaced in the UI. */
  label: string;
  /** Plain-English summary surfaced in tooltips. */
  description: string;

  /**
   * Date after which the regime applies. Properties acquired BEFORE this
   * date are grandfathered into CURRENT_RULES treatment regardless of
   * regime kind. Spec defaults:
   *   - CURRENT_RULES: undefined (always-on)
   *   - PROPOSED_2027_REFORM: 2027-07-01
   *   - CUSTOM_STRESS_TEST: user-set (defaults to PROPOSED_2027_REFORM date)
   */
  reformStartDate?: string; // ISO YYYY-MM-DD

  /**
   * Budget-night cutoff for grandfathering. Properties whose CONTRACT DATE
   * is on or before this date are grandfathered. Spec default: 2026-05-12.
   */
  budgetNightCutoff?: string; // ISO YYYY-MM-DD

  /** Default NG treatment for properties not grandfathered. */
  defaultNegativeGearing: NegativeGearingTreatment;

  /** Default CGT method for properties not grandfathered. */
  defaultCGTMethod: CGTMethod;

  /** Default CGT discount when method = CURRENT_50_PERCENT_DISCOUNT. Editable. */
  defaultCGTDiscountPct: number; // 0.50 = 50%

  /** Per-property-type carve-outs / overrides. */
  propertyTypeOverrides: Partial<Record<PropertyType, PropertyTypeOverrides>>;

  /**
   * Indexation rate when CGT method = INDEXED_COST_BASE. Annual CPI proxy.
   * Editable so the user can stress higher/lower indexation.
   */
  indexationRate: number; // 0.025 = 2.5%

  /** Tax year alignment for the regime's bracket math. */
  taxYear: TaxYear;
}

// ─── Resolved per-property tax status ────────────────────────────────────────

/**
 * Computed once for each property × regime combination. Engines call
 * `resolvePropertyTaxStatus` and consume this rather than re-implementing
 * the grandfathering / carve-out logic locally.
 */
export interface PropertyTaxStatus {
  propertyId: string;
  propertyType: PropertyType;
  regime: TaxPolicyRegimeKind;

  /** True when the property is grandfathered (acquired ≤ budgetNightCutoff). */
  isGrandfathered: boolean;
  /** True when the property is post-reform AND ESTABLISHED — i.e. impacted. */
  isPostReformEstablished: boolean;
  /** True when the property is post-reform AND a carve-out type. */
  isPostReformCarveOut: boolean;

  /** The actual NG treatment that applies to this property under this regime. */
  effectiveNegativeGearing: NegativeGearingTreatment;
  /** The actual CGT method that applies. */
  effectiveCGTMethod: CGTMethod;
  /** The actual CGT discount that applies (0..1). */
  effectiveCGTDiscountPct: number;

  /**
   * Set when this status came out of AUTO_DETECT and either dates or
   * property type were ambiguous. UI surfaces should render the
   * "Tax treatment unknown — please confirm" state when true.
   */
  autoDetectNeedsConfirmation?: boolean;
  /** Plain-English reason when status was produced by AUTO_DETECT. */
  autoDetectReason?: string;
}

// ─── Carried-forward loss ledger (property_tax_ledger) ───────────────────────

/**
 * One ledger entry per (property, FY). When NG is quarantined, this is how
 * losses accumulate. Used by:
 *   - cashflow engine: never reduces this-year wage tax
 *   - CGT engine: offsets capital gain on disposal
 *   - net worth: surfaces "deferred tax value" separate from cash
 */
export interface PropertyTaxLedgerEntry {
  propertyId: string;
  /** FY end month (e.g. "2028-06"). Stable lexicographic = chronological. */
  fyEndMonth: string;
  /** Loss generated this FY (positive number = loss). */
  lossGenerated: number;
  /** Loss applied this FY against same-property income (positive = applied). */
  lossApplied: number;
  /** Running carry-forward balance AT END of this FY. */
  carryForwardBalance: number;
}

/** Full ledger keyed by property id. */
export type PropertyTaxLedger = Record<string, PropertyTaxLedgerEntry[]>;

// ─── Modelling disclaimer ────────────────────────────────────────────────────

export const MODELLING_DISCLAIMER =
  "This is modelling only and not personal tax advice.";
