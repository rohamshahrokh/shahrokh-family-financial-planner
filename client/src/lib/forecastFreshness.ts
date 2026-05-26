/**
 * forecastFreshness.ts (client re-export).
 *
 * The implementation moved to `shared/forecastFreshness.ts` (PR #88 review
 * item #4) so the server can consume it without crossing the client/server
 * boundary. Existing `@/lib/forecastFreshness` imports keep working via this
 * re-export.
 */
export {
  evaluateFreshness,
  type FreshnessStatus,
  type FreshnessMeta,
} from "@shared/forecastFreshness";
