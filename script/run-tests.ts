/**
 * script/run-tests.ts — Sprint 20 PR-F1 fix-up (defect 4).
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
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

const TEST_DIRS = [
  join(REPO_ROOT, "client", "src"),
  join(REPO_ROOT, "server", "lib"),
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

let failed: string[] = [];
for (const file of selected) {
  const rel = relative(REPO_ROOT, file);
  console.log(`\n>>> ${rel}`);
  const res = spawnSync("npx", ["tsx", file], { stdio: "inherit", cwd: REPO_ROOT });
  if (res.status !== 0) failed.push(rel);
}

console.log("\n=================================================");
console.log(`  Ran:    ${selected.length}`);
console.log(`  Passed: ${selected.length - failed.length}`);
console.log(`  Failed: ${failed.length}`);
if (failed.length > 0) {
  console.log("\nFailing test files:");
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
