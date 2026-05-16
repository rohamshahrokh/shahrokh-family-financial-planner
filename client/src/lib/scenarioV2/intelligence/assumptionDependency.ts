/**
 * Critical Assumption Dependency Analysis — ranks the assumptions
 * driving the recommended outcome.
 *
 * Uses BasePlanAssumptions + RankedCandidate signals to derive sensitivity.
 * Where we have engine-derived sensitivity (volatility, leverage, refinance
 * pressure) we score quantitatively; otherwise we surface qualitative
 * high/medium/low impact bands.
 *
 * Deterministic; pure function.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type {
  AssumptionImpact,
  AssumptionKey,
  AssumptionImpactBand,
} from "./types";

function band(sensitivity: number): AssumptionImpactBand {
  if (sensitivity >= 0.7) return "high";
  if (sensitivity >= 0.4) return "medium";
  return "low";
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

interface Builder {
  key: AssumptionKey;
  label: string;
  sensitivity: number;
  describe: (s: number, b: AssumptionImpactBand) => string;
  quant?: (c: RankedCandidate, baseline: ExtendedScenarioResult) => AssumptionImpact["quant"] | undefined;
}

export function rankAssumptionDependencies(
  winner: RankedCandidate,
  baseline: ExtendedScenarioResult,
): AssumptionImpact[] {
  const m = winner.result.riskMetrics;
  const lev = m?.leverageRisk ?? 0;
  const conc = m?.concentrationRisk ?? 0;
  const refi = winner.result.refinancePressureProbability ?? 0;
  const vol = m?.volatility ?? 0;
  const liq = m?.liquidityRisk ?? 0;
  const text = `${winner.label} ${winner.id}`.toLowerCase();
  const propertyHeavy = /property|ip\b|lever/.test(text);
  const equityHeavy = /etf|stock|equity|diversif/.test(text);
  const cryptoHeavy = /crypto/.test(text);
  const superHeavy = /super|conces/.test(text);
  const dcaHeavy = /dca/.test(text);

  const builders: Builder[] = [
    {
      key: "propertyGrowth",
      label: "Property growth (AU CAGR)",
      sensitivity: clamp01(0.7 * conc + 0.3 * lev) * (propertyHeavy ? 1.0 : 0.55),
      describe: (s, b) =>
        b === "high"
          ? "Outcome materially shifts with property CAGR — a 2% lower long-run growth band would compress terminal NW and delay FIRE."
          : b === "medium"
          ? "Property growth is one of several drivers; deviations of more than 1-2% shift the ranking modestly."
          : "Property growth is a peripheral driver of this path.",
      quant: (c, b) => {
        if (!propertyHeavy) return undefined;
        // Heuristic: 2% lower property CAGR delays FIRE proportional to leverage.
        const years = +(2.0 * lev).toFixed(1);
        if (years < 0.5) return undefined;
        return { label: "2% lower property CAGR delays FIRE by", value: years, unit: "years" };
      },
    },
    {
      key: "interestRates",
      label: "Interest rate path",
      sensitivity: clamp01(0.55 * lev + 0.45 * (refi / 0.3)),
      describe: (s, b) =>
        b === "high"
          ? "A 1% sustained rise in rates would push refinance pressure into the warning band and compress serviceability."
          : b === "medium"
          ? "Rate path matters but the household has buffer to absorb modest shocks."
          : "Rate path is not a primary driver of this strategy's outcome.",
      quant: (c) => {
        if (lev < 0.3) return undefined;
        // 1% rate rise reduces median NW heuristic: 0.5x leverage * baseline NW.
        const nw = baseline.netWorthFan?.[baseline.netWorthFan.length - 1]?.p50 ?? 0;
        const reduction = Math.round(nw * 0.005 * lev);
        if (reduction < 1000) return undefined;
        return { label: "1% rate rise reduces median NW by approximately", value: reduction, unit: "$" };
      },
    },
    {
      key: "incomeGrowth",
      label: "Income growth + dual income continuity",
      sensitivity: clamp01(0.5 + 0.4 * liq + 0.2 * lev),
      describe: (s, b) =>
        b === "high"
          ? "Strategy outcomes lean on continued income growth — interruption to dual income would materially raise the default probability."
          : b === "medium"
          ? "Income growth matters but the strategy retains optionality if it slows."
          : "Income growth has modest bearing on this strategy.",
    },
    {
      key: "cashBuffer",
      label: "Cash buffer / liquidity retention",
      sensitivity: clamp01(0.5 + 0.5 * liq),
      describe: (s, b) =>
        b === "high"
          ? "Cash buffer retention is the load-bearing input — drops below the 4-month band tip the plan into fragility."
          : b === "medium"
          ? "Maintaining buffer at current levels keeps the strategy in its safe band."
          : "Liquidity buffer is already strong and not the binding constraint.",
    },
    {
      key: "stockReturn",
      label: "Equity-market long-run return",
      sensitivity: clamp01(0.4 + 0.4 * vol) * (equityHeavy ? 1.0 : 0.5),
      describe: (s, b) =>
        b === "high"
          ? "Equity returns are the primary engine — a sustained period of below-long-run returns would defer FIRE materially."
          : b === "medium"
          ? "Equity exposure is meaningful; deviations from the long-run band matter at the margins."
          : "Equity returns play a supporting role only.",
    },
    {
      key: "dcaConsistency",
      label: "DCA / contribution consistency",
      sensitivity: dcaHeavy ? 0.65 : 0.3,
      describe: (s, b) =>
        b === "high"
          ? "Behavioural consistency drives this path — pauses in the DCA cadence compound into a larger terminal gap than the mathematics suggest."
          : b === "medium"
          ? "Contribution discipline matters but a missed quarter is recoverable."
          : "Contribution timing is not a load-bearing assumption for this plan.",
    },
    {
      key: "inflation",
      label: "Inflation regime",
      sensitivity: 0.45,
      describe: (s, b) =>
        b === "high"
          ? "Plan outcomes are sensitive to a sustained high-inflation regime — real returns and serviceability both compress."
          : b === "medium"
          ? "Inflation matters in real terms but the strategy is partially hedged by real-asset exposure."
          : "Inflation exposure is well diversified.",
    },
    {
      key: "cryptoReturn",
      label: "Crypto long-run return",
      sensitivity: cryptoHeavy ? 0.6 : 0.15,
      describe: (s, b) =>
        b === "high"
          ? "Crypto-driven path is asymmetric — long-run return assumptions skew outcomes both ways."
          : b === "medium"
          ? "Crypto contributes meaningfully to right-tail but not load-bearing."
          : "Crypto exposure is incidental to this strategy.",
    },
    {
      key: "superReturn",
      label: "Super return + concessional rules",
      sensitivity: superHeavy ? 0.55 : 0.2,
      describe: (s, b) =>
        b === "high"
          ? "Plan effectiveness depends on Super return and the current concessional regime holding."
          : b === "medium"
          ? "Super is a meaningful but secondary contributor to terminal NW."
          : "Super assumptions have minor bearing here.",
    },
  ];

  const ranked = builders
    .map((b) => {
      const sensitivity = clamp01(b.sensitivity);
      const impactBand = band(sensitivity);
      const quant = b.quant?.(winner, baseline);
      return {
        key: b.key,
        label: b.label,
        sensitivity,
        impactBand,
        impactDescription: b.describe(sensitivity, impactBand),
        quant,
      } satisfies AssumptionImpact;
    })
    .sort((a, b) => b.sensitivity - a.sensitivity);

  return ranked;
}
