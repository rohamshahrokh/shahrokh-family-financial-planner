/**
 * WealthTimelineGantt — Action Roadmap S3 (Sprint 28B + Sprint 29 §8).
 *
 * Sprint 29 rewrite. Desktop (≥ sm): horizontal SVG Gantt driven by the
 * Sprint 29 engine-event timeline (`roadmapContext.engineEvents`). One row
 * per category (Property / Debt / Cash / ETF / Super / Exit / FIRE). Each
 * event = a rounded-rect bar centred on its month, coloured by category.
 * Click → Radix HoverCard popover with full details.
 *
 * Mobile (< sm): preserves the Sprint 28B vertical lane stack from
 * `roadmapContext.lanes` so the mobile fallback continues to render the
 * same content without regression.
 *
 * No new dependencies.
 */
import * as React from "react";
import { CalendarRange } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { EngineEvent, EngineEventCategory } from "@/lib/actionRoadmap/engineEventTimeline";

const CATEGORY_ORDER: EngineEventCategory[] = ["property", "debt", "cash", "etf", "super", "exit", "fire"];
const CATEGORY_LABEL: Record<EngineEventCategory, string> = {
  property: "Property",
  debt:     "Debt",
  cash:     "Cash",
  etf:      "ETF",
  super:    "Super",
  exit:     "Exit",
  fire:     "FIRE",
};
const CATEGORY_FILL: Record<EngineEventCategory, string> = {
  property: "fill-violet-500",
  debt:     "fill-rose-500",
  cash:     "fill-amber-500",
  etf:      "fill-blue-500",
  super:    "fill-teal-500",
  exit:     "fill-fuchsia-500",
  fire:     "fill-emerald-500",
};

function monthToFractionalYear(month: string): number {
  const parts = month.split("-").map((n) => parseInt(n, 10));
  if (parts.length < 2 || !parts.every((v) => Number.isFinite(v))) return 0;
  const [y, m] = parts;
  return y! + (m! - 1) / 12;
}

export function WealthTimelineGantt(props: RoadmapSectionProps) {
  const { lanes, engineEvents, laneEvents, auditMode } = props;
  const { from: laneFrom, to: laneTo } = lanes.yearRange;

  // Compute year window from engine events when available; else fall back
  // to the Sprint 28B lane range (covers the empty-engine-events case).
  const eventMonths = engineEvents.map((e) => monthToFractionalYear(e.month));
  const fromYear = eventMonths.length > 0 ? Math.floor(Math.min(...eventMonths)) : laneFrom;
  const toYear = eventMonths.length > 0 ? Math.ceil(Math.max(...eventMonths)) : laneTo;

  return (
    <section
      data-testid="ar-s3-wealth-timeline"
      aria-labelledby="ar-s3-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <CalendarRange className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wealth building timeline</div>
          <h2 id="ar-s3-heading" className="text-base font-semibold text-foreground">
            {Math.min(fromYear, laneFrom)} – {Math.max(toYear, laneTo)}
          </h2>
        </div>
      </div>

      {/* Sprint 30A — 5-lane engine event list (replaces the bare lane cards). */}
      <FiveLaneList laneEvents={laneEvents} auditMode={auditMode} />

      {/* Desktop Gantt (engine events) — retained for now; 30B replaces this with graphical SVG. */}
      <div className="mt-6 hidden sm:block" data-testid="ar-s3-desktop">
        {engineEvents.length === 0 ? null : (
          <DesktopGantt events={engineEvents} fromYear={fromYear} toYear={toYear} auditMode={auditMode} />
        )}
      </div>
    </section>
  );
}

const SPRINT30A_LANE_LABEL: Record<import("@/lib/actionRoadmap/engineEventLanes").Lane, string> = {
  acquisition:        "Acquisition",
  equity_release:     "Equity release",
  debt_reduction:     "Debt reduction",
  borrowing_capacity: "Borrowing capacity",
  exit:               "Exit",
};

const SPRINT30A_LANE_ORDER: Array<import("@/lib/actionRoadmap/engineEventLanes").Lane> = [
  "acquisition", "equity_release", "debt_reduction", "borrowing_capacity", "exit",
];

function FiveLaneList({
  laneEvents, auditMode,
}: {
  laneEvents: import("@/lib/actionRoadmap/engineEventLanes").LaneEvent[];
  auditMode: boolean;
}) {
  const byLane = new Map<string, typeof laneEvents>();
  for (const e of laneEvents) {
    const arr = byLane.get(e.lane) ?? [];
    arr.push(e);
    byLane.set(e.lane, arr);
  }

  // Sprint 30A addendum A2 — hide empty lanes outside Audit Mode.
  // Audit Mode still shows hidden lanes with a "0 events" badge so the user
  // can confirm the engine honestly produced zero events (vs a UI bug).
  return (
    <div className="mt-4 space-y-3" data-testid="ar-s3-five-lanes">
      {SPRINT30A_LANE_ORDER.map((lane) => {
        const items = byLane.get(lane) ?? [];
        const isEmpty = items.length === 0;
        if (isEmpty && !auditMode) return null;
        return (
          <div
            key={lane}
            data-testid={`ar-s3-lane-${lane}`}
            data-empty={isEmpty ? "true" : "false"}
            className={
              "rounded-lg border bg-background/60 p-3 " +
              (isEmpty ? "border-dashed border-border/40 opacity-70" : "border-border/60")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {SPRINT30A_LANE_LABEL[lane]}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isEmpty ? (
                  <span data-testid={`ar-s3-lane-${lane}-zero-badge`} className="rounded-full bg-muted px-2 py-0.5 ring-1 ring-border">
                    0 events
                  </span>
                ) : (
                  `${items.length} event${items.length === 1 ? "" : "s"}`
                )}
              </div>
            </div>
            {isEmpty ? (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Engine produced no events for this lane on the current path. Hidden outside Audit Mode.
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {items.map((e) => (
                  <LaneEventRow key={e.id} event={e} auditMode={auditMode} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LaneEventRow({
  event, auditMode,
}: {
  event: import("@/lib/actionRoadmap/engineEventLanes").LaneEvent;
  auditMode: boolean;
}) {
  const sourceTone = event.source === "engine"
    ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25"
    : "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25";

  return (
    <li className="rounded-md border border-border/40 bg-card/60 p-2 text-xs" data-testid={`ar-s3-event-row-${event.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{event.month}</span>
        <span className="font-medium text-foreground">{event.action}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${sourceTone}`}>
          {event.source}
        </span>
      </div>
      <div className="mt-1 text-muted-foreground">{event.whyItExists}</div>
      <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
        <Impact label="NW Δ" value={fmtMoneySigned(event.impact.netWorthDelta)} />
        <Impact label="FIRE Δ months" value={event.impact.fireImpactMonths == null ? "—" : `${event.impact.fireImpactMonths}`} />
        <Impact label="PI Δ /mo" value={fmtMoneySigned(event.impact.passiveIncomeDelta)} />
        <Impact label="Risk" value={event.impact.riskDirection ?? "—"} />
      </div>
      {auditMode && event.source === "derived" && event.derivationFormula && (
        <div className="mt-1 rounded border border-dashed border-border/50 bg-background/40 p-1.5 text-[10px] text-muted-foreground">
          Derived: {event.derivationFormula}
        </div>
      )}
      {auditMode && (
        <div className="mt-1 text-[10px] text-muted-foreground/80">
          sourceDeltaId: <span className="font-mono">{event.sourceDeltaId ?? "—"}</span>
          {event.rawEventType ? <> · raw: <span className="font-mono">{event.rawEventType}</span></> : null}
        </div>
      )}
    </li>
  );
}

function Impact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function fmtMoneySigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
}

function DesktopGantt({
  events, fromYear, toYear, auditMode,
}: {
  events: EngineEvent[];
  fromYear: number;
  toYear: number;
  auditMode: boolean;
}) {
  const rangeYears = Math.max(1, toYear - fromYear + 1);
  const width = 880;
  const rowHeight = 36;
  const labelCol = 110;
  const padRight = 24;
  const plotWidth = width - labelCol - padRight;
  const rows = CATEGORY_ORDER.length;
  const height = rows * rowHeight + 24;

  const yearToX = (y: number) => labelCol + ((y - fromYear) / rangeYears) * plotWidth;

  // Group events by category for row positioning
  const byCategory = new Map<EngineEventCategory, EngineEvent[]>();
  for (const e of events) {
    const arr = byCategory.get(e.category) ?? [];
    arr.push(e);
    byCategory.set(e.category, arr);
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Wealth building Gantt">
        {/* Year gridlines + tick labels */}
        {Array.from({ length: rangeYears + 1 }, (_, i) => fromYear + i).map((y) => (
          <g key={y}>
            <line x1={yearToX(y)} y1={0} x2={yearToX(y)} y2={height - 16} stroke="currentColor" strokeOpacity="0.06" />
            <text x={yearToX(y)} y={height - 2} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
              {y}
            </text>
          </g>
        ))}
        {CATEGORY_ORDER.map((cat, i) => {
          const y = i * rowHeight + rowHeight / 2;
          const rowEvents = byCategory.get(cat) ?? [];
          return (
            <g key={cat}>
              <text x={labelCol - 10} y={y + 4} textAnchor="end" fontSize="11" className="fill-foreground" fontWeight="600">
                {CATEGORY_LABEL[cat]}
              </text>
              <line x1={labelCol} y1={y + 12} x2={width - padRight} y2={y + 12} stroke="currentColor" strokeOpacity="0.05" />
              {rowEvents.length === 0 ? (
                <text x={labelCol + 4} y={y + 4} fontSize="10" className="fill-muted-foreground">—</text>
              ) : rowEvents.map((e) => (
                <EventBar key={e.id} event={e} yearToX={yearToX} y={y} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        <SourceChip
          attribution={{ source: "scenarioV2.events", note: `${events.length} engine event(s) across ${rangeYears} year(s)` }}
          auditMode={auditMode}
        />
      </div>
    </div>
  );
}

function EventBar({
  event, yearToX, y,
}: {
  event: EngineEvent;
  yearToX: (y: number) => number;
  y: number;
}) {
  const xCenter = yearToX(monthToFractionalYear(event.month));
  const widthBar = 18;
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <g
          data-testid={`ar-s3-event-${event.id}`}
          className="cursor-pointer"
        >
          <rect
            x={xCenter - widthBar / 2}
            y={y - 8}
            width={widthBar}
            height={16}
            rx={4}
            className={CATEGORY_FILL[event.category]}
            opacity={0.9}
          />
        </g>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72" data-testid={`ar-s3-event-popover-${event.id}`}>
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABEL[event.category]} · {event.month}
          </div>
          <div className="text-sm font-semibold text-foreground">{event.action}</div>
          <p className="text-xs text-muted-foreground">{event.expectedOutcome}</p>
          {event.netWorthImpact != null && (
            <div className="text-xs text-foreground">
              NW impact: ${Math.round(event.netWorthImpact).toLocaleString("en-AU")}
            </div>
          )}
          {event.riskImpact && (
            <div className="text-xs text-foreground">Risk: {event.riskImpact}</div>
          )}
          <div className="text-[10px] text-muted-foreground">Source: {event.source} ({event.sourceEventType})</div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default WealthTimelineGantt;
