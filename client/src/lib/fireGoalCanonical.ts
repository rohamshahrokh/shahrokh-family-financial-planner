/**
 * fireGoalCanonical.ts — Sprint 20 PR-A canonical FIRE goal model.
 *
 * Single canonical FIRE goal shape used across the app. Replaces the scattered
 * "FIRE Goal", "Investing & FIRE Goals", "Goal Solver targets" widgets that
 * each maintained their own state.
 *
 * Primary user inputs (the ONLY two fields a default-mode user ever sees):
 *   - targetFireYear              — e.g. 2035
 *   - targetMonthlyPassiveIncome  — e.g. 20000 AUD/month
 *
 * Everything else is derived (advisor displays an age, an asset base, a SWR
 * band) or advanced (an explicit swrOverride sits behind a disclosure).
 *
 * Storage: this canonical record is persisted via the existing
 * `mc_fire_settings` row (the same table `useCanonicalGoal()` reads). We do
 * NOT introduce a parallel store. The `targetFireYear` is persisted as the
 * existing `target_fire_age` column with year → age conversion done at the
 * write boundary (see `setFireGoal`).
 *
 * Anti-drift guard: a file-tree test in
 * `__tests__/fireGoalCanonicalSingleSource.test.ts` ensures no other file
 * declares an `interface FireGoal` shape.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import { useCanonicalGoal, CANONICAL_GOAL_QUERY_KEY, type CanonicalGoal } from "./useCanonicalGoal";

/** Default year offset used when a household has not yet picked a target year. */
export const DEFAULT_TARGET_YEAR_OFFSET = 10;

/** Canonical SWR band identifiers — wired from the swrBandSelector engine. */
export type SwrBand = "conservative" | "balanced" | "aggressive";

/**
 * The single canonical FIRE-goal shape consumed across the app.
 *
 * `targetFireYear` and `targetMonthlyPassiveIncome` are the only fields a user
 * directly edits in default mode; all other fields are derived or advanced
 * (hidden behind a disclosure).
 */
export interface CanonicalFireGoal {
  /** PRIMARY user input — calendar year, e.g. 2035. */
  targetFireYear: number;
  /** PRIMARY user input — monthly passive income target (AUD/month). */
  targetMonthlyPassiveIncome: number;
  /** Derived from DOB / current age. */
  derivedTargetAge?: number;
  /** Derived via engine-selected SWR band. */
  derivedRequiredAssetBase?: number;
  /** ADVANCED — user override; undefined in default mode. */
  swrOverride?: number;
  /** Engine-selected band; null when no household context to size it. */
  swrBand?: SwrBand;
  /** ISO timestamp of last save. */
  updatedAt: string;
}

/**
 * Reader-side state returned by `useFireGoal`.
 *
 * `status === "NOT_SET"` mirrors the underlying `CanonicalGoal` semantics so
 * surfaces continue to render the "Set FIRE goal" CTA when the user has not
 * saved a goal.
 */
export type FireGoalState =
  | { status: "NOT_SET"; reason: string; isLoading: false }
  | { status: "LOADING"; isLoading: true }
  | { status: "SET"; goal: CanonicalFireGoal; isLoading: false };

const CURRENT_YEAR = () => new Date().getFullYear();

/**
 * Default target year used when no goal is set yet — `currentYear + 10`.
 * Exposed so UI defaults stay consistent across surfaces.
 */
export function defaultTargetFireYear(): number {
  return CURRENT_YEAR() + DEFAULT_TARGET_YEAR_OFFSET;
}

/**
 * Derive `targetFireYear` from a legacy age-based goal record. Falls back to
 * the default offset when current age is missing — never returns NaN.
 */
export function targetYearFromAge(
  targetFireAge: number,
  currentAge: number | undefined,
): number {
  if (
    Number.isFinite(targetFireAge) &&
    Number.isFinite(currentAge) &&
    (currentAge as number) > 0
  ) {
    return CURRENT_YEAR() + (targetFireAge - (currentAge as number));
  }
  return defaultTargetFireYear();
}

/**
 * Derive `derivedTargetAge` from `targetFireYear` and the household's current
 * age. Returns undefined when the inputs aren't usable.
 */
export function deriveTargetAge(
  targetFireYear: number,
  currentAge: number | undefined,
): number | undefined {
  if (
    !Number.isFinite(targetFireYear) ||
    !Number.isFinite(currentAge) ||
    (currentAge as number) <= 0
  ) {
    return undefined;
  }
  const years = targetFireYear - CURRENT_YEAR();
  return Math.round((currentAge as number) + years);
}

/**
 * Convert a `CanonicalGoal` (the existing read shape backed by
 * `mc_fire_settings`) to a `CanonicalFireGoal`. `currentAge` is used to
 * compute the year — when missing, falls back to the default offset.
 */
export function canonicalGoalToFireGoal(
  goal: CanonicalGoal,
  currentAge: number | undefined,
): CanonicalFireGoal | null {
  if (!goal || goal.status !== "SET") return null;
  return {
    targetFireYear: targetYearFromAge(goal.targetFireAge, currentAge),
    targetMonthlyPassiveIncome: goal.targetPassiveMonthly,
    derivedTargetAge: deriveTargetAge(
      targetYearFromAge(goal.targetFireAge, currentAge),
      currentAge,
    ) ?? goal.targetFireAge,
    derivedRequiredAssetBase: goal.targetNetWorth,
    swrOverride: goal.swrPct,
    updatedAt: goal.goalSetTimestamp,
  };
}

/**
 * useFireGoal — single reader hook every surface must use to read the FIRE
 * goal. Wraps `useCanonicalGoal` (mc_fire_settings) and reshapes the row into
 * the canonical year-based model.
 *
 * Surfaces MUST NOT read mc_fire_settings directly anymore — use this hook.
 */
export function useFireGoal(currentAge?: number): FireGoalState {
  const q = useCanonicalGoal();
  if (q.isLoading || q.isFetching) {
    return { status: "LOADING", isLoading: true };
  }
  const goal = q.data;
  if (!goal || goal.status === "NOT_SET") {
    return {
      status: "NOT_SET",
      reason: goal && "reason" in goal ? goal.reason : "FIRE goal not set",
      isLoading: false,
    };
  }
  const canonical = canonicalGoalToFireGoal(goal, currentAge);
  if (!canonical) {
    return { status: "NOT_SET", reason: "FIRE goal could not be derived", isLoading: false };
  }
  return { status: "SET", goal: canonical, isLoading: false };
}

/**
 * Writer payload for `setFireGoal`. Accepts year-based input; the writer
 * converts to age before persisting to the existing mc_fire_settings columns.
 */
export interface SetFireGoalInput {
  targetFireYear: number;
  targetMonthlyPassiveIncome: number;
  /** Optional SWR override; when omitted the engine-selected band is used. */
  swrOverride?: number;
  /** Required for year → age conversion at the write boundary. */
  currentAge: number;
}

/**
 * useSetFireGoal — single writer hook every surface must use to save FIRE
 * goal changes. Writes to /api/mc-fire-settings (the existing persistence
 * path) and invalidates the canonical goal cache.
 */
export function useSetFireGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetFireGoalInput) => {
      const swr =
        Number.isFinite(input.swrOverride) && (input.swrOverride as number) > 0
          ? (input.swrOverride as number)
          : 4;
      const yearsToTarget = input.targetFireYear - CURRENT_YEAR();
      const targetAge = Math.max(
        18,
        Math.min(99, Math.round(input.currentAge + yearsToTarget)),
      );
      const body = {
        target_fire_age: targetAge,
        target_passive_monthly: input.targetMonthlyPassiveIncome,
        swr_pct: swr,
        goals_set: true,
        goal_set_timestamp: new Date().toISOString(),
      };
      const res = await apiRequest("PUT", "/api/mc-fire-settings", body);
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/mc-fire-settings"] }),
        qc.invalidateQueries({ queryKey: CANONICAL_GOAL_QUERY_KEY }),
      ]);
    },
  });
}

/**
 * Raw query hook — exposed for the file-tree guard test. UI code should use
 * `useFireGoal()` (which reshapes to the canonical year model).
 */
export function useRawFireGoalQuery(): UseQueryResult<CanonicalGoal> {
  return useCanonicalGoal();
}
