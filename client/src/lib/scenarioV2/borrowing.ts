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
import {
  resolveHemExpenses,
  type HemAudit,
  type HemExpenseMode,
  type HouseholdComposition,
  type HouseholdCompositionKind,
} from "./household";

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
  /**
   * Sprint 2B — household composition (optional, additive).
   * When omitted, the engine behaves identically to Sprint 2A.
   */
  householdComposition?: HouseholdComposition | HouseholdCompositionKind | null;
  /**
   * Sprint 2B — HEM expense mode (optional). Default ACTUAL preserves
   * legacy behaviour byte-for-byte.
   */
  hemMode?: HemExpenseMode;
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
  /** Sprint 2B — full HEM audit trail (always populated, even in ACTUAL). */
  hemAudit: HemAudit;
}

export function computeServiceability(input: ServiceabilityInput): ServiceabilityResult {
  const buffer = input.apraBufferPct ?? 0.03;
  const term = input.termYears ?? 30;
  const taxRate = input.averageTaxRate ?? 0.28;
  const shading = input.rentalShading ?? 0.80;
  const bufferedRate = input.mortgageRate + buffer;

  // Sprint 2B — resolve HEM / household-aware living expenses up-front. The
  // returned audit is attached to the result so reviewers can always see
  // which floor was applied. When mode/composition aren't supplied the
  // resolver is a no-op (appliedMonthly === input.monthlyLivingExpenses).
  const hemAudit = resolveHemExpenses({
    monthlyLivingExpenses: input.monthlyLivingExpenses,
    mode: input.hemMode,
    composition: input.householdComposition ?? null,
  });
  const effectiveMonthlyExpenses = hemAudit.appliedMonthly;

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
  const nsrSurplus = serviceableMonthly - effectiveMonthlyExpenses - bufferedDebtService;
  const nsr = bufferedDebtService > 0
    ? (nsrSurplus + bufferedDebtService) / bufferedDebtService
    : Number.POSITIVE_INFINITY;

  // Max additional borrow: solve for P such that buffered payment on P,
  // PLUS existing buffered service, equals (serviceableMonthly − expenses).
  const headroomMonthly = Math.max(
    0,
    serviceableMonthly - effectiveMonthlyExpenses - bufferedDebtService,
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
  if (hemAudit.mode !== "ACTUAL" || hemAudit.composition != null) {
    rationale.push(
      `HEM ${hemAudit.mode}` +
        (hemAudit.composition ? ` (${hemAudit.composition.kind})` : "") +
        ` applied=$${hemAudit.appliedMonthly.toFixed(0)}` +
        (hemAudit.hemFloorMonthly != null
          ? `, floor=$${hemAudit.hemFloorMonthly.toFixed(0)}`
          : ""),
    );
  }

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
    hemAudit,
  };
}

// Sprint 2A — D-001 fix.
//
// `state.otherDebts` already aggregates non-property debt (credit cards,
// personal/car loans, HELP/HECS and any other liabilities the snapshot
// captures under `other_debts`). It is seeded in basePlan.ts:216 from
// `snapshot.other_debts` and amortised in tick.ts:327-335. Returning it here
// closes the long-standing serviceability gap where DTI structurally
// understated the household's true debt-to-income ratio.
//
// We clamp at zero (defensive — the snapshot column has a non-negative
// invariant but the field is nullable in legacy rows). The change is purely
// additive in the DTI numerator and has no effect on DSR (which is service-
// based, not balance-based) or LVR (property-only).
function getOtherDebts(input: ServiceabilityInput): number {
  return Math.max(0, input.state.otherDebts ?? 0);
}
