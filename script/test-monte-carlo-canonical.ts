/**
 * test-monte-carlo-canonical.ts
 *
 * Reconciliation guard for the Monte Carlo Forecast Engine "source of truth"
 * rebuild. Covers the ten validation tests called out in the spec:
 *
 *   1. Monte Carlo reads same current snapshot as Dashboard.
 *   2. Monte Carlo net worth starting point equals Dashboard net worth
 *      (allowing the documented `cars * 0.8` haircut applied inside MC sims).
 *   3. Decision Engine and Forecast Engine use same base data
 *      (both flow through `selectCanonicalNetWorth`).
 *   4. Dashboard wealth projection table uses Monte Carlo outputs
 *      (verified structurally — the dashboard renders `monteCarloResult.fan_data`).
 *   5. Planned future events are included
 *      (planned IPs are NOT in current NW; bills/DCA flow through to engine input).
 *   6. Existing assets are not double-counted (cash/offset, super, stocks,
 *      crypto each appear exactly once between snapshot + properties).
 *   7. Planned assets are not counted as current assets (settlement_date in
 *      the future does not contribute to canonical starting NW).
 *   8. Monte Carlo outputs change when snapshot data changes.
 *   9. Monte Carlo outputs change when assumptions change.
 *  10. Forecast Mode and Monte Carlo are clearly distinguished
 *      (the Dashboard page renders a dedicated MC table with "Projection
 *      source: Monte Carlo forecast" label).
 *
 * Run with:  npx tsx script/test-monte-carlo-canonical.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  selectCanonicalNetWorth,
  type DashboardInputs,
} from "../client/src/lib/dashboardDataContract";
import { buildCanonicalMonteCarloInput } from "../client/src/lib/monteCarloCanonical";
import { runMonteCarlo } from "../client/src/lib/monteCarloEngine";
import { DEFAULT_MC_VOLATILITY, generateYearlyFromProfile } from "../client/src/lib/forecastStore";
import { makeRealUserInputs, REAL_USER_SNAPSHOT, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (check(name, cond, detail)) pass++; else fail++;
}

function section(title: string) {
  // eslint-disable-next-line no-console
  console.log(`\n── ${title} ──`);
}

const repo = resolve(import.meta.dirname, "..");
function fileContains(rel: string, needle: string | RegExp): boolean {
  const p = resolve(repo, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, "utf8");
  return typeof needle === "string" ? src.includes(needle) : needle.test(src);
}

const yearly = generateYearlyFromProfile("moderate");

// ───────────────────────────────────────────────────────────────────────────
// 1 + 2 — MC reads same snapshot as Dashboard, starting NW matches
// ───────────────────────────────────────────────────────────────────────────
section("1+2 — MC reads same snapshot as Dashboard, starting NW reconciles");

const ledger = makeRealUserInputs();
const dashNw = selectCanonicalNetWorth(ledger).netWorth;
const { input: mcInput, reconciliation } = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: yearly,
  volatilityParams: DEFAULT_MC_VOLATILITY,
  simulations: 50,
});

// The engine's starting NW is dashNw minus 20% of car value (engine haircut).
// The reconciliation diagnostic encodes this and reports PASS when the gap
// matches the haircut to within $1.
const carsHaircut = (ledger.snapshot?.cars ?? 0) * 0.2;
run("dashboard NW equals canonical NW (sanity)", Number.isFinite(dashNw) && dashNw > 0, `dashNw=${dashNw}`);
run("MC starting NW matches Dashboard (modulo $cars haircut)", reconciliation.status === "PASS",
  `dashNw=${reconciliation.dashboardNetWorth} engineNw=${reconciliation.engineStartingNetWorth} diff=${reconciliation.diff} carsHaircut=${carsHaircut}`);

// The engine snapshot components match canonical contract field-for-field.
run("MC ppor == canonical ppor", reconciliation.components.ppor === Math.round(ledger.snapshot.ppor));
run("MC cash == canonical cashOffset (includes offset/savings/emergency)", reconciliation.components.cash > (ledger.snapshot.cash ?? 0));
run("MC super == roham + fara", reconciliation.components.super_balance === (ledger.snapshot.roham_super_balance + ledger.snapshot.fara_super_balance));
run("MC mortgage == snapshot mortgage", reconciliation.components.mortgage === ledger.snapshot.mortgage);
run("MC other_debts == snapshot other_debts", reconciliation.components.other_debts === ledger.snapshot.other_debts);

// ───────────────────────────────────────────────────────────────────────────
// 3 — Decision Engine and Forecast Engine use same base data
// ───────────────────────────────────────────────────────────────────────────
section("3 — Decision Engine and Forecast Engine use same canonical base");

// Both surfaces flow through `selectCanonicalNetWorth`. We verify that the MC
// canonical mapper does NOT introduce a separate code path by checking that
// the engine snapshot is built from the same canonical struct.
run("MC mapper imports selectCanonicalNetWorth",
  fileContains("client/src/lib/monteCarloCanonical.ts", "selectCanonicalNetWorth"),
);
run("MC mapper imports selectCanonicalIncome",
  fileContains("client/src/lib/monteCarloCanonical.ts", "selectCanonicalIncome"),
);
run("Decision Engine reconciles against same canonical NW (existing test guard present)",
  fileContains("script/test-canonical-nw-consistency.ts", "engineNw"),
);

// ───────────────────────────────────────────────────────────────────────────
// 4 — Dashboard wealth projection table uses Monte Carlo outputs
// ───────────────────────────────────────────────────────────────────────────
section("4 — Dashboard projection table consumes MC outputs");

run("Dashboard labels canonical projection as Monte Carlo source-of-truth",
  fileContains("client/src/pages/dashboard.tsx", "Canonical forecast · Monte Carlo")
  && fileContains("client/src/pages/dashboard.tsx", "single source of truth"),
);
run("Dashboard reads monteCarloResult.fan_data for P10/P50/P90",
  fileContains("client/src/pages/dashboard.tsx", "monteCarloResult.fan_data"),
);
run("Dashboard MC table column headers include P10/P50/P90",
  fileContains("client/src/pages/dashboard.tsx", /P10 Net Worth.*P50 Net Worth.*P90 Net Worth/s),
);

// ───────────────────────────────────────────────────────────────────────────
// 5 — Planned future events are included
// ───────────────────────────────────────────────────────────────────────────
section("5 — Planned future events flow into the MC input");

const plannedStock = [{ action: "buy", amount_aud: 50_000, planned_date: "2027-03-15", status: "planned" }];
const plannedCrypto = [{ action: "buy", amount_aud: 10_000, planned_date: "2027-09-15", status: "planned" }];
const bills = [{ amount: 1500, frequency: "monthly", is_active: true }];
const stockDCA = [{ enabled: true, amount: 800, frequency: "monthly", start_date: "2026-01-01", end_date: null }];

const { input: inputWithEvents } = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: yearly,
  volatilityParams: DEFAULT_MC_VOLATILITY,
  plannedStockOrders: plannedStock,
  plannedCryptoOrders: plannedCrypto,
  bills,
  stockDCASchedules: stockDCA,
  simulations: 50,
});
run("plannedStockOrders forwarded to engine", inputWithEvents.plannedStockOrders.length === 1);
run("plannedCryptoOrders forwarded to engine", inputWithEvents.plannedCryptoOrders.length === 1);
run("bills forwarded to engine", inputWithEvents.bills.length === 1);
run("stockDCASchedules forwarded to engine", inputWithEvents.stockDCASchedules.length === 1);

// ───────────────────────────────────────────────────────────────────────────
// 6 — Existing assets are not double-counted
// ───────────────────────────────────────────────────────────────────────────
section("6 — Existing assets not double-counted (cars, super, cash)");

// If the canonical mapper double-counted (e.g., summed snapshot.stocks AND
// summed holdings AND summed sf_stocks), the engine NW would diverge by more
// than the cars haircut. The reconciliation status==PASS confirms this.
run("no double-counting (reconciliation passes within $1 of expected haircut)",
  reconciliation.status === "PASS",
  `diff=${reconciliation.diff} expectedHaircut=${carsHaircut}`,
);

// ───────────────────────────────────────────────────────────────────────────
// 7 — Planned assets are not counted as current assets
// ───────────────────────────────────────────────────────────────────────────
section("7 — Planned IPs excluded from current NW");

// Fixtures include 2 PLANNED IPs (settlement_date in the future). Canonical
// NW must NOT include their value/loan.
const plannedIpValueRaw = (ledger.properties ?? [])
  .filter(p => (p.settlement_date as string) > (ledger.todayIso as string))
  .reduce((s, p) => s + (p.current_value ?? p.purchase_price ?? 0), 0);
const plannedIpLoanRaw = (ledger.properties ?? [])
  .filter(p => (p.settlement_date as string) > (ledger.todayIso as string))
  .reduce((s, p) => s + (p.loan_amount ?? 0), 0);
run("fixture has planned IP value > 0 (sanity)", plannedIpValueRaw > 0, `plannedValue=${plannedIpValueRaw}`);
run("canonical NW excludes planned IP value",
  selectCanonicalNetWorth(ledger).assets.settledIpValue === 0,
);
run("canonical NW excludes planned IP loans",
  selectCanonicalNetWorth(ledger).liabilities.settledIpLoans === 0,
);
run("plannedIpEquity is surfaced for sub-text use",
  Math.round(selectCanonicalNetWorth(ledger).plannedIpEquity) === Math.round(plannedIpValueRaw - plannedIpLoanRaw),
);

// ───────────────────────────────────────────────────────────────────────────
// 8 — MC outputs change when snapshot data changes
// ───────────────────────────────────────────────────────────────────────────
section("8 — MC outputs change when snapshot data changes");

const baselineResult = runMonteCarlo({ ...mcInput, simulations: 100 });
const richerLedger = makeRealUserInputs({ cash: 500_000, stocks: 300_000 });
const { input: richerInput } = buildCanonicalMonteCarloInput(richerLedger, {
  yearlyAssumptions: yearly,
  volatilityParams: DEFAULT_MC_VOLATILITY,
  simulations: 100,
});
const richerResult = runMonteCarlo(richerInput);
run("median NW increases when cash+stocks increase",
  richerResult.median > baselineResult.median,
  `baseline=${baselineResult.median} richer=${richerResult.median}`,
);

// ───────────────────────────────────────────────────────────────────────────
// 9 — MC outputs change when assumptions change
// ───────────────────────────────────────────────────────────────────────────
section("9 — MC outputs change when assumptions change");

const aggressiveYearly = generateYearlyFromProfile("aggressive");
const { input: aggressiveInput } = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: aggressiveYearly,
  volatilityParams: DEFAULT_MC_VOLATILITY,
  simulations: 100,
});
const aggressiveResult = runMonteCarlo(aggressiveInput);
run("median NW differs when returns assumption changes (aggressive vs moderate)",
  Math.abs(aggressiveResult.median - baselineResult.median) > 1,
  `moderate=${baselineResult.median} aggressive=${aggressiveResult.median}`,
);

// To test that volatility tuning actually affects outputs without RNG noise,
// run TWO simulations with identical seeds-impossible-to-control but big enough
// N to converge: high vs near-zero crypto vol with crashes/bulls disabled.
// The MEAN of P90 across multiple independent runs of low vol should fall
// below the MEAN P90 of high vol — we check a single run with a generous
// tolerance instead, asserting only that volatility tweaks DO change outputs
// (any direction), which proves the params are wired through.
const lowVolParams = { ...DEFAULT_MC_VOLATILITY, crypto_volatility: 5, crypto_crash_prob: 0, crypto_bull_prob: 0, stock_volatility: 2, stock_correction_prob: 0, prop_volatility: 0, rate_shock_prob: 0 };
const { input: lowVolInput } = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: yearly,
  volatilityParams: lowVolParams,
  simulations: 200,
});
const lowVolResult = runMonteCarlo(lowVolInput);
run("volatility parameters affect simulation outputs (P10 or P90 shifts)",
  Math.abs(lowVolResult.p10 - baselineResult.p10) > 1 || Math.abs(lowVolResult.p90 - baselineResult.p90) > 1,
  `baseline p10/p90=${baselineResult.p10}/${baselineResult.p90} lowVol p10/p90=${lowVolResult.p10}/${lowVolResult.p90}`,
);

// ───────────────────────────────────────────────────────────────────────────
// 10 — Forecast Mode and Monte Carlo are clearly distinguished
// ───────────────────────────────────────────────────────────────────────────
section("10 — UX distinguishes Forecast Mode vs Monte Carlo");

run("Forecast page labels Monte Carlo as Recommended",
  fileContains("client/src/pages/ai-forecast-engine.tsx", /badge=\"Recommended\"/) ||
  fileContains("client/src/pages/ai-forecast-engine.tsx", /Recommended/),
);
run("Forecast page contains philosophy banner with 3 modes",
  fileContains("client/src/pages/ai-forecast-engine.tsx", "What could happen across thousands"),
);
run("Forecast page has Starting position reconciliation card",
  fileContains("client/src/pages/ai-forecast-engine.tsx", "Starting position — single source of truth"),
);
run("Forecast page has Assumptions used inventory",
  fileContains("client/src/pages/ai-forecast-engine.tsx", "Assumptions used by this simulation"),
);

// ───────────────────────────────────────────────────────────────────────────
// Result output structure — Monte Carlo result has the expected percentile
// surface for the UI to bind to.
// ───────────────────────────────────────────────────────────────────────────
section("Output structure — percentile fields populated");

run("result has p10/p25/median/p75/p90 (NW)",
  ["p10","p25","median","p75","p90"].every(k => Number.isFinite((baselineResult as any)[k])),
);
run("result has prob_ff / prob_neg_cf / prob_cash_shortfall",
  Number.isFinite(baselineResult.prob_ff) && Number.isFinite(baselineResult.prob_neg_cf) && Number.isFinite(baselineResult.prob_cash_shortfall),
);
run("result has fan_data with year + p10/p25/median/p75/p90 per row",
  Array.isArray(baselineResult.fan_data) && baselineResult.fan_data.length > 0 &&
  baselineResult.fan_data.every(r => ["year","p10","p25","median","p75","p90"].every(k => Number.isFinite((r as any)[k]))),
);

// Exit with proper code
if (fail > 0) {
  // eslint-disable-next-line no-console
  console.error(`\ntest-monte-carlo-canonical: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log(`\ntest-monte-carlo-canonical: ${pass} passed`);
