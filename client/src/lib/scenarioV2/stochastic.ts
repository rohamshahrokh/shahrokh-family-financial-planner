/**
 * Scenario Engine V2 — Stochastic Returns Module
 *
 * Real fintech-grade stochastic engine:
 *
 *   • Correlated multi-asset normal draws via Cholesky decomposition
 *   • Fat-tailed Student-t draws (defaults to ν=5 for equity/property,
 *     ν=3 for crypto — heavier tail)
 *   • Jump-diffusion for crypto (Merton model — Poisson-driven large drops)
 *   • Mean-reverting interest-rate path (Vasicek discrete approximation)
 *   • Inflation regime-switching (two states: low/high)
 *
 * Determinism contract:
 *   Every random draw routes through a SeededRng. Same seed → same sequence.
 *   No Math.random, no Date.now.
 *
 * Asset universe (mapped to V2 PortfolioState):
 *   0 = property growth
 *   1 = equity (ETF)
 *   2 = crypto
 *   3 = cash short-rate (drives mortgage + cash APR)
 *
 * Correlation matrix used (research-grade defaults):
 *      P     E     C    R
 *   P [1.00, 0.40, 0.25, -0.30]
 *   E [0.40, 1.00, 0.55, -0.20]
 *   C [0.25, 0.55, 1.00, -0.10]
 *   R [-0.30,-0.20,-0.10, 1.00]
 *
 * Rationale: property-equity historically ~+0.3-0.5, equity-crypto ~+0.5,
 * rates negatively correlated with risk assets (rate spikes → drawdown).
 */

import type { SeededRng } from "./determinism";

// ─── Correlation matrix ──────────────────────────────────────────────────────

export const ASSET_NAMES = ["property", "equity", "crypto", "rate"] as const;
export type AssetKey = typeof ASSET_NAMES[number];

export type CorrelationMatrix = number[][]; // 4×4

export const DEFAULT_CORRELATION: CorrelationMatrix = [
  // P     E     C     R
  [1.00, 0.40, 0.25, -0.30], // property
  [0.40, 1.00, 0.55, -0.20], // equity
  [0.25, 0.55, 1.00, -0.10], // crypto
  [-0.30, -0.20, -0.10, 1.00], // rate
];

// ─── Cholesky decomposition ──────────────────────────────────────────────────

/**
 * Compute lower-triangular L such that L·Lᵀ = C.
 * Pure function — no random state. Returns null if matrix is not PSD.
 */
export function cholesky(C: CorrelationMatrix): number[][] | null {
  const n = C.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const diag = C[i][i] - sum;
        if (diag <= 1e-12) return null; // not PSD
        L[i][j] = Math.sqrt(diag);
      } else {
        L[i][j] = (C[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/** Multiply lower-triangular L by vector z. Returns L·z. */
export function multiplyLowerByVec(L: number[][], z: number[]): number[] {
  const n = L.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
    out[i] = s;
  }
  return out;
}

// ─── Multivariate correlated draws ───────────────────────────────────────────

/**
 * Draw a 4-vector of CORRELATED standard normals from independent draws and
 * a precomputed Cholesky factor.
 */
export function drawCorrelatedNormals(L: number[][], rng: SeededRng): number[] {
  const n = L.length;
  const z = new Array<number>(n);
  for (let i = 0; i < n; i++) z[i] = rng.normal();
  return multiplyLowerByVec(L, z);
}

// ─── Student-t (fat tails) ───────────────────────────────────────────────────

/**
 * Standard Student-t draw with `nu` degrees of freedom via the ratio
 * of a standard normal and √(chi²_ν / ν). Approximated chi² via sum of
 * ν squared normals (accurate for ν ≥ 2; we use ν ≥ 3).
 *
 *   ν=3  — very heavy tails (crypto)
 *   ν=5  — moderately fat (equity/property)
 *   ν=∞  — converges to standard normal
 *
 * To preserve marginal variance ≈ 1, scale by √((ν−2)/ν). This makes the
 * Student-t draw a drop-in for a standard-normal shock.
 */
export function studentT(rng: SeededRng, nu: number): number {
  const z = rng.normal();
  // Approximate chi² with nu degrees of freedom = sum of nu i.i.d. squared normals
  let chiSq = 0;
  const niu = Math.max(3, Math.floor(nu));
  for (let k = 0; k < niu; k++) {
    const g = rng.normal();
    chiSq += g * g;
  }
  const t = z / Math.sqrt(chiSq / niu);
  // Rescale to unit variance
  return t * Math.sqrt((niu - 2) / niu);
}

// ─── Jump diffusion (crypto) ─────────────────────────────────────────────────

export interface JumpDiffusionParams {
  /** Annual jump intensity (Poisson rate). Default 1.5/yr for crypto. */
  lambda: number;
  /** Mean log-jump size. Negative = bias toward crashes. */
  meanLogJump: number;
  /** Stddev of log-jump size. */
  stdLogJump: number;
}

export const CRYPTO_JUMPS: JumpDiffusionParams = {
  lambda: 1.5,          // ~1.5 jumps/year
  meanLogJump: -0.05,   // jumps lean slightly negative
  stdLogJump: 0.20,     // moderate size
};

/**
 * Monthly jump multiplier. Returns 1.0 if no jump fires this month, else
 * exp(N(meanLogJump, stdLogJump²)). Multiplicative on top of base return.
 *
 *   monthlyReturn := (1 + baseDrift + baseShock) * jumpMultiplier - 1
 */
export function drawJumpMultiplier(rng: SeededRng, params: JumpDiffusionParams): number {
  const monthlyLambda = params.lambda / 12;
  // Approximate Poisson(λ) as Bernoulli(λ) for λ << 1 (which is true monthly).
  // For λ ≥ 1 we could sum, but monthly λ < 0.15 so error is negligible.
  if (rng.next() >= monthlyLambda) return 1.0;
  const z = rng.normal();
  const logJump = params.meanLogJump + params.stdLogJump * z;
  return Math.exp(logJump);
}

// ─── Vasicek short-rate (interest rate mean reversion) ───────────────────────

export interface VasicekParams {
  /** Mean reversion speed (per year). Default 0.50. */
  kappa: number;
  /** Long-run mean rate (e.g. 0.04). */
  theta: number;
  /** Annual volatility of short rate (e.g. 0.015 = 1.5%). */
  sigma: number;
  /** Starting rate. */
  r0: number;
}

export const DEFAULT_RATE_PROCESS: VasicekParams = {
  kappa: 0.50,
  theta: 0.04,
  sigma: 0.012,
  r0: 0.043, // RBA mid-2026 expectation
};

/** Step one month forward. Returns next short rate. */
export function vasicekStep(
  r: number,
  params: VasicekParams,
  rateShock: number, // already a correlated normal shock
): number {
  const dt = 1 / 12;
  const drift = params.kappa * (params.theta - r) * dt;
  const diff = params.sigma * Math.sqrt(dt) * rateShock;
  return r + drift + diff;
}

// ─── Inflation regime switching ──────────────────────────────────────────────

export interface InflationRegimeParams {
  /** Low regime mean (e.g. 0.025) and vol (e.g. 0.005). */
  lowMean: number;
  lowVol: number;
  /** High regime mean (e.g. 0.06) and vol (e.g. 0.01). */
  highMean: number;
  highVol: number;
  /** Monthly probability of switching from low → high. */
  pLowToHigh: number;
  /** Monthly probability of switching from high → low. */
  pHighToLow: number;
}

export const DEFAULT_INFLATION_REGIMES: InflationRegimeParams = {
  lowMean: 0.025,
  lowVol: 0.005,
  highMean: 0.060,
  highVol: 0.012,
  pLowToHigh: 0.01, // ~once every 100 months from low to high
  pHighToLow: 0.04, // high regimes mean-revert faster
};

export type InflationRegime = "low" | "high";

export interface InflationStep {
  regime: InflationRegime;
  /** Annualised inflation this month. */
  rate: number;
}

export function inflationStep(
  prev: InflationRegime,
  params: InflationRegimeParams,
  rng: SeededRng,
): InflationStep {
  let regime: InflationRegime = prev;
  const u = rng.next();
  if (prev === "low" && u < params.pLowToHigh) regime = "high";
  else if (prev === "high" && u < params.pHighToLow) regime = "low";

  const z = rng.normal();
  const rate = regime === "low"
    ? params.lowMean + params.lowVol * z
    : params.highMean + params.highVol * z;
  return { regime, rate: Math.max(-0.02, rate) }; // floor at -2% (deflation cap)
}

// ─── Sequence-of-returns risk ────────────────────────────────────────────────
//
// "Sequence risk" is the risk that bad returns occur EARLY in a withdrawal
// or accumulation phase. Mathematically, given the same arithmetic return
// stream, terminal wealth differs based on order when withdrawals/contributions
// are non-zero.
//
// We don't need a special engine for this — by simulating each month's
// returns sequentially with the same RNG (rather than averaging up front),
// our engine ALREADY captures sequence risk. What we DO need to expose is
// a metric: the dispersion of paths that match in mean return but differ
// in ordering.
//
// `terminalDispersion` quantifies this: stddev / |mean| of the terminal NW
// distribution. Reported per scenario as a "sequence risk band".

export function sequenceRiskMetric(terminalSamples: number[]): {
  mean: number;
  stddev: number;
  cv: number;
  p10: number;
  p50: number;
  p90: number;
} {
  if (terminalSamples.length === 0) {
    return { mean: 0, stddev: 0, cv: 0, p10: 0, p50: 0, p90: 0 };
  }
  const n = terminalSamples.length;
  const sorted = [...terminalSamples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / n;
  const stddev = Math.sqrt(variance);
  const cv = Math.abs(mean) > 0 ? stddev / Math.abs(mean) : 0;
  const pick = (q: number) => sorted[Math.max(0, Math.min(n - 1, Math.floor(q * n)))];
  return { mean, stddev, cv, p10: pick(0.10), p50: pick(0.50), p90: pick(0.90) };
}
