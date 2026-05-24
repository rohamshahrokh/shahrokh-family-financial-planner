/**
 * canonicalDebtService.ts — Sprint 4C single source of truth for debt service
 * dollars and debt balances.
 *
 * Why this file exists
 * --------------------
 * Sprint 4A consolidated the loan math (PI vs IO, IO-window conversion to P&I)
 * into `mathUtils.ts` and exposed PPOR / IP / other-debt selectors via
 * `dashboardDataContract.ts`. But the consumers of those selectors live in
 * very different shapes:
 *   - Dashboard reads `selectMonthlyDebtService` directly.
 *   - Forecast / Cash Engine derives mortgage repayment from raw snapshot
 *     fields, then walks the IO window via `calcLoanRepayment(...)`.
 *   - Risk / Goal-Solver computes debt-to-income from `selectMonthlyDebtService`
 *     but uses a separate balance projection via `calcLoanBalanceWithType`.
 *   - Monte Carlo / Scenario V2 each carry their own copy of the amortisation
 *     math.
 *
 * The amounts are correct (Sprint 4A test pass) but the access pattern is
 * inconsistent — pages have to remember which selector applies to which line
 * item. This module collects the headline answers into ONE struct
 * (`CanonicalDebtServiceFigures`) and adds:
 *
 *   - `projectDebtBalanceAt`     — single helper that handles PI + IO + ioYears
 *                                  for any loan, used by every engine.
 *   - `breakdownDebtService`     — per-loan breakdown for the audit trace.
 *   - `reconcileDebtService`     — cross-surface drift check used by tests.
 *
 * Reuses `mathUtils.calcLoanRepayment` / `calcLoanBalanceWithType` directly —
 * no new amortisation math is introduced.
 */

import {
  calcLoanRepayment,
  calcLoanBalanceWithType,
  normaliseLoanType,
  safeNum,
  type LoanType,
} from "./mathUtils";
import {
  selectMortgageRepayment,
  selectSettledIpDebtService,
  selectOtherDebtRepayment,
  selectMonthlyDebtService,
  selectSettledIPs,
  selectIpLoanBalanceSettled,
  selectMortgageInputState,
  type DashboardInputs,
} from "./dashboardDataContract";

/* ─── Headline debt-service struct ──────────────────────────────────────── */

export interface CanonicalDebtServiceFigures {
  /** PPOR mortgage P&I (or IO-only inside its IO window). */
  pporMonthly: number;
  /** Aggregate monthly debt service across settled investment properties. */
  ipMonthly: number;
  /** Minimum payment on other debt (cards, personal loans). */
  otherDebtMonthly: number;
  /** Sum of the three above — what dashboard / risk / forecast must agree on. */
  totalMonthly: number;
  /** Annualised version (totalMonthly * 12). */
  totalAnnual: number;
  /** Aggregate balances (settled IPs only — planned are deferred). */
  balances: {
    ppor: number;
    settledIps: number;
    otherDebts: number;
    total: number;
  };
  /** True when snapshot has rate + term + principal needed for repayment math. */
  ready: boolean;
}

/**
 * Pure compute. Every page that surfaces a debt-service figure (Dashboard
 * "Debt Service" card, Risk DTI, Forecast mortgage line, Wealth Strategy
 * cashflow tile, Monte Carlo expense baseline, Goal Solver capacity check)
 * MUST flow through this function. Drift here means cross-page reconciliation
 * fails — Sprint 4C tests treat that as a CI break.
 */
export function computeCanonicalDebtService(
  ledger: DashboardInputs,
): CanonicalDebtServiceFigures {
  const ppor = Math.round(selectMortgageRepayment(ledger));
  const ips = Math.round(selectSettledIpDebtService(ledger));
  const other = Math.round(selectOtherDebtRepayment(ledger));
  const total = Math.round(selectMonthlyDebtService(ledger));
  const snap = ledger.snapshot ?? {};
  const pporBalance = safeNum(snap.mortgage);
  const ipsBalance = selectIpLoanBalanceSettled(ledger);
  const otherBalance = safeNum(snap.other_debts);
  const mortgageState = selectMortgageInputState(ledger);

  return {
    pporMonthly: ppor,
    ipMonthly: ips,
    otherDebtMonthly: other,
    totalMonthly: total,
    totalAnnual: total * 12,
    balances: {
      ppor: pporBalance,
      settledIps: ipsBalance,
      otherDebts: otherBalance,
      total: pporBalance + ipsBalance + otherBalance,
    },
    ready: mortgageState.ready,
  };
}

/* ─── Per-loan breakdown ─────────────────────────────────────────────────── */

export interface CanonicalDebtLine {
  source: "ppor" | "ip" | "other_debt";
  label: string;
  principal: number;
  monthlyRepayment: number;
  ratePct: number;
  termYears: number;
  loanType: LoanType;
  /** IO window (years) when loanType === 'IO'; 0 otherwise. */
  ioYears: number;
}

/**
 * Breakdown of every loan that contributes to the canonical headline debt
 * service. Pages use this for tooltips / drill-downs; tests use it to verify
 * each line independently agrees with the loan math primitives.
 */
export function breakdownDebtService(ledger: DashboardInputs): CanonicalDebtLine[] {
  const out: CanonicalDebtLine[] = [];
  const snap = ledger.snapshot ?? {};

  // PPOR
  const pporPrincipal = safeNum(snap.mortgage);
  if (pporPrincipal > 0) {
    const pporType = normaliseLoanType(snap.mortgage_loan_type);
    const pporIoYears = Math.max(0, safeNum(snap.mortgage_io_years));
    const pporRepayment = calcLoanRepayment({
      principal: pporPrincipal,
      annualRate: safeNum(snap.mortgage_rate),
      termYears: safeNum(snap.mortgage_term_years),
      loanType: pporType,
      ioYears: pporIoYears,
      monthsSincePayment: 0,
    });
    out.push({
      source: "ppor",
      label: "PPOR mortgage",
      principal: pporPrincipal,
      monthlyRepayment: pporRepayment,
      ratePct: safeNum(snap.mortgage_rate),
      termYears: safeNum(snap.mortgage_term_years),
      loanType: pporType,
      ioYears: pporIoYears,
    });
  }

  // Settled IPs — each property uses its OWN rate/term/loan_type.
  for (const p of selectSettledIPs(ledger)) {
    const principal = safeNum(p?.loan_amount);
    if (principal <= 0) continue;
    const loanType = normaliseLoanType(p?.loan_type);
    const ioYears = Math.max(0, safeNum(p?.interest_only_years));
    const repayment = calcLoanRepayment({
      principal,
      annualRate: safeNum(p?.interest_rate),
      termYears: safeNum(p?.loan_term),
      loanType,
      ioYears,
      monthsSincePayment: 0,
    });
    out.push({
      source: "ip",
      label: `IP — ${p?.name ?? p?.id ?? "investment property"}`,
      principal,
      monthlyRepayment: repayment,
      ratePct: safeNum(p?.interest_rate),
      termYears: safeNum(p?.loan_term),
      loanType,
      ioYears,
    });
  }

  // Other debts — minimum payment heuristic (0.15/12 annualised).
  const otherDebt = safeNum(snap.other_debts);
  if (otherDebt > 0) {
    out.push({
      source: "other_debt",
      label: "Other debts (cards / personal)",
      principal: otherDebt,
      monthlyRepayment: selectOtherDebtRepayment(ledger),
      ratePct: 15, // matches the 0.15 annual minimum-pay heuristic used elsewhere
      termYears: 0,
      loanType: "PI",
      ioYears: 0,
    });
  }

  return out;
}

/* ─── Future debt-balance projector ─────────────────────────────────────── */

/**
 * Project the loan balance for a single loan at `monthsForward` months from
 * today. Wraps `calcLoanBalanceWithType` so the engines (forecast, MC, goal
 * solver, scenario V2) all consume the same IO-aware amortisation.
 */
export function projectDebtBalanceAt(args: {
  principal: number;
  annualRate: number;
  termYears: number;
  loanType?: unknown;
  ioYears?: number;
  monthsForward: number;
}): number {
  return calcLoanBalanceWithType({
    principal: args.principal,
    annualRate: args.annualRate,
    termYears: args.termYears,
    monthsPaid: args.monthsForward,
    loanType: args.loanType,
    ioYears: args.ioYears,
  });
}

/* ─── Reconciliation ────────────────────────────────────────────────────── */

export interface DebtServiceSnapshot {
  page: string;
  metric: keyof CanonicalDebtServiceFigures | "totalBalance";
  value: number;
}

export interface DebtServiceReconciliation {
  metric: string;
  canonical: number;
  drifts: { page: string; value: number; diff: number }[];
  status: "PASS" | "FAIL";
}

/**
 * Compare each page's reported debt service against the canonical compute,
 * within a $1 tolerance. Used by Sprint 4C reconciliation tests; can also
 * be wired into dev-only assertions.
 */
export function reconcileDebtService(
  canonical: CanonicalDebtServiceFigures,
  pageSnaps: DebtServiceSnapshot[],
  tolerance = 1,
): DebtServiceReconciliation[] {
  const lookup: Record<string, number> = {
    pporMonthly: canonical.pporMonthly,
    ipMonthly: canonical.ipMonthly,
    otherDebtMonthly: canonical.otherDebtMonthly,
    totalMonthly: canonical.totalMonthly,
    totalAnnual: canonical.totalAnnual,
    totalBalance: canonical.balances.total,
  };
  const byMetric: Record<string, DebtServiceSnapshot[]> = {};
  for (const snap of pageSnaps) {
    const key = snap.metric as string;
    if (!byMetric[key]) byMetric[key] = [];
    byMetric[key].push(snap);
  }
  const out: DebtServiceReconciliation[] = [];
  for (const metric of Object.keys(byMetric)) {
    const canonicalValue = lookup[metric] ?? 0;
    const drifts = byMetric[metric]
      .map(s => ({
        page: s.page,
        value: s.value,
        diff: Math.round(s.value - canonicalValue),
      }))
      .filter(d => Math.abs(d.diff) > tolerance);
    out.push({
      metric,
      canonical: Math.round(canonicalValue),
      drifts,
      status: drifts.length === 0 ? "PASS" : "FAIL",
    });
  }
  return out;
}
