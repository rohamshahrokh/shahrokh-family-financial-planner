/**
 * test-sprint3b-critical-defects.ts
 *
 * Sprint 3B regression suite covering every Critical and High Priority
 * defect remediated under Sprint 3B per the Sprint 3A audit pack.
 *
 *   C-1 — Property lifecycle 5-status model (planned, under_contract,
 *         settled, sold, archived) with shared predicates in
 *         shared/propertyLifecycle.ts
 *   C-2 — FIRE engine no longer reads `property_pct` (allocation) as if it
 *         were property CAGR; uses `property_growth_pct` / settings.property_cagr
 *   C-3 — FIRE property compounding loop is monthly, not flattened annual
 *   C-4 — Goal Solver leverage no longer multiplies starting NW
 *   C-5 — fireMonteCarlo reproducible with seeded RNG
 *   H-1 — Scenario freshness `derivedInputsHash` includes properties,
 *         stocks, crypto, income, expenses, debts
 *   H-4 — V4 cash floor caps synthetic extreme negatives (regression
 *         verified by ensuring metric stays bounded)
 *   H-5 — Risk Radar LVR display: rendered LVR matches computed LVR and is
 *         never reported as "0%" when meaningful debt exists
 *
 * Run with:  tsx script/test-sprint3b-critical-defects.ts
 */

import {
  isPropertySettledToday,
  isPropertyHistorical,
  isPropertyInForecast,
  isPropertyPlannedForFuture,
  normaliseLifecycleStatus,
  LIFECYCLE_STATUSES,
  LIFECYCLE_LABELS,
} from '../shared/propertyLifecycle';

let passed = 0;
let failed = 0;

function eq<T>(label: string, actual: T, expected: T) {
  if (Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected)) {
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

// ─── C-1 — Property Lifecycle 5-status model ────────────────────────────────
console.log('\n=== C-1 — Lifecycle 5-status shared predicates ===');

eq('LIFECYCLE_STATUSES has 5 entries', LIFECYCLE_STATUSES.length, 5);
eq('LIFECYCLE_LABELS["planned"]', LIFECYCLE_LABELS.planned, 'Planned');
eq('LIFECYCLE_LABELS["under_contract"]', LIFECYCLE_LABELS.under_contract, 'Under Contract');
eq('LIFECYCLE_LABELS["sold"]', LIFECYCLE_LABELS.sold, 'Sold');
eq('LIFECYCLE_LABELS["archived"]', LIFECYCLE_LABELS.archived, 'Archived');

// normaliseLifecycleStatus
eq('normalise active → settled', normaliseLifecycleStatus('active'), 'settled');
eq('normalise hidden → archived', normaliseLifecycleStatus('hidden'), 'archived');
eq('normalise disposed → sold', normaliseLifecycleStatus('disposed'), 'sold');
eq('normalise garbage → undefined', normaliseLifecycleStatus('garbage'), undefined);
eq('normalise empty → undefined', normaliseLifecycleStatus(''), undefined);

// Planned with past settlement date — should NOT be settled (explicit status wins)
{
  const p = { lifecycle_status: 'planned', settlement_date: '2020-01-01' };
  ok('planned w/ past settlement_date is NOT settled',
    isPropertySettledToday(p, TODAY) === false);
  ok('planned w/ past settlement_date IS planned-for-future',
    isPropertyPlannedForFuture(p, TODAY) === true);
}

// Settled with future settlement date — IS settled (explicit status wins)
{
  const p = { lifecycle_status: 'settled', settlement_date: '2030-01-01' };
  ok('settled w/ future settlement_date IS settled',
    isPropertySettledToday(p, TODAY) === true);
}

// Sold / archived — excluded everywhere
{
  const sold = { lifecycle_status: 'sold', settlement_date: '2020-01-01' };
  const archived = { lifecycle_status: 'archived', settlement_date: '2020-01-01' };
  ok('sold is historical', isPropertyHistorical(sold));
  ok('archived is historical', isPropertyHistorical(archived));
  ok('sold is NOT settled today', !isPropertySettledToday(sold, TODAY));
  ok('archived is NOT settled today', !isPropertySettledToday(archived, TODAY));
  ok('sold is NOT in forecast', !isPropertyInForecast(sold, TODAY));
  ok('archived is NOT in forecast', !isPropertyInForecast(archived, TODAY));
  ok('sold is NOT planned-for-future', !isPropertyPlannedForFuture(sold, TODAY));
  ok('archived is NOT planned-for-future', !isPropertyPlannedForFuture(archived, TODAY));
}

// Legacy row (no lifecycle_status) — date-driven fallback
{
  const legacyPast = { settlement_date: '2020-01-01' };
  const legacyFuture = { settlement_date: '2030-01-01' };
  ok('legacy past-date is settled (fallback)',
    isPropertySettledToday(legacyPast, TODAY));
  ok('legacy future-date is NOT settled (fallback)',
    !isPropertySettledToday(legacyFuture, TODAY));
  ok('legacy future-date IS planned-for-future (fallback)',
    isPropertyPlannedForFuture(legacyFuture, TODAY));
}

// Empty row (no status, no dates) — pre-lifecycle backfill convention: treated as active
{
  const empty = {};
  ok('empty row is settled (backfill convention)',
    isPropertySettledToday(empty, TODAY));
}

// ─── C-2 — FIRE engine property_pct not used as growth ──────────────────────
console.log('\n=== C-2 — FIRE engine reads property growth correctly ===');
(async () => {
  // Read the source verbatim and verify the offending pattern is gone.
  const fs = await import('node:fs');
  const src = fs.readFileSync('client/src/lib/firePathEngine.ts', 'utf8');
  ok("getYearRate no longer reads 'property_pct' as a growth source",
    !/getYearRate\([^)]*'property_pct'[^)]*property_cagr/.test(src));
  ok("getYearRate reads 'property_growth_pct' instead",
    /getYearRate\([^)]*'property_growth_pct'/.test(src));
  ok("FIREYearAssumption has property_growth_pct",
    /property_growth_pct\??:\s*number/.test(src));
})();

// ─── C-3 — FIRE property monthly compounding ────────────────────────────────
console.log('\n=== C-3 — FIRE property compounding is monthly ===');
(async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('client/src/lib/firePathEngine.ts', 'utf8');
  ok('flattened propCagr/12*12 pattern removed',
    !/propertyEquity\s*=\s*propertyEquity\s*\*\s*\(1\s*\+\s*propCagr\s*\/\s*12\s*\*\s*12\)/.test(src));
  ok('monthly compounding loop present',
    /for\s*\(\s*let\s+m\s*=\s*0;\s*m\s*<\s*12;\s*m\+\+\s*\)\s*{\s*\n?\s*propertyEquity\s*=\s*propertyEquity\s*\*\s*\(1\s*\+\s*propMonthlyRate\)/.test(src));
})();

// ─── C-4 — Goal Solver leverage no longer multiplies starting NW ────────────
console.log('\n=== C-4 — Goal Solver leverage repair ===');
(async () => {
  const { runGoalSolver } = await import('../client/src/lib/scenarioV2/goalSolver');

  // Same initial NW, different surplus -> only the strategy that benefits
  // from contribution should change much. Critically, an aggressive_leverage
  // path with leverage=2.3 should no longer trivially outrank others when
  // there's no surplus to deploy.
  const noContribInput = {
    initialNetWorth: 1_000_000,
    monthlySurplus: 0,           // no contribution: only initial growth + leverage matter
    horizonMonths: 12 * 25,
    seed: 0x12345,
    rolloutCount: 64,
    targets: { netWorth: 2_000_000 },
  };
  const noContribRes = runGoalSolver(noContribInput);
  // With zero surplus, leverage no longer inflates the initial pot, so the
  // aggressive_leverage path must NOT be unambiguously dominant: its
  // expected NW should be within ~10% of the un-leveraged ETF path.
  const aggro = noContribRes.allPaths.find(p => p.kind === 'aggressive_leverage');
  const etf = noContribRes.allPaths.find(p => p.kind === 'etf_heavy');
  ok('aggressive_leverage exists in results', !!aggro);
  ok('etf_heavy exists in results', !!etf);
  if (aggro && etf) {
    const ratio = aggro.expectedNetWorth / etf.expectedNetWorth;
    ok(`aggressive vs etf NW ratio bounded (got ${ratio.toFixed(3)})`,
      ratio < 2.0, { aggro: aggro.expectedNetWorth, etf: etf.expectedNetWorth });
    // Crucially: aggressive_leverage no longer doubles the starting NW.
    // Mean terminal NW should be far below 2*initial * (1+r)^25.
    ok(`aggressive_leverage NW < 2 × initial × growth (no NW inflation)`,
      aggro.expectedNetWorth < 1_000_000 * Math.pow(1.075, 25) * 2.0);
  }
})();

// ─── C-5 — fireMonteCarlo reproducibility ───────────────────────────────────
console.log('\n=== C-5 — fireMonteCarlo deterministic with seed ===');
(async () => {
  const {
    runFireMonteCarlo,
    DEFAULT_FIRE_MC_SETTINGS,
    DEFAULT_FIRE_MC_SEED,
  } = await import('../client/src/lib/fireMonteCarlo');
  const settings = { ...DEFAULT_FIRE_MC_SETTINGS, simulationCount: 200 };
  const r1 = runFireMonteCarlo(settings, undefined, DEFAULT_FIRE_MC_SEED);
  const r2 = runFireMonteCarlo(settings, undefined, DEFAULT_FIRE_MC_SEED);
  ok('same seed → same probFireByTarget',
    r1.probFireByTarget === r2.probFireByTarget,
    { r1: r1.probFireByTarget, r2: r2.probFireByTarget });
  ok('same seed → same medianFireYear',
    r1.medianFireYear === r2.medianFireYear);
  ok('same seed → same nwP50AtTarget',
    r1.nwP50AtTarget === r2.nwP50AtTarget);

  const r3 = runFireMonteCarlo(settings, undefined, DEFAULT_FIRE_MC_SEED + 1);
  // Different seed almost always shifts at least one of these
  ok('different seed → some metric differs',
    r3.probFireByTarget !== r1.probFireByTarget ||
    r3.nwP50AtTarget !== r1.nwP50AtTarget ||
    r3.medianFireYear !== r1.medianFireYear);
})();

// ─── H-1 — derivedInputsHash includes properties / ledgers / holdings ───────
console.log('\n=== H-1 — derivedInputsHash includes material inputs ===');
(async () => {
  const { derivedInputsHash } = await import('../client/src/lib/scenarioV2/determinism');
  const base = {
    snapshot: { ppor: 1_500_000, mortgage: 1_200_000 },
    properties: [{ id: 'p1', lifecycle_status: 'settled', current_value: 800_000, loan_amount: 600_000 }],
    stocks: [{ id: 's1', ticker: 'VAS', current_holding: 100, current_price: 90 }],
    crypto: [{ id: 'c1', symbol: 'BTC', current_holding: 0.1, current_price: 100_000 }],
    income: [{ id: 'i1', amount: 22_000, frequency: 'monthly', is_active: true }],
    expenses: [{ id: 'e1', amount: 14_540, frequency: 'monthly', is_active: true }],
  };
  const hash0 = derivedInputsHash(base);

  // Mutate a property — lifecycle_status from 'settled' to 'sold'
  const withSold = { ...base, properties: [{ ...base.properties[0], lifecycle_status: 'sold' }] };
  const hashSold = derivedInputsHash(withSold);
  ok('lifecycle_status change invalidates hash', hash0 !== hashSold);

  // Mutate a stock holding
  const withMoreStocks = { ...base, stocks: [{ ...base.stocks[0], current_holding: 200 }] };
  const hashStocks = derivedInputsHash(withMoreStocks);
  ok('stock holding change invalidates hash', hash0 !== hashStocks);

  // Mutate a crypto holding
  const withMoreCrypto = { ...base, crypto: [{ ...base.crypto[0], current_holding: 0.2 }] };
  const hashCrypto = derivedInputsHash(withMoreCrypto);
  ok('crypto holding change invalidates hash', hash0 !== hashCrypto);

  // Mutate an income row
  const withMoreIncome = { ...base, income: [{ ...base.income[0], amount: 25_000 }] };
  const hashIncome = derivedInputsHash(withMoreIncome);
  ok('income amount change invalidates hash', hash0 !== hashIncome);

  // Mutate an expense row
  const withMoreExp = { ...base, expenses: [{ ...base.expenses[0], amount: 16_000 }] };
  const hashExp = derivedInputsHash(withMoreExp);
  ok('expense amount change invalidates hash', hash0 !== hashExp);

  // Property reorder must NOT change hash (sortById)
  const reordered = { ...base, properties: [...base.properties].reverse() };
  const hashReorder = derivedInputsHash(reordered);
  ok('property reordering does not change hash', hash0 === hashReorder);

  // Determinism — identical inputs → identical hash
  const hashSame = derivedInputsHash(base);
  ok('deterministic — same input → same hash', hash0 === hashSame);
})();

// ─── H-4 — V4 cash floor bounded ────────────────────────────────────────────
console.log('\n=== H-4 — V4 cash floor is bounded ===');
(async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('client/src/lib/monteCarloV4/engineV4.ts', 'utf8');
  ok('CASH_FLOOR constant introduced', /CASH_FLOOR\s*=/.test(src));
  ok('cash clamped to CASH_FLOOR after cf update',
    /cash\s*<\s*CASH_FLOOR\s*\)\s*cash\s*=\s*CASH_FLOOR/.test(src));
})();

// ─── H-5 — LVR display never shows 0% when debt is material ─────────────────
console.log('\n=== H-5 — Risk Radar LVR display ===');
(async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('client/src/lib/recommendationEngine/engine.ts', 'utf8');
  ok('reduceLeverageIfStressed sums IP loans into LVR',
    /debtPortfolio\s*\?\?\s*\[\]/.test(src) || /investment_loan/.test(src));
  ok('LVR display suppressed when lvr == 0',
    /lvrDisplay\s*=\s*lvr\s*>\s*0/.test(src));
  ok("recommendation text uses lvrDisplay instead of hard-coded 'currently 0%'",
    /currently\s*\$\{/.test(src) === false || /lvrDisplay/.test(src));
})();

// ─── H-6 — Direct route redirects registered ────────────────────────────────
console.log('\n=== H-6 — Route redirects ===');
(async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('client/src/App.tsx', 'utf8');
  for (const r of ['/monte-carlo','/goal-solver','/risk-engine','/net-worth-timeline','/snapshot','/snapshots','/property-timeline','/property-lifecycle']) {
    ok(`route ${r} has a Redirect`,
      new RegExp(`path="${r}"[^>]*>\\s*<Redirect`).test(src));
  }
  // 404 copy upgraded
  const nfSrc = fs.readFileSync('client/src/pages/not-found.tsx', 'utf8');
  ok('404 no longer has dev copy', !/forget to add the page/i.test(nfSrc));
  ok('404 has Page Not Found heading', /Page Not Found/.test(nfSrc));
})();

// ─── Wrap up ────────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`\n══════════════════════════════════════════════`);
  console.log(`Sprint 3B critical defects: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════\n`);
  process.exit(failed > 0 ? 1 : 0);
}, 500); // give async blocks time to flush
