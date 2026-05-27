/**
 * Sprint 17 Phase 17.7 — Increase cash reserve builder.
 *
 * Fires in STATE_D/E when cash < 24 months of expenses.
 */

import type { Recommendation, UnifiedSignals, SourceSignal } from "../types";

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function buildIncreaseCashReserve(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  const stage = s.lifeStage;
  if (stage !== "STATE_D_FIRE_ACHIEVED" && stage !== "STATE_E_DECUMULATION") {
    return null;
  }
  const cash = (s.cashOutsideOffset ?? 0) + (s.offsetBalance ?? 0);
  const monthlyExpenses = s.monthlyExpenses ?? 0;
  if (monthlyExpenses <= 0) return null;
  const months = cash / monthlyExpenses;
  if (months >= 24) return null;
  const target = monthlyExpenses * 24;
  const shortfall = target - cash;

  return {
    id: "increase_cash_reserve",
    title: `Build retirement cash reserve to 24 months (${fmt(target)})`,
    actionType: "increase_cash_reserve",
    pillar: "decumulate_safely",
    priorityRank: 0,
    confidenceScore: 0.8,
    urgency: stage === "STATE_E_DECUMULATION" ? "this_quarter" : "this_year",
    riskLevel: "Low",
    expectedFinancialImpact: {
      annualDollar: shortfall * 0.05,
      label: `${fmt(shortfall * 0.05)}/yr forgone growth avoided`,
      confidence: 0.85,
    },
    liquidityImpact: { deltaDeployableCash: shortfall, deltaRunwayMonths: 24 - months },
    riskReductionImpact: { points: 22, categoriesAffected: ["sequence_risk", "liquidity"] },
    implementationSteps: [
      { step: `Hold ${fmt(target)} (24 months of expenses) in HISA / offset` },
      { step: "Top up from drawdown when balance falls below 18 months" },
      { step: "Avoid selling growth assets in market drawdowns — let the cash buffer absorb" },
    ],
    whatCouldChangeRecommendation: [
      "Material change in expenses",
      "Annuity or guaranteed-income product taken on",
    ],
    alternativeOptions: [
      {
        title: "Smaller 12-month reserve",
        whyAlternative: "More capital remains invested for growth",
        tradeoff: "Less buffer against early-retirement market drawdown",
      },
    ],
    reviewTrigger: { condition: "Quarterly review", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "action_centre"],
    reasoning: `Currently ${months.toFixed(1)} months of cash; ${stage} requires ≥ 24 months to insulate against early-retirement sequence-of-returns risk. Shortfall is ${fmt(shortfall)}.`,
    benefitLabel: "Sequence risk buffer",
  };
}
