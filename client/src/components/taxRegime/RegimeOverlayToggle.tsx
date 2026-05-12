/**
 * RegimeOverlayToggle.tsx — Forecast/FIRE chart overlay toggle.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Segmented control feel (iOS-style), inset on the surface
 *   - Plain-English labels: "Today" / "Reform" / "Compare"
 *   - Sized for touch on mobile (36px row height)
 */

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type RegimeOverlayMode = "CURRENT" | "REFORM" | "BOTH";

interface Props {
  value: RegimeOverlayMode;
  onChange: (mode: RegimeOverlayMode) => void;
  className?: string;
  /** Show the eyebrow label above the control. Default true. */
  showLabel?: boolean;
}

export function RegimeOverlayToggle({ value, onChange, className, showLabel = true }: Props): JSX.Element {
  return (
    <div className={cn("inline-flex flex-col gap-1.5", className)}>
      {showLabel && (
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          View
        </span>
      )}
      <ToggleGroup
        type="single"
        size="sm"
        value={value}
        onValueChange={(v) => v && onChange(v as RegimeOverlayMode)}
        className="rounded-full bg-[hsl(var(--surface-2))] p-1 shadow-[var(--shadow-sm)]"
      >
        <ToggleGroupItem
          value="CURRENT"
          className={cn(
            "rounded-full px-4 h-8 text-xs font-medium text-muted-foreground border-0",
            "data-[state=on]:bg-[hsl(var(--surface-3))] data-[state=on]:text-emerald-500 data-[state=on]:shadow-[var(--shadow-sm)]",
            "transition-colors",
          )}
          aria-label="Show today's rules only"
        >
          Today
        </ToggleGroupItem>
        <ToggleGroupItem
          value="REFORM"
          className={cn(
            "rounded-full px-4 h-8 text-xs font-medium text-muted-foreground border-0",
            "data-[state=on]:bg-[hsl(var(--surface-3))] data-[state=on]:text-amber-500 data-[state=on]:shadow-[var(--shadow-sm)]",
            "transition-colors",
          )}
          aria-label="Show proposed reform only"
        >
          Reform
        </ToggleGroupItem>
        <ToggleGroupItem
          value="BOTH"
          className={cn(
            "rounded-full px-4 h-8 text-xs font-medium text-muted-foreground border-0",
            "data-[state=on]:bg-[hsl(var(--surface-3))] data-[state=on]:text-foreground data-[state=on]:shadow-[var(--shadow-sm)]",
            "transition-colors",
          )}
          aria-label="Compare both side by side"
        >
          Compare
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export default RegimeOverlayToggle;
