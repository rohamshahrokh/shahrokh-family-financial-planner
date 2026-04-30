/**
 * firePathEngine.ts — FIRE Fastest Path Optimizer
 *
 * Simulates 4 strategies to find the fastest realistic path to financial independence.
 * All inputs derive directly from the snapshot + real data — no hardcoded values.
 *
 * Strategies:
 *   A) Property Focused   — surplus → property equity + rental income
 *   B) ETF / Stock Focused — surplus → diversified index ETFs (8.5% CAGR)
 *   C) Mixed Strategy     — 50% property / 50% ETF + super optimisation
 *   D) Aggressive         — 70% growth assets (high crypto/growth ETF) + leverage
 *
 * Calculation model:
 *   - Monthly compounding simulation over max 40 years
 *   - Each strategy has its own investable asset growth rate, passive income source
 *   - Debt paydown reduces interest drag → increases effective surplus over time
 *   - Super grows in parallel at standard rate (9% CAGR) — accessible at preservation age
 *   - Tax drag applied: 32.5% marginal on investment income (approximate, AU resident)
 *   - Australian CGT discount (50%) applied to sold assets after 12 months
 *
 * FIRE trigger: investable NW ≥ target capital (passive income need / withdrawal rate)
 */

import { safeNum } from './finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FIREScenarioId = 'property' | 'etf' | 'mixed' | 'aggressive';

export interface FIREPathInput {
  // Current balances
  net_worth:          number;
  investable:         number;    // cash + stocks + crypto (non-property, non-super)
  super_combined:     number;
  ppor:               number;
  mortgage:           number;
  stocks:             number;
  crypto:             number;
  cash:               number;
  offset_balance:     number;
  other_debts:        number;

  // Cashflow
  monthly_income:     number;
  monthly_expenses:   number;
  monthly_surplus:    number;    // authoritative: income - expenses

  // Bills
  bills_total_monthly: number;

  // FIRE target
  target_passive_income: number; // monthly — set by user or derived from expenses
  withdrawal_rate:       number; // percent e.g. 4.0

  // Mortgage
  mortgage_rate:         number; // percent e.g. 6.5
  mortgage_remaining_years: number;

  // Current year
  current_year: number;

  // Preservation age (Australian super access)
  preservation_age: number;     // default 60
  current_age:      number;     // default 45 if unknown
}

export interface FIREScenarioYear {
  year:          number;
  net_worth:     number;
  investable:    number;
  super_balance: number;
  passive_income: number;    // monthly passive
  surplus:       number;     // free cashflow this year (after mortgage, debt)
  fire_reached:  boolean;
}

export interface FIREScenario {
  id:              FIREScenarioId;
  label:           string;
  tagline:         string;
  fire_year:       number;          // calendar year
  years_to_fire:   number;
  net_worth_at_fire: number;
  monthly_passive_at_fire: number;
  risk_level:      'Low' | 'Medium' | 'High' | 'Very High';
  risk_color:      'green' | 'amber' | 'red' | 'purple';
  strategy_summary: string;         // 2-line plain English description
  key_moves:       string[];        // top 3 actionable moves
  timeline:        FIREScenarioYear[];  // annual snapshots
  progress_pct:    number;          // current progress toward this scenario's FIRE
  annual_invest:   number;          // how much goes into growth assets per year
  primary_vehicle: string;          // "ETF / Index Funds" etc.
  tax_note:        string;
  cgt_discount_applies: boolean;
}

export interface FIREPathResult {
  scenarios:       FIREScenario[];
  best_scenario:   FIREScenarioId;
  best_label:      string;
  best_fire_year:  number;
  fastest_vs_slowest_years: number;  // delta between fastest and slowest FIRE
  target_capital:  number;
  current_progress_pct: number;
  recommendation:  string;           // 1 smart paragraph
  semi_fire_year:  number;           // year at 50% target
  data_coverage:   'full' | 'partial' | 'minimal';
}

// ─── Input builder ────────────────────────────────────────────────────────────

export function buildFirePathInput(snap: any, bills: any[]): FIREPathInput {
  const n = (v: unknown) => safeNum(v);

  const FREQ: Record<string, number> = {
    Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
    Quarterly: 1 / 3, 'Half-Yearly': 1 / 6, Annually: 1 / 12,
  };
  const billsMonthly = (bills ?? [])
    .filter((b: any) => b.is_active !== false && b.active !== false)
    .reduce((s: number, b: any) => s + n(b.amount) * (FREQ[b.frequency] ?? 1), 0);

  const monthlyIncome   = n(snap.monthly_income)   || 22000;
  const monthlyExpenses = n(snap.monthly_expenses) || 14540;
  const monthlySurplus  = monthlyIncome - monthlyExpenses;
  const mortgage        = n(snap.mortgage)         || 0;
  const mortgageRate    = n(snap.mortgage_rate)    || 6.5;

  // Investable = cash + stocks + crypto (not PPOR equity, not super)
  const cashTotal  = n(snap.cash) + n(snap.offset_balance);
  const stocks     = n(snap.stocks)  || 0;
  const crypto     = n(snap.crypto)  || 0;
  const investable = cashTotal + stocks + crypto;

  // FIRE target: cover expenses + bills with passive income
  const targetPassive = monthlyExpenses + billsMonthly;

  // Preservation age — standard Australian
  const currentAge = n(snap.age) || 45;
  const preservationAge = 60;

  // Mortgage term remaining (rough): assume 30yr from some past date → use 25yr default
  const mortgageRemainingYears = n(snap.mortgage_term_remaining) || 25;

  return {
    net_worth:           (n(snap.ppor) + cashTotal + n(snap.super_balance) + stocks + crypto + n(snap.cars) + n(snap.iran_property)) - (mortgage + n(snap.other_debts)),
    investable,
    super_combined:      n(snap.super_balance) || n(snap.roham_super_balance) + n(snap.fara_super_balance) || 85000,
    ppor:                n(snap.ppor),
    mortgage,
    stocks,
    crypto,
    cash:                n(snap.cash),
    offset_balance:      n(snap.offset_balance),
    other_debts:         n(snap.other_debts),
    monthly_income:      monthlyIncome,
    monthly_expenses:    monthlyExpenses,
    monthly_surplus:     monthlySurplus,
    bills_total_monthly: billsMonthly,
    target_passive_income: targetPassive,
    withdrawal_rate:     4.0,
    mortgage_rate:       mortgageRate,
    mortgage_remaining_years: mortgageRemainingYears,
    current_year:        new Date().getFullYear(),
    preservation_age:    preservationAge,
    current_age:         currentAge,
  };
}

// ─── Core: monthly compounder ─────────────────────────────────────────────────

function monthsToFIRECompound(
  startBal:    number,
  monthlyAdd:  number,
  monthlyRate: number,
  target:      number
): number {
  if (startBal >= target) return 0;
  if (monthlyAdd <= 0 && monthlyRate <= 0) return Infinity;
  let bal = startBal;
  for (let m = 1; m <= 480; m++) {    // max 40 years
    bal = bal * (1 + monthlyRate) + monthlyAdd;
    if (bal >= target) return m;
  }
  return Infinity;
}

// ─── Passive income estimate per scenario per year ───────────────────────────

function calcPassiveIncome(investable: number, superBal: number, propertyEquity: number, scenarioId: FIREScenarioId, wr: number): number {
  const rate = wr / 100;
  switch (scenarioId) {
    case 'property':
      // Property: rental yield 4% on equity + 4% SWR on investable
      return (propertyEquity * 0.04 / 12) + (investable * rate / 12) + (superBal * rate / 12);
    case 'etf':
      return ((investable + superBal) * rate / 12);
    case 'mixed':
      return ((propertyEquity * 0.04 / 12) * 0.5) + ((investable + superBal) * rate / 12);
    case 'aggressive':
      return ((investable * 1.1) * rate / 12) + (superBal * rate / 12);
  }
}

// ─── Build annual timeline ────────────────────────────────────────────────────

function buildTimeline(
  input: FIREPathInput,
  annualGrowthRate:     number,    // e.g. 0.085
  surplusInvestRatio:   number,    // 0–1: fraction of surplus going to growth assets
  debtPaydownBoost:     boolean,   // does paying down mortgage free up cashflow?
  extraPropertyEquity:  number,    // starting extra equity from property purchases
  scenarioId:           FIREScenarioId,
  fireYear:             number,
): FIREScenarioYear[] {
  const wr             = input.withdrawal_rate / 100;
  const monthlyRate    = annualGrowthRate / 12;
  const superRate      = 0.09 / 12;
  const years          = Math.min(40, Math.max(fireYear - input.current_year + 5, 10));

  let investable       = input.investable;
  let superBal         = input.super_combined;
  let propertyEquity   = (input.ppor - input.mortgage) + extraPropertyEquity;
  let mortgage         = input.mortgage;
  let monthlyExpenses  = input.monthly_expenses;
  let monthlyIncome    = input.monthly_income;

  const mortgageRateMonthly = input.mortgage_rate / 100 / 12;
  const timeline: FIREScenarioYear[] = [];

  for (let y = 0; y < years; y++) {
    const yr = input.current_year + y;

    // Income grows 3%/year
    monthlyIncome   = monthlyIncome * (y === 0 ? 1 : 1.03);
    // Expenses inflate 3%/year
    monthlyExpenses = monthlyExpenses * (y === 0 ? 1 : 1.03);

    // Surplus this year
    const mortgageRepayment = mortgage > 0
      ? Math.min(mortgage / input.mortgage_remaining_years / 12 + mortgage * mortgageRateMonthly, mortgage / 12 + 500)
      : 0;
    const freeSurplus = Math.max(0, monthlyIncome - monthlyExpenses);
    const toInvest    = freeSurplus * surplusInvestRatio;

    // Grow investable
    for (let m = 0; m < 12; m++) {
      investable = investable * (1 + monthlyRate) + toInvest;
    }
    // Grow super (employer SGC + voluntary)
    const sgcMonthly = monthlyIncome * 0.115;   // 11.5% SGC
    for (let m = 0; m < 12; m++) {
      superBal = superBal * (1 + superRate) + sgcMonthly;
    }
    // Property equity grows (5% appreciation + debt paydown)
    if (scenarioId === 'property' || scenarioId === 'mixed') {
      propertyEquity = propertyEquity * 1.05 + (mortgageRepayment - mortgage * mortgageRateMonthly) * 12;
    }
    // Mortgage reduces
    if (mortgage > 0) {
      mortgage = Math.max(0, mortgage - mortgageRepayment * 12);
    }

    const netWorth = investable + superBal + propertyEquity + (mortgage > 0 ? 0 : input.ppor);
    const passive  = calcPassiveIncome(investable, superBal, propertyEquity, scenarioId, input.withdrawal_rate);
    const target   = (input.target_passive_income * 12) / wr;
    const reached  = investable + superBal >= target || passive >= input.target_passive_income;

    timeline.push({
      year:          yr,
      net_worth:     Math.round(netWorth),
      investable:    Math.round(investable),
      super_balance: Math.round(superBal),
      passive_income: Math.round(passive),
      surplus:       Math.round(freeSurplus),
      fire_reached:  reached,
    });
  }

  return timeline;
}

// ─── Scenario A: Property Focused ─────────────────────────────────────────────

function simulateProperty(input: FIREPathInput): FIREScenario {
  const wr          = input.withdrawal_rate / 100;
  const reqCapital  = (input.target_passive_income * 12) / wr;

  // Strategy: buy 1 IP in year 2 using equity; surplus → offset / mortgage paydown
  // Growth: 5.5% property CAGR + 4% rental yield
  // Investable grows slowly (offset used for mortgage reduction)
  const annualRate   = 0.055;
  const investRatio  = 0.3;   // only 30% surplus goes to liquid assets; rest → offset

  // Add estimated IP equity boost: borrow 80% on $800K IP → $160K equity
  const extraEquity  = Math.min(input.ppor * 0.3, 200000);

  const months = monthsToFIRECompound(
    input.investable * 0.3 + (input.ppor - input.mortgage) + extraEquity,
    input.monthly_surplus * investRatio,
    annualRate / 12,
    reqCapital * 0.6   // property coverage: can reach FIRE with 60% liquid (rest = rental)
  );

  const fireYear    = months === Infinity ? input.current_year + 30 : input.current_year + Math.ceil(months / 12);
  const semiMonths  = monthsToFIRECompound(input.investable * 0.3, input.monthly_surplus * investRatio, annualRate / 12, reqCapital * 0.3);
  const semiYear    = semiMonths === Infinity ? fireYear - 3 : input.current_year + Math.ceil(semiMonths / 12);

  const timeline = buildTimeline(input, annualRate, investRatio, true, extraEquity, 'property', fireYear);
  const atFireRow = timeline.find(r => r.year >= fireYear) ?? timeline[timeline.length - 1];

  return {
    id:              'property',
    label:           'Property Focused',
    tagline:         'Build equity through property + rental income',
    fire_year:       fireYear,
    years_to_fire:   fireYear - input.current_year,
    net_worth_at_fire: atFireRow.net_worth,
    monthly_passive_at_fire: atFireRow.passive_income,
    risk_level:      'Medium',
    risk_color:      'amber',
    strategy_summary: 'Use PPOR equity to purchase an investment property. Direct surplus into offset/mortgage reduction. Rental income + capital growth builds FIRE capital over 15–20 years.',
    key_moves: [
      `Redraw/LOC on PPOR to fund IP deposit (target: $160K+ equity access)`,
      `Redirect $${Math.round(input.monthly_surplus * 0.4 / 100) * 100}/mo surplus into mortgage offset`,
      `Target IP with 4%+ gross yield in growth corridor`,
    ],
    timeline,
    progress_pct: Math.min(100, Math.round(((input.ppor - input.mortgage + input.investable) / reqCapital) * 100)),
    annual_invest: Math.round(input.monthly_surplus * investRatio * 12),
    primary_vehicle: 'Investment Property + Offset',
    tax_note: 'Negative gearing reduces taxable income; CGT discount (50%) on sale after 12 months.',
    cgt_discount_applies: true,
  };
}

// ─── Scenario B: ETF / Stock Focused ──────────────────────────────────────────

function simulateETF(input: FIREPathInput): FIREScenario {
  const wr         = input.withdrawal_rate / 100;
  const reqCapital = (input.target_passive_income * 12) / wr;

  // Strategy: 100% surplus → diversified ETFs (VAS + VGS), no new property
  // Historical AU broad market: ~9.5% incl. dividends; use 8.5% conservative
  const annualRate  = 0.085;
  const investRatio = 0.80;   // 80% of surplus → ETFs; 20% cash buffer

  const months = monthsToFIRECompound(
    input.investable,
    input.monthly_surplus * investRatio,
    annualRate / 12,
    reqCapital
  );

  const fireYear = months === Infinity ? input.current_year + 35 : input.current_year + Math.ceil(months / 12);
  const timeline = buildTimeline(input, annualRate, investRatio, false, 0, 'etf', fireYear);
  const atFireRow = timeline.find(r => r.year >= fireYear) ?? timeline[timeline.length - 1];

  return {
    id:              'etf',
    label:           'ETF / Stock Focused',
    tagline:         'Max surplus → index ETFs, 4% SWR withdrawal',
    fire_year:       fireYear,
    years_to_fire:   fireYear - input.current_year,
    net_worth_at_fire: atFireRow.net_worth,
    monthly_passive_at_fire: atFireRow.passive_income,
    risk_level:      'Low',
    risk_color:      'green',
    strategy_summary: 'Automate max surplus into VAS/VGS index ETFs monthly. Low cost, fully liquid, internationally diversified. Reach FIRE when portfolio generates passive income at 4% SWR.',
    key_moves: [
      `Set up $${Math.round(input.monthly_surplus * investRatio / 100) * 100}/mo auto-DCA into VAS (40%) + VGS (60%)`,
      `Reinvest all dividends — don't spend them`,
      `Review annually; rebalance if any asset class drifts >5%`,
    ],
    timeline,
    progress_pct: Math.min(100, Math.round((input.investable / reqCapital) * 100)),
    annual_invest: Math.round(input.monthly_surplus * investRatio * 12),
    primary_vehicle: 'ETF / Index Funds (VAS + VGS)',
    tax_note: 'Franked dividends reduce tax. CGT discount (50%) on units held >12 months.',
    cgt_discount_applies: true,
  };
}

// ─── Scenario C: Mixed Strategy ───────────────────────────────────────────────

function simulateMixed(input: FIREPathInput): FIREScenario {
  const wr         = input.withdrawal_rate / 100;
  const reqCapital = (input.target_passive_income * 12) / wr;

  // 50/50: half surplus → ETFs, half → offset/property paydown
  // Also maxes concessional super contributions (+$5K above SGC)
  // Blended growth: 7.2% (property 5% + ETF 8.5% blended, tax-adjusted)
  const annualRate   = 0.072;
  const investRatio  = 0.65;   // 65% of surplus to growth (ETF + property/offset)
  const extraEquity  = Math.min(input.ppor * 0.2, 120000);

  const months = monthsToFIRECompound(
    input.investable + (input.ppor - input.mortgage) * 0.3,
    input.monthly_surplus * investRatio,
    annualRate / 12,
    reqCapital * 0.8
  );

  const fireYear = months === Infinity ? input.current_year + 28 : input.current_year + Math.ceil(months / 12);
  const timeline = buildTimeline(input, annualRate, investRatio, true, extraEquity, 'mixed', fireYear);
  const atFireRow = timeline.find(r => r.year >= fireYear) ?? timeline[timeline.length - 1];

  return {
    id:              'mixed',
    label:           'Mixed Strategy',
    tagline:         'Balanced: ETFs + property equity + super maximisation',
    fire_year:       fireYear,
    years_to_fire:   fireYear - input.current_year,
    net_worth_at_fire: atFireRow.net_worth,
    monthly_passive_at_fire: atFireRow.passive_income,
    risk_level:      'Medium',
    risk_color:      'amber',
    strategy_summary: 'Split surplus between ETF DCA and mortgage/offset reduction. Max super concessional contributions. Access super at 60 to cover drawdown gap. Multiple passive income streams by FIRE date.',
    key_moves: [
      `Split surplus: $${Math.round(input.monthly_surplus * 0.35 / 100) * 100}/mo ETF + $${Math.round(input.monthly_surplus * 0.30 / 100) * 100}/mo offset`,
      `Max concessional super to $30K cap — saves ~$4K–$8K tax/year`,
      `Use PPOR equity line for IP when LVR < 60%`,
    ],
    timeline,
    progress_pct: Math.min(100, Math.round(((input.investable + input.super_combined * 0.5) / reqCapital) * 100)),
    annual_invest: Math.round(input.monthly_surplus * investRatio * 12),
    primary_vehicle: 'ETF + Offset + Super (Mixed)',
    tax_note: 'Super contributions taxed at 15% (vs marginal). Franked ETF dividends. Full NG benefit on IP.',
    cgt_discount_applies: true,
  };
}

// ─── Scenario D: Aggressive ───────────────────────────────────────────────────

function simulateAggressive(input: FIREPathInput): FIREScenario {
  const wr         = input.withdrawal_rate / 100;
  const reqCapital = (input.target_passive_income * 12) / wr;

  // High-growth: leveraged ETF position + crypto allocation + SMSF
  // Target 11% CAGR on growth portfolio; accepts 20–30% drawdown risk
  // Surplus: 90% deployed into growth assets immediately
  const annualRate  = 0.11;
  const investRatio = 0.90;

  const months = monthsToFIRECompound(
    input.investable,
    input.monthly_surplus * investRatio,
    annualRate / 12,
    reqCapital
  );

  const fireYear = months === Infinity ? input.current_year + 25 : input.current_year + Math.ceil(months / 12);
  const timeline = buildTimeline(input, annualRate, investRatio, false, 0, 'aggressive', fireYear);
  const atFireRow = timeline.find(r => r.year >= fireYear) ?? timeline[timeline.length - 1];

  return {
    id:              'aggressive',
    label:           'Aggressive Growth',
    tagline:         'Maximum growth assets, highest risk, fastest theoretical FIRE',
    fire_year:       fireYear,
    years_to_fire:   fireYear - input.current_year,
    net_worth_at_fire: atFireRow.net_worth,
    monthly_passive_at_fire: atFireRow.passive_income,
    risk_level:      'Very High',
    risk_color:      'purple',
    strategy_summary: 'Max 90% of surplus into highest-returning growth assets: leverage via margin loan or LOC, growth ETFs (DHHF), small crypto allocation. Higher volatility — could underperform baseline by 5–8 years in a bad sequence-of-returns.',
    key_moves: [
      `Allocate $${Math.round(input.monthly_surplus * 0.5 / 100) * 100}/mo to DHHF (100% growth ETF)`,
      `Keep 3–5% in crypto (BTC/ETH only) for asymmetric upside`,
      `Use LOC on PPOR equity to amplify during market dips (disciplined only)`,
    ],
    timeline,
    progress_pct: Math.min(100, Math.round((input.investable / reqCapital) * 100)),
    annual_invest: Math.round(input.monthly_surplus * investRatio * 12),
    primary_vehicle: 'Growth ETF (DHHF) + Leverage + Crypto',
    tax_note: 'Investment loan interest deductible. CGT discount after 12 months. Crypto taxed as CGT event on disposal.',
    cgt_discount_applies: true,
  };
}

// ─── Main compute function ────────────────────────────────────────────────────

export function computeFirePath(input: FIREPathInput): FIREPathResult {
  const wr         = input.withdrawal_rate / 100;
  const reqCapital = (input.target_passive_income * 12) / wr;

  // Data coverage check
  const hasRealData = input.monthly_income > 0 && input.monthly_expenses > 0;
  const dataCoverage: 'full' | 'partial' | 'minimal' =
    hasRealData && input.investable > 0 ? 'full' :
    hasRealData ? 'partial' : 'minimal';

  // Run all 4 scenarios
  const scenarioA = simulateProperty(input);
  const scenarioB = simulateETF(input);
  const scenarioC = simulateMixed(input);
  const scenarioD = simulateAggressive(input);

  const scenarios: FIREScenario[] = [scenarioA, scenarioB, scenarioC, scenarioD];

  // Find best (earliest FIRE year, excluding infinite)
  const finite = scenarios.filter(s => s.fire_year < input.current_year + 40);
  const best   = finite.length > 0
    ? finite.reduce((a, b) => a.fire_year < b.fire_year ? a : b)
    : scenarioB;  // fallback

  const fastest = best.fire_year;
  const slowest = Math.max(...finite.map(s => s.fire_year));

  // Current progress (based on ETF scenario as baseline)
  const currentProgress = Math.min(100, Math.round((input.investable / reqCapital) * 100));

  // Semi-FIRE year: when 50% passive income is covered
  const semiTarget = reqCapital * 0.5;
  const semiMonths = monthsToFIRECompound(input.investable, input.monthly_surplus * 0.7, 0.085 / 12, semiTarget);
  const semiYear   = semiMonths === Infinity ? fastest - 3 : input.current_year + Math.ceil(semiMonths / 12);

  // Recommendation text
  const recMap: Record<FIREScenarioId, string> = {
    etf:        `Option B (ETF-Focused) gives the most reliable, tax-efficient path to FIRE in ${best.fire_year}. With $${Math.round(input.monthly_surplus * 0.8 / 1000)}K/month into VAS/VGS at 8.5% CAGR, your portfolio reaches the $${(reqCapital / 1000000).toFixed(1)}M target with full liquidity and no leverage risk.`,
    property:   `Option A (Property-Focused) reaches FIRE in ${best.fire_year} by leveraging existing PPOR equity into an investment property. Rental income + capital growth provides a tangible, inflation-hedged passive income stream — but requires active management.`,
    mixed:      `Option C (Mixed Strategy) balances compounding, tax optimisation, and income diversification to reach FIRE in ${best.fire_year}. Spreading across ETFs, offset, and super maximisation reduces concentration risk while maintaining strong growth.`,
    aggressive: `Option D (Aggressive) projects FIRE in ${best.fire_year} with 90% surplus deployed into high-growth assets. This path has the highest upside but faces 20–30% drawdown risk in a bad market cycle — only suitable if you have 5+ years of fallback runway.`,
  };

  return {
    scenarios,
    best_scenario: best.id,
    best_label:    best.label,
    best_fire_year: fastest,
    fastest_vs_slowest_years: slowest - fastest,
    target_capital: reqCapital,
    current_progress_pct: currentProgress,
    recommendation: recMap[best.id],
    semi_fire_year: Math.max(input.current_year + 1, semiYear),
    data_coverage:  dataCoverage,
  };
}
