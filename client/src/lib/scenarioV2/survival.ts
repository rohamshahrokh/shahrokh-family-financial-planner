/**
 * Scenario Engine V2 — Survival Engine (Sprint 2B).
 *
 * Survival metrics summarise how often, and how soon, a household stays
 * financially intact across the Monte Carlo population. They sit alongside
 * the existing default/liquidity probabilities and expose:
 *
 *   • survivalProbability       — P(no default by horizon end)
 *   • insolvencyProbability     — P(default at some point)
 *   • recoveryProbability       — P(default fires, but household recovers
 *                                 i.e. returns to positive net worth before
 *                                 horizon end)
 *   • yearsOfSustainability     — median months until first stress event /
 *                                 12 (across sims that experienced one); 30
 *                                 means "no stress observed within horizon"
 *   • monthsUntilFirstStress    — median monthIndex for first stress (or
 *                                 null if no sim experienced stress)
 *
 * Inputs are arrays already gathered by the MC driver — no second pass over
 * the path matrix is required. This keeps the engine cheap and additive.
 */

export interface SurvivalInput {
  simulationCount: number;
  /** Per-sim default month (-1 if solvent for the full horizon). */
  defaultMonthBySim: number[];
  /** Per-sim liquidity stress first-hit month (-1 if not stressed). */
  liquidityFirstMonthBySim: number[];
  /** Per-sim terminal net worth. */
  terminalNwBySim: number[];
  /** Horizon length in months (used to bound `yearsOfSustainability`). */
  horizonMonths: number;
}

export interface SurvivalMetrics {
  survivalProbability: number;
  insolvencyProbability: number;
  /**
   * Of all defaulting sims, the fraction that ended with positive net
   * worth. Captures "recovered after forced sale / income shock".
   */
  recoveryProbability: number;
  /** Median (mid-50%) years until first liquidity stress fires. */
  yearsOfSustainability: number;
  monthsUntilFirstStress: number | null;
  /** Defaulting sims that recovered, expressed as a count. */
  recoveredSims: number;
  defaultingSims: number;
  notes: string[];
}

export function computeSurvivalMetrics(input: SurvivalInput): SurvivalMetrics {
  const N = Math.max(1, input.simulationCount);
  const notes: string[] = [];

  let defaultingSims = 0;
  let recoveredSims = 0;
  for (let i = 0; i < input.defaultMonthBySim.length; i++) {
    if (input.defaultMonthBySim[i] >= 0) {
      defaultingSims++;
      if ((input.terminalNwBySim[i] ?? 0) > 0) recoveredSims++;
    }
  }

  const insolvencyProbability = defaultingSims / N;
  const survivalProbability = 1 - insolvencyProbability;
  const recoveryProbability = defaultingSims > 0 ? recoveredSims / defaultingSims : 0;

  const stressMonths = input.liquidityFirstMonthBySim.filter((m) => m >= 0);
  let monthsUntilFirstStress: number | null = null;
  if (stressMonths.length > 0) {
    const sorted = [...stressMonths].sort((a, b) => a - b);
    monthsUntilFirstStress = sorted[Math.floor(sorted.length / 2)];
  }
  const yearsOfSustainability = monthsUntilFirstStress == null
    ? input.horizonMonths / 12
    : monthsUntilFirstStress / 12;

  if (defaultingSims === 0) {
    notes.push("No sims defaulted within the horizon — survival is 100%.");
  } else if (recoveryProbability > 0.5) {
    notes.push(
      `Most defaulting sims recovered ($NW > 0 at horizon end): ` +
        `${(recoveryProbability * 100).toFixed(0)}%.`,
    );
  } else {
    notes.push(
      `Recovery from default is unlikely in this scenario: only ` +
        `${(recoveryProbability * 100).toFixed(0)}% of defaulting sims ` +
        `ended with positive net worth.`,
    );
  }

  return {
    survivalProbability,
    insolvencyProbability,
    recoveryProbability,
    yearsOfSustainability,
    monthsUntilFirstStress,
    recoveredSims,
    defaultingSims,
    notes,
  };
}
