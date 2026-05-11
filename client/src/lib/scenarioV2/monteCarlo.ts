/**
 * Scenario Engine V2 — Monte Carlo Driver
 *
 * Runs the pure `tick` function N times under different RNG seeds drawn
 * from a parent seed. Real stochastic — every sim path is a different
 * realisation of the volatility rails.
 *
 * Why not `runFireMonteCarlo` directly?
 *   The existing FireMC engine bakes in correlated stocks/crypto/property/
 *   inflation paths but does NOT understand V2 deltas (mid-flight cash
 *   injections, property purchases triggered by buy_property events).
 *   To make deltas flow through MC, the loop has to call our `tick`. The
 *   correlation matrix from FireMC is wired in Phase 8 — for the vertical
 *   slice we use independent volatilities per asset class, which is
 *   conservative for terminal-NW dispersion.
 *
 * Determinism contract:
 *   Same (basePlan, deltas, parentSeed, simCount) → byte-identical results.
 */

import type {
  BasePlan,
  PortfolioState,
  ScenarioEvent,
  MonthKey,
  FanPoint,
} from "./types";
import { tick, type TickContext, netWorth } from "./tick";
import { groupByMonth, monthsBetween } from "./events";
import { makeRng, deriveSeed } from "./determinism";

export interface MonteCarloInput {
  plan: BasePlan;
  initialState: PortfolioState;
  events: ScenarioEvent[];
  startMonth: MonthKey;
  endMonth: MonthKey;
  baseMonthlyIncome: number;
  baseMonthlyExpenses: number;
  expensesIncludeDebt: boolean;
  simulationCount: number;
  parentSeed: number;
}

export interface MonteCarloOutput {
  fan: FanPoint[];
  /** Terminal NW samples (length = simulationCount). */
  terminalNw: number[];
  /** Final state of the median path (closest to terminal P50). */
  medianFinalState: PortfolioState;
  /** Sim count actually executed. */
  simulationCount: number;
  /** Wall-clock runtime in ms. */
  runtimeMs: number;
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloOutput {
  const t0 = perfNow();
  const months = Array.from(monthsBetween(input.startMonth, input.endMonth));
  const grouped = groupByMonth(input.events);

  // Pre-allocate path matrix: rows = sims, cols = months
  const N = input.simulationCount;
  const M = months.length;
  const paths: number[][] = new Array(N);
  const finalStates: PortfolioState[] = new Array(N);

  for (let s = 0; s < N; s++) {
    const rng = makeRng(deriveSeed(input.parentSeed, `sim:${s}`));
    let state = cloneState(input.initialState);
    const path = new Array<number>(M);

    for (let i = 0; i < M; i++) {
      const m = months[i];
      const monthEvents = grouped.get(m) ?? [];
      const ctx: TickContext = {
        baseMonthlyIncome: input.baseMonthlyIncome,
        baseMonthlyExpenses: input.baseMonthlyExpenses,
        expensesIncludeDebt: input.expensesIncludeDebt,
        monthsElapsed: i,
      };
      state = tick(state, monthEvents, input.plan.assumptions, ctx, rng);
      path[i] = netWorth(state);
    }
    paths[s] = path;
    finalStates[s] = state;
  }

  // Build P10/P50/P90 fan
  const fan: FanPoint[] = new Array(M);
  const buf = new Float64Array(N);
  for (let i = 0; i < M; i++) {
    for (let s = 0; s < N; s++) buf[s] = paths[s][i];
    const sorted = Array.from(buf).sort((a, b) => a - b);
    fan[i] = {
      month: months[i],
      p10: pct(sorted, 0.10),
      p50: pct(sorted, 0.50),
      p90: pct(sorted, 0.90),
    };
  }

  // Terminal NW samples
  const terminalNw = paths.map((p) => p[M - 1]);

  // Find sim whose terminal NW is closest to terminal P50 — used as
  // representative "median path"
  const targetP50 = fan[M - 1].p50;
  let bestSim = 0;
  let bestDiff = Math.abs(terminalNw[0] - targetP50);
  for (let s = 1; s < N; s++) {
    const d = Math.abs(terminalNw[s] - targetP50);
    if (d < bestDiff) {
      bestDiff = d;
      bestSim = s;
    }
  }

  return {
    fan,
    terminalNw,
    medianFinalState: finalStates[bestSim],
    simulationCount: N,
    runtimeMs: perfNow() - t0,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pct(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.max(
    0,
    Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length)),
  );
  return sortedAsc[idx];
}

function cloneState(s: PortfolioState): PortfolioState {
  return {
    ...s,
    properties: s.properties.map((p) => ({ ...p })),
  };
}

function perfNow(): number {
  // Avoid Date.now() inside the loop; this is allowed only for runtime
  // measurement, not for any value that affects the result.
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return 0; // SSR / tests
}
