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

    // Sprint 29 §5 — every milestone carries the recommended templateId so
    // the final purity filter can reject any cross-template stowaways.
    const milestoneTemplateId =
      (delta as unknown as { templateId?: string }).templateId
        ?? (delta as unknown as { sourceTemplateId?: string }).sourceTemplateId
        ?? scenario.templateId;

    milestones.push({
      id: delta.id || delta.idempotencyKey || `${delta.deltaType}-${delta.activationMonth}`,
      year: yearFromMonthKey(delta.activationMonth),
      month: delta.activationMonth,
      label: labelForDelta(delta, scenario.templateId, todayKey),
      effect: effectForDelta(delta, scenario.templateId),
      status,
      sourceTag: `scenarioDelta.${delta.deltaType}`,
      sourceTemplateId: milestoneTemplateId,
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
      sourceTemplateId: scenario.templateId,
    });
  }

  // Sprint 29 §5 — single-path purity filter. Reject any milestone whose
  // sourceTemplateId doesn't match the recommended template and record the
  // rejection in warnings so the audit panel can surface the drift.
  const warnings: string[] = [];
  const purified: RoadmapMilestone[] = [];
  for (const m of milestones) {
    if (m.sourceTemplateId === scenario.templateId) {
      purified.push(m);
    } else {
      warnings.push(
        `Filtered cross-template milestone: ${m.label} (sourceTemplateId=${m.sourceTemplateId}, recommended=${scenario.templateId})`,
      );
    }
  }

  return {
    template,
    milestones: purified,
    hasEngineMilestones: purified.some((m) => m.status !== "fire"),
    audit: {
      engineTemplateId: scenario.templateId,
      candidateId: winner.id,
      eventsConsidered: sortedEvents.length,
    },
    warnings,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function yearFromMonthKey(mk: MonthKey): number {
  const y = parseInt(mk.split("-")[0] ?? "0", 10);
  return Number.isFinite(y) ? y : 0;
}

/**
 * Plain-English label for a delta.
 *
 * FWL-079: `property_deposit_boost` deltas are emitted by the candidate
 * generator both as PRIMARY property purchases (the deposit-boost translator
 * doubles as the buy-property emitter — see `lib/scenarioV2/deltas.ts:29-31`)
 * AND as genuine deposit top-ups inside multi-IP-ladder strategies. The
 * literal "Top up property deposit" label only makes sense for the genuine
 * top-up case. For primary purchases the label must describe what the user
 * actually does: acquire an investment property, optionally with the
 * activation-month wait baked in for delayed-purchase templates.
 */
function labelForDelta(
  delta: ScenarioDelta,
  recommendedTemplateId?: string,
  todayKey?: string,
): string {
  switch (delta.deltaType) {
    case "buy_property":              return "Acquire investment property";
    case "sell_property":             return "Sell property";
    case "property_deposit_boost":    return labelForPropertyDepositBoost(delta, recommendedTemplateId, todayKey);
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

/**
 * Classify a `property_deposit_boost` delta by the suffix the candidate
 * generator encodes in the delta id (`${candidateId}_${suffix}`):
 *
 *   • `_ip`            primary IP purchase (`buy-ip-now`, `delay-ip`,
 *                      `hybrid-property-etf`, `multi-property-ladder` first IP)
 *   • `_ipfollow`      IP after an offset-buffer phase (`offset_then_ip`)
 *   • `_ipfromequity`  IP funded by an equity-release refi (`equity_release_ip`)
 *   • `_ip2`           second IP in `multi_ip_ladder`
 *
 * Anything else is treated as a genuine deposit top-up and keeps the original
 * literal label.
 */
function propertyDepositBoostRole(
  delta: ScenarioDelta,
): "primary" | "sequential" | "equity-funded" | "secondary" | "topup" {
  const id = delta.id ?? "";
  if (id.endsWith("_ip2"))           return "secondary";
  if (id.endsWith("_ipfromequity"))  return "equity-funded";
  if (id.endsWith("_ipfollow"))      return "sequential";
  if (id.endsWith("_ip"))            return "primary";
  return "topup";
}

function labelForPropertyDepositBoost(
  delta: ScenarioDelta,
  recommendedTemplateId?: string,
  todayKey?: string,
): string {
  const role = propertyDepositBoostRole(delta);
  // For primary purchases on the recommended path, compute the activation-month
  // gap so the user sees "Acquire investment property in 6 months" rather than
  // a flat label that loses the timing axis of the chosen template.
  if (role === "primary") {
    const monthsAhead = monthsBetweenKeys(todayKey, delta.activationMonth);
    if (monthsAhead != null && monthsAhead >= 1) {
      const phrase = monthsAhead === 1
        ? "in 1 month"
        : monthsAhead < 12
        ? `in ${monthsAhead} months`
        : monthsAhead === 12
        ? "in 12 months"
        : `in ${Math.round(monthsAhead / 12 * 10) / 10} years`;
      return `Acquire investment property ${phrase}`;
    }
    return "Acquire investment property";
  }
  if (role === "sequential")     return "Acquire investment property (after offset buffer)";
  if (role === "equity-funded")  return "Acquire investment property (equity-funded)";
  if (role === "secondary")      return "Acquire second investment property (equity-funded)";
  // Genuine deposit-top-up case — keep the original literal so the multi-IP
  // ladder's mid-phase top-ups still read truthfully.
  void recommendedTemplateId;
  return "Top up property deposit";
}

function monthsBetweenKeys(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const pa = a.split("-").map((n) => parseInt(n, 10));
  const pb = b.split("-").map((n) => parseInt(n, 10));
  if (pa.length < 2 || pb.length < 2) return null;
  if (!pa.every(Number.isFinite) || !pb.every(Number.isFinite)) return null;
  return (pb[0]! - pa[0]!) * 12 + (pb[1]! - pa[1]!);
}

/** Short effect blurb — pulls a number from params iff the engine provided it. */
function effectForDelta(delta: ScenarioDelta, _recommendedTemplateId?: string): string {
  const p = delta.params ?? {};
  const amount = pickNumber(p, ["amount", "deposit", "lumpSum", "monthlyAmount", "purchasePrice"]);
  switch (delta.deltaType) {
    case "buy_property":
      return amount != null
        ? `Engine-modelled purchase at $${fmt(amount)}.`
        : "Engine-modelled property acquisition.";
    case "property_deposit_boost": {
      // FWL-079: when the deposit-boost stands in for a primary purchase, the
      // user-facing effect must describe the purchase, not the deposit alone.
      const role = propertyDepositBoostRole(delta);
      const price = pickNumber(p, ["purchasePrice"]);
      const deposit = pickNumber(p, ["extraDeposit", "deposit"]);
      if (role === "primary" || role === "sequential" || role === "equity-funded" || role === "secondary") {
        if (price != null && deposit != null) {
          return `Engine-modelled purchase at $${fmt(price)} with $${fmt(deposit)} deposit.`;
        }
        if (price != null) return `Engine-modelled purchase at $${fmt(price)}.`;
        if (deposit != null) return `Engine-modelled purchase using $${fmt(deposit)} deposit.`;
        return "Engine-modelled property acquisition.";
      }
      // Genuine top-up case — keep the deposit-centric phrasing.
      return deposit != null
        ? `Engine-modelled additional deposit of $${fmt(deposit)}.`
        : "Engine-modelled deposit top-up.";
    }
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
