/**
 * regimesV5.ts — Phase 1: Real-World Economic Regime Model (V5)
 *
 * V5 is ADDITIVE to V4. It does not replace V4's 11-state regime engine.
 * Instead it:
 *
 *   1. Maps V4 regime IDs onto a richer V5 vocabulary aligned with the
 *      brief: inflation shock, disinflation, recession, stagflation,
 *      low-growth, high-growth boom, liquidity crisis, housing correction,
 *      tech bull, crypto winter.
 *
 *   2. Introduces three new V5-only "compound" regimes (overlays, not full
 *      Markov states): liquidity_crisis, tech_bull_cycle, crypto_winter.
 *      These are derived deterministically from the V4 regime path plus
 *      a seeded overlay schedule, so they are reproducible and never
 *      conflict with V4's transition matrix.
 *
 *   3. Provides V5 effect packs that ADJUST V4's RegimeEffects with extra
 *      sensitivity for borrowing capacity, refinancing stress, cash drag,
 *      and inflation pass-through. V4 effects remain the source of truth
 *      for the V3 canonical run.
 *
 * All maths are deterministic and seedable. No I/O.
 */

import { mulberry32, hashSeed, bernoulli, type Rng } from "../monteCarloV4/rng";
import {
  REGIME_EFFECTS,
  type RegimeEffects,
  type RegimeId,
} from "../monteCarloV4/regimes";

/**
 * V5 regime vocabulary. Each value is either a direct V4 RegimeId or a
 * V5-only overlay that layers on top of a V4 regime path.
 */
export type RegimeIdV5 =
  | "normal_growth"
  | "inflation_shock"     // alias for V4 high_inflation when severe
  | "disinflation"
  | "recession"
  | "stagflation"
  | "low_growth"          // V4 housing_slowdown + soft labour market
  | "high_growth_boom"    // V4 commodity_boom / risk_on_mania merge
  | "liquidity_crisis"    // V5-only overlay
  | "housing_correction"  // V4 housing_slowdown extended
  | "tech_bull_cycle"     // V5-only overlay
  | "crypto_winter";      // V5-only overlay

export const REGIME_IDS_V5: RegimeIdV5[] = [
  "normal_growth",
  "inflation_shock",
  "disinflation",
  "recession",
  "stagflation",
  "low_growth",
  "high_growth_boom",
  "liquidity_crisis",
  "housing_correction",
  "tech_bull_cycle",
  "crypto_winter",
];

/**
 * Map a V4 regime id onto the V5 vocabulary. This is a labelling layer
 * only — V4's Markov chain still drives the macro path; V5 simply
 * renames for advisor-grade language and adds overlay flags.
 */
export function mapV4ToV5(regime: RegimeId): RegimeIdV5 {
  switch (regime) {
    case "high_inflation":      return "inflation_shock";
    case "disinflation":        return "disinflation";
    case "stagflation":         return "stagflation";
    case "recession":           return "recession";
    case "commodity_boom":      return "high_growth_boom";
    case "housing_slowdown":    return "housing_correction";
    case "rate_cut_cycle":      return "low_growth";
    case "tightening_cycle":    return "inflation_shock";
    case "risk_on_mania":       return "high_growth_boom";
    case "deflationary_shock":  return "liquidity_crisis";
    case "normal_growth":
    default:                    return "normal_growth";
  }
}

/**
 * V5-only overlay flags. These are sampled separately from the V4 regime
 * path and modulate asset-class returns and stress probabilities. They are
 * NOT new Markov states — they coexist with the V4 regime.
 */
export interface RegimeOverlayFlags {
  liquidityCrisis: boolean;      // funding squeeze, term-premium blowout
  techBullCycle: boolean;        // mega-cap tech outperformance
  cryptoWinter: boolean;         // BTC drawdown > 60%
}

/**
 * V5 effect adjustments. Multipliers/offsets that are APPLIED ON TOP of
 * V4 effects. Always defined; default to neutral (1.0 / 0).
 */
export interface V5EffectAdj {
  inflation_add_extra: number;
  property_growth_mult_extra: number;
  rent_growth_mult_extra: number;
  stocks_return_mult_extra: number;
  crypto_return_mult_extra: number;
  interest_rate_add_extra: number;
  borrowing_power_mult_extra: number;
  refinance_risk_mult_extra: number;
  liquidity_pressure_mult_extra: number;
  unemployment_risk_add_extra: number;
  cash_drag_mult: number;         // multiplier on real cash drag (V5-only)
  serviceability_haircut: number; // 0..0.3 — extra haircut to borrowing capacity
}

const NEUTRAL: V5EffectAdj = {
  inflation_add_extra: 0,
  property_growth_mult_extra: 0,
  rent_growth_mult_extra: 0,
  stocks_return_mult_extra: 0,
  crypto_return_mult_extra: 0,
  interest_rate_add_extra: 0,
  borrowing_power_mult_extra: 0,
  refinance_risk_mult_extra: 0,
  liquidity_pressure_mult_extra: 0,
  unemployment_risk_add_extra: 0,
  cash_drag_mult: 1.0,
  serviceability_haircut: 0,
};

/**
 * V5 effect adjustments by V5 regime id. These layer on top of V4 effects.
 */
export const REGIME_EFFECTS_V5: Record<RegimeIdV5, V5EffectAdj> = {
  normal_growth: { ...NEUTRAL },
  inflation_shock: {
    ...NEUTRAL,
    inflation_add_extra: 0.5,
    rent_growth_mult_extra: 0.1,
    interest_rate_add_extra: 0.3,
    borrowing_power_mult_extra: -0.05,
    serviceability_haircut: 0.07,
    refinance_risk_mult_extra: 0.15,
    cash_drag_mult: 1.1,
  },
  disinflation: {
    ...NEUTRAL,
    inflation_add_extra: -0.2,
    interest_rate_add_extra: -0.2,
    borrowing_power_mult_extra: 0.03,
    cash_drag_mult: 0.95,
  },
  recession: {
    ...NEUTRAL,
    unemployment_risk_add_extra: 1.0,
    stocks_return_mult_extra: -0.1,
    crypto_return_mult_extra: -0.2,
    property_growth_mult_extra: -0.05,
    liquidity_pressure_mult_extra: 0.2,
    serviceability_haircut: 0.12,
    refinance_risk_mult_extra: 0.25,
  },
  stagflation: {
    ...NEUTRAL,
    inflation_add_extra: 0.8,
    unemployment_risk_add_extra: 0.8,
    stocks_return_mult_extra: -0.1,
    property_growth_mult_extra: -0.08,
    interest_rate_add_extra: 0.5,
    borrowing_power_mult_extra: -0.08,
    serviceability_haircut: 0.15,
    refinance_risk_mult_extra: 0.30,
    cash_drag_mult: 1.25,
  },
  low_growth: {
    ...NEUTRAL,
    property_growth_mult_extra: -0.03,
    stocks_return_mult_extra: -0.05,
    cash_drag_mult: 1.05,
    serviceability_haircut: 0.03,
  },
  high_growth_boom: {
    ...NEUTRAL,
    stocks_return_mult_extra: 0.10,
    crypto_return_mult_extra: 0.15,
    property_growth_mult_extra: 0.05,
    borrowing_power_mult_extra: 0.03,
    cash_drag_mult: 0.9,
  },
  liquidity_crisis: {
    ...NEUTRAL,
    stocks_return_mult_extra: -0.25,
    crypto_return_mult_extra: -0.40,
    property_growth_mult_extra: -0.10,
    liquidity_pressure_mult_extra: 0.50,
    refinance_risk_mult_extra: 0.40,
    interest_rate_add_extra: 0.40,
    borrowing_power_mult_extra: -0.10,
    serviceability_haircut: 0.18,
    cash_drag_mult: 1.40,
  },
  housing_correction: {
    ...NEUTRAL,
    property_growth_mult_extra: -0.18,
    rent_growth_mult_extra: -0.05,
    borrowing_power_mult_extra: -0.07,
    serviceability_haircut: 0.10,
    refinance_risk_mult_extra: 0.22,
  },
  tech_bull_cycle: {
    ...NEUTRAL,
    stocks_return_mult_extra: 0.20,
    crypto_return_mult_extra: 0.10,
    cash_drag_mult: 0.85,
  },
  crypto_winter: {
    ...NEUTRAL,
    crypto_return_mult_extra: -0.50,
    stocks_return_mult_extra: -0.03,
    cash_drag_mult: 1.05,
  },
};

/**
 * Compute the COMBINED effect for a month: V4 base effect plus the V5 alias
 * adjustment plus any active overlays. Returns a derived RegimeEffects-like
 * shape suitable for downstream consumers.
 */
export interface CombinedRegimeEffects extends RegimeEffects {
  v5Id: RegimeIdV5;
  overlays: RegimeOverlayFlags;
  serviceabilityHaircut: number;
  cashDragMult: number;
}

export function combinedEffects(
  v4Regime: RegimeId,
  overlays: RegimeOverlayFlags,
): CombinedRegimeEffects {
  const v4 = REGIME_EFFECTS[v4Regime];
  const v5Id = mapV4ToV5(v4Regime);
  const adj = REGIME_EFFECTS_V5[v5Id];
  const overlayAdjs: V5EffectAdj[] = [];
  if (overlays.liquidityCrisis) overlayAdjs.push(REGIME_EFFECTS_V5.liquidity_crisis);
  if (overlays.techBullCycle)   overlayAdjs.push(REGIME_EFFECTS_V5.tech_bull_cycle);
  if (overlays.cryptoWinter)    overlayAdjs.push(REGIME_EFFECTS_V5.crypto_winter);

  const allAdj = [adj, ...overlayAdjs];
  const sum = (k: keyof V5EffectAdj) => allAdj.reduce((s, a) => s + (a[k] as number), 0);

  return {
    ...v4,
    inflation_add: v4.inflation_add + sum("inflation_add_extra"),
    property_growth_mult: Math.max(0, v4.property_growth_mult + sum("property_growth_mult_extra")),
    rent_growth_mult: Math.max(0, v4.rent_growth_mult + sum("rent_growth_mult_extra")),
    stocks_return_mult: Math.max(-1, v4.stocks_return_mult + sum("stocks_return_mult_extra")),
    crypto_return_mult: Math.max(-1, v4.crypto_return_mult + sum("crypto_return_mult_extra")),
    interest_rate_add: v4.interest_rate_add + sum("interest_rate_add_extra"),
    borrowing_power_mult: Math.max(0.5, v4.borrowing_power_mult + sum("borrowing_power_mult_extra")),
    refinance_risk_mult: Math.max(0.1, v4.refinance_risk_mult + sum("refinance_risk_mult_extra")),
    liquidity_pressure_mult: Math.max(0.5, v4.liquidity_pressure_mult + sum("liquidity_pressure_mult_extra")),
    unemployment_risk_add: v4.unemployment_risk_add + sum("unemployment_risk_add_extra"),
    v5Id,
    overlays,
    serviceabilityHaircut: Math.min(0.35, Math.max(0, sum("serviceability_haircut"))),
    cashDragMult: Math.max(0.5,
      allAdj.reduce((p, a) => p * a.cash_drag_mult, 1.0)),
  };
}

/**
 * Generate a per-month overlay schedule. Overlays are sampled independently
 * with regime-conditional probabilities to capture the brief's expectation
 * that tech bull and crypto winter are macro-aware but not mechanically tied
 * to RBA cycles.
 *
 * Persistence is enforced: once an overlay turns on, it lasts a minimum
 * window (12 months tech bull, 18 months crypto winter, 6 months liquidity
 * crisis) to avoid pixel-noise toggling between months.
 */
export function generateOverlaySchedule(
  rng: Rng,
  regimePath: RegimeId[],
): RegimeOverlayFlags[] {
  const n = regimePath.length;
  const out: RegimeOverlayFlags[] = new Array(n);
  let techRemaining = 0;
  let cryptoRemaining = 0;
  let liqRemaining = 0;
  let techActive = false;
  let cryptoActive = false;
  let liqActive = false;

  for (let i = 0; i < n; i++) {
    const r = regimePath[i];

    // Tech bull cycle: more likely during risk-on, rate-cut, normal-growth
    if (techRemaining > 0) techRemaining--;
    else {
      techActive = false;
      const pStart = r === "risk_on_mania" ? 0.04
        : r === "rate_cut_cycle" ? 0.025
        : r === "normal_growth" ? 0.012
        : 0.004;
      if (bernoulli(rng, pStart)) {
        techActive = true;
        techRemaining = 12 + Math.floor(rng() * 18); // 12-30 months
      }
    }

    // Crypto winter: more likely during tightening, recession, deflation
    if (cryptoRemaining > 0) cryptoRemaining--;
    else {
      cryptoActive = false;
      const pStart = r === "tightening_cycle" ? 0.05
        : r === "recession" ? 0.06
        : r === "deflationary_shock" ? 0.08
        : r === "risk_on_mania" ? 0.02  // can flip after a mania
        : 0.01;
      if (bernoulli(rng, pStart)) {
        cryptoActive = true;
        cryptoRemaining = 18 + Math.floor(rng() * 18); // 18-36 months
      }
    }

    // Liquidity crisis: rare, tail event; correlated with recession + stagflation
    if (liqRemaining > 0) liqRemaining--;
    else {
      liqActive = false;
      const pStart = r === "recession" ? 0.02
        : r === "stagflation" ? 0.015
        : r === "deflationary_shock" ? 0.035
        : 0.002;
      if (bernoulli(rng, pStart)) {
        liqActive = true;
        liqRemaining = 6 + Math.floor(rng() * 9); // 6-15 months
      }
    }

    out[i] = {
      techBullCycle: techActive,
      cryptoWinter: cryptoActive,
      liquidityCrisis: liqActive,
    };
  }
  return out;
}

/**
 * Deterministic helper: build a V5 regime label sequence per year given a
 * V4 regime-per-year sequence and per-year overlay summary.
 */
export function v5RegimeLabelByYear(
  v4ByYear: RegimeId[],
  overlayByYear: RegimeOverlayFlags[],
): RegimeIdV5[] {
  return v4ByYear.map((r, i) => {
    const o = overlayByYear[i] ?? { techBullCycle: false, cryptoWinter: false, liquidityCrisis: false };
    if (o.liquidityCrisis) return "liquidity_crisis";
    if (o.cryptoWinter && (r === "tightening_cycle" || r === "recession")) return "crypto_winter";
    if (o.techBullCycle && (r === "normal_growth" || r === "rate_cut_cycle" || r === "risk_on_mania"))
      return "tech_bull_cycle";
    return mapV4ToV5(r);
  });
}

export function aggregateOverlaysByYear(
  overlayByMonth: RegimeOverlayFlags[],
  nYears: number,
): RegimeOverlayFlags[] {
  const out: RegimeOverlayFlags[] = new Array(nYears).fill(null).map(() => ({
    techBullCycle: false, cryptoWinter: false, liquidityCrisis: false,
  }));
  for (let y = 0; y < nYears; y++) {
    let t = 0, c = 0, l = 0;
    for (let m = 0; m < 12; m++) {
      const idx = y * 12 + m;
      if (idx >= overlayByMonth.length) break;
      if (overlayByMonth[idx].techBullCycle) t++;
      if (overlayByMonth[idx].cryptoWinter) c++;
      if (overlayByMonth[idx].liquidityCrisis) l++;
    }
    out[y] = {
      techBullCycle: t >= 6,
      cryptoWinter: c >= 6,
      liquidityCrisis: l >= 3,
    };
  }
  return out;
}

/**
 * Plain-English label + tooltip for a V5 regime id.
 */
export const V5_REGIME_LABELS: Record<RegimeIdV5, { label: string; tooltip: string }> = {
  normal_growth:      { label: "Normal Growth",      tooltip: "Steady GDP and inflation near target." },
  inflation_shock:    { label: "Inflation Shock",    tooltip: "CPI well above target; rates rising; real wages compressed." },
  disinflation:       { label: "Disinflation",       tooltip: "Inflation cooling toward target; risk assets re-rating." },
  recession:          { label: "Recession",          tooltip: "Output contracting; unemployment rising; central bank easing." },
  stagflation:        { label: "Stagflation",        tooltip: "High inflation + weak growth — worst case for leverage." },
  low_growth:         { label: "Low Growth",         tooltip: "Soft labour market and below-trend GDP." },
  high_growth_boom:   { label: "High-Growth Boom",   tooltip: "Strong nominal growth, exports / risk assets outperform." },
  liquidity_crisis:   { label: "Liquidity Crisis",   tooltip: "Funding squeeze and credit spreads blowing out." },
  housing_correction: { label: "Housing Correction", tooltip: "Property prices retracing; investor demand weak." },
  tech_bull_cycle:    { label: "Tech Bull Cycle",    tooltip: "Mega-cap tech leadership; growth ETFs outperform." },
  crypto_winter:      { label: "Crypto Winter",      tooltip: "BTC drawdown > 60%; risk-off in digital assets." },
};

// Re-export for convenience
export { hashSeed, mulberry32 };
