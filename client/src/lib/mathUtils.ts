/**
 * mathUtils.ts
 *
 * Pure utility functions shared by the cash engine layer.
 * Kept separate from finance.ts to avoid circular imports:
 *   finance.ts → cashEngine.ts → eventProcessor.ts → finance.ts (would be circular)
 *
 * finance.ts re-exports these so existing callers are unaffected.
 */

/** Converts any value to a finite number. undefined/null/""/NaN → 0. */
export function safeNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/** Converts any DCA frequency + amount into a per-month cash figure. */
export function dcaMonthlyEquiv(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':      return safeNum(amount) * (52 / 12);
    case 'fortnightly': return safeNum(amount) * (26 / 12);
    case 'monthly':     return safeNum(amount);
    case 'quarterly':   return safeNum(amount) / 3;
    default:            return safeNum(amount);
  }
}

/** Standard mortgage repayment (principal + interest, monthly). */
export function calcMonthlyRepayment(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}
