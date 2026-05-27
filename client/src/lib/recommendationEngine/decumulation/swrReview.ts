/**
 * Sprint 17 Phase 17.7 — SWR review builder.
 *
 * Fires in STATE_D/E when withdrawals will start within 5 years.
 */

import type { Recommendation, UnifiedSignals, SourceSignal } from "../types";

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function buildSwrReview(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  const stage = s.lifeStage;
  if (stage !== "STATE_C_NEAR_FIRE" && stage !== "STATE_D_FIRE_ACHIEVED" && stage !== "STATE_E_DECUMULATION") {
    return null;
  }
  const ctx: any = (s as any).recommendationContext;
  const swr = ctx?.plan?.swrPct ?? 0.04;
  const age = ctx?.today?.age ?? 60;
  const targetAge = ctx?.plan?.targetFireAge ?? 65;
  const yearsToDrawdown = Math.max(0, targetAge - age);
  if (yearsToDrawdown > 5 && stage !== "STATE_E_DECUMULATION") return null;

  return {
    id: "swr_review",
    title: `Review safe withdrawal rate (currently ${(swr * 100).toFixed(1)}%)`,
    actionType: "swr_review",
    pillar: "decumulate_safely",
    priorityRank: 0,
    confidenceScore: 0.7,
    urgency: stage === "STATE_E_DECUMULATION" ? "this_quarter" : "this_year",
    riskLevel: "Low",
    expectedFinancialImpact: { annualDollar: 0, label: "Plan sustainability check" },
    implementationSteps: [
      { step: `Run an MC with 4.0%, 3.5%, and 3.0% withdrawal rates over a 30-year horizon` },
      { step: "Compare survival probability at each rate" },
      { step: "Adjust withdrawal floor and consider guardrails (Guyton-Klinger)" },
    ],
    whatCouldChangeRecommendation: [
      "Material market repricing",
      "Inflation regime shift",
      "Longevity assumption change",
    ],
    alternativeOptions: [
      {
        title: "Hold to 4% rule",
        whyAlternative: "Simpler, well-studied benchmark",
        tradeoff: "May be too aggressive for 40+ year horizons",
      },
    ],
    reviewTrigger: { condition: "Annual review at FY end", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "fire", "action_centre"],
    reasoning: `${stage} households should stress-test the withdrawal rate over a 30-year horizon. A 0.5% reduction in SWR (4.0% → 3.5%) often lifts survival probability by 10+ percentage points at long horizons.`,
    benefitLabel: "Plan sustainability",
  };
}
