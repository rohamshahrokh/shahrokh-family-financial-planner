/**
 * Sprint 18 Phase 18.1 — Path Optimisation types.
 *
 * A "Path" is a 2–4 step sequence of strategic actions evaluated as a whole,
 * not a single next-best move. The optimiser ranks paths using the user's
 * exact 7-component scoring formula.
 *
 * Hard rule (user): the highest-return path must NOT automatically win.
 * Safety and behavioural fit can outrank raw FIRE acceleration.
 */

import type { ActionType, StrategicPillar } from "../recommendationEngine/types";

export type PathArchetype =
  | "debt_first"
  | "property_led"
  | "liquid_growth"
  | "risk_reduction"
  | "fire_protection";

export interface PathStep {
  order: number;
  actionType: ActionType;
  title: string;
  description: string;
  pillar: StrategicPillar;
  estimatedMonthsFromStart: number;
  estimatedMonthlyAmount?: number;
  evidence: string[];
}

export interface PathScoreComponents {
  fireAccelerationScore: number;       // 0..1
  successProbabilityScore: number;     // 0..1
  riskAdjustedReturnScore: number;     // 0..1
  feasibilityScore: number;            // 0..1
  liquiditySafetyScore: number;        // 0..1
  behaviouralFitScore: number;         // 0..1
  taxEfficiencyScore: number;          // 0..1
  penalties: number;                   // additive deduction, 0..1
}

export interface PathStressSummary {
  scenariosTested: number;
  scenariosSurvived: number;
  mainWeakness: string | null;
  survivalRate: number;                // 0..1
}

export interface OptimisedPath {
  id: string;
  archetype: PathArchetype;
  title: string;
  summary: string;
  steps: PathStep[];
  score: number;                       // 0..100 — final scaled
  scoreComponents: PathScoreComponents;
  expectedFireDeltaMonths: number | null;
  expectedSuccessProbabilityDelta: number | null;
  expectedNetWorthDelta: number | null;
  feasibility: {
    feasible: boolean;
    blockers: string[];
    requiredConditions: string[];
  };
  stressTest?: PathStressSummary;
  behaviouralNote: string;
  reasoning: string;
  /** True only after stress test + behavioural penalty have been applied. */
  finalised: boolean;
}
