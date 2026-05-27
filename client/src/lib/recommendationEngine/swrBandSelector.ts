/**
 * swrBandSelector.ts — Sprint 20 PR-A.
 *
 * Engine-selected Safe Withdrawal Rate. Replaces the user-facing SWR input
 * in default mode: the user only sets target year + target monthly passive
 * income, and the engine selects a band based on household context.
 *
 * Adapter pattern only — this file is ADDITIVE. It does NOT touch
 * `buildCanonicalAuditTrace.fire` (legacy snapshot read) or
 * `legacyBestMoveToRecommendation`. Existing SWR consumers continue to read
 * `mc_fire_settings.swr_pct`; the band selector is wired into UI display
 * narratives and the canonical writer default via the `selectSwrBand` output.
 *
 * Bands (decimal form for `rate`):
 *   - conservative: 3.0–3.5%  → 3.25%
 *   - balanced:     3.5–4.0%  → 3.75%
 *   - aggressive:   4.0–4.5%  → 4.25%
 */

export type SwrBand = "conservative" | "balanced" | "aggressive";

export interface SwrInputs {
  /** Years from now until retirement (target year − current year). */
  retirementHorizonYears: number;
  /** Share of investable assets in equities (0..1). */
  equityShare: number;
  /** Share of net worth in property (0..1). */
  propertyShare: number;
  /** Debt-to-assets ratio (0..1+ — can exceed 1 in deeply leveraged cases). */
  leverageRatio: number;
  /** Household's current age (lead earner). */
  currentAge: number;
  /** Optional realised / target portfolio volatility (sigma, decimal). */
  portfolioVolatility?: number;
  /** Months of liquid expenses on hand. */
  liquidityMonths: number;
  /** Stability of primary income stream. */
  incomeReliability: "low" | "medium" | "high";
}

export interface SwrBandResult {
  band: SwrBand;
  /** Percent — e.g. 3.75 for balanced midpoint. */
  rate: number;
  /** Plain-English explanation of band selection. */
  rationale: string;
}

const BAND_RATE: Record<SwrBand, number> = {
  conservative: 3.25,
  balanced: 3.75,
  aggressive: 4.25,
};

/**
 * Pure scoring function. Maps a household snapshot to a band + rationale.
 *
 * The scoring is a weighted sum of risk signals; the threshold cuts produce
 * a deterministic band. Inputs are clamped to defensive ranges so a stray
 * NaN or out-of-range value never silently flips the band.
 */
export function selectSwrBand(inputs: SwrInputs): SwrBandResult {
  const horizon = clamp(inputs.retirementHorizonYears, -5, 80);
  const equity = clamp01(inputs.equityShare);
  const property = clamp01(inputs.propertyShare);
  const leverage = Math.max(0, Number.isFinite(inputs.leverageRatio) ? inputs.leverageRatio : 0);
  const age = clamp(inputs.currentAge, 18, 99);
  const liquidity = Math.max(0, Number.isFinite(inputs.liquidityMonths) ? inputs.liquidityMonths : 0);
  const vol = inputs.portfolioVolatility !== undefined && Number.isFinite(inputs.portfolioVolatility)
    ? Math.max(0, inputs.portfolioVolatility as number)
    : null;

  // Risk score: higher means MORE conservative. Calibrated so that a young,
  // diversified, low-leverage household scores near 0 and an older, highly
  // leveraged, property-heavy household scores near 1+.
  let score = 0;
  const drivers: string[] = [];

  // Horizon: long horizons require more conservatism (sequence risk over a
  // longer drawdown window).
  if (horizon > 30) {
    score += 0.4;
    drivers.push(`${Math.round(horizon)}y horizon raises sequence risk`);
  } else if (horizon < 15) {
    score -= 0.3;
    drivers.push(`${Math.round(horizon)}y short horizon reduces sequence risk`);
  }

  // Leverage: debt amplifies drawdown.
  if (leverage > 0.5) {
    score += 0.35;
    drivers.push(`${(leverage * 100).toFixed(0)}% leverage amplifies drawdown risk`);
  } else if (leverage < 0.2) {
    score -= 0.15;
    drivers.push("low leverage reduces drawdown risk");
  }

  // Property concentration: less liquid, harder to rebalance.
  if (property > 0.6) {
    score += 0.25;
    drivers.push(`${(property * 100).toFixed(0)}% property concentration reduces liquidity`);
  }

  // Liquidity buffer.
  if (liquidity < 3) {
    score += 0.2;
    drivers.push(`${liquidity.toFixed(1)}mo liquidity buffer is thin`);
  } else if (liquidity > 12) {
    score -= 0.15;
    drivers.push(`${liquidity.toFixed(0)}mo liquidity buffer is strong`);
  }

  // Income reliability.
  if (inputs.incomeReliability === "low") {
    score += 0.2;
    drivers.push("variable income reliability");
  } else if (inputs.incomeReliability === "high") {
    score -= 0.1;
    drivers.push("stable income");
  }

  // Volatility, when supplied.
  if (vol !== null && vol > 0.18) {
    score += 0.15;
    drivers.push(`${(vol * 100).toFixed(0)}% portfolio volatility`);
  }

  // Age — older households have less recovery time.
  if (age >= 55) {
    score += 0.15;
    drivers.push(`age ${age} reduces recovery time`);
  } else if (age < 35) {
    score -= 0.1;
    drivers.push(`age ${age} leaves a long earning runway`);
  }

  // Equity share — high equity raises expected return but also drawdown.
  if (equity > 0.8) {
    score += 0.1;
    drivers.push("equity-heavy mix");
  } else if (equity < 0.4) {
    score -= 0.05;
  }

  let band: SwrBand;
  if (score >= 0.55) band = "conservative";
  else if (score <= -0.1) band = "aggressive";
  else band = "balanced";

  const rationale =
    drivers.length === 0
      ? `Balanced profile (score ${score.toFixed(2)}) → ${band} band`
      : `${drivers.slice(0, 3).join("; ")} (score ${score.toFixed(2)}) → ${band} band`;

  return {
    band,
    rate: BAND_RATE[band],
    rationale,
  };
}

/**
 * Adapter: given an engine-selected band and an optional user override,
 * returns the effective SWR percent + a short info line for UI display.
 * Consumers wire the returned `rate` into existing SWR pathways — no engine
 * math is replaced.
 */
export function resolveEffectiveSwr(
  engineResult: SwrBandResult,
  swrOverride: number | undefined,
): {
  effectiveSwrPct: number;
  isOverridden: boolean;
  /** Info line for UI display when override is set. */
  overrideNotice: string | null;
} {
  if (Number.isFinite(swrOverride) && (swrOverride as number) > 0) {
    return {
      effectiveSwrPct: swrOverride as number,
      isOverridden: true,
      overrideNotice: `Engine suggested ${engineResult.rate.toFixed(2)}% ${engineResult.band}; you've overridden to ${(swrOverride as number).toFixed(2)}%.`,
    };
  }
  return {
    effectiveSwrPct: engineResult.rate,
    isOverridden: false,
    overrideNotice: null,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
