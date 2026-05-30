/**
 * stressFailureAnalysis.test.ts — Sprint 28B.
 *
 * Tests the failure-analysis selector. Must:
 *   1. Return 9 rows (one per failure-point id) regardless of input.
 *   2. Surface null probability + "unknown" severity when result is null.
 *   3. Band probabilities deterministically (low/medium/high).
 *   4. Read forced-sale probability off forcedSaleReport.triggerProbability.
 *   5. Render "Not modelled yet" when a softWarning is absent.
 *   6. Pick up rate / income / property / etf rows from matching softWarnings.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/stressFailureAnalysis.test.ts
 */
import type { ExtendedScenarioResult } from "../../scenarioV2/runScenario";
import type { SoftWarning } from "../../scenarioV2/decisionEngine/candidateGenerator";
import { selectFailureAnalysis } from "../stressFailureAnalysis";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function makeResult(over: Partial<ExtendedScenarioResult> = {}): ExtendedScenarioResult {
  return {
    defaultProbability: 0,
    liquidityExhaustionProbability: 0,
    negativeEquityProbability: 0,
    refinancePressureProbability: 0,
    medianDefaultMonth: null,
    medianLiquidityFirstMonth: null,
    medianNegEquityFirstMonth: null,
    forcedSaleReport: {
      triggerProbability: 0,
      insolventAfterForcedSaleProbability: 0,
      recoveryProbabilityGivenForcedSale: 0,
      medianForcedSaleProceeds: 0,
      meanForcedSaleProceeds: 0,
      triggerCount: 0,
      perSim: [],
      notes: [],
    },
    ...over,
  } as ExtendedScenarioResult;
}

console.log("\nstressFailureAnalysis — engine probability rendering");

// 1. Null result → 9 unknown rows
const r1 = selectFailureAnalysis({ result: null });
check("null result → 9 rows", r1.length === 9);
check("null result → every row is unknown severity", r1.every(r => r.severity === "unknown"));
check("null result → every row probability null", r1.every(r => r.probability === null));

// 2. Banding low/medium/high
const r2 = selectFailureAnalysis({ result: makeResult({
  defaultProbability: 0.02,                  // low
  liquidityExhaustionProbability: 0.15,      // medium
  negativeEquityProbability: 0.35,           // high
}) });
check("default 0.02 → low", r2.find(r => r.id === "default_insolvency")!.severity === "low");
check("liquidity 0.15 → medium", r2.find(r => r.id === "liquidity_stress")!.severity === "medium");
check("negEquity 0.35 → high", r2.find(r => r.id === "negative_equity")!.severity === "high");

// 3. forcedSaleReport.triggerProbability is the source
const r3 = selectFailureAnalysis({ result: makeResult({
  forcedSaleReport: {
    triggerProbability: 0.08,
    insolventAfterForcedSaleProbability: 0,
    recoveryProbabilityGivenForcedSale: 0,
    medianForcedSaleProceeds: 100_000,
    meanForcedSaleProceeds: 100_000,
    triggerCount: 8,
    perSim: [],
    notes: [],
  },
}) });
const forcedRow = r3.find(r => r.id === "forced_sales")!;
check("forced sales prob = forcedSaleReport.triggerProbability", forcedRow.probability === 0.08);
check("forced sales severity = medium (0.08)", forcedRow.severity === "medium");
check("forced sales detail mentions median proceeds", forcedRow.detail.includes("$100,000"));

// 4. softWarnings absent → rate/income/property/etf rows say "Not modelled yet"
const rNo = selectFailureAnalysis({ result: makeResult() });
check("rate_shock with no softWarnings → Not modelled yet", rNo.find(r => r.id === "rate_shock")!.detail === "Not modelled yet");
check("income_reduction with no softWarnings → Not modelled yet", rNo.find(r => r.id === "income_reduction")!.detail === "Not modelled yet");
check("property_underperformance with no softWarnings → Not modelled yet", rNo.find(r => r.id === "property_underperformance")!.detail === "Not modelled yet");
check("etf_underperformance with no softWarnings → Not modelled yet", rNo.find(r => r.id === "etf_underperformance")!.detail === "Not modelled yet");

// 5. Matching softWarnings populate the right rows
const softWarnings: SoftWarning[] = [
  { id: "rate-spike",   label: "Rate-spike sensitivity", detail: "Repricing risk elevated.", severity: "warn",     driver: "interestPath" },
  { id: "income-vol",   label: "Income volatility",      detail: "Wage variance > 30%.",       severity: "critical", driver: "wageShock" },
  { id: "property-thin",label: "Property growth thin",   detail: "Growth assumption low.",     severity: "info",     driver: "propertyGrowth" },
  { id: "etf-vol",      label: "ETF return drift",       detail: "Equity dispersion wide.",    severity: "warn",     driver: "etfReturn" },
];
const rWith = selectFailureAnalysis({ result: makeResult(), softWarnings });
check("rate_shock picks up rate softWarning", rWith.find(r => r.id === "rate_shock")!.driver.includes("rate-spike"));
check("rate_shock severity from softWarning.severity 'warn' → medium", rWith.find(r => r.id === "rate_shock")!.severity === "medium");
check("income_reduction picks up income softWarning", rWith.find(r => r.id === "income_reduction")!.driver.includes("income-vol"));
check("income_reduction critical → high severity", rWith.find(r => r.id === "income_reduction")!.severity === "high");
check("property_underperformance picks up property softWarning", rWith.find(r => r.id === "property_underperformance")!.driver.includes("property-thin"));
check("property info → low severity", rWith.find(r => r.id === "property_underperformance")!.severity === "low");
check("etf_underperformance picks up etf softWarning", rWith.find(r => r.id === "etf_underperformance")!.driver.includes("etf-vol"));

// 6. Always 9 rows in every scenario
check("always 9 rows present", rWith.length === 9);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
