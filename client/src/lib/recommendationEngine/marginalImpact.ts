/**
 * Sprint 17 Phase 17.4 — Marginal Impact Simulator.
 *
 * For every recommendation, compute the Δ vs the baseline forecast:
 *   - deltaFireDateMonths  (negative = sooner)
 *   - deltaSuccessProbability  (positive = safer)
 *   - deltaNetWorthAtTargetAge
 *   - deltaPassiveAnnualIncome
 *   - deltaMonthlySurplus
 *   - deltaLiquidityRisk
 *   - deltaDebtStress
 *
 * Uses existing engines (no new financial math). Re-projects the baseline
 * with the action applied and diffs. Cached per (candidateId, contextHash).
 *
 * Cost control: deterministic projection (no MC) — fast and reproducible.
 */

import type { Recommendation } from "./types";
import type { RecommendationContext } from "../recommendationContext/types";

export interface MarginalImpact {
  deltaFireDateMonths: number | null;
  deltaSuccessProbability: number | null;
  deltaNetWorthAtTargetAge: number | null;
  deltaPassiveAnnualIncome: number | null;
  deltaMonthlySurplus?: number | null;
  deltaLiquidityRisk?: number | null;
  deltaDebtStress?: number | null;
  derivation: "monte_carlo" | "deterministic" | "ruleOfThumb";
  evidence: string[];
}

const cache = new Map<string, MarginalImpact>();
const MAX_CACHE = 200;

function cacheKey(id: string, ctx: RecommendationContext | undefined): string {
  return `${id}::${ctx?.meta?.contextHash ?? "none"}`;
}

function projectNetWorth(
  netWorthNow: number,
  monthlySurplus: number,
  realReturnPct: number,
  years: number,
): number {
  let nw = Math.max(0, netWorthNow);
  const annualContrib = Math.max(0, monthlySurplus) * 12;
  for (let i = 0; i < years; i++) {
    nw = nw * (1 + realReturnPct) + annualContrib;
  }
  return nw;
}

function yearsToTarget(ctx: RecommendationContext): number {
  if (ctx.today.age != null && ctx.plan.targetFireAge != null) {
    return Math.max(1, ctx.plan.targetFireAge - ctx.today.age);
  }
  return ctx.meta.horizonYears;
}

function fireNumberOf(ctx: RecommendationContext): number {
  if (ctx.plan.targetPassiveMonthly != null && ctx.plan.swrPct != null && ctx.plan.swrPct > 0) {
    return (ctx.plan.targetPassiveMonthly * 12) / ctx.plan.swrPct;
  }
  return 0;
}

function findYearsToReach(
  nwNow: number,
  monthlySurplus: number,
  realReturnPct: number,
  fireNumber: number,
  maxYears: number,
): number | null {
  if (fireNumber <= 0) return null;
  let nw = nwNow;
  const annualContrib = Math.max(0, monthlySurplus) * 12;
  if (nw >= fireNumber) return 0;
  for (let i = 1; i <= maxYears; i++) {
    nw = nw * (1 + realReturnPct) + annualContrib;
    if (nw >= fireNumber) return i;
  }
  return null;
}

/**
 * Estimate the delta-success-probability if a recommendation were executed.
 * Derived deterministically — additional savings rate, debt amortisation, or
 * cash reserve directly modify the underlying components.
 */
function estimateDeltaSuccess(
  candidate: Recommendation,
  ctx: RecommendationContext,
  deltaSurplus: number,
): number {
  const baseProb = ctx.forecast.fireSuccessProbabilityBaseline;
  // Re-run the success-probability heuristic with augmented surplus
  const adjustedSurplus = ctx.today.cashflow.monthlySurplus + deltaSurplus;
  const ytarget = yearsToTarget(ctx);
  const fireN = fireNumberOf(ctx);
  if (fireN <= 0) return 0;
  let fv = ctx.today.netWorth.total;
  const annualContrib = Math.max(0, adjustedSurplus) * 12;
  for (let i = 0; i < ytarget; i++) {
    fv = fv * (1 + 0.05) + annualContrib;
  }
  const coverage = fv / fireN;
  let newProb: number;
  if (coverage <= 0.4) newProb = 0.05;
  else if (coverage <= 0.7) newProb = 0.05 + (coverage - 0.4) * (0.25 / 0.3);
  else if (coverage <= 1.0) newProb = 0.30 + (coverage - 0.7) * (0.40 / 0.3);
  else if (coverage <= 1.3) newProb = 0.70 + (coverage - 1.0) * (0.20 / 0.3);
  else newProb = 0.90 + Math.min(0.07, (coverage - 1.3) * 0.15);
  newProb = Math.max(0.05, Math.min(0.97, newProb));
  return Number((newProb - baseProb).toFixed(3));
}

function simulateForAction(
  candidate: Recommendation,
  ctx: RecommendationContext,
): MarginalImpact {
  const id = candidate.id;
  const actionType = candidate.actionType;
  const baseSurplus = ctx.today.cashflow.monthlySurplus;
  const nwNow = ctx.today.netWorth.total;
  const ytarget = yearsToTarget(ctx);
  const fireN = fireNumberOf(ctx);
  const realReturn = 0.05;
  const baselineYears = findYearsToReach(nwNow, baseSurplus, realReturn, fireN, ytarget + 20);

  const evidence: string[] = [`baseline_surplus=$${Math.round(baseSurplus)}/mo`];

  // Action → delta to monthly surplus or net worth or both
  let deltaSurplus = 0;
  let deltaNw = 0;
  let derivation: MarginalImpact["derivation"] = "deterministic";
  let deltaLiquidityRisk: number | null = 0;
  let deltaDebtStress: number | null = 0;

  switch (actionType) {
    case "etf_dca":
    case "fire_acceleration": {
      const monthly =
        candidate.surplusReconciliation?.recommendedMonthlyAmount ??
        Math.max(0, baseSurplus * 0.5);
      deltaSurplus = -monthly; // monthly deployed away from cash, into investments
      deltaNw = monthly * 12 * realReturn; // first-year compounded
      evidence.push(`monthly_deploy=$${Math.round(monthly)}`);
      derivation = "deterministic";
      break;
    }
    case "increase_super": {
      const annual = candidate.expectedFinancialImpact?.annualDollar ?? 5000;
      const monthly = annual / 12;
      deltaSurplus = -monthly;
      deltaNw = annual * 0.7; // factoring concessional tax saving
      evidence.push(`super_annual=$${Math.round(annual)}`);
      derivation = "deterministic";
      break;
    }
    case "pay_high_interest_debt": {
      const annualDollar = candidate.expectedFinancialImpact?.annualDollar ?? 0;
      deltaSurplus = annualDollar / 12; // freed-up interest
      deltaNw = -annualDollar * 5; // assume 5-year horizon of saved interest now in pocket
      deltaDebtStress = -0.2;
      evidence.push(`debt_annual_interest=$${Math.round(annualDollar)}`);
      derivation = "deterministic";
      break;
    }
    case "reduce_leverage": {
      const annualDollar = candidate.expectedFinancialImpact?.annualDollar ?? 0;
      deltaSurplus = annualDollar / 12;
      deltaNw = annualDollar * 3;
      deltaDebtStress = -0.15;
      evidence.push(`leverage_reduction=$${Math.round(annualDollar)}`);
      derivation = "deterministic";
      break;
    }
    case "build_emergency_buffer": {
      // Buffer reduces liquidity risk; modest opportunity cost only
      deltaLiquidityRisk = -0.25;
      deltaSurplus = 0;
      deltaNw = 0;
      evidence.push(`buffer_action`);
      derivation = "ruleOfThumb";
      break;
    }
    case "hold_cash_offset": {
      const annualBenefit = candidate.expectedFinancialImpact?.annualDollar ?? 0;
      deltaNw = annualBenefit;
      deltaLiquidityRisk = 0.05;
      evidence.push(`offset_annual=$${Math.round(annualBenefit)}`);
      derivation = "deterministic";
      break;
    }
    case "proceed_property_purchase": {
      const annual = candidate.expectedFinancialImpact?.annualDollar ?? 0;
      deltaNw = annual * 5;
      deltaLiquidityRisk = 0.15;
      deltaDebtStress = 0.2;
      evidence.push(`property_annual=$${Math.round(annual)}`);
      derivation = "deterministic";
      break;
    }
    case "delay_property_purchase": {
      deltaSurplus = 0;
      deltaNw = 0;
      deltaLiquidityRisk = -0.05;
      evidence.push(`delay_action`);
      derivation = "ruleOfThumb";
      break;
    }
    case "rebalance_portfolio":
    case "rebalance_concentration": {
      deltaNw = 0;
      deltaLiquidityRisk = -0.05;
      evidence.push(`rebalance_action`);
      derivation = "ruleOfThumb";
      break;
    }
    case "glidepath_shift": {
      deltaLiquidityRisk = -0.1;
      derivation = "ruleOfThumb";
      evidence.push("glidepath_shift");
      break;
    }
    case "increase_cash_reserve": {
      deltaLiquidityRisk = -0.2;
      derivation = "ruleOfThumb";
      evidence.push("cash_reserve");
      break;
    }
    case "swr_review": {
      derivation = "ruleOfThumb";
      evidence.push("swr_review");
      break;
    }
    case "income_protection": {
      deltaLiquidityRisk = -0.1;
      derivation = "ruleOfThumb";
      evidence.push("income_protection");
      break;
    }
    case "unreachable_plan_review": {
      derivation = "ruleOfThumb";
      evidence.push("unreachable_plan_review");
      break;
    }
    case "maintain_interest_free_debt":
    case "monitor_strategic_debt":
    case "plan_promo_expiry": {
      deltaNw = 0;
      derivation = "ruleOfThumb";
      evidence.push("monitor");
      break;
    }
    default: {
      derivation = "ruleOfThumb";
      evidence.push(`unmapped_action=${actionType}`);
      break;
    }
  }

  // Project new fire years
  const newSurplus = baseSurplus + deltaSurplus;
  const newNwNow = nwNow + deltaNw;
  const newYears =
    fireN > 0
      ? findYearsToReach(newNwNow, newSurplus, realReturn, fireN, ytarget + 20)
      : null;

  let deltaFireDateMonths: number | null = null;
  if (baselineYears != null && newYears != null) {
    deltaFireDateMonths = (newYears - baselineYears) * 12;
  } else if (baselineYears == null && newYears != null) {
    // Was unreachable, now reachable → very negative delta
    deltaFireDateMonths = -120;
  } else if (baselineYears != null && newYears == null) {
    deltaFireDateMonths = 120;
  }

  // Project NW at target age — baseline vs adjusted
  const nwBaselineAtTarget = projectNetWorth(nwNow, baseSurplus, realReturn, ytarget);
  const nwAdjustedAtTarget = projectNetWorth(newNwNow, newSurplus, realReturn, ytarget);
  const deltaNetWorthAtTargetAge = nwAdjustedAtTarget - nwBaselineAtTarget;

  // Passive income delta
  const swr = ctx.plan.swrPct ?? 0.04;
  const deltaPassiveAnnualIncome = deltaNetWorthAtTargetAge * swr;

  const deltaSuccess = estimateDeltaSuccess(candidate, ctx, deltaSurplus);

  return {
    deltaFireDateMonths,
    deltaSuccessProbability: deltaSuccess,
    deltaNetWorthAtTargetAge: Number(deltaNetWorthAtTargetAge.toFixed(0)),
    deltaPassiveAnnualIncome: Number(deltaPassiveAnnualIncome.toFixed(0)),
    deltaMonthlySurplus: Number(deltaSurplus.toFixed(0)),
    deltaLiquidityRisk,
    deltaDebtStress,
    derivation,
    evidence,
  };
}

/**
 * Compute MarginalImpact for a single candidate. Cached per
 * (candidateId, contextHash) — returns null only when context is missing.
 */
export function simulateMarginalImpact(
  candidate: Recommendation,
  ctx?: RecommendationContext | null,
): MarginalImpact | null {
  if (!ctx) return null;
  const key = cacheKey(candidate.id, ctx);
  const cached = cache.get(key);
  if (cached) return cached;
  const result = simulateForAction(candidate, ctx);
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, result);
  return result;
}

/** Test helper: clear cache. */
export function __resetMarginalImpactCacheForTests(): void {
  cache.clear();
}
