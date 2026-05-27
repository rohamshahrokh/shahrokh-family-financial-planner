/**
 * Sprint 18 Phase 18.1 — Path scoring.
 *
 * User's exact weights:
 *   pathScore = 0.25 × FIREAccelerationScore
 *             + 0.20 × SuccessProbabilityScore
 *             + 0.15 × RiskAdjustedReturnScore
 *             + 0.15 × FeasibilityScore
 *             + 0.10 × LiquiditySafetyScore
 *             + 0.10 × BehaviouralFitScore
 *             + 0.05 × TaxEfficiencyScore
 *             − penalties
 *
 * Output is 0..100. Penalties are applied directly (already on 0..1 scale).
 */

import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath, PathScoreComponents } from "./pathTypes";

const WEIGHTS = {
  fire: 0.25,
  success: 0.20,
  riskAdjReturn: 0.15,
  feasibility: 0.15,
  liquiditySafety: 0.10,
  behaviouralFit: 0.10,
  taxEfficiency: 0.05,
} as const;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Heuristic FIRE acceleration score from the path's intended actions. */
function fireAcceleration(path: OptimisedPath, ctx: RecommendationContext): number {
  const accumulationWeight = path.steps.reduce((acc, s) => {
    if (s.actionType === "etf_dca" || s.actionType === "fire_acceleration") return acc + 0.35;
    if (s.actionType === "increase_super") return acc + 0.25;
    if (s.actionType === "pay_high_interest_debt") return acc + 0.20;
    if (s.actionType === "rebalance_concentration") return acc + 0.10;
    if (s.actionType === "glidepath_shift" || s.actionType === "swr_review") return acc - 0.10;
    return acc;
  }, 0.4);
  const surplus = ctx.today.cashflow.monthlySurplus;
  const surplusBoost = surplus > 0 ? Math.min(0.3, surplus / 10_000) : 0;
  return clamp01(accumulationWeight + surplusBoost);
}

/** Probability of plan success after this path. */
function successProbability(path: OptimisedPath, ctx: RecommendationContext): number {
  const baseline = ctx.forecast.fireSuccessProbabilityBaseline;
  let bump = 0;
  if (path.archetype === "fire_protection") bump += 0.20;
  if (path.archetype === "risk_reduction") bump += 0.15;
  if (path.archetype === "debt_first") bump += 0.10;
  if (path.archetype === "liquid_growth") bump += 0.05;
  if (path.archetype === "property_led") bump += 0.0;
  return clamp01(baseline + bump);
}

/** Risk-adjusted return: penalises high-volatility paths. */
function riskAdjustedReturn(path: OptimisedPath, _ctx: RecommendationContext): number {
  const archetypeRisk: Record<OptimisedPath["archetype"], number> = {
    debt_first: 0.85,
    property_led: 0.55,
    liquid_growth: 0.65,
    risk_reduction: 0.80,
    fire_protection: 0.90,
  };
  return clamp01(archetypeRisk[path.archetype]);
}

/** Feasibility: cashflow + step count + capital required vs available. */
function feasibility(path: OptimisedPath, ctx: RecommendationContext): number {
  const surplus = ctx.today.cashflow.monthlySurplus;
  if (surplus < 0) return 0.15;
  const requiresHighOutlay = path.steps.some(
    (s) => (s.estimatedMonthlyAmount ?? 0) > surplus * 0.95,
  );
  let f = 0.75;
  if (path.archetype === "property_led") {
    const cashOk = ctx.today.netWorth.cash > 50_000;
    f = cashOk ? 0.65 : 0.30;
  }
  if (requiresHighOutlay) f -= 0.2;
  if (path.steps.length > 3) f -= 0.05;
  return clamp01(f);
}

/** Liquidity safety: does the path preserve emergency buffer? */
function liquiditySafety(path: OptimisedPath, ctx: RecommendationContext): number {
  const cashRunwayMonths = ctx.today.cashflow.monthlyExpenses > 0
    ? ctx.today.netWorth.cash / ctx.today.cashflow.monthlyExpenses
    : 12;
  let base = clamp01(cashRunwayMonths / 6); // 6 months runway = 1.0
  if (path.steps.some((s) => s.actionType === "build_emergency_buffer" || s.actionType === "increase_cash_reserve")) {
    base += 0.15;
  }
  if (path.archetype === "property_led" && cashRunwayMonths < 4) base -= 0.25;
  return clamp01(base);
}

/** Behavioural fit — populated externally; default to neutral 0.6 here. */
function behaviouralFit(path: OptimisedPath): number {
  // The Phase 18.3 behavioural module will overwrite this via attachBehaviouralFit().
  return path.scoreComponents.behaviouralFitScore || 0.6;
}

/** Tax efficiency — does the path use concessional super, offset, etc. */
function taxEfficiency(path: OptimisedPath, ctx: RecommendationContext): number {
  const usesSuper = path.steps.some((s) => s.actionType === "increase_super");
  const usesOffset = path.steps.some((s) => s.actionType === "hold_cash_offset");
  const mtr = ctx.today.ledger?.snapshot?.marginalTaxRate ?? 0.32;
  let base = 0.4;
  if (usesSuper) base += 0.35 * Math.min(1, mtr / 0.39);
  if (usesOffset) base += 0.15;
  if (path.archetype === "property_led") base += 0.05;
  return clamp01(base);
}

/** Penalties — additive 0..1 from infeasibility, behavioural risk, etc. */
function penaltiesFor(path: OptimisedPath): number {
  let p = 0;
  if (!path.feasibility.feasible) p += 0.25;
  if (path.feasibility.blockers.length >= 2) p += 0.10;
  if (path.stressTest && path.stressTest.scenariosSurvived < path.stressTest.scenariosTested * 0.5) {
    p += 0.15;
  }
  return Math.min(0.7, p);
}

export function scorePath(path: OptimisedPath, ctx: RecommendationContext): OptimisedPath {
  const components: PathScoreComponents = {
    fireAccelerationScore: fireAcceleration(path, ctx),
    successProbabilityScore: successProbability(path, ctx),
    riskAdjustedReturnScore: riskAdjustedReturn(path, ctx),
    feasibilityScore: feasibility(path, ctx),
    liquiditySafetyScore: liquiditySafety(path, ctx),
    behaviouralFitScore: behaviouralFit(path),
    taxEfficiencyScore: taxEfficiency(path, ctx),
    penalties: penaltiesFor(path),
  };

  const weighted =
    WEIGHTS.fire * components.fireAccelerationScore +
    WEIGHTS.success * components.successProbabilityScore +
    WEIGHTS.riskAdjReturn * components.riskAdjustedReturnScore +
    WEIGHTS.feasibility * components.feasibilityScore +
    WEIGHTS.liquiditySafety * components.liquiditySafetyScore +
    WEIGHTS.behaviouralFit * components.behaviouralFitScore +
    WEIGHTS.taxEfficiency * components.taxEfficiencyScore;

  const finalScore = Math.max(0, weighted - components.penalties);
  const score = Math.round(finalScore * 100);

  // Heuristic FIRE-date / success-probability deltas (re-uses Phase 17.4 spirit).
  const fireDeltaMonths = (() => {
    const accel = components.fireAccelerationScore;
    if (accel < 0.3) return 0;
    // 0.3..1 maps to -3..-48 months
    return -Math.round(3 + (accel - 0.3) * 64);
  })();

  return {
    ...path,
    score,
    scoreComponents: components,
    expectedFireDeltaMonths: fireDeltaMonths,
    expectedSuccessProbabilityDelta: components.successProbabilityScore - ctx.forecast.fireSuccessProbabilityBaseline,
    expectedNetWorthDelta:
      ctx.today.netWorth.total * components.fireAccelerationScore * 0.3,
    reasoning:
      `Score ${score}/100 — fireAccel ${components.fireAccelerationScore.toFixed(2)}, ` +
      `successProb ${components.successProbabilityScore.toFixed(2)}, ` +
      `riskAdj ${components.riskAdjustedReturnScore.toFixed(2)}, ` +
      `feasibility ${components.feasibilityScore.toFixed(2)}, ` +
      `liquidity ${components.liquiditySafetyScore.toFixed(2)}, ` +
      `behavioural ${components.behaviouralFitScore.toFixed(2)}, ` +
      `tax ${components.taxEfficiencyScore.toFixed(2)}, ` +
      `penalties -${components.penalties.toFixed(2)}.`,
    finalised: true,
  };
}
