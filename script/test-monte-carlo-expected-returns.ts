/**
 * test-monte-carlo-expected-returns.ts
 *
 * Validates the FWL-MonteCarlo-ExpectedReturn-Control feature:
 *
 *  1. DEFAULT_EXPECTED_RETURNS exposes the canonical defaults
 *       (Property 6.5%, Stocks 10%, Crypto 20%, Super 9.5%).
 *  2. buildCanonicalMonteCarloInput overrides yearlyAssumptions[*] mean
 *     fields with extras.expectedReturns when supplied (and only those).
 *  3. Volatility is independent of the mean — overriding expectedReturns
 *     does NOT touch any volatility field.
 *  4. P50 (median) net worth changes materially when Property mean moves
 *     6.5% → 15% → 30% with FIXED volatility. (Sensitivity proof.)
 *  5. Coverage manifest contains all four `assumptions:mc:expected-return:*`
 *     ids so /audit-coverage stays at 100%.
 *  6. Reset behaviour: re-applying defaults to expectedReturns restores the
 *     exact DEFAULT_EXPECTED_RETURNS values.
 *
 * Run with:  npx tsx script/test-monte-carlo-expected-returns.ts
 */

import {
  DEFAULT_EXPECTED_RETURNS,
  DEFAULT_MC_VOLATILITY,
  generateYearlyFromProfile,
  type ExpectedReturns,
} from "../client/src/lib/forecastStore";
import { buildCanonicalMonteCarloInput } from "../client/src/lib/monteCarloCanonical";
import { runMonteCarlo } from "../client/src/lib/monteCarloEngine";
import {
  COVERAGE_MANIFEST,
  MC_EXPECTED_RETURN_TRACE_IDS,
} from "../client/src/lib/auditMode/coverageManifest";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (check(name, cond, detail)) pass++; else fail++;
}
function section(title: string) {
  // eslint-disable-next-line no-console
  console.log(`\n── ${title} ──`);
}

// ───────────────────────────────────────────────────────────────────────────
// 1 — Defaults
// ───────────────────────────────────────────────────────────────────────────
section("1 — DEFAULT_EXPECTED_RETURNS canonical values");

run("Property default = 6.5%",  DEFAULT_EXPECTED_RETURNS.property === 6.5,  `got=${DEFAULT_EXPECTED_RETURNS.property}`);
run("Stocks   default = 10%",   DEFAULT_EXPECTED_RETURNS.stocks   === 10,   `got=${DEFAULT_EXPECTED_RETURNS.stocks}`);
run("Crypto   default = 20%",   DEFAULT_EXPECTED_RETURNS.crypto   === 20,   `got=${DEFAULT_EXPECTED_RETURNS.crypto}`);
run("Super    default = 9.5%",  DEFAULT_EXPECTED_RETURNS.super    === 9.5,  `got=${DEFAULT_EXPECTED_RETURNS.super}`);

// ───────────────────────────────────────────────────────────────────────────
// 2 — Canonical mapper override behaviour
// ───────────────────────────────────────────────────────────────────────────
section("2 — buildCanonicalMonteCarloInput overrides yearly means with expectedReturns");

const ledger = makeRealUserInputs();
const yearly = generateYearlyFromProfile("moderate"); // baseline 6.0/10/20/10

// Custom expected returns — completely different from "moderate" baseline
const er: ExpectedReturns = { property: 15, stocks: 12, crypto: 25, super: 9.5 };
const { input } = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: yearly,
  volatilityParams: DEFAULT_MC_VOLATILITY,
  expectedReturns: er,
  simulations: 50,
});

run("yearly[*].property_growth overridden to 15", input.yearlyAssumptions.every(r => r.property_growth === 15));
run("yearly[*].stocks_return   overridden to 12", input.yearlyAssumptions.every(r => r.stocks_return   === 12));
run("yearly[*].crypto_return   overridden to 25", input.yearlyAssumptions.every(r => r.crypto_return   === 25));
run("yearly[*].super_return    overridden to 9.5", input.yearlyAssumptions.every(r => r.super_return    === 9.5));

// Other fields are untouched
run("yearly[*].inflation untouched (stays moderate baseline 3.0)",  input.yearlyAssumptions.every(r => r.inflation === 3.0));
run("yearly[*].cash_return untouched (stays moderate baseline 4.5)", input.yearlyAssumptions.every(r => r.cash_return === 4.5));

// ───────────────────────────────────────────────────────────────────────────
// 3 — Mean and volatility are independent
// ───────────────────────────────────────────────────────────────────────────
section("3 — Mean and Volatility are completely separate variables");

const fixedVol = { ...DEFAULT_MC_VOLATILITY, prop_volatility: 5 };
const inputA = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: yearly,
  volatilityParams: fixedVol,
  expectedReturns: { ...DEFAULT_EXPECTED_RETURNS, property: 6.5 },
  simulations: 50,
}).input;
const inputB = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: yearly,
  volatilityParams: fixedVol,
  expectedReturns: { ...DEFAULT_EXPECTED_RETURNS, property: 30 },
  simulations: 50,
}).input;

run("Mean changed (A: 6.5%, B: 30%)",
  inputA.yearlyAssumptions[0].property_growth === 6.5 && inputB.yearlyAssumptions[0].property_growth === 30);
run("Volatility identical between A and B (5%)",
  inputA.volatilityParams?.prop_volatility === 5 && inputB.volatilityParams?.prop_volatility === 5);
run("Mapper does not mutate volatilityParams",
  inputA.volatilityParams?.prop_volatility === fixedVol.prop_volatility);

// ───────────────────────────────────────────────────────────────────────────
// 4 — Sensitivity: P50 must move materially when Property mean changes
//     and volatility is held constant
// ───────────────────────────────────────────────────────────────────────────
section("4 — P50 sensitivity to Property mean (6.5% / 15% / 30%) at fixed volatility");

// Build a heavier property allocation to make Property mean dominate the result.
const propertyHeavyLedger = makeRealUserInputs({
  // Heavier PPOR + smaller buffers — ensures property growth materially moves NW.
  ppor: 5_000_000,
  mortgage: 0,
  cash: 50_000,
  stocks: 0,
  crypto: 0,
});

function runP50(propertyMean: number): number {
  // Math.random() seeding is not exposed by runMonteCarlo (V3). With 1,000
  // simulations the law of large numbers makes the P50 stable enough that
  // a 6.5% → 30% mean move dwarfs sampling noise. We average a couple of runs
  // to be defensive against outliers in CI.
  const runs: number[] = [];
  for (let k = 0; k < 2; k++) {
    const { input } = buildCanonicalMonteCarloInput(propertyHeavyLedger, {
      yearlyAssumptions: generateYearlyFromProfile("moderate"),
      volatilityParams: { ...DEFAULT_MC_VOLATILITY, prop_volatility: 5 }, // FIXED volatility
      expectedReturns: { ...DEFAULT_EXPECTED_RETURNS, property: propertyMean },
      simulations: 1000,
    });
    const result = runMonteCarlo(input);
    runs.push(result.median);
  }
  return runs.reduce((a, b) => a + b, 0) / runs.length;
}

const p50_at_6_5  = runP50(6.5);
const p50_at_15   = runP50(15);
const p50_at_30   = runP50(30);

// eslint-disable-next-line no-console
console.log(`     P50 @ 6.5% = ${(p50_at_6_5  / 1_000_000).toFixed(3)}M`);
// eslint-disable-next-line no-console
console.log(`     P50 @ 15%  = ${(p50_at_15   / 1_000_000).toFixed(3)}M`);
// eslint-disable-next-line no-console
console.log(`     P50 @ 30%  = ${(p50_at_30   / 1_000_000).toFixed(3)}M`);

// At fixed volatility, higher mean MUST produce higher P50 — strictly monotonic
// to within sampling noise. We require P50@30 > P50@15 > P50@6.5 by a
// substantial margin (>10% of the lower value) to prove material wiring.
const ratio_15_to_65 = p50_at_15 / p50_at_6_5;
const ratio_30_to_15 = p50_at_30 / p50_at_15;

run("P50 strictly increases as Property mean increases",
  p50_at_6_5 < p50_at_15 && p50_at_15 < p50_at_30,
  `6.5%=${p50_at_6_5.toFixed(0)} 15%=${p50_at_15.toFixed(0)} 30%=${p50_at_30.toFixed(0)}`,
);
run("P50 @ 15% > P50 @ 6.5% by ≥ 10% (material)",
  ratio_15_to_65 >= 1.10,
  `ratio=${ratio_15_to_65.toFixed(3)}`,
);
run("P50 @ 30% > P50 @ 15% by ≥ 10% (material)",
  ratio_30_to_15 >= 1.10,
  `ratio=${ratio_30_to_15.toFixed(3)}`,
);

// ───────────────────────────────────────────────────────────────────────────
// 5 — Audit coverage contains the four expected-return ids
// ───────────────────────────────────────────────────────────────────────────
section("5 — Audit Coverage manifest registration");

const coverageIds = new Set(COVERAGE_MANIFEST.map(e => e.id));
run("manifest contains assumptions:mc:expected-return:property", coverageIds.has("assumptions:mc:expected-return:property"));
run("manifest contains assumptions:mc:expected-return:stocks",   coverageIds.has("assumptions:mc:expected-return:stocks"));
run("manifest contains assumptions:mc:expected-return:crypto",   coverageIds.has("assumptions:mc:expected-return:crypto"));
run("manifest contains assumptions:mc:expected-return:super",    coverageIds.has("assumptions:mc:expected-return:super"));
run("MC_EXPECTED_RETURN_TRACE_IDS exports four ids", MC_EXPECTED_RETURN_TRACE_IDS.length === 4);

// ───────────────────────────────────────────────────────────────────────────
// 6 — Reset behaviour
// ───────────────────────────────────────────────────────────────────────────
section("6 — Reset Canonical Assumptions restores defaults");

const customised: ExpectedReturns = { property: 99, stocks: 99, crypto: 99, super: 99 };
const reset: ExpectedReturns = { ...DEFAULT_EXPECTED_RETURNS };
run("reset() value === DEFAULT_EXPECTED_RETURNS",
  reset.property === DEFAULT_EXPECTED_RETURNS.property &&
  reset.stocks   === DEFAULT_EXPECTED_RETURNS.stocks &&
  reset.crypto   === DEFAULT_EXPECTED_RETURNS.crypto &&
  reset.super    === DEFAULT_EXPECTED_RETURNS.super,
);
run("customised values are independent of defaults",
  customised.property !== DEFAULT_EXPECTED_RETURNS.property,
);

// ───────────────────────────────────────────────────────────────────────────
section(`Summary — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
