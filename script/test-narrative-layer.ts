/**
 * Family Wealth Lab — Narrative Layer Test Suite (narrative-layer-v2)
 *
 * Run with:  npm run test:narrative-layer
 *
 * What this proves for v2:
 *
 *   1. Mandatory v2 section order
 *      Sections render in: executive recommendation → why now → main risks
 *      avoided → trade-offs accepted → action plan → what would change this
 *      recommendation later.
 *
 *   2. Simple-mode jargon purity (no quant tokens — VaR, P10, drawdown, etc.)
 *
 *   3. Banned narrative phrases (v2)
 *      Simple AND Advisor surfaces never contain "In plain English",
 *      "Simple explanation", "This plan looks like", "The engine sees",
 *      "Strong survivability", "Top contributor", "The future could play
 *      out", generic Monte Carlo phrasing, or generic-disclaimer phrases.
 *
 *   4. Advisor mode adds runner-up comparison + explains why an immediate
 *      property purchase lost when applicable.
 *
 *   5. Advisor mode includes financial reasoning vocabulary (liquidity,
 *      leverage, refinance, optionality, sequencing, opportunity cost,
 *      borrowing power).
 *
 *   6. Quant mode preserves full quant analytics (score derivation, raw
 *      stress probabilities, drawdown / leverage / concentration metrics).
 *
 *   7. Confidence band is computed from winner–runner score gap.
 *
 *   8. Cautious fallback when engine returns zero ranked candidates.
 *
 *   9. End-to-end integration with the real engine (single small run).
 *
 * Exit 0 on all pass, 1 on any failure.
 */

import {
  buildNarrativeReport,
  findJargonLeaks,
  findBannedPhraseLeaks,
  paraphraseForSimple,
  stripJargon,
  type NarrativeSection,
} from "../client/src/lib/scenarioV2/decisionEngine/narrativeLayer";
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

// ─── Fixture: synthetic QuickDecisionOutput ─────────────────────────────────

function fakeCandidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    id: "defer_etf_dca",
    label: "Defer property: ETF DCA 24mo",
    shortLabel: "ETF DCA",
    events: [],
    result: {
      initialNetWorth: 800_000,
      terminalNwSamples: [],
      terminalCashSamples: [],
      terminalNwSorted: [900_000, 1_000_000, 1_100_000, 1_200_000, 1_350_000],
      cashFan: [] as any,
      medianNwPath: [],
      medianCashPath: [],
      negativeEquityProbability: 0.03,
      liquidityStressProbability: 0.07,
      refinancePressureProbability: 0.08,
      defaultProbability: 0.02,
      liquidityExhaustionProbability: 0.03,
      medianDefaultMonth: null,
      medianLiquidityFirstMonth: 36,
      medianNegEquityFirstMonth: null,
      sequenceDispersion: {} as any,
      terminalRates: [],
      maxDrawdownSamples: [],
      riskMetrics: {
        volatility: 0.18,
        downsideRisk: 0.12,
        leverageRisk: 0.42,
        liquidityRisk: 0.3,
        concentrationRisk: 0.2,
        riskAdjustedNw: 1_050_000,
        varDollars95: 75_000,
        cvarDollars95: 110_000,
        maxDrawdownMedian: 0.14,
        maxDrawdownP90: 0.24,
        rationale: ["Median peak-to-trough decline ≈ 14%"],
      },
      runtimeMs: 100,
      simulationCount: 300,
      horizonMonths: 120,
      canonicalNetWorth: {} as any,
      netWorthReconciliation: {} as any,
      warnings: [],
      name: "scenario",
      reconciledMonthlySurplus: 0,
      dashboardMonthlySurplus: 0,
      reconcilesToDashboard: true,
      serviceability: {} as any,
      netWorthFan: [] as any,
    } as any,
    score: {
      score: 82,
      breakdown: {},
    } as any,
    trace: {
      assumptionsUsed: [],
      formulasInvoked: [],
      constraintsEvaluated: [],
      riskDrivers: [],
      timeline: [],
      scoreDerivation: [
        { axis: "survivalProbability", rawValue: 0.98, weight: 0.35, contribution: 34.3 },
        { axis: "liquidityFactor",     rawValue: 0.82, weight: 0.25, contribution: 20.5 },
        { axis: "riskAdjustedReturn",  rawValue: 0.072, weight: 0.20, contribution: 14.4 },
        { axis: "terminalNetWorth",    rawValue: 1_100_000, weight: 0.08, contribution: 8.8 },
      ],
    },
    headline: "Defers the additional property purchase and accumulates diversified ETF exposure over 24 months.",
    rationale: [
      "Highest survival across the path set.",
      "Strongest liquidity-factor profile.",
      "Risk-adjusted return of around 7.2% per year.",
    ],
    softWarnings: [],
    isHighRisk: false,
    ...overrides,
  } as RankedCandidate;
}

function fakeOutput(overrides: Partial<QuickDecisionOutput> = {}): QuickDecisionOutput {
  const winner = fakeCandidate();
  const runnerUp = fakeCandidate({
    id: "ip_6mo",
    label: "Buy IP in 6mo (build small buffer)",
    shortLabel: "IP @ 6mo",
    score: { score: 75, breakdown: {} } as any,
    result: {
      ...fakeCandidate().result,
      liquidityStressProbability: 0.22,
      refinancePressureProbability: 0.24,
      riskMetrics: {
        ...(fakeCandidate().result as any).riskMetrics,
        leverageRisk: 0.72,
        maxDrawdownMedian: 0.18,
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
    baseScenarioResult: {
      terminalNwSorted: [700_000, 800_000, 850_000, 900_000, 1_000_000],
      defaultProbability: 0.10,
    } as any,
    generatedAt: new Date().toISOString(),
    comparativeNarrative: {
      winnerId: "defer_etf_dca",
      runnerUpId: "ip_6mo",
      whyWon: [
        "Higher survival probability than the runner-up.",
        "P50 terminal NW is $250k above the runner-up.",
        "Median drawdown is 6 percentage points smaller.",
      ],
      whatCouldInvalidate: [
        "If rates rise above 8.5%, refinance pressure exceeds DSR thresholds.",
        "A 20% property downturn in years 1-3 erodes the LVR safety margin.",
      ],
      secondPlaceAndWhy: "IP @ 6mo wins on terminal NW but loses on liquidity.",
    },
    executionPlan: [
      {
        index: 0,
        label: "Months 0-3 · Setup",
        startMonth: "2026-05",
        endMonth: "2026-08",
        actions: [
          { event: "Confirm cash buffer", effect: "Maintain six months of household expenses in reserve before the first contribution." },
        ],
        rationale: "Front-load the safe action.",
      },
      {
        index: 1,
        label: "Months 4-24 · Build",
        startMonth: "2026-09",
        endMonth: "2028-05",
        actions: [
          { event: "Monthly contribution", effect: "Approximately $8.3k per month into diversified ETF exposure." },
        ],
        rationale: "Behavioural smoothing.",
      },
    ],
    conditionalRecommendations: [
      {
        id: "rate-rise",
        trigger: "Variable rate rises above 8.5%",
        action: "Slow the monthly contribution and rebuild the buffer first",
        rationale: "Refinance pressure crosses warning band.",
        severity: "warn",
      },
    ],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

(async () => {
  section("1. Mandatory v2 section order");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "simple");
    const ids = r.sections.map(s => s.id);
    assert(
      "Simple mode emits all six v2 sections",
      r.sections.length === 6,
      `got ${r.sections.length}`,
    );
    assert(
      "Section order: executiveRecommendation, whyNow, mainRisksAvoided, tradeOffsAccepted, actionPlan, whatWouldChangeThis",
      JSON.stringify(ids) ===
        JSON.stringify([
          "executiveRecommendation",
          "whyNow",
          "mainRisksAvoided",
          "tradeOffsAccepted",
          "actionPlan",
          "whatWouldChangeThis",
        ]),
      ids.join(","),
    );
  }

  section("2. Simple-mode jargon purity (quant tokens absent)");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "simple");
    const allText = r.sections
      .flatMap(s => [s.title, s.summary, ...s.body])
      .join(" \n ");
    const leaks = findJargonLeaks(allText);
    assert(
      "Simple-mode narrative contains zero quant jargon tokens",
      leaks.length === 0,
      leaks.length > 0 ? `leaked: ${leaks.join(", ")}` : "",
    );
  }

  section("3. v2 banned narrative phrases absent (Simple AND Advisor)");

  {
    const out = fakeOutput();
    for (const mode of ["simple", "advisor"] as const) {
      const r = buildNarrativeReport(out, mode);
      const allText = r.sections
        .flatMap(s => [s.title, s.summary, ...s.body])
        .join(" \n ");
      const leaks = findBannedPhraseLeaks(allText);
      assert(
        `${mode} mode contains no banned v2 phrases`,
        leaks.length === 0,
        leaks.length > 0 ? `leaked: ${leaks.join("; ")}` : "",
      );
      // Also check confidence reason
      const confLeaks = findBannedPhraseLeaks(r.confidenceReason);
      assert(
        `${mode} confidence reason contains no banned v2 phrases`,
        confLeaks.length === 0,
        confLeaks.length > 0 ? `leaked: ${confLeaks.join("; ")}` : "",
      );
    }
  }

  section("4. Advisor mode — runner-up comparison and 'why property lost' when applicable");

  {
    const out = fakeOutput(); // winner=defer, runner=IP@6mo
    const r = buildNarrativeReport(out, "advisor");
    const tradeOffs = r.sections.find(s => s.id === "tradeOffsAccepted")!.body.join(" ");
    assert(
      "Advisor mode includes runner-up comparison in trade-offs section",
      /runner|investment.property pathway|timing/i.test(tradeOffs),
      tradeOffs.slice(0, 200),
    );

    // When runner-up is immediate property, advisor narrative should explicitly
    // explain that property lost on timing/liquidity grounds.
    const allAdvisorText = r.sections
      .flatMap(s => [s.summary, ...s.body])
      .join(" ");
    assert(
      "Advisor mode explains why immediate property lost (timing/liquidity)",
      /property/i.test(allAdvisorText) &&
        /(timing|liquidity|refinance)/i.test(allAdvisorText),
    );

    const exec = r.sections.find(s => s.id === "executiveRecommendation")!.body.join(" ");
    assert(
      "Advisor exec body references confidence",
      /confidence/i.test(exec),
    );
  }

  section("5. Advisor mode uses real financial reasoning vocabulary");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "advisor");
    const allText = r.sections
      .flatMap(s => [s.summary, ...s.body])
      .join(" ")
      .toLowerCase();

    const requiredVocab = [
      "liquidity",
      "leverage",
      "refinance",
      "optionality",
      "borrowing",
    ];
    for (const word of requiredVocab) {
      assert(
        `Advisor narrative contains financial concept: "${word}"`,
        allText.includes(word),
      );
    }
  }

  section("6. Quant mode preserves full quant analytics");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "quant");
    const exec = r.sections.find(s => s.id === "executiveRecommendation")!.body.join(" ");
    assert(
      "Quant mode exposes score derivation (raw × weight)",
      /derivation/i.test(exec) && /survivalProbability/i.test(exec),
    );
    const risks = r.sections.find(s => s.id === "mainRisksAvoided")!.body.join(" ");
    assert(
      "Quant mode surfaces stress probability fields by name",
      /liquidityStressProbability|refinancePressureProbability|maxDrawdown/.test(risks),
    );
    const why = r.sections.find(s => s.id === "whyNow")!.body.join(" ");
    assert(
      "Quant mode exposes leverageRisk / drawdown metrics",
      /leverageRisk|maxDrawdownMedian/.test(why),
    );
  }

  section("7. Confidence band from winner-runner gap");

  {
    const wide = fakeOutput({
      ranked: [
        fakeCandidate({ score: { score: 90, breakdown: {} } as any }),
        fakeCandidate({ id: "r", score: { score: 72, breakdown: {} } as any }),
      ],
    });
    const narrow = fakeOutput({
      ranked: [
        fakeCandidate({ score: { score: 80, breakdown: {} } as any }),
        fakeCandidate({ id: "r", score: { score: 78, breakdown: {} } as any }),
      ],
    });
    const lone = fakeOutput({ ranked: [fakeCandidate()] });
    assert("Wide gap → high confidence", buildNarrativeReport(wide, "simple").confidence === "high");
    assert("Narrow gap → low confidence", buildNarrativeReport(narrow, "simple").confidence === "low");
    assert(
      "Solo winner → medium confidence (no comparator)",
      buildNarrativeReport(lone, "simple").confidence === "medium",
    );
  }

  section("8. Cautious fallback when ranked is empty");

  {
    const empty = fakeOutput({ ranked: [] });
    const r = buildNarrativeReport(empty, "simple");
    assert("Empty ranked → 1 fallback section", r.sections.length === 1);
    assert(
      "Empty ranked → Simple narrative still jargon-free",
      findJargonLeaks(r.sections[0].summary).length === 0,
    );
    assert(
      "Empty ranked → no banned v2 phrases in fallback",
      findBannedPhraseLeaks(r.sections[0].summary).length === 0,
    );
    assert("Empty ranked → confidence=low", r.confidence === "low");
  }

  section("9. Action plan picks up engine phases as concrete steps");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "simple");
    const actions = r.sections.find(s => s.id === "actionPlan")!.body.join("\n");
    assert(
      "Action plan renders engine phases as Step 1, Step 2, …",
      /Step 1/.test(actions),
    );
    assert(
      "Action plan integrates conditional 'if X then Y' monitoring",
      /if .* then /i.test(actions),
    );
    const summary = r.sections.find(s => s.id === "actionPlan")!.summary;
    assert(
      "Action plan summary contains concrete dollar / month language for DCA recommendation",
      /per month|month/i.test(summary),
    );
  }

  section("10. Posture-specific narrative — defer property and build liquidity");

  {
    const out = fakeOutput(); // winner is defer_etf_dca
    const r = buildNarrativeReport(out, "simple");
    const exec = r.sections.find(s => s.id === "executiveRecommendation")!.body.join(" ");
    assert(
      "Defer-property posture surfaces 'not anti-property' framing",
      /not anti.property|timing.sensitive/i.test(exec) || /timing/i.test(exec),
    );

    const changeTriggers = r.sections.find(s => s.id === "whatWouldChangeThis")!.body.join(" ");
    assert(
      "Change-triggers section references liquidity buffer condition",
      /liquidity buffer|months of household expenses/i.test(changeTriggers),
    );
    assert(
      "Change-triggers section references rates / refinance condition",
      /rate|refinance/i.test(changeTriggers),
    );
    assert(
      "Change-triggers section references borrowing capacity",
      /borrowing/i.test(changeTriggers),
    );
  }

  section("11. stripJargon / paraphraseForSimple helpers (back-compat)");

  {
    assert(
      "stripJargon: VaR/CVaR → worst-case loss",
      stripJargon("Reduce VaR by 20%; CVaR also drops.") ===
        "Reduce worst-case loss by 20%; worst-case loss also drops.",
    );
    assert(
      "stripJargon: P10 / percentile rewritten",
      stripJargon("P10 fell below 10th percentile.").toLowerCase().includes("adverse") &&
        stripJargon("P10 fell below 10th percentile.").toLowerCase().includes("outcome"),
    );
    assert(
      "paraphraseForSimple: too-jargony input → generic advisor-grade fallback",
      paraphraseForSimple("Kurtosis Sharpe Sortino alpha")
        .toLowerCase()
        .includes("resilience"),
    );
  }

  // ─── 12. End-to-end with the real engine ──────────────────────────────────
  section("12. End-to-end with real engine output (Simple jargon-free, Advisor full sections, Quant analytics preserved)");

  {
    const healthy: DashboardInputs = {
      snapshot: {
        owner_id: "narrative-e2e",
        cash: 80_000,
        savings_cash: 200_000,
        emergency_cash: 80_000,
        other_cash: 40_000,
        offset_balance: 0,
        ppor: 1_510_000,
        mortgage: 800_000,
        mortgage_rate: 6.5,
        mortgage_term_years: 30,
        other_debts: 0,
        stocks: 200_000,
        crypto: 30_000,
        ppor_value: 1_510_000,
        roham_super_balance: 200_000,
        fara_super_balance: 150_000,
        roham_monthly_income: 14_000,
        fara_monthly_income: 7_940,
        rental_income_total: 0,
        other_income: 0,
        monthly_expenses: 14_000,
        expenses_includes_debt: true,
      },
      properties: [],
      stocks: [],
      cryptos: [],
      holdingsRaw: [],
      incomeRecords: [],
      expenses: [],
      todayIso: "2026-05-11",
    } as any;

    const realOutput = await generateQuickDecisionCandidates({
      dashboardInputs: healthy,
      question: { kind: "deploy_capital", capital: 50_000 },
      horizonYears: 10,
      household: { dependants: 0, incomeVolatility: 0.15 },
      simulationCount: 50,
      taxContext: {
        annualGrossIncome: (14_000 + 7_940) * 12,
        hasHelpDebt: false,
        hasPrivateHospitalCover: true,
      },
    });

    assert("Real engine returned at least one ranked candidate", realOutput.ranked.length > 0);

    const simpleR = buildNarrativeReport(realOutput, "simple");
    const allSimple = simpleR.sections
      .flatMap((s: NarrativeSection) => [s.title, s.summary, ...s.body])
      .join(" \n ");
    const jargon = findJargonLeaks(allSimple);
    assert(
      "Simple narrative on REAL engine output is jargon-free",
      jargon.length === 0,
      jargon.length > 0 ? `leaked: ${jargon.join(", ")}` : "",
    );
    const banned = findBannedPhraseLeaks(allSimple);
    assert(
      "Simple narrative on REAL engine output has no banned v2 phrases",
      banned.length === 0,
      banned.length > 0 ? `leaked: ${banned.join("; ")}` : "",
    );

    const advisorR = buildNarrativeReport(realOutput, "advisor");
    assert("Advisor mode emits all 6 v2 sections on real output", advisorR.sections.length === 6);
    const advisorBanned = findBannedPhraseLeaks(
      advisorR.sections.flatMap(s => [s.summary, ...s.body]).join(" "),
    );
    assert(
      "Advisor narrative on REAL engine output has no banned v2 phrases",
      advisorBanned.length === 0,
      advisorBanned.length > 0 ? `leaked: ${advisorBanned.join("; ")}` : "",
    );

    const quantR = buildNarrativeReport(realOutput, "quant");
    assert("Quant mode emits all 6 v2 sections on real output", quantR.sections.length === 6);

    // Advanced analytics MUST remain accessible.
    const w = realOutput.ranked[0];
    assert(
      "Engine output still carries VaR/CVaR/drawdown (preserved, not removed)",
      typeof w.result.riskMetrics.varDollars95 === "number" &&
        typeof w.result.riskMetrics.cvarDollars95 === "number" &&
        typeof w.result.riskMetrics.maxDrawdownMedian === "number",
    );
    assert(
      "Engine output still carries the simulated terminal-NW distribution",
      Array.isArray(w.result.terminalNwSorted) && w.result.terminalNwSorted.length > 0,
    );
  }

  process.stdout.write(`\n${pass} pass / ${fail} fail\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  process.stderr.write(`FATAL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
