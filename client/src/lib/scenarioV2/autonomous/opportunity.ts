/**
 * PART 4 — Opportunity Window Detection.
 *
 * Detects deterministic opportunity signals from current engine state plus
 * optional history. Each opportunity records its driver fields, suggested
 * action, and (when safe) a quantified hint. Never invents prices or rates.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type { OpportunityKind, OpportunityWindow, MacroRegime, RegimeClassification, LedgerSnapshot } from "./types";

export interface OpportunityInput {
  winner: RankedCandidate;
  baseline: ExtendedScenarioResult;
  regime: RegimeClassification;
  history?: LedgerSnapshot[];
  /** Liquidity floor (months of expenses). Default 6. */
  liquidityFloorMonths?: number;
  /** Floor monthly-expenses estimate; default $6,000 if no history. */
  monthlyExpensesEstimate?: number;
  /** Concessional super cap headroom signal — optional caller-supplied. */
  superHeadroom?: number;
}

function opp(
  id: string,
  kind: OpportunityKind,
  title: string,
  body: string,
  suggestedAction: string,
  drivers: string[],
  severity: OpportunityWindow["severity"] = "info",
  quant?: OpportunityWindow["quant"],
): OpportunityWindow {
  return { id, kind, title, body, suggestedAction, drivers, severity, quant };
}

export function detectOpportunities(input: OpportunityInput): OpportunityWindow[] {
  const { winner, baseline, regime, history = [] } = input;
  const liquidityFloorMonths = input.liquidityFloorMonths ?? 6;
  const monthlyExpenses = input.monthlyExpensesEstimate
    ?? history[history.length - 1]?.monthlyExpenses
    ?? 6_000;
  const liquidityFloor$ = liquidityFloorMonths * monthlyExpenses;
  const lastSnap = history[history.length - 1] ?? null;
  const out: OpportunityWindow[] = [];

  // ── Idle liquidity inefficiency
  if (lastSnap && lastSnap.liquidCash > liquidityFloor$ * 1.15) {
    const excess = lastSnap.liquidCash - liquidityFloor$;
    out.push(
      opp(
        "opp-idle-liquidity",
        "idle-liquidity",
        "Excess idle cash above safety profile",
        `Liquid balance of $${Math.round(lastSnap.liquidCash).toLocaleString("en-AU")} is materially above your selected ${liquidityFloorMonths}-month floor (~$${Math.round(liquidityFloor$).toLocaleString("en-AU")}). Excess liquidity is producing real-after-inflation drag.`,
        "Consider redirecting the excess to productive assets (offset top-up, ETF DCA, or super contribution) consistent with your investor profile.",
        ["history.liquidCash", "config.liquidityFloorMonths"],
        "info",
        { label: "Excess above floor", value: Math.round(excess), unit: "$" },
      ),
    );
  }

  // ── Refinance window (regime + low refinance pressure)
  if (regime.regime === "falling-rates" && (baseline.refinancePressureProbability ?? 0) < 0.30) {
    out.push(
      opp(
        "opp-refinance-window",
        "refinance-window",
        "Refinance window is open",
        "Falling-rate regime combined with low modelled refinance pressure suggests current borrowing terms can likely be improved.",
        "Compare current mortgage rate with market offers; budget for fees and break costs before switching.",
        ["regime.regime", "baseline.refinancePressureProbability"],
        "info",
      ),
    );
  }

  // ── Attractive entry on drawdowns
  if (regime.regime === "equity-bear-market") {
    out.push(
      opp(
        "opp-attractive-entry",
        "attractive-entry",
        "Drawdown improves long-run DCA efficiency",
        "Sustained equity drawdown improves the expected internal rate of return on consistent DCA over your horizon, all else equal.",
        "Maintain (do not pause) ETF DCA; reduce timing temptation by automating contributions.",
        ["regime.regime"],
        "info",
      ),
    );
  }

  // ── Debt restructure under stress
  if ((baseline.refinancePressureProbability ?? 0) >= 0.30 && (baseline.defaultProbability ?? 0) < 0.15) {
    out.push(
      opp(
        "opp-debt-restructure",
        "debt-restructure",
        "Debt restructure opportunity",
        "Refinance pressure is elevated yet default probability remains controlled — a debt restructure (split, fix portion, or extend term) can reduce serviceability strain without forcing a sale.",
        "Explore part-fixing, term extension, or interest-only on investment loans where appropriate.",
        ["baseline.refinancePressureProbability", "baseline.defaultProbability"],
        "watch",
      ),
    );
  }

  // ── Rebalance opportunity (concentration high but defaults controlled)
  if ((baseline.riskMetrics?.concentrationRisk ?? 0) >= 0.65 && (baseline.defaultProbability ?? 0) < 0.10) {
    out.push(
      opp(
        "opp-rebalance",
        "rebalance-window",
        "Rebalance reduces concentration drag",
        `Concentration index of ${(baseline.riskMetrics!.concentrationRisk * 100).toFixed(0)}% increases sequence risk without materially raising expected return.`,
        "Plan a phased rebalance toward your preferred allocation — favour CGT-aware timing where possible.",
        ["baseline.riskMetrics.concentrationRisk"],
        "watch",
      ),
    );
  }

  // ── Super contribution
  if ((input.superHeadroom ?? 0) > 0) {
    out.push(
      opp(
        "opp-super",
        "super-contribution",
        "Concessional super headroom available",
        `Approximately $${Math.round(input.superHeadroom!).toLocaleString("en-AU")} of concessional headroom remains for this FY under current caps.`,
        "Consider salary-sacrifice or personal deductible contributions before EOFY where cashflow supports.",
        ["input.superHeadroom"],
        "info",
        { label: "Concessional headroom", value: Math.round(input.superHeadroom!), unit: "$" },
      ),
    );
  }

  // ── Tax optimisation window (winner narrative hints at tax-aware paths)
  if (/tax|deduct|offset|salary sacrifice|cgt/i.test(winner.label)) {
    out.push(
      opp(
        "opp-tax",
        "tax-optimisation",
        "Tax-aware path available",
        `The winning path "${winner.label}" carries tax-aware structure that can compound benefits before EOFY.`,
        "Review timing of deductible contributions, interest, and disposal events to maximise after-tax outcome.",
        ["winner.label"],
        "info",
      ),
    );
  }

  return out;
}
