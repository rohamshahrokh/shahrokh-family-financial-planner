/**
 * Scenario Engine V2 — Borrowing Power & Serviceability (Vertical Slice)
 *
 * APRA-style metrics computed from a PortfolioState snapshot:
 *
 *   DSR  Debt Service Ratio = monthly debt service / monthly gross income
 *        Healthy < 0.30, Stretched 0.30–0.45, Stressed > 0.45.
 *
 *   DTI  Debt-to-Income = total debt balance / annual gross income
 *        Healthy < 6.0, Stretched 6–8, APRA cap-zone ≥ 8 (banks scrutinise).
 *
 *   LVR  Loan-to-Value = total loans / total property market value
 *        < 0.80 standard, ≥ 0.80 triggers LMI.
 *
 *   NSR  Net Surplus Ratio at a buffered rate (rate + 3% APRA buffer):
 *        (post-tax-income − living-expenses − BUFFERED-debt-service) /
 *        BUFFERED-debt-service
 *        Banks usually want > 1.0. We additionally compute the buffered
 *        monthly payment so users see the worst-case stress test.
 *
 *   Max borrow capacity (single-bank approximation): the loan principal P
 *   for which serviceability at the buffered rate is exactly 1.0, given
 *   current income, expenses and existing other debts.
 */

import type { PortfolioState } from "./types";

export interface ServiceabilityInput {
  state: PortfolioState;
  /** Gross monthly household income at this point in time. */
  monthlyGrossIncome: number;
  /** Living expenses (excluding debt service). */
  monthlyLivingExpenses: number;
  /** Mortgage rate (decimal, e.g. 0.065). */
  mortgageRate: number;
  /** APRA serviceability buffer added to the rate (default +0.03). */
  apraBufferPct?: number;
  /** Loan term used for the buffered-payment calc (default 30). */
  termYears?: number;
  /** Average tax rate applied to gross income (default 0.28). */
  averageTaxRate?: number;
  /** Rental income shading factor (default 0.80 — banks discount rent). */
  rentalShading?: number;
}

export interface ServiceabilityResult {
  dsr: number;
  dti: number;
  lvr: number;
  nsr: number;
  monthlyDebtServiceActual: number;
  monthlyDebtServiceBuffered: number;
  maxBorrowCapacity: number;
  bufferedRate: number;
  band: "healthy" | "stretched" | "stressed";
  rationale: string[];
}

export function computeServiceability(input: ServiceabilityInput): ServiceabilityResult {
  const buffer = input.apraBufferPct ?? 0.03;
  const term = input.termYears ?? 30;
  const taxRate = input.averageTaxRate ?? 0.28;
  const shading = input.rentalShading ?? 0.80;
  const bufferedRate = input.mortgageRate + buffer;

  const totalLoanBalance = input.state.properties.reduce((s, p) => s + p.loanBalance, 0);
  const totalPropertyValue = input.state.properties.reduce((s, p) => s + p.marketValue, 0);

  // Sum of actual monthly P&I repayments across all properties
  const actualDebtService = input.state.properties.reduce(
    (s, p) => s + p.monthlyRepayment,
    0,
  );

  // Buffered debt service: re-amortise EACH loan at (rate + buffer) over the
  // configured term. This is what a bank would test against.
  const bufferedDebtService = input.state.properties.reduce((s, p) => {
    const principal = p.loanBalance;
    if (principal <= 0) return s;
    const r = (p.rate + buffer) / 12;
    const n = term * 12;
    const pay = r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return s + pay;
  }, 0);

  // Income for serviceability = (1 − tax) × wages + shaded gross rent
  const monthlyGrossRent = input.state.properties.reduce((s, p) => s + p.monthlyRent, 0);
  const netWageIncome = input.monthlyGrossIncome * (1 - taxRate);
  const shadedRent = monthlyGrossRent * shading;
  const serviceableMonthly = netWageIncome + shadedRent;

  const dsr = input.monthlyGrossIncome > 0
    ? actualDebtService / input.monthlyGrossIncome
    : 0;

  const annualGross = input.monthlyGrossIncome * 12;
  const dti = annualGross > 0
    ? (totalLoanBalance + Math.max(0, getOtherDebts(input))) / annualGross
    : 0;

  const lvr = totalPropertyValue > 0 ? totalLoanBalance / totalPropertyValue : 0;

  // NSR: (serviceable income − expenses − buffered debt) / buffered debt
  const nsrSurplus = serviceableMonthly - input.monthlyLivingExpenses - bufferedDebtService;
  const nsr = bufferedDebtService > 0
    ? (nsrSurplus + bufferedDebtService) / bufferedDebtService
    : Number.POSITIVE_INFINITY;

  // Max additional borrow: solve for P such that buffered payment on P,
  // PLUS existing buffered service, equals (serviceableMonthly − expenses).
  const headroomMonthly = Math.max(
    0,
    serviceableMonthly - input.monthlyLivingExpenses - bufferedDebtService,
  );
  const r = bufferedRate / 12;
  const n = term * 12;
  const annuityFactor =
    r === 0 ? n : (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
  const maxBorrowCapacity = headroomMonthly * annuityFactor;

  // Band — worst of the three indicators
  const band: ServiceabilityResult["band"] =
    dsr > 0.45 || dti > 8 || nsr < 1.0 ? "stressed" :
    dsr > 0.30 || dti > 6 || nsr < 1.10 ? "stretched" :
    "healthy";

  const rationale: string[] = [];
  rationale.push(`DSR ${(dsr * 100).toFixed(1)}% — ${dsr < 0.30 ? "within healthy band" : dsr < 0.45 ? "stretched" : "stressed"}`);
  rationale.push(`DTI ${dti.toFixed(2)}× — ${dti < 6 ? "below APRA scrutiny line" : dti < 8 ? "elevated" : "APRA cap territory"}`);
  rationale.push(`LVR ${(lvr * 100).toFixed(1)}% — ${lvr < 0.80 ? "no LMI" : "LMI required"}`);
  rationale.push(`NSR ${nsr === Infinity ? "∞" : nsr.toFixed(2)} @ +${(buffer * 100).toFixed(0)}% buffered — ${nsr >= 1.10 ? "passes" : nsr >= 1.0 ? "marginal" : "fails"}`);

  return {
    dsr,
    dti,
    lvr,
    nsr,
    monthlyDebtServiceActual: actualDebtService,
    monthlyDebtServiceBuffered: bufferedDebtService,
    maxBorrowCapacity,
    bufferedRate,
    band,
    rationale,
  };
}

// We don't currently thread "other debts" into PortfolioState (it'd need a
// dedicated bucket). Vertical slice approximation: 0 since PPOR and IP
// loans are already on `properties`. Phase 9 will fix this properly.
function getOtherDebts(_input: ServiceabilityInput): number {
  return 0;
}
