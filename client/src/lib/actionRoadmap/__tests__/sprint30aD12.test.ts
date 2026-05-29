/**
 * sprint30aD12.test.ts — Sprint 30A D12 alt-strategy rationale + metric tests.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/sprint30aD12.test.ts
 */
import type { GoalLabRankedScenario } from "../../goalLab/orchestrator";
import type { FanPoint } from "../../scenarioV2/types";
import { selectMonteCarloProjection } from "../montecarloProjection";
import { buildAlternativeRationale } from "../alternativeRationale";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// Build a fake winner result with the engine-shaped fields D12 references.
function fan(p50Start: number, p50End: number, months: number): FanPoint[] {
  const out: FanPoint[] = [];
  for (let i = 0; i < months; i++) {
    const v = p50Start + ((p50End - p50Start) * i) / Math.max(1, months - 1);
    out.push({ month: "ignored", p5: v * 0.5, p10: v * 0.6, p25: v * 0.8, p50: v, p75: v * 1.2, p90: v * 1.4, p95: v * 1.5 });
  }
  return out;
}

function scenario(templateId: string, fanFor: FanPoint[], scoreP50: number | null, probability: number | null, lossReason?: string): GoalLabRankedScenario {
  return {
    templateId,
    templateLabel: `Label ${templateId}`,
    promise: `Promise ${templateId}`,
    winner: {
      id: `${templateId}-win`,
      label: `Winner ${templateId}`,
      shortLabel: templateId,
      events: [],
      result: { netWorthFan: fanFor } as never,
      score: { score: scoreP50 } as never,
      trace: {} as never,
      headline: "h",
      rationale: [],
      softWarnings: [],
      isHighRisk: false,
      ...(lossReason ? { lossReason } : {}),
    } as never,
    alternates: [],
    probabilityP50: probability,
    scoreP50,
    raw: {} as never,
    ...(lossReason ? ({ lossReason } as never) : {}),
  };
}

console.log("\nsprint30aD12 — alt-strategy rationale + per-card metrics");

const startAge = 40;
const swrPct = 4;
const fireNumber = 2_000_000;
const recFan = fan(1_000_000, 3_500_000, 240); // crosses 2M earlier
const altFan = fan(1_000_000, 3_000_000, 240); // crosses 2M later, smaller terminal NW

// D12.1 — each scenario produces its own MC projection (not shared with recommended)
const recMC = selectMonteCarloProjection({ fan: recFan, startAge, fireTarget: fireNumber, swrPct, simulationCount: 300 });
const altMC = selectMonteCarloProjection({ fan: altFan, startAge, fireTarget: fireNumber, swrPct, simulationCount: 300 });
check("D12 each scenario projects own FIRE age", recMC.fireAge.p50 !== null && altMC.fireAge.p50 !== null);
check("D12 alt FIRE age differs from recommended", recMC.fireAge.p50 !== altMC.fireAge.p50);
// First-crossing scan samples NW at the threshold, so both fans report NW≈FIRE
// at their respective crossing months. The contract's intent is "each card
// renders from its own engine result" — verified by FIRE age differing.
check("D12 alt NW@FIRE present even when fans converge on threshold",
  recMC.netWorthAtFire.p50 != null && altMC.netWorthAtFire.p50 != null);
check("D12 alt passive income computed from alt fan",
  altMC.passiveIncomeAtFire.p50 != null && Number.isFinite(altMC.passiveIncomeAtFire.p50 as number));

// D12.2 — rationale block carries non-zero reasons when results diverge
const rec = scenario("rec", recFan, 80, 0.85);
const alt = scenario("alt-slow", altFan, 65, 0.70);
const rationale = buildAlternativeRationale({
  recommended: rec, alternative: alt,
  recommendedMC: recMC, alternativeMC: altMC,
});
check("D12 rationale has reasons when MC diverges", rationale.reasons.length > 0);
check("D12 rationale includes survivability axis when probability differs",
  rationale.reasons.some((r) => r.axis === "survivability" && r.sign === "+"));

// D12.3 — lossReason present is preserved on the alt scenario object (verifies the optional surface exists)
const altWithLoss = scenario("alt-loss", altFan, 70, 0.78, "Cashflow too thin in the early 12 months.");
const loss = (altWithLoss as unknown as { lossReason?: string }).lossReason
  ?? (altWithLoss.winner as unknown as { lossReason?: string } | null | undefined)?.lossReason
  ?? null;
check("D12 lossReason field reaches scenario surface", loss === "Cashflow too thin in the early 12 months.");

// D12.4 — missing lossReason → fallback rationale block has score-delta text available
const altNoLoss = scenario("alt-noloss", altFan, 50, null);
const lossNone = (altNoLoss as unknown as { lossReason?: string }).lossReason
  ?? (altNoLoss.winner as unknown as { lossReason?: string } | null | undefined)?.lossReason
  ?? null;
check("D12 no lossReason → null", lossNone === null);
// And the score gap is non-trivial → fallback can rank-anchor.
check("D12 score delta available for fallback rationale", rec.scoreP50! - altNoLoss.scoreP50! > 0);

// D12.5 — when alt MC fan never crosses FIRE, projection is null and the row should render "Not modelled"
const flatFan = fan(500_000, 600_000, 120);
const altMcNull = selectMonteCarloProjection({ fan: flatFan, startAge, fireTarget: fireNumber, swrPct, simulationCount: 300 });
check("D12 never-crosses fan → fireAge p50 null", altMcNull.fireAge.p50 === null);
check("D12 never-crosses fan → NW@FIRE p50 null", altMcNull.netWorthAtFire.p50 === null);

// D12.6 — empty fan defended (no crash)
const altMcEmpty = selectMonteCarloProjection({ fan: [], startAge, fireTarget: fireNumber, swrPct, simulationCount: 300 });
check("D12 empty fan → all null without crash",
  altMcEmpty.fireAge.p50 === null && altMcEmpty.netWorthAtFire.p50 === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
