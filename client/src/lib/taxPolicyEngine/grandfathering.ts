/**
 * Tax Policy Engine — Grandfathering & Property Tax Status Resolver
 *
 * The ONLY place that decides whether a given property under a given regime
 * gets current rules (grandfathered), reform rules (impacted), or a
 * carve-out. Every engine downstream consumes the resolved status; no
 * engine re-implements this logic.
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE §3.
 */

import type {
  PropertyTaxStatus,
  PropertyType,
  TaxPolicyRegime,
} from "./types";
import { DEFAULT_PROPERTY_TYPE } from "./types";

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface ResolveStatusInput {
  propertyId: string;
  /** PropertyType — UNKNOWN by default for legacy saved properties. */
  propertyType?: PropertyType;
  /**
   * Date the property contract was signed (ISO YYYY-MM-DD). Used against
   * budgetNightCutoff. Falls back to purchaseDate if contract date is missing.
   */
  contractDate?: string;
  /** Calendar date the property settles (ISO YYYY-MM-DD). */
  purchaseDate?: string;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Returns true when `a` is on or before `b`. Both ISO YYYY-MM-DD; lex order = chronological. */
function onOrBefore(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a <= b;
}

/** Returns true when `a` is strictly after `b`. */
function strictlyAfter(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a > b;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Determine the effective tax status for a single property under a single
 * regime. This is pure and deterministic.
 *
 * Grandfathering rule:
 *   - If contractDate (or purchaseDate fallback) ≤ regime.budgetNightCutoff,
 *     the property is GRANDFATHERED → keeps current rules forever.
 *   - Otherwise the property's effective treatment is decided by:
 *       (regime.propertyTypeOverrides[propertyType]) ?? (regime defaults)
 *
 * Established-post-cutoff is the impacted bucket. New build / BTR /
 * affordable housing acquired post-cutoff are carve-outs (current rules).
 */
export function resolvePropertyTaxStatus(
  input: ResolveStatusInput,
  regime: TaxPolicyRegime,
): PropertyTaxStatus {
  const propertyType: PropertyType = input.propertyType ?? DEFAULT_PROPERTY_TYPE;
  const acquisitionDate = input.contractDate ?? input.purchaseDate;

  // 1. Grandfathering check — regimes with no cutoff (CURRENT_RULES) treat
  //    no property as "post-reform"; everything is effectively current.
  const cutoff = regime.budgetNightCutoff;
  const isGrandfathered =
    !cutoff || onOrBefore(acquisitionDate, cutoff);

  // 2. Post-reform classification.
  const isPostReform = !!cutoff && strictlyAfter(acquisitionDate, cutoff);
  const isPostReformEstablished =
    isPostReform && propertyType === "ESTABLISHED";
  const isPostReformCarveOut =
    isPostReform &&
    (propertyType === "NEW_BUILD" ||
      propertyType === "BUILD_TO_RENT" ||
      propertyType === "AFFORDABLE_HOUSING");

  // 3. Effective rule resolution.
  // Grandfathered → always current rules.
  // Else → check propertyType override, fall back to regime defaults.
  let effectiveNegativeGearing = regime.defaultNegativeGearing;
  let effectiveCGTMethod = regime.defaultCGTMethod;
  let effectiveCGTDiscountPct = regime.defaultCGTDiscountPct;

  if (isGrandfathered) {
    effectiveNegativeGearing = "DEDUCT_AGAINST_WAGE";
    effectiveCGTMethod = "CURRENT_50_PERCENT_DISCOUNT";
    effectiveCGTDiscountPct = 0.50;
  } else {
    const override = regime.propertyTypeOverrides[propertyType];
    if (override) {
      if (override.negativeGearing !== undefined) {
        effectiveNegativeGearing = override.negativeGearing;
      }
      if (override.cgtMethod !== undefined) {
        effectiveCGTMethod = override.cgtMethod;
      }
      if (override.cgtDiscountPct !== undefined) {
        effectiveCGTDiscountPct = override.cgtDiscountPct;
      }
    }
  }

  return {
    propertyId: input.propertyId,
    propertyType,
    regime: regime.kind,
    isGrandfathered,
    isPostReformEstablished,
    isPostReformCarveOut,
    effectiveNegativeGearing,
    effectiveCGTMethod,
    effectiveCGTDiscountPct,
  };
}
