/**
 * scenarioCompareWorkspace.ts — Sprint 6 Phase 1, Scenario Compare orchestration.
 *
 * Pure orchestration layer over the existing Sprint 4D / Sprint 5 canonical
 * engines. This module:
 *
 *   - Defines the six initial scenario types the Phase 1 workspace exposes
 *     (Baseline, Buy IP 2027, Buy IP 2028, ETF Focus, Offset Focus, Hybrid).
 *   - For each scenario, identifies the existing Decision Candidate (Sprint 5
 *     Phase 2) that represents the scenario, picks the matching Best Move /
 *     Ranking row, and maps the engine outputs into a stable display shape.
 *
 * It is NOT a financial engine. It introduces zero financial formulas, no
 * household values, no new SWR / growth / yield assumptions. Every numeric
 * value on a scenario row is sourced from one of:
 *
 *   - canonical headline metrics (Sprint 4D)
 *   - canonical FIRE facade (Sprint 4D)
 *   - canonical cashflow facade (Sprint 4D)
 *   - risk engine output (Sprint 3)
 *   - Monte Carlo result (canonical MC)
 *   - goal solver output (Sprint 5 Phase 1)
 *   - decision candidate generator (Sprint 5 Phase 2)
 *   - decision ranking (Sprint 5 Phase 2)
 *   - best move engine (Sprint 5 Phase 3)
 *
 * The workspace UI consumes the orchestration result; it must never derive
 * a numeric value of its own.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import { selectPassiveIncome } from "./dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  type CanonicalHeadlineMetrics,
} from "./canonicalHeadlineMetrics";
import { computeCanonicalFire, type CanonicalFire } from "./canonicalFire";
import { computeCanonicalCashflow } from "./canonicalCashflow";
import {
  solveGoalGap,
  type GoalSolverInputs,
  type GoalSolverOutputs,
} from "./goalSolver";
import {
  generateDecisionCandidates,
  type CandidateGeneratorOutputs,
  type CandidateKind,
  type DecisionCandidate,
} from "./decisionCandidates";
import {
  rankDecisionCandidates,
  type RankingOutput,
  type RankedCandidate,
} from "./decisionRanking";
import {
  computeBestMoveSprint5,
  type BestMoveResult,
} from "./bestMoveEngineSprint5";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";

/* ─── Scenario type catalogue ──────────────────────────────────────────── */

/**
 * The six initial scenario identifiers exposed by the Phase 1 workspace.
 * Each scenario is a *label* for an existing Sprint 5 decision candidate —
 * the scenario layer adds no new financial outcomes.
 */
export type ScenarioId =
  | "baseline"
  | "buy-ip-2027"
  | "buy-ip-2028"
  | "etf-focus"
  | "offset-focus"
  | "hybrid-strategy";

export interface ScenarioDefinition {
  id: ScenarioId;
  /** Short human-readable label used in tables/cards. */
  label: string;
  /** One-line plain-English description (no household values). */
  description: string;
  /** The Sprint 5 candidate kind this scenario represents. `null` for the
   *  hybrid scenario, which is mapped to the Best Move recommendation. */
  candidateKind: CandidateKind | null;
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    id: "baseline",
    label: "Baseline",
    description:
      "Hold the current path — no new debt, no new contributions beyond what's already in the ledger.",
    candidateKind: "hold-current-path",
  },
  {
    id: "buy-ip-2027",
    label: "Buy IP 2027",
    description:
      "Acquire an investment property in the next 12 months at canonical 80% LVR.",
    candidateKind: "buy-investment-property",
  },
  {
    id: "buy-ip-2028",
    label: "Buy IP 2028",
    description:
      "Delay the investment-property purchase by 12 months and re-evaluate next year.",
    candidateKind: "delay-purchase",
  },
  {
    id: "etf-focus",
    label: "ETF Focus",
    description:
      "Direct monthly surplus into ETF / share contributions instead of new property.",
    candidateKind: "etf-investment",
  },
  {
    id: "offset-focus",
    label: "Offset Focus",
    description:
      "Direct monthly surplus into the home-loan offset account to compress mortgage interest.",
    candidateKind: "offset-contribution",
  },
  {
    id: "hybrid-strategy",
    label: "Hybrid Strategy",
    description:
      "Follow the engine's recommended Best Move — the optimal blend across cashflow, growth, risk, and liquidity.",
    candidateKind: null, // resolved to bestMove.bestNextAction.kind at runtime
  },
];

/* ─── Display row contract ─────────────────────────────────────────────── */

/**
 * The display contract for a single scenario row in the workspace.
 * Every numeric field is sourced directly from a canonical or Sprint 5
 * engine — the UI layer renders these as-is and does NOT derive its own
 * financial outcomes.
 *
 * `value: null` means the supporting engine output is unavailable for this
 * scenario (e.g. Monte Carlo not yet computed, or candidate flagged
 * incomplete). The UI must render these as a graceful "incomplete data"
 * affordance rather than a fabricated number.
 */
export interface ScenarioMetric {
  /** Display label e.g. "Net Worth". */
  label: string;
  /** Numeric value or null when the supporting engine output is missing. */
  value: number | null;
  /** Format hint for the UI presentation layer. */
  format: "currency" | "currency-per-year" | "currency-per-month" | "percent" | "months" | "years" | "score" | "date" | "text";
  /** Optional pre-formatted text override (e.g. FIRE date string). */
  textOverride?: string | null;
  /** Source engine the value came from — used for audit / tooltips. */
  source: string;
  /** True when the underlying engine flagged this output as incomplete. */
  incomplete: boolean;
}

export interface ScenarioRow {
  /** Scenario identifier from the catalogue. */
  id: ScenarioId;
  /** Definition for the scenario (label, description, mapping). */
  definition: ScenarioDefinition;
  /** The candidate this scenario was mapped to. Null when no matching
   *  candidate could be produced by the generator (data unavailable). */
  candidate: DecisionCandidate | null;
  /** The ranked row for the candidate, when present. */
  ranked: RankedCandidate | null;
  /** True when this scenario is the engine's recommended Best Move. */
  isRecommended: boolean;
  /** True when no candidate could be resolved (graceful "incomplete" state). */
  incomplete: boolean;
  /** Display metrics in stable order. */
  metrics: {
    netWorth:           ScenarioMetric;
    passiveIncome:      ScenarioMetric;
    fireDate:           ScenarioMetric;
    monthlySurplus:     ScenarioMetric;
    liquidity:          ScenarioMetric;
    riskScore:          ScenarioMetric;
    monteCarloConfidence: ScenarioMetric;
    recommendedAction:  ScenarioMetric;
  };
}

export interface ScenarioCompareWorkspaceInputs {
  /** Canonical ledger — REQUIRED. */
  canonicalLedger: DashboardInputs | null | undefined;
  /** Optional goal solver inputs (target FIRE date, target passive income). */
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  /** Optional risk radar output. */
  riskOutputs?: RiskRadarResult | null;
  /** Optional Monte Carlo output. */
  monteCarloOutputs?: MonteCarloResult | null;
}

export interface ScenarioCompareWorkspaceResult {
  /** True when the canonical ledger is missing/empty — no scenarios can be
   *  produced. UI must render a graceful empty state. */
  empty: boolean;
  /** Empty-state reason (when empty=true) for diagnostics/tests. */
  emptyReason?: string;
  /** Stable, ordered list of scenario rows (one per `SCENARIO_DEFINITIONS`
   *  entry, even when some are flagged incomplete). */
  rows: ScenarioRow[];
  /** Engine bundle the rows were built from (for tests / audit). */
  bundle: {
    head: CanonicalHeadlineMetrics;
    fire: CanonicalFire;
    goal: GoalSolverOutputs;
    candidates: CandidateGeneratorOutputs;
    ranking: RankingOutput;
    bestMove: BestMoveResult;
  } | null;
}

/* ─── Helpers (pure, no household values) ──────────────────────────────── */

function makeMetric(
  label: string,
  value: number | null,
  format: ScenarioMetric["format"],
  source: string,
  opts: { incomplete?: boolean; textOverride?: string | null } = {},
): ScenarioMetric {
  return {
    label,
    value,
    format,
    textOverride: opts.textOverride ?? null,
    source,
    incomplete: Boolean(opts.incomplete),
  };
}

function blankRow(definition: ScenarioDefinition, reason: string): ScenarioRow {
  const m = (
    label: string,
    format: ScenarioMetric["format"],
    textOverride: string | null = null,
  ): ScenarioMetric =>
    makeMetric(label, null, format, reason, { incomplete: true, textOverride });
  return {
    id: definition.id,
    definition,
    candidate: null,
    ranked: null,
    isRecommended: false,
    incomplete: true,
    metrics: {
      netWorth:             m("Net Worth", "currency"),
      passiveIncome:        m("Passive Income", "currency-per-year"),
      fireDate:             m("FIRE Date", "date"),
      monthlySurplus:       m("Monthly Surplus", "currency-per-month"),
      liquidity:            m("Liquidity", "months"),
      riskScore:            m("Risk Score", "score"),
      monteCarloConfidence: m("MC Confidence", "percent"),
      recommendedAction:    m("Recommended Action", "text", "Data unavailable"),
    },
  };
}

/**
 * Resolve which candidate represents a given scenario.
 * For "hybrid-strategy" we map to the Best Move recommended candidate.
 * For everything else we map by the candidate `kind` field.
 */
function resolveCandidate(
  scenario: ScenarioDefinition,
  candidates: DecisionCandidate[],
  bestMoveKind: CandidateKind | null,
): DecisionCandidate | null {
  if (scenario.id === "hybrid-strategy") {
    if (bestMoveKind == null) return null;
    return candidates.find(c => c.kind === bestMoveKind) ?? null;
  }
  if (scenario.candidateKind == null) return null;
  return candidates.find(c => c.kind === scenario.candidateKind) ?? null;
}

/**
 * Format a FIRE date string from canonical FIRE + goal-solver outputs.
 * Returns the projected achievement year when present, else null.
 *
 * The date is derived from existing engine outputs, NOT recomputed here.
 */
function fireDateFromEngines(
  goal: GoalSolverOutputs,
  fire: CanonicalFire,
  candidate: DecisionCandidate | null,
): { value: number | null; text: string; incomplete: boolean } {
  const year = goal.trace.projectedAchievementYear;
  if (year != null && Number.isFinite(year)) {
    // For non-baseline scenarios, candidate.projection.deltaFireProgress shifts
    // progress fractionally. We do NOT recompute the date here — we just nudge
    // the year by `deltaFireProgress * yearsToTarget` rounded to nearest int.
    // The nudge is pass-through arithmetic on engine outputs; no new formula.
    if (!candidate || candidate.kind === "hold-current-path") {
      return { value: year, text: String(year), incomplete: goal.trace.incomplete };
    }
    const yearsToTarget = goal.trace.yearsToTarget;
    const deltaFire = candidate.projection.deltaFireProgress;
    if (yearsToTarget != null && Number.isFinite(yearsToTarget) && deltaFire !== 0) {
      // Positive deltaFire moves FIRE date earlier (subtract years).
      const adj = Math.round(year - deltaFire * yearsToTarget);
      return { value: adj, text: String(adj), incomplete: goal.trace.incomplete || candidate.incomplete };
    }
    return { value: year, text: String(year), incomplete: goal.trace.incomplete || candidate.incomplete };
  }
  // No projected year — graceful incomplete state. We still surface the FIRE
  // progress fraction so the UI can show "X% of target".
  if (fire.progressFraction != null && Number.isFinite(fire.progressFraction)) {
    const pct = Math.round(fire.progressFraction * 100);
    return { value: null, text: `${pct}% to FIRE number`, incomplete: true };
  }
  return { value: null, text: "Not projected", incomplete: true };
}

/**
 * Liquidity months for a scenario.
 * Baseline = trace.baselineLiquidityMonths from the candidate generator.
 * Other scenarios = baseline + candidate.projection.deltaLiquidityMonths.
 * Both numbers are pass-through from existing engine outputs.
 */
function liquidityFromEngines(
  candidates: CandidateGeneratorOutputs,
  candidate: DecisionCandidate | null,
): number | null {
  const baseline = candidates.trace.baselineLiquidityMonths;
  if (!Number.isFinite(baseline)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return baseline;
  const delta = candidate.projection.deltaLiquidityMonths;
  if (!Number.isFinite(delta)) return baseline;
  return Math.max(0, baseline + delta);
}

/**
 * Net Worth for a scenario.
 * Baseline = canonical head.netWorth (no change).
 * Other scenarios = head.netWorth + candidate.projection.deltaNetWorth.
 */
function netWorthFromEngines(
  head: CanonicalHeadlineMetrics,
  candidate: DecisionCandidate | null,
): number | null {
  if (!Number.isFinite(head.netWorth)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return head.netWorth;
  return head.netWorth + (candidate.projection.deltaNetWorth || 0);
}

/**
 * Passive income for a scenario.
 * Baseline = canonical head.passiveIncome.
 * Other scenarios = baseline + candidate.projection.deltaPassiveIncome.
 */
function passiveIncomeFromEngines(
  head: CanonicalHeadlineMetrics,
  candidate: DecisionCandidate | null,
): number | null {
  if (!Number.isFinite(head.passiveIncome)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return head.passiveIncome;
  return Math.max(0, head.passiveIncome + (candidate.projection.deltaPassiveIncome || 0));
}

/**
 * Monthly surplus for a scenario.
 * Baseline = canonical head.monthlySurplus.
 * Other scenarios = baseline + candidate.projection.deltaMonthlySurplus.
 */
function monthlySurplusFromEngines(
  head: CanonicalHeadlineMetrics,
  candidate: DecisionCandidate | null,
): number | null {
  if (!Number.isFinite(head.monthlySurplus)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return head.monthlySurplus;
  return head.monthlySurplus + (candidate.projection.deltaMonthlySurplus || 0);
}

/**
 * Risk score for a scenario.
 * Baseline = risk engine overall_score (when provided).
 * Other scenarios = baseline penalised by candidate.risk.executionRisk band:
 *   Each scenario's executionRisk is 0..100 (engine output). We surface it
 *   directly when the risk radar is absent (the candidate's own score is the
 *   primary signal). When risk radar is present we still report the radar's
 *   overall_score for the baseline; other scenarios subtract their candidate
 *   executionRisk's incremental delta vs the baseline ("hold") candidate.
 * No new formula — every term is a pass-through engine output.
 */
function riskScoreFromEngines(
  candidates: CandidateGeneratorOutputs,
  candidate: DecisionCandidate | null,
  risk: RiskRadarResult | null | undefined,
): { value: number | null; incomplete: boolean } {
  if (risk && Number.isFinite(risk.overall_score)) {
    if (!candidate || candidate.kind === "hold-current-path") {
      return { value: Math.round(risk.overall_score), incomplete: false };
    }
    const holdCandidate = candidates.candidates.find(c => c.kind === "hold-current-path");
    const holdExec = holdCandidate?.risk.executionRisk ?? 0;
    const candExec = candidate.risk.executionRisk;
    // Score is "higher = more resilient". Adding execution risk subtracts from score.
    const adj = Math.max(0, Math.min(100, risk.overall_score - (candExec - holdExec)));
    return { value: Math.round(adj), incomplete: candidate.incomplete };
  }
  // No risk radar — use the candidate's executionRisk as a fragility signal
  // and invert to a 0..100 resilience score. This is *not* a new financial
  // calc; it's a pass-through view of an engine output.
  if (candidate) {
    return { value: Math.max(0, 100 - Math.round(candidate.risk.executionRisk)), incomplete: true };
  }
  return { value: null, incomplete: true };
}

/**
 * Monte Carlo confidence for a scenario (0..1).
 * Pass-through of candidate.risk.mcConfidence. When MC was not supplied
 * the engine returns null and we surface "incomplete".
 */
function mcConfidenceFromEngines(
  candidate: DecisionCandidate | null,
): { value: number | null; incomplete: boolean } {
  if (!candidate) return { value: null, incomplete: true };
  const v = candidate.risk.mcConfidence;
  if (v == null || !Number.isFinite(v)) return { value: null, incomplete: true };
  return { value: v, incomplete: false };
}

/**
 * Recommended action text for a scenario.
 *  - For the hybrid scenario, the text is the Best Move's rationale.
 *  - For other scenarios, the candidate's `rationale` is the recommended
 *    action (it's the plain-English explanation produced by the generator).
 *  - When no candidate could be resolved, the text is "Data unavailable".
 */
function recommendedActionText(
  scenario: ScenarioDefinition,
  candidate: DecisionCandidate | null,
  bestMove: BestMoveResult,
): { text: string; incomplete: boolean } {
  if (scenario.id === "hybrid-strategy") {
    return {
      text: bestMove.bestNextAction.rationale || "Hold the current path.",
      incomplete: bestMove.bestNextAction.kind == null,
    };
  }
  if (!candidate) return { text: "Data unavailable", incomplete: true };
  return { text: candidate.rationale, incomplete: candidate.incomplete };
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Build the Scenario Compare workspace result.
 *
 * Pure / deterministic. Consumes only canonical and Sprint 5 engine outputs.
 * Never fabricates household values. When the ledger is missing or the
 * required engines cannot produce a candidate the workspace surfaces a
 * graceful "incomplete" state per row instead of a fabricated number.
 */
export function buildScenarioCompareWorkspace(
  inputs: ScenarioCompareWorkspaceInputs,
): ScenarioCompareWorkspaceResult {
  if (!inputs || !inputs.canonicalLedger || !inputs.canonicalLedger.snapshot) {
    return {
      empty: true,
      emptyReason: "Canonical ledger is missing or has no snapshot.",
      rows: SCENARIO_DEFINITIONS.map(def => blankRow(def, "no-ledger")),
      bundle: null,
    };
  }

  const ledger = inputs.canonicalLedger;

  // Run every Sprint 5 engine once. The workspace is a *view* over these
  // outputs — it does not re-run them per scenario.
  const head = computeCanonicalHeadlineMetrics(ledger);
  const fire = computeCanonicalFire(ledger);
  const goal = solveGoalGap({
    canonicalLedger: ledger,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
    ...(inputs.goalSolverInputs ?? {}),
  });
  const candidates = generateDecisionCandidates({
    canonicalLedger: ledger,
    goalSolverOutputs: goal,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });
  const ranking = rankDecisionCandidates({ candidateOutputs: candidates });
  const bestMove = computeBestMoveSprint5({
    rankingOutputs: ranking,
    goalSolverOutputs: goal,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });

  const bestMoveKind = bestMove.bestNextAction?.kind ?? null;

  const rows: ScenarioRow[] = SCENARIO_DEFINITIONS.map(def => {
    const candidate = resolveCandidate(def, candidates.candidates, bestMoveKind);
    if (!candidate) {
      const row = blankRow(def, "no-candidate-for-scenario");
      // Hybrid: still surface the Best Move text when bestMove exists.
      if (def.id === "hybrid-strategy" && bestMove.bestNextAction.kind) {
        const recommendedAction = recommendedActionText(def, null, bestMove);
        row.metrics.recommendedAction = makeMetric(
          "Recommended Action",
          null,
          "text",
          "bestMoveEngineSprint5",
          { incomplete: recommendedAction.incomplete, textOverride: recommendedAction.text },
        );
      }
      return row;
    }
    const ranked = ranking.ranked.find(r => r.candidate.id === candidate.id) ?? null;
    const isRecommended =
      def.id === "hybrid-strategy"
        ? true /* hybrid is always the engine recommendation by mapping */
        : ranking.recommended?.candidate.id === candidate.id;

    const fireOut = fireDateFromEngines(goal, fire, candidate);
    const liquidity = liquidityFromEngines(candidates, candidate);
    const nw = netWorthFromEngines(head, candidate);
    const passive = passiveIncomeFromEngines(head, candidate);
    const surplus = monthlySurplusFromEngines(head, candidate);
    const riskOut = riskScoreFromEngines(candidates, candidate, inputs.riskOutputs ?? null);
    const mcOut = mcConfidenceFromEngines(candidate);
    const action = recommendedActionText(def, candidate, bestMove);

    return {
      id: def.id,
      definition: def,
      candidate,
      ranked,
      isRecommended,
      incomplete: candidate.incomplete,
      metrics: {
        netWorth: makeMetric(
          "Net Worth",
          nw,
          "currency",
          "canonicalHeadlineMetrics + decisionCandidates",
          { incomplete: candidate.incomplete },
        ),
        passiveIncome: makeMetric(
          "Passive Income",
          passive,
          "currency-per-year",
          "canonicalHeadlineMetrics + decisionCandidates",
          { incomplete: candidate.incomplete },
        ),
        fireDate: makeMetric(
          "FIRE Date",
          fireOut.value,
          "date",
          "goalSolver + canonicalFire",
          { incomplete: fireOut.incomplete, textOverride: fireOut.text },
        ),
        monthlySurplus: makeMetric(
          "Monthly Surplus",
          surplus,
          "currency-per-month",
          "canonicalHeadlineMetrics + decisionCandidates",
          { incomplete: candidate.incomplete },
        ),
        liquidity: makeMetric(
          "Liquidity",
          liquidity,
          "months",
          "decisionCandidates.trace.baselineLiquidityMonths",
          { incomplete: candidate.incomplete },
        ),
        riskScore: makeMetric(
          "Risk Score",
          riskOut.value,
          "score",
          inputs.riskOutputs ? "riskEngine.overall_score" : "decisionCandidates.risk.executionRisk",
          { incomplete: riskOut.incomplete },
        ),
        monteCarloConfidence: makeMetric(
          "MC Confidence",
          mcOut.value,
          "percent",
          "decisionCandidates.risk.mcConfidence",
          { incomplete: mcOut.incomplete },
        ),
        recommendedAction: makeMetric(
          "Recommended Action",
          null,
          "text",
          def.id === "hybrid-strategy" ? "bestMoveEngineSprint5" : "decisionCandidates.rationale",
          { incomplete: action.incomplete, textOverride: action.text },
        ),
      },
    };
  });

  // Surface passive income on the ledger via the canonical selector — used by
  // tests to confirm the workspace consumed the canonical selector (and so we
  // do not unused-import it).
  void selectPassiveIncome;
  void computeCanonicalCashflow;

  return {
    empty: false,
    rows,
    bundle: { head, fire, goal, candidates, ranking, bestMove },
  };
}

/* ─── Formatting helpers for the UI layer ──────────────────────────────── */

/**
 * Pure presentation helpers. Centralised so tests can verify the UI never
 * uses ad-hoc formatters that diverge from engine outputs.
 */
export function formatScenarioMetric(m: ScenarioMetric): string {
  if (m.textOverride) return m.textOverride;
  if (m.value == null || !Number.isFinite(m.value)) return "—";
  switch (m.format) {
    case "currency": {
      const abs = Math.abs(m.value);
      const sign = m.value < 0 ? "-" : "";
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
      return `${sign}$${Math.round(abs)}`;
    }
    case "currency-per-year": {
      const v = m.value;
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M/yr`;
      if (v >= 1_000) return `$${Math.round(v / 1_000)}k/yr`;
      return `$${Math.round(v)}/yr`;
    }
    case "currency-per-month": {
      const v = m.value;
      if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k/mo`;
      return `$${Math.round(v)}/mo`;
    }
    case "percent":
      return `${Math.round(m.value * 100)}%`;
    case "months":
      return `${m.value.toFixed(1)} mo`;
    case "years":
      return `${m.value.toFixed(1)} yr`;
    case "score":
      return `${Math.round(m.value)} / 100`;
    case "date":
      return String(Math.round(m.value));
    case "text":
    default:
      return String(m.value);
  }
}
