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
import { buildProbabilisticWealthEngine } from "@/lib/probabilisticWealthEngine";
import { ProbabilisticWealthSection } from "@/components/ProbabilisticWealthSection";
import { buildPathSimulationEngine } from "@/lib/pathSimulationEngine";
import { PathSimulationSection } from "@/components/PathSimulationSection";

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
        title={metric.source}
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
}: {
  recommendations: Recommendation[];
}) {
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
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pt.pareto ? chipClass("ok") : chipClass("default")}`}>
                    {pt.pareto ? "Pareto" : "—"}
                  </span>
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

  return (
    <div
      className={`flex flex-col gap-4 sm:gap-5 ${props.className ?? ""}`}
      data-testid="true-portfolio-optimizer"
    >
      <ExecutiveSummary
        recommendations={result.recommendations}
        goal={result.goalReverseEngineering}
        searchMetrics={result.searchMetrics}
        gapSolver={result.gapSolver}
      />
      <GoalReverseEngineeringCard section={result.goalReverseEngineering} />
      <ConstraintsPanel constraints={constraints} onChange={setConstraints} />
      <SearchMetricsCard metrics={result.searchMetrics} />
      <RecommendationsGrid recommendations={result.recommendations} />
      <GapSolverCard gap={result.gapSolver} />
      <FrontierCard frontier={result.frontier} />
      <ScenarioMatrixCard
        scenarios={result.scenarios}
        recommendations={result.recommendations}
        frontier={result.frontier}
      />
      <AuditTrailCard audit={result.auditTrail} />

      {/* Sprint 8 — Assumption Uncertainty Engine. Sits on top of the Sprint 7
          deterministic outputs, never replaces them. */}
      <div className="pt-2" data-testid="true-portfolio-optimizer-sprint8-shell">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Assumption Uncertainty (Sprint 8)
        </h2>
        <ProbabilisticWealthSection result={probabilistic} />
      </div>

      {/* Sprint 9 — Path-Based Wealth Simulation. Builds ≥1000 full life-paths
          per top Sprint 7 strategy and reports probability curves, fan chart,
          heatmap, representative paths, and driver sensitivity. */}
      <div className="pt-2" data-testid="true-portfolio-optimizer-sprint9-shell">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Path-Based Wealth Simulation (Sprint 9)
        </h2>
        <PathSimulationSection result={pathSim} />
      </div>

      {/* Sprint 6 Phase 5 deep-dive sections remain visible below Sprint 7. */}
      <div className="pt-2" data-testid="true-portfolio-optimizer-phase5-shell">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Deep-Dive Diagnostics
        </h2>
        <PortfolioLab
          canonicalLedger={props.canonicalLedger}
          goalSolverInputs={props.goalSolverInputs}
          riskOutputs={props.riskOutputs}
          monteCarloOutputs={props.monteCarloOutputs}
        />
      </div>
    </div>
  );
}
