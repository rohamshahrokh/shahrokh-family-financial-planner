/**
 * optimizer.ts — Phase G: Allocation Optimizer
 *
 * Produces *recommendations*, not just simulation outputs. Each
 * recommendation is structured: action, rationale, expected benefit, risk
 * tradeoff, and confidence level. Recommendations are derived from the
 * advanced risk metrics + portfolio composition, not from a black-box
 * optimisation — this keeps them auditable and explainable.
 */

import type { AdvancedRiskMetrics } from "./risk";

export type OptimizerActionId =
  | "reduce_leverage"
  | "increase_liquidity"
  | "delay_property_purchase"
  | "reduce_crypto_exposure"
  | "increase_super_concessional"
  | "improve_diversification"
  | "build_offset_buffer"
  | "fix_mortgage_portion"
  | "increase_dca"
  | "rebalance_to_defensive";

export interface OptimizerRecommendation {
  action: OptimizerActionId;
  title: string;
  rationale: string;
  expectedBenefit: string;
  riskTradeoff: string;
  confidence: "low" | "moderate" | "high";
  priority: number; // 1 = highest
}

export interface OptimizerSnapshot {
  cryptoWeight: number;          // 0-1
  stockWeight: number;           // 0-1
  cashWeight: number;            // 0-1
  debtToAssets: number;          // 0-1
  monthlySurplus: number;        // AUD
  cashBalance: number;           // AUD
  emergencyBufferTarget: number; // AUD
  hasPlannedPropertyPurchase: boolean;
  superBalance: number;          // AUD
}

export function recommendAllocationActions(
  metrics: AdvancedRiskMetrics,
  snap: OptimizerSnapshot,
): OptimizerRecommendation[] {
  const recs: OptimizerRecommendation[] = [];

  if (metrics.refinanceFailureProb > 15 || snap.debtToAssets > 0.55) {
    recs.push({
      action: "reduce_leverage",
      title: "Reduce leverage exposure",
      rationale: `Refinance failure probability is ${metrics.refinanceFailureProb}% and debt-to-assets is ${(snap.debtToAssets * 100).toFixed(0)}%. Under tightening regimes serviceability compresses meaningfully.`,
      expectedBenefit: "Cuts refinance failure probability by ~30–50% and reduces P10 drawdown.",
      riskTradeoff: "Slower wealth compounding in benign regimes (gives up some upside).",
      confidence: "high",
      priority: 1,
    });
  }
  if (metrics.liquidityExhaustionProb > 10 || snap.cashBalance < snap.emergencyBufferTarget) {
    recs.push({
      action: "increase_liquidity",
      title: "Build cash buffer above emergency threshold",
      rationale: `Liquidity exhaustion probability is ${metrics.liquidityExhaustionProb}% and current cash sits ${snap.cashBalance < snap.emergencyBufferTarget ? "below" : "near"} the emergency buffer.`,
      expectedBenefit: "Eliminates forced-sale risk during drawdowns; protects FIRE timeline.",
      riskTradeoff: "Lower expected long-run return on cash holdings.",
      confidence: "high",
      priority: 1,
    });
  }
  if (snap.hasPlannedPropertyPurchase && (metrics.refinanceFailureProb > 20 || metrics.debtStressScore > 0.4)) {
    recs.push({
      action: "delay_property_purchase",
      title: "Delay next property purchase by 12–24 months",
      rationale: `Stress score ${metrics.debtStressScore.toFixed(2)} and refinance risk ${metrics.refinanceFailureProb}% are elevated — taking on more debt amplifies fragility.`,
      expectedBenefit: "Reduces insolvency probability and frees deposit capital for offset buffer.",
      riskTradeoff: "Foregoes potential capital growth in the delay window.",
      confidence: "moderate",
      priority: 2,
    });
  }
  if (snap.cryptoWeight > 0.20) {
    recs.push({
      action: "reduce_crypto_exposure",
      title: "Trim crypto allocation",
      rationale: `Crypto weight is ${(snap.cryptoWeight * 100).toFixed(0)}% — concentration drives most of P10 downside.`,
      expectedBenefit: "Tightens outcome spread (P90/P10) and reduces CVaR.",
      riskTradeoff: "Caps upside in risk-on mania regimes.",
      confidence: "moderate",
      priority: 2,
    });
  }
  if (snap.superBalance < 600_000 && snap.monthlySurplus > 1_000) {
    recs.push({
      action: "increase_super_concessional",
      title: "Increase concessional super contributions",
      rationale: "Concessional super carries the highest after-tax compounding and is recession-resilient.",
      expectedBenefit: "Adds an estimated ~$200–400/mo in long-run compounding per $1k extra/mo.",
      riskTradeoff: "Funds locked until preservation age.",
      confidence: "high",
      priority: 3,
    });
  }
  if (snap.stockWeight > 0.5 && snap.cryptoWeight > 0.1) {
    recs.push({
      action: "improve_diversification",
      title: "Broaden diversification across asset classes",
      rationale: "Risk-asset concentration > 60% — drawdowns from any single class dominate outcomes.",
      expectedBenefit: "Reduces SoR (sequence-of-return) risk by ~15–25%.",
      riskTradeoff: "Slightly lower expected return if equity bull regime persists.",
      confidence: "moderate",
      priority: 3,
    });
  }
  if (snap.cashBalance < snap.emergencyBufferTarget * 2 && snap.debtToAssets > 0.35) {
    recs.push({
      action: "build_offset_buffer",
      title: "Channel surplus into mortgage offset",
      rationale: "Offset balance reduces interest payments AND raises liquidity reserves simultaneously.",
      expectedBenefit: "Effective ~5–6% tax-free return AND functions as an emergency buffer.",
      riskTradeoff: "Capital tied to the property — slower to redeploy into equities.",
      confidence: "high",
      priority: 2,
    });
  }
  if (metrics.debtSpiralProb > 5) {
    recs.push({
      action: "fix_mortgage_portion",
      title: "Fix 30–50% of mortgage for 2–3 years",
      rationale: `Debt-spiral probability is ${metrics.debtSpiralProb}% — partial fixing caps the worst-case repayment shock.`,
      expectedBenefit: "Reduces tail-risk on repayments by ~40% during rate shocks.",
      riskTradeoff: "Loses flexibility if rates cut; may pay slightly more on average.",
      confidence: "moderate",
      priority: 2,
    });
  }
  if (snap.monthlySurplus > 2_000 && metrics.insolvencyProb < 5) {
    recs.push({
      action: "increase_dca",
      title: "Increase systematic DCA",
      rationale: "Strong surplus with low insolvency risk — compounding is the dominant lever.",
      expectedBenefit: "Each $500/mo of additional DCA adds ~$80–120k to median 2035 NW.",
      riskTradeoff: "Less cash flexibility for opportunistic moves.",
      confidence: "moderate",
      priority: 4,
    });
  }
  return recs.sort((a, b) => a.priority - b.priority);
}
