/**
 * Scenario Engine V2 — Australian Tax Adapter
 *
 * Thin adapter that brings the production-grade `australianTax.ts` engine
 * into V2 with monthly granularity. Handles:
 *
 *   • PAYG on wage income (ATO brackets + LITO + Medicare + MLS + HELP)
 *   • Investment property net income (rent − holding costs − interest − depreciation)
 *     producing either taxable rental income OR a negative-gearing deduction
 *   • Capital Gains Tax with the 50% CGT discount when held > 12 months
 *   • QLD stamp duty on property purchase
 *   • Depreciation: Div 40 (plant/equipment, 5%/yr straight-line for IP)
 *                   Div 43 (capital works, 2.5%/yr straight-line, 40 years)
 *
 * All calculations are PURE and deterministic — no I/O, no randomness.
 *
 * Why a V2 adapter (vs calling australianTax.ts directly)?
 *   - V2 ticks monthly; V1 engine is annual. We pre-compute annual figures
 *     and amortise across 12 months, applying tax events at FY end (June).
 *   - V2 needs negative-gearing OFFSET against wage income, not standalone
 *     property tax. V1 doesn't model this — it's done here.
 *   - V2 needs CGT realisation events when properties are sold; V1 doesn't.
 */

import {
  calcAustralianTax,
  calcIncomeTax,
  calcMarginalRate,
  estimateQldStampDuty,
  type TaxYear,
} from "../australianTax";
import type { PortfolioState, PropertyState } from "./types";
import {
  resolvePropertyTaxStatus,
  computeCgt as policyComputeCgt,
  type TaxPolicyRegime,
  type PropertyTaxLedger,
  type PropertyType,
} from "../taxPolicyEngine";
import { emptyLedger as policyEmptyLedger } from "../taxPolicyEngine";

// ─── Wage tax ────────────────────────────────────────────────────────────────

export interface WageTaxInput {
  annualGross: number;
  /** Annual deductible loss from rental properties (negative gearing offset). */
  rentalLoss: number;
  /** Annual taxable rental income (when properties are positively geared). */
  rentalProfit: number;
  taxYear?: TaxYear;
  hasPrivateHospitalCover?: boolean;
  hasHelpDebt?: boolean;
}

export interface WageTaxOutput {
  taxableIncome: number;
  incomeTax: number;
  medicareLevy: number;
  medicareLevySurcharge: number;
  helpRepayment: number;
  totalAnnualTax: number;
  /** Marginal rate at the post-NG taxable income level. */
  marginalRate: number;
  /** Tax savings from negative gearing this FY (vs no rental loss). */
  negativeGearingBenefit: number;
}

/**
 * Annual wage + rental tax. Negative gearing rules:
 *   taxableIncome = max(0, gross + rentalProfit − rentalLoss)
 *   negative gearing benefit = tax(gross) − tax(taxableIncome with loss)
 */
export function computeWageTax(input: WageTaxInput): WageTaxOutput {
  const year: TaxYear = input.taxYear ?? "2025-26";
  const grossOnly = Math.max(0, input.annualGross);
  const taxable = Math.max(0, grossOnly + input.rentalProfit - input.rentalLoss);

  const breakdown = calcAustralianTax({
    grossSalary: taxable,
    payPeriod: "annual",
    taxYear: year,
    superIncluded: false,
    superRate: 0,
    salarySacrifice: 0,
    hasPrivateHospitalCover: input.hasPrivateHospitalCover ?? true,
    hasHelpDebt: input.hasHelpDebt ?? false,
  });

  // Counter-factual: same tax engine on gross+rentalProfit (no rental loss).
  // Difference = NG benefit. If rentalLoss is 0 this is 0.
  let ngBenefit = 0;
  if (input.rentalLoss > 0) {
    const baseline = calcAustralianTax({
      grossSalary: grossOnly + input.rentalProfit,
      payPeriod: "annual",
      taxYear: year,
      superIncluded: false,
      superRate: 0,
      salarySacrifice: 0,
      hasPrivateHospitalCover: input.hasPrivateHospitalCover ?? true,
      hasHelpDebt: input.hasHelpDebt ?? false,
    });
    ngBenefit = Math.max(0, baseline.totalDeductions - breakdown.totalDeductions);
  }

  return {
    taxableIncome: taxable,
    incomeTax: breakdown.incomeTax,
    medicareLevy: breakdown.medicareLevy,
    medicareLevySurcharge: breakdown.medicareLevySurcharge,
    helpRepayment: breakdown.helpRepayment,
    totalAnnualTax: breakdown.totalDeductions,
    marginalRate: breakdown.marginalRate,
    negativeGearingBenefit: ngBenefit,
  };
}

// ─── Property cashflow (annual, for tax) ─────────────────────────────────────

export interface PropertyAnnualTaxRow {
  propertyId: string;
  /** Gross rent received (after vacancy + management discount). */
  netRent: number;
  /** Interest paid this FY (deductible). */
  interestPaid: number;
  /** Cash holding costs (rates, insurance, maintenance, body corp etc.). */
  holdingCosts: number;
  /** Depreciation deduction this FY (Div 40 + Div 43). */
  depreciation: number;
  /** Taxable result: positive = net rental income, negative = NG loss. */
  taxableNetIncome: number;
  /** Net cash impact (excluding tax effect). */
  netCashflow: number;
}

export interface PropertyAnnualInput {
  property: PropertyState;
  /** Annual interest paid this FY. */
  interestPaid: number;
  /** Annual depreciation: Div 40 (plant) + Div 43 (capital works). */
  depreciationAnnual: number;
  /** Months held during this FY (1..12). Pro-rates first/last year flows. */
  monthsHeldInFy: number;
}

/**
 * Produce one annual tax row for a property. Caller decides FY boundary.
 * The deductibility of interest applies to IPs only — PPOR (rent=0) gets a
 * NULL taxable row (interest is not deductible on owner-occupied debt).
 */
export function propertyAnnualTax(input: PropertyAnnualInput): PropertyAnnualTaxRow {
  const p = input.property;
  const fyFactor = Math.max(0, Math.min(12, input.monthsHeldInFy)) / 12;
  const annualRent = p.monthlyRent * 12 * fyFactor;
  const annualCosts = p.monthlyCosts * 12 * fyFactor;
  const interest = Math.max(0, input.interestPaid * fyFactor);
  const depreciation = Math.max(0, input.depreciationAnnual * fyFactor);

  const netCashflow = annualRent - annualCosts - interest;

  const isInvestment = p.monthlyRent > 0;
  // PPOR — no taxable rental income, no NG offset (interest not deductible)
  const taxableNetIncome = isInvestment
    ? annualRent - annualCosts - interest - depreciation
    : 0;

  return {
    propertyId: p.id,
    netRent: annualRent,
    interestPaid: interest,
    holdingCosts: annualCosts,
    depreciation,
    taxableNetIncome,
    netCashflow,
  };
}

/** Standard AU depreciation defaults for an established residential IP. */
export interface DepreciationInputs {
  /** Purchase price (for Div 43 calc base — usually 50–70% of price). */
  purchasePrice: number;
  /** Capital works base (Div 43 @ 2.5%/yr × 40 years). Default 60% of price. */
  capitalWorksBase?: number;
  /** Plant & equipment base (Div 40 @ 5%/yr str.-line). Default 5% of price. */
  plantEquipmentBase?: number;
  /** Years since purchase (caps both Div 40 and Div 43 lifetimes). */
  yearsSincePurchase: number;
}

/** Annual depreciation deduction given purchase price + years held. */
export function annualDepreciation(input: DepreciationInputs): number {
  const cwBase = input.capitalWorksBase ?? input.purchasePrice * 0.60;
  const peBase = input.plantEquipmentBase ?? input.purchasePrice * 0.05;
  // Div 43: 2.5%/yr × 40 years
  const div43 = input.yearsSincePurchase < 40 ? cwBase * 0.025 : 0;
  // Div 40: 5%/yr straight line — most plant fully written off by year ~10–15
  const div40 = input.yearsSincePurchase < 15 ? peBase * 0.05 : 0;
  return div43 + div40;
}

// ─── Capital Gains Tax ───────────────────────────────────────────────────────

export interface CgtInput {
  /** Sale price (net of selling costs). */
  salePrice: number;
  /** Cost base (purchase price + stamp duty + legals + acquisition costs). */
  costBase: number;
  /** True if held > 12 months — qualifies for 50% CGT discount. */
  heldMoreThan12Months: boolean;
  /** Annual gross wage income in the year of sale (for marginal rate). */
  annualWageIncome: number;
  taxYear?: TaxYear;

  // ── Tax Policy Engine extensions (P0) ─────────────────────────────────────
  // All optional. When omitted, behaviour matches the legacy current-rules
  // implementation below (50% discount over 12 months). When provided, the
  // call is delegated to taxPolicyEngine.computeCgt — the single source of
  // truth for regime-aware CGT.
  /** Tax policy regime to evaluate under. */
  regime?: TaxPolicyRegime;
  /** PropertyType for grandfathering / carve-out resolution. */
  propertyType?: PropertyType;
  /** Contract date (ISO YYYY-MM-DD) for grandfathering check. */
  contractDate?: string;
  /** Purchase / settlement date (fallback for grandfathering). */
  purchaseDate?: string;
  /** Identifier so the ledger can apply carry-forward losses. */
  propertyId?: string;
  /** Carry-forward ledger to consume against the gain. */
  ledger?: PropertyTaxLedger;
  /** Years held — needed for INDEXED_COST_BASE method. */
  yearsHeld?: number;
}

export interface CgtOutput {
  /** Raw capital gain (sale − cost base). May be negative (capital loss). */
  rawGain: number;
  /** Discounted gain: 50% if eligible, else 100%. */
  discountedGain: number;
  /** CGT payable (marginal rate × discounted gain, only if positive). */
  cgtPayable: number;
  /** Net proceeds to seller (sale − cgtPayable). */
  netProceeds: number;
}

export function computeCgt(input: CgtInput): CgtOutput {
  // ── Delegated path: regime-aware CGT via taxPolicyEngine ─────────────────
  if (input.regime && input.propertyId) {
    const status = resolvePropertyTaxStatus(
      {
        propertyId: input.propertyId,
        propertyType: input.propertyType,
        contractDate: input.contractDate,
        purchaseDate: input.purchaseDate,
      },
      input.regime,
    );
    const out = policyComputeCgt({
      salePrice: input.salePrice,
      costBase: input.costBase,
      yearsHeld: input.yearsHeld ?? (input.heldMoreThan12Months ? 2 : 0.5),
      annualWageIncome: input.annualWageIncome,
      status,
      ledger: input.ledger ?? policyEmptyLedger(),
      indexationRate: input.regime.indexationRate,
      taxYear: input.taxYear,
    });
    return {
      rawGain: out.rawGain,
      discountedGain: out.effectiveGain,
      cgtPayable: out.cgtPayable,
      netProceeds: out.netProceeds,
    };
  }

  // ── Legacy path (current rules only) — preserved verbatim ────────────────
  const year: TaxYear = input.taxYear ?? "2025-26";
  const rawGain = input.salePrice - input.costBase;
  if (rawGain <= 0) {
    return { rawGain, discountedGain: 0, cgtPayable: 0, netProceeds: input.salePrice };
  }
  const discountedGain = input.heldMoreThan12Months ? rawGain * 0.5 : rawGain;
  // Bracket-incremental: tax on (wage + gain) minus tax on wage = CGT
  const taxWithGain = calcIncomeTax(input.annualWageIncome + discountedGain, year);
  const taxOnWage = calcIncomeTax(input.annualWageIncome, year);
  const cgtPayable = Math.max(0, taxWithGain - taxOnWage);
  return {
    rawGain,
    discountedGain,
    cgtPayable,
    netProceeds: input.salePrice - cgtPayable,
  };
}

// ─── Stamp duty ──────────────────────────────────────────────────────────────

export type AuState = "QLD" | "NSW" | "VIC" | "WA" | "SA" | "TAS" | "ACT" | "NT";

/**
 * Stamp duty for residential investor purchases.
 * QLD: progressive scale (precise via estimateQldStampDuty).
 * Other states: tier-approximation — refined later.
 */
export function stampDutyByState(state: AuState, price: number): number {
  if (price <= 0) return 0;
  switch (state) {
    case "QLD":
      return estimateQldStampDuty(price);
    case "NSW":
      // 2024-25 schedule (general rate, investor)
      if (price <= 14_000) return price * 0.0125;
      if (price <= 32_000) return 175 + (price - 14_000) * 0.015;
      if (price <= 85_000) return 445 + (price - 32_000) * 0.0175;
      if (price <= 319_000) return 1_372 + (price - 85_000) * 0.035;
      if (price <= 1_064_000) return 9_562 + (price - 319_000) * 0.045;
      return 43_087 + (price - 1_064_000) * 0.055;
    case "VIC":
      // General rate investor
      if (price <= 25_000) return price * 0.014;
      if (price <= 130_000) return 350 + (price - 25_000) * 0.024;
      if (price <= 960_000) return 2_870 + (price - 130_000) * 0.06;
      return 5.5 * price / 100;
    case "WA":
      if (price <= 120_000) return price * 0.019;
      if (price <= 360_000) return 2_280 + (price - 120_000) * 0.0285;
      if (price <= 725_000) return 9_120 + (price - 360_000) * 0.038;
      return 22_990 + (price - 725_000) * 0.0515;
    case "SA":
      if (price <= 200_000) return price * 0.03;
      if (price <= 500_000) return 6_000 + (price - 200_000) * 0.04;
      return 18_000 + (price - 500_000) * 0.055;
    case "TAS":
      return price * 0.04;
    case "ACT":
      // ACT uses progressive: simplified flat 5% above $750k
      if (price <= 200_000) return price * 0.022;
      if (price <= 750_000) return 4_400 + (price - 200_000) * 0.041;
      return 27_050 + (price - 750_000) * 0.054;
    case "NT":
      // Simplified
      return price * 0.0495;
    default:
      return estimateQldStampDuty(price);
  }
}

/** LMI estimate when LVR > 80%. Bands derived from Helia 2024 schedule. */
export function estimateLMI(loanAmount: number, propertyValue: number): number {
  if (propertyValue <= 0) return 0;
  const lvr = loanAmount / propertyValue;
  if (lvr <= 0.80) return 0;
  // Bands: % of loan
  let pct = 0;
  if (lvr <= 0.85) pct = 0.0075;
  else if (lvr <= 0.90) pct = 0.014;
  else if (lvr <= 0.95) pct = 0.025;
  else pct = 0.040;
  return Math.round(loanAmount * pct);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Re-export for callers wanting raw bracket calc. */
export { calcMarginalRate, calcIncomeTax };
