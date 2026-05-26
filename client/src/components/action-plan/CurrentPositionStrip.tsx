/**
 * CurrentPositionStrip — Section A of the Action Plan page.
 *
 * Pure projection of EXISTING canonical selectors. No new financial logic.
 * Each KPI shows a value sourced from a single canonical helper:
 *   1. Net Worth         — computeCanonicalHeadlineMetrics().netWorth
 *   2. Monthly Surplus   — computeCanonicalHeadlineMetrics().monthlySurplus
 *   3. FIRE Progress %   — computeCanonicalFire().progressFraction × 100
 *   4. Forecast Status   — derived from readLatestQuickDecisionGeneratedAt()
 *   5. Top Risk          — computeRiskRadar().top_risks[0]
 *
 * TODO(sprint-14.1): add SourceTag once the shared component lands.
 */

import * as React from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import type { RiskRadarResult } from "@/lib/riskEngine";
import { computeCanonicalHeadlineMetrics } from "@/lib/canonicalHeadlineMetrics";
import { computeCanonicalFire } from "@/lib/canonicalFire";
import { readLatestQuickDecisionGeneratedAt } from "@/lib/recommendationEngine/bestMoveBridge";
import { formatCurrency } from "@/lib/finance";

export interface CurrentPositionStripProps {
  canonicalLedger: DashboardInputs | null;
  riskOutputs: RiskRadarResult | null;
}

interface KpiTile {
  label: string;
  value: string;
  source: string;
  tone?: "ok" | "warn" | "muted";
}

function KpiCard({ tile }: { tile: KpiTile }) {
  const color =
    tile.tone === "warn" ? "hsl(var(--danger))" :
    tile.tone === "ok"   ? "hsl(var(--success))" :
    "hsl(var(--foreground))";
  return (
    <div
      className="rounded-lg border bg-card px-3 py-2.5 flex flex-col gap-1 min-w-0"
      style={{ borderColor: "hsl(var(--border))" }}
      data-testid={`action-plan-kpi-${tile.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground truncate">
        {tile.label}
      </span>
      <span
        className="text-base sm:text-lg font-bold num-display leading-tight truncate"
        style={{ color }}
      >
        {tile.value}
      </span>
      <span className="text-[10px] text-muted-foreground/70 truncate">
        {tile.source}
      </span>
    </div>
  );
}

export function CurrentPositionStrip({ canonicalLedger, riskOutputs }: CurrentPositionStripProps) {
  const head = canonicalLedger
    ? computeCanonicalHeadlineMetrics(canonicalLedger)
    : null;
  const fire = canonicalLedger
    ? computeCanonicalFire(canonicalLedger)
    : null;
  const decisionAt = readLatestQuickDecisionGeneratedAt();
  const topRisk = riskOutputs?.top_risks?.[0] ?? null;

  const fireProgressPct = fire && fire.fireNumber > 0
    ? fire.progressFraction * 100
    : null;

  let forecastStatus: { label: string; tone: KpiTile["tone"] };
  if (!decisionAt) {
    forecastStatus = { label: "MISSING", tone: "warn" };
  } else {
    const ageHours = (Date.now() - new Date(decisionAt).getTime()) / 3_600_000;
    if (ageHours <= 24)       forecastStatus = { label: "FRESH",   tone: "ok"    };
    else if (ageHours <= 168) forecastStatus = { label: "STALE",   tone: "warn"  };
    else                      forecastStatus = { label: "MISSING", tone: "warn"  };
  }

  const tiles: KpiTile[] = [
    {
      label: "Net Worth",
      value: head ? formatCurrency(head.netWorth) : "—",
      source: "canonicalHeadlineMetrics",
    },
    {
      label: "Monthly Surplus",
      value: head ? formatCurrency(head.monthlySurplus) : "—",
      source: "canonicalHeadlineMetrics",
      tone: head ? (head.monthlySurplus < 0 ? "warn" : "ok") : "muted",
    },
    {
      label: "FIRE Progress",
      value: fireProgressPct !== null ? `${fireProgressPct.toFixed(1)}%` : "—",
      source: "canonicalFire",
    },
    {
      label: "Forecast Status",
      value: forecastStatus.label,
      source: "decision session-store",
      tone: forecastStatus.tone,
    },
    {
      label: "Top Risk",
      value: topRisk?.label ?? "—",
      source: "riskEngine.top_risks[0]",
      tone: topRisk ? "warn" : "muted",
    },
  ];

  return (
    <section
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3"
      data-testid="action-plan-current-position-strip"
    >
      {tiles.map(t => <KpiCard key={t.label} tile={t} />)}
    </section>
  );
}
