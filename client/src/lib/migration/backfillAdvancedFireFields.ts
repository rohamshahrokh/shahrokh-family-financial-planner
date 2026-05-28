/**
 * migration/backfillAdvancedFireFields.ts — Sprint 20 PR-F2.
 *
 * One-shot helper that backfills the three F2 advanced columns
 * (`target_net_worth`, `min_liquidity_buffer_months`, `max_risk_tolerance`)
 * from the existing F1 round-tripped JSON sub-key
 * `action_checklist.__advanced_fire` (and any historical localStorage
 * persistence) into the dedicated Supabase columns added by
 * `20260528120000_pr_f2_advanced_fire_columns.sql`.
 *
 * Idempotence:
 *   - Sets `localStorage["__advanced_fire_backfilled"] = "true"` after a
 *     successful backfill so the helper short-circuits on subsequent calls.
 *   - The PUT body only includes fields the row currently has null for —
 *     filled fields are never overwritten (the column read takes precedence
 *     anyway, but writing again would be wasted work).
 *
 * Safety:
 *   - If the row read fails, the helper returns `{ status: "skip", reason }`
 *     and does NOT mark the flag, so a later call can retry.
 *   - All network access goes through `apiRequest` (the project's
 *     fetch shim) — no direct Supabase client calls from the browser.
 *
 * Apply order:
 *   1. User/CI runs the SQL migration on the Supabase project.
 *   2. App is reloaded; on first authenticated mount, call
 *      `backfillAdvancedFireFields()`. The first call discovers the
 *      column shape and writes any missing values from the JSON bundle.
 *   3. The localStorage sentinel prevents future calls from doing work.
 */

import { apiRequest } from "../queryClient";
import { ADVANCED_FIRE_CHECKLIST_KEY } from "../fireGoalCanonical";
import type { CanonicalFireAdvancedSettings } from "@/types/canonicalFire";

export const BACKFILL_FLAG_KEY = "__advanced_fire_backfilled" as const;

/** Result envelope so callers can log without parsing exceptions. */
export type BackfillResult =
  | { status: "ok"; wrote: Partial<CanonicalFireAdvancedSettings>; }
  | { status: "noop"; reason: string }
  | { status: "skip"; reason: string };

function readLocalFlag(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(BACKFILL_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

function setLocalFlag(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(BACKFILL_FLAG_KEY, "true");
  } catch {
    // localStorage can be unavailable in the deployed iframe; silently
    // accept that we'll re-run the no-op next session.
  }
}

/**
 * Read the localStorage-cached advanced bundle (legacy persistence from
 * before F1's server-side JSON round-trip). Tolerant of missing/malformed
 * data — never throws.
 */
function readLegacyLocalAdvanced(): CanonicalFireAdvancedSettings | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem("fwl.advancedFire.v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: CanonicalFireAdvancedSettings = {};
    if (typeof parsed.targetNetWorth === "number" && Number.isFinite(parsed.targetNetWorth) && parsed.targetNetWorth > 0) {
      out.targetNetWorth = parsed.targetNetWorth;
    }
    if (typeof parsed.minLiquidityBufferMonths === "number" && Number.isFinite(parsed.minLiquidityBufferMonths) && parsed.minLiquidityBufferMonths >= 0) {
      out.minLiquidityBufferMonths = parsed.minLiquidityBufferMonths;
    }
    const rt = parsed.maxRiskTolerance;
    if (rt === "conservative" || rt === "balanced" || rt === "growth") {
      out.maxRiskTolerance = rt;
    }
    if (typeof parsed.safeWithdrawalRateOverride === "number" && Number.isFinite(parsed.safeWithdrawalRateOverride) && parsed.safeWithdrawalRateOverride > 0) {
      out.safeWithdrawalRateOverride = parsed.safeWithdrawalRateOverride;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Compute the partial PUT body — only fields the row currently has null
 * for AND for which we have a non-null source value.
 */
export function diffAdvancedFromRow(
  row: Record<string, unknown> | null | undefined,
  source: CanonicalFireAdvancedSettings | null,
): Partial<Record<string, number | string | null>> {
  if (!row || !source) return {};
  const out: Partial<Record<string, number | string | null>> = {};
  if (row.target_net_worth == null && typeof source.targetNetWorth === "number") {
    out.target_net_worth = source.targetNetWorth;
  }
  if (row.min_liquidity_buffer_months == null && typeof source.minLiquidityBufferMonths === "number") {
    out.min_liquidity_buffer_months = source.minLiquidityBufferMonths;
  }
  if (row.max_risk_tolerance == null && typeof source.maxRiskTolerance === "string") {
    out.max_risk_tolerance = source.maxRiskTolerance;
  }
  return out;
}

/**
 * Run the one-shot backfill. Idempotent: re-running after success is a
 * no-op (the localStorage flag short-circuits on entry).
 */
export async function backfillAdvancedFireFields(): Promise<BackfillResult> {
  if (readLocalFlag()) {
    return { status: "noop", reason: "already backfilled (localStorage flag set)" };
  }

  let row: Record<string, unknown> | null = null;
  try {
    const r = await apiRequest("GET", "/api/mc-fire-settings");
    row = (await r.json()) as Record<string, unknown> | null;
  } catch (e) {
    return { status: "skip", reason: `row GET failed: ${(e as Error).message}` };
  }

  if (!row) return { status: "skip", reason: "no row returned" };

  // Source = JSON bundle (preferred) OR legacy localStorage (fallback).
  let source: CanonicalFireAdvancedSettings | null = null;
  const checklist = row.action_checklist as Record<string, unknown> | null | undefined;
  if (checklist && typeof checklist === "object") {
    const raw = checklist[ADVANCED_FIRE_CHECKLIST_KEY];
    if (raw && typeof raw === "object") {
      source = raw as CanonicalFireAdvancedSettings;
    }
  }
  if (!source) source = readLegacyLocalAdvanced();
  if (!source) {
    // Nothing to copy in. Mark backfilled so we never look again.
    setLocalFlag();
    return { status: "noop", reason: "no source values to backfill" };
  }

  const body = diffAdvancedFromRow(row, source);
  if (Object.keys(body).length === 0) {
    setLocalFlag();
    return { status: "noop", reason: "all target columns already populated" };
  }

  try {
    await apiRequest("PUT", "/api/mc-fire-settings", body);
  } catch (e) {
    return { status: "skip", reason: `PUT failed: ${(e as Error).message}` };
  }

  setLocalFlag();
  // Project the column body back into the canonical shape for the caller.
  const wrote: Partial<CanonicalFireAdvancedSettings> = {};
  if (typeof body.target_net_worth === "number") wrote.targetNetWorth = body.target_net_worth;
  if (typeof body.min_liquidity_buffer_months === "number") wrote.minLiquidityBufferMonths = body.min_liquidity_buffer_months;
  if (typeof body.max_risk_tolerance === "string" && (body.max_risk_tolerance === "conservative" || body.max_risk_tolerance === "balanced" || body.max_risk_tolerance === "growth")) {
    wrote.maxRiskTolerance = body.max_risk_tolerance;
  }
  return { status: "ok", wrote };
}

/** Test-only — clears the localStorage sentinel. */
export function __resetBackfillFlagForTests(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(BACKFILL_FLAG_KEY);
  } catch {
    // intentional no-op
  }
}
