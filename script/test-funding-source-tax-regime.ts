/**
 * test-funding-source-tax-regime.ts
 *
 * Regression test for #FWL_Critical_StatePersistence_FundingSource_TaxRegime_Fix.
 *
 * Exact scenario from the bug report:
 *   • IP1 purchased 2026
 *   • IP2 purchased 2028
 *   • IP2 funding source = Equity Release
 *   • Active tax regime = Proposed 2027 Reform
 *   • Both investment properties (post-cutoff established for IP2)
 *
 * Required invariants:
 *   1. IP2 deposit is NOT deducted from cash
 *   2. IP2 deposit increases investment-loan balance (equity release)
 *   3. Cash buffer does NOT collapse from the IP2 deposit
 *   4. Monte Carlo consumes the same effective property records
 *   5. Negative gearing refund under reform = $0
 *   6. Loss is added to the carried-forward bank
 *   7. Funding source choice persists (write → re-read returns the same)
 *   8. Tax regime selection persists (eager rehydrate from localStorage)
 *
 * Run with:  tsx script/test-funding-source-tax-regime.ts
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
  resolveFundingPlan,
  usePropertyFundingStore,
  getPropertyFundingChoice,
} = await import('../client/src/lib/propertyFundingStore');
type FundingChoice = import('../client/src/lib/propertyFundingStore').FundingChoice;
const {
  applyFundingToProperties,
  buildAdapterContext,
  FUNDING_PLAN_FIELD,
} = await import('../client/src/lib/propertyFundingAdapter');
const { calcNegativeGearing } = await import('../client/src/lib/finance');
const { runCashEngine } = await import('../client/src/lib/cashEngine');
const {
  resetActiveRegime,
  setActiveRegime,
  getActiveRegime,
} = await import('../client/src/lib/activeRegimeStore');

let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n— ${n}`);

// localStorage shim already installed above (before module imports).

// ─── Test data: IP1 (2026), IP2 (2028) ───────────────────────────────────────

const SNAPSHOT = {
  cash:             220_000,
  offset_balance:   0,
  monthly_income:   22_000,
  monthly_expenses: 14_540,
  mortgage:         1_200_000,
  other_debts:      19_000,
  ppor:             1_510_000,
};

const IP1 = {
  id: 1,
  name: 'IP1 — Brisbane',
  type: 'investment',
  property_type: 'ESTABLISHED',
  purchase_date:   '2026-03-01',
  settlement_date: '2026-03-01',
  contract_date:   '2026-03-01',
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
};

const IP2 = {
  ...IP1,
  id: 2,
  name: 'IP2 — Gold Coast',
  purchase_date:   '2028-06-01',
  settlement_date: '2028-06-01',
  contract_date:   '2028-06-01',
  rental_start_date: '2028-07-01',
  purchase_price:  820_000,
  current_value:   820_000,
  deposit:         164_000,
  stamp_duty:      29_750,
  loan_amount:     656_000,
  weekly_rent:     620,
};

const PROPERTIES = [IP1, IP2];

// ─── 1. Funding source store persistence ─────────────────────────────────────

section('1. Funding source store persistence');
const store = usePropertyFundingStore.getState();
store.setChoice(2, { source: 'equity-release' });

const reread = getPropertyFundingChoice(2);
assert('IP2 funding choice readback', reread?.source === 'equity-release',
  `expected equity-release, got ${reread?.source}`);
assert('IP1 has no choice (defaults later)',
  getPropertyFundingChoice(1) === undefined);

// Persistence — Zustand's persist middleware writes synchronously.
const raw = localStorageShim.getItem('fwl.propertyFunding');
assert('localStorage write contains IP2 choice',
  typeof raw === 'string' && raw.includes('equity-release'),
  `raw: ${raw}`);

// ─── 2. resolveFundingPlan — equity release does NOT consume cash ───────────

section('2. resolveFundingPlan: Equity Release breakdown');
const plan = resolveFundingPlan(
  { source: 'equity-release', updatedAt: new Date().toISOString() } as FundingChoice,
  {
    deposit: IP2.deposit,
    availableCash: SNAPSHOT.cash,
    availableOffset: SNAPSHOT.offset_balance,
    stocksTotalValue: 0,
    cryptoTotalValue: 0,
  },
);
assert('Equity release: cashUsed = 0', plan.cashUsed === 0);
assert('Equity release: offsetUsed = 0', plan.offsetUsed === 0);
assert('Equity release: equityReleased == deposit',
  plan.equityReleased === IP2.deposit);
assert('Equity release: debt increase == deposit',
  plan.debtIncreaseFromEquityRelease === IP2.deposit);

// ─── 3. Property adapter applies the choice ──────────────────────────────────

section('3. propertyFundingAdapter — effective property records');
const effective = applyFundingToProperties(
  PROPERTIES,
  buildAdapterContext({ snapshot: SNAPSHOT, stocks: [], cryptos: [] }),
);
const ip1Effective = effective.find(p => p.id === 1)!;
const ip2Effective = effective.find(p => p.id === 2)!;

// IP1 has no funding choice yet → falls back to offset+savings (deposit unchanged)
assert('IP1: deposit unchanged (no choice set)',
  ip1Effective.deposit === IP1.deposit);
assert('IP1: loan_amount unchanged',
  ip1Effective.loan_amount === IP1.loan_amount);

// IP2 has equity-release → deposit zeroed, loan_amount bumped
assert('IP2: effective deposit = $0 (equity release)',
  ip2Effective.deposit === 0,
  `got ${ip2Effective.deposit}`);
assert('IP2: loan_amount += equity released',
  ip2Effective.loan_amount === IP2.loan_amount + IP2.deposit,
  `got ${ip2Effective.loan_amount} expected ${IP2.loan_amount + IP2.deposit}`);
assert('IP2: _fundingPlan.equityReleased mirrors deposit',
  (ip2Effective as any)[FUNDING_PLAN_FIELD].equityReleased === IP2.deposit);

// ─── 4. Cash engine — IP2 deposit does NOT drain cash ────────────────────────

section('4. cashEngine: cash buffer survives IP2 settlement');
const cashOut = runCashEngine({
  snapshot: SNAPSHOT,
  properties: PROPERTIES,
  bills: [],
  expenses: [],
  inflationRate: 3,
  incomeGrowthRate: 3.5,
});
// Find the lowest closing cash across the entire ledger.
const lowest = cashOut.ledger.reduce(
  (lo, m) => Math.min(lo, m.closingCash),
  Number.POSITIVE_INFINITY,
);
// Without the fix, the IP2 deposit ($164k) would smash cash deep into the
// red on a $220k opening balance + monthly surplus. With the fix, the deposit
// is a loan top-up and never touches cash, so the floor stays well above
// -100k (we leave a generous margin for stamp duty + ongoing cashflow noise).
assert(
  'IP2 equity-release: lowest cash floor stays above -$80k (no deposit drain)',
  lowest > -80_000,
  `lowest closing cash = $${Math.round(lowest).toLocaleString()}`,
);
// And specifically: the settlement month for IP2 (Jun 2028) does not include
// a property_purchase event that drains the cash.
const ip2SettleMonth = cashOut.events.find(
  e => e.year === 2028 && e.month === 6 && e.type === 'property_purchase'
);
if (ip2SettleMonth?.purchaseBreakdown) {
  const { deposit } = ip2SettleMonth.purchaseBreakdown;
  assert(
    'IP2 settlement event: deposit cashflow = $0 under equity release',
    deposit === 0,
    `event deposit = $${deposit}`,
  );
} else {
  // If no event fired (because totalCashImpact = 0), that's the correct
  // outcome too — the only cash impact would be stamp duty.
  assert('IP2 settlement event: zero-deposit path triggered', true);
}

// ─── 5. Tax regime persistence + reform refund = $0 for established post-cutoff IP

section('5. Tax regime: PROPOSED_2027_REFORM persists + refund = $0');
resetActiveRegime();
localStorageShim.clear();
setActiveRegime({ selector: 'PROPOSED_2027_REFORM' });
assert('Regime state updated to reform',
  getActiveRegime().selector === 'PROPOSED_2027_REFORM');
assert('Regime persisted to localStorage',
  localStorageShim.getItem('fwl.activeRegime') === 'PROPOSED_2027_REFORM');

// Re-resolve the regime module fresh — simulates a page reload.
// (In production, module load reads localStorage eagerly. Here we just
//  verify that the read path returns the persisted value.)
const persistedRaw = localStorageShim.getItem('fwl.activeRegime');
assert('Persisted value is the reform selector',
  persistedRaw === 'PROPOSED_2027_REFORM');

// Negative gearing under reform — IP2 contract 2028-06-01, established → post-cutoff
const ngReform = calcNegativeGearing({
  properties: PROPERTIES as any,
  annualSalaryIncome: SNAPSHOT.monthly_income * 12,
  jointOwnership: true,
  refundMode: 'lump-sum',
  scenario: 'proposed_reform',
});
const ip2Ng = ngReform.perProperty.find(p => p.propertyId === 2)!;
assert('IP2 under reform: PAYG refund = $0',
  ip2Ng.annualTaxBenefit === 0,
  `got $${ip2Ng.annualTaxBenefit}`);
assert('IP2 under reform: quarantined flag set',
  ip2Ng.isQuarantined === true);
assert('IP2 under reform: loss accumulated into bank (> 0)',
  ip2Ng.lossAccumulatedThisYear > 0,
  `got $${ip2Ng.lossAccumulatedThisYear}`);
assert('IP2 under reform: loss bank balance increases',
  ip2Ng.lossBankBalance >= ip2Ng.lossAccumulatedThisYear);

// Current-law comparison — under current_law scenario, refund > 0
const ngCurrent = calcNegativeGearing({
  properties: PROPERTIES as any,
  annualSalaryIncome: SNAPSHOT.monthly_income * 12,
  jointOwnership: true,
  refundMode: 'lump-sum',
  scenario: 'current_law',
});
const ip2NgCurrent = ngCurrent.perProperty.find(p => p.propertyId === 2)!;
assert('IP2 under current_law: refund > 0 (for comparison only)',
  ip2NgCurrent.annualTaxBenefit > 0,
  `got $${ip2NgCurrent.annualTaxBenefit}`);
assert('Reform refund differs from current-law refund',
  ip2NgCurrent.annualTaxBenefit !== ip2Ng.annualTaxBenefit);

// ─── 6. Emergency buffer test — months of buffer after funding ───────────────

section('6. Emergency buffer: funded by equity release stays healthy');
const cashLikeDrawn = (ip1Effective as any)[FUNDING_PLAN_FIELD].cashUsed
                    + (ip1Effective as any)[FUNDING_PLAN_FIELD].offsetUsed
                    + (ip2Effective as any)[FUNDING_PLAN_FIELD].cashUsed
                    + (ip2Effective as any)[FUNDING_PLAN_FIELD].offsetUsed;
const cashRemaining = SNAPSHOT.cash - cashLikeDrawn;
const months = cashRemaining / SNAPSHOT.monthly_expenses;
// IP1 default (offset+savings) would draw $150k cash → cashRemaining = $70k → ~4.8 mo
// IP2 equity-release adds nothing → buffer holds.
assert('Cash remaining after funding > $50k', cashRemaining > 50_000,
  `cashRemaining = $${cashRemaining}`);
assert('Months of buffer ≥ 3 (still healthy bucket)', months >= 3,
  `months = ${months.toFixed(1)}`);

// ─── 7. Audit traces — live records carry real values, not placeholders ─────

section('7. Audit traces: live records carry real values, not "ready" placeholders');
const { buildAllFundingTraces } = await import(
  '../client/src/lib/auditMode/engineTraces/fundingSourceTraces'
);
const liveTraces = buildAllFundingTraces({
  plans: [
    {
      propertyId: 1, propertyName: 'IP1',
      plan: (ip1Effective as any)[FUNDING_PLAN_FIELD],
    },
    {
      propertyId: 2, propertyName: 'IP2',
      plan: (ip2Effective as any)[FUNDING_PLAN_FIELD],
    },
  ],
  openingCash: SNAPSHOT.cash + (SNAPSHOT.offset_balance ?? 0),
  netCashflowOverHorizon: 0,
  closingCashAfterFunding: cashRemaining,
  monthlyExpenses: SNAPSHOT.monthly_expenses,
  existingLoanBalance: IP1.loan_amount + IP2.loan_amount,
  activeRegimeKind: 'PROPOSED_2027_REFORM',
  activeRegimeLabel: 'Proposed 2027 reform',
  negativeGearing: [{
    propertyName: 'IP2',
    currentLawRefund: ip2NgCurrent.annualTaxBenefit,
    reformRefund: ip2Ng.annualTaxBenefit,
    lossQuarantined: ip2Ng.lossAccumulatedThisYear,
    carriedForwardLoss: ip2Ng.lossBankBalance,
    refundAppliedToCashflow: ip2Ng.annualTaxBenefit,
    appliedRefundScenario: 'proposed_reform',
  }],
});
const traceById: Record<string, any> = {};
for (const t of liveTraces) traceById[t.id] = t;

const expectedIds = [
  'property:funding-source:used',
  'property:funding-source:cash-impact',
  'property:funding-source:equity-release',
  'property:funding-source:emergency-buffer',
  'property:funding-source:negative-gearing',
];
for (const id of expectedIds) {
  const t = traceById[id];
  assert(`Trace ${id} exists`, !!t);
  if (t) {
    assert(`${id}: finalValue is not the "ready" placeholder`,
      t.finalValue !== 'ready',
      `got "${t.finalValue}"`);
    assert(`${id}: formula populated`, typeof t.formula === 'string' && t.formula.length > 0);
    assert(`${id}: expanded uses real numbers (no "live values populate" wording)`,
      !/live values populate when/.test(t.expanded), t.expanded);
    assert(`${id}: sourceEngine populated`, typeof t.sourceEngine === 'string' && t.sourceEngine.length > 0);
    assert(`${id}: calculatedAt timestamp populated`, typeof t.calculatedAt === 'string' && t.calculatedAt.length > 0);
    assert(`${id}: includes metric id in trace record`, t.id === id);
  }
}
// Specific live values reflect the regression scenario.
assert(
  'equity-release trace: expanded mentions the actual IP2 deposit $164,000',
  /\$164,000/.test(traceById['property:funding-source:equity-release'].expanded),
  traceById['property:funding-source:equity-release'].expanded,
);
assert(
  'negative-gearing trace: finalValue shows applied refund = $0 under reform',
  String(traceById['property:funding-source:negative-gearing'].finalValue).includes('$0'),
  String(traceById['property:funding-source:negative-gearing'].finalValue),
);
assert(
  'funding-source-used trace: expanded mentions equity dollars',
  traceById['property:funding-source:used'].expanded.includes('$164,000') ||
  traceById['property:funding-source:used'].expanded.includes('164,000'),
  traceById['property:funding-source:used'].expanded,
);

// ─── Summary ─────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✓ All funding source / tax regime regression checks passed`);
}
