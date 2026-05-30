/**
 * sprint30aGate.test.ts — D8 reconciliation-gate scope + D10 MC risk wiring.
 *
 * D8 (≥4): the gate exposes `blockedFields` and the helpers honour it.
 * D10 (≥6): stressFailureAnalysis now wires liquidityStressProbability
 *            in front of liquidityExhaustionProbability and distinguishes
 *            null vs zero per the contract.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/sprint30aGate.test.ts
 */
import type { PortfolioState, PropertyState } from "../../scenarioV2/types";
import {
  reconcileTerminalNetWorth, isBlocked, blockedSet,
  type ReconciliationResult,
} from "../financialReconciliation";
import { selectFailureAnalysis } from "../stressFailureAnalysis";
import type { ExtendedScenarioResult } from "../../scenarioV2/runScenario";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function prop(id: string, mv: number, lb: number, off = 0, inLedger?: boolean): PropertyState {
  return { id, marketValue: mv, loanBalance: lb, rate: 0.06, monthlyRepayment: 0, monthlyRent: 0, monthlyCosts: 0, offsetBalance: off, ...(inLedger != null ? { inLedger } : {}) };
}

function state(over: Partial<PortfolioState> = {}): PortfolioState {
  return {
    month: "2031-01", cash: 0, etfBalance: 0, cryptoBalance: 0,
    superRoham: 0, superFara: 0, properties: [],
    cars: 0, iranProperty: 0, otherAssets: 0, otherDebts: 0,
    fyTaxPaid: 0, ttmIncome: 0, ttmExpenses: 0,
    ...over,
  };
}

console.log("\nsprint30aGate — D8 blockedFields + D10 MC risk wiring");

// ─── D8.1 PASS → blockedFields is empty ─────────────────────────────────
const s1 = state({
  properties: [prop("ppor", 1_000_000, 200_000, 0, true)],
  etfBalance: 100_000, cash: 50_000,
});
const r1 = reconcileTerminalNetWorth({ finalState: s1, fanP50AtHorizon: 950_000 });
check("D8 PASS → blockedFields empty", r1.blockedFields.length === 0);
check("D8 PASS → isBlocked(nw_at_fire) false", !isBlocked(r1, "nw_at_fire"));
check("D8 PASS → status PASS", r1.status === "PASS");

// ─── D8.2 FAIL → blockedFields covers exactly nw_at_fire + chart + alt ──
const r2 = reconcileTerminalNetWorth({ finalState: s1, fanP50AtHorizon: 1_500_000 });
check("D8 FAIL → status FAIL", r2.status === "FAIL");
check("D8 FAIL → blockedFields has nw_at_fire", isBlocked(r2, "nw_at_fire"));
check("D8 FAIL → blockedFields has attribution_chart", isBlocked(r2, "attribution_chart"));
check("D8 FAIL → blockedFields has alt_strategy_nw", isBlocked(r2, "alt_strategy_nw"));
check("D8 FAIL → blockedFields has exactly 3 entries", r2.blockedFields.length === 3);

// ─── D8.3 INSUFFICIENT_DATA → blockedFields populated (treated like FAIL) ─
const r3 = reconcileTerminalNetWorth({ finalState: null, fanP50AtHorizon: 1_000_000 });
check("D8 INSUFFICIENT (null state) → blockedFields populated", r3.blockedFields.length === 3);
const r3b = reconcileTerminalNetWorth({ finalState: s1, fanP50AtHorizon: null });
check("D8 INSUFFICIENT (null fan) → blockedFields populated", r3b.blockedFields.length === 3);

// ─── D8.4 blockedSet helper returns Set view ───────────────────────────
const setR2 = blockedSet(r2);
check("D8 blockedSet returns Set", setR2 instanceof Set);
check("D8 blockedSet preserves entries", setR2.size === 3 && setR2.has("nw_at_fire"));

// ─── D8.5 mcP50 alias matches headlineNW ───────────────────────────────
check("D8 mcP50 alias === headlineNW", r2.mcP50 === r2.headlineNW);

// ─── D10 — stressFailureAnalysis wiring ────────────────────────────────

function makeResult(over: Partial<ExtendedScenarioResult> = {}): ExtendedScenarioResult {
  return {
    defaultProbability: 0,
    liquidityStressProbability: 0,
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
      medianForcedSaleProceeds: 0, meanForcedSaleProceeds: 0,
      triggerCount: 0, perSim: [], notes: [],
    },
    ...over,
  } as ExtendedScenarioResult;
}

// D10.1 — liquidityStressProbability preferred over liquidityExhaustionProbability
const rd1 = selectFailureAnalysis({
  result: makeResult({ liquidityStressProbability: 0.07, liquidityExhaustionProbability: 0 }),
});
const liquidity = rd1.find((f) => f.id === "liquidity_stress")!;
check("D10 stress preferred when present", liquidity.probability === 0.07);
check("D10 stress driver tag uses liquidityStressProbability",
  liquidity.driver === "result.liquidityStressProbability");

// D10.2 — falls back to exhaustion when stress null (use null-ish via Number.NaN cast)
const rd2 = selectFailureAnalysis({
  result: makeResult({
    liquidityStressProbability: Number.NaN as unknown as number,
    liquidityExhaustionProbability: 0.03,
  }),
});
const liquidity2 = rd2.find((f) => f.id === "liquidity_stress")!;
check("D10 falls back to exhaustion when stress NaN", liquidity2.probability === 0.03);
check("D10 driver tag matches exhaustion path",
  liquidity2.driver === "result.liquidityExhaustionProbability");

// D10.3 — both null → "Not modelled yet"
const rd3 = selectFailureAnalysis({
  result: makeResult({
    liquidityStressProbability: Number.NaN as unknown as number,
    liquidityExhaustionProbability: Number.NaN as unknown as number,
  }),
});
const liquidity3 = rd3.find((f) => f.id === "liquidity_stress")!;
check("D10 both null → detail 'Not modelled yet'", liquidity3.detail === "Not modelled yet");
check("D10 both null → severity unknown", liquidity3.severity === "unknown");

// D10.4 — defaultProbability=0 (real engine zero) renders as "0.0%" not Not modelled
const rd4 = selectFailureAnalysis({ result: makeResult({ defaultProbability: 0 }) });
const def = rd4.find((f) => f.id === "default_insolvency")!;
check("D10 prob 0 → numeric (not Not modelled)", def.probability === 0);
check("D10 prob 0 → severity low (< 0.05)", def.severity === "low");

// D10.5 — defaultProbability=null → Not modelled
const rd5 = selectFailureAnalysis({
  result: makeResult({ defaultProbability: Number.NaN as unknown as number }),
});
const def5 = rd5.find((f) => f.id === "default_insolvency")!;
check("D10 prob null → probability null", def5.probability === null);
check("D10 prob null → detail Not modelled yet", def5.detail === "Not modelled yet");

// D10.6 — negative equity wires to result.negativeEquityProbability
const rd6 = selectFailureAnalysis({ result: makeResult({ negativeEquityProbability: 0.22 }) });
const neg = rd6.find((f) => f.id === "negative_equity")!;
check("D10 negEquity wired", neg.probability === 0.22);
check("D10 negEquity high severity", neg.severity === "high");

// D10.7 — refinance pressure wired
const rd7 = selectFailureAnalysis({ result: makeResult({ refinancePressureProbability: 0.12 }) });
const refi = rd7.find((f) => f.id === "refinance_pressure")!;
check("D10 refinance wired", refi.probability === 0.12);

// D10.8 — forced sale triggerProbability wired (verifies exact path)
const rd8 = selectFailureAnalysis({
  result: makeResult({
    forcedSaleReport: { triggerProbability: 0.04, insolventAfterForcedSaleProbability: 0, recoveryProbabilityGivenForcedSale: 0, medianForcedSaleProceeds: 0, meanForcedSaleProceeds: 0, triggerCount: 4, perSim: [], notes: [] },
  }),
});
const fs = rd8.find((f) => f.id === "forced_sales")!;
check("D10 forcedSale wired via triggerProbability", fs.probability === 0.04);

// ── Use the `prop` helper to validate the Sprint 29 inLedger classification
//    survives the Sprint 30A blockedFields refactor (regression).
const sExt: PortfolioState = state({
  properties: [
    prop("ppor", 800_000, 0, 0, true),   // PPOR
    prop("ip-1", 600_000, 100_000, 0, false), // IP
  ],
});
const rRegression: ReconciliationResult = reconcileTerminalNetWorth({ finalState: sExt, fanP50AtHorizon: 1_300_000 });
check("regression: PPOR equity 800k still classified correctly", rRegression.breakdown.ppor === 800_000);
check("regression: IP equity 500k still classified correctly", rRegression.breakdown.investmentProperty === 500_000);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
