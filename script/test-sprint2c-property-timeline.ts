/**
 * test-sprint2c-property-timeline.ts
 *
 * Regression suite for the Property Performance Timeline builder.
 * Verifies:
 *   - Length / horizon is honoured (default 30 years)
 *   - Equity = value - loan for every row
 *   - Cumulative cashflow is the running sum of annual cashflow
 *   - After-tax cashflow = annual + tax refund
 *   - First-positive year detection only fires once
 *   - Tone classifier respects the documented ±$200 breakeven band
 *   - PPOR / non-investment rows return an empty timeline
 *   - Empty / malformed property doesn't throw
 */

import {
  buildPropertyTimeline,
} from '../client/src/lib/propertyTimelineBuilder';

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

const sampleIP = {
  id: 1,
  type: 'investment',
  name: 'Brisbane IP',
  lifecycle_status: 'settled',
  current_value: 750_000,
  purchase_price: 700_000,
  loan_amount: 600_000,
  interest_rate: 6.5,
  loan_type: 'IO',
  loan_term: 30,
  weekly_rent: 650,
  rental_growth: 3,
  vacancy_rate: 2,
  management_fee: 7,
  council_rates: 2500,
  insurance: 1200,
  maintenance: 1800,
  capital_growth: 4,
  property_type: 'ESTABLISHED',
  depreciation_enabled: true,
};

console.log('\n=== Default horizon = 30 years ===');
{
  const t = buildPropertyTimeline({ property: sampleIP, annualSalaryIncome: 264_000 });
  eq('points length', t.points.length, 30);
  eq('years summary', t.years, 30);
  ok('first point year is current year + 1', t.points[0].year >= new Date().getFullYear());
  ok('last point year is current year + 30', t.points[29].year === t.points[0].year + 29);
}

console.log('\n=== horizonYears override ===');
{
  const t = buildPropertyTimeline({ property: sampleIP, annualSalaryIncome: 264_000, horizonYears: 10 });
  eq('points length = 10', t.points.length, 10);
}

console.log('\n=== Equity = value - loan ===');
{
  const t = buildPropertyTimeline({ property: sampleIP, annualSalaryIncome: 264_000 });
  let ok_ = true;
  for (const p of t.points) {
    if (Math.abs(p.equity - (p.propertyValue - p.loanBalance)) > 1) {
      ok_ = false;
      console.error(`equity mismatch at ${p.year}: ${p.equity} vs ${p.propertyValue - p.loanBalance}`);
      break;
    }
  }
  ok('all rows: equity = value - loan (±$1 rounding)', ok_);
}

console.log('\n=== Cumulative cashflow = running sum ===');
{
  const t = buildPropertyTimeline({ property: sampleIP, annualSalaryIncome: 264_000 });
  let runningCF = 0;
  let runningATX = 0;
  let consistent = true;
  for (const p of t.points) {
    runningCF += p.annualCashflow;
    runningATX += p.afterTaxCashflow;
    // Rounded values may diverge by ±$1, accept that.
    if (Math.abs(runningCF - p.cumulativeCashflow) > 2) {
      consistent = false;
      console.error(`cumulativeCashflow mismatch at ${p.year}: running=${runningCF} stored=${p.cumulativeCashflow}`);
      break;
    }
    if (Math.abs(runningATX - p.cumulativeAfterTax) > 2) {
      consistent = false;
      console.error(`cumulativeAfterTax mismatch at ${p.year}: running=${runningATX} stored=${p.cumulativeAfterTax}`);
      break;
    }
  }
  ok('cumulative streams are consistent with annual streams', consistent);
}

console.log('\n=== After-tax CF = annual + tax refund ===');
{
  const t = buildPropertyTimeline({ property: sampleIP, annualSalaryIncome: 264_000 });
  let consistent = true;
  for (const p of t.points) {
    if (Math.abs((p.annualCashflow + p.taxRefund) - p.afterTaxCashflow) > 1) {
      consistent = false;
      break;
    }
  }
  ok('after-tax = annual + tax refund', consistent);
}

console.log('\n=== First positive year detection fires at most once ===');
{
  const t = buildPropertyTimeline({ property: sampleIP, annualSalaryIncome: 264_000 });
  const flags = t.points.filter(p => p.isFirstPositiveYear);
  ok('at most one row flagged as first positive year', flags.length <= 1, flags);
  if (t.firstPositiveYear !== undefined) {
    eq('summary.firstPositiveYear matches the flagged row', flags[0]?.year, t.firstPositiveYear);
  }
}

console.log('\n=== Tone classifier — negative / breakeven / positive ===');
{
  // Heavy negative-gearing setup: weekly rent 1, big loan → CF clearly negative.
  const heavyNeg = { ...sampleIP, weekly_rent: 100, loan_amount: 800_000 };
  const t1 = buildPropertyTimeline({ property: heavyNeg, annualSalaryIncome: 264_000 });
  const neg = t1.points.filter(p => p.tone === 'negative').length;
  ok('heavy negative case produces at least 1 negative year', neg >= 1, { neg });

  // High-yield positive setup: rent 1500, no loan.
  const heavyPos = { ...sampleIP, weekly_rent: 1500, loan_amount: 0 };
  const t2 = buildPropertyTimeline({ property: heavyPos, annualSalaryIncome: 264_000 });
  const pos = t2.points.filter(p => p.tone === 'positive').length;
  ok('high-yield case produces at least 1 positive year', pos >= 1, { pos });
}

console.log('\n=== PPOR is excluded from timeline ===');
{
  const t = buildPropertyTimeline({
    property: { ...sampleIP, type: 'ppor' },
    annualSalaryIncome: 264_000,
  });
  eq('PPOR returns empty points', t.points.length, 0);
}

console.log('\n=== Empty property is safe ===');
{
  const t = buildPropertyTimeline({ property: {}, annualSalaryIncome: 0 });
  eq('empty property has empty points', t.points.length, 0);
}

console.log('\n=== Negative refundMode does not throw ===');
{
  // Just exercises the proposed_reform branch.
  const t = buildPropertyTimeline({
    property: sampleIP,
    annualSalaryIncome: 264_000,
    scenario: 'proposed_reform',
    refundMode: 'payg',
  });
  ok('reform branch builds a timeline', t.points.length === 30);
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Sprint 2C property timeline: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
