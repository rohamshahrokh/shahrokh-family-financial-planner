/**
 * TaxRegimeSelector.tsx — Global tax-policy regime selector.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * Premium, mobile-first regime picker. P1c refinements:
 *   - Calmer chrome — soft pill, single accent dot, no bordered shouting
 *   - Larger touch target on mobile (44px height)
 *   - Plain-English labels via PLAIN_LABEL (no internal jargon surfaced)
 *   - Description hint sits inline only when not compact
 *   - Single accent at a time (dot + value text), everything else neutral
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ShieldCheck, Compass, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useActiveRegime,
  regimeKindDescription,
} from "@/hooks/useActiveRegime";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";
import { PLAIN_LABEL } from "./uxTokens";

const REGIMES: TaxPolicyRegimeKind[] = [
  "AUTO_DETECT",
  "CURRENT_RULES",
  "PROPOSED_2027_REFORM",
  "CUSTOM_STRESS_TEST",
];

function regimeIcon(kind: TaxPolicyRegimeKind): React.ReactNode {
  switch (kind) {
    case "AUTO_DETECT":          return <Sparkles className="h-3.5 w-3.5" />;
    case "CURRENT_RULES":        return <ShieldCheck className="h-3.5 w-3.5" />;
    case "PROPOSED_2027_REFORM": return <Compass className="h-3.5 w-3.5" />;
    case "CUSTOM_STRESS_TEST":   return <FlaskConical className="h-3.5 w-3.5" />;
  }
}

/** Soft accent dot colour — one of four regime states. */
function regimeDot(kind: TaxPolicyRegimeKind): string {
  switch (kind) {
    case "AUTO_DETECT":          return "bg-sky-500";
    case "CURRENT_RULES":        return "bg-emerald-500";
    case "PROPOSED_2027_REFORM": return "bg-amber-500";
    case "CUSTOM_STRESS_TEST":   return "bg-violet-500";
  }
}

function regimeIconColor(kind: TaxPolicyRegimeKind): string {
  switch (kind) {
    case "AUTO_DETECT":          return "text-sky-500";
    case "CURRENT_RULES":        return "text-emerald-500";
    case "PROPOSED_2027_REFORM": return "text-amber-500";
    case "CUSTOM_STRESS_TEST":   return "text-violet-500";
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
      className={cn("inline-flex flex-col gap-1.5", className)}
      data-testid="tax-regime-selector"
    >
      {!compact && (
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Modelling against
        </span>
      )}
      <Select
        value={selector}
        onValueChange={(v) => setSelector(v as TaxPolicyRegimeKind)}
      >
        <SelectTrigger
          className={cn(
            // Pill-shaped, soft surface — no aggressive borders
            "h-11 sm:h-10 min-w-[200px] gap-2.5 rounded-full px-4",
            "bg-[hsl(var(--surface-2))] border border-transparent",
            "text-sm font-medium shadow-[var(--shadow-sm)]",
            "hover:bg-[hsl(var(--surface-3))] transition-colors",
            // Focus ring leans on the app's --ring token
            "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)]",
          )}
          aria-label="Choose which tax rules to model against"
        >
          <span className={cn("inline-flex items-center gap-2", regimeIconColor(selector))}>
            <span className={cn("h-1.5 w-1.5 rounded-full", regimeDot(selector))} />
            {regimeIcon(selector)}
            <SelectValue>
              <span className="text-foreground">{PLAIN_LABEL[selector]}</span>
            </SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent className="rounded-xl border-[hsl(var(--border)/0.6)]">
          {REGIMES.map((r) => (
            <SelectItem key={r} value={r} className="rounded-lg py-2.5">
              <span className="inline-flex items-center gap-2.5">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", regimeDot(r))} />
                <span className={cn("shrink-0", regimeIconColor(r))}>{regimeIcon(r)}</span>
                <span className="text-foreground font-medium">{PLAIN_LABEL[r]}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact && (
        <p className="max-w-[280px] text-xs leading-relaxed text-muted-foreground">
          {regimeKindDescription(selector)}
        </p>
      )}
    </div>
  );
}

export default TaxRegimeSelector;
