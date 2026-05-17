/**
 * Opportunity Cost helpers — small, composable functions used by the unified
 * recommendation engine to compare action pairs (debt vs ETF, property vs
 * ETF, cash vs invest, etc).
 *
 * Each helper returns:
 *   - costAvoided / expectedReturn (the upside of the chosen action)
 *   - afterTaxOrRiskAdjusted (where computable)
 *   - volatility flag
 *   - liquidity impact
 *   - confidence band (0-1)
 *
 * No state, no I/O. Used by recommendationEngine.ts.
 */

export interface OpportunityCostOutput {
  /** $/yr saved or earned by choosing this action. */
  expectedAnnualDollar: number;
  /** % expected return assumed. */
  expectedReturnPct: number;
  /** After-tax (or risk-adjusted) annual $ where applicable. */
  afterTaxAnnualDollar?: number;
  /** "Low" / "Med" / "High" volatility tag. */
  volatility: 'Low' | 'Med' | 'High';
  /** Net change to deployable liquidity (negative = locks cash). */
  liquidityDelta: number;
  /** 0-1 confidence band. */
  confidence: number;
  /** Plain English summary. */
  summary: string;
}

// ─── 1. Debt paydown vs ETF investing ────────────────────────────────────────
export function debtVsETF(args: {
  debtAmount: number;
  debtRatePct: number;       // e.g. 17 for 17% APR personal debt
  etfReturnPct: number;      // e.g. 9.5
  marginalTaxRate?: number;  // 0-1 (e.g. 0.325)
}): { paydown: OpportunityCostOutput; etf: OpportunityCostOutput; recommend: 'paydown' | 'etf' | 'either' } {
  const debtRate = args.debtRatePct / 100;
  const etfReturn = args.etfReturnPct / 100;
  const tax = args.marginalTaxRate ?? 0.325;

  const paydown: OpportunityCostOutput = {
    expectedAnnualDollar: args.debtAmount * debtRate,
    expectedReturnPct: args.debtRatePct,
    afterTaxAnnualDollar: args.debtAmount * debtRate, // interest cost avoidance is post-tax already
    volatility: 'Low',
    liquidityDelta: -args.debtAmount, // cash leaves your account
    confidence: 0.95,
    summary: `Paying off ${args.debtAmount.toLocaleString()} at ${args.debtRatePct}% returns a guaranteed ${(args.debtAmount * debtRate).toLocaleString()}/yr.`,
  };

  const etfAfterTax = args.debtAmount * etfReturn * (1 - tax * 0.5); // ~CGT discount approximation
  const etf: OpportunityCostOutput = {
    expectedAnnualDollar: args.debtAmount * etfReturn,
    expectedReturnPct: args.etfReturnPct,
    afterTaxAnnualDollar: etfAfterTax,
    volatility: 'Med',
    liquidityDelta: -args.debtAmount,
    confidence: 0.55,
    summary: `Investing ${args.debtAmount.toLocaleString()} in ETFs at ~${args.etfReturnPct}% expected return (after-tax ≈ ${etfAfterTax.toFixed(0)}/yr) is volatile and not guaranteed.`,
  };

  // Hard rule: if debt rate > expected ETF return AT ALL, paydown wins.
  // Tie threshold is small to avoid flapping.
  const recommend: 'paydown' | 'etf' | 'either' =
    debtRate >= etfReturn ? 'paydown'
    : (etfReturn - debtRate) > 0.03 ? 'etf'
    : 'either';

  return { paydown, etf, recommend };
}

// ─── 2. Property purchase vs ETF DCA ─────────────────────────────────────────
export function propertyVsETF(args: {
  depositAmount: number;
  purchasePrice: number;
  propertyCagrPct: number;
  rentYieldNetPct: number;       // net of vacancy + costs
  etfReturnPct: number;
  liquidityShortfallMonths?: number;  // how many months of buffer is lost
}): { property: OpportunityCostOutput; etf: OpportunityCostOutput; recommend: 'property' | 'etf' | 'either' } {
  const propGrowth = (args.purchasePrice * (args.propertyCagrPct / 100));
  const rentNet    = (args.purchasePrice * (args.rentYieldNetPct / 100));
  const propTotal  = propGrowth + rentNet;

  const property: OpportunityCostOutput = {
    expectedAnnualDollar: propTotal,
    expectedReturnPct: ((propTotal / Math.max(1, args.depositAmount)) * 100),
    volatility: 'Med',
    liquidityDelta: -args.depositAmount,
    confidence: 0.55,
    summary: `Property at ${args.propertyCagrPct}% growth + ${args.rentYieldNetPct}% net yield delivers ~${propTotal.toLocaleString()}/yr but locks ${args.depositAmount.toLocaleString()} of equity.`,
  };

  const etfDollar = args.depositAmount * (args.etfReturnPct / 100);
  const etf: OpportunityCostOutput = {
    expectedAnnualDollar: etfDollar,
    expectedReturnPct: args.etfReturnPct,
    volatility: 'Med',
    liquidityDelta: -args.depositAmount,
    confidence: 0.6,
    summary: `ETF DCA of ${args.depositAmount.toLocaleString()} at ${args.etfReturnPct}% returns ~${etfDollar.toLocaleString()}/yr with full liquidity.`,
  };

  // If a buy creates a material liquidity shortfall, property loses on hard
  // safety grounds — protected by the engine's priority stack as well.
  const liquidityRisk = (args.liquidityShortfallMonths ?? 0) >= 2;
  const recommend: 'property' | 'etf' | 'either' =
    liquidityRisk ? 'etf'
    : (property.expectedAnnualDollar > etf.expectedAnnualDollar * 1.15) ? 'property'
    : (etf.expectedAnnualDollar > property.expectedAnnualDollar * 1.15) ? 'etf'
    : 'either';

  return { property, etf, recommend };
}

// ─── 3. Cash (HISA) vs Invest ────────────────────────────────────────────────
export function cashVsInvest(args: {
  amount: number;
  hisaReturnPct: number;        // e.g. 5
  investReturnPct: number;      // e.g. 9.5
  mortgageOffsetRatePct?: number;  // if mortgage exists
  marginalTaxRate?: number;
}): { hisa: OpportunityCostOutput; offset?: OpportunityCostOutput; invest: OpportunityCostOutput; recommend: 'hisa' | 'offset' | 'invest' } {
  const tax = args.marginalTaxRate ?? 0.325;
  const hisaAfterTax = args.amount * (args.hisaReturnPct / 100) * (1 - tax);

  const hisa: OpportunityCostOutput = {
    expectedAnnualDollar: args.amount * (args.hisaReturnPct / 100),
    expectedReturnPct: args.hisaReturnPct,
    afterTaxAnnualDollar: hisaAfterTax,
    volatility: 'Low',
    liquidityDelta: 0,
    confidence: 0.95,
    summary: `HISA at ${args.hisaReturnPct}% yields ~${hisaAfterTax.toFixed(0)}/yr after tax, full liquidity.`,
  };

  let offset: OpportunityCostOutput | undefined;
  if (args.mortgageOffsetRatePct && args.mortgageOffsetRatePct > 0) {
    const offsetDollar = args.amount * (args.mortgageOffsetRatePct / 100);
    offset = {
      expectedAnnualDollar: offsetDollar,
      expectedReturnPct: args.mortgageOffsetRatePct,
      afterTaxAnnualDollar: offsetDollar, // offset is tax-free
      volatility: 'Low',
      liquidityDelta: 0, // offset remains accessible
      confidence: 0.98,
      summary: `Offset at ${args.mortgageOffsetRatePct}% saves ~${offsetDollar.toFixed(0)}/yr in mortgage interest, tax-free.`,
    };
  }

  const invest: OpportunityCostOutput = {
    expectedAnnualDollar: args.amount * (args.investReturnPct / 100),
    expectedReturnPct: args.investReturnPct,
    afterTaxAnnualDollar: args.amount * (args.investReturnPct / 100) * (1 - tax * 0.5),
    volatility: 'Med',
    liquidityDelta: -args.amount,
    confidence: 0.55,
    summary: `Investing ${args.amount.toLocaleString()} at ${args.investReturnPct}% (after-tax CGT discount applied).`,
  };

  let recommend: 'hisa' | 'offset' | 'invest' = 'hisa';
  const offsetVal = offset?.afterTaxAnnualDollar ?? 0;
  if (offset && offsetVal >= hisa.afterTaxAnnualDollar! && offsetVal >= invest.afterTaxAnnualDollar! - 500) {
    recommend = 'offset';
  } else if (invest.afterTaxAnnualDollar! > Math.max(hisa.afterTaxAnnualDollar!, offsetVal) * 1.5) {
    recommend = 'invest';
  } else {
    recommend = offset ? 'offset' : 'hisa';
  }

  return { hisa, offset, invest, recommend };
}
