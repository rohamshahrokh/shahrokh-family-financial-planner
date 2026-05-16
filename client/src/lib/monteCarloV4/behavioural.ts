/**
 * behavioural.ts — Phase E: Behavioural Finance Layer
 *
 * Optional, configurable behavioural overlays that modulate household
 * actions during the simulation:
 *   - stop DCA during crashes
 *   - panic selling
 *   - leverage fear (delay property purchases after losses)
 *   - spending inflation after salary growth ("lifestyle creep")
 *   - conservative shift after losses
 *   - risk-seeking after gains
 *
 * The layer is intentionally OFF by default — users opt in via a profile
 * ("disciplined", "average_investor", "emotional_investor",
 * "aggressive_allocator"). Each profile maps to a vector of behavioural
 * sensitivities applied multiplicatively inside the V4 engine.
 */

export type BehaviouralProfile =
  | "disciplined"
  | "average_investor"
  | "emotional_investor"
  | "aggressive_allocator";

export interface BehaviouralSensitivities {
  /** Probability of pausing DCA in a month with stocks drawdown > 15% over trailing 6 months. */
  pauseDcaOnDrawdownProb: number;
  /** Fraction of risk assets sold in a month with severe drawdown (>30% trailing 6m). */
  panicSellFraction: number;
  /** Multiplier on planned new debt/leverage decisions after prior-year drawdown > 20%. */
  leverageFearMult: number;
  /** Multiplier on expense growth after a >10% income jump within trailing 12 months. */
  lifestyleCreepMult: number;
  /** Multiplier on stock allocation after sustained gains (>30% trailing 12m) — overspend on risk. */
  riskSeekingAllocMult: number;
}

const PROFILE_SENSITIVITIES: Record<BehaviouralProfile, BehaviouralSensitivities> = {
  disciplined: {
    pauseDcaOnDrawdownProb: 0.05,
    panicSellFraction: 0.0,
    leverageFearMult: 0.95,
    lifestyleCreepMult: 1.02,
    riskSeekingAllocMult: 1.0,
  },
  average_investor: {
    pauseDcaOnDrawdownProb: 0.30,
    panicSellFraction: 0.10,
    leverageFearMult: 0.80,
    lifestyleCreepMult: 1.10,
    riskSeekingAllocMult: 1.05,
  },
  emotional_investor: {
    pauseDcaOnDrawdownProb: 0.65,
    panicSellFraction: 0.35,
    leverageFearMult: 0.55,
    lifestyleCreepMult: 1.20,
    riskSeekingAllocMult: 1.15,
  },
  aggressive_allocator: {
    pauseDcaOnDrawdownProb: 0.10,
    panicSellFraction: 0.05,
    leverageFearMult: 1.10,
    lifestyleCreepMult: 1.15,
    riskSeekingAllocMult: 1.25,
  },
};

export function sensitivitiesFor(profile: BehaviouralProfile): BehaviouralSensitivities {
  return PROFILE_SENSITIVITIES[profile];
}

/** Compute trailing N-month drawdown of a value series. Returns fraction in [0,1]. */
export function trailingDrawdown(series: number[], idx: number, lookback: number): number {
  const start = Math.max(0, idx - lookback);
  let peak = series[start];
  for (let i = start; i <= idx; i++) {
    if (series[i] > peak) peak = series[i];
  }
  if (peak <= 0) return 0;
  const trough = series[idx];
  return Math.max(0, (peak - trough) / peak);
}

/** Compute trailing N-month return. */
export function trailingReturn(series: number[], idx: number, lookback: number): number {
  if (idx <= 0) return 0;
  const start = Math.max(0, idx - lookback);
  const startV = series[start];
  if (startV <= 0) return 0;
  return (series[idx] - startV) / startV;
}
