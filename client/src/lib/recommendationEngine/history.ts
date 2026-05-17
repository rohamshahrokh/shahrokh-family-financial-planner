/**
 * Recommendation history — in-memory only.
 *
 * Stores the previous unified-recommendation result so the engine can compute
 * "what changed since last run". NO localStorage / sessionStorage / cookies /
 * IndexedDB / DB — by design and per spec. Lives only for the current page
 * session (module-level closure). Cleared on hard reload.
 */

import type { Recommendation, UnifiedRecommendationResult } from './types';

interface HistoryEntry {
  recommendation: Recommendation;
  generatedAt: string;
  confidenceScore: number;
}

let previousByPillar: Map<string, HistoryEntry> | null = null;
let lastResult: UnifiedRecommendationResult | null = null;

export interface RecommendationChange {
  id: string;
  pillar: string;
  current: Recommendation;
  previous?: Recommendation;
  changedReason: 'new' | 'replaced' | 'rank_changed' | 'confidence_moved' | 'unchanged';
  confidenceMovement: number;
  rankMovement: number;
  generatedDate: string;
}

export function snapshotHistory(result: UnifiedRecommendationResult): RecommendationChange[] {
  const changes: RecommendationChange[] = [];
  const nextMap = new Map<string, HistoryEntry>();

  for (const rec of result.topPriorities) {
    const prev = previousByPillar?.get(rec.pillar);
    let reason: RecommendationChange['changedReason'] = 'unchanged';
    if (!prev) reason = 'new';
    else if (prev.recommendation.id !== rec.id) reason = 'replaced';
    else if (prev.recommendation.priorityRank !== rec.priorityRank) reason = 'rank_changed';
    else if (Math.abs(prev.confidenceScore - rec.confidenceScore) > 0.1) reason = 'confidence_moved';

    changes.push({
      id: rec.id,
      pillar: rec.pillar,
      current: rec,
      previous: prev?.recommendation,
      changedReason: reason,
      confidenceMovement: prev ? rec.confidenceScore - prev.confidenceScore : 0,
      rankMovement: prev ? prev.recommendation.priorityRank - rec.priorityRank : 0,
      generatedDate: result.generatedAt,
    });

    nextMap.set(rec.pillar, {
      recommendation: rec,
      generatedAt: result.generatedAt,
      confidenceScore: rec.confidenceScore,
    });
  }

  previousByPillar = nextMap;
  lastResult = result;
  return changes;
}

export function getLastResult(): UnifiedRecommendationResult | null {
  return lastResult;
}

/** Force-clear (useful for tests). */
export function resetHistory(): void {
  previousByPillar = null;
  lastResult = null;
}
