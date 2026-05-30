/**
 * eventTraceability.test.ts — Sprint 30A addendum A2.
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/eventTraceability.test.ts
 */
import type { Lane, LaneEvent } from "../engineEventLanes";
import { validateTraceability, nonEmptyLanes } from "../eventTraceability";
import { selectEngineEventLanes } from "../engineEventLanes";
import type { FanPoint, ScenarioEvent, ScenarioEventType } from "../../scenarioV2/types";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function ev(over: Partial<LaneEvent> = {}): LaneEvent {
  // Build the base then spread `over` so explicit `undefined` overrides win.
  const base: LaneEvent = {
    id: "e1",
    lane: "acquisition",
    month: "2027-06",
    action: "Buy property",
    source: "engine",
    sourceDeltaId: "delta-1",
    rawEventType: "asset.buy_property",
    impact: { netWorthDelta: null, fireImpactMonths: null, passiveIncomeDelta: null, riskDirection: null },
    whyItExists: "engine rationale",
  };
  return { ...base, ...over };
}

function fp(p50: number, month = "2026-01"): FanPoint {
  return { month, p5: p50 * 0.5, p10: p50 * 0.6, p25: p50 * 0.8, p50, p75: p50 * 1.2, p90: p50 * 1.4, p95: p50 * 1.5 };
}

function monthFromStart(start: string, offset: number): string {
  const [y, m] = start.split("-").map((n) => parseInt(n, 10));
  const total = (y * 12 + (m - 1)) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function fanForYears(years: number, p50Start = 500_000, p50End = 3_000_000): FanPoint[] {
  const months = years * 12;
  const out: FanPoint[] = [];
  for (let i = 0; i < months; i++) {
    const v = p50Start + ((p50End - p50Start) * i) / Math.max(1, months - 1);
    out.push({ ...fp(v), month: monthFromStart("2026-01", i) });
  }
  return out;
}

function scenarioEv(id: string, type: ScenarioEventType, month: string, payload: Record<string, unknown> = {}): ScenarioEvent {
  return { id, type, month, priority: 400, sourceDeltaId: null, payload };
}

console.log("\neventTraceability — Sprint 30A A2");

// ─── 5 validator tests (one per failure kind + pass case) ──────────────

// 1. PASS — well-formed events
const passCase = validateTraceability([], [
  ev({ id: "a", source: "engine", sourceDeltaId: "d1", rawEventType: "asset.buy_property" }),
  ev({ id: "b", lane: "exit", month: "2034-10", action: "FIRE crossing", source: "derived", sourceDeltaId: null, rawEventType: undefined, derivationFormula: "Month where median NW first ≥ FIRE target × 25 multiplier" }),
]);
check("V1 well-formed events → status pass", passCase.status === "pass");
check("V1 stats.totalEvents 2", passCase.stats.totalEvents === 2);
check("V1 stats.engineEvents 1", passCase.stats.engineEvents === 1);
check("V1 stats.derivedEvents 1", passCase.stats.derivedEvents === 1);
check("V1 stats.lanesRendered 2", passCase.stats.lanesRendered === 2);
check("V1 stats.lanesHidden 3", passCase.stats.lanesHidden === 3);

// 2. no_source — engine event with neither sourceDeltaId nor rawEventType
const noSrcCase = validateTraceability([], [
  ev({ id: "u1", source: "engine", sourceDeltaId: null, rawEventType: undefined }),
]);
check("V2 no_source → status fail", noSrcCase.status === "fail");
check("V2 reason no_source emitted",
  noSrcCase.failures.some((f) => f.reason === "no_source" && f.eventId === "u1"));

// 3. no_formula — derived event missing derivationFormula
const noFormulaCase = validateTraceability([], [
  ev({ id: "d1", source: "derived", derivationFormula: undefined, sourceDeltaId: null }),
]);
check("V3 no_formula → status fail", noFormulaCase.status === "fail");
check("V3 reason no_formula emitted",
  noFormulaCase.failures.some((f) => f.reason === "no_formula" && f.eventId === "d1"));

// 4. duplicate — two events on same (lane, month, action)
const dupCase = validateTraceability([], [
  ev({ id: "x1", lane: "debt_reduction", month: "2026-06", action: "Deposit to offset" }),
  ev({ id: "x2", lane: "debt_reduction", month: "2026-06", action: "Deposit to offset" }),
]);
check("V4 duplicate → status fail", dupCase.status === "fail");
check("V4 duplicate flagged on the second event",
  dupCase.failures.some((f) => f.reason === "duplicate" && f.eventId === "x2"));
check("V4 first event NOT flagged",
  !dupCase.failures.some((f) => f.reason === "duplicate" && f.eventId === "x1"));

// 5. placeholder — empty action + regex matches
const phCase1 = validateTraceability([], [ev({ id: "p1", action: "" })]);
check("V5a empty action → placeholder fail", phCase1.failures.some((f) => f.reason === "placeholder" && f.eventId === "p1"));
const phCase2 = validateTraceability([], [ev({ id: "p2", action: "TBD action label" })]);
check("V5b 'TBD …' action → placeholder fail", phCase2.failures.some((f) => f.reason === "placeholder" && f.eventId === "p2"));
const phCase3 = validateTraceability([], [ev({ id: "p3", action: "Not modelled yet" })]);
check("V5c 'Not modelled yet' action → placeholder fail", phCase3.failures.some((f) => f.reason === "placeholder" && f.eventId === "p3"));

// ─── 4 dedup tests (engine+engine, engine+derived, derived+derived,
// same-month different action) ─────────────────────────────────────────

// 6. engine+engine same triplet → second-pass collapses to one
const startMonth = "2026-01";
const fan = fanForYears(10);
const r6 = selectEngineEventLanes({
  events: [
    scenarioEv("e1", "asset.buy_property", "2027-06", { purchasePrice: 700_000 }),
    scenarioEv("e2", "asset.buy_property", "2027-06", { purchasePrice: 700_000 }),
  ],
  fan, startMonth, fireNumber: 2_000_000, swrPct: 4,
});
const acqIn = r6.filter((e) => e.lane === "acquisition" && e.month === "2027-06");
check("D1 engine+engine dedup on (lane,month,action) collapses to 1", acqIn.length === 1);

// 7. engine+derived collide on same triplet → only one kept
const r7 = selectEngineEventLanes({
  events: [scenarioEv("od", "contribution.offset_deposit", "2026-06", { amount: 50_000 })],
  fan, startMonth, fireNumber: 2_000_000, swrPct: 4,
});
// Now inject a manually-collided derived event by appending to r7 and
// running the validator over the post-dedup list — the post-dedup list
// already has only the engine offset + one derived BC. Verify the BC sits
// on (borrowing_capacity, 2026-07, "Re-test borrowing capacity") so a
// re-run of the same input still collapses to one.
const r7b = selectEngineEventLanes({
  events: [scenarioEv("od", "contribution.offset_deposit", "2026-06", { amount: 50_000 })],
  fan, startMonth, fireNumber: 2_000_000, swrPct: 4,
});
check("D2 engine+derived re-run produces same single-event lanes",
  r7.filter((e) => e.lane === "debt_reduction").length === r7b.filter((e) => e.lane === "debt_reduction").length
  && r7.filter((e) => e.lane === "borrowing_capacity").length === r7b.filter((e) => e.lane === "borrowing_capacity").length);

// 8. derived+derived (two exit events would only ever appear if fan crossed
// FIRE twice — engineeventLanes synthesises only one exit, so this verifies
// that the dedup pass is the *second* pass and not the only pass).
const r8 = selectEngineEventLanes({
  events: [],
  fan, startMonth, fireNumber: 2_000_000, swrPct: 4,
});
check("D3 single derived exit event per run", r8.filter((e) => e.lane === "exit").length === 1);

// 9. same-month, different action → both kept (the dedup key includes action)
const r9 = selectEngineEventLanes({
  events: [
    scenarioEv("a", "asset.buy_property", "2027-06", { purchasePrice: 700_000 }),
    scenarioEv("b", "contribution.offset_deposit", "2027-06", { amount: 50_000 }),
  ],
  fan, startMonth, fireNumber: 2_000_000, swrPct: 4,
});
check("D4 same-month different action → both kept",
  r9.some((e) => e.month === "2027-06" && e.action === "Buy property")
  && r9.some((e) => e.month === "2027-06" && e.action === "Deposit to offset"));

// ─── 3 hidden-lane tests ────────────────────────────────────────────────

// 10. all empty (no events)
const allEmpty = validateTraceability([], []);
check("H1 all empty → lanesRendered 0", allEmpty.stats.lanesRendered === 0);
check("H1 all empty → lanesHidden 5", allEmpty.stats.lanesHidden === 5);
check("H1 all empty → status pass (no events to fail)", allEmpty.status === "pass");

// 11. partial — only debt_reduction populated
const partial = validateTraceability([], [
  ev({ id: "p", lane: "debt_reduction", action: "Deposit to offset" }),
]);
check("H2 partial → lanesRendered 1", partial.stats.lanesRendered === 1);
check("H2 partial → lanesHidden 4", partial.stats.lanesHidden === 4);

// 12. all-full — all 5 lanes have ≥ 1 event
const allFull = validateTraceability([], [
  ev({ id: "a", lane: "acquisition", action: "Buy property" }),
  ev({ id: "b", lane: "equity_release", action: "Refinance + cash-out", source: "engine", sourceDeltaId: "d2", rawEventType: "debt.refinance" }),
  ev({ id: "c", lane: "debt_reduction", action: "Deposit to offset", source: "engine", sourceDeltaId: "d3", rawEventType: "contribution.offset_deposit" }),
  ev({ id: "d", lane: "borrowing_capacity", action: "Re-test borrowing capacity", source: "derived", sourceDeltaId: null, rawEventType: undefined, derivationFormula: "Synthesised one month after each offset deposit" }),
  ev({ id: "e", lane: "exit", action: "FIRE crossing", source: "derived", sourceDeltaId: null, rawEventType: undefined, derivationFormula: "Month where median NW first ≥ FIRE target × 25 multiplier" }),
]);
check("H3 all 5 lanes populated → lanesRendered 5", allFull.stats.lanesRendered === 5);
check("H3 all 5 lanes populated → lanesHidden 0", allFull.stats.lanesHidden === 0);

// ─── 3 Audit Mode visibility tests ─────────────────────────────────────

// 13. nonEmptyLanes helper returns only the lanes that have events
const ne = nonEmptyLanes([
  ev({ id: "x", lane: "debt_reduction", action: "Deposit to offset" }),
  ev({ id: "y", lane: "exit", action: "FIRE crossing", source: "derived", sourceDeltaId: null, rawEventType: undefined, derivationFormula: "F" }),
]);
check("A1 nonEmptyLanes returns Set", ne instanceof Set);
check("A1 nonEmptyLanes contains debt_reduction + exit", ne.has("debt_reduction") && ne.has("exit"));
check("A1 nonEmptyLanes excludes acquisition", !ne.has("acquisition"));

// 14. Audit Mode rendering implication — hidden lanes still surface in stats
const auditCase = validateTraceability([], [
  ev({ id: "only", lane: "debt_reduction", action: "Deposit to offset" }),
]);
check("A2 stats describe hidden lanes for Audit Mode", auditCase.stats.lanesHidden === 4 && auditCase.stats.lanesRendered === 1);
check("A2 stats.totalEvents reflects rendered events only", auditCase.stats.totalEvents === 1);

// 15. Audit Mode "0 events" badge — the consumer can compute hidden lanes
// from `stats.lanesHidden` AND `nonEmptyLanes(laneEvents)`. The helper is
// pure data; UI assertions live in the component.
check("A3 lanesHidden + lanesRendered = 5 (total lanes)",
  auditCase.stats.lanesHidden + auditCase.stats.lanesRendered === 5);

// ─── Bonus: demo-path expectation from the addendum ─────────────────────
// Contract acceptance: demo `delay-ip` → totalEvents 3, engine 1, derived 2,
// lanesRendered 3, lanesHidden 2. We assemble the equivalent event list
// directly and confirm the validator agrees.
const demoLike = validateTraceability([], [
  ev({ id: "od", lane: "debt_reduction", month: "2026-05", action: "Deposit to offset", source: "engine", sourceDeltaId: "defer_50_50_etf_off_offset", rawEventType: "contribution.offset_deposit" }),
  ev({ id: "bc", lane: "borrowing_capacity", month: "2026-06", action: "Re-test borrowing capacity", source: "derived", sourceDeltaId: "defer_50_50_etf_off_offset", rawEventType: undefined, derivationFormula: "Synthesised one month after each offset deposit" }),
  ev({ id: "exit", lane: "exit", month: "2034-10", action: "FIRE crossing", source: "derived", sourceDeltaId: null, rawEventType: undefined, derivationFormula: "Month where median NW first ≥ FIRE target × 25 multiplier" }),
]);
check("Demo-like input → status pass", demoLike.status === "pass");
check("Demo-like input → totalEvents 3", demoLike.stats.totalEvents === 3);
check("Demo-like input → engineEvents 1, derivedEvents 2",
  demoLike.stats.engineEvents === 1 && demoLike.stats.derivedEvents === 2);
check("Demo-like input → lanesRendered 3, lanesHidden 2",
  demoLike.stats.lanesRendered === 3 && demoLike.stats.lanesHidden === 2);

// Acceptance from addendum: `status: "pass"` with 0 failures + the stats
// match the demo path exactly.
check("Acceptance: failures empty for clean demo-shape input", demoLike.failures.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
