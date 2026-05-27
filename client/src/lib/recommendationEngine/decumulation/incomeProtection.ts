/**
 * Sprint 17 Phase 17.7 — Income protection builder.
 *
 * Fires for any state when household is single-income with dependents
 * (Sprint 16 #10).
 */

import type { Recommendation, UnifiedSignals, SourceSignal } from "../types";

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function buildIncomeProtection(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  const ctx: any = (s as any).recommendationContext;
  if (!ctx?.today?.householdProfile) return null;
  const hp = ctx.today.householdProfile;
  if (!hp.singleIncome || !hp.hasDependents) return null;

  return {
    id: "income_protection",
    title: "Take out income protection insurance",
    actionType: "income_protection",
    pillar: "protect_liquidity",
    priorityRank: 0,
    confidenceScore: 0.85,
    urgency: "this_quarter",
    riskLevel: "Low",
    expectedFinancialImpact: {
      annualDollar: 0,
      label: "Insures against catastrophic income shock",
      confidence: 0.85,
    },
    riskReductionImpact: { points: 25, categoriesAffected: ["catastrophic_loss"] },
    implementationSteps: [
      { step: "Compare 3+ quotes (60–75% replacement, 90-day waiting period)" },
      { step: "Confirm super-fund cover is not double-counted" },
      { step: "Re-evaluate cover when dependants reach independence" },
    ],
    whatCouldChangeRecommendation: [
      "Spouse returns to work full-time",
      "Dependants become independent",
      "Material increase in passive income",
    ],
    alternativeOptions: [
      {
        title: "Self-insure via emergency buffer",
        whyAlternative: "Avoids ongoing premium cost",
        tradeoff: "Buffer rarely covers a multi-year disability event",
      },
    ],
    reviewTrigger: { condition: "Annual review", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "action_centre", "risk"],
    reasoning: "Single-income household with dependants — income loss is the single largest unhedged risk. Income protection converts a catastrophic tail event into a manageable annual premium.",
    benefitLabel: "Dependant income safety net",
  };
}
