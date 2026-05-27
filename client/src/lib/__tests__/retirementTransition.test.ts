/**
 * Sprint 20 PR-B P1-1 — Retirement Transition Engine tests.
 *
 * Run: npx tsx client/src/lib/__tests__/retirementTransition.test.ts
 */

import {
  generatePropertyLiquidationPlan,
} from "../retirementTransition/propertyLiquidationStrategy";
import {
  generateIncomeConversionPlans,
  selectPrimaryConversion,
} from "../retirementTransition/incomeConversionStrategy";
import { projectRetirementIncome } from "../retirementTransition/retirementIncomeProjection";
import {
  generateDecumulationPlans,
  decumulationOutranksAccumulation,
} from "../retirementTransition/decumulationSequencing";
import { composeTransitionNarrative } from "../retirementTransition/transitionNarrative";
import { buildRetirementTransition } from "../retirementTransition";
import type {
  HouseholdProfile,
  PropertyHolding,
} from "../retirementTransition/types";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const HH: HouseholdProfile = {
  currentAge: 58,
  dependents: 0,
  targetFireYear: 2035,
  targetMonthlyPassiveIncome: 20000,
  effectiveTaxRate: 0.32,
  expectedInflationPct: 2.5,
};

const PROPS: PropertyHolding[] = [
  { id: 'ip1', label: 'IP #1', purchaseYear: 2015, currentValue: 750_000, debt: 250_000, annualGrossYieldPct: 4.5, annualHoldingCostsPct: 1.2, isPPOR: false },
  { id: 'ip2', label: 'IP #2', purchaseYear: 2018, currentValue: 920_000, debt: 320_000, annualGrossYieldPct: 3.8, annualHoldingCostsPct: 1.5, isPPOR: false },
  { id: 'ppor', label: 'PPOR', purchaseYear: 2010, currentValue: 1_400_000, debt: 200_000, annualGrossYieldPct: 0, annualHoldingCostsPct: 0, isPPOR: true },
];

console.log("\n── P1-1.1 propertyLiquidationStrategy ──");
{
  const plan = generatePropertyLiquidationPlan(PROPS, HH);
  check("plan returns at least one action", plan.actions.length > 0);
  check("plan has a sell action for an IP", plan.actions.some(a => a.action === 'sell'));
  check("PPOR retained", plan.finalPropertyMix.kept.includes('PPOR'));
  check("every sell action has scheduledYear before targetFireYear+1", plan.actions.filter(a => a.action === 'sell').every(a => a.scheduledYear <= HH.targetFireYear + 1));
  check("totalNetProceeds > 0 when properties sold", plan.totalNetProceeds > 0);
  check("each action carries a numeric reason length > 20", plan.actions.every(a => a.reason.length > 20));
}

console.log("\n── P1-1.2 incomeConversionStrategy ──");
{
  const plans = generateIncomeConversionPlans(2_000_000, HH);
  check("4 plans returned", plans.length === 4);
  check("each plan has yieldRange within (3,7)%", plans.every(p => p.yieldRange.lowPct >= 3 && p.yieldRange.highPct <= 7));
  check("projectedMonthlyIncome positive", plans.every(p => p.projectedMonthlyIncome > 0));
  check("taxAdjustedMonthlyIncome < projectedMonthlyIncome", plans.every(p => p.taxAdjustedMonthlyIncome < p.projectedMonthlyIncome));
  check("sustainabilityScore in [0,1]", plans.every(p => p.sustainabilityScore >= 0 && p.sustainabilityScore <= 1));
  const primary = selectPrimaryConversion(plans, 'balanced');
  check("primary mixed_income selected for balanced", primary?.strategy === 'mixed_income');
}

console.log("\n── P1-1.3 retirementIncomeProjection ──");
{
  const plans = generateIncomeConversionPlans(2_000_000, HH);
  const primary = selectPrimaryConversion(plans, 'balanced')!;
  const proj = projectRetirementIncome(2_000_000, primary, HH);
  check("30 years", proj.years.length === 30);
  check("sustainabilityScore in [0,1]", proj.sustainabilityScore >= 0 && proj.sustainabilityScore <= 1);
  check("first year withdrawalRate < 1", proj.years[0].withdrawalRate < 1);
  check("portfolioValueEoY is finite", proj.years.every(y => Number.isFinite(y.portfolioValueEoY)));
}

console.log("\n── P1-1.4 decumulationSequencing (Scenario 04 lifestage gate) ──");
{
  const planA = generateDecumulationPlans({ lifeStage: 'STATE_A_ACCUMULATION', monthlyTarget: 20_000, liquidAssets: 100_000, propertyEquity: 0, hasInvestmentProperty: false, riskTolerance: 0, liquidityBufferMonths: 6 });
  const planC = generateDecumulationPlans({ lifeStage: 'STATE_C_NEAR_FIRE', monthlyTarget: 20_000, liquidAssets: 100_000, propertyEquity: 0, hasInvestmentProperty: false, riskTolerance: 0, liquidityBufferMonths: 6 });
  const planD = generateDecumulationPlans({ lifeStage: 'STATE_D_FIRE_ACHIEVED', monthlyTarget: 20_000, liquidAssets: 100_000, propertyEquity: 0, hasInvestmentProperty: false, riskTolerance: 0, liquidityBufferMonths: 6 });
  const planE = generateDecumulationPlans({ lifeStage: 'STATE_E_DECUMULATION', monthlyTarget: 20_000, liquidAssets: 100_000, propertyEquity: 0, hasInvestmentProperty: false, riskTolerance: 0, liquidityBufferMonths: 6 });
  check("STATE_C decumulation outranks", decumulationOutranksAccumulation('STATE_C_NEAR_FIRE'));
  check("STATE_D decumulation outranks", decumulationOutranksAccumulation('STATE_D_FIRE_ACHIEVED'));
  check("STATE_E decumulation outranks", decumulationOutranksAccumulation('STATE_E_DECUMULATION'));
  check("STATE_A decumulation does NOT outrank", !decumulationOutranksAccumulation('STATE_A_ACCUMULATION'));
  check("STATE_C top plan is cash_bucket (best sequence-risk defense)", planC[0].sequence === 'cash_bucket');
  check("STATE_E top plan is cash_bucket", planE[0].sequence === 'cash_bucket');
}

console.log("\n── P1-1.5 transitionNarrative (Scenario 04 contains decumulation words) ──");
{
  const transition = buildRetirementTransition({
    properties: PROPS,
    household: HH,
    lifeStage: 'STATE_C_NEAR_FIRE',
    liquidPortfolioValue: 500_000,
  });
  check("transition built", !!transition);
  if (!transition) { console.log("  (skipped narrative checks — transition null)"); }
  else {
    const text = [transition.headline, ...transition.bodyParagraphs, ...transition.milestones.map(m => `${m.label} ${m.detail}`)].join("\n").toLowerCase();
    check("narrative contains $ amount", /\$[\d.,]+[KM]?/.test(transition.headline + " " + transition.bodyParagraphs.join(" ")));
    check("narrative contains a % value", /\d+(?:\.\d+)?%/.test(text));
    check("narrative contains a year (4-digit)", /\b20\d\d\b/.test(text));
    const containsDecumulationWord = /decumulation|glidepath|income conversion|sequence risk|drawdown|decumulation-priority/i.test(text);
    check("Scenario 04 fix — narrative contains decumulation/glidepath/income-conversion/sequence-risk/drawdown", containsDecumulationWord, text.slice(0, 200));
    const noBanned = !/delay property purchase|hold cash|review swr|review your strategy/i.test(text);
    check("no banned vague phrases", noBanned);
    check("milestones >= 1", transition.milestones.length >= 1);
    check("each milestone has detail length > 5", transition.milestones.every(m => m.detail.length > 5));
    check("assumptions >= 3", transition.assumptions.length >= 3);
  }
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
