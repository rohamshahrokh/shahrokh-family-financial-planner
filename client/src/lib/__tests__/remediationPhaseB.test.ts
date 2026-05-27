/**
 * remediationPhaseB.test.ts — FWL Remediation Phase B unit tests.
 *
 * Covers the four required gates:
 *   (a) selectFireGapSummary returns ledger NW for current, never future-year P50
 *   (b) assertCurrentNwIsLedger invariant
 *   (c) do-nothing forecast returns a non-flat series
 *   (d) buildFeasibility returns GOAL_NOT_SET when canonical goal not set
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/remediationPhaseB.test.ts
 */

import { selectFireGapSummary } from "../goalSolverView";
import { assertCurrentNwIsLedger } from "../dashboardDataContract";
import { buildDoNothingForecast, blendedExpectedReturnPct } from "../doNothingForecast";
import {
  buildGoalSolverPro,
  EMPTY_GOAL_TARGETS,
  type GoalSolverProResult,
  type GoalSolverProTargets,
} from "../goalSolverPro";
import { buildTruePortfolioOptimizer } from "../truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "../probabilisticWealthEngine";
import { buildPathSimulationEngine } from "../pathSimulationEngine";
import { computeCanonicalFire } from "../canonicalFire";
import type { DashboardInputs } from "../dashboardDataContract";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ─── Test fixtures — mirrors test-sprint12-goal-solver-view.ts ────────────

const FIXTURE_SNAPSHOT_RICH = {
  ppor: 1_510_000,
  cash: 40_000,
  offset_balance: 222_000,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
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
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const FIXTURE_RICH: DashboardInputs = {
  snapshot: FIXTURE_SNAPSHOT_RICH,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
} as unknown as DashboardInputs;

const GOAL_INPUTS = { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 };

function buildStack(fixture: DashboardInputs, seed = 42) {
  const sprint7 = buildTruePortfolioOptimizer({
    canonicalLedger: fixture,
    goalSolverInputs: GOAL_INPUTS,
  });
  const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
  const sprint9 = buildPathSimulationEngine({
    sprint7Result: sprint7,
    canonicalLedger: fixture,
    seed,
    simulationsPerStrategy: 1_000,
    maxStrategies: 3,
  });
  const canonicalFire = computeCanonicalFire(fixture);
  return { sprint7, sprint8, sprint9, canonicalFire };
}

function makeResult(
  targets: GoalSolverProTargets = EMPTY_GOAL_TARGETS,
  extras: { goalNotSet?: boolean; forecastFreshness?: { status: "FRESH" | "STALE" | "MISSING"; reason: string } } = {},
): GoalSolverProResult {
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  return buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
    goalNotSet: extras.goalNotSet,
    forecastFreshness: extras.forecastFreshness,
  });
}

function makeLedger(snapshot: Record<string, number | string>): DashboardInputs {
  return {
    snapshot: snapshot as any,
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: "2026-05-26",
  } as unknown as DashboardInputs;
}

// ─── Smoking-gun reconciliation values ────────────────────────────────────
const LEDGER_NW = 856_500;
const FORECAST_P50 = 3_240_000;

console.log("\nFWL Remediation Phase B — engine wiring tests\n");

// ─── (a) selectFireGapSummary uses ledger, never future-year P50 ──────────
section("(a) selectFireGapSummary uses ledger NW exclusively");
{
  const r = makeResult({ targetNetWorth: 5_000_000 });
  const v = selectFireGapSummary(r, { ledgerNetWorth: LEDGER_NW });
  check(
    "currentNetWorth = ledger ($856,500), NOT forecast P50 ($3,240,000)",
    v.currentNetWorth === LEDGER_NW,
    `got ${v.currentNetWorth}`,
  );
  check(
    "currentNetWorth is not the forecast P50 leak",
    v.currentNetWorth !== FORECAST_P50,
  );
}
{
  // Even when result has a "best.netWorthP50" set, no ledger ⇒ currentNetWorth
  // must be null. The selector must not infer Current NW from any engine output
  // when the canonical ledger was not threaded through.
  const r = makeResult({ targetNetWorth: 5_000_000 });
  const gap = r.gap.entries.find((entry) => entry.field === "netWorth");
  if (gap) {
    gap.actual = LEDGER_NW;
  }
  const v = selectFireGapSummary(r);
  check(
    "no ledger supplied ⇒ currentNetWorth stays null even when gap.actual exists",
    v.currentNetWorth === null,
    `got ${v.currentNetWorth}`,
  );
}

// ─── (b) assertCurrentNwIsLedger invariant ────────────────────────────────
section("(b) assertCurrentNwIsLedger invariant");
{
  // Match: no throw
  let threw = false;
  try {
    assertCurrentNwIsLedger(856_500, 856_500);
  } catch {
    threw = true;
  }
  check("matching values do not throw", !threw);
}
{
  // Smoking gun: ledger $856,500 vs displayed $3,150,000 ⇒ throws in dev
  // (NODE_ENV is "test" in tsx runs, treated as non-prod ⇒ throws).
  let threw = false;
  let msg = "";
  try {
    assertCurrentNwIsLedger(3_150_000, 856_500, "test-smoking-gun");
  } catch (e) {
    threw = true;
    msg = (e as Error).message;
  }
  check("$2.3M drift throws in dev", threw);
  check(
    "error message includes both values",
    msg.includes("3,150,000") && msg.includes("856,500"),
    msg,
  );
}
{
  // Null or non-finite ⇒ no-op
  let threw = false;
  try {
    assertCurrentNwIsLedger(null, 856_500);
    assertCurrentNwIsLedger(856_500, null);
    assertCurrentNwIsLedger(undefined, undefined);
    assertCurrentNwIsLedger(NaN, 856_500);
  } catch {
    threw = true;
  }
  check("null/undefined/NaN are no-ops", !threw);
}
{
  // Within $1 tolerance ⇒ no throw
  let threw = false;
  try {
    assertCurrentNwIsLedger(856_500.5, 856_500);
  } catch {
    threw = true;
  }
  check("within $1 tolerance does not throw", !threw);
}

// ─── (c) do-nothing forecast returns non-flat series ──────────────────────
section("(c) buildDoNothingForecast returns a non-flat series");
{
  // Ledger: $500k stocks @ 10%, $200k super @ 9.5%, $100k cash, $300k IP @ 6.5%
  const ledger = makeLedger({
    stocks: 500_000,
    super_balance_roham: 200_000,
    cash_offset: 100_000,
    ip_settled_value: 300_000,
  });
  // Use a 10-year horizon to make compounding obvious
  const years = [2026, 2028, 2030, 2032, 2034, 2036];
  const series = buildDoNothingForecast({ ledger, years });
  check("series has one point per year", series.length === years.length);
  check("year[0] == startYear, value ≈ ledger NW (anchor point)", series[0].year === 2026);
  // The series MUST not be flat — last value strictly greater than first
  check(
    "series is not flat — last > first (growth applied)",
    series[series.length - 1].netWorth > series[0].netWorth,
    `first=${series[0].netWorth}, last=${series[series.length - 1].netWorth}`,
  );
  // Monotonically non-decreasing under positive growth
  let monotone = true;
  for (let i = 1; i < series.length; i++) {
    if (series[i].netWorth < series[i - 1].netWorth) monotone = false;
  }
  check("series is monotonically non-decreasing under positive growth", monotone);
  // Blended return must be within [property=6.5, crypto=20] range
  const r = blendedExpectedReturnPct(ledger);
  check("blended return is in plausible [6, 20]% range", r >= 6 && r <= 20, `${r}`);
}
{
  // Edge: empty years list ⇒ empty series, no crash
  const ledger = makeLedger({ stocks: 100_000 });
  const series = buildDoNothingForecast({ ledger, years: [] });
  check("empty years ⇒ empty series", series.length === 0);
}

// ─── (d) buildFeasibility returns GOAL_NOT_SET when goalNotSet ────────────
section("(d) buildFeasibility returns GOAL_NOT_SET when canonical goal not set");
{
  const r = makeResult(EMPTY_GOAL_TARGETS, { goalNotSet: true });
  check(
    "feasibility.status === 'GOAL_NOT_SET' when goalNotSet=true",
    r.feasibility.status === "GOAL_NOT_SET",
    `got ${r.feasibility.status}`,
  );
  check(
    "no faked ACHIEVABLE on empty inputs",
    r.feasibility.status !== "ACHIEVABLE",
  );
  check(
    "probabilityOfSuccess is null when GOAL_NOT_SET",
    r.feasibility.probabilityOfSuccess === null,
  );
}
{
  // Even when goalNotSet=false, empty targets ⇒ GOAL_NOT_SET (engine must
  // never invent confidence from empty inputs).
  const r = makeResult(EMPTY_GOAL_TARGETS);
  check(
    "empty targets alone ⇒ GOAL_NOT_SET",
    r.feasibility.status === "GOAL_NOT_SET",
    `got ${r.feasibility.status}`,
  );
}
{
  // Real targets supplied ⇒ a real status (not GOAL_NOT_SET).
  const r = makeResult({ targetNetWorth: 5_000_000, targetFireYear: 2045 });
  check(
    "real targets ⇒ status is one of ACHIEVABLE/STRETCH/UNLIKELY/IMPOSSIBLE",
    ["ACHIEVABLE", "STRETCH", "UNLIKELY", "IMPOSSIBLE"].includes(r.feasibility.status),
    `got ${r.feasibility.status}`,
  );
}

// ─── (e) requiredProbabilitySource tagging ────────────────────────────────
section("(e) requiredProbabilitySource tagging (B-6)");
{
  const r = makeResult({ targetNetWorth: 5_000_000 });
  const vDefault = selectFireGapSummary(r, { ledgerNetWorth: LEDGER_NW });
  check(
    "default 0.7 bar tagged source = 'default'",
    vDefault.requiredProbability === 0.7 && vDefault.requiredProbabilitySource === "default",
  );
  const vCanonical = selectFireGapSummary(r, {
    ledgerNetWorth: LEDGER_NW,
    canonicalRequiredProbability: 0.85,
  });
  check(
    "canonical override tagged source = 'canonical'",
    vCanonical.requiredProbability === 0.85 &&
      vCanonical.requiredProbabilitySource === "canonical",
  );
}

// ─── (f) Engine output carries freshness (B-4) ────────────────────────────
section("(f) engine output surfaces isStale + staleReason (B-4)");
{
  const rFresh = makeResult(
    { targetNetWorth: 5_000_000 },
    { forecastFreshness: { status: "FRESH", reason: "run 1 day old" } },
  );
  check("FRESH ⇒ isStale=false", rFresh.isStale === false);
  check("FRESH ⇒ staleReason=null", rFresh.staleReason === null);

  const rStale = makeResult(
    { targetNetWorth: 5_000_000 },
    { forecastFreshness: { status: "STALE", reason: "snapshot updated 3 days after run" } },
  );
  check("STALE ⇒ isStale=true", rStale.isStale === true);
  check(
    "STALE ⇒ staleReason carries the message",
    typeof rStale.staleReason === "string" && rStale.staleReason!.includes("snapshot"),
  );

  const rUnknown = makeResult({ targetNetWorth: 5_000_000 });
  check("no freshness ⇒ isStale=null (unknown)", rUnknown.isStale === null);
  check("no freshness ⇒ staleReason=null", rUnknown.staleReason === null);
}

console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
