/**
 * test-sprint4b-property-lifecycle-integrity.ts
 *
 * Sprint 4B regression suite covering Property Lifecycle / IRR / NG / CGT
 * integrity. The four canonical claims this script proves:
 *
 *   1. Lifecycle reconciliation
 *      - Property exists before purchase date  → FALSE  (planned/under-contract)
 *      - Property exists during ownership      → TRUE   (settled, purchase ≤ today)
 *      - Property exists after sale date       → FALSE  (sold)
 *      - The canonical predicates honour status precedence over dates.
 *
 *   2. Property IRR uses after-tax proceeds
 *      - Deposit + stamp duty + other upfront at t0
 *      - Annual after-tax cash (rent − repayment − holding + NG, single-count)
 *      - Terminal proceeds AFTER selling costs, debt repayment, CGT
 *      - IRR matches a hand-rolled NPV-zero check.
 *
 *   3. NG is applied exactly once (not double-counted) when computing the
 *      after-tax IRR.
 *
 *   4. CGT is applied only at the sale event, reduces final sale proceeds,
 *      and respects the discount rule.
 *
 * Run with:  tsx script/test-sprint4b-property-lifecycle-integrity.ts
 */

import {
  isPropertyOwnedAt,
  wasPropertyAcquiredBy,
  wasPropertySoldBy,
  resolveSaleDate,
  resolveAcquisitionDate,
  isInvestmentProperty,
  isPropertyHistorical,
} from "../shared/propertyLifecycle";

import {
  buildPropertyAfterTaxCashflows,
  computePropertyIRR,
  computeCanonicalPropertyEconomics,
  type PropertyEconomicsInputs,
} from "../client/src/lib/canonicalPropertyEconomics";

let passed = 0;
let failed = 0;
function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}` + (detail !== undefined ? `\n        detail: ${JSON.stringify(detail)}` : ""));
  }
}
function near(actual: number, expected: number, tol = 1e-3): boolean {
  return Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
}

const TODAY = "2026-05-24";

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 1 — Lifecycle reconciliation predicates
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n=== Sprint 4B §1 — Lifecycle reconciliation ===");

// 1.1 Planned property before purchase date
{
  const planned = {
    id: "p-future",
    name: "Brisbane future IP",
    type: "investment",
    lifecycle_status: "planned",
    settlement_date: "2027-08-01",
    purchase_date: "2027-08-01",
  };
  ok("Planned IP: not owned today", !isPropertyOwnedAt(planned, TODAY));
  ok("Planned IP: not acquired by today", !wasPropertyAcquiredBy(planned, TODAY));
  ok("Planned IP: not yet sold", !wasPropertySoldBy(planned, TODAY));
  ok("Planned IP: lifecycle status 'planned' wins over date", !isPropertyOwnedAt({ ...planned, settlement_date: "2020-01-01" }, TODAY));
}

// 1.2 Under-contract property
{
  const uc = {
    id: "p-uc",
    name: "Gold Coast Contract",
    type: "investment",
    lifecycle_status: "under_contract",
    settlement_date: "2026-11-30",
  };
  ok("Under-contract: not owned today", !isPropertyOwnedAt(uc, TODAY));
}

// 1.3 Settled property during ownership
{
  const owned = {
    id: "p-active",
    name: "Sunshine Coast IP",
    type: "investment",
    lifecycle_status: "settled",
    settlement_date: "2024-03-10",
    purchase_date: "2024-03-10",
  };
  ok("Settled IP: owned today", isPropertyOwnedAt(owned, TODAY));
  ok("Settled IP: acquired by today", wasPropertyAcquiredBy(owned, TODAY));
  ok("Settled IP: not sold", !wasPropertySoldBy(owned, TODAY));
}

// 1.4 Sold property — must vanish from ownership AFTER sale date and remain TRUE before
{
  const sold = {
    id: "p-sold",
    name: "Northside Townhouse",
    type: "investment",
    lifecycle_status: "sold",
    purchase_date: "2018-06-01",
    sale_date: "2025-09-15",
  };
  ok("Sold IP: not owned today (after sale_date)", !isPropertyOwnedAt(sold, TODAY));
  ok("Sold IP: not owned on sale_date itself", !isPropertyOwnedAt(sold, "2025-09-15"));
  ok("Sold IP: was owned the day before sale_date", isPropertyOwnedAt(sold, "2025-09-14"));
  ok("Sold IP: was acquired by 2026", wasPropertyAcquiredBy(sold, TODAY));
  ok("Sold IP: sold by today", wasPropertySoldBy(sold, TODAY));
  ok("Sold IP: not yet sold on 2024-01-01", !wasPropertySoldBy(sold, "2024-01-01"));
}

// 1.5 Sold property with disposal_date alias
{
  const sold = {
    id: "p-sold-alias",
    lifecycle_status: "sold",
    disposal_date: "2025-12-31",
    type: "investment",
  };
  ok("Sold IP via disposal_date alias: resolveSaleDate returns it", resolveSaleDate(sold) === "2025-12-31");
  ok("Sold IP via disposal_date alias: not owned today", !isPropertyOwnedAt(sold, TODAY));
}

// 1.6 Archived property — excluded regardless of dates
{
  const arch = {
    id: "p-arch",
    type: "investment",
    lifecycle_status: "archived",
    settlement_date: "2020-01-01",
  };
  ok("Archived IP: never owned", !isPropertyOwnedAt(arch, TODAY));
  ok("Archived IP: isPropertyHistorical=true", isPropertyHistorical(arch));
}

// 1.7 PPOR is not an investment property
{
  ok("PPOR is not investment", !isInvestmentProperty({ type: "ppor" }));
  ok("Owner-occupied is not investment", !isInvestmentProperty({ type: "owner_occupied" }));
  ok("Default 'investment' is investment", isInvestmentProperty({ type: "investment" }));
}

// 1.8 Legacy row with no status — date-driven fallback
{
  const legacy = { id: "p-legacy", type: "investment", purchase_date: "2020-01-01" };
  ok("Legacy IP (no status, past date): owned today", isPropertyOwnedAt(legacy as any, TODAY));
  const legacyFuture = { id: "p-legacy2", type: "investment", purchase_date: "2030-01-01" };
  ok("Legacy IP (no status, future date): NOT owned today", !isPropertyOwnedAt(legacyFuture as any, TODAY));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 2 — Property IRR uses after-tax proceeds
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n=== Sprint 4B §2 — IRR uses after-tax cashflows ===");

// A simple deterministic property fixture we can reason about by hand.
// 5-year hold, no growth in rent/value, no negative gearing, no CGT.
function buildFixture(overrides: Partial<PropertyEconomicsInputs> = {}): PropertyEconomicsInputs {
  const base: PropertyEconomicsInputs = {
    purchase_price:     500_000,
    deposit:            100_000,   // 20% deposit
    stamp_duty:         20_000,
    other_upfront:       5_000,
    annual_rent:        [25_000, 25_000, 25_000, 25_000, 25_000],
    annual_interest:    [20_000, 20_000, 20_000, 20_000, 20_000],
    annual_repayment:   [25_000, 25_000, 25_000, 25_000, 25_000],
    annual_holding:     [ 5_000,  5_000,  5_000,  5_000,  5_000],
    annual_depreciation:[     0,      0,      0,      0,      0],
    property_value_end: [500_000, 500_000, 500_000, 500_000, 500_000],
    loan_balance_end:   [400_000, 400_000, 400_000, 400_000, 400_000],
    marginal_rate:      0.37,
    ng_treatment:       'deduct_against_wage',
    cgt_discount_pct:   0.5,
    selling_costs_pct:  0.02,
    apply_cgt_on_sale:  true,
  };
  return { ...base, ...overrides };
}

// 2.1 IRR includes the initial outflow (deposit + stamp + other_upfront).
{
  const r = computeCanonicalPropertyEconomics(buildFixture());
  ok("Cashflows start with negative upfront", r.cashflows[0] === -(100_000 + 20_000 + 5_000));
  ok("Upfront vector = deposit + stamp + other", r.total_upfront === 125_000);
}

// 2.2 Annual cash = rent - repayment - holding + ngBenefit (SINGLE-COUNT NG).
//     With taxable_loss = rent - interest - holding - deprec = 25k - 20k - 5k = 0 → no NG.
{
  const r = computeCanonicalPropertyEconomics(buildFixture());
  // No NG → all ngBenefit == 0
  ok("No NG when taxable_loss == 0", r.yearly.every(y => y.ng_benefit === 0));
  // Annual cash = 25 - 25 - 5 = -5k (rent - repayment - holding)
  ok("Annual net cash = rent - repayment - holding when no NG", r.yearly.every(y => y.net_cash_after_tax === -5_000));
}

// 2.3 NG applied EXACTLY ONCE when loss > 0 (taxable_loss negative).
//     Use a fixture where deductible > rent so loss is created.
{
  const ngFix = buildFixture({
    annual_rent:     [15_000, 15_000, 15_000, 15_000, 15_000], // less rent
    annual_holding:  [ 6_000,  6_000,  6_000,  6_000,  6_000], // higher holding
    // taxable_loss = 15k - 20k - 6k - 0 = -11k → NG = 11k × 0.37 = 4,070
  });
  const r = computeCanonicalPropertyEconomics(ngFix);
  ok("NG benefit equals lossMag × marginal_rate", r.yearly[0].ng_benefit === Math.round(11_000 * 0.37) || near(r.yearly[0].ng_benefit, 11_000 * 0.37, 1e-3));
  // SINGLE-COUNT VALIDATION: net_cash_after_tax = rent - repayment - holding + ng_benefit
  // = 15 - 25 - 6 + 4.07 = -11.93k.  If NG were double-counted it would be ≈ -7.86k.
  const expectedCash = 15_000 - 25_000 - 6_000 + 11_000 * 0.37;
  ok("Net cash counts NG once (not twice)", near(r.yearly[0].net_cash_after_tax, expectedCash, 1e-3),
     { actual: r.yearly[0].net_cash_after_tax, expected: expectedCash });
}

// 2.4 CGT applied at sale, reduces final proceeds. Build a fixture where the
//     property gains value at the end and check the disposal math.
{
  const gain = buildFixture({
    property_value_end: [510_000, 520_000, 530_000, 540_000, 600_000], // big jump terminal
    loan_balance_end:   [400_000, 400_000, 400_000, 400_000, 400_000],
  });
  const r = computeCanonicalPropertyEconomics(gain);
  // Sale proceeds gross = 600k.  Selling cost = 600k × 2% = 12k.
  // Capital gain gross = 600k - 12k - 500k = 88k.  No carry-forward (NG=0).
  // Discount 50% → taxable gain = 44k.  CGT = 44k × 0.37 = 16,280.
  // Net proceeds = 600k - 12k - 400k - 16,280 = 171,720.
  ok("Selling costs = 2% × 600k = 12k", r.selling_costs === 12_000);
  ok("Capital gain gross = 88k", r.capital_gain_gross === 88_000);
  ok("Capital gain taxable = 44k (50% discount)", r.capital_gain_taxable === 44_000);
  ok("CGT payable = 44k × 0.37 = 16,280", near(r.cgt_payable, 16_280, 1e-3));
  ok("Net proceeds after CGT = 171,720", near(r.net_proceeds_after_tax, 171_720, 1e-3));
}

// 2.5 CGT respects the discount rule: cgt_discount_pct=0 (no discount) ⇒ full
//     gain taxed; cgt_discount_pct=1.0 ⇒ zero CGT.
{
  const noDisc = computeCanonicalPropertyEconomics(buildFixture({
    property_value_end: [500_000, 500_000, 500_000, 500_000, 600_000],
    cgt_discount_pct: 0,
  }));
  // Gain after selling costs = 600k - 12k - 500k = 88k. CGT = 88k × 0.37.
  ok("Zero discount → full taxable gain", noDisc.capital_gain_taxable === 88_000);
  ok("Zero discount → CGT = 88k × 0.37", near(noDisc.cgt_payable, 88_000 * 0.37, 1e-3));

  const fullDisc = computeCanonicalPropertyEconomics(buildFixture({
    property_value_end: [500_000, 500_000, 500_000, 500_000, 600_000],
    cgt_discount_pct: 1.0,
  }));
  ok("Full discount → zero taxable", fullDisc.capital_gain_taxable === 0);
  ok("Full discount → zero CGT", fullDisc.cgt_payable === 0);
}

// 2.6 CGT only at sale — operating-year cashflows must not contain a CGT line.
{
  const r = computeCanonicalPropertyEconomics(buildFixture({
    property_value_end: [510_000, 520_000, 530_000, 540_000, 600_000],
  }));
  // Operating years (1..4) net_cash_after_tax must NOT include CGT.
  for (let i = 0; i < 4; i++) {
    const yr = r.yearly[i];
    // expected = rent - repayment - holding + ng_benefit  (no CGT)
    const expected = yr.annual_rent - yr.annual_repayment - yr.annual_holding + yr.ng_benefit;
    ok(`Year ${i+1} cash excludes CGT`, near(yr.net_cash_after_tax, expected, 1e-3));
  }
}

// 2.7 PPOR scenario — apply_cgt_on_sale=false ⇒ no CGT on disposal.
{
  const ppor = computeCanonicalPropertyEconomics(buildFixture({
    property_value_end: [500_000, 500_000, 500_000, 500_000, 800_000],
    apply_cgt_on_sale: false,
  }));
  ok("PPOR-style: no CGT charged", ppor.cgt_payable === 0);
}

// 2.8 IRR sanity — bigger terminal value ⇒ higher IRR.
{
  const lowGrowth = computeCanonicalPropertyEconomics(buildFixture());
  const highGrowth = computeCanonicalPropertyEconomics(buildFixture({
    property_value_end: [500_000, 500_000, 500_000, 500_000, 800_000],
  }));
  ok("Higher terminal value → higher IRR", highGrowth.irr > lowGrowth.irr,
     { low: lowGrowth.irr, high: highGrowth.irr });
}

// 2.9 IRR self-consistency — NPV at IRR ≈ 0.
{
  const r = computeCanonicalPropertyEconomics(buildFixture({
    property_value_end: [510_000, 520_000, 530_000, 540_000, 700_000],
  }));
  const npv = r.cashflows.reduce((a, cf, t) => a + cf / Math.pow(1 + r.irr, t), 0);
  ok("NPV at IRR ≈ 0 (self-consistent)", Math.abs(npv) < 1e-2, { irr: r.irr, npv });
}

// 2.10 Quarantine treatment carries losses forward and applies them at sale.
{
  const q = computeCanonicalPropertyEconomics(buildFixture({
    annual_rent:     [15_000, 15_000, 15_000, 15_000, 15_000],
    annual_holding:  [ 6_000,  6_000,  6_000,  6_000,  6_000],
    property_value_end: [500_000, 500_000, 500_000, 500_000, 700_000],
    ng_treatment: 'quarantine',
  }));
  // Each year loss = 15-20-6 = -11k. 5 years = 55k carry-forward.
  // Gain after selling cost = 700k - 14k - 500k = 186k. Less 55k carry = 131k.
  // 50% discount → 65.5k taxable. CGT = 65.5k × 0.37 = 24,235.
  ok("Quarantine treatment: ngBenefit=0 every year", q.yearly.every(y => y.ng_benefit === 0));
  ok("Quarantine treatment: 55k of losses applied at sale", q.carry_forward_losses_applied === 55_000);
  ok("Quarantine treatment: taxable after carry = 65.5k", q.capital_gain_taxable === 65_500);
  ok("Quarantine treatment: CGT = 24,235", near(q.cgt_payable, 24_235, 1e-3));
}

// 2.11 Abolish treatment: no NG benefit, no carry-forward.
{
  const ab = computeCanonicalPropertyEconomics(buildFixture({
    annual_rent:     [15_000, 15_000, 15_000, 15_000, 15_000],
    annual_holding:  [ 6_000,  6_000,  6_000,  6_000,  6_000],
    ng_treatment: 'abolish',
  }));
  ok("Abolish treatment: no NG benefit", ab.yearly.every(y => y.ng_benefit === 0));
  ok("Abolish treatment: no carry-forward applied at sale", ab.carry_forward_losses_applied === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SECTION 3 — End-to-end NG-single-count regression
 * (rebuild the cashflow vector by hand and compare)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n=== Sprint 4B §3 — End-to-end NG single-count regression ===");

{
  const fix = buildFixture({
    annual_rent:     [10_000, 10_000, 10_000, 10_000, 10_000],
    annual_holding:  [ 6_000,  6_000,  6_000,  6_000,  6_000],
    annual_interest: [20_000, 20_000, 20_000, 20_000, 20_000],
    property_value_end: [500_000, 500_000, 500_000, 500_000, 560_000],
  });
  const r = buildPropertyAfterTaxCashflows(fix);
  // Hand-rolled cashflows for the legacy double-count would have been:
  //   equityGain + ngBenefit - annualCashLoss
  //     = 0 + 5,920 - (25 - 10 + 6 - 5,920) ... → very different number
  // The canonical helper must produce JUST: rent - repayment - holding + ngBenefit.
  // taxable_loss = 10 - 20 - 6 = -16k → NG = 16k × 0.37 = 5,920.
  // year cash = 10 - 25 - 6 + 5.92 = -15.08k.
  for (let i = 0; i < 4; i++) {
    ok(`§3 year ${i+1}: ng_benefit single-counted = 5,920`, near(r.yearly[i].ng_benefit, 5_920, 1e-3));
    ok(`§3 year ${i+1}: cash = -15,080`, near(r.yearly[i].net_cash_after_tax, -15_080, 1e-3));
  }
  // Terminal year operating cash + sale proceeds.
  // Sale: value=560k, sellingCosts=11.2k, gain=560-11.2-500=48.8k, taxable=24.4k,
  // CGT=24.4k × 0.37 = 9,028. Debt=400k. Net=560-11.2-400-9.028=139,772.
  // Year-5 cash = -15.08k + 139,772 = 124,692 (approx)
  const last = r.cashflows[r.cashflows.length - 1];
  ok("§3 terminal cash includes proceeds AFTER CGT and debt", near(last, -15_080 + 139_772, 5));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Summary
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log(`\n\n========== Sprint 4B Result ==========`);
console.log(`  PASS: ${passed}`);
console.log(`  FAIL: ${failed}`);
console.log(`======================================\n`);

if (failed > 0) {
  process.exitCode = 1;
}
