/**
 * test-fire-both-regimes.ts — FIRE parallel-pathway tests.
 *
 * Run: npx tsx script/test-fire-both-regimes.ts
 */

import { computeFirePath, buildFirePathInput } from "../client/src/lib/firePathEngine";
import {
  computeFireBothRegimes,
  buildAndComputeFireBothRegimes,
} from "../client/src/lib/firePathEngineRegimeAware";

const FIXTURE_SNAPSHOT = {
  monthly_income:        21940,
  roham_monthly_income:  11140,
  fara_monthly_income:   10800,
  monthly_expenses:      14500,
  super_balance:         420000,
  roham_super_balance:   245000,
  fara_super_balance:    175000,
  cash:                  85000,
  offset_balance:        180000,
  stocks:                95000,
  crypto:                42000,
  ppor:                  1450000,
  mortgage:              720000,
  other_debts:           12000,
};

const FIRE_SETTINGS: any = {
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
  fara_sgc_pct:             12,
  fara_super_return_pct:    7.5,
  income_growth_pct:        3.5,
  expense_inflation_pct:    3,
  general_inflation_pct:    3,
  tax_rate_estimate_pct:    32,
  use_manual_income:        false,
  manual_monthly_income:    null,
  manual_monthly_expenses:  null,
  manual_monthly_surplus:   null,
  fara_monthly_income:      10800,
  has_dependants:           true,
};

function makeProperties(ip: any) {
  return [ip];
}

const TESTS: Array<{ name: string; assert: () => void }> = [];
function test(n: string, fn: () => void) { TESTS.push({ name: n, assert: fn }); }
function approxEq(a: number, b: number, tol: number, m: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${m}: |${a}-${b}|=${Math.abs(a - b)} > ${tol}`);
}

// ─── Test 1: current branch = legacy computeFirePath ─────────────────────────
test("current branch = legacy computeFirePath", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2020-03-01",
  });
  const input = buildFirePathInput(FIXTURE_SNAPSHOT, [], FIRE_SETTINGS, [], []);
  const legacy = computeFirePath(input, FIRE_SETTINGS);
  const both = computeFireBothRegimes({
    input, rawSettings: FIRE_SETTINGS, properties, regimeSelector: "AUTO_DETECT",
    annualSalaryIncome: 362100,
  });
  approxEq(both.current.best_fire_year, legacy.best_fire_year, 0, "best_fire_year");
  approxEq(both.current.target_capital, legacy.target_capital, 0.01, "target_capital");
});

// ─── Test 2: grandfathered IP → reform = current (zero drag) ─────────────────
test("grandfathered IP → reform FIRE year = current FIRE year", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2020-03-01",
  });
  const both = buildAndComputeFireBothRegimes({
    snap: FIXTURE_SNAPSHOT, bills: [], rawSettings: FIRE_SETTINGS, rawScenarios: [],
    rawYearAssumptions: [], properties, regimeSelector: "PROPOSED_2027_REFORM",
    annualSalaryIncome: 362100,
  });
  approxEq(both.monthly_surplus_drag, 0, 0.01, "monthly drag should be zero");
  approxEq(both.best_scenario_delta.delta_years, 0, 0, "FIRE year delta should be zero");
});

// ─── Test 3: post-cutoff ESTABLISHED → reform FIRE year >= current ───────────
test("post-cutoff ESTABLISHED IP → reform FIRE year delayed or equal", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2027-09-01",
  });
  const both = buildAndComputeFireBothRegimes({
    snap: FIXTURE_SNAPSHOT, bills: [], rawSettings: FIRE_SETTINGS, rawScenarios: [],
    rawYearAssumptions: [], properties, regimeSelector: "PROPOSED_2027_REFORM",
    annualSalaryIncome: 362100,
  });
  if (both.monthly_surplus_drag <= 0)
    throw new Error(`expected drag > 0, got ${both.monthly_surplus_drag}`);
  if (both.best_scenario_delta.delta_years < 0)
    throw new Error(`reform should not bring FIRE earlier; delta=${both.best_scenario_delta.delta_years}`);
  // Reform terminal NW for the best scenario should be <= current (more tax drag).
  const bestId = both.current.best_scenario;
  const scenDelta = both.scenario_deltas.find(s => s.id === bestId)!;
  if (scenDelta.delta_terminal_nw > 0)
    throw new Error(`best-scenario terminal NW should not exceed current; delta=${scenDelta.delta_terminal_nw}`);
});

// ─── Test 4: NEW_BUILD carve-out → zero drag ─────────────────────────────────
test("NEW_BUILD carve-out → reform FIRE year = current FIRE year", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "NEW_BUILD",
    contract_date: "2027-09-01",
  });
  const both = buildAndComputeFireBothRegimes({
    snap: FIXTURE_SNAPSHOT, bills: [], rawSettings: FIRE_SETTINGS, rawScenarios: [],
    rawYearAssumptions: [], properties, regimeSelector: "PROPOSED_2027_REFORM",
    annualSalaryIncome: 362100,
  });
  approxEq(both.monthly_surplus_drag, 0, 0.01, "NEW_BUILD carve-out should yield zero drag");
});

// ─── Test 5: CURRENT_RULES selector → reform = current ───────────────────────
test("CURRENT_RULES selector → reform FIRE year = current FIRE year", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2027-09-01",
  });
  const both = buildAndComputeFireBothRegimes({
    snap: FIXTURE_SNAPSHOT, bills: [], rawSettings: FIRE_SETTINGS, rawScenarios: [],
    rawYearAssumptions: [], properties, regimeSelector: "CURRENT_RULES",
    annualSalaryIncome: 362100,
  });
  approxEq(both.monthly_surplus_drag, 0, 0.01, "CURRENT_RULES selector should yield zero drag");
});

let passed = 0, failed = 0;
for (const t of TESTS) {
  try { t.assert(); console.log(`  PASS  ${t.name}`); passed++; }
  catch (e: any) { console.error(`  FAIL  ${t.name}\n        ${e.message}`); failed++; }
}
console.log(`\n${passed}/${TESTS.length} tests passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
