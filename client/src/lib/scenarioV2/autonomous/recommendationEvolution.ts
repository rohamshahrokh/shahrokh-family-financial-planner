/**
 * PART 2 + PART 13 — Recommendation Evolution & Why-This-Changed.
 *
 * Compares the current winning recommendation against the prior one stored
 * in StrategicMemory. When there is no prior, surfaces a clean baseline
 * narrative (no fabricated history). When recommendation changes, explains
 * why using engine-derived signals (liquidity, debt, surplus).
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type { ChangeNarrative, LedgerSnapshot, StrategicMemoryInput } from "./types";

export interface BuildEvolutionInput {
  winner: RankedCandidate;
  baseline: ExtendedScenarioResult;
  memory?: StrategicMemoryInput | null;
  history?: LedgerSnapshot[];
}

function labelHint(label: string): "defensive" | "growth" | "leverage" | "neutral" {
  const t = label.toLowerCase();
  if (/property|ip\b|lever/.test(t)) return "leverage";
  if (/etf|stock|crypto|invest|dca/.test(t)) return "growth";
  if (/offset|cash|defensive|liquidity|preserve|hold/.test(t)) return "defensive";
  return "neutral";
}

export function buildRecommendationEvolution(input: BuildEvolutionInput): ChangeNarrative {
  const { winner, baseline, memory, history = [] } = input;
  const previousId = memory?.lastWinnerId ?? null;
  const previousLabel = memory?.lastWinnerLabel ?? null;
  const currentLabel = winner.label;

  if (!previousId) {
    return {
      changed: false,
      reason: "Baseline recommendation — no prior decision context exists. Future runs will compare against this run.",
      factors: [],
      previousLabel: null,
      currentLabel,
    };
  }

  if (previousId === winner.id) {
    return {
      changed: false,
      reason: "Recommendation is unchanged — the same strategy remains the highest-scoring path under the current ledger.",
      factors: [],
      previousLabel,
      currentLabel,
    };
  }

  const factors: string[] = [];
  const first = history[0] ?? null;
  const last = history[history.length - 1] ?? null;
  if (first && last) {
    const dCash = last.liquidCash - first.liquidCash;
    if (Math.abs(dCash) > 5_000) {
      factors.push(
        `Liquidity ${dCash > 0 ? "improved" : "compressed"} by $${Math.round(Math.abs(dCash)).toLocaleString("en-AU")} versus baseline.`,
      );
    }
    const dSurplus = last.monthlySurplus - first.monthlySurplus;
    if (Math.abs(dSurplus) > 200) {
      factors.push(
        `Monthly surplus ${dSurplus > 0 ? "expanded" : "compressed"} by $${Math.round(Math.abs(dSurplus)).toLocaleString("en-AU")}/mo.`,
      );
    }
    const dDebt = last.totalDebt - first.totalDebt;
    if (Math.abs(dDebt) > 5_000) {
      factors.push(
        `Total debt ${dDebt > 0 ? "increased" : "reduced"} by $${Math.round(Math.abs(dDebt)).toLocaleString("en-AU")}.`,
      );
    }
  }

  // Add engine-driven factors regardless of history
  if (baseline.liquidityStressProbability !== undefined) {
    factors.push(`Modelled liquidity stress probability is ${(baseline.liquidityStressProbability * 100).toFixed(0)}%.`);
  }
  if (baseline.refinancePressureProbability !== undefined) {
    factors.push(`Modelled refinance pressure probability is ${(baseline.refinancePressureProbability * 100).toFixed(0)}%.`);
  }

  const newKind = labelHint(currentLabel);
  const prevKind = labelHint(previousLabel ?? "");
  let reason = `Recommendation changed from ${previousLabel ?? "prior path"} to ${currentLabel}.`;
  if (prevKind === "defensive" && newKind === "leverage") {
    reason = `Recommendation upgraded from ${previousLabel ?? "a defensive path"} to ${currentLabel} — improved liquidity and surplus capacity have unlocked higher-growth strategies.`;
  } else if (prevKind === "leverage" && newKind === "defensive") {
    reason = `Recommendation reweighted from ${previousLabel ?? "a leveraged path"} to ${currentLabel} — recent risk signals favour liquidity preservation over leverage expansion.`;
  } else if (prevKind === "growth" && newKind === "defensive") {
    reason = `Recommendation moved from ${previousLabel ?? "growth-tilted accumulation"} to ${currentLabel} — current cashflow and risk metrics no longer support the prior tempo.`;
  } else if (newKind === "leverage") {
    reason = `Property / leverage tilt now wins because risk-adjusted return favours leverage under current settings.`;
  } else if (newKind === "growth") {
    reason = `ETF / accumulation tilt now wins because excess liquidity exceeds the selected safety floor, freeing surplus capital to deploy.`;
  }

  return {
    changed: true,
    reason,
    factors,
    previousLabel,
    currentLabel,
  };
}
