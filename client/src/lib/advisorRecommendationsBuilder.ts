/**
 * Sprint 20 PR-B P1-5 — Orchestrator that turns a recommendation context +
 * canonical ledger into a ranked list of AdvisorRecommendation[].
 *
 * - Builds household signals from the canonical context.
 * - Generates the catalog of candidate AdvisorActions for the household.
 * - For each action, applies feasibility gating, stress-test risks, and
 *   behavioural execution-fit, then assembles AdvisorRecommendation via the
 *   narrative engine.
 * - Applies the Sprint 19 scenario-08 cashflow guard: when monthly cashflow
 *   is negative or buffer < 1 month, the operational_stabilisation action is
 *   prepended with infinite priority.
 * - Applies the Sprint 19 scenario-04 life-stage gate: STATE_C/D/E push
 *   decumulation / glidepath / income-conversion actions above accumulation.
 * - Applies the Sprint 19 scenario-07 concentration fix: when any
 *   concentration flag is breached, rebalance_concentration is forced near
 *   the top with the breached flag (not allocations[0]) populating the WHAT.
 */

import type { ConcentrationFlag } from "./concentration/types";
import type { HouseholdLifeStage } from "./householdState/types";
import {
  buildAdvisorRecommendation,
  type AdvisorActionInput,
  type AdvisorRecommendation,
  type HouseholdSignals,
} from "./advisorNarrativeEngine";
import { decumulationOutranksAccumulation } from "./retirementTransition/decumulationSequencing";

export interface AdvisorBuildInputs {
  signals: HouseholdSignals;
  borrowingCapacity: number;
  liquidityBufferMonths: number;
  monthlyCashflow: number;
  executionFit?: { likelyAdherence: number };
  stressTopRisks?: Array<{ label: string; severity: 'low' | 'medium' | 'high'; mitigation: string }>;
}

interface CandidateAction {
  input: AdvisorActionInput;
  ranking: number;
  applies: boolean;
}

function defaultProposedYear(signals: HouseholdSignals, offsetYears: number): number {
  return Math.max(
    new Date().getFullYear() + 1,
    Math.min(signals.targetFireYear, new Date().getFullYear() + offsetYears),
  );
}

export function generateAdvisorRecommendations(
  inputs: AdvisorBuildInputs,
): AdvisorRecommendation[] {
  const { signals, borrowingCapacity, liquidityBufferMonths, monthlyCashflow, executionFit, stressTopRisks } = inputs;
  const breached = signals.concentrationRisks.find((r) => r.breached);
  const candidates: CandidateAction[] = [];

  if (monthlyCashflow < 0 || liquidityBufferMonths < 1) {
    candidates.push({
      input: {
        id: 'op_stab',
        actionKind: 'operational_stabilisation',
        proposedYear: new Date().getFullYear(),
        conciseLabel: 'Stabilise cashflow before investing',
        baseConfidence: 0.95,
      },
      ranking: 1000,
      applies: true,
    });
  }

  if (breached) {
    candidates.push({
      input: {
        id: `rebalance_${breached.kind}`,
        actionKind: 'rebalance_concentration',
        proposedYear: new Date().getFullYear() + 1,
        conciseLabel: `Reduce ${breached.kind.replace(/_/g, ' ')}`,
        baseConfidence: 0.82,
        successDelta: 0.05,
      },
      ranking: 920,
      applies: true,
    });
  }

  if (liquidityBufferMonths < 3) {
    candidates.push({
      input: {
        id: 'buffer',
        actionKind: 'build_buffer',
        proposedYear: new Date().getFullYear() + 1,
        proposedDollarAmount: Math.max(20_000, signals.monthlyIncome * 3),
        conciseLabel: 'Build liquidity buffer',
        baseConfidence: 0.85,
        successDelta: 0.04,
      },
      ranking: 880,
      applies: true,
    });
  }

  const lifeStageLetter = signals.lifeStage;
  const stageNeedsDecumulation = decumulationOutranksAccumulation(lifeStageLetter as HouseholdLifeStage);

  candidates.push({
    input: {
      id: 'income_conversion',
      actionKind: 'income_conversion',
      proposedYear: signals.targetFireYear,
      proposedDollarAmount: signals.netWorth,
      conciseLabel: 'Activate income-conversion portfolio',
      baseConfidence: 0.78,
      monthlyPassiveDelta: Math.max(0, signals.targetMonthlyPassive - signals.baselineMonthlyPassive),
    },
    ranking: stageNeedsDecumulation ? 950 : 600,
    applies: true,
  });

  candidates.push({
    input: {
      id: 'glidepath',
      actionKind: 'glidepath_shift',
      proposedYear: Math.max(signals.targetFireYear - 3, new Date().getFullYear() + 1),
      conciseLabel: 'Glidepath equity → income',
      baseConfidence: 0.74,
      successDelta: 0.03,
    },
    ranking: stageNeedsDecumulation ? 940 : 540,
    applies: signals.equitySharePct >= 50 && signals.yearsToTarget <= 12,
  });

  candidates.push({
    input: {
      id: 'increase_cash_reserve',
      actionKind: 'increase_cash_reserve',
      proposedYear: defaultProposedYear(signals, 2),
      proposedDollarAmount: Math.max(50_000, signals.monthlyIncome * 9),
      conciseLabel: 'Increase cash reserve (sequence-risk)',
      baseConfidence: 0.7,
    },
    ranking: stageNeedsDecumulation ? 900 : 520,
    applies: stageNeedsDecumulation,
  });

  candidates.push({
    input: {
      id: 'etf_dca',
      actionKind: 'etf_dca',
      proposedYear: defaultProposedYear(signals, 1),
      proposedDollarAmount: Math.max(1000, signals.monthlySurplus * 0.6),
      conciseLabel: 'Increase ETF DCA',
      baseConfidence: 0.72,
      fireYearDelta: -0.6,
      nwDelta: 75_000,
    },
    ranking: stageNeedsDecumulation ? 300 : 750,
    applies: signals.monthlySurplus > 500 && monthlyCashflow >= 0,
  });

  candidates.push({
    input: {
      id: 'reduce_debt',
      actionKind: 'reduce_debt',
      proposedYear: defaultProposedYear(signals, 1),
      proposedDollarAmount: Math.max(500, signals.monthlySurplus * 0.3),
      conciseLabel: 'Accelerate high-APR debt',
      baseConfidence: 0.8,
      successDelta: 0.03,
    },
    ranking: signals.debtServiceRatio > 0.25 ? 700 : 400,
    applies: signals.debtServiceRatio > 0.15,
  });

  if (borrowingCapacity > 50_000 && signals.yearsToTarget >= 7 && !stageNeedsDecumulation && monthlyCashflow > 0) {
    candidates.push({
      input: {
        id: 'buy_property',
        actionKind: 'buy_property',
        proposedYear: defaultProposedYear(signals, 2),
        proposedDollarAmount: Math.min(borrowingCapacity * 0.2, 200_000),
        conciseLabel: 'Acquire investment property',
        baseConfidence: 0.68,
        nwDelta: 120_000,
      },
      ranking: 600,
      applies: true,
    });
  }

  if (signals.propertyExposurePct > 60 && stageNeedsDecumulation) {
    candidates.push({
      input: {
        id: 'sell_property',
        actionKind: 'sell_property',
        proposedYear: signals.targetFireYear - 1,
        conciseLabel: 'Sell weakest IP',
        baseConfidence: 0.74,
        nwDelta: -50_000,
        monthlyPassiveDelta: 800,
      },
      ranking: 850,
      applies: true,
    });
  }

  candidates.sort((a, b) => b.ranking - a.ranking);

  return candidates
    .filter((c) => c.applies)
    .map((c) =>
      buildAdvisorRecommendation({
        action: c.input,
        signals,
        executionFit,
        stressRisks: stressTopRisks,
      }),
    );
}

export interface ConcentrationGuard {
  flags: Array<ConcentrationFlag & { breached: boolean }>;
}
