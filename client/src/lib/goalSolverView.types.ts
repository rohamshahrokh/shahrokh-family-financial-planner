/**
 * goalSolverView.types.ts — Sprint 12 advisor-style view shapes.
 *
 * Types only. Every field below is derived from existing Sprint 10
 * GoalSolverProResult outputs in selectors. No new financial calculations.
 */

export interface FireGapSummary {
  /**
   * REMEDIATION B-1: must come from ledger (selectCanonicalNetWorth) — NEVER
   * from a forecast P50 fallback. Pass `ledgerNetWorth` into
   * selectFireGapSummary; if absent, this stays null.
   */
  currentNetWorth: number | null;
  /**
   * REMEDIATION B-1: when the user has not set a goal, target is null and the
   * UI must render "Goal not set" instead of inventing a default.
   */
  targetNetWorth: number | null;
  netWorthGap: number | null;
  currentPassiveIncome: number | null;
  targetPassiveIncome: number | null;
  passiveIncomeGap: number | null;
  currentProbability: number | null;
  requiredProbability: number | null;
  /**
   * REMEDIATION B-6: 'canonical' when read from the user's saved goal config,
   * 'default' when falling back to the hardcoded 0.70 bar. UIs should tag the
   * value as "(default)" when source is 'default'.
   */
  requiredProbabilitySource: "canonical" | "default";
  targetFireYear: number | null;
  medianFireYear: number | null;
  /**
   * REMEDIATION B-1: true when the user has not saved a FIRE goal. UIs should
   * render "Goal not set" for target/gap cells but still show ledger-derived
   * Current NW.
   */
  goalNotSet: boolean;
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
