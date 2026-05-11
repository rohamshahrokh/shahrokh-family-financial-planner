/**
 * Shared fixtures for the P1 audit-fix test suite.
 *
 * Real user numbers (household `shahrokh-family-main`, Roham + Fara) are used
 * as the gold reconciliation target — see /audit/issues.json and the spec's
 * "Real user numbers" section.
 */

import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

export const REAL_USER_SNAPSHOT = {
  ppor: 1_510_000,
  mortgage: 1_200_000,
  mortgage_rate: 6.5,
  mortgage_term_years: 30,
  offset_balance: 222_000,
  cash: 40_000,
  savings_cash: 0,
  emergency_cash: 0,
  other_cash: 0,
  roham_super_balance: 49_500,
  fara_super_balance:  38_500,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  other_assets: 0,
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,   // ~$185,600 / 12
  fara_monthly_income:  15_166.67,   // ~$182,000 / 12
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  other_income: 0,
};

export const REAL_TAX_PROFILE = {
  roham_salary: 188_700,
  fara_salary:  183_000,
  override_active: false,
};

/** Two planned IPs (not yet settled) — should not appear in current NW. */
export const PLANNED_IPS = [
  { id: "ip-2026", type: "investment", current_value: 750_000, purchase_price: 750_000, loan_amount: 600_000, settlement_date: "2026-07-15" },
  { id: "ip-2028", type: "investment", current_value: 1_000_000, purchase_price: 1_000_000, loan_amount: 800_000, settlement_date: "2028-03-28" },
];

export function makeRealUserInputs(overrides: Partial<typeof REAL_USER_SNAPSHOT> = {}): DashboardInputs {
  return {
    snapshot: { ...REAL_USER_SNAPSHOT, ...overrides },
    properties: PLANNED_IPS,
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: "2026-05-11",
  };
}

/** Print a colourful pass/fail line for the tester runner. */
export function check(name: string, condition: boolean, detail?: string): boolean {
  const ok = !!condition;
  // eslint-disable-next-line no-console
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  return ok;
}
