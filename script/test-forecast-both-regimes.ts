/**
 * test-forecast-both-regimes.ts — Forecast parallel-pathway tests.
 *
 * Run: npx tsx script/test-forecast-both-regimes.ts
 */

import { buildForecast } from "../client/src/lib/forecastEngine";
import { buildForecastBothRegimes } from "../client/src/lib/forecastEngineRegimeAware";

const FIXTURE_SNAPSHOT = {
  monthly_income:        21940,
  roham_monthly_income:  11140,
  fara_monthly_income:   10800,
  monthly_expenses:      14500,
  super_balance:         420000,
  cash:                  85000,
  offset_balance:        180000,
  stocks:                95000,
  crypto:                42000,
  mortgage:              720000,
  mortgage_rate:         6.4,
};

const ASSUMPTIONS = {
  inflation:      3,
  ppor_growth:    6,
  prop_growth:    6,
  stock_return:   8.5,
  crypto_return:  12,
  income_growth:  3.5,
  expense_growth: 3,
};

function makeProperties(ip: any) {
  return [
    { is_ppor: true, weekly_rent: 0, loan_balance: 720000, interest_rate: 6.4, council_rates: 2400, insurance: 1800, maintenance: 2500, property_type: "PPOR" },
    ip,
  ];
}

const TESTS: Array<{ name: string; assert: () => void }> = [];
function test(n: string, fn: () => void) { TESTS.push({ name: n, assert: fn }); }
function eq(a: any, b: any, m: string) { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`); }
function approxEq(a: number, b: number, tol: number, m: string) { if (Math.abs(a - b) > tol) throw new Error(`${m}: |${a}-${b}|=${Math.abs(a - b)} > ${tol}`); }

// ─── Test 1: current branch = legacy buildForecast byte-for-byte (caller-supplied NG) ─────────
test("current branch = legacy buildForecast when ngAnnualBenefit explicit", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2020-03-01",
  });
  const input: any = {
    snapshot: FIXTURE_SNAPSHOT, properties, stocks: [], cryptos: [],
    stockTransactions: [], cryptoTransactions: [], bills: [], expenses: [],
    assumptions: ASSUMPTIONS, annualSalaryIncome: 362100, ngAnnualBenefit: 5000,
  };
  const legacy = buildForecast(input);
  const both = buildForecastBothRegimes({ input, regimeSelector: "AUTO_DETECT" });
  const lNw = (legacy.netWorth[legacy.netWorth.length - 1] as any)?.endNetWorth ?? 0;
  const cNw = (both.current.netWorth[both.current.netWorth.length - 1] as any)?.endNetWorth ?? 0;
  approxEq(cNw, lNw, 0.01, "current final NW must equal legacy when ngAnnualBenefit explicit");
});

// ─── Test 2: Grandfathered IP → reform NW = current NW ───────────────────────
test("grandfathered IP → reform NW equals current NW", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2020-03-01", // pre-cutoff → grandfathered
  });
  const input = {
    snapshot: FIXTURE_SNAPSHOT, properties, stocks: [], cryptos: [],
    stockTransactions: [], cryptoTransactions: [], bills: [], expenses: [],
    assumptions: ASSUMPTIONS, annualSalaryIncome: 362100,
  };
  const both = buildForecastBothRegimes({ input, regimeSelector: "PROPOSED_2027_REFORM" });
  approxEq(both.currentNgAnnualBenefit, both.reformNgAnnualBenefit, 0.01,
    "grandfathered IP should yield identical NG benefit");
  approxEq(both.deltas.nw_final.delta_end, 0, 1.0,
    "grandfathered IP should yield zero NW delta");
});

// ─── Test 3: Post-reform ESTABLISHED IP → reform NG = 0 ──────────────────────
test("post-cutoff ESTABLISHED IP → reform NG benefit = 0", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2027-09-01", // post-cutoff
  });
  const input = {
    snapshot: FIXTURE_SNAPSHOT, properties, stocks: [], cryptos: [],
    stockTransactions: [], cryptoTransactions: [], bills: [], expenses: [],
    assumptions: ASSUMPTIONS, annualSalaryIncome: 362100,
  };
  const both = buildForecastBothRegimes({ input, regimeSelector: "PROPOSED_2027_REFORM" });
  if (both.currentNgAnnualBenefit <= 0) throw new Error("test setup: expected current NG > 0");
  eq(both.reformNgAnnualBenefit, 0, "reform NG benefit must be 0 under quarantine");
  // Reform NW final must be lower than (or equal to) current NW final.
  if (both.deltas.nw_final.delta_end > 0)
    throw new Error(`reform NW should not exceed current NW; got delta=${both.deltas.nw_final.delta_end}`);
});

// ─── Test 4: NEW_BUILD carve-out preserves NG ────────────────────────────────
test("NEW_BUILD carve-out preserves NG benefit under reform", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "NEW_BUILD",
    contract_date: "2027-09-01",
  });
  const input = {
    snapshot: FIXTURE_SNAPSHOT, properties, stocks: [], cryptos: [],
    stockTransactions: [], cryptoTransactions: [], bills: [], expenses: [],
    assumptions: ASSUMPTIONS, annualSalaryIncome: 362100,
  };
  const both = buildForecastBothRegimes({ input, regimeSelector: "PROPOSED_2027_REFORM" });
  approxEq(both.reformNgAnnualBenefit, both.currentNgAnnualBenefit, 0.01,
    "NEW_BUILD carve-out should preserve NG benefit");
});

// ─── Test 5: CURRENT_RULES selector → reform = current ───────────────────────
test("CURRENT_RULES selector → reform NW = current NW", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_amount: 480000, loan_balance: 480000,
    interest_rate: 6.6, management_fee: 8, council_rates: 1800, insurance: 1200,
    maintenance: 1500, body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2027-09-01",
  });
  const input = {
    snapshot: FIXTURE_SNAPSHOT, properties, stocks: [], cryptos: [],
    stockTransactions: [], cryptoTransactions: [], bills: [], expenses: [],
    assumptions: ASSUMPTIONS, annualSalaryIncome: 362100,
  };
  const both = buildForecastBothRegimes({ input, regimeSelector: "CURRENT_RULES" });
  approxEq(both.deltas.nw_final.delta_end, 0, 1.0,
    "CURRENT_RULES selector should yield zero NW delta");
});

let passed = 0, failed = 0;
for (const t of TESTS) {
  try { t.assert(); console.log(`  PASS  ${t.name}`); passed++; }
  catch (e: any) { console.error(`  FAIL  ${t.name}\n        ${e.message}`); failed++; }
}
console.log(`\n${passed}/${TESTS.length} tests passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
