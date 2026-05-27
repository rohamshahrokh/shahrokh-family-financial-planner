/**
 * canonicalAdapter.ts — Sprint 15 Phase 1.
 *
 * Thin adapter that lets `/decision` write its `QuickDecisionOutput` into the
 * existing session-scoped quick-decision cache used by the recommendation
 * engine bridge, while also providing a typed `noteCanonicalLiveRun` signal
 * the facade can pick up.
 *
 * Phase 1 scope:
 *   This file does NOT change /decision behaviour. /decision already calls
 *   `writeLatestQuickDecision(out)` at decision.tsx:377. This adapter is
 *   created as the single import point for Phase 3 consumer migration:
 *
 *     // BEFORE  (decision.tsx today)
 *     import { writeLatestQuickDecision } from "@/lib/recommendationEngine";
 *     writeLatestQuickDecision(out);
 *
 *     // AFTER   (Phase 3 swap — same write semantics + canonical signal)
 *     import { writeCanonicalDecisionOutput } from "@/lib/scenarioV2/decisionEngine/canonicalAdapter";
 *     writeCanonicalDecisionOutput(out);
 *
 * Reading the cache is unchanged — the facade uses `readLatestQuickDecision`
 * directly via the existing bridge module.
 */

import {
  writeLatestQuickDecision,
  readLatestQuickDecision,
  readLatestQuickDecisionGeneratedAt,
} from "../../recommendationEngine/bestMoveBridge";

/**
 * Write the latest QuickDecisionOutput into the session-scoped cache the
 * canonical recommendation facade reads from. Loose `unknown` typing matches
 * the existing bridge — the engine narrows the type internally via
 * `fromQuickDecision` adapter at use-time.
 *
 * No-op safe: passing `null` clears the slot. The bridge's `readLatest...`
 * returns `null` thereafter so the facade falls back to the unified engine's
 * own signals.
 */
export function writeCanonicalDecisionOutput(output: unknown): void {
  writeLatestQuickDecision(output);
}

/**
 * Read the most recent canonical decision output. Returns `null` when no
 * decision has been run in this session. Use this when you need to *display*
 * the raw output (e.g. /decision's own UI re-mount). Prefer the facade's
 * `computeCanonicalRecommendation()` when you want the unified shape.
 */
export function readCanonicalDecisionOutput(): unknown | null {
  return readLatestQuickDecision();
}

/**
 * ISO timestamp of the most recent canonical decision write, or null when no
 * decision has been run this session. The facade composes this with the
 * unified engine's own `generatedAt` to surface the freshest of the two.
 */
export function readCanonicalDecisionGeneratedAt(): string | null {
  return readLatestQuickDecisionGeneratedAt();
}
