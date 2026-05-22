/**
 * test-cashflow-chart-funding-source.ts
 *
 * Regression test for #FWL_Remaining_Bug_CashflowChart_Ignores_FundingSource.
 *
 * Exact scenario from the bug report:
 *   • IP1 purchased 2026
 *   • IP2 purchased 2028 — funding source = Equity Release
 *
 * The Property page already showed IP2's deposit was NOT funded from cash, but
 * the Plan Execution Capacity / Cashflow chart still rendered a massive cash
 * collapse in 2028 because `buildCashFlowSeries` consumed raw property records
 * and subtracted `prop.deposit` directly from cash.
 *
 * Required invariants for this fix:
 *   1. `buildCashFlowSeries` routes its input through `applyFundingToProperties`
 *      (idempotent — if caller already applied funding, pass-through).
 *   2. For the 2028 IP2 settlement month, `propertyDeposit` (cash-like) = $0.
 *   3. `propertyPurchaseCashUsed` (cash + offset) = $0 for the equity-release IP.
 *   4. `propertyEquityReleased` equals the original IP2 deposit amount.
 *   5. The annual roll-up surfaces the same decomposition under year 2028.
 *   6. The audit trace `cashflow:plan-execution:cash-balance:2028` exists and
 *      reports cash-used = $0, equity-released > 0.
 *   7. `buildCashFlowSeries` is idempotent: calling it on already-funded
 *      properties returns the same numbers as calling it on raw properties.
 *   8. The 2028 cash balance does NOT collapse — only acquisition costs (stamp
 *      duty, legal fees) actually draw cash.
 *
 * Run with:  tsx script/test-cashflow-chart-funding-source.ts
 */

// ─── Shim localStorage BEFORE importing modules that read it on load ─────────
const memoryStore: Record<string, string> = {};
const localStorageShim = {
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
  removeItem: (k: string) => { delete memoryStore[k]; },
  clear: () => { for (const k of Object.keys(memoryStore)) delete memoryStore[k]; },
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  get length() { return Object.keys(memoryStore).length; },
};
(globalThis as any).window = { localStorage: localStorageShim };
(globalThis as any).localStorage = localStorageShim;

const {
  usePropertyFundingStore,
  getPropertyFundingChoice,
} = await import('../client/src/lib/propertyFundingStore');
const {
  applyFundingToProperties,
  buildAdapterContext,
  FUNDING_PLAN_FIELD,
} = await import('../client/src/lib/propertyFundingAdapter');
const {
  buildCashFlowSeries,
  aggregateCashFlowToAnnual,
} = await import('../client/src/lib/finance');
const {
  buildCashflowYearTrace,
  cashflowYearTraceId,
} = await import('../client/src/lib/auditMode/engineTraces/cashflowChartTraces');

let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n— ${n}`);

// ─── Test data ──────────────────────────────────────────────────────────────

const SNAPSHOT = {
  cash:             220_000,
  offset_balance:   0,
  monthly_income:   22_000,
  monthly_expenses: 14_540,
  mortgage:         1_200_000,
  other_debts:      19_000,
};

const IP1: any = {
  id: 1,
  name: 'IP1 — Brisbane',
  type: 'investment',
  property_type: 'ESTABLISHED',
  purchase_date:   '2026-03-01',
  settlement_date: '2026-03-01',
  rental_start_date: '2026-04-01',
  purchase_price:  750_000,
  current_value:   750_000,
  deposit:         150_000,
  stamp_duty:      26_250,
  legal_fees:      2_000,
  loan_amount:     600_000,
  loan_term:       30,
  interest_rate:   6.5,
  loan_type:       'PI',
  weekly_rent:     580,
  rental_growth:   3,
  vacancy_rate:    4,
  management_fee:  7,
  capital_growth:  5,
  council_rates:   2_400,
  insurance:       1_500,
  maintenance:     2_000,
  projection_years: 10,
};

const IP2: any = {
  ...IP1,
  id: 2,
  name: 'IP2 — Gold Coast',
  purchase_date:   '2028-06-01',
  settlement_date: '2028-06-01',
  rental_start_date: '2028-07-01',
  purchase_price:  820_000,
  current_value:   820_000,
  deposit:         164_000,
  stamp_duty:      29_750,
  loan_amount:     656_000,
  weekly_rent:     620,
};

const PROPERTIES = [IP1, IP2];

// ─── Persist IP2 funding choice = equity-release ────────────────────────────

section('Setup: persist IP2 funding choice = equity-release');
const store = usePropertyFundingStore.getState();
store.setChoice(2, { source: 'equity-release' });
const reread = getPropertyFundingChoice(2);
assert('IP2 funding choice readback', reread?.source === 'equity-release');

// ─── 1. buildCashFlowSeries on RAW properties applies funding internally ────

section('1. buildCashFlowSeries applies funding source internally');
const series = buildCashFlowSeries({
  snapshot: SNAPSHOT,
  expenses: [],
  properties: PROPERTIES,
  bills: [],
  inflationRate: 3,
  incomeGrowthRate: 3.5,
});
assert('Series produced months', Array.isArray(series) && series.length > 0);

// Find the IP2 settlement month — June 2028 (or first month that touches IP2 funding).
const ip2SettlementMonth = series.find(m => m.year === 2028 && m.month === 6);
assert('Found Jun 2028 settlement month', !!ip2SettlementMonth,
  `series years: ${[...new Set(series.map(m => m.year))].join(',')}`);

if (ip2SettlementMonth) {
  assert('Jun 2028: propertyDeposit (cash-like) = $0 under equity release',
    ip2SettlementMonth.propertyDeposit === 0,
    `got $${ip2SettlementMonth.propertyDeposit}`);
  assert('Jun 2028: propertyPurchaseCashUsed = $0',
    (ip2SettlementMonth as any).propertyPurchaseCashUsed === 0,
    `got $${(ip2SettlementMonth as any).propertyPurchaseCashUsed}`);
  assert('Jun 2028: propertyEquityReleased == IP2 deposit ($164k)',
    (ip2SettlementMonth as any).propertyEquityReleased === IP2.deposit,
    `got $${(ip2SettlementMonth as any).propertyEquityReleased} expected $${IP2.deposit}`);
  // Acquisition costs (stamp duty) still hit cash — that's correct.
  assert('Jun 2028: buying costs > 0 (stamp duty + legal still draw cash)',
    (ip2SettlementMonth.propertyBuyingCosts ?? 0) > 0);
}

// ─── 2. Annual roll-up surfaces decomposition for 2028 ──────────────────────

section('2. aggregateCashFlowToAnnual: 2028 roll-up exposes funding split');
const annual = aggregateCashFlowToAnnual(series);
const year2028 = annual.find(a => a.year === 2028);
assert('2028 annual row exists', !!year2028);

if (year2028) {
  assert('2028: propertyPurchaseCashUsed = $0 (Equity Release)',
    (year2028 as any).propertyPurchaseCashUsed === 0,
    `got $${(year2028 as any).propertyPurchaseCashUsed}`);
  assert('2028: propertyEquityReleased == IP2 deposit ($164k)',
    (year2028 as any).propertyEquityReleased === IP2.deposit,
    `got $${(year2028 as any).propertyEquityReleased}`);
}

// ─── 3. Cash balance does NOT collapse in 2028 ──────────────────────────────

section('3. 2028 closing cash does not collapse from IP2 deposit');
// Compute the difference between 2027 ending and 2028 ending. The drop should
// only reflect ongoing cashflow (holding costs, mortgage interest, NG) plus
// stamp duty + legal fees — NOT a $164k deposit hit.
const y2027 = annual.find(a => a.year === 2027);
const y2028 = annual.find(a => a.year === 2028);
if (y2027 && y2028) {
  const drop = y2027.endingBalance - y2028.endingBalance;
  // The maximum legitimate drop is roughly: stamp duty ($29.75k) + legal
  // ($2k) + monthly noise. We allow up to $120k as a generous upper bound
  // — without the fix the drop would be > $164k from the deposit alone.
  assert(
    `2028 cash drop stays below $120k (got $${Math.round(drop).toLocaleString()})`,
    drop < 120_000,
  );
}

// ─── 4. Audit trace surfaces canonical decomposition for 2028 ───────────────

section('4. Cashflow audit trace for 2028 carries funding decomposition');
if (y2028) {
  const trace = buildCashflowYearTrace({
    year: 2028,
    openingCash: y2027?.endingBalance ?? SNAPSHOT.cash,
    closingCash: y2028.endingBalance,
    netCashflow: y2028.netCashFlow,
    propertyPurchaseCashUsed: (y2028 as any).propertyPurchaseCashUsed ?? 0,
    propertyEquityReleased:   (y2028 as any).propertyEquityReleased   ?? 0,
    propertyAssetSalesUsed:   (y2028 as any).propertyAssetSalesUsed   ?? 0,
    propertyBuyingCosts:      (y2028 as any).propertyBuyingCosts      ?? 0,
    isAcquisitionYear: true,
  });
  const expectedId = 'cashflow:plan-execution:cash-balance:2028';
  assert('Trace id matches canonical convention',
    trace.id === expectedId && cashflowYearTraceId(2028) === expectedId);
  assert('Trace finalValue populated', typeof trace.finalValue === 'string' && trace.finalValue.length > 0);
  assert('Trace formula populated',     typeof trace.formula === 'string' && trace.formula.length > 0);
  assert('Trace sourceEngine references applyFundingToProperties',
    trace.sourceEngine.includes('applyFundingToProperties'),
    trace.sourceEngine);
  // The trace inputs must include cash-used = $0 and equity-released > 0.
  const cashUsedInput = trace.inputs.find(i => /cash used/i.test(i.label));
  const equityInput   = trace.inputs.find(i => /equity released/i.test(i.label));
  assert('Trace exposes "cash used" input',   !!cashUsedInput);
  assert('Trace exposes "equity released" input', !!equityInput);
  assert('Trace input cash used shows $0',
    typeof cashUsedInput?.value === 'string' && /\$0\b/.test(cashUsedInput.value),
    String(cashUsedInput?.value));
  assert('Trace input equity released shows the IP2 deposit',
    typeof equityInput?.value === 'string' &&
      (equityInput.value.includes('$164,000') || equityInput.value.includes('164,000')),
    String(equityInput?.value));
  // Excluded list explicitly names equity-release.
  assert('Trace excluded list mentions equity-release deposits',
    trace.excluded.some(e => /equity[- ]release/i.test(e.label)));
}

// ─── 5. Adapter is idempotent — re-applying funding does not double-count ──

section('5. applyFundingToProperties is idempotent');
const once = applyFundingToProperties(
  PROPERTIES,
  buildAdapterContext({ snapshot: SNAPSHOT, stocks: [], cryptos: [] }),
);
const twice = applyFundingToProperties(
  once as any[],
  buildAdapterContext({ snapshot: SNAPSHOT, stocks: [], cryptos: [] }),
);
const ip2Once  = once.find(p => p.id === 2)!;
const ip2Twice = twice.find(p => p.id === 2)!;
assert('Idempotent: deposit stays = $0',  ip2Twice.deposit === ip2Once.deposit);
assert('Idempotent: loan_amount unchanged on second pass',
  ip2Twice.loan_amount === ip2Once.loan_amount);
assert('Idempotent: funding plan equity release preserved',
  (ip2Twice as any)[FUNDING_PLAN_FIELD].equityReleased
    === (ip2Once as any)[FUNDING_PLAN_FIELD].equityReleased);

// ─── 6. Engine output equals on already-funded properties ───────────────────

section('6. buildCashFlowSeries(raw) == buildCashFlowSeries(funded)');
const fromRaw = buildCashFlowSeries({
  snapshot: SNAPSHOT,
  expenses: [],
  properties: PROPERTIES,
  bills: [],
  inflationRate: 3,
  incomeGrowthRate: 3.5,
});
const fromFunded = buildCashFlowSeries({
  snapshot: SNAPSHOT,
  expenses: [],
  properties: once as any[],
  bills: [],
  inflationRate: 3,
  incomeGrowthRate: 3.5,
});
const rawJun = fromRaw.find(m => m.year === 2028 && m.month === 6);
const fndJun = fromFunded.find(m => m.year === 2028 && m.month === 6);
assert('Raw vs funded: identical propertyDeposit',
  (rawJun?.propertyDeposit ?? -1) === (fndJun?.propertyDeposit ?? -2));
assert('Raw vs funded: identical equity-released',
  ((rawJun as any)?.propertyEquityReleased ?? -1)
    === ((fndJun as any)?.propertyEquityReleased ?? -2));
assert('Raw vs funded: identical cumulative balance at year end',
  fromRaw[fromRaw.length - 1].cumulativeBalance
    === fromFunded[fromFunded.length - 1].cumulativeBalance);

// ─── 7. Coverage manifest exposes per-year trace ids ────────────────────────

section('7. Coverage manifest enumerates per-year cashflow trace ids');
const {
  COVERAGE_MANIFEST,
  REQUIRED_TRACE_IDS,
} = await import('../client/src/lib/auditMode/coverageManifest');
const {
  CASHFLOW_PLAN_EXECUTION_TRACE_IDS,
  CASHFLOW_PLAN_EXECUTION_YEAR_RANGE,
} = await import('../client/src/lib/auditMode/engineTraces');

const currentYear = new Date().getFullYear();
// Demo IP1 purchase year per QA report (2027) + canonical bug year (2028).
const REQUIRED_DEMO_YEARS = [currentYear, currentYear + 1, 2027, 2028];

assert('CASHFLOW_PLAN_EXECUTION_TRACE_IDS exposes 11 ids',
  CASHFLOW_PLAN_EXECUTION_TRACE_IDS.length === 11,
  `got ${CASHFLOW_PLAN_EXECUTION_TRACE_IDS.length}`);
assert('Year range starts at the current calendar year',
  CASHFLOW_PLAN_EXECUTION_YEAR_RANGE[0] === currentYear);

for (const yr of REQUIRED_DEMO_YEARS) {
  // Year may fall outside the rolling 11-year window if the calendar drifts;
  // only assert membership when the year is in-range.
  if (yr < currentYear || yr > currentYear + 10) continue;
  const id = `cashflow:plan-execution:cash-balance:${yr}`;
  assert(`Manifest contains ${id}`,
    REQUIRED_TRACE_IDS.includes(id),
    `not in REQUIRED_TRACE_IDS`);
  const entry = COVERAGE_MANIFEST.find(e => e.id === id);
  assert(`${id}: engine = cashflow_engine`, entry?.engine === 'cashflow_engine');
  assert(`${id}: surface mentions Plan Execution Capacity`,
    !!entry?.surface && /Plan Execution Capacity/i.test(entry.surface));
}

// Audit Coverage page must enumerate every required id — proving the per-year
// trace ids show up in /audit-coverage rows.
const reportSource = await (await import('node:fs')).promises.readFile(
  'client/src/components/auditMode/AuditCoverageReport.tsx', 'utf8');
assert('AuditCoverageReport reads COVERAGE_MANIFEST',
  /COVERAGE_MANIFEST/.test(reportSource));

// ─── 8. ensureCoverageRegistered installs placeholder factories ─────────────

section('8. ensureCoverageRegistered seeds per-year placeholders');
const auditRegistry = await import('../client/src/lib/auditMode/auditRegistry');
const { ensureCoverageRegistered } = await import('../client/src/lib/auditMode/ensureCoverage');

// Pre-seed: at least one per-year id is unregistered before ensureCoverage.
const probeYear = currentYear + 3;
const probeId = `cashflow:plan-execution:cash-balance:${probeYear}`;
auditRegistry.unregisterTrace(probeId);
assert('Probe id starts unregistered', !auditRegistry.hasTrace(probeId));

ensureCoverageRegistered();
assert('Probe id registered after ensureCoverageRegistered',
  auditRegistry.hasTrace(probeId));
const placeholderTrace = auditRegistry.resolveTrace(probeId);
assert('Placeholder trace resolves to a record', !!placeholderTrace);
assert('Placeholder formula mentions funding-source path',
  /funding source|equity-release/i.test(placeholderTrace?.formula ?? ''),
  placeholderTrace?.formula);
assert('Placeholder finalValue = ready (overwritten on dashboard mount)',
  placeholderTrace?.finalValue === 'ready');

// ─── 9. Dashboard mount overwrites placeholders with live values ────────────

section('9. Dashboard live trace overwrites placeholder');
// Simulate the dashboard mount by calling buildCashflowYearTrace with the
// IP2 settlement year and registering it. The Audit Coverage report reads
// `finalValue` from the registry, so after the dashboard runs the entry
// must no longer say "ready".
const liveTrace = buildCashflowYearTrace({
  year: 2028,
  openingCash: 200_000,
  closingCash: 170_000,
  netCashflow: -30_000,
  propertyPurchaseCashUsed: 0,
  propertyEquityReleased: IP2.deposit,
  propertyAssetSalesUsed: 0,
  propertyBuyingCosts: IP2.stamp_duty,
  isAcquisitionYear: true,
});
auditRegistry.registerTrace(liveTrace);
const liveRead = auditRegistry.resolveTrace(`cashflow:plan-execution:cash-balance:2028`);
assert('Live trace overwrites placeholder',
  liveRead?.finalValue !== 'ready' && typeof liveRead?.finalValue === 'string');
assert('Live trace exposes the $0 cash-used line',
  liveRead?.inputs.some(i => /cash used/i.test(i.label) && /\$0\b/.test(String(i.value))));
assert('Live trace exposes equity-released > $0 line',
  liveRead?.inputs.some(i => /equity released/i.test(i.label)
    && (String(i.value).includes('$164,000') || String(i.value).includes('164,000'))));

// ─── 10. ExecutiveDashboard renders native AuditableMetric click targets ────

section('10. Plan Execution Capacity panel exposes native audit click targets');
const dashSrc = await (await import('node:fs')).promises.readFile(
  'client/src/components/ExecutiveDashboard.tsx', 'utf8');
assert('Imports cashflowYearTraceId from engineTraces',
  /cashflowYearTraceId[\s,]/.test(dashSrc));
assert('Per-year audit affordance row uses AuditableMetric',
  /plan-execution-audit-row[\s\S]+?AuditableMetric/.test(dashSrc));
assert('Audit chip wraps trace id from cashflowYearTraceId',
  /AuditableMetric[\s\S]{0,400}cashflowYearTraceId\(/.test(dashSrc));
assert('Final-year cash tile wraps AuditableMetric with cashflowYearTraceId',
  /audit-metric-cashflow-final-year/.test(dashSrc) &&
  /cashflowYearTraceId\(parseInt\(finalYearLabel/.test(dashSrc));
assert('Plan Execution audit row has data-testid for QA',
  /data-testid="plan-execution-audit-row"/.test(dashSrc));
assert('Acquisition-year chips emit data-acquisition flag',
  /data-acquisition=/.test(dashSrc));

// Coverage manifest surface string must point at Plan Execution Capacity so
// the /audit-coverage filter actually surfaces these rows.
{
  const id2028 = 'cashflow:plan-execution:cash-balance:2028';
  if (CASHFLOW_PLAN_EXECUTION_TRACE_IDS.includes(id2028)) {
    const e = COVERAGE_MANIFEST.find(x => x.id === id2028);
    assert(`${id2028} surface mentions Plan Execution Capacity`,
      !!e && /Plan Execution Capacity/i.test(e.surface));
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✓ All cashflow chart / funding source regression checks passed`);
}
