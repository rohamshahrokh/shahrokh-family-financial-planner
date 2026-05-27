/**
 * Sprint 20 PR-B P1-1 — Retirement Transition Engine.
 *
 * Composes property liquidation, income conversion, projection, decumulation
 * sequencing, and narrative into a single TransitionNarrative output.
 */

export * from "./types";
export { generatePropertyLiquidationPlan } from "./propertyLiquidationStrategy";
export {
  generateIncomeConversionPlans,
  selectPrimaryConversion,
} from "./incomeConversionStrategy";
export { projectRetirementIncome } from "./retirementIncomeProjection";
export {
  generateDecumulationPlans,
  decumulationOutranksAccumulation,
} from "./decumulationSequencing";
export {
  composeTransitionNarrative,
  BANNED_NARRATIVE_FRAGMENTS,
} from "./transitionNarrative";

import type { HouseholdLifeStage } from "../householdState/types";
import type {
  HouseholdProfile,
  PropertyHolding,
  TransitionNarrative,
} from "./types";
import { generatePropertyLiquidationPlan } from "./propertyLiquidationStrategy";
import {
  generateIncomeConversionPlans,
  selectPrimaryConversion,
} from "./incomeConversionStrategy";
import { projectRetirementIncome } from "./retirementIncomeProjection";
import { generateDecumulationPlans } from "./decumulationSequencing";
import { composeTransitionNarrative } from "./transitionNarrative";

export interface BuildTransitionInputs {
  properties: PropertyHolding[];
  household: HouseholdProfile;
  lifeStage: HouseholdLifeStage;
  liquidPortfolioValue: number;
  hasInvestmentProperty?: boolean;
  preference?: 'safety' | 'income' | 'balanced';
  liquidityBufferMonths?: number;
  riskTolerance?: number;
}

/**
 * Build the full TransitionNarrative for a household. Returns null only when
 * inputs are unusable (no capital and no properties to liquidate).
 */
export function buildRetirementTransition(
  inputs: BuildTransitionInputs,
): TransitionNarrative | null {
  const liquidation = generatePropertyLiquidationPlan(
    inputs.properties,
    inputs.household,
  );
  const totalCapital =
    inputs.liquidPortfolioValue + liquidation.totalNetProceeds;
  if (totalCapital <= 0 && liquidation.actions.length === 0) return null;
  const plans = generateIncomeConversionPlans(totalCapital, inputs.household);
  const primary = selectPrimaryConversion(plans, inputs.preference);
  if (!primary) return null;
  const projection = projectRetirementIncome(
    totalCapital,
    primary,
    inputs.household,
  );
  const decumulation = generateDecumulationPlans({
    lifeStage: inputs.lifeStage,
    monthlyTarget: inputs.household.targetMonthlyPassiveIncome,
    liquidAssets: inputs.liquidPortfolioValue,
    propertyEquity: inputs.properties.reduce(
      (s, p) => s + Math.max(0, p.currentValue - p.debt),
      0,
    ),
    hasInvestmentProperty:
      inputs.hasInvestmentProperty ??
      inputs.properties.some((p) => !p.isPPOR),
    riskTolerance: inputs.riskTolerance ?? 0,
    liquidityBufferMonths: inputs.liquidityBufferMonths ?? 12,
  })[0];
  if (!decumulation) return null;
  return composeTransitionNarrative(
    liquidation,
    primary,
    projection,
    decumulation,
    inputs.household,
    inputs.lifeStage,
  );
}
