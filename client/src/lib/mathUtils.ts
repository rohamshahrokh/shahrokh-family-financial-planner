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

/** Canonical loan-type token. PI = principal & interest, IO = interest only. */
export type LoanType = 'PI' | 'IO';

/**
 * Normalise any caller-supplied loan_type string into the canonical PI/IO
 * token. Legacy storage used 'principal_interest' / 'interest_only'; new
 * schema uses 'PI' / 'IO'. Anything unknown defaults to PI (safer / matches
 * the schema default).
 */
export function normaliseLoanType(raw: unknown): LoanType {
  if (raw == null) return 'PI';
  const t = String(raw).trim().toUpperCase();
  if (t === 'IO' || t === 'INTEREST_ONLY' || t === 'INTEREST-ONLY' || t === 'INTERESTONLY') return 'IO';
  return 'PI';
}

/**
 * Loan repayment dispatcher.
 *
 *  - PI loan: standard amortisation over `termYears`.
 *  - IO loan: interest only (P * r/12) for the first `ioYears`, then converts
 *    to P&I over the REMAINING term (termYears - ioYears).
 *
 * `monthsSincePayment` lets callers compute the right slice of the loan's
 * life — for forecast use cases the monthly amount should not change unless
 * the IO window ends. If callers don't know the elapsed time, we default to
 * 0 which means "in the first month" — i.e. IO returns interest-only.
 *
 * Returns the *monthly* repayment in dollars.
 */
export function calcLoanRepayment(args: {
  principal: number;
  annualRate: number;
  termYears: number;
  loanType?: unknown;
  ioYears?: number;
  /** Months elapsed since loan start. Defaults to 0. */
  monthsSincePayment?: number;
}): number {
  const principal = safeNum(args.principal);
  if (principal <= 0) return 0;
  const annualRate = safeNum(args.annualRate);
  const termYears = safeNum(args.termYears);
  if (termYears <= 0) return 0;
  const loanType = normaliseLoanType(args.loanType);
  const ioYears = Math.max(0, safeNum(args.ioYears));
  const monthsSince = Math.max(0, safeNum(args.monthsSincePayment));

  // Pure PI loan
  if (loanType === 'PI') {
    return calcMonthlyRepayment(principal, annualRate, termYears);
  }

  // IO loan with no IO window specified → assume the whole term is IO
  const effectiveIoYears = ioYears > 0 ? Math.min(ioYears, termYears) : termYears;
  const ioMonths = effectiveIoYears * 12;

  if (monthsSince < ioMonths) {
    // Inside the IO period — interest only on the (unamortised) principal.
    return principal * (annualRate / 100) / 12;
  }

  // Past the IO period — convert to P&I over the REMAINING term.
  const remainingYears = Math.max(0, termYears - effectiveIoYears);
  if (remainingYears <= 0) return 0;
  return calcMonthlyRepayment(principal, annualRate, remainingYears);
}

/**
 * Loan balance after `monthsPaid` months, respecting loan_type.
 *
 *  - PI: standard amortisation balance.
 *  - IO during the IO window: balance stays at principal (no amortisation).
 *  - IO after the IO window: amortises over the remaining term.
 *
 * Extra repayments are NOT modelled here; callers that want to apply offset
 * or extra-pay behaviour should subtract those separately.
 */
export function calcLoanBalanceWithType(args: {
  principal: number;
  annualRate: number;
  termYears: number;
  monthsPaid: number;
  loanType?: unknown;
  ioYears?: number;
}): number {
  const principal = safeNum(args.principal);
  if (principal <= 0) return 0;
  const annualRate = safeNum(args.annualRate);
  const termYears = safeNum(args.termYears);
  if (termYears <= 0) return principal;
  const monthsPaid = Math.max(0, safeNum(args.monthsPaid));
  const loanType = normaliseLoanType(args.loanType);

  if (loanType === 'PI') {
    return _amortisedBalance(principal, annualRate, termYears, monthsPaid);
  }

  const ioYears = args.ioYears != null && safeNum(args.ioYears) > 0
    ? Math.min(safeNum(args.ioYears), termYears)
    : termYears;
  const ioMonths = ioYears * 12;

  if (monthsPaid <= ioMonths) {
    // Inside IO window → balance stays at principal (no amortisation).
    return principal;
  }

  // After IO: amortise the principal over remaining term.
  const remainingYears = Math.max(0, termYears - ioYears);
  if (remainingYears <= 0) return 0;
  const monthsPostIo = monthsPaid - ioMonths;
  return _amortisedBalance(principal, annualRate, remainingYears, monthsPostIo);
}

function _amortisedBalance(principal: number, annualRate: number, termYears: number, monthsPaid: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (monthsPaid >= n) return 0;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsPaid);
  const pmt = calcMonthlyRepayment(principal, annualRate, termYears);
  const bal = principal * Math.pow(1 + r, monthsPaid) - pmt * ((Math.pow(1 + r, monthsPaid) - 1) / r);
  return Math.max(0, bal);
}
