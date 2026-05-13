/**
 * Scenario Engine V2 — Risk Metrics
 *
 * Real, defensible advisor-grade risk metrics derived from the MC output
 * and median final state. Nothing here is a composite "score out of 100" —
 * every number has units and a direct interpretation.
 *
 *   • volatility:        std-dev of terminal NW / median terminal NW   (CV)
 *   • downsideRisk:      P50 − P10 as a fraction of P50                (drawdown %)
 *   • leverageRisk:      total loan / total property value             (portfolio LVR)
 *   • liquidityRisk:     1 − (P10 cash / months of expenses ÷ 6 mo)    (cash-runway shortfall, clamped 0..1)
 *   • concentrationRisk: max(asset class / NW) across cash/etf/crypto/property/super
 *   • riskAdjustedNw:    median terminal NW × (1 − downsideRisk)
 *
 * The page surfaces these as labelled bars + tooltips, not as a single
 * black-box score. A risk-adjusted NW comparison is provided as a *single*
 * derived field for ranking.
 */

import type { PortfolioState } from "./types";

export interface RiskMetrics {
  /** Coefficient of variation of terminal NW (std-dev / |median|). */
  volatility: number;
  /** P50 − P10 as a fraction of P50. Positive = downside dispersion. */
  downsideRisk: number;
  /** Portfolio LVR on median final state. */
  leverageRisk: number;
  /** Cash-runway shortfall (1 = zero buffer, 0 = ≥6 months at expenses). */
  liquidityRisk: number;
  /** Max single-asset-class share of NW (0..1). */
  concentrationRisk: number;
  /** Median terminal NW penalised by downside dispersion. */
  riskAdjustedNw: number;
  /**
   * Value-at-Risk at α = 5%, expressed as a DOLLAR LOSS relative to the
   * initial net worth (positive = loss). Computed as `initialNw − P5(NW_T)`,
   * floored at 0 — i.e. only reports if the 5th percentile NW path ends below
   * the starting NW. Auditable, not a risk score.
   */
  varDollars95: number;
  /**
   * Conditional VaR (Expected Shortfall) at α = 5%. Mean dollar loss versus
   * initial NW conditional on being in the worst 5% of terminal outcomes.
   * Floored at 0. Always ≥ VaR. The institutional left-tail metric.
   */
  cvarDollars95: number;
  /**
   * Median per-sim peak-to-trough drawdown on the NW path (0..1). Computed
   * inside Monte Carlo, NOT from terminals — captures intra-horizon stress.
   */
  maxDrawdownMedian: number;
  /** 90th-percentile drawdown (a bad path's drawdown). */
  maxDrawdownP90: number;
  /** Rationale strings — same UX pattern as serviceability rationale. */
  rationale: string[];
}

export interface RiskInput {
  terminalNw: number[];
  terminalCash: number[];
  medianFinalState: PortfolioState;
  medianTerminalNw: number;
  /** Monthly living expenses on the median path (for runway calc). */
  monthlyExpenses: number;
  /** Initial NW at the start of the horizon (anchor for VaR/CVaR dollars). */
  initialNetWorth: number;
  /** Per-sim peak-to-trough drawdown samples (0..1). */
  maxDrawdownSamples: number[];
}

export function computeRiskMetrics(input: RiskInput): RiskMetrics {
  const { terminalNw, terminalCash, medianFinalState, medianTerminalNw, monthlyExpenses } = input;
  const sorted = [...terminalNw].sort((a, b) => a - b);
  const p10 = percentile(sorted, 0.10);
  const p50 = percentile(sorted, 0.50);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance =
    sorted.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);
  const volatility = Math.abs(p50) > 0 ? stdDev / Math.abs(p50) : 0;
  const downsideRisk = p50 > 0 ? Math.max(0, (p50 - p10) / p50) : 0;

  // Leverage: portfolio LVR on median final state
  const totalPropertyValue = medianFinalState.properties.reduce((a, p) => a + p.marketValue, 0);
  const totalLoan = medianFinalState.properties.reduce((a, p) => a + p.loanBalance, 0);
  const leverageRisk = totalPropertyValue > 0 ? totalLoan / totalPropertyValue : 0;

  // Liquidity: P10 cash vs 6-month buffer
  const cashSorted = [...terminalCash].sort((a, b) => a - b);
  const p10Cash = percentile(cashSorted, 0.10);
  const sixMoBuffer = Math.max(1, monthlyExpenses * 6);
  const liquidityRisk = Math.max(0, Math.min(1, 1 - p10Cash / sixMoBuffer));

  // Concentration: largest asset class share of NW
  const propsNet = medianFinalState.properties.reduce(
    (a, p) => a + (p.marketValue - p.loanBalance),
    0,
  );
  const nw =
    medianFinalState.cash +
    medianFinalState.etfBalance +
    medianFinalState.cryptoBalance +
    medianFinalState.superRoham +
    medianFinalState.superFara +
    propsNet;
  const shares = nw > 0
    ? [
        medianFinalState.cash / nw,
        medianFinalState.etfBalance / nw,
        medianFinalState.cryptoBalance / nw,
        (medianFinalState.superRoham + medianFinalState.superFara) / nw,
        propsNet / nw,
      ]
    : [0, 0, 0, 0, 0];
  const concentrationRisk = Math.max(...shares, 0);

  const riskAdjustedNw = medianTerminalNw * (1 - downsideRisk);

  // ── Tail risk (VaR / CVaR, α = 5%) ─────────────────────────────────────
  // VaR = initial NW − P5(NW_T), floored at 0. Reports only true loss.
  // CVaR = mean of the worst 5% of terminal NWs, again versus initial NW.
  // Both expressed in DOLLARS (institutional convention).
  const p5 = pctI(sorted, 0.05);
  const varDollars95 = Math.max(0, input.initialNetWorth - p5);

  const cutoffIdx = Math.max(1, Math.floor(0.05 * sorted.length));
  const worstTail = sorted.slice(0, cutoffIdx);
  const tailMean = worstTail.reduce((a, b) => a + b, 0) / worstTail.length;
  const cvarDollars95 = Math.max(0, input.initialNetWorth - tailMean);

  // ── Max drawdown (per-sim peak-to-trough on NW path) ───────────────────
  const dd = [...input.maxDrawdownSamples].sort((a, b) => a - b);
  const maxDrawdownMedian = dd.length > 0 ? pctI(dd, 0.50) : 0;
  const maxDrawdownP90    = dd.length > 0 ? pctI(dd, 0.90) : 0;

  const rationale: string[] = [];
  rationale.push(
    `Volatility (CV) ${(volatility * 100).toFixed(1)}% — ${volatility < 0.20 ? "low" : volatility < 0.40 ? "moderate" : "high"} dispersion of terminal NW`,
  );
  rationale.push(
    `Downside (P10 vs P50) ${(downsideRisk * 100).toFixed(1)}% — ${downsideRisk < 0.20 ? "shallow drawdown" : downsideRisk < 0.35 ? "meaningful drawdown" : "severe drawdown in bad paths"}`,
  );
  rationale.push(
    `Leverage (portfolio LVR) ${(leverageRisk * 100).toFixed(1)}% — ${leverageRisk < 0.50 ? "conservative" : leverageRisk < 0.75 ? "moderate" : "highly leveraged"}`,
  );
  rationale.push(
    `Liquidity shortfall ${(liquidityRisk * 100).toFixed(1)}% — P10 cash ${liquidityRisk < 0.25 ? "covers 6mo buffer comfortably" : liquidityRisk < 0.6 ? "below 6mo buffer in bad paths" : "thin liquidity in bad paths"}`,
  );
  rationale.push(
    `Concentration ${(concentrationRisk * 100).toFixed(1)}% — ${concentrationRisk < 0.5 ? "well diversified" : concentrationRisk < 0.7 ? "moderate single-asset weight" : "concentrated in one asset class"}`,
  );
  rationale.push(
    `Risk-adjusted NW ≈ $${Math.round(riskAdjustedNw).toLocaleString()} (P50 × (1 − downside))`,
  );
  if (varDollars95 > 0) {
    rationale.push(
      `VaR₅ ≈ $${Math.round(varDollars95).toLocaleString()} — worst 5% terminal NW ends below initial NW by this amount`,
    );
  }
  if (cvarDollars95 > 0) {
    rationale.push(
      `CVaR₅ ≈ $${Math.round(cvarDollars95).toLocaleString()} — expected shortfall in the worst 5% of paths`,
    );
  }
  rationale.push(
    `Max drawdown median ${(maxDrawdownMedian * 100).toFixed(1)}% (P90 ${(maxDrawdownP90 * 100).toFixed(1)}%) — peak-to-trough on NW path`,
  );

  return {
    volatility,
    downsideRisk,
    leverageRisk,
    liquidityRisk,
    concentrationRisk,
    riskAdjustedNw,
    varDollars95,
    cvarDollars95,
    maxDrawdownMedian,
    maxDrawdownP90,
    rationale,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  return pctI(sortedAsc, p);
}

/** Linear-interpolated quantile (“type 7”) — matches monteCarlo.ts. */
function pctI(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return sortedAsc[lo];
  const w = h - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}
