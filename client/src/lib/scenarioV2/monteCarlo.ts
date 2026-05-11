/**
 * Scenario Engine V2 — Monte Carlo Driver (Production Build)
 *
 * Runs the pure `tick` function N times under different seeded paths.
 * Each path uses CORRELATED draws produced by Cholesky from a 4-asset
 * correlation matrix, plus:
 *
 *   • Student-t fat tails for equity (ν=5) and crypto (ν=3)
 *   • Jump-diffusion (Poisson + log-normal) overlay for crypto
 *   • Vasicek mean-reverting short rate (drives cash APR + mortgage drift)
 *   • Inflation regime switching (low ↔ high)
 *   • Stochastic vacancy for IPs (Bernoulli per month)
 *
 * Determinism: same (initialState, events, parentSeed, simCount) →
 *              byte-identical results.
 */

import type {
  BasePlan,
  PortfolioState,
  ScenarioEvent,
  MonthKey,
  FanPoint,
} from "./types";
import { tick, type TickContext, type TickDraws, netWorth, type ExtendedPortfolioState } from "./tick";
import { groupByMonth, monthsBetween } from "./events";
import { makeRng, deriveSeed, type SeededRng } from "./determinism";
import {
  DEFAULT_CORRELATION,
  cholesky,
  drawCorrelatedNormals,
  studentT,
  drawJumpMultiplier,
  CRYPTO_JUMPS,
  DEFAULT_RATE_PROCESS,
  vasicekStep,
  DEFAULT_INFLATION_REGIMES,
  inflationStep,
  type InflationRegime,
  type CorrelationMatrix,
  type VasicekParams,
  type JumpDiffusionParams,
  type InflationRegimeParams,
} from "./stochastic";

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
  /** Override correlation matrix. Default = DEFAULT_CORRELATION. */
  correlation?: CorrelationMatrix;
  /** Vasicek rate process. Default uses RBA mid-2026 expectation. */
  rateProcess?: VasicekParams;
  /** Crypto jump-diffusion parameters. Default ~1.5 jumps/year. */
  cryptoJumps?: JumpDiffusionParams;
  /** Inflation regime parameters. */
  inflationRegime?: InflationRegimeParams;
  /** Toggle fat tails on/off (default true). */
  useFatTails?: boolean;
  /** Mean vacancy probability per month (default 0.04 monthly = 4% expected). */
  monthlyVacancyProb?: number;
  hasHelpDebt?: boolean;
  hasPrivateHospitalCover?: boolean;
}

export interface CashFanPoint {
  month: MonthKey;
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloOutput {
  fan: FanPoint[];
  cashFan: CashFanPoint[];
  /** Terminal NW samples (length = simulationCount). */
  terminalNw: number[];
  terminalCash: number[];
  medianNwPath: number[];
  medianCashPath: number[];
  medianFinalState: PortfolioState;
  simulationCount: number;
  runtimeMs: number;
  /** Per-sim path of mortgage rates at end-of-horizon (for stress narrative). */
  terminalRates: number[];
  /** Probability of any negative-equity event during the horizon. */
  negativeEquityProbability: number;
  /** Probability cash dips below 3-month buffer for ≥2 consecutive months. */
  liquidityStressProbability: number;
  /** Probability a refinance event happens (rate spike + serviceability fail). */
  refinancePressureProbability: number;
  /** Probability the household goes insolvent (cash exhausted, assets exhausted). */
  defaultProbability: number;
  /** Median month-index at which default fires (null if no path defaults). */
  medianDefaultMonth: number | null;
  /** Median month-index at which liquidity stress first fires. */
  medianLiquidityFirstMonth: number | null;
  /** Median month-index at which negative equity first fires. */
  medianNegEquityFirstMonth: number | null;
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloOutput {
  const t0 = perfNow();
  const months = Array.from(monthsBetween(input.startMonth, input.endMonth));
  const grouped = groupByMonth(input.events);
  const N = input.simulationCount;
  const M = months.length;

  // Pre-compute Cholesky factor (constant across sims)
  const corr = input.correlation ?? DEFAULT_CORRELATION;
  const L = cholesky(corr);
  if (!L) {
    throw new Error("[scenarioV2] Correlation matrix is not positive semi-definite");
  }
  const rateProcess = input.rateProcess ?? DEFAULT_RATE_PROCESS;
  const jumps = input.cryptoJumps ?? CRYPTO_JUMPS;
  const inflationRegime = input.inflationRegime ?? DEFAULT_INFLATION_REGIMES;
  const useFatTails = input.useFatTails ?? true;
  const monthlyVacancyProb = input.monthlyVacancyProb ?? 0.04;

  // Pre-allocate path matrix
  const paths: number[][] = new Array(N);
  const cashPaths: number[][] = new Array(N);
  const finalStates: PortfolioState[] = new Array(N);
  const terminalRates = new Array<number>(N);
  let negativeEquityEvents = 0;
  let liquidityStressEvents = 0;
  let refinancePressureEvents = 0;

  // Parse start month for calendar tracking
  const [, startMonthNumStr] = (input.startMonth as string).split("-");
  const startMonthNum = parseInt(startMonthNumStr, 10);

  // Per-sim aggregates for richer narrative
  const defaultEvents: number[] = []; // per-sim default month index (-1 if solvent)
  const liquidityFirstMonth: number[] = []; // first month liquidity stress fired (-1 if none)
  const negativeEquityFirstMonth: number[] = [];

  // Liquidity-stress threshold: 3 months expenses OR ≤ 0, whichever is
  // STRICTER. We also REQUIRE the stress to PERSIST for ≥ 2 consecutive
  // months to avoid one-off tax-quarter dips registering as stress. This
  // produces a differentiated, calibrated probability across scenarios.
  for (let s = 0; s < N; s++) {
    const rng = makeRng(deriveSeed(input.parentSeed, `sim:${s}`));
    let state = cloneState(input.initialState) as ExtendedPortfolioState;
    let shortRate = rateProcess.r0;
    let regime: InflationRegime = "low";
    const path = new Array<number>(M);
    const cashPath = new Array<number>(M);

    let monthRefStress = false;
    let liquidityStress = false;
    let negativeEquity = false;
    let liquidityStressRun = 0; // consecutive months below threshold
    let liquidityFirstHit = -1;
    let negEqFirstHit = -1;
    let defaultMonthIdx = -1;

    for (let i = 0; i < M; i++) {
      const m = months[i];
      const monthEvents = grouped.get(m) ?? [];
      const calendarMonth = ((startMonthNum - 1 + i) % 12) + 1;

      // ── Correlated normal draws ────────────────────────────────────────────
      let corrShocks = drawCorrelatedNormals(L, rng);
      // Apply fat tails by replacing equity/crypto shocks with Student-t,
      // preserving correlation through copula approximation: rescale the
      // marginal by t-CDF mapping. For determinism + simplicity, we keep the
      // correlated normal for property/rate, and OVERLAY Student-t innovations
      // on equity and crypto.
      let equityShock = corrShocks[1];
      let cryptoShock = corrShocks[2];
      if (useFatTails) {
        // Blend: 70% correlated normal + 30% Student-t innovation.
        // Preserves the correlation structure broadly while introducing
        // fat tails to marginals.
        equityShock = 0.7 * corrShocks[1] + 0.3 * studentT(rng, 5);
        cryptoShock = 0.7 * corrShocks[2] + 0.3 * studentT(rng, 3);
      }
      const propertyShock = corrShocks[0];
      const rateShock = corrShocks[3];

      // ── Vasicek rate step ──────────────────────────────────────────────────
      shortRate = vasicekStep(shortRate, rateProcess, rateShock);
      shortRate = Math.max(0, shortRate); // ZLB

      // ── Inflation regime step ──────────────────────────────────────────────
      const infl = inflationStep(regime, inflationRegime, rng);
      regime = infl.regime;

      // ── Crypto jump ────────────────────────────────────────────────────────
      const cryptoJump = drawJumpMultiplier(rng, jumps);

      // ── Vacancy (Bernoulli per month) ──────────────────────────────────────
      const vacancyFactor = rng.next() < monthlyVacancyProb ? 0 : 1;

      const draws: TickDraws = {
        propertyShock,
        equityShock,
        cryptoShock,
        cryptoJump,
        rateShock,
        superShock: rng.normal(), // super is independent and broadly diversified
        inflationAnnualised: infl.rate,
        shortRate,
        vacancyFactor,
      };

      const ctx: TickContext = {
        baseMonthlyIncome: input.baseMonthlyIncome,
        baseMonthlyExpenses: input.baseMonthlyExpenses,
        expensesIncludeDebt: input.expensesIncludeDebt,
        monthsElapsed: i,
        calendarMonth,
        hasHelpDebt: input.hasHelpDebt,
        hasPrivateHospitalCover: input.hasPrivateHospitalCover,
      };

      state = tick(state, monthEvents, input.plan.assumptions, ctx, draws) as ExtendedPortfolioState;

      // Per-month stress checks (skip first 3 months to avoid false
      // positives on starting balance — we only care about the path
      // going stressed, and we require ≥ 2 consecutive months below
      // the threshold for stress to register).
      if (i > 3) {
        const monthlyExpenses = state.ttmExpenses / 12;
        // 3-month buffer OR cash below zero — stricter (more dangerous)
        const threshold = monthlyExpenses * 3;
        const inStress = state.cash < threshold || state.defaulted === true;
        if (inStress) {
          liquidityStressRun++;
          if (liquidityStressRun >= 2 && !liquidityStress) {
            liquidityStress = true;
            liquidityFirstHit = i;
          }
        } else {
          liquidityStressRun = 0;
        }
      }
      if (!negativeEquity) {
        for (const p of state.properties) {
          if (p.marketValue < p.loanBalance) {
            negativeEquity = true;
            negEqFirstHit = i;
            break;
          }
        }
      }
      if (defaultMonthIdx < 0 && state.defaulted === true) {
        defaultMonthIdx = i;
      }
      if (!monthRefStress && shortRate > rateProcess.theta * 1.5) {
        // Rate ≥ 1.5× long-run mean for ≥1 month
        const dsr = state.properties.reduce((sum, p) => sum + p.monthlyRepayment, 0)
          / Math.max(1, state.ttmIncome / 12);
        if (dsr > 0.45) monthRefStress = true;
      }

      path[i] = netWorth(state);
      cashPath[i] = state.cash;
    }

    paths[s] = path;
    cashPaths[s] = cashPath;
    finalStates[s] = state;
    terminalRates[s] = shortRate;
    if (negativeEquity) negativeEquityEvents++;
    if (liquidityStress) liquidityStressEvents++;
    if (monthRefStress) refinancePressureEvents++;
    defaultEvents.push(defaultMonthIdx);
    liquidityFirstMonth.push(liquidityFirstHit);
    negativeEquityFirstMonth.push(negEqFirstHit);
  }

  // Build P10/P50/P90 fan
  const fan: FanPoint[] = new Array(M);
  const cashFan: CashFanPoint[] = new Array(M);
  const buf = new Float64Array(N);
  const cashBuf = new Float64Array(N);
  for (let i = 0; i < M; i++) {
    for (let s2 = 0; s2 < N; s2++) {
      buf[s2] = paths[s2][i];
      cashBuf[s2] = cashPaths[s2][i];
    }
    const sorted = Array.from(buf).sort((a, b) => a - b);
    const cashSorted = Array.from(cashBuf).sort((a, b) => a - b);
    fan[i] = {
      month: months[i],
      p10: pct(sorted, 0.10),
      p50: pct(sorted, 0.50),
      p90: pct(sorted, 0.90),
    };
    cashFan[i] = {
      month: months[i],
      p10: pct(cashSorted, 0.10),
      p50: pct(cashSorted, 0.50),
      p90: pct(cashSorted, 0.90),
    };
  }

  // Terminal samples
  const terminalNw = paths.map((p) => p[M - 1]);
  const terminalCash = cashPaths.map((p) => p[M - 1]);

  // Median path
  const targetP50 = fan[M - 1].p50;
  let bestSim = 0;
  let bestDiff = Math.abs(terminalNw[0] - targetP50);
  for (let s2 = 1; s2 < N; s2++) {
    const d = Math.abs(terminalNw[s2] - targetP50);
    if (d < bestDiff) {
      bestDiff = d;
      bestSim = s2;
    }
  }

  return {
    fan,
    cashFan,
    terminalNw,
    terminalCash,
    medianNwPath: paths[bestSim],
    medianCashPath: cashPaths[bestSim],
    medianFinalState: finalStates[bestSim],
    simulationCount: N,
    runtimeMs: perfNow() - t0,
    terminalRates,
    negativeEquityProbability: negativeEquityEvents / N,
    liquidityStressProbability: liquidityStressEvents / N,
    refinancePressureProbability: refinancePressureEvents / N,
    defaultProbability: defaultEvents.filter((x) => x >= 0).length / N,
    medianDefaultMonth: medianOrNull(defaultEvents.filter((x) => x >= 0)),
    medianLiquidityFirstMonth: medianOrNull(liquidityFirstMonth.filter((x) => x >= 0)),
    medianNegEquityFirstMonth: medianOrNull(negativeEquityFirstMonth.filter((x) => x >= 0)),
  };
}

function medianOrNull(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return 0;
}
