/**
 * <SectionExplainer />
 *
 * Header-level convenience that pairs a section title with the shared
 * MetricExplainer info trigger. Keeps panel/card headers tidy without
 * forcing every header to wire the same flex+icon plumbing.
 *
 * Use this on panel/card/section headers (Family Office, Future Worlds,
 * Monte Carlo, Risk Radar, FIRE Path, AI Insights, Recommendation
 * Engine, Net Worth Reconciliation, etc).
 *
 * Renders nothing visual on its own beyond the trigger — the explanation
 * body comes from the central registry via <MetricExplainer />.
 */

import * as React from 'react';
import { MetricExplainer } from './MetricExplainer';
import { cn } from '@/lib/utils';

interface SectionExplainerProps {
  /** Canonical metric / engine ID from the registry. */
  metricId: string;
  /** Optional className for tweaking spacing inside a header row. */
  className?: string;
  /** Trigger icon size in px. Default 13. */
  size?: number;
}

export function SectionExplainer({
  metricId,
  className,
  size = 13,
}: SectionExplainerProps) {
  return (
    <span
      className={cn('inline-flex items-center align-middle', className)}
      data-testid={`section-explainer-${metricId}`}
    >
      <MetricExplainer metricId={metricId} size={size} />
    </span>
  );
}

export default SectionExplainer;
