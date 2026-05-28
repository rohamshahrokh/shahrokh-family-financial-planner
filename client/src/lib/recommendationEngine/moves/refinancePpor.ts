/**
 * moves/refinancePpor.ts — Sprint 20 PR-F2 Section 4.5.
 *
 * "Refinance PPOR" rank-move model. Considers:
 *   - New interest rate × new loan balance → new monthly interest
 *   - Old monthly interest − new monthly interest = monthly cashflow benefit
 *   - Refinance costs (~$1,500 fixed, document)
 *   - Break costs if fixed-rate (assume $0 for variable-rate)
 *
 * Outcome: small positive cashflow, small positive `expectedNetWorthDelta25y`,
 * low downsideRisk, high confidence.
 */

import type { RankedMove, RefinancePporDef } from "@/types/canonicalMove";
import {
  composeRankScore,
  deriveConfidence,
  fireDateDeltaFromYears,
  type MoveRankingContext,
} from "../rankMove";

export const REFINANCE_DEFAULT_COSTS = 1_500;
export const HORIZON_YEARS = 25;

export function rankRefinancePpor(
  ctx: MoveRankingContext,
  params: RefinancePporDef["params"],
): RankedMove {
  const { household } = ctx;
  const p = params.property;
  if (p.kind !== "ppor") {
    // Defensive: if a non-PPOR is passed in, return a zero-impact result
    // rather than throwing. The page must filter to PPOR moves itself.
    return zeroImpactRefinance(ctx);
  }

  const oldInterestAnnual = p.loanBalance * p.interestRate;
  const newInterestAnnual = p.loanBalance * params.newInterestRate;
  const monthlyBenefit = (oldInterestAnnual - newInterestAnnual) / 12;
  const annualBenefit = oldInterestAnnual - newInterestAnnual;

  // 25-year NW delta — simple multiply (no compounding). The refinance is a
  // recurring saving applied month-to-month; reinvesting the saving would
  // compound, but for the "static" PR-F2 ranking we report the floor.
  const expectedNetWorthDelta25y =
    annualBenefit * HORIZON_YEARS - (params.refinanceCosts || REFINANCE_DEFAULT_COSTS);

  // FIRE-date delta from a small recurring saving — modest by design.
  const nwAnnualGrowthBase = ctx.targetNetWorth * 0.04;
  const fireDateYearsPulled = nwAnnualGrowthBase > 0
    ? Math.max(-2, Math.min(2, expectedNetWorthDelta25y / nwAnnualGrowthBase))
    : 0;

  // Leverage delta — refi doesn't change loans or value (same loan
  // balance, same property). Strictly 0.
  const leverageDelta = 0;

  // Downside variance & illiquidity: trivial. The refi can fail (lender
  // declines) but the monetary downside is the $1,500 cost — small.
  const variancePercentile5 = 0.02;
  const illiquidityScore = 5;

  const conf = deriveConfidence({
    variancePercentile5,
    assumptionStability: "stable",
  });

  const rankScore = composeRankScore({
    fireDateYearsPulled,
    netWorthDelta25y: expectedNetWorthDelta25y,
    downsideVariancePercentile5: variancePercentile5,
    illiquidityScore,
    leverageDelta,
  });

  return {
    moveId: "refinance_ppor",
    expectedFireDateDelta: fireDateDeltaFromYears(fireDateYearsPulled),
    expectedNetWorthDelta25y: Math.round(expectedNetWorthDelta25y),
    cashFlowImpactMonthly: Math.round(monthlyBenefit),
    downsideRisk: { variancePercentile5, recoveryYears: 0 },
    leverageDelta,
    illiquidityScore,
    confidence: conf.label,
    confidenceRationale: conf.rationale,
    rankScore: Number(rankScore.toFixed(4)),
    rankRationale:
      `Refinancing ${p.name || "the PPOR"} from ${(p.interestRate * 100).toFixed(2)}% to ` +
      `${(params.newInterestRate * 100).toFixed(2)}% saves ~$${Math.round(monthlyBenefit)}/mo ` +
      `($${Math.round(annualBenefit).toLocaleString()}/yr) before $${(params.refinanceCosts || REFINANCE_DEFAULT_COSTS).toLocaleString()} refi costs. ` +
      `Household NW: $${Math.round(household.currentNetWorth).toLocaleString()}.`,
  };
}

function zeroImpactRefinance(_ctx: MoveRankingContext): RankedMove {
  const variancePercentile5 = 0;
  const conf = deriveConfidence({ variancePercentile5, assumptionStability: "stable" });
  return {
    moveId: "refinance_ppor",
    expectedFireDateDelta: { years: 0, months: 0 },
    expectedNetWorthDelta25y: 0,
    cashFlowImpactMonthly: 0,
    downsideRisk: { variancePercentile5, recoveryYears: 0 },
    leverageDelta: 0,
    illiquidityScore: 0,
    confidence: conf.label,
    confidenceRationale: conf.rationale,
    rankScore: 0,
    rankRationale: "No PPOR available to refinance — move skipped.",
  };
}
