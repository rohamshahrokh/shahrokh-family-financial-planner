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
assert('Imports useAuditMode for direct openTrace binding',
  /from\s+'@\/lib\/auditMode\/AuditModeContext'/.test(dashSrc));
// Per-year chips are now real <button type="button"> elements with onClick
// bound to auditCtx.openTrace — not wrapped in AuditableMetric — so iOS
// Safari fires the click immediately and the chart-area parent's
// `touchAction: 'pan-y'` / `userSelect: 'none'` cannot suppress them.
// #FWL_Remaining_Bug_CashflowChart_Ignores_FundingSource
assert('Per-year audit affordance row uses native <button> chips',
  /plan-execution-audit-row[\s\S]+?cashflowYearTraceId\(yr\)[\s\S]+?<button/.test(dashSrc));
assert('Chip click handler calls auditCtx.openTrace(traceId)',
  /onClick=\{[^}]*handleOpen\(\)/.test(dashSrc) &&
  /handleOpen\s*=\s*\(\)\s*=>\s*auditCtx\.openTrace\(traceId\)/.test(dashSrc));
assert('Chip overrides touch-action and tap highlight for mobile Safari',
  /touchAction:\s*'manipulation'/.test(dashSrc) &&
  /WebkitTapHighlightColor:\s*'transparent'/.test(dashSrc));
assert('Audit row is OUTSIDE the chart-area div (sibling, not child)',
  /<\/div>\s*\n\s*\{\/\* ── Per-year audit affordance/.test(dashSrc));
assert('Audit chip wraps trace id from cashflowYearTraceId',
  /cashflowYearTraceId\(yr\)/.test(dashSrc));
assert('Final-year cash tile wraps AuditableMetric with cashflowYearTraceId',
  /audit-metric-cashflow-final-year/.test(dashSrc) &&
  /cashflowYearTraceId\(parseInt\(finalYearLabel/.test(dashSrc));
assert('Plan Execution audit row has data-testid for QA',
  /data-testid="plan-execution-audit-row"/.test(dashSrc));
assert('Acquisition-year chips emit data-acquisition flag',
  /data-acquisition=/.test(dashSrc));
// Stop event propagation on chip click so a parent click handler can't
// swallow the event.
assert('Chip click stops propagation',
  /onClick=\{\s*\(e\)\s*=>\s*\{[^}]*e\.stopPropagation\(\);[^}]*handleOpen\(\)/.test(dashSrc));
// data-testid for the chip in Audit Mode = `audit-metric-cashflow-{yr}` so
// e2e suites can locate the click target without traversing internals.
assert('Audit-mode chip exposes audit-metric-cashflow-{yr} testid',
  /data-testid=\{`audit-metric-cashflow-\$\{yr\}`\}/.test(dashSrc));

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

// ─── 11. Cashflow Reconciliation trace exposes every line item ──────────────

section('11. Cashflow Reconciliation trace — full per-year breakdown');
const {
  buildCashflowReconciliationTrace,
  cashflowReconciliationTraceId,
  CASHFLOW_RECONCILIATION_TRACE_IDS,
  CASHFLOW_RECONCILIATION_YEAR_RANGE,
} = await import('../client/src/lib/auditMode/engineTraces');

// 11.a — Trace id convention.
assert('Reconciliation trace id matches canonical convention',
  cashflowReconciliationTraceId(2028) === 'cashflow:plan-execution:reconciliation:2028');
assert('Reconciliation year range is 11 entries starting at currentYear',
  CASHFLOW_RECONCILIATION_TRACE_IDS.length === 11
    && CASHFLOW_RECONCILIATION_YEAR_RANGE[0] === new Date().getFullYear());

// 11.b — Reconciliation trace uses LIVE engine values for the 2028 acquisition
// year and itemises every income + outgoing line + acquisition decomposition.
if (y2027 && y2028) {
  const reconTrace = buildCashflowReconciliationTrace({
    year: 2028,
    openingCash: y2027.endingBalance,
    closingCash: y2028.endingBalance,
    netCashflow: y2028.netCashFlow,
    salaryIncome: (y2028 as any).income ?? 0,
    rentalIncomeByProperty: (y2028 as any).rentalIncomeByProperty ?? {},
    rentalIncomeTotal: (y2028 as any).rentalIncome ?? 0,
    taxRefund: (y2028 as any).ngTaxBenefit ?? 0,
    plannedStockSell: (y2028 as any).plannedStockSell ?? 0,
    plannedCryptoSell: (y2028 as any).plannedCryptoSell ?? 0,
    livingExpenses: (y2028 as any).totalExpenses ?? 0,
    pporMortgage: (y2028 as any).mortgageRepayment ?? 0,
    investmentLoanRepayment: (y2028 as any).investmentLoanRepayment ?? 0,
    plannedStockBuy: (y2028 as any).plannedStockBuy ?? 0,
    plannedCryptoBuy: (y2028 as any).plannedCryptoBuy ?? 0,
    stockDCAOutflow: (y2028 as any).stockDCAOutflow ?? 0,
    cryptoDCAOutflow: (y2028 as any).cryptoDCAOutflow ?? 0,
    billsOutflow: (y2028 as any).billsOutflow ?? 0,
    acquisitionCashUsed: (y2028 as any).propertyPurchaseCashUsed ?? 0,
    assetSalesUsed: (y2028 as any).propertyAssetSalesUsed ?? 0,
    acquisitionBuyingCosts: (y2028 as any).propertyBuyingCosts ?? 0,
    propertyHoldingCost: (y2028 as any).propertyHoldingCost ?? 0,
    taxPayableInformational: (y2028 as any).taxPayable ?? 0,
    equityReleased: (y2028 as any).propertyEquityReleased ?? 0,
    isAcquisitionYear: true,
    fundingSourceLabel: 'equity-release',
  });

  // ── Structural assertions ──
  assert('Reconciliation trace id is canonical',
    reconTrace.id === 'cashflow:plan-execution:reconciliation:2028');
  assert('Reconciliation finalValue formats as $ amount',
    typeof reconTrace.finalValue === 'string' && /\$/.test(reconTrace.finalValue));
  assert('Reconciliation sourceEngine references finance.ts canonical engine',
    /finance\.ts/.test(reconTrace.sourceEngine));
  // ── Bridge sections — Opening / Operating / Investment Allocations /
  //    Property Acquisition Cash Used / Financing / Closing Cash. ──
  for (const header of ['─ 1. Opening Cash ─',
                         '─ 2. Operating Cashflow ─',
                         '─ 3. Investment Allocations ─',
                         '─ 4. Property Acquisition Cash Used ─',
                         '─ 5. Financing / Equity Release ─',
                         '─ INFO (excluded from cash bridge) ─',
                         '─ 6. Closing Cash ─']) {
    assert(`Reconciliation has bridge section "${header}"`,
      reconTrace.inputs.some(i => i.label === header));
  }
  // Operating Cashflow line items.
  for (const lbl of ['+ Salary income', '+ Other income', '+ Rental income — all properties',
                      '+ Investment income (dividends)', '+ Tax refunds (NG)',
                      '- Living expenses', '- Childcare', '- PPOR mortgage repayment',
                      '- Investment loan repayments',
                      '- Recurring bills / debt repayments',
                      '= Operating Cashflow']) {
    assert(`Operating Cashflow contains "${lbl}"`,
      reconTrace.inputs.some(i => i.label === lbl));
  }
  // Investment Allocations line items.
  for (const lbl of ['- Stock DCA', '- Crypto DCA',
                      '- Planned stock buys', '- Planned crypto buys',
                      '+ Planned stock sells', '+ Planned crypto sells',
                      '= Net Investment Allocations']) {
    assert(`Investment Allocations contains "${lbl}"`,
      reconTrace.inputs.some(i => i.label === lbl));
  }
  // Property Acquisition Cash Used line items.
  for (const lbl of ['- Deposit cash / offset used',
                      '- Asset sales used (stocks/crypto liquidated for deposit)',
                      '- Stamp duty + legal + building / loan setup / other buying costs',
                      '= Property Acquisition Cash Used']) {
    assert(`Property Acquisition Cash Used contains "${lbl}"`,
      reconTrace.inputs.some(i => i.label === lbl));
  }
  // Financing / Equity Release line items.
  for (const lbl of ['+ Equity released (debt-funded deposit)',
                      '= Financing / Equity Release (cash impact)']) {
    assert(`Financing / Equity Release contains "${lbl}"`,
      reconTrace.inputs.some(i => i.label === lbl));
  }
  // INFO (excluded) section.
  for (const lbl of ['Investment property holding cost',
                      'Tax payable (already withheld)',
                      'Total Income (legacy combined view)',
                      'Total Expenses (legacy combined view)']) {
    assert(`Reconciliation INFO contains "${lbl}"`,
      reconTrace.inputs.some(i => i.label === lbl));
  }
  // Closing-cash bridge section.
  for (const lbl of ['Opening Cash',
                      '+ Operating Cashflow',
                      '+ Investment Allocations',
                      '+ Property Acquisition Cash Used',
                      '+ Financing / Equity Release',
                      '+ Rounding (monthly accumulation)',
                      '= Engine Net Cashflow (line-item sum)',
                      '= Engine Net Cashflow (canonical)',
                      'Drift (line sum vs engine)',
                      '= Closing Cash']) {
    assert(`Closing Cash bridge contains "${lbl}"`,
      reconTrace.inputs.some(i => i.label === lbl));
  }

  // ── Live-value assertions ──
  const findVal = (label: string) =>
    String(reconTrace.inputs.find(i => i.label === label)?.value ?? '');
  assert('Salary income line shows engine value (>$0)',
    /\$[1-9]/.test(findVal('+ Salary income')));
  // Equity Release for the 2028 IP2 settlement = $164k — now in section 5.
  assert('Financing section: Equity released = IP2 deposit ($164k)',
    findVal('+ Equity released (debt-funded deposit)').includes('164,000'));
  // Acquisition cash used = $0 under equity release (section 4).
  assert('Deposit cash / offset used = $0 (equity release)',
    /\$0\b/.test(findVal('- Deposit cash / offset used')));
  // Closing cash matches engine.
  const closingCashLine = findVal('= Closing Cash');
  const expectedClosing = y2028.endingBalance >= 0
    ? `$${Math.round(y2028.endingBalance).toLocaleString()}`
    : `-$${Math.abs(Math.round(y2028.endingBalance)).toLocaleString()}`;
  assert(`Reconciliation closing cash matches engine endingBalance (${expectedClosing})`,
    closingCashLine === expectedClosing,
    `got "${closingCashLine}" expected "${expectedClosing}"`);

  // ── STRICT BALANCE CHECK — bridge subtotals balance to engine net ──────
  const parse$ = (s: string): number => {
    const neg = s.trim().startsWith('-');
    const raw = s.replace(/[^\d.]/g, '');
    const n = parseFloat(raw || '0');
    return neg ? -n : n;
  };
  const opVal      = parse$(findVal('= Operating Cashflow'));
  const invVal     = parse$(findVal('= Net Investment Allocations'));
  const acqVal     = parse$(findVal('= Property Acquisition Cash Used'));
  const finVal     = parse$(findVal('= Financing / Equity Release (cash impact)'));
  const roundingVal = parse$(findVal('+ Rounding (monthly accumulation)'));
  const netLineVal  = parse$(findVal('= Engine Net Cashflow (line-item sum)'));
  const netEngVal   = parse$(findVal('= Engine Net Cashflow (canonical)'));
  const driftVal    = parse$(findVal('Drift (line sum vs engine)'));
  // The displayed bridge MUST balance:
  //   Operating + Investments + Acquisition + Financing + Rounding == engine netCashflow
  const computedNet = opVal + invVal + acqVal + finVal + roundingVal;
  assert(`Operating + Investments + Acquisition + Financing + Rounding == line-item Net Cashflow (got ${computedNet} vs ${netLineVal})`,
    Math.abs(computedNet - netLineVal) <= 1);
  assert(`Line-item Net Cashflow matches engine Net Cashflow exactly (drift ${Math.abs(netLineVal - netEngVal)})`,
    Math.abs(netLineVal - netEngVal) <= 1);
  assert(`Engine and line-item agree exactly for 2028 (drift = ${driftVal})`,
    driftVal <= 1);
  // Financing/Equity Release contributes $0 to the cash bridge by design.
  assert(`Financing / Equity Release contributes $0 to cash bridge (got ${finVal})`,
    Math.abs(finVal) <= 1);
  // Rounding adjustment is tiny.
  assert(`Rounding adjustment is small for 2028 (|${roundingVal}| ≤ $50)`,
    Math.abs(roundingVal) <= 50);
  // Closing cash = opening + netCashflow.
  const openingVal = parse$(findVal('Opening Cash'));
  const closingVal = parse$(findVal('= Closing Cash'));
  assert(`Opening Cash + engine Net Cashflow == Closing Cash within $1 (got ${openingVal + netEngVal} vs ${closingVal})`,
    Math.abs(openingVal + netEngVal - closingVal) <= 1);

  // ── Double-counting diagnostics ──
  assert('Reconciliation has notes (double-counting diagnostics)',
    Array.isArray(reconTrace.notes) && reconTrace.notes.length > 0);
  assert('Notes flag that equity-release adds to debt (no double-count)',
    (reconTrace.notes ?? []).some(n => /equity release/i.test(n) && /debt/i.test(n)));
  assert('Notes confirm PPOR mortgage not double-counted in forecast months',
    (reconTrace.notes ?? []).some(n => /PPOR mortgage/i.test(n) && /\$0|deduplicate|double-count/i.test(n)));
  assert('Notes confirm closing-cash bridge balances',
    (reconTrace.notes ?? []).some(n => /bridge/i.test(n) && /balanc/i.test(n)));
  assert('Notes confirm reconciliation arithmetic balances (✓, not ✗)',
    (reconTrace.notes ?? []).some(n => /arithmetic balances/i.test(n) && !/does NOT balance/i.test(n)));
  assert('No notes report arithmetic does NOT balance',
    !(reconTrace.notes ?? []).some(n => /does NOT balance/i.test(n)));

  // ── Excluded list explicitly excludes equity-release deposits + holding cost. ──
  assert('Reconciliation excluded list mentions equity-release deposits',
    reconTrace.excluded.some(e => /equity[- ]release/i.test(e.label)));
  assert('Reconciliation excluded list mentions property holding cost',
    reconTrace.excluded.some(e => /holding cost/i.test(e.label)));
}

// ─── 11.b.ii — Year-End Wealth Position section present even when caller
//              omits all wealth values (section is always rendered; missing
//              fields read "n/a (not in current forecast row)"). ──
if (y2027 && y2028) {
  // Re-build the 2028 trace with NO wealth values to assert the n/a path.
  const reconNoWealth = buildCashflowReconciliationTrace({
    year: 2028,
    openingCash: y2027.endingBalance,
    closingCash: y2028.endingBalance,
    netCashflow: y2028.netCashFlow,
    salaryIncome: (y2028 as any).income ?? 0,
    rentalIncomeTotal: (y2028 as any).rentalIncome ?? 0,
    taxRefund: 0,
    livingExpenses: (y2028 as any).totalExpenses ?? 0,
    pporMortgage: 0,
    investmentLoanRepayment: (y2028 as any).investmentLoanRepayment ?? 0,
    plannedStockBuy: 0,
    plannedCryptoBuy: 0,
    stockDCAOutflow: 0,
    cryptoDCAOutflow: 0,
    billsOutflow: (y2028 as any).billsOutflow ?? 0,
    acquisitionCashUsed: (y2028 as any).propertyPurchaseCashUsed ?? 0,
    assetSalesUsed: (y2028 as any).propertyAssetSalesUsed ?? 0,
    acquisitionBuyingCosts: (y2028 as any).propertyBuyingCosts ?? 0,
    propertyHoldingCost: (y2028 as any).propertyHoldingCost ?? 0,
    equityReleased: (y2028 as any).propertyEquityReleased ?? 0,
    isAcquisitionYear: true,
    // NO wealth* fields passed — every wealth row should fall back to "n/a".
  });
  assert('Year-End Wealth Position section header present even with no wealth args',
    reconNoWealth.inputs.some(i => i.label === '─ 7. Year-End Wealth Position ─'));
  const naOk = (lbl: string) => {
    const v = String(reconNoWealth.inputs.find(i => i.label === lbl)?.value ?? '');
    return /n\/a/i.test(v);
  };
  assert('Cash Position row shows n/a when forecast row not passed',
    naOk('Cash Position (forecast row)'));
  assert('Invested Capital row shows n/a when stocks+crypto not passed',
    naOk('Invested Capital (Stocks + Crypto)'));
  assert('Property Equity row shows n/a when not passed',
    naOk('Property Equity'));
  assert('Accessible Wealth row shows n/a when not passed',
    naOk('Accessible Wealth (excl. super)'));
  assert('Net Worth row shows n/a when not passed',
    naOk('Net Worth (incl. super)'));
  // Liquidity-vs-Wealth context row is only emitted when the section has
  // enough information to make a comparison; with NO wealth values + a
  // healthy closing cash for 2028, the warning must NOT fire as the
  // "deterioration" path. (It may emit the "healthy cash" variant.)
  const ctxRow = reconNoWealth.inputs.find(i => i.label === 'Liquidity vs Wealth context');
  const ctxText = String(ctxRow?.value ?? '');
  assert('Wealth context row never falsely warns of deterioration',
    !/deterioration/i.test(ctxText) || /does not indicate/i.test(ctxText));
}

// ─── 11.c — Active 2026 scenario: bridge renders BTC lump, planned-stock
//          lump, property deposit + buying costs as their own sections. ──
//
// Uses the active-household engine values surfaced by the FWL 2026 audit:
//   property deposit (cash leg) ≈ $150,000, buying costs ≈ $31,075
//   planned BTC buy = $80,000 (lump-sum), planned-stock buys = $40,400
//   stock DCA (Dec only) ≈ $991, crypto DCA (Nov+Dec) = $2,600
//   recurring bills ≈ $43,074, living expenses ≈ $117,329
//   salary ≈ $177,295, rental ≈ $14,043
// Engine net cashflow ≈ −$296,889; opening cash $262,000; closing −$34,889.
section('11.c Cashflow Reconciliation — active 2026 bridge format');
{
  const recon2026 = buildCashflowReconciliationTrace({
    year: 2026,
    openingCash: 262_000,
    closingCash: -34_889,
    netCashflow: -296_889,
    salaryIncome:            177_295,
    rentalIncomeTotal:        14_043,
    rentalIncomeByProperty:  { '3': 14_043 },
    taxRefund:                     0,
    plannedStockSell:              0,
    plannedCryptoSell:             0,
    livingExpenses:          117_329,
    pporMortgage:                  0,
    investmentLoanRepayment:  22_752,
    plannedStockBuy:          40_400,
    plannedCryptoBuy:         80_000,
    stockDCAOutflow:             991,
    cryptoDCAOutflow:          2_600,
    billsOutflow:             43_074,
    acquisitionCashUsed:     150_000,
    assetSalesUsed:                0,
    acquisitionBuyingCosts:   31_075,
    propertyHoldingCost:       3_450,
    taxPayableInformational:  56_408,
    equityReleased:                0,
    isAcquisitionYear:          true,
    fundingSourceLabel:        'offset+savings',
    // ── Year-End Wealth Position (pass-through from YearlyProjection) ──
    // Plausible 2026 wealth row: cash drained but capital deployed into
    // stocks/crypto + new IP equity. Numbers below come straight from a
    // forecast row — the trace MUST surface them without re-deriving net
    // worth.
    wealthCash:                  -34_889, // matches closing cash
    wealthStocks:                121_391, // ~40.4k lump + small DCA
    wealthCrypto:                 82_600, // ~80k BTC lump + 2.6k DCA
    wealthPropertyEquity:        336_000, // PPOR equity + IP1 equity (150k deposit + cap growth)
    wealthAccessibleNetWorth:    505_102,
    wealthTotalSuper:             96_000,
    wealthTotalNetWorth:         601_102,
    priorYearAccessibleNetWorth: 480_000,
  });

  const parse$2026 = (s: string): number => {
    const neg = s.trim().startsWith('-');
    const raw = s.replace(/[^\d.]/g, '');
    const n = parseFloat(raw || '0');
    return neg ? -n : n;
  };
  const find2026 = (label: string) =>
    String(recon2026.inputs.find(i => i.label === label)?.value ?? '');

  // Section presence — every required bridge section.
  for (const header of ['─ 1. Opening Cash ─',
                         '─ 2. Operating Cashflow ─',
                         '─ 3. Investment Allocations ─',
                         '─ 4. Property Acquisition Cash Used ─',
                         '─ 5. Financing / Equity Release ─',
                         '─ 6. Closing Cash ─']) {
    assert(`2026 bridge has section "${header}"`,
      recon2026.inputs.some(i => i.label === header));
  }

  // Line values match the active-scenario data.
  assert('2026: BTC lump-sum shows -$80,000 in Investment Allocations',
    /80,000/.test(find2026('- Planned crypto buys')));
  assert('2026: Planned stock buys show -$40,400 in Investment Allocations',
    /40,400/.test(find2026('- Planned stock buys')));
  assert('2026: Stock DCA shows engine value (~$991) in Investment Allocations',
    /991\b/.test(find2026('- Stock DCA')));
  assert('2026: Crypto DCA shows engine value (~$2,600) in Investment Allocations',
    /2,600/.test(find2026('- Crypto DCA')));
  assert('2026: Property deposit cash leg shows $150,000 in Acquisition section',
    /150,000/.test(find2026('- Deposit cash / offset used')));
  assert('2026: Buying costs show $31,075 in Acquisition section',
    /31,075/.test(find2026('- Stamp duty + legal + building / loan setup / other buying costs')));
  assert('2026: Recurring bills show $43,074 in Operating Cashflow',
    /43,074/.test(find2026('- Recurring bills / debt repayments')));
  assert('2026: Living expenses show $117,329 in Operating Cashflow',
    /117,329/.test(find2026('- Living expenses')));
  assert('2026: Salary shows $177,295 in Operating Cashflow',
    /177,295/.test(find2026('+ Salary income')));
  assert('2026: Rental shows $14,043 in Operating Cashflow',
    /14,043/.test(find2026('+ Rental income — all properties')));
  // Financing/Equity Release section must read $0 because default funding is
  // offset+savings — the cash leg pays the full deposit, no equity drawn.
  assert('2026: Financing/Equity Release line is $0 (offset+savings funding)',
    /\$0\b/.test(find2026('= Financing / Equity Release (cash impact)')));

  // Bridge arithmetic balances exactly to engine netCashflow.
  const op2026  = parse$2026(find2026('= Operating Cashflow'));
  const inv2026 = parse$2026(find2026('= Net Investment Allocations'));
  const acq2026 = parse$2026(find2026('= Property Acquisition Cash Used'));
  const fin2026 = parse$2026(find2026('= Financing / Equity Release (cash impact)'));
  const rnd2026 = parse$2026(find2026('+ Rounding (monthly accumulation)'));
  const netLine2026 = parse$2026(find2026('= Engine Net Cashflow (line-item sum)'));
  const netEng2026  = parse$2026(find2026('= Engine Net Cashflow (canonical)'));
  const summed = op2026 + inv2026 + acq2026 + fin2026 + rnd2026;
  assert(`2026 bridge subtotals sum to engine netCashflow (got ${summed} vs ${netLine2026})`,
    Math.abs(summed - netLine2026) <= 1);
  assert(`2026 line-item Net Cashflow == engine Net Cashflow (drift ${Math.abs(netLine2026 - netEng2026)})`,
    Math.abs(netLine2026 - netEng2026) <= 1);
  // Property Acquisition Cash Used must be negative (signed) — this is the
  // whole point of the new bridge.
  assert(`2026 Property Acquisition Cash Used is negative (got ${acq2026})`, acq2026 < 0);
  // Investment Allocations must also be negative for this household (no sells).
  assert(`2026 Investment Allocations is negative (got ${inv2026})`,  inv2026 < 0);
  // Closing cash matches engine.
  const closing2026 = parse$2026(find2026('= Closing Cash'));
  assert(`2026 Closing Cash = -$34,889 (got ${closing2026})`,
    Math.abs(closing2026 - (-34_889)) <= 1);

  // Plain-English / formula text reference the bridge terminology so a future
  // refactor can't silently revert to the legacy "Total Income - Total Expenses".
  assert('2026: formula text names every bridge subtotal',
    /Operating Cashflow/.test(recon2026.formula)
      && /Investment Allocations/.test(recon2026.formula)
      && /Property Acquisition Cash Used/.test(recon2026.formula)
      && /Financing.*Equity Release/.test(recon2026.formula));
  assert('2026: plainEnglish names the bridge sections',
    /Operating Cashflow/.test(recon2026.plainEnglish)
      && /Investment Allocations/.test(recon2026.plainEnglish)
      && /Property Acquisition Cash Used/.test(recon2026.plainEnglish));
  assert('2026: assumptions clarify Operating Cashflow is a derived subtotal',
    recon2026.assumptions.some(x =>
      /Operating Cashflow.*derived subtotal/i.test(x.label)));

  // ── Year-End Wealth Position rows ────────────────────────────────────────
  assert('2026: Wealth Position section header present',
    recon2026.inputs.some(i => i.label === '─ 7. Year-End Wealth Position ─'));
  for (const lbl of ['Liquidity Position — Closing Cash',
                      'Cash Position (forecast row)',
                      'Invested Capital (Stocks + Crypto)',
                      '  · Stocks',
                      '  · Crypto',
                      'Property Equity',
                      'Accessible Wealth (excl. super)',
                      'Total Super (display only)',
                      'Net Worth (incl. super)']) {
    assert(`2026 Wealth Position contains "${lbl}"`,
      recon2026.inputs.some(i => i.label === lbl));
  }
  assert('2026: Invested Capital shows Stocks + Crypto ($203,991)',
    /203,991/.test(String(recon2026.inputs.find(i => i.label === 'Invested Capital (Stocks + Crypto)')?.value ?? '')));
  assert('2026: Property Equity row shows $336,000',
    /336,000/.test(String(recon2026.inputs.find(i => i.label === 'Property Equity')?.value ?? '')));
  assert('2026: Accessible Wealth row shows $505,102',
    /505,102/.test(String(recon2026.inputs.find(i => i.label === 'Accessible Wealth (excl. super)')?.value ?? '')));
  assert('2026: Net Worth row shows $601,102',
    /601,102/.test(String(recon2026.inputs.find(i => i.label === 'Net Worth (incl. super)')?.value ?? '')));
  assert('2026: Δ Accessible Wealth row shows positive delta vs prior year',
    /Δ Accessible Wealth/i.test(
      recon2026.inputs.find(i => /Δ Accessible Wealth/i.test(i.label))?.label ?? ''));
  // Reassurance row — low cash + material deployment → exact wording required.
  const ctxValue = String(recon2026.inputs.find(i => i.label === 'Liquidity vs Wealth context')?.value ?? '');
  assert('2026: Liquidity vs Wealth context row present',
    ctxValue.length > 0);
  assert('2026: Wealth context message reads "Cash has been converted into assets and equity. Low cash does not indicate financial deterioration."',
    /Cash has been converted into assets and equity\. Low cash does not indicate financial deterioration\./.test(ctxValue));
  assert('2026 notes include the Liquidity-vs-Wealth reassurance message',
    (recon2026.notes ?? []).some(n =>
      /converted into assets and equity/i.test(n)
        && /does not indicate financial deterioration/i.test(n)));
  // plainEnglish must reference Wealth Position so the audit panel summary
  // surfaces the liquidity-vs-wealth framing, not just the cash bridge.
  assert('2026: plainEnglish mentions Year-End Wealth Position',
    /Year-End Wealth Position/i.test(recon2026.plainEnglish));
  assert('2026: plainEnglish mentions Liquidity vs Wealth framing',
    /Liquidity Position/i.test(recon2026.plainEnglish)
      && /Wealth Position/i.test(recon2026.plainEnglish));
  // assumptions clarify the wealth values are pass-through (no recompute).
  assert('2026: assumptions clarify wealth pass-through from YearlyProjection',
    recon2026.assumptions.some(x =>
      /Year-End Wealth Position.*pass through/i.test(x.label)
        && /does NOT recompute/i.test(x.label)));

  // ── Engine-untouched guard. The reconciliation trace must not mutate
  //    CashFlowYear / YearlyProjection. We re-derive the bridge from the
  //    same args and assert byte-identical line-item Net Cashflow.
  const recon2026Bis = buildCashflowReconciliationTrace({
    year: 2026, openingCash: 262_000, closingCash: -34_889, netCashflow: -296_889,
    salaryIncome: 177_295, rentalIncomeTotal: 14_043,
    rentalIncomeByProperty: { '3': 14_043 },
    taxRefund: 0, livingExpenses: 117_329, pporMortgage: 0,
    investmentLoanRepayment: 22_752,
    plannedStockBuy: 40_400, plannedCryptoBuy: 80_000,
    stockDCAOutflow: 991, cryptoDCAOutflow: 2_600, billsOutflow: 43_074,
    acquisitionCashUsed: 150_000, assetSalesUsed: 0, acquisitionBuyingCosts: 31_075,
    propertyHoldingCost: 3_450, taxPayableInformational: 56_408,
    equityReleased: 0, isAcquisitionYear: true,
  });
  const findVal2 = (label: string) =>
    String(recon2026Bis.inputs.find(i => i.label === label)?.value ?? '');
  assert('Engine-untouched: Net Cashflow identical without wealth args',
    findVal2('= Engine Net Cashflow (canonical)') === '-$296,889');
  assert('Engine-untouched: Closing Cash identical without wealth args',
    findVal2('= Closing Cash') === '-$34,889');
}

// ─── 12. Coverage manifest includes reconciliation ids ──────────────────────

section('12. Coverage manifest enumerates per-year reconciliation trace ids');
assert('CASHFLOW_RECONCILIATION_TRACE_IDS exposes 11 ids',
  CASHFLOW_RECONCILIATION_TRACE_IDS.length === 11);

const reconIds2028 = 'cashflow:plan-execution:reconciliation:2028';
if (CASHFLOW_RECONCILIATION_TRACE_IDS.includes(reconIds2028)) {
  const _coverage = await import('../client/src/lib/auditMode/coverageManifest');
  assert(`Manifest contains ${reconIds2028}`,
    _coverage.REQUIRED_TRACE_IDS.includes(reconIds2028));
  const entry = _coverage.COVERAGE_MANIFEST.find(e => e.id === reconIds2028);
  assert(`${reconIds2028}: engine = cashflow_engine`,
    entry?.engine === 'cashflow_engine');
  assert(`${reconIds2028}: surface mentions Plan Execution Capacity`,
    !!entry?.surface && /Plan Execution Capacity/i.test(entry.surface));
  assert(`${reconIds2028}: description mentions reconciliation / breakdown`,
    !!entry?.description && /reconcil|breakdown/i.test(entry.description));
}

// ─── 13. ensureCoverageRegistered seeds reconciliation placeholders ─────────

section('13. ensureCoverageRegistered seeds reconciliation placeholders');
const probeReconYear = new Date().getFullYear() + 4;
const probeReconId = cashflowReconciliationTraceId(probeReconYear);
auditRegistry.unregisterTrace(probeReconId);
assert('Reconciliation probe id starts unregistered',
  !auditRegistry.hasTrace(probeReconId));
ensureCoverageRegistered();
assert('Reconciliation probe id registered after ensureCoverageRegistered',
  auditRegistry.hasTrace(probeReconId));
const reconPlaceholder = auditRegistry.resolveTrace(probeReconId);
assert('Reconciliation placeholder resolves',
  !!reconPlaceholder);
assert('Reconciliation placeholder formula mentions net cashflow',
  /Net Cashflow/i.test(reconPlaceholder?.formula ?? ''),
  reconPlaceholder?.formula);

// ─── 14. Audit Coverage stays 100% with the new reconciliation ids ──────────

section('14. Audit Coverage still reports 100% with reconciliation ids included');
const { COVERAGE_MANIFEST: _MF2 } = await import('../client/src/lib/auditMode/coverageManifest');
const connected = _MF2.filter(e => auditRegistry.hasTrace(e.id)).length;
assert(`Coverage connected = manifest length (got ${connected}/${_MF2.length})`,
  connected === _MF2.length);
// Spot-check a reconciliation id is in the manifest.
assert('Reconciliation 2028 is in coverage manifest',
  _MF2.some(e => e.id === 'cashflow:plan-execution:reconciliation:2028'));

// ─── 15. Dashboard wires reconciliation alongside the cash-balance trace ────

section('15. Dashboard.tsx registers reconciliation traces');
const dashPageSrc = await (await import('node:fs')).promises.readFile(
  'client/src/pages/dashboard.tsx', 'utf8');
assert('Dashboard imports buildCashflowReconciliationTrace',
  /buildCashflowReconciliationTrace/.test(dashPageSrc));
assert('Dashboard calls buildCashflowReconciliationTrace inside useEffect',
  /registerAuditTrace\(\s*\n?\s*buildCashflowReconciliationTrace\(/.test(dashPageSrc));
assert('Dashboard passes acquisitionCashUsed / equityReleased to reconciliation trace',
  /acquisitionCashUsed:\s*cashUsed/.test(dashPageSrc)
    && /equityReleased:\s*equityRel/.test(dashPageSrc));
// New bridge-balance schema: explicit plannedStockBuy / plannedStockSell /
// stockDCAOutflow fields must reach the trace so the math balances.
assert('Dashboard forwards plannedStockBuy/plannedStockSell to reconciliation trace',
  /plannedStockBuy:\s*\(a as any\)\.plannedStockBuy/.test(dashPageSrc)
    && /plannedStockSell:\s*\(a as any\)\.plannedStockSell/.test(dashPageSrc));
assert('Dashboard forwards stockDCAOutflow/cryptoDCAOutflow to reconciliation trace',
  /stockDCAOutflow:\s*\(a as any\)\.stockDCAOutflow/.test(dashPageSrc)
    && /cryptoDCAOutflow:\s*\(a as any\)\.cryptoDCAOutflow/.test(dashPageSrc));
// Year-End Wealth Position pass-through from YearlyProjection.
assert('Dashboard builds a per-year projection lookup for the reconciliation trace',
  /projByYear|projRow\?\.cash/.test(dashPageSrc));
assert('Dashboard forwards wealthCash / wealthStocks / wealthCrypto to reconciliation trace',
  /wealthCash:\s*projRow\?\.cash/.test(dashPageSrc)
    && /wealthStocks:\s*projRow\?\.stockValue/.test(dashPageSrc)
    && /wealthCrypto:\s*projRow\?\.cryptoValue/.test(dashPageSrc));
assert('Dashboard forwards wealthPropertyEquity / wealthAccessibleNetWorth / wealthTotalNetWorth',
  /wealthPropertyEquity:\s*projRow\?\.propertyEquity/.test(dashPageSrc)
    && /wealthAccessibleNetWorth:\s*projRow\?\.accessibleNetWorth/.test(dashPageSrc)
    && /wealthTotalNetWorth:\s*projRow\?\.endNetWorth/.test(dashPageSrc));
assert('Dashboard forwards priorYearAccessibleNetWorth for Δ comparison',
  /priorYearAccessibleNetWorth:\s*priorProjRow\?\.accessibleNetWorth/.test(dashPageSrc));
// Engine guard — the trace file lives in /auditMode/ and only consumes
// pre-computed rows. It must NOT import any canonical engine module; the
// references to `buildCashFlowSeries` / `projectNetWorth` in JSDoc and
// `source:` strings are documentation-only.
const reconTraceSrc = await (await import('node:fs')).promises.readFile(
  'client/src/lib/auditMode/engineTraces/cashflowReconciliationTraces.ts', 'utf8');
const reconImportLines = reconTraceSrc.split('\n').filter(l => /^\s*import\b/.test(l)).join('\n');
assert('Trace file does not import finance / forecastEngine / monteCarlo modules',
  !/from\s+['"][^'"]*\/(finance|forecastEngine|monteCarloEngine|forecastEngineRegimeAware)['"]/.test(reconImportLines));
// Stripping JSDoc + double-quoted strings leaves only executable code; the
// trace must not call any engine entry-point there.
const codeOnly = reconTraceSrc
  .replace(/\/\*\*[\s\S]*?\*\//g, '')   // JSDoc blocks
  .replace(/\/\/[^\n]*/g, '')           // single-line comments
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')  // double-quoted strings
  .replace(/'(?:[^'\\]|\\.)*'/g, "''"); // single-quoted strings
assert('Trace executable code does not invoke buildCashFlowSeries() or projectNetWorth()',
  !/\bbuildCashFlowSeries\s*\(/.test(codeOnly) && !/\bprojectNetWorth\s*\(/.test(codeOnly));

// ─── 16. ExecutiveDashboard renders the native reconciliation chip row ──────

section('16. ExecutiveDashboard renders Cashflow Reconciliation chip row');
const dashSrc2 = await (await import('node:fs')).promises.readFile(
  'client/src/components/ExecutiveDashboard.tsx', 'utf8');
assert('Imports cashflowReconciliationTraceId',
  /cashflowReconciliationTraceId/.test(dashSrc2));
assert('Renders a dedicated reconciliation audit row',
  /plan-execution-reconciliation-row/.test(dashSrc2));
assert('Reconciliation chip uses cashflowReconciliationTraceId(yr)',
  /cashflowReconciliationTraceId\(yr\)/.test(dashSrc2));
assert('Reconciliation chip is a real <button> in Audit Mode',
  /audit-metric-cashflow-reconciliation-\$\{yr\}|audit-metric-cashflow-reconciliation-/.test(dashSrc2));
assert('Reconciliation chip click calls auditCtx.openTrace(traceId)',
  /Open Cashflow Reconciliation trace for/.test(dashSrc2)
    && /onClick=\{[\s\S]{0,100}handleOpen\(\)/.test(dashSrc2));
assert('Reconciliation chip stops propagation',
  /onClick=\{\s*\(e\)\s*=>\s*\{[^}]*e\.stopPropagation\(\);[^}]*handleOpen\(\)/.test(dashSrc2));
assert('Reconciliation chip overrides touch-action / tap-highlight for iOS Safari',
  /touchAction:\s*'manipulation'[\s\S]*WebkitTapHighlightColor:\s*'transparent'/.test(dashSrc2));
assert('Reconciliation row supports every year (not just acquisition years)',
  /Reconciliation supports every year/i.test(dashSrc2));

// ── 16.b — CASH BY YEAR row also renders every year (QA fix) ───────────────
// Before this fix the row only rendered acquisition years + final year, so
// 2028 was missing for users whose trajectory had IP1 in 2026 and IP2 in 2028
// — the chip simply did not exist to be clickable. The fix unions every
// visible cashflow year, not only acquisition years.
// #FWL_CashByYear_Render_Every_Year
assert('Cash-by-year row enumerates every year in trajectory (not just acquisition)',
  /render a chip for EVERY visible cashflow year/.test(dashSrc2)
    && /const allYears = traj/.test(dashSrc2));
// Defensive check — the previous bug was hard-coded as
// `const acquisitionYears = traj.filter(...).filter(pt.isAcquisitionYear)`
// gating the chip set. Ensure that gating pattern is gone.
assert('Cash-by-year row no longer filters by isAcquisitionYear for membership',
  !/const acquisitionYears = traj\s*\n\s*\.filter\(\([^)]+\) =>\s*pt\.isAcquisitionYear/.test(dashSrc2));

// ─── 17. Engine surfaces line items needed by the reconciliation trace ──────

section('17. Engine surfaces rentalIncomeByProperty + propertyHoldingCost on annual roll-up');
if (y2028) {
  const ribp = (y2028 as any).rentalIncomeByProperty;
  assert('CashFlowYear exposes rentalIncomeByProperty',
    ribp && typeof ribp === 'object');
  // 2028 has IP1 active full year and IP2 from July → both have non-zero rental.
  if (ribp) {
    const keys = Object.keys(ribp);
    assert(`rentalIncomeByProperty includes entries for both IPs (got keys: ${keys.join(',')})`,
      keys.length >= 2);
    assert('IP1 rental in 2028 > $0',
      Object.values(ribp).some((v: any) => Number(v) > 0));
  }
  assert('CashFlowYear exposes propertyHoldingCost',
    typeof (y2028 as any).propertyHoldingCost === 'number');
}

section('18. Cashflow Reconciliation — per-IP rental rows use friendly property labels');
// Regression for the confusing "Rental income — IP 3" label, where 3 was the
// internal Supabase sf_properties.id. With propertyLabels supplied, each row
// should render the friendly "IP N: <name>" label; the internal id stays in
// the row's `source` as the technical key. Without propertyLabels, rows fall
// back to the legacy "IP <id>" rendering — proving the change is opt-in and
// existing callers/tests are not disturbed.
{
  const reconWithLabels = buildCashflowReconciliationTrace({
    year: 2028,
    openingCash: 0,
    closingCash: 0,
    netCashflow: 0,
    salaryIncome: 0,
    rentalIncomeByProperty: { '3': 14_043, '7': 9_021 },
    propertyLabels: {
      '3': 'IP 1: New Investment Property',
      '7': 'IP 2: New Investment Property 2',
    },
    rentalIncomeTotal: 23_064,
    taxRefund: 0,
    livingExpenses: 0,
    pporMortgage: 0,
    investmentLoanRepayment: 0,
    billsOutflow: 0,
    acquisitionCashUsed: 0,
    assetSalesUsed: 0,
    acquisitionBuyingCosts: 0,
    propertyHoldingCost: 0,
    equityReleased: 0,
    isAcquisitionYear: false,
  });

  const labels = reconWithLabels.inputs.map((i) => i.label);
  assert('Friendly label "Rental income — IP 1: New Investment Property" is rendered',
    labels.includes('Rental income — IP 1: New Investment Property'));
  assert('Friendly label "Rental income — IP 2: New Investment Property 2" is rendered',
    labels.includes('Rental income — IP 2: New Investment Property 2'));
  assert('Internal id no longer appears as the main rental label',
    !labels.includes('Rental income — IP 3') && !labels.includes('Rental income — IP 7'));

  // IP 1 row must appear before IP 2 row (sorted by friendly numbering).
  const idx1 = labels.indexOf('Rental income — IP 1: New Investment Property');
  const idx2 = labels.indexOf('Rental income — IP 2: New Investment Property 2');
  assert('Friendly rental rows are ordered IP 1 → IP 2', idx1 >= 0 && idx2 > idx1);

  // Internal Supabase id is still carried in the row's `source` as the
  // technical key so audit/provenance can be traced back to the engine.
  const ip1Row = reconWithLabels.inputs.find(
    (i) => i.label === 'Rental income — IP 1: New Investment Property',
  );
  assert('Friendly row keeps internal Supabase id in `source`',
    typeof ip1Row?.source === 'string' && /internal id 3/.test(ip1Row.source));

  // Backwards-compat: without propertyLabels, the legacy "IP <id>" label
  // is preserved so any existing caller/test that does not supply the map
  // continues to render as before.
  const reconLegacy = buildCashflowReconciliationTrace({
    year: 2028,
    openingCash: 0,
    closingCash: 0,
    netCashflow: 0,
    salaryIncome: 0,
    rentalIncomeByProperty: { '3': 14_043 },
    rentalIncomeTotal: 14_043,
    taxRefund: 0,
    livingExpenses: 0,
    pporMortgage: 0,
    investmentLoanRepayment: 0,
    billsOutflow: 0,
    acquisitionCashUsed: 0,
    assetSalesUsed: 0,
    acquisitionBuyingCosts: 0,
    propertyHoldingCost: 0,
    equityReleased: 0,
    isAcquisitionYear: false,
  });
  assert('Legacy "Rental income — IP <id>" label preserved when no propertyLabels supplied',
    reconLegacy.inputs.some((i) => i.label === 'Rental income — IP 3'));
}

// ─── Summary ─────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✓ All cashflow chart / funding source regression checks passed`);
}
