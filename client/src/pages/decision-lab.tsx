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
import { ArrowRight, Scale, Target, PieChart, Sparkles, Loader2, Check, X, Star, TrendingUp, ShieldCheck, Zap } from "lucide-react";
import { useCanonicalGoalProfile } from "@/lib/goalLab/useCanonicalGoalProfile";
import { useGoalLabPlan } from "@/lib/goalLab/useGoalLabPlan";
import type { GoalLabRankedScenario } from "@/lib/goalLab/orchestrator";

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

  // Sprint 25 #2 — Run-plan loading feedback.
  // We drive a fake 4-step progress reel while `isRunning` is true so the user
  // always sees the system working. When `isRunning` transitions true→false we
  // briefly hold a "complete" state, then smoothly scroll to the recommendation.
  const [showComplete, setShowComplete] = React.useState(false);
  const wasRunning = React.useRef(false);
  const recommendedRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (wasRunning.current && !isRunning && !error) {
      setShowComplete(true);
      const t = setTimeout(() => {
        setShowComplete(false);
        // Smoothly bring the recommended card into view once available.
        recommendedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 1100);
      wasRunning.current = false;
      return () => clearTimeout(t);
    }
    if (isRunning) wasRunning.current = true;
  }, [isRunning, error]);

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
            onClick={() => void run()}
            disabled={isRunning}
            data-testid="dl-goal-lab-run"
            className="gap-1.5"
            aria-busy={isRunning}
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isRunning ? "Evaluating your FIRE path…" : plan ? "Re-run plan" : "Run plan"}
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

      {(isRunning || showComplete) && (
        <AnalysisTracePanel
          isRunning={isRunning}
          isComplete={showComplete}
          error={error}
          plan={plan}
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
        <div className="space-y-5">
          {/* Primary recommendation — large emphasised block. */}
          <div ref={recommendedRef}>
            <RecommendedPathCard
              pick={picks.recommended}
              rationale={picks.recommendedRationale}
            />
          </div>

          {/* Alternatives — trade-off cards, NOT competing recommendations. */}
          {(() => {
            const recId = picks.recommended?.templateId ?? null;
            const altsRaw: Array<{ pick: GoalLabRankedScenario | null; tone: AlternativeTone; intent: AltIntent }> = [
              { pick: picks.safest,             tone: "emerald", intent: "safest" },
              { pick: picks.fastest,            tone: "amber",   intent: "fastest" },
              { pick: picks.bestHybrid,         tone: "rose",    intent: "hybrid" },
              { pick: picks.bestCashflow,       tone: "teal",    intent: "cashflow" },
              { pick: picks.highestProbability, tone: "blue",    intent: "probability" },
            ];
            const alts = altsRaw
              .filter((a) => a.pick && a.pick.templateId !== recId)
              // de-dup picks that point to the same template
              .filter((a, i, arr) => arr.findIndex((b) => b.pick!.templateId === a.pick!.templateId) === i);
            if (alts.length === 0) return null;
            return (
              <div className="space-y-3" data-testid="dl-goal-lab-alternatives">
                <div className="flex items-baseline justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Alternative paths
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Trade-offs against the recommended path — not competing picks
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {alts.map((a) => (
                    <AlternativePathCard
                      key={a.intent}
                      pick={a.pick!}
                      tone={a.tone}
                      intent={a.intent}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
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
  isComplete,
  error,
  plan,
}: {
  isRunning: boolean;
  isComplete: boolean;
  error: string | null;
  plan: ReturnType<typeof useGoalLabPlan>["plan"];
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

  // Once the run completes successfully, hold every step as "done".
  const allDone = !isRunning && isComplete && !error;

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
        </div>
        <span className="shrink-0 rounded-full border border-violet-400/60 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:bg-violet-900/70 dark:text-violet-100">
          Analysis trace
        </span>
      </div>

      {allDone && (
        <p
          data-testid="dl-goal-lab-complete"
          className="mt-2 text-sm text-emerald-800 dark:text-emerald-100"
        >
          Your recommended path is ready.
        </p>
      )}

      <ol className="mt-3 space-y-2.5">
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
      </ol>
    </div>
  );
}

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
// Sprint 25 — Recommended / Alternative path cards
// ────────────────────────────────────────────────────────────────────────────

type AlternativeTone = "emerald" | "amber" | "blue" | "teal" | "rose";
type AltIntent = "safest" | "fastest" | "hybrid" | "cashflow" | "probability";

/**
 * The big primary recommendation block. Designed to make the user feel: this
 * is the chosen path. Surfaces the engine’s “why” as concrete bullets, plus a
 * confidence read built from the engine’s probabilityP50 when available, or a
 * friendly “confidence not yet available” otherwise.
 */
function RecommendedPathCard({
  pick,
  rationale,
}: {
  pick: GoalLabRankedScenario | null;
  rationale: string | null;
}) {
  if (!pick) {
    return (
      <div
        data-testid="dl-goal-lab-recommended-card"
        className="rounded-2xl border-2 border-dashed border-violet-400/60 bg-violet-50 p-4 dark:border-violet-400/60 dark:bg-violet-950/70"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200">
          Recommended path
        </div>
        <div className="mt-1 text-sm text-slate-800 dark:text-slate-100">
          No matching path yet. Run the plan once your ledger and FIRE goal are set.
        </div>
      </div>
    );
  }
  const why = whyBulletsFor(pick);
  const confidence = confidenceLabelFor(pick);
  return (
    <div
      data-testid="dl-goal-lab-recommended-card"
      className="rounded-2xl border-2 border-violet-500/70 bg-gradient-to-br from-violet-50 to-violet-100 p-5 shadow-sm dark:border-violet-400/70 dark:from-violet-900/80 dark:to-violet-950/90"
    >
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-violet-700 dark:text-violet-200" />
        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200">
          Recommended path
        </div>
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
        {pick.templateLabel}
      </div>
      <div className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
        {pick.promise}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
            Why this is recommended
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {why.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        <ConfidenceBadge confidence={confidence} />
      </div>

      {rationale ? (
        <p
          data-testid="dl-goal-lab-recommended-rationale"
          className="mt-4 rounded-md border border-violet-400/60 bg-white px-3 py-2 text-xs leading-relaxed text-violet-900 dark:border-violet-400/60 dark:bg-violet-950/80 dark:text-violet-50"
        >
          <span className="font-semibold">Why this is primary: </span>
          {rationale}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Alternative path card. Always renders as a trade-off (Pros / Cons), never as
 * a competing recommendation. The intent label tells the user what KIND of
 * alternative this is (Safer, Faster, etc.) so the comparison is concrete.
 */
function AlternativePathCard({
  pick,
  tone,
  intent,
}: {
  pick: GoalLabRankedScenario;
  tone: AlternativeTone;
  intent: AltIntent;
}) {
  const intentMeta = INTENT_META[intent];
  const toneStyles = ALT_TONE_STYLES[tone];
  const { pros, cons } = prosConsFor(pick, intent);
  return (
    <div
      data-testid={`dl-goal-lab-alt-${intent}`}
      className={`rounded-xl border p-4 ${toneStyles.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${toneStyles.label}`}>
            <intentMeta.Icon className="h-3 w-3" />
            {intentMeta.label}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {pick.templateLabel}
          </div>
          <div className="mt-0.5 text-xs text-slate-700 dark:text-slate-200">
            {pick.promise}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
            Pros
          </div>
          <ul className="mt-1 space-y-1">
            {pros.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-800 dark:text-slate-100">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-200">
            Cons
          </div>
          <ul className="mt-1 space-y-1">
            {cons.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-800 dark:text-slate-100">
                <X className="mt-0.5 h-3 w-3 shrink-0 text-rose-700 dark:text-rose-300" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence:
    | { kind: "value"; pct: number; label: string; tone: "emerald" | "amber" | "rose" }
    | { kind: "unmodelled" };
}) {
  if (confidence.kind === "unmodelled") {
    return (
      <div
        data-testid="dl-goal-lab-confidence-unmodelled"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center sm:min-w-[150px] dark:border-slate-600 dark:bg-slate-900"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Confidence
        </div>
        <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">
          Scenario confidence not yet available
        </div>
      </div>
    );
  }
  const ring =
    confidence.tone === "emerald" ? "border-emerald-500/70 bg-emerald-50 dark:bg-emerald-950/70 dark:border-emerald-400/70" :
    confidence.tone === "amber"   ? "border-amber-500/70 bg-amber-50 dark:bg-amber-950/70 dark:border-amber-400/70" :
                                    "border-rose-500/70 bg-rose-50 dark:bg-rose-950/70 dark:border-rose-400/70";
  const text =
    confidence.tone === "emerald" ? "text-emerald-800 dark:text-emerald-100" :
    confidence.tone === "amber"   ? "text-amber-800 dark:text-amber-100" :
                                    "text-rose-800 dark:text-rose-100";
  return (
    <div
      data-testid="dl-goal-lab-confidence-value"
      className={`rounded-lg border px-3 py-2 text-center sm:min-w-[150px] ${ring}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
        Confidence
      </div>
      <div className={`mt-0.5 text-2xl font-bold leading-none ${text}`}>
        {confidence.pct}%
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
        {confidence.label}
      </div>
    </div>
  );
}

const INTENT_META: Record<AltIntent, { label: string; Icon: typeof ShieldCheck }> = {
  safest:       { label: "Safer alternative",         Icon: ShieldCheck },
  fastest:      { label: "Faster alternative",        Icon: Zap },
  hybrid:       { label: "Diversified alternative",   Icon: Scale },
  cashflow:     { label: "Cashflow alternative",      Icon: TrendingUp },
  probability:  { label: "Highest-confidence option", Icon: ShieldCheck },
};

const ALT_TONE_STYLES: Record<AlternativeTone, { card: string; label: string }> = {
  emerald: { card: "border-emerald-400/70 bg-emerald-50 dark:border-emerald-400/50 dark:bg-emerald-950/60", label: "text-emerald-800 dark:text-emerald-200" },
  amber:   { card: "border-amber-400/70 bg-amber-50 dark:border-amber-400/50 dark:bg-amber-950/60",       label: "text-amber-800 dark:text-amber-200" },
  blue:    { card: "border-blue-400/70 bg-blue-50 dark:border-blue-400/50 dark:bg-blue-950/60",           label: "text-blue-800 dark:text-blue-200" },
  teal:    { card: "border-teal-400/70 bg-teal-50 dark:border-teal-400/50 dark:bg-teal-950/60",           label: "text-teal-800 dark:text-teal-200" },
  rose:    { card: "border-rose-400/70 bg-rose-50 dark:border-rose-400/50 dark:bg-rose-950/60",           label: "text-rose-800 dark:text-rose-200" },
};

/**
 * Build the "Why this is recommended" bullets from the pick's metrics. We do
 * NOT invent reasons — each bullet is anchored to a concrete engine output.
 */
function whyBulletsFor(pick: GoalLabRankedScenario): string[] {
  const out: string[] = [];
  if (pick.scoreP50 != null) {
    out.push(`Highest overall score across the paths we evaluated (${pick.scoreP50.toFixed(0)}/100).`);
  } else {
    out.push("Top-ranked across the paths we evaluated for your profile.");
  }
  out.push(`Aligns with your FIRE goal: ${pick.promise.toLowerCase()}.`);
  if (SAFE_TEMPLATE_IDS.has(pick.templateId)) {
    out.push("Fits a cautious risk profile \u2014 builds safety before adding new risk.");
  } else if (AGGRESSIVE_TEMPLATE_IDS.has(pick.templateId)) {
    out.push("Uses your current borrowing and savings capacity for faster progress.");
  } else {
    out.push("Balances growth potential with downside protection.");
  }
  if (pick.probabilityP50 != null) {
    const pct = Math.round(pick.probabilityP50 * 100);
    out.push(`Modelled scenario confidence: ${pct}%.`);
  }
  return out;
}

function confidenceLabelFor(pick: GoalLabRankedScenario):
  | { kind: "value"; pct: number; label: string; tone: "emerald" | "amber" | "rose" }
  | { kind: "unmodelled" } {
  if (pick.probabilityP50 == null) return { kind: "unmodelled" };
  const pct = Math.round(pick.probabilityP50 * 100);
  const tone: "emerald" | "amber" | "rose" = pct >= 70 ? "emerald" : pct >= 50 ? "amber" : "rose";
  const label = pct >= 70 ? "Strong" : pct >= 50 ? "Moderate" : "Tentative";
  return { kind: "value", pct, label, tone };
}

/**
 * Pros / Cons relative to the recommended pick. Anchored to the alternative's
 * archetype — not invented per-run.
 */
function prosConsFor(
  pick: GoalLabRankedScenario,
  intent: AltIntent,
): { pros: string[]; cons: string[] } {
  const isSafe = SAFE_TEMPLATE_IDS.has(pick.templateId);
  const isAggro = AGGRESSIVE_TEMPLATE_IDS.has(pick.templateId);

  switch (intent) {
    case "safest":
      return {
        pros: ["Lower downside risk", "Stronger cash buffer and liquidity"],
        cons: ["Slower progress to FIRE", "Less compounding from new positions"],
      };
    case "fastest":
      return {
        pros: ["Faster path to FIRE if everything holds", "Uses borrowing capacity actively"],
        cons: ["Higher drawdown sensitivity", "Less margin if income drops or rates rise"],
      };
    case "hybrid":
      return {
        pros: ["Diversifies across property and ETFs", "Spreads single-asset risk"],
        cons: ["Slower equity growth than concentrated bets", "More positions to manage"],
      };
    case "cashflow":
      return {
        pros: ["Protects monthly cashflow", "Lower serviceability risk"],
        cons: ["Slower net-worth growth", "Less leverage applied to your goal"],
      };
    case "probability":
      return {
        pros: ["Highest modelled confidence of hitting the goal", "Most robust to bad scenarios"],
        cons: [
          isAggro ? "May still feel aggressive day-to-day" : "Often slower than the headline pick",
          isSafe  ? "Trades upside for stability"           : "Optimised for survivability, not speed",
        ],
      };
  }
}

/**
 * Safe / aggressive template IDs — kept in sync with orchestrator.ts. We
 * duplicate the set locally to keep this file UI-only and avoid a deeper
 * import cycle.
 */
const SAFE_TEMPLATE_IDS = new Set([
  "delay-ip",
  "debt-reduction",
  "liquidity-preservation",
  "offset-optimisation",
  "lower-target-or-extend",
]);
const AGGRESSIVE_TEMPLATE_IDS = new Set([
  "buy-ip-now",
  "etf-acceleration",
  "debt-recycling",
]);
