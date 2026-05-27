/**
 * selectCanonicalFire.test.ts — Sprint 15 Phase 2.
 *
 * Asserts the canonical FIRE selector wired through `useCanonicalGoal()`:
 *
 *   (a) NOT_SET branch    → all derived figures zeroed; swrSource/targetSource = "absent";
 *                           goalSet=false; reason surfaces.
 *   (b) SET branch        → mc_fire_settings.swrPct + targetPassiveMonthly win
 *                           over snapshot.fire_target_monthly_income (the SQLite-20k bug).
 *   (c) Math equivalence  → SET branch produces identical math to a manual
 *                           computeCanonicalFire(ledger, {swrPct, targetMonthlyIncome}) call.
 *   (d) No-goal fallback  → preserves legacy precedence (back-compat for lib
 *                           transitive callers not yet threaded).
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/selectCanonicalFire.test.ts
 */

import { computeCanonicalFire, selectCanonicalFire } from "../canonicalFire";
import type { CanonicalGoal } from "../useCanonicalGoal";
import type { DashboardInputs } from "../dashboardDataContract";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `  --  ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n-- ${title} --`);
}

// ─── Fixture: ledger carries the SQLite-20k hazard ─────────────────────────
// snapshot.fire_target_monthly_income = 20_000 is exactly the SQLite DEFAULT
// the audit identified. The user-set goal below uses 8_000 / 5% — so any
// "user goal wins" assertion must demonstrate the resolved targetMonthly is
// 8_000, NOT 20_000.

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
    fire_target_monthly_income: 20_000, // ← SQLite default hazard
  } as any,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-27",
} as unknown as DashboardInputs;

const GOAL_NOT_SET: CanonicalGoal = {
  status: "NOT_SET",
  reason: "mc_fire_settings.goals_set is false",
};

const GOAL_SET: CanonicalGoal = {
  status: "SET",
  targetFireAge: 55,
  targetPassiveMonthly: 8_000,
  swrPct: 5,
  targetPassiveAnnual: 96_000,
  targetNetWorth: 1_920_000, // 96_000 / 0.05
  goalSetTimestamp: "2026-05-01T00:00:00.000Z",
  source: "mc_fire_settings",
};

console.log("\nSprint 15 Phase 2 — selectCanonicalFire selector tests\n");

// ─── (1) NOT_SET branch ────────────────────────────────────────────────────
section("(1) NOT_SET branch returns structured empty");
{
  const out = selectCanonicalFire(LEDGER_FIXTURE, GOAL_NOT_SET);
  check("goalSet === false", out.goalSet === false);
  check(
    "swrSource === 'absent' (no silent 4% fallback)",
    out.swrSource === "absent",
    `got ${out.swrSource}`,
  );
  check(
    "targetSource === 'absent' (no silent snapshot 20k bleed)",
    out.targetSource === "absent",
    `got ${out.targetSource}`,
  );
  check("fireNumber === 0", out.fireNumber === 0);
  check("targetMonthlyIncome === 0", out.targetMonthlyIncome === 0);
  check("targetAnnualIncome === 0", out.targetAnnualIncome === 0);
  check("gap === 0", out.gap === 0);
  check("progressFraction === 0", out.progressFraction === 0);
  check("swrPct === 0 (not 4)", out.swrPct === 0);
  check(
    "reason surfaces ('mc_fire_settings.goals_set is false')",
    typeof out.reason === "string" && out.reason.includes("goals_set"),
    `got ${JSON.stringify(out.reason)}`,
  );
  check(
    "netWorthNow still computed (ledger NW is independent of goal)",
    out.netWorthNow > 0,
    `got ${out.netWorthNow}`,
  );
  check(
    "monthlyExpenses still computed (independent of goal)",
    out.monthlyExpenses === 15_000,
    `got ${out.monthlyExpenses}`,
  );
}

// ─── (2) SET branch — user goal overrides snapshot SQLite hazard ───────────
section("(2) SET branch — user mc_fire_settings overrides snapshot 20k");
{
  const out = selectCanonicalFire(LEDGER_FIXTURE, GOAL_SET);
  check("goalSet === true", out.goalSet === true);
  check(
    "swrSource === 'user'",
    out.swrSource === "user",
    `got ${out.swrSource}`,
  );
  check(
    "targetSource === 'mc_fire_settings'",
    out.targetSource === "mc_fire_settings",
    `got ${out.targetSource}`,
  );
  check(
    "swrPct === 5 (user-set, NOT 4% default)",
    out.swrPct === 5,
    `got ${out.swrPct}`,
  );
  check(
    "targetMonthlyIncome === 8000 (user-set, NOT 20000 snapshot)",
    out.targetMonthlyIncome === 8_000,
    `got ${out.targetMonthlyIncome}`,
  );
  check(
    "targetAnnualIncome === 96000",
    out.targetAnnualIncome === 96_000,
    `got ${out.targetAnnualIncome}`,
  );
  check(
    "fireNumber === 1920000 (96000 / 0.05)",
    out.fireNumber === 1_920_000,
    `got ${out.fireNumber}`,
  );
  check(
    "goalSetTimestamp surfaces from mc_fire_settings",
    out.goalSetTimestamp === "2026-05-01T00:00:00.000Z",
  );
  check("reason === null (goal is SET)", out.reason === null);
}

// ─── (3) Math equivalence vs manual computeCanonicalFire call ──────────────
section("(3) Math equivalence — SET branch matches manual computeCanonicalFire");
{
  const selected = selectCanonicalFire(LEDGER_FIXTURE, GOAL_SET);
  const manual = computeCanonicalFire(LEDGER_FIXTURE, {
    swrPct: GOAL_SET.status === "SET" ? GOAL_SET.swrPct : 0,
    targetMonthlyIncome:
      GOAL_SET.status === "SET" ? GOAL_SET.targetPassiveMonthly : 0,
  });
  check("fireNumber match", selected.fireNumber === manual.fireNumber);
  check("gap match", selected.gap === manual.gap);
  check(
    "progressFraction match",
    selected.progressFraction === manual.progressFraction,
  );
  check("swrPct match", selected.swrPct === manual.swrPct);
  check(
    "targetMonthlyIncome match",
    selected.targetMonthlyIncome === manual.targetMonthlyIncome,
  );
  check("netWorthNow match", selected.netWorthNow === manual.netWorthNow);
  check(
    "passiveCoverage match",
    selected.passiveCoverage === manual.passiveCoverage,
  );
}

// ─── (4) No-goal fallback — preserves legacy precedence ─────────────────────
section("(4) No-goal fallback (lib transitive call) — legacy precedence preserved");
{
  // Calling without a goal argument should NOT break — it must fall through
  // to legacy computeCanonicalFire so in-flight pipelines (canonicalLedger,
  // decisionCandidates, etc.) keep working until they are individually
  // threaded with goal context. The result should be flagged with
  // swrSource: "default" so audit consumers can detect the fallback.
  const out = selectCanonicalFire(LEDGER_FIXTURE, undefined);
  const legacy = computeCanonicalFire(LEDGER_FIXTURE);
  check("fireNumber matches legacy", out.fireNumber === legacy.fireNumber);
  check("swrPct === 4 (legacy default)", out.swrPct === 4);
  check(
    "swrSource === 'default' (audit-visible fallback flag)",
    out.swrSource === "default",
    `got ${out.swrSource}`,
  );
  check(
    "targetSource flagged as 'snapshot-legacy' (snapshot 20k read)",
    out.targetSource === "snapshot-legacy",
    `got ${out.targetSource}`,
  );
  check("goalSet === false in fallback", out.goalSet === false);
  check(
    "reason explains fallback",
    typeof out.reason === "string" && out.reason.includes("legacy"),
    `got ${JSON.stringify(out.reason)}`,
  );
}

// ─── (5) Snapshot-20k bleed regression guard ────────────────────────────────
section("(5) Snapshot 20k bleed regression guard — SET branch cannot leak");
{
  // Build a ledger where snapshot.fire_target_monthly_income = 20000 but the
  // user-set goal target is 5000. selectCanonicalFire(SET) must resolve to
  // 5000, never 20000. This is the exact regression the audit identified.
  const out = selectCanonicalFire(LEDGER_FIXTURE, {
    status: "SET",
    targetFireAge: 60,
    targetPassiveMonthly: 5_000,
    swrPct: 4,
    targetPassiveAnnual: 60_000,
    targetNetWorth: 1_500_000,
    goalSetTimestamp: "2026-05-15T00:00:00.000Z",
    source: "mc_fire_settings",
  });
  check(
    "targetMonthlyIncome === 5000 (NOT 20000 from snapshot)",
    out.targetMonthlyIncome === 5_000,
    `got ${out.targetMonthlyIncome}`,
  );
  check(
    "fireNumber === 1500000 (60000 / 0.04, NOT 240000 / 0.04 = 6_000_000)",
    out.fireNumber === 1_500_000,
    `got ${out.fireNumber}`,
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n-- Summary --`);
console.log(`  pass: ${pass}`);
console.log(`  fail: ${fail}`);
if (fail > 0) {
  process.exit(1);
}
