/**
 * alternativeRationale.test.ts — Sprint 29 §10.4.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/alternativeRationale.test.ts
 */
import type { GoalLabRankedScenario } from "../../goalLab/orchestrator";
import type { MonteCarloProjection } from "../montecarloProjection";
import { buildAlternativeRationale } from "../alternativeRationale";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function mc(over: Partial<MonteCarloProjection>): MonteCarloProjection {
  return {
    fireAge: { p25: null, p50: null, p75: null },
    netWorthAtFire: { p25: null, p50: null, p75: null },
    passiveIncomeAtFire: { p25: null, p50: null, p75: null },
    simulationCount: 300,
    source: "scenarioV2.monteCarlo",
    ...over,
  };
}

function scenario(over: Partial<GoalLabRankedScenario> = {}): GoalLabRankedScenario {
  return {
    templateId: "t",
    templateLabel: "T",
    promise: "p",
    winner: { id: "w", label: "w", shortLabel: "w", events: [], result: {} as never, score: {} as never, trace: {} as never, headline: "h", rationale: [], softWarnings: [], isHighRisk: false } as never,
    alternates: [],
    probabilityP50: null,
    scoreP50: null,
    raw: {} as never,
    ...over,
  };
}

console.log("\nalternativeRationale — comparison reason builder");

// 1. Null inputs → empty reasons
const r1 = buildAlternativeRationale({
  recommended: null, alternative: null,
  recommendedMC: mc({}), alternativeMC: mc({}),
});
check("null recommended → empty reasons", r1.reasons.length === 0);

// 2. Recommended dominates on NW, FIRE age, survivability, risk → all 4 + reasons
const rec = scenario({ templateId: "rec", probabilityP50: 0.85 });
const altA = scenario({ templateId: "alt-a", probabilityP50: 0.60 });
const r2 = buildAlternativeRationale({
  recommended: rec,
  alternative: altA,
  recommendedMC: mc({ fireAge: { p25: null, p50: 55, p75: null }, netWorthAtFire: { p25: null, p50: 2_500_000, p75: null }, passiveIncomeAtFire: { p25: null, p50: 100_000, p75: null } }),
  alternativeMC: mc({ fireAge: { p25: null, p50: 60, p75: null }, netWorthAtFire: { p25: null, p50: 2_000_000, p75: null }, passiveIncomeAtFire: { p25: null, p50: 80_000, p75: null } }),
});
check("recommended-dominates → reasons present", r2.reasons.length >= 3);
check("nw + axis present", r2.reasons.some(r => r.axis === "nw" && r.sign === "+"));
check("fireAge + axis present", r2.reasons.some(r => r.axis === "fireAge" && r.sign === "+"));
check("survivability + axis present", r2.reasons.some(r => r.axis === "survivability" && r.sign === "+"));
check("passive income + axis present", r2.reasons.some(r => r.axis === "passive" && r.sign === "+"));

// 3. Alternative wins on FIRE age only → 1 "-" reason for fireAge
const r3 = buildAlternativeRationale({
  recommended: rec,
  alternative: altA,
  recommendedMC: mc({ fireAge: { p25: null, p50: 60, p75: null }, netWorthAtFire: { p25: null, p50: 2_500_000, p75: null }, passiveIncomeAtFire: { p25: null, p50: 100_000, p75: null } }),
  alternativeMC: mc({ fireAge: { p25: null, p50: 55, p75: null }, netWorthAtFire: { p25: null, p50: 2_000_000, p75: null }, passiveIncomeAtFire: { p25: null, p50: 80_000, p75: null } }),
});
check("alt wins fireAge → 1 minus on fireAge", r3.reasons.some(r => r.axis === "fireAge" && r.sign === "-"));
check("other axes still '+' for recommended", r3.reasons.filter(r => r.sign === "+").length >= 2);

// 4. Tied scenarios → empty reasons list (within tolerances)
const r4 = buildAlternativeRationale({
  recommended: scenario({ probabilityP50: 0.80 }),
  alternative: scenario({ probabilityP50: 0.80 }),
  recommendedMC: mc({ fireAge: { p25: null, p50: 55, p75: null }, netWorthAtFire: { p25: null, p50: 2_000_000, p75: null }, passiveIncomeAtFire: { p25: null, p50: 80_000, p75: null } }),
  alternativeMC: mc({ fireAge: { p25: null, p50: 55, p75: null }, netWorthAtFire: { p25: null, p50: 2_000_000, p75: null }, passiveIncomeAtFire: { p25: null, p50: 80_000, p75: null } }),
});
check("tied scenarios → empty reasons", r4.reasons.length === 0);

// 5. Missing MC data → empty reasons (no fabrication)
const r5 = buildAlternativeRationale({
  recommended: rec, alternative: altA,
  recommendedMC: mc({}),  // all-null projections
  alternativeMC: mc({}),
});
check("missing MC → no NW reason", !r5.reasons.some(r => r.axis === "nw"));
check("missing MC → no fireAge reason", !r5.reasons.some(r => r.axis === "fireAge"));
check("missing MC → no passive reason", !r5.reasons.some(r => r.axis === "passive"));

// 6. NW within 1% threshold → no reason emitted
const recNw = 2_000_000;
const r6 = buildAlternativeRationale({
  recommended: scenario(), alternative: scenario(),
  recommendedMC: mc({ netWorthAtFire: { p25: null, p50: recNw, p75: null } }),
  alternativeMC: mc({ netWorthAtFire: { p25: null, p50: recNw * 1.005, p75: null } }), // 0.5%
});
check("NW within 1% threshold → no reason", !r6.reasons.some(r => r.axis === "nw"));

// 7. FIRE age within 0.25y threshold → no reason
const r7 = buildAlternativeRationale({
  recommended: scenario(), alternative: scenario(),
  recommendedMC: mc({ fireAge: { p25: null, p50: 55, p75: null } }),
  alternativeMC: mc({ fireAge: { p25: null, p50: 55, p75: null } }),
});
check("identical FIRE age → no fireAge reason", !r7.reasons.some(r => r.axis === "fireAge"));

// 8. Survivability within 1pp threshold → no reason
const r8 = buildAlternativeRationale({
  recommended: scenario({ probabilityP50: 0.80 }),
  alternative: scenario({ probabilityP50: 0.805 }),
  recommendedMC: mc({}), alternativeMC: mc({}),
});
check("survivability within 1pp → no reason", !r8.reasons.some(r => r.axis === "survivability"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
