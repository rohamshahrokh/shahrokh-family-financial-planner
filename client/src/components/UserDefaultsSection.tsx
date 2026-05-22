/**
 * UserDefaultsSection.tsx — UI for the persistent User Defaults layer.
 *
 * #FWL_Persistent_UserDefaults_ScenarioOverride
 *
 * Renders a Settings card with one row per modelling setting that supports
 * a "Save as my default" preference. Every row shows the current resolved
 * value, the source chip (System Default / User Default / Scenario
 * Override) and a Save button. A "Reset to system defaults" button at the
 * bottom wipes all saved defaults but is never invoked automatically.
 *
 * Why a new component and not inline JSX in settings.tsx
 * ------------------------------------------------------
 * The Settings page is already 1300 lines. Putting the user-defaults UI in
 * its own component keeps the page tidy AND lets us mount the same widget
 * elsewhere (e.g. a scenario page) without duplication.
 */

import { useEffect, useMemo, useState } from "react";
import { Settings as SettingsIcon, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import {
  useUserDefaultsStore,
  SYSTEM_DEFAULTS,
  type RiskProfile,
} from "@/lib/persistentUserDefaults";
import {
  resolveSetting,
  resetAllUserDefaults as resetAllDefaults,
  saveUserDefault,
  sourceLabel,
  type ResolvedSetting,
  type ScenarioOverrides,
} from "@/lib/scenarioSettingsResolver";
import { registerUserDefaultsTraces } from "@/lib/auditMode/engineTraces";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";
import type { ProjectionMode } from "@/lib/monteCarloV5/projectionModes";

const SOURCE_COLOURS: Record<string, string> = {
  "System Default":    "hsl(240,8%,55%)",
  "User Default":      "hsl(43,85%,55%)",
  "Scenario Override": "hsl(188,65%,52%)",
};

function SourceChip({ source }: { source: ResolvedSetting["source"] }) {
  const label = sourceLabel(source);
  return (
    <span
      className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold rounded-full px-2 py-0.5"
      style={{
        background: `${SOURCE_COLOURS[label]}1f`,
        color: SOURCE_COLOURS[label],
        border: `1px solid ${SOURCE_COLOURS[label]}44`,
      }}
    >
      {label}
    </span>
  );
}

function SavedAtNote({ resolved }: { resolved: ResolvedSetting }) {
  if (!resolved.savedAt) return null;
  let when = resolved.savedAt;
  try { when = new Date(resolved.savedAt).toLocaleString(); } catch { /* keep ISO */ }
  return (
    <span className="text-[10px] text-muted-foreground ml-2">
      Saved {when}
    </span>
  );
}

interface RowProps {
  title: string;
  description?: string;
  resolved: ResolvedSetting;
  onSave: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}

function DefaultRow({ title, description, resolved, onSave, onClear, children }: RowProps) {
  return (
    <div className="py-3 border-b border-border/40 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            <SourceChip source={resolved.source} />
          </div>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          )}
          <SavedAtNote resolved={resolved} />
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={onSave}>
            <Save className="w-3 h-3" />
            Save as my default
          </Button>
          {onClear && resolved.source === "user" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>
      <div className="ml-0">{children}</div>
    </div>
  );
}

export interface UserDefaultsSectionProps {
  scenarioOverrides?: ScenarioOverrides;
}

export function UserDefaultsSection({ scenarioOverrides }: UserDefaultsSectionProps) {
  const { toast } = useToast();
  // Force a re-render whenever the underlying defaults store changes.
  const _storeVersion = useUserDefaultsStore(s => s.savedAt);
  void _storeVersion;

  // Register audit traces for every resolved setting on mount.
  useEffect(() => {
    registerUserDefaultsTraces(scenarioOverrides);
  }, [scenarioOverrides]);

  // ── Local working values (mirror current resolved values for editing) ──────
  const projectionResolved = resolveSetting("projectionMode", scenarioOverrides, "Dashboard");
  const mcEnabledResolved  = resolveSetting("monteCarloEnabled", scenarioOverrides, "Forecast Engine");
  const taxRegimeResolved  = resolveSetting("taxPolicyRegime", scenarioOverrides, "Tax Alpha Engine");
  const propGrowthResolved = resolveSetting("propertyGrowthAssumption", scenarioOverrides, "Forecast Engine");
  const assumptionSetResolved = resolveSetting("scenarioAssumptionSet", scenarioOverrides, "Forecast Store");
  const riskResolved       = resolveSetting("riskProfile", scenarioOverrides, "Risk Radar");
  const investorResolved   = resolveSetting("investorProfile", scenarioOverrides, "Decision Engine");
  const lensResolved       = resolveSetting("strategyLens", scenarioOverrides, "Strategic Lens");

  const [projection, setProjection] = useState<ProjectionMode>(projectionResolved.value as ProjectionMode);
  const [mcEnabled, setMcEnabled]   = useState<boolean>(Boolean(mcEnabledResolved.value));
  const [taxRegime, setTaxRegime]   = useState<TaxPolicyRegimeKind>(taxRegimeResolved.value as TaxPolicyRegimeKind);
  const [propGrowth, setPropGrowth] = useState<number>(Number(propGrowthResolved.value));
  const [assumptionSet, setAssumptionSet] = useState<string>(assumptionSetResolved.value as string);
  const [risk, setRisk]             = useState<RiskProfile>(riskResolved.value as RiskProfile);
  const [investor, setInvestor]     = useState<string>(investorResolved.value as string);
  const [lens, setLens]             = useState<string>(lensResolved.value as string);

  // Reload editing state when resolved values shift (e.g. after Reset).
  const resolvedKey = useMemo(() => [
    projectionResolved.value, mcEnabledResolved.value, taxRegimeResolved.value,
    propGrowthResolved.value, assumptionSetResolved.value, riskResolved.value,
    investorResolved.value, lensResolved.value,
  ].join("|"), [projectionResolved.value, mcEnabledResolved.value, taxRegimeResolved.value,
    propGrowthResolved.value, assumptionSetResolved.value, riskResolved.value,
    investorResolved.value, lensResolved.value]);
  useEffect(() => {
    setProjection(projectionResolved.value as ProjectionMode);
    setMcEnabled(Boolean(mcEnabledResolved.value));
    setTaxRegime(taxRegimeResolved.value as TaxPolicyRegimeKind);
    setPropGrowth(Number(propGrowthResolved.value));
    setAssumptionSet(assumptionSetResolved.value as string);
    setRisk(riskResolved.value as RiskProfile);
    setInvestor(investorResolved.value as string);
    setLens(lensResolved.value as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey]);

  function onSaveProjection() {
    saveUserDefault("projectionMode", projection);
    toast({ title: "Saved", description: "Projection mode saved as your default." });
  }
  function onSaveMc() {
    saveUserDefault("monteCarloEnabled", mcEnabled);
    toast({ title: "Saved", description: `Monte Carlo ${mcEnabled ? "enabled" : "disabled"} by default.` });
  }
  function onSaveTaxRegime() {
    saveUserDefault("taxPolicyRegime", taxRegime);
    toast({ title: "Saved", description: "Tax regime saved as your default." });
  }
  function onSavePropGrowth() {
    saveUserDefault("propertyGrowthAssumption", propGrowth);
    toast({ title: "Saved", description: `Property growth saved as ${propGrowth}%.` });
  }
  function onSaveAssumptionSet() {
    saveUserDefault("scenarioAssumptionSet", assumptionSet as any);
    toast({ title: "Saved", description: "Assumption set saved as your default." });
  }
  function onSaveRisk() {
    saveUserDefault("riskProfile", risk);
    toast({ title: "Saved", description: "Risk profile saved as your default." });
  }
  function onSaveInvestor() {
    saveUserDefault("investorProfile", investor as any);
    toast({ title: "Saved", description: "Investor profile saved as your default." });
  }
  function onSaveLens() {
    saveUserDefault("strategyLens", lens as any);
    toast({ title: "Saved", description: "Strategy lens saved as your default." });
  }

  function onResetAll() {
    if (!window.confirm(
      "Reset every saved user default to System Default? " +
      "This will not affect any scenario you have saved.",
    )) return;
    resetAllDefaults();
    toast({ title: "Reset", description: "All user defaults cleared. System defaults will apply." });
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">User Defaults — Modelling Preferences</h3>
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onResetAll}>
          <RotateCcw className="w-3 h-3" />
          Reset to system defaults
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Your saved choices survive reload, redeploy, and reopen. Scenario overrides take priority,
        then your defaults, then system defaults. System defaults never overwrite your saved values.
      </p>

      {/* ── Projection mode ───────────────────────────────────────────────── */}
      <DefaultRow
        title="Projection Mode"
        description="Median, Conservative, Optimistic, or Deterministic Overlay."
        resolved={projectionResolved}
        onSave={onSaveProjection}>
        <Select value={projection} onValueChange={v => setProjection(v as ProjectionMode)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="median">Median (P50)</SelectItem>
            <SelectItem value="conservative">Conservative (P10)</SelectItem>
            <SelectItem value="optimistic">Optimistic (P90)</SelectItem>
            <SelectItem value="deterministic_overlay">Deterministic Overlay</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      {/* ── Monte Carlo enabled ───────────────────────────────────────────── */}
      <DefaultRow
        title="Monte Carlo Enabled"
        description="Whether Monte Carlo runs by default for projections."
        resolved={mcEnabledResolved}
        onSave={onSaveMc}>
        <Select value={String(mcEnabled)} onValueChange={v => setMcEnabled(v === "true")}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Enabled</SelectItem>
            <SelectItem value="false">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      {/* ── Tax regime ────────────────────────────────────────────────────── */}
      <DefaultRow
        title="Tax Policy Regime"
        description='Auto-Detect, Current Rules, Proposed 2027 Reform, or Custom Stress Test.'
        resolved={taxRegimeResolved}
        onSave={onSaveTaxRegime}>
        <Select value={taxRegime} onValueChange={v => setTaxRegime(v as TaxPolicyRegimeKind)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AUTO_DETECT">Smart Auto-Detect</SelectItem>
            <SelectItem value="CURRENT_RULES">Current Rules</SelectItem>
            <SelectItem value="PROPOSED_2027_REFORM">Proposed 2027 Reform</SelectItem>
            <SelectItem value="CUSTOM_STRESS_TEST">Custom Stress Test</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      {/* ── Property growth ───────────────────────────────────────────────── */}
      <DefaultRow
        title="Property Growth Assumption %"
        description="Used by forecast and Monte Carlo engines unless a scenario overrides."
        resolved={propGrowthResolved}
        onSave={onSavePropGrowth}>
        <Input type="number" step={0.5} value={propGrowth}
          onChange={e => setPropGrowth(parseFloat(e.target.value) || 0)}
          className="h-8 text-sm num-display max-w-[8rem]" />
      </DefaultRow>

      {/* ── Scenario assumption set ──────────────────────────────────────── */}
      <DefaultRow
        title="Scenario Assumption Set"
        description="Default preset for forecast assumptions."
        resolved={assumptionSetResolved}
        onSave={onSaveAssumptionSet}>
        <Select value={assumptionSet} onValueChange={v => setAssumptionSet(v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="conservative">Conservative</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="aggressive">Aggressive</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      {/* ── Risk profile ─────────────────────────────────────────────────── */}
      <DefaultRow
        title="Risk Profile"
        description="Drives Risk Radar and Recommendation Engine."
        resolved={riskResolved}
        onSave={onSaveRisk}>
        <Select value={risk} onValueChange={v => setRisk(v as RiskProfile)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="conservative">Conservative</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="aggressive">Aggressive</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      {/* ── Investor profile ─────────────────────────────────────────────── */}
      <DefaultRow
        title="Investor Profile"
        description="Drives the Decision Engine candidate generator."
        resolved={investorResolved}
        onSave={onSaveInvestor}>
        <Select value={investor} onValueChange={v => setInvestor(v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="conservative">Conservative</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="wealth_max">Wealth Max</SelectItem>
            <SelectItem value="cashflow_safe">Cashflow Safe</SelectItem>
            <SelectItem value="fire_focused">FIRE Focused</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      {/* ── Strategy lens ────────────────────────────────────────────────── */}
      <DefaultRow
        title="Strategy Lens"
        description="Default lens for the Strategic dashboard."
        resolved={lensResolved}
        onSave={onSaveLens}>
        <Select value={lens} onValueChange={v => setLens(v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="wealth">Wealth</SelectItem>
            <SelectItem value="cashflow">Cashflow</SelectItem>
            <SelectItem value="risk">Risk</SelectItem>
            <SelectItem value="tax">Tax</SelectItem>
            <SelectItem value="lifestyle">Lifestyle</SelectItem>
          </SelectContent>
        </Select>
      </DefaultRow>

      <div className="mt-3 text-[10px] text-muted-foreground">
        System defaults · Projection: {SYSTEM_DEFAULTS.projectionMode} · Tax: {SYSTEM_DEFAULTS.taxPolicyRegime}
        {" · "}Property growth: {SYSTEM_DEFAULTS.propertyGrowthAssumption}% · Risk: {SYSTEM_DEFAULTS.riskProfile}
      </div>
    </div>
  );
}

export default UserDefaultsSection;
