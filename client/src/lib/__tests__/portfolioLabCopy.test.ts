/**
 * portfolioLabCopy.test.ts — Sprint 15.2 hotfix regression guard.
 *
 * Guards the /portfolio-lab scenario copy from surfacing literal `(NaN)` or
 * `undefined` when upstream projection values are missing.
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/portfolioLabCopy.test.ts
 */

import { buildTruePortfolioOptimizer, type TruePortfolioOptimizerResult } from "../truePortfolioOptimizer";
import type { DashboardInputs } from "../dashboardDataContract";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}${detail ? "  --  " + detail : ""}`);
  }
}

function fullLedger(): DashboardInputs {
  return {
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
    } as any,
  } as any;
}

function zeroLedger(): DashboardInputs {
  return {
    snapshot: {
      ppor: 0, cash: 0, super_balance: 0, stocks: 0, crypto: 0,
      cars: 0, iran_property: 0, mortgage: 0, other_debts: 0,
      roham_monthly_income: 0, fara_monthly_income: 0,
      monthly_expenses: 0, rental_income_total: 0,
    } as any,
  } as any;
}

function collectActionabilityText(result: TruePortfolioOptimizerResult): string {
  const parts: string[] = [];
  for (const s of result.scenarios ?? []) {
    const a = s.actionability;
    if (!a) continue;
    parts.push(a.what ?? "", a.when ?? "", a.why ?? "", a.doNothing ?? "");
  }
  return parts.join("\n");
}

function assertCleanCopy(label: string, result: TruePortfolioOptimizerResult): void {
  const text = collectActionabilityText(result);
  check(`${label}: no literal (NaN)`, !text.includes("(NaN)"), text.slice(0, 200));
  check(`${label}: no literal undefined`, !text.includes("undefined"), text.slice(0, 200));
  check(`${label}: no literal NaN token`, !/\bNaN\b/.test(text), text.slice(0, 200));
}

// Shape 1: full ledger
const r1 = buildTruePortfolioOptimizer({ canonicalLedger: fullLedger() });
assertCleanCopy("full ledger", r1);

// Shape 2: missing projection (null ledger triggers empty path)
const r2 = buildTruePortfolioOptimizer({ canonicalLedger: null });
assertCleanCopy("missing projection (null ledger)", r2);

// Shape 3: all-zero ledger
const r3 = buildTruePortfolioOptimizer({ canonicalLedger: zeroLedger() });
assertCleanCopy("all-zero ledger", r3);

console.log(`\n-- Summary --`);
console.log(`pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
