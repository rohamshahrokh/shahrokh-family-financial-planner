/**
 * Assumptions inventory (audit fix P1.4).
 *
 * Audit defect AS-1 surfaced that the engine's Monte Carlo constants
 * (correlations, jump intensity, Vasicek mean reversion, APRA buffer, etc.)
 * were invisible to the user. `collectAssumptionsUsed` enumerates every
 * assumption the engine touches — both editable rails and locked
 * regulatory/process constants — so the dashboard, decision report, and
 * PDF appendix can render them in a single table.
 *
 * Sourcing rule: read the actual constant from each module wherever
 * possible so the panel cannot drift from the engine.
 */

import { DEFAULT_ASSUMPTIONS } from "./basePlan";
import type { BasePlanAssumptions } from "./types";
import {
  DEFAULT_CORRELATION,
  DEFAULT_RATE_PROCESS,
  DEFAULT_INFLATION_REGIMES,
  CRYPTO_JUMPS,
} from "./stochastic";

export type AssumptionCategory =
  | "Macro"
  | "Property"
  | "Stocks"
  | "Crypto"
  | "Cash"
  | "Debt"
  | "Tax"
  | "Super"
  | "CGT"
  | "MC"
  | "Risk";

export interface AssumptionRow {
  category: AssumptionCategory;
  /** Plain-English assumption name. */
  label: string;
  /** Pre-formatted value (units already in the string — "%", "$", or "1.5/yr"). */
  value: string;
  /** Module the constant lives in (so users can chase it down). */
  source: string;
  /** True when the rail is user-editable on /wealth-strategy. */
  editable: boolean;
  /** Plain-English description of what this assumption drives. */
  impacts: string;
}

const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
const sig = (n: number, d = 2) => n.toFixed(d);

/**
 * Build the full assumption row set. Pass the live `BasePlanAssumptions` so
 * the editable rails reflect the user's current overrides; leave unset to
 * fall back to DEFAULT_ASSUMPTIONS.
 *
 * The 30 rows below cover macro, asset rails, debt + tax brackets, super,
 * CGT, Monte Carlo (correlations + jumps + fat tails + Vasicek + inflation),
 * and risk thresholds (APRA, liquidity floor, concentration cap).
 */
export function collectAssumptionsUsed(
  assumptions?: BasePlanAssumptions,
): AssumptionRow[] {
  const a = assumptions ?? DEFAULT_ASSUMPTIONS;
  const corrSC = DEFAULT_CORRELATION[1][2];
  const corrSP = DEFAULT_CORRELATION[1][0];
  const corrPC = DEFAULT_CORRELATION[0][2];

  return [
    // ── Macro ────────────────────────────────────────────────────────────
    { category: "Macro", label: "Inflation", value: pct(a.inflation), source: "DEFAULT_ASSUMPTIONS",
      editable: true, impacts: "All real returns and CPI-linked expense growth." },
    { category: "Macro", label: "Income growth", value: pct(a.incomeGrowth),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Salary path used by surplus and serviceability." },
    { category: "Macro", label: "Expense growth", value: pct(a.expenseGrowth),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Household expenses growth used by surplus." },
    // ── Property ─────────────────────────────────────────────────────────
    { category: "Property", label: "PPOR growth (mu)", value: pct(a.propertyGrowth),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "PPOR + IP value projection." },
    { category: "Property", label: "PPOR volatility (sigma)", value: pct(a.propertyVol),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Fan-chart width for property NW." },
    { category: "Property", label: "Iran property growth", value: pct(a.propertyGrowth * 0.5),
      source: "tick.ts (haircut)", editable: false,
      impacts: "Overseas property growth — 50% haircut on AU rail (FX + non-correlation)." },
    // ── Stocks ───────────────────────────────────────────────────────────
    { category: "Stocks", label: "Return (mu)", value: pct(a.stockReturn),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "ETF DCA and lump-sum outcomes." },
    { category: "Stocks", label: "Volatility (sigma)", value: pct(a.stockVol),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Tail risk on equity exposure." },
    // ── Crypto ───────────────────────────────────────────────────────────
    { category: "Crypto", label: "Return (mu)", value: pct(a.cryptoReturn),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Crypto DCA outcomes." },
    { category: "Crypto", label: "Volatility (sigma)", value: pct(a.cryptoVol),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Tail risk on crypto exposure." },
    // ── Cash ─────────────────────────────────────────────────────────────
    { category: "Cash", label: "Cash APR", value: pct(a.cashApr),
      source: "DEFAULT_ASSUMPTIONS", editable: true, impacts: "Interest earned on positive cash + offset value." },
    // ── Debt ─────────────────────────────────────────────────────────────
    { category: "Debt", label: "Mortgage rate", value: pct(a.mortgageRate),
      source: "snapshot.mortgage_rate or DEFAULT_ASSUMPTIONS", editable: true,
      impacts: "Repayment + interest on PPOR and IP loans." },
    // ── Tax ──────────────────────────────────────────────────────────────
    { category: "Tax", label: "AU 2025-26 brackets", value: "16/30/37/45%", source: "auTax.ts",
      editable: false, impacts: "After-tax wage income." },
    { category: "Tax", label: "Medicare levy", value: "2.0%", source: "auTax.ts",
      editable: false, impacts: "Withheld from each pay cycle." },
    { category: "Tax", label: "Div 293 threshold", value: "$250,000",
      source: "auTax.ts", editable: false, impacts: "Additional 15% super contribution tax above threshold." },
    // ── Super ────────────────────────────────────────────────────────────
    { category: "Super", label: "SG rate", value: "11.5%",
      source: "auTax.ts (FY25-26)", editable: false, impacts: "Mandatory employer super contribution." },
    { category: "Super", label: "Concessional cap", value: "$30,000",
      source: "auTax.ts", editable: false, impacts: "Salary-sacrifice deductible ceiling." },
    { category: "Super", label: "Preservation age", value: "60",
      source: "auTax.ts", editable: false, impacts: "Super balance is illiquid until reached." },
    { category: "Super", label: "Tax in accumulation", value: "15.0%",
      source: "auTax.ts", editable: false, impacts: "Net super return after fund tax." },
    // ── CGT ──────────────────────────────────────────────────────────────
    { category: "CGT", label: "Discount (>12mo held)", value: "50.0%",
      source: "auTax.ts", editable: false, impacts: "Stocks / crypto / property sale tax." },
    // ── MC ───────────────────────────────────────────────────────────────
    { category: "MC", label: "Distribution", value: "Student-t (nu=5 equity, nu=3 crypto)",
      source: "stochastic.ts", editable: false, impacts: "Fat tails on equity + crypto marginals." },
    { category: "MC", label: "Jump probability", value: `${CRYPTO_JUMPS.lambda.toFixed(1)}/yr`,
      source: "stochastic.ts (CRYPTO_JUMPS)", editable: false, impacts: "Crypto crash frequency in MC." },
    { category: "MC", label: "Jump severity (mean log)", value: pct(CRYPTO_JUMPS.meanLogJump),
      source: "stochastic.ts", editable: false, impacts: "Average crypto jump magnitude (negative bias)." },
    { category: "MC", label: "Correlation: stocks-crypto", value: sig(corrSC, 2),
      source: "stochastic.ts (DEFAULT_CORRELATION)", editable: false, impacts: "Joint downside between stocks and crypto." },
    { category: "MC", label: "Correlation: stocks-property", value: sig(corrSP, 2),
      source: "stochastic.ts", editable: false, impacts: "Joint downside between stocks and property." },
    { category: "MC", label: "Correlation: stocks-rates", value: sig(DEFAULT_CORRELATION[1][3], 2),
      source: "stochastic.ts", editable: false, impacts: "Equity response to rate moves (supports super stocks blend)." },
    { category: "MC", label: "Vasicek mean rate (theta)", value: pct(DEFAULT_RATE_PROCESS.theta),
      source: "stochastic.ts", editable: false, impacts: "Long-run short rate used by Vasicek." },
    { category: "MC", label: "Inflation regimes", value: `${pct(DEFAULT_INFLATION_REGIMES.lowMean)} / ${pct(DEFAULT_INFLATION_REGIMES.highMean)}`,
      source: "stochastic.ts", editable: false, impacts: "Two-state Markov inflation regime model." },
    // ── Risk thresholds ──────────────────────────────────────────────────
    { category: "Risk", label: "APRA buffer", value: "+3.0pp on mortgage rate",
      source: "borrowing.ts", editable: false, impacts: "Stressed NSR + borrowing capacity." },
    { category: "Risk", label: "NSR threshold", value: "0.85",
      source: "borrowing.ts", editable: false, impacts: "Minimum buffered net surplus ratio for serviceability pass." },
    { category: "Risk", label: "Liquidity floor", value: "3 months expenses",
      source: "monteCarlo.ts (liquidityStress)", editable: false, impacts: "Cash-reserve threshold for liquidity stress." },
    { category: "Risk", label: "Concentration cap", value: "80% single asset",
      source: "riskMetrics.ts", editable: false, impacts: "Triggers concentration warning when breached." },
    // Property-correlation (used as additional MC row for completeness).
    { category: "MC", label: "Correlation: property-crypto", value: sig(corrPC, 2),
      source: "stochastic.ts", editable: false, impacts: "Joint downside between property and crypto." },
  ];
}
