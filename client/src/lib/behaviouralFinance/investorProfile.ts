/**
 * Sprint 18 Phase 18.3 — Investor profile.
 *
 * Derives a behavioural profile from RecommendationContext signals.
 * No new data inputs — re-uses ledger snapshot, life stage, and plan slice.
 */

import type { RecommendationContext } from "../recommendationContext/types";
import type { InvestorProfile } from "./behaviouralTypes";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function deriveInvestorProfile(ctx: RecommendationContext): InvestorProfile {
  const t = ctx.today;
  const plan = ctx.plan;
  const cashPct = t.netWorth.total > 0 ? t.netWorth.cash / t.netWorth.total : 0.5;
  const cryptoPct = t.netWorth.total > 0 ? t.netWorth.crypto / t.netWorth.total : 0;
  const propertyPct = t.netWorth.total > 0 ? t.netWorth.propertyEquity / t.netWorth.total : 0;
  const debtRatio = t.netWorth.total > 0
    ? t.netWorth.debt / Math.max(1, t.netWorth.total + t.netWorth.debt)
    : 0;

  const riskTolerance = plan.riskPreference ?? clamp(cryptoPct * 2 - 0.3, -1, 1);
  const liquidityPreference = clamp(cashPct * 2, 0, 1);
  const fireUrgency = plan.targetFireAge != null && t.age != null
    ? clamp((10 - (plan.targetFireAge - t.age)) / 10, 0, 1)
    : 0.5;
  const cryptoBias = clamp(cryptoPct * 3, 0, 1);
  const propertyBias = clamp(propertyPct * 1.5, 0, 1);
  const debtAversion = clamp(0.5 + (0.3 - debtRatio) * 1.5, 0, 1);

  return {
    riskTolerance: Number(riskTolerance.toFixed(2)),
    liquidityPreference: Number(liquidityPreference.toFixed(2)),
    fireUrgency: Number(fireUrgency.toFixed(2)),
    cryptoBias: Number(cryptoBias.toFixed(2)),
    propertyBias: Number(propertyBias.toFixed(2)),
    debtAversion: Number(debtAversion.toFixed(2)),
  };
}
