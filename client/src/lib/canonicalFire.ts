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
import type { CanonicalGoal } from "./useCanonicalGoal";

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

/**
 * Sprint 15 Phase 2 — single FIRE selector wired through the canonical goal.
 *
 * Wraps `computeCanonicalFire` and forces the canonical goal (`mc_fire_settings`,
 * surfaced by `useCanonicalGoal()` on the client and `getCanonicalGoal()` on
 * the server) to be the authoritative source of `swrPct` and
 * `targetMonthlyIncome`. The legacy `computeCanonicalFire` precedence — which
 * silently reads `snapshot.fire_target_monthly_income` (still a SQLite default
 * of 20000 in dev fixtures) and clamp-defaults to 4% SWR — is bypassed.
 *
 * When the goal is `"NOT_SET"` the selector returns a structured incomplete
 * result with `targetSource: "absent"` and `swrSource: "absent"`, with all
 * derived figures zeroed so callers can render "Set FIRE goal" instead of
 * silently falling through to a 4%/20k default.
 *
 * @param ledger DashboardInputs canonical ledger snapshot (same as today)
 * @param goal   CanonicalGoal from `useCanonicalGoal()`. When omitted (e.g.
 *               isolated unit tests or lib callers that intentionally bypass
 *               the goal) the function falls back to the legacy
 *               `computeCanonicalFire` precedence — preserving today's
 *               behavior so we never regress in-flight pipelines.
 */
export interface SelectedCanonicalFire extends CanonicalFire {
  /**
   * Where the SWR used to compute fireNumber came from.
   *   - "user":   from mc_fire_settings (canonical goal SET)
   *   - "default": fell back to clampSwr default (4%) because no goal/no opts
   *   - "absent":  goal was explicitly NOT_SET → no SWR surfaced
   */
  swrSource: "user" | "default" | "absent";
  /**
   * Where targetMonthlyIncome came from.
   *   - "mc_fire_settings": canonical goal (SET)
   *   - "snapshot-legacy":  ledger.snapshot.fire_target_monthly_income (the bug)
   *   - "fallback":         monthly expenses fallback (no target set anywhere)
   *   - "absent":           goal NOT_SET → no target surfaced
   */
  targetSource: "mc_fire_settings" | "snapshot-legacy" | "fallback" | "absent";
  /** True iff the canonical goal exists and is SET. */
  goalSet: boolean;
  /** ISO timestamp from mc_fire_settings.goal_set_timestamp, when SET. */
  goalSetTimestamp: string | null;
  /** Free-form reason when goal is NOT_SET / partial — UI may surface this. */
  reason: string | null;
}

/**
 * Empty / NOT_SET sentinel — same numeric shape as CanonicalFire so callers
 * don't need to null-check every field. UI should branch on `goalSet=false`
 * (or `targetSource==="absent"`) to render "Set FIRE goal" copy.
 */
function emptyCanonicalFire(
  ledger: DashboardInputs,
  reason: string,
): SelectedCanonicalFire {
  const annualPassive = Math.max(0, selectPassiveIncome(ledger));
  const monthlyExpenses = Math.max(0, selectMonthlyExpensesLedger(ledger));
  const nw = selectCanonicalNetWorth(ledger).netWorth;
  return {
    swrPct: 0,
    targetAnnualIncome: 0,
    targetMonthlyIncome: 0,
    fireNumber: 0,
    netWorthNow: Math.round(nw),
    progressFraction: 0,
    annualPassiveIncome: Math.round(annualPassive),
    monthlyPassiveIncome: Math.round(annualPassive / 12),
    monthlyExpenses: Math.round(monthlyExpenses),
    passiveCoverage:
      monthlyExpenses > 0 ? annualPassive / 12 / monthlyExpenses : null,
    gap: 0,
    source: "empty",
    swrSource: "absent",
    targetSource: "absent",
    goalSet: false,
    goalSetTimestamp: null,
    reason,
  };
}

/**
 * Sprint 15.2 — canonical "is FIRE goal explicitly set?" predicate.
 *
 * Returns true ONLY when the user has actually saved a FIRE goal via
 * mc_fire_settings (status === "SET" AND targetPassiveMonthly > 0 AND
 * swrPct > 0). Returns false for null/undefined, NOT_SET, or partial/zero
 * SET shapes that would otherwise let derived defaults leak through.
 *
 * Every surface that conditionally renders FIRE numerics MUST branch on
 * this single predicate so the "goal not set" CTA is shown uniformly.
 */
export function isFireGoalExplicitlySet(
  goal: CanonicalGoal | null | undefined,
): boolean {
  if (!goal) return false;
  if (goal.status !== "SET") return false;
  if (!Number.isFinite(goal.targetPassiveMonthly) || goal.targetPassiveMonthly <= 0) return false;
  if (!Number.isFinite(goal.swrPct) || goal.swrPct <= 0) return false;
  return true;
}

export function selectCanonicalFire(
  ledger: DashboardInputs,
  goal: CanonicalGoal | undefined,
): SelectedCanonicalFire {
  // No goal provided (lib transitive caller without access to the hook):
  //   fall back to legacy computeCanonicalFire — preserves today's behavior so
  //   nothing regresses in-flight. Mark sources as "default"/"snapshot-legacy"
  //   so audit consumers can see the fallback occurred.
  if (!goal) {
    const fire = computeCanonicalFire(ledger);
    const snapTarget = Number(ledger.snapshot?.fire_target_monthly_income);
    const usedSnap =
      Number.isFinite(snapTarget) && snapTarget > 0 && fire.targetMonthlyIncome === snapTarget;
    return {
      ...fire,
      swrSource: "default",
      targetSource: usedSnap
        ? "snapshot-legacy"
        : fire.source === "monthly_expenses_fallback"
          ? "fallback"
          : fire.source === "user_target"
            ? "snapshot-legacy"
            : "absent",
      goalSet: false,
      goalSetTimestamp: null,
      reason: "selectCanonicalFire called without canonical goal — using legacy precedence",
    };
  }

  if (goal.status === "NOT_SET") {
    return emptyCanonicalFire(ledger, goal.reason);
  }

  // goal.status === "SET": wire the user's saved swrPct + targetPassiveMonthly
  // through computeCanonicalFire. Note: by passing both opts.swrPct AND
  // opts.targetMonthlyIncome, we short-circuit the snapshot fire_target read
  // path at canonicalFire.ts:121 — the SQLite 20000 default cannot leak in.
  const fire = computeCanonicalFire(ledger, {
    swrPct: goal.swrPct,
    targetMonthlyIncome: goal.targetPassiveMonthly,
  });

  return {
    ...fire,
    swrSource: "user",
    targetSource: "mc_fire_settings",
    goalSet: true,
    goalSetTimestamp: goal.goalSetTimestamp,
    reason: null,
  };
}

