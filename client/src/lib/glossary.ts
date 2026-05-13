/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  GLOSSARY — plain-English definitions for technical terms used across the
 *  Family Wealth Lab Decision Engine UI.
 *
 *  Used by <InfoTooltip term="…" /> to render a small "i" icon + popover.
 *  Keep entries SHORT, MOBILE-FRIENDLY, and ideally include a quick example.
 *  No academic jargon. No long paragraphs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GlossaryEntry {
  /** Display title shown at the top of the popover (usually = key). */
  title: string;
  /** One-liner shown right under the title. */
  short: string;
  /** Optional concrete example to anchor intuition. */
  example?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── Risk metrics ────────────────────────────────────────────────────────
  CVaR: {
    title: "CVaR (Conditional Value at Risk)",
    short:
      "The average loss in the worst 5% of outcomes. A pessimistic 'how bad could it really get' number.",
    example: "CVaR95 of −$120k = in the worst 5% of paths, you'd lose $120k on average.",
  },
  VaR: {
    title: "VaR (Value at Risk)",
    short:
      "A loss threshold the portfolio is unlikely to exceed at a given confidence level.",
    example: "VaR95 of −$80k = there's a 95% chance you won't lose more than $80k.",
  },
  NSR: {
    title: "NSR (Net Servicing Ratio)",
    short:
      "How comfortably your income covers loan repayments. Above 1.0 means you have a buffer.",
    example: "NSR 0.85 = your repayments use 85% of available serviceability — tight.",
  },
  LVR: {
    title: "LVR (Loan-to-Value Ratio)",
    short:
      "How much of a property's value is borrowed. Lower LVR = safer, lower bank risk.",
    example: "LVR 80% on a $800k property = $640k loan, $160k equity.",
  },
  DSR: {
    title: "DSR (Debt Service Ratio)",
    short:
      "Share of monthly income going to debt payments. Banks watch this closely.",
    example: "DSR 35% means 35¢ of every dollar earned services debt.",
  },
  CAGR: {
    title: "CAGR (Compound Annual Growth Rate)",
    short:
      "The smoothed average yearly return that would grow your money to its final value.",
    example: "$100k → $200k over 10 years ≈ 7.2% CAGR.",
  },
  "Risk-adjusted return": {
    title: "Risk-adjusted return",
    short:
      "Return per unit of risk taken. Two paths can both grow 8%/yr, but one with steadier returns scores higher.",
    example: "Two paths grow to $1M — the one with smaller swings is risk-adjusted better.",
  },
  "Terminal net worth": {
    title: "Terminal net worth",
    short:
      "Your projected net worth at the end of the planning horizon (e.g., 20 years out).",
  },

  // ── Percentiles & path stats ────────────────────────────────────────────
  P50: {
    title: "P50 — the median outcome",
    short:
      "The middle path. Half the simulations end above, half below. Think 'typical case'.",
    example: "P50 net worth $1.2M = the median of 500 simulated paths.",
  },
  P10: {
    title: "P10 — a downside path",
    short:
      "Only 10% of simulations end worse than this. A reasonable 'bad but not catastrophic' case.",
  },
  P90: {
    title: "P90 — an upside path",
    short:
      "Only 10% of simulations end better than this. The 'lucky but plausible' case.",
  },
  P5: {
    title: "P5 — a severe downside path",
    short:
      "Only 5% of simulations end worse. A pessimistic stress case.",
  },
  P95: {
    title: "P95 — a strong upside path",
    short:
      "Only 5% of simulations end better. An optimistic case.",
  },
  "Survival probability": {
    title: "Survival probability",
    short:
      "Share of simulated paths where you never run out of cash before the horizon.",
    example: "92% survival = in 92 of 100 simulations, you stayed solvent.",
  },
  "Liquidity factor": {
    title: "Liquidity factor",
    short:
      "How easily you can convert assets to cash. Cash & ETFs are highly liquid; property is not.",
    example: "0.80 = strong liquidity buffer. 0.30 = mostly tied up.",
  },
  "Max drawdown": {
    title: "Max drawdown",
    short:
      "The biggest peak-to-trough fall in net worth across the path.",
    example: "Drawdown 35% means net worth dropped 35% from its peak before recovering.",
  },
  Insolvency: {
    title: "Insolvency",
    short:
      "Cash and liquid assets hit zero — you can't cover essential outgoings.",
  },
  "Liquidity exhaustion": {
    title: "Liquidity exhaustion",
    short:
      "Running out of readily available cash to absorb a shock, even if total net worth is still positive.",
  },
  "Refi pressure": {
    title: "Refi pressure",
    short:
      "Probability your loan won't pass refinance checks (LVR/NSR limits) when banks reassess.",
  },

  // ── Visualisations ──────────────────────────────────────────────────────
  "Wealth-path fan": {
    title: "Wealth-path fan chart",
    short:
      "A 'cone of futures' — the spread of net worth across all simulations over time. Wider cone = more uncertainty.",
  },
  "Score waterfall": {
    title: "Score waterfall",
    short:
      "Step-by-step breakdown of how each factor (survival, growth, FIRE speed, tax) added or subtracted points from the overall score.",
  },

  // ── Methods ─────────────────────────────────────────────────────────────
  "Monte Carlo": {
    title: "Monte Carlo simulation",
    short:
      "Instead of one guess, the engine runs 500 randomised future paths and looks at the full range of outcomes.",
    example: "500 simulations of the next 20 years, each with different luck.",
  },
  "Deterministic math": {
    title: "Deterministic math",
    short:
      "Single-path math using fixed assumptions — no randomness. Faster, but ignores uncertainty.",
  },

  // ── Concepts ────────────────────────────────────────────────────────────
  FIRE: {
    title: "FIRE (Financial Independence, Retire Early)",
    short:
      "Reaching the point where investment income can cover living expenses indefinitely.",
    example: "FIRE in 12 years = you could stop working in 12 years if you wanted.",
  },
  DCA: {
    title: "DCA (Dollar-Cost Averaging)",
    short:
      "Investing a fixed amount on a regular schedule instead of all at once. Smooths out timing risk.",
    example: "$2k/month into an ETF, every month, regardless of price.",
  },
  ETF: {
    title: "ETF (Exchange-Traded Fund)",
    short:
      "A basket of shares you buy as a single ticker. Low-fee, diversified, easy to sell.",
    example: "VAS (Aussie shares), VGS (global shares).",
  },
  Offset: {
    title: "Offset account",
    short:
      "A linked savings account that reduces interest on your mortgage by the balance held — without locking the money up.",
    example: "$50k in offset against a $500k loan = interest charged on $450k.",
  },
  "Risk control mode": {
    title: "Risk control mode",
    short:
      "How strict the engine is about borrowing, leverage, and crypto. Conservative = tight caps. Aggressive = looser caps.",
  },
};

/** Lookup helper — case-insensitive, falls back to undefined. */
export function lookupGlossary(term: string): GlossaryEntry | undefined {
  if (GLOSSARY[term]) return GLOSSARY[term];
  const key = Object.keys(GLOSSARY).find(
    (k) => k.toLowerCase() === term.toLowerCase(),
  );
  return key ? GLOSSARY[key] : undefined;
}
