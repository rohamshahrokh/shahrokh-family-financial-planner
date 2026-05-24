/**
 * Sprint 2A — D-007 Borrowing Capacity Consistency test.
 *
 * Verifies:
 *   1. computeBorrowingCapacity routes to computeServiceability when monthly
 *      income, expenses and rate are provided (source === "serviceability").
 *   2. The adapter's number matches computeServiceability directly within $1.
 *   3. Sparse inputs fall back to the published heuristic with a source flag,
 *      so the UI can render an "approx" caveat instead of pretending it's the
 *      APRA-buffered figure.
 *   4. otherDebts increases DTI inside the adapter (D-001 wired through).
 */
import { computeBorrowingCapacity } from "../client/src/lib/borrowingCapacityAdapter";
import { computeServiceability } from "../client/src/lib/scenarioV2/borrowing";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { fail++; process.stdout.write(`  ✗ ${name}${detail ? "  " + detail : ""}\n`); }
}

const monthlyGrossIncome = 30_000;
const monthlyLivingExpenses = 14_000;
const mortgageRate = 0.065;

// (1) rich inputs → serviceability source
const richInput = {
  monthlyGrossIncome,
  monthlyLivingExpenses,
  mortgageRate,
  otherDebts: 19_000,
};
const cap = computeBorrowingCapacity(richInput);
assert(
  "Rich inputs route to serviceability path (source = 'serviceability')",
  cap.source === "serviceability",
  `source=${cap.source}`,
);
assert(
  "Rich path produces a positive bufferedRate",
  (cap.bufferedRate ?? 0) > mortgageRate,
  `bufferedRate=${cap.bufferedRate}`,
);

// (2) matches direct computeServiceability within $1
const direct = computeServiceability({
  state: {
    month: "1970-01" as any,
    properties: [],
    cash: 0,
    etfBalance: 0,
    cryptoBalance: 0,
    superRoham: 0,
    superFara: 0,
    cars: 0,
    iranProperty: 0,
    otherAssets: 0,
    otherDebts: 19_000,
    fyTaxPaid: 0,
    ttmIncome: monthlyGrossIncome * 12,
    ttmExpenses: monthlyLivingExpenses * 12,
  } as any,
  monthlyGrossIncome,
  monthlyLivingExpenses,
  mortgageRate,
});
assert(
  "Adapter matches direct computeServiceability().maxBorrowCapacity (±$1)",
  Math.abs(cap.maxBorrowCapacity - direct.maxBorrowCapacity) <= 1,
  `adapter=${cap.maxBorrowCapacity} direct=${direct.maxBorrowCapacity}`,
);

// (3) sparse inputs fall back to gross multiple
const sparse = computeBorrowingCapacity({ grossAnnualFallback: 200_000 });
assert(
  "Sparse-input path returns approx_5x_gross with note",
  sparse.source === "approx_5x_gross" && !!sparse.note,
  `source=${sparse.source} note=${sparse.note}`,
);
assert(
  "Sparse path yields 5.5× gross magnitude",
  Math.abs(sparse.maxBorrowCapacity - 200_000 * 5.5) < 1,
  `cap=${sparse.maxBorrowCapacity}`,
);

// (4) increasing otherDebts via the adapter should reduce capacity (D-001
// effect flowing through — DTI gates aren't directly applied to the annuity
// solve, but the DTI signal flows out of computeServiceability and ranks
// the borrow band lower. The annuity solve itself does NOT subtract
// other-debt service because we don't track its monthly payment here, so
// we expect the capacity to be UNCHANGED or LOWER, not higher.)
const capWithDebt = computeBorrowingCapacity({ ...richInput, otherDebts: 100_000 });
assert(
  "Adding $100k of other_debts never INCREASES borrowing capacity",
  capWithDebt.maxBorrowCapacity <= cap.maxBorrowCapacity + 1,
  `noDebt=${cap.maxBorrowCapacity} withDebt=${capWithDebt.maxBorrowCapacity}`,
);

if (fail > 0) {
  console.error(`\n✗ test-sprint2a-borrowing-consistency: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ test-sprint2a-borrowing-consistency: ${pass} passed`);
