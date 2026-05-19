/**
 * propertyPortfolioTaxImpact.ts — Portfolio → taxRulesEngine adapter
 *
 * Single bridge that converts the app's existing property rows (from
 * /api/properties) into PropertyTaxInput[] and computes the live
 * current-law vs proposed-reform impact summary that the Dashboard,
 * Property cards, Tax Strategy audit table and CGT Simulator all
 * consume.
 *
 * IMPORTANT — invariants:
 *   - ALL tax math originates from `taxRulesEngine.ts`. Nothing in this
 *     file duplicates a formula. We only translate property field
 *     names and aggregate per-property results.
 *   - PPOR and vacant land rows are excluded from impact totals (no
 *     rental income / no NG semantics under either regime).
 *   - Missing dates / numeric fields default to safe zeros — the caller
 *     can still render the table; a property with no contract date is
 *     classified as "unknown" by the engine and shown as such.
 */

import {
  classifyPropertyTaxRegime,
  calculateAnnualPropertyTaxImpact,
  calculateLossBank,
  compareTaxImpactVsCurrentLaw,
  type PropertyTaxInput,
  type AnnualPropertyTaxImpact,
  type TaxImpactComparison,
  type PropertyTaxClassification,
} from "./taxRulesEngine";
import { safeNum } from "@/lib/finance";

export interface PortfolioPropertyRow {
  id?: number | string;
  name?: string;
  type?: string;                 // "investment" | "ppor" | "land" | ...
  purchase_date?: string;
  settlement_date?: string;
  contract_date?: string;
  property_type?: string;        // ESTABLISHED | NEW_BUILD | ...
  weekly_rent?: number;
  loan_amount?: number;
  loan_balance?: number;
  interest_rate?: number;        // percent (eg 6.5)
  management_fee?: number;       // percent
  council_rates?: number;
  insurance?: number;
  maintenance?: number;
  body_corporate?: number;
  land_tax?: number;
  water_rates?: number;
  current_value?: number;
  purchase_price?: number;
  annual_depreciation?: number;
  /** Loss bank carried forward (positive dollars). 0 when none. */
  loss_bank_balance?: number;
}

export interface PortfolioImpactRow {
  id: string;
  name: string;
  contractDate?: string;
  classification: PropertyTaxClassification;
  currentLaw: AnnualPropertyTaxImpact;
  proposedReform: AnnualPropertyTaxImpact;
  /** afterTaxCashflow(reform) − afterTaxCashflow(currentLaw). Negative = worse off. */
  cashflowDelta: number;
  /** New loss accumulated this FY under reform. */
  lossBankDelta: number;
  /**
   * Per-property loss bank state under reform. Required UI surface
   * (FWL_TAX_REFORM_INTEGRITY_FIX). All four numbers are positive dollars:
   *   - lossBankBalance   = current bank carried into this FY
   *   - lossBankAccumulated = bank + lossAddedThisFY (before any consumption)
   *   - lossBankConsumed  = portion of the bank applied against this-FY profit
   *   - lossBankRemaining = bank after this FY (i.e. closing balance)
   */
  lossBank: {
    lossBankBalance: number;
    lossBankAccumulated: number;
    lossBankConsumed: number;
    lossBankRemaining: number;
  };
}

export interface PortfolioImpactSummary {
  rows: PortfolioImpactRow[];
  totals: {
    /** Sum of current-law PAYG refunds across all properties. */
    currentLawRefund: number;
    /** Sum of reform PAYG refunds across all properties. */
    reformRefund: number;
    /** currentLawRefund − reformRefund (i.e. refund LOST under reform). Always ≥ 0. */
    refundsReduced: number;
    /** Sum of loss bank deltas this FY (loss accumulating, ≥ 0). */
    annualLossBankGrowth: number;
    /** Projected loss bank balance accumulated to a target year (default +10y). */
    projectedLossBank2035: number;
    /** Cashflow delta (reform − currentLaw). Negative = worse off. */
    cashflowDelta: number;
    /** Count of properties classified as reform-affected (quarantined). */
    reformAffectedCount: number;
    /** Count of properties grandfathered. */
    grandfatheredCount: number;
    /** Count of post-reform carve-outs (new build / BTR). */
    carveOutCount: number;
  };
}

const PPOR_OR_LAND = new Set(["ppor", "land", "vacant_land", "primary"]);

function buildPropertyTaxInput(
  row: PortfolioPropertyRow,
  wageIncome: number,
  marginalIncomeForMedicareCheck = wageIncome,
): PropertyTaxInput {
  const weeklyRent = safeNum(row.weekly_rent);
  const annualRent = weeklyRent * 52;
  const loan = safeNum(row.loan_amount ?? row.loan_balance);
  const interestRate = safeNum(row.interest_rate) / 100;
  const annualInterest = loan * interestRate;
  const mgmtFeePct = safeNum(row.management_fee) / 100;
  const annualHoldingCosts =
    mgmtFeePct * annualRent +
    safeNum(row.council_rates) +
    safeNum(row.insurance) +
    safeNum(row.maintenance) +
    safeNum(row.body_corporate) +
    safeNum(row.land_tax) +
    safeNum(row.water_rates);

  // Depreciation — modest default if not supplied (2.5% of purchase price
  // capped at $7,500/yr — typical Div 43 estimate for an established IP).
  const purchasePrice = safeNum(row.purchase_price ?? row.current_value);
  const annualDepreciation = safeNum(
    row.annual_depreciation ?? Math.min(7_500, purchasePrice * 0.025),
  );

  const propertyType =
    (row.property_type as PropertyTaxInput["propertyType"]) ?? "ESTABLISHED";

  return {
    propertyId: String(row.id ?? row.name ?? "property"),
    contractDate: row.contract_date ?? row.purchase_date,
    purchaseDate: row.purchase_date,
    settlementDate: row.settlement_date,
    propertyType,
    annualRent,
    annualHoldingCosts,
    annualInterest,
    annualDepreciation,
    annualWageIncome: wageIncome,
    hasPrivateHospitalCover: marginalIncomeForMedicareCheck < 0,
    hasHelpDebt: false,
    quarantinedLossBank: safeNum(row.loss_bank_balance),
  };
}

/**
 * Compute the portfolio-wide current-law vs reform impact summary.
 *
 * - `properties` may contain PPOR / land rows; those are excluded from
 *   the impact totals but still listed in `rows` so the Property page
 *   audit table can render them with a "not subject to reform" tag.
 * - `wageIncome` should be the household wage that PAYG offset would
 *   apply to. Default 0 (no refund either way) when unknown.
 * - `projectedYears` controls the loss-bank projection horizon used
 *   for the dashboard "Loss bank accumulated by YYYY" tile. The
 *   projection is deterministic — annual loss × years, with no
 *   compounding — because the engine treats loss bank as a nominal
 *   ledger.
 */
export function computePortfolioTaxImpact(
  properties: PortfolioPropertyRow[],
  wageIncome: number,
  projectedYears = 10,
): PortfolioImpactSummary {
  const rows: PortfolioImpactRow[] = [];
  let currentLawRefund = 0;
  let reformRefund = 0;
  let annualLossBankGrowth = 0;
  let cashflowDelta = 0;
  let reformAffectedCount = 0;
  let grandfatheredCount = 0;
  let carveOutCount = 0;

  for (const row of properties ?? []) {
    const typeLower = String(row.type ?? "").toLowerCase();
    if (PPOR_OR_LAND.has(typeLower)) continue;

    const taxInput = buildPropertyTaxInput(row, wageIncome);
    const comparison: TaxImpactComparison =
      compareTaxImpactVsCurrentLaw(taxInput);

    const classification =
      comparison.proposedReform.classification ??
      classifyPropertyTaxRegime(taxInput, "proposed_reform");

    // Per-property loss bank (FWL_TAX_REFORM_INTEGRITY_FIX requirement).
    // Mirrors taxRulesEngine.calculateLossBank semantics but is computed
    // here per-row so the UI can expose balance / accumulated / consumed
    // / remaining without re-deriving anything locally.
    const previousBank = safeNum(row.loss_bank_balance);
    const lossBankStep = calculateLossBank({
      previousBank,
      taxableRentalProfit: comparison.proposedReform.taxableNetPropertyIncome,
      scenario: "proposed_reform",
      classification,
    });
    const lossBank = {
      lossBankBalance:     previousBank,
      lossBankAccumulated: previousBank + lossBankStep.lossAdded,
      lossBankConsumed:    lossBankStep.lossApplied,
      lossBankRemaining:   lossBankStep.newBank,
    };

    rows.push({
      id: taxInput.propertyId,
      name: row.name ?? `Property ${taxInput.propertyId}`,
      contractDate: taxInput.contractDate,
      classification,
      currentLaw: comparison.currentLaw,
      proposedReform: comparison.proposedReform,
      cashflowDelta: comparison.cashflowDelta,
      lossBankDelta: comparison.lossBankDelta,
      lossBank,
    });

    currentLawRefund += comparison.currentLaw.paygRefundThisYear;
    reformRefund += comparison.proposedReform.paygRefundThisYear;
    annualLossBankGrowth += comparison.lossBankDelta;
    cashflowDelta += comparison.cashflowDelta;

    if (classification.status.isGrandfathered) grandfatheredCount += 1;
    else if (classification.status.isPostReformCarveOut) carveOutCount += 1;
    else if (classification.status.isPostReformEstablished) reformAffectedCount += 1;
  }

  return {
    rows,
    totals: {
      currentLawRefund,
      reformRefund,
      refundsReduced: Math.max(0, currentLawRefund - reformRefund),
      annualLossBankGrowth,
      projectedLossBank2035: annualLossBankGrowth * projectedYears,
      cashflowDelta,
      reformAffectedCount,
      grandfatheredCount,
      carveOutCount,
    },
  };
}

/** Convenience for tests / pure consumers — single property impact. */
export function singlePropertyTaxImpact(
  row: PortfolioPropertyRow,
  wageIncome: number,
): PortfolioImpactRow | null {
  const summary = computePortfolioTaxImpact([row], wageIncome);
  return summary.rows[0] ?? null;
}
