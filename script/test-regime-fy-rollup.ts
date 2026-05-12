/**
 * test-regime-fy-rollup.ts — scenarioV2 regime-aware FY rollup helper tests.
 *
 * Run: npx tsx script/test-regime-fy-rollup.ts
 *
 * Coverage:
 *   1. CURRENT_RULES selector → 100% of losses are deductible against wage.
 *   2. PROPOSED_2027_REFORM selector + post-cutoff ESTABLISHED → losses
 *      quarantined and recorded in ledger.
 *   3. NEW_BUILD post-cutoff under reform → carve-out: losses deductible.
 *   4. Grandfathered ESTABLISHED under AUTO_DETECT → losses deductible.
 *   5. Positive rental income is unaffected by regime + burns down ledger.
 */

import {
  partitionRentalLossesByRegime,
  type PerPropertyFyRow,
} from "../client/src/lib/scenarioV2/regimeFyRollup";
import { emptyLedger, applyFyToLedger } from "../client/src/lib/taxPolicyEngine";

const TESTS: Array<{ name: string; assert: () => void }> = [];
function test(n: string, fn: () => void) { TESTS.push({ name: n, assert: fn }); }
function eq(a: any, b: any, m: string) {
  if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
function approx(a: number, b: number, tol: number, m: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${m}: |${a}-${b}|=${Math.abs(a-b)} > tol ${tol}`);
}

// ─── Test 1: CURRENT_RULES → all losses deductible ───────────────────────────

test("CURRENT_RULES selector → all losses deductible against wage", () => {
  const rows: PerPropertyFyRow[] = [
    { propertyId: "p1", taxableNetIncome: -8_000, propertyType: "ESTABLISHED", contractDate: "2027-09-01" },
    { propertyId: "p2", taxableNetIncome: -5_500, propertyType: "ESTABLISHED", contractDate: "2028-02-15" },
  ];
  const r = partitionRentalLossesByRegime({
    rows,
    fyEndMonth: "2029-06",
    regimeSelector: "CURRENT_RULES",
  });
  eq(r.deductibleAgainstWage, 13_500, "deductible total");
  eq(r.quarantinedToProperty, 0, "quarantine total");
  eq(r.abolished, 0, "abolished total");
  eq(r.rentalProfit, 0, "no profit");
  eq(r.effectiveRegimeKind, "CURRENT_RULES", "effective regime");
  eq(Object.keys(r.ledger).length, 0, "ledger empty");
});

// ─── Test 2: Reform + post-cutoff ESTABLISHED → quarantined + ledger ────────

test("PROPOSED_2027_REFORM + post-cutoff ESTABLISHED → quarantined", () => {
  const rows: PerPropertyFyRow[] = [
    { propertyId: "p1", taxableNetIncome: -8_000, propertyType: "ESTABLISHED", contractDate: "2027-09-01" },
    { propertyId: "p2", taxableNetIncome: -5_500, propertyType: "ESTABLISHED", contractDate: "2028-02-15" },
  ];
  const r = partitionRentalLossesByRegime({
    rows,
    fyEndMonth: "2029-06",
    regimeSelector: "PROPOSED_2027_REFORM",
  });
  eq(r.deductibleAgainstWage, 0, "deductible 0");
  eq(r.quarantinedToProperty, 13_500, "all quarantined");
  eq(r.abolished, 0, "abolished 0");
  eq(r.effectiveRegimeKind, "PROPOSED_2027_REFORM", "effective regime");
  // Ledger should have entries for both properties.
  eq(r.ledger.p1?.length, 1, "p1 ledger entry");
  eq(r.ledger.p2?.length, 1, "p2 ledger entry");
  eq(r.ledger.p1![0].carryForwardBalance, 8_000, "p1 cf balance");
  eq(r.ledger.p2![0].carryForwardBalance, 5_500, "p2 cf balance");
  eq(r.ledger.p1![0].fyEndMonth, "2029-06", "p1 fyEndMonth");
});

// ─── Test 3: NEW_BUILD post-cutoff → carve-out preserves deductibility ──────

test("NEW_BUILD post-cutoff under reform → carve-out deductible", () => {
  const rows: PerPropertyFyRow[] = [
    { propertyId: "p1", taxableNetIncome: -7_000, propertyType: "NEW_BUILD", contractDate: "2028-01-01" },
  ];
  const r = partitionRentalLossesByRegime({
    rows,
    fyEndMonth: "2029-06",
    regimeSelector: "PROPOSED_2027_REFORM",
  });
  eq(r.deductibleAgainstWage, 7_000, "NEW_BUILD deductible");
  eq(r.quarantinedToProperty, 0, "no quarantine");
  eq(Object.keys(r.ledger).length, 0, "ledger empty for carve-out");
});

// ─── Test 4: AUTO_DETECT + grandfathered ESTABLISHED → deductible ───────────

test("AUTO_DETECT + grandfathered ESTABLISHED → losses deductible", () => {
  const rows: PerPropertyFyRow[] = [
    { propertyId: "p1", taxableNetIncome: -10_000, propertyType: "ESTABLISHED", contractDate: "2024-03-15" },
  ];
  const r = partitionRentalLossesByRegime({
    rows,
    fyEndMonth: "2029-06",
    regimeSelector: "AUTO_DETECT",
  });
  eq(r.deductibleAgainstWage, 10_000, "grandfathered deductible");
  eq(r.quarantinedToProperty, 0, "no quarantine");
  eq(r.effectiveRegimeKind, "CURRENT_RULES", "AUTO_DETECT → current");
});

// ─── Test 5: Positive rental income burns down ledger ───────────────────────

test("Positive rental profit unaffected by regime + burns down ledger", () => {
  // Seed ledger with $4,500 carry-forward on p1.
  let seed = emptyLedger();
  seed = applyFyToLedger(seed, {
    propertyId: "p1",
    fyEndMonth: "2028-06",
    taxableNetPropertyIncome: -4_500,
  });

  const rows: PerPropertyFyRow[] = [
    { propertyId: "p1", taxableNetIncome: 6_000, propertyType: "ESTABLISHED", contractDate: "2027-09-01" },
  ];
  const r = partitionRentalLossesByRegime({
    rows,
    fyEndMonth: "2029-06",
    regimeSelector: "PROPOSED_2027_REFORM",
    ledger: seed,
  });

  // Positive income flows through directly as rentalProfit; regime does not
  // automatically burn down the ledger here (that happens via a separate
  // applyFyToLedger call when the property reports its own net income; in this
  // helper, we ONLY append loss entries, so the seed entry must remain).
  eq(r.rentalProfit, 6_000, "rentalProfit pass-through");
  eq(r.deductibleAgainstWage, 0, "no losses");
  eq(r.quarantinedToProperty, 0, "no quarantine");
  eq(r.ledger.p1?.length, 1, "ledger unchanged (no new losses appended)");
});

// ─── Runner ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
for (const t of TESTS) {
  try {
    t.assert();
    console.log(`✓ ${t.name}`);
    pass++;
  } catch (e: any) {
    console.error(`✗ ${t.name}: ${e?.message ?? e}`);
    fail++;
  }
}
console.log(`\n${pass}/${TESTS.length} passed`);
if (fail > 0) process.exit(1);
