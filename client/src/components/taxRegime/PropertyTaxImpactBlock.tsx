/**
 * PropertyTaxImpactBlock.tsx — Per-property tax classification + impact strip.
 *
 * #FWL_TAX_REFORM_LIVE_INTEGRATION
 *
 * Compact strip rendered inside each PropertyCard on /property. Shows:
 *   - Classification (Grandfathered / Reform affected / New build carve-out)
 *   - NG eligibility status
 *   - Annual refund impact (current vs reform)
 *   - Loss bank balance carried into this FY
 *   - After-tax monthly cashflow under reform
 *   - CGT treatment type
 *   - Classification reason
 *
 * Pure presentational — calls the canonical `taxRulesEngine` adapter only.
 */

import { useMemo } from "react";
import {
  singlePropertyTaxImpact,
  type PortfolioPropertyRow,
} from "@/lib/tax/propertyPortfolioTaxImpact";
import { fmtAud } from "./formatters";

interface Props {
  property: PortfolioPropertyRow;
  wageIncome: number;
  className?: string;
}

export function PropertyTaxImpactBlock({
  property, wageIncome, className,
}: Props): JSX.Element | null {
  const impact = useMemo(
    () => singlePropertyTaxImpact(property, wageIncome),
    [property, wageIncome],
  );
  if (!impact) return null;

  const { classification, currentLaw, proposedReform, lossBank } = impact;
  const status = classification.status;

  // Pick the tone / label triad
  const label =
    status.isGrandfathered ? "Grandfathered"
    : status.isPostReformCarveOut ? "New build carve-out"
    : status.isPostReformEstablished ? "Reform affected"
    : "Pre-reform / unknown";
  const tone: "good" | "warn" | "bad" | "soft" =
    status.isGrandfathered ? "good"
    : status.isPostReformCarveOut ? "warn"
    : status.isPostReformEstablished ? "bad"
    : "soft";
  const toneSurface =
    tone === "good" ? "bg-emerald-500/10 border-emerald-500/25"
    : tone === "warn" ? "bg-amber-500/10 border-amber-500/30"
    : tone === "bad"  ? "bg-red-500/10 border-red-500/25"
    : "bg-secondary/40 border-border";
  const toneText =
    tone === "good" ? "text-emerald-300"
    : tone === "warn" ? "text-amber-300"
    : tone === "bad"  ? "text-red-300"
    : "text-muted-foreground";

  const ngEligible = classification.negativeGearingEligible;
  const cgtMethodLabel =
    classification.cgtMethod === "CURRENT_50_PERCENT_DISCOUNT" ? "50% discount"
    : classification.cgtMethod === "INDEXED_COST_BASE" ? "Indexed cost base"
    : classification.cgtMethod === "INDEXED_PLUS_REDUCED_DISCOUNT" ? "Indexed + reduced discount"
    : classification.cgtMethod === "ABOLISHED" ? "No CGT discount"
    : "—";

  const reformAfterTaxMonthly = proposedReform.afterTaxCashflow / 12;
  const refundDelta = currentLaw.paygRefundThisYear - proposedReform.paygRefundThisYear;

  return (
    <div
      className={`mx-0 px-4 py-3 border-t border-border ${toneSurface} border-l-2 ${className ?? ""}`}
      data-testid={`property-tax-impact-${impact.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${toneText}`} data-testid="property-tax-classification">
            {label}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            · NG {ngEligible ? "eligible" : "quarantined"}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            · CGT {cgtMethodLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Stat
          label="Refund (current law)"
          value={fmtAud(currentLaw.paygRefundThisYear)}
          tone="good"
        />
        <Stat
          label="Refund (reform)"
          value={fmtAud(proposedReform.paygRefundThisYear)}
          tone={proposedReform.paygRefundThisYear === 0 && currentLaw.paygRefundThisYear > 0 ? "bad" : "soft"}
        />
        <Stat
          label="Loss bank this FY"
          value={fmtAud(proposedReform.lossAccumulatedThisYear)}
          tone={proposedReform.lossAccumulatedThisYear > 0 ? "warn" : "soft"}
        />
        <Stat
          label="After-tax / mo (reform)"
          value={fmtAud(reformAfterTaxMonthly)}
          tone={reformAfterTaxMonthly < 0 ? "bad" : "good"}
        />
      </div>

      {/* Per-property loss bank — required by FWL_TAX_REFORM_INTEGRITY_FIX.
          Always rendered for IP rows; values collapse to $0 when not under
          reform / not quarantined. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mt-2 border-t border-border/40 pt-2"
        data-testid={`property-loss-bank-${impact.id}`}
      >
        <Stat
          label="Loss bank balance"
          value={fmtAud(lossBank.lossBankBalance)}
          tone={lossBank.lossBankBalance > 0 ? "warn" : "soft"}
        />
        <Stat
          label="Accumulated this FY"
          value={fmtAud(lossBank.lossBankAccumulated)}
          tone={lossBank.lossBankAccumulated > 0 ? "warn" : "soft"}
        />
        <Stat
          label="Consumed this FY"
          value={fmtAud(lossBank.lossBankConsumed)}
          tone={lossBank.lossBankConsumed > 0 ? "good" : "soft"}
        />
        <Stat
          label="Loss bank remaining"
          value={fmtAud(lossBank.lossBankRemaining)}
          tone={lossBank.lossBankRemaining > 0 ? "warn" : "soft"}
        />
      </div>

      <p className="text-[10px] text-muted-foreground/80 mt-2 leading-snug">
        <span className="font-semibold text-foreground/80">Why?</span> {classification.reason}
        {refundDelta > 0 && (
          <> · Reform reduces this property's PAYG refund by <b>{fmtAud(refundDelta)}</b>/yr.</>
        )}
      </p>
    </div>
  );
}

function Stat({
  label, value, tone,
}: { label: string; value: string; tone: "good" | "bad" | "warn" | "soft" }): JSX.Element {
  const c =
    tone === "good" ? "text-emerald-400"
    : tone === "bad"  ? "text-red-400"
    : tone === "warn" ? "text-amber-300"
    : "text-foreground";
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className={`font-bold num-display ${c}`}>{value}</p>
    </div>
  );
}

export default PropertyTaxImpactBlock;
