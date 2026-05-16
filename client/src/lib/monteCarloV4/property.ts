/**
 * property.ts — Phase C: Australian Property Cycle Model
 *
 * Builds a regime-aware Australian property cycle path that models boom/bust
 * cycles, rental growth cycles, vacancy pressure, IO expiry pressure,
 * refinance cliffs, APRA tightening, investor sentiment shifts, and regional
 * growth divergence (SEQ/Brisbane/Olympic overlays).
 *
 * Path is monthly. The engine uses these multipliers as overlays on top of
 * the user-supplied per-year property_growth and rent_growth assumptions —
 * meaning Profile-mode assumptions remain the long-run anchor, but the
 * cycle adds realistic dispersion and timing.
 */

import type { Rng } from "./rng";
import { randNormalSeeded, bernoulli } from "./rng";
import type { RegimeId } from "./regimes";
import { REGIME_EFFECTS } from "./regimes";

export type PropertyRegion =
  | "seq_olympic_overlay"   // South-East Qld / Brisbane Olympic uplift 2028–32
  | "sydney_metro"
  | "melbourne_metro"
  | "perth_metro"
  | "regional_qld"
  | "regional_vic"
  | "other";

export interface PropertyOverlayParams {
  /** Region for this property. */
  region: PropertyRegion;
  /** User-defined growth modifier (additive pp, default 0). */
  userGrowthModifier?: number;
  /** Is this property interest-only? If so, IO expiry stress applies. */
  interestOnly?: boolean;
  /** Months until IO expiry (if interestOnly). */
  ioMonthsRemaining?: number;
  /** Annual probability of APRA tightening shock per regime. */
  apraTightenProb?: number;
  /** Investor sentiment factor (0.6 fearful → 1.4 euphoric). */
  investorSentiment?: number;
}

const REGION_TILT: Record<PropertyRegion, number> = {
  seq_olympic_overlay: 1.2,
  sydney_metro: 1.0,
  melbourne_metro: 0.95,
  perth_metro: 1.05,
  regional_qld: 1.05,
  regional_vic: 0.95,
  other: 1.0,
};

/**
 * Olympic uplift schedule for SEQ properties — additive pp on annualised
 * growth, peaking in the lead-up years to Brisbane 2032.
 */
function olympicUpliftPp(year: number): number {
  if (year < 2026) return 0;
  if (year <= 2028) return 0.6;
  if (year <= 2030) return 1.2;
  if (year <= 2032) return 1.6;
  if (year <= 2034) return 0.8;
  return 0.2;
}

export interface PropertyCyclePath {
  /** Monthly multiplier on baseline property growth assumption. */
  growthMultByMonth: Float64Array;
  /** Monthly multiplier on baseline rent growth assumption. */
  rentMultByMonth: Float64Array;
  /** Monthly vacancy probability (0–1). */
  vacancyProbByMonth: Float64Array;
  /** Months that triggered an APRA tightening event. */
  apraTightenMonths: boolean[];
  /** Months where IO expiry hit this property (payment shock). */
  ioExpiryMonths: boolean[];
}

/**
 * Build a property cycle path conditional on the regime path and property
 * overlay params. Returns multipliers/vacancy/event indicators per month.
 */
export function generatePropertyCyclePath(
  rng: Rng,
  startYear: number,
  nMonths: number,
  regimePath: RegimeId[],
  overlay: PropertyOverlayParams,
): PropertyCyclePath {
  const growthMultByMonth = new Float64Array(nMonths);
  const rentMultByMonth = new Float64Array(nMonths);
  const vacancyProbByMonth = new Float64Array(nMonths);
  const apraTightenMonths: boolean[] = new Array(nMonths).fill(false);
  const ioExpiryMonths: boolean[] = new Array(nMonths).fill(false);

  const apraProb = overlay.apraTightenProb ?? 0.08;
  const sentiment = overlay.investorSentiment ?? 1.0;
  const regionTilt = REGION_TILT[overlay.region];
  const userMod = (overlay.userGrowthModifier ?? 0) / 100; // pp → multiplier diff

  let apraStressDecay = 0;       // additional growth drag after APRA event
  let ioRemaining = overlay.ioMonthsRemaining ?? -1;

  for (let mi = 0; mi < nMonths; mi++) {
    const year = startYear + Math.floor(mi / 12);
    const regime = regimePath[mi];
    const eff = REGIME_EFFECTS[regime];

    // APRA tightening — annualised prob, scaled into monthly bernoulli.
    // More likely during tightening / risk_on_mania regimes.
    let apraTilt = apraProb;
    if (regime === "risk_on_mania") apraTilt *= 2.0;
    if (regime === "tightening_cycle") apraTilt *= 1.5;
    if (regime === "rate_cut_cycle") apraTilt *= 0.4;
    if (bernoulli(rng, apraTilt / 12)) {
      apraTightenMonths[mi] = true;
      apraStressDecay = 0.5; // -0.5 mult headwind that decays
    }
    apraStressDecay *= 0.985; // decays over ~5 years

    // IO expiry — when IO runs out, the household has a payment shock.
    if (overlay.interestOnly && ioRemaining > 0) {
      ioRemaining--;
      if (ioRemaining === 0) ioExpiryMonths[mi] = true;
    }

    // Olympic / SEQ overlay (annualised pp → monthly delta)
    const olympicPp =
      overlay.region === "seq_olympic_overlay" ? olympicUpliftPp(year) / 100 / 12 : 0;

    // Cycle: growth mult is regime property tilt × region tilt × sentiment
    // minus apra stress decay drag, plus user modifier and olympic overlay,
    // plus a small monthly noise term.
    const noise = randNormalSeeded(rng, 0, 0.005);
    const growthMult =
      eff.property_growth_mult * regionTilt * sentiment
      - apraStressDecay * 0.05
      + olympicPp * 12 // express as multiplier (1.0 + uplift fraction)
      + userMod
      + noise;
    growthMultByMonth[mi] = Math.max(0, growthMult);

    rentMultByMonth[mi] =
      eff.rent_growth_mult * (regime === "housing_slowdown" ? 0.85 : 1.0)
      + randNormalSeeded(rng, 0, 0.003);

    // Vacancy probability — higher in recession / stagflation / housing slowdown.
    let vac = 0.03 / 12; // baseline annual 3%
    if (regime === "recession") vac = 0.06 / 12;
    if (regime === "stagflation") vac = 0.05 / 12;
    if (regime === "housing_slowdown") vac = 0.045 / 12;
    if (regime === "risk_on_mania") vac = 0.02 / 12;
    vacancyProbByMonth[mi] = vac;
  }

  return {
    growthMultByMonth,
    rentMultByMonth,
    vacancyProbByMonth,
    apraTightenMonths,
    ioExpiryMonths,
  };
}
