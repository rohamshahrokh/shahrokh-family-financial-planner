/**
 * /action-roadmap — Sprint 28 flagship page.
 *
 * Replaces /goal-closure-lab as the Layer 3 "Tell me what to do" surface in
 * the MOVE architecture (Sprint 28 architecture §1). Reads the cached Goal
 * Lab plan (no engine re-run, no Supabase write), then orchestrates the
 * existing Sprint 27 selectors + the two new Sprint 28 selectors to render
 * eight sections (S1–S8).
 *
 * Honesty: every numeric value comes from an engine selector. When the cache
 * is empty OR the engine produced no value, the affected cell renders the
 * literal "Not modelled yet" — never a fake number, never a fake probability.
 */
import * as React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { selectCanonicalFire } from "@/lib/canonicalFire";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { computeCanonicalHeadlineMetrics } from "@/lib/canonicalHeadlineMetrics";
import { readLatestGoalLabPlan } from "@/lib/goalLab/orchestrator";
import { computeGoalLabConfidence } from "@/lib/goalLab/goalLabConfidence";

import { buildActionRoadmap } from "@/lib/actionRoadmap/actionRoadmapBuilder";
import { computePathCompletion } from "@/lib/actionRoadmap/pathCompletionEngine";
import { analyzeRoadmapRisk } from "@/lib/actionRoadmap/roadmapRiskAnalyzer";
import { buildAcceleratorRanking } from "@/lib/actionRoadmap/roadmapAccelerators";
import { selectMonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import type { FanPoint } from "@/lib/scenarioV2/types";

import { ExecutiveSummary } from "@/components/actionRoadmap/ExecutiveSummary";
import { FireJourneyTimeline } from "@/components/actionRoadmap/FireJourneyTimeline";
import { MonteCarloProjectionSection } from "@/components/actionRoadmap/MonteCarloProjectionSection";
import { PathCompletionSection } from "@/components/actionRoadmap/PathCompletionSection";
import { TopAccelerators } from "@/components/actionRoadmap/TopAccelerators";
import { RiskDashboard } from "@/components/actionRoadmap/RiskDashboard";
import { AlternativePaths } from "@/components/actionRoadmap/AlternativePaths";
import { ExplainabilityToggle } from "@/components/actionRoadmap/ExplainabilityToggle";
import { Button } from "@/components/ui/button";

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

  /* ── Empty state ─────────────────────────────────────────────────────── */
  if (!plan || !plan.picks?.recommended) {
    return (
      <div className="container mx-auto max-w-5xl px-3 sm:px-4 py-6 space-y-4" data-testid="action-roadmap-page">
        <header>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Action Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your engine-ranked plan for closing the FIRE gap.
          </p>
        </header>
        <section
          aria-labelledby="ar-empty-heading"
          className="rounded-2xl border border-dashed border-border/60 bg-card p-6 text-center"
          data-testid="ar-empty"
        >
          <Sparkles className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-400" aria-hidden />
          <h2 id="ar-empty-heading" className="mt-3 text-base font-semibold text-foreground">Not modelled yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Run a plan from Decision Lab to populate your Action Roadmap.
          </p>
          <Link href="/decision-lab">
            <Button size="sm" className="mt-4 gap-1.5">
              Open Decision Lab <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </Link>
        </section>
      </div>
    );
  }

  /* ── All selectors ───────────────────────────────────────────────────── */
  const recommended = plan.picks.recommended;
  const targetFireAge = goal && goal.status === "SET" ? goal.targetFireAge : null;

  const fan: FanPoint[] = (recommended.winner?.result?.netWorthFan as FanPoint[] | undefined) ?? [];
  const fireNumber = fire?.fireNumber ?? null;
  const swrPct = fire?.swrPct ?? null;

  const mc = selectMonteCarloProjection({
    fan,
    startAge: currentAge,
    fireTarget: fireNumber,
    swrPct,
    simulationCount: plan.metrics.simulationCount ?? 0,
  });
  const roadmap = buildActionRoadmap(recommended, { targetFireAge }, currentAge);
  const completion = computePathCompletion(recommended, fire, { targetFireAge }, currentAge);
  const risk = analyzeRoadmapRisk(recommended);
  const ranking = buildAcceleratorRanking(plan.picks, plan.rankedScenarios);
  const confidence = computeGoalLabConfidence({
    goal: goal ?? null,
    hasLedger: !!canonicalLedger,
    netWorth: headline?.netWorth ?? null,
    monthlySurplus: headline?.monthlySurplus ?? null,
    confirmed: {},
    plan,
  });

  return (
    <div className="container mx-auto max-w-5xl px-3 sm:px-4 py-6 space-y-4" data-testid="action-roadmap-page">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Action Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Engine-ranked plan to close your FIRE gap.
          </p>
        </div>
        <Link href="/decision-lab" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
          Open Decision Lab to compare strategies
        </Link>
      </header>

      <ExplainabilityToggle auditMode={auditMode} onChange={setAuditMode} />

      <ExecutiveSummary
        pathName={recommended.templateLabel}
        pathPromise={recommended.promise}
        mc={mc}
        confidence={confidence}
        auditMode={auditMode}
      />

      <FireJourneyTimeline roadmap={roadmap} />

      <MonteCarloProjectionSection mc={mc} auditMode={auditMode} />

      <PathCompletionSection
        completion={completion}
        currentNetWorth={headline?.netWorth ?? null}
        fireNumber={fireNumber}
        auditMode={auditMode}
      />

      <TopAccelerators
        ranking={ranking}
        recommendedTemplateId={recommended.templateId}
        auditMode={auditMode}
      />

      <RiskDashboard risk={risk} auditMode={auditMode} />

      <AlternativePaths
        picks={plan.picks}
        recommendedTemplateId={recommended.templateId}
        auditMode={auditMode}
      />
    </div>
  );
}
