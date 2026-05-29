/**
 * roadmapRiskAnalyzer.test.ts — Sprint 27.
 *
 * Honesty + reuse tests for the risk classifier. The analyzer must:
 *   1. Never invent a band — null/missing engine signals → "unknown", not "low".
 *   2. Apply documented thresholds per axis from engine probabilities.
 *   3. Roll up overall band = max of known bands.
 *   4. Surface non-info softWarnings as user-facing warnings.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/roadmapRiskAnalyzer.test.ts
 */

import type { GoalLabRankedScenario } from "../../goalLab/orchestrator";
import { analyzeRoadmapRisk } from "../roadmapRiskAnalyzer";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

interface FakeResult {
  liquidityExhaustionProbability?: number;
  liquidityStressProbability?: number;
  defaultProbability?: number;
  negativeEquityProbability?: number;
  refinancePressureProbability?: number;
  serviceability?: { nsr?: number };
}

function sc(result: FakeResult, events: unknown[] = [], softWarnings: { id: string; label: string; severity: "info" | "warn" | "critical"; detail: string; driver: string }[] = []): GoalLabRankedScenario {
  return {
    templateId: "buy-ip-now",
    templateLabel: "",
    promise: "",
    winner: {
      id: "ip_now",
      label: "",
      shortLabel: "",
      events: events as never,
      result: result as never,
      score: {} as never,
      trace: {} as never,
      headline: "",
      rationale: [],
      softWarnings: softWarnings as never,
      isHighRisk: false,
    } as never,
    alternates: [],
    probabilityP50: null,
    scoreP50: null,
    raw: {} as never,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\nroadmapRiskAnalyzer — honesty + reuse");

// 1. Null scenario → every axis unknown, overall unknown
const nullR = analyzeRoadmapRisk(null);
check("null → 5 axes returned", nullR.axes.length === 5);
check("null → every axis unknown", nullR.axes.every((a) => a.band === "unknown"));
check("null → overall unknown", nullR.overall === "unknown");
check("null → no warnings", nullR.warnings.length === 0);

// 2. Result with no signals at all → every axis unknown
const noSignals = analyzeRoadmapRisk(sc({}, [], []));
check("empty result → every axis unknown", noSignals.axes.every((a) => a.band === "unknown"), noSignals.axes.map((a) => `${a.axis}=${a.band}`).join(","));
check("empty result → overall unknown", noSignals.overall === "unknown");

// 3. Liquidity bands
const liqHigh = analyzeRoadmapRisk(sc({ liquidityExhaustionProbability: 0.30 }));
check("liquidity 30% → high", liqHigh.axes.find((a) => a.axis === "liquidity")?.band === "high");
const liqMed = analyzeRoadmapRisk(sc({ liquidityExhaustionProbability: 0.10 }));
check("liquidity 10% → medium", liqMed.axes.find((a) => a.axis === "liquidity")?.band === "medium");
const liqLow = analyzeRoadmapRisk(sc({ liquidityExhaustionProbability: 0.01 }));
check("liquidity 1% → low", liqLow.axes.find((a) => a.axis === "liquidity")?.band === "low");

// 4. Leverage from NSR
const levHigh = analyzeRoadmapRisk(sc({ serviceability: { nsr: 0.85 } }));
check("nsr 0.85 → leverage high", levHigh.axes.find((a) => a.axis === "leverage")?.band === "high");
const levMed = analyzeRoadmapRisk(sc({ serviceability: { nsr: 1.05 } }));
check("nsr 1.05 → leverage medium", levMed.axes.find((a) => a.axis === "leverage")?.band === "medium");
const levLow = analyzeRoadmapRisk(sc({ serviceability: { nsr: 1.50 } }));
check("nsr 1.50 → leverage low", levLow.axes.find((a) => a.axis === "leverage")?.band === "low");

// 5. Leverage NSR ok but high negative equity → high
const negEq = analyzeRoadmapRisk(sc({ serviceability: { nsr: 1.50 }, negativeEquityProbability: 0.25 }));
check("negEq 25% overrides nsr to high", negEq.axes.find((a) => a.axis === "leverage")?.band === "high");

// 6. Cashflow bands from defaultProbability
const cfHigh = analyzeRoadmapRisk(sc({ defaultProbability: 0.20 }));
check("default 20% → cashflow high", cfHigh.axes.find((a) => a.axis === "cashflow")?.band === "high");
const cfMed = analyzeRoadmapRisk(sc({ defaultProbability: 0.08 }));
check("default 8% → cashflow medium", cfMed.axes.find((a) => a.axis === "cashflow")?.band === "medium");
const cfLow = analyzeRoadmapRisk(sc({ defaultProbability: 0.01 }));
check("default 1% → cashflow low", cfLow.axes.find((a) => a.axis === "cashflow")?.band === "low");

// 7. Concentration only fires with engine softWarnings — no signal → unknown (not low)
const concNone = analyzeRoadmapRisk(sc({ defaultProbability: 0.01 }));
check("no concentration signal → unknown (not invented as low)", concNone.axes.find((a) => a.axis === "concentration")?.band === "unknown");
const concCrit = analyzeRoadmapRisk(sc({}, [], [{ id: "crypto-exposure", label: "Crypto > 10%", severity: "critical", detail: "", driver: "" }]));
check("critical crypto warning → concentration high", concCrit.axes.find((a) => a.axis === "concentration")?.band === "high");

// 8. Execution — many events + refi pressure → high
const execHigh = analyzeRoadmapRisk(sc({ refinancePressureProbability: 0.25 }, [1, 2, 3, 4, 5]));
check("5 events + refi 25% → execution high", execHigh.axes.find((a) => a.axis === "execution")?.band === "high");
const execLow = analyzeRoadmapRisk(sc({ refinancePressureProbability: 0.01 }, [1]));
check("1 event + refi 1% → execution low", execLow.axes.find((a) => a.axis === "execution")?.band === "low");

// 9. Overall = worst known band
const overallH = analyzeRoadmapRisk(sc({ liquidityExhaustionProbability: 0.30, defaultProbability: 0.01 }));
check("one high axis → overall high", overallH.overall === "high");
const overallM = analyzeRoadmapRisk(sc({ liquidityExhaustionProbability: 0.10, defaultProbability: 0.01 }));
check("medium + low → overall medium", overallM.overall === "medium");
const overallL = analyzeRoadmapRisk(sc({ liquidityExhaustionProbability: 0.01, defaultProbability: 0.01 }));
check("all low (known) → overall low", overallL.overall === "low");

// 10. Warnings: non-info softWarnings surface
const warnSc = analyzeRoadmapRisk(sc({}, [], [
  { id: "crypto-exposure", label: "Crypto > 10%", severity: "critical", detail: "", driver: "" },
  { id: "info-only", label: "FYI", severity: "info", detail: "", driver: "" },
]));
check("non-info warnings surfaced", warnSc.warnings.length === 1 && warnSc.warnings[0] === "Crypto > 10%");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
