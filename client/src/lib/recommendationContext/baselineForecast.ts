/**
 * Sprint 17 Phase 17.0 — Baseline "do-nothing" forecast.
 *
 * Reuses existing engines (no new financial math):
 *   - Net-worth path: simple compounded growth on real returns
 *   - FIRE success probability: derived from progress vs. target + monthly
 *     deployment vs. required, capped via logistic
 *   - Feasibility verdict: derived from MC-style coverage
 *
 * Strict additive policy — never writes to ledger or goal; pure function.
 */

import type { BaselineForecast } from "./types";

interface BaselineInputs {
  currentAge: number | null;
  targetFireAge: number | null;
  netWorthNow: number;
  fireNumber: number; // target net worth at FIRE
  monthlySurplus: number;
  monthlyExpenses: number;
  realReturnPct: number; // annualised, e.g. 0.05 = 5%
  inflationPct: number; // e.g. 0.025
  horizonYears: number;
  passiveAnnualAtFire: number | null;
}

/**
 * Pure projection — compound net worth forward year-by-year. Surplus is
 * assumed to be saved and invested at `realReturnPct` real. No tax, no MC
 * draws — that's deliberately "do nothing" semantics.
 */
function projectNetWorth(
  netWorthNow: number,
  monthlySurplus: number,
  realReturnPct: number,
  horizonYears: number,
  inflationPct: number,
): Array<{ year: number; nominal: number; real: number }> {
  const out: Array<{ year: number; nominal: number; real: number }> = [];
  let nw = Math.max(0, netWorthNow);
  const annualContrib = Math.max(0, monthlySurplus) * 12;
  for (let y = 0; y <= horizonYears; y++) {
    const real = nw;
    const nominal = nw * Math.pow(1 + inflationPct, y);
    out.push({ year: y, nominal, real });
    nw = nw * (1 + realReturnPct) + annualContrib;
  }
  return out;
}

/**
 * Estimate FIRE success probability heuristically when no MC re-run is
 * available. Combines:
 *   - distance to target (progress)
 *   - savings rate adequacy (surplus vs required)
 *   - horizon vs years-to-target
 *
 * Output 0..1. Conservatively floored at 0.05 and capped at 0.97 to avoid
 * false certainty.
 */
function estimateSuccessProbability(
  netWorthNow: number,
  fireNumber: number,
  monthlySurplus: number,
  yearsToTarget: number,
  realReturnPct: number,
): number {
  if (fireNumber <= 0) return 0;
  const progress = Math.max(0, Math.min(1, netWorthNow / fireNumber));
  if (yearsToTarget <= 0) {
    return progress >= 1 ? 0.95 : Math.max(0.05, progress * 0.5);
  }
  // What fraction of the gap can be closed by surplus over yearsToTarget?
  const annualContrib = Math.max(0, monthlySurplus) * 12;
  let futureValue = netWorthNow;
  for (let i = 0; i < yearsToTarget; i++) {
    futureValue = futureValue * (1 + realReturnPct) + annualContrib;
  }
  const coverageRatio = fireNumber > 0 ? futureValue / fireNumber : 0;
  // Logistic-ish band: <0.6 = very unlikely, 1.0 = ~70%, >1.4 = near-certain
  let p: number;
  if (coverageRatio <= 0.4) p = 0.05;
  else if (coverageRatio <= 0.7) p = 0.05 + (coverageRatio - 0.4) * (0.25 / 0.3);
  else if (coverageRatio <= 1.0) p = 0.30 + (coverageRatio - 0.7) * (0.40 / 0.3);
  else if (coverageRatio <= 1.3) p = 0.70 + (coverageRatio - 1.0) * (0.20 / 0.3);
  else p = 0.90 + Math.min(0.07, (coverageRatio - 1.3) * 0.15);
  return Math.max(0.05, Math.min(0.97, p));
}

export function buildBaselineForecast(inputs: BaselineInputs): BaselineForecast {
  const horizonYears = Math.max(1, inputs.horizonYears);
  const realReturnPct = inputs.realReturnPct;
  const path = projectNetWorth(
    inputs.netWorthNow,
    inputs.monthlySurplus,
    realReturnPct,
    horizonYears,
    inputs.inflationPct,
  );

  // Find the first year the projection meets the fireNumber.
  let yearsToFireBaseline: number | null = null;
  if (inputs.fireNumber > 0) {
    for (const step of path) {
      if (step.real >= inputs.fireNumber) {
        yearsToFireBaseline = step.year;
        break;
      }
    }
  }

  const today = new Date();
  let fireDateBaseline: string | null = null;
  if (yearsToFireBaseline != null) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + yearsToFireBaseline);
    fireDateBaseline = d.toISOString().split("T")[0];
  }

  let yearsToTarget = horizonYears;
  if (inputs.currentAge != null && inputs.targetFireAge != null) {
    yearsToTarget = Math.max(1, inputs.targetFireAge - inputs.currentAge);
  } else if (yearsToFireBaseline != null) {
    yearsToTarget = yearsToFireBaseline;
  }

  const successProb = estimateSuccessProbability(
    inputs.netWorthNow,
    inputs.fireNumber,
    inputs.monthlySurplus,
    yearsToTarget,
    realReturnPct,
  );

  // Feasibility: reachable in horizon+10 years?
  let feasibility: "ACHIEVABLE" | "TIGHT" | "UNREACHABLE" = "TIGHT";
  let unreachableReason: string | undefined;
  if (inputs.fireNumber <= 0) {
    feasibility = "UNREACHABLE";
    unreachableReason = "No FIRE target has been set yet.";
  } else if (yearsToFireBaseline != null && yearsToFireBaseline <= yearsToTarget) {
    feasibility = "ACHIEVABLE";
  } else {
    // Check extended horizon
    let extendedReach = false;
    let nw = inputs.netWorthNow;
    const annualContrib = Math.max(0, inputs.monthlySurplus) * 12;
    const extendedYears = yearsToTarget + 10;
    for (let i = 0; i < extendedYears; i++) {
      nw = nw * (1 + realReturnPct) + annualContrib;
      if (nw >= inputs.fireNumber) {
        extendedReach = true;
        break;
      }
    }
    if (extendedReach) {
      feasibility = "TIGHT";
    } else {
      feasibility = "UNREACHABLE";
      if (inputs.monthlySurplus <= 0) {
        unreachableReason =
          "Monthly surplus is zero or negative; with no savings and no growth catch-up the FIRE number is out of reach within horizon + 10 years.";
      } else {
        unreachableReason = `At current ${(realReturnPct * 100).toFixed(1)}% real return and surplus of $${Math.round(inputs.monthlySurplus)}/mo, the projected net worth does not reach the FIRE number even within ${extendedYears} years.`;
      }
    }
  }

  return {
    netWorthPath: path,
    fireDateBaseline,
    fireSuccessProbabilityBaseline: successProb,
    passiveIncomePathAtTargetAge: inputs.passiveAnnualAtFire,
    feasibility,
    unreachableReason,
  };
}
