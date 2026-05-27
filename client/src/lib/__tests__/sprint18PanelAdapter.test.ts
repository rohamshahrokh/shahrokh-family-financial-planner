/**
 * Sprint 18 Phase 18.6 — Panel adapter test.
 *
 * Confirms buildRecommendedActions propagates Sprint 18 fields
 * (feasibilityStatus, stressTestResult, behaviouralNote, etc.) from the
 * unified recommendation result to the RecommendedAction shape.
 */

import { buildRecommendedActions } from "../recommendedActionsAdapter";

function expect(name: string, cond: boolean, info?: string) {
  const flag = cond ? "PASS" : "FAIL";
  console.log(`[${flag}] ${name}${info ? " — " + info : ""}`);
  if (!cond) process.exitCode = 1;
}

const fakeUnified: any = {
  bestMove: null,
  topPriorities: [
    {
      id: "etf_dca",
      title: "Start ETF DCA",
      actionType: "etf_dca",
      pillar: "improve_fire_timeline",
      confidenceScore: 0.78,
      expectedFinancialImpact: { annualDollar: 12000, label: "$12K/yr" },
      reasoning: "DCA into diversified ETFs.",
      sourceSignalsUsed: ["fire_engine", "ledger_income_expense"],
      surfaces: ["best_move"],
      advisorExplanation: {
        recommendedAction: "DCA",
        whyThisAction: "—",
        whyNotAlternatives: "—",
        baselineComparison: "Baseline 65% MC success.",
        expectedImprovement: "—",
        feasibilityStatus: "Feasible — deploy $1000/mo.",
        keyRisk: "—",
        stressTestResult: "Stress test: survives 7 of 8 scenarios.",
        behaviouralNote: "Low-friction plan.",
        confidenceExplanation: "78% Monte Carlo.",
        nextPracticalStep: "Set up DCA today.",
      },
      feasibility: { feasible: true, summary: "Feasible — deploy $1000/mo." },
      behaviouralRisk: { note: "Low-friction plan." },
      stressTest: { scenariosSurvived: 7, scenariosTested: 8 },
    },
  ],
  all: [],
  riskBeingReduced: "—",
  signalCoverage: [],
  generatedAt: "2026-05-27",
  bestPath: { title: "Liquid-growth path", score: 84 },
};

const actions = buildRecommendedActions({ unified: fakeUnified });
expect("at least one action returned", actions.length >= 1);
const a = actions[0];
expect("feasibilityStatus propagated", a.feasibilityStatus === "Feasible — deploy $1000/mo.");
expect("stressTestResult propagated", a.stressTestResult === "Stress test: survives 7 of 8 scenarios.");
expect("behaviouralNote propagated", a.behaviouralNote === "Low-friction plan.");
expect("confidenceExplanation propagated", a.confidenceExplanation === "78% Monte Carlo.");
expect("bestPathLabel populated", a.bestPathLabel === "Liquid-growth path (84/100)");
expect("baselineComparison propagated", a.baselineComparison === "Baseline 65% MC success.");
expect("nextPracticalStep propagated", a.nextPracticalStep === "Set up DCA today.");
console.log("Sprint 18 panel-adapter test complete");
