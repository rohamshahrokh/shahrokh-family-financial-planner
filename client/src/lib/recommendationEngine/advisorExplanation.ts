/**
 * Sprint 18 Phase 18.5 — Advisor explanation (11 fields).
 *
 * Replaces Sprint 17's 8-field explanation as the primary surface; the old
 * one remains as fallback for backwards-compat.
 *
 * The 11 fields (user §5 verbatim):
 *   1.  recommendedAction
 *   2.  whyThisAction
 *   3.  whyNotAlternatives
 *   4.  baselineComparison
 *   5.  expectedImprovement
 *   6.  feasibilityStatus
 *   7.  keyRisk
 *   8.  stressTestResult
 *   9.  behaviouralNote
 *   10. confidenceExplanation
 *   11. nextPracticalStep
 *
 * Plain English, no jargon. The explanation reads as if written by a
 * human advisor, not a system.
 */

import type { Recommendation } from "./types";
import type { RecommendationContext } from "../recommendationContext/types";

function fmt$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtMonths(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "no measurable change";
  const abs = Math.abs(m);
  if (abs < 1) return "negligible change";
  const direction = m < 0 ? "sooner" : "later";
  if (abs >= 24) return `${(abs / 12).toFixed(1)} years ${direction}`;
  return `${Math.round(abs)} months ${direction}`;
}

function fmtPp(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)} percentage points`;
}

export function buildAdvisorExplanation(
  rec: Recommendation,
  ctx: RecommendationContext | undefined,
): NonNullable<Recommendation["advisorExplanation"]> {
  const mi = rec.marginalImpact;
  const feas = rec.feasibility;
  const beh = rec.behaviouralRisk;
  const stress = rec.stressTest;
  const cc = rec.calibratedConfidence;
  const baseline = ctx?.forecast;

  const recommendedAction = rec.title || `${rec.actionType.replace(/_/g, " ")}`;

  const whyThisAction = (() => {
    const reasons: string[] = [];
    if (rec.pillar) reasons.push(`Pillar: ${rec.pillar.replace(/_/g, " ")}`);
    if (mi?.deltaFireDateMonths != null && mi.deltaFireDateMonths < 0) {
      reasons.push(`brings FIRE date ${fmtMonths(mi.deltaFireDateMonths)}`);
    }
    if (mi?.deltaSuccessProbability != null && mi.deltaSuccessProbability > 0) {
      reasons.push(`lifts plan-success probability by ${fmtPp(mi.deltaSuccessProbability)}`);
    }
    if (rec.reasoning) reasons.push(rec.reasoning);
    return reasons.join("; ") || "Top-ranked option for this household state.";
  })();

  const whyNotAlternatives = rec.alternativeOptions?.length > 0
    ? `Beats alternatives — ${rec.alternativeOptions
        .map((a) => `${a.title}: ${a.tradeoff}`)
        .join("; ")}.`
    : "No close alternative scored higher on the same pillar.";

  const baselineComparison = baseline
    ? `Do-nothing baseline: feasibility ${baseline.feasibility}, success probability ${(baseline.fireSuccessProbabilityBaseline * 100).toFixed(0)}%, FIRE date ${baseline.fireDateBaseline ?? "unreachable in horizon"}.`
    : "Do-nothing baseline not available for this run.";

  const expectedImprovement = (() => {
    const parts: string[] = [];
    if (mi?.deltaFireDateMonths != null) parts.push(`FIRE: ${fmtMonths(mi.deltaFireDateMonths)}`);
    if (mi?.deltaSuccessProbability != null) parts.push(`success Δ ${fmtPp(mi.deltaSuccessProbability)}`);
    if (mi?.deltaNetWorthAtTargetAge != null) parts.push(`net worth Δ ${fmt$(mi.deltaNetWorthAtTargetAge)}`);
    if (mi?.deltaPassiveAnnualIncome != null) parts.push(`passive income Δ ${fmt$(mi.deltaPassiveAnnualIncome)}/yr`);
    if (parts.length === 0 && rec.expectedFinancialImpact?.annualDollar) {
      parts.push(`approx ${fmt$(rec.expectedFinancialImpact.annualDollar)}/yr value`);
    }
    return parts.length > 0 ? parts.join(" · ") : "No quantified improvement available.";
  })();

  const feasibilityStatus = feas
    ? feas.summary
    : "Feasibility check skipped for this recommendation type.";

  const keyRisk = (() => {
    const riskBits: string[] = [];
    riskBits.push(`Risk level: ${rec.riskLevel}.`);
    if (beh?.behaviourWarnings && beh.behaviourWarnings.length > 0) {
      riskBits.push(beh.behaviourWarnings[0].message);
    }
    if (feas?.blockers && feas.blockers.length > 0) {
      riskBits.push(`Constraint: ${feas.blockers[0].reason}`);
    }
    return riskBits.join(" ");
  })();

  const stressTestResult = stress
    ? `Stress test: survives ${stress.scenariosSurvived} of ${stress.scenariosTested} scenarios.${
        stress.primaryWeakness ? ` Main weakness is ${stress.primaryWeakness.replace(/_/g, " ")}.` : ""
      }`
    : "Stress test not yet run for this recommendation.";

  const behaviouralNote = beh?.note ?? "Behavioural assessment not available.";

  const confidenceExplanation = cc
    ? `${cc.displayLabel}. ${cc.rationale}`
    : `Confidence ${rec.confidenceScore?.toFixed(2) ?? "—"} (legacy).`;

  const nextPracticalStep = (() => {
    if (rec.implementationSteps && rec.implementationSteps.length > 0) {
      const step = rec.implementationSteps[0];
      return `Next step: ${step.step}${step.detail ? ` — ${step.detail}` : ""}.`;
    }
    if (feas?.estimatedMonthsUntilFeasible != null && feas.estimatedMonthsUntilFeasible > 0) {
      return `Next step: save toward feasibility — estimated ${feas.estimatedMonthsUntilFeasible} months at current surplus.`;
    }
    if (feas?.requiredConditions && feas.requiredConditions.length > 0) {
      return `Next step: ${feas.requiredConditions[0]}`;
    }
    return "Next step: book a quarterly review and re-run the engine after material change.";
  })();

  return {
    recommendedAction,
    whyThisAction,
    whyNotAlternatives,
    baselineComparison,
    expectedImprovement,
    feasibilityStatus,
    keyRisk,
    stressTestResult,
    behaviouralNote,
    confidenceExplanation,
    nextPracticalStep,
  };
}
