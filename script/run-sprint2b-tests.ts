/**
 * Sprint 2B test runner — runs every Sprint 2B regression test file
 * sequentially via tsx; any non-zero exit code fails the runner.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);

const SCRIPTS = [
  "test-sprint2b-household-hem.ts",
  "test-sprint2b-wage-shock.ts",
  "test-sprint2b-survival-forced-sale.ts",
  "test-sprint2b-goal-solver.ts",
];

let totalFail = 0;
for (const s of SCRIPTS) {
  console.log(`\n── ${s} ──────────────────────────────────────────────────────`);
  const res = spawnSync("npx", ["tsx", path.join(here, s)], { stdio: "inherit" });
  if (res.status !== 0) totalFail++;
}

if (totalFail > 0) {
  console.error(`\n✗ sprint-2b: ${totalFail} test file(s) failed`);
  process.exit(1);
}
console.log(`\n✓ sprint-2b: all ${SCRIPTS.length} test files passed`);
