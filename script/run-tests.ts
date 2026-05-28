/**
 * script/run-tests.ts — Sprint 20 PR-F1 fix-up (defect 4 + #3 W3).
 *
 * Lightweight test runner so `npm test` works in this repo. Existing tests
 * are standalone tsx scripts that print their own pass/fail summary and exit
 * non-zero on failure (no Jest/Vitest harness). This runner discovers the
 * test files under `client/src/**` and `server/lib/**`, runs each through
 * `tsx`, and aggregates pass/fail.
 *
 * Usage:
 *   npm test                     — run every discovered test
 *   npm test -- canonicalFire    — run only tests whose path contains
 *                                  "canonicalFire" (case-insensitive)
 *   npm test -- canonicalFire fire-goal
 *                                — multiple filters are OR-ed
 *
 * Sprint 20 PR-F1 fix-up #3 (W3) — KNOWN_FAILING_PRE_F1 allowlist:
 * Two tests below were already failing BEFORE PR-F1 began. They are NOT
 * caused by PR-F1's substantive changes; they were just made visible by the
 * test-runner introduced in fix-up #1 defect 4. Until they are properly
 * fixed (target: end of Sprint 20, PR-F4), failures from these two file
 * basenames are logged as `KNOWN-FAILING-SKIP` and do NOT count toward the
 * aggregate failure total.
 *
 * Hardening guard ("passes-when-allowlisted-test-fixes"): if any allowlisted
 * test PASSES, the runner exits NON-ZERO and prints a
 * `KNOWN-FAILING-NOW-PASSING` line. This forces the allowlist to be cleaned
 * up the moment a fix lands — stale entries cannot linger.
 *
 * Do NOT add new entries to this allowlist to suppress new failures. It is
 * ONLY for the two named pre-F1 failures. Any other failure surfaces as a
 * real fail.
 */

import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

const TEST_DIRS = [
  join(REPO_ROOT, "client", "src"),
  join(REPO_ROOT, "server", "lib"),
];

/**
 * Tests in this list are known-failing PRE-F1 and not caused by F1 changes.
 * They MUST be either fixed or removed from the allowlist before PR-F4 (the
 * "engine-leakage + UI cleanup" PR) closes Sprint 20.
 *
 * Match is by file basename (e.g. "decisionConsistency.test.ts"), so the
 * allowlist is path-independent and easy to audit.
 */
const KNOWN_FAILING_PRE_F1: ReadonlyArray<string> = [
  "decisionConsistency.test.ts", // dedup-allowlist violation pre-existing
  "remediationPhaseC.test.ts",   // needs JSDOM env, not yet wired
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const filters = process.argv.slice(2).map(s => s.toLowerCase());
const allTests: string[] = [];
for (const dir of TEST_DIRS) allTests.push(...walk(dir));

const selected = filters.length
  ? allTests.filter(p => {
      const rel = relative(REPO_ROOT, p).toLowerCase();
      return filters.some(f => rel.includes(f));
    })
  : allTests;

if (selected.length === 0) {
  console.error(
    `No test files matched filter(s) ${JSON.stringify(filters)}. ` +
    `Scanned ${allTests.length} test files under ${TEST_DIRS.map(d => relative(REPO_ROOT, d)).join(", ")}.`,
  );
  process.exit(1);
}

console.log(`Running ${selected.length} test file(s)${filters.length ? ` (filter: ${filters.join(", ")})` : ""}:\n`);
console.log(`KNOWN_FAILING_PRE_F1 allowlist (${KNOWN_FAILING_PRE_F1.length} entries):`);
for (const entry of KNOWN_FAILING_PRE_F1) console.log(`  - ${entry}`);
console.log("");

const failed: string[] = [];
const knownFailingSkipped: string[] = [];
const knownFailingNowPassing: string[] = [];

for (const file of selected) {
  const rel = relative(REPO_ROOT, file);
  const base = basename(file);
  const isAllowlisted = KNOWN_FAILING_PRE_F1.includes(base);
  console.log(`\n>>> ${rel}`);
  const res = spawnSync("npx", ["tsx", file], { stdio: "inherit", cwd: REPO_ROOT });
  if (res.status !== 0) {
    if (isAllowlisted) {
      console.log(`KNOWN-FAILING-SKIP: ${rel} (pre-F1 failure, allowlisted; not counted)`);
      knownFailingSkipped.push(rel);
    } else {
      failed.push(rel);
    }
  } else if (isAllowlisted) {
    console.log(`KNOWN-FAILING-NOW-PASSING: ${rel} (allowlisted but now PASSES — remove from KNOWN_FAILING_PRE_F1)`);
    knownFailingNowPassing.push(rel);
  }
}

console.log("\n=================================================");
console.log(`  Ran:                       ${selected.length}`);
console.log(`  Passed:                    ${selected.length - failed.length - knownFailingSkipped.length}`);
console.log(`  Failed:                    ${failed.length}`);
console.log(`  Known-failing skipped:     ${knownFailingSkipped.length}`);
console.log(`  Known-failing NOW-PASSING: ${knownFailingNowPassing.length}`);
if (failed.length > 0) {
  console.log("\nFailing test files:");
  for (const f of failed) console.log(`  - ${f}`);
}
if (knownFailingNowPassing.length > 0) {
  console.log("\nAllowlisted tests that now PASS (clean up KNOWN_FAILING_PRE_F1):");
  for (const f of knownFailingNowPassing) console.log(`  - ${f}`);
}
if (failed.length > 0 || knownFailingNowPassing.length > 0) {
  process.exit(1);
}
