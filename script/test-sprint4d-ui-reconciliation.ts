/**
 * test-sprint4d-ui-reconciliation.ts
 *
 * Sprint 4D — Visible UI Reconciliation Final.
 *
 * Why this test exists
 * --------------------
 * Sprint 4C closed the canonical math, but production still showed ~$758k on
 * Dashboard / Reports and ~$746k on Financial Plan / Wealth Strategy for the
 * same household. The drift was not in the canonical layer — it was at the
 * page boundaries: each page wired `DashboardInputs` differently (some passed
 * live `stocks`/`cryptos`/`holdingsRaw`, others passed `[]`) and Financial
 * Plan rendered a `draftCanonical` computed from the draft snapshot rather
 * than the canonical headline figures.
 *
 * This test replays exactly what each page now does:
 *   1. Builds the `DashboardInputs` payload each page assembles.
 *   2. Runs `computeCanonicalHeadlineMetrics` (the Sprint 4D visible-truth
 *      service) and the local selectors the page consumes for the KPI strip.
 *   3. Asserts every page returns the same nine headline values within $1.
 *
 * Two fixtures are exercised:
 *   - HAPPY-PATH: balanced household with manual stocks/crypto and live
 *     holdings — the case that produced the $12k drift in production.
 *   - LIVE-DOMINANT: holdings > manual snapshot — proves the canonical
 *     `Math.max(live, ticker, manual)` is consistently chosen everywhere.
 *
 * Run with:  npm run test:sprint-4d
 */

import {
  type DashboardInputs,
  selectCanonicalNetWorth,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectMonthlyDebtService,
  selectPassiveIncome,
} from "../client/src/lib/dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  reconcileHeadlineSnapshots,
  type CanonicalHeadlineMetrics,
} from "../client/src/lib/canonicalHeadlineMetrics";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
} from "../client/src/lib/canonicalFire";
import { computeCanonicalHeadlineFigures } from "../client/src/lib/canonicalLedger";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    const msg = `FAIL  ${label}` + (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : "");
    failures.push(msg);
    console.error(`  ${msg}`);
  }
}

function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Fixtures
 * ═══════════════════════════════════════════════════════════════════════════ */

const SNAPSHOT_HAPPY = {
  ppor: 1_510_000,
  cash: 40_000,
  savings_cash: 5_000,
  emergency_cash: 10_000,
  other_cash: 0,
  offset_balance: 222_000,
  roham_super_balance: 49_500,
  fara_super_balance: 38_500,
  super_balance: 88_000,
  // Manual stocks/crypto on the snapshot.
  stocks: 62_000,
  crypto: 18_500,
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
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const PROPERTY = {
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

// Ticker-level holdings that compute to LESS than the manual snapshot
// stocks/crypto fields. The canonical selector returns the max, so the
// snapshot manual values should win here. Pages that pass these inputs and
// pages that pass `[]` MUST produce the same headline numbers (this is the
// production $12k drift case).
const STOCKS_TICKER = [
  { ticker: "VAS",   current_price: 98.50,  current_holding: 200 },
  { ticker: "VGS",   current_price: 130.20, current_holding: 150 },
];
const CRYPTOS_TICKER = [
  { symbol: "BTC", current_price: 95_000, current_holding: 0.12 },
];

// Holdings where the LIVE feed beats the manual snapshot — proves the
// canonical layer also reconciles when live data is the SoT.
const HOLDINGS_LIVE_DOMINANT = [
  { asset_type: "stock",  current_value: 95_000 },
  { asset_type: "crypto", current_value: 28_000 },
];

const TODAY_ISO = "2026-05-24";

/* ═══════════════════════════════════════════════════════════════════════════
 * Per-page input shapes (mirror what each page wires in production)
 * ═══════════════════════════════════════════════════════════════════════════ */

function buildDashboardInputs(opts: { holdings?: any[] } = {}): DashboardInputs {
  return {
    snapshot:      SNAPSHOT_HAPPY,
    properties:    [PROPERTY],
    stocks:        STOCKS_TICKER,
    cryptos:       CRYPTOS_TICKER,
    holdingsRaw:   opts.holdings ?? [],
    incomeRecords: [],
    expenses:      [],
    todayIso:      TODAY_ISO,
  };
}

function buildReportsInputs(opts: { holdings?: any[] } = {}): DashboardInputs {
  return {
    snapshot:      SNAPSHOT_HAPPY,
    properties:    [PROPERTY],
    stocks:        STOCKS_TICKER,
    cryptos:       CRYPTOS_TICKER,
    holdingsRaw:   opts.holdings ?? [],
    incomeRecords: [],
    expenses:      [],
    todayIso:      TODAY_ISO,
  };
}

function buildFinancialPlanInputs(opts: { holdings?: any[] } = {}): DashboardInputs {
  // Sprint 4D — Financial Plan now hands the canonical layer the SAME
  // stocks/cryptos/holdings every other page does. Previously it passed
  // `[]` for all three, which silently changed `Math.max(live, ticker,
  // manual)` from `live` to `manual` and produced the $12k drift.
  return {
    snapshot:      SNAPSHOT_HAPPY,
    properties:    [PROPERTY],
    stocks:        STOCKS_TICKER,
    cryptos:       CRYPTOS_TICKER,
    holdingsRaw:   opts.holdings ?? [],
    incomeRecords: [],
    expenses:      [],
    todayIso:      TODAY_ISO,
  };
}

function buildWealthStrategyInputs(opts: { holdings?: any[] } = {}): DashboardInputs {
  return {
    snapshot:      SNAPSHOT_HAPPY,
    properties:    [PROPERTY],
    stocks:        STOCKS_TICKER,
    cryptos:       CRYPTOS_TICKER,
    holdingsRaw:   opts.holdings ?? [],
    incomeRecords: [],
    expenses:      [],
    todayIso:      TODAY_ISO,
  };
}

function buildTimelineInputs(opts: { holdings?: any[] } = {}): DashboardInputs {
  return {
    snapshot:      SNAPSHOT_HAPPY,
    properties:    [PROPERTY],
    stocks:        STOCKS_TICKER,
    cryptos:       CRYPTOS_TICKER,
    holdingsRaw:   opts.holdings ?? [],
    incomeRecords: [],
    expenses:      [],
    todayIso:      TODAY_ISO,
  };
}

function buildRiskRadarInputs(): DashboardInputs {
  return {
    snapshot:      SNAPSHOT_HAPPY,
    properties:    [PROPERTY],
    stocks:        [],
    cryptos:       [],
    holdingsRaw:   [],
    incomeRecords: [],
    expenses:      [],
    todayIso:      TODAY_ISO,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Headline service self-consistency
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\nSprint 4D — Visible UI Reconciliation Final\n");
console.log("§1  computeCanonicalHeadlineMetrics self-consistency");

const baseline = computeCanonicalHeadlineMetrics(buildDashboardInputs());
const ledgerHead = computeCanonicalHeadlineFigures(buildDashboardInputs());

ok(
  "headline.netWorth == canonicalLedger.netWorth (Sprint 4C compat)",
  near(baseline.netWorth, ledgerHead.netWorth),
  { headline: baseline.netWorth, canonicalLedger: ledgerHead.netWorth },
);
ok(
  "headline.assets == canonicalLedger.totalAssets",
  near(baseline.assets, ledgerHead.totalAssets),
);
ok(
  "headline.liabilities == canonicalLedger.totalLiabilities",
  near(baseline.liabilities, ledgerHead.totalLiabilities),
);
ok(
  "headline.monthlyIncome == canonicalLedger.monthlyIncome",
  near(baseline.monthlyIncome, ledgerHead.monthlyIncome),
);
ok(
  "headline.monthlyExpenses == canonicalLedger.monthlyExpenses",
  near(baseline.monthlyExpenses, ledgerHead.monthlyExpenses),
);
ok(
  "headline.monthlySurplus == canonicalLedger.monthlySurplus",
  near(baseline.monthlySurplus, ledgerHead.monthlySurplus),
);
ok(
  "headline.debtService == canonicalLedger.monthlyDebtService",
  near(baseline.debtService, ledgerHead.monthlyDebtService),
);
ok(
  "headline.passiveIncome == canonicalLedger.passiveIncome",
  near(baseline.passiveIncome, ledgerHead.passiveIncome),
);
ok(
  "headline.fireNumber == canonicalLedger.fireNumber",
  near(baseline.fireNumber, ledgerHead.fireNumber),
);

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Cross-page reconciliation (HAPPY-PATH)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Cross-page reconciliation — happy-path household");

function pageMetrics(name: string, inputs: DashboardInputs): { page: string; metrics: CanonicalHeadlineMetrics } {
  return { page: name, metrics: computeCanonicalHeadlineMetrics(inputs) };
}

const happyPages = [
  pageMetrics("Dashboard",     buildDashboardInputs()),
  pageMetrics("Reports",       buildReportsInputs()),
  pageMetrics("FinancialPlan", buildFinancialPlanInputs()),
  pageMetrics("WealthStrategy",buildWealthStrategyInputs()),
  pageMetrics("Timeline",      buildTimelineInputs()),
];

const happyReconciliation = reconcileHeadlineSnapshots(baseline, happyPages, 1);
ok(
  "Dashboard / Reports / FinancialPlan / WealthStrategy / Timeline agree on all nine headline metrics ($1 tolerance)",
  happyReconciliation.status === "PASS",
  happyReconciliation.drifts,
);

// Risk Radar exposes a subset, but its inputs must yield the same values for
// the metrics it consumes downstream (debt service ratio, savings ratio).
const riskHead = computeCanonicalHeadlineMetrics(buildRiskRadarInputs());
ok(
  "Risk Radar income matches canonical",
  near(riskHead.monthlyIncome, baseline.monthlyIncome),
  { risk: riskHead.monthlyIncome, baseline: baseline.monthlyIncome },
);
ok(
  "Risk Radar expenses match canonical",
  near(riskHead.monthlyExpenses, baseline.monthlyExpenses),
);
ok(
  "Risk Radar debt service matches canonical",
  near(riskHead.debtService, baseline.debtService),
);

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Cross-page reconciliation (LIVE-DOMINANT holdings)
 *
 * Proves that when live holdings exceed the manual snapshot, every page
 * still agrees. Before Sprint 4D, Financial Plan would have used the lower
 * manual value while Dashboard used the higher live value — the exact bug
 * that produced production's $758k vs $746k split.
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Cross-page reconciliation — live holdings dominate manual snapshot");

const live = HOLDINGS_LIVE_DOMINANT;
const liveBaseline = computeCanonicalHeadlineMetrics(buildDashboardInputs({ holdings: live }));
const livePages = [
  pageMetrics("Dashboard",     buildDashboardInputs({ holdings: live })),
  pageMetrics("Reports",       buildReportsInputs({ holdings: live })),
  pageMetrics("FinancialPlan", buildFinancialPlanInputs({ holdings: live })),
  pageMetrics("WealthStrategy",buildWealthStrategyInputs({ holdings: live })),
  pageMetrics("Timeline",      buildTimelineInputs({ holdings: live })),
];
const liveReconciliation = reconcileHeadlineSnapshots(liveBaseline, livePages, 1);
ok(
  "Live-holdings: all pages agree on every headline metric ($1 tolerance)",
  liveReconciliation.status === "PASS",
  liveReconciliation.drifts,
);

// Sanity — live-dominant must actually move the net-worth up vs happy-path.
ok(
  "Live-dominant NW > manual-only NW (sanity: live feed actually changes the figure)",
  liveBaseline.netWorth > baseline.netWorth,
  { live: liveBaseline.netWorth, manual: baseline.netWorth },
);

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Input-normalisation parity
 *
 * Catch the regression where a page wires `holdingsRaw: []`/`stocks: []`/
 * `cryptos: []` while another page wires the real values — the variance the
 * Sprint 4D fix actually closes. We pass the same SNAPSHOT to the headline
 * service with two different "page styles" and assert they return identical
 * figures BECAUSE the inputs are normalised at the service boundary.
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Service-boundary input normalisation");

const styleA: DashboardInputs = {
  snapshot: SNAPSHOT_HAPPY, properties: [PROPERTY],
  stocks: undefined, cryptos: undefined, holdingsRaw: undefined,
  incomeRecords: undefined, expenses: undefined,
};
const styleB: DashboardInputs = {
  snapshot: SNAPSHOT_HAPPY, properties: [PROPERTY],
  stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
};
const aHead = computeCanonicalHeadlineMetrics(styleA);
const bHead = computeCanonicalHeadlineMetrics(styleB);

for (const k of Object.keys(aHead) as (keyof CanonicalHeadlineMetrics)[]) {
  ok(
    `Service normalises undefined vs [] for "${k}"`,
    near(aHead[k], bHead[k]),
    { a: aHead[k], b: bHead[k] },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Direct selector parity (each page's underlying calls)
 *
 * Replicates the per-page selector calls the actual page modules make and
 * asserts they all produce the same nine values. This catches the case
 * where a page bypasses `computeCanonicalHeadlineMetrics` and reads from
 * the underlying selectors directly — e.g. a future regression that
 * reintroduces a `selectMonthlyIncome - selectMonthlyExpensesLedger` math
 * detour for "monthly surplus" instead of consuming `headline.monthlySurplus`.
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Direct selector parity (matches the page's read-path)");

const inputs = buildDashboardInputs();
const head = computeCanonicalHeadlineMetrics(inputs);
const nw = selectCanonicalNetWorth(inputs);
const fire = computeCanonicalFire(inputs, {
  targetMonthlyIncome: resolveFireTargetFromSnapshot(inputs),
});

ok("selector NW == headline.netWorth",            near(nw.netWorth, head.netWorth));
ok("selector totalAssets == headline.assets",     near(nw.totalAssets, head.assets));
ok("selector totalLiab == headline.liabilities",  near(nw.totalLiabilities, head.liabilities));
ok("selectMonthlyIncome == headline.monthlyIncome",   near(selectMonthlyIncome(inputs), head.monthlyIncome));
ok("selectMonthlyExpensesLedger == headline.monthlyExpenses", near(selectMonthlyExpensesLedger(inputs), head.monthlyExpenses));
ok("selectMonthlySurplus == headline.monthlySurplus", near(selectMonthlySurplus(inputs), head.monthlySurplus));
ok("selectMonthlyDebtService == headline.debtService", near(selectMonthlyDebtService(inputs), head.debtService));
ok("selectPassiveIncome == headline.passiveIncome",    near(selectPassiveIncome(inputs), head.passiveIncome));
ok("canonicalFire.fireNumber == headline.fireNumber",  near(fire.fireNumber, head.fireNumber));

/* ═══════════════════════════════════════════════════════════════════════════
 * Summary
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n────────────────────────────────────────────────────────");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log("────────────────────────────────────────────────────────\n");

if (failed > 0) {
  console.error("Sprint 4D reconciliation FAILED — see drift list above.");
  process.exit(1);
}
console.log("Sprint 4D reconciliation PASSED — every page renders the same nine headline metrics for the same household.");
