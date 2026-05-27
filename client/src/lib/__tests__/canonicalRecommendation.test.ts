/**
 * canonicalRecommendation.test.ts — Sprint 15 Phase 1.
 *
 * Unit tests for the `RecommendationFacade` (canonicalRecommendation.ts).
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/canonicalRecommendation.test.ts
 *
 * What's covered
 * --------------
 * 1. Shape contract: `computeCanonicalRecommendation()` returns a
 *    `CanonicalRecommendation` with all required fields populated. The
 *    classification of `confidenceSource` reflects the engine's actual
 *    signal coverage.
 *
 * 2. Cache tiers: after a successful live run the cache returns the same
 *    object via `readCachedCanonicalRecommendation()` with `source: "cached"`.
 *    `__resetCanonicalRecommendationCacheForTests()` clears both tiers.
 *
 * 3. Legacy adapter: `canonicalFromLegacy(legacyBestMove)` produces a
 *    fallback shape with `confidenceSource: "rule"` — never "mc". This is the
 *    lineage contract Phase 3's confidenceLabels.ts depends on: rule-confidence
 *    is suppressed in default UI; only audit-mode chip.
 *
 * 4. Top-3 invariant: `top3[0]` is always `bestMove` in live mode.
 *
 * Out of scope for Phase 1
 * ------------------------
 * - Cross-page consistency tests (Phase 3 / Phase 4 validation suite).
 * - QuickDecision threading correctness (covered by recommendation-engine
 *   tests already in `script/test-recommendation-engine.ts`).
 * - React Query integration (the hook is a thin wrapper).
 */

import {
  computeCanonicalRecommendation,
  readCachedCanonicalRecommendation,
  __resetCanonicalRecommendationCacheForTests,
  canonicalFromLegacy,
  type CanonicalRecommendation,
  type CanonicalConfidenceSource,
} from "../canonicalRecommendation";
import type { BestMoveResult } from "../bestMoveEngine";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}${detail ? "  →  " + detail : ""}`);
  }
}

function isCanonical(x: unknown): x is CanonicalRecommendation {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.bestMove === "object" &&
    Array.isArray(c.top3) &&
    Array.isArray(c.all) &&
    typeof c.generatedAt === "string" &&
    typeof c.source === "string" &&
    typeof c.isStale === "boolean" &&
    typeof c.confidence === "number" &&
    typeof c.confidenceSource === "string"
  );
}

const VALID_SOURCES = new Set(["live", "cached", "fallback"]);
const VALID_CONFIDENCE_SOURCES: ReadonlySet<CanonicalConfidenceSource> = new Set([
  "mc",
  "heuristic",
  "rule",
  "composite",
  "absent",
]);

// ─── Test 1: shape contract on the live path ─────────────────────────────────
// In the headless test runner the unified engine still produces a real result
// (it tolerates missing fetch by returning empty signals). The facade should
// wrap it in the canonical shape regardless of signal coverage.
console.log("── canonicalRecommendation: live-path shape contract ──");
{
  __resetCanonicalRecommendationCacheForTests();
  const result = await computeCanonicalRecommendation();
  check("result satisfies CanonicalRecommendation shape", isCanonical(result));
  check(
    "source is one of {live, cached, fallback}",
    VALID_SOURCES.has(result.source),
    `got ${result.source}`,
  );
  check(
    "confidenceSource is one of the allowed enum values",
    VALID_CONFIDENCE_SOURCES.has(result.confidenceSource),
    `got ${result.confidenceSource}`,
  );
  check(
    "bestMove has confidenceScore field",
    typeof result.bestMove.confidenceScore === "number",
  );
  check(
    "confidence headline matches bestMove.confidenceScore",
    result.confidence === result.bestMove.confidenceScore,
  );
  check(
    "top3.length is at most 3",
    result.top3.length >= 1 && result.top3.length <= 3,
  );
  check(
    "top3[0] === bestMove on live path",
    result.source !== "live" || result.top3[0].id === result.bestMove.id,
  );
  check(
    "generatedAt is a valid ISO timestamp",
    !Number.isNaN(Date.parse(result.generatedAt)),
  );
  check(
    "staleReason is empty when isStale is false",
    result.isStale || result.staleReason === "",
  );
  check(
    "staleReason is populated when isStale is true",
    !result.isStale || result.staleReason.length > 0,
  );
}

// ─── Test 2: classification correctness for the headless case ───────────────
// With no MC, no decision engine, no quick decision in this runtime, the
// classifier MUST land on "rule" (per-rule literal) — not "mc". This is the
// Phase 3 contract: rule-confidence values get suppressed in default UI.
console.log("── canonicalRecommendation: classification correctness ──");
{
  __resetCanonicalRecommendationCacheForTests();
  const result = await computeCanonicalRecommendation();
  check(
    "headless run classified as one of {rule, absent}",
    result.confidenceSource === "rule" || result.confidenceSource === "absent",
    `got ${result.confidenceSource}`,
  );
  check(
    "headless run is NEVER classified as mc",
    result.confidenceSource !== "mc",
  );
}

// ─── Test 3: cache tier — live → cached transition ──────────────────────────
// After a live run, `readCachedCanonicalRecommendation()` should return the
// same object but with `source: "cached"`. This is how Phase 3 consumers
// distinguish "we just ran" vs "we read from session storage".
console.log("── canonicalRecommendation: cache tier transition ──");
{
  __resetCanonicalRecommendationCacheForTests();
  const live = await computeCanonicalRecommendation();
  const cached = readCachedCanonicalRecommendation();
  check("cache populated after live run", cached !== null);
  check(
    "cached read flips source to 'cached'",
    cached?.source === "cached",
    `got ${cached?.source}`,
  );
  check(
    "cached bestMove.id matches live bestMove.id",
    cached?.bestMove.id === live.bestMove.id,
  );
  check(
    "cached generatedAt matches live generatedAt",
    cached?.generatedAt === live.generatedAt,
  );
}

// ─── Test 4: cache reset clears both tiers ──────────────────────────────────
console.log("── canonicalRecommendation: cache reset ──");
{
  __resetCanonicalRecommendationCacheForTests();
  await computeCanonicalRecommendation();
  check(
    "cache populated before reset",
    readCachedCanonicalRecommendation() !== null,
  );
  __resetCanonicalRecommendationCacheForTests();
  check(
    "cache cleared by reset helper",
    readCachedCanonicalRecommendation() === null,
  );
}

// ─── Test 5: legacy adapter produces 'rule' confidenceSource ─────────────────
// This is the critical contract for Phase 3's confidenceLabels.ts: any value
// flowing through the legacy bridge must end up classified as "rule" so the
// display layer suppresses the percentage and shows only the audit chip.
console.log("── canonicalRecommendation: legacy adapter classification ──");
{
  const legacyFixture = {
    best: {
      id: "legacy-test-move",
      action: "Park surplus in offset",
      reason: "Offset earns mortgage rate tax-free",
      annual_benefit: 4200,
      benefit_label: "$4,200/yr saved",
      risk: "Low" as const,
      cta: "Open offset details",
      cta_route: "/offset",
      data_reliable: true,
    },
    alternatives: [],
    ledgerInputs: {},
  } as unknown as BestMoveResult;

  const result = canonicalFromLegacy(legacyFixture);
  check("legacy adapter returns canonical shape", isCanonical(result));
  check(
    "legacy adapter sets confidenceSource: 'rule'",
    result.confidenceSource === "rule",
    `got ${result.confidenceSource}`,
  );
  check(
    "legacy adapter sets source: 'fallback'",
    result.source === "fallback",
  );
  check(
    "legacy adapter sets isStale: true",
    result.isStale === true,
  );
  check(
    "legacy adapter promotes bestMove.confidenceScore to confidence",
    result.confidence === result.bestMove.confidenceScore,
  );
  check(
    "legacy adapter top3 contains exactly one item",
    result.top3.length === 1,
  );
}

// ─── Test 6: repeatability (no leak between calls) ──────────────────────────
console.log("── canonicalRecommendation: repeatability ──");
{
  __resetCanonicalRecommendationCacheForTests();
  for (let i = 0; i < 3; i++) {
    const r = await computeCanonicalRecommendation();
    check(
      `call ${i + 1} returns canonical shape`,
      isCanonical(r),
    );
  }
}

console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
