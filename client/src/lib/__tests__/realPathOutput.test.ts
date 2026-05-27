/**
 * Sprint 20 PR-B P1-4 — Real Financial Path Output tests.
 *
 * Run: npx tsx client/src/lib/__tests__/realPathOutput.test.ts
 */

import { buildRealPath } from "../recommendationOptimization/realPathOutput";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const baseInputs = {
  currentYear: 2026,
  targetFireYear: 2035,
  startingNetWorth: 758_000,
  startingMonthlySurplus: 7_500,
  startingMonthlyExpenses: 15_000,
  startingMonthlyPassiveIncome: 0,
  liquidityBufferMonths: 6,
  monthlyCashflow: 7_500,
  leverageRatio: 0.42,
  hasInvestmentProperty: true,
  borrowingCapacity: 300_000,
  lifeStage: 'STATE_A_ACCUMULATION' as const,
  targetMonthlyPassiveIncome: 20_000,
};

console.log("\n── Basic timeline shape ──");
{
  const path = buildRealPath(baseInputs);
  check("at least 4 steps", path.steps.length >= 4);
  check("every step has numeric year >= currentYear", path.steps.every(s => Number.isFinite(s.year) && s.year >= baseInputs.currentYear));
  check("every step has expectedPassiveIncome finite", path.steps.every(s => Number.isFinite(s.expectedPassiveIncome)));
  check("every step has expectedNetWorth finite", path.steps.every(s => Number.isFinite(s.expectedNetWorth)));
  check("every step has sustainability in [0,1]", path.steps.every(s => s.retirementSustainabilityScore >= 0 && s.retirementSustainabilityScore <= 1));
  check("every step has downsideRisk in [0,1]", path.steps.every(s => s.downsideRiskAt95thPercentile >= 0 && s.downsideRiskAt95thPercentile <= 1));
  check("steps include income_conversion at targetFireYear", path.steps.some(s => s.kind === 'income_conversion' && s.year === baseInputs.targetFireYear));
}

console.log("\n── Scenario 08 fix: negative cashflow → operational stabilisation prepended ──");
{
  const negCashflow = buildRealPath({ ...baseInputs, monthlyCashflow: -500 });
  check("top step is operational_stabilisation when monthlyCashflow < 0", negCashflow.steps[0].kind === 'operational_stabilisation');
  check("top step priority is +Infinity", negCashflow.steps[0].priority === Number.POSITIVE_INFINITY);
}

console.log("\n── Liquidity < 1 month also triggers stabilisation ──");
{
  const noBuffer = buildRealPath({ ...baseInputs, liquidityBufferMonths: 0.5, monthlyCashflow: 100 });
  check("top step is operational_stabilisation when buffer < 1mo", noBuffer.steps[0].kind === 'operational_stabilisation');
}

console.log("\n── Suppress 'Buy IP' when borrowingCapacity ≤ 0 ──");
{
  const noBorrow = buildRealPath({ ...baseInputs, borrowingCapacity: -50_000 });
  check("no buy_investment_property step", !noBorrow.steps.some(s => s.kind === 'buy_investment_property'));
  check("notes mention suppression", noBorrow.notes.some(n => /Buy IP/i.test(n)));
}

console.log("\n── Shortfall reporting ──");
{
  const path = buildRealPath(baseInputs);
  check("targetMonthlyPassiveIncome echoed", path.targetMonthlyPassiveIncome === baseInputs.targetMonthlyPassiveIncome);
  check("shortfallVsTargetPct in [0,1]", path.shortfallVsTargetPct >= 0 && path.shortfallVsTargetPct <= 1);
  if (!path.livesUpToTarget) {
    check("when shortfall > 10%, notes explicitly call it out", path.notes.some(n => /short/i.test(n)));
  } else {
    check("when livesUpToTarget true, no shortfall note needed", true);
  }
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
