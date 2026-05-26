/**
 * recommendationGate.ts — Sprint 13 P0-2.
 *
 * Pre-render gate that prevents Portfolio Lab from showing rankings, best-of
 * picks, action plans or recommendation cards when the upstream engines are
 * missing any of the metrics required to make those statements credible.
 *
 * Rules:
 *   A strategy / recommendation is "complete" only if ALL of:
 *     - fireYear
 *     - confidence
 *     - requiredContribution
 *     - requiredAssetBase
 *     - requiredPassiveIncome
 *   are present (not null / undefined / NaN).
 *
 *   If ANY recommendation is missing ANY of those, the entire surface is
 *   blocked — no partial render, no greyed-out card, no chip.
 *
 * Consumers render `RECOMMENDATION_UNAVAILABLE_TEXT` in place of the data.
 */

export interface GateableStrategy {
  /** FIRE year (number or null). Null/undefined/NaN → missing. */
  fireYear?: number | null;
  /** Confidence / robust score (0..1 or 0..100). Null/undefined/NaN → missing. */
  confidence?: number | null;
  /** Required monthly contribution. */
  requiredContribution?: number | null;
  /** Required asset base. */
  requiredAssetBase?: number | null;
  /** Required passive income (annual). */
  requiredPassiveIncome?: number | null;
}

export type StrategyCompletenessField =
  | "fireYear"
  | "confidence"
  | "requiredContribution"
  | "requiredAssetBase"
  | "requiredPassiveIncome";

const REQUIRED_FIELDS: StrategyCompletenessField[] = [
  "fireYear",
  "confidence",
  "requiredContribution",
  "requiredAssetBase",
  "requiredPassiveIncome",
];

const isMissing = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  return false;
};

/**
 * Pure predicate. Use in tests and in scenario filters.
 */
export function isStrategyComplete(s: GateableStrategy | null | undefined): boolean {
  if (s == null) return false;
  return REQUIRED_FIELDS.every((f) => !isMissing(s[f]));
}

/**
 * Return the list of missing fields for an individual strategy. Useful for
 * the audit panel and verification reports.
 */
export function missingStrategyFields(
  s: GateableStrategy | null | undefined,
): StrategyCompletenessField[] {
  if (s == null) return [...REQUIRED_FIELDS];
  return REQUIRED_FIELDS.filter((f) => isMissing(s[f]));
}

export interface GateResult<T> {
  ok: boolean;
  /** When ok=true, the full list of recommendations passed through. */
  recs: T[];
  /** Why the gate blocked, when ok=false. */
  reason: string;
  /**
   * Per-rec missing fields (when ok=false). Index aligns with input list.
   * Renderable as part of the audit overlay.
   */
  missingByIndex: StrategyCompletenessField[][];
}

/**
 * Apply the gate.
 *
 * If EVERY recommendation is complete → ok=true and recs are returned as-is.
 * If ANY recommendation is incomplete → ok=false and recs is the empty
 * array (the UI must render the sentinel and MUST NOT iterate the input).
 */
export function gateRecommendations<T extends GateableStrategy>(
  recs: T[] | null | undefined,
): GateResult<T> {
  const list = Array.isArray(recs) ? recs : [];
  if (list.length === 0) {
    return {
      ok: false,
      recs: [],
      reason:
        "No recommendations available — engine produced no candidates.",
      missingByIndex: [],
    };
  }
  const missingByIndex = list.map(missingStrategyFields);
  const anyIncomplete = missingByIndex.some((m) => m.length > 0);
  if (anyIncomplete) {
    const uniqueFields = Array.from(
      new Set(missingByIndex.flat()),
    ).sort();
    return {
      ok: false,
      recs: [],
      reason: `Incomplete engine outputs: missing ${uniqueFields.join(", ")}`,
      missingByIndex,
    };
  }
  return {
    ok: true,
    recs: list,
    reason: "",
    missingByIndex,
  };
}

/** Sentinel rendered in place of any blocked surface. */
export const RECOMMENDATION_UNAVAILABLE_TEXT =
  "Recommendation unavailable due to incomplete engine outputs.";

/**
 * Project a `Recommendation` from truePortfolioOptimizer (whose metrics are
 * ScenarioMetric { value, ... }) into the gateable shape this module checks.
 */
export function projectRecommendationForGate(rec: {
  metrics: {
    fireYear: { value: number | null };
    confidenceScore: { value: number | null };
    requiredMonthlyContribution: { value: number | null };
    requiredAssetBase: { value: number | null };
    projectedPassiveIncome: { value: number | null };
  };
}): GateableStrategy {
  return {
    fireYear: rec.metrics.fireYear?.value ?? null,
    confidence: rec.metrics.confidenceScore?.value ?? null,
    requiredContribution: rec.metrics.requiredMonthlyContribution?.value ?? null,
    requiredAssetBase: rec.metrics.requiredAssetBase?.value ?? null,
    requiredPassiveIncome: rec.metrics.projectedPassiveIncome?.value ?? null,
  };
}
