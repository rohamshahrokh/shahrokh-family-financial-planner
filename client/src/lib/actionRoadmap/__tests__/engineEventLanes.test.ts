/**
 * engineEventLanes.test.ts — Sprint 30A.
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/engineEventLanes.test.ts
 */
import type { FanPoint, ScenarioEvent, ScenarioEventType } from "../../scenarioV2/types";
import { selectEngineEventLanes } from "../engineEventLanes";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function fp(p50: number): FanPoint {
  return { month: "ignored", p5: p50 * 0.5, p10: p50 * 0.6, p25: p50 * 0.8, p50, p75: p50 * 1.2, p90: p50 * 1.4, p95: p50 * 1.5 };
}

function fanForYears(years: number, p50Start = 500_000, p50End = 3_000_000): FanPoint[] {
  const months = years * 12;
  const arr: FanPoint[] = [];
  for (let i = 0; i < months; i++) {
    const v = p50Start + ((p50End - p50Start) * i) / Math.max(1, months - 1);
    arr.push({ ...fp(v), month: monthFromStart("2026-01", i) });
  }
  return arr;
}

function monthFromStart(start: string, offset: number): string {
  const [y, m] = start.split("-").map((n) => parseInt(n, 10));
  const total = (y * 12 + (m - 1)) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function evt(id: string, type: ScenarioEventType, month: string, payload: Record<string, unknown> = {}, sourceDeltaId: string | null = null): ScenarioEvent {
  return { id, type, month, priority: 400, sourceDeltaId, payload };
}

console.log("\nengineEventLanes — Sprint 30A (5 lanes + derived)");

const startMonth = "2026-01";
const fan = fanForYears(10);
const fireNumber = 2_000_000;
const swrPct = 4;

// 1. Empty input → only the derived exit event (since fan crosses FIRE)
const r1 = selectEngineEventLanes({ events: [], fan, startMonth, fireNumber, swrPct });
check("empty events → only derived exit", r1.length === 1 && r1[0].lane === "exit");
check("derived exit source = derived", r1[0].source === "derived");
check("derived exit carries derivationFormula",
  typeof r1[0].derivationFormula === "string" && r1[0].derivationFormula!.includes("FIRE target × 25"));

// 2. Buy property → acquisition lane, engine source
const r2 = selectEngineEventLanes({
  events: [evt("buy-1", "asset.buy_property", "2027-06", { purchasePrice: 700_000 }, "delta-buy-1")],
  fan, startMonth, fireNumber, swrPct,
});
const acq = r2.find((e) => e.id === "buy-1")!;
check("buy_property → acquisition lane", acq.lane === "acquisition");
check("buy_property source = engine", acq.source === "engine");
check("buy_property action label", acq.action === "Buy property");
check("buy_property risk = higher", acq.impact.riskDirection === "higher");
check("buy_property sourceDeltaId preserved", acq.sourceDeltaId === "delta-buy-1");
check("buy_property raw event type echoed", acq.rawEventType === "asset.buy_property");

// 3. Sell property → acquisition lane (engine surface)
const r3 = selectEngineEventLanes({
  events: [evt("sell-1", "asset.sell_property", "2028-02", { salePrice: 950_000 })],
  fan, startMonth, fireNumber, swrPct,
});
check("sell_property → acquisition lane", r3.find((e) => e.id === "sell-1")?.lane === "acquisition");
check("sell_property risk = lower", r3.find((e) => e.id === "sell-1")?.impact.riskDirection === "lower");

// 4. Refinance → equity_release lane; with cashOut payload action label changes
const r4 = selectEngineEventLanes({
  events: [evt("refi-1", "debt.refinance", "2028-09", { cashOut: 100_000 })],
  fan, startMonth, fireNumber, swrPct,
});
const refi = r4.find((e) => e.id === "refi-1")!;
check("refinance → equity_release lane", refi.lane === "equity_release");
check("refinance cashOut label", refi.action === "Refinance + cash-out");
check("refinance cashOut → risk neutral", refi.impact.riskDirection === "neutral");

const r4b = selectEngineEventLanes({
  events: [evt("refi-2", "debt.refinance", "2028-09", {})],
  fan, startMonth, fireNumber, swrPct,
});
check("refinance no cashOut → action 'Refinance mortgage'", r4b.find((e) => e.id === "refi-2")?.action === "Refinance mortgage");
check("refinance no cashOut → risk lower", r4b.find((e) => e.id === "refi-2")?.impact.riskDirection === "lower");

// 5. Offset deposit → debt_reduction lane + derived borrowing_capacity follow-up
const r5 = selectEngineEventLanes({
  events: [evt("od-1", "contribution.offset_deposit", "2026-06", { amount: 50_000 })],
  fan, startMonth, fireNumber, swrPct,
  medianFinalState: { cash: 60_000 },
});
const od = r5.find((e) => e.id === "od-1")!;
check("offset_deposit → debt_reduction lane", od.lane === "debt_reduction");
check("offset_deposit → risk lower", od.impact.riskDirection === "lower");
const derivedBC = r5.find((e) => e.lane === "borrowing_capacity");
check("borrowing_capacity derived event present", derivedBC != null);
check("borrowing_capacity → source = derived", derivedBC?.source === "derived");
check("borrowing_capacity carries derivationFormula",
  typeof derivedBC?.derivationFormula === "string"
  && derivedBC!.derivationFormula!.toLowerCase().includes("offset"));
check("borrowing_capacity month follows offset deposit by 1 month", derivedBC?.month === "2026-07");

// 6. Borrowing-capacity heuristic: offset > 80% of purchase target → riskDirection lower
const r6 = selectEngineEventLanes({
  events: [evt("od-2", "contribution.offset_deposit", "2026-06", { amount: 50_000 })],
  fan, startMonth, fireNumber, swrPct,
  medianFinalState: { cash: 60_000 },  // 60k / 50k > 0.8 → lower
});
check("borrowing_capacity ratio > 0.8 → risk lower", r6.find((e) => e.lane === "borrowing_capacity")?.impact.riskDirection === "lower");

// 7. Borrowing-capacity heuristic: insufficient cash → neutral
const r7 = selectEngineEventLanes({
  events: [evt("od-3", "contribution.offset_deposit", "2026-06", { amount: 100_000 })],
  fan, startMonth, fireNumber, swrPct,
  medianFinalState: { cash: 10_000 },
});
check("borrowing_capacity ratio < 0.8 → risk neutral", r7.find((e) => e.lane === "borrowing_capacity")?.impact.riskDirection === "neutral");

// 8. Extra repayment → debt_reduction lane (no derived BC for that type)
const r8 = selectEngineEventLanes({
  events: [evt("dr-1", "debt.extra_repayment", "2027-01", { amount: 5_000 })],
  fan, startMonth, fireNumber, swrPct,
});
const dr = r8.find((e) => e.id === "dr-1")!;
check("extra_repayment → debt_reduction lane", dr.lane === "debt_reduction");
check("extra_repayment → risk lower", dr.impact.riskDirection === "lower");
check("extra_repayment does NOT trigger derived BC", !r8.some((e) => e.lane === "borrowing_capacity"));

// 9. Rentvest → acquisition lane
const r9 = selectEngineEventLanes({
  events: [evt("rv-1", "asset.rentvest", "2027-04", {})],
  fan, startMonth, fireNumber, swrPct,
});
check("rentvest → acquisition lane", r9.find((e) => e.id === "rv-1")?.lane === "acquisition");

// 10. Exit derived event present when fan crosses FIRE
const rExit = r1.find((e) => e.lane === "exit");
check("exit lane present when fan crosses FIRE", rExit != null);
check("exit lane action 'FIRE crossing'", rExit?.action === "FIRE crossing");

// 11. Exit derived event absent when fan never crosses
const flatFan: FanPoint[] = [];
for (let i = 0; i < 60; i++) flatFan.push({ ...fp(500_000), month: monthFromStart("2026-01", i) });
const r11 = selectEngineEventLanes({ events: [], fan: flatFan, startMonth, fireNumber: 5_000_000, swrPct });
check("fan never crosses → no exit lane event", !r11.some((e) => e.lane === "exit"));

// 12. Null fireNumber → no exit event
const r12 = selectEngineEventLanes({ events: [], fan, startMonth, fireNumber: null, swrPct });
check("null fireNumber → no exit lane event", !r12.some((e) => e.lane === "exit"));

// 13. Drop events not mapped to a lane (income.payg etc.)
const r13 = selectEngineEventLanes({
  events: [evt("noise-1", "income.payg", "2027-01"), evt("noise-2", "debt.mortgage_payment", "2027-02")],
  fan, startMonth, fireNumber, swrPct,
});
check("income.payg dropped", !r13.some((e) => e.id === "noise-1"));
check("debt.mortgage_payment dropped", !r13.some((e) => e.id === "noise-2"));

// 14. fireImpactMonths is always null (engine emits no counterfactual)
const r14 = selectEngineEventLanes({
  events: [evt("any-1", "asset.buy_property", "2027-06", { purchasePrice: 700_000 })],
  fan, startMonth, fireNumber, swrPct,
});
check("fireImpactMonths null per contract", r14.find((e) => e.id === "any-1")?.impact.fireImpactMonths === null);

// 15. netWorthDelta is non-null when fan has data around the month
check("netWorthDelta computed from fan",
  Number.isFinite(r14.find((e) => e.id === "any-1")?.impact.netWorthDelta ?? Number.NaN));

// 16. passiveIncomeDelta computed when swrPct given AND fan has +12 month room
check("passiveIncomeDelta computed when room",
  Number.isFinite(r14.find((e) => e.id === "any-1")?.impact.passiveIncomeDelta ?? Number.NaN));

// 17. passiveIncomeDelta null when swrPct null
const r17 = selectEngineEventLanes({
  events: [evt("any-2", "asset.buy_property", "2027-06", { purchasePrice: 700_000 })],
  fan, startMonth, fireNumber, swrPct: null,
});
check("passiveIncomeDelta null when swrPct null", r17.find((e) => e.id === "any-2")?.impact.passiveIncomeDelta === null);

// 18. whyItExists populated for engine events
check("whyItExists populated on engine events",
  typeof r2.find((e) => e.id === "buy-1")?.whyItExists === "string"
  && r2.find((e) => e.id === "buy-1")!.whyItExists.length > 0);

// 19. whyItExists populated on derived events
check("whyItExists populated on derived borrowing_capacity",
  typeof derivedBC?.whyItExists === "string" && derivedBC!.whyItExists.length > 0);

// 20. Stable order: ascending by month
const r20 = selectEngineEventLanes({
  events: [
    evt("a", "asset.buy_property", "2029-01", { purchasePrice: 700_000 }),
    evt("b", "contribution.offset_deposit", "2026-06", { amount: 25_000 }),
    evt("c", "debt.extra_repayment", "2027-09", { amount: 5_000 }),
  ],
  fan, startMonth, fireNumber, swrPct,
});
const months = r20.map((e) => e.month);
const sorted = [...months].sort();
check("output sorted by month ascending", months.every((m, i) => m === sorted[i]),
  `got=${months.join(",")}`);

// 21. Source labels stable: every engine event has source=engine, every derived has source=derived
check("every event has source label",
  r20.every((e) => e.source === "engine" || e.source === "derived"));

// 22. sourceDeltaId null for fully-synthetic events (exit, BC)
check("derived exit has sourceDeltaId null", rExit?.sourceDeltaId === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
