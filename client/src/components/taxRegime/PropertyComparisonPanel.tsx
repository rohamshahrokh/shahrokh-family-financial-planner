/**
 * PropertyComparisonPanel.tsx — Side-by-side Current vs Reform vs Delta.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Renders the per-scenario regime comparison returned by
 * `computePropertyBuyBothRegimes` (P1 engine overlay). The panel is
 * presentation-only — it never calls engines. Callers compute the
 * `BothRegimesResult` once and pass it in.
 *
 * Layout:
 *   - desktop: 3-column grid (Current | Reform | Δ)
 *   - mobile : stacked rows, each row a metric with three values
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned, fmtPct, fmtPctPoints, senseTone } from "./formatters";

export interface PropertyComparisonRow {
  /** Row label (e.g., "Monthly cashflow"). */
  label: string;
  /** Compact subtitle / hint. */
  hint?: string;
  /** Numeric values under each regime. */
  current?: number | null;
  reform?: number | null;
  /** Delta = reform − current. Caller may pass it pre-computed if the
   *  derivation is non-trivial; otherwise it's auto-derived. */
  delta?: number | null;
  /** Which way is "good" for the user. Used to colour the delta. */
  sense?: "more-better" | "less-better";
  /** Formatter — currency by default. */
  format?: "currency" | "percent" | "percent-points" | "years";
}

interface Props {
  title: string;
  subtitle?: string;
  regimeLabelReform?: string; // override "Reform" header
  rows: PropertyComparisonRow[];
  className?: string;
}

function formatValue(v: number | null | undefined, fmt: PropertyComparisonRow["format"]): string {
  switch (fmt) {
    case "percent":         return fmtPct(v);
    case "percent-points":  return fmtPctPoints(v);
    case "years":           return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(1)} yrs`;
    case "currency":
    default:                return fmtAud(v);
  }
}

function formatDelta(v: number | null | undefined, fmt: PropertyComparisonRow["format"]): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  switch (fmt) {
    case "percent":
    case "percent-points":
      return fmtPctPoints(v);
    case "years":
      return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " yrs";
    case "currency":
    default:
      return fmtAudSigned(v);
  }
}

function DeltaIcon({ delta, sense }: { delta?: number | null; sense?: "more-better" | "less-better" }): JSX.Element {
  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) {
    return <Minus className="h-3.5 w-3.5" />;
  }
  const favorable = (sense === "less-better" ? delta < 0 : delta > 0);
  return favorable
    ? <TrendingUp className="h-3.5 w-3.5" />
    : <TrendingDown className="h-3.5 w-3.5" />;
}

export function PropertyComparisonPanel({
  title,
  subtitle,
  regimeLabelReform = "Reform",
  rows,
  className,
}: Props): JSX.Element {
  return (
    <Card className={cn("overflow-hidden", className)} data-testid="property-comparison-panel">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Current vs {regimeLabelReform}
          </Badge>
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {/* Header row — hidden on mobile */}
        <div className="hidden grid-cols-12 gap-3 border-b border-border/40 bg-muted/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-5">Metric</div>
          <div className="col-span-2 text-right text-emerald-700 dark:text-emerald-400">Current</div>
          <div className="col-span-2 text-right text-amber-700 dark:text-amber-400">{regimeLabelReform}</div>
          <div className="col-span-3 text-right">Δ Reform − Current</div>
        </div>
        <div className="divide-y divide-border/40">
          {rows.map((row, i) => {
            const computedDelta =
              row.delta !== undefined
                ? row.delta
                : (typeof row.reform === "number" && typeof row.current === "number"
                    ? row.reform - row.current
                    : null);
            const tone = senseTone(computedDelta, row.sense ?? "more-better");
            return (
              <div key={i} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-12 md:items-center md:gap-3">
                <div className="md:col-span-5">
                  <div className="text-sm font-medium text-foreground">{row.label}</div>
                  {row.hint && (
                    <div className="text-[10px] leading-snug text-muted-foreground">{row.hint}</div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 md:col-span-7 md:grid md:grid-cols-7">
                  <div className="text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 md:col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground md:hidden">Current</span>
                    <span className="ml-2 md:ml-0">{formatValue(row.current, row.format)}</span>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400 md:col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground md:hidden">{regimeLabelReform}</span>
                    <span className="ml-2 md:ml-0">{formatValue(row.reform, row.format)}</span>
                  </div>
                  <div className={cn("flex items-center justify-end gap-1 text-sm font-semibold tabular-nums md:col-span-3", tone)}>
                    <DeltaIcon delta={computedDelta} sense={row.sense} />
                    <span>{formatDelta(computedDelta, row.format)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border/40 bg-muted/20 px-4 py-2 text-[10px] italic text-muted-foreground">
          This is modelling only and not personal tax advice.
        </div>
      </CardContent>
    </Card>
  );
}

export default PropertyComparisonPanel;
