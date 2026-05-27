/**
 * Sprint 17 Phase 17.5 — rebalanceConcentration builder.
 *
 * Fires when ≥ 1 critical concentration flag is present. Builds a concrete
 * action ("Reduce X from Y% → Z% over 18 months via DCA-out"). Lives in
 * the rules/ directory to begin the rule-registry split.
 */

import type { Recommendation, UnifiedSignals, SourceSignal } from "../types";

function fmt(n: number): string {
  return Math.round(n).toString();
}

function plus30Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function buildRebalanceConcentration(
  s: UnifiedSignals,
  signals: SourceSignal[],
): Recommendation | null {
  const flags = s.concentrationFlags ?? [];
  if (flags.length === 0) return null;
  // Pick the most severe flag — sort critical first, then by observedPct desc
  const sorted = [...flags].sort((a, b) => {
    const aSev = a.severity === "critical" ? 0 : 1;
    const bSev = b.severity === "critical" ? 0 : 1;
    if (aSev !== bSev) return aSev - bSev;
    return b.observedPct - a.observedPct;
  });
  const top = sorted[0];
  if (top.severity !== "critical") return null;

  const targetPct = Math.max(0, top.thresholdPct - 10);
  const action = `Rebalance — reduce ${top.affectedAssets.join("/")} from ${fmt(top.observedPct)}% to ${fmt(targetPct)}%`;

  const rec: Recommendation = {
    id: "rebalance_concentration",
    title: action,
    actionType: "rebalance_concentration",
    pillar: "stabilise_leverage",
    priorityRank: 0,
    confidenceScore: 0.7,
    urgency: top.severity === "critical" ? "this_quarter" : "this_year",
    riskLevel: "Med",
    expectedFinancialImpact: {
      annualDollar: 0,
      label: `Concentration risk reduction (${top.kind})`,
      confidence: 0.7,
    },
    riskReductionImpact: { points: 20, categoriesAffected: ["portfolio_concentration"] },
    implementationSteps: [
      { step: top.remediation },
      { step: `Set automated DCA-out from ${top.affectedAssets[0]} over 12–18 months` },
      { step: "Recheck concentration ratios quarterly" },
    ],
    whatCouldChangeRecommendation: [
      "Market repricing of the concentrated asset class",
      "Material change in target allocation",
    ],
    alternativeOptions: [
      {
        title: "Hold and monitor",
        whyAlternative: "If conviction is high and risk tolerance accepts drawdown",
        tradeoff: "Sequence-of-returns vulnerability remains elevated",
      },
    ],
    reviewTrigger: { condition: "Recheck on quarterly snapshot refresh", reviewByISO: plus30Days() },
    sourceSignalsUsed: signals,
    surfaces: ["best_move", "action_centre", "risk"],
    reasoning: `Concentration flagged: ${top.kind} at ${fmt(top.observedPct)}% (threshold ${fmt(top.thresholdPct)}%). ${top.remediation}`,
    benefitLabel: "Lower drawdown risk",
  };
  return rec;
}
