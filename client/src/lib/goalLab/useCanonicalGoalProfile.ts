/**
 * useCanonicalGoalProfile.ts — Sprint 23.
 *
 * React hook that subscribes to the three inputs that compose a Canonical
 * Goal Profile and returns a memoised, frozen profile object:
 *
 *   • mc_fire_settings (durable)        ← useFireSettingsRow()
 *   • Q4–Q6 overrides (session)         ← useGoalProfileStore
 *   • DashboardInputs (ledger)          ← caller passes — the page already
 *                                         composes these from /api endpoints
 *
 * Why does the caller pass `dashboardInputs`?
 * -------------------------------------------
 * `DashboardInputs` is a denormalised view assembled from 7+ React Query
 * keys. Every consumer page already builds it once via `useMemo`. Re-fetching
 * it inside this hook would double the network/cache traffic. So we keep the
 * hook a pure derivation of inputs already in hand at the call site.
 *
 * For non-React callers (orchestrators, audit scripts) use
 * `buildCanonicalGoalProfileFromStore()` from `./canonicalGoalProfile`.
 */

import { useMemo } from "react";
import type { DashboardInputs } from "../dashboardDataContract";
import { useFireSettingsRow } from "../fireGoalCanonical";
import { useGoalProfileStore } from "./goalProfileStore";
import {
  buildCanonicalGoalProfile,
  type CanonicalGoalProfile,
} from "./canonicalGoalProfile";

/**
 * Subscribes to:
 *   • `useFireSettingsRow()`     → re-derives on FIRE-row refetch
 *   • `useGoalProfileStore`      → re-derives on any Q4/Q5/Q6 change
 *   • `dashboardInputs` identity → re-derives when the caller's memo changes
 *
 * Returns the same frozen profile object across renders when inputs are
 * stable (React refs through useMemo + zustand's structural shallow compare).
 */
export function useCanonicalGoalProfile(
  dashboardInputs: DashboardInputs,
): CanonicalGoalProfile {
  const { normalized: fireNormalized } = useFireSettingsRow();

  // Subscribe to all three override fields individually so the hook only
  // re-renders when one of those three actually changes — not when an
  // unrelated method on the store is replaced.
  const preferredEngine    = useGoalProfileStore((s) => s.preferredEngine);
  const riskTolerance      = useGoalProfileStore((s) => s.riskTolerance);
  const constraintOverride = useGoalProfileStore((s) => s.constraintOverride);

  return useMemo(
    () =>
      buildCanonicalGoalProfile(fireNormalized, dashboardInputs, {
        preferredEngine,
        riskTolerance,
        constraintOverride,
      }),
    [fireNormalized, dashboardInputs, preferredEngine, riskTolerance, constraintOverride],
  );
}
