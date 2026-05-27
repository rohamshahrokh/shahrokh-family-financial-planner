/**
 * PortfolioLab.tsx — Sprint 6 Phase 5 presentational shell.
 *
 * Renders the Portfolio Lab Optimizer workspace. Consumes only the
 * orchestration output of `portfolioLabOptimizer.ts` and never derives a
 * financial value of its own. The fourteen required sections are:
 *
 *   1. Current Position
 *   2. Target Position
 *   3. Gap To Target
 *   4. Portfolio Optimization Engine
 *   5. Ranked Portfolio Strategies
 *   6. Probability Of Success
 *   7. Time To FIRE
 *   8. Required Monthly Contribution
 *   9. Required Asset Base
 *  10. Portfolio Stress Test
 *  11. Why This Strategy Wins
 *  12. What Could Cause Failure
 *  13. Audit Trail
 *  14. Confidence Report
 *
 * Plus a numeric-free Strategic Ideas catalogue (carried over from
 * Sprint 6 Phase 4) with the literal "Not engine-modelled" label.
 *
 * Stable `data-testid` attributes are exported on every major surface so
 * the Sprint 6 Phase 5 test suite can assert structure without rerunning
 * engine math.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  buildPortfolioLabOptimizer,
  formatOptimizerMetric,
  type PortfolioLabOptimizerInputs,
  type OptimizerMetric,
  type OptimizerLeverRow,
  type OptimizerAuditEntry,
  type RankedStrategy,
  type StressTestRow,
  type FailureMode,
} from "@/lib/portfolioLabOptimizer";
import type { GoalSolverInputs } from "@/lib/goalSolver";
import type { RiskRadarResult } from "@/lib/riskEngine";
import type { MonteCarloResult } from "@/lib/forecastStore";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";

export interface PortfolioLabProps {
  canonicalLedger: DashboardInputs | null | undefined;
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
  className?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function feasibilityBadgeClass(status: string): string {
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

function bandBadgeClass(band: string): string {
  switch (band) {
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

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40";
    case "high":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "moderate":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "low":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

interface MetricBlockProps {
  metric: OptimizerMetric;
  testidPrefix: string;
  compact?: boolean;
}

function MetricBlock({ metric, testidPrefix, compact }: MetricBlockProps) {
  const { auditMode } = useAuditMode();
  const text = formatOptimizerMetric(metric);
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
          title="Some inputs for this metric are missing — open the explainer panel below for what's needed."
        >
          inputs missing
        </span>
      ) : null}
    </div>
  );
}

/* ─── Sections ─────────────────────────────────────────────────────────── */

function CurrentPositionCard({ section }: { section: ReturnType<typeof buildPortfolioLabOptimizer>["currentPosition"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-current-position"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-current-position-title">
          Current Position
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Today's wealth snapshot — every number is a verified pass-through of the live planner.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricBlock metric={section.netWorth}        testidPrefix="portfolio-lab-current-net-worth" />
        <MetricBlock metric={section.assets}          testidPrefix="portfolio-lab-current-assets" />
        <MetricBlock metric={section.liabilities}     testidPrefix="portfolio-lab-current-liabilities" />
        <MetricBlock metric={section.passiveIncome}   testidPrefix="portfolio-lab-current-passive-income" />
        <MetricBlock metric={section.monthlyIncome}   testidPrefix="portfolio-lab-current-monthly-income" />
        <MetricBlock metric={section.monthlyExpenses} testidPrefix="portfolio-lab-current-monthly-expenses" />
        <MetricBlock metric={section.monthlySurplus}  testidPrefix="portfolio-lab-current-monthly-surplus" />
        <MetricBlock metric={section.investibleBase}  testidPrefix="portfolio-lab-current-investible-base" />
        <MetricBlock metric={section.liquidityRunway} testidPrefix="portfolio-lab-current-liquidity-runway" />
      </div>
    </section>
  );
}

function TargetPositionCard({ section }: { section: ReturnType<typeof buildPortfolioLabOptimizer>["targetPosition"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-target-position"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-target-position-title">
          Target Position
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          What the plan must deliver — FIRE number, asset base, contribution requirements.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        <MetricBlock metric={section.fireNumber}                  testidPrefix="portfolio-lab-target-fire-number" />
        <MetricBlock metric={section.targetPassiveIncome}         testidPrefix="portfolio-lab-target-passive-income" />
        <MetricBlock metric={section.requiredAssetBase}           testidPrefix="portfolio-lab-target-asset-base" />
        <MetricBlock metric={section.requiredMonthlyContribution} testidPrefix="portfolio-lab-target-monthly-contribution" />
        <MetricBlock metric={section.requiredPortfolioGrowth}     testidPrefix="portfolio-lab-target-portfolio-growth" />
        <MetricBlock metric={section.safeWithdrawalRate}          testidPrefix="portfolio-lab-target-swr" />
      </div>
    </section>
  );
}

function GapToTargetCard({ section }: { section: ReturnType<typeof buildPortfolioLabOptimizer>["gapToTarget"] }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-gap-to-target"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-gap-to-target-title">
            Gap To Target
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            The specific deltas the plan needs to close, plus the feasibility verdict.
          </p>
        </div>
        <span
          className={`text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full border ${feasibilityBadgeClass(section.feasibility)}`}
          data-testid="portfolio-lab-gap-feasibility-badge"
          data-feasibility={section.feasibility}
        >
          {section.feasibilityLabel}
        </span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricBlock metric={section.netWorthGap}            testidPrefix="portfolio-lab-gap-net-worth" />
        <MetricBlock metric={section.assetBaseGap}           testidPrefix="portfolio-lab-gap-asset-base" />
        <MetricBlock metric={section.passiveIncomeGap}       testidPrefix="portfolio-lab-gap-passive-income" />
        <MetricBlock metric={section.monthlyContributionGap} testidPrefix="portfolio-lab-gap-monthly-contribution" />
        <MetricBlock metric={section.yearsAheadBehind}       testidPrefix="portfolio-lab-gap-years" />
      </div>
      <p
        className="text-xs text-foreground mt-3 leading-relaxed bg-muted/30 border border-border rounded-md px-3 py-2"
        data-testid="portfolio-lab-gap-summary"
      >
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Engine Reasoning</span>
        <span className="block mt-0.5">{section.summary}</span>
      </p>
    </section>
  );
}

function LeverRowCard({ row }: { row: OptimizerLeverRow }) {
  const tid = `portfolio-lab-lever-${row.id}`;
  return (
    <article
      className={`rounded-lg bg-card p-4 shadow-sm ring-1 ring-border ${row.incomplete ? "opacity-90" : ""}`}
      data-testid={tid}
      data-lever-id={row.id}
      data-not-engine-modelled={row.definition.notEngineModelled ? "true" : "false"}
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
        {row.definition.notEngineModelled ? (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border whitespace-nowrap"
            data-testid={`${tid}-not-modelled-badge`}
          >
            Not engine-modelled
          </span>
        ) : null}
      </header>
      {row.incomplete && !row.candidate ? (
        <div
          className="text-xs italic text-amber-500"
          data-testid={`${tid}-no-candidate`}
        >
          Not yet engine-modelled — supporting candidate unavailable.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <MetricBlock metric={row.metrics.deltaNetWorth}         testidPrefix={`${tid}-delta-net-worth`} compact />
        <MetricBlock metric={row.metrics.deltaPassiveIncome}    testidPrefix={`${tid}-delta-passive-income`} compact />
        <MetricBlock metric={row.metrics.deltaMonthlySurplus}   testidPrefix={`${tid}-delta-monthly-surplus`} compact />
        <MetricBlock metric={row.metrics.deltaLiquidityMonths}  testidPrefix={`${tid}-delta-liquidity`} compact />
        <MetricBlock metric={row.metrics.deltaFireProgress}     testidPrefix={`${tid}-delta-fire-progress`} compact />
        <MetricBlock metric={row.metrics.rankingScore}          testidPrefix={`${tid}-ranking-score`} compact />
        <MetricBlock metric={row.metrics.monteCarloProbability} testidPrefix={`${tid}-mc-probability`} compact />
        <MetricBlock metric={row.metrics.confidence}            testidPrefix={`${tid}-confidence`} compact />
      </div>
    </article>
  );
}

function OptimizationEngineSectionCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["optimization"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-optimization-engine"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-optimization-engine-title">
          Portfolio Optimization Engine
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every lever the engine considers — pass-through deltas only, hybrid combinations clearly flagged.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {section.levers.map(row => (
          <LeverRowCard key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function RankedStrategiesCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["rankedStrategies"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-ranked-strategies"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-ranked-strategies-title">
            Ranked Portfolio Strategies
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Top {Math.min(10, section.strategies.length)} engine-ranked strategies — score, deltas and risk pass-throughs.
          </p>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded bg-muted/40 border border-border"
          data-testid="portfolio-lab-ranked-strategies-count"
        >
          {section.strategies.length} of 10
        </span>
      </header>
      {section.strategies.length === 0 ? (
        <div
          className="text-xs italic text-amber-500"
          data-testid="portfolio-lab-ranked-strategies-empty"
        >
          No engine candidates available — strategy ranking unavailable.
        </div>
      ) : (
        <div className="space-y-3">
          {section.strategies.map(s => (
            <RankedStrategyRow key={s.candidateId} strategy={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function RankedStrategyRow({ strategy }: { strategy: RankedStrategy }) {
  const tid = `portfolio-lab-strategy-${strategy.rank}`;
  return (
    <article
      className={`rounded-md p-3 ring-1 ${strategy.isRecommended ? "ring-emerald-500/50 bg-emerald-500/[0.04]" : "ring-border bg-card"}`}
      data-testid={tid}
      data-rank={strategy.rank}
      data-candidate-id={strategy.candidateId}
      data-recommended={strategy.isRecommended ? "true" : "false"}
    >
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3">
          <span
            className="text-[10px] font-semibold tracking-wider text-muted-foreground bg-muted/40 border border-border rounded-md px-1.5 py-0.5 mt-0.5"
            data-testid={`${tid}-rank`}
          >
            #{strategy.rank}
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground" data-testid={`${tid}-label`}>
              {strategy.label}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-line" data-testid={`${tid}-rationale`}>
              {strategy.rationale}
            </div>
          </div>
        </div>
        {strategy.isRecommended ? (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 whitespace-nowrap"
            data-testid={`${tid}-recommended-badge`}
          >
            BEST STRATEGY
          </span>
        ) : null}
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-2">
        <MetricBlock metric={strategy.metrics.deltaNetWorth}         testidPrefix={`${tid}-delta-net-worth`} compact />
        <MetricBlock metric={strategy.metrics.deltaPassiveIncome}    testidPrefix={`${tid}-delta-passive-income`} compact />
        <MetricBlock metric={strategy.metrics.deltaMonthlySurplus}   testidPrefix={`${tid}-delta-monthly-surplus`} compact />
        <MetricBlock metric={strategy.metrics.deltaFireProgress}     testidPrefix={`${tid}-delta-fire-progress`} compact />
        <MetricBlock metric={strategy.metrics.monteCarloProbability} testidPrefix={`${tid}-mc-probability`} compact />
        <MetricBlock metric={strategy.metrics.executionRisk}         testidPrefix={`${tid}-execution-risk`} compact />
        <MetricBlock metric={strategy.metrics.liquidityRisk}         testidPrefix={`${tid}-liquidity-risk`} compact />
      </div>
    </article>
  );
}

function ProbabilityOfSuccessCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["probabilityOfSuccess"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-probability-of-success"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-probability-of-success-title">
            Probability Of Success
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Engine + Monte Carlo confidence. Explicitly flagged incomplete when MC output is missing.
          </p>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded bg-muted/40 border border-border"
          data-testid="portfolio-lab-probability-band"
        >
          {section.bestMoveBand}
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricBlock metric={section.bestMoveConfidence}    testidPrefix="portfolio-lab-probability-best-move" />
        <MetricBlock metric={section.monteCarloProbability} testidPrefix="portfolio-lab-probability-mc" />
        <MetricBlock metric={section.recommendedStrategyMc} testidPrefix="portfolio-lab-probability-top-mc" />
      </div>
      <p
        className="text-xs text-muted-foreground mt-3 leading-relaxed"
        data-testid="portfolio-lab-probability-summary"
      >
        {section.summary}
      </p>
    </section>
  );
}

function TimeToFireCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["timeToFire"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-time-to-fire"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-time-to-fire-title">
          Time To FIRE
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Projected achievement year, ahead/behind, and the Best Move's adjusted year.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricBlock metric={section.projectedAchievementYear} testidPrefix="portfolio-lab-time-projected" />
        <MetricBlock metric={section.yearsToTarget}            testidPrefix="portfolio-lab-time-years-to-target" />
        <MetricBlock metric={section.yearsAheadBehind}         testidPrefix="portfolio-lab-time-years-ahead-behind" />
        <MetricBlock metric={section.bestMoveAchievementYear}  testidPrefix="portfolio-lab-time-best-move-year" />
      </div>
    </section>
  );
}

function RequiredMonthlyContributionCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["requiredMonthlyContribution"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-required-monthly-contribution"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-required-monthly-contribution-title">
          Required Monthly Contribution
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Goal solver's required contribution vs the household's available surplus.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricBlock metric={section.required}  testidPrefix="portfolio-lab-rmc-required" />
        <MetricBlock metric={section.available} testidPrefix="portfolio-lab-rmc-available" />
        <MetricBlock metric={section.gap}       testidPrefix="portfolio-lab-rmc-gap" />
        <MetricBlock metric={section.coverage}  testidPrefix="portfolio-lab-rmc-coverage" />
      </div>
    </section>
  );
}

function RequiredAssetBaseCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["requiredAssetBase"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-required-asset-base"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-required-asset-base-title">
          Required Asset Base
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          What the investible base must grow to — plus the CAGR the household needs.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricBlock metric={section.required}       testidPrefix="portfolio-lab-rab-required" />
        <MetricBlock metric={section.current}        testidPrefix="portfolio-lab-rab-current" />
        <MetricBlock metric={section.gap}            testidPrefix="portfolio-lab-rab-gap" />
        <MetricBlock metric={section.coverage}       testidPrefix="portfolio-lab-rab-coverage" />
        <MetricBlock metric={section.requiredGrowth} testidPrefix="portfolio-lab-rab-required-growth" />
      </div>
    </section>
  );
}

function PortfolioStressTestCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["portfolioStressTest"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-stress-test"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-stress-test-title">
          Portfolio Stress Test
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Risk engine + Best Move risk surface + Monte Carlo downside probability.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <MetricBlock metric={section.overallRiskScore}     testidPrefix="portfolio-lab-stress-overall-risk" />
        <MetricBlock metric={section.probNegativeCashflow} testidPrefix="portfolio-lab-stress-prob-neg-cf" />
      </div>
      {section.rows.length === 0 ? (
        <div className="text-xs italic text-amber-500" data-testid="portfolio-lab-stress-test-empty">
          Risk engine output unavailable — stress rows incomplete.
        </div>
      ) : (
        <div className="space-y-2">
          {section.rows.map(row => (
            <StressTestRowItem key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function StressTestRowItem({ row }: { row: StressTestRow }) {
  const { auditMode } = useAuditMode();
  const tid = `portfolio-lab-stress-row-${row.id}`;
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-2"
      data-testid={tid}
      data-band={row.band}
    >
      <div className="flex flex-col">
        <span className="text-xs text-foreground" data-testid={`${tid}-label`}>{row.label}</span>
        <span className="text-sm font-semibold text-foreground tabular-nums" data-testid={`${tid}-value`} {...(auditMode ? { title: row.metric.source } : {})}>
          {formatOptimizerMetric(row.metric)}
        </span>
      </div>
      <span
        className={`text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded border ${bandBadgeClass(row.band)}`}
        data-testid={`${tid}-band`}
      >
        {row.band}
      </span>
    </div>
  );
}

function WhyThisWinsCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["whyThisWins"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-why-this-wins"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-why-this-wins-title">
            Why This Strategy Wins
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Engine narrative for the winning strategy — pass-through, not synthesised.
          </p>
        </div>
        <span
          className="text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
          data-testid="portfolio-lab-why-this-wins-strategy"
        >
          {section.strategyLabel}
        </span>
      </header>
      <p
        className="text-sm text-foreground leading-relaxed"
        data-testid="portfolio-lab-why-this-wins-narrative"
      >
        {section.narrative}
      </p>
      {section.decisiveFactors.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Decisive factors</div>
          <ul className="space-y-1.5" data-testid="portfolio-lab-why-this-wins-factors">
            {section.decisiveFactors.map((f, i) => (
              <li
                key={i}
                className="text-xs text-foreground leading-relaxed flex items-start gap-2"
                data-testid={`portfolio-lab-why-this-wins-factor-${i}`}
              >
                <span className="text-emerald-500 mt-0.5">•</span>
                <span>
                  <span className="font-medium">{f.dimension}</span>
                  : gap {f.contributionGap.toFixed(2)} (best {f.bestContribution.toFixed(2)} vs runner-up {f.runnerUpContribution.toFixed(2)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 border-t border-border pt-3">
        <MetricBlock metric={section.confidence} testidPrefix="portfolio-lab-why-this-wins-confidence" />
      </div>
    </section>
  );
}

function WhatCouldFailCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["whatCouldFail"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-what-could-fail"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-what-could-fail-title">
          What Could Cause Failure
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Failure modes pulled from Best Move risk deltas and CFO advisor — pass-through narrative.
        </p>
      </header>
      <ul className="space-y-2" data-testid="portfolio-lab-what-could-fail-list">
        {section.failureModes.map(m => (
          <FailureModeItem key={m.id} mode={m} />
        ))}
      </ul>
    </section>
  );
}

function FailureModeItem({ mode }: { mode: FailureMode }) {
  const { auditMode } = useAuditMode();
  const tid = `portfolio-lab-failure-${mode.id}`;
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-2"
      data-testid={tid}
      data-severity={mode.severity}
    >
      <p className="text-xs text-foreground leading-relaxed" {...(auditMode ? { title: mode.source } : {})} data-testid={`${tid}-description`}>
        {mode.description}
      </p>
      <span
        className={`text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded border whitespace-nowrap ${severityBadgeClass(mode.severity)}`}
        data-testid={`${tid}-severity`}
      >
        {mode.severity}
      </span>
    </li>
  );
}

function AuditEntryRow({ entry }: { entry: OptimizerAuditEntry }) {
  const [open, setOpen] = useState(false);
  const tid = `portfolio-lab-audit-${entry.id}`;
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

function AuditTrailCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["auditTrail"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-audit-trail"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-audit-trail-title">
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

function ConfidenceReportCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["confidenceReport"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-confidence-report"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-confidence-report-title">
            Confidence Report
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Composition of the Best Move composite confidence — Monte Carlo, score margin, data coverage.
          </p>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
          data-testid="portfolio-lab-confidence-band"
        >
          {section.band}
        </span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricBlock metric={section.overall}                  testidPrefix="portfolio-lab-confidence-overall" />
        <MetricBlock metric={section.components.monteCarlo}    testidPrefix="portfolio-lab-confidence-mc" />
        <MetricBlock metric={section.components.scoreMargin}   testidPrefix="portfolio-lab-confidence-margin" />
        <MetricBlock metric={section.components.dataCoverage}  testidPrefix="portfolio-lab-confidence-coverage" />
      </div>
      <p
        className="text-xs text-muted-foreground mt-3 leading-relaxed"
        data-testid="portfolio-lab-confidence-summary"
      >
        {section.summary}
      </p>
    </section>
  );
}

function StrategicIdeasCard({
  section,
}: {
  section: ReturnType<typeof buildPortfolioLabOptimizer>["strategicIdeas"];
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="portfolio-lab-strategic-ideas"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="portfolio-lab-strategic-ideas-title">
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
            data-testid={`portfolio-lab-strategic-idea-${idea.id}`}
            data-not-engine-modelled="true"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground">{idea.title}</h3>
              <span
                className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted/40 border border-border px-1.5 py-0.5 rounded"
                data-testid={`portfolio-lab-strategic-idea-${idea.id}-label`}
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

export function PortfolioLab(props: PortfolioLabProps) {
  const result = useMemo(() => {
    const inputs: PortfolioLabOptimizerInputs = {
      canonicalLedger: props.canonicalLedger,
      goalSolverInputs: props.goalSolverInputs,
      riskOutputs: props.riskOutputs ?? null,
      monteCarloOutputs: props.monteCarloOutputs ?? null,
    };
    return buildPortfolioLabOptimizer(inputs);
  }, [props.canonicalLedger, props.goalSolverInputs, props.riskOutputs, props.monteCarloOutputs]);

  if (result.empty) {
    return (
      <div
        className={`rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground ${props.className ?? ""}`}
        data-testid="portfolio-lab-empty-state"
      >
        Portfolio Lab Optimizer is waiting for canonical ledger data. {result.emptyReason ?? ""}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-4 sm:gap-6 ${props.className ?? ""}`}
      data-testid="portfolio-lab-root"
    >
      <CurrentPositionCard           section={result.currentPosition} />
      <TargetPositionCard            section={result.targetPosition} />
      <GapToTargetCard               section={result.gapToTarget} />
      <OptimizationEngineSectionCard section={result.optimization} />
      <RankedStrategiesCard          section={result.rankedStrategies} />
      <ProbabilityOfSuccessCard      section={result.probabilityOfSuccess} />
      <TimeToFireCard                section={result.timeToFire} />
      <RequiredMonthlyContributionCard section={result.requiredMonthlyContribution} />
      <RequiredAssetBaseCard         section={result.requiredAssetBase} />
      <PortfolioStressTestCard       section={result.portfolioStressTest} />
      <WhyThisWinsCard               section={result.whyThisWins} />
      <WhatCouldFailCard             section={result.whatCouldFail} />
      <AuditTrailCard                section={result.auditTrail} />
      <ConfidenceReportCard          section={result.confidenceReport} />
      <StrategicIdeasCard            section={result.strategicIdeas} />
    </div>
  );
}
