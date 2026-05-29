/**
 * fireJourneyMilestones.test.ts — Sprint 28B.
 *
 * Tests for milestone enrichment with per-milestone FIRE-progress impact.
 * The selector must:
 *   1. Return [] for empty milestone input.
 *   2. Compute `before` / `after` / `delta` as % of FIRE number from p50 NW.
 *   3. Leave progressImpact null when fan is empty.
 *   4. Leave progressImpact null when fireNumber is null/zero.
 *   5. Leave progressImpact null when milestone month is outside the fan.
 *   6. Build a clear expectedOutcome string for FIRE milestone vs others.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/fireJourneyMilestones.test.ts
 */
import type { FanPoint } from "../../scenarioV2/types";
import type { RoadmapMilestone } from "../types";
import { enrichFireJourneyMilestones } from "../fireJourneyMilestones";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function fp(p50: number, p25 = p50 * 0.8, p75 = p50 * 1.2): FanPoint {
  return { month: "ignored", p5: p50 * 0.5, p10: p50 * 0.6, p25, p50, p75, p90: p50 * 1.4, p95: p50 * 1.5 };
}

function ms(month: string, label = "Acquire investment property", status: RoadmapMilestone["status"] = "upcoming"): RoadmapMilestone {
  return {
    id: `m-${month}-${label}`,
    year: parseInt(month.slice(0, 4), 10),
    month,
    label,
    effect: "Engine-modelled milestone.",
    status,
    sourceTag: "scenarioDelta.buy_property",
    sourceTemplateId: "buy-ip-now",
  };
}

console.log("\nfireJourneyMilestones — enrichment honesty");

// 1. Empty milestones → []
check("empty milestones → []", enrichFireJourneyMilestones({ milestones: [], fan: [fp(100_000)], startMonth: "2026-01", fireNumber: 1_000_000 }).length === 0);

// Build a 60-month fan growing linearly 1_000_000 → 2_500_000, FIRE = 2_000_000.
const fan: FanPoint[] = [];
for (let i = 0; i < 60; i++) {
  fan.push(fp(1_000_000 + (i / 59) * 1_500_000));
}

// 2. Single milestone at month 12 → before & after computed
const r2 = enrichFireJourneyMilestones({
  milestones: [ms("2027-01")], // 12 months from 2026-01
  fan,
  startMonth: "2026-01",
  fireNumber: 2_000_000,
});
check("single milestone → impact set", r2[0].progressImpact != null);
check("impact.after computed from fan[12].p50 / fireNumber * 100", Math.abs((r2[0].progressImpact!.after as number) - (fan[12].p50 / 2_000_000) * 100) < 1e-6);
check("impact.before from fan[11]", Math.abs((r2[0].progressImpact!.before as number) - (fan[11].p50 / 2_000_000) * 100) < 1e-6);
check("delta = after - before", Math.abs((r2[0].progressImpact!.delta as number) - ((r2[0].progressImpact!.after as number) - (r2[0].progressImpact!.before as number))) < 1e-9);

// 3. Multi-milestone happy path (all in fan) → all enriched
const r3 = enrichFireJourneyMilestones({
  milestones: [ms("2026-06"), ms("2027-06"), ms("2028-06")],
  fan,
  startMonth: "2026-01",
  fireNumber: 2_000_000,
});
check("multi-milestone all enriched", r3.every(m => m.progressImpact != null));
check("multi-milestone monotonically rising progress", (r3[0].progressImpact!.after as number) < (r3[1].progressImpact!.after as number) && (r3[1].progressImpact!.after as number) < (r3[2].progressImpact!.after as number));

// 4. Empty fan → impact null
const r4 = enrichFireJourneyMilestones({ milestones: [ms("2027-01")], fan: [], startMonth: "2026-01", fireNumber: 2_000_000 });
check("empty fan → progressImpact null", r4[0].progressImpact === null);

// 5. Null fireNumber → impact null
const r5 = enrichFireJourneyMilestones({ milestones: [ms("2027-01")], fan, startMonth: "2026-01", fireNumber: null });
check("null fireNumber → progressImpact null", r5[0].progressImpact === null);
const r5b = enrichFireJourneyMilestones({ milestones: [ms("2027-01")], fan, startMonth: "2026-01", fireNumber: 0 });
check("zero fireNumber → progressImpact null", r5b[0].progressImpact === null);

// 6. Milestone outside fan window → impact null
const r6 = enrichFireJourneyMilestones({ milestones: [ms("2035-01")], fan, startMonth: "2026-01", fireNumber: 2_000_000 });
check("milestone past fan end → progressImpact null", r6[0].progressImpact === null);
const r6b = enrichFireJourneyMilestones({ milestones: [ms("2025-01")], fan, startMonth: "2026-01", fireNumber: 2_000_000 });
check("milestone before fan start → progressImpact null", r6b[0].progressImpact === null);

// 7. FIRE milestone always gets the special outcome string
const fireMs: RoadmapMilestone = { ...ms("2031-01", "Target FIRE at age 55", "fire"), id: "derived.fire-target", sourceTag: "derived.fire-target", sourceTemplateId: "buy-ip-now" };
const r7 = enrichFireJourneyMilestones({ milestones: [fireMs], fan, startMonth: "2026-01", fireNumber: 2_000_000 });
check("FIRE milestone → expectedOutcome mentions FIRE", r7[0].expectedOutcome.toLowerCase().includes("fire"));

// 8. Completed milestones with no measurable forward impact are filtered by §6.2.
//    A flat fan yields zero NW delta; completed status yields null risk delta;
//    therefore the milestone is dropped.
const flatFanForCompleted: FanPoint[] = [];
for (let i = 0; i < 12; i++) flatFanForCompleted.push(fp(1_000_000));
const r8 = enrichFireJourneyMilestones({ milestones: [ms("2026-03", "Refinance", "completed")], fan: flatFanForCompleted, startMonth: "2026-01", fireNumber: 2_000_000 });
check("completed milestone with no measurable impact is filtered (§6.2)", r8.length === 0);

// ─── Sprint 29 §6 — 4-delta + zero-filter tests ──────────────────────────

// 9. 4-delta computation: buy-property milestone with a rising fan + swr
const r9 = enrichFireJourneyMilestones({
  milestones: [ms("2027-01")],
  fan, startMonth: "2026-01", fireNumber: 2_000_000, swrPct: 4,
});
check("netWorthDelta computed", r9[0].netWorthDelta != null && Number.isFinite(r9[0].netWorthDelta as number));
check("passiveIncomeDelta = netWorthDelta × swrPct/100", r9[0].passiveIncomeDelta != null && Math.abs((r9[0].passiveIncomeDelta as number) - (r9[0].netWorthDelta as number) * 0.04) < 1e-6);
check("fireProgressDelta matches progressImpact.delta", r9[0].fireProgressDelta === r9[0].progressImpact?.delta);
check("buy_property → riskDelta = 'higher'", r9[0].riskDelta === "higher");

// 10. Zero-delta filter drops a milestone with flat sourceTag and no fan-driven impact
const flatMs: RoadmapMilestone = {
  id: "flat-1",
  year: 2027,
  month: "2027-01",
  label: "Plan event",
  effect: "no-op",
  status: "upcoming",
  sourceTag: "scenarioDelta.cash_hold",       // riskDeltaFor → "flat"
  sourceTemplateId: "buy-ip-now",
};
const flatFan: FanPoint[] = [];
for (let i = 0; i < 24; i++) flatFan.push(fp(1_000_000));   // entirely flat fan → no NW delta
const rFlat = enrichFireJourneyMilestones({ milestones: [flatMs], fan: flatFan, startMonth: "2026-01", fireNumber: 2_000_000, swrPct: 4 });
check("all-zero milestone is dropped (§6.2)", rFlat.length === 0);

// 11. FIRE marker is always kept even when every delta would be zero
const fireOnlyFan: FanPoint[] = [fp(1_000_000)];
const rFire = enrichFireJourneyMilestones({ milestones: [fireMs], fan: fireOnlyFan, startMonth: "2026-01", fireNumber: 2_000_000, swrPct: 4 });
check("FIRE marker preserved with zero deltas", rFire.length === 1 && rFire[0].status === "fire");

// 12. Milestone-to-milestone NW delta uses the previous milestone's month (not month-1)
const r12 = enrichFireJourneyMilestones({
  milestones: [ms("2026-06"), ms("2027-06")],
  fan, startMonth: "2026-01", fireNumber: 2_000_000, swrPct: 4,
});
// fan is rising linearly; second milestone NW delta should be ~ fan[18] - fan[5]
const expectedDelta2 = fan[17].p50 - fan[5].p50;
check("second milestone NW delta measured vs previous milestone month, not month-1",
  Math.abs((r12[1].netWorthDelta as number) - expectedDelta2) < 1e-6,
  `got=${r12[1].netWorthDelta}, expected≈${expectedDelta2}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
