/**
 * fireGoalCanonical.migration.ts — Sprint 20 PR-A migration shim.
 *
 * One-time, idempotent migration: reads any legacy persisted FIRE goal fields
 * (top-level snapshot keys `fire_target_age`, `fire_target_monthly_income`,
 * `safe_withdrawal_rate`; or legacy local-storage keys `fireAge`, `targetAge`,
 * `targetIncome`, `swr`) and synthesises a `CanonicalFireGoal` written
 * through the canonical writer.
 *
 * The shim is intentionally temporary — once one production cycle has elapsed
 * and all snapshots have been touched, the call site in `App.tsx` and this
 * file can be removed.
 *
 * // REMOVE in Sprint 21 after one production cycle.
 */

import type { CanonicalFireGoal } from "./fireGoalCanonical";
import {
  defaultTargetFireYear,
  deriveTargetAge,
  targetYearFromAge,
} from "./fireGoalCanonical";
import type { CanonicalFireTarget } from "@/types/canonicalFire";

/** Source shape we can migrate FROM. */
export interface LegacyFireGoalSource {
  /** Snapshot row (mc_fire_settings or sf_snapshot top-level fields). */
  snapshot?: {
    fire_target_age?: number | null;
    fire_target_monthly_income?: number | null;
    safe_withdrawal_rate?: number | null;
    target_fire_age?: number | null;
    target_passive_monthly?: number | null;
    swr_pct?: number | null;
    [k: string]: unknown;
  } | null;
  /** Legacy local-storage shape some early-Sprint code wrote. */
  legacyStore?: {
    fireAge?: number | null;
    targetAge?: number | null;
    targetIncome?: number | null;
    swr?: number | null;
  } | null;
  /** Household current age, used for age ↔ year conversion. */
  currentAge?: number;
}

/** Result of the migration synthesis step. */
export type MigrationResult =
  | { migrated: false; reason: string }
  | { migrated: true; canonical: CanonicalFireGoal; legacyKeysFound: string[] };

const MIGRATED_FLAG_KEY = "_canonicalFireMigratedAt";

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Pure synthesis step — no I/O. Reads legacy fields and returns a canonical
 * shape (or a reason for skipping). Exported so unit tests can pin the
 * before/after key mapping without mocking storage.
 */
export function synthesiseCanonicalFireGoal(
  source: LegacyFireGoalSource,
): MigrationResult {
  const snap = source.snapshot ?? {};
  const legacy = source.legacyStore ?? {};
  const legacyKeysFound: string[] = [];

  const legacyAge =
    (isFinitePositive(snap.target_fire_age) && (legacyKeysFound.push("target_fire_age"), snap.target_fire_age)) ||
    (isFinitePositive(snap.fire_target_age) && (legacyKeysFound.push("fire_target_age"), snap.fire_target_age)) ||
    (isFinitePositive(legacy.targetAge) && (legacyKeysFound.push("targetAge"), legacy.targetAge)) ||
    (isFinitePositive(legacy.fireAge) && (legacyKeysFound.push("fireAge"), legacy.fireAge)) ||
    null;

  const legacyMonthly =
    (isFinitePositive(snap.target_passive_monthly) && (legacyKeysFound.push("target_passive_monthly"), snap.target_passive_monthly)) ||
    (isFinitePositive(snap.fire_target_monthly_income) && (legacyKeysFound.push("fire_target_monthly_income"), snap.fire_target_monthly_income)) ||
    (isFinitePositive(legacy.targetIncome) && (legacyKeysFound.push("targetIncome"), legacy.targetIncome)) ||
    null;

  const legacySwr =
    (isFinitePositive(snap.swr_pct) && (legacyKeysFound.push("swr_pct"), snap.swr_pct)) ||
    (isFinitePositive(snap.safe_withdrawal_rate) && (legacyKeysFound.push("safe_withdrawal_rate"), snap.safe_withdrawal_rate)) ||
    (isFinitePositive(legacy.swr) && (legacyKeysFound.push("swr"), legacy.swr)) ||
    null;

  if (legacyAge === null && legacyMonthly === null && legacySwr === null) {
    return { migrated: false, reason: "no legacy FIRE goal fields present" };
  }

  const targetFireYear =
    legacyAge !== null
      ? targetYearFromAge(legacyAge as number, source.currentAge)
      : defaultTargetFireYear();

  const targetMonthlyPassiveIncome =
    legacyMonthly !== null ? (legacyMonthly as number) : 0;

  const canonical: CanonicalFireGoal = {
    targetFireYear,
    targetMonthlyPassiveIncome,
    derivedTargetAge:
      deriveTargetAge(targetFireYear, source.currentAge) ??
      (legacyAge as number | undefined),
    derivedRequiredAssetBase:
      targetMonthlyPassiveIncome > 0 && legacySwr !== null
        ? (targetMonthlyPassiveIncome * 12) / ((legacySwr as number) / 100)
        : undefined,
    swrOverride: legacySwr !== null ? (legacySwr as number) : undefined,
    updatedAt: new Date().toISOString(),
  };

  return { migrated: true, canonical, legacyKeysFound };
}

/**
 * Top-level entry point — checks the migration flag, runs synthesis, persists
 * via the provided writer if a canonical record was produced. Idempotent:
 * once flagged, subsequent calls are a no-op.
 *
 * The writer signature matches the existing `/api/mc-fire-settings` PUT body
 * so we don't need a new endpoint.
 */
export async function runFireGoalMigration(args: {
  source: LegacyFireGoalSource;
  /** Returns the current flag value (e.g. read from sessionStorage). */
  readFlag: () => string | null;
  /** Writes the flag once migration completes. */
  writeFlag: (iso: string) => void;
  /** Persists the migrated canonical record. */
  writeCanonical: (body: {
    target_fire_age: number;
    target_passive_monthly: number;
    swr_pct: number;
    goals_set: true;
    goal_set_timestamp: string;
  }) => Promise<unknown>;
  /** Optional logger for engineer debugging. */
  log?: (msg: string, detail?: unknown) => void;
}): Promise<MigrationResult & { skipped?: true }> {
  const log = args.log ?? ((m, d) => console.info(m, d));
  const existing = args.readFlag();
  if (existing) {
    return { migrated: false, reason: `already migrated at ${existing}`, skipped: true };
  }
  const synth = synthesiseCanonicalFireGoal(args.source);
  if (!synth.migrated) {
    args.writeFlag(new Date().toISOString());
    log("[fireGoalCanonical.migration] no legacy fields, flagging migrated", synth);
    return synth;
  }
  const ageForPersist =
    synth.canonical.derivedTargetAge ??
    (args.source.currentAge !== undefined
      ? args.source.currentAge +
        (synth.canonical.targetFireYear - new Date().getFullYear())
      : 55);
  const swrForPersist =
    synth.canonical.swrOverride !== undefined ? synth.canonical.swrOverride : 4;
  await args.writeCanonical({
    target_fire_age: Math.max(18, Math.min(99, Math.round(ageForPersist))),
    target_passive_monthly: synth.canonical.targetMonthlyPassiveIncome,
    swr_pct: swrForPersist,
    goals_set: true,
    goal_set_timestamp: synth.canonical.updatedAt,
  });
  args.writeFlag(synth.canonical.updatedAt);
  log(
    "[fireGoalCanonical.migration] migrated legacy keys",
    { legacyKeysFound: synth.legacyKeysFound, canonical: synth.canonical },
  );
  return synth;
}

export { MIGRATED_FLAG_KEY };

/**
 * Sprint 20 PR-F1 — map a CanonicalFireGoal (legacy interface that still backs
 * the in-flight Sprint 20 PR-A reader/writer) onto the canonical
 * CanonicalFireTarget shape consumed by F1+ engines.
 *
 * The output is deliberately minimal: only the two primary fields, plus an
 * advanced.safeWithdrawalRateOverride when the user has saved an explicit
 * percentage. The advanced fields targetNetWorth / minLiquidityBufferMonths /
 * maxRiskTolerance are NOT stored in mc_fire_settings yet — they live on the
 * in-memory canonical target so F1's UI can edit them; F2/F3 will add their
 * persistence path when those engines come online.
 */
export function toCanonicalFireTarget(
  goal: CanonicalFireGoal,
): CanonicalFireTarget {
  const advancedSwr =
    Number.isFinite(goal.swrOverride) && (goal.swrOverride as number) > 0
      ? (goal.swrOverride as number) / 100
      : undefined;
  const target: CanonicalFireTarget = {
    targetFireYear: goal.targetFireYear,
    targetPassiveIncomeMonthly: goal.targetMonthlyPassiveIncome,
  };
  if (advancedSwr !== undefined) {
    target.advanced = { safeWithdrawalRateOverride: advancedSwr };
  }
  return target;
}

/**
 * Sprint 20 PR-F1 — synthesise a CanonicalFireTarget directly from a legacy
 * source. Convenience wrapper around synthesiseCanonicalFireGoal that adapts
 * the percentage-style swrOverride into the decimal-style override the
 * canonical target type uses (e.g. legacy swr_pct=4 → 0.04).
 *
 * Returns null when no legacy fields are present.
 */
export function synthesiseCanonicalFireTarget(
  source: LegacyFireGoalSource,
): CanonicalFireTarget | null {
  const synth = synthesiseCanonicalFireGoal(source);
  if (!synth.migrated) return null;
  return toCanonicalFireTarget(synth.canonical);
}
