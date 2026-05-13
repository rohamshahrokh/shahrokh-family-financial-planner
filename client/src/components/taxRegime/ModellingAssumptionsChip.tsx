/**
 * ModellingAssumptionsChip.tsx — Consumer-friendly header chip.
 *
 * #FixGlobalScenarioSelectorConsumerUX
 *
 * Replaces the raw <TaxRegimeSelector> dropdown in the global header.
 * Shows ONE calm line: "Using <plain-English assumption>" plus a small
 * "Change" affordance. Clicking the chip (or the Change link) opens the
 * full ModellingAssumptionsDialog where the user sees titles, plain-
 * English descriptions, what each option affects, when to use it, and
 * any warnings.
 *
 * Visual contract:
 *   - 36-44 px tall pill, soft surface, single accent dot.
 *   - No surfaced jargon — only "Using <title>" + "Change".
 *   - Hover/focus states obvious, full chip is the click target.
 *   - Works in light + dark mode, mobile + desktop.
 *
 * Engine, store, and persistence are untouched — this component only
 * reads from `useActiveRegime` for display.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useActiveRegime } from "@/hooks/useActiveRegime";
import {
  ModellingAssumptionsDialog,
  modellingOptionTitle,
  modellingOptionTone,
  modellingOptionIcon,
} from "./ModellingAssumptionsDialog";

interface Props {
  className?: string;
}

export function ModellingAssumptionsChip({ className }: Props): JSX.Element {
  const { selector } = useActiveRegime();
  const [open, setOpen] = useState(false);

  const title = modellingOptionTitle(selector);
  const tone = modellingOptionTone(selector);
  const icon = modellingOptionIcon(selector);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="modelling-assumptions-chip"
        className={cn(
          // Pill shape, calm surface
          "group inline-flex items-center gap-2 h-10 sm:h-9 rounded-full px-3.5",
          "bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))]",
          "border border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--border)/0.9)]",
          "shadow-[var(--shadow-sm)] transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)]",
          // Tap target on mobile
          "min-w-[180px] sm:min-w-[200px]",
          className,
        )}
        title={`Using ${title} — click to change modelling assumptions`}
      >
        {/* Soft accent dot */}
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", tone.dot)} />

        {/* Icon — same accent tone */}
        <span className={cn("shrink-0", tone.iconFg)}>
          {icon}
        </span>

        {/* Calm label */}
        <span className="flex-1 text-left text-sm leading-none">
          <span className="text-muted-foreground">Using </span>
          <span className="font-medium text-foreground">{title}</span>
        </span>

        {/* Change link — visually subordinate but always present */}
        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            "text-[hsl(var(--ring))] group-hover:underline underline-offset-2",
          )}
        >
          Change
        </span>
      </button>

      <ModellingAssumptionsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default ModellingAssumptionsChip;
