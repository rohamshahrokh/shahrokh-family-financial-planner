/**
 * Sprint 17 Phase 17.7 — Reduce leverage at target builder.
 *
 * Fires in STATE_D/E when mortgage > 0. Re-uses reduce_leverage action
 * type with pillar `decumulate_safely`.
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

export function buildReduceLeverageAtTarget(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  const stage = s.lifeStage;
  if (stage !== "STATE_D_FIRE_ACHIEVED" && stage !== "STATE_E_DECUMULATION") {
    return null;
  }
  const mortgage = s.mortgage ?? 0;
  if (mortgage <= 0) return null;
  const annualInterest = mortgage * (s.mortgageRate ?? 0.06);

  return {
    id: "reduce_leverage_at_target",
    title: `Discharge mortgage (${fmt(mortgage)}) — enter retirement debt-free`,
    actionType: "reduce_leverage",
    pillar: "decumulate_safely",
    priorityRank: 0,
    confidenceScore: 0.8,
    urgency: stage === "STATE_E_DECUMULATION" ? "this_quarter" : "this_year",
    riskLevel: "Low",
    expectedFinancialImpact: {
      annualDollar: annualInterest,
      label: `${fmt(annualInterest)}/yr interest avoided`,
      confidence: 0.85,
    },
    netWorthImpact: { horizonYears: 10, delta: annualInterest * 10 },
    implementationSteps: [
      { step: "Project shortfall after lump-sum payoff to confirm liquidity buffer remains" },
      { step: "Stage payoff across two tax years if downsizing CGT applies" },
      { step: "Close offset balance into mortgage at settlement" },
    ],
    whatCouldChangeRecommendation: [
      "Major income shock during transition",
      "Refinance opportunity at < 4%",
    ],
    alternativeOptions: [
      {
        title: "Keep mortgage and invest cash",
        whyAlternative: "If expected return on liquid assets > mortgage rate post-tax",
        tradeoff: "Sequence-of-returns risk: mortgage payments are fixed but income may be variable",
      },
    ],
    reviewTrigger: { condition: "Re-evaluate at refinance or downsize event", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "debt", "action_centre"],
    reasoning: `In ${stage}, fixed mortgage payments collide with variable retirement income. Paying down ${fmt(mortgage)} eliminates an ~${fmt(annualInterest)}/yr fixed expense and removes the leverage that magnifies drawdown.`,
    benefitLabel: "Debt-free retirement",
  };
}
