/**
 * test-sprint4a-financial-integrity.ts
 *
 * Sprint 4A regression suite covering the four critical financial-integrity
 * defects:
 *
 *   D-1 — Canonical financial ledger: every major surface reads from one
 *         source of truth for net worth, monthly surplus, income, expenses,
 *         debt service, liquidity, and the input-state guard.
 *   D-2 — Interest-only loan engine: IO loans don't amortise inside the IO
 *         window; convert to P&I over the remaining term once the window
 *         closes; P&I loans amortise normally.
 *   D-3 — No hardcoded household fallbacks ($1.2M / $22K / $14,540 / 6.5% /
 *         30yr) in production calculation paths.
 *   D-4 — PPOR mortgage wiring: actual snapshot rate/term/loan_type are
 *         used everywhere; no hardcoded 6.5% / 30yr in master cashflow.
 *
 * Run with:  tsx script/test-sprint4a-financial-integrity.ts
 */

import {
  calcLoanRepayment,
  calcLoanBalanceWithType,
  calcMonthlyRepayment,
  normaliseLoanType,
} from "../client/src/lib/mathUtils";
import {
  selectCanonicalNetWorth,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectMortgageRepayment,
  selectSettledIpDebtService,
  selectMonthlyDebtService,
  selectMortgageInputState,
  type DashboardInputs,
} from "../client/src/lib/dashboardDataContract";
import {
  computeCanonicalHeadlineFigures,
  reconcileCanonicalLedger,
  buildCanonicalAuditTrace,
} from "../client/src/lib/canonicalLedger";
import { computeCanonicalNetWorth } from "../client/src/lib/canonicalNetWorth";
import { computeCanonicalCashflow } from "../client/src/lib/canonicalCashflow";
import { processEvents } from "../client/src/lib/eventProcessor";
import { projectProperty } from "../client/src/lib/finance";

let passed = 0;
let failed = 0;
function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}` + (detail !== undefined ? `  ${JSON.stringify(detail)}` : ""));
  }
}
function near(actual: number, expected: number, tol = 1): boolean {
  return Math.abs(actual - expected) <= tol;
}

// ── Real Sprint-4A household fixture (matches Sprint 3B audit fixture) ──
const REAL_SNAPSHOT = {
  ppor: 1_510_000,
  cash: 40_000,
  savings_cash: 0,
  emergency_cash: 0,
  other_cash: 0,
  offset_balance: 222_000,
  roham_super_balance: 49_500,
  fara_super_balance: 38_500,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  other_assets: 0,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,           // not the legacy hardcoded 6.5%
  mortgage_term_years: 28,       // not the legacy hardcoded 30
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  other_income: 0,
};

const REAL_INPUTS: DashboardInputs = {
  snapshot: REAL_SNAPSHOT,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-24",
};

// ════════════════════════════════════════════════════════════════════════
// D-1 — CANONICAL FINANCIAL LEDGER (cross-page consistency)
// ════════════════════════════════════════════════════════════════════════

console.log("\nD-1  Canonical financial ledger consistency");

const head = computeCanonicalHeadlineFigures(REAL_INPUTS);
const nw = computeCanonicalNetWorth(REAL_INPUTS);
const cf = computeCanonicalCashflow(REAL_INPUTS);
const trace = buildCanonicalAuditTrace(REAL_INPUTS);

ok("headline NW matches canonicalNetWorth wrapper", near(head.netWorth, nw.netWorth));
ok("headline NW matches dashboardDataContract selector",
   near(head.netWorth, selectCanonicalNetWorth(REAL_INPUTS).netWorth));
ok("headline income matches selector", near(head.monthlyIncome, selectMonthlyIncome(REAL_INPUTS)));
ok("headline income matches canonicalCashflow", near(head.monthlyIncome, cf.monthlyIncome));
ok("headline surplus matches canonicalCashflow", near(head.monthlySurplus, cf.monthlySurplus));
ok("headline expenses matches canonicalCashflow", near(head.monthlyExpenses, cf.monthlyExpenses));
ok("headline debt service matches selector",
   near(head.monthlyDebtService, selectMonthlyDebtService(REAL_INPUTS)));
ok("audit trace exposes total debt service",
   near(trace.debtServiceBreakdown.total,
        trace.debtServiceBreakdown.pporMortgage +
        trace.debtServiceBreakdown.settledIps +
        trace.debtServiceBreakdown.otherDebt));

// Multi-page reconciliation: simulate each page reading the canonical layer
const pageSnapshots = [
  { page: "Dashboard",       metric: "netWorth"          as const, value: nw.netWorth },
  { page: "Reports",         metric: "netWorth"          as const, value: computeCanonicalNetWorth(REAL_INPUTS).netWorth },
  { page: "WealthStrategy",  metric: "netWorth"          as const, value: selectCanonicalNetWorth(REAL_INPUTS).netWorth },
  { page: "Timeline",        metric: "netWorth"          as const, value: head.netWorth },
  { page: "Risk",            metric: "netWorth"          as const, value: head.netWorth },
  { page: "FinancialPlan",   metric: "netWorth"          as const, value: head.netWorth },
  { page: "Dashboard",       metric: "monthlySurplus"    as const, value: cf.monthlySurplus },
  { page: "Reports",         metric: "monthlySurplus"    as const, value: selectMonthlySurplus(REAL_INPUTS) },
  { page: "FinancialPlan",   metric: "monthlySurplus"    as const, value: head.monthlySurplus },
  { page: "Dashboard",       metric: "monthlyIncome"     as const, value: cf.monthlyIncome },
  { page: "Reports",         metric: "monthlyIncome"     as const, value: selectMonthlyIncome(REAL_INPUTS) },
  { page: "FinancialPlan",   metric: "monthlyExpenses"   as const, value: head.monthlyExpenses },
  { page: "Risk",            metric: "monthlyDebtService" as const, value: head.monthlyDebtService },
  { page: "WealthStrategy",  metric: "monthlyDebtService" as const, value: selectMonthlyDebtService(REAL_INPUTS) },
  { page: "Dashboard",       metric: "liquidity"         as const, value: nw.components.cashTotal },
];
const reconciliation = reconcileCanonicalLedger(head, pageSnapshots);
const allPass = reconciliation.every(r => r.status === "PASS");
ok("all cross-page headline values reconcile within $1",
   allPass,
   reconciliation.filter(r => r.status === "FAIL"));

// FIRE / risk / liquidity headlines also flow from the same ledger
ok("liquidity matches cash+offset components",
   near(head.liquidity, nw.components.cashTotal));

// ════════════════════════════════════════════════════════════════════════
// D-2 — INTEREST-ONLY LOAN ENGINE
// ════════════════════════════════════════════════════════════════════════

console.log("\nD-2  Interest-only loan engine");

ok("normaliseLoanType IO variants", normaliseLoanType("IO") === "IO" &&
   normaliseLoanType("interest_only") === "IO" &&
   normaliseLoanType("Interest-Only") === "IO");
ok("normaliseLoanType PI default", normaliseLoanType(undefined) === "PI" &&
   normaliseLoanType("anything else") === "PI");

// PI baseline — amortising
const piPmt = calcLoanRepayment({ principal: 600_000, annualRate: 6, termYears: 30, loanType: "PI" });
const piPmtClassic = calcMonthlyRepayment(600_000, 6, 30);
ok("PI loan repayment matches classic amortisation", near(piPmt, piPmtClassic, 0.01));

// IO loan inside the IO window: interest only, no amortisation
const ioPmt0 = calcLoanRepayment({
  principal: 600_000, annualRate: 6, termYears: 30,
  loanType: "IO", ioYears: 5, monthsSincePayment: 0,
});
const expectedIoPmt = 600_000 * 0.06 / 12; // 3,000/mo
ok("IO loan month 0 = interest-only", near(ioPmt0, expectedIoPmt, 0.01),
   { ioPmt0, expectedIoPmt });

const ioPmt36 = calcLoanRepayment({
  principal: 600_000, annualRate: 6, termYears: 30,
  loanType: "IO", ioYears: 5, monthsSincePayment: 36,
});
ok("IO loan month 36 still interest-only (inside window)",
   near(ioPmt36, expectedIoPmt, 0.01));

// IO loan AFTER IO window: P&I over remaining 25 years (30 - 5)
const ioPmtPost = calcLoanRepayment({
  principal: 600_000, annualRate: 6, termYears: 30,
  loanType: "IO", ioYears: 5, monthsSincePayment: 60,
});
const expectedPostIoPmt = calcMonthlyRepayment(600_000, 6, 25);
ok("IO loan post-IO converts to P&I over remaining term",
   near(ioPmtPost, expectedPostIoPmt, 0.01),
   { ioPmtPost, expectedPostIoPmt });

// Balance: IO must NOT amortise during the IO window
const ioBalMid = calcLoanBalanceWithType({
  principal: 600_000, annualRate: 6, termYears: 30,
  monthsPaid: 36, loanType: "IO", ioYears: 5,
});
ok("IO loan balance unchanged during IO window", near(ioBalMid, 600_000, 0.01));

const ioBalEdge = calcLoanBalanceWithType({
  principal: 600_000, annualRate: 6, termYears: 30,
  monthsPaid: 60, loanType: "IO", ioYears: 5,
});
ok("IO loan balance still principal at edge of IO window",
   near(ioBalEdge, 600_000, 0.01));

// Balance amortises after IO ends
const ioBalPost = calcLoanBalanceWithType({
  principal: 600_000, annualRate: 6, termYears: 30,
  monthsPaid: 120, loanType: "IO", ioYears: 5,
});
ok("IO loan balance amortises after IO window ends",
   ioBalPost < 600_000 && ioBalPost > 0,
   { ioBalPost });

// PI balance amortises from day one
const piBal12 = calcLoanBalanceWithType({
  principal: 600_000, annualRate: 6, termYears: 30,
  monthsPaid: 12, loanType: "PI",
});
ok("PI loan balance reduces by month 12", piBal12 < 600_000 && piBal12 > 580_000,
   { piBal12 });

// projectProperty respects IO window
const ioProjection = projectProperty({
  current_value: 800_000,
  loan_amount: 600_000,
  interest_rate: 6,
  loan_type: "IO",
  loan_term: 30,
  interest_only_years: 5,
  weekly_rent: 700,
  rental_growth: 3,
  vacancy_rate: 2,
  management_fee: 8,
  council_rates: 2000,
  insurance: 2000,
  maintenance: 2000,
  capital_growth: 6,
  projection_years: 10,
});
ok("projectProperty: IO loan balance stays at 600k for years 1-5",
   near(ioProjection[0].loanBalance, 600_000) &&
   near(ioProjection[4].loanBalance, 600_000),
   { y1: ioProjection[0].loanBalance, y5: ioProjection[4].loanBalance });
ok("projectProperty: IO loan starts amortising in year 6+",
   ioProjection[5].loanBalance < 600_000 && ioProjection[9].loanBalance < ioProjection[5].loanBalance,
   { y6: ioProjection[5].loanBalance, y10: ioProjection[9].loanBalance });

// processEvents emits IO repayment for an IO property
const ioEvents = processEvents({
  snapshot: { cash: 100_000, monthly_income: 30_000, monthly_expenses: 12_000,
              mortgage: 0, other_debts: 0 },
  properties: [{
    id: 1, name: "IO IP", type: "investment",
    settlement_date: "2026-01-01",
    loan_amount: 500_000, interest_rate: 6, loan_term: 30, loan_type: "IO",
    interest_only_years: 5,
    weekly_rent: 600, rental_growth: 3, vacancy_rate: 2, management_fee: 8,
    council_rates: 2000, insurance: 2000, maintenance: 2000,
    capital_growth: 6, projection_years: 10,
  }],
  stockTransactions: [], cryptoTransactions: [],
  stockDCASchedules: [], cryptoDCASchedules: [],
  plannedStockOrders: [], plannedCryptoOrders: [],
  bills: [], expenses: [],
});
const ioMortgageIpEvents = ioEvents.filter(e => e.type === "mortgage_ip");
const firstIoRepay = ioMortgageIpEvents[0];
const ioExpectedMonthly = 500_000 * 0.06 / 12;
ok("processEvents emits IO repayment month 0 = interest only",
   firstIoRepay != null && near(Math.abs(firstIoRepay.amount), ioExpectedMonthly, 0.5),
   { observed: firstIoRepay?.amount, expected: -ioExpectedMonthly });

// ════════════════════════════════════════════════════════════════════════
// D-3 — NO HARDCODED HOUSEHOLD FALLBACKS
// ════════════════════════════════════════════════════════════════════════

console.log("\nD-3  No hardcoded household fallbacks in production paths");

// Empty snapshot must NOT produce a $1.2M / $22K / $14,540 mirage
const emptySnap = { cash: 0, monthly_income: 0, monthly_expenses: 0,
                    mortgage: 0, other_debts: 0 };
const emptyEvents = processEvents({
  snapshot: emptySnap, properties: [],
  stockTransactions: [], cryptoTransactions: [],
  stockDCASchedules: [], cryptoDCASchedules: [],
  plannedStockOrders: [], plannedCryptoOrders: [],
  bills: [], expenses: [],
});
const incomeEvents = emptyEvents.filter(e => e.type === "income");
const expenseEvents = emptyEvents.filter(e => e.type === "expense");
const pporEvents = emptyEvents.filter(e => e.type === "mortgage_ppor");
ok("empty snapshot emits no $22k income",
   incomeEvents.every(e => e.amount === 0),
   { sample: incomeEvents[0] });
ok("empty snapshot emits no $14,540 expense",
   expenseEvents.every(e => e.amount === 0),
   { sample: expenseEvents[0] });
ok("empty snapshot emits no synthetic PPOR mortgage event",
   pporEvents.length === 0,
   { count: pporEvents.length });

// Empty canonical ledger → 0 everywhere, no NaN
const emptyInputs: DashboardInputs = {
  snapshot: null, properties: [], stocks: [], cryptos: [],
  holdingsRaw: [], incomeRecords: [], expenses: [], todayIso: "2026-05-24",
};
const emptyHead = computeCanonicalHeadlineFigures(emptyInputs);
ok("empty canonical NW = 0", emptyHead.netWorth === 0);
ok("empty canonical income = 0", emptyHead.monthlyIncome === 0);
ok("empty canonical expenses = 0", emptyHead.monthlyExpenses === 0);
ok("empty canonical surplus = 0", emptyHead.monthlySurplus === 0);
ok("empty mortgage repayment = 0 (no fabricated 6.5%/30yr)",
   selectMortgageRepayment(emptyInputs) === 0);
ok("empty inputState.mortgageReady is true (no debt = ready)",
   selectMortgageInputState(emptyInputs).ready === true);

// Snapshot with a mortgage but missing rate/term must NOT default to 6.5%/30
const partialInputs: DashboardInputs = {
  snapshot: { mortgage: 800_000 },
  properties: [], stocks: [], cryptos: [],
  holdingsRaw: [], incomeRecords: [], expenses: [],
  todayIso: "2026-05-24",
};
const partialState = selectMortgageInputState(partialInputs);
ok("partial snapshot (mortgage only) → mortgageReady=false",
   partialState.ready === false && partialState.hasPrincipal && !partialState.hasRate && !partialState.hasTerm);
ok("partial snapshot → mortgage repayment = 0 (no hardcoded default)",
   selectMortgageRepayment(partialInputs) === 0);

// ════════════════════════════════════════════════════════════════════════
// D-4 — PPOR MORTGAGE WIRING (uses snapshot, not hardcoded values)
// ════════════════════════════════════════════════════════════════════════

console.log("\nD-4  PPOR mortgage wiring (snapshot-driven)");

// With 5.85% / 28yr in the snapshot, the repayment must NOT match a
// 6.5% / 30yr fabricated value.
const realMortgage = selectMortgageRepayment(REAL_INPUTS);
const wrong65_30 = calcMonthlyRepayment(REAL_SNAPSHOT.mortgage, 6.5, 30);
const correct585_28 = calcMonthlyRepayment(REAL_SNAPSHOT.mortgage,
  REAL_SNAPSHOT.mortgage_rate, REAL_SNAPSHOT.mortgage_term_years);
ok("PPOR repayment uses snapshot rate/term", near(realMortgage, correct585_28, 0.01),
   { realMortgage, correct585_28 });
ok("PPOR repayment is NOT the legacy 6.5%/30yr value",
   !near(realMortgage, wrong65_30, 1),
   { delta: realMortgage - wrong65_30 });

// PPOR consistency: dashboardDataContract selector === debtServiceBreakdown
ok("PPOR repayment consistent across audit-trace components",
   near(realMortgage, trace.debtServiceBreakdown.pporMortgage, 0.01));

// PPOR IO scenario: 3-year IO window
const ioMortgageInputs: DashboardInputs = {
  snapshot: { ...REAL_SNAPSHOT, mortgage_loan_type: "IO", mortgage_io_years: 3 },
  properties: [], stocks: [], cryptos: [],
  holdingsRaw: [], incomeRecords: [], expenses: [],
  todayIso: "2026-05-24",
};
const ioMortgageRepay = selectMortgageRepayment(ioMortgageInputs);
const expectedIoMortgage = REAL_SNAPSHOT.mortgage * (REAL_SNAPSHOT.mortgage_rate / 100) / 12;
ok("IO PPOR mortgage = interest-only inside IO window",
   near(ioMortgageRepay, expectedIoMortgage, 0.01),
   { ioMortgageRepay, expectedIoMortgage });

// Settled IP debt service uses property rate/term not snapshot rate/term
const ipInputs: DashboardInputs = {
  snapshot: { ...REAL_SNAPSHOT },
  properties: [{
    id: 99, type: "investment",
    settlement_date: "2024-06-01", // before today
    loan_amount: 500_000, interest_rate: 5.0, loan_term: 25, loan_type: "PI",
  }],
  stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
  todayIso: "2026-05-24",
};
const ipDebtService = selectSettledIpDebtService(ipInputs);
const expectedIpDebt = calcMonthlyRepayment(500_000, 5.0, 25);
ok("Settled IP debt service uses the property's own rate/term/loan_type",
   near(ipDebtService, expectedIpDebt, 0.01),
   { ipDebtService, expectedIpDebt });

// PPOR consistency across pages: every "PPOR repayment" reader must produce
// the same number for the same household.
const pporConsistency = [
  selectMortgageRepayment(REAL_INPUTS),
  trace.debtServiceBreakdown.pporMortgage,
  buildCanonicalAuditTrace(REAL_INPUTS).debtServiceBreakdown.pporMortgage,
];
const pporConsistent = pporConsistency.every(v => near(v, pporConsistency[0], 0.01));
ok("PPOR repayment consistent across every consumer", pporConsistent,
   { values: pporConsistency });

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\nSprint 4A: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
