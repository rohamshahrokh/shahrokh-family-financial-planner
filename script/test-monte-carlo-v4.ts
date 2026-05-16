/**
 * test-monte-carlo-v4.ts — Phase L: institutional-grade validation harness
 * for the Monte Carlo V4 engine.
 *
 * Covers (per spec):
 *   - regime transitions are sticky (not flipping per month)
 *   - property cycle responses are bounded and react to regimes
 *   - rate shocks raise interest path
 *   - life-event engine produces deltas
 *   - leverage stress reflects in debt stress / refinance metrics
 *   - behavioural overlays change panic-sell outcomes
 *   - narrative consistency (every block has heading + body)
 *   - dashboard reconciliation preserved (V4 wraps V3 canonical)
 *   - optimizer outputs are structured and prioritised
 *   - probability distributions: V4 result still produces a fan and matches
 *     V3's percentile order (P10 < P50 < P90)
 *   - calibration / sanity / drift detection: same seed → same result
 *
 * Run with:  npx tsx script/test-monte-carlo-v4.ts
 */

import { buildCanonicalMonteCarloInput } from "../client/src/lib/monteCarloCanonical";
import { DEFAULT_MC_VOLATILITY, generateYearlyFromProfile } from "../client/src/lib/forecastStore";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

import {
  mulberry32, hashSeed, randNormalSeeded,
  generateRegimePath, dominantRegimeByYear, REGIME_IDS, REGIME_EFFECTS,
  generateRatePath, DEFAULT_RATE_PARAMS,
  generatePropertyCyclePath,
  generateLifeEventTimeline,
  sensitivitiesFor, trailingDrawdown,
  computeAdvancedRiskMetrics,
  recommendAllocationActions,
  buildV4Narratives, narrativesToLegacyStrings,
  ASSUMPTION_GLOSSARY,
  runMonteCarloV4,
} from "../client/src/lib/monteCarloV4";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (check(name, cond, detail)) pass++; else fail++;
}
function section(t: string) { console.log(`\n── ${t} ──`); }

// ───────────────────────────────────────────────────────────────────────────
section("RNG: deterministic + reproducible");
// ───────────────────────────────────────────────────────────────────────────
{
  const a = mulberry32(42);
  const b = mulberry32(42);
  const arrA = [a(), a(), a(), a()];
  const arrB = [b(), b(), b(), b()];
  run("mulberry32 with same seed produces same stream",
    JSON.stringify(arrA) === JSON.stringify(arrB),
    `A=${arrA.slice(0,2).map(x=>x.toFixed(3))} B=${arrB.slice(0,2).map(x=>x.toFixed(3))}`);

  run("hashSeed of same string is stable", hashSeed("fwl") === hashSeed("fwl"));
  run("hashSeed of different strings differs", hashSeed("fwl") !== hashSeed("fwl-2"));

  const rng = mulberry32(7);
  const n1 = randNormalSeeded(rng, 0, 1);
  run("randNormalSeeded returns finite number", Number.isFinite(n1), `n1=${n1}`);
}

// ───────────────────────────────────────────────────────────────────────────
section("Regimes: persistence + valid transitions");
// ───────────────────────────────────────────────────────────────────────────
{
  const rng = mulberry32(123);
  const path = generateRegimePath(rng, 120, "normal_growth");
  run("regime path covers all months", path.length === 120);
  run("every regime is a valid REGIME_ID",
    path.every(r => REGIME_IDS.includes(r)));

  // Count regime "runs" — regimes should NOT flip every month
  let runs = 1;
  for (let i = 1; i < path.length; i++) if (path[i] !== path[i - 1]) runs++;
  const avgDwell = path.length / runs;
  run("regimes persist (avg dwell > 4 months)", avgDwell > 4, `avgDwell=${avgDwell.toFixed(1)}`);
  run("regimes also change at least once over 10 years", runs > 1, `runs=${runs}`);

  // dominantRegimeByYear returns 1 regime per year
  const dom = dominantRegimeByYear(path, 10);
  run("dominantRegimeByYear length matches years", dom.length === 10);
  run("every dominant regime is valid", dom.every(r => REGIME_IDS.includes(r)));

  // Regime effects table is complete for every regime
  run("every regime has full effects entry",
    REGIME_IDS.every(r => REGIME_EFFECTS[r] && REGIME_EFFECTS[r].label.length > 0));
}

// ───────────────────────────────────────────────────────────────────────────
section("Rates: respond to regime + emergency cut / stress shock");
// ───────────────────────────────────────────────────────────────────────────
{
  const rng = mulberry32(99);
  // Force a tightening regime for all 24 months — rates should average HIGHER
  const tightPath = Array(24).fill("tightening_cycle") as any[];
  const cutPath   = Array(24).fill("rate_cut_cycle") as any[];

  const rTight = generateRatePath(rng, 24, tightPath, DEFAULT_RATE_PARAMS);
  const rCut   = generateRatePath(mulberry32(99), 24, cutPath, DEFAULT_RATE_PARAMS);

  const avgT = Array.from(rTight.cashRate).reduce((s, v) => s + v, 0) / 24;
  const avgC = Array.from(rCut.cashRate).reduce((s, v) => s + v, 0) / 24;
  run("tightening regime drives higher avg rate than rate-cut regime",
    avgT > avgC, `avgT=${avgT.toFixed(2)} avgC=${avgC.toFixed(2)}`);

  // Floor/ceiling respected
  const allRates = Array.from(rTight.cashRate);
  run("rate path respects floor and ceiling",
    allRates.every(r => r >= DEFAULT_RATE_PARAMS.floor && r <= DEFAULT_RATE_PARAMS.ceiling));
}

// ───────────────────────────────────────────────────────────────────────────
section("Property cycle: bounded + reacts to regime");
// ───────────────────────────────────────────────────────────────────────────
{
  const rng = mulberry32(55);
  const regime = Array(24).fill("recession") as any[];
  const cycle = generatePropertyCyclePath(rng, 2026, 24, regime, { region: "seq_olympic_overlay" });
  run("growth mults are non-negative",
    Array.from(cycle.growthMultByMonth).every(v => v >= 0));
  run("vacancy probabilities are in [0,1]",
    Array.from(cycle.vacancyProbByMonth).every(v => v >= 0 && v <= 1));
  // In recession, vacancy prob should be elevated above baseline 3%
  const avgVac = Array.from(cycle.vacancyProbByMonth).reduce((s, v) => s + v, 0) / 24 * 12;
  run("recession elevates vacancy probability above 4%/yr",
    avgVac > 0.04, `avgVac=${avgVac.toFixed(3)}`);
}

// ───────────────────────────────────────────────────────────────────────────
section("Life events: scheduled + probabilistic deltas");
// ───────────────────────────────────────────────────────────────────────────
{
  const rng = mulberry32(7);
  const tl = generateLifeEventTimeline(rng, 60, {
    scheduled: [
      { type: "inheritance", month: 12, lumpSum: 100_000, label: "Inheritance" },
      { type: "school_cost_start", month: 24, monthlyCashDelta: -1_500, durationMonths: 36 },
    ],
    baselineMonthlyIncome: 20_000,
  });
  run("scheduled inheritance lump applied at correct month",
    tl.cashDeltaByMonth[12] >= 100_000);
  run("scheduled school cost reduces cash for 36 months",
    tl.cashDeltaByMonth[24] <= -1_500 && tl.cashDeltaByMonth[24 + 30] <= -1_500);
  // Some probabilistic events should fire over 60 months
  run("probabilistic events fire at least once over 5 years",
    tl.firedEvents.length >= 2, `fired=${tl.firedEvents.length}`);
}

// ───────────────────────────────────────────────────────────────────────────
section("Behavioural: profile sensitivities + drawdown helper");
// ───────────────────────────────────────────────────────────────────────────
{
  const d = sensitivitiesFor("disciplined");
  const e = sensitivitiesFor("emotional_investor");
  run("emotional investor panic-sells more than disciplined",
    e.panicSellFraction > d.panicSellFraction);
  run("emotional investor pauses DCA on drawdown more than disciplined",
    e.pauseDcaOnDrawdownProb > d.pauseDcaOnDrawdownProb);

  const series = [100, 110, 120, 90, 80, 95];
  const dd = trailingDrawdown(series, 4, 5);
  run("trailingDrawdown captures peak-to-trough", dd > 0.30 && dd < 0.40, `dd=${dd.toFixed(3)}`);
}

// ───────────────────────────────────────────────────────────────────────────
section("Risk metrics: VaR / CVaR / survival horizon");
// ───────────────────────────────────────────────────────────────────────────
{
  const terminalNw = Array.from({ length: 200 }, (_, i) => 1_000_000 + i * 5_000);
  const yearEnd = Array.from({ length: 200 }, () => Array(10).fill(0).map((_, y) => 1_000_000 + y * 50_000));
  const flags = Array.from({ length: 200 }, () => ({
    firstNegCashMonth: null, firstShortfallMonth: null, firstInsolvencyMonth: null,
    worstDrawdownPct: 0.1, worstDrawdownYearIdx: 5,
    refinanceFailed: false, debtSpiral: false, peakDSR: 0.3, peakLVR: 0.55,
  }));
  const m = computeAdvancedRiskMetrics(terminalNw, yearEnd, flags, 2026);
  run("VaR95 ≤ VaR50", m.var95 <= terminalNw[100], `var95=${m.var95}`);
  run("CVaR95 ≤ VaR95 (or equal)", m.cvar95 <= m.var95, `cvar=${m.cvar95} var=${m.var95}`);
  run("liquidity / insolvency / refi probabilities are percentages 0–100",
    m.liquidityExhaustionProb >= 0 && m.liquidityExhaustionProb <= 100
    && m.insolvencyProb >= 0 && m.insolvencyProb <= 100
    && m.refinanceFailureProb >= 0 && m.refinanceFailureProb <= 100);
  run("survival horizon is finite", Number.isFinite(m.survivalHorizonYears));
}

// ───────────────────────────────────────────────────────────────────────────
section("Optimizer: structured recommendations, priority order");
// ───────────────────────────────────────────────────────────────────────────
{
  const recs = recommendAllocationActions(
    {
      var95: 0, var99: 0, cvar95: 0, sorRisk: 0,
      liquidityExhaustionProb: 25, insolvencyProb: 10, refinanceFailureProb: 22,
      debtStressScore: 0.5, leverageFragilityScore: 0.6, survivalHorizonYears: 5,
      medianFirstFailureMonth: null, medianFirstLiquidityStressMonth: null,
      worstDrawdownYear: 2030, debtSpiralProb: 8,
    },
    {
      cryptoWeight: 0.3, stockWeight: 0.4, cashWeight: 0.05,
      debtToAssets: 0.6, monthlySurplus: 5_000, cashBalance: 10_000,
      emergencyBufferTarget: 30_000, hasPlannedPropertyPurchase: true, superBalance: 400_000,
    },
  );
  run("optimizer returns recommendations under stress", recs.length > 0, `recs=${recs.length}`);
  run("every recommendation has structured fields",
    recs.every(r => r.title && r.rationale && r.expectedBenefit && r.riskTradeoff && r.confidence && r.priority));
  run("recommendations sorted by priority",
    recs.every((r, i) => i === 0 || r.priority >= recs[i - 1].priority));
}

// ───────────────────────────────────────────────────────────────────────────
section("Explanations: narratives have heading + body + tone");
// ───────────────────────────────────────────────────────────────────────────
{
  const blocks = buildV4Narratives({
    median: 2_500_000, p10: 1_200_000, p90: 4_500_000, probFf: 45,
    metrics: {
      var95: 1_000_000, var99: 700_000, cvar95: 800_000, sorRisk: 0.18,
      liquidityExhaustionProb: 8, insolvencyProb: 3, refinanceFailureProb: 18,
      debtStressScore: 0.35, leverageFragilityScore: 0.5, survivalHorizonYears: 9,
      medianFirstFailureMonth: null, medianFirstLiquidityStressMonth: 64,
      worstDrawdownYear: 2029, debtSpiralProb: 4,
    },
    dominantYearRegimes: Array(10).fill("normal_growth"),
    startYear: 2026,
    driverWeights: [
      { name: "Property growth", weight: 1.0, direction: "up" },
      { name: "Interest rate path", weight: 0.7, direction: "down" },
      { name: "Crypto return", weight: 0.4, direction: "up" },
    ],
  });
  run("narrative blocks are produced", blocks.length >= 4, `blocks=${blocks.length}`);
  run("every block has heading + body + tone",
    blocks.every(b => b.heading && b.body && b.tone));
  const legacy = narrativesToLegacyStrings(blocks);
  run("legacy strings shaped correctly",
    Array.isArray(legacy.key_risks) && Array.isArray(legacy.advisor_notes));
}

// ───────────────────────────────────────────────────────────────────────────
section("Glossary: every advanced assumption has plain-English entry");
// ───────────────────────────────────────────────────────────────────────────
{
  const required = ["nsr", "dsr", "volatility", "drawdown", "var", "cvar",
    "confidence_bands", "regime_persistence", "leverage_risk", "liquidity_risk"];
  for (const k of required) {
    const a = ASSUMPTION_GLOSSARY[k];
    run(`glossary has '${k}'`,
      !!a && !!a.label && !!a.tooltip && !!a.example && !!a.whyItMatters
      && !!a.higherMeans && !!a.lowerMeans);
  }
}

// ───────────────────────────────────────────────────────────────────────────
section("V4 engine: integration with canonical pipeline (dashboard parity)");
// ───────────────────────────────────────────────────────────────────────────
{
  const ledger = makeRealUserInputs();
  const yearly = generateYearlyFromProfile("moderate");
  const { input, reconciliation } = buildCanonicalMonteCarloInput(ledger, {
    yearlyAssumptions: yearly,
    volatilityParams: DEFAULT_MC_VOLATILITY,
    simulations: 50,
  });
  run("canonical reconciliation still PASS (V4 wraps V3)",
    reconciliation.status === "PASS",
    `dashNw=${reconciliation.dashboardNetWorth} engineNw=${reconciliation.engineStartingNetWorth} diff=${reconciliation.diff}`);

  const r = runMonteCarloV4(input, { seed: "fwl-test-1", skipAdvancedRisk: false });
  run("V4 result preserves V3 percentile order (P10 < median < P90)",
    r.p10 <= r.median && r.median <= r.p90);
  run("V4 result includes schemaVersion v4", r.v4.schemaVersion === "v4");
  run("V4 result has 10 years of regime data", r.v4.regimeByYear.length === yearly.length);
  run("V4 stressMarkersByYear length matches horizon", r.v4.stressMarkersByYear.length === yearly.length);
  run("V4 fan_data preserved from V3", Array.isArray(r.fan_data) && r.fan_data.length > 0);

  // Deterministic replay
  const r2 = runMonteCarloV4(input, { seed: "fwl-test-1", skipAdvancedRisk: false });
  run("V4 with same seed produces same regime path (replay)",
    JSON.stringify(r.v4.regimeByYear) === JSON.stringify(r2.v4.regimeByYear));
  run("V4 with same seed produces same advanced risk metrics",
    JSON.stringify(r.v4.advancedRisk) === JSON.stringify(r2.v4.advancedRisk));

  // Seed drift: different seed should change regime mix counts
  const r3 = runMonteCarloV4(input, { seed: "fwl-test-2" });
  run("V4 with different seed produces a different regime mix (not identical aggregate counts)",
    JSON.stringify(r.v4.regimeMixByYear) !== JSON.stringify(r3.v4.regimeMixByYear));

  // Recommendations + narratives populated
  run("V4 has recommendations array", Array.isArray(r.v4.recommendations));
  run("V4 has narrative blocks", Array.isArray(r.v4.narratives) && r.v4.narratives.length > 0);
  run("V4 driver weights normalised to [0,1]",
    r.v4.driverWeights.every(d => d.weight >= 0 && d.weight <= 1));
}

// ───────────────────────────────────────────────────────────────────────────
section("Impossible-state detection: no NaN / Infinity leak");
// ───────────────────────────────────────────────────────────────────────────
{
  const ledger = makeRealUserInputs();
  const yearly = generateYearlyFromProfile("aggressive");
  const { input } = buildCanonicalMonteCarloInput(ledger, {
    yearlyAssumptions: yearly,
    volatilityParams: DEFAULT_MC_VOLATILITY,
    simulations: 30,
  });
  const r = runMonteCarloV4(input, { seed: "drift-check" });
  const finiteOk =
    Number.isFinite(r.median) && Number.isFinite(r.p10) && Number.isFinite(r.p90)
    && Number.isFinite(r.v4.advancedRisk.var95)
    && Number.isFinite(r.v4.advancedRisk.cvar95)
    && Number.isFinite(r.v4.advancedRisk.liquidityExhaustionProb);
  run("V4 produces only finite numbers across percentiles + risk metrics", finiteOk);
}

if (fail > 0) {
  console.error(`\ntest-monte-carlo-v4: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`\ntest-monte-carlo-v4: ${pass} passed`);
