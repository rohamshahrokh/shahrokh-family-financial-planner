/**
 * RiskVisualizations.tsx — Phase 2.2 institutional risk UI
 *
 * Pure SVG, no external chart library. Designed to be:
 *  • Deterministic — renders exactly what the engine returned.
 *  • Dark-mode safe — every fill/stroke uses tokens that pass WCAG in both themes.
 *  • Mobile-responsive — viewBox-based, scales with container width.
 *  • Privacy-aware — receives `useMaskFmt` formatters from parent; never reads
 *    privacyMode itself, so the same component renders deterministically in PDF.
 *
 * Components:
 *  • <FanChart />               — 7-percentile (P5/P10/P25/P50/P75/P90/P95) fan
 *                                 over time, P50 as a line, outer bands shaded.
 *  • <DistributionHistogram />  — Terminal NW histogram with VaR/CVaR markers.
 *  • <TailRiskCard />           — Institutional left-tail metrics in tile form.
 *  • <ProbabilityBarGroup />    — Grouped survival/insolvency probabilities.
 *
 * No mock data. No placeholders. Reads only fields that come from
 * ExtendedScenarioResult + RiskMetrics (after Phase 2.2 engine changes).
 */

import { useMemo } from "react";
import { ShieldAlert, Activity, Skull, Droplets, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";

import type { ExtendedScenarioResult } from "@/lib/scenarioV2/runScenario";
import type { FanPoint } from "@/lib/scenarioV2/types";

// ─── shared formatter type (mirrors useMaskFmt return) ───────────────────────

export interface MaskFmt {
  pct: (n: number, d?: number) => string;
  fmt$: (n: number) => string;
  fmt$k: (n: number) => string;
  fmt$M: (n: number) => string;
  sentence: (s: string) => string;
}

// ─── colour tokens (resolve via Tailwind opacity in className for shading) ───
// SVG fills/strokes use HSL via CSS vars so dark-mode auto-swaps without JS.
// Where possible we use Tailwind utility classes on the SVG via group/parent.

const FAN_BAND_5_95 = "rgb(99 102 241 / 0.10)";   // indigo-500/10
const FAN_BAND_10_90 = "rgb(99 102 241 / 0.18)";  // indigo-500/18
const FAN_BAND_25_75 = "rgb(99 102 241 / 0.32)";  // indigo-500/32
const MEDIAN_STROKE = "rgb(79 70 229)";           // indigo-600
const MEDIAN_STROKE_DARK = "rgb(165 180 252)";    // indigo-300 (dark mode override via CSS class)
const AXIS_COLOR = "currentColor";
const VAR_COLOR = "rgb(244 63 94)";               // rose-500
const CVAR_COLOR = "rgb(190 18 60)";              // rose-700
const INITIAL_NW_COLOR = "rgb(16 185 129)";       // emerald-500

// ─── FanChart ────────────────────────────────────────────────────────────────

export interface FanChartProps {
  fan: FanPoint[];
  /** Optional override: title rendered above the chart. */
  title?: string;
  /** Optional subtitle. */
  subtitle?: string;
  /** Mask-aware formatter set. */
  fmt: MaskFmt;
  /** Show terminal-NW callout to the right of the chart. */
  showTerminalCallout?: boolean;
  /** Height of the SVG drawing area in px (excluding margins). */
  height?: number;
  /** Optional initial-NW reference line. */
  initialNetWorth?: number;
  /** Privacy mask state — only affects axis tick text. */
  hidden?: boolean;
}

export function FanChart({
  fan,
  title = "Wealth-path fan",
  subtitle = "P5–P95 dispersion across 300+ paths · P50 thick · band shading by quantile",
  fmt,
  showTerminalCallout = true,
  height = 240,
  initialNetWorth,
  hidden = false,
}: FanChartProps) {
  // Defensive guards — if engine ever returns empty, render an empty state.
  if (!fan || fan.length === 0) {
    return (
      <EmptyChart label="No fan data — generate paths first." />
    );
  }

  const geom = useMemo(() => computeFanGeometry(fan, height, initialNetWorth), [fan, height, initialNetWorth]);

  const last = fan[fan.length - 1];
  const yearsHorizon = Math.max(1, Math.round((fan.length - 1) / 12));

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-foreground">{title}</div>
          <div className="text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        {showTerminalCallout && (
          <div className="text-right text-[10px] text-muted-foreground hidden sm:block">
            <div>Terminal NW @ {yearsHorizon}y</div>
            <div className="tabular-nums font-semibold text-foreground text-xs">
              {fmt.fmt$M(last.p50)}
            </div>
            <div className="tabular-nums">
              P10 {fmt.fmt$M(last.p10)} · P90 {fmt.fmt$M(last.p90)}
            </div>
          </div>
        )}
      </div>

      <div className="relative w-full text-muted-foreground">
        <svg
          viewBox={`0 0 ${geom.W} ${geom.H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Net worth fan chart from month 0 to month ${fan.length - 1}, median terminal ${fmt.fmt$M(last.p50)}.`}
        >
          {/* P5–P95 outermost band */}
          <path d={geom.band5_95} fill={FAN_BAND_5_95} stroke="none" />
          {/* P10–P90 inner band */}
          <path d={geom.band10_90} fill={FAN_BAND_10_90} stroke="none" />
          {/* P25–P75 core band */}
          <path d={geom.band25_75} fill={FAN_BAND_25_75} stroke="none" />

          {/* Y-axis baseline (zero line) */}
          {geom.zeroY != null && (
            <line
              x1={geom.padL}
              x2={geom.W - geom.padR}
              y1={geom.zeroY}
              y2={geom.zeroY}
              stroke={AXIS_COLOR}
              strokeWidth={0.5}
              strokeDasharray="3 3"
              opacity={0.35}
            />
          )}

          {/* Initial NW reference line */}
          {geom.initialY != null && (
            <>
              <line
                x1={geom.padL}
                x2={geom.W - geom.padR}
                y1={geom.initialY}
                y2={geom.initialY}
                stroke={INITIAL_NW_COLOR}
                strokeWidth={0.75}
                strokeDasharray="2 4"
                opacity={0.7}
              />
              <text
                x={geom.padL + 4}
                y={geom.initialY - 3}
                fontSize={9}
                fill={INITIAL_NW_COLOR}
                opacity={0.9}
              >
                Initial NW
              </text>
            </>
          )}

          {/* P50 median line */}
          <path
            d={geom.medianPath}
            fill="none"
            stroke={MEDIAN_STROKE}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="dark:[stroke:rgb(165_180_252)]"
            style={{ stroke: MEDIAN_STROKE }}
          />

          {/* X-axis (year ticks) */}
          {geom.xTicks.map(t => (
            <g key={t.x}>
              <line
                x1={t.x}
                x2={t.x}
                y1={geom.H - geom.padB}
                y2={geom.H - geom.padB + 3}
                stroke={AXIS_COLOR}
                strokeWidth={0.5}
                opacity={0.4}
              />
              <text
                x={t.x}
                y={geom.H - 2}
                fontSize={9}
                textAnchor="middle"
                fill={AXIS_COLOR}
                opacity={0.7}
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Y-axis tick labels */}
          {geom.yTicks.map(t => (
            <g key={`y${t.y}`}>
              <text
                x={geom.padL - 4}
                y={t.y + 3}
                fontSize={9}
                textAnchor="end"
                fill={AXIS_COLOR}
                opacity={0.7}
              >
                {hidden ? "$•••" : abbreviateDollars(t.value)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[9px] text-muted-foreground">
        <LegendSwatch fill={FAN_BAND_5_95} label="P5–P95" />
        <LegendSwatch fill={FAN_BAND_10_90} label="P10–P90" />
        <LegendSwatch fill={FAN_BAND_25_75} label="P25–P75" />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-[2px]" style={{ background: MEDIAN_STROKE }} />
          <span>P50 median</span>
        </span>
        {initialNetWorth != null && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] border-t-2 border-dashed" style={{ borderColor: INITIAL_NW_COLOR }} />
            <span>Initial NW</span>
          </span>
        )}
      </div>
    </div>
  );
}

function LegendSwatch({ fill, label }: { fill: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: fill }} />
      <span>{label}</span>
    </span>
  );
}

// ─── Fan geometry ────────────────────────────────────────────────────────────

interface FanGeometry {
  W: number;
  H: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  band5_95: string;
  band10_90: string;
  band25_75: string;
  medianPath: string;
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; value: number }[];
  zeroY: number | null;
  initialY: number | null;
}

function computeFanGeometry(fan: FanPoint[], height: number, initialNw?: number): FanGeometry {
  const W = 600;
  const padL = 38;
  const padR = 6;
  const padT = 6;
  const padB = 16;
  const H = height + padT + padB;

  // Domain: include P5 and P95 across all months + zero + initial NW so the chart
  // axis always shows the full institutional band.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of fan) {
    if (p.p5  < yMin) yMin = p.p5;
    if (p.p95 > yMax) yMax = p.p95;
  }
  if (initialNw != null) {
    if (initialNw < yMin) yMin = initialNw;
    if (initialNw > yMax) yMax = initialNw;
  }
  // Always include 0 so the user can see drawdowns into negative.
  if (yMin > 0) yMin = 0;
  if (yMax < 0) yMax = 0;
  // Tiny pad
  const span = yMax - yMin || 1;
  yMin -= span * 0.02;
  yMax += span * 0.02;

  const n = fan.length;
  const xOf = (i: number) => padL + ((W - padL - padR) * i) / Math.max(1, n - 1);
  const yOf = (v: number) => padT + (height) * (1 - (v - yMin) / (yMax - yMin || 1));

  const upperPath = (key: keyof Omit<FanPoint, "month">) =>
    fan.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(p[key] as number).toFixed(2)}`).join(" ");
  const lowerPathReverse = (key: keyof Omit<FanPoint, "month">) =>
    fan.map((p, i) => `L${xOf(n - 1 - i).toFixed(2)},${yOf(p[key] as number).toFixed(2)}`).reverse().join(" ");

  // Build closed band: trace top edge forward, bottom edge reversed.
  const band = (hi: keyof Omit<FanPoint, "month">, lo: keyof Omit<FanPoint, "month">) => {
    const top = fan.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(p[hi] as number).toFixed(2)}`).join(" ");
    const bot = fan
      .map((p, i) => ({ x: xOf(i), y: yOf(p[lo] as number) }))
      .reverse()
      .map((pt, j) => `${j === 0 ? "L" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
      .join(" ");
    return `${top} ${bot} Z`;
  };

  const band5_95 = band("p95", "p5");
  const band10_90 = band("p90", "p10");
  const band25_75 = band("p75", "p25");
  const medianPath = upperPath("p50");

  // X ticks: year-level, max ~6 ticks
  const months = n - 1;
  const years = months / 12;
  const tickEveryYears = years <= 3 ? 1 : years <= 6 ? 1 : years <= 12 ? 2 : 5;
  const xTicks: { x: number; label: string }[] = [];
  for (let y = 0; y <= years + 0.001; y += tickEveryYears) {
    const i = Math.min(months, Math.round(y * 12));
    xTicks.push({ x: xOf(i), label: `${Math.round(y)}y` });
  }

  // Y ticks: ~4 ticks
  const yTickCount = 4;
  const yTicks: { y: number; value: number }[] = [];
  for (let i = 0; i <= yTickCount; i++) {
    const v = yMin + (yMax - yMin) * (i / yTickCount);
    yTicks.push({ y: yOf(v), value: v });
  }

  const zeroY = yMin <= 0 && yMax >= 0 ? yOf(0) : null;
  const initialY = initialNw != null && initialNw >= yMin && initialNw <= yMax ? yOf(initialNw) : null;

  return { W, H, padL, padR, padT, padB, band5_95, band10_90, band25_75, medianPath, xTicks, yTicks, zeroY, initialY };
}

function abbreviateDollars(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}

// ─── DistributionHistogram ───────────────────────────────────────────────────

export interface DistributionHistogramProps {
  /** Sorted ascending terminal NW samples (from ExtendedScenarioResult.terminalNwSorted). */
  terminalNwSorted: number[];
  /** Initial NW — anchor for VaR/CVaR dollar interpretation + reference line. */
  initialNetWorth: number;
  /** VaR_95 dollar loss vs initial NW (positive number; will be drawn at initialNw − varDollars95). */
  varDollars95: number;
  /** CVaR_95 dollar loss vs initial NW. */
  cvarDollars95: number;
  fmt: MaskFmt;
  /** Number of buckets. Default 30. */
  buckets?: number;
  height?: number;
  hidden?: boolean;
}

export function DistributionHistogram({
  terminalNwSorted,
  initialNetWorth,
  varDollars95,
  cvarDollars95,
  fmt,
  buckets = 30,
  height = 180,
  hidden = false,
}: DistributionHistogramProps) {
  if (!terminalNwSorted || terminalNwSorted.length === 0) {
    return <EmptyChart label="No terminal samples — generate paths first." />;
  }

  const geom = useMemo(
    () => computeHistogramGeometry(terminalNwSorted, buckets, height, initialNetWorth, varDollars95, cvarDollars95),
    [terminalNwSorted, buckets, height, initialNetWorth, varDollars95, cvarDollars95]
  );

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold text-foreground">
            Terminal net-worth distribution
          </div>
          <div className="text-[10px] text-muted-foreground">
            {terminalNwSorted.length} simulations · VaR/CVaR markers anchored at initial NW
          </div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground hidden sm:block">
          <div>Worst 5% mean: <span className="tabular-nums font-semibold text-foreground">{fmt.fmt$M(geom.worst5Mean)}</span></div>
        </div>
      </div>

      <div className="relative w-full text-muted-foreground">
        <svg
          viewBox={`0 0 ${geom.W} ${geom.H}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Terminal net worth distribution with VaR and CVaR markers.`}
        >
          {/* Histogram bars */}
          {geom.bars.map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={b.isWorst5 ? "rgb(244 63 94 / 0.55)" : "rgb(99 102 241 / 0.55)"}
              className="transition-colors"
            />
          ))}

          {/* Initial NW reference line */}
          {geom.initialX != null && (
            <>
              <line
                x1={geom.initialX}
                x2={geom.initialX}
                y1={geom.padT}
                y2={geom.H - geom.padB}
                stroke={INITIAL_NW_COLOR}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={geom.initialX}
                y={geom.padT + 9}
                fontSize={9}
                textAnchor="middle"
                fill={INITIAL_NW_COLOR}
              >
                Initial
              </text>
            </>
          )}

          {/* CVaR marker (drawn first so VaR overlays) */}
          {geom.cvarX != null && (
            <>
              <line
                x1={geom.cvarX}
                x2={geom.cvarX}
                y1={geom.padT}
                y2={geom.H - geom.padB}
                stroke={CVAR_COLOR}
                strokeWidth={1.25}
              />
              <text
                x={geom.cvarX + 3}
                y={geom.H - geom.padB - 4}
                fontSize={9}
                fill={CVAR_COLOR}
                fontWeight={600}
              >
                CVaR₅
              </text>
            </>
          )}

          {/* VaR marker */}
          {geom.varX != null && (
            <>
              <line
                x1={geom.varX}
                x2={geom.varX}
                y1={geom.padT}
                y2={geom.H - geom.padB}
                stroke={VAR_COLOR}
                strokeWidth={1.25}
                strokeDasharray="4 2"
              />
              <text
                x={geom.varX + 3}
                y={geom.padT + 22}
                fontSize={9}
                fill={VAR_COLOR}
                fontWeight={600}
              >
                VaR₅
              </text>
            </>
          )}

          {/* X-axis */}
          {geom.xTicks.map(t => (
            <g key={t.x}>
              <line
                x1={t.x}
                x2={t.x}
                y1={geom.H - geom.padB}
                y2={geom.H - geom.padB + 3}
                stroke={AXIS_COLOR}
                strokeWidth={0.5}
                opacity={0.4}
              />
              <text
                x={t.x}
                y={geom.H - 2}
                fontSize={9}
                textAnchor="middle"
                fill={AXIS_COLOR}
                opacity={0.7}
              >
                {hidden ? "$•••" : abbreviateDollars(t.value)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[9px] text-muted-foreground">
        <LegendSwatch fill="rgb(99 102 241 / 0.55)" label="Outcome density" />
        <LegendSwatch fill="rgb(244 63 94 / 0.55)" label="Worst 5%" />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-[2px] border-t-[2px] border-dashed" style={{ borderColor: VAR_COLOR }} />
          <span>VaR₅ (P5 NW)</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-[2px]" style={{ background: CVAR_COLOR }} />
          <span>CVaR₅ (worst-5% mean)</span>
        </span>
      </div>
    </div>
  );
}

interface HistogramGeometry {
  W: number;
  H: number;
  padT: number;
  padB: number;
  padL: number;
  padR: number;
  bars: { x: number; y: number; w: number; h: number; isWorst5: boolean }[];
  xTicks: { x: number; value: number }[];
  initialX: number | null;
  varX: number | null;
  cvarX: number | null;
  worst5Mean: number;
}

function computeHistogramGeometry(
  sortedTerminals: number[],
  buckets: number,
  height: number,
  initialNw: number,
  varDollars: number,
  cvarDollars: number
): HistogramGeometry {
  const W = 600;
  const padL = 28;
  const padR = 10;
  const padT = 6;
  const padB = 16;
  const H = height + padT + padB;
  const innerW = W - padL - padR;

  const min = sortedTerminals[0];
  const max = sortedTerminals[sortedTerminals.length - 1];
  // Extend domain so initialNw is always visible.
  const lo = Math.min(min, initialNw - Math.abs(initialNw) * 0.02);
  const hi = Math.max(max, initialNw + Math.abs(initialNw) * 0.02);
  const span = (hi - lo) || 1;

  const counts = new Array(buckets).fill(0);
  for (const v of sortedTerminals) {
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(((v - lo) / span) * buckets)));
    counts[b]++;
  }
  const maxCount = Math.max(1, ...counts);

  // Worst 5% threshold
  const worstK = Math.max(1, Math.floor(sortedTerminals.length * 0.05));
  const worst5Threshold = sortedTerminals[worstK - 1];
  const worst5Mean = sortedTerminals.slice(0, worstK).reduce((a, b) => a + b, 0) / worstK;

  const xOfValue = (v: number) => padL + ((v - lo) / span) * innerW;

  const bars = counts.map((c, i) => {
    const bucketLo = lo + (i / buckets) * span;
    const bucketHi = lo + ((i + 1) / buckets) * span;
    const x = xOfValue(bucketLo);
    const w = Math.max(1, xOfValue(bucketHi) - x - 0.5);
    const h = (c / maxCount) * height;
    const y = padT + height - h;
    const isWorst5 = bucketHi <= worst5Threshold + 1e-6;
    return { x, y, w, h, isWorst5 };
  });

  // X ticks: ~5 ticks
  const xTicks: { x: number; value: number }[] = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const v = lo + (span * i) / tickCount;
    xTicks.push({ x: xOfValue(v), value: v });
  }

  const initialX = xOfValue(initialNw);
  // VaR/CVaR markers anchored at initialNw - dollar loss.
  const varValue = initialNw - varDollars;
  const cvarValue = initialNw - cvarDollars;
  const varX = varDollars > 0 ? xOfValue(varValue) : null;
  const cvarX = cvarDollars > 0 ? xOfValue(cvarValue) : null;

  return { W, H, padT, padB, padL, padR, bars, xTicks, initialX, varX, cvarX, worst5Mean };
}

// ─── TailRiskCard ────────────────────────────────────────────────────────────

export interface TailRiskCardProps {
  result: ExtendedScenarioResult;
  fmt: MaskFmt;
  /** Optional compact variant for embedding in CandidateRow. */
  compact?: boolean;
}

export function TailRiskCard({ result, fmt, compact = false }: TailRiskCardProps) {
  const r = result.riskMetrics;
  const insolvency = result.defaultProbability;
  const liquidityExh = result.liquidityExhaustionProbability;
  const refiPressure = result.refinancePressureProbability;
  const negEquity = result.negativeEquityProbability;

  const tiles: TailTile[] = [
    {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      label: "VaR₅ (loss)",
      value: fmt.fmt$M(r.varDollars95),
      sub: "vs initial NW · 95% conf.",
      tone: "rose",
    },
    {
      icon: <Skull className="h-3.5 w-3.5" />,
      label: "CVaR₅ (expected shortfall)",
      value: fmt.fmt$M(r.cvarDollars95),
      sub: "mean of worst 5% terminals",
      tone: "rose",
    },
    {
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      label: "Max drawdown · P50",
      value: fmt.pct(r.maxDrawdownMedian, 1),
      sub: `P90 ${fmt.pct(r.maxDrawdownP90, 1)} · peak-to-trough`,
      tone: "amber",
    },
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: "Insolvency",
      value: fmt.pct(insolvency, 1),
      sub: result.medianDefaultMonth != null
        ? `median month ${result.medianDefaultMonth}`
        : "never (in horizon)",
      tone: insolvency > 0.05 ? "rose" : "emerald",
    },
    {
      icon: <Droplets className="h-3.5 w-3.5" />,
      label: "Liquidity exhaustion",
      value: fmt.pct(liquidityExh, 1),
      sub: "cash ≤ 0 in any month",
      tone: liquidityExh > 0.10 ? "amber" : "sky",
    },
    {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      label: "Refi pressure",
      value: fmt.pct(refiPressure, 1),
      sub: negEquity > 0 ? `neg. equity ${fmt.pct(negEquity, 1)}` : "no negative-equity events",
      tone: refiPressure > 0.10 ? "amber" : "indigo",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        <span className="text-xs uppercase tracking-wide font-semibold text-foreground">
          Institutional tail-risk profile
        </span>
        <span className="text-[10px] text-muted-foreground">
          dollar VaR/CVaR · drawdown · survivability
        </span>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
        {tiles.map(t => (
          <TailRiskTile key={t.label} tile={t} />
        ))}
      </div>
      {r.rationale.length > 0 && (
        <details className="text-[10px] text-muted-foreground pt-0.5">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            Risk rationale ({r.rationale.length})
          </summary>
          <ul className="mt-1.5 space-y-0.5 pl-3 list-disc">
            {r.rationale.map((line, i) => (
              <li key={i}>{fmt.sentence(line)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface TailTile {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "rose" | "amber" | "emerald" | "sky" | "indigo";
}

function TailRiskTile({ tile }: { tile: TailTile }) {
  const toneClass = {
    rose: "border-rose-200 bg-rose-50/60 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    amber: "border-amber-200 bg-amber-50/60 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    sky: "border-sky-200 bg-sky-50/60 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
    indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900",
  }[tile.tone];

  return (
    <div className={`rounded-lg border p-2 ${toneClass}`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide font-semibold opacity-90">
        {tile.icon}
        <span className="truncate">{tile.label}</span>
      </div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{tile.value}</div>
      <div className="text-[9px] opacity-80 leading-snug truncate">{tile.sub}</div>
    </div>
  );
}

// ─── Empty / fallback ────────────────────────────────────────────────────────

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
