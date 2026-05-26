/**
 * useCanonicalGoal.ts — FWL Remediation Phase A-2 (client).
 *
 * React hook backing the canonical FIRE-goal selector. Reads
 * `GET /api/canonical-goal`, which in turn reads ONLY from `mc_fire_settings`.
 *
 * If the user has not explicitly saved a FIRE goal (`goals_set=false`) or any
 * required field is missing, the hook returns `{ status: "NOT_SET" }` and the
 * UI must surface "Goal not set" rather than inventing defaults.
 *
 * No hardcoded fallbacks (no implicit 4% SWR, no age=55 default). Phase B will
 * migrate the scattered callsites onto this hook.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

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

export const CANONICAL_GOAL_QUERY_KEY = ["/api/canonical-goal"] as const;

async function fetchCanonicalGoal(): Promise<CanonicalGoal> {
  const res = await apiRequest("GET", "/api/canonical-goal");
  const json = (await res.json()) as CanonicalGoal | null;
  if (!json || typeof (json as any).status !== "string") {
    return { status: "NOT_SET", reason: "canonical-goal endpoint returned empty body" };
  }
  return json;
}

export function useCanonicalGoal(): UseQueryResult<CanonicalGoal> {
  return useQuery<CanonicalGoal>({
    queryKey: CANONICAL_GOAL_QUERY_KEY,
    queryFn: fetchCanonicalGoal,
  });
}
