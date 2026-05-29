/**
 * /action-roadmap — Sprint 28B execution workspace.
 *
 * Layer 3 of the MOVE architecture (SPRINT28B_EXECUTION_ROADMAP.md §1):
 * "Execute. THE primary FIRE-execution workspace." Reads the cached Goal
 * Lab plan (no engine re-run, no Supabase write), wires together the
 * Sprint 27 + Sprint 28 selectors, and renders eight sections in spec
 * order: Executive Decision → FIRE Journey Roadmap → Wealth Building
 * Timeline → Net Worth Attribution → Monte Carlo Outlook → Risks &
 * Failure Points → Alternative Strategies → Next Actions.
 *
 * Honesty: every metric trace ends at an engine field. When a selector
 * returns null the affected cell renders the literal "Not modelled yet".
 */
import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Info } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { selectCanonicalFire } from "@/lib/canonicalFire";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { computeCanonicalHeadlineMetrics } from "@/lib/canonicalHeadlineMetrics";
import { readLatestGoalLabPlan } from "@/lib/goalLab/orchestrator";
import { computeGoalLabConfidence } from "@/lib/goalLab/goalLabConfidence";

import { buildActionRoadmap } from "@/lib/actionRoadmap/actionRoadmapBuilder";
import { selectMonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import { selectNetWorthAttribution } from "@/lib/actionRoadmap/netWorthAttribution";
import { enrichFireJourneyMilestones } from "@/lib/actionRoadmap/fireJourneyMilestones";
import { selectFailureAnalysis } from "@/lib/actionRoadmap/stressFailureAnalysis";
import { buildNextActions } from "@/lib/actionRoadmap/nextActionsBuilder";
import { selectWealthBuildingLanes } from "@/lib/actionRoadmap/wealthBuildingLanes";
import type { FanPoint, PortfolioState } from "@/lib/scenarioV2/types";

import { ExplainabilityToggle } from "@/components/actionRoadmap/ExplainabilityToggle";
import { ExecutiveDecision } from "@/components/actionRoadmap/ExecutiveDecision";
import { FireJourneyRoadmap } from "@/components/actionRoadmap/FireJourneyRoadmap";
import { WealthTimelineGantt } from "@/components/actionRoadmap/WealthTimelineGantt";
import { NetWorthAttribution } from "@/components/actionRoadmap/NetWorthAttribution";
import { MonteCarloOutlook } from "@/components/actionRoadmap/MonteCarloOutlook";
import { RisksFailurePoints } from "@/components/actionRoadmap/RisksFailurePoints";
import { AlternativeStrategies } from "@/components/actionRoadmap/AlternativeStrategies";
import { NextActionsPanel } from "@/components/actionRoadmap/NextActionsPanel";
import type { RoadmapSectionProps } from "@/components/actionRoadmap/roadmapContext";
import { Button } from "@/components/ui/button";

const HORIZON_YEARS_DEFAULT = 25;

export default function ActionRoadmapPage() {
  const [auditMode, setAuditMode] = React.useState(false);

  /* Canonical ledger queries — same shape as decision-lab / goal-lab. */
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then((r) => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then((r) => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then((r) => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then((r) => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then((r) => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then((r) => r.json()),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then((r) => r.json()),
  });
  const { data: fireSettings } = useQuery<any>({
    queryKey: ["/api/mc-fire-settings"],
    queryFn: async () => (await apiRequest("GET", "/api/mc-fire-settings")).json(),
  });

  const canonicalLedger: DashboardInputs | null = React.useMemo(() => {
    if (!snapshot) return null;
    return { snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  const { data: goal } = useCanonicalGoal();
  const fire = React.useMemo(
    () => (canonicalLedger ? selectCanonicalFire(canonicalLedger, goal) : null),
    [canonicalLedger, goal],
  );
  const headline = React.useMemo(
    () => (canonicalLedger ? computeCanonicalHeadlineMetrics(canonicalLedger) : null),
    [canonicalLedger],
  );
  const currentAge: number | null = React.useMemo(() => {
    const a = Number(fireSettings?.current_age);
    return Number.isFinite(a) && a > 0 ? a : null;
  }, [fireSettings?.current_age]);

  const plan = React.useMemo(() => readLatestGoalLabPlan(), [canonicalLedger, goal]);

  /* ── Build roadmapContext with safe defaults ─────────────────────────── */
  // Honesty rule (SPRINT28B §3): when the plan is missing OR no feasible
  // winner exists, we DO NOT hide the architecture behind one empty card.
  // Every section still mounts and renders its own "Not modelled yet" cell.
  // A top banner explains the state and points to Decision Lab.
  const hasPlan = !!plan;
  const recommended = plan?.picks?.recommended ?? null;
  const picks = plan?.picks ?? {
    recommended: null,
    safest: null,
    fastest: null,
    highestProbability: null,
    bestCashflow: null,
    bestHybrid: null,
    recommendedRationale: null,
  };
  const targetFireAge = goal && goal.status === "SET" ? goal.targetFireAge : null;
  const fan: FanPoint[] = (recommended?.winner?.result?.netWorthFan as FanPoint[] | undefined) ?? [];
  const finalState: PortfolioState | null = (recommended?.winner?.result?.medianFinalState as PortfolioState | undefined) ?? null;
  const fireNumber = fire?.fireNumber ?? null;
  const swrPct = fire?.swrPct ?? null;
  const simulationCount = plan?.metrics.simulationCount ?? 0;

  const mcProjection = selectMonteCarloProjection({
    fan,
    startAge: currentAge,
    fireTarget: fireNumber,
    swrPct,
    simulationCount,
  });

  const roadmap = recommended
    ? buildActionRoadmap(recommended, { targetFireAge }, currentAge)
    : null;

  // Compute startMonth for fan-month indexing. The fan's own first point
  // carries the canonical month; fall back to the milestone derivation in
  // builder which uses now().
  const startMonth = fan[0]?.month ?? new Date().toISOString().slice(0, 7);

  const enrichedMilestones = enrichFireJourneyMilestones({
    milestones: roadmap?.milestones ?? [],
    fan,
    startMonth,
    fireNumber,
  });

  const attribution = selectNetWorthAttribution({
    finalState,
    fanP50AtHorizon: fan.length > 0 ? fan[fan.length - 1]!.p50 : null,
  });

  const failures = selectFailureAnalysis({
    result: recommended?.winner?.result ?? null,
    softWarnings: recommended?.winner?.softWarnings,
  });

  const nextActions = buildNextActions({
    milestones: roadmap?.milestones ?? [],
    today: new Date(),
  });

  const lanes = selectWealthBuildingLanes({
    milestones: roadmap?.milestones ?? [],
    fan,
    startMonth,
    fireNumber,
    horizonYears: HORIZON_YEARS_DEFAULT,
  });

  const confidence = computeGoalLabConfidence({
    goal: goal ?? null,
    hasLedger: !!canonicalLedger,
    netWorth: headline?.netWorth ?? null,
    monthlySurplus: headline?.monthlySurplus ?? null,
    confirmed: {},
    plan,
  });

  const ctx: RoadmapSectionProps = {
    picks,
    recommended,
    roadmap,
    enrichedMilestones,
    mcProjection,
    attribution,
    failures,
    nextActions,
    lanes,
    confidence,
    fireNumber,
    swrPct,
    startAge: currentAge,
    currentNetWorth: headline?.netWorth ?? null,
    auditMode,
  };

  return (
    <div className="container mx-auto max-w-5xl px-3 sm:px-4 py-6 space-y-4" data-testid="action-roadmap-page">
      <PageHeader auditMode={auditMode} onAuditChange={setAuditMode} hasPlan={hasPlan && recommended != null} />
      {!recommended && (
        <section
          aria-labelledby="ar-no-plan-heading"
          className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-400/30 dark:bg-amber-950/20"
          data-testid="ar-no-plan-banner"
        >
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="flex-1">
            <h2 id="ar-no-plan-heading" className="text-sm font-semibold text-foreground">
              {hasPlan ? "No feasible plan yet" : "Not modelled yet"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hasPlan
                ? "The engine could not produce a feasible winner with the current goal inputs. Each section below shows \"Not modelled yet\" until a plan is found."
                : "Open Decision Lab to run a plan and populate this workspace. Each section below previews its slot with \"Not modelled yet\" placeholders."}
            </p>
            <Link href="/decision-lab">
              <Button size="sm" className="mt-3 gap-1.5" data-testid="ar-no-plan-cta">
                Open Decision Lab <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </Link>
          </div>
        </section>
      )}
      <ExecutiveDecision {...ctx} />
      <FireJourneyRoadmap {...ctx} />
      <WealthTimelineGantt {...ctx} />
      <NetWorthAttribution {...ctx} />
      <MonteCarloOutlook {...ctx} />
      <RisksFailurePoints {...ctx} />
      <AlternativeStrategies {...ctx} />
      <NextActionsPanel {...ctx} />
    </div>
  );
}

function PageHeader({
  auditMode, onAuditChange, hasPlan,
}: {
  auditMode: boolean;
  onAuditChange: (next: boolean) => void;
  hasPlan: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Action Roadmap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasPlan
            ? "Engine-ranked plan for closing the FIRE gap."
            : "Run a plan from Decision Lab to populate this workspace."}
        </p>
      </div>
      <div className="w-full sm:w-auto">
        <ExplainabilityToggle auditMode={auditMode} onChange={onAuditChange} />
      </div>
    </header>
  );
}
