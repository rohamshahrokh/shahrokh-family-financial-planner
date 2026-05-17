/**
 * <TermExplainer />
 *
 * Lightweight reusable wrapper that turns ANY label, term or acronym
 * into an explainable surface — without redesigning the host component.
 *
 *   • Wraps the label in an inline span with a subtle dotted underline
 *     and a trailing info dot.
 *   • Tap / focus opens the same Radix popover (desktop) or app
 *     bottom-sheet (mobile) used by <MetricExplainer />.
 *   • Reads from the central explainer registry. Never recalculates,
 *     never duplicates content.
 *   • If `metricId` is not in the registry the component degrades to
 *     plain text so it can be sprinkled without auditing every call site.
 *
 * Use this for headers, table column titles, section labels, chart axis
 * labels, recommendation hints, acronyms (FIRE, DCA, CAGR) — anywhere a
 * <MetricExplainer /> icon would be visually too heavy.
 *
 * The full structured explanation body is rendered via the shared
 * <MetricExplainer /> primitives so visual identity and mobile-safe
 * behaviour stay consistent app-wide.
 */

import * as React from 'react';
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
  type MetricReading,
} from '@/lib/metricExplanations';
import { Info } from 'lucide-react';

/** Marker constants used by tests (same convention as MetricExplainer). */
export const TERM_EXPLAINER_MOBILE_PRIMITIVE = 'app:bottom-sheet';
export const TERM_EXPLAINER_DESKTOP_PRIMITIVE = 'app:popover';
export const TERM_EXPLAINER_TEST_ID_PREFIX = 'term-explainer';

interface TermExplainerProps {
  /** Canonical metric ID from the central explainer registry. */
  metricId: string;
  /** Inline children — usually the label / term to wrap. */
  children: React.ReactNode;
  /** Optional live numeric reading (for surfaces with a value next to the term). */
  value?: number;
  /** Explicit reading (overrides `value`). */
  reading?: MetricReading;
  /** Hide the trailing info dot, keep only the dotted underline. */
  iconless?: boolean;
  /** ARIA label override. Default "Explain {term}". */
  ariaLabel?: string;
  /** Extra class on the inline trigger. */
  className?: string;
}

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
      data-testid="term-explainer-state-chip"
    >
      {tone.label}
    </span>
  );
}

function TermExplainerBody({
  metricId,
  reading,
}: {
  metricId: string;
  reading?: MetricReading;
}) {
  const metric = getMetricExplanation(metricId);
  if (!metric) return null;

  return (
    <div className="space-y-3">
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

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
          What it is
        </div>
        <p className="text-xs leading-relaxed text-foreground/85">
          {metric.definition}
        </p>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
          Why it matters
        </div>
        <p className="text-xs leading-relaxed text-foreground/85">
          {metric.whyItMatters}
        </p>
      </div>

      {metric.ranges.length > 0 && (
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
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: tone.text }}
                      >
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
      )}

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

      {metric.source && (
        <div className="pt-2 border-t border-border/40">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            Source of truth
          </div>
          <p className="text-[11px] font-mono text-foreground/70">
            {metric.source}
          </p>
        </div>
      )}

      {metric.engineCue && (
        <div className="rounded-md border border-border/40 bg-muted/30 px-2 py-1.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
            Why the engine thinks this matters now
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/80">
            {metric.engineCue}
          </p>
        </div>
      )}
    </div>
  );
}

export function TermExplainer({
  metricId,
  children,
  value,
  reading,
  iconless,
  ariaLabel,
  className,
}: TermExplainerProps) {
  const metric = getMetricExplanation(metricId);
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  // Degrade to plain text when the term is not yet in the registry.
  if (!metric) return <>{children}</>;

  const liveReading: MetricReading | undefined = reading
    ? reading
    : typeof value === 'number' && Number.isFinite(value)
      ? {
          id: metric.id,
          value,
          state: resolveSemanticState(metric, value),
          interpretation: metric.interpretation?.(
            value,
            resolveSemanticState(metric, value),
          ),
        }
      : undefined;

  const label = ariaLabel ?? `Explain ${metric.title}`;
  const triggerTestId = `${TERM_EXPLAINER_TEST_ID_PREFIX}-${metricId}-trigger`;
  const contentTestId = `${TERM_EXPLAINER_TEST_ID_PREFIX}-${metricId}-content`;

  // Inline trigger: keeps the host typography intact, adds a subtle
  // dotted underline + small info dot. Premium dark surfaces stay
  // untouched.
  const triggerClasses = cn(
    'inline-flex items-baseline gap-1 align-baseline',
    'cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
    'underline decoration-dotted decoration-foreground/30 underline-offset-2',
    'hover:decoration-foreground/70 hover:text-foreground transition-colors',
    className,
  );

  const trigger = (
    <button
      type="button"
      aria-label={label}
      data-testid={triggerTestId}
      data-explainer-primitive={
        isMobile
          ? TERM_EXPLAINER_MOBILE_PRIMITIVE
          : TERM_EXPLAINER_DESKTOP_PRIMITIVE
      }
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      className={triggerClasses}
    >
      <span>{children}</span>
      {!iconless && (
        <Info
          className="w-2.5 h-2.5 shrink-0 opacity-60"
          aria-hidden="true"
        />
      )}
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        {trigger}
        <SheetContent
          side="bottom"
          data-testid={contentTestId}
          data-explainer-primitive={TERM_EXPLAINER_MOBILE_PRIMITIVE}
          className={cn(
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
          <TermExplainerBody metricId={metricId} reading={liveReading} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={6}
        collisionPadding={12}
        data-testid={contentTestId}
        data-explainer-primitive={TERM_EXPLAINER_DESKTOP_PRIMITIVE}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto',
          'p-4 bg-popover text-popover-foreground border-border shadow-xl',
        )}
      >
        <TermExplainerBody metricId={metricId} reading={liveReading} />
      </PopoverContent>
    </Popover>
  );
}

export default TermExplainer;
