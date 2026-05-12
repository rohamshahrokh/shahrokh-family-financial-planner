/**
 * FireRegimeDelayCard.tsx — FIRE delay narrative card.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Hero number = delta years (the single most meaningful figure)
 *   - Branch tiles use soft surfaces, no borders, larger year display
 *   - Carve-out note becomes a soft positive callout, not a bordered card
 *   - Reduced number-density per tile — only the FIRE year is hero,
 *     everything else is supporting
 *
 * Public API (`FireRegimeBranch`, `Props`) unchanged.
 */

import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";
import { type, tone as toneTokens } from "./uxTokens";

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
  hasCarveOutBenefit?: boolean;
  className?: string;
}

export function FireRegimeDelayCard({ current, reform, hasCarveOutBenefit, className }: Props): JSX.Element {
  const deltaYears = reform.bestFireYear - current.bestFireYear;
  const deltaSurplus = reform.monthlyInvestableSurplus - current.monthlyInvestableSurplus;
  const deltaPassive = reform.passiveIncomeAtFire - current.passiveIncomeAtFire;

  const deltaTone =
    deltaYears > 0 ? toneTokens.bad : deltaYears < 0 ? toneTokens.good : toneTokens.soft;

  const headline =
    deltaYears > 0
      ? `Your retirement is delayed by ${deltaYears.toFixed(1)} years`
      : deltaYears < 0
        ? `Your retirement comes ${Math.abs(deltaYears).toFixed(1)} years sooner`
        : "Your retirement timing is unchanged";

  const subhead =
    deltaYears > 0
      ? "Lower after-tax cashflow slows your saving pace"
      : deltaYears < 0
        ? "Higher after-tax cashflow accelerates your saving pace"
        : "The reform doesn't shift your timeline";

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-0 shadow-[var(--shadow-sm)]",
        "bg-[hsl(var(--surface-1))]",
        className,
      )}
      data-testid="fire-regime-delay"
    >
      <CardHeader className="pb-2">
        <CardTitle className={type.sectionTitle}>Path to retirement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5 pt-2 sm:p-6 sm:pt-2">
        {/* Hero strip */}
        <div className="rounded-2xl bg-[hsl(var(--surface-2))] p-4 sm:p-5">
          <div className={type.eyebrow}>Reform impact on your retirement</div>
          <div className={cn("mt-1.5", type.hero, deltaTone)}>
            {deltaYears === 0
              ? "Unchanged"
              : `${deltaYears > 0 ? "+" : "−"}${Math.abs(deltaYears).toFixed(1)} yrs`}
          </div>
          <p className={cn("mt-1", type.body)}>{headline}</p>
          <p className={cn("mt-0.5", type.caption)}>{subhead}</p>
        </div>

        {/* Carve-out note */}
        {hasCarveOutBenefit && (
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/[0.07] dark:bg-emerald-500/[0.10] px-3.5 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p className={cn(type.body, "text-emerald-700 dark:text-emerald-300")}>
              Good news — at least one of your properties qualifies for the new-build carve-out, which softens the delay.
            </p>
          </div>
        )}

        {/* Branch tiles */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Branch label="Today's rules" branch={current} dotClass="bg-emerald-500" />
          <Branch label="Proposed reform" branch={reform} dotClass="bg-amber-500" />
        </div>

        {/* Secondary deltas — tucked at bottom, smaller */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <div className={type.eyebrow}>Monthly cashflow change</div>
            <div className={cn("mt-1", type.number, deltaSurplus < 0 ? toneTokens.bad : deltaSurplus > 0 ? toneTokens.good : toneTokens.soft)}>
              {fmtAudSigned(deltaSurplus)}
            </div>
          </div>
          <div>
            <div className={type.eyebrow}>Passive income at retirement</div>
            <div className={cn("mt-1", type.number, deltaPassive < 0 ? toneTokens.bad : deltaPassive > 0 ? toneTokens.good : toneTokens.soft)}>
              {fmtAudSigned(deltaPassive)}
            </div>
          </div>
        </div>

        <p className={cn(type.caption, "italic opacity-70")}>
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

function Branch({
  label, branch, dotClass,
}: { label: string; branch: FireRegimeBranch; dotClass: string }): JSX.Element {
  const pct = Math.max(0, Math.min(100, branch.progressPct ?? 0));
  return (
    <div className="rounded-2xl bg-[hsl(var(--surface-2))] p-4">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <span className={type.eyebrow}>{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={cn(type.hero, "leading-none")}>{branch.bestFireYear}</span>
        {typeof branch.ageAtFire === "number" && (
          <span className={type.caption}>at age {branch.ageAtFire}</span>
        )}
      </div>
      {typeof branch.progressPct === "number" && (
        <div className="mt-3 space-y-1">
          <div className={cn("flex items-center justify-between", type.caption)}>
            <span>Progress today</span>
            <span className="tabular-nums">{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}
      <div className="mt-3 flex items-baseline justify-between">
        <span className={type.caption}>Saving each month</span>
        <span className={cn(type.numberSm, "text-foreground")}>{fmtAud(branch.monthlyInvestableSurplus)}</span>
      </div>
    </div>
  );
}

export default FireRegimeDelayCard;
