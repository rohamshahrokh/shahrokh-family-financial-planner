/**
 * test-property-buy-both-regimes.ts — Property Buy parallel-pathway tests.
 *
 * Run: npx tsx script/test-property-buy-both-regimes.ts
 *
 * Coverage:
 *   1. current branch = legacy computeAllScenarios (byte-for-byte parity)
 *   2. CURRENT_RULES selector → reform == current
 *   3. Grandfathered ESTABLISHED → reform NG benefit preserved
 *   4. Post-cutoff ESTABLISHED under reform → ngBenefit zeroed,
 *      quarantined losses tracked, CGT discount unchanged (50% in default reform).
 *   5. NEW_BUILD post-cutoff → carve-out: regime applies but propertyType override
 *      keeps NG deductible against wages.
 */

import {
  computeAllScenarios,
  type PropertyScenarioInput,
} from "../client/src/lib/propertyBuyEngine";
import {
  computePropertyBuyBothRegimes,
} from "../client/src/lib/propertyBuyEngineRegimeAware";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE: PropertyScenarioInput = {
  label:                          "Buy Now",
  purchase_price:                 850_000,
  deposit_pct:                    20,
  state:                          "QLD" as any,
  loan_rate:                      6.5,
  loan_type:                      "PI",
  io_years:                       0,
  loan_term:                      30,
  weekly_rent:                    720,
  rental_growth_pct:              3,
  capital_growth_pct:             5,
  management_fee_pct:             8,
  council_rates:                  2_400,
  insurance:                      1_800,
  maintenance_pct:                0.5,
  body_corporate:                 0,
  annual_salary:                  185_600,
  has_depreciation:               false,
  build_year:                     1995,
  delay_months:                   0,
  price_growth_during_wait_pct:   0,
  deposit_investment_return_pct:  6.25,
  horizon_years:                  10,
  offset_balance:                 180_000,
  mortgage_rate:                  6.4,
};

const WAIT6: PropertyScenarioInput = {
  ...BASE,
  label:                        "Wait 6 months",
  delay_months:                 6,
  price_growth_during_wait_pct: 2.5,
};

const WAIT12: PropertyScenarioInput = {
  ...BASE,
  label:                        "Wait 12 months",
  delay_months:                 12,
  price_growth_during_wait_pct: 5,
};

// ─── Harness ─────────────────────────────────────────────────────────────────

const TESTS: Array<{ name: string; assert: () => void }> = [];
function test(name: string, fn: () => void) { TESTS.push({ name, assert: fn }); }
function approxEq(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) {
    throw new Error(`${msg}: |${a} - ${b}| = ${Math.abs(a - b)} > tol ${tol}`);
  }
}
function exactEq(a: any, b: any, msg: string) {
  if (a !== b) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

// ─── Test 1: current branch = legacy computeAllScenarios ─────────────────────

test("current branch = legacy computeAllScenarios", () => {
  const legacy = computeAllScenarios(BASE, WAIT6, WAIT12);
  const result = computePropertyBuyBothRegimes({
    buyNow:         BASE,
    wait6m:         WAIT6,
    wait12m:        WAIT12,
    regimeSelector: "AUTO_DETECT",
  });

  exactEq(result.current.buy_now.irr,  legacy.buy_now.irr,  "buy_now.irr");
  exactEq(result.current.wait_6m.irr,  legacy.wait_6m.irr,  "wait_6m.irr");
  exactEq(result.current.wait_12m!.irr, legacy.wait_12m!.irr, "wait_12m.irr");

  exactEq(result.current.buy_now.equity_end,       legacy.buy_now.equity_end,       "buy_now.equity_end");
  exactEq(result.current.buy_now.capital_gain,     legacy.buy_now.capital_gain,     "buy_now.capital_gain");
  exactEq(result.current.buy_now.cgt_discount_gain,legacy.buy_now.cgt_discount_gain,"buy_now.cgt_discount_gain");
  exactEq(result.current.buy_now.yearly.length,    legacy.buy_now.yearly.length,    "buy_now.yearly.length");

  if (result.modellingDisclaimer !== "This is modelling only and not personal tax advice.") {
    throw new Error("Modelling disclaimer missing");
  }
});

// ─── Test 2: CURRENT_RULES selector → reform == current ──────────────────────

test("CURRENT_RULES selector → reform == current (parity)", () => {
  const result = computePropertyBuyBothRegimes({
    buyNow:         BASE,
    wait6m:         WAIT6,
    wait12m:        WAIT12,
    regimeSelector: "CURRENT_RULES",
  });

  // Under CURRENT_RULES selector, every scenario is grandfathered into current rules,
  // so NG benefit is fully retained. Reform branch must match current.
  approxEq(result.scenario_deltas.buy_now.delta_avg_monthly_cf, 0, 0.5, "buy_now Δmonthly_cf");
  approxEq(result.scenario_deltas.wait_6m.delta_avg_monthly_cf, 0, 0.5, "wait_6m Δmonthly_cf");
  approxEq(result.scenario_deltas.wait_12m!.delta_avg_monthly_cf, 0, 0.5, "wait_12m Δmonthly_cf");
  exactEq(result.scenario_deltas.buy_now.quarantined_losses, 0, "buy_now no quarantine");

  // CGT after-tax delta should be ~zero under CURRENT_RULES.
  approxEq(result.scenario_deltas.buy_now.delta_cgt_after_tax, 0, 5, "buy_now Δcgt_after_tax");

  exactEq(result.reformRegimeKind, "CURRENT_RULES", "reformRegimeKind = CURRENT_RULES");
});

// ─── Test 3: Grandfathered ESTABLISHED → reform NG preserved ────────────────

test("Grandfathered ESTABLISHED under AUTO_DETECT → reform NG preserved", () => {
  // ContractDate well before budget-night cutoff (2026-05-12) → grandfathered.
  const result = computePropertyBuyBothRegimes({
    buyNow:         BASE,
    wait6m:         WAIT6,
    metadata: {
      buy_now:  { propertyType: "ESTABLISHED", contractDate: "2024-01-15", purchaseDate: "2024-03-01" },
      wait_6m:  { propertyType: "ESTABLISHED", contractDate: "2024-06-15", purchaseDate: "2024-09-01" },
    },
    regimeSelector: "AUTO_DETECT",
  });

  // Grandfathered properties keep DEDUCT_AGAINST_WAGE → reform_ng = current_ng.
  exactEq(
    result.scenario_deltas.buy_now.current_ng_benefit_total,
    result.scenario_deltas.buy_now.reform_ng_benefit_total,
    "buy_now NG totals match",
  );
  exactEq(result.scenario_deltas.buy_now.quarantined_losses, 0, "buy_now no quarantine");

  // Effective regime is CURRENT_RULES because both grandfathered.
  exactEq(result.scenario_deltas.buy_now.effective_regime_kind, "CURRENT_RULES", "buy_now effective regime");
  exactEq(result.scenario_deltas.wait_6m.effective_regime_kind, "CURRENT_RULES", "wait_6m effective regime");
});

// ─── Test 4: Post-cutoff ESTABLISHED → NG quarantined ───────────────────────

test("Post-cutoff ESTABLISHED → reform NG zeroed + losses quarantined", () => {
  // ContractDate AFTER budget-night cutoff (2026-05-12), propertyType = ESTABLISHED.
  const result = computePropertyBuyBothRegimes({
    buyNow:  BASE,
    wait6m:  WAIT6,
    wait12m: WAIT12,
    metadata: {
      buy_now:  { propertyType: "ESTABLISHED", contractDate: "2027-02-01", purchaseDate: "2027-08-01" },
      wait_6m:  { propertyType: "ESTABLISHED", contractDate: "2027-08-01", purchaseDate: "2028-02-01" },
      wait_12m: { propertyType: "ESTABLISHED", contractDate: "2028-02-01", purchaseDate: "2028-08-01" },
    },
    regimeSelector: "AUTO_DETECT",
  });

  // Reform NG benefit total must be 0 under quarantine treatment.
  exactEq(result.scenario_deltas.buy_now.reform_ng_benefit_total, 0, "buy_now reform NG = 0");
  exactEq(result.scenario_deltas.wait_6m.reform_ng_benefit_total, 0, "wait_6m reform NG = 0");
  exactEq(result.scenario_deltas.wait_12m!.reform_ng_benefit_total, 0, "wait_12m reform NG = 0");

  // Current NG benefit > 0 (legacy retained it).
  if (result.scenario_deltas.buy_now.current_ng_benefit_total <= 0) {
    throw new Error("Expected current NG benefit > 0 for negatively geared scenario");
  }

  // Reform cashflow must be worse (more negative) than current.
  if (result.scenario_deltas.buy_now.delta_avg_monthly_cf >= 0) {
    throw new Error(`Expected reform cashflow drag < 0, got ${result.scenario_deltas.buy_now.delta_avg_monthly_cf}`);
  }

  // Quarantined losses tracked.
  if (result.scenario_deltas.buy_now.quarantined_losses <= 0) {
    throw new Error("Expected quarantined losses > 0");
  }

  // Effective regime is PROPOSED_2027_REFORM.
  exactEq(result.scenario_deltas.buy_now.effective_regime_kind, "PROPOSED_2027_REFORM", "effective regime");

  // Under default reform regime, effective CGT discount for ESTABLISHED is 0% (no discount).
  // So reform taxable gain = (grossGain − quarantinedLosses) × 1.0
  // Current taxable gain  = grossGain × 0.5
  // Verify the formula holds within rounding tolerance.
  const grossGain = result.current.buy_now.capital_gain;
  const losses = result.scenario_deltas.buy_now.quarantined_losses;
  const expectedReformTaxable = Math.max(0, grossGain - losses); // discount = 0% under reform
  approxEq(
    result.scenario_deltas.buy_now.reform_cgt_taxable_gain,
    expectedReformTaxable,
    Math.max(50, expectedReformTaxable * 0.01),
    `buy_now reform CGT taxable = (gross − losses) × (1 − 0%): got ${result.scenario_deltas.buy_now.reform_cgt_taxable_gain}, expected ${expectedReformTaxable}`,
  );
  // Sanity: reform after-tax CGT must differ from current (regimes change CGT rules).
  if (result.scenario_deltas.buy_now.delta_cgt_after_tax === 0) {
    throw new Error("Expected non-zero CGT after-tax delta under reform regime");
  }
});

// ─── Test 5: NEW_BUILD post-cutoff → carve-out, NG preserved ────────────────

test("NEW_BUILD post-cutoff → carve-out keeps NG deductible", () => {
  const result = computePropertyBuyBothRegimes({
    buyNow:  BASE,
    wait6m:  WAIT6,
    metadata: {
      buy_now:  { propertyType: "NEW_BUILD", contractDate: "2027-03-01", purchaseDate: "2027-09-01" },
      wait_6m:  { propertyType: "NEW_BUILD", contractDate: "2027-09-01", purchaseDate: "2028-03-01" },
    },
    regimeSelector: "AUTO_DETECT",
  });

  // NEW_BUILD is carved out → DEDUCT_AGAINST_WAGE preserved → reform_ng == current_ng.
  exactEq(
    result.scenario_deltas.buy_now.current_ng_benefit_total,
    result.scenario_deltas.buy_now.reform_ng_benefit_total,
    "NEW_BUILD buy_now NG totals match (carve-out)",
  );
  exactEq(result.scenario_deltas.buy_now.quarantined_losses, 0, "NEW_BUILD no quarantine");
  // Cashflow delta near zero.
  approxEq(result.scenario_deltas.buy_now.delta_avg_monthly_cf, 0, 0.5, "NEW_BUILD Δmonthly_cf");
});

// ─── Runner ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
for (const t of TESTS) {
  try {
    t.assert();
    console.log(`✓ ${t.name}`);
    pass++;
  } catch (e: any) {
    console.error(`✗ ${t.name}: ${e?.message ?? e}`);
    fail++;
  }
}
console.log(`\n${pass}/${TESTS.length} passed`);
if (fail > 0) process.exit(1);
