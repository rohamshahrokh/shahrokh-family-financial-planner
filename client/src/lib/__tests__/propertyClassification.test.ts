/**
 * propertyClassification.test.ts — Sprint 20 PR-F2.
 *
 * Verifies PPOR vs investment classification, lifecycle (settled vs planned)
 * detection, and the canonical leverage formula on the demo household.
 */

import {
  classifyProperty,
  classifyProperties,
  propertyLeverage,
  propertyLeverageBreakdown,
  selectSettledProperties,
  totalPropertyLoans,
  totalPropertyValue,
} from "../property";
import { DEMO_PROPERTIES } from "../demoData";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Pin "today" before IP1's 2027-03-01 purchase_date so the lifecycle test
// matches the spec invariant (IP1 is planned, not settled).
const TODAY = new Date("2026-05-28T00:00:00Z");

console.log("\n── PPOR vs investment kind discriminator ──");
{
  const ppor = classifyProperty({ id: 1, type: "ppor", current_value: 1_200_000, loan_amount: 850_000 }, TODAY);
  check("PPOR row → kind=ppor", ppor.kind === "ppor");
  check("PPOR equity = value − loan", ppor.equity === 1_200_000 - 850_000);

  const ip = classifyProperty({ id: 2, type: "investment", current_value: 700_000, loan_amount: 560_000 }, TODAY);
  check("investment row → kind=investment", ip.kind === "investment");
  check("investment equity = 140k", ip.equity === 140_000);

  const unknown = classifyProperty({ id: 3, current_value: 500_000, loan_amount: 0 }, TODAY);
  check("missing type defaults to investment", unknown.kind === "investment");
}

console.log("\n── Lifecycle: settled vs planned ──");
{
  const settled = classifyProperty({ id: 1, purchase_date: "2019-06-15", type: "ppor" }, TODAY);
  check("past purchase_date → settled", settled.lifecycle === "settled");

  const planned = classifyProperty({ id: 2, purchase_date: "2027-03-01", type: "investment" }, TODAY);
  check("future purchase_date → planned", planned.lifecycle === "planned");

  const noDate = classifyProperty({ id: 3, type: "ppor" }, TODAY);
  check("missing purchase_date → settled (defensive)", noDate.lifecycle === "settled");
}

console.log("\n── Demo household — PPOR vs IP1 classification ──");
{
  const classified = classifyProperties(DEMO_PROPERTIES, TODAY);
  check("demo has 2 properties", classified.length === 2);

  const ppor = classified.find(p => p.name?.startsWith("PPOR"));
  const ip = classified.find(p => p.name?.startsWith("IP1"));
  check("demo PPOR found", !!ppor, "missing PPOR row");
  check("demo IP1 found", !!ip, "missing IP1 row");
  if (ppor) {
    check("demo PPOR kind=ppor", ppor.kind === "ppor");
    check("demo PPOR lifecycle=settled", ppor.lifecycle === "settled");
    check("demo PPOR value 1,200,000", ppor.currentValue === 1_200_000);
    check("demo PPOR loan 850,000", ppor.loanBalance === 850_000);
  }
  if (ip) {
    check("demo IP1 kind=investment", ip.kind === "investment");
    check("demo IP1 lifecycle=planned (purchase 2027-03-01)", ip.lifecycle === "planned");
  }
}

console.log("\n── Demo household — settled-only selectors ──");
{
  const classified = classifyProperties(DEMO_PROPERTIES, TODAY);
  const settled = selectSettledProperties(classified);
  check("settled-only contains PPOR only", settled.length === 1);
  check("settled-only first is PPOR", settled[0].kind === "ppor");
  check("totalPropertyLoans (settled-only) = 850,000", totalPropertyLoans(classified) === 850_000);
  check("totalPropertyValue (settled-only) = 1,200,000", totalPropertyValue(classified) === 1_200_000);
}

console.log("\n── Demo household — propertyLeverage ──");
{
  const classified = classifyProperties(DEMO_PROPERTIES, TODAY);
  const lev = propertyLeverage(classified);
  // Documented formula: total_property_loans / total_property_value over
  // settled-only properties. Demo: 850,000 / 1,200,000 = 0.70833...
  // This is the deterministic, auditable output of the formula. The
  // spec-author asserted a target of 0.58 as a "preserve" invariant, but
  // the spec's stated formula on the demo data gives 0.7083. We honor
  // the formula because the formula is what's testable; the spec's 0.58
  // is documented in the PR description as the gap.
  const expected = 850_000 / 1_200_000;
  check(
    `leverage = 850000/1200000 = ${expected.toFixed(4)} (got ${lev.toFixed(4)})`,
    Math.abs(lev - expected) < 1e-9,
  );

  const bd = propertyLeverageBreakdown(classified);
  check("breakdown.totalLoans = 850,000", bd.totalLoans === 850_000);
  check("breakdown.totalValue = 1,200,000", bd.totalValue === 1_200_000);
  check("breakdown.leverage matches scalar", bd.leverage === lev);
}

console.log("\n── Leverage = 0 when no settled property ──");
{
  const onlyPlanned = classifyProperties(
    [{ id: 1, type: "investment", purchase_date: "2030-01-01", current_value: 800_000, loan_amount: 600_000 }],
    TODAY,
  );
  check("propertyLeverage on planned-only = 0", propertyLeverage(onlyPlanned) === 0);
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
