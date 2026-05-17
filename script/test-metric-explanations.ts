/**
 * Validation tests for the Human Intelligence Translation Layer.
 *
 * Asserts:
 *   1. The metric explanation registry covers every required metric ID.
 *   2. Each entry exposes the full explainer schema (definition, why it
 *      matters, ranges, influences, improvement actions, thresholds).
 *   3. Semantic threshold mapping returns the expected SemanticState for a
 *      battery of representative values across direction='higher' and
 *      direction='lower' metrics.
 *   4. Every dashboard-required indicator (Liquidity, Leverage,
 *      Survivability, FIRE, Runway, Debt Pressure) is wired into the
 *      ExecutiveDashboard / FinancialHealthStrip surface via a
 *      MetricExplainer trigger (static grep over the source).
 *   5. The MetricExplainer mobile code-path uses the app's bottom-sheet
 *      primitive — NOT a native browser tooltip / `title` attribute.
 *
 * Pure unit tests — no DOM, no Supabase. Run via:
 *   tsx script/test-metric-explanations.ts
 */

import {
  METRIC_EXPLANATIONS,
  REQUIRED_METRIC_IDS,
  getMetricExplanation,
  resolveSemanticState,
  readMetric,
  getSemanticTone,
  SEMANTIC_STATES,
  type SemanticState,
} from '../client/src/lib/metricExplanations';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}
function section(name: string) {
  console.log(`\n— ${name}`);
}

// ─── 1. Registry coverage ────────────────────────────────────────────────────
section('Registry coverage');

for (const id of REQUIRED_METRIC_IDS) {
  const entry = getMetricExplanation(id);
  assert(`registry contains '${id}'`, !!entry, `missing entry for ${id}`);
}

// ─── 2. Schema completeness ──────────────────────────────────────────────────
section('Schema completeness for every registered metric');

for (const [id, entry] of Object.entries(METRIC_EXPLANATIONS)) {
  assert(
    `'${id}': has title, definition, whyItMatters`,
    Boolean(entry.title && entry.definition && entry.whyItMatters),
  );
  assert(
    `'${id}': declares direction (higher|lower)`,
    entry.direction === 'higher' || entry.direction === 'lower',
  );
  assert(
    `'${id}': has at least 3 range guides`,
    Array.isArray(entry.ranges) && entry.ranges.length >= 3,
  );
  assert(
    `'${id}': has at least 1 influence and 1 improvement action`,
    entry.influences.length >= 1 && entry.improvementActions.length >= 1,
  );
  assert(
    `'${id}': has at least 3 semantic thresholds`,
    Array.isArray(entry.thresholds) && entry.thresholds.length >= 3,
  );
  // Each threshold rung must declare the right predicate for the direction.
  const predicateOk = entry.thresholds.every((r) =>
    entry.direction === 'higher' ? r.gte !== undefined : r.lte !== undefined,
  );
  assert(
    `'${id}': every threshold rung has the predicate matching direction`,
    predicateOk,
  );
  // Every threshold state must be a known SemanticState.
  const statesOk = entry.thresholds.every((r) =>
    (SEMANTIC_STATES as ReadonlyArray<string>).includes(r.state),
  );
  assert(`'${id}': all threshold states are valid SemanticStates`, statesOk);
}

// ─── 3. Semantic state mapping ───────────────────────────────────────────────
section('Semantic state mapping — representative values');

const liquidity = getMetricExplanation('liquidity')!;
assert('liquidity: 18 months → excellent', resolveSemanticState(liquidity, 18) === 'excellent');
assert('liquidity: 8 months → strong', resolveSemanticState(liquidity, 8) === 'strong');
assert('liquidity: 4 months → healthy', resolveSemanticState(liquidity, 4) === 'healthy');
assert('liquidity: 2.5 months → moderate', resolveSemanticState(liquidity, 2.5) === 'moderate');
assert('liquidity: 1 month → stressed', resolveSemanticState(liquidity, 1) === 'stressed');

const leverage = getMetricExplanation('leverage')!;
assert('leverage: 25% → excellent', resolveSemanticState(leverage, 25) === 'excellent');
assert('leverage: 45% → strong', resolveSemanticState(leverage, 45) === 'strong');
assert('leverage: 60% → healthy', resolveSemanticState(leverage, 60) === 'healthy');
assert('leverage: 72% → moderate', resolveSemanticState(leverage, 72) === 'moderate');
assert('leverage: 80% → elevated', resolveSemanticState(leverage, 80) === 'elevated');
assert('leverage: 95% → stressed', resolveSemanticState(leverage, 95) === 'stressed');

const fire = getMetricExplanation('fire-progress')!;
assert('fire: 85% → excellent', resolveSemanticState(fire, 85) === 'excellent');
assert('fire: 60% → strong', resolveSemanticState(fire, 60) === 'strong');
assert('fire: 40% → healthy', resolveSemanticState(fire, 40) === 'healthy');
assert('fire: 20% → moderate', resolveSemanticState(fire, 20) === 'moderate');
assert('fire: 5% → elevated', resolveSemanticState(fire, 5) === 'elevated');

const debtPressure = getMetricExplanation('debt-pressure')!;
assert('debt-pressure: 15% → excellent', resolveSemanticState(debtPressure, 15) === 'excellent');
assert('debt-pressure: 25% → strong', resolveSemanticState(debtPressure, 25) === 'strong');
assert('debt-pressure: 35% → healthy', resolveSemanticState(debtPressure, 35) === 'healthy');
assert('debt-pressure: 70% → stressed', resolveSemanticState(debtPressure, 70) === 'stressed');

const surv = getMetricExplanation('survivability')!;
assert('survivability: 30 mo → excellent', resolveSemanticState(surv, 30) === 'excellent');
assert('survivability: 9 mo → healthy', resolveSemanticState(surv, 9) === 'healthy');
assert('survivability: 2 mo → stressed', resolveSemanticState(surv, 2) === 'stressed');

const risk = getMetricExplanation('risk-state')!;
assert('risk-state: 90 → excellent', resolveSemanticState(risk, 90) === 'excellent');
assert('risk-state: 30 → elevated', resolveSemanticState(risk, 30) === 'elevated');
assert('risk-state: 10 → stressed', resolveSemanticState(risk, 10) === 'stressed');

const mc = getMetricExplanation('monte-carlo-probability')!;
assert('mc-prob: 92% → excellent', resolveSemanticState(mc, 92) === 'excellent');
assert('mc-prob: 50% → moderate', resolveSemanticState(mc, 50) === 'moderate');
assert('mc-prob: 30% → stressed', resolveSemanticState(mc, 30) === 'stressed');

const tail = getMetricExplanation('tail-risk')!;
assert('tail-risk: 8% → excellent', resolveSemanticState(tail, 8) === 'excellent');
assert('tail-risk: 25% → healthy', resolveSemanticState(tail, 25) === 'healthy');
assert('tail-risk: 60% → stressed', resolveSemanticState(tail, 60) === 'stressed');

const stress = getMetricExplanation('stress-signals')!;
assert('stress-signals: 0 → excellent', resolveSemanticState(stress, 0) === 'excellent');
assert('stress-signals: 3 → moderate', resolveSemanticState(stress, 3) === 'moderate');
assert('stress-signals: 8 → stressed', resolveSemanticState(stress, 8) === 'stressed');

// NaN / Infinity guard
assert('NaN value → moderate fallback', resolveSemanticState(liquidity, Number.NaN) === 'moderate');
assert('+Infinity value → moderate fallback (non-finite guard)', resolveSemanticState(liquidity, Number.POSITIVE_INFINITY) === 'moderate');
// Very large finite values should still classify as the best rung:
assert('liquidity 1e6 mo → excellent (finite ceiling)', resolveSemanticState(liquidity, 1e6) === 'excellent');

// readMetric composes everything
const reading = readMetric(liquidity, 7, '7.0 mo');
assert('readMetric returns matching state', reading.state === 'strong');
assert('readMetric carries displayValue', reading.displayValue === '7.0 mo');
assert('readMetric runs interpretation', typeof reading.interpretation === 'string' && reading.interpretation.length > 0);

// getSemanticTone returns valid tokens for every state
for (const s of SEMANTIC_STATES as ReadonlyArray<SemanticState>) {
  const tone = getSemanticTone(s);
  assert(`getSemanticTone('${s}') returns text/bg/border/label`,
    Boolean(tone.text && tone.bg && tone.border && tone.label));
}

// ─── 4. Dashboard wiring (static grep) ───────────────────────────────────────
section('Dashboard wiring — required metrics surface a MetricExplainer');

const execDash = readFileSync(
  resolve(__dirname, '../client/src/components/ExecutiveDashboard.tsx'),
  'utf8',
);
const requiredOnDashboard = [
  'liquidity',
  'leverage',
  'survivability',
  'fire-progress',
  'runway',
  'debt-pressure',
  'risk-state',
  'macro-regime',
  'confidence',
];
for (const id of requiredOnDashboard) {
  // Either the metricId='liquidity' literal, or the explainer prop with that ID.
  const hit = execDash.includes(`metricId="${id}"`) || execDash.includes(`metricId: '${id}'`) || execDash.includes(`'${id}'`);
  assert(`ExecutiveDashboard wires '${id}'`, hit);
}
assert('ExecutiveDashboard imports MetricExplainer', execDash.includes("from '@/components/intelligence/MetricExplainer'"));
assert('ExecutiveDashboard renders SystemInterpretation', execDash.includes('SystemInterpretation'));

const riskPanel = readFileSync(
  resolve(__dirname, '../client/src/components/UnifiedRiskPanel.tsx'),
  'utf8',
);
assert('UnifiedRiskPanel wires risk-state explainer', riskPanel.includes('metricId="risk-state"'));
assert('UnifiedRiskPanel wires stress-signals explainer', riskPanel.includes('metricId="stress-signals"'));

const firePanel = readFileSync(
  resolve(__dirname, '../client/src/components/UnifiedFirePanel.tsx'),
  'utf8',
);
assert('UnifiedFirePanel wires fire-progress explainer', firePanel.includes('metricId="fire-progress"'));
assert('UnifiedFirePanel wires withdrawal-sustainability explainer', firePanel.includes('metricId="withdrawal-sustainability"'));

// ─── 5. Mobile-safe explainer UI — no native title tooltip ───────────────────
section('Mobile-safe explainer UI');

const explainerSrc = readFileSync(
  resolve(__dirname, '../client/src/components/intelligence/MetricExplainer.tsx'),
  'utf8',
);
assert(
  'MetricExplainer imports app Sheet primitive',
  explainerSrc.includes("from '@/components/ui/sheet'"),
);
assert(
  'MetricExplainer imports app Popover primitive',
  explainerSrc.includes("from '@/components/ui/popover'"),
);
assert(
  "MetricExplainer uses isMobile to branch to bottom-sheet",
  explainerSrc.includes('useIsMobile') && explainerSrc.includes('side="bottom"'),
);
// Hard ban on the native browser tooltip:
const titleMatches = explainerSrc.match(/\btitle\s*=\s*["{`]/g);
assert(
  'MetricExplainer does NOT use native `title` attribute on the trigger',
  titleMatches === null,
  titleMatches ? `found ${titleMatches.length} occurrence(s)` : undefined,
);
assert(
  'MetricExplainer exports marker constants for primitive verification',
  explainerSrc.includes('METRIC_EXPLAINER_MOBILE_PRIMITIVE') &&
    explainerSrc.includes('METRIC_EXPLAINER_DESKTOP_PRIMITIVE'),
);

// ─── Done ────────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ all metric-explanation tests passed' : `✗ ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
