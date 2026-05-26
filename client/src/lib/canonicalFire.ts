/**
 * canonicalFire.ts — Sprint 4C single source of truth for FIRE / passive income.
 *
 * Why this file exists
 * --------------------
 * Sprint 4C audit found different FIRE figures across the surfaces:
 *   - dashboard.tsx hardcodes `(8000 * 12) / 0.04` (line ~1811).
 *   - reports.tsx uses `(monthlyExp * 12) / (swr / 100)` (line ~303).
 *   - fire-path.tsx pulls `safe_withdrawal_rate` from `useForecastAssumptions`.
 *   - scenario-compare.tsx uses `fire_target_monthly_income` from the snapshot.
 *
 * Each page picks different inputs, sometimes ignoring the user-entered target
 * income or SWR. This module collects every supported FIRE definition behind
 * a single pure compute, so every surface produces an identical number for the
 * same household / setting combo.
 *
 * Passive Income reuses `selectPassiveIncome` from the dashboard data contract
 * (the SoT for annual passive income — settled IP rent + manual passive +
 * dividend heuristics) and adds a monthly normalisation, plus the
 * "passive coverage of expenses" ratio every page renders.
 */

import {
  selectPassiveIncome,
  selectMonthlyExpensesLedger,
  selectMonthlyIncome,
  selectExpensesIncludesDebt,
  selectMonthlyDebtService,
  selectCanonicalNetWorth,
  type DashboardInputs,
} from "./dashboardDataContract";

export interface CanonicalFireInputs {
  /**
   * Safe Withdrawal Rate, expressed as a percentage (4 = 4%). Defaults to 4%
   * — the long-running "Trinity-study" default everywhere else in the app.
   */
  swrPct?: number;
  /**
   * Optional explicit monthly target income (e.g. user's "I want $8,000/mo
   * passive"). When omitted, the canonical FIRE target falls back to the
   * household's monthly expenses (the safer / industry-standard definition).
   */
  targetMonthlyIncome?: number;
}

export interface CanonicalFire {
  /** Safe withdrawal rate actually used (defaulted, clamped). */
  swrPct: number;
  /** Annualised target income used to derive the FIRE number. */
  targetAnnualIncome: number;
  /** Monthly target income used (== targetAnnualIncome / 12). */
  targetMonthlyIncome: number;
  /** FIRE number = targetAnnualIncome / (swr/100). */
  fireNumber: number;
  /** Current canonical NW (assets − liabilities). */
  netWorthNow: number;
  /** Progress to FIRE = NW / FIRE number, capped at 1. 0 when FIRE number ≤ 0. */
  progressFraction: number;
  /** Annual passive income from canonical selector. */
  annualPassiveIncome: number;
  /** Monthly passive income (annualPassiveIncome / 12). */
  monthlyPassiveIncome: number;
  /** Monthly expenses (canonical). */
  monthlyExpenses: number;
  /**
   * Passive income coverage of expenses (monthly passive ÷ monthly expenses).
   * 1.0 = passive exactly covers expenses, > 1.0 = surplus, null when expenses
   * are 0 (UI should render "—").
   */
  passiveCoverage: number | null;
  /** Dollar gap between NW and FIRE number (FIRE number − NW). Never negative. */
  gap: number;
  /** Did the user specify a target, or are we falling back to expenses? */
  source: "user_target" | "monthly_expenses_fallback" | "empty";
}

/**
 * @deprecated FWL Remediation Sprint Phase A — use `getCanonicalGoal()` /
 * `useCanonicalGoal()` from server/lib/canonicalGoal.ts /
 * client/src/lib/useCanonicalGoal.ts instead. The hardcoded 4% fallback in
 * this clamp is forbidden by the Remediation Sprint: if the user has not
 * explicitly set a SWR via `mc_fire_settings.swr_pct`, the UI must surface
 * "Goal not set" rather than silently picking 4%. Phase B will rewire all
 * callsites onto the canonical selector and delete this helper.
 */
const clampSwr = (raw: number | undefined): number => {
  // The dashboard / reports / fire-path SWR setting is bounded [2, 8] in the
  // UI. Anything outside that is treated as a misread input → fall back to 4%.
  if (!Number.isFinite(raw)) return 4;
  if ((raw as number) < 2 || (raw as number) > 8) return 4;
  return raw as number;
};

/**
 * Pure compute. Every page that surfaces "FIRE Number", "FIRE Progress" or
 * "Passive Income coverage" MUST go through this function — even if it has
 * its own UI labels and target widgets. Drift here breaks the cross-page
 * reconciliation guarantee.
 */
export function computeCanonicalFire(
  ledger: DashboardInputs,
  opts: CanonicalFireInputs = {},
): CanonicalFire {
  const swrPct = clampSwr(opts.swrPct ?? 4);
  const annualPassive = Math.max(0, selectPassiveIncome(ledger));
  const monthlyExpenses = Math.max(0, selectMonthlyExpensesLedger(ledger));
  const nw = selectCanonicalNetWorth(ledger).netWorth;

  // Target precedence:
  //   1. explicit opts.targetMonthlyIncome
  //   2. snapshot.fire_target_monthly_income (Settings → FIRE Path)
  //   3. monthly expenses fallback
  //   4. empty (UI surfaces "—" or "Set target")
  const snapTarget = Number(ledger.snapshot?.fire_target_monthly_income);
  let source: CanonicalFire["source"] = "empty";
  let targetMonthly = 0;
  if (Number.isFinite(opts.targetMonthlyIncome) && (opts.targetMonthlyIncome as number) > 0) {
    targetMonthly = opts.targetMonthlyIncome as number;
    source = "user_target";
  } else if (Number.isFinite(snapTarget) && snapTarget > 0) {
    targetMonthly = snapTarget;
    source = "user_target";
  } else if (monthlyExpenses > 0) {
    targetMonthly = monthlyExpenses;
    source = "monthly_expenses_fallback";
  }
  const targetAnnual = targetMonthly * 12;
  const fireNumber = swrPct > 0 ? targetAnnual / (swrPct / 100) : 0;
  const progressFraction = fireNumber > 0
    ? Math.max(0, Math.min(1, nw / fireNumber))
    : 0;
  const passiveCoverage = monthlyExpenses > 0
    ? (annualPassive / 12) / monthlyExpenses
    : null;

  return {
    swrPct,
    targetAnnualIncome: targetAnnual,
    targetMonthlyIncome: targetMonthly,
    fireNumber: Math.round(fireNumber),
    netWorthNow: Math.round(nw),
    progressFraction,
    annualPassiveIncome: Math.round(annualPassive),
    monthlyPassiveIncome: Math.round(annualPassive / 12),
    monthlyExpenses: Math.round(monthlyExpenses),
    passiveCoverage,
    gap: Math.max(0, Math.round(fireNumber - nw)),
    source,
  };
}

/**
 * Convenience: derive `targetMonthlyIncome` from snapshot fields the existing
 * pages use. Centralised so future selectors can chain through here without
 * each surface picking up its own field-precedence rules.
 *
 * Precedence:
 *  1. snapshot.fire_target_monthly_income (explicit user target)
 *  2. opts.targetMonthlyIncome (caller override)
 *  3. undefined (computeCanonicalFire then falls back to monthly expenses)
 */
export function resolveFireTargetFromSnapshot(
  ledger: DashboardInputs,
  opts: { explicitTarget?: number } = {},
): number | undefined {
  const snap = ledger.snapshot ?? {};
  const fromSnap = Number(snap?.fire_target_monthly_income);
  if (Number.isFinite(fromSnap) && fromSnap > 0) return fromSnap;
  if (Number.isFinite(opts.explicitTarget) && (opts.explicitTarget as number) > 0) {
    return opts.explicitTarget;
  }
  return undefined;
}

/**
 * Lightweight helper for surfaces that already have the monthly income and
 * just want the monthly cash surplus available for FIRE contributions. Pure
 * pass-through to the canonical cashflow selectors — exposed here so FIRE-
 * related call sites don't import `dashboardDataContract` directly.
 */
export function selectFireMonthlyContribution(ledger: DashboardInputs): number {
  const income = selectMonthlyIncome(ledger);
  const expenses = selectMonthlyExpensesLedger(ledger);
  if (selectExpensesIncludesDebt(ledger)) {
    return Math.round(income - expenses);
  }
  return Math.round(income - expenses - selectMonthlyDebtService(ledger));
}
