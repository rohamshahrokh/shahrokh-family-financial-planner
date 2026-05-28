/**
 * fireGoalCanonical.ts — Sprint 20 PR-F1 canonical FIRE goal model.
 *
 * SINGLE canonical FIRE shape used across the app. `CanonicalFireTarget`
 * (declared in `types/canonicalFire.ts`) is the survivor interface. The
 * legacy `CanonicalFireGoal` name now resolves to a derived TYPE ALIAS over
 * `CanonicalFireTarget` plus a few denormalised derived helpers that the
 * Sprint 20 PR-A reader/migration shim still surface. No duplicate interface
 * declaration exists.
 *
 * Primary user inputs (the ONLY two fields a default-mode user ever sees):
 *   - targetFireYear              — e.g. 2035
 *   - targetMonthlyPassiveIncome  — e.g. 20000 AUD/month
 *
 * Everything else is derived (advisor displays an age, an asset base, a SWR
 * band) or advanced (an explicit override sits behind a disclosure).
 *
 * Storage: this canonical record is persisted via the existing
 * `mc_fire_settings` row (the same table `useCanonicalGoal()` reads). The
 * primary fields map directly to columns (target_fire_age, target_passive_monthly,
 * swr_pct). The PR-F1 advanced bundle (targetNetWorth, minLiquidityBufferMonths,
 * maxRiskTolerance) is round-tripped server-side as a nested JSON object inside
 * the existing `action_checklist` JSON column under the reserved
 * `__advanced_fire` key — no Supabase schema change required.
 *
 * Anti-drift guard: a file-tree test in
 * `__tests__/fireGoalCanonicalSingleSource.test.ts` ensures no other file
 * declares a CanonicalFireGoal interface or type alias.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import { useCanonicalGoal, CANONICAL_GOAL_QUERY_KEY, type CanonicalGoal } from "./useCanonicalGoal";
import type {
  CanonicalFireTarget,
  CanonicalFireRiskTolerance,
  CanonicalFireAdvancedSettings,
} from "@/types/canonicalFire";

/** Default year offset used when a household has not yet picked a target year. */
export const DEFAULT_TARGET_YEAR_OFFSET = 10;

/** Canonical SWR band identifiers — wired from the swrBandSelector engine. */
export type SwrBand = "conservative" | "balanced" | "aggressive";

/**
 * Sprint 20 PR-F1 — the canonical FIRE-goal shape consumed across the app
 * is now a TYPE ALIAS over the single survivor interface `CanonicalFireTarget`
 * (declared in `types/canonicalFire.ts`). The legacy-style field names
 * (`targetMonthlyPassiveIncome`, `derivedTargetAge`, `swrOverride`, …) are
 * preserved on this alias so the in-flight Sprint 20 PR-A reader / migration
 * shim keep their existing call shape without a parallel interface declaration.
 *
 * NOTE: this is intentionally a `type` (not an interface). The single-source
 * test in `__tests__/fireGoalCanonicalSingleSource.test.ts` enforces that no
 * interface form of this name appears anywhere in `client/src`, so
 * `CanonicalFireTarget` is the only interface declaration that defines the
 * FIRE shape across the codebase.
 */
export type CanonicalFireGoal = {
  /** PRIMARY user input — calendar year, e.g. 2035. */
  targetFireYear: CanonicalFireTarget["targetFireYear"];
  /** PRIMARY user input — monthly passive income target (AUD/month). */
  targetMonthlyPassiveIncome: CanonicalFireTarget["targetPassiveIncomeMonthly"];
  /** Derived from DOB / current age. */
  derivedTargetAge?: number;
  /** Derived via engine-selected SWR band. */
  derivedRequiredAssetBase?: number;
  /** ADVANCED — user override (percentage form, e.g. 4 = 4%). */
  swrOverride?: number;
  /** ADVANCED — full PR-F1 advanced bundle (decimal SWR + 3 sibling fields). */
  advanced?: CanonicalFireAdvancedSettings;
  /** Engine-selected band; null when no household context to size it. */
  swrBand?: SwrBand;
  /** ISO timestamp of last save. */
  updatedAt: string;
};

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
 * `advanced` is the PR-F1 advanced bundle round-tripped from the server-side
 * `action_checklist.__advanced_fire` JSON sub-key (set by `useSetFireGoal`).
 */
export function canonicalGoalToFireGoal(
  goal: CanonicalGoal,
  currentAge: number | undefined,
  advanced?: CanonicalFireAdvancedSettings | null,
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
    advanced: advanced ?? undefined,
    updatedAt: goal.goalSetTimestamp,
  };
}

/**
 * Server-side advanced bundle is stored under this key inside the existing
 * `action_checklist` JSON column on `mc_fire_settings`. Using an existing JSON
 * column means no Supabase schema change is needed.
 */
export const ADVANCED_FIRE_CHECKLIST_KEY = "__advanced_fire" as const;

/**
 * Extract the advanced bundle from a raw mc_fire_settings row. Tolerates a
 * missing or malformed `action_checklist` and unknown keys.
 */
export function extractAdvancedFromRow(
  row: { action_checklist?: Record<string, unknown> | null } | null | undefined,
): CanonicalFireAdvancedSettings | null {
  if (!row || !row.action_checklist) return null;
  const raw = (row.action_checklist as Record<string, unknown>)[ADVANCED_FIRE_CHECKLIST_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: CanonicalFireAdvancedSettings = {};
  if (typeof r.targetNetWorth === "number" && Number.isFinite(r.targetNetWorth) && r.targetNetWorth > 0) {
    out.targetNetWorth = r.targetNetWorth;
  }
  if (typeof r.safeWithdrawalRateOverride === "number" && Number.isFinite(r.safeWithdrawalRateOverride) && r.safeWithdrawalRateOverride > 0) {
    out.safeWithdrawalRateOverride = r.safeWithdrawalRateOverride;
  }
  if (typeof r.minLiquidityBufferMonths === "number" && Number.isFinite(r.minLiquidityBufferMonths) && r.minLiquidityBufferMonths >= 0) {
    out.minLiquidityBufferMonths = r.minLiquidityBufferMonths;
  }
  const rt = r.maxRiskTolerance;
  if (rt === "conservative" || rt === "balanced" || rt === "growth") {
    out.maxRiskTolerance = rt;
  }
  return Object.keys(out).length > 0 ? out : null;
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
  const adv = useFireSettingsRow();
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
  const canonical = canonicalGoalToFireGoal(goal, currentAge, adv.advanced);
  if (!canonical) {
    return { status: "NOT_SET", reason: "FIRE goal could not be derived", isLoading: false };
  }
  return { status: "SET", goal: canonical, isLoading: false };
}

/**
 * Sprint 20 PR-F1 — internal canonical reader for the raw `mc_fire_settings`
 * row. Wraps the existing `/api/mc-fire-settings` GET so the FireGoalPanel
 * (and any other surface that needs `current_age` + household-shape fields
 * for SWR band sizing OR the round-tripped advanced bundle) does NOT call
 * the endpoint directly. This is the ONLY direct row reader; callers route
 * through `useFireSettingsRow()` or `useFireGoal()`.
 */
export function useFireSettingsRow(): {
  row: Record<string, unknown> | null;
  advanced: CanonicalFireAdvancedSettings | null;
  isLoading: boolean;
} {
  const q = useQuery<Record<string, unknown>>({
    queryKey: ["/api/mc-fire-settings"],
    queryFn: () => apiRequest("GET", "/api/mc-fire-settings").then(r => r.json()),
  });
  const row = q.data ?? null;
  return {
    row,
    advanced: row ? extractAdvancedFromRow(row as { action_checklist?: Record<string, unknown> | null }) : null,
    isLoading: q.isLoading || q.isFetching,
  };
}

/**
 * Writer payload for `setFireGoal`. Accepts year-based input; the writer
 * converts to age before persisting to the existing mc_fire_settings columns.
 *
 * Sprint 20 PR-F1: `advanced` carries the 4 advanced fields. Those fields
 * round-trip through the existing `action_checklist` JSON column under the
 * reserved `__advanced_fire` sub-key — no Supabase schema change required.
 */
export interface SetFireGoalInput {
  targetFireYear: number;
  targetMonthlyPassiveIncome: number;
  /** Optional SWR override (percentage form, e.g. 4 = 4%). */
  swrOverride?: number;
  /** Required for year → age conversion at the write boundary. */
  currentAge: number;
  /** Sprint 20 PR-F1 advanced bundle. Round-tripped server-side. */
  advanced?: CanonicalFireAdvancedSettings;
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
      // Sprint 20 PR-F1: round-trip the advanced bundle through action_checklist
      // (an existing JSON column). Read-modify-write to preserve any unrelated
      // checklist entries already saved by the action plan surface.
      const existing = await apiRequest("GET", "/api/mc-fire-settings")
        .then(r => r.json())
        .catch(() => ({}));
      const existingChecklist: Record<string, unknown> =
        existing && typeof (existing as any).action_checklist === "object" && (existing as any).action_checklist !== null
          ? { ...((existing as any).action_checklist as Record<string, unknown>) }
          : {};
      if (input.advanced && Object.keys(input.advanced).length > 0) {
        existingChecklist[ADVANCED_FIRE_CHECKLIST_KEY] = { ...input.advanced };
      } else {
        delete existingChecklist[ADVANCED_FIRE_CHECKLIST_KEY];
      }
      const body = {
        target_fire_age: targetAge,
        target_passive_monthly: input.targetMonthlyPassiveIncome,
        swr_pct: swr,
        goals_set: true,
        goal_set_timestamp: new Date().toISOString(),
        action_checklist: existingChecklist,
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

export type { CanonicalFireRiskTolerance };

/**
 * Raw query hook — exposed for the file-tree guard test. UI code should use
 * `useFireGoal()` (which reshapes to the canonical year model).
 */
export function useRawFireGoalQuery(): UseQueryResult<CanonicalGoal> {
  return useCanonicalGoal();
}
