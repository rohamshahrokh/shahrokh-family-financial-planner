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
import { ArrowRight, Target } from "lucide-react";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { FireGapSummary } from "@/lib/goalSolverView.types";
import { SourceTag, type SourceVariant } from "@/components/portfolio-lab/SourceTag";

interface Props {
  summary: FireGapSummary;
  /** ISO date of the latest Monte Carlo run — surfaced on the P(FF) tile. */
  monteCarloRunDate?: string | null;
  /** True when the MC run is stale relative to the snapshot. */
  forecastStale?: boolean;
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
  source,
  sourceRunDate,
  sourceStale,
  cta,
}: {
  label: string;
  value: string | null;
  subtitle?: string;
  testid: string;
  emphasis?: "gap" | "target" | "current";
  /** REMEDIATION C-1: per locked decision #7, every promoted number declares its source. */
  source?: SourceVariant;
  sourceRunDate?: string | null;
  sourceStale?: boolean;
  /** REMEDIATION C-2: when the value is empty AND a CTA is supplied, render the CTA
   *  in place of hiding the tile entirely. */
  cta?: { label: string; href: string; testid: string };
}) {
  const tone =
    emphasis === "gap"
      ? "border-amber-500/30 bg-amber-500/5"
      : emphasis === "target"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-border bg-card/70";

  if (isEmptyValue(value)) {
    if (!cta) return null;
    return (
      <div className={`rounded-lg border border-dashed p-3 ${tone}`} data-testid={testid}>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
        <a href={cta.href} data-testid={cta.testid}>
          <Button size="sm" variant="default" className="h-7 text-xs gap-1">
            <Target className="h-3 w-3" />
            {cta.label}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </a>
      </div>
    );
  }
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
      {source ? (
        <div className="mt-1.5">
          <SourceTag
            variant={source}
            runDate={sourceRunDate}
            stale={sourceStale}
            testid={`${testid}-source`}
          />
        </div>
      ) : null}
    </div>
  );
}

export function FireGapSummaryBlock({ summary, monteCarloRunDate, forecastStale }: Props) {
  const noTarget =
    isEmptyValue(summary.targetNetWorth) &&
    isEmptyValue(summary.targetPassiveIncome) &&
    isEmptyValue(summary.targetFireYear);

  if (noTarget) {
    // REMEDIATION B-1: even when no FIRE goal is set, surface the ledger-
    // derived Current NW so the user always sees their actual position.
    // Only the target/gap cells should show as "Goal not set".
    const currentNwFmt = fmt$(summary.currentNetWorth);
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
            {currentNwFmt ? (
              <div className="mt-3 flex flex-col gap-1" data-testid="pl-fire-gap-empty-current-nw">
                <div className="inline-flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Current Net Worth</span>
                  <span className="text-base font-semibold tabular-nums text-foreground">{currentNwFmt}</span>
                </div>
                <SourceTag variant="ledger" testid="pl-fire-gap-empty-current-nw-source" />
              </div>
            ) : null}
          </div>
          <a href="/" data-testid="pl-fire-gap-empty-cta">
            <Button variant="default" className="gap-1">
              <Target className="h-3 w-3" />
              Set FIRE goal
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
          source="ledger"
        />
        <Tile
          label="Target Net Worth"
          value={fmt$(summary.targetNetWorth)}
          testid="pl-fire-gap-target-nw"
          emphasis="target"
          subtitle={summary.targetFireYear ? `by ${summary.targetFireYear}` : undefined}
          source="fire"
          cta={{ label: "Set FIRE goal", href: "/", testid: "pl-fire-gap-target-nw-cta" }}
        />
        <Tile
          label="Net Worth Gap"
          value={fmt$(summary.netWorthGap)}
          testid="pl-fire-gap-nw-gap"
          emphasis="gap"
          subtitle="to close"
          source="fire"
          cta={{ label: "Set FIRE goal", href: "/", testid: "pl-fire-gap-nw-gap-cta" }}
        />
        <Tile
          label="Current Passive Income"
          value={fmt$(summary.currentPassiveIncome)}
          testid="pl-fire-gap-current-pi"
          emphasis="current"
          subtitle="annual"
          source="ledger"
        />
        <Tile
          label="Target Passive Income"
          value={fmt$(summary.targetPassiveIncome)}
          testid="pl-fire-gap-target-pi"
          emphasis="target"
          subtitle="annual"
          source="fire"
          cta={{ label: "Set FIRE goal", href: "/", testid: "pl-fire-gap-target-pi-cta" }}
        />
        <Tile
          label="Passive Income Gap"
          value={fmt$(summary.passiveIncomeGap)}
          testid="pl-fire-gap-pi-gap"
          emphasis="gap"
          subtitle="to close"
          source="fire"
          cta={{ label: "Set FIRE goal", href: "/", testid: "pl-fire-gap-pi-gap-cta" }}
        />
        <Tile
          label="Current P(FF)"
          value={fmtPct(summary.currentProbability)}
          testid="pl-fire-gap-current-prob"
          emphasis="current"
          subtitle="probability of FIRE by target"
          source="mc"
          sourceRunDate={monteCarloRunDate ?? null}
          sourceStale={forecastStale}
          cta={{ label: "Run Monte Carlo", href: "/probabilistic", testid: "pl-fire-gap-current-prob-cta" }}
        />
        <Tile
          label="Required P(FF)"
          value={fmtPct(summary.requiredProbability)}
          testid="pl-fire-gap-required-prob"
          emphasis="target"
          subtitle={
            summary.requiredProbabilitySource === "default"
              ? "default 70% bar (no goal-config override)"
              : "from goal config"
          }
          source="fire"
        />
      </div>
    </Card>
  );
}

export default FireGapSummaryBlock;
