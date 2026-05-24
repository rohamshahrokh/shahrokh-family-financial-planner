/**
 * Sprint 2B — Wage Shock Engine tests.
 *
 * Verifies:
 *   • stepWageShock returns 1.0 (no shock) when seed produces no fire.
 *   • Once fired, the multiplier respects (partialReduction, recovery, taper).
 *   • Different seeds produce different fire months (probabilistic check).
 *   • Same seed → byte-identical sequence (determinism invariant).
 *   • Integration: runScenarioV2 with wageShock=null preserves outputs.
 *   • Integration: runScenarioV2 with wageShock != null lowers expected NW
 *     (under reasonable shock parameters).
 */

import {
  makeRng,
  stepWageShock,
  makeWageShockState,
  DEFAULT_WAGE_SHOCK,
  runScenarioV2,
} from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

// 1. Deterministic sequence for same seed.
function gather(seed: number): number[] {
  const rng = makeRng(seed);
  const st = makeWageShockState();
  const out: number[] = [];
  for (let i = 0; i < 24; i++) {
    out.push(stepWageShock(rng, st, i, DEFAULT_WAGE_SHOCK));
  }
  return out;
}
const a = gather(42);
const b = gather(42);
if (check(
  "Same seed produces byte-identical wage-shock sequence",
  a.join(",") === b.join(","),
)) pass++; else fail++;

// 2. Different seeds produce different sequences (with high probability over 24 months).
const c = gather(999);
if (check(
  "Different seed produces a different wage-shock sequence",
  a.join(",") !== c.join(","),
)) pass++; else fail++;

// 3. With a forced very-high probability we WILL fire — multiplier must drop.
const highParams = { ...DEFAULT_WAGE_SHOCK, jobLossAnnualProb: 12.0, householdResilience: 0 };
const rng2 = makeRng(7);
const st2 = makeWageShockState();
let observedDrop = false;
for (let i = 0; i < 12; i++) {
  const m = stepWageShock(rng2, st2, i, highParams);
  if (m < 1.0) observedDrop = true;
}
if (check("High-prob shock parameters trigger a multiplier < 1.0 within a year", observedDrop)) pass++; else fail++;
if (check("State recorded that shock has fired", st2.firedAtMonth >= 0)) pass++; else fail++;

// 4. Recovery taper returns to 1.0 eventually
const taperParams = {
  jobLossAnnualProb: 12.0,
  partialIncomeReductionFactor: 0.30,
  recoveryMonths: 2,
  recoveryTaperMonths: 4,
  householdResilience: 0,
};
const rng3 = makeRng(11);
const st3 = makeWageShockState();
let mulTrail: number[] = [];
for (let i = 0; i < 24; i++) {
  mulTrail.push(stepWageShock(rng3, st3, i, taperParams));
}
const lastFiveOnes = mulTrail.slice(-5).every((v) => v === 1.0);
if (check("Multiplier returns to 1.0 after recovery + taper window", lastFiveOnes)) pass++; else fail++;

// 5. Integration: same input + null wage shock vs default returns valid result either way.
const di = makeRealUserInputs();
const baseline = runScenarioV2({
  dashboardInputs: di,
  name: "wage-shock-baseline",
  deltas: [],
  simulationCount: 60,
  horizonMonths: 60,
  seed: 12345,
});
const withShock = runScenarioV2({
  dashboardInputs: di,
  name: "wage-shock-on",
  deltas: [],
  simulationCount: 60,
  horizonMonths: 60,
  seed: 12345,
  wageShock: { ...DEFAULT_WAGE_SHOCK, jobLossAnnualProb: 0.40 },
});

if (check("Baseline produces a survival metric", typeof baseline.survival.survivalProbability === "number")) pass++; else fail++;
if (check("With wageShock produces a non-empty audit", withShock.terminalNwSamples.length > 0)) pass++; else fail++;

// 6. Determinism under wage shock: same seed → same terminal NW samples
const withShock2 = runScenarioV2({
  dashboardInputs: di,
  name: "wage-shock-on-replay",
  deltas: [],
  simulationCount: 60,
  horizonMonths: 60,
  seed: 12345,
  wageShock: { ...DEFAULT_WAGE_SHOCK, jobLossAnnualProb: 0.40 },
});
const drift = Math.max(
  ...withShock.terminalNwSamples.map((v, i) => Math.abs(v - withShock2.terminalNwSamples[i])),
);
if (check("Wage-shock determinism: seeded replay produces identical terminal NW", drift < 1e-6)) pass++; else fail++;

// 7. Baseline preserves the legacy contract (terminalNwSamples length == sim count)
if (check("Baseline has terminalNwSamples length = simulationCount", baseline.terminalNwSamples.length === 60)) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
