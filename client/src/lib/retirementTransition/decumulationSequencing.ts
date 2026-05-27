/**
 * Sprint 20 PR-B P1-1.4 — Decumulation sequencing.
 *
 * Decides withdrawal order across property / ETFs / bonds / cash bucket.
 * Output is ranked life-stage-aware: STATE_C (Near FIRE), STATE_D (FIRE
 * Achieved), STATE_E (Decumulation) — these strategies always rank ABOVE
 * accumulation paths. Implemented here so it composes with pathScoring.
 */

import type { HouseholdLifeStage } from "../householdState/types";
import type { DecumulationPlan } from "./types";

interface SequencingInputs {
  lifeStage: HouseholdLifeStage;
  monthlyTarget: number;
  liquidAssets: number;
  propertyEquity: number;
  hasInvestmentProperty: boolean;
  riskTolerance: number;
  liquidityBufferMonths: number;
}

function lifeStageLetter(stage: HouseholdLifeStage): 'A' | 'B' | 'C' | 'D' | 'E' {
  switch (stage) {
    case 'STATE_A_ACCUMULATION': return 'A';
    case 'STATE_B_ACCELERATING': return 'B';
    case 'STATE_C_NEAR_FIRE': return 'C';
    case 'STATE_D_FIRE_ACHIEVED': return 'D';
    case 'STATE_E_DECUMULATION': return 'E';
  }
}

export function generateDecumulationPlans(
  inputs: SequencingInputs,
): DecumulationPlan[] {
  const letter = lifeStageLetter(inputs.lifeStage);
  const monthly = Math.max(0, inputs.monthlyTarget);
  const baseBuffer = Math.max(12, Math.min(24, inputs.liquidityBufferMonths || 12));

  const plans: DecumulationPlan[] = [
    {
      sequence: 'cash_bucket',
      monthlyBudget: monthly,
      bufferMonths: 24,
      rebalanceTriggers: [
        'Top up cash sleeve when portfolio drawdown < 15%',
        'Convert another year of expenses to cash if 12-month equity return < -10%',
      ],
      rationale: '24 months cash + 36 months bonds + remainder growth — defuses sequence-of-returns risk in the first 5 years of retirement',
      ranking: letter === 'C' || letter === 'D' || letter === 'E' ? 1 : 4,
      applicableLifeStage: letter,
    },
    {
      sequence: 'etfs_first',
      monthlyBudget: monthly,
      bufferMonths: baseBuffer,
      rebalanceTriggers: [
        'Pause property liquidation when ETF withdrawals exceed 5% real',
        'Resume after equity drawdown recovers to within 5% of prior peak',
      ],
      rationale: 'Draw from liquid ETF income first to preserve property rental yield and CGT discount window',
      ranking: letter === 'C' || letter === 'D' || letter === 'E' ? 2 : 3,
      applicableLifeStage: letter,
    },
    {
      sequence: 'blended',
      monthlyBudget: monthly,
      bufferMonths: baseBuffer,
      rebalanceTriggers: [
        'Trim from the over-weight sleeve when allocation drift > 10%',
        'Rebalance to target every 12 months',
      ],
      rationale: 'Take 60% of income from ETF/bond yield, 40% from rental — diversifies failure modes',
      ranking: letter === 'C' || letter === 'D' || letter === 'E' ? 3 : 2,
      applicableLifeStage: letter,
    },
    {
      sequence: 'property_first',
      monthlyBudget: monthly,
      bufferMonths: baseBuffer,
      rebalanceTriggers: [
        'Sell first IP if rental cashflow drops below 3% net yield',
        'Re-evaluate after CGT discount window resets',
      ],
      rationale: 'Liquidate property exposure early to lock equity into income-producing financial assets',
      ranking: letter === 'C' || letter === 'D' || letter === 'E' ? 4 : 5,
      applicableLifeStage: letter,
    },
  ];

  if (!inputs.hasInvestmentProperty) {
    return plans.filter((p) => p.sequence !== 'property_first');
  }
  plans.sort((a, b) => a.ranking - b.ranking);
  return plans;
}

/**
 * Sprint 19 backlog fix (Scenario 04 / Sprint 17 §): for STATE_C / D / E,
 * decumulation candidates MUST rank above any accumulation path. This guard
 * returns true when the scoring code should prepend decumulation strategies
 * regardless of any other score signal.
 */
export function decumulationOutranksAccumulation(
  stage: HouseholdLifeStage,
): boolean {
  return (
    stage === 'STATE_C_NEAR_FIRE' ||
    stage === 'STATE_D_FIRE_ACHIEVED' ||
    stage === 'STATE_E_DECUMULATION'
  );
}
