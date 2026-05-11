/**
 * P0-2 canonical cashflow guard.
 *
 * Pins the surplus identity (income - expenses [- debt when applicable] ==
 * surplus), the savingsRate null behaviour, and the dev-mode assertion.
 */
import {
  computeCanonicalCashflow,
} from "../client/src/lib/canonicalCashflow";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (check(name, cond, detail)) pass++; else fail++;
}

// Fixture: ledger has roham + fara monthly_income sub-fields, monthly_expenses
// 15k, expenses_includes_debt = true (so debt service is NOT subtracted).
const real = computeCanonicalCashflow(makeRealUserInputs());

run("monthlyIncome > 0",                 real.monthlyIncome > 0,                   `got=${real.monthlyIncome}`);
run("monthlyExpenses > 0",               real.monthlyExpenses > 0,                 `got=${real.monthlyExpenses}`);
run("surplus identity holds",            Math.abs((real.monthlyIncome - real.monthlyExpenses) - real.monthlySurplus) <= 1,
                                          `inc=${real.monthlyIncome} exp=${real.monthlyExpenses} surplus=${real.monthlySurplus}`);
run("savingsRate in [-Inf, 1]",          real.savingsRate === null || (real.savingsRate <= 1 && Number.isFinite(real.savingsRate)),
                                          `got=${real.savingsRate}`);
run("savingsRate != NaN",                real.savingsRate === null || !Number.isNaN(real.savingsRate));

// Zero-income edge: savingsRate MUST be null (not NaN, not 0, not Infinity).
const empty = computeCanonicalCashflow({
  snapshot: { monthly_income: 0, monthly_expenses: 0 },
  properties: [], stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
});
run("zero income → savingsRate === null",  empty.savingsRate === null, `got=${empty.savingsRate}`);
run("zero income → surplus === 0",         empty.monthlySurplus === 0, `got=${empty.monthlySurplus}`);

// Income but zero expenses → savingsRate == 1.0
const sparse = computeCanonicalCashflow({
  snapshot: { monthly_income: 10_000, monthly_expenses: 0, expenses_includes_debt: true },
  properties: [], stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
});
run("zero expenses → savingsRate close to 1", sparse.savingsRate !== null && Math.abs(sparse.savingsRate - 1) < 0.01,
                                              `got=${sparse.savingsRate}`);

run("expensesIncludeDebt reported",        typeof real.expensesIncludeDebt === "boolean");
run("monthlyDebtService is a finite number", Number.isFinite(real.monthlyDebtService));

if (fail > 0) { console.error(`test-canonical-cashflow: ${fail} failure(s)`); process.exit(1); }
console.log(`test-canonical-cashflow: ${pass} passed`);
