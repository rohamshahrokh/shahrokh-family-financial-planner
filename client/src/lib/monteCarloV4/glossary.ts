/**
 * glossary.ts — Phase J: Assumption Explainability
 *
 * Plain-English explanation entries for every advanced assumption surfaced in
 * the V4 UI. Each entry includes: a short label, a one-line description,
 * an extended tooltip, example numbers, why it matters, and the practical
 * meaning of higher vs lower values.
 *
 * The UI reads from this glossary via `getAssumptionExplanation(key)`. Keys
 * are stable identifiers tied to controls / displayed metrics.
 */

export interface AssumptionExplanation {
  key: string;
  label: string;
  short: string;
  tooltip: string;
  example: string;
  whyItMatters: string;
  higherMeans: string;
  lowerMeans: string;
}

export const ASSUMPTION_GLOSSARY: Record<string, AssumptionExplanation> = {
  nsr: {
    key: "nsr",
    label: "Net Savings Rate",
    short: "Share of income left after expenses + debt service.",
    tooltip: "Net Savings Rate (NSR) is the share of monthly income remaining after living expenses and minimum debt service. It's the fuel for compounding and the buffer against shocks.",
    example: "If you earn $20,000/mo and spend $14,000 (including debt), your NSR is 30%.",
    whyItMatters: "NSR is the single biggest controllable lever in long-run wealth. Doubling NSR roughly halves time-to-FIRE.",
    higherMeans: "Faster compounding, more shock absorption, earlier FIRE.",
    lowerMeans: "Slower compounding, fragile to surprise expenses.",
  },
  dsr: {
    key: "dsr",
    label: "Debt Service Ratio",
    short: "% of gross income going to debt repayments.",
    tooltip: "DSR is monthly mortgage + investment loan repayments divided by monthly gross income. Banks typically refinance up to 45%; >40% is stressed.",
    example: "Repayments $9,000/mo on income $20,000/mo = DSR 45%.",
    whyItMatters: "Drives refinance risk and the fragility of cashflow to rate shocks.",
    higherMeans: "Greater refinance risk, less flexibility to invest, more sensitivity to RBA cycles.",
    lowerMeans: "More cashflow room for DCA, lower refinance risk, calmer planning.",
  },
  volatility: {
    key: "volatility",
    label: "Volatility (σ)",
    short: "Standard deviation of an asset's annual return.",
    tooltip: "Volatility is the annualised standard deviation of an asset's returns. Higher volatility means a wider spread of outcomes — both upside and downside.",
    example: "Stocks σ=18% means about a 2/3 chance returns land within ±18% of the mean.",
    whyItMatters: "Volatility drives outcome dispersion. Two assets with the same mean return can have very different P10/P90 outcomes.",
    higherMeans: "Wider outcome cone — bigger drawdowns AND bigger windfalls.",
    lowerMeans: "Tighter outcome cone, more predictable trajectory.",
  },
  drawdown: {
    key: "drawdown",
    label: "Drawdown",
    short: "Peak-to-trough fall in portfolio value.",
    tooltip: "Drawdown measures the percentage decline from the highest point a portfolio reached. The 'worst drawdown' over a path is a key measure of psychological + financial pain.",
    example: "A portfolio that peaks at $1M and falls to $700k has a 30% drawdown.",
    whyItMatters: "Big drawdowns trigger panic selling, refinance failures, and can permanently impair the wealth trajectory.",
    higherMeans: "More fragility — household exposed to forced-sale scenarios.",
    lowerMeans: "More resilience — household can ride through cycles.",
  },
  var: {
    key: "var",
    label: "Value-at-Risk (VaR)",
    short: "The threshold loss at a given confidence (e.g. 95%).",
    tooltip: "VaR95 means 'there's a 5% chance the outcome will be at least this bad.' VaR is a tail-risk metric used in institutional risk management.",
    example: "If VaR95 of 2035 NW = $800k and median = $2.5M, the worst 5% of paths land at $800k or below.",
    whyItMatters: "Quantifies downside risk you can articulate to a partner or planner.",
    higherMeans: "Higher VaR (i.e., less negative) means lower tail risk.",
    lowerMeans: "More extreme downside in the worst 5% of scenarios.",
  },
  cvar: {
    key: "cvar",
    label: "Conditional VaR / Expected Shortfall",
    short: "Average outcome in the worst-case tail beyond VaR.",
    tooltip: "CVaR95 is the average of the worst 5% of outcomes — not just the threshold, but how bad the tail actually is on average.",
    example: "VaR95 might be -$200k; CVaR95 might be -$420k — meaning the average bad outcome is much worse than the threshold.",
    whyItMatters: "Captures tail severity. Two portfolios with the same VaR can have very different CVaR.",
    higherMeans: "Less severe tail risk (better).",
    lowerMeans: "Heavier left tail — concentration risk likely.",
  },
  confidence_bands: {
    key: "confidence_bands",
    label: "Confidence Bands (P10 / P50 / P90)",
    short: "The 80% probability cone around the projected path.",
    tooltip: "P10/P50/P90 mean the 10th, 50th (median), and 90th percentile outcomes across all simulated paths. The cone between P10 and P90 is the 80% confidence region.",
    example: "P10=$1.2M, P50=$2.5M, P90=$4.2M means 80% of paths land between $1.2M and $4.2M.",
    whyItMatters: "Single-number forecasts hide uncertainty. Cones make the range of possibilities visible.",
    higherMeans: "Wider cone = more uncertainty in the plan.",
    lowerMeans: "Narrower cone = more robust plan.",
  },
  regime_persistence: {
    key: "regime_persistence",
    label: "Regime Persistence",
    short: "Average dwell time of macro regimes (in months).",
    tooltip: "Regimes (e.g. tightening, recession, rate-cut) don't flip month to month. They persist for realistic durations and transition probabilistically. Persistence captures this stickiness.",
    example: "A tightening cycle in this model has mean dwell ~24 months — once it starts, expect it to run for ~2 years.",
    whyItMatters: "If regimes flipped randomly each month, the model would understate household stress during prolonged downturns.",
    higherMeans: "Longer regimes = more impact when bad regimes hit.",
    lowerMeans: "Faster mean-reversion, less concentrated stress.",
  },
  leverage_risk: {
    key: "leverage_risk",
    label: "Leverage Risk",
    short: "Sensitivity of net worth to rate / property shocks driven by debt.",
    tooltip: "Leverage amplifies BOTH returns and losses. Leverage risk measures how much your downside grows with each $1 of additional debt.",
    example: "Two households with $2M NW but one has $1.5M debt vs $300k — the first faces a 3-5x larger downside in a property correction.",
    whyItMatters: "Leverage is the most common cause of financial ruin in Australian households.",
    higherMeans: "More leverage = bigger downside if rates rise or property falls.",
    lowerMeans: "More resilience to macro shocks; slower upside in benign regimes.",
  },
  liquidity_risk: {
    key: "liquidity_risk",
    label: "Liquidity Risk",
    short: "Probability of running out of cash at a critical moment.",
    tooltip: "Liquidity risk is the probability that cash drops below the emergency buffer (or below zero) during the simulation. Forced sales of risk assets to cover shortfalls are extremely costly.",
    example: "If 18% of paths have cash < emergency buffer at some point, your liquidity risk is 18%.",
    whyItMatters: "Liquidity failure is what turns a paper loss into a permanent loss.",
    higherMeans: "Higher probability of forced sales during downturns.",
    lowerMeans: "Strong shock absorption — can ride through.",
  },
};

export function getAssumptionExplanation(key: string): AssumptionExplanation | undefined {
  return ASSUMPTION_GLOSSARY[key];
}
