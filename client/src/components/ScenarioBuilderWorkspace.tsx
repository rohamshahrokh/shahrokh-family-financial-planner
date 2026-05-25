/**
 * ScenarioBuilderWorkspace.tsx — Sprint 6 Phase 2.
 *
 * Interactive What-If Scenario Builder. Lets the user create/clone/rename/
 * delete scenarios, set a baseline, edit scenario inputs (property,
 * investments, cashflow, goals), and switch between side-by-side vs
 * compare-against-baseline modes.
 *
 * Strict separation: every numeric value rendered is sourced from
 * `scenarioBuilderWorkspace.ts`, which in turn is a pass-through over
 * `scenarioCompareWorkspace.ts` and the canonical / Sprint 5 engines.
 * This component never computes its own financial outcomes. Deltas in
 * vs-baseline mode are subtractions of two engine output display values.
 */

import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import type { RiskRadarResult } from "@/lib/riskEngine";
import type { MonteCarloResult } from "@/lib/forecastStore";
import { formatScenarioMetric } from "@/lib/scenarioCompareWorkspace";
import {
  buildBuilderCompareResult,
  cloneScenario,
  createScenario,
  deleteScenario,
  formatDelta,
  listMetricKeys,
  makeInitialBuilderState,
  renameScenario,
  setBaseline,
  setCompareMode,
  updateCashflowInputs,
  updateGoalInputs,
  updateInvestmentInputs,
  updatePropertyInputs,
  type BuilderScenario,
  type BuilderState,
  type CompareMode,
  type ScenarioMetricKey,
} from "@/lib/scenarioBuilderWorkspace";

/* ─── Props ────────────────────────────────────────────────────────────── */

export interface ScenarioBuilderWorkspaceProps {
  canonicalLedger: DashboardInputs | null | undefined;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
  /** Optional initial state injection — used by tests/server rendering. */
  initialState?: BuilderState;
  className?: string;
}

/* ─── Small input primitives (consistent with the rest of the app) ─────── */

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  testid: string;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}

function NumberField({ label, value, onChange, testid, step, min, max, placeholder }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs" data-testid={`${testid}-field`}>
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder ?? "—"}
        onChange={e => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        className="bg-background border border-border rounded px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
        data-testid={testid}
      />
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T | undefined) => void;
  testid: string;
}

function SelectField<T extends string>({ label, value, options, onChange, testid }: SelectFieldProps<T>) {
  return (
    <label className="flex flex-col gap-1 text-xs" data-testid={`${testid}-field`}>
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={e => onChange((e.target.value || undefined) as T | undefined)}
        className="bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
        data-testid={testid}
      >
        <option value="">—</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/* ─── Scenario editor card ─────────────────────────────────────────────── */

interface ScenarioEditorProps {
  scenario: BuilderScenario;
  isBaseline: boolean;
  onRename: (label: string) => void;
  onClone: () => void;
  onDelete: () => void;
  onSetBaseline: () => void;
  onPatchProperty: (patch: Partial<BuilderScenario["inputs"]["property"]>) => void;
  onPatchInvestments: (patch: Partial<BuilderScenario["inputs"]["investments"]>) => void;
  onPatchCashflow: (patch: Partial<BuilderScenario["inputs"]["cashflow"]>) => void;
  onPatchGoals: (patch: Partial<BuilderScenario["inputs"]["goals"]>) => void;
}

function ScenarioEditor(props: ScenarioEditorProps) {
  const s = props.scenario;
  const tid = `scenario-editor-${s.id}`;
  return (
    <div
      className="rounded-lg border border-border bg-card p-3 flex flex-col gap-3"
      data-testid={tid}
      data-scenario-id={s.id}
      data-baseline={props.isBaseline ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-2">
        <input
          type="text"
          value={s.label}
          onChange={e => props.onRename(e.target.value)}
          className="bg-transparent border-b border-border text-sm font-semibold text-foreground focus:outline-none focus:border-emerald-500/60 flex-1"
          data-testid={`${tid}-rename`}
          aria-label="Scenario name"
        />
        {props.isBaseline ? (
          <span
            className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30"
            data-testid={`${tid}-baseline-badge`}
          >
            BASELINE
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.onClone}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
          data-testid={`${tid}-clone`}
        >
          Clone
        </button>
        <button
          type="button"
          onClick={props.onSetBaseline}
          disabled={props.isBaseline}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
          data-testid={`${tid}-set-baseline`}
        >
          Set as baseline
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          disabled={props.isBaseline || s.isSeed}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
          data-testid={`${tid}-delete`}
          title={s.isSeed ? "Seed scenarios cannot be deleted" : props.isBaseline ? "Baseline cannot be deleted" : "Delete scenario"}
        >
          Delete
        </button>
      </div>

      <details className="text-xs" data-testid={`${tid}-inputs-property-group`}>
        <summary className="cursor-pointer text-muted-foreground">Property</summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <NumberField label="Purchase year"  value={s.inputs.property.purchaseYear}  onChange={v => props.onPatchProperty({ purchaseYear: v })}  testid={`${tid}-input-property-purchase-year`} step={1} />
          <NumberField label="Purchase price ($)" value={s.inputs.property.purchasePrice} onChange={v => props.onPatchProperty({ purchasePrice: v })} testid={`${tid}-input-property-purchase-price`} step={1000} min={0} />
          <NumberField label="Deposit ($)"    value={s.inputs.property.deposit}       onChange={v => props.onPatchProperty({ deposit: v })}       testid={`${tid}-input-property-deposit`} step={1000} min={0} />
          <NumberField label="Interest rate (decimal)" value={s.inputs.property.interestRate} onChange={v => props.onPatchProperty({ interestRate: v })} testid={`${tid}-input-property-interest-rate`} step={0.001} min={0} max={1} />
          <NumberField label="Growth rate (decimal)"   value={s.inputs.property.growthRate}   onChange={v => props.onPatchProperty({ growthRate: v })}   testid={`${tid}-input-property-growth-rate`} step={0.001} min={0} max={1} />
          <NumberField label="Rental yield (decimal)"  value={s.inputs.property.rentalYield}  onChange={v => props.onPatchProperty({ rentalYield: v })}  testid={`${tid}-input-property-rental-yield`} step={0.001} min={0} max={1} />
          <SelectField label="Loan type" value={s.inputs.property.loanType} onChange={v => props.onPatchProperty({ loanType: v })} testid={`${tid}-input-property-loan-type`} options={[{ value: "IO", label: "Interest only" }, { value: "PI", label: "Principal & interest" }]} />
        </div>
      </details>

      <details className="text-xs" data-testid={`${tid}-inputs-investments-group`}>
        <summary className="cursor-pointer text-muted-foreground">Investments</summary>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <NumberField label="ETF /mo"    value={s.inputs.investments.etfContribution}    onChange={v => props.onPatchInvestments({ etfContribution: v })}    testid={`${tid}-input-investments-etf`} step={50} min={0} />
          <NumberField label="Stocks /mo" value={s.inputs.investments.stockContribution}  onChange={v => props.onPatchInvestments({ stockContribution: v })}  testid={`${tid}-input-investments-stock`} step={50} min={0} />
          <NumberField label="Crypto /mo" value={s.inputs.investments.cryptoContribution} onChange={v => props.onPatchInvestments({ cryptoContribution: v })} testid={`${tid}-input-investments-crypto`} step={50} min={0} />
        </div>
      </details>

      <details className="text-xs" data-testid={`${tid}-inputs-cashflow-group`}>
        <summary className="cursor-pointer text-muted-foreground">Cashflow allocation</summary>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <NumberField label="Surplus → invest" value={s.inputs.cashflow.surplusAllocation} onChange={v => props.onPatchCashflow({ surplusAllocation: v })} testid={`${tid}-input-cashflow-surplus`} step={0.05} min={0} max={1} />
          <NumberField label="Surplus → offset" value={s.inputs.cashflow.offsetAllocation}  onChange={v => props.onPatchCashflow({ offsetAllocation: v })}  testid={`${tid}-input-cashflow-offset`} step={0.05} min={0} max={1} />
          <NumberField label="Surplus → debt"   value={s.inputs.cashflow.debtRepaymentAllocation} onChange={v => props.onPatchCashflow({ debtRepaymentAllocation: v })} testid={`${tid}-input-cashflow-debt`} step={0.05} min={0} max={1} />
        </div>
      </details>

      <details className="text-xs" data-testid={`${tid}-inputs-goals-group`}>
        <summary className="cursor-pointer text-muted-foreground">Goals</summary>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <NumberField label="FIRE target ($)"        value={s.inputs.goals.fireTarget}          onChange={v => props.onPatchGoals({ fireTarget: v })}          testid={`${tid}-input-goals-fire-target`} step={10000} min={0} />
          <NumberField label="Passive income ($/yr)"  value={s.inputs.goals.passiveIncomeTarget} onChange={v => props.onPatchGoals({ passiveIncomeTarget: v })} testid={`${tid}-input-goals-passive-target`} step={1000} min={0} />
          <NumberField label="Target year"            value={s.inputs.goals.targetYear}          onChange={v => props.onPatchGoals({ targetYear: v })}          testid={`${tid}-input-goals-target-year`} step={1} min={2020} max={2100} />
        </div>
      </details>
    </div>
  );
}

/* ─── Compare table (renders engine output + optional Δ vs baseline) ───── */

const METRIC_LABELS: Record<ScenarioMetricKey, string> = {
  netWorth:             "Net Worth",
  passiveIncome:        "Passive Income",
  fireDate:             "FIRE Date",
  monthlySurplus:       "Monthly Surplus",
  liquidity:            "Liquidity",
  riskScore:            "Risk Score",
  monteCarloConfidence: "MC Confidence",
  recommendedAction:    "Recommended Action",
};

interface CompareTableProps {
  result: ReturnType<typeof buildBuilderCompareResult>;
  mode: CompareMode;
}

function CompareTable({ result, mode }: CompareTableProps) {
  const keys = listMetricKeys();
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-card"
      data-testid="scenario-builder-compare-table-wrapper"
    >
      <table className="w-full text-sm" data-testid="scenario-builder-compare-table" data-compare-mode={mode}>
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left text-xs uppercase tracking-wider font-medium text-muted-foreground p-3">Metric</th>
            {result.scenarios.map(r => (
              <th
                key={r.scenario.id}
                className={`text-left text-xs font-semibold p-3 whitespace-nowrap ${result.baseline?.scenario.id === r.scenario.id ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
                data-testid={`scenario-builder-compare-table-header-${r.scenario.id}`}
              >
                {r.scenario.label}
                {result.baseline?.scenario.id === r.scenario.id ? (
                  <span
                    className="ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30"
                    data-testid={`scenario-builder-compare-table-baseline-${r.scenario.id}`}
                  >
                    BASELINE
                  </span>
                ) : null}
                {r.engineLimited ? (
                  <span
                    className="ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400"
                    data-testid={`scenario-builder-compare-table-engine-limited-${r.scenario.id}`}
                    title="Some edits are not yet recomputed by the canonical engines."
                  >
                    ENGINE-LIMITED
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map(key => (
            <tr key={key} className="border-b border-border last:border-b-0" data-testid={`scenario-builder-compare-table-row-${key}`}>
              <td className="text-xs text-muted-foreground p-3 font-medium whitespace-nowrap">{METRIC_LABELS[key]}</td>
              {result.scenarios.map(r => {
                const m = r.row.metrics[key];
                const delta = result.deltasByScenarioId[r.scenario.id]?.[key];
                const incomplete = m.incomplete;
                const baseRow = result.baseline?.scenario.id === r.scenario.id;
                const showDelta = mode === "vs-baseline" && !baseRow;
                return (
                  <td
                    key={r.scenario.id}
                    className={`p-3 text-sm tabular-nums ${incomplete ? "opacity-70 italic" : ""}`}
                    data-testid={`scenario-builder-compare-table-cell-${r.scenario.id}-${key}`}
                    title={m.source}
                  >
                    <div data-testid={`scenario-builder-compare-table-value-${r.scenario.id}-${key}`}>
                      {formatScenarioMetric(m)}
                    </div>
                    {showDelta && delta ? (
                      <div
                        className={`text-[10px] mt-0.5 ${delta.delta == null ? "text-muted-foreground" : delta.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta.delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                        data-testid={`scenario-builder-compare-table-delta-${r.scenario.id}-${key}`}
                      >
                        Δ {formatDelta(delta)}
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Mobile scenario rows (compact stacked cards) ─────────────────────── */

interface ScenarioRowCardProps {
  result: ReturnType<typeof buildBuilderCompareResult>;
  scenarioId: string;
  mode: CompareMode;
}

function ScenarioRowCard({ result, scenarioId, mode }: ScenarioRowCardProps) {
  const entry = result.scenarios.find(r => r.scenario.id === scenarioId);
  if (!entry) return null;
  const tid = `scenario-builder-row-${scenarioId}`;
  const isBaseline = result.baseline?.scenario.id === scenarioId;
  const keys = listMetricKeys();
  return (
    <div
      className={`rounded-lg border bg-card p-3 ${isBaseline ? "border-emerald-500/50" : "border-border"}`}
      data-testid={tid}
      data-scenario-id={scenarioId}
      data-baseline={isBaseline ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-foreground" data-testid={`${tid}-label`}>{entry.scenario.label}</div>
        <div className="flex items-center gap-1">
          {isBaseline ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400" data-testid={`${tid}-baseline-badge`}>BASELINE</span>
          ) : null}
          {entry.engineLimited ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400" data-testid={`${tid}-engine-limited`}>ENGINE-LIMITED</span>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {keys.map(key => {
          const m = entry.row.metrics[key];
          const delta = result.deltasByScenarioId[scenarioId]?.[key];
          const showDelta = mode === "vs-baseline" && !isBaseline;
          return (
            <div key={key} className="flex flex-col gap-0.5" data-testid={`${tid}-cell-${key}`}>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{METRIC_LABELS[key]}</span>
              <span className={`text-sm font-semibold tabular-nums ${m.incomplete ? "opacity-70 italic" : ""}`} data-testid={`${tid}-value-${key}`}>{formatScenarioMetric(m)}</span>
              {showDelta && delta ? (
                <span
                  className={`text-[10px] ${delta.delta == null ? "text-muted-foreground" : delta.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta.delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                  data-testid={`${tid}-delta-${key}`}
                >
                  Δ {formatDelta(delta)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Root component ───────────────────────────────────────────────────── */

export function ScenarioBuilderWorkspace(props: ScenarioBuilderWorkspaceProps) {
  const [state, setState] = useState<BuilderState>(() => props.initialState ?? makeInitialBuilderState());

  const result = useMemo(
    () =>
      buildBuilderCompareResult(state, props.canonicalLedger, {
        ...(props.riskOutputs !== undefined ? { riskOutputs: props.riskOutputs } : {}),
        ...(props.monteCarloOutputs !== undefined ? { monteCarloOutputs: props.monteCarloOutputs } : {}),
      }),
    [state, props.canonicalLedger, props.riskOutputs, props.monteCarloOutputs],
  );

  const onCreate = useCallback(() => {
    setState(prev => createScenario(prev));
  }, []);

  const onClone = useCallback((id: string) => {
    setState(prev => cloneScenario(prev, id));
  }, []);

  const onRename = useCallback((id: string, label: string) => {
    setState(prev => renameScenario(prev, id, label));
  }, []);

  const onDelete = useCallback((id: string) => {
    setState(prev => deleteScenario(prev, id));
  }, []);

  const onSetBaseline = useCallback((id: string) => {
    setState(prev => setBaseline(prev, id));
  }, []);

  const onChangeMode = useCallback((mode: CompareMode) => {
    setState(prev => setCompareMode(prev, mode));
  }, []);

  return (
    <div className={`flex flex-col gap-4 ${props.className ?? ""}`} data-testid="scenario-builder-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-foreground" data-testid="scenario-builder-workspace-title">
            Scenario Builder — What-If
          </h2>
          <p className="text-xs text-muted-foreground" data-testid="scenario-builder-workspace-subtitle">
            Create, clone, rename, or delete scenarios. Edit assumptions on the left; every metric on the right is sourced from the canonical engines. Switch to "Compare vs Baseline" to see deltas.
          </p>
        </div>
        <div className="flex items-center gap-2" data-testid="scenario-builder-workspace-actions">
          <button
            type="button"
            onClick={onCreate}
            className="text-sm px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            data-testid="scenario-builder-create"
          >
            + New scenario
          </button>
          <div className="inline-flex rounded border border-border overflow-hidden" data-testid="scenario-builder-mode-toggle">
            <button
              type="button"
              onClick={() => onChangeMode("side-by-side")}
              className={`text-xs px-3 py-1.5 ${state.compareMode === "side-by-side" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
              data-testid="scenario-builder-mode-side-by-side"
              data-active={state.compareMode === "side-by-side" ? "true" : "false"}
            >
              Side-by-side
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("vs-baseline")}
              className={`text-xs px-3 py-1.5 border-l border-border ${state.compareMode === "vs-baseline" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
              data-testid="scenario-builder-mode-vs-baseline"
              data-active={state.compareMode === "vs-baseline" ? "true" : "false"}
            >
              Compare vs Baseline
            </button>
          </div>
        </div>
      </div>

      {result.empty ? (
        <div
          className="rounded-lg border border-dashed border-border bg-card p-6 text-center"
          data-testid="scenario-builder-workspace-empty"
        >
          <div className="text-sm font-medium text-foreground">Scenario Builder is waiting on the canonical ledger.</div>
          <div className="text-xs text-muted-foreground mt-2">Once the household snapshot is loaded, every scenario row will render canonical engine outputs.</div>
          <div className="text-[10px] text-muted-foreground mt-2 font-mono" data-testid="scenario-builder-workspace-empty-reason">{result.emptyReason ?? "no-ledger"}</div>
        </div>
      ) : null}

      {/* Editors — left/top column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="scenario-builder-editors">
        {state.scenarios.map(s => (
          <ScenarioEditor
            key={s.id}
            scenario={s}
            isBaseline={state.baselineScenarioId === s.id}
            onRename={(label) => onRename(s.id, label)}
            onClone={() => onClone(s.id)}
            onDelete={() => onDelete(s.id)}
            onSetBaseline={() => onSetBaseline(s.id)}
            onPatchProperty={(patch) => setState(prev => updatePropertyInputs(prev, s.id, patch))}
            onPatchInvestments={(patch) => setState(prev => updateInvestmentInputs(prev, s.id, patch))}
            onPatchCashflow={(patch) => setState(prev => updateCashflowInputs(prev, s.id, patch))}
            onPatchGoals={(patch) => setState(prev => updateGoalInputs(prev, s.id, patch))}
          />
        ))}
      </div>

      {/* Compare table — desktop */}
      {!result.empty ? (
        <div className="hidden lg:block" data-testid="scenario-builder-compare-table-desktop-wrapper">
          <CompareTable result={result} mode={state.compareMode} />
        </div>
      ) : null}

      {/* Compare cards — mobile/stacked */}
      {!result.empty ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden" data-testid="scenario-builder-compare-cards">
          {state.scenarios.map(s => (
            <ScenarioRowCard key={s.id} result={result} scenarioId={s.id} mode={state.compareMode} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ScenarioBuilderWorkspace;
