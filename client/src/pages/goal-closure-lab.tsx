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
// Sprint 13 — universal 4-section layout primitives + selectors.
import { AdvancedDisclosure } from "@/components/ui/AdvancedDisclosure";
import { FireCommandCenter } from "@/components/decision-system/FireCommandCenter";
import { Top3ActionsSection } from "@/components/decision-system/Top3ActionsSection";
import { BiggestBlockersSection } from "@/components/decision-system/BiggestBlockersSection";
import { DoNothingOutcomeSection } from "@/components/decision-system/DoNothingOutcomeSection";
import { RecommendedVsDoNothingChart } from "@/components/decision-system/RecommendedVsDoNothingChart";
import {
  selectFireCommandCenterData,
  selectTop3ActionsDetailed,
  selectRankedBlockersDetailed,
  selectDoNothingOutcome,
} from "@/lib/goalSolverView";
import { buildGoalSolverPro, EMPTY_GOAL_TARGETS } from "@/lib/goalSolverPro";
import { buildTruePortfolioOptimizer } from "@/lib/truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "@/lib/probabilisticWealthEngine";
import { buildPathSimulationEngine } from "@/lib/pathSimulationEngine";
import { computeCanonicalFire } from "@/lib/canonicalFire";

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

  // Sprint 13 — universal 4-section layout data.
  const s13 = useMemo(() => {
    if (!canonicalLedger) return null;
    try {
      const sprint7 = buildTruePortfolioOptimizer({
        canonicalLedger,
        constraints: {},
      });
      const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
      const sprint9 = buildPathSimulationEngine({
        sprint7Result: sprint7,
        canonicalLedger,
      });
      const canonicalFire = computeCanonicalFire(canonicalLedger);
      const result = buildGoalSolverPro({
        canonicalLedger,
        canonicalFire,
        sprint7Result: sprint7,
        sprint8Result: sprint8,
        sprint9Result: sprint9,
        targets: EMPTY_GOAL_TARGETS,
      });
      return {
        fireCommand: selectFireCommandCenterData(result),
        top3: selectTop3ActionsDetailed(result),
        blockers: selectRankedBlockersDetailed(result),
        doNothing: selectDoNothingOutcome(result),
        fan: (sprint9.bestStrategy?.netWorthFan ?? sprint9.strategies[0]?.netWorthFan ?? []) as Array<{ year: number; p50: number }>,
        baselineNW: canonicalFire.netWorthNow,
      };
    } catch {
      return null;
    }
  }, [canonicalLedger]);

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

      {/* Sprint 13 — universal 4-section reality-check layout. */}
      {s13 ? (
        <div className="space-y-4 mb-5">
          <FireCommandCenter data={s13.fireCommand} testidPrefix="s13-gcl-fire-command-center" />
          <Top3ActionsSection actions={s13.top3} testidPrefix="s13-gcl-top3-actions" />
          <BiggestBlockersSection blockers={s13.blockers} testidPrefix="s13-gcl-biggest-blockers" />
          <DoNothingOutcomeSection outcome={s13.doNothing} testidPrefix="s13-gcl-do-nothing-outcome" />
          <RecommendedVsDoNothingChart
            netWorthFan={s13.fan}
            doNothingNetWorth={s13.baselineNW}
            recommendedFireYear={s13.fireCommand.medianFireYear}
            doNothingFireYear={s13.doNothing.expectedFireYear}
            testidPrefix="s13-gcl-rec-vs-donothing-chart"
          />
        </div>
      ) : null}

      <AdvancedDisclosure
        title="View Supporting Analysis"
        subtitle="Sprint 6 Phase 4 Goal Closure Lab · GclSixOutputGrid · supporting deep-dives"
        data-testid="s13-gcl-supporting-analysis"
      >
        <GoalClosureLab
          canonicalLedger={canonicalLedger}
          riskOutputs={riskOutputs}
        />
      </AdvancedDisclosure>
    </div>
  );
}
