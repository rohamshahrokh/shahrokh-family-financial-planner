/**
 * risk.ts — Phase F: Advanced Risk Engine
 *
 * Computes institutional risk metrics from simulation outputs:
 *   - VaR (Value-at-Risk) at 95% and 99% on terminal NW
 *   - CVaR (Conditional VaR / Expected Shortfall) at 95%
 *   - Sequence-of-return risk (SoR) — gap between random-order vs ordered returns
 *   - Liquidity exhaustion probability (cash < 0 for any month)
 *   - Insolvency probability (NW < 0 at any year-end)
 *   - Refinancing failure probability (per-sim flag aggregate)
 *   - Debt stress score (avg DSR across paths)
 *   - Leverage fragility score (avg LVR-at-trough)
 *   - Survival horizon (years until median sim breaches threshold)
 *   - First failure month, first liquidity stress month, worst drawdown year,
 *     debt spiral probability.
 */

export interface PathStressFlags {
  firstNegCashMonth: number | null;    // first month cash < 0
  firstShortfallMonth: number | null;  // first month cash < emergency buffer
  firstInsolvencyMonth: number | null; // first month NW < 0
  worstDrawdownPct: number;            // worst NW drawdown from running peak
  worstDrawdownYearIdx: number;        // year index of worst drawdown
  refinanceFailed: boolean;
  debtSpiral: boolean;                 // monotonic decline + neg cashflow > 24mo
  peakDSR: number;                     // peak debt service ratio (mortgage / income)
  peakLVR: number;                     // peak loan-to-value
}

export interface AdvancedRiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  sorRisk: number;                     // sequence-of-return risk gap
  liquidityExhaustionProb: number;     // % sims with cash < 0 at any month
  insolvencyProb: number;              // % sims with NW < 0 at any year-end
  refinanceFailureProb: number;        // % sims with at least one refi failure
  debtStressScore: number;             // avg peak DSR
  leverageFragilityScore: number;      // avg peak LVR
  survivalHorizonYears: number;        // years until P10 path breaches threshold
  medianFirstFailureMonth: number | null;
  medianFirstLiquidityStressMonth: number | null;
  worstDrawdownYear: number;
  debtSpiralProb: number;
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

/**
 * Compute advanced risk metrics from terminal NW per sim, year-end NW per sim,
 * and per-sim stress flags. Inputs:
 *   - terminalNw: NW at last year per sim
 *   - yearEndNwBySim: [N_SIM][N_YEARS]
 *   - flagsBySim: PathStressFlags per sim
 *   - startYear: calendar start year for date labels
 *   - survivalThreshold: NW level considered "viable" (e.g. emergency buffer)
 */
export function computeAdvancedRiskMetrics(
  terminalNw: number[],
  yearEndNwBySim: number[][],
  flagsBySim: PathStressFlags[],
  startYear: number,
  survivalThreshold = 0,
): AdvancedRiskMetrics {
  const nSim = terminalNw.length;
  const nYears = yearEndNwBySim[0]?.length ?? 0;

  // VaR / CVaR on terminal NW
  const var95 = pct(terminalNw, 5);
  const var99 = pct(terminalNw, 1);
  const cvarThreshold = pct(terminalNw, 5);
  const tail = terminalNw.filter(v => v <= cvarThreshold);
  const cvar95 = tail.length > 0 ? tail.reduce((s, v) => s + v, 0) / tail.length : var95;

  // Sequence-of-return proxy: variance of year-1 vs year-N drawdowns
  // (a simple SoR proxy — gap between best- and worst-ordered returns).
  let sorAccum = 0;
  let sorCount = 0;
  for (let s = 0; s < nSim; s++) {
    const row = yearEndNwBySim[s];
    if (!row || row.length < 2) continue;
    const ret = (row[row.length - 1] - row[0]) / Math.max(1, Math.abs(row[0]));
    // Peak-trough drawdown
    let peak = row[0], maxDd = 0;
    for (const v of row) {
      if (v > peak) peak = v;
      if (peak > 0) maxDd = Math.max(maxDd, (peak - v) / peak);
    }
    sorAccum += maxDd - Math.max(0, -ret);
    sorCount++;
  }
  const sorRisk = sorCount > 0 ? sorAccum / sorCount : 0;

  // Liquidity exhaustion / insolvency / refinance / debt-spiral
  let liqHits = 0, insolvHits = 0, refiHits = 0, spiralHits = 0;
  const firstFailureMonths: number[] = [];
  const firstLiqMonths: number[] = [];
  const dsrSum: number[] = [];
  const lvrSum: number[] = [];
  const worstDdYears: number[] = [];
  for (const f of flagsBySim) {
    if (f.firstNegCashMonth !== null) liqHits++;
    if (f.firstInsolvencyMonth !== null) insolvHits++;
    if (f.refinanceFailed) refiHits++;
    if (f.debtSpiral) spiralHits++;
    if (f.firstInsolvencyMonth !== null) firstFailureMonths.push(f.firstInsolvencyMonth);
    if (f.firstShortfallMonth !== null) firstLiqMonths.push(f.firstShortfallMonth);
    dsrSum.push(f.peakDSR);
    lvrSum.push(f.peakLVR);
    worstDdYears.push(f.worstDrawdownYearIdx);
  }
  const liquidityExhaustionProb = nSim ? (liqHits / nSim) * 100 : 0;
  const insolvencyProb = nSim ? (insolvHits / nSim) * 100 : 0;
  const refinanceFailureProb = nSim ? (refiHits / nSim) * 100 : 0;
  const debtSpiralProb = nSim ? (spiralHits / nSim) * 100 : 0;
  const debtStressScore = dsrSum.length ? dsrSum.reduce((s, v) => s + v, 0) / dsrSum.length : 0;
  const leverageFragilityScore = lvrSum.length ? lvrSum.reduce((s, v) => s + v, 0) / lvrSum.length : 0;
  const medianFirstFailureMonth = firstFailureMonths.length ? pct(firstFailureMonths, 50) : null;
  const medianFirstLiquidityStressMonth = firstLiqMonths.length ? pct(firstLiqMonths, 50) : null;

  // Survival horizon — years until P10 first breaches threshold
  let survivalHorizonYears = nYears;
  for (let y = 0; y < nYears; y++) {
    const col = yearEndNwBySim.map(r => r[y]);
    if (pct(col, 10) < survivalThreshold) {
      survivalHorizonYears = y;
      break;
    }
  }

  // Worst drawdown year — most common year index across paths
  const yearCounts: Record<number, number> = {};
  for (const y of worstDdYears) yearCounts[y] = (yearCounts[y] ?? 0) + 1;
  let worstYearIdx = 0, worstYearN = -1;
  for (const yKey of Object.keys(yearCounts)) {
    const y = Number(yKey);
    const n = yearCounts[y];
    if (n > worstYearN) { worstYearIdx = y; worstYearN = n; }
  }
  const worstDrawdownYear = startYear + worstYearIdx;

  return {
    var95: Math.round(var95),
    var99: Math.round(var99),
    cvar95: Math.round(cvar95),
    sorRisk: Math.round(sorRisk * 1000) / 1000,
    liquidityExhaustionProb: Math.round(liquidityExhaustionProb * 10) / 10,
    insolvencyProb: Math.round(insolvencyProb * 10) / 10,
    refinanceFailureProb: Math.round(refinanceFailureProb * 10) / 10,
    debtStressScore: Math.round(debtStressScore * 1000) / 1000,
    leverageFragilityScore: Math.round(leverageFragilityScore * 1000) / 1000,
    survivalHorizonYears,
    medianFirstFailureMonth,
    medianFirstLiquidityStressMonth,
    worstDrawdownYear,
    debtSpiralProb: Math.round(debtSpiralProb * 10) / 10,
  };
}
