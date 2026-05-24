/**
 * test-sprint2c-property-lifecycle.ts
 *
 * Sprint 2C regression suite for the extended Property Lifecycle model.
 * Covers the full inclusion matrix per status:
 *
 *   PLANNED        → forecast only
 *   UNDER_CONTRACT → forecast only
 *   SETTLED        → net worth + debt + income + expenses + forecast
 *   SOLD           → nothing (historical only)
 *   ARCHIVED       → nothing (historical only)
 *
 * Also verifies status transitions immediately update the engine selectors
 * exposed by dashboardDataContract.ts (selectSettledIPs, selectPlannedIPs)
 * so that current debt / income / expenses / net worth flip the moment the
 * user updates lifecycle_status.
 *
 * Run with:  tsx script/test-sprint2c-property-lifecycle.ts
 */

import {
  buildAuditRow,
  normaliseStatus,
  type LifecycleStatus,
} from '../client/src/components/PropertyLifecycleAudit';

import {
  selectSettledIPs,
  selectPlannedIPs,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectIpCurrentValuePlanned,
  selectIpLoanBalancePlanned,
  selectSettledIpDebtService,
  type DashboardInputs,
} from '../client/src/lib/dashboardDataContract';

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

/* ---------------------------------------------------------------------------
 * Inclusion matrix per status — every lifecycle state covered.
 * ------------------------------------------------------------------------- */

console.log('\n=== Inclusion matrix — PLANNED ===');
{
  const r = buildAuditRow(
    { id: 'plan-1', name: 'Future IP', lifecycle_status: 'planned', settlement_date: '2027-08-01' },
    TODAY,
  );
  eq('status', r.status, 'planned');
  eq('netWorth', r.netWorth, false);
  eq('debt', r.debt, false);
  eq('income', r.income, false);
  eq('expenses', r.expenses, false);
  eq('forecast', r.forecast, true);
}

console.log('\n=== Inclusion matrix — UNDER_CONTRACT ===');
{
  const r = buildAuditRow(
    { id: 'uc-1', name: 'Brisbane Contract', lifecycle_status: 'under_contract', settlement_date: '2026-11-30' },
    TODAY,
  );
  eq('status', r.status, 'under_contract');
  eq('netWorth', r.netWorth, false);
  eq('debt', r.debt, false);
  eq('income', r.income, false);
  eq('expenses', r.expenses, false);
  eq('forecast', r.forecast, true);
}

console.log('\n=== Inclusion matrix — SETTLED ===');
{
  const r = buildAuditRow(
    { id: 'set-1', name: 'Gold Coast IP', lifecycle_status: 'settled', settlement_date: '2024-03-10' },
    TODAY,
  );
  eq('status', r.status, 'settled');
  eq('netWorth', r.netWorth, true);
  eq('debt', r.debt, true);
  eq('income', r.income, true);
  eq('expenses', r.expenses, true);
  eq('forecast', r.forecast, true);
}

console.log('\n=== Inclusion matrix — SOLD ===');
{
  const r = buildAuditRow(
    { id: 'sold-1', name: 'Disposed IP', lifecycle_status: 'sold' },
    TODAY,
  );
  eq('status', r.status, 'sold');
  eq('netWorth', r.netWorth, false);
  eq('debt', r.debt, false);
  eq('income', r.income, false);
  eq('expenses', r.expenses, false);
  eq('forecast', r.forecast, false);
  ok('reason mentions historical', /historical/i.test(r.reason), r.reason);
}

console.log('\n=== Inclusion matrix — ARCHIVED ===');
{
  const r = buildAuditRow(
    { id: 'arch-1', name: 'Old IP', lifecycle_status: 'archived' },
    TODAY,
  );
  eq('status', r.status, 'archived');
  eq('netWorth', r.netWorth, false);
  eq('debt', r.debt, false);
  eq('income', r.income, false);
  eq('expenses', r.expenses, false);
  eq('forecast', r.forecast, false);
  ok('reason mentions hidden/historical', /historical|hidden/i.test(r.reason), r.reason);
}

console.log('\n=== normaliseStatus handles new sold/archived values ===');
{
  eq('sold', normaliseStatus('sold'), 'sold');
  eq('archived', normaliseStatus('archived'), 'archived');
  eq('SOLD case-insensitive', normaliseStatus('SOLD'), 'sold');
  eq('ARCHIVED case-insensitive', normaliseStatus('ARCHIVED'), 'archived');
}

/* ---------------------------------------------------------------------------
 * Engine-selector behaviour: Planned property must not leak into current
 * net worth / debt / income / expenses headlines. The dashboard data
 * contract is the canonical surface used by every dashboard / debt / income
 * card, so verifying the selectors covers the dashboard contract too.
 * ------------------------------------------------------------------------- */

const baseSnapshot: any = {
  ppor: 0, cash: 0, super: 0, cars: 0, iran_property: 0,
  mortgage: 0, other_debts: 0,
  monthly_income: 22000, monthly_expenses: 14540,
};

const plannedIP: any = {
  id: 'planned-ip',
  type: 'investment',
  name: 'Planned IP',
  lifecycle_status: 'planned',
  settlement_date: '2027-08-01',
  current_value: 750_000,
  purchase_price: 750_000,
  loan_amount: 600_000,
  interest_rate: 6.5,
  loan_type: 'IO',
  loan_term: 30,
  weekly_rent: 650,
};

const settledIP: any = {
  ...plannedIP,
  id: 'settled-ip',
  name: 'Settled IP',
  lifecycle_status: 'settled',
  settlement_date: '2024-03-10',
};

console.log('\n=== Dashboard contract — Planned property excluded ===');
{
  const inputs: DashboardInputs = {
    snapshot: baseSnapshot,
    properties: [plannedIP],
    stocks: [],
    cryptos: [],
    todayIso: TODAY,
  } as DashboardInputs;

  eq('current settled IPs is empty', selectSettledIPs(inputs).length, 0);
  eq('planned IP listed in planned selector', selectPlannedIPs(inputs).length, 1);
  eq('current IP value (settled) is 0', selectIpCurrentValueSettled(inputs), 0);
  eq('current IP debt (settled) is 0', selectIpLoanBalanceSettled(inputs), 0);
  eq('planned IP value tracked separately', selectIpCurrentValuePlanned(inputs), 750_000);
  eq('planned IP loan tracked separately', selectIpLoanBalancePlanned(inputs), 600_000);
  eq('settled IP debt service is 0', selectSettledIpDebtService(inputs), 0);
}

console.log('\n=== Dashboard contract — Settled property included ===');
{
  const inputs: DashboardInputs = {
    snapshot: baseSnapshot,
    properties: [settledIP],
    stocks: [],
    cryptos: [],
    todayIso: TODAY,
  } as DashboardInputs;

  eq('settled IPs has the property', selectSettledIPs(inputs).length, 1);
  eq('current IP value (settled) is 750k', selectIpCurrentValueSettled(inputs), 750_000);
  eq('current IP debt (settled) is 600k', selectIpLoanBalanceSettled(inputs), 600_000);
  ok('settled IP debt service is positive', selectSettledIpDebtService(inputs) > 0,
     selectSettledIpDebtService(inputs));
}

console.log('\n=== Transition Planned → Settled flips all current selectors ===');
{
  const before: DashboardInputs = {
    snapshot: baseSnapshot,
    properties: [{ ...plannedIP }],
    stocks: [],
    cryptos: [],
    todayIso: TODAY,
  } as DashboardInputs;

  eq('before — settled IP value', selectIpCurrentValueSettled(before), 0);
  eq('before — settled IP debt', selectIpLoanBalanceSettled(before), 0);

  // Simulate the status change.
  const after: DashboardInputs = {
    ...before,
    properties: [{ ...plannedIP, lifecycle_status: 'settled', settlement_date: '2024-03-10' }],
  } as DashboardInputs;

  eq('after — settled IP value flips to 750k', selectIpCurrentValueSettled(after), 750_000);
  eq('after — settled IP debt flips to 600k', selectIpLoanBalanceSettled(after), 600_000);
  ok('after — debt service becomes positive', selectSettledIpDebtService(after) > 0,
     selectSettledIpDebtService(after));

  // Audit row matches as well.
  const auditBefore = buildAuditRow(before.properties![0], TODAY);
  const auditAfter  = buildAuditRow(after.properties![0],  TODAY);
  eq('audit row pre-transition: netWorth = no',  auditBefore.netWorth, false);
  eq('audit row post-transition: netWorth = yes', auditAfter.netWorth,  true);
  eq('audit row pre-transition: debt = no',       auditBefore.debt,    false);
  eq('audit row post-transition: debt = yes',     auditAfter.debt,     true);
  eq('audit row pre-transition: expenses = no',   auditBefore.expenses,false);
  eq('audit row post-transition: expenses = yes', auditAfter.expenses, true);
}

console.log('\n=== Transition Settled → Sold removes from current calculations ===');
{
  const before: DashboardInputs = {
    snapshot: baseSnapshot,
    properties: [{ ...settledIP }],
    stocks: [],
    cryptos: [],
    todayIso: TODAY,
  } as DashboardInputs;

  // selectSettledIPs only filters on isSettled; sold isn't 'settled' so it
  // drops out of the selector.
  const after: DashboardInputs = {
    ...before,
    properties: [{ ...settledIP, lifecycle_status: 'sold' }],
  } as DashboardInputs;

  ok('before — settled selector returns property',
     selectSettledIPs(before).length === 1);
  eq('after — settled selector excludes sold', selectSettledIPs(after).length, 0);
  eq('after — current IP value is 0',         selectIpCurrentValueSettled(after), 0);
  eq('after — current IP debt is 0',           selectIpLoanBalanceSettled(after), 0);

  const auditAfter = buildAuditRow(after.properties![0], TODAY);
  eq('sold audit row: netWorth = no',  auditAfter.netWorth, false);
  eq('sold audit row: forecast = no',  auditAfter.forecast, false);
}

console.log('\n=== Transition Settled → Archived removes from current + forecast ===');
{
  const after: DashboardInputs = {
    snapshot: baseSnapshot,
    properties: [{ ...settledIP, lifecycle_status: 'archived' }],
    stocks: [],
    cryptos: [],
    todayIso: TODAY,
  } as DashboardInputs;

  eq('settled selector excludes archived', selectSettledIPs(after).length, 0);
  eq('current IP value is 0',              selectIpCurrentValueSettled(after), 0);
  const auditAfter = buildAuditRow(after.properties![0], TODAY);
  eq('archived audit row: netWorth = no', auditAfter.netWorth, false);
  eq('archived audit row: debt = no',     auditAfter.debt,     false);
  eq('archived audit row: forecast = no', auditAfter.forecast, false);
}

console.log('\n=== Transition Planned → Under Contract keeps current excluded ===');
{
  const before = buildAuditRow({ id: 1, lifecycle_status: 'planned' }, TODAY);
  const after  = buildAuditRow({ id: 1, lifecycle_status: 'under_contract' }, TODAY);

  eq('planned: netWorth = no',        before.netWorth, false);
  eq('under_contract: netWorth = no', after.netWorth,  false);
  eq('planned: forecast = yes',        before.forecast, true);
  eq('under_contract: forecast = yes', after.forecast,  true);
}

console.log('\n=== Transition Sold → Archived (both historical, no flip) ===');
{
  const before = buildAuditRow({ id: 1, lifecycle_status: 'sold' }, TODAY);
  const after  = buildAuditRow({ id: 1, lifecycle_status: 'archived' }, TODAY);

  eq('sold: forecast = no',     before.forecast, false);
  eq('archived: forecast = no', after.forecast,  false);
  eq('sold: netWorth = no',     before.netWorth, false);
  eq('archived: netWorth = no', after.netWorth,  false);
}

/* ---------------------------------------------------------------------------
 * Mixed-portfolio sanity: planned + settled + sold + archived together.
 * Only the settled row should feed current calculations; the planned row
 * appears in the planned selector; sold and archived contribute to neither.
 * ------------------------------------------------------------------------- */
console.log('\n=== Mixed portfolio sanity ===');
{
  const inputs: DashboardInputs = {
    snapshot: baseSnapshot,
    properties: [
      { ...plannedIP, id: 'p1' },
      { ...settledIP, id: 'p2' },
      { ...settledIP, id: 'p3', lifecycle_status: 'sold' },
      { ...settledIP, id: 'p4', lifecycle_status: 'archived' },
    ],
    stocks: [],
    cryptos: [],
    todayIso: TODAY,
  } as DashboardInputs;

  eq('settled selector returns only the settled row', selectSettledIPs(inputs).length, 1);
  eq('planned selector returns only the planned row', selectPlannedIPs(inputs).length, 1);
  eq('current settled IP value', selectIpCurrentValueSettled(inputs), 750_000);
  eq('current settled IP debt',  selectIpLoanBalanceSettled(inputs), 600_000);
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Sprint 2C lifecycle: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
