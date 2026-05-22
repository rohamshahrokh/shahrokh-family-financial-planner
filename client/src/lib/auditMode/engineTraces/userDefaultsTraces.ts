/**
 * userDefaultsTraces.ts — Audit traces for resolved user defaults.
 *
 * #FWL_Persistent_UserDefaults_ScenarioOverride
 *
 * For every persisted modelling setting (tax regime, projection mode,
 * property growth, IP2 funding source, risk profile, etc.), this module
 * builds a CalculationTrace showing:
 *   - current value
 *   - source (System Default / User Default / Scenario Override)
 *   - saved timestamp
 *   - applied engine/module
 *
 * Engines and pages call `registerUserDefaultsTraces(scenarioOverrides?)`
 * once on mount; the trace registry then answers UI clicks against the
 * canonical `user-default:<key>` ids.
 */

import { registerTraceFactory } from "../auditRegistry";
import {
  resolveSetting,
  sourceLabel,
  fullSourceLabel,
  type ScenarioOverrides,
  type ResolvedSetting,
} from "../../scenarioSettingsResolver";
import { getServerSyncState } from "../../userDefaultsApi";
import type { UserDefaultsKey } from "../../persistentUserDefaults";
import type {
  CalculationTrace,
  TraceInput,
} from "../calculationTrace";

const KEY_LABELS: Partial<Record<UserDefaultsKey, string>> = {
  projectionMode:                "Projection Mode",
  monteCarloEnabled:             "Monte Carlo Enabled",
  taxPolicyRegime:               "Tax Policy Regime",
  propertyGrowthAssumption:      "Property Growth Assumption",
  fundingSourceByProperty:       "Per-Property Funding Source",
  scenarioAssumptionSet:         "Scenario Assumption Set",
  riskProfile:                   "Risk Profile",
  investorProfile:               "Investor Profile",
  strategyLens:                  "Strategy Lens",
  activeScenarioId:              "Active Scenario",
  activeHouseholdFinancialStateId: "Active Household Financial State",
};

const APPLIED_MODULES: Partial<Record<UserDefaultsKey, string[]>> = {
  projectionMode:                ["Dashboard", "Monte Carlo V5", "Strategic Wealth Projection"],
  monteCarloEnabled:             ["Forecast Engine", "Monte Carlo Engine"],
  taxPolicyRegime:               ["Tax Alpha Engine", "Forecast Engine", "FIRE Path", "Property Buy Analysis"],
  propertyGrowthAssumption:      ["Forecast Engine", "Monte Carlo Engine", "Property Page"],
  fundingSourceByProperty:       ["Cash Engine", "Forecast Engine", "Monte Carlo Engine", "Plan Feasibility"],
  scenarioAssumptionSet:         ["Forecast Store", "Forecast Engine"],
  riskProfile:                   ["Risk Radar", "Recommendation Engine"],
  investorProfile:               ["Decision Engine", "Candidate Generator"],
  strategyLens:                  ["Strategic Lens", "Decision Engine"],
  activeScenarioId:              ["Scenario V2", "Tax Alpha Engine"],
  activeHouseholdFinancialStateId: ["Household Financial State", "Snapshot Loader"],
};

/** Format the resolved value for the trace inputs list. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

/** Build a CalculationTrace from a Resolved record. */
export function buildUserDefaultTrace(
  resolved: ResolvedSetting,
): CalculationTrace {
  const key = resolved.key as UserDefaultsKey;
  const label = KEY_LABELS[key] ?? key;
  const applied = APPLIED_MODULES[key] ?? [];

  const sync = getServerSyncState();
  const fullLabel = fullSourceLabel(resolved);
  const persistenceSource =
    resolved.source === "scenario"
      ? "scenarios.data.userSettingsOverrides JSON column"
      : resolved.source === "user"
        ? (resolved.userTier === "server-backed"
            ? `durable backend (settings k-v table key: fwl.userDefaults.v1)` +
              (sync.lastWriteAt ? `  · last server write: ${sync.lastWriteAt}` : "")
            : resolved.userTier === "local-pending"
              ? `localStorage (fwl.userDefaults.v1) — push to backend pending`
              : `localStorage (fwl.userDefaults.v1) — backend unreachable, local fallback`)
        : "SYSTEM_DEFAULTS";

  const inputs: TraceInput[] = [
    {
      label: "Current value",
      value: formatValue(resolved.value),
      source: `scenarioSettingsResolver(${key})`,
    },
    {
      label: "Source",
      value: fullLabel,
      source: persistenceSource,
    },
    {
      label: "Saved at",
      value: resolved.savedAt ?? "—",
      source: resolved.source === "system"
        ? "n/a — system default never expires"
        : "ISO timestamp recorded when saved",
    },
    {
      label: "Applied to",
      value: applied.length > 0 ? applied.join(", ") : (resolved.appliedTo ?? "—"),
      source: "scenarioSettingsResolver appliedTo metadata",
    },
  ];

  // Add a server-sync diagnostic row for user-sourced values.
  if (resolved.source === "user") {
    inputs.push({
      label: "Backend sync",
      value: sync.hydrated
        ? (sync.lastWriteOk
            ? `OK — last write ${sync.lastWriteAt ?? "—"}`
            : (sync.lastError ? `pending / failed: ${sync.lastError}` : "pending"))
        : "not yet hydrated (boot-time fetch in flight)",
      source: "userDefaultsApi.getServerSyncState()",
    });
  }

  return {
    id: `user-default:${key}`,
    label,
    finalValue: formatValue(resolved.value),
    plainEnglish: `${label} is currently set to "${formatValue(resolved.value)}". ` +
      `This value comes from the ${fullLabel} layer of the resolver ` +
      `(scenario override > user default > system default). It is read by the ` +
      `${applied.length > 0 ? applied.join(" / ") : "downstream"} engine(s) ` +
      `every time a projection or recommendation is computed. ` +
      (resolved.source === "user"
        ? (resolved.userTier === "server-backed"
            ? "It is durably persisted to the backend and will survive reload, redeploy, and a fresh browser."
            : resolved.userTier === "local-pending"
              ? "The value is saved locally; a backend write is in flight."
              : "The backend was not reachable; this value is held in localStorage and will sync on next successful write.")
        : ""),
    formula: "resolved = scenarioOverride ?? userDefault ?? systemDefault",
    expanded: `resolved = ${resolved.source === "scenario" ? "(scenario override)" : "—"} ?? ` +
      `${resolved.source === "user" ? `(user default: ${formatValue(resolved.value)})` : "—"} ?? ` +
      `(system default)`,
    inputs,
    assumptions: [
      {
        label: "Strict resolver priority",
        value: "scenario > user > system",
        source: "scenarioSettingsResolver.ts",
      },
      {
        label: "Persistence layer",
        value: resolved.source === "system"
          ? "—"
          : resolved.source === "user"
            ? (resolved.userTier === "server-backed"
                ? "Durable backend (settings k-v) + localStorage cache"
                : resolved.userTier === "local-pending"
                  ? "localStorage now, backend push in flight"
                  : "localStorage fallback (backend unreachable)")
            : "scenarios.data JSON column",
        source: "persistentUserDefaults + userDefaultsApi / scenarios table",
      },
    ],
    dataSource: resolved.source === "system"
      ? "SYSTEM_DEFAULTS constant in persistentUserDefaults.ts"
      : resolved.source === "user"
        ? (resolved.userTier === "server-backed"
            ? "Backend settings row (fwl.userDefaults.v1) via /api/settings/:key"
            : "useUserDefaultsStore (Zustand, persisted to localStorage)")
        : "scenarios.data.userSettingsOverrides JSON",
    sourceEngine: "scenarioSettingsResolver",
    included: applied.map(mod => ({
      label: mod,
      reason: "reads the resolved value at compute time",
    })),
    excluded: [],
    calculatedAt: new Date().toISOString(),
    scenarioId: resolved.source === "scenario" ? "scenario_override" : "default",
    notes: [
      "System defaults never overwrite a saved user choice.",
      "Deploys, reloads, and reopens preserve user-saved values.",
    ],
  };
}

/**
 * Register a trace factory for every persistent user-default key. Engines
 * and pages call this once on mount — the registry then answers UI clicks
 * against `user-default:<key>` ids without rebuilding traces eagerly.
 */
export function registerUserDefaultsTraces(
  scenarioOverrides?: ScenarioOverrides,
): void {
  const keys = Object.keys(KEY_LABELS) as UserDefaultsKey[];
  for (const key of keys) {
    registerTraceFactory(`user-default:${key}`, () =>
      buildUserDefaultTrace(resolveSetting(key, scenarioOverrides)),
    );
  }
}
