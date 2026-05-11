/**
 * Audit Priority-1 test runner.
 *
 * Runs every `test-*.ts` deliverable from the audit fix spec sequentially
 * via tsx; any non-zero exit code fails the runner.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);

const SCRIPTS = [
  "test-nw-reconciliation.ts",
  "test-canonical-income.ts",
  "test-cars-included.ts",
  "test-overseas-included.ts",
  "test-other-debts-included.ts",
  "test-holdings-reconcile.ts",
  "test-planned-not-current.ts",
  "test-assumptions-panel.ts",
  "test-pdf-no-broken-chars.ts",
  // P0-1/P0-2/P0-4 trust-UX additions
  "test-canonical-nw-consistency.ts",
  "test-canonical-cashflow.ts",
  "test-no-unicode-escapes.ts",
];

let totalFail = 0;
for (const s of SCRIPTS) {
  console.log(`\n── ${s} ──────────────────────────────────────────────────────`);
  const res = spawnSync("npx", ["tsx", path.join(here, s)], { stdio: "inherit" });
  if (res.status !== 0) totalFail++;
}

if (totalFail > 0) {
  console.error(`\n✗ audit-p1: ${totalFail} test file(s) failed`);
  process.exit(1);
}
console.log(`\n✓ audit-p1: all ${SCRIPTS.length} test files passed`);
