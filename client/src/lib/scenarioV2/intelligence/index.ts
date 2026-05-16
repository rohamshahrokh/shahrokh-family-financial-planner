/**
 * Financial Intelligence Layer V1 — public entrypoint.
 *
 * Composes the per-module outputs into a single FinancialIntelligenceReport
 * consumed by the UI and the explainability layer. Pure function.
 *
 *   QuickDecisionOutput
 *      │
 *      ▼ detectTurningPoints(winner, runnerUp, baseline)
 *      ▼ scanFragility(winner, baseline)
 *      ▼ rankAssumptionDependencies(winner, baseline)
 *      ▼ detectWeakestLink(winner, baseline, fragility)
 *      ▼ detectRegimeDependency(winner)
 *      ▼ assessBehaviouralSurvivability(winner)
 *      ▼ scorePathRobustness(ranked)
 *      ▼ buildRecommendationDelta(winner, priorContext)
 *      ▼ detectDrift(baseline, priorContext)
 *      ▼ buildExplainability(...)
 *      ▼ buildInsightCards(...)
 *
 *   FinancialIntelligenceReport
 */

import type { QuickDecisionOutput } from "../decisionEngine/candidateGenerator";
import { detectTurningPoints } from "./turningPoints";
import { scanFragility } from "./fragility";
import { rankAssumptionDependencies } from "./assumptionDependency";
import { detectWeakestLink } from "./weakPoint";
import { detectRegimeDependency } from "./regime";
import { assessBehaviouralSurvivability } from "./behavioural";
import { scorePathRobustness } from "./pathRobustness";
import {
  buildRecommendationDelta,
  detectDrift,
} from "./adaptiveRecommendation";
import { buildExplainability } from "./explainability";
import {
  buildInsightCards,
  selectCriticalFindings,
} from "./insightCards";
import type {
  FinancialIntelligenceReport,
  PriorContext,
} from "./types";

export interface BuildIntelligenceInput {
  output: QuickDecisionOutput;
  /** Optional prior context for adaptive recommendation + drift analysis. */
  prior?: PriorContext | null;
}

export function buildFinancialIntelligence(
  input: BuildIntelligenceInput,
): FinancialIntelligenceReport {
  const { output, prior } = input;

  // Defensive: if no ranked candidates exist, return a minimal empty report
  // rather than throwing — UI surfaces the cautious fallback.
  if (!output.ranked || output.ranked.length === 0) {
    return emptyReport(output.baseScenarioResult?.scenarioId ?? "unknown");
  }

  const winner = output.ranked[0];
  const runnerUp = output.ranked[1] ?? null;
  const baseline = output.baseScenarioResult;

  const turningPoints = detectTurningPoints(winner, runnerUp, baseline);
  const fragility = scanFragility(winner, baseline);
  const assumptions = rankAssumptionDependencies(winner, baseline);
  const weakestLink = detectWeakestLink(winner, baseline, fragility);
  const regime = detectRegimeDependency(winner);
  const behavioural = assessBehaviouralSurvivability(winner);
  const robustness = scorePathRobustness(output.ranked);
  const recommendationDelta = buildRecommendationDelta(winner, prior ?? null);
  const drift = detectDrift(baseline, prior ?? null);

  const explainability = buildExplainability({
    output,
    turningPoints,
    fragility,
    assumptions,
    regime,
    behavioural,
    robustness,
  });

  const insightCards = buildInsightCards({
    winner,
    baseline,
    turningPoints,
    fragility,
    assumptions,
    weakestLink,
    regime,
    behavioural,
    robustness,
    recommendationDelta,
    drift,
  });

  const criticalFindings = selectCriticalFindings(insightCards, 5);

  const historyAvailable = !!(prior?.history && prior.history.length >= 2);

  return {
    turningPoints,
    fragility,
    assumptions,
    weakestLink,
    regime,
    behavioural,
    robustness,
    recommendationDelta,
    drift,
    explainability,
    insightCards,
    criticalFindings,
    meta: {
      winnerId: winner.id,
      winnerLabel: winner.label,
      isBaselineRecommendation: !recommendationDelta.previousWinnerId,
      historyAvailable,
    },
  };
}

function emptyReport(scenarioId: string): FinancialIntelligenceReport {
  return {
    turningPoints: [],
    fragility: [],
    assumptions: [],
    weakestLink: {
      primary: "No ranked strategy is available — the intelligence layer cannot evaluate weak points.",
      bottleneck: "N/A — no ranked candidate exists.",
      dominantRisk: "N/A — no ranked candidate exists.",
      fireBlocker: null,
    },
    regime: [],
    behavioural: [],
    robustness: {
      robustnessScore: 0,
      returnScore: 0,
      classification: "moderate",
      tradeoff: "No ranked path is available — robustness cannot be evaluated.",
      rationale: ["Ranked candidate set is empty."],
    },
    recommendationDelta: {
      previousWinnerId: null,
      previousLabel: null,
      currentWinnerId: scenarioId,
      currentLabel: scenarioId,
      changed: false,
      reason: "No ranked recommendation is available.",
      diffs: [],
    },
    drift: [],
    explainability: {
      whyThisWon: "No ranked strategy is available.",
      whyOthersLost: "No ranked strategy is available for comparison.",
      whatChangesTheAnswer: "Re-run the decision engine with adjusted constraints to surface candidate paths.",
      whatBreaksTheStrategy: "N/A — no candidate strategy to evaluate.",
      whatAssumptionsMatter: "N/A — no candidate strategy to evaluate.",
      whatEnvironmentItNeeds: "N/A — no candidate strategy to evaluate.",
      howRobustItIs: "N/A — no candidate strategy to evaluate.",
      howBehaviourallyRealistic: "N/A — no candidate strategy to evaluate.",
    },
    insightCards: [],
    criticalFindings: [],
    meta: {
      winnerId: scenarioId,
      winnerLabel: "(no recommendation)",
      isBaselineRecommendation: true,
      historyAvailable: false,
    },
  };
}

// ─── Public re-exports ───────────────────────────────────────────────────────

export type {
  FinancialIntelligenceReport,
  TurningPoint,
  FragilityFinding,
  AssumptionImpact,
  AssumptionKey,
  WeakestLink,
  RegimeDependency,
  Regime,
  BehaviouralFinding,
  BehaviouralAxis,
  RegimePerformance,
  PathRobustness,
  RecommendationDelta,
  DriftFinding,
  ExplainabilityAnswers,
  InsightCard,
  InsightKind,
  InsightCategory,
  InsightSeverity,
  InsightConfidence,
  InsightThreshold,
  PriorContext,
} from "./types";

export { detectTurningPoints } from "./turningPoints";
export { scanFragility } from "./fragility";
export { rankAssumptionDependencies } from "./assumptionDependency";
export { detectWeakestLink } from "./weakPoint";
export { detectRegimeDependency } from "./regime";
export { assessBehaviouralSurvivability } from "./behavioural";
export { scorePathRobustness } from "./pathRobustness";
export {
  buildRecommendationDelta,
  detectDrift,
} from "./adaptiveRecommendation";
export { buildExplainability } from "./explainability";
export {
  buildInsightCards,
  selectCriticalFindings,
} from "./insightCards";
