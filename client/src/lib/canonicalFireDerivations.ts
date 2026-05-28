/**
 * canonicalFireDerivations.ts — Sprint 20 PR-F1 pure derivation engine.
 *
 * Closed-form, deterministic derivations the canonical FIRE settings surface
 * (and any downstream engine that wants the same numbers) calls into.
 *
 * Hard constraints carried from session:
 *   - Pure functions, no I/O, no React, no global clock except via opts.
 *   - PPOR handling preserved from the legacy engine: required asset base
 *     EQUALS required net worth. The legacy compute (canonicalFire.ts) treats
 *     FIRE number = passive*12/SWR and renders it against canonical net worth
 *     INCLUDING PPOR; we keep that contract verbatim so the demo household's
 *     "~$2.7M for FIRE 2040 / $9,000/mo" target is preserved bit-identically.
 *   - Feasibility blockers are plain-language user-facing strings (no engine
 *     jargon, no engine internals leaking).
 */

import {
  DEFAULT_LIQUIDITY_BUFFER_MONTHS,
  DEFAULT_MAX_RISK_TOLERANCE,
  DEFAULT_SWR_DECIMAL,
  type CanonicalFireRiskTolerance,
  type CanonicalFireTarget,
} from "@/types/canonicalFire";

/** Household snapshot consumed by the feasibility evaluator. */
export interface FireFeasibilityHousehold {
  /** Calendar year used as the "now" reference. */
  currentYear: number;
  /** Net worth today, AUD (canonical: assets − liabilities, including PPOR). */
  currentNetWorth: number;
  /** Monthly surplus available to invest (income − expenses − debt service). */
  currentMonthlySurplus: number;
  /** Cash + offset, AUD. Used for liquidity buffer check. */
  liquidAssets: number;
  /** Monthly expenses, AUD. Used for liquidity buffer check. */
  monthlyExpenses: number;
  /** Long-run expected real return on the invested portfolio, decimal. */
  expectedAnnualReturn: number;
}

/**
 * Effective SWR (decimal) used for required-asset-base derivation.
 *
 * If advanced.safeWithdrawalRateOverride is set and > 0, use it; otherwise
 * fall back to DEFAULT_SWR_DECIMAL (0.04 = 4%, the long-running Trinity-study
 * default already used elsewhere in the app).
 */
export function effectiveSwr(target: CanonicalFireTarget): number {
  const override = target.advanced?.safeWithdrawalRateOverride;
  if (Number.isFinite(override) && (override as number) > 0) {
    return override as number;
  }
  return DEFAULT_SWR_DECIMAL;
}

/**
 * Required net worth at FIRE year.
 *
 * If advanced.targetNetWorth is explicitly set, use it; otherwise compute
 *   (targetPassiveIncomeMonthly * 12) / effectiveSwr(target)
 *
 * Returns 0 for non-positive / non-finite passive income so the UI can show
 * an empty state rather than NaN.
 */
export function requiredNetWorth(target: CanonicalFireTarget): number {
  const explicit = target.advanced?.targetNetWorth;
  if (Number.isFinite(explicit) && (explicit as number) > 0) {
    return explicit as number;
  }
  const monthly = target.targetPassiveIncomeMonthly;
  if (!Number.isFinite(monthly) || monthly <= 0) return 0;
  const swr = effectiveSwr(target);
  if (swr <= 0) return 0;
  return (monthly * 12) / swr;
}

/**
 * Required asset base for income.
 *
 * PPOR-handling note: the legacy canonical engine (selectCanonicalFire +
 * computeCanonicalFire) computes FIRE number = passive*12/SWR and compares it
 * against canonical net worth INCLUDING PPOR equity — i.e. it does NOT
 * subtract PPOR equity from the required asset base. We preserve that
 * contract here. Demo household: 9000*12/0.04 = 2,700,000 — matches the
 * existing canonical value documented in fireGoalCanonicalMigration.test.ts.
 */
export function requiredAssetBaseForIncome(target: CanonicalFireTarget): number {
  return requiredNetWorth(target);
}

/**
 * Closed-form monthly investing required to bridge the gap by the FIRE year.
 *
 * Future value of annuity (monthly compounding):
 *
 *   FV  = PV * (1 + r)^n  +  PMT * ((1 + r)^n − 1) / r
 *
 * where
 *   FV  = requiredNetWorth(target)            target asset base
 *   PV  = currentNetWorth                     starting balance
 *   n   = yearsToTarget * 12                  number of monthly periods
 *   r   = expectedAnnualReturn / 12           monthly real return
 *
 * Solving for PMT:
 *
 *   PMT = (FV − PV * (1 + r)^n) / ((1 + r)^n − 1) * r
 *
 * Returns 0 when no contributions are needed (PV already meets FV), and
 * +Infinity when years-to-target is zero (i.e. FIRE year ≤ current year)
 * and the current NW is short of the target.
 */
export function requiredMonthlyInvesting(
  target: CanonicalFireTarget,
  currentNetWorth: number,
  yearsToTarget: number,
  expectedAnnualReturn: number,
): number {
  const fv = requiredNetWorth(target);
  if (!Number.isFinite(fv) || fv <= 0) return 0;
  const pv = Number.isFinite(currentNetWorth) ? currentNetWorth : 0;
  if (pv >= fv) return 0;
  if (!Number.isFinite(yearsToTarget) || yearsToTarget <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const n = yearsToTarget * 12;
  const r =
    Number.isFinite(expectedAnnualReturn) && expectedAnnualReturn > 0
      ? expectedAnnualReturn / 12
      : 0;
  if (r === 0) {
    return (fv - pv) / n;
  }
  const compound = Math.pow(1 + r, n);
  const numerator = fv - pv * compound;
  const denominator = (compound - 1) / r;
  if (denominator <= 0) return Number.POSITIVE_INFINITY;
  return numerator / denominator;
}

/** Feasibility band returned by feasibilityScore. */
export type FireFeasibilityBand = "easy" | "moderate" | "stretch" | "infeasible";

export interface FireFeasibilityResult {
  /** 0..1 — heuristic score. NOT a probability. */
  score: number;
  band: FireFeasibilityBand;
  /** Plain-language reasons the goal is not "easy". Empty when band==="easy". */
  blockers: string[];
}

/**
 * Heuristic feasibility scorer. Combines four checks:
 *   1. Surplus-to-required-investment ratio (largest weight).
 *   2. Liquidity buffer in months (against advanced.minLiquidityBufferMonths
 *      or DEFAULT_LIQUIDITY_BUFFER_MONTHS).
 *   3. Years-to-target presence (zero or negative means infeasible).
 *   4. Whether passive income / FIRE year are set at all.
 *
 * This is intentionally a heuristic, not a probability. PR-F4 wires Monte
 * Carlo confidence; F1 only surfaces a deterministic band so the canonical
 * surface is never blank.
 */
export function feasibilityScore(
  target: CanonicalFireTarget,
  household: FireFeasibilityHousehold,
): FireFeasibilityResult {
  const blockers: string[] = [];

  // Missing primary inputs.
  if (!Number.isFinite(target.targetFireYear) || target.targetFireYear <= 0) {
    blockers.push("Pick a target FIRE year.");
  }
  if (
    !Number.isFinite(target.targetPassiveIncomeMonthly) ||
    target.targetPassiveIncomeMonthly <= 0
  ) {
    blockers.push("Set a monthly passive income target.");
  }

  if (blockers.length > 0) {
    return { score: 0, band: "infeasible", blockers };
  }

  const yearsToTarget = target.targetFireYear - household.currentYear;
  if (yearsToTarget <= 0) {
    blockers.push("Target FIRE year is in the past — pick a future year.");
    return { score: 0, band: "infeasible", blockers };
  }

  const fv = requiredNetWorth(target);
  const pmt = requiredMonthlyInvesting(
    target,
    household.currentNetWorth,
    yearsToTarget,
    household.expectedAnnualReturn,
  );
  const surplus = household.currentMonthlySurplus;

  // Surplus check.
  let surplusRatio = 1;
  if (pmt === Number.POSITIVE_INFINITY) {
    surplusRatio = 0;
    blockers.push("Target year is too soon for the gap to close from savings alone.");
  } else if (pmt > 0) {
    surplusRatio =
      surplus > 0 ? Math.min(1, surplus / pmt) : 0;
    if (surplus <= 0) {
      blockers.push("You have no monthly surplus to invest toward this goal.");
    } else if (surplus < pmt) {
      blockers.push(
        `Monthly surplus ($${Math.round(surplus).toLocaleString()}) is below the required investment (~$${Math.round(pmt).toLocaleString()}).`,
      );
    }
  }

  // Liquidity buffer.
  const minBuffer =
    target.advanced?.minLiquidityBufferMonths ?? DEFAULT_LIQUIDITY_BUFFER_MONTHS;
  const liquidityMonths =
    household.monthlyExpenses > 0
      ? household.liquidAssets / household.monthlyExpenses
      : Number.POSITIVE_INFINITY;
  const liquidityOk = liquidityMonths >= minBuffer;
  if (!liquidityOk) {
    blockers.push(
      `Cash + offset cover only ${liquidityMonths.toFixed(1)} months — below the ${minBuffer}-month buffer.`,
    );
  }

  // Already there?
  const alreadyThere = household.currentNetWorth >= fv;
  if (alreadyThere) {
    return { score: 1, band: "easy", blockers: [] };
  }

  // Weighted score: 0.7 surplus, 0.2 liquidity, 0.1 time horizon.
  const horizonRatio = Math.min(1, yearsToTarget / 30);
  const score =
    0.7 * surplusRatio + 0.2 * (liquidityOk ? 1 : Math.max(0, liquidityMonths / minBuffer)) +
    0.1 * horizonRatio;

  let band: FireFeasibilityBand;
  if (score >= 0.85) band = "easy";
  else if (score >= 0.6) band = "moderate";
  else if (score >= 0.3) band = "stretch";
  else band = "infeasible";

  return { score, band, blockers };
}

/**
 * Helper used by the canonical surface to display the user's selected max
 * risk tolerance. Pure pass-through with default.
 */
export function effectiveMaxRiskTolerance(
  target: CanonicalFireTarget,
): CanonicalFireRiskTolerance {
  return target.advanced?.maxRiskTolerance ?? DEFAULT_MAX_RISK_TOLERANCE;
}

/** Months of cash + offset, used by the canonical-surface display row. */
export function effectiveMinLiquidityBufferMonths(
  target: CanonicalFireTarget,
): number {
  const v = target.advanced?.minLiquidityBufferMonths;
  if (Number.isFinite(v) && (v as number) >= 0) return v as number;
  return DEFAULT_LIQUIDITY_BUFFER_MONTHS;
}
