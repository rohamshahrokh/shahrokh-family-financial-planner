/**
 * In-memory, session-scoped cache for the latest scenarioV2
 * `QuickDecisionOutput` produced by the /decision page.
 *
 * Why this exists (P1):
 *   The unified recommendation engine wants to consume the strongest
 *   available decision output when forming dashboard recommendations. The
 *   scenarioV2 candidate generator is the strongest available source but it
 *   is expensive to run, and the approved P1 scope explicitly forbids
 *   invoking or modifying scenario generation logic from the recommendation
 *   engine.
 *
 *   This module solves the consumption gap *without* invoking generation:
 *   the /decision page already produces a `QuickDecisionOutput` whenever
 *   the user runs a quick decision. We capture that result into a small
 *   module-level singleton and let downstream consumers (BestMoveCard,
 *   ActionCentre, etc.) read it via `computeUnifiedBestMove`. When no
 *   /decision run has happened yet, the engine falls back to legacy
 *   behaviour — there is no new generation path.
 *
 * Constraints (intentional):
 *   - In-memory only. Matches the pattern set by `autonomousMemoryStore`.
 *     No localStorage / sessionStorage / IndexedDB / cookies (the deployed
 *     iframe environment can block them and they're not needed for P1).
 *   - Single latest result per session; no history.
 *   - The stored object is opaque to this module (`unknown`). Adapters in
 *     `adapters.ts` already accept a permissive shape and normalise.
 */

type Listener = () => void;

interface Cache {
  latest: unknown | null;
  generatedAt: string | null;
}

const cache: Cache = { latest: null, generatedAt: null };
const listeners: Listener[] = [];

function notify(): void {
  // Snapshot to avoid mutation-during-iteration if a listener unsubscribes.
  const snapshot = listeners.slice();
  for (let i = 0; i < snapshot.length; i++) snapshot[i]();
}

/** Write the latest scenarioV2 QuickDecisionOutput. Called by /decision. */
export function writeLatestQuickDecision(output: unknown): void {
  cache.latest = output;
  cache.generatedAt = new Date().toISOString();
  notify();
}

/** Read the latest scenarioV2 QuickDecisionOutput, or null if none. */
export function readLatestQuickDecision(): unknown | null {
  return cache.latest;
}

/** When the cache was last written. Null when never written this session. */
export function readLatestQuickDecisionGeneratedAt(): string | null {
  return cache.generatedAt;
}

/** Subscribe to changes (for future React hooks). Returns unsubscribe fn. */
export function subscribeQuickDecision(l: Listener): () => void {
  listeners.push(l);
  return () => {
    const idx = listeners.indexOf(l);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/** Test-only: reset the cache. */
export function __resetQuickDecisionStoreForTests(): void {
  cache.latest = null;
  cache.generatedAt = null;
  notify();
}
