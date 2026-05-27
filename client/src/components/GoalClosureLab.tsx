/**
 * GoalClosureLab.tsx — Sprint 6 Phase 4 presentational shell.
 *
 * Renders the Goal Closure Lab — the family wealth lab's primary decision-
 * making workspace. Consumes only the orchestration output of
 * `goalClosureLab.ts` and never derives a financial value of its own.
 *
 * Sections:
 *   1. Goal Status
 *   2. Gap Analysis
 *   3. Path Comparison (seven required paths)
 *   4. Best Path
 *   5. Action Plan
 *   6. Audit Trail (expandable per entry)
 *   7. Strategic Ideas (literal "Not engine-modelled" labels, no numbers)
 *
 * Stable `data-testid` attributes are exported on every major surface so the
 * Sprint 6 Phase 4 test suite can assert structure without re-running engine
 * math.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  buildGoalClosureLab,
  formatClosureMetric,
  type GoalClosureLabInputs,
  type ClosureMetric,
  type ClosurePathRow,
  type AuditEntry,
  type ClosureAction,
} from "@/lib/goalClosureLab";
import type { GoalSolverInputs } from "@/lib/goalSolver";
import type { RiskRadarResult } from "@/lib/riskEngine";
import type { MonteCarloResult } from "@/lib/forecastStore";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { AdvancedDisclosure } from "@/components/ui/AdvancedDisclosure";
import { GclSixOutputGrid } from "@/components/goal-closure/GclSixOutputGrid";

export interface GoalClosureLabProps {
  canonicalLedger: DashboardInputs | null | undefined;
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
  className?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ON_TRACK":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "STRETCH":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "UNREALISTIC":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "IMPOSSIBLE":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

interface MetricBlockProps {
  metric: ClosureMetric;
  testidPrefix: string;
  compact?: boolean;
}

function MetricBlock({ metric, testidPrefix, compact }: MetricBlockProps) {
  const { auditMode } = useAuditMode();
  const text = formatClosureMetric(metric);
  return (
    <div
      className={`flex flex-col gap-0.5${metric.incomplete ? " opacity-70" : ""}`}
      data-testid={`${testidPrefix}-cell`}
    >
      <span
        className={`text-[10px] uppercase tracking-wider text-muted-foreground${compact ? "" : " mb-0.5"}`}
        data-testid={`${testidPrefix}-label`}
      >
        {metric.label}
      </span>
      <span
        className="text-sm font-semibold text-foreground tabular-nums"
        data-testid={`${testidPrefix}-value`}
        {...(auditMode ? { title: metric.source } : {})}
      >
        {text}
      </span>
      {metric.incomplete ? (
        <span
          className="text-[10px] text-amber-500 italic"
          data-testid={`${testidPrefix}-incomplete`}
        >
          incomplete data
        </span>
      ) : null}
    </div>
  );
}

/* ─── Sections ─────────────────────────────────────────────────────────── */

function GoalStatusCard({ section }: { section: ReturnType<typeof buildGoalClosureLab>["goalStatus"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-goal-status"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-goal-status-title">
            Goal Status
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Where the family wealth plan stands against its FIRE target.
          </p>
        </div>
        <span
          className={`text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full border ${statusBadgeClass(section.status)}`}
          data-testid="closure-lab-goal-status-badge"
          data-status={section.status}
        >
          {section.statusLabel}
        </span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricBlock metric={section.target}             testidPrefix="closure-lab-goal-target" />
        <MetricBlock metric={section.currentProjection}  testidPrefix="closure-lab-goal-projection" />
        <MetricBlock metric={section.gap}                testidPrefix="closure-lab-goal-gap" />
        <MetricBlock metric={section.yearsAheadBehind}   testidPrefix="closure-lab-goal-years" />
        <MetricBlock metric={section.confidence}         testidPrefix="closure-lab-goal-confidence" />
      </div>
      <p
        className="text-xs text-muted-foreground mt-3 leading-relaxed"
        data-testid="closure-lab-goal-summary"
      >
        {section.summary}
      </p>
    </section>
  );
}

function GapAnalysisCard({ section }: { section: ReturnType<typeof buildGoalClosureLab>["gapAnalysis"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-gap-analysis"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-gap-analysis-title">
          Gap Analysis
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          The specific gaps the plan needs to close, and the constraints that bind.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricBlock metric={section.passiveIncomeGap}        testidPrefix="closure-lab-gap-passive-income" />
        <MetricBlock metric={section.netWorthGap}             testidPrefix="closure-lab-gap-net-worth" />
        <MetricBlock metric={section.assetBaseGap}            testidPrefix="closure-lab-gap-asset-base" />
        <MetricBlock metric={section.monthlyContributionGap}  testidPrefix="closure-lab-gap-monthly-contribution" />
        <MetricBlock metric={section.liquidityConstraint}     testidPrefix="closure-lab-gap-liquidity" />
        <MetricBlock metric={section.debtConstraint}          testidPrefix="closure-lab-gap-debt" />
        <MetricBlock metric={section.riskConstraint}          testidPrefix="closure-lab-gap-risk" />
      </div>
      <div
        className="text-xs text-foreground mt-3 leading-relaxed bg-muted/30 border border-border rounded-md px-3 py-2"
        data-testid="closure-lab-gap-binding"
      >
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Binding Constraint</span>
        <div className="mt-0.5">{section.bindingConstraint}</div>
      </div>
    </section>
  );
}

function PathRowCard({ row }: { row: ClosurePathRow }) {
  const tid = `closure-lab-path-${row.id}`;
  return (
    <article
      className={`rounded-lg bg-card p-4 shadow-sm ring-1 ${row.isRecommended ? "ring-emerald-500/50" : "ring-border"}`}
      data-testid={tid}
      data-path-id={row.id}
      data-recommended={row.isRecommended ? "true" : "false"}
    >
      <header className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-foreground" data-testid={`${tid}-label`}>
            {row.definition.label}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5" data-testid={`${tid}-description`}>
            {row.definition.description}
          </div>
        </div>
        {row.isRecommended ? (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 whitespace-nowrap"
            data-testid={`${tid}-recommended-badge`}
          >
            BEST PATH
          </span>
        ) : null}
      </header>
      {row.incomplete && !row.candidate ? (
        <div
          className="text-xs italic text-amber-500"
          data-testid={`${tid}-not-modelled`}
        >
          Not yet engine-modelled — supporting candidate unavailable.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <MetricBlock metric={row.metrics.fireAge}             testidPrefix={`${tid}-fire-age`} compact />
        <MetricBlock metric={row.metrics.netWorth}            testidPrefix={`${tid}-net-worth`} compact />
        <MetricBlock metric={row.metrics.passiveIncome}       testidPrefix={`${tid}-passive-income`} compact />
        <MetricBlock metric={row.metrics.monthlySurplus}      testidPrefix={`${tid}-monthly-surplus`} compact />
        <MetricBlock metric={row.metrics.liquidityImpact}     testidPrefix={`${tid}-liquidity`} compact />
        <MetricBlock metric={row.metrics.riskScore}           testidPrefix={`${tid}-risk-score`} compact />
        <MetricBlock metric={row.metrics.monteCarloProbability} testidPrefix={`${tid}-mc-probability`} compact />
        <MetricBlock metric={row.metrics.confidence}          testidPrefix={`${tid}-confidence`} compact />
      </div>
    </article>
  );
}

function PathComparisonSection({ rows }: { rows: ClosurePathRow[] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-path-comparison"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-path-comparison-title">
          Path Comparison
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Seven candidate paths, each sourced from existing engine outputs. Values not yet modelled are flagged.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(row => (
          <PathRowCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function BestPathCard({ section }: { section: ReturnType<typeof buildGoalClosureLab>["bestPath"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-best-path"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-best-path-title">
            Best Path
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Engine's recommended path and the reasoning behind it.
          </p>
        </div>
        <span
          className="text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
          data-testid="closure-lab-best-path-label"
        >
          {section.recommendedLabel}
        </span>
      </header>
      <p
        className="text-sm text-foreground leading-relaxed"
        data-testid="closure-lab-best-path-why"
      >
        {section.whyItWins}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        {section.expectedImpact.map((m, i) => (
          <MetricBlock
            key={m.label}
            metric={m}
            testidPrefix={`closure-lab-best-path-impact-${i}`}
            compact
          />
        ))}
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Risks</div>
        <ul className="space-y-1.5" data-testid="closure-lab-best-path-risks">
          {section.risks.map((r, i) => (
            <li
              key={i}
              className="text-xs text-foreground leading-relaxed flex items-start gap-2"
              data-testid={`closure-lab-best-path-risk-${i}`}
            >
              <span className="text-amber-500 mt-0.5">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <MetricBlock metric={section.confidence} testidPrefix="closure-lab-best-path-confidence" />
      </div>
    </section>
  );
}

function ActionGroup({ title, items, tid }: { title: string; items: ClosureAction[]; tid: string }) {
  const { auditMode } = useAuditMode();
  return (
    <div className="rounded-md bg-muted/20 border border-border p-3" data-testid={tid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs italic text-muted-foreground" data-testid={`${tid}-empty`}>
          No engine recommendations for this horizon yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map(a => (
            <li
              key={a.id}
              className="text-xs text-foreground leading-relaxed flex items-start gap-2"
              data-testid={`closure-lab-action-${a.id}`}
              data-horizon={a.horizon}
              {...(auditMode ? { title: a.source } : {})}
            >
              <span className="text-emerald-500 mt-0.5">•</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionPlanCard({ section }: { section: ReturnType<typeof buildGoalClosureLab>["actionPlan"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-action-plan"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-action-plan-title">
          Action Plan
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Engine recommendations translated into actions by horizon. No new financial values.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ActionGroup title="This month"      items={section.thisMonth}       tid="closure-lab-action-this-month" />
        <ActionGroup title="Next 3 months"   items={section.next3Months}     tid="closure-lab-action-next-3-months" />
        <ActionGroup title="Next 12 months"  items={section.next12Months}    tid="closure-lab-action-next-12-months" />
        <ActionGroup title="Major milestones" items={section.majorMilestones} tid="closure-lab-action-major-milestones" />
      </div>
    </section>
  );
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const tid = `closure-lab-audit-${entry.id}`;
  return (
    <div className="border border-border rounded-md bg-muted/10" data-testid={tid}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 hover:bg-muted/20 transition-colors"
        data-testid={`${tid}-toggle`}
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-foreground">{entry.label}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {open ? "Hide" : "How was this calculated?"}
        </span>
      </button>
      {open ? (
        <div className="px-3 pb-3 pt-1 text-xs text-foreground space-y-2" data-testid={`${tid}-body`}>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Engines used</span>
            <div className="mt-0.5" data-testid={`${tid}-engines`}>
              {entry.enginesUsed.join(", ")}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Inputs used</span>
            <div className="mt-0.5" data-testid={`${tid}-inputs`}>
              {entry.inputsUsed.join(", ")}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Assumptions</span>
            <div className="mt-0.5" data-testid={`${tid}-assumptions`}>
              {entry.assumptions.join(" · ")}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence source</span>
              <div className="mt-0.5" data-testid={`${tid}-confidence-source`}>
                {entry.confidenceSource}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk source</span>
              <div className="mt-0.5" data-testid={`${tid}-risk-source`}>
                {entry.riskSource}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Monte Carlo source</span>
              <div className="mt-0.5" data-testid={`${tid}-mc-source`}>
                {entry.monteCarloSource}
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">How was this calculated?</span>
            <div className="mt-0.5 leading-relaxed" data-testid={`${tid}-how`}>
              {entry.howCalculated}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AuditTrailCard({ section }: { section: ReturnType<typeof buildGoalClosureLab>["auditTrail"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-audit-trail"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-audit-trail-title">
          Audit Trail
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Engines, inputs, assumptions, and the source of every confidence / risk / Monte Carlo value used.
        </p>
      </header>
      <div className="space-y-2">
        {section.entries.map(e => (
          <AuditEntryRow key={e.id} entry={e} />
        ))}
      </div>
    </section>
  );
}

function StrategicIdeasCard({ section }: { section: ReturnType<typeof buildGoalClosureLab>["strategicIdeas"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="closure-lab-strategic-ideas"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="closure-lab-strategic-ideas-title">
          Strategic Ideas
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Options not yet engine-modelled. Numbers intentionally omitted.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {section.ideas.map(idea => (
          <article
            key={idea.id}
            className="rounded-md border border-dashed border-border p-3 bg-muted/10"
            data-testid={`closure-lab-strategic-idea-${idea.id}`}
            data-not-engine-modelled="true"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">{idea.title}</h3>
              <span
                className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted/40 border border-border px-1.5 py-0.5 rounded"
                data-testid={`closure-lab-strategic-idea-${idea.id}-label`}
              >
                Not engine-modelled
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{idea.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ─── Root ─────────────────────────────────────────────────────────────── */

export function GoalClosureLab(props: GoalClosureLabProps) {
  // Sprint 15 Phase 2: thread canonical goal so buildGoalClosureLab routes
  // through selectCanonicalFire wired with mc_fire_settings (not the SQLite
  // 20k snapshot default).
  const { data: goal } = useCanonicalGoal();
  const result = useMemo(() => {
    const inputs: GoalClosureLabInputs = {
      canonicalLedger: props.canonicalLedger,
      goalSolverInputs: props.goalSolverInputs,
      riskOutputs: props.riskOutputs ?? null,
      monteCarloOutputs: props.monteCarloOutputs ?? null,
      goal: goal ?? null,
    };
    return buildGoalClosureLab(inputs);
  }, [props.canonicalLedger, props.goalSolverInputs, props.riskOutputs, props.monteCarloOutputs, goal]);

  if (result.empty) {
    return (
      <div
        className={`rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground ${props.className ?? ""}`}
        data-testid="closure-lab-empty-state"
      >
        Goal Closure Lab is waiting for canonical ledger data. {result.emptyReason ?? ""}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-4 sm:gap-6 ${props.className ?? ""}`}
      data-testid="closure-lab-root"
    >
      {/* Sprint 12 — 6-output advisor grid (Progress %, Current Gap, Required Change,
          Fastest / Safest / Highest-Probability paths). Sits above the engine
          surfaces so users see the decision-shaped answer first. */}
      <GclSixOutputGrid
        goalStatus={{
          target: result.goalStatus.target,
          gap: result.goalStatus.gap,
          currentProjection: result.goalStatus.currentProjection,
        }}
        pathComparison={result.pathComparison}
        bestPath={{
          recommendedLabel: result.bestPath.recommendedLabel,
          whyItWins: result.bestPath.whyItWins,
        }}
      />

      <div id="path-comparison">
        <PathComparisonSection rows={result.pathComparison} />
      </div>

      {/* Sprint 12 — demote narrative-heavy sections into AdvancedDisclosure so
          the 6-output grid + path comparison stay above the fold as the primary
          decision-shaped view. Nothing is deleted; engineering and power-users
          still reach the rationale and audit trail in one click. */}
      <AdvancedDisclosure
        title="Goal Closure rationale"
        subtitle="Goal status, gap analysis, best-path narrative, action plan, audit trail, strategic ideas"
        data-testid="closure-lab-rationale-disclosure"
      >
        <div className="flex flex-col gap-4 sm:gap-6">
          <GoalStatusCard       section={result.goalStatus} />
          <GapAnalysisCard      section={result.gapAnalysis} />
          <BestPathCard         section={result.bestPath} />
          <ActionPlanCard       section={result.actionPlan} />
          <AuditTrailCard       section={result.auditTrail} />
          <StrategicIdeasCard   section={result.strategicIdeas} />
        </div>
      </AdvancedDisclosure>
    </div>
  );
}

export default GoalClosureLab;
