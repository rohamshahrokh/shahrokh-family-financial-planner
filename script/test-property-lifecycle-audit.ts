/**
 * test-property-lifecycle-audit.ts
 *
 * Focused regression suite for PropertyLifecycleAudit. Exercises the pure
 * `buildAuditRow` / `normaliseStatus` / `friendlyLabel` helpers — they
 * encode the audit's full behaviour (inclusion expectations + mismatch
 * detection), so testing them is sufficient without spinning up React.
 *
 * Run with:  tsx script/test-property-lifecycle-audit.ts
 */

import {
  buildAuditRow,
  normaliseStatus,
  friendlyLabel,
} from '../client/src/components/PropertyLifecycleAudit';

let passed = 0;
let failed = 0;

function eq<T>(label: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.error(`  ✘ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
  }
}

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.error(`  ✘ ${label}` + (detail !== undefined ? `\n      detail: ${JSON.stringify(detail)}` : ''));
  }
}

const TODAY = '2026-05-24';

console.log('\n=== #1: Planned → assets/liabilities/rent all No ===');
{
  const r = buildAuditRow(
    { id: 1, name: 'Future IP', lifecycle_status: 'planned', settlement_date: '2027-08-01' },
    TODAY,
  );
  eq('status', r.status, 'planned');
  eq('assets', r.assets, false);
  eq('liabilities', r.liabilities, false);
  eq('rent', r.rent, false);
  ok('no warning when settlement_date is in the future', !r.warning, r.warning);
  ok('reason mentions planned exclusion', /planned/i.test(r.reason), r.reason);
}

console.log('\n=== #2: Under Contract → assets/liabilities/rent all No ===');
{
  const r = buildAuditRow(
    { id: 2, name: 'Brisbane Contract', lifecycle_status: 'under_contract', settlement_date: '2026-11-30' },
    TODAY,
  );
  eq('status', r.status, 'under_contract');
  eq('assets', r.assets, false);
  eq('liabilities', r.liabilities, false);
  eq('rent', r.rent, false);
  ok('no warning when settlement_date is in the future', !r.warning, r.warning);
}

console.log('\n=== #3: Settled → assets/liabilities/rent all Yes ===');
{
  const r = buildAuditRow(
    { id: 3, name: 'Gold Coast IP', lifecycle_status: 'settled', settlement_date: '2024-03-10' },
    TODAY,
  );
  eq('status', r.status, 'settled');
  eq('assets', r.assets, true);
  eq('liabilities', r.liabilities, true);
  eq('rent', r.rent, true);
  ok('no warning for past-settled', !r.warning, r.warning);
}

console.log('\n=== #4: Mismatch — Planned but settlement_date is in the past ===');
{
  const r = buildAuditRow(
    { id: 4, name: 'Stale Plan', lifecycle_status: 'planned', settlement_date: '2024-01-15' },
    TODAY,
  );
  // Inclusion columns reflect declared status, not engine reality.
  eq('assets stays No (declared status wins for column)', r.assets, false);
  ok('warning emitted', !!r.warning, r.warning);
  ok('warning mentions engine inclusion', /engine/i.test(r.warning ?? ''), r.warning);
}

console.log('\n=== #5: Mismatch — Settled but settlement_date is in the future ===');
{
  const r = buildAuditRow(
    { id: 5, name: 'Pre-Settled', lifecycle_status: 'settled', settlement_date: '2027-04-01' },
    TODAY,
  );
  eq('assets stays Yes (declared status wins for column)', r.assets, true);
  ok('warning emitted', !!r.warning, r.warning);
  ok('warning mentions future settlement', /future|backdate/i.test(r.warning ?? ''), r.warning);
}

console.log('\n=== #6: Mismatch — Planned with no settlement_date at all ===');
{
  // Engines default a row with no settlement_date to "already-settled" so
  // forecasts don't silently drop legacy rows. A 'planned' row in that
  // shape is therefore a silent mismatch.
  const r = buildAuditRow(
    { id: 6, name: 'No Date Plan', lifecycle_status: 'planned' },
    TODAY,
  );
  eq('declared status preserved', r.status, 'planned');
  eq('assets stays No', r.assets, false);
  ok('warning emitted for missing settlement_date', !!r.warning, r.warning);
  ok('warning mentions missing date', /settlement_date/i.test(r.warning ?? ''), r.warning);
}

console.log('\n=== #7: Legacy row (no lifecycle_status) treated as settled ===');
{
  const r = buildAuditRow({ id: 7, name: 'Legacy IP' }, TODAY);
  eq('normalises to settled', r.status, 'settled');
  eq('assets', r.assets, true);
  eq('liabilities', r.liabilities, true);
  eq('rent', r.rent, true);
}

console.log('\n=== #8: Friendly label uses name, not id ===');
{
  const r = buildAuditRow({ id: 99, name: 'Hobart IP', lifecycle_status: 'settled' }, TODAY);
  eq('name is the label', r.name, 'Hobart IP');
  ok('label is not the id', r.name !== '99' && r.name !== 99 as any, r.name);
}

console.log('\n=== #9: friendlyLabel falls back without bleeding id ===');
{
  eq('ppor fallback', friendlyLabel({ type: 'ppor' }), 'Primary Residence');
  eq('land fallback', friendlyLabel({ type: 'land' }), 'Vacant Land');
  eq('investment fallback', friendlyLabel({ type: 'investment' }), 'Investment Property');
  eq('blank name → fallback (no id leak)', friendlyLabel({ id: 42, name: '   ' }), 'Investment Property');
}

console.log('\n=== #10: normaliseStatus rejects garbage ===');
{
  eq('empty', normaliseStatus(''), 'settled');
  eq('null', normaliseStatus(null), 'settled');
  eq('garbage', normaliseStatus('foo'), 'settled');
  eq('planned', normaliseStatus('planned'), 'planned');
  eq('under_contract', normaliseStatus('under_contract'), 'under_contract');
  eq('settled', normaliseStatus('settled'), 'settled');
  eq('case-insensitive', normaliseStatus('SETTLED'), 'settled');
}

console.log('\n=== #11: Settlement on exactly today is treated as active ===');
{
  // Mirrors selectSettledIPs: settlement_date <= today counts as settled.
  const r = buildAuditRow(
    { id: 11, name: 'Settled Today', lifecycle_status: 'settled', settlement_date: TODAY },
    TODAY,
  );
  ok('no warning when settling exactly today', !r.warning, r.warning);
}

console.log('\n=== #12: ID is preserved for provenance text ===');
{
  const r = buildAuditRow({ id: 'abc-123', name: 'Cloud IP', lifecycle_status: 'settled' }, TODAY);
  eq('id preserved', r.id, 'abc-123');
  // But name remains the friendly label
  eq('name is friendly', r.name, 'Cloud IP');
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Property lifecycle audit: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
