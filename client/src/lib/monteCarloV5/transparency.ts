/**
 * transparency.ts — Phase 8: Assumption Transparency
 *
 * Produces a structured "Why this outcome happened" report that exposes:
 *   - inflation, property, ETF, crypto assumptions
 *   - interest-rate path
 *   - tax assumptions
 *   - leverage assumptions
 *   - regime path
 *   - top 5 outcome drivers
 *   - downside contributors
 *   - confidence score explanation
 *
 * It is a pure derivation from V4 inputs + V5 enrichments; no math is
 * re-computed here.
 */

import type { RegimeId } from "../monteCarloV4/regimes";
import type { RegimeIdV5 } from "./regimesV5";
import type { AdvancedRiskMetrics } from "../monteCarloV4/risk";

export interface AssumptionBlock {
  group: "inflation" | "property" | "etf" | "crypto" | "rates" | "tax" | "leverage" | "regime";
  label: string;
  value: string;
  source: string;
  rationale: string;
}

export interface DriverContribution {
  name: string;
  contribution: number; // signed contribution to outcome (1.0 = full upside)
  direction: "up" | "down";
  category: "macro" | "household" | "portfolio" | "leverage" | "tax";
}

export interface TransparencyReport {
  assumptions: AssumptionBlock[];
  topDrivers: DriverContribution[];
  downsideContributors: DriverContribution[];
  /** Confidence score (0..100). */
  confidenceScore: number;
  /** Plain-English explanation of the confidence score. */
  confidenceExplanation: string;
  /** Regime path: V4 ids + V5 labels per year. */
  regimePath: Array<{ year: number; v4: RegimeId; v5: RegimeIdV5 }>;
}

export interface TransparencyInputs {
  startYear: number;
  inflationPct: number;
  propertyGrowthPct: number;
  etfReturnPct: number;
  cryptoReturnPct: number;
  ratePathStartPct: number;
  ratePathPeakPct: number;
  marginalTaxRate: number;
  cgtDiscount: number;
  leverageRatio: number;
  v4RegimeByYear: RegimeId[];
  v5RegimeByYear: RegimeIdV5[];
  driverWeights: Array<{ name: string; weight: number; direction: "up" | "down" }>;
  metrics: AdvancedRiskMetrics;
  /** Optional override classification mapping a driver name to a category. */
  driverCategories?: Record<string, DriverContribution["category"]>;
}

export function buildTransparencyReport(inp: TransparencyInputs): TransparencyReport {
  const assumptions: AssumptionBlock[] = [
    { group: "inflation", label: "Inflation (CPI)", value: `${inp.inflationPct.toFixed(1)}%`,
      source: "Forecast assumptions × regime overlay",
      rationale: "RBA target band 2-3%; regime shocks adjust ±2-3pp." },
    { group: "property", label: "Property growth", value: `${inp.propertyGrowthPct.toFixed(1)}%/yr nominal`,
      source: "AU long-run + regime overlay",
      rationale: "Capital cities long-run nominal ~6%; regime overlays for cycle + APRA macroprudential." },
    { group: "etf", label: "ETF return (broad market)", value: `${inp.etfReturnPct.toFixed(1)}%/yr nominal`,
      source: "Long-run global equity premium",
      rationale: "Real return ~5%; nominal lifted by inflation; vol 15%." },
    { group: "crypto", label: "Crypto expected return", value: `${inp.cryptoReturnPct.toFixed(1)}%/yr nominal`,
      source: "10y crypto premium (fat-tailed)",
      rationale: "Heavy right-tail with drawdown risk; vol ~70%." },
    { group: "rates", label: "Cash rate path (start / peak)", value: `${inp.ratePathStartPct.toFixed(1)}% → ${inp.ratePathPeakPct.toFixed(1)}%`,
      source: "RBA implied path × regime",
      rationale: "Tightening / cut cycles push effective mortgage rate ±2pp." },
    { group: "tax", label: "Marginal tax rate", value: `${(inp.marginalTaxRate * 100).toFixed(0)}%`,
      source: "ATO household profile",
      rationale: "Determines super alpha; CGT discount applied at 12+ months." },
    { group: "tax", label: "CGT discount", value: `${(inp.cgtDiscount * 100).toFixed(0)}%`,
      source: "ATO Div 115",
      rationale: "50% discount for assets held > 12 months." },
    { group: "leverage", label: "Loan-to-asset ratio", value: `${(inp.leverageRatio * 100).toFixed(0)}%`,
      source: "Snapshot",
      rationale: "Bounded for serviceability; APRA buffer ~3pp." },
    { group: "regime", label: "Dominant first-3yr regimes",
      value: `${inp.v5RegimeByYear.slice(0, 3).join(", ")}`,
      source: "V5 regime engine",
      rationale: "Markov chain calibrated to AU historical durations." },
  ];

  // ── Drivers: top + downside ──────────────────────────────────────────
  const cats = inp.driverCategories ?? {};
  const drivers: DriverContribution[] = inp.driverWeights.map(d => ({
    name: d.name,
    contribution: d.weight,
    direction: d.direction,
    category: cats[d.name] ?? guessCategory(d.name),
  }));
  drivers.sort((a, b) => b.contribution - a.contribution);
  const topDrivers = drivers.slice(0, 5);
  const downsideContributors = drivers.filter(d => d.direction === "down").slice(0, 5);

  // ── Confidence score ─────────────────────────────────────────────────
  // Heuristic: 100 minus penalty from elevated risk metrics, plus bonus for
  // diversification and survivability.
  const insolvPenalty = Math.min(40, inp.metrics.insolvencyProb * 0.6);
  const liqPenalty = Math.min(25, inp.metrics.liquidityExhaustionProb * 0.4);
  const refiPenalty = Math.min(15, inp.metrics.refinanceFailureProb * 0.3);
  const survivorBonus = Math.min(20, inp.metrics.survivalHorizonYears * 2);
  const base = 100;
  const conf = Math.max(0, Math.min(100, base - insolvPenalty - liqPenalty - refiPenalty + survivorBonus * 0.5));

  const confExplain =
    `Confidence ${conf.toFixed(0)}/100. ` +
    `Penalties: insolvency ${insolvPenalty.toFixed(0)} (prob ${inp.metrics.insolvencyProb.toFixed(1)}%), ` +
    `liquidity ${liqPenalty.toFixed(0)} (prob ${inp.metrics.liquidityExhaustionProb.toFixed(1)}%), ` +
    `refinance ${refiPenalty.toFixed(0)} (prob ${inp.metrics.refinanceFailureProb.toFixed(1)}%). ` +
    `Survivor bonus +${(survivorBonus * 0.5).toFixed(0)} (horizon ${inp.metrics.survivalHorizonYears.toFixed(1)}y).`;

  // ── Regime path ──────────────────────────────────────────────────────
  const regimePath = inp.v4RegimeByYear.map((r, i) => ({
    year: inp.startYear + i,
    v4: r,
    v5: inp.v5RegimeByYear[i] ?? "normal_growth",
  }));

  return {
    assumptions,
    topDrivers,
    downsideContributors,
    confidenceScore: conf,
    confidenceExplanation: confExplain,
    regimePath,
  };
}

function guessCategory(name: string): DriverContribution["category"] {
  const n = name.toLowerCase();
  if (/property|rent|land/.test(n))            return "macro";
  if (/inflation|rate|regime/.test(n))         return "macro";
  if (/stock|etf|crypto|portfolio/.test(n))    return "portfolio";
  if (/income|wage|career|household|child/.test(n)) return "household";
  if (/debt|leverage|lvr|dsr/.test(n))          return "leverage";
  if (/tax|cgt|super|concess/.test(n))          return "tax";
  return "macro";
}
