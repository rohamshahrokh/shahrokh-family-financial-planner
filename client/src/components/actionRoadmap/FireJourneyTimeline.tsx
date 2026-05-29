/**
 * FireJourneyTimeline — Action Roadmap S2 (Sprint 28).
 *
 * Hand-rolled Tailwind + inline SVG timeline. No new npm dependencies. On
 * desktop renders as a horizontal connector with circular nodes; on mobile
 * (<640px) renders as a vertical card stack.
 *
 * Milestones come from `buildActionRoadmap()` — we never invent dates or
 * statuses. When the roadmap is null or has no milestones, render the
 * literal "Not modelled yet" empty state.
 */
import * as React from "react";
import { Flag, CheckCircle2, Circle } from "lucide-react";
import type { ActionRoadmap, RoadmapMilestone } from "@/lib/actionRoadmap/types";

export interface FireJourneyTimelineProps {
  roadmap: ActionRoadmap | null;
}

function statusFill(status: RoadmapMilestone["status"]): string {
  switch (status) {
    case "completed": return "#10b981"; // emerald-500
    case "next":      return "#f59e0b"; // amber-500
    case "upcoming":  return "#3b82f6"; // blue-500
    case "fire":      return "#8b5cf6"; // violet-500
  }
}

function statusBadgeClasses(status: RoadmapMilestone["status"]): string {
  switch (status) {
    case "completed": return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25";
    case "next":      return "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25";
    case "upcoming":  return "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25";
    case "fire":      return "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25";
  }
}

function statusLabel(status: RoadmapMilestone["status"]): string {
  return status === "fire" ? "FIRE" : status.charAt(0).toUpperCase() + status.slice(1);
}

function statusIcon(status: RoadmapMilestone["status"]) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  if (status === "fire") return <Flag className="h-4 w-4" aria-hidden />;
  return <Circle className="h-4 w-4" aria-hidden />;
}

export function FireJourneyTimeline({ roadmap }: FireJourneyTimelineProps) {
  const milestones = roadmap?.milestones ?? [];

  return (
    <section
      data-testid="ar-section-fire-journey"
      aria-labelledby="ar-s2-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">FIRE journey</div>
        <h2 id="ar-s2-heading" className="text-base font-semibold text-foreground">Milestones</h2>
      </div>

      {milestones.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-s2-empty">
          Not modelled yet.
        </p>
      ) : (
        <>
          {/* Mobile (vertical card stack, < sm) */}
          <ol className="mt-4 space-y-2 sm:hidden" data-testid="ar-s2-mobile">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
                <span className="mt-0.5" style={{ color: statusFill(m.status) }}>{statusIcon(m.status)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{m.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusBadgeClasses(m.status)}`}>
                      {statusLabel(m.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.month}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{m.effect}</div>
                </div>
              </li>
            ))}
          </ol>

          {/* Desktop (horizontal SVG, sm+) */}
          <div className="mt-4 hidden sm:block" data-testid="ar-s2-desktop">
            <DesktopTimelineSvg milestones={milestones} />
          </div>
        </>
      )}
    </section>
  );
}

/** Horizontal connector SVG with circular nodes — hand-rolled, no chart deps. */
function DesktopTimelineSvg({ milestones }: { milestones: RoadmapMilestone[] }) {
  // Layout: a single horizontal line at y = LINE_Y, with a circle per
  // milestone evenly spaced across the viewBox. Labels sit above each node.
  const N = milestones.length;
  const width = 800;
  const height = 140;
  const padX = 40;
  const lineY = 80;
  const radius = 12;
  const stepX = N === 1 ? 0 : (width - 2 * padX) / (N - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="FIRE journey timeline">
      {/* Connector line */}
      <line x1={padX} y1={lineY} x2={width - padX} y2={lineY} stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      {milestones.map((m, i) => {
        const cx = N === 1 ? width / 2 : padX + i * stepX;
        const labelAbove = i % 2 === 0;
        const labelY = labelAbove ? lineY - 24 : lineY + 32;
        return (
          <g key={m.id}>
            <circle cx={cx} cy={lineY} r={radius} fill={statusFill(m.status)} stroke="white" strokeWidth="2" />
            <text
              x={cx}
              y={labelY}
              textAnchor="middle"
              className="fill-foreground"
              fontSize="11"
              fontWeight="600"
            >
              {m.label.length > 22 ? m.label.slice(0, 20) + "…" : m.label}
            </text>
            <text
              x={cx}
              y={labelY + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {m.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default FireJourneyTimeline;
