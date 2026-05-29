/**
 * MonteCarloProjectionSection — Action Roadmap S3 (Sprint 28).
 *
 * P25 / P50 / P75 columns for FIRE age, net worth at FIRE, passive income at
 * FIRE. Each cell wears a SourceChip; missing values render "Not modelled
 * yet". Desktop = table; mobile (< sm) = stacked cards.
 */
import * as React from "react";
import { LineChart } from "lucide-react";
import type { MonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import { SourceChip } from "@/components/SourceChip";
import type { MetricSource } from "@/lib/actionRoadmap/metricSourceAttribution";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtAge(n: number | null): string {
  return n == null ? "Not modelled yet" : `${n}`;
}

const COLS = ["p25", "p50", "p75"] as const;
type Col = (typeof COLS)[number];

export interface MonteCarloProjectionSectionProps {
  mc: MonteCarloProjection;
  auditMode: boolean;
}

export function MonteCarloProjectionSection({ mc, auditMode }: MonteCarloProjectionSectionProps) {
  const rows: Array<{ label: string; fmt: (v: number | null) => string; values: Record<Col, number | null> }> = [
    { label: "FIRE age",            fmt: fmtAge,   values: mc.fireAge },
    { label: "Net worth at FIRE",   fmt: fmtMoney, values: mc.netWorthAtFire },
    { label: "Passive income at FIRE", fmt: fmtMoney, values: mc.passiveIncomeAtFire },
  ];

  const sourceOf = (v: number | null): MetricSource => (v == null ? "notModelled" : "scenarioV2.monteCarlo");

  return (
    <section
      data-testid="ar-section-monte-carlo"
      aria-labelledby="ar-s3-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <LineChart className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monte Carlo projection</div>
          <h2 id="ar-s3-heading" className="text-base font-semibold text-foreground">Range across {mc.simulationCount} simulations</h2>
        </div>
      </div>

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full text-sm" data-testid="ar-s3-table">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1.5"></th>
              <th className="px-2 py-1.5">P25 (slower)</th>
              <th className="px-2 py-1.5">P50 (median)</th>
              <th className="px-2 py-1.5">P75 (faster)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/60">
                <td className="px-2 py-2 font-medium text-foreground">{r.label}</td>
                {COLS.map((c) => (
                  <td key={c} className="px-2 py-2" data-testid={`ar-s3-${r.label.toLowerCase().replace(/\s+/g, "-")}-${c}`}>
                    <div className="text-foreground">{r.fmt(r.values[c])}</div>
                    <div className="mt-1">
                      <SourceChip
                        attribution={{ source: sourceOf(r.values[c]), percentile: c, simulationCount: mc.simulationCount }}
                        auditMode={auditMode}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="mt-4 space-y-3 sm:hidden" data-testid="ar-s3-mobile">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-border/60 bg-background/60 p-3">
            <div className="text-sm font-medium text-foreground">{r.label}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {COLS.map((c) => (
                <div key={c}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c.toUpperCase()}</div>
                  <div className="text-sm text-foreground">{r.fmt(r.values[c])}</div>
                  <div className="mt-1">
                    <SourceChip
                      attribution={{ source: sourceOf(r.values[c]), percentile: c, simulationCount: mc.simulationCount }}
                      auditMode={auditMode}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default MonteCarloProjectionSection;
