/**
 * Advisor-grade Action Plan Engine — types
 *
 * Consumes Recommendation V2 outputs and produces executable plans without
 * generating any parallel advice surface. Action plans are *expansions* of
 * existing V2 recommendations — every plan carries the recommendation id.
 */

import type { Recommendation, UnifiedSignals } from '../recommendationEngine/types';

export interface PropertyActionPlan {
  kind: 'property';
  recommendationId: string;
  purchaseWindow: 'now' | 'this_quarter' | 'this_year' | '12_24_months' | 'monitor';
  targetCashBufferMonths: number;
  requiredMonthlySurplus: number;
  borrowingPowerEstimate?: number;
  maxSafePurchasePrice?: number;
  idealDeposit?: number;
  idealLVRPct?: number;
  requiredOffset?: number;
  serviceabilityRatio?: number;       // surplus / new mortgage repayment
  monthlySavingsTarget?: number;
  timelineMonthsToReady?: number;
}

export interface FireActionPlan {
  kind: 'fire';
  recommendationId: string;
  targetPortfolio: number;
  annualInvestmentTarget: number;
  savingsRatePct: number;             // 0..1
  dcaMonthly: number;
  expectedFireYear?: number;
  fireProbability?: number;           // 0..1
  riskToFireProbability?: number;     // 0..1
}

export interface DebtActionPlan {
  kind: 'debt';
  recommendationId: string;
  payoffOrder: Array<{ label: string; balance?: number; rate?: number; priorityRank: number }>;
  interestSavedAnnual?: number;
  breakEvenMonths?: number;
  refinanceThresholdPct?: number;
  offsetOptimisationDollar?: number;
}

export type AnyActionPlan = PropertyActionPlan | FireActionPlan | DebtActionPlan;

export interface ActionPlanReport {
  plans: AnyActionPlan[];
  generatedAt: string;
}

export interface ActionPlanInputs {
  recommendations: Recommendation[];
  signals: UnifiedSignals;
}
