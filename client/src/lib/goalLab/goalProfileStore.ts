/**
 * goalProfileStore.ts — Sprint 23.
 *
 * Session-scoped store for the THREE Goal-Lab overrides that today live as
 * React useState inside `client/src/pages/goal-lab.tsx`:
 *   • preferredEngine     (Q4)
 *   • riskTolerance       (Q5)
 *   • constraintOverride  (Q6)
 *
 * Why this exists
 * ---------------
 * The Sprint 22 lock said "React state only — no Supabase migration". But the
 * downstream engine stack (scenarioV2 candidateGenerator + recommendationEngine
 * + decision-lab + action-plan) cannot read React component state. So this
 * module lifts those three overrides into a tiny headless zustand store. It
 * is the SINGLE source of truth for Q4–Q6 overrides during a session.
 *
 * Scope guardrails
 * ----------------
 *   • Session-scoped only. NO persistence middleware. A full reload clears it,
 *     which matches the user's locked "no schema, no migration" rule.
 *   • Holds ONLY the three Goal-Lab override knobs. It does NOT hold FIRE
 *     target age, passive income, lifestyle — those stay canonical in
 *     `mc_fire_settings` (read via `useFireSettingsRow`).
 *   • No engine math lives here. Engines compose this store's selectors with
 *     `useFireSettingsRow` + `dashboardInputs` to build a canonical profile.
 *
 * Non-React callers
 * -----------------
 * Engines (orchestrator, candidateGenerator adapter) read via
 * `getGoalProfileOverrides()` which returns the current store snapshot
 * synchronously without subscribing.
 */

import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Q4 — user's preferred wealth-building engine. `"auto"` means "use whatever
 * the system inferred from the household ledger (buildWealthEngineMix)".
 */
export type PreferredEngine =
  | "auto"
  | "property"
  | "etf-stocks"
  | "hybrid"
  | "debt-reduction"
  | "unsure";

/**
 * Q5 — user-stated risk tolerance (subjective). Distinct from the *inferred*
 * risk capacity (objective, from ledger). `"auto"` means "use the inferred
 * capacity as-is — no subjective override".
 */
export type RiskTolerance = "auto" | "low" | "moderate" | "high";

/**
 * Q6 — user-confirmed primary constraint. `"auto"` means "use whatever
 * `inferPreferenceVector` chose as the primaryDriver". Any other value is a
 * deliberate override that the engine respects.
 */
export type ConstraintOverride =
  | "auto"
  | "liquidity"
  | "leverage"
  | "timeline"
  | "lifestyle"
  | "stability"
  | "growth";

/** Snapshot returned by the non-React selector. */
export interface GoalProfileOverrides {
  preferredEngine: PreferredEngine;
  riskTolerance: RiskTolerance;
  constraintOverride: ConstraintOverride;
}

interface GoalProfileStoreState extends GoalProfileOverrides {
  setPreferredEngine: (v: PreferredEngine) => void;
  setRiskTolerance: (v: RiskTolerance) => void;
  setConstraintOverride: (v: ConstraintOverride) => void;
  /** Resets all three overrides back to "auto". */
  resetOverrides: () => void;
}

const INITIAL: GoalProfileOverrides = {
  preferredEngine: "auto",
  riskTolerance: "auto",
  constraintOverride: "auto",
};

// ─── Store ─────────────────────────────────────────────────────────────────

export const useGoalProfileStore = create<GoalProfileStoreState>((set) => ({
  ...INITIAL,
  setPreferredEngine: (v) => set({ preferredEngine: v }),
  setRiskTolerance: (v) => set({ riskTolerance: v }),
  setConstraintOverride: (v) => set({ constraintOverride: v }),
  resetOverrides: () => set({ ...INITIAL }),
}));

// ─── Headless selectors (engines call these — no React) ────────────────────

/**
 * Synchronous snapshot of the three overrides. Safe to call from non-React
 * code paths (orchestrators, candidate adapters, audit scripts).
 */
export function getGoalProfileOverrides(): GoalProfileOverrides {
  const s = useGoalProfileStore.getState();
  return {
    preferredEngine: s.preferredEngine,
    riskTolerance: s.riskTolerance,
    constraintOverride: s.constraintOverride,
  };
}

/**
 * True when the user has set ANY override away from "auto". Useful for UI
 * badges ("confirmed by you" vs "system inference").
 */
export function hasAnyGoalOverride(): boolean {
  const o = getGoalProfileOverrides();
  return (
    o.preferredEngine !== "auto" ||
    o.riskTolerance !== "auto" ||
    o.constraintOverride !== "auto"
  );
}
