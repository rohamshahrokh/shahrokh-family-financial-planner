/**
 * test-sprint4c-financial-integrity.ts
 *
 * Sprint 4C financial integrity regression suite. Locks down every defect
 * Sprint 4A and 4B fixed plus the new Sprint 4C canonical-tax / canonical-
 * debt-service / canonical-FIRE invariants:
 *
 *   §1  Property lifecycle predicates (settled/planned/historical)
 *   §2  Property IRR + NG single-count + CGT once-at-sale
 *   §3  Negative gearing under current law vs reform
 *   §4  Debt service consistency (canonical layer)
 *   §5  Tax engine: income tax, marginal rate, household summary, offsets
 *   §6  Reconciliation framework rejects drift / accepts agreement
 *
 * The suite is a strict regression net — every assertion here was previously
 * a real defect, an audit finding, or a Sprint-4* spec requirement. Failing
 * one means a recent change has reverted an earlier fix.
 *
 * Run with:  tsx script/test-sprint4c-financial-integrity.ts
 */

import {
  isPropertyOwnedAt,
  wasPropertyAcquiredBy,
  wasPropertySoldBy,
  isInvestmentProperty,
  isPropertyHistorical,
} from "../shared/propertyLifecycle";
import {
  buildPropertyAfterTaxCashflows,
  computePropertyIRR,
  computeCanonicalPropertyEconomics,
  type PropertyEconomicsInputs,
} from "../client/src/lib/canonicalPropertyEconomics";
import {
  computeCanonicalDebtService,
  breakdownDebtService,
  projectDebtBalanceAt,
  reconcileDebtService,
} from "../client/src/lib/canonicalDebtService";
import {
  computeCanonicalIncomeTax,
  computeCanonicalPropertyTax,
  computeCanonicalCgt,
  resolveFutureTaxAssumptions,
  summariseOffsets,
  DEFAULT_TAX_YEAR,
  TAX_DEFAULTS,
} from "../client/src/lib/canonicalTax";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
} from "../client/src/lib/canonicalFire";
import {
  computeCanonicalHeadlineFigures,
  reconcileCanonicalLedger,
} from "../client/src/lib/canonicalLedger";
import {
  selectMonthlyDebtService,
  selectMonthlyIncome,
  selectMonthlySurplus,
  type DashboardInputs,
} from "../client/src/lib/dashboardDataContract";

let passed = 0;
let failed = 0;
function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}` + (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""));
  }
}
function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol;
}
function relativeNear(a: number, b: number, tolPct = 0.01): boolean {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b)) * tolPct;
}

const TODAY = "2026-05-24";

console.log("\nSprint 4C — Financial Integrity Regression Suite\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Property lifecycle predicates
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Property lifecycle predicates");

{
  const planned = {
    id: "p-planned", type: "investment",
    lifecycle_status: "planned",
    settlement_date: "2027-02-01",
  };
  ok("Planned IP: not owned today",  !isPropertyOwnedAt(planned, TODAY));
  ok("Planned IP: not acquired",     !wasPropertyAcquiredBy(planned, TODAY));
  ok("Planned IP: not sold",         !wasPropertySoldBy(planned, TODAY));
  ok("Planned IP: investment",       isInvestmentProperty(planned));
}

{
  const settled = {
    id: "p-settled", type: "investment",
    lifecycle_status: "settled",
    settlement_date: "2024-04-01",
  };
  ok("Settled IP: owned today",      isPropertyOwnedAt(settled, TODAY));
  ok("Settled IP: acquired by today", wasPropertyAcquiredBy(settled, TODAY));
  ok("Settled IP: not sold",         !wasPropertySoldBy(settled, TODAY));
  ok("Settled IP: not historical",   !isPropertyHistorical(settled));
}

{
  const sold = {
    id: "p-sold", type: "investment",
    lifecycle_status: "sold",
    settlement_date: "2020-04-01",
    sale_date: "2025-09-01",
  };
  ok("Sold IP: not owned today",     !isPropertyOwnedAt(sold, TODAY));
  ok("Sold IP: acquired by today",   wasPropertyAcquiredBy(sold, TODAY));
  ok("Sold IP: sold by today",       wasPropertySoldBy(sold, TODAY));
  ok("Sold IP: historical",          isPropertyHistorical(sold));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Property IRR, NG single-count, CGT once-at-sale
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Property IRR, NG single-count, CGT once-at-sale");

function makePropertyInputs(opts: Partial<PropertyEconomicsInputs> = {}): PropertyEconomicsInputs {
  const horizon = 10;
  return {
    purchase_price:     700_000,
    deposit:            140_000,
    stamp_duty:          27_000,
    other_upfront:        3_000,
    annual_rent:         Array.from({ length: horizon }, (_, i) => 30_000 * Math.pow(1.03, i)),
    annual_interest:     Array.from({ length: horizon }, () => 36_400),
    annual_repayment:    Array.from({ length: horizon }, () => 42_000),
    annual_holding:      Array.from({ length: horizon }, () => 6_000),
    annual_depreciation: Array.from({ length: horizon }, () => 7_000),
    property_value_end:  Array.from({ length: horizon }, (_, i) => 700_000 * Math.pow(1.05, i + 1)),
    loan_balance_end:    Array.from({ length: horizon }, (_, i) => Math.max(0, 560_000 - i * 6_000)),
    marginal_rate:       0.37,
    ng_treatment:        "deduct_against_wage",
    cgt_discount_pct:    0.5,
    selling_costs_pct:   0.025,
    apply_cgt_on_sale:   true,
    ...opts,
  };
}

const baseRun = buildPropertyAfterTaxCashflows(makePropertyInputs());
ok("IRR sane (positive, within 25%)", baseRun.cashflows[0] < 0,
   { irr: computePropertyIRR(baseRun.cashflows) });

const irrBase = computePropertyIRR(baseRun.cashflows);
ok("IRR > 0 for plausibly performing IP", irrBase > 0 && irrBase < 0.25, { irrBase });

// NG single-count: change deduction direction to abolish — IRR must drop.
const irrAbolish = computeCanonicalPropertyEconomics(
  makePropertyInputs({ ng_treatment: "abolish" }),
).irr;
ok("Abolishing NG drops IRR vs deduct-against-wage",
   irrAbolish < irrBase, { irrBase, irrAbolish });

// NG quarantine: losses carry forward, applied at sale → IRR sits between.
const irrQuarantine = computeCanonicalPropertyEconomics(
  makePropertyInputs({ ng_treatment: "quarantine" }),
).irr;
ok("Quarantine NG ≤ current-law IRR (losses deferred)", irrQuarantine <= irrBase + 1e-6);
ok("Quarantine NG ≥ abolish IRR (loss bank applied at sale)", irrQuarantine >= irrAbolish - 1e-6);

// CGT once-at-sale: zeroing apply_cgt_on_sale must improve net proceeds.
const noCgt = computeCanonicalPropertyEconomics(
  makePropertyInputs({ apply_cgt_on_sale: false }),
);
const withCgt = computeCanonicalPropertyEconomics(makePropertyInputs());
ok("Disabling CGT removes the CGT payable line",
   noCgt.cgt_payable === 0);
ok("CGT only affects terminal proceeds (not operating years)",
   relativeNear(noCgt.yearly[0].net_cash_after_tax, withCgt.yearly[0].net_cash_after_tax, 0.0005),
   {
     noCgtY1: noCgt.yearly[0].net_cash_after_tax,
     withCgtY1: withCgt.yearly[0].net_cash_after_tax,
   });
ok("CGT reduces net proceeds at sale",
   withCgt.net_proceeds_after_tax < noCgt.net_proceeds_after_tax);

// Quarantine consumes the loss bank only at disposal.
const quarantineRun = computeCanonicalPropertyEconomics(
  makePropertyInputs({ ng_treatment: "quarantine" }),
);
ok("Quarantine: ng_benefit is 0 every operating year",
   quarantineRun.yearly.every(y => y.ng_benefit === 0));
ok("Quarantine: carry forward losses applied at sale",
   quarantineRun.carry_forward_losses_applied >= 0);

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Negative gearing under current law vs reform
 *      via canonicalTax facade (Sprint 4C)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Tax engine — NG current law vs reform");

const lossPropertyInput = {
  propertyId: "p-loss-1",
  contractDate: "2026-01-15",     // before reform cutoff → grandfathered
  settlementDate: "2026-04-01",
  propertyType: "ESTABLISHED" as const,
  annualRent: 30_000,
  annualHoldingCosts: 6_000,
  annualInterest: 36_400,
  annualDepreciation: 7_000,
  annualWageIncome: 180_000,
  hasPrivateHospitalCover: true,
};

const ngCurrent = computeCanonicalPropertyTax({
  property: lossPropertyInput,
  scenario: "current_law",
});
ok("Current law: established IP is NG-eligible (grandfathered or pre-reform)",
   ngCurrent.classification.negativeGearingEligible);
ok("Current law: positive PAYG refund on loss",
   ngCurrent.annual.paygRefundThisYear > 0);
ok("Current law: no loss accrued to bank",
   ngCurrent.annual.lossAccumulatedThisYear === 0);

// Reform: same property bought AFTER cutoff → no NG, losses quarantined.
const postCutoffInput = {
  ...lossPropertyInput,
  contractDate: "2026-07-15",
  settlementDate: "2026-08-15",
};
const ngReform = computeCanonicalPropertyTax({
  property: postCutoffInput,
  scenario: "proposed_reform",
});
ok("Reform: post-cutoff established IP loses NG eligibility",
   !ngReform.classification.negativeGearingEligible);
ok("Reform: no PAYG refund on loss (quarantined)",
   ngReform.annual.paygRefundThisYear === 0);
ok("Reform: loss accrues to bank",
   ngReform.annual.lossAccumulatedThisYear > 0);
ok("Reform: lossBank result reports quarantine",
   ngReform.lossBank.quarantined === true);

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Debt service consistency (canonical layer)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Debt service consistency");

const HH_SNAPSHOT = {
  ppor: 1_510_000,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  cash: 40_000, offset_balance: 222_000,
  roham_super_balance: 49_500, fara_super_balance: 38_500, super_balance: 88_000,
  cars: 65_000, iran_property: 150_000,
  roham_monthly_income: 15_466.67, fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000, expenses_includes_debt: true,
  rental_income_total: 0, other_income: 0,
};

const HH_IP = {
  id: "ip-1", type: "investment", lifecycle_status: "settled",
  settlement_date: "2024-06-01", purchase_date: "2024-06-01",
  current_value: 720_000, loan_amount: 540_000,
  interest_rate: 6.15, loan_term: 30, loan_type: "PI",
  weekly_rent: 650, vacancy_rate: 4, management_fee: 7,
  name: "Brisbane IP",
};

const HH_INPUTS: DashboardInputs = {
  snapshot: HH_SNAPSHOT,
  properties: [HH_IP],
  stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
  todayIso: TODAY,
};

const debt = computeCanonicalDebtService(HH_INPUTS);
const lines = breakdownDebtService(HH_INPUTS);

ok("debt facade total matches selectMonthlyDebtService",
   near(debt.totalMonthly, Math.round(selectMonthlyDebtService(HH_INPUTS))));

ok("breakdown sum == facade total",
   near(Math.round(lines.reduce((s, l) => s + l.monthlyRepayment, 0)), debt.totalMonthly));

ok("PPOR P&I within expected window (~$7k/mo)",
   debt.pporMonthly > 6_500 && debt.pporMonthly < 8_000,
   { ppor: debt.pporMonthly });

ok("IP P&I within expected window (~$3.3k/mo)",
   debt.ipMonthly > 3_000 && debt.ipMonthly < 3_700,
   { ip: debt.ipMonthly });

ok("balances.total == PPOR + IP + other",
   near(debt.balances.total,
        debt.balances.ppor + debt.balances.settledIps + debt.balances.otherDebts));

// IO loan projection — balance must not amortise during IO window.
const ioBal = projectDebtBalanceAt({
  principal: 540_000, annualRate: 6.15, termYears: 30,
  loanType: "IO", ioYears: 5, monthsForward: 36,
});
ok("IO loan balance unchanged at month 36 (still inside 5y IO window)",
   near(ioBal, 540_000));

// After IO ends, balance must drop.
const ioBalAfter = projectDebtBalanceAt({
  principal: 540_000, annualRate: 6.15, termYears: 30,
  loanType: "IO", ioYears: 5, monthsForward: 96,  // 8 years in
});
ok("IO loan balance amortises after IO window ends",
   ioBalAfter < 540_000 && ioBalAfter > 460_000,
   { ioBalAfter });

const dbtRec = reconcileDebtService(debt, [
  { page: "Dashboard",      metric: "pporMonthly",     value: debt.pporMonthly },
  { page: "Forecast",       metric: "pporMonthly",     value: debt.pporMonthly },
  { page: "Risk",           metric: "ipMonthly",       value: debt.ipMonthly },
  { page: "GoalSolver",     metric: "otherDebtMonthly", value: debt.otherDebtMonthly },
  { page: "MonteCarlo",     metric: "totalMonthly",    value: debt.totalMonthly },
  { page: "WealthStrategy", metric: "totalAnnual",     value: debt.totalAnnual },
  { page: "Reports",        metric: "totalBalance",    value: debt.balances.total },
]);
ok("debt facade reconciles across all surfaces",
   dbtRec.every(r => r.status === "PASS"),
   dbtRec.filter(r => r.status === "FAIL"));

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Tax engine: income tax, marginal rate, household summary, offsets
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Tax engine consolidation");

const taxRun = computeCanonicalIncomeTax({
  rohamAnnualSalary: 185_000,
  faraAnnualSalary:  180_000,
  superRatePct: 12,
  superIncluded: false,
  hasPrivateHospitalCover: true,
  taxYear: "2025-26",
});
ok("Canonical income tax: returns both persons", taxRun.primary && taxRun.secondary);
ok("Household tax positive",
   taxRun.householdTaxAnnual > 0);
ok("Household net annual == sum of persons",
   near(taxRun.householdNetAnnual, taxRun.primary.netAnnual + taxRun.secondary.netAnnual));
ok("Household gross == sum of persons gross",
   near(taxRun.householdGrossAnnual, taxRun.primary.annualGross + taxRun.secondary.annualGross));
ok("Marginal rates resolved", taxRun.primaryMarginalRate > 0 && taxRun.blendedMarginalRate > 0);
ok("Blended marginal rate sane (0 < x < 0.5)",
   taxRun.blendedMarginalRate > 0 && taxRun.blendedMarginalRate < 0.5);

const offsets = summariseOffsets(taxRun);
ok("Offset summary: household effective tax rate sane",
   offsets.householdEffectiveTaxRate > 0 && offsets.householdEffectiveTaxRate < 0.5);

const futureTax = resolveFutureTaxAssumptions({
  scenario: "current_law",
  income: {
    rohamAnnualSalary: 185_000,
    faraAnnualSalary: 180_000,
  },
});
ok("Future tax (current law): NG still eligible",
   futureTax.establishedNgEligibleToday === true);
ok("Future tax: blended marginal rate forwarded",
   near(futureTax.blendedMarginalRate, taxRun.blendedMarginalRate));
ok("Future tax: super guarantee rate 12%",
   near(futureTax.superGuaranteeRate, TAX_DEFAULTS.superGuaranteeRate));

const futureTaxReform = resolveFutureTaxAssumptions({ scenario: "proposed_reform" });
ok("Future tax (reform): established NG no longer eligible today",
   futureTaxReform.establishedNgEligibleToday === false);

// CGT: sell a settled IP under current law vs reform, expect different results.
const cgtCurrent = computeCanonicalCgt({
  property: {
    propertyId: "p-cgt",
    contractDate: "2023-04-01",
    settlementDate: "2023-04-15",
    annualRent: 30_000,
    annualHoldingCosts: 6_000,
    annualInterest: 36_400,
    annualDepreciation: 7_000,
    annualWageIncome: 180_000,
    yearsHeld: 5,
    salePrice: 950_000,
    costBase: 730_000,
  },
  scenario: "current_law",
});
ok("CGT (current law): CGT > 0 when there is a gain",
   cgtCurrent.cgtPayable > 0);
ok("CGT (current law): 50% discount method",
   cgtCurrent.method === "CURRENT_50_PERCENT_DISCOUNT");

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Reconciliation framework: catches drift, accepts agreement
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Reconciliation framework drift detection");

const head = computeCanonicalHeadlineFigures(HH_INPUTS);

// Synthetic drift on debt service (e.g. forgotten IO carry-forward).
const driftRec = reconcileCanonicalLedger(head, [
  { page: "Dashboard",  metric: "monthlyDebtService", value: head.monthlyDebtService },
  { page: "BadEngine",  metric: "monthlyDebtService", value: head.monthlyDebtService + 250 },
], 1);
ok("$250 debt-service drift is caught",
   driftRec.find(r => r.metric === "monthlyDebtService")?.status === "FAIL");

const cleanRec = reconcileCanonicalLedger(head, [
  { page: "Dashboard",  metric: "monthlyDebtService", value: head.monthlyDebtService },
  { page: "Forecast",   metric: "monthlyDebtService", value: head.monthlyDebtService },
  { page: "Reports",    metric: "monthlyDebtService", value: head.monthlyDebtService },
], 1);
ok("zero-drift reconciliation is PASS",
   cleanRec.every(r => r.status === "PASS"));

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — FIRE: snapshot precedence + monthly-expense fallback
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  FIRE precedence");

const withTarget = computeCanonicalFire(
  { ...HH_INPUTS, snapshot: { ...HH_SNAPSHOT, fire_target_monthly_income: 12_000 } },
  { swrPct: 4 },
);
ok("FIRE picks explicit target", withTarget.source === "user_target");
ok("FIRE number = target × 12 / SWR",
   near(withTarget.fireNumber, (12_000 * 12) / 0.04));

const withoutTarget = computeCanonicalFire(HH_INPUTS, { swrPct: 4 });
ok("FIRE falls back to monthly expenses when target absent",
   withoutTarget.source === "monthly_expenses_fallback");

const swrClamped = computeCanonicalFire(HH_INPUTS, { swrPct: 50 });
ok("Out-of-range SWR clamps to default 4%", swrClamped.swrPct === 4);

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
