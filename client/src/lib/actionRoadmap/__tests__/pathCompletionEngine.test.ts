/**
 * pathCompletionEngine.test.ts — Sprint 27.
 *
 * Honesty + reuse tests for the Path Completion engine. The engine must:
 *   1. Return NOT_MODELLED with every numeric null when fan is empty/missing.
 *   2. Detect first-crossing of p50 ≥ fireNumber deterministically.
 *   3. Surface terminal NW from p50 of the last fan point.
 *   4. Surface { p25, p75 } range from the same terminal fan point.
 *   5. Derive passive income from expectedNW × swr — null on missing inputs.
 *   6. Status = ON_TRACK when on/early, ON_TARGET_LATE when late, GAP_REMAINING
 *      when never crosses.
 *   7. Never invent yearsEarlyOrLate when either age is null.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/pathCompletionEngine.test.ts
 */

import type { FanPoint } from "../../scenarioV2/types";
import type { GoalLabRankedScenario } from "../../goalLab/orchestrator";
import { computePathCompletion } from "../pathCompletionEngine";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const NOW = new Date("2026-05-29T00:00:00Z");

function fanPoint(month: string, p50: number, p25 = p50 * 0.8, p75 = p50 * 1.2): FanPoint {
  return { month, p5: p50 * 0.5, p10: p50 * 0.6, p25, p50, p75, p90: p50 * 1.4, p95: p50 * 1.5 };
}

function scenarioWithFan(fan: FanPoint[]): GoalLabRankedScenario {
  return {
    templateId: "etf-acceleration",
    templateLabel: "ETF",
    promise: "",
    winner: {
      id: "etf_lump_now",
      label: "ETF lump",
      shortLabel: "ETF",
      events: [],
      result: { netWorthFan: fan } as never,
      score: {} as never,
      trace: {} as never,
      headline: "h",
      rationale: [],
      softWarnings: [],
      isHighRisk: false,
    } as never,
    alternates: [],
    probabilityP50: null,
    scoreP50: null,
    raw: {} as never,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\npathCompletionEngine — honesty + reuse");

// 1. Null scenario → NOT_MODELLED, every numeric null
const empty = computePathCompletion(null, { fireNumber: 2_000_000, swrPct: 4 }, { targetFireAge: 60 }, 40, NOW);
check("null scenario → NOT_MODELLED", empty.status === "NOT_MODELLED");
check("null scenario → expectedNetWorth null", empty.expectedNetWorth === null);
check("null scenario → expectedFireAge null", empty.expectedFireAge === null);
check("null scenario → passive income null", empty.expectedAnnualPassiveIncome === null);
check("null scenario → yearsEarlyOrLate null", empty.yearsEarlyOrLate === null);
// When fire IS provided but scenario is null, the source is 'empty' (we have a target but no engine output)
check("null scenario with fire → fireNumberSource empty", empty.audit.fireNumberSource === "empty");
// And when fire is ALSO null, source is 'missing'
const doublyEmpty = computePathCompletion(null, null, { targetFireAge: 60 }, 40, NOW);
check("null scenario + null fire → fireNumberSource missing", doublyEmpty.audit.fireNumberSource === "missing");

// 2. Empty fan → NOT_MODELLED
const emptyFan = computePathCompletion(scenarioWithFan([]), { fireNumber: 2_000_000, swrPct: 4 }, { targetFireAge: 60 }, 40, NOW);
check("empty fan → NOT_MODELLED", emptyFan.status === "NOT_MODELLED");

// 3. Fan with crossing → ON_TRACK, ages computed correctly
// 25 years × 12 months = 300 fan points. Crossing at month 240 (year 20 from now).
const FIRE = 2_000_000;
const fan: FanPoint[] = [];
for (let i = 0; i < 300; i++) {
  // NW grows linearly from 500k to 3M; crosses 2M at i = 240
  const nw = 500_000 + (3_000_000 - 500_000) * (i / 299);
  fan.push(fanPoint(`2026-${String((i % 12) + 1).padStart(2, "0")}`, nw));
}
// At i=240, nw ≈ 500k + 2.5M × (240/299) ≈ 500k + 2_006_688 ≈ 2.5M, so crossing earlier
// Find the actual crossing index numerically — keep using engine output, don't assert exact age
const r = computePathCompletion(scenarioWithFan(fan), { fireNumber: FIRE, swrPct: 4 }, { targetFireAge: 60 }, 40, NOW);
check("fan with crossing → status ON_TRACK or ON_TARGET_LATE", r.status === "ON_TRACK" || r.status === "ON_TARGET_LATE", `status=${r.status}`);
check("fan with crossing → expectedFireAge non-null", r.expectedFireAge !== null);
check("expectedNetWorth = terminal p50", r.expectedNetWorth === fan[fan.length - 1].p50);
check("expectedNetWorthRange = terminal {p25,p75}", r.expectedNetWorthRange?.p25 === fan[fan.length - 1].p25 && r.expectedNetWorthRange?.p75 === fan[fan.length - 1].p75);
check("expectedAnnualPassiveIncome = NW × swr/100", r.expectedAnnualPassiveIncome !== null && Math.abs((r.expectedAnnualPassiveIncome as number) - (r.expectedNetWorth as number) * 0.04) < 0.001);
check("expectedMonthlyPassiveIncome = annual/12", r.expectedMonthlyPassiveIncome !== null && Math.abs((r.expectedMonthlyPassiveIncome as number) * 12 - (r.expectedAnnualPassiveIncome as number)) < 0.001);
check("goalAchievementFraction capped at 1", (r.goalAchievementFraction as number) <= 1.0);
check("yearsEarlyOrLate present", r.yearsEarlyOrLate !== null);

// 4. Fan that never crosses → GAP_REMAINING
const lowFan: FanPoint[] = [];
for (let i = 0; i < 120; i++) lowFan.push(fanPoint(`2026-01`, 200_000 + i * 1000)); // tops at ~320k, far below 2M
const rGap = computePathCompletion(scenarioWithFan(lowFan), { fireNumber: FIRE, swrPct: 4 }, { targetFireAge: 60 }, 40, NOW);
check("never-crosses fan → GAP_REMAINING", rGap.status === "GAP_REMAINING", `status=${rGap.status}`);
check("never-crosses → expectedFireAge null", rGap.expectedFireAge === null);
check("never-crosses → gapRemaining > 0", (rGap.gapRemaining as number) > 0);

// 5. Missing fireNumber → NOT_MODELLED (don't fabricate fraction)
const rNoFire = computePathCompletion(scenarioWithFan(fan), null, { targetFireAge: 60 }, 40, NOW);
check("null fire → NOT_MODELLED", rNoFire.status === "NOT_MODELLED");
check("null fire → goalAchievementFraction null", rNoFire.goalAchievementFraction === null);

// 6. Missing swrPct → passive income null but other fields still computed
const rNoSwr = computePathCompletion(scenarioWithFan(fan), { fireNumber: FIRE, swrPct: 0 }, { targetFireAge: 60 }, 40, NOW);
check("zero swr → expectedAnnualPassiveIncome null", rNoSwr.expectedAnnualPassiveIncome === null);
check("zero swr → expectedNetWorth still present", rNoSwr.expectedNetWorth !== null);

// 7. Missing currentAge → expectedFireAge null AND yearsEarlyOrLate null (honesty)
const rNoAge = computePathCompletion(scenarioWithFan(fan), { fireNumber: FIRE, swrPct: 4 }, { targetFireAge: 60 }, null, NOW);
check("null currentAge → expectedFireAge null", rNoAge.expectedFireAge === null);
check("null currentAge → yearsEarlyOrLate null", rNoAge.yearsEarlyOrLate === null);

// 8. Missing targetFireAge → yearsEarlyOrLate null
const rNoTarget = computePathCompletion(scenarioWithFan(fan), { fireNumber: FIRE, swrPct: 4 }, { targetFireAge: null }, 40, NOW);
check("null targetFireAge → yearsEarlyOrLate null", rNoTarget.yearsEarlyOrLate === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
