/**
 * DeferredLossLedgerCard.tsx — Visual ledger of quarantined NG losses.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Renders the running carried-forward loss ledger (P0 carriedForwardLoss
 * engine) in a premium card. NOT a spreadsheet — uses sparkline-style
 * stacked bars to convey accumulation + expected usage timing.
 *
 * The component is presentation-only. Callers supply the rows (one per
 * year/FY) and the headline aggregates.
 */

import { Layers, ArrowDownToLine, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtAud } from "./formatters";

export interface DeferredLossRow {
  /** Year label (e.g. "FY26" or "2028"). */
  year: string;
  /** Accumulated balance at end of year. */
  balance: number;
  /** Amount applied this year against rental income. */
  appliedAgainstRent?: number;
  /** Amount realised this year against capital gain at disposal. */
  appliedAgainstCgt?: number;
}

interface Props {
  /** Headline: total accumulated balance at end of horizon. */
  totalBalance: number;
  /** Estimated tax value of the balance (balance × marginal rate). */
  estimatedTaxValue: number;
  /** Expected timing of utilisation in plain English. */
  expectedUsageNarrative?: string;
  /** Per-year breakdown — recommended 5-10 rows. */
  rows: DeferredLossRow[];
  className?: string;
}

export function DeferredLossLedgerCard({
  totalBalance,
  estimatedTaxValue,
  expectedUsageNarrative,
  rows,
  className,
}: Props): JSX.Element {
  const maxBalance = Math.max(1, ...rows.map((r) => r.balance));
  const maxApplied = Math.max(
    1,
    ...rows.map((r) => (r.appliedAgainstRent ?? 0) + (r.appliedAgainstCgt ?? 0)),
  );

  return (
    <Card className={cn("overflow-hidden border-violet-200/50 dark:border-violet-900/40", className)} data-testid="deferred-loss-ledger">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <CardTitle className="text-base font-semibold">Deferred Loss Ledger</CardTitle>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Reform pathway
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Accumulated balance
            </div>
            <div className="text-lg font-bold tabular-nums">{fmtAud(totalBalance)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Estimated tax value
            </div>
            <div className="text-lg font-bold tabular-nums text-violet-700 dark:text-violet-400">
              {fmtAud(estimatedTaxValue)}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Expected usage
            </div>
            <div className="flex items-center gap-1 text-sm font-medium">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{expectedUsageNarrative ?? "At disposal"}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Per-year balance (rear-bar) vs applied (front-bar)</span>
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-violet-500/70" /> Balance
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Applied
              </span>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {rows.map((r, i) => {
              const balancePct = (r.balance / maxBalance) * 100;
              const applied = (r.appliedAgainstRent ?? 0) + (r.appliedAgainstCgt ?? 0);
              const appliedPct = (applied / maxApplied) * 100;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="relative flex h-20 w-full items-end">
                    <div
                      className="w-full rounded-sm bg-violet-500/30 dark:bg-violet-500/40"
                      style={{ height: `${balancePct}%` }}
                      aria-label={`${r.year} balance ${fmtAud(r.balance)}`}
                    />
                    <div
                      className="absolute bottom-0 left-1/4 w-1/2 rounded-sm bg-emerald-500/80"
                      style={{ height: `${appliedPct}%` }}
                      aria-label={`${r.year} applied ${fmtAud(applied)}`}
                    />
                  </div>
                  <div className="text-[9px] font-medium text-muted-foreground">{r.year}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
          <ArrowDownToLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Under proposed 2027 reform, negative-gearing losses on established
            properties are quarantined and carried forward. They can offset
            future rental income from the same property, and any remainder
            applies against the capital gain at disposal. You still receive
            the tax benefit — it's just deferred.
          </span>
        </div>
        <p className="text-[10px] italic text-muted-foreground">
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default DeferredLossLedgerCard;
