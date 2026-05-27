/**
 * Sprint 17 Phase 17.6 — calibrated confidence tests.
 *
 * Run: npx tsx client/src/lib/__tests__/calibratedConfidence.test.ts
 */

import { calibrateConfidence } from "../recommendationEngine/calibratedConfidence";
import { bandForCalibrated } from "../confidenceLabels";
import { buildRecommendationContext } from "../recommendationContext/buildContext";
import type { Recommendation, UnifiedSignals } from "../recommendationEngine/types";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

function makeRec(overrides: Partial<Recommendation>): Recommendation {
  return {
    id: "etf_dca",
    title: "test",
    actionType: "etf_dca",
    pillar: "improve_fire_timeline",
    priorityRank: 1,
    confidenceScore: 0.7,
    urgency: "this_quarter",
    riskLevel: "Med",
    expectedFinancialImpact: { annualDollar: 10_000 },
    implementationSteps: [],
    whatCouldChangeRecommendation: [],
    alternativeOptions: [],
    reviewTrigger: { condition: "" },
    sourceSignalsUsed: ["snapshot", "ledger_income_expense", "monte_carlo_v5"],
    surfaces: [],
    reasoning: "",
    ...overrides,
  };
}

// 1. MC inversion structurally impossible: mc=0.38 must NOT yield > 0.48
{
  const rec = makeRec({});
  const signals: UnifiedSignals = {
    mcSurvivalProbability: 0.38,
    cashOutsideOffset: 50_000,
    monthlyIncome: 10_000,
    monthlyExpenses: 6_000,
    debtPortfolio: [],
    riskOverallScore: 60,
    marginalTaxRate: 0.3,
  };
  const cc = calibrateConfidence(rec, signals);
  assert(cc.value <= 0.48, `mc=0.38 cap holds (got ${cc.value})`);
  assert(cc.mcDriven === true, "mcDriven true when MC present");
  assert(cc.displayLabel.includes("probability"), "MC label includes 'probability'");
}

// 2. Non-MC must NOT include "probability" word
{
  const rec = makeRec({});
  const signals: UnifiedSignals = {
    cashOutsideOffset: 50_000,
    monthlyIncome: 10_000,
    monthlyExpenses: 6_000,
  };
  const cc = calibrateConfidence(rec, signals);
  assert(cc.mcDriven === false, "no MC → mcDriven false");
  assert(!cc.displayLabel.toLowerCase().includes("probability"),
    `non-MC label must not say 'probability' (got "${cc.displayLabel}")`);
  assert(/engine fit/i.test(cc.displayLabel), `non-MC says 'engine fit' (got "${cc.displayLabel}")`);
}

// 3. Band classification
{
  assert(bandForCalibrated(0.85) === "VERY_HIGH", "0.85 → VERY_HIGH");
  assert(bandForCalibrated(0.70) === "HIGH", "0.70 → HIGH");
  assert(bandForCalibrated(0.45) === "MEDIUM", "0.45 → MEDIUM");
  assert(bandForCalibrated(0.20) === "LOW", "0.20 → LOW");
}

// 4. Components populated
{
  const rec = makeRec({});
  const signals: UnifiedSignals = { mcSurvivalProbability: 0.7 };
  const cc = calibrateConfidence(rec, signals);
  assert(typeof cc.components.mcSuccessProb === "number", "mcSuccessProb populated");
  assert(typeof cc.components.dataCompleteness === "number", "completeness populated");
  assert(typeof cc.components.modelCertainty === "number", "certainty populated");
  assert(typeof cc.components.inputStability === "number", "stability populated");
}

// 5. Scenario 14 (unreachable) — low calibrated value
{
  const inputs = {
    snapshot: { cash: 5_000, monthly_income: 3_500, monthly_expenses: 3_400, current_age: 60 },
  };
  const goal = {
    status: "SET", targetFireAge: 65, targetPassiveMonthly: 8_000, swrPct: 0.04,
    targetPassiveAnnual: 96_000, targetNetWorth: 2_400_000,
    goalSetTimestamp: "", source: "mc_fire_settings",
  };
  const ctx = buildRecommendationContext(inputs as any, goal as any);
  const rec = makeRec({});
  const signals: UnifiedSignals = {
    mcSurvivalProbability: 0.1,
    baselineSuccessProb: 0.05,
  };
  const cc = calibrateConfidence(rec, signals, ctx);
  assert(cc.band === "LOW", `unreachable scenario → LOW band (got ${cc.band})`);
}

console.log(process.exitCode ? "FAILED" : "PASSED");
