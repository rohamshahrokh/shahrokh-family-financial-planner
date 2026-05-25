/**
 * goal-closure-lab.tsx — Sprint 6 Phase 4.
 *
 * Goal Closure Lab page. Loads the canonical ledger using the same query
 * pattern every other Sprint 6 page uses, then renders the
 * `GoalClosureLab` component. The page does NO computation of its own —
 * every visible number is produced by the orchestration layer in
 * `goalClosureLab.ts`, which itself is a pure pass-through over the
 * Sprint 4D / Sprint 5 engines.
 */

import * as React from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { buildRiskInput, computeRiskRadar } from "@/lib/riskEngine";
import { GoalClosureLab } from "@/components/GoalClosureLab";

export default function GoalClosureLabPage() {
  /* ─── Canonical ledger queries — same pattern as scenario-compare-workspace ── */
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

  const canonicalLedger: DashboardInputs | null = useMemo(() => {
    if (!snapshot) return null;
    return {
      snapshot,
      properties,
      stocks,
      cryptos,
      holdingsRaw,
      incomeRecords,
      expenses,
    };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  const riskOutputs = useMemo(() => {
    if (!snapshot || !Object.keys(snapshot as any).length) return null;
    try {
      const input = buildRiskInput(snapshot, properties, expenses);
      return computeRiskRadar(input);
    } catch {
      return null;
    }
  }, [snapshot, properties, expenses]);

  return (
    <div
      className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl"
      data-testid="goal-closure-lab-page"
    >
      <header className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground" data-testid="goal-closure-lab-title">
          Goal Closure Lab
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          The primary decision-making workspace of Family Wealth Lab. Why you miss your FIRE target,
          by how much, what changes close the gap, which path is best, what the risks are, and how
          confident the engines are in the recommendation.
        </p>
      </header>
      <GoalClosureLab
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />
    </div>
  );
}
