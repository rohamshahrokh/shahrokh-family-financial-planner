/**
 * CgtRegimeComparison.tsx — Current vs Reform CGT comparison.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - 3 headline tiles up top: Estimated tax · Net you keep · Difference
 *     (these are the only numbers most users will ever look at)
 *   - Full 8-step breakdown moves behind a "Show step-by-step" toggle
 *   - Soft surfaces, no harsh table grid, no bordered banner
 *   - Plain-English step labels ("Capital gain on sale" not "Gross capital gain")
 *
 * Public API (`CgtBranch`, `Props`) is unchanged from P1b.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned, fmtPct } from "./formatters";
import { type, tone as toneTokens, PLAIN_LABEL } from "./uxTokens";

export interface CgtBranch {
  grossGain: number;
  deferredLossesApplied: number;
  adjustedGain: number;
  discountPct: number;
  taxableGain: number;
  marginalRatePct: number;
  estimatedCgt: number;
  netSaleProceeds: number;
}

interface Props {
  current: CgtBranch;
  reform: CgtBranch;
  className?: string;
  title?: string;
}

interface RowProps {
  label: string;
  current: number;
  reform: number;
  isPct?: boolean;
  isSubtract?: boolean;
  bold?: boolean;
}

function Row({ label, current, reform, isPct, isSubtract, bold }: RowProps): JSX.Element {
  const delta = reform - current;
  const fmt = (v: number) => (isPct ? fmtPct(v) : isSubtract ? `−${fmtAud(v)}` : fmtAud(v));
  const deltaStr = isPct ? `${(delta * 100).toFixed(0)}pp` : fmtAudSigned(delta);
  const deltaTone =
    delta === 0
      ? toneTokens.soft
      : delta < 0
        ? toneTokens.bad
        : toneTokens.good;
  return (
    <div className={cn(
      "grid grid-cols-12 items-center gap-2 rounded-lg px-3 py-2.5",
      bold && "bg-[hsl(var(--surface-2))]",
    )}>
      <div className={cn(
        "col-span-5 text-sm",
        bold ? "font-semibold text-foreground" : "text-foreground/85",
      )}>
        {label}
      </div>
      <div className={cn("col-span-3 text-right tabular-nums text-sm", toneTokens.soft, bold && "text-foreground font-semibold")}>
        {fmt(current)}
      </div>
      <div className={cn("col-span-2 text-right tabular-nums text-sm", toneTokens.soft, bold && "text-foreground font-semibold")}>
        {fmt(reform)}
      </div>
      <div className={cn("col-span-2 text-right tabular-nums text-sm font-medium", deltaTone)}>
        {deltaStr}
      </div>
    </div>
  );
}

interface HeroTileProps {
  label: string;
  value: string;
  caption?: string;
  toneClass?: string;
  tintClass?: string;
}

function HeroTile({ label, value, caption, toneClass, tintClass }: HeroTileProps): JSX.Element {
  return (
    <div className={cn(
      "rounded-2xl p-4 sm:p-5 bg-[hsl(var(--surface-2))]",
      tintClass,
    )}>
      <div className={type.eyebrow}>{label}</div>
      <div className={cn("mt-1.5", type.hero, toneClass)}>{value}</div>
      {caption && <div className={cn("mt-1", type.caption)}>{caption}</div>}
    </div>
  );
}

export function CgtRegimeComparison({
  current, reform, className, title = "If you sold today: tax outcome",
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const taxDelta = reform.estimatedCgt - current.estimatedCgt;
  const proceedsDelta = reform.netSaleProceeds - current.netSaleProceeds;

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-0 shadow-[var(--shadow-sm)]",
        "bg-[hsl(var(--surface-1))]",
        className,
      )}
      data-testid="cgt-regime-comparison"
    >
      <CardHeader className="pb-2">
        <CardTitle className={type.sectionTitle}>{title}</CardTitle>
        <p className={cn(type.caption, "mt-1")}>
          Compares the capital gains tax you'd pay under today's rules and the proposed reform.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-2 sm:p-6 sm:pt-2">
        {/* Three hero tiles */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeroTile
            label="Tax you'd pay (today's rules)"
            value={fmtAud(current.estimatedCgt)}
            caption={`On a gain of ${fmtAud(current.grossGain)}`}
          />
          <HeroTile
            label="Tax you'd pay (proposed reform)"
            value={fmtAud(reform.estimatedCgt)}
            caption={`Discount: ${fmtPct(reform.discountPct)} · Marginal: ${fmtPct(reform.marginalRatePct)}`}
          />
          <HeroTile
            label="You'd pay more under reform"
            value={fmtAudSigned(taxDelta)}
            caption={
              proceedsDelta === 0
                ? "Net proceeds unchanged"
                : `Net proceeds change: ${fmtAudSigned(proceedsDelta)}`
            }
            toneClass={taxDelta > 0 ? toneTokens.bad : taxDelta < 0 ? toneTokens.good : toneTokens.soft}
          />
        </div>

        {/* Progressive disclosure — full step-by-step breakdown */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
            "text-xs font-medium text-muted-foreground hover:text-foreground",
            "hover:bg-[hsl(var(--surface-2))] transition-colors",
          )}
          data-testid="cgt-breakdown-toggle"
        >
          {expanded ? <>Hide step-by-step <ChevronUp className="h-3.5 w-3.5" /></> : <>Show step-by-step <ChevronDown className="h-3.5 w-3.5" /></>}
        </button>

        {expanded && (
          <div className="space-y-3">
            {/* Soft column header */}
            <div className="grid grid-cols-12 px-3 text-muted-foreground">
              <div className={cn("col-span-5", type.eyebrow)}>Step</div>
              <div className={cn("col-span-3 text-right", type.eyebrow)}>{PLAIN_LABEL.CURRENT}</div>
              <div className={cn("col-span-2 text-right", type.eyebrow)}>{PLAIN_LABEL.REFORM}</div>
              <div className={cn("col-span-2 text-right", type.eyebrow)}>{PLAIN_LABEL.DELTA}</div>
            </div>
            <div className="space-y-1">
              <Row label="Capital gain on sale" current={current.grossGain} reform={reform.grossGain} />
              <Row label="Less: deferred losses applied" current={current.deferredLossesApplied} reform={reform.deferredLossesApplied} isSubtract />
              <Row label="Adjusted gain" current={current.adjustedGain} reform={reform.adjustedGain} bold />
              <Row label="CGT discount" current={current.discountPct} reform={reform.discountPct} isPct />
              <Row label="Taxable gain" current={current.taxableGain} reform={reform.taxableGain} bold />
              <Row label="Marginal tax rate" current={current.marginalRatePct} reform={reform.marginalRatePct} isPct />
              <Row label="Estimated CGT" current={current.estimatedCgt} reform={reform.estimatedCgt} bold />
              <Row label="Net you keep after tax" current={current.netSaleProceeds} reform={reform.netSaleProceeds} bold />
            </div>
          </div>
        )}

        <p className={cn(type.caption, "italic opacity-70")}>
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default CgtRegimeComparison;
