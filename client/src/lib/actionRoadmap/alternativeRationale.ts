/**
 * actionRoadmap/alternativeRationale.ts — Sprint 29 §10.
 *
 * Produces the "Why it's not recommended" reasons list for an alternative
 * strategy vs the engine-recommended path. THIS MODULE PERFORMS NO MATH
 * BEYOND COMPARISONS. Every reason traces to an engine field surfaced
 * through `MonteCarloProjection`, `GoalLabRankedScenario.probabilityP50`,
 * or `analyzeRoadmapRisk`.
 *
 * Honesty:
 *   - When either pick / projection is missing, returns `{ reasons: [] }` —
 *     no fabrication, no padding.
 *   - Thresholds documented inline per §10.2.
 *   - Reasons carry an explicit `sign`: "+" = recommended wins on this axis,
 *     "-" = alternative wins (kept for transparency).
 */
import type { GoalLabRankedScenario } from "../goalLab/orchestrator";
import type { MonteCarloProjection } from "./montecarloProjection";
import { analyzeRoadmapRisk } from "./roadmapRiskAnalyzer";
import type { RiskBand } from "./types";

export type RationaleAxis = "nw" | "fireAge" | "survivability" | "risk" | "passive";
export type RationaleSign = "+" | "-";

export interface RationaleReason {
  sign: RationaleSign;
  text: string;
  axis: RationaleAxis;
}

export interface AlternativeRationale {
  reasons: RationaleReason[];
}

export interface BuildRationaleInput {
  recommended: GoalLabRankedScenario | null;
  alternative: GoalLabRankedScenario | null;
  recommendedMC: MonteCarloProjection;
  alternativeMC: MonteCarloProjection;
}

const NW_THRESHOLD_PCT = 0.01;          // |Δ| > 1% of recommended NW
const FIRE_AGE_THRESHOLD_YEARS = 0.25;
const SURVIVABILITY_THRESHOLD_PCT = 0.01; // 1 percentage point

function bandRank(b: RiskBand): number {
  switch (b) {
    case "low":     return 1;
    case "medium":  return 2;
    case "high":    return 3;
    case "unknown": return 0;
  }
}

function fmtMoneyAbs(n: number): string {
  return `$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
}

export function buildAlternativeRationale(input: BuildRationaleInput): AlternativeRationale {
  const { recommended, alternative, recommendedMC, alternativeMC } = input;
  if (!recommended || !alternative) return { reasons: [] };

  const reasons: RationaleReason[] = [];

  // 1. Net worth at FIRE
  const recNw = recommendedMC.netWorthAtFire.p50;
  const altNw = alternativeMC.netWorthAtFire.p50;
  if (recNw != null && altNw != null) {
    const diff = recNw - altNw;
    const threshold = Math.abs(recNw) * NW_THRESHOLD_PCT;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        reasons.push({ sign: "+", axis: "nw", text: `Recommended path projects ${fmtMoneyAbs(diff)} more terminal net worth (P50).` });
      } else {
        reasons.push({ sign: "-", axis: "nw", text: `Alternative projects ${fmtMoneyAbs(diff)} more terminal net worth (P50) — kept for transparency.` });
      }
    }
  }

  // 2. FIRE age
  const recAge = recommendedMC.fireAge.p50;
  const altAge = alternativeMC.fireAge.p50;
  if (recAge != null && altAge != null) {
    const diff = altAge - recAge;  // positive = alt is later (worse), negative = alt is earlier (better)
    if (Math.abs(diff) > FIRE_AGE_THRESHOLD_YEARS) {
      if (diff > 0) {
        reasons.push({ sign: "+", axis: "fireAge", text: `Alternative reaches FIRE roughly ${Math.abs(diff)} year${Math.abs(diff) === 1 ? "" : "s"} later (P50).` });
      } else {
        reasons.push({ sign: "-", axis: "fireAge", text: `Alternative reaches FIRE roughly ${Math.abs(diff)} year${Math.abs(diff) === 1 ? "" : "s"} earlier (P50) — kept for transparency.` });
      }
    }
  }

  // 3. Survivability (engine probabilityP50, normalised 0..1)
  const recSurv = recommended.probabilityP50;
  const altSurv = alternative.probabilityP50;
  if (recSurv != null && altSurv != null) {
    const diff = recSurv - altSurv;
    if (Math.abs(diff) > SURVIVABILITY_THRESHOLD_PCT) {
      const pp = (Math.abs(diff) * 100).toFixed(1);
      if (diff > 0) {
        reasons.push({ sign: "+", axis: "survivability", text: `Engine survivability is ${pp}pp higher for the recommended path.` });
      } else {
        reasons.push({ sign: "-", axis: "survivability", text: `Engine survivability is ${pp}pp higher on the alternative — kept for transparency.` });
      }
    }
  }

  // 4. Risk band (any change is meaningful)
  const recRisk = analyzeRoadmapRisk(recommended).overall;
  const altRisk = analyzeRoadmapRisk(alternative).overall;
  if (recRisk !== altRisk && recRisk !== "unknown" && altRisk !== "unknown") {
    const recRank = bandRank(recRisk);
    const altRank = bandRank(altRisk);
    if (altRank > recRank) {
      reasons.push({ sign: "+", axis: "risk", text: `Alternative carries higher overall risk (${altRisk} vs ${recRisk}).` });
    } else if (altRank < recRank) {
      reasons.push({ sign: "-", axis: "risk", text: `Alternative is lower risk (${altRisk} vs ${recRisk}) — kept for transparency.` });
    }
  }

  // 5. Passive income (P50)
  const recPi = recommendedMC.passiveIncomeAtFire.p50;
  const altPi = alternativeMC.passiveIncomeAtFire.p50;
  if (recPi != null && altPi != null) {
    const diff = recPi - altPi;
    // Use the same 1%-of-recommended-NW threshold but applied to passive
    // income's natural scale: $1 / month is the rounding floor.
    if (Math.abs(diff) > 1) {
      if (diff > 0) {
        reasons.push({ sign: "+", axis: "passive", text: `Recommended path produces ${fmtMoneyAbs(diff)} more annual passive income (P50).` });
      } else {
        reasons.push({ sign: "-", axis: "passive", text: `Alternative produces ${fmtMoneyAbs(diff)} more annual passive income (P50) — kept for transparency.` });
      }
    }
  }

  return { reasons };
}
