/**
 * test-tax-rules-engine.ts — Centralized Tax Rules Engine tests
 *
 * Covers FWL_TAX_REFORM_MODELLING_ENGINE validation cases:
 *   1. Property purchased before 12 May 2026 7:30pm AEST → grandfathered + NG eligible under reform.
 *   2. New build after reform → NG still allowed (carve-out).
 *   3. Established property after reform → NG NOT eligible; PAYG refund not applied; loss bank accumulates.
 *   4. Loss bank accumulation 15k + 12k + 8k = 35k; future profit consumes; sale CGT consumes residual.
 *   5. Current law CGT 50% discount.
 *   6. Reform CGT indexed cost base + grandfathering keeps current-law CGT.
 *   7. Changing Tax & Policy Scenario changes at least one projection output.
 *
 * Run: npx tsx script/test-tax-rules-engine.ts
 */

import {
  classifyPropertyTaxRegime,
  calculateAnnualPropertyTaxImpact,
  calculateLossBank,
  calculateCGT,
  compareTaxImpactVsCurrentLaw,
  isAcquiredBeforeReformCutoff,
  regimeForScenario,
  BUDGET_NIGHT_CUTOFF_DEFAULT,
  type PropertyTaxInput,
} from "../client/src/lib/tax/taxRulesEngine";

const TESTS: Array<{ name: string; assert: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { TESTS.push({ name, assert: fn }); }

function eq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function truthy(v: unknown, msg: string): void {
  if (!v) throw new Error(`${msg}: expected truthy, got ${JSON.stringify(v)}`);
}
function falsy(v: unknown, msg: string): void {
  if (v) throw new Error(`${msg}: expected falsy, got ${JSON.stringify(v)}`);
}
function approx(a: number, b: number, eps: number, msg: string): void {
  if (Math.abs(a - b) > eps) {
    throw new Error(`${msg}: expected ${b} ±${eps}, got ${a}`);
  }
}

const baseProperty: PropertyTaxInput = {
  propertyId: "P1",
  contractDate: "2027-08-01",
  settlementDate: "2027-09-01",
  propertyType: "ESTABLISHED",
  annualRent: 28_000,
  annualHoldingCosts: 7_000,
  annualInterest: 35_000,
  annualDepreciation: 6_000,
  annualWageIncome: 180_000,
  hasPrivateHospitalCover: true,
};

// ─── 1. Grandfathering by AEST cutoff ────────────────────────────────────────

test("Property acquired before 12 May 2026 7:30pm AEST is grandfathered under reform", () => {
  const inp: PropertyTaxInput = {
    ...baseProperty,
    contractDate: "2026-05-12T19:29:00+10:00",
  };
  const cls = classifyPropertyTaxRegime(inp, "proposed_reform");
  truthy(cls.status.isGrandfathered, "grandfathered");
  truthy(cls.negativeGearingEligible, "NG eligible under reform via grandfathering");
  eq(cls.cgtMethod, "CURRENT_50_PERCENT_DISCOUNT", "CGT keeps current discount");
});

test("Property acquired AFTER cutoff timestamp is NOT grandfathered", () => {
  const inp: PropertyTaxInput = {
    ...baseProperty,
    contractDate: "2026-05-12T19:31:00+10:00",
  };
  const cls = classifyPropertyTaxRegime(inp, "proposed_reform");
  falsy(cls.status.isGrandfathered, "not grandfathered (1 minute after cutoff)");
  falsy(cls.negativeGearingEligible, "NG quarantined post-cutoff");
});

test("isAcquiredBeforeReformCutoff handles date-only + ISO timestamp", () => {
  truthy(isAcquiredBeforeReformCutoff("2024-01-01"), "old date");
  truthy(isAcquiredBeforeReformCutoff(BUDGET_NIGHT_CUTOFF_DEFAULT), "cutoff date-only counts as before");
  truthy(isAcquiredBeforeReformCutoff("2026-05-12T19:30:00+10:00"), "exact cutoff timestamp counts as before");
  falsy(isAcquiredBeforeReformCutoff("2026-05-12T19:30:01+10:00"), "one sec after cutoff");
  falsy(isAcquiredBeforeReformCutoff(undefined), "missing date");
});

// ─── 2. New build carve-out ──────────────────────────────────────────────────

test("New build acquired post-reform keeps negative gearing", () => {
  const inp: PropertyTaxInput = {
    ...baseProperty,
    contractDate: "2028-03-01",
    propertyType: "NEW_BUILD",
  };
  const cls = classifyPropertyTaxRegime(inp, "proposed_reform");
  falsy(cls.status.isGrandfathered, "post-cutoff");
  truthy(cls.status.isPostReformCarveOut, "carve-out flag set");
  truthy(cls.negativeGearingEligible, "NG still allowed for new build");
  eq(cls.cgtMethod, "CURRENT_50_PERCENT_DISCOUNT", "CGT current-rules discount preserved");
});

// ─── 3. Established post-reform: quarantine + no PAYG refund ─────────────────

test("Established post-reform: PAYG refund = 0; loss bank accumulates", () => {
  const inp: PropertyTaxInput = { ...baseProperty, contractDate: "2028-01-15" };
  const impact = calculateAnnualPropertyTaxImpact(inp, "proposed_reform");
  eq(impact.paygRefundThisYear, 0, "no PAYG refund");
  truthy(impact.lossAccumulatedThisYear > 0, "loss accrued to bank");
  // The same property under current law DOES get a refund.
  const cl = calculateAnnualPropertyTaxImpact(inp, "current_law");
  truthy(cl.paygRefundThisYear > 0, "current law refund > 0");
  eq(cl.lossAccumulatedThisYear, 0, "no loss bank under current law");
});

// ─── 4. Loss bank arithmetic ─────────────────────────────────────────────────

test("Loss bank accumulates 15k + 12k + 8k = 35k under reform", () => {
  let bank = 0;
  const r1 = calculateLossBank({ previousBank: bank, taxableRentalProfit: -15_000, scenario: "proposed_reform" });
  bank = r1.newBank;
  const r2 = calculateLossBank({ previousBank: bank, taxableRentalProfit: -12_000, scenario: "proposed_reform" });
  bank = r2.newBank;
  const r3 = calculateLossBank({ previousBank: bank, taxableRentalProfit: -8_000, scenario: "proposed_reform" });
  bank = r3.newBank;
  eq(bank, 35_000, "loss bank total");
  // Future positive profit consumes the bank first.
  const r4 = calculateLossBank({ previousBank: bank, taxableRentalProfit: 10_000, scenario: "proposed_reform" });
  eq(r4.lossApplied, 10_000, "applied 10k");
  eq(r4.newBank, 25_000, "bank reduced by 10k");
});

test("CGT consumes residual loss bank against post-indexation gain", () => {
  const sale = calculateCGT({
    property: {
      ...baseProperty,
      contractDate: "2028-01-15",
      salePrice: 950_000,
      costBase:  700_000,
      yearsHeld: 6,
      quarantinedLossBank: 25_000,
    },
    lossBankAtSale: 25_000,
  }, "proposed_reform");
  // Indexed cost base ~ 700_000 * 1.025^6 ≈ 812_103; effectiveGain ≈ 137_897.
  truthy(sale.effectiveGain > 130_000 && sale.effectiveGain < 145_000, "indexed gain in range");
  eq(sale.carryForwardApplied, 25_000, "full bank consumed against gain");
  truthy(sale.taxableGain < sale.effectiveGain, "taxable gain reduced by bank");
  eq(sale.method, "INDEXED_COST_BASE", "reform uses indexed cost base");
});

// ─── 5. CGT current law 50% discount ─────────────────────────────────────────

test("Current law CGT applies 50% discount when held > 12 months", () => {
  const sale = calculateCGT({
    property: {
      ...baseProperty,
      contractDate: "2025-01-01",
      salePrice: 950_000,
      costBase: 700_000,
      yearsHeld: 6,
    },
  }, "current_law");
  eq(sale.method, "CURRENT_50_PERCENT_DISCOUNT", "method");
  approx(sale.effectiveGain, 125_000, 1, "raw gain 250k × 50% discount");
  eq(sale.discountPct, 0.50, "discount pct");
});

// ─── 6. Reform CGT indexed cost base + grandfathered keeps 50% ──────────────

test("Reform CGT on non-grandfathered property uses indexed cost base", () => {
  const sale = calculateCGT({
    property: {
      ...baseProperty,
      contractDate: "2028-01-15",
      salePrice: 950_000,
      costBase: 700_000,
      yearsHeld: 6,
    },
  }, "proposed_reform");
  eq(sale.method, "INDEXED_COST_BASE", "method");
  truthy((sale.indexedCostBase ?? 0) > 700_000, "indexed cost base > raw");
});

test("Grandfathered property keeps current-law CGT even under reform scenario", () => {
  const sale = calculateCGT({
    property: {
      ...baseProperty,
      contractDate: "2024-06-01",
      salePrice: 950_000,
      costBase: 700_000,
      yearsHeld: 6,
    },
  }, "proposed_reform");
  eq(sale.method, "CURRENT_50_PERCENT_DISCOUNT", "grandfathered keeps current-law CGT");
});

// ─── 7. Scenario change moves projection-relevant outputs ───────────────────

test("Switching scenario changes annual cashflow / refund / loss bank outputs", () => {
  const inp: PropertyTaxInput = { ...baseProperty, contractDate: "2028-01-15" };
  const cmp = compareTaxImpactVsCurrentLaw(inp);
  truthy(cmp.currentLaw.paygRefundThisYear > 0, "current law has refund");
  eq(cmp.proposedReform.paygRefundThisYear, 0, "reform has no refund");
  truthy(cmp.cashflowDelta < 0, "reform after-tax cashflow is worse");
  truthy(cmp.lossBankDelta > 0, "reform accrues loss bank delta");
});

test("regimeForScenario returns the correct regime kind", () => {
  eq(regimeForScenario("current_law").kind, "CURRENT_RULES", "current law");
  eq(regimeForScenario("proposed_reform").kind, "PROPOSED_2027_REFORM", "reform");
  eq(regimeForScenario("custom").kind, "CUSTOM_STRESS_TEST", "custom default");
});

// ─── 8. Global header selector removed; tax page chip present ────────────────

test("Layout.tsx no longer renders TaxRegimeHeaderStrip in the global navbar", async () => {
  const { readFile } = await import("node:fs/promises");
  const layout = await readFile("client/src/components/Layout.tsx", "utf8");
  truthy(
    !layout.includes("<TaxRegimeHeaderStrip"),
    "no <TaxRegimeHeaderStrip in Layout.tsx",
  );
});

test("Tax page surfaces ModellingAssumptionsChip", async () => {
  const { readFile } = await import("node:fs/promises");
  const tax = await readFile("client/src/pages/tax.tsx", "utf8");
  truthy(tax.includes("ModellingAssumptionsChip"), "tax.tsx imports/uses chip");
});

test("Property page surfaces ModellingAssumptionsChip", async () => {
  const { readFile } = await import("node:fs/promises");
  const prop = await readFile("client/src/pages/property.tsx", "utf8");
  truthy(prop.includes("ModellingAssumptionsChip"), "property.tsx imports/uses chip");
});

// ─── Run ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
for (const t of TESTS) {
  try {
    const res = t.assert();
    if (res && typeof (res as any).then === "function") {
      await (res as any);
    }
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${t.name}\n    ${(err as Error).message}`);
    failed++;
  }
}
console.log(`\n${passed}/${TESTS.length} tax-rules-engine tests passed.`);
if (failed > 0) process.exit(1);
