/**
 * narrativeLayer.ts — Deterministic narrative translation layer.
 *
 * Sits ON TOP of the existing decision engine outputs (QuickDecisionOutput +
 * RankedCandidate). DOES NOT call AI, DOES NOT alter math. Pure function:
 * engine outputs in → plain-English advisor narrative out.
 *
 * The narrative adapts to:
 *   - liquidity stress (medianLiquidityFirstMonth, liquidityExhaustionProbability)
 *   - leverage (riskMetrics.leverageRisk)
 *   - risk profile (investorProfile, riskControlsApplied)
 *   - scenario winner + runner-up (ranked[0], ranked[1])
 *   - confidence (score axes spread vs runner-up)
 *   - mortgage / refinance pressure (refinancePressureProbability)
 *   - cashflow resilience (serviceability bands)
 *   - volatility exposure (riskMetrics.volatility, downsideRisk, maxDrawdownMedian)
 *
 * When a field is unavailable, the narrative uses cautious fallback language.
 */

import type {
  QuickDecisionOutput,
  RankedCandidate,
} from "./candidateGenerator";

export type NarrativeMode = "simple" | "advisor" | "quant";

/**
 * Curated banned-word list for Simple mode. The test suite asserts none of
 * these tokens appear in any Simple-mode narrative string.
 */
export const QUANT_JARGON_WORDS = [
  "VaR",
  "CVaR",
  "Monte Carlo",
  "Monte-Carlo",
  "Sharpe",
  "Sortino",
  "P10",
  "P50",
  "P90",
  "kurtosis",
  "skewness",
  "drawdown",
  "stochastic",
  "percentile",
  "volatility",
  "variance",
  "tail risk",
  "tail-risk",
  "DSR",
  "LVR",
  "NSR",
  "alpha",
  "beta",
  "CAGR",
];

export interface NarrativeSection {
  id:
    | "executiveSummary"
    | "whatShouldIDo"
    | "whyEngineChoseThis"
    | "mainRisks"
    | "ifIgnored"
    | "actionPlan";
  title: string;
  /** Headline summary sentence. */
  summary: string;
  /** Body bullet points / paragraphs. Strings are pre-formatted. */
  body: string[];
}

export interface NarrativeReport {
  mode: NarrativeMode;
  sections: NarrativeSection[];
  /** Whether the advanced analytics block should render below. */
  showAdvanced: boolean;
  /** Confidence label derived from score gap winner→runner-up. */
  confidence: "high" | "medium" | "low";
  /** Short why-this-confidence sentence. */
  confidenceReason: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pct(n: number, d = 0): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(d)}%`;
}

function moneyShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function bandToWord(prob: number): string {
  if (!Number.isFinite(prob)) return "unclear";
  if (prob >= 0.5) return "very likely";
  if (prob >= 0.25) return "likely";
  if (prob >= 0.10) return "possible";
  if (prob > 0) return "unlikely";
  return "very unlikely";
}

function confidenceFromGap(winner: number, runner: number | null): {
  level: "high" | "medium" | "low";
  reason: string;
} {
  if (runner === null) {
    return {
      level: "medium",
      reason: "Only one path passed safety checks, so there is no second-best to compare against.",
    };
  }
  const gap = winner - runner;
  if (gap >= 8) {
    return {
      level: "high",
      reason: `The top path scored ${gap.toFixed(0)} points above the next option, which is a clear margin.`,
    };
  }
  if (gap >= 3) {
    return {
      level: "medium",
      reason: `The top path scored only ${gap.toFixed(0)} points above the next option, so the choice is reasonable but not overwhelming.`,
    };
  }
  return {
    level: "low",
    reason: `The top path scored just ${gap.toFixed(0)} points above the next option — the two paths are nearly tied.`,
  };
}

// ─── section builders (mode-aware) ──────────────────────────────────────────

function buildExecutiveSummary(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  mode: NarrativeMode,
  confidence: ReturnType<typeof confidenceFromGap>,
): NarrativeSection {
  const survival = winner.trace.scoreDerivation.find(s => s.axis === "survivalProbability")?.rawValue ?? 0;
  const terminal = winner.trace.scoreDerivation.find(s => s.axis === "terminalNetWorth")?.rawValue ?? 0;
  const initialNw = winner.result.initialNetWorth ?? 0;
  const growthMultiple = initialNw > 0 ? terminal / initialNw : 0;

  const summary =
    mode === "simple"
      ? `Based on your current situation, the strongest plan is ${winner.label}.`
      : `Winner: ${winner.label}. Score ${winner.score.score.toFixed(0)}/100; confidence ${confidence.level}.`;

  const body: string[] = [];

  if (mode === "simple") {
    body.push(
      `In plain English: this plan looks like the best fit because it grows your money to about ${moneyShort(terminal)} while keeping you safe ${pct(survival, 0)} of the time the future could play out.`,
    );
    if (growthMultiple >= 1.5) {
      body.push(
        `That is roughly ${growthMultiple.toFixed(1)}× what you have today — a meaningful improvement.`,
      );
    } else if (growthMultiple >= 1.0) {
      body.push(
        `That keeps your wealth growing, though gains are modest — preservation matters more than aggressive gains here.`,
      );
    } else {
      body.push(
        `Note: this plan still leaves you below where you started in the median case. It is the best of the options, but the situation is challenging — review the action plan carefully.`,
      );
    }
    body.push(confidence.reason);
  } else if (mode === "advisor") {
    body.push(
      `Score breakdown: survival ${pct(survival, 0)}, terminal wealth around ${moneyShort(terminal)} (median path).`,
    );
    body.push(
      `Ranked under the ${output.investorProfile.replace(/_/g, " ")} profile against ${output.ranked.length} survivors.`,
    );
    body.push(confidence.reason);
  } else {
    // quant
    body.push(
      `Composite score ${winner.score.score.toFixed(2)} (axes: survivalProbability ${survival.toFixed(3)}, terminalNetWorth ${moneyShort(terminal)}).`,
    );
    body.push(
      `Profile: ${output.investorProfile}. Risk mode: ${output.riskControlsApplied.mode}. n=${output.ranked.length} ranked, ${output.discarded.length} discarded.`,
    );
    body.push(confidence.reason);
  }

  return {
    id: "executiveSummary",
    title: "Executive summary",
    summary,
    body,
  };
}

function buildWhatShouldIDo(
  winner: RankedCandidate,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    mode === "simple"
      ? `Pick the ${winner.label} plan and follow the step-by-step action plan below.`
      : `Adopt: ${winner.label}.`;

  const body: string[] = [];
  body.push(mode === "simple" ? paraphraseForSimple(winner.headline) : winner.headline);

  // Use ranked rationale as deeper "what to do" lines
  if (mode !== "simple" && winner.rationale?.length) {
    for (const line of winner.rationale.slice(0, 4)) {
      body.push(line);
    }
  } else if (mode === "simple" && winner.rationale?.length) {
    // Always run rationale through the Simple-mode paraphraser, then drop any
    // lines that still leak banned tokens (defence in depth).
    const filtered = winner.rationale
      .map(line => paraphraseForSimple(line))
      .filter(line => findJargonLeaks(line).length === 0)
      .slice(0, 3);
    for (const line of filtered) body.push(line);
  }

  return {
    id: "whatShouldIDo",
    title: "What should I do?",
    summary,
    body,
  };
}

function buildWhyEngineChoseThis(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  mode: NarrativeMode,
): NarrativeSection {
  const whyWon = output.comparativeNarrative.whyWon ?? [];
  const summary =
    mode === "simple"
      ? `This option came out on top because it balanced growth with safety better than the other options.`
      : `Engine ranked ${winner.label} first against ${output.ranked.length - 1} other survivors.`;

  const body: string[] = [];

  if (mode === "simple") {
    // Simple mode: convert engine "whyWon" sentences and strip jargon. If a
    // line contains banned words, paraphrase generically.
    const safeLines = whyWon
      .map(line => paraphraseForSimple(line))
      .filter(Boolean);
    if (safeLines.length === 0) {
      body.push(
        `The other plans either grew slower, took on more risk, or were more likely to run into cash-flow trouble along the way.`,
      );
    } else {
      for (const line of safeLines.slice(0, 4)) body.push(line);
    }
    if (output.comparativeNarrative.secondPlaceAndWhy) {
      body.push(
        `The second-best option was a close call but lost on either safety, growth, or cash-flow comfort.`,
      );
    }
  } else if (mode === "advisor") {
    for (const line of whyWon.slice(0, 6)) body.push(line);
    if (output.comparativeNarrative.secondPlaceAndWhy) {
      body.push(`Runner-up: ${output.comparativeNarrative.secondPlaceAndWhy}`);
    }
  } else {
    // quant — include score derivation
    for (const line of whyWon) body.push(line);
    if (output.comparativeNarrative.secondPlaceAndWhy) {
      body.push(`Runner-up: ${output.comparativeNarrative.secondPlaceAndWhy}`);
    }
    body.push(
      `Score derivation (raw × weight = contribution): ` +
        winner.trace.scoreDerivation
          .map(s => `${s.axis} ${s.rawValue.toFixed(3)}×${s.weight.toFixed(2)}=${s.contribution.toFixed(3)}`)
          .join("; "),
    );
  }

  return {
    id: "whyEngineChoseThis",
    title: "Why did the engine choose this?",
    summary,
    body,
  };
}

function buildMainRisks(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  mode: NarrativeMode,
): NarrativeSection {
  const r = winner.result;
  const liquidity = r.liquidityStressProbability ?? 0;
  const refi = r.refinancePressureProbability ?? 0;
  const liqExh = r.liquidityExhaustionProbability ?? 0;
  const negEq = r.negativeEquityProbability ?? 0;
  const drawdownMed = r.riskMetrics?.maxDrawdownMedian ?? 0;
  const leverage = r.riskMetrics?.leverageRisk ?? 0;

  const summary =
    mode === "simple"
      ? `Every plan has risks. Here are the main ones for this option, in plain English.`
      : `Top stress drivers identified by the engine.`;

  const body: string[] = [];

  // Liquidity
  if (liqExh > 0.05 || liquidity > 0.15) {
    if (mode === "simple") {
      body.push(
        `Cash crunch risk: there is a ${bandToWord(Math.max(liqExh, liquidity))} chance your cash buffer gets thin during this plan. Keep a rainy-day fund untouched.`,
      );
    } else if (mode === "advisor") {
      body.push(
        `Liquidity: cash exhaustion ${pct(liqExh, 1)}, liquidity stress ${pct(liquidity, 1)}. Maintain ≥6 months of expenses in reserve.`,
      );
    } else {
      body.push(
        `Liquidity stress: P(cash≤0) = ${liqExh.toFixed(3)}, liquidityStressProbability = ${liquidity.toFixed(3)}, leverageRisk = ${leverage.toFixed(3)}.`,
      );
    }
  }

  // Mortgage / refinance pressure
  if (refi > 0.10) {
    if (mode === "simple") {
      body.push(
        `Mortgage pressure: ${bandToWord(refi)} that your loan repayments get squeezed if interest rates rise. Have a plan if your repayment jumps 1–2 points.`,
      );
    } else if (mode === "advisor") {
      body.push(
        `Refinance pressure: ${pct(refi, 1)} of simulated futures hit the engine's mortgage-stress band.`,
      );
    } else {
      body.push(
        `refinancePressureProbability = ${refi.toFixed(3)}; negativeEquityProbability = ${negEq.toFixed(3)}.`,
      );
    }
  }

  // Volatility / drawdown
  if (drawdownMed > 0.15) {
    if (mode === "simple") {
      body.push(
        `Bumpy ride: in a typical scenario your wealth could fall by around ${pct(drawdownMed, 0)} at some point before recovering. That is normal — but only if you can hold your nerve.`,
      );
    } else if (mode === "advisor") {
      body.push(
        `Median peak-to-trough decline ≈ ${pct(drawdownMed, 0)}; downside-skewed paths may exceed this.`,
      );
    } else {
      body.push(
        `maxDrawdownMedian = ${drawdownMed.toFixed(3)}, maxDrawdownP90 = ${(r.riskMetrics?.maxDrawdownP90 ?? 0).toFixed(3)}.`,
      );
    }
  }

  // Leverage
  if (leverage > 0.60) {
    if (mode === "simple") {
      body.push(
        `High borrowing: this plan uses borrowed money to amplify returns, which works both ways. If property values fall, losses are larger.`,
      );
    } else if (mode === "advisor") {
      body.push(
        `Portfolio LVR on median final state ≈ ${pct(leverage, 0)} — above the comfort band of 60%.`,
      );
    } else {
      body.push(
        `leverageRisk (loan/property on median terminal) = ${leverage.toFixed(3)}.`,
      );
    }
  }

  // Soft warnings from engine
  for (const sw of winner.softWarnings ?? []) {
    if (mode === "simple") {
      body.push(`${sw.label}: ${stripJargon(sw.detail)}`);
    } else {
      body.push(`${sw.label}: ${sw.detail}`);
    }
  }

  // Fallback if no risks surfaced
  if (body.length === 0) {
    body.push(
      mode === "simple"
        ? `No major red flags surfaced for this plan — but every future is uncertain, so the action plan below includes safety steps.`
        : `No high-severity stress drivers exceeded the alert thresholds for this candidate.`,
    );
  }

  return {
    id: "mainRisks",
    title: "What are the main risks?",
    summary,
    body,
  };
}

function buildIfIgnored(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  mode: NarrativeMode,
): NarrativeSection {
  const baseTerminal = output.baseScenarioResult?.terminalNwSorted
    ? median(output.baseScenarioResult.terminalNwSorted)
    : null;
  const winnerTerminal = median(winner.result.terminalNwSorted);
  const gap =
    baseTerminal !== null && Number.isFinite(baseTerminal)
      ? winnerTerminal - baseTerminal
      : null;
  const baseSurvival = output.baseScenarioResult
    ? 1 - (output.baseScenarioResult.defaultProbability ?? 0)
    : null;

  const summary =
    mode === "simple"
      ? `If you do nothing different, here is what the engine sees happening.`
      : `Counterfactual: keep base plan (no winning-path actions taken).`;

  const body: string[] = [];

  if (gap !== null && gap > 0) {
    if (mode === "simple") {
      body.push(
        `Doing nothing leaves about ${moneyShort(gap)} of growth on the table over your horizon, compared to acting on this plan.`,
      );
    } else if (mode === "advisor") {
      body.push(
        `Median terminal NW gap vs base plan: +${moneyShort(gap)} for the winning path.`,
      );
    } else {
      body.push(
        `ΔP50(NW_T) = ${moneyShort(gap)} (winner.terminal − base.terminal).`,
      );
    }
  } else if (gap !== null && gap < 0) {
    if (mode === "simple") {
      body.push(
        `Interestingly, doing nothing produces a slightly better median outcome — but usually at the cost of higher risk. Check the safety numbers above.`,
      );
    } else {
      body.push(
        `Median terminal NW gap vs base plan: ${moneyShort(gap)} (base plan grows more in the median path).`,
      );
    }
  } else {
    body.push(
      mode === "simple"
        ? `The engine could not estimate the cost of inaction precisely — but the action plan below still applies.`
        : `Base-plan terminal NW unavailable; cannot quantify inaction cost.`,
    );
  }

  if (baseSurvival !== null && baseSurvival < 0.85) {
    if (mode === "simple") {
      body.push(
        `Doing nothing also exposes you to more downside scenarios — the base plan only survives in about ${pct(baseSurvival, 0)} of futures.`,
      );
    } else if (mode === "advisor") {
      body.push(`Base-plan survival probability: ${pct(baseSurvival, 0)}.`);
    } else {
      body.push(
        `base.survivalProbability = ${baseSurvival.toFixed(3)}; winner.survivalProbability = ${
          (1 - (winner.result.defaultProbability ?? 0)).toFixed(3)
        }.`,
      );
    }
  }

  // Engine "whatCouldInvalidate" lines belong here too — they are what would
  // make ignoring this plan more painful.
  const inv = output.comparativeNarrative.whatCouldInvalidate ?? [];
  for (const line of inv.slice(0, 3)) {
    body.push(mode === "simple" ? paraphraseForSimple(line) : line);
  }

  return {
    id: "ifIgnored",
    title: "What happens if I ignore this?",
    summary,
    body,
  };
}

function buildActionPlan(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    mode === "simple"
      ? `Concrete next steps, in order.`
      : `Phased execution plan derived from the winning candidate's events.`;

  const body: string[] = [];
  const phases = output.executionPlan ?? [];

  if (phases.length === 0) {
    body.push(
      mode === "simple"
        ? `Step 1 — Talk to your accountant / financial planner before moving any money.`
        : `No phased plan emitted by the engine for this candidate (events list may be empty).`,
    );
    body.push(
      mode === "simple"
        ? `Step 2 — Make sure you have at least 6 months of living expenses in cash before starting.`
        : `Recommendation: ensure ≥6 months expense buffer; verify household serviceability.`,
    );
    body.push(
      mode === "simple"
        ? `Step 3 — Review this plan again in 12 months, or sooner if your income or interest rates change.`
        : `Schedule a re-run when ledger updates or market regime shifts.`,
    );
  } else {
    phases.forEach((p, i) => {
      const head =
        mode === "simple"
          ? `Step ${i + 1} — ${plainLabel(p.label)}`
          : `Phase ${i + 1} — ${p.label}`;
      body.push(head);
      for (const a of p.actions) {
        body.push(
          mode === "simple"
            ? `  • ${plainLabel(a.event)}: ${stripJargon(a.effect)}`
            : `  • ${a.event}: ${a.effect}`,
        );
      }
    });
  }

  // Conditional recommendations
  const recs = output.conditionalRecommendations ?? [];
  if (recs.length > 0) {
    body.push("");
    body.push(
      mode === "simple"
        ? `Things to watch for, and what to do if they happen:`
        : `Conditional / event-driven recommendations:`,
    );
    for (const r of recs.slice(0, 5)) {
      body.push(
        mode === "simple"
          ? `  • If ${stripJargon(r.trigger)}, then ${stripJargon(r.action)}.`
          : `  • If ${r.trigger} → ${r.action}.`,
      );
    }
  }

  return {
    id: "actionPlan",
    title: "Step-by-step action plan",
    summary,
    body,
  };
}

// ─── helpers for Simple mode language ───────────────────────────────────────

/**
 * Replaces engine-style jargon with plain-English equivalents. Keeps the
 * sentence's meaning intact. Used in Simple mode only.
 */
export function stripJargon(s: string): string {
  if (!s) return "";
  let out = s;
  const replacements: [RegExp, string][] = [
    [/\bMonte[\s-]?Carlo\b/gi, "stress test"],
    [/\bVaR\d*\b/gi, "worst-case loss"],
    [/\bCVaR\d*\b/gi, "worst-case loss"],
    [/\bP10\b/gi, "the bad-case path"],
    [/\bP50\b/gi, "the typical path"],
    [/\bP90\b/gi, "the good-case path"],
    [/\b\d+(?:st|th|nd|rd)?\s+percentile\b/gi, "outcome"],
    [/\bpercentile\b/gi, "outcome"],
    [/\bkurtosis\b/gi, "rare-event sensitivity"],
    [/\bskewness\b/gi, "outcome lean"],
    [/\bmax(?:imum)?\s+drawdown\b/gi, "biggest dip"],
    [/\bdrawdown\b/gi, "dip"],
    [/\bstochastic\b/gi, "stress"],
    [/\bvolatility\b/gi, "ups and downs"],
    [/\bvariance\b/gi, "spread"],
    [/\btail[-\s]?risk\b/gi, "rare bad outcome"],
    [/\bDSR\b/gi, "debt-to-income"],
    [/\bLVR\b/gi, "loan-to-value"],
    [/\bNSR\b/gi, "loan-affordability"],
    [/\bCAGR\b/gi, "yearly return"],
    [/\bSharpe\b/gi, "risk-adjusted return"],
    [/\bSortino\b/gi, "downside-adjusted return"],
    [/\balpha\b/gi, "edge"],
    [/\bbeta\b/gi, "market sensitivity"],
  ];
  for (const [re, rep] of replacements) {
    out = out.replace(re, rep);
  }
  return out;
}

/**
 * Paraphrases an engine-emitted explanation sentence into a Simple-mode-safe
 * form. If the original contained too much jargon to safely strip, returns
 * a generic plain-English fallback.
 */
export function paraphraseForSimple(s: string): string {
  if (!s) return "";
  // Count jargon hits in the ORIGINAL string. A sentence with 3+ jargon
  // tokens is too quant-coded to safely paraphrase word-by-word — return
  // the generic fallback so the meaning survives even if specifics don't.
  const originalLeaks = findJargonLeaks(s);
  if (originalLeaks.length >= 3) {
    return "It scored better on a balance of safety, growth and cash-flow comfort.";
  }
  const stripped = stripJargon(s);
  // Belt-and-braces: if stripping left any banned token behind, also fall back.
  if (findJargonLeaks(stripped).length > 0) {
    return "It scored better on a balance of safety, growth and cash-flow comfort.";
  }
  return stripped;
}

function plainLabel(s: string): string {
  // Cosmetic clean-up: replace underscores and acronyms commonly emitted by the
  // engine in event labels.
  return stripJargon(s.replace(/_/g, " "));
}

function median(sorted: number[] | undefined): number {
  if (!sorted || sorted.length === 0) return NaN;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Build the full narrative report for a QuickDecisionOutput in the given mode.
 * Deterministic and side-effect free.
 */
export function buildNarrativeReport(
  output: QuickDecisionOutput,
  mode: NarrativeMode,
): NarrativeReport {
  const winner = output.ranked[0];
  if (!winner) {
    return {
      mode,
      sections: [
        {
          id: "executiveSummary",
          title: "Executive summary",
          summary:
            mode === "simple"
              ? "No safe path was found for these inputs. Try a different amount, horizon, or risk setting."
              : "Engine returned zero ranked candidates under the current constraints.",
          body: [],
        },
      ],
      showAdvanced: false,
      confidence: "low",
      confidenceReason: "No candidates survived the safety filter.",
    };
  }

  const runnerScore = output.ranked[1]?.score.score ?? null;
  const conf = confidenceFromGap(winner.score.score, runnerScore);

  const sections: NarrativeSection[] = [
    buildExecutiveSummary(output, winner, mode, conf),
    buildWhatShouldIDo(winner, mode),
    buildWhyEngineChoseThis(output, winner, mode),
    buildMainRisks(output, winner, mode),
    buildIfIgnored(output, winner, mode),
    buildActionPlan(output, winner, mode),
  ];

  return {
    mode,
    sections,
    showAdvanced: true,
    confidence: conf.level,
    confidenceReason: conf.reason,
  };
}

/**
 * Test/QA helper: returns the list of jargon tokens that appear in the
 * provided text. Used by the simple-mode purity test to assert zero
 * leakage.
 */
export function findJargonLeaks(text: string, extra: string[] = []): string[] {
  const list = [...QUANT_JARGON_WORDS, ...extra];
  const found = new Set<string>();
  for (const w of list) {
    const re = new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) found.add(w);
  }
  return Array.from(found);
}
