/**
 * goalValidation.ts — Sprint 13 P0-3.
 *
 * Validates whether the user has actually persisted enough FIRE-goal
 * information for the engine to render a feasibility verdict. The
 * audit found that Portfolio Lab was producing $6M target net worth
 * and $240k/yr passive-income figures from the schema default value of
 * `fire_target_monthly_income = 20000`, with no way to distinguish
 * "user set $20k" from "schema default $20k".
 *
 * This module is the gate. `validateGoalTargets()` returns INCOMPLETE
 * when any of (requiredNetWorth, requiredPassiveIncome, targetFireYear)
 * has not been persisted, AND when the snapshot's
 * `fire_target_monthly_income` is the schema default and the user never
 * explicitly set it (signalled by the
 * `fire_target_monthly_income_set_at` column — null = never set).
 */

import type { GoalSolverProTargets } from "./goalSolverPro";

export interface GoalTargetsSnapshot extends GoalSolverProTargets {
  /**
   * The snapshot value of fire_target_monthly_income (may be the schema
   * default of $20,000 OR a user override).
   */
  fireTargetMonthlyIncomeRaw?: number | null;
  /**
   * Set-at timestamp (ISO string). When `null`/`undefined`, the user has
   * NEVER persisted the FIRE target — the column still holds the schema
   * default and MUST NOT be used to derive $240k/yr or $6M.
   */
  fireTargetMonthlyIncomeSetAt?: string | null;
  /** Persisted FIRE target age, if any. */
  fireTargetAge?: number | null;
}

export type GoalValidationStatus = "VALID" | "INCOMPLETE";

export type GoalValidationField =
  | "requiredNetWorth"
  | "requiredPassiveIncome"
  | "targetFireYear"
  | "fireTargetMonthlyIncomeExplicitSet";

export interface GoalValidationResult {
  status: GoalValidationStatus;
  missingFields: GoalValidationField[];
  /** Human-readable explanation for the audit panel. */
  reason: string;
}

const isMissingNumber = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    if (v.trim() === "") return true;
    const n = parseFloat(v);
    return !Number.isFinite(n);
  }
  if (typeof v === "number") return !Number.isFinite(v);
  return true;
};

/**
 * Pure validation.
 *
 * Rules:
 *   - `requiredNetWorth` MUST be present (>0 or zero set explicitly).
 *   - `requiredPassiveIncome` MUST be present.
 *   - `targetFireYear` MUST be present (or its alias targetRetirementYear).
 *   - The fire_target_monthly_income snapshot column MUST have been
 *     explicitly set by the user (we detect this via the
 *     `fire_target_monthly_income_set_at` column — null means schema
 *     default, treat as missing).
 */
export function validateGoalTargets(
  targets: GoalTargetsSnapshot | null | undefined,
): GoalValidationResult {
  if (targets == null) {
    return {
      status: "INCOMPLETE",
      missingFields: [
        "requiredNetWorth",
        "requiredPassiveIncome",
        "targetFireYear",
        "fireTargetMonthlyIncomeExplicitSet",
      ],
      reason: "No goal targets persisted.",
    };
  }

  const missing: GoalValidationField[] = [];

  if (isMissingNumber(targets.targetNetWorth)) {
    missing.push("requiredNetWorth");
  }

  // The passive-income target may be persisted as either annual or monthly.
  if (
    isMissingNumber(targets.targetPassiveIncomeAnnual) &&
    isMissingNumber(targets.targetPassiveIncomeMonthly)
  ) {
    missing.push("requiredPassiveIncome");
  }

  if (
    isMissingNumber(targets.targetFireYear) &&
    isMissingNumber(targets.targetRetirementYear)
  ) {
    missing.push("targetFireYear");
  }

  // fire_target_monthly_income explicit-set check — the cornerstone of the
  // audit's "stop using $20k schema default to derive $240k/$6M" rule.
  const setAt = targets.fireTargetMonthlyIncomeSetAt;
  const rawSetExplicitly =
    setAt !== null && setAt !== undefined && String(setAt).trim() !== "";
  if (!rawSetExplicitly) {
    missing.push("fireTargetMonthlyIncomeExplicitSet");
  }

  if (missing.length === 0) {
    return { status: "VALID", missingFields: [], reason: "All goal targets persisted." };
  }
  return {
    status: "INCOMPLETE",
    missingFields: missing,
    reason: `Missing fields: ${missing.join(", ")}`,
  };
}

/** Sentinel rendered when feasibility is INCOMPLETE. */
export const GOAL_INCOMPLETE_TEXT =
  "Goal feasibility unavailable — required targets not set.";
