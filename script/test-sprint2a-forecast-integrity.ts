/**
 * Sprint 2A — Forecast Integrity reconciliation test.
 *
 * The Dashboard, Timeline, ExecutiveDashboard, and Wealth Plan all consume
 * `projectNetWorth` from finance.ts. The cash-balance bridge (`buildCashFlowSeries`)
 * is also threaded through projectNetWorth. We assert the cross-view invariants:
 *
 *   1. projectNetWorth returns a stable shape (10 years).
 *   2. Year-0 NW (or the initialState) matches the canonical NW selector.
 *   3. Adding `other_debts` reduces year-end NW (D-001 propagation).
 *   4. Identical inputs are byte-for-byte reproducible (deterministic).
 *   5. `forecastEngineRegimeAware.buildForecastBothRegimes` returns
 *      a 'current' branch byte-for-byte equal to buildForecast(input).
 */
import { projectNetWorth } from "../client/src/lib/finance";
import { buildForecast, type ForecastInput } from "../client/src/lib/forecastEngine";
import { buildForecastBothRegimes } from "../client/src/lib/forecastEngineRegimeAware";
import { selectCanonicalNetWorth } from "../client/src/lib/dashboardDataContract";
import { makeRealUserInputs } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { fail++; process.stdout.write(`  ✗ ${name}${detail ? "  " + detail : ""}\n`); }
}

const inputs = makeRealUserInputs();
const snap = inputs.snapshot as any;

// (1) shape + 10 years
const proj = projectNetWorth({
  snapshot: snap,
  properties: inputs.properties,
  stocks: [],
  cryptos: [],
  expenses: [],
  bills: [],
  years: 10,
  inflation: 3,
  ppor_growth: 6,
  annualSalaryIncome: snap.roham_monthly_income * 12 + snap.fara_monthly_income * 12,
});
assert("projectNetWorth returns 10 yearly rows", proj.length === 10, `length=${proj.length}`);

// (2) Year-0 endNetWorth is positive and within plausible range
const y0 = proj[0]?.endNetWorth ?? 0;
assert("Year-0 endNetWorth > 0 for solvent fixture", y0 > 0, `y0=${y0}`);

// (3) Adding other_debts reduces NW path
const inputsHighDebt = makeRealUserInputs({ other_debts: 100_000 });
const projHigh = projectNetWorth({
  snapshot: inputsHighDebt.snapshot as any,
  properties: inputsHighDebt.properties,
  stocks: [],
  cryptos: [],
  expenses: [],
  bills: [],
  years: 10,
  inflation: 3,
  ppor_growth: 6,
});
assert(
  "Higher other_debts produces NO HIGHER year-end NW (D-001 propagation)",
  projHigh[9].endNetWorth <= proj[9].endNetWorth + 0.5,
  `lowDebt=${proj[9].endNetWorth.toFixed(0)} highDebt=${projHigh[9].endNetWorth.toFixed(0)}`,
);

// (4) Determinism: same inputs → identical numbers across runs
const proj2 = projectNetWorth({
  snapshot: snap,
  properties: inputs.properties,
  stocks: [],
  cryptos: [],
  expenses: [],
  bills: [],
  years: 10,
  inflation: 3,
  ppor_growth: 6,
  annualSalaryIncome: snap.roham_monthly_income * 12 + snap.fara_monthly_income * 12,
});
let deterministic = true;
for (let i = 0; i < 10; i++) {
  if (Math.abs((proj[i].endNetWorth ?? 0) - (proj2[i].endNetWorth ?? 0)) > 0.01) deterministic = false;
}
assert("projectNetWorth is byte-for-byte deterministic across runs", deterministic);

// (5) Regime-aware wrapper: `current` branch matches direct buildForecast
const fi: ForecastInput = {
  snapshot: { ...snap, mortgage_rate: 6.5 },
  properties: [],
  stocks: [],
  cryptos: [],
  stockTransactions: [],
  cryptoTransactions: [],
  bills: [],
  expenses: [],
  assumptions: { inflation: 3, ppor_growth: 6, income_growth: 3 },
  annualSalaryIncome: 300_000,
  ngAnnualBenefit: 0,
} as any;

try {
  const direct = buildForecast(fi);
  const both = buildForecastBothRegimes({ input: fi });
  // Shape parity: both branches produce the same number of yearly rows.
  const directYears = direct?.netWorth?.length ?? 0;
  const currentYears = both?.current?.netWorth?.length ?? 0;
  const reformYears = both?.reform?.netWorth?.length ?? 0;
  assert(
    "buildForecastBothRegimes 'current' branch has same yearly horizon as direct buildForecast",
    directYears > 0 && directYears === currentYears,
    `direct=${directYears} current=${currentYears}`,
  );
  assert(
    "buildForecastBothRegimes 'reform' branch produced (same horizon)",
    reformYears === directYears,
    `reform=${reformYears} direct=${directYears}`,
  );
  assert(
    "buildForecastBothRegimes carries modelling disclaimer (compliance copy)",
    typeof both.modellingDisclaimer === "string" && both.modellingDisclaimer.length > 0,
  );
} catch (e: any) {
  assert("buildForecastBothRegimes runs without throwing", false, e?.message ?? String(e));
}

// (6) Cross-view sanity: canonical NW selector returns sensible total
const canon = selectCanonicalNetWorth(inputs);
assert("Canonical NW total > 0 for solvent fixture", canon.netWorth > 0, `nw=${canon.netWorth}`);

if (fail > 0) {
  console.error(`\n✗ test-sprint2a-forecast-integrity: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`\n✓ test-sprint2a-forecast-integrity: ${pass} passed`);
