/**
 * Validation tests for the Global Intelligence Tooltip System.
 *
 * Asserts:
 *   1. The extended registry covers every required term ID from the
 *      FWL_GLOBAL_INTELLIGENCE_TOOLTIP_SYSTEM_V1 spec.
 *   2. Every extended entry exposes the explainer schema (title,
 *      definition, whyItMatters, ranges, influences, improvementActions,
 *      thresholds, direction).
 *   3. Depth tier (when declared) is a valid value (L1 / L2 / L3).
 *   4. The reusable <TermExplainer /> primitive uses the same mobile
 *      bottom-sheet + desktop popover pattern as <MetricExplainer />,
 *      with NO native `title` browser-tooltip.
 *   5. The reusable <SectionExplainer /> primitive renders through
 *      <MetricExplainer />, inheriting the mobile-safe pattern.
 *   6. High-impact surfaces wire SectionExplainer or MetricExplainer
 *      for their canonical engine ID.
 *
 * Pure unit tests — no DOM, no Supabase. Run via:
 *   tsx script/test-global-tooltip-system.ts
 */

import {
  METRIC_EXPLANATIONS,
  REQUIRED_EXTENDED_IDS,
  EXTENDED_EXPLANATIONS,
  getMetricExplanation,
  resolveSemanticState,
  SEMANTIC_STATES,
  EXPLAINER_CATEGORIES,
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

// ─── 1. Extended registry coverage ───────────────────────────────────────────
section('Extended registry coverage');

for (const id of REQUIRED_EXTENDED_IDS) {
  const entry = getMetricExplanation(id);
  assert(`registry contains '${id}'`, !!entry, `missing entry for ${id}`);
}

assert(
  'merged registry contains both core + extended entries',
  Object.keys(METRIC_EXPLANATIONS).length >= Object.keys(EXTENDED_EXPLANATIONS).length + 18,
);

// ─── 2. Schema completeness for extended entries ─────────────────────────────
section('Schema completeness — extended entries');

for (const [id, entry] of Object.entries(EXTENDED_EXPLANATIONS)) {
  assert(
    `'${id}': has title + definition + whyItMatters`,
    Boolean(entry.title && entry.definition && entry.whyItMatters),
  );
  assert(
    `'${id}': declares direction (higher|lower)`,
    entry.direction === 'higher' || entry.direction === 'lower',
  );
  assert(
    `'${id}': has at least 2 range guides`,
    Array.isArray(entry.ranges) && entry.ranges.length >= 2,
  );
  assert(
    `'${id}': has at least 1 influence and 1 improvement action`,
    entry.influences.length >= 1 && entry.improvementActions.length >= 1,
  );
  assert(
    `'${id}': has at least 1 threshold rung`,
    Array.isArray(entry.thresholds) && entry.thresholds.length >= 1,
  );
  const predicateOk = entry.thresholds.every((r) =>
    entry.direction === 'higher' ? r.gte !== undefined : r.lte !== undefined,
  );
  assert(
    `'${id}': every threshold rung has the predicate matching direction`,
    predicateOk,
  );
  const statesOk = entry.thresholds.every((r) =>
    (SEMANTIC_STATES as ReadonlyArray<string>).includes(r.state),
  );
  assert(`'${id}': all threshold states are valid SemanticStates`, statesOk);

  if (entry.depth !== undefined) {
    assert(
      `'${id}': depth is L1 | L2 | L3`,
      entry.depth === 'L1' || entry.depth === 'L2' || entry.depth === 'L3',
    );
  }
  if (entry.categories !== undefined) {
    const categoriesOk = entry.categories.every((c) =>
      (EXPLAINER_CATEGORIES as ReadonlyArray<string>).includes(c),
    );
    assert(`'${id}': all categories are valid ExplainerCategory values`, categoriesOk);
  }
}

// ─── 3. Resolver still works on extended entries ─────────────────────────────
section('Resolver remains pure for extended (qualitative) entries');

const dca = getMetricExplanation('dca')!;
assert('dca resolves to a SemanticState', !!resolveSemanticState(dca, 50));
const drawdown = getMetricExplanation('drawdown')!;
assert('drawdown: 5% → excellent', resolveSemanticState(drawdown, 5) === 'excellent');
assert('drawdown: 60% → stressed', resolveSemanticState(drawdown, 60) === 'stressed');
const fireProb = getMetricExplanation('fire-probability')!;
assert('fire-probability: 90 → excellent', resolveSemanticState(fireProb, 90) === 'excellent');
assert('fire-probability: 30 → stressed', resolveSemanticState(fireProb, 30) === 'stressed');
const cagr = getMetricExplanation('cagr')!;
assert('cagr: 12 → excellent', resolveSemanticState(cagr, 12) === 'excellent');
assert('cagr: 0 → stressed', resolveSemanticState(cagr, 0) === 'stressed');

// ─── 4. TermExplainer primitive: mobile-safe, no native title tooltip ────────
section('TermExplainer primitive — mobile bottom-sheet, no native title');

const termSrc = readFileSync(
  resolve(__dirname, '../client/src/components/intelligence/TermExplainer.tsx'),
  'utf8',
);
assert(
  'TermExplainer imports app Sheet primitive',
  termSrc.includes("from '@/components/ui/sheet'"),
);
assert(
  'TermExplainer imports app Popover primitive',
  termSrc.includes("from '@/components/ui/popover'"),
);
assert(
  "TermExplainer uses isMobile + side=\"bottom\"",
  termSrc.includes('useIsMobile') && termSrc.includes('side="bottom"'),
);
const termTitleMatches = termSrc.match(/\btitle\s*=\s*["{`]/g);
assert(
  'TermExplainer does NOT use native `title` attribute',
  termTitleMatches === null,
  termTitleMatches ? `found ${termTitleMatches.length} occurrence(s)` : undefined,
);
assert(
  'TermExplainer exports marker constants for primitive verification',
  termSrc.includes('TERM_EXPLAINER_MOBILE_PRIMITIVE') &&
    termSrc.includes('TERM_EXPLAINER_DESKTOP_PRIMITIVE'),
);
assert(
  'TermExplainer degrades to plain text when metric is missing',
  termSrc.includes('return <>{children}</>'),
);

// ─── 5. SectionExplainer primitive delegates to MetricExplainer ──────────────
section('SectionExplainer primitive — wraps MetricExplainer');

const sectionSrc = readFileSync(
  resolve(__dirname, '../client/src/components/intelligence/SectionExplainer.tsx'),
  'utf8',
);
assert(
  'SectionExplainer renders <MetricExplainer />',
  sectionSrc.includes('MetricExplainer'),
);
const sectionTitleMatches = sectionSrc.match(/\btitle\s*=\s*["{`]/g);
assert(
  'SectionExplainer does NOT introduce native `title` tooltip',
  sectionTitleMatches === null,
);

// ─── 6. Wiring on high-impact surfaces ───────────────────────────────────────
section('High-impact surfaces wire the explainer');

const wiringChecks: Array<[string, string, string]> = [
  ['FamilyOfficeMode wires family-office-mode', 'FamilyOfficeMode.tsx', 'family-office-mode'],
  ['FamilyOfficeMode wires portfolio-construction', 'FamilyOfficeMode.tsx', 'portfolio-construction'],
  ['FamilyOfficeMode wires execution-os', 'FamilyOfficeMode.tsx', 'execution-os'],
  ['FamilyOfficeMode wires tax-efficiency', 'FamilyOfficeMode.tsx', 'tax-efficiency'],
  ['FamilyOfficeMode wires strategic-priorities', 'FamilyOfficeMode.tsx', 'strategic-priorities'],
  ['MonteCarloV5Panel wires monte-carlo', 'MonteCarloV5Panel.tsx', 'monte-carlo'],
  ['MonteCarloDashboard wires monte-carlo', 'MonteCarloDashboard.tsx', 'monte-carlo'],
  ['FutureWorldsPanel wires future-worlds', 'FutureWorldsPanel.tsx', 'future-worlds'],
  ['AIInsightsCard wires autonomous-os', 'AIInsightsCard.tsx', 'autonomous-os'],
  ['RiskRadarCard wires risk-state', 'RiskRadarCard.tsx', 'risk-state'],
  ['FIREPathCard wires fire', 'FIREPathCard.tsx', 'fire'],
  ['BestMoveCard wires best-move', 'BestMoveCard.tsx', 'best-move'],
  ['FinancialOSCentre wires financial-os', 'FinancialOSCentre.tsx', 'financial-os'],
  ['FinancialOSCentre wires behavioural-drift', 'FinancialOSCentre.tsx', 'behavioural-drift'],
  ['FinancialOSCentre wires autonomous-os', 'FinancialOSCentre.tsx', 'autonomous-os'],
  ['TaxAlphaCard wires tax-efficiency', 'TaxAlphaCard.tsx', 'tax-efficiency'],
  ['ExecutiveDashboard wires recommendation-engine', 'ExecutiveDashboard.tsx', 'recommendation-engine'],
  ['ExecutiveDashboard wires strategic-priorities', 'ExecutiveDashboard.tsx', 'strategic-priorities'],
  ['ExecutiveDashboard wires net-worth-reconciliation', 'ExecutiveDashboard.tsx', 'net-worth-reconciliation'],
  ['ExecutiveDashboard wires safe-surplus', 'ExecutiveDashboard.tsx', 'safe-surplus'],
];

for (const [name, file, id] of wiringChecks) {
  const src = readFileSync(
    resolve(__dirname, `../client/src/components/${file}`),
    'utf8',
  );
  const hit =
    src.includes(`metricId="${id}"`) || src.includes(`metricId='${id}'`);
  assert(name, hit, `'${id}' not wired in ${file}`);
}

// ─── Done ────────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ all global tooltip system tests passed' : `✗ ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
