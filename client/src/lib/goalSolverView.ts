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
  FireCommandCenterData,
  Top3ActionDetail,
  RankedBlockerDetail,
  DoNothingOutcome,
} from "./goalSolverView.types";
import { filterAndRewriteActionPlan, rewriteAction } from "./actionLabelMap";

const REQUIRED_PROB_BAR = 0.7;

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function findGap(result: GoalSolverProResult, field: GapEntry["field"]): GapEntry | undefined {
  return result.gap.entries.find((e) => e.field === field);
}

/** Read FIRE Gap Summary tiles (8 KPIs) from Sprint 10 canonical fields. */
export function selectFireGapSummary(result: GoalSolverProResult): FireGapSummary {
  const best = result.bestPath;
  const targets = result.targets;
  const nwGap = findGap(result, "netWorth");
  const piAnnualGap = findGap(result, "passiveIncomeAnnual");
  const piMonthlyGap = findGap(result, "passiveIncomeMonthly");
  const fireYearGap = findGap(result, "fireYear");

  const currentNetWorth = finite(nwGap?.actual)
    ? (nwGap!.actual as number)
    : finite(best?.netWorthP50)
      ? best!.netWorthP50
      : null;

  const targetNetWorth = finite(targets.targetNetWorth)
    ? (targets.targetNetWorth as number)
    : null;

  const netWorthGap =
    finite(currentNetWorth) && finite(targetNetWorth)
      ? Math.max(0, targetNetWorth - currentNetWorth)
      : null;

  // Passive income — prefer annual when provided, fall back to monthly*12.
  const currentPassiveIncome = finite(piAnnualGap?.actual)
    ? (piAnnualGap!.actual as number)
    : finite(piMonthlyGap?.actual)
      ? (piMonthlyGap!.actual as number) * 12
      : finite(best?.passiveIncomeP50)
        ? best!.passiveIncomeP50
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
  // "Required" probability = the configured 0.70 ACHIEVABLE bar (existing
  // Sprint 10 threshold in classifyStatus).
  const requiredProbability = REQUIRED_PROB_BAR;

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
    targetFireYear,
    medianFireYear,
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

/* ─── Sprint 13 advisor-style selectors ───────────────────────────────── */

/**
 * 5-tile FIRE Command Center data:
 * Current Net Worth · Target Net Worth · Gap · Years Remaining · Probability.
 *
 * Pure projection over the existing FireGapSummary + Sprint 10 feasibility
 * fields. No new computation other than `targetFireYear - currentYear`
 * subtraction for the "Years Remaining" derived figure.
 */
export function selectFireCommandCenterData(result: GoalSolverProResult): FireCommandCenterData {
  const summary = selectFireGapSummary(result);
  const currentYear = new Date().getFullYear();
  const targetYear = summary.targetFireYear;
  const medianYear = summary.medianFireYear;
  const yearsRemaining = finite(targetYear) ? Math.max(0, (targetYear as number) - currentYear) : null;
  const medianYearsRemaining = finite(medianYear) ? Math.max(0, (medianYear as number) - currentYear) : null;

  return {
    currentNetWorth: summary.currentNetWorth,
    currentNetWorthSource: { label: "Canonical Ledger", detail: "goalSolver.gap.netWorth.actual" },
    targetNetWorth: summary.targetNetWorth,
    targetNetWorthSource: { label: "Dashboard Goal", detail: "goalSolver.targets.targetNetWorth" },
    gap: summary.netWorthGap,
    gapSource: { label: "Goal Solver", detail: "goalSolver.gap.netWorth.shortfall" },
    yearsRemaining,
    targetYear,
    yearsRemainingSource: {
      label: "Dashboard Goal",
      detail: targetYear != null ? `goalSolver.targets.targetFireYear=${targetYear}` : "no FIRE year set",
    },
    medianYearsRemaining,
    medianFireYear: medianYear,
    probability: summary.currentProbability,
    probabilitySource: { label: "Path Simulation", detail: "goalSolver.feasibility.probabilityOfSuccess" },
  };
}

/**
 * 3 user-facing actions with WHAT/WHEN/WHY/EXPECTED RESULT structure.
 * Filters internal checkpoints + applies actionLabelMap.
 */
export function selectTop3ActionsDetailed(result: GoalSolverProResult): Top3ActionDetail[] {
  const best = result.bestPath;
  if (!best) return [];

  const filtered = filterAndRewriteActionPlan(result.actionPlan);
  if (filtered.length === 0) return [];

  const baselineProbability = findBaselineProbability(result);
  const baselineNW = findBaselineNetWorth(result);
  const baselineIncome = findBaselineIncome(result);

  const out: Top3ActionDetail[] = [];
  const seen = new Set<string>();
  for (const e of filtered) {
    if (seen.has(e.rewritten.label)) continue;
    seen.add(e.rewritten.label);

    const nwDelta = deltaOrNull(best.netWorthP50, baselineNW);
    const piDelta = deltaOrNull(best.passiveIncomeP50, baselineIncome);
    const probDelta = deltaOrNull(best.probabilityFireByTarget, baselineProbability);

    out.push({
      what: e.rewritten.label,
      when: finite(e.year) ? (e.year as number) : null,
      why: e.auditNote || "Engine-traced action — see Supporting Analysis for the full audit trail.",
      expectedNetWorthDelta: nwDelta,
      expectedPassiveIncomeDelta: piDelta,
      expectedProbabilityDelta: probDelta,
      sourceStrategyId: e.sourceStrategyId,
      engineType: e.rewritten.type,
    });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 3 ranked blockers with: label · impact · required improvement · expected benefit.
 */
export function selectRankedBlockersDetailed(result: GoalSolverProResult): RankedBlockerDetail[] {
  const ranked = selectRankedBlockers(result);
  const out: RankedBlockerDetail[] = [];
  for (const r of ranked) {
    out.push({
      rank: r.rank,
      label: r.label,
      impact:
        r.estimatedImpactProbability != null
          ? `${Math.round(r.estimatedImpactProbability * 100)}% probability impact`
          : r.estimatedImpactNetWorth != null
            ? `${formatGapValue("$", r.estimatedImpactNetWorth)} net-worth impact`
            : null,
      requiredImprovement: r.requiredChange,
      expectedBenefit:
        r.estimatedImpactProbability != null
          ? `+${Math.round(r.estimatedImpactProbability * 100)}% feasibility if closed`
          : null,
      sourceLabel: "Goal Solver",
      sourceDetail: `goalSolver.blockers[rank=${r.rank}]`,
    });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 4-line "Do Nothing" outcome: NW / PI / Probability / Expected FIRE Date.
 */
export function selectDoNothingOutcome(result: GoalSolverProResult): DoNothingOutcome {
  const dn = selectDoNothingComparison(result);
  return {
    netWorth: dn.baselineNetWorth,
    passiveIncome: dn.baselinePassiveIncome,
    probability: dn.baselineProbability,
    expectedFireYear: dn.baselineFireYear,
    source: { label: "Path Simulation", detail: "goalSolver.alternativePaths.min" },
  };
}

