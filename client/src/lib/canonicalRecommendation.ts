/**
 * canonicalRecommendation.ts — Sprint 15 Phase 1 (RecommendationFacade).
 *
 * Single source of truth for the "top recommendation" + "top actions" + "risk
 * being reduced" + confidence metadata shown across:
 *
 *   /action-plan, /decision-lab, /decision, /goal-closure-lab, /portfolio-lab
 *
 * Why this file exists
 * --------------------
 * Audit found five surfaces each consuming a different recommendation engine
 * (computeUnifiedBestMove A, generateQuickDecisionCandidates C, computeBestMove
 * Sprint5 D, buildGoalSolverPro F, buildGoalClosureLab H) with different
 * confidence semantics (per-rule literal vs heuristic blend vs Monte Carlo
 * probability). The "top recommendation" for the same household was observably
 * different across pages.
 *
 * This facade wraps the existing `computeUnifiedBestMove` (engine A) as the
 * primary feeder, normalises the output shape, attaches explicit provenance
 * (live / cached / fallback + isStale + confidenceSource), and provides a
 * three-tier cache so every consumer reads the same canonical object.
 *
 * IMPORTANT — Phase 1 scope:
 *   This module is created with zero consumer flips. The 5 pages and 7 widgets
 *   continue to call computeUnifiedBestMove directly. Consumer migration is
 *   the Phase 3 integration PR. This PR contains: facade + adapter + hook +
 *   tests only.
 *
 * Constraints honoured:
 *   - GitHub is the source of truth.
 *   - Do not redesign architecture.
 *   - Do not create new engines (this is a facade, not an engine).
 *   - No schema changes, no Supabase modification.
 *   - Engines B, D, E, G, H, I retained as internal feeders — not touched.
 */

import type {
  Recommendation,
  UnifiedRecommendationResult,
} from "./recommendationEngine/types";
import {
  computeUnifiedBestMove,
  legacyBestMoveToRecommendation,
  readLatestQuickDecision,
  readLatestQuickDecisionGeneratedAt,
} from "./recommendationEngine/bestMoveBridge";

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Where the recommendation in the facade payload came from. The label is
 * always surfaced (in Audit Mode at minimum) so the user — and engineers
 * grepping for "Why does /action-plan show X but /decision show Y?" — can
 * trace lineage on any page.
 */
export type CanonicalRecommendationSource =
  /** Fresh unified recommendation produced this session. */
  | "live"
  /** Read from the session cache; may be stale. */
  | "cached"
  /** Engine could not run (no ledger / no snapshot). Legacy best-move shim
   *  returned in degraded form so consumers can still render *something*. */
  | "fallback";

/**
 * Where the headline confidence number came from. Drives display policy in
 * Phase 3 (confidenceLabels.ts):
 *   - `mc`         → render as "XX% success probability · N paths · ran ...".
 *   - `heuristic`  → render as "Engine fit: HIGH/MEDIUM/LOW".
 *   - `rule`       → suppress in default UI; visible only in Audit Mode.
 *   - `composite`  → blended; render as band per heuristic.
 *   - `absent`     → no confidence value; render nothing.
 */
export type CanonicalConfidenceSource =
  | "mc"
  | "heuristic"
  | "rule"
  | "composite"
  | "absent";

/**
 * Canonical recommendation payload — the EXACT shape every page must consume.
 * Adding fields here is a cross-team API change; removing fields is breaking.
 */
export interface CanonicalRecommendation {
  /** The single best move (always present; may be a fallback shim). */
  bestMove: Recommendation;
  /**
   * Top priorities INCLUDING bestMove. Identity: `top3[0] === bestMove` when
   * the engine produced a live result; in fallback mode `top3.length === 1`.
   */
  top3: Recommendation[];
  /** Full ranked list. May be empty in fallback mode. */
  all: Recommendation[];
  /**
   * Plain-English description of the risk most reduced by `top3[0]`. Pulled
   * verbatim from the unified engine. Empty string in fallback mode.
   */
  riskBeingReduced: string;
  /** ISO timestamp of when the recommendation was produced. */
  generatedAt: string;
  /** Lineage tag — `live`, `cached`, or `fallback`. */
  source: CanonicalRecommendationSource;
  /**
   * True when the cached or fallback recommendation is older than the cache
   * TTL (or when the engine returned a "data not reliable" signal).
   */
  isStale: boolean;
  /**
   * Human-readable reason for stale state. Empty when not stale.
   */
  staleReason: string;
  /** Headline confidence value 0..1 from `bestMove.confidenceScore`. */
  confidence: number;
  /** Where the confidence value originated — drives display label policy. */
  confidenceSource: CanonicalConfidenceSource;
  /**
   * Reference to whatever the engine recorded as "what changed" since the
   * last run. Empty array when no prior snapshot in memory.
   */
  changes: ReadonlyArray<{
    id: string;
    title: string;
    changeReason: string;
  }>;
}

// ─── Internal: cache layer ───────────────────────────────────────────────────

/**
 * Session-storage cache key. Versioned so we can break the cache safely if
 * the canonical shape evolves without confusing older sessions.
 */
const SESSION_KEY = "fwl.canonical_recommendation.v1";

/**
 * In-memory cache (cross-tab not required; sessionStorage covers reload).
 * Set on every successful facade call; read as a tier-2 fallback when
 * sessionStorage is unavailable (e.g. iframe environments that block storage).
 */
let _memoryCache: CanonicalRecommendation | null = null;

/**
 * Soft staleness window. After this many ms we keep returning cached data
 * (so the UI never goes blank) but mark `isStale: true` so the page can show
 * a "refresh" affordance.
 */
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

function readSessionCache(): CanonicalRecommendation | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CanonicalRecommendation;
  } catch {
    // sessionStorage can throw in cross-origin iframes / privacy modes.
    return null;
  }
}

function writeSessionCache(value: CanonicalRecommendation): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    // ignore — memory cache remains as tier-2.
  }
}

function clearSessionCache(): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function isStaleByAge(generatedAtIso: string): boolean {
  const t = Date.parse(generatedAtIso);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > STALE_AFTER_MS;
}

// ─── Internal: provenance classifier ─────────────────────────────────────────

/**
 * Decide what the headline confidence value REALLY represents. The unified
 * engine packs three different things into the same `confidenceScore` field:
 *   1. A per-rule literal (Type 1 / "rule") set by the recommendation rule
 *      author — e.g. engine.ts:128 default 0.6.
 *   2. A binary 0.85/0.6 from the legacy best-move bridge based on whether
 *      the underlying ledger is "reliable" (bestMoveBridge.ts:229).
 *   3. A blend of Monte Carlo + scoring margin + coverage from Sprint 5
 *      (bestMoveEngineSprint5.ts:523–565).
 *
 * The audit established that displaying any of these as "XX% confidence" is
 * misleading. Phase 3 will render them per-class. This function tells Phase 3
 * which class we're looking at.
 *
 * Heuristic rules (in order):
 *   - signalCoverage contains 'monte_carlo_v4' or 'monte_carlo_v5'  → "mc"
 *   - bestMove.surfaces includes 'fire' AND probabilityDelta is set → "mc"
 *   - bestMove was produced by Sprint 5 (signalCoverage 'decision_engine')
 *                                                                    → "composite"
 *   - decisionConfidence wired from QuickDecisionOutput              → "heuristic"
 *   - otherwise the value is the per-rule literal                    → "rule"
 *   - bestMove is the legacy fallback shim (no signalCoverage)       → "absent"
 */
function classifyConfidenceSource(
  unified: UnifiedRecommendationResult,
  hadQuickDecision: boolean,
): CanonicalConfidenceSource {
  // Sprint 17 Phase 17.6 — when calibratedConfidence was MC-driven, prefer
  // "mc". When non-MC, fall through to the legacy classifier so headless
  // runs (no signal coverage) keep classifying as "rule" or "absent".
  const cc = unified.bestMove?.calibratedConfidence;
  if (cc?.mcDriven) return "mc";

  const sig = unified.signalCoverage ?? [];
  const mcWired =
    sig.includes("monte_carlo_v4") || sig.includes("monte_carlo_v5");
  const decisionWired = sig.includes("decision_engine");
  if (mcWired && unified.bestMove.fireImpact?.probabilityDelta !== undefined) {
    return "mc";
  }
  if (decisionWired) return "composite";
  if (hadQuickDecision) return "heuristic";
  if (sig.length === 0) return "absent";
  return "rule";
}

// ─── Internal: changes adapter ───────────────────────────────────────────────

/**
 * Narrow the engine's `RecommendationChange[]` to the subset every consumer
 * cares about. Engine-internal fields (numeric deltas, signal IDs) stay
 * inside the engine; the facade only exposes user-readable change reasons.
 */
function projectChanges(
  changes: ReadonlyArray<{
    id: string;
    current: { title: string };
    changedReason: string;
  }>,
): CanonicalRecommendation["changes"] {
  return changes.map((c) => ({
    id: c.id,
    title: c.current?.title ?? "",
    changeReason: c.changedReason,
  }));
}

// ─── Internal: fallback shim ─────────────────────────────────────────────────

/**
 * Build a degraded `CanonicalRecommendation` when the engine cannot run
 * (no ledger, network error, etc). Returns the legacy best-move shim wrapped
 * in canonical shape so consumers don't need null-guard branches everywhere.
 */
function buildFallback(reason: string): CanonicalRecommendation {
  // Minimal Recommendation that satisfies the type contract.
  const fallbackBestMove: Recommendation = {
    id: "fallback.no-data",
    title: "Recommendation unavailable",
    actionType: "hold_cash_offset",
    pillar: "maintain_investing_discipline",
    priorityRank: 99,
    confidenceScore: 0,
    urgency: "monitor",
    riskLevel: "Low",
    expectedFinancialImpact: {
      label: "No data — set up your ledger to receive recommendations",
    },
    implementationSteps: [
      { step: "Open Action Plan once your ledger is populated" },
    ],
    whatCouldChangeRecommendation: [
      "Snapshot becomes available",
      "FIRE goal is set in Settings",
    ],
    alternativeOptions: [],
    reviewTrigger: { condition: "Ledger refresh" },
    sourceSignalsUsed: [],
    surfaces: ["best_move"],
    reasoning:
      "No canonical ledger or snapshot is available right now. " + reason,
  };
  return {
    bestMove: fallbackBestMove,
    top3: [fallbackBestMove],
    all: [fallbackBestMove],
    riskBeingReduced: "",
    generatedAt: new Date().toISOString(),
    source: "fallback",
    isStale: true,
    staleReason: reason,
    confidence: 0,
    confidenceSource: "absent",
    changes: [],
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the canonical recommendation. Wraps `computeUnifiedBestMove` and
 * normalises the output shape. Writes to the session and memory caches on
 * success. On engine failure returns a fallback shim (`source: "fallback"`).
 *
 * Phase 1 callers: tests + the new `useCanonicalRecommendation` hook only.
 * Phase 3 callers: all 5 pages + 7 dashboard widgets.
 */
export async function computeCanonicalRecommendation(
  args: Parameters<typeof computeUnifiedBestMove>[0] = {},
): Promise<CanonicalRecommendation> {
  let result;
  try {
    result = await computeUnifiedBestMove(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildFallback(`Engine error: ${msg}`);
  }

  const unified = result.unified;
  const hadQuickDecision = readLatestQuickDecision() != null;
  const quickDecisionAt = readLatestQuickDecisionGeneratedAt();
  const confidenceSource = classifyConfidenceSource(unified, hadQuickDecision);

  const generatedAt = unified.generatedAt;
  const stale = isStaleByAge(generatedAt);

  // If sprint5/quick-decision wasn't run THIS session, prefer the engine's
  // own generatedAt. Otherwise pick the more recent of the two so freshness
  // accurately reflects the user's last interaction with /decision.
  const effectiveGeneratedAt =
    quickDecisionAt && Date.parse(quickDecisionAt) > Date.parse(generatedAt)
      ? quickDecisionAt
      : generatedAt;

  // Sprint 17 Phase 17.6 — facade `confidence` remains the legacy
  // `bestMove.confidenceScore` for backward compat with surfaces that snapshot
  // the value directly. The calibrated value lives on `bestMove.calibratedConfidence`
  // for any consumer that wants the new band/label/components.
  const canonical: CanonicalRecommendation = {
    bestMove: unified.bestMove,
    top3: unified.topPriorities.slice(0, 3),
    all: unified.all,
    riskBeingReduced: unified.riskBeingReduced ?? "",
    generatedAt: effectiveGeneratedAt,
    source: "live",
    isStale: stale,
    staleReason: stale ? "Older than 5 minute freshness window" : "",
    confidence: unified.bestMove.confidenceScore ?? 0,
    confidenceSource,
    changes: projectChanges(result.changes ?? []),
  };

  _memoryCache = canonical;
  writeSessionCache(canonical);
  return canonical;
}

/**
 * Read the cached canonical recommendation WITHOUT triggering the engine.
 * Useful for surfaces (e.g. dashboard widgets) that want to render
 * synchronously and let a downstream React Query refresh fill in fresh
 * data. Returns `null` only when no cache tier has any data.
 */
export function readCachedCanonicalRecommendation(): CanonicalRecommendation | null {
  // Tier 1: in-memory (fastest, no JSON parse). Flip source → 'cached' so
  // consumers can distinguish "we just ran the engine" vs "reading from a
  // cache tier". Re-evaluate staleness against the stored generatedAt.
  if (_memoryCache) {
    const stale =
      _memoryCache.source === "fallback" || isStaleByAge(_memoryCache.generatedAt);
    return {
      ..._memoryCache,
      source: "cached",
      isStale: stale,
      staleReason: stale
        ? _memoryCache.staleReason ||
          "Cached value older than 5 minute freshness window"
        : "",
    };
  }
  // Tier 2: sessionStorage (survives page reload).
  const sess = readSessionCache();
  if (sess) {
    const stale = sess.source === "fallback" || isStaleByAge(sess.generatedAt);
    return {
      ...sess,
      source: "cached",
      isStale: stale,
      staleReason: stale
        ? sess.staleReason || "Cached value older than 5 minute freshness window"
        : "",
    };
  }
  return null;
}

/**
 * Test-only / logout-only: clear all cache tiers. Production code should
 * NOT call this — caches are reset naturally by sessionStorage expiry and
 * fresh engine runs.
 */
export function __resetCanonicalRecommendationCacheForTests(): void {
  _memoryCache = null;
  clearSessionCache();
}

// ─── Legacy adapter (only for fallback paths) ────────────────────────────────

/**
 * Convert a raw legacy `BestMoveResult` to the canonical shape WITHOUT
 * invoking the unified engine. Used by tests and by surfaces that have a
 * direct legacy result but no unified engine inputs available.
 *
 * The `confidenceSource` here is hard-coded to `"rule"` because the legacy
 * shim's confidence is always the binary 0.85/0.6 from bestMoveBridge.ts:229.
 */
export function canonicalFromLegacy(
  legacyBestMove: Parameters<typeof legacyBestMoveToRecommendation>[0],
): CanonicalRecommendation {
  const rec = legacyBestMoveToRecommendation(legacyBestMove);
  return {
    bestMove: rec,
    top3: [rec],
    all: [rec],
    riskBeingReduced: "",
    generatedAt: new Date().toISOString(),
    source: "fallback",
    isStale: true,
    staleReason: "Legacy path — unified engine not invoked",
    confidence: rec.confidenceScore,
    confidenceSource: "rule",
    changes: [],
  };
}
