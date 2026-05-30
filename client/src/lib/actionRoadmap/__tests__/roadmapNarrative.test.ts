/**
 * roadmapNarrative.test.ts — Sprint 27.
 *
 * Honesty checks for the narrative composer.
 *   1. NOT_MODELLED completion → headline "Not modelled yet."
 *   2. Probabilities NEVER inserted unless `scenario.probabilityP50` is real.
 *   3. Engine rationale + invalidation passed through untouched.
 *   4. No dollar amount cited when expectedNetWorth is null.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/roadmapNarrative.test.ts
 */

import type { GoalLabRankedScenario } from "../../goalLab/orchestrator";
import { buildRoadmapNarrative } from "../roadmapNarrative";
import type { ActionRoadmap, PathCompletion, RoadmapRiskSummary } from "../types";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function notModelled(): PathCompletion {
  return {
    status: "NOT_MODELLED",
    expectedFireAge: null, targetFireAge: null,
    expectedNetWorth: null, expectedNetWorthRange: null,
    expectedAnnualPassiveIncome: null, expectedMonthlyPassiveIncome: null,
    goalAchievementFraction: null, yearsEarlyOrLate: null, gapRemaining: null,
    why: ["The engine has not produced a forecast for this path yet."],
    audit: { fanPointsConsidered: 0, fireNumberSource: "missing", swrPctUsed: null },
  };
}

function onTrack(): PathCompletion {
  return {
    status: "ON_TRACK",
    expectedFireAge: 58, targetFireAge: 60,
    expectedNetWorth: 2_500_000, expectedNetWorthRange: { p25: 2_000_000, p75: 3_000_000 },
    expectedAnnualPassiveIncome: 100_000, expectedMonthlyPassiveIncome: 8333.33,
    goalAchievementFraction: 1, yearsEarlyOrLate: 2, gapRemaining: 0,
    why: ["Projected median ahead of target."],
    audit: { fanPointsConsidered: 300, fireNumberSource: "user_target", swrPctUsed: 4 },
  };
}

function unknownRisk(): RoadmapRiskSummary {
  return { axes: [], overall: "unknown", warnings: [] };
}

function lowRisk(): RoadmapRiskSummary {
  return { axes: [], overall: "low", warnings: [] };
}

function sc(probability: number | null, rationale: string[] = [], whyWon: string[] = [], whatCouldInvalidate: string[] = []): GoalLabRankedScenario {
  return {
    templateId: "etf-acceleration",
    templateLabel: "",
    promise: "",
    winner: {
      id: "etf", label: "ETF", shortLabel: "ETF",
      events: [], result: {} as never, score: {} as never, trace: {} as never,
      headline: "", rationale, softWarnings: [], isHighRisk: false,
    } as never,
    alternates: [],
    probabilityP50: probability,
    scoreP50: null,
    raw: { comparativeNarrative: { winnerId: "etf", runnerUpId: null, whyWon, whatCouldInvalidate, secondPlaceAndWhy: "" } } as never,
  };
}

console.log("\nroadmapNarrative — honesty rules");

// 1. NOT_MODELLED → headline "Not modelled yet."
const r1 = buildRoadmapNarrative(null, null, notModelled(), unknownRisk());
check("NOT_MODELLED → headline 'Not modelled yet.'", r1.headline === "Not modelled yet.");
check("NOT_MODELLED → bullets empty", r1.bullets.length === 0);
check("NOT_MODELLED → audit headlineSource fallback", r1.audit.headlineSource === "fallback_not_modelled");

// 2. ON_TRACK headline mentions age when present
const r2 = buildRoadmapNarrative(sc(null), null, onTrack(), lowRisk());
check("ON_TRACK headline mentions age 58", r2.headline.includes("58"));
check("ON_TRACK headline mentions 'On track'", r2.headline.toLowerCase().includes("on track"));

// 3. Probability NEVER fabricated
const r3 = buildRoadmapNarrative(sc(null), null, onTrack(), lowRisk());
check("no probability bullet when probability null", !r3.bullets.some((b) => /probability|P50/i.test(b)));

// 4. Probability INCLUDED when real
const r4 = buildRoadmapNarrative(sc(0.72), null, onTrack(), lowRisk());
check("probability bullet present when real (0.72)", r4.bullets.some((b) => b.includes("72%")));

// 5. NW dollar amount present when expectedNetWorth real
check("NW bullet contains a dollar amount", r3.bullets.some((b) => /\$\d/.test(b)));

// 6. P25-P75 range surfaced
check("range bullet includes P25 and P75 numbers", r3.bullets.some((b) => b.includes("P25") && b.includes("P75")));

// 7. Engine rationale passed through untouched
const r7 = buildRoadmapNarrative(sc(null, ["Best risk-adjusted return"]), null, onTrack(), lowRisk());
check("rationale passed through verbatim", r7.whyThisPath.includes("Best risk-adjusted return"));

// 8. Falls back to comparativeNarrative.whyWon when candidate rationale empty
const r8 = buildRoadmapNarrative(sc(null, [], ["Highest engine score"]), null, onTrack(), lowRisk());
check("falls back to comparativeNarrative.whyWon", r8.whyThisPath.includes("Highest engine score"));

// 9. whatCouldInvalidate passes through
const r9 = buildRoadmapNarrative(sc(null, [], [], ["Rate rises >2%"]), null, onTrack(), lowRisk());
check("whatCouldInvalidate passed through", r9.whatCouldInvalidate.includes("Rate rises >2%"));

// 10. No NW bullet when expectedNetWorth null
const partial: PathCompletion = { ...notModelled(), status: "ON_TRACK", expectedFireAge: 60 };
const r10 = buildRoadmapNarrative(sc(null), null, partial, unknownRisk());
check("no NW bullet when expectedNetWorth null", !r10.bullets.some((b) => /net worth/i.test(b)));

// 11. Roadmap milestone count bullet when roadmap has milestones
const roadmap: ActionRoadmap = {
  template: { id: "ETF_PATH", label: "ETF", promise: "", milestoneShape: "" },
  milestones: [], hasEngineMilestones: true,
  audit: { engineTemplateId: "etf-acceleration", candidateId: "etf", eventsConsidered: 5 },
};
const r11 = buildRoadmapNarrative(sc(null), roadmap, onTrack(), lowRisk());
check("milestone-count bullet present", r11.bullets.some((b) => b.includes("5 engine-modelled milestone")));

// 12. Partial-engine case: status NOT_MODELLED but expectedNetWorth IS real
//     (engine produced a fan terminal but FIRE number missing from goal).
//     Headline must NOT be the generic "Not modelled yet." — it must surface
//     the real engine value while clearly stating FIRE comparison is missing.
const partialEngineNotModelled: PathCompletion = {
  ...notModelled(),
  expectedNetWorth: 11_530_286,
  expectedNetWorthRange: { p25: 10_576_051, p75: 13_025_493 },
};
const r12 = buildRoadmapNarrative(sc(null), null, partialEngineNotModelled, lowRisk());
check("partial-engine NOT_MODELLED w/ real NW: headline shows the real $ amount", r12.headline.includes("11,530,286"));
check("partial-engine: headline clarifies FIRE comparison missing", /FIRE comparison not modelled/i.test(r12.headline));
check("partial-engine: audit headlineSource is path_completion (not fallback)", r12.audit.headlineSource === "path_completion");
check("partial-engine: NW bullet still emitted", r12.bullets.some((b) => b.includes("11,530,286")));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
