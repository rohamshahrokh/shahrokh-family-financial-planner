/**
 * MonteCarloOutlook — Action Roadmap S5 (Sprint 28B).
 *
 * Three-column desktop / stacked-card mobile layout for FIRE age, NW at
 * FIRE, Passive income at FIRE. Each card shows P50 as the headline with
 * P25/P75 below as a range. This is the ONLY section on the page that
 * surfaces percentile bands outside P50 (architecture §8).
 */
import * as React from "react";
import { LineChart } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { MonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtAge(n: number | null): string {
  return n == null ? "Not modelled yet" : `${n}`;
}

type Triple = MonteCarloProjection["fireAge"];

interface Row {
  key: "fire-age" | "nw-at-fire" | "passive-income";
  label: string;
  values: Triple;
  fmt: (n: number | null) => string;
}

export function MonteCarloOutlook(props: RoadmapSectionProps) {
  const { mcProjection, auditMode } = props;
  const rows: Row[] = [
    { key: "fire-age",       label: "FIRE age",            values: mcProjection.fireAge,            fmt: fmtAge },
    { key: "nw-at-fire",     label: "Net worth at FIRE",   values: mcProjection.netWorthAtFire,     fmt: fmtMoney },
    { key: "passive-income", label: "Passive income",      values: mcProjection.passiveIncomeAtFire, fmt: fmtMoney },
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
          <MetricCard key={r.key} row={r} simulationCount={mcProjection.simulationCount} auditMode={auditMode} />
        ))}
      </div>
    </section>
  );
}

function MetricCard({ row, simulationCount, auditMode }: { row: Row; simulationCount: number; auditMode: boolean }) {
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

      <div className="mt-2">
        <SourceChip
          attribution={{
            source: row.values.p50 == null ? "notModelled" : "scenarioV2.monteCarlo",
            percentile: "p50",
            simulationCount,
          }}
          auditMode={auditMode}
        />
      </div>
    </div>
  );
}

export default MonteCarloOutlook;
