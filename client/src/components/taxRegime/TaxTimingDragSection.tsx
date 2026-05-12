/**
 * TaxTimingDragSection.tsx — Cumulative drag visual.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Communicates the core narrative: under reform you still receive the
 * negative-gearing tax benefit, but later. Renders a small inline area
 * comparison of immediate vs deferred benefit and cumulative drag.
 *
 * Purely presentational. Caller supplies the year-by-year arrays.
 */

import { Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";

export interface DragSeriesPoint {
  year: string;
  /** Tax benefit realised in this year under CURRENT rules ($/yr). */
  currentBenefit: number;
  /** Tax benefit realised in this year under REFORM ($/yr; later). */
  reformBenefit: number;
}

interface Props {
  /** Total benefit realised under current rules across the horizon. */
  currentTotal: number;
  /** Total benefit realised under reform across the horizon (may be lower if some
   *  losses unutilised by the horizon). */
  reformTotal: number;
  /** Cumulative drag $ in early years (negative = drag). */
  cumulativeEarlyDrag: number;
  series: DragSeriesPoint[];
  className?: string;
}

export function TaxTimingDragSection({
  currentTotal,
  reformTotal,
  cumulativeEarlyDrag,
  series,
  className,
}: Props): JSX.Element {
  const maxBenefit = Math.max(
    1,
    ...series.map((p) => Math.max(p.currentBenefit, p.reformBenefit)),
  );

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="tax-timing-drag">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Clock3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-base font-semibold">Tax Timing Drag</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Same benefit, later
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          You still receive the tax benefit, but later. Delayed benefits reduce
          early-year cashflow and slow capital accumulation.
        </p>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Current total
            </div>
            <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {fmtAud(currentTotal)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reform total
            </div>
            <div className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {fmtAud(reformTotal)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Early-year drag
            </div>
            <div className="text-base font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {fmtAudSigned(cumulativeEarlyDrag)}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Year-by-year benefit realisation</span>
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500/80" /> Current
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber-500/80" /> Reform
              </span>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {series.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div className="flex h-16 w-full items-end gap-0.5">
                  <div
                    className="flex-1 rounded-sm bg-emerald-500/70"
                    style={{ height: `${(p.currentBenefit / maxBenefit) * 100}%` }}
                    aria-label={`${p.year} current ${fmtAud(p.currentBenefit)}`}
                  />
                  <div
                    className="flex-1 rounded-sm bg-amber-500/80"
                    style={{ height: `${(p.reformBenefit / maxBenefit) * 100}%` }}
                    aria-label={`${p.year} reform ${fmtAud(p.reformBenefit)}`}
                  />
                </div>
                <div className="text-[9px] font-medium text-muted-foreground">{p.year}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] italic text-muted-foreground">
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default TaxTimingDragSection;
