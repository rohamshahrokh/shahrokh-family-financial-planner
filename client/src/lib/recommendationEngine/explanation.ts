/**
 * Sprint 17 Phase 17.6 — Explanation layer (user §9).
 *
 * Every recommendation gets a structured plain-English explanation with:
 *   - plain English
 *   - why this beats alternatives
 *   - expected impact
 *   - risk warning
 *   - confidence explanation
 *   - source engines used
 *   - do-nothing comparison
 *   - assumptions
 *
 * Pure function over a fully-populated Recommendation. The Recommendation
 * must have marginalImpact and calibratedConfidence already attached for
 * the explanation to be rich; the function still degrades gracefully if
 * those are missing.
 */

import type { Recommendation, UnifiedSignals } from "./types";
import type { RecommendationContext } from "../recommendationContext/types";

function fmt$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtMonths(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "no measurable change to FIRE date";
  const abs = Math.abs(m);
  const direction = m < 0 ? "sooner" : "later";
  if (abs < 1) return "negligible change to FIRE date";
  if (abs >= 24) return `${(abs / 12).toFixed(1)} years ${direction}`;
  return `${Math.round(abs)} months ${direction}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}pp`;
}

export interface RecommendationExplanation {
  plainEnglish: string;
  whyBeatsAlternatives: string;
  expectedImpact: string;
  riskWarning: string;
  confidenceExplanation: string;
  sourceEnginesUsed: string[];
  doNothingComparison: string;
  assumptions: string[];
}

export function buildExplanation(
  rec: Recommendation,
  s: UnifiedSignals,
  ctx?: RecommendationContext,
): RecommendationExplanation {
  const mi = rec.marginalImpact;
  const cc = rec.calibratedConfidence;
  const feasibility = ctx?.forecast?.feasibility ?? "TIGHT";

  const plainEnglish =
    rec.reasoning ||
    `${rec.title} — pillar ${rec.pillar.replace(/_/g, " ")}, ${rec.urgency.replace(/_/g, " ")}.`;

  const whyBeatsAlternatives = rec.alternativeOptions.length > 0
    ? `Beats alternatives by qualityScore=${(rec.qualityScore ?? 0).toFixed(0)}: ${rec.alternativeOptions
        .map((a) => `(${a.title}: ${a.tradeoff})`)
        .join("; ")}`
    : `Top option for its pillar (${rec.pillar}) at this household state.`;

  const expectedImpactParts: string[] = [];
  if (mi?.deltaFireDateMonths != null) {
    expectedImpactParts.push(`FIRE date: ${fmtMonths(mi.deltaFireDateMonths)}`);
  }
  if (mi?.deltaSuccessProbability != null) {
    const sign = mi.deltaSuccessProbability >= 0 ? "+" : "";
    expectedImpactParts.push(
      `Success probability: ${sign}${fmtPct(mi.deltaSuccessProbability)}`,
    );
  }
  if (mi?.deltaNetWorthAtTargetAge != null) {
    expectedImpactParts.push(
      `NW at target age: ${mi.deltaNetWorthAtTargetAge >= 0 ? "+" : "-"}${fmt$(Math.abs(mi.deltaNetWorthAtTargetAge))}`,
    );
  }
  if (mi?.deltaPassiveAnnualIncome != null) {
    expectedImpactParts.push(
      `Passive income: ${mi.deltaPassiveAnnualIncome >= 0 ? "+" : "-"}${fmt$(Math.abs(mi.deltaPassiveAnnualIncome))}/yr`,
    );
  }
  if (expectedImpactParts.length === 0 && rec.expectedFinancialImpact?.annualDollar) {
    expectedImpactParts.push(
      `~${fmt$(rec.expectedFinancialImpact.annualDollar)}/yr ${
        rec.expectedFinancialImpact.annualDollar >= 0 ? "benefit" : "cost"
      }`,
    );
  }
  const expectedImpact = expectedImpactParts.join(" · ") || "No quantified impact available";

  const riskNotes: string[] = [];
  riskNotes.push(`Risk level: ${rec.riskLevel}`);
  if (mi?.deltaLiquidityRisk && mi.deltaLiquidityRisk > 0) {
    riskNotes.push("Locks up liquidity");
  }
  if (mi?.deltaDebtStress && mi.deltaDebtStress > 0) {
    riskNotes.push("Increases debt stress");
  }
  const concentrations = s.concentrationFlags ?? [];
  if (concentrations.some((f) => f.severity === "critical")) {
    riskNotes.push("Critical portfolio concentration is present elsewhere");
  }
  const riskWarning = riskNotes.join("; ");

  const confidenceExplanation = cc
    ? `${cc.displayLabel} — ${cc.rationale}`
    : `Source: ${rec.confidenceScore.toFixed(2)} (legacy confidenceScore)`;

  const sourceEnginesUsed = Array.from(new Set([
    ...rec.sourceSignalsUsed.map((s) => String(s)),
    "recommendation_context",
    "marginal_impact",
  ]));

  const doNothingParts: string[] = [];
  if (ctx?.forecast?.fireDateBaseline) {
    doNothingParts.push(`Baseline FIRE date: ${ctx.forecast.fireDateBaseline}`);
  }
  doNothingParts.push(
    `Baseline success probability: ${(ctx?.forecast?.fireSuccessProbabilityBaseline ?? 0).toFixed(2)}`,
  );
  doNothingParts.push(`Feasibility: ${feasibility}`);
  if (ctx?.forecast?.unreachableReason) {
    doNothingParts.push(ctx.forecast.unreachableReason);
  }
  const doNothingComparison = doNothingParts.join(" · ");

  const assumptions = [
    "Real return assumption: 5% p.a.",
    "Inflation: 2.5% p.a.",
    "SWR: 4% (or user override)",
    `Horizon: ${ctx?.meta?.horizonYears ?? 25} years`,
  ];
  if (mi?.derivation) assumptions.push(`Impact derivation: ${mi.derivation}`);

  return {
    plainEnglish,
    whyBeatsAlternatives,
    expectedImpact,
    riskWarning,
    confidenceExplanation,
    sourceEnginesUsed,
    doNothingComparison,
    assumptions,
  };
}
