/**
 * canonicalGoal.ts — FWL Remediation Phase A-2.
 *
 * The single, server-side source of truth for the user's FIRE goal.
 *
 * Reads ONLY from `mc_fire_settings`. If `goals_set` is false OR any required
 * field is missing, returns `{ status: "NOT_SET" }` — the UI must then surface
 * "Goal not set" rather than fabricating defaults.
 *
 * NO hardcoded SWR / FIRE-age / target fallbacks. NO reads from sf_app_settings,
 * sf_scenarios, or sf_snapshot. Phase B will rewire the scattered callsites
 * onto this selector.
 */

const SUPABASE_URL = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";
const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

export type CanonicalGoal =
  | { status: "NOT_SET"; reason: string }
  | {
      status: "SET";
      targetFireAge: number;
      targetPassiveMonthly: number;
      swrPct: number;
      targetPassiveAnnual: number;
      targetNetWorth: number;
      goalSetTimestamp: string;
      source: "mc_fire_settings";
    };

export interface McFireSettingsRow {
  id?: string;
  goals_set?: boolean | null;
  goal_set_timestamp?: string | null;
  target_fire_age?: number | null;
  target_passive_monthly?: number | null;
  swr_pct?: number | null;
  updated_at?: string | null;
}

/**
 * Fetch the single mc_fire_settings row for the owner. Returns null on any
 * network/RLS failure. Injected fetcher supported for unit tests.
 */
async function fetchMcFireSettings(
  ownerId: string,
  fetcher: typeof fetch = fetch,
): Promise<McFireSettingsRow | null> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/mc_fire_settings?id=eq.${encodeURIComponent(ownerId)}&limit=1`;
    const res = await fetcher(url, { headers: SB_HEADERS });
    if (!res.ok) return null;
    const rows = (await res.json()) as McFireSettingsRow[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Pure derivation from a row to a CanonicalGoal. Exported for unit tests so
 * they don't need to stub HTTP.
 */
export function deriveCanonicalGoal(row: McFireSettingsRow | null): CanonicalGoal {
  if (!row) {
    return { status: "NOT_SET", reason: "mc_fire_settings row not found for owner" };
  }
  if (row.goals_set !== true) {
    return {
      status: "NOT_SET",
      reason: "goals_set is false — user has not explicitly saved a FIRE goal",
    };
  }
  const swrPct = typeof row.swr_pct === "number" ? row.swr_pct : null;
  if (swrPct === null || !Number.isFinite(swrPct) || swrPct <= 0) {
    return {
      status: "NOT_SET",
      reason: "swr_pct is null, zero, or non-finite — cannot derive FIRE number",
    };
  }
  const targetFireAge =
    typeof row.target_fire_age === "number" && Number.isFinite(row.target_fire_age)
      ? row.target_fire_age
      : null;
  const targetPassiveMonthly =
    typeof row.target_passive_monthly === "number" &&
    Number.isFinite(row.target_passive_monthly)
      ? row.target_passive_monthly
      : null;
  if (targetFireAge === null) {
    return { status: "NOT_SET", reason: "target_fire_age is missing" };
  }
  if (targetPassiveMonthly === null) {
    return { status: "NOT_SET", reason: "target_passive_monthly is missing" };
  }

  const targetPassiveAnnual = targetPassiveMonthly * 12;
  const targetNetWorth = targetPassiveAnnual / (swrPct / 100);

  return {
    status: "SET",
    targetFireAge,
    targetPassiveMonthly,
    swrPct,
    targetPassiveAnnual,
    targetNetWorth,
    goalSetTimestamp: row.goal_set_timestamp ?? row.updated_at ?? new Date(0).toISOString(),
    source: "mc_fire_settings",
  };
}

/**
 * Top-level: fetch + derive. The only function callers should use.
 */
export async function getCanonicalGoal(
  ownerId: string,
  fetcher: typeof fetch = fetch,
): Promise<CanonicalGoal> {
  const row = await fetchMcFireSettings(ownerId, fetcher);
  return deriveCanonicalGoal(row);
}
