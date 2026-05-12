/**
 * Tax Policy Engine — Capital Gains Tax Engine
 *
 * Computes CGT under any of the three CGTMethod values:
 *   - CURRENT_50_PERCENT_DISCOUNT: discounted gain × marginal rate (current rules)
 *   - INDEXED_COST_BASE: cost base indexed by inflation; full gain × marginal rate
 *   - CUSTOM: caller-supplied discount pct
 *
 * Applies any carry-forward losses from the property_tax_ledger against
 * the post-discount gain before tax is computed (spec §10).
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE §9, §10.
 */

import { calcIncomeTax, type TaxYear } from "../australianTax";
import type { CGTMethod, PropertyTaxLedger, PropertyTaxStatus } from "./types";
import { consumeLossesOnDisposal } from "./ledger";

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface ComputeCgtInput {
  /** Net sale price (after selling costs). */
  salePrice: number;
  /** Raw cost base (purchase + stamp duty + legals + capital improvements). */
  costBase: number;
  /** Years held — used for indexation and the 12-month discount test. */
  yearsHeld: number;
  /** Annual wage income in the FY of sale (for marginal-rate bracket math). */
  annualWageIncome: number;
  /** Resolved tax status for this property × regime. */
  status: PropertyTaxStatus;
  /** Ledger of accumulated losses across all properties. */
  ledger: PropertyTaxLedger;
  /** Indexation rate when method = INDEXED_COST_BASE. Editable assumption. */
  indexationRate?: number;
  taxYear?: TaxYear;
}

export interface ComputeCgtOutput {
  rawGain: number;
  /** Gain after applying CGTMethod (discount or indexation). */
  effectiveGain: number;
  /** Carry-forward loss applied against the effectiveGain. */
  carryForwardApplied: number;
  /** Taxable gain after carry-forward applied (the figure that hits brackets). */
  taxableGain: number;
  cgtPayable: number;
  netProceeds: number;
  /** Audit fields surfaced in UI / tooltips. */
  method: CGTMethod;
  discountPct: number;
  indexedCostBase?: number;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export function computeCgt(input: ComputeCgtInput): ComputeCgtOutput {
  const year: TaxYear = input.taxYear ?? "2025-26";
  const method = input.status.effectiveCGTMethod;
  const rawGain = input.salePrice - input.costBase;

  // No gain → no CGT; carry-forward stays intact.
  if (rawGain <= 0) {
    return {
      rawGain,
      effectiveGain: 0,
      carryForwardApplied: 0,
      taxableGain: 0,
      cgtPayable: 0,
      netProceeds: input.salePrice,
      method,
      discountPct: input.status.effectiveCGTDiscountPct,
    };
  }

  // Method-specific gain computation.
  let effectiveGain = rawGain;
  let indexedCostBase: number | undefined;
  const discountPct = input.status.effectiveCGTDiscountPct;

  switch (method) {
    case "CURRENT_50_PERCENT_DISCOUNT": {
      // Discount only applies when held > 12 months (spec + ATO rule).
      const eligible = input.yearsHeld > 1;
      effectiveGain = eligible
        ? rawGain * (1 - discountPct)
        : rawGain;
      break;
    }
    case "INDEXED_COST_BASE": {
      const rate = input.indexationRate ?? 0.025;
      indexedCostBase = input.costBase * Math.pow(1 + rate, Math.max(0, input.yearsHeld));
      effectiveGain = Math.max(0, input.salePrice - indexedCostBase);
      break;
    }
    case "CUSTOM": {
      effectiveGain = rawGain * (1 - discountPct);
      break;
    }
  }

  // Apply carry-forward losses against the effective gain (spec §10).
  const { consumed } = consumeLossesOnDisposal(
    input.ledger,
    input.status.propertyId,
    effectiveGain,
  );
  const taxableGain = Math.max(0, effectiveGain - consumed);

  // Bracket-incremental CGT: tax(wage + taxableGain) − tax(wage).
  const taxWithGain = calcIncomeTax(input.annualWageIncome + taxableGain, year);
  const taxOnWage = calcIncomeTax(input.annualWageIncome, year);
  const cgtPayable = Math.max(0, taxWithGain - taxOnWage);

  return {
    rawGain,
    effectiveGain,
    carryForwardApplied: consumed,
    taxableGain,
    cgtPayable,
    netProceeds: input.salePrice - cgtPayable,
    method,
    discountPct,
    indexedCostBase,
  };
}
