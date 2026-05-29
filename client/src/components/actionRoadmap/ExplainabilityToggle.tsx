/**
 * ExplainabilityToggle — Action Roadmap S8 (Sprint 28).
 *
 * Page-level audit toggle. Sticky chip at the top of the Action Roadmap. When
 * ON, every SourceChip on the page expands to its full `formatAttribution`
 * string. When OFF, chips render the compact source label only.
 *
 * Pure UI — no engine call. Parent owns the `auditMode` state.
 */
import * as React from "react";
import { Info } from "lucide-react";

export interface ExplainabilityToggleProps {
  auditMode: boolean;
  onChange: (next: boolean) => void;
}

export function ExplainabilityToggle({ auditMode, onChange }: ExplainabilityToggleProps) {
  return (
    <div
      data-testid="ar-section-explainability"
      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-2 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="text-xs text-muted-foreground">
          Audit Mode shows the engine + percentile behind every number.
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={auditMode}
        data-testid="ar-audit-toggle"
        onClick={() => onChange(!auditMode)}
        className={
          "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
          (auditMode ? "bg-violet-600 dark:bg-violet-500" : "bg-muted")
        }
      >
        <span
          aria-hidden
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
            (auditMode ? "translate-x-5" : "translate-x-0.5")
          }
        />
      </button>
    </div>
  );
}

export default ExplainabilityToggle;
