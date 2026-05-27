/**
 * Sprint 17 Phase 17.0 — Recommendation Context Model
 *
 * Four-input substrate every later Sprint 17 phase reads:
 *   TODAY  — assets, liabilities, cashflow, age, household profile (from CanonicalLedger)
 *   PLAN   — FIRE target, target age, risk preference (from CanonicalGoal)
 *   FORECAST — what happens if you do nothing (baseline projection)
 *   META   — generated-at, horizon
 *
 * All fields are optional or have safe defaults; the context degrades
 * gracefully when inputs are unwired. New code reads from this; existing
 * engines remain untouched.
 */

import type { HouseholdLifeStage } from "../householdState/types";

export interface TodaySlice {
  /** Ledger snapshot (DashboardInputs) — kept as `any` to avoid load-order coupling. */
  ledger: any | null;
  /** Inferred or supplied current age (years). May be null when unknown. */
  age: number | null;
  /** Joint household profile flags. */
  householdProfile: {
    hasDependents: boolean;
    singleIncome: boolean;
    selfEmployed: boolean;
    retired: boolean;
  };
  /** Monthly cashflow numbers from the ledger. */
  cashflow: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySurplus: number;
  };
  /** Net-worth components. */
  netWorth: {
    total: number;
    cash: number;
    investments: number;
    superBalance: number;
    propertyEquity: number;
    crypto: number;
    debt: number;
  };
}

export interface PlanSlice {
  /** Canonical goal (NOT_SET | SET). */
  goal: any | null;
  /** Convenience: explicit FIRE target age when goal is SET. */
  targetFireAge: number | null;
  /** Convenience: target monthly passive income when goal is SET. */
  targetPassiveMonthly: number | null;
  /** SWR percent (0..1). */
  swrPct: number | null;
  /** -1 (very conservative) to +1 (very aggressive). */
  riskPreference: number | null;
  /** True when user wants to keep a PPOR. */
  ownershipGoals: { keepPpor: boolean; allowInvestmentProperty: boolean };
}

export interface BaselineForecast {
  /** Year-by-year nominal + real path. */
  netWorthPath: Array<{ year: number; nominal: number; real: number }>;
  /** ISO date of projected FIRE attainment, or null when unreachable. */
  fireDateBaseline: string | null;
  /** 0..1 probability that the FIRE plan succeeds if nothing changes. */
  fireSuccessProbabilityBaseline: number;
  /** Passive annual income at targetFireAge in nominal terms. */
  passiveIncomePathAtTargetAge: number | null;
  /** Reachable, tight, or impossible within horizon. */
  feasibility: "ACHIEVABLE" | "TIGHT" | "UNREACHABLE";
  /** Plain-English reason when feasibility is UNREACHABLE. */
  unreachableReason?: string;
}

export interface RecommendationContext {
  today: TodaySlice;
  plan: PlanSlice;
  forecast: BaselineForecast;
  meta: {
    generatedAt: string;
    horizonYears: number;
    horizonAge: number;
    /** Stable hash so caches can key on context identity. */
    contextHash: string;
  };
  /** Phase 17.2 — life-stage classification. Populated after buildContext. */
  lifeStage?: HouseholdLifeStage;
}
