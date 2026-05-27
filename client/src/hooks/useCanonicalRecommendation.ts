/**
 * useCanonicalRecommendation.ts — Sprint 15 Phase 1 (React hook).
 *
 * React Query wrapper around `computeCanonicalRecommendation()`. Every page
 * that needs the "top recommendation" should consume this hook (Phase 3
 * migration). One canonical query key → one cache → identical result across
 * pages.
 *
 * Phase 1 scope:
 *   This hook is CREATED but NOT YET CONSUMED. The 5 page consumers and 7
 *   dashboard widgets continue to call `computeUnifiedBestMove` directly.
 *   Phase 3 integration PR will flip them to this hook.
 *
 * Cache strategy:
 *   - React Query holds the freshest result keyed by CANONICAL_RECOMMENDATION_QUERY_KEY.
 *   - The facade module also writes the result into sessionStorage so a hard
 *     reload mid-session still gives consumers something to render synchronously
 *     via `readCachedCanonicalRecommendation()`.
 *   - `placeholderData` reads the session-cache tier so the initial paint is
 *     never blank when the cache has data.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  computeCanonicalRecommendation,
  readCachedCanonicalRecommendation,
  type CanonicalRecommendation,
} from "@/lib/canonicalRecommendation";

/**
 * Canonical React Query key. Shared across all consumers so a single fetch
 * fans out to every page that reads the canonical recommendation.
 */
export const CANONICAL_RECOMMENDATION_QUERY_KEY = [
  "fwl",
  "canonical-recommendation",
  "v1",
] as const;

/**
 * Default stale window inside React Query. Mirrors the facade's own
 * `STALE_AFTER_MS` so consumers see consistent freshness signals.
 */
const REACT_QUERY_STALE_MS = 5 * 60 * 1000;

/**
 * Default GC window. Long enough that switching between Action Plan and
 * Decision Lab does not re-fetch on every navigation, short enough that a
 * stale recommendation cannot linger across user sessions.
 */
const REACT_QUERY_GC_MS = 30 * 60 * 1000;

/**
 * Hook contract:
 *   - `data`        : CanonicalRecommendation (always populated after first
 *                     fetch; on first paint may be the session-cache value
 *                     via placeholderData).
 *   - `isFetching`  : the engine is currently running.
 *   - `isLoading`   : true ONLY on the very first run with no cached tier.
 *   - `refetch()`   : force a fresh engine run; useful for the "Refresh"
 *                     affordance Phase 3 will add when `data.isStale` is set.
 */
export function useCanonicalRecommendation(): UseQueryResult<CanonicalRecommendation> {
  return useQuery<CanonicalRecommendation>({
    queryKey: CANONICAL_RECOMMENDATION_QUERY_KEY,
    queryFn: () => computeCanonicalRecommendation(),
    staleTime: REACT_QUERY_STALE_MS,
    gcTime: REACT_QUERY_GC_MS,
    // Show whatever the session cache has while we re-run the engine. The
    // returned object has `source: "cached"` so consumers can distinguish.
    placeholderData: () => readCachedCanonicalRecommendation() ?? undefined,
  });
}
