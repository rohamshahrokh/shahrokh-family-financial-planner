/**
 * actionRoadmap/types.ts — Sprint 27.
 *
 * Shared type definitions for the Action Roadmap orchestration layer.
 *
 * IMPORTANT: This module performs NO financial math. Every field traces back
 * to engine output produced by `runGoalLabPlan` (which itself wraps
 * `generateQuickDecisionCandidates` + `runScenarioV2`). The roadmap layer is
 * pure selection, classification, and narrative — no new engine, no parallel
 * forecast, no Monte Carlo re-runs.
 *
 * Brief honesty rules (verbatim, enforced module-wide):
 *   - Never fabricate probability, success rate, MC outputs, scenario confidence
 *   - When a value is unavailable: status field carries the cause; numeric
 *     fields stay null. UI must render "Not modelled yet" — never 0% / 0 years.
 */

// ─── Roadmap templates (display metadata) ──────────────────────────────────

/**
 * Display template id matching the Sprint 27 brief's six named paths. These
 * are PURELY metadata for the UI — they map an engine `templateId`
 * (scenarioTemplates.ts) into a user-friendly name + description. The
 * underlying scenarios still come from the engine.
 */
export type RoadmapTemplateId =
  | "PROPERTY_PATH"
  | "ETF_PATH"
  | "HYBRID_PATH"
  | "DEBT_REDUCTION_PATH"
  | "OFFSET_FIRST_PATH"
  | "SUPER_ACCELERATION_PATH"
  | "CUSTOM_PATH";

export interface RoadmapTemplate {
  id: RoadmapTemplateId;
  label: string;
  /** One-line user-facing description. */
  promise: string;
  /** What types of milestones this template typically produces. */
  milestoneShape: string;
}

// ─── Milestones (built from RankedCandidate.events) ────────────────────────

/**
 * One step inside the roadmap. Comes from a `ScenarioDelta` (engine input)
 * activation-month + a friendly label. Dates are derived from the engine's
 * MonthKey (e.g. "2026-04"); we never invent a date the engine did not pick.
 */
export interface RoadmapMilestone {
  /** Stable id for React keying. Derived from the underlying ScenarioDelta. */
  id: string;
  /** Calendar year of the activation month (e.g. 2026). */
  year: number;
  /** ISO month key from the engine ("YYYY-MM"). */
  month: string;
  /** One-line plain-English label. */
  label: string;
  /** Short user-facing summary of the effect. */
  effect: string;
  /**
   * Status — controls the bullet icon in the UI.
   *   "completed"  → action is in the past (activation month < today)
   *   "next"       → next upcoming milestone
   *   "upcoming"   → future milestone after the next one
   *   "fire"       → the special "Target FIRE" terminal milestone
   */
  status: "completed" | "next" | "upcoming" | "fire";
  /**
   * Source-trace label so audit mode can render where this milestone came
   * from (e.g. `scenarioDelta.buy_property` or `derived.fire-target`).
   */
  sourceTag: string;
}

// ─── Path completion ───────────────────────────────────────────────────────

export type PathCompletionStatus =
  /** ExpectedFireAge ≤ TargetFireAge AND ExpectedNW ≥ FireNumber. */
  | "ON_TRACK"
  /** ExpectedNW ≥ FireNumber but ExpectedFireAge > TargetFireAge. */
  | "ON_TARGET_LATE"
  /** ExpectedNW < FireNumber by horizon end. */
  | "GAP_REMAINING"
  /** Engine output missing or fan empty — UI shows "Not modelled yet". */
  | "NOT_MODELLED";

/**
 * Output of `pathCompletionEngine.computePathCompletion()`. Every numeric
 * field is nullable: when the source data is missing, we surface `null` and
 * `status: NOT_MODELLED` — never a fake number.
 */
export interface PathCompletion {
  status: PathCompletionStatus;
  /** Median trajectory crossing — null when never crosses OR fan empty. */
  expectedFireAge: number | null;
  /** Goal's target FIRE age (passed through from CanonicalGoal). */
  targetFireAge: number | null;
  /** Median terminal NW from result.netWorthFan[H].p50, null if fan empty. */
  expectedNetWorth: number | null;
  /** P25–P75 interquartile band on terminal NW for "show range" UI. */
  expectedNetWorthRange: { p25: number; p75: number } | null;
  /** Implied annual passive income = expectedNW × swr/100. Null on missing inputs. */
  expectedAnnualPassiveIncome: number | null;
  /** Monthly version of above. */
  expectedMonthlyPassiveIncome: number | null;
  /** Pure ratio min(1, expectedNW/fireNumber). Null when fireNumber missing. */
  goalAchievementFraction: number | null;
  /** +N => ahead by N years; -N => late. Null when ages missing. */
  yearsEarlyOrLate: number | null;
  /** Dollar gap = max(0, fireNumber - expectedNW). Null when either missing. */
  gapRemaining: number | null;
  /**
   * Why bullets. Each entry is a short user-facing string explaining the
   * status. No probabilities are cited unless the engine produced one.
   */
  why: string[];
  /** Audit trace: which engine fields fed which output number. */
  audit: {
    fanPointsConsidered: number;
    fireNumberSource: "user_target" | "monthly_expenses_fallback" | "empty" | "missing";
    swrPctUsed: number | null;
  };
}

// ─── Risk classification ───────────────────────────────────────────────────

export type RiskBand = "low" | "medium" | "high" | "unknown";

/**
 * Five risk axes from the brief. Each axis carries:
 *   - band: classification (low/medium/high) — null when input data missing
 *   - driver: which engine metric drove the band (audit trail)
 *   - detail: plain-English explanation
 */
export interface RoadmapRiskAxis {
  axis:
    | "liquidity"
    | "leverage"
    | "cashflow"
    | "concentration"
    | "execution";
  label: string;
  band: RiskBand;
  driver: string;
  detail: string;
}

export interface RoadmapRiskSummary {
  axes: RoadmapRiskAxis[];
  /** Overall band: max of the five axes, with "unknown" surfaced separately. */
  overall: RiskBand;
  /** Bullet list of the engine's softWarnings that materially contribute. */
  warnings: string[];
}

// ─── Top container ─────────────────────────────────────────────────────────

/**
 * Full Action Roadmap object — what the UI panel consumes. Built by
 * `actionRoadmapBuilder.buildActionRoadmap()`.
 */
export interface ActionRoadmap {
  /** Display template chosen by mapping engine templateId → RoadmapTemplate. */
  template: RoadmapTemplate;
  /** Ordered list of milestones. Always includes a terminal "Target FIRE". */
  milestones: RoadmapMilestone[];
  /** True when at least one engine-derived milestone exists. */
  hasEngineMilestones: boolean;
  /** Engine source ids for audit. */
  audit: {
    engineTemplateId: string;
    candidateId: string;
    eventsConsidered: number;
  };
}
