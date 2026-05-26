/**
 * forecastFreshness.test.ts — FWL Remediation Phase A-7.
 *
 * Unit tests for evaluateFreshness(). Run with:
 *   npx tsx client/src/lib/__tests__/forecastFreshness.test.ts
 *
 * Covers all branches: FRESH, STALE (snapshot newer than run), STALE (run
 * older than maxAgeDays), MISSING (either timestamp null).
 */

import { evaluateFreshness } from "../forecastFreshness";

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

const NOW = new Date("2026-05-26T12:00:00.000Z");
const day = (offsetDays: number): Date =>
  new Date(NOW.getTime() + offsetDays * 24 * 60 * 60 * 1000);

// ─── MISSING branches ──────────────────────────────────────────────────────
section("MISSING — runDate=null and snapshotDate=null");
{
  const out = evaluateFreshness(null, null, 7, NOW);
  check("status is MISSING", out.status === "MISSING");
  check("staleByDays is null", out.staleByDays === null);
  check("runDate is null", out.runDate === null);
  check("sourceSnapshotDate is null", out.sourceSnapshotDate === null);
}

section("MISSING — runDate=null, snapshotDate set");
{
  const out = evaluateFreshness(null, day(-1), 7, NOW);
  check("status is MISSING", out.status === "MISSING");
  check("reason mentions forecast run", out.reason.toLowerCase().includes("forecast run"));
}

section("MISSING — runDate set, snapshotDate=null");
{
  const out = evaluateFreshness(day(-1), null, 7, NOW);
  check("status is MISSING", out.status === "MISSING");
  check("reason mentions snapshot", out.reason.toLowerCase().includes("snapshot"));
}

// ─── STALE: snapshot newer than run ────────────────────────────────────────
section("STALE — snapshot newer than run");
{
  const runDate = day(-5);
  const snapDate = day(-2);
  const out = evaluateFreshness(runDate, snapDate, 7, NOW);
  check("status is STALE", out.status === "STALE");
  check("staleByDays > 0", typeof out.staleByDays === "number" && out.staleByDays! > 0);
  check(
    "reason mentions snapshot updated after run",
    out.reason.toLowerCase().includes("snapshot") && out.reason.toLowerCase().includes("after"),
  );
}

// ─── STALE: run older than maxAgeDays ──────────────────────────────────────
section("STALE — run older than maxAgeDays (default 7)");
{
  const runDate = day(-10);
  const snapDate = day(-15);
  const out = evaluateFreshness(runDate, snapDate, 7, NOW);
  check("status is STALE", out.status === "STALE");
  check("staleByDays > 0", typeof out.staleByDays === "number" && out.staleByDays! > 0);
  check(
    "reason mentions max age",
    out.reason.toLowerCase().includes("max age") || out.reason.toLowerCase().includes("old"),
  );
}

// ─── STALE: custom maxAgeDays ──────────────────────────────────────────────
section("STALE — custom maxAgeDays=3, run 5 days old");
{
  const out = evaluateFreshness(day(-5), day(-10), 3, NOW);
  check("status is STALE", out.status === "STALE");
}

// ─── FRESH ────────────────────────────────────────────────────────────────
section("FRESH — run 2 days ago, snapshot 5 days ago");
{
  const out = evaluateFreshness(day(-2), day(-5), 7, NOW);
  check("status is FRESH", out.status === "FRESH", `reason=${out.reason}`);
  check("staleByDays is null", out.staleByDays === null);
  check("runDate present", typeof out.runDate === "string");
  check("sourceSnapshotDate present", typeof out.sourceSnapshotDate === "string");
}

// ─── FRESH at boundary ────────────────────────────────────────────────────
section("FRESH — run exactly 7 days old, snapshot older");
{
  const out = evaluateFreshness(day(-7), day(-10), 7, NOW);
  check("status is FRESH (exactly at boundary)", out.status === "FRESH");
}

// ─── STALE just past boundary ─────────────────────────────────────────────
section("STALE — run 8 days old, snapshot older");
{
  const out = evaluateFreshness(day(-8), day(-10), 7, NOW);
  check("status is STALE (1 day past boundary)", out.status === "STALE");
}

// ─── Invalid Date handling ────────────────────────────────────────────────
section("MISSING — invalid Date object");
{
  const invalid = new Date("not-a-date");
  const out = evaluateFreshness(invalid, day(-1), 7, NOW);
  check("status is MISSING for invalid run date", out.status === "MISSING");
}

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
