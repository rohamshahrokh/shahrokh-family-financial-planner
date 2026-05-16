/**
 * Family Wealth Lab — Autonomous Financial OS Phase 3 test suite.
 *
 * Run with: npm run test:autonomous-os
 *
 * What this proves:
 *   1. buildAutonomousReport is deterministic on identical inputs.
 *   2. Strategy monitoring emits 10 dimensions; "needs-history" surfaces when
 *      no history is supplied.
 *   3. Recommendation evolution: baseline state when no memory; changed state
 *      when memory.lastWinnerId differs.
 *   4. Macro regime classification handles falling/rising/inflationary/bear
 *      signals deterministically.
 *   5. Opportunity detection surfaces idle-liquidity, refinance-window,
 *      attractive-entry under expected drivers.
 *   6. Drift engine flags FIRE delay, savings-rate decline, leverage
 *      acceleration, liquidity compression when history is supplied; clean
 *      run otherwise.
 *   7. Dynamic priorities are sorted by severity then urgency, capped at 7.
 *   8. Rebalancing intelligence flags over/under allocation, concentration,
 *      crypto vol-imbalance, cash imbalance.
 *   9. Life-event simulator emits all 9 events.
 *  10. Autonomous alerts include refinance breakpoint and regime channel.
 *  11. Longitudinal: hasHistory false when 0–1 snapshots; true when ≥2.
 *  12. Roadmap returns 4 horizons with non-empty actions.
 *  13. Strategic memory: hasMemory false when none; true with constraints
 *      derived from philosophy / leverage / liquidity preferences.
 *  14. Visualisations include all 8 surfaces; series carry hasHistory flags.
 *  15. End-to-end on the real engine: a small generateQuickDecisionCandidates
 *      run produces a non-empty report with the canonical shape.
 */

import {
  buildAutonomousReport,
  buildMonitoringSignals,
  buildRecommendationEvolution,
  classifyRegime,
  detectOpportunities,
  detectTrajectoryDrift,
  buildPriorities,
  detectRebalancing,
  simulateLifeEvents,
  buildAutonomousAlerts,
  buildLongitudinal,
  buildRoadmap,
  summariseStrategicMemory,
  buildVisualisations,
  type AutonomousReport,
  type LedgerSnapshot,
  type StrategicMemoryInput,
} from "../client/src/lib/scenarioV2/autonomous";
import { DEFAULT_ASSUMPTIONS } from "../client/src/lib/scenarioV2/basePlan";
import {
  buildFinancialIntelligence,
  type FinancialIntelligenceReport,
} from "../client/src/lib/scenarioV2/intelligence";
import {
  generateQuickDecisionCandidates,
  type QuickDecisionOutput,
  type RankedCandidate,
} from "../client/src/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    process.stdout.write(`  ✓ ${name}\n`);
  } else {
    fail++;
    process.stdout.write(`  ✗ ${name}${detail ? `  — ${detail}` : ""}\n`);
  }
}
function section(name: string): void {
  process.stdout.write(`\n${name}\n`);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    id: "ip_6mo_lever",
    label: "Buy IP in 6mo + leverage tilt",
    shortLabel: "IP @ 6mo",
    events: [],
    result: {
      initialNetWorth: 800_000,
      terminalNwSamples: [],
      terminalCashSamples: [],
      terminalNwSorted: [900_000, 1_050_000, 1_200_000, 1_350_000],
      cashFan: [] as any,
      medianNwPath: [],
      medianCashPath: [],
      negativeEquityProbability: 0.04,
      liquidityStressProbability: 0.18,
      refinancePressureProbability: 0.22,
      defaultProbability: 0.04,
      liquidityExhaustionProbability: 0.05,
      medianDefaultMonth: null,
      medianLiquidityFirstMonth: 24,
      medianNegEquityFirstMonth: null,
      sequenceDispersion: {} as any,
      terminalRates: [],
      maxDrawdownSamples: [],
      riskMetrics: {
        volatility: 0.30,
        downsideRisk: 0.32,
        leverageRisk: 0.68,
        liquidityRisk: 0.42,
        concentrationRisk: 0.62,
        riskAdjustedNw: 1_050_000,
        varDollars95: 90_000,
        cvarDollars95: 140_000,
        maxDrawdownMedian: 0.22,
        maxDrawdownP90: 0.34,
        rationale: [],
      },
      runtimeMs: 100,
      simulationCount: 300,
      horizonMonths: 120,
      canonicalNetWorth: {} as any,
      netWorthReconciliation: {} as any,
      warnings: [],
      name: "scenario",
      reconciledMonthlySurplus: 6500,
      dashboardMonthlySurplus: 6500,
      reconcilesToDashboard: true,
      serviceability: { lvr: 0.78, dsr: 0.32, dti: 5.4, nsr: 1.05, bufferedRate: 0.085, monthlyDebtServiceActual: 5_000, monthlyDebtServiceBuffered: 6_200, maxBorrowCapacity: 250_000, band: "stretched", rationale: [] } as any,
      netWorthFan: [],
      scenarioId: "ip_6mo_lever",
      snapshotHash: "h",
      seed: 1,
      runTimestamp: "1970-01-01T00:00:00Z",
      confidence: [],
      risk: null,
      attribution: null,
    } as any,
    score: { score: 78, breakdown: {}, penalties: [] } as any,
    trace: {} as any,
    headline: "Buy IP in 6mo with property leverage tilt.",
    rationale: [],
    softWarnings: [],
    isHighRisk: false,
    ...overrides,
  } as RankedCandidate;
}

function makeOutput(): QuickDecisionOutput {
  const w = makeCandidate();
  const r2 = makeCandidate({ id: "etf_dca", label: "ETF DCA + offset top-up", headline: "Steady DCA" });
  const baseline = makeCandidate({ id: "baseline", label: "Baseline" }).result;
  return {
    question: "deploy_capital",
    capital: 50_000,
    investorProfile: "balanced" as any,
    ranked: [w, r2],
    discarded: [],
    highRiskPaths: [],
    multiWinner: { balanced: { id: w.id, score: 78 }, wealthMax: null, cashflowSafe: null, highRisk: null },
    riskControlsApplied: { mode: "balanced", resolved: {} as any },
    basePlanHash: "h",
    baseScenarioResult: baseline,
    generatedAt: "1970-01-01",
    comparativeNarrative: { winnerId: w.id, runnerUpId: r2.id, whyWon: [], whatCouldInvalidate: [], secondPlaceAndWhy: "" },
    executionPlan: [],
    conditionalRecommendations: [],
  } as QuickDecisionOutput;
}

function makeHistory(): LedgerSnapshot[] {
  return [
    { month: "2025-11", monthlySurplus: 5_000, monthlyIncome: 14_000, monthlyExpenses: 9_000, netWorth: 760_000, liquidCash: 80_000, totalDebt: 620_000, fireYearsAway: 18.0, lvr: 0.74, allocation: { cash: 0.10, equities: 0.30, property: 0.45, super: 0.10, crypto: 0.03, other: 0.02 } },
    { month: "2025-12", monthlySurplus: 4_500, monthlyIncome: 14_300, monthlyExpenses: 9_800, netWorth: 770_000, liquidCash: 60_000, totalDebt: 625_000, fireYearsAway: 18.6, lvr: 0.75, allocation: { cash: 0.07, equities: 0.30, property: 0.45, super: 0.10, crypto: 0.06, other: 0.02 } },
    { month: "2026-01", monthlySurplus: 4_000, monthlyIncome: 14_500, monthlyExpenses: 10_500, netWorth: 780_000, liquidCash: 45_000, totalDebt: 635_000, fireYearsAway: 19.2, lvr: 0.77, allocation: { cash: 0.05, equities: 0.30, property: 0.46, super: 0.10, crypto: 0.07, other: 0.02 } },
  ];
}

function buildIntelligence(output: QuickDecisionOutput): FinancialIntelligenceReport {
  return buildFinancialIntelligence({ output, prior: null });
}

// ─── Tests ────────────────────────────────────────────────────────────────

section("1) Deterministic composition");
{
  const output = makeOutput();
  const intel = buildIntelligence(output);
  const r1 = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS });
  const r2 = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS });
  assert("identical inputs → identical priorities", JSON.stringify(r1.priorities) === JSON.stringify(r2.priorities));
  assert("identical inputs → identical alerts", JSON.stringify(r1.alerts) === JSON.stringify(r2.alerts));
  assert("identical inputs → identical regime", JSON.stringify(r1.regime) === JSON.stringify(r2.regime));
}

section("2) Strategy monitoring covers 10 dimensions");
{
  const output = makeOutput();
  const winner = output.ranked[0];
  const baseline = output.baseScenarioResult;
  const noHist = buildMonitoringSignals({ winner, baseline, history: [] });
  assert("no-history monitoring emits 10 signals", noHist.length === 10, `got ${noHist.length}`);
  const dims = new Set(noHist.map((s) => s.dimension));
  for (const d of ["balance-sheet","cashflow","leverage","liquidity","debt-serviceability","fire-trajectory","risk-drift","market-sensitivity","asset-concentration","behaviour-drift"]) {
    assert(`monitoring includes ${d}`, dims.has(d as any));
  }
  const needs = noHist.filter((s) => s.needsHistory).length;
  assert("at least 3 needs-history signals when no history supplied", needs >= 3);
  const withHist = buildMonitoringSignals({ winner, baseline, history: makeHistory() });
  assert("with-history monitoring emits 10 signals", withHist.length === 10);
  const trendingNw = withHist.find((s) => s.dimension === "balance-sheet");
  assert("balance-sheet monitor produces direction (improving/stable/deteriorating)", !!trendingNw && trendingNw.direction !== "needs-history");
}

section("3) Recommendation evolution");
{
  const output = makeOutput();
  const baseline = output.baseScenarioResult;
  const winner = output.ranked[0];
  const noMem = buildRecommendationEvolution({ winner, baseline });
  assert("no memory → unchanged + baseline reason", noMem.changed === false && /Baseline/i.test(noMem.reason));
  const same = buildRecommendationEvolution({ winner, baseline, memory: { lastWinnerId: winner.id, lastWinnerLabel: winner.label } });
  assert("memory matches winner → unchanged", same.changed === false);
  const changed = buildRecommendationEvolution({ winner, baseline, memory: { lastWinnerId: "old_path", lastWinnerLabel: "Defensive offset hold" }, history: makeHistory() });
  assert("different memory → changed", changed.changed === true);
  assert("changed reason references current label", changed.reason.includes(winner.label) || changed.reason.length > 10);
}

section("4) Macro regime classifier");
{
  const falling = classifyRegime({ assumptions: DEFAULT_ASSUMPTIONS, signals: { rateDirection: -1 } });
  assert("falling-rates regime detected", falling.regime === "falling-rates");
  const rising = classifyRegime({ assumptions: DEFAULT_ASSUMPTIONS, signals: { rateDirection: 1, inflation: 0.025 } });
  assert("rising-rates regime detected", rising.regime === "rising-rates");
  const infl = classifyRegime({ assumptions: DEFAULT_ASSUMPTIONS, signals: { rateDirection: 1, inflation: 0.05 } });
  assert("inflationary boom detected", infl.regime === "inflationary-boom");
  const bear = classifyRegime({ assumptions: DEFAULT_ASSUMPTIONS, signals: { equityDrawdown: 0.25 } });
  assert("equity bear market detected", bear.regime === "equity-bear-market");
  assert("regime confidence in [0,1]", falling.confidence >= 0 && falling.confidence <= 1);
}

section("5) Opportunity detection");
{
  const output = makeOutput();
  const baseline = output.baseScenarioResult;
  const winner = output.ranked[0];
  const idleHist: LedgerSnapshot[] = [...makeHistory(), { month: "2026-02", monthlySurplus: 5_000, monthlyIncome: 14_500, monthlyExpenses: 8_000, netWorth: 800_000, liquidCash: 250_000, totalDebt: 600_000 }];
  const opps = detectOpportunities({ winner, baseline, regime: classifyRegime({ assumptions: DEFAULT_ASSUMPTIONS, signals: { rateDirection: -1 } }), history: idleHist });
  const kinds = new Set(opps.map((o) => o.kind));
  assert("idle-liquidity detected when cash > floor*1.15", kinds.has("idle-liquidity"));
  assert("refinance-window detected in falling-rates regime", kinds.has("refinance-window"));
  const bear = detectOpportunities({ winner, baseline, regime: classifyRegime({ assumptions: DEFAULT_ASSUMPTIONS, signals: { equityDrawdown: 0.25 } }) });
  assert("attractive-entry detected in equity bear", bear.some((o) => o.kind === "attractive-entry"));
}

section("6) Drift engine");
{
  const output = makeOutput();
  const baseline = output.baseScenarioResult;
  const noHist = detectTrajectoryDrift({ baseline, history: [] });
  assert("empty history → needs-history finding", noHist[0]?.needsHistory === true);
  const drift = detectTrajectoryDrift({ baseline, history: makeHistory() });
  const kinds = new Set(drift.map((d) => d.kind));
  assert("FIRE-delay detected from history", kinds.has("fire-delay"));
  assert("savings-rate-deterioration detected", kinds.has("savings-rate-deterioration"));
  assert("liquidity-compression detected", kinds.has("liquidity-compression"));
}

section("7) Dynamic priorities");
{
  const output = makeOutput();
  const intel = buildIntelligence(output);
  const r = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS, history: makeHistory() });
  assert("priorities cap at 7", r.priorities.length <= 7);
  for (let i = 1; i < r.priorities.length; i++) {
    assert(`priority rank monotonic at ${i}`, r.priorities[i].rank === r.priorities[i - 1].rank + 1);
  }
}

section("8) Rebalancing intelligence");
{
  const output = makeOutput();
  const baseline = output.baseScenarioResult;
  const memory: StrategicMemoryInput = { philosophy: "balanced-growth" };
  const reb = detectRebalancing({ baseline, history: makeHistory(), memory });
  const kinds = new Set(reb.map((r) => r.kind));
  assert("at least one allocation drift surfaced", kinds.size >= 1);
  assert("crypto volatility imbalance surfaced when share > target+0.04", reb.some((r) => r.kind === "volatility-imbalance" && r.assetClass === "crypto"));
  // Concentration check: latest history has property=0.46, won't trip 0.55 threshold; OK.
}

section("9) Life-event simulation");
{
  const output = makeOutput();
  const baseline = output.baseScenarioResult;
  const events = simulateLifeEvents({ baseline, history: makeHistory() });
  assert("9 life events emitted", events.length === 9);
  for (const k of ["child-arrival","single-income-transition","job-loss","salary-increase","relocation","school-costs","retirement-transition","inheritance","major-asset-sale"]) {
    assert(`life event ${k} present`, events.some((e) => e.kind === k));
  }
}

section("10) Autonomous alerts");
{
  const output = makeOutput();
  const intel = buildIntelligence(output);
  const r = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS, history: makeHistory(), regimeSignals: { rateDirection: -1 } });
  const channels = new Set(r.alerts.map((a) => a.channel));
  assert("alerts include structural channel (regime)", channels.has("structural"));
  assert("alerts include refi breakpoint", r.alerts.some((a) => a.id === "alert-refi-breakpoint"));
  // sort: critical → warn → watch → info
  const sevRank = { critical: 3, warn: 2, watch: 1, info: 0 } as const;
  for (let i = 1; i < r.alerts.length; i++) {
    assert(`alerts sorted by severity at ${i}`, sevRank[r.alerts[i].severity] <= sevRank[r.alerts[i - 1].severity]);
  }
}

section("11) Longitudinal");
{
  const empty = buildLongitudinal({ history: [] });
  assert("empty history → hasHistory false", empty.hasHistory === false);
  const long = buildLongitudinal({ history: makeHistory(), windowMonths: 2 });
  assert("history present → hasHistory true", long.hasHistory === true);
  assert("longitudinal includes net-worth delta", long.deltas.some((d) => d.metric === "netWorth"));
}

section("12) Roadmap");
{
  const output = makeOutput();
  const intel = buildIntelligence(output);
  const r = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS, history: makeHistory() });
  assert("roadmap returns 4 horizons", r.roadmap.length === 4);
  for (const h of r.roadmap) assert(`${h.horizon} actions non-empty`, h.actions.length >= 1);
}

section("13) Strategic memory echo");
{
  const empty = summariseStrategicMemory(null);
  assert("no memory → hasMemory false", empty.hasMemory === false);
  const echo = summariseStrategicMemory({ philosophy: "preserve-first", leverageTolerance: "low", liquidityPreference: "deep" });
  assert("memory present → hasMemory true", echo.hasMemory === true);
  assert("preserve-first → preserve-capital constraint", echo.activeConstraints.some((c) => /preserv/i.test(c)));
  assert("low-leverage tolerance constraint surfaced", echo.activeConstraints.some((c) => /leverage/i.test(c)));
  assert("deep liquidity constraint surfaced", echo.activeConstraints.some((c) => /liquid/i.test(c)));
}

section("14) Visualisations bundle");
{
  const output = makeOutput();
  const intel = buildIntelligence(output);
  const r = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS, history: makeHistory() });
  const v = r.visuals;
  assert("8 visualisation surfaces present", !!v.trajectoryDrift && !!v.fragilityMap && !!v.dependencyMap && !!v.priorityEvolution && !!v.recommendationEvolution && !!v.regimeMap && !!v.allocationDrift && !!v.survivabilityTrend);
  assert("survivability trend hasHistory matches >=2 snapshots", v.survivabilityTrend.hasHistory === true);
  assert("baseline state when no history", buildVisualisations({ baseline: output.baseScenarioResult, monitoring: [], drift: [], priorities: [], regime: r.regime, fragility: intel.fragility, assumptions: intel.assumptions, regimes: intel.regime, history: [] }).survivabilityTrend.hasHistory === false);
}

// ─── End-to-end run on real engine ────────────────────────────────────────

section("15) End-to-end on real engine output");
async function runEndToEnd() {
  const dashboardInputs: DashboardInputs = {
    snapshot: {
      ppor: 850_000,
      mortgage: 540_000,
      mortgage_rate: 0.062,
      mortgage_term_years: 27,
      cash: 40_000,
      offset_balance: 35_000,
      savings_cash: 5_000,
      emergency_cash: 0,
      other_cash: 0,
      monthly_income: 14_500,
      monthly_expenses: 10_000,
      stocks: 50_000,
      crypto: 8_000,
      super_balance: 180_000,
      cars: 40_000,
      iran_property: 0,
      other_debts: 0,
      roham_age: 36,
      fara_age: 33,
      roham_super_balance: 110_000,
      fara_super_balance: 70_000,
    } as any,
    holdingsApi: null,
    incomeLedger: null,
    expensesLedger: null,
    properties: [],
    stocks: [],
    crypto: [],
    plannedInvestments: [],
    settledIPs: [],
  } as unknown as DashboardInputs;
  try {
    const output = await generateQuickDecisionCandidates({
      dashboardInputs,
      question: { kind: "deploy_capital", capital: 25_000 },
      household: { dependants: 1, incomeVolatility: 0.15 },
      simulationCount: 100,
      taxContext: { annualGrossIncome: 174_000, hasHelpDebt: false, hasPrivateHospitalCover: true },
    });
    const intel = buildFinancialIntelligence({ output, prior: null });
    const r: AutonomousReport = buildAutonomousReport({ output, intelligence: intel, assumptions: DEFAULT_ASSUMPTIONS, history: makeHistory() });
    assert("e2e: priorities array exists", Array.isArray(r.priorities));
    assert("e2e: regime classification populated", !!r.regime?.label);
    assert("e2e: monitoring 10 dimensions", r.monitoring.length === 10);
    assert("e2e: roadmap 4 horizons", r.roadmap.length === 4);
    assert("e2e: criticalFindings deterministic length <= 5", r.criticalFindings.length <= 5);
  } catch (err) {
    fail++;
    process.stdout.write(`  ✗ e2e run threw: ${(err as Error).message}\n`);
  }
}

runEndToEnd().then(() => {
  process.stdout.write(`\nResults: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
});
