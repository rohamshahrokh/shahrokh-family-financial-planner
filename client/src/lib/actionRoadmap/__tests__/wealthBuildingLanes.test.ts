/**
 * wealthBuildingLanes.test.ts — Sprint 28B.
 *
 * Tests lane assignment + FIRE-progress sparkline. Must:
 *   1. Return empty lanes when no milestones provided.
 *   2. Partition milestones into the correct lane by sourceTag.
 *   3. Cap segment endYear at horizon.
 *   4. Skip FIRE-target milestone (it doesn't belong in a wealth lane).
 *   5. Build per-year FIRE-progress points clamped 0..1.
 *   6. Return null pct when fireNumber missing OR year past fan length.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/wealthBuildingLanes.test.ts
 */
import type { FanPoint } from "../../scenarioV2/types";
import type { RoadmapMilestone } from "../types";
import { selectWealthBuildingLanes } from "../wealthBuildingLanes";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function fp(p50: number): FanPoint {
  return { month: "ignored", p5: p50 * 0.5, p10: p50 * 0.6, p25: p50 * 0.8, p50, p75: p50 * 1.2, p90: p50 * 1.4, p95: p50 * 1.5 };
}

function ms(month: string, label: string, sourceTag: string, status: RoadmapMilestone["status"] = "upcoming"): RoadmapMilestone {
  return {
    id: `m-${month}-${sourceTag}`,
    year: parseInt(month.slice(0, 4), 10),
    month,
    label,
    effect: "engine effect",
    status,
    sourceTag,
    sourceTemplateId: "buy-ip-now",
  };
}

const fan: FanPoint[] = [];
for (let i = 0; i < 12 * 10; i++) fan.push(fp(500_000 + (i / (12 * 10 - 1)) * 2_000_000));

console.log("\nwealthBuildingLanes — lane partitioning + sparkline");

// 1. Empty milestones
const r1 = selectWealthBuildingLanes({ milestones: [], fan, startMonth: "2026-01", fireNumber: 2_000_000, horizonYears: 10 });
check("empty milestones → all lanes empty", Object.values(r1.lanes).every(a => a.length === 0));
check("empty milestones still produces fireProgress array", r1.fireProgress.length > 0);

// 2. Lane partitioning
const milestones = [
  ms("2026-06", "Acquire investment property",      "scenarioDelta.buy_property"),
  ms("2027-03", "ETF lump-sum investment",          "scenarioDelta.etf_lump_sum"),
  ms("2027-09", "Start ETF DCA",                    "scenarioDelta.etf_dca"),
  ms("2028-01", "Refinance mortgage",               "scenarioDelta.refinance"),
  ms("2028-06", "Deposit to offset account",        "scenarioDelta.offset_deposit"),
  ms("2029-01", "Salary sacrifice to super",        "scenarioDelta.super_contribution"),
  ms("2029-06", "Career break",                     "scenarioDelta.career_break"),
  ms("2031-01", "Target FIRE at age 55",            "derived.fire-target", "fire"),
];
const r2 = selectWealthBuildingLanes({ milestones, fan, startMonth: "2026-01", fireNumber: 2_000_000, horizonYears: 10 });
check("property lane has buy-property entry", r2.lanes.property.some(s => s.label.includes("investment property")));
check("etf lane has both lump and dca entries", r2.lanes.etf.length === 2);
check("debt lane has refinance + offset_deposit", r2.lanes.debt.length === 2);
check("super lane has salary sacrifice", r2.lanes.super.length === 1);
check("cashflow lane has career break", r2.lanes.cashflow.length === 1);

// 3. FIRE milestone NOT in any wealth lane
const fireInLanes = Object.values(r2.lanes).flat().some(s => s.label.includes("Target FIRE"));
check("FIRE milestone skipped from wealth lanes", !fireInLanes);

// 4. Property segment is 4 years long (capped at horizon)
const propSeg = r2.lanes.property.find(s => s.label.includes("Acquire"));
check("property segment startYear = 2026", propSeg?.startYear === 2026);
check("property segment endYear = startYear + 4 (or capped)", propSeg?.endYear === 2030);

// 5. FIRE-progress: 11 points (years 2026..2036), monotonic, clamped 0..1
check("fireProgress yearRange from = 2026", r2.yearRange.from === 2026);
check("fireProgress yearRange to = 2036", r2.yearRange.to === 2036);
const firstPct = r2.fireProgress.find(p => p.year === 2026)?.pctOfFire;
const lastPct = r2.fireProgress.find(p => p.year === 2035)?.pctOfFire;
check("first-year pct in [0,1]", firstPct != null && firstPct >= 0 && firstPct <= 1);
check("year-9 pct in [0,1] and > first", lastPct != null && lastPct > (firstPct as number));

// 6. Null fireNumber → all fireProgress.pctOfFire null
const rNoFire = selectWealthBuildingLanes({ milestones, fan, startMonth: "2026-01", fireNumber: null, horizonYears: 10 });
check("null fireNumber → all fireProgress pct null", rNoFire.fireProgress.every(p => p.pctOfFire === null));

// 7. Year past fan end → pct null
const rShort = selectWealthBuildingLanes({ milestones, fan: fan.slice(0, 24), startMonth: "2026-01", fireNumber: 2_000_000, horizonYears: 10 });
const beyondFan = rShort.fireProgress.find(p => p.year === 2030)?.pctOfFire;
check("year past fan end → pct null", beyondFan === null);

// 8. Unknown sourceTag → no lane entry (no crash)
const rUnknown = selectWealthBuildingLanes({
  milestones: [ms("2026-06", "Mystery", "scenarioDelta.unknown_thing")],
  fan, startMonth: "2026-01", fireNumber: 2_000_000, horizonYears: 10,
});
check("unknown sourceTag → no lane entry", Object.values(rUnknown.lanes).every(a => a.length === 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
