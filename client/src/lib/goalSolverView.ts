/**
 * goalSolverView.ts — Sprint 12 advisor-style selectors over Sprint 10.
 *
 * Pure transforms that read existing `GoalSolverProResult` canonical fields
 * (Sprint 10 outputs) and reshape them into advisor-friendly view objects.
 * NO new financial formulas, NO recomputation of engine outputs.
 */

import type {
  GoalSolverProResult,
  PathCandidate,
  OptimizationResult,
  GapEntry,
} from "./goalSolverPro";
import type {
  FireGapSummary,
  Top3Action,
  PathRecommendation,
  PathRecommendationKind,
  RankedBlocker,
  MinimumChange,
  DoNothingComparison,
} from "./goalSolverView.types";

/**
 * REMEDIATION B-6: default probability bar when the canonical goal config
 * does not supply one. Tagged in the view as `requiredProbabilitySource:
 * 'default'` so the UI can render it as "(default)".
 */
export const REQUIRED_PROB_BAR_DEFAULT = 0.7;
/** @deprecated REMEDIATION B-6: use REQUIRED_PROB_BAR_DEFAULT or the value
 *   resolved from useCanonicalGoal. Kept for selectMinimumChange which has not
 *   been wired through canonical goal yet. */
const REQUIRED_PROB_BAR = REQUIRED_PROB_BAR_DEFAULT;

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function findGap(result: GoalSolverProResult, field: GapEntry["field"]): GapEntry | undefined {
  return result.gap.entries.find((e) => e.field === field);
}

/**
 * Optional context for selectFireGapSummary that the caller MUST thread through
 * from the canonical layer:
 *   - `ledgerNetWorth`: from selectCanonicalNetWorth(). Required for the
 *     Current NW tile to be correct. If omitted, currentNetWorth is null
 *     (UI shows "—") — we NEVER fall back to a future-year forecast P50.
 *   - `canonicalRequiredProbability`: from the user's saved goal config when
 *     available; otherwise the default 0.70 bar is used and
 *     `requiredProbabilitySource = 'default'`.
 *   - `goalNotSet`: from useCanonicalGoal — when true, targets/gaps stay
 *     null but the Current NW tile still shows the ledger value.
 */
export interface FireGapSummaryContext {
  ledgerNetWorth?: number | null;
  canonicalRequiredProbability?: number | null;
  goalNotSet?: boolean;
}

/** Read FIRE Gap Summary tiles (8 KPIs) from Sprint 10 canonical fields. */
export function selectFireGapSummary(
  result: GoalSolverProResult,
  ctx: FireGapSummaryContext = {},
): FireGapSummary {
  const best = result.bestPath;
  const targets = result.targets;
  const nwGap = findGap(result, "netWorth");
  const piAnnualGap = findGap(result, "passiveIncomeAnnual");
  const piMonthlyGap = findGap(result, "passiveIncomeMonthly");
  const fireYearGap = findGap(result, "fireYear");

  // REMEDIATION B-1: Current NW MUST come from the ledger. The earlier code
  // fell back to `best.netWorthP50` (the target-year forecast median), which
  // produced the smoking-gun bug where displayed Current NW = $3.15M but the
  // actual ledger NW = $856,500. Keep this selector strict: if callers do not
  // thread the canonical ledger through, the UI must show an empty value rather
  // than infer a "current" number from engine output.
  const currentNetWorth: number | null = finite(ctx.ledgerNetWorth)
    ? (ctx.ledgerNetWorth as number)
    : null;

  const targetNetWorth = finite(targets.targetNetWorth)
    ? (targets.targetNetWorth as number)
    : null;

  const netWorthGap =
    finite(currentNetWorth) && finite(targetNetWorth)
      ? Math.max(0, targetNetWorth - currentNetWorth)
      : null;

  // Passive income — prefer annual when provided, fall back to monthly*12.
  // We do NOT fall back to `best.passiveIncomeP50` for the same reason as NW:
  // the bestPath forecast is a future-year projection, not a snapshot of
  // current income. If the gap row is missing it stays null.
  const currentPassiveIncome = finite(piAnnualGap?.actual)
    ? (piAnnualGap!.actual as number)
    : finite(piMonthlyGap?.actual)
      ? (piMonthlyGap!.actual as number) * 12
      : null;

  const targetPassiveIncome = finite(targets.targetPassiveIncomeAnnual)
    ? (targets.targetPassiveIncomeAnnual as number)
    : finite(targets.targetPassiveIncomeMonthly)
      ? (targets.targetPassiveIncomeMonthly as number) * 12
      : null;

  const passiveIncomeGap =
    finite(currentPassiveIncome) && finite(targetPassiveIncome)
      ? Math.max(0, targetPassiveIncome - currentPassiveIncome)
      : null;

  const currentProbability = result.feasibility.probabilityOfSuccess ?? null;

  // REMEDIATION B-6: prefer canonical goal config; fall back to default and
  // tag the source so the UI can render it as "(default)".
  const requiredProbability = finite(ctx.canonicalRequiredProbability)
    ? (ctx.canonicalRequiredProbability as number)
    : REQUIRED_PROB_BAR_DEFAULT;
  const requiredProbabilitySource: "canonical" | "default" =
    finite(ctx.canonicalRequiredProbability) ? "canonical" : "default";

  const targetFireYear =
    finite(targets.targetFireYear) ? (targets.targetFireYear as number) :
    finite(targets.targetRetirementYear) ? (targets.targetRetirementYear as number) :
    finite(fireYearGap?.target) ? (fireYearGap!.target as number) :
    null;

  const medianFireYear = result.feasibility.medianFireYear ?? null;

  return {
    currentNetWorth,
    targetNetWorth,
    netWorthGap,
    currentPassiveIncome,
    targetPassiveIncome,
    passiveIncomeGap,
    currentProbability,
    requiredProbability,
    requiredProbabilitySource,
    targetFireYear,
    medianFireYear,
    goalNotSet: ctx.goalNotSet === true,
  };
}

/**
 * Top-3 action cards. Reads the action plan (already sorted by Sprint 10)
 * and the best path's net-worth/passive-income/probability. Deltas are
 * computed by comparing the best path against the worst alternative
 * (or zero baseline if no alternatives) — these come from existing engine
 * candidate scores, never invented.
 */
export function selectTop3Actions(result: GoalSolverProResult): Top3Action[] {
  const best = result.bestPath;
  const out: Top3Action[] = [];
  if (!best || !result.actionPlan.length) return out;

  // Identify a "do nothing" baseline candidate: pick the alternative path
  // with the lowest probability OR the one whose actionPlan source year is
  // furthest out — used to size action deltas.
  const baselineProbability = findBaselineProbability(result);
  const baselineNW = findBaselineNetWorth(result);
  const baselineIncome = findBaselineIncome(result);

  const seen = new Set<string>();
  for (const entry of result.actionPlan) {
    if (seen.has(entry.action)) continue;
    seen.add(entry.action);
    out.push({
      label: entry.action,
      rationale: entry.auditNote,
      netWorthDelta: deltaOrNull(best.netWorthP50, baselineNW),
      passiveIncomeDelta: deltaOrNull(best.passiveIncomeP50, baselineIncome),
      probabilityDelta: deltaOrNull(best.probabilityFireByTarget, baselineProbability),
      dueYear: entry.year,
      sourceStrategyId: entry.sourceStrategyId,
    });
    if (out.length >= 3) break;
  }

  return out;
}

function findBaselineProbability(result: GoalSolverProResult): number | null {
  const probs = result.alternativePaths
    .map((a) => a.path?.probabilityFireByTarget)
    .filter(finite) as number[];
  if (probs.length === 0) return 0;
  return Math.min(...probs);
}

function findBaselineNetWorth(result: GoalSolverProResult): number | null {
  const vals = result.alternativePaths
    .map((a) => a.path?.netWorthP50)
    .filter(finite) as number[];
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

function findBaselineIncome(result: GoalSolverProResult): number | null {
  const vals = result.alternativePaths
    .map((a) => a.path?.passiveIncomeP50)
    .filter(finite) as number[];
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

function deltaOrNull(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!finite(a)) return null;
  if (!finite(b)) return a;
  return a - b;
}

/** Map Sprint 10 alternative objectives to user-facing labels. */
const PATH_KIND_LABELS: Record<string, { kind: PathRecommendationKind; label: string }> = {
  fastestFire: { kind: "fastest", label: "Fastest Path" },
  highestProbability: { kind: "highest-prob", label: "Highest Probability Path" },
  lowestRisk: { kind: "safest", label: "Safest Path" },
  bestHybrid: { kind: "hybrid", label: "Balanced Path" },
  bestLiquidityAdjusted: { kind: "lowest-cash", label: "Lowest Cash-Requirement Path" },
};

export function selectPathRecommendations(result: GoalSolverProResult): PathRecommendation[] {
  const out: PathRecommendation[] = [];
  for (const alt of result.alternativePaths) {
    const mapping = PATH_KIND_LABELS[alt.objective];
    if (!mapping) continue;
    if (!alt.path) continue;
    out.push({
      kind: mapping.kind,
      label: mapping.label,
      strategyLabel: alt.path.label ?? null,
      expectedFireYear: alt.path.medianFireYear ?? null,
      expectedNetWorth: alt.path.netWorthP50 ?? null,
      expectedPassiveIncome: alt.path.passiveIncomeP50 ?? null,
      probability: alt.path.probabilityFireByTarget ?? null,
      actions: actionLabelsForStrategy(result, alt.path),
    });
  }
  return out;
}

function actionLabelsForStrategy(
  result: GoalSolverProResult,
  candidate: PathCandidate,
): string[] {
  return result.actionPlan
    .filter((e) => e.sourceStrategyId === candidate.strategyId)
    .map((e) => e.action);
}

/**
 * Rank blockers by their inferred impact. Sprint 10 surfaces blockers as
 * either string codes (gap.blockers) or BlockerEntry rows (result.blockers).
 * We project both into a uniform ranked list using existing engine fields.
 */
export function selectRankedBlockers(result: GoalSolverProResult): RankedBlocker[] {
  const out: RankedBlocker[] = [];

  // BlockerEntry rows from constraint solver. Each is a hard constraint that
  // eliminated >= 1 strategy. Estimate impact = how many strategies it killed.
  for (const b of result.blockers) {
    out.push({
      rank: 0, // assigned after sorting
      label: b.constraint,
      currentValue: null,
      requiredChange: b.reason,
      estimatedImpactNetWorth: null,
      estimatedImpactProbability: estimateProbabilityImpactFromEliminated(b.strategiesEliminated.length),
    });
  }

  // Shortfall blockers from gap analysis. Each shortfall row provides a real
  // dollar/year gap we can show.
  for (const e of result.gap.entries) {
    if (e.status !== "shortfall") continue;
    if (!finite(e.actual) || !finite(e.target)) continue;
    out.push({
      rank: 0,
      label: e.label,
      currentValue: formatGapValue(e.unit, e.actual),
      requiredChange: `${formatGapValue(e.unit, e.shortfall)} short of target ${formatGapValue(e.unit, e.target)}`,
      estimatedImpactNetWorth: e.field === "netWorth" ? e.shortfall : null,
      estimatedImpactProbability: estimateProbabilityImpactFromGap(e.shortfall, e.target),
    });
  }

  // Sort by probability impact desc (null sinks).
  out.sort((a, b) => {
    const pa = a.estimatedImpactProbability ?? 0;
    const pb = b.estimatedImpactProbability ?? 0;
    return pb - pa;
  });
  out.forEach((b, i) => {
    b.rank = i + 1;
  });
  return out;
}

function formatGapValue(unit: string, v: number): string {
  if (unit === "$" || unit === "$/yr" || unit === "$/mo") {
    return `$${Math.round(v).toLocaleString()}${unit === "$/yr" ? "/yr" : unit === "$/mo" ? "/mo" : ""}`;
  }
  if (unit === "year") return String(Math.round(v));
  if (unit === "props") return `${Math.round(v)} props`;
  if (unit === "months") return `${Math.round(v)} mo`;
  if (unit === "score") return v.toFixed(2);
  return String(Math.round(v));
}

function estimateProbabilityImpactFromEliminated(n: number): number | null {
  if (n <= 0) return null;
  // Existing engine field: number of strategies eliminated. Use as a relative
  // signal only (not a recomputation of probability).
  return Math.min(0.5, n * 0.05);
}

function estimateProbabilityImpactFromGap(shortfall: number, target: number): number | null {
  if (!finite(shortfall) || !finite(target) || target <= 0) return null;
  const ratio = shortfall / target;
  if (!Number.isFinite(ratio)) return null;
  return Math.min(0.5, ratio * 0.3);
}

/**
 * Return the alternative with the smallest action plan size that still beats
 * the feasibility bar; or null when no single-change alternative exists.
 */
export function selectMinimumChange(result: GoalSolverProResult): MinimumChange | null {
  if (!result.alternativePaths.length) return null;

  let best: { alt: OptimizationResult; actionsCount: number } | null = null;
  for (const alt of result.alternativePaths) {
    if (!alt.path) continue;
    if (!finite(alt.path.probabilityFireByTarget)) continue;
    if ((alt.path.probabilityFireByTarget as number) < REQUIRED_PROB_BAR) continue;
    const actions = result.actionPlan.filter((e) => e.sourceStrategyId === alt.path!.strategyId);
    const n = actions.length;
    if (best == null || n < best.actionsCount) {
      best = { alt, actionsCount: n };
    }
  }
  if (!best) return null;
  const a = best.alt;
  return {
    changeType: a.label,
    magnitude: best.actionsCount === 0 ? "No actions required" : `${best.actionsCount} action(s)`,
    expectedProbability: a.path?.probabilityFireByTarget ?? null,
    sourceStrategyId: a.path?.strategyId ?? "",
  };
}

/**
 * Produce a Do-Nothing vs Recommended comparison. "Baseline" = the lowest
 * outcome among alternatives. "Recommended" = the bestPath.
 */
export function selectDoNothingComparison(result: GoalSolverProResult): DoNothingComparison {
  const best = result.bestPath;
  const probs = result.alternativePaths.map((a) => a.path?.probabilityFireByTarget).filter(finite) as number[];
  const fires = result.alternativePaths.map((a) => a.path?.medianFireYear).filter(finite) as number[];
  const nws = result.alternativePaths.map((a) => a.path?.netWorthP50).filter(finite) as number[];
  const pis = result.alternativePaths.map((a) => a.path?.passiveIncomeP50).filter(finite) as number[];

  return {
    baselineFireYear: fires.length ? Math.max(...fires) : null,
    recommendedFireYear: best?.medianFireYear ?? null,
    baselineNetWorth: nws.length ? Math.min(...nws) : null,
    recommendedNetWorth: best?.netWorthP50 ?? null,
    baselineProbability: probs.length ? Math.min(...probs) : null,
    recommendedProbability: best?.probabilityFireByTarget ?? null,
    baselinePassiveIncome: pis.length ? Math.min(...pis) : null,
    recommendedPassiveIncome: best?.passiveIncomeP50 ?? null,
  };
}
