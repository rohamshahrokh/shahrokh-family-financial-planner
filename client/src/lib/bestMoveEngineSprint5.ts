/**
 * bestMoveEngineSprint5.ts — Sprint 5 Phase 3, Best Move Engine.
 *
 * Why this file exists
 * --------------------
 * Sprint 5 Phase 1 (`goalSolver.ts`) answered "are we on track?". Phase 2
 * (`decisionCandidates.ts` + `decisionRanking.ts`) layered a candidate
 * generator and a deterministic ranking on top. Sprint 5 Phase 3 — this
 * module — produces the **single Best Next Action** the household should
 * take right now, with a transparent explanation of why it beats the
 * available alternatives.
 *
 * The engine is a strict **consumer** of canonical services and Sprint 5
 * Phase 1/2 outputs. It never duplicates financial math:
 *   - Net worth / surplus / passive income / FIRE   → canonicalHeadlineMetrics
 *   - Goal feasibility / shortfall / required mo $ → goalSolver
 *   - Candidate set + per-candidate projections    → decisionCandidates
 *   - Ranking + score breakdown                    → decisionRanking
 *   - Risk surface                                  → riskEngine result
 *   - Monte Carlo confidence                        → forecastStore.MonteCarloResult
 *
 * Determinism rules
 * -----------------
 *   1. Same canonical inputs ⇒ byte-identical BestMoveResult.
 *   2. No Date.now / Math.random / I/O.
 *   3. No hardcoded household values. Liquidity, FIRE %, risk and MC
 *      values all flow through from canonical outputs.
 *   4. When optional engine outputs are missing the engine still produces
 *      a result, marks the relevant input as incomplete, and dampens
 *      confidence rather than fabricating values.
 *
 * Output shape
 * ------------
 * The engine returns a `BestMoveResult` with the six Sprint 5 Phase 3
 * deliverables:
 *   - bestNextAction       — the recommended move (label, kind, rationale)
 *   - expectedImpact       — canonical-dimension deltas for the move
 *   - riskImpact           — execution-risk delta vs hold-current-path
 *   - liquidityImpact      — liquidity-runway delta vs hold-current-path
 *   - confidenceScore      — 0..1, derived from MC + data coverage + score margin
 *   - whyThisBeatsAlternatives — runner-up comparison + decisive factors
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  generateDecisionCandidates,
  type CandidateGeneratorInputs,
  type CandidateGeneratorOutputs,
  type CandidateKind,
  type CandidateProjection,
  type CandidateRiskProfile,
  type DecisionCandidate,
} from "./decisionCandidates";
import {
  rankDecisionCandidates,
  DEFAULT_RANKING_WEIGHTS,
  type RankedCandidate,
  type RankingOutput,
  type RankingWeights,
  type ScoreComponent,
} from "./decisionRanking";
import { solveGoalGap, type GoalSolverInputs, type GoalSolverOutputs } from "./goalSolver";
import type { ForecastOutput } from "./forecastEngine";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";

/* ─── Public types ──────────────────────────────────────────────────────── */

/**
 * The recommended next action. Mirrors the `DecisionCandidate` shape's
 * identifying fields but adds a stable `rank` (always 1) and exposes the
 * score breakdown used to rank it. UI surfaces can render this directly
 * without re-running the ranking pass.
 */
export interface BestNextAction {
  id: string;
  kind: CandidateKind;
  label: string;
  rationale: string;
  /** Always 1 — the rank-1 candidate is the best move by definition. */
  rank: 1;
  /** Composite ranking score (higher is better). Pass-through from
   *  `decisionRanking.rankDecisionCandidates`. */
  score: number;
  /** Dollar magnitude of the structural change. 0 for the hold baseline. */
  magnitude: number;
  /** True when the move is the do-nothing baseline. When this is true the
   *  engine is explicitly recommending "hold the current path" — that is
   *  itself a deliberate decision, not a missing recommendation. */
  isHoldBaseline: boolean;
}

/**
 * Per-dimension expected-impact summary for the best next action. All
 * deltas are *vs the hold-current-path baseline* — i.e. how the
 * household's canonical metrics change if they execute this move rather
 * than do nothing.
 */
export interface ExpectedImpact {
  /** Δ net worth ($) at the canonical horizon. */
  deltaNetWorth: number;
  /** Δ annual passive income ($/yr). */
  deltaPassiveIncome: number;
  /** Δ monthly cash surplus ($/mo). */
  deltaMonthlySurplus: number;
  /** Δ monthly debt service ($/mo) — negative means lower debt service. */
  deltaMonthlyDebtService: number;
  /** Δ FIRE-progress fraction (0..1). */
  deltaFireProgress: number;
  /** Δ goal-shortfall ($). Negative means the move reduces the binding
   *  goal-solver shortfall. Null when goal-solver has no shortfall. */
  deltaGoalShortfall: number | null;
  /** Canonical horizon (months) over which the deltas are scored. */
  horizonMonths: number;
}

/**
 * Risk impact of the recommended move vs the hold-current-path baseline.
 * Execution risk is the candidate's own profile (0..100); liquidity risk
 * is also surfaced here so the UI can render both penalties on one panel.
 * `mcConfidence` is pass-through from the candidate's risk profile.
 */
export interface RiskImpact {
  /** Candidate execution risk (0..100). */
  executionRisk: number;
  /** Candidate liquidity risk (0..100). */
  liquidityRisk: number;
  /** Δ execution risk vs the hold baseline (signed). */
  deltaExecutionRiskVsHold: number;
  /** Δ liquidity risk vs the hold baseline (signed). */
  deltaLiquidityRiskVsHold: number;
  /** Monte Carlo confidence pass-through (0..1) or null when MC absent. */
  mcConfidence: number | null;
}

/**
 * Liquidity impact in months of runway. The candidate's
 * `deltaLiquidityMonths` is the engine's primary surface, but we also
 * report the baseline + post-move runway so the UI can show both numbers.
 */
export interface LiquidityImpact {
  /** Baseline cash runway in months (cash / monthly outflow). */
  baselineRunwayMonths: number;
  /** Δ runway months induced by the move (signed). */
  deltaRunwayMonths: number;
  /** Runway after the move = baseline + delta. */
  postMoveRunwayMonths: number;
}

/**
 * Confidence score for the recommendation. Composed from three signals:
 *   - Monte Carlo confidence (pass-through, weighted 0.5 when present).
 *   - Score margin over the runner-up (normalised, weighted 0.3).
 *   - Data coverage from the risk engine (weighted 0.2).
 * Result is clamped to [0, 1]. When MC is absent the weight is rolled
 * into the remaining two signals proportionally.
 */
export interface ConfidenceScore {
  /** Final confidence in [0, 1]. */
  value: number;
  /** Plain-English banding. */
  band: "low" | "moderate" | "high";
  /** Component breakdown for transparency. */
  components: {
    mcConfidence: number | null;
    scoreMargin: number;
    dataCoverage: "full" | "partial" | "minimal";
    /** Final weighted contributions (sum to `value`). */
    contributions: {
      mc: number;
      margin: number;
      coverage: number;
    };
  };
}

/**
 * Comparison panel that explains why the best move beat the alternatives.
 * The runner-up is the rank-2 candidate (when present); decisive factors
 * are the score-component dimensions where the recommended move scored
 * materially above the runner-up.
 */
export interface WhyThisBeatsAlternatives {
  /** Plain-English narrative — assembled from the breakdown and the
   *  ranking margin. UI surfaces should treat this as the primary copy. */
  narrative: string;
  /** Top decisive factors (dimension + contribution gap vs runner-up). */
  decisiveFactors: Array<{
    dimension: ScoreComponent["dimension"];
    bestContribution: number;
    runnerUpContribution: number;
    /** bestContribution − runnerUpContribution. Positive = best had the
     *  upside; negative on penalty dims = best had less penalty. */
    contributionGap: number;
  }>;
  /** Runner-up summary (null when no alternative exists). */
  runnerUp: {
    id: string;
    label: string;
    kind: CandidateKind;
    score: number;
    /** scoreMargin = best.score − runnerUp.score. */
    scoreMargin: number;
  } | null;
  /** Risk/liquidity tradeoff: positive when the move adds risk for upside,
   *  negative when the move reduces risk. */
  riskLiquidityTradeoff: number;
  /** Source of the confidence value (plain English). */
  confidenceSource: string;
}

/**
 * Full Best Move engine result. All six deliverables plus a deterministic
 * trace the UI / tests can inspect.
 */
export interface BestMoveResult {
  bestNextAction: BestNextAction;
  expectedImpact: ExpectedImpact;
  riskImpact: RiskImpact;
  liquidityImpact: LiquidityImpact;
  confidenceScore: ConfidenceScore;
  whyThisBeatsAlternatives: WhyThisBeatsAlternatives;
  /** Trace for diagnostics / tests. Pure data, no functions. */
  trace: {
    /** Number of candidates evaluated. */
    candidatesEvaluated: number;
    /** Whether any candidate was flagged incomplete. */
    incomplete: boolean;
    /** Ranking weights used. */
    weightsUsed: RankingWeights;
    /** Did the caller supply pre-ranked candidates (true) or did the
     *  engine generate + rank from canonical inputs (false). */
    rankingSuppliedByCaller: boolean;
    /** Did the engine receive a non-null Monte Carlo output. */
    monteCarloSupplied: boolean;
    /** Did the engine receive a non-null Risk Radar output. */
    riskSupplied: boolean;
    /** Did the engine receive a non-null Goal Solver output (or run one). */
    goalSolverConsumed: boolean;
    /** Canonical horizon (months) for projection deltas. */
    horizonMonths: number;
  };
}

/* ─── Engine inputs ──────────────────────────────────────────────────────── */

export interface BestMoveEngineInputs {
  /** Pre-computed ranking output (e.g. from a UI that already ran
   *  Phase 2). When provided the engine skips candidate generation and
   *  ranking — it consumes the ranked output directly. */
  rankingOutputs?: RankingOutput;
  /** Pre-computed candidate set. When provided the engine ranks these
   *  rather than generating new ones. Ignored when rankingOutputs is set. */
  candidateOutputs?: CandidateGeneratorOutputs;
  /** Canonical ledger — required when neither rankingOutputs nor
   *  candidateOutputs is provided. The engine will then call
   *  generateDecisionCandidates + rankDecisionCandidates internally. */
  canonicalLedger?: DashboardInputs;
  /** Optional pre-computed goal solver output, threaded into candidate
   *  generation when the engine runs Phase 2 itself. */
  goalSolverOutputs?: GoalSolverOutputs;
  /** Optional user goal targets to pass to the goal solver (when neither
   *  goalSolverOutputs nor candidateOutputs is provided). */
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  /** Forecast engine output — propagated into candidate generation. */
  forecastOutputs?: ForecastOutput | null;
  /** Risk radar output — propagated and used by confidence scoring. */
  riskOutputs?: RiskRadarResult | null;
  /** Monte Carlo output — propagated and used by confidence scoring. */
  monteCarloOutputs?: MonteCarloResult | null;
  /** Optional ranking-weight overrides. */
  weights?: Partial<RankingWeights>;
  /** When true, candidates flagged incomplete by the generator are not
   *  considered as the best move. Default false — they remain in the
   *  ranking, but the engine reports `trace.incomplete = true`. */
  suppressIncomplete?: boolean;
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Compute the household's best next action.
 *
 * Pure / deterministic. Consumes the canonical Sprint 5 Phase 1/2
 * outputs and the Sprint 4C/D canonical services. Never fabricates
 * household values.
 *
 * Resolution order for the input set:
 *   1. If `rankingOutputs` is supplied, use it as-is.
 *   2. Else if `candidateOutputs` is supplied, rank it with the engine's
 *      ranking weights and use the result.
 *   3. Else require `canonicalLedger`; generate candidates and rank them.
 *
 * Throws (well, returns an explicit `BestMoveResult` describing the
 * empty case) when none of the above resolve to at least one candidate.
 */
export function computeBestMoveSprint5(
  inputs: BestMoveEngineInputs,
): BestMoveResult {
  const horizonMonths = inputs.candidateOutputs?.trace.horizonMonths ?? 12;

  // Resolve ranking output (deterministic source of truth for ordering).
  const resolved = resolveRanking(inputs);
  const ranking = resolved.ranking;
  const rankingSuppliedByCaller = resolved.rankingSuppliedByCaller;

  if (!ranking.recommended || ranking.ranked.length === 0) {
    return emptyResult({
      reason: "No candidates available to evaluate.",
      incomplete: true,
      monteCarloSupplied: !!inputs.monteCarloOutputs,
      riskSupplied: !!inputs.riskOutputs,
      goalSolverConsumed: !!inputs.goalSolverOutputs,
      weightsUsed: { ...DEFAULT_RANKING_WEIGHTS, ...(inputs.weights ?? {}) },
      rankingSuppliedByCaller,
      horizonMonths,
    });
  }

  // When the caller asks us to suppress incomplete, drop them from the
  // candidate consideration for "best" — but we still keep them in the
  // ranking for the runner-up comparison.
  const eligible = inputs.suppressIncomplete
    ? ranking.ranked.filter(r => !r.candidate.incomplete)
    : ranking.ranked;
  const best = eligible[0] ?? ranking.recommended;
  const runnerUp = eligible.find(r => r.candidate.id !== best.candidate.id) ?? null;

  // Locate the hold-current-path candidate for delta-vs-baseline calcs.
  const holdRanked = ranking.ranked.find(r => r.candidate.isBaseline) ?? null;

  const bestNextAction: BestNextAction = {
    id: best.candidate.id,
    kind: best.candidate.kind,
    label: best.candidate.label,
    rationale: best.candidate.rationale,
    rank: 1,
    score: Number(best.score.toFixed(6)),
    magnitude: best.candidate.magnitude,
    isHoldBaseline: best.candidate.isBaseline === true,
  };

  const expectedImpact = buildExpectedImpact(
    best.candidate.projection,
    horizonMonths,
  );

  const riskImpact = buildRiskImpact(
    best.candidate.risk,
    holdRanked?.candidate.risk ?? null,
  );

  const liquidityImpact = buildLiquidityImpact(
    best.candidate.projection,
    inputs,
  );

  const confidenceScore = buildConfidenceScore({
    mcConfidence: best.candidate.risk.mcConfidence,
    bestScore: best.score,
    runnerUpScore: runnerUp?.score ?? null,
    dataCoverage: inputs.riskOutputs?.data_coverage ?? "minimal",
  });

  const whyThisBeatsAlternatives = buildWhyThisBeats({
    best,
    runnerUp,
    confidenceScore,
    monteCarloSupplied: !!inputs.monteCarloOutputs,
  });

  return {
    bestNextAction,
    expectedImpact,
    riskImpact,
    liquidityImpact,
    confidenceScore,
    whyThisBeatsAlternatives,
    trace: {
      candidatesEvaluated: ranking.ranked.length,
      incomplete: ranking.incomplete,
      weightsUsed: ranking.trace.weightsUsed,
      rankingSuppliedByCaller,
      monteCarloSupplied: !!inputs.monteCarloOutputs,
      riskSupplied: !!inputs.riskOutputs,
      goalSolverConsumed: !!inputs.goalSolverOutputs || !!inputs.candidateOutputs || !!inputs.rankingOutputs || !!inputs.canonicalLedger,
      horizonMonths,
    },
  };
}

/* ─── Helpers (pure, no I/O) ─────────────────────────────────────────────── */

interface ResolvedRanking {
  ranking: RankingOutput;
  rankingSuppliedByCaller: boolean;
}

function resolveRanking(inputs: BestMoveEngineInputs): ResolvedRanking {
  if (inputs.rankingOutputs) {
    return { ranking: inputs.rankingOutputs, rankingSuppliedByCaller: true };
  }
  if (inputs.candidateOutputs) {
    return {
      ranking: rankDecisionCandidates({
        candidateOutputs: inputs.candidateOutputs,
        weights: inputs.weights,
        suppressIncomplete: inputs.suppressIncomplete,
      }),
      rankingSuppliedByCaller: false,
    };
  }
  if (!inputs.canonicalLedger) {
    return { ranking: emptyRanking(inputs.weights), rankingSuppliedByCaller: false };
  }
  // Generate candidates from canonical inputs.
  const goalSolverOutputs =
    inputs.goalSolverOutputs ??
    solveGoalGap({
      canonicalLedger: inputs.canonicalLedger,
      forecastOutputs: inputs.forecastOutputs ?? null,
      riskOutputs: inputs.riskOutputs ?? null,
      monteCarloOutputs: inputs.monteCarloOutputs ?? null,
      ...(inputs.goalSolverInputs ?? {}),
    });
  const generatorInputs: CandidateGeneratorInputs = {
    canonicalLedger: inputs.canonicalLedger,
    goalSolverOutputs,
    forecastOutputs: inputs.forecastOutputs ?? null,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  };
  const generated = generateDecisionCandidates(generatorInputs);
  return {
    ranking: rankDecisionCandidates({
      candidateOutputs: generated,
      weights: inputs.weights,
      suppressIncomplete: inputs.suppressIncomplete,
    }),
    rankingSuppliedByCaller: false,
  };
}

function buildExpectedImpact(
  projection: CandidateProjection,
  horizonMonths: number,
): ExpectedImpact {
  return {
    deltaNetWorth: round2(projection.deltaNetWorth),
    deltaPassiveIncome: round2(projection.deltaPassiveIncome),
    deltaMonthlySurplus: round2(projection.deltaMonthlySurplus),
    deltaMonthlyDebtService: round2(projection.deltaMonthlyDebtService),
    deltaFireProgress: Number(projection.deltaFireProgress.toFixed(6)),
    deltaGoalShortfall:
      projection.deltaGoalShortfall == null
        ? null
        : round2(projection.deltaGoalShortfall),
    horizonMonths,
  };
}

function buildRiskImpact(
  best: CandidateRiskProfile,
  hold: CandidateRiskProfile | null,
): RiskImpact {
  const holdExec = hold?.executionRisk ?? 0;
  const holdLiq = hold?.liquidityRisk ?? 0;
  return {
    executionRisk: best.executionRisk,
    liquidityRisk: best.liquidityRisk,
    deltaExecutionRiskVsHold: round2(best.executionRisk - holdExec),
    deltaLiquidityRiskVsHold: round2(best.liquidityRisk - holdLiq),
    mcConfidence: best.mcConfidence,
  };
}

function buildLiquidityImpact(
  projection: CandidateProjection,
  inputs: BestMoveEngineInputs,
): LiquidityImpact {
  // The baseline runway is sourced from the candidate generator trace
  // when available — it's the canonical "cash / monthly outflow" figure
  // already computed by Phase 2. If the engine wasn't run with raw
  // candidates we fall back to the ranking baseline metrics, which
  // expose monthly expenses; we can then derive runway from the same
  // canonical formula without re-implementing it.
  const baselineRunwayMonths = resolveBaselineRunway(inputs);
  const delta = projection.deltaLiquidityMonths;
  return {
    baselineRunwayMonths: round2(baselineRunwayMonths),
    deltaRunwayMonths: round2(delta),
    postMoveRunwayMonths: round2(baselineRunwayMonths + delta),
  };
}

function resolveBaselineRunway(inputs: BestMoveEngineInputs): number {
  // Prefer the candidate generator's pre-computed value.
  if (inputs.candidateOutputs?.trace.baselineLiquidityMonths != null) {
    return inputs.candidateOutputs.trace.baselineLiquidityMonths;
  }
  if (inputs.rankingOutputs) {
    // Ranking output does not carry liquidity months directly. The
    // candidate-side trace is the canonical source — when the caller
    // hands us a pre-ranked output without the generator trace, we
    // report 0 and rely on the caller to provide a fuller input. This
    // is intentional: we do NOT recompute liquidity here (no duplicated
    // math) and we do NOT fabricate a household-specific number.
    return 0;
  }
  // If we generated the ranking ourselves the generator trace path was
  // taken — but we can't re-derive without re-running. Engine consumers
  // can read trace.baselineLiquidityMonths off the generator output.
  return 0;
}

interface ConfidenceInputs {
  mcConfidence: number | null;
  bestScore: number;
  runnerUpScore: number | null;
  dataCoverage: "full" | "partial" | "minimal";
}

function buildConfidenceScore(c: ConfidenceInputs): ConfidenceScore {
  // Score margin: normalised gap between best and runner-up, clamped
  // to [0, 1]. When there is no runner-up the margin contribution is
  // a flat 0.5 (no comparison to dispute the recommendation).
  const margin =
    c.runnerUpScore == null
      ? 0.5
      : clamp01(Math.max(0, c.bestScore - c.runnerUpScore));
  // Coverage band: full → 1, partial → 0.6, minimal → 0.3.
  const coverageValue =
    c.dataCoverage === "full" ? 1 : c.dataCoverage === "partial" ? 0.6 : 0.3;
  // Weights: mc 0.5, margin 0.3, coverage 0.2. When MC absent the 0.5
  // is redistributed pro-rata between margin (0.6) and coverage (0.4).
  let wMc = 0.5;
  let wMargin = 0.3;
  let wCoverage = 0.2;
  if (c.mcConfidence == null) {
    wMc = 0;
    wMargin = 0.6;
    wCoverage = 0.4;
  }
  const mcContribution = wMc * (c.mcConfidence ?? 0);
  const marginContribution = wMargin * margin;
  const coverageContribution = wCoverage * coverageValue;
  const value = clamp01(mcContribution + marginContribution + coverageContribution);
  const band: ConfidenceScore["band"] =
    value >= 0.75 ? "high" : value >= 0.5 ? "moderate" : "low";
  return {
    value: Number(value.toFixed(6)),
    band,
    components: {
      mcConfidence: c.mcConfidence,
      scoreMargin: Number(margin.toFixed(6)),
      dataCoverage: c.dataCoverage,
      contributions: {
        mc: Number(mcContribution.toFixed(6)),
        margin: Number(marginContribution.toFixed(6)),
        coverage: Number(coverageContribution.toFixed(6)),
      },
    },
  };
}

interface WhyInputs {
  best: RankedCandidate;
  runnerUp: RankedCandidate | null;
  confidenceScore: ConfidenceScore;
  monteCarloSupplied: boolean;
}

function buildWhyThisBeats(w: WhyInputs): WhyThisBeatsAlternatives {
  const decisiveFactors: WhyThisBeatsAlternatives["decisiveFactors"] = [];
  if (w.runnerUp) {
    const bestMap = breakdownMap(w.best.breakdown);
    const ruMap = breakdownMap(w.runnerUp.breakdown);
    const ALL_DIMENSIONS: ScoreComponent["dimension"][] = [
      "netWorth",
      "passiveIncome",
      "monthlySurplus",
      "fireProgress",
      "goalShortfall",
      "executionRisk",
      "liquidityRisk",
      "mcConfidence",
    ];
    const factors: WhyThisBeatsAlternatives["decisiveFactors"] = [];
    for (const dim of ALL_DIMENSIONS) {
      const inBest = bestMap.has(dim);
      const inRunner = ruMap.has(dim);
      if (!inBest && !inRunner) continue;
      const b = bestMap.get(dim) ?? 0;
      const r = ruMap.get(dim) ?? 0;
      factors.push({
        dimension: dim,
        bestContribution: Number(b.toFixed(6)),
        runnerUpContribution: Number(r.toFixed(6)),
        contributionGap: Number((b - r).toFixed(6)),
      });
    }
    // Order by absolute gap descending. Deterministic tiebreak on
    // dimension name so the runtime output is stable across runs.
    factors.sort((a, b) => {
      const da = Math.abs(b.contributionGap) - Math.abs(a.contributionGap);
      if (da !== 0) return da;
      return a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0;
    });
    decisiveFactors.push(...factors.slice(0, 3));
  }

  // Risk / liquidity tradeoff = sum of penalty contributions on best
  // (i.e. negative pressure absorbed). If a candidate scored well even
  // with high penalties, the tradeoff is positive — it took risk for
  // upside. If the candidate has near-zero penalties, the tradeoff is
  // near zero — a clean recommendation.
  const exec = w.best.breakdown.find(b => b.dimension === "executionRisk");
  const liq = w.best.breakdown.find(b => b.dimension === "liquidityRisk");
  const tradeoff = (exec?.contribution ?? 0) + (liq?.contribution ?? 0);

  const confidenceSource = w.monteCarloSupplied
    ? `Monte Carlo confidence (${pct(w.best.candidate.risk.mcConfidence ?? 0)}) + score margin + risk-engine data coverage`
    : `Score margin + risk-engine data coverage (Monte Carlo confidence not supplied)`;

  const narrative = buildNarrative({
    best: w.best,
    runnerUp: w.runnerUp,
    topDecisive: decisiveFactors[0] ?? null,
    confidenceBand: w.confidenceScore.band,
  });

  return {
    narrative,
    decisiveFactors,
    runnerUp:
      w.runnerUp == null
        ? null
        : {
            id: w.runnerUp.candidate.id,
            label: w.runnerUp.candidate.label,
            kind: w.runnerUp.candidate.kind,
            score: Number(w.runnerUp.score.toFixed(6)),
            scoreMargin: Number((w.best.score - w.runnerUp.score).toFixed(6)),
          },
    riskLiquidityTradeoff: Number(tradeoff.toFixed(6)),
    confidenceSource,
  };
}

function buildNarrative(opts: {
  best: RankedCandidate;
  runnerUp: RankedCandidate | null;
  topDecisive: WhyThisBeatsAlternatives["decisiveFactors"][number] | null;
  confidenceBand: ConfidenceScore["band"];
}): string {
  const bestLabel = opts.best.candidate.label;
  if (opts.best.candidate.isBaseline) {
    return (
      `Holding the current path is the best move right now — no alternative ` +
      `candidate scored above the do-nothing baseline. Confidence is ${opts.confidenceBand}.`
    );
  }
  if (!opts.runnerUp) {
    return (
      `${bestLabel} is the only material alternative to the current path. ` +
      `Confidence is ${opts.confidenceBand}.`
    );
  }
  const decisive = opts.topDecisive
    ? humanDimension(opts.topDecisive.dimension)
    : "the combined canonical impact";
  const margin = Math.max(0, opts.best.score - opts.runnerUp.score);
  const marginPhrase = margin > 0.05
    ? `clearly ahead of ${opts.runnerUp.candidate.label}`
    : margin > 0.005
      ? `narrowly ahead of ${opts.runnerUp.candidate.label}`
      : `effectively tied with ${opts.runnerUp.candidate.label} (id tiebreak applied)`;
  return (
    `${bestLabel} ranks first on ${decisive}, ${marginPhrase}. Confidence is ${opts.confidenceBand}.`
  );
}

function humanDimension(d: ScoreComponent["dimension"]): string {
  switch (d) {
    case "netWorth":       return "net worth growth";
    case "passiveIncome":  return "passive income growth";
    case "monthlySurplus": return "monthly cash surplus";
    case "fireProgress":   return "FIRE progress";
    case "goalShortfall":  return "closing the goal shortfall";
    case "executionRisk":  return "execution risk tradeoff";
    case "liquidityRisk":  return "liquidity tradeoff";
    case "mcConfidence":   return "Monte Carlo confidence";
  }
}

function breakdownMap(bd: ScoreComponent[]): Map<ScoreComponent["dimension"], number> {
  const m = new Map<ScoreComponent["dimension"], number>();
  for (const c of bd) {
    m.set(c.dimension, c.contribution);
  }
  return m;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pct(decimal: number): string {
  if (!Number.isFinite(decimal)) return "0%";
  return `${Math.round(decimal * 100)}%`;
}

function emptyRanking(weights?: Partial<RankingWeights>): RankingOutput {
  return {
    ranked: [],
    recommended: null,
    incomplete: true,
    trace: {
      weightsUsed: { ...DEFAULT_RANKING_WEIGHTS, ...(weights ?? {}) },
      candidatesEvaluated: 0,
      candidatesIncomplete: 0,
      baseline: {} as RankingOutput["trace"]["baseline"],
    },
  };
}

interface EmptyResultOpts {
  reason: string;
  incomplete: boolean;
  monteCarloSupplied: boolean;
  riskSupplied: boolean;
  goalSolverConsumed: boolean;
  weightsUsed: RankingWeights;
  rankingSuppliedByCaller: boolean;
  horizonMonths: number;
}

function emptyResult(opts: EmptyResultOpts): BestMoveResult {
  return {
    bestNextAction: {
      id: "no-action",
      kind: "hold-current-path",
      label: "No recommendation available",
      rationale: opts.reason,
      rank: 1,
      score: 0,
      magnitude: 0,
      isHoldBaseline: true,
    },
    expectedImpact: {
      deltaNetWorth: 0,
      deltaPassiveIncome: 0,
      deltaMonthlySurplus: 0,
      deltaMonthlyDebtService: 0,
      deltaFireProgress: 0,
      deltaGoalShortfall: null,
      horizonMonths: opts.horizonMonths,
    },
    riskImpact: {
      executionRisk: 0,
      liquidityRisk: 0,
      deltaExecutionRiskVsHold: 0,
      deltaLiquidityRiskVsHold: 0,
      mcConfidence: null,
    },
    liquidityImpact: {
      baselineRunwayMonths: 0,
      deltaRunwayMonths: 0,
      postMoveRunwayMonths: 0,
    },
    confidenceScore: {
      value: 0,
      band: "low",
      components: {
        mcConfidence: null,
        scoreMargin: 0,
        dataCoverage: "minimal",
        contributions: { mc: 0, margin: 0, coverage: 0 },
      },
    },
    whyThisBeatsAlternatives: {
      narrative: opts.reason,
      decisiveFactors: [],
      runnerUp: null,
      riskLiquidityTradeoff: 0,
      confidenceSource: "no inputs available",
    },
    trace: {
      candidatesEvaluated: 0,
      incomplete: opts.incomplete,
      weightsUsed: opts.weightsUsed,
      rankingSuppliedByCaller: opts.rankingSuppliedByCaller,
      monteCarloSupplied: opts.monteCarloSupplied,
      riskSupplied: opts.riskSupplied,
      goalSolverConsumed: opts.goalSolverConsumed,
      horizonMonths: opts.horizonMonths,
    },
  };
}

/* ─── Convenience re-exports for callers wiring Sprint 5 end-to-end ─────── */

export type {
  CandidateGeneratorOutputs,
  CandidateProjection,
  CandidateRiskProfile,
  DecisionCandidate,
} from "./decisionCandidates";
export type { RankedCandidate, RankingOutput } from "./decisionRanking";
