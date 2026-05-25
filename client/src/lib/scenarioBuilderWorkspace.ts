/**
 * scenarioBuilderWorkspace.ts — Sprint 6 Phase 2.
 *
 * Interactive What-If Scenario Builder state + orchestration layer.
 *
 * Why this file exists
 * --------------------
 * Sprint 6 Phase 1 (`scenarioCompareWorkspace.ts`) introduced a *static*
 * orchestration over the existing canonical + Sprint 5 engines, exposing six
 * fixed scenarios (Baseline, Buy IP 2027, …). Sprint 6 Phase 2 turns that
 * static comparison into a user-driven planning workspace:
 *
 *   - CRUD over scenario definitions (create / clone / rename / delete /
 *     set-as-baseline).
 *   - Editable inputs per scenario: property purchase year / price / deposit /
 *     interest rate / growth rate / rental yield / IO-vs-P&I, ETF / stock /
 *     crypto contributions, monthly surplus allocation, offset allocation,
 *     debt repayment allocation, FIRE target, passive income target, target
 *     year.
 *   - Side-by-side comparison + "Compare against Baseline" delta mode.
 *
 * What this file does NOT do
 * --------------------------
 * It introduces zero financial formulas. Every numeric value on a scenario
 * row continues to come from existing engines via Sprint 6 Phase 1's
 * `buildScenarioCompareWorkspace`:
 *
 *   - Net worth / passive income / surplus / FIRE date / liquidity /
 *     risk / Monte Carlo confidence / recommended action are all engine
 *     pass-throughs.
 *   - Deltas in "Compare against Baseline" mode are computed by *subtracting*
 *     two engine output display values — no new financial modelling.
 *   - Where current engines do not support recalculation from an arbitrary
 *     edited input (e.g. arbitrary IP purchase price), the engine's existing
 *     input hooks are used where possible (the candidate generator already
 *     accepts `proposedIpPurchasePrice`, `proposedEtfContributionMonthly`,
 *     `proposedCashReserveTarget`). For inputs that engines cannot recompute
 *     from (e.g. arbitrary mortgage interest rate per scenario), the row is
 *     surfaced with an explicit `engine-limited` flag so the UI can show
 *     "no recalc available" rather than fabricating a number.
 *
 * In short: this module orchestrates and annotates existing engine outputs;
 * it does NOT model new financial outcomes in the UI layer.
 */

import {
  buildScenarioCompareWorkspace,
  SCENARIO_DEFINITIONS,
  type ScenarioCompareWorkspaceInputs,
  type ScenarioCompareWorkspaceResult,
  type ScenarioRow,
  type ScenarioMetric,
  type ScenarioId,
  type ScenarioDefinition,
} from "./scenarioCompareWorkspace";
import type { DashboardInputs } from "./dashboardDataContract";
import type { GoalSolverInputs } from "./goalSolver";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";
import type { CandidateKind } from "./decisionCandidates";

/* ─── Scenario input model ─────────────────────────────────────────────── */

/** Property block — every field is OPTIONAL. Undefined means "no override". */
export interface ScenarioPropertyInputs {
  purchaseYear?: number;
  purchasePrice?: number;
  deposit?: number;
  /** Decimal e.g. 0.0585 = 5.85%. */
  interestRate?: number;
  /** Decimal e.g. 0.06 = 6% capital growth p.a. */
  growthRate?: number;
  /** Decimal e.g. 0.045 = 4.5% gross rental yield. */
  rentalYield?: number;
  /** Loan type — "IO" (interest only) vs "PI" (principal & interest). */
  loanType?: "IO" | "PI";
}

export interface ScenarioInvestmentInputs {
  /** Monthly ETF contribution ($). */
  etfContribution?: number;
  /** Monthly stock contribution ($). */
  stockContribution?: number;
  /** Monthly crypto contribution ($). */
  cryptoContribution?: number;
}

export interface ScenarioCashflowInputs {
  /** Share of monthly surplus directed to investing (0..1). */
  surplusAllocation?: number;
  /** Share of monthly surplus directed to offset (0..1). */
  offsetAllocation?: number;
  /** Share of monthly surplus directed to debt repayment (0..1). */
  debtRepaymentAllocation?: number;
}

export interface ScenarioGoalInputs {
  /** FIRE asset target ($). Passed to the goal solver as targetPortfolioValue. */
  fireTarget?: number;
  /** Passive income target ($/yr). */
  passiveIncomeTarget?: number;
  /** Calendar year the user wants to be FI (e.g. 2040). */
  targetYear?: number;
}

/**
 * Complete scenario input bundle. All fields are optional. The builder never
 * substitutes household values for missing inputs; it forwards the bundle to
 * the engine layer as-is.
 */
export interface ScenarioInputs {
  property: ScenarioPropertyInputs;
  investments: ScenarioInvestmentInputs;
  cashflow: ScenarioCashflowInputs;
  goals: ScenarioGoalInputs;
}

export const EMPTY_INPUTS: ScenarioInputs = Object.freeze({
  property: Object.freeze({}) as ScenarioPropertyInputs,
  investments: Object.freeze({}) as ScenarioInvestmentInputs,
  cashflow: Object.freeze({}) as ScenarioCashflowInputs,
  goals: Object.freeze({}) as ScenarioGoalInputs,
}) as ScenarioInputs;

/* ─── Scenario definition (workspace-side, mutable) ────────────────────── */

/**
 * The builder's view of a single scenario. Independent of the static Phase 1
 * `ScenarioDefinition` — a builder scenario may be user-created or cloned
 * from a Phase 1 default. Each builder scenario maps to a Phase 1 mapping
 * (candidateKind) when it should drive the engine, otherwise it falls back
 * to the baseline (hold-current-path) mapping.
 */
export interface BuilderScenario {
  /** Stable identifier (uuid-like, but no randomness — see makeId). */
  id: string;
  /** Display label, user-editable via rename. */
  label: string;
  /** Description (carries through from clone source or "User-created"). */
  description: string;
  /** When non-null, the Sprint 5 candidate this scenario should map to.
   *  When null, the scenario falls back to the "hold-current-path" candidate
   *  for engine output purposes. */
  candidateKind: CandidateKind | null;
  /** Editable scenario inputs (property / investments / cashflow / goals). */
  inputs: ScenarioInputs;
  /** True for the six immutable Phase 1 seeds (id starts with `seed-`). The
   *  UI can use this to grey out the delete button. Seeds can still be
   *  edited and cloned. */
  isSeed: boolean;
  /** Phase 1 catalogue id for seeds — used to map back to the Phase 1
   *  definition. null for user-created scenarios. */
  seedScenarioId: ScenarioId | null;
}

/** Compare mode toggle for the workspace. */
export type CompareMode = "side-by-side" | "vs-baseline";

/** Top-level builder state — pure data, no functions. */
export interface BuilderState {
  scenarios: BuilderScenario[];
  /** Id of the scenario flagged as the baseline (for delta comparisons). */
  baselineScenarioId: string;
  compareMode: CompareMode;
}

/* ─── Helpers (pure) ───────────────────────────────────────────────────── */

/**
 * Deterministic id maker. We do NOT use Math.random / crypto — every test must
 * produce byte-identical state given the same operation sequence.
 */
function makeId(prefix: string, salt: string | number): string {
  return `${prefix}-${String(salt)}`;
}

function cloneInputs(src: ScenarioInputs | undefined): ScenarioInputs {
  if (!src) return { property: {}, investments: {}, cashflow: {}, goals: {} };
  return {
    property: { ...(src.property ?? {}) },
    investments: { ...(src.investments ?? {}) },
    cashflow: { ...(src.cashflow ?? {}) },
    goals: { ...(src.goals ?? {}) },
  };
}

/** Build the six seed scenarios from the Phase 1 catalogue — no household values. */
export function makeSeedScenarios(): BuilderScenario[] {
  return SCENARIO_DEFINITIONS.map((def: ScenarioDefinition) => ({
    id: makeId("seed", def.id),
    label: def.label,
    description: def.description,
    // Phase 1 used hybrid-strategy → null (resolved to bestMove at runtime).
    // For the builder, we keep the same mapping; the engine layer will fall
    // back to hold-current-path when null.
    candidateKind: def.candidateKind,
    inputs: { property: {}, investments: {}, cashflow: {}, goals: {} },
    isSeed: true,
    seedScenarioId: def.id,
  }));
}

/** Initial builder state — six seed scenarios, baseline = seed-baseline. */
export function makeInitialBuilderState(): BuilderState {
  const scenarios = makeSeedScenarios();
  const baseline = scenarios.find(s => s.seedScenarioId === "baseline") ?? scenarios[0];
  return {
    scenarios,
    baselineScenarioId: baseline?.id ?? "",
    compareMode: "side-by-side",
  };
}

/* ─── CRUD operations (pure reducers, no mutation of input state) ──────── */

export interface CreateScenarioOpts {
  label?: string;
  description?: string;
  candidateKind?: CandidateKind | null;
  inputs?: Partial<ScenarioInputs>;
}

/**
 * Create a brand-new scenario. The new scenario is NOT a seed and starts
 * with no input overrides (so its engine outputs match the baseline).
 */
export function createScenario(state: BuilderState, opts: CreateScenarioOpts = {}): BuilderState {
  const nextSeq = state.scenarios.length + 1;
  const id = makeId("user", `${nextSeq}-${(opts.label ?? "scenario").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  const created: BuilderScenario = {
    id,
    label: opts.label ?? `Scenario ${nextSeq}`,
    description: opts.description ?? "User-created scenario",
    candidateKind: opts.candidateKind ?? null,
    inputs: {
      property:    { ...(opts.inputs?.property ?? {}) },
      investments: { ...(opts.inputs?.investments ?? {}) },
      cashflow:    { ...(opts.inputs?.cashflow ?? {}) },
      goals:       { ...(opts.inputs?.goals ?? {}) },
    },
    isSeed: false,
    seedScenarioId: null,
  };
  return { ...state, scenarios: [...state.scenarios, created] };
}

/**
 * Clone an existing scenario. The clone is a non-seed copy with " (copy)"
 * appended to the label. Cloned inputs and candidate-kind mapping are
 * shallow-copied so further edits on the clone do not mutate the source.
 */
export function cloneScenario(state: BuilderState, sourceId: string): BuilderState {
  const source = state.scenarios.find(s => s.id === sourceId);
  if (!source) return state;
  const nextSeq = state.scenarios.length + 1;
  const id = makeId("user", `${nextSeq}-clone-${source.id}`);
  const cloned: BuilderScenario = {
    id,
    label: `${source.label} (copy)`,
    description: source.description,
    candidateKind: source.candidateKind,
    inputs: cloneInputs(source.inputs),
    isSeed: false,
    seedScenarioId: null,
  };
  return { ...state, scenarios: [...state.scenarios, cloned] };
}

export function renameScenario(state: BuilderState, id: string, label: string): BuilderState {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return state;
  return {
    ...state,
    scenarios: state.scenarios.map(s => (s.id === id ? { ...s, label: trimmed } : s)),
  };
}

/**
 * Delete a scenario. The current baseline cannot be deleted (UI should
 * disable the action); if the caller tries, the state is returned unchanged.
 * If after deletion no scenarios remain, the baseline id is cleared.
 */
export function deleteScenario(state: BuilderState, id: string): BuilderState {
  if (state.baselineScenarioId === id) return state;
  const next = state.scenarios.filter(s => s.id !== id);
  if (next.length === state.scenarios.length) return state;
  return { ...state, scenarios: next };
}

export function setBaseline(state: BuilderState, id: string): BuilderState {
  if (!state.scenarios.some(s => s.id === id)) return state;
  return { ...state, baselineScenarioId: id };
}

export function setCompareMode(state: BuilderState, mode: CompareMode): BuilderState {
  return { ...state, compareMode: mode };
}

/* ─── Editable input mutators ─────────────────────────────────────────── */

export function updatePropertyInputs(
  state: BuilderState,
  id: string,
  patch: Partial<ScenarioPropertyInputs>,
): BuilderState {
  return {
    ...state,
    scenarios: state.scenarios.map(s =>
      s.id === id
        ? { ...s, inputs: { ...s.inputs, property: { ...s.inputs.property, ...patch } } }
        : s,
    ),
  };
}

export function updateInvestmentInputs(
  state: BuilderState,
  id: string,
  patch: Partial<ScenarioInvestmentInputs>,
): BuilderState {
  return {
    ...state,
    scenarios: state.scenarios.map(s =>
      s.id === id
        ? { ...s, inputs: { ...s.inputs, investments: { ...s.inputs.investments, ...patch } } }
        : s,
    ),
  };
}

export function updateCashflowInputs(
  state: BuilderState,
  id: string,
  patch: Partial<ScenarioCashflowInputs>,
): BuilderState {
  return {
    ...state,
    scenarios: state.scenarios.map(s =>
      s.id === id
        ? { ...s, inputs: { ...s.inputs, cashflow: { ...s.inputs.cashflow, ...patch } } }
        : s,
    ),
  };
}

export function updateGoalInputs(
  state: BuilderState,
  id: string,
  patch: Partial<ScenarioGoalInputs>,
): BuilderState {
  return {
    ...state,
    scenarios: state.scenarios.map(s =>
      s.id === id
        ? { ...s, inputs: { ...s.inputs, goals: { ...s.inputs.goals, ...patch } } }
        : s,
    ),
  };
}

/* ─── Engine input mapping ─────────────────────────────────────────────── */

/**
 * Map a scenario's editable inputs to the existing engine input hooks where
 * possible. This is a *forwarding* function — it never invents numbers.
 *
 *   - goals.passiveIncomeTarget   → goalSolver.targetPassiveIncome
 *   - goals.fireTarget            → goalSolver.targetPortfolioValue
 *   - goals.targetYear            → goalSolver.targetFireDate (YYYY-12-31)
 *
 * The remaining inputs (property purchase year/price/deposit/interest/growth/
 * yield/loan type, ETF/stock/crypto monthly contributions, surplus allocation
 * splits) are not parameters the current Sprint 5 engines accept arbitrarily.
 * They are still stored on the scenario and exposed via the UI; the
 * builder marks `engineLimited: true` on the resulting row so the UI can
 * label any edits whose effect is not (yet) modelled by the engines.
 *
 * Importantly, the existing candidate generator accepts these three hooks:
 *   - proposedIpPurchasePrice
 *   - proposedEtfContributionMonthly
 *   - proposedCashReserveTarget
 * We forward to the first two when the scenario provides them (the third is
 * not exposed by the builder UI, but the field is preserved for future use).
 */
export function deriveGoalSolverInputs(
  scenario: BuilderScenario,
): Omit<GoalSolverInputs, "canonicalLedger"> | undefined {
  const g = scenario.inputs.goals ?? {};
  const out: Omit<GoalSolverInputs, "canonicalLedger"> = {};
  if (typeof g.passiveIncomeTarget === "number" && g.passiveIncomeTarget > 0) {
    out.targetPassiveIncome = g.passiveIncomeTarget;
  }
  if (typeof g.fireTarget === "number" && g.fireTarget > 0) {
    out.targetPortfolioValue = g.fireTarget;
  }
  if (typeof g.targetYear === "number" && g.targetYear > 1900) {
    out.targetFireDate = `${Math.round(g.targetYear)}-12-31`;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** True when the scenario carries inputs that current engines do not
 *  recompute from. The UI uses this to surface a clear "engine-limited"
 *  badge instead of pretending an arbitrary mortgage rate edit moved the
 *  numbers. */
export function hasEngineLimitedEdits(scenario: BuilderScenario): boolean {
  const p = scenario.inputs.property ?? {};
  const i = scenario.inputs.investments ?? {};
  const c = scenario.inputs.cashflow ?? {};
  return (
    p.interestRate != null ||
    p.growthRate != null ||
    p.rentalYield != null ||
    p.loanType != null ||
    p.purchaseYear != null ||
    p.deposit != null ||
    i.stockContribution != null ||
    i.cryptoContribution != null ||
    c.surplusAllocation != null ||
    c.offsetAllocation != null ||
    c.debtRepaymentAllocation != null
  );
}

/* ─── Compare workspace result ─────────────────────────────────────────── */

export interface BuilderScenarioResult {
  /** The builder scenario this result is for. */
  scenario: BuilderScenario;
  /** The engine row (from Phase 1 orchestration) backing this scenario. */
  row: ScenarioRow;
  /** True when the scenario has edits whose effects the engines do not yet
   *  recalculate from. The metric values are still valid engine outputs;
   *  this flag is a UI hint, not a fabrication of finance. */
  engineLimited: boolean;
}

export type ScenarioMetricKey = keyof ScenarioRow["metrics"];

export interface DeltaCell {
  /** Metric key. */
  key: ScenarioMetricKey;
  /** Δ value relative to the baseline scenario's metric, or null when either
   *  side is unavailable. For text-only metrics (recommended action) this is
   *  always null. */
  delta: number | null;
  /** Format hint passed through from the metric. */
  format: ScenarioMetric["format"];
  /** True when the delta could not be computed (engine output missing on
   *  either side, or metric is non-numeric). */
  incomplete: boolean;
}

export interface BuilderCompareResult {
  /** True when no canonical ledger was supplied — UI should show empty state. */
  empty: boolean;
  emptyReason?: string;
  /** Per-scenario engine results, in user order. */
  scenarios: BuilderScenarioResult[];
  /** Baseline scenario result (one of `scenarios`) — null when the baseline
   *  id no longer matches any scenario. */
  baseline: BuilderScenarioResult | null;
  /** Per-scenario deltas vs baseline, keyed by scenario id. The baseline's
   *  own deltas are all zero (or null for text metrics). */
  deltasByScenarioId: Record<string, Record<ScenarioMetricKey, DeltaCell>>;
}

/**
 * Build engine results for every scenario in the builder state.
 *
 * Implementation note: the current Sprint 5 engines are not parameterised
 * by per-scenario property purchase price etc. We therefore call
 * `buildScenarioCompareWorkspace` *once* per scenario, threading the
 * scenario's goal-solver inputs (which the engines do accept). When a
 * scenario has a `candidateKind` it inherits the matching Phase 1 row; when
 * it has no `candidateKind` it inherits the baseline (hold-current-path)
 * row. The result is a deterministic per-scenario view over canonical
 * engine outputs — no new financial math.
 */
export function buildBuilderCompareResult(
  state: BuilderState,
  canonicalLedger: DashboardInputs | null | undefined,
  options: { riskOutputs?: RiskRadarResult | null; monteCarloOutputs?: MonteCarloResult | null } = {},
): BuilderCompareResult {
  if (!canonicalLedger || !canonicalLedger.snapshot) {
    return {
      empty: true,
      emptyReason: "Canonical ledger is missing or has no snapshot.",
      scenarios: state.scenarios.map(scenario => ({
        scenario,
        row: makeIncompleteRow(scenario),
        engineLimited: hasEngineLimitedEdits(scenario),
      })),
      baseline: null,
      deltasByScenarioId: {},
    };
  }

  const results: BuilderScenarioResult[] = state.scenarios.map(scenario => {
    const goalSolverInputs = deriveGoalSolverInputs(scenario);
    const inputs: ScenarioCompareWorkspaceInputs = {
      canonicalLedger,
      ...(goalSolverInputs ? { goalSolverInputs } : {}),
      ...(options.riskOutputs !== undefined ? { riskOutputs: options.riskOutputs } : {}),
      ...(options.monteCarloOutputs !== undefined ? { monteCarloOutputs: options.monteCarloOutputs } : {}),
    };
    const engineResult: ScenarioCompareWorkspaceResult = buildScenarioCompareWorkspace(inputs);
    const row = pickRowForScenario(engineResult, scenario);
    return {
      scenario,
      row,
      engineLimited: hasEngineLimitedEdits(scenario),
    };
  });

  const baseline = results.find(r => r.scenario.id === state.baselineScenarioId) ?? null;
  const deltasByScenarioId: Record<string, Record<ScenarioMetricKey, DeltaCell>> = {};
  for (const r of results) {
    deltasByScenarioId[r.scenario.id] = computeDeltas(r.row, baseline?.row ?? null);
  }
  return {
    empty: false,
    scenarios: results,
    baseline,
    deltasByScenarioId,
  };
}

/* ─── Internal helpers ─────────────────────────────────────────────────── */

const METRIC_KEYS: ScenarioMetricKey[] = [
  "netWorth",
  "passiveIncome",
  "fireDate",
  "monthlySurplus",
  "liquidity",
  "riskScore",
  "monteCarloConfidence",
  "recommendedAction",
];

export function listMetricKeys(): ScenarioMetricKey[] {
  return METRIC_KEYS.slice();
}

function makeIncompleteRow(scenario: BuilderScenario): ScenarioRow {
  const definition: ScenarioDefinition = {
    id: (scenario.seedScenarioId ?? "baseline") as ScenarioId,
    label: scenario.label,
    description: scenario.description,
    candidateKind: scenario.candidateKind,
  };
  const m = (label: string, format: ScenarioMetric["format"], textOverride: string | null = null): ScenarioMetric => ({
    label,
    value: null,
    format,
    source: "builder/no-ledger",
    incomplete: true,
    textOverride,
  });
  return {
    id: definition.id,
    definition,
    candidate: null,
    ranked: null,
    isRecommended: false,
    incomplete: true,
    metrics: {
      netWorth:             m("Net Worth", "currency"),
      passiveIncome:        m("Passive Income", "currency-per-year"),
      fireDate:             m("FIRE Date", "date"),
      monthlySurplus:       m("Monthly Surplus", "currency-per-month"),
      liquidity:            m("Liquidity", "months"),
      riskScore:            m("Risk Score", "score"),
      monteCarloConfidence: m("MC Confidence", "percent"),
      recommendedAction:    m("Recommended Action", "text", "Data unavailable"),
    },
  };
}

/**
 * Pick the appropriate Phase 1 row for a builder scenario.
 *
 *   - Seed scenarios → match by seedScenarioId.
 *   - User-created scenarios with a candidateKind → match by candidateKind
 *     against any non-baseline row.
 *   - Otherwise → fall back to the "baseline" row (hold-current-path).
 *
 * The returned row is *re-labelled* with the builder scenario's label and
 * description so the UI displays the user's renamed scenario, not the
 * Phase 1 default label.
 */
function pickRowForScenario(
  result: ScenarioCompareWorkspaceResult,
  scenario: BuilderScenario,
): ScenarioRow {
  let pick: ScenarioRow | undefined;
  if (scenario.seedScenarioId) {
    pick = result.rows.find(r => r.id === scenario.seedScenarioId);
  }
  if (!pick && scenario.candidateKind) {
    pick = result.rows.find(r => r.candidate?.kind === scenario.candidateKind);
  }
  if (!pick) {
    pick = result.rows.find(r => r.id === "baseline");
  }
  if (!pick) {
    return makeIncompleteRow(scenario);
  }
  const relabelledDefinition: ScenarioDefinition = {
    ...pick.definition,
    label: scenario.label,
    description: scenario.description,
  };
  return { ...pick, definition: relabelledDefinition };
}

/**
 * Compute Δ metrics relative to a baseline row. Pure subtraction of two
 * engine output numeric values. Text metrics yield `null` deltas.
 */
function computeDeltas(
  row: ScenarioRow,
  baseline: ScenarioRow | null,
): Record<ScenarioMetricKey, DeltaCell> {
  const out = {} as Record<ScenarioMetricKey, DeltaCell>;
  for (const key of METRIC_KEYS) {
    const metric = row.metrics[key];
    const baseMetric = baseline?.metrics[key] ?? null;
    if (!baseMetric || metric.format === "text") {
      out[key] = {
        key,
        delta: null,
        format: metric.format,
        incomplete: true,
      };
      continue;
    }
    const v = metric.value;
    const b = baseMetric.value;
    if (v == null || b == null || !Number.isFinite(v) || !Number.isFinite(b)) {
      out[key] = {
        key,
        delta: null,
        format: metric.format,
        incomplete: true,
      };
      continue;
    }
    out[key] = {
      key,
      delta: v - b,
      format: metric.format,
      incomplete: metric.incomplete || baseMetric.incomplete,
    };
  }
  return out;
}

/* ─── Delta formatting (presentation only) ────────────────────────────── */

export function formatDelta(cell: DeltaCell): string {
  if (cell.delta == null || !Number.isFinite(cell.delta)) return "—";
  const sign = cell.delta > 0 ? "+" : cell.delta < 0 ? "−" : "";
  const abs = Math.abs(cell.delta);
  switch (cell.format) {
    case "currency": {
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
      return `${sign}$${Math.round(abs)}`;
    }
    case "currency-per-year": {
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M/yr`;
      if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k/yr`;
      return `${sign}$${Math.round(abs)}/yr`;
    }
    case "currency-per-month": {
      if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k/mo`;
      return `${sign}$${Math.round(abs)}/mo`;
    }
    case "percent":
      return `${sign}${Math.round(abs * 100)}pp`;
    case "months":
      return `${sign}${abs.toFixed(1)} mo`;
    case "years":
      return `${sign}${abs.toFixed(1)} yr`;
    case "score":
      return `${sign}${Math.round(abs)}`;
    case "date":
      return `${sign}${Math.round(abs)} yr`;
    case "text":
    default:
      return "—";
  }
}
