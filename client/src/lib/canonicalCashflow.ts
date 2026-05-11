/**
 * canonicalCashflow.ts — single source of truth for monthly cashflow KPIs.
 *
 * Why this file exists
 * --------------------
 * The May-2026 UX audit found a dashboard card labelled "Monthly Surplus
 * $21,940" that was actually monthly income — the page had mixed up the two
 * values mid-render. It also found different surplus figures across viewports
 * because reports.tsx and dashboard.tsx each rolled their own arithmetic.
 *
 * This module reuses the existing selectors in `dashboardDataContract.ts`
 * (selectMonthlyIncome, selectMonthlyExpensesLedger, selectMonthlySurplus)
 * and adds:
 *   - a hard arithmetic assertion that surplus == income - expenses (with
 *     expense convention applied) so a future refactor can't drift again
 *   - a `savingsRate` that returns `null` rather than NaN/Infinity when
 *     income is zero, so the UI can render "—" without guarding every call
 *
 * The hook `useCanonicalCashflow` mirrors `useCanonicalNetWorth`: it fetches
 * the canonical ledger once and exposes the four KPIs, so every page using
 * the hook produces identical numbers.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "./queryClient";
import {
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectExpensesIncludesDebt,
  selectMonthlyDebtService,
  type DashboardInputs,
} from "./dashboardDataContract";

export interface CanonicalCashflow {
  /** Monthly gross household income. */
  monthlyIncome: number;
  /** Monthly expenses (ledger or snapshot fallback). */
  monthlyExpenses: number;
  /** Income - expenses (and debt service when not already in expenses). */
  monthlySurplus: number;
  /**
   * Savings rate = surplus / income.
   *
   * Returns `null` (not NaN, not Infinity, not 0) when income ≤ 0 so the UI
   * can render `—` and skip percentage formatting entirely.
   */
  savingsRate: number | null;
  /** True if the ledger expense already includes debt service. */
  expensesIncludeDebt: boolean;
  /** Monthly debt service used in surplus when expenses-include-debt is false. */
  monthlyDebtService: number;
  /** Timestamp the calculation ran (ISO). */
  lastCalculatedAt: string;
}

/**
 * Pure compute. Use this in tests / server code.
 *
 * Throws if the surplus identity drifts (income - expenses - debt_if_needed
 * !== surplus). In production we log a warning instead so a math drift never
 * crashes the page, but the assertion fires loudly in dev / tests.
 */
export function computeCanonicalCashflow(ledger: DashboardInputs): CanonicalCashflow {
  const monthlyIncome   = selectMonthlyIncome(ledger);
  const monthlyExpenses = selectMonthlyExpensesLedger(ledger);
  const monthlySurplus  = selectMonthlySurplus(ledger);
  const expensesIncludeDebt = selectExpensesIncludesDebt(ledger);
  const monthlyDebtService  = selectMonthlyDebtService(ledger);

  // Hard identity check (rounded to cents). When the assertion fails it means
  // a downstream selector has drifted — flag it so we don't silently render a
  // wrong number.
  const expectedSurplus = Math.round(
    monthlyIncome - monthlyExpenses - (expensesIncludeDebt ? 0 : monthlyDebtService)
  );
  if (Math.abs(expectedSurplus - monthlySurplus) > 1) {
    const msg = `[canonicalCashflow] surplus identity drift: income(${monthlyIncome}) - expenses(${monthlyExpenses}) ${expensesIncludeDebt ? "" : `- debt(${monthlyDebtService}) `}!= surplus(${monthlySurplus})`;
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      // Throw in dev / tests so the regression is caught immediately.
      throw new Error(msg);
    } else {
      // eslint-disable-next-line no-console
      console.warn(msg);
    }
  }

  const savingsRate: number | null =
    monthlyIncome > 0 ? (monthlyIncome - monthlyExpenses) / monthlyIncome : null;

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus,
    savingsRate,
    expensesIncludeDebt,
    monthlyDebtService,
    lastCalculatedAt: new Date().toISOString(),
  };
}

const STALE_60S = 60 * 1000;

interface UseCanonicalCashflowOptions {
  overrideInputs?: DashboardInputs | null;
}

/**
 * React hook. Fetches the canonical ledger once per session (via react-query
 * cache) and returns the four KPIs. Pages with their own queries can pass
 * `overrideInputs` to compute synchronously without spawning new fetches.
 */
export function useCanonicalCashflow(
  opts: UseCanonicalCashflowOptions = {},
): CanonicalCashflow & { loading: boolean } {
  const skipFetch = !!opts.overrideInputs;

  const snapshotQ = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const incomeQ = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const expensesQ = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const propertiesQ = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });

  return useMemo(() => {
    if (opts.overrideInputs) {
      return { ...computeCanonicalCashflow(opts.overrideInputs), loading: false };
    }
    const inputs: DashboardInputs = {
      snapshot:       snapshotQ.data ?? null,
      properties:     propertiesQ.data,
      stocks:         undefined,
      cryptos:        undefined,
      holdingsRaw:    undefined,
      incomeRecords:  incomeQ.data,
      expenses:       expensesQ.data,
    };
    const cashflow = computeCanonicalCashflow(inputs);
    const loading =
      snapshotQ.isLoading || incomeQ.isLoading || expensesQ.isLoading;
    return { ...cashflow, loading };
  }, [
    opts.overrideInputs,
    snapshotQ.data, snapshotQ.isLoading,
    incomeQ.data, incomeQ.isLoading,
    expensesQ.data, expensesQ.isLoading,
    propertiesQ.data,
  ]);
}
