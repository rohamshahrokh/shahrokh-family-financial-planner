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
  };
}

console.log("\nnextActionsBuilder — bucketing + template expansion");

const TODAY = new Date(2026, 5, 1); // 2026-06-01

// 1. Empty milestones → empty buckets
const r1 = buildNextActions({ milestones: [], today: TODAY });
check("empty milestones → thisMonth empty", r1.thisMonth.length === 0);
check("empty milestones → next90Days empty", r1.next90Days.length === 0);
check("empty milestones → next12Months empty", r1.next12Months.length === 0);

// 2. Completed milestones skipped
const r2 = buildNextActions({ milestones: [ms("2026-06", "Acquire investment property", "completed")], today: TODAY });
check("completed milestone → no actions emitted", r2.thisMonth.length + r2.next90Days.length + r2.next12Months.length === 0);

// FIRE milestones skipped
const r2b = buildNextActions({ milestones: [ms("2026-06", "Target FIRE at age 60", "fire")], today: TODAY });
check("fire milestone → no actions emitted", r2b.thisMonth.length + r2b.next90Days.length + r2b.next12Months.length === 0);

// 3. Bucketing
const milestones3 = [
  ms("2026-06", "Acquire investment property"), // this month (today is 2026-06-01)
  ms("2026-08", "ETF lump-sum investment"),     // next 90 days
  ms("2027-02", "Refinance mortgage"),          // next 12 months
  ms("2028-01", "Sell property"),               // beyond 365 days → dropped
];
const r3 = buildNextActions({ milestones: milestones3, today: TODAY });
check("this-month bucket has buy-property actions", r3.thisMonth.length === 3);
check("next-90-days bucket has ETF lump actions", r3.next90Days.length === 2);
check("next-12-months bucket has refinance actions", r3.next12Months.length === 2);
check("beyond 365 days dropped (sell-property not in any bucket)", r3.thisMonth.concat(r3.next90Days, r3.next12Months).every(a => !a.title.toLowerCase().includes("sales agent")));

// 4. Template expansion produces verb-led actions
const buyProp = r3.thisMonth.find(a => a.title.includes("broker"));
check("buy-property → 'Speak with mortgage broker'", buyProp !== undefined);
const etfLump = r3.next90Days.find(a => a.title.includes("brokerage"));
check("etf-lump → 'Confirm brokerage account is funded'", etfLump !== undefined);
const refi = r3.next12Months.find(a => a.title.includes("refinance quotes"));
check("refinance → 'Request 3 refinance quotes'", refi !== undefined);

// 5. Unknown label → single Review fallback
const rUnknown = buildNextActions({ milestones: [ms("2026-07", "Mystery custom delta")], today: TODAY });
check("unknown label → exactly 1 action", rUnknown.thisMonth.length + rUnknown.next90Days.length === 1);
check("unknown label → 'Review milestone: ...'",
  rUnknown.next90Days[0]?.title === "Review milestone: Mystery custom delta" || rUnknown.thisMonth[0]?.title === "Review milestone: Mystery custom delta");

// 6. Source milestone id preserved
const sourceTied = r3.thisMonth.every(a => a.sourceMilestoneId.includes("Acquire"));
check("sourceMilestoneId preserved", sourceTied);

// 7. Due field echoes milestone month
check("due field echoes milestone month", r3.next12Months.every(a => a.due === "2027-02"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
