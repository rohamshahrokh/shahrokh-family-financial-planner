/**
 * Tax Policy Engine — Property Cashflow & NG Benefit
 *
 * Computes after-tax property cashflow under any regime, respecting:
 *   - effective NG treatment (DEDUCT_AGAINST_WAGE / QUARANTINE / ABOLISH)
 *   - ledger consumption when quarantined
 *   - separation of cash impact vs deferred-tax impact (spec §6, §11)
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE §4, §5, §6.
 */

import { calcAustralianTax, type TaxYear } from "../australianTax";
import type { PropertyTaxStatus } from "./types";

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface PropertyAfterTaxCashflowInput {
  status: PropertyTaxStatus;
  /** Annual cash rent received (net of vacancy + management). */
  annualRent: number;
  /** Annual cash holding costs (rates, insurance, maintenance, body corp). */
  annualHoldingCosts: number;
  /** Annual interest paid this FY. */
  annualInterest: number;
  /** Annual non-cash depreciation (Div 40 + Div 43). */
  annualDepreciation: number;
  /** Owner's gross wage income this FY (for marginal rate calc). */
  annualWageIncome: number;
  hasPrivateHospitalCover?: boolean;
  hasHelpDebt?: boolean;
  taxYear?: TaxYear;
}

export interface PropertyAfterTaxCashflowOutput {
  /** Pre-tax cash result: rent − costs − interest. Identical across regimes. */
  preTaxCashflow: number;
  /** Property-isolated taxable result: rent − costs − interest − depreciation. */
  taxableNetPropertyIncome: number;
  /**
   * NG benefit applied THIS FY to reduce wage tax. Zero when quarantined
   * or abolished. Under DEDUCT_AGAINST_WAGE matches scenarioV2 behaviour.
   */
  ngBenefitThisYear: number;
  /**
   * Loss accumulated this FY into the carry-forward ledger. Non-zero only
   * when treatment = QUARANTINE_TO_PROPERTY and taxableNetPropertyIncome < 0.
   */
  lossAccumulated: number;
  /**
   * After-tax cash impact this FY (preTaxCashflow + ngBenefitThisYear).
   * Excludes deferred ledger value.
   */
  afterTaxCashflow: number;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export function propertyAfterTaxCashflow(
  input: PropertyAfterTaxCashflowInput,
): PropertyAfterTaxCashflowOutput {
  const year: TaxYear = input.taxYear ?? "2025-26";
  const preTaxCashflow =
    input.annualRent - input.annualHoldingCosts - input.annualInterest;
  const taxableNetPropertyIncome =
    input.annualRent - input.annualHoldingCosts - input.annualInterest - input.annualDepreciation;

  let ngBenefitThisYear = 0;
  let lossAccumulated = 0;

  const treatment = input.status.effectiveNegativeGearing;

  if (taxableNetPropertyIncome < 0) {
    const lossMagnitude = -taxableNetPropertyIncome;
    switch (treatment) {
      case "DEDUCT_AGAINST_WAGE": {
        // Classic NG — same bracket-incremental approach used in scenarioV2/auTax.
        const wageOnly = calcAustralianTax({
          grossSalary: Math.max(0, input.annualWageIncome),
          payPeriod: "annual",
          taxYear: year,
          superIncluded: false,
          superRate: 0,
          salarySacrifice: 0,
          hasPrivateHospitalCover: input.hasPrivateHospitalCover ?? true,
          hasHelpDebt: input.hasHelpDebt ?? false,
        });
        const wagePostNg = calcAustralianTax({
          grossSalary: Math.max(0, input.annualWageIncome - lossMagnitude),
          payPeriod: "annual",
          taxYear: year,
          superIncluded: false,
          superRate: 0,
          salarySacrifice: 0,
          hasPrivateHospitalCover: input.hasPrivateHospitalCover ?? true,
          hasHelpDebt: input.hasHelpDebt ?? false,
        });
        ngBenefitThisYear = Math.max(0, wageOnly.totalDeductions - wagePostNg.totalDeductions);
        break;
      }
      case "QUARANTINE_TO_PROPERTY": {
        // No this-year offset. Loss accumulates in ledger (caller does the write).
        ngBenefitThisYear = 0;
        lossAccumulated = lossMagnitude;
        break;
      }
      case "ABOLISH": {
        // No this-year offset. No carry-forward.
        ngBenefitThisYear = 0;
        lossAccumulated = 0;
        break;
      }
    }
  }

  const afterTaxCashflow = preTaxCashflow + ngBenefitThisYear;

  return {
    preTaxCashflow,
    taxableNetPropertyIncome,
    ngBenefitThisYear,
    lossAccumulated,
    afterTaxCashflow,
  };
}
