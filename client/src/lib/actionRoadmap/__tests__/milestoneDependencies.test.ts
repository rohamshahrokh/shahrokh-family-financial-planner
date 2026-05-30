/**
 * milestoneDependencies.test.ts — Sprint 30A.
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/milestoneDependencies.test.ts
 */
import type { LaneEvent, Lane } from "../engineEventLanes";
import { buildDependencyChain } from "../milestoneDependencies";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function le(id: string, lane: Lane, month: string, source: "engine" | "derived" = "engine", sourceDeltaId: string | null = null): LaneEvent {
  return {
    id, lane, month, action: id, source, sourceDeltaId,
    impact: { netWorthDelta: null, fireImpactMonths: null, passiveIncomeDelta: null, riskDirection: null },
    whyItExists: "test",
  };
}

console.log("\nmilestoneDependencies — Sprint 30A");

// 1. < 2 events → empty edges
check("empty input → []", buildDependencyChain({ events: [] }).length === 0);
check("single event → []", buildDependencyChain({ events: [le("a", "acquisition", "2027-01")] }).length === 0);

// 2. Engine edge via shared sourceDeltaId
const r2 = buildDependencyChain({
  events: [
    le("e1", "debt_reduction", "2026-06", "engine", "delta-X"),
    le("e2", "acquisition",    "2027-01", "engine", "delta-X"),
  ],
});
check("shared sourceDeltaId → engine edge", r2.some((e) => e.source === "engine" && e.fromMilestoneId === "e1" && e.toMilestoneId === "e2"));
check("engine edge rationale mentions sourceDeltaId", r2.find((e) => e.source === "engine")?.rationale.includes("delta-X"));

// 3. Heuristic rule: debt_reduction → borrowing_capacity within 6 months
const r3 = buildDependencyChain({
  events: [
    le("od", "debt_reduction", "2026-06"),
    le("bc", "borrowing_capacity", "2026-07", "derived"),
  ],
});
check("debt_reduction → borrowing_capacity (6mo) heuristic edge", r3.some((e) => e.fromMilestoneId === "od" && e.toMilestoneId === "bc" && e.source === "heuristic"));

// 4. Heuristic rule: borrowing_capacity → acquisition within 12 months
const r4 = buildDependencyChain({
  events: [
    le("bc", "borrowing_capacity", "2026-07", "derived"),
    le("buy", "acquisition", "2027-03"),
  ],
});
check("borrowing_capacity → acquisition (12mo) heuristic", r4.some((e) => e.fromMilestoneId === "bc" && e.toMilestoneId === "buy" && e.source === "heuristic"));

// 5. Heuristic rule: acquisition → debt_reduction within 24 months
const r5 = buildDependencyChain({
  events: [
    le("buy", "acquisition", "2027-03"),
    le("od2", "debt_reduction", "2028-12"),
  ],
});
check("acquisition → debt_reduction (24mo) heuristic", r5.some((e) => e.fromMilestoneId === "buy" && e.toMilestoneId === "od2" && e.source === "heuristic"));

// 6. Heuristic rule: debt_reduction → equity_release within 36 months
const r6 = buildDependencyChain({
  events: [
    le("od", "debt_reduction", "2026-06"),
    le("er", "equity_release", "2029-01"),
  ],
});
check("debt_reduction → equity_release (36mo) heuristic", r6.some((e) => e.fromMilestoneId === "od" && e.toMilestoneId === "er" && e.source === "heuristic"));

// 7. Window too wide: debt_reduction → borrowing_capacity > 6 months → NO heuristic edge
const r7 = buildDependencyChain({
  events: [
    le("od", "debt_reduction", "2026-06"),
    le("bc", "borrowing_capacity", "2027-06", "derived"), // 12 months later
  ],
});
check("DR→BC > 6 months → no heuristic edge", !r7.some((e) => e.fromMilestoneId === "od" && e.toMilestoneId === "bc"));

// 8. Closing rule: every preceding milestone → exit
const r8 = buildDependencyChain({
  events: [
    le("od", "debt_reduction", "2026-06"),
    le("buy", "acquisition", "2027-06"),
    le("exit", "exit", "2040-01", "derived"),
  ],
});
const exitEdges = r8.filter((e) => e.toMilestoneId === "exit");
check("closing rule: all prior milestones → exit", exitEdges.length === 2);
check("closing rule edges marked heuristic", exitEdges.every((e) => e.source === "heuristic"));
check("closing rule rationale mentions terminal", exitEdges[0].rationale.toLowerCase().includes("terminal"));

// 9. Engine edge takes precedence over heuristic (no duplicate edge)
const r9 = buildDependencyChain({
  events: [
    le("od", "debt_reduction", "2026-06", "engine", "delta-Y"),
    le("bc", "borrowing_capacity", "2026-07", "derived", "delta-Y"),
  ],
});
const edgesODtoBC = r9.filter((e) => e.fromMilestoneId === "od" && e.toMilestoneId === "bc");
check("engine wins over heuristic — single edge", edgesODtoBC.length === 1);
check("the surviving edge is engine", edgesODtoBC[0].source === "engine");

// 10. Edges dedup'd — same pair never appears twice
const r10 = buildDependencyChain({
  events: [
    le("od", "debt_reduction", "2026-06"),
    le("bc", "borrowing_capacity", "2026-07", "derived"),
    le("bc2", "borrowing_capacity", "2026-08", "derived"),
  ],
});
const odEdges = r10.filter((e) => e.fromMilestoneId === "od");
const odKeys = odEdges.map((e) => `${e.fromMilestoneId}::${e.toMilestoneId}`);
const uniq = new Set(odKeys);
check("no duplicate edges per pair", odKeys.length === uniq.size);

// 11. Exit milestones earlier than other events: only prior milestones link
const r11 = buildDependencyChain({
  events: [
    le("exit", "exit", "2027-01", "derived"),
    le("od", "debt_reduction", "2028-01"),
  ],
});
check("future milestone does NOT link to past exit", !r11.some((e) => e.fromMilestoneId === "od" && e.toMilestoneId === "exit"));

// 12. Engine edge between non-adjacent same-delta events
const r12 = buildDependencyChain({
  events: [
    le("a", "debt_reduction", "2026-06", "engine", "delta-Z"),
    le("b", "acquisition", "2027-01", "engine", "delta-Z"),
    le("c", "exit", "2040-01", "derived"),
  ],
});
check("engine edge a→b present", r12.some((e) => e.fromMilestoneId === "a" && e.toMilestoneId === "b" && e.source === "engine"));
check("closing rule still adds a→c and b→c", r12.filter((e) => e.toMilestoneId === "c").length === 2);

// 13. Heuristic rule does not fire when temporal order reversed
const r13 = buildDependencyChain({
  events: [
    le("bc", "borrowing_capacity", "2027-06", "derived"),
    le("od", "debt_reduction", "2026-06"),
  ],
});
check("reversed temporal order → no heuristic edge", !r13.some((e) => e.fromMilestoneId === "od" && e.toMilestoneId === "bc"));

// 14. Cross-lane non-matching pair → no edge
const r14 = buildDependencyChain({
  events: [
    le("a", "acquisition", "2026-06"),
    le("b", "equity_release", "2026-12"),
  ],
});
check("acquisition→equity_release has no heuristic edge (not in ruleset)", !r14.some((e) => e.fromMilestoneId === "a" && e.toMilestoneId === "b"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
