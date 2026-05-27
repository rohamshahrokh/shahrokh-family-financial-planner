/**
 * Sprint 18 Phase 18.2 — Borrowing capacity.
 *
 * Deterministic AU-style serviceability calc:
 *   max borrow ≈ (gross annual income × 6) − (existing commitments × 12)
 *               − required buffer
 * Stress test: assess repayments at 6.5% over 30 years.
 *
 * NOTE: This is intentionally conservative and explicit — every assumption
 * is returned via `inputAssumptions` so the explanation layer can echo it.
 */

import type { BorrowingCapacityResult } from "./feasibilityTypes";

interface BorrowingInputs {
  grossAnnualIncome: number;
  monthlyDebtRepayments: number;
  monthlyLivingExpenses: number;
  /** Number of dependents — each adds buffer. */
  dependents?: number;
  /** Optional override; defaults to 6.5%. */
  stressRatePct?: number;
  termYears?: number;
}

const DEFAULT_STRESS_RATE = 0.065;
const DEFAULT_TERM_YEARS = 30;
const INCOME_MULTIPLIER = 6.0;
const DEPENDENT_BUFFER = 12_000; // $/yr per dependent

/** Net present value of payments for monthly repayment given r (monthly) and n. */
function pvAnnuity(monthlyPayment: number, rateMonthly: number, n: number): number {
  if (rateMonthly <= 0) return monthlyPayment * n;
  return monthlyPayment * (1 - Math.pow(1 + rateMonthly, -n)) / rateMonthly;
}

export function computeBorrowingCapacity(inputs: BorrowingInputs): BorrowingCapacityResult {
  const stressRate = inputs.stressRatePct ?? DEFAULT_STRESS_RATE;
  const termYears = inputs.termYears ?? DEFAULT_TERM_YEARS;

  const dependentBuffer = (inputs.dependents ?? 0) * DEPENDENT_BUFFER;
  const annualCommitments =
    inputs.monthlyDebtRepayments * 12 +
    inputs.monthlyLivingExpenses * 12 +
    dependentBuffer;

  const effectiveAnnualIncome = Math.max(0, inputs.grossAnnualIncome - annualCommitments);

  // Multiplier-based cap as a sanity ceiling
  const incomeCap = inputs.grossAnnualIncome * INCOME_MULTIPLIER - (inputs.monthlyDebtRepayments * 12 * 10);

  // Capacity from monthly affordability
  const maxMonthlyAffordable = Math.max(0, effectiveAnnualIncome / 12 * 0.55); // 55% surplus ceiling
  const rateMonthly = stressRate / 12;
  const months = termYears * 12;
  const affordabilityCap = pvAnnuity(maxMonthlyAffordable, rateMonthly, months);

  const maxBorrowAud = Math.max(0, Math.min(incomeCap, affordabilityCap));
  const bufferReserved = dependentBuffer + inputs.monthlyLivingExpenses * 12 * 0.05;

  return {
    maxBorrowAud: Math.round(maxBorrowAud),
    effectiveAnnualIncome: Math.round(effectiveAnnualIncome),
    monthlyCommitments: inputs.monthlyDebtRepayments,
    bufferReserved: Math.round(bufferReserved),
    termYears,
    stressRatePct: stressRate * 100,
    inputAssumptions: {
      INCOME_MULTIPLIER,
      DEFAULT_STRESS_RATE: stressRate,
      DEFAULT_TERM_YEARS: termYears,
      DEPENDENT_BUFFER,
      dependents: inputs.dependents ?? 0,
      grossAnnualIncome: inputs.grossAnnualIncome,
    },
  };
}
