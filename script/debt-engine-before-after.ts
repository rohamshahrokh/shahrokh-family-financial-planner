/**
 * Deterministic before/after demonstration of the debt-engine fix.
 *
 * Reproduces the four required validation scenarios against the unified
 * recommendation engine and prints a side-by-side table showing what
 * recommendations the engine emits.
 *
 * Run with: `npx tsx script/debt-engine-before-after.ts`
 *
 * BEFORE the fix:
 *   - adapters.ts forced `personalDebtRate: 0.17` on every snapshot,
 *   - engine `num(s.personalDebtRate, 0.17)` defaulted missing APR to 17%,
 *   - "Pay down high-interest debt ($19K)" surfaced for ALL non-zero debt,
 *     regardless of whether it was 0%, mortgage or tax-deductible.
 *
 * AFTER the fix (this branch):
 *   - 0% debt surfaces "maintain_interest_free_debt" — never urgent payoff,
 *   - 17% debt surfaces "pay_high_interest_debt" with rationale,
 *   - mortgage at 5.8% surfaces "monitor_strategic_debt" — not urgent,
 *   - 0% promo with cliff <90d surfaces "plan_promo_expiry" timed warning,
 *   - blank/unknown APR → unknown_apr_debt, never high APR.
 */

import {
  computeUnifiedRecommendations,
  type UnifiedSignals,
} from '../client/src/lib/recommendationEngine';

const BASE: UnifiedSignals = {
  cashOutsideOffset: 60_000,
  offsetBalance: 80_000,
  mortgage: 1_000_000,
  ppor: 1_500_000,
  monthlyIncome: 22_000,
  monthlyExpenses: 14_000,
  monthlySurplus: 8_000,
  rohamGrossAnnual: 264_000,
  emergencyBufferTarget: 45_000,
  etfExpectedReturn: 0.095,
  mortgageRate: 0.058,
  marginalTaxRate: 0.47,
  mcSurvivalProbability: 0.87,
  mcStressFlag: 'none',
};

interface Case {
  id: string;
  description: string;
  signals: UnifiedSignals;
}

const CASES: Case[] = [
  {
    id: 'A',
    description: '$20K debt @ 0% APR (interest-free)',
    signals: {
      ...BASE,
      otherDebts: 20_000,
      debtPortfolio: [{ id: 'd1', name: '0% Couch Finance', balance: 20_000, ratePct: 0, type: 'promo_zero' }],
    },
  },
  {
    id: 'B',
    description: '$20K debt @ 17% APR (consumer credit)',
    signals: {
      ...BASE,
      otherDebts: 20_000,
      debtPortfolio: [{ id: 'd2', name: 'Credit Card', balance: 20_000, ratePct: 17, type: 'credit_card' }],
    },
  },
  {
    id: 'C',
    description: 'Mortgage @ 5.8% (strategic)',
    signals: {
      ...BASE,
      mortgage: 1_000_000,
      otherDebts: 0,
      debtPortfolio: [{ id: 'mort', name: 'Home Mortgage', balance: 1_000_000, ratePct: 5.8, type: 'mortgage' }],
    },
  },
  {
    id: 'D',
    description: '0% promo finance expiring in 60 days',
    signals: {
      ...BASE,
      otherDebts: 8_000,
      debtPortfolio: [{
        id: 'promo', name: 'BNPL Furniture', balance: 8_000, ratePct: 0,
        type: 'promo_zero',
        expiryDateISO: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      }],
    },
  },
  {
    id: 'E',
    description: 'Blank / unknown APR — $19K (legacy snapshot)',
    signals: {
      ...BASE,
      otherDebts: 19_000,
      // No debtPortfolio, no personalDebtRate. The legacy code path would
      // have defaulted this to 17% high APR. The fixed engine classifies it
      // as unknown_apr_debt and emits no urgent payoff recommendation.
    },
  },
];

const DEBT_ACTION_TYPES = new Set([
  'pay_high_interest_debt',
  'maintain_interest_free_debt',
  'monitor_strategic_debt',
  'plan_promo_expiry',
]);

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('  Debt Engine — Before / After demonstration');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log(pad('Case', 6) + pad('Description', 50) + pad('Debt rec(s) emitted', 60));
console.log('─'.repeat(116));

for (const c of CASES) {
  const out = computeUnifiedRecommendations(c.signals);
  const debtRecs = out.all.filter(r => DEBT_ACTION_TYPES.has(r.actionType));
  const summary = debtRecs.length === 0
    ? '(none — no debt action recommended)'
    : debtRecs.map(r => `${r.actionType} [${r.urgency}]`).join(', ');
  console.log(pad(c.id, 6) + pad(c.description, 50) + pad(summary, 60));
}

console.log('');
console.log('Detailed rationale per case (only debt-class recommendations shown):');
console.log('');

for (const c of CASES) {
  const out = computeUnifiedRecommendations(c.signals);
  const debtRecs = out.all.filter(r => DEBT_ACTION_TYPES.has(r.actionType));
  console.log(`─── Case ${c.id}: ${c.description} ──────────────────────────`);
  if (debtRecs.length === 0) {
    console.log('  (engine emits no debt-action recommendation for this case)');
  } else {
    for (const r of debtRecs) {
      console.log(`  • ${r.title}`);
      console.log(`      action: ${r.actionType}  pillar: ${r.pillar}  urgency: ${r.urgency}`);
      if (r.debtRationale) {
        const dr = r.debtRationale;
        console.log(`      class:    ${dr.classification}`);
        console.log(`      APR:      ${dr.aprPct === null ? 'unknown' : dr.aprPct.toFixed(2) + '%'}`);
        console.log(`      balance:  $${dr.balance.toLocaleString()}`);
        console.log(`      interest: $${dr.annualInterestCost.toLocaleString()}/yr`);
        console.log(`      pillar #: ${dr.pillarRank}`);
        if (dr.triggers?.daysToExpiry !== undefined) {
          console.log(`      cliff:    ${dr.triggers.daysToExpiry} days`);
        }
      }
    }
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Expected outcome (this branch):');
console.log('  A → maintain_interest_free_debt           (NOT urgent payoff)');
console.log('  B → pay_high_interest_debt [immediate]    (urgent — by design)');
console.log('  C → monitor_strategic_debt                (strategic, not urgent)');
console.log('  D → plan_promo_expiry [this_quarter]      (timed warning)');
console.log('  E → (no debt action)                       (unknown APR — not high APR)');
console.log('');
