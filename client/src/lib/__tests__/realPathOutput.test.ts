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

console.log("\n── Sprint 20 PR-B fix-up Defect 2: suppress buy_investment_property when propertyExposurePct > 80 ──");
{
  const propertyHeavy = buildRealPath({ ...baseInputs, propertyExposurePct: 82.9, hasInvestmentProperty: true });
  check("no buy_investment_property step when property > 80%", !propertyHeavy.steps.some(s => s.kind === 'buy_investment_property'));
  check("notes mention the property-concentration suppression", propertyHeavy.notes.some(n => /property exposure .* > 80%/i.test(n)), propertyHeavy.notes.join(' | '));
  check("path contains a sell_investment_property trim step instead", propertyHeavy.steps.some(s => s.kind === 'sell_investment_property' && /under 80%/i.test(s.title + s.detail)));
  check("containsContradiction stays false because we suppressed the contradictory candidate", propertyHeavy.containsContradiction === false);
}

console.log("\n── Sprint 20 PR-B fix-up Defect 2: suppress crypto-additive steps when cryptoExposurePct > 30 ──");
{
  const cryptoHeavy = buildRealPath({ ...baseInputs, cryptoExposurePct: 45, propertyExposurePct: 10 });
  check("no reallocate_into_etfs step (crypto suppression includes additive ETFs)", !cryptoHeavy.steps.some(s => s.kind === 'reallocate_into_etfs'));
  check("notes mention crypto suppression", cryptoHeavy.notes.some(n => /crypto exposure .* > 30%/i.test(n)));
}

console.log("\n── Sprint 20 PR-B fix-up Defect 2: realistic reallocation amount ──");
{
  const path = buildRealPath(baseInputs);
  const reallocStep = path.steps.find(s => s.kind === 'reallocate_into_etfs');
  // For baseInputs: annualSurplus 90K * 9 years * 0.4 = 324K floor 50K
  check("reallocation amount scales with surplus * yearsToTarget (>= 200K for baseInputs)", !!reallocStep && /\$3\d\dK|\$[2-9]\d\dK/.test(reallocStep.title), reallocStep?.title);
}

console.log("\n── Sprint 20 PR-B fix-up Defect 2: endingShortfallPct + containsContradiction exposed ──");
{
  const path = buildRealPath(baseInputs);
  check("endingShortfallPct is a finite number in [0,1]", Number.isFinite(path.endingShortfallPct) && path.endingShortfallPct >= 0 && path.endingShortfallPct <= 1);
  check("containsContradiction is a boolean", typeof path.containsContradiction === 'boolean');
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
