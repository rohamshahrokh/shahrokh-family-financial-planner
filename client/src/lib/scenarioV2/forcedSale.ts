/**
 * Scenario Engine V2 — Forced Sale Reporting (Sprint 2B).
 *
 * The deterministic liquidation cascade already lives inside `tick.ts`
 * (`applyLiquidationCascade`). This module is a *thin reporting layer* on
 * top of the existing fields (`forcedSales`, `defaulted`, `defaultMonth`)
 * so consumers can answer four questions per sim and per fan:
 *
 *   1. Did any sim trigger a forced sale?
 *   2. What proportion of sims triggered one?
 *   3. What was the median total of forced-sale proceeds (in $)?
 *   4. After a forced sale, did the household recover?
 *
 * Trigger semantics (consistent with tick.ts):
 *   • Cash exhaustion + offset depletion + liquid assets exhausted, leading
 *     to property liquidation.
 *   • A 5% distressed-sale haircut + 2.5% selling costs are applied inside
 *     tick.ts (we do not double-account here).
 *
 * Output is intentionally additive to the Scenario V2 result and never
 * mutates upstream telemetry.
 */

import type { PortfolioState } from "./types";

export interface ForcedSaleSimSummary {
  triggered: boolean;
  forcedSalesTotal: number;
  defaulted: boolean;
  recoveredAfter: boolean;
  terminalNw: number;
}

export interface ForcedSaleReport {
  /** Fraction of sims that triggered any forced sale. */
  triggerProbability: number;
  /** Fraction of sims where the household ended insolvent after forced sale. */
  insolventAfterForcedSaleProbability: number;
  /** Fraction of forced-sale sims that recovered (terminal NW > 0). */
  recoveryProbabilityGivenForcedSale: number;
  /** Median forced-sale dollar amount across triggering sims (0 if none). */
  medianForcedSaleProceeds: number;
  /** Median forced-sale dollar amount across ALL sims (including zeros). */
  meanForcedSaleProceeds: number;
  triggerCount: number;
  /** Detailed per-sim rows for downstream rendering / audit. */
  perSim: ForcedSaleSimSummary[];
  notes: string[];
}

export interface ForcedSaleInput {
  finalStates: PortfolioState[];
  terminalNwBySim: number[];
}

export function buildForcedSaleReport(input: ForcedSaleInput): ForcedSaleReport {
  const perSim: ForcedSaleSimSummary[] = [];
  let triggerCount = 0;
  let insolventCount = 0;
  let recoveredCount = 0;
  let totalProceeds = 0;
  const triggeringProceeds: number[] = [];

  for (let i = 0; i < input.finalStates.length; i++) {
    const fs = input.finalStates[i];
    const sales = fs.forcedSales ?? 0;
    const triggered = sales > 0;
    const defaulted = fs.defaulted === true;
    const terminalNw = input.terminalNwBySim[i] ?? 0;
    const recovered = triggered && terminalNw > 0;

    perSim.push({
      triggered,
      forcedSalesTotal: sales,
      defaulted,
      recoveredAfter: recovered,
      terminalNw,
    });

    if (triggered) {
      triggerCount++;
      triggeringProceeds.push(sales);
      totalProceeds += sales;
      if (defaulted) insolventCount++;
      if (recovered) recoveredCount++;
    }
  }

  const N = Math.max(1, input.finalStates.length);
  triggeringProceeds.sort((a, b) => a - b);
  const medianForcedSaleProceeds = triggeringProceeds.length === 0
    ? 0
    : triggeringProceeds[Math.floor(triggeringProceeds.length / 2)];

  const notes: string[] = [];
  if (triggerCount === 0) {
    notes.push("No forced-sale events observed across the Monte Carlo population.");
  } else {
    notes.push(
      `Forced sales fired in ${triggerCount}/${input.finalStates.length} sims ` +
        `(${((triggerCount / N) * 100).toFixed(1)}%); median proceeds ` +
        `$${medianForcedSaleProceeds.toFixed(0)}.`,
    );
  }

  return {
    triggerProbability: triggerCount / N,
    insolventAfterForcedSaleProbability: insolventCount / N,
    recoveryProbabilityGivenForcedSale: triggerCount > 0 ? recoveredCount / triggerCount : 0,
    medianForcedSaleProceeds,
    meanForcedSaleProceeds: totalProceeds / N,
    triggerCount,
    perSim,
    notes,
  };
}
