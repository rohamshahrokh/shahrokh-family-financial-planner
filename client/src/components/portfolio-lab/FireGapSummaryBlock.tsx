/**
 * FireGapSummaryBlock — Sprint 12 Portfolio Lab top tile grid.
 *
 * 8 tiles: Current NW · Target NW · NW Gap · Current PI · Target PI · PI Gap ·
 *          Current P(FF) · Required P(FF)
 *
 * Reads selectFireGapSummary() over the existing Sprint 10 canonical engine
 * result. NO new financial calculations.
 *
 * Empty-field rule: when the user hasn't set a FIRE goal (no targetNetWorth),
 * the entire block collapses to a single CTA.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { FireGapSummary } from "@/lib/goalSolverView.types";

interface Props {
  summary: FireGapSummary;
}

function fmt$(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return formatCurrency(v, true);
}

function fmtPct(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `${Math.round(v * 100)}%`;
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
  subtitle?: string;
  testid: string;
  emphasis?: "gap" | "target" | "current";
}) {
  if (isEmptyValue(value)) return null;
  const tone =
    emphasis === "gap"
      ? "border-amber-500/30 bg-amber-500/5"
      : emphasis === "target"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-border bg-card/70";
  return (
    <div className={`rounded-lg border p-3 ${tone}`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-lg sm:text-xl font-semibold tabular-nums text-foreground" data-testid={`${testid}-value`}>
        {value}
      </div>
      {subtitle ? (
        <div className="text-[11px] text-muted-foreground mt-0.5" data-testid={`${testid}-subtitle`}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

export function FireGapSummaryBlock({ summary }: Props) {
  const noTarget =
    isEmptyValue(summary.targetNetWorth) &&
    isEmptyValue(summary.targetPassiveIncome) &&
    isEmptyValue(summary.targetFireYear);

  if (noTarget) {
    return (
      <Card
        className="p-4 sm:p-5 border-dashed border-muted-foreground/40 bg-muted/20"
        data-testid="pl-fire-gap-empty"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Set a FIRE goal to see your gap</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Enter your target net worth and FIRE year on the Dashboard. Once set, this block shows your
              current position, target, and gap — calculated from the canonical engines.
            </p>
          </div>
          <a href="/" data-testid="pl-fire-gap-empty-cta">
            <Button variant="default" className="gap-1">
              Open Dashboard
              <ArrowRight className="h-3 w-3" />
            </Button>
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5" data-testid="pl-fire-gap-summary">
      <header className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">FIRE Gap Summary</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Where you are, where you're going, and how big the gap is — every number from the canonical engines.
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tile
          label="Current Net Worth"
          value={fmt$(summary.currentNetWorth)}
          testid="pl-fire-gap-current-nw"
          emphasis="current"
        />
        <Tile
          label="Target Net Worth"
          value={fmt$(summary.targetNetWorth)}
          testid="pl-fire-gap-target-nw"
          emphasis="target"
          subtitle={summary.targetFireYear ? `by ${summary.targetFireYear}` : undefined}
        />
        <Tile
          label="Net Worth Gap"
          value={fmt$(summary.netWorthGap)}
          testid="pl-fire-gap-nw-gap"
          emphasis="gap"
          subtitle="to close"
        />
        <Tile
          label="Current Passive Income"
          value={fmt$(summary.currentPassiveIncome)}
          testid="pl-fire-gap-current-pi"
          emphasis="current"
          subtitle="annual"
        />
        <Tile
          label="Target Passive Income"
          value={fmt$(summary.targetPassiveIncome)}
          testid="pl-fire-gap-target-pi"
          emphasis="target"
          subtitle="annual"
        />
        <Tile
          label="Passive Income Gap"
          value={fmt$(summary.passiveIncomeGap)}
          testid="pl-fire-gap-pi-gap"
          emphasis="gap"
          subtitle="to close"
        />
        <Tile
          label="Current P(FF)"
          value={fmtPct(summary.currentProbability)}
          testid="pl-fire-gap-current-prob"
          emphasis="current"
          subtitle="probability of FIRE by target"
        />
        <Tile
          label="Required P(FF)"
          value={fmtPct(summary.requiredProbability)}
          testid="pl-fire-gap-required-prob"
          emphasis="target"
          subtitle="to be ACHIEVABLE"
        />
      </div>
    </Card>
  );
}

export default FireGapSummaryBlock;
