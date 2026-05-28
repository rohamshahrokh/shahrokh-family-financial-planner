/**
 * moves/sellInvestmentProperty.ts — Sprint 20 PR-F2 Section 4.4.
 *
 * "Sell investment property" rank-move model. Considers:
 *   - Capital gains tax at household marginal rate (50% discount if held >12mo)
 *   - Transaction costs (agent ~2% + conveyancing ~$2,000 fixed)
 *   - Loss of future rental income (negative cashflow benefit)
 *   - Conversion of equity into liquid ETF allocation (positive)
 *   - Leverage reduction (positive on rankScore via `leverageDelta`)
 */

import type { RankedMove, SellInvestmentPropertyDef } from "@/types/canonicalMove";
import { investmentCashflow } from "@/lib/property/cashflow";
import {
  composeRankScore,
  deriveConfidence,
  fireDateDeltaFromYears,
  type MoveRankingContext,
} from "../rankMove";

/** Agent fee % of sale price — Australian convention 2.0% (mid-range). */
export const SELL_AGENT_FEE_RATE = 0.02;
/** Conveyancing + legal — fixed AUD. */
export const SELL_CONVEYANCING_FIXED = 2_000;
/** ETF expected return used to project post-sale equity reallocation. */
export const POST_SALE_ETF_RETURN = 0.075;
/** Years horizon for the NW projection — matches the engine default. */
export const HORIZON_YEARS = 25;

export function rankSellInvestmentProperty(
  ctx: MoveRankingContext,
  params: SellInvestmentPropertyDef["params"],
): RankedMove {
  const { household } = ctx;
  const p = params.property;

  // Transaction costs.
  const agentFee = p.currentValue * SELL_AGENT_FEE_RATE;
  const transactionCosts = agentFee + SELL_CONVEYANCING_FIXED + p.sellingCosts;

  // Capital gain (gross) before CGT — use purchase price as the cost base.
  const grossGain = Math.max(0, p.currentValue - p.purchasePrice - transactionCosts);
  const taxableGain = params.cgtDiscountEligible ? grossGain * 0.5 : grossGain;
  const cgt = taxableGain * params.marginalTaxRate;

  // Net proceeds available to redeploy into ETF.
  const netProceeds = Math.max(0, p.currentValue - p.loanBalance - transactionCosts - cgt);

  // Loss of future rental cashflow (monthly).
  const ipCash = investmentCashflow(p);
  const lostMonthlyCashflow = ipCash.netCashflowMonthly; // can be negative if neg-geared

  // 25-year NW projection of redeploying the net proceeds at ETF return.
  // Conservative undiscounted compound growth (no inflation, no fees).
  const projectedEtfNw = netProceeds * Math.pow(1 + POST_SALE_ETF_RETURN, HORIZON_YEARS);
  // Counterfactual: keeping the property, 25y compounding at IP value's
  // observed capital growth assumption isn't carried in CanonicalProperty
  // (intentionally — we don't want to invent growth numbers); use 4% as a
  // documented baseline for the "kept" branch so we have a like-for-like
  // delta. The 4% is the standard SEQ residential nominal-growth midpoint
  // and is also the SWR — so this is intentionally the same anchor.
  const keptIpValue25y = p.currentValue * Math.pow(1.04, HORIZON_YEARS);
  const keptIpEquity25y = Math.max(0, keptIpValue25y - p.loanBalance);

  // NW delta from selling vs holding (capital side only, before cashflow).
  const capitalNwDelta = projectedEtfNw - keptIpEquity25y;
  // Cashflow side: 25y of foregone rent minus 25y of avoided holding cost.
  // For a negatively-geared IP, lostMonthlyCashflow is negative (a cost we
  // shed by selling), so the cashflow delta is positive.
  const cashflowNwDelta = -lostMonthlyCashflow * 12 * HORIZON_YEARS;
  const expectedNetWorthDelta25y = capitalNwDelta + cashflowNwDelta;

  // FIRE-date delta: an extra $X net worth pulls FIRE earlier proportionally
  // to the (currentNetWorth → targetNetWorth) trajectory. We use a simple
  // linear shift: years pulled earlier ≈ delta / (annual NW growth at SWR).
  // Cap to keep the engine honest about model error.
  const nwAnnualGrowthBase = ctx.targetNetWorth * 0.04; // proxy: 4% of target NW
  const fireDateYearsPulled = nwAnnualGrowthBase > 0
    ? Math.max(-5, Math.min(5, expectedNetWorthDelta25y / nwAnnualGrowthBase))
    : 0;

  // Leverage delta: removing this IP shrinks property loans and value.
  const totalValueBefore = household.totalPpoRValue + household.totalInvestmentPropertyValue;
  const totalLoansBefore = household.totalPpoRLoanBalance + household.totalInvestmentPropertyLoans;
  const totalValueAfter = totalValueBefore - p.currentValue;
  const totalLoansAfter = totalLoansBefore - p.loanBalance;
  const leverageBefore = totalValueBefore > 0 ? totalLoansBefore / totalValueBefore : 0;
  const leverageAfter = totalValueAfter > 0 ? totalLoansAfter / totalValueAfter : 0;
  const leverageDelta = leverageAfter - leverageBefore; // negative = good

  // Downside variance + illiquidity: selling reduces concentration risk;
  // post-sale ETF allocation is liquid. Variance modest because the sale
  // itself is a one-shot event with known proceeds.
  const variancePercentile5 = 0.08;
  const illiquidityScore = 15;

  const conf = deriveConfidence({
    variancePercentile5,
    assumptionStability: "moderate",
  });

  const rankScore = composeRankScore({
    fireDateYearsPulled,
    netWorthDelta25y: expectedNetWorthDelta25y,
    downsideVariancePercentile5: variancePercentile5,
    illiquidityScore,
    leverageDelta, // negative leverageDelta zero-penalty after dead-band
  });

  return {
    moveId: "sell_investment_property",
    expectedFireDateDelta: fireDateDeltaFromYears(fireDateYearsPulled),
    expectedNetWorthDelta25y: Math.round(expectedNetWorthDelta25y),
    cashFlowImpactMonthly: -Math.round(lostMonthlyCashflow),
    downsideRisk: { variancePercentile5, recoveryYears: 2 },
    leverageDelta: Number(leverageDelta.toFixed(4)),
    illiquidityScore,
    confidence: conf.label,
    confidenceRationale: conf.rationale,
    rankScore: Number(rankScore.toFixed(4)),
    rankRationale:
      `Selling ${p.name || "this investment property"} converts ~$${Math.round(netProceeds).toLocaleString()} of equity into liquid ETF (post-CGT, post-costs), ` +
      `reduces property leverage by ${(Math.abs(leverageDelta) * 100).toFixed(1)} pp, and removes ` +
      `${lostMonthlyCashflow >= 0 ? `~$${Math.round(lostMonthlyCashflow)}/mo of net rent` : `~$${Math.round(-lostMonthlyCashflow)}/mo of cashflow drag`}.`,
  };
}
