/**
 * Scenario Engine V2 — Wage Shock Engine (Sprint 2B).
 *
 * Stochastic employment/income shocks layered ON TOP of the deterministic
 * wage path. Designed to slot into the existing seeded Monte Carlo without
 * disturbing determinism — given the same `(parentSeed, simIndex)` pair we
 * always produce the same draw sequence.
 *
 * Parameters:
 *   • jobLossAnnualProb   — Probability the household experiences at least
 *                           one job-loss event in a given calendar year.
 *                           Internally converted to a per-month Bernoulli.
 *   • partialIncomeReductionFactor
 *                         — Once a shock fires, monthly gross is multiplied
 *                           by this factor (e.g. 0.40 = 60% income loss for
 *                           a single-earner household; for a couple, callers
 *                           may pass 0.70 to reflect one earner losing work).
 *   • recoveryMonths      — Number of months the shock persists. After this
 *                           many months the multiplier linearly returns to
 *                           1.0 over `recoveryTaperMonths`.
 *   • recoveryTaperMonths — How quickly the multiplier returns to 1.0 once
 *                           the recovery clock starts ticking.
 *   • householdResilience — A floor multiplier applied to the active shock
 *                           multiplier — e.g. resilience=0.20 means the
 *                           effective multiplier is min(1, shockMul + 0.20),
 *                           capturing other partner's income, JobSeeker,
 *                           insurance payouts, savings rotation, etc.
 *
 * The engine is intentionally minimal: one shock per sim per horizon by
 * default. Sprint 2C can extend to multi-shock Poisson processes.
 */

import type { SeededRng } from "./determinism";

export interface WageShockParams {
  jobLossAnnualProb: number;
  partialIncomeReductionFactor: number;
  recoveryMonths: number;
  recoveryTaperMonths: number;
  householdResilience: number;
}

export const DEFAULT_WAGE_SHOCK: WageShockParams = {
  jobLossAnnualProb: 0.06,            // ~6% chance any given year
  partialIncomeReductionFactor: 0.55, // 45% income loss when shock fires
  recoveryMonths: 6,
  recoveryTaperMonths: 6,
  householdResilience: 0.20,
};

/**
 * Per-sim wage-shock state. Constructed once per simulation and updated each
 * month inside the Monte Carlo loop.
 */
export interface WageShockState {
  /** Month index when the shock fired (-1 if no shock yet). */
  firedAtMonth: number;
  /** Cumulative number of shock months experienced this sim. */
  shockMonths: number;
}

export function makeWageShockState(): WageShockState {
  return { firedAtMonth: -1, shockMonths: 0 };
}

/**
 * Draw the wage-shock multiplier for a given month. Returns 1.0 when no
 * shock is active.
 *
 * The shock is sampled lazily: each month before a shock has fired we
 * Bernoulli-trial against `jobLossAnnualProb/12`. The trial advances the
 * supplied rng — same seed → same fire month deterministically.
 */
export function stepWageShock(
  rng: SeededRng,
  state: WageShockState,
  monthIndex: number,
  params: WageShockParams = DEFAULT_WAGE_SHOCK,
): number {
  if (state.firedAtMonth < 0) {
    const monthlyProb = Math.min(1, Math.max(0, params.jobLossAnnualProb / 12));
    if (rng.next() < monthlyProb) {
      state.firedAtMonth = monthIndex;
    } else {
      return 1.0;
    }
  }

  const elapsed = monthIndex - state.firedAtMonth;
  const totalDuration = params.recoveryMonths + params.recoveryTaperMonths;
  if (elapsed >= totalDuration) return 1.0;

  state.shockMonths += 1;

  let rawMul: number;
  if (elapsed < params.recoveryMonths) {
    rawMul = params.partialIncomeReductionFactor;
  } else {
    const taperProg = (elapsed - params.recoveryMonths) /
      Math.max(1, params.recoveryTaperMonths);
    rawMul =
      params.partialIncomeReductionFactor +
      (1 - params.partialIncomeReductionFactor) * Math.min(1, taperProg);
  }

  // Household resilience props the multiplier up — never below the raw
  // multiplier, never above 1.0.
  const cushioned = Math.min(
    1,
    Math.max(rawMul, rawMul + Math.max(0, params.householdResilience)),
  );
  return cushioned;
}

/** Roll a wage-shock state forward into a serialisable audit row. */
export interface WageShockAuditRow {
  fired: boolean;
  firedAtMonth: number;
  shockMonths: number;
  params: WageShockParams;
}

export function snapshotWageShock(
  state: WageShockState,
  params: WageShockParams = DEFAULT_WAGE_SHOCK,
): WageShockAuditRow {
  return {
    fired: state.firedAtMonth >= 0,
    firedAtMonth: state.firedAtMonth,
    shockMonths: state.shockMonths,
    params,
  };
}
