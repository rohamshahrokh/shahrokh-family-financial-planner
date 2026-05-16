/**
 * regimes.ts — Phase A: Economic Regime Engine
 *
 * Replaces V3's purely random per-month draws with a regime-based macro
 * model. The engine carries an 11-state regime (Normal Growth, High Inflation,
 * Disinflation, Stagflation, Recession, Commodity Boom, Housing Slowdown,
 * Rate-Cut Cycle, Tightening Cycle, Risk-On Mania, Deflationary Shock) and
 * applies regime-specific multipliers/offsets to inflation, wage growth,
 * property growth, rent growth, unemployment risk, stock returns, crypto
 * returns, interest rates, borrowing power, refinance risk, and liquidity
 * pressure.
 *
 * Regimes are persistent — a discrete Markov chain that uses geometric dwell
 * times tuned to realistic historical durations (e.g. a tightening cycle is
 * 18–30 months, a recession is 6–18 months). Transition probabilities are
 * conditional on the current regime (correlated transitions), not memoryless.
 *
 * All assumptions are deterministic and clearly labelled. No live macro data
 * is fetched — this is a calibrated model, not a forecast feed.
 */

import type { Rng } from "./rng";
import { sampleCategorical } from "./rng";

export type RegimeId =
  | "normal_growth"
  | "high_inflation"
  | "disinflation"
  | "stagflation"
  | "recession"
  | "commodity_boom"
  | "housing_slowdown"
  | "rate_cut_cycle"
  | "tightening_cycle"
  | "risk_on_mania"
  | "deflationary_shock";

export const REGIME_IDS: RegimeId[] = [
  "normal_growth",
  "high_inflation",
  "disinflation",
  "stagflation",
  "recession",
  "commodity_boom",
  "housing_slowdown",
  "rate_cut_cycle",
  "tightening_cycle",
  "risk_on_mania",
  "deflationary_shock",
];

export interface RegimeEffects {
  /** Multiplier on baseline inflation assumption (1.0 = neutral). */
  inflation_mult: number;
  /** Additive shift to inflation in pp (percentage points). */
  inflation_add: number;
  /** Multiplier on baseline wage / income growth. */
  wage_growth_mult: number;
  /** Multiplier on property capital growth. */
  property_growth_mult: number;
  /** Multiplier on rent growth. */
  rent_growth_mult: number;
  /** Additive job loss probability (annualised, pp). */
  unemployment_risk_add: number;
  /** Multiplier on stock expected returns. Negative values flip the sign. */
  stocks_return_mult: number;
  /** Multiplier on crypto expected returns. */
  crypto_return_mult: number;
  /** Additive shift to interest rate in pp. */
  interest_rate_add: number;
  /** Multiplier on borrowing capacity (loan serviceability). */
  borrowing_power_mult: number;
  /** Multiplier on refinance failure probability. */
  refinance_risk_mult: number;
  /** Multiplier on liquidity pressure (cash drain intensity). */
  liquidity_pressure_mult: number;
  /** Plain-English label for UI overlay. */
  label: string;
  /** Tooltip — what this regime means in household terms. */
  tooltip: string;
}

export const REGIME_EFFECTS: Record<RegimeId, RegimeEffects> = {
  normal_growth: {
    inflation_mult: 1.0,    inflation_add: 0,
    wage_growth_mult: 1.0,  property_growth_mult: 1.0,
    rent_growth_mult: 1.0,  unemployment_risk_add: 0,
    stocks_return_mult: 1.0, crypto_return_mult: 1.0,
    interest_rate_add: 0,   borrowing_power_mult: 1.0,
    refinance_risk_mult: 1.0, liquidity_pressure_mult: 1.0,
    label: "Normal Growth",
    tooltip: "Steady GDP, inflation near target, employment stable — baseline conditions.",
  },
  high_inflation: {
    inflation_mult: 1.0,    inflation_add: 3.5,
    wage_growth_mult: 0.6,  property_growth_mult: 0.8,
    rent_growth_mult: 1.4,  unemployment_risk_add: 1,
    stocks_return_mult: 0.7, crypto_return_mult: 0.6,
    interest_rate_add: 1.5, borrowing_power_mult: 0.85,
    refinance_risk_mult: 1.3, liquidity_pressure_mult: 1.25,
    label: "High Inflation",
    tooltip: "CPI well above target; real wages stagnate; rents accelerate; mortgage stress builds.",
  },
  disinflation: {
    inflation_mult: 0.6,    inflation_add: -1.0,
    wage_growth_mult: 1.05, property_growth_mult: 1.05,
    rent_growth_mult: 0.8,  unemployment_risk_add: 0,
    stocks_return_mult: 1.15, crypto_return_mult: 1.1,
    interest_rate_add: -0.5, borrowing_power_mult: 1.05,
    refinance_risk_mult: 0.9, liquidity_pressure_mult: 0.95,
    label: "Disinflation",
    tooltip: "Inflation falling toward target; growth resilient; risk assets re-rate higher.",
  },
  stagflation: {
    inflation_mult: 1.0,    inflation_add: 4.0,
    wage_growth_mult: 0.4,  property_growth_mult: 0.3,
    rent_growth_mult: 1.2,  unemployment_risk_add: 2.5,
    stocks_return_mult: 0.4, crypto_return_mult: 0.3,
    interest_rate_add: 2.0, borrowing_power_mult: 0.75,
    refinance_risk_mult: 1.8, liquidity_pressure_mult: 1.6,
    label: "Stagflation",
    tooltip: "High inflation AND weak growth — worst case for leveraged households.",
  },
  recession: {
    inflation_mult: 0.7,    inflation_add: -0.5,
    wage_growth_mult: 0.3,  property_growth_mult: 0.4,
    rent_growth_mult: 0.7,  unemployment_risk_add: 4.0,
    stocks_return_mult: 0.2, crypto_return_mult: 0.1,
    interest_rate_add: -1.0, borrowing_power_mult: 0.7,
    refinance_risk_mult: 1.6, liquidity_pressure_mult: 1.5,
    label: "Recession",
    tooltip: "GDP contracts, unemployment spikes, asset prices fall, central bank cuts.",
  },
  commodity_boom: {
    inflation_mult: 1.0,    inflation_add: 1.5,
    wage_growth_mult: 1.2,  property_growth_mult: 1.1,
    rent_growth_mult: 1.05, unemployment_risk_add: -0.5,
    stocks_return_mult: 1.2, crypto_return_mult: 1.1,
    interest_rate_add: 0.5, borrowing_power_mult: 1.05,
    refinance_risk_mult: 0.95, liquidity_pressure_mult: 0.95,
    label: "Commodity Boom",
    tooltip: "AU resource exports surge; AUD strong; mining states outperform.",
  },
  housing_slowdown: {
    inflation_mult: 1.0,    inflation_add: 0,
    wage_growth_mult: 0.95, property_growth_mult: 0.2,
    rent_growth_mult: 0.9,  unemployment_risk_add: 0.5,
    stocks_return_mult: 0.95, crypto_return_mult: 0.9,
    interest_rate_add: 0.3, borrowing_power_mult: 0.85,
    refinance_risk_mult: 1.4, liquidity_pressure_mult: 1.15,
    label: "Housing Slowdown",
    tooltip: "Property prices flat to falling; APRA-style tightening; investor demand weakens.",
  },
  rate_cut_cycle: {
    inflation_mult: 0.9,    inflation_add: -0.3,
    wage_growth_mult: 1.0,  property_growth_mult: 1.15,
    rent_growth_mult: 1.0,  unemployment_risk_add: 0.3,
    stocks_return_mult: 1.2, crypto_return_mult: 1.3,
    interest_rate_add: -1.25, borrowing_power_mult: 1.15,
    refinance_risk_mult: 0.7, liquidity_pressure_mult: 0.85,
    label: "Rate-Cut Cycle",
    tooltip: "RBA easing; mortgage costs fall; risk assets re-rate; property turns up.",
  },
  tightening_cycle: {
    inflation_mult: 1.0,    inflation_add: 0.8,
    wage_growth_mult: 0.9,  property_growth_mult: 0.7,
    rent_growth_mult: 1.05, unemployment_risk_add: 0.8,
    stocks_return_mult: 0.85, crypto_return_mult: 0.7,
    interest_rate_add: 1.75, borrowing_power_mult: 0.8,
    refinance_risk_mult: 1.5, liquidity_pressure_mult: 1.35,
    label: "Tightening Cycle",
    tooltip: "RBA hiking; serviceability squeezed; IO expiry pressure on investors.",
  },
  risk_on_mania: {
    inflation_mult: 1.0,    inflation_add: 0.5,
    wage_growth_mult: 1.05, property_growth_mult: 1.2,
    rent_growth_mult: 1.05, unemployment_risk_add: -0.3,
    stocks_return_mult: 1.6, crypto_return_mult: 2.2,
    interest_rate_add: 0.2, borrowing_power_mult: 1.05,
    refinance_risk_mult: 0.85, liquidity_pressure_mult: 0.9,
    label: "Risk-On Mania",
    tooltip: "Stretched valuations, crypto bull, FOMO leverage — high-return / high-fragility.",
  },
  deflationary_shock: {
    inflation_mult: 0.4,    inflation_add: -2.5,
    wage_growth_mult: 0.4,  property_growth_mult: 0.2,
    rent_growth_mult: 0.6,  unemployment_risk_add: 3.5,
    stocks_return_mult: 0.3, crypto_return_mult: 0.2,
    interest_rate_add: -1.5, borrowing_power_mult: 0.75,
    refinance_risk_mult: 1.7, liquidity_pressure_mult: 1.6,
    label: "Deflationary Shock",
    tooltip: "Demand collapse, negative CPI; debt burdens grow in real terms.",
  },
};

/**
 * Geometric dwell-time parameters (in months). Each regime has a mean dwell
 * before transitioning. Drawn as months_remaining = 1 + Geometric(1/mean).
 */
const DWELL_MONTHS: Record<RegimeId, number> = {
  normal_growth:      36,
  high_inflation:     18,
  disinflation:       18,
  stagflation:        12,
  recession:           9,
  commodity_boom:     18,
  housing_slowdown:   18,
  rate_cut_cycle:     18,
  tightening_cycle:   24,
  risk_on_mania:      14,
  deflationary_shock:  9,
};

/**
 * Conditional transition weights. Row = current regime, columns are weights
 * for each candidate next regime (self-weight kept at 0 — the dwell time
 * already encodes persistence). Hand-tuned to capture correlated transitions
 * (e.g. tightening tends to flow into housing_slowdown or recession; recession
 * into rate_cut_cycle).
 */
const TRANSITION_WEIGHTS: Record<RegimeId, Partial<Record<RegimeId, number>>> = {
  normal_growth: {
    high_inflation: 2, disinflation: 1, commodity_boom: 1.5, housing_slowdown: 1,
    rate_cut_cycle: 1, tightening_cycle: 2, risk_on_mania: 1.5, recession: 0.5,
  },
  high_inflation: {
    tightening_cycle: 4, stagflation: 1.5, disinflation: 2, normal_growth: 1, recession: 0.5,
  },
  disinflation: {
    normal_growth: 3, rate_cut_cycle: 2, risk_on_mania: 1, commodity_boom: 0.5,
  },
  stagflation: {
    recession: 3, tightening_cycle: 1.5, high_inflation: 1, disinflation: 0.5,
  },
  recession: {
    rate_cut_cycle: 4, disinflation: 1.5, deflationary_shock: 0.5, normal_growth: 1,
  },
  commodity_boom: {
    high_inflation: 2, tightening_cycle: 1.5, normal_growth: 2, housing_slowdown: 0.5,
  },
  housing_slowdown: {
    rate_cut_cycle: 2, recession: 1, normal_growth: 2, tightening_cycle: 0.5,
  },
  rate_cut_cycle: {
    normal_growth: 2.5, risk_on_mania: 2, disinflation: 1, commodity_boom: 0.5,
  },
  tightening_cycle: {
    housing_slowdown: 2.5, recession: 1.5, high_inflation: 1, normal_growth: 1, stagflation: 0.7,
  },
  risk_on_mania: {
    tightening_cycle: 2.5, recession: 1.5, normal_growth: 1.5, housing_slowdown: 1,
  },
  deflationary_shock: {
    rate_cut_cycle: 3, recession: 1.5, disinflation: 1, normal_growth: 0.5,
  },
};

/** Draw a geometric dwell time (in months) for a regime. */
export function drawDwellMonths(rng: Rng, regime: RegimeId): number {
  const mean = DWELL_MONTHS[regime];
  // Geometric draw with mean ~ `mean` months.
  const u = Math.max(rng(), 1e-9);
  return Math.max(3, Math.round(-Math.log(u) * mean));
}

/** Sample the next regime conditional on the current one. */
export function nextRegime(rng: Rng, current: RegimeId): RegimeId {
  const row = TRANSITION_WEIGHTS[current];
  const candidates: RegimeId[] = [];
  const weights: number[] = [];
  for (const r of REGIME_IDS) {
    if (r === current) continue;
    candidates.push(r);
    weights.push(row[r] ?? 0.05);
  }
  return candidates[sampleCategorical(rng, weights)];
}

/**
 * Build a month-indexed regime path of length `nMonths` for one simulation.
 * Returns the RegimeId for each month.
 */
export function generateRegimePath(
  rng: Rng,
  nMonths: number,
  startRegime: RegimeId = "normal_growth",
): RegimeId[] {
  const out: RegimeId[] = new Array(nMonths);
  let current = startRegime;
  let monthsRemaining = drawDwellMonths(rng, current);
  for (let mi = 0; mi < nMonths; mi++) {
    out[mi] = current;
    monthsRemaining--;
    if (monthsRemaining <= 0) {
      current = nextRegime(rng, current);
      monthsRemaining = drawDwellMonths(rng, current);
    }
  }
  return out;
}

/**
 * Year-end aggregation: return the dominant regime for each year (the one
 * present in the most months). Useful for UI overlays and narratives.
 */
export function dominantRegimeByYear(path: RegimeId[], nYears: number): RegimeId[] {
  const out: RegimeId[] = new Array(nYears).fill("normal_growth");
  for (let y = 0; y < nYears; y++) {
    const counts: Partial<Record<RegimeId, number>> = {};
    for (let m = 0; m < 12; m++) {
      const mi = y * 12 + m;
      if (mi >= path.length) break;
      const r = path[mi];
      counts[r] = (counts[r] ?? 0) + 1;
    }
    let best: RegimeId = "normal_growth";
    let bestN = -1;
    for (const r of REGIME_IDS) {
      const n = counts[r] ?? 0;
      if (n > bestN) { bestN = n; best = r; }
    }
    out[y] = best;
  }
  return out;
}
