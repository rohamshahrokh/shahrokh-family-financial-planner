/**
 * AuditableMetric.tsx — Wrap any rendered metric to make it clickable when
 * global Audit Mode is ON.
 *
 * Behaviour
 * ---------
 *   • Audit Mode OFF — renders children EXACTLY as-is. No wrapper, no extra
 *     padding, no click handlers, zero visual change. Layout must not shift
 *     when the global toggle flips.
 *   • Audit Mode ON — wraps children in a button that opens the
 *     CalculationTracePanel for the given trace `id`. A subtle dotted
 *     underline + sub-pixel cursor change indicates the metric is clickable.
 *
 * The wrapper accepts text/number children and inherits typography/colour
 * from the parent, so existing premium typography (big bold gold values,
 * tabular-nums, the gradient hero values, etc.) is preserved.
 *
 * If the consumer passes an id that is not in the audit registry, the metric
 * still renders normally — the wrapper is a no-op rather than a hard failure.
 * This keeps incremental wiring safe.
 */

import { memo, useCallback } from 'react';
import { useAuditMode } from '@/lib/auditMode/AuditModeContext';
import { hasTrace } from '@/lib/auditMode/auditRegistry';

export interface AuditableMetricProps {
  /** Stable id used to look up the CalculationTrace in the registry. */
  traceId: string;
  /** Optional class names appended to the wrapper button (or span when off). */
  className?: string;
  /** Children are rendered as-is — typically the formatted metric value. */
  children: React.ReactNode;
  /** Optional override for the data-testid attribute. */
  testId?: string;
}

function AuditableMetricInner({
  traceId,
  className,
  children,
  testId,
}: AuditableMetricProps) {
  const { auditMode, openTrace } = useAuditMode();

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      openTrace(traceId);
    },
    [openTrace, traceId],
  );

  // Audit Mode OFF — render children untouched. We still emit a data attribute
  // so the static test suite can grep for which surfaces are wired.
  if (!auditMode) {
    return (
      <span
        data-audit-trace-id={traceId}
        data-audit-mode="off"
        className={className}
      >
        {children}
      </span>
    );
  }

  // Audit Mode ON but the trace registry has no entry yet — render normally
  // but flag the surface as audit-aware for the test suite. This way pages
  // can declare audit-readiness incrementally without breaking the UI.
  if (!hasTrace(traceId)) {
    return (
      <span
        data-audit-trace-id={traceId}
        data-audit-mode="on-unregistered"
        className={className}
        title="Calculation trace not yet registered for this metric."
        style={{
          textDecoration: 'underline dotted hsl(var(--muted-foreground) / 0.5)',
          textUnderlineOffset: '3px',
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-audit-trace-id={traceId}
      data-audit-mode="on"
      data-testid={testId ?? `audit-metric-${traceId}`}
      className={className}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        // Subtle premium indicator — does not crowd the value.
        textDecoration: 'underline dotted hsl(var(--gold) / 0.55)',
        textUnderlineOffset: '3px',
        textDecorationThickness: '1px',
      }}
      aria-label="Show calculation trace"
    >
      {children}
    </button>
  );
}

export const AuditableMetric = memo(AuditableMetricInner);
