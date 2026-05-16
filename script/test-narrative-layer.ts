/**
 * Family Wealth Lab — Narrative Layer Test Suite (narrative-layer-v1)
 *
 * Run with:  npm run test:narrative-layer
 *
 * What this proves:
 *
 *   1. Mandatory section order
 *      Sections render in: executive summary → what should I do → why →
 *      main risks → if ignored → action plan.
 *
 *   2. Simple-mode jargon purity
 *      No Simple-mode section body or summary contains tokens from
 *      QUANT_JARGON_WORDS (VaR, CVaR, Monte Carlo, P10/P50/P90, Sharpe,
 *      kurtosis, drawdown, percentile, volatility, DSR, LVR, etc.).
 *
 *   3. Advisor mode adds comparative & runner-up content.
 *
 *   4. Quant mode preserves full quant analytics — score derivation, raw
 *      probabilities (VaR/CVaR dollar values appear in the underlying engine
 *      output but the narrative shows variance / drawdown / VaR phrasing).
 *
 *   5. Confidence band is computed from winner–runner score gap.
 *
 *   6. Cautious fallback when engine returns zero ranked candidates.
 *
 *   7. End-to-end integration with the real engine (single small run) — the
 *      narrative layer accepts a real QuickDecisionOutput and the Simple
 *      mode output remains jargon-free.
 *
 * Exit 0 on all pass, 1 on any failure.
 */

import {
  buildNarrativeReport,
  findJargonLeaks,
  paraphraseForSimple,
  stripJargon,
  QUANT_JARGON_WORDS,
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
//
// We deliberately do NOT run the real engine here for the structural tests —
// the goal is to isolate the narrative translation layer from engine churn.
// The integration test at the bottom DOES run the real engine on a small
// healthy household to prove the narrative consumes a real output too.

function fakeCandidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    id: "winner",
    label: "Offset $50k + ETF DCA",
    shortLabel: "Offset+ETF",
    events: [],
    result: {
      // Only the fields the narrative reads.
      initialNetWorth: 800_000,
      terminalNwSamples: [],
      terminalCashSamples: [],
      terminalNwSorted: [900_000, 1_000_000, 1_100_000, 1_200_000, 1_350_000],
      cashFan: [] as any,
      medianNwPath: [],
      medianCashPath: [],
      negativeEquityProbability: 0.03,
      liquidityStressProbability: 0.22,
      refinancePressureProbability: 0.15,
      defaultProbability: 0.04,
      liquidityExhaustionProbability: 0.08,
      medianDefaultMonth: null,
      medianLiquidityFirstMonth: 36,
      medianNegEquityFirstMonth: null,
      sequenceDispersion: {} as any,
      terminalRates: [],
      maxDrawdownSamples: [],
      riskMetrics: {
        volatility: 0.18,
        downsideRisk: 0.12,
        leverageRisk: 0.62,
        liquidityRisk: 0.3,
        concentrationRisk: 0.2,
        riskAdjustedNw: 1_050_000,
        varDollars95: 75_000,
        cvarDollars95: 110_000,
        maxDrawdownMedian: 0.17,
        maxDrawdownP90: 0.28,
        rationale: ["Median drawdown ≈ 17%"],
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
      // Required by ScenarioResult (not deeply read by narrative).
      netWorthFan: [] as any,
    } as any,
    score: {
      score: 78,
      breakdown: {},
    } as any,
    trace: {
      assumptionsUsed: [],
      formulasInvoked: [],
      constraintsEvaluated: [],
      riskDrivers: [],
      timeline: [],
      scoreDerivation: [
        { axis: "survivalProbability", rawValue: 0.96, weight: 0.35, contribution: 33.6 },
        { axis: "liquidityFactor",     rawValue: 0.72, weight: 0.25, contribution: 18.0 },
        { axis: "riskAdjustedReturn",  rawValue: 0.072, weight: 0.20, contribution: 14.4 },
        { axis: "terminalNetWorth",    rawValue: 1_100_000, weight: 0.08, contribution: 8.8 },
      ],
    },
    headline: "Offsets your mortgage first, then dollar-cost-averages into ETFs.",
    rationale: [
      "It scored highest on the survival axis.",
      "Liquidity factor stays above 0.7 across the horizon.",
      "Risk-adjusted return is +7.2% per year.",
    ],
    softWarnings: [
      {
        id: "liquidity-thin",
        label: "Thin cash buffer in years 3-4",
        detail: "Median cash dips to ~$30k around month 36 before recovering.",
        severity: "warn",
        driver: "medianCashPath",
      },
    ],
    isHighRisk: false,
    ...overrides,
  } as RankedCandidate;
}

function fakeOutput(overrides: Partial<QuickDecisionOutput> = {}): QuickDecisionOutput {
  const winner = fakeCandidate();
  const runnerUp = fakeCandidate({
    id: "runner",
    label: "Lump-sum into ETF",
    score: { score: 71, breakdown: {} } as any,
  });
  return {
    question: "deploy_capital",
    capital: 50_000,
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
      winnerId: "winner",
      runnerUpId: "runner",
      whyWon: [
        "Higher survival probability than the runner-up.",
        "P50 terminal NW is $250k above the runner-up.",
        "Median drawdown is 6 percentage points smaller.",
      ],
      whatCouldInvalidate: [
        "If rates rise above 8.5%, refinance pressure exceeds DSR thresholds.",
        "A 20% property downturn in years 1-3 erodes the LVR safety margin.",
      ],
      secondPlaceAndWhy: "Lump-sum ETF wins on terminal NW but loses on liquidity.",
    },
    executionPlan: [
      {
        index: 0,
        label: "Months 0-3 · Setup",
        startMonth: "2026-05",
        endMonth: "2026-08",
        actions: [
          { event: "Move $50k into offset", effect: "Reduces interest by ~$3,250/yr." },
        ],
        rationale: "Front-load the safe action.",
      },
      {
        index: 1,
        label: "Months 4-24 · Build",
        startMonth: "2026-09",
        endMonth: "2028-05",
        actions: [
          { event: "Monthly DCA into ETF", effect: "$2,500/month into a diversified ETF." },
        ],
        rationale: "Behavioural smoothing.",
      },
    ],
    conditionalRecommendations: [
      {
        id: "rate-rise",
        trigger: "Variable rate rises above 8.5%",
        action: "Slow DCA to $1,000/month and rebuild buffer first",
        rationale: "Refinance pressure crosses warning band.",
        severity: "warn",
      },
    ],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

(async () => {
  section("1. Mandatory section order");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "simple");
    const ids = r.sections.map(s => s.id);
    assert(
      "Simple mode emits all six sections",
      r.sections.length === 6,
      `got ${r.sections.length}`,
    );
    assert(
      "Section order: executiveSummary, whatShouldIDo, whyEngineChoseThis, mainRisks, ifIgnored, actionPlan",
      JSON.stringify(ids) ===
        JSON.stringify([
          "executiveSummary",
          "whatShouldIDo",
          "whyEngineChoseThis",
          "mainRisks",
          "ifIgnored",
          "actionPlan",
        ]),
      ids.join(","),
    );
  }

  section("2. Simple-mode jargon purity");

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

  {
    // Even when engine emits "VaR/CVaR" phrasing in whyWon, Simple mode must paraphrase.
    const out = fakeOutput({
      comparativeNarrative: {
        winnerId: "winner",
        runnerUpId: "runner",
        whyWon: [
          "VaR₅ is $30k lower than the runner-up.",
          "CVaR₅ improves by $40k.",
          "P50 terminal NW is $200k above runner-up.",
        ],
        whatCouldInvalidate: ["Monte Carlo flagged 12% liquidity stress."],
        secondPlaceAndWhy: "Lump-sum has higher P90 but worse drawdown.",
      },
    });
    const r = buildNarrativeReport(out, "simple");
    const allText = r.sections
      .flatMap(s => [s.title, s.summary, ...s.body])
      .join(" \n ");
    const leaks = findJargonLeaks(allText);
    assert(
      "Simple-mode paraphrases jargon-heavy engine sentences",
      leaks.length === 0,
      leaks.length > 0 ? `leaked: ${leaks.join(", ")}` : "",
    );
  }

  section("3. Advisor mode — comparative & runner-up");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "advisor");
    const whyText = r.sections.find(s => s.id === "whyEngineChoseThis")!.body.join(" ");
    assert(
      "Advisor mode includes runner-up explanation",
      /runner-up/i.test(whyText),
    );
    const exec = r.sections.find(s => s.id === "executiveSummary")!.body.join(" ");
    assert(
      "Advisor exec summary references score / confidence",
      /score|confidence|profile/i.test(exec),
    );
  }

  section("4. Quant mode — preserves quant analytics");

  {
    const out = fakeOutput();
    const r = buildNarrativeReport(out, "quant");
    const whyText = r.sections.find(s => s.id === "whyEngineChoseThis")!.body.join(" ");
    assert(
      "Quant mode exposes score derivation (raw × weight)",
      /derivation/i.test(whyText) && /survivalProbability/i.test(whyText),
    );
    const risk = r.sections.find(s => s.id === "mainRisks")!.body.join(" ");
    assert(
      "Quant mode surfaces stress probability fields by name",
      /liquidityStressProbability|refinancePressureProbability|maxDrawdown/.test(risk),
    );
  }

  section("5. Confidence band from winner-runner gap");

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

  section("6. Cautious fallback when ranked is empty");

  {
    const empty = fakeOutput({ ranked: [] });
    const r = buildNarrativeReport(empty, "simple");
    assert("Empty ranked → 1 fallback section", r.sections.length === 1);
    assert(
      "Empty ranked → Simple narrative still jargon-free",
      findJargonLeaks(r.sections[0].summary).length === 0,
    );
    assert("Empty ranked → confidence=low", r.confidence === "low");
  }

  section("7. stripJargon / paraphraseForSimple helpers");

  {
    assert(
      "stripJargon: VaR/CVaR → worst-case loss",
      stripJargon("Reduce VaR by 20%; CVaR also drops.") ===
        "Reduce worst-case loss by 20%; worst-case loss also drops.",
    );
    assert(
      "stripJargon: percentile / P10 → outcome / bad-case",
      stripJargon("P10 fell below 10th percentile.").toLowerCase().includes("bad-case") &&
        stripJargon("P10 fell below 10th percentile.").toLowerCase().includes("outcome"),
    );
    assert(
      "paraphraseForSimple: too-jargony input → generic fallback",
      paraphraseForSimple("Kurtosis Sharpe Sortino alpha")
        .includes("balance of safety"),
    );
  }

  section("8. Action plan and risks adapt to data");

  {
    // High refinance pressure should produce a mortgage-pressure bullet.
    const out = fakeOutput({
      ranked: [
        fakeCandidate({
          result: {
            ...fakeCandidate().result,
            refinancePressureProbability: 0.40,
            liquidityStressProbability: 0.05,
            riskMetrics: {
              ...(fakeCandidate().result as any).riskMetrics,
              maxDrawdownMedian: 0.05,
              leverageRisk: 0.45,
            },
          } as any,
          softWarnings: [],
        }),
        fakeCandidate({ id: "r" }),
      ],
    });
    const r = buildNarrativeReport(out, "simple");
    const risks = r.sections.find(s => s.id === "mainRisks")!.body.join(" ");
    assert(
      "High refinance pressure surfaces a mortgage-pressure bullet (Simple)",
      /mortgage|loan|repayment/i.test(risks),
    );
    const actions = r.sections.find(s => s.id === "actionPlan")!.body.join("\n");
    assert(
      "Action plan renders engine phases as steps",
      /Step 1|Months 0/.test(actions),
    );
    assert(
      "Action plan includes conditional 'if X then Y' recommendation",
      /if .* then /i.test(actions),
    );
  }

  // ─── 9. End-to-end integration with the real engine ───────────────────────
  section("9. End-to-end with real engine output (Simple mode jargon-free)");

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
    const leaks = findJargonLeaks(allSimple);
    assert(
      "Simple narrative on REAL engine output is jargon-free",
      leaks.length === 0,
      leaks.length > 0 ? `leaked: ${leaks.join(", ")}` : "",
    );

    const advisorR = buildNarrativeReport(realOutput, "advisor");
    assert("Advisor mode emits all 6 mandatory sections on real output", advisorR.sections.length === 6);

    const quantR = buildNarrativeReport(realOutput, "quant");
    assert("Quant mode emits all 6 mandatory sections on real output", quantR.sections.length === 6);

    // Advanced analytics MUST remain accessible: verify the engine output still
    // contains the quant fields (VaR, CVaR, drawdown, terminalNwSorted) — they
    // are not destroyed, just hidden behind progressive disclosure in the UI.
    const w = realOutput.ranked[0];
    assert(
      "Engine output still carries VaR/CVaR/drawdown (preserved, not removed)",
      typeof w.result.riskMetrics.varDollars95 === "number" &&
        typeof w.result.riskMetrics.cvarDollars95 === "number" &&
        typeof w.result.riskMetrics.maxDrawdownMedian === "number",
    );
    assert(
      "Engine output still carries Monte-Carlo terminalNwSorted distribution",
      Array.isArray(w.result.terminalNwSorted) && w.result.terminalNwSorted.length > 0,
    );
  }

  process.stdout.write(`\n${pass} pass / ${fail} fail\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  process.stderr.write(`FATAL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
