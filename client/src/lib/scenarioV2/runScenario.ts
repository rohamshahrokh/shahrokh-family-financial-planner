/**
 * Scenario Engine V2 — runScenario (Orchestrator)
 *
 * Public entry point users invoke. Composes everything:
 *
 *   DashboardInputs + Delta[]
 *      │
 *      ▼ deriveBasePlan()        — auto-derive from snapshot, no manual fields
 *   BasePlan + initialState
 *      │
 *      ▼ buildEventStore()       — translate deltas into sorted events
 *   ScenarioEvent[]
 *      │
 *      ▼ runMonteCarlo()         — N seeded sims through pure `tick`
 *   FanChart + terminalNw[]
 *      │
 *      ▼ computeServiceability() — APRA-style metrics on median final state
 *   ServiceabilityResult
 *      │
 *      ▼ assemble                — ScenarioResult
 */

import type { DashboardInputs } from "../dashboardDataContract";
import { selectMonthlySurplus } from "../dashboardDataContract";
import { deriveBasePlan, addMonths, monthKey } from "./basePlan";
import { buildEventStore } from "./events";
import { runMonteCarlo } from "./monteCarlo";
import { computeServiceability } from "./borrowing";
import { computeRiskMetrics } from "./riskMetrics";
import { snapshotHash, stableHash } from "./determinism";
import type {
  BasePlanAssumptions,
  MonthKey,
  ScenarioDelta,
  ScenarioResult,
} from "./types";

export interface RunScenarioInput {
  /** Live dashboard inputs — same shape the dashboard uses. */
  dashboardInputs: DashboardInputs;
  /** Display name for the scenario. */
  name: string;
  /** Optional stable id (used for seeding). Defaults to `name`. */
  scenarioId?: string;
  /** Delta list. May be empty for the Base case. */
  deltas: ScenarioDelta[];
  /** Forecast horizon in months. Default 120 (10y). */
  horizonMonths?: number;
  /** Start month. Default = current month. */
  startMonth?: MonthKey;
  /** Override default rails (returns, volatility, etc). */
  assumptions?: Partial<BasePlanAssumptions>;
  /** MC sim count. Default 500 (cheap, still meaningful). 1000+ in prod. */
  simulationCount?: number;
  /** Parent seed for the entire run. Default = stable hash of scenario name + snapshot. */
  seed?: number;
}

export interface ExtendedScenarioResult extends ScenarioResult {
  /** Display name (UI convenience). */
  name: string;
  /** Reconciliation: month-0 surplus vs dashboard's selectMonthlySurplus. */
  reconciledMonthlySurplus: number;
  /** Dashboard's selectMonthlySurplus for comparison. */
  dashboardMonthlySurplus: number;
  /** True if |reconciledMonthlySurplus − dashboardMonthlySurplus| <= $1. */
  reconcilesToDashboard: boolean;
  /** Serviceability metrics on the median final state. */
  serviceability: ReturnType<typeof computeServiceability>;
  /** Real risk metrics derived from MC dispersion + median state. */
  riskMetrics: import("./riskMetrics").RiskMetrics;
  /** Cash-balance fan chart (liquidity over time). */
  cashFan: import("./monteCarlo").MonteCarloOutput["cashFan"];
  /** Median path NW trajectory (one number per month). */
  medianNwPath: number[];
  /** Median path cash trajectory. */
  medianCashPath: number[];
  /** Initial state for diagnostics. */
  initialNetWorth: number;
  /** Terminal NW samples (length = simulationCount). */
  terminalNwSamples: number[];
  /** Terminal cash samples. */
  terminalCashSamples: number[];
  /** Wall-clock runtime in ms. */
  runtimeMs: number;
  /** Sim count actually executed. */
  simulationCount: number;
  /** Horizon used. */
  horizonMonths: number;
}

export function runScenarioV2(input: RunScenarioInput): ExtendedScenarioResult {
  const horizonMonths = input.horizonMonths ?? 120;
  const startMonth = input.startMonth ?? monthKey(new Date());
  const endMonth = addMonths(startMonth, horizonMonths - 1);
  const simulationCount = input.simulationCount ?? 500;

  const derived = deriveBasePlan(input.dashboardInputs, {
    startMonth,
    assumptions: input.assumptions,
    name: `${input.name} (auto-derived)`,
  });

  const events = buildEventStore(derived.plan, input.deltas, {
    startMonth,
    endMonth,
  });

  // Seed = stable hash of (scenarioId or name, snapshotHash, deltas)
  const seedKey = {
    sid: input.scenarioId ?? input.name,
    snap: derived.plan.snapshotHash,
    deltas: input.deltas.map((d) => ({
      t: d.deltaType,
      m: d.activationMonth,
      p: d.params,
      i: d.idempotencyKey,
    })),
  };
  const seed = input.seed ?? hashToInt(seedKey);

  const baseMonthlyIncome = derived.ttmIncome / 12;
  const baseMonthlyExpenses = derived.ttmExpenseLedger / 12
    + (derived.expensesIncludeDebt ? 0 : derived.monthlyDebtService);

  const mc = runMonteCarlo({
    plan: derived.plan,
    initialState: derived.initialState,
    events,
    startMonth,
    endMonth,
    baseMonthlyIncome: derived.ttmIncome / 12,
    baseMonthlyExpenses,
    expensesIncludeDebt: derived.expensesIncludeDebt,
    simulationCount,
    parentSeed: seed,
  });

  // Serviceability on the median final state — uses the same mortgage rate
  // the BasePlan was derived with.
  const service = computeServiceability({
    state: mc.medianFinalState,
    monthlyGrossIncome: mc.medianFinalState.ttmIncome / 12,
    monthlyLivingExpenses: mc.medianFinalState.ttmExpenses / 12,
    mortgageRate: derived.plan.assumptions.mortgageRate,
  });

  // Sort terminal samples for risk metrics + compute median expenses for runway.
  const sortedTerminal = [...mc.terminalNw].sort((a, b) => a - b);
  const medianTerminalNw = sortedTerminal[Math.floor(sortedTerminal.length / 2)];
  const risk = computeRiskMetrics({
    terminalNw: mc.terminalNw,
    terminalCash: mc.terminalCash,
    medianFinalState: mc.medianFinalState,
    medianTerminalNw,
    monthlyExpenses: mc.medianFinalState.ttmExpenses / 12,
  });

  const dashboardSurplus = selectMonthlySurplus(input.dashboardInputs);
  const reconciledSurplus = derived.reconciledMonthlySurplus;

  return {
    scenarioId: input.scenarioId ?? input.name,
    name: input.name,
    snapshotHash: derived.plan.snapshotHash,
    seed,
    runTimestamp: "1970-01-01T00:00:00Z", // deterministic; UI assigns real timestamp
    netWorthFan: mc.fan,
    confidence: [], // Phase 12
    risk: null,    // Phase 10 (legacy field — real metrics live on riskMetrics)
    attribution: null, // Phase 13
    serviceability: service,
    riskMetrics: risk,
    cashFan: mc.cashFan,
    medianNwPath: mc.medianNwPath,
    medianCashPath: mc.medianCashPath,
    reconciledMonthlySurplus: reconciledSurplus,
    dashboardMonthlySurplus: dashboardSurplus,
    reconcilesToDashboard: Math.abs(reconciledSurplus - dashboardSurplus) <= 1,
    initialNetWorth: netWorthOf(derived.initialState),
    terminalNwSamples: mc.terminalNw,
    terminalCashSamples: mc.terminalCash,
    runtimeMs: mc.runtimeMs,
    simulationCount: mc.simulationCount,
    horizonMonths,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function netWorthOf(s: Parameters<typeof computeServiceability>[0]["state"]): number {
  const propsNet = s.properties.reduce(
    (acc, p) => acc + (p.marketValue - p.loanBalance),
    0,
  );
  return s.cash + s.etfBalance + s.cryptoBalance + s.superRoham + s.superFara + propsNet;
}

function hashToInt(v: unknown): number {
  // Hash the full canonical JSON, not the whitelisted snapshot subset.
  const h = stableHash(v);
  return parseInt(h, 16) >>> 0;
}
