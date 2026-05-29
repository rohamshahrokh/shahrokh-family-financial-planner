/**
 * NetWorthAttribution — Action Roadmap S4 (Sprint 28B).
 *
 * Stacked horizontal bar (component shares) + table (value, share %)
 * + TOTAL row. Audit-mode-aware reconciliation warning banner appears
 * when the engine's terminal-state sum drifts > 1% from the MC fan P50
 * at the same horizon.
 *
 * Honesty: when `attribution` is null we render the literal "Not modelled
 * yet" empty state.
 */
import * as React from "react";
import { PieChart, AlertTriangle } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { NetWorthCategory } from "@/lib/actionRoadmap/netWorthAttribution";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

const CATEGORY_COLOR: Record<NetWorthCategory, string> = {
  ppor:                "bg-violet-500",
  investment_property: "bg-blue-500",
  etf:                 "bg-emerald-500",
  super:               "bg-teal-500",
  cash:                "bg-amber-500",
  crypto:              "bg-fuchsia-500",
  other:               "bg-neutral-500",
};

export function NetWorthAttribution(props: RoadmapSectionProps) {
  const { attribution, auditMode } = props;

  if (!attribution) {
    return (
      <section
        data-testid="ar-s4-nw-attribution"
        aria-labelledby="ar-s4-heading"
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
      >
        <SectionHeader />
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-s4-empty">Not modelled yet.</p>
      </section>
    );
  }

  const { components, total, reconciliation } = attribution;
  const showAuditBanner = !reconciliation.withinTolerance;

  return (
    <section
      data-testid="ar-s4-nw-attribution"
      aria-labelledby="ar-s4-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <SectionHeader />

      {showAuditBanner && auditMode && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100"
          data-testid="ar-s4-recon-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            NW reconciliation drift: {fmtMoney(Math.abs(reconciliation.diffAbsolute))} ({(reconciliation.diffPct * 100).toFixed(2)}%).
            Sum of components ({fmtMoney(reconciliation.p50FromSum)}) does not match Monte Carlo P50
            ({fmtMoney(reconciliation.p50FromFan)}) within tolerance.
          </div>
        </div>
      )}

      {/* Stacked bar */}
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="flex h-full w-full">
          {components.map((c) => (
            <div
              key={c.category}
              className={CATEGORY_COLOR[c.category]}
              style={{ width: `${Math.max(0, c.share * 100)}%` }}
              title={`${c.label} (${(c.share * 100).toFixed(0)}%)`}
            />
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="mt-4 w-full text-sm" data-testid="ar-s4-table">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5">Component</th>
            <th className="px-2 py-1.5 text-right">Value</th>
            <th className="px-2 py-1.5 text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.category} className="border-t border-border/60" data-testid={`ar-s4-row-${c.category}`}>
              <td className="px-2 py-2">
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${CATEGORY_COLOR[c.category]}`} aria-hidden />
                <span className="text-foreground">{c.label}</span>
              </td>
              <td className="px-2 py-2 text-right text-foreground">{fmtMoney(c.value)}</td>
              <td className="px-2 py-2 text-right text-foreground">{(c.share * 100).toFixed(0)}%</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border/80 font-semibold">
            <td className="px-2 py-2 text-foreground" data-testid="ar-s4-total-label">
              TOTAL
              {showAuditBanner && !auditMode && (
                <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
              )}
            </td>
            <td className="px-2 py-2 text-right text-foreground" data-testid="ar-s4-total-value">{fmtMoney(total)}</td>
            <td className="px-2 py-2 text-right text-foreground">100%</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <SourceChip
          attribution={{ source: "scenarioV2.monteCarlo", percentile: "p50", note: "Terminal medianFinalState" }}
          auditMode={auditMode}
        />
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-start gap-2">
      <PieChart className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net worth attribution</div>
        <h2 id="ar-s4-heading" className="text-base font-semibold text-foreground">Projected net worth at FIRE</h2>
      </div>
    </div>
  );
}

export default NetWorthAttribution;
