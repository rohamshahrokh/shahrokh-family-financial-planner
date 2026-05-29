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
import type { LaneKey, LaneSegment } from "@/lib/actionRoadmap/wealthBuildingLanes";
import type { EngineEvent, EngineEventCategory } from "@/lib/actionRoadmap/engineEventTimeline";

const LANE_META: Record<LaneKey, { label: string; tone: string }> = {
  property:      { label: "Property",      tone: "text-violet-700 dark:text-violet-300" },
  debt:          { label: "Debt",          tone: "text-rose-700 dark:text-rose-300" },
  cashflow:      { label: "Cashflow",      tone: "text-amber-700 dark:text-amber-300" },
  etf:           { label: "ETF",           tone: "text-blue-700 dark:text-blue-300" },
  super:         { label: "Super",         tone: "text-teal-700 dark:text-teal-300" },
  fire_progress: { label: "FIRE progress", tone: "text-emerald-700 dark:text-emerald-300" },
};

const MOBILE_LANE_ORDER: LaneKey[] = ["property", "debt", "cashflow", "etf", "super", "fire_progress"];

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

function fmtPctFromFraction(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

function monthToFractionalYear(month: string): number {
  const parts = month.split("-").map((n) => parseInt(n, 10));
  if (parts.length < 2 || !parts.every((v) => Number.isFinite(v))) return 0;
  const [y, m] = parts;
  return y! + (m! - 1) / 12;
}

export function WealthTimelineGantt(props: RoadmapSectionProps) {
  const { lanes, engineEvents, auditMode } = props;
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

      {/* Desktop Gantt (engine events) */}
      <div className="mt-4 hidden sm:block" data-testid="ar-s3-desktop">
        {engineEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
            No engine events surfaced for this run.
          </div>
        ) : (
          <DesktopGantt events={engineEvents} fromYear={fromYear} toYear={toYear} auditMode={auditMode} />
        )}
      </div>

      {/* Mobile stack (Sprint 28B lanes fallback) */}
      <div className="mt-4 space-y-3 sm:hidden" data-testid="ar-s3-mobile">
        {MOBILE_LANE_ORDER.map((lane) => (
          <MobileLane key={lane} lane={lane} segments={lanes.lanes[lane] ?? []} fireProgress={lanes.fireProgress} from={laneFrom} to={laneTo} auditMode={auditMode} />
        ))}
      </div>
    </section>
  );
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

function MobileLane({
  lane, segments, fireProgress, from, to, auditMode,
}: {
  lane: LaneKey;
  segments: LaneSegment[];
  fireProgress: RoadmapSectionProps["lanes"]["fireProgress"];
  from: number;
  to: number;
  auditMode: boolean;
}) {
  const meta = LANE_META[lane];
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid={`ar-s3-mobile-${lane}`}>
      <div className={"text-[10px] font-semibold uppercase tracking-wider " + meta.tone}>{meta.label}</div>
      {lane === "fire_progress" ? (
        <div className="mt-1 text-sm text-foreground">
          {fireProgress.filter(p => p.pctOfFire != null).length === 0
            ? <span className="text-muted-foreground">Not modelled yet</span>
            : fireProgress
                .filter((_p, i) => i % 2 === 0)
                .map((p) => `${p.year}: ${fmtPctFromFraction(p.pctOfFire)}`)
                .join(" · ")}
        </div>
      ) : segments.length === 0 ? (
        <div className="mt-1 text-sm text-muted-foreground">—</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {segments.map((s) => (
            <li key={s.sourceMilestoneId} className="text-xs text-foreground">
              <span className="font-medium">{s.startYear}–{s.endYear}</span> · {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5">
        <SourceChip attribution={{ source: "actionRoadmap.pathCompletion", note: `Years ${from}–${to}` }} auditMode={auditMode} />
      </div>
    </div>
  );
}

export default WealthTimelineGantt;
