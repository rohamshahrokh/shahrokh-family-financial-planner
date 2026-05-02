/**
 * cgtEngine.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   AUSTRALIAN CAPITAL GAINS TAX ENGINE (CGT)                              ║
 * ║                                                                          ║
 * ║   Models a sale of an investment asset (property/shares) and estimates   ║
 * ║   the marginal tax payable on the gain, the 50% CGT discount where      ║
 * ║   eligible, and the net cash received after sale.                        ║
 * ║                                                                          ║
 * ║   Sources (encoded in defaults):                                         ║
 * ║     ATO — resident tax rates                                             ║
 * ║       https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
 * ║     ATO — CGT discount                                                   ║
 * ║       https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount
 * ║     ATO — CGT when selling rental property                               ║
 * ║       https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/property-and-capital-gains-tax/cgt-when-selling-your-rental-property
 * ║     ATO — Cost base of an asset                                          ║
 * ║       https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/cost-base-of-asset
 * ║                                                                          ║
 * ║   This module is an estimator — does NOT replace accountant advice.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { calcIncomeTax, type TaxYear } from './australianTax';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HoldingType = 'personal' | 'trust' | 'company';
export type OwnershipPreset = 'roham_100' | 'fara_100' | 'split_50_50' | 'custom';
export type AustralianState = 'QLD' | 'NSW' | 'VIC' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

export interface CgtInput {
  /** Asset label, e.g. "Brisbane IP" */
  property_name: string;
  /** Purchase price (AUD) */
  purchase_price: number;
  /** ISO date string YYYY-MM-DD — contract date for purchase */
  purchase_date: string;
  /** Selling price (AUD) */
  selling_price: number;
  /** ISO date string YYYY-MM-DD — contract date for sale (CGT event date) */
  selling_date: string;
  /** Selling costs — agent commission, legal, marketing (eligible cost-base) */
  selling_costs: number;
  /** Buying costs — stamp duty, conveyancing, legal (eligible cost-base) */
  buying_costs: number;
  /** Ownership split preset */
  ownership_preset: OwnershipPreset;
  /** When ownership_preset = 'custom', percentage (0–100) attributed to Roham */
  custom_roham_pct: number;
  /** Annual taxable income (AUD) for Roham in the sale financial year (excluding the gain) */
  roham_other_income: number;
  /** Annual taxable income (AUD) for Fara in the sale financial year (excluding the gain) */
  fara_other_income: number;
  /** Holding type — affects CGT discount eligibility */
  holding_type: HoldingType;
  /** Australian state (informational; QLD default for app) */
  state: AustralianState;
  /** Tax year used for marginal-rate calculation */
  tax_year: TaxYear;
  /** Editable assumption — corporate tax rate when holding_type = 'company' (default 25% base-rate entity) */
  company_tax_rate?: number;
}

export interface CgtPersonShare {
  /** Owner label */
  owner: 'Roham' | 'Fara';
  /** Ownership percentage (0–1) */
  share: number;
  /** Allocated capital gain BEFORE discount */
  allocated_gain: number;
  /** Discounted gain (= allocated gain * discount factor) */
  discounted_gain: number;
  /** Other taxable income (excluding the gain) */
  other_income: number;
  /** Tax on income only (no gain) */
  baseline_tax: number;
  /** Tax with gain included */
  tax_with_gain: number;
  /** Incremental tax attributable to this gain */
  cgt_payable: number;
}

export interface CgtScenarioResult {
  /** Days held (sell date − purchase date) */
  days_held: number;
  /** True iff days_held ≥ 365 (CGT discount only available if held ≥ 12 months) */
  eligible_for_discount: boolean;
  /** Discount factor actually applied (0.5 if eligible individual/trust, else 0) */
  discount_factor: number;
  /** Total cost base = purchase_price + buying_costs + selling_costs */
  cost_base: number;
  /** Gross capital gain = selling_price − cost_base (clamped at 0 — losses handled separately) */
  gross_gain: number;
  /** Capital loss (positive number when gross_gain < 0, else 0) */
  capital_loss: number;
  /** Per-owner breakdown (only for personal/trust); empty for company */
  shares: CgtPersonShare[];
  /** Total tax payable on the gain (sum of incremental tax across owners, OR company tax) */
  total_cgt_payable: number;
  /** Net cash after sale = selling_price − selling_costs − loan payout (excl loan; pre-debt clearance) */
  net_cash_before_tax: number;
  /** Net cash after CGT */
  net_cash_after_tax: number;
  /** ROI = (selling_price − cost_base) / cost_base */
  roi_pct: number;
  /** Annualised return (CAGR) over hold period */
  annualised_return_pct: number;
}

export interface CgtComparison {
  /** Hypothetical sale at <12 months (full marginal tax, no discount) */
  under_12_months: CgtScenarioResult;
  /** Sale based on actual purchase/sale dates (discount applied if eligible) */
  actual: CgtScenarioResult;
  /** Hypothetical sale ≥ 12 months (forces discount where eligible) */
  over_12_months: CgtScenarioResult;
  /** Tax saved by waiting past 12 months (under_12 − over_12; ≥ 0) */
  tax_saved_waiting: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function ownershipShares(input: CgtInput): { roham: number; fara: number } {
  switch (input.ownership_preset) {
    case 'roham_100':  return { roham: 1, fara: 0 };
    case 'fara_100':   return { roham: 0, fara: 1 };
    case 'split_50_50': return { roham: 0.5, fara: 0.5 };
    case 'custom': {
      const r = Math.max(0, Math.min(100, input.custom_roham_pct ?? 50)) / 100;
      return { roham: r, fara: 1 - r };
    }
  }
}

/**
 * Scenario-mode override flags. Allows the UI to force a result for a "what if"
 * — e.g. "tax payable if I sold this under 12 months even though I haven't yet"
 * or "tax payable if I waited past 12 months".
 */
export interface CgtComputeOptions {
  /** When set, OVERRIDES the actual days-held with this value (used for under_12 / over_12 hypotheticals). */
  forcedDaysHeld?: number;
  /** When true, force discount factor to 0 (used for under_12 hypothetical). */
  forceNoDiscount?: boolean;
  /** When true, force discount factor to 0.5 if eligible by holding-type (used for over_12 hypothetical). */
  forceDiscount?: boolean;
}

/**
 * Compute one CGT scenario.
 * Treats buying + selling costs as eligible cost-base components by default.
 */
export function computeCgtScenario(
  input: CgtInput,
  opts: CgtComputeOptions = {},
): CgtScenarioResult {
  const purchasePrice = Math.max(0, input.purchase_price || 0);
  const sellingPrice  = Math.max(0, input.selling_price || 0);
  const buyingCosts   = Math.max(0, input.buying_costs || 0);
  const sellingCosts  = Math.max(0, input.selling_costs || 0);

  const cost_base = purchasePrice + buyingCosts + sellingCosts;
  const rawGain   = sellingPrice - cost_base;
  const gross_gain    = Math.max(0, rawGain);
  const capital_loss  = rawGain < 0 ? -rawGain : 0;

  const actualDays = daysBetween(input.purchase_date, input.selling_date);
  const days_held  = opts.forcedDaysHeld != null ? opts.forcedDaysHeld : actualDays;
  const heldAtLeast12Mo = days_held >= 365;

  // CGT discount: 50% for individuals/Australian trusts holding ≥ 12 months.
  // Companies cannot use the discount.
  let discount_factor = 0;
  if (input.holding_type !== 'company') {
    if (opts.forceDiscount) discount_factor = 0.5;
    else if (opts.forceNoDiscount) discount_factor = 0;
    else if (heldAtLeast12Mo) discount_factor = 0.5;
  }
  const eligible_for_discount = discount_factor > 0;

  // ── Tax calc ────────────────────────────────────────────────────────────────
  let total_cgt_payable = 0;
  const shares: CgtPersonShare[] = [];

  if (input.holding_type === 'company') {
    // Companies: no discount. Apply flat company tax rate (default 25% base-rate entity).
    const rate = input.company_tax_rate ?? 0.25;
    total_cgt_payable = gross_gain * rate;
  } else {
    // Personal / Trust: split per ownership and add to each owner's marginal income.
    const o = ownershipShares(input);
    const owners: Array<{ label: 'Roham' | 'Fara'; share: number; income: number }> = [
      { label: 'Roham', share: o.roham, income: Math.max(0, input.roham_other_income || 0) },
      { label: 'Fara',  share: o.fara,  income: Math.max(0, input.fara_other_income  || 0) },
    ];
    for (const { label, share, income } of owners) {
      if (share <= 0) continue;
      const allocated_gain   = gross_gain * share;
      const discounted_gain  = allocated_gain * (1 - discount_factor);
      const baseline_tax     = calcIncomeTax(income, input.tax_year);
      const tax_with_gain    = calcIncomeTax(income + discounted_gain, input.tax_year);
      const cgt_payable      = Math.max(0, tax_with_gain - baseline_tax);
      total_cgt_payable     += cgt_payable;
      shares.push({
        owner: label, share, allocated_gain, discounted_gain,
        other_income: income, baseline_tax, tax_with_gain, cgt_payable,
      });
    }
  }

  const net_cash_before_tax = sellingPrice - sellingCosts;
  const net_cash_after_tax  = net_cash_before_tax - total_cgt_payable;

  const roi_pct = cost_base > 0 ? (sellingPrice - cost_base) / cost_base : 0;
  const yearsHeld = days_held / 365.25;
  let annualised_return_pct = 0;
  if (cost_base > 0 && yearsHeld > 0 && sellingPrice > 0) {
    annualised_return_pct = Math.pow(sellingPrice / cost_base, 1 / yearsHeld) - 1;
  }

  return {
    days_held,
    eligible_for_discount,
    discount_factor,
    cost_base,
    gross_gain,
    capital_loss,
    shares,
    total_cgt_payable,
    net_cash_before_tax,
    net_cash_after_tax,
    roi_pct,
    annualised_return_pct,
  };
}

/**
 * Compute the headline three-way comparison: under-12, actual, over-12.
 * Used by the simulator's premium comparison cards.
 */
export function computeCgtComparison(input: CgtInput): CgtComparison {
  const actual = computeCgtScenario(input);
  const under_12_months = computeCgtScenario(input, {
    forcedDaysHeld: 364, forceNoDiscount: true,
  });
  const over_12_months = computeCgtScenario(input, {
    forcedDaysHeld: Math.max(actual.days_held, 366), forceDiscount: true,
  });
  const tax_saved_waiting = Math.max(0, under_12_months.total_cgt_payable - over_12_months.total_cgt_payable);
  return { under_12_months, actual, over_12_months, tax_saved_waiting };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultCgtInput(): CgtInput {
  const today = new Date();
  const purchase = new Date(today);
  purchase.setFullYear(purchase.getFullYear() - 2);
  return {
    property_name: 'Investment Property',
    purchase_price: 700_000,
    purchase_date: purchase.toISOString().slice(0, 10),
    selling_price: 850_000,
    selling_date: today.toISOString().slice(0, 10),
    selling_costs: 18_000,
    buying_costs: 35_000,
    ownership_preset: 'split_50_50',
    custom_roham_pct: 50,
    roham_other_income: 180_000,
    fara_other_income: 90_000,
    holding_type: 'personal',
    state: 'QLD',
    tax_year: '2025-26',
    company_tax_rate: 0.25,
  };
}

// ─── Forecast-impact event (consumed by central forecast where supported) ─────

/**
 * Lightweight cash-event description emitted when a scenario is marked
 * "Use in Forecast". Designed to be compatible with the existing
 * `eventProcessor.CashEvent` shape — but we intentionally export a
 * simulator-specific type so downstream modules can opt in incrementally.
 */
export interface CgtForecastImpact {
  scenarioId: string;
  scenarioName: string;
  saleDate: string;          // YYYY-MM-DD
  /** Net sale proceeds (= selling_price − selling_costs). Goes into cash on sale-month. */
  saleProceeds: number;
  /** Total CGT payable across owners — usually due at end of the financial year. */
  cgtPayable: number;
  /** YYYY-MM-DD when CGT lands. Defaults to 30-Jun in the financial year following the sale. */
  cgtDueDate: string;
  /** Owner breakdown to help downstream tax-alpha module split the burden. */
  cgtPerOwner: Array<{ owner: 'Roham' | 'Fara'; amount: number }>;
  /** When true, downstream consumer should remove rental income + IP mortgage from this date. */
  removeRentalAndMortgage: boolean;
}

/** Compute a default CGT due-date: 31 May of the financial year following the sale. */
export function defaultCgtDueDate(saleDateIso: string): string {
  const d = new Date(saleDateIso);
  if (Number.isNaN(d.getTime())) return saleDateIso;
  // AU FY runs 1 Jul → 30 Jun. Tax return generally lodged by 31 Oct, balance due ~21 Nov.
  // Use 21 Nov following the FY end as the conservative cash-out date.
  const m = d.getMonth(); // 0-indexed
  const fyEndYear = m >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `${fyEndYear}-11-21`;
}

export function buildCgtForecastImpact(
  scenarioId: string,
  scenarioName: string,
  input: CgtInput,
  result: CgtScenarioResult,
): CgtForecastImpact {
  return {
    scenarioId,
    scenarioName,
    saleDate: input.selling_date,
    saleProceeds: result.net_cash_before_tax,
    cgtPayable: result.total_cgt_payable,
    cgtDueDate: defaultCgtDueDate(input.selling_date),
    cgtPerOwner: result.shares.map(s => ({ owner: s.owner, amount: s.cgt_payable })),
    removeRentalAndMortgage: true,
  };
}
