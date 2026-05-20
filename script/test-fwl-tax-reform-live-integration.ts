/**
 * test-fwl-tax-reform-live-integration.ts
 *
 * Integration tests proving the FWL tax reform engine is LIVE-wired into
 * the platform's projection surfaces, NOT just sitting as an unused module.
 *
 * Required by:
 *   FWL_TAX_REFORM_LIVE_INTEGRATION acceptance criteria
 *
 * Coverage:
 *   1. Portfolio adapter computes a real reform vs current-law delta.
 *   2. Loss bank accumulates correctly across multiple FYs and is consumed
 *      against future profit and disposal.
 *   3. CGT outputs differ between current law (50% discount) and reform
 *      (indexed cost base + loss bank).
 *   4. Grandfathered property (acquired before cutoff) is excluded from
 *      reform impact.
 *   5. Forecast engine returns different projections under reform vs
 *      current law (proves regime switch materially changes projection).
 *   6. Dashboard / Property / CGT / Tax-strategy surfaces reference the
 *      canonical taxRulesEngine module (anti-duplication guard).
 *
 * Run: npx tsx script/test-fwl-tax-reform-live-integration.ts
 */

import { readFile } from "node:fs/promises";
import {
  computePortfolioTaxImpact,
  type PortfolioPropertyRow,
} from "../client/src/lib/tax/propertyPortfolioTaxImpact";
import {
  calculateCGT,
  calculateLossBank,
  classifyPropertyTaxRegime,
  type PropertyTaxInput,
} from "../client/src/lib/tax/taxRulesEngine";
import {
  buildForecastBothRegimes,
} from "../client/src/lib/forecastEngineRegimeAware";

const TESTS: Array<{ name: string; assert: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { TESTS.push({ name, assert: fn }); }
function eq<T>(a: T, b: T, m: string): void {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function truthy(v: unknown, m: string): void {
  if (!v) throw new Error(`${m}: expected truthy, got ${JSON.stringify(v)}`);
}
function falsy(v: unknown, m: string): void {
  if (v) throw new Error(`${m}: expected falsy, got ${JSON.stringify(v)}`);
}
function gt(a: number, b: number, m: string): void {
  if (!(a > b)) throw new Error(`${m}: expected ${a} > ${b}`);
}
function approx(a: number, b: number, eps: number, m: string): void {
  if (Math.abs(a - b) > eps) throw new Error(`${m}: expected ${b} ±${eps}, got ${a}`);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HOUSEHOLD_WAGE = 220_000;

// Established IP acquired post-cutoff — should be reform-affected.
const POST_REFORM_IP: PortfolioPropertyRow = {
  id: 101,
  name: "Brisbane IP (post-reform)",
  type: "investment",
  property_type: "ESTABLISHED",
  contract_date: "2028-03-01",
  purchase_date: "2028-04-15",
  weekly_rent: 540,
  loan_amount: 620_000,
  interest_rate: 6.5,
  management_fee: 8,
  council_rates: 2_200,
  insurance: 1_800,
  maintenance: 2_000,
  body_corporate: 0,
  land_tax: 0,
  water_rates: 900,
  current_value: 780_000,
  purchase_price: 780_000,
};

// Same property but acquired BEFORE the cutoff — should be grandfathered.
const GRANDFATHERED_IP: PortfolioPropertyRow = {
  ...POST_REFORM_IP,
  id: 102,
  name: "Sydney IP (grandfathered)",
  contract_date: "2024-09-01",
  purchase_date: "2024-10-15",
};

// PPOR — should be excluded from impact totals.
const PPOR: PortfolioPropertyRow = {
  id: 1,
  name: "Family Home",
  type: "ppor",
  current_value: 1_200_000,
  loan_amount: 480_000,
  interest_rate: 6.1,
};

// New build post-cutoff — should be carve-out (still NG-eligible).
const NEW_BUILD: PortfolioPropertyRow = {
  ...POST_REFORM_IP,
  id: 103,
  name: "Logan New Build",
  property_type: "NEW_BUILD",
  contract_date: "2028-06-01",
  purchase_date: "2028-07-01",
};

// ─── 1. Portfolio adapter ────────────────────────────────────────────────────

test("Portfolio adapter excludes PPOR and computes reform vs current-law delta", () => {
  const summary = computePortfolioTaxImpact(
    [PPOR, POST_REFORM_IP, GRANDFATHERED_IP, NEW_BUILD],
    HOUSEHOLD_WAGE,
  );
  // PPOR excluded → 3 rows
  eq(summary.rows.length, 3, "row count");
  eq(summary.totals.reformAffectedCount, 1, "one reform-affected IP");
  eq(summary.totals.grandfatheredCount, 1, "one grandfathered IP");
  eq(summary.totals.carveOutCount, 1, "one carve-out");
  gt(summary.totals.currentLawRefund, summary.totals.reformRefund, "reform refund < current law refund");
  gt(summary.totals.refundsReduced, 0, "refunds reduced > 0");
  gt(summary.totals.annualLossBankGrowth, 0, "loss bank grows under reform");
});

test("Portfolio summary hides delta tile when no investment properties", () => {
  const summary = computePortfolioTaxImpact([PPOR], HOUSEHOLD_WAGE);
  eq(summary.rows.length, 0, "no rows");
  eq(summary.totals.refundsReduced, 0, "no refund delta");
});

// ─── 2. Loss bank accumulation + consumption ────────────────────────────────

test("Loss bank accumulates over 3 FYs and is consumed by future profit + disposal", () => {
  let bank = 0;
  for (const loss of [-18_000, -14_000, -9_000]) {
    bank = calculateLossBank({ previousBank: bank, taxableRentalProfit: loss, scenario: "proposed_reform" }).newBank;
  }
  eq(bank, 41_000, "bank after 3 years of accruals");

  // FY4 — profit consumes part of the bank
  const fy4 = calculateLossBank({ previousBank: bank, taxableRentalProfit: 12_000, scenario: "proposed_reform" });
  eq(fy4.lossApplied, 12_000, "12k applied");
  eq(fy4.newBank, 29_000, "bank after consumption");

  // Disposal — remaining bank consumes against CGT taxable gain
  const sale = calculateCGT({
    property: {
      ...({
        propertyId: "P-loss",
        contractDate: "2028-01-15",
        propertyType: "ESTABLISHED",
        annualRent: 28_000, annualHoldingCosts: 7_000, annualInterest: 35_000,
        annualDepreciation: 6_000, annualWageIncome: HOUSEHOLD_WAGE,
      } as PropertyTaxInput),
      salePrice: 980_000,
      costBase: 720_000,
      yearsHeld: 5,
    },
    lossBankAtSale: 29_000,
  }, "proposed_reform");
  eq(sale.method, "INDEXED_COST_BASE", "reform CGT method");
  eq(sale.carryForwardApplied, 29_000, "full bank consumed against disposal gain");
});

// ─── 3. CGT current law vs reform ───────────────────────────────────────────

test("CGT differs materially between current law and reform on the same sale", () => {
  const property: PropertyTaxInput = {
    propertyId: "cgt-x", contractDate: "2028-01-15", propertyType: "ESTABLISHED",
    annualRent: 28_000, annualHoldingCosts: 7_000, annualInterest: 35_000,
    annualDepreciation: 6_000, annualWageIncome: HOUSEHOLD_WAGE,
    salePrice: 1_050_000, costBase: 760_000, yearsHeld: 7,
  };
  const cl = calculateCGT({ property }, "current_law");
  const rf = calculateCGT({ property }, "proposed_reform");
  eq(cl.method, "CURRENT_50_PERCENT_DISCOUNT", "current law method");
  eq(rf.method, "INDEXED_COST_BASE", "reform method");
  truthy(cl.netProceeds !== rf.netProceeds, "net proceeds differ between regimes");
});

// ─── 4. Grandfathering exclusion ─────────────────────────────────────────────

test("Grandfathered property has zero reform impact (refund == current law)", () => {
  const r = computePortfolioTaxImpact([GRANDFATHERED_IP], HOUSEHOLD_WAGE);
  eq(r.rows.length, 1, "single row");
  const row = r.rows[0];
  truthy(row.classification.status.isGrandfathered, "is grandfathered");
  // Reform should preserve PAYG refund for grandfathered properties.
  approx(row.currentLaw.paygRefundThisYear, row.proposedReform.paygRefundThisYear, 1, "refund identical");
  approx(row.cashflowDelta, 0, 1, "no cashflow delta");
});

// ─── 5. Forecast projection changes under regime switch ─────────────────────

test("buildForecastBothRegimes returns DIFFERENT net worth under reform vs current law", () => {
  const fixture: any = {
    snapshot: {
      cash: 60_000, offset_balance: 0, monthly_income: HOUSEHOLD_WAGE / 12,
      monthly_expenses: 8_000, super_balance: 250_000,
      mortgage: 480_000, mortgage_rate: 6.1,
      other_debts: 0,
    },
    assumptions: {
      inflation: 3, ppor_growth: 6, prop_growth: 6,
      stock_return: 7, crypto_return: 12, income_growth: 3.5,
      expense_growth: 3,
    },
    stocks: [{ symbol: "VAS", quantity: 0, current_price: 100, total_value: 80_000 }],
    cryptos: [{ symbol: "BTC", quantity: 0.1, current_price: 50_000, total_value: 5_000 }],
    stockTransactions: [],
    cryptoTransactions: [],
    bills: [],
    annualSalaryIncome: HOUSEHOLD_WAGE,
    properties: [
      {
        is_ppor: true, property_type: "PPOR", current_value: 1_200_000, loan_amount: 480_000,
        interest_rate: 6.1, weekly_rent: 0, capital_growth: 5,
      },
      {
        is_ppor: false, property_type: "ESTABLISHED", contract_date: "2028-03-01",
        purchase_date: "2028-04-01",
        current_value: 780_000, loan_amount: 620_000, interest_rate: 6.5,
        weekly_rent: 540, management_fee: 8, council_rates: 2_200,
        insurance: 1_800, maintenance: 2_000, body_corporate: 0,
        capital_growth: 6, rental_growth: 3, vacancy_rate: 2,
      },
      {
        is_ppor: false, property_type: "ESTABLISHED", contract_date: "2029-04-01",
        purchase_date: "2029-05-01",
        current_value: 720_000, loan_amount: 580_000, interest_rate: 6.5,
        weekly_rent: 510, management_fee: 8, council_rates: 2_100,
        insurance: 1_700, maintenance: 1_800, body_corporate: 0,
        capital_growth: 6, rental_growth: 3, vacancy_rate: 2,
      },
    ],
    ngAnnualBenefit: 18_000, // current-law NG benefit
  };
  const out = buildForecastBothRegimes({
    input: fixture,
    regimeSelector: "AUTO_DETECT",
  });
  // Both regimes should run identically when the engine respects parallel
  // pathway (current === legacy buildForecast).
  truthy(out.current.netWorth.length > 0, "current series ran");
  truthy(out.reform.netWorth.length > 0, "reform series ran");
  // Reform NG should be ZERO (both established post-cutoff properties quarantined).
  approx(out.reformNgAnnualBenefit, 0, 100, "reform NG benefit zeroed");
  gt(out.currentNgAnnualBenefit, out.reformNgAnnualBenefit, "current NG > reform NG");
  // Net worth at year 10 must differ between regimes.
  const cNW = (out.current.netWorth[9] as any)?.endNetWorth ?? 0;
  const rNW = (out.reform.netWorth[9] as any)?.endNetWorth ?? 0;
  truthy(cNW !== rNW, `year-10 NW must differ (got current=${cNW}, reform=${rNW})`);
  gt(cNW, rNW, "current law NW > reform NW at year 10 (reform removes NG benefit)");
  gt(out.deltas.cumulative_ng_drag, 0, "cumulative NG drag > 0");
});

// ─── 6. Anti-duplication: UI surfaces import the canonical engine ───────────

async function fileImportsTaxRulesEngine(path: string): Promise<boolean> {
  const src = await readFile(path, "utf8");
  return /from\s+["']@\/lib\/tax\/taxRulesEngine["']|from\s+["']@\/lib\/tax\/propertyPortfolioTaxImpact["']/.test(src);
}

test("Dashboard imports FutureReformImpactCard (engine-bound)", async () => {
  const src = await readFile("client/src/pages/dashboard.tsx", "utf8");
  truthy(src.includes("FutureReformImpactCard"), "dashboard imports the card");
});

test("PropertyCard renders PropertyTaxImpactBlock (engine-bound)", async () => {
  const src = await readFile("client/src/pages/property.tsx", "utf8");
  truthy(src.includes("PropertyTaxImpactBlock"), "property page imports the block");
});

test("Tax Alpha imports TaxStrategyAuditTable + ModellingAssumptionsChip", async () => {
  const src = await readFile("client/src/pages/tax-alpha.tsx", "utf8");
  truthy(src.includes("TaxStrategyAuditTable"), "tax-alpha imports audit table");
  truthy(src.includes("ModellingAssumptionsChip"), "tax-alpha imports chip");
});

test("CGT Simulator imports CGTReformWaterfall + ModellingAssumptionsChip", async () => {
  const src = await readFile("client/src/pages/cgt-simulator.tsx", "utf8");
  truthy(src.includes("CGTReformWaterfall"), "cgt-simulator imports waterfall");
  truthy(src.includes("ModellingAssumptionsChip"), "cgt-simulator imports chip");
});

test("FutureReformImpactCard sources values from taxRulesEngine adapter", async () => {
  const ok = await fileImportsTaxRulesEngine(
    "client/src/components/taxRegime/FutureReformImpactCard.tsx",
  );
  truthy(ok, "FutureReformImpactCard binds to canonical engine");
});

test("PropertyTaxImpactBlock + TaxStrategyAuditTable + CGTReformWaterfall bind to canonical engine", async () => {
  const a = await fileImportsTaxRulesEngine("client/src/components/taxRegime/PropertyTaxImpactBlock.tsx");
  const b = await fileImportsTaxRulesEngine("client/src/components/taxRegime/TaxStrategyAuditTable.tsx");
  const c = await fileImportsTaxRulesEngine("client/src/components/taxRegime/CGTReformWaterfall.tsx");
  truthy(a && b && c, "all three components import canonical taxRulesEngine adapter");
});

test("No top-nav regime selector survives (Layout.tsx)", async () => {
  const src = await readFile("client/src/components/Layout.tsx", "utf8");
  falsy(src.includes("<TaxRegimeHeaderStrip"), "no <TaxRegimeHeaderStrip>");
});

// ─── Run ────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
for (const t of TESTS) {
  try {
    const res = t.assert();
    if (res && typeof (res as any).then === "function") await (res as any);
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${t.name}\n    ${(err as Error).message}`);
    failed++;
  }
}
console.log(`\n${passed}/${TESTS.length} fwl-tax-reform-live-integration tests passed.`);
if (failed > 0) process.exit(1);
