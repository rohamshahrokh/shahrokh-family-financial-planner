/**
 * Sprint 20 PR-B P1-2 — advisorExplanation facade.
 *
 * The original Sprint 18 advisorExplanation.ts failed independent review;
 * per the Sprint 20 charter we keep this file path as a thin facade and
 * redirect all exports to the new `advisorNarrativeEngine`. New code should
 * import from `advisorNarrativeEngine` directly.
 */

export type {
  AdvisorRecommendation,
  AdvisorConfidenceBand,
  AdvisorActionInput,
  BuildRecommendationInputs,
  HouseholdSignals,
} from "../advisorNarrativeEngine";

export {
  buildAdvisorRecommendation,
  containsBoilerplate,
  ADVISOR_BANNED_BOILERPLATE,
} from "../advisorNarrativeEngine";
