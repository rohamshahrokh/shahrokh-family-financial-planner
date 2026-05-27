/**
 * Sprint 17 Phase 17.1 — Quality Score (UtilityScore) rubric.
 *
 * User-specified formula (§5):
 *   UtilityScore = ImpactScore
 *                × SuccessProbabilityScore
 *                × FeasibilityScore
 *                − (RiskPenalty + LiquidityPenalty + ConcentrationPenalty + LeveragePenalty)
 *
 * Each multiplicative factor is 0..1; each penalty is 0..30. Output is
 * clamped to [0, 100] for ranking comparability.
 *
 * Deterministic, source-cited, no MC re-runs. Phase 17.4 plugs the
 * marginalImpact deltas in to drive ImpactScore + SuccessProbabilityScore.
 * Phase 17.5 plugs ConcentrationPenalty in from the detector.
 */

import type { Recommendation, UnifiedSignals } from "./types";
import type { RecommendationContext } from "../recommendationContext/types";
import { metadataFor, isApplicableInState } from "./rules/registry";

export interface QualityScoreBreakdown {
  total: number;
  impactScore: number;             // 0..1
  successProbabilityScore: number; // 0..1
  feasibilityScore: number;        // 0..1
  riskPenalty: number;             // 0..30
  liquidityPenalty: number;        // 0..30
  concentrationPenalty: number;    // 0..30
  leveragePenalty: number;         // 0..30
  multiplicativePart: number;      // before penalties, 0..100
  reasons: string[];
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampPenalty(v: number, max = 30): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(max, v);
}

/**
 * Impact score 0..1. When marginalImpact is populated (Phase 17.4), uses
 * actual delta-fire-date and delta-success-probability. Without it,
 * degrades to a normalised dollar magnitude.
 */
function computeImpactScore(rec: Recommendation): number {
  const m = rec.marginalImpact;
  if (m) {
    let pts = 0;
    let weightSum = 0;
    if (m.deltaFireDateMonths != null) {
      // 24 months sooner → 1.0; 0 → 0.5; 24 later → 0
      const months = -m.deltaFireDateMonths; // sooner = positive
      pts += weightSum > 0 ? 0 : 0; // structure
      const s = clamp01(0.5 + months / 48);
      pts += s * 0.5;
      weightSum += 0.5;
    }
    if (m.deltaSuccessProbability != null) {
      const s = clamp01(0.5 + m.deltaSuccessProbability * 2);
      pts += s * 0.3;
      weightSum += 0.3;
    }
    if (m.deltaNetWorthAtTargetAge != null) {
      const s = clamp01(0.5 + m.deltaNetWorthAtTargetAge / 500_000);
      pts += s * 0.2;
      weightSum += 0.2;
    }
    if (weightSum > 0) return clamp01(pts / weightSum);
  }
  // Dollar fallback
  const annualDollar = rec.expectedFinancialImpact?.annualDollar ?? 0;
  if (annualDollar <= 0) return 0.3;
  // 0..50k = 0..1
  return clamp01(annualDollar / 50_000);
}

/**
 * Probability the recommendation will succeed if executed. Uses
 * recommendation.confidenceScore (legacy) plus marginal-impact success
 * delta when available.
 */
function computeSuccessProbabilityScore(rec: Recommendation): number {
  const calibrated = rec.calibratedConfidence?.value;
  if (typeof calibrated === "number") return clamp01(calibrated);
  return clamp01(rec.confidenceScore);
}

/**
 * Feasibility — can the user actually do this with current cashflow / cap
 * headroom? Hard floor: any candidate requiring negative monthly surplus
 * gets feasibilityScore = 0.
 */
function computeFeasibilityScore(rec: Recommendation, s: UnifiedSignals): number {
  const monthlySurplus = s.monthlySurplus ?? 0;
  // Hard floor — actions requiring deployment need positive surplus
  const deploymentActions: ReadonlyArray<string> = [
    "etf_dca",
    "fire_acceleration",
    "increase_super",
    "build_emergency_buffer",
    "pay_high_interest_debt",
    "proceed_property_purchase",
  ];
  if (deploymentActions.includes(rec.actionType)) {
    if (monthlySurplus <= 0) return 0;
  }
  if (rec.actionType === "increase_super") {
    const cap = s.superCapRemaining ?? 0;
    if (cap <= 0) return 0;
    return clamp01(Math.min(1, cap / 10_000));
  }
  if (rec.actionType === "proceed_property_purchase") {
    const headroom = s.serviceabilityHeadroomMonthly ?? 0;
    const buffer = s.postPurchaseBufferMonths ?? 0;
    if (headroom <= 0) return 0;
    return clamp01(buffer / 6);
  }
  // Default — feasibility ~ surplus headroom up to 5k/mo = 1.0
  return clamp01(0.5 + monthlySurplus / 10_000);
}

function computeRiskPenalty(rec: Recommendation, s: UnifiedSignals): number {
  let penalty = 0;
  if (rec.riskLevel === "High") penalty += 10;
  else if (rec.riskLevel === "Med") penalty += 4;
  if (s.mcStressFlag === "severe" && rec.pillar === "improve_fire_timeline") penalty += 8;
  if (s.mcStressFlag === "severe" && rec.pillar === "maximise_wealth") penalty += 10;
  return clampPenalty(penalty);
}

function computeLiquidityPenalty(rec: Recommendation, s: UnifiedSignals): number {
  let penalty = 0;
  const cash = (s.cashOutsideOffset ?? 0) + (s.offsetBalance ?? 0);
  const buffer = s.emergencyBufferTarget ?? 0;
  const cashBelowBuffer = buffer > 0 && cash < buffer;
  if (cashBelowBuffer) {
    // Locking cash up is bad when buffer is short
    const locksLiquidity = rec.liquidityImpact?.deltaDeployableCash ?? 0;
    if (locksLiquidity < 0) penalty += 12;
  }
  if (rec.actionType === "increase_super" && cashBelowBuffer) penalty += 8;
  return clampPenalty(penalty);
}

function computeConcentrationPenalty(rec: Recommendation, s: UnifiedSignals): number {
  // Phase 17.5 plugs flags in — penalise candidates that worsen
  // concentration. Without flags we still penalise predictably bad combos.
  let penalty = 0;
  const flags = s.concentrationFlags ?? [];
  if (flags.length === 0) return 0;
  for (const f of flags) {
    const critical = f.severity === "critical";
    const bumpPropertyHeavy =
      f.kind === "property_over_80" && rec.actionType === "proceed_property_purchase";
    const bumpCryptoHeavy = f.kind === "crypto_over_30";
    const bumpSingleAsset = f.kind === "single_asset_over_70";
    if (bumpPropertyHeavy) penalty += critical ? 18 : 10;
    if (bumpCryptoHeavy && rec.actionType === "etf_dca") penalty += 2;
    if (bumpSingleAsset && rec.actionType === "rebalance_concentration") penalty -= 10; // boost
  }
  return clampPenalty(penalty);
}

function computeLeveragePenalty(rec: Recommendation, s: UnifiedSignals): number {
  let penalty = 0;
  const mortgage = s.mortgage ?? 0;
  const ppor = s.ppor ?? 0;
  const lvr = ppor > 0 ? mortgage / ppor : 0;
  if (lvr > 0.8 && rec.actionType === "proceed_property_purchase") penalty += 15;
  if (lvr > 0.7 && rec.actionType === "etf_dca" && (s.mcStressFlag === "severe")) penalty += 5;
  return clampPenalty(penalty);
}

/**
 * Compute the full quality score. Returns 0..100 plus a structured
 * breakdown for the explanation layer (Phase 17.6).
 *
 * `state` from ctx.lifeStage is used to short-circuit to 0 when the rule
 * is not applicable to the current state (Phase 17.3 gating).
 */
export function computeQualityScore(
  rec: Recommendation,
  s: UnifiedSignals,
  ctx?: RecommendationContext,
): QualityScoreBreakdown {
  const reasons: string[] = [];
  const meta = metadataFor(rec.id);

  // Phase 17.3 — state gating
  if (ctx?.lifeStage && !isApplicableInState(rec.id, ctx.lifeStage)) {
    reasons.push(`${rec.id} not applicable in ${ctx.lifeStage}`);
    return {
      total: 0,
      impactScore: 0,
      successProbabilityScore: 0,
      feasibilityScore: 0,
      riskPenalty: 0,
      liquidityPenalty: 0,
      concentrationPenalty: 0,
      leveragePenalty: 0,
      multiplicativePart: 0,
      reasons,
    };
  }

  // notSuitableIf hard fail
  if (meta?.notSuitableIf && ctx) {
    try {
      if (meta.notSuitableIf(ctx)) {
        reasons.push(`${rec.id} notSuitableIf predicate triggered`);
        return {
          total: 0,
          impactScore: 0,
          successProbabilityScore: 0,
          feasibilityScore: 0,
          riskPenalty: 0,
          liquidityPenalty: 0,
          concentrationPenalty: 0,
          leveragePenalty: 0,
          multiplicativePart: 0,
          reasons,
        };
      }
    } catch {
      // ignore predicate errors
    }
  }

  const impactScore = computeImpactScore(rec);
  const successProbabilityScore = computeSuccessProbabilityScore(rec);
  const feasibilityScore = computeFeasibilityScore(rec, s);
  const multiplicativePart =
    impactScore * successProbabilityScore * feasibilityScore * 100;

  const riskPenalty = computeRiskPenalty(rec, s);
  const liquidityPenalty = computeLiquidityPenalty(rec, s);
  const concentrationPenalty = computeConcentrationPenalty(rec, s);
  const leveragePenalty = computeLeveragePenalty(rec, s);

  const total = Math.max(
    0,
    Math.min(
      100,
      multiplicativePart - (riskPenalty + liquidityPenalty + concentrationPenalty + leveragePenalty),
    ),
  );

  reasons.push(
    `impact=${impactScore.toFixed(2)} success=${successProbabilityScore.toFixed(2)} feasibility=${feasibilityScore.toFixed(2)}`,
  );
  if (riskPenalty) reasons.push(`-${riskPenalty} risk`);
  if (liquidityPenalty) reasons.push(`-${liquidityPenalty} liquidity`);
  if (concentrationPenalty) reasons.push(`-${concentrationPenalty} concentration`);
  if (leveragePenalty) reasons.push(`-${leveragePenalty} leverage`);

  return {
    total,
    impactScore,
    successProbabilityScore,
    feasibilityScore,
    riskPenalty,
    liquidityPenalty,
    concentrationPenalty,
    leveragePenalty,
    multiplicativePart,
    reasons,
  };
}
