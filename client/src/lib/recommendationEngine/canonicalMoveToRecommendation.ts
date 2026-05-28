/**
 * canonicalMoveToRecommendation.ts — Sprint 20 PR-F2.
 *
 * Parallel adapter to `legacyBestMoveToRecommendation`: converts a canonical
 * `RankedMove` (from `rankMove`) into the existing `Recommendation` shape
 * the UI consumes. `legacyBestMoveToRecommendation` is INTENTIONALLY NOT
 * MODIFIED (Sprint 20 user constraint); this file is the parallel pathway
 * required by the PR-F2 spec.
 *
 * Why two adapters: the legacy adapter wraps `BestMoveResult` from the
 * old `bestMoveEngine`. This adapter wraps `RankedMove` from the new
 * `rankMove` ranking entrypoint. They emit the same downstream `Recommendation`
 * so UI surfaces don't fork.
 */

import type { RankedMove, CanonicalMoveId } from "@/types/canonicalMove";
import type {
  ActionType,
  Recommendation,
  StrategicPillar,
} from "./types";

/**
 * Convert a `CanonicalMoveId` → `ActionType` from the existing recommendation
 * contract. The mapping is intentionally narrow: each canonical move maps
 * to exactly one action type so downstream consumers can route on actionType.
 */
function moveIdToActionType(id: CanonicalMoveId): ActionType {
  switch (id) {
    case "sell_investment_property": return "reduce_leverage";
    case "refinance_ppor":            return "refinance_restructure";
    case "extra_super_contribution":  return "increase_super";
    case "extra_etf_dca":             return "etf_dca";
    case "debt_recycling":            return "tax_optimisation";
  }
}

function moveIdToPillar(id: CanonicalMoveId): StrategicPillar {
  switch (id) {
    case "sell_investment_property": return "stabilise_leverage";
    case "refinance_ppor":            return "preserve_tax_efficiency";
    case "extra_super_contribution":  return "preserve_tax_efficiency";
    case "extra_etf_dca":             return "improve_fire_timeline";
    case "debt_recycling":            return "improve_fire_timeline";
  }
}

function moveIdToTitle(id: CanonicalMoveId): string {
  switch (id) {
    case "sell_investment_property": return "Sell investment property";
    case "refinance_ppor":            return "Refinance PPOR";
    case "extra_super_contribution":  return "Increase concessional super";
    case "extra_etf_dca":             return "Increase ETF DCA";
    case "debt_recycling":            return "Debt recycling";
  }
}

/**
 * Map the canonical heuristic confidence label to the legacy
 * Recommendation.confidenceScore numeric field.
 *
 * NOTE: this numeric field exists on the legacy contract. The CANONICAL
 * confidence is the heuristic string label on `RankedMove.confidence` —
 * downstream surfaces should prefer to read that. The numeric here is a
 * faithful mapping (high→0.85, medium→0.65, low→0.4) and is NEVER
 * labelled as a probability in user-facing copy.
 */
function confidenceToScore(c: RankedMove["confidence"]): number {
  switch (c) {
    case "high":   return 0.85;
    case "medium": return 0.65;
    case "low":    return 0.4;
  }
}

/**
 * The single conversion fn from the new canonical ranking to the legacy
 * Recommendation shape. UI continues to consume `Recommendation` so we don't
 * need to touch the rendering pipeline.
 */
export function canonicalMoveToRecommendation(ranked: RankedMove): Recommendation {
  const id = ranked.moveId;
  const fireDelta = ranked.expectedFireDateDelta;
  // Years pulled earlier, with months as fraction.
  const yearsDelta = fireDelta.years + fireDelta.months / 12;
  return {
    id: `f2:${id}`,
    title: moveIdToTitle(id),
    actionType: moveIdToActionType(id),
    pillar: moveIdToPillar(id),
    priorityRank: 1, // ranking is the ordering, not this field
    confidenceScore: confidenceToScore(ranked.confidence),
    urgency: "this_quarter",
    riskLevel:
      ranked.downsideRisk.variancePercentile5 >= 0.25 ? "High"
      : ranked.downsideRisk.variancePercentile5 >= 0.12 ? "Med"
      : "Low",
    expectedFinancialImpact: {
      annualDollar: ranked.cashFlowImpactMonthly * 12,
      label:
        ranked.cashFlowImpactMonthly >= 0
          ? `+$${Math.round(ranked.cashFlowImpactMonthly).toLocaleString()}/mo cashflow`
          : `−$${Math.round(-ranked.cashFlowImpactMonthly).toLocaleString()}/mo cashflow (reinvested)`,
      confidence: confidenceToScore(ranked.confidence),
    },
    fireImpact: { yearsDelta },
    netWorthImpact: { horizonYears: 25, delta: ranked.expectedNetWorthDelta25y },
    implementationSteps: [{ step: ranked.rankRationale }],
    whatCouldChangeRecommendation: [
      "Household NW, monthly surplus, or property cashflow changes by more than 10%",
      "Mortgage rate moves by ±50 bps",
      "Marginal tax rate changes",
    ],
    alternativeOptions: [],
    reviewTrigger: { condition: "Refresh when household snapshot changes" },
    sourceSignalsUsed: ["snapshot", "fire_engine", "household_state"],
    surfaces: ["best_move", "action_centre", "fire"],
    reasoning: ranked.rankRationale,
    benefitLabel: ranked.confidenceRationale,
  };
}
