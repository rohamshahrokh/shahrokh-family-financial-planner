/**
 * ModellingAssumptionsDialog.tsx — Consumer-friendly explanatory modal for
 * the global tax-regime selector.
 *
 * #FixGlobalScenarioSelectorConsumerUX  ·  presentation-only · no engine logic
 *
 * Replaces the raw dropdown in the global header with a deliberate,
 * explanatory experience:
 *
 *   - Each of the four modelling options has its own card with:
 *       plain-English title · simple explanation · what it affects ·
 *       when to use it · warning (if experimental)
 *   - Selected state is obvious (gold ring + soft surface + checkmark)
 *   - Reassuring header: "These settings do not change your real data.
 *     They only change how future scenarios are modelled."
 *   - Footer "Learn more about modelling assumptions" → Help Center
 *
 * The component is purely UI. The underlying selector still writes to the
 * same `activeRegimeStore` via the `useActiveRegime` hook — engine math
 * is unchanged.
 */

import { useState, useEffect, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles, ShieldCheck, Compass, FlaskConical, Check, Info,
  AlertTriangle, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveRegime } from "@/hooks/useActiveRegime";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";
import { useToast } from "@/hooks/use-toast";
import { HelpLink, HELP_TOPICS } from "@/components/help/HelpLink";

// ──────────────────────────────────────────────────────────────────
// Consumer-friendly option copy.  Single source of truth for the modal.
// ──────────────────────────────────────────────────────────────────

interface OptionCopy {
  title: string;
  description: string;
  affects: string;
  whenToUse: string;
  warning?: string;
  icon: ReactNode;
  /** Soft surface + accent colour pair (Tailwind class fragments). */
  tone: {
    ring: string;       // selected ring colour
    iconBg: string;     // icon chip background
    iconFg: string;     // icon foreground
    dot: string;        // status dot
  };
}

const OPTIONS: Record<TaxPolicyRegimeKind, OptionCopy> = {
  AUTO_DETECT: {
    title: "Smart assumptions",
    description:
      "Let Family Wealth Lab choose the best modelling rules based on your profile.",
    affects:
      "Tax calculations, property cashflow, forecast projections, FIRE date, and Decision Engine rankings.",
    whenToUse:
      "You're not sure which scenario fits — this is the safe starting point. Recommended for most people.",
    icon: <Sparkles className="h-4 w-4" />,
    tone: {
      ring: "ring-sky-500/60",
      iconBg: "bg-sky-500/10",
      iconFg: "text-sky-500",
      dot: "bg-sky-500",
    },
  },
  CURRENT_RULES: {
    title: "Today's rules",
    description:
      "Use the current Australian tax, lending, and investment rules.",
    affects:
      "Negative gearing fully deductible against PAYG, 50% CGT discount on assets held over 12 months, current marginal brackets.",
    whenToUse:
      "You want to plan based on the world as it exists today, with no future legislation factored in.",
    icon: <ShieldCheck className="h-4 w-4" />,
    tone: {
      ring: "ring-emerald-500/60",
      iconBg: "bg-emerald-500/10",
      iconFg: "text-emerald-500",
      dot: "bg-emerald-500",
    },
  },
  PROPOSED_2027_REFORM: {
    title: "Future reform scenario",
    description:
      "Test how your plan may look if proposed 2027 policy changes happen.",
    affects:
      "Negative gearing limited to new builds, tighter CGT discount post-cutoff, narrower franking — applied from 1 July 2027 onwards.",
    whenToUse:
      "You want to stress-test your plan against a potential future where negative gearing is restricted.",
    warning:
      "Experimental. This is not current law — it models a hypothetical reform package for sensitivity analysis only.",
    icon: <Compass className="h-4 w-4" />,
    tone: {
      ring: "ring-amber-500/60",
      iconBg: "bg-amber-500/10",
      iconFg: "text-amber-500",
      dot: "bg-amber-500",
    },
  },
  CUSTOM_STRESS_TEST: {
    title: "Custom what-if",
    description:
      "Create your own future assumptions for stress testing.",
    affects:
      "All rules become individually selectable — negative gearing on/off, CGT discount %, franking enabled, regime cutover dates.",
    whenToUse:
      "You're modelling a specific policy idea or stress-testing a custom scenario. Hard floors still enforced for safety.",
    icon: <FlaskConical className="h-4 w-4" />,
    tone: {
      ring: "ring-violet-500/60",
      iconBg: "bg-violet-500/10",
      iconFg: "text-violet-500",
      dot: "bg-violet-500",
    },
  },
};

const ORDER: TaxPolicyRegimeKind[] = [
  "AUTO_DETECT",
  "CURRENT_RULES",
  "PROPOSED_2027_REFORM",
  "CUSTOM_STRESS_TEST",
];

// ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModellingAssumptionsDialog({ open, onOpenChange }: Props): JSX.Element {
  const { selector, setSelector } = useActiveRegime();
  const { toast } = useToast();

  // Local draft so a click on a card highlights instantly even if the user
  // pauses before closing.  We commit to the store immediately so engine
  // panels reflect the change in real time, but track the latest applied
  // value for the toast message.
  const [lastApplied, setLastApplied] = useState<TaxPolicyRegimeKind>(selector);

  // Keep lastApplied in sync if the user closes/reopens with no change.
  useEffect(() => {
    if (open) setLastApplied(selector);
  }, [open, selector]);

  const handleSelect = (kind: TaxPolicyRegimeKind) => {
    if (kind === selector) return;
    setSelector(kind);
    setLastApplied(kind);
    toast({
      title: "Results updated",
      description: `Now modelling using ${OPTIONS[kind].title.toLowerCase()}.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-2xl max-h-[88vh] overflow-y-auto",
          "bg-[hsl(var(--surface-1))] border-[hsl(var(--border)/0.7)]",
          "p-0",
        )}
        data-testid="modelling-assumptions-dialog"
      >
        {/* Header */}
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b border-[hsl(var(--border)/0.5)]">
          <DialogTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Modelling assumptions
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed pt-1">
            These settings do not change your real data. They only change how
            future scenarios are modelled.
          </DialogDescription>
        </DialogHeader>

        {/* Reassurance callout */}
        <div className="mx-5 sm:mx-6 mt-4 flex gap-2.5 rounded-lg px-3 py-2.5 text-xs"
             style={{
               background: "hsl(210,50%,10%)",
               border: "1px solid hsl(210,60%,30%)",
               color: "hsl(210,80%,80%)",
             }}>
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
          <span>
            Affects: tax calculations, property cashflow, forecast projections,
            FIRE timeline, and Decision Engine rankings. Your actual portfolio,
            balances, and transactions are never touched.
          </span>
        </div>

        {/* Option cards */}
        <div className="px-5 sm:px-6 py-4 space-y-3">
          {ORDER.map((kind) => {
            const o = OPTIONS[kind];
            const isSelected = kind === selector;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => handleSelect(kind)}
                aria-pressed={isSelected}
                data-testid={`modelling-option-${kind}`}
                className={cn(
                  "w-full text-left rounded-xl p-4 transition-all",
                  "border bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))]",
                  "focus:outline-none focus:ring-2 focus:ring-offset-0",
                  isSelected
                    ? `border-transparent ring-2 ${o.tone.ring} shadow-sm`
                    : "border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--border)/0.8)]",
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Icon chip */}
                  <div className={cn(
                    "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center",
                    o.tone.iconBg, o.tone.iconFg,
                  )}>
                    {o.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {o.title}
                      </span>
                      {o.warning && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-medium px-2 py-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Experimental
                        </span>
                      )}
                      {isSelected && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                          <Check className="h-3 w-3" />
                          Selected
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">
                      {o.description}
                    </p>

                    {/* Details grid */}
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                      <dt className="font-medium text-foreground/80">What it affects</dt>
                      <dd className="text-muted-foreground leading-relaxed">{o.affects}</dd>
                      <dt className="font-medium text-foreground/80">When to use</dt>
                      <dd className="text-muted-foreground leading-relaxed">{o.whenToUse}</dd>
                    </dl>

                    {/* Warning */}
                    {o.warning && (
                      <div className="mt-3 flex gap-2 rounded-md px-2.5 py-2 text-[11px]"
                           style={{
                             background: "hsl(40,50%,10%)",
                             border: "1px solid hsl(43,60%,28%)",
                             color: "hsl(43,80%,75%)",
                           }}>
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-yellow-400" />
                        <span>{o.warning}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-[hsl(var(--border)/0.5)] flex items-center justify-between gap-3 flex-wrap">
          <HelpLink
            topic={HELP_TOPICS.scenarioAssumptions}
            label="Learn more about modelling assumptions"
            variant="learn-more"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            data-testid="modelling-assumptions-done"
          >
            Done
          </Button>
        </div>

        {/* Modelling-only disclaimer (carried constraint) */}
        <p className="px-5 sm:px-6 pb-4 -mt-2 text-[10px] text-muted-foreground/70 italic">
          Modelling only, not personal tax advice.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default ModellingAssumptionsDialog;

// Exported for the chip so it can show the same plain-English title.
export function modellingOptionTitle(kind: TaxPolicyRegimeKind): string {
  return OPTIONS[kind].title;
}

export function modellingOptionTone(kind: TaxPolicyRegimeKind): OptionCopy["tone"] {
  return OPTIONS[kind].tone;
}

export function modellingOptionIcon(kind: TaxPolicyRegimeKind): ReactNode {
  return OPTIONS[kind].icon;
}
