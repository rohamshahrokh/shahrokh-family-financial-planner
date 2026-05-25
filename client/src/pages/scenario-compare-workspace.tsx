/**
 * scenario-compare-workspace.tsx — Sprint 6 Phase 1.
 *
 * Dedicated What-If Scenario workspace route. Loads canonical ledger inputs
 * from the existing /api/* endpoints (same shape every other page uses) and
 * passes them to the `ScenarioCompareWorkspace` component, which renders the
 * six initial scenarios side-by-side.
 *
 * Strict separation:
 *   - This page does NOT compute any financial outcomes.
 *   - It does NOT introduce any household values or hardcoded numbers.
 *   - Every number it renders comes from the engines (via the orchestration
 *     layer in `scenarioCompareWorkspace.ts`).
 */

import * as React from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { buildRiskInput, computeRiskRadar } from "@/lib/riskEngine";
import { ScenarioCompareWorkspace } from "@/components/ScenarioCompareWorkspace";
import { ScenarioBuilderWorkspace } from "@/components/ScenarioBuilderWorkspace";

export default function ScenarioCompareWorkspacePage() {
  /* ─── Canonical ledger queries — same pattern as decision.tsx ──────── */
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

  /* ─── Assemble canonical inputs ────────────────────────────────────── */
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

  /* ─── Optional risk radar pass-through (best-effort) ──────────────── */
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
      className="container mx-auto px-4 py-6 max-w-7xl space-y-6"
      data-testid="scenario-compare-workspace-page"
    >
      <div className="flex flex-col gap-1">
        <h1
          className="text-xl font-bold tracking-tight text-foreground"
          data-testid="scenario-compare-workspace-page-title"
        >
          What-If Scenario Compare
        </h1>
        <p
          className="text-sm text-muted-foreground"
          data-testid="scenario-compare-workspace-page-subtitle"
        >
          Six parallel strategies (Baseline, Buy IP 2027, Buy IP 2028, ETF
          Focus, Offset Focus, Hybrid) ranked side-by-side. All metrics are
          sourced from the canonical engines — Net Worth, Passive Income,
          FIRE Date, Monthly Surplus, Liquidity, Risk Score, Monte Carlo
          confidence, and the engine-recommended action.
        </p>
      </div>

      <ScenarioCompareWorkspace
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />

      <ScenarioBuilderWorkspace
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />
    </div>
  );
}
