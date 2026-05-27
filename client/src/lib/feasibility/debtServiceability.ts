/**
 * Sprint 18 Phase 18.2 — Debt serviceability.
 *
 * Checks: monthly repayment at current rate AND at +2% stress; does the
 * household's surplus survive after the repayment in each case?
 */

import type { DebtServiceabilityResult } from "./feasibilityTypes";

interface DebtServiceabilityInputs {
  loanAud: number;
  ratePct: number;          // current rate, e.g. 0.0582
  termYears?: number;
  monthlySurplus: number;
  /** Optional pre-existing repayments. */
  existingMonthlyRepayments?: number;
}

const DEFAULT_TERM = 30;
const STRESS_BUFFER = 0.02;

function monthlyRepayment(principal: number, annualRate: number, termYears: number): number {
  const n = termYears * 12;
  const r = annualRate / 12;
  if (principal <= 0) return 0;
  if (r <= 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function assessDebtServiceability(inputs: DebtServiceabilityInputs): DebtServiceabilityResult {
  const term = inputs.termYears ?? DEFAULT_TERM;
  const base = monthlyRepayment(inputs.loanAud, inputs.ratePct, term);
  const stressed = monthlyRepayment(inputs.loanAud, inputs.ratePct + STRESS_BUFFER, term);

  const existing = inputs.existingMonthlyRepayments ?? 0;
  const surplusAfter = inputs.monthlySurplus - base - existing;
  const surplusAfterStress = inputs.monthlySurplus - stressed - existing;

  const passes = surplusAfterStress > 0 && surplusAfter > 200;
  let failureReason: string | null = null;
  if (!passes) {
    if (surplusAfterStress <= 0) {
      failureReason = `Repayment at stressed rate (+2%) would exhaust monthly surplus by ~$${Math.round(Math.abs(surplusAfterStress))}/mo.`;
    } else {
      failureReason = `Surplus after repayment falls below the $200/mo safety floor.`;
    }
  }

  return {
    monthlyRepayment: Math.round(base),
    monthlyRepaymentStressed: Math.round(stressed),
    surplusAfterRepayment: Math.round(surplusAfter),
    surplusAfterStress: Math.round(surplusAfterStress),
    passes,
    failureReason,
  };
}
