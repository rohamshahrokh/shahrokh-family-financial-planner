/**
 * test-sprint2c-decision-ux.ts
 *
 * Regression suite for the Sprint 2C Recommended Actions adapter.
 * Verifies:
 *   - Buy / Delay items are constructed from planned acquisitions
 *   - Confidence is clamped to 0-100%
 *   - Recommendation engine top priorities are merged in
 *   - Items are ordered proceed → delay → optimise → monitor
 *   - The adapter does not introduce new $ math (impact $ matches input $)
 *   - No actions ever leak duplicate ids
 *   - Risk level is mapped from underlying engine outputs
 */

import {
  buildRecommendedActions,
  visualClassForTone,
  tonePillLabel,
  tonePillEmoji,
} from '../client/src/lib/recommendedActionsAdapter';
import type { UnifiedRecommendationResult, Recommendation } from '../client/src/lib/recommendationEngine/types';

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

console.log('\n=== Buy action — formats title with month/year ===');
{
  const actions = buildRecommendedActions({
    plannedAcquisitions: [{
      name: 'IP #1',
      targetDate: '2026-07-01',
      netWorthDeltaAtHorizon: 1_100_000,
      liquidityStressAfter: 0.18,
      confidence: 0.78,
    }],
    horizonYear: 2035,
  });
  eq('1 action produced', actions.length, 1);
  const a = actions[0];
  eq('title', a.title, 'Buy IP #1 in Jul 2026');
  eq('tone', a.tone, 'proceed');
  ok('impact label matches horizon year', /\+\$1\.1M Net Worth by 2035/.test(a.impactLabel), a.impactLabel);
  eq('confidence', a.confidencePct, 78);
  eq('risk level', a.risk, 'Medium');
  ok('when label has month + year', a.whenLabel === 'Jul 2026', a.whenLabel);
}

console.log('\n=== Delay action — derived when delayUntil is provided ===');
{
  const actions = buildRecommendedActions({
    plannedAcquisitions: [{
      name: 'IP #2',
      targetDate: '2026-08-01',
      delayUntil: '2028-01-01',
      netWorthDeltaAtHorizon: 250_000,
      liquidityStressBefore: 0.12,
      liquidityStressAfter: 0.38,
      confidence: 0.65,
    }],
    horizonYear: 2035,
  });
  eq('1 action produced', actions.length, 1);
  const a = actions[0];
  eq('title', a.title, 'Delay IP #2 until 2028');
  eq('tone', a.tone, 'delay');
  ok('reason mentions liquidity stress %', /Liquidity stress 12% → 38%/.test(a.reason), a.reason);
  eq('risk = High under 38% stress',  a.risk, 'High');
  eq('confidence rounded to 65',       a.confidencePct, 65);
}

console.log('\n=== Confidence clamping ===');
{
  const a1 = buildRecommendedActions({
    plannedAcquisitions: [{ name: 'A', confidence: -0.5 }],
  })[0];
  eq('negative confidence → 0', a1.confidencePct, 0);

  const a2 = buildRecommendedActions({
    plannedAcquisitions: [{ name: 'B', confidence: 250 }],
  })[0];
  eq('out-of-range percent confidence → clamped to 100', a2.confidencePct, 100);

  const a3 = buildRecommendedActions({
    plannedAcquisitions: [{ name: 'C', confidence: 78 }],
  })[0];
  eq('already-percent confidence is preserved', a3.confidencePct, 78);
}

console.log('\n=== Risk level thresholds ===');
{
  const low  = buildRecommendedActions({ plannedAcquisitions: [{ name: 'L', liquidityStressAfter: 0.05 }] })[0];
  const med  = buildRecommendedActions({ plannedAcquisitions: [{ name: 'M', liquidityStressAfter: 0.20 }] })[0];
  const high = buildRecommendedActions({ plannedAcquisitions: [{ name: 'H', liquidityStressAfter: 0.40 }] })[0];
  eq('5% stress → Low', low.risk, 'Low');
  eq('20% stress → Medium', med.risk, 'Medium');
  eq('40% stress → High', high.risk, 'High');
}

/* ---------------------------------------------------------------------------
 * Unified-recommendation engine integration
 * ------------------------------------------------------------------------- */

function fakeRec(o: Partial<Recommendation>): Recommendation {
  return {
    id: 'r-x', title: 'X', actionType: 'etf_dca', pillar: 'maintain_investing_discipline',
    priorityRank: 1, confidenceScore: 0.7, urgency: 'this_quarter', riskLevel: 'Low',
    expectedFinancialImpact: { annualDollar: 1000 },
    implementationSteps: [], whatCouldChangeRecommendation: [], alternativeOptions: [],
    reviewTrigger: { condition: '' },
    sourceSignalsUsed: ['decision_engine'],
    surfaces: ['action_centre'],
    reasoning: 'because',
    ...o,
  } as Recommendation;
}

console.log('\n=== Unified recommendation engine outputs are merged ===');
{
  const unified: UnifiedRecommendationResult = {
    bestMove: fakeRec({ id: 'r-debt', title: 'Pay $5k off CC debt',
      actionType: 'pay_high_interest_debt',
      pillar: 'reduce_high_interest_debt',
      confidenceScore: 0.91, riskLevel: 'Low',
      reasoning: 'High APR debt at 22%; refund pays > 6 months of interest.',
    }),
    topPriorities: [
      fakeRec({ id: 'r-debt',  title: 'Pay $5k off CC debt',
               actionType: 'pay_high_interest_debt', riskLevel: 'Low',
               confidenceScore: 0.91,
               reasoning: 'High APR debt at 22%; refund pays > 6 months of interest.' }),
      fakeRec({ id: 'r-delay', title: 'Delay IP #2 until 2028',
               actionType: 'delay_property_purchase', riskLevel: 'Med',
               confidenceScore: 0.7,
               reasoning: 'Stress matrix shows liquidity stress at 38% post-purchase.' }),
      fakeRec({ id: 'r-tax',   title: 'Switch to PAYG NG refund mode',
               actionType: 'tax_optimisation', riskLevel: 'Low',
               confidenceScore: 0.6,
               reasoning: 'Smoothing the refund improves monthly cashflow stability.' }),
    ],
    all: [],
    riskBeingReduced: 'liquidity_stress',
    signalCoverage: ['decision_engine', 'risk_engine'],
    generatedAt: new Date().toISOString(),
  };

  const actions = buildRecommendedActions({ unified });
  eq('3 actions produced from unified', actions.length, 3);
  // Tone classification.
  const tones = actions.map(a => a.tone);
  ok('contains a "delay" tone',    tones.includes('delay'));
  ok('contains an "optimise" tone', tones.includes('optimise'));
  ok('contains a "monitor" tone',   tones.includes('monitor'));
  // Source engines bubble through humanised.
  const sources = actions.flatMap(a => a.sourceEngines);
  ok('source list mentions Decision Engine',
     sources.includes('Decision Engine'),
     sources);
}

console.log('\n=== Ordering: proceed → delay → optimise → monitor ===');
{
  const actions = buildRecommendedActions({
    plannedAcquisitions: [
      { name: 'IP #1', targetDate: '2026-07-01', confidence: 0.78 },
      { name: 'IP #2', targetDate: '2026-08-01', delayUntil: '2028-01-01', confidence: 0.65 },
    ],
    unified: {
      bestMove: fakeRec({}),
      topPriorities: [
        fakeRec({ id: 'r-tax', actionType: 'tax_optimisation', riskLevel: 'Low' }),
        fakeRec({ id: 'r-misc', actionType: 'etf_dca', riskLevel: 'Low' }),
      ],
      all: [], riskBeingReduced: '', signalCoverage: [],
      generatedAt: new Date().toISOString(),
    },
  });
  const tones = actions.map(a => a.tone);
  const order = { proceed: 0, delay: 1, optimise: 2, monitor: 3 } as Record<string, number>;
  let ordered = true;
  for (let i = 1; i < tones.length; i++) {
    if (order[tones[i]] < order[tones[i - 1]]) {
      ordered = false;
      break;
    }
  }
  ok('actions are ordered by tone bucket', ordered, tones);
}

console.log('\n=== No duplicate ids ===');
{
  const actions = buildRecommendedActions({
    plannedAcquisitions: [{ name: 'IP #1', targetDate: '2026-07-01' }],
    unified: {
      bestMove: fakeRec({}),
      topPriorities: [fakeRec({ id: 'r-1' }), fakeRec({ id: 'r-2' })],
      all: [], riskBeingReduced: '', signalCoverage: [],
      generatedAt: new Date().toISOString(),
    },
  });
  const ids = new Set(actions.map(a => a.id));
  eq('all action ids unique', ids.size, actions.length);
}

console.log('\n=== Visual helpers expose consistent classes/labels ===');
{
  ok('proceed → emerald class', /emerald/i.test(visualClassForTone('proceed')));
  ok('delay → amber class',    /amber/i.test(visualClassForTone('delay')));
  ok('optimise → sky class',    /sky/i.test(visualClassForTone('optimise')));
  ok('monitor → slate class',   /slate/i.test(visualClassForTone('monitor')));
  ok('proceed label is Proceed', tonePillLabel('proceed') === 'Proceed');
  ok('delay emoji is present',   tonePillEmoji('delay').length > 0);
}

console.log('\n=== Adapter does not invent $ values (presentation-only) ===');
{
  const actions = buildRecommendedActions({
    plannedAcquisitions: [{ name: 'X', netWorthDeltaAtHorizon: 880_000, targetDate: '2026-09-01' }],
    horizonYear: 2035,
  });
  ok('impact $ passes through unchanged', actions[0].impactValue === 880_000, actions[0]);
  ok('impact label uses the input $', /\+\$880k Net Worth by 2035/.test(actions[0].impactLabel),
     actions[0].impactLabel);
}

console.log('\n=== Empty inputs returns empty list (no fabricated actions) ===');
{
  eq('no inputs → empty', buildRecommendedActions({}).length, 0);
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Sprint 2C decision UX: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
