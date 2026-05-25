/**
 * goalSolverView — Sprint 13 selector layer over GoalSolverProResult.
 *
 * The Sprint 10 engine emits action plan entries whose `action` strings are
 * engine-internal language ("Median net worth checkpoint: $1.2M",
 * "Acquire investment property #1"). Sprint 13's mandate (Problem 2) is to
 * rewrite those into user-facing recommendations with WHAT/WHEN/WHY/expected
 * deltas. This module owns that translation plus the source-lineage labels
 * used by <SourceTag>.
 *
 * Everything here is pure orchestration over existing engine outputs — no
 * new calculations.
 */

import type {
  ActionPlanEntry,
  BlockerEntry,
  GoalSolverProResult,
  PathCandidate,
} from "./goalSolverPro";

/* ─── User-facing action shape ──────────────────────────────────────── */

export interface UserFacingAction {
  what: string;
  when: string;
  why: string;
  expected: {
    netWorth?: number;
    passiveIncome?: number;
    probability?: number;
  };
  sourceLabel: string;
  internalRef?: string;
}

/* ─── Source labels ─────────────────────────────────────────────────── */

export type PromotedMetricKey =
  | "currentNetWorth"
  | "targetNetWorth"
  | "gap"
  | "probability"
  | "yearsRemaining"
  | "fireYear"
  | "doNothingNetWorth"
  | "doNothingPassiveIncome"
  | "doNothingProbability"
  | "doNothingFireDate"
  | "recommendedAction"
  | "blocker";

export interface SourceDescriptor {
  label: string;
  internalRef?: string;
}

export function selectSourceLabelFor(
  metricKey: PromotedMetricKey,
  ctx?: { strategyId?: string | null; strategyLabel?: string | null; candidateRank?: number | null },
): SourceDescriptor {
  switch (metricKey) {
    case "currentNetWorth":
      return { label: "Canonical Ledger" };
    case "targetNetWorth":
      return { label: "Dashboard Goal" };
    case "gap":
      return { label: "Forecast Engine" };
    case "probability":
      return { label: "Scenario Engine" };
    case "yearsRemaining":
      return { label: "Dashboard Goal" };
    case "fireYear":
      return { label: "Path Simulation" };
    case "doNothingNetWorth":
    case "doNothingPassiveIncome":
      return { label: "Forecast Engine (baseline)" };
    case "doNothingProbability":
      return { label: "Scenario Engine" };
    case "doNothingFireDate":
      return { label: "Path Simulation" };
    case "recommendedAction":
      return {
        label: "Goal Solver",
        internalRef:
          ctx?.strategyId != null
            ? `Strategy ${ctx.strategyLabel ?? ctx.strategyId}`
            : ctx?.candidateRank != null
            ? `Ranked candidate #${ctx.candidateRank}`
            : undefined,
      };
    case "blocker":
      return { label: "Goal Solver" };
    default:
      return { label: "Goal Solver" };
  }
}

/* ─── Action label rewriter ─────────────────────────────────────────── */

interface RewriteContext {
  todayYear: number;
}

interface RewriteResult {
  what: string;
  when: string;
  why: string;
}

function formatMoneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Rewrite a single Sprint 10 `ActionPlanEntry` into user-facing text.
 *
 * The engine emits strings — we pattern-match those rather than introspecting
 * a typed action union (the engine has none). The match order matters: most
 * specific first.
 *
 * If nothing matches we fall back to a generic "Adjust plan: <safe label>"
 * — we NEVER show the raw engine label that contained "checkpoint", "median",
 * or internal jargon.
 */
export function rewriteActionPlanEntry(entry: ActionPlanEntry, ctx: RewriteContext): RewriteResult {
  const raw = entry.action ?? "";
  const lower = raw.toLowerCase();
  const year = entry.year;
  const isFuture = Number.isFinite(year) && year > ctx.todayYear;
  const yearsAway = isFuture ? year - ctx.todayYear : 0;
  const whenLabel = isFuture ? `${year}` : "Now";

  // (a) Acquire investment property — "Acquire investment property #N (strategy "...")"
  if (/acquire investment property/i.test(raw) || /buy.*investment.*property/i.test(raw)) {
    return {
      what: isFuture
        ? `Buy investment property in ${year}`
        : `Buy investment property`,
      when: whenLabel,
      why: "Adds passive income and accelerates net worth growth.",
    };
  }

  // (b) Delay investment property purchase
  if (/delay.*investment.*property/i.test(raw) || /delay.*property.*purchase/i.test(raw)) {
    return {
      what: isFuture
        ? `Delay property purchase to ${year}`
        : `Delay property purchase`,
      when: whenLabel,
      why: "Conserves cash and reduces sequencing risk.",
    };
  }

  // (c) Monthly contribution — "Set monthly contribution to $X/mo"
  const dcaMatch = raw.match(/\$([\d,]+)\s*\/?\s*mo/i);
  if (/monthly contribution/i.test(raw) || dcaMatch) {
    const amount = dcaMatch ? Number(dcaMatch[1].replace(/,/g, "")) : null;
    return {
      what: amount
        ? `Set monthly investing to ${formatMoneyShort(amount)}/mo`
        : `Adjust monthly investing schedule`,
      when: "Now",
      why: "Boosts portfolio compounding before retirement.",
    };
  }

  // (d) Median net worth checkpoint — the user's "bad example". Rewrite to
  //     a goal-oriented milestone the user can understand and react to.
  if (/median net worth checkpoint/i.test(raw) || /median.*net.*worth/i.test(raw)) {
    const moneyMatch = raw.match(/\$([\d.,]+(?:M|k)?)/i);
    return {
      what: moneyMatch
        ? `Hit net-worth milestone ${moneyMatch[0]} by ${year}`
        : `Reach mid-plan net-worth milestone by ${year}`,
      when: `${year}`,
      why: "Mid-plan checkpoint that keeps the FIRE trajectory on track.",
    };
  }

  // (e) Projected FIRE year (median)
  if (/projected fire year/i.test(raw) || /fire year.*median/i.test(raw)) {
    return {
      what: `Reach FIRE by ${year}`,
      when: `${year}`,
      why: "Median projected FIRE year — the destination this plan targets.",
    };
  }

  // (f) Stock DCA scheduled to begin
  if (/stock dca/i.test(raw) || /dca.*begin/i.test(raw) || /dca.*start/i.test(raw)) {
    return {
      what: isFuture
        ? `Start stock investing schedule in ${year}`
        : `Start stock investing schedule`,
      when: whenLabel,
      why: "Establishes the contribution cadence the plan relies on.",
    };
  }

  // (g) Reduce / pay down debt
  if (/reduce.*debt/i.test(raw) || /pay.*down.*debt/i.test(raw) || /ppor.*debt/i.test(raw)) {
    return {
      what: `Reduce non-investment debt`,
      when: yearsAway > 0 ? `Within ${yearsAway} year${yearsAway === 1 ? "" : "s"}` : "Within 12 months",
      why: "Lowers interest cost and improves cashflow.",
    };
  }

  // (h) Release equity
  if (/release.*equity/i.test(raw)) {
    return {
      what: isFuture ? `Release property equity in ${year}` : `Release property equity`,
      when: whenLabel,
      why: "Unlocks dormant capital for higher-return investments.",
    };
  }

  // (i) Increase passive income
  if (/increase.*passive.*income/i.test(raw)) {
    return {
      what: `Increase passive income`,
      when: yearsAway > 0 ? `Within ${yearsAway} year${yearsAway === 1 ? "" : "s"}` : "Within 12 months",
      why: "Closes the income gap to FIRE faster.",
    };
  }

  // (j) Delay FIRE
  if (/delay.*fire/i.test(raw)) {
    return {
      what: yearsAway > 0 ? `Delay FIRE by ${yearsAway} year${yearsAway === 1 ? "" : "s"}` : `Delay FIRE timeline`,
      when: yearsAway > 0 ? `+${yearsAway} years` : whenLabel,
      why: "Builds a bigger nest-egg buffer if current pace is too aggressive.",
    };
  }

  // Fallback — safe generic label. Never echoes engine-internal terms like
  // "checkpoint" or unit-bearing numbers that the user can't act on.
  const safeYearTag = isFuture ? ` by ${year}` : "";
  return {
    what: `Adjust your plan${safeYearTag}`,
    when: whenLabel,
    why: "Recommended by the Goal Solver based on your current canonical inputs.",
  };
}

/* ─── Top-3 action selector ─────────────────────────────────────────── */

function quantifyExpectedDelta(
  best: PathCandidate | null,
  alts: ReadonlyArray<{ path: PathCandidate | null }>,
): { netWorth?: number; passiveIncome?: number; probability?: number } {
  // We use the *delta* between the recommended best path and the median
  // alternative to give the user a concrete "what does this buy me" number.
  // If no alternatives exist, we report absolute best-path numbers — never
  // invent values.
  if (!best) return {};
  const altPaths = alts.map((a) => a.path).filter((p): p is PathCandidate => !!p);
  if (altPaths.length === 0) {
    return {
      netWorth: best.netWorthP50 ?? undefined,
      passiveIncome: best.passiveIncomeP50 ?? undefined,
      probability: best.probabilityFireByTarget ?? undefined,
    };
  }
  const medianOf = (xs: Array<number | null>): number | undefined => {
    const ys = xs.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (ys.length === 0) return undefined;
    return ys[Math.floor(ys.length / 2)];
  };
  const nwBase = medianOf(altPaths.map((p) => p.netWorthP50));
  const piBase = medianOf(altPaths.map((p) => p.passiveIncomeP50));
  const probBase = medianOf(altPaths.map((p) => p.probabilityFireByTarget));
  return {
    netWorth: nwBase != null && best.netWorthP50 != null ? best.netWorthP50 - nwBase : best.netWorthP50 ?? undefined,
    passiveIncome:
      piBase != null && best.passiveIncomeP50 != null ? best.passiveIncomeP50 - piBase : best.passiveIncomeP50 ?? undefined,
    probability:
      probBase != null && best.probabilityFireByTarget != null
        ? best.probabilityFireByTarget - probBase
        : best.probabilityFireByTarget ?? undefined,
  };
}

export function selectTop3UserFacingActions(result: GoalSolverProResult | null | undefined): UserFacingAction[] {
  if (!result || result.empty) return [];
  const todayYear = new Date().getFullYear();
  const ctx: RewriteContext = { todayYear };
  const expected = quantifyExpectedDelta(result.bestPath, result.alternativePaths ?? []);
  const sourceCtx = {
    strategyId: result.bestPath?.strategyId ?? null,
    strategyLabel: result.bestPath?.label ?? null,
  };

  // Prefer near-term, actionable entries (year <= today + 5) and dedupe by
  // rewritten WHAT label so we don't show two "Set monthly investing" cards.
  const entries = (result.actionPlan ?? []).slice();
  // Stable sort by year ascending — the engine already does this, but be safe.
  entries.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  const seen = new Set<string>();
  const out: UserFacingAction[] = [];
  for (const e of entries) {
    const r = rewriteActionPlanEntry(e, ctx);
    const key = r.what.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const src = selectSourceLabelFor("recommendedAction", sourceCtx);
    out.push({
      what: r.what,
      when: r.when,
      why: r.why,
      expected,
      sourceLabel: src.label,
      internalRef: src.internalRef ?? `${e.sourceStrategyId} · ${e.inputField}`,
    });
    if (out.length === 3) break;
  }
  return out;
}

/* ─── Ranked blockers ───────────────────────────────────────────────── */

export interface RankedBlocker {
  rank: number;
  label: string;
  impactScore: number; // 1..5 relative magnitude
  required: string;
  expectedBenefit: string;
  sourceLabel: string;
  internalRef?: string;
}

export function selectRankedBlockers(result: GoalSolverProResult | null | undefined): RankedBlocker[] {
  if (!result || result.empty) return [];
  const blockers = (result.blockers ?? []).slice(0, 3);
  const src = selectSourceLabelFor("blocker");
  // Impact score = relative magnitude (5 highest). We approximate this by
  // the number of strategies the blocker eliminated — engine output, no
  // synthesis.
  const maxEliminated = blockers.reduce((m, b) => Math.max(m, b.strategiesEliminated.length), 0) || 1;
  return blockers.map((b: BlockerEntry, idx: number) => {
    const eliminated = b.strategiesEliminated.length;
    const impactScore = Math.max(1, Math.round((eliminated / maxEliminated) * 5));
    return {
      rank: idx + 1,
      label: b.constraint,
      impactScore,
      required: b.reason || "Improve the constraint above.",
      expectedBenefit:
        eliminated > 0
          ? `Unblocks ${eliminated} previously-eliminated strateg${eliminated === 1 ? "y" : "ies"}.`
          : "Removes a hard constraint in the current plan.",
      sourceLabel: src.label,
      internalRef: src.internalRef,
    };
  });
}

/* ─── FIRE gap summary (Section 1 hero data) ────────────────────────── */

export interface FireGapSummary {
  currentNetWorth?: number;
  targetNetWorth?: number;
  gap?: number;
  yearsRemaining?: number;
  probability?: number; // 0..1
  fireYear?: number;
}

export function selectFireGapSummary(
  result: GoalSolverProResult | null | undefined,
  canonical: { netWorthNow?: number | null; fireNumber?: number | null } | null | undefined,
): FireGapSummary {
  if (!result || result.empty) {
    if (canonical?.netWorthNow != null) {
      return { currentNetWorth: canonical.netWorthNow };
    }
    return {};
  }
  const targetFireYear = result.targets.targetFireYear ?? result.feasibility.expectedFireYear ?? null;
  const todayYear = new Date().getFullYear();
  const yearsRemaining =
    targetFireYear != null && Number.isFinite(targetFireYear) ? Math.max(0, targetFireYear - todayYear) : undefined;
  const currentNW = canonical?.netWorthNow ?? undefined;
  const targetNW = result.targets.targetNetWorth ?? canonical?.fireNumber ?? undefined;
  const gap = targetNW != null && currentNW != null ? targetNW - currentNW : undefined;
  return {
    currentNetWorth: currentNW,
    targetNetWorth: targetNW ?? undefined,
    gap,
    yearsRemaining,
    probability: result.feasibility.probabilityOfSuccess ?? undefined,
    fireYear: targetFireYear ?? undefined,
  };
}

/* ─── Do-nothing outcome (Section 4) ────────────────────────────────── */

export interface DoNothingOutcomeData {
  netWorth?: number;
  passiveIncome?: number;
  probability?: number; // 0..1
  fireYear?: number;
}

export function selectDoNothingComparison(
  result: GoalSolverProResult | null | undefined,
  canonical: { netWorthNow?: number | null; annualPassiveIncome?: number | null } | null | undefined,
): DoNothingOutcomeData {
  // "Do nothing" = baseline: hold current state flat — that means current net
  // worth as the projected NW (no growth), today's passive income, near-zero
  // probability of meeting an unmet target, and the median FIRE year is
  // unknown until the user changes course. We surface what we know from
  // canonical inputs and the worstCaseFireYear from feasibility as a proxy
  // for "if I do nothing".
  if (!result || result.empty) {
    return {
      netWorth: canonical?.netWorthNow ?? undefined,
      passiveIncome: canonical?.annualPassiveIncome ?? undefined,
    };
  }
  // Worst-case Fire year is a conservative "do nothing" proxy when no
  // alternative scenario is available.
  return {
    netWorth: canonical?.netWorthNow ?? undefined,
    passiveIncome: canonical?.annualPassiveIncome ?? undefined,
    probability: result.feasibility.probabilityOfSuccess ?? undefined,
    fireYear: result.feasibility.worstCaseFireYear ?? result.feasibility.expectedFireYear ?? undefined,
  };
}
