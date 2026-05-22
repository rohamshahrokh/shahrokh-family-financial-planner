/**
 * scenarioSettingsResolver.ts — Strict-priority resolver for modelling settings.
 *
 * #FWL_Persistent_UserDefaults_ScenarioOverride
 *
 * Priority:
 *   1. Scenario-specific saved override.
 *   2. User default preference (persistentUserDefaults).
 *   3. System default (SYSTEM_DEFAULTS).
 *
 * Pure & headless: no React, no side-effects. Engines and the UI both call
 * `resolveSetting(key, scenarioOverrides?)` to get a single `Resolved`
 * record:
 *
 *   { value, source, savedAt, appliedTo, key }
 *
 * The `source` field is one of "system" | "user" | "scenario", and the
 * UI uses it to render a "System Default / User Default / Scenario Override"
 * chip beside the control. Audit traces use the same record to populate the
 * provenance section of a CalculationTrace.
 *
 * Why a resolver and not a state machine
 * --------------------------------------
 * Scenarios already persist as JSON blobs in the `scenarios.data` column.
 * User defaults already persist via Zustand+localStorage. There is no need
 * for a centralised state machine — a one-shot resolver computes the
 * effective value at the moment an engine or component needs it, and that
 * value is always sourced from the most authoritative persisted layer.
 */

import {
  SYSTEM_DEFAULTS,
  getUserDefault,
  getUserDefaultSavedAt,
  useUserDefaultsStore,
  type UserDefaultsKey,
  type UserDefaultsState,
  type ScenarioOverrideKey,
} from "./persistentUserDefaults";
import {
  getActiveRegime,
  setActiveRegime as setActiveRegimeRaw,
} from "./activeRegimeStore";
import {
  getAllFundingChoices,
  usePropertyFundingStore,
  type FundingChoice,
} from "./propertyFundingStore";
import {
  isKeyServerBacked,
  markKeyPending,
  pushUserDefaultsToServer,
  getServerSyncState,
} from "./userDefaultsApi";

// ─── Resolved record ─────────────────────────────────────────────────────────

/** Source of a resolved value. */
export type SettingSource = "system" | "user" | "scenario";

/**
 * Persistence tier that produced a "user"-source value. Helps the audit
 * trace distinguish a value that's confirmed on the durable backend
 * (Supabase / SQLite settings table) from one that only lives in
 * localStorage. System and scenario sources don't carry a tier.
 */
export type UserPersistenceTier = "server-backed" | "local-pending" | "local-fallback";

export interface ResolvedSetting<K extends UserDefaultsKey = UserDefaultsKey> {
  /** The key being resolved. */
  key: K;
  /** Effective value after applying the priority chain. */
  value: UserDefaultsState[K] | (typeof SYSTEM_DEFAULTS)[K extends keyof typeof SYSTEM_DEFAULTS ? K : never];
  /** Which layer produced the value. */
  source: SettingSource;
  /**
   * For "user"-source values, the persistence tier:
   *   • server-backed : last successful PUT contained this key
   *   • local-pending : edited since the last successful PUT
   *   • local-fallback: server hydration never succeeded (offline / 5xx)
   */
  userTier?: UserPersistenceTier;
  /** ISO timestamp the value was saved, if any. */
  savedAt?: string;
  /** Module/engine the value is being applied to (caller-supplied). */
  appliedTo?: string;
}

/**
 * A scenario record's overrides — a partial map of the same keys the user
 * can save as defaults. May be undefined (treated as no overrides).
 *
 * Scenarios that store their overrides in the scenarios.data JSON column
 * surface them under the canonical key `userSettingsOverrides`.
 */
export type ScenarioOverrides = Partial<Omit<UserDefaultsState, "savedAt">> & {
  /** ISO timestamps per override key, if the scenario writer recorded them. */
  savedAt?: Partial<Record<ScenarioOverrideKey, string>>;
};

// ─── Source label helpers ────────────────────────────────────────────────────

const SOURCE_LABELS: Record<SettingSource, string> = {
  system:   "System Default",
  user:     "User Default",
  scenario: "Scenario Override",
};

const USER_TIER_LABELS: Record<UserPersistenceTier, string> = {
  "server-backed":   "server-backed",
  "local-pending":   "local pending sync",
  "local-fallback":  "local fallback",
};

export function sourceLabel(source: SettingSource): string {
  return SOURCE_LABELS[source];
}

/**
 * Build the full audit-friendly label, e.g.
 *   "User Default (server-backed)"
 *   "User Default (local pending sync)"
 *   "User Default (local fallback)"
 *   "System Default"
 *   "Scenario Override"
 */
export function fullSourceLabel(resolved: Pick<ResolvedSetting, "source" | "userTier">): string {
  if (resolved.source === "user" && resolved.userTier) {
    return `${SOURCE_LABELS.user} (${USER_TIER_LABELS[resolved.userTier]})`;
  }
  return SOURCE_LABELS[resolved.source];
}

/**
 * Compute the persistence tier for a user-sourced key. Reads in-memory
 * sync state populated by `userDefaultsApi.ts`.
 */
function getUserTier(key: UserDefaultsKey): UserPersistenceTier {
  const sync = getServerSyncState();
  if (sync.pendingKeys.has(key)) return "local-pending";
  if (isKeyServerBacked(key)) return "server-backed";
  // Hydration may not have happened yet, or the server is unreachable.
  return "local-fallback";
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve a single setting against scenario overrides → user defaults →
 * system defaults. Tax regime and per-property funding source are kept in
 * their own dedicated stores; for those keys the resolver reads the
 * authoritative store as the user-default layer, so a value saved via the
 * existing Tax Reform / Property page still counts as a User Default.
 */
export function resolveSetting<K extends UserDefaultsKey>(
  key: K,
  scenarioOverrides?: ScenarioOverrides,
  appliedTo?: string,
): ResolvedSetting<K> {
  // 1. Scenario override (when present and not undefined).
  if (scenarioOverrides && key in scenarioOverrides) {
    const v = (scenarioOverrides as any)[key];
    if (v !== undefined) {
      return {
        key,
        value: v,
        source: "scenario",
        savedAt: scenarioOverrides.savedAt?.[key as ScenarioOverrideKey],
        appliedTo,
      } as ResolvedSetting<K>;
    }
  }

  // 2. User default — delegate to dedicated stores where appropriate.
  if (key === "taxPolicyRegime") {
    const selector = getActiveRegime().selector;
    const userSaved = getUserDefaultSavedAt(key);
    // If the activeRegimeStore was explicitly set away from AUTO_DETECT,
    // it counts as a saved user preference even if useUserDefaultsStore
    // does not have a matching entry — activeRegimeStore is the legacy
    // persistence path and is the source of truth for the tax regime.
    if (selector !== SYSTEM_DEFAULTS.taxPolicyRegime || userSaved) {
      return {
        key,
        value: selector as any,
        source: "user",
        userTier: getUserTier(key),
        savedAt: userSaved,
        appliedTo,
      };
    }
  } else if (key === "fundingSourceByProperty") {
    const choices = getAllFundingChoices();
    if (Object.keys(choices).length > 0) {
      const savedTs = Object.values(choices)
        .map((c: FundingChoice) => c.updatedAt)
        .sort()
        .reverse()[0];
      return {
        key,
        value: choices as any,
        source: "user",
        userTier: getUserTier(key),
        savedAt: savedTs,
        appliedTo,
      };
    }
  } else {
    const v = getUserDefault(key);
    if (v !== undefined) {
      return {
        key,
        value: v as any,
        source: "user",
        userTier: getUserTier(key),
        savedAt: getUserDefaultSavedAt(key),
        appliedTo,
      };
    }
  }

  // 3. System default.
  return {
    key,
    value: (SYSTEM_DEFAULTS as any)[key],
    source: "system",
    appliedTo,
  };
}

/**
 * Resolve every key at once — useful for pages that need to display the
 * source chip beside multiple controls, or for snapshot audit traces.
 */
export function resolveAllSettings(
  scenarioOverrides?: ScenarioOverrides,
  appliedTo?: string,
): Record<UserDefaultsKey, ResolvedSetting> {
  const keys: UserDefaultsKey[] = [
    "projectionMode",
    "monteCarloEnabled",
    "taxPolicyRegime",
    "propertyGrowthAssumption",
    "fundingSourceByProperty",
    "scenarioAssumptionSet",
    "riskProfile",
    "investorProfile",
    "strategyLens",
    "activeScenarioId",
    "activeHouseholdFinancialStateId",
  ];
  const out: any = {};
  for (const k of keys) {
    out[k] = resolveSetting(k, scenarioOverrides, appliedTo);
  }
  return out;
}

// ─── Scenario-override helpers ───────────────────────────────────────────────

/**
 * Read scenario overrides from a scenario record's `data` JSON. Tolerant of
 * malformed JSON and missing keys — returns undefined.
 */
export function extractScenarioOverrides(
  scenarioData: string | null | undefined,
): ScenarioOverrides | undefined {
  if (!scenarioData) return undefined;
  try {
    const parsed = typeof scenarioData === "string"
      ? JSON.parse(scenarioData)
      : scenarioData;
    if (parsed && typeof parsed === "object" && parsed.userSettingsOverrides) {
      return parsed.userSettingsOverrides as ScenarioOverrides;
    }
  } catch { /* swallow — treat as no overrides */ }
  return undefined;
}

/**
 * Merge a fresh scenario override into a scenario `data` JSON blob, preserving
 * any other keys (the scenario record may store unrelated fields too).
 *
 * Returns the JSON string ready to PUT back to the `scenarios.data` column.
 */
export function applyScenarioOverride(
  scenarioData: string | null | undefined,
  override: Partial<ScenarioOverrides>,
): string {
  let parsed: any = {};
  if (scenarioData) {
    try {
      parsed = typeof scenarioData === "string"
        ? JSON.parse(scenarioData)
        : scenarioData;
    } catch { parsed = {}; }
  }
  const existing = parsed?.userSettingsOverrides ?? {};
  const savedAt = { ...(existing.savedAt ?? {}) } as Record<string, string>;
  const ts = new Date().toISOString();
  for (const k of Object.keys(override)) {
    if (k === "savedAt") continue;
    savedAt[k] = ts;
  }
  parsed.userSettingsOverrides = {
    ...existing,
    ...override,
    savedAt: { ...savedAt, ...(override.savedAt ?? {}) },
  };
  return JSON.stringify(parsed);
}

// ─── Convenience writers ─────────────────────────────────────────────────────

/**
 * Save a user default and also propagate to legacy single-purpose stores
 * (activeRegimeStore for tax regime; propertyFundingStore for funding) so
 * existing engines that already read those stores continue to work. The
 * value is written immediately to localStorage and asynchronously pushed
 * to the durable server (debounced).
 */
export function saveUserDefault<K extends UserDefaultsKey>(
  key: K,
  value: UserDefaultsState[K],
): void {
  useUserDefaultsStore.getState().setUserDefault(key, value);
  if (key === "taxPolicyRegime" && value) {
    setActiveRegimeRaw({ selector: value as any });
  }
  if (key === "fundingSourceByProperty" && value && typeof value === "object") {
    usePropertyFundingStore.getState().hydrate(value as any);
  }
  // Mark pending then push (debounced). Tests that need the synchronous
  // round-trip call `pushUserDefaultsToServer({ immediate: true })`
  // directly afterwards.
  markKeyPending(key);
  void pushUserDefaultsToServer().catch(() => { /* surfaced via getServerSyncState */ });
}

/**
 * Reset every user default to system defaults. Also resets the legacy
 * activeRegimeStore selector to AUTO_DETECT and clears per-property funding
 * so the user sees a true clean slate. The cleared state is also pushed
 * to the server so the reset propagates across browsers.
 */
export function resetAllUserDefaults(): void {
  useUserDefaultsStore.getState().resetAllUserDefaults();
  setActiveRegimeRaw({ selector: SYSTEM_DEFAULTS.taxPolicyRegime });
  usePropertyFundingStore.getState().hydrate({});
  void pushUserDefaultsToServer().catch(() => { /* silent */ });
}
