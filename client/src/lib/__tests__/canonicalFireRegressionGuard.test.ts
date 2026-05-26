/**
 * canonicalFireRegressionGuard.test.ts — PR #88 review item #2.
 *
 * Regression guard for KI-2 ("Effective SWR = 4% despite user-set 7%").
 *
 * Invariant under test:
 *   When the canonical goal status is "NOT_SET", no downstream Goal Solver /
 *   FIRE output may surface a numeric SWR as if the user had set one. The
 *   feasibility status MUST be "GOAL_NOT_SET" — never "ACHIEVABLE" — and any
 *   SWR carried alongside must be flagged as default/system, not user-set.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/canonicalFireRegressionGuard.test.ts
 *
 * This test exists because Phase A introduced the canonical goal selector
 * (`useCanonicalGoal`) but the legacy `computeCanonicalFire` still bakes a
 * hardcoded `?? 4` SWR fallback (canonicalFire.ts L90, L105). Without this
 * guard, a future caller could silently reintroduce the bug by passing
 * `computeCanonicalFire(ledger)` (no opts) into `buildGoalSolverPro` while
 * `canonicalGoal.status === "NOT_SET"`.
 *
 * Methodology: feeds the engine an empty ledger and EMPTY_GOAL_TARGETS, with
 * goalNotSet=true, then asserts:
 *   (1) feasibility.status === "GOAL_NOT_SET"
 *   (2) feasibility.probabilityOfSuccess === null
 *   (3) feasibility.audit.howCalculated mentions "NOT_SET" — i.e. the engine
 *       traced the decision to the canonical-goal status, not to a
 *       hardcoded-default-SWR path
 *   (4) the canonicalFire passed into the engine carries the default 4% SWR
 *       (the hazard) — but the engine MUST NOT promote it to the user.
 */

import {
  buildGoalSolverPro,
  EMPTY_GOAL_TARGETS,
  type GoalSolverProResult,
} from "../goalSolverPro";
import { buildTruePortfolioOptimizer } from "../truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "../probabilisticWealthEngine";
import { buildPathSimulationEngine } from "../pathSimulationEngine";
import { computeCanonicalFire } from "../canonicalFire";
import { deriveCanonicalGoal, type CanonicalGoal } from "../../../../server/lib/canonicalGoal";
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

// ─── Fixtures ──────────────────────────────────────────────────────────────

const LEDGER_FIXTURE: DashboardInputs = {
  snapshot: {
    ppor: 1_510_000,
    cash: 40_000,
    super_balance: 88_000,
    stocks: 0,
    crypto: 0,
    cars: 65_000,
    iran_property: 150_000,
    mortgage: 1_200_000,
    other_debts: 19_000,
    roham_monthly_income: 15_466.67,
    fara_monthly_income: 15_166.67,
    monthly_expenses: 15_000,
    rental_income_total: 0,
  } as any,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-26",
} as unknown as DashboardInputs;

function buildStack(fixture: DashboardInputs, seed = 42) {
  const sprint7 = buildTruePortfolioOptimizer({
    canonicalLedger: fixture,
    goalSolverInputs: { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 },
  });
  const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
  const sprint9 = buildPathSimulationEngine({
    sprint7Result: sprint7,
    canonicalLedger: fixture,
    seed,
    simulationsPerStrategy: 500,
    maxStrategies: 2,
  });
  return { sprint7, sprint8, sprint9 };
}

console.log("\nPR #88 — canonical-fire regression guard (KI-2)\n");

// ─── (1) deriveCanonicalGoal: NOT_SET shape ────────────────────────────────
section("(1) deriveCanonicalGoal returns NOT_SET when goals_set=false");
{
  const goal: CanonicalGoal = deriveCanonicalGoal({
    id: "test",
    goals_set: false,
    swr_pct: 4,
    target_fire_age: 55,
    target_passive_monthly: 20_000,
  });
  check(
    "goals_set=false ⇒ status NOT_SET (even with all other fields populated)",
    goal.status === "NOT_SET",
    `got ${goal.status}`,
  );
  if (goal.status === "NOT_SET") {
    check(
      "NOT_SET shape has no swrPct surface (cannot be misread as user-set)",
      !("swrPct" in goal),
    );
  }
}
{
  const goal: CanonicalGoal = deriveCanonicalGoal(null);
  check("null row ⇒ NOT_SET", goal.status === "NOT_SET");
}

// ─── (2) buildGoalSolverPro under goalNotSet=true ──────────────────────────
section("(2) buildGoalSolverPro produces GOAL_NOT_SET, not ACHIEVABLE");
{
  const { sprint7, sprint8, sprint9 } = buildStack(LEDGER_FIXTURE);
  // canonicalFire here carries the deprecated 4% default SWR — that's the
  // hazard the engine must NOT promote to the user when goalNotSet=true.
  const canonicalFire = computeCanonicalFire(LEDGER_FIXTURE);
  check(
    "fixture canonicalFire.swrPct === 4 (the hazard the test guards against)",
    canonicalFire.swrPct === 4,
    `got swrPct=${canonicalFire.swrPct}`,
  );

  const result: GoalSolverProResult = buildGoalSolverPro({
    canonicalLedger: LEDGER_FIXTURE,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: EMPTY_GOAL_TARGETS,
    goalNotSet: true,
  });

  check(
    "feasibility.status === 'GOAL_NOT_SET' (not ACHIEVABLE) — KI-2 regression guard",
    result.feasibility.status === "GOAL_NOT_SET",
    `got ${result.feasibility.status}`,
  );
  check(
    "feasibility.status is NEVER 'ACHIEVABLE' under goalNotSet=true",
    result.feasibility.status !== "ACHIEVABLE",
  );
  check(
    "feasibility.probabilityOfSuccess === null (no forged confidence)",
    result.feasibility.probabilityOfSuccess === null,
  );
  check(
    "audit traces the decision to canonical-goal NOT_SET, not to a default SWR path",
    typeof result.feasibility.audit?.howCalculated === "string" &&
      /not_set|not set/i.test(result.feasibility.audit.howCalculated),
    result.feasibility.audit?.howCalculated,
  );
}

// ─── (3) deriveCanonicalGoal → computeCanonicalFire(opts:NONE) → engine ────
section("(3) end-to-end: NOT_SET goal does not flow numeric SWR as user-set");
{
  // Simulate what would happen if a future caller fetched the canonical goal,
  // saw NOT_SET, but still called computeCanonicalFire(ledger) without
  // threading opts.swrPct. The engine must still surface GOAL_NOT_SET.
  const goal = deriveCanonicalGoal({ goals_set: false });
  check("goal.status === NOT_SET", goal.status === "NOT_SET");

  const { sprint7, sprint8, sprint9 } = buildStack(LEDGER_FIXTURE);
  const canonicalFire = computeCanonicalFire(LEDGER_FIXTURE); // no opts ⇒ swrPct=4

  const result = buildGoalSolverPro({
    canonicalLedger: LEDGER_FIXTURE,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: EMPTY_GOAL_TARGETS,
    goalNotSet: goal.status === "NOT_SET",
  });

  check(
    "downstream feasibility = GOAL_NOT_SET when canonicalGoal is NOT_SET",
    result.feasibility.status === "GOAL_NOT_SET",
    `got ${result.feasibility.status}`,
  );
}

// ─── (4) explicit anti-ACHIEVABLE assertion under NOT_SET ─────────────────
section("(4) explicit anti-regression: empty targets + NOT_SET ⇒ never ACHIEVABLE");
{
  const { sprint7, sprint8, sprint9 } = buildStack(LEDGER_FIXTURE);
  const canonicalFire = computeCanonicalFire(LEDGER_FIXTURE);

  // The smoking gun would be: goalNotSet=true + empty targets producing
  // ACHIEVABLE with the default-4% SWR baked into canonicalFire. If this test
  // ever fails, KI-2 has regressed.
  const result = buildGoalSolverPro({
    canonicalLedger: LEDGER_FIXTURE,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: EMPTY_GOAL_TARGETS,
    goalNotSet: true,
  });

  check(
    "regression guard: status is not one of {ACHIEVABLE,STRETCH,UNLIKELY,IMPOSSIBLE}",
    !["ACHIEVABLE", "STRETCH", "UNLIKELY", "IMPOSSIBLE"].includes(
      result.feasibility.status,
    ),
    `got ${result.feasibility.status}`,
  );
}

console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
