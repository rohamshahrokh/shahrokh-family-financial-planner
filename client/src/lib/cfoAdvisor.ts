/**
 * cfoAdvisor.ts — Sprint 5 Phase 4, CFO Advisor Layer.
 *
 * Why this file exists
 * --------------------
 * Sprint 5 Phase 1 (goalSolver), Phase 2 (decisionCandidates +
 * decisionRanking) and Phase 3 (bestMoveEngineSprint5) produced numeric
 * outputs the household and its CFO can act on. Phase 4 — this module —
 * is the thin **interpretation layer**: it consumes those existing
 * outputs (plus the canonical headline metrics, risk surface and Monte
 * Carlo result) and produces deterministic plain-English insights across
 * six categories:
 *
 *   1. Risks
 *   2. Opportunities
 *   3. Bottlenecks
 *   4. Contradictions
 *   5. Recommended Next Actions
 *   6. Watch Items
 *
 * Design rules
 * ------------
 *   1. Pure / deterministic — same inputs ⇒ byte-identical
 *      `CFOAdvisorResult`. No Date.now, no Math.random, no I/O.
 *   2. Canonical-only — every figure quoted in an insight traces back to
 *      a Sprint 4C/4D canonical service or a Sprint 5 engine output.
 *      Nothing is fabricated. When a needed input is absent the engine
 *      emits a Watch Item rather than hallucinating advice.
 *   3. No hardcoded household values — empty inputs produce a small
 *      "data needed" surface, never a fictional recommendation.
 *   4. Every recommendation references four evidence dimensions:
 *      goal gap, liquidity impact, risk impact, confidence level.
 *
 * Output shape
 * ------------
 * The advisor returns a `CFOAdvisorResult` with six insight arrays plus
 * a deterministic trace. Each insight carries an `evidence` block that
 * names the engine output(s) that produced it.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  type CanonicalHeadlineMetrics,
} from "./canonicalHeadlineMetrics";
import {
  generateDecisionCandidates,
  type CandidateGeneratorOutputs,
  type DecisionCandidate,
} from "./decisionCandidates";
import {
  rankDecisionCandidates,
  type RankingOutput,
} from "./decisionRanking";
import {
  computeBestMoveSprint5,
  type BestMoveResult,
} from "./bestMoveEngineSprint5";
import {
  solveGoalGap,
  type GoalSolverInputs,
  type GoalSolverOutputs,
} from "./goalSolver";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";

/* ─── Public types ──────────────────────────────────────────────────────── */

export type CFOInsightCategory =
  | "risk"
  | "opportunity"
  | "bottleneck"
  | "contradiction"
  | "next-action"
  | "watch-item";

export type CFOSeverity = "info" | "low" | "moderate" | "high" | "critical";

export type CFOConfidenceBand = "low" | "moderate" | "high";

/**
 * Evidence trace. Names the engine surface(s) the insight was derived
 * from. Every insight MUST carry at least one source so a reviewer can
 * verify the assertion against the originating output.
 */
export interface CFOEvidence {
  /** Engine surfaces this insight pulls from. */
  sources: Array<
    | "canonicalHeadlineMetrics"
    | "goalSolver"
    | "decisionCandidates"
    | "decisionRanking"
    | "bestMove"
    | "riskEngine"
    | "monteCarlo"
  >;
  /** Engine field names quoted in the insight, e.g. ["bestMove.bestNextAction.id"]. */
  fields: string[];
  /** Quoted numeric values (decimals, dollars, months) — for traceability.
   *  Empty when the insight is structural (e.g. "data missing"). */
  values: Array<{ label: string; value: number | string | null }>;
}

/**
 * Recommendation evidence — the four mandatory references for every
 * Recommended Next Action insight.
 */
export interface CFORecommendationReferences {
  /** Goal-shortfall dollar figure (signed; negative = closing the gap). */
  goalGap: {
    shortfallAmount: number | null;
    deltaGoalShortfall: number | null;
  };
  /** Liquidity impact in months of runway. */
  liquidityImpact: {
    baselineRunwayMonths: number;
    deltaRunwayMonths: number;
    postMoveRunwayMonths: number;
  };
  /** Risk impact (execution + liquidity) for the recommended action. */
  riskImpact: {
    executionRisk: number;
    liquidityRisk: number;
    deltaExecutionRiskVsHold: number;
    deltaLiquidityRiskVsHold: number;
  };
  /** Confidence level — pass-through from the Best Move engine. */
  confidenceLevel: {
    value: number;
    band: CFOConfidenceBand;
    mcConfidence: number | null;
    dataCoverage: "full" | "partial" | "minimal";
  };
}

export interface CFOInsight {
  /** Stable identifier — same inputs ⇒ same id. */
  id: string;
  category: CFOInsightCategory;
  severity: CFOSeverity;
  /** Short headline (≤ ~80 chars). */
  headline: string;
  /** Plain-English body. No markdown. */
  body: string;
  evidence: CFOEvidence;
  /** Present on every `next-action` insight. Null otherwise. */
  recommendation: CFORecommendationReferences | null;
}

export interface CFOAdvisorResult {
  risks: CFOInsight[];
  opportunities: CFOInsight[];
  bottlenecks: CFOInsight[];
  contradictions: CFOInsight[];
  recommendedNextActions: CFOInsight[];
  watchItems: CFOInsight[];
  /** Trace for diagnostics / tests. Pure data, no functions. */
  trace: {
    /** Did the caller pass each optional engine output? */
    canonicalHeadSupplied: boolean;
    goalSolverSupplied: boolean;
    candidatesSupplied: boolean;
    rankingSupplied: boolean;
    bestMoveSupplied: boolean;
    riskSupplied: boolean;
    monteCarloSupplied: boolean;
    /** Number of insights emitted, by category. */
    counts: {
      risks: number;
      opportunities: number;
      bottlenecks: number;
      contradictions: number;
      recommendedNextActions: number;
      watchItems: number;
    };
    /** True when the advisor had to synthesise one or more engine outputs
     *  from `canonicalLedger` instead of receiving them precomputed. */
    derivedEngineOutputs: {
      candidates: boolean;
      ranking: boolean;
      bestMove: boolean;
    };
    /** True when one or more critical inputs were missing — the advisor
     *  surfaces watch-items rather than fabricating advice. */
    incomplete: boolean;
  };
}

/* ─── Engine inputs ──────────────────────────────────────────────────────── */

export interface CFOAdvisorInputs {
  /** Canonical ledger (DashboardInputs). Optional only when ALL of the
   *  precomputed engine outputs below are supplied. */
  canonicalLedger?: DashboardInputs;
  /** Pre-computed canonical headline metrics. Falls back to recompute
   *  from `canonicalLedger` when omitted. */
  canonicalHead?: CanonicalHeadlineMetrics;
  /** Pre-computed goal-solver output. */
  goalSolverOutputs?: GoalSolverOutputs;
  /** Optional goal-solver inputs (target NW, FIRE date, etc) — used only
   *  when `goalSolverOutputs` is not supplied. */
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  /** Pre-computed candidate generator output. */
  candidateOutputs?: CandidateGeneratorOutputs;
  /** Pre-computed ranking output. */
  rankingOutputs?: RankingOutput;
  /** Pre-computed best-move engine output. */
  bestMoveOutputs?: BestMoveResult;
  /** Risk radar output. */
  riskOutputs?: RiskRadarResult | null;
  /** Monte Carlo result. */
  monteCarloOutputs?: MonteCarloResult | null;
}

/* ─── Engine-side thresholds (policy, not household values) ─────────────── */

/** Liquidity runway (months) below which we emit a Risk insight. */
const RUNWAY_FRAGILE_MONTHS = 3;
/** Liquidity runway (months) below which we emit a Bottleneck insight. */
const RUNWAY_TIGHT_MONTHS = 6;
/** Monte Carlo prob_ff threshold for "low probability of FF" Risk. */
const MC_PROB_FF_LOW = 50;
/** Monte Carlo prob_ff threshold for "high probability of FF" Opportunity. */
const MC_PROB_FF_HIGH = 80;
/** Risk overall_score threshold for "fragility" Risk insight. */
const RISK_OVERALL_FRAGILE = 40;
/** Risk overall_score threshold for "resilient" Opportunity insight. */
const RISK_OVERALL_RESILIENT = 70;
/** Surplus ratio threshold (surplus / income) for "thin surplus" Bottleneck. */
const SURPLUS_RATIO_THIN = 0.10;
/** Surplus ratio threshold for "healthy surplus" Opportunity. */
const SURPLUS_RATIO_HEALTHY = 0.25;
/** Debt-service ratio threshold (debtService / income) for "high DSR" Risk. */
const DSR_HIGH = 0.40;
/** Confidence band cut-offs (mirrors Best Move engine). */
const CONFIDENCE_BAND_HIGH = 0.75;
const CONFIDENCE_BAND_MODERATE = 0.45;

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Produce a deterministic CFO Advisor report from existing engine outputs.
 *
 * Resolution strategy:
 *   - Use any precomputed output supplied by the caller verbatim.
 *   - When `canonicalLedger` is supplied and precomputed outputs are
 *     missing, the advisor calls the existing Sprint 5 engines (no math
 *     is duplicated here).
 *   - When NEITHER a ledger nor precomputed outputs are supplied, the
 *     advisor emits a single watch-item describing the missing data.
 */
export function generateCFOInsights(
  inputs: CFOAdvisorInputs,
): CFOAdvisorResult {
  const trace = newTrace();
  trace.canonicalHeadSupplied = !!inputs.canonicalHead;
  trace.goalSolverSupplied = !!inputs.goalSolverOutputs;
  trace.candidatesSupplied = !!inputs.candidateOutputs;
  trace.rankingSupplied = !!inputs.rankingOutputs;
  trace.bestMoveSupplied = !!inputs.bestMoveOutputs;
  trace.riskSupplied = !!inputs.riskOutputs;
  trace.monteCarloSupplied = !!inputs.monteCarloOutputs;

  // Resolve canonical headline metrics. Without these we cannot produce
  // any structural insights — only a "data needed" watch-item.
  const head: CanonicalHeadlineMetrics | null =
    inputs.canonicalHead ??
    (inputs.canonicalLedger
      ? computeCanonicalHeadlineMetrics(inputs.canonicalLedger)
      : null);

  if (!head) {
    return finaliseEmpty(trace, [
      makeInsight({
        id: "watch:missing-canonical-ledger",
        category: "watch-item",
        severity: "info",
        headline: "Canonical ledger not supplied",
        body:
          "CFO Advisor needs either canonical headline metrics or a canonical " +
          "ledger to produce insights. No engine outputs were supplied, so " +
          "no recommendations can be made.",
        evidence: {
          sources: [],
          fields: [],
          values: [],
        },
      }),
    ]);
  }

  // Resolve goal solver output. We do NOT fabricate targets; if neither
  // a precomputed output nor goal inputs were supplied we still call
  // `solveGoalGap` (with empty targets) so the trace fields are populated
  // — the solver itself will mark `trace.incomplete = true`.
  let goal: GoalSolverOutputs | null = inputs.goalSolverOutputs ?? null;
  if (!goal && inputs.canonicalLedger) {
    goal = solveGoalGap({
      canonicalLedger: inputs.canonicalLedger,
      ...(inputs.goalSolverInputs ?? {}),
      forecastOutputs: inputs.goalSolverInputs?.forecastOutputs ?? null,
      riskOutputs: inputs.riskOutputs ?? inputs.goalSolverInputs?.riskOutputs ?? null,
      monteCarloOutputs:
        inputs.monteCarloOutputs ?? inputs.goalSolverInputs?.monteCarloOutputs ?? null,
    });
  }

  // Resolve candidate generator + ranking + best-move.
  let candidates: CandidateGeneratorOutputs | null =
    inputs.candidateOutputs ?? null;
  if (!candidates && inputs.canonicalLedger) {
    candidates = generateDecisionCandidates({
      canonicalLedger: inputs.canonicalLedger,
      canonicalHead: head,
      goalSolverOutputs: goal ?? undefined,
      riskOutputs: inputs.riskOutputs ?? null,
      monteCarloOutputs: inputs.monteCarloOutputs ?? null,
    });
    trace.derivedEngineOutputs.candidates = true;
  }

  let ranking: RankingOutput | null = inputs.rankingOutputs ?? null;
  if (!ranking && candidates) {
    ranking = rankDecisionCandidates({ candidateOutputs: candidates });
    trace.derivedEngineOutputs.ranking = true;
  }

  let bestMove: BestMoveResult | null = inputs.bestMoveOutputs ?? null;
  if (!bestMove && ranking) {
    bestMove = computeBestMoveSprint5({
      rankingOutputs: ranking,
      goalSolverOutputs: goal ?? undefined,
      riskOutputs: inputs.riskOutputs ?? null,
      monteCarloOutputs: inputs.monteCarloOutputs ?? null,
    });
    trace.derivedEngineOutputs.bestMove = true;
  }

  // Build insights.
  const risks: CFOInsight[] = buildRisks({
    head,
    goal,
    bestMove,
    risk: inputs.riskOutputs ?? null,
    mc: inputs.monteCarloOutputs ?? null,
    candidates,
  });

  const opportunities: CFOInsight[] = buildOpportunities({
    head,
    goal,
    bestMove,
    ranking,
    risk: inputs.riskOutputs ?? null,
    mc: inputs.monteCarloOutputs ?? null,
  });

  const bottlenecks: CFOInsight[] = buildBottlenecks({
    head,
    goal,
    bestMove,
    candidates,
  });

  const contradictions: CFOInsight[] = buildContradictions({
    head,
    goal,
    bestMove,
    ranking,
    risk: inputs.riskOutputs ?? null,
    mc: inputs.monteCarloOutputs ?? null,
  });

  const recommendedNextActions: CFOInsight[] = buildRecommendedNextActions({
    head,
    goal,
    bestMove,
    risk: inputs.riskOutputs ?? null,
    mc: inputs.monteCarloOutputs ?? null,
  });

  const watchItems: CFOInsight[] = buildWatchItems({
    head,
    goal,
    candidates,
    ranking,
    bestMove,
    riskSupplied: !!inputs.riskOutputs,
    mcSupplied: !!inputs.monteCarloOutputs,
    hasLedger: !!inputs.canonicalLedger,
  });

  trace.incomplete =
    !inputs.monteCarloOutputs ||
    !inputs.riskOutputs ||
    (goal?.trace.incomplete ?? true) ||
    (candidates?.incomplete ?? true);

  trace.counts = {
    risks: risks.length,
    opportunities: opportunities.length,
    bottlenecks: bottlenecks.length,
    contradictions: contradictions.length,
    recommendedNextActions: recommendedNextActions.length,
    watchItems: watchItems.length,
  };

  return {
    risks,
    opportunities,
    bottlenecks,
    contradictions,
    recommendedNextActions,
    watchItems,
    trace,
  };
}

/* ─── Insight builders ──────────────────────────────────────────────────── */

interface InsightCtx {
  head: CanonicalHeadlineMetrics;
  goal: GoalSolverOutputs | null;
  bestMove: BestMoveResult | null;
  candidates: CandidateGeneratorOutputs | null;
  ranking: RankingOutput | null;
  risk: RiskRadarResult | null;
  mc: MonteCarloResult | null;
}

function buildRisks(
  ctx: Pick<InsightCtx, "head" | "goal" | "bestMove" | "risk" | "mc" | "candidates">,
): CFOInsight[] {
  const out: CFOInsight[] = [];

  // R1: Liquidity runway below fragile threshold.
  const baselineRunway = ctx.bestMove?.liquidityImpact.baselineRunwayMonths ?? null;
  if (baselineRunway != null && baselineRunway < RUNWAY_FRAGILE_MONTHS) {
    out.push(
      makeInsight({
        id: "risk:liquidity-runway-fragile",
        category: "risk",
        severity: "high",
        headline: `Cash runway is ${formatMonths(baselineRunway)} — below the ${RUNWAY_FRAGILE_MONTHS}-month resilience floor`,
        body:
          `Best-move engine reports a baseline runway of ${formatMonths(baselineRunway)} of monthly outflow. ` +
          `This is below the canonical ${RUNWAY_FRAGILE_MONTHS}-month buffer threshold and exposes the household ` +
          `to short-term cashflow shocks before any structural decisions are taken.`,
        evidence: {
          sources: ["bestMove"],
          fields: ["bestMove.liquidityImpact.baselineRunwayMonths"],
          values: [{ label: "baselineRunwayMonths", value: baselineRunway }],
        },
      }),
    );
  }

  // R2: Overall risk score fragile.
  if (ctx.risk && ctx.risk.overall_score < RISK_OVERALL_FRAGILE) {
    out.push(
      makeInsight({
        id: "risk:overall-fragility",
        category: "risk",
        severity: ctx.risk.overall_score < 25 ? "critical" : "high",
        headline: `Overall risk score ${ctx.risk.overall_score}/100 is in the fragile band`,
        body:
          `Risk Radar reports overall_score=${ctx.risk.overall_score} (level=${ctx.risk.overall_level}, ` +
          `fragility_index=${ctx.risk.fragility_index}). The household sits below the canonical ` +
          `resilience threshold of ${RISK_OVERALL_FRAGILE}/100.`,
        evidence: {
          sources: ["riskEngine"],
          fields: ["riskEngine.overall_score", "riskEngine.fragility_index"],
          values: [
            { label: "overall_score", value: ctx.risk.overall_score },
            { label: "fragility_index", value: ctx.risk.fragility_index },
            { label: "overall_level", value: ctx.risk.overall_level },
          ],
        },
      }),
    );
  }

  // R3: Monte Carlo prob_ff low.
  if (ctx.mc && ctx.mc.prob_ff < MC_PROB_FF_LOW) {
    out.push(
      makeInsight({
        id: "risk:mc-prob-ff-low",
        category: "risk",
        severity: ctx.mc.prob_ff < 25 ? "critical" : "high",
        headline: `Monte Carlo probability of financial freedom is ${ctx.mc.prob_ff}%`,
        body:
          `The simulation suite reports prob_ff=${ctx.mc.prob_ff}% — below the canonical ${MC_PROB_FF_LOW}% ` +
          `band that distinguishes "on track" from "at risk". The biggest driver named by the engine is ` +
          `"${ctx.mc.biggest_risk_driver}".`,
        evidence: {
          sources: ["monteCarlo"],
          fields: ["monteCarlo.prob_ff", "monteCarlo.biggest_risk_driver"],
          values: [
            { label: "prob_ff", value: ctx.mc.prob_ff },
            { label: "biggest_risk_driver", value: ctx.mc.biggest_risk_driver },
          ],
        },
      }),
    );
  }

  // R4: Debt-service ratio high.
  const dsr =
    ctx.head.monthlyIncome > 0 ? ctx.head.debtService / ctx.head.monthlyIncome : null;
  if (dsr != null && dsr > DSR_HIGH) {
    out.push(
      makeInsight({
        id: "risk:debt-service-ratio-high",
        category: "risk",
        severity: dsr > 0.55 ? "critical" : "high",
        headline: `Debt service ratio is ${formatPct(dsr)} — above the ${formatPct(DSR_HIGH)} canonical band`,
        body:
          `Canonical headline metrics report monthly debt service of $${formatNum(ctx.head.debtService)} ` +
          `against monthly income of $${formatNum(ctx.head.monthlyIncome)}. The resulting DSR of ` +
          `${formatPct(dsr)} exceeds the canonical ${formatPct(DSR_HIGH)} band and constrains the ` +
          `household's capacity to absorb further leverage.`,
        evidence: {
          sources: ["canonicalHeadlineMetrics"],
          fields: ["canonicalHead.debtService", "canonicalHead.monthlyIncome"],
          values: [
            { label: "debtService", value: ctx.head.debtService },
            { label: "monthlyIncome", value: ctx.head.monthlyIncome },
            { label: "debtServiceRatio", value: Number(dsr.toFixed(4)) },
          ],
        },
      }),
    );
  }

  // R5: Goal solver reports infeasibility.
  if (ctx.goal && (ctx.goal.fireFeasibility === "UNREALISTIC" ||
                    ctx.goal.fireFeasibility === "IMPOSSIBLE")) {
    out.push(
      makeInsight({
        id: "risk:goal-feasibility-poor",
        category: "risk",
        severity: ctx.goal.fireFeasibility === "IMPOSSIBLE" ? "critical" : "high",
        headline: `Goal solver verdict: ${ctx.goal.fireFeasibility.toLowerCase()}`,
        body:
          `Goal solver reports a shortfall of $${formatNum(ctx.goal.shortfallAmount)} with feasibility ` +
          `verdict "${ctx.goal.fireFeasibility}". Required monthly contribution to close the gap is ` +
          `$${formatNum(ctx.goal.requiredMonthlyContribution)} versus available monthly surplus of ` +
          `$${formatNum(ctx.goal.trace.monthlySurplusAvailable)}.`,
        evidence: {
          sources: ["goalSolver"],
          fields: [
            "goalSolver.fireFeasibility",
            "goalSolver.shortfallAmount",
            "goalSolver.requiredMonthlyContribution",
          ],
          values: [
            { label: "fireFeasibility", value: ctx.goal.fireFeasibility },
            { label: "shortfallAmount", value: ctx.goal.shortfallAmount },
            { label: "requiredMonthlyContribution", value: ctx.goal.requiredMonthlyContribution },
            { label: "monthlySurplusAvailable", value: ctx.goal.trace.monthlySurplusAvailable },
          ],
        },
      }),
    );
  }

  return out;
}

function buildOpportunities(
  ctx: Pick<InsightCtx, "head" | "goal" | "bestMove" | "ranking" | "risk" | "mc">,
): CFOInsight[] {
  const out: CFOInsight[] = [];

  // O1: Strong Monte Carlo prob_ff.
  if (ctx.mc && ctx.mc.prob_ff >= MC_PROB_FF_HIGH) {
    out.push(
      makeInsight({
        id: "opportunity:mc-prob-ff-strong",
        category: "opportunity",
        severity: "info",
        headline: `Monte Carlo prob_ff is ${ctx.mc.prob_ff}% — above the ${MC_PROB_FF_HIGH}% confidence band`,
        body:
          `The simulation suite places financial-freedom probability at ${ctx.mc.prob_ff}%. The household ` +
          `has structural headroom to consider higher-yield candidates without violating the canonical ` +
          `confidence band.`,
        evidence: {
          sources: ["monteCarlo"],
          fields: ["monteCarlo.prob_ff"],
          values: [{ label: "prob_ff", value: ctx.mc.prob_ff }],
        },
      }),
    );
  }

  // O2: Strong overall risk score.
  if (ctx.risk && ctx.risk.overall_score >= RISK_OVERALL_RESILIENT) {
    out.push(
      makeInsight({
        id: "opportunity:risk-resilient",
        category: "opportunity",
        severity: "info",
        headline: `Risk surface is resilient (overall_score=${ctx.risk.overall_score}/100)`,
        body:
          `Risk Radar reports overall_score=${ctx.risk.overall_score} (level=${ctx.risk.overall_level}). ` +
          `The household is operating in the resilient band and can deploy capital toward growth ` +
          `candidates with greater margin of safety.`,
        evidence: {
          sources: ["riskEngine"],
          fields: ["riskEngine.overall_score"],
          values: [
            { label: "overall_score", value: ctx.risk.overall_score },
            { label: "overall_level", value: ctx.risk.overall_level },
          ],
        },
      }),
    );
  }

  // O3: Healthy surplus ratio.
  const surplusRatio =
    ctx.head.monthlyIncome > 0 ? ctx.head.monthlySurplus / ctx.head.monthlyIncome : null;
  if (surplusRatio != null && surplusRatio >= SURPLUS_RATIO_HEALTHY) {
    out.push(
      makeInsight({
        id: "opportunity:surplus-healthy",
        category: "opportunity",
        severity: "info",
        headline: `Monthly surplus ratio is ${formatPct(surplusRatio)} — above the ${formatPct(SURPLUS_RATIO_HEALTHY)} canonical band`,
        body:
          `Canonical headline metrics show monthly surplus of $${formatNum(ctx.head.monthlySurplus)} on ` +
          `income of $${formatNum(ctx.head.monthlyIncome)} (ratio ${formatPct(surplusRatio)}). This ` +
          `provides systematic contribution capacity for an investment candidate.`,
        evidence: {
          sources: ["canonicalHeadlineMetrics"],
          fields: ["canonicalHead.monthlySurplus", "canonicalHead.monthlyIncome"],
          values: [
            { label: "monthlySurplus", value: ctx.head.monthlySurplus },
            { label: "monthlyIncome", value: ctx.head.monthlyIncome },
            { label: "surplusRatio", value: Number(surplusRatio.toFixed(4)) },
          ],
        },
      }),
    );
  }

  // O4: Best move has positive expected impact above hold baseline.
  if (
    ctx.bestMove &&
    !ctx.bestMove.bestNextAction.isHoldBaseline &&
    ctx.bestMove.expectedImpact.deltaNetWorth > 0
  ) {
    out.push(
      makeInsight({
        id: "opportunity:best-move-positive-impact",
        category: "opportunity",
        severity: "info",
        headline: `Best move improves net worth by $${formatNum(ctx.bestMove.expectedImpact.deltaNetWorth)} over ${ctx.bestMove.expectedImpact.horizonMonths}mo`,
        body:
          `Best-move engine identifies "${ctx.bestMove.bestNextAction.label}" with expected ` +
          `Δ net worth of $${formatNum(ctx.bestMove.expectedImpact.deltaNetWorth)} and Δ passive income of ` +
          `$${formatNum(ctx.bestMove.expectedImpact.deltaPassiveIncome)}/yr versus the hold-current-path baseline.`,
        evidence: {
          sources: ["bestMove"],
          fields: [
            "bestMove.bestNextAction.label",
            "bestMove.expectedImpact.deltaNetWorth",
            "bestMove.expectedImpact.deltaPassiveIncome",
          ],
          values: [
            { label: "bestNextAction.label", value: ctx.bestMove.bestNextAction.label },
            { label: "deltaNetWorth", value: ctx.bestMove.expectedImpact.deltaNetWorth },
            { label: "deltaPassiveIncome", value: ctx.bestMove.expectedImpact.deltaPassiveIncome },
            { label: "horizonMonths", value: ctx.bestMove.expectedImpact.horizonMonths },
          ],
        },
      }),
    );
  }

  return out;
}

function buildBottlenecks(
  ctx: Pick<InsightCtx, "head" | "goal" | "bestMove" | "candidates">,
): CFOInsight[] {
  const out: CFOInsight[] = [];

  // B1: Tight (not yet fragile) runway.
  const baselineRunway = ctx.bestMove?.liquidityImpact.baselineRunwayMonths ?? null;
  if (
    baselineRunway != null &&
    baselineRunway >= RUNWAY_FRAGILE_MONTHS &&
    baselineRunway < RUNWAY_TIGHT_MONTHS
  ) {
    out.push(
      makeInsight({
        id: "bottleneck:liquidity-tight",
        category: "bottleneck",
        severity: "moderate",
        headline: `Cash runway of ${formatMonths(baselineRunway)} sits in the tight band (<${RUNWAY_TIGHT_MONTHS}mo)`,
        body:
          `Liquidity runway is above the fragility floor but below the canonical ${RUNWAY_TIGHT_MONTHS}-month ` +
          `target. Any candidate that draws further on cash will move the household into the fragile band ` +
          `and dominate the ranking penalty.`,
        evidence: {
          sources: ["bestMove"],
          fields: ["bestMove.liquidityImpact.baselineRunwayMonths"],
          values: [{ label: "baselineRunwayMonths", value: baselineRunway }],
        },
      }),
    );
  }

  // B2: Thin surplus.
  const surplusRatio =
    ctx.head.monthlyIncome > 0 ? ctx.head.monthlySurplus / ctx.head.monthlyIncome : null;
  if (surplusRatio != null && surplusRatio >= 0 && surplusRatio < SURPLUS_RATIO_THIN) {
    out.push(
      makeInsight({
        id: "bottleneck:surplus-thin",
        category: "bottleneck",
        severity: "moderate",
        headline: `Monthly surplus ratio is ${formatPct(surplusRatio)} — below the ${formatPct(SURPLUS_RATIO_THIN)} contribution band`,
        body:
          `Canonical headline metrics show monthly surplus of $${formatNum(ctx.head.monthlySurplus)} on ` +
          `income of $${formatNum(ctx.head.monthlyIncome)}. With surplus under ${formatPct(SURPLUS_RATIO_THIN)}, ` +
          `any contribution-driven candidate (ETF DCA, offset sweep) has limited room to scale.`,
        evidence: {
          sources: ["canonicalHeadlineMetrics"],
          fields: ["canonicalHead.monthlySurplus", "canonicalHead.monthlyIncome"],
          values: [
            { label: "monthlySurplus", value: ctx.head.monthlySurplus },
            { label: "monthlyIncome", value: ctx.head.monthlyIncome },
            { label: "surplusRatio", value: Number(surplusRatio.toFixed(4)) },
          ],
        },
      }),
    );
  }

  // B3: Required monthly contribution exceeds available surplus.
  if (
    ctx.goal &&
    ctx.goal.requiredMonthlyContribution > 0 &&
    ctx.goal.requiredMonthlyContribution > ctx.goal.trace.monthlySurplusAvailable
  ) {
    out.push(
      makeInsight({
        id: "bottleneck:required-contribution-exceeds-surplus",
        category: "bottleneck",
        severity: "high",
        headline:
          `Required contribution $${formatNum(ctx.goal.requiredMonthlyContribution)}/mo exceeds available surplus $${formatNum(ctx.goal.trace.monthlySurplusAvailable)}/mo`,
        body:
          `Goal solver requires $${formatNum(ctx.goal.requiredMonthlyContribution)}/mo to close the goal gap; ` +
          `available monthly surplus is $${formatNum(ctx.goal.trace.monthlySurplusAvailable)}. Without ` +
          `income uplift, expense reduction or target relaxation, the goal cannot be funded from cashflow ` +
          `alone.`,
        evidence: {
          sources: ["goalSolver"],
          fields: [
            "goalSolver.requiredMonthlyContribution",
            "goalSolver.trace.monthlySurplusAvailable",
          ],
          values: [
            { label: "requiredMonthlyContribution", value: ctx.goal.requiredMonthlyContribution },
            { label: "monthlySurplusAvailable", value: ctx.goal.trace.monthlySurplusAvailable },
          ],
        },
      }),
    );
  }

  // B4: Candidate generator reported zero non-baseline candidates.
  if (ctx.candidates) {
    const nonBaseline = ctx.candidates.candidates.filter(c => !c.isBaseline);
    if (nonBaseline.length === 0) {
      out.push(
        makeInsight({
          id: "bottleneck:no-actionable-candidates",
          category: "bottleneck",
          severity: "moderate",
          headline: "Candidate generator returned only the hold-current-path baseline",
          body:
            "No data-supported decision candidates were generated besides the do-nothing baseline. " +
            "This usually means the canonical ledger lacks the inputs (income, surplus, cash position) " +
            "required to evaluate alternative moves.",
          evidence: {
            sources: ["decisionCandidates"],
            fields: ["candidates.candidates.length"],
            values: [{ label: "candidatesCount", value: ctx.candidates.candidates.length }],
          },
        }),
      );
    }
  }

  return out;
}

function buildContradictions(
  ctx: Pick<InsightCtx, "head" | "goal" | "bestMove" | "ranking" | "risk" | "mc">,
): CFOInsight[] {
  const out: CFOInsight[] = [];

  // C1: Goal solver "ON_TRACK" but Monte Carlo prob_ff low.
  if (
    ctx.goal &&
    ctx.goal.fireFeasibility === "ON_TRACK" &&
    ctx.mc &&
    ctx.mc.prob_ff < MC_PROB_FF_LOW
  ) {
    out.push(
      makeInsight({
        id: "contradiction:on-track-vs-mc-low",
        category: "contradiction",
        severity: "high",
        headline: `Goal solver says ON_TRACK but Monte Carlo prob_ff=${ctx.mc.prob_ff}%`,
        body:
          `Goal solver labels the plan ON_TRACK, yet the Monte Carlo simulation places probability of ` +
          `financial freedom at only ${ctx.mc.prob_ff}% — below the ${MC_PROB_FF_LOW}% confidence band. ` +
          `The deterministic forecast underestimates the variance the simulation surfaces; treat the ` +
          `lower bound as the binding constraint.`,
        evidence: {
          sources: ["goalSolver", "monteCarlo"],
          fields: ["goalSolver.fireFeasibility", "monteCarlo.prob_ff"],
          values: [
            { label: "fireFeasibility", value: ctx.goal.fireFeasibility },
            { label: "prob_ff", value: ctx.mc.prob_ff },
          ],
        },
      }),
    );
  }

  // C2: Risk Radar resilient but Monte Carlo prob_ff low.
  if (
    ctx.risk &&
    ctx.risk.overall_score >= RISK_OVERALL_RESILIENT &&
    ctx.mc &&
    ctx.mc.prob_ff < MC_PROB_FF_LOW
  ) {
    out.push(
      makeInsight({
        id: "contradiction:risk-resilient-vs-mc-low",
        category: "contradiction",
        severity: "moderate",
        headline: `Risk Radar resilient (${ctx.risk.overall_score}/100) but Monte Carlo prob_ff=${ctx.mc.prob_ff}%`,
        body:
          `The fragility surface labels the household resilient (overall_score=${ctx.risk.overall_score}), ` +
          `yet the simulation suite reports prob_ff=${ctx.mc.prob_ff}%. Resilience to near-term shocks does ` +
          `not guarantee long-horizon plan success; reconcile the two before relying on either in isolation.`,
        evidence: {
          sources: ["riskEngine", "monteCarlo"],
          fields: ["riskEngine.overall_score", "monteCarlo.prob_ff"],
          values: [
            { label: "overall_score", value: ctx.risk.overall_score },
            { label: "prob_ff", value: ctx.mc.prob_ff },
          ],
        },
      }),
    );
  }

  // C3: Best move recommends a non-hold candidate but confidence band is low.
  if (
    ctx.bestMove &&
    !ctx.bestMove.bestNextAction.isHoldBaseline &&
    ctx.bestMove.confidenceScore.band === "low"
  ) {
    out.push(
      makeInsight({
        id: "contradiction:best-move-low-confidence",
        category: "contradiction",
        severity: "moderate",
        headline: `Best move "${ctx.bestMove.bestNextAction.label}" is recommended at low confidence`,
        body:
          `Best-move engine recommends a structural change but the confidence score is ` +
          `${ctx.bestMove.confidenceScore.value.toFixed(2)} (band=low). The ranking margin and supporting ` +
          `data coverage do not support acting on this candidate without additional inputs.`,
        evidence: {
          sources: ["bestMove"],
          fields: [
            "bestMove.bestNextAction.label",
            "bestMove.confidenceScore.value",
            "bestMove.confidenceScore.band",
          ],
          values: [
            { label: "bestNextAction.label", value: ctx.bestMove.bestNextAction.label },
            { label: "confidence.value", value: Number(ctx.bestMove.confidenceScore.value.toFixed(4)) },
            { label: "confidence.band", value: ctx.bestMove.confidenceScore.band },
          ],
        },
      }),
    );
  }

  // C4: Best move improves net worth but reduces runway into fragile band.
  if (
    ctx.bestMove &&
    !ctx.bestMove.bestNextAction.isHoldBaseline &&
    ctx.bestMove.expectedImpact.deltaNetWorth > 0 &&
    ctx.bestMove.liquidityImpact.postMoveRunwayMonths < RUNWAY_FRAGILE_MONTHS
  ) {
    out.push(
      makeInsight({
        id: "contradiction:best-move-erodes-runway",
        category: "contradiction",
        severity: "high",
        headline: `Best move improves net worth but post-move runway is ${formatMonths(ctx.bestMove.liquidityImpact.postMoveRunwayMonths)}`,
        body:
          `Best-move engine reports Δ net worth +$${formatNum(ctx.bestMove.expectedImpact.deltaNetWorth)} ` +
          `but post-move liquidity runway falls to ${formatMonths(ctx.bestMove.liquidityImpact.postMoveRunwayMonths)}, ` +
          `below the canonical ${RUNWAY_FRAGILE_MONTHS}-month resilience floor. The structural upside is ` +
          `consumed by fragility.`,
        evidence: {
          sources: ["bestMove"],
          fields: [
            "bestMove.expectedImpact.deltaNetWorth",
            "bestMove.liquidityImpact.postMoveRunwayMonths",
          ],
          values: [
            { label: "deltaNetWorth", value: ctx.bestMove.expectedImpact.deltaNetWorth },
            {
              label: "postMoveRunwayMonths",
              value: ctx.bestMove.liquidityImpact.postMoveRunwayMonths,
            },
          ],
        },
      }),
    );
  }

  return out;
}

function buildRecommendedNextActions(
  ctx: Pick<InsightCtx, "head" | "goal" | "bestMove" | "risk" | "mc">,
): CFOInsight[] {
  const out: CFOInsight[] = [];
  if (!ctx.bestMove) return out;

  const references = buildRecommendationReferences(ctx);
  const bm = ctx.bestMove;
  const headline = bm.bestNextAction.isHoldBaseline
    ? `Hold current path: ${bm.bestNextAction.label}`
    : `Recommended next action: ${bm.bestNextAction.label}`;

  const goalLine =
    references.goalGap.shortfallAmount != null
      ? `Goal shortfall is $${formatNum(references.goalGap.shortfallAmount)}; this action moves it by ` +
        (references.goalGap.deltaGoalShortfall != null
          ? `$${formatNum(references.goalGap.deltaGoalShortfall)}`
          : "an undetermined amount")
      : "No explicit goal target was supplied, so goal-gap closure is not measured";

  const liquidityLine =
    `Liquidity runway moves from ${formatMonths(references.liquidityImpact.baselineRunwayMonths)} ` +
    `to ${formatMonths(references.liquidityImpact.postMoveRunwayMonths)} ` +
    `(${formatMonths(references.liquidityImpact.deltaRunwayMonths, true)})`;

  const riskLine =
    `Execution risk ${references.riskImpact.executionRisk}/100, liquidity risk ` +
    `${references.riskImpact.liquidityRisk}/100; Δ execution risk vs hold ${formatSigned(references.riskImpact.deltaExecutionRiskVsHold)}, ` +
    `Δ liquidity risk vs hold ${formatSigned(references.riskImpact.deltaLiquidityRiskVsHold)}`;

  const confidenceLine =
    `Confidence ${references.confidenceLevel.value.toFixed(2)} (${references.confidenceLevel.band}); ` +
    `Monte Carlo confidence ${references.confidenceLevel.mcConfidence != null ? references.confidenceLevel.mcConfidence.toFixed(2) : "not supplied"}; ` +
    `risk data coverage ${references.confidenceLevel.dataCoverage}`;

  out.push(
    makeInsight({
      id: `next-action:${bm.bestNextAction.id}`,
      category: "next-action",
      severity: bm.bestNextAction.isHoldBaseline ? "info" : "moderate",
      headline,
      body:
        `${bm.bestNextAction.rationale}\n\n` +
        `Goal gap — ${goalLine}.\n` +
        `Liquidity impact — ${liquidityLine}.\n` +
        `Risk impact — ${riskLine}.\n` +
        `Confidence level — ${confidenceLine}.`,
      evidence: {
        sources: [
          "bestMove",
          ...(ctx.goal ? (["goalSolver"] as const) : ([] as const)),
          ...(ctx.risk ? (["riskEngine"] as const) : ([] as const)),
          ...(ctx.mc ? (["monteCarlo"] as const) : ([] as const)),
        ],
        fields: [
          "bestMove.bestNextAction",
          "bestMove.expectedImpact",
          "bestMove.riskImpact",
          "bestMove.liquidityImpact",
          "bestMove.confidenceScore",
          "goalSolver.shortfallAmount",
        ],
        values: [
          { label: "bestNextAction.id", value: bm.bestNextAction.id },
          { label: "bestNextAction.label", value: bm.bestNextAction.label },
          { label: "isHoldBaseline", value: bm.bestNextAction.isHoldBaseline ? 1 : 0 },
        ],
      },
      recommendation: references,
    }),
  );

  return out;
}

function buildWatchItems(args: {
  head: CanonicalHeadlineMetrics;
  goal: GoalSolverOutputs | null;
  candidates: CandidateGeneratorOutputs | null;
  ranking: RankingOutput | null;
  bestMove: BestMoveResult | null;
  riskSupplied: boolean;
  mcSupplied: boolean;
  hasLedger: boolean;
}): CFOInsight[] {
  const out: CFOInsight[] = [];

  if (!args.riskSupplied) {
    out.push(
      makeInsight({
        id: "watch:risk-engine-missing",
        category: "watch-item",
        severity: "info",
        headline: "Risk Radar output not supplied",
        body:
          "CFO Advisor did not receive a Risk Radar (riskEngine) result. Risk-derived insights and the " +
          "data-coverage component of confidence are dampened until risk surface is recomputed.",
        evidence: { sources: [], fields: ["riskEngine"], values: [] },
      }),
    );
  }

  if (!args.mcSupplied) {
    out.push(
      makeInsight({
        id: "watch:monte-carlo-missing",
        category: "watch-item",
        severity: "info",
        headline: "Monte Carlo output not supplied",
        body:
          "CFO Advisor did not receive a Monte Carlo result. Probability-of-financial-freedom and " +
          "confidence dampening are unavailable; consider running the simulation suite.",
        evidence: { sources: [], fields: ["monteCarlo"], values: [] },
      }),
    );
  }

  if (args.goal?.trace.incomplete) {
    out.push(
      makeInsight({
        id: "watch:goal-solver-incomplete",
        category: "watch-item",
        severity: "info",
        headline: "Goal solver reported incomplete inputs",
        body:
          "Goal solver flagged its trace as incomplete (no targets supplied, or a critical canonical " +
          "input missing). Shortfall-driven insights are limited; set explicit goal targets to fully " +
          "engage the solver.",
        evidence: {
          sources: ["goalSolver"],
          fields: ["goalSolver.trace.incomplete", "goalSolver.trace.reasoning"],
          values: [
            { label: "incomplete", value: 1 },
            { label: "reasoning", value: args.goal.trace.reasoning },
          ],
        },
      }),
    );
  }

  if (args.candidates?.incomplete) {
    out.push(
      makeInsight({
        id: "watch:candidates-incomplete",
        category: "watch-item",
        severity: "info",
        headline: "Candidate generator reported incomplete inputs",
        body:
          "Candidate generator flagged its trace as incomplete. Some decision candidates may be missing " +
          "or under-supported by the canonical ledger.",
        evidence: {
          sources: ["decisionCandidates"],
          fields: ["candidates.incomplete"],
          values: [{ label: "incomplete", value: 1 }],
        },
      }),
    );
  }

  if (!args.bestMove) {
    out.push(
      makeInsight({
        id: "watch:best-move-missing",
        category: "watch-item",
        severity: "info",
        headline: "Best Move engine output not available",
        body:
          "CFO Advisor could not resolve a Best Move result (no ledger, no ranking, no bestMove input). " +
          "Recommended Next Actions are suppressed until at least one of these surfaces is supplied.",
        evidence: { sources: [], fields: ["bestMove"], values: [] },
      }),
    );
  }

  // Watch when canonical income is zero — every ratio insight is gated on it,
  // so this lets a CFO know the headline metrics are unusable.
  if (args.head.monthlyIncome <= 0) {
    out.push(
      makeInsight({
        id: "watch:canonical-income-zero",
        category: "watch-item",
        severity: "info",
        headline: "Canonical monthly income is zero",
        body:
          "Canonical headline metrics report monthlyIncome=0. Surplus-ratio, DSR and contribution-ratio " +
          "insights are gated on income and will not be emitted until the ledger captures income.",
        evidence: {
          sources: ["canonicalHeadlineMetrics"],
          fields: ["canonicalHead.monthlyIncome"],
          values: [{ label: "monthlyIncome", value: args.head.monthlyIncome }],
        },
      }),
    );
  }

  return out;
}

/* ─── Recommendation references ─────────────────────────────────────────── */

function buildRecommendationReferences(
  ctx: Pick<InsightCtx, "goal" | "bestMove" | "risk" | "mc">,
): CFORecommendationReferences {
  const bm = ctx.bestMove;
  const goalShortfall = ctx.goal?.shortfallAmount ?? null;
  const deltaGoalShortfall = bm?.expectedImpact.deltaGoalShortfall ?? null;
  const baseline = bm?.liquidityImpact.baselineRunwayMonths ?? 0;
  const delta = bm?.liquidityImpact.deltaRunwayMonths ?? 0;
  const post = bm?.liquidityImpact.postMoveRunwayMonths ?? baseline + delta;
  const execRisk = bm?.riskImpact.executionRisk ?? 0;
  const liqRisk = bm?.riskImpact.liquidityRisk ?? 0;
  const dExec = bm?.riskImpact.deltaExecutionRiskVsHold ?? 0;
  const dLiq = bm?.riskImpact.deltaLiquidityRiskVsHold ?? 0;
  const cValue = bm?.confidenceScore.value ?? 0;
  const cBand: CFOConfidenceBand =
    bm?.confidenceScore.band ?? deriveBand(cValue);
  // mcConfidence is a strict pass-through from the Best Move engine. We do
  // NOT synthesise a substitute from monteCarlo.prob_ff here — the Best
  // Move engine is the canonical source of the candidate's confidence
  // band, and a fallback here would mask a missing thread upstream.
  const mcConf = bm?.riskImpact.mcConfidence ?? null;
  const coverage = ctx.risk?.data_coverage ?? "minimal";

  return {
    goalGap: {
      shortfallAmount: goalShortfall,
      deltaGoalShortfall,
    },
    liquidityImpact: {
      baselineRunwayMonths: round(baseline, 2),
      deltaRunwayMonths: round(delta, 2),
      postMoveRunwayMonths: round(post, 2),
    },
    riskImpact: {
      executionRisk: round(execRisk, 2),
      liquidityRisk: round(liqRisk, 2),
      deltaExecutionRiskVsHold: round(dExec, 2),
      deltaLiquidityRiskVsHold: round(dLiq, 2),
    },
    confidenceLevel: {
      value: round(cValue, 4),
      band: cBand,
      mcConfidence: mcConf != null ? round(mcConf, 4) : null,
      dataCoverage: coverage,
    },
  };
}

function deriveBand(v: number): CFOConfidenceBand {
  if (v >= CONFIDENCE_BAND_HIGH) return "high";
  if (v >= CONFIDENCE_BAND_MODERATE) return "moderate";
  return "low";
}

/* ─── Insight factory ───────────────────────────────────────────────────── */

interface MakeInsightArgs {
  id: string;
  category: CFOInsightCategory;
  severity: CFOSeverity;
  headline: string;
  body: string;
  evidence: CFOEvidence;
  recommendation?: CFORecommendationReferences | null;
}

function makeInsight(args: MakeInsightArgs): CFOInsight {
  return {
    id: args.id,
    category: args.category,
    severity: args.severity,
    headline: args.headline,
    body: args.body,
    evidence: args.evidence,
    recommendation: args.recommendation ?? null,
  };
}

/* ─── Empty / trace helpers ─────────────────────────────────────────────── */

function newTrace(): CFOAdvisorResult["trace"] {
  return {
    canonicalHeadSupplied: false,
    goalSolverSupplied: false,
    candidatesSupplied: false,
    rankingSupplied: false,
    bestMoveSupplied: false,
    riskSupplied: false,
    monteCarloSupplied: false,
    counts: {
      risks: 0,
      opportunities: 0,
      bottlenecks: 0,
      contradictions: 0,
      recommendedNextActions: 0,
      watchItems: 0,
    },
    derivedEngineOutputs: {
      candidates: false,
      ranking: false,
      bestMove: false,
    },
    incomplete: true,
  };
}

function finaliseEmpty(
  trace: CFOAdvisorResult["trace"],
  watchItems: CFOInsight[],
): CFOAdvisorResult {
  trace.counts.watchItems = watchItems.length;
  trace.incomplete = true;
  return {
    risks: [],
    opportunities: [],
    bottlenecks: [],
    contradictions: [],
    recommendedNextActions: [],
    watchItems,
    trace,
  };
}

/* ─── Formatting utils ──────────────────────────────────────────────────── */

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-AU");
}

function formatPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function formatMonths(m: number, signed = false): string {
  const v = round(m, 1);
  if (signed) return `${v >= 0 ? "+" : ""}${v}mo`;
  return `${v}mo`;
}

function formatSigned(n: number): string {
  const v = round(n, 1);
  return `${v >= 0 ? "+" : ""}${v}`;
}

function round(n: number, dp: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
