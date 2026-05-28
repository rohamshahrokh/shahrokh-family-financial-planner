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
import { ArrowRight, Scale, Target, PieChart, Sparkles, Loader2 } from "lucide-react";
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
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {plan ? "Re-run plan" : "Run plan"}
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
        <ul className="space-y-2">
          <GoalLabPick label="Recommended next move" tone="violet"  pick={picks.recommended} testId="recommended" />
          <GoalLabPick label="Safest path"           tone="emerald" pick={picks.safest}      testId="safest" />
          <GoalLabPick label="Fastest path"          tone="amber"   pick={picks.fastest}     testId="fastest" />
          <GoalLabPick label="Highest probability"   tone="blue"    pick={picks.highestProbability} testId="highest-prob" />
          <GoalLabPick label="Best cashflow"         tone="teal"    pick={picks.bestCashflow} testId="best-cashflow" />
          <GoalLabPick label="Best hybrid"           tone="rose"    pick={picks.bestHybrid}   testId="best-hybrid" />
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Single named pick row. Renders “Not modelled yet” when probabilityP50 is
 * null — NEVER 0%. Mirrors the brief’s probability-honesty rule.
 */
function GoalLabPick({
  label, tone, pick, testId,
}: {
  label: string;
  tone: "violet" | "emerald" | "amber" | "blue" | "teal" | "rose";
  pick: GoalLabRankedScenario | null;
  testId: string;
}) {
  const toneClass = TONE_DOT[tone];
  if (!pick) {
    return (
      <li
        data-testid={`dl-goal-lab-pick-${testId}`}
        className="flex items-baseline gap-2 text-sm"
      >
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${toneClass}`} aria-hidden />
        <span className="font-medium text-foreground">{label}:</span>
        <span className="text-muted-foreground">No matching path for this profile</span>
      </li>
    );
  }
  return (
    <li
      data-testid={`dl-goal-lab-pick-${testId}`}
      className="flex items-baseline gap-2 text-sm"
    >
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${toneClass}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div>
          <span className="font-medium text-foreground">{label}: </span>
          <span className="text-foreground">{pick.templateLabel}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {pick.promise}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {pick.probabilityP50 != null
            ? <>Survivability {(pick.probabilityP50 * 100).toFixed(0)}% · score {pick.scoreP50?.toFixed(0)}</>
            : <span data-testid={`dl-goal-lab-pick-${testId}-prob-null`}>Probability not modelled yet</span>}
        </div>
      </div>
    </li>
  );
}

const TONE_DOT: Record<"violet" | "emerald" | "amber" | "blue" | "teal" | "rose", string> = {
  violet:  "bg-violet-400",
  emerald: "bg-emerald-400",
  amber:   "bg-amber-400",
  blue:    "bg-blue-400",
  teal:    "bg-teal-400",
  rose:    "bg-rose-400",
};
