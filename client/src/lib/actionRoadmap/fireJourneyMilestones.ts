/**
 * actionRoadmap/fireJourneyMilestones.ts — Sprint 28B.
 *
 * Enriches existing roadmap milestones (already built by
 * `actionRoadmapBuilder`) with per-milestone FIRE-progress metrics. THIS
 * MODULE PERFORMS NO MC RUN AND NO NEW FINANCIAL MATH. It maps each
 * milestone's `month` to its index in the engine's `netWorthFan` and reads
 * the median NW at that index, divided by the canonical FIRE number.
 *
 * Honesty rules:
 *   - When `fireNumber` is null OR `fan` is empty OR the milestone month
 *     is outside the fan's range, `progressImpact` is null.
 *   - `expectedOutcome` is a short user-facing line derived from the
 *     milestone's `effect` + the engine's progressDelta when both are
 *     available. We never invent dollar figures.
 */
import type { FanPoint } from "../scenarioV2/types";
import type { RoadmapMilestone } from "./types";

export interface FireProgressImpact {
  before: number | null; // % of FIRE number at month BEFORE milestone (or 0 if at start)
  after: number | null;  // % of FIRE number at milestone month
  delta: number | null;  // after - before
}

export interface FireJourneyMilestone extends RoadmapMilestone {
  progressImpact: FireProgressImpact | null;
  expectedOutcome: string;
}

export interface EnrichInput {
  milestones: RoadmapMilestone[];
  fan: FanPoint[];
  /** 'YYYY-MM' of the fan's first point — used to compute month offsets. */
  startMonth: string;
  fireNumber: number | null;
}

function monthsBetween(start: string, target: string): number {
  // Both inputs are 'YYYY-MM'. Returns target - start in whole months.
  const [sy, sm] = start.split("-").map((n) => parseInt(n, 10));
  const [ty, tm] = target.split("-").map((n) => parseInt(n, 10));
  if (![sy, sm, ty, tm].every((v) => Number.isFinite(v))) return -1;
  return (ty - sy) * 12 + (tm - sm);
}

function pctOfFire(value: number | null, fireNumber: number | null): number | null {
  if (value == null || fireNumber == null || fireNumber <= 0 || !Number.isFinite(fireNumber)) return null;
  return (value / fireNumber) * 100;
}

function buildExpectedOutcome(m: RoadmapMilestone, impact: FireProgressImpact | null): string {
  if (m.status === "fire") return "Plan reaches FIRE if the projected path holds.";
  if (m.status === "completed") return "Already executed; impact reflected in current position.";
  if (impact?.delta != null && Number.isFinite(impact.delta)) {
    const sign = impact.delta >= 0 ? "+" : "";
    return `Moves projected FIRE progress by ${sign}${impact.delta.toFixed(0)}pp at this point.`;
  }
  return m.effect ?? "Engine-modelled milestone.";
}

export function enrichFireJourneyMilestones(input: EnrichInput): FireJourneyMilestone[] {
  const { milestones, fan, startMonth, fireNumber } = input;
  if (!Array.isArray(milestones) || milestones.length === 0) return [];

  const fanLen = Array.isArray(fan) ? fan.length : 0;

  return milestones.map<FireJourneyMilestone>((m) => {
    let impact: FireProgressImpact | null = null;
    if (fanLen > 0) {
      const idx = monthsBetween(startMonth, m.month);
      if (idx >= 0 && idx < fanLen) {
        const beforeIdx = Math.max(0, idx - 1);
        const beforeVal = fan[beforeIdx]?.p50 ?? null;
        const afterVal = fan[idx]?.p50 ?? null;
        const before = pctOfFire(beforeVal, fireNumber);
        const after = pctOfFire(afterVal, fireNumber);
        const delta = before != null && after != null ? after - before : null;
        // Only emit the impact object if at least one of before/after is real.
        if (before != null || after != null) {
          impact = { before, after, delta };
        }
      }
    }

    return {
      ...m,
      progressImpact: impact,
      expectedOutcome: buildExpectedOutcome(m, impact),
    };
  });
}
