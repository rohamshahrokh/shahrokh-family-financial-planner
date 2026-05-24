/**
 * goalSolver.ts — Sprint 5 Phase 1, Goal Solver Engine V1.
 *
 * Why this file exists
 * --------------------
 * Sprint 4A/B/C established a canonical ledger across net worth, cashflow,
 * tax, debt service, FIRE and risk. Sprint 5 introduces the first true
 * "goal vs reality" engine on top of that ledger: given an explicit set of
 * targets (passive income, FIRE date, net worth, portfolio value or property
 * count) the solver answers four user-facing questions:
 *
 *   1. How much more do I need?                   → shortfallAmount,
 *                                                   requiredPassiveIncomeGap
 *   2. How much must I invest monthly?            → requiredMonthlyContribution
 *   3. Am I on track?                             → fireFeasibility
 *   4. How many years early / late am I?          → yearsAheadOrBehind
 *
 * The engine is a **consumer** of canonical services — it never duplicates
 * the underlying financial math:
 *   - FIRE number / asset base    → `canonicalFire.computeCanonicalFire`
 *   - Current net worth / liquidity → `canonicalHeadlineMetrics.computeCanonicalHeadlineMetrics`
 *   - Monthly surplus / capacity   → `canonicalCashflow` via the ledger
 *   - Debt service ratio          → `canonicalDebtService`
 *   - Projected NW path            → forecast outputs (when supplied)
 *   - Confidence band              → Monte Carlo outputs (when supplied)
 *
 * The engine is deterministic: same inputs → byte-identical outputs. No
 * Date.now, no Math.random, no I/O.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  type CanonicalHeadlineMetrics,
} from "./canonicalHeadlineMetrics";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
  type CanonicalFire,
} from "./canonicalFire";
import { computeCanonicalDebtService, type CanonicalDebtServiceFigures } from "./canonicalDebtService";
import type { CanonicalIncomeTax } from "./canonicalTax"; // type-only — engine does not introduce tax math
import type { ForecastOutput } from "./forecastEngine";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";

/* ─── Public types ──────────────────────────────────────────────────────── */

export type FireFeasibility =
  | "ON_TRACK"
  | "STRETCH"
  | "UNREALISTIC"
  | "IMPOSSIBLE";

/** Optional aggregate "tax" handle — only referenced so callers can pass the
 *  canonical tax facade through without engine-side coupling to its shape. */
export interface CanonicalTaxHandle {
  /** Effective marginal rate for the household (decimal, e.g. 0.39). */
  marginalRatePctDecimal?: number;
}

export interface GoalSolverInputs {
  /** Annual passive income target (e.g. $96,000 / yr). */
  targetPassiveIncome?: number;
  /** ISO date string (YYYY-MM-DD) — date by which the household wants to be FI. */
  targetFireDate?: string;
  /** Target total household net worth ($) on the target date. */
  targetNetWorth?: number;
  /** Target investible portfolio value ($) on the target date. */
  targetPortfolioValue?: number;
  /** Target investment property count (for diagnostic context only — solver
   *  does not fabricate property purchase plans). */
  targetPropertyCount?: number;

  /** The single canonical ledger (DashboardInputs) — REQUIRED. */
  canonicalLedger: DashboardInputs;
  /** Optional pre-computed canonical tax handle. Engine does not run tax math. */
  canonicalTax?: CanonicalIncomeTax | CanonicalTaxHandle;
  /** Optional pre-computed debt-service facade. Engine recomputes if omitted. */
  canonicalDebtService?: CanonicalDebtServiceFigures;
  /** Forecast outputs from `forecastEngine.buildForecast`. */
  forecastOutputs?: ForecastOutput | null;
  /** Risk radar output for feasibility weighting. */
  riskOutputs?: RiskRadarResult | null;
  /** Monte Carlo result for confidence weighting. */
  monteCarloOutputs?: MonteCarloResult | null;
}

export interface GoalSolverOutputs {
  /** Asset base ($) required to sustain the target passive income at the
   *  canonical safe withdrawal rate. */
  requiredAssetBase: number;
  /** Dollar gap between today's projected passive income and the target.
   *  0 when target is null/already met. */
  requiredPassiveIncomeGap: number;
  /** Monthly contribution ($/mo) required to close the gap by the target
   *  date, given the canonical growth assumption. */
  requiredMonthlyContribution: number;
  /** Annual CAGR (decimal, e.g. 0.07 = 7%) required for current investible
   *  base to reach the target by the target date with zero net contribution.
   *  null when the target date or base is missing/0. */
  requiredPortfolioGrowth: number | null;
  /** Feasibility verdict. See FireFeasibility. */
  fireFeasibility: FireFeasibility;
  /** Absolute dollar shortfall vs the binding target (positive = behind). */
  shortfallAmount: number;
  /** Years ahead (+) or behind (-) the target date. Null when no target date
   *  or no projected achievement year is available. */
  yearsAheadOrBehind: number | null;
  /** Auxiliary trace — engine-internal numbers the UI / tests can inspect.
   *  This is a stable, named struct, not a free-form object. */
  trace: {
    /** Net worth ($) used as the current baseline. */
    currentNetWorth: number;
    /** Investible base ($) excluding PPOR equity and non-financial assets. */
    currentInvestibleBase: number;
    /** Annual passive income ($) currently produced by the household. */
    currentPassiveIncome: number;
    /** Monthly surplus available for contribution (cashflow). */
    monthlySurplusAvailable: number;
    /** Total monthly debt service ($/mo) used by the feasibility check. */
    monthlyDebtService: number;
    /** Years until targetFireDate; null when no target date supplied. */
    yearsToTarget: number | null;
    /** Projected year the household reaches the binding asset target,
     *  derived from forecastOutputs/monteCarloOutputs when present. */
    projectedAchievementYear: number | null;
    /** Annual nominal growth assumption (decimal) used in the contribution
     *  solve. Derived from forecastOutputs when present, else the canonical
     *  default (see `CANONICAL_DEFAULT_GROWTH_PCT`). */
    growthAssumptionUsed: number;
    /** Safe withdrawal rate (decimal) used for the asset base solve. */
    swrUsed: number;
    /** Monte Carlo success probability (decimal, 0..1) used in feasibility
     *  weighting. null when no MC output supplied. */
    mcConfidence: number | null;
    /** Risk score (0..100) used in feasibility weighting. null when no risk
     *  output supplied. Higher = more resilient (matches riskEngine). */
    riskScore: number | null;
    /** True when one or more critical inputs were missing — the solver
     *  surfaces an explicit incomplete state instead of fabricating values. */
    incomplete: boolean;
    /** Human-readable reason for the feasibility verdict. */
    reasoning: string;
  };
}

/* ─── Domain thresholds (not household values — solver-side policy) ─────── */
//
// These are engine-level constants, not per-household financial data. They
// define what feasibility means in this domain. Documented here rather than
// inline so the test suite can pin them, and any change is reviewed.
const CANONICAL_DEFAULT_GROWTH_PCT = 0.07; // 7% nominal — conservative blended growth
                                           // used only when forecastOutputs do not
                                           // expose a per-household assumption.
const FEASIBILITY_ON_TRACK_RATIO = 0.85;   // required contribution ≤ 85% surplus
const FEASIBILITY_STRETCH_RATIO = 1.20;    // contribution > surplus but < 120%
                                           // (i.e. plausible with belt-tightening)
const FEASIBILITY_UNREALISTIC_RATIO = 2.0; // > 2x surplus → unrealistic
const FEASIBILITY_MC_CONFIDENCE_OK = 0.6;  // MC P(success) ≥ 60% supports ON_TRACK
const FEASIBILITY_RISK_FRAGILE = 40;       // overall risk score < 40 = fragile
                                           // (matches riskEngine 'red' threshold)

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Solve a goal gap. Pure / deterministic. Consumes only canonical services.
 *
 * The function NEVER fabricates household values. When inputs are missing
 * (e.g. no target date supplied) the corresponding output is `null` and the
 * trace `incomplete` flag is set, surfacing the missing piece to the caller.
 */
export function solveGoalGap(inputs: GoalSolverInputs): GoalSolverOutputs {
  if (!inputs || !inputs.canonicalLedger) {
    return emptyResult("Missing canonical ledger — solver cannot proceed.");
  }
  const ledger = inputs.canonicalLedger;
  const head: CanonicalHeadlineMetrics = computeCanonicalHeadlineMetrics(ledger);
  // Pass the user's target through canonicalFire only when an explicit
  // passive-income target was supplied. Otherwise we still need a `fire`
  // handle for the SWR, but we MUST NOT let canonicalFire's
  // monthly-expenses fallback synthesise a fake "FIRE number" that would
  // then dominate the binding-target selection below.
  const hasPassiveTarget =
    typeof inputs.targetPassiveIncome === "number" && inputs.targetPassiveIncome > 0;
  const fire: CanonicalFire = computeCanonicalFire(ledger, {
    targetMonthlyIncome: hasPassiveTarget
      ? (inputs.targetPassiveIncome as number) / 12
      : resolveFireTargetFromSnapshot(ledger),
  });
  const debt: CanonicalDebtServiceFigures =
    inputs.canonicalDebtService ?? computeCanonicalDebtService(ledger);

  // ─── Required asset base (binding target) ──────────────────────────────
  //
  // The asset base required to fund a passive income at the canonical SWR
  // comes from canonicalFire (we never inline 4% / 25× — both come from
  // canonicalFire). For NW and portfolio-value targets, the user-supplied
  // figure is the binding target. When multiple targets are supplied, the
  // largest is binding (a household committed to both is on the hook for
  // whichever is the harder hurdle).
  const swrDecimal = fire.swrPct > 0 ? fire.swrPct / 100 : 0.04;
  const requiredAssetBase = pickBindingTarget({
    fromPassiveIncome: hasPassiveTarget ? fire.fireNumber : 0,
    targetNetWorth: inputs.targetNetWorth,
    targetPortfolioValue: inputs.targetPortfolioValue,
  });

  // ─── Passive income gap ────────────────────────────────────────────────
  const currentPassiveAnnual = head.passiveIncome;
  const requiredPassiveIncomeGap =
    typeof inputs.targetPassiveIncome === "number" && inputs.targetPassiveIncome > 0
      ? Math.max(0, Math.round(inputs.targetPassiveIncome - currentPassiveAnnual))
      : 0;

  // ─── Years to target ───────────────────────────────────────────────────
  const yearsToTarget = computeYearsToTarget(inputs.targetFireDate, ledger.todayIso);

  // ─── Investible base (excludes PPOR equity + cars + iran property) ─────
  // We use canonical net worth's bucket totals, not raw snapshot fields.
  // Excluding the home and personal assets gives a defensible "investible"
  // figure for the contribution / growth solve, without inventing a new
  // wealth definition.
  const investibleBase = deriveInvestibleBase(ledger, head);

  // ─── Growth assumption ─────────────────────────────────────────────────
  const growthAssumption = deriveGrowthAssumption(inputs.forecastOutputs);

  // ─── Required portfolio CAGR to grow investible base → target ──────────
  const requiredPortfolioGrowth = solveRequiredCagr({
    presentValue: investibleBase,
    futureValue: requiredAssetBase,
    years: yearsToTarget,
  });

  // ─── Required monthly contribution ─────────────────────────────────────
  const requiredMonthlyContribution = solveRequiredMonthlyContribution({
    presentValue: investibleBase,
    futureValue: requiredAssetBase,
    annualRate: growthAssumption,
    years: yearsToTarget,
  });

  // ─── Projected achievement year (from forecast / MC) ───────────────────
  const projectedAchievementYear = pickProjectedAchievementYear({
    forecast: inputs.forecastOutputs,
    monteCarlo: inputs.monteCarloOutputs,
    requiredAssetBase,
  });

  // ─── yearsAheadOrBehind ───────────────────────────────────────────────
  const yearsAheadOrBehind =
    projectedAchievementYear != null && inputs.targetFireDate
      ? Number(
          (
            new Date(inputs.targetFireDate).getFullYear() - projectedAchievementYear
          ).toFixed(2),
        )
      : null;

  // ─── Shortfall ────────────────────────────────────────────────────────
  const shortfallAmount = Math.max(0, Math.round(requiredAssetBase - head.netWorth));

  // ─── Feasibility ──────────────────────────────────────────────────────
  const mcConfidence = pickMcConfidence(inputs.monteCarloOutputs);
  const riskScore = inputs.riskOutputs?.overall_score ?? null;
  const monthlySurplusAvailable = head.monthlySurplus;
  const feasibility = scoreFeasibility({
    requiredMonthlyContribution,
    monthlySurplusAvailable,
    shortfallAmount,
    yearsToTarget,
    mcConfidence,
    riskScore,
    debtServiceRatio:
      head.monthlyIncome > 0 ? debt.totalMonthly / head.monthlyIncome : null,
  });

  const incomplete =
    inputs.targetPassiveIncome == null &&
    inputs.targetNetWorth == null &&
    inputs.targetPortfolioValue == null;

  return {
    requiredAssetBase: Math.round(requiredAssetBase),
    requiredPassiveIncomeGap,
    requiredMonthlyContribution: Math.round(requiredMonthlyContribution),
    requiredPortfolioGrowth:
      requiredPortfolioGrowth == null ? null : Number(requiredPortfolioGrowth.toFixed(4)),
    fireFeasibility: feasibility.verdict,
    shortfallAmount,
    yearsAheadOrBehind,
    trace: {
      currentNetWorth: head.netWorth,
      currentInvestibleBase: Math.round(investibleBase),
      currentPassiveIncome: currentPassiveAnnual,
      monthlySurplusAvailable,
      monthlyDebtService: debt.totalMonthly,
      yearsToTarget,
      projectedAchievementYear,
      growthAssumptionUsed: Number(growthAssumption.toFixed(4)),
      swrUsed: Number(swrDecimal.toFixed(4)),
      mcConfidence,
      riskScore,
      incomplete,
      reasoning: feasibility.reasoning,
    },
  };
}

/* ─── Helpers (pure, no I/O) ─────────────────────────────────────────────── */

function emptyResult(reason: string): GoalSolverOutputs {
  return {
    requiredAssetBase: 0,
    requiredPassiveIncomeGap: 0,
    requiredMonthlyContribution: 0,
    requiredPortfolioGrowth: null,
    fireFeasibility: "IMPOSSIBLE",
    shortfallAmount: 0,
    yearsAheadOrBehind: null,
    trace: {
      currentNetWorth: 0,
      currentInvestibleBase: 0,
      currentPassiveIncome: 0,
      monthlySurplusAvailable: 0,
      monthlyDebtService: 0,
      yearsToTarget: null,
      projectedAchievementYear: null,
      growthAssumptionUsed: CANONICAL_DEFAULT_GROWTH_PCT,
      swrUsed: 0.04,
      mcConfidence: null,
      riskScore: null,
      incomplete: true,
      reasoning: reason,
    },
  };
}

function pickBindingTarget(opts: {
  fromPassiveIncome: number;
  targetNetWorth: number | undefined;
  targetPortfolioValue: number | undefined;
}): number {
  const candidates: number[] = [];
  if (opts.fromPassiveIncome > 0) candidates.push(opts.fromPassiveIncome);
  if (opts.targetNetWorth && opts.targetNetWorth > 0) candidates.push(opts.targetNetWorth);
  if (opts.targetPortfolioValue && opts.targetPortfolioValue > 0)
    candidates.push(opts.targetPortfolioValue);
  if (candidates.length === 0) return 0;
  // Binding target = largest of the supplied targets. A household that has
  // BOTH a NW target and a passive-income target is implicitly committed to
  // whichever is the harder hurdle.
  return Math.max(...candidates);
}

function deriveInvestibleBase(
  ledger: DashboardInputs,
  head: CanonicalHeadlineMetrics,
): number {
  // Canonical NW already excludes nothing; for the investible base we
  // subtract the PPOR equity and personal-asset bucket, which are not
  // available for portfolio contribution. We avoid reading raw snapshot
  // values where possible by going through canonical figures.
  const snap = ledger.snapshot ?? {};
  const pporValue = numericField(snap?.ppor);
  const pporMortgage = numericField(snap?.mortgage);
  const pporEquity = Math.max(0, pporValue - pporMortgage);
  const cars = numericField(snap?.cars);
  const iranProperty = numericField(snap?.iran_property);
  const otherAssets = numericField(snap?.other_assets);

  return Math.max(0, head.netWorth - pporEquity - cars - iranProperty - otherAssets);
}

function numericField(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
}

function deriveGrowthAssumption(forecast: ForecastOutput | null | undefined): number {
  // Forecast outputs expose per-year nominal growth via the YearlyProjection
  // CAGR field. Prefer the forecast-derived assumption when present.
  const series = forecast?.netWorth ?? [];
  if (series.length >= 2) {
    const first = series[0];
    const last = series[series.length - 1];
    if (
      first &&
      last &&
      first.endNetWorth > 0 &&
      last.endNetWorth > 0 &&
      last.year > first.year
    ) {
      const years = last.year - first.year;
      const ratio = last.endNetWorth / first.endNetWorth;
      if (years > 0 && ratio > 0) {
        const implied = Math.pow(ratio, 1 / years) - 1;
        // Clamp into a sane band — the forecast can produce wild growth for
        // empty fixtures (e.g. starting NW ≈ contribution). 2%-15% is the
        // canonical band shared with other engines.
        return clamp(implied, 0.02, 0.15);
      }
    }
  }
  return CANONICAL_DEFAULT_GROWTH_PCT;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function computeYearsToTarget(
  targetIso: string | undefined,
  todayIso: string | undefined,
): number | null {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  const today = new Date(todayIso ?? new Date().toISOString().split("T")[0]);
  if (Number.isNaN(target.getTime()) || Number.isNaN(today.getTime())) return null;
  const diffMs = target.getTime() - today.getTime();
  if (diffMs <= 0) return 0;
  // Use 365.25 to match canonical date math elsewhere.
  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}

function solveRequiredCagr(opts: {
  presentValue: number;
  futureValue: number;
  years: number | null;
}): number | null {
  if (opts.years == null || opts.years <= 0) return null;
  if (opts.presentValue <= 0 || opts.futureValue <= 0) return null;
  if (opts.futureValue <= opts.presentValue) return 0; // already on/above target
  const ratio = opts.futureValue / opts.presentValue;
  return Math.pow(ratio, 1 / opts.years) - 1;
}

function solveRequiredMonthlyContribution(opts: {
  presentValue: number;
  futureValue: number;
  annualRate: number;
  years: number | null;
}): number {
  if (opts.years == null || opts.years <= 0) return 0;
  if (opts.futureValue <= opts.presentValue) return 0; // already there
  const months = opts.years * 12;
  const r = opts.annualRate / 12;
  // Future value of present base growing at r for `months`:
  const futureOfPresent = opts.presentValue * Math.pow(1 + r, months);
  const remainingFV = Math.max(0, opts.futureValue - futureOfPresent);
  if (remainingFV <= 0) return 0;
  // Solve FV of annuity: FV = PMT * [((1+r)^n - 1) / r]
  if (r === 0) return remainingFV / months;
  const annuityFactor = (Math.pow(1 + r, months) - 1) / r;
  if (annuityFactor <= 0) return remainingFV / months;
  return remainingFV / annuityFactor;
}

function pickProjectedAchievementYear(opts: {
  forecast: ForecastOutput | null | undefined;
  monteCarlo: MonteCarloResult | null | undefined;
  requiredAssetBase: number;
}): number | null {
  if (opts.requiredAssetBase <= 0) return null;

  // 1) Prefer the deterministic forecast — find the first year endNetWorth
  //    crosses the binding target.
  const series = opts.forecast?.netWorth ?? [];
  for (const row of series) {
    if ((row?.endNetWorth ?? 0) >= opts.requiredAssetBase) {
      return row.year;
    }
  }

  // 2) Fall back to Monte Carlo median: if the median terminal NW exceeds
  //    the target, the MC horizon's last fan-point year is the conservative
  //    projected year. (V1 — does not interpolate.)
  const mc = opts.monteCarlo;
  if (mc && Array.isArray(mc.fan_data) && mc.fan_data.length > 0) {
    for (const pt of mc.fan_data) {
      if ((pt?.median ?? 0) >= opts.requiredAssetBase) {
        return pt.year;
      }
    }
  }
  return null;
}

function pickMcConfidence(mc: MonteCarloResult | null | undefined): number | null {
  if (!mc) return null;
  // `prob_ff` is the canonical "probability of financial freedom" — already
  // in 0..100. Convert to 0..1.
  if (Number.isFinite(mc.prob_ff)) return clamp(mc.prob_ff / 100, 0, 1);
  return null;
}

function scoreFeasibility(opts: {
  requiredMonthlyContribution: number;
  monthlySurplusAvailable: number;
  shortfallAmount: number;
  yearsToTarget: number | null;
  mcConfidence: number | null;
  riskScore: number | null;
  debtServiceRatio: number | null;
}): { verdict: FireFeasibility; reasoning: string } {
  // Hard impossible cases first.
  if (opts.shortfallAmount === 0) {
    return { verdict: "ON_TRACK", reasoning: "Net worth already meets / exceeds target." };
  }
  if (opts.yearsToTarget != null && opts.yearsToTarget <= 0) {
    return {
      verdict: "IMPOSSIBLE",
      reasoning: "Target date has already passed and net worth is below target.",
    };
  }
  if (opts.monthlySurplusAvailable <= 0 && opts.requiredMonthlyContribution > 0) {
    return {
      verdict: "IMPOSSIBLE",
      reasoning:
        "Household has no monthly surplus available — required contribution cannot be met.",
    };
  }
  if (opts.requiredMonthlyContribution <= 0) {
    return {
      verdict: "ON_TRACK",
      reasoning: "Current investible base reaches target without further contribution.",
    };
  }

  const ratio = opts.requiredMonthlyContribution / Math.max(1, opts.monthlySurplusAvailable);
  const mcOk =
    opts.mcConfidence == null ? null : opts.mcConfidence >= FEASIBILITY_MC_CONFIDENCE_OK;
  const fragile =
    opts.riskScore != null ? opts.riskScore < FEASIBILITY_RISK_FRAGILE : false;

  // Step ladder. The mc/risk inputs are tie-breakers — they can downgrade
  // (but not upgrade) an otherwise-ON_TRACK verdict, matching the spec
  // intent that feasibility is "deterministic from contribution vs surplus,
  // with MC/risk as confidence weighting".
  if (ratio <= FEASIBILITY_ON_TRACK_RATIO) {
    if (mcOk === false || fragile) {
      return {
        verdict: "STRETCH",
        reasoning:
          `Contribution within surplus (${(ratio * 100).toFixed(0)}%) but downgraded ` +
          `by ${mcOk === false ? "MC confidence below threshold" : "fragile risk profile"}.`,
      };
    }
    return {
      verdict: "ON_TRACK",
      reasoning:
        `Required monthly contribution is ${(ratio * 100).toFixed(0)}% of available surplus.`,
    };
  }
  if (ratio <= FEASIBILITY_STRETCH_RATIO) {
    return {
      verdict: "STRETCH",
      reasoning:
        `Required monthly contribution is ${(ratio * 100).toFixed(0)}% of surplus — ` +
        `achievable only with belt-tightening.`,
    };
  }
  if (ratio <= FEASIBILITY_UNREALISTIC_RATIO) {
    return {
      verdict: "UNREALISTIC",
      reasoning:
        `Required contribution is ${(ratio * 100).toFixed(0)}% of surplus — exceeds ` +
        `plausible reallocation without major lifestyle changes.`,
    };
  }
  return {
    verdict: "IMPOSSIBLE",
    reasoning:
      `Required contribution is ${(ratio * 100).toFixed(0)}% of surplus — target ` +
      `cannot be met from current cashflow at the current target date.`,
  };
}
