/**
 * whatIfEngine.ts — What-If Scenario Forecast + Goal Solver Engine
 *
 * PURPOSE:
 *   Sandbox-only calculation engine. Reads from scenario tables (sf_scenarios,
 *   sf_scenario_properties, etc.), never from the central ledger directly unless
 *   building a "Clone Base Plan" scenario.
 *
 *   All values are computed in-memory and written back to sf_scenario_results.
 *   The real dashboard/forecast engine is NEVER modified unless user clicks
 *   "Apply to Main Plan".
 *
 * KEY DESIGN:
 *   - Uses same PROFILE_PRESETS as forecastStore.ts
 *   - passive income = net rent + stock dividends + crypto yield (SWR-based)
 *   - Goal Solver produces 3–5 option paths using constraint-aware iteration
 *   - Monte Carlo uses same volatility params as existing fireMonteCarlo.ts
 *   - Year range: 2026–2035 (10 years)
 */

import { safeNum } from './mathUtils';
import { PROFILE_DEFAULTS } from './forecastStore';
import type { YearAssumptions } from './forecastStore';

// ─── Supabase config ──────────────────────────────────────────────────────────

const SB_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SB_KEY  = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY)
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const OWNER   = 'shahrokh-family-main';
const HDRS    = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sb(path: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: HDRS });
  if (!res.ok) return [];
  return res.json();
}

async function sbPost(path: string, body: any, method = 'POST'): Promise<any> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: HDRS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WiScenario {
  id: number;
  owner_id: string;
  name: string;
  description?: string;
  is_base_plan: boolean;
  forecast_mode: string;
  profile: string;
  target_passive_income: number;
  target_year: number;
  swr: number;
  include_super: boolean;
  include_ppor_equity: boolean;
  include_crypto: boolean;
  include_stocks: boolean;
  include_property_equity: boolean;
  snap_overrides?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface WiProperty {
  id?: number;
  scenario_id: number;
  property_name: string;
  is_ppor: boolean;
  purchase_year?: number;
  purchase_month: number;
  purchase_price: number;
  deposit_pct: number;
  stamp_duty: number;
  legal_cost: number;
  lmi: number;
  loan_amount: number;
  interest_rate: number;
  loan_type: 'IO' | 'PI';
  loan_term_years: number;
  rent_per_week: number;
  rental_growth_pct: number;
  vacancy_pct: number;
  management_fee_pct: number;
  council_rates_pa: number;
  insurance_pa: number;
  maintenance_pa: number;
  body_corporate_pa: number;
  land_tax_pa: number;
  other_costs_pa: number;
  expected_sale_year?: number;
  allow_equity_release: boolean;
  sort_order: number;
}

export interface WiStockPlan {
  id?: number;
  scenario_id: number;
  label: string;
  starting_value: number;
  lump_sum_amount: number;
  lump_sum_year?: number;
  lump_sum_month: number;
  dca_amount: number;
  dca_frequency: string;
  dca_start_year?: number;
  dca_end_year: number;
  return_mode: string;
  custom_return: number;
  dividend_yield: number;
}

export interface WiCryptoPlan {
  id?: number;
  scenario_id: number;
  label: string;
  starting_value: number;
  lump_sum_amount: number;
  lump_sum_year?: number;
  lump_sum_month: number;
  dca_amount: number;
  dca_frequency: string;
  dca_start_year?: number;
  dca_end_year: number;
  return_mode: string;
  custom_return: number;
  btc_pct: number;
  eth_pct: number;
  other_pct: number;
}

export interface WiAssumption {
  id?: number;
  scenario_id: number;
  year: number;
  property_growth: number;
  stocks_return: number;
  crypto_return: number;
  super_return: number;
  inflation: number;
  income_growth: number;
  expense_growth: number;
  interest_rate: number;
  rent_growth: number;
}

export interface WiYearResult {
  year: number;
  // Cash bridge
  openingCash: number;
  income: number;
  rentalIncome: number;
  taxRefund: number;
  stockDividends: number;
  cryptoYield: number;
  livingExpenses: number;
  mortgageRepayments: number;
  ipRepayments: number;
  propertyDeposits: number;
  buyingCosts: number;
  stockDCA: number;
  cryptoDCA: number;
  stockLumpSums: number;
  cryptoLumpSums: number;
  debtRepayments: number;
  closingCash: number;
  cashShortfall: number;   // max(0, -closingCash)
  // Asset values
  pporValue: number;
  pporLoan: number;
  ipValues: number;
  ipLoans: number;
  stockValue: number;
  cryptoValue: number;
  superValue: number;
  otherDebts: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accessibleNetWorth: number;  // excl. super
  // Passive income
  netRent: number;
  stockPassive: number;
  cryptoPassive: number;
  superPassive: number;       // only if include_super & past preservation age
  totalPassiveIncome: number;
  monthlyPassiveIncome: number;
  // FIRE
  fireAchieved: boolean;
}

export interface WiScenarioResult {
  scenarioId: number;
  scenarioName: string;
  years: WiYearResult[];
  // Target year snapshot
  targetYear: number;
  projectedPassiveIncome: number;   // monthly
  gapPerMonth: number;
  netWorthTargetYear: number;
  cashTargetYear: number;
  fireYear: number | null;
  propertyValueTargetYear: number;
  propertyLoansTargetYear: number;
  stockValueTargetYear: number;
  cryptoValueTargetYear: number;
  maxCashShortfall: number;
  riskScore: number;        // 1–10
  feasibilityScore: number; // 1–10
  // Capital requirement
  requiredCapital: number;
  currentProjectedCapital: number;
  capitalGap: number;
}

export interface GoalSolverOption {
  label: string;       // Option A, B, C, D, E
  name: string;        // e.g. "Property-Heavy"
  description: string;
  extraProperties: Array<{ year: number; price: number }>;
  stockDCAMonthly: number;
  cryptoDCAMonthly: number;
  projectedPassiveIncome: number;
  targetAchievedYear: number | null;
  gap: number;
  riskScore: number;        // 1–10
  feasibilityScore: number; // 1–10
  maxCashShortfall: number;
  isRecommended: boolean;
  reasoning: string[];
}

export interface MonteCarloWiResult {
  p10: number;
  p50: number;
  p90: number;
  probTargetPassive: number;    // % simulations that reach target by target year
  probFireByTarget: number;
  probCashNegative: number;
  probNeedRefinance: number;
  medianNetWorthTarget: number;
  worstCaseCashShortfall: number;
  fireYearDistribution: Record<number, number>; // year → count
  fanData: Array<{ year: number; p10: number; p50: number; p90: number }>;
}

// ─── DCA monthly equivalent ───────────────────────────────────────────────────

const DCA_MULT: Record<string, number> = {
  Weekly: 52 / 12,
  Fortnightly: 26 / 12,
  Monthly: 1,
  Quarterly: 1 / 3,
};

function dcaMonthly(amount: number, freq: string): number {
  return amount * (DCA_MULT[freq] ?? 1);
}

// ─── Resolve year assumptions ─────────────────────────────────────────────────

function resolveAss(
  year: number,
  mode: string,
  profile: string,
  overrides: WiAssumption[]
): WiAssumption {
  const base = PROFILE_DEFAULTS[profile as keyof typeof PROFILE_DEFAULTS] ?? PROFILE_DEFAULTS.moderate;
  const fallback: WiAssumption = {
    scenario_id: 0,
    year,
    property_growth: base.property_growth,
    stocks_return: base.stocks_return,
    crypto_return: base.crypto_return,
    super_return: base.super_return,
    inflation: base.inflation,
    income_growth: base.income_growth,
    expense_growth: base.expense_growth,
    interest_rate: base.interest_rate,
    rent_growth: base.rent_growth,
  };
  if (mode === 'year-by-year' && overrides.length > 0) {
    const match = overrides.find(r => r.year === year);
    return match ?? overrides[overrides.length - 1] ?? fallback;
  }
  return fallback;
}

// ─── Property cashflow ────────────────────────────────────────────────────────

interface PropState {
  value: number;
  loanBalance: number;
  yearlyIOCost: number;
  yearlyNetRent: number;
  yearlyGrossCost: number; // deposit + buying costs
  active: boolean;
}

function initPropState(
  p: WiProperty,
  year: number,
  ass: WiAssumption
): PropState {
  const purchaseYear = p.purchase_year ?? year;
  if (purchaseYear > year) return { value: 0, loanBalance: 0, yearlyIOCost: 0, yearlyNetRent: 0, yearlyGrossCost: 0, active: false };

  const yearsOwned = year - purchaseYear;
  const growth = 1 + safeNum(ass.property_growth) / 100;
  const rentGrowth = 1 + safeNum(ass.rent_growth) / 100;
  const value = safeNum(p.purchase_price) * Math.pow(growth, yearsOwned);

  // Loan
  const rate = safeNum(p.interest_rate) / 100;
  let loanBalance = safeNum(p.loan_amount);
  if (p.loan_type === 'PI' && yearsOwned > 0) {
    const monthly_r = rate / 12;
    const n = p.loan_term_years * 12;
    const paid_months = Math.min(yearsOwned * 12, n);
    if (monthly_r > 0) {
      const pmt = loanBalance * (monthly_r * Math.pow(1 + monthly_r, n)) / (Math.pow(1 + monthly_r, n) - 1);
      for (let m = 0; m < paid_months; m++) {
        const interest = loanBalance * monthly_r;
        loanBalance = Math.max(0, loanBalance - (pmt - interest));
      }
    }
  }
  const yearlyIOCost = loanBalance * rate;

  // Net rent
  const rentPW = safeNum(p.rent_per_week) * Math.pow(rentGrowth, yearsOwned);
  const grossRentPA = rentPW * 52 * (1 - safeNum(p.vacancy_pct) / 100);
  const mgmt = grossRentPA * safeNum(p.management_fee_pct) / 100;
  const holdingCosts = safeNum(p.council_rates_pa) + safeNum(p.insurance_pa) +
    safeNum(p.maintenance_pa) + safeNum(p.body_corporate_pa) +
    safeNum(p.land_tax_pa) + safeNum(p.other_costs_pa);
  const yearlyNetRent = grossRentPA - mgmt - holdingCosts;

  return { value, loanBalance, yearlyIOCost, yearlyNetRent, yearlyGrossCost: 0, active: true };
}

// ─── Main scenario forecast ───────────────────────────────────────────────────

export function runScenarioForecast(params: {
  scenario: WiScenario;
  properties: WiProperty[];
  stockPlans: WiStockPlan[];
  cryptoPlans: WiCryptoPlan[];
  assumptions: WiAssumption[];
  snap: any; // central ledger snapshot (read-only)
}): WiScenarioResult {
  const { scenario, properties, stockPlans, cryptoPlans, assumptions, snap } = params;
  const startYear = 2026;
  const targetYear = scenario.target_year;
  const yearsToRun = targetYear - startYear + 1;

  // Starting values from snapshot (or scenario snap_overrides)
  const ov = scenario.snap_overrides ?? {};
  const monthlyIncome = safeNum(ov.monthly_income ?? snap?.monthly_income ?? 22000);
  const monthlyExpenses = safeNum(ov.monthly_expenses ?? snap?.monthly_expenses ?? 8000);
  const startCash = safeNum(ov.cash ?? snap?.cash ?? 0) + safeNum(ov.offset_balance ?? snap?.offset_balance ?? 0) +
    safeNum(ov.savings_cash ?? snap?.savings_cash ?? 0) + safeNum(ov.emergency_cash ?? snap?.emergency_cash ?? 0);
  const pporValue0 = safeNum(ov.ppor ?? snap?.ppor ?? 0);
  const pporLoan0  = safeNum(ov.mortgage ?? snap?.mortgage ?? 0);
  const stockValue0 = safeNum(ov.stocks ?? snap?.stocks ?? 0);
  const cryptoValue0 = safeNum(ov.crypto ?? snap?.crypto ?? 0);
  const superValue0 = safeNum(ov.super_balance ?? snap?.super_balance ?? 0);
  const otherDebts0 = safeNum(ov.other_debts ?? snap?.other_debts ?? 0);
  const mortgageRate = safeNum(ov.mortgage_rate ?? snap?.mortgage_rate ?? 6.25) / 100;

  const swr = safeNum(scenario.swr) / 100;
  const emergencyBuffer = monthlyExpenses * 6;

  // State
  let cash = startCash;
  let pporV = pporValue0;
  let pporLoan = pporLoan0;
  let stockV = stockValue0;
  let cryptoV = cryptoValue0;
  let superV = superValue0;
  let otherDebts = otherDebts0;
  let curMonthlyIncome = monthlyIncome;
  let curMonthlyExpenses = monthlyExpenses;

  const years: WiYearResult[] = [];
  let fireYear: number | null = null;
  let maxCashShortfall = 0;

  for (let yi = 0; yi < yearsToRun; yi++) {
    const year = startYear + yi;
    const ass = resolveAss(year, scenario.forecast_mode, scenario.profile, assumptions);

    // Income / expense growth
    if (yi > 0) {
      curMonthlyIncome  *= (1 + safeNum(ass.income_growth)  / 100);
      curMonthlyExpenses *= (1 + safeNum(ass.expense_growth) / 100);
    }
    const annualIncome   = curMonthlyIncome * 12;
    const annualExpenses = curMonthlyExpenses * 12;

    // PPOR
    pporV    *= (1 + safeNum(ass.property_growth) / 100);
    const pporRate   = mortgageRate;
    const pporIOCost = pporLoan * pporRate;
    // Simple P&I principal reduction
    const pporPrincipalPay = pporLoan > 0 ? Math.min(pporLoan, annualIncome * 0.1) : 0;
    pporLoan = Math.max(0, pporLoan - pporPrincipalPay);
    const pporRepayments = pporIOCost + pporPrincipalPay;

    // Investment properties active this year
    let ipValues = 0;
    let ipLoans = 0;
    let ipRepayments = 0;
    let netRentTotal = 0;
    let depositCostsThisYear = 0;

    for (const p of properties) {
      if (p.is_ppor) continue;
      const purchaseYear = p.purchase_year ?? year;
      if (purchaseYear > year) continue;

      const yearsOwned = year - purchaseYear;
      const growth = 1 + safeNum(ass.property_growth) / 100;
      const rentGrowth = 1 + safeNum(ass.rent_growth) / 100;
      const propV = safeNum(p.purchase_price) * Math.pow(growth, yearsOwned);
      ipValues += propV;

      // Loan
      const rate = safeNum(p.interest_rate) / 100;
      let lbal = safeNum(p.loan_amount);
      if (p.loan_type === 'PI' && yearsOwned > 0) {
        const mr = rate / 12;
        const n = p.loan_term_years * 12;
        const pm = Math.min(yearsOwned * 12, n);
        if (mr > 0) {
          const pmt = lbal * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
          for (let m = 0; m < pm; m++) {
            const int = lbal * mr;
            lbal = Math.max(0, lbal - (pmt - int));
          }
        }
      }
      ipLoans += lbal;
      const annualInt = lbal * rate;
      ipRepayments += annualInt;

      // Net rent
      const rentPW = safeNum(p.rent_per_week) * Math.pow(rentGrowth, yearsOwned);
      const grossRentPA = rentPW * 52 * (1 - safeNum(p.vacancy_pct) / 100);
      const mgmt = grossRentPA * safeNum(p.management_fee_pct) / 100;
      const holdCosts = safeNum(p.council_rates_pa) + safeNum(p.insurance_pa) +
        safeNum(p.maintenance_pa) + safeNum(p.body_corporate_pa) +
        safeNum(p.land_tax_pa) + safeNum(p.other_costs_pa);
      netRentTotal += grossRentPA - mgmt - holdCosts - annualInt;

      // Deposit + buying costs (only in purchase year, after purchase month)
      if (purchaseYear === year) {
        const deposit = safeNum(p.purchase_price) * safeNum(p.deposit_pct) / 100;
        depositCostsThisYear += deposit + safeNum(p.stamp_duty) + safeNum(p.legal_cost) + safeNum(p.lmi);
      }
    }

    // Stocks
    const stockAssReturn = safeNum(ass.stocks_return) / 100;
    let stockDCA = 0;
    let stockLumpSum = 0;
    for (const sp of stockPlans) {
      const dcaStart = sp.dca_start_year ?? startYear;
      const dcaEnd   = sp.dca_end_year ?? targetYear;
      if (year >= dcaStart && year <= dcaEnd) {
        stockDCA += dcaMonthly(safeNum(sp.dca_amount), sp.dca_frequency) * 12;
      }
      if (sp.lump_sum_year === year && sp.lump_sum_amount > 0) {
        stockLumpSum += safeNum(sp.lump_sum_amount);
      }
    }
    const stockReturn = safeNum(ass.stocks_return);
    stockV = (stockV + stockDCA / 2 + stockLumpSum / 2) * (1 + stockReturn / 100) +
             stockDCA / 2 + stockLumpSum / 2;

    // Crypto
    let cryptoDCA = 0;
    let cryptoLumpSum = 0;
    for (const cp of cryptoPlans) {
      const dcaStart = cp.dca_start_year ?? startYear;
      const dcaEnd   = cp.dca_end_year ?? targetYear;
      if (year >= dcaStart && year <= dcaEnd) {
        cryptoDCA += dcaMonthly(safeNum(cp.dca_amount), cp.dca_frequency) * 12;
      }
      if (cp.lump_sum_year === year && cp.lump_sum_amount > 0) {
        cryptoLumpSum += safeNum(cp.lump_sum_amount);
      }
    }
    const cryptoReturn = safeNum(ass.crypto_return);
    cryptoV = (cryptoV + cryptoDCA / 2 + cryptoLumpSum / 2) * (1 + cryptoReturn / 100) +
              cryptoDCA / 2 + cryptoLumpSum / 2;

    // Super
    const superReturn = safeNum(ass.super_return);
    const superContr = annualIncome * 0.115; // 11.5% SGC
    superV = (superV + superContr / 2) * (1 + superReturn / 100) + superContr / 2;

    // Other debts reduce over time
    otherDebts = Math.max(0, otherDebts - annualIncome * 0.03);
    const otherDebtRepayments = annualIncome * 0.03;

    // Negative gearing tax refund (simplified: 32.5% of net loss)
    const ngLoss = Math.max(0, -(netRentTotal));
    const taxRefund = ngLoss > 0 ? ngLoss * 0.325 : 0;

    // Dividend income
    const stockDividends = stockV * 0.02; // 2% dividend yield
    const cryptoYield = 0; // crypto yield = 0 (withdrawal via SWR only)

    // Cash flow for the year
    const openingCash = cash;
    const inflows = annualIncome + netRentTotal + taxRefund + stockDividends;
    const outflows = annualExpenses + pporRepayments + ipRepayments +
                     depositCostsThisYear + stockDCA + stockLumpSum +
                     cryptoDCA + cryptoLumpSum + otherDebtRepayments;

    cash = openingCash + inflows - outflows;
    const cashShortfall = Math.max(0, -cash + emergencyBuffer * 0.5);
    if (cashShortfall > maxCashShortfall) maxCashShortfall = cashShortfall;

    // Passive income this year
    const stockPassive = scenario.include_stocks ? (stockV * swr) : 0;
    const cryptoPassive = scenario.include_crypto ? (cryptoV * Math.min(swr, 0.02)) : 0; // crypto: lower rate
    const propertyPassive = scenario.include_property_equity ? Math.max(0, netRentTotal) : 0;
    // Super: only if 60+ (assumption: user can access super from 2039+ for typical age)
    const superPassive = scenario.include_super && year >= 2039 ? (superV * swr) : 0;
    const totalPassivePA = stockPassive + cryptoPassive + propertyPassive + superPassive;
    const monthlyPassive = totalPassivePA / 12;

    // Total assets / liabilities
    const totalAssets = Math.max(0, cash) + pporV + ipValues + stockV + cryptoV + superV;
    const totalLiab = pporLoan + ipLoans + Math.max(0, otherDebts);
    const netWorth = totalAssets - totalLiab;
    const accessibleNW = totalAssets - superV - totalLiab;

    // FIRE check
    const fireAchieved = monthlyPassive >= scenario.target_passive_income;
    if (fireAchieved && fireYear === null) fireYear = year;

    years.push({
      year,
      openingCash,
      income: annualIncome,
      rentalIncome: Math.max(0, netRentTotal + ipRepayments), // gross rent
      taxRefund,
      stockDividends,
      cryptoYield,
      livingExpenses: annualExpenses,
      mortgageRepayments: pporRepayments,
      ipRepayments,
      propertyDeposits: depositCostsThisYear,
      buyingCosts: 0,
      stockDCA,
      cryptoDCA,
      stockLumpSums: stockLumpSum,
      cryptoLumpSums: cryptoLumpSum,
      debtRepayments: otherDebtRepayments,
      closingCash: cash,
      cashShortfall,
      pporValue: pporV,
      pporLoan,
      ipValues,
      ipLoans,
      stockValue: stockV,
      cryptoValue: cryptoV,
      superValue: superV,
      otherDebts,
      totalAssets,
      totalLiabilities: totalLiab,
      netWorth,
      accessibleNetWorth: accessibleNW,
      netRent: Math.max(0, netRentTotal),
      stockPassive,
      cryptoPassive,
      superPassive,
      totalPassiveIncome: totalPassivePA,
      monthlyPassiveIncome: monthlyPassive,
      fireAchieved,
    });
  }

  const targetYearResult = years.find(y => y.year === targetYear) ?? years[years.length - 1];
  const projected = targetYearResult?.monthlyPassiveIncome ?? 0;
  const gap = scenario.target_passive_income - projected;

  // Required capital = (target × 12) / SWR
  const requiredCapital = (scenario.target_passive_income * 12) / swr;
  const currentProjectedCapital = (targetYearResult?.stockValue ?? 0) +
    (scenario.include_crypto ? (targetYearResult?.cryptoValue ?? 0) : 0) +
    (scenario.include_property_equity ? (targetYearResult?.ipValues ?? 0) - (targetYearResult?.ipLoans ?? 0) : 0) +
    (scenario.include_super ? (targetYearResult?.superValue ?? 0) : 0);
  const capitalGap = Math.max(0, requiredCapital - currentProjectedCapital);

  // Risk score (1–10): more IPs + high crypto = higher risk
  const ipCount = properties.filter(p => !p.is_ppor && (p.purchase_year ?? 0) <= targetYear).length;
  const hasCrypto = cryptoPlans.some(c => c.dca_amount > 0 || c.starting_value > 0);
  const riskScore = Math.min(10, Math.max(1,
    2 + ipCount * 1.5 + (hasCrypto ? 1 : 0) + (maxCashShortfall > 50000 ? 2 : 0)
  ));

  // Feasibility score (1–10): gap < 20% = 9, gap < 40% = 7, etc.
  const gapPct = projected > 0 ? gap / scenario.target_passive_income : 1;
  const feasibilityScore = gapPct <= 0 ? 10 : gapPct <= 0.1 ? 9 :
    gapPct <= 0.2 ? 8 : gapPct <= 0.35 ? 7 : gapPct <= 0.5 ? 5 :
    gapPct <= 0.7 ? 3 : 2;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    years,
    targetYear,
    projectedPassiveIncome: projected,
    gapPerMonth: gap,
    netWorthTargetYear: targetYearResult?.netWorth ?? 0,
    cashTargetYear: targetYearResult?.closingCash ?? 0,
    fireYear,
    propertyValueTargetYear: targetYearResult?.ipValues ?? 0,
    propertyLoansTargetYear: targetYearResult?.ipLoans ?? 0,
    stockValueTargetYear: targetYearResult?.stockValue ?? 0,
    cryptoValueTargetYear: targetYearResult?.cryptoValue ?? 0,
    maxCashShortfall,
    riskScore: Math.round(riskScore),
    feasibilityScore,
    requiredCapital,
    currentProjectedCapital,
    capitalGap,
  };
}

// ─── Goal Solver ──────────────────────────────────────────────────────────────

export interface GoalSolverConstraints {
  maxIPs: number;
  maxPropertyPrice: number;
  minCashBuffer: number;
  maxStockDCAMonthly: number;
  maxCryptoDCAMonthly: number;
  maxAnnualNegativeCF: number;
  preferredRisk: 'low' | 'medium' | 'high';
}

export const DEFAULT_SOLVER_CONSTRAINTS: GoalSolverConstraints = {
  maxIPs: 5,
  maxPropertyPrice: 1000000,
  minCashBuffer: 30000,
  maxStockDCAMonthly: 5000,
  maxCryptoDCAMonthly: 3000,
  maxAnnualNegativeCF: -30000,
  preferredRisk: 'medium',
};

function estimatePassiveIncome(params: {
  snap: any;
  scenario: WiScenario;
  extraIPs: Array<{ year: number; price: number }>;
  stockDCAMonthly: number;
  cryptoDCAMonthly: number;
  assumptions: WiAssumption[];
}): number {
  const { snap, scenario, extraIPs, stockDCAMonthly, cryptoDCAMonthly, assumptions } = params;

  const props: WiProperty[] = extraIPs.map((ip, i) => ({
    scenario_id: 0,
    id: undefined,
    property_name: `IP ${i + 1}`,
    is_ppor: false,
    purchase_year: ip.year,
    purchase_month: 7,
    purchase_price: ip.price,
    deposit_pct: 20,
    stamp_duty: ip.price * 0.04,
    legal_cost: 2500,
    lmi: 0,
    loan_amount: ip.price * 0.8,
    interest_rate: 6.25,
    loan_type: 'IO' as const,
    loan_term_years: 30,
    rent_per_week: (ip.price * 0.04) / 52, // 4% gross yield
    rental_growth_pct: 3,
    vacancy_pct: 3,
    management_fee_pct: 8,
    council_rates_pa: 2000,
    insurance_pa: 1500,
    maintenance_pa: 2000,
    body_corporate_pa: 0,
    land_tax_pa: 0,
    other_costs_pa: 0,
    expected_sale_year: undefined,
    allow_equity_release: false,
    sort_order: i,
  }));

  const stockPlan: WiStockPlan[] = [{
    scenario_id: 0,
    label: 'Stocks',
    starting_value: safeNum(snap?.stocks ?? 0),
    lump_sum_amount: 0,
    lump_sum_year: undefined,
    lump_sum_month: 1,
    dca_amount: stockDCAMonthly,
    dca_frequency: 'Monthly',
    dca_start_year: 2026,
    dca_end_year: scenario.target_year,
    return_mode: 'profile',
    custom_return: 10,
    dividend_yield: 2,
  }];

  const cryptoPlan: WiCryptoPlan[] = [{
    scenario_id: 0,
    label: 'Crypto',
    starting_value: safeNum(snap?.crypto ?? 0),
    lump_sum_amount: 0,
    lump_sum_year: undefined,
    lump_sum_month: 1,
    dca_amount: cryptoDCAMonthly,
    dca_frequency: 'Monthly',
    dca_start_year: 2026,
    dca_end_year: scenario.target_year,
    return_mode: 'profile',
    custom_return: 20,
    btc_pct: 60,
    eth_pct: 30,
    other_pct: 10,
  }];

  const result = runScenarioForecast({
    scenario,
    properties: props,
    stockPlans: stockPlan,
    cryptoPlans: cryptoPlan,
    assumptions,
    snap,
  });

  return result.projectedPassiveIncome;
}

export function runGoalSolver(params: {
  scenario: WiScenario;
  basePropCount: number;
  currentStockDCAMonthly: number;
  currentCryptoDCAMonthly: number;
  assumptions: WiAssumption[];
  snap: any;
  constraints?: GoalSolverConstraints;
}): GoalSolverOption[] {
  const { scenario, basePropCount, currentStockDCAMonthly, currentCryptoDCAMonthly, assumptions, snap } = params;
  const c = params.constraints ?? DEFAULT_SOLVER_CONSTRAINTS;
  const target = scenario.target_passive_income;
  const targetYear = scenario.target_year;

  const OPTION_TEMPLATES: Array<{
    label: string; name: string;
    ipPlan: Array<{ year: number; price: number }>;
    stockMult: number; cryptoMult: number;
  }> = [
    {
      label: 'Option A', name: 'Property-Heavy',
      ipPlan: [
        { year: 2027, price: Math.min(900000, c.maxPropertyPrice) },
        { year: 2029, price: Math.min(850000, c.maxPropertyPrice) },
        { year: 2031, price: Math.min(900000, c.maxPropertyPrice) },
        { year: 2033, price: Math.min(850000, c.maxPropertyPrice) },
      ].slice(0, Math.max(0, c.maxIPs - basePropCount)),
      stockMult: 1.0, cryptoMult: 1.0,
    },
    {
      label: 'Option B', name: 'Balanced',
      ipPlan: [
        { year: 2028, price: Math.min(850000, c.maxPropertyPrice) },
        { year: 2031, price: Math.min(900000, c.maxPropertyPrice) },
      ].slice(0, Math.max(0, c.maxIPs - basePropCount)),
      stockMult: 1.5, cryptoMult: 1.3,
    },
    {
      label: 'Option C', name: 'Market-Heavy',
      ipPlan: [
        { year: 2029, price: Math.min(850000, c.maxPropertyPrice) },
      ].slice(0, Math.max(0, c.maxIPs - basePropCount)),
      stockMult: 2.2, cryptoMult: 1.5,
    },
    {
      label: 'Option D', name: 'Conservative',
      ipPlan: [
        { year: 2030, price: Math.min(800000, c.maxPropertyPrice) },
      ].slice(0, Math.max(0, c.maxIPs - basePropCount)),
      stockMult: 1.2, cryptoMult: 1.0,
    },
    {
      label: 'Option E', name: 'Crypto-Boosted',
      ipPlan: [
        { year: 2028, price: Math.min(850000, c.maxPropertyPrice) },
      ].slice(0, Math.max(0, c.maxIPs - basePropCount)),
      stockMult: 1.3, cryptoMult: 3.0,
    },
  ];

  const results: GoalSolverOption[] = [];

  for (const tmpl of OPTION_TEMPLATES) {
    const stockDCA = Math.min(currentStockDCAMonthly * tmpl.stockMult, c.maxStockDCAMonthly);
    const cryptoDCA = Math.min(currentCryptoDCAMonthly * tmpl.cryptoMult, c.maxCryptoDCAMonthly);

    const projected = estimatePassiveIncome({
      snap, scenario,
      extraIPs: tmpl.ipPlan,
      stockDCAMonthly: stockDCA,
      cryptoDCAMonthly: cryptoDCA,
      assumptions,
    });

    const gap = target - projected;
    const ipCount = basePropCount + tmpl.ipPlan.length;

    // Risk scoring
    const riskBase = ipCount > 3 ? 7 : ipCount > 1 ? 5 : 3;
    const cryptoRisk = cryptoDCA > 2000 ? 2 : cryptoDCA > 1000 ? 1 : 0;
    const riskScore = Math.min(10, riskBase + cryptoRisk);

    // Feasibility
    const gapPct = projected > 0 ? gap / target : 1;
    const feasibility = gapPct <= 0 ? 10 : gapPct <= 0.1 ? 9 : gapPct <= 0.25 ? 7 :
      gapPct <= 0.5 ? 5 : 3;

    // Estimate target achieved year (simplified: if projected > target it's by targetYear)
    const achievedYear = projected >= target ? targetYear : projected >= target * 0.85 ? targetYear + 1 :
      projected >= target * 0.7 ? targetYear + 2 : null;

    // Reasoning bullets
    const reasoning: string[] = [];
    if (tmpl.ipPlan.length > 0) {
      tmpl.ipPlan.forEach(ip => reasoning.push(`Buy IP at $${(ip.price / 1000).toFixed(0)}K in ${ip.year}`));
    }
    if (stockDCA !== currentStockDCAMonthly) {
      reasoning.push(`${stockDCA > currentStockDCAMonthly ? 'Increase' : 'Keep'} stock DCA to $${stockDCA.toLocaleString()}/month`);
    }
    if (cryptoDCA !== currentCryptoDCAMonthly) {
      reasoning.push(`${cryptoDCA > currentCryptoDCAMonthly ? 'Increase' : 'Keep'} crypto DCA to $${cryptoDCA.toLocaleString()}/month`);
    }
    if (gap <= 0) reasoning.push(`Target of $${target.toLocaleString()}/month achieved by ${targetYear}`);
    else reasoning.push(`Gap of $${Math.round(gap).toLocaleString()}/month remaining — target extends to ${achievedYear ?? 'beyond 2040'}`);

    results.push({
      label: tmpl.label,
      name: tmpl.name,
      description: `${tmpl.ipPlan.length > 0 ? tmpl.ipPlan.length + ' new IPs' : 'No new IPs'} · Stock DCA $${stockDCA.toLocaleString()}/mo · Crypto DCA $${cryptoDCA.toLocaleString()}/mo`,
      extraProperties: tmpl.ipPlan,
      stockDCAMonthly: stockDCA,
      cryptoDCAMonthly: cryptoDCA,
      projectedPassiveIncome: projected,
      targetAchievedYear: achievedYear,
      gap,
      riskScore,
      feasibilityScore: feasibility,
      maxCashShortfall: 0, // simplified
      isRecommended: false,
      reasoning,
    });
  }

  // Mark recommended: highest feasibility with acceptable risk
  const acceptable = results.filter(r => r.riskScore <= 7 && r.feasibilityScore >= 7);
  const best = acceptable.length > 0
    ? acceptable.sort((a, b) => b.feasibilityScore - a.feasibilityScore)[0]
    : results.sort((a, b) => b.feasibilityScore - a.feasibilityScore)[0];
  if (best) best.isRecommended = true;

  return results;
}

// ─── Monte Carlo (What-If sandbox) ───────────────────────────────────────────

export function runWiMonteCarlo(params: {
  scenario: WiScenario;
  properties: WiProperty[];
  stockPlans: WiStockPlan[];
  cryptoPlans: WiCryptoPlan[];
  assumptions: WiAssumption[];
  snap: any;
  simulations?: number;
}): MonteCarloWiResult {
  const { scenario, properties, stockPlans, cryptoPlans, assumptions, snap, simulations = 1000 } = params;
  const targetYear = scenario.target_year;
  const targetMonthly = scenario.target_passive_income;
  const swr = scenario.swr / 100;

  const profile = PROFILE_DEFAULTS[scenario.profile as keyof typeof PROFILE_DEFAULTS] ?? PROFILE_DEFAULTS.moderate;
  const base_prop_g   = profile.property_growth;
  const base_stock_r  = profile.stocks_return;
  const base_crypto_r = profile.crypto_return;
  const base_inflation = profile.inflation;

  const prop_vol   = 5;
  const stock_vol  = 18;
  const crypto_vol = 60;
  const inf_vol    = 0.5;

  // Box-Muller
  function randn(): number {
    const u = Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v);
  }

  const startYear = 2026;
  const yearsToRun = targetYear - startYear + 1;
  const targetPassiveCount: Record<number, number> = {};
  const fireYearCounts: Record<number, number> = {};
  const netWorths: number[] = [];
  let cashNegCount = 0;
  let refinanceCount = 0;

  const fanAccum: Record<number, number[]> = {};
  for (let y = startYear; y <= targetYear; y++) fanAccum[y] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let cash = safeNum(snap?.cash ?? 0) + safeNum(snap?.offset_balance ?? 0);
    let stockV = safeNum(snap?.stocks ?? 0);
    let cryptoV = safeNum(snap?.crypto ?? 0);
    let ipValue = 0;
    let ipLoan = 0;
    let pporV = safeNum(snap?.ppor ?? 0);
    let pporLoan = safeNum(snap?.mortgage ?? 0);
    let inc = safeNum(snap?.monthly_income ?? 22000) * 12;
    let exp = safeNum(snap?.monthly_expenses ?? 8000) * 12;
    let cashNegThisSim = false;
    let fireYearSim: number | null = null;

    for (let yi = 0; yi < yearsToRun; yi++) {
      const year = startYear + yi;

      const propG   = base_prop_g + randn() * prop_vol;
      const stockR  = base_stock_r + randn() * stock_vol;
      const cryptoR = base_crypto_r + randn() * crypto_vol;
      const infl    = base_inflation + randn() * inf_vol;

      inc *= (1 + 3.5 / 100);
      exp *= (1 + infl / 100);

      // Properties
      pporV *= (1 + Math.max(-20, Math.min(50, propG)) / 100);
      for (const p of properties) {
        const purchaseYear = p.purchase_year ?? year;
        if (purchaseYear > year) continue;
        const yearsOwned = year - purchaseYear;
        ipValue += safeNum(p.purchase_price) * (1 + Math.max(-20, Math.min(50, propG)) / 100);
        if (purchaseYear === year) {
          const dep = safeNum(p.purchase_price) * safeNum(p.deposit_pct) / 100;
          cash -= dep + safeNum(p.stamp_duty) + safeNum(p.legal_cost);
          ipLoan += safeNum(p.loan_amount);
        }
      }

      // Stocks
      const sr = Math.max(-60, Math.min(150, stockR));
      let sContrib = 0;
      for (const sp of stockPlans) {
        const dStart = sp.dca_start_year ?? startYear;
        const dEnd = sp.dca_end_year ?? targetYear;
        if (year >= dStart && year <= dEnd) sContrib += dcaMonthly(sp.dca_amount, sp.dca_frequency) * 12;
      }
      stockV = (stockV + sContrib / 2) * (1 + sr / 100) + sContrib / 2;

      // Crypto
      const cr = Math.max(-90, Math.min(500, cryptoR));
      let cContrib = 0;
      for (const cp of cryptoPlans) {
        const dStart = cp.dca_start_year ?? startYear;
        const dEnd = cp.dca_end_year ?? targetYear;
        if (year >= dStart && year <= dEnd) cContrib += dcaMonthly(cp.dca_amount, cp.dca_frequency) * 12;
      }
      cryptoV = (cryptoV + cContrib / 2) * (1 + cr / 100) + cContrib / 2;

      // Cashflow
      const pporRepay = pporLoan * 0.0625;
      const ipRepay = ipLoan * 0.0625;
      cash = cash + inc - exp - pporRepay - ipRepay - sContrib - cContrib;
      if (cash < 0) cashNegThisSim = true;
      if (pporLoan > 0 && (pporV + ipValue) / Math.max(1, pporLoan + ipLoan) < 0.2) refinanceCount++;

      // Passive income
      const netW = cash + pporV + ipValue + stockV + cryptoV - pporLoan - ipLoan;
      fanAccum[year].push(netW);

      const passiveMonthly = ((stockV * swr) + (cryptoV * Math.min(swr, 0.02)) + Math.max(0, (inc * 0.04))) / 12;
      if (passiveMonthly >= targetMonthly && fireYearSim === null) {
        fireYearSim = year;
        fireYearCounts[year] = (fireYearCounts[year] ?? 0) + 1;
      }
    }

    const finalNW = cash + pporV + ipValue + stockV + cryptoV - pporLoan - ipLoan;
    netWorths.push(finalNW);
    if (cashNegThisSim) cashNegCount++;
    if (fireYearSim !== null) targetPassiveCount[targetYear] = (targetPassiveCount[targetYear] ?? 0) + 1;
  }

  netWorths.sort((a, b) => a - b);
  const p10 = netWorths[Math.floor(simulations * 0.1)] ?? 0;
  const p50 = netWorths[Math.floor(simulations * 0.5)] ?? 0;
  const p90 = netWorths[Math.floor(simulations * 0.9)] ?? 0;
  const probTarget = ((targetPassiveCount[targetYear] ?? 0) / simulations) * 100;

  const fanData = Object.entries(fanAccum).map(([yr, vals]) => {
    vals.sort((a, b) => a - b);
    return {
      year: parseInt(yr),
      p10: vals[Math.floor(vals.length * 0.1)] ?? 0,
      p50: vals[Math.floor(vals.length * 0.5)] ?? 0,
      p90: vals[Math.floor(vals.length * 0.9)] ?? 0,
    };
  }).sort((a, b) => a.year - b.year);

  return {
    p10, p50, p90,
    probTargetPassive: Math.round(probTarget * 10) / 10,
    probFireByTarget: Math.round(probTarget * 10) / 10,
    probCashNegative: Math.round((cashNegCount / simulations) * 100 * 10) / 10,
    probNeedRefinance: Math.round((refinanceCount / simulations / yearsToRun) * 100 * 10) / 10,
    medianNetWorthTarget: p50,
    worstCaseCashShortfall: 0,
    fireYearDistribution: fireYearCounts,
    fanData,
  };
}

// ─── Supabase CRUD ────────────────────────────────────────────────────────────

export async function loadScenarios(): Promise<WiScenario[]> {
  return sb(`sf_scenarios?owner_id=eq.${OWNER}&order=created_at.asc`);
}

export async function saveScenario(s: Partial<WiScenario>): Promise<WiScenario> {
  const payload = { ...s, owner_id: OWNER, updated_at: new Date().toISOString() };
  const res = await sbPost(
    s.id ? `sf_scenarios?id=eq.${s.id}` : 'sf_scenarios',
    payload,
    s.id ? 'PATCH' : 'POST'
  );
  return Array.isArray(res) ? res[0] : res;
}

export async function deleteScenario(id: number): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/sf_scenarios?id=eq.${id}`, { method: 'DELETE', headers: HDRS });
}

export async function loadScenarioProperties(scenarioId: number): Promise<WiProperty[]> {
  return sb(`sf_scenario_properties?scenario_id=eq.${scenarioId}&order=sort_order.asc`);
}

export async function saveProperty(p: Partial<WiProperty>): Promise<WiProperty> {
  const res = await sbPost(
    p.id ? `sf_scenario_properties?id=eq.${p.id}` : 'sf_scenario_properties',
    p, p.id ? 'PATCH' : 'POST'
  );
  return Array.isArray(res) ? res[0] : res;
}

export async function deleteProperty(id: number): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/sf_scenario_properties?id=eq.${id}`, { method: 'DELETE', headers: HDRS });
}

export async function loadScenarioStockPlans(scenarioId: number): Promise<WiStockPlan[]> {
  return sb(`sf_scenario_stock_plans?scenario_id=eq.${scenarioId}`);
}

export async function saveStockPlan(p: Partial<WiStockPlan>): Promise<WiStockPlan> {
  const res = await sbPost(
    p.id ? `sf_scenario_stock_plans?id=eq.${p.id}` : 'sf_scenario_stock_plans',
    p, p.id ? 'PATCH' : 'POST'
  );
  return Array.isArray(res) ? res[0] : res;
}

export async function loadScenarioCryptoPlans(scenarioId: number): Promise<WiCryptoPlan[]> {
  return sb(`sf_scenario_crypto_plans?scenario_id=eq.${scenarioId}`);
}

export async function saveCryptoPlan(p: Partial<WiCryptoPlan>): Promise<WiCryptoPlan> {
  const res = await sbPost(
    p.id ? `sf_scenario_crypto_plans?id=eq.${p.id}` : 'sf_scenario_crypto_plans',
    p, p.id ? 'PATCH' : 'POST'
  );
  return Array.isArray(res) ? res[0] : res;
}

export async function loadScenarioAssumptions(scenarioId: number): Promise<WiAssumption[]> {
  return sb(`sf_scenario_assumptions?scenario_id=eq.${scenarioId}&order=year.asc`);
}

export async function saveAssumptions(rows: WiAssumption[]): Promise<void> {
  if (rows.length === 0) return;
  await sbPost(
    `sf_scenario_assumptions?on_conflict=scenario_id,year`,
    rows,
    'POST'
  );
}

export async function saveScenarioResult(r: Partial<any> & { scenario_id: number }): Promise<void> {
  // Delete previous result for this scenario first
  await fetch(`${SB_URL}/rest/v1/sf_scenario_results?scenario_id=eq.${r.scenario_id}`, {
    method: 'DELETE', headers: HDRS,
  });
  await sbPost('sf_scenario_results', r);
}

// ─── Clone base plan ──────────────────────────────────────────────────────────

export async function cloneBasePlan(snap: any, existingProperties: any[], name = 'Base Plan Clone'): Promise<WiScenario> {
  // Create scenario row
  const scenario = await saveScenario({
    name,
    description: 'Cloned from current central ledger',
    is_base_plan: true,
    forecast_mode: 'profile',
    profile: 'moderate',
    target_passive_income: 20000,
    target_year: 2035,
    swr: 3.5,
    include_super: true,
    include_ppor_equity: false,
    include_crypto: true,
    include_stocks: true,
    include_property_equity: true,
    snap_overrides: {
      monthly_income: snap?.monthly_income,
      monthly_expenses: snap?.monthly_expenses,
      cash: snap?.cash,
      offset_balance: snap?.offset_balance,
      savings_cash: snap?.savings_cash,
      emergency_cash: snap?.emergency_cash,
      ppor: snap?.ppor,
      mortgage: snap?.mortgage,
      stocks: snap?.stocks,
      crypto: snap?.crypto,
      super_balance: snap?.super_balance,
      other_debts: snap?.other_debts,
    },
  });

  // Clone properties (investment only — PPOR is in snap_overrides)
  for (let i = 0; i < existingProperties.length; i++) {
    const ep = existingProperties[i];
    await saveProperty({
      scenario_id: scenario.id,
      property_name: ep.name ?? ep.address ?? `Property ${i + 1}`,
      is_ppor: ep.is_ppor ?? false,
      purchase_year: ep.purchase_year ?? new Date(ep.purchase_date ?? Date.now()).getFullYear(),
      purchase_month: 7,
      purchase_price: ep.purchase_price ?? ep.current_value ?? 0,
      deposit_pct: 20,
      stamp_duty: 0,
      legal_cost: 0,
      lmi: 0,
      loan_amount: ep.loan_balance ?? ep.mortgage_balance ?? 0,
      interest_rate: ep.interest_rate ?? 6.25,
      loan_type: 'IO',
      loan_term_years: 30,
      rent_per_week: ep.weekly_rent ?? ep.rent_per_week ?? 0,
      rental_growth_pct: 3,
      vacancy_pct: 3,
      management_fee_pct: 8,
      council_rates_pa: 2000,
      insurance_pa: 1500,
      maintenance_pa: 2000,
      body_corporate_pa: 0,
      land_tax_pa: 0,
      other_costs_pa: 0,
      allow_equity_release: false,
      sort_order: i,
    });
  }

  return scenario;
}

// ─── Exit Strategy Engine ─────────────────────────────────────────────────────

/** Which assets to liquidate at exit year */
export interface ExitAssetSelection {
  // Properties: array of WiProperty IDs (or all if empty = sell all IPs)
  propertyIds: number[];       // empty = sell all non-PPOR properties
  sellAllIPs: boolean;
  // Stocks: 0–100%
  stocksPct: number;           // 0–100
  // Crypto: 0–100%
  cryptoPct: number;           // 0–100
}

/** How proceeds are deployed after tax */
export interface ReinvestmentAllocation {
  etfGrowthPct: number;       // % → ETF (growth-focused, e.g. VGS/VAS)
  etfDividendPct: number;     // % → ETF (high-yield, e.g. VHY)
  bondsPct: number;           // % → bonds / fixed income
  cashPct: number;            // % → cash / HISA
}

export type IncomeMode = 'swr' | 'yield' | 'hybrid';

export interface ExitIncomeConfig {
  mode: IncomeMode;
  swrPct: number;             // 3 / 3.5 / 4 (%)
  dividendYieldPct: number;   // 5–6% for yield mode
  hybridGrowthReinvestPct: number; // % of portfolio kept for growth in hybrid mode
}

/** Full exit strategy specification (serialised in WiScenario.snap_overrides.exit_strategy) */
export interface ExitStrategy {
  enabled: boolean;
  exitYear: number;           // e.g. 2035
  sellingCostsPct: number;    // agent fees etc. (%) — default 2.5%
  assets: ExitAssetSelection;
  reinvestment: ReinvestmentAllocation;
  income: ExitIncomeConfig;
}

/** Per-asset CGT calculation result */
export interface CgtBreakdown {
  assetLabel: string;
  saleProceeds: number;
  costBase: number;
  grossGain: number;
  cgtDiscount: number;        // 50% if held >12 months
  taxableGain: number;
  taxRate: number;            // marginal rate assumed
  taxOwed: number;
  sellingCosts: number;
  netProceeds: number;
}

/** Full exit event result */
export interface ExitEventResult {
  exitYear: number;
  // Asset values at exit (before sale)
  propertyGrossValue: number;
  propertyLoansAtExit: number;
  stockValueAtExit: number;
  cryptoValueAtExit: number;
  // CGT breakdown
  cgtBreakdowns: CgtBreakdown[];
  totalSellingCosts: number;
  totalTaxOwed: number;
  totalNetProceeds: number;   // after costs + CGT
  // Post-exit portfolio
  reinvestedCapital: number;
  etfGrowthValue: number;
  etfDividendValue: number;
  bondsValue: number;
  cashValue: number;
  // Income generated
  annualPassiveIncome: number;
  monthlyPassiveIncome: number;
  // Strategy summary
  effectiveSWR: number;
  effectiveYield: number;
  incomeMode: IncomeMode;
}

/** Hold vs Exit comparison */
export interface HoldVsExitComparison {
  strategy: 'hold' | 'exit';
  passiveIncomeMonthly: number;
  netWorthAtTarget: number;
  capitalAtWork: number;
  riskLabel: string;
  riskScore: number;
  stabilityLabel: string;
  stabilityScore: number;     // 1–10
  primaryIncomeSources: string[];
  pros: string[];
  cons: string[];
}

// ─── Australian CGT calculation ───────────────────────────────────────────────

/**
 * Calculates CGT for a single asset using Australian rules:
 * - 50% discount if held > 12 months
 * - Marginal tax rate applied to discounted gain
 * - Selling costs deducted from proceeds
 */
export function calcCgt(params: {
  assetLabel: string;
  saleProceeds: number;
  costBase: number;
  sellingCostsPct: number;   // % of sale proceeds
  yearsHeld: number;
  marginalTaxRate: number;   // e.g. 0.37 for $135K–$190K bracket
}): CgtBreakdown {
  const { assetLabel, saleProceeds, costBase, sellingCostsPct, yearsHeld, marginalTaxRate } = params;
  const sellingCosts = saleProceeds * (sellingCostsPct / 100);
  const netSaleProceeds = saleProceeds - sellingCosts;
  const grossGain = Math.max(0, netSaleProceeds - costBase);
  // 50% CGT discount for assets held > 12 months
  const cgtDiscount = yearsHeld >= 1 ? grossGain * 0.5 : 0;
  const taxableGain = grossGain - cgtDiscount;
  const taxOwed = taxableGain * marginalTaxRate;
  const netProceeds = netSaleProceeds - taxOwed;

  return {
    assetLabel,
    saleProceeds,
    costBase,
    grossGain,
    cgtDiscount,
    taxableGain,
    taxRate: marginalTaxRate,
    taxOwed,
    sellingCosts,
    netProceeds,
  };
}

// ─── Reinvestment income calculation ─────────────────────────────────────────

/**
 * Calculates annual passive income from a reinvested capital pool
 * based on chosen income mode and allocation.
 */
export function calcReinvestmentIncome(params: {
  netProceeds: number;
  allocation: ReinvestmentAllocation;
  income: ExitIncomeConfig;
}): {
  annualIncome: number;
  monthlyIncome: number;
  effectiveRate: number;
  breakdown: { label: string; capital: number; yield: number; income: number }[];
} {
  const { netProceeds, allocation, income } = params;
  const { mode, swrPct, dividendYieldPct, hybridGrowthReinvestPct } = income;

  // Normalise allocation to sum to 100
  const total = allocation.etfGrowthPct + allocation.etfDividendPct + allocation.bondsPct + allocation.cashPct;
  const norm = total > 0 ? 100 / total : 1;
  const a = {
    etfGrowth:   (allocation.etfGrowthPct * norm / 100) * netProceeds,
    etfDividend: (allocation.etfDividendPct * norm / 100) * netProceeds,
    bonds:       (allocation.bondsPct * norm / 100) * netProceeds,
    cash:        (allocation.cashPct * norm / 100) * netProceeds,
  };

  let annualIncome = 0;
  const breakdown: { label: string; capital: number; yield: number; income: number }[] = [];

  if (mode === 'swr') {
    // Safe withdrawal rate applied to total portfolio
    const swr = swrPct / 100;
    annualIncome = netProceeds * swr;

    breakdown.push({ label: 'ETF (Growth)',   capital: a.etfGrowth,   yield: swrPct, income: a.etfGrowth * swr });
    breakdown.push({ label: 'ETF (Dividend)', capital: a.etfDividend, yield: swrPct, income: a.etfDividend * swr });
    breakdown.push({ label: 'Bonds',          capital: a.bonds,       yield: swrPct, income: a.bonds * swr });
    breakdown.push({ label: 'Cash / HISA',    capital: a.cash,        yield: swrPct, income: a.cash * swr });
  } else if (mode === 'yield') {
    // Yield-based: dividend/coupon income only (no capital drawdown)
    const etfGrowthYield = 0.025;   // VGS-style: 2.5% franked
    const etfDivYield    = dividendYieldPct / 100; // VHY-style: 5–6%
    const bondsYield     = 0.055;   // ~5.5% investment grade bonds
    const cashYield      = 0.045;   // ~4.5% HISA

    breakdown.push({ label: 'ETF (Growth)',   capital: a.etfGrowth,   yield: etfGrowthYield * 100, income: a.etfGrowth * etfGrowthYield });
    breakdown.push({ label: 'ETF (Dividend)', capital: a.etfDividend, yield: etfDivYield * 100,    income: a.etfDividend * etfDivYield });
    breakdown.push({ label: 'Bonds',          capital: a.bonds,       yield: bondsYield * 100,     income: a.bonds * bondsYield });
    breakdown.push({ label: 'Cash / HISA',    capital: a.cash,        yield: cashYield * 100,      income: a.cash * cashYield });
    annualIncome = breakdown.reduce((s, b) => s + b.income, 0);
  } else {
    // Hybrid: growth ETF stays invested, income from yield + partial SWR on remainder
    const growthKept = a.etfGrowth;  // kept for growth, not withdrawn
    const incomePool = netProceeds - growthKept * (hybridGrowthReinvestPct / 100);
    const swrIncome  = incomePool * (swrPct / 100);
    const divIncome  = a.etfDividend * (dividendYieldPct / 100);
    const bondIncome = a.bonds * 0.055;
    const cashIncome = a.cash * 0.045;
    annualIncome = swrIncome + divIncome + bondIncome + cashIncome;

    breakdown.push({ label: 'ETF (Growth) — held',    capital: growthKept,   yield: 0,                    income: 0 });
    breakdown.push({ label: 'ETF (Dividend)',          capital: a.etfDividend,yield: dividendYieldPct,    income: divIncome });
    breakdown.push({ label: 'Bonds',                  capital: a.bonds,      yield: 5.5,                 income: bondIncome });
    breakdown.push({ label: 'Cash / HISA',            capital: a.cash,       yield: 4.5,                 income: cashIncome });
    breakdown.push({ label: 'SWR drawdown (rest)',    capital: incomePool,   yield: swrPct,              income: swrIncome });
  }

  const effectiveRate = netProceeds > 0 ? (annualIncome / netProceeds) * 100 : 0;

  return {
    annualIncome,
    monthlyIncome: annualIncome / 12,
    effectiveRate,
    breakdown: breakdown.filter(b => b.capital > 0),
  };
}

// ─── Run Exit Event ───────────────────────────────────────────────────────────

/**
 * Runs the full exit event simulation:
 * 1. Takes asset values at the exit year (from runScenarioForecast result)
 * 2. Sells selected assets, calculates CGT
 * 3. Reinvests net proceeds
 * 4. Calculates passive income from new portfolio
 */
export function runExitEvent(params: {
  strategy: ExitStrategy;
  properties: WiProperty[];
  // Asset values at exit year (from forecast result's year array)
  stockValueAtExit: number;
  cryptoValueAtExit: number;
  propertyValuesAtExit: { id: number; label: string; value: number; loanBalance: number; purchasePrice: number; purchaseYear: number }[];
  marginalTaxRate?: number;
  currentYear?: number;
}): ExitEventResult {
  const {
    strategy,
    properties,
    stockValueAtExit,
    cryptoValueAtExit,
    propertyValuesAtExit,
    marginalTaxRate = 0.37,
    currentYear = 2026,
  } = params;

  const { exitYear, sellingCostsPct, assets, reinvestment, income } = strategy;
  const yearsToExit = exitYear - currentYear;

  const cgtBreakdowns: CgtBreakdown[] = [];
  let totalNetProceeds = 0;

  // ── 1. Properties ──────────────────────────────────────────────────────────
  let propertyGross = 0;
  let propertyLoans = 0;

  const propsToSell = assets.sellAllIPs
    ? propertyValuesAtExit.filter(pv => {
        const wp = properties.find(p => p.id === pv.id);
        return !wp?.is_ppor;
      })
    : propertyValuesAtExit.filter(pv => assets.propertyIds.includes(pv.id ?? 0));

  for (const pv of propsToSell) {
    propertyGross += pv.value;
    propertyLoans += pv.loanBalance;
    const yearsHeld = exitYear - (pv.purchaseYear ?? currentYear);
    const cgt = calcCgt({
      assetLabel: pv.label,
      saleProceeds: pv.value,
      costBase: pv.purchasePrice,
      sellingCostsPct,
      yearsHeld: Math.max(0, yearsHeld),
      marginalTaxRate,
    });
    // Net proceeds = after costs + CGT + pay off loan
    cgt.netProceeds = cgt.netProceeds - pv.loanBalance;
    cgtBreakdowns.push(cgt);
    totalNetProceeds += Math.max(0, cgt.netProceeds);
  }

  // ── 2. Stocks ──────────────────────────────────────────────────────────────
  const stockSaleValue = stockValueAtExit * (assets.stocksPct / 100);
  if (stockSaleValue > 0) {
    const stockCostBase = stockSaleValue * 0.45; // approximate: market-weighted avg
    const stockCgt = calcCgt({
      assetLabel: `Stocks (${assets.stocksPct}%)`,
      saleProceeds: stockSaleValue,
      costBase: stockCostBase,
      sellingCostsPct: 0.1, // brokerage ~0.1%
      yearsHeld: yearsToExit,
      marginalTaxRate,
    });
    cgtBreakdowns.push(stockCgt);
    totalNetProceeds += stockCgt.netProceeds;
  }

  // ── 3. Crypto ──────────────────────────────────────────────────────────────
  const cryptoSaleValue = cryptoValueAtExit * (assets.cryptoPct / 100);
  if (cryptoSaleValue > 0) {
    const cryptoCostBase = cryptoSaleValue * 0.25; // higher gain assumption for crypto
    const cryptoCgt = calcCgt({
      assetLabel: `Crypto (${assets.cryptoPct}%)`,
      saleProceeds: cryptoSaleValue,
      costBase: cryptoCostBase,
      sellingCostsPct: 0.5, // exchange fees
      yearsHeld: yearsToExit,
      marginalTaxRate,
    });
    cgtBreakdowns.push(cryptoCgt);
    totalNetProceeds += cryptoCgt.netProceeds;
  }

  const totalSellingCosts = cgtBreakdowns.reduce((s, c) => s + c.sellingCosts, 0);
  const totalTaxOwed      = cgtBreakdowns.reduce((s, c) => s + c.taxOwed, 0);

  // ── 4. Reinvestment ────────────────────────────────────────────────────────
  const norm = reinvestment.etfGrowthPct + reinvestment.etfDividendPct +
               reinvestment.bondsPct + reinvestment.cashPct;
  const r = norm > 0 ? { ...reinvestment } : { etfGrowthPct: 50, etfDividendPct: 30, bondsPct: 10, cashPct: 10 };

  const etfGrowthValue  = (r.etfGrowthPct / 100) * totalNetProceeds;
  const etfDivValue     = (r.etfDividendPct / 100) * totalNetProceeds;
  const bondsValue      = (r.bondsPct / 100) * totalNetProceeds;
  const cashValue       = (r.cashPct / 100) * totalNetProceeds;

  // ── 5. Income ──────────────────────────────────────────────────────────────
  const incomeCalc = calcReinvestmentIncome({
    netProceeds: totalNetProceeds,
    allocation: reinvestment,
    income,
  });

  return {
    exitYear,
    propertyGrossValue: propertyGross,
    propertyLoansAtExit: propertyLoans,
    stockValueAtExit: stockSaleValue,
    cryptoValueAtExit: cryptoSaleValue,
    cgtBreakdowns,
    totalSellingCosts,
    totalTaxOwed,
    totalNetProceeds,
    reinvestedCapital: totalNetProceeds,
    etfGrowthValue,
    etfDividendValue: etfDivValue,
    bondsValue,
    cashValue,
    annualPassiveIncome: incomeCalc.annualIncome,
    monthlyPassiveIncome: incomeCalc.monthlyIncome,
    effectiveSWR: incomeCalc.effectiveRate,
    effectiveYield: incomeCalc.effectiveRate,
    incomeMode: income.mode,
  };
}

// ─── Hold vs Exit Comparison ──────────────────────────────────────────────────

export function buildHoldVsExitComparison(params: {
  holdResult: WiScenarioResult;
  exitResult: ExitEventResult;
  targetYear: number;
}): HoldVsExitComparison[] {
  const { holdResult, exitResult } = params;

  const hold: HoldVsExitComparison = {
    strategy: 'hold',
    passiveIncomeMonthly: holdResult.projectedPassiveIncome,
    netWorthAtTarget: holdResult.netWorthTargetYear,
    capitalAtWork: holdResult.currentProjectedCapital,
    riskLabel: holdResult.riskScore <= 3 ? 'Low' : holdResult.riskScore <= 6 ? 'Medium' : 'High',
    riskScore: holdResult.riskScore,
    stabilityLabel: holdResult.projectedPassiveIncome > 0 ? 'Growing' : 'Low',
    stabilityScore: Math.min(10, Math.max(1, 10 - holdResult.riskScore)),
    primaryIncomeSources: [
      holdResult.propertyValueTargetYear > 0 ? 'Net rental income' : '',
      holdResult.stockValueTargetYear > 0 ? 'Stock dividends / SWR' : '',
      holdResult.cryptoValueTargetYear > 0 ? 'Crypto yield' : '',
    ].filter(Boolean),
    pros: [
      'Capital continues compounding',
      'Rental income grows with CPI',
      'No CGT event triggered',
      'Multiple income streams',
    ],
    cons: [
      'Income tied to tenant payments / market',
      'Property management overhead',
      'Illiquid — hard to rebalance',
      'Income may be irregular',
    ],
  };

  const exitMonthly = exitResult.monthlyPassiveIncome;
  const exitRisk    = exitMonthly > holdResult.projectedPassiveIncome ? 3 : 5;

  const exit: HoldVsExitComparison = {
    strategy: 'exit',
    passiveIncomeMonthly: exitMonthly,
    netWorthAtTarget: exitResult.totalNetProceeds,
    capitalAtWork: exitResult.reinvestedCapital,
    riskLabel: exitRisk <= 3 ? 'Low' : 'Medium',
    riskScore: exitRisk,
    stabilityLabel: 'Stable',
    stabilityScore: 9,
    primaryIncomeSources: [
      exitResult.etfGrowthValue > 0 ? 'ETF (growth) — SWR/dividend' : '',
      exitResult.etfDividendValue > 0 ? 'ETF (high-yield) — dividends' : '',
      exitResult.bondsValue > 0 ? 'Bonds — coupon income' : '',
      exitResult.cashValue > 0 ? 'Cash / HISA — interest' : '',
    ].filter(Boolean),
    pros: [
      'Predictable, market-linked income',
      'Diversified liquid portfolio',
      'No landlord responsibilities',
      `${exitResult.incomeMode === 'swr' ? 'SWR proven historically safe' : exitResult.incomeMode === 'yield' ? 'Dividend income without capital drawdown' : 'Hybrid: growth + income balanced'}`,
    ],
    cons: [
      `CGT of ${fmt2(exitResult.totalTaxOwed)} triggered on exit`,
      'Capital deployed — lower growth upside',
      'Sequence-of-returns risk on SWR',
      'Inflation erodes fixed income (bonds/cash)',
    ],
  };

  return [hold, exit];
}

// small local fmt used inside engine (no import needed)
function fmt2(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(abs).toLocaleString()}`;
}

// ─── Default exit strategy ────────────────────────────────────────────────────

export const DEFAULT_EXIT_STRATEGY: ExitStrategy = {
  enabled: false,
  exitYear: 2035,
  sellingCostsPct: 2.5,
  assets: {
    propertyIds: [],
    sellAllIPs: true,
    stocksPct: 0,
    cryptoPct: 50,
  },
  reinvestment: {
    etfGrowthPct: 50,
    etfDividendPct: 30,
    bondsPct: 10,
    cashPct: 10,
  },
  income: {
    mode: 'swr',
    swrPct: 4,
    dividendYieldPct: 5.5,
    hybridGrowthReinvestPct: 30,
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// DECISION ENGINE v2 — Exit Timing Optimiser, Impact Engine,
//                      Action Recommendation Engine, Assumption Guards
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Assumption Guards ────────────────────────────────────────────────────────

export interface AssumptionWarning {
  field: string;
  value: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Enforces that total_return = growth + yield (no free-lunch assumptions).
 * Also warns on unrealistic values. Returns list of warnings.
 */
export function enforceReturnConstraints(params: {
  stockReturn: number;          // % total return
  stockDividendYield: number;   // % yield component
  cryptoReturn: number;
  propertyGrowth: number;       // % capital growth
  rentalYield: number;          // % gross rental yield
  reinvestYield?: number;       // % for reinvestment portfolio
}): AssumptionWarning[] {
  const warnings: AssumptionWarning[] = [];
  const { stockReturn, stockDividendYield, cryptoReturn, propertyGrowth, rentalYield, reinvestYield } = params;

  // Stock: total return must be at least the yield (can't withdraw more than you earn without principal erosion)
  if (stockDividendYield > stockReturn) {
    warnings.push({
      field: 'stocks',
      value: stockDividendYield,
      message: `Dividend yield (${stockDividendYield}%) exceeds total return (${stockReturn}%). This erodes capital — lower yield or raise return.`,
      severity: 'error',
    });
  }
  const impliedGrowth = stockReturn - stockDividendYield;
  if (impliedGrowth < 0) {
    warnings.push({
      field: 'stocks_growth',
      value: impliedGrowth,
      message: `Implied capital growth is ${impliedGrowth.toFixed(1)}% — your portfolio will shrink over time.`,
      severity: 'error',
    });
  }

  // High-yield warning
  if (stockReturn > 20) {
    warnings.push({
      field: 'stocks',
      value: stockReturn,
      message: `Stock total return of ${stockReturn}% is very aggressive. Long-run ASX average ≈ 10%. Consider 8–12%.`,
      severity: 'warning',
    });
  }

  // Crypto warnings
  if (cryptoReturn > 50) {
    warnings.push({
      field: 'crypto',
      value: cryptoReturn,
      message: `Crypto return of ${cryptoReturn}% is extremely speculative. Median cycle return ≈ 20–30%. Use for optimistic scenario only.`,
      severity: 'warning',
    });
  }

  // Property warnings
  if (propertyGrowth > 12) {
    warnings.push({
      field: 'property',
      value: propertyGrowth,
      message: `Property growth of ${propertyGrowth}% far exceeds long-run Australian average of 6–7%. Consider stress-testing at 5%.`,
      severity: 'warning',
    });
  }

  // Gross yield warning
  if (rentalYield > 10) {
    warnings.push({
      field: 'rental_yield',
      value: rentalYield,
      message: `Gross rental yield of ${rentalYield}% is unusually high. Net yield is typically 2–4% after costs.`,
      severity: 'warning',
    });
  }

  // Reinvestment portfolio
  if (reinvestYield !== undefined && reinvestYield > stockReturn + 2) {
    warnings.push({
      field: 'reinvest_yield',
      value: reinvestYield,
      message: `Exit income rate of ${reinvestYield.toFixed(1)}% exceeds assumed stock return. Ensure allocation includes growth assets.`,
      severity: 'warning',
    });
  }

  return warnings;
}

// ─── Exit Timing Optimiser ────────────────────────────────────────────────────

export interface ExitTimingRow {
  year: number;
  assetValueAtExit: number;
  loanBalanceAtExit: number;
  grossEquity: number;
  totalCgt: number;
  totalSellingCosts: number;
  netProceeds: number;
  monthlyIncome: number;
  annualIncome: number;
  effectiveRate: number;
  incomeVsCgt: number;         // net income in 1st year after tax drag
  yearsToRecoupCgt: number;    // CGT / annual income gain over hold
  isOptimalIncome: boolean;
  isOptimalTradeoff: boolean;
}

export interface ExitTimingResult {
  rows: ExitTimingRow[];
  optimalIncomeYear: number;
  optimalTradeoffYear: number;
  maxMonthlyIncome: number;
  holdMonthlyIncome: number;   // from base forecast at each year
}

/**
 * Runs exit simulation across a range of years and identifies optimal exit timing.
 * Uses the existing runExitEvent function for each year.
 */
export function runExitTimingOptimiser(params: {
  startYear: number;
  endYear: number;
  strategy: ExitStrategy;
  properties: WiProperty[];
  forecastResult: WiScenarioResult;
  marginalTaxRate?: number;
  currentYear?: number;
}): ExitTimingResult {
  const { startYear, endYear, strategy, properties, forecastResult, marginalTaxRate = 0.37, currentYear = 2026 } = params;

  const rows: ExitTimingRow[] = [];
  let optimalIncomeYear = startYear;
  let optimalTradeoffYear = startYear;
  let maxMonthlyIncome = 0;
  let bestTradeoffScore = -Infinity;

  for (let yr = startYear; yr <= endYear; yr++) {
    const yearResult = forecastResult.years.find(y => y.year === yr) ?? forecastResult.years[forecastResult.years.length - 1];
    if (!yearResult) continue;

    // Build property values at this exit year
    const ips = properties.filter(p => !p.is_ppor);
    const totalPurchase = ips.reduce((s, p) => s + p.purchase_price, 0);
    const propValuesAtExit = ips.map(p => {
      const yearsOwned = yr - (p.purchase_year ?? currentYear);
      const propValue = p.purchase_price * Math.pow(1.07, Math.max(0, yearsOwned));
      let lbal = p.loan_amount;
      if (p.loan_type === 'PI' && yearsOwned > 0) {
        const mr = (p.interest_rate / 100) / 12;
        const n = p.loan_term_years * 12;
        const pm = Math.min(yearsOwned * 12, n);
        if (mr > 0) {
          const pmt = lbal * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
          for (let m = 0; m < pm; m++) {
            lbal = Math.max(0, lbal - (pmt - lbal * mr));
          }
        }
      }
      return {
        id: p.id ?? 0,
        label: p.property_name,
        value: propValue,
        loanBalance: lbal,
        purchasePrice: p.purchase_price,
        purchaseYear: p.purchase_year ?? currentYear,
      };
    });

    const modifiedStrategy: ExitStrategy = { ...strategy, exitYear: yr };
    const er = runExitEvent({
      strategy: modifiedStrategy,
      properties,
      stockValueAtExit: yearResult.stockValue * (strategy.assets.stocksPct / 100),
      cryptoValueAtExit: yearResult.cryptoValue * (strategy.assets.cryptoPct / 100),
      propertyValuesAtExit: propValuesAtExit,
      marginalTaxRate,
      currentYear,
    });

    const holdMonthly = yearResult.monthlyPassiveIncome;
    const incomeGain  = er.monthlyPassiveIncome - holdMonthly;
    const yearsToRecoup = er.totalTaxOwed > 0 && incomeGain > 0
      ? er.totalTaxOwed / (incomeGain * 12)
      : er.totalTaxOwed > 0 ? Infinity : 0;

    const tradeoffScore = incomeGain * 12 - er.totalTaxOwed / 5; // 5-year horizon normalisation

    rows.push({
      year: yr,
      assetValueAtExit: er.propertyGrossValue + er.stockValueAtExit + er.cryptoValueAtExit,
      loanBalanceAtExit: er.propertyLoansAtExit,
      grossEquity: er.propertyGrossValue - er.propertyLoansAtExit + er.stockValueAtExit + er.cryptoValueAtExit,
      totalCgt: er.totalTaxOwed,
      totalSellingCosts: er.totalSellingCosts,
      netProceeds: er.totalNetProceeds,
      monthlyIncome: er.monthlyPassiveIncome,
      annualIncome: er.annualPassiveIncome,
      effectiveRate: er.effectiveSWR,
      incomeVsCgt: incomeGain * 12 - er.totalTaxOwed,
      yearsToRecoupCgt: yearsToRecoup,
      isOptimalIncome: false,
      isOptimalTradeoff: false,
    });

    if (er.monthlyPassiveIncome > maxMonthlyIncome) {
      maxMonthlyIncome = er.monthlyPassiveIncome;
      optimalIncomeYear = yr;
    }
    if (tradeoffScore > bestTradeoffScore) {
      bestTradeoffScore = tradeoffScore;
      optimalTradeoffYear = yr;
    }
  }

  // Mark optimal rows
  rows.forEach(r => {
    r.isOptimalIncome    = r.year === optimalIncomeYear;
    r.isOptimalTradeoff  = r.year === optimalTradeoffYear;
  });

  return {
    rows,
    optimalIncomeYear,
    optimalTradeoffYear,
    maxMonthlyIncome,
    holdMonthlyIncome: forecastResult.projectedPassiveIncome,
  };
}

// ─── Impact Engine ────────────────────────────────────────────────────────────

export interface ImpactDelta {
  label: string;
  before: number;
  after: number;
  delta: number;
  deltaPct: number;
  direction: 'up' | 'down' | 'neutral';
  unit: string;
}

export interface ImpactResult {
  deltas: ImpactDelta[];
  passiveIncomeBefore: number;
  passiveIncomeAfter: number;
  fireYearBefore: number | null;
  fireYearAfter: number | null;
  feasibilityBefore: number;
  feasibilityAfter: number;
  riskBefore: number;
  riskAfter: number;
  netWorthBefore: number;
  netWorthAfter: number;
  capitalGapBefore: number;
  capitalGapAfter: number;
  summary: string;
}

/**
 * Runs impact analysis between two forecast results (before/after a change).
 * Returns deltas on all key metrics.
 */
export function runImpactEngine(params: {
  before: WiScenarioResult;
  after: WiScenarioResult;
  changeSummary: string;
}): ImpactResult {
  const { before, after, changeSummary } = params;

  function delta(label: string, bef: number, aft: number, unit: string): ImpactDelta {
    const d = aft - bef;
    const pct = bef !== 0 ? (d / Math.abs(bef)) * 100 : 0;
    return {
      label, before: bef, after: aft, delta: d,
      deltaPct: pct,
      direction: d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'neutral',
      unit,
    };
  }

  const deltas: ImpactDelta[] = [
    delta('Monthly Passive Income', before.projectedPassiveIncome, after.projectedPassiveIncome, '$/mo'),
    delta('Annual Passive Income', before.projectedPassiveIncome * 12, after.projectedPassiveIncome * 12, '$/yr'),
    delta('Net Worth at Target', before.netWorthTargetYear, after.netWorthTargetYear, '$'),
    delta('Capital Gap', before.capitalGap, after.capitalGap, '$'),
    delta('Feasibility Score', before.feasibilityScore, after.feasibilityScore, '/10'),
    delta('Risk Score', before.riskScore, after.riskScore, '/10'),
    delta('Required Capital', before.requiredCapital, after.requiredCapital, '$'),
    delta('Projected Capital', before.currentProjectedCapital, after.currentProjectedCapital, '$'),
    delta('Property Value', before.propertyValueTargetYear, after.propertyValueTargetYear, '$'),
    delta('Stock Value', before.stockValueTargetYear, after.stockValueTargetYear, '$'),
    delta('Crypto Value', before.cryptoValueTargetYear, after.cryptoValueTargetYear, '$'),
  ];

  const fireShift = after.fireYear !== null && before.fireYear !== null
    ? after.fireYear - before.fireYear : 0;

  const passiveDelta = after.projectedPassiveIncome - before.projectedPassiveIncome;
  let summary = '';
  if (passiveDelta > 0) {
    summary = `This change adds ${fmt2(passiveDelta)}/month in passive income`;
    if (fireShift < 0) summary += ` and moves FIRE ${Math.abs(fireShift)} year${Math.abs(fireShift) > 1 ? 's' : ''} earlier`;
    summary += `.`;
  } else if (passiveDelta < 0) {
    summary = `This change reduces passive income by ${fmt2(Math.abs(passiveDelta))}/month`;
    if (fireShift > 0) summary += ` and delays FIRE by ${fireShift} year${fireShift > 1 ? 's' : ''}`;
    summary += `.`;
  } else {
    summary = `Negligible impact on passive income. ${changeSummary}`;
  }

  return {
    deltas,
    passiveIncomeBefore: before.projectedPassiveIncome,
    passiveIncomeAfter: after.projectedPassiveIncome,
    fireYearBefore: before.fireYear,
    fireYearAfter: after.fireYear,
    feasibilityBefore: before.feasibilityScore,
    feasibilityAfter: after.feasibilityScore,
    riskBefore: before.riskScore,
    riskAfter: after.riskScore,
    netWorthBefore: before.netWorthTargetYear,
    netWorthAfter: after.netWorthTargetYear,
    capitalGapBefore: before.capitalGap,
    capitalGapAfter: after.capitalGap,
    summary,
  };
}

// ─── Action Recommendation Engine ────────────────────────────────────────────

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionCategory = 'property' | 'stocks' | 'crypto' | 'cashflow' | 'exit' | 'debt' | 'super';

export interface RecommendedAction {
  priority: ActionPriority;
  category: ActionCategory;
  title: string;
  detail: string;
  impact: string;       // e.g. "+$1,200/month"
  timeframe: string;    // e.g. "By 2028"
  feasible: boolean;
  blockers?: string[];  // reasons why it may not be feasible
}

export interface ActionPlan {
  headline: string;
  subheadline: string;
  actions: RecommendedAction[];
  exitRecommendation: {
    recommended: boolean;
    optimalYear: number | null;
    incomeGain: number;
    cgtCost: number;
    yearsToRecoup: number;
    summary: string;
  };
  scenarioOutcome: {
    currentMonthlyPassive: number;
    targetMonthlyPassive: number;
    gap: number;
    feasibleByTargetYear: boolean;
    bestCaseYear: number | null;
  };
}

/**
 * Analyses the scenario result + exit timing data and produces a concrete,
 * prioritised action plan with feasibility checks.
 */
export function runActionRecommendationEngine(params: {
  scenario: WiScenario;
  result: WiScenarioResult;
  exitTiming?: ExitTimingResult;
  snap: any;
  properties: WiProperty[];
  stockPlans: WiStockPlan[];
  cryptoPlans: WiCryptoPlan[];
}): ActionPlan {
  const { scenario, result, exitTiming, snap, properties, stockPlans, cryptoPlans } = params;
  const target = scenario.target_passive_income;
  const current = result.projectedPassiveIncome;
  const gap = target - current;
  const gapPct = target > 0 ? gap / target : 0;

  const actions: RecommendedAction[] = [];

  // ── 1. Gap analysis → determine what's needed ──────────────────────────────
  const incomeFromProps = result.years.find(y => y.year === scenario.target_year)?.netRent ?? 0;
  const incomeFromStocks = result.years.find(y => y.year === scenario.target_year)?.stockPassive ?? 0;
  const incomeFromCrypto = result.years.find(y => y.year === scenario.target_year)?.cryptoPassive ?? 0;
  const propCount = properties.filter(p => !p.is_ppor).length;

  // ── 2. Property actions ────────────────────────────────────────────────────
  if (gap > 500 && propCount < 4) {
    const rentContrib = incomeFromProps > 0 ? incomeFromProps / (propCount || 1) : 800;
    const ipsNeeded = Math.ceil(gap / rentContrib);
    const feasible = safeNum(snap?.monthly_income) - safeNum(snap?.monthly_expenses) > 2000;
    actions.push({
      priority: gap > target * 0.4 ? 'critical' : 'high',
      category: 'property',
      title: `Add ${Math.min(ipsNeeded, 3)} investment ${Math.min(ipsNeeded, 3) === 1 ? 'property' : 'properties'}`,
      detail: `Current properties contribute ${fmt2(incomeFromProps * 12)}/yr net rent. Adding ${Math.min(ipsNeeded, 3)} IP${Math.min(ipsNeeded, 3) > 1 ? 's' : ''} at median AU price closes ${Math.min(100, Math.round((rentContrib * Math.min(ipsNeeded, 3)) / gap * 100))}% of gap.`,
      impact: `+${fmt2(rentContrib * Math.min(ipsNeeded, 3))}/month net rent`,
      timeframe: `Start ${new Date().getFullYear() + 1}–${new Date().getFullYear() + 3}`,
      feasible,
      blockers: !feasible ? ['Monthly surplus below $2,000 — serviceability may be tight'] : undefined,
    });
  }

  // ── 3. Stock DCA actions ───────────────────────────────────────────────────
  const totalStockDCA = stockPlans.reduce((s, p) => s + dcaMonthly(p.dca_amount, p.dca_frequency), 0);
  if (gap > 300 && incomeFromStocks < target * 0.3) {
    const idealDCA = Math.min(5000, Math.max(totalStockDCA * 1.5, 2000));
    const incomeGain = (idealDCA - totalStockDCA) * 12 * Math.pow(1.1, scenario.target_year - new Date().getFullYear()) * 0.04 / 12;
    const canAfford = safeNum(snap?.monthly_income) - safeNum(snap?.monthly_expenses) - safeNum(snap?.monthly_debt) > idealDCA;
    actions.push({
      priority: 'high',
      category: 'stocks',
      title: `Increase stock DCA to ${fmt2(idealDCA)}/month`,
      detail: `Current DCA: ${fmt2(totalStockDCA)}/month. Increasing to ${fmt2(idealDCA)} adds significant compounding mass over ${scenario.target_year - new Date().getFullYear()} years.`,
      impact: `+${fmt2(incomeGain)}/month at target year`,
      timeframe: 'Immediately',
      feasible: canAfford,
      blockers: !canAfford ? [`Monthly surplus after expenses and debt = ${fmt2(safeNum(snap?.monthly_income) - safeNum(snap?.monthly_expenses) - safeNum(snap?.monthly_debt))} — insufficient for DCA increase`] : undefined,
    });
  }

  // ── 4. Crypto DCA ─────────────────────────────────────────────────────────
  const totalCryptoDCA = cryptoPlans.reduce((s, p) => s + dcaMonthly(p.dca_amount, p.dca_frequency), 0);
  if (gap > 500 && incomeFromCrypto < target * 0.15) {
    actions.push({
      priority: 'medium',
      category: 'crypto',
      title: `Maintain crypto DCA at ${fmt2(Math.max(totalCryptoDCA, 500))}/month`,
      detail: `Crypto contributes ${fmt2(incomeFromCrypto * 12)}/yr at target year. Consistent DCA through market cycles compounds significantly.`,
      impact: `+${fmt2(incomeFromCrypto * 0.3)}/month (optimistic scenario)`,
      timeframe: 'Ongoing',
      feasible: true,
    });
  }

  // ── 5. Debt actions ────────────────────────────────────────────────────────
  const totalDebt = safeNum(snap?.total_debt) - safeNum(snap?.mortgage_balance);
  if (totalDebt > 30000) {
    actions.push({
      priority: 'medium',
      category: 'debt',
      title: `Clear non-mortgage debt of ${fmt2(totalDebt)}`,
      detail: `High-interest consumer debt reduces cashflow available for investment. Eliminating it frees up ~${fmt2(totalDebt * 0.065 / 12)}/month.`,
      impact: `+${fmt2(totalDebt * 0.065 / 12)}/month cashflow`,
      timeframe: 'Within 24 months',
      feasible: true,
    });
  }

  // ── 6. Exit strategy ──────────────────────────────────────────────────────
  let exitRec = {
    recommended: false,
    optimalYear: null as number | null,
    incomeGain: 0,
    cgtCost: 0,
    yearsToRecoup: 0,
    summary: 'Run exit timing analysis to see if exit strategy improves your outcome.',
  };

  if (exitTiming && exitTiming.rows.length > 0) {
    const optimal = exitTiming.rows.find(r => r.isOptimalTradeoff);
    if (optimal) {
      const gain = optimal.monthlyIncome - exitTiming.holdMonthlyIncome;
      exitRec = {
        recommended: gain > 500 && optimal.yearsToRecoupCgt < 5,
        optimalYear: optimal.year,
        incomeGain: gain,
        cgtCost: optimal.totalCgt,
        yearsToRecoup: optimal.yearsToRecoupCgt,
        summary: gain > 500
          ? `Exit in ${optimal.year}: gain ${fmt2(gain)}/month, CGT ${fmt2(optimal.totalCgt)}, recouped in ${optimal.yearsToRecoupCgt.toFixed(1)} years.`
          : `Exit strategy improves income by only ${fmt2(gain)}/month at current settings — holding may be better.`,
      };

      if (exitRec.recommended) {
        actions.push({
          priority: 'high',
          category: 'exit',
          title: `Plan exit in ${optimal.year}`,
          detail: exitRec.summary,
          impact: `+${fmt2(gain)}/month after exit`,
          timeframe: `Exit year: ${optimal.year}`,
          feasible: true,
        });
      }
    }
  }

  // ── 7. Super ──────────────────────────────────────────────────────────────
  const superBal = safeNum(snap?.super_balance);
  if (superBal < 200000 && scenario.include_super) {
    actions.push({
      priority: 'low',
      category: 'super',
      title: 'Maximise concessional super contributions',
      detail: `Concessional cap is $30,000/yr. Tax-effective way to grow retirement income. Current super balance: ${fmt2(superBal)}.`,
      impact: 'Reduces taxable income + grows retirement pool',
      timeframe: 'This financial year',
      feasible: true,
    });
  }

  // Sort: critical → high → medium → low
  const priorityOrder: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const feasibleByTarget = result.feasibilityScore >= 7;
  const headline = feasibleByTarget
    ? `On track to reach ${fmt2(target)}/month by ${scenario.target_year}`
    : `${fmt2(gap)}/month gap to close — action required`;
  const subheadline = feasibleByTarget
    ? `${actions.length} optimisation${actions.length !== 1 ? 's' : ''} will strengthen your position`
    : `${actions.filter(a => a.priority === 'critical' || a.priority === 'high').length} high-priority action${actions.filter(a => ['critical','high'].includes(a.priority)).length !== 1 ? 's' : ''} required`;

  return {
    headline,
    subheadline,
    actions,
    exitRecommendation: exitRec,
    scenarioOutcome: {
      currentMonthlyPassive: current,
      targetMonthlyPassive: target,
      gap,
      feasibleByTargetYear: feasibleByTarget,
      bestCaseYear: result.fireYear,
    },
  };
}

// helper used inside engine (local)
function safeNum(v: any): number { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; }

// ─── Scenario Comparison ──────────────────────────────────────────────────────

export interface ScenarioComparisonRow {
  scenarioId: number;
  scenarioName: string;
  isBase: boolean;
  isActive: boolean;
  passiveIncomeMonthly: number;
  netWorthAtTarget: number;
  capitalGap: number;
  fireYear: number | null;
  feasibilityScore: number;
  riskScore: number;
  feasibilityLabel: string;
  riskLabel: string;
  vsBase: {
    passiveIncomeDelta: number;
    netWorthDelta: number;
    fireYearDelta: number | null;
  } | null;
}

export function buildScenarioComparison(params: {
  results: { name: string; scenarioId: number; result: WiScenarioResult }[];
  activeId: number;
  baseId: number | null;
}): ScenarioComparisonRow[] {
  const { results, activeId, baseId } = params;
  const baseResult = results.find(r => r.scenarioId === baseId)?.result ?? null;

  return results.map(({ name, scenarioId, result }) => {
    const isBase = scenarioId === baseId;
    const isActive = scenarioId === activeId;
    const vsBase = baseResult && !isBase ? {
      passiveIncomeDelta: result.projectedPassiveIncome - baseResult.projectedPassiveIncome,
      netWorthDelta: result.netWorthTargetYear - baseResult.netWorthTargetYear,
      fireYearDelta: result.fireYear !== null && baseResult.fireYear !== null
        ? result.fireYear - baseResult.fireYear : null,
    } : null;

    const fl = result.feasibilityScore >= 9 ? 'Excellent' : result.feasibilityScore >= 7 ? 'Good'
      : result.feasibilityScore >= 5 ? 'Moderate' : 'Challenging';
    const rl = result.riskScore <= 3 ? 'Low' : result.riskScore <= 5 ? 'Medium'
      : result.riskScore <= 7 ? 'Med-High' : 'High';

    return {
      scenarioId, scenarioName: name,
      isBase, isActive,
      passiveIncomeMonthly: result.projectedPassiveIncome,
      netWorthAtTarget: result.netWorthTargetYear,
      capitalGap: result.capitalGap,
      fireYear: result.fireYear,
      feasibilityScore: result.feasibilityScore,
      riskScore: result.riskScore,
      feasibilityLabel: fl,
      riskLabel: rl,
      vsBase,
    };
  });
}
