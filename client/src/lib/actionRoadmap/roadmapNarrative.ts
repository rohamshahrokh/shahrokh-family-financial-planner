/**
 * actionRoadmap/roadmapNarrative.ts — Sprint 27.
 *
 * Pure-text composer that translates engine outputs into plain English for
 * the Action Roadmap panel. **NO FINANCIAL MATH HERE.** Every numeric value
 * comes from `PathCompletion` (already engine-derived) or from the engine's
 * own `comparativeNarrative.whyWon[]` / `rationale[]` arrays.
 *
 * Honesty rules:
 *   - Never fabricate a probability. If the engine did not produce one, we
 *     do NOT include a "P50 = N%" line.
 *   - Never fabricate a year, age, or dollar amount. If a field on
 *     `PathCompletion` is null, the related sentence is dropped.
 *   - When EVERY usable input is missing → headline = "Not modelled yet."
 */

import type { GoalLabRankedScenario } from "../goalLab/orchestrator";
import type {
  ActionRoadmap,
  PathCompletion,
  RoadmapRiskSummary,
} from "./types";

// ─── Public types ──────────────────────────────────────────────────────────

export interface RoadmapNarrative {
  /** One-line summary surfaced at the top of the panel. */
  headline: string;
  /** Bullet list under the headline (3–5 entries when possible). */
  bullets: string[];
  /** "Why this path?" — engine's rationale, untouched. */
  whyThisPath: string[];
  /** "What would invalidate this plan" — engine's invalidation triggers, untouched. */
  whatCouldInvalidate: string[];
  /** Trace: every entry above tied to its source field for audit mode. */
  audit: {
    headlineSource: "path_completion" | "fallback_not_modelled";
    rationaleSourceCount: number;
    invalidationSourceCount: number;
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export function buildRoadmapNarrative(
  scenario: GoalLabRankedScenario | null,
  roadmap: ActionRoadmap | null,
  completion: PathCompletion,
  risk: RoadmapRiskSummary,
): RoadmapNarrative {
  const winner = scenario?.winner ?? null;

  // ── Headline ────────────────────────────────────────────────────────────
  let headline = "Not modelled yet.";
  let headlineSource: RoadmapNarrative["audit"]["headlineSource"] = "fallback_not_modelled";

  // Partial-engine-output case: status is NOT_MODELLED (typically because the
  // canonical FIRE number is unset on the goal) but the engine DID produce a
  // real terminal net worth on this path. We surface a neutral, factual
  // headline anchored to the engine value — never a probability or success
  // claim — so the panel doesn't contradict the bullets below.
  if (completion.status === "NOT_MODELLED" && completion.expectedNetWorth != null) {
    headlineSource = "path_completion";
    headline = `Engine projects median net worth of $${fmt(completion.expectedNetWorth)} at horizon end. FIRE comparison not modelled — set a FIRE target to evaluate completion.`;
  } else if (completion.status !== "NOT_MODELLED") {
    headlineSource = "path_completion";
    if (completion.status === "ON_TRACK") {
      const age = completion.expectedFireAge;
      if (age != null) headline = `On track to reach FIRE around age ${age}.`;
      else headline = "On track to reach FIRE within the modelled horizon.";
    } else if (completion.status === "ON_TARGET_LATE") {
      const late = completion.yearsEarlyOrLate;
      if (late != null && late < 0)
        headline = `Reaches FIRE roughly ${Math.abs(late)} year${Math.abs(late) === 1 ? "" : "s"} later than your target.`;
      else headline = "Reaches FIRE later than your target age.";
    } else if (completion.status === "GAP_REMAINING") {
      const gap = completion.gapRemaining;
      if (gap != null && Number.isFinite(gap) && gap > 0)
        headline = `Median trajectory falls short by about $${fmt(gap)} at the end of the horizon.`;
      else headline = "Median trajectory does not reach the FIRE number within the horizon.";
    }
  }

  // ── Bullets ─────────────────────────────────────────────────────────────
  const bullets: string[] = [];

  if (completion.expectedNetWorth != null) {
    if (completion.expectedNetWorthRange) {
      bullets.push(
        `Projected median net worth at horizon end: $${fmt(completion.expectedNetWorth)} (P25–P75 range $${fmt(completion.expectedNetWorthRange.p25)}–$${fmt(completion.expectedNetWorthRange.p75)}).`,
      );
    } else {
      bullets.push(`Projected median net worth at horizon end: $${fmt(completion.expectedNetWorth)}.`);
    }
  }

  if (completion.expectedMonthlyPassiveIncome != null && completion.audit.swrPctUsed != null) {
    bullets.push(
      `Implied monthly passive income at ${completion.audit.swrPctUsed}% SWR: $${fmt(completion.expectedMonthlyPassiveIncome)}.`,
    );
  }

  if (completion.goalAchievementFraction != null) {
    bullets.push(`Goal coverage: ${Math.round(completion.goalAchievementFraction * 100)}% of the FIRE number.`);
  }

  if (risk.overall !== "unknown") {
    bullets.push(`Overall risk band across the five axes: ${risk.overall}.`);
  }

  if (roadmap && roadmap.hasEngineMilestones) {
    const eng = roadmap.audit.eventsConsidered;
    bullets.push(`${eng} engine-modelled milestone${eng === 1 ? "" : "s"} on this path.`);
  }

  // Engine probability — ONLY included when actually present.
  if (scenario?.probabilityP50 != null && Number.isFinite(scenario.probabilityP50)) {
    bullets.push(`Engine probability of feasibility (P50): ${Math.round((scenario.probabilityP50 as number) * 100)}%.`);
  }

  // ── Why this path (engine rationale, untouched) ─────────────────────────
  const whyThisPath: string[] = [];
  if (winner?.rationale && winner.rationale.length > 0) {
    for (const line of winner.rationale) {
      if (typeof line === "string" && line.trim().length > 0) whyThisPath.push(line.trim());
    }
  }
  // Fall back to engine's comparativeNarrative.whyWon when the candidate's
  // own rationale array is empty.
  if (whyThisPath.length === 0 && scenario?.raw?.comparativeNarrative?.whyWon) {
    for (const line of scenario.raw.comparativeNarrative.whyWon) {
      if (typeof line === "string" && line.trim().length > 0) whyThisPath.push(line.trim());
    }
  }

  // ── What could invalidate (engine output, untouched) ───────────────────
  const whatCouldInvalidate: string[] = [];
  if (scenario?.raw?.comparativeNarrative?.whatCouldInvalidate) {
    for (const line of scenario.raw.comparativeNarrative.whatCouldInvalidate) {
      if (typeof line === "string" && line.trim().length > 0) whatCouldInvalidate.push(line.trim());
    }
  }

  return {
    headline,
    bullets,
    whyThisPath,
    whatCouldInvalidate,
    audit: {
      headlineSource,
      rationaleSourceCount: whyThisPath.length,
      invalidationSourceCount: whatCouldInvalidate.length,
    },
  };
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-AU");
}
