/**
 * persistentUserDefaults.ts — Persistent User-Default Modelling Settings
 *
 * #FWL_Persistent_UserDefaults_ScenarioOverride
 *
 * Why this file exists
 * --------------------
 * Key modelling selections (projection mode, tax regime, property growth
 * assumption, funding source for IP2, risk/investor/lens profile, active
 * scenario, active household state) used to live in scattered local stores
 * or transient component state. As a result they reset to system defaults
 * after reload / reopen / redeploy. Users would re-select Proposed 2027
 * Reform or Monte Carlo on every visit, and IP2's Equity Release funding
 * silently reverted to offset + savings.
 *
 * This module is the canonical, persistent "User Defaults" layer. It is a
 * tiny Zustand store with localStorage persistence. It contains ONLY
 * user-level preferences; per-scenario overrides live alongside scenario
 * records and are read by `scenarioSettingsResolver.ts`.
 *
 * Persistence
 * -----------
 * State persists to localStorage under `fwl.userDefaults.v1`. Reload
 * restores every value exactly. A single `savedAt` timestamp is stored per
 * key so the resolver and audit traces can render "Saved at 2026-05-22T…".
 *
 * Source-of-truth rule
 * --------------------
 * If a user has saved a value here, that value MUST be returned by the
 * resolver in preference to the system default. System defaults are
 * applied only when no user default has been set. Setting a value to
 * undefined removes it (reverts to system default).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProjectionMode } from "./monteCarloV5/projectionModes";
import type { TaxPolicyRegimeKind } from "./taxPolicyEngine";
import type { ForecastProfile, ForecastMode } from "./forecastStore";
import type { FundingSourceKey, FundingChoice } from "./propertyFundingStore";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskProfile = "conservative" | "moderate" | "aggressive";
export type InvestorProfile =
  | "conservative"
  | "balanced"
  | "wealth_max"
  | "cashflow_safe"
  | "fire_focused";
export type StrategyLens =
  | "wealth"
  | "cashflow"
  | "risk"
  | "tax"
  | "lifestyle";

/**
 * The canonical set of keys whose value the resolver can return. Each key
 * also gets a SYSTEM_DEFAULTS entry below — the resolver uses these when
 * the user has not saved a default and no scenario override exists.
 */
export interface UserDefaultsState {
  /** Monte Carlo vs deterministic. */
  projectionMode?: ProjectionMode;
  /** Top-level forecast mode (profile / year-by-year / monte-carlo). */
  monteCarloEnabled?: boolean;
  /** Tax policy regime selector. */
  taxPolicyRegime?: TaxPolicyRegimeKind;
  /** Property growth %, used when the user has set a global default. */
  propertyGrowthAssumption?: number;
  /** Per-property funding source choices. */
  fundingSourceByProperty?: Record<string, FundingChoice>;
  /** Scenario assumption preset (conservative/moderate/aggressive). */
  scenarioAssumptionSet?: ForecastProfile;
  /** Selected risk profile (separate from scenario assumption set). */
  riskProfile?: RiskProfile;
  /** Selected investor profile. */
  investorProfile?: InvestorProfile;
  /** Selected strategy lens. */
  strategyLens?: StrategyLens;
  /** Active scenario the user last opened. */
  activeScenarioId?: string;
  /** Active household financial state record the user last viewed. */
  activeHouseholdFinancialStateId?: string;

  /** ISO timestamps recorded the moment a key was saved. */
  savedAt: Partial<Record<UserDefaultsKey, string>>;
}

export type UserDefaultsKey = Exclude<keyof UserDefaultsState, "savedAt">;

/** Settings keys saved per scenario. Subset of UserDefaultsState (no `savedAt`). */
export type ScenarioOverrideKey = Exclude<UserDefaultsKey, "activeScenarioId" | "activeHouseholdFinancialStateId">;

// ─── System defaults ─────────────────────────────────────────────────────────

/**
 * System defaults — the fall-back if NO user default is set and NO
 * scenario override exists. These intentionally match the historical
 * defaults the codebase shipped with, so nothing changes for first-time
 * users.
 */
export const SYSTEM_DEFAULTS = {
  projectionMode:           "median" as ProjectionMode,
  monteCarloEnabled:        false,
  taxPolicyRegime:          "AUTO_DETECT" as TaxPolicyRegimeKind,
  propertyGrowthAssumption: 6.0,
  fundingSourceByProperty:  {} as Record<string, FundingChoice>,
  scenarioAssumptionSet:    "moderate" as ForecastProfile,
  riskProfile:              "moderate" as RiskProfile,
  investorProfile:          "balanced" as InvestorProfile,
  strategyLens:             "wealth" as StrategyLens,
  activeScenarioId:         "current_law",
  activeHouseholdFinancialStateId: "primary",
} as const;

export const SYSTEM_DEFAULT_FORECAST_MODE: ForecastMode = "profile";

// ─── Store ───────────────────────────────────────────────────────────────────

interface UserDefaultsActions {
  /**
   * Save a single user-default key. Records `savedAt`. Setting `value` to
   * undefined removes the override (reverts to system default).
   */
  setUserDefault: <K extends UserDefaultsKey>(
    key: K,
    value: UserDefaultsState[K] | undefined,
  ) => void;
  /** Bulk update — used by the Settings page batch save. */
  setManyUserDefaults: (next: Partial<Omit<UserDefaultsState, "savedAt">>) => void;
  /** Wipe all user defaults — "Reset to system defaults" button. */
  resetAllUserDefaults: () => void;
  /** Wipe a single key. */
  clearUserDefault: (key: UserDefaultsKey) => void;
  /** Read-only snapshot of current persisted state. */
  getSnapshot: () => UserDefaultsState;
}

type Store = UserDefaultsState & UserDefaultsActions;

const INITIAL_STATE: UserDefaultsState = { savedAt: {} };

export const useUserDefaultsStore = create<Store>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setUserDefault: (key, value) =>
        set((state) => {
          const nextSavedAt = { ...state.savedAt };
          const nextState: any = { ...state };
          if (value === undefined) {
            delete nextState[key];
            delete nextSavedAt[key];
          } else {
            nextState[key] = value;
            nextSavedAt[key] = new Date().toISOString();
          }
          nextState.savedAt = nextSavedAt;
          return nextState;
        }),

      setManyUserDefaults: (next) =>
        set((state) => {
          const ts = new Date().toISOString();
          const nextSavedAt = { ...state.savedAt };
          const nextState: any = { ...state };
          for (const k of Object.keys(next) as UserDefaultsKey[]) {
            const v = (next as any)[k];
            if (v === undefined) {
              delete nextState[k];
              delete nextSavedAt[k];
            } else {
              nextState[k] = v;
              nextSavedAt[k] = ts;
            }
          }
          nextState.savedAt = nextSavedAt;
          return nextState;
        }),

      resetAllUserDefaults: () =>
        set((state) => {
          // Strip every data key off the current state — Zustand's set()
          // merges into the existing object so we must explicitly mark
          // each known key as undefined to remove it.
          const cleared: any = { savedAt: {} };
          for (const k of Object.keys(state) as (keyof typeof state)[]) {
            if (k === "savedAt") continue;
            if (typeof (state as any)[k] === "function") continue;
            cleared[k] = undefined;
          }
          return cleared;
        }),

      clearUserDefault: (key) =>
        set((state) => {
          const nextSavedAt = { ...state.savedAt };
          delete nextSavedAt[key];
          const nextState: any = { ...state, savedAt: nextSavedAt };
          delete nextState[key];
          return nextState;
        }),

      getSnapshot: () => get(),
    }),
    {
      name: "fwl.userDefaults.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Only persist the data fields — actions are reconstructed by Zustand.
      partialize: (state) => {
        const { setUserDefault, setManyUserDefaults, resetAllUserDefaults,
                clearUserDefault, getSnapshot, ...rest } = state as any;
        return rest;
      },
    },
  ),
);

// ─── Headless accessors (engines + audit traces) ─────────────────────────────

/** Read a single user default value or undefined if not set. */
export function getUserDefault<K extends UserDefaultsKey>(
  key: K,
): UserDefaultsState[K] | undefined {
  return (useUserDefaultsStore.getState() as any)[key];
}

/** Read the savedAt timestamp for a key, or undefined if not set. */
export function getUserDefaultSavedAt(key: UserDefaultsKey): string | undefined {
  return useUserDefaultsStore.getState().savedAt[key];
}

/** Localstorage key — exported for tests. */
export const USER_DEFAULTS_LS_KEY = "fwl.userDefaults.v1";
