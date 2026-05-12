/**
 * AutoDetectRationaleCard.tsx — Plain-English explanation of auto-detection.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Renders the reason returned by `resolveAutoDetectedRegime` for a given
 * property's metadata. Intended to sit directly beneath the global regime
 * selector or inline on property cards when AUTO_DETECT is active.
 *
 * Examples (from the spec brief):
 *   - "This property is treated as grandfathered because the purchase date
 *      is before the reform cutoff."
 *   - "This established property falls under proposed reform rules because
 *      it was acquired after the reform effective date."
 *   - "This new-build property retains immediate negative gearing treatment."
 */

import { Info, ShieldCheck, AlertTriangle, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  resolveAutoDetectedRegime,
  type PropertyType,
} from "@/lib/taxPolicyEngine";

interface Props {
  property: {
    label?: string;
    propertyType?: PropertyType;
    contractDate?: string;
    purchaseDate?: string;
  };
  className?: string;
  /** Hide the "Auto Detect" pill — useful when card is in a tight grid. */
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

  const Icon = isUnknown ? HelpCircle : isReform ? AlertTriangle : ShieldCheck;
  const accent = isUnknown
    ? "text-amber-600 dark:text-amber-400 border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20"
    : isReform
    ? "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/25"
    : "text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20";

  return (
    <Card
      className={cn(
        "border shadow-none transition-colors",
        accent,
        className,
      )}
      data-testid="auto-detect-rationale"
    >
      <CardContent className="flex items-start gap-3 p-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          {!hideHeader && (
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="border-current text-[10px] uppercase tracking-wide">
                Auto Detect
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {isReform ? "Reform" : "Current Rules"}
              </Badge>
              {isUnknown && (
                <Badge variant="destructive" className="text-[10px]">
                  Needs Confirmation
                </Badge>
              )}
              {property.label && (
                <span className="text-[11px] text-muted-foreground">
                  {property.label}
                </span>
              )}
            </div>
          )}
          <p className="text-xs leading-relaxed text-foreground/80">
            {result.reason}
          </p>
          <p className="mt-1.5 flex items-start gap-1 text-[10px] italic text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            This is modelling only and not personal tax advice.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default AutoDetectRationaleCard;
