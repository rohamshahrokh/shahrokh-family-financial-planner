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

  return {
    volatility,
    downsideRisk,
    leverageRisk,
    liquidityRisk,
    concentrationRisk,
    riskAdjustedNw,
    rationale,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.max(
    0,
    Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length)),
  );
  return sortedAsc[idx];
}
