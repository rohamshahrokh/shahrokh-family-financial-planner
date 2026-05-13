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
import {
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  BUDGET_NIGHT_CUTOFF_DEFAULT,
  REFORM_START_DATE_DEFAULT,
} from "../taxPolicyEngine";
import { DEFAULT_DECISION_ENGINE_WEIGHTS } from "../taxPolicyEngine/decisionEngineWeights";

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
  | "Risk"
  | "TaxPolicy"
  | "DecisionEngine";

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

    // ── TaxPolicy (P0) ──────────────────────────────────────────────────────────
    // Modelling-only rails for the proposed Australian negative-gearing /
    // CGT reform. All editable so the user can model alternate proposals.
    // Disclaimer: "This is modelling only and not personal tax advice."
    { category: "TaxPolicy", label: "Tax Policy Regime selector",
      value: "Auto-detect (default) │ Current Rules │ Proposed 2027 Reform │ Custom Stress Test",
      source: "taxPolicyEngine/regimes.ts (REGIME_SELECTOR_OPTIONS)", editable: true,
      impacts: "User chooses how each property is evaluated. Current Rules preserves the legacy pipeline; " +
               "Auto-detect applies grandfathering by acquisition date + property type; Reform forces the " +
               "proposed rules; Custom stress test exposes every rail." },
    { category: "TaxPolicy", label: "Auto-detect: missing-data behaviour",
      value: "Fall back to Current Rules + flag for confirmation",
      source: "taxPolicyEngine/autoDetect.ts", editable: false,
      impacts: "When acquisition date or property type is missing, the property keeps current-rules " +
               "treatment and the UI shows ‘Tax treatment unknown — please confirm’." },
    { category: "TaxPolicy", label: "Budget-night cutoff", value: BUDGET_NIGHT_CUTOFF_DEFAULT,
      source: "taxPolicyEngine (BUDGET_NIGHT_CUTOFF_DEFAULT)", editable: true,
      impacts: "Properties acquired on or before this date are grandfathered to current rules." },
    { category: "TaxPolicy", label: "Reform start date", value: REFORM_START_DATE_DEFAULT,
      source: "taxPolicyEngine (REFORM_START_DATE_DEFAULT)", editable: true,
      impacts: "Date the reform regime begins applying to non-grandfathered properties." },
    { category: "TaxPolicy", label: "NG treatment (reform default)",
      value: PROPOSED_2027_REFORM_REGIME.defaultNegativeGearing,
      source: "taxPolicyEngine (PROPOSED_2027_REFORM_REGIME)", editable: true,
      impacts: "How property losses are treated for non-grandfathered established dwellings." },
    { category: "TaxPolicy", label: "CGT method (reform default)",
      value: PROPOSED_2027_REFORM_REGIME.defaultCGTMethod,
      source: "taxPolicyEngine (PROPOSED_2027_REFORM_REGIME)", editable: true,
      impacts: "Method used to compute capital gain on disposal under the reform." },
    { category: "TaxPolicy", label: "CGT discount (current rules)",
      value: pct(CURRENT_RULES_REGIME.defaultCGTDiscountPct),
      source: "taxPolicyEngine (CURRENT_RULES_REGIME)", editable: true,
      impacts: "Discount applied to capital gains held > 12 months under current rules." },
    { category: "TaxPolicy", label: "Indexation rate (INDEXED_COST_BASE)",
      value: pct(PROPOSED_2027_REFORM_REGIME.indexationRate),
      source: "taxPolicyEngine (PROPOSED_2027_REFORM_REGIME)", editable: true,
      impacts: "Annual CPI proxy used to index the cost base when the regime uses INDEXED_COST_BASE." },
    { category: "TaxPolicy", label: "Carve-outs",
      value: "NEW_BUILD, BUILD_TO_RENT, AFFORDABLE_HOUSING",
      source: "taxPolicyEngine/regimes.ts", editable: true,
      impacts: "Property types that keep current rules even under the proposed reform." },

    // ── Decision Engine weights (P0 surface, P2 will fully wire scoring) ──────
    // Spec §14: net worth, FIRE, cashflow survival, liquidity, tax efficiency,
    // downside protection, policy risk penalty.
    { category: "DecisionEngine", label: "Weight: Net worth",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.netWorth, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Drives net-worth contribution to the composite Decision score." },
    { category: "DecisionEngine", label: "Weight: FIRE timing",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.fireTiming, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Drives FIRE-year contribution." },
    { category: "DecisionEngine", label: "Weight: Cashflow survival",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.cashflowSurvival, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Drives months-of-runway contribution." },
    { category: "DecisionEngine", label: "Weight: Liquidity",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.liquidity, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Drives accessible-cash contribution." },
    { category: "DecisionEngine", label: "Weight: Tax efficiency",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.taxEfficiency, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Drives after-tax wealth contribution under the active regime." },
    { category: "DecisionEngine", label: "Weight: Downside protection",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.downsideProtection, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Drives Monte Carlo P10 contribution." },
    { category: "DecisionEngine", label: "Weight: Policy risk penalty",
      value: pct(DEFAULT_DECISION_ENGINE_WEIGHTS.policyRiskPenalty, 0),
      source: "taxPolicyEngine/decisionEngineWeights.ts", editable: true,
      impacts: "Negative weight applied when the plan is highly exposed to reform risk." },
  ];
}
