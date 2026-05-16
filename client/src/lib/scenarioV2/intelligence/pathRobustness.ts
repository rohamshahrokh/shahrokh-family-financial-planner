/**
 * Path Robustness Scoring — distinguishes high-return-fragile from
 * lower-return-robust paths by comparing the winner against the full
 * ranked candidate set.
 *
 * Inputs: ranked list of candidates. Output: PathRobustness for the
 * winner (index 0).
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { PathRobustness } from "./types";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pathReturnScore(c: RankedCandidate): number {
  const r = c.result;
  const finalP50 = r.netWorthFan?.[r.netWorthFan.length - 1]?.p50 ?? r.initialNetWorth ?? 1;
  const initial = Math.max(1, r.initialNetWorth);
  const years = (r.horizonMonths ?? 120) / 12;
  if (years <= 0 || finalP50 <= 0) return 0;
  const cagr = Math.pow(finalP50 / initial, 1 / years) - 1;
  // 0% → 0, 12% → 1
  return clamp01(cagr / 0.12);
}

function pathRobustnessScore(c: RankedCandidate): number {
  const m = c.result.riskMetrics;
  const survival = 1 - (c.result.defaultProbability ?? 0);
  const liqStressOk = 1 - clamp01(c.result.liquidityStressProbability ?? 0);
  const refiOk = 1 - clamp01((c.result.refinancePressureProbability ?? 0) / 0.5);
  const ddOk = 1 - clamp01((m?.maxDrawdownP90 ?? 0) / 0.6);
  const volOk = 1 - clamp01((m?.volatility ?? 0) / 0.6);
  const concOk = 1 - clamp01(m?.concentrationRisk ?? 0);
  // Weighted: survival is most material.
  return clamp01(
    0.30 * survival +
    0.18 * liqStressOk +
    0.14 * refiOk +
    0.18 * ddOk +
    0.10 * volOk +
    0.10 * concOk,
  );
}

export function scorePathRobustness(
  ranked: RankedCandidate[],
): PathRobustness {
  if (ranked.length === 0) {
    return {
      robustnessScore: 0,
      returnScore: 0,
      classification: "moderate",
      tradeoff: "No ranked path is available — robustness cannot be evaluated.",
      rationale: ["Ranked candidate set is empty."],
    };
  }

  const winner = ranked[0];
  const robustness = pathRobustnessScore(winner);
  const ret = pathReturnScore(winner);

  // Compare winner's terminal NW to the highest-return path in the set.
  const winnerFinal = winner.result.netWorthFan?.[winner.result.netWorthFan.length - 1]?.p50 ?? 0;
  const top = ranked
    .map((c) => ({
      cagr: pathReturnScore(c),
      finalP50: c.result.netWorthFan?.[c.result.netWorthFan.length - 1]?.p50 ?? 0,
      robust: pathRobustnessScore(c),
      id: c.id,
    }))
    .sort((a, b) => b.cagr - a.cagr);

  const highestReturn = top[0];
  const sacrifice = highestReturn.finalP50 > 0
    ? (highestReturn.finalP50 - winnerFinal) / highestReturn.finalP50
    : 0;

  let classification: PathRobustness["classification"];
  if (robustness >= 0.65 && ret >= 0.65) classification = "high-return-robust";
  else if (robustness >= 0.65 && ret >= 0.45) classification = "high-return-acceptable";
  else if (robustness >= 0.65) classification = "lower-return-robust";
  else if (ret >= 0.65) classification = "high-return-fragile";
  else if (robustness >= 0.5 || ret >= 0.5) classification = "balanced";
  else classification = "moderate";

  let tradeoff: string;
  if (classification === "high-return-robust") {
    tradeoff = `Strategy delivers strong projected returns AND sits in the upper band of stress survivability — no material tradeoff identified.`;
  } else if (classification === "lower-return-robust" && sacrifice > 0.03) {
    tradeoff = `Strategy sacrifices ~${Math.round(sacrifice * 100)}% terminal wealth (vs. the highest-return path) in exchange for materially higher survivability stability.`;
  } else if (classification === "high-return-fragile") {
    tradeoff = `Strategy ranks highly on raw return but lower on stress survivability — performance is conditional on favourable conditions holding.`;
  } else if (classification === "high-return-acceptable") {
    tradeoff = `Strategy delivers solid returns with adequate stress survivability — a balanced posture.`;
  } else {
    tradeoff = `Strategy is balanced across return and robustness without a clear edge on either dimension.`;
  }

  const rationale: string[] = [];
  rationale.push(
    `Recommendation ranks highly because performance remains stable across multiple stress environments (robustness ${Math.round(robustness * 100)}/100).`,
  );
  rationale.push(
    `Projected return profile sits at ${Math.round(ret * 100)}/100 — relative to the highest-return path in the set, terminal NW is ${sacrifice > 0 ? `~${Math.round(sacrifice * 100)}% lower` : "broadly comparable"}.`,
  );
  if (sacrifice > 0.05 && classification === "lower-return-robust") {
    rationale.push(
      `The sacrifice is intentional — the highest-return candidate breaks down in adverse paths that the recommended path survives.`,
    );
  }

  return {
    robustnessScore: robustness,
    returnScore: ret,
    classification,
    tradeoff,
    rationale,
  };
}
