/**
 * Sprint 17 Phase 17.1 — Rule registry.
 *
 * Metadata for each rule emitted by computeUnifiedRecommendations:
 *   - applicableStates: which HouseholdLifeStages should consider this rule
 *   - notSuitableIf: hard-fail predicate (returns true → score 0)
 *   - reversible: can the user undo this action quickly?
 *   - evidence: required signals (used to compute dataCompleteness)
 *   - category: high-level grouping for analytics / UI
 *
 * Phase 17.1 attaches scoreBreakdown.qualityScore; Phase 17.3 introduces
 * applicableStates gating; Phase 17.4 makes qualityScore the ranking base.
 */

import type { ActionType } from "../types";
import type { HouseholdLifeStage } from "../../householdState/types";
import type { RecommendationContext } from "../../recommendationContext/types";

export type RuleCategory =
  | "accumulation"
  | "decumulation"
  | "risk"
  | "tax"
  | "liquidity"
  | "debt"
  | "property"
  | "concentration";

export interface RuleMetadata {
  id: string;
  actionType: ActionType;
  applicableStates: HouseholdLifeStage[];
  notSuitableIf?: (ctx: RecommendationContext) => boolean;
  reversible: boolean;
  evidence: string[];
  category: RuleCategory;
}

const ALL_STATES: HouseholdLifeStage[] = [
  "STATE_A_ACCUMULATION",
  "STATE_B_ACCELERATING",
  "STATE_C_NEAR_FIRE",
  "STATE_D_FIRE_ACHIEVED",
  "STATE_E_DECUMULATION",
];

const ACCUMULATION_STATES: HouseholdLifeStage[] = [
  "STATE_A_ACCUMULATION",
  "STATE_B_ACCELERATING",
];

const DECUMULATION_STATES: HouseholdLifeStage[] = [
  "STATE_C_NEAR_FIRE",
  "STATE_D_FIRE_ACHIEVED",
  "STATE_E_DECUMULATION",
];

export const RULE_REGISTRY: Record<string, RuleMetadata> = {
  build_emergency_buffer: {
    id: "build_emergency_buffer",
    actionType: "build_emergency_buffer",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["cashOutsideOffset", "offsetBalance", "emergencyBufferTarget", "monthlySurplus"],
    category: "liquidity",
  },
  pay_high_interest_debt: {
    id: "pay_high_interest_debt",
    actionType: "pay_high_interest_debt",
    applicableStates: ALL_STATES,
    reversible: false,
    evidence: ["debtPortfolio", "monthlySurplus"],
    category: "debt",
  },
  maintain_interest_free_debt: {
    id: "maintain_interest_free_debt",
    actionType: "maintain_interest_free_debt",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["debtPortfolio"],
    category: "debt",
  },
  monitor_strategic_debt: {
    id: "monitor_strategic_debt",
    actionType: "monitor_strategic_debt",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["debtPortfolio"],
    category: "debt",
  },
  plan_promo_expiry: {
    id: "plan_promo_expiry",
    actionType: "plan_promo_expiry",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["debtPortfolio"],
    category: "debt",
  },
  hold_cash_offset: {
    id: "hold_cash_offset",
    actionType: "hold_cash_offset",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["offsetBalance", "mortgageRate"],
    category: "liquidity",
  },
  increase_super: {
    id: "increase_super",
    actionType: "increase_super",
    applicableStates: ACCUMULATION_STATES,
    notSuitableIf: (ctx) =>
      // Suppress when last 2 years before FIRE OR when FIRE target is before
      // super preservation age (60) — pre-60 FIRE plans can't rely on super.
      // Sprint 18 hard rule (assertion #3): super cannot rank top when FIRE
      // target is before access age.
      Boolean(
        ctx.plan.targetFireAge != null &&
          ((ctx.today.age != null && ctx.plan.targetFireAge - ctx.today.age <= 2) ||
            ctx.plan.targetFireAge < 60),
      ),
    reversible: false,
    evidence: ["superCapRemaining", "marginalTaxRate", "monthlySurplus"],
    category: "tax",
  },
  proceed_property_purchase: {
    id: "proceed_property_purchase",
    actionType: "proceed_property_purchase",
    applicableStates: ACCUMULATION_STATES,
    reversible: false,
    evidence: ["depositPower", "depositReadinessPct", "serviceabilityHeadroomMonthly"],
    category: "property",
  },
  delay_property_purchase: {
    id: "delay_property_purchase",
    actionType: "delay_property_purchase",
    applicableStates: ACCUMULATION_STATES,
    reversible: true,
    evidence: ["depositPower", "depositReadinessPct"],
    category: "property",
  },
  etf_dca: {
    id: "etf_dca",
    actionType: "etf_dca",
    applicableStates: ACCUMULATION_STATES,
    reversible: true,
    evidence: ["monthlySurplus", "etfExpectedReturn"],
    category: "accumulation",
  },
  fire_acceleration: {
    id: "fire_acceleration",
    actionType: "fire_acceleration",
    applicableStates: ACCUMULATION_STATES,
    reversible: true,
    evidence: ["fireProgressPct", "monthlySurplus", "fireMonthlyInvestmentRequired"],
    category: "accumulation",
  },
  reduce_leverage: {
    id: "reduce_leverage",
    actionType: "reduce_leverage",
    applicableStates: ALL_STATES,
    // Phase 17.3 hard gate: requires actual leverage to be present.
    notSuitableIf: (ctx) => {
      const mortgage = ctx.today.netWorth.debt ?? 0;
      // Snapshot ledger may not split debt by type — accept any non-zero debt
      // here; engine builders themselves guard on classified portfolio.
      return mortgage <= 0;
    },
    reversible: false,
    evidence: ["mortgage", "debtPortfolio", "mcStressFlag"],
    category: "debt",
  },
  rebalance_portfolio: {
    id: "rebalance_portfolio",
    actionType: "rebalance_portfolio",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["portfolioTilts"],
    category: "risk",
  },
  hold_cash_fallback: {
    id: "hold_cash_fallback",
    actionType: "hold_cash_offset",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: [],
    category: "liquidity",
  },
  // Sprint 17 Phase 17.5 — concentration rebalance
  rebalance_concentration: {
    id: "rebalance_concentration",
    actionType: "rebalance_concentration",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["concentrationFlags"],
    category: "concentration",
  },
  // Sprint 17 Phase 17.7 — decumulation rules
  glidepath_shift: {
    id: "glidepath_shift",
    actionType: "glidepath_shift",
    applicableStates: DECUMULATION_STATES,
    reversible: true,
    evidence: ["lifeStage", "portfolioTilts"],
    category: "decumulation",
  },
  reduce_leverage_at_target: {
    id: "reduce_leverage_at_target",
    actionType: "reduce_leverage",
    applicableStates: ["STATE_D_FIRE_ACHIEVED", "STATE_E_DECUMULATION"],
    notSuitableIf: (ctx) => (ctx.today.netWorth.debt ?? 0) <= 0,
    reversible: false,
    evidence: ["mortgage"],
    category: "decumulation",
  },
  increase_cash_reserve: {
    id: "increase_cash_reserve",
    actionType: "increase_cash_reserve",
    applicableStates: ["STATE_D_FIRE_ACHIEVED", "STATE_E_DECUMULATION"],
    reversible: true,
    evidence: ["cashOutsideOffset", "monthlyExpenses"],
    category: "decumulation",
  },
  swr_review: {
    id: "swr_review",
    actionType: "swr_review",
    applicableStates: DECUMULATION_STATES,
    reversible: true,
    evidence: ["lifeStage", "fireProgressPct"],
    category: "decumulation",
  },
  income_protection: {
    id: "income_protection",
    actionType: "income_protection",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["householdProfile.singleIncome", "householdProfile.hasDependents"],
    category: "risk",
  },
  unreachable_plan_review: {
    id: "unreachable_plan_review",
    actionType: "unreachable_plan_review",
    applicableStates: ALL_STATES,
    reversible: true,
    evidence: ["feasibility"],
    category: "risk",
  },
};

export function metadataFor(id: string): RuleMetadata | undefined {
  return RULE_REGISTRY[id];
}

export function isApplicableInState(
  id: string,
  state: HouseholdLifeStage | undefined,
): boolean {
  if (!state) return true;
  const meta = RULE_REGISTRY[id];
  if (!meta) return true; // unknown rule — never suppress by gating
  return meta.applicableStates.includes(state);
}
