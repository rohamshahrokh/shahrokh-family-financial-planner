/**
 * Turning-Point Engine — detects breakpoints where the strategy's
 * recommendation, risk profile, or survivability shifts.
 *
 * Deterministic. Reads existing engine outputs (RankedCandidate,
 * ExtendedScenarioResult). Where the engine has already computed a clean
 * threshold (e.g. mortgageRate from BasePlanAssumptions, leverageRisk from
 * RiskMetrics), we use it; otherwise we surface qualitative triggers with
 * explicit `confidence: "qualitative"`.
 *
 * Output: TurningPoint[] sorted by severity then heuristic materiality.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type {
  TurningPoint,
  InsightSeverity,
  InsightThreshold,
} from "./types";

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 3,
  warn: 2,
  watch: 1,
  info: 0,
};

function sev(s: InsightSeverity): number {
  return SEVERITY_RANK[s];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Detect recommendation-flip thresholds (rate-driven). */
function detectRecommendationFlip(
  winner: RankedCandidate,
  runnerUp: RankedCandidate | null,
  baseline: ExtendedScenarioResult,
): TurningPoint | null {
  if (!runnerUp) return null;
  const text = `${winner.label} ${winner.id} ${runnerUp.label} ${runnerUp.id}`.toLowerCase();
  const winnerIsCash = /offset|defer|cash|defensive|liquidity/.test(`${winner.label} ${winner.id}`.toLowerCase());
  const runnerIsLevered = /property|ip\b|lever/.test(`${runnerUp.label} ${runnerUp.id}`.toLowerCase());

  const mortgageRate = baseline.serviceability && typeof (baseline.serviceability as any).mortgageRate === "number"
    ? (baseline.serviceability as any).mortgageRate as number
    : null;

  if (winnerIsCash && runnerIsLevered) {
    // Approximate flip point: rate band where cash-preservation begins to lose to leverage.
    const approxFlip = mortgageRate !== null ? Math.max(0.04, mortgageRate - 0.012) : null;
    const threshold: InsightThreshold = approxFlip !== null
      ? {
          label: `mortgage rate falls to ~${(approxFlip * 100).toFixed(1)}%`,
          value: approxFlip,
          unit: "%",
          confidence: "medium",
        }
      : {
          label: "mortgage rates ease materially below current band",
          confidence: "qualitative",
        };
    return {
      id: "tp.recommendation-flip.rates",
      kind: "recommendation-flip",
      description:
        `Your recommendation flips from cash-preservation (${winner.shortLabel ?? winner.label}) to leveraged property acquisition (${runnerUp.shortLabel ?? runnerUp.label}) if rates ease meaningfully.`,
      threshold,
      severity: "watch",
      drivers: ["mortgageRate", "winnerScore", "runnerUpScore"],
    };
  }

  // Reverse case: levered winner, cash-defensive runner-up
  if (!winnerIsCash && runnerIsLevered === false && winner.score && runnerUp.score) {
    const gap = (winner.score.score ?? 0) - (runnerUp.score.score ?? 0);
    if (gap < 4 && (text.includes("offset") || text.includes("defer"))) {
      return {
        id: "tp.recommendation-flip.liquidity",
        kind: "recommendation-flip",
        description:
          `Recommendation would flip to a more defensive posture if monthly surplus or cash buffer falls modestly from current levels.`,
        threshold: {
          label: "surplus or buffer compresses by ~15%",
          confidence: "qualitative",
        },
        severity: "watch",
        drivers: ["score.gap", "liquidityRisk"],
      };
    }
  }
  return null;
}

/** Risk acceleration: high P90 drawdown relative to median. */
function detectRiskAcceleration(winner: RankedCandidate): TurningPoint | null {
  const m = winner.result.riskMetrics;
  if (!m) return null;
  const ddMed = m.maxDrawdownMedian ?? 0;
  const ddP90 = m.maxDrawdownP90 ?? 0;
  const acceleration = ddP90 - ddMed;
  if (ddP90 >= 0.30 && acceleration >= 0.10) {
    return {
      id: "tp.risk-acceleration",
      kind: "risk-acceleration",
      description:
        `Tail risk accelerates sharply: P90 drawdown of ${(ddP90 * 100).toFixed(0)}% is ${(acceleration * 100).toFixed(0)}pp above the median path, indicating non-linear loss exposure.`,
      threshold: {
        label: `P90 drawdown ≥ 30% (current ${(ddP90 * 100).toFixed(0)}%)`,
        value: ddP90,
        unit: "%",
        confidence: "high",
      },
      severity: ddP90 >= 0.45 ? "critical" : "warn",
      drivers: ["riskMetrics.maxDrawdownP90", "riskMetrics.maxDrawdownMedian"],
    };
  }
  return null;
}

/** Leverage becomes unsafe — LVR > ~82% on median final state. */
function detectLeverageUnsafe(winner: RankedCandidate): TurningPoint | null {
  const lev = winner.result.riskMetrics?.leverageRisk ?? 0;
  if (lev >= 0.55) {
    const severity: InsightSeverity = lev >= 0.78 ? "critical" : lev >= 0.65 ? "warn" : "watch";
    return {
      id: "tp.leverage-unsafe",
      kind: "leverage-unsafe",
      description:
        `Leverage risk accelerates rapidly above 82% LVR. Median portfolio LVR sits at ${(lev * 100).toFixed(0)}%; further borrowing or property-price declines push the household into the fragile band.`,
      threshold: {
        label: "portfolio LVR > 82%",
        value: 0.82,
        unit: "%",
        confidence: "high",
      },
      severity,
      drivers: ["riskMetrics.leverageRisk"],
    };
  }
  return null;
}

/** FIRE trajectory collapse — surplus-driven. */
function detectFireCollapse(
  winner: RankedCandidate,
  baseline: ExtendedScenarioResult,
): TurningPoint | null {
  const surplus = baseline.reconciledMonthlySurplus ?? 0;
  if (surplus <= 0) return null;
  // Threshold: collapse band ~ 40% of current surplus (cautious estimate).
  const collapseBand = Math.round(surplus * 0.4);
  const survival = 1 - (winner.result.defaultProbability ?? 0);
  if (collapseBand >= 1000) {
    return {
      id: "tp.fire-collapse",
      kind: "fire-collapse",
      description:
        `Your FIRE trajectory breaks if household surplus drops below approximately $${collapseBand.toLocaleString("en-AU")}/month. At that level the strategy can no longer compound at the rate required by the current FIRE timeline.`,
      threshold: {
        label: `monthly surplus < $${collapseBand.toLocaleString("en-AU")}`,
        value: collapseBand,
        unit: "$/mo",
        confidence: "medium",
      },
      severity: survival < 0.9 ? "warn" : "watch",
      drivers: ["reconciledMonthlySurplus", "defaultProbability"],
    };
  }
  return null;
}

/** Liquidity stress begins — engine-derived. */
function detectLiquidityStress(winner: RankedCandidate): TurningPoint | null {
  const liqStress = winner.result.liquidityStressProbability ?? 0;
  const liqExh = winner.result.liquidityExhaustionProbability ?? 0;
  if (liqStress >= 0.10 || liqExh >= 0.05) {
    const sev: InsightSeverity =
      liqExh >= 0.15 || liqStress >= 0.30 ? "critical" :
      liqExh >= 0.05 || liqStress >= 0.20 ? "warn" : "watch";
    return {
      id: "tp.liquidity-stress",
      kind: "liquidity-stress",
      description:
        `The plan becomes highly fragile if the offset / cash buffer falls below approximately 4 months of expenses. ${(liqStress * 100).toFixed(0)}% of simulated paths already enter the liquidity-stress band.`,
      threshold: {
        label: "offset balance < 4 months of expenses",
        confidence: "qualitative",
      },
      severity: sev,
      drivers: ["liquidityStressProbability", "liquidityExhaustionProbability"],
    };
  }
  return null;
}

/** Debt becomes dominant — net property debt vs. NW. */
function detectDebtDominant(winner: RankedCandidate): TurningPoint | null {
  // Heuristic: leverage ≥ 0.5 AND concentration ≥ 0.5 → debt-dominant economy
  const lev = winner.result.riskMetrics?.leverageRisk ?? 0;
  const conc = winner.result.riskMetrics?.concentrationRisk ?? 0;
  if (lev >= 0.5 && conc >= 0.55) {
    return {
      id: "tp.debt-dominant",
      kind: "debt-dominant",
      description:
        `Debt service is on track to dominate household cashflow — leverage of ${(lev * 100).toFixed(0)}% combined with ${(conc * 100).toFixed(0)}% concentration in property means a rate or vacancy shock has nowhere to be absorbed.`,
      threshold: {
        label: "leverage > 50% AND single-class concentration > 55%",
        confidence: "high",
      },
      severity: "warn",
      drivers: ["riskMetrics.leverageRisk", "riskMetrics.concentrationRisk"],
    };
  }
  return null;
}

/** Serviceability weakens — refinance pressure. */
function detectServiceabilityWeakening(winner: RankedCandidate): TurningPoint | null {
  const refi = winner.result.refinancePressureProbability ?? 0;
  if (refi >= 0.15) {
    return {
      id: "tp.serviceability-weak",
      kind: "serviceability-weak",
      description:
        `Serviceability weakens materially in adverse rate paths — ${(refi * 100).toFixed(0)}% of simulations cross the refinance-pressure band. The household should pre-commit to a response if rates move further.`,
      threshold: {
        label: "refinance pressure probability ≥ 15%",
        value: refi,
        unit: "%",
        confidence: "high",
      },
      severity: refi >= 0.30 ? "critical" : "warn",
      drivers: ["refinancePressureProbability"],
    };
  }
  return null;
}

/** Volatility risk exceeds tolerance. */
function detectVolatilityIntolerance(winner: RankedCandidate): TurningPoint | null {
  const m = winner.result.riskMetrics;
  if (!m) return null;
  const vol = m.volatility ?? 0;
  const downside = m.downsideRisk ?? 0;
  if (vol >= 0.45 || downside >= 0.45) {
    return {
      id: "tp.volatility-intolerance",
      kind: "volatility-intolerance",
      description:
        `Path volatility exceeds the threshold most households can hold through a full cycle. Coefficient of variation of terminal NW ${(vol * 100).toFixed(0)}% and downside dispersion ${(downside * 100).toFixed(0)}% imply meaningful psychological strain.`,
      threshold: {
        label: "terminal NW volatility ≥ 45% OR downside dispersion ≥ 45%",
        confidence: "high",
      },
      severity: vol >= 0.7 ? "critical" : "warn",
      drivers: ["riskMetrics.volatility", "riskMetrics.downsideRisk"],
    };
  }
  return null;
}

export function detectTurningPoints(
  winner: RankedCandidate,
  runnerUp: RankedCandidate | null,
  baseline: ExtendedScenarioResult,
): TurningPoint[] {
  const out: Array<TurningPoint | null> = [
    detectRecommendationFlip(winner, runnerUp, baseline),
    detectRiskAcceleration(winner),
    detectLeverageUnsafe(winner),
    detectFireCollapse(winner, baseline),
    detectLiquidityStress(winner),
    detectDebtDominant(winner),
    detectServiceabilityWeakening(winner),
    detectVolatilityIntolerance(winner),
  ];
  // Sort by severity desc, then by kind for determinism.
  return out
    .filter((x): x is TurningPoint => x !== null)
    .sort((a, b) => {
      const d = sev(b.severity) - sev(a.severity);
      if (d !== 0) return d;
      return a.kind.localeCompare(b.kind);
    });
}

// Internal — exported for unit testing thresholds.
export const __turningPointInternals = { clamp01, sev };
