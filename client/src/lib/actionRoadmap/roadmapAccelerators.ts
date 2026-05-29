/**
 * actionRoadmap/roadmapAccelerators.ts — Sprint 27.
 *
 * Selector that ranks the engine's already-computed alternates against the
 * recommended winner on `medianNwPath` deltas. **THIS MODULE PERFORMS NO MC.**
 * It diffs two already-produced median NW trajectories and reports which
 * alternate would (engine-modelled) produce more terminal wealth.
 *
 * Brief honesty rules:
 *   - Ranked ONLY when both the recommended AND the alternate have a non-empty
 *     `medianNwPath`. Otherwise the alternate is skipped — never invented.
 *   - Deltas are reported as raw engine-output dollar differences. No %s of
 *     fictional inputs.
 *   - When no comparable alternate exists, returns an empty list (UI shows
 *     "Not modelled yet").
 */

import type { GoalLabPathPicks, GoalLabRankedScenario } from "../goalLab/orchestrator";
import { resolveRoadmapTemplate } from "./roadmapTemplates";
import type { RoadmapTemplate } from "./types";

// ─── Public types ──────────────────────────────────────────────────────────

export interface RoadmapAccelerator {
  /** Engine candidate id (e.g. "etf_lump_now"). */
  id: string;
  /** Engine candidate label. */
  label: string;
  /** Engine template id this candidate came from. */
  engineTemplateId: string;
  /** Display template metadata. */
  template: RoadmapTemplate;
  /** Terminal NW delta vs the recommended path (dollars). Positive = more wealth. */
  terminalNwDelta: number;
  /** Median NW at horizon end on this path. */
  alternateTerminalNw: number;
  /** Median NW at horizon end on the recommended path (reference). */
  recommendedTerminalNw: number;
  /** Engine probability if present, else null (never fabricated). */
  probabilityP50: number | null;
  /** Engine score if present, else null. */
  scoreP50: number | null;
  /** Why a user might consider this — first rationale line from engine. */
  oneLine: string;
}

export interface RoadmapAcceleratorRanking {
  /** Top-N accelerators that beat the recommended on terminal NW (sorted desc). */
  topAccelerators: RoadmapAccelerator[];
  /** Alternates that under-perform (kept short — first 3). */
  underperformers: RoadmapAccelerator[];
  audit: {
    consideredCandidates: number;
    skippedForMissingPath: number;
    recommendedId: string | null;
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export function buildAcceleratorRanking(
  picks: GoalLabPathPicks | null | undefined,
  rankedScenarios: GoalLabRankedScenario[] | null | undefined,
  topN = 3,
): RoadmapAcceleratorRanking {
  const empty: RoadmapAcceleratorRanking = {
    topAccelerators: [],
    underperformers: [],
    audit: { consideredCandidates: 0, skippedForMissingPath: 0, recommendedId: null },
  };

  const recommended = picks?.recommended ?? null;
  if (!recommended || !recommended.winner) return empty;
  const recPath = recommended.winner.result?.medianNwPath ?? [];
  if (recPath.length === 0) return empty;
  const recTerminal = recPath[recPath.length - 1];
  if (!Number.isFinite(recTerminal)) return empty;

  // Build the candidate pool: alternates within the recommended template +
  // every other ranked scenario's winner across templates (deduped).
  const candidates: { scenario: GoalLabRankedScenario; cand: typeof recommended.winner }[] = [];
  const seen = new Set<string>();
  seen.add(recommended.winner.id);

  for (const alt of recommended.alternates ?? []) {
    if (alt && !seen.has(alt.id)) {
      seen.add(alt.id);
      candidates.push({ scenario: recommended, cand: alt });
    }
  }
  for (const s of rankedScenarios ?? []) {
    if (s.templateId === recommended.templateId) continue;
    if (s.winner && !seen.has(s.winner.id)) {
      seen.add(s.winner.id);
      candidates.push({ scenario: s, cand: s.winner });
    }
  }

  let skipped = 0;
  const compared: RoadmapAccelerator[] = [];
  for (const { scenario, cand } of candidates) {
    const path = cand.result?.medianNwPath ?? [];
    if (path.length === 0) { skipped++; continue; }
    const terminal = path[path.length - 1];
    if (!Number.isFinite(terminal)) { skipped++; continue; }
    const delta = terminal - recTerminal;
    compared.push({
      id: cand.id,
      label: cand.label || cand.shortLabel || cand.id,
      engineTemplateId: scenario.templateId,
      template: resolveRoadmapTemplate(scenario.templateId),
      terminalNwDelta: delta,
      alternateTerminalNw: terminal,
      recommendedTerminalNw: recTerminal,
      probabilityP50: scenario.probabilityP50,
      scoreP50: scenario.scoreP50,
      oneLine: (cand.rationale?.[0]?.toString().trim()) || (cand.headline?.toString().trim()) || "Engine-ranked alternate path.",
    });
  }

  // Sort by terminalNwDelta descending — biggest accelerator first.
  compared.sort((a, b) => b.terminalNwDelta - a.terminalNwDelta);
  const topAccelerators = compared.filter((c) => c.terminalNwDelta > 0).slice(0, topN);
  const underperformers = compared.filter((c) => c.terminalNwDelta <= 0).slice(0, 3);

  return {
    topAccelerators,
    underperformers,
    audit: {
      consideredCandidates: candidates.length,
      skippedForMissingPath: skipped,
      recommendedId: recommended.winner.id,
    },
  };
}
