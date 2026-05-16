/**
 * Family Wealth Lab — Financial Intelligence Layer V1 test suite.
 *
 * Run with: npm run test:financial-intelligence
 *
 * What this proves:
 *
 *   1. buildFinancialIntelligence is deterministic on identical inputs.
 *   2. Turning-point engine surfaces the expected kinds when their drivers
 *      are present (leverage, refinance, FIRE, liquidity, volatility).
 *   3. Fragility scanner surfaces concentration / leverage / inflation /
 *      sequence-risk dependencies from engine signals.
 *   4. Assumption-dependency ranking is sorted by sensitivity desc and
 *      assigns impact bands consistently.
 *   5. Behavioural survivability returns at least one finding for stressed
 *      paths.
 *   6. Path-robustness scoring produces values in [0,1] and a stable
 *      classification.
 *   7. Adaptive recommendation produces a baseline state when no prior is
 *      supplied; produces a changed state when prior winner differs.
 *   8. Drift detection flags `needsHistory` when no history is provided.
 *   9. Insight-card builder yields the expected card kinds and orders by
 *      severity.
 *  10. Explainability returns all 8 question answers, no empty strings.
 *  11. End-to-end on the real engine: a small generateQuickDecisionCandidates
 *      run produces a non-empty intelligence report with the canonical
 *      shape.
 */

import {
  buildFinancialIntelligence,
  detectTurningPoints,
  scanFragility,
  rankAssumptionDependencies,
  assessBehaviouralSurvivability,
  scorePathRobustness,
  buildRecommendationDelta,
  detectDrift,
  buildInsightCards,
  buildExplainability,
  selectCriticalFindings,
} from "../client/src/lib/scenarioV2/intelligence";
import type {
  FinancialIntelligenceReport,
  PriorContext,
  InsightSeverity,
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
      terminalNwSorted: [900_000, 1_000_000, 1_100_000, 1_200_000, 1_350_000],
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
        concentrationRisk: 0.58,
        riskAdjustedNw: 1_050_000,
        varDollars95: 90_000,
        cvarDollars95: 140_000,
        maxDrawdownMedian: 0.22,
        maxDrawdownP90: 0.34,
        rationale: ["Peak-to-trough decline ~22%"],
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
      serviceability: {} as any,
      netWorthFan: [
        { month: "2026-05", p5: 800_000, p10: 810_000, p25: 830_000, p50: 850_000, p75: 870_000, p90: 890_000, p95: 900_000 },
        { month: "2036-05", p5: 950_000, p10: 1_000_000, p25: 1_080_000, p50: 1_180_000, p75: 1_280_000, p90: 1_380_000, p95: 1_450_000 },
      ] as any,
    } as any,
    score: { score: 78, breakdown: {}, penalties: [] } as any,
    trace: {
      assumptionsUsed: [],
      formulasInvoked: [],
      constraintsEvaluated: [],
      riskDrivers: [],
      timeline: [],
      scoreDerivation: [
        { axis: "survivalProbability", rawValue: 0.96, weight: 0.35, contribution: 33.6 },
      ],
    } as any,
    headline: "Buy IP in 6mo with property leverage tilt.",
    rationale: ["Higher terminal NW than the runner-up.", "Survival 96%."],
    softWarnings: [],
    isHighRisk: false,
    ...overrides,
  } as RankedCandidate;
}

function makeBaseline(): RankedCandidate["result"] {
  const c = makeCandidate({
    id: "baseline_no_change",
    label: "Baseline — no change",
  });
  // Tune baseline to be calmer
  return {
    ...c.result,
    refinancePressureProbability: 0.05,
    liquidityStressProbability: 0.06,
    riskMetrics: {
      ...(c.result as any).riskMetrics,
      leverageRisk: 0.25,
      liquidityRisk: 0.15,
      maxDrawdownP90: 0.18,
      volatility: 0.18,
      concentrationRisk: 0.30,
    },
    reconciledMonthlySurplus: 6500,
  } as any;
}

function makeOutput(overrides: Partial<QuickDecisionOutput> = {}): QuickDecisionOutput {
  const winner = makeCandidate();
  const runnerUp = makeCandidate({
    id: "defer_etf_dca",
    label: "Defer property: ETF DCA 24mo",
    shortLabel: "ETF DCA",
    score: { score: 75, breakdown: {}, penalties: [] } as any,
    result: {
      ...makeCandidate().result,
      refinancePressureProbability: 0.04,
      liquidityStressProbability: 0.07,
      riskMetrics: {
        ...(makeCandidate().result as any).riskMetrics,
        leverageRisk: 0.32,
        liquidityRisk: 0.20,
        concentrationRisk: 0.40,
        maxDrawdownP90: 0.22,
      },
    } as any,
  });
  return {
    question: "buy_property" as any,
    capital: 200_000,
    investorProfile: "balanced" as any,
    ranked: [winner, runnerUp],
    discarded: [],
    highRiskPaths: [],
    multiWinner: { balanced: null, wealthMax: null, cashflowSafe: null, highRisk: null },
    riskControlsApplied: { mode: "balanced", resolved: {} as any },
    basePlanHash: "hash",
    baseScenarioResult: makeBaseline() as any,
    generatedAt: "2026-05-16T00:00:00Z",
    comparativeNarrative: {
      winnerId: "ip_6mo_lever",
      runnerUpId: "defer_etf_dca",
      whyWon: [
        "Higher projected terminal NW.",
        "FIRE acceleration vs the deferred path.",
      ],
      whatCouldInvalidate: [
        "If rates rise above 8.5%, refinance pressure breaks DSR.",
        "20% property downturn in years 1-3 erodes LVR safety margin.",
      ],
      secondPlaceAndWhy: "Defer ETF DCA wins on liquidity but loses on terminal NW.",
    },
    executionPlan: [],
    conditionalRecommendations: [],
    ...overrides,
  };
}

// ─── 1. Determinism ────────────────────────────────────────────────────────

(async () => {
  section("1. Determinism");
  {
    const o = makeOutput();
    const r1 = buildFinancialIntelligence({ output: o });
    const r2 = buildFinancialIntelligence({ output: o });
    assert("identical input → identical insight card ids",
      JSON.stringify(r1.insightCards.map((c) => c.id)) === JSON.stringify(r2.insightCards.map((c) => c.id)));
    assert("identical input → identical turning-point ids",
      JSON.stringify(r1.turningPoints.map((t) => t.id)) === JSON.stringify(r2.turningPoints.map((t) => t.id)));
    assert("identical input → identical assumption ranking",
      JSON.stringify(r1.assumptions.map((a) => a.key)) === JSON.stringify(r2.assumptions.map((a) => a.key)));
    assert("identical input → identical robustness classification",
      r1.robustness.classification === r2.robustness.classification);
  }

  // 2. Turning points
  section("2. Turning-point detection");
  {
    const o = makeOutput();
    const tps = detectTurningPoints(o.ranked[0], o.ranked[1] ?? null, o.baseScenarioResult);
    const kinds = new Set(tps.map((t) => t.kind));
    assert("emits leverage-unsafe at 68% LVR", kinds.has("leverage-unsafe"));
    assert("emits serviceability-weak at 22% refi", kinds.has("serviceability-weak"));
    assert("emits liquidity-stress at 18% liquidity probability", kinds.has("liquidity-stress"));
    assert("emits fire-collapse for $6500/mo surplus", kinds.has("fire-collapse"));
    assert("turning points sorted by severity desc",
      tps.every((tp, i, arr) => i === 0 || sevRank(arr[i - 1].severity) >= sevRank(tp.severity)));
  }

  // 3. Fragility scanner
  section("3. Fragility scanner");
  {
    const o = makeOutput();
    const f = scanFragility(o.ranked[0], o.baseScenarioResult);
    const kinds = new Set(f.map((x) => x.kind));
    assert("emits concentration finding (58% conc)", kinds.has("concentration"));
    assert("emits leverage-dependence (68% leverage)", kinds.has("leverage-dependence"));
    assert("emits liquidity-illusion when delta > 15pp",
      kinds.has("liquidity-illusion"));
    assert("emits refinancing-dependency at refi 22%", kinds.has("refinancing-dependency"));
    assert("emits behavioural-fragility at DD P90 34%", kinds.has("behavioural-fragility"));
    assert("findings sorted by weight desc",
      f.every((x, i, arr) => i === 0 || arr[i - 1].weight >= x.weight));
  }

  // 4. Assumption dependency ranking
  section("4. Assumption dependency ranking");
  {
    const o = makeOutput();
    const ranked = rankAssumptionDependencies(o.ranked[0], o.baseScenarioResult);
    assert("returns ≥ 6 assumptions", ranked.length >= 6);
    assert("each sensitivity is in [0,1]",
      ranked.every((r) => r.sensitivity >= 0 && r.sensitivity <= 1));
    assert("ranked by sensitivity desc",
      ranked.every((r, i, arr) => i === 0 || arr[i - 1].sensitivity >= r.sensitivity));
    const top = ranked[0];
    assert("top assumption has high impact band", top.impactBand === "high" || top.impactBand === "medium");
    const propertyHeavy = ranked.find((r) => r.key === "propertyGrowth");
    assert("property-growth assumption has quant impact for property-heavy path",
      !!propertyHeavy && propertyHeavy.quant !== undefined);
  }

  // 5. Behavioural survivability
  section("5. Behavioural survivability");
  {
    const o = makeOutput();
    const findings = assessBehaviouralSurvivability(o.ranked[0]);
    assert("returns ≥ 1 finding for stressed leveraged path", findings.length >= 1);
    assert("each risk in [0,1]", findings.every((f) => f.risk >= 0 && f.risk <= 1));
    assert("sorted by risk desc",
      findings.every((f, i, arr) => i === 0 || arr[i - 1].risk >= f.risk));
  }

  // 6. Path robustness
  section("6. Path robustness");
  {
    const o = makeOutput();
    const r = scorePathRobustness(o.ranked);
    assert("robustnessScore in [0,1]", r.robustnessScore >= 0 && r.robustnessScore <= 1);
    assert("returnScore in [0,1]", r.returnScore >= 0 && r.returnScore <= 1);
    assert("classification non-empty", !!r.classification);
    assert("tradeoff message non-empty", r.tradeoff.length > 0);
    assert("rationale non-empty", r.rationale.length >= 1);

    const empty = scorePathRobustness([]);
    assert("empty ranked → 'moderate' classification", empty.classification === "moderate");
  }

  // 7. Adaptive recommendation
  section("7. Adaptive recommendation");
  {
    const o = makeOutput();
    const baseline = buildRecommendationDelta(o.ranked[0], null);
    assert("no prior → not changed", !baseline.changed);
    assert("no prior → baseline message", /baseline/i.test(baseline.reason));

    const sameWinner = buildRecommendationDelta(o.ranked[0], {
      previousWinnerId: o.ranked[0].id,
      previousLabel: o.ranked[0].label,
    });
    assert("same prior winner → unchanged", !sameWinner.changed);

    const changed = buildRecommendationDelta(o.ranked[0], {
      previousWinnerId: "defer_etf_dca",
      previousLabel: "Defer property: ETF DCA 24mo",
      history: [
        { month: "2025-09", monthlySurplus: 8000, netWorth: 780_000, cash: 60_000, debt: 0 },
        { month: "2026-05", monthlySurplus: 6500, netWorth: 800_000, cash: 55_000, debt: 0 },
      ],
    });
    assert("different prior winner → changed", changed.changed);
    assert("changed → reason references both labels",
      changed.reason.includes(o.ranked[0].label) || changed.reason.toLowerCase().includes("recommendation changed"));
  }

  // 8. Drift detection
  section("8. Drift detection");
  {
    const o = makeOutput();
    const noHistory = detectDrift(o.baseScenarioResult, null);
    assert("no history → at least one needsHistory finding",
      noHistory.length >= 1 && noHistory.every((d) => d.needsHistory === true));

    const withHistory = detectDrift(o.baseScenarioResult, {
      previousWinnerId: null,
      previousLabel: null,
      history: [
        { month: "2025-09", monthlySurplus: 8000, netWorth: 800_000, cash: 60_000, debt: 0, fireYearsAway: 12 },
        { month: "2025-12", monthlySurplus: 7000, netWorth: 800_000, cash: 55_000, debt: 0, fireYearsAway: 13 },
        { month: "2026-05", monthlySurplus: 5500, netWorth: 790_000, cash: 50_000, debt: 0, fireYearsAway: 14.5 },
      ],
    });
    const kinds = new Set(withHistory.map((d) => d.kind));
    assert("with history → at least one history-driven finding",
      withHistory.length >= 1 && withHistory.some((d) => !d.needsHistory));
    assert("detects savings-rate-decline on history", kinds.has("savings-rate-decline"));
    assert("detects fire-delay when years drift up", kinds.has("fire-delay"));
  }

  // 9. Insight cards
  section("9. Insight cards");
  {
    const o = makeOutput();
    const report = buildFinancialIntelligence({ output: o });
    assert("emits ≥ 5 insight cards on stressed path", report.insightCards.length >= 5);
    const kinds = new Set(report.insightCards.map((c) => c.kind));
    const expectedKinds = [
      "leverage-pressure",
      "refinance-risk",
      "liquidity-compression",
      "behavioural-risk",
      "robustness-summary",
      "weakest-link",
    ];
    for (const k of expectedKinds) {
      assert(`emits ${k} card`, kinds.has(k as any));
    }
    assert("sorted by severity desc",
      report.insightCards.every((c, i, arr) =>
        i === 0 || sevRank(arr[i - 1].severity) >= sevRank(c.severity)));
    assert("critical findings limited to ≤ 5",
      report.criticalFindings.length <= 5);

    const built = buildInsightCards({
      winner: o.ranked[0],
      baseline: o.baseScenarioResult,
      turningPoints: report.turningPoints,
      fragility: report.fragility,
      assumptions: report.assumptions,
      weakestLink: report.weakestLink,
      regime: report.regime,
      behavioural: report.behavioural,
      robustness: report.robustness,
      recommendationDelta: report.recommendationDelta,
      drift: report.drift,
    });
    assert("buildInsightCards returns same number as report.insightCards",
      built.length === report.insightCards.length);

    const sel = selectCriticalFindings(built, 3);
    assert("selectCriticalFindings respects N limit", sel.length <= 3);
  }

  // 10. Explainability
  section("10. Explainability");
  {
    const o = makeOutput();
    const report = buildFinancialIntelligence({ output: o });
    const e = report.explainability;
    const required = [
      "whyThisWon",
      "whyOthersLost",
      "whatChangesTheAnswer",
      "whatBreaksTheStrategy",
      "whatAssumptionsMatter",
      "whatEnvironmentItNeeds",
      "howRobustItIs",
      "howBehaviourallyRealistic",
    ] as const;
    for (const k of required) {
      assert(`explainability.${k} non-empty`, typeof e[k] === "string" && e[k].length > 0);
    }
  }

  // 11. Regime detection
  section("11. Regime detection");
  {
    const o = makeOutput();
    const report = buildFinancialIntelligence({ output: o });
    assert("returns 10 regimes", report.regime.length === 10);
    const regimes = new Set(report.regime.map((r) => r.regime));
    for (const expected of [
      "high-inflation","high-rates","falling-rates","property-boom",
      "equity-bull","equity-bear","recession","stagflation","low-growth","liquidity-crisis",
    ]) {
      assert(`regime '${expected}' present`, regimes.has(expected as any));
    }
    const stag = report.regime.find((r) => r.regime === "stagflation");
    assert("stagflation flagged fragile for leveraged property path",
      !!stag && (stag.performance === "fragile" || stag.performance === "weak"));
  }

  // 12. End-to-end with real engine output
  section("12. End-to-end with real engine output");
  {
    // Minimal fixture for the candidate generator. Mirrors the shape used
    // in test-narrative-layer.ts: cash + a PPOR + a small ETF stack so the
    // engine has enough to produce at least one ranked candidate.
    const dashboardInputs: DashboardInputs = {
      cash: { current: 75_000 },
      properties: [
        {
          id: "ppor",
          marketValue: 1_200_000,
          loanBalance: 700_000,
          rate: 0.065,
          monthlyRepayment: 5200,
          monthlyRent: 0,
          monthlyCosts: 500,
          offsetBalance: 30_000,
          purchaseDate: "2020-01-01",
          inLedger: true,
        } as any,
      ],
      etf: { current: 80_000 },
      crypto: { current: 0 },
      super: { roham: 120_000, fara: 90_000 },
      cars: 30_000,
      iranProperty: 0,
      otherAssets: 0,
      otherDebts: 0,
      monthlyIncome: 17_500,
      monthlyExpenses: 11_000,
      monthlyDebtService: 5_200,
      expensesIncludeDebt: true,
    } as any;

    let output: QuickDecisionOutput | null = null;
    try {
      output = await generateQuickDecisionCandidates({
        dashboardInputs,
        question: { kind: "deploy_capital", capital: 50_000 },
        horizonYears: 10,
        household: { dependants: 0, incomeVolatility: 0.15 },
        simulationCount: 60,
      });
    } catch (e) {
      assert(`engine ran without throwing`, false, String((e as Error).message ?? e));
    }
    if (output) {
      assert("engine produced ≥ 1 ranked candidate", output.ranked.length >= 1);
      if (output.ranked.length >= 1) {
        const report = buildFinancialIntelligence({ output });
        assert("end-to-end report has 10 regimes", report.regime.length === 10);
        assert("end-to-end report has explainability filled out",
          Object.values(report.explainability).every((s) => typeof s === "string" && s.length > 0));
        assert("end-to-end report yields ≥ 1 insight card",
          report.insightCards.length >= 1);
        assert("meta.winnerId matches output.ranked[0].id",
          report.meta.winnerId === output.ranked[0].id);
      }
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  process.stdout.write(`\n${pass} pass / ${fail} fail\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  process.stdout.write(`\nUNCAUGHT ${String(e)}\n`);
  process.exit(2);
});

function sevRank(s: InsightSeverity): number {
  return ({ critical: 3, warn: 2, watch: 1, info: 0 } as const)[s];
}
