/**
 * AutoDetectRationaleCard.tsx — Plain-English "why this regime?" sidecar.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - No bordered coloured banner. The card is a calm soft well that picks
 *     up a single accent dot for tone — Apple-like, not warning-poster.
 *   - Plain-English status line replaces stacked badges.
 *   - One-line rationale leads. The disclaimer is muted and small.
 *   - Header pill is optional and very quiet when shown.
 *
 * Public API (`Props`) unchanged.
 */

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  resolveAutoDetectedRegime,
  type PropertyType,
} from "@/lib/taxPolicyEngine";
import { type, tone as toneTokens } from "./uxTokens";

interface Props {
  property: {
    label?: string;
    propertyType?: PropertyType;
    contractDate?: string;
    purchaseDate?: string;
  };
  className?: string;
  /** Hide the eyebrow row — useful when card is in a tight grid. */
  hideHeader?: boolean;
}

export function AutoDetectRationaleCard({ property, className, hideHeader }: Props): JSX.Element {
  const result = resolveAutoDetectedRegime({
    propertyType: property.propertyType,
    contractDate: property.contractDate,
    purchaseDate: property.purchaseDate,
  });

  const isReform = result.resolvedRegimeKind === "PROPOSED_2027_REFORM";
  const isUnknown = result.requiresUserConfirmation;

  // Tone: green = grandfathered, amber = reform-affected, soft = unknown
  const dotTone: keyof typeof toneTokens = isUnknown ? "warn" : isReform ? "warn" : "good";
  const dotClass = isUnknown
    ? "bg-amber-500"
    : isReform
      ? "bg-amber-500"
      : "bg-emerald-500";

  const headline = isUnknown
    ? "Needs your confirmation"
    : isReform
      ? "Treated under proposed reform"
      : "Treated under today's rules";

  return (
    <Card
      className={cn(
        "rounded-2xl border-0 bg-[hsl(var(--surface-1))] shadow-[var(--shadow-sm)]",
        className,
      )}
      data-testid="auto-detect-rationale"
    >
      <CardContent className="p-4 space-y-2">
        {!hideHeader && (
          <div className="flex items-center justify-between gap-2">
            <p className={type.eyebrow}>Smart auto-detect</p>
            {property.label && (
              <span className={cn(type.caption, "truncate max-w-[55%]")}>{property.label}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} aria-hidden="true" />
          <p className={cn("text-sm font-medium", toneTokens[dotTone])}>{headline}</p>
        </div>

        <p className={type.body}>{result.reason}</p>

        <p className={cn(type.caption, "italic")}>
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default AutoDetectRationaleCard;
