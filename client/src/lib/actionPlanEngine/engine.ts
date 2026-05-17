/**
 * Action Plan Engine — converts V2 recommendations into executable plans.
 *
 * Important: this module does not produce its own *recommendations*. It
 * decorates existing V2 recommendations with concrete plan numbers
 * (e.g. monthly savings, deposit target, payoff order). Every plan carries
 * the originating `recommendationId` so the UI can trace back to V2.
 */

import type {
  AnyActionPlan,
  ActionPlanInputs,
  ActionPlanReport,
  DebtActionPlan,
  FireActionPlan,
  PropertyActionPlan,
} from './types';
import type { Recommendation, UnifiedSignals } from '../recommendationEngine/types';

function isProperty(rec: Recommendation): boolean {
  return rec.actionType === 'proceed_property_purchase' || rec.actionType === 'delay_property_purchase';
}
function isFire(rec: Recommendation): boolean {
  return rec.actionType === 'fire_acceleration' || rec.actionType === 'etf_dca' || rec.actionType === 'increase_super';
}
function isDebt(rec: Recommendation): boolean {
  return rec.actionType === 'pay_high_interest_debt' || rec.actionType === 'reduce_leverage' ||
         rec.actionType === 'hold_cash_offset' || rec.actionType === 'refinance_restructure';
}

function buildProperty(rec: Recommendation, s: UnifiedSignals): PropertyActionPlan {
  const idealLVR = 0.8;
  const surplus = s.monthlySurplus ?? 0;
  const monthlyExp = s.monthlyExpenses ?? 0;
  const grossAnnual = s.rohamGrossAnnual ?? 0;
  const borrowingPower = grossAnnual > 0 ? Math.round(grossAnnual * 5.5) : undefined;
  const maxSafePrice = borrowingPower != null && s.depositPower != null
    ? Math.round(Math.min(borrowingPower + s.depositPower, (s.depositPower / (1 - idealLVR))))
    : undefined;
  const idealDeposit = maxSafePrice != null ? Math.round(maxSafePrice * (1 - idealLVR)) : undefined;
  const requiredOffset = monthlyExp > 0 ? monthlyExp * 6 : undefined;

  const newMortgageRepay = maxSafePrice != null && s.mortgageRate != null
    ? Math.round(((maxSafePrice * idealLVR) * (s.mortgageRate / 12)))
    : undefined;
  const serviceabilityRatio = newMortgageRepay && newMortgageRepay > 0
    ? Math.max(0, Math.round((surplus / newMortgageRepay) * 100) / 100)
    : undefined;

  const readiness = s.depositReadinessPct ?? 0;
  const window: PropertyActionPlan['purchaseWindow'] =
    rec.actionType === 'proceed_property_purchase' && readiness >= 0.95 ? 'this_quarter'
    : readiness >= 0.7 ? 'this_year'
    : readiness > 0.4 ? '12_24_months'
    : 'monitor';

  const remaining = idealDeposit != null && s.depositPower != null
    ? Math.max(0, idealDeposit - s.depositPower) : undefined;
  const monthlySavingsTarget = remaining != null && surplus > 0 ? Math.round(Math.min(remaining / 12, Math.max(surplus, 500))) : undefined;
  const timelineMonths = remaining != null && monthlySavingsTarget && monthlySavingsTarget > 0
    ? Math.ceil(remaining / monthlySavingsTarget) : undefined;

  return {
    kind: 'property',
    recommendationId: rec.id,
    purchaseWindow: window,
    targetCashBufferMonths: 6,
    requiredMonthlySurplus: Math.max(2000, Math.round(surplus * 0.6)),
    borrowingPowerEstimate: borrowingPower,
    maxSafePurchasePrice: maxSafePrice,
    idealDeposit,
    idealLVRPct: idealLVR * 100,
    requiredOffset,
    serviceabilityRatio,
    monthlySavingsTarget,
    timelineMonthsToReady: timelineMonths,
  };
}

function buildFire(rec: Recommendation, s: UnifiedSignals): FireActionPlan {
  const monthlyInvest = s.fireMonthlyInvestmentRequired ?? 0;
  const annualInvest = Math.round(monthlyInvest * 12);
  const monthlyIncome = s.monthlyIncome ?? 0;
  const savingsRate = monthlyIncome > 0 ? Math.max(0, Math.min(1, (s.monthlySurplus ?? 0) / monthlyIncome)) : 0;
  const fireYear = s.fireYearsToTarget != null ? new Date().getFullYear() + Math.round(s.fireYearsToTarget) : undefined;
  const targetPortfolio = (s.monthlyExpenses ?? 0) * 12 * 25;

  return {
    kind: 'fire',
    recommendationId: rec.id,
    targetPortfolio: targetPortfolio > 0 ? Math.round(targetPortfolio) : 0,
    annualInvestmentTarget: annualInvest,
    savingsRatePct: savingsRate,
    dcaMonthly: monthlyInvest,
    expectedFireYear: fireYear,
    fireProbability: s.mcSurvivalProbability,
    riskToFireProbability: s.mcSurvivalProbability != null ? 1 - s.mcSurvivalProbability : undefined,
  };
}

function buildDebt(rec: Recommendation, s: UnifiedSignals): DebtActionPlan {
  const items: DebtActionPlan['payoffOrder'] = [];
  if ((s.personalDebtRate ?? 0) > 0 && (s.otherDebts ?? 0) > 0) {
    items.push({ label: 'Personal / credit', balance: s.otherDebts, rate: s.personalDebtRate, priorityRank: 1 });
  }
  if ((s.mortgageRate ?? 0) > 0 && (s.mortgage ?? 0) > 0) {
    items.push({ label: 'Mortgage (offset first)', balance: s.mortgage, rate: s.mortgageRate, priorityRank: 2 });
  }
  // sort highest-rate first.
  items.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  items.forEach((it, idx) => (it.priorityRank = idx + 1));

  const personalSavings = (s.otherDebts ?? 0) * (s.personalDebtRate ?? 0);
  const offsetSavings = Math.max(0, (s.cashOutsideOffset ?? 0) - (s.emergencyBufferTarget ?? 0))
    * (s.mortgageRate ?? 0);
  const interestSaved = Math.round(personalSavings + offsetSavings);

  return {
    kind: 'debt',
    recommendationId: rec.id,
    payoffOrder: items,
    interestSavedAnnual: interestSaved,
    refinanceThresholdPct: 0.5,
    offsetOptimisationDollar: Math.round(offsetSavings),
    breakEvenMonths: rec.actionType === 'refinance_restructure' ? 18 : undefined,
  };
}

export function buildActionPlans(input: ActionPlanInputs): ActionPlanReport {
  const plans: AnyActionPlan[] = [];
  for (const rec of input.recommendations) {
    if (isProperty(rec)) plans.push(buildProperty(rec, input.signals));
    else if (isFire(rec)) plans.push(buildFire(rec, input.signals));
    else if (isDebt(rec)) plans.push(buildDebt(rec, input.signals));
  }
  return { plans, generatedAt: new Date().toISOString() };
}

export function explainabilityFor(rec: Recommendation, s: UnifiedSignals): {
  drivers: string[];
  confidence: number;
  assumptions: string[];
  downsideIfIgnored: string;
  whatWouldChange: string[];
  sensitivity: Array<{ variable: string; deltaPct: number; impact: string }>;
} {
  const drivers: string[] = [];
  drivers.push(`Pillar: ${rec.pillar}`);
  if (rec.expectedFinancialImpact?.annualDollar)
    drivers.push(`Expected $${Math.round(rec.expectedFinancialImpact.annualDollar).toLocaleString()}/yr impact`);
  if (rec.fireImpact?.yearsDelta)
    drivers.push(`${rec.fireImpact.yearsDelta > 0 ? '+' : ''}${rec.fireImpact.yearsDelta.toFixed(1)}yr FIRE shift`);
  if (rec.liquidityImpact?.deltaRunwayMonths != null)
    drivers.push(`${rec.liquidityImpact.deltaRunwayMonths > 0 ? '+' : ''}${rec.liquidityImpact.deltaRunwayMonths.toFixed(1)}mo runway change`);
  if (rec.riskReductionImpact?.points)
    drivers.push(`-${rec.riskReductionImpact.points}pts risk`);
  if (rec.urgency) drivers.push(`Urgency: ${rec.urgency}`);

  const assumptions: string[] = [];
  if (s.etfExpectedReturn) assumptions.push(`ETF expected return ${(s.etfExpectedReturn * 100).toFixed(1)}%`);
  if (s.mortgageRate) assumptions.push(`Mortgage rate ${(s.mortgageRate * 100).toFixed(2)}%`);
  if (s.marginalTaxRate) assumptions.push(`Marginal tax ${(s.marginalTaxRate * 100).toFixed(0)}%`);

  return {
    drivers: drivers.slice(0, 5),
    confidence: rec.confidenceScore,
    assumptions,
    downsideIfIgnored: rec.whatCouldChangeRecommendation?.[0] ?? 'Reduced progress on the highest-priority pillar.',
    whatWouldChange: rec.whatCouldChangeRecommendation ?? [],
    sensitivity: [
      { variable: 'ETF return', deltaPct: -2, impact: 'FIRE pushes out ~1 year' },
      { variable: 'Mortgage rate', deltaPct: +1, impact: 'serviceability tightens; refi value rises' },
      { variable: 'Income', deltaPct: -10, impact: 'liquidity gates trigger faster' },
    ],
  };
}
