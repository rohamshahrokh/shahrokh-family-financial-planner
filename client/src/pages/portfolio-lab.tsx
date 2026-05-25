/**
 * portfolio-lab.tsx — Sprint 7 True Portfolio Optimizer.
 *
 * Portfolio Lab page. Loads the canonical ledger using the same query
 * pattern every other Sprint 6 page uses, then renders the Sprint 7
 * `TruePortfolioOptimizer` shell (which itself renders the Sprint 6
 * Phase 5 deep-dive panels beneath the optimisation engine). The page
 * does NO computation of its own — every visible number is produced by
 * the orchestration layer in `truePortfolioOptimizer.ts` /
 * `portfolioLabOptimizer.ts`, which are pure pass-throughs over the
 * existing canonical / Sprint 5 / Sprint 6 engines.
 */

import * as React from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { buildRiskInput, computeRiskRadar } from "@/lib/riskEngine";
import { TruePortfolioOptimizer } from "@/components/TruePortfolioOptimizer";

export default function PortfolioLabPage() {
  /* ─── Canonical ledger queries — same pattern as goal-closure-lab ──── */
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
      data-testid="portfolio-lab-page"
    >
      <header className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground" data-testid="portfolio-lab-title">
          Portfolio Lab Optimizer
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          A genuine optimisation engine for Family Wealth Lab. Scenario search across
          thousands of engine-backed combinations, gap-solver for the minimum change
          required to reach your FIRE target, and an efficient frontier across speed,
          probability, risk, and net worth — every number traceable to an existing
          engine.
        </p>
      </header>
      <TruePortfolioOptimizer
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />
    </div>
  );
}
