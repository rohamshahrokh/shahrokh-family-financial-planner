/**
 * Scenario Engine V2 — runScenario (Orchestrator, Production Build)
 *
 *   DashboardInputs + Delta[]
 *      │
 *      ▼ deriveBasePlan()        — auto-derive from snapshot, no manual fields
 *   BasePlan + initialState
 *      │
 *      ▼ buildEventStore()       — translate all 17 delta types into events
 *   ScenarioEvent[]
 *      │
 *      ▼ runMonteCarlo()         — N seeded sims, correlated draws,
 *                                  Vasicek rates, fat tails, crypto jumps,
 *                                  stochastic vacancy, inflation regimes
 *   FanChart + terminal samples + stress probabilities
 *      │
 *      ▼ computeServiceability() — APRA buffered metrics on median final state
 *   ServiceabilityResult
 *      │
 *      ▼ computeRiskMetrics()    — volatility, downside, leverage, liquidity,
 *                                  concentration, sequence dispersion
 *      │
 *      ▼ assemble                — ExtendedScenarioResult
 */

import type { DashboardInputs } from "../dashboardDataContract";
import { selectMonthlySurplus } from "../dashboardDataContract";
import { deriveBasePlan, addMonths, monthKey } from "./basePlan";
import { buildEventStore } from "./events";
import { runMonteCarlo } from "./monteCarlo";
import { computeServiceability } from "./borrowing";
import { computeRiskMetrics } from "./riskMetrics";
import { sequenceRiskMetric } from "./stochastic";
import { stableHash } from "./determinism";
import type {
  BasePlanAssumptions,
  MonthKey,
  ScenarioDelta,
  ScenarioResult,
} from "./types";

export interface RunScenarioInput {
  dashboardInputs: DashboardInputs;
  name: string;
  scenarioId?: string;
  deltas: ScenarioDelta[];
  horizonMonths?: number;
  startMonth?: MonthKey;
  assumptions?: Partial<BasePlanAssumptions>;
  simulationCount?: number;
  seed?: number;
  /** Pass through to MC: HELP debt + private hospital cover for accurate tax. */
  hasHelpDebt?: boolean;
  hasPrivateHospitalCover?: boolean;
  /** Toggle fat tails (default true). */
  useFatTails?: boolean;
}

export interface ExtendedScenarioResult extends ScenarioResult {
  name: string;
  reconciledMonthlySurplus: number;
  dashboardMonthlySurplus: number;
  reconcilesToDashboard: boolean;
  serviceability: ReturnType<typeof computeServiceability>;
  riskMetrics: import("./riskMetrics").RiskMetrics;
  cashFan: import("./monteCarlo").MonteCarloOutput["cashFan"];
  medianNwPath: number[];
  medianCashPath: number[];
  initialNetWorth: number;
  terminalNwSamples: number[];
  terminalCashSamples: number[];
  runtimeMs: number;
  simulationCount: number;
  horizonMonths: number;
  /** Stress probabilities exposed by the MC engine. */
  negativeEquityProbability: number;
  liquidityStressProbability: number;
  refinancePressureProbability: number;
  /** Probability the household becomes insolvent within the horizon. */
  defaultProbability: number;
  /** Median month-index (0-based) when default fires across defaulting sims (null if 0%). */
  medianDefaultMonth: number | null;
  /** Median month-index when liquidity stress first fires. */
  medianLiquidityFirstMonth: number | null;
  /** Median month-index when negative equity first fires. */
  medianNegEquityFirstMonth: number | null;
  /** Dispersion metrics (sequence-of-returns risk surrogate). */
  sequenceDispersion: ReturnType<typeof sequenceRiskMetric>;
  /** Terminal short-rate samples (for narrative). */
  terminalRates: number[];
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
    useFatTails: input.useFatTails ?? true,
    hasHelpDebt: input.hasHelpDebt,
    hasPrivateHospitalCover: input.hasPrivateHospitalCover,
  });

  const service = computeServiceability({
    state: mc.medianFinalState,
    monthlyGrossIncome: mc.medianFinalState.ttmIncome / 12,
    monthlyLivingExpenses: mc.medianFinalState.ttmExpenses / 12,
    mortgageRate: derived.plan.assumptions.mortgageRate,
  });

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

  const dispersion = sequenceRiskMetric(mc.terminalNw);

  return {
    scenarioId: input.scenarioId ?? input.name,
    name: input.name,
    snapshotHash: derived.plan.snapshotHash,
    seed,
    runTimestamp: "1970-01-01T00:00:00Z",
    netWorthFan: mc.fan,
    confidence: [],
    risk: null,
    attribution: null,
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
    negativeEquityProbability: mc.negativeEquityProbability,
    liquidityStressProbability: mc.liquidityStressProbability,
    refinancePressureProbability: mc.refinancePressureProbability,
    defaultProbability: mc.defaultProbability,
    medianDefaultMonth: mc.medianDefaultMonth,
    medianLiquidityFirstMonth: mc.medianLiquidityFirstMonth,
    medianNegEquityFirstMonth: mc.medianNegEquityFirstMonth,
    sequenceDispersion: dispersion,
    terminalRates: mc.terminalRates,
  };
}

function netWorthOf(s: Parameters<typeof computeServiceability>[0]["state"]): number {
  const propsNet = s.properties.reduce(
    (acc, p) => acc + (p.marketValue - p.loanBalance),
    0,
  );
  return s.cash + s.etfBalance + s.cryptoBalance + s.superRoham + s.superFara + propsNet;
}

function hashToInt(v: unknown): number {
  const h = stableHash(v);
  return parseInt(h, 16) >>> 0;
}
