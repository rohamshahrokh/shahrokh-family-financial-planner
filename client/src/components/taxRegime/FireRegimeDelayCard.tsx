/**
 * FireRegimeDelayCard.tsx — FIRE-year delta narrative card.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Compact card that surfaces:
 *   - FIRE under current rules (year + age + progress %)
 *   - FIRE under reform rules (year + age + progress %)
 *   - Delay/acceleration in plain English
 *   - Monthly investable surplus Δ
 *   - Passive income Δ at FIRE
 */

import { Flame, ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";

export interface FireRegimeBranch {
  bestFireYear: number;
  bestLabel?: string;
  ageAtFire?: number;
  progressPct?: number;
  monthlyInvestableSurplus: number;
  passiveIncomeAtFire: number;
}

interface Props {
  current: FireRegimeBranch;
  reform: FireRegimeBranch;
  /** True when at least one property qualifies for a reform carve-out. */
  hasCarveOutBenefit?: boolean;
  className?: string;
}

export function FireRegimeDelayCard({ current, reform, hasCarveOutBenefit, className }: Props): JSX.Element {
  const deltaYears = reform.bestFireYear - current.bestFireYear;
  const deltaSurplus = reform.monthlyInvestableSurplus - current.monthlyInvestableSurplus;
  const deltaPassive = reform.passiveIncomeAtFire - current.passiveIncomeAtFire;

  const headline = deltaYears > 0
    ? `FIRE delayed by ${deltaYears.toFixed(1)} years due to lower after-tax investable surplus.`
    : deltaYears < 0
    ? `FIRE accelerated by ${Math.abs(deltaYears).toFixed(1)} years under reform.`
    : "FIRE timing unchanged under reform.";

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="fire-regime-delay">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Flame className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-base font-semibold">FIRE — Current vs Reform</CardTitle>
          <Badge variant="outline" className={cn(
            "text-[10px]",
            deltaYears > 0 ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
              : deltaYears < 0 ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              : "",
          )}>
            {deltaYears > 0 ? `+${deltaYears.toFixed(1)} yrs` : deltaYears < 0 ? `${deltaYears.toFixed(1)} yrs` : "No change"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">{headline}</p>
        {hasCarveOutBenefit && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-50/30 p-2 text-[11px] text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              New-build / BTR / affordable-housing eligibility on one or more
              properties reduces this FIRE delay — the reform carve-outs preserve
              immediate negative-gearing treatment for those holdings.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Branch label="Current Rules" branch={current} accent="text-emerald-700 dark:text-emerald-300" />
          <Branch label="Reform" branch={reform} accent="text-amber-700 dark:text-amber-300" />
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-border/40 bg-muted/20 p-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly surplus Δ</div>
            <div className={cn(
              "text-base font-bold tabular-nums",
              deltaSurplus < 0 ? "text-rose-600 dark:text-rose-400" : deltaSurplus > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
            )}>
              {fmtAudSigned(deltaSurplus)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Passive income Δ at FIRE</div>
            <div className={cn(
              "text-base font-bold tabular-nums",
              deltaPassive < 0 ? "text-rose-600 dark:text-rose-400" : deltaPassive > 0 ? "text-emerald-600 dark:text-emerald-400" : "",
            )}>
              {fmtAudSigned(deltaPassive)}
            </div>
          </div>
        </div>
        <p className="text-[10px] italic text-muted-foreground">
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

function Branch({ label, branch, accent }: { label: string; branch: FireRegimeBranch; accent: string }): JSX.Element {
  const pct = Math.max(0, Math.min(100, branch.progressPct ?? 0));
  return (
    <div className="rounded-md border border-border/40 p-3">
      <div className="flex items-center gap-1.5">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", accent)}>{label}</span>
        {branch.bestLabel && <Badge variant="outline" className="text-[10px]">{branch.bestLabel}</Badge>}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums">{branch.bestFireYear}</span>
        {typeof branch.ageAtFire === "number" && (
          <span className="text-xs text-muted-foreground">at age {branch.ageAtFire}</span>
        )}
      </div>
      {typeof branch.progressPct === "number" && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Progress</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <div>
          <div className="text-muted-foreground">Monthly surplus</div>
          <div className="font-semibold tabular-nums">{fmtAud(branch.monthlyInvestableSurplus)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Passive @ FIRE</div>
          <div className="font-semibold tabular-nums">{fmtAud(branch.passiveIncomeAtFire)}</div>
        </div>
      </div>
    </div>
  );
}

export default FireRegimeDelayCard;
