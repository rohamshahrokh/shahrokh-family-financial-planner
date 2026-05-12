/**
 * RegimeOverlayToggle.tsx — Forecast/FIRE/Property chart overlay toggle.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Lets the user choose what to draw on a comparison chart: Current Rules
 * only, Reform Rules only, or Overlay Both. Pure UI state — caller owns
 * which series to render based on the value.
 */

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type RegimeOverlayMode = "CURRENT" | "REFORM" | "BOTH";

interface Props {
  value: RegimeOverlayMode;
  onChange: (mode: RegimeOverlayMode) => void;
  className?: string;
}

export function RegimeOverlayToggle({ value, onChange, className }: Props): JSX.Element {
  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Chart overlay
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        value={value}
        onValueChange={(v) => v && onChange(v as RegimeOverlayMode)}
        className="rounded-full border bg-muted/30 p-0.5"
      >
        <ToggleGroupItem
          value="CURRENT"
          className="rounded-full px-3 text-[11px] data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-700 dark:data-[state=on]:text-emerald-300"
        >
          Current
        </ToggleGroupItem>
        <ToggleGroupItem
          value="REFORM"
          className="rounded-full px-3 text-[11px] data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-700 dark:data-[state=on]:text-amber-300"
        >
          Reform
        </ToggleGroupItem>
        <ToggleGroupItem
          value="BOTH"
          className="rounded-full px-3 text-[11px] data-[state=on]:bg-foreground/10"
        >
          Both
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export default RegimeOverlayToggle;
