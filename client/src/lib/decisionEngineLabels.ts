/**
 * decisionEngineLabels.ts — Single source of truth for plain-English UX labels.
 *
 * Maps the Decision Engine's INTERNAL technical names (used by the engine,
 * scoring math, types, and analytics) to BEGINNER-FRIENDLY labels shown in
 * the UI. Advanced names are preserved inside tooltips and the Help Center.
 *
 * This is a UX-only mapping. NO engine logic is affected — the engine still
 * stores and computes `survivalProbability`, `riskAdjustedReturn`, etc. We
 * just rename them at the presentation layer.
 *
 * Help Center sections + topic anchors continue to use the engine's
 * internal names so deep-links stay stable. The "advanced" label is what
 * appears inside the tooltip + Help article header.
 */

export interface DecisionLabel {
  /** Beginner-friendly headline (UI default). */
  simple: string;
  /** Optional one-line subtitle that appears under the simple label. */
  subtitle?: string;
  /** Original/advanced/quant name preserved for the tooltip + Help section. */
  advanced: string;
  /** Plain-English one-liner shown in tooltips and Help. */
  plainEnglish: string;
}

// ──────────────────────────────────────────────────────────────────
// Risk & return metrics
// ──────────────────────────────────────────────────────────────────
export const METRIC_LABELS: Record<string, DecisionLabel> = {
  survivalProbability: {
    simple: "Survival",
    subtitle: "Plans that don't run out of money",
    advanced: "Survival probability",
    plainEnglish:
      "Out of every 100 simulated futures, how many never hit zero cash or default. Higher is better.",
  },
  liquidityFactor: {
    simple: "Cash buffer",
    subtitle: "How safe your cashflow stays",
    advanced: "Liquidity factor",
    plainEnglish:
      "Months of expenses you can cover during the worst stretch. 1.0 = you always have at least one month buffered.",
  },
  riskAdjustedReturn: {
    simple: "Long-term growth",
    subtitle: "Growth after adjusting for risk",
    advanced: "Risk-adjusted CAGR",
    plainEnglish:
      "Compound annual growth rate, penalised for how bumpy the path was. Smooth + strong returns score highest.",
  },
  terminalNetWorth: {
    simple: "Wealth at finish",
    subtitle: "Projected wealth at end of horizon",
    advanced: "Terminal Net Worth (P50)",
    plainEnglish:
      "Your median projected wealth at the end of the horizon. Half of simulations end above this, half below.",
  },
  valueAtRisk: {
    simple: "Worst-case loss (1-in-20)",
    subtitle: "How bad a bad outcome looks",
    advanced: "Value at Risk (VaR 95%)",
    plainEnglish:
      "In the worst 5% of futures, your wealth could drop by this much. A floor that the bottom rare cases sit at.",
  },
  conditionalValueAtRisk: {
    simple: "Average bad-case loss",
    subtitle: "How deep the bad tail goes",
    advanced: "Conditional VaR (CVaR 95%)",
    plainEnglish:
      "Average loss across the worst 5% of futures. Goes deeper than VaR — captures how painful the painful cases really are.",
  },
  netServiceabilityRatio: {
    simple: "Cashflow safety",
    subtitle: "Income vs. loan repayments",
    advanced: "Net Serviceability Ratio (NSR)",
    plainEnglish:
      "How much of your serviceable income is consumed by loan repayments. 1.0 = breakeven. Above 1.0 = comfortable buffer.",
  },
  drawdown: {
    simple: "Biggest dip",
    subtitle: "Largest temporary fall in wealth",
    advanced: "Maximum drawdown",
    plainEnglish:
      "The biggest peak-to-trough fall in your net worth at any point along the path. Captures the worst bumpy stretch.",
  },
  refinancePressure: {
    simple: "Refinance risk",
    subtitle: "Pressure when loans renew",
    advanced: "Refinance pressure",
    plainEnglish:
      "When fixed-rate loans roll off, do your repayments still fit your income? Higher means more vulnerable to rate shocks.",
  },
  insolvencyRisk: {
    simple: "Default risk",
    subtitle: "Chance of running out of cash",
    advanced: "Insolvency / default probability",
    plainEnglish:
      "Probability of failing to cover repayments at some point in the horizon. Engine hard ceiling is 40%.",
  },
  fireAcceleration: {
    simple: "Path to financial freedom",
    subtitle: "Years to FIRE",
    advanced: "FIRE acceleration",
    plainEnglish:
      "How many years until your investments can sustain your lifestyle without working. Lower = sooner.",
  },
  percentiles: {
    simple: "Range of outcomes",
    subtitle: "Median, top 10%, bottom 10%",
    advanced: "P10 / P50 / P90 percentiles",
    plainEnglish:
      "P50 = typical outcome. P90 = top 10% best-case. P10 = bottom 10% worst-case. The gap shows the range of possibilities.",
  },
};

// ──────────────────────────────────────────────────────────────────
// Multi-winner lenses — re-scored under different priorities
// ──────────────────────────────────────────────────────────────────
export const LENS_LABELS: Record<string, DecisionLabel & { whyThisWon: string }> = {
  balanced: {
    simple: "Best overall balance",
    subtitle: "Engine default — well-rounded pick",
    advanced: "Best balanced",
    plainEnglish:
      "The path that scores highest under the engine's default weights — a sensible blend of safety, growth, and cashflow.",
    whyThisWon:
      "Wins when no single dimension dominates — solid survival, steady growth, manageable cashflow.",
  },
  wealthMax: {
    simple: "Highest long-term wealth",
    subtitle: "Best for growing total net worth",
    advanced: "Best wealth-max",
    plainEnglish:
      "The path with the largest projected wealth at the end of your horizon. Prioritises growth above all else.",
    whyThisWon:
      "Wins when you're willing to ride out bigger bumps for the largest finish-line wealth.",
  },
  cashflowSafe: {
    simple: "Safest monthly cashflow",
    subtitle: "Best for everyday comfort",
    advanced: "Best cashflow-safe",
    plainEnglish:
      "The path that keeps your month-to-month cashflow most comfortable — strong serviceability + liquidity.",
    whyThisWon:
      "Wins when sleep-at-night matters more than maximum wealth. Lower stress, smaller surprises.",
  },
  highRisk: {
    simple: "Highest growth (high risk)",
    subtitle: "Aggressive path with bigger swings",
    advanced: "Best high-risk",
    plainEnglish:
      "The path with the highest growth potential under aggressive risk settings. Bigger upside, bigger swings.",
    whyThisWon:
      "Wins when you're explicitly comfortable with concentration and volatility for outsized growth.",
  },
};

// ──────────────────────────────────────────────────────────────────
// Scenario assumptions — simplified wording + "what changes if selected"
// ──────────────────────────────────────────────────────────────────
export interface AssumptionLabel extends DecisionLabel {
  /** What changes in the engine when this is selected, in plain English. */
  whatChanges: string;
  /** When this is a good choice for the user. */
  whenToUse: string;
}

export const ASSUMPTION_LABELS: Record<string, AssumptionLabel> = {
  autoDetect: {
    simple: "Use today's rules (smart default)",
    subtitle: "Recommended for most people",
    advanced: "Smart auto-detect",
    plainEnglish:
      "The engine picks the most realistic tax/policy rules based on your portfolio — typically today's rules unless your data suggests otherwise.",
    whatChanges:
      "Engine inspects your property build dates, ownership history, and current tax filings to decide which regime applies to each asset.",
    whenToUse:
      "You're not sure which scenario fits — let the engine decide. This is the safe starting point.",
  },
  currentRules: {
    simple: "Today's tax rules",
    subtitle: "How things work right now",
    advanced: "Current rules (FY 2025-26)",
    plainEnglish:
      "Run everything under the tax rules in effect today: full negative gearing, current marginal brackets, current CGT discount.",
    whatChanges:
      "All rental losses fully deductible against PAYG income; CGT 50% discount on assets held > 12 months; standard franking.",
    whenToUse:
      "You want to plan based on the world as it exists today — no future legislation factored in.",
  },
  proposed2027Reform: {
    simple: "Future tax-change scenario (experimental)",
    subtitle: "Hypothetical 2027 reform",
    advanced: "Proposed 2027 reform",
    plainEnglish:
      "Models a hypothetical reform package: negative gearing limited to new builds, narrower CGT discount, tighter franking. NOT current law.",
    whatChanges:
      "Established-property rental losses quarantined (no PAYG offset); new-builds keep full deductibility; CGT discount tightened post-cutoff.",
    whenToUse:
      "You want to stress-test your plan against a potential future where negative gearing is restricted.",
  },
  customWhatIf: {
    simple: "Custom what-if",
    subtitle: "Set your own assumptions",
    advanced: "Custom what-if",
    plainEnglish:
      "Build your own assumption set — pick which rules apply, adjust thresholds, model your own policy ideas.",
    whatChanges:
      "Each rule is selectable: NG enabled/disabled, CGT discount %, franking enabled, regime cutover dates. Hard floors still enforced.",
    whenToUse:
      "You're modelling a specific policy idea or stress-testing a custom scenario.",
  },
};

// ──────────────────────────────────────────────────────────────────
// Risk control modes — softer plain-English versions
// ──────────────────────────────────────────────────────────────────
export const RISK_MODE_LABELS: Record<string, AssumptionLabel> = {
  conservative: {
    simple: "Safety first",
    subtitle: "Tight risk limits, no high-risk paths shown",
    advanced: "Conservative",
    plainEnglish:
      "Engine only shows paths that pass tight safety rules. No paths with high concentration, high LVR, or high default risk.",
    whatChanges:
      "Max LVR 75%, minimum serviceability 1.00, default probability cap 10%. Risky paths are filtered out entirely.",
    whenToUse:
      "You want a curated list of only the safest sensible paths.",
  },
  balanced: {
    simple: "Balanced (recommended)",
    subtitle: "Engine default, realistic limits",
    advanced: "Balanced",
    plainEnglish:
      "Engine default. Standard risk limits — paths beyond these are flagged but not hidden.",
    whatChanges:
      "Max LVR 85%, minimum serviceability 0.85, default probability cap 20%.",
    whenToUse:
      "You want the engine's full default behaviour — the recommended starting point.",
  },
  aggressive: {
    simple: "Show me everything",
    subtitle: "Looser limits, high-risk paths shown with warnings",
    advanced: "Aggressive",
    plainEnglish:
      "Wider risk envelope — high-concentration and high-LVR paths surface with explicit warnings instead of being filtered.",
    whatChanges:
      "Minimum serviceability 0.75, default cap 30%, crypto allocation up to 50%. High-risk paths shown with explicit penalties.",
    whenToUse:
      "You want to see every option the engine can generate, including the high-risk ones.",
  },
  custom: {
    simple: "Custom limits",
    subtitle: "Set your own risk thresholds",
    advanced: "Custom",
    plainEnglish:
      "Explicitly set LVR ceiling, serviceability floor, default cap, and concentration limits.",
    whatChanges:
      "You define each threshold. Hard floors still enforced (LVR ≤ 85%, default ≤ 40%, NSR ≥ 0.70).",
    whenToUse:
      "You know exactly which risk limits you want to apply.",
  },
};
