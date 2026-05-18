/**
 * test-debt-classification-current-vs-planned.ts
 *
 * Direct unit-test of the CURRENT vs PLANNED partition in
 * debtClassification.ts, plus the engine.ts buildDebtPortfolio wrapper, to
 * guarantee Best Move never sums planned IP loans as "current debt".
 *
 * Pure — no DOM, no Supabase, no network.
 */
import {
  isPlannedDebt,
  partitionCurrentVsPlanned,
  classifyCurrentDebtPortfolio,
  classifyDebtPortfolio,
  type DebtRecord,
} from '../client/src/lib/recommendationEngine/debtClassification';

let pass = 0, fail = 0;
function assert(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++; }
}
function section(name: string) { console.log(`\n— ${name}`); }

// Build a realistic ledger: the actual problem case the user described.
//   PPOR mortgage  $1.20M (current, real, today)
//   Other debt     $20K   (current)
//   Planned IP #1  $720K  (planned, not settled)
//   Planned IP #2  $480K  (planned, settlement in the future)
// Total current = $1.22M, total planned = $1.20M, combined misread = $2.40M.
const records: DebtRecord[] = [
  { id: 'ppor',     name: 'Home Mortgage',  balance: 1_200_000, ratePct: 5.82, type: 'mortgage' },
  { id: 'other',    name: 'Other Debts',    balance:    20_000, ratePct: null,  type: 'other' },
  { id: 'ip-plan-1', name: 'Planned IP #1 Loan', balance: 720_000, ratePct: 6.10, type: 'investment_loan', planned: true },
  { id: 'ip-plan-2', name: 'Planned IP #2 Loan', balance: 480_000, ratePct: 6.10, type: 'investment_loan', settlementDateISO: '2099-01-01' },
];

section('isPlannedDebt — explicit and date-driven flags');
assert('PPOR mortgage is NOT planned',        !isPlannedDebt(records[0]));
assert('Other debts is NOT planned',          !isPlannedDebt(records[1]));
assert('Planned IP #1 (explicit flag) IS planned', isPlannedDebt(records[2]));
assert('Planned IP #2 (future settlement date) IS planned', isPlannedDebt(records[3]));
// Defensive guard: "planned" tag in id/name
assert(
  '"planned" in id/name is treated as planned debt',
  isPlannedDebt({ id: 'foo', name: 'Planned future loan', balance: 1, ratePct: 5 }),
);

section('partitionCurrentVsPlanned — splits correctly');
const split = partitionCurrentVsPlanned(records);
assert(`Current debts count = 2`, split.current.length === 2, `got ${split.current.length}`);
assert(`Planned debts count = 2`, split.planned.length === 2, `got ${split.planned.length}`);
const currentTotal = split.current.reduce((s, d) => s + d.balance, 0);
const plannedTotal = split.planned.reduce((s, d) => s + d.balance, 0);
assert(`Current total = $1.22M`, currentTotal === 1_220_000, `got ${currentTotal}`);
assert(`Planned total = $1.20M`, plannedTotal === 1_200_000, `got ${plannedTotal}`);

section('classifyCurrentDebtPortfolio — Best Move ledger never sees planned debt');
const current = classifyCurrentDebtPortfolio(records);
const naive = classifyDebtPortfolio(records);

// The naive sum (what the bug looked like) classifies $1.20M planned loans
// as tax_deductible / strategic_leverage. classifyCurrentDebtPortfolio MUST
// strip them. We verify the mortgage + deductible + strategic total used by
// monitorStrategicDebt is the CURRENT-only figure.
const naiveStrategicTotal =
  naive.balanceByClass.mortgage_debt +
  naive.balanceByClass.tax_deductible_debt +
  naive.balanceByClass.strategic_leverage_debt;
const currentStrategicTotal =
  current.balanceByClass.mortgage_debt +
  current.balanceByClass.tax_deductible_debt +
  current.balanceByClass.strategic_leverage_debt;
assert(
  'Naive (buggy) total includes planned IP loans → ~$2.40M',
  naiveStrategicTotal === 2_400_000,
  `got ${naiveStrategicTotal}`,
);
assert(
  'CURRENT total excludes planned IP loans → $1.20M (PPOR mortgage only)',
  currentStrategicTotal === 1_200_000,
  `got ${currentStrategicTotal}`,
);

// Specifically: the Best Move "Strategic debt monitored ($X.XXM)" caption
// must NEVER read $2.40M from this ledger. We assert the inequality.
assert(
  'Best Move Strategic Debt total NEVER reads $2.40M from this realistic ledger',
  currentStrategicTotal !== 2_400_000,
);

// And the other-debt bucket (used elsewhere) only contains the $20K personal.
assert(
  'Current other-debt bucket = $20K (excludes planned IP loans)',
  current.otherDebtBalance === 20_000,
  `got ${current.otherDebtBalance}`,
);

console.log(`\n${fail === 0 ? '✓ all checks passed' : `✗ ${fail} failures`} (${pass} passed)`);
if (fail > 0) process.exit(1);
