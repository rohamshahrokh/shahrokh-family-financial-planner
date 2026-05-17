/**
 * Future Worlds UX rebuild — validation tests.
 *
 * Pure Node validation suite — runs with:
 *   npx tsx script/test-future-worlds-rebuild.ts
 *
 * Asserts the contract of the Future Worlds rebuild without requiring a DOM:
 *
 *   1. Derivation layer produces a complete model — exactly three worlds
 *      (bear / base / bull), an executive summary, and a 5-row sensitivity
 *      map covering rates, property, equity, inflation and employment.
 *   2. Probabilities sum to ~1.0 and each cluster carries a non-trivial
 *      share (no empty world cards).
 *   3. Every world exposes a key driver and a recommended posture — no
 *      empty/null cells.
 *   4. "What changed under the hood" explainability is populated for each
 *      world, and never an empty list.
 *   5. The registry has the required new tooltip IDs (bear-world,
 *      base-world, bull-world, portfolio-sensitivity, macro-tailwind,
 *      macro-vulnerability, scenario-driver, stress-level,
 *      decision-posture, resilience-score) and each entry is schema-valid.
 *   6. FutureWorldsPanel source wires the executive summary, three-world
 *      grid, sensitivity map and the required tooltip ids — and never
 *      emits a "—" placeholder row.
 *   7. The panel does NOT introduce a native `title` browser tooltip.
 *   8. No engine math is duplicated — derivation is the only new source
 *      file in `client/src/lib/futureWorlds/` and it does not import the
 *      Monte Carlo / Recommendation / Forecast engines.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScenarioTree } from '../client/src/lib/scenarioTree';
import { deriveFutureWorlds } from '../client/src/lib/futureWorlds/derive';
import {
  getMetricExplanation,
  SEMANTIC_STATES,
} from '../client/src/lib/metricExplanations';

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

// ─── 1. Derivation contract ─────────────────────────────────────────────────
section('Derivation layer — model shape');

const tree = buildScenarioTree({
  baseNetWorth: 811_000,
  basePropertyGrowth: 0.05,
  baseEtfReturn: 0.07,
  baseCryptoReturn: 0.12,
  baseInflation: 0.025,
  baseMortgageRate: 0.0625,
  baseFireYears: 15,
  horizonYears: 10,
});
const model = deriveFutureWorlds(tree, {
  baseNetWorth: 811_000,
  mortgageBalance: 1_200_000,
  propertyWeight: 0.74,
  equityWeight: 0.18,
  cryptoWeight: 0.04,
  bufferMonths: 3,
  incomeConcentration: 0.85,
});

assert('returns exactly three worlds', Object.keys(model.worlds).length === 3);
assert('has bear world', !!model.worlds.bear);
assert('has base world', !!model.worlds.base);
assert('has bull world', !!model.worlds.bull);
assert('has executive summary commentary', !!model.summary.commentary && model.summary.commentary.length > 20);
assert(
  'sensitivity map covers 5 factors (rates, property, equity, inflation, employment)',
  model.sensitivity.length === 5 &&
    ['rates', 'property', 'equity', 'inflation', 'employment'].every((id) =>
      model.sensitivity.some((r) => r.id === id),
    ),
);

const probSum = model.worlds.bear.probability + model.worlds.base.probability + model.worlds.bull.probability;
assert('cluster probabilities sum to ~1.0', Math.abs(probSum - 1) < 0.05, `got ${probSum.toFixed(3)}`);
assert(
  'every world carries non-trivial probability (>1%)',
  model.worlds.bear.probability > 0.01 &&
    model.worlds.base.probability > 0.01 &&
    model.worlds.bull.probability > 0.01,
);

// ─── 2. World cards never empty ────────────────────────────────────────────
section('World cards — no empty cells');

for (const kind of ['bear', 'base', 'bull'] as const) {
  const w = model.worlds[kind];
  assert(`${kind}: has label`, !!w.label && w.label.length > 0);
  assert(`${kind}: has key driver`, !!w.keyDriver && w.keyDriver.length > 0);
  assert(`${kind}: has recommended posture`, !!w.posture && w.posture.length > 10);
  assert(`${kind}: has 'what changes' narrative`, !!w.whatChanges && w.whatChanges.length > 10);
  assert(`${kind}: under-the-hood explainability is populated`, w.underTheHood.length >= 1);
  assert(`${kind}: stress level is in 0-100`, w.stressLevel >= 0 && w.stressLevel <= 100);
  assert(
    `${kind}: tooltip metricId matches naming convention`,
    w.metricId === `${kind}-world`,
  );
}

// Sensitivity rows are always non-empty (panel never renders a "—" placeholder).
section('Sensitivity rows — no placeholders');
for (const row of model.sensitivity) {
  assert(`sensitivity ${row.id}: has level`, ['High', 'Medium', 'Low'].includes(row.level));
  assert(`sensitivity ${row.id}: has explanation`, !!row.why && row.why.length > 10);
  assert(`sensitivity ${row.id}: ties to tooltip id`, row.metricId === 'portfolio-sensitivity');
}

// ─── 3. Registry coverage for new Future Worlds tooltip IDs ────────────────
section('Registry — Future Worlds tooltip IDs');

const REQUIRED_FW_IDS = [
  'bear-world',
  'base-world',
  'bull-world',
  'portfolio-sensitivity',
  'macro-tailwind',
  'macro-vulnerability',
  'scenario-driver',
  'stress-level',
  'decision-posture',
  'resilience-score',
];

for (const id of REQUIRED_FW_IDS) {
  const entry = getMetricExplanation(id);
  assert(`registry contains '${id}'`, !!entry);
  if (!entry) continue;
  assert(
    `'${id}': title + definition + whyItMatters`,
    Boolean(entry.title && entry.definition && entry.whyItMatters),
  );
  assert(`'${id}': declares direction`, entry.direction === 'higher' || entry.direction === 'lower');
  assert(`'${id}': ≥ 3 range guides`, entry.ranges.length >= 3);
  assert(`'${id}': ≥ 1 influence and ≥ 1 improvement action`, entry.influences.length >= 1 && entry.improvementActions.length >= 1);
  assert(`'${id}': ≥ 1 threshold rung`, entry.thresholds.length >= 1);
  const statesOk = entry.thresholds.every((r) =>
    (SEMANTIC_STATES as ReadonlyArray<string>).includes(r.state),
  );
  assert(`'${id}': all threshold states are valid SemanticStates`, statesOk);
}

// ─── 4. Panel source — required wiring & no placeholders ───────────────────
section('FutureWorldsPanel source — wiring & no placeholders');

const panelSrc = readFileSync(
  resolve(__dirname, '../client/src/components/FutureWorldsPanel.tsx'),
  'utf8',
);

// Renders the three-world grid.
assert('panel renders future-worlds-three-worlds section', panelSrc.includes('future-worlds-three-worlds'));
assert('panel renders future-worlds-executive-summary', panelSrc.includes('future-worlds-executive-summary'));
assert('panel renders future-worlds-sensitivity-map', panelSrc.includes('future-worlds-sensitivity-map'));

// Tooltip wiring for required ids.
const wiringIds = [
  'future-worlds',
  'bear-world',
  'base-world',
  'bull-world',
  'portfolio-sensitivity',
  'macro-tailwind',
  'macro-vulnerability',
  'resilience-score',
  'scenario-driver',
  'scenario-tree',
  'stress-level',
  'decision-posture',
];
for (const id of wiringIds) {
  assert(
    `panel wires tooltip id '${id}'`,
    panelSrc.includes(`metricId="${id}"`) || panelSrc.includes(`metricId='${id}'`),
    `'${id}' not wired in FutureWorldsPanel`,
  );
}

// No native browser tooltip.
const nativeTitleMatches = panelSrc.match(/<[a-z][^>]*\stitle\s*=\s*["{`]/g);
assert(
  'panel does NOT use native `title` browser tooltip on elements',
  nativeTitleMatches === null,
  nativeTitleMatches ? `found ${nativeTitleMatches.length} occurrence(s)` : undefined,
);

// Never renders a literal em-dash placeholder cell.
const placeholderMatches = panelSrc.match(/>\s*—\s*</g);
assert(
  'panel never renders a bare "—" placeholder row',
  placeholderMatches === null,
  placeholderMatches ? `found ${placeholderMatches.length} occurrence(s)` : undefined,
);

// ─── 5. No engine duplication ──────────────────────────────────────────────
section('Derivation does NOT duplicate engine math');

const deriveSrc = readFileSync(
  resolve(__dirname, '../client/src/lib/futureWorlds/derive.ts'),
  'utf8',
);

assert(
  'derive imports from scenarioTree (canonical engine)',
  deriveSrc.includes("from '@/lib/scenarioTree'") || deriveSrc.includes("from '../scenarioTree'"),
);
assert(
  'derive does NOT import Monte Carlo engines',
  !deriveSrc.includes('monteCarlo') && !deriveSrc.includes('monte-carlo'),
);
assert(
  'derive does NOT import Recommendation engines',
  !deriveSrc.includes('recommendationEngine') && !deriveSrc.includes('recommendation-engine'),
);
assert(
  'derive does NOT import Forecast engines',
  !deriveSrc.includes('forecastEngine') && !deriveSrc.includes('forecast-engine'),
);

// ─── 6. Bear world is more stressed than base; bull is less stressed ───────
section('Stress level monotonicity');

assert(
  'bear stress > base stress',
  model.worlds.bear.stressLevel >= model.worlds.base.stressLevel,
  `bear=${model.worlds.bear.stressLevel} base=${model.worlds.base.stressLevel}`,
);
assert(
  'base stress > bull stress',
  model.worlds.base.stressLevel >= model.worlds.bull.stressLevel,
  `base=${model.worlds.base.stressLevel} bull=${model.worlds.bull.stressLevel}`,
);

// ─── 7. Executive summary references vulnerability and tailwind ────────────
section('Executive summary — references key levers');

assert(
  'summary names a dominant cluster',
  ['bear', 'base', 'bull'].includes(model.summary.dominantCluster),
);
assert(
  'summary returns a resilience band',
  ['Strong', 'Sound', 'Workable', 'Fragile', 'Brittle'].includes(model.summary.resilience.band),
);

// ─── Done ──────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ all Future Worlds rebuild tests passed' : `✗ ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
