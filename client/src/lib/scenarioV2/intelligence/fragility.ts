/**
 * Hidden Fragility Scanner — surfaces concentrated dependencies the
 * top-line numbers obscure.
 *
 * Maps engine metrics → fragility findings. Each finding carries a 0..1
 * `weight` representing how concentrated the dependency is, and a severity
 * band so the UI can sort.
 *
 * Pure function. Reads RankedCandidate + ExtendedScenarioResult + (optional)
 * DashboardInputs derived signals.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type { FragilityFinding, InsightSeverity } from "./types";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function bandFromWeight(weight: number): InsightSeverity {
  if (weight >= 0.75) return "critical";
  if (weight >= 0.55) return "warn";
  if (weight >= 0.35) return "watch";
  return "info";
}

/** Property-growth dependence — derived from concentration + leverage. */
function detectPropertyGrowthDependence(c: RankedCandidate): FragilityFinding | null {
  const conc = c.result.riskMetrics?.concentrationRisk ?? 0;
  const lev = c.result.riskMetrics?.leverageRisk ?? 0;
  if (conc < 0.5 && lev < 0.4) return null;
  const weight = clamp01(0.6 * conc + 0.4 * lev);
  return {
    id: "fr.property-growth",
    kind: "property-growth-dependence",
    description:
      `This plan appears diversified but ~${Math.round(weight * 100)}% of projected net-worth growth comes from leveraged property appreciation. Strategy outcomes are unusually sensitive to AU property CAGR holding above its long-run band.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["riskMetrics.concentrationRisk", "riskMetrics.leverageRisk"],
  };
}

/** Dual-income dependence — heuristic via liquidity risk + leverage. */
function detectDualIncomeDependence(
  c: RankedCandidate,
  baseline: ExtendedScenarioResult,
): FragilityFinding | null {
  const lev = c.result.riskMetrics?.leverageRisk ?? 0;
  const liq = c.result.riskMetrics?.liquidityRisk ?? 0;
  // Households with high leverage AND thin liquidity rely heavily on uninterrupted dual income.
  if (lev < 0.35 && liq < 0.3) return null;
  const weight = clamp01(0.5 * lev + 0.5 * liq);
  return {
    id: "fr.dual-income",
    kind: "dual-income-dependence",
    description:
      `Strategy is highly dependent on uninterrupted dual-income continuity. A 6-month single-income interruption would compress the cash buffer below the safety floor under most simulated paths.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["riskMetrics.leverageRisk", "riskMetrics.liquidityRisk", "reconciledMonthlySurplus"],
  };
}

/** Leverage dependence. */
function detectLeverageDependence(c: RankedCandidate): FragilityFinding | null {
  const lev = c.result.riskMetrics?.leverageRisk ?? 0;
  if (lev < 0.4) return null;
  const weight = clamp01(lev);
  return {
    id: "fr.leverage",
    kind: "leverage-dependence",
    description:
      `Wealth-build depends primarily on borrowed capital. The plan compounds aggressively while rates remain manageable but loses optionality if credit conditions tighten.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["riskMetrics.leverageRisk"],
  };
}

/** Concentration risk. */
function detectConcentration(c: RankedCandidate): FragilityFinding | null {
  const conc = c.result.riskMetrics?.concentrationRisk ?? 0;
  if (conc < 0.45) return null;
  const weight = clamp01(conc);
  return {
    id: "fr.concentration",
    kind: "concentration",
    description:
      `Single asset class accounts for ${Math.round(conc * 100)}% of projected net worth. Diversification benefit erodes meaningfully under any class-specific shock.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["riskMetrics.concentrationRisk"],
  };
}

/** Liquidity illusion — looks healthy now, becomes thin later. */
function detectLiquidityIllusion(
  c: RankedCandidate,
  baseline: ExtendedScenarioResult,
): FragilityFinding | null {
  const liqNow = baseline.riskMetrics?.liquidityRisk ?? 0;
  const liqNew = c.result.riskMetrics?.liquidityRisk ?? 0;
  const delta = liqNew - liqNow;
  if (delta < 0.15) return null;
  const weight = clamp01(0.5 + delta);
  return {
    id: "fr.liquidity-illusion",
    kind: "liquidity-illusion",
    description:
      `Liquidity profile appears healthy today but becomes critically weak after the proposed actions execute — buffer shrinks by ~${Math.round(delta * 100)}pp on the median path.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["baseline.riskMetrics.liquidityRisk", "candidate.riskMetrics.liquidityRisk"],
  };
}

/** Refinancing dependency. */
function detectRefinancingDependency(c: RankedCandidate): FragilityFinding | null {
  const refi = c.result.refinancePressureProbability ?? 0;
  if (refi < 0.12) return null;
  const weight = clamp01(refi / 0.5);
  return {
    id: "fr.refinance",
    kind: "refinancing-dependency",
    description:
      `Plan relies on rolling debt at favourable terms — ${(refi * 100).toFixed(0)}% of paths see elevated refinance pressure that requires lender flexibility to absorb.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["refinancePressureProbability"],
  };
}

/** Sequence risk — heavy front-loaded equity returns required. */
function detectSequenceRisk(c: RankedCandidate): FragilityFinding | null {
  const dd = c.result.riskMetrics?.maxDrawdownMedian ?? 0;
  const text = `${c.label} ${c.id}`.toLowerCase();
  const isEquityHeavy = /etf|crypto|stock|equity|diversif|lump/.test(text);
  if (!isEquityHeavy || dd < 0.12) return null;
  const weight = clamp01(dd / 0.4);
  return {
    id: "fr.sequence",
    kind: "sequence-risk",
    description:
      `FIRE trajectory is highly sensitive to equity-market returns during the first 5 years — a poor early sequence materially delays the wealth-accumulation curve even if long-run averages are met.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["riskMetrics.maxDrawdownMedian", "candidate.allocation"],
  };
}

/** Tax dependency — heavy concessional reliance. */
function detectTaxDependency(c: RankedCandidate): FragilityFinding | null {
  const text = `${c.label} ${c.id}`.toLowerCase();
  if (!/super|conces|salary[ -]sacrifice/.test(text)) return null;
  const weight = 0.45;
  return {
    id: "fr.tax-dependency",
    kind: "tax-dependency",
    description:
      `Strategy outcome depends on the current concessional / preservation rules holding. Legislative change to caps, Div 293, or preservation age would compress the projected after-tax return.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["candidate.allocation.super"],
  };
}

/** Inflation sensitivity — cash-heavy or fixed-income-heavy. */
function detectInflationSensitivity(c: RankedCandidate): FragilityFinding | null {
  const text = `${c.label} ${c.id}`.toLowerCase();
  const cashHeavy = /offset|defer|cash|defensive/.test(text);
  if (!cashHeavy) return null;
  const weight = 0.5;
  return {
    id: "fr.inflation",
    kind: "inflation-sensitivity",
    description:
      `Cash / offset exposure loses real purchasing power in persistent high-inflation regimes — the strategy's nominal returns understate the real-terms drag.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["candidate.allocation.cash"],
  };
}

/** Behavioural fragility — high volatility on a non-tolerant allocation. */
function detectBehaviouralFragility(c: RankedCandidate): FragilityFinding | null {
  const dd = c.result.riskMetrics?.maxDrawdownP90 ?? 0;
  const conc = c.result.riskMetrics?.concentrationRisk ?? 0;
  if (dd < 0.30 && conc < 0.5) return null;
  const weight = clamp01(0.6 * (dd / 0.6) + 0.4 * conc);
  return {
    id: "fr.behavioural",
    kind: "behavioural-fragility",
    description:
      `Mathematically strong but behaviourally demanding — P90 drawdown of ${(dd * 100).toFixed(0)}% combined with concentrated exposure creates real risk of strategy abandonment mid-cycle.`,
    weight,
    severity: bandFromWeight(weight),
    drivers: ["riskMetrics.maxDrawdownP90", "riskMetrics.concentrationRisk"],
  };
}

export function scanFragility(
  winner: RankedCandidate,
  baseline: ExtendedScenarioResult,
): FragilityFinding[] {
  const out: Array<FragilityFinding | null> = [
    detectPropertyGrowthDependence(winner),
    detectDualIncomeDependence(winner, baseline),
    detectLeverageDependence(winner),
    detectConcentration(winner),
    detectLiquidityIllusion(winner, baseline),
    detectRefinancingDependency(winner),
    detectSequenceRisk(winner),
    detectTaxDependency(winner),
    detectInflationSensitivity(winner),
    detectBehaviouralFragility(winner),
  ];
  return out
    .filter((x): x is FragilityFinding => x !== null)
    .sort((a, b) => b.weight - a.weight);
}
