/**
 * goalSolverView.types.ts — Sprint 12 advisor-style view shapes.
 *
 * Types only. Every field below is derived from existing Sprint 10
 * GoalSolverProResult outputs in selectors. No new financial calculations.
 */

export interface FireGapSummary {
  currentNetWorth: number | null;
  targetNetWorth: number | null;
  netWorthGap: number | null;
  currentPassiveIncome: number | null;
  targetPassiveIncome: number | null;
  passiveIncomeGap: number | null;
  currentProbability: number | null;
  requiredProbability: number | null;
  targetFireYear: number | null;
  medianFireYear: number | null;
}

export interface Top3Action {
  label: string;
  rationale?: string;
  netWorthDelta: number | null;
  passiveIncomeDelta: number | null;
  probabilityDelta: number | null;
  dueYear?: number;
  sourceStrategyId?: string;
}

export type PathRecommendationKind =
  | "fastest"
  | "highest-prob"
  | "safest"
  | "hybrid"
  | "lowest-cash";

export interface PathRecommendation {
  kind: PathRecommendationKind;
  label: string;
  strategyLabel: string | null;
  expectedFireYear: number | null;
  expectedNetWorth: number | null;
  expectedPassiveIncome: number | null;
  probability: number | null;
  actions: string[];
}

export interface RankedBlocker {
  rank: number;
  label: string;
  currentValue: string | null;
  requiredChange: string | null;
  estimatedImpactNetWorth: number | null;
  estimatedImpactProbability: number | null;
}

export interface MinimumChange {
  changeType: string;
  magnitude: string;
  expectedProbability: number | null;
  sourceStrategyId: string;
}

export interface DoNothingComparison {
  baselineFireYear: number | null;
  recommendedFireYear: number | null;
  baselineNetWorth: number | null;
  recommendedNetWorth: number | null;
  baselineProbability: number | null;
  recommendedProbability: number | null;
  baselinePassiveIncome: number | null;
  recommendedPassiveIncome: number | null;
}
