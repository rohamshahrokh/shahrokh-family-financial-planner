/**
 * Sprint 20 PR-B P1-1 — Retirement Transition Engine types.
 *
 * Inputs and outputs for the five retirement-transition sub-modules:
 *   propertyLiquidationStrategy, incomeConversionStrategy,
 *   retirementIncomeProjection, decumulationSequencing, transitionNarrative.
 */

export interface PropertyHolding {
  id: string;
  label: string;
  purchaseYear: number;
  currentValue: number;
  debt: number;
  annualGrossYieldPct: number;
  annualHoldingCostsPct: number;
  isPPOR: boolean;
}

export interface HouseholdProfile {
  currentAge: number;
  dependents: number;
  targetFireYear: number;
  targetMonthlyPassiveIncome: number;
  effectiveTaxRate: number;
  expectedInflationPct: number;
  cgtDiscountEligible?: boolean;
}

export interface LiquidationAction {
  action: 'sell' | 'keep' | 'recycle_equity' | 'reduce_debt' | 'refinance';
  propertyId: string;
  propertyLabel: string;
  scheduledYear: number;
  reason: string;
  netProceeds: number;
  taxImpact: number;
  cashflowDeltaAnnual: number;
  rank: number;
}

export interface PropertyLiquidationPlan {
  actions: LiquidationAction[];
  totalNetProceeds: number;
  totalTaxImpact: number;
  cashflowDeltaAnnualNet: number;
  finalPropertyMix: { sold: string[]; kept: string[]; recycled: string[] };
}

export type ConversionStrategyKind =
  | 'etf_yield'
  | 'dividend_transition'
  | 'bond_ladder'
  | 'mixed_income';

export interface IncomeConversionPlan {
  strategy: ConversionStrategyKind;
  label: string;
  capitalDeployed: number;
  projectedMonthlyIncome: number;
  yieldRange: { lowPct: number; highPct: number };
  taxAdjustedMonthlyIncome: number;
  inflationAdjustedAt5YearMonthly: number;
  sustainabilityScore: number;
  rationale: string;
}

export interface ProjectionYear {
  year: number;
  age: number;
  grossIncome: number;
  netAfterTax: number;
  realIncomePV: number;
  withdrawalRate: number;
  portfolioValueEoY: number;
}

export interface RetirementProjection {
  startYear: number;
  endYear: number;
  monthlyTargetNominal: number;
  years: ProjectionYear[];
  sustainabilityScore: number;
  sequenceRiskFlag: boolean;
  shortfallYear?: number;
  swrBandLowPct: number;
  swrBandHighPct: number;
}

export type DecumulationSequence =
  | 'property_first'
  | 'etfs_first'
  | 'blended'
  | 'cash_bucket';

export interface DecumulationPlan {
  sequence: DecumulationSequence;
  monthlyBudget: number;
  bufferMonths: number;
  rebalanceTriggers: string[];
  rationale: string;
  ranking: number;
  applicableLifeStage: 'A' | 'B' | 'C' | 'D' | 'E';
}

export interface TransitionMilestone {
  year: number;
  label: string;
  detail: string;
}

export interface TransitionNarrative {
  headline: string;
  bodyParagraphs: string[];
  milestones: TransitionMilestone[];
  assumptions: string[];
  liquidationPlan: PropertyLiquidationPlan;
  primaryConversion: IncomeConversionPlan;
  projection: RetirementProjection;
  decumulationPlan: DecumulationPlan;
}
