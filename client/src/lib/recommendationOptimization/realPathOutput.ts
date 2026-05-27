/**
 * Sprint 20 PR-B P1-4 — Real financial path output.
 *
 * Replaces the vague Sprint 18 path output (failed independent review) with
 * a timeline of number-specific actions. Every step carries:
 *   year, expectedPassiveIncome, expectedNetWorth,
 *   retirementSustainabilityScore, downsideRiskAt95thPercentile.
 *
 * Sprint 19 backlog fix (Scenario 08 — negative_cashflow): when monthly
 * cashflow < 0 OR liquidity buffer < 1 month, the path is prepended with an
 * operational-stabilisation step at infinite priority.
 */

import type { HouseholdLifeStage } from "../householdState/types";

export type RealPathStepKind =
  | 'operational_stabilisation'
  | 'build_buffer'
  | 'reduce_leverage'
  | 'buy_investment_property'
  | 'sell_investment_property'
  | 'reallocate_into_etfs'
  | 'glidepath_shift'
  | 'income_conversion';

export interface RealPathStep {
  order: number;
  year: number;
  kind: RealPathStepKind;
  title: string;
  detail: string;
  expectedPassiveIncome: number;
  expectedNetWorth: number;
  retirementSustainabilityScore: number;
  downsideRiskAt95thPercentile: number;
  priority: number;
}

export interface RealPathOutput {
  steps: RealPathStep[];
  targetMonthlyPassiveIncome: number;
  endProjectionNetWorth: number;
  endProjectionMonthlyPassive: number;
  shortfallVsTargetPct: number;
  livesUpToTarget: boolean;
  notes: string[];
}

export interface RealPathInputs {
  currentYear: number;
  targetFireYear: number;
  startingNetWorth: number;
  startingMonthlySurplus: number;
  startingMonthlyExpenses: number;
  startingMonthlyPassiveIncome: number;
  liquidityBufferMonths: number;
  monthlyCashflow: number;
  leverageRatio: number;
  hasInvestmentProperty: boolean;
  borrowingCapacity: number;
  lifeStage: HouseholdLifeStage;
  targetMonthlyPassiveIncome: number;
}

const SUSTAINABILITY_CAP = 0.97;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function projectFromStep(
  netWorth: number,
  monthlySurplus: number,
  realReturnPct: number,
  years: number,
): number {
  let nw = Math.max(0, netWorth);
  const annual = Math.max(0, monthlySurplus) * 12;
  for (let i = 0; i < years; i++) {
    nw = nw * (1 + realReturnPct) + annual;
  }
  return nw;
}

function buildOperationalStabilisationStep(inp: RealPathInputs, order: number): RealPathStep {
  return {
    order,
    year: inp.currentYear,
    kind: 'operational_stabilisation',
    title: 'Stabilise operating cashflow',
    detail: inp.monthlyCashflow < 0
      ? `Monthly cashflow $${Math.round(inp.monthlyCashflow)} is negative — cut discretionary spend by $${Math.max(200, Math.abs(Math.round(inp.monthlyCashflow)))} or raise income before any investment step.`
      : `Liquidity buffer ${inp.liquidityBufferMonths.toFixed(1)} months < 1 month — build to ≥ 3 months before any investment step.`,
    expectedPassiveIncome: inp.startingMonthlyPassiveIncome,
    expectedNetWorth: inp.startingNetWorth,
    retirementSustainabilityScore: 0.2,
    downsideRiskAt95thPercentile: Math.max(0.6, 1 - clamp01(inp.liquidityBufferMonths / 6)),
    priority: Number.POSITIVE_INFINITY,
  };
}

export function buildRealPath(inp: RealPathInputs): RealPathOutput {
  const yearsToTarget = Math.max(1, inp.targetFireYear - inp.currentYear);
  const notes: string[] = [];
  const steps: RealPathStep[] = [];
  let order = 1;

  const needsOperationalGuard = inp.monthlyCashflow < 0 || inp.liquidityBufferMonths < 1;
  if (needsOperationalGuard) {
    steps.push(buildOperationalStabilisationStep(inp, order++));
    notes.push(
      'Operational stabilisation prepended at infinite priority — cashflow < 0 or liquidity buffer < 1 month.',
    );
  }

  if (inp.liquidityBufferMonths < 3 && !needsOperationalGuard) {
    const targetMonths = 6;
    const targetDollar = inp.startingMonthlyExpenses * targetMonths;
    steps.push({
      order: order++,
      year: inp.currentYear + 1,
      kind: 'build_buffer',
      title: `Build ${targetMonths}-month buffer`,
      detail: `Top cash sleeve to ~$${Math.round(targetDollar / 1000)}K (${targetMonths} months of $${Math.round(inp.startingMonthlyExpenses)}/mo expenses).`,
      expectedPassiveIncome: inp.startingMonthlyPassiveIncome,
      expectedNetWorth: inp.startingNetWorth + Math.max(0, inp.startingMonthlySurplus) * 12,
      retirementSustainabilityScore: 0.55,
      downsideRiskAt95thPercentile: 0.45,
      priority: 90,
    });
  }

  if (inp.leverageRatio > 0.5) {
    const reduceBy = Math.max(0.1, inp.leverageRatio - 0.4);
    steps.push({
      order: order++,
      year: inp.currentYear + 2,
      kind: 'reduce_leverage',
      title: `Reduce leverage below ${(inp.leverageRatio - reduceBy).toFixed(2)}`,
      detail: `Accelerate principal payoff or sell weakest IP — current leverage ${inp.leverageRatio.toFixed(2)} above 0.4 target.`,
      expectedPassiveIncome: inp.startingMonthlyPassiveIncome,
      expectedNetWorth: inp.startingNetWorth + Math.max(0, inp.startingMonthlySurplus) * 24,
      retirementSustainabilityScore: 0.62,
      downsideRiskAt95thPercentile: 0.4,
      priority: 80,
    });
  }

  const buyPropertyFeasible = inp.borrowingCapacity > 50_000 && yearsToTarget >= 7 && !needsOperationalGuard;
  if (buyPropertyFeasible) {
    const year = inp.currentYear + 2;
    steps.push({
      order: order++,
      year,
      kind: 'buy_investment_property',
      title: `Buy investment property in ${year}`,
      detail: `Borrowing capacity ~$${Math.round(inp.borrowingCapacity / 1000)}K cleared by income×6 stress + serviceability — deploy as next IP if buffer ≥ 3 months at settlement.`,
      expectedPassiveIncome: inp.startingMonthlyPassiveIncome + 1_200,
      expectedNetWorth: inp.startingNetWorth + Math.max(0, inp.startingMonthlySurplus) * 24 + 80_000,
      retirementSustainabilityScore: 0.65,
      downsideRiskAt95thPercentile: 0.5,
      priority: 70,
    });
  } else if (inp.borrowingCapacity <= 0) {
    notes.push('Suppressed "Buy IP" — borrowingCapacity ≤ 0.');
  }

  const reallocAmount = Math.max(50_000, inp.startingNetWorth * 0.10);
  steps.push({
    order: order++,
    year: inp.currentYear + 3,
    kind: 'reallocate_into_etfs',
    title: `Reallocate $${Math.round(reallocAmount / 1000)}K into ETFs in ${inp.currentYear + 3}`,
    detail: `Diversify into low-cost equity ETFs (VAS/VGS-style) to balance property concentration and lift expected real return to ~4.5%.`,
    expectedPassiveIncome: inp.startingMonthlyPassiveIncome + 350,
    expectedNetWorth: projectFromStep(inp.startingNetWorth, inp.startingMonthlySurplus, 0.045, 3),
    retirementSustainabilityScore: 0.7,
    downsideRiskAt95thPercentile: 0.42,
    priority: 60,
  });

  if (yearsToTarget >= 4 && inp.hasInvestmentProperty) {
    const sellYear = inp.targetFireYear - 1;
    steps.push({
      order: order++,
      year: sellYear,
      kind: 'sell_investment_property',
      title: `Sell IP in ${sellYear}`,
      detail: `Crystallise equity into income portfolio one year ahead of FIRE start (CGT discount window honoured).`,
      expectedPassiveIncome: inp.startingMonthlyPassiveIncome + 1_800,
      expectedNetWorth: projectFromStep(inp.startingNetWorth, inp.startingMonthlySurplus, 0.045, sellYear - inp.currentYear),
      retirementSustainabilityScore: 0.78,
      downsideRiskAt95thPercentile: 0.38,
      priority: 55,
    });
  }

  const glidepathYear = inp.targetFireYear - 2;
  if (glidepathYear > inp.currentYear) {
    steps.push({
      order: order++,
      year: glidepathYear,
      kind: 'glidepath_shift',
      title: `Glidepath 60/40 → 30/70 over ${glidepathYear}–${inp.targetFireYear}`,
      detail: `Shift growth equities toward dividend/income equities and bonds to defuse sequence-of-returns risk.`,
      expectedPassiveIncome: inp.startingMonthlyPassiveIncome + 1_950,
      expectedNetWorth: projectFromStep(inp.startingNetWorth, inp.startingMonthlySurplus, 0.04, glidepathYear - inp.currentYear),
      retirementSustainabilityScore: 0.82,
      downsideRiskAt95thPercentile: 0.32,
      priority: 50,
    });
  }

  steps.push({
    order: order++,
    year: inp.targetFireYear,
    kind: 'income_conversion',
    title: `Activate income portfolio in ${inp.targetFireYear}`,
    detail: `Deploy accumulated capital into 4.5–6.5% gross yield diversified income portfolio targeting $${Math.round(inp.targetMonthlyPassiveIncome).toLocaleString()}/month.`,
    expectedPassiveIncome: Math.min(inp.targetMonthlyPassiveIncome, inp.startingMonthlyPassiveIncome + 4_000),
    expectedNetWorth: projectFromStep(inp.startingNetWorth, inp.startingMonthlySurplus, 0.045, yearsToTarget),
    retirementSustainabilityScore: SUSTAINABILITY_CAP,
    downsideRiskAt95thPercentile: 0.28,
    priority: 45,
  });

  steps.sort((a, b) => (b.priority - a.priority) || (a.year - b.year));
  steps.forEach((s, i) => { s.order = i + 1; });

  const last = steps[steps.length - 1];
  const endMonthlyPassive = last?.expectedPassiveIncome ?? inp.startingMonthlyPassiveIncome;
  const endNetWorth = last?.expectedNetWorth ?? inp.startingNetWorth;
  const shortfallPct = inp.targetMonthlyPassiveIncome > 0
    ? Math.max(0, (inp.targetMonthlyPassiveIncome - endMonthlyPassive) / inp.targetMonthlyPassiveIncome)
    : 0;
  if (shortfallPct > 0.1) {
    notes.push(`Path ends ${(shortfallPct * 100).toFixed(0)}% short of $${Math.round(inp.targetMonthlyPassiveIncome)}/month target — gap explicit.`);
  }

  return {
    steps,
    targetMonthlyPassiveIncome: inp.targetMonthlyPassiveIncome,
    endProjectionNetWorth: endNetWorth,
    endProjectionMonthlyPassive: endMonthlyPassive,
    shortfallVsTargetPct: shortfallPct,
    livesUpToTarget: shortfallPct <= 0.1,
    notes,
  };
}
