/**
 * PropertyComparisonPanel.tsx — Side-by-side comparison panel.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * Renders the per-scenario regime comparison returned by
 * `computePropertyBuyBothRegimes` (P1 engine overlay). Presentation only —
 * never calls engines. Public API (`PropertyComparisonRow`, `Props`) is
 * unchanged from P1b so existing call-sites keep working.
 *
 * P1c refinements:
 *   - Headline first: the biggest delta row promoted into a hero strip
 *   - Soft surfaces, no hairline borders inside the card
 *   - Mobile-stacked rows show Today/Reform/Difference vertically, not as
 *     a cramped flex row
 *   - Progressive disclosure: only first 4 rows visible by default, rest
 *     behind a "Show full breakdown" toggle
 *   - Plain-English column headers via PLAIN_LABEL
 *   - Disclaimer becomes a soft footnote, not a bordered banner
 */

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned, fmtPct, fmtPctPoints, senseTone } from "./formatters";
import { PLAIN_LABEL, type, tone as toneTokens } from "./uxTokens";

export interface PropertyComparisonRow {
  label: string;
  hint?: string;
  current?: number | null;
  reform?: number | null;
  delta?: number | null;
  sense?: "more-better" | "less-better";
  format?: "currency" | "percent" | "percent-points" | "years";
}

interface Props {
  title: string;
  subtitle?: string;
  regimeLabelReform?: string;
  rows: PropertyComparisonRow[];
  className?: string;
  /** Maximum rows visible before a "Show full breakdown" toggle appears. */
  collapseAfter?: number;
}

function formatValue(v: number | null | undefined, fmt: PropertyComparisonRow["format"]): string {
  switch (fmt) {
    case "percent":         return fmtPct(v);
    case "percent-points":  return fmtPctPoints(v);
    case "years":           return v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)} yrs`;
    case "currency":
    default:                return fmtAud(v);
  }
}

function formatDelta(v: number | null | undefined, fmt: PropertyComparisonRow["format"]): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (fmt) {
    case "percent":
    case "percent-points":  return fmtPctPoints(v);
    case "years":           return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " yrs";
    case "currency":
    default:                return fmtAudSigned(v);
  }
}

function DeltaIcon({ delta, sense }: { delta?: number | null; sense?: "more-better" | "less-better" }): JSX.Element {
  if (delta == null || !Number.isFinite(delta) || delta === 0) {
    return <Minus className="h-3.5 w-3.5 opacity-60" />;
  }
  const favorable = (sense === "less-better" ? delta < 0 : delta > 0);
  return favorable
    ? <TrendingUp className="h-3.5 w-3.5" />
    : <TrendingDown className="h-3.5 w-3.5" />;
}

/** Compute the headline (largest absolute currency delta) for the hero strip. */
function pickHeadline(rows: PropertyComparisonRow[]): { row: PropertyComparisonRow; delta: number } | null {
  let best: { row: PropertyComparisonRow; delta: number } | null = null;
  for (const r of rows) {
    if (r.format && r.format !== "currency") continue;
    const d = r.delta !== undefined
      ? r.delta
      : (typeof r.reform === "number" && typeof r.current === "number" ? r.reform - r.current : null);
    if (d == null || !Number.isFinite(d) || d === 0) continue;
    if (!best || Math.abs(d) > Math.abs(best.delta)) best = { row: r, delta: d };
  }
  return best;
}

export function PropertyComparisonPanel({
  title,
  subtitle,
  regimeLabelReform = PLAIN_LABEL.REFORM,
  rows,
  className,
  collapseAfter = 4,
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const headline = useMemo(() => pickHeadline(rows), [rows]);
  const visibleRows = expanded || rows.length <= collapseAfter ? rows : rows.slice(0, collapseAfter);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-0 shadow-[var(--shadow-sm)]",
        "bg-[hsl(var(--surface-1))]",
        className,
      )}
      data-testid="property-comparison-panel"
    >
      <CardHeader className="pb-2">
        <CardTitle className={type.sectionTitle}>{title}</CardTitle>
        {subtitle && (
          <p className={cn(type.caption, "mt-1")}>{subtitle}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 p-5 pt-2 sm:p-6 sm:pt-2">
        {/* Headline strip — biggest delta row, promoted as hero */}
        {headline && (
          <div className="rounded-xl bg-[hsl(var(--surface-2))] p-4 sm:p-5">
            <div className={type.eyebrow}>{headline.row.label}</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className={cn(type.hero, senseTone(headline.delta, headline.row.sense ?? "more-better"))}>
                {formatDelta(headline.delta, headline.row.format)}
              </span>
              <span className={type.caption}>
                {PLAIN_LABEL.CURRENT}: {formatValue(headline.row.current, headline.row.format)}
                {" · "}
                {regimeLabelReform}: {formatValue(headline.row.reform, headline.row.format)}
              </span>
            </div>
            {headline.row.hint && (
              <p className={cn(type.caption, "mt-2")}>{headline.row.hint}</p>
            )}
          </div>
        )}

        {/* Soft column header — desktop only, no bordered band */}
        <div className="hidden md:grid grid-cols-12 px-1 text-muted-foreground">
          <div className={cn("col-span-5", type.eyebrow)}>Metric</div>
          <div className={cn("col-span-2 text-right", type.eyebrow)}>{PLAIN_LABEL.CURRENT}</div>
          <div className={cn("col-span-2 text-right", type.eyebrow)}>{regimeLabelReform}</div>
          <div className={cn("col-span-3 text-right", type.eyebrow)}>{PLAIN_LABEL.DELTA}</div>
        </div>

        {/* Rows — no divider lines, just spacing */}
        <div className="space-y-2">
          {visibleRows.map((row, i) => {
            const computedDelta =
              row.delta !== undefined
                ? row.delta
                : (typeof row.reform === "number" && typeof row.current === "number"
                    ? row.reform - row.current
                    : null);
            const t = senseTone(computedDelta, row.sense ?? "more-better");
            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl px-3 py-3 sm:py-2.5",
                  "md:grid md:grid-cols-12 md:items-center md:gap-3",
                  // Subtle striping via well token on even rows
                  i % 2 === 1 && "bg-[hsl(var(--muted)/0.35)]",
                )}
              >
                {/* Mobile: label on top */}
                <div className="md:col-span-5">
                  <div className={cn(type.body, "font-medium")}>{row.label}</div>
                  {row.hint && (
                    <div className={cn("mt-0.5", type.caption)}>{row.hint}</div>
                  )}
                </div>

                {/* Mobile: stacked values */}
                <div className="mt-2 grid grid-cols-3 gap-2 md:mt-0 md:col-span-7 md:grid-cols-7">
                  <div className="md:col-span-2 text-right">
                    <div className={cn(type.eyebrow, "md:hidden")}>Today</div>
                    <div className={cn(type.numberSm, toneTokens.soft)}>
                      {formatValue(row.current, row.format)}
                    </div>
                  </div>
                  <div className="md:col-span-2 text-right">
                    <div className={cn(type.eyebrow, "md:hidden")}>{regimeLabelReform}</div>
                    <div className={cn(type.numberSm, toneTokens.soft)}>
                      {formatValue(row.reform, row.format)}
                    </div>
                  </div>
                  <div className="md:col-span-3 text-right">
                    <div className={cn(type.eyebrow, "md:hidden")}>Δ</div>
                    <div className={cn("inline-flex items-center justify-end gap-1", type.numberSm, t)}>
                      <DeltaIcon delta={computedDelta} sense={row.sense} />
                      <span>{formatDelta(computedDelta, row.format)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progressive disclosure */}
        {rows.length > collapseAfter && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5",
              "text-xs font-medium text-muted-foreground hover:text-foreground",
              "hover:bg-[hsl(var(--surface-2))] transition-colors",
            )}
            data-testid="property-comparison-toggle"
          >
            {expanded ? (
              <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>Show full breakdown ({hiddenCount} more) <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        )}

        <p className={cn(type.caption, "italic opacity-70")}>
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default PropertyComparisonPanel;
