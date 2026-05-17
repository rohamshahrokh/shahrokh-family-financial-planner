/**
 * <SystemInterpretation />
 *
 * Compact human-readable interpretation line that sits beneath a major
 * card group (e.g. Financial Health Strip, Risk Panel). It composes
 * one or two short clauses from the live MetricReadings — never noisy
 * paragraphs, never raw signal dumps. Examples produced upstream:
 *
 *   "Liquidity offsets leverage risk — debt is strategic, not distressed."
 *   "Cashflow resilience is healthy under moderate stress."
 *
 * Pure presentation. Reads from the translation layer only.
 */

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSemanticTone, type MetricReading } from '@/lib/metricExplanations';

interface SystemInterpretationProps {
  /** Concise sentence(s) — kept short to preserve dashboard tone. */
  text: string;
  /** Optional dominant reading whose state colours the accent dot. */
  dominant?: MetricReading;
  /** Extra class for layout tweaks. */
  className?: string;
  /** Hide the gold sparkle icon (useful inside header strips). */
  iconless?: boolean;
}

export function SystemInterpretation({
  text,
  dominant,
  className,
  iconless,
}: SystemInterpretationProps) {
  const accent = dominant
    ? getSemanticTone(dominant.state).text
    : 'hsl(var(--gold))';

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-4 py-2 border-t border-border/30',
        className,
      )}
      data-testid="system-interpretation"
    >
      {!iconless && (
        <Sparkles
          className="w-3 h-3 mt-[3px] shrink-0"
          style={{ color: accent }}
          aria-hidden="true"
        />
      )}
      <p className="text-[11px] leading-relaxed text-foreground/75">{text}</p>
    </div>
  );
}

/**
 * Helper: pick the worst-state reading from a list. Used by callers
 * to colour the accent dot by the dominant concern.
 */
export function pickDominantReading(
  readings: ReadonlyArray<MetricReading | undefined>,
): MetricReading | undefined {
  const order = [
    'critical',
    'stressed',
    'elevated',
    'moderate',
    'healthy',
    'strong',
    'excellent',
  ] as const;
  const ranked = readings
    .filter((r): r is MetricReading => !!r)
    .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return ranked[0];
}

export default SystemInterpretation;
