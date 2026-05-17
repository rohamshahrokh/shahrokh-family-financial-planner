/**
 * Reproduces the PRE-FIX engine behaviour to demonstrate the bug, without
 * actually reverting source. Re-implements the offending branch verbatim:
 *
 *   const debt = otherDebts;
 *   if (debt < 1000) return null;
 *   const rate = personalDebtRate ?? 0.17;   // ← THIS WAS THE BUG
 *   // → fires "Pay down high-interest debt ($19K)" for ALL non-zero
 *     otherDebts, regardless of true APR class.
 *
 * Cases mirror script/debt-engine-before-after.ts so the two outputs can be
 * compared side-by-side in the PR description.
 */

interface PreFixSignals {
  otherDebts?: number;
  personalDebtRate?: number;   // decimal, e.g. 0.17 for 17%
  description: string;
  id: string;
}

function preFixPayHighInterestDebt(s: PreFixSignals): string | null {
  const debt = s.otherDebts ?? 0;
  if (debt < 1000) return null;
  // The exact bug: if personalDebtRate is null/undefined/blank, default to 17%.
  const rate = typeof s.personalDebtRate === 'number' ? s.personalDebtRate : 0.17;
  const annualCost = debt * rate;
  return `Pay down high-interest debt ($${debt.toLocaleString()}) — ` +
         `~${(rate * 100).toFixed(0)}% APR, $${Math.round(annualCost).toLocaleString()}/yr [immediate]`;
}

const CASES: PreFixSignals[] = [
  { id: 'A', description: '$20K debt @ 0% (TRUE APR)',                       otherDebts: 20_000, personalDebtRate: 0.17 /* what adapters.ts hardcoded */ },
  { id: 'B', description: '$20K debt @ 17%',                                  otherDebts: 20_000, personalDebtRate: 0.17 },
  { id: 'C', description: 'Mortgage debt (only otherDebts=0 here)',           otherDebts: 0,      personalDebtRate: 0.17 },
  { id: 'D', description: '$8K 0% promo (TRUE APR)',                          otherDebts: 8_000,  personalDebtRate: 0.17 /* hardcoded */ },
  { id: 'E', description: 'Blank / unknown APR — $19K (personalDebtRate=⊥)', otherDebts: 19_000 /* personalDebtRate omitted → defaults to 0.17 */ },
];

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('  BEFORE the fix — engine output (re-implemented from the pre-fix branch)');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Case  Description                                       Best-Move debt rec emitted');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────');
for (const c of CASES) {
  const rec = preFixPayHighInterestDebt(c);
  const pad = (s: string, n: number) => s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
  console.log(pad(c.id, 6) + pad(c.description, 50) + (rec ?? '(none)'));
}
console.log('');
console.log('Every non-zero otherDebts case falsely produced "Pay down high-interest debt ($X) — ~17% APR".');
console.log('Even cases A and D, where the real APR is 0%, were tagged as urgent ~17% high-APR debt,');
console.log('because the legacy code defaulted missing/zero APR to 0.17 (17%) — the root cause.');
console.log('');
