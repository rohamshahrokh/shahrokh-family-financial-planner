/**
 * Sprint 18 — End-to-end engine integration smoke test.
 *
 * Runs computeUnifiedRecommendations on a representative scenario and
 * asserts the new Sprint 18 fields are populated on the bestMove and the
 * result has a bestPath.
 */

import { buildRecommendationContext } from "../recommendationContext/buildContext";
import { computeUnifiedRecommendations } from "../recommendationEngine/engine";
import { fromContext, mergeSignals } from "../recommendationEngine/adapters";

function expect(name: string, cond: boolean, info?: string) {
  const flag = cond ? "PASS" : "FAIL";
  console.log(`[${flag}] ${name}${info ? " — " + info : ""}`);
  if (!cond) process.exitCode = 1;
}

const ledger: any = {
  snapshot: {
    cash: 20000,
    offset_balance: 95000,
    mortgage: 850000,
    other_debts: 14500,
    ppor: 1200000,
    monthly_income: 18000,
    monthly_expenses: 11200,
    roham_gross_annual: 216000,
    current_age: 42,
    num_dependents: 2,
    state: "QLD",
    mortgage_rate: 0.0582,
  },
  properties: [{ current_value: 1200000, mortgage_balance: 850000 }],
};

const goal = {
  status: "SET",
  targetFireAge: 55,
  targetPassiveMonthly: 9000,
  swrPct: 0.04,
};

const ctx = buildRecommendationContext(ledger, goal);
const baseSignals: any = {
  cashOutsideOffset: 20000,
  offsetBalance: 95000,
  mortgage: 850000,
  otherDebts: 14500,
  ppor: 1200000,
  monthlyIncome: 18000,
  monthlyExpenses: 11200,
  monthlySurplus: 6800,
  rohamGrossAnnual: 216000,
  marginalTaxRate: 0.39,
  mortgageRate: 0.0582,
  expensesIncludeDebt: true,
  recommendationContext: ctx,
};

const signals = mergeSignals(baseSignals, fromContext(ctx));
const result = computeUnifiedRecommendations(signals);

expect("bestMove exists", !!result.bestMove);
expect("top3 has at least 1", result.topPriorities.length >= 1);
expect("bestMove has feasibility", !!result.bestMove?.feasibility);
expect("bestMove has behaviouralRisk", !!result.bestMove?.behaviouralRisk);
expect("bestMove has stressTest", !!result.bestMove?.stressTest);
expect("bestMove has advisorExplanation", !!result.bestMove?.advisorExplanation);
expect("advisor explanation has 11 fields", (() => {
  const ae = result.bestMove?.advisorExplanation;
  if (!ae) return false;
  const required = [
    "recommendedAction", "whyThisAction", "whyNotAlternatives",
    "baselineComparison", "expectedImprovement", "feasibilityStatus",
    "keyRisk", "stressTestResult", "behaviouralNote",
    "confidenceExplanation", "nextPracticalStep",
  ];
  return required.every((k) => typeof (ae as any)[k] === "string" && (ae as any)[k].length > 0);
})());
expect("result has bestPath", !!result.bestPath);
expect("result has candidatePaths >= 2", (result.candidatePaths ?? []).length >= 2);
expect(
  "bestPath has stressTest summary",
  !!(result.bestPath && result.bestPath.stressTest),
);
expect(
  "bestPath has behaviouralNote",
  !!(result.bestPath && result.bestPath.behaviouralNote && result.bestPath.behaviouralNote.length > 0),
);
expect(
  "stressTest scenarios = 8",
  result.bestMove?.stressTest?.scenariosTested === 8,
  `got ${result.bestMove?.stressTest?.scenariosTested}`,
);

console.log("---");
console.log("BestMove:", result.bestMove?.title);
console.log("Pillar:", result.bestMove?.pillar);
console.log("Feasibility:", result.bestMove?.feasibility?.summary);
console.log("Behavioural note:", result.bestMove?.behaviouralRisk?.note);
console.log("Stress:", `${result.bestMove?.stressTest?.scenariosSurvived}/${result.bestMove?.stressTest?.scenariosTested}`);
console.log("Best path:", result.bestPath?.title, `score=${result.bestPath?.score}`);
console.log("Candidate paths:", result.candidatePaths?.map((p: any) => `${p.archetype}=${p.score}`).join(", "));
