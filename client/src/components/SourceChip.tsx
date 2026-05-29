/**
 * SourceChip — Sprint 28.
 *
 * Tiny muted pill that surfaces the engine source behind a metric. The Action
 * Roadmap explainability layer (S8) toggles between compact (icon + short
 * label) and audit-mode (full `formatAttribution` string) renderings.
 *
 * No new dependencies. Tailwind classes only — matches sibling chip styles in
 * `ActionRoadmapPanel.tsx`.
 */
import * as React from "react";
import { Info } from "lucide-react";
import {
  formatAttribution,
  shortAttribution,
  type MetricAttribution,
} from "@/lib/actionRoadmap/metricSourceAttribution";

export interface SourceChipProps {
  attribution: MetricAttribution;
  /** True when the page-level audit toggle is on. Expands chip to full text. */
  auditMode: boolean;
  className?: string;
}

export function SourceChip({ attribution, auditMode, className }: SourceChipProps) {
  const text = auditMode ? formatAttribution(attribution) : shortAttribution(attribution);
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border " +
        (className ?? "")
      }
      title={formatAttribution(attribution)}
    >
      <Info className="h-2.5 w-2.5" aria-hidden />
      <span className="leading-none">{text}</span>
    </span>
  );
}

export default SourceChip;
