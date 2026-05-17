/**
 * Surface adapters — small helpers that produce per-card output objects
 * derived from a single UnifiedRecommendationResult so that FIRE, Risk
 * Radar and Deposit Power cards stay coherent with the Best Move card.
 *
 * These helpers do not own visual structure — they output structured props
 * the cards can render. They are pure and easily testable.
 */

import type { Recommendation, UnifiedRecommendationResult, UnifiedSignals } from './types';

export interface DepositPowerReadiness {
  depositReady: boolean;
  serviceabilityReady: boolean;
  liquidityReady: boolean;
  stressTestReady: boolean;
  postPurchaseBufferReady: boolean;
  refinanceRiskAcceptable: boolean;
  opportunityCostAcceptable: boolean;
  /** True only if every gate passes. */
  strategyReady: boolean;
  /** Headline message — guarantees the required "Deposit ready, but not strategy-ready." line. */
  headline: string;
  /** Recommendation that backs this — sourced from the unified result. */
  recommendation?: Recommendation;
}

export function depositPowerReadinessFromSignals(
  s: UnifiedSignals,
  result: UnifiedRecommendationResult,
): DepositPowerReadiness {
  const depositReady = (s.depositReadinessPct ?? 0) >= 100;
  const serviceabilityReady = (s.serviceabilityHeadroomMonthly ?? 0) > 0;
  const liquidityReady = (s.cashOutsideOffset ?? 0) + (s.offsetBalance ?? 0) >= (s.emergencyBufferTarget ?? 0);
  const stressTestReady = s.mcStressFlag !== 'severe';
  const postPurchaseBufferReady = (s.postPurchaseBufferMonths ?? 99) >= 3;
  const refinanceRiskAcceptable = s.mcRateStressActive !== true;
  // crude proxy: if FIRE survival probability drops badly when capital locked up, the purchase has high opp cost.
  const opportunityCostAcceptable = (s.mcSurvivalProbability ?? 1) >= 0.6;

  const strategyReady = depositReady && serviceabilityReady && liquidityReady &&
    stressTestReady && postPurchaseBufferReady && refinanceRiskAcceptable && opportunityCostAcceptable;

  let headline: string;
  if (strategyReady) {
    headline = 'Strategy-ready: deposit + serviceability + liquidity + stress gates all pass.';
  } else if (depositReady) {
    headline = 'Deposit ready, but not strategy-ready.';
  } else {
    headline = `Deposit ${(s.depositReadinessPct ?? 0).toFixed(0)}% — keep building deposit power.`;
  }

  const rec = result.all.find(r =>
    r.actionType === 'proceed_property_purchase' || r.actionType === 'delay_property_purchase');

  return {
    depositReady,
    serviceabilityReady,
    liquidityReady,
    stressTestReady,
    postPurchaseBufferReady,
    refinanceRiskAcceptable,
    opportunityCostAcceptable,
    strategyReady,
    headline,
    recommendation: rec,
  };
}

export interface RiskRadarSurfaceOutput {
  topRisk?: string;
  secondRisk?: string;
  trend: 'improving' | 'stable' | 'deteriorating' | 'unknown';
  severity: 'low' | 'moderate' | 'high' | 'unknown';
  requiredAction?: string;
  recommendations: Recommendation[];
}

export function riskRadarSurfaceFrom(
  s: UnifiedSignals,
  result: UnifiedRecommendationResult,
): RiskRadarSurfaceOutput {
  const score = s.riskOverallScore;
  const severity: RiskRadarSurfaceOutput['severity'] =
    score == null ? 'unknown'
    : score >= 70 ? 'low'
    : score >= 40 ? 'moderate'
    : 'high';
  const reducerRecs = result.all.filter(r => !!r.riskReductionImpact && r.riskReductionImpact.points > 0);
  return {
    topRisk: s.topRiskFactor?.label,
    secondRisk: s.secondRiskFactor?.label,
    trend: 'unknown',
    severity,
    requiredAction: s.topRiskFactor?.action ?? reducerRecs[0]?.title,
    recommendations: reducerRecs.slice(0, 3),
  };
}

export interface FireSurfaceOutput {
  recommendations: Recommendation[];
  bestActionsForFire: Recommendation[];
}

export function fireSurfaceFrom(result: UnifiedRecommendationResult): FireSurfaceOutput {
  const fireRecs = result.all.filter(r => r.fireImpact || r.pillar === 'improve_fire_timeline');
  return {
    recommendations: fireRecs,
    bestActionsForFire: fireRecs.slice(0, 3),
  };
}
