/**
 * nextActionsBuilder.test.ts — Sprint 28B.
 *
 * Tests for milestone → action-bucket partitioning. Must:
 *   1. Return empty buckets when no milestones.
 *   2. Skip completed and FIRE milestones (those don't go in "next" buckets).
 *   3. Bucket milestones into thisMonth / next90Days / next12Months by date.
 *   4. Expand known milestone labels into the documented prep actions.
 *   5. Emit a single "Review milestone" entry for unknown labels.
 *   6. Drop milestones beyond 365 days (no bucket).
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/nextActionsBuilder.test.ts
 */
import type { RoadmapMilestone } from "../types";
import { buildNextActions } from "../nextActionsBuilder";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function ms(month: string, label: string, status: RoadmapMilestone["status"] = "upcoming"): RoadmapMilestone {
  return {
    id: `m-${month}-${label.slice(0, 8)}`,
    year: parseInt(month.slice(0, 4), 10),
    month,
    label,
    effect: "engine effect",
    status,
    sourceTag: "scenarioDelta.buy_property",
    sourceTemplateId: "buy-ip-now",
  };
}

console.log("\nnextActionsBuilder — bucketing + template expansion");

const TODAY = new Date(2026, 5, 1); // 2026-06-01

// 1. Empty milestones → empty buckets
const r1 = buildNextActions({ milestones: [], today: TODAY });
check("empty milestones → next30Days empty", r1.next30Days.length === 0);
check("empty milestones → next90Days empty", r1.next90Days.length === 0);
check("empty milestones → next12Months empty", r1.next12Months.length === 0);

// 2. Completed milestones skipped
const r2 = buildNextActions({ milestones: [ms("2026-06", "Acquire investment property", "completed")], today: TODAY });
check("completed milestone → no actions emitted", r2.next30Days.length + r2.next90Days.length + r2.next12Months.length === 0);

// FIRE milestones skipped
const r2b = buildNextActions({ milestones: [ms("2026-06", "Target FIRE at age 60", "fire")], today: TODAY });
check("fire milestone → no actions emitted", r2b.next30Days.length + r2b.next90Days.length + r2b.next12Months.length === 0);

// 3. Bucketing
const milestones3 = [
  ms("2026-06", "Acquire investment property"), // this month (today is 2026-06-01)
  ms("2026-08", "ETF lump-sum investment"),     // next 90 days
  ms("2027-02", "Refinance mortgage"),          // next 12 months
  ms("2028-01", "Sell property"),               // beyond 365 days → dropped
];
const r3 = buildNextActions({ milestones: milestones3, today: TODAY });
check("next-30-days bucket has buy-property actions", r3.next30Days.length === 3);
check("next-90-days bucket has ETF lump actions", r3.next90Days.length === 2);
check("next-12-months bucket has refinance actions", r3.next12Months.length === 2);
check("beyond 365 days dropped (sell-property not in any bucket)", r3.next30Days.concat(r3.next90Days, r3.next12Months).every(a => !a.title.toLowerCase().includes("sales agent")));

// 4. Template expansion produces verb-led actions
const buyProp = r3.next30Days.find(a => a.title.includes("broker"));
check("buy-property → 'Speak with mortgage broker'", buyProp !== undefined);
const etfLump = r3.next90Days.find(a => a.title.includes("brokerage"));
check("etf-lump → 'Confirm brokerage account is funded'", etfLump !== undefined);
const refi = r3.next12Months.find(a => a.title.includes("refinance quotes"));
check("refinance → 'Request 3 refinance quotes'", refi !== undefined);

// 5. Unknown label → single Review fallback
const rUnknown = buildNextActions({ milestones: [ms("2026-07", "Mystery custom delta")], today: TODAY });
check("unknown label → exactly 1 action", rUnknown.next30Days.length + rUnknown.next90Days.length === 1);
check("unknown label → 'Review milestone: ...'",
  rUnknown.next90Days[0]?.title === "Review milestone: Mystery custom delta" || rUnknown.next30Days[0]?.title === "Review milestone: Mystery custom delta");

// 6. Source milestone id preserved
const sourceTied = r3.next30Days.every(a => a.sourceMilestoneId.includes("Acquire"));
check("sourceMilestoneId preserved", sourceTied);

// 7. Due field echoes milestone month
check("due field echoes milestone month", r3.next12Months.every(a => a.due === "2027-02"));

// ─── Sprint 29 §11 — dedup + rebucket tests ──────────────────────────────

function msWithId(id: string, month: string, label: string): import("../types").RoadmapMilestone {
  return {
    id, year: parseInt(month.slice(0, 4), 10), month, label,
    effect: "engine effect", status: "upcoming",
    sourceTag: "scenarioDelta.buy_property", sourceTemplateId: "buy-ip-now",
  };
}

// 8. Duplicate (title, sourceMilestoneId) collapsed to single entry.
//    Two milestones with the SAME id (same milestone fed twice) → dedup
//    collapses to one set of actions (3, not 6).
const sameId1 = msWithId("dup-1", "2026-07", "Acquire investment property");
const sameId2 = msWithId("dup-1", "2026-07", "Acquire investment property");
const rDup = buildNextActions({ milestones: [sameId1, sameId2], today: TODAY });
check("duplicate (title, milestoneId) collapsed", rDup.next30Days.length + rDup.next90Days.length === 3);

// 9. Same title across DIFFERENT milestones is kept (distinct)
const diffMs1 = msWithId("diff-1", "2026-07", "Acquire investment property");
const diffMs2 = msWithId("diff-2", "2026-08", "Acquire investment property");
const rDiff = buildNextActions({ milestones: [diffMs1, diffMs2], today: TODAY });
check("same title, different milestones → both kept (6 actions)", rDiff.next30Days.length + rDiff.next90Days.length === 6);

// 10. Buckets renamed: legacy `thisMonth` field absent, `next30Days` present
const rRename = buildNextActions({ milestones: [msWithId("r1", "2026-06", "Acquire investment property")], today: TODAY });
check("bucket renamed: next30Days populated", rRename.next30Days.length > 0);
check("legacy thisMonth field is not present on result", !("thisMonth" in (rRename as Record<string, unknown>)));

// 11. Items whose source milestone was filtered (§6.2) are dropped — caller
//     enforces this by passing the already-filtered milestones array. We
//     verify the contract by passing a milestone with status "completed"
//     (the same filter behaviour the page applies) and confirming no items
//     emerge.
const completedMs: import("../types").RoadmapMilestone = { ...msWithId("zd-1", "2026-07", "Acquire investment property"), status: "completed" };
const rFiltered = buildNextActions({ milestones: [completedMs], today: TODAY });
check("filtered milestone (status completed) → no actions", rFiltered.next30Days.length + rFiltered.next90Days.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
