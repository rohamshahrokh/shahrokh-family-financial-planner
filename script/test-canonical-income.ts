/**
 * Audit P1.2 — canonical income selector precedence + variance detection.
 */
import { selectCanonicalIncome } from "../client/src/lib/dashboardDataContract";
import { makeRealUserInputs, REAL_TAX_PROFILE, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, fn: () => boolean) { fn() ? pass++ : fail++; }

run("Returns ledger when sf_income populated", () => {
  const inputs = makeRealUserInputs();
  // Add some ledger rows to win precedence (6mo average).
  inputs.incomeRecords = [
    { amount: 30_000, date: "2026-04-01" },
    { amount: 30_000, date: "2026-03-01" },
    { amount: 30_000, date: "2026-02-01" },
    { amount: 30_000, date: "2026-01-01" },
    { amount: 30_000, date: "2025-12-01" },
    { amount: 30_000, date: "2025-11-01" },
  ];
  const inc = selectCanonicalIncome(inputs);
  return check("source = ledger", inc.source === "ledger", `source=${inc.source}`);
});

run("Falls back to sub-fields when ledger empty", () => {
  const inputs = makeRealUserInputs();
  inputs.incomeRecords = [];
  const inc = selectCanonicalIncome(inputs);
  return check("source = snapshot_sub_fields", inc.source === "snapshot_sub_fields", `source=${inc.source}`);
});

run("Falls back to master when sub-fields empty", () => {
  const inputs = makeRealUserInputs({
    roham_monthly_income: 0,
    fara_monthly_income: 0,
    rental_income_total: 0,
    other_income: 0,
  });
  (inputs.snapshot as any).monthly_income = 30_000;
  inputs.incomeRecords = [];
  const inc = selectCanonicalIncome(inputs);
  return check("source = snapshot_master", inc.source === "snapshot_master", `source=${inc.source}`);
});

run("Variance detected when tax profile diverges > 2%", () => {
  const inputs = makeRealUserInputs();
  inputs.incomeRecords = [];
  const inc = selectCanonicalIncome(inputs, REAL_TAX_PROFILE);
  // Sub-field annual ~= 367k, tax profile sum 371.7k; diff < 2%, so likely null.
  // Force a clear divergence:
  const inc2 = selectCanonicalIncome(inputs, { roham_salary: 220_000, fara_salary: 200_000 });
  return check("variance populated when diff > 2%", inc2.taxProfileVariance !== null,
    `variance=${JSON.stringify(inc2.taxProfileVariance)}`);
});

run("Override flag honoured", () => {
  const inputs = makeRealUserInputs();
  inputs.incomeRecords = [];
  const inc = selectCanonicalIncome(inputs, { ...REAL_TAX_PROFILE, override_active: true });
  return check("taxableOverrideActive true", inc.taxableOverrideActive === true,
    `override=${inc.taxableOverrideActive}`);
});

if (fail > 0) { console.error(`test-canonical-income: ${fail} failure(s)`); process.exit(1); }
console.log(`test-canonical-income: ${pass} passed`);
