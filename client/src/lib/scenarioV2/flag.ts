/**
 * Scenario Engine V2 — Feature Flag
 *
 * The entire V2 engine sits behind this flag. While `false` (the default),
 * no V2 code path is reachable from production routes.
 *
 * - Env: VITE_SCENARIO_ENGINE_V2 ("true" | "false" | undefined)
 * - Default: false
 * - Production must remain on V1 until explicit cutover (post-Phase 17).
 *
 * DO NOT import V2 modules from V1 files. The flag check is the only
 * permitted entry point from V1 → V2.
 */

const raw =
  typeof import.meta !== "undefined" &&
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
        .env?.VITE_SCENARIO_ENGINE_V2
    : undefined;

export const SCENARIO_ENGINE_V2: boolean =
  typeof raw === "string" && raw.toLowerCase() === "true";

/**
 * Runtime guard for V2 code paths. Throws in dev to surface accidental
 * V1→V2 leaks. In prod, returns false silently.
 */
export function assertV2Enabled(context: string): boolean {
  if (!SCENARIO_ENGINE_V2) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        `[scenarioV2] ${context} called while SCENARIO_ENGINE_V2 is OFF. ` +
          `This is a bug — V2 entry points must check the flag first.`,
      );
    }
    return false;
  }
  return true;
}
