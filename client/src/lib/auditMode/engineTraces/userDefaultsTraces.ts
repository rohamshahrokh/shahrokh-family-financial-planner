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
  type ScenarioOverrides,
  type ResolvedSetting,
} from "../../scenarioSettingsResolver";
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

  const inputs: TraceInput[] = [
    {
      label: "Current value",
      value: formatValue(resolved.value),
      source: `scenarioSettingsResolver(${key})`,
    },
    {
      label: "Source",
      value: sourceLabel(resolved.source),
      source: resolved.source === "scenario"
        ? "scenarios.data.userSettingsOverrides"
        : resolved.source === "user"
          ? "persistentUserDefaults (localStorage fwl.userDefaults.v1)"
          : "SYSTEM_DEFAULTS",
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

  return {
    id: `user-default:${key}`,
    label,
    finalValue: formatValue(resolved.value),
    plainEnglish: `${label} is currently set to "${formatValue(resolved.value)}". ` +
      `This value comes from the ${sourceLabel(resolved.source)} layer of the resolver ` +
      `(scenario override > user default > system default). It is read by the ` +
      `${applied.length > 0 ? applied.join(" / ") : "downstream"} engine(s) ` +
      `every time a projection or recommendation is computed.`,
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
        value: resolved.source === "system" ? "—" : (resolved.source === "user"
          ? "localStorage + Supabase mirror"
          : "scenarios.data JSON column"),
        source: "persistentUserDefaults / scenarios table",
      },
    ],
    dataSource: resolved.source === "system"
      ? "SYSTEM_DEFAULTS constant in persistentUserDefaults.ts"
      : resolved.source === "user"
        ? "useUserDefaultsStore (Zustand, persisted to localStorage)"
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
