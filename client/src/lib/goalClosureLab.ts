/**
 * goalClosureLab.ts — Sprint 6 Phase 4, Goal Closure Lab orchestration.
 *
 * Pure orchestration layer over existing canonical and Sprint 5 engines.
 * This module DOES NOT introduce any new financial formula, household
 * value, growth/SWR/yield assumption, or page-specific calculation.
 *
 * It assembles the Goal Closure Lab display contract by mapping the
 * outputs of:
 *
 *   - canonical headline metrics (Sprint 4D)
 *   - canonical FIRE facade (Sprint 4D)
 *   - canonical cashflow facade (Sprint 4D)
 *   - canonical risk surface / risk engine (Sprint 3)
 *   - Monte Carlo result (canonical MC)
 *   - goal solver (Sprint 5 Phase 1)
 *   - decision candidate generator (Sprint 5 Phase 2)
 *   - decision ranking (Sprint 5 Phase 2)
 *   - best move engine (Sprint 5 Phase 3)
 *   - CFO advisor (Sprint 5 Phase 4)
 *
 * Every numeric field on the contract is sourced from one of those
 * engines. When a supporting engine output is missing the field is
 * surfaced as `value: null, incomplete: true` rather than fabricated.
 *
 * Strategic Ideas are a separate, intentionally numeric-free surface —
 * each item carries the literal `notEngineModelled: true` flag and the
 * UI is required to render the "Not engine-modelled" label.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  type CanonicalHeadlineMetrics,
} from "./canonicalHeadlineMetrics";
import { computeCanonicalFire, type CanonicalFire } from "./canonicalFire";
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
import {
  generateCFOInsights,
  type CFOAdvisorResult,
} from "./cfoAdvisor";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";
import { formatConfidence, type ConfidenceKind } from "./confidenceLabels";

/* ─── Display contract primitives ──────────────────────────────────────── */

/**
 * A single labelled metric, paired with its source engine for the audit
 * trail. `value: null` plus `incomplete: true` is the canonical "missing
 * data" affordance — the UI renders it as "—" rather than fabricating a
 * number. `textOverride` lets the orchestration layer pass through pre-
 * formatted strings (e.g. status labels, FIRE dates) without the UI
 * having to format them.
 */
export interface ClosureMetric {
  label: string;
  value: number | null;
  format:
    | "currency"
    | "currency-per-year"
    | "currency-per-month"
    | "percent"
    | "band"
    | "score"
    | "years"
    | "months"
    | "date"
    | "text";
  textOverride?: string | null;
  /** Source engine identifier (audit trail). */
  source: string;
  /** True when the supporting engine output is missing or flagged incomplete. */
  incomplete: boolean;
}

function makeMetric(
  label: string,
  value: number | null,
  format: ClosureMetric["format"],
  source: string,
  opts: { incomplete?: boolean; textOverride?: string | null } = {},
): ClosureMetric {
  return {
    label,
    value,
    format,
    textOverride: opts.textOverride ?? null,
    source,
    incomplete: Boolean(opts.incomplete),
  };
}

/* ─── Section 1 — Goal Status ──────────────────────────────────────────── */

export type ClosureStatus =
  | "ON_TRACK"
  | "STRETCH"
  | "UNREALISTIC"
  | "IMPOSSIBLE"
  | "UNKNOWN";

export interface GoalStatusSection {
  target: ClosureMetric;
  currentProjection: ClosureMetric;
  gap: ClosureMetric;
  yearsAheadBehind: ClosureMetric;
  confidence: ClosureMetric;
  status: ClosureStatus;
  statusLabel: string;
  /** Plain-English summary of *why* the household lands on this status. */
  summary: string;
  incomplete: boolean;
}

/* ─── Section 2 — Gap Analysis ─────────────────────────────────────────── */

export interface GapAnalysisSection {
  passiveIncomeGap: ClosureMetric;
  netWorthGap: ClosureMetric;
  assetBaseGap: ClosureMetric;
  monthlyContributionGap: ClosureMetric;
  liquidityConstraint: ClosureMetric;
  debtConstraint: ClosureMetric;
  riskConstraint: ClosureMetric;
  /** Plain-English summary explaining which constraint is binding. */
  bindingConstraint: string;
  incomplete: boolean;
}

/* ─── Section 3 — Path Comparison ──────────────────────────────────────── */

/**
 * The seven required path identifiers. Each path is a *label* over an
 * existing decision candidate (or composition of candidates); the
 * orchestration layer never invents new financial outcomes for a path.
 */
export type ClosurePathId =
  | "current-plan"
  | "etf-increase"
  | "earlier-property"
  | "additional-property"
  | "hybrid-property-etf"
  | "debt-reduction"
  | "delayed-fire";

export interface ClosurePathDefinition {
  id: ClosurePathId;
  label: string;
  description: string;
  /** The Sprint 5 candidate kind this path resolves to. `null` means the
   *  path is composed (e.g. hybrid) or carries no direct engine candidate
   *  (e.g. delayed-fire is a goal-target shift, not a candidate). */
  candidateKind: CandidateKind | null;
}

export const CLOSURE_PATH_DEFINITIONS: ClosurePathDefinition[] = [
  {
    id: "current-plan",
    label: "Current Plan",
    description: "Hold the current path — no new structural change.",
    candidateKind: "hold-current-path",
  },
  {
    id: "etf-increase",
    label: "ETF Increase",
    description: "Direct monthly surplus into ETF / share contributions.",
    candidateKind: "etf-investment",
  },
  {
    id: "earlier-property",
    label: "Earlier Property",
    description: "Bring forward the next investment property purchase.",
    candidateKind: "buy-investment-property",
  },
  {
    id: "additional-property",
    label: "Additional Property",
    description: "Add another investment property on top of the current plan.",
    candidateKind: "buy-investment-property",
  },
  {
    id: "hybrid-property-etf",
    label: "Hybrid Property + ETF",
    description:
      "Engine's recommended Best Move — blended cashflow, growth, risk and liquidity.",
    candidateKind: null,
  },
  {
    id: "debt-reduction",
    label: "Debt Reduction",
    description: "Channel surplus into accelerated debt / offset repayment.",
    candidateKind: "debt-reduction",
  },
  {
    id: "delayed-fire",
    label: "Delayed FIRE",
    description:
      "Shift the FIRE target date later so the existing plan becomes feasible.",
    candidateKind: "delay-purchase",
  },
];

export interface ClosurePathRow {
  id: ClosurePathId;
  definition: ClosurePathDefinition;
  /** Underlying candidate the path was mapped to (when one was produced). */
  candidate: DecisionCandidate | null;
  /** Ranked row for that candidate (when present). */
  ranked: RankedCandidate | null;
  /** True when this path is the engine's recommended Best Move. */
  isRecommended: boolean;
  /** True when the underlying engine output is unavailable for this path —
   *  the row still renders so the UI can show "Not engine-modelled yet". */
  incomplete: boolean;
  metrics: {
    fireAge:             ClosureMetric;
    netWorth:            ClosureMetric;
    passiveIncome:       ClosureMetric;
    monthlySurplus:      ClosureMetric;
    liquidityImpact:     ClosureMetric;
    riskScore:           ClosureMetric;
    monteCarloProbability: ClosureMetric;
    confidence:          ClosureMetric;
  };
}

/* ─── Section 4 — Best Path ────────────────────────────────────────────── */

export interface BestPathSection {
  recommendedPathId: ClosurePathId | null;
  recommendedLabel: string;
  whyItWins: string;
  expectedImpact: ClosureMetric[];
  risks: string[];
  confidence: ClosureMetric;
  incomplete: boolean;
}

/* ─── Section 5 — Action Plan ──────────────────────────────────────────── */

export type ActionHorizon =
  | "this-month"
  | "next-3-months"
  | "next-12-months"
  | "major-milestone";

export interface ClosureAction {
  id: string;
  horizon: ActionHorizon;
  /** Plain-English action text. No numbers fabricated — references existing
   *  engine outputs textually rather than inserting new figures. */
  text: string;
  /** Engine the action was derived from (audit trail). */
  source: string;
}

export interface ActionPlanSection {
  thisMonth: ClosureAction[];
  next3Months: ClosureAction[];
  next12Months: ClosureAction[];
  majorMilestones: ClosureAction[];
  incomplete: boolean;
}

/* ─── Section 6 — Audit Trail ──────────────────────────────────────────── */

export interface AuditEntry {
  /** Stable id so the UI can key collapsibles. */
  id: string;
  label: string;
  /** Engines consulted to produce this entry. */
  enginesUsed: string[];
  /** Inputs that fed those engines (names only; no value fabrication). */
  inputsUsed: string[];
  /** Assumption identifiers (e.g. "canonical SWR", "canonical growth"). */
  assumptions: string[];
  /** Source of the confidence value attached to this recommendation. */
  confidenceSource: string;
  /** Source of the risk score attached to this recommendation. */
  riskSource: string;
  /** Source of the Monte Carlo probability attached to this recommendation. */
  monteCarloSource: string;
  /** Plain-English "how was this calculated?" expansion. */
  howCalculated: string;
  incomplete: boolean;
}

export interface AuditTrailSection {
  entries: AuditEntry[];
  incomplete: boolean;
}

/* ─── Section 7 — Strategic Ideas ──────────────────────────────────────── */

/**
 * Strategic ideas are intentionally numeric-free. They describe options
 * the engine layer does not currently model, so the UI renders them as
 * narrative cards with a literal "Not engine-modelled" label.
 *
 * The shape carries `notEngineModelled: true` so tests can assert the
 * invariant rigidly: no numeric value field, no monetary string in `body`.
 */
export interface StrategicIdea {
  id: string;
  title: string;
  body: string;
  /** Always true. Tests pin this so the field cannot drift. */
  notEngineModelled: true;
}

export interface StrategicIdeasSection {
  ideas: StrategicIdea[];
}

const STRATEGIC_IDEAS_CATALOGUE: StrategicIdea[] = [
  {
    id: "debt-recycle",
    title: "Debt recycling",
    body:
      "Convert non-deductible home-loan debt into deductible investment debt as principal is repaid. Requires a structured borrowing strategy and tax review.",
    notEngineModelled: true,
  },
  {
    id: "refinance",
    title: "Refinance to a better rate or product",
    body:
      "Move the mortgage to a sharper rate, a split product, or a lender with better offset rules. Requires lender comparison and conveyancing.",
    notEngineModelled: true,
  },
  {
    id: "increase-income",
    title: "Increase household income",
    body:
      "Negotiate, change roles, add a side income stream, or restructure entitlements. Improves every other lever in the plan.",
    notEngineModelled: true,
  },
  {
    id: "higher-yield-property",
    title: "Higher-yield property strategy",
    body:
      "Target sub-markets with stronger gross yield or cashflow positive structures. Requires research and acquisition discipline.",
    notEngineModelled: true,
  },
  {
    id: "reduce-expenses",
    title: "Reduce household expenses",
    body:
      "Audit recurring spending, subscriptions, insurance, utilities. Lifts surplus, which every Sprint 5 engine consumes.",
    notEngineModelled: true,
  },
  {
    id: "asset-rotation",
    title: "Asset rotation",
    body:
      "Rebalance between under-performing and higher-conviction assets without changing the structural shape of the portfolio.",
    notEngineModelled: true,
  },
];

/* ─── Inputs / Result ──────────────────────────────────────────────────── */

export interface GoalClosureLabInputs {
  canonicalLedger: DashboardInputs | null | undefined;
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
}

export interface GoalClosureLabResult {
  /** True when the canonical ledger is missing — every section renders empty. */
  empty: boolean;
  emptyReason?: string;
  goalStatus: GoalStatusSection;
  gapAnalysis: GapAnalysisSection;
  pathComparison: ClosurePathRow[];
  bestPath: BestPathSection;
  actionPlan: ActionPlanSection;
  auditTrail: AuditTrailSection;
  strategicIdeas: StrategicIdeasSection;
  /** Engine bundle the sections were built from (audit / tests). */
  bundle: {
    head: CanonicalHeadlineMetrics;
    fire: CanonicalFire;
    goal: GoalSolverOutputs;
    candidates: CandidateGeneratorOutputs;
    ranking: RankingOutput;
    bestMove: BestMoveResult;
    cfo: CFOAdvisorResult;
  } | null;
}

/* ─── Empty-state factories ────────────────────────────────────────────── */

function emptyMetric(label: string, format: ClosureMetric["format"]): ClosureMetric {
  return makeMetric(label, null, format, "no-ledger", {
    incomplete: true,
    textOverride: "—",
  });
}

function emptyResult(reason: string): GoalClosureLabResult {
  return {
    empty: true,
    emptyReason: reason,
    goalStatus: {
      target: emptyMetric("Target Net Worth", "currency"),
      currentProjection: emptyMetric("Current Projection", "currency"),
      gap: emptyMetric("Gap", "currency"),
      yearsAheadBehind: emptyMetric("Years Ahead/Behind", "years"),
      confidence: emptyMetric("Confidence", "percent"),
      status: "UNKNOWN",
      statusLabel: "Awaiting data",
      summary: "Canonical ledger is missing. Connect your data to run the closure analysis.",
      incomplete: true,
    },
    gapAnalysis: {
      passiveIncomeGap: emptyMetric("Passive Income Gap", "currency-per-year"),
      netWorthGap: emptyMetric("Net Worth Gap", "currency"),
      assetBaseGap: emptyMetric("Asset Base Gap", "currency"),
      monthlyContributionGap: emptyMetric("Monthly Contribution Gap", "currency-per-month"),
      liquidityConstraint: emptyMetric("Liquidity Constraint", "months"),
      debtConstraint: emptyMetric("Debt Constraint", "percent"),
      riskConstraint: emptyMetric("Risk Constraint", "score"),
      bindingConstraint: "No ledger available — constraint analysis unavailable.",
      incomplete: true,
    },
    pathComparison: CLOSURE_PATH_DEFINITIONS.map(def => blankPathRow(def, "no-ledger")),
    bestPath: {
      recommendedPathId: null,
      recommendedLabel: "Awaiting data",
      whyItWins: "Run the engines once a ledger is loaded.",
      expectedImpact: [],
      risks: [],
      confidence: emptyMetric("Confidence", "percent"),
      incomplete: true,
    },
    actionPlan: {
      thisMonth: [],
      next3Months: [],
      next12Months: [],
      majorMilestones: [],
      incomplete: true,
    },
    auditTrail: { entries: [], incomplete: true },
    strategicIdeas: { ideas: STRATEGIC_IDEAS_CATALOGUE },
    bundle: null,
  };
}

function blankPathRow(def: ClosurePathDefinition, reason: string): ClosurePathRow {
  const m = (label: string, fmt: ClosureMetric["format"]): ClosureMetric =>
    makeMetric(label, null, fmt, reason, { incomplete: true, textOverride: "—" });
  return {
    id: def.id,
    definition: def,
    candidate: null,
    ranked: null,
    isRecommended: false,
    incomplete: true,
    metrics: {
      fireAge: m("FIRE Age", "years"),
      netWorth: m("Net Worth", "currency"),
      passiveIncome: m("Passive Income", "currency-per-year"),
      monthlySurplus: m("Monthly Surplus", "currency-per-month"),
      liquidityImpact: m("Liquidity Impact", "months"),
      riskScore: m("Risk Score", "score"),
      monteCarloProbability: m("Monte Carlo", "percent"),
      confidence: m("Confidence", "percent"),
    },
  };
}

/* ─── Engine wiring helpers (pass-through only) ────────────────────────── */

function pickCandidate(
  def: ClosurePathDefinition,
  candidates: DecisionCandidate[],
  bestMoveKind: CandidateKind | null,
  alreadyUsedCandidateIds: Set<string>,
): DecisionCandidate | null {
  if (def.id === "hybrid-property-etf") {
    if (bestMoveKind == null) return null;
    return candidates.find(c => c.kind === bestMoveKind) ?? null;
  }
  if (def.candidateKind == null) return null;
  // "additional-property" reuses the buy-investment-property candidate but
  // we mark it incomplete because the engine does not currently produce a
  // distinct "second investment property" candidate. Reusing the candidate
  // surfaces the engine's projection for any buy; the row's `incomplete`
  // flag tells the UI to render it as a not-yet-modelled variant.
  if (def.id === "additional-property") {
    const c = candidates.find(c => c.kind === "buy-investment-property");
    if (c) {
      // Tag this row as incomplete via the caller, regardless of candidate.
      return c;
    }
    return null;
  }
  // For everything else: first matching candidate by kind, but avoid
  // double-binding a single candidate to two paths.
  for (const c of candidates) {
    if (c.kind === def.candidateKind && !alreadyUsedCandidateIds.has(c.id)) {
      return c;
    }
  }
  return candidates.find(c => c.kind === def.candidateKind) ?? null;
}

function fireAgeFromEngines(
  goal: GoalSolverOutputs,
  candidate: DecisionCandidate | null,
): { value: number | null; text: string; incomplete: boolean } {
  // Pass-through of goal solver's projected achievement year. No new
  // arithmetic — we surface the engine's year directly, and for non-baseline
  // candidates we apply the same nudge that scenarioCompareWorkspace uses
  // (deltaFireProgress * yearsToTarget rounded).
  const year = goal.trace.projectedAchievementYear;
  if (year == null || !Number.isFinite(year)) {
    return { value: null, text: "Not projected", incomplete: true };
  }
  if (!candidate || candidate.kind === "hold-current-path") {
    return { value: year, text: String(year), incomplete: goal.trace.incomplete };
  }
  const yearsToTarget = goal.trace.yearsToTarget;
  const deltaFire = candidate.projection.deltaFireProgress;
  if (yearsToTarget != null && Number.isFinite(yearsToTarget) && deltaFire !== 0) {
    const adj = Math.round(year - deltaFire * yearsToTarget);
    return {
      value: adj,
      text: String(adj),
      incomplete: goal.trace.incomplete || candidate.incomplete,
    };
  }
  return { value: year, text: String(year), incomplete: goal.trace.incomplete || candidate.incomplete };
}

function netWorthForPath(
  head: CanonicalHeadlineMetrics,
  candidate: DecisionCandidate | null,
): number | null {
  if (!Number.isFinite(head.netWorth)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return head.netWorth;
  return head.netWorth + (candidate.projection.deltaNetWorth || 0);
}

function passiveIncomeForPath(
  head: CanonicalHeadlineMetrics,
  candidate: DecisionCandidate | null,
): number | null {
  if (!Number.isFinite(head.passiveIncome)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return head.passiveIncome;
  return Math.max(0, head.passiveIncome + (candidate.projection.deltaPassiveIncome || 0));
}

function monthlySurplusForPath(
  head: CanonicalHeadlineMetrics,
  candidate: DecisionCandidate | null,
): number | null {
  if (!Number.isFinite(head.monthlySurplus)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return head.monthlySurplus;
  return head.monthlySurplus + (candidate.projection.deltaMonthlySurplus || 0);
}

function liquidityImpactForPath(
  cands: CandidateGeneratorOutputs,
  candidate: DecisionCandidate | null,
): number | null {
  const baseline = cands.trace.baselineLiquidityMonths;
  if (!Number.isFinite(baseline)) return null;
  if (!candidate || candidate.kind === "hold-current-path") return baseline;
  const delta = candidate.projection.deltaLiquidityMonths;
  if (!Number.isFinite(delta)) return baseline;
  return Math.max(0, baseline + delta);
}

function riskScoreForPath(
  candidate: DecisionCandidate | null,
  risk: RiskRadarResult | null | undefined,
  cands: CandidateGeneratorOutputs,
): { value: number | null; incomplete: boolean; source: string } {
  if (risk && Number.isFinite(risk.overall_score)) {
    if (!candidate || candidate.kind === "hold-current-path") {
      return {
        value: Math.round(risk.overall_score),
        incomplete: false,
        source: "riskEngine.overall_score",
      };
    }
    const holdCandidate = cands.candidates.find(c => c.kind === "hold-current-path");
    const holdExec = holdCandidate?.risk.executionRisk ?? 0;
    const candExec = candidate.risk.executionRisk;
    const adj = Math.max(0, Math.min(100, risk.overall_score - (candExec - holdExec)));
    return {
      value: Math.round(adj),
      incomplete: candidate.incomplete,
      source: "riskEngine.overall_score + decisionCandidates.risk",
    };
  }
  if (candidate) {
    return {
      value: Math.max(0, 100 - Math.round(candidate.risk.executionRisk)),
      incomplete: true,
      source: "decisionCandidates.risk.executionRisk",
    };
  }
  return { value: null, incomplete: true, source: "no-risk-engine" };
}

function mcProbabilityForPath(
  candidate: DecisionCandidate | null,
  mc: MonteCarloResult | null | undefined,
): { value: number | null; incomplete: boolean; source: string } {
  if (candidate) {
    const v = candidate.risk.mcConfidence;
    if (v != null && Number.isFinite(v)) {
      return {
        value: v,
        incomplete: false,
        source: "decisionCandidates.risk.mcConfidence",
      };
    }
  }
  if (mc && typeof (mc as any).prob_ff === "number") {
    return {
      value: (mc as any).prob_ff / 100,
      incomplete: false,
      source: "monteCarloEngine.prob_ff",
    };
  }
  return { value: null, incomplete: true, source: "no-mc-output" };
}

function confidenceForPath(
  candidate: DecisionCandidate | null,
  bestMove: BestMoveResult,
): { value: number | null; incomplete: boolean; source: string } {
  if (candidate && bestMove.bestNextAction.id && candidate.id === bestMove.bestNextAction.id) {
    return {
      value: bestMove.confidenceScore.value,
      incomplete: false,
      source: "bestMoveEngineSprint5.confidenceScore",
    };
  }
  // Fall back to a normalised expression of the candidate's MC confidence.
  if (candidate && candidate.risk.mcConfidence != null) {
    return {
      value: candidate.risk.mcConfidence,
      incomplete: false,
      source: "decisionCandidates.risk.mcConfidence",
    };
  }
  return { value: null, incomplete: true, source: "no-confidence-source" };
}

/* ─── Section builders ─────────────────────────────────────────────────── */

function buildGoalStatus(
  head: CanonicalHeadlineMetrics,
  fire: CanonicalFire,
  goal: GoalSolverOutputs,
  bestMove: BestMoveResult,
): GoalStatusSection {
  const target = fire.fireNumber > 0
    ? makeMetric("Target Net Worth", fire.fireNumber, "currency", "canonicalFire.fireNumber")
    : makeMetric("Target Net Worth", null, "currency", "canonicalFire.fireNumber", {
        incomplete: true,
        textOverride: "Set a FIRE target",
      });

  const projection = Number.isFinite(head.netWorth)
    ? makeMetric("Current Projection", head.netWorth, "currency", "canonicalHeadlineMetrics.netWorth")
    : makeMetric("Current Projection", null, "currency", "canonicalHeadlineMetrics.netWorth", {
        incomplete: true,
      });

  const gapVal = fire.gap;
  const gap = Number.isFinite(gapVal)
    ? makeMetric("Gap", gapVal, "currency", "canonicalFire.gap")
    : makeMetric("Gap", null, "currency", "canonicalFire.gap", { incomplete: true });

  const years = goal.yearsAheadOrBehind;
  const yearsAheadBehind = years == null
    ? makeMetric("Years Ahead/Behind", null, "years", "goalSolver.yearsAheadOrBehind", {
        incomplete: true,
        textOverride: "Not projected",
      })
    : makeMetric(
        "Years Ahead/Behind",
        years,
        "years",
        "goalSolver.yearsAheadOrBehind",
        { textOverride: years >= 0 ? `${years.toFixed(1)} ahead` : `${Math.abs(years).toFixed(1)} behind` },
      );

  const confidenceVal = bestMove.confidenceScore?.value ?? null;
  /* Sprint 15 Phase 3 — confidence cells are banded via the `band` format token
     because the underlying value is a Sprint 5 heuristic blend, not a raw MC
     probability. The display layer routes value=null → "Monte Carlo not yet
     run", value present → "HIGH/MEDIUM/LOW" per unified thresholds. */
  const confidence = confidenceVal == null
    ? makeMetric("Confidence", null, "band", "bestMoveEngineSprint5.confidenceScore", {
        incomplete: true,
      })
    : makeMetric("Confidence", confidenceVal, "band", "bestMoveEngineSprint5.confidenceScore");

  const status: ClosureStatus = goal.fireFeasibility ?? "UNKNOWN";
  const statusLabel = (() => {
    switch (status) {
      case "ON_TRACK":     return "On track";
      case "STRETCH":      return "Stretch";
      case "UNREALISTIC":  return "Unrealistic";
      case "IMPOSSIBLE":   return "Impossible without change";
      default:             return "Awaiting data";
    }
  })();

  const summary = goal.trace.reasoning && goal.trace.reasoning.length
    ? goal.trace.reasoning
    : "Engine derived the feasibility verdict from the canonical FIRE target, current projection, and surplus.";

  const incomplete =
    !Number.isFinite(head.netWorth)
    || !Number.isFinite(fire.gap)
    || goal.trace.incomplete;

  return {
    target,
    currentProjection: projection,
    gap,
    yearsAheadBehind,
    confidence,
    status,
    statusLabel,
    summary,
    incomplete,
  };
}

function buildGapAnalysis(
  head: CanonicalHeadlineMetrics,
  fire: CanonicalFire,
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
  risk: RiskRadarResult | null | undefined,
): GapAnalysisSection {
  const passiveIncomeGap = goal.requiredPassiveIncomeGap > 0
    ? makeMetric(
        "Passive Income Gap",
        goal.requiredPassiveIncomeGap,
        "currency-per-year",
        "goalSolver.requiredPassiveIncomeGap",
      )
    : makeMetric(
        "Passive Income Gap",
        0,
        "currency-per-year",
        "goalSolver.requiredPassiveIncomeGap",
        { textOverride: "On target" },
      );

  const netWorthGap = Number.isFinite(fire.gap)
    ? makeMetric("Net Worth Gap", fire.gap, "currency", "canonicalFire.gap")
    : makeMetric("Net Worth Gap", null, "currency", "canonicalFire.gap", { incomplete: true });

  const assetBaseGap = Number.isFinite(goal.requiredAssetBase)
    ? makeMetric(
        "Asset Base Gap",
        Math.max(0, goal.requiredAssetBase - goal.trace.currentInvestibleBase),
        "currency",
        "goalSolver.requiredAssetBase − goalSolver.trace.currentInvestibleBase",
      )
    : makeMetric("Asset Base Gap", null, "currency", "goalSolver.requiredAssetBase", {
        incomplete: true,
      });

  const monthlyContributionGap = Number.isFinite(goal.requiredMonthlyContribution)
    ? makeMetric(
        "Monthly Contribution Gap",
        Math.max(0, goal.requiredMonthlyContribution - goal.trace.monthlySurplusAvailable),
        "currency-per-month",
        "goalSolver.requiredMonthlyContribution − goalSolver.trace.monthlySurplusAvailable",
      )
    : makeMetric(
        "Monthly Contribution Gap",
        null,
        "currency-per-month",
        "goalSolver.requiredMonthlyContribution",
        { incomplete: true },
      );

  const baselineLiquidity = cands.trace.baselineLiquidityMonths;
  const liquidityConstraint = Number.isFinite(baselineLiquidity)
    ? makeMetric(
        "Liquidity Constraint",
        baselineLiquidity,
        "months",
        "decisionCandidates.trace.baselineLiquidityMonths",
      )
    : makeMetric("Liquidity Constraint", null, "months", "decisionCandidates", {
        incomplete: true,
      });

  // Debt constraint: DSR (monthly debt service / monthly income).
  // Both numerator and denominator are canonical pass-throughs.
  const monthlyDebtService = goal.trace.monthlyDebtService;
  const grossMonthlyIncome = Number.isFinite(head.monthlyIncome) ? head.monthlyIncome : null;
  const dsr =
    grossMonthlyIncome && grossMonthlyIncome > 0 && Number.isFinite(monthlyDebtService)
      ? monthlyDebtService / grossMonthlyIncome
      : null;
  const debtConstraint = dsr == null
    ? makeMetric(
        "Debt Constraint",
        null,
        "percent",
        "goalSolver.trace.monthlyDebtService / canonicalHeadlineMetrics",
        { incomplete: true },
      )
    : makeMetric(
        "Debt Constraint",
        dsr,
        "percent",
        "goalSolver.trace.monthlyDebtService / canonicalHeadlineMetrics",
      );

  const riskConstraint = risk && Number.isFinite(risk.overall_score)
    ? makeMetric("Risk Constraint", risk.overall_score, "score", "riskEngine.overall_score")
    : makeMetric("Risk Constraint", null, "score", "riskEngine", { incomplete: true });

  // Choose the binding constraint by inspecting goal solver feasibility +
  // candidate trace. Pure narrative.
  const binding = (() => {
    if (goal.fireFeasibility === "IMPOSSIBLE") return "Plan is structurally infeasible — see goal solver reasoning.";
    if (goal.fireFeasibility === "UNREALISTIC") return "Required monthly contribution exceeds available surplus by a large margin.";
    if (goal.requiredMonthlyContribution > goal.trace.monthlySurplusAvailable) {
      return "Monthly contribution required to close the gap exceeds available surplus.";
    }
    if (Number.isFinite(baselineLiquidity) && baselineLiquidity < 3) {
      return "Liquidity runway is fragile (<3 months) — any leveraged move adds risk.";
    }
    if (dsr != null && dsr > 0.4) {
      return "Debt-service ratio is high — additional debt is constrained.";
    }
    if (risk && Number.isFinite(risk.overall_score) && risk.overall_score < 40) {
      return "Overall household risk score is fragile — capacity for more risk is limited.";
    }
    return "No single binding constraint — the plan is fundable from existing surplus.";
  })();

  const incomplete =
    goal.trace.incomplete
    || !Number.isFinite(head.netWorth)
    || !Number.isFinite(cands.trace.baselineLiquidityMonths);

  return {
    passiveIncomeGap,
    netWorthGap,
    assetBaseGap,
    monthlyContributionGap,
    liquidityConstraint,
    debtConstraint,
    riskConstraint,
    bindingConstraint: binding,
    incomplete,
  };
}

function buildPathComparison(
  head: CanonicalHeadlineMetrics,
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
  ranking: RankingOutput,
  bestMove: BestMoveResult,
  risk: RiskRadarResult | null | undefined,
  mc: MonteCarloResult | null | undefined,
): ClosurePathRow[] {
  const bestKind = bestMove.bestNextAction?.kind ?? null;
  const used = new Set<string>();
  return CLOSURE_PATH_DEFINITIONS.map(def => {
    const candidate = pickCandidate(def, cands.candidates, bestKind, used);
    if (!candidate) {
      const row = blankPathRow(def, "no-candidate-for-path");
      if (def.id === "hybrid-property-etf" && bestMove.bestNextAction.kind) {
        // Hybrid: we still know the engine's recommendation exists even if
        // the candidate object isn't directly attachable.
        row.metrics.confidence = makeMetric(
          "Confidence",
          bestMove.confidenceScore.value,
          "band",
          "bestMoveEngineSprint5.confidenceScore",
        );
        row.isRecommended = true;
      }
      return row;
    }
    used.add(candidate.id);
    const ranked = ranking.ranked.find(r => r.candidate.id === candidate.id) ?? null;
    const isRecommended =
      def.id === "hybrid-property-etf"
        ? true
        : ranking.recommended?.candidate.id === candidate.id;

    const fireOut = fireAgeFromEngines(goal, candidate);
    const nw = netWorthForPath(head, candidate);
    const passive = passiveIncomeForPath(head, candidate);
    const surplus = monthlySurplusForPath(head, candidate);
    const liquidity = liquidityImpactForPath(cands, candidate);
    const riskOut = riskScoreForPath(candidate, risk, cands);
    const mcOut = mcProbabilityForPath(candidate, mc);
    const conf = confidenceForPath(candidate, bestMove);

    // `additional-property` reuses the buy-IP candidate but is flagged as
    // not-yet-modelled separately — the engine doesn't differentiate a
    // first vs second IP. Mark the row incomplete to signal that.
    const additionalPropertyIncomplete = def.id === "additional-property";

    return {
      id: def.id,
      definition: def,
      candidate,
      ranked,
      isRecommended,
      incomplete: candidate.incomplete || additionalPropertyIncomplete,
      metrics: {
        fireAge: makeMetric(
          "FIRE Age",
          fireOut.value,
          "years",
          "goalSolver.trace.projectedAchievementYear + decisionCandidates",
          { incomplete: fireOut.incomplete, textOverride: fireOut.text },
        ),
        netWorth: makeMetric(
          "Net Worth",
          nw,
          "currency",
          "canonicalHeadlineMetrics + decisionCandidates",
          { incomplete: candidate.incomplete || additionalPropertyIncomplete },
        ),
        passiveIncome: makeMetric(
          "Passive Income",
          passive,
          "currency-per-year",
          "canonicalHeadlineMetrics + decisionCandidates",
          { incomplete: candidate.incomplete || additionalPropertyIncomplete },
        ),
        monthlySurplus: makeMetric(
          "Monthly Surplus",
          surplus,
          "currency-per-month",
          "canonicalHeadlineMetrics + decisionCandidates",
          { incomplete: candidate.incomplete || additionalPropertyIncomplete },
        ),
        liquidityImpact: makeMetric(
          "Liquidity Impact",
          liquidity,
          "months",
          "decisionCandidates.trace.baselineLiquidityMonths + projection.deltaLiquidityMonths",
          { incomplete: candidate.incomplete || additionalPropertyIncomplete },
        ),
        riskScore: makeMetric(
          "Risk Score",
          riskOut.value,
          "score",
          riskOut.source,
          { incomplete: riskOut.incomplete || additionalPropertyIncomplete },
        ),
        monteCarloProbability: makeMetric(
          "Monte Carlo",
          mcOut.value,
          /* Sprint 15 Phase 3 — percent is meaningful only for real MC
             (monteCarloEngine.prob_ff). Otherwise the value is the Sprint5
             heuristic mcConfidence that needs banding. */
          mcOut.source === "monteCarloEngine.prob_ff" ? "percent" : "band",
          mcOut.source,
          { incomplete: mcOut.incomplete || additionalPropertyIncomplete },
        ),
        confidence: makeMetric(
          "Confidence",
          conf.value,
          "band",
          conf.source,
          { incomplete: conf.incomplete || additionalPropertyIncomplete },
        ),
      },
    };
  });
}

function buildBestPath(
  bestMove: BestMoveResult,
  pathRows: ClosurePathRow[],
): BestPathSection {
  const recommendedRow = pathRows.find(r => r.isRecommended) ?? null;
  const recommendedPathId = recommendedRow?.id ?? null;
  const recommendedLabel = recommendedRow
    ? recommendedRow.definition.label
    : bestMove.bestNextAction.label || "Awaiting data";

  const expectedImpact: ClosureMetric[] = [
    makeMetric(
      "Δ Net Worth",
      bestMove.expectedImpact.deltaNetWorth,
      "currency",
      "bestMoveEngineSprint5.expectedImpact.deltaNetWorth",
    ),
    makeMetric(
      "Δ Passive Income",
      bestMove.expectedImpact.deltaPassiveIncome,
      "currency-per-year",
      "bestMoveEngineSprint5.expectedImpact.deltaPassiveIncome",
    ),
    makeMetric(
      "Δ Monthly Surplus",
      bestMove.expectedImpact.deltaMonthlySurplus,
      "currency-per-month",
      "bestMoveEngineSprint5.expectedImpact.deltaMonthlySurplus",
    ),
    makeMetric(
      "Δ FIRE Progress",
      bestMove.expectedImpact.deltaFireProgress,
      "percent",
      "bestMoveEngineSprint5.expectedImpact.deltaFireProgress",
    ),
  ];

  const risks: string[] = [];
  if (bestMove.riskImpact.deltaExecutionRiskVsHold > 0) {
    risks.push(
      `Execution risk increases by ${bestMove.riskImpact.deltaExecutionRiskVsHold.toFixed(0)} pts vs holding the current path.`,
    );
  }
  if (bestMove.riskImpact.deltaLiquidityRiskVsHold > 0) {
    risks.push(
      `Liquidity risk increases by ${bestMove.riskImpact.deltaLiquidityRiskVsHold.toFixed(0)} pts vs holding the current path.`,
    );
  }
  if (bestMove.liquidityImpact.postMoveRunwayMonths < 3) {
    risks.push(
      `Post-move cash runway dips to ${bestMove.liquidityImpact.postMoveRunwayMonths.toFixed(1)} months — buffer is fragile.`,
    );
  }
  if (risks.length === 0) {
    risks.push("No incremental execution, liquidity or runway risk surfaced by the engine.");
  }

  const confidence = makeMetric(
    "Confidence",
    bestMove.confidenceScore.value,
    "band",
    "bestMoveEngineSprint5.confidenceScore",
  );

  const whyItWins = bestMove.whyThisBeatsAlternatives.narrative
    || "Best Move engine selected this path as the highest composite score across cashflow, growth, risk and liquidity.";

  return {
    recommendedPathId,
    recommendedLabel,
    whyItWins,
    expectedImpact,
    risks,
    confidence,
    incomplete: bestMove.trace.incomplete,
  };
}

function buildActionPlan(
  bestMove: BestMoveResult,
  cfo: CFOAdvisorResult,
): ActionPlanSection {
  const thisMonth: ClosureAction[] = [];
  const next3Months: ClosureAction[] = [];
  const next12Months: ClosureAction[] = [];
  const majorMilestones: ClosureAction[] = [];

  // 1. Immediate translation of Best Move's recommended action.
  if (bestMove.bestNextAction.id) {
    thisMonth.push({
      id: `bm-${bestMove.bestNextAction.id}`,
      horizon: "this-month",
      text: bestMove.bestNextAction.isHoldBaseline
        ? "Hold the current path — engine confirmed the do-nothing baseline is the optimal next move."
        : `Begin executing: ${bestMove.bestNextAction.label}. ${bestMove.bestNextAction.rationale}`,
      source: "bestMoveEngineSprint5.bestNextAction",
    });
  }

  // 2. Next-3-months actions from CFO recommendedNextActions.
  for (const insight of cfo.recommendedNextActions) {
    next3Months.push({
      id: `cfo-${insight.id}`,
      horizon: "next-3-months",
      text: insight.headline + (insight.body ? ` — ${insight.body}` : ""),
      source: "cfoAdvisor.recommendedNextActions",
    });
  }

  // 3. Next-12-months actions from CFO opportunities/bottlenecks.
  for (const insight of cfo.opportunities.slice(0, 3)) {
    next12Months.push({
      id: `cfo-op-${insight.id}`,
      horizon: "next-12-months",
      text: insight.headline + (insight.body ? ` — ${insight.body}` : ""),
      source: "cfoAdvisor.opportunities",
    });
  }
  for (const insight of cfo.bottlenecks.slice(0, 2)) {
    next12Months.push({
      id: `cfo-bn-${insight.id}`,
      horizon: "next-12-months",
      text: insight.headline + (insight.body ? ` — ${insight.body}` : ""),
      source: "cfoAdvisor.bottlenecks",
    });
  }

  // 4. Milestone: confidence band + projected FIRE achievement year.
  if (bestMove.bestNextAction.id) {
    majorMilestones.push({
      id: "milestone-confidence",
      horizon: "major-milestone",
      text: `Track that Best Move confidence remains in the "${bestMove.confidenceScore.band}" band as inputs change.`,
      source: "bestMoveEngineSprint5.confidenceScore.band",
    });
  }
  for (const risk of cfo.risks.slice(0, 2)) {
    majorMilestones.push({
      id: `risk-${risk.id}`,
      horizon: "major-milestone",
      text: `Resolve: ${risk.headline}.`,
      source: "cfoAdvisor.risks",
    });
  }

  const incomplete =
    bestMove.trace.incomplete
    || cfo.trace.incomplete
    || (thisMonth.length === 0 && next3Months.length === 0 && next12Months.length === 0);

  return { thisMonth, next3Months, next12Months, majorMilestones, incomplete };
}

function buildAuditTrail(
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
  ranking: RankingOutput,
  bestMove: BestMoveResult,
  cfo: CFOAdvisorResult,
  risk: RiskRadarResult | null | undefined,
  mc: MonteCarloResult | null | undefined,
): AuditTrailSection {
  const entries: AuditEntry[] = [];

  const mcSource = mc ? "monteCarloEngine.prob_ff" : "no-mc-supplied";
  const riskSource = risk ? "riskEngine.overall_score" : "no-risk-supplied";

  entries.push({
    id: "audit-goal-status",
    label: "Goal Status",
    enginesUsed: ["canonicalHeadlineMetrics", "canonicalFire", "goalSolver"],
    inputsUsed: [
      "canonicalLedger.snapshot",
      "canonicalLedger.properties",
      "canonicalLedger.stocks",
      "canonicalLedger.cryptos",
      "canonicalLedger.incomeRecords",
      "canonicalLedger.expenses",
    ],
    assumptions: [
      `Safe withdrawal rate ${(goal.trace.swrUsed * 100).toFixed(1)}% (canonicalFire)`,
      `Growth assumption ${(goal.trace.growthAssumptionUsed * 100).toFixed(1)}% (goalSolver)`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Target = canonicalFire.fireNumber (SWR-derived). Current projection = canonicalHeadlineMetrics.netWorth. Gap = canonicalFire.gap. Years ahead/behind = goalSolver.yearsAheadOrBehind. Confidence pulled from the Best Move engine.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-gap-analysis",
    label: "Gap Analysis",
    enginesUsed: ["goalSolver", "decisionCandidates", "riskEngine"],
    inputsUsed: [
      "goalSolver.requiredPassiveIncomeGap",
      "goalSolver.requiredAssetBase",
      "goalSolver.requiredMonthlyContribution",
      "decisionCandidates.trace.baselineLiquidityMonths",
      "goalSolver.trace.monthlyDebtService",
      "riskEngine.overall_score",
    ],
    assumptions: [
      `Emergency buffer floor (6 months) — decisionCandidates`,
      `Risk fragile threshold 40 — goalSolver`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Each gap is the difference between an existing goal-solver target and the canonical current value. The binding constraint is selected from feasibility + liquidity + debt + risk signals — no new arithmetic.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-path-comparison",
    label: "Path Comparison",
    enginesUsed: [
      "decisionCandidates",
      "decisionRanking",
      "bestMoveEngineSprint5",
      "canonicalHeadlineMetrics",
    ],
    inputsUsed: [
      "decisionCandidates.candidates",
      "decisionRanking.ranked",
      "bestMoveEngineSprint5.bestNextAction",
    ],
    assumptions: [
      "12-month projection horizon (decisionCandidates)",
      `Ranking weights = ${JSON.stringify(bestMove.trace.weightsUsed)}`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Each path is mapped to an existing decision candidate by kind. Net worth, passive income, surplus and liquidity for each path are the candidate's projection deltas added to the canonical baseline.",
    incomplete: cands.incomplete,
  });

  entries.push({
    id: "audit-best-path",
    label: "Best Path",
    enginesUsed: ["bestMoveEngineSprint5", "decisionRanking", "decisionCandidates"],
    inputsUsed: [
      "bestMoveEngineSprint5.expectedImpact",
      "bestMoveEngineSprint5.riskImpact",
      "bestMoveEngineSprint5.liquidityImpact",
      "bestMoveEngineSprint5.whyThisBeatsAlternatives",
    ],
    assumptions: [
      "Confidence = weighted MC + score margin + data coverage",
      `Candidates evaluated = ${bestMove.trace.candidatesEvaluated}`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource: bestMove.trace.riskSupplied ? "riskEngine.overall_score" : "decisionCandidates.risk",
    monteCarloSource: bestMove.trace.monteCarloSupplied
      ? "monteCarloEngine.prob_ff"
      : "decisionCandidates.risk.mcConfidence",
    howCalculated:
      "Best Path = engine's highest-ranked candidate. The narrative under 'why it wins' is pass-through from bestMoveEngineSprint5.whyThisBeatsAlternatives.narrative.",
    incomplete: bestMove.trace.incomplete,
  });

  entries.push({
    id: "audit-action-plan",
    label: "Action Plan",
    enginesUsed: ["bestMoveEngineSprint5", "cfoAdvisor"],
    inputsUsed: [
      "bestMoveEngineSprint5.bestNextAction.label",
      "cfoAdvisor.recommendedNextActions",
      "cfoAdvisor.opportunities",
      "cfoAdvisor.bottlenecks",
      "cfoAdvisor.risks",
    ],
    assumptions: [
      "Action text is a translation of engine recommendations — no monetary values are inserted by this section.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "The action plan translates engine recommendations into time-horizoned actions. No new financial values are introduced — all language references existing engine outputs.",
    incomplete: cfo.trace.incomplete,
  });

  return {
    entries,
    incomplete: entries.some(e => e.incomplete),
  };
}

/* ─── Public API ───────────────────────────────────────────────────────── */

/**
 * Build the Goal Closure Lab payload from existing canonical and Sprint 5
 * engine outputs. Pure / deterministic. Never fabricates household values.
 */
export function buildGoalClosureLab(
  inputs: GoalClosureLabInputs,
): GoalClosureLabResult {
  if (!inputs || !inputs.canonicalLedger || !inputs.canonicalLedger.snapshot) {
    return emptyResult("Canonical ledger is missing or has no snapshot.");
  }
  const ledger = inputs.canonicalLedger;

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
  const cfo = generateCFOInsights({
    canonicalLedger: ledger,
    canonicalHead: head,
    goalSolverOutputs: goal,
    candidateOutputs: candidates,
    rankingOutputs: ranking,
    bestMoveOutputs: bestMove,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });

  const goalStatus = buildGoalStatus(head, fire, goal, bestMove);
  const gapAnalysis = buildGapAnalysis(
    head,
    fire,
    goal,
    candidates,
    inputs.riskOutputs ?? null,
  );
  const pathComparison = buildPathComparison(
    head,
    goal,
    candidates,
    ranking,
    bestMove,
    inputs.riskOutputs ?? null,
    inputs.monteCarloOutputs ?? null,
  );
  const bestPath = buildBestPath(bestMove, pathComparison);
  const actionPlan = buildActionPlan(bestMove, cfo);
  const auditTrail = buildAuditTrail(
    goal,
    candidates,
    ranking,
    bestMove,
    cfo,
    inputs.riskOutputs ?? null,
    inputs.monteCarloOutputs ?? null,
  );

  return {
    empty: false,
    goalStatus,
    gapAnalysis,
    pathComparison,
    bestPath,
    actionPlan,
    auditTrail,
    strategicIdeas: { ideas: STRATEGIC_IDEAS_CATALOGUE },
    bundle: { head, fire, goal, candidates: candidates, ranking, bestMove, cfo },
  };
}

/* ─── Formatting helpers (pure presentation) ───────────────────────────── */

/**
 * Best-guess confidence kind derived from a metric's source string. The
 * orchestrator does not know whether the underlying value is rule, heuristic,
 * MC, etc., but the source provenance string is enough to pick the right
 * banded display. Order matters — more specific patterns first.
 */
function inferKindFromSource(source: string): ConfidenceKind {
  const s = source.toLowerCase();
  if (s.includes("montecarlo") || s.includes("monte_carlo") || s.includes("prob_ff")) {
    return "mc";
  }
  if (s.includes("decision") || s.includes("sprint5") || s.includes("bestmove")) {
    return "composite";
  }
  if (s.includes("heuristic") || s.includes("bridge")) return "heuristic";
  if (s.includes("rule") || s.includes("engine.ts")) return "rule";
  return "composite";
}

export function formatClosureMetric(m: ClosureMetric): string {
  if (m.textOverride) return m.textOverride;
  if (m.format === "band") {
    /* Sprint 15 Phase 3 — banded confidence display. Always returns a label
       (never "—") so the surface communicates "Monte Carlo not yet run" when
       the value is absent rather than blank. */
    const kind: ConfidenceKind = m.value == null || !Number.isFinite(m.value)
      ? "absent"
      : inferKindFromSource(m.source);
    return formatConfidence({ kind, value: m.value }).label;
  }
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
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M/yr`;
      if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k/yr`;
      return `$${Math.round(v)}/yr`;
    }
    case "currency-per-month": {
      const v = m.value;
      if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k/mo`;
      return `$${Math.round(v)}/mo`;
    }
    case "percent":
      return `${Math.round(m.value * 100)}%`;
    case "score":
      return `${Math.round(m.value)} / 100`;
    case "years":
      return `${m.value.toFixed(1)} yr`;
    case "months":
      return `${m.value.toFixed(1)} mo`;
    case "date":
      return String(Math.round(m.value));
    case "text":
    default:
      return String(m.value);
  }
}
