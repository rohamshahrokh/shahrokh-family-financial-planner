/**
 * PlainMetric.tsx — Beginner-friendly metric tile for the Decision Engine.
 *
 * Renders a metric in three layers:
 *   1. Simple plain-English headline (default visible)
 *   2. A short subtitle below the value
 *   3. Tooltip + HelpLink to the advanced name + Help Center article
 *
 * Engine logic, raw numbers, and stored field names are untouched. This is
 * a pure presentation primitive that pulls labels from decisionEngineLabels.ts.
 */

import { ReactNode } from "react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { HelpLink } from "@/components/help";
import type { DecisionLabel } from "@/lib/decisionEngineLabels";

export type PlainMetricTone = "emerald" | "sky" | "indigo" | "amber" | "violet" | "rose";

const TONE_SURFACE: Record<PlainMetricTone, string> = {
  // Premium-fintech surfaces: low-saturation tints in light mode, soft elevated
  // surfaces in dark mode. No harsh neon borders — calm visual hierarchy.
  emerald: "border-[hsl(var(--success)/0.30)] bg-[hsl(var(--success-surface))]",
  sky:     "border-[hsl(var(--info)/0.30)] bg-[hsl(var(--info)/0.08)]",
  indigo:  "border-[hsl(var(--intelligence)/0.30)] bg-[hsl(var(--intelligence-surface))]",
  amber:   "border-[hsl(var(--gold)/0.30)] bg-[hsl(var(--gold-surface))]",
  violet:  "border-violet-300/40 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/15",
  rose:    "border-rose-300/40 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15",
};

const TONE_ACCENT: Record<PlainMetricTone, string> = {
  emerald: "text-[hsl(var(--success-light))]",
  sky:     "text-[hsl(var(--info-light))]",
  indigo:  "text-[hsl(var(--intelligence-light))]",
  amber:   "text-[hsl(var(--gold-light))]",
  violet:  "text-violet-700 dark:text-violet-300",
  rose:    "text-rose-700 dark:text-rose-300",
};

interface Props {
  /** Label dictionary entry from METRIC_LABELS (or any DecisionLabel). */
  label: DecisionLabel;
  /** The displayed numeric/textual value. */
  value: string;
  /** Visual tone. */
  tone: PlainMetricTone;
  /** Optional icon shown before the simple label. */
  icon?: ReactNode;
  /** Optional Help Center topic id for the "Learn more" link. */
  helpTopic?: string;
  /** Optional glossary key for the existing InfoTooltip (advanced name). */
  infoTerm?: string;
  /** If true, the tile is more compact (used in dense grids). */
  compact?: boolean;
}

export function PlainMetric({
  label, value, tone, icon, helpTopic, infoTerm, compact,
}: Props) {
  return (
    <div
      className={`rounded-lg border p-3 ${compact ? "" : "sm:p-3.5"} ${TONE_SURFACE[tone]}`}
      data-testid={`plain-metric-${label.advanced.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {/* Top row: simple label + (optional) info + help anchor */}
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold ${TONE_ACCENT[tone]}`}>
        {icon}
        <span className="truncate">{label.simple}</span>
        {infoTerm && <InfoTooltip term={infoTerm} size={11} />}
        {helpTopic && (
          <HelpLink
            topic={helpTopic}
            variant="icon"
            ariaLabel={`Learn more about ${label.simple}`}
            className="opacity-60 hover:opacity-100 transition-opacity"
          />
        )}
      </div>

      {/* The actual number */}
      <div className="text-lg sm:text-xl font-bold tabular-nums mt-1 text-foreground leading-none">
        {value}
      </div>

      {/* Plain-English subtitle */}
      {label.subtitle && (
        <div className="text-[10px] text-foreground/65 mt-1 leading-snug">
          {label.subtitle}
        </div>
      )}

      {/* Tiny advanced-name footer — earns trust without intimidating */}
      {!compact && (
        <div className="text-[9px] text-foreground/45 mt-1.5 italic truncate">
          aka {label.advanced}
        </div>
      )}
    </div>
  );
}
