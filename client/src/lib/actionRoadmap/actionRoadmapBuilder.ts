/**
 * actionRoadmap/actionRoadmapBuilder.ts — Sprint 27.
 *
 * Selector that turns a `GoalLabRankedScenario` (engine output) into an
 * `ActionRoadmap` for the UI. THIS MODULE PERFORMS NO FINANCIAL MATH.
 *
 * What it does:
 *   1. Resolve the engine `templateId` → display `RoadmapTemplate` (metadata only).
 *   2. Walk `winner.events: ScenarioDelta[]`, already activation-month sorted
 *      by the engine, and turn each into a `RoadmapMilestone` with a friendly
 *      label + effect blurb and a status (completed / next / upcoming).
 *   3. Append a terminal `"Target FIRE"` milestone at the user's targetFireAge
 *      year IF we can compute the year deterministically (current age known).
 *      If we can't, we OMIT the milestone — never invent a date.
 *
 * Honesty rules:
 *   - We don't invent activation months. If a delta has no `activationMonth`,
 *     it is skipped (this shouldn't happen — engine always populates it).
 *   - We don't invent a FIRE year. If `currentAge` is null OR `targetFireAge`
 *     is null, the terminal milestone is omitted entirely.
 *   - No probabilities, no engine-untouched numbers.
 */

import type { ScenarioDelta, MonthKey } from "../scenarioV2/types";
import type { GoalLabRankedScenario } from "../goalLab/orchestrator";

import { monthKey } from "../scenarioV2/basePlan";
import { resolveRoadmapTemplate } from "./roadmapTemplates";
import type {
  ActionRoadmap,
  RoadmapMilestone,
} from "./types";

/**
 * Minimal goal shape we need. The Canonical Goal Profile exposes this as
 * `profile.fire.targetFireAge`. We accept a flat `{ targetFireAge }` here so
 * tests can pass a plain object and callers from the UI can pass
 * `profile.fire`.
 */
export interface RoadmapGoalInput {
  targetFireAge: number | null;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build the Action Roadmap from a winning RankedCandidate (`winner` of the
 * recommended `GoalLabRankedScenario`). Returns `null` if there is no winner.
 *
 * @param scenario  The recommended ranked scenario (already chosen by the
 *                  orchestrator's tie-break logic). If null OR `scenario.winner`
 *                  is null, returns null — the UI must render "Not modelled yet".
 * @param goal      Canonical goal profile (provides `targetFireAge` for the
 *                  terminal milestone). Optional: when null, terminal milestone
 *                  is omitted.
 * @param currentAge The user's current age in whole years. When null, the
 *                  terminal FIRE milestone is omitted (we will not invent a year).
 * @param now       Optional clock injection for tests (defaults to new Date()).
 */
export function buildActionRoadmap(
  scenario: GoalLabRankedScenario | null,
  goal: RoadmapGoalInput | null,
  currentAge: number | null,
  now: Date = new Date(),
): ActionRoadmap | null {
  if (!scenario || !scenario.winner) return null;
  const winner = scenario.winner;

  const template = resolveRoadmapTemplate(scenario.templateId);
  const todayKey = monthKey(now);

  // 1. Engine-derived milestones. Sort by activationMonth then priority so
  //    ties within a month resolve deterministically.
  const sortedEvents: ScenarioDelta[] = [...(winner.events ?? [])]
    .filter((e) => typeof e.activationMonth === "string" && e.activationMonth.length > 0)
    .sort((a, b) => {
      if (a.activationMonth < b.activationMonth) return -1;
      if (a.activationMonth > b.activationMonth) return 1;
      return (a.priority ?? 0) - (b.priority ?? 0);
    });

  const milestones: RoadmapMilestone[] = [];
  let nextAssigned = false;

  for (const delta of sortedEvents) {
    const isPast = delta.activationMonth < todayKey;
    const status: RoadmapMilestone["status"] = isPast
      ? "completed"
      : !nextAssigned
      ? "next"
      : "upcoming";
    if (status === "next") nextAssigned = true;

    milestones.push({
      id: delta.id || delta.idempotencyKey || `${delta.deltaType}-${delta.activationMonth}`,
      year: yearFromMonthKey(delta.activationMonth),
      month: delta.activationMonth,
      label: labelForDelta(delta),
      effect: effectForDelta(delta),
      status,
      sourceTag: `scenarioDelta.${delta.deltaType}`,
    });
  }

  // 2. Terminal "Target FIRE" milestone — only when we can derive a year
  //    honestly. Requires both currentAge AND goal.targetFireAge.
  const hasEngineMilestones = milestones.length > 0;
  if (
    currentAge != null &&
    Number.isFinite(currentAge) &&
    goal &&
    goal.targetFireAge != null &&
    Number.isFinite(goal.targetFireAge) &&
    (goal.targetFireAge as number) >= currentAge
  ) {
    const fireYear =
      now.getFullYear() + Math.max(0, (goal.targetFireAge as number) - currentAge);
    milestones.push({
      id: "derived.fire-target",
      year: fireYear,
      month: `${fireYear}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      label: `Target FIRE at age ${goal.targetFireAge}`,
      effect: "Goal achieved if the projected path meets the FIRE number by this date.",
      status: "fire",
      sourceTag: "derived.fire-target",
    });
  }

  return {
    template,
    milestones,
    hasEngineMilestones,
    audit: {
      engineTemplateId: scenario.templateId,
      candidateId: winner.id,
      eventsConsidered: sortedEvents.length,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function yearFromMonthKey(mk: MonthKey): number {
  const y = parseInt(mk.split("-")[0] ?? "0", 10);
  return Number.isFinite(y) ? y : 0;
}

/** Plain-English label for a delta — pure mapping over `deltaType`. */
function labelForDelta(delta: ScenarioDelta): string {
  switch (delta.deltaType) {
    case "buy_property":              return "Acquire investment property";
    case "sell_property":             return "Sell property";
    case "property_deposit_boost":    return "Top up property deposit";
    case "etf_lump_sum":              return "ETF lump-sum investment";
    case "etf_dca":                   return "Start ETF dollar-cost averaging";
    case "offset_deposit":            return "Deposit to offset account";
    case "cash_hold":                 return "Hold cash";
    case "extra_mortgage_repayment":  return "Extra mortgage repayment";
    case "refinance":                 return "Refinance mortgage";
    case "rentvest":                  return "Rentvest restructure";
    case "crypto_lump_sum":           return "Crypto allocation";
    case "salary_change":             return "Salary change";
    case "career_break":              return "Career break";
    case "child_expense":             return "Child-related expense";
    case "early_retire":              return "Begin retirement drawdown";
    case "market_crash_stress":       return "Market crash stress event";
    case "interest_rate_spike":       return "Rate spike event";
    default:                          return "Plan event";
  }
}

/** Short effect blurb — pulls a number from params iff the engine provided it. */
function effectForDelta(delta: ScenarioDelta): string {
  const p = delta.params ?? {};
  const amount = pickNumber(p, ["amount", "deposit", "lumpSum", "monthlyAmount", "purchasePrice"]);
  switch (delta.deltaType) {
    case "buy_property":
      return amount != null
        ? `Engine-modelled purchase at $${fmt(amount)}.`
        : "Engine-modelled property acquisition.";
    case "etf_lump_sum":
      return amount != null
        ? `Engine-modelled lump-sum of $${fmt(amount)}.`
        : "Engine-modelled lump-sum ETF deployment.";
    case "etf_dca":
      return amount != null
        ? `Engine-modelled DCA at $${fmt(amount)}/month.`
        : "Engine-modelled ETF dollar-cost averaging.";
    case "offset_deposit":
      return amount != null
        ? `Engine-modelled offset deposit of $${fmt(amount)}.`
        : "Engine-modelled offset deposit.";
    case "extra_mortgage_repayment":
      return amount != null
        ? `Engine-modelled extra repayment of $${fmt(amount)}.`
        : "Engine-modelled extra mortgage repayment.";
    case "crypto_lump_sum":
      return amount != null
        ? `Engine-modelled crypto allocation of $${fmt(amount)} (clipped at 10%).`
        : "Engine-modelled crypto allocation.";
    case "refinance":
      return "Engine-modelled mortgage refinance.";
    default:
      return "Engine-modelled scenario delta.";
  }
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-AU");
  return n.toFixed(0);
}
