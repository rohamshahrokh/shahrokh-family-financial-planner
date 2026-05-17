/**
 * <MetricExplainer />
 *
 * Premium explainer trigger for any canonical metric on the dashboard.
 *
 *   • Renders a small "info" icon next to the metric label.
 *   • Desktop (≥ md): tap / hover opens a Radix Popover with the
 *     translation-layer explanation (definition, why it matters,
 *     healthy-vs-risky ranges, influences, improvement actions).
 *   • Mobile (< md): tap opens a bottom Sheet — NOT a native browser
 *     tooltip — so explanations are thumb-friendly, wrap cleanly and
 *     never overflow the viewport.
 *
 * Architecture rules:
 *   • Reads ONLY from the metric explanation registry — never
 *     recalculates financial quantities.
 *   • If the caller passes a live `reading`, the popover/sheet shows
 *     the current semantic state chip and the dynamic interpretation
 *     sentence at the top. If `reading` is omitted, the explainer is
 *     purely educational.
 *   • Re-uses the existing dark navy/graphite + gold accent surfaces.
 *     No new visual identity.
 */

import * as React from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  getMetricExplanation,
  getSemanticTone,
  resolveSemanticState,
  type MetricExplanation,
  type MetricReading,
} from '@/lib/metricExplanations';

interface MetricExplainerProps {
  /** Canonical metric ID from the registry (e.g. "liquidity", "tail-risk"). */
  metricId: string;
  /** Optional live reading. When supplied, the explainer shows the current
   *  semantic state chip and dynamic interpretation. */
  reading?: MetricReading;
  /** Raw numeric value if no reading is pre-computed. */
  value?: number;
  /** Icon size in px. Default 14. */
  size?: number;
  /** Extra class on the trigger button. */
  className?: string;
  /** ARIA label override. Default "Explain {title}". */
  ariaLabel?: string;
}

/**
 * Marker constants used by static tests to assert that the mobile
 * code-path uses the app's bottom-sheet pattern and NOT a native
 * `title` / browser tooltip.
 */
export const METRIC_EXPLAINER_MOBILE_PRIMITIVE = 'app:bottom-sheet';
export const METRIC_EXPLAINER_DESKTOP_PRIMITIVE = 'app:popover';
export const METRIC_EXPLAINER_TEST_ID_PREFIX = 'metric-explainer';

function StateChip({ state }: { state: MetricReading['state'] }) {
  const tone = getSemanticTone(state);
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
      style={{
        color: tone.text,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        letterSpacing: '0.04em',
      }}
      data-testid="metric-explainer-state-chip"
    >
      {tone.label}
    </span>
  );
}

function ExplainerBody({
  metric,
  reading,
}: {
  metric: MetricExplanation;
  reading?: MetricReading;
}) {
  return (
    <div className="space-y-3">
      {/* Header: title + state chip */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-foreground/90">
            {metric.title}
          </div>
          {reading && <StateChip state={reading.state} />}
        </div>
        {metric.unit && (
          <div className="text-[10px] text-muted-foreground">{metric.unit}</div>
        )}
        {reading?.displayValue && (
          <div className="text-base font-extrabold tabular-nums text-foreground">
            {reading.displayValue}
          </div>
        )}
        {reading?.interpretation && (
          <p className="text-[11px] leading-relaxed text-foreground/80">
            {reading.interpretation}
          </p>
        )}
      </div>

      {/* Definition */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
          What it is
        </div>
        <p className="text-xs leading-relaxed text-foreground/85">
          {metric.definition}
        </p>
      </div>

      {/* Why it matters */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
          Why it matters
        </div>
        <p className="text-xs leading-relaxed text-foreground/85">
          {metric.whyItMatters}
        </p>
      </div>

      {/* Healthy vs risky ranges */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
          Healthy vs risky
        </div>
        <ul className="space-y-1">
          {metric.ranges.map((r) => {
            const tone = getSemanticTone(r.state);
            return (
              <li key={r.state} className="flex items-start gap-2">
                <span
                  className="shrink-0 mt-[3px] w-1.5 h-1.5 rounded-full"
                  style={{ background: tone.text }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone.text }}>
                      {tone.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {r.range}
                    </span>
                  </div>
                  <div className="text-[11px] text-foreground/75 leading-snug">
                    {r.meaning}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* What influences it */}
      {metric.influences.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            What moves it
          </div>
          <ul className="space-y-0.5 text-[11px] leading-relaxed text-foreground/80">
            {metric.influences.map((i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-muted-foreground">·</span>
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* How to improve */}
      {metric.improvementActions.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            How to improve
          </div>
          <ul className="space-y-0.5 text-[11px] leading-relaxed text-foreground/85">
            {metric.improvementActions.map((a) => (
              <li key={a} className="flex gap-1.5">
                <span style={{ color: 'hsl(var(--gold))' }}>→</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MetricExplainer({
  metricId,
  reading,
  value,
  size = 14,
  className,
  ariaLabel,
}: MetricExplainerProps) {
  const metric = getMetricExplanation(metricId);
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  if (!metric) return null;

  // Derive a reading if the caller only supplied a value.
  const liveReading: MetricReading | undefined = reading
    ? reading
    : typeof value === 'number' && Number.isFinite(value)
      ? {
          id: metric.id,
          value,
          state: resolveSemanticState(metric, value),
          interpretation: metric.interpretation?.(value, resolveSemanticState(metric, value)),
        }
      : undefined;

  const triggerClasses = cn(
    'inline-flex items-center justify-center align-middle',
    'h-6 w-6 rounded-full',
    'text-muted-foreground hover:text-foreground',
    'hover:bg-muted/60 focus-visible:bg-muted/60',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    '-my-1',
    className,
  );

  const label = ariaLabel ?? `Explain ${metric.title}`;
  const triggerTestId = `${METRIC_EXPLAINER_TEST_ID_PREFIX}-${metricId}-trigger`;
  const contentTestId = `${METRIC_EXPLAINER_TEST_ID_PREFIX}-${metricId}-content`;

  // ─── Mobile: bottom sheet ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          aria-label={label}
          data-testid={triggerTestId}
          data-explainer-primitive={METRIC_EXPLAINER_MOBILE_PRIMITIVE}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={triggerClasses}
        >
          <Info width={size} height={size} aria-hidden="true" />
        </button>
        <SheetContent
          side="bottom"
          data-testid={contentTestId}
          data-explainer-primitive={METRIC_EXPLAINER_MOBILE_PRIMITIVE}
          className={cn(
            // Premium bottom-sheet treatment: rounded top, restrained
            // max-height, scroll inside the sheet not the viewport.
            'rounded-t-2xl border-t border-border bg-popover text-popover-foreground',
            'max-h-[85vh] overflow-y-auto',
            'px-4 pt-3 pb-6',
          )}
        >
          <SheetHeader className="text-left mb-2">
            <SheetTitle className="text-sm font-bold">{metric.title}</SheetTitle>
            {metric.unit && (
              <SheetDescription className="text-[10px] text-muted-foreground">
                {metric.unit}
              </SheetDescription>
            )}
          </SheetHeader>
          <ExplainerBody metric={metric} reading={liveReading} />
        </SheetContent>
      </Sheet>
    );
  }

  // ─── Desktop: popover ─────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={triggerTestId}
          data-explainer-primitive={METRIC_EXPLAINER_DESKTOP_PRIMITIVE}
          onClick={(e) => e.stopPropagation()}
          className={triggerClasses}
        >
          <Info width={size} height={size} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={6}
        collisionPadding={12}
        data-testid={contentTestId}
        data-explainer-primitive={METRIC_EXPLAINER_DESKTOP_PRIMITIVE}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto',
          'p-4 bg-popover text-popover-foreground border-border shadow-xl',
        )}
      >
        <ExplainerBody metric={metric} reading={liveReading} />
      </PopoverContent>
    </Popover>
  );
}

export default MetricExplainer;
