/**
 * Sprint 13 — the single chart allowed above the fold.
 *
 * Solid line = Recommended p50 from path simulation. Dashed line = baseline
 * (do-nothing) flat at current net worth. Max ~180px high so the four
 * sections still fit in a single viewport.
 */
import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/finance";

export interface RecommendedVsDoNothingChartProps {
  data: Array<{ year: number; recommended: number | null; doNothing: number | null }>;
  testid?: string;
  className?: string;
  height?: number;
}

export function RecommendedVsDoNothingChart({
  data,
  testid = "chart-recommended-vs-do-nothing",
  className = "",
  height = 180,
}: RecommendedVsDoNothingChartProps) {
  if (!data || data.length === 0) return null;
  return (
    <div
      className={`rounded-lg border border-border bg-card/70 px-3 py-2 ${className}`}
      data-testid={testid}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Recommended vs Do Nothing
        </h3>
        <span className="text-[10px] text-muted-foreground">Source: Path Simulation · Forecast Engine</span>
      </div>
      <div style={{ height }} data-testid={`${testid}-canvas`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `$${Math.round(v / 1000).toLocaleString()}k`}
            />
            <RTooltip
              formatter={(v: number) => formatCurrency(v)}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
            <Line
              type="monotone"
              dataKey="doNothing"
              name="Do nothing"
              stroke="#9ca3af"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="recommended"
              name="Recommended"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default RecommendedVsDoNothingChart;
