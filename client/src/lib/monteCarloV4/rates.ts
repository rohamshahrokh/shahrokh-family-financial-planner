/**
 * rates.ts — Phase B: Dynamic Interest Rate Engine
 *
 * Models RBA-style cash-rate dynamics with mean reversion, persistence, and
 * regime-conditional drift. The path is monthly. Mortgage repayments, DSR
 * deterioration, refinance pressure, and offset effectiveness all consume
 * the same rate path so they stay internally consistent.
 *
 * Model: discrete-time Ornstein-Uhlenbeck with regime tilt
 *   r_{t+1} = r_t + theta * (mu_t - r_t) + sigma * eps_t
 * where mu_t is the long-run anchor (baseline + regime interest_rate_add).
 *
 * Emergency cuts: triggered probabilistically inside recession / deflationary
 * shock regimes, applying a one-shot -100bps shock.
 *
 * Mortgage stress shocks: triggered in tightening / high_inflation regimes,
 * applying a one-shot +100bps shock.
 */

import type { Rng } from "./rng";
import { randNormalSeeded, bernoulli } from "./rng";
import type { RegimeId } from "./regimes";
import { REGIME_EFFECTS } from "./regimes";

export interface RatePathParams {
  /** Starting cash rate in % (e.g., 4.35). */
  startRate: number;
  /** Long-run anchor in % (e.g., 3.5). */
  anchor: number;
  /** Mean-reversion speed per month (0–1). */
  theta: number;
  /** Monthly innovation standard deviation in pp. */
  sigma: number;
  /** Annual probability of an emergency cut in a recession-type regime. */
  emergencyCutProb: number;
  /** Annual probability of a mortgage stress shock in tightening-type regime. */
  stressShockProb: number;
  /** Lower bound on cash rate in % (e.g., 0.10). */
  floor: number;
  /** Upper bound on cash rate in % (e.g., 15). */
  ceiling: number;
}

export const DEFAULT_RATE_PARAMS: RatePathParams = {
  startRate: 4.35,
  anchor: 3.5,
  theta: 0.06,
  sigma: 0.12,
  emergencyCutProb: 0.6,
  stressShockProb: 0.35,
  floor: 0.10,
  ceiling: 15.0,
};

export interface RatePathResult {
  /** Cash rate by month (%). */
  cashRate: Float64Array;
  /** Mortgage rate by month (% = cash rate + spread). */
  mortgageRate: Float64Array;
  /** Indicator months where an emergency cut fired. */
  emergencyCutMonths: boolean[];
  /** Indicator months where a stress shock fired. */
  stressShockMonths: boolean[];
}

/**
 * Generate a monthly cash-rate + mortgage-rate path conditional on a regime
 * path. Mortgage rate = cash rate + spread (default 2.0%).
 */
export function generateRatePath(
  rng: Rng,
  nMonths: number,
  regimePath: RegimeId[],
  params: RatePathParams = DEFAULT_RATE_PARAMS,
  mortgageSpread = 2.0,
): RatePathResult {
  const cashRate = new Float64Array(nMonths);
  const mortgageRate = new Float64Array(nMonths);
  const emergencyCutMonths: boolean[] = new Array(nMonths).fill(false);
  const stressShockMonths: boolean[] = new Array(nMonths).fill(false);

  let r = params.startRate;
  for (let mi = 0; mi < nMonths; mi++) {
    const regime = regimePath[mi];
    const eff = REGIME_EFFECTS[regime];
    const mu = params.anchor + eff.interest_rate_add;

    // OU step
    const eps = randNormalSeeded(rng, 0, params.sigma);
    r = r + params.theta * (mu - r) + eps;

    // Annualised shocks rolled monthly (1/12 each month)
    const isRecessionLike = regime === "recession" || regime === "deflationary_shock";
    const isTighteningLike = regime === "tightening_cycle" || regime === "high_inflation";
    if (isRecessionLike && bernoulli(rng, params.emergencyCutProb / 12)) {
      r -= 1.0;
      emergencyCutMonths[mi] = true;
    }
    if (isTighteningLike && bernoulli(rng, params.stressShockProb / 12)) {
      r += 1.0;
      stressShockMonths[mi] = true;
    }

    if (r < params.floor) r = params.floor;
    if (r > params.ceiling) r = params.ceiling;

    cashRate[mi] = r;
    mortgageRate[mi] = r + mortgageSpread;
  }
  return { cashRate, mortgageRate, emergencyCutMonths, stressShockMonths };
}

/**
 * Compute DSR deterioration relative to baseline mortgage rate. Returns a
 * scalar in [0,1] where 0 = baseline, 1 = critical stress (rate ≥ baseline+3%).
 */
export function dsrStressIndex(currentRate: number, baselineRate: number): number {
  const gap = Math.max(0, currentRate - baselineRate);
  return Math.min(1, gap / 3.0);
}

/**
 * Refinance failure probability as a function of current mortgage rate, DSR,
 * and regime-conditional refinance_risk_mult. The household is assumed to
 * fail refinance when DSR exceeds 40% or stress index > 0.7.
 */
export function refinanceFailureProb(
  dsr: number,
  stressIndex: number,
  regime: RegimeId,
): number {
  const base = Math.max(0, dsr - 0.30) * 1.5 + stressIndex * 0.4;
  return Math.min(1, base * REGIME_EFFECTS[regime].refinance_risk_mult);
}
