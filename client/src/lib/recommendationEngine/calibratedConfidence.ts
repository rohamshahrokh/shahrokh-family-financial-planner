/**
 * Sprint 17 Phase 17.6 — Calibrated confidence.
 *
 * User §7 (hard rule): non-MC confidences MUST NOT be labelled as
 * "probability". They are engine-fit signals. Only MC-supported values may
 * say "probability of success".
 *
 * Formula (weighted geometric mean — geometric so near-zero MC forces low
 * overall confidence even with high coverage):
 *   value = mc^0.5 × coverage^0.2 × certainty^0.2 × stability^0.1
 *
 * Bands:
 *   0–0.4   → LOW
 *   0.4–0.6 → MODERATE
 *   0.6–0.8 → HIGH
 *   0.8–1.0 → VERY_HIGH
 *
 * Display label:
 *   - MC-driven  → "{pct}% probability of success (Monte Carlo)"
 *   - non-MC     → "High engine fit" / "Medium engine fit" / "Low engine fit"
 *
 * Hard cap: confidence MUST NOT exceed (mcSuccessProb + 0.1) when MC is
 * present and survival < 0.5 — this is what makes the 0.38 → 0.92 inversion
 * structurally impossible.
 */

import type { Recommendation, UnifiedSignals } from "./types";
import type { RecommendationContext } from "../recommendationContext/types";

export type ConfidenceBand = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

export interface CalibratedConfidence {
  value: number;
  band: ConfidenceBand;
  components: {
    mcSuccessProb: number | null;
    dataCompleteness: number;
    modelCertainty: number;
    inputStability: number;
  };
  weights: { mc: number; coverage: number; certainty: number; stability: number };
  rationale: string;
  displayLabel: string;
  mcDriven: boolean;
}

const WEIGHTS = { mc: 0.5, coverage: 0.2, certainty: 0.2, stability: 0.1 } as const;

function clamp01(v: number, fallback = 0.5): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.01, Math.min(1, v));
}

function bandFor(v: number): ConfidenceBand {
  if (v >= 0.8) return "VERY_HIGH";
  if (v >= 0.6) return "HIGH";
  if (v >= 0.4) return "MODERATE";
  return "LOW";
}

function dataCompletenessFor(rec: Recommendation, s: UnifiedSignals): number {
  const required = new Set<string>(rec.sourceSignalsUsed.map((x) => String(x)));
  // 0..1 — fraction of required signals present in UnifiedSignals
  let present = 0;
  let total = 0;
  for (const sig of required) {
    total++;
    if (sig === "monte_carlo_v4" || sig === "monte_carlo_v5") {
      if (s.mcSurvivalProbability != null) present++;
    } else if (sig === "ledger_income_expense") {
      if (s.monthlyIncome != null && s.monthlyExpenses != null) present++;
    } else if (sig === "snapshot" || sig === "cash_offset") {
      if (s.cashOutsideOffset != null || s.offsetBalance != null) present++;
    } else if (sig === "fire_engine") {
      if (s.fireProgressPct != null) present++;
    } else if (sig === "risk_engine") {
      if (s.riskOverallScore != null) present++;
    } else if (sig === "debt_balances") {
      if (s.debtPortfolio != null || s.mortgage != null) present++;
    } else if (sig === "household_tax") {
      if (s.marginalTaxRate != null) present++;
    } else {
      // Default — count as present
      present++;
    }
  }
  if (total === 0) return 0.5;
  return clamp01(present / total);
}

function modelCertaintyFor(rec: Recommendation, mcPresent: boolean): number {
  // Without an MC interval, we infer from urgency and risk level (proxy for
  // domain confidence on the underlying rule). MC presence boosts certainty.
  let v = rec.confidenceScore ?? 0.6;
  if (!mcPresent) v *= 0.85;
  return clamp01(v);
}

function inputStabilityFor(_ctx: RecommendationContext | undefined): number {
  // We have no audit trail of historic input changes in this scope; use 0.7
  // as a conservative default. Phase 17.8 audit harness records context
  // hashes across runs so a future iteration can populate this with a real
  // delta.
  return 0.7;
}

export function calibrateConfidence(
  rec: Recommendation,
  s: UnifiedSignals,
  ctx?: RecommendationContext,
): CalibratedConfidence {
  // Only consider this "MC-driven" when a real Monte Carlo survival
  // probability is available. The baselineSuccessProb from Sprint 17 Phase
  // 17.0 is a heuristic projection, NOT Monte Carlo — surfacing it as MC
  // would mislead the user (see Sprint 16 inversion finding). It still
  // feeds the geometric mean as a coverage signal via dataCompleteness.
  const mcSuccessProb = typeof s.mcSurvivalProbability === "number"
    ? s.mcSurvivalProbability
    : null;
  const mcPresent = mcSuccessProb != null;

  const dataCompleteness = dataCompletenessFor(rec, s);
  const modelCertainty = modelCertaintyFor(rec, mcPresent);
  const inputStability = inputStabilityFor(ctx);

  // For the geometric mean, missing MC uses 0.5 as midpoint and we downgrade
  // by one band in the label.
  const mcInput = mcPresent ? clamp01(mcSuccessProb!) : 0.5;
  const coverageInput = clamp01(dataCompleteness);
  const certaintyInput = clamp01(modelCertainty);
  const stabilityInput = clamp01(inputStability);

  let value =
    Math.pow(mcInput, WEIGHTS.mc) *
    Math.pow(coverageInput, WEIGHTS.coverage) *
    Math.pow(certaintyInput, WEIGHTS.certainty) *
    Math.pow(stabilityInput, WEIGHTS.stability);

  // Hard cap: when MC present, confidence cannot exceed mcSuccessProb + 0.1.
  // This is the structural fix for the Sprint 16 0.38→0.92 inversion.
  if (mcPresent) {
    const cap = clamp01(mcSuccessProb! + 0.1, 0);
    if (value > cap) value = cap;
  } else {
    // MC absent — downgrade by one band: subtract 0.15 (≈ one band width)
    value = Math.max(0, value - 0.15);
  }

  value = clamp01(value, 0.05);
  const band = bandFor(value);

  // Display label per user §7: non-MC must NOT say "probability"
  let displayLabel: string;
  if (mcPresent) {
    const pct = Math.round(mcSuccessProb! * 100);
    displayLabel = `${pct}% probability of success (Monte Carlo)`;
  } else {
    const labelMap: Record<ConfidenceBand, string> = {
      LOW: "Low engine fit",
      MODERATE: "Medium engine fit",
      HIGH: "High engine fit",
      VERY_HIGH: "High engine fit",
    };
    displayLabel = labelMap[band];
  }

  const rationaleParts = [
    `mc=${mcPresent ? mcSuccessProb!.toFixed(2) : "absent (midpoint 0.5, downgraded)"} (w=${WEIGHTS.mc})`,
    `coverage=${dataCompleteness.toFixed(2)} (w=${WEIGHTS.coverage})`,
    `certainty=${modelCertainty.toFixed(2)} (w=${WEIGHTS.certainty})`,
    `stability=${inputStability.toFixed(2)} (w=${WEIGHTS.stability})`,
    `→ value=${value.toFixed(2)} band=${band}`,
  ];

  return {
    value,
    band,
    components: { mcSuccessProb, dataCompleteness, modelCertainty, inputStability },
    weights: WEIGHTS,
    rationale: rationaleParts.join(" | "),
    displayLabel,
    mcDriven: mcPresent,
  };
}
