/**
 * capture-regression-baseline.ts — Pre-P1 regression baseline capture
 *
 * Captures deterministic outputs from current-rules tax engines BEFORE any
 * regime-aware wiring is added. These fixtures form the contract that P1 must
 * preserve byte-for-byte (for current-rules paths).
 *
 * Fixtures mirror Roham Shahrokh's production household profile but use
 * synthetic deterministic values so this script is stable across runs and
 * requires zero DB access.
 *
 * Run with:  npx tsx script/capture-regression-baseline.ts
 *
 * Outputs:
 *   - script/regression-baseline/tax-alpha.baseline.json
 *   - script/regression-baseline/forecast.baseline.json
 *   - script/regression-baseline/fire.baseline.json
 *   - script/regression-baseline/property-buy.baseline.json
 *   - script/regression-baseline/SUMMARY.md (human-readable)
 *
 * After P1 wiring, re-run capture-regression-baseline.ts in --verify mode
 * (or run script/verify-regression-baseline.ts) to confirm no drift on
 * current-rules outputs.
 *
 * NON-NEGOTIABLE: any current-rules numeric drift > $1 = P1 has broken
 * the parallel-pathway guarantee.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeTaxAlpha, buildTaxAlphaInput, type TaxAlphaInput } from '../client/src/lib/taxAlphaEngine';
import { buildForecast, type ForecastInput } from '../client/src/lib/forecastEngine';
import { computeFirePath, buildFirePathInput } from '../client/src/lib/firePathEngine';
import { computeAllScenarios } from '../client/src/lib/propertyBuyEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, 'regression-baseline');

// ─── Synthetic household fixture (Roham-like, deterministic) ─────────────────
// Values chosen to exercise: tax brackets, NG, super carry-forward, mortgage,
// rental property cashflow. NO production values used.

const FIXTURE_SNAPSHOT = {
  // Identity / income
  monthly_income:        21940,   // COMBINED (mirrors prod bug source)
  roham_monthly_income:  11140,
  fara_monthly_income:   10800,
  monthly_expenses:      14500,
  // Super
  super_balance:         420000,
  roham_super_balance:   245000,
  fara_super_balance:    175000,
  roham_employer_contrib: 12,
  fara_employer_contrib:  12,
  roham_salary_sacrifice: 0,
  fara_salary_sacrifice:  0,
  // Cash / liquid
  cash:                  85000,
  offset_balance:        180000,
  stocks:                95000,
  crypto:                42000,
  // Property / debts
  ppor:                  1450000,
  mortgage:              720000,
  mortgage_rate:         6.4,
  other_debts:           12000,
  rental_income_total:   31200,    // $600/wk
  // Tax flags
  roham_has_private_health: true,
  fara_has_private_health:  true,
  roham_has_help_debt:      false,
  fara_has_help_debt:       false,
  unrealised_gains:         28000,
  // Misc
  other_income:          0,
} as const;

const FIXTURE_TAX_PROFILE = {
  override_active:           true,
  roham_salary:              185600,
  fara_salary:               176500,
  roham_super_rate:          12,
  fara_super_rate:           12,
  roham_salary_sacrifice:    0,
  fara_salary_sacrifice:     0,
  roham_has_private_health:  true,
  fara_has_private_health:   true,
  roham_has_help_debt:       false,
  fara_has_help_debt:        false,
};

const FIXTURE_PROPERTIES = [
  {
    is_ppor:        true,
    weekly_rent:    0,
    loan_balance:   720000,
    interest_rate:  6.4,
    management_fee: 0,
    council_rates:  2400,
    insurance:      1800,
    maintenance:    2500,
    body_corporate: 0,
    property_type:  'PPOR',
  },
  {
    is_ppor:        false,
    weekly_rent:    600,
    loan_balance:   480000,
    interest_rate:  6.6,
    management_fee: 8,
    council_rates:  1800,
    insurance:      1200,
    maintenance:    1500,
    body_corporate: 2400,
    property_type:  'INVESTMENT',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function writeJSON(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  wrote ${path.relative(process.cwd(), file)}`);
}

/** Round numeric values for stable snapshots — preserves cents precision */
function snapshot<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.round(v * 100) / 100;
    }
    return v;
  }));
}

// ─── 1. Tax Alpha baseline ───────────────────────────────────────────────────

function captureTaxAlpha() {
  console.log('[1/4] Tax Alpha baseline...');
  const input: TaxAlphaInput = buildTaxAlphaInput(
    FIXTURE_SNAPSHOT,
    FIXTURE_PROPERTIES,
    FIXTURE_TAX_PROFILE,
    undefined,
    {
      rohamAnnual:     FIXTURE_TAX_PROFILE.roham_salary,
      faraAnnual:      FIXTURE_TAX_PROFILE.fara_salary,
      overrideActive:  true,
    },
  );
  const result = computeTaxAlpha(input);
  const baseline = {
    captured_at: '2026-05-12T00:00:00Z',  // pinned, not Date.now() — deterministic
    fixture_name: 'roham-like-household-v1',
    input: snapshot(input),
    output: {
      fy:                  result.fy,
      data_coverage:       result.data_coverage,
      household_tax_now:           result.household_tax_now,
      roham_total_deductions:      result.roham_tax_now.totalDeductions,
      roham_income_tax:            result.roham_tax_now.incomeTax,
      roham_medicare:              result.roham_tax_now.medicareLevy,
      roham_marginal_rate:         result.roham_tax_now.marginalRate,
      roham_effective_rate:        result.roham_tax_now.effectiveTaxRate,
      roham_net_annual:            result.roham_tax_now.netAnnual,
      fara_total_deductions:       result.fara_tax_now.totalDeductions,
      fara_income_tax:             result.fara_tax_now.incomeTax,
      fara_medicare:               result.fara_tax_now.medicareLevy,
      fara_marginal_rate:          result.fara_tax_now.marginalRate,
      fara_effective_rate:         result.fara_tax_now.effectiveTaxRate,
      fara_net_annual:             result.fara_tax_now.netAnnual,
      total_annual_saving: result.total_annual_saving,
      total_saving_label:  result.total_saving_label,
      top3_ids:            result.top3.map(s => s.id),
      strategies_summary:  result.strategies.map(s => ({
        id:             s.id,
        title:          s.title,
        category:       s.category,
        annual_saving:  s.annual_saving,
        risk:           s.risk,
        priority:       s.priority,
        data_reliable:  s.data_reliable,
      })),
    },
  };
  writeJSON(path.join(OUT_DIR, 'tax-alpha.baseline.json'), snapshot(baseline));
  return baseline;
}

// ─── 2. Forecast baseline ────────────────────────────────────────────────────

function captureForecast() {
  console.log('[2/4] Forecast baseline...');
  const forecastInput: ForecastInput = {
    snapshot:           FIXTURE_SNAPSHOT,
    properties:         FIXTURE_PROPERTIES,
    stocks:             [],
    cryptos:            [],
    stockTransactions:  [],
    cryptoTransactions: [],
    bills:              [],
    expenses:           [],
    assumptions: {
      inflation:      3,
      ppor_growth:    6,
      prop_growth:    6,
      stock_return:   8.5,
      crypto_return:  12,
      income_growth:  3.5,
      expense_growth: 3,
    },
    annualSalaryIncome:
      FIXTURE_TAX_PROFILE.roham_salary + FIXTURE_TAX_PROFILE.fara_salary,
  };
  const result = buildForecast(forecastInput);
  const baseline = {
    captured_at:  '2026-05-12T00:00:00Z',
    fixture_name: 'roham-like-household-v1',
    output: {
      monthly_count:  result.monthly.length,
      annual_count:   result.annual.length,
      nw_count:       result.netWorth.length,
      // First/mid/last year NW snapshots
      nw_year_1:      result.netWorth[0] ?? null,
      nw_year_5:      result.netWorth[4] ?? null,
      nw_year_10:     result.netWorth[9] ?? null,
      nw_final:       result.netWorth[result.netWorth.length - 1] ?? null,
      // First/last annual cashflow
      annual_first:   result.annual[0] ?? null,
      annual_last:    result.annual[result.annual.length - 1] ?? null,
    },
  };
  writeJSON(path.join(OUT_DIR, 'forecast.baseline.json'), snapshot(baseline));
  return baseline;
}

// ─── 3. FIRE baseline ────────────────────────────────────────────────────────

function captureFire() {
  console.log('[3/4] FIRE baseline...');
  const fireSettings = {
    roham_age:                40,
    fara_age:                 38,
    desired_fire_age:         55,
    desired_partner_fire_age: 55,
    desired_monthly_passive:  15000,
    safe_withdrawal_rate:     4,
    include_super_in_fire:    true,
    include_ppor_equity:      false,
    include_ip_equity:        true,
    include_crypto:           true,
    include_stocks:           true,
    mortgage_rate:            6.4,
    mortgage_term_remaining:  27,
    property_cagr:            6,
    rent_growth_pct:          3,
    vacancy_pct:              4,
    property_holding_cost_pct: 1.5,
    etf_return_pct:           8.5,
    crypto_return_pct:        12,
    cash_hisa_return_pct:     4.5,
    stock_return_pct:         8.5,
    roham_sgc_pct:            12,
    roham_super_return_pct:   7.5,
    roham_salary_sacrifice_mo: 0,
    fara_sgc_pct:             12,
    fara_super_return_pct:    7.5,
    fara_salary_sacrifice_mo: 0,
    income_growth_pct:        3.5,
    expense_inflation_pct:    3,
    general_inflation_pct:    3,
    tax_rate_estimate_pct:    32,
    use_manual_income:        false,
    manual_monthly_income:    null,
    manual_monthly_expenses:  null,
    manual_monthly_surplus:   null,
    fara_monthly_income:      FIXTURE_SNAPSHOT.fara_monthly_income,
    has_dependants:           true,
  } as any;

  const fireInput = buildFirePathInput(FIXTURE_SNAPSHOT, [], fireSettings, [], []);
  const result = computeFirePath(fireInput, fireSettings);

  const baseline = {
    captured_at:  '2026-05-12T00:00:00Z',
    fixture_name: 'roham-like-household-v1',
    output: {
      best_scenario:          result.best_scenario,
      best_label:             result.best_label,
      best_fire_year:         result.best_fire_year,
      target_capital:         result.target_capital,
      target_passive_income:  result.target_passive_income,
      current_progress_pct:   result.current_progress_pct,
      investable_now:         result.investable_now,
      super_now:              result.super_now,
      total_nw_now:           result.total_nw_now,
      fire_gap:               result.fire_gap,
      semi_fire_year:         result.semi_fire_year,
      data_coverage:          result.data_coverage,
      scenarios_summary: result.scenarios.map(s => ({
        id:                 s.id,
        label:              s.label,
        fire_year:          s.fire_year,
        years_to_fire:      s.years_to_fire,
        net_worth_at_fire:  s.net_worth_at_fire,
        monthly_passive_at_fire: s.monthly_passive_at_fire,
        risk_level:         s.risk_level,
        progress_pct:       s.progress_pct,
        annual_invest:      s.annual_invest,
        timeline_length:    s.timeline.length,
      })),
      sensitivity: result.sensitivity,
    },
  };
  writeJSON(path.join(OUT_DIR, 'fire.baseline.json'), snapshot(baseline));
  return baseline;
}

// ─── 4. Property Buy baseline ────────────────────────────────────────────────

function capturePropertyBuy() {
  console.log('[4/4] Property Buy baseline...');
  const baseInput = {
    purchase_price:     820000,
    deposit_pct:        20,
    state:              'QLD' as const,
    loan_rate:          6.6,
    loan_type:          'PI' as const,
    io_years:           0,
    loan_term:          30,
    weekly_rent:        620,
    rental_growth_pct:  3,
    capital_growth_pct: 6,
    management_fee_pct: 8,
    council_rates:      1800,
    insurance:          1200,
    maintenance_pct:    0.5,
    body_corporate:     2400,
    annual_salary:      FIXTURE_TAX_PROFILE.roham_salary,
    has_depreciation:   true,
    build_year:         2015,
    price_growth_during_wait_pct: 0,
    deposit_investment_return_pct: 6.25,
    horizon_years:      10,
    offset_balance:     FIXTURE_SNAPSHOT.offset_balance,
    mortgage_rate:      FIXTURE_SNAPSHOT.mortgage_rate,
  };
  const result = computeAllScenarios(baseInput);
  const flatten = (s: typeof result.buy_now) => ({
    label:                s.label,
    purchase_price:       s.purchase_price,
    deposit:              s.deposit,
    stamp_duty:           s.stamp_duty,
    total_upfront:        s.total_upfront,
    loan_amount:          s.loan_amount,
    property_value_end:   s.property_value_end,
    loan_balance_end:     s.loan_balance_end,
    equity_end:           s.equity_end,
    capital_gain:         s.capital_gain,
    cgt_discount_gain:    s.cgt_discount_gain,
    avg_monthly_cashflow: s.avg_monthly_cashflow,
    total_cash_invested:  s.total_cash_invested,
    irr:                  s.irr,
    total_return_pct:     s.total_return_pct,
    confidence:           s.confidence,
    risk_level:           s.risk_level,
  });
  const baseline = {
    captured_at:  '2026-05-12T00:00:00Z',
    fixture_name: 'roham-like-investment-buy-v1',
    output: {
      best_scenario: result.best_scenario,
      best_label:    result.best_label,
      confidence:    result.confidence,
      buy_now:       flatten(result.buy_now),
      wait_6m:       flatten(result.wait_6m),
      wait_12m:      flatten(result.wait_12m),
    },
  };
  writeJSON(path.join(OUT_DIR, 'property-buy.baseline.json'), snapshot(baseline));
  return baseline;
}

// ─── Human-readable summary ──────────────────────────────────────────────────

function writeSummary(taxAlpha: any, forecast: any, fire: any, propertyBuy: any) {
  const lines = [
    '# Regression Baseline — Pre-P1 (Current-Rules)',
    '',
    '**Captured:** 2026-05-12 (synthetic deterministic fixtures, NO DB access)',
    '**Branch:** fix/fwl-tax-reform-p1',
    '**Parent HEAD:** 86f2fd7 (P0.1)',
    '',
    'This file documents the **current-rules** outputs of the four core tax-touching',
    'engines BEFORE any regime-aware wiring is added in P1. After P1 is complete,',
    'the current-rules path of every engine MUST reproduce these numbers exactly.',
    'Any drift > $1 indicates a parallel-pathway violation.',
    '',
    '## Tax Alpha',
    '',
    `- FY: \`${taxAlpha.output.fy}\``,
    `- Data coverage: \`${taxAlpha.output.data_coverage}\``,
    `- Household tax (now): **$${taxAlpha.output.household_tax_now.toLocaleString('en-AU')}**`,
    `- Roham marginal rate: **${(taxAlpha.output.roham_marginal_rate * 100).toFixed(2)}%**`,
    `- Roham total deductions: **$${taxAlpha.output.roham_total_deductions.toLocaleString('en-AU')}**`,
    `- Roham net annual: **$${taxAlpha.output.roham_net_annual.toLocaleString('en-AU')}**`,
    `- Fara marginal rate: **${(taxAlpha.output.fara_marginal_rate * 100).toFixed(2)}%**`,
    `- Fara total deductions: **$${taxAlpha.output.fara_total_deductions.toLocaleString('en-AU')}**`,
    `- Fara net annual: **$${taxAlpha.output.fara_net_annual.toLocaleString('en-AU')}**`,
    `- Total annual saving (top-3): **$${taxAlpha.output.total_annual_saving.toLocaleString('en-AU')}**`,
    `- Top 3 strategy IDs: ${taxAlpha.output.top3_ids.map((id: string) => `\`${id}\``).join(', ')}`,
    '',
    '### Strategy detail',
    '',
    '| ID | Title | Category | Annual saving | Priority | Risk | Reliable |',
    '|---|---|---|---|---|---|---|',
    ...taxAlpha.output.strategies_summary.map((s: any) =>
      `| \`${s.id}\` | ${s.title} | ${s.category} | $${s.annual_saving.toLocaleString('en-AU')} | ${s.priority} | ${s.risk} | ${s.data_reliable} |`),
    '',
    '## Forecast',
    '',
    `- Monthly series length: ${forecast.output.monthly_count}`,
    `- Annual series length: ${forecast.output.annual_count}`,
    `- NW projection length: ${forecast.output.nw_count} years`,
    `- NW year 1 (start → end): **$${(forecast.output.nw_year_1?.startNetWorth ?? 0).toLocaleString('en-AU')} → $${(forecast.output.nw_year_1?.endNetWorth ?? 0).toLocaleString('en-AU')}** (growth $${(forecast.output.nw_year_1?.growth ?? 0).toLocaleString('en-AU')})`,
    `- NW year 5 (start → end): **$${(forecast.output.nw_year_5?.startNetWorth ?? 0).toLocaleString('en-AU')} → $${(forecast.output.nw_year_5?.endNetWorth ?? 0).toLocaleString('en-AU')}** (growth $${(forecast.output.nw_year_5?.growth ?? 0).toLocaleString('en-AU')})`,
    `- NW year 10 (start → end): **$${(forecast.output.nw_year_10?.startNetWorth ?? 0).toLocaleString('en-AU')} → $${(forecast.output.nw_year_10?.endNetWorth ?? 0).toLocaleString('en-AU')}** (growth $${(forecast.output.nw_year_10?.growth ?? 0).toLocaleString('en-AU')})`,
    `- NW final end: **$${(forecast.output.nw_final?.endNetWorth ?? 0).toLocaleString('en-AU')}**`,
    `- Final CAGR: **${(forecast.output.nw_final?.cagr ?? 0).toFixed(2)}%**`,
    '',
    '## FIRE Path',
    '',
    `- Best scenario: **${fire.output.best_label}** (\`${fire.output.best_scenario}\`)`,
    `- Best FIRE year: **${fire.output.best_fire_year}**`,
    `- Semi-FIRE year: **${fire.output.semi_fire_year}**`,
    `- Target capital: **$${fire.output.target_capital.toLocaleString('en-AU')}**`,
    `- Target passive income: **$${fire.output.target_passive_income.toLocaleString('en-AU')}/mo**`,
    `- Current progress: **${fire.output.current_progress_pct.toFixed(1)}%**`,
    `- Investable now: **$${fire.output.investable_now.toLocaleString('en-AU')}**`,
    `- Super now: **$${fire.output.super_now.toLocaleString('en-AU')}**`,
    `- Total NW now: **$${fire.output.total_nw_now.toLocaleString('en-AU')}**`,
    `- FIRE gap: **$${fire.output.fire_gap.toLocaleString('en-AU')}**`,
    `- Data coverage: \`${fire.output.data_coverage}\``,
    '',
    '### FIRE Sensitivity (years to FIRE delta)',
    '',
    `- Returns −2pp: ${fire.output.sensitivity.returns_minus_2pct.fire_year} (Δ ${fire.output.sensitivity.returns_minus_2pct.delta})`,
    `- Expenses +10%: ${fire.output.sensitivity.expenses_plus_10pct.fire_year} (Δ ${fire.output.sensitivity.expenses_plus_10pct.delta})`,
    `- Surplus −20%: ${fire.output.sensitivity.surplus_minus_20pct.fire_year} (Δ ${fire.output.sensitivity.surplus_minus_20pct.delta})`,
    `- Property flat: ${fire.output.sensitivity.property_flat.fire_year} (Δ ${fire.output.sensitivity.property_flat.delta})`,
    '',
    '## Property Buy',
    '',
    `- Best scenario: **${propertyBuy.output.best_label}** (\`${propertyBuy.output.best_scenario}\`)`,
    `- Confidence: **${propertyBuy.output.confidence}/100**`,
    '',
    '### Buy Now (10-year horizon)',
    '',
    `- Purchase price: $${propertyBuy.output.buy_now.purchase_price.toLocaleString('en-AU')}`,
    `- Deposit: $${propertyBuy.output.buy_now.deposit.toLocaleString('en-AU')}`,
    `- Stamp duty: $${propertyBuy.output.buy_now.stamp_duty.toLocaleString('en-AU')}`,
    `- Total upfront: $${propertyBuy.output.buy_now.total_upfront.toLocaleString('en-AU')}`,
    `- Property value end: $${propertyBuy.output.buy_now.property_value_end.toLocaleString('en-AU')}`,
    `- Equity end: $${propertyBuy.output.buy_now.equity_end.toLocaleString('en-AU')}`,
    `- Capital gain: $${propertyBuy.output.buy_now.capital_gain.toLocaleString('en-AU')}`,
    `- CGT-discounted gain: $${propertyBuy.output.buy_now.cgt_discount_gain.toLocaleString('en-AU')}`,
    `- Avg monthly cashflow: $${propertyBuy.output.buy_now.avg_monthly_cashflow.toFixed(0)}`,
    `- Total cash invested: $${propertyBuy.output.buy_now.total_cash_invested.toLocaleString('en-AU')}`,
    `- IRR (annualised): **${(propertyBuy.output.buy_now.irr * 100).toFixed(2)}%**`,
    `- Risk: **${propertyBuy.output.buy_now.risk_level}**`,
    '',
    '---',
    '',
    '**Modelling disclaimer:** This is modelling only and not personal tax advice.',
    '',
  ];
  const file = path.join(OUT_DIR, 'SUMMARY.md');
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`  wrote ${path.relative(process.cwd(), file)}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Capturing pre-P1 regression baseline (current-rules engines)...');
  ensureDir(OUT_DIR);
  const taxAlpha    = captureTaxAlpha();
  const forecast    = captureForecast();
  const fire        = captureFire();
  const propertyBuy = capturePropertyBuy();
  writeSummary(taxAlpha, forecast, fire, propertyBuy);
  console.log('\nDone. Baseline captured in script/regression-baseline/');
}

main();
