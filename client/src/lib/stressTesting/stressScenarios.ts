/**
 * Sprint 18 Phase 18.4 — Stress scenarios.
 *
 * Each scenario defines a deterministic perturbation applied to the
 * RecommendationContext snapshot. Returns the same TodaySlice shape with
 * affected numbers nudged.
 *
 * The 8 scenarios are exactly as user-specified.
 */

import type { RecommendationContext } from "../recommendationContext/types";
import type { StressScenarioId } from "./stressTypes";

export interface StressedSnapshot {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  cash: number;
  investments: number;
  crypto: number;
  propertyEquity: number;
  debt: number;
  debtServiceMonthly: number;
}

function baseline(ctx: RecommendationContext): StressedSnapshot {
  const t = ctx.today;
  const debtRate = ctx.today.ledger?.snapshot?.mortgage_rate ?? 0.0582;
  const debt = t.netWorth.debt;
  const mortgageMonthly = debt > 0 ? (debt * (debtRate / 12)) : 0;
  return {
    monthlyIncome: t.cashflow.monthlyIncome,
    monthlyExpenses: t.cashflow.monthlyExpenses,
    monthlySurplus: t.cashflow.monthlySurplus,
    cash: t.netWorth.cash,
    investments: t.netWorth.investments,
    crypto: t.netWorth.crypto,
    propertyEquity: t.netWorth.propertyEquity,
    debt,
    debtServiceMonthly: mortgageMonthly,
  };
}

export const STRESS_SCENARIO_LABELS: Record<StressScenarioId, string> = {
  rates_plus_2: "Interest rates +2%",
  property_minus_15: "Property values -15%",
  equity_minus_25: "Equity markets -25%",
  crypto_minus_50: "Crypto -50%",
  income_minus_20: "Income -20%",
  expenses_plus_15: "Expenses +15%",
  rental_vacancy_8w: "Rental vacancy 8 weeks",
  combined_stress: "Combined shock (rates +2%, equity -25%, income -10%)",
};

export function applyStress(ctx: RecommendationContext, id: StressScenarioId): StressedSnapshot {
  const s = baseline(ctx);
  switch (id) {
    case "rates_plus_2": {
      const debtRate = ctx.today.ledger?.snapshot?.mortgage_rate ?? 0.0582;
      const stressedMortgage = s.debt * ((debtRate + 0.02) / 12);
      const deltaMortgage = stressedMortgage - s.debtServiceMonthly;
      s.debtServiceMonthly = stressedMortgage;
      s.monthlySurplus = s.monthlySurplus - deltaMortgage;
      s.monthlyExpenses = s.monthlyExpenses + deltaMortgage;
      return s;
    }
    case "property_minus_15": {
      s.propertyEquity = Math.max(0, s.propertyEquity * 0.85 - s.debt * 0.15);
      return s;
    }
    case "equity_minus_25": {
      s.investments = s.investments * 0.75;
      return s;
    }
    case "crypto_minus_50": {
      s.crypto = s.crypto * 0.50;
      return s;
    }
    case "income_minus_20": {
      const incomeShock = s.monthlyIncome * 0.20;
      s.monthlyIncome = s.monthlyIncome - incomeShock;
      s.monthlySurplus = s.monthlySurplus - incomeShock;
      return s;
    }
    case "expenses_plus_15": {
      const bump = s.monthlyExpenses * 0.15;
      s.monthlyExpenses = s.monthlyExpenses + bump;
      s.monthlySurplus = s.monthlySurplus - bump;
      return s;
    }
    case "rental_vacancy_8w": {
      const rentalEstimate = Math.max(0, s.debt * 0.0035); // ~$2.5K/mo on $700K loan as rough proxy
      const lostRent = rentalEstimate * 2; // 8 weeks ≈ 2 months
      s.monthlySurplus = s.monthlySurplus - rentalEstimate;
      s.cash = Math.max(0, s.cash - lostRent);
      return s;
    }
    case "combined_stress": {
      const debtRate = ctx.today.ledger?.snapshot?.mortgage_rate ?? 0.0582;
      const stressedMortgage = s.debt * ((debtRate + 0.02) / 12);
      const deltaMortgage = stressedMortgage - s.debtServiceMonthly;
      s.debtServiceMonthly = stressedMortgage;
      s.monthlyExpenses = s.monthlyExpenses + deltaMortgage;
      s.investments = s.investments * 0.75;
      const incomeShock = s.monthlyIncome * 0.10;
      s.monthlyIncome = s.monthlyIncome - incomeShock;
      s.monthlySurplus = s.monthlySurplus - deltaMortgage - incomeShock;
      return s;
    }
  }
}

export const ALL_SCENARIOS: StressScenarioId[] = [
  "rates_plus_2",
  "property_minus_15",
  "equity_minus_25",
  "crypto_minus_50",
  "income_minus_20",
  "expenses_plus_15",
  "rental_vacancy_8w",
  "combined_stress",
];
