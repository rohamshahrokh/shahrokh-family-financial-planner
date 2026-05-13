/**
 * test-tax-alpha-both-regimes.ts
 *
 * Verifies the parallel-pathway Tax Alpha overlay:
 *   1. `current` branch is byte-for-byte equal to legacy computeTaxAlpha.
 *   2. Grandfathered properties preserve NG saving exactly.
 *   3. Post-reform-established properties have NG saving = 0 (quarantined)
 *      under the reform regime.
 *   4. Carve-out properties (NEW_BUILD) preserve NG saving exactly.
 *   5. AUTO_DETECT flags missing metadata for confirmation.
 *
 * Run: npx tsx script/test-tax-alpha-both-regimes.ts
 * Exits 0 on all pass, 1 on any failure.
 */

import {
  buildTaxAlphaInputBothRegimes,
  computeTaxAlphaBothRegimes,
} from "../client/src/lib/taxAlphaEngineRegimeAware";
import { computeTaxAlpha } from "../client/src/lib/taxAlphaEngine";

const FIXTURE_SNAPSHOT = {
  monthly_income:        21940,
  roham_monthly_income:  11140,
  fara_monthly_income:   10800,
  monthly_expenses:      14500,
  super_balance:         420000,
  roham_super_balance:   245000,
  fara_super_balance:    175000,
  roham_employer_contrib: 12,
  fara_employer_contrib:  12,
  cash:                  85000,
  offset_balance:        180000,
  stocks:                95000,
  crypto:                42000,
  mortgage:              720000,
  mortgage_rate:         6.4,
  other_debts:           12000,
  roham_has_private_health: true,
  fara_has_private_health:  true,
  roham_has_help_debt:      false,
  fara_has_help_debt:       false,
  unrealised_gains:         28000,
};

const FIXTURE_TAX_PROFILE = {
  override_active:           true,
  roham_salary:              185600,
  fara_salary:               176500,
  roham_super_rate:          12,
  fara_super_rate:           12,
  roham_has_private_health:  true,
  fara_has_private_health:   true,
  roham_has_help_debt:       false,
  fara_has_help_debt:        false,
};

const HOUSEHOLD = {
  rohamAnnual:    FIXTURE_TAX_PROFILE.roham_salary,
  faraAnnual:     FIXTURE_TAX_PROFILE.fara_salary,
  overrideActive: true,
};

// Property fixtures: PPOR + one investment we'll vary across tests.
function makeProperties(ip: any) {
  return [
    { is_ppor: true, weekly_rent: 0, loan_balance: 720000, interest_rate: 6.4, management_fee: 0, council_rates: 2400, insurance: 1800, maintenance: 2500, body_corporate: 0, property_type: "PPOR" },
    ip,
  ];
}

const TESTS: Array<{ name: string; assert: () => void }> = [];
function test(name: string, fn: () => void) { TESTS.push({ name, assert: fn }); }

function eq(a: any, b: any, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`);
}
function approxEq(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: |${a} - ${b}| = ${Math.abs(a - b)} > ${tol}`);
}

// ─── Test 1: `current` equals legacy computeTaxAlpha ─────────────────────────
test("current branch = legacy computeTaxAlpha byte-for-byte", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_balance: 480000, interest_rate: 6.6,
    management_fee: 8, council_rates: 1800, insurance: 1200, maintenance: 1500,
    body_corporate: 2400, property_type: "ESTABLISHED", contract_date: "2020-03-01",
  });
  const { input, propertyMetadata } = buildTaxAlphaInputBothRegimes({
    snap: FIXTURE_SNAPSHOT, properties, taxProfile: FIXTURE_TAX_PROFILE, household: HOUSEHOLD,
  });
  const legacy = computeTaxAlpha(input);
  const both = computeTaxAlphaBothRegimes({ input, propertyMetadata, regimeSelector: "AUTO_DETECT" });
  // Numeric tax fields must be identical.
  eq(both.current.household_tax_now, legacy.household_tax_now, "household_tax_now");
  eq(both.current.roham_tax_now.totalDeductions, legacy.roham_tax_now.totalDeductions, "roham totalDeductions");
  eq(both.current.fara_tax_now.totalDeductions, legacy.fara_tax_now.totalDeductions, "fara totalDeductions");
  // Strategy ids set must match.
  const legacyIds = legacy.strategies.map(s => s.id).sort();
  const currentIds = both.current.strategies.map(s => s.id).sort();
  eq(JSON.stringify(legacyIds), JSON.stringify(currentIds), "strategy ids");
});

// ─── Test 2: Grandfathered property preserves NG ─────────────────────────────
test("grandfathered IP (pre-cutoff) preserves NG saving under reform", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_balance: 480000, interest_rate: 6.6,
    management_fee: 8, council_rates: 1800, insurance: 1200, maintenance: 1500,
    body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2020-03-01", // before 2026-05-12 cutoff
  });
  const { input, propertyMetadata } = buildTaxAlphaInputBothRegimes({
    snap: FIXTURE_SNAPSHOT, properties, taxProfile: FIXTURE_TAX_PROFILE, household: HOUSEHOLD,
  });
  const both = computeTaxAlphaBothRegimes({
    input, propertyMetadata, regimeSelector: "PROPOSED_2027_REFORM",
  });
  const currentNG = both.current.strategies.find(s => s.id === "negative_gearing")!;
  const reformNG  = both.reform.strategies.find(s => s.id === "negative_gearing")!;
  approxEq(reformNG.annual_saving, currentNG.annual_saving, 0.5,
    "grandfathered NG saving should be unchanged under reform");
  const delta = both.deltas.find(d => d.id === "negative_gearing")!;
  eq(delta.direction, "preserved", "delta direction");
});

// ─── Test 3: Post-reform ESTABLISHED → NG quarantined (saving = 0) ───────────
test("post-cutoff ESTABLISHED IP → NG quarantined under reform (saving = 0)", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_balance: 480000, interest_rate: 6.6,
    management_fee: 8, council_rates: 1800, insurance: 1200, maintenance: 1500,
    body_corporate: 2400, property_type: "ESTABLISHED",
    contract_date: "2027-09-01", // after cutoff AND after reform start
  });
  const { input, propertyMetadata } = buildTaxAlphaInputBothRegimes({
    snap: FIXTURE_SNAPSHOT, properties, taxProfile: FIXTURE_TAX_PROFILE, household: HOUSEHOLD,
  });
  const both = computeTaxAlphaBothRegimes({
    input, propertyMetadata, regimeSelector: "PROPOSED_2027_REFORM",
  });
  const currentNG = both.current.strategies.find(s => s.id === "negative_gearing")!;
  const reformNG  = both.reform.strategies.find(s => s.id === "negative_gearing")!;
  if (currentNG.annual_saving <= 0) throw new Error("test setup: expected current NG > 0");
  eq(reformNG.annual_saving, 0, "reform NG saving should be 0 (quarantined)");
  const delta = both.deltas.find(d => d.id === "negative_gearing")!;
  eq(delta.direction, "eliminated", "delta direction");
});

// ─── Test 4: NEW_BUILD post-cutoff preserves NG (carve-out) ──────────────────
test("post-cutoff NEW_BUILD IP preserves NG under reform (carve-out)", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_balance: 480000, interest_rate: 6.6,
    management_fee: 8, council_rates: 1800, insurance: 1200, maintenance: 1500,
    body_corporate: 2400, property_type: "NEW_BUILD",
    contract_date: "2027-09-01",
  });
  const { input, propertyMetadata } = buildTaxAlphaInputBothRegimes({
    snap: FIXTURE_SNAPSHOT, properties, taxProfile: FIXTURE_TAX_PROFILE, household: HOUSEHOLD,
  });
  const both = computeTaxAlphaBothRegimes({
    input, propertyMetadata, regimeSelector: "PROPOSED_2027_REFORM",
  });
  const currentNG = both.current.strategies.find(s => s.id === "negative_gearing")!;
  const reformNG  = both.reform.strategies.find(s => s.id === "negative_gearing")!;
  approxEq(reformNG.annual_saving, currentNG.annual_saving, 0.5,
    "NEW_BUILD carve-out should preserve NG");
});

// ─── Test 5: AUTO_DETECT flags missing metadata ──────────────────────────────
test("AUTO_DETECT flags requiresUserConfirmation when metadata missing", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_balance: 480000, interest_rate: 6.6,
    management_fee: 8, council_rates: 1800, insurance: 1200, maintenance: 1500,
    body_corporate: 2400,
    // No property_type, no contract_date
  });
  const { input, propertyMetadata } = buildTaxAlphaInputBothRegimes({
    snap: FIXTURE_SNAPSHOT, properties, taxProfile: FIXTURE_TAX_PROFILE, household: HOUSEHOLD,
  });
  const both = computeTaxAlphaBothRegimes({
    input, propertyMetadata, regimeSelector: "AUTO_DETECT",
  });
  eq(both.autoDetectNeedsConfirmation, true, "should flag for confirmation");
});

// ─── Test 6: CURRENT_RULES selector — reform branch equals current ───────────
test("CURRENT_RULES selector → reform branch equals current branch", () => {
  const properties = makeProperties({
    is_ppor: false, weekly_rent: 600, loan_balance: 480000, interest_rate: 6.6,
    management_fee: 8, council_rates: 1800, insurance: 1200, maintenance: 1500,
    body_corporate: 2400, property_type: "ESTABLISHED", contract_date: "2027-09-01",
  });
  const { input, propertyMetadata } = buildTaxAlphaInputBothRegimes({
    snap: FIXTURE_SNAPSHOT, properties, taxProfile: FIXTURE_TAX_PROFILE, household: HOUSEHOLD,
  });
  const both = computeTaxAlphaBothRegimes({
    input, propertyMetadata, regimeSelector: "CURRENT_RULES",
  });
  approxEq(both.reform.household_tax_now, both.current.household_tax_now, 0.5,
    "household tax should match");
  // Even post-cutoff established property keeps NG on CURRENT_RULES selector.
  const currentNG = both.current.strategies.find(s => s.id === "negative_gearing")!;
  const reformNG  = both.reform.strategies.find(s => s.id === "negative_gearing")!;
  approxEq(reformNG.annual_saving, currentNG.annual_saving, 0.5,
    "CURRENT_RULES selector should preserve NG regardless of contract date");
});

// ─── Runner ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
for (const t of TESTS) {
  try {
    t.assert();
    console.log(`  PASS  ${t.name}`);
    passed += 1;
  } catch (err: any) {
    console.error(`  FAIL  ${t.name}\n        ${err.message}`);
    failed += 1;
  }
}
console.log(`\n${passed}/${TESTS.length} tests passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
