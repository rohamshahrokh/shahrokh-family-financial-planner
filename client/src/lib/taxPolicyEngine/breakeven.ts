/**
 * Tax Policy Engine — Break-Even Engine
 *
 * Spec §8: four break-even types surfaced per property × regime:
 *   1. Cash break-even          — rent that covers preTax cashflow = 0
 *   2. After-tax break-even     — rent that covers afterTaxCashflow = 0
 *   3. Total-cost break-even    — rent that covers preTax + depreciation
 *   4. Wealth break-even        — annual capital growth needed to make
 *                                  total return (cash + appreciation − CGT) ≥ 0
 *
 * Each is solved analytically where possible (linear in rent) and via
 * bisection otherwise (CGT is piecewise linear in marginal brackets).
 */

import type { PropertyTaxStatus } from "./types";

export interface BreakEvenInput {
  status: PropertyTaxStatus;
  /** Annual non-rent inputs (held fixed while solving for rent). */
  annualHoldingCosts: number;
  annualInterest: number;
  annualDepreciation: number;
  /** Owner's wage income (drives marginal rate for NG benefit). */
  annualWageIncome: number;
  /** Current property value (for wealth break-even %). */
  propertyValue: number;
  hasPrivateHospitalCover?: boolean;
  hasHelpDebt?: boolean;
}

export interface BreakEvenOutput {
  /** Annual rent where preTax cashflow = 0. */
  cashBreakEvenRent: number;
  /** Annual rent where afterTax cashflow = 0 (depends on regime). */
  afterTaxBreakEvenRent: number;
  /** Annual rent that covers all economic costs (incl. depreciation). */
  totalCostBreakEvenRent: number;
  /**
   * Annual capital-growth % required for total return ≥ 0 at zero rent.
   * Uses regime CGT method.
   */
  wealthBreakEvenGrowthPct: number;
}

// ─── Solvers ─────────────────────────────────────────────────────────────────

/**
 * preTax = annualRent − holdingCosts − interest
 * preTax = 0  ⇒  annualRent = holdingCosts + interest
 */
function cashBreakEven(input: BreakEvenInput): number {
  return input.annualHoldingCosts + input.annualInterest;
}

/**
 * Total-cost break-even: includes non-cash depreciation in the cost stack
 * (economic, not cash, break-even).
 */
function totalCostBreakEven(input: BreakEvenInput): number {
  return input.annualHoldingCosts + input.annualInterest + input.annualDepreciation;
}

/**
 * After-tax break-even depends on NG treatment:
 *   - DEDUCT_AGAINST_WAGE: rent can be lower because NG offsets wage tax.
 *     Approximation: rent* ≈ holdingCosts + interest × (1 − marginalRate).
 *     We use 0.37 as the proxy unless wageIncome implies a different bracket.
 *   - QUARANTINE / ABOLISH: identical to cash break-even (no this-year benefit).
 */
function afterTaxBreakEven(input: BreakEvenInput): number {
  if (input.status.effectiveNegativeGearing !== "DEDUCT_AGAINST_WAGE") {
    return cashBreakEven(input);
  }
  // Marginal-rate proxy: 0.30 if wage < 135k, 0.37 if 135k–190k, 0.45 if >190k.
  // (2024-26 ATO bands; LITO + Medicare excluded for the proxy.)
  const w = Math.max(0, input.annualWageIncome);
  let marginal = 0.30;
  if (w > 135_000) marginal = 0.37;
  if (w > 190_000) marginal = 0.45;
  const deductibleEffective = input.annualInterest * (1 - marginal);
  return input.annualHoldingCosts + deductibleEffective;
}

/**
 * Wealth break-even: at zero rent, what annual capital growth % brings
 * 1-year total return (appreciation − CGT − annual costs) to zero?
 *
 * Simplified single-year proxy:
 *   appreciation = propertyValue × g
 *   under CGT method:
 *     CURRENT_50_PERCENT_DISCOUNT: discounted gain = appreciation × (1 − discount)
 *     INDEXED_COST_BASE: ≈ appreciation × (1 − indexationRate/g) … approximated as full
 *     CUSTOM: as DEFAULT discount-based
 *   afterCGT = appreciation − discountedGain × marginalRate
 *   solve afterCGT = (interest + holdingCosts)
 *
 * We solve linearly for g.
 */
function wealthBreakEven(input: BreakEvenInput): number {
  if (input.propertyValue <= 0) return 0;
  const w = Math.max(0, input.annualWageIncome);
  let marginal = 0.30;
  if (w > 135_000) marginal = 0.37;
  if (w > 190_000) marginal = 0.45;

  const annualCosts = input.annualHoldingCosts + input.annualInterest;
  const discountFactor =
    input.status.effectiveCGTMethod === "INDEXED_COST_BASE"
      ? 1.0
      : 1 - input.status.effectiveCGTDiscountPct;

  // afterCGT = appreciation × (1 − discountFactor × marginal)
  const afterCGTCoeff = 1 - discountFactor * marginal;
  if (afterCGTCoeff <= 0) return Infinity;
  const requiredAppreciation = annualCosts / afterCGTCoeff;
  return requiredAppreciation / input.propertyValue;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function computeBreakEvens(input: BreakEvenInput): BreakEvenOutput {
  return {
    cashBreakEvenRent: cashBreakEven(input),
    afterTaxBreakEvenRent: afterTaxBreakEven(input),
    totalCostBreakEvenRent: totalCostBreakEven(input),
    wealthBreakEvenGrowthPct: wealthBreakEven(input),
  };
}
