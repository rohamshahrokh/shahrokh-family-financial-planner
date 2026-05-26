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

// Supabase connection — read from env. In production we hard-fail on missing
// config rather than letting a request fall through with no credentials and
// silently return null (which the caller would interpret as "no goal set").
// Local/dev `process.env` is loaded from `.env` per docs/12-deployment-guide.md.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

if (process.env.NODE_ENV === "production") {
  if (!SUPABASE_URL) {
    throw new Error(
      "[canonicalGoal] SUPABASE_URL (or VITE_SUPABASE_URL) is not set in production",
    );
  }
  if (!SUPABASE_KEY) {
    throw new Error(
      "[canonicalGoal] SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) is not set in production",
    );
  }
}

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
