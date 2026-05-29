/**
 * ExecutiveDecision — Action Roadmap S1 (Sprint 28B).
 *
 * Replaces the previous ExecutiveSummary. Shows the winning path name +
 * one-line promise + four headline P50 metrics: FIRE age, NW at FIRE,
 * passive income, confidence. Each tile carries its own SourceChip.
 *
 * Honesty: every numeric value renders the literal "Not modelled yet" when
 * the engine produced no value. No fabricated probability. No averaging.
 */
import * as React from "react";
import { Compass } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { MetricAttribution, MetricSource } from "@/lib/actionRoadmap/metricSourceAttribution";
import type { RoadmapSectionProps } from "./roadmapContext";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtAge(n: number | null): string {
  return n == null ? "Not modelled yet" : `${n}`;
}

function confidenceBand(c: RoadmapSectionProps["confidence"]): { label: string; tone: string } {
  if (!c) return { label: "Not modelled yet", tone: "bg-muted text-muted-foreground ring-border" };
  switch (c.band) {
    case "High":   return { label: "High",   tone: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25" };
    case "Medium": return { label: "Medium", tone: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25" };
    case "Low":    return { label: "Low",    tone: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25" };
    default:       return { label: "Not modelled yet", tone: "bg-muted text-muted-foreground ring-border" };
  }
}

export function ExecutiveDecision(props: RoadmapSectionProps) {
  const { recommended, mcProjection, confidence, auditMode } = props;
  const cBand = confidenceBand(confidence);

  return (
    <section
      data-testid="ar-s1-executive-decision"
      aria-labelledby="ar-s1-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Compass className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Executive decision</div>
          <h2 id="ar-s1-heading" className="text-xl font-semibold text-foreground">
            {recommended?.templateLabel ?? "Not modelled yet"}
          </h2>
          {recommended?.promise
            ? <p className="mt-0.5 text-sm text-muted-foreground">{recommended.promise}</p>
            : <p className="mt-0.5 text-sm text-muted-foreground">Run a plan from Decision Lab to populate this workspace.</p>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Tile
          label="FIRE age (P50)"
          value={fmtAge(mcProjection.fireAge.p50)}
          attribution={mcSource(mcProjection.fireAge.p50, mcProjection.simulationCount)}
          auditMode={auditMode}
          testId="ar-s1-fire-age"
        />
        <Tile
          label="Net worth at FIRE (P50)"
          value={fmtMoney(mcProjection.netWorthAtFire.p50)}
          attribution={mcSource(mcProjection.netWorthAtFire.p50, mcProjection.simulationCount)}
          auditMode={auditMode}
          testId="ar-s1-nw-at-fire"
        />
        <Tile
          label="Passive income (P50)"
          value={fmtMoney(mcProjection.passiveIncomeAtFire.p50)}
          attribution={mcSource(mcProjection.passiveIncomeAtFire.p50, mcProjection.simulationCount)}
          auditMode={auditMode}
          testId="ar-s1-passive-income"
        />
        <div className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid="ar-s1-confidence">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence</div>
          <div className="mt-1">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cBand.tone}`}>{cBand.label}</span>
          </div>
          <div className="mt-1.5">
            <SourceChip attribution={{ source: confidence ? "goalLab.confidence" : "notModelled" }} auditMode={auditMode} />
          </div>
        </div>
      </div>
    </section>
  );
}

function mcSource(value: number | null, simulationCount: number): MetricAttribution {
  const source: MetricSource = value == null ? "notModelled" : "scenarioV2.monteCarlo";
  return { source, percentile: "p50", simulationCount };
}

function Tile({
  label, value, attribution, auditMode, testId,
}: {
  label: string;
  value: string;
  attribution: MetricAttribution;
  auditMode: boolean;
  testId: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      <div className="mt-1.5">
        <SourceChip attribution={attribution} auditMode={auditMode} />
      </div>
    </div>
  );
}

export default ExecutiveDecision;
