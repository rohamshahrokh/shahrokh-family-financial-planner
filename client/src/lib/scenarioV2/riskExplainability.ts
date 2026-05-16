/**
 * V3 — Centralised risk-field explainability metadata.
 *
 * Every user-facing risk control or threshold has:
 *   - plain-English explanation
 *   - recommended range
 *   - what increasing it does
 *   - what decreasing it does
 *   - one-line tooltip
 *
 * Components import from here so the same explanation appears everywhere a
 * given risk metric is shown (panel, tooltip, PDF, "Explain" modal). No engine
 * math lives here — only descriptive metadata.
 */

export interface RiskFieldExplainer {
  /** Stable key matching the engine field where possible. */
  id: string;
  /** Plain-English label suitable for non-finance users. */
  label: string;
  /** One-line tooltip (under 140 chars). */
  tooltip: string;
  /** Plain-English explanation, two to three sentences. */
  explanation: string;
  /** Recommended numeric or qualitative range. */
  recommendedRange: string;
  /** What raising this field does to the engine output. */
  whatHigherDoes: string;
  /** What lowering this field does to the engine output. */
  whatLowerDoes: string;
}

export const RISK_FIELD_EXPLAINERS: Record<string, RiskFieldExplainer> = {
  maxDefaultProbability: {
    id: "maxDefaultProbability",
    label: "Max default probability",
    tooltip:
      "Highest acceptable probability that the household runs out of resources within the planning horizon.",
    explanation:
      "Maximum acceptable probability of financial failure across simulations. Paths whose share of insolvent outcomes exceeds this ceiling are rejected before ranking.",
    recommendedRange: "10% (conservative) – 30% (aggressive). Default 20%.",
    whatHigherDoes:
      "Allows more aggressive paths through the safety screen — they may rank higher, but the household tolerates a larger share of failure outcomes.",
    whatLowerDoes:
      "Restricts the engine to paths with very low simulated failure rates. Reduces upside coverage but tightens resilience.",
  },
  minNsrBuffered: {
    id: "minNsrBuffered",
    label: "Min buffered NSR",
    tooltip:
      "Lowest acceptable buffered net-service ratio — how comfortably income covers debt after APRA-style stress.",
    explanation:
      "How safely income covers debt obligations after stress testing. APRA requires lenders to assess at a buffered rate; this floor enforces a similar discipline on recommended paths.",
    recommendedRange: "0.85 (balanced) – 1.00 (conservative). Hard floor: 0.70.",
    whatHigherDoes:
      "Demands more income headroom over debt service. Removes higher-leverage paths from the ranked set.",
    whatLowerDoes:
      "Allows paths where stress-tested servicing is tight. Increases sensitivity to rate or income shocks.",
  },
  maxCryptoSharePct: {
    id: "maxCryptoSharePct",
    label: "Max crypto share",
    tooltip: "Highest acceptable share of the portfolio held in high-volatility digital assets.",
    explanation:
      "Maximum percentage of total investable assets allowed in high-volatility assets. Above this share, crypto paths are filtered out before ranking.",
    recommendedRange: "5% (conservative) – 50% (aggressive). Default 10%.",
    whatHigherDoes:
      "Allows larger crypto allocations. Improves upside paths but increases left-tail dispersion.",
    whatLowerDoes:
      "Restricts crypto to a small position. Reduces volatility but may exclude paths that the household would have accepted.",
  },
  maxLvr: {
    id: "maxLvr",
    label: "Max LVR",
    tooltip: "Maximum loan-to-value ratio allowed across investment-property paths.",
    explanation:
      "Loan-to-value ceiling for any investment-property purchase modelled by the engine. Above this level, the path is treated as a hard reject under the safety screen, regardless of score.",
    recommendedRange: "75% (conservative) – 85% (institutional ceiling).",
    whatHigherDoes:
      "Allows the engine to consider more leveraged property paths. Increases expected wealth but compresses cash-flow buffers and refinance resilience.",
    whatLowerDoes:
      "Restricts property paths to lower-leverage configurations. Reduces refinance and downside-asymmetry risk.",
  },
  maxDsrBand: {
    id: "maxDsrBand",
    label: "Max DSR band",
    tooltip: "Worst allowable debt-service-ratio band before the path is rejected.",
    explanation:
      "Debt-service ratio bands run mild → moderate → stressed → critical. The engine refuses to recommend any path whose median DSR sits in the critical band under stress.",
    recommendedRange: "stressed (institutional default). Never relax to 'critical'.",
    whatHigherDoes:
      "Allows paths with higher debt service. Increases refinance pressure and reduces cash-flow comfort.",
    whatLowerDoes:
      "Restricts paths to lower debt-service positions. Improves cash-flow resilience at the cost of growth upside.",
  },
  maxRefinanceChainsIn24mo: {
    id: "maxRefinanceChainsIn24mo",
    label: "Max refinance chain (24m)",
    tooltip: "Highest number of refinance events the engine will sequence within any 24-month window.",
    explanation:
      "Multiple consecutive refinances within a short window typically signal serviceability stress and operational risk. The engine caps how many such events it permits inside a single 24-month window.",
    recommendedRange: "1 (default). Raise only for highly active portfolios.",
    whatHigherDoes:
      "Permits more rebalancing transactions. Adds operational risk, transaction costs, and dependency on lender appetite.",
    whatLowerDoes:
      "Forces simpler structures. Reduces operational and counterparty risk at the cost of optimisation flexibility.",
  },
  liquidityFloorMonths: {
    id: "liquidityFloorMonths",
    label: "Liquidity floor (months)",
    tooltip: "Months of household expenses that must remain in cash equivalents at all times.",
    explanation:
      "How many months of household expenses must be available as cash or near-cash before the engine considers a path serviceable. The required floor rises with leverage, dependants, and income volatility.",
    recommendedRange: "3 (no leverage) – 12 (leveraged property + dependants).",
    whatHigherDoes:
      "Forces a larger emergency buffer. Reduces forced-sale and refinance risk but may delay capital deployment.",
    whatLowerDoes:
      "Frees more capital for deployment. Increases vulnerability to income shocks or unexpected expenses.",
  },
  maxSingleAssetSharePct: {
    id: "maxSingleAssetSharePct",
    label: "Max single-asset share",
    tooltip: "Largest share of total assets that any single holding may represent.",
    explanation:
      "Concentration ceiling — the largest share of total investable assets allowed in any single asset class. Above this level the safety screen flags concentration risk.",
    recommendedRange: "40% (conservative) – 80% (aggressive). Default 60%.",
    whatHigherDoes:
      "Allows more concentrated bets. Increases upside if the bet is right but increases dispersion of outcomes.",
    whatLowerDoes:
      "Forces broader diversification. Reduces dispersion at the cost of upside from conviction positions.",
  },
  swr: {
    id: "swr",
    label: "Safe withdrawal rate (SWR)",
    tooltip: "Annual withdrawal rate from invested assets assumed sustainable in FIRE.",
    explanation:
      "The annual share of invested assets that the plan assumes can be withdrawn without depleting principal in real terms over the long run. Classic Trinity Study value: 4%.",
    recommendedRange: "3.0% (very conservative) – 4.5% (aggressive). Default 4.0%.",
    whatHigherDoes:
      "Pulls forward the FIRE date because a smaller corpus supports the planned spending. Raises depletion risk.",
    whatLowerDoes:
      "Pushes the FIRE date back. Requires a larger corpus but lowers depletion risk in adverse return sequences.",
  },
  incomeVolatility: {
    id: "incomeVolatility",
    label: "Income volatility",
    tooltip: "How variable the household's income is on a year-to-year basis.",
    explanation:
      "Used by the dynamic liquidity-floor formula. Households with bonus-heavy, contractor, or cyclical income should set this higher so the buffer required to absorb a bad year is more conservative.",
    recommendedRange: "10% (stable salaried) – 30% (contractor/cyclical).",
    whatHigherDoes:
      "Raises the required cash buffer. Reduces vulnerability to income shock at the cost of capital deployment speed.",
    whatLowerDoes:
      "Lowers the required cash buffer. Frees more capital for investment but assumes a steady income stream.",
  },
};

export function listRiskExplainers(): RiskFieldExplainer[] {
  return Object.values(RISK_FIELD_EXPLAINERS);
}

export function getRiskExplainer(id: string): RiskFieldExplainer | null {
  return RISK_FIELD_EXPLAINERS[id] ?? null;
}
