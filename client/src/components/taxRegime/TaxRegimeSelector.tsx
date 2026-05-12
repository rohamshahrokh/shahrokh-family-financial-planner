/**
 * TaxRegimeSelector.tsx — Global tax-policy regime selector.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Premium, mobile-first dropdown that lets the user pick between
 * Auto Detect / Current Rules / Proposed 2027 Reform / Custom Stress Test.
 * Selection persists to localStorage via useActiveRegime and propagates
 * reactively to every overlay-aware surface (no page reload).
 *
 * Layout intent:
 *   - sits inline in a page header strip
 *   - chip-style trigger, regime kind always visible
 *   - tooltip-grade description shown in a popover under the selector
 *   - light + dark mode both tuned for AA contrast
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScaleIcon, ShieldCheck, AlertTriangle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useActiveRegime,
  regimeKindLabel,
  regimeKindDescription,
} from "@/hooks/useActiveRegime";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";

const REGIMES: TaxPolicyRegimeKind[] = [
  "AUTO_DETECT",
  "CURRENT_RULES",
  "PROPOSED_2027_REFORM",
  "CUSTOM_STRESS_TEST",
];

function regimeIcon(kind: TaxPolicyRegimeKind): React.ReactNode {
  switch (kind) {
    case "AUTO_DETECT":          return <ScaleIcon className="h-3.5 w-3.5" />;
    case "CURRENT_RULES":        return <ShieldCheck className="h-3.5 w-3.5" />;
    case "PROPOSED_2027_REFORM": return <AlertTriangle className="h-3.5 w-3.5" />;
    case "CUSTOM_STRESS_TEST":   return <FlaskConical className="h-3.5 w-3.5" />;
  }
}

/** Color accent for each regime — used for chip border and dot. */
function regimeAccent(kind: TaxPolicyRegimeKind): string {
  switch (kind) {
    case "AUTO_DETECT":          return "text-sky-600 dark:text-sky-400";
    case "CURRENT_RULES":        return "text-emerald-600 dark:text-emerald-400";
    case "PROPOSED_2027_REFORM": return "text-amber-600 dark:text-amber-400";
    case "CUSTOM_STRESS_TEST":   return "text-violet-600 dark:text-violet-400";
  }
}

interface Props {
  /** Hide the description hint underneath the chip (tight headers). */
  compact?: boolean;
  className?: string;
}

export function TaxRegimeSelector({ compact, className }: Props): JSX.Element {
  const { selector, setSelector } = useActiveRegime();

  return (
    <div
      className={cn(
        "inline-flex flex-col gap-1.5",
        className,
      )}
      data-testid="tax-regime-selector"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tax Policy Regime
        </span>
      </div>
      <Select
        value={selector}
        onValueChange={(v) => setSelector(v as TaxPolicyRegimeKind)}
      >
        <SelectTrigger
          className={cn(
            "h-9 w-[220px] gap-2 rounded-full border-2 bg-background/80 px-3 text-sm font-medium shadow-sm backdrop-blur-sm",
            "transition-colors hover:bg-background",
            regimeAccent(selector),
          )}
          aria-label="Tax Policy Regime selector"
        >
          <span className={cn("inline-flex items-center gap-2", regimeAccent(selector))}>
            {regimeIcon(selector)}
            <SelectValue placeholder="Select regime" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {REGIMES.map((r) => (
            <SelectItem key={r} value={r}>
              <span className={cn("inline-flex items-center gap-2", regimeAccent(r))}>
                {regimeIcon(r)}
                <span className="text-foreground">{regimeKindLabel(r)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && (
        <p className="max-w-[280px] text-[11px] leading-snug text-muted-foreground">
          {regimeKindDescription(selector)}
        </p>
      )}
    </div>
  );
}

export default TaxRegimeSelector;
