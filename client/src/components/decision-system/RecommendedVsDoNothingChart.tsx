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
  doNothingNetWorth: number | null | undefined;
  recommendedFireYear?: number | null;
  doNothingFireYear?: number | null;
  testidPrefix?: string;
  heightPx?: number;
}

export function RecommendedVsDoNothingChart({
  netWorthFan,
  doNothingNetWorth,
  recommendedFireYear,
  doNothingFireYear,
  testidPrefix = "s13-rec-vs-donothing-chart",
  heightPx = 180,
}: Props) {
  const data = (netWorthFan ?? [])
    .filter((p) => Number.isFinite(p?.p50))
    .map((p) => ({
      year: p.year,
      recommended: p.p50 as number,
      doNothing: Number.isFinite(doNothingNetWorth as number) ? (doNothingNetWorth as number) : null,
    }));

  if (data.length === 0) return null;

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
