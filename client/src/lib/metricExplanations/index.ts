/**
 * Public surface for the Human Intelligence Translation Layer.
 *
 * Anything outside this folder should import from here, never from
 * `registry`, `semanticState` or `types` directly. This keeps the
 * internals refactorable without churn at the call sites.
 */

export {
  METRIC_EXPLANATIONS,
  REQUIRED_METRIC_IDS,
  getMetricExplanation,
} from './registry';

export {
  resolveSemanticState,
  readMetric,
  getSemanticTone,
} from './semanticState';

export type {
  MetricExplanation,
  MetricReading,
  RangeGuide,
  SemanticState,
  SemanticThreshold,
} from './types';

export { SEMANTIC_STATES } from './types';
