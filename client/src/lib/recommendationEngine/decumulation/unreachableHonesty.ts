/**
 * Sprint 17 Phase 17.7 — Unreachable plan honesty builder.
 *
 * Fires when forecast.feasibility === "UNREACHABLE". Uses the
 * prevent_failure pillar (rank 1) — currently has zero emitters; this
 * fills that empty top tier.
 *
 * The user has been explicit: do NOT hide unreachable plans with wording
 * tricks. Show the verdict, explain why, and offer concrete next moves.
 */

import type { Recommendation, UnifiedSignals, SourceSignal } from "../types";

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function buildUnreachableHonesty(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  if (s.feasibility !== "UNREACHABLE") return null;
  const ctx: any = (s as any).recommendationContext;
  const reason = ctx?.forecast?.unreachableReason || "The current plan is not reachable within the projected horizon.";
  const monthlySurplus = ctx?.today?.cashflow?.monthlySurplus ?? 0;
  const passiveTarget = ctx?.plan?.targetPassiveMonthly ?? 0;

  return {
    id: "unreachable_plan_review",
    title: "Plan is currently unreachable — recalibrate target",
    actionType: "unreachable_plan_review",
    pillar: "prevent_failure",
    priorityRank: 0,
    confidenceScore: 0.9,
    urgency: "immediate",
    riskLevel: "High",
    expectedFinancialImpact: {
      annualDollar: 0,
      label: "Plan recalibration required",
      confidence: 0.9,
    },
    riskReductionImpact: { points: 30, categoriesAffected: ["plan_failure"] },
    implementationSteps: [
      { step: `Lower target passive monthly income from $${passiveTarget.toLocaleString()} OR extend target age by 5–10 years` },
      { step: monthlySurplus <= 0 ? "Find $500–$1,000/mo of spending reductions before any investment changes" : "Re-evaluate after the spending review" },
      { step: "Stress test the revised plan with conservative (3.5%) SWR" },
    ],
    whatCouldChangeRecommendation: [
      "Material increase in income",
      "Inheritance / lump-sum",
      "Material reduction in target lifestyle",
    ],
    alternativeOptions: [
      {
        title: "Keep current target",
        whyAlternative: "If you're willing to work longer or accept a lower withdrawal rate",
        tradeoff: "Without recalibration, the projected plan has < 10% success probability",
      },
    ],
    reviewTrigger: { condition: "Re-run after income / expense / target change", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "action_centre", "fire", "risk"],
    reasoning: `Plan is structurally unreachable. ${reason} The honest move is to recalibrate the target before optimising for FIRE timing — optimising an unreachable plan compounds risk.`,
    benefitLabel: "Honest plan review",
  };
}
