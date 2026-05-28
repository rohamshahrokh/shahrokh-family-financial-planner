/**
 * moves/debtRecycling.ts — Sprint 20 PR-F2.
 *
 * "Debt recycling" rank-move model. The household redraws a portion of the
 * PPOR loan into a split deductible facility used to buy income-producing
 * ETFs. The interest on the deductible split is then tax-deductible.
 *
 *   - Tax saving = redrawAmount × interestRate × marginalTaxRate (per year)
 *   - ETF growth on the redraw at expectedReturnAnnual
 *   - Increases gross leverage (debt up, asset up by same amount — leverage
 *     ratio shifts because asset base mix changes)
 */

import type { DebtRecyclingDef, RankedMove } from "@/types/canonicalMove";
import {
  composeRankScore,
  deriveConfidence,
  fireDateDeltaFromYears,
  type MoveRankingContext,
} from "../rankMove";

export const HORIZON_YEARS = 25;

export function rankDebtRecycling(
  ctx: MoveRankingContext,
  params: DebtRecyclingDef["params"],
): RankedMove {
  const { household } = ctx;
  const p = params.pporProperty;

  const interestOnSplit = params.redrawAmount * p.interestRate;
  const annualTaxSaved = interestOnSplit * params.marginalTaxRate;

  // ETF growth on the redraw, compounding for HORIZON_YEARS.
  const etfFv = params.redrawAmount * Math.pow(1 + params.expectedReturnAnnual, HORIZON_YEARS);
  const etfGrowthDelta = etfFv - params.redrawAmount;

  // The redraw itself is a wash on NW at t=0 (debt up = asset up). NW
  // delta over 25 years comes from (a) ETF growth and (b) accumulated
  // after-tax interest saved.
  const expectedNetWorthDelta25y = etfGrowthDelta + annualTaxSaved * HORIZON_YEARS;

  const nwAnnualGrowthBase = ctx.targetNetWorth * 0.04;
  const fireDateYearsPulled = nwAnnualGrowthBase > 0
    ? Math.max(-3, Math.min(3, expectedNetWorthDelta25y / nwAnnualGrowthBase))
    : 0;

  // Leverage delta: gross loans up by redrawAmount, gross property value
  // unchanged. But the new ETF asset sits OUTSIDE property leverage by our
  // definition (property leverage = property loans / property value). The
  // PPOR loan balance is now `loanBalance + redrawAmount` (split-account
  // mechanics; total household property debt rose). For the
  // household-wide debt-to-asset ratio used here, we charge a small
  // leverage increase because total debt rises but the offsetting asset
  // (ETF) is not property.
  const totalValueBefore = household.totalPpoRValue + household.totalInvestmentPropertyValue;
  const totalLoansBefore = household.totalPpoRLoanBalance + household.totalInvestmentPropertyLoans;
  const totalValueAfter = totalValueBefore; // property assets unchanged
  const totalLoansAfter = totalLoansBefore + params.redrawAmount;
  const leverageBefore = totalValueBefore > 0 ? totalLoansBefore / totalValueBefore : 0;
  const leverageAfter = totalValueAfter > 0 ? totalLoansAfter / totalValueAfter : 0;
  const leverageDelta = leverageAfter - leverageBefore;

  const variancePercentile5 = 0.25;
  const illiquidityScore = 30;

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
    moveId: "debt_recycling",
    expectedFireDateDelta: fireDateDeltaFromYears(fireDateYearsPulled),
    expectedNetWorthDelta25y: Math.round(expectedNetWorthDelta25y),
    cashFlowImpactMonthly: Math.round(annualTaxSaved / 12),
    downsideRisk: { variancePercentile5, recoveryYears: 5 },
    leverageDelta: Number(leverageDelta.toFixed(4)),
    illiquidityScore,
    confidence: conf.label,
    confidenceRationale: conf.rationale,
    rankScore: Number(rankScore.toFixed(4)),
    rankRationale:
      `Recycling $${Math.round(params.redrawAmount).toLocaleString()} of PPOR debt into deductible ETF split saves ~$${Math.round(annualTaxSaved).toLocaleString()}/yr ` +
      `in tax at the household's ${(params.marginalTaxRate * 100).toFixed(0)}% marginal rate; ETF compounding adds ~$${Math.round(etfGrowthDelta).toLocaleString()} over ${HORIZON_YEARS}y. ` +
      `Adds ${(Math.abs(leverageDelta) * 100).toFixed(1)} pp to household leverage.`,
  };
}
