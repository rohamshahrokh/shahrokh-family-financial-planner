/**
 * moves/extraSuperContribution.ts — Sprint 20 PR-F2.
 *
 * "Extra concessional super contribution" rank-move model. Considers:
 *   - Pre-tax contribution → 15% super contributions tax (vs marginal)
 *   - Compound growth inside super (assumed 7.5%/yr balanced default)
 *   - Illiquidity penalty: locked until preservation age
 */

import type {
  ExtraSuperContributionDef,
  RankedMove,
} from "@/types/canonicalMove";
import {
  composeRankScore,
  deriveConfidence,
  fireDateDeltaFromYears,
  type MoveRankingContext,
} from "../rankMove";

export const SUPER_CONTRIBUTIONS_TAX = 0.15;
export const SUPER_BALANCED_RETURN = 0.075;
export const HORIZON_YEARS = 25;

export function rankExtraSuperContribution(
  ctx: MoveRankingContext,
  params: ExtraSuperContributionDef["params"],
): RankedMove {
  const { household } = ctx;
  const annualExtraPre = params.extraMonthly * 12;
  const taxSaved = annualExtraPre * (params.marginalTaxRate - SUPER_CONTRIBUTIONS_TAX);
  const annualInsideSuper = annualExtraPre * (1 - SUPER_CONTRIBUTIONS_TAX);

  // Future value of a recurring annual contribution at SUPER_BALANCED_RETURN
  // over the 25-year horizon. Standard FV-of-annuity formula.
  const r = SUPER_BALANCED_RETURN;
  const n = HORIZON_YEARS;
  const fv = annualInsideSuper * ((Math.pow(1 + r, n) - 1) / r);

  const expectedNetWorthDelta25y = fv + taxSaved * HORIZON_YEARS;

  // Cashflow impact (now): you take the extra contribution out of net pay.
  // After-tax cost ≈ extraMonthly × (1 − marginalTaxRate).
  const cashFlowImpactMonthly = -params.extraMonthly * (1 - params.marginalTaxRate);

  const nwAnnualGrowthBase = ctx.targetNetWorth * 0.04;
  const fireDateYearsPulled = nwAnnualGrowthBase > 0
    ? Math.max(-3, Math.min(3, expectedNetWorthDelta25y / nwAnnualGrowthBase))
    : 0;

  const leverageDelta = 0;
  const variancePercentile5 = 0.12;
  // Illiquidity scales with years to preservation — short windows are
  // basically liquid; 20+ years out is highly illiquid.
  const illiquidityScore = Math.max(
    20,
    Math.min(95, params.yearsToPreservation * 4),
  );

  const conf = deriveConfidence({
    variancePercentile5,
    assumptionStability: "moderate",
  });

  const rankScore = composeRankScore({
    fireDateYearsPulled,
    netWorthDelta25y: expectedNetWorthDelta25y,
    downsideVariancePercentile5: variancePercentile5,
    illiquidityScore,
    leverageDelta,
  });

  return {
    moveId: "extra_super_contribution",
    expectedFireDateDelta: fireDateDeltaFromYears(fireDateYearsPulled),
    expectedNetWorthDelta25y: Math.round(expectedNetWorthDelta25y),
    cashFlowImpactMonthly: Math.round(cashFlowImpactMonthly),
    downsideRisk: { variancePercentile5, recoveryYears: 4 },
    leverageDelta,
    illiquidityScore,
    confidence: conf.label,
    confidenceRationale: conf.rationale,
    rankScore: Number(rankScore.toFixed(4)),
    rankRationale:
      `Adding $${params.extraMonthly}/mo concessional super shifts ~$${Math.round(taxSaved).toLocaleString()}/yr from ` +
      `${(params.marginalTaxRate * 100).toFixed(0)}% marginal to ${(SUPER_CONTRIBUTIONS_TAX * 100).toFixed(0)}% contributions tax, ` +
      `compounding to ~$${Math.round(expectedNetWorthDelta25y).toLocaleString()} over ${HORIZON_YEARS}y (household NW today $${Math.round(household.currentNetWorth).toLocaleString()}).`,
  };
}
