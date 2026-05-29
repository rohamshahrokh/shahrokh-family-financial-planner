/**
 * ExecutiveSummary — Action Roadmap S1 (Sprint 28).
 *
 * Path name + headline metrics: FIRE age (P50), net worth at FIRE (P50),
 * passive income at FIRE (P50), confidence band. Each numeric value wears a
 * SourceChip; missing values render the literal "Not modelled yet".
 */
import * as React from "react";
import { Compass } from "lucide-react";
import type { MonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import type { ConfidenceResult } from "@/lib/goalLab/goalLabConfidence";
import { SourceChip } from "@/components/SourceChip";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtAge(n: number | null): string {
  return n == null ? "Not modelled yet" : `${n}`;
}

export interface ExecutiveSummaryProps {
  pathName: string | null;
  pathPromise: string | null;
  mc: MonteCarloProjection;
  confidence: ConfidenceResult | null;
  auditMode: boolean;
}

function confidenceLabel(c: ConfidenceResult | null): { label: string; tone: string } {
  if (!c) {
    return { label: "Not modelled yet", tone: "bg-muted text-muted-foreground ring-border" };
  }
  switch (c.band) {
    case "High":
      return { label: "High confidence", tone: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25" };
    case "Medium":
      return { label: "Medium confidence", tone: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25" };
    case "Low":
      return { label: "Low confidence", tone: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25" };
    default:
      return { label: "Not modelled yet", tone: "bg-muted text-muted-foreground ring-border" };
  }
}

export function ExecutiveSummary({ pathName, pathPromise, mc, confidence, auditMode }: ExecutiveSummaryProps) {
  const cBand = confidenceLabel(confidence);
  return (
    <section
      data-testid="ar-section-executive-summary"
      aria-labelledby="ar-s1-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Compass className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Executive summary</div>
          <h2 id="ar-s1-heading" className="text-xl font-semibold text-foreground">{pathName ?? "Not modelled yet"}</h2>
          {pathPromise ? <p className="mt-0.5 text-sm text-muted-foreground">{pathPromise}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="FIRE age (P50)"
          value={fmtAge(mc.fireAge.p50)}
          attribution={{ source: mc.fireAge.p50 == null ? "notModelled" : "scenarioV2.monteCarlo", percentile: "p50", simulationCount: mc.simulationCount }}
          auditMode={auditMode}
          testId="ar-s1-fire-age"
        />
        <Metric
          label="Net worth at FIRE (P50)"
          value={fmtMoney(mc.netWorthAtFire.p50)}
          attribution={{ source: mc.netWorthAtFire.p50 == null ? "notModelled" : "scenarioV2.monteCarlo", percentile: "p50", simulationCount: mc.simulationCount }}
          auditMode={auditMode}
          testId="ar-s1-nw-at-fire"
        />
        <Metric
          label="Passive income at FIRE (P50)"
          value={fmtMoney(mc.passiveIncomeAtFire.p50)}
          attribution={{ source: mc.passiveIncomeAtFire.p50 == null ? "notModelled" : "scenarioV2.monteCarlo", percentile: "p50", simulationCount: mc.simulationCount }}
          auditMode={auditMode}
          testId="ar-s1-passive-income"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${cBand.tone}`} data-testid="ar-s1-confidence">
          {cBand.label}
        </span>
        <SourceChip
          attribution={{ source: confidence ? "goalLab.confidence" : "notModelled" }}
          auditMode={auditMode}
        />
      </div>
    </section>
  );
}

function Metric({
  label, value, attribution, auditMode, testId,
}: {
  label: string;
  value: string;
  attribution: Parameters<typeof SourceChip>[0]["attribution"];
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

export default ExecutiveSummary;
