/**
 * WealthTimelineGantt — Action Roadmap S3 (Sprint 28B).
 *
 * Hand-rolled Tailwind + SVG Gantt. Desktop (≥ sm): horizontal Gantt with
 * 6 lanes (Property / Debt / Cashflow / ETF / Super / FIRE Progress).
 * Mobile (< sm): vertical lane stack with compact segment rows.
 *
 * No new dependencies. Segment colours come from Tailwind utility classes
 * (not from a chart lib). The FIRE Progress lane is a sparkline of P50
 * progress over the same year axis, plus textual markers ("27% → 39% → 55%").
 *
 * Honesty: an empty lane renders the lane label with "—" (muted). When
 * FIRE Progress points are all null we render "Not modelled yet" instead
 * of the sparkline.
 */
import * as React from "react";
import { CalendarRange } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { LaneKey, LaneSegment } from "@/lib/actionRoadmap/wealthBuildingLanes";

const LANE_META: Record<LaneKey, { label: string; tone: string; bar: string }> = {
  property:      { label: "Property",      tone: "text-violet-700 dark:text-violet-300",   bar: "fill-violet-500" },
  debt:          { label: "Debt",          tone: "text-rose-700 dark:text-rose-300",       bar: "fill-rose-500" },
  cashflow:      { label: "Cashflow",      tone: "text-amber-700 dark:text-amber-300",     bar: "fill-amber-500" },
  etf:           { label: "ETF",           tone: "text-blue-700 dark:text-blue-300",       bar: "fill-blue-500" },
  super:         { label: "Super",         tone: "text-teal-700 dark:text-teal-300",       bar: "fill-teal-500" },
  fire_progress: { label: "FIRE progress", tone: "text-emerald-700 dark:text-emerald-300", bar: "fill-emerald-500" },
};

const LANE_ORDER: LaneKey[] = ["property", "debt", "cashflow", "etf", "super", "fire_progress"];

function fmtPctFromFraction(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

export function WealthTimelineGantt(props: RoadmapSectionProps) {
  const { lanes, auditMode } = props;
  const { from, to } = lanes.yearRange;
  const years = Math.max(1, to - from);

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
            {from} – {to}
          </h2>
        </div>
      </div>

      {/* Desktop Gantt */}
      <div className="mt-4 hidden sm:block" data-testid="ar-s3-desktop">
        <DesktopGantt lanes={lanes} years={years} from={from} auditMode={auditMode} />
      </div>

      {/* Mobile stack */}
      <div className="mt-4 space-y-3 sm:hidden" data-testid="ar-s3-mobile">
        {LANE_ORDER.map((lane) => (
          <MobileLane key={lane} lane={lane} segments={lanes.lanes[lane] ?? []} fireProgress={lanes.fireProgress} from={from} to={to} auditMode={auditMode} />
        ))}
      </div>
    </section>
  );
}

function DesktopGantt({
  lanes, years, from, auditMode,
}: {
  lanes: RoadmapSectionProps["lanes"];
  years: number;
  from: number;
  auditMode: boolean;
}) {
  // SVG layout
  const width = 800;
  const rowHeight = 40;
  const labelCol = 110;
  const padRight = 20;
  const plotWidth = width - labelCol - padRight;
  const rows = LANE_ORDER.length;
  const height = rows * rowHeight + 30;

  const yearToX = (y: number) => labelCol + ((y - from) / years) * plotWidth;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Wealth building timeline">
        {/* X-axis ticks: year labels at every year */}
        {Array.from({ length: years + 1 }, (_, i) => from + i).map((y) => (
          <g key={y}>
            <line x1={yearToX(y)} y1={0} x2={yearToX(y)} y2={height - 20} stroke="currentColor" strokeOpacity="0.06" />
            <text x={yearToX(y)} y={height - 4} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
              {y}
            </text>
          </g>
        ))}
        {LANE_ORDER.map((lane, i) => {
          const y = i * rowHeight + rowHeight / 2;
          const meta = LANE_META[lane];
          if (lane === "fire_progress") {
            return (
              <g key={lane}>
                <text x={labelCol - 8} y={y + 4} textAnchor="end" fontSize="11" className="fill-foreground" fontWeight="600">{meta.label}</text>
                <FireProgressSparkline
                  fireProgress={lanes.fireProgress}
                  yearToX={yearToX}
                  y={y}
                  className={meta.bar}
                />
              </g>
            );
          }
          const segs = lanes.lanes[lane] ?? [];
          return (
            <g key={lane}>
              <text x={labelCol - 8} y={y + 4} textAnchor="end" fontSize="11" className="fill-foreground" fontWeight="600">{meta.label}</text>
              {segs.length === 0 ? (
                <text x={labelCol + 4} y={y + 4} fontSize="10" className="fill-muted-foreground">—</text>
              ) : segs.map((s) => (
                <SegmentBar key={s.sourceMilestoneId} segment={s} yearToX={yearToX} y={y} className={meta.bar} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-end">
        <SourceChip
          attribution={{ source: "actionRoadmap.pathCompletion", note: "Lanes derived from roadmap milestones" }}
          auditMode={auditMode}
        />
      </div>
    </div>
  );
}

function SegmentBar({
  segment, yearToX, y, className,
}: {
  segment: LaneSegment;
  yearToX: (y: number) => number;
  y: number;
  className: string;
}) {
  const x1 = yearToX(segment.startYear);
  const x2 = yearToX(segment.endYear);
  return (
    <g>
      <rect
        x={x1}
        y={y - 8}
        width={Math.max(2, x2 - x1)}
        height={16}
        rx={4}
        className={className}
        opacity={0.85}
      >
        <title>{segment.label} ({segment.startYear}–{segment.endYear})</title>
      </rect>
    </g>
  );
}

function FireProgressSparkline({
  fireProgress, yearToX, y, className,
}: {
  fireProgress: RoadmapSectionProps["lanes"]["fireProgress"];
  yearToX: (y: number) => number;
  y: number;
  className: string;
}) {
  const points = fireProgress
    .filter((p) => p.pctOfFire != null && Number.isFinite(p.pctOfFire))
    .map((p) => ({ x: yearToX(p.year), pct: p.pctOfFire as number }));
  if (points.length === 0) {
    return <text x={yearToX(fireProgress[0]?.year ?? 0) + 4} y={y + 4} fontSize="10" className="fill-muted-foreground">Not modelled yet</text>;
  }
  // Plot bar heights scaled to 14px max within row
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${y - 7 + (1 - p.pct) * 14}`)
    .join(" ");
  return (
    <g>
      <path d={path} stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" fill="none" />
      {points.map((p, i) => (
        i % 2 === 0 ? (
          <text key={i} x={p.x} y={y - 10} textAnchor="middle" fontSize="9" className="fill-foreground">
            {Math.round(p.pct * 100)}%
          </text>
        ) : null
      ))}
      {/* The currentColor stroke above + filled dots tinted via Tailwind for accent. */}
      {points.map((p, i) => (
        <circle key={`d-${i}`} cx={p.x} cy={y - 7 + (1 - p.pct) * 14} r={2} className={className} />
      ))}
    </g>
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
