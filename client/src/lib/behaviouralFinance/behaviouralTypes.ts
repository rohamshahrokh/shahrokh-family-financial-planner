/**
 * Sprint 18 Phase 18.3 — Behavioural Finance types.
 *
 * A "behavioural risk" is a real-world friction that can cause a financially
 * sound plan to fail in execution: leverage stress, cash anxiety, panic
 * selling, lifestyle creep, complexity overload, etc.
 *
 * These are attached to Recommendation and OptimisedPath via additive fields.
 */

export type ExecutionDifficulty = "low" | "medium" | "high";

export type BehaviouralWarningKind =
  | "high_leverage_stress"
  | "cash_anxiety"
  | "panic_selling_risk"
  | "crypto_overconfidence"
  | "property_overconfidence"
  | "lifestyle_creep"
  | "low_surplus_discipline"
  | "plan_complexity"
  | "simultaneous_action_overload"
  | "risk_tolerance_mismatch"
  | "family_stage_pressure";

export interface BehaviouralWarning {
  kind: BehaviouralWarningKind;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface BehaviouralRisk {
  behaviouralFitScore: number;     // 0..1
  executionDifficulty: ExecutionDifficulty;
  /** 0..1 — likelihood the household actually carries this out. */
  likelyAdherence: number;
  behaviourWarnings: BehaviouralWarning[];
  /** Plain English summary for the explanation layer. */
  note: string;
}

export interface InvestorProfile {
  riskTolerance: number;           // -1..+1
  liquidityPreference: number;     // 0..1 (higher = more cash anxiety)
  fireUrgency: number;             // 0..1
  cryptoBias: number;              // 0..1
  propertyBias: number;            // 0..1
  debtAversion: number;            // 0..1
}
