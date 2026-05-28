/**
 * canonicalFireRunMigrationIdempotence.test.ts — Sprint 20 PR-F1 polish.
 *
 * Exercises the TOP-LEVEL `runFireGoalMigration` entry point with:
 *   1. Idempotence — second call is a no-op, writeCanonical fires at most once.
 *   2. Corrupted input — null/undefined/missing/wrong-typed/out-of-range
 *      legacy values do NOT throw and resolve to a safe canonical default.
 *   3. Partial legacy input idempotence — only 1 of the 3 legacy fields set;
 *      migration derives the missing fields from defaults and stays idempotent
 *      on a second invocation.
 *
 * Existing `synthesiseCanonicalFireTarget` / `toCanonicalFireTarget` tests
 * cover the pure synthesis path. This file covers the runner's flag /
 * writer side-effects that the synthesis tests do not exercise directly.
 */

import { runFireGoalMigration } from "../fireGoalCanonical.migration";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

type WriteBody = {
  target_fire_age: number;
  target_passive_monthly: number;
  swr_pct: number;
  goals_set: true;
  goal_set_timestamp: string;
};

function makeHarness() {
  let flag: string | null = null;
  let writeCount = 0;
  const writes: WriteBody[] = [];
  const flagWrites: string[] = [];
  return {
    readFlag: () => flag,
    writeFlag: (iso: string) => { flag = iso; flagWrites.push(iso); },
    writeCanonical: async (body: WriteBody) => { writeCount++; writes.push(body); },
    getFlag: () => flag,
    getWriteCount: () => writeCount,
    getWrites: () => writes,
    getFlagWrites: () => flagWrites,
  };
}

console.log("\n── runFireGoalMigration: idempotence (full legacy input) ──");
{
  const h = makeHarness();
  const source = {
    snapshot: { target_fire_age: 55, target_passive_monthly: 9000, swr_pct: 4 },
    currentAge: 41,
  };
  const r1 = await runFireGoalMigration({
    source,
    readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
    log: () => undefined,
  });
  check("first call migrated=true", r1.migrated === true);
  check("first call writeCanonical fired once", h.getWriteCount() === 1);
  check("first call flag written", h.getFlag() !== null);

  const r2 = await runFireGoalMigration({
    source,
    readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
    log: () => undefined,
  });
  check("second call migrated=false (no-op)", r2.migrated === false);
  check("second call marked skipped=true", (r2 as { skipped?: true }).skipped === true);
  check("writeCanonical NOT called twice", h.getWriteCount() === 1);
  check("flag write happened at most once", h.getFlagWrites().length === 1);
}

console.log("\n── runFireGoalMigration: corrupted input ─ null ──");
{
  const h = makeHarness();
  let threw = false;
  let result: { migrated: boolean } | null = null;
  try {
    result = await runFireGoalMigration({
      source: null as unknown as Parameters<typeof runFireGoalMigration>[0]["source"],
      readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
      log: () => undefined,
    });
  } catch { threw = true; }
  check("null source did not throw", !threw);
  check("null source resolved to migrated=false", result?.migrated === false);
  check("writeCanonical NOT called on null", h.getWriteCount() === 0);
}

console.log("\n── runFireGoalMigration: corrupted input ─ undefined ──");
{
  const h = makeHarness();
  let threw = false;
  let result: { migrated: boolean } | null = null;
  try {
    result = await runFireGoalMigration({
      source: undefined as unknown as Parameters<typeof runFireGoalMigration>[0]["source"],
      readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
      log: () => undefined,
    });
  } catch { threw = true; }
  check("undefined source did not throw", !threw);
  check("undefined source resolved to migrated=false", result?.migrated === false);
  check("writeCanonical NOT called on undefined", h.getWriteCount() === 0);
}

console.log("\n── runFireGoalMigration: corrupted input ─ all 3 legacy fields absent ──");
{
  const h = makeHarness();
  let threw = false;
  let result: { migrated: boolean } | null = null;
  try {
    result = await runFireGoalMigration({
      source: { snapshot: {}, legacyStore: {}, currentAge: 40 },
      readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
      log: () => undefined,
    });
  } catch { threw = true; }
  check("empty legacy did not throw", !threw);
  check("empty legacy → migrated=false", result?.migrated === false);
  check("writeCanonical NOT called when nothing to migrate", h.getWriteCount() === 0);
  check("flag still written so re-runs skip", h.getFlag() !== null);
}

console.log("\n── runFireGoalMigration: corrupted input ─ wrong-typed legacy fields ──");
{
  const h = makeHarness();
  let threw = false;
  let result: { migrated: boolean } | null = null;
  try {
    result = await runFireGoalMigration({
      source: {
        snapshot: {
          target_fire_age: "forty" as unknown as number,
          target_passive_monthly: { value: 9000 } as unknown as number,
          swr_pct: null,
        },
        currentAge: 41,
      },
      readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
      log: () => undefined,
    });
  } catch { threw = true; }
  check("wrong-typed legacy did not throw", !threw);
  check(
    "wrong-typed legacy → migrated=false (no usable fields)",
    result?.migrated === false,
  );
  check("writeCanonical NOT called for unusable legacy", h.getWriteCount() === 0);
}

console.log("\n── runFireGoalMigration: corrupted input ─ negative / out-of-range ──");
{
  const h = makeHarness();
  let threw = false;
  let result: { migrated: boolean } | null = null;
  try {
    result = await runFireGoalMigration({
      source: {
        snapshot: {
          target_fire_age: -10,
          target_passive_monthly: -500,
          swr_pct: -2,
        },
        currentAge: 41,
      },
      readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
      log: () => undefined,
    });
  } catch { threw = true; }
  check("negative legacy did not throw", !threw);
  check(
    "negative legacy → migrated=false (positive-only filter)",
    result?.migrated === false,
  );
  check("writeCanonical NOT called for negative legacy", h.getWriteCount() === 0);
}

console.log("\n── runFireGoalMigration: partial legacy input + idempotence ──");
{
  const h = makeHarness();
  // Only the legacy age is present; income and SWR are absent.
  const source = {
    snapshot: { target_fire_age: 55 },
    currentAge: 40,
  };
  const r1 = await runFireGoalMigration({
    source,
    readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
    log: () => undefined,
  });
  check("partial legacy migrated=true (one usable field)", r1.migrated === true);
  check("partial legacy writeCanonical fired once", h.getWriteCount() === 1);
  if (h.getWrites().length > 0) {
    const w = h.getWrites()[0];
    check(
      "partial legacy persisted age 55",
      w.target_fire_age === 55,
    );
    check(
      "partial legacy synthesised income default 0",
      w.target_passive_monthly === 0,
    );
    check(
      "partial legacy synthesised SWR default 4",
      w.swr_pct === 4,
    );
  }

  // Re-running with the flag set must be a no-op.
  const r2 = await runFireGoalMigration({
    source,
    readFlag: h.readFlag, writeFlag: h.writeFlag, writeCanonical: h.writeCanonical,
    log: () => undefined,
  });
  check("partial legacy second call skipped", r2.migrated === false && (r2 as { skipped?: true }).skipped === true);
  check("partial legacy writeCanonical NOT called twice", h.getWriteCount() === 1);
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
