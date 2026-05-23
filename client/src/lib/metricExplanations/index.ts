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
  REQUIRED_EXTENDED_IDS,
  getMetricExplanation,
} from './registry';

export { EXTENDED_EXPLANATIONS } from './extendedRegistry';

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
  ExplainerDepth,
  ExplainerCategory,
} from './types';

export { SEMANTIC_STATES, EXPLAINER_CATEGORIES } from './types';
