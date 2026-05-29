/**
 * RisksFailurePoints — Action Roadmap S6 (Sprint 28B).
 *
 * Renders the failure-analysis selector output as a stacked card list.
 * Each card surfaces failure label, severity-banded chip, probability
 * (formatted as %), detail, and `Source: <driver>` for audit mode.
 *
 * Honesty: probability null → renders "Not modelled yet" without a
 * percentage. Severity "unknown" → neutral gray chip.
 */
import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { Severity } from "@/lib/actionRoadmap/stressFailureAnalysis";

const SEVERITY_TONE: Record<Severity, string> = {
  low:     "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  medium:  "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
  high:    "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
  unknown: "bg-muted text-muted-foreground ring-border",
};

function severityLabel(s: Severity): string {
  return s === "unknown" ? "Not modelled" : s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtPct(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "Not modelled yet";
  return `${(p * 100).toFixed(1)}%`;
}

export function RisksFailurePoints(props: RoadmapSectionProps) {
  const { failures, auditMode } = props;

  return (
    <section
      data-testid="ar-s6-risks"
      aria-labelledby="ar-s6-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risks & failure points</div>
          <h2 id="ar-s6-heading" className="text-base font-semibold text-foreground">What could break this plan</h2>
        </div>
      </div>

      <ul className="mt-4 space-y-2" data-testid="ar-s6-list">
        {failures.map((f) => (
          <li
            key={f.id}
            data-testid={`ar-s6-row-${f.id}`}
            className="rounded-lg border border-border/60 bg-background/60 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{f.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${SEVERITY_TONE[f.severity]}`}>
                {severityLabel(f.severity)}
              </span>
              <span className="ml-auto text-sm font-semibold text-foreground">{fmtPct(f.probability)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{f.detail}</div>
            <div className="mt-1.5">
              <SourceChip
                attribution={{
                  source: f.probability == null ? "notModelled" : f.driver.startsWith("softWarnings.") ? "actionRoadmap.risk" : "scenarioV2.monteCarlo",
                  note: f.driver,
                }}
                auditMode={auditMode}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RisksFailurePoints;
