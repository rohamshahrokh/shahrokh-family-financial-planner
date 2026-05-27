/**
 * Sprint 18 Phase 18.4 — Stress test types.
 *
 * 8 stress scenarios (user's exact list):
 *   1. Rates +2%
 *   2. Property -15%
 *   3. Equity -25%
 *   4. Crypto -50%
 *   5. Income -20%
 *   6. Expenses +15%
 *   7. Rental vacancy 8 weeks
 *   8. Combined stress
 */

export type StressScenarioId =
  | "rates_plus_2"
  | "property_minus_15"
  | "equity_minus_25"
  | "crypto_minus_50"
  | "income_minus_20"
  | "expenses_plus_15"
  | "rental_vacancy_8w"
  | "combined_stress";

export interface StressScenarioResult {
  scenario: StressScenarioId;
  scenarioLabel: string;
  survives: boolean;
  minimumCashBuffer: number;
  monthlySurplusAfter: number;
  fireDelay: number;                       // months added to FIRE date
  probabilityDegradation: number;          // 0..1 reduction in success prob
  debtServicePressure: number;             // monthly $ shortfall, 0 if none
  recommendationStillValid: boolean;
  note: string;
}

export interface StressTestSummary {
  scenarios: StressScenarioId[];
  results: StressScenarioResult[];
  survivedCount: number;
  totalCount: number;
  primaryWeakness: StressScenarioId | null;
  passes: boolean;                         // true if survives >= 5 of 8
}
