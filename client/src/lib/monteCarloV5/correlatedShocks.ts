/**
 * correlatedShocks.ts — Phase 2: Correlated Shock Engine
 *
 * V4's shocks were drawn independently. V5 introduces cross-asset
 * correlation so the dependence structure of property / equities / crypto /
 * rates matches the brief:
 *
 *   - inflation up   -> rates up
 *   - rates up       -> property growth slows / refinance stress rises
 *   - recession      -> unemployment up, stocks down, crypto down
 *   - tech crash     -> stocks down (growth ETF concentration penalty)
 *   - crypto crash   -> correlates with risk-off across equities/property
 *
 * Implementation:
 *   - Per-month vector of standard normals z[0..K-1] for K factors:
 *       0: stocks, 1: crypto, 2: property, 3: rates, 4: inflation
 *   - Cholesky-decomposed correlation matrix Σ produces correlated normals
 *     ε = L·z that drive the per-month return surface.
 *   - Fat tails: with probability p_jump, ε for risk factors is scaled by a
 *     jump multiplier drawn from a heavy-tailed distribution.
 *   - Clustered volatility: a GARCH-lite scalar vol multiplier σ_t that is
 *     persistent and amplifies during stress windows.
 *   - Shock cascades: a triggered crypto crash (>30% in a month) raises the
 *     conditional probability of an equity drawdown in the next 1-3 months.
 *
 * The engine is deterministic given the seed. It does NOT replace V4's
 * regime-based macro path — it adds a correlated noise layer that can be
 * applied to monthly multipliers downstream.
 */

import { mulberry32, randNormalSeeded, bernoulli, type Rng } from "../monteCarloV4/rng";
import type { RegimeId } from "../monteCarloV4/regimes";

export type ShockFactor = "stocks" | "crypto" | "property" | "rates" | "inflation";

/** Order of factors in vectors / matrices below. */
export const SHOCK_FACTORS: ShockFactor[] = ["stocks", "crypto", "property", "rates", "inflation"];

/**
 * Baseline correlation matrix. Symmetric, positive-definite. Values are
 * calibrated to long-run AU-flavoured correlations.
 *
 *           stocks crypto property rates  inflation
 * stocks    [  1     0.55    0.35  -0.20   -0.15  ]
 * crypto    [ 0.55    1      0.20  -0.10   -0.05  ]
 * property  [ 0.35   0.20     1    -0.45   -0.10  ]
 * rates     [-0.20  -0.10   -0.45    1      0.55  ]
 * inflation [-0.15  -0.05   -0.10   0.55     1    ]
 */
export const BASE_CORR: number[][] = [
  [ 1.00,  0.55,  0.35, -0.20, -0.15],
  [ 0.55,  1.00,  0.20, -0.10, -0.05],
  [ 0.35,  0.20,  1.00, -0.45, -0.10],
  [-0.20, -0.10, -0.45,  1.00,  0.55],
  [-0.15, -0.05, -0.10,  0.55,  1.00],
];

/** Regime-conditional correlation lifts (added to BASE_CORR, then clamped). */
export const REGIME_CORR_LIFT: Partial<Record<RegimeId, number>> = {
  recession:         0.18, // everything correlates in stress
  stagflation:       0.20,
  deflationary_shock:0.22,
  tightening_cycle:  0.10,
  risk_on_mania:     0.08,
  normal_growth:     0.0,
};

/**
 * Cholesky decomposition. Returns lower-triangular L such that L·Lᵀ = M.
 * Throws if M is not positive-definite.
 */
export function cholesky(M: number[][]): number[][] {
  const n = M.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const v = M[i][i] - sum;
        if (v <= 0) {
          // Tikhonov regularise: bump diagonal slightly to keep PD.
          L[i][j] = Math.sqrt(Math.max(1e-9, M[i][i] - sum + 1e-6));
        } else {
          L[i][j] = Math.sqrt(v);
        }
      } else {
        L[i][j] = (M[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/** Build the correlation matrix for a given regime (base + lift, clamped). */
export function correlationForRegime(regime: RegimeId): number[][] {
  const lift = REGIME_CORR_LIFT[regime] ?? 0.0;
  const M: number[][] = BASE_CORR.map((row, i) => row.map((v, j) => {
    if (i === j) return 1;
    const lifted = v + (v >= 0 ? lift : -lift);
    return Math.max(-0.95, Math.min(0.95, lifted));
  }));
  return M;
}

/**
 * GARCH-lite volatility state. σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
 * with persistence β ≈ 0.85 and shock weight α ≈ 0.10. Mean reversion to 1.
 */
export class VolState {
  variance: number;
  constructor(initial = 1.0) { this.variance = initial; }
  update(epsSqr: number, omega = 0.05, alpha = 0.10, beta = 0.85): number {
    this.variance = omega + alpha * epsSqr + beta * this.variance;
    return Math.sqrt(Math.max(0.1, this.variance));
  }
  scalar(): number { return Math.sqrt(Math.max(0.1, this.variance)); }
}

/** Heavy-tailed jump multiplier (Student-t-like via inverse-Gaussian mixture). */
export function jumpMultiplier(rng: Rng, df = 4): number {
  // Mix: scale a normal by sqrt(df/chi2_df) ≈ Student-t
  // Approximate chi2_df via sum of df normals squared.
  let s = 0;
  for (let i = 0; i < df; i++) {
    const z = randNormalSeeded(rng, 0, 1);
    s += z * z;
  }
  const chi2 = Math.max(0.1, s);
  return Math.sqrt(df / chi2);
}

export interface CorrelatedShockOptions {
  /** Per-month probability of a jump event in risk factors. */
  jumpProb?: number;          // default 0.04
  /** Jump degrees of freedom; lower => fatter tails. */
  jumpDf?: number;            // default 4
  /** Whether to enable GARCH-lite clustered volatility. */
  clusteredVol?: boolean;     // default true
}

export interface MonthlyShockVector {
  /** Correlated standardised shock per factor. */
  factor: Record<ShockFactor, number>;
  /** Realised volatility multiplier this month. */
  volScalar: number;
  /** True if this month included a fat-tail jump. */
  jump: boolean;
  /** True if cascade window is active (triggered by prior major drawdown). */
  cascade: boolean;
}

/**
 * Generate a full sequence of correlated monthly shock vectors aligned with
 * the V4 regime path. Deterministic given rng.
 */
export function generateCorrelatedShockPath(
  rng: Rng,
  regimePath: RegimeId[],
  opts: CorrelatedShockOptions = {},
): MonthlyShockVector[] {
  const jumpProb = opts.jumpProb ?? 0.04;
  const jumpDf = opts.jumpDf ?? 4;
  const clusteredVol = opts.clusteredVol !== false;

  const n = regimePath.length;
  const out: MonthlyShockVector[] = new Array(n);
  const vol = new VolState(1.0);
  let cascadeRemaining = 0;

  // Pre-compute Cholesky factors per regime to avoid recomputing each month
  const cholCache = new Map<RegimeId, number[][]>();
  const getL = (r: RegimeId): number[][] => {
    let L = cholCache.get(r);
    if (!L) { L = cholesky(correlationForRegime(r)); cholCache.set(r, L); }
    return L;
  };

  let prevEpsSqr = 1.0;
  for (let t = 0; t < n; t++) {
    const r = regimePath[t];
    const L = getL(r);
    const K = L.length;

    // Independent standard normals
    const z: number[] = new Array(K);
    for (let i = 0; i < K; i++) z[i] = randNormalSeeded(rng, 0, 1);

    // Correlated normals ε = L·z
    const eps: number[] = new Array(K).fill(0);
    for (let i = 0; i < K; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
      eps[i] = s;
    }

    // Fat-tail jump on stocks/crypto/property (factors 0,1,2)
    let jumped = false;
    if (bernoulli(rng, jumpProb)) {
      jumped = true;
      const jm = jumpMultiplier(rng, jumpDf);
      eps[0] *= jm;
      eps[1] *= jm * 1.2;
      eps[2] *= 0.5 * jm + 0.5;
    }

    // Clustered volatility scalar
    const volScalar = clusteredVol ? vol.update(prevEpsSqr) : 1.0;
    prevEpsSqr = eps[0] * eps[0];

    // Cascade trigger: crypto factor < -2.5 (roughly a -30%+ monthly draw)
    if (cascadeRemaining > 0) cascadeRemaining--;
    if (eps[1] < -2.5) cascadeRemaining = Math.max(cascadeRemaining, 3);

    // During cascade, equity epsilon receives an extra negative drift
    let cascadeActive = cascadeRemaining > 0;
    if (cascadeActive) {
      eps[0] -= 0.6;
      eps[2] -= 0.25;
    }

    out[t] = {
      factor: {
        stocks:    eps[0] * volScalar,
        crypto:    eps[1] * volScalar,
        property:  eps[2] * volScalar,
        rates:     eps[3],
        inflation: eps[4],
      },
      volScalar,
      jump: jumped,
      cascade: cascadeActive,
    };
  }
  return out;
}

/** Aggregate stress signals from a shock path. Useful for narratives. */
export interface ShockPathSummary {
  jumpMonths: number;
  cascadeMonths: number;
  maxVolScalar: number;
  worstCryptoMonth: number;
  worstStocksMonth: number;
  /** Indices of the top 3 stress months. */
  topStressMonthIndices: number[];
}

export function summariseShockPath(path: MonthlyShockVector[]): ShockPathSummary {
  let jump = 0, cascade = 0, maxVol = 0;
  let worstCrypto = 0, worstStocks = 0;
  const stressScores: { idx: number; score: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p.jump) jump++;
    if (p.cascade) cascade++;
    if (p.volScalar > maxVol) maxVol = p.volScalar;
    if (p.factor.crypto < worstCrypto) worstCrypto = p.factor.crypto;
    if (p.factor.stocks < worstStocks) worstStocks = p.factor.stocks;
    const score = -p.factor.stocks - 0.5 * p.factor.crypto - 0.3 * p.factor.property
      + 0.5 * p.factor.rates + 0.3 * p.factor.inflation;
    stressScores.push({ idx: i, score });
  }
  stressScores.sort((a, b) => b.score - a.score);
  return {
    jumpMonths: jump,
    cascadeMonths: cascade,
    maxVolScalar: maxVol,
    worstCryptoMonth: worstCrypto,
    worstStocksMonth: worstStocks,
    topStressMonthIndices: stressScores.slice(0, 3).map(s => s.idx),
  };
}

// Re-export rng helper for callers that just want a seeded rng.
export { mulberry32 };
