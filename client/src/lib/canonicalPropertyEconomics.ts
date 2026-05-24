/**
 * canonicalPropertyEconomics.ts — Sprint 4B
 *
 * Single source of truth for property after-tax economics:
 *
 *   - buildPropertyAfterTaxCashflows : assembles a strict t0 → tN cashflow
 *     vector for a single property given purchase, holding, and disposal
 *     parameters. NG benefit is applied EXACTLY ONCE per year (no double
 *     count), CGT is applied EXACTLY ONCE at sale (not bled across the
 *     holding period), and selling costs + outstanding debt repayment are
 *     netted out of the terminal proceeds before any return metric is
 *     computed.
 *
 *   - computePropertyIRR : Newton-Raphson IRR over the canonical cashflows.
 *
 * Every engine that previously rolled its own property IRR / NG / CGT must
 * route through these two functions — otherwise the figures drift and the
 * audit cycle keeps finding the same defects (Sprint 4B mandate).
 *
 * The helpers are pure and side-effect-free. All tax assumptions are passed
 * in so the same code can be reused under the current-law and reformed
 * regimes (the regime overlay only changes input parameters, never the
 * cashflow assembly).
 */

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface PropertyEconomicsInputs {
  /** Upfront */
  purchase_price: number;
  deposit: number;
  stamp_duty: number;
  /** Conveyancing, building inspection, loan setup — any non-deposit upfront cost. */
  other_upfront: number;

  /** Annual cashflow stream (length = horizon_years) */
  annual_rent: number[];
  annual_interest: number[];
  /** Total loan repayments (principal + interest) per year. */
  annual_repayment: number[];
  annual_holding: number[];
  annual_depreciation: number[];
  /** Property value at end of each year (for terminal sale & growth tracking). */
  property_value_end: number[];
  /** Loan balance at end of each year. */
  loan_balance_end: number[];

  /** Tax parameters */
  marginal_rate: number;          // e.g. 0.37
  /** Negative-gearing treatment.
   *  - 'deduct_against_wage' : current-law AU (loss × marginalRate refund)
   *  - 'quarantine'          : reform — losses carried forward, applied to
   *                             capital gain at disposal
   *  - 'abolish'             : no NG benefit, no carry forward
   */
  ng_treatment?: 'deduct_against_wage' | 'quarantine' | 'abolish';
  /** Effective CGT discount (fraction discounted off the gain — 0.5 = 50% off). */
  cgt_discount_pct: number;       // 0.5 typical (AU 12mo+ hold)
  /** Selling costs as fraction of property value (e.g. 0.02 = 2%). */
  selling_costs_pct: number;
  /** When true, CGT is applied at sale; when false (e.g. PPOR), no CGT. */
  apply_cgt_on_sale: boolean;
}

export interface PropertyCashflowYear {
  year: number;                    // 1-indexed
  annual_rent: number;
  annual_interest: number;
  annual_repayment: number;
  annual_holding: number;
  annual_depreciation: number;
  taxable_loss: number;            // rent - (interest + depreciation + holding)
  ng_benefit: number;              // dollars (0 when not negatively geared OR reform treatment != deduct)
  net_cash_after_tax: number;      // rent - repayment - holding + ng_benefit  (single-count NG)
  property_value_end: number;
  loan_balance_end: number;
  equity_end: number;
}

export interface PropertyCashflowResult {
  total_upfront: number;
  yearly: PropertyCashflowYear[];
  /** Terminal disposition values (year = horizon). */
  sale_proceeds_gross: number;     // = property_value_end[last]
  selling_costs: number;
  debt_repayment_at_sale: number;
  capital_gain_gross: number;      // value_end - purchase_price (pre-discount, pre-quarantine)
  carry_forward_losses_applied: number;
  capital_gain_taxable: number;    // after discount + quarantine application
  cgt_payable: number;
  /** Net cash to investor at disposal — after all of the above. */
  net_proceeds_after_tax: number;
  /** Canonical t0..tN cashflow vector for IRR. */
  cashflows: number[];
}

/* ─── Cashflow assembly ─────────────────────────────────────────────────── */

const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

export function buildPropertyAfterTaxCashflows(
  inp: PropertyEconomicsInputs,
): PropertyCashflowResult {
  const horizon = Math.min(
    inp.annual_rent.length,
    inp.annual_interest.length,
    inp.annual_repayment.length,
    inp.annual_holding.length,
    inp.annual_depreciation.length,
    inp.property_value_end.length,
    inp.loan_balance_end.length,
  );

  const totalUpfront = safe(inp.deposit) + safe(inp.stamp_duty) + safe(inp.other_upfront);
  const yearly: PropertyCashflowYear[] = [];
  const cashflows: number[] = [-totalUpfront];

  const treatment = inp.ng_treatment ?? 'deduct_against_wage';
  let carryForwardLosses = 0;

  for (let i = 0; i < horizon; i++) {
    const rent = safe(inp.annual_rent[i]);
    const interest = safe(inp.annual_interest[i]);
    const repayment = safe(inp.annual_repayment[i]);
    const holding = safe(inp.annual_holding[i]);
    const deprec = safe(inp.annual_depreciation[i]);

    // Tax: deductible expenses = interest + depreciation + holding costs
    // (loan principal is NOT deductible — only interest).
    const deductible = interest + deprec + holding;
    const taxableLoss = rent - deductible;
    const isNeg = taxableLoss < 0;
    const lossMag = Math.abs(taxableLoss);

    let ngBenefit = 0;
    if (isNeg) {
      if (treatment === 'deduct_against_wage') {
        ngBenefit = lossMag * safe(inp.marginal_rate);
      } else if (treatment === 'quarantine') {
        carryForwardLosses += lossMag;
        ngBenefit = 0;
      } else {
        ngBenefit = 0;
      }
    }

    // Single-count NG: net cash this year = rent - repayment - holding + ngBenefit.
    // This is the EXACT amount that hits the investor's bank account during the
    // year (P&I repayment covers both interest and principal). The previous
    // engines computed (equityGain + ngBenefit - annualCashLoss) which double-
    // counted ngBenefit (it was both subtracted from annualCashLoss and added
    // back). The canonical form here uses only the true cash event.
    const netCashAfterTax = rent - repayment - holding + ngBenefit;

    const valEnd = safe(inp.property_value_end[i]);
    const loanEnd = safe(inp.loan_balance_end[i]);

    yearly.push({
      year: i + 1,
      annual_rent: rent,
      annual_interest: interest,
      annual_repayment: repayment,
      annual_holding: holding,
      annual_depreciation: deprec,
      taxable_loss: taxableLoss,
      ng_benefit: ngBenefit,
      net_cash_after_tax: netCashAfterTax,
      property_value_end: valEnd,
      loan_balance_end: loanEnd,
      equity_end: valEnd - loanEnd,
    });

    cashflows.push(netCashAfterTax);
  }

  // ── Terminal disposition (CGT applied EXACTLY ONCE, at sale) ─────────────
  const last = yearly[yearly.length - 1];
  const saleProceeds = last ? last.property_value_end : 0;
  const sellingCosts = saleProceeds * safe(inp.selling_costs_pct);
  const debtAtSale = last ? last.loan_balance_end : 0;

  const grossGain = saleProceeds - sellingCosts - safe(inp.purchase_price);
  const carryApplied = Math.min(carryForwardLosses, Math.max(0, grossGain));
  const taxableGain = Math.max(0, grossGain - carryApplied);
  // CGT discount is a fraction discounted OFF the gain (0.5 = 50% off).
  const discountedTaxableGain = taxableGain * (1 - safe(inp.cgt_discount_pct));
  const cgtPayable = inp.apply_cgt_on_sale
    ? discountedTaxableGain * safe(inp.marginal_rate)
    : 0;

  // Net to investor at sale = proceeds − selling costs − debt repayment − CGT.
  // Repayment of debt at sale is itself a cash event (the bank takes its money)
  // separate from the operating-period repayments above.
  const netProceedsAfterTax = saleProceeds - sellingCosts - debtAtSale - cgtPayable;

  // Replace terminal cashflow: it should be operating-year cash PLUS net sale
  // proceeds. The yearly loop already pushed operating cash for the final
  // year; we add the terminal disposition cash here.
  if (cashflows.length > 0) {
    cashflows[cashflows.length - 1] += netProceedsAfterTax;
  }

  return {
    total_upfront: totalUpfront,
    yearly,
    sale_proceeds_gross: saleProceeds,
    selling_costs: sellingCosts,
    debt_repayment_at_sale: debtAtSale,
    capital_gain_gross: grossGain,
    carry_forward_losses_applied: carryApplied,
    capital_gain_taxable: discountedTaxableGain,
    cgt_payable: cgtPayable,
    net_proceeds_after_tax: netProceedsAfterTax,
    cashflows,
  };
}

/* ─── IRR (Newton-Raphson with bisection fallback) ──────────────────────── */

function npv(rate: number, cfs: number[]): number {
  let s = 0;
  for (let t = 0; t < cfs.length; t++) s += cfs[t] / Math.pow(1 + rate, t);
  return s;
}

function dNpv(rate: number, cfs: number[]): number {
  let s = 0;
  for (let t = 1; t < cfs.length; t++) {
    s -= (t * cfs[t]) / Math.pow(1 + rate, t + 1);
  }
  return s;
}

/**
 * Canonical property IRR. Operates on after-tax cashflows produced by
 * `buildPropertyAfterTaxCashflows` (or any equivalent t0..tN vector where
 * cashflows[0] is the net outflow at acquisition and the final entry already
 * includes the net sale proceeds after CGT and debt repayment).
 */
export function computePropertyIRR(cashflows: number[], guess = 0.08): number {
  if (cashflows.length < 2) return 0;
  // Newton-Raphson
  let rate = guess;
  for (let i = 0; i < 80; i++) {
    const f = npv(rate, cashflows);
    const df = dNpv(rate, cashflows);
    if (Math.abs(df) < 1e-12) break;
    const next = rate - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = next;
    if (rate < -0.99) { rate = -0.99; break; }
    if (rate > 10) { rate = 10; break; }
  }
  // Bisection fallback: bracket the root in [-0.99, 10].
  let lo = -0.99;
  let hi = 10.0;
  let fLo = npv(lo, cashflows);
  let fHi = npv(hi, cashflows);
  if (fLo * fHi > 0) return Number.isFinite(rate) ? rate : 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

/**
 * Convenience: compute IRR straight from PropertyEconomicsInputs. Returns
 * both the cashflow report and the IRR so callers don't need to invoke two
 * functions.
 */
export function computeCanonicalPropertyEconomics(
  inp: PropertyEconomicsInputs,
): PropertyCashflowResult & { irr: number } {
  const r = buildPropertyAfterTaxCashflows(inp);
  return { ...r, irr: computePropertyIRR(r.cashflows) };
}
