/**
 * Sprint 17 Phase 17.2 — Household life-stage classification.
 *
 * Five states drive rule gating (Phase 17.3), decumulation candidates
 * (Phase 17.7), and the quality rubric's suitability axis (Phase 17.1).
 *
 * The state is a transparent function of FIRE progress + current age vs
 * target FIRE age — no ML, no opaque heuristics.
 */

export type HouseholdLifeStage =
  | 'STATE_A_ACCUMULATION' // FIRE progress < 50%
  | 'STATE_B_ACCELERATING' // 50–85%
  | 'STATE_C_NEAR_FIRE'    // 85–100% on track
  | 'STATE_D_FIRE_ACHIEVED' // >= 100% AND MC success >= 0.75
  | 'STATE_E_DECUMULATION'; // currentAge >= targetFireAge OR drawdown active

export interface LifeStageClassification {
  primary: HouseholdLifeStage;
  /** Distance to nearest threshold, normalised 0..1. */
  confidence: number;
  /** Human-readable evidence list. */
  reasons: string[];
}
