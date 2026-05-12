/**
 * CgtRegimeComparison.tsx — Current vs Reform CGT three-line breakdown.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Renders the standard sequence required by the spec:
 *
 *   Gross Capital Gain
 *   − Deferred losses applied
 *   = Adjusted Capital Gain
 *   × CGT discount (50% current / 0% reform / custom)
 *   = Taxable gain
 *   × Marginal rate
 *   = Estimated CGT
 *   = Net sale proceeds
 *
 * Caller supplies the two CgtBranch objects (already computed off the P0
 * `cgt.ts` engine + regime overlay). Component never imports the engine.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned, fmtPct } from "./formatters";

export interface CgtBranch {
  grossGain: number;
  deferredLossesApplied: number;
  adjustedGain: number;
  discountPct: number;          // 0..1
  taxableGain: number;
  marginalRatePct: number;      // 0..1
  estimatedCgt: number;
  netSaleProceeds: number;
}

interface Props {
  current: CgtBranch;
  reform: CgtBranch;
  className?: string;
  /** Title override; default "CGT — Current vs Reform". */
  title?: string;
}

interface RowProps {
  label: string;
  current: number;
  reform: number;
  emphasis?: boolean;
  isPct?: boolean;
  isSubtract?: boolean;
}

function Row({ label, current, reform, emphasis, isPct, isSubtract }: RowProps): JSX.Element {
  const delta = reform - current;
  const fmt = (v: number): string => isPct ? fmtPct(v) : (isSubtract ? `−${fmtAud(v)}` : fmtAud(v));
  return (
    <div className={cn(
      "grid grid-cols-12 items-center gap-2 px-3 py-2",
      emphasis && "bg-muted/30 font-semibold",
    )}>
      <div className={cn("col-span-5 text-xs", emphasis && "text-sm")}>{label}</div>
      <div className="col-span-3 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-sm">
        {fmt(current)}
      </div>
      <div className="col-span-2 text-right text-xs tabular-nums text-amber-700 dark:text-amber-400 sm:text-sm">
        {fmt(reform)}
      </div>
      <div className={cn(
        "col-span-2 text-right text-xs tabular-nums sm:text-sm",
        delta < 0 ? "text-rose-600 dark:text-rose-400" : delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}>
        {isPct ? `${(delta * 100).toFixed(0)}pp` : fmtAudSigned(delta)}
      </div>
    </div>
  );
}

export function CgtRegimeComparison({ current, reform, className, title = "CGT — Current vs Reform" }: Props): JSX.Element {
  return (
    <Card className={cn("overflow-hidden", className)} data-testid="cgt-regime-comparison">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {title}
          <Badge variant="outline" className="text-[10px]">3-way breakdown</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-12 gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="col-span-5">Step</div>
          <div className="col-span-3 text-right text-emerald-700 dark:text-emerald-400">Current</div>
          <div className="col-span-2 text-right text-amber-700 dark:text-amber-400">Reform</div>
          <div className="col-span-2 text-right">Δ</div>
        </div>
        <div className="divide-y divide-border/30">
          <Row label="Gross capital gain" current={current.grossGain} reform={reform.grossGain} />
          <Row label="− Deferred losses applied" current={current.deferredLossesApplied} reform={reform.deferredLossesApplied} isSubtract />
          <Row label="Adjusted capital gain" current={current.adjustedGain} reform={reform.adjustedGain} emphasis />
          <Row label="× CGT discount" current={current.discountPct} reform={reform.discountPct} isPct />
          <Row label="Taxable gain" current={current.taxableGain} reform={reform.taxableGain} emphasis />
          <Row label="× Marginal rate" current={current.marginalRatePct} reform={reform.marginalRatePct} isPct />
          <Row label="Estimated CGT" current={current.estimatedCgt} reform={reform.estimatedCgt} emphasis />
          <Row label="Net sale proceeds" current={current.netSaleProceeds} reform={reform.netSaleProceeds} emphasis />
        </div>
        <div className="border-t border-border/40 bg-muted/20 px-3 py-2 text-[10px] italic text-muted-foreground">
          This is modelling only and not personal tax advice.
        </div>
      </CardContent>
    </Card>
  );
}

export default CgtRegimeComparison;
