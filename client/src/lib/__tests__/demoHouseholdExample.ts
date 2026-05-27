/**
 * Sprint 20 PR-B — demo household JSON-dump generator (workspace deliverable).
 *
 * Builds a full AdvisorRecommendation example + TransitionNarrative + Real
 * Path output for the demo household, printed as JSON for the PR description.
 *
 * Run: npx tsx client/src/lib/__tests__/demoHouseholdExample.ts
 */

import { buildAdvisorSignals } from "../advisorContextBuilder";
import { generateAdvisorRecommendations } from "../advisorRecommendationsBuilder";
import { buildRetirementTransition } from "../retirementTransition";
import { buildRealPath } from "../recommendationOptimization/realPathOutput";

const demoSignals = buildAdvisorSignals({
  monthlyIncome: 30_700,
  monthlyExpenses: 15_000,
  monthlySurplus: 7_500,
  netWorth: 758_000,
  totalDebt: 1_064_000,
  totalAssets: 1_822_000,
  propertyValue: 1_510_000,
  cryptoValue: 0,
  equityValue: 0,
  liquidCash: 135_000,
  targetFireYear: 2040,
  targetMonthlyPassive: 9_000,
  baselineFireYear: 2046,
  baselineMonthlyPassive: 2_525,
  baselineFireProgressPct: 28.1,
  lifeStage: 'STATE_A_ACCUMULATION',
  concentrationFlags: [
    {
      kind: 'property_over_80',
      severity: 'critical',
      observedPct: 82.9,
      thresholdPct: 80,
      affectedAssets: ['PPOR'],
      remediation: 'Trim property allocation below 80% to defuse concentration risk',
    },
  ],
});

const path = buildRealPath({
  currentYear: 2026,
  targetFireYear: 2040,
  startingNetWorth: 758_000,
  startingMonthlySurplus: 7_500,
  startingMonthlyExpenses: 15_000,
  startingMonthlyPassiveIncome: 0,
  liquidityBufferMonths: demoSignals.liquidityMonths,
  monthlyCashflow: 7_500,
  leverageRatio: 0.58,
  hasInvestmentProperty: false,
  borrowingCapacity: 600_000,
  lifeStage: 'STATE_A_ACCUMULATION',
  targetMonthlyPassiveIncome: 9_000,
  propertyExposurePct: demoSignals.propertyExposurePct,
  cryptoExposurePct: demoSignals.cryptoExposurePct,
  freedPropertyEquity: 1_510_000 - 850_000,
});

const advisorRecs = generateAdvisorRecommendations({
  signals: demoSignals,
  borrowingCapacity: 600_000,
  liquidityBufferMonths: demoSignals.liquidityMonths,
  monthlyCashflow: demoSignals.monthlySurplus,
  pathPenalties: {
    endingShortfallPct: path.endingShortfallPct,
    containsContradiction: path.containsContradiction,
  },
});

const transition = buildRetirementTransition({
  properties: [
    { id: 'ppor', label: 'PPOR (Brisbane)', purchaseYear: 2015, currentValue: 1_510_000, debt: 850_000, annualGrossYieldPct: 0, annualHoldingCostsPct: 0.6, isPPOR: true },
  ],
  household: {
    currentAge: 42,
    dependents: 1,
    targetFireYear: 2040,
    targetMonthlyPassiveIncome: 9_000,
    effectiveTaxRate: 0.32,
    expectedInflationPct: 2.5,
  },
  lifeStage: 'STATE_A_ACCUMULATION',
  liquidPortfolioValue: 135_000,
  hasInvestmentProperty: false,
  liquidityBufferMonths: demoSignals.liquidityMonths,
});

console.log("DEMO HOUSEHOLD SIGNALS:");
console.log(JSON.stringify(demoSignals, null, 2));
console.log("\nDEMO TOP ADVISOR RECOMMENDATION (#1):");
console.log(JSON.stringify(advisorRecs[0], null, 2));
console.log("\nDEMO ADVISOR RECOMMENDATIONS COUNT:", advisorRecs.length);
console.log("\nDEMO RETIREMENT TRANSITION NARRATIVE:");
console.log(JSON.stringify(transition, null, 2));
console.log("\nDEMO REAL PATH OUTPUT:");
console.log(JSON.stringify(path, null, 2));
