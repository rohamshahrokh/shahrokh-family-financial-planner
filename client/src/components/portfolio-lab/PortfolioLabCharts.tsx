/**
 * PortfolioLabCharts — Sprint 12 Phase 2 chart batch.
 *
 * Three charts:
 *   pl-chart-current-vs-target — Current NW vs Target NW (bar)
 *   pl-chart-nw-gap-waterfall  — Net worth waterfall (Start → Δ → End)
 *   pl-chart-path-vs-baseline  — Recommended path vs Do-nothing (line)
 *
 * Reads ONLY canonical engine outputs (Sprint 9 path-sim p50 deltas). No
 * new financial formulas.
 */

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ReferenceLine,
  ComposedChart,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { FireGapSummary } from "@/lib/goalSolverView.types";

interface YearBand {
  year: number;
  p50: number;
}

/**
 * REMEDIATION B-3: the Do-Nothing series is now a real per-year forecast,
 * not a flat constant. Caller supplies a `doNothingSeries` of (year, netWorth)
 * built from buildDoNothingForecast(); the chart draws three lines —
 * Current Path / Recommended Path / Target Line.
 *
 * `baselineNetWorth` is retained for backward compatibility and used as the
 * fallback when `doNothingSeries` is empty (legacy callers).
 */
interface Props {
  summary: FireGapSummary;
  netWorthFan: YearBand[];
  baselineNetWorth: number | null;
  doNothingSeries?: { year: number; netWorth: number }[];
}

function fmt(v: number): string {
  return formatCurrency(v, true);
}

function ChartCard({
  testid,
  title,
  caption,
  children,
  empty,
}: {
  testid: string;
  title: string;
  caption: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <Card className="p-4" data-testid={testid}>
      <header className="mb-2">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">{caption}</p>
      </header>
      <div className="h-56 sm:h-64">{children}</div>
    </Card>
  );
}

export function PortfolioLabCharts({
  summary,
  netWorthFan,
  baselineNetWorth,
  doNothingSeries,
}: Props) {
  // Chart 1: Current vs Target NW
  const currentVsTargetData =
    !isEmptyValue(summary.currentNetWorth) && !isEmptyValue(summary.targetNetWorth)
      ? [
          { name: "Current", value: summary.currentNetWorth ?? 0, fill: "#60a5fa" },
          { name: "Target", value: summary.targetNetWorth ?? 0, fill: "#10b981" },
        ]
      : [];
  const gapAnnotation =
    !isEmptyValue(summary.netWorthGap) && (summary.netWorthGap as number) > 0
      ? `Gap: ${fmt(summary.netWorthGap as number)}`
      : null;

  // Chart 2: Net worth gap waterfall — Start NW, Δ growth (Sprint 9 fan delta), End P50, vs Target
  const waterfallData = (() => {
    if (!netWorthFan || netWorthFan.length < 2) return [];
    const start = netWorthFan[0];
    const end = netWorthFan[netWorthFan.length - 1];
    const delta = (end.p50 ?? 0) - (start.p50 ?? 0);
    return [
      { name: "Start NW", value: start.p50 ?? 0, fill: "#60a5fa" },
      { name: "Engine Δ (p50)", value: delta, fill: delta >= 0 ? "#10b981" : "#ef4444" },
      { name: "End NW", value: end.p50 ?? 0, fill: "#10b981" },
      ...(!isEmptyValue(summary.targetNetWorth)
        ? [{ name: "Target", value: summary.targetNetWorth ?? 0, fill: "#a855f7" }]
        : []),
    ];
  })();

  // Chart 3: Path vs baseline (line). REMEDIATION B-3: prefer the real
  // doNothingSeries when supplied; fall back to the legacy flat baseline only
  // when the caller has not yet wired the forecast. A "Target" reference line
  // is added when the summary has a target NW.
  const doNothingByYear = new Map<number, number>();
  (doNothingSeries ?? []).forEach((d) => doNothingByYear.set(d.year, d.netWorth));
  const pathBaselineData = (netWorthFan ?? []).map((b) => ({
    year: b.year,
    "Current Path": doNothingByYear.has(b.year)
      ? doNothingByYear.get(b.year)
      : baselineNetWorth,
    "Recommended Path": b.p50,
    Target:
      summary.targetNetWorth != null && Number.isFinite(summary.targetNetWorth)
        ? summary.targetNetWorth
        : null,
  }));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-3" data-testid="pl-charts">
      <ChartCard
        testid="pl-chart-current-vs-target"
        title="Current vs Target Net Worth"
        caption={
          gapAnnotation
            ? `Your current ${fmt(summary.currentNetWorth ?? 0)} vs your ${fmt(summary.targetNetWorth ?? 0)} target — ${gapAnnotation.toLowerCase()}.`
            : "Set a FIRE target on the Dashboard to see this comparison."
        }
        empty={currentVsTargetData.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={currentVsTargetData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `$${Math.round(v / 1000).toLocaleString()}k`}
            />
            <RTooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="value" isAnimationActive={false}>
              {currentVsTargetData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
            {!isEmptyValue(summary.targetNetWorth) ? (
              <ReferenceLine
                y={summary.targetNetWorth ?? 0}
                stroke="#10b981"
                strokeDasharray="4 4"
                label={{ value: "Target", fill: "#10b981", fontSize: 10 }}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        testid="pl-chart-nw-gap-waterfall"
        title="Net Worth Gap Waterfall"
        caption="Starting net worth, engine-projected growth (Sprint 9 p50), end net worth, and the target benchmark."
        empty={waterfallData.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={waterfallData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `$${Math.round(v / 1000).toLocaleString()}k`}
            />
            <RTooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="value" isAnimationActive={false}>
              {waterfallData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        testid="pl-chart-path-vs-baseline"
        title="Current Path vs Recommended Path vs Target"
        caption="Solid green = engine-recommended trajectory (Sprint 9 p50). Dashed grey = your current path with no new strategies (ledger NW projected at the current portfolio's blended expected return). Purple = your FIRE target."
        empty={pathBaselineData.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pathBaselineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `$${Math.round(v / 1000).toLocaleString()}k`}
            />
            <RTooltip formatter={(v: number) => fmt(v)} labelFormatter={(label) => `Year ${label}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="Current Path"
              stroke="#9ca3af"
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Recommended Path"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Target"
              stroke="#a855f7"
              strokeDasharray="2 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

export default PortfolioLabCharts;
