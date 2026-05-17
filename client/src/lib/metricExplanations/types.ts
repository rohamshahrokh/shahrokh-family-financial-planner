/**
 * Human Intelligence Translation Layer — type contracts.
 *
 * FWL has quant-grade engines (Monte Carlo, Behavioural, Autonomous OS,
 * Strategic Priority Stack, Debt Intelligence, FIRE, Scenario Tree, Risk).
 * The numbers on the dashboard are correct — but most of them read like
 * raw signals from a Bloomberg terminal. This layer translates each
 * canonical metric into:
 *
 *   • what it is, in one plain-English sentence
 *   • whether the current reading is healthy or risky (semantic state)
 *   • why it matters to the family
 *   • what influences it
 *   • what concrete actions move it in the healthy direction
 *
 * Purely a presentation layer. It NEVER recomputes financial quantities —
 * it consumes canonical values produced upstream (dashboardDataContract,
 * recommendationEngine, monteCarloCanonical, riskEngine, etc.) and maps
 * them to a semantic state and a human-readable interpretation.
 */

/**
 * Semantic state buckets used across every metric.
 *
 * Ordered from best → worst so that array index can be used to compare
 * two states (e.g. "is liquidity worse than leverage?").
 *
 * The colour tones intentionally reuse the existing palette: green for
 * healthy, gold/amber for moderate, red for stressed. Components should
 * never hardcode tones — call `getSemanticTone(state)` instead.
 */
export const SEMANTIC_STATES = [
  'excellent',
  'strong',
  'healthy',
  'moderate',
  'elevated',
  'stressed',
  'critical',
] as const;

export type SemanticState = (typeof SEMANTIC_STATES)[number];

/**
 * Numeric threshold rung. The engine picks the FIRST rung whose `lte`
 * (less-than-or-equal) or `gte` (greater-than-or-equal) predicate matches.
 *
 * Each metric declares whether higher is healthier (`direction: 'higher'`)
 * or lower is healthier (`direction: 'lower'`). Rungs are evaluated in
 * declaration order; the first match wins.
 */
export interface SemanticThreshold {
  state: SemanticState;
  /** When `direction: 'higher'`: value >= gte qualifies. */
  gte?: number;
  /** When `direction: 'lower'`: value <= lte qualifies. */
  lte?: number;
  /** Optional label override for the dashboard chip. */
  label?: string;
}

/**
 * Plain-language ranges shown in the explainer popover.
 * No engineering — purely descriptive ("6+ months", "above 70%", …).
 */
export interface RangeGuide {
  state: SemanticState;
  /** Numeric description e.g. "6+ months", "below 30%", "70 – 90%". */
  range: string;
  /** Plain-English meaning. */
  meaning: string;
}

export interface MetricExplanation {
  /** Canonical metric ID (kebab-case). */
  id: string;
  /** Short display title shown on the card. */
  title: string;
  /** Optional one-line subtitle / unit hint (e.g. "months of expenses"). */
  unit?: string;
  /** Direction of "healthy": higher value is better OR lower value is better. */
  direction: 'higher' | 'lower';
  /** One-sentence plain-English definition. NO jargon. */
  definition: string;
  /** Why this matters specifically to a long-horizon family. */
  whyItMatters: string;
  /** Plain-English ranges, one per semantic state, ordered best → worst. */
  ranges: RangeGuide[];
  /** What inputs / decisions move this metric. */
  influences: string[];
  /** Typical actions the family can take to improve the reading. */
  improvementActions: string[];
  /** Semantic threshold table — the engine maps a value to a SemanticState. */
  thresholds: SemanticThreshold[];
  /**
   * Optional dynamic interpretation. Called with the live value and produces
   * a single sentence — "Liquidity offsets leverage risk", "Debt is
   * strategic, not distressed". Used for the compact interpretation line
   * shown beneath major card groups.
   */
  interpretation?: (value: number, state: SemanticState) => string;
}

/**
 * A live evaluation: the raw numeric value plus the semantic mapping the
 * registry produced for it. Consumed by `<MetricExplainer />` and the
 * compact interpretation lines.
 */
export interface MetricReading {
  id: string;
  value: number;
  /** Optional formatted display value (e.g. "6.2 mo", "42%"). */
  displayValue?: string;
  state: SemanticState;
  /** Concise interpretation sentence — derived via the metric's `interpretation` fn. */
  interpretation?: string;
}
