/**
 * montecarloProjection.test.ts — Sprint 28.
 *
 * Honesty + percentile-scan tests for `selectMonteCarloProjection`. The
 * selector must:
 *   1. Return all-null fields when the fan never crosses.
 *   2. Return all-null fields when the fan is empty.
 *   3. Compute a separate crossing index per percentile (p25/p50/p75).
 *   4. Sample netWorth and passiveIncome at each crossing.
 *   5. Leave passiveIncome null when swrPct is missing or zero.
 *   6. Leave ages null when startAge is missing.
 *   7. Always report `source: "scenarioV2.monteCarlo"` for audit.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/montecarloProjection.test.ts
 */
import type { FanPoint } from "../../scenarioV2/types";
import { selectMonteCarloProjection } from "../montecarloProjection";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function fp(p50: number, p25 = p50 * 0.8, p75 = p50 * 1.2): FanPoint {
  return { month: "2026-01", p5: p50 * 0.5, p10: p50 * 0.6, p25, p50, p75, p90: p50 * 1.4, p95: p50 * 1.5 };
}

console.log("\nmontecarloProjection — multi-percentile honesty");

// 1. Empty fan → all nulls, simulationCount echoed
const empty = selectMonteCarloProjection({ fan: [], startAge: 40, fireTarget: 2_000_000, swrPct: 4, simulationCount: 300 });
check("empty fan → fireAge.p50 null", empty.fireAge.p50 === null);
check("empty fan → fireAge.p25 null", empty.fireAge.p25 === null);
check("empty fan → fireAge.p75 null", empty.fireAge.p75 === null);
check("empty fan → netWorthAtFire all null", empty.netWorthAtFire.p25 === null && empty.netWorthAtFire.p50 === null && empty.netWorthAtFire.p75 === null);
check("empty fan → passiveIncomeAtFire all null", empty.passiveIncomeAtFire.p50 === null);
check("empty fan → source still set", empty.source === "scenarioV2.monteCarlo");
check("empty fan → simulationCount echoed", empty.simulationCount === 300);

// 2. Never-crosses fan → all ages null + nw null
const lowFan: FanPoint[] = [];
for (let i = 0; i < 120; i++) lowFan.push(fp(200_000 + i * 1000));
const never = selectMonteCarloProjection({ fan: lowFan, startAge: 40, fireTarget: 2_000_000, swrPct: 4, simulationCount: 300 });
check("never-crosses → fireAge.p50 null", never.fireAge.p50 === null);
check("never-crosses → netWorthAtFire.p50 null", never.netWorthAtFire.p50 === null);

// 3. Fan crosses each percentile at a different index — p75 first (highest band), then p50, then p25
// Build a fan where p25/p50/p75 all rise linearly with separate offsets.
// p75 crosses early, p50 crosses middle, p25 crosses late.
const fan: FanPoint[] = [];
for (let i = 0; i < 300; i++) {
  const p50 = 1_000_000 + (i / 299) * 2_500_000; // crosses 2M somewhere mid
  fan.push(fp(p50, p50 * 0.7, p50 * 1.3));
}
const r = selectMonteCarloProjection({ fan, startAge: 40, fireTarget: 2_000_000, swrPct: 4, simulationCount: 300 });
check("crosses → fireAge.p75 set", r.fireAge.p75 !== null);
check("crosses → fireAge.p50 set", r.fireAge.p50 !== null);
check("crosses → p75 reaches FIRE before p50 (smaller or equal age)", (r.fireAge.p75 as number) <= (r.fireAge.p50 as number));
check("crosses → p25 reaches FIRE no earlier than p50", r.fireAge.p25 == null || (r.fireAge.p25 as number) >= (r.fireAge.p50 as number));
check("crosses → netWorthAtFire.p50 >= FIRE target", (r.netWorthAtFire.p50 as number) >= 2_000_000);
check("crosses → passiveIncomeAtFire.p50 = p50 NW × 4%", Math.abs((r.passiveIncomeAtFire.p50 as number) - (r.netWorthAtFire.p50 as number) * 0.04) < 0.0001);

// 4. Edge crossing exactly at the last fan point → still returns non-null
const edgeFan: FanPoint[] = [];
for (let i = 0; i < 60; i++) edgeFan.push(fp(1_000_000 + i * 10_000));
edgeFan.push(fp(2_000_000));
const edge = selectMonteCarloProjection({ fan: edgeFan, startAge: 30, fireTarget: 2_000_000, swrPct: 4, simulationCount: 100 });
check("edge-crossing → fireAge.p50 not null", edge.fireAge.p50 !== null);
check("edge-crossing → netWorthAtFire.p50 = 2_000_000", edge.netWorthAtFire.p50 === 2_000_000);

// 5. Zero / missing swr → passive income null but ages still computed
const noSwr = selectMonteCarloProjection({ fan, startAge: 40, fireTarget: 2_000_000, swrPct: 0, simulationCount: 300 });
check("zero swr → passiveIncome.p50 null", noSwr.passiveIncomeAtFire.p50 === null);
check("zero swr → fireAge.p50 still set", noSwr.fireAge.p50 !== null);
const nullSwr = selectMonteCarloProjection({ fan, startAge: 40, fireTarget: 2_000_000, swrPct: null, simulationCount: 300 });
check("null swr → passiveIncome.p50 null", nullSwr.passiveIncomeAtFire.p50 === null);

// 6. Missing startAge → ages null, but NW + passive income still computed at the crossing
const noAge = selectMonteCarloProjection({ fan, startAge: null, fireTarget: 2_000_000, swrPct: 4, simulationCount: 300 });
check("null startAge → fireAge.p50 null", noAge.fireAge.p50 === null);
check("null startAge → netWorthAtFire.p50 still set", noAge.netWorthAtFire.p50 !== null);

// 7. Missing fireTarget → all-null projection
const noFire = selectMonteCarloProjection({ fan, startAge: 40, fireTarget: null, swrPct: 4, simulationCount: 300 });
check("null fireTarget → all-null projection", noFire.fireAge.p50 === null && noFire.netWorthAtFire.p50 === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
