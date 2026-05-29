/**
 * actionRoadmap/montecarloProjection.ts — Sprint 28.
 *
 * Multi-percentile read-out over an already-computed `FanPoint[]`. THIS
 * MODULE PERFORMS NO MONTE CARLO MATH. It scans the engine's fan three times
 * — once per percentile (p25, p50, p75) — to find the first month each
 * percentile band crosses the FIRE number, then samples the matching net
 * worth + implied passive income at that crossing.
 *
 * Honesty rules (verbatim):
 *   - When the percentile NEVER crosses, the corresponding fields are null.
 *   - When `currentAge` is missing, ages stay null (we will not invent a year).
 *   - When `swrPct <= 0` or missing, passive income stays null.
 *   - When `fan` is empty, every output field is null (`source` is still set
 *     so the UI can audit the lineage).
 */
import type { FanPoint } from "../scenarioV2/types";

export type Percentile = "p25" | "p50" | "p75";

export interface MonteCarloProjection {
  fireAge: { p25: number | null; p50: number | null; p75: number | null };
  netWorthAtFire: { p25: number | null; p50: number | null; p75: number | null };
  passiveIncomeAtFire: { p25: number | null; p50: number | null; p75: number | null };
  simulationCount: number;
  source: "scenarioV2.monteCarlo";
}

export interface MonteCarloProjectionInput {
  /** Median-percentile fan output from `runScenarioV2` / orchestrator. */
  fan: FanPoint[];
  /** User's current whole-year age. Required to convert month-index → age. */
  startAge: number | null;
  /** FIRE number (dollars) from the canonical goal profile. */
  fireTarget: number | null;
  /** Safe withdrawal rate (percentage, e.g. 4 → 4%). */
  swrPct: number | null;
  /** Number of Monte Carlo simulations behind this fan. */
  simulationCount: number;
}

function nullProjection(simulationCount: number): MonteCarloProjection {
  return {
    fireAge: { p25: null, p50: null, p75: null },
    netWorthAtFire: { p25: null, p50: null, p75: null },
    passiveIncomeAtFire: { p25: null, p50: null, p75: null },
    simulationCount,
    source: "scenarioV2.monteCarlo",
  };
}

function firstCrossingIndex(fan: FanPoint[], pct: Percentile, target: number): number {
  for (let i = 0; i < fan.length; i++) {
    const v = fan[i]![pct];
    if (Number.isFinite(v) && v >= target) return i;
  }
  return -1;
}

function indexToAge(idx: number, startAge: number): number {
  return Math.round(startAge + Math.floor(idx / 12));
}

export function selectMonteCarloProjection(input: MonteCarloProjectionInput): MonteCarloProjection {
  const { fan, startAge, fireTarget, swrPct, simulationCount } = input;
  if (!Array.isArray(fan) || fan.length === 0) return nullProjection(simulationCount);
  if (fireTarget == null || !Number.isFinite(fireTarget) || fireTarget <= 0) {
    return nullProjection(simulationCount);
  }

  const compute = (pct: Percentile) => {
    const idx = firstCrossingIndex(fan, pct, fireTarget);
    const age =
      idx >= 0 && startAge != null && Number.isFinite(startAge)
        ? indexToAge(idx, startAge)
        : null;
    const nw =
      idx >= 0 && Number.isFinite(fan[idx]![pct]) ? fan[idx]![pct] : null;
    const passive =
      nw != null && swrPct != null && Number.isFinite(swrPct) && swrPct > 0
        ? nw * (swrPct / 100)
        : null;
    return { age, nw, passive };
  };

  const p25 = compute("p25");
  const p50 = compute("p50");
  const p75 = compute("p75");

  return {
    fireAge: { p25: p25.age, p50: p50.age, p75: p75.age },
    netWorthAtFire: { p25: p25.nw, p50: p50.nw, p75: p75.nw },
    passiveIncomeAtFire: { p25: p25.passive, p50: p50.passive, p75: p75.passive },
    simulationCount,
    source: "scenarioV2.monteCarlo",
  };
}
