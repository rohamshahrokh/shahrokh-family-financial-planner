/**
 * tpoLabelDistinct.test.ts — Sprint 20 PR-F2 F1.1 P1.
 *
 * Asserts that the TruePortfolioOptimizer's search-constraint label is
 * DISTINCT from the canonical "Target FIRE year" SignalTile copy used in
 * Wealth Strategy / Financial Plan. The TPO field is a search-bound, NOT
 * a canonical FIRE goal editor; calling them the same thing confuses
 * users about where to actually set their goal.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const TPO_PATH = join(REPO_ROOT, "client", "src", "components", "TruePortfolioOptimizer.tsx");
const FINANCIAL_PLAN_PATH = join(REPO_ROOT, "client", "src", "pages", "financial-plan.tsx");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n── TPO field label is renamed away from 'Target FIRE Year' ──");
{
  const src = readFileSync(TPO_PATH, "utf8");
  const hasOldLabel = /label=\s*['"]Target FIRE Year['"]/.test(src);
  check(
    "TruePortfolioOptimizer no longer uses label=\"Target FIRE Year\"",
    !hasOldLabel,
    "old constraint label still present",
  );
  const hasNewLabel = /Optimization horizon \(FIRE year\)/.test(src);
  check(
    "TruePortfolioOptimizer uses 'Optimization horizon (FIRE year)' label",
    hasNewLabel,
  );
  const hasHint = /This is the year the optimizer targets/.test(src);
  check(
    "TruePortfolioOptimizer surfaces the disambiguation hint",
    hasHint,
  );
}

console.log("\n── Canonical 'Target FIRE year' copy still lives on Financial Plan ──");
{
  const src = readFileSync(FINANCIAL_PLAN_PATH, "utf8");
  const hasCanonical = /label=\s*['"]Target FIRE year['"]/.test(src);
  check(
    "financial-plan.tsx still uses canonical 'Target FIRE year' label (lowercase 'year')",
    hasCanonical,
  );
}

console.log("\n── Labels are distinguishable strings ──");
{
  const tpoLabel = "Optimization horizon (FIRE year)";
  const canonical = "Target FIRE year";
  check("TPO and canonical labels are different strings", tpoLabel !== canonical);
  check("TPO label is not a substring of canonical", !canonical.includes(tpoLabel));
  check("Canonical is not a substring of TPO label", !tpoLabel.includes(canonical));
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
