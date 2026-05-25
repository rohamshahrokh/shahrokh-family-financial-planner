/**
 * FireCommandCenter — Sprint 13 hero tiles.
 *
 * 5-tile grid answering: Current NW · Target NW · Gap · Years Remaining ·
 * Probability. Each tile carries a SourceTag chip so provenance is visible
 * without scrolling. Empty values collapse via the S11 uiEmptyField primitive
 * so nothing renders as "—" / "Incomplete".
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { SourceTag } from "@/components/ui/SourceTag";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { FireCommandCenterData } from "@/lib/goalSolverView.types";

interface Props {
  data: FireCommandCenterData;
  testidPrefix?: string;
}

interface TileProps {
  label: string;
  value: string | null;
  sublabel?: string | null;
  source: { label: string; detail?: string | null };
  testid: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}

function Tile({ label, value, sublabel, source, testid, tone = "neutral" }: TileProps) {
  if (isEmptyValue(value)) return null;
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5"
        : tone === "danger"
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-border bg-card";
  return (
    <Card className={`p-3 sm:p-4 flex flex-col gap-1.5 ${toneClass}`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base sm:text-lg font-semibold text-foreground tabular-nums leading-tight" data-testid={`${testid}-value`}>
        {value}
      </div>
      {!isEmptyValue(sublabel) ? (
        <div className="text-[11px] text-muted-foreground" data-testid={`${testid}-sublabel`}>{sublabel}</div>
      ) : null}
      <SourceTag label={source.label} detail={source.detail} data-testid={`${testid}-source`} />
    </Card>
  );
}

export function FireCommandCenter({ data, testidPrefix = "s13-fire-command-center" }: Props) {
  const nw = data.currentNetWorth != null && Number.isFinite(data.currentNetWorth)
    ? formatCurrency(data.currentNetWorth, true)
    : null;
  const target = data.targetNetWorth != null && Number.isFinite(data.targetNetWorth)
    ? formatCurrency(data.targetNetWorth, true)
    : null;
  const gap = data.gap != null && Number.isFinite(data.gap)
    ? formatCurrency(data.gap, true)
    : null;
  const years = data.yearsRemaining != null && Number.isFinite(data.yearsRemaining)
    ? String(Math.round(data.yearsRemaining as number))
    : null;
  const targetYear = data.targetYear != null && Number.isFinite(data.targetYear)
    ? `to ${data.targetYear}`
    : null;
  const probability = data.probability != null && Number.isFinite(data.probability)
    ? `${Math.round((data.probability as number) * 100)}%`
    : null;
  const probabilityTone: TileProps["tone"] =
    data.probability == null
      ? "neutral"
      : (data.probability as number) >= 0.7
        ? "good"
        : (data.probability as number) >= 0.5
          ? "warn"
          : "danger";
  const gapTone: TileProps["tone"] =
    data.gap != null && (data.gap as number) > 0 ? "warn" : "neutral";

  return (
    <section
      data-testid={testidPrefix}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3"
    >
      <Tile
        label="Current Net Worth"
        value={nw}
        source={data.currentNetWorthSource}
        testid={`${testidPrefix}-current-nw`}
      />
      <Tile
        label="Target Net Worth"
        value={target}
        source={data.targetNetWorthSource}
        testid={`${testidPrefix}-target-nw`}
      />
      <Tile
        label="Gap"
        value={gap}
        sublabel={data.gap != null && (data.gap as number) > 0 ? "to close" : "closed"}
        source={data.gapSource}
        testid={`${testidPrefix}-gap`}
        tone={gapTone}
      />
      <Tile
        label="Years Remaining"
        value={years}
        sublabel={targetYear}
        source={data.yearsRemainingSource}
        testid={`${testidPrefix}-years-remaining`}
      />
      <Tile
        label="Probability"
        value={probability}
        sublabel="of reaching FIRE on time"
        source={data.probabilitySource}
        testid={`${testidPrefix}-probability`}
        tone={probabilityTone}
      />
    </section>
  );
}
