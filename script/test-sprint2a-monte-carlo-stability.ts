/**
 * Sprint 2A — D-006 Monte Carlo Stability test.
 *
 * Verifies that V3 (runMonteCarlo) — which V4/V5 wrap — is deterministic
 * when a `seed` is provided, and that two runs with the same seed produce
 * byte-for-byte identical headline metrics.
 *
 * Also asserts that omitting `seed` falls back to Math.random (legacy path)
 * so back-compat is preserved.
 */
import { runMonteCarlo, type MCInput } from "../client/src/lib/monteCarloEngine";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { fail++; process.stdout.write(`  ✗ ${name}${detail ? "  " + detail : ""}\n`); }
}

// Minimal MCInput. Many fields are arrays of empty.
const baseInput: MCInput = {
  snapshot: {
    ppor: 1_510_000,
    cash: 220_000,
    super_balance: 85_000,
    stocks: 0,
    crypto: 0,
    cars: 65_000,
    iran_property: 150_000,
    mortgage: 1_200_000,
    other_debts: 19_000,
    monthly_income: 30_633,
    monthly_expenses: 15_000,
  },
  properties: [],
  stocks: [],
  cryptos: [],
  bills: [],
  stockTransactions: [],
  cryptoTransactions: [],
  stockDCASchedules: [],
  cryptoDCASchedules: [],
  plannedStockOrders: [],
  plannedCryptoOrders: [],
  yearlyAssumptions: [
    { year: 2026, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2027, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2028, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2029, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2030, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2031, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2032, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2033, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2034, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
    { year: 2035, property_growth: 6, stocks_return: 10, crypto_return: 20, super_return: 8, inflation: 3, income_growth: 3, expense_growth: 3, interest_rate: 6.5, rent_growth: 3 },
  ] as any,
  simulations: 200,
} as any;

// (1) Seeded determinism — identical inputs + identical seed → identical result.
const a = runMonteCarlo({ ...baseInput, seed: 42 });
const b = runMonteCarlo({ ...baseInput, seed: 42 });

assert("Seeded V3: P10 reproducible", a.p10 === b.p10, `a=${a.p10} b=${b.p10}`);
assert("Seeded V3: median reproducible", a.median === b.median, `a=${a.median} b=${b.median}`);
assert("Seeded V3: P90 reproducible", a.p90 === b.p90, `a=${a.p90} b=${b.p90}`);
assert("Seeded V3: prob_ff reproducible", a.prob_ff === b.prob_ff, `a=${a.prob_ff} b=${b.prob_ff}`);

// (2) Different seeds → different draws (so the seed actually has effect).
const c = runMonteCarlo({ ...baseInput, seed: 99 });
const someDiffer = a.p10 !== c.p10 || a.median !== c.median || a.p90 !== c.p90;
assert("Different seed produces different stochastic outcome", someDiffer);

// (3) Unseeded path still works (legacy behaviour — non-deterministic).
const d = runMonteCarlo({ ...baseInput });
assert("Unseeded path returns valid percentiles (P10 ≤ median ≤ P90)",
  d.p10 <= d.median && d.median <= d.p90,
  `p10=${d.p10} median=${d.median} p90=${d.p90}`);

if (fail > 0) {
  console.error(`\n✗ test-sprint2a-monte-carlo-stability: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ test-sprint2a-monte-carlo-stability: ${pass} passed`);
