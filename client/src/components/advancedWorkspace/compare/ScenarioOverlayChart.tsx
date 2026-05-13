/**
 * B2 — Scenario Overlay Chart
 *
 * Multiple scenarios on one trajectory chart. Each scenario shows:
 *  - its P50 median line at full opacity
 *  - its P10-P90 band at low opacity (toggleable)
 *
 * Hover surfaces a snapshot of all selected scenarios at that month.
 * Show/hide and opacity controls per scenario.
 *
 * Engine inputs only — netWorthFan from each ExtendedScenarioResult.
 */
import { useMemo, useState, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { FanPoint } from "@/lib/scenarioV2/types";
import { LABEL_CLS, MICRO_CLS, NUM_CLS, PANEL_HEADING_CLS } from "../workspaceTokens";
import { cn } from "@/lib/utils";

const OVERLAY_PALETTE = [
  { line: "rgb(79 70 229)",  band: "rgb(99 102 241 / 0.14)" },   // indigo
  { line: "rgb(16 185 129)", band: "rgb(16 185 129 / 0.14)" },   // emerald
  { line: "rgb(244 114 22)", band: "rgb(244 114 22 / 0.14)" },   // orange
  { line: "rgb(244 63 94)",  band: "rgb(244 63 94 / 0.14)" },    // rose
  { line: "rgb(20 184 166)", band: "rgb(20 184 166 / 0.14)" },   // teal
  { line: "rgb(168 85 247)", band: "rgb(168 85 247 / 0.14)" },   // violet
  { line: "rgb(234 179 8)",  band: "rgb(234 179 8 / 0.14)" },    // yellow
  { line: "rgb(14 165 233)", band: "rgb(14 165 233 / 0.14)" },   // sky
];

export interface ScenarioOverlayChartProps {
  candidates: RankedCandidate[];
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
  };
  height?: number;
  hidden?: boolean;
}

interface Series {
  id: string;
  label: string;
  fan: FanPoint[];
  color: { line: string; band: string };
  visible: boolean;
  showBand: boolean;
}

export function ScenarioOverlayChart({
  candidates, fmt, height = 280, hidden = false,
}: ScenarioOverlayChartProps) {
  const [seriesState, setSeriesState] = useState<Record<string, { visible: boolean; showBand: boolean }>>(() => {
    const init: Record<string, { visible: boolean; showBand: boolean }> = {};
    candidates.forEach((c, i) => {
      init[c.id] = { visible: i < 4, showBand: i === 0 };
    });
    return init;
  });
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const series: Series[] = useMemo(
    () =>
      candidates.map((c, i) => {
        const st = seriesState[c.id] ?? { visible: i < 4, showBand: i === 0 };
        return {
          id: c.id,
          label: c.label,
          fan: c.result.netWorthFan,
          color: OVERLAY_PALETTE[i % OVERLAY_PALETTE.length],
          visible: st.visible,
          showBand: st.showBand,
        };
      }),
    [candidates, seriesState],
  );

  const visibleSeries = series.filter((s) => s.visible);

  // Geometry: shared time axis = the longest fan among visible series.
  const maxMonths = useMemo(() => {
    let m = 0;
    for (const s of visibleSeries) m = Math.max(m, s.fan.length);
    return m;
  }, [visibleSeries]);

  // Y range covers all visible bands (P10..P90 across all series).
  const yRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const s of visibleSeries) {
      for (const pt of s.fan) {
        if (pt.p10 < min) min = pt.p10;
        if (pt.p90 > max) max = pt.p90;
      }
    }
    if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
    if (min === max) return { min: min - 1, max: max + 1 };
    // Pad 4% top/bottom
    const pad = (max - min) * 0.04;
    return { min: min - pad, max: max + pad };
  }, [visibleSeries]);

  const W = 100; // viewBox width in arbitrary units; SVG scales responsively
  const H = height;
  const PAD_L = 6, PAD_R = 2, PAD_T = 4, PAD_B = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xAt = (i: number) => maxMonths <= 1 ? PAD_L : PAD_L + (i / (maxMonths - 1)) * innerW;
  const yAt = (v: number) => {
    if (yRange.max === yRange.min) return PAD_T + innerH / 2;
    return PAD_T + (1 - (v - yRange.min) / (yRange.max - yRange.min)) * innerH;
  };

  function pathFor(values: number[]): string {
    return values
      .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
      .join(" ");
  }

  function bandFor(fan: FanPoint[]): string {
    // P10 line forward, P90 line backward — closed polygon
    const top = fan.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(p.p90).toFixed(2)}`).join(" ");
    const bot = fan
      .slice()
      .reverse()
      .map((p, i) => {
        const realIdx = fan.length - 1 - i;
        return `L${xAt(realIdx).toFixed(2)},${yAt(p.p10).toFixed(2)}`;
      })
      .join(" ");
    return `${top} ${bot} Z`;
  }

  function toggleVisibility(id: string) {
    setSeriesState((s) => ({ ...s, [id]: { ...s[id], visible: !s[id]?.visible } }));
  }

  function toggleBand(id: string) {
    setSeriesState((s) => ({ ...s, [id]: { ...s[id], showBand: !s[id]?.showBand } }));
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || maxMonths <= 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const xUnits = xRatio * W;
    const idx = Math.round(((xUnits - PAD_L) / innerW) * (maxMonths - 1));
    if (idx >= 0 && idx < maxMonths) setHoverMonth(idx);
  }

  function onLeave() {
    setHoverMonth(null);
  }

  // Y-axis tick marks (3 ticks: min, mid, max)
  const ticks = [yRange.min, (yRange.min + yRange.max) / 2, yRange.max];

  return (
    <div className="space-y-2" data-testid="scenario-overlay-chart">
      <div className="flex items-center justify-between">
        <div>
          <h3 className={PANEL_HEADING_CLS}>Trajectory overlay</h3>
          <p className={MICRO_CLS}>
            {visibleSeries.length} of {series.length} scenarios visible · P50 lines, optional P10-P90 bands
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-md border border-border bg-card/95 dark:bg-card/70 p-2 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          {/* Y-axis gridlines */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={PAD_L} x2={W - PAD_R}
              y1={yAt(t)} y2={yAt(t)}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="0.15"
            />
          ))}

          {/* Bands (drawn first, under lines) */}
          {visibleSeries.map((s) =>
            s.showBand && s.fan.length > 0 ? (
              <path key={`band-${s.id}`} d={bandFor(s.fan)} fill={s.color.band} />
            ) : null,
          )}

          {/* P50 lines */}
          {visibleSeries.map((s) =>
            s.fan.length > 0 ? (
              <path
                key={`line-${s.id}`}
                d={pathFor(s.fan.map((p) => p.p50))}
                fill="none"
                stroke={s.color.line}
                strokeWidth="0.4"
                strokeLinejoin="round"
              />
            ) : null,
          )}

          {/* Hover indicator */}
          {hoverMonth != null && (
            <line
              x1={xAt(hoverMonth)} x2={xAt(hoverMonth)}
              y1={PAD_T} y2={H - PAD_B}
              stroke="currentColor"
              strokeOpacity="0.45"
              strokeWidth="0.2"
              strokeDasharray="0.5 0.5"
            />
          )}

          {/* Hover dots on each series */}
          {hoverMonth != null && visibleSeries.map((s) => {
            const pt = s.fan[hoverMonth];
            if (!pt) return null;
            return (
              <circle key={`dot-${s.id}`}
                cx={xAt(hoverMonth)} cy={yAt(pt.p50)}
                r="0.7"
                fill={s.color.line}
              />
            );
          })}
        </svg>

        {/* Y-axis labels (outside SVG so they don't scale) */}
        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5 px-0.5">
          <span className={NUM_CLS}>Month 0</span>
          <span className={NUM_CLS}>Month {Math.max(0, maxMonths - 1)}</span>
        </div>
      </div>

      {/* Hover snapshot */}
      {hoverMonth != null && visibleSeries.length > 0 && (
        <div className="border border-border rounded-md p-2 bg-muted/30">
          <div className={cn(LABEL_CLS, "mb-1")}>Snapshot at month {hoverMonth}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {visibleSeries.map((s) => {
              const pt = s.fan[hoverMonth];
              if (!pt) return null;
              return (
                <div key={s.id} className="flex items-center justify-between text-[11px] gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: s.color.line }} />
                    <span className="truncate">{s.label}</span>
                  </div>
                  <span className={cn(NUM_CLS, "shrink-0")}>
                    {hidden ? "•••" : fmt.fmt$M(pt.p50)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend / controls */}
      <div className="space-y-1">
        <div className={LABEL_CLS}>Series</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {series.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-2 text-[11px] px-1.5 py-1 rounded border border-border/60",
                s.visible ? "bg-card" : "bg-muted/30 opacity-60",
              )}
            >
              <button
                onClick={() => toggleVisibility(s.id)}
                className="shrink-0"
                aria-label={s.visible ? "Hide series" : "Show series"}
              >
                {s.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
              <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: s.color.line }} />
              <span className="truncate flex-1">{s.label}</span>
              <button
                onClick={() => toggleBand(s.id)}
                disabled={!s.visible}
                className={cn(
                  "text-[9px] uppercase tracking-wide px-1 rounded border transition-colors",
                  s.showBand
                    ? "bg-foreground/85 text-background border-foreground/85"
                    : "border-border text-muted-foreground hover:text-foreground",
                  !s.visible && "opacity-40 cursor-not-allowed",
                )}
              >
                Band
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
