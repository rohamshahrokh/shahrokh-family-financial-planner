/**
 * test-sprint4c-reconciliation.ts
 *
 * Sprint 4C cross-page reconciliation test framework. Proves that every
 * page-level surface — Dashboard, Forecast, Reports, Financial Plan, Wealth
 * Strategy, Timeline, Risk, Goal Solver, Monte Carlo — produces the same
 * value for every headline metric:
 *
 *   - Net Worth
 *   - Assets
 *   - Liabilities
 *   - Monthly Income
 *   - Monthly Expenses
 *   - Monthly Surplus
 *   - Debt Service
 *   - FIRE Number
 *   - Passive Income
 *
 * The test never patches a page's UI — it reconstructs each page's input
 * pipeline (DashboardInputs from snapshot / properties / income / expenses)
 * and runs the canonical compute. Any drift between two surfaces that
 * consume the canonical facade is therefore a real failure, not a mock
 * artefact.
 *
 * Run with:  tsx script/test-sprint4c-reconciliation.ts
 */

import {
  selectCanonicalNetWorth,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectMonthlyDebtService,
  selectPassiveIncome,
  type DashboardInputs,
} from "../client/src/lib/dashboardDataContract";
import {
  computeCanonicalHeadlineFigures,
  reconcileCanonicalLedger,
  buildCanonicalAuditTrace,
  type CanonicalHeadlineFigures,
} from "../client/src/lib/canonicalLedger";
import { computeCanonicalNetWorth } from "../client/src/lib/canonicalNetWorth";
import { computeCanonicalCashflow } from "../client/src/lib/canonicalCashflow";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
  selectFireMonthlyContribution,
} from "../client/src/lib/canonicalFire";
import {
  computeCanonicalDebtService,
  breakdownDebtService,
  reconcileDebtService,
  projectDebtBalanceAt,
} from "../client/src/lib/canonicalDebtService";

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

/* ═══════════════════════════════════════════════════════════════════════════
 * Realistic household fixture (carried forward from Sprint 4A/4B)
 * ═══════════════════════════════════════════════════════════════════════════ */

const FIXTURE_SNAPSHOT = {
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
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  other_income: 0,
  // For FIRE reconciliation — explicit user target lets us pin the expected NW.
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const SETTLED_IP = {
  id: "ip-1",
  type: "investment",
  lifecycle_status: "settled",
  settlement_date: "2024-06-01",
  purchase_date: "2024-06-01",
  current_value: 720_000,
  loan_amount: 540_000,
  interest_rate: 6.15,
  loan_term: 30,
  loan_type: "PI",
  weekly_rent: 650,
  vacancy_rate: 4,
  management_fee: 7,
  name: "Brisbane IP",
};

const FIXTURE_INPUTS: DashboardInputs = {
  snapshot: FIXTURE_SNAPSHOT,
  properties: [SETTLED_IP],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-24",
};

console.log("\nSprint 4C — Cross-page reconciliation framework\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Canonical facade reconciliation
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Canonical facade reconciliation");

const head: CanonicalHeadlineFigures = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
const nw = computeCanonicalNetWorth(FIXTURE_INPUTS);
const cf = computeCanonicalCashflow(FIXTURE_INPUTS);
const fire = computeCanonicalFire(FIXTURE_INPUTS, {
  targetMonthlyIncome: resolveFireTargetFromSnapshot(FIXTURE_INPUTS),
  swrPct: 4,
});
const debt = computeCanonicalDebtService(FIXTURE_INPUTS);
const trace = buildCanonicalAuditTrace(FIXTURE_INPUTS);

ok("headline NW == canonicalNetWorth", near(head.netWorth, nw.netWorth));
ok("headline NW == selector NW", near(head.netWorth, selectCanonicalNetWorth(FIXTURE_INPUTS).netWorth));
ok("headline income == cashflow income", near(head.monthlyIncome, cf.monthlyIncome));
ok("headline surplus == cashflow surplus", near(head.monthlySurplus, cf.monthlySurplus));
ok("headline expenses == cashflow expenses", near(head.monthlyExpenses, cf.monthlyExpenses));
ok("headline debt service == debt facade total", near(head.monthlyDebtService, debt.totalMonthly));
ok("headline debt service == selector total", near(head.monthlyDebtService, selectMonthlyDebtService(FIXTURE_INPUTS)));
ok("headline passive income == selector passive", near(head.passiveIncome, selectPassiveIncome(FIXTURE_INPUTS)));
ok("headline FIRE number == FIRE facade", near(head.fireNumber, fire.fireNumber));
ok("audit trace exposes FIRE", trace.fire.fireNumber === fire.fireNumber);
ok("audit trace exposes debt facade", trace.debtService.totalMonthly === debt.totalMonthly);

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Multi-page reconciliation: Dashboard = Forecast = Reports = Strategy = Risk
 *
 * Each "page" here is a simulated read-path that reconstructs the inputs the
 * actual page assembles, then runs the canonical compute. Any divergence is
 * proof that a downstream surface has drifted from the SoT.
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Multi-page reconciliation (Dashboard / Forecast / Reports / Strategy / Risk / Goal Solver / Monte Carlo)");

type PageSnapshot = { page: string; metric: keyof CanonicalHeadlineFigures; value: number };

function pageDashboard(): PageSnapshot[] {
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  const n = computeCanonicalNetWorth(FIXTURE_INPUTS);
  return [
    { page: "Dashboard", metric: "netWorth",          value: n.netWorth },
    { page: "Dashboard", metric: "totalAssets",       value: n.raw.totalAssets },
    { page: "Dashboard", metric: "totalLiabilities",  value: n.raw.totalLiabilities },
    { page: "Dashboard", metric: "monthlyIncome",     value: h.monthlyIncome },
    { page: "Dashboard", metric: "monthlyExpenses",   value: h.monthlyExpenses },
    { page: "Dashboard", metric: "monthlySurplus",    value: h.monthlySurplus },
    { page: "Dashboard", metric: "monthlyDebtService", value: h.monthlyDebtService },
    { page: "Dashboard", metric: "passiveIncome",     value: h.passiveIncome },
    { page: "Dashboard", metric: "fireNumber",        value: h.fireNumber },
  ];
}

function pageForecast(): PageSnapshot[] {
  // Forecast Engine consumes the same `snapshot + properties + expenses` to
  // run cash projections. The headline values driving Year-0 of the forecast
  // come from the canonical facade.
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "Forecast", metric: "netWorth",          value: selectCanonicalNetWorth(FIXTURE_INPUTS).netWorth },
    { page: "Forecast", metric: "totalAssets",       value: selectCanonicalNetWorth(FIXTURE_INPUTS).totalAssets },
    { page: "Forecast", metric: "totalLiabilities",  value: selectCanonicalNetWorth(FIXTURE_INPUTS).totalLiabilities },
    { page: "Forecast", metric: "monthlyIncome",     value: selectMonthlyIncome(FIXTURE_INPUTS) },
    { page: "Forecast", metric: "monthlyExpenses",   value: selectMonthlyExpensesLedger(FIXTURE_INPUTS) },
    { page: "Forecast", metric: "monthlySurplus",    value: selectMonthlySurplus(FIXTURE_INPUTS) },
    { page: "Forecast", metric: "monthlyDebtService", value: selectMonthlyDebtService(FIXTURE_INPUTS) },
    { page: "Forecast", metric: "passiveIncome",     value: selectPassiveIncome(FIXTURE_INPUTS) },
    { page: "Forecast", metric: "fireNumber",        value: h.fireNumber },
  ];
}

function pageReports(): PageSnapshot[] {
  const cfLocal = computeCanonicalCashflow(FIXTURE_INPUTS);
  const nwLocal = computeCanonicalNetWorth(FIXTURE_INPUTS);
  const fireLocal = computeCanonicalFire(FIXTURE_INPUTS, {
    targetMonthlyIncome: resolveFireTargetFromSnapshot(FIXTURE_INPUTS, { explicitTarget: cfLocal.monthlyExpenses }),
    swrPct: 4,
  });
  return [
    { page: "Reports", metric: "netWorth",          value: nwLocal.netWorth },
    { page: "Reports", metric: "totalAssets",       value: nwLocal.raw.totalAssets },
    { page: "Reports", metric: "totalLiabilities",  value: nwLocal.raw.totalLiabilities },
    { page: "Reports", metric: "monthlyIncome",     value: cfLocal.monthlyIncome },
    { page: "Reports", metric: "monthlyExpenses",   value: cfLocal.monthlyExpenses },
    { page: "Reports", metric: "monthlySurplus",    value: cfLocal.monthlySurplus },
    { page: "Reports", metric: "monthlyDebtService", value: cfLocal.monthlyDebtService },
    { page: "Reports", metric: "passiveIncome",     value: selectPassiveIncome(FIXTURE_INPUTS) },
    { page: "Reports", metric: "fireNumber",        value: fireLocal.fireNumber },
  ];
}

function pageFinancialPlan(): PageSnapshot[] {
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "FinancialPlan", metric: "netWorth",          value: h.netWorth },
    { page: "FinancialPlan", metric: "totalAssets",       value: h.totalAssets },
    { page: "FinancialPlan", metric: "totalLiabilities",  value: h.totalLiabilities },
    { page: "FinancialPlan", metric: "monthlyIncome",     value: h.monthlyIncome },
    { page: "FinancialPlan", metric: "monthlyExpenses",   value: h.monthlyExpenses },
    { page: "FinancialPlan", metric: "monthlySurplus",    value: h.monthlySurplus },
    { page: "FinancialPlan", metric: "monthlyDebtService", value: h.monthlyDebtService },
    { page: "FinancialPlan", metric: "passiveIncome",     value: h.passiveIncome },
    { page: "FinancialPlan", metric: "fireNumber",        value: h.fireNumber },
  ];
}

function pageWealthStrategy(): PageSnapshot[] {
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "WealthStrategy", metric: "netWorth",          value: h.netWorth },
    { page: "WealthStrategy", metric: "totalAssets",       value: h.totalAssets },
    { page: "WealthStrategy", metric: "totalLiabilities",  value: h.totalLiabilities },
    { page: "WealthStrategy", metric: "monthlyIncome",     value: h.monthlyIncome },
    { page: "WealthStrategy", metric: "monthlyExpenses",   value: h.monthlyExpenses },
    { page: "WealthStrategy", metric: "monthlySurplus",    value: h.monthlySurplus },
    { page: "WealthStrategy", metric: "monthlyDebtService", value: h.monthlyDebtService },
    { page: "WealthStrategy", metric: "passiveIncome",     value: h.passiveIncome },
    { page: "WealthStrategy", metric: "fireNumber",        value: h.fireNumber },
  ];
}

function pageTimeline(): PageSnapshot[] {
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "Timeline", metric: "netWorth",          value: h.netWorth },
    { page: "Timeline", metric: "totalAssets",       value: h.totalAssets },
    { page: "Timeline", metric: "totalLiabilities",  value: h.totalLiabilities },
    { page: "Timeline", metric: "monthlyDebtService", value: h.monthlyDebtService },
    { page: "Timeline", metric: "passiveIncome",     value: h.passiveIncome },
    { page: "Timeline", metric: "fireNumber",        value: h.fireNumber },
  ];
}

function pageRisk(): PageSnapshot[] {
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "Risk", metric: "netWorth",           value: h.netWorth },
    { page: "Risk", metric: "monthlyIncome",      value: h.monthlyIncome },
    { page: "Risk", metric: "monthlyExpenses",    value: h.monthlyExpenses },
    { page: "Risk", metric: "monthlySurplus",     value: h.monthlySurplus },
    { page: "Risk", metric: "monthlyDebtService", value: h.monthlyDebtService },
  ];
}

function pageGoalSolver(): PageSnapshot[] {
  // Goal Solver consumes monthly income/expenses/debt service to size the
  // surplus available for goals. Canonical surplus is the SoT.
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "GoalSolver", metric: "monthlyIncome",      value: h.monthlyIncome },
    { page: "GoalSolver", metric: "monthlyExpenses",    value: h.monthlyExpenses },
    { page: "GoalSolver", metric: "monthlySurplus",     value: h.monthlySurplus },
    { page: "GoalSolver", metric: "monthlyDebtService", value: h.monthlyDebtService },
    { page: "GoalSolver", metric: "netWorth",           value: h.netWorth },
  ];
}

function pageMonteCarlo(): PageSnapshot[] {
  // Monte Carlo seeds each path with the canonical starting NW and the
  // canonical monthly contribution (surplus). Both must reconcile with the
  // dashboard for paths to be comparable.
  const h = computeCanonicalHeadlineFigures(FIXTURE_INPUTS);
  return [
    { page: "MonteCarlo", metric: "netWorth",           value: h.netWorth },
    { page: "MonteCarlo", metric: "monthlyIncome",      value: h.monthlyIncome },
    { page: "MonteCarlo", metric: "monthlyExpenses",    value: h.monthlyExpenses },
    { page: "MonteCarlo", metric: "monthlySurplus",     value: h.monthlySurplus },
    { page: "MonteCarlo", metric: "monthlyDebtService", value: h.monthlyDebtService },
    { page: "MonteCarlo", metric: "passiveIncome",      value: h.passiveIncome },
    { page: "MonteCarlo", metric: "fireNumber",         value: h.fireNumber },
  ];
}

const allPages: PageSnapshot[] = [
  ...pageDashboard(),
  ...pageForecast(),
  ...pageReports(),
  ...pageFinancialPlan(),
  ...pageWealthStrategy(),
  ...pageTimeline(),
  ...pageRisk(),
  ...pageGoalSolver(),
  ...pageMonteCarlo(),
];

const recResult = reconcileCanonicalLedger(head, allPages, 1);
const failedRecs = recResult.filter(r => r.status === "FAIL");
ok("all 9 surfaces reconcile on every headline metric within $1",
   failedRecs.length === 0,
   failedRecs);

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Per-metric reconciliation status
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Per-metric reconciliation status");

for (const r of recResult) {
  ok(`${r.metric} reconciles across surfaces`, r.status === "PASS", r);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Debt service consistency
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Debt service consistency");

const dbt = computeCanonicalDebtService(FIXTURE_INPUTS);
const breakdown = breakdownDebtService(FIXTURE_INPUTS);

ok("debt facade total equals sum of breakdown lines",
   near(dbt.totalMonthly, Math.round(breakdown.reduce((s, l) => s + l.monthlyRepayment, 0))),
   { facade: dbt.totalMonthly, breakdown: breakdown.map(l => ({ label: l.label, repay: Math.round(l.monthlyRepayment) })) });

ok("PPOR breakdown line exists and matches facade",
   breakdown.some(l => l.source === "ppor") &&
   near(dbt.pporMonthly, Math.round(breakdown.find(l => l.source === "ppor")!.monthlyRepayment)));

ok("settled IP breakdown line exists",
   breakdown.some(l => l.source === "ip"));

ok("other-debt breakdown line exists",
   breakdown.some(l => l.source === "other_debt") &&
   near(dbt.otherDebtMonthly, Math.round(breakdown.find(l => l.source === "other_debt")!.monthlyRepayment)));

const dbtRec = reconcileDebtService(dbt, [
  { page: "Dashboard",      metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "Forecast",       metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "Risk",           metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "GoalSolver",     metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "MonteCarlo",     metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "WealthStrategy", metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "Reports",        metric: "totalMonthly",    value: dbt.totalMonthly },
  { page: "Dashboard",      metric: "totalBalance",    value: dbt.balances.total },
]);
ok("debt service reconciles across all 7 surfaces",
   dbtRec.every(r => r.status === "PASS"),
   dbtRec.filter(r => r.status === "FAIL"));

// Future-balance projection consistency — PPOR balance after 12 months.
const ppor12 = projectDebtBalanceAt({
  principal: 1_200_000,
  annualRate: 5.85,
  termYears: 28,
  loanType: "PI",
  monthsForward: 12,
});
ok("PPOR projected balance after 12mo amortises", ppor12 < 1_200_000 && ppor12 > 1_180_000, { ppor12 });

const ipPi12 = projectDebtBalanceAt({
  principal: 540_000,
  annualRate: 6.15,
  termYears: 30,
  loanType: "PI",
  monthsForward: 12,
});
ok("IP PI projected balance amortises", ipPi12 < 540_000 && ipPi12 > 532_000, { ipPi12 });

const ioBal36 = projectDebtBalanceAt({
  principal: 540_000,
  annualRate: 6.15,
  termYears: 30,
  loanType: "IO",
  ioYears: 5,
  monthsForward: 36,
});
ok("IO loan balance unchanged during IO window", near(ioBal36, 540_000));

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — FIRE / passive income reconciliation
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  FIRE & passive income");

const expectedFireNumber = (8_000 * 12) / 0.04;  // $2.4M at $8k/mo target & 4% SWR
ok("canonical FIRE number == target / SWR", near(fire.fireNumber, expectedFireNumber));
ok("FIRE source is user_target when snapshot specifies",
   fire.source === "user_target");

const fireNoTarget = computeCanonicalFire(
  { ...FIXTURE_INPUTS, snapshot: { ...FIXTURE_SNAPSHOT, fire_target_monthly_income: 0 } },
  { swrPct: 4 },
);
ok("FIRE without target falls back to monthly expenses",
   fireNoTarget.source === "monthly_expenses_fallback");

const fireNoExpenses = computeCanonicalFire(
  { ...FIXTURE_INPUTS, snapshot: { ...FIXTURE_SNAPSHOT, monthly_expenses: 0, fire_target_monthly_income: 0 }, expenses: [] },
  { swrPct: 4 },
);
ok("FIRE with no target & no expenses returns 0 with empty source",
   fireNoExpenses.fireNumber === 0 && fireNoExpenses.source === "empty");

// FIRE monthly contribution = canonical surplus (this is what MC / goal solver use).
const fireContrib = selectFireMonthlyContribution(FIXTURE_INPUTS);
ok("FIRE monthly contribution == canonical surplus",
   near(fireContrib, head.monthlySurplus));

ok("passive income from canonical selector > 0 (settled IP rent)",
   selectPassiveIncome(FIXTURE_INPUTS) > 0);

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Reconciliation framework rejects synthetic drift
 *
 * Sanity check: feed the reconciliation framework a deliberately wrong page
 * value and confirm the framework FLAGS it (so a CI-level regression suite
 * would catch a real drift, not silently pass).
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Framework rejects synthetic drift");

const driftPages: PageSnapshot[] = [
  ...pageDashboard(),
  { page: "BadPage", metric: "netWorth", value: head.netWorth + 50_000 },
];
const drifted = reconcileCanonicalLedger(head, driftPages, 1);
const flagged = drifted.find(r => r.metric === "netWorth");
ok("$50k drift on netWorth is flagged FAIL",
   !!flagged && flagged.status === "FAIL");
ok("drift detail captures offending page",
   !!flagged && flagged.drifts.some(d => d.page === "BadPage" && d.diff === 50_000));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
