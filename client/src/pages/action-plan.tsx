/**
 * action-plan.tsx — Sprint 14 IA reorganisation.
 *
 * Unified "MOVE" shell. Stitches existing engine outputs into one page:
 *   A. Current Position strip       — canonical headline metrics + FIRE + risk
 *   B. Progress to FIRE             — pass-through of <GoalClosureLab />
 *   C. Portfolio Impact             — pass-through of <TruePortfolioOptimizer />
 *   D. Recommended Decisions        — top 5 from computeUnifiedBestMove
 *   E. Action Checklist             — client-side checkbox over the same top 5
 *
 * NO new financial logic. NO new ranking. NO backend writes. Loading pattern
 * mirrors `goal-closure-lab.tsx` and `portfolio-lab.tsx` verbatim.
 */

import * as React from "react";
import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { buildRiskInput, computeRiskRadar } from "@/lib/riskEngine";
import type { Recommendation } from "@/lib/recommendationEngine/types";

import { CurrentPositionStrip } from "@/components/action-plan/CurrentPositionStrip";
import { ProgressToFireSection } from "@/components/action-plan/ProgressToFireSection";
import { PortfolioImpactSection } from "@/components/action-plan/PortfolioImpactSection";
import { RecommendedDecisionsSection } from "@/components/action-plan/RecommendedDecisionsSection";
import { ActionChecklistSection } from "@/components/action-plan/ActionChecklistSection";

export default function ActionPlanPage() {
  /* ─── Canonical ledger queries — same pattern as goal-closure-lab ────── */
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

  /* ─── Top-5 decisions shared between Section D and Section E ─────────── */
  const [decisions, setDecisions] = useState<Recommendation[]>([]);
  const handleDecisionsChange = useCallback((next: Recommendation[]) => {
    setDecisions(next);
  }, []);

  return (
    <div
      className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl space-y-6 sm:space-y-8"
      data-testid="action-plan-page"
    >
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground" data-testid="action-plan-title">
          Action Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          One page that pulls together where you are, where you're going, and the next moves —
          all from the engine outputs you already trust.
        </p>
      </header>

      <CurrentPositionStrip
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />

      <ProgressToFireSection
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />

      <PortfolioImpactSection
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />

      <RecommendedDecisionsSection
        refreshKey={snapshot?.id ?? "no-snapshot"}
        onDecisionsChange={handleDecisionsChange}
      />

      <ActionChecklistSection decisions={decisions} />
    </div>
  );
}
