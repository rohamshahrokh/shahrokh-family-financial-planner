/**
 * MonteCarloOutlook — Action Roadmap S5 (Sprint 28B + Sprint 29 §4/§3.4).
 *
 * Three-column desktop / stacked-card mobile layout for FIRE age, NW at
 * FIRE, Passive income at FIRE. P50 headline + P25/P75 below. Sprint 29:
 *
 *   - Reconciliation gate (§3.4): when reconciliation fails, the NW-at-FIRE
 *     card surfaces "Reconciliation failed" across all three percentiles.
 *     FIRE age + Passive income render normally (they are not the contested
 *     quantity).
 *   - MC variance warnings (§4.4): per-card amber chip + audit-mode panel
 *     showing the full DistributionStats from `computeMCVarianceDiagnostic`.
 */
import * as React from "react";
import { LineChart, AlertTriangle } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { MonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import type { DistributionStats, MCVarianceWarning } from "@/lib/actionRoadmap/mcVarianceDiagnostic";
import { isBlocked } from "@/lib/actionRoadmap/financialReconciliation";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtAge(n: number | null): string {
  return n == null ? "Not modelled yet" : `${n}`;
}
function fmtStat(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-AU");
  return n.toFixed(2);
}

type Triple = MonteCarloProjection["fireAge"];

type RowKey = "fire-age" | "nw-at-fire" | "passive-income";

interface Row {
  key: RowKey;
  label: string;
  values: Triple;
  fmt: (n: number | null) => string;
  warning: MCVarianceWarning | null;
  stats: DistributionStats;
}

export function MonteCarloOutlook(props: RoadmapSectionProps) {
  const { mcProjection, mcVariance, reconciliation, auditMode } = props;
  // Sprint 30A §D8 — block ONLY the NW@FIRE row. FIRE age + Passive Income
  // rows continue to render their engine percentiles regardless of recon.
  const reconBlocked = isBlocked(reconciliation, "nw_at_fire");

  const warningFor = (key: RowKey): MCVarianceWarning | null => {
    if (key === "nw-at-fire" && mcVariance.warnings.includes("mc-variance-suspiciously-low")) return "mc-variance-suspiciously-low";
    if (key === "fire-age" && mcVariance.warnings.includes("mc-fire-age-spread-low")) return "mc-fire-age-spread-low";
    if (key === "passive-income" && mcVariance.warnings.includes("mc-passive-spread-low")) return "mc-passive-spread-low";
    return null;
  };

  const rows: Row[] = [
    { key: "fire-age",       label: "FIRE age",            values: mcProjection.fireAge,             fmt: fmtAge,   warning: warningFor("fire-age"),       stats: mcVariance.fireAge },
    { key: "nw-at-fire",     label: "Net worth at FIRE",   values: mcProjection.netWorthAtFire,      fmt: fmtMoney, warning: warningFor("nw-at-fire"),     stats: mcVariance.terminalNetWorth },
    { key: "passive-income", label: "Passive income",      values: mcProjection.passiveIncomeAtFire, fmt: fmtMoney, warning: warningFor("passive-income"), stats: mcVariance.passiveIncome },
  ];

  return (
    <section
      data-testid="ar-s5-mc-outlook"
      aria-labelledby="ar-s5-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <LineChart className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monte Carlo outlook</div>
          <h2 id="ar-s5-heading" className="text-base font-semibold text-foreground">
            P25 / P50 / P75 across {mcProjection.simulationCount} simulations
          </h2>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <MetricCard
            key={r.key}
            row={r}
            simulationCount={mcProjection.simulationCount}
            auditMode={auditMode}
            blockNW={reconBlocked && r.key === "nw-at-fire"}
            reconciliationMessage={reconciliation.message}
          />
        ))}
      </div>

      {auditMode && (
        <AuditVariancePanel mcVariance={mcVariance} />
      )}
    </section>
  );
}

function warningCopy(w: MCVarianceWarning): string {
  switch (w) {
    case "mc-variance-suspiciously-low": return "Variance suspiciously low — percentile bands may not be informative";
    case "mc-fire-age-spread-low":       return "FIRE-age band degenerate (P25 = P50 = P75) — engine produced one age";
    case "mc-passive-spread-low":        return "Passive-income variance suspiciously low";
  }
}

function MetricCard({
  row, simulationCount, auditMode, blockNW, reconciliationMessage,
}: {
  row: Row;
  simulationCount: number;
  auditMode: boolean;
  blockNW: boolean;
  reconciliationMessage: string | null;
}) {
  if (blockNW) {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/40 p-3 dark:border-rose-400/30 dark:bg-rose-950/20" data-testid={`ar-s5-card-${row.key}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</div>
        <div className="mt-1 flex items-center gap-2 text-base font-semibold text-rose-700 dark:text-rose-300" data-testid={`ar-s5-${row.key}-blocked`}>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Reconciliation failed
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">P25, P50 and P75 all blocked pending engine consistency.</div>
        <div className="mt-2">
          <SourceChip
            attribution={{ source: "reconciliationFailed", note: reconciliationMessage ?? undefined }}
            auditMode={auditMode}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid={`ar-s5-card-${row.key}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</div>

      <div className="mt-1 text-2xl font-semibold text-foreground" data-testid={`ar-s5-${row.key}-p50`}>
        {row.fmt(row.values.p50)}
      </div>
      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">P50 median</div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div data-testid={`ar-s5-${row.key}-p25`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">P25</div>
          <div className="text-foreground">{row.fmt(row.values.p25)}</div>
        </div>
        <div data-testid={`ar-s5-${row.key}-p75`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">P75</div>
          <div className="text-foreground">{row.fmt(row.values.p75)}</div>
        </div>
      </div>

      {row.warning && (
        <div
          data-testid={`ar-s5-${row.key}-warning`}
          className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300/60 bg-amber-50/60 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/20 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{warningCopy(row.warning)}</span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <SourceChip
          attribution={{
            source: row.values.p50 == null ? "notModelled" : "scenarioV2.monteCarlo",
            percentile: "p50",
            simulationCount,
          }}
          auditMode={auditMode}
        />
        {row.warning && (
          <SourceChip
            attribution={{ source: "scenarioV2.monteCarlo.diagnostic", note: row.warning }}
            auditMode={auditMode}
          />
        )}
      </div>
    </div>
  );
}

function AuditVariancePanel({ mcVariance }: { mcVariance: RoadmapSectionProps["mcVariance"] }) {
  const rows: Array<{ key: string; label: string; stats: DistributionStats }> = [
    { key: "terminalNetWorth", label: "Terminal net worth", stats: mcVariance.terminalNetWorth },
    { key: "fireAge",          label: "FIRE age",           stats: mcVariance.fireAge },
    { key: "passiveIncome",    label: "Passive income",     stats: mcVariance.passiveIncome },
  ];
  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3" data-testid="ar-s5-audit-panel">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Audit · variance diagnostic
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-1.5 py-1">Variable</th>
              <th className="px-1.5 py-1 text-right">n</th>
              <th className="px-1.5 py-1 text-right">Mean</th>
              <th className="px-1.5 py-1 text-right">Median</th>
              <th className="px-1.5 py-1 text-right">Std</th>
              <th className="px-1.5 py-1 text-right">CV</th>
              <th className="px-1.5 py-1 text-right">P5</th>
              <th className="px-1.5 py-1 text-right">P25</th>
              <th className="px-1.5 py-1 text-right">P50</th>
              <th className="px-1.5 py-1 text-right">P75</th>
              <th className="px-1.5 py-1 text-right">P95</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/60">
                <td className="px-1.5 py-1 font-medium text-foreground">{r.label}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{r.stats.sampleN}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.mean)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.median)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.std)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{r.stats.cv == null ? "—" : r.stats.cv.toFixed(3)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.p5)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.p25)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.p50)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.p75)}</td>
                <td className="px-1.5 py-1 text-right text-foreground">{fmtStat(r.stats.p95)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mcVariance.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-amber-700 dark:text-amber-300">
          {mcVariance.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{warningCopy(w)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MonteCarloOutlook;
