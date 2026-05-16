/**
 * Strategic Weakest-Link Detection — surfaces the single most fragile
 * point, the dominant risk factor, the acceleration bottleneck, and the
 * constraint blocking FIRE.
 *
 * Reads existing fragility findings + risk metrics. Pure function.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type { FragilityFinding, WeakestLink } from "./types";

export function detectWeakestLink(
  winner: RankedCandidate,
  baseline: ExtendedScenarioResult,
  fragility: FragilityFinding[],
): WeakestLink {
  const m = winner.result.riskMetrics;
  const lev = m?.leverageRisk ?? 0;
  const liq = m?.liquidityRisk ?? 0;
  const conc = m?.concentrationRisk ?? 0;
  const dd = m?.maxDrawdownP90 ?? 0;
  const refi = winner.result.refinancePressureProbability ?? 0;
  const survival = 1 - (winner.result.defaultProbability ?? 0);
  const surplus = baseline.reconciledMonthlySurplus ?? 0;

  // Primary fragility: top weight if any reported.
  const primary = fragility.length > 0
    ? `${fragilityHeadline(fragility[0])}`
    : "No single fragility dominates — the plan is balanced across stress dimensions.";

  // Bottleneck: what limits acceleration.
  let bottleneck = "No material bottleneck — acceleration is rate-limited only by contribution capacity.";
  if (liq >= 0.4 && lev >= 0.4) {
    bottleneck = "Insufficient liquidity relative to leverage — the next strategic move is constrained by cash buffer, not by borrowing capacity.";
  } else if (liq >= 0.45) {
    bottleneck = "Liquidity buffer is the binding constraint — additional growth bets cannot be safely added until the buffer rebuilds.";
  } else if (lev >= 0.6) {
    bottleneck = "Borrowing capacity is exhausted — further leverage breaches APRA-buffered serviceability.";
  } else if (surplus > 0 && surplus < 3000) {
    bottleneck = "Monthly surplus is the bottleneck — there is limited capacity to accelerate the plan without expense compression.";
  }

  // Dominant risk: highest single risk axis.
  const axes: Array<{ label: string; v: number; phrase: string }> = [
    { label: "leverage", v: lev, phrase: "Leverage concentration dominates — a property-price or rate shock is the most material risk." },
    { label: "liquidity", v: liq, phrase: "Liquidity compression dominates — the absence of cash buffer in stress windows is the most material risk." },
    { label: "concentration", v: conc, phrase: "Asset-class concentration dominates — diversification benefit is largely absent." },
    { label: "drawdown", v: dd / 0.6, phrase: "Volatility / drawdown exposure dominates — sequence and behavioural risk are the binding factors." },
    { label: "refinance", v: refi / 0.4, phrase: "Refinance pressure dominates — debt rollover at unfavourable rates is the binding risk." },
  ];
  axes.sort((a, b) => b.v - a.v);
  const dominantRisk = axes[0].v > 0.35 ? axes[0].phrase : "No single risk axis dominates — exposures are diversified across dimensions.";

  // FIRE blocker.
  let fireBlocker: string | null = null;
  const text = `${winner.label} ${winner.id}`.toLowerCase();
  if (lev >= 0.5 && /ppor/.test(text)) {
    fireBlocker = "PPOR debt drag is the dominant FIRE delay — non-deductible repayments consume cashflow that could compound elsewhere.";
  } else if (surplus < 3000 && surplus > 0) {
    fireBlocker = "FIRE delay is primarily caused by limited monthly surplus — accelerating FIRE requires income growth or expense compression, not allocation change.";
  } else if (liq >= 0.45) {
    fireBlocker = "Thin liquidity forces a defensive allocation — releasing the FIRE date requires the buffer to rebuild before higher-growth tilts unlock.";
  } else if (survival < 0.92) {
    fireBlocker = "Survivability constraint binds the FIRE timeline — the strategy can only accelerate by first reducing default probability.";
  }

  return {
    primary,
    bottleneck,
    dominantRisk,
    fireBlocker,
  };
}

function fragilityHeadline(f: FragilityFinding): string {
  switch (f.kind) {
    case "property-growth-dependence":
      return "Plan is mathematically strong but heavily dependent on continued AU property growth.";
    case "dual-income-dependence":
      return "Plan is mathematically strong but behaviourally fragile due to dual-income dependence.";
    case "leverage-dependence":
      return "Plan is mathematically strong but heavily reliant on continued access to leverage.";
    case "concentration":
      return "Plan is mathematically strong but exposed via single-class concentration.";
    case "liquidity-illusion":
      return "Plan reports a healthy headline buffer but compresses after action — a hidden liquidity weakness.";
    case "refinancing-dependency":
      return "Plan is mathematically strong but exposed to refinance and lender-policy risk.";
    case "sequence-risk":
      return "Plan is mathematically strong but exposed to a poor early-cycle return sequence.";
    case "tax-dependency":
      return "Plan is mathematically strong but legislatively exposed to concessional rule change.";
    case "inflation-sensitivity":
      return "Plan is mathematically strong but loses real value under sustained inflation.";
    case "behavioural-fragility":
      return "Plan is mathematically strong but behaviourally fragile under deep mid-cycle drawdowns.";
  }
}
