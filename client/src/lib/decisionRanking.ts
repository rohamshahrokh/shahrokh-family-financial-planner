/**
 * decisionRanking.ts — Sprint 5 Phase 2, Decision Ranking Engine V1.
 *
 * Why this file exists
 * --------------------
 * Sprint 5 Phase 2 layered a `candidateGenerator` (decisionCandidates.ts) on
 * top of Sprint 5 Phase 1's `goalSolver` and the Sprint 4C/4D canonical
 * services. This module ranks those candidates and surfaces ONE recommended
 * option with plain-English reasoning and a transparent score breakdown.
 *
 * Design rules (per Sprint 5 spec)
 * --------------------------------
 *   1. Deterministic — same inputs (DecisionCandidate[]) ⇒ identical order.
 *      The ranking function is pure; the tie-breaker is the stable `id`.
 *   2. Canonical-only — formulas use the canonical dimensions emitted by the
 *      candidate projection (net worth, passive income, surplus, FIRE, etc).
 *      No page-specific formulas, no household values embedded here.
 *   3. Transparent — every candidate ships a `breakdown` array showing the
 *      per-dimension contribution to its final score. The UI / tests can
 *      verify the score equals the sum of the components plus the penalties.
 *   4. Testable thresholds — the weights and penalty bands are exported as
 *      `DEFAULT_RANKING_WEIGHTS` so the test suite can pin them and any
 *      change is reviewed.
 *
 * The ranking is dimensional, not monetary. Each dimension is normalised to
 * [-1, 1] by the candidate's own magnitude (and the household's canonical
 * baseline where relevant) so candidates with very different dollar scales
 * (a $30k offset sweep vs a $1.2m IP purchase) can be compared apples-to-
 * apples on "how much does each canonical dimension move?"
 */

import type {
  DecisionCandidate,
  CandidateGeneratorOutputs,
  CandidateProjection,
  CandidateRiskProfile,
} from "./decisionCandidates";
import type { CanonicalHeadlineMetrics } from "./canonicalHeadlineMetrics";

/* ─── Public types ──────────────────────────────────────────────────────── */

/**
 * Engine-level ranking weights. Sum to 1.0 across the **positive-dimension**
 * weights (net worth, passive income, surplus, FIRE, goal shortfall closure).
 * Risk and liquidity are subtractive penalty bands, not part of the convex
 * combination — they reduce a candidate's normalised score without
 * displacing the upside contribution of a strong move.
 */
export interface RankingWeights {
  /** Weight for Δ net worth at the canonical horizon. */
  netWorth: number;
  /** Weight for Δ passive income at the horizon. */
  passiveIncome: number;
  /** Weight for Δ monthly cash surplus / cashflow. */
  monthlySurplus: number;
  /** Weight for Δ FIRE-progress fraction. */
  fireProgress: number;
  /** Weight for Δ goal-shortfall closure. */
  goalShortfall: number;
  /** Penalty multiplier applied to execution-risk (0..100). */
  executionRiskPenalty: number;
  /** Penalty multiplier applied to liquidity-risk (0..100). */
  liquidityRiskPenalty: number;
  /** Confidence multiplier — when MC confidence is present the final score
   *  is multiplied by `(0.5 + 0.5 × confidence)`, so a confidence of 1
   *  preserves the score and a confidence of 0 halves it. */
  mcConfidenceWeight: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  // Convex combination on the upside side — these five sum to 1.0.
  netWorth:       0.25,
  passiveIncome:  0.20,
  monthlySurplus: 0.15,
  fireProgress:   0.20,
  goalShortfall:  0.20,
  // Penalty bands (NOT part of the upside sum).
  executionRiskPenalty: 0.15,
  liquidityRiskPenalty: 0.20,
  // MC confidence weight is a multiplier on the final score, see below.
  mcConfidenceWeight:   1.0,
};

/**
 * Per-dimension breakdown of a candidate's score. The final score is:
 *
 *   raw = Σ (component × weight)        for the five upside dimensions
 *   penalty = executionRiskPenalty × (executionRisk/100)
 *           + liquidityRiskPenalty × (liquidityRisk/100)
 *   score = (raw − penalty) × (0.5 + 0.5 × mcConfidence)   // when MC present
 *           (raw − penalty)                                  // when MC absent
 *
 * Each component is the normalised dimensional value × its weight. The
 * `value` field is the normalised dimension (in [-1, 1]); `contribution` is
 * the weighted component used in the sum.
 */
export interface ScoreComponent {
  dimension:
    | "netWorth"
    | "passiveIncome"
    | "monthlySurplus"
    | "fireProgress"
    | "goalShortfall"
    | "executionRisk"
    | "liquidityRisk"
    | "mcConfidence";
  /** Normalised dimensional value in [-1, 1] for upside dimensions,
   *  [0, 1] for penalty bands and confidence. */
  value: number;
  /** Weight applied to this dimension. */
  weight: number;
  /** Final per-dimension contribution to the score (value × weight, signed
   *  for penalty bands). For mcConfidence this is the multiplier applied
   *  *after* the additive sum. */
  contribution: number;
}

export interface RankedCandidate {
  candidate: DecisionCandidate;
  /** Final composite score. Higher is better. */
  score: number;
  /** Position in the ranked list (1-based; 1 = recommended). */
  rank: number;
  /** Transparent per-dimension breakdown the UI / tests can inspect. */
  breakdown: ScoreComponent[];
  /** Plain-English reasoning string assembled from the breakdown. */
  reasoning: string;
}

export interface RankingOutput {
  /** Ranked candidates, descending by score, deterministic on ties. */
  ranked: RankedCandidate[];
  /** Convenience: the rank-1 candidate. null when input had no candidates. */
  recommended: RankedCandidate | null;
  /** True when one or more candidates were flagged incomplete by the
   *  generator. Surfaced so callers / UI can decide whether to suppress
   *  the recommendation or display a "data needed" affordance. */
  incomplete: boolean;
  /** Trace for diagnostics / tests. */
  trace: {
    weightsUsed: RankingWeights;
    candidatesEvaluated: number;
    candidatesIncomplete: number;
    /** Canonical baseline the ranking compared against. */
    baseline: CanonicalHeadlineMetrics;
  };
}

export interface RankingInputs {
  /** Output of `generateDecisionCandidates`. REQUIRED. */
  candidateOutputs: CandidateGeneratorOutputs;
  /** Optional override weights. Defaults to `DEFAULT_RANKING_WEIGHTS`. */
  weights?: Partial<RankingWeights>;
  /** When true, candidates flagged `incomplete` are excluded from the rank
   *  list. Default false — incomplete candidates remain visible but are
   *  penalised by their own delta values. */
  suppressIncomplete?: boolean;
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Rank a set of decision candidates. Pure / deterministic.
 *
 * Tie-breaking: when two candidates score identically (within 1e-9) they are
 * ordered by stable id (ASCII ascending). This guarantees byte-identical
 * output across runs for the same inputs.
 */
export function rankDecisionCandidates(inputs: RankingInputs): RankingOutput {
  const weights = mergeWeights(inputs.weights);
  const candidates = inputs.suppressIncomplete
    ? inputs.candidateOutputs.candidates.filter(c => !c.incomplete)
    : inputs.candidateOutputs.candidates.slice();

  // Determine normalisation bases so all candidates are scored on the same
  // axes. We use the largest absolute delta across candidates per dimension
  // as the unit of "1" — i.e. the biggest mover scores ±1 on that axis,
  // everyone else is a fraction of that. This is the standard canonical
  // normalisation: it does not embed household values, it derives the scale
  // from the candidates themselves.
  const norms = deriveNormalisationBases(candidates);

  const scored: RankedCandidate[] = candidates.map(c => {
    const breakdown = scoreCandidate(c, weights, norms);
    const raw = sumUpside(breakdown);
    const penalty = sumPenalty(breakdown);
    const mc = breakdown.find(b => b.dimension === "mcConfidence");
    // Confidence multiplier: when present, scale the (raw - penalty) result.
    // No confidence → no multiplier (multiplier of 1.0).
    const baseScore = raw - penalty;
    const score = mc ? baseScore * mc.contribution : baseScore;
    return {
      candidate: c,
      score: Number(score.toFixed(6)),
      rank: 0, // assigned after sort
      breakdown,
      reasoning: buildReasoning(c, breakdown, raw, penalty, mc?.contribution ?? null),
    };
  });

  // Deterministic sort. Higher score first; on tie break ascending by id.
  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
  });
  scored.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return {
    ranked: scored,
    recommended: scored.length > 0 ? scored[0] : null,
    incomplete: inputs.candidateOutputs.candidates.some(c => c.incomplete),
    trace: {
      weightsUsed: weights,
      candidatesEvaluated: scored.length,
      candidatesIncomplete: inputs.candidateOutputs.candidates.filter(c => c.incomplete).length,
      baseline: inputs.candidateOutputs.trace.baseline,
    },
  };
}

/* ─── Helpers (pure, no I/O) ─────────────────────────────────────────────── */

function mergeWeights(overrides?: Partial<RankingWeights>): RankingWeights {
  if (!overrides) return { ...DEFAULT_RANKING_WEIGHTS };
  return { ...DEFAULT_RANKING_WEIGHTS, ...overrides };
}

interface NormBases {
  netWorth: number;
  passiveIncome: number;
  monthlySurplus: number;
  fireProgress: number;
  goalShortfall: number;
}

function deriveNormalisationBases(candidates: DecisionCandidate[]): NormBases {
  // Max abs delta per dimension across the candidate set. We use abs because
  // the dimension can move in either direction (e.g. surplus drops when
  // contributions go up; that's a real cost, not free upside).
  const acc: NormBases = {
    netWorth: 1,
    passiveIncome: 1,
    monthlySurplus: 1,
    fireProgress: 1,
    goalShortfall: 1,
  };
  for (const c of candidates) {
    acc.netWorth       = Math.max(acc.netWorth,       Math.abs(c.projection.deltaNetWorth));
    acc.passiveIncome  = Math.max(acc.passiveIncome,  Math.abs(c.projection.deltaPassiveIncome));
    acc.monthlySurplus = Math.max(acc.monthlySurplus, Math.abs(c.projection.deltaMonthlySurplus));
    acc.fireProgress   = Math.max(acc.fireProgress,   Math.abs(c.projection.deltaFireProgress));
    acc.goalShortfall  = Math.max(
      acc.goalShortfall,
      Math.abs(c.projection.deltaGoalShortfall ?? 0),
    );
  }
  return acc;
}

function scoreCandidate(
  c: DecisionCandidate,
  w: RankingWeights,
  norms: NormBases,
): ScoreComponent[] {
  const p: CandidateProjection = c.projection;
  const r: CandidateRiskProfile = c.risk;

  const out: ScoreComponent[] = [];

  // ── Upside dimensions (signed, normalised to [-1, 1]) ─────────────────
  out.push(makeUpside("netWorth",       p.deltaNetWorth / norms.netWorth,             w.netWorth));
  out.push(makeUpside("passiveIncome",  p.deltaPassiveIncome / norms.passiveIncome,   w.passiveIncome));
  out.push(makeUpside("monthlySurplus", p.deltaMonthlySurplus / norms.monthlySurplus, w.monthlySurplus));
  out.push(makeUpside("fireProgress",   p.deltaFireProgress / norms.fireProgress,     w.fireProgress));
  // Goal-shortfall delta is signed *negative* when the candidate closes the
  // shortfall (deltaGoalShortfall < 0 == good). Flip sign so "closes more
  // shortfall" scores positive on this axis.
  const shortfallSignal =
    p.deltaGoalShortfall == null ? 0 : -p.deltaGoalShortfall / norms.goalShortfall;
  out.push(makeUpside("goalShortfall", shortfallSignal, w.goalShortfall));

  // ── Penalty bands (0..1, subtractive) ────────────────────────────────
  const execNorm = clamp01(r.executionRisk / 100);
  const liqNorm  = clamp01(r.liquidityRisk / 100);
  out.push({
    dimension: "executionRisk",
    value: execNorm,
    weight: w.executionRiskPenalty,
    contribution: execNorm * w.executionRiskPenalty,
  });
  out.push({
    dimension: "liquidityRisk",
    value: liqNorm,
    weight: w.liquidityRiskPenalty,
    contribution: liqNorm * w.liquidityRiskPenalty,
  });

  // ── MC confidence (multiplier applied after additive sum) ────────────
  if (r.mcConfidence != null) {
    const conf = clamp01(r.mcConfidence);
    // Multiplier in [0.5, 1.0]: 0 confidence halves the score; full
    // confidence leaves it unchanged. The `weight` field carries the
    // dampening factor (1.0 by default → full effect).
    const multiplier = 0.5 + 0.5 * conf;
    out.push({
      dimension: "mcConfidence",
      value: conf,
      weight: w.mcConfidenceWeight,
      contribution: multiplier,
    });
  }
  return out;
}

function makeUpside(
  dimension: ScoreComponent["dimension"],
  value: number,
  weight: number,
): ScoreComponent {
  const v = clampSigned(value);
  return {
    dimension,
    value: Number(v.toFixed(6)),
    weight,
    contribution: Number((v * weight).toFixed(6)),
  };
}

function sumUpside(bd: ScoreComponent[]): number {
  // Upside dimensions: the first 5. We filter rather than rely on order
  // so future re-ordering doesn't silently change the sum.
  const upsideDims: ScoreComponent["dimension"][] = [
    "netWorth",
    "passiveIncome",
    "monthlySurplus",
    "fireProgress",
    "goalShortfall",
  ];
  return bd
    .filter(c => upsideDims.includes(c.dimension))
    .reduce((s, c) => s + c.contribution, 0);
}

function sumPenalty(bd: ScoreComponent[]): number {
  const penaltyDims: ScoreComponent["dimension"][] = ["executionRisk", "liquidityRisk"];
  return bd
    .filter(c => penaltyDims.includes(c.dimension))
    .reduce((s, c) => s + c.contribution, 0);
}

function buildReasoning(
  c: DecisionCandidate,
  breakdown: ScoreComponent[],
  raw: number,
  penalty: number,
  mcMultiplier: number | null,
): string {
  // Pull the top 2 positive upside contributions and the top penalty as the
  // narrative drivers. Plain English, no markdown, no household values
  // embedded — the rationale on the candidate itself carries the dollar
  // detail.
  const upside = breakdown
    .filter(b => ["netWorth", "passiveIncome", "monthlySurplus", "fireProgress", "goalShortfall"].includes(b.dimension))
    .filter(b => b.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);
  const topUpside = upside.slice(0, 2).map(b => labelFor(b.dimension)).join(" and ");
  const penalties = breakdown
    .filter(b => b.dimension === "executionRisk" || b.dimension === "liquidityRisk")
    .filter(b => b.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);
  const topPenalty = penalties.length > 0 ? labelFor(penalties[0].dimension) : null;

  const confidencePhrase =
    mcMultiplier == null
      ? "Monte Carlo confidence not supplied."
      : mcMultiplier >= 0.85
        ? "High Monte Carlo confidence reinforces the rank."
        : mcMultiplier >= 0.6
          ? "Moderate Monte Carlo confidence."
          : "Low Monte Carlo confidence dampens the score.";

  if (c.isBaseline && upside.length === 0) {
    return (
      `${c.label} is the do-nothing baseline. Every other candidate is ranked relative to ` +
      `this position. ${confidencePhrase}`
    );
  }
  if (raw <= 0 && penalty > 0) {
    return (
      `${c.label} produced no positive upside across the canonical dimensions; ` +
      `penalised by ${topPenalty ?? "execution risk"}. ${confidencePhrase}`
    );
  }
  if (raw > 0 && topUpside) {
    return (
      `${c.label} ranks ahead because it materially improves ${topUpside}` +
      (topPenalty ? `, partially offset by ${topPenalty}.` : `.`) +
      ` ${confidencePhrase}`
    );
  }
  return (
    `${c.label} ranked by its net canonical impact across net worth, passive income, ` +
    `surplus, FIRE progress, and goal-shortfall closure. ${confidencePhrase}`
  );
}

function labelFor(d: ScoreComponent["dimension"]): string {
  switch (d) {
    case "netWorth":       return "net worth";
    case "passiveIncome":  return "passive income";
    case "monthlySurplus": return "monthly surplus";
    case "fireProgress":   return "FIRE progress";
    case "goalShortfall":  return "goal-shortfall closure";
    case "executionRisk":  return "execution risk";
    case "liquidityRisk":  return "liquidity risk";
    case "mcConfidence":   return "Monte Carlo confidence";
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampSigned(n: number): number {
  return Math.min(1, Math.max(-1, n));
}
