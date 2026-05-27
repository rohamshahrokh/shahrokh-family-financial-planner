/**
 * Sprint 17 Phase 17.7 — Glidepath shift builder.
 *
 * Fires in STATE_C/D/E when current equity allocation > age-based target.
 * Deterministic: target equity % = 110 - age (Australian rule of thumb),
 * floor 30%, ceiling 80%.
 */

import type { Recommendation, UnifiedSignals, SourceSignal } from "../types";

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function buildGlidepathShift(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  const stage = s.lifeStage;
  if (stage !== "STATE_C_NEAR_FIRE" && stage !== "STATE_D_FIRE_ACHIEVED" && stage !== "STATE_E_DECUMULATION") {
    return null;
  }
  const ctx: any = (s as any).recommendationContext;
  const age = ctx?.today?.age ?? 60;
  const targetEquityPct = Math.max(30, Math.min(80, 110 - age));

  return {
    id: "glidepath_shift",
    title: `Shift to ${targetEquityPct}% equities / ${100 - targetEquityPct}% defensives`,
    actionType: "glidepath_shift",
    pillar: "decumulate_safely",
    priorityRank: 0,
    confidenceScore: 0.75,
    urgency: stage === "STATE_E_DECUMULATION" ? "this_quarter" : "this_year",
    riskLevel: "Low",
    expectedFinancialImpact: {
      annualDollar: 0,
      label: "Reduces sequence-of-returns risk",
      confidence: 0.75,
    },
    riskReductionImpact: { points: 18, categoriesAffected: ["sequence_risk"] },
    implementationSteps: [
      { step: `Rebalance portfolio to ${targetEquityPct}% growth / ${100 - targetEquityPct}% defensive` },
      { step: "Use a 12–18 month glidepath, not a single switch, to smooth taxes" },
      { step: "Reassess on each major life event (age, market regime, plan change)" },
    ],
    whatCouldChangeRecommendation: [
      "Plan rolls forward (target age moves)",
      "Major market drawdown",
      "Inheritance / lump-sum changes the asset base",
    ],
    alternativeOptions: [
      {
        title: "Hold current allocation",
        whyAlternative: "If conviction in equities is high and longevity risk dominant",
        tradeoff: "Sequence-of-returns risk in first 5 years of drawdown is amplified",
      },
    ],
    reviewTrigger: { condition: "Re-check at next portfolio review", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "action_centre", "fire"],
    reasoning: `Household is in ${stage}. At age ${age}, an age-based target of ${targetEquityPct}% equities (rule of thumb 110-age) reduces sequence-of-returns risk during early drawdown without abandoning long-term growth.`,
    benefitLabel: "Smoother retirement income",
  };
}
