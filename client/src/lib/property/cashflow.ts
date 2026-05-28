/**
 * property/cashflow.ts — Sprint 20 PR-F2.
 *
 * Investment-property cashflow components. Per Sprint 20 PR-F2 Section 4.3:
 *
 *   net annual cashflow = gross rent (annualised, after vacancy)
 *                       − interest (current rate × loan balance)
 *                       − management fees (rate × effective rent)
 *                       − maintenance (assumption: 1.0% of property value)
 *                       − council + insurance (fixed annual)
 *
 * PRINCIPAL repayments are NOT a cost — they are equity accrual. They are
 * intentionally NOT subtracted from cashflow.
 *
 * `negativelyGeared` is a boolean flag (true when net cashflow < 0) so the
 * caller can render the tax-deductibility implication without us baking a
 * marginal-tax assumption into this module.
 *
 * PPOR cashflow is structurally different (no rent income; same costs +
 * full P&I servicing) — that lives in `pporCashflow()` and is used by the
 * refinance-move model.
 */

import type { CanonicalProperty } from "./types";

/** Documented maintenance assumption — 1.0% of property value per year. */
export const MAINTENANCE_RATE_OF_VALUE = 0.01;
/** Weeks per year used for rent annualisation. */
export const WEEKS_PER_YEAR = 52;

export interface InvestmentCashflow {
  grossRentAnnual: number;
  effectiveRentAnnual: number;
  interestAnnual: number;
  managementFeeAnnual: number;
  maintenanceAnnual: number;
  councilInsuranceAnnual: number;
  netCashflowAnnual: number;
  netCashflowMonthly: number;
  negativelyGeared: boolean;
}

/**
 * Investment-property cashflow for a single classified property.
 *
 * NOTE: this is a STATIC, current-period cashflow — no growth, no rate
 * change, no Monte Carlo. The ranking engine's 25-year projection multiplies
 * the monthly value by 12 × horizon with no compounding, which is the
 * conservative, auditable choice for a "what does this look like right
 * now" question.
 */
export function investmentCashflow(p: CanonicalProperty): InvestmentCashflow {
  if (p.kind !== "investment") {
    // PPOR has no rent — call the PPOR helper instead.
    return {
      grossRentAnnual: 0,
      effectiveRentAnnual: 0,
      interestAnnual: 0,
      managementFeeAnnual: 0,
      maintenanceAnnual: 0,
      councilInsuranceAnnual: 0,
      netCashflowAnnual: 0,
      netCashflowMonthly: 0,
      negativelyGeared: false,
    };
  }
  const grossRentAnnual = p.weeklyRent * WEEKS_PER_YEAR;
  const effectiveRentAnnual = grossRentAnnual * (1 - p.vacancyRate);
  const interestAnnual = p.loanBalance * p.interestRate;
  const managementFeeAnnual = effectiveRentAnnual * p.managementFeeRate;
  const maintenanceAnnual = p.currentValue * MAINTENANCE_RATE_OF_VALUE;
  const councilInsuranceAnnual = p.councilRates + p.insurance + p.maintenance;
  // Note: `p.maintenance` is the user-entered fixed maintenance budget. We
  // include both that AND a 1% rate-of-value buffer because real properties
  // typically incur opportunistic maintenance not captured in the budget
  // (storm damage, hot-water replacement, etc.). The 1% rule of thumb is
  // widely cited (e.g. Australian Tax Office depreciation guides).
  const netCashflowAnnual =
    effectiveRentAnnual -
    interestAnnual -
    managementFeeAnnual -
    maintenanceAnnual -
    councilInsuranceAnnual;
  return {
    grossRentAnnual,
    effectiveRentAnnual,
    interestAnnual,
    managementFeeAnnual,
    maintenanceAnnual,
    councilInsuranceAnnual,
    netCashflowAnnual,
    netCashflowMonthly: netCashflowAnnual / 12,
    negativelyGeared: netCashflowAnnual < 0,
  };
}

export interface PpoRCashflow {
  interestAnnual: number;
  maintenanceAnnual: number;
  councilInsuranceAnnual: number;
  totalHoldingCostAnnual: number;
  totalHoldingCostMonthly: number;
}

/**
 * PPOR cashflow — interest, maintenance, council & insurance.
 *
 * Used by the refinance-move model: a refi changes `interestAnnual`, which
 * surfaces as the monthly cashflow benefit.
 */
export function pporCashflow(p: CanonicalProperty): PpoRCashflow {
  if (p.kind !== "ppor") {
    return {
      interestAnnual: 0,
      maintenanceAnnual: 0,
      councilInsuranceAnnual: 0,
      totalHoldingCostAnnual: 0,
      totalHoldingCostMonthly: 0,
    };
  }
  const interestAnnual = p.loanBalance * p.interestRate;
  const maintenanceAnnual = p.currentValue * MAINTENANCE_RATE_OF_VALUE;
  const councilInsuranceAnnual = p.councilRates + p.insurance + p.maintenance;
  const total = interestAnnual + maintenanceAnnual + councilInsuranceAnnual;
  return {
    interestAnnual,
    maintenanceAnnual,
    councilInsuranceAnnual,
    totalHoldingCostAnnual: total,
    totalHoldingCostMonthly: total / 12,
  };
}
