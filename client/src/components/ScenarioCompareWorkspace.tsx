/**
 * ScenarioCompareWorkspace.tsx — Sprint 6 Phase 1.
 *
 * Presentational shell for the What-If Scenario Compare workspace. Renders the
 * six initial scenario cards/rows side-by-side, sourcing every numeric value
 * from `scenarioCompareWorkspace.ts` (which itself is a pass-through over the
 * canonical and Sprint 5 engines).
 *
 * This component does NOT:
 *   - call any canonical/headline metric directly,
 *   - recompute net worth, passive income, FIRE date, surplus, liquidity,
 *     risk, or Monte Carlo confidence,
 *   - introduce new financial formulas,
 *   - hard-code household values.
 *
 * Every visible numeric value is sourced from the orchestration layer.
 */

import * as React from "react";
import { useMemo } from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  buildScenarioCompareWorkspace,
  formatScenarioMetric,
  type ScenarioCompareWorkspaceInputs,
  type ScenarioCompareWorkspaceResult,
  type ScenarioRow,
  type ScenarioMetric,
} from "@/lib/scenarioCompareWorkspace";
import type { GoalSolverInputs } from "@/lib/goalSolver";
import type { RiskRadarResult } from "@/lib/riskEngine";
import type { MonteCarloResult } from "@/lib/forecastStore";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";

/* ─── Props ────────────────────────────────────────────────────────────── */

export interface ScenarioCompareWorkspaceProps {
  /** Canonical ledger (required). Falsy values render the empty state. */
  canonicalLedger: DashboardInputs | null | undefined;
  /** Optional user goal targets — threaded through to the engines. */
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  /** Optional pre-computed risk radar output. */
  riskOutputs?: RiskRadarResult | null;
  /** Optional pre-computed Monte Carlo output. */
  monteCarloOutputs?: MonteCarloResult | null;
  /** Optional className passthrough for the root container. */
  className?: string;
}

/* ─── Sub-components ───────────────────────────────────────────────────── */

interface MetricCellProps {
  metric: ScenarioMetric;
  testidPrefix: string;
}

function MetricCell({ metric, testidPrefix }: MetricCellProps) {
  const { auditMode } = useAuditMode();
  const text = formatScenarioMetric(metric);
  const incompleteClass = metric.incomplete ? " opacity-70 italic" : "";
  return (
    <div
      className={`flex flex-col gap-0.5${incompleteClass}`}
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
      {metric.incomplete ? (
        <span
          className="text-[10px] text-amber-500"
          data-testid={`${testidPrefix}-incomplete`}
        >
          incomplete data
        </span>
      ) : null}
    </div>
  );
}

interface ScenarioCardProps {
  row: ScenarioRow;
}

function ScenarioCard({ row }: ScenarioCardProps) {
  const tid = `scenario-card-${row.id}`;
  const recommendedRing = row.isRecommended
    ? "ring-2 ring-emerald-500/60"
    : "ring-1 ring-border";
  return (
    <div
      className={`rounded-lg bg-card p-4 shadow-sm flex flex-col gap-3 ${recommendedRing}`}
      data-testid={tid}
      data-scenario-id={row.id}
      data-recommended={row.isRecommended ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className="text-sm font-semibold text-foreground"
            data-testid={`${tid}-label`}
          >
            {row.definition.label}
          </div>
          <div
            className="text-xs text-muted-foreground mt-0.5"
            data-testid={`${tid}-description`}
          >
            {row.definition.description}
          </div>
        </div>
        {row.isRecommended ? (
          <span
            className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30"
            data-testid={`${tid}-recommended-badge`}
          >
            RECOMMENDED
          </span>
        ) : null}
      </div>

      {row.incomplete && !row.candidate ? (
        <div
          className="text-xs text-amber-500 italic"
          data-testid={`${tid}-incomplete-notice`}
        >
          Engine inputs missing for this scenario — data unavailable.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 mt-1">
        <MetricCell metric={row.metrics.netWorth}             testidPrefix={`${tid}-net-worth`} />
        <MetricCell metric={row.metrics.passiveIncome}        testidPrefix={`${tid}-passive-income`} />
        <MetricCell metric={row.metrics.fireDate}             testidPrefix={`${tid}-fire-date`} />
        <MetricCell metric={row.metrics.monthlySurplus}       testidPrefix={`${tid}-monthly-surplus`} />
        <MetricCell metric={row.metrics.liquidity}            testidPrefix={`${tid}-liquidity`} />
        <MetricCell metric={row.metrics.riskScore}            testidPrefix={`${tid}-risk-score`} />
        <MetricCell metric={row.metrics.monteCarloConfidence} testidPrefix={`${tid}-mc-confidence`} />
      </div>

      <div className="border-t border-border pt-2 mt-1">
        <div
          className="text-[10px] uppercase tracking-wider text-muted-foreground"
          data-testid={`${tid}-recommended-action-label`}
        >
          Recommended Action
        </div>
        <div
          className="text-xs text-foreground mt-0.5 leading-relaxed"
          data-testid={`${tid}-recommended-action-value`}
        >
          {formatScenarioMetric(row.metrics.recommendedAction)}
        </div>
      </div>
    </div>
  );
}

/* ─── Side-by-side comparison table (desktop only) ─────────────────────── */

interface CompareTableProps {
  result: ScenarioCompareWorkspaceResult;
}

function CompareTable({ result }: CompareTableProps) {
  const { auditMode } = useAuditMode();
  const metricKeys: Array<{
    key: keyof ScenarioRow["metrics"];
    label: string;
  }> = [
    { key: "netWorth",             label: "Net Worth" },
    { key: "passiveIncome",        label: "Passive Income" },
    { key: "fireDate",             label: "FIRE Date" },
    { key: "monthlySurplus",       label: "Monthly Surplus" },
    { key: "liquidity",            label: "Liquidity" },
    { key: "riskScore",            label: "Risk Score" },
    { key: "monteCarloConfidence", label: "MC Confidence" },
    { key: "recommendedAction",    label: "Recommended Action" },
  ];

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-card"
      data-testid="scenario-compare-table-wrapper"
    >
      <table
        className="w-full text-sm"
        data-testid="scenario-compare-table"
      >
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th
              className="text-left text-xs uppercase tracking-wider font-medium text-muted-foreground p-3"
            >
              Metric
            </th>
            {result.rows.map(row => (
              <th
                key={row.id}
                className={`text-left text-xs font-semibold p-3 whitespace-nowrap ${
                  row.isRecommended
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground"
                }`}
                data-testid={`scenario-compare-table-header-${row.id}`}
              >
                {row.definition.label}
                {row.isRecommended ? (
                  <span
                    className="ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30"
                    data-testid={`scenario-compare-table-recommended-${row.id}`}
                  >
                    BEST
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricKeys.map(({ key, label }) => (
            <tr
              key={key}
              className="border-b border-border last:border-b-0"
              data-testid={`scenario-compare-table-row-${String(key)}`}
            >
              <td className="text-xs text-muted-foreground p-3 font-medium whitespace-nowrap">
                {label}
              </td>
              {result.rows.map(row => {
                const m = row.metrics[key];
                const incompleteClass = m.incomplete ? "opacity-70 italic" : "";
                return (
                  <td
                    key={row.id}
                    className={`p-3 text-sm tabular-nums ${incompleteClass}`}
                    data-testid={`scenario-compare-table-cell-${row.id}-${String(key)}`}
                    {...(auditMode ? { title: m.source } : {})}
                  >
                    {formatScenarioMetric(m)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Root component ───────────────────────────────────────────────────── */

export function ScenarioCompareWorkspace(props: ScenarioCompareWorkspaceProps) {
  const result: ScenarioCompareWorkspaceResult = useMemo(() => {
    const inputs: ScenarioCompareWorkspaceInputs = {
      canonicalLedger: props.canonicalLedger,
      goalSolverInputs: props.goalSolverInputs,
      riskOutputs: props.riskOutputs,
      monteCarloOutputs: props.monteCarloOutputs,
    };
    return buildScenarioCompareWorkspace(inputs);
  }, [
    props.canonicalLedger,
    props.goalSolverInputs,
    props.riskOutputs,
    props.monteCarloOutputs,
  ]);

  if (result.empty) {
    return (
      <div
        className={`rounded-lg border border-dashed border-border bg-card p-6 text-center ${props.className ?? ""}`}
        data-testid="scenario-compare-workspace-empty"
      >
        <div className="text-sm font-medium text-foreground">
          Scenario Compare workspace is waiting on the canonical ledger.
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Once the household snapshot is loaded, the workspace will render the
          six initial scenarios side-by-side using existing engine outputs.
        </div>
        <div
          className="text-[10px] text-muted-foreground mt-2 font-mono"
          data-testid="scenario-compare-workspace-empty-reason"
        >
          {result.emptyReason ?? "no-ledger"}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-4 ${props.className ?? ""}`}
      data-testid="scenario-compare-workspace"
    >
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2
          className="text-base font-semibold text-foreground"
          data-testid="scenario-compare-workspace-title"
        >
          Scenario Compare — What-If Workspace
        </h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid="scenario-compare-workspace-subtitle"
        >
          Six parallel strategies, ranked side-by-side using the same canonical
          ledger, forecast, risk, Monte Carlo, goal solver, decision ranking
          and best-move engines that drive the dashboard. No numbers are
          recomputed here — every cell is an engine pass-through.
        </p>
      </div>

      {/* Mobile / stacked cards */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:hidden"
        data-testid="scenario-compare-workspace-cards"
      >
        {result.rows.map(row => (
          <ScenarioCard key={row.id} row={row} />
        ))}
      </div>

      {/* Desktop / wide side-by-side comparison table */}
      <div
        className="hidden lg:block"
        data-testid="scenario-compare-workspace-table-wrapper"
      >
        <CompareTable result={result} />
      </div>

      {/* Card grid also visible alongside table on lg+ for richer scanning */}
      <div
        className="hidden lg:grid lg:grid-cols-3 gap-3 mt-2"
        data-testid="scenario-compare-workspace-desktop-cards"
      >
        {result.rows.map(row => (
          <ScenarioCard key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

export default ScenarioCompareWorkspace;
