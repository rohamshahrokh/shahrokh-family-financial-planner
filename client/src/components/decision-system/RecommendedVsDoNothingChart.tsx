/**
 * RecommendedVsDoNothingChart — Sprint 13 single above-fold chart.
 *
 * ≤180px tall. Two lines: recommended P50 net-worth trajectory vs. a
 * flat baseline at "do nothing" net worth. Single source of visual data
 * above the fold — every other chart is demoted into AdvancedDisclosure.
 *
 * Uses existing recharts dependency. Empty fan = collapses entirely.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { SourceTag } from "@/components/ui/SourceTag";
import { formatCurrency } from "@/lib/finance";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

export interface RvDFanPoint {
  year: number;
  p50: number | null | undefined;
}

interface Props {
  netWorthFan: RvDFanPoint[];
  /**
   * Sprint 12 legacy flat-hold value. Kept for back-compat. Sprint 13 P0-4
   * prefers `doNothingForecast` (a real per-year projection). When the
   * forecast is supplied AND non-empty it takes priority over this value.
   */
  doNothingNetWorth: number | null | undefined;
  /**
   * Sprint 13 P0-4 — real do-nothing forecast: canonical NW projected at
   * canonical growth (no actions, no scenario modifications). When this
   * is null/empty AND `doNothingNetWorth` is also null, the chart hides
   * itself and an empty-state is rendered (no fabricated flat line).
   */
  doNothingForecast?: Array<{ year: number; netWorth: number }> | null;
  recommendedFireYear?: number | null;
  doNothingFireYear?: number | null;
  testidPrefix?: string;
  heightPx?: number;
}

export function RecommendedVsDoNothingChart({
  netWorthFan,
  doNothingNetWorth,
  doNothingForecast,
  recommendedFireYear,
  doNothingFireYear,
  testidPrefix = "s13-rec-vs-donothing-chart",
  heightPx = 180,
}: Props) {
  // Sprint 13 P0-4 — prefer the real per-year forecast over the legacy
  // flat-held scalar. The map lets us join doNothing by year so the lines
  // share an X axis with the Sprint 9 fan.
  const forecastByYear = new Map<number, number>();
  if (Array.isArray(doNothingForecast)) {
    for (const p of doNothingForecast) forecastByYear.set(p.year, p.netWorth);
  }
  const hasRealForecast = forecastByYear.size > 0;
  const data = (netWorthFan ?? [])
    .filter((p) => Number.isFinite(p?.p50))
    .map((p) => {
      const dn = hasRealForecast
        ? forecastByYear.get(p.year)
        : Number.isFinite(doNothingNetWorth as number)
          ? (doNothingNetWorth as number)
          : null;
      return {
        year: p.year,
        recommended: p.p50 as number,
        doNothing: dn ?? null,
      };
    });

  if (data.length === 0) return null;

  // Sprint 13 P0-4 — when no usable Do-Nothing data was supplied (neither
  // a real forecast nor a legacy scalar), render the empty-state instead
  // of fabricating a flat line.
  const doNothingDataMissing = data.every((d) => d.doNothing == null);
  if (doNothingDataMissing) {
    return (
      <Card className="p-3 border-dashed border-border bg-card" data-testid={`${testidPrefix}-unavailable`}>
        <div className="text-xs font-semibold text-foreground">Recommended vs Do Nothing</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Do-Nothing baseline unavailable — forecast engine returned no data.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3 border-border bg-card" data-testid={testidPrefix}>
      <div className="flex items-baseline justify-between mb-1.5">
        <div>
          <div className="text-xs font-semibold text-foreground">Recommended vs Do Nothing</div>
          <div className="text-[10px] text-muted-foreground">
            P50 net-worth path · solid = recommended, dashed = baseline
            {recommendedFireYear ? ` · FIRE ${recommendedFireYear}` : ""}
            {doNothingFireYear && doNothingFireYear !== recommendedFireYear ? ` vs ${doNothingFireYear}` : ""}
          </div>
        </div>
        <SourceTag label="Path Simulation" detail="bestStrategy.netWorthFan vs alternativePaths.min" data-testid={`${testidPrefix}-source`} />
      </div>
      <div style={{ height: heightPx }} data-testid={`${testidPrefix}-chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
            <XAxis dataKey="year" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrency(Number(v), true)}
              width={50}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, padding: "4px 8px" }}
              formatter={(v: number) => formatCurrency(Number(v), true)}
            />
            <Line
              type="monotone"
              dataKey="recommended"
              stroke="hsl(142 70% 45%)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="Recommended"
            />
            <Line
              type="monotone"
              dataKey="doNothing"
              stroke="hsl(0 70% 55%)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              name="Do Nothing"
            />
            {recommendedFireYear ? (
              <ReferenceLine
                x={recommendedFireYear}
                stroke="hsl(142 70% 45%)"
                strokeDasharray="2 2"
                label={{ value: "FIRE", fontSize: 9, fill: "hsl(142 70% 35%)" }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
