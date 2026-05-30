/**
 * /action-roadmap — Sprint 28B execution workspace (Sprint 29 wiring).
 *
 * Layer 3 of the MOVE architecture: "Execute. THE primary FIRE-execution
 * workspace." Reads the cached Goal Lab plan (no engine re-run, no Supabase
 * write), wires together the Sprint 27 + Sprint 28 + Sprint 29 selectors,
 * and renders eight sections.
 *
 * Sprint 29 additions:
 *   - reconciliation gate (P0) flows through S1 / S4 / S5
 *   - MC variance diagnostic (P1) feeds the S5 audit panel + warning chips
 *   - engine event timeline (P4) drives the S3 professional Gantt
 *   - mobile (< sm) wraps the 8 sections into 6 tabs (P9). Desktop unchanged.
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
import { reconcileTerminalNetWorth } from "@/lib/actionRoadmap/financialReconciliation";
import { computeMCVarianceDiagnostic } from "@/lib/actionRoadmap/mcVarianceDiagnostic";
import { selectEngineEventTimeline } from "@/lib/actionRoadmap/engineEventTimeline";
import { selectEngineEventLanes } from "@/lib/actionRoadmap/engineEventLanes";
import { buildDependencyChain } from "@/lib/actionRoadmap/milestoneDependencies";
import { validateMcRiskOutputs } from "@/lib/actionRoadmap/mcRiskValidation";
import { validateTraceability } from "@/lib/actionRoadmap/eventTraceability";
import type { FanPoint, PortfolioState, ScenarioEvent } from "@/lib/scenarioV2/types";

import { ExplainabilityToggle } from "@/components/actionRoadmap/ExplainabilityToggle";
import { ExecutiveDecision } from "@/components/actionRoadmap/ExecutiveDecision";
import { RecommendationExplainabilityPanel } from "@/components/actionRoadmap/RecommendationExplainabilityPanel";
import { buildRecommendationExplanation } from "@/lib/actionRoadmap/recommendationExplanation";
import { FireJourneyRoadmap } from "@/components/actionRoadmap/FireJourneyRoadmap";
import { WealthTimelineGantt } from "@/components/actionRoadmap/WealthTimelineGantt";
import { NetWorthAttribution } from "@/components/actionRoadmap/NetWorthAttribution";
import { MonteCarloOutlook } from "@/components/actionRoadmap/MonteCarloOutlook";
import { RisksFailurePoints } from "@/components/actionRoadmap/RisksFailurePoints";
import { AlternativeStrategies } from "@/components/actionRoadmap/AlternativeStrategies";
import { NextActionsPanel } from "@/components/actionRoadmap/NextActionsPanel";
import type { RoadmapSectionProps } from "@/components/actionRoadmap/roadmapContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const HORIZON_YEARS_DEFAULT = 25;
const MOBILE_TAB_STORAGE_KEY = "fwl.actionRoadmap.mobileTab";

type MobileTabId = "summary" | "roadmap" | "timeline" | "risks" | "alternatives" | "actions";
const MOBILE_TABS: Array<{ id: MobileTabId; label: string }> = [
  { id: "summary",      label: "Summary" },
  { id: "roadmap",      label: "Roadmap" },
  { id: "timeline",     label: "Timeline" },
  { id: "risks",        label: "Risks" },
  { id: "alternatives", label: "Alternatives" },
  { id: "actions",      label: "Actions" },
];

export default function ActionRoadmapPage() {
  const [auditMode, setAuditMode] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState<MobileTabId>(() => {
    if (typeof window === "undefined") return "summary";
    const stored = window.sessionStorage.getItem(MOBILE_TAB_STORAGE_KEY);
    if (stored && MOBILE_TABS.some((t) => t.id === stored)) return stored as MobileTabId;
    return "summary";
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(MOBILE_TAB_STORAGE_KEY, mobileTab);
  }, [mobileTab]);

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
  // carries the canonical month; fall back to current month otherwise.
  const startMonth = fan[0]?.month ?? new Date().toISOString().slice(0, 7);

  const enrichedMilestones = enrichFireJourneyMilestones({
    milestones: roadmap?.milestones ?? [],
    fan,
    startMonth,
    fireNumber,
    swrPct,
  });

  const fanP50AtHorizon = fan.length > 0 ? fan[fan.length - 1]!.p50 : null;
  const attribution = selectNetWorthAttribution({ finalState, fanP50AtHorizon });
  const reconciliation = reconcileTerminalNetWorth({ finalState, fanP50AtHorizon });

  // Sprint 29 §4 — MC variance diagnostic.
  const terminalNwSamples: number[] = (recommended?.winner?.result?.terminalNwSamples as number[] | undefined) ?? [];
  const mcVariance = computeMCVarianceDiagnostic({
    terminalNwSamples,
    fireNumber,
    swrPct,
    startAge: currentAge,
    fanFireMonths: { p25: monthIndexAt(fan, fireNumber, "p25"), p50: monthIndexAt(fan, fireNumber, "p50"), p75: monthIndexAt(fan, fireNumber, "p75") },
  });

  // Sprint 29 §7 — engine event timeline.
  const events: ScenarioEvent[] = (recommended?.winner?.result?.events as ScenarioEvent[] | undefined) ?? [];
  const fireMonthCrossing = monthIndexAt(fan, fireNumber, "p50");
  const fireMonth = fireMonthCrossing != null && fireMonthCrossing >= 0 && fireMonthCrossing < fan.length
    ? fan[fireMonthCrossing]?.month ?? null
    : null;
  const engineEvents = selectEngineEventTimeline({ events, fireMonth });

  // Sprint 30A §P1 — 5-lane categorisation with engine|derived source labels.
  const laneEvents = selectEngineEventLanes({
    events,
    fan,
    startMonth,
    fireNumber,
    swrPct,
    medianFinalState: finalState ?? undefined,
  });

  // Sprint 30A §P1 — hybrid dependency chain.
  const dependencyEdges = buildDependencyChain({ events: laneEvents });

  // Sprint 30A §P1 — MC risk validation chip.
  const riskValidation = validateMcRiskOutputs({
    defaultProbability: recommended?.winner?.result?.defaultProbability ?? null,
    liquidityStressProbability: recommended?.winner?.result?.liquidityStressProbability ?? null,
    liquidityExhaustionProbability: recommended?.winner?.result?.liquidityExhaustionProbability ?? null,
    negativeEquityProbability: recommended?.winner?.result?.negativeEquityProbability ?? null,
    refinancePressureProbability: recommended?.winner?.result?.refinancePressureProbability ?? null,
    forcedSaleTriggerProbability: recommended?.winner?.result?.forcedSaleReport?.triggerProbability ?? null,
    simulationCount: recommended?.winner?.result?.simulationCount ?? plan?.metrics.simulationCount ?? null,
    terminalNwCV: mcVariance.terminalNetWorth.cv,
    passiveIncomeCV: mcVariance.passiveIncome.cv,
  });

  // Sprint 30A addendum A2 — event traceability validator runs every render.
  // Outside Audit Mode a console.warn fires on any failure; the chip shows
  // only when Audit Mode is on.
  const traceability = validateTraceability(enrichedMilestones, laneEvents);
  if (typeof window !== "undefined" && traceability.status === "fail" && !auditMode) {
    // eslint-disable-next-line no-console
    console.warn("[action-roadmap] traceability failed", traceability.failures);
  }

  const failures = selectFailureAnalysis({
    result: recommended?.winner?.result ?? null,
    softWarnings: recommended?.winner?.softWarnings,
  });

  // Filter milestones to those that survive the zero-delta filter (P3) before
  // building Next Actions (§11.2). The roadmap already filters cross-template
  // entries; enriched milestones add the zero-delta filter.
  const nextActions = buildNextActions({
    milestones: enrichedMilestones,
    today: new Date(),
  });

  const lanes = selectWealthBuildingLanes({
    milestones: roadmap?.milestones ?? [],
    fan,
    startMonth,
    fireNumber,
    horizonYears: HORIZON_YEARS_DEFAULT,
  });

  // Sprint 30B Step 2 — single-source recommendation explainability view-model.
  // Pure selector over the same `plan` object the rest of the page reads from.
  const recommendationExplanation = React.useMemo(
    () =>
      buildRecommendationExplanation({
        plan,
        startAge: currentAge,
        fireTarget: fireNumber,
        swrPct,
      }),
    [plan, currentAge, fireNumber, swrPct],
  );

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
    reconciliation,
    mcVariance,
    engineEvents,
    laneEvents,
    dependencyEdges,
    riskValidation,
    traceability,
    auditMode,
  };

  const noPlanBanner = !recommended ? (
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
  ) : null;

  return (
    <div className="container mx-auto max-w-5xl px-3 sm:px-4 py-6 space-y-4" data-testid="action-roadmap-page">
      <PageHeader auditMode={auditMode} onAuditChange={setAuditMode} hasPlan={hasPlan && recommended != null} />
      {noPlanBanner}

      {/* Sprint 30A addendum A2 — traceability chip (Audit Mode only). */}
      {auditMode && (
        <TraceabilityChip traceability={traceability} />
      )}

      {/* Desktop ≥ sm — full vertical stack of 8 sections (Sprint 28B layout) */}
      <div className="hidden space-y-4 sm:block" data-testid="ar-desktop-stack">
        <ExecutiveDecision {...ctx} />
        <RecommendationExplainabilityPanel explanation={recommendationExplanation} />
        <FireJourneyRoadmap {...ctx} />
        <WealthTimelineGantt {...ctx} />
        <NetWorthAttribution {...ctx} />
        <MonteCarloOutlook {...ctx} />
        <RisksFailurePoints {...ctx} />
        <AlternativeStrategies {...ctx} />
        <NextActionsPanel {...ctx} />
      </div>

      {/* Mobile < sm — 6-tab wrapper per Sprint 29 §12.1 */}
      <div className="sm:hidden" data-testid="ar-mobile-tabs">
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as MobileTabId)}>
          <TabsList
            className="grid h-auto w-full gap-1 bg-muted/60 p-1 [grid-template-columns:repeat(3,minmax(0,1fr))]"
            style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
          >
            {MOBILE_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="min-h-[36px] text-xs py-1.5 whitespace-nowrap" data-testid={`ar-mobile-tab-${t.id}`}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="summary" className="mt-4 space-y-4">
            <ExecutiveDecision {...ctx} />
            <RecommendationExplainabilityPanel explanation={recommendationExplanation} />
          </TabsContent>
          <TabsContent value="roadmap" className="mt-4 space-y-4">
            <FireJourneyRoadmap {...ctx} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4 space-y-4">
            <WealthTimelineGantt {...ctx} />
          </TabsContent>
          <TabsContent value="risks" className="mt-4 space-y-4">
            <NetWorthAttribution {...ctx} />
            <RisksFailurePoints {...ctx} />
          </TabsContent>
          <TabsContent value="alternatives" className="mt-4 space-y-4">
            <MonteCarloOutlook {...ctx} />
            <AlternativeStrategies {...ctx} />
          </TabsContent>
          <TabsContent value="actions" className="mt-4 space-y-4">
            <NextActionsPanel {...ctx} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/** First month-index where fan[idx][percentile] >= target. -1 if never. */
function monthIndexAt(fan: FanPoint[], target: number | null, pct: "p25" | "p50" | "p75"): number | null {
  if (target == null || !Number.isFinite(target) || target <= 0) return null;
  if (!Array.isArray(fan) || fan.length === 0) return null;
  for (let i = 0; i < fan.length; i++) {
    const v = fan[i]![pct];
    if (Number.isFinite(v) && v >= target) return i;
  }
  return null;
}

function TraceabilityChip({ traceability }: { traceability: import("@/lib/actionRoadmap/eventTraceability").TraceabilityResult }) {
  const totalChecked = traceability.stats.totalEvents;
  const failedCount = traceability.failures.length;
  const passedCount = Math.max(0, totalChecked - failedCount);
  const tone = traceability.status === "pass"
    ? "border-emerald-300/60 bg-emerald-50/40 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/20 dark:text-emerald-100"
    : "border-rose-300/60 bg-rose-50/40 text-rose-900 dark:border-rose-400/30 dark:bg-rose-950/20 dark:text-rose-100";
  return (
    <div
      data-testid="ar-traceability-chip"
      className={`flex flex-wrap items-start gap-2 rounded-md border px-3 py-2 text-xs ${tone}`}
    >
      <span className="font-medium uppercase tracking-wider">Traceability:</span>
      <span>
        {passedCount} passed / {failedCount} failed ·{" "}
        engine {traceability.stats.engineEvents} · derived {traceability.stats.derivedEvents} ·{" "}
        lanes rendered {traceability.stats.lanesRendered} / hidden {traceability.stats.lanesHidden}
      </span>
      {traceability.failures.length > 0 && (
        <ul className="mt-1 w-full space-y-1">
          {traceability.failures.slice(0, 8).map((f, i) => (
            <li key={i} className="text-[11px]">
              <span className="font-mono">[{f.reason}]</span> {f.detail}
            </li>
          ))}
          {traceability.failures.length > 8 && (
            <li className="text-[11px] italic">… {traceability.failures.length - 8} more</li>
          )}
        </ul>
      )}
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
