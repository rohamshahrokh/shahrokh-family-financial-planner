/**
 * propertyTimelineBuilder.ts
 *
 * Sprint 2C — pure presentation helper. Consumes the existing
 * `projectProperty()` and `calcNegativeGearing()` outputs from finance.ts
 * (no new engines) and reshapes them into a 30-year annual journey view
 * for the Property Performance Timeline / Gantt View.
 *
 * For each year we expose:
 *   - year
 *   - propertyValue
 *   - loanBalance
 *   - equity
 *   - annualCashflow         (pre-tax — directly from projectProperty)
 *   - cumulativeCashflow     (running sum of pre-tax annual cashflow)
 *   - taxRefund              (NG tax benefit, $/yr; 0 when quarantined)
 *   - afterTaxCashflow       (annual + tax refund / loss-bank effect)
 *   - cumulativeAfterTax     (running sum of after-tax annual cashflow)
 *   - lossBankBalance        (running loss-bank balance for the property)
 *   - tone: 'negative' | 'breakeven' | 'positive'
 *   - isFirstPositiveYear: true once cumulativeAfterTax crosses 0
 *
 * This module does NOT compute any new tax/forecast logic — it composes the
 * existing engine outputs into a property-level journey view.
 */

import {
  projectProperty,
  calcNegativeGearing,
  type PropertyProjection,
  type NGAnalysis,
} from './finance';

export type CashflowTone = 'negative' | 'breakeven' | 'positive';

export interface PropertyTimelinePoint {
  year: number;
  yearIndex: number;        // 1..N
  propertyValue: number;
  loanBalance: number;
  equity: number;
  annualCashflow: number;
  cumulativeCashflow: number;
  taxRefund: number;
  afterTaxCashflow: number;
  cumulativeAfterTax: number;
  lossBankBalance: number;
  tone: CashflowTone;
  isFirstPositiveYear: boolean;        // first year after-tax annual CF > 0
  isFirstCumulativeBreakeven: boolean; // first year cumulative after-tax >= 0
}

export interface PropertyTimelineSummary {
  propertyId: number | string;
  propertyName: string;
  years: number;
  firstPositiveYear?: number;
  firstCumulativeBreakevenYear?: number;
  totalAfterTaxCashflow: number;
  totalTaxRefund: number;
  totalLossBankBalanceFinal: number;
  finalEquity: number;
  finalLoanBalance: number;
  points: PropertyTimelinePoint[];
}

export interface BuildTimelineParams {
  property: any;
  /** Marginal tax rate as a fraction (0.37 default). Used to fade tax benefit
   * over time as loan amortises / depreciation drops. Optional. */
  marginalRate?: number;
  /** Combined household salary, drives the NG marginal-rate bracket lookup. */
  annualSalaryIncome?: number;
  /** Active tax-policy scenario for `calcNegativeGearing`. */
  scenario?: 'current_law' | 'proposed_reform' | 'custom';
  /** Joint ownership flag (mirrors NGSummary). */
  jointOwnership?: boolean;
  /** Tax refund mode (lump-sum / payg) — affects shape only, not totals. */
  refundMode?: 'lump-sum' | 'payg';
  /** Force a 30-year horizon regardless of `projection_years` on the row. */
  horizonYears?: number;
}

const TONE_TOLERANCE = 200; // $ band around 0 to treat as "breakeven"

function classifyTone(value: number): CashflowTone {
  if (value > TONE_TOLERANCE) return 'positive';
  if (value < -TONE_TOLERANCE) return 'negative';
  return 'breakeven';
}

/**
 * Build a 30-year (configurable) property journey. Returns an empty timeline
 * for non-investment / un-purchasable rows so the UI can render an empty
 * state without conditional ceremony at the call-site.
 */
export function buildPropertyTimeline(
  params: BuildTimelineParams,
): PropertyTimelineSummary {
  const horizonYears = params.horizonYears ?? 30;
  const p = params.property ?? {};
  const empty: PropertyTimelineSummary = {
    propertyId: p?.id ?? '',
    propertyName: p?.name || p?.address || `Property ${p?.id ?? ''}`,
    years: 0,
    totalAfterTaxCashflow: 0,
    totalTaxRefund: 0,
    totalLossBankBalanceFinal: 0,
    finalEquity: 0,
    finalLoanBalance: 0,
    points: [],
  };
  if (!p || !p.current_value || p.type === 'ppor') return empty;

  // 1) Engine output #1 — annual property projection (existing engine).
  const proj: PropertyProjection[] = projectProperty({
    current_value:   Number(p.current_value)   || 0,
    loan_amount:     Number(p.loan_amount)     || 0,
    interest_rate:   Number(p.interest_rate)   || 6.5,
    loan_type:       String(p.loan_type || 'IO'),
    loan_term:       Number(p.loan_term)       || 30,
    weekly_rent:     Number(p.weekly_rent)     || 0,
    rental_growth:   Number(p.rental_growth)   || 3,
    vacancy_rate:    Number(p.vacancy_rate)    || 2,
    management_fee:  Number(p.management_fee)  || 7,
    council_rates:   Number(p.council_rates)   || 0,
    insurance:       Number(p.insurance)       || 0,
    maintenance:     Number(p.maintenance)     || 0,
    capital_growth:  Number(p.capital_growth)  || 4,
    projection_years: horizonYears,
  });

  // 2) Engine output #2 — first-year NG snapshot used for $ tax benefit and
  // loss-bank seed. Loss-bank growth in subsequent years is approximated by
  // applying the same per-year amount; this mirrors the existing NG engine
  // shape rather than introducing a new model. (Sprint 2C is presentation
  // only — see CLAUDE constraint.)
  let ngThisYear: NGAnalysis | undefined;
  try {
    const ng = calcNegativeGearing({
      properties: [{
        id:               Number(p.id) || 0,
        name:             p.name,
        address:          p.address,
        type:             p.type || 'investment',
        loan_amount:      Number(p.loan_amount)     || 0,
        interest_rate:    Number(p.interest_rate)   || 6.5,
        loan_type:        String(p.loan_type || 'IO'),
        loan_term:        Number(p.loan_term)       || 30,
        weekly_rent:      Number(p.weekly_rent)     || 0,
        vacancy_rate:     Number(p.vacancy_rate)    || 2,
        management_fee:   Number(p.management_fee)  || 7,
        council_rates:    Number(p.council_rates)   || 0,
        insurance:        Number(p.insurance)       || 0,
        maintenance:      Number(p.maintenance)     || 0,
        water_rates:      Number(p.water_rates)     || 0,
        body_corporate:   Number(p.body_corporate)  || 0,
        land_tax:         Number(p.land_tax)        || 0,
        purchase_price:   Number(p.purchase_price)  || Number(p.current_value) || 0,
        current_value:    Number(p.current_value)   || 0,
        ownership_share:  Number(p.ownership_share) || 1,
        depreciation_enabled: p.depreciation_enabled !== false,
        settlement_date:  p.settlement_date,
        purchase_date:    p.purchase_date,
        contract_date:    p.contract_date,
        property_type:    p.property_type,
        rental_start_date: p.rental_start_date,
        loss_bank_balance: Number(p.loss_bank_balance) || 0,
      }],
      annualSalaryIncome: params.annualSalaryIncome ?? 0,
      refundMode:    params.refundMode ?? 'lump-sum',
      jointOwnership: params.jointOwnership ?? false,
      scenario:      params.scenario ?? 'current_law',
    });
    ngThisYear = ng.properties[0];
  } catch {
    // If NG can't compute (e.g. missing fields), fall back to zero refund.
    ngThisYear = undefined;
  }

  const baseTaxRefund    = ngThisYear?.annualTaxBenefit ?? 0;
  const baseLossThisYear = ngThisYear?.lossAccumulatedThisYear ?? 0;
  const isQuarantined    = !!ngThisYear?.isQuarantined;
  const seedLossBank     = Number(p?.loss_bank_balance) || 0;

  let cumulativeCashflow = 0;
  let cumulativeAfterTax = 0;
  let lossBankBalance = seedLossBank;
  let firstPositiveYear: number | undefined;
  let firstCumulativeBreakevenYear: number | undefined;

  const points: PropertyTimelinePoint[] = proj.map((row, i) => {
    const yearIndex = i + 1;
    // Tax benefit fades as the loan amortises — scale by loan-balance ratio
    // versus initial loan. This is a presentation approximation that mirrors
    // how IO benefit decays naturally in the existing NG engine output.
    const initialLoan = proj[0]?.loanBalance || row.loanBalance || 1;
    const decay = Math.max(0, row.loanBalance / Math.max(1, initialLoan));
    const taxRefund = isQuarantined ? 0 : Math.round(baseTaxRefund * decay);
    // Loss bank only accumulates under quarantine; under current law it's
    // released via the annual refund (so it stays flat / decays via the
    // refund pathway).
    const lossThisYear = isQuarantined ? Math.round(baseLossThisYear * decay) : 0;
    lossBankBalance += lossThisYear;

    const annualCF       = row.netCashFlow;
    const afterTaxCF     = annualCF + taxRefund;
    cumulativeCashflow  += annualCF;
    cumulativeAfterTax  += afterTaxCF;

    const isFirstPositiveYear = firstPositiveYear === undefined && afterTaxCF > 0;
    if (isFirstPositiveYear) firstPositiveYear = row.year;
    const isFirstCumulativeBreakeven =
      firstCumulativeBreakevenYear === undefined && cumulativeAfterTax >= 0 && cumulativeCashflow + cumulativeAfterTax !== 0;
    if (isFirstCumulativeBreakeven) firstCumulativeBreakevenYear = row.year;

    return {
      year: row.year,
      yearIndex,
      propertyValue: row.value,
      loanBalance: row.loanBalance,
      equity: row.equity,
      annualCashflow: annualCF,
      cumulativeCashflow: Math.round(cumulativeCashflow),
      taxRefund,
      afterTaxCashflow: Math.round(afterTaxCF),
      cumulativeAfterTax: Math.round(cumulativeAfterTax),
      lossBankBalance: Math.round(lossBankBalance),
      tone: classifyTone(afterTaxCF),
      isFirstPositiveYear,
      isFirstCumulativeBreakeven,
    };
  });

  const last = points[points.length - 1];
  return {
    propertyId: p?.id ?? '',
    propertyName: p?.name || p?.address || `Property ${p?.id ?? ''}`,
    years: points.length,
    firstPositiveYear,
    firstCumulativeBreakevenYear,
    totalAfterTaxCashflow: last ? last.cumulativeAfterTax : 0,
    totalTaxRefund: points.reduce((s, x) => s + x.taxRefund, 0),
    totalLossBankBalanceFinal: last ? last.lossBankBalance : 0,
    finalEquity: last ? last.equity : 0,
    finalLoanBalance: last ? last.loanBalance : 0,
    points,
  };
}
