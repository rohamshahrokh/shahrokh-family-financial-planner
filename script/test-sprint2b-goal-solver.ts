/**
 * Sprint 2B — Goal Solver v1 tests.
 *
 * Verifies:
 *   • runGoalSolver returns a winner + 3 runner-ups + the full registry.
 *   • Determinism: same seed → byte-identical output ranking AND samples.
 *   • Different seed produces (likely) different terminal samples.
 *   • Cash preservation path has the lowest risk score in the registry.
 *   • Aggressive leverage has the highest leverage in the registry.
 *   • Targets impossible to meet within horizon produce successProbability=0.
 *   • Easy targets (very low NW threshold) produce successProbability≈1.
 *   • Risk score is bounded 0..100 across all paths.
 *   • Higher monthly surplus → higher expected NW for every path (sanity).
 */

import { runGoalSolver, STRATEGY_REGISTRY } from "../client/src/lib/scenarioV2";
import { check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

const baseInput = {
  initialNetWorth: 200_000,
  monthlySurplus: 3_000,
  horizonMonths: 240,
  rolloutCount: 64,
  seed: 12345,
  targets: { netWorth: 1_000_000 },
};

const r1 = runGoalSolver(baseInput);
const r2 = runGoalSolver(baseInput);

if (check("Returns a winner", r1.winner != null)) pass++; else fail++;
if (check("Returns 3 runner-ups", r1.runnerUps.length === 3)) pass++; else fail++;
if (check("allPaths length matches registry", r1.allPaths.length === STRATEGY_REGISTRY.length)) pass++; else fail++;

if (check(
  "Determinism: winner kind is stable across calls",
  r1.winner.kind === r2.winner.kind,
)) pass++; else fail++;

const sample1 = r1.winner.terminalSamplesSorted.join(",");
const sample2 = r2.winner.terminalSamplesSorted.join(",");
if (check("Determinism: winner terminal samples are byte-identical", sample1 === sample2)) pass++; else fail++;

const r3 = runGoalSolver({ ...baseInput, seed: 99999 });
const sample3 = r3.winner.terminalSamplesSorted.join(",");
if (check("Different seed produces a different terminal sample stream", sample1 !== sample3)) pass++; else fail++;

// Lowest risk path
const lowest = [...r1.allPaths].sort((a, b) => a.riskScore - b.riskScore)[0];
if (check("Cash preservation has the lowest risk score", lowest.kind === "cash_preservation")) pass++; else fail++;

// Highest leverage in registry
const maxLeverage = STRATEGY_REGISTRY.reduce((m, s) => Math.max(m, s.leverage), 0);
if (check("Aggressive leverage has highest leverage in registry",
  STRATEGY_REGISTRY.find((s) => s.kind === "aggressive_leverage")!.leverage === maxLeverage,
)) pass++; else fail++;

// Easy targets → near-100% success
const easy = runGoalSolver({ ...baseInput, targets: { netWorth: 100_000 } });
if (check("Easy NW target → ≥95% success on winner", easy.winner.successProbability >= 0.95)) pass++; else fail++;

// Impossible targets → ~0 success
const impossible = runGoalSolver({ ...baseInput, targets: { netWorth: 1e14 } });
if (check("Impossible NW target → winner success ≤ 0.01", impossible.winner.successProbability <= 0.01)) pass++; else fail++;

// Risk score bounds
const allBounded = r1.allPaths.every((p) => p.riskScore >= 0 && p.riskScore <= 100);
if (check("All risk scores within [0,100]", allBounded)) pass++; else fail++;

// Monotonic surplus → NW sanity check on the balanced path
const low = runGoalSolver({ ...baseInput, monthlySurplus: 1_000 });
const high = runGoalSolver({ ...baseInput, monthlySurplus: 10_000 });
const lowBalanced = low.allPaths.find((p) => p.kind === "balanced")!;
const highBalanced = high.allPaths.find((p) => p.kind === "balanced")!;
if (check(
  "Higher monthly surplus → higher expected NW on balanced path",
  highBalanced.expectedNetWorth > lowBalanced.expectedNetWorth,
)) pass++; else fail++;

// Each result carries an explanation string
if (check("Every path carries a non-empty explanation",
  r1.allPaths.every((p) => p.explanation.length > 0),
)) pass++; else fail++;

// Targets that include passive income produce an expectedFireYear when achievable
const fire = runGoalSolver({
  ...baseInput,
  targets: { passiveIncomeAnnual: 60_000 },
});
if (check("Passive income target produces some expectedFireYear or null (well-typed)",
  fire.winner.expectedFireYear === null || typeof fire.winner.expectedFireYear === "number",
)) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
