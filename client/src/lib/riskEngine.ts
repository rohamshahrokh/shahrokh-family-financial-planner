/**
 * riskEngine.ts — Financial Fragility / Risk Radar Engine
 *
 * Scores the user's financial risk across 4 dimensions using real data only.
 * No generic advice — every output is derived from actual snapshot values.
 *
 * Dimensions:
 *  1. Debt Risk        — LVR, debt ratio, interest rate exposure
 *  2. Cashflow Risk    — buffer months, surplus ratio, bill concentration
 *  3. Investment Risk  — crypto concentration, diversification, volatility exposure
 *  4. Income Risk      — single vs dual income, income stability, emergency fund
 *
 * Score: 0–100 per dimension (100 = safest)
 * Overall: weighted average
 * Level: 'green' (≥70) | 'amber' (40–69) | 'red' (<40)
 */

import { safeNum } from './finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'green' | 'amber' | 'red';

export interface RiskFactor {
  id:         string;
  label:      string;             // "Debt-to-Assets Ratio"
  value:      string;             // "59.9%"
  benchmark:  string;             // "< 40% is healthy"
  score:      number;             // 0–100
  level:      RiskLevel;
  finding:    string;             // 1-line diagnosis
  action:     string;             // specific mitigation
  weight:     number;             // for category score
}

export interface RiskCategory {
  id:         string;
  label:      string;             // "Debt Risk"
  icon:       string;             // emoji
  score:      number;             // 0–100 weighted average
  level:      RiskLevel;
  factors:    RiskFactor[];
  summary:    string;             // category-level sentence
}

export interface RiskAlert {
  severity:   'critical' | 'high' | 'medium' | 'low';
  category:   string;
  message:    string;
  action:     string;
}

export interface RiskRadarResult {
  overall_score:    number;
  overall_level:    RiskLevel;
  overall_label:    string;       // "Moderate Risk"
  categories:       RiskCategory[];
  top_risks:        RiskFactor[]; // top 3 worst factors by score
  top_mitigations:  string[];     // top 3 action strings
  alerts:           RiskAlert[];  // critical + high severity only
  radar_data:       Array<{ subject: string; score: number; fullMark: number }>;
  fragility_index:  number;       // inverse of overall score (0 = resilient, 100 = fragile)
  data_coverage:    'full' | 'partial' | 'minimal';
}

export interface RiskEngineInput {
  // Snapshot
  monthly_income:    number;
  fara_monthly_income: number;
  monthly_expenses:  number;
  // Assets
  ppor:              number;
  cash:              number;
  offset_balance:    number;
  super_combined:    number;
  stocks:            number;
  crypto:            number;
  cars:              number;
  iran_property:     number;
  total_assets:      number;
  // Debts
  mortgage:          number;
  other_debts:       number;
  total_debt:        number;
  // Mortgage
  mortgage_rate:     number;   // percent e.g. 6.5
  // Cash accounts
  cash_emergency:    number;
  cash_savings:      number;
  // Bills
  bills_total_monthly: number;
  big_bills_next30:    number;
  // FIRE
  fire_progress_pct: number;
  // Family
  has_dependants:    boolean;
  // Properties
  properties: Array<{
    is_ppor:       boolean;
    weekly_rent:   number;
    loan_amount:   number;
    interest_rate: number;
    property_type: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function level(score: number): RiskLevel {
  if (score >= 70) return 'green';
  if (score >= 40) return 'amber';
  return 'red';
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

function pct(n: number, dp = 1): string {
  return `${n.toFixed(dp)}%`;
}

function weightedScore(factors: RiskFactor[]): number {
  const total = factors.reduce((s, f) => s + f.weight, 0);
  if (total === 0) return 50;
  return factors.reduce((s, f) => s + f.score * (f.weight / total), 0);
}

// ─── Category 1: Debt Risk ────────────────────────────────────────────────────

function scoreDebtRisk(inp: RiskEngineInput): RiskCategory {
  const factors: RiskFactor[] = [];

  // 1a. Debt-to-Assets Ratio
  const debtRatio = inp.total_assets > 0 ? inp.total_debt / inp.total_assets : 0;
  const debtRatioPct = debtRatio * 100;
  let drScore = debtRatioPct <= 30 ? 90 : debtRatioPct <= 40 ? 75 : debtRatioPct <= 55 ? 55 : debtRatioPct <= 70 ? 30 : 10;
  factors.push({
    id: 'debt_ratio', label: 'Debt-to-Assets Ratio', value: pct(debtRatioPct), benchmark: '< 40% is healthy',
    score: drScore, level: level(drScore), weight: 35,
    finding: debtRatioPct > 55
      ? `High leverage — ${pct(debtRatioPct)} of your total assets are debt-financed.`
      : debtRatioPct > 40
        ? `Moderate leverage — ${pct(debtRatioPct)} debt ratio is within manageable range but above optimal.`
        : `Healthy leverage — ${pct(debtRatioPct)} debt ratio is below the 40% benchmark.`,
    action: debtRatioPct > 55
      ? `Direct ${fmt(inp.monthly_income * 0.15)}/mo surplus toward PPOR principal reduction to bring ratio below 50%`
      : debtRatioPct > 40
        ? `Maintain current repayments — avoid taking on new debt until ratio drops below 40%`
        : `Leverage is well-managed — no immediate action needed`,
  });

  // 1b. PPOR LVR
  const pporLvr = inp.ppor > 0 ? (inp.mortgage / inp.ppor) * 100 : 0;
  let lvrScore = pporLvr <= 60 ? 90 : pporLvr <= 70 ? 75 : pporLvr <= 80 ? 55 : pporLvr <= 90 ? 35 : 15;
  factors.push({
    id: 'ppor_lvr', label: 'PPOR Loan-to-Value (LVR)', value: pct(pporLvr), benchmark: '< 70% is safe',
    score: lvrScore, level: level(lvrScore), weight: 30,
    finding: pporLvr > 80
      ? `LVR of ${pct(pporLvr)} puts PPOR equity at risk if property values fall 5–10%.`
      : pporLvr > 70
        ? `LVR of ${pct(pporLvr)} is above the 70% comfort threshold — property equity is thin.`
        : `LVR of ${pct(pporLvr)} is within safe territory — adequate equity buffer.`,
    action: pporLvr > 80
      ? `Prioritise PPOR principal payments — every ${fmt(10_000)} extra reduces LVR by ${pct(10_000 / inp.ppor * 100)}`
      : pporLvr > 70
        ? `Extra PPOR repayments of ${fmt(Math.min(inp.monthly_income * 0.05, 2_000))}/mo would bring LVR to ~70% within 2–3 years`
        : `LVR is healthy — maintain current repayment schedule`,
  });

  // 1c. Interest rate exposure (variable mortgage risk)
  const annualInterest = inp.mortgage * (inp.mortgage_rate || 6.5) / 100;
  const interestToIncome = inp.monthly_income > 0 ? annualInterest / (inp.monthly_income * 12) : 0;
  const itiPct = interestToIncome * 100;
  let itiScore = itiPct <= 20 ? 90 : itiPct <= 30 ? 70 : itiPct <= 40 ? 45 : 20;
  factors.push({
    id: 'interest_exposure', label: 'Mortgage Interest / Income', value: pct(itiPct), benchmark: '< 30% of gross income',
    score: itiScore, level: level(itiScore), weight: 20,
    finding: itiPct > 35
      ? `Mortgage interest (${fmt(annualInterest)}/yr) consumes ${pct(itiPct)} of gross income — highly rate-sensitive.`
      : `Mortgage interest consumes ${pct(itiPct)} of gross income — manageable at current rates.`,
    action: itiPct > 35
      ? `Refinance to lock in a fixed rate for 2–3 years — a 0.5% reduction saves ${fmt(inp.mortgage * 0.005)}/yr`
      : `Review mortgage rate annually — shop competitors if rate climbs above ${pct((inp.mortgage_rate || 6.5) + 0.5)}`,
  });

  // 1d. Non-deductible personal debt
  const otherDebtMo = inp.other_debts > 0 ? (inp.other_debts * 0.09) / 12 : 0; // ~9% APR
  const personalDebtToIncome = inp.monthly_income > 0 ? otherDebtMo / inp.monthly_income : 0;
  const pdtiPct = personalDebtToIncome * 100;
  let pdScore = inp.other_debts <= 0 ? 95 : pdtiPct <= 5 ? 80 : pdtiPct <= 10 ? 60 : 35;
  factors.push({
    id: 'personal_debt', label: 'Personal / Consumer Debt', value: fmt(inp.other_debts), benchmark: '0 is ideal',
    score: pdScore, level: level(pdScore), weight: 15,
    finding: inp.other_debts > 0
      ? `${fmt(inp.other_debts)} in non-deductible personal debt at ~9% APR costs ${fmt(Math.round(inp.other_debts * 0.09))}/yr in wasted interest.`
      : `No personal/consumer debt — excellent financial hygiene.`,
    action: inp.other_debts > 5_000
      ? `Snowball ${fmt(inp.other_debts)}: direct ${fmt(Math.round(inp.monthly_income * 0.10))}/mo surplus until eliminated — saves ${fmt(Math.round(inp.other_debts * 0.09))}/yr`
      : inp.other_debts > 0
        ? `Clear remaining ${fmt(inp.other_debts)} personal debt with next surplus payment`
        : `Maintain zero consumer debt position`,
  });

  const catScore = clamp(Math.round(weightedScore(factors)));
  const summary = catScore < 40
    ? `Debt load is a primary risk — high leverage constrains financial flexibility and amplifies rate changes.`
    : catScore < 70
      ? `Debt is manageable but elevated — maintain repayments and avoid new borrowings.`
      : `Debt position is well-structured — low leverage and healthy equity buffers.`;

  return { id: 'debt', label: 'Debt Risk', icon: '🏦', score: catScore, level: level(catScore), factors, summary };
}

// ─── Category 2: Cashflow Risk ────────────────────────────────────────────────

function scoreCashflowRisk(inp: RiskEngineInput): RiskCategory {
  const factors: RiskFactor[] = [];

  const monthlyExpenses = inp.monthly_expenses || (inp.monthly_income * 0.65);
  const liquidCash = inp.cash + inp.offset_balance;

  // 2a. Emergency buffer (months of expenses)
  const bufferMonths = monthlyExpenses > 0 ? liquidCash / monthlyExpenses : 0;
  let bufScore = bufferMonths >= 6 ? 95 : bufferMonths >= 3 ? 75 : bufferMonths >= 1 ? 45 : 10;
  factors.push({
    id: 'cash_buffer', label: 'Emergency Cash Buffer', value: `${bufferMonths.toFixed(1)} months`, benchmark: '≥ 3 months of expenses',
    score: bufScore, level: level(bufScore), weight: 35,
    finding: bufferMonths < 1
      ? `CRITICAL: Only ${bufferMonths.toFixed(1)} months of expenses in liquid cash — any income disruption causes immediate default risk.`
      : bufferMonths < 3
        ? `Thin buffer — ${bufferMonths.toFixed(1)} months of expenses (${fmt(liquidCash)}) is below the 3-month safety minimum.`
        : `Healthy buffer — ${bufferMonths.toFixed(1)} months of expenses (${fmt(liquidCash)}) provides strong protection.`,
    action: bufferMonths < 3
      ? `Build buffer to ${fmt(monthlyExpenses * 3)} — save ${fmt(Math.round((monthlyExpenses * 3 - liquidCash) / 6))}/mo over next 6 months in a high-interest account`
      : `Buffer is sufficient — maintain and redirect any excess above ${fmt(monthlyExpenses * 6)} into investments`,
  });

  // 2b. Monthly surplus ratio
  const surplus = inp.monthly_income - monthlyExpenses;
  const surplusRatio = inp.monthly_income > 0 ? surplus / inp.monthly_income : 0;
  const surplusRatioPct = surplusRatio * 100;
  let srScore = surplusRatioPct >= 30 ? 95 : surplusRatioPct >= 20 ? 80 : surplusRatioPct >= 10 ? 60 : surplusRatioPct >= 0 ? 40 : 5;
  factors.push({
    id: 'surplus_ratio', label: 'Monthly Surplus Ratio', value: pct(surplusRatioPct), benchmark: '≥ 20% of income',
    score: srScore, level: level(srScore), weight: 30,
    finding: surplus < 0
      ? `Cashflow is NEGATIVE — spending ${fmt(Math.abs(surplus))}/mo more than income. Unsustainable.`
      : surplusRatioPct < 10
        ? `Tight surplus at ${pct(surplusRatioPct)} — only ${fmt(surplus)}/mo headroom. Minor disruption could cause cashflow crisis.`
        : `Healthy surplus of ${pct(surplusRatioPct)} (${fmt(surplus)}/mo) — good capacity to absorb shocks.`,
    action: surplus < 0
      ? `Identify and cut the top 3 discretionary expense categories immediately — target reducing spend by ${fmt(Math.abs(surplus) + 500)}/mo`
      : surplusRatioPct < 15
        ? `Review recurring bills — eliminating 2–3 subscriptions or renegotiating insurance/utilities could free ${fmt(Math.round(monthlyExpenses * 0.05))}/mo`
        : `Strong surplus — automate transfer of ${fmt(Math.round(surplus * 0.5))}/mo to investments on payday`,
  });

  // 2c. Bills concentration risk (big bills as % of monthly expenses)
  const bigBillRatio = monthlyExpenses > 0 ? inp.big_bills_next30 / monthlyExpenses : 0;
  const bbRatioPct = bigBillRatio * 100;
  let bbScore = inp.big_bills_next30 === 0 ? 90 : bbRatioPct <= 20 ? 85 : bbRatioPct <= 40 ? 65 : bbRatioPct <= 60 ? 45 : 25;
  factors.push({
    id: 'bill_concentration', label: 'Large Bills Due (30 days)', value: fmt(inp.big_bills_next30), benchmark: '< 40% of monthly expenses',
    score: bbScore, level: level(bbScore), weight: 20,
    finding: inp.big_bills_next30 > monthlyExpenses * 0.4
      ? `Large bills totalling ${fmt(inp.big_bills_next30)} due in the next 30 days — ${pct(bbRatioPct)} of monthly expenses.`
      : inp.big_bills_next30 > 0
        ? `${fmt(inp.big_bills_next30)} in bills due soon — within manageable range.`
        : `No large bills due imminently — cashflow is clear.`,
    action: inp.big_bills_next30 > monthlyExpenses * 0.4
      ? `Ring-fence ${fmt(inp.big_bills_next30)} in your offset now to cover upcoming large bills without dipping into investments`
      : `No action required — cashflow is clear for the next 30 days`,
  });

  // 2d. Income-to-expense coverage (coverage ratio)
  const coverageRatio = monthlyExpenses > 0 ? inp.monthly_income / monthlyExpenses : 0;
  let covScore = coverageRatio >= 1.4 ? 90 : coverageRatio >= 1.2 ? 75 : coverageRatio >= 1.1 ? 55 : coverageRatio >= 1.0 ? 35 : 5;
  factors.push({
    id: 'income_coverage', label: 'Income / Expense Coverage', value: `${coverageRatio.toFixed(2)}×`, benchmark: '≥ 1.3× is resilient',
    score: covScore, level: level(covScore), weight: 15,
    finding: coverageRatio < 1.1
      ? `Income barely covers expenses at ${coverageRatio.toFixed(2)}× — no real buffer exists.`
      : `Income covers expenses ${coverageRatio.toFixed(2)}× — ${coverageRatio >= 1.3 ? 'resilient' : 'adequate but not generous'}.`,
    action: coverageRatio < 1.3
      ? `Target income coverage of 1.3× — requires either reducing expenses by ${fmt(monthlyExpenses - inp.monthly_income / 1.3)} or growing income`
      : `Maintain coverage ratio above 1.3× — allocate any income growth to investments, not lifestyle`,
  });

  const catScore = clamp(Math.round(weightedScore(factors)));
  const summary = catScore < 40
    ? `Cashflow is critically thin — insufficient buffer and/or negative surplus leaves no room for unexpected events.`
    : catScore < 70
      ? `Cashflow is functional but tight — buffer and surplus are below optimal levels.`
      : `Cashflow position is strong — healthy surplus and adequate emergency fund.`;

  return { id: 'cashflow', label: 'Cashflow Risk', icon: '💸', score: catScore, level: level(catScore), factors, summary };
}

// ─── Category 3: Investment Risk ──────────────────────────────────────────────

function scoreInvestmentRisk(inp: RiskEngineInput): RiskCategory {
  const factors: RiskFactor[] = [];
  const portfolio = inp.stocks + inp.crypto;
  const totalAssets = inp.total_assets || 1;

  // 3a. Crypto concentration
  const cryptoPct = portfolio > 0 ? (inp.crypto / portfolio) * 100 : 0;
  const cryptoToAssets = (inp.crypto / totalAssets) * 100;
  let ccScore = cryptoPct <= 10 ? 90 : cryptoPct <= 20 ? 75 : cryptoPct <= 30 ? 55 : cryptoPct <= 50 ? 30 : 10;
  factors.push({
    id: 'crypto_concentration', label: 'Crypto Allocation (% of portfolio)', value: pct(cryptoPct), benchmark: '< 20% of portfolio',
    score: ccScore, level: level(ccScore), weight: 35,
    finding: cryptoPct > 40
      ? `Crypto represents ${pct(cryptoPct)} of your investment portfolio — extreme volatility exposure. A 50% crypto crash would erase ${fmt(inp.crypto * 0.5)}.`
      : cryptoPct > 20
        ? `Crypto at ${pct(cryptoPct)} of portfolio is above the 20% comfort threshold — meaningful downside volatility risk.`
        : cryptoPct > 0
          ? `Crypto at ${pct(cryptoPct)} of portfolio is within acceptable range.`
          : `No crypto exposure — low volatility profile.`,
    action: cryptoPct > 40
      ? `Rebalance: reduce crypto to 20% of portfolio by realising ${fmt(Math.max(0, inp.crypto - portfolio * 0.20))} — consider spreading over 3–6 months to manage CGT`
      : cryptoPct > 20
        ? `Trim crypto position to 20% — sell ${fmt(Math.max(0, inp.crypto - portfolio * 0.20))} and redirect to diversified ETFs`
        : `Monitor allocation — rebalance if crypto exceeds 20% of portfolio`,
  });

  // 3b. Portfolio diversification (stocks vs total investments)
  const stocksPct = totalAssets > 0 ? (inp.stocks / totalAssets) * 100 : 0;
  const superPct  = totalAssets > 0 ? (inp.super_combined / totalAssets) * 100 : 0;
  const propertyPct = totalAssets > 0 ? ((inp.ppor + inp.iran_property) / totalAssets) * 100 : 0;
  // Good diversification: property 40-60%, super 10-30%, stocks 10-30%, cash 5-15%
  const diversificationScore = (() => {
    let s = 50;
    if (stocksPct >= 5 && stocksPct <= 40) s += 15;
    if (superPct >= 10 && superPct <= 40)  s += 15;
    if (cryptoPct < 20)                    s += 10;
    if (inp.cash + inp.offset_balance > 0) s += 10;
    return clamp(s);
  })();
  factors.push({
    id: 'diversification', label: 'Asset Class Diversification', value: `Prop ${pct(propertyPct,0)} · Super ${pct(superPct,0)} · Stocks ${pct(stocksPct,0)} · Crypto ${pct(cryptoPct,0)}`, benchmark: 'Spread across 3+ asset classes',
    score: diversificationScore, level: level(diversificationScore), weight: 30,
    finding: portfolio === 0 && inp.super_combined === 0
      ? `No liquid investment assets detected — wealth is entirely in property and cash.`
      : `Assets spread: property ${pct(propertyPct,0)}, super ${pct(superPct,0)}, stocks ${pct(stocksPct,0)}, crypto ${pct(cryptoPct,0)}.`,
    action: portfolio === 0
      ? `Begin building a diversified investment portfolio — even ${fmt(500)}/mo into a low-cost ETF (e.g. VAS/VGS) builds meaningful wealth over time`
      : cryptoPct > 30
        ? `Shift crypto gains into diversified ETFs to improve asset class balance`
        : `Portfolio diversification is reasonable — continue DCA into existing allocation`,
  });

  // 3c. Property concentration risk (property as % of net worth)
  const nw = inp.total_assets - inp.total_debt;
  const propNwPct = nw > 0 ? ((inp.ppor - inp.mortgage + inp.iran_property) / nw) * 100 : 0;
  let propConcScore = propNwPct <= 60 ? 85 : propNwPct <= 80 ? 70 : propNwPct <= 95 ? 50 : 30;
  factors.push({
    id: 'property_concentration', label: 'Property Equity / Net Worth', value: pct(Math.max(0, propNwPct)), benchmark: '< 80% for liquidity',
    score: propConcScore, level: level(propConcScore), weight: 20,
    finding: propNwPct > 90
      ? `Net worth is ${pct(Math.min(100, propNwPct),0)} tied up in illiquid property — almost no accessible wealth outside real estate.`
      : propNwPct > 70
        ? `Property equity is ${pct(Math.min(100, propNwPct),0)} of net worth — consider building liquid investment assets alongside.`
        : `Property equity at ${pct(Math.max(0, propNwPct),0)} of net worth — balanced with liquid assets.`,
    action: propNwPct > 85
      ? `Direct surplus into liquid assets (ETFs, super) to reduce property concentration — target property below 80% of net worth`
      : `Allocation is healthy — continue building super and investment portfolio`,
  });

  // 3d. Investment in high-interest rate environment
  const rateRisk = inp.mortgage_rate > 6.5 ? 65 : inp.mortgage_rate > 5.5 ? 75 : 85;
  factors.push({
    id: 'rate_environment', label: 'Interest Rate Risk (mortgage)', value: `${(inp.mortgage_rate || 6.5).toFixed(2)}% p.a.`, benchmark: '< 6.0% comfortable',
    score: rateRisk, level: level(rateRisk), weight: 15,
    finding: (inp.mortgage_rate || 6.5) > 7
      ? `Mortgage rate of ${pct(inp.mortgage_rate,2)} is elevated — each 0.25% rise costs ${fmt(inp.mortgage * 0.0025)}/yr more in interest.`
      : `Mortgage rate of ${pct(inp.mortgage_rate || 6.5,2)} is at or near typical variable rate — monitor for further rises.`,
    action: (inp.mortgage_rate || 6.5) > 6.5
      ? `Compare rates with at least 3 lenders — a 0.5% reduction saves ${fmt(inp.mortgage * 0.005)}/yr. Consider fixing 50% for 2 years.`
      : `Rate is competitive — review annually and consider partial fixing if rates look likely to rise`,
  });

  const catScore = clamp(Math.round(weightedScore(factors)));
  const summary = catScore < 40
    ? `Investment portfolio is highly concentrated and volatile — crypto exposure and property illiquidity create significant downside risk.`
    : catScore < 70
      ? `Moderate investment risk — some concentration issues worth addressing over 6–12 months.`
      : `Investment risk is well-managed — diversified across asset classes with acceptable concentration levels.`;

  return { id: 'investment', label: 'Investment Risk', icon: '📈', score: catScore, level: level(catScore), factors, summary };
}

// ─── Category 4: Income Risk ──────────────────────────────────────────────────

function scoreIncomeRisk(inp: RiskEngineInput): RiskCategory {
  const factors: RiskFactor[] = [];
  const combined = inp.monthly_income + inp.fara_monthly_income;
  const dualIncome = inp.fara_monthly_income > 0;

  // 4a. Single vs dual income
  const incDepPct = combined > 0 ? (inp.monthly_income / combined) * 100 : 100;
  let idScore = dualIncome ? (incDepPct <= 70 ? 90 : 75) : 45;
  factors.push({
    id: 'income_dependency', label: 'Single vs Dual Income', value: dualIncome ? `Dual (Roham ${pct(incDepPct,0)} / Fara ${pct(100-incDepPct,0)})` : 'Single income household', benchmark: 'Dual income preferred',
    score: idScore, level: level(idScore), weight: 30,
    finding: !dualIncome
      ? `Single-income household — complete financial dependency on one earner. Any job loss or illness creates immediate crisis.`
      : incDepPct > 85
        ? `Effectively single-income — Fara contributes only ${pct(100 - incDepPct,0)} of household income. Similar risk to single-income.`
        : `Dual income provides resilience — combined ${fmt(combined)}/mo with no single point of failure.`,
    action: !dualIncome
      ? `Priority: income protection insurance for primary earner (typically 75% of income) and build 6-month emergency fund`
      : incDepPct > 85
        ? `Consider ways to grow Fara's income contribution — even a part-time increase materially reduces concentration risk`
        : `Dual income is healthy — ensure both earners have income protection cover`,
  });

  // 4b. Emergency fund adequacy for income loss scenario
  const liquidCash = inp.cash + inp.offset_balance;
  const runwayMonths = inp.monthly_expenses > 0 ? liquidCash / inp.monthly_expenses : 0;
  let efScore = runwayMonths >= 6 ? 95 : runwayMonths >= 3 ? 70 : runwayMonths >= 1 ? 40 : 10;
  factors.push({
    id: 'emergency_fund', label: 'Income Loss Runway', value: `${runwayMonths.toFixed(1)} months`, benchmark: '≥ 6 months for single income',
    score: efScore, level: level(efScore), weight: 30,
    finding: runwayMonths < 3
      ? `Only ${runwayMonths.toFixed(1)} months of expenses in accessible cash — job loss would require emergency action within weeks.`
      : runwayMonths < 6
        ? `${runwayMonths.toFixed(1)} months of runway — adequate but below the 6-month target for a ${dualIncome ? 'dual' : 'single'}-income household.`
        : `${runwayMonths.toFixed(1)} months of runway — strong protection against income disruption.`,
    action: runwayMonths < 3
      ? `URGENT: build emergency fund to ${fmt(inp.monthly_expenses * 3)} — this is higher priority than any investment`
      : runwayMonths < 6
        ? `Build buffer from ${fmt(liquidCash)} to ${fmt(inp.monthly_expenses * 6)} — save ${fmt(Math.round((inp.monthly_expenses * 6 - liquidCash) / 6))}/mo over 6 months`
        : `Emergency fund is adequate — any excess above ${fmt(inp.monthly_expenses * 9)} should go to investments`,
  });

  // 4c. Income stability (property rental income as buffer)
  const rentalIncome = inp.properties
    .filter(p => !p.is_ppor && p.weekly_rent > 0)
    .reduce((s, p) => s + p.weekly_rent * 52 / 12, 0);
  const rentalPct = combined > 0 ? (rentalIncome / combined) * 100 : 0;
  let riScore = rentalIncome > 0 ? (rentalPct >= 15 ? 90 : rentalPct >= 5 ? 75 : 65) : 60;
  factors.push({
    id: 'income_diversification', label: 'Passive / Rental Income', value: rentalIncome > 0 ? fmt(rentalIncome) + '/mo' : '$0', benchmark: '≥ 15% of income from passive',
    score: riScore, level: level(riScore), weight: 20,
    finding: rentalIncome > 0
      ? `Rental income of ${fmt(rentalIncome)}/mo provides ${pct(rentalPct)} income diversification — reduces pure employment dependency.`
      : `No passive income stream — entirely dependent on employment income. IP or ETF dividends would improve resilience.`,
    action: rentalIncome === 0
      ? `Consider building a passive income stream — even ${fmt(500)}/mo in ETF dividends reduces employment dependency meaningfully`
      : `Rental income provides a good buffer — ensure lease renewals are managed proactively to minimise vacancy`,
  });

  // 4d. Family obligations (dependants amplify income risk)
  const depScore = inp.has_dependants ? 65 : 85;
  factors.push({
    id: 'family_obligations', label: 'Dependant / Family Obligations', value: inp.has_dependants ? 'Has dependants' : 'No dependants', benchmark: 'Higher buffer required with dependants',
    score: depScore, level: level(depScore), weight: 20,
    finding: inp.has_dependants
      ? `Dependants mean fixed obligations (childcare, school, healthcare) that cannot be reduced in a cashflow crisis.`
      : `No dependants — financial flexibility is higher and income disruption is more manageable.`,
    action: inp.has_dependants
      ? `With dependants, prioritise: (1) income protection insurance, (2) 6-month emergency fund, (3) life insurance review`
      : `No dependants — more flexibility to take calculated investment risk and build wealth aggressively`,
  });

  const catScore = clamp(Math.round(weightedScore(factors)));
  const summary = catScore < 40
    ? `Income risk is high — single income dependency and thin emergency fund create significant fragility.`
    : catScore < 70
      ? `Moderate income risk — dual income helps but buffer months and insurance should be reviewed.`
      : `Income position is resilient — diversified income streams and adequate emergency fund.`;

  return { id: 'income', label: 'Income Risk', icon: '💼', score: catScore, level: level(catScore), factors, summary };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

function buildAlerts(categories: RiskCategory[], inp: RiskEngineInput): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  for (const cat of categories) {
    for (const f of cat.factors) {
      if (f.score < 35) {
        alerts.push({ severity: 'critical', category: cat.label, message: f.finding, action: f.action });
      } else if (f.score < 55) {
        alerts.push({ severity: 'high', category: cat.label, message: f.finding, action: f.action });
      }
    }
  }
  return alerts.sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

// Category weights for overall score
const CAT_WEIGHTS = { debt: 0.30, cashflow: 0.30, investment: 0.20, income: 0.20 };

const LEVEL_LABELS: Record<RiskLevel, string> = {
  green: 'Low Risk',
  amber: 'Moderate Risk',
  red:   'High Risk',
};

export function computeRiskRadar(inp: RiskEngineInput): RiskRadarResult {
  const debt       = scoreDebtRisk(inp);
  const cashflow   = scoreCashflowRisk(inp);
  const investment = scoreInvestmentRisk(inp);
  const income     = scoreIncomeRisk(inp);

  const categories = [debt, cashflow, investment, income];

  const overall = clamp(Math.round(
    debt.score       * CAT_WEIGHTS.debt +
    cashflow.score   * CAT_WEIGHTS.cashflow +
    investment.score * CAT_WEIGHTS.investment +
    income.score     * CAT_WEIGHTS.income
  ));
  const overallLevel = level(overall);

  // Top 3 worst factors across all categories
  const allFactors = categories.flatMap(c => c.factors);
  const top_risks = [...allFactors].sort((a, b) => a.score - b.score).slice(0, 3);

  const alerts = buildAlerts(categories, inp);

  const radar_data = categories.map(c => ({
    subject:  c.label.replace(' Risk', ''),
    score:    c.score,
    fullMark: 100,
  }));

  const dataCoverage: 'full' | 'partial' | 'minimal' =
    inp.monthly_income > 0 && inp.total_assets > 0 && inp.monthly_expenses > 0
      ? 'full'
      : inp.monthly_income > 0 ? 'partial' : 'minimal';

  return {
    overall_score:    overall,
    overall_level:    overallLevel,
    overall_label:    LEVEL_LABELS[overallLevel],
    categories,
    top_risks,
    top_mitigations:  top_risks.map(f => f.action),
    alerts,
    radar_data,
    fragility_index:  100 - overall,
    data_coverage:    dataCoverage,
  };
}

// ─── Build input from Supabase snapshot ──────────────────────────────────────

export function buildRiskInput(snap: any, properties: any[], expenses: any[]): RiskEngineInput {
  const n = (v: any) => safeNum(v);

  const stocks  = n(snap.stocks);
  const crypto  = n(snap.crypto);
  const ppor    = n(snap.ppor);
  const superB  = (n(snap.roham_super_balance) || n(snap.super_balance) * 0.6) + (n(snap.fara_super_balance) || n(snap.super_balance) * 0.4);
  const cars    = n(snap.cars);
  const iranP   = n(snap.iran_property);
  const cash    = n(snap.cash);
  const offsetB = n(snap.offset_balance);
  const mortgage = n(snap.mortgage);
  const otherD   = n(snap.other_debts);

  const totalAssets = ppor + cash + offsetB + superB + stocks + crypto + cars + iranP;
  const totalDebt   = mortgage + otherD;

  // Expense volatility: check last 30 days vs prior 30 days from expense rows
  const now = Date.now();
  const last30 = (expenses || []).filter((e: any) => {
    const d = new Date(e.date || e.created_at || 0).getTime();
    return d > now - 30 * 86_400_000;
  }).reduce((s: number, e: any) => s + n(e.amount), 0);
  const prior30 = (expenses || []).filter((e: any) => {
    const d = new Date(e.date || e.created_at || 0).getTime();
    return d > now - 60 * 86_400_000 && d <= now - 30 * 86_400_000;
  }).reduce((s: number, e: any) => s + n(e.amount), 0);

  const spendSpike = prior30 > 0 ? ((last30 - prior30) / prior30) * 100 : 0;

  return {
    monthly_income:       n(snap.monthly_income),
    fara_monthly_income:  n(snap.fara_monthly_income) || 0,
    monthly_expenses:     n(snap.monthly_expenses),
    ppor,
    cash,
    offset_balance:       offsetB,
    super_combined:       superB,
    stocks,
    crypto,
    cars,
    iran_property:        iranP,
    total_assets:         totalAssets,
    mortgage,
    other_debts:          otherD,
    total_debt:           totalDebt,
    mortgage_rate:        n(snap.mortgage_rate) || 6.5,
    cash_emergency:       n(snap.cash_emergency),
    cash_savings:         n(snap.cash_savings),
    bills_total_monthly:  n(snap.monthly_bills) || 0,
    big_bills_next30:     0, // computed separately in cfoEngine
    fire_progress_pct:    n(snap.fire_progress_pct) || 0,
    has_dependants:       Boolean(snap.has_dependants),
    properties: (properties || []).map((p: any) => ({
      is_ppor:       p.is_ppor || p.property_type === 'PPOR' || false,
      weekly_rent:   n(p.weekly_rent),
      loan_amount:   n(p.loan_balance || p.loan_amount || p.mortgage_balance || 0),
      interest_rate: n(p.interest_rate) || 6.5,
      property_type: p.property_type || 'IP',
    })),
  };
}
