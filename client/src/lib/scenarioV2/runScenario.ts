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
import {
  selectMonthlySurplus,
  selectCanonicalNetWorth,
  reconcileNetWorth,
  type CanonicalNetWorth,
  type NwReconciliation,
} from "../dashboardDataContract";
import { deriveBasePlan, addMonths, monthKey, netWorthOfState } from "./basePlan";
import { buildEventStore } from "./events";
import { runMonteCarlo } from "./monteCarlo";
import { computeServiceability } from "./borrowing";
import { computeRiskMetrics } from "./riskMetrics";
import { sequenceRiskMetric } from "./stochastic";
import { stableHash } from "./determinism";
import { computeSurvivalMetrics, type SurvivalMetrics } from "./survival";
import { buildForcedSaleReport, type ForcedSaleReport } from "./forcedSale";
import type { WageShockParams } from "./wageShock";
import { DEFAULT_WAGE_SHOCK } from "./wageShock";
import type {
  HouseholdComposition,
  HouseholdCompositionKind,
  HemExpenseMode,
} from "./household";
import type {
  BasePlanAssumptions,
  MonthKey,
  PortfolioState,
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
  /**
   * Sprint 2B — optional household composition. Drives HEM serviceability
   * resolution. Absent value preserves Sprint 2A behaviour exactly.
   */
  householdComposition?: HouseholdComposition | HouseholdCompositionKind | null;
  /** Sprint 2B — HEM expense mode for serviceability. Default ACTUAL. */
  hemMode?: HemExpenseMode;
  /**
   * Sprint 2B — wage-shock parameters. When omitted no stochastic income
   * shock is layered onto the Monte Carlo path.
   */
  wageShock?: WageShockParams | null;
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
  /** Probability cash drops to ≤0 in any month (true exhaustion, distinct from buffer warning). */
  liquidityExhaustionProbability: number;
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
  /** Per-sim max drawdown samples (0..1) — peak-to-trough on NW path. */
  maxDrawdownSamples: number[];
  /** Terminal NW samples sorted ascending (so charts/tail metrics don't re-sort). */
  terminalNwSorted: number[];
  /** Canonical dashboard NW breakdown (audit fix P1.1). */
  canonicalNetWorth: CanonicalNetWorth;
  /** Engine-vs-dashboard NW reconciliation result. */
  netWorthReconciliation: NwReconciliation;
  /** Non-fatal warnings collected during the run (e.g. reconciliation drift). */
  warnings: string[];
  /**
   * Sprint 2B — Survival Engine metrics. Always populated (the engine
   * computes survival/insolvency/recovery as a thin pass over MC outputs).
   */
  survival: SurvivalMetrics;
  /** Sprint 2B — Forced sale reporting derived from MC final states. */
  forcedSaleReport: ForcedSaleReport;
  /**
   * Sprint 28B — terminal portfolio state from the median-best Monte Carlo
   * sim. Surfaced (read-only) so the Action Roadmap's Net Worth Attribution
   * panel can break down the engine's NW into asset classes without re-running
   * the engine. Sourced directly from `mc.medianFinalState`.
   */
  medianFinalState: PortfolioState;
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

  // Audit fix P1.1: reconcile engine initial NW against the dashboard's
  // canonical NW. Any drift > $1 indicates a scope mismatch (the original bug
  // was a $196k silent gap). Warnings flow into the result; in dev we throw
  // so the discrepancy is impossible to ignore.
  const warnings: string[] = [];
  const canonicalNetWorth = selectCanonicalNetWorth(input.dashboardInputs);
  const engineInitialNw = netWorthOfState(derived.initialState);
  const nwRecon = reconcileNetWorth(canonicalNetWorth, engineInitialNw);
  if (nwRecon.status === "FAIL") {
    const msg = `NW reconciliation FAIL: dashboard $${nwRecon.dashboard.toLocaleString("en-AU")} vs engine $${nwRecon.engine.toLocaleString("en-AU")} (diff $${nwRecon.diff.toLocaleString("en-AU")})`;
    warnings.push(msg);
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
      throw new Error(`[scenarioV2] ${msg}`);
    }
  }

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
    // Sprint 3B H-2 — default wage shock is now ON unless the caller
    // explicitly passes `null` to opt out. Survival, VaR/CVaR, and Risk
    // Radar all expect employment risk to be in the canonical fan; the
    // previous default of `null` produced shock-free survival metrics that
    // looked artificially benign. Callers that already pass an explicit
    // `wageShock` (decision engine, scenario-compare-v2) are unaffected.
    wageShock: input.wageShock === undefined
      ? DEFAULT_WAGE_SHOCK
      : input.wageShock,
  });

  const service = computeServiceability({
    state: mc.medianFinalState,
    monthlyGrossIncome: mc.medianFinalState.ttmIncome / 12,
    monthlyLivingExpenses: mc.medianFinalState.ttmExpenses / 12,
    mortgageRate: derived.plan.assumptions.mortgageRate,
    householdComposition: input.householdComposition ?? null,
    hemMode: input.hemMode,
  });

  const survival = computeSurvivalMetrics({
    simulationCount: mc.simulationCount,
    defaultMonthBySim: mc.defaultMonthBySim,
    liquidityFirstMonthBySim: mc.liquidityFirstMonthBySim,
    terminalNwBySim: mc.terminalNw,
    horizonMonths,
  });

  const forcedSaleReport = buildForcedSaleReport({
    finalStates: mc.finalStates,
    terminalNwBySim: mc.terminalNw,
  });

  const sortedTerminal = mc.terminalNwSorted;
  const medianTerminalNw = sortedTerminal[Math.floor(sortedTerminal.length / 2)];
  const initialNetWorth = netWorthOfState(derived.initialState);
  const risk = computeRiskMetrics({
    terminalNw: mc.terminalNw,
    terminalCash: mc.terminalCash,
    medianFinalState: mc.medianFinalState,
    medianTerminalNw,
    monthlyExpenses: mc.medianFinalState.ttmExpenses / 12,
    initialNetWorth,
    maxDrawdownSamples: mc.maxDrawdownSamples,
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
    initialNetWorth,
    terminalNwSamples: mc.terminalNw,
    terminalCashSamples: mc.terminalCash,
    runtimeMs: mc.runtimeMs,
    simulationCount: mc.simulationCount,
    horizonMonths,
    negativeEquityProbability: mc.negativeEquityProbability,
    liquidityStressProbability: mc.liquidityStressProbability,
    refinancePressureProbability: mc.refinancePressureProbability,
    defaultProbability: mc.defaultProbability,
    liquidityExhaustionProbability: mc.liquidityExhaustionProbability,
    medianDefaultMonth: mc.medianDefaultMonth,
    medianLiquidityFirstMonth: mc.medianLiquidityFirstMonth,
    medianNegEquityFirstMonth: mc.medianNegEquityFirstMonth,
    sequenceDispersion: dispersion,
    terminalRates: mc.terminalRates,
    maxDrawdownSamples: mc.maxDrawdownSamples,
    terminalNwSorted: mc.terminalNwSorted,
    canonicalNetWorth,
    netWorthReconciliation: nwRecon,
    warnings,
    survival,
    forcedSaleReport,
    medianFinalState: mc.medianFinalState,
  };
}

function hashToInt(v: unknown): number {
  const h = stableHash(v);
  return parseInt(h, 16) >>> 0;
}
