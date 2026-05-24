/**
 * canonicalTax.ts — Sprint 4C single source of truth for tax outputs.
 *
 * Why this file exists
 * --------------------
 * Sprint 4C audit found the tax stack split across four modules with
 * overlapping responsibilities:
 *
 *   - `australianTax.ts`        — PAYG income tax engine (2024-25 / 2025-26
 *                                  brackets, LITO, Medicare, MLS, HELP).
 *   - `tax/taxRulesEngine.ts`   — Property tax regime classifier (current law
 *                                  vs proposed 2027 reform), per-FY property
 *                                  tax impact, loss bank, CGT.
 *   - `taxPolicyEngine/`        — Lower-level primitives (regimes, ledger,
 *                                  CGT, grandfathering, cashflow).
 *   - `taxAlphaEngine.ts` /
 *     `taxAlphaEngineRegimeAware.ts` — Higher-level "tax alpha" analytics
 *                                  for the tax-alpha UI surface.
 *
 * Engines and pages were importing different combinations of these, each
 * picking a different default tax year, different marginal-rate heuristic,
 * different CGT discount, etc. Sprint 4A established the income-tax engine
 * as authoritative; Sprint 4B locked down property economics (NG single-
 * count + CGT once-at-sale).
 *
 * This module is the FACADE every other engine and page MUST consume when
 * it needs a tax answer. It re-exports the underlying primitives unchanged
 * and adds three single-call entry points:
 *
 *   - computeCanonicalIncomeTax  — PAYG / Medicare / MLS / HELP / LITO for
 *                                  one or two earners. Reuses calcHouseholdTax.
 *   - computeCanonicalPropertyTax — Annual NG + per-FY loss-bank delta for one
 *                                  property under a scenario. Reuses
 *                                  calculateAnnualPropertyTaxImpact.
 *   - computeCanonicalCgt         — CGT at disposal. Reuses calculateCGT.
 *
 * No new tax model is introduced here. The point is that downstream consumers
 * never need to import from three different files to get a tax number that
 * reconciles with what the rest of the app shows.
 */

import {
  calcAustralianTax,
  calcHouseholdTax,
  calcMarginalRate,
  auTaxPayableNew,
  type TaxBreakdown,
  type TaxYear,
} from "./australianTax";
import {
  classifyPropertyTaxRegime,
  calculateAnnualPropertyTaxImpact,
  calculateLossBank,
  calculateCGT,
  compareTaxImpactVsCurrentLaw,
  isAcquiredBeforeReformCutoff,
  regimeForScenario,
  TAX_POLICY_SCENARIOS,
  type TaxPolicyScenario,
  type PropertyTaxInput,
  type PropertyTaxClassification,
  type AnnualPropertyTaxImpact,
  type LossBankResult,
  type PropertyCgtInput,
  type PropertyCgtResult,
  type TaxImpactComparison,
} from "./tax/taxRulesEngine";
import {
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  BUDGET_NIGHT_CUTOFF_DEFAULT,
  type TaxPolicyRegime,
} from "./taxPolicyEngine";

/* ─── Default tax-year & assumption surface ──────────────────────────────── */

/**
 * Default tax year every canonical helper assumes when the caller doesn't
 * pin one explicitly. Update here when a new FY rolls in so every engine
 * follows in lock-step instead of drifting individually.
 */
export const DEFAULT_TAX_YEAR: TaxYear = "2025-26";

/**
 * Default safe assumptions every engine should adopt unless overridden.
 * Sourced from the regime objects so we don't duplicate constants.
 */
export const TAX_DEFAULTS = {
  taxYear: DEFAULT_TAX_YEAR,
  // CGT discount under current law (held > 12mo, individual).
  cgtDiscountPctCurrentLaw: 0.5,
  // Marginal rate fallback used in modelling-only flows (canonicalWealth's
  // CGT estimator, scenarioV2 NG breakeven). The proper per-household figure
  // is computed from calcMarginalRate when the income is known.
  fallbackMarginalRate: 0.39,
  // Standard SG rate for 2025-26 (12%). Kept here so non-tax pages can
  // surface a consistent figure without re-importing the engine.
  superGuaranteeRate: 0.12,
  budgetNightCutoff: BUDGET_NIGHT_CUTOFF_DEFAULT,
} as const;

/* ─── Canonical income tax ──────────────────────────────────────────────── */

export interface CanonicalIncomeTaxInputs {
  /** Annual gross salary for primary earner (excl. super unless flagged). */
  rohamAnnualSalary: number;
  /** Annual gross salary for secondary earner. */
  faraAnnualSalary: number;
  /** Tax year — defaults to DEFAULT_TAX_YEAR. */
  taxYear?: TaxYear;
  /** Annual pre-tax salary sacrifice for Roham. */
  rohamSalarySacrifice?: number;
  /** Annual pre-tax salary sacrifice for Fara. */
  faraSalarySacrifice?: number;
  /** Super included in salary number (true) or paid on top (false). */
  superIncluded?: boolean;
  /** Super guarantee rate (percent, e.g. 12 for 12%). Defaults from regime. */
  superRatePct?: number;
  hasPrivateHospitalCover?: boolean;
  rohamHasHelpDebt?: boolean;
  faraHasHelpDebt?: boolean;
}

export interface CanonicalIncomeTax {
  taxYear: TaxYear;
  /** Per-person breakdowns (includes Medicare + MLS + HELP). */
  primary: TaxBreakdown;
  secondary: TaxBreakdown;
  /** Household totals (sums of the two). */
  householdGrossAnnual: number;
  householdTaxableAnnual: number;
  householdTaxAnnual: number;          // income tax + medicare + MLS + HELP
  householdNetAnnual: number;
  householdSuperAnnual: number;
  /** Marginal rate at the primary earner's taxable income. */
  primaryMarginalRate: number;
  /** Average marginal across the two earners (weighted by taxable income). */
  blendedMarginalRate: number;
}

/**
 * Single household-level income tax compute. Every page that needs an
 * income-tax figure (forecast take-home, financial plan summary, dashboard
 * "tax this year", scenario compare, FIRE post-tax contribution path)
 * MUST consume this rather than calling `calcAustralianTax` directly with
 * different defaults.
 */
export function computeCanonicalIncomeTax(
  inputs: CanonicalIncomeTaxInputs,
): CanonicalIncomeTax {
  const taxYear = inputs.taxYear ?? DEFAULT_TAX_YEAR;
  const superRate = Number.isFinite(inputs.superRatePct)
    ? (inputs.superRatePct as number)
    : 12;
  const superIncluded = inputs.superIncluded ?? false;
  const hasPHI = inputs.hasPrivateHospitalCover ?? false;

  const breakdown = calcHouseholdTax(
    {
      grossSalary: Math.max(0, inputs.rohamAnnualSalary),
      payPeriod: "annual",
      taxYear,
      superIncluded,
      superRate,
      salarySacrifice: Math.max(0, inputs.rohamSalarySacrifice ?? 0),
      hasPrivateHospitalCover: hasPHI,
      hasHelpDebt: inputs.rohamHasHelpDebt ?? false,
    },
    {
      grossSalary: Math.max(0, inputs.faraAnnualSalary),
      payPeriod: "annual",
      taxYear,
      superIncluded,
      superRate,
      salarySacrifice: Math.max(0, inputs.faraSalarySacrifice ?? 0),
      hasPrivateHospitalCover: hasPHI,
      hasHelpDebt: inputs.faraHasHelpDebt ?? false,
    },
  );

  const householdGross = breakdown.person1.annualGross + breakdown.person2.annualGross;
  const householdTaxable = breakdown.person1.taxableIncome + breakdown.person2.taxableIncome;
  const householdTax = breakdown.person1.totalDeductions + breakdown.person2.totalDeductions;
  const householdNet = breakdown.person1.netAnnual + breakdown.person2.netAnnual;
  const householdSuper = breakdown.person1.superContribution + breakdown.person2.superContribution;

  const rRate = calcMarginalRate(breakdown.person1.taxableIncome, taxYear);
  const fRate = calcMarginalRate(breakdown.person2.taxableIncome, taxYear);
  const weightTotal = breakdown.person1.taxableIncome + breakdown.person2.taxableIncome;
  const blended = weightTotal > 0
    ? (rRate * breakdown.person1.taxableIncome + fRate * breakdown.person2.taxableIncome) / weightTotal
    : Math.max(rRate, fRate);

  return {
    taxYear,
    primary: breakdown.person1,
    secondary: breakdown.person2,
    householdGrossAnnual: householdGross,
    householdTaxableAnnual: householdTaxable,
    householdTaxAnnual: householdTax,
    householdNetAnnual: householdNet,
    householdSuperAnnual: householdSuper,
    primaryMarginalRate: rRate,
    blendedMarginalRate: blended,
  };
}

/* ─── Canonical property tax (NG + loss bank + CGT) ─────────────────────── */

export interface CanonicalPropertyTaxInputs {
  property: PropertyTaxInput;
  scenario: TaxPolicyScenario;
  /** Loss bank state carried forward — defaults to 0 (no prior losses). */
  previousLossBank?: number;
  customRegime?: TaxPolicyRegime;
}

export interface CanonicalPropertyTax {
  classification: PropertyTaxClassification;
  annual: AnnualPropertyTaxImpact;
  lossBank: LossBankResult;
}

/**
 * Single property × single FY tax answer. Combines:
 *   - regime classification (grandfathering, carve-out, NG eligibility, CGT method)
 *   - this-FY property impact (NG refund OR loss accrual)
 *   - loss-bank delta
 *
 * Pages and engines that previously called the three underlying helpers in
 * separate places (and silently disagreed about loss-bank state) should use
 * this single entry point instead.
 */
export function computeCanonicalPropertyTax(
  inputs: CanonicalPropertyTaxInputs,
): CanonicalPropertyTax {
  const annual = calculateAnnualPropertyTaxImpact(
    inputs.property,
    inputs.scenario,
    inputs.customRegime,
  );
  const classification = annual.classification;

  // Reconstruct "taxable rental profit" from the annual impact so loss-bank
  // semantics stay aligned (rather than recomputing rent − interest − holding
  // − depreciation in a second place).
  const taxableRentalProfit = annual.taxableNetPropertyIncome;
  const lossBank = calculateLossBank({
    previousBank: inputs.previousLossBank ?? 0,
    taxableRentalProfit,
    scenario: inputs.scenario,
    classification,
    customRegime: inputs.customRegime,
  });

  return { classification, annual, lossBank };
}

/* ─── Canonical CGT at sale ─────────────────────────────────────────────── */

export type CanonicalCgtInputs = {
  property: PropertyTaxInput;
  scenario: TaxPolicyScenario;
  lossBankAtSale?: number;
  customRegime?: TaxPolicyRegime;
};

/**
 * Pure pass-through to `calculateCGT`, kept here for symmetry with the income
 * and property tax facades. Surfaces that want a CGT number must call this
 * (instead of importing taxRulesEngine + classifying twice).
 */
export function computeCanonicalCgt(
  inputs: CanonicalCgtInputs,
): PropertyCgtResult {
  return calculateCGT(
    { property: inputs.property, lossBankAtSale: inputs.lossBankAtSale },
    inputs.scenario,
    inputs.customRegime,
  );
}

/* ─── Helpers for future-tax assumptions ────────────────────────────────── */

/**
 * Resolve the canonical future-tax assumption set every projection / forecast
 * engine should bake into its model:
 *  - scenario (current / proposed reform / custom)
 *  - regime object
 *  - blended marginal rate (when income is known)
 *  - CGT discount applicable today under that regime (50% current law, indexed
 *    under reform)
 *
 * Pages that just need "what marginal rate should I assume for the next 10
 * years?" call this and read `blendedMarginalRate`.
 */
export function resolveFutureTaxAssumptions(args: {
  scenario: TaxPolicyScenario;
  income?: CanonicalIncomeTaxInputs;
  customRegime?: TaxPolicyRegime;
}) {
  const regime = regimeForScenario(args.scenario, args.customRegime);
  const incomeTax = args.income ? computeCanonicalIncomeTax(args.income) : null;
  return {
    scenario: args.scenario,
    regime,
    taxYear: incomeTax?.taxYear ?? DEFAULT_TAX_YEAR,
    blendedMarginalRate: incomeTax?.blendedMarginalRate ?? TAX_DEFAULTS.fallbackMarginalRate,
    primaryMarginalRate: incomeTax?.primaryMarginalRate ?? TAX_DEFAULTS.fallbackMarginalRate,
    cgtDiscountPct: regime.defaultCGTDiscountPct,
    superGuaranteeRate: TAX_DEFAULTS.superGuaranteeRate,
    /** Will established-dwelling purchases qualify for NG under this scenario today? */
    establishedNgEligibleToday: args.scenario === "current_law",
  };
}

/* ─── Tax offsets pass-through ──────────────────────────────────────────── */

/**
 * Aggregate offsets visible in the canonical income-tax breakdown. Surfaces
 * that render "Tax offsets applied" should pull from this so the LITO /
 * Medicare adjustment / MLS waiver math doesn't drift.
 */
export function summariseOffsets(tax: CanonicalIncomeTax) {
  return {
    primaryLITO: tax.primary.litoOffset,
    secondaryLITO: tax.secondary.litoOffset,
    primaryMedicareLevy: tax.primary.medicareLevy,
    secondaryMedicareLevy: tax.secondary.medicareLevy,
    primaryMedicareSurcharge: tax.primary.medicareLevySurcharge,
    secondaryMedicareSurcharge: tax.secondary.medicareLevySurcharge,
    primaryHELP: tax.primary.helpRepayment,
    secondaryHELP: tax.secondary.helpRepayment,
    /** Combined effective tax rate at the household level. */
    householdEffectiveTaxRate:
      tax.householdGrossAnnual > 0
        ? tax.householdTaxAnnual / tax.householdGrossAnnual
        : 0,
  };
}

/* ─── Re-exports ────────────────────────────────────────────────────────── */
//
// Re-exports kept tight on purpose: callers should prefer the high-level
// `compute*` entry points above; the primitives are exposed only for paths
// that already depended on them prior to Sprint 4C and would otherwise have
// to keep two import lines for the same engine.

export {
  // Income tax primitives
  calcAustralianTax,
  calcHouseholdTax,
  calcMarginalRate,
  auTaxPayableNew,
  // Property tax / regime primitives
  classifyPropertyTaxRegime,
  compareTaxImpactVsCurrentLaw,
  isAcquiredBeforeReformCutoff,
  regimeForScenario,
  TAX_POLICY_SCENARIOS,
  // Regime objects
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
};

export type {
  TaxBreakdown,
  TaxYear,
  TaxPolicyScenario,
  PropertyTaxInput,
  PropertyTaxClassification,
  AnnualPropertyTaxImpact,
  LossBankResult,
  PropertyCgtInput,
  PropertyCgtResult,
  TaxImpactComparison,
  TaxPolicyRegime,
};
