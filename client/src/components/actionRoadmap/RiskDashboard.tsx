/**
 * RiskDashboard — Action Roadmap S6 (Sprint 28).
 *
 * Renders the 5 risk axes from `analyzeRoadmapRisk()` as a horizontal bar
 * group (hand-rolled SVG, no chart deps). Each axis displays band + driver
 * + a SourceChip.
 */
import * as React from "react";
import { ShieldAlert } from "lucide-react";
import type { RoadmapRiskSummary, RiskBand } from "@/lib/actionRoadmap/types";
import { SourceChip } from "@/components/SourceChip";

const BAND_TO_PCT: Record<RiskBand, number> = {
  low:     30,
  medium:  60,
  high:    90,
  unknown: 0,
};

const BAND_TO_COLOR: Record<RiskBand, string> = {
  low:     "#10b981", // emerald-500
  medium:  "#f59e0b", // amber-500
  high:    "#ef4444", // red-500
  unknown: "#a3a3a3", // neutral-400
};

function bandLabel(band: RiskBand): string {
  if (band === "unknown") return "Not modelled";
  return band.charAt(0).toUpperCase() + band.slice(1);
}

export interface RiskDashboardProps {
  risk: RoadmapRiskSummary;
  auditMode: boolean;
}

export function RiskDashboard({ risk, auditMode }: RiskDashboardProps) {
  return (
    <section
      data-testid="ar-section-risk-dashboard"
      aria-labelledby="ar-s6-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk dashboard</div>
          <h2 id="ar-s6-heading" className="text-base font-semibold text-foreground">
            Five axes · Overall: {bandLabel(risk.overall)}
          </h2>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {risk.axes.map((a) => (
          <div key={a.axis} data-testid={`ar-s6-axis-${a.axis}`} className="rounded-lg border border-border/60 bg-background/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{a.label}</span>
              <span className="text-[11px] text-muted-foreground">{bandLabel(a.band)}</span>
            </div>
            <svg viewBox="0 0 200 12" className="mt-2 h-3 w-full" role="img" aria-label={`${a.label} risk: ${bandLabel(a.band)}`}>
              <rect x="0" y="2" width="200" height="8" rx="4" fill="currentColor" fillOpacity="0.08" />
              <rect
                x="0"
                y="2"
                width={(BAND_TO_PCT[a.band] / 100) * 200}
                height="8"
                rx="4"
                fill={BAND_TO_COLOR[a.band]}
              />
            </svg>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">{a.detail}</div>
              <SourceChip attribution={{ source: "actionRoadmap.risk", note: a.driver }} auditMode={auditMode} />
            </div>
          </div>
        ))}
      </div>

      {risk.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {risk.warnings.slice(0, 3).map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 flex-none rounded-full bg-muted-foreground/60" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default RiskDashboard;
