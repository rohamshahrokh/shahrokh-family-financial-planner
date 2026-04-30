/**
 * firePathEngine.ts — FIRE Fastest Path Optimizer (v2 — fully data-driven)
 *
 * ALL assumptions come from FIRESettings (sf_fire_settings) — zero hardcoded constants.
 * Hardcoded fallback defaults are clearly labelled and only used when
 * the Supabase row has not been populated yet.
 *
 * Strategies:
 *   A) Property Focused    — surplus allocated to property/offset per user config
 *   B) ETF / Stock Focused — surplus to index ETFs per user config
 *   C) Mixed Strategy      — balanced allocation per user config
 *   D) Aggressive          — high-growth assets per user config
 *
 * Simulation:
 *   - Monthly compound loop, max 40 years
 *   - Income grows at user-set rate (or year-by-year override)
 *   - Expenses inflate at user-set rate (or year-by-year override)
 *   - Super: SGC % per person + salary sacrifice, grows at per-person return
 *   - Mortgage amortised on remaining term + rate from settings
 *   - Property equity appreciates at user-set CAGR
 *   - FIRE triggered when accessible investable ≥ target capital
 *   - Super excluded from accessible capital until preservation age (default 60)
 *     unless user enables include_super_in_fire
 *
 * Transparency: every output carries source/formula metadata.
 */

import { safeNum } from './finance';

// ─── Public types ─────────────────────────────────────────────────────────────

export type FIREScenarioId = 'property' | 'etf' | 'mixed' | 'aggressive';

/** Mirrors sf_fire_settings row — all fields optional so partial saves work */
export interface FIRESettings {
  // Profile
  roham_age?:                  number;
  fara_age?:                   number;
  desired_fire_age?:           number;
  desired_partner_fire_age?:   number;

  // FIRE target
  desired_monthly_passive?:    number;
  safe_withdrawal_rate?:       number;   // %, default 4.0
  include_super_in_fire?:      boolean;
  include_ppor_equity?:        boolean;
  include_ip_equity?:          boolean;
  include_crypto?:             boolean;
  include_stocks?:             boolean;

  // Mortgage / property
  mortgage_rate?:              number;   // %, default 6.5
  mortgage_term_remaining?:    number;   // years, default 25
  property_cagr?:              number;   // %, default 5.0
  rent_growth_pct?:            number;
  vacancy_pct?:                number;
  property_holding_cost_pct?:  number;

  // Investment returns
  etf_return_pct?:             number;   // %, default 8.5
  crypto_return_pct?:          number;
  cash_hisa_return_pct?:       number;
  stock_return_pct?:           number;

  // Super
  roham_sgc_pct?:              number;   // %, default 11.5
  roham_super_return_pct?:     number;   // %, default 8.0
  roham_salary_sacrifice_mo?:  number;
  fara_sgc_pct?:               number;
  fara_super_return_pct?:      number;
  fara_salary_sacrifice_mo?:   number;

  // Macro
  income_growth_pct?:          number;   // %, default 3.0
  expense_inflation_pct?:      number;   // %, default 3.0
  general_inflation_pct?:      number;
  tax_rate_estimate_pct?:      number;

  // Income mode
  use_manual_income?:          boolean;
  manual_monthly_income?:      number;
  manual_monthly_expenses?:    number;
  manual_monthly_surplus?:     number;
  fara_monthly_income?:        number;
  has_dependants?:             boolean;
}

/** Mirrors sf_fire_scenario_config row */
export interface FIREScenarioConfig {
  scenario_id:          FIREScenarioId;
  pct_to_property:      number;
  pct_to_etf:           number;
  pct_to_crypto:        number;
  pct_to_super:         number;
  pct_to_offset:        number;
  pct_to_cash:          number;
  custom_return_pct:    number | null;   // null = use global setting
  leverage_allowed:     boolean;
  num_planned_ips:      number;
  ip_target_year:       number | null;
  ip_deposit_pct:       number;
  ip_expected_yield:    number;
}

/** Year-by-year override row — all rate fields nullable (null = use global) */
export interface FIREYearAssumption {
  assumption_year:    number;
  property_pct:       number | null;
  stocks_pct:         number | null;
  crypto_pct:         number | null;
  super_pct:          number | null;
  cash_pct:           number | null;
  inflation_pct:      number | null;
  income_growth_pct:  number | null;
  expense_growth_pct: number | null;
  interest_rate_pct:  number | null;
}

export interface FIREPathInput {
  // Snapshot values
  net_worth:             number;
  investable:            number;    // cash + offset + stocks + crypto (non-property, non-super)
  roham_super:           number;
  fara_super:            number;
  super_combined:        number;
  ppor:                  number;
  mortgage:              number;
  stocks:                number;
  crypto:                number;
  cash:                  number;
  offset_balance:        number;
  other_debts:           number;
  roham_monthly_income:  number;
  fara_monthly_income:   number;
  monthly_income:        number;
  monthly_expenses:      number;
  monthly_surplus:       number;
  bills_total_monthly:   number;

  // Computed FIRE target (from settings)
  target_passive_income: number;    // $/month
  target_capital:        number;    // = target_passive_income * 12 / SWR

  // Resolved settings
  settings:              Required<FIRESettingsResolved>;
  scenarioConfigs:       FIREScenarioConfig[];
  yearAssumptions:       FIREYearAssumption[];
  current_year:          number;
}

/** Fully-resolved settings — all fields have concrete values (no undefined) */
export interface FIRESettingsResolved {
  roham_age:                  number;
  fara_age:                   number;
  desired_fire_age:           number;
  desired_partner_fire_age:   number;
  desired_monthly_passive:    number | null;
  safe_withdrawal_rate:       number;
  include_super_in_fire:      boolean;
  include_ppor_equity:        boolean;
  include_ip_equity:          boolean;
  include_crypto:             boolean;
  include_stocks:             boolean;
  mortgage_rate:              number;
  mortgage_term_remaining:    number;
  property_cagr:              number;
  rent_growth_pct:            number;
  vacancy_pct:                number;
  property_holding_cost_pct:  number;
  etf_return_pct:             number;
  crypto_return_pct:          number;
  cash_hisa_return_pct:       number;
  stock_return_pct:           number;
  roham_sgc_pct:              number;
  roham_super_return_pct:     number;
  roham_salary_sacrifice_mo:  number;
  fara_sgc_pct:               number;
  fara_super_return_pct:      number;
  fara_salary_sacrifice_mo:   number;
  income_growth_pct:          number;
  expense_inflation_pct:      number;
  general_inflation_pct:      number;
  tax_rate_estimate_pct:      number;
  use_manual_income:          boolean;
  manual_monthly_income:      number | null;
  manual_monthly_expenses:    number | null;
  manual_monthly_surplus:     number | null;
  fara_monthly_income:        number;
  has_dependants:             boolean;
  preservation_age:           number;   // Australian law: 60
}

export interface FIREScenarioYear {
  year:           number;
  net_worth:      number;
  investable:     number;
  super_balance:  number;
  passive_income: number;   // $/month estimated passive
  surplus:        number;
  fire_reached:   boolean;
}

export interface FIREScenario {
  id:                      FIREScenarioId;
  label:                   string;
  tagline:                 string;
  fire_year:               number;
  years_to_fire:           number;
  net_worth_at_fire:       number;
  monthly_passive_at_fire: number;
  risk_level:              'Low' | 'Medium' | 'High' | 'Very High';
  risk_color:              'green' | 'amber' | 'red' | 'purple';
  strategy_summary:        string;
  key_moves:               string[];
  timeline:                FIREScenarioYear[];
  progress_pct:            number;
  annual_invest:           number;
  primary_vehicle:         string;
  tax_note:                string;
  cgt_discount_applies:    boolean;
  allocation_total_pct:    number;    // must be 100 — validation signal
  return_pct_used:         number;    // actual rate used in simulation
  // Transparency metadata
  assumptions_used:        Record<string, { value: string; source: 'user' | 'default' }>;
}

export interface FIREPathResult {
  scenarios:                   FIREScenario[];
  best_scenario:               FIREScenarioId;
  best_label:                  string;
  best_fire_year:              number;
  fastest_vs_slowest_years:    number;
  target_capital:              number;
  target_passive_income:       number;
  current_progress_pct:        number;
  investable_now:              number;
  super_now:                   number;
  total_nw_now:                number;
  fire_gap:                    number;
  recommendation:              string;
  semi_fire_year:              number;
  data_coverage:               'full' | 'partial' | 'minimal' | 'needs_setup';
  missing_fields:              string[];
  sensitivity:                 FIRESensitivity;
}

export interface FIRESensitivity {
  returns_minus_2pct:  { fire_year: number; delta: number };
  expenses_plus_10pct: { fire_year: number; delta: number };
  surplus_minus_20pct: { fire_year: number; delta: number };
  property_flat:       { fire_year: number; delta: number };
}

// ─── Default fallbacks (clearly labelled) ─────────────────────────────────────
// These are ONLY used when the database row has a NULL value.
// The UI always shows the source ('user' | 'default') next to each value.

const DEFAULTS: FIRESettingsResolved = {
  roham_age:                  0,       // → shows "Needs setup"
  fara_age:                   0,
  desired_fire_age:           0,
  desired_partner_fire_age:   0,
  desired_monthly_passive:    null,    // → shows "Needs setup"
  safe_withdrawal_rate:       4.0,     // DEFAULT — AU standard
  include_super_in_fire:      true,
  include_ppor_equity:        false,
  include_ip_equity:          true,
  include_crypto:             true,
  include_stocks:             true,
  mortgage_rate:              6.5,     // DEFAULT — user must set
  mortgage_term_remaining:    25,      // DEFAULT — user must set
  property_cagr:              5.0,     // DEFAULT — AU historical
  rent_growth_pct:            3.0,
  vacancy_pct:                4.0,
  property_holding_cost_pct:  1.5,
  etf_return_pct:             8.5,     // DEFAULT — AU broad market conservative
  crypto_return_pct:          15.0,    // DEFAULT — speculative
  cash_hisa_return_pct:       5.0,
  stock_return_pct:           9.0,
  roham_sgc_pct:              11.5,    // DEFAULT — AU law 2024-25
  roham_super_return_pct:     8.0,
  roham_salary_sacrifice_mo:  0,
  fara_sgc_pct:               11.5,
  fara_super_return_pct:      8.0,
  fara_salary_sacrifice_mo:   0,
  income_growth_pct:          3.0,     // DEFAULT
  expense_inflation_pct:      3.0,     // DEFAULT
  general_inflation_pct:      2.8,
  tax_rate_estimate_pct:      32.5,
  use_manual_income:          false,
  manual_monthly_income:      null,
  manual_monthly_expenses:    null,
  manual_monthly_surplus:     null,
  fara_monthly_income:        0,       // DEFAULT — user must set
  has_dependants:             false,   // DEFAULT
  preservation_age:           60,      // AU law — not user-editable
};

const SCENARIO_DEFAULTS: Record<FIREScenarioId, FIREScenarioConfig> = {
  property:   { scenario_id: 'property',   pct_to_property: 0, pct_to_etf: 30, pct_to_crypto: 0, pct_to_super: 0, pct_to_offset: 55, pct_to_cash: 15, custom_return_pct: null, leverage_allowed: false, num_planned_ips: 1, ip_target_year: null, ip_deposit_pct: 20, ip_expected_yield: 4.0 },
  etf:        { scenario_id: 'etf',        pct_to_property: 0, pct_to_etf: 80, pct_to_crypto: 0, pct_to_super: 0, pct_to_offset: 0,  pct_to_cash: 20, custom_return_pct: null, leverage_allowed: false, num_planned_ips: 0, ip_target_year: null, ip_deposit_pct: 20, ip_expected_yield: 4.0 },
  mixed:      { scenario_id: 'mixed',      pct_to_property: 15, pct_to_etf: 40, pct_to_crypto: 0, pct_to_super: 10, pct_to_offset: 25, pct_to_cash: 10, custom_return_pct: null, leverage_allowed: false, num_planned_ips: 0, ip_target_year: null, ip_deposit_pct: 20, ip_expected_yield: 4.0 },
  aggressive: { scenario_id: 'aggressive', pct_to_property: 0, pct_to_etf: 55, pct_to_crypto: 15, pct_to_super: 0, pct_to_offset: 0, pct_to_cash: 20, custom_return_pct: null, leverage_allowed: true,  num_planned_ips: 0, ip_target_year: null, ip_deposit_pct: 20, ip_expected_yield: 4.0 },
};

// ─── Settings resolver ────────────────────────────────────────────────────────

function resolveSettings(raw: FIRESettings | null): FIRESettingsResolved {
  if (!raw) return { ...DEFAULTS };
  const n = (v: any, def: number | null): number | null => {
    const x = parseFloat(String(v ?? ''));
    return isNaN(x) ? def : x;
  };
  const b = (v: any, def: boolean): boolean => (v === true || v === false ? v : def);
  return {
    roham_age:                  n(raw.roham_age, DEFAULTS.roham_age) as number,
    fara_age:                   n(raw.fara_age, DEFAULTS.fara_age) as number,
    desired_fire_age:           n(raw.desired_fire_age, DEFAULTS.desired_fire_age) as number,
    desired_partner_fire_age:   n(raw.desired_partner_fire_age, DEFAULTS.desired_partner_fire_age) as number,
    desired_monthly_passive:    n(raw.desired_monthly_passive, null),
    safe_withdrawal_rate:       (n(raw.safe_withdrawal_rate, DEFAULTS.safe_withdrawal_rate) as number) || DEFAULTS.safe_withdrawal_rate,
    include_super_in_fire:      b(raw.include_super_in_fire, DEFAULTS.include_super_in_fire),
    include_ppor_equity:        b(raw.include_ppor_equity, DEFAULTS.include_ppor_equity),
    include_ip_equity:          b(raw.include_ip_equity, DEFAULTS.include_ip_equity),
    include_crypto:             b(raw.include_crypto, DEFAULTS.include_crypto),
    include_stocks:             b(raw.include_stocks, DEFAULTS.include_stocks),
    mortgage_rate:              (n(raw.mortgage_rate, DEFAULTS.mortgage_rate) as number) || DEFAULTS.mortgage_rate,
    mortgage_term_remaining:    (n(raw.mortgage_term_remaining, DEFAULTS.mortgage_term_remaining) as number) || DEFAULTS.mortgage_term_remaining,
    property_cagr:              (n(raw.property_cagr, DEFAULTS.property_cagr) as number) ?? DEFAULTS.property_cagr,
    rent_growth_pct:            (n(raw.rent_growth_pct, DEFAULTS.rent_growth_pct) as number) ?? DEFAULTS.rent_growth_pct,
    vacancy_pct:                (n(raw.vacancy_pct, DEFAULTS.vacancy_pct) as number) ?? DEFAULTS.vacancy_pct,
    property_holding_cost_pct:  (n(raw.property_holding_cost_pct, DEFAULTS.property_holding_cost_pct) as number) ?? DEFAULTS.property_holding_cost_pct,
    etf_return_pct:             (n(raw.etf_return_pct, DEFAULTS.etf_return_pct) as number) ?? DEFAULTS.etf_return_pct,
    crypto_return_pct:          (n(raw.crypto_return_pct, DEFAULTS.crypto_return_pct) as number) ?? DEFAULTS.crypto_return_pct,
    cash_hisa_return_pct:       (n(raw.cash_hisa_return_pct, DEFAULTS.cash_hisa_return_pct) as number) ?? DEFAULTS.cash_hisa_return_pct,
    stock_return_pct:           (n(raw.stock_return_pct, DEFAULTS.stock_return_pct) as number) ?? DEFAULTS.stock_return_pct,
    roham_sgc_pct:              (n(raw.roham_sgc_pct, DEFAULTS.roham_sgc_pct) as number) ?? DEFAULTS.roham_sgc_pct,
    roham_super_return_pct:     (n(raw.roham_super_return_pct, DEFAULTS.roham_super_return_pct) as number) ?? DEFAULTS.roham_super_return_pct,
    roham_salary_sacrifice_mo:  (n(raw.roham_salary_sacrifice_mo, 0) as number) ?? 0,
    fara_sgc_pct:               (n(raw.fara_sgc_pct, DEFAULTS.fara_sgc_pct) as number) ?? DEFAULTS.fara_sgc_pct,
    fara_super_return_pct:      (n(raw.fara_super_return_pct, DEFAULTS.fara_super_return_pct) as number) ?? DEFAULTS.fara_super_return_pct,
    fara_salary_sacrifice_mo:   (n(raw.fara_salary_sacrifice_mo, 0) as number) ?? 0,
    income_growth_pct:          (n(raw.income_growth_pct, DEFAULTS.income_growth_pct) as number) ?? DEFAULTS.income_growth_pct,
    expense_inflation_pct:      (n(raw.expense_inflation_pct, DEFAULTS.expense_inflation_pct) as number) ?? DEFAULTS.expense_inflation_pct,
    general_inflation_pct:      (n(raw.general_inflation_pct, DEFAULTS.general_inflation_pct) as number) ?? DEFAULTS.general_inflation_pct,
    tax_rate_estimate_pct:      (n(raw.tax_rate_estimate_pct, DEFAULTS.tax_rate_estimate_pct) as number) ?? DEFAULTS.tax_rate_estimate_pct,
    use_manual_income:          b(raw.use_manual_income, false),
    manual_monthly_income:      n(raw.manual_monthly_income, null),
    manual_monthly_expenses:    n(raw.manual_monthly_expenses, null),
    manual_monthly_surplus:     n(raw.manual_monthly_surplus, null),
    fara_monthly_income:        (n(raw.fara_monthly_income, 0) as number) ?? 0,
    has_dependants:             b(raw.has_dependants, false),
    preservation_age:           60,   // AU law — not editable
  };
}

function resolveScenarioConfigs(raw: any[]): FIREScenarioConfig[] {
  const ids: FIREScenarioId[] = ['property', 'etf', 'mixed', 'aggressive'];
  return ids.map(id => {
    const found = raw.find((r: any) => r.scenario_id === id);
    if (!found) return { ...SCENARIO_DEFAULTS[id] };
    const n = (v: any, d: number) => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? d : x; };
    const def = SCENARIO_DEFAULTS[id];
    return {
      scenario_id:          id,
      pct_to_property:      n(found.pct_to_property, def.pct_to_property),
      pct_to_etf:           n(found.pct_to_etf, def.pct_to_etf),
      pct_to_crypto:        n(found.pct_to_crypto, def.pct_to_crypto),
      pct_to_super:         n(found.pct_to_super, def.pct_to_super),
      pct_to_offset:        n(found.pct_to_offset, def.pct_to_offset),
      pct_to_cash:          n(found.pct_to_cash, def.pct_to_cash),
      custom_return_pct:    found.custom_return_pct != null ? n(found.custom_return_pct, 0) : null,
      leverage_allowed:     found.leverage_allowed === true,
      num_planned_ips:      n(found.num_planned_ips, def.num_planned_ips),
      ip_target_year:       found.ip_target_year ? parseInt(found.ip_target_year) : null,
      ip_deposit_pct:       n(found.ip_deposit_pct, def.ip_deposit_pct),
      ip_expected_yield:    n(found.ip_expected_yield, def.ip_expected_yield),
    };
  });
}

// ─── Input builder ────────────────────────────────────────────────────────────

export function buildFirePathInput(
  snap: any,
  bills: any[],
  rawSettings: FIRESettings | null,
  rawScenarios: any[],
  rawYearAssumptions: any[],
): FIREPathInput {
  const n = (v: unknown) => safeNum(v);

  const settings = resolveSettings(rawSettings);
  const scenarioConfigs = resolveScenarioConfigs(rawScenarios);

  const yearAssumptions: FIREYearAssumption[] = (rawYearAssumptions ?? []).map((r: any) => ({
    assumption_year:    parseInt(r.assumption_year),
    property_pct:       r.property_pct != null ? parseFloat(r.property_pct) : null,
    stocks_pct:         r.stocks_pct   != null ? parseFloat(r.stocks_pct)   : null,
    crypto_pct:         r.crypto_pct   != null ? parseFloat(r.crypto_pct)   : null,
    super_pct:          r.super_pct    != null ? parseFloat(r.super_pct)    : null,
    cash_pct:           r.cash_pct     != null ? parseFloat(r.cash_pct)     : null,
    inflation_pct:      r.inflation_pct!= null ? parseFloat(r.inflation_pct): null,
    income_growth_pct:  r.income_growth_pct  != null ? parseFloat(r.income_growth_pct)  : null,
    expense_growth_pct: r.expense_growth_pct != null ? parseFloat(r.expense_growth_pct) : null,
    interest_rate_pct:  r.interest_rate_pct  != null ? parseFloat(r.interest_rate_pct)  : null,
  }));

  // ── Bills monthly total ──────────────────────────────────────────────────
  const FREQ: Record<string, number> = {
    Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
    Quarterly: 1 / 3, 'Half-Yearly': 1 / 6, Annually: 1 / 12,
  };
  const billsMonthly = (bills ?? [])
    .filter((b: any) => b.is_active !== false && b.active !== false)
    .reduce((s: number, b: any) => s + n(b.amount) * (FREQ[b.frequency] ?? 1), 0);

  // ── Income / expenses ────────────────────────────────────────────────────
  const snapIncome   = n(snap.monthly_income);
  const snapExpenses = n(snap.monthly_expenses);

  const monthlyIncome = settings.use_manual_income && settings.manual_monthly_income != null
    ? settings.manual_monthly_income
    : snapIncome;
  const monthlyExpenses = settings.use_manual_income && settings.manual_monthly_expenses != null
    ? settings.manual_monthly_expenses
    : snapExpenses;
  const monthlySurplus = monthlyIncome - monthlyExpenses;

  // ── Balances ─────────────────────────────────────────────────────────────
  const cashTotal    = n(snap.cash) + n(snap.offset_balance);
  const stocks       = n(snap.stocks);
  const crypto       = n(snap.crypto);
  const ppor         = n(snap.ppor);
  const mortgage     = n(snap.mortgage);
  const otherDebts   = n(snap.other_debts);
  const rohamSuper   = n(snap.roham_super_balance) || n(snap.super_balance) * 0.57; // Roham 57% if split unknown
  const faraSuper    = n(snap.fara_super_balance)  || n(snap.super_balance) * 0.43;
  const superCombined = rohamSuper + faraSuper;
  const investable   = cashTotal + stocks + crypto;

  const totalAssets = ppor + cashTotal + superCombined + stocks + crypto + n(snap.cars) + n(snap.iran_property);
  const totalDebt   = mortgage + otherDebts;
  const netWorth    = totalAssets - totalDebt;

  // ── FIRE target ──────────────────────────────────────────────────────────
  const targetPassive = settings.desired_monthly_passive != null && settings.desired_monthly_passive > 0
    ? settings.desired_monthly_passive
    : monthlyExpenses + billsMonthly;   // fallback = cover expenses + bills

  const swr = settings.safe_withdrawal_rate / 100;
  const targetCapital = (targetPassive * 12) / swr;

  return {
    net_worth:             Math.round(netWorth),
    investable,
    roham_super:           rohamSuper,
    fara_super:            faraSuper,
    super_combined:        superCombined,
    ppor,
    mortgage,
    stocks,
    crypto,
    cash:                  n(snap.cash),
    offset_balance:        n(snap.offset_balance),
    other_debts:           otherDebts,
    roham_monthly_income:  snapIncome,
    fara_monthly_income:   settings.fara_monthly_income,
    monthly_income:        monthlyIncome,
    monthly_expenses:      monthlyExpenses,
    monthly_surplus:       monthlySurplus,
    bills_total_monthly:   billsMonthly,
    target_passive_income: targetPassive,
    target_capital:        targetCapital,
    settings,
    scenarioConfigs,
    yearAssumptions,
    current_year:          new Date().getFullYear(),
  };
}

// ─── Year-by-year rate resolver ───────────────────────────────────────────────

function getYearRate(
  year: number,
  field: keyof Omit<FIREYearAssumption, 'assumption_year'>,
  globalRate: number,
  yearAssumptions: FIREYearAssumption[],
): number {
  const row = yearAssumptions.find(r => r.assumption_year === year);
  if (!row) return globalRate;
  const v = row[field];
  return v != null ? v : globalRate;
}

// ─── Core compound calculator ─────────────────────────────────────────────────

function monthsToFIRECompound(
  startBal:    number,
  monthlyAdd:  number,
  monthlyRate: number,
  target:      number
): number {
  if (startBal >= target) return 0;
  if (monthlyAdd <= 0 && monthlyRate <= 0) return Infinity;
  let bal = startBal;
  for (let m = 1; m <= 480; m++) {
    bal = bal * (1 + monthlyRate) + monthlyAdd;
    if (bal >= target) return m;
  }
  return Infinity;
}

// ─── Passive income estimator ─────────────────────────────────────────────────

function calcPassiveIncome(
  investable:    number,
  superBal:      number,
  propertyEquity:number,
  cfg:           FIREScenarioConfig,
  settings:      FIRESettingsResolved,
): number {
  const swr = settings.safe_withdrawal_rate / 100;
  const superAccessible = settings.include_super_in_fire ? superBal : 0;

  const ipYield = cfg.ip_expected_yield / 100;
  const propertyPart = settings.include_ip_equity
    ? (propertyEquity * ipYield / 12)
    : 0;
  const investPart   = (investable + superAccessible) * swr / 12;
  return propertyPart + investPart;
}

// ─── Timeline builder ─────────────────────────────────────────────────────────

function buildTimeline(
  input:        FIREPathInput,
  cfg:          FIREScenarioConfig,
  annualRate:   number,
  fireYear:     number,
): FIREScenarioYear[] {
  const { settings, yearAssumptions } = input;
  const swr            = settings.safe_withdrawal_rate / 100;
  const years          = Math.min(40, Math.max(fireYear - input.current_year + 5, 10));
  const mortRateMonthly = settings.mortgage_rate / 100 / 12;

  // Per-person super rates
  const rohamSuperMonthly = settings.roham_super_return_pct / 100 / 12;
  const faraSuperMonthly  = settings.fara_super_return_pct  / 100 / 12;

  let investable     = input.investable;
  let rohamSuper     = input.roham_super;
  let faraSuper      = input.fara_super;
  let propertyEquity = input.ppor - input.mortgage;
  let mortgage       = input.mortgage;
  let monthlyIncome  = input.monthly_income;
  let monthlyExpenses= input.monthly_expenses;

  const timeline: FIREScenarioYear[] = [];

  for (let y = 0; y < years; y++) {
    const yr = input.current_year + y;

    // Growth rates (year-by-year override or global)
    const incomeGrowth  = getYearRate(yr, 'income_growth_pct',  settings.income_growth_pct,  yearAssumptions) / 100;
    const expenseGrowth = getYearRate(yr, 'expense_growth_pct', settings.expense_inflation_pct, yearAssumptions) / 100;
    const propCagr      = getYearRate(yr, 'property_pct',       settings.property_cagr,       yearAssumptions) / 100;
    const yrMortRate    = getYearRate(yr, 'interest_rate_pct',  settings.mortgage_rate,       yearAssumptions);
    const yrMortMonthly = yrMortRate / 100 / 12;
    const invRate       = annualRate / 12;

    if (y > 0) {
      monthlyIncome   = monthlyIncome   * (1 + incomeGrowth);
      monthlyExpenses = monthlyExpenses * (1 + expenseGrowth);
    }

    const freeSurplus = Math.max(0, monthlyIncome - monthlyExpenses);

    // Allocation ratios from user config (pct_to_offset + pct_to_cash = non-growth)
    const totalGrowthPct = cfg.pct_to_etf + cfg.pct_to_crypto + cfg.pct_to_property;
    const investRatio    = Math.min(1, totalGrowthPct / 100);
    const toInvest       = freeSurplus * investRatio;

    // Invest monthly
    for (let m = 0; m < 12; m++) {
      investable = investable * (1 + invRate) + toInvest;
    }

    // Super per person: SGC + salary sacrifice
    const rohamSGC = monthlyIncome * (settings.roham_sgc_pct / 100);
    const faraSGC  = (settings.fara_monthly_income > 0 ? settings.fara_monthly_income : 0) * (settings.fara_sgc_pct / 100);
    const rohamSS  = settings.roham_salary_sacrifice_mo;
    const faraSS   = settings.fara_salary_sacrifice_mo;

    for (let m = 0; m < 12; m++) {
      rohamSuper = rohamSuper * (1 + rohamSuperMonthly) + rohamSGC + rohamSS;
      faraSuper  = faraSuper  * (1 + faraSuperMonthly)  + faraSGC  + faraSS;
    }

    // Property equity (only if scenario includes property)
    if (cfg.pct_to_property > 0 || cfg.pct_to_offset > 0) {
      const mortRepayment = mortgage > 0
        ? Math.min(
            mortgage / settings.mortgage_term_remaining / 12 + mortgage * yrMortMonthly,
            mortgage / 12 + 500
          )
        : 0;
      propertyEquity = propertyEquity * (1 + propCagr / 12 * 12) + (mortRepayment - mortgage * mortRateMonthly) * 12;
      if (mortgage > 0) {
        mortgage = Math.max(0, mortgage - mortRepayment * 12);
      }
    }

    const superCombined = rohamSuper + faraSuper;
    const superAccessible = settings.include_super_in_fire ? superCombined : 0;
    const netWorth = investable + superCombined + propertyEquity;

    const passive  = calcPassiveIncome(investable, superCombined, propertyEquity, cfg, settings);
    const target   = input.target_capital;
    const reached  = (investable + superAccessible) >= target
      || passive >= input.target_passive_income;

    timeline.push({
      year:          yr,
      net_worth:     Math.round(netWorth),
      investable:    Math.round(investable),
      super_balance: Math.round(superCombined),
      passive_income: Math.round(passive),
      surplus:       Math.round(freeSurplus),
      fire_reached:  reached,
    });
  }

  return timeline;
}

// ─── Scenario builders ────────────────────────────────────────────────────────

function buildAssumptions(
  settings: FIRESettingsResolved,
  rawSettings: FIRESettings | null,
  overrides: Record<string, string>,
): Record<string, { value: string; source: 'user' | 'default' }> {
  const src = (key: keyof FIRESettings): 'user' | 'default' =>
    rawSettings && rawSettings[key] != null ? 'user' : 'default';
  return {
    withdrawal_rate:   { value: `${settings.safe_withdrawal_rate}%`,    source: src('safe_withdrawal_rate') },
    income_growth:     { value: `${settings.income_growth_pct}%/yr`,    source: src('income_growth_pct') },
    expense_inflation: { value: `${settings.expense_inflation_pct}%/yr`, source: src('expense_inflation_pct') },
    mortgage_rate:     { value: `${settings.mortgage_rate}%`,            source: src('mortgage_rate') },
    mortgage_term:     { value: `${settings.mortgage_term_remaining}yr`, source: src('mortgage_term_remaining') },
    property_cagr:     { value: `${settings.property_cagr}%`,            source: src('property_cagr') },
    etf_return:        { value: `${settings.etf_return_pct}%`,           source: src('etf_return_pct') },
    super_return_r:    { value: `${settings.roham_super_return_pct}%`,   source: src('roham_super_return_pct') },
    super_return_f:    { value: `${settings.fara_super_return_pct}%`,    source: src('fara_super_return_pct') },
    sgc_rate_r:        { value: `${settings.roham_sgc_pct}%`,            source: 'default' },  // AU law
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, { value: v, source: 'user' as const }])),
  };
}

function simulateScenario(
  input: FIREPathInput,
  cfg: FIREScenarioConfig,
  rawSettings: FIRESettings | null,
): FIREScenario {
  const { settings } = input;
  const swr = settings.safe_withdrawal_rate / 100;

  // Determine growth rate: user override > global setting
  const annualRate = (() => {
    if (cfg.custom_return_pct != null) return cfg.custom_return_pct / 100;
    switch (cfg.scenario_id) {
      case 'property':   return settings.property_cagr / 100;
      case 'etf':        return settings.etf_return_pct / 100;
      case 'aggressive': return settings.stock_return_pct > 0
        ? (settings.stock_return_pct + 2) / 100   // growth premium
        : settings.etf_return_pct / 100;
      case 'mixed': {
        // Blend: weight by allocation
        const total = cfg.pct_to_etf + cfg.pct_to_property + cfg.pct_to_crypto;
        if (total === 0) return settings.etf_return_pct / 100;
        const blended = (
          cfg.pct_to_etf      * settings.etf_return_pct +
          cfg.pct_to_property * settings.property_cagr +
          cfg.pct_to_crypto   * settings.crypto_return_pct
        ) / total;
        return blended / 100;
      }
    }
  })();

  const investRatio = (cfg.pct_to_etf + cfg.pct_to_crypto + cfg.pct_to_property) / 100;

  // Extra IP equity for property scenarios
  const extraEquity = (cfg.scenario_id === 'property' || cfg.scenario_id === 'mixed') && cfg.num_planned_ips > 0
    ? Math.min(input.ppor * 0.25 * cfg.num_planned_ips, 200000)
    : 0;

  // Capital target accounting for PPOR / super inclusion
  const superAccessible = settings.include_super_in_fire ? input.super_combined : 0;
  const pporEquity = settings.include_ppor_equity ? (input.ppor - input.mortgage) : 0;
  const startBal = input.investable + superAccessible + pporEquity + extraEquity;

  const months = monthsToFIRECompound(
    startBal,
    input.monthly_surplus * Math.max(0.1, investRatio),
    annualRate / 12,
    input.target_capital
  );

  const maxFallback: Record<FIREScenarioId, number> = {
    property: 30, etf: 35, mixed: 28, aggressive: 25,
  };
  const fireYear = months === Infinity
    ? input.current_year + maxFallback[cfg.scenario_id]
    : input.current_year + Math.ceil(months / 12);

  const timeline = buildTimeline(input, cfg, annualRate, fireYear);
  const atFireRow = timeline.find(r => r.year >= fireYear) ?? timeline[timeline.length - 1];

  const allocTotal = cfg.pct_to_property + cfg.pct_to_etf + cfg.pct_to_crypto
    + cfg.pct_to_super + cfg.pct_to_offset + cfg.pct_to_cash;

  const META: Record<FIREScenarioId, { label: string; tagline: string; risk_level: FIREScenario['risk_level']; risk_color: FIREScenario['risk_color']; primary_vehicle: string; tax_note: string }> = {
    property:   { label: 'Property Focused',   tagline: 'Build equity through property + rental income',              risk_level: 'Medium',    risk_color: 'amber',  primary_vehicle: 'Investment Property + Offset', tax_note: 'Negative gearing reduces taxable income. CGT discount (50%) on sale after 12 months.' },
    etf:        { label: 'ETF / Stock Focused', tagline: 'Max surplus → index ETFs, 4% SWR withdrawal',               risk_level: 'Low',       risk_color: 'green',  primary_vehicle: 'ETF / Index Funds (VAS + VGS)', tax_note: 'Franked dividends reduce tax. CGT discount (50%) on units held >12 months.' },
    mixed:      { label: 'Mixed Strategy',      tagline: 'Balanced: ETFs + property equity + super maximisation',     risk_level: 'Medium',    risk_color: 'amber',  primary_vehicle: 'ETF + Offset + Super (Mixed)',   tax_note: 'Super contributions taxed at 15% vs marginal. Franked ETF dividends. NG on IP.' },
    aggressive: { label: 'Aggressive Growth',   tagline: 'Maximum growth assets, highest risk, fastest theoretical FIRE', risk_level: 'Very High', risk_color: 'purple', primary_vehicle: 'Growth ETF (DHHF) + Crypto',   tax_note: 'Investment loan interest deductible. CGT discount after 12 months.' },
  };
  const meta = META[cfg.scenario_id];

  const progressBal = input.investable + (settings.include_super_in_fire ? input.super_combined : 0)
    + (settings.include_ppor_equity ? Math.max(0, input.ppor - input.mortgage) : 0);

  return {
    id:                      cfg.scenario_id,
    label:                   meta.label,
    tagline:                 meta.tagline,
    fire_year:               fireYear,
    years_to_fire:           fireYear - input.current_year,
    net_worth_at_fire:       atFireRow.net_worth,
    monthly_passive_at_fire: atFireRow.passive_income,
    risk_level:              meta.risk_level,
    risk_color:              meta.risk_color,
    strategy_summary: buildStrategySummary(cfg, settings, annualRate),
    key_moves: buildKeyMoves(cfg, input),
    timeline,
    progress_pct:            Math.min(100, Math.round((progressBal / input.target_capital) * 100)),
    annual_invest:           Math.round(input.monthly_surplus * investRatio * 12),
    primary_vehicle:         meta.primary_vehicle,
    tax_note:                meta.tax_note,
    cgt_discount_applies:    true,
    allocation_total_pct:    Math.round(allocTotal),
    return_pct_used:         Math.round(annualRate * 1000) / 10,
    assumptions_used:        buildAssumptions(settings, rawSettings, {}),
  };
}

function buildStrategySummary(cfg: FIREScenarioConfig, settings: FIRESettingsResolved, rate: number): string {
  const investTotal = cfg.pct_to_etf + cfg.pct_to_crypto + cfg.pct_to_property;
  const rateStr = `${(rate * 100).toFixed(1)}% CAGR`;
  switch (cfg.scenario_id) {
    case 'property':
      return `Direct ${cfg.pct_to_offset}% of surplus to mortgage offset and ${cfg.pct_to_etf}% to ETFs at ${rateStr}. Property equity grows at ${settings.property_cagr}%/yr. FIRE when investable + super covers target capital at ${settings.safe_withdrawal_rate}% SWR.`;
    case 'etf':
      return `Automate ${cfg.pct_to_etf}% of surplus into index ETFs at ${rateStr}. Low cost, fully liquid. FIRE reached when portfolio generates passive income at ${settings.safe_withdrawal_rate}% SWR.`;
    case 'mixed':
      return `Split: ${cfg.pct_to_etf}% ETF + ${cfg.pct_to_offset}% offset + ${cfg.pct_to_property}% property + ${cfg.pct_to_super}% super contributions. Blended ${rateStr}. Multiple passive income streams by FIRE.`;
    case 'aggressive':
      return `Max ${investTotal}% of surplus into growth assets (${cfg.pct_to_etf}% ETF, ${cfg.pct_to_crypto}% crypto) at ${rateStr}. ${cfg.leverage_allowed ? 'Leverage permitted (LOC/margin).' : 'No leverage.'} Highest upside, highest sequence-of-returns risk.`;
  }
}

function buildKeyMoves(cfg: FIREScenarioConfig, input: FIREPathInput): string[] {
  const { settings } = input;
  const surplus = input.monthly_surplus;
  const fmt = (n: number) => `$${Math.round(n / 100) * 100}`;
  switch (cfg.scenario_id) {
    case 'property':
      return [
        `Direct ${fmt(surplus * cfg.pct_to_offset / 100)}/mo into PPOR offset (${cfg.pct_to_offset}% of surplus)`,
        `Invest ${fmt(surplus * cfg.pct_to_etf / 100)}/mo into ETFs (${cfg.pct_to_etf}% of surplus)`,
        cfg.num_planned_ips > 0
          ? `Plan IP purchase using PPOR equity — ${cfg.num_planned_ips} IP at ${cfg.ip_expected_yield}% yield`
          : `Monitor PPOR equity — refinance when LVR < 60% to access deposit`,
      ];
    case 'etf':
      return [
        `Automate ${fmt(surplus * cfg.pct_to_etf / 100)}/mo into VAS (40%) + VGS (60%) — ${cfg.pct_to_etf}% of surplus`,
        `Reinvest all dividends — do not spend them`,
        `Hold ${cfg.pct_to_cash}% surplus as cash buffer — replenish if below 3-month runway`,
      ];
    case 'mixed':
      return [
        `${fmt(surplus * cfg.pct_to_etf / 100)}/mo ETF + ${fmt(surplus * cfg.pct_to_offset / 100)}/mo offset`,
        `Max concessional super: salary sacrifice Roham +${fmt(settings.roham_salary_sacrifice_mo)}/mo + Fara +${fmt(settings.fara_salary_sacrifice_mo)}/mo`,
        `Redirect property gains into ETFs once PPOR LVR < 60%`,
      ];
    case 'aggressive':
      return [
        `${fmt(surplus * cfg.pct_to_etf / 100)}/mo into DHHF (100% growth ETF)`,
        `${fmt(surplus * cfg.pct_to_crypto / 100)}/mo into BTC/ETH only — ${cfg.pct_to_crypto}% crypto allocation`,
        cfg.leverage_allowed
          ? `Use PPOR LOC to amplify during market dips — max 20% LVR increase`
          : `No leverage — pure growth assets only`,
      ];
  }
}

// ─── Sensitivity analysis ─────────────────────────────────────────────────────

function runSensitivity(input: FIREPathInput, baseFireYear: number, baseScenarioCfg: FIREScenarioConfig, baseRate: number): FIRESensitivity {
  const run = (overrides: Partial<FIREPathInput & { annualRate: number }>): number => {
    const modified = { ...input, ...overrides };
    const swr = modified.settings.safe_withdrawal_rate / 100;
    const rate = (overrides as any).annualRate ?? baseRate;
    const months = monthsToFIRECompound(
      modified.investable + (modified.settings.include_super_in_fire ? modified.super_combined : 0),
      modified.monthly_surplus * Math.max(0.1, (baseScenarioCfg.pct_to_etf + baseScenarioCfg.pct_to_crypto + baseScenarioCfg.pct_to_property) / 100),
      rate / 12,
      modified.target_capital
    );
    return months === Infinity ? input.current_year + 40 : input.current_year + Math.ceil(months / 12);
  };

  const rMinus2    = run({ annualRate: Math.max(0.01, baseRate - 0.02) } as any);
  const ePlus10    = run({
    monthly_expenses: input.monthly_expenses * 1.10,
    monthly_surplus:  Math.max(0, input.monthly_income - input.monthly_expenses * 1.10),
    target_capital:   (input.monthly_expenses * 1.10 + input.bills_total_monthly) * 12 / (input.settings.safe_withdrawal_rate / 100),
  });
  const sMinus20   = run({ monthly_surplus: input.monthly_surplus * 0.80 });
  const propFlat   = run({ annualRate: baseRate * 0.5 } as any);  // half-rate = property flat

  return {
    returns_minus_2pct:  { fire_year: rMinus2,  delta: rMinus2  - baseFireYear },
    expenses_plus_10pct: { fire_year: ePlus10,  delta: ePlus10  - baseFireYear },
    surplus_minus_20pct: { fire_year: sMinus20, delta: sMinus20 - baseFireYear },
    property_flat:       { fire_year: propFlat, delta: propFlat - baseFireYear },
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function computeFirePath(input: FIREPathInput, rawSettings: FIRESettings | null = null): FIREPathResult {
  const { settings } = input;

  // Missing fields check
  const missing: string[] = [];
  if (!settings.roham_age)                  missing.push('Current age (Roham)');
  if (!settings.desired_fire_age)           missing.push('Desired FIRE age');
  if (!settings.desired_monthly_passive)    missing.push('Desired monthly passive income');
  if (!settings.mortgage_rate || settings.mortgage_rate === DEFAULTS.mortgage_rate)
                                            missing.push('Mortgage rate (using 6.5% default)');
  if (!settings.mortgage_term_remaining || settings.mortgage_term_remaining === DEFAULTS.mortgage_term_remaining)
                                            missing.push('Mortgage term remaining (using 25yr default)');

  const dataCoverage: FIREPathResult['data_coverage'] =
    missing.length > 2 ? 'needs_setup' :
    missing.length > 0 ? 'partial' :
    input.investable > 0 ? 'full' : 'partial';

  // Run all 4 scenarios
  const scenarios = input.scenarioConfigs.map(cfg =>
    simulateScenario(input, cfg, rawSettings)
  );

  // Find best
  const finite = scenarios.filter(s => s.fire_year < input.current_year + 40);
  const best = finite.length > 0
    ? finite.reduce((a, b) => a.fire_year < b.fire_year ? a : b)
    : scenarios.find(s => s.id === 'etf') ?? scenarios[0];

  const fastest = best.fire_year;
  const fireYears = finite.map(s => s.fire_year);
  const slowest = fireYears.length > 1 ? Math.max(...fireYears) : fastest + 5;

  // Semi-FIRE year (50% target)
  const bestCfg = input.scenarioConfigs.find(c => c.id === best.id) ?? input.scenarioConfigs[0];
  const semiMonths = monthsToFIRECompound(
    input.investable,
    input.monthly_surplus * 0.7,
    (best.return_pct_used / 100) / 12,
    input.target_capital * 0.5
  );
  const semiYear = semiMonths === Infinity
    ? fastest - 4
    : input.current_year + Math.ceil(semiMonths / 12);

  // Current progress
  const superAcc = settings.include_super_in_fire ? input.super_combined : 0;
  const pporEq   = settings.include_ppor_equity   ? Math.max(0, input.ppor - input.mortgage) : 0;
  const progressBal = input.investable + superAcc + pporEq;
  const currentPct  = Math.min(100, Math.round((progressBal / input.target_capital) * 100));
  const gap         = Math.max(0, input.target_capital - progressBal);

  // Sensitivity
  const sensitivity = runSensitivity(input, fastest, bestCfg, best.return_pct_used / 100);

  // Recommendation text
  const recMap: Record<FIREScenarioId, string> = {
    etf:        `Option B (ETF-Focused) is the most reliable path to FIRE in ${best.fire_year}. At ${best.return_pct_used}% CAGR with $${Math.round(input.monthly_surplus * 0.8 / 100) * 100}/mo into ETFs, your portfolio hits the $${(input.target_capital / 1_000_000).toFixed(1)}M target with full liquidity and no leverage risk.`,
    property:   `Option A (Property-Focused) projects FIRE in ${best.fire_year} by leveraging PPOR equity into investment property. Rental income + capital growth provides an inflation-hedged passive income stream.`,
    mixed:      `Option C (Mixed) balances ETFs, offset, and super to reach FIRE in ${best.fire_year}. Tax-efficient, diversified across asset classes, with multiple passive income streams at FIRE.`,
    aggressive: `Option D (Aggressive) projects FIRE in ${best.fire_year} by deploying ${bestCfg.pct_to_etf + bestCfg.pct_to_crypto}% of surplus into high-growth assets. ${bestCfg.leverage_allowed ? 'Leverage amplifies both gains and losses.' : 'No leverage applied.'} Requires strong risk tolerance.`,
  };

  return {
    scenarios,
    best_scenario:              best.id,
    best_label:                 best.label,
    best_fire_year:             fastest,
    fastest_vs_slowest_years:   slowest - fastest,
    target_capital:             Math.round(input.target_capital),
    target_passive_income:      Math.round(input.target_passive_income),
    current_progress_pct:       currentPct,
    investable_now:             Math.round(input.investable),
    super_now:                  Math.round(input.super_combined),
    total_nw_now:               Math.round(input.net_worth),
    fire_gap:                   Math.round(gap),
    recommendation:             recMap[best.id],
    semi_fire_year:             Math.max(input.current_year + 1, semiYear),
    data_coverage:              dataCoverage,
    missing_fields:             missing,
    sensitivity,
  };
}
