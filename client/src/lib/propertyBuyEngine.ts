/**
 * propertyBuyEngine.ts — Property Buy vs Wait Decision Engine (Australia)
 *
 * Evaluates three scenarios:
 *   A) Buy Now
 *   B) Wait 6 months
 *   C) Wait 12 months (or alternative location with different inputs)
 *
 * For each scenario, computes:
 *   - Net worth after N years (capital gain + equity - costs)
 *   - Equity created
 *   - Total cash invested (deposit + costs + holding shortfall)
 *   - Annual cashflow impact (net of rent, interest, NG benefit, outgoings)
 *   - IRR (using Newton-Raphson NPV solver)
 *   - Risk summary
 *   - Opportunity cost of waiting (property prices during delay)
 *   - Offset vs deposit tradeoff
 *
 * Data sources: passed in by caller — no Supabase reads in this file.
 * This keeps the engine pure/testable.
 *
 * Australian specifics:
 *   - Stamp duty (all states supported with heuristic tables)
 *   - Negative gearing: rental loss × marginal income tax rate
 *   - Depreciation: div 43 building allowance + div 40 fixtures (simplified)
 *   - Land tax: excluded (varies by state — user noted in output)
 *   - CGT discount: 50% for assets held > 12 months
 */

import { safeNum, calcMonthlyRepayment, calcLoanBalance, auMarginalRate } from './finance';

// ─── State stamp duty tables (AUS 2025-26) ──────────────────────────────────

type StateCode = 'QLD' | 'NSW' | 'VIC' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export const STATE_LABELS: Record<StateCode, string> = {
  QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria',
  SA: 'South Australia', WA: 'Western Australia', TAS: 'Tasmania',
  NT: 'Northern Territory', ACT: 'Australian Capital Territory',
};

/** Investor stamp duty (not FHOG-reduced) */
export function calcStampDuty(price: number, state: StateCode = 'QLD'): number {
  const p = Math.max(0, price);
  switch (state) {
    case 'QLD':
      if (p <= 5_000)   return p * 0.01;
      if (p <= 75_000)  return 50   + (p - 5_000)   * 0.015;
      if (p <= 540_000) return 1_075 + (p - 75_000)  * 0.035;
      if (p <= 1_000_000) return 17_325 + (p - 540_000) * 0.045;
      return 38_025 + (p - 1_000_000) * 0.0575;
    case 'NSW':
      if (p <= 14_000)   return p * 0.0125;
      if (p <= 32_000)   return 175   + (p - 14_000)  * 0.015;
      if (p <= 85_000)   return 445   + (p - 32_000)  * 0.0175;
      if (p <= 319_000)  return 1_372 + (p - 85_000)  * 0.035;
      if (p <= 1_064_000)return 9_562 + (p - 319_000) * 0.045;
      if (p <= 3_194_000)return 43_087 + (p - 1_064_000) * 0.055;
      return 164_022 + (p - 3_194_000) * 0.07;
    case 'VIC':
      if (p <= 25_000)   return p * 0.014;
      if (p <= 130_000)  return 350   + (p - 25_000)  * 0.024;
      if (p <= 440_000)  return 2_870 + (p - 130_000) * 0.05;
      if (p <= 550_000)  return 18_370 + (p - 440_000) * 0.06;
      if (p <= 960_000)  return 24_970 + (p - 550_000) * 0.06;
      return 55_000 + (p - 960_000) * 0.065;
    case 'SA':
      if (p <= 12_000)   return p * 0.01;
      if (p <= 30_000)   return 120   + (p - 12_000)  * 0.02;
      if (p <= 50_000)   return 480   + (p - 30_000)  * 0.03;
      if (p <= 100_000)  return 1_080 + (p - 50_000)  * 0.035;
      if (p <= 200_000)  return 2_830 + (p - 100_000) * 0.04;
      if (p <= 250_000)  return 6_830 + (p - 200_000) * 0.0425;
      if (p <= 300_000)  return 8_955 + (p - 250_000) * 0.0475;
      if (p <= 500_000)  return 11_330 + (p - 300_000) * 0.05;
      return 21_330 + (p - 500_000) * 0.055;
    case 'WA':
      if (p <= 80_000)   return p * 0.019;
      if (p <= 100_000)  return 1_520 + (p - 80_000)  * 0.0285;
      if (p <= 250_000)  return 2_090 + (p - 100_000) * 0.03;
      if (p <= 500_000)  return 6_590 + (p - 250_000) * 0.0385;
      if (p <= 1_000_000)return 16_215 + (p - 500_000) * 0.045;
      return 38_715 + (p - 1_000_000) * 0.0515;
    case 'TAS':
      if (p <= 3_000)    return p * 0.01;
      if (p <= 25_000)   return 30    + (p - 3_000)   * 0.015;
      if (p <= 75_000)   return 360   + (p - 25_000)  * 0.0225;
      if (p <= 200_000)  return 1_485 + (p - 75_000)  * 0.035;
      if (p <= 375_000)  return 5_860 + (p - 200_000) * 0.0375;
      if (p <= 725_000)  return 12_423 + (p - 375_000) * 0.04;
      return 26_423 + (p - 725_000) * 0.045;
    case 'NT':
      return p * 0.0495;   // simplified: NT uses a rebate formula, this is approx investor rate
    case 'ACT':
      if (p <= 260_000)  return 0.6   * p * 0.0029 + 1_040;  // simplified
      if (p <= 300_000)  return 2_240 + (p - 260_000) * 0.037;
      if (p <= 500_000)  return 3_720 + (p - 300_000) * 0.044;
      if (p <= 750_000)  return 12_520 + (p - 500_000) * 0.049;
      if (p <= 1_000_000)return 24_770 + (p - 750_000) * 0.054;
      return 38_270 + (p - 1_000_000) * 0.059;
    default:
      return calcStampDuty(p, 'QLD');
  }
}

// ─── IRR solver (Newton-Raphson) ──────────────────────────────────────────────

function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

function npvDerivative(rate: number, cashflows: number[]): number {
  return cashflows.reduce((acc, cf, t) =>
    t === 0 ? acc : acc - (t * cf) / Math.pow(1 + rate, t + 1), 0);
}

export function calcIRR(cashflows: number[], maxIter = 200, tol = 1e-7): number {
  // cashflows[0] = initial outflow (negative), cashflows[1..n] = annual net returns
  if (cashflows.length < 2) return 0;
  let rate = 0.1; // initial guess 10%
  for (let i = 0; i < maxIter; i++) {
    const f  = npv(rate, cashflows);
    const df = npvDerivative(rate, cashflows);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (Math.abs(next - rate) < tol) return next;
    rate = next;
    // Clamp to avoid divergence
    if (rate < -0.99) rate = -0.99;
    if (rate > 10)    rate = 10;
  }
  return rate;
}

// ─── Depreciation (simplified Div 43 + Div 40) ────────────────────────────────

export function estimateAnnualDepreciation(purchasePrice: number, buildYear = 2005): number {
  // Div 43 (building at 2.5%/yr on construction cost ~60% of purchase for modern builds)
  const constructionCost = purchasePrice * 0.60;
  const div43 = constructionCost * 0.025;
  // Div 40 (plant & fixtures — roughly 1.5% of purchase) — declines over time
  const age = Math.max(0, new Date().getFullYear() - buildYear);
  const div40 = age < 15 ? purchasePrice * 0.015 * (1 - age / 40) : 0;
  return div43 + div40;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoanType = 'PI' | 'IO';

export interface PropertyScenarioInput {
  label:              string;   // "Buy Now" / "Wait 6 months" / "Alternative"
  purchase_price:     number;
  deposit_pct:        number;   // e.g. 20
  state:              StateCode;
  loan_rate:          number;   // annual % e.g. 6.5
  loan_type:          LoanType;
  io_years:           number;   // only used for IO loans
  loan_term:          number;   // years e.g. 30
  weekly_rent:        number;
  rental_growth_pct:  number;   // e.g. 3
  capital_growth_pct: number;   // e.g. 6
  // Holding costs (annual)
  management_fee_pct: number;   // e.g. 8 (% of rent)
  council_rates:      number;
  insurance:          number;
  maintenance_pct:    number;   // % of purchase price e.g. 0.5
  body_corporate:     number;
  // Tax
  annual_salary:      number;   // gross
  has_depreciation:   boolean;
  build_year:         number;
  // Delay params (for Wait scenarios)
  delay_months:       number;   // 0 for Buy Now
  price_growth_during_wait_pct: number; // how much property grows during wait
  // Opportunity cost of deposit during wait
  deposit_investment_return_pct: number; // e.g. 9.5 (ETF) or 6.25 (offset)
  // Horizon
  horizon_years:      number;   // 5 or 10
  // User's PPOR offset balance (opportunity cost calc)
  offset_balance:     number;
  mortgage_rate:      number;   // PPOR mortgage rate
}

export interface YearlySnapshot {
  year:              number;
  property_value:    number;
  loan_balance:      number;
  equity:            number;
  annual_rent:       number;
  annual_interest:   number;
  annual_repayment:  number;
  annual_holding:    number;
  annual_depreciation: number;
  taxable_loss:      number;
  ng_benefit:        number;
  net_annual_cashflow: number;  // after NG benefit, before principal repayment (actual cash out of pocket)
  cumulative_cash_invested: number;
}

export interface ScenarioResult {
  label:               string;
  // Upfront
  purchase_price:      number;
  deposit:             number;
  stamp_duty:          number;
  other_upfront:       number;
  total_upfront:       number;
  loan_amount:         number;
  // Outcomes at horizon
  property_value_end:  number;
  loan_balance_end:    number;
  equity_end:          number;
  capital_gain:        number;
  cgt_discount_gain:   number;  // gain after 50% CGT discount
  // Cashflow
  avg_monthly_cashflow: number;  // net (negative = cost, positive = income)
  total_cash_invested:  number;  // deposit + costs + cumulative shortfall
  // Returns
  irr:                 number;   // annualised
  total_return_pct:    number;   // (equity_end - total_upfront) / total_upfront
  // Opportunity cost
  opportunity_cost_of_waiting: number;  // only meaningful for Wait scenarios
  offset_tradeoff:     number;   // annual saving lost by using deposit vs keeping in offset
  // Year-by-year
  yearly:              YearlySnapshot[];
  // Assessment
  confidence:          number;   // 0–100
  risk_level:          'Low' | 'Med' | 'High';
  risk_summary:        string;
  verdict:             string;   // 1-sentence decision summary
}

export interface PropertyBuyResult {
  buy_now:       ScenarioResult;
  wait_6m:       ScenarioResult;
  wait_12m:      ScenarioResult | null;  // null if alt scenario not provided
  best_scenario: 'buy_now' | 'wait_6m' | 'wait_12m';
  best_label:    string;
  confidence:    number;
  key_insight:   string;   // 1–2 sentence CFO-grade insight
  comparison_table: ComparisonRow[];
}

export interface ComparisonRow {
  metric:   string;
  buy_now:  string;
  wait_6m:  string;
  wait_12m: string;
}

// ─── Core scenario engine ─────────────────────────────────────────────────────

export function computePropertyScenario(inp: PropertyScenarioInput): ScenarioResult {
  const price       = safeNum(inp.purchase_price);
  const depositAmt  = price * (safeNum(inp.deposit_pct) / 100);
  const stampDuty   = calcStampDuty(price, inp.state);
  const legalFees   = 2_500;  // typical conveyancing + searches
  const loanSetup   = 1_000;
  const buildingInsp= 600;
  const otherUpfront= legalFees + loanSetup + buildingInsp;
  const totalUpfront= depositAmt + stampDuty + otherUpfront;
  const loanAmt     = price - depositAmt;
  const rateDecimal = safeNum(inp.loan_rate) / 100;
  const horizon     = Math.max(1, Math.round(safeNum(inp.horizon_years)));

  // Monthly repayment
  const isIO       = inp.loan_type === 'IO';
  const ioYrs      = Math.min(safeNum(inp.io_years), safeNum(inp.loan_term));
  const monthlyRep = isIO
    ? loanAmt * rateDecimal / 12
    : calcMonthlyRepayment(loanAmt, safeNum(inp.loan_rate), safeNum(inp.loan_term));

  const annualSalary   = safeNum(inp.annual_salary);
  const marginalRate   = auMarginalRate(annualSalary);

  // Annual depreciation
  const annualDeprec = inp.has_depreciation
    ? estimateAnnualDepreciation(price, safeNum(inp.build_year))
    : 0;

  // Year-by-year projection
  let propVal        = price;
  let loanBal        = loanAmt;
  let weeklyRent     = safeNum(inp.weekly_rent);
  let cumulativeCash = totalUpfront;
  const yearly: YearlySnapshot[] = [];

  let totalCFForIRR  = -(totalUpfront);  // initial outflow
  const irrCFs: number[] = [-(totalUpfront)];

  for (let y = 1; y <= horizon; y++) {
    // Growth
    propVal   *= 1 + safeNum(inp.capital_growth_pct) / 100;
    weeklyRent*= 1 + safeNum(inp.rental_growth_pct) / 100;
    const annualRent = weeklyRent * 52;

    // Loan balance & interest
    const monthsElapsed = y * 12;
    if (isIO && y <= ioYrs) {
      // IO period — loan balance unchanged
    } else {
      const piMonths = isIO ? Math.max(0, monthsElapsed - ioYrs * 12) : monthsElapsed;
      const piRate   = safeNum(inp.loan_rate);
      const piTerm   = isIO ? (safeNum(inp.loan_term) - ioYrs) : safeNum(inp.loan_term);
      loanBal = piTerm > 0
        ? calcLoanBalance(loanAmt, piRate, piTerm, piMonths)
        : 0;
    }
    const equity = propVal - loanBal;

    // Annual holding costs
    const annualInterest   = loanBal * rateDecimal;
    const annualMgmtFee    = annualRent * (safeNum(inp.management_fee_pct) / 100);
    const annualMaintenance= price * (safeNum(inp.maintenance_pct) / 100);
    const annualHolding    = annualMgmtFee + safeNum(inp.council_rates) + safeNum(inp.insurance) + annualMaintenance + safeNum(inp.body_corporate);

    // Tax: deductible expenses = interest + depreciation + holding costs
    const deductible   = annualInterest + annualDeprec + annualHolding;
    const taxableLoss  = annualRent - deductible;  // negative = loss (negatively geared)
    const isNegGeared  = taxableLoss < 0;
    const ngBenefit    = isNegGeared ? Math.abs(taxableLoss) * marginalRate : 0;

    // Net cash out of pocket this year
    // = repayments - rent + holding - NG benefit
    const annualRepayment  = monthlyRep * 12;
    const annualCashLoss   = annualRepayment - annualRent + annualHolding - ngBenefit;
    cumulativeCash        += Math.max(0, annualCashLoss);  // only count net outflows, not income

    // For IRR: annual net benefit = equity gain + NG benefit - net cash cost
    const equityGain    = propVal - (y === 1 ? price : yearly[y - 2].property_value);
    const annualBenefit = equityGain + ngBenefit - annualCashLoss;
    irrCFs.push(annualBenefit);

    yearly.push({
      year: y,
      property_value:         Math.round(propVal),
      loan_balance:           Math.round(Math.max(0, loanBal)),
      equity:                 Math.round(equity),
      annual_rent:            Math.round(annualRent),
      annual_interest:        Math.round(annualInterest),
      annual_repayment:       Math.round(annualRepayment),
      annual_holding:         Math.round(annualHolding),
      annual_depreciation:    Math.round(annualDeprec),
      taxable_loss:           Math.round(taxableLoss),
      ng_benefit:             Math.round(ngBenefit),
      net_annual_cashflow:    Math.round(-annualCashLoss),  // negative = cost
      cumulative_cash_invested: Math.round(cumulativeCash),
    });
  }

  const last            = yearly[yearly.length - 1];
  const capitalGain     = last.property_value - price;
  const cgtDiscountGain = capitalGain * 0.50;  // 50% CGT discount
  const avgMonthlyCF    = yearly.reduce((s, y) => s + y.net_annual_cashflow, 0) / horizon / 12;

  // IRR: add terminal value at horizon (equity proceeds - selling costs ~2%)
  const sellingCosts    = last.property_value * 0.02;
  irrCFs[irrCFs.length - 1] += last.equity - sellingCosts;
  const irr             = calcIRR(irrCFs);

  // Total return on upfront capital
  const totalReturn     = (last.equity - totalUpfront) / totalUpfront;

  // Opportunity cost of waiting (for Wait scenarios)
  // = how much the property price rose during the delay × (deposit/price ratio)
  const priceRiseWait   = price * (safeNum(inp.price_growth_during_wait_pct) / 100);
  const opportunityCost = inp.delay_months > 0
    ? priceRiseWait + depositAmt * (safeNum(inp.deposit_investment_return_pct) / 100) * (inp.delay_months / 12)
    : 0;
  // Note: for Wait scenarios this is a BENEFIT if deposit earns > property grows

  // Offset tradeoff: annual saving lost by pulling deposit from offset
  const offsetTradeoff  = depositAmt * (safeNum(inp.mortgage_rate) / 100);

  // Risk assessment
  const yieldGross   = (safeNum(inp.weekly_rent) * 52) / price * 100;
  const lvr          = (loanAmt / price) * 100;
  const cashflowNeg  = avgMonthlyCF < -2000;

  let riskLevel: 'Low' | 'Med' | 'High' = 'Med';
  let riskFactors: string[] = [];
  if (lvr > 80)       riskFactors.push(`High LVR ${lvr.toFixed(0)}% — LMI may apply`);
  if (yieldGross < 3) riskFactors.push(`Low gross yield ${yieldGross.toFixed(1)}% — negative cashflow likely`);
  if (inp.capital_growth_pct < 4) riskFactors.push('Conservative growth assumption — lower upside');
  if (cashflowNeg)    riskFactors.push('Significant monthly cashflow drag — requires income buffer');
  if (inp.loan_rate > 7.5) riskFactors.push('High interest rate — pressures cashflow significantly');

  if (riskFactors.length >= 3)    riskLevel = 'High';
  else if (riskFactors.length === 0) riskLevel = 'Low';

  const confidence = Math.max(30, Math.min(90,
    60
    + (yieldGross > 4 ? 10 : 0)
    + (lvr <= 70 ? 10 : lvr >= 80 ? -10 : 0)
    + (irr > 0.08 ? 10 : irr < 0.04 ? -10 : 0)
    - riskFactors.length * 5
  ));

  const fmt = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${Math.round(n/1_000)}K`;
  const verdict = `${inp.label}: equity of ${fmt(last.equity)} in ${horizon}yr at ${(irr * 100).toFixed(1)}% IRR — ${riskLevel} risk`;

  return {
    label:                inp.label,
    purchase_price:       price,
    deposit:              Math.round(depositAmt),
    stamp_duty:           Math.round(stampDuty),
    other_upfront:        Math.round(otherUpfront),
    total_upfront:        Math.round(totalUpfront),
    loan_amount:          Math.round(loanAmt),
    property_value_end:   last.property_value,
    loan_balance_end:     last.loan_balance,
    equity_end:           last.equity,
    capital_gain:         Math.round(capitalGain),
    cgt_discount_gain:    Math.round(cgtDiscountGain),
    avg_monthly_cashflow: Math.round(avgMonthlyCF),
    total_cash_invested:  last.cumulative_cash_invested,
    irr:                  isFinite(irr) ? irr : 0,
    total_return_pct:     isFinite(totalReturn) ? totalReturn : 0,
    opportunity_cost_of_waiting: Math.round(opportunityCost),
    offset_tradeoff:      Math.round(offsetTradeoff),
    yearly,
    confidence,
    risk_level:           riskLevel,
    risk_summary:         riskFactors.length > 0 ? riskFactors.join(' · ') : 'No major risk flags identified.',
    verdict,
  };
}

// ─── Compare all scenarios ────────────────────────────────────────────────────

export function computeAllScenarios(
  base: Omit<PropertyScenarioInput, 'label' | 'delay_months'>,
  wait6Overrides: Partial<PropertyScenarioInput> = {},
  wait12Input: Partial<PropertyScenarioInput> | null = null,
): PropertyBuyResult {

  const buyNowInput: PropertyScenarioInput = {
    ...base, label: 'Buy Now', delay_months: 0,
    price_growth_during_wait_pct: 0,
    deposit_investment_return_pct: safeNum(base.mortgage_rate) || 6.25,
  };

  // Wait 6m: property grows by ~3% (half of annual rate) during delay
  const growthRate6m = (safeNum(base.capital_growth_pct) / 100) * 0.5;
  const wait6Price   = base.purchase_price * (1 + growthRate6m);
  const wait6Input: PropertyScenarioInput = {
    ...base, label: 'Wait 6 Months', delay_months: 6,
    purchase_price: safeNum(wait6Overrides.purchase_price) || Math.round(wait6Price),
    price_growth_during_wait_pct: growthRate6m * 100,
    deposit_investment_return_pct: safeNum(base.deposit_investment_return_pct) || 9.5,
    ...wait6Overrides,
  };

  // Wait 12m: property grows by full annual rate
  const growthRate12m = safeNum(base.capital_growth_pct) / 100;
  const wait12Price   = base.purchase_price * (1 + growthRate12m);
  const defaultWait12: PropertyScenarioInput = {
    ...base, label: 'Wait 12 Months', delay_months: 12,
    purchase_price: Math.round(wait12Price),
    price_growth_during_wait_pct: growthRate12m * 100,
    deposit_investment_return_pct: safeNum(base.deposit_investment_return_pct) || 9.5,
  };
  const wait12Input2 = wait12Input ? { ...defaultWait12, ...wait12Input, label: wait12Input.label ?? 'Alternative / Wait 12m' } : defaultWait12;

  const buyNow  = computePropertyScenario(buyNowInput);
  const wait6   = computePropertyScenario(wait6Input);
  const wait12  = computePropertyScenario(wait12Input2);

  // Pick best by IRR (risk-adjusted: High risk penalised)
  const adjust = (s: ScenarioResult) =>
    s.irr * (s.risk_level === 'Low' ? 1 : s.risk_level === 'Med' ? 0.9 : 0.75);

  const scores = [
    { id: 'buy_now' as const, score: adjust(buyNow) },
    { id: 'wait_6m' as const, score: adjust(wait6) },
    { id: 'wait_12m' as const, score: adjust(wait12) },
  ].sort((a, b) => b.score - a.score);

  const bestId    = scores[0].id;
  const bestLabel = bestId === 'buy_now' ? buyNow.label : bestId === 'wait_6m' ? wait6.label : wait12.label;

  // Format helpers
  const fmt  = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${Math.round(n/1_000)}K`;
  const pct  = (n: number) => `${(n * 100).toFixed(1)}%`;
  const cf   = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}/mo`;

  // Key insight
  const winner = bestId === 'buy_now' ? buyNow : bestId === 'wait_6m' ? wait6 : wait12;
  const loser  = bestId === 'buy_now' ? wait12 : buyNow;
  const equityDiff = winner.equity_end - loser.equity_end;
  const irrDiff    = (winner.irr - loser.irr) * 100;

  const keyInsight = bestId === 'buy_now'
    ? `Buying now delivers ${fmt(equityDiff)} more equity than waiting 12 months ` +
      `(${irrDiff > 0 ? `+${irrDiff.toFixed(1)}%` : `${irrDiff.toFixed(1)}%`} IRR advantage). ` +
      `Property price growth during any wait period erodes your deposit's purchasing power.`
    : `Waiting ${bestId === 'wait_6m' ? '6 months' : '12 months'} is advantageous: ` +
      `your deposit earns ${pct(safeNum(base.deposit_investment_return_pct) / 100)} and ` +
      `property growth during the wait is slower than your investment return. ` +
      `Use the time to build a larger deposit and improve your borrowing position.`;

  const confidence = Math.round((buyNow.confidence + wait6.confidence + wait12.confidence) / 3);

  // Comparison table
  const comparison_table: ComparisonRow[] = [
    { metric: 'Purchase Price',         buy_now: fmt(buyNow.purchase_price),  wait_6m: fmt(wait6.purchase_price),  wait_12m: fmt(wait12.purchase_price) },
    { metric: 'Deposit Required',       buy_now: fmt(buyNow.deposit),         wait_6m: fmt(wait6.deposit),         wait_12m: fmt(wait12.deposit) },
    { metric: 'Stamp Duty',             buy_now: fmt(buyNow.stamp_duty),      wait_6m: fmt(wait6.stamp_duty),      wait_12m: fmt(wait12.stamp_duty) },
    { metric: 'Total Upfront',          buy_now: fmt(buyNow.total_upfront),   wait_6m: fmt(wait6.total_upfront),   wait_12m: fmt(wait12.total_upfront) },
    { metric: `Property Value (${base.horizon_years}yr)`, buy_now: fmt(buyNow.property_value_end), wait_6m: fmt(wait6.property_value_end), wait_12m: fmt(wait12.property_value_end) },
    { metric: `Equity (${base.horizon_years}yr)`,         buy_now: fmt(buyNow.equity_end),         wait_6m: fmt(wait6.equity_end),         wait_12m: fmt(wait12.equity_end) },
    { metric: 'Capital Gain',           buy_now: fmt(buyNow.capital_gain),    wait_6m: fmt(wait6.capital_gain),    wait_12m: fmt(wait12.capital_gain) },
    { metric: 'Avg Monthly Cashflow',   buy_now: cf(buyNow.avg_monthly_cashflow), wait_6m: cf(wait6.avg_monthly_cashflow), wait_12m: cf(wait12.avg_monthly_cashflow) },
    { metric: 'Total Cash Invested',    buy_now: fmt(buyNow.total_cash_invested), wait_6m: fmt(wait6.total_cash_invested), wait_12m: fmt(wait12.total_cash_invested) },
    { metric: 'IRR (annualised)',        buy_now: pct(buyNow.irr),             wait_6m: pct(wait6.irr),             wait_12m: pct(wait12.irr) },
    { metric: 'Risk Level',             buy_now: buyNow.risk_level,            wait_6m: wait6.risk_level,            wait_12m: wait12.risk_level },
    { metric: 'Confidence Score',       buy_now: `${buyNow.confidence}/100`,   wait_6m: `${wait6.confidence}/100`,   wait_12m: `${wait12.confidence}/100` },
  ];

  return {
    buy_now:       buyNow,
    wait_6m:       wait6,
    wait_12m:      wait12,
    best_scenario: bestId,
    best_label:    bestLabel,
    confidence,
    key_insight:   keyInsight,
    comparison_table,
  };
}

// ─── Default inputs (pre-filled from user's snapshot) ────────────────────────

export function defaultScenarioInputs(snap?: {
  monthly_income?: number;
  cash?: number;
  offset_balance?: number;
  mortgage?: number;
}): Omit<PropertyScenarioInput, 'label' | 'delay_months'> {
  const income = safeNum(snap?.monthly_income) * 12 || 264_000;
  return {
    purchase_price:               750_000,
    deposit_pct:                  20,
    state:                        'QLD',
    loan_rate:                    6.5,
    loan_type:                    'PI',
    io_years:                     5,
    loan_term:                    30,
    weekly_rent:                  550,
    rental_growth_pct:            3,
    capital_growth_pct:           6,
    management_fee_pct:           8,
    council_rates:                2_000,
    insurance:                    1_500,
    maintenance_pct:              0.5,
    body_corporate:               0,
    annual_salary:                income,
    has_depreciation:             true,
    build_year:                   2010,
    price_growth_during_wait_pct: 3,
    deposit_investment_return_pct: 9.5,
    horizon_years:                5,
    offset_balance:               safeNum(snap?.offset_balance) || 0,
    mortgage_rate:                6.25,
  };
}
