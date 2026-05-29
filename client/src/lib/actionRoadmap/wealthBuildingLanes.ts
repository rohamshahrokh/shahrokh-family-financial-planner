/**
 * actionRoadmap/wealthBuildingLanes.ts — Sprint 28B.
 *
 * Partitions roadmap milestones into the six lanes rendered by the
 * Wealth Timeline Gantt (S3) and produces a per-year FIRE-progress
 * sparkline from the engine's `netWorthFan`.
 *
 * THIS MODULE PERFORMS NO FINANCIAL MATH. It simply re-indexes existing
 * engine output. Lane assignment is driven by `milestone.sourceTag`
 * (set by `actionRoadmapBuilder`); FIRE-progress points are pure ratios
 * over the existing fan.
 *
 * Honesty rules:
 *   - Lanes with no matching milestones are returned as empty arrays.
 *   - FIRE-progress points are null when `fireNumber` is missing OR the
 *     fan doesn't reach a given year.
 */
import type { FanPoint } from "../scenarioV2/types";
import type { RoadmapMilestone } from "./types";

export type LaneKey = "property" | "debt" | "cashflow" | "etf" | "super" | "fire_progress";

export interface LaneSegment {
  lane: LaneKey;
  startYear: number;
  endYear: number;
  label: string;
  sourceMilestoneId: string;
}

export interface FireProgressPoint {
  year: number;
  pctOfFire: number | null; // 0..1
}

export interface WealthBuildingLanes {
  yearRange: { from: number; to: number };
  lanes: Record<LaneKey, LaneSegment[]>;
  fireProgress: FireProgressPoint[];
}

export interface SelectInput {
  milestones: RoadmapMilestone[];
  fan: FanPoint[];
  /** 'YYYY-MM' first fan point — used to map year offsets. */
  startMonth: string;
  fireNumber: number | null;
  horizonYears: number;
}

// Lane assignment by sourceTag fragment. Each entry maps a substring on the
// roadmap milestone sourceTag → a lane + default segment length in years.
// Property purchases get a 4y segment (engine ownership window); ETF lump =
// 1y (one-time event); ETF DCA = remainder; debt + cashflow + super default
// to 1y unless extended by the engine.
interface LaneRule {
  tagMatch: RegExp;
  lane: LaneKey;
  segmentYears: number; // default segment length (years)
}

const LANE_RULES: LaneRule[] = [
  { tagMatch: /buy_property|sell_property/i,           lane: "property", segmentYears: 4 },
  { tagMatch: /property_deposit_boost/i,                lane: "property", segmentYears: 1 },
  { tagMatch: /etf_lump_sum|crypto_lump_sum/i,         lane: "etf",      segmentYears: 1 },
  { tagMatch: /etf_dca/i,                              lane: "etf",      segmentYears: 5 },
  { tagMatch: /super_contribution|salary_sacrifice/i,  lane: "super",    segmentYears: 1 },
  { tagMatch: /offset_deposit|extra_mortgage_repayment|refinance/i, lane: "debt", segmentYears: 1 },
  { tagMatch: /cashflow_|career_break|salary_change|child_expense/i, lane: "cashflow", segmentYears: 1 },
  { tagMatch: /rentvest/i, lane: "property", segmentYears: 3 },
];

function ruleFor(sourceTag: string): LaneRule | null {
  for (const r of LANE_RULES) {
    if (r.tagMatch.test(sourceTag)) return r;
  }
  return null;
}

function yearOf(monthKey: string): number {
  const y = parseInt(monthKey.slice(0, 4), 10);
  return Number.isFinite(y) ? y : 0;
}

function startYearOf(startMonth: string): number {
  return yearOf(startMonth);
}

export function selectWealthBuildingLanes(input: SelectInput): WealthBuildingLanes {
  const { milestones, fan, startMonth, fireNumber, horizonYears } = input;
  const fromYear = startYearOf(startMonth);
  const toYear = fromYear + Math.max(1, Math.floor(horizonYears));

  const lanes: Record<LaneKey, LaneSegment[]> = {
    property: [],
    debt: [],
    cashflow: [],
    etf: [],
    super: [],
    fire_progress: [],
  };

  for (const m of milestones) {
    if (m.status === "fire") continue; // FIRE marker doesn't belong to a wealth lane
    const rule = ruleFor(m.sourceTag);
    if (!rule) continue;
    const sy = yearOf(m.month);
    if (!Number.isFinite(sy) || sy <= 0) continue;
    const ey = Math.min(toYear, sy + rule.segmentYears);
    lanes[rule.lane].push({
      lane: rule.lane,
      startYear: sy,
      endYear: ey,
      label: m.label,
      sourceMilestoneId: m.id,
    });
  }

  // FIRE-progress sparkline — one point per year using fan[year*12].p50.
  const fanLen = Array.isArray(fan) ? fan.length : 0;
  const fireProgress: FireProgressPoint[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const monthIdx = (y - fromYear) * 12;
    if (
      monthIdx < fanLen &&
      fireNumber != null &&
      Number.isFinite(fireNumber) &&
      fireNumber > 0
    ) {
      const p50 = fan[monthIdx]?.p50;
      const pct = p50 != null && Number.isFinite(p50) ? Math.max(0, Math.min(1, p50 / fireNumber)) : null;
      fireProgress.push({ year: y, pctOfFire: pct });
    } else {
      fireProgress.push({ year: y, pctOfFire: null });
    }
  }

  return {
    yearRange: { from: fromYear, to: toYear },
    lanes,
    fireProgress,
  };
}
