/**
 * NetWorthAuditPanel — Sprint 13 P0-1 audit overlay.
 *
 * Renders the lineage trace returned by `selectCanonicalNetWorthBreakdown()`:
 * each component value, its source table / field / query / formula, and
 * the reconciliation status. Visible by default in dev OR when `?audit=1`
 * is present in the URL.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/finance";
import type { NetWorthBreakdown } from "@/lib/netWorthBreakdown";

interface Props {
  breakdown: NetWorthBreakdown;
  testidPrefix?: string;
  alwaysShow?: boolean;
}

function inAuditMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("audit") === "1") return true;
  } catch {
    /* ignore */
  }
  return (
    typeof process !== "undefined" &&
    typeof (process as any).env?.NODE_ENV === "string" &&
    (process as any).env.NODE_ENV !== "production"
  );
}

export function NetWorthAuditPanel({
  breakdown,
  testidPrefix = "s13-nw-audit-panel",
  alwaysShow = false,
}: Props) {
  const visible = alwaysShow || inAuditMode();
  if (!visible) return null;

  return (
    <Card
      className="p-3 sm:p-4 border-dashed border-amber-500/40 bg-amber-500/5"
      data-testid={testidPrefix}
    >
      <header className="mb-2">
        <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Audit · Net Worth lineage
        </div>
        <div className="flex items-baseline gap-3 mt-0.5">
          <span className="text-sm font-semibold text-foreground">
            Net worth = {formatCurrency(breakdown.netWorth, true)}
          </span>
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded-sm border ${
              breakdown.reconciled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}
            data-testid={`${testidPrefix}-reconciled`}
          >
            {breakdown.reconciled ? "RECONCILED ($1 tolerance)" : "RECONCILE FAILED"}
          </span>
          {!breakdown.reconciled ? (
            <span
              className="text-[11px] text-rose-700 dark:text-rose-300"
              data-testid={`${testidPrefix}-delta`}
            >
              Δ {formatCurrency(breakdown.reconcileDelta, true)}
            </span>
          ) : null}
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed">
        {breakdown.lineage.map((row) => (
          <div
            key={row.component}
            className="rounded-sm border border-amber-500/20 bg-card/60 p-2"
            data-testid={`s13-nw-line-${row.component}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="tabular-nums font-mono text-foreground">
                {formatCurrency(row.value, true)}
              </span>
            </div>
            <div className="mt-0.5 text-muted-foreground">
              <span className="font-mono">{row.sourceTable}</span> ·{" "}
              <span className="font-mono">{row.sourceField}</span>
            </div>
            <div className="text-muted-foreground/80 italic">{row.formula}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default NetWorthAuditPanel;
