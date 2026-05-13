/**
 * DeferredLossLedgerCard.tsx — Visual ledger of carry-forward losses.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Reframed in plain English: "Locked-in losses you can use later"
 *   - Hero number = the tax saving you'll eventually recover, not the
 *     raw balance (more meaningful to the user)
 *   - Calmer bar chart — single soft violet, no double-stacked
 *     overlay; emerald dot marks the years applied
 *   - Explanatory note becomes a single soft caption, not a bordered card
 *
 * Public API (`DeferredLossRow`, `Props`) unchanged from P1b.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtAud } from "./formatters";
import { type, tone as toneTokens } from "./uxTokens";

export interface DeferredLossRow {
  year: string;
  balance: number;
  appliedAgainstRent?: number;
  appliedAgainstCgt?: number;
}

interface Props {
  totalBalance: number;
  estimatedTaxValue: number;
  expectedUsageNarrative?: string;
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

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-0 shadow-[var(--shadow-sm)]",
        "bg-[hsl(var(--surface-1))]",
        className,
      )}
      data-testid="deferred-loss-ledger"
    >
      <CardHeader className="pb-2">
        <CardTitle className={type.sectionTitle}>Locked-in losses you can use later</CardTitle>
        <p className={cn(type.caption, "mt-1")}>
          Under the proposed reform, losses on established properties can't be deducted today —
          but they carry forward and offset rental income or capital gains in future years.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-5 pt-2 sm:p-6 sm:pt-2">
        {/* Hero pair: tax value (primary) + balance (secondary) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[hsl(var(--surface-2))] p-4 sm:p-5">
            <div className={type.eyebrow}>Estimated tax you'll recover</div>
            <div className={cn("mt-1.5", type.hero, "text-violet-600 dark:text-violet-400")}>
              {fmtAud(estimatedTaxValue)}
            </div>
            <p className={cn("mt-1", type.caption)}>
              {expectedUsageNarrative ?? "Applied when you sell the property"}
            </p>
          </div>
          <div className="rounded-2xl bg-[hsl(var(--surface-2))] p-4 sm:p-5">
            <div className={type.eyebrow}>Total carry-forward balance</div>
            <div className={cn("mt-1.5", type.hero, toneTokens.soft)}>
              {fmtAud(totalBalance)}
            </div>
            <p className={cn("mt-1", type.caption)}>
              Across the household, end of modelling horizon
            </p>
          </div>
        </div>

        {/* Per-year bar chart — calmer, single colour, ratio bars */}
        <div className="space-y-3">
          <div className={cn(type.eyebrow, "flex items-center justify-between")}>
            <span>Carry-forward balance by year</span>
            <span className="inline-flex items-center gap-3 normal-case tracking-normal text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400/80" />
                Balance
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
                Applied
              </span>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {rows.map((r, i) => {
              const balancePct = (r.balance / maxBalance) * 100;
              const applied = (r.appliedAgainstRent ?? 0) + (r.appliedAgainstCgt ?? 0);
              return (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="relative flex h-24 w-full items-end">
                    <div
                      className="w-full rounded-md bg-violet-500/30 dark:bg-violet-400/30"
                      style={{ height: `${balancePct}%` }}
                      aria-label={`${r.year}: balance ${fmtAud(r.balance)}`}
                      title={`Balance: ${fmtAud(r.balance)}`}
                    />
                    {applied > 0 && (
                      <span
                        className="absolute left-1/2 bottom-1 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-emerald-400"
                        title={`Applied: ${fmtAud(applied)}`}
                      />
                    )}
                  </div>
                  <div className="text-[10px] font-medium text-muted-foreground">{r.year}</div>
                </div>
              );
            })}
          </div>
        </div>

        <p className={cn(type.caption, "italic opacity-70")}>
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default DeferredLossLedgerCard;
