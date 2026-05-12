/**
 * Tax Policy Engine — Decision Engine Weights
 *
 * Spec §14 — user-editable weights for the composite Decision score.
 * Defaults match the spec (25/20/15/15/10/10/-5) but the user can override
 * any of them via the Assumption Centre.
 *
 * Full scoring wiring lands in P2; P0 exposes the rails so the user can
 * already see + edit the inputs.
 */

export interface DecisionEngineWeights {
  netWorth: number;
  fireTiming: number;
  cashflowSurvival: number;
  liquidity: number;
  taxEfficiency: number;
  downsideProtection: number;
  /** Negative-only term in the composite (subtracted, expressed as positive %). */
  policyRiskPenalty: number;
}

/** Spec §14 defaults: 25/20/15/15/10/10/-5. Sum of positive terms = 95. */
export const DEFAULT_DECISION_ENGINE_WEIGHTS: DecisionEngineWeights = {
  netWorth: 0.25,
  fireTiming: 0.20,
  cashflowSurvival: 0.15,
  liquidity: 0.15,
  taxEfficiency: 0.10,
  downsideProtection: 0.10,
  policyRiskPenalty: 0.05,
};

/**
 * Apply weights to a per-axis 0..1 score vector and produce the composite.
 * Policy risk is SUBTRACTED.
 */
export interface DecisionAxisScores {
  netWorth: number;          // 0..1
  fireTiming: number;        // 0..1
  cashflowSurvival: number;  // 0..1
  liquidity: number;         // 0..1
  taxEfficiency: number;     // 0..1
  downsideProtection: number;// 0..1
  policyRisk: number;        // 0..1 — exposure to reform risk (1 = max exposure)
}

export function compositeDecisionScore(
  scores: DecisionAxisScores,
  weights: DecisionEngineWeights = DEFAULT_DECISION_ENGINE_WEIGHTS,
): number {
  return (
    scores.netWorth * weights.netWorth +
    scores.fireTiming * weights.fireTiming +
    scores.cashflowSurvival * weights.cashflowSurvival +
    scores.liquidity * weights.liquidity +
    scores.taxEfficiency * weights.taxEfficiency +
    scores.downsideProtection * weights.downsideProtection -
    scores.policyRisk * weights.policyRiskPenalty
  );
}
