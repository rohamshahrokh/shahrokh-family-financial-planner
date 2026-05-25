/**
 * ScenarioOutcomeComparisonChart — Sprint 12 grouped-bar overview.
 *
 * One bar group per scenario; 3 bars per group: P50 NW, P50 PI, P(FF).
 * (Years-to-FIRE is omitted when the scenario engine does not expose it;
 * we keep the chart honest with whatever is present.)
 *
 * Reads existing scenario result fields — no new financial math.
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
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/finance";
import type { ScenarioMetricRef } from "./WinnerLoserDifferenceCards";

interface Props {
  scenarios: ScenarioMetricRef[];
}

export function ScenarioOutcomeComparisonChart({ scenarios }: Props) {
  if (scenarios.length === 0) return null;
  const data = scenarios.map((s) => ({
    name: s.name,
    "Net Worth": s.netWorthP50 ?? null,
    "Passive Income (×10)": s.passiveIncomeP50 != null ? s.passiveIncomeP50 * 10 : null,
    "Probability (×$1M)": s.probability != null ? s.probability * 1_000_000 : null,
  }));
  return (
    <Card className="p-4" data-testid="sc-chart-outcome-comparison">
      <header className="mb-2">
        <h4 className="text-sm font-semibold text-foreground">Scenario Outcome Comparison</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Grouped view of each scenario's projected net worth, passive income, and FIRE probability.
          (Passive income scaled ×10 and probability scaled ×$1M so the three series share a single axis.)
        </p>
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${Math.round(v / 1000).toLocaleString()}k`} />
            <RTooltip formatter={(v: number) => formatCurrency(v, true)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Net Worth" fill="#10b981" isAnimationActive={false} />
            <Bar dataKey="Passive Income (×10)" fill="#6366f1" isAnimationActive={false} />
            <Bar dataKey="Probability (×$1M)" fill="#f59e0b" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default ScenarioOutcomeComparisonChart;
