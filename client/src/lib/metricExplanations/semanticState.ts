/**
 * Semantic state engine.
 *
 * Maps a raw numeric metric value to a SemanticState by walking the
 * metric's threshold table. Returns a single `SemanticState`. Pure /
 * deterministic — safe to call in render.
 */

import type {
  MetricExplanation,
  MetricReading,
  SemanticState,
} from './types';

/**
 * Resolve a numeric value to a SemanticState using the metric's threshold
 * table.
 *
 * Rules:
 *   • `direction: 'higher'` → walk rungs in order, return first state whose
 *     `gte` predicate is satisfied (value >= gte).
 *   • `direction: 'lower'` → walk rungs in order, return first state whose
 *     `lte` predicate is satisfied (value <= lte).
 *
 * If no rung matches, the WORST state in the table is returned (last entry
 * for `higher`, last entry for `lower`). This means thresholds should
 * always declare a worst-case rung.
 *
 * NaN/Infinity guard: returns 'moderate' as a neutral fallback rather than
 * propagating bad data into the UI tone.
 */
export function resolveSemanticState(
  metric: MetricExplanation,
  value: number,
): SemanticState {
  if (!Number.isFinite(value)) return 'moderate';

  for (const rung of metric.thresholds) {
    if (metric.direction === 'higher') {
      if (rung.gte !== undefined && value >= rung.gte) return rung.state;
    } else {
      if (rung.lte !== undefined && value <= rung.lte) return rung.state;
    }
  }

  // No rung matched — pick the worst-declared state.
  const last = metric.thresholds[metric.thresholds.length - 1];
  return last?.state ?? 'moderate';
}

/**
 * Compose a full MetricReading: numeric value, semantic state, optional
 * dynamic interpretation sentence and pre-formatted display string.
 */
export function readMetric(
  metric: MetricExplanation,
  value: number,
  displayValue?: string,
): MetricReading {
  const state = resolveSemanticState(metric, value);
  return {
    id: metric.id,
    value,
    displayValue,
    state,
    interpretation: metric.interpretation?.(value, state),
  };
}

/**
 * Tailwind / inline-style colour tokens for each semantic state.
 *
 * Re-uses the existing gold / green / amber / red accent system. The
 * `hsl(...)` literals match those already used in ExecutiveDashboard,
 * FinancialHealthStrip, RiskRadarCard, etc. — no new colour identities
 * are introduced.
 */
export function getSemanticTone(state: SemanticState): {
  text: string;
  bg: string;
  border: string;
  /** Single-word badge label, capitalised. */
  label: string;
} {
  switch (state) {
    case 'excellent':
      return {
        text: 'hsl(142,70%,62%)',
        bg: 'hsl(142,60%,10%)',
        border: 'hsl(142,60%,30%)',
        label: 'Excellent',
      };
    case 'strong':
      return {
        text: 'hsl(142,60%,55%)',
        bg: 'hsl(142,55%,9%)',
        border: 'hsl(142,55%,28%)',
        label: 'Strong',
      };
    case 'healthy':
      return {
        text: 'hsl(150,55%,52%)',
        bg: 'hsl(150,50%,9%)',
        border: 'hsl(150,50%,26%)',
        label: 'Healthy',
      };
    case 'moderate':
      return {
        text: 'hsl(43,90%,62%)',
        bg: 'hsl(43,70%,10%)',
        border: 'hsl(43,70%,28%)',
        label: 'Moderate',
      };
    case 'elevated':
      return {
        text: 'hsl(28,85%,60%)',
        bg: 'hsl(28,70%,10%)',
        border: 'hsl(28,70%,28%)',
        label: 'Elevated',
      };
    case 'stressed':
      return {
        text: 'hsl(0,72%,60%)',
        bg: 'hsl(0,60%,10%)',
        border: 'hsl(0,60%,28%)',
        label: 'Stressed',
      };
    case 'critical':
      return {
        text: 'hsl(0,85%,68%)',
        bg: 'hsl(0,70%,12%)',
        border: 'hsl(0,70%,34%)',
        label: 'Critical',
      };
  }
}
