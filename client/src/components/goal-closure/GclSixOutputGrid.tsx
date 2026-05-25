/**
 * GclSixOutputGrid — Sprint 12 Goal Closure Lab top grid.
 *
 * 6 tiles: Goal Progress % · Current Gap $ · Required Change ·
 *          Fastest Path · Safest Path · Highest-Probability Path
 *
 * Reads existing buildGoalClosureLab() outputs. Path tiles map by path id:
 *   fastest          = "earlier-property" or "etf-increase" (the path with the
 *                       earliest projected FIRE age in pathComparison)
 *   safest           = lowest-risk row (lowest risk score)
 *   highest-prob     = highest monte carlo probability
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { isEmptyValue } from "@/lib/uiEmptyField";
import { formatCurrency } from "@/lib/finance";
import { formatClosureMetric, type ClosurePathRow, type ClosureMetric } from "@/lib/goalClosureLab";

interface Props {
  goalStatus: {
    target: ClosureMetric;
    gap: ClosureMetric;
    currentProjection: ClosureMetric;
  };
  pathComparison: ClosurePathRow[];
  bestPath: { recommendedLabel: string; whyItWins: string };
}

function metricValue(m: ClosureMetric): string | null {
  if (m.incomplete) return null;
  const v = formatClosureMetric(m);
  if (isEmptyValue(v)) return null;
  return v;
}

function rowMetric(row: ClosurePathRow, key: keyof ClosurePathRow["metrics"]): number | null {
  const m = row.metrics[key];
  if (!m || m.incomplete) return null;
  const v = (m as any).value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pickFastest(rows: ClosurePathRow[]): ClosurePathRow | null {
  let best: ClosurePathRow | null = null;
  let bestAge: number | null = null;
  for (const r of rows) {
    const v = rowMetric(r, "fireAge");
    if (v == null) continue;
    if (bestAge == null || v < bestAge) {
      bestAge = v;
      best = r;
    }
  }
  return best;
}

function pickSafest(rows: ClosurePathRow[]): ClosurePathRow | null {
  let best: ClosurePathRow | null = null;
  let bestRisk: number | null = null;
  for (const r of rows) {
    const v = rowMetric(r, "riskScore");
    if (v == null) continue;
    if (bestRisk == null || v < bestRisk) {
      bestRisk = v;
      best = r;
    }
  }
  return best;
}

function pickHighestProb(rows: ClosurePathRow[]): ClosurePathRow | null {
  let best: ClosurePathRow | null = null;
  let bestProb: number | null = null;
  for (const r of rows) {
    const v = rowMetric(r, "monteCarloProbability");
    if (v == null) continue;
    if (bestProb == null || v > bestProb) {
      bestProb = v;
      best = r;
    }
  }
  return best;
}

function Tile({
  label,
  value,
  subtitle,
  testid,
  emphasis,
}: {
  label: string;
  value: string | null;
  subtitle?: string | null;
  testid: string;
  emphasis?: "primary" | "warn" | "muted";
}) {
  if (isEmptyValue(value)) return null;
  const tone =
    emphasis === "primary"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : emphasis === "warn"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-card/70";
  return (
    <div className={`rounded-lg border p-3 ${tone}`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-base sm:text-lg font-semibold tabular-nums text-foreground" data-testid={`${testid}-value`}>
        {value}
      </div>
      {!isEmptyValue(subtitle) ? (
        <div className="text-[11px] text-muted-foreground mt-0.5" data-testid={`${testid}-subtitle`}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function PathTile({
  testid,
  title,
  row,
}: {
  testid: string;
  title: string;
  row: ClosurePathRow | null;
}) {
  if (!row) return null;
  const fireAge = rowMetric(row, "fireAge");
  const prob = rowMetric(row, "monteCarloProbability");
  const nw = rowMetric(row, "netWorth");
  return (
    <Card className="p-3 border-emerald-500/20 bg-card/70" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="text-sm font-semibold text-foreground mb-2" data-testid={`${testid}-label`}>
        {row.definition.label}
      </div>
      <ul className="text-xs space-y-1 mb-2">
        {fireAge != null ? (
          <li className="flex justify-between" data-testid={`${testid}-fire-age`}>
            <span className="text-muted-foreground">FIRE age</span>
            <span className="font-semibold tabular-nums">{fireAge}</span>
          </li>
        ) : null}
        {prob != null ? (
          <li className="flex justify-between" data-testid={`${testid}-probability`}>
            <span className="text-muted-foreground">P(FIRE)</span>
            <span className="font-semibold tabular-nums">{Math.round(prob * 100)}%</span>
          </li>
        ) : null}
        {nw != null ? (
          <li className="flex justify-between" data-testid={`${testid}-net-worth`}>
            <span className="text-muted-foreground">Net worth</span>
            <span className="font-semibold tabular-nums">{formatCurrency(nw, true)}</span>
          </li>
        ) : null}
      </ul>
      <a href="#path-comparison" data-testid={`${testid}-details`}>
        <Button size="sm" variant="ghost" className="gap-1 p-0 h-auto text-xs">
          View details
          <ArrowRight className="h-3 w-3" />
        </Button>
      </a>
    </Card>
  );
}

export function GclSixOutputGrid({ goalStatus, pathComparison, bestPath }: Props) {
  const target = metricValue(goalStatus.target);
  const projection = metricValue(goalStatus.currentProjection);
  const gap = metricValue(goalStatus.gap);

  // Goal progress % derived from current projection vs target only when both
  // exist; otherwise hidden per empty-field rule.
  let progressPct: string | null = null;
  if (
    !goalStatus.target.incomplete && !goalStatus.currentProjection.incomplete &&
    typeof (goalStatus.target as any).value === "number" &&
    typeof (goalStatus.currentProjection as any).value === "number" &&
    (goalStatus.target as any).value > 0
  ) {
    const pct = (goalStatus.currentProjection as any).value / (goalStatus.target as any).value;
    if (Number.isFinite(pct) && pct >= 0) {
      progressPct = `${Math.round(pct * 100)}%`;
    }
  }

  const fastest = pickFastest(pathComparison);
  const safest = pickSafest(pathComparison);
  const highestProb = pickHighestProb(pathComparison);

  const anyMain = !isEmptyValue(progressPct) || !isEmptyValue(gap) || !isEmptyValue(target);
  const anyPath = fastest || safest || highestProb;
  if (!anyMain && !anyPath) return null;

  return (
    <Card className="p-4 sm:p-5" data-testid="gcl-six-output-grid">
      <header className="mb-3">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">Where you stand, and how to close it</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Six advisor-style outputs over the canonical Goal Closure engine.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Tile
          label="Goal Progress"
          value={progressPct}
          subtitle={projection ? `Projection: ${projection}` : undefined}
          testid="gcl-progress-pct"
          emphasis="primary"
        />
        <Tile
          label="Current Gap"
          value={gap}
          subtitle={target ? `to target ${target}` : undefined}
          testid="gcl-current-gap"
          emphasis="warn"
        />
        <Tile
          label="Required Change"
          value={!isEmptyValue(bestPath.recommendedLabel) ? bestPath.recommendedLabel : null}
          subtitle={bestPath.whyItWins ? bestPath.whyItWins.slice(0, 90) + (bestPath.whyItWins.length > 90 ? "…" : "") : undefined}
          testid="gcl-required-change"
          emphasis="primary"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <PathTile testid="gcl-path-fastest" title="Fastest Path" row={fastest} />
        <PathTile testid="gcl-path-safest" title="Safest Path" row={safest} />
        <PathTile testid="gcl-path-highest-prob" title="Highest Probability Path" row={highestProb} />
      </div>
    </Card>
  );
}

export default GclSixOutputGrid;
