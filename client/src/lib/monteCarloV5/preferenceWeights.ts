/**
 * preferenceWeights.ts — Phase 9: Advanced User Preferences
 *
 * Provides a preference-weighting engine that re-ranks recommendations and
 * scenarios according to the user's stated priorities. Per the brief:
 *
 *   "this changes ranking logic, NOT raw math outputs."
 *
 * Implementation:
 *   - User assigns 0..1 weight to each preference dimension (safety,
 *     liquidity, wealth max, FIRE speed, low stress, leverage tolerance,
 *     cashflow stability, family protection, downside minimisation).
 *   - Weights are normalised to sum to 1.
 *   - Each recommendation / scenario carries an impact vector across the
 *     same dimensions in [-1, +1].
 *   - Ranking score = preference · impact (dot product).
 *
 * Down-stream raw math (Monte Carlo, NW reconciliation, projections) is NOT
 * touched.
 */

export type PreferenceDim =
  | "safety"
  | "liquidity"
  | "wealth_max"
  | "fire_speed"
  | "low_stress"
  | "leverage_tolerance"
  | "cashflow_stability"
  | "family_protection"
  | "downside_minimisation";

export const PREFERENCE_DIMS: PreferenceDim[] = [
  "safety", "liquidity", "wealth_max", "fire_speed", "low_stress",
  "leverage_tolerance", "cashflow_stability", "family_protection",
  "downside_minimisation",
];

export type PreferenceVector = Record<PreferenceDim, number>;

export type ImpactVector = Record<PreferenceDim, number>;

export const NEUTRAL_PREF: PreferenceVector = {
  safety: 1, liquidity: 1, wealth_max: 1, fire_speed: 1, low_stress: 1,
  leverage_tolerance: 1, cashflow_stability: 1, family_protection: 1,
  downside_minimisation: 1,
};

export const NEUTRAL_IMPACT: ImpactVector = {
  safety: 0, liquidity: 0, wealth_max: 0, fire_speed: 0, low_stress: 0,
  leverage_tolerance: 0, cashflow_stability: 0, family_protection: 0,
  downside_minimisation: 0,
};

/** Normalise preference weights so they sum to 1 (preserves zero entries). */
export function normalisePreferences(p: PreferenceVector): PreferenceVector {
  const total = PREFERENCE_DIMS.reduce((s, k) => s + Math.max(0, p[k] ?? 0), 0);
  if (total <= 0) return { ...NEUTRAL_PREF };
  const out: PreferenceVector = { ...NEUTRAL_PREF };
  for (const k of PREFERENCE_DIMS) out[k] = (Math.max(0, p[k] ?? 0)) / total;
  return out;
}

export function rankingScore(p: PreferenceVector, impact: ImpactVector): number {
  let s = 0;
  for (const k of PREFERENCE_DIMS) s += (p[k] ?? 0) * (impact[k] ?? 0);
  return s;
}

/** Convenience: re-rank an array of recommendations by their impact vector. */
export function rerankByPreference<T extends { impact?: ImpactVector }>(
  items: T[],
  pref: PreferenceVector,
): T[] {
  const normalised = normalisePreferences(pref);
  return items
    .map(item => ({ item, score: rankingScore(normalised, item.impact ?? NEUTRAL_IMPACT) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}

/**
 * Map common recommendation tags to default impact vectors. Lets us re-rank
 * V5 portfolio recommendations without each call site filling in vectors.
 */
export const DEFAULT_IMPACTS: Record<string, ImpactVector> = {
  build_buffer: {
    ...NEUTRAL_IMPACT,
    safety: 0.8, liquidity: 0.7, low_stress: 0.5, cashflow_stability: 0.6,
    family_protection: 0.5, downside_minimisation: 0.6, wealth_max: -0.1,
  },
  reduce_concentration: {
    ...NEUTRAL_IMPACT,
    safety: 0.6, downside_minimisation: 0.7, wealth_max: -0.2, low_stress: 0.4,
  },
  deleverage: {
    ...NEUTRAL_IMPACT,
    safety: 0.7, low_stress: 0.6, cashflow_stability: 0.5,
    leverage_tolerance: -0.4, wealth_max: -0.2, downside_minimisation: 0.6,
  },
  contribute_super: {
    ...NEUTRAL_IMPACT,
    wealth_max: 0.6, fire_speed: 0.4, liquidity: -0.5,
  },
  rebalance: {
    ...NEUTRAL_IMPACT,
    safety: 0.4, downside_minimisation: 0.3, wealth_max: 0.1,
  },
  deploy_cash: {
    ...NEUTRAL_IMPACT,
    wealth_max: 0.5, fire_speed: 0.4, liquidity: -0.4, safety: -0.1,
  },
  diversify: {
    ...NEUTRAL_IMPACT,
    safety: 0.5, downside_minimisation: 0.5, wealth_max: 0.1,
  },
  tax_alpha: {
    ...NEUTRAL_IMPACT,
    wealth_max: 0.4, fire_speed: 0.3,
  },
};

export function impactForTag(tag: string): ImpactVector {
  return DEFAULT_IMPACTS[tag] ?? NEUTRAL_IMPACT;
}
