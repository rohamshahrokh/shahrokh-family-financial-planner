/**
 * Autonomous Financial OS — deterministic detectors
 *
 * All seven detectors are pure functions of OSInputs. They each return zero
 * or more findings; when key inputs are missing they emit nothing rather
 * than fabricating advice. Outputs are intended to be consumed by the
 * recommendation V2 adapter so all advice surfaces flow through the engine.
 */

import type { OSFinding, OSInputs } from './types';

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// 1. Refinance Detector
export function detectRefinanceOpportunity(i: OSInputs): OSFinding[] {
  const findings: OSFinding[] = [];
  if (!isNum(i.mortgageRate) || !isNum(i.mortgage) || i.mortgage <= 0) return findings;

  // High mortgage rate (absolute).
  if (i.mortgageRate >= 0.07) {
    findings.push({
      id: 'refi_high_rate',
      detector: 'refinance',
      severity: 'elevated',
      title: 'Mortgage rate is high vs available market',
      detail: `Current rate ${(i.mortgageRate * 100).toFixed(2)}% is above the 7% threshold — refinance candidates likely.`,
      quantifiedImpact: { dollarPerYear: Math.round(i.mortgage * 0.0075), label: 'Indicative annual saving' },
      hints: { actionType: 'refinance_restructure', pillar: 'stabilise_leverage', urgency: 'this_quarter', surfaces: ['action_centre', 'debt'] },
      drivers: ['mortgage rate ≥ 7%'],
      confidence: 0.85,
    });
  }

  // Market-rate-based opportunity.
  if (isNum(i.marketMortgageRate) && i.mortgageRate - i.marketMortgageRate >= 0.005) {
    const spread = i.mortgageRate - i.marketMortgageRate;
    findings.push({
      id: 'refi_market_spread',
      detector: 'refinance',
      severity: spread >= 0.01 ? 'elevated' : 'watch',
      title: 'Refinance spread vs market is meaningful',
      detail: `Your rate is ${(spread * 100).toFixed(2)}pp above the indicative market rate — worth a refinance review.`,
      quantifiedImpact: { dollarPerYear: Math.round(i.mortgage * spread), label: 'Potential annual interest saving' },
      hints: { actionType: 'refinance_restructure', pillar: 'stabilise_leverage', urgency: spread >= 0.01 ? 'this_quarter' : 'this_year', surfaces: ['action_centre', 'debt'] },
      drivers: [`market spread ${(spread * 100).toFixed(2)}pp`],
      confidence: 0.9,
    });
  }

  // Offset inefficiency.
  if (isNum(i.offsetBalance) && isNum(i.cashOutsideOffset) && i.cashOutsideOffset > 20_000) {
    findings.push({
      id: 'refi_offset_inefficient',
      detector: 'refinance',
      severity: 'watch',
      title: 'Cash sitting outside offset',
      detail: `~${fmt(i.cashOutsideOffset)} is held outside offset — moving the bulk into offset captures the mortgage rate tax-free.`,
      quantifiedImpact: {
        dollarPerYear: Math.round(i.cashOutsideOffset * (i.mortgageRate ?? 0.06)),
        label: 'Tax-free saving per year',
      },
      hints: { actionType: 'hold_cash_offset', pillar: 'preserve_tax_efficiency', urgency: 'this_quarter', surfaces: ['action_centre', 'tax'] },
      drivers: ['cash outside offset > $20k'],
      confidence: 0.95,
    });
  }
  return findings;
}

// 2. Liquidity Stress Detector
export function detectLiquidityStress(i: OSInputs): OSFinding[] {
  const findings: OSFinding[] = [];
  const cash = (i.cashOutsideOffset ?? 0) + (i.offsetBalance ?? 0);
  const monthlyExp = isNum(i.monthlyExpenses) ? i.monthlyExpenses : null;
  const buffer = monthlyExp && monthlyExp > 0 ? cash / monthlyExp : null;
  const target = i.emergencyBufferTarget ?? null;

  if (buffer !== null && buffer < 3) {
    findings.push({
      id: 'liq_buffer_weak',
      detector: 'liquidity_stress',
      severity: buffer < 1.5 ? 'critical' : 'elevated',
      title: 'Emergency buffer is below 3 months',
      detail: `Current liquid runway is ${buffer.toFixed(1)} months. Rebuild to at least the target before deploying surplus.`,
      hints: { actionType: 'build_emergency_buffer', pillar: 'protect_liquidity', urgency: 'immediate', surfaces: ['best_move', 'action_centre', 'risk'] },
      drivers: [`runway = ${buffer.toFixed(1)} months`],
      confidence: 0.95,
    });
  }

  if (isNum(i.upcoming12moCashLow) && i.upcoming12moCashLow < 0) {
    findings.push({
      id: 'liq_neg_cash_window',
      detector: 'liquidity_stress',
      severity: 'elevated',
      title: 'Negative cash window forecast within 12 months',
      detail: `Projected low cash point: ${fmt(i.upcoming12moCashLow)}. Smooth the cashflow before it bites.`,
      hints: { actionType: 'improve_cashflow', pillar: 'protect_liquidity', urgency: 'this_quarter', surfaces: ['action_centre', 'risk'] },
      drivers: ['12mo cash low < $0'],
      confidence: 0.9,
    });
  }

  if (target && cash < target * 0.6 && monthlyExp) {
    findings.push({
      id: 'liq_below_target',
      detector: 'liquidity_stress',
      severity: 'watch',
      title: 'Cash is well below buffer target',
      detail: `Cash ${fmt(cash)} vs target ${fmt(target)} — leverage decisions should wait until buffer is restored.`,
      hints: { actionType: 'build_emergency_buffer', pillar: 'protect_liquidity', urgency: 'this_quarter', surfaces: ['risk', 'action_centre'] },
      confidence: 0.85,
    });
  }

  // Dangerous leverage timing.
  if (isNum(i.mortgage) && isNum(i.ppor) && i.ppor > 0) {
    const lvr = i.mortgage / i.ppor;
    if (lvr > 0.75 && buffer !== null && buffer < 4) {
      findings.push({
        id: 'liq_dangerous_leverage',
        detector: 'liquidity_stress',
        severity: 'elevated',
        title: 'High LVR with thin liquidity',
        detail: `LVR ${(lvr * 100).toFixed(0)}% with ${buffer.toFixed(1)}mo buffer — vulnerable to rate/income shocks.`,
        hints: { actionType: 'reduce_leverage', pillar: 'stabilise_leverage', urgency: 'this_quarter', surfaces: ['risk', 'debt'] },
        drivers: [`LVR ${(lvr * 100).toFixed(0)}%`, `buffer ${buffer.toFixed(1)}mo`],
        confidence: 0.9,
      });
    }
  }

  return findings;
}

// 3. FIRE Drift Detector
export function detectFireDrift(i: OSInputs): OSFinding[] {
  const out: OSFinding[] = [];
  if (isNum(i.fireMonthlyInvestmentRequired) && isNum(i.monthlyInvestActual)) {
    const gap = i.fireMonthlyInvestmentRequired - i.monthlyInvestActual;
    if (gap > 100) {
      out.push({
        id: 'fire_underinvesting',
        detector: 'fire_drift',
        severity: gap > 1500 ? 'elevated' : 'watch',
        title: 'Under-investing vs FIRE plan',
        detail: `Investing ${fmt(i.monthlyInvestActual)}/mo vs required ${fmt(i.fireMonthlyInvestmentRequired)}/mo. Gap ${fmt(gap)}/mo.`,
        quantifiedImpact: { dollarPerYear: Math.round(gap * 12), label: 'Annual shortfall to FIRE plan' },
        hints: { actionType: 'fire_acceleration', pillar: 'improve_fire_timeline', urgency: 'this_quarter', surfaces: ['fire', 'action_centre'] },
        confidence: 0.9,
      });
    }
  }
  if (isNum(i.fireYearsToTarget) && i.fireYearsToTarget > 25) {
    out.push({
      id: 'fire_year_slipping',
      detector: 'fire_drift',
      severity: 'watch',
      title: 'FIRE timeline is long',
      detail: `Current trajectory: ${i.fireYearsToTarget.toFixed(1)} years to FIRE. Surplus deployment / tax-advantaged contributions can compress this.`,
      hints: { actionType: 'fire_acceleration', pillar: 'improve_fire_timeline', urgency: 'this_year', surfaces: ['fire'] },
      confidence: 0.8,
    });
  }
  if (isNum(i.expenseInflationLast12moPct) && i.expenseInflationLast12moPct > 0.06) {
    out.push({
      id: 'fire_lifestyle_inflation',
      detector: 'fire_drift',
      severity: 'watch',
      title: 'Lifestyle inflation outpacing CPI',
      detail: `Expenses up ${(i.expenseInflationLast12moPct * 100).toFixed(1)}% YoY — pushes FIRE number higher every year.`,
      hints: { actionType: 'improve_cashflow', pillar: 'maintain_investing_discipline', urgency: 'this_quarter', surfaces: ['fire', 'action_centre'] },
      confidence: 0.75,
    });
  }
  return out;
}

// 4. Property Readiness Detector
export function detectPropertyReadiness(i: OSInputs): OSFinding[] {
  const out: OSFinding[] = [];
  const buffer = (i.cashOutsideOffset ?? 0) + (i.offsetBalance ?? 0);
  const expenses = i.monthlyExpenses ?? 0;
  const months = expenses > 0 ? buffer / expenses : null;

  const deposit = i.depositReadinessPct ?? null;
  const servicing = i.serviceabilityHeadroomMonthly ?? null;
  const liquidity = i.postPurchaseBufferMonths ?? months;
  const strategyReady = i.hasIPStrategy === true;

  const gates: Array<{ k: string; ok: boolean; reason: string }> = [];
  if (deposit !== null) gates.push({ k: 'deposit', ok: deposit >= 0.95, reason: deposit >= 0.95 ? `${Math.round(deposit * 100)}% of deposit ready` : `only ${Math.round(deposit * 100)}% of deposit ready` });
  if (servicing !== null) gates.push({ k: 'serviceability', ok: servicing >= 500, reason: servicing >= 500 ? `serviceability headroom ${fmt(servicing)}/mo` : `serviceability headroom only ${fmt(servicing)}/mo` });
  if (liquidity !== null) gates.push({ k: 'liquidity', ok: liquidity >= 3, reason: liquidity >= 3 ? `${liquidity.toFixed(1)}mo post-purchase buffer` : `${liquidity.toFixed(1)}mo post-purchase buffer (need ≥3)` });
  gates.push({ k: 'strategy', ok: strategyReady, reason: strategyReady ? 'IP strategy documented' : 'IP strategy not documented yet' });

  if (gates.length === 0) return out;
  const allOk = gates.every((g) => g.ok);
  out.push({
    id: 'property_readiness_summary',
    detector: 'property_readiness',
    severity: allOk ? 'info' : 'watch',
    title: allOk ? 'Property purchase gates clear' : 'Property purchase: not all gates clear',
    detail: gates.map((g) => `${g.ok ? '✓' : '✗'} ${g.reason}`).join(' · '),
    hints: {
      actionType: allOk ? 'proceed_property_purchase' : 'delay_property_purchase',
      pillar: 'maximise_wealth',
      urgency: allOk ? 'this_year' : 'monitor',
      surfaces: ['property', 'action_centre'],
    },
    drivers: gates.filter((g) => !g.ok).map((g) => g.reason),
    confidence: 0.85,
  });
  return out;
}

// 5. Debt Priority Detector
export function detectDebtPriority(i: OSInputs): OSFinding[] {
  const out: OSFinding[] = [];
  const tax = i.marginalTaxRate ?? 0.325;
  const etfAfterTax = isNum(i.etfExpectedReturn) ? i.etfExpectedReturn * (1 - tax * 0.5) : null;
  const personal = i.personalDebtRate ?? null;
  const mortgage = i.mortgageRate ?? null;

  if (isNum(personal) && etfAfterTax !== null && personal > etfAfterTax) {
    out.push({
      id: 'debt_personal_dominates',
      detector: 'debt_priority',
      severity: 'elevated',
      title: 'High-interest debt beats investing',
      detail: `Personal/credit debt at ${(personal * 100).toFixed(1)}% > ETF after-tax expected ${(etfAfterTax * 100).toFixed(1)}%. Pay it down first.`,
      hints: { actionType: 'pay_high_interest_debt', pillar: 'reduce_high_interest_debt', urgency: 'immediate', surfaces: ['best_move', 'debt', 'action_centre'] },
      confidence: 0.95,
    });
  }
  if (isNum(mortgage) && etfAfterTax !== null) {
    if (mortgage >= etfAfterTax + 0.005) {
      out.push({
        id: 'debt_mortgage_vs_etf',
        detector: 'debt_priority',
        severity: 'watch',
        title: 'Mortgage offset edges out ETF on a risk-adjusted basis',
        detail: `Mortgage ${(mortgage * 100).toFixed(2)}% vs ETF after-tax ${(etfAfterTax * 100).toFixed(2)}%. Offset is risk-free and tax-free.`,
        hints: { actionType: 'hold_cash_offset', pillar: 'preserve_tax_efficiency', urgency: 'this_quarter', surfaces: ['debt', 'action_centre'] },
        confidence: 0.85,
      });
    } else if (etfAfterTax > mortgage + 0.01) {
      out.push({
        id: 'debt_etf_dominates',
        detector: 'debt_priority',
        severity: 'info',
        title: 'ETF DCA dominates extra mortgage paydown',
        detail: `ETF after-tax ${(etfAfterTax * 100).toFixed(2)}% > mortgage ${(mortgage * 100).toFixed(2)}%. Lean ETF DCA on the surplus.`,
        hints: { actionType: 'etf_dca', pillar: 'maximise_wealth', urgency: 'this_quarter', surfaces: ['action_centre', 'fire'] },
        confidence: 0.8,
      });
    }
  }
  return out;
}

// 6. Opportunity Window Detector
export function detectOpportunityWindows(i: OSInputs): OSFinding[] {
  const out: OSFinding[] = [];
  if (i.rateRegime === 'cutting') {
    out.push({
      id: 'opp_rate_cuts',
      detector: 'opportunity_window',
      severity: 'watch',
      title: 'Rate-cut regime — refinance + duration window',
      detail: 'Falling rates expand serviceability and lift asset valuations. Consider refinance and rebalancing.',
      hints: { actionType: 'refinance_restructure', pillar: 'stabilise_leverage', urgency: 'this_quarter', surfaces: ['action_centre', 'debt'] },
      confidence: 0.7,
    });
  }
  if (isNum(i.marketDrawdownPct) && i.marketDrawdownPct >= 0.15) {
    out.push({
      id: 'opp_undervaluation',
      detector: 'opportunity_window',
      severity: 'info',
      title: 'Equity drawdown — DCA tailwind',
      detail: `Market down ~${Math.round(i.marketDrawdownPct * 100)}%. DCA discipline outperforms attempts to time the bottom.`,
      hints: { actionType: 'etf_dca', pillar: 'maintain_investing_discipline', urgency: 'this_quarter', surfaces: ['action_centre', 'fire'] },
      confidence: 0.75,
    });
  }
  if (isNum(i.monthlySurplus) && i.monthlySurplus > 4000) {
    out.push({
      id: 'opp_strong_surplus',
      detector: 'opportunity_window',
      severity: 'info',
      title: 'Strong cashflow window',
      detail: `Monthly surplus ${fmt(i.monthlySurplus)} — sustained deployment will materially shift FIRE timeline.`,
      hints: { actionType: 'etf_dca', pillar: 'improve_fire_timeline', urgency: 'this_quarter', surfaces: ['fire', 'action_centre'] },
      confidence: 0.8,
    });
  }
  return out;
}

// 7. Concentration Risk Detector
export function detectConcentrationRisk(i: OSInputs): OSFinding[] {
  const out: OSFinding[] = [];
  const nw = i.totalNetWorth ?? 0;
  if (nw <= 0) return out;
  const propertyShare = (i.propertyEquity ?? 0) / nw;
  const cryptoShare = (i.cryptoValue ?? 0) / nw;
  const etfShare = (i.etfValue ?? 0) / nw;

  if (propertyShare > 0.75) {
    out.push({
      id: 'conc_property_heavy',
      detector: 'concentration_risk',
      severity: 'elevated',
      title: 'Net worth heavily concentrated in property',
      detail: `${Math.round(propertyShare * 100)}% of net worth is property equity. Diversify into liquid assets over time.`,
      hints: { actionType: 'rebalance_portfolio', pillar: 'stabilise_leverage', urgency: 'this_year', surfaces: ['risk', 'action_centre'] },
      confidence: 0.9,
    });
  }
  if (cryptoShare > 0.25) {
    out.push({
      id: 'conc_crypto_heavy',
      detector: 'concentration_risk',
      severity: 'elevated',
      title: 'Crypto exposure is large for net worth',
      detail: `${Math.round(cryptoShare * 100)}% of net worth in crypto — consider trimming into ETFs.`,
      hints: { actionType: 'rebalance_portfolio', pillar: 'maximise_wealth', urgency: 'this_quarter', surfaces: ['risk', 'action_centre'] },
      confidence: 0.85,
    });
  }
  if (etfShare < 0.05 && nw > 250_000) {
    out.push({
      id: 'conc_etf_thin',
      detector: 'concentration_risk',
      severity: 'watch',
      title: 'ETF exposure is thin',
      detail: `ETF share of net worth ${Math.round(etfShare * 100)}%. Long-horizon compounding benefits from a meaningful ETF allocation.`,
      hints: { actionType: 'etf_dca', pillar: 'maintain_investing_discipline', urgency: 'this_year', surfaces: ['fire', 'action_centre'] },
      confidence: 0.7,
    });
  }
  return out;
}
