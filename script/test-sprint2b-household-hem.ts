/**
 * Sprint 2B — Household Composition + HEM Integration tests.
 *
 * Verifies:
 *   • deriveHousehold maps every kind to the right (adults, children) tuple.
 *   • HEM table is monotonic (larger households → equal or higher floors).
 *   • Mode ACTUAL is a no-op (legacy/backwards-compat invariant).
 *   • Mode HEM_MINIMUM applies the table floor when composition is supplied.
 *   • Mode HIGHER_OF picks max(actual, floor).
 *   • Mode HEM_MINIMUM falls back to ACTUAL when composition is missing
 *     (defensive backwards-compat for callers that haven't migrated).
 *   • computeServiceability surfaces the audit row and preserves DSR/DTI/LVR
 *     when composition is omitted (engine-level backwards-compat invariant).
 */

import {
  deriveHousehold,
  HEM_TABLE_MONTHLY,
  resolveHemExpenses,
  computeServiceability,
  deriveBasePlan,
} from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

// 1. deriveHousehold
const single = deriveHousehold("single");
if (check("single → adults=1 children=0", single.adults === 1 && single.children === 0)) pass++; else fail++;
const couple3 = deriveHousehold("couple_3_plus_children");
if (check("couple_3_plus_children → adults=2 children=3", couple3.adults === 2 && couple3.children === 3)) pass++; else fail++;

// 2. HEM table monotonicity
const kinds: Array<keyof typeof HEM_TABLE_MONTHLY> = [
  "single", "couple", "couple_1_child", "couple_2_children", "couple_3_plus_children",
];
let monotonic = true;
for (let i = 1; i < kinds.length; i++) {
  if (HEM_TABLE_MONTHLY[kinds[i]] < HEM_TABLE_MONTHLY[kinds[i - 1]]) monotonic = false;
}
if (check("HEM table monotonic across composition sizes", monotonic)) pass++; else fail++;

// 3. ACTUAL mode is a no-op
const actualAudit = resolveHemExpenses({
  monthlyLivingExpenses: 12_000,
  mode: "ACTUAL",
  composition: "couple_2_children",
});
if (check("ACTUAL: appliedMonthly === actualMonthly", actualAudit.appliedMonthly === 12_000)) pass++; else fail++;

// 4. HEM_MINIMUM applies the table floor
const minAudit = resolveHemExpenses({
  monthlyLivingExpenses: 3_000,
  mode: "HEM_MINIMUM",
  composition: "couple_2_children",
});
if (check(
  "HEM_MINIMUM applies the table floor for couple_2_children",
  minAudit.appliedMonthly === HEM_TABLE_MONTHLY["couple_2_children"],
)) pass++; else fail++;

// 5. HIGHER_OF picks max
const higherAudit = resolveHemExpenses({
  monthlyLivingExpenses: 9_500,
  mode: "HIGHER_OF",
  composition: "couple",
});
if (check(
  "HIGHER_OF picks declared expenses when above the floor",
  higherAudit.appliedMonthly === 9_500,
)) pass++; else fail++;

const higherLow = resolveHemExpenses({
  monthlyLivingExpenses: 2_000,
  mode: "HIGHER_OF",
  composition: "couple",
});
if (check(
  "HIGHER_OF picks HEM floor when declared is below floor",
  higherLow.appliedMonthly === HEM_TABLE_MONTHLY["couple"],
)) pass++; else fail++;

// 6. Mode HEM_MINIMUM without composition falls back to ACTUAL
const missingComp = resolveHemExpenses({
  monthlyLivingExpenses: 4_000,
  mode: "HEM_MINIMUM",
});
if (check(
  "HEM_MINIMUM with missing composition falls back to ACTUAL",
  missingComp.appliedMonthly === 4_000,
)) pass++; else fail++;
if (check(
  "Fallback emits an explanatory note",
  missingComp.notes.some((n) => n.includes("falling back to ACTUAL")),
)) pass++; else fail++;

// 7. computeServiceability backwards compatibility
const state = deriveBasePlan(makeRealUserInputs({ other_debts: 19_000 })).initialState;
const baseService = computeServiceability({
  state,
  monthlyGrossIncome: 30_633.34,
  monthlyLivingExpenses: 15_000,
  mortgageRate: 0.065,
});
const compService = computeServiceability({
  state,
  monthlyGrossIncome: 30_633.34,
  monthlyLivingExpenses: 15_000,
  mortgageRate: 0.065,
  householdComposition: "couple_2_children",
  hemMode: "ACTUAL",
});
if (check(
  "computeServiceability: ACTUAL mode + composition leaves DTI unchanged",
  Math.abs(baseService.dti - compService.dti) < 1e-9,
)) pass++; else fail++;
if (check(
  "computeServiceability: ACTUAL mode + composition leaves DSR unchanged",
  Math.abs(baseService.dsr - compService.dsr) < 1e-9,
)) pass++; else fail++;
if (check(
  "computeServiceability: ACTUAL mode + composition leaves LVR unchanged",
  Math.abs(baseService.lvr - compService.lvr) < 1e-9,
)) pass++; else fail++;

// 8. Switching to HIGHER_OF with a HEM-above-actual case raises buffered NSR pressure.
const tightService = computeServiceability({
  state,
  monthlyGrossIncome: 30_633.34,
  monthlyLivingExpenses: 2_500, // far below HEM
  mortgageRate: 0.065,
  householdComposition: "couple_2_children",
  hemMode: "HIGHER_OF",
});
const loose = computeServiceability({
  state,
  monthlyGrossIncome: 30_633.34,
  monthlyLivingExpenses: 2_500,
  mortgageRate: 0.065,
});
if (check(
  "HIGHER_OF with high HEM produces lower max borrow capacity than ACTUAL",
  tightService.maxBorrowCapacity < loose.maxBorrowCapacity,
)) pass++; else fail++;

// 9. Audit is always populated.
if (check("baseService has hemAudit", typeof baseService.hemAudit === "object" && baseService.hemAudit !== null)) pass++; else fail++;
if (check("tightService audit captures HIGHER_OF mode", tightService.hemAudit.mode === "HIGHER_OF")) pass++; else fail++;
if (check("tightService audit composition is couple_2_children", tightService.hemAudit.composition?.kind === "couple_2_children")) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
