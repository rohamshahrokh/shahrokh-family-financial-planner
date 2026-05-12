/**
 * RegimeOverlayChart.tsx — Net-worth / FIRE / cashflow overlay chart.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Softer gridlines (dotted hairlines at 25% opacity)
 *   - Subtler axes — no axis lines, just labels
 *   - Wider top padding so the line never touches the top edge
 *   - Premium tooltip (rounded, soft shadow, no harsh border)
 *   - Legend integrated as small swatches just under the chart
 *   - Default to filled mode — area chart reads richer on premium surfaces
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
  yLabel?: string;
  height?: number;
  /** Whether to fill area under the lines. Default true (richer presentation). */
  filled?: boolean;
}

const CURRENT_STROKE = "hsl(150 65% 50%)";
const CURRENT_FILL = "hsl(150 65% 50% / 0.14)";
const REFORM_STROKE = "hsl(38 92% 55%)";
const REFORM_FILL = "hsl(38 92% 55% / 0.12)";

export function RegimeOverlayChart({ data, mode, yLabel, height = 280, filled = true }: Props): JSX.Element {
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
    <div className="w-full">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="2 4"
              stroke="hsl(var(--border) / 0.35)"
            />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={48}
              domain={yMaxHint ? [0, Math.ceil(yMaxHint * 1.08)] : ["auto", "auto"]}
              tickFormatter={(v) => {
                if (typeof v !== "number" || !Number.isFinite(v)) return "";
                if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
                return `$${v.toFixed(0)}`;
              }}
              label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } } : undefined}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border) / 0.6)", strokeDasharray: "2 3" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 12,
                border: "none",
                background: "hsl(var(--popover))",
                boxShadow: "var(--shadow-md)",
                padding: "10px 12px",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}
              formatter={(v: any, name: any) => [fmtAud(Number(v)), name === "current" ? "Today" : "Reform"]}
            />
            {showCurrent && filled && (
              <Area
                type="monotone"
                dataKey="current"
                name="current"
                stroke={CURRENT_STROKE}
                fill={CURRENT_FILL}
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            )}
            {showCurrent && !filled && (
              <Line
                type="monotone"
                dataKey="current"
                name="current"
                stroke={CURRENT_STROKE}
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            )}
            {showReform && filled && (
              <Area
                type="monotone"
                dataKey="reform"
                name="reform"
                stroke={REFORM_STROKE}
                fill={REFORM_FILL}
                strokeWidth={2.25}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            )}
            {showReform && !filled && (
              <Line
                type="monotone"
                dataKey="reform"
                name="reform"
                stroke={REFORM_STROKE}
                strokeWidth={2.25}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Inline legend — small swatches, soft */}
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        {showCurrent && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-full" style={{ background: CURRENT_STROKE }} />
            Today's rules
          </span>
        )}
        {showReform && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: REFORM_STROKE }} />
            Proposed reform
          </span>
        )}
      </div>
    </div>
  );
}

export default RegimeOverlayChart;
