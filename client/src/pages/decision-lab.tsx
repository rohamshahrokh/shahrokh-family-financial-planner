/**
 * decision-lab.tsx — Sprint 14.3.
 *
 * Decision Lab is the MOVE-step hub for deeper, more analytical decision work.
 * It is a SUMMARY-FIRST INDEX over three existing advanced pages:
 *   • /decision           — Decision Engine (ranked strategies, behavioural fit)
 *   • /goal-closure-lab   — Goal Closure (FIRE-gap quantification + levers)
 *   • /portfolio-lab      — Portfolio Lab (allocation / risk-budget optimiser)
 *
 * The page itself does NO heavy compute. Every visible number comes from
 * existing CHEAP, pure selectors that other pages already call:
 *   • computeCanonicalFire(ledger)            — gap + progressFraction
 *   • selectPropertyEquity / selectStocksTotal / selectCryptoTotal /
 *     selectCashToday / selectSuperCombined   — allocation buckets
 *
 * Heavy orchestrators (generateQuickDecisionCandidates, buildGoalClosureLab,
 * truePortfolioOptimizer) are NOT invoked here. Where a summary number would
 * require firing one of those, the section falls back to a single
 * plain-English line — the value of this page is hierarchy + reachability,
 * not pre-running every engine on every page load.
 *
 * ── Audit-gate pattern ─────────────────────────────────────────────────────
 * Mirrors action-plan.tsx: per-card useAuditMode(); plain-English copy and
 * canonical numbers always render; only lineage / selector names gate on
 * `auditMode && ...`. Default state surfaces no engine identifiers.
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as React from "react";
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  selectPropertyEquity,
  selectStocksTotal,
  selectCryptoTotal,
  selectCashToday,
  selectSuperCombined,
} from "@/lib/dashboardDataContract";
import { selectCanonicalFire, isFireGoalExplicitlySet } from "@/lib/canonicalFire";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { FireGoalEmptyState } from "@/components/FireGoalEmptyState";
import { formatCurrency } from "@/lib/finance";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, Scale, Target, PieChart, Sparkles, Loader2, Check, X, ShieldCheck } from "lucide-react";
import { useCanonicalGoalProfile } from "@/lib/goalLab/useCanonicalGoalProfile";
import { useGoalLabPlan } from "@/lib/goalLab/useGoalLabPlan";
import type { GoalLabPlanOutput } from "@/lib/goalLab/orchestrator";
import { buildRecommendationExplanation } from "@/lib/actionRoadmap/recommendationExplanation";
import { RecommendationExplainabilityPanel } from "@/components/actionRoadmap/RecommendationExplainabilityPanel";
import { selectMonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import { analyzeRoadmapRisk } from "@/lib/actionRoadmap/roadmapRiskAnalyzer";
import type { FanPoint } from "@/lib/scenarioV2/types";

/* ────────────────────────────────────────────────────────────────────────── */
/* Local helpers                                                              */
/* ────────────────────────────────────────────────────────────────────────── */
function SourceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] text-muted-foreground/80 leading-none">
      {children}
    </span>
  );
}

function SummaryCard({
  testId,
  title,
  icon,
  subtitle,
  auditLineage,
  ctaLabel,
  ctaHref,
  children,
}: {
  testId: string;
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  auditLineage?: string;
  ctaLabel: string;
  ctaHref: string;
  children: React.ReactNode;
}) {
  const { auditMode } = useAuditMode();
  return (
    <section
      data-testid={testId}
      className="rounded-lg border bg-card p-3 sm:p-4 space-y-3"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground shrink-0">{icon}</span>
            <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-snug">
            {subtitle}
          </p>
          {auditMode && auditLineage && (
            <div className="mt-1">
              <SourceChip>{auditLineage}</SourceChip>
            </div>
          )}
        </div>
        <Link href={ctaHref}>
          <Button
            size="sm"
            data-testid={`${testId}-cta`}
            className="gap-1.5 shrink-0"
          >
            {ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </header>

      <div data-testid={`${testId}-facts`} className="text-sm">
        {children}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section A — Decision Engine                                                */
/* Static fallback: invoking generateQuickDecisionCandidates is the heavy     */
/* compute that lives behind /decision and runs against MC paths. Per the    */
/* brief, anything that costs >100ms or requires user input must use the     */
/* fallback line on this hub page.                                            */
/* ────────────────────────────────────────────────────────────────────────── */
function DecisionEngineSummary() {
  return (
    <SummaryCard
      testId="dl-section-decision-engine"
      title="Decision Engine"
      icon={<Scale className="w-4 h-4 text-amber-400" />}
      subtitle="Compare strategies side-by-side, with risk and confidence."
      auditLineage="Static summary — generateQuickDecisionCandidates is invoked on /decision, not here."
      ctaLabel="Open Decision Engine"
      ctaHref="/decision"
    >
      <p className="text-muted-foreground leading-relaxed">
        See ranked strategies, behavioural fit, safety scoring, and tail-risk
        analysis for your current ledger.
      </p>
    </SummaryCard>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section B — Goal Closure                                                   */
/* Uses ONLY canonicalFire (pure selector) for the gap headline. The full     */
/* lever ranking lives behind buildGoalClosureLab(), which IS heavy and is    */
/* NOT invoked here — the top-lever line therefore stays in the fallback.    */
/* ────────────────────────────────────────────────────────────────────────── */
function GoalClosureSummary({ ledger }: { ledger: DashboardInputs | null }) {
  // Sprint 15 Phase 2: route through selectCanonicalFire so mc_fire_settings
  // (swrPct + targetPassiveMonthly) override snapshot.fire_target_monthly_income.
  const { data: goal } = useCanonicalGoal();
  const fire = useMemo(
    () => (ledger ? selectCanonicalFire(ledger, goal) : null),
    [ledger, goal],
  );
  const gap = fire?.gap ?? null;
  const progressPct =
    fire && typeof fire.progressFraction === "number" && Number.isFinite(fire.progressFraction)
      ? Math.round(fire.progressFraction * 100)
      : null;
  const goalSet = isFireGoalExplicitlySet(goal);

  return (
    <SummaryCard
      testId="dl-section-goal-closure"
      title="Goal Closure"
      icon={<Target className="w-4 h-4 text-emerald-400" />}
      subtitle="How close are you to closing your FIRE gap, and which levers move it most?"
      auditLineage="canonicalFire.gap · canonicalFire.progressFraction"
      ctaLabel="Open Goal Closure"
      ctaHref="/goal-closure-lab"
    >
      {!goalSet ? (
        <FireGoalEmptyState surface="decision-lab" />
      ) : fire && gap !== null ? (
        <ul className="space-y-1">
          <li data-testid="dl-goal-closure-gap">
            <span className="font-semibold text-foreground">FIRE gap: </span>
            {gap > 0 ? (
              <>
                <span className="num-display">{formatCurrency(gap)}</span>
                <span className="text-muted-foreground"> to go</span>
              </>
            ) : (
              <span className="text-foreground">On target</span>
            )}
          </li>
          {progressPct !== null && (
            <li data-testid="dl-goal-closure-progress">
              <span className="font-semibold text-foreground">Progress: </span>
              <span className="num-display">{progressPct}%</span>
              <span className="text-muted-foreground"> of your FIRE number</span>
            </li>
          )}
          <li className="text-muted-foreground leading-relaxed">
            Quantify the gap and rank the levers that close it fastest in the
            full Goal Closure workspace.
          </li>
        </ul>
      ) : (
        <p className="text-muted-foreground leading-relaxed">
          Quantify your FIRE gap and see which levers close it fastest.
        </p>
      )}
    </SummaryCard>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section C — Portfolio Lab                                                  */
/* Uses ONLY the canonical bucket selectors (cheap pure functions) for the    */
/* allocation snapshot. The optimiser top-recommendation requires running    */
/* truePortfolioOptimizer / portfolioLabOptimizer, which is heavy and lives  */
/* behind /portfolio-lab. We do NOT invoke it here.                          */
/* ────────────────────────────────────────────────────────────────────────── */
function PortfolioLabSummary({ ledger }: { ledger: DashboardInputs | null }) {
  const buckets = useMemo(() => {
    if (!ledger) return null;
    return [
      { label: "Property", value: selectPropertyEquity(ledger) },
      { label: "Stocks",   value: selectStocksTotal(ledger) + selectCryptoTotal(ledger) },
      { label: "Cash",     value: selectCashToday(ledger) },
      { label: "Super",    value: selectSuperCombined(ledger) },
    ];
  }, [ledger]);
  const bucketTotal = buckets ? buckets.reduce((a, b) => a + Math.max(0, b.value), 0) : 0;
  const allocationLine =
    buckets && bucketTotal > 0
      ? buckets
          .map(b => `${b.label} ${Math.round((Math.max(b.value, 0) / bucketTotal) * 100)}%`)
          .join(" · ")
      : null;

  return (
    <SummaryCard
      testId="dl-section-portfolio-lab"
      title="Portfolio Lab"
      icon={<PieChart className="w-4 h-4 text-sky-400" />}
      subtitle="Tune allocation, risk budget, and concentration."
      auditLineage="selectPropertyEquity · selectStocksTotal+selectCryptoTotal · selectCashToday · selectSuperCombined"
      ctaLabel="Open Portfolio Lab"
      ctaHref="/portfolio-lab"
    >
      {allocationLine ? (
        <ul className="space-y-1">
          <li data-testid="dl-portfolio-lab-allocation">
            <span className="font-semibold text-foreground">Today: </span>
            <span className="num-display">{allocationLine}</span>
          </li>
          <li className="text-muted-foreground leading-relaxed">
            Test allocation shifts, risk budgets, and concentration with the
            True Portfolio Optimizer.
          </li>
        </ul>
      ) : (
        <p className="text-muted-foreground leading-relaxed">
          Test allocation shifts, risk budgets, and concentration with the True
          Portfolio Optimizer.
        </p>
      )}
    </SummaryCard>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Page                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */
export default function DecisionLabPage() {
  /* Canonical ledger queries — same shape as goal-closure-lab.tsx and
     portfolio-lab.tsx. No new endpoints, no new selectors. */
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

  return (
    <div
      className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-3xl space-y-4 sm:space-y-5"
      data-testid="decision-lab-page"
    >
      <header>
        <h1
          className="text-xl sm:text-2xl font-semibold text-foreground"
          data-testid="decision-lab-title"
        >
          Decision Lab
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run deeper analyses. Compare strategies, FIRE-path closure, and
          portfolio tuning.
        </p>
      </header>

      <GoalLabPlanSummary ledger={canonicalLedger} />
      <DecisionEngineSummary />
      <GoalClosureSummary ledger={canonicalLedger} />
      <PortfolioLabSummary ledger={canonicalLedger} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Section — Goal Lab Plan (Sprint 23)                                          */
/* Reads the canonical Goal Profile + ledger and offers to run the Goal-Lab    */
/* orchestrator. Surfaces the six named picks the brief mandates: recommended,*/
/* safest, fastest, highest-probability, best-cashflow, best-hybrid. All     */
/* numbers come from the existing scenarioV2 engine — this section adds      */
/* ZERO financial math.                                                       */
/* ──────────────────────────────────────────────────────────────────── */
function GoalLabPlanSummary({ ledger }: { ledger: DashboardInputs | null }) {
  const { auditMode } = useAuditMode();
  // No-op fallback when ledger has not loaded yet — the page still renders
  // its other summary cards.
  if (!ledger) {
    return (
      <section
        data-testid="dl-section-goal-lab-plan"
        className="rounded-lg border bg-card p-3 sm:p-4"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <p className="text-sm text-muted-foreground">Loading household ledger…</p>
      </section>
    );
  }
  return <GoalLabPlanSummaryInner ledger={ledger} auditMode={auditMode} />;
}

function GoalLabPlanSummaryInner({ ledger, auditMode }: { ledger: DashboardInputs; auditMode: boolean }) {
  const profile = useCanonicalGoalProfile(ledger);
  const { plan, generatedAt, isRunning, error, run } = useGoalLabPlan(ledger, profile);

  const picks = plan?.picks;
  const noPlan = !plan;
  const noFeasible = !!plan && !plan.hasFeasibleScenario;

  // Sprint 25 P4 — Analysis Trace lifecycle.
  //
  // Goals:
  //   • Trace appears IMMEDIATELY on click and remains visible while running.
  //   • After completion, trace stays visible (user can collapse it) so the
  //     user can review what the system did.
  //   • Elapsed timer ticks every 250ms while running.
  //   • On success we briefly highlight "Analysis complete", then smooth-
  //     scroll the recommended card into view. The trace remains rendered.
  const [traceVisible, setTraceVisible] = React.useState(false);
  const [traceCollapsed, setTraceCollapsed] = React.useState(false);
  const [runStartMs, setRunStartMs] = React.useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [lastCompletedElapsedMs, setLastCompletedElapsedMs] = React.useState<number | null>(null);
  const wasRunning = React.useRef(false);
  const recommendedRef = React.useRef<HTMLDivElement | null>(null);

  // When isRunning flips true, start the timer + open the trace.
  React.useEffect(() => {
    if (isRunning) {
      setTraceVisible(true);
      setTraceCollapsed(false);
      setRunStartMs(performance.now());
      setElapsedMs(0);
      wasRunning.current = true;
    }
  }, [isRunning]);

  // Tick the elapsed timer while running.
  React.useEffect(() => {
    if (!isRunning || runStartMs == null) return;
    const id = setInterval(() => {
      setElapsedMs(performance.now() - runStartMs);
    }, 250);
    return () => clearInterval(id);
  }, [isRunning, runStartMs]);

  // When isRunning falls false after a run, freeze the elapsed time, scroll,
  // and KEEP the trace visible.
  React.useEffect(() => {
    if (wasRunning.current && !isRunning) {
      if (runStartMs != null) {
        setLastCompletedElapsedMs(performance.now() - runStartMs);
      }
      wasRunning.current = false;
      if (!error) {
        // Give React one paint to draw the success state, then scroll.
        const id = window.setTimeout(() => {
          recommendedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
        return () => window.clearTimeout(id);
      }
    }
  }, [isRunning, error, runStartMs]);

  // Wrap run() so the trace opens BEFORE the orchestrator is invoked. The
  // useEffect above also handles this, but flipping traceVisible synchronously
  // here gives the user immediate visual feedback even on the first click.
  const handleRunClick = React.useCallback(() => {
    setTraceVisible(true);
    setTraceCollapsed(false);
    setRunStartMs(performance.now());
    setElapsedMs(0);
    void run();
  }, [run]);

  return (
    <section
      data-testid="dl-section-goal-lab-plan"
      className="rounded-lg border bg-card p-3 sm:p-4 space-y-3"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground shrink-0">
              <Sparkles className="w-4 h-4 text-violet-400" />
            </span>
            <h2 className="text-base sm:text-lg font-semibold">Goal Lab plan</h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-snug">
            Ranked next-move paths from your canonical Goal Profile. Powered by
            the existing decision engine — no new math.
          </p>
          {auditMode && (
            <div className="mt-1 text-[10px] text-muted-foreground/80">
              {plan
                ? `engines: ${plan.enginesUsed.candidateGenerator} · ${plan.enginesUsed.monteCarlo}`
                : "engines: scenarioV2/decisionEngine/candidateGenerator (not yet run)"}
              {generatedAt ? ` · generated ${new Date(generatedAt).toLocaleString()}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/goal-lab">
            <Button size="sm" variant="outline" data-testid="dl-goal-lab-cta" className="gap-1.5">
              Edit goal
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={handleRunClick}
            disabled={isRunning}
            data-testid="dl-goal-lab-run"
            className="gap-1.5"
            aria-busy={isRunning}
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isRunning ? (
              <>Evaluating your FIRE path… <span className="font-mono tabular-nums">{formatElapsed(elapsedMs)}</span></>
            ) : plan ? "Re-run plan" : "Run plan"}
          </Button>
        </div>
      </header>

      {error && (
        <p
          data-testid="dl-goal-lab-error"
          className="text-xs text-rose-500 dark:text-rose-300"
        >
          Couldn’t compute a plan: {error}
        </p>
      )}

      {traceVisible && (
        <AnalysisTracePanel
          isRunning={isRunning}
          collapsed={traceCollapsed}
          onToggleCollapsed={() => setTraceCollapsed((c) => !c)}
          onClose={() => setTraceVisible(false)}
          error={error}
          plan={plan}
          elapsedMs={isRunning ? elapsedMs : lastCompletedElapsedMs ?? elapsedMs}
          isLive={isRunning}
        />
      )}

      {!profile.isExplicitlySet && (
        <p
          data-testid="dl-goal-lab-needs-goal"
          className="text-xs text-amber-600 dark:text-amber-300"
        >
          Set your FIRE goal in Goal Lab to enable Goal-Lab orchestration.
        </p>
      )}

      {noPlan ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          No Goal-Lab plan has run yet this session. Click <span className="font-medium text-foreground">Run plan</span> to generate ranked paths from your current ledger + goal profile.
        </p>
      ) : noFeasible ? (
        <p data-testid="dl-goal-lab-no-feasible" className="text-sm text-muted-foreground leading-relaxed">
          The engine evaluated {plan!.templatesEvaluatedIds.length} scenarios for your profile but found no path that survived current safety ceilings. Loosen risk tolerance or revisit FIRE targets in Goal Lab.
        </p>
      ) : picks ? (
        <div ref={recommendedRef} className="space-y-3">
          {/* Sprint 28 — pure comparison surface. No "winner" highlighting, no
              probability badges, no execution detail. The Action Roadmap page
              owns the recommendation handoff. */}
          <CompareStrategiesTable plan={plan!} />
          {/* Sprint 30B Step 2 — same recommendation-explainability panel that
              ships on Action Roadmap, fed from the same plan object so the
              two surfaces cannot disagree. */}
          <RecommendationExplainabilityPanel
            explanation={buildRecommendationExplanation({
              plan: plan!,
              startAge: plan!.profile.fire.currentAge ?? null,
              fireTarget:
                plan!.profile.fire.targetPassiveAnnual != null &&
                plan!.profile.fire.swrPct != null &&
                plan!.profile.fire.swrPct > 0
                  ? plan!.profile.fire.targetPassiveAnnual / (plan!.profile.fire.swrPct / 100)
                  : null,
              swrPct: plan!.profile.fire.swrPct ?? null,
            })}
          />
          <div className="pt-2">
            <Link href="/action-roadmap">
              <Button size="sm" data-testid="dl-open-action-roadmap-cta" className="gap-1.5">
                Open Action Roadmap for the recommended strategy
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Sprint 25 #3 — Analysis Trace panel.
 *
 * Eight-step transparent trace shown while the orchestrator runs. Each step
 * has:
 *   - a plain-English heading
 *   - a small technical "source" / "engine" label (real names from this codebase)
 *   - a bullet list of inputs / candidates / purpose so the user can see what
 *     the system is actually using
 *   - a status chip (waiting / in progress / done / failed)
 *
 * The cadence is time-driven (~700ms/step) because the underlying engines
 * (candidate generator + MC + ranker) run synchronously inside a single hook
 * call and emit no progress events. To stay honest:
 *   • If the run errors, the currently active step flips to FAILED with the
 *     message "Could not complete this step" plus the engine error string.
 *     No subsequent steps are marked done.
 *   • We never claim “done” on Step 8 until the parent has a real plan.
 *   • Engine names on Steps 4 / 5 / 6 are pulled from `plan.enginesUsed`
 *     once available, so the labels match what actually ran.
 */
const ANALYSIS_TRACE_STEPS: Array<{
  heading: string;
  source: string;        // small "technical source" chip
  sourceKind: "source" | "engine" | "output";
  items: string[];       // bullet list rendered under the heading
  itemsHeading: string;  // e.g. "Data used" / "Candidates" / "Purpose"
}> = [
  {
    heading: "Reading your financial profile",
    source: "Canonical Ledger",
    sourceKind: "source",
    itemsHeading: "Data used",
    items: ["Income", "Expenses", "Net worth", "Liquidity", "Debts", "Assets"],
  },
  {
    heading: "Reading your Goal Lab profile",
    source: "Canonical Goal Profile",
    sourceKind: "source",
    itemsHeading: "Data used",
    items: [
      "FIRE target year",
      "Target passive income",
      "Preferred wealth engine",
      "Risk tolerance",
      "Liquidity preference",
      "Constraints",
    ],
  },
  {
    heading: "Loading assumptions",
    source: "Assumptions Centre",
    sourceKind: "source",
    itemsHeading: "Data used",
    items: [
      "Inflation",
      "Property growth",
      "ETF return",
      "Interest rates",
      "Safe withdrawal band",
    ],
  },
  {
    heading: "Generating strategy candidates",
    source: "candidateGenerator \u00b7 scenarioTemplates",
    sourceKind: "engine",
    itemsHeading: "Candidates",
    items: [
      "Current plan",
      "Buy investment property",
      "Delay property",
      "ETF acceleration",
      "Debt reduction",
      "Hybrid property + ETF",
      "Liquidity preservation",
    ],
  },
  {
    heading: "Running scenario engine",
    source: "runScenarioV2",
    sourceKind: "engine",
    itemsHeading: "Purpose",
    items: ["Project each strategy path using your current household profile."],
  },
  {
    heading: "Running risk and probability layer",
    source: "scenarioV2/monteCarlo",
    sourceKind: "engine",
    itemsHeading: "Purpose",
    items: [
      "Estimate uncertainty, confidence and downside risk where available.",
      "If a path has no modelled probability we show \u201cScenario confidence not yet available\u201d \u2014 never 0%.",
    ],
  },
  {
    heading: "Ranking recommendations",
    source: "decisionRanking \u00b7 recommendationEngine",
    sourceKind: "engine",
    itemsHeading: "Ranked by",
    items: [
      "Probability",
      "Speed to FIRE",
      "Liquidity",
      "Leverage risk",
      "Cashflow impact",
      "Behavioural fit",
    ],
  },
  {
    heading: "Producing your recommendation",
    source: "Decision Lab output",
    sourceKind: "output",
    itemsHeading: "You will see",
    items: [
      "Recommended path",
      "Why this path",
      "Trade-offs",
      "Alternatives",
      "Confidence state",
    ],
  },
];

function AnalysisTracePanel({
  isRunning,
  collapsed,
  onToggleCollapsed,
  onClose,
  error,
  plan,
  elapsedMs,
  isLive,
}: {
  isRunning: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
  error: string | null;
  plan: ReturnType<typeof useGoalLabPlan>["plan"];
  elapsedMs: number;
  isLive: boolean;
}) {
  // Drive the active step from a timed reel while running. Once the parent
  // signals completion, we hold all steps at "done". When an error appears,
  // the active step flips to "failed" and we stop advancing.
  const [activeIdx, setActiveIdx] = React.useState(0);

  React.useEffect(() => {
    if (!isRunning) return;
    setActiveIdx(0);
    const interval = setInterval(() => {
      setActiveIdx((i) => (i < ANALYSIS_TRACE_STEPS.length - 1 ? i + 1 : i));
    }, 700);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Once the run completes successfully, hold every step as "done". We treat
  // "completion" as: not running, no error, and a plan is available.
  const allDone = !isRunning && !error && !!plan;

  // Map known engine names from the plan back to step source overrides so the
  // small technical chip matches what actually ran (defends against codebase
  // renames diverging from the static labels above).
  const engineOverrides = React.useMemo(() => {
    if (!plan) return {} as Record<number, string>;
    const out: Record<number, string> = {};
    if (plan.enginesUsed?.candidateGenerator) {
      out[3] = plan.enginesUsed.candidateGenerator;
    }
    if (plan.enginesUsed?.monteCarlo) {
      out[5] = plan.enginesUsed.monteCarlo;
    }
    return out;
  }, [plan]);

  return (
    <div
      data-testid="dl-goal-lab-progress"
      role="status"
      aria-live="polite"
      className="rounded-xl border border-violet-300/70 bg-violet-50 p-4 dark:border-violet-400/60 dark:bg-violet-950/60"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {allDone ? (
            <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          ) : error ? (
            <X className="h-4 w-4 text-rose-700 dark:text-rose-300" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-violet-700 dark:text-violet-200" />
          )}
          <div className="text-sm font-semibold text-violet-900 dark:text-violet-50 truncate">
            {allDone
              ? "Analysis complete"
              : error
              ? "Analysis paused"
              : "Evaluating your FIRE path…"}
          </div>
          {(isLive || elapsedMs > 0) && (
            <span
              data-testid="dl-goal-lab-elapsed"
              className="ml-1 rounded-full border border-violet-400/50 bg-white/80 px-2 py-0.5 font-mono text-[11px] tabular-nums text-violet-900 dark:border-violet-400/40 dark:bg-violet-900/60 dark:text-violet-50"
            >
              {formatElapsed(elapsedMs)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-violet-400/60 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:bg-violet-900/70 dark:text-violet-100">
            Analysis trace
          </span>
          {!isRunning && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              data-testid="dl-goal-lab-trace-toggle"
              className="text-[11px] font-medium text-violet-800 underline-offset-2 hover:underline dark:text-violet-200"
            >
              {collapsed ? "View analysis details" : "Hide details"}
            </button>
          )}
          {!isRunning && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss analysis trace"
              className="rounded p-0.5 text-violet-700 hover:bg-violet-200/60 dark:text-violet-200 dark:hover:bg-violet-800/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {allDone && (
        <p
          data-testid="dl-goal-lab-complete"
          className="mt-2 text-sm text-emerald-800 dark:text-emerald-100"
        >
          Your recommended path is ready.
        </p>
      )}

      {allDone && plan?.metrics && (
        <TraceMetrics metrics={plan.metrics} totalElapsedMs={elapsedMs} />
      )}

      {collapsed ? null : <ol className="mt-3 space-y-2.5">
        {ANALYSIS_TRACE_STEPS.map((step, idx) => {
          let state: "done" | "active" | "waiting" | "failed";
          if (allDone) {
            state = "done";
          } else if (error && idx === activeIdx) {
            state = "failed";
          } else if (error && idx > activeIdx) {
            state = "waiting";
          } else {
            state = idx < activeIdx ? "done" : idx === activeIdx ? "active" : "waiting";
          }
          const source = engineOverrides[idx] ?? step.source;
          return (
            <li
              key={step.heading}
              data-testid={`dl-goal-lab-progress-step-${idx + 1}`}
              data-state={state}
              className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-1.5 transition-colors data-[state=active]:border-violet-300/70 data-[state=active]:bg-white/60 data-[state=failed]:border-rose-300/70 data-[state=failed]:bg-rose-50 data-[state=done]:opacity-95 dark:data-[state=active]:bg-violet-900/40 dark:data-[state=failed]:bg-rose-950/40"
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor:
                    state === "done"
                      ? "rgb(5 150 105)"
                      : state === "active"
                      ? "rgb(124 58 237)"
                      : state === "failed"
                      ? "rgb(190 18 60)"
                      : "rgba(100,116,139,0.55)",
                  background:
                    state === "done"
                      ? "rgb(16 185 129)"
                      : state === "failed"
                      ? "rgb(244 63 94)"
                      : "transparent",
                }}
              >
                {state === "done" ? (
                  <Check className="h-3 w-3 text-white" />
                ) : state === "failed" ? (
                  <X className="h-3 w-3 text-white" />
                ) : state === "active" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-violet-700 dark:text-violet-200" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div
                    className={
                      state === "waiting"
                        ? "text-sm text-slate-500 dark:text-slate-400"
                        : state === "failed"
                        ? "text-sm font-semibold text-rose-800 dark:text-rose-100"
                        : "text-sm font-semibold text-slate-900 dark:text-slate-50"
                    }
                  >
                    Step {idx + 1} — {step.heading}
                  </div>
                  <TraceStatusChip state={state} />
                </div>
                <div
                  className={
                    state === "waiting"
                      ? "mt-0.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500"
                      : "mt-0.5 text-[10px] font-mono uppercase tracking-wider text-violet-700 dark:text-violet-200"
                  }
                >
                  {step.sourceKind === "engine"
                    ? "Engine: "
                    : step.sourceKind === "output"
                    ? "Output: "
                    : "Source: "}
                  {source}
                </div>

                {state === "failed" ? (
                  <div className="mt-1.5 rounded-md border border-rose-300/70 bg-white px-2.5 py-1.5 text-xs text-rose-800 dark:border-rose-400/50 dark:bg-rose-950/60 dark:text-rose-100">
                    <div className="font-semibold">Could not complete this step.</div>
                    <div className="mt-0.5 leading-relaxed">
                      {humaniseTraceError(error, idx)}
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={
                        state === "waiting"
                          ? "mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                          : "mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                      }
                    >
                      {step.itemsHeading}
                    </div>
                    <ul
                      className={
                        state === "waiting"
                          ? "mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-500"
                          : "mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-700 dark:text-slate-200"
                      }
                    >
                      {step.items.map((it, i) => (
                        <li
                          key={i}
                          className={
                            state === "waiting"
                              ? "rounded-full border border-slate-300/60 bg-white/40 px-2 py-0.5 dark:border-slate-600/60 dark:bg-slate-900/40"
                              : "rounded-full border border-slate-300/80 bg-white px-2 py-0.5 dark:border-slate-600 dark:bg-slate-900"
                          }
                        >
                          {it}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function TraceMetrics({
  metrics,
  totalElapsedMs,
}: {
  metrics: NonNullable<GoalLabPlanOutputForUI["metrics"]>;
  totalElapsedMs: number;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Total runtime",            value: `${(metrics.totalMs / 1000).toFixed(2)} s` },
    { label: "UI elapsed",               value: `${(totalElapsedMs / 1000).toFixed(2)} s` },
    { label: "Candidate generation",     value: `${(metrics.candidateGenerationMs / 1000).toFixed(2)} s` },
    { label: "Scenario + Monte Carlo",   value: `${(metrics.scenarioAndMonteCarloMs / 1000).toFixed(2)} s` },
    { label: "Ranking",                  value: `${metrics.rankingMs.toFixed(0)} ms` },
    { label: "Templates evaluated",      value: `${metrics.templatesCount}` },
  ];
  return (
    <dl
      data-testid="dl-goal-lab-metrics"
      className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-violet-300/60 bg-white/70 px-3 py-2 text-xs sm:grid-cols-3 dark:border-violet-400/40 dark:bg-violet-950/40"
    >
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            {r.label}
          </dt>
          <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Local alias for the inferred plan shape (used by TraceMetrics).
type GoalLabPlanOutputForUI = NonNullable<ReturnType<typeof useGoalLabPlan>["plan"]>;

function TraceStatusChip({
  state,
}: {
  state: "done" | "active" | "waiting" | "failed";
}) {
  const map: Record<typeof state, { label: string; cls: string }> = {
    done:    { label: "Done",         cls: "border-emerald-500/60 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-950/70 dark:text-emerald-100" },
    active:  { label: "In progress",  cls: "border-violet-500/60 bg-violet-100 text-violet-800 dark:border-violet-400/50 dark:bg-violet-950/70 dark:text-violet-100" },
    waiting: { label: "Waiting",      cls: "border-slate-400/50 bg-slate-100 text-slate-600 dark:border-slate-500/50 dark:bg-slate-900 dark:text-slate-300" },
    failed:  { label: "Failed",       cls: "border-rose-500/60 bg-rose-100 text-rose-800 dark:border-rose-400/50 dark:bg-rose-950/70 dark:text-rose-100" },
  };
  const { label, cls } = map[state];
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

/**
 * Convert the engine's raw error string into a calm, plain-English
 * explanation tied to the step that was active when it happened. We never
 * silently continue — instead we explain which inputs are likely missing.
 */
function humaniseTraceError(error: string | null, stepIdx: number): string {
  const raw = (error ?? "").toLowerCase();
  if (raw.includes("goal")) {
    return "Your FIRE goal profile looks incomplete. Open Goal Lab and confirm the goal cards, then re-run.";
  }
  if (raw.includes("ledger") || raw.includes("profile")) {
    return "We could not read the canonical ledger / goal profile cleanly. Confirm your dashboard inputs, then re-run.";
  }
  if (raw.includes("scenario") || raw.includes("template")) {
    return "No strategy candidates were eligible for your profile. Adjust your goal or risk settings in Goal Lab and re-run.";
  }
  // Step-anchored fallback so the failure message is always informative even
  // when the engine error is opaque.
  const stepHints: Record<number, string> = {
    0: "Some financial profile inputs are missing or unreadable.",
    1: "Some Goal Lab inputs (FIRE target, risk, preference) are missing.",
    2: "Assumptions could not be loaded for this run.",
    3: "No strategy candidates were eligible for your profile.",
    4: "The scenario engine could not project the candidate paths.",
    5: "The probability layer did not return a result for any path.",
    6: "Ranking could not be completed with the available signals.",
    7: "The recommendation could not be assembled.",
  };
  return error ? `${stepHints[stepIdx] ?? ""} (${error})`.trim() : (stepHints[stepIdx] ?? "Data is missing for this step.");
}


// ────────────────────────────────────────────────────────────────────────────
// Sprint 28 — pure comparison surface (no winner highlighting, no probability)
// ────────────────────────────────────────────────────────────────────────────

/**
 * One row per ranked strategy. Each row shows:
 *   - name
 *   - MC P50 FIRE age (from selectMonteCarloProjection on this candidate's fan)
 *   - MC P50 net worth at FIRE
 *   - overall risk band (from analyzeRoadmapRisk)
 *
 * No probability column. No "Recommended" / "Winner" highlighting. The
 * recommendation handoff lives on /action-roadmap.
 *
 * Honesty: every cell renders the literal phrase "Not modelled yet" when
 * the engine produced no value for it.
 */
function CompareStrategiesTable({ plan }: { plan: GoalLabPlanOutput }) {
  const fireNumber: number | null = (() => {
    const { targetPassiveAnnual, swrPct } = plan.profile.fire;
    if (targetPassiveAnnual == null || swrPct == null || swrPct <= 0) return null;
    return targetPassiveAnnual / (swrPct / 100);
  })();
  const startAge = plan.profile.fire.currentAge;
  const swrPct = plan.profile.fire.swrPct;
  const simulationCount = plan.metrics.simulationCount ?? 0;

  const rows = plan.rankedScenarios
    .filter((s) => s.winner != null)
    .map((s) => {
      const fan: FanPoint[] = (s.winner!.result?.netWorthFan as FanPoint[] | undefined) ?? [];
      const mc = selectMonteCarloProjection({
        fan,
        startAge,
        fireTarget: fireNumber,
        swrPct,
        simulationCount,
      });
      const risk = analyzeRoadmapRisk(s);
      return { scenario: s, mc, risk };
    });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="dl-compare-empty">
        No strategies have been modelled yet.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="dl-compare-strategies">
      <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="col-span-5 sm:col-span-4">Strategy</div>
        <div className="col-span-3 sm:col-span-3">FIRE age (P50)</div>
        <div className="col-span-2 sm:col-span-3">Net worth at FIRE (P50)</div>
        <div className="col-span-2 sm:col-span-2">Risk</div>
      </div>
      {rows.map(({ scenario, mc, risk }) => (
        <div
          key={scenario.templateId}
          data-testid={`dl-compare-row-${scenario.templateId}`}
          className="grid grid-cols-12 gap-2 rounded-lg border border-border/60 bg-background/60 px-2 py-2 text-sm"
        >
          <div className="col-span-5 sm:col-span-4">
            <div className="font-medium text-foreground">{scenario.templateLabel}</div>
            <div className="text-[11px] text-muted-foreground">{scenario.promise}</div>
          </div>
          <div className="col-span-3 sm:col-span-3 self-center text-foreground">
            {mc.fireAge.p50 != null
              ? mc.fireAge.p50
              : <span className="text-muted-foreground">Not modelled yet</span>}
          </div>
          <div className="col-span-2 sm:col-span-3 self-center text-foreground">
            {mc.netWorthAtFire.p50 != null
              ? formatCurrency(mc.netWorthAtFire.p50)
              : <span className="text-muted-foreground">Not modelled yet</span>}
          </div>
          <div className="col-span-2 sm:col-span-2 self-center">
            <span className="inline-flex items-center gap-1 text-xs text-foreground">
              <ShieldCheck className="h-3 w-3 text-muted-foreground" aria-hidden />
              {risk.overall === "unknown" ? "—" : risk.overall}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
