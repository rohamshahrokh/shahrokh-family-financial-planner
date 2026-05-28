/**
 * canonicalGoalProfile.ts — Sprint 23.
 *
 * THE canonical Goal Profile selector. The ONLY module engines should import
 * to read "what does the user want, and on what terms".
 *
 * Composition
 * -----------
 *   CanonicalGoalProfile = mc_fire_settings (durable goal)
 *                        + Q4–Q6 overrides (session, from goalProfileStore)
 *                        + ledger-derived inferences (capital mix, risk capacity)
 *
 * Read-only contract. NEVER mutate the returned object. To change anything,
 * write through:
 *   • `useSetFireGoal()`     — Q1/Q2 durable fields (mc_fire_settings)
 *   • `useGoalProfileStore`  — Q4/Q5/Q6 session overrides
 *
 * Engines (orchestrator, candidate adapter, decision-lab summary) MUST
 * receive this object explicitly — they MUST NOT reach into React-page state.
 */

import type { DashboardInputs } from "../dashboardDataContract";
import { normalizeFireSettingsRow, type FireSettingsNormalized } from "../fireGoalCanonical";
import {
  buildCapitalStructureSnapshot,
  buildWealthEngineMix,
  inferRiskCapacity,
  inferPreferenceVector,
  type CapitalStructureSnapshot,
  type WealthEngineMix,
  type RiskCapacityInference,
  type PreferenceVectorInference,
} from "./inferences";
import {
  getGoalProfileOverrides,
  type GoalProfileOverrides,
  type PreferredEngine,
  type RiskTolerance,
  type ConstraintOverride,
} from "./goalProfileStore";

// ─── Public type ────────────────────────────────────────────────────────────

/**
 * Frozen, read-only Goal Profile. Field provenance is encoded in `sources`
 * so downstream UIs can render data-source badges without recomputing.
 *
 * Inferences are nullable when the ledger snapshot is missing — engines must
 * treat absent inferences as "fall back to defaults", not as zero.
 */
export interface CanonicalGoalProfile {
  /** True iff the user has explicitly set FIRE year + passive income. */
  isExplicitlySet: boolean;

  /** ── Durable FIRE goal (from mc_fire_settings) ── */
  fire: {
    targetFireAge: number | null;
    targetFireYear: number | null;
    targetPassiveMonthly: number | null;
    targetPassiveAnnual: number | null;
    /** SWR (e.g. 4 = 4%). Null when user has not overridden. */
    swrPct: number | null;
    currentAge: number | null;
  };

  /** ── Inferred from ledger (null when snapshot missing) ── */
  inferences: {
    capitalStructure: CapitalStructureSnapshot | null;
    wealthEngineMix:  WealthEngineMix | null;
    riskCapacity:     RiskCapacityInference | null;
    preferenceVector: PreferenceVectorInference | null;
  };

  /** ── Session overrides (Q4–Q6 — from goalProfileStore) ── */
  overrides: GoalProfileOverrides;

  /**
   * Resolved values after applying overrides on top of inference. Engines
   * SHOULD prefer these over `inferences` because they encode user intent.
   * "auto" never appears here — it has been collapsed to the inferred or
   * default value.
   */
  resolved: {
    preferredEngine:   Exclude<PreferredEngine,    "auto">;
    riskTolerance:     Exclude<RiskTolerance,      "auto">;
    primaryConstraint: Exclude<ConstraintOverride, "auto">;
  };

  /** Per-field provenance for data-source badge rendering. */
  sources: {
    fire:              "fire-settings" | "needs-confirmation";
    capitalStructure:  "ledger" | "needs-confirmation";
    wealthEngineMix:   "estimated" | "confirmed" | "needs-confirmation";
    riskCapacity:      "estimated" | "needs-confirmation";
    riskTolerance:     "estimated" | "confirmed" | "needs-confirmation";
    primaryConstraint: "estimated" | "confirmed" | "needs-confirmation";
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ZERO_FIRE: FireSettingsNormalized = normalizeFireSettingsRow(null);

/**
 * Map the inferred wealth-engine label to the Goal-Lab `PreferredEngine`
 * taxonomy. `inferences.WealthEngineMix.label` uses "-led" suffixes; the
 * override taxonomy uses bare engine names.
 */
function inferredEngineFromMix(mix: WealthEngineMix | null): Exclude<PreferredEngine, "auto" | "unsure"> {
  if (!mix) return "etf-stocks"; // empty/unknown household — safest default
  switch (mix.label) {
    case "property-led":   return "property";
    case "investment-led": return "etf-stocks";
    case "income-led":     return "debt-reduction"; // active-income households benefit most from debt paydown vs allocating new capital
    case "hybrid":         return "hybrid";
    case "balanced":       return "hybrid";
  }
}

/**
 * Map inferred risk-capacity band → user-facing risk-tolerance default. This
 * is ONLY used when the user has NOT overridden (Q5 = "auto"). The brief
 * explicitly distinguishes capacity (objective) from tolerance (subjective),
 * so this is a SEED, not a CLAIM about the user's preference.
 */
function toleranceSeedFromCapacity(band: RiskCapacityInference["band"] | null): Exclude<RiskTolerance, "auto"> {
  if (band == null) return "moderate";
  if (band === "low" || band === "medium_low") return "low";
  if (band === "high" || band === "medium_high") return "high";
  return "moderate";
}

/**
 * Map `inferences.preferenceVector.primaryDriver` (the engine's vocabulary)
 * into the Goal-Lab `ConstraintOverride` taxonomy (the user-facing
 * vocabulary). These are two different vocabularies on purpose — engines
 * speak in cashflow primitives, users speak in goals.
 */
function constraintFromInferredDriver(
  driver: PreferenceVectorInference["primaryDriver"] | null,
): Exclude<ConstraintOverride, "auto"> {
  if (driver == null) return "lifestyle";
  switch (driver) {
    case "liquidity_buffer":         return "liquidity";
    case "leverage_headroom":        return "leverage";
    case "savings_rate_and_cashflow": return "growth";
    case "lifestyle_protection":     return "lifestyle";
    case "balanced":                 return "stability";
  }
}

// ─── Builder (pure, deterministic) ──────────────────────────────────────────

/**
 * Pure builder. Compose the canonical profile from its three inputs:
 *   • normalized FIRE row (from useFireSettingsRow().normalized)
 *   • dashboard inputs (canonical ledger)
 *   • current store overrides snapshot (from getGoalProfileOverrides)
 *
 * Deterministic: same inputs → byte-identical output.
 *
 * Why not a hook? Because engines outside React (orchestrator.ts, candidate
 * adapters) must be able to build the profile too. The
 * `useCanonicalGoalProfile()` hook below is the React convenience wrapper.
 */
export function buildCanonicalGoalProfile(
  fireNormalized: FireSettingsNormalized | null,
  dashboardInputs: DashboardInputs,
  overrides: GoalProfileOverrides,
): CanonicalGoalProfile {
  const fire = fireNormalized ?? ZERO_FIRE;

  const capitalStructure = buildCapitalStructureSnapshot(dashboardInputs);
  const wealthEngineMix  = buildWealthEngineMix(dashboardInputs);
  const riskCapacity     = inferRiskCapacity(dashboardInputs);
  const preferenceVector = inferPreferenceVector(dashboardInputs);

  // Override-vs-inference resolution. "auto" collapses to inference (or
  // safe default when inference is null). Any explicit user value wins.
  const inferredEngine     = inferredEngineFromMix(wealthEngineMix);
  const inferredTolerance  = toleranceSeedFromCapacity(riskCapacity?.band ?? null);
  const inferredConstraint = constraintFromInferredDriver(preferenceVector?.primaryDriver ?? null);

  const resolvedPreferredEngine: Exclude<PreferredEngine, "auto"> =
    overrides.preferredEngine === "auto" ? inferredEngine : overrides.preferredEngine;
  const resolvedRiskTolerance: Exclude<RiskTolerance, "auto"> =
    overrides.riskTolerance === "auto" ? inferredTolerance : overrides.riskTolerance;
  const resolvedConstraint: Exclude<ConstraintOverride, "auto"> =
    overrides.constraintOverride === "auto" ? inferredConstraint : overrides.constraintOverride;

  const isExplicitlySet =
    fire.targetFireAge != null &&
    fire.targetPassiveMonthly != null &&
    fire.goalsSet === true;

  const targetFireYear =
    fire.currentAge != null && fire.targetFireAge != null
      ? new Date().getFullYear() + (fire.targetFireAge - fire.currentAge)
      : null;

  return Object.freeze<CanonicalGoalProfile>({
    isExplicitlySet,

    fire: {
      targetFireAge:        fire.targetFireAge,
      targetFireYear,
      targetPassiveMonthly: fire.targetPassiveMonthly,
      targetPassiveAnnual:  fire.targetPassiveMonthly != null ? fire.targetPassiveMonthly * 12 : null,
      swrPct:               fire.swrPct,
      currentAge:           fire.currentAge,
    },

    inferences: {
      capitalStructure,
      wealthEngineMix,
      riskCapacity,
      preferenceVector,
    },

    overrides,

    resolved: {
      preferredEngine:   resolvedPreferredEngine,
      riskTolerance:     resolvedRiskTolerance,
      primaryConstraint: resolvedConstraint,
    },

    sources: {
      fire:              isExplicitlySet ? "fire-settings" : "needs-confirmation",
      capitalStructure:  capitalStructure ? "ledger" : "needs-confirmation",
      wealthEngineMix:
        overrides.preferredEngine !== "auto" ? "confirmed" :
        wealthEngineMix             ? "estimated" : "needs-confirmation",
      riskCapacity:      riskCapacity ? "estimated" : "needs-confirmation",
      riskTolerance:
        overrides.riskTolerance !== "auto" ? "confirmed" :
        riskCapacity              ? "estimated" : "needs-confirmation",
      primaryConstraint:
        overrides.constraintOverride !== "auto" ? "confirmed" :
        preferenceVector              ? "estimated" : "needs-confirmation",
    },
  });
}

/**
 * Read the current overrides + a provided fire/dashboard pair. Convenience
 * for the orchestrator (non-React caller). React surfaces should use the
 * dedicated `useCanonicalGoalProfile()` hook (defined in
 * `./useCanonicalGoalProfile.ts`) which reactively re-derives.
 */
export function buildCanonicalGoalProfileFromStore(
  fireNormalized: FireSettingsNormalized | null,
  dashboardInputs: DashboardInputs,
): CanonicalGoalProfile {
  return buildCanonicalGoalProfile(fireNormalized, dashboardInputs, getGoalProfileOverrides());
}
