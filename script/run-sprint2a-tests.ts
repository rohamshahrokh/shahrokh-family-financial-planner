/**
 * Sprint 2A test runner — runs every Sprint 2A regression test file
 * sequentially via tsx; any non-zero exit code fails the runner.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);

const SCRIPTS = [
  "test-other-debts-in-dti.ts",
  "test-sprint2a-tax-integrity.ts",
  "test-sprint2a-borrowing-consistency.ts",
  "test-sprint2a-monte-carlo-stability.ts",
  "test-sprint2a-forecast-integrity.ts",
  "test-sprint2a-wealth-plan-audit.ts",
  "test-sprint2a-risk-integrity.ts",
];

let totalFail = 0;
for (const s of SCRIPTS) {
  console.log(`\n── ${s} ──────────────────────────────────────────────────────`);
  const res = spawnSync("npx", ["tsx", path.join(here, s)], { stdio: "inherit" });
  if (res.status !== 0) totalFail++;
}

if (totalFail > 0) {
  console.error(`\n✗ sprint-2a: ${totalFail} test file(s) failed`);
  process.exit(1);
}
console.log(`\n✓ sprint-2a: all ${SCRIPTS.length} test files passed`);
