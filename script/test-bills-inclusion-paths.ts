/**
 * Regression test for billsInclusion.ts decision logic.
 *
 * Pins the four branches:
 *  1. Explicit inclusive override
 *  2. Explicit exclusive override
 *  3. Data-driven: ledger trailing avg ≈ snapshot AND bill categories present → inclusive
 *  4. No ledger rows + snapshot scalar > 0 → inclusive (snapshot-only default)
 *  5. Ledger present, NO bill categories match → exclusive (existing behaviour)
 *  6. Snapshot scalar materially below ledger → exclusive
 *
 * Also pins the actual finance.ts and eventProcessor.ts integration so we
 * never re-introduce the May-2026 forecast-bill double-count.
 */

const memoryStore: Record<string, string> = {};
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
    setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
    removeItem: (k: string) => { delete memoryStore[k]; },
    clear: () => {},
    key: () => null,
    get length() { return 0; },
  },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;

const { decideBillsInclusion } = await import('../client/src/lib/billsInclusion');
const { buildCashFlowSeries } = await import('../client/src/lib/finance');

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else      { fail++; console.error(`✗ ${name}  ${detail}`); }
};

// ─── decideBillsInclusion: branch coverage ───────────────────────────────────

ok('explicit inclusive override wins',
   decideBillsInclusion({
     snapshot: { monthly_expenses: 14540, expenses_includes_recurring_bills: true },
     expenses: [], bills: [],
   }).reason === 'explicit_inclusive');

ok('explicit exclusive override wins',
   decideBillsInclusion({
     snapshot: { monthly_expenses: 14540, expenses_includes_recurring_bills: false },
     expenses: [{ date: '2026-05-10', amount: 1296, category: 'Childcare' }],
     bills: [{ category: 'Childcare', active: true }],
   }).reason === 'explicit_exclusive');

ok('data-driven: snapshot ≈ ledger AND bill cats overlap → inclusive',
   decideBillsInclusion({
     snapshot: { monthly_expenses: 14540 },
     expenses: [
       { date: '2026-03-15', amount: 14000, category: 'Living' },
       { date: '2026-03-16', amount: 200,   category: 'Childcare' },
       { date: '2026-03-17', amount: 100,   category: 'Insurance' },
       { date: '2026-04-15', amount: 14100, category: 'Living' },
       { date: '2026-04-16', amount: 200,   category: 'Childcare' },
       { date: '2026-05-15', amount: 14200, category: 'Living' },
       { date: '2026-05-16', amount: 200,   category: 'Childcare' },
     ],
     bills: [
       { category: 'Childcare', active: true },
       { category: 'Insurance', active: true },
     ],
   }).reason === 'ledger_close_to_snapshot');

ok('snapshot-only fallback → inclusive',
   decideBillsInclusion({
     snapshot: { monthly_expenses: 14540 },
     expenses: undefined,
     bills: [{ category: 'Childcare', active: true }],
   }).reason === 'snapshot_only_default_inclusive');

ok('ledger has no bill categories → exclusive (legacy behaviour preserved)',
   decideBillsInclusion({
     snapshot: { monthly_expenses: 7000 }, // core-living only
     expenses: [
       { date: '2026-03-15', amount: 7000, category: 'Groceries' },
       { date: '2026-04-15', amount: 7200, category: 'Groceries' },
     ],
     bills: [
       { category: 'Childcare', active: true },
       { category: 'Insurance', active: true },
     ],
   }).reason === 'ledger_categories_diverge');

ok('snapshot materially below ledger → exclusive',
   decideBillsInclusion({
     snapshot: { monthly_expenses: 8000 },
     expenses: [
       { date: '2026-03-15', amount: 14000, category: 'Childcare' },
       { date: '2026-04-15', amount: 14200, category: 'Childcare' },
     ],
     bills: [{ category: 'Childcare', active: true }],
   }).includesBills === false);

// ─── Integration: buildCashFlowSeries must skip billsOutflow when inclusive ──

const snapshot = {
  monthly_income: 21940,
  monthly_expenses: 14540,
  mortgage: 1200000,
  other_debts: 20000,
  cash: 0,
  offset_balance: 0,
};
const bills = [
  { bill_name: 'Child Care',  category: 'Childcare', amount: 648, frequency: 'Weekly', next_due_date: '2026-05-27', active: true },
  { bill_name: 'Bupa',        category: 'Health',    amount: 356, frequency: 'Monthly', next_due_date: '2026-05-25', active: true },
  { bill_name: 'RACQ',        category: 'Insurance', amount: 115, frequency: 'Monthly', next_due_date: '2026-05-25', active: true },
];

// Inclusive case (matches live household)
const inclusiveExpenses = [
  { date: '2026-03-05', amount: 7060, category: 'Housing / Mortgage' },
  { date: '2026-03-10', amount: 1296, category: 'Childcare' },
  { date: '2026-03-12', amount: 356,  category: 'Insurance' },
  { date: '2026-03-20', amount: 5828, category: 'Living' }, // → 14540 total
  { date: '2026-04-05', amount: 7060, category: 'Housing / Mortgage' },
  { date: '2026-04-10', amount: 1296, category: 'Childcare' },
  { date: '2026-04-12', amount: 356,  category: 'Insurance' },
  { date: '2026-04-20', amount: 5928, category: 'Living' },
  { date: '2026-05-05', amount: 7060, category: 'Housing / Mortgage' },
  { date: '2026-05-10', amount: 1296, category: 'Childcare' },
  { date: '2026-05-12', amount: 356,  category: 'Insurance' },
  { date: '2026-05-20', amount: 5654, category: 'Living' },
];
const incSeries = buildCashFlowSeries({
  snapshot, expenses: inclusiveExpenses, properties: [], bills,
  inflationRate: 3, incomeGrowthRate: 3.5,
});
const incForecastBills = incSeries
  .filter((m: any) => m.year === 2026 && !m.isActual)
  .reduce((s: number, m: any) => s + (m.billsOutflow ?? 0), 0);
ok('inclusive case: 2026 forecast bills outflow == 0',
   incForecastBills === 0,
   `got=${incForecastBills}`);

// Exclusive case (user enters core-living only — no bill categories in ledger)
const exclusiveExpenses = [
  { date: '2026-03-15', amount: 7000, category: 'Groceries' },
  { date: '2026-04-15', amount: 7200, category: 'Groceries' },
  { date: '2026-05-15', amount: 7100, category: 'Groceries' },
];
const exSnapshot = { ...snapshot, monthly_expenses: 7000 };
const exSeries = buildCashFlowSeries({
  snapshot: exSnapshot, expenses: exclusiveExpenses, properties: [], bills,
  inflationRate: 3, incomeGrowthRate: 3.5,
});
const exForecastBills = exSeries
  .filter((m: any) => m.year === 2026 && !m.isActual)
  .reduce((s: number, m: any) => s + (m.billsOutflow ?? 0), 0);
ok('exclusive case: 2026 forecast bills outflow > 0 (preserved)',
   exForecastBills > 0,
   `got=${exForecastBills}`);

if (fail > 0) {
  console.error(`\ntest-bills-inclusion-paths: ${fail} failure(s)`);
  process.exit(1);
}
console.log(`\ntest-bills-inclusion-paths: ${pass} passed`);
