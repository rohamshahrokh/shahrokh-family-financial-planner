/**
 * Shared hook to load DashboardInputs + liveReadouts for both Quick Decision
 * and Advanced Workspace. Mirrors the queries in QuickDecisionTab so the
 * two surfaces share the same live ledger snapshot.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  type DashboardInputs,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectCashToday,
} from "@/lib/dashboardDataContract";

export function useDashboardInputs() {
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then(r => r.json()),
  });

  const dashboardInputs: DashboardInputs | null = useMemo(() => {
    if (!snapshot) return null;
    return { snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  const liveReadouts = useMemo(() => {
    if (!dashboardInputs) return null;
    return {
      income:   selectMonthlyIncome(dashboardInputs),
      expenses: selectMonthlyExpensesLedger(dashboardInputs),
      surplus:  selectMonthlySurplus(dashboardInputs),
      cash:     selectCashToday(dashboardInputs),
    };
  }, [dashboardInputs]);

  return { dashboardInputs, liveReadouts };
}
