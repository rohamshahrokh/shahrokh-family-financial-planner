/**
 * Sprint 2B — Survival Engine + Forced Sale reporting tests.
 *
 * Verifies:
 *   • computeSurvivalMetrics handles all-solvent and all-default populations.
 *   • survival probability + insolvency probability sum to 1 exactly.
 *   • Recovery probability conditions on the defaulting sub-population only.
 *   • buildForcedSaleReport reports zero triggers on a population without
 *     forcedSales, and positive triggers when forcedSales > 0.
 *   • runScenarioV2 always populates `survival` and `forcedSaleReport`
 *     (production contract — no commercial UI work, engine-level only).
 */

import {
  computeSurvivalMetrics,
  buildForcedSaleReport,
  runScenarioV2,
} from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

// 1. All solvent → survival = 1, insolvency = 0
const allSolvent = computeSurvivalMetrics({
  simulationCount: 100,
  defaultMonthBySim: new Array(100).fill(-1),
  liquidityFirstMonthBySim: new Array(100).fill(-1),
  terminalNwBySim: new Array(100).fill(1_000_000),
  horizonMonths: 120,
});
if (check("All-solvent: survivalProbability === 1", allSolvent.survivalProbability === 1)) pass++; else fail++;
if (check("All-solvent: insolvencyProbability === 0", allSolvent.insolvencyProbability === 0)) pass++; else fail++;
if (check("All-solvent: recoveryProbability === 0", allSolvent.recoveryProbability === 0)) pass++; else fail++;

// 2. All-default with positive terminal NW: recovery = 1
const allDefault = computeSurvivalMetrics({
  simulationCount: 50,
  defaultMonthBySim: new Array(50).fill(60),
  liquidityFirstMonthBySim: new Array(50).fill(36),
  terminalNwBySim: new Array(50).fill(50_000), // recovered
  horizonMonths: 120,
});
if (check("All-default with positive terminal NW: insolvency = 1", allDefault.insolvencyProbability === 1)) pass++; else fail++;
if (check("All-default with positive terminal NW: recovery = 1", allDefault.recoveryProbability === 1)) pass++; else fail++;
if (check("All-default with positive terminal NW: survival = 0", allDefault.survivalProbability === 0)) pass++; else fail++;

// 3. survival + insolvency sum to 1
const mixed = computeSurvivalMetrics({
  simulationCount: 10,
  defaultMonthBySim: [60, -1, -1, 12, -1, -1, -1, -1, 80, -1],
  liquidityFirstMonthBySim: [50, -1, -1, 6, -1, -1, -1, -1, 70, -1],
  terminalNwBySim: [-10_000, 100_000, 100_000, -50_000, 100_000, 100_000, 100_000, 100_000, 30_000, 100_000],
  horizonMonths: 120,
});
if (check(
  "mixed: survival + insolvency ≈ 1",
  Math.abs((mixed.survivalProbability + mixed.insolvencyProbability) - 1) < 1e-9,
)) pass++; else fail++;
if (check(
  "mixed: recoveryProbability conditions on defaulting sub-population only",
  Math.abs(mixed.recoveryProbability - 1/3) < 1e-9,
)) pass++; else fail++;
if (check(
  "mixed: yearsOfSustainability = median stress month / 12",
  Math.abs(mixed.yearsOfSustainability - 50/12) < 1e-9,
)) pass++; else fail++;

// 4. Forced sale: empty trigger population.
const noForcedSale = buildForcedSaleReport({
  finalStates: [
    { month: "2030-01", cash: 1, etfBalance: 0, cryptoBalance: 0, superRoham: 0, superFara: 0,
      properties: [], cars: 0, iranProperty: 0, otherAssets: 0, otherDebts: 0,
      fyTaxPaid: 0, ttmIncome: 0, ttmExpenses: 0 } as any,
  ],
  terminalNwBySim: [1_000],
});
if (check("Forced sale with zero forcedSales: triggerProbability = 0", noForcedSale.triggerProbability === 0)) pass++; else fail++;

const withForcedSale = buildForcedSaleReport({
  finalStates: [
    { month: "2030-01", cash: 0, etfBalance: 0, cryptoBalance: 0, superRoham: 0, superFara: 0,
      properties: [], cars: 0, iranProperty: 0, otherAssets: 0, otherDebts: 0,
      fyTaxPaid: 0, ttmIncome: 0, ttmExpenses: 0, forcedSales: 100_000, defaulted: false } as any,
    { month: "2030-01", cash: 0, etfBalance: 0, cryptoBalance: 0, superRoham: 0, superFara: 0,
      properties: [], cars: 0, iranProperty: 0, otherAssets: 0, otherDebts: 0,
      fyTaxPaid: 0, ttmIncome: 0, ttmExpenses: 0, forcedSales: 200_000, defaulted: true } as any,
    { month: "2030-01", cash: 100, etfBalance: 0, cryptoBalance: 0, superRoham: 0, superFara: 0,
      properties: [], cars: 0, iranProperty: 0, otherAssets: 0, otherDebts: 0,
      fyTaxPaid: 0, ttmIncome: 0, ttmExpenses: 0 } as any,
  ],
  terminalNwBySim: [50_000, -10_000, 200_000],
});
if (check("With forcedSales: triggerProbability = 2/3", Math.abs(withForcedSale.triggerProbability - 2/3) < 1e-9)) pass++; else fail++;
if (check("With forcedSales: triggerCount === 2", withForcedSale.triggerCount === 2)) pass++; else fail++;
if (check(
  "With forcedSales: recoveryProbabilityGivenForcedSale = 0.5 (one of two recovered)",
  Math.abs(withForcedSale.recoveryProbabilityGivenForcedSale - 0.5) < 1e-9,
)) pass++; else fail++;

// 5. runScenarioV2 always populates survival + forcedSaleReport.
const di = makeRealUserInputs();
const r = runScenarioV2({
  dashboardInputs: di,
  name: "sprint2b-survival-fs",
  deltas: [],
  simulationCount: 40,
  horizonMonths: 36,
  seed: 999,
});
if (check("runScenarioV2 populates survival.survivalProbability", typeof r.survival.survivalProbability === "number")) pass++; else fail++;
if (check("runScenarioV2 populates forcedSaleReport.perSim.length === sims", r.forcedSaleReport.perSim.length === 40)) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
