/**
 * TruePortfolioOptimizer.tsx — Sprint 7 presentational shell.
 *
 * Renders the True Portfolio Optimizer above the Sprint 6 Phase 5
 * deep-dive sections. Consumes only the orchestration output of
 * `truePortfolioOptimizer.ts` and derives no financial values of its own.
 *
 * Top-level sections rendered by this component:
 *   1. Executive Summary (gap-to-goal + recommended path)
 *   2. Goal Reverse Engineering
 *   3. Constraints Panel
 *   4. Scenario Search Metrics
 *   5. Five Recommendations
 *   6. Goal Achievement Search (Gap Solver)
 *   7. Efficient Frontier
 *   8. Scenario Comparison Matrix (top entries — frontier + recs)
 *   9. Sprint 7 Audit Trail
 *  10. Sprint 6 Phase 5 PortfolioLab (the 14 deep-dive sections)
 */

import * as React from "react";
import { useMemo, useState } from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import type { GoalSolverInputs } from "@/lib/goalSolver";
import type { RiskRadarResult } from "@/lib/riskEngine";
import type { MonteCarloResult } from "@/lib/forecastStore";
import {
  buildTruePortfolioOptimizer,
  formatScenarioMetric,
  type OptimizerConstraints,
  type Recommendation,
  type FrontierPoint,
  type ScenarioMetric,
  type ScenarioRecord,
  type TrueOptimizerAuditEntry,
} from "@/lib/truePortfolioOptimizer";
import { PortfolioLab } from "@/components/PortfolioLab";
import { buildPortfolioLabOptimizer } from "@/lib/portfolioLabOptimizer";
import { buildProbabilisticWealthEngine } from "@/lib/probabilisticWealthEngine";
import { ProbabilisticWealthSection } from "@/components/ProbabilisticWealthSection";
import { buildPathSimulationEngine } from "@/lib/pathSimulationEngine";
import { PathSimulationSection } from "@/components/PathSimulationSection";
import { buildGoalSolverPro, EMPTY_GOAL_TARGETS } from "@/lib/goalSolverPro";
import { computeCanonicalFire } from "@/lib/canonicalFire";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { AdvancedDisclosure } from "@/components/ui/AdvancedDisclosure";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/finance";
import {
  selectFireGapSummary,
  selectTop3Actions,
  selectDoNothingComparison,
  selectFireCommandCenterData,
  selectTop3ActionsDetailed,
  selectRankedBlockersDetailed,
  selectDoNothingOutcome,
} from "@/lib/goalSolverView";
import { FireGapSummaryBlock } from "@/components/portfolio-lab/FireGapSummaryBlock";
import { Top3ActionsBlock } from "@/components/portfolio-lab/Top3ActionsBlock";
import { PortfolioLabCharts } from "@/components/portfolio-lab/PortfolioLabCharts";
import { DecisionFrame } from "@/components/ui/DecisionFrame";
import { FireCommandCenter } from "@/components/decision-system/FireCommandCenter";
import { Top3ActionsSection } from "@/components/decision-system/Top3ActionsSection";
import { BiggestBlockersSection } from "@/components/decision-system/BiggestBlockersSection";
import { DoNothingOutcomeSection } from "@/components/decision-system/DoNothingOutcomeSection";
import { RecommendedVsDoNothingChart } from "@/components/decision-system/RecommendedVsDoNothingChart";
import {
  selectCanonicalNetWorthBreakdown,
  NW_RECONCILIATION_FAILED_TEXT,
} from "@/lib/netWorthBreakdown";
import { NetWorthAuditPanel } from "@/components/portfolio-lab/NetWorthAuditPanel";
import {
  gateRecommendations,
  projectRecommendationForGate,
  RECOMMENDATION_UNAVAILABLE_TEXT,
} from "@/lib/recommendationGate";

export interface TruePortfolioOptimizerProps {
  canonicalLedger: DashboardInputs | null | undefined;
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
  className?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function chipClass(tone: "ok" | "watch" | "fragile" | "default" = "default"): string {
  switch (tone) {
    case "ok":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "watch":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "fragile":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

function ScenarioMetricBlock({
  metric,
  testidPrefix,
}: {
  metric: ScenarioMetric;
  testidPrefix: string;
}) {
  const { auditMode } = useAuditMode();
  const text = formatScenarioMetric(metric);
  const incomplete = metric.incomplete;
  return (
    <div
      className={`flex flex-col gap-0.5${incomplete ? " opacity-70" : ""}`}
      data-testid={`${testidPrefix}-cell`}
    >
      <span
        className="text-[10px] uppercase tracking-wider text-muted-foreground"
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
      {metric.notEngineModelled ? (
        <span
          className="text-[10px] text-amber-500 italic"
          data-testid={`${testidPrefix}-not-engine-modelled`}
        >
          Not engine-modelled
        </span>
      ) : null}
      {incomplete && !metric.notEngineModelled ? (
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

/* ─── Executive Summary ────────────────────────────────────────────────── */

function ExecutiveSummary({
  recommendations,
  goal,
  searchMetrics,
  gapSolver,
}: {
  recommendations: Recommendation[];
  goal: ReturnType<typeof buildTruePortfolioOptimizer>["goalReverseEngineering"];
  searchMetrics: ReturnType<typeof buildTruePortfolioOptimizer>["searchMetrics"];
  gapSolver: ReturnType<typeof buildTruePortfolioOptimizer>["gapSolver"];
}) {
  const featured = recommendations.find(r => r.category === "hybrid") ?? recommendations[0];

  return (
    <section
      className="rounded-lg border border-border bg-gradient-to-br from-card via-card to-muted/30 p-4 sm:p-6 shadow-sm"
      data-testid="true-optimizer-executive-summary"
    >
      <header className="mb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-foreground" data-testid="true-optimizer-executive-summary-title">
            Recommended Path
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            The fastest realistic path to your FIRE target — generated from {searchMetrics.generated.toLocaleString()} engine-backed scenarios.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${gapSolver.pathFound ? chipClass("ok") : chipClass("fragile")}`}
            data-testid="true-optimizer-path-status"
          >
            {gapSolver.pathFound ? "Path found" : "Search exhausted"}
          </span>
          {featured?.notEngineModelled ? (
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${chipClass("watch")}`}>
              Not engine-modelled
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="true-optimizer-executive-grid">
        <ScenarioMetricBlock metric={goal.targetFireDate}          testidPrefix="true-optimizer-exec-target-year" />
        <ScenarioMetricBlock metric={goal.requiredNetWorth}        testidPrefix="true-optimizer-exec-required-nw" />
        <ScenarioMetricBlock metric={goal.requiredPassiveIncome}   testidPrefix="true-optimizer-exec-required-pi" />
        <ScenarioMetricBlock metric={goal.requiredAssetBase}       testidPrefix="true-optimizer-exec-required-ab" />
        <ScenarioMetricBlock metric={goal.requiredMonthlyContribution} testidPrefix="true-optimizer-exec-required-mc" />
        {featured ? (
          <ScenarioMetricBlock metric={featured.metrics.fireYear} testidPrefix="true-optimizer-exec-fire-year" />
        ) : null}
      </div>

      {featured ? (
        <div
          className="mt-4 rounded-md border border-border bg-card/70 p-3"
          data-testid="true-optimizer-featured-recommendation"
        >
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
            <h3 className="text-sm font-semibold text-foreground" data-testid="true-optimizer-featured-label">
              {featured.label}
            </h3>
            <span className="text-[11px] text-muted-foreground" data-testid="true-optimizer-featured-source">
              Scenario {featured.scenarioId.slice(0, 24)}{featured.scenarioId.length > 24 ? "…" : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{featured.rationale}</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div data-testid="true-optimizer-featured-action-what">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">What</span>
              <p className="font-medium text-foreground">{featured.actionability.what}</p>
            </div>
            <div data-testid="true-optimizer-featured-action-when">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">When</span>
              <p className="font-medium text-foreground">{featured.actionability.when}</p>
            </div>
            <div data-testid="true-optimizer-featured-action-why">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Why</span>
              <p className="font-medium text-foreground">{featured.actionability.why}</p>
            </div>
            <div data-testid="true-optimizer-featured-action-do-nothing">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Do nothing</span>
              <p className="font-medium text-foreground">{featured.actionability.doNothing}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ─── Goal Reverse Engineering ─────────────────────────────────────────── */

function GoalReverseEngineeringCard({
  section,
}: {
  section: ReturnType<typeof buildTruePortfolioOptimizer>["goalReverseEngineering"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-goal-reverse-engineering"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-goal-reverse-engineering-title">
          Goal Reverse Engineering
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Working backwards from your FIRE date — every figure is a canonical engine pass-through.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <ScenarioMetricBlock metric={section.targetFireDate}             testidPrefix="true-optimizer-gre-target-year" />
        <ScenarioMetricBlock metric={section.requiredNetWorth}           testidPrefix="true-optimizer-gre-required-nw" />
        <ScenarioMetricBlock metric={section.requiredPassiveIncome}      testidPrefix="true-optimizer-gre-required-pi" />
        <ScenarioMetricBlock metric={section.requiredAssetBase}          testidPrefix="true-optimizer-gre-required-ab" />
        <ScenarioMetricBlock metric={section.requiredMonthlySurplus}     testidPrefix="true-optimizer-gre-required-ms" />
        <ScenarioMetricBlock metric={section.requiredMonthlyContribution} testidPrefix="true-optimizer-gre-required-mc" />
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed" data-testid="true-optimizer-goal-reverse-engineering-summary">
        {section.summary}
      </p>
    </section>
  );
}

/* ─── Constraints Panel ───────────────────────────────────────────────── */

function ConstraintsPanel({
  constraints,
  onChange,
}: {
  constraints: OptimizerConstraints;
  onChange: (c: OptimizerConstraints) => void;
}) {
  function update<K extends keyof OptimizerConstraints>(key: K, raw: string) {
    const v = raw.trim();
    if (v === "") {
      const next = { ...constraints };
      delete next[key];
      onChange(next);
      return;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    onChange({ ...constraints, [key]: n });
  }
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-constraints"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-constraints-title">
            Constraints
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bound the search. Empty fields are treated as unspecified — no household default is invented.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <Field label="Max Risk Score (0–100)" testid="constraint-max-risk-score" value={constraints.maxRiskScore} onInput={v => update("maxRiskScore", v)} />
        <Field label="Max Debt ($)" testid="constraint-max-debt" value={constraints.maxDebt} onInput={v => update("maxDebt", v)} />
        <Field label="Max Monthly Contribution ($/mo)" testid="constraint-max-monthly-contribution" value={constraints.maxMonthlyContribution} onInput={v => update("maxMonthlyContribution", v)} />
        <Field label="Max Investment Property Count" testid="constraint-max-property-count" value={constraints.maxPropertyCount} onInput={v => update("maxPropertyCount", v)} />
        <Field label="Min Liquidity (months)" testid="constraint-min-liquidity" value={constraints.minLiquidityMonths} onInput={v => update("minLiquidityMonths", v)} />
        <Field label="Target FIRE Year" testid="constraint-target-fire-year" value={constraints.targetFireYear} onInput={v => update("targetFireYear", v)} />
      </div>
    </section>
  );
}

function Field({
  label, value, onInput, testid,
}: {
  label: string;
  value: number | undefined;
  onInput: (v: string) => void;
  testid: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        value={value ?? ""}
        onChange={e => onInput(e.target.value)}
        data-testid={testid}
      />
    </label>
  );
}

/* ─── Search Metrics ──────────────────────────────────────────────────── */

function SearchMetricsCard({
  metrics,
}: {
  metrics: ReturnType<typeof buildTruePortfolioOptimizer>["searchMetrics"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-search-metrics"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-search-metrics-title">
          Scenario Search Engine
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generator capacity, scenarios evaluated, and per-constraint rejection counts.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
        <Cell label="Generated"  value={metrics.generated.toLocaleString()} testid="metrics-generated" />
        <Cell label="Valid"      value={metrics.valid.toLocaleString()}     testid="metrics-valid" />
        <Cell label="Evaluated"  value={metrics.evaluated.toLocaleString()} testid="metrics-evaluated" />
        <Cell label="Frontier"   value={metrics.frontierSize.toLocaleString()} testid="metrics-frontier" />
        <Cell label="Capacity"   value={metrics.capacity.toLocaleString()}  testid="metrics-capacity" />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        {Object.entries(metrics.failureCounts).map(([k, v]) => (
          <Cell key={k} label={`Reject · ${k.replace(/-/g, " ")}`} value={v.toLocaleString()} testid={`metrics-reject-${k}`} />
        ))}
      </div>
    </section>
  );
}

function Cell({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testid}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

/* ─── Recommendations Grid ────────────────────────────────────────────── */

function RecommendationsGrid({
  recommendations,
  blocked,
  reason,
}: {
  recommendations: Recommendation[];
  /** Sprint 13 P0-2 — when true, render the sentinel instead of the grid. */
  blocked?: boolean;
  /** Reason from the gate (rendered in audit mode for debugging). */
  reason?: string;
}) {
  // Sprint 13 P0-2 — recommendation gate: when ANY rec is incomplete, the
  // entire grid is replaced with the sentinel string. No ranking, no
  // winner, no partial render.
  if (blocked) {
    return (
      <section
        className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5 shadow-sm"
        data-testid="s13-recommendation-gate-blocked"
      >
        <header className="mb-2">
          <h2 className="text-base font-semibold text-foreground">Recommendations</h2>
        </header>
        <div className="text-sm text-rose-700 dark:text-rose-300" data-testid="s13-recommendation-gate-blocked-text">
          {RECOMMENDATION_UNAVAILABLE_TEXT}
        </div>
        {reason ? (
          <div className="mt-1 text-[11px] text-muted-foreground" data-testid="s13-recommendation-gate-blocked-reason">
            {reason}
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-recommendations"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-recommendations-title">
          Recommendations
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Best scenario picked from the engine-backed pool for each objective.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recommendations.map(rec => (
          <article
            key={rec.category}
            className={`rounded-md border border-border bg-background/50 p-3 ${rec.incomplete ? "opacity-80" : ""}`}
            data-testid={`true-optimizer-recommendation-${rec.category}`}
          >
            <header className="mb-2 flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground" data-testid={`recommendation-${rec.category}-label`}>
                {rec.label}
              </h3>
              {rec.notEngineModelled ? (
                <span className={`text-[10px] px-1.5 py-0.5 self-start rounded border ${chipClass("watch")}`} data-testid={`recommendation-${rec.category}-flag`}>
                  Not engine-modelled
                </span>
              ) : null}
              {rec.incomplete && !rec.notEngineModelled ? (
                <span className={`text-[10px] px-1.5 py-0.5 self-start rounded border ${chipClass("watch")}`} data-testid={`recommendation-${rec.category}-incomplete`}>
                  Incomplete
                </span>
              ) : null}
            </header>
            <div className="grid grid-cols-2 gap-2">
              <ScenarioMetricBlock metric={rec.metrics.fireYear}              testidPrefix={`recommendation-${rec.category}-fire-year`} />
              <ScenarioMetricBlock metric={rec.metrics.probabilitySuccess}    testidPrefix={`recommendation-${rec.category}-probability`} />
              <ScenarioMetricBlock metric={rec.metrics.projectedNetWorth}     testidPrefix={`recommendation-${rec.category}-net-worth`} />
              <ScenarioMetricBlock metric={rec.metrics.projectedPassiveIncome} testidPrefix={`recommendation-${rec.category}-passive-income`} />
              <ScenarioMetricBlock metric={rec.metrics.requiredMonthlyContribution} testidPrefix={`recommendation-${rec.category}-required-mc`} />
              <ScenarioMetricBlock metric={rec.metrics.requiredAssetBase}     testidPrefix={`recommendation-${rec.category}-required-ab`} />
              <ScenarioMetricBlock metric={rec.metrics.riskScore}             testidPrefix={`recommendation-${rec.category}-risk`} />
              <ScenarioMetricBlock metric={rec.metrics.confidenceScore}       testidPrefix={`recommendation-${rec.category}-confidence`} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground" data-testid={`recommendation-${rec.category}-actionability`}>
              <span><strong className="text-foreground">What:</strong> {rec.actionability.what}</span>
              <span><strong className="text-foreground">When:</strong> {rec.actionability.when}</span>
              <span><strong className="text-foreground">Why:</strong> {rec.actionability.why}</span>
              <span><strong className="text-foreground">Do nothing:</strong> {rec.actionability.doNothing}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ─── Gap Solver ──────────────────────────────────────────────────────── */

function GapSolverCard({
  gap,
}: {
  gap: ReturnType<typeof buildTruePortfolioOptimizer>["gapSolver"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-gap-solver"
    >
      <header className="mb-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-gap-solver-title">
            Goal Achievement Search
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            What is the minimum change required to achieve your target?
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${gap.pathFound ? chipClass("ok") : chipClass("fragile")}`} data-testid="true-optimizer-gap-solver-status">
            {gap.pathFound ? "Path found" : `Blocker: ${gap.blocker.replace(/-/g, " ")}`}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground tabular-nums" data-testid="true-optimizer-gap-solver-shortfall">
            {formatScenarioMetric(gap.shortfall)}
          </span>
        </div>
      </header>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed" data-testid="true-optimizer-gap-solver-summary">
        {gap.summary}
      </p>
      {gap.options.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3" data-testid="true-optimizer-gap-solver-options">
          {gap.options.map((rec, idx) => (
            <article
              key={rec.scenarioId || idx}
              className="rounded-md border border-border bg-background/50 p-3"
              data-testid={`true-optimizer-gap-option-${idx}`}
            >
              <h3 className="text-sm font-semibold text-foreground mb-1">Option {String.fromCharCode(65 + idx)} — {rec.label}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{rec.rationale}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ScenarioMetricBlock metric={rec.metrics.fireYear}           testidPrefix={`gap-option-${idx}-fire-year`} />
                <ScenarioMetricBlock metric={rec.metrics.probabilitySuccess} testidPrefix={`gap-option-${idx}-probability`} />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground" data-testid={`gap-option-${idx}-action`}>
                <strong className="text-foreground">Action:</strong> {rec.actionability.what} · {rec.actionability.when}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ─── Frontier ─────────────────────────────────────────────────────────── */

function FrontierCard({
  frontier,
}: {
  frontier: ReturnType<typeof buildTruePortfolioOptimizer>["frontier"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-frontier"
    >
      <header className="mb-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-frontier-title">
            Efficient Frontier
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pareto-optimal scenarios across FIRE speed, probability, risk, and projected net worth.
          </p>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground tabular-nums" data-testid="true-optimizer-frontier-pareto-count">
          {frontier.paretoCount} Pareto-optimal
        </span>
      </header>
      <div className="overflow-x-auto" data-testid="true-optimizer-frontier-table">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Objective</th>
              <th className="py-2 pr-3">Scenario</th>
              <th className="py-2 pr-3">FIRE Year</th>
              <th className="py-2 pr-3">P(Success)</th>
              <th className="py-2 pr-3">Risk</th>
              <th className="py-2 pr-3">Net Worth</th>
              <th className="py-2 pr-3">Pareto</th>
            </tr>
          </thead>
          <tbody>
            {frontier.points.map(pt => (
              <tr key={pt.objective} className="border-t border-border/60" data-testid={`frontier-row-${pt.objective}`}>
                <td className="py-2 pr-3 font-medium text-foreground">{pt.label}</td>
                <td className="py-2 pr-3 text-muted-foreground">{pt.scenarioId.slice(0, 36)}{pt.scenarioId.length > 36 ? "…" : ""}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(pt.metrics.fireYear)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(pt.metrics.probabilitySuccess)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(pt.metrics.riskScore)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(pt.metrics.projectedNetWorth)}</td>
                <td className="py-2 pr-3">
                  {pt.pareto ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${chipClass("ok")}`}>
                      Pareto
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── Scenario Comparison Matrix ───────────────────────────────────────── */

function ScenarioMatrixCard({
  scenarios,
  recommendations,
  frontier,
}: {
  scenarios: ScenarioRecord[];
  recommendations: Recommendation[];
  frontier: ReturnType<typeof buildTruePortfolioOptimizer>["frontier"];
}) {
  // Show union of frontier scenario ids + recommendation scenario ids.
  const ids = new Set<string>();
  for (const r of recommendations) if (r.scenarioId) ids.add(r.scenarioId);
  for (const p of frontier.points) if (p.scenarioId) ids.add(p.scenarioId);
  const subset = scenarios.filter(s => ids.has(s.id)).slice(0, 12);

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-matrix"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-matrix-title">
          Scenario Comparison Matrix
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Side-by-side view of the recommendation and frontier scenarios.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Scenario</th>
              <th className="py-2 pr-3">FIRE Year</th>
              <th className="py-2 pr-3">P(Success)</th>
              <th className="py-2 pr-3">Net Worth</th>
              <th className="py-2 pr-3">Passive Income</th>
              <th className="py-2 pr-3">Liquidity</th>
              <th className="py-2 pr-3">Risk</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {subset.map(s => (
              <tr key={s.id} className="border-t border-border/60" data-testid={`matrix-row-${s.id}`}>
                <td className="py-2 pr-3 font-medium text-foreground">{s.label}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.fireYear)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.probabilitySuccess)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.projectedNetWorth)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.projectedPassiveIncome)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.liquidityPosition)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.riskScore)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatScenarioMetric(s.metrics.confidenceScore)}</td>
                <td className="py-2 pr-3 text-[10px] text-muted-foreground">
                  {s.notEngineModelled ? "Not engine-modelled" : (s.valid ? "Valid" : `Failed: ${s.failureReason}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── Audit Trail ─────────────────────────────────────────────────────── */

function AuditTrailCard({
  audit,
}: {
  audit: ReturnType<typeof buildTruePortfolioOptimizer>["auditTrail"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="true-optimizer-audit-trail"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="true-optimizer-audit-trail-title">
          Audit Trail
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every section cites the engines, inputs, assumptions, and provenance behind its numbers.
        </p>
      </header>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {audit.entries.map(entry => (
          <AuditEntry key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function AuditEntry({ entry }: { entry: TrueOptimizerAuditEntry }) {
  return (
    <li
      className="rounded-md border border-border bg-background/50 p-3 text-xs"
      data-testid={`true-optimizer-audit-${entry.id}`}
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">{entry.label}</h3>
      <dl className="grid grid-cols-1 gap-1">
        <Detail label="Engines used" testid={`audit-${entry.id}-engines`} value={entry.enginesUsed.join(", ")} />
        <Detail label="Inputs used"  testid={`audit-${entry.id}-inputs`}  value={entry.inputsUsed.join(", ")} />
        <Detail label="Assumptions"  testid={`audit-${entry.id}-assumptions`} value={entry.assumptions.join(" • ")} />
        <Detail label="Confidence source" testid={`audit-${entry.id}-confidence`} value={entry.confidenceSource} />
        <Detail label="Risk source"  testid={`audit-${entry.id}-risk`}    value={entry.riskSource} />
        <Detail label="Monte Carlo source" testid={`audit-${entry.id}-mc`} value={entry.monteCarloSource} />
        <Detail label="How was this calculated?" testid={`audit-${entry.id}-how`} value={entry.howCalculated} />
      </dl>
    </li>
  );
}

function Detail({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2" data-testid={testid}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-muted-foreground leading-relaxed">{value}</dd>
    </div>
  );
}

/* ─── Sprint 11 Hero ─────────────────────────────────────────────────────
 *
 * 5-slot Hero (Sprint 11 #1, #2) — every slot is an existing canonical engine
 * output; no new calculations are performed here.
 *
 *   1. Where am I now?      — canonicalFire + canonicalLedger
 *   2. Am I on track?       — feasibility.status + probabilityOfFire
 *   3. What should I do next? — recommendation[0].actionability.what
 *   4. Why?                 — whyThisWins.narrative
 *   5. What if I do nothing? — baseline (current snapshot) vs recommended
 *                              path-sim p50 trajectory on a recharts line.
 */

interface HeroProps {
  canonicalLedger: DashboardInputs | null | undefined;
  recommendations: Recommendation[];
  feasibility: ReturnType<typeof buildGoalSolverPro>["feasibility"];
  whyWinsNarrative: string | null;
  whyWinsLabel: string | null;
  netWorthFan: ReturnType<typeof buildPathSimulationEngine>["bestStrategy"] extends infer S
    ? S extends { netWorthFan: infer NF }
      ? NF
      : never
    : never;
}

function PortfolioLabHero({
  canonicalLedger,
  recommendations,
  feasibility,
  whyWinsNarrative,
  whyWinsLabel,
  netWorthFan,
}: HeroProps) {
  const canonical = canonicalLedger ? computeCanonicalFire(canonicalLedger) : null;
  // Sprint 13 P0-1 — gate Hero NW on the canonical breakdown reconciliation.
  const heroBreakdown = canonicalLedger ? selectCanonicalNetWorthBreakdown(canonicalLedger) : null;
  const heroNwReconciled = heroBreakdown?.reconciled ?? false;
  const featured = recommendations.find(r => r.category === "hybrid") ?? recommendations[0] ?? null;

  // Slot 2 — feasibility status / probability bar
  const status = feasibility?.status ?? "UNLIKELY";
  const probability = feasibility?.probabilityOfSuccess;
  const probabilityPct = probability != null ? Math.round(probability * 100) : null;
  const statusTone: Record<string, string> =
    status === "ACHIEVABLE"
      ? { chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40", bar: "bg-emerald-500" }
      : status === "STRETCH"
      ? { chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40", bar: "bg-amber-500" }
      : { chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40", bar: "bg-rose-500" };

  // Slot 5 — baseline vs recommendation
  // Baseline = today's snapshot held flat (no-action). Engine source:
  // canonicalFire.netWorthNow (current state) — and we plot a flat line at
  // that value across the horizon shown by netWorthFan. This is the "what
  // happens if I do nothing" baseline cited in the Sprint 11 brief.
  // Recommendation = path-sim p50 net-worth trajectory (existing engine output).
  const baselineNW = canonical?.netWorthNow ?? null;
  const chartData = (netWorthFan as Array<{ year: number; p50: number }> | null | undefined)?.map(b => ({
    year: b.year,
    "Recommended p50": b.p50,
    "Do nothing": baselineNW,
  })) ?? [];

  return (
    <section
      className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card p-4 sm:p-6 shadow-sm"
      data-testid="portfolio-lab-hero"
    >
      <header className="mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-foreground" data-testid="portfolio-lab-hero-title">
            Your fastest path to FIRE
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Five things to know in 30 seconds — every number pulled from the canonical engines.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* Slot 1: Where am I now? */}
        <div className="rounded-lg border border-border bg-card/70 p-3" data-testid="hero-where-now">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Where am I now?</div>
          <div className="text-xl font-semibold tabular-nums text-foreground">
            {!canonical
              ? "Set up your ledger"
              : !heroNwReconciled
                ? NW_RECONCILIATION_FAILED_TEXT
                : formatCurrency(heroBreakdown!.netWorth)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Net worth · {canonical && canonical.fireNumber > 0
              ? `${Math.round(canonical.progressFraction * 100)}% of FIRE target`
              : "FIRE target not set"}
          </div>
        </div>

        {/* Slot 2: Am I on track? */}
        <div className="rounded-lg border border-border bg-card/70 p-3" data-testid="hero-on-track">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Am I on track?</div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusTone.chip}`}
              data-testid="hero-on-track-status"
            >
              {status.replace(/_/g, " ")}
            </span>
            {probabilityPct != null ? (
              <span className="text-sm font-semibold tabular-nums text-foreground" data-testid="hero-on-track-probability">
                {probabilityPct}%
              </span>
            ) : null}
          </div>
          {probabilityPct != null ? (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-label="Probability of FIRE">
              <div className={`h-full ${statusTone.bar}`} style={{ width: `${Math.min(100, probabilityPct)}%` }} />
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-2">Set a target to score</div>
          )}
        </div>

        {/* Slot 3: What should I do next? */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3" data-testid="hero-next-action">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What should I do next?</div>
          <div className="text-sm font-medium text-foreground leading-snug" data-testid="hero-next-action-text">
            {featured?.actionability?.what ?? "Complete your ledger to receive a recommendation."}
          </div>
          {featured?.actionability?.when ? (
            <div className="text-[11px] text-muted-foreground mt-1">When: {featured.actionability.when}</div>
          ) : null}
        </div>

        {/* Slot 4: Why? */}
        <div className="rounded-lg border border-border bg-card/70 p-3" data-testid="hero-why">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Why?</div>
          <div className="text-xs text-foreground leading-relaxed" data-testid="hero-why-text">
            {whyWinsNarrative ?? featured?.actionability?.why ?? "Complete your ledger to see the rationale."}
          </div>
          {whyWinsLabel ? (
            <div className="text-[11px] text-muted-foreground mt-1 italic">{whyWinsLabel}</div>
          ) : null}
        </div>
      </div>

      {/* Slot 5: What if I do nothing? — baseline vs recommended */}
      <div
        className="rounded-lg border border-border bg-card/70 p-3"
        data-testid="hero-baseline-chart"
      >
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">What if I do nothing?</div>
            <div className="text-xs text-muted-foreground">
              Dashed = current snapshot held flat. Solid = engine recommended (p50 net worth).
            </div>
          </div>
        </div>
        {chartData.length > 0 ? (
          <div className="h-56 sm:h-64" data-testid="hero-baseline-chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `$${Math.round(v / 1000).toLocaleString()}k`}
                />
                <RTooltip
                  formatter={(v: number) => formatCurrency(v)}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="Do nothing"
                  stroke="#9ca3af"
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="Recommended p50"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic py-6 text-center" data-testid="hero-baseline-chart-empty">
            Net-worth trajectory unavailable — complete your ledger to populate the engine.
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Sprint 11 Goal Solver Pro deep-link card ───────────────────────────
 *
 * Sprint 11 #6: GoalSolverProSection is being moved out of /portfolio-lab and
 * promoted to its own /decision route. To preserve discoverability for users
 * who land on /portfolio-lab (and for bookmarks), keep a card-style deep-link
 * pointing to /decision rather than re-mounting the section here.
 */
function GoalSolverProDeepLink() {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-goal-solver-pro-deeplink"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Goal Solver Pro now lives on /decision</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Reverse-engineer your wealth goal — feasibility, gap, required inputs, and the action plan are all on the
            Decision Engine page.
          </p>
        </div>
        <Link href="/decision" data-testid="portfolio-lab-goal-solver-pro-deeplink-cta">
          <Button variant="default">Open Decision Engine</Button>
        </Link>
      </div>
    </section>
  );
}

/* ─── Main entry ───────────────────────────────────────────────────────── */

export function TruePortfolioOptimizer(props: TruePortfolioOptimizerProps) {
  const [constraints, setConstraints] = useState<OptimizerConstraints>({});
  const result = useMemo(
    () => buildTruePortfolioOptimizer({
      canonicalLedger: props.canonicalLedger ?? null,
      goalSolverInputs: props.goalSolverInputs,
      riskOutputs: props.riskOutputs ?? null,
      monteCarloOutputs: props.monteCarloOutputs ?? null,
      constraints,
    }),
    [props.canonicalLedger, props.goalSolverInputs, props.riskOutputs, props.monteCarloOutputs, constraints],
  );

  // Sprint 8 — Assumption Uncertainty Engine. Pure read of the Sprint 7
  // result. Default seed = 8 (Sprint 8) so results are reproducible.
  const probabilistic = useMemo(
    () => buildProbabilisticWealthEngine({ sprint7Result: result }),
    [result],
  );

  // Sprint 9 — Path-Based Wealth Simulation. Orchestrates ≥1000 full-life
  // path simulations per top Sprint 7 strategy. Pure read of Sprint 7 +
  // canonical ledger. Default seed = 9 (Sprint 9) for reproducibility.
  const pathSim = useMemo(
    () => buildPathSimulationEngine({
      sprint7Result: result,
      canonicalLedger: props.canonicalLedger ?? null,
    }),
    [result, props.canonicalLedger],
  );

  // Sprint 10 — Goal Solver Pro. Pure orchestration over Sprint 7/8/9
  // outputs. Used here (Sprint 11) to feed the Hero's feasibility slot.
  //
  // Sprint 13 P0-3 — replace the unconditional EMPTY_GOAL_TARGETS pass-through
  // (per audit TruePortfolioOptimizer.tsx:981) with the actual persisted
  // FIRE targets from the canonical ledger snapshot. The fire_target_*
  // columns + the explicit-set marker are forwarded to buildGoalSolverPro,
  // which now refuses to short-circuit to ACHIEVABLE when the validator
  // returns INCOMPLETE.
  const goalSolverResult = useMemo(() => {
    const canonicalFire = props.canonicalLedger
      ? computeCanonicalFire(props.canonicalLedger)
      : {
          swrPct: 4,
          targetAnnualIncome: 0,
          targetMonthlyIncome: 0,
          fireNumber: 0,
          netWorthNow: 0,
          progressFraction: 0,
          annualPassiveIncome: 0,
          monthlyPassiveIncome: 0,
          monthlyExpenses: 0,
          passiveCoverage: null,
          gap: 0,
          source: "empty" as const,
        };
    const snap = (props.canonicalLedger?.snapshot ?? {}) as any;
    const fireTargetMonthlyIncomeRaw =
      snap.fire_target_monthly_income !== undefined &&
      snap.fire_target_monthly_income !== null
        ? Number(snap.fire_target_monthly_income)
        : null;
    const fireTargetMonthlyIncomeSetAt =
      snap.fire_target_monthly_income_set_at ?? null;
    const targets = {
      ...EMPTY_GOAL_TARGETS,
      fireTargetMonthlyIncomeRaw,
      fireTargetMonthlyIncomeSetAt,
    };
    return buildGoalSolverPro({
      canonicalLedger: props.canonicalLedger ?? null,
      canonicalFire,
      sprint7Result: result,
      sprint8Result: probabilistic,
      sprint9Result: pathSim,
      targets,
    });
  }, [props.canonicalLedger, result, probabilistic, pathSim]);

  // Sprint 11: pull `whyThisWins` from the Sprint 6 Phase 5 PortfolioLab
  // engine so the Hero can render the narrative without re-deriving it.
  const portfolioLabResult = useMemo(
    () =>
      buildPortfolioLabOptimizer({
        canonicalLedger: props.canonicalLedger ?? null,
        goalSolverInputs: props.goalSolverInputs,
        riskOutputs: props.riskOutputs ?? null,
        monteCarloOutputs: props.monteCarloOutputs ?? null,
      }),
    [props.canonicalLedger, props.goalSolverInputs, props.riskOutputs, props.monteCarloOutputs],
  );

  // Sprint 11 Hero — pull the recommended p50 net-worth fan from the Sprint 9
  // best strategy. Falls back to the first ranked strategy when bestStrategy
  // is null (e.g. user has not picked a target yet).
  const heroFan = pathSim.bestStrategy?.netWorthFan ?? pathSim.strategies[0]?.netWorthFan ?? [];

  // Sprint 12 — advisor-style views over Sprint 10 canonical output.
  const fireGap = useMemo(() => selectFireGapSummary(goalSolverResult), [goalSolverResult]);
  const top3 = useMemo(() => selectTop3Actions(goalSolverResult), [goalSolverResult]);
  const doNothing = useMemo(() => selectDoNothingComparison(goalSolverResult), [goalSolverResult]);

  // Sprint 13 — 4-section reality-check view over the same Sprint 10 output.
  const fireCommand = useMemo(() => selectFireCommandCenterData(goalSolverResult), [goalSolverResult]);
  const top3Detailed = useMemo(() => selectTop3ActionsDetailed(goalSolverResult), [goalSolverResult]);
  const rankedBlockers = useMemo(() => selectRankedBlockersDetailed(goalSolverResult), [goalSolverResult]);
  const doNothingOutcome = useMemo(() => selectDoNothingOutcome(goalSolverResult), [goalSolverResult]);
  const canonicalFire = useMemo(
    () => (props.canonicalLedger ? computeCanonicalFire(props.canonicalLedger) : null),
    [props.canonicalLedger],
  );

  // Sprint 13 P0-1 — canonical NW breakdown with lineage + reconciliation
  // gate. Every NW renderer below MUST use this (currentPosition,
  // FireCommandCenter via summary patches, hero baseline). If
  // reconciled===false the UI MUST render NW_RECONCILIATION_FAILED_TEXT
  // instead of the figure.
  const nwBreakdown = useMemo(
    () => (props.canonicalLedger ? selectCanonicalNetWorthBreakdown(props.canonicalLedger) : null),
    [props.canonicalLedger],
  );
  const nwReconciled = nwBreakdown?.reconciled ?? false;
  const baselineNW = nwReconciled ? (nwBreakdown?.netWorth ?? null) : null;

  // Sprint 13 P0-2 — gate recommendations BEFORE rendering rankings. When
  // any required field (fireYear, confidence, requiredContribution,
  // requiredAssetBase, requiredPassiveIncome) is missing on ANY rec, the
  // entire RecommendationsGrid surface is replaced with the sentinel.
  const recommendationGate = useMemo(
    () => gateRecommendations(result.recommendations.map((r) => projectRecommendationForGate(r as any))),
    [result.recommendations],
  );

  // Sprint 13 P0-3 — feasibility may now return status="INCOMPLETE" when
  // goal targets aren't persisted. Surfaces that depend on a feasibility
  // verdict must check this flag and render the goal sentinel.
  const feasibilityIncomplete = goalSolverResult.feasibility.status === "INCOMPLETE";

  // Sprint 13 P0-1 — Replace the FireCommandCenter's `currentNetWorth`
  // input with the breakdown-derived figure so every NW renderer ties to
  // the same selectCanonicalNetWorthBreakdown() output. When reconciled
  // is false, set the value to NaN so the tile collapses via isEmptyValue
  // (the Hero "Where am I now?" tile will render the sentinel separately).
  const fireCommandPatched = useMemo(() => {
    if (!nwBreakdown) return fireCommand;
    return {
      ...fireCommand,
      currentNetWorth: nwReconciled ? nwBreakdown.netWorth : NaN,
    };
  }, [fireCommand, nwBreakdown, nwReconciled]);

  // Sprint 13 P0-1 — patch fireGap (S12 view) the same way so the
  // FireGapSummaryBlock + DecisionFrame currentPosition pull from the
  // canonical breakdown rather than path-sim p50 drift.
  const fireGapPatched = useMemo(() => {
    if (!nwBreakdown) return fireGap;
    return {
      ...fireGap,
      currentNetWorth: nwReconciled ? nwBreakdown.netWorth : NaN,
    };
  }, [fireGap, nwBreakdown, nwReconciled]);

  return (
    <div
      className={`flex flex-col gap-4 sm:gap-5 ${props.className ?? ""}`}
      data-testid="true-portfolio-optimizer"
    >
      {/* Sprint 13 P0-1 — NW reconciliation sentinel. When the canonical
          breakdown fails the $1 reconciliation contract, replace ALL NW
          figures with NW_RECONCILIATION_FAILED_TEXT instead of partial
          renders. The audit panel still shows the lineage delta so
          engineers can debug it. */}
      {nwBreakdown != null && !nwReconciled ? (
        <div
          className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300"
          data-testid="s13-nw-reconciliation-failed"
        >
          {NW_RECONCILIATION_FAILED_TEXT}
        </div>
      ) : null}

      {nwBreakdown != null ? (
        <NetWorthAuditPanel breakdown={nwBreakdown} />
      ) : null}

      {/* Sprint 13 — Universal 4-section reality-check layout.
          Section 1: FIRE Command Center (5 hero tiles with SourceTags) */}
      <FireCommandCenter data={fireCommandPatched} testidPrefix="s13-portfolio-lab-fire-command-center" />

      {/* Section 2: Top 3 Actions (WHAT / WHEN / WHY / EXPECTED RESULT) */}
      <Top3ActionsSection actions={top3Detailed} testidPrefix="s13-portfolio-lab-top3-actions" />

      {/* Section 3: Biggest Blockers (3 ranked rows) */}
      <BiggestBlockersSection blockers={rankedBlockers} testidPrefix="s13-portfolio-lab-biggest-blockers" />

      {/* Section 4: Do Nothing Outcome (4 lines) */}
      <DoNothingOutcomeSection outcome={doNothingOutcome} testidPrefix="s13-portfolio-lab-do-nothing-outcome" />

      {/* Sprint 13 — Single above-fold chart: Recommended vs Do Nothing. */}
      <RecommendedVsDoNothingChart
        netWorthFan={heroFan as Array<{ year: number; p50: number }>}
        doNothingNetWorth={baselineNW}
        recommendedFireYear={fireCommand.medianFireYear}
        doNothingFireYear={doNothingOutcome.expectedFireYear}
        testidPrefix="s13-portfolio-lab-rec-vs-donothing-chart"
      />

      {/* Sprint 13 — Demote all S12 supporting analysis below the fold.
          Nothing is deleted; engineering can still reach every prior surface. */}
      <AdvancedDisclosure
        title="View Supporting Analysis"
        subtitle="Sprint 12 DecisionFrame · FIRE Gap KPIs · Top-3 deltas · supporting charts · Hero region · Why-this-wins narrative"
        data-testid="s13-portfolio-lab-supporting-analysis"
      >
        <div className="flex flex-col gap-4">
          <FireGapSummaryBlock summary={fireGapPatched} />
          <DecisionFrame
            testidPrefix="portfolio-lab-decision-frame"
            title="Your decision in one frame"
            subtitle="Six questions, one answer — every number pulled from canonical engines."
            currentPosition={{
              label: "Current Position",
              value: !nwReconciled
                ? NW_RECONCILIATION_FAILED_TEXT
                : fireGapPatched.currentNetWorth != null && Number.isFinite(fireGapPatched.currentNetWorth)
                  ? formatCurrency(fireGapPatched.currentNetWorth, true)
                  : undefined,
              subtitle: fireGapPatched.currentPassiveIncome != null && Number.isFinite(fireGapPatched.currentPassiveIncome)
                ? `${formatCurrency(fireGapPatched.currentPassiveIncome, true)}/yr passive`
                : undefined,
              // Sprint 13 P0-3 — when goal targets aren't persisted, the
              // feasibility verdict is INCOMPLETE and we MUST NOT show a
              // "on-track" status driven by the schema-default short-circuit.
              status: feasibilityIncomplete
                ? "off-track"
                : goalSolverResult.feasibility.status === "ACHIEVABLE"
                  ? "on-track"
                  : goalSolverResult.feasibility.status === "STRETCH"
                    ? "at-risk"
                    : "off-track",
            }}
            targetPosition={{
              label: "Target Position",
              value: fireGap.targetNetWorth != null && Number.isFinite(fireGap.targetNetWorth)
                ? formatCurrency(fireGap.targetNetWorth, true)
                : undefined,
              subtitle: fireGap.targetFireYear != null
                ? `by ${fireGap.targetFireYear}`
                : undefined,
            }}
            gap={{
              label: "Gap to close",
              value: fireGap.netWorthGap != null && Number.isFinite(fireGap.netWorthGap) && fireGap.netWorthGap > 0
                ? formatCurrency(fireGap.netWorthGap, true)
                : undefined,
              direction: "negative",
              subtitle: fireGap.medianFireYear != null
                ? `Engine median FIRE year: ${fireGap.medianFireYear}`
                : undefined,
            }}
            recommendedAction={{
              label: "Recommended Action",
              value: top3[0]?.label,
              subtitle: top3[0]?.dueYear ? `Due year: ${top3[0].dueYear}` : undefined,
              ctaHref: "/decision",
              ctaLabel: "Open Decision Engine",
            }}
            expectedOutcome={{
              label: "Expected Outcome",
              value: top3[0]?.netWorthDelta != null && Number.isFinite(top3[0].netWorthDelta) && top3[0].netWorthDelta !== 0
                ? `+ ${formatCurrency(Math.abs(top3[0].netWorthDelta), true)} NW`
                : undefined,
              subtitle: top3[0]?.probabilityDelta != null && Number.isFinite(top3[0].probabilityDelta) && top3[0].probabilityDelta !== 0
                ? `${top3[0].probabilityDelta > 0 ? "+" : "−"} ${Math.round(Math.abs(top3[0].probabilityDelta) * 100)}% success probability`
                : undefined,
            }}
            doNothingOutcome={{
              label: "Do Nothing Outcome",
              value: doNothing.baselineNetWorth != null && Number.isFinite(doNothing.baselineNetWorth)
                ? `End NW ${formatCurrency(doNothing.baselineNetWorth, true)}`
                : undefined,
              subtitle: doNothing.baselineProbability != null
                ? `${Math.round(doNothing.baselineProbability * 100)}% FIRE probability if no action`
                : undefined,
            }}
          />
          <Top3ActionsBlock actions={top3} />
          <PortfolioLabCharts
            summary={fireGapPatched}
            netWorthFan={heroFan as Array<{ year: number; p50: number }>}
            baselineNetWorth={baselineNW}
          />
          <PortfolioLabHero
            canonicalLedger={props.canonicalLedger}
            recommendations={result.recommendations}
            feasibility={goalSolverResult.feasibility}
            whyWinsNarrative={portfolioLabResult.whyThisWins?.narrative ?? null}
            whyWinsLabel={portfolioLabResult.whyThisWins?.strategyLabel ?? null}
            netWorthFan={heroFan as any}
          />
          <section
            className="rounded-lg border border-emerald-500/20 bg-card p-4 sm:p-5 shadow-sm"
            data-testid="portfolio-lab-why-this-wins-promoted"
          >
            <header className="mb-2 flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="text-base font-semibold text-foreground">Why this strategy wins</h3>
              {portfolioLabResult.whyThisWins?.strategyLabel ? (
                <span
                  className="text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  data-testid="portfolio-lab-why-this-wins-promoted-strategy"
                >
                  {portfolioLabResult.whyThisWins.strategyLabel}
                </span>
              ) : null}
            </header>
            <p
              className="text-sm text-foreground leading-relaxed"
              data-testid="portfolio-lab-why-this-wins-promoted-narrative"
            >
              {portfolioLabResult.whyThisWins?.narrative ??
                "Complete your canonical ledger to see why the engine picks a winning strategy."}
            </p>
          </section>
        </div>
      </AdvancedDisclosure>

      <ExecutiveSummary
        recommendations={result.recommendations}
        goal={result.goalReverseEngineering}
        searchMetrics={result.searchMetrics}
        gapSolver={result.gapSolver}
      />
      <GoalReverseEngineeringCard section={result.goalReverseEngineering} />
      <ConstraintsPanel constraints={constraints} onChange={setConstraints} />
      <RecommendationsGrid
        recommendations={result.recommendations}
        blocked={!recommendationGate.ok}
        reason={recommendationGate.reason}
      />
      <GapSolverCard gap={result.gapSolver} />
      <FrontierCard frontier={result.frontier} />
      <ScenarioMatrixCard
        scenarios={result.scenarios}
        recommendations={result.recommendations}
        frontier={result.frontier}
      />

      {/* Sprint 8 — Assumption Uncertainty Engine. Sits on top of the Sprint 7
          deterministic outputs, never replaces them. */}
      <div className="pt-2" data-testid="true-portfolio-optimizer-sprint8-shell">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Assumption Uncertainty (Sprint 8)
        </h2>
        <ProbabilisticWealthSection result={probabilistic} />
      </div>

      {/* Sprint 11 #6 — Goal Solver Pro moved out of /portfolio-lab and
          promoted to its own /decision route. Keep a deep-link card here so
          users with bookmarks aren't lost. */}
      <GoalSolverProDeepLink />

      {/* Sprint 9 — Path-Based Wealth Simulation. Builds ≥1000 full life-paths
          per top Sprint 7 strategy and reports probability curves, fan chart,
          heatmap, representative paths, and driver sensitivity. */}
      <div className="pt-2" data-testid="true-portfolio-optimizer-sprint9-shell">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Path-Based Wealth Simulation (Sprint 9)
        </h2>
        <PathSimulationSection result={pathSim} />
      </div>

      {/* Sprint 11 #3, #4 — demote audit trail, portfolio-lab audit trail, and
          search metrics into a single AdvancedDisclosure at the bottom of the
          page. Nothing is deleted; engineering can still reach the surfaces in
          one click. Audit mode auto-opens this disclosure. */}
      <AdvancedDisclosure
        title="Where did these numbers come from?"
        subtitle="Sprint 7 audit trail · Sprint 6 Phase 5 deep-dives · Scenario search metrics"
        data-testid="portfolio-lab-advanced-disclosure"
      >
        <div className="flex flex-col gap-4">
          <SearchMetricsCard metrics={result.searchMetrics} />
          <AuditTrailCard audit={result.auditTrail} />
          <div data-testid="true-portfolio-optimizer-phase5-shell">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Deep-Dive Diagnostics
            </h3>
            <PortfolioLab
              canonicalLedger={props.canonicalLedger}
              goalSolverInputs={props.goalSolverInputs}
              riskOutputs={props.riskOutputs}
              monteCarloOutputs={props.monteCarloOutputs}
            />
          </div>
        </div>
      </AdvancedDisclosure>
    </div>
  );
}
