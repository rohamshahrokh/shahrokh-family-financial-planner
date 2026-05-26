/**
 * canonicalGoal.test.ts — FWL Remediation Phase A-7.
 *
 * Unit tests for the canonical FIRE-goal selector. Run with:
 *   npx tsx server/lib/__tests__/canonicalGoal.test.ts
 *
 * Tests guarantee:
 *   - goals_set=false → NOT_SET
 *   - missing swr_pct → NOT_SET
 *   - SET case derives targetNetWorth = (monthly * 12) / (swr/100)
 *   - NO hardcoded 4% SWR default leaks in
 */

import { deriveCanonicalGoal, type CanonicalGoal } from "../canonicalGoal";

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

// ─── 1. goals_set=false ─────────────────────────────────────────────────────
section("goals_set=false → NOT_SET");
{
  const row = {
    id: "shahrokh-family-main",
    goals_set: false,
    swr_pct: 7,
    target_fire_age: 50,
    target_passive_monthly: 20000,
  };
  const out = deriveCanonicalGoal(row);
  check("status is NOT_SET", out.status === "NOT_SET");
  check(
    "reason mentions goals_set",
    out.status === "NOT_SET" && out.reason.toLowerCase().includes("goals_set"),
  );
}

// ─── 2. goals_set=true, swr_pct=null → NOT_SET ──────────────────────────────
section("goals_set=true, swr_pct=null → NOT_SET");
{
  const row = {
    id: "shahrokh-family-main",
    goals_set: true,
    swr_pct: null,
    target_fire_age: 50,
    target_passive_monthly: 20000,
  };
  const out = deriveCanonicalGoal(row as any);
  check("status is NOT_SET when swr_pct=null", out.status === "NOT_SET");
}

// ─── 3. goals_set=true, swr_pct=7, target_passive_monthly=20000 ─────────────
section("SET case: swr=7, monthly=20000 → targetNetWorth = 240000/0.07 ≈ 3,428,571");
{
  const row = {
    id: "shahrokh-family-main",
    goals_set: true,
    swr_pct: 7,
    target_fire_age: 50,
    target_passive_monthly: 20000,
    goal_set_timestamp: "2026-05-26T00:00:00.000Z",
    updated_at: "2026-05-26T00:00:00.000Z",
  };
  const out = deriveCanonicalGoal(row);
  check("status is SET", out.status === "SET");
  if (out.status === "SET") {
    check("swrPct = 7", out.swrPct === 7);
    check("targetFireAge = 50", out.targetFireAge === 50);
    check("targetPassiveMonthly = 20000", out.targetPassiveMonthly === 20000);
    check("targetPassiveAnnual = 240000", out.targetPassiveAnnual === 240000);
    const expected = 240000 / 0.07;
    check(
      `targetNetWorth ≈ ${expected.toFixed(2)}`,
      Math.abs(out.targetNetWorth - expected) < 0.01,
      `got ${out.targetNetWorth}`,
    );
    check("source is mc_fire_settings", out.source === "mc_fire_settings");
  }
}

// ─── 4. goals_set=true, swr_pct=4 → SET (no hardcoded fallback) ─────────────
section("SET case: swr=4, monthly=20000 → targetNetWorth = 240000/0.04 = 6,000,000");
{
  const row = {
    id: "shahrokh-family-main",
    goals_set: true,
    swr_pct: 4,
    target_fire_age: 55,
    target_passive_monthly: 20000,
    goal_set_timestamp: "2026-05-26T00:00:00.000Z",
  };
  const out = deriveCanonicalGoal(row);
  check("status is SET (swr=4 is a legitimate user setting)", out.status === "SET");
  if (out.status === "SET") {
    check("swrPct = 4 (came from row, not hardcoded)", out.swrPct === 4);
    check(
      "targetNetWorth = 6,000,000",
      Math.abs(out.targetNetWorth - 6_000_000) < 0.01,
      `got ${out.targetNetWorth}`,
    );
  }
}

// ─── 5. null row → NOT_SET ──────────────────────────────────────────────────
section("null row → NOT_SET");
{
  const out = deriveCanonicalGoal(null);
  check("status is NOT_SET", out.status === "NOT_SET");
}

// ─── 6. swr_pct=0 → NOT_SET (no division-by-zero) ───────────────────────────
section("swr_pct=0 → NOT_SET");
{
  const row = {
    id: "shahrokh-family-main",
    goals_set: true,
    swr_pct: 0,
    target_fire_age: 50,
    target_passive_monthly: 20000,
  };
  const out = deriveCanonicalGoal(row);
  check("status is NOT_SET when swr_pct=0", out.status === "NOT_SET");
}

// ─── 7. NO hardcoded 4% SWR default leaks in ────────────────────────────────
section("NO hardcoded 4% SWR default leaks in");
{
  // If user has goals_set=true but swr_pct is missing entirely, status MUST
  // be NOT_SET — not silently SET with swr=4.
  const row = {
    id: "shahrokh-family-main",
    goals_set: true,
    target_fire_age: 50,
    target_passive_monthly: 20000,
  };
  const out = deriveCanonicalGoal(row as any);
  check("status is NOT_SET when swr_pct is undefined", out.status === "NOT_SET");
  if (out.status === "SET") {
    check("swrPct is NOT silently 4", (out as Extract<CanonicalGoal, { status: "SET" }>).swrPct !== 4);
  }
}

// ─── 8. Missing target_fire_age → NOT_SET ───────────────────────────────────
section("Missing target_fire_age → NOT_SET");
{
  const row = {
    id: "shahrokh-family-main",
    goals_set: true,
    swr_pct: 7,
    target_passive_monthly: 20000,
  };
  const out = deriveCanonicalGoal(row as any);
  check("status is NOT_SET", out.status === "NOT_SET");
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
