/**
 * RegimeOverlayChart.tsx — Net-worth / FIRE / cashflow overlay chart.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Generic 2-series line chart used to overlay Current Rules vs Reform.
 * Caller supplies aligned arrays of `{year, value}` for each series. The
 * chart respects the RegimeOverlayMode (only draws what's selected).
 */

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useMemo } from "react";
import type { RegimeOverlayMode } from "./RegimeOverlayToggle";
import { fmtAud } from "./formatters";

export interface RegimeSeriesPoint {
  year: number | string;
  current?: number | null;
  reform?: number | null;
}

interface Props {
  data: RegimeSeriesPoint[];
  mode: RegimeOverlayMode;
  /** Y-axis title (e.g., "Net worth (AUD)"). */
  yLabel?: string;
  /** Override the height (default 240px — premium mobile-first). */
  height?: number;
  /** Whether to draw shaded area underneath the lines. */
  filled?: boolean;
}

export function RegimeOverlayChart({ data, mode, yLabel, height = 240, filled = false }: Props): JSX.Element {
  const showCurrent = mode === "CURRENT" || mode === "BOTH";
  const showReform = mode === "REFORM" || mode === "BOTH";

  const yMaxHint = useMemo(() => {
    const vals: number[] = [];
    data.forEach((d) => {
      if (typeof d.current === "number" && Number.isFinite(d.current)) vals.push(d.current);
      if (typeof d.reform === "number" && Number.isFinite(d.reform)) vals.push(d.reform);
    });
    if (!vals.length) return undefined;
    return Math.max(...vals);
  }, [data]);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
            domain={yMaxHint ? [0, Math.ceil(yMaxHint * 1.05)] : ["auto", "auto"]}
            tickFormatter={(v) => {
              if (typeof v !== "number" || !Number.isFinite(v)) return "";
              if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
              if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
              return `$${v.toFixed(0)}`;
            }}
            label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } } : undefined}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
            }}
            formatter={(v: any) => fmtAud(Number(v))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {showCurrent && filled && (
            <Area
              type="monotone"
              dataKey="current"
              name="Current Rules"
              stroke="hsl(142 71% 45%)"
              fill="hsl(142 71% 45% / 0.18)"
              strokeWidth={2}
              dot={false}
            />
          )}
          {showCurrent && !filled && (
            <Line
              type="monotone"
              dataKey="current"
              name="Current Rules"
              stroke="hsl(142 71% 45%)"
              strokeWidth={2}
              dot={false}
            />
          )}
          {showReform && filled && (
            <Area
              type="monotone"
              dataKey="reform"
              name="Reform"
              stroke="hsl(38 92% 50%)"
              fill="hsl(38 92% 50% / 0.18)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
          )}
          {showReform && !filled && (
            <Line
              type="monotone"
              dataKey="reform"
              name="Reform"
              stroke="hsl(38 92% 50%)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default RegimeOverlayChart;
