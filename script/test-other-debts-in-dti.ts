/**
 * Sprint 2A — D-001 regression test.
 *
 * Verifies that non-property debt held under `state.otherDebts` flows into
 * the DTI numerator. Before the Sprint 2A fix `getOtherDebts()` returned 0
 * regardless of input; after the fix DTI must increase by exactly
 * `otherDebts / annualGrossIncome` when other debts are added.
 */
import { computeServiceability, deriveBasePlan } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

const monthlyGrossIncome = 30_633.34; // both salaries summed
const monthlyLivingExpenses = 15_000;
const mortgageRate = 0.065;

const withDebt = deriveBasePlan(makeRealUserInputs({ other_debts: 19_000 })).initialState;
const noDebt   = deriveBasePlan(makeRealUserInputs({ other_debts: 0 })).initialState;

const serviceWith = computeServiceability({
  state: withDebt,
  monthlyGrossIncome,
  monthlyLivingExpenses,
  mortgageRate,
});
const serviceNoDebt = computeServiceability({
  state: noDebt,
  monthlyGrossIncome,
  monthlyLivingExpenses,
  mortgageRate,
});

const dtiDelta = serviceWith.dti - serviceNoDebt.dti;
const expectedDelta = 19_000 / (monthlyGrossIncome * 12);

if (check(
  "DTI rises by other_debts/annualGross when other_debts is added",
  Math.abs(dtiDelta - expectedDelta) < 1e-6,
  `dtiDelta=${dtiDelta.toFixed(6)} expected=${expectedDelta.toFixed(6)}`,
)) pass++; else fail++;

// LVR and DSR should be unaffected by other-debts balance only.
if (check(
  "LVR unchanged by other_debts (property-only ratio)",
  Math.abs(serviceWith.lvr - serviceNoDebt.lvr) < 1e-9,
)) pass++; else fail++;

if (check(
  "DSR unchanged by other_debts balance (service-based)",
  Math.abs(serviceWith.dsr - serviceNoDebt.dsr) < 1e-9,
)) pass++; else fail++;

// Negative otherDebts must clamp to 0 (defensive).
const negState = { ...noDebt, otherDebts: -50_000 };
const serviceNeg = computeServiceability({
  state: negState,
  monthlyGrossIncome,
  monthlyLivingExpenses,
  mortgageRate,
});
if (check(
  "Negative otherDebts clamped to 0 (DTI matches noDebt baseline)",
  Math.abs(serviceNeg.dti - serviceNoDebt.dti) < 1e-9,
)) pass++; else fail++;

if (fail > 0) {
  console.error(`test-other-debts-in-dti: ${fail} failure(s)`);
  process.exit(1);
}
console.log(`test-other-debts-in-dti: ${pass} passed`);
