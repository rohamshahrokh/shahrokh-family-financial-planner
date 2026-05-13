/**
 * TaxTimingDragSection.tsx — Cumulative drag visual.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Friendlier framing: "Same benefit, just later"
 *   - One hero number — the early-year cash drag — promoted to the top
 *   - Cleaner paired bars (rounded, softer) with stronger label legibility
 *   - Soft surfaces, no bordered banner
 *
 * Public API unchanged.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";
import { type, tone as toneTokens } from "./uxTokens";

export interface DragSeriesPoint {
  year: string;
  currentBenefit: number;
  reformBenefit: number;
}

interface Props {
  currentTotal: number;
  reformTotal: number;
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
  const maxBenefit = Math.max(1, ...series.map((p) => Math.max(p.currentBenefit, p.reformBenefit)));

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-0 shadow-[var(--shadow-sm)]",
        "bg-[hsl(var(--surface-1))]",
        className,
      )}
      data-testid="tax-timing-drag"
    >
      <CardHeader className="pb-2">
        <CardTitle className={type.sectionTitle}>Same benefit, just later</CardTitle>
        <p className={cn(type.caption, "mt-1")}>
          Under the proposed reform you still receive the tax benefit — it's just deferred. That means
          less cashflow in the early years, even if the lifetime amount is similar.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-5 pt-2 sm:p-6 sm:pt-2">
        {/* Hero — the early-year drag is the single most meaningful number here */}
        <div className="rounded-2xl bg-[hsl(var(--surface-2))] p-4 sm:p-5">
          <div className={type.eyebrow}>Cashflow drag in the first 5 years</div>
          <div className={cn("mt-1.5", type.hero, toneTokens.bad)}>
            {fmtAudSigned(cumulativeEarlyDrag)}
          </div>
          <div className={cn("mt-2 flex flex-wrap gap-x-4 gap-y-1", type.caption)}>
            <span>Today's rules total: <span className="text-foreground tabular-nums">{fmtAud(currentTotal)}</span></span>
            <span>Proposed reform total: <span className="text-foreground tabular-nums">{fmtAud(reformTotal)}</span></span>
          </div>
        </div>

        {/* Year bars */}
        <div className="space-y-3">
          <div className={cn(type.eyebrow, "flex items-center justify-between")}>
            <span>Tax benefit received each year</span>
            <span className="inline-flex items-center gap-3 normal-case tracking-normal text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Today's rules
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Proposed reform
              </span>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {series.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="flex h-20 w-full items-end gap-1">
                  <div
                    className="flex-1 rounded-md bg-emerald-500/70 dark:bg-emerald-400/70"
                    style={{ height: `${(p.currentBenefit / maxBenefit) * 100}%` }}
                    aria-label={`${p.year} current ${fmtAud(p.currentBenefit)}`}
                    title={`Today: ${fmtAud(p.currentBenefit)}`}
                  />
                  <div
                    className="flex-1 rounded-md bg-amber-500/70 dark:bg-amber-400/70"
                    style={{ height: `${(p.reformBenefit / maxBenefit) * 100}%` }}
                    aria-label={`${p.year} reform ${fmtAud(p.reformBenefit)}`}
                    title={`Reform: ${fmtAud(p.reformBenefit)}`}
                  />
                </div>
                <div className="text-[10px] font-medium text-muted-foreground">{p.year}</div>
              </div>
            ))}
          </div>
        </div>

        <p className={cn(type.caption, "italic opacity-70")}>
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default TaxTimingDragSection;
