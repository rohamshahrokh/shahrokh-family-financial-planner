/**
 * run-sprint2c-tests.ts
 *
 * Orchestrator for the Sprint 2C regression suite. Executes each focused
 * test script in turn, captures pass/fail, and exits non-zero on any
 * failure. Mirrors the Sprint 2A / Sprint 2B runners.
 */

import { spawnSync } from 'child_process';

interface Step {
  name: string;
  cmd: string;
  args: string[];
}

const STEPS: Step[] = [
  { name: 'Property lifecycle audit (Sprint 2B compatibility)',
    cmd: 'npx', args: ['tsx', 'script/test-property-lifecycle-audit.ts'] },
  { name: 'Sprint 2C property lifecycle (transitions + selectors)',
    cmd: 'npx', args: ['tsx', 'script/test-sprint2c-property-lifecycle.ts'] },
  { name: 'Sprint 2C property timeline (30y journey)',
    cmd: 'npx', args: ['tsx', 'script/test-sprint2c-property-timeline.ts'] },
  { name: 'Sprint 2C dashboard cleanup',
    cmd: 'npx', args: ['tsx', 'script/test-sprint2c-dashboard-cleanup.ts'] },
  { name: 'Sprint 2C decision UX (Recommended Actions adapter)',
    cmd: 'npx', args: ['tsx', 'script/test-sprint2c-decision-ux.ts'] },
  { name: 'Dashboard data contract (regression)',
    cmd: 'npx', args: ['tsx', 'script/test-dashboard-contract.ts'] },
];

let any_failed = false;

for (const step of STEPS) {
  console.log(`\n▶  ${step.name}`);
  console.log(`   ${step.cmd} ${step.args.join(' ')}`);
  const res = spawnSync(step.cmd, step.args, { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`   ✘ failed (exit ${res.status})`);
    any_failed = true;
  } else {
    console.log(`   ✔ passed`);
  }
}

console.log(`\n══════════════════════════════════════════════`);
console.log(`Sprint 2C suite: ${any_failed ? 'FAILED ❌' : 'PASSED ✅'}`);
console.log(`══════════════════════════════════════════════\n`);
process.exit(any_failed ? 1 : 0);
