/**
 * Sprint 17 Phase 17.3 — Fatigue penalty + state gating.
 *
 * Two orthogonal mechanisms:
 *   3a. Per-scenario suitability gating (handled in qualityScore via the
 *       rules registry's `applicableStates`; tested there).
 *   3b. Cross-scenario fatigue tracking — penalises a rule that won across
 *       N recent runs. Persisted to sessionStorage under
 *       "fwl.recommendation_history.v1". Does NOT collide with the canonical
 *       facade key ("fwl.canonical_recommendation.v1").
 *
 * Penalty curve (user-specified):
 *   multiplier = max(0.5, 1 - 0.1 × winsInLastNRuns)
 */

import type { Recommendation } from "./types";

const STORAGE_KEY = "fwl.recommendation_history.v1";
const MAX_HISTORY = 10;

type WinRecord = { id: string; pillar: string; iso: string };

function isBrowser(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

function readHistory(): WinRecord[] {
  if (!isBrowser()) return _inMemoryHistory.slice();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-MAX_HISTORY);
    return [];
  } catch {
    return [];
  }
}

function writeHistory(h: WinRecord[]): void {
  const trimmed = h.slice(-MAX_HISTORY);
  if (!isBrowser()) {
    _inMemoryHistory = trimmed.slice();
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    _inMemoryHistory = trimmed.slice();
  }
}

let _inMemoryHistory: WinRecord[] = [];

/** Test-only: clear all history. */
export function __resetFatigueHistoryForTests(): void {
  _inMemoryHistory = [];
  if (isBrowser()) {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

/** Record that a recommendation won. Call after sorting. */
export function recordTopRecommendation(rec: Recommendation): void {
  const history = readHistory();
  history.push({
    id: rec.id,
    pillar: rec.pillar,
    iso: new Date().toISOString(),
  });
  writeHistory(history);
}

export interface FatiguePenaltyResult {
  multiplier: number;
  winsInLastN: number;
  reason: string;
}

/**
 * Compute the fatigue multiplier for a single candidate. Multiplicative —
 * applied after qualityScore.
 */
export function computeFatiguePenalty(rec: Recommendation): FatiguePenaltyResult {
  const history = readHistory();
  if (history.length === 0) {
    return { multiplier: 1, winsInLastN: 0, reason: "no history" };
  }
  const wins = history.filter((r) => r.id === rec.id).length;
  if (wins <= 1) {
    return { multiplier: 1, winsInLastN: wins, reason: `${wins} prior win(s)` };
  }
  const multiplier = Math.max(0.5, 1 - 0.1 * wins);
  return {
    multiplier,
    winsInLastN: wins,
    reason: `${rec.id} won ${wins} times in last ${history.length} runs — fatigue applied`,
  };
}

/**
 * Apply fatigue penalty to a quality score (or any 0..100 base).
 * Returns the penalised score plus a reason for the breakdown.
 */
export function applyFatiguePenalty(
  baseScore: number,
  rec: Recommendation,
): { score: number; multiplier: number; reason: string } {
  const f = computeFatiguePenalty(rec);
  return {
    score: baseScore * f.multiplier,
    multiplier: f.multiplier,
    reason: f.reason,
  };
}

/** Inspect history without mutating. Test helper. */
export function readFatigueHistory(): WinRecord[] {
  return readHistory();
}
