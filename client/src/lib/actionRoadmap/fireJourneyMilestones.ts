/**
 * actionRoadmap/fireJourneyMilestones.ts — Sprint 28B + Sprint 29 §6.
 *
 * Enriches existing roadmap milestones with per-milestone FIRE-progress
 * metrics AND four delta signals (NW $, FIRE progress pp, passive income $,
 * risk band). THIS MODULE PERFORMS NO MC. It only reads the engine's
 * already-computed `netWorthFan` around each milestone month.
 *
 * Sprint 29 zero-delta filter (§6.2): a milestone with no measurable impact
 * is dropped from the roadmap output. FIRE marker is always preserved
 * regardless of deltas.
 */
import type { FanPoint } from "../scenarioV2/types";
import type { RoadmapMilestone } from "./types";

export interface FireProgressImpact {
  before: number | null; // % of FIRE number at month BEFORE milestone (or 0 if at start)
  after: number | null;  // % of FIRE number at milestone month
  delta: number | null;  // after - before
}

export type RiskDeltaBand = "lower" | "higher" | "flat";

export interface FireJourneyMilestone extends RoadmapMilestone {
  progressImpact: FireProgressImpact | null;
  expectedOutcome: string;
  /** Sprint 29 §6 — $ change at milestone month vs prior milestone (P50 fan). */
  netWorthDelta: number | null;
  /** Sprint 29 §6 — percentage points change in FIRE progress. */
  fireProgressDelta: number | null;
  /** Sprint 29 §6 — $ change in implied passive income (annual). */
  passiveIncomeDelta: number | null;
  /** Sprint 29 §6 — risk band shift, derived from analyzeRoadmapRisk-style heuristic. */
  riskDelta: RiskDeltaBand | null;
}

export interface EnrichInput {
  milestones: RoadmapMilestone[];
  fan: FanPoint[];
  /** 'YYYY-MM' of the fan's first point — used to compute month offsets. */
  startMonth: string;
  fireNumber: number | null;
  /** Optional safe withdrawal rate (e.g. 4 → 4%). Required for passive-income delta. */
  swrPct?: number | null;
}

function monthsBetween(start: string, target: string): number {
  const [sy, sm] = start.split("-").map((n) => parseInt(n, 10));
  const [ty, tm] = target.split("-").map((n) => parseInt(n, 10));
  if (![sy, sm, ty, tm].every((v) => Number.isFinite(v))) return -1;
  return (ty - sy) * 12 + (tm - sm);
}

function pctOfFire(value: number | null, fireNumber: number | null): number | null {
  if (value == null || fireNumber == null || fireNumber <= 0 || !Number.isFinite(fireNumber)) return null;
  return (value / fireNumber) * 100;
}

function fanP50At(fan: FanPoint[], idx: number): number | null {
  if (idx < 0 || idx >= fan.length) return null;
  const v = fan[idx]?.p50;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

/**
 * Risk-delta heuristic (Sprint 29 §6.1). The contract calls for
 * "analyzeRoadmapRisk before/after slices" — but the existing analyzer is
 * scenario-level (no per-month slicing). We approximate honestly: a
 * milestone that materially adds property leverage (`buy_property`) lifts
 * the risk band; debt reduction / offset deposits lower it; everything
 * else is "flat". This stays an honest qualitative signal without inventing
 * a numeric risk score.
 */
function riskDeltaFor(m: RoadmapMilestone): RiskDeltaBand | null {
  if (m.status === "fire" || m.status === "completed") return null;
  const tag = m.sourceTag;
  if (tag === "scenarioDelta.buy_property") return "higher";
  if (tag === "scenarioDelta.sell_property") return "lower";
  if (tag === "scenarioDelta.offset_deposit") return "lower";
  if (tag === "scenarioDelta.extra_mortgage_repayment") return "lower";
  if (tag === "scenarioDelta.refinance") return "lower";
  if (tag === "scenarioDelta.crypto_lump_sum") return "higher";
  return "flat";
}

/** §6.2 — at least one measurable impact, or status === fire. */
function hasMeasurableImpact(m: FireJourneyMilestone): boolean {
  if (m.status === "fire") return true;
  if (m.netWorthDelta != null && Math.abs(m.netWorthDelta) > 1) return true;
  if (m.fireProgressDelta != null && Math.abs(m.fireProgressDelta) > 0.001) return true;
  if (m.passiveIncomeDelta != null && Math.abs(m.passiveIncomeDelta) > 1) return true;
  if (m.riskDelta != null && m.riskDelta !== "flat") return true;
  return false;
}

export function enrichFireJourneyMilestones(input: EnrichInput): FireJourneyMilestone[] {
  const { milestones, fan, startMonth, fireNumber, swrPct } = input;
  if (!Array.isArray(milestones) || milestones.length === 0) return [];

  const fanLen = Array.isArray(fan) ? fan.length : 0;
  const sortedByMonth = [...milestones].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  // Track running "previous milestone month" so NW / passive deltas are
  // computed milestone-to-milestone (not month-to-month). FIRE-progress
  // delta stays a 1-month-around-milestone reading per §6.1 wording.
  let prevMilestoneMonth: string | null = null;

  const enriched: FireJourneyMilestone[] = sortedByMonth.map<FireJourneyMilestone>((m) => {
    let impact: FireProgressImpact | null = null;
    let netWorthDelta: number | null = null;
    let fireProgressDelta: number | null = null;
    let passiveIncomeDelta: number | null = null;
    const riskDelta = riskDeltaFor(m);

    if (fanLen > 0) {
      const idx = monthsBetween(startMonth, m.month);
      if (idx >= 0 && idx < fanLen) {
        const beforeIdx = Math.max(0, idx - 1);
        const beforeVal = fanP50At(fan, beforeIdx);
        const afterVal = fanP50At(fan, idx);
        const before = pctOfFire(beforeVal, fireNumber);
        const after = pctOfFire(afterVal, fireNumber);
        const delta = before != null && after != null ? after - before : null;
        if (before != null || after != null) {
          impact = { before, after, delta };
          fireProgressDelta = delta;
        }

        // Milestone-to-milestone NW $ delta (and implied passive income).
        if (prevMilestoneMonth != null) {
          const prevIdx = monthsBetween(startMonth, prevMilestoneMonth);
          const prevNw = fanP50At(fan, prevIdx);
          if (prevNw != null && afterVal != null) {
            netWorthDelta = afterVal - prevNw;
            if (swrPct != null && Number.isFinite(swrPct) && swrPct > 0) {
              passiveIncomeDelta = netWorthDelta * (swrPct / 100);
            }
          }
        } else if (afterVal != null && fanP50At(fan, 0) != null) {
          // First milestone — measure vs the fan's starting point.
          netWorthDelta = afterVal - (fanP50At(fan, 0) as number);
          if (swrPct != null && Number.isFinite(swrPct) && swrPct > 0) {
            passiveIncomeDelta = netWorthDelta * (swrPct / 100);
          }
        }

        if (m.status !== "fire") prevMilestoneMonth = m.month;
      }
    }

    return {
      ...m,
      progressImpact: impact,
      expectedOutcome: buildExpectedOutcome(m, impact),
      netWorthDelta,
      fireProgressDelta,
      passiveIncomeDelta,
      riskDelta,
    };
  });

  // §6.2 zero-delta filter — FIRE marker always kept.
  return enriched.filter((m) => m.status === "fire" || hasMeasurableImpact(m));
}
