/**
 * canonicalLedger.ts — Sprint 4A canonical financial ledger.
 *
 * Why this file exists
 * --------------------
 * Sprint 4A audit found the same household rendering different headline
 * values across Dashboard, Reports, Wealth Strategy, Timeline, Risk, and
 * Financial Plan. The underlying selectors in `dashboardDataContract.ts`
 * already produce the right numbers — but pages were assembling those
 * numbers ad-hoc, leading to subtle drift (one page subtracted debt service,
 * another didn't; one used snapshot stocks, another used live holdings).
 *
 * This module collects every authoritative headline value into ONE struct
 * (`CanonicalHeadlineFigures`) so every page can read from the same place,
 * and adds a `reconcileCanonicalLedger` helper that proves cross-page
 * agreement to within $1.
 *
 * Anything that intentionally uses a different definition (e.g. an
 * "accessible NW" that excludes super) goes through `computeWealthLayers`
 * in `canonicalWealth.ts` and is labelled explicitly in the UI — it is NOT
 * a competing definition of the same headline metric.
 */

import {
  selectCanonicalNetWorth,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectMonthlyDebtService,
  selectMortgageRepayment,
  selectSettledIpDebtService,
  selectOtherDebtRepayment,
  selectMortgageInputState,
  selectPassiveIncome,
  type DashboardInputs,
} from "./dashboardDataContract";
import { computeCanonicalNetWorth } from "./canonicalNetWorth";
import { computeCanonicalCashflow } from "./canonicalCashflow";
import { computeCanonicalFire, resolveFireTargetFromSnapshot, selectCanonicalFire } from "./canonicalFire";
import type { CanonicalGoal } from "./useCanonicalGoal";
import { computeCanonicalDebtService } from "./canonicalDebtService";

/**
 * Authoritative headline values every consuming surface MUST display
 * consistently. Pages that intentionally use a different definition are
 * REQUIRED to label the figure (e.g. "Accessible Net Worth (excludes
 * super)" vs the canonical "Total Net Worth").
 */
export interface CanonicalHeadlineFigures {
  /** Total net worth (assets − liabilities, including super). */
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  /** Monthly recurring household income (single source of truth). */
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  /** Aggregate monthly debt service (PPOR + IP + other-debt minimums). */
  monthlyDebtService: number;
  /** Liquid cash + offset (excludes locked super). */
  liquidity: number;
  /** Annual passive income (settled IP rent + manual passive + dividend yield). */
  passiveIncome: number;
  /** FIRE number at canonical SWR (default 4%) and monthly expenses target. */
  fireNumber: number;
  /**
   * Whether the snapshot has the inputs needed to compute mortgage figures.
   * When this is false, callers should surface an incomplete-data state
   * rather than rendering 0 as if it were a real value.
   */
  inputState: {
    mortgageReady: boolean;
    hasIncome: boolean;
    hasExpenses: boolean;
  };
}

/**
 * Build the canonical headline figures from a single DashboardInputs payload.
 *
 * Sprint 15 Phase 2: optionally accept a CanonicalGoal so the FIRE pipeline
 * is routed through `selectCanonicalFire`. When omitted, the legacy snapshot-
 * target precedence is preserved (back-compat for callers that have not been
 * threaded yet, including server-side audit traces).
 */
export function computeCanonicalHeadlineFigures(
  ledger: DashboardInputs,
  goal?: CanonicalGoal | null,
): CanonicalHeadlineFigures {
  const nw = selectCanonicalNetWorth(ledger);
  const monthlyIncome = selectMonthlyIncome(ledger);
  const monthlyExpenses = selectMonthlyExpensesLedger(ledger);
  const monthlySurplus = selectMonthlySurplus(ledger);
  const monthlyDebtService = selectMonthlyDebtService(ledger);
  const mortgageState = selectMortgageInputState(ledger);
  const passiveIncome = selectPassiveIncome(ledger);
  const fire = goal
    ? selectCanonicalFire(ledger, goal)
    : computeCanonicalFire(ledger, {
        targetMonthlyIncome: resolveFireTargetFromSnapshot(ledger),
      });

  return {
    netWorth: nw.netWorth,
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus,
    monthlyDebtService,
    liquidity: nw.assets.cashOffset,
    passiveIncome,
    fireNumber: fire.fireNumber,
    inputState: {
      mortgageReady: mortgageState.ready,
      hasIncome: monthlyIncome > 0,
      hasExpenses: monthlyExpenses > 0,
    },
  };
}

/**
 * Each entry in the per-surface check: a page name plus the headline value
 * that page rendered. The reconciliation pass succeeds when every entry
 * agrees with the canonical figure to within `tolerance` dollars.
 */
export interface PageHeadlineSnapshot {
  page: string;
  metric: keyof CanonicalHeadlineFigures;
  value: number;
}

export interface ReconciliationResult {
  metric: keyof CanonicalHeadlineFigures;
  canonical: number;
  drifts: { page: string; value: number; diff: number }[];
  status: "PASS" | "FAIL";
}

/**
 * Reconcile a set of page-reported headline values against the canonical
 * figures. Any drift greater than `tolerance` (default $1) flips the status
 * to FAIL and the drifting pages are reported with the exact diff.
 */
export function reconcileCanonicalLedger(
  canonical: CanonicalHeadlineFigures,
  pageSnapshots: PageHeadlineSnapshot[],
  tolerance = 1,
): ReconciliationResult[] {
  const byMetric: Record<string, PageHeadlineSnapshot[]> = {};
  for (const snap of pageSnapshots) {
    const arr = byMetric[snap.metric as string] ?? [];
    arr.push(snap);
    byMetric[snap.metric as string] = arr;
  }
  const out: ReconciliationResult[] = [];
  for (const metric of Object.keys(byMetric) as (keyof CanonicalHeadlineFigures)[]) {
    const snaps = byMetric[metric as string];
    const canonicalValue = canonical[metric] as number;
    const drifts = snaps
      .map((s: PageHeadlineSnapshot) => ({
        page: s.page,
        value: s.value,
        diff: Math.round(s.value - canonicalValue),
      }))
      .filter((d: { diff: number }) => Math.abs(d.diff) > tolerance);
    out.push({
      metric,
      canonical: Math.round(canonicalValue),
      drifts,
      status: drifts.length === 0 ? "PASS" : "FAIL",
    });
  }
  return out;
}

/**
 * Convenience: wrap the canonical NW + cashflow computations behind one
 * call so test scripts and audit traces can verify both modules see the
 * same inputs. Throws via canonicalCashflow's identity check if surplus
 * arithmetic drifts.
 */
export function buildCanonicalAuditTrace(
  ledger: DashboardInputs,
  goal?: CanonicalGoal | null,
) {
  const head = computeCanonicalHeadlineFigures(ledger, goal);
  const nw = computeCanonicalNetWorth(ledger);
  const cashflow = computeCanonicalCashflow(ledger);
  const debtService = computeCanonicalDebtService(ledger);
  // Audit trace intentionally renders BOTH the legacy snapshot-based FIRE
  // (for diff comparison against historic outputs) and — when the goal is
  // provided — the canonical-goal-routed FIRE. The `fire` field below is the
  // snapshot-based legacy output so audit consumers can detect when the
  // SQLite 20k default leaks through.
  const fire = computeCanonicalFire(ledger, {
    targetMonthlyIncome: resolveFireTargetFromSnapshot(ledger),
  });
  return {
    head,
    nw,
    cashflow,
    fire,
    debtService,
    debtServiceBreakdown: {
      pporMortgage: selectMortgageRepayment(ledger),
      settledIps: selectSettledIpDebtService(ledger),
      otherDebt: selectOtherDebtRepayment(ledger),
      total: selectMonthlyDebtService(ledger),
    },
  };
}
