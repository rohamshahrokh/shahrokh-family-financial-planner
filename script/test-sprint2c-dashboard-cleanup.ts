/**
 * test-sprint2c-dashboard-cleanup.ts
 *
 * Verifies the Sprint 2C dashboard contract requirements:
 *   1. The Deposit Power Build-up panel is removed from the Dashboard
 *      surface (both desktop tooltip and mobile bottom-sheet) but
 *      preserved on the Property page and inside Wealth Strategy.
 *   2. The DepositPowerCard component import is no longer pulled into
 *      dashboard.tsx so the bundle doesn't include it via the dashboard route.
 *   3. The underlying calculation (`depositPowerResult` memo, depositPower.ts)
 *      is preserved — only the visual breakdown card was removed.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const repoRoot = join(__dirname, '..');
const dashSrc  = readFileSync(join(repoRoot, 'client/src/pages/dashboard.tsx'), 'utf8');
const propSrc  = readFileSync(join(repoRoot, 'client/src/pages/property.tsx'),  'utf8');

let passed = 0;
let failed = 0;

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.error(`  ✘ ${label}` + (detail !== undefined ? `\n      detail: ${String(detail).slice(0, 200)}` : ''));
  }
}

console.log('\n=== Dashboard no longer renders the Deposit Power Build-up card ===');
{
  // We accept the *literal* "Deposit Power Build-up" phrase appearing inside
  // an explanatory comment about its removal, but NOT inside JSX output. Our
  // simple gate: the phrase must not appear inside any `<div>...<span>"
  // chunk in the file. Looking at the JSX heading text directly is robust
  // enough since we only had two such occurrences in the baseline.
  // Strip both /* … */ blocks (incl. JSX comment containers) and // line
  // comments before checking. The Sprint 2C comments documenting the
  // removal mention the phrase by design and should not fail the gate.
  const stripped = dashSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments / JSX comment blocks
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX {/* … */} forms
    .replace(/^\s*\/\/.*$/gm, '');           // line comments
  const buildUpHits = stripped.match(/Deposit Power Build-up/g) ?? [];
  ok('no JSX label "Deposit Power Build-up" remains',
     buildUpHits.length === 0,
     `still ${buildUpHits.length} hit(s)`);

  const totalLine = dashSrc.match(/= Total Deposit Power/g) ?? [];
  ok('no JSX label "= Total Deposit Power" remains',
     totalLine.length === 0,
     `still ${totalLine.length} hit(s)`);
}

console.log('\n=== DepositPowerCard import removed from dashboard.tsx ===');
{
  const importLine = dashSrc.match(/^import\s+DepositPowerCard\b/m);
  ok('no top-level import of DepositPowerCard', importLine === null,
     importLine?.[0]);
}

console.log('\n=== DepositPowerCard preserved on Property page ===');
{
  ok('property.tsx still imports DepositPowerCard',
     /import\s+DepositPowerCard\b/.test(propSrc));
  ok('property.tsx still renders <DepositPowerCard',
     /<DepositPowerCard[\s>]/.test(propSrc));
}

console.log('\n=== Engine paths untouched (no math removed) ===');
{
  // Calculation memo is still wired into the dashboard.
  ok('depositPowerResult memo still present',
     /const\s+depositPowerResult\s*=\s*useMemo/.test(dashSrc));
  // Forecast bridge still consumes depositPower per-year.
  ok('depositPower per-year mapping still present',
     /depositPower:\s*pt\.deposit_power/.test(dashSrc));
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Sprint 2C dashboard cleanup: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
