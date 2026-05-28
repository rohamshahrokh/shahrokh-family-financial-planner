/**
 * moves/extraEtfDca.ts — Sprint 20 PR-F2.
 *
 * "Increase ETF DCA" rank-move model. Considers:
 *   - Extra monthly contribution at user-specified expected return
 *   - 25-year FV-of-annuity NW delta
 *   - Liquid (low illiquidity score)
 *   - Moderate downside variance reflecting equity volatility
 */

import type { ExtraEtfDcaDef, RankedMove } from "@/types/canonicalMove";
import {
  composeRankScore,
  deriveConfidence,
  fireDateDeltaFromYears,
  type MoveRankingContext,
} from "../rankMove";

export const HORIZON_YEARS = 25;

export function rankExtraEtfDca(
  ctx: MoveRankingContext,
  params: ExtraEtfDcaDef["params"],
): RankedMove {
  const annualExtra = params.extraMonthly * 12;
  const r = params.expectedReturnAnnual;
  const n = HORIZON_YEARS;
  const fv = r > 0
    ? annualExtra * ((Math.pow(1 + r, n) - 1) / r)
    : annualExtra * n;
  const expectedNetWorthDelta25y = fv;

  const nwAnnualGrowthBase = ctx.targetNetWorth * 0.04;
  const fireDateYearsPulled = nwAnnualGrowthBase > 0
    ? Math.max(-3, Math.min(3, expectedNetWorthDelta25y / nwAnnualGrowthBase))
    : 0;

  const leverageDelta = 0;
  const variancePercentile5 = 0.18;
  const illiquidityScore = 10;

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
    moveId: "extra_etf_dca",
    expectedFireDateDelta: fireDateDeltaFromYears(fireDateYearsPulled),
    expectedNetWorthDelta25y: Math.round(expectedNetWorthDelta25y),
    cashFlowImpactMonthly: -params.extraMonthly,
    downsideRisk: { variancePercentile5, recoveryYears: 3 },
    leverageDelta,
    illiquidityScore,
    confidence: conf.label,
    confidenceRationale: conf.rationale,
    rankScore: Number(rankScore.toFixed(4)),
    rankRationale:
      `Adding $${params.extraMonthly}/mo ETF DCA at ${(r * 100).toFixed(1)}% expected return ` +
      `compounds to ~$${Math.round(fv).toLocaleString()} over ${HORIZON_YEARS}y. Liquid, modest leverage impact, ` +
      `equity-volatility variance applied to downside.`,
  };
}
