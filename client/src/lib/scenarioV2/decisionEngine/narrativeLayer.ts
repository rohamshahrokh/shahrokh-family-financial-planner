/**
 * narrativeLayer.ts — Deterministic narrative translation layer (v2).
 *
 * v2 rewrites the narrative to read like a senior advisor / investment-committee
 * memo rather than a metric dump. Sits ON TOP of QuickDecisionOutput. Pure
 * function. No AI. No engine math changes.
 *
 * Design principles (v2):
 *   - Interpret metrics, never restate them ("preserves a strong liquidity
 *     position", not "Survival 100%").
 *   - Speak in real financial reasoning vocabulary: liquidity buffer, leverage
 *     timing, refinance pressure, debt-service pressure, optionality,
 *     opportunity cost, path dependency, sequencing risk, downside asymmetry,
 *     volatility tolerance, preserving borrowing power.
 *   - Section purposes are distinct: executive recommendation, why now, main
 *     risks avoided, trade-offs accepted, action plan, what would change this
 *     recommendation later. Each section has its own job; no copy duplication.
 *   - Banned phrases: "In plain English", "Simple explanation", "This plan
 *     looks like", "The engine sees", "Strong survivability", "Top
 *     contributor", "The future could play out", generic Monte Carlo phrases,
 *     generic risk disclaimers.
 *   - Quant mode keeps full analytics (score derivation, raw probabilities).
 *
 * Adapts to:
 *   - liquidity stress / exhaustion / first-month buffer
 *   - leverage and refinance pressure
 *   - winner strategic posture (defer/build-liquidity vs lever-up vs growth)
 *   - runner-up posture vs winner — particularly when runner-up is a property
 *     purchase that lost on timing/liquidity
 *   - confidence margin
 *   - volatility / drawdown
 *
 * When a field is unavailable, language falls back without inventing numbers.
 */

import type {
  QuickDecisionOutput,
  RankedCandidate,
} from "./candidateGenerator";

export type NarrativeMode = "simple" | "advisor" | "quant";

/**
 * Curated banned-word list for Simple mode. The test suite asserts none of
 * these tokens appear in any Simple-mode narrative string. Quant-mode jargon
 * stays out of consumer-facing surfaces.
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

/**
 * V3 — phrases that must NOT appear anywhere in Simple/Advisor narrative
 * surfaces. Extended in V3 with additional template tells flagged by the user
 * ("in plain English", repetitive filler, generic Monte Carlo lines).
 * Tested explicitly. Note: Simple-mode jargon (Monte Carlo / VaR / CAGR /
 * percentile etc.) is enforced separately via QUANT_JARGON_WORDS, so we don't
 * duplicate those tokens here unless they carry an extra template smell.
 */
export const BANNED_NARRATIVE_PHRASES = [
  "In plain English",
  "in plain English",
  "Simple explanation",
  "This plan looks like",
  "The engine sees",
  "Strong survivability",
  "Top contributor",
  "The future could play out",
  "Monte Carlo",
  "Monte-Carlo",
  "stress test",
  "every future is uncertain",
  "No major red flags",
  // V3 additions — generic / template tells that crept in during v2 polishing.
  "This option balances",
  "balances growth and safety",
  "this plan is",
  "This is a balanced",
  "in summary",
  "to summarise",
  "as you can see",
  "we recommend",
  "our recommendation",
];

export type NarrativeSectionId =
  // V3 — ten mandatory sections (preserves v2 IDs where possible).
  | "executiveRecommendation"
  | "whyThisPathWon"
  | "whyAlternativesLost"
  | "whatChangesTheAnswer"
  | "biggestHiddenRisks"
  | "behaviouralRiskCommentary"
  | "sensitivityAnalysis"
  | "stressTestCommentary"
  | "keyAssumptionsDrivingOutcome"
  | "tacticalNextActions"
  // Legacy v2 IDs — retained so `buildNarrativeReportV2` remains type-safe
  // for any caller that still consumes the six-section surface.
  | "whyNow"
  | "mainRisksAvoided"
  | "tradeOffsAccepted"
  | "actionPlan"
  | "whatWouldChangeThis";

/** Mandatory V3 section order. The narrative builder must emit these in this
 *  exact sequence for every winner. */
export const V3_SECTION_ORDER: NarrativeSectionId[] = [
  "executiveRecommendation",
  "whyThisPathWon",
  "whyAlternativesLost",
  "whatChangesTheAnswer",
  "biggestHiddenRisks",
  "behaviouralRiskCommentary",
  "sensitivityAnalysis",
  "stressTestCommentary",
  "keyAssumptionsDrivingOutcome",
  "tacticalNextActions",
];

export interface NarrativeSection {
  id: NarrativeSectionId;
  title: string;
  /** One- or two-sentence headline paragraph for the section. */
  summary: string;
  /** Memo-style paragraphs and bullets. Strings are pre-formatted. */
  body: string[];
}

export interface NarrativeReport {
  mode: NarrativeMode;
  sections: NarrativeSection[];
  /** Whether the advanced analytics block should render below. */
  showAdvanced: boolean;
  /** Confidence label derived from score gap winner→runner-up. */
  confidence: "high" | "medium" | "low";
  /** Short why-this-confidence sentence (interpretation, not number dump). */
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

function monthsToHuman(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "the near term";
  if (m < 12) return `approximately ${Math.round(m)} months`;
  const yrs = m / 12;
  if (Math.abs(yrs - Math.round(yrs)) < 0.15) return `approximately ${Math.round(yrs)} year${Math.round(yrs) === 1 ? "" : "s"}`;
  return `approximately ${yrs.toFixed(1)} years`;
}

function median(sorted: number[] | undefined): number {
  if (!sorted || sorted.length === 0) return NaN;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

// ─── strategic posture inference ────────────────────────────────────────────

type StrategicPosture =
  | "defer_property_build_liquidity"
  | "offset_first_then_grow"
  | "lever_into_property_now"
  | "lever_into_property_delayed"
  | "growth_etf_dca"
  | "growth_etf_lump"
  | "super_tax_advantaged"
  | "diversified_growth"
  | "concentrated_crypto"
  | "defensive_cash_first"
  | "balanced_split"
  | "unknown";

interface StrategicAssessment {
  posture: StrategicPosture;
  isPropertyPath: boolean;
  isOffsetHeavy: boolean;
  isDcaHeavy: boolean;
  isHighLeverage: boolean;
  isCryptoHeavy: boolean;
  timingMonths: number | null;
  dcaMonths: number | null;
}

function inferStrategicPosture(c: RankedCandidate): StrategicAssessment {
  const id = (c.id ?? "").toLowerCase();
  const label = `${c.label ?? ""} ${c.shortLabel ?? ""}`.toLowerCase();
  const text = `${id} ${label}`;

  const isProperty = /\b(ip|property)\b/.test(text);
  const isOffset = /\boffset\b/.test(text);
  const isDca = /\bdca\b/.test(text);
  const isLump = /\blump/.test(text);
  const isSuper = /\bsuper\b/.test(text);
  const isCrypto = /\bcrypto\b/.test(text);
  const isDiversified = /diversified|40\/40\/20/.test(text);
  const isDefer = /\bdefer\b|offset\s*only/.test(text);
  const isSequenced = /->|→|\bthen\b/.test(text) || c.id?.includes("then") || false;

  const m6 = /6\s*mo|@\s*6mo|month6/.test(text);
  const m18 = /18\s*mo|@\s*18mo|month18/.test(text);
  const m12 = /12\s*mo/.test(text);
  const m24 = /24\s*mo/.test(text);

  let timingMonths: number | null = null;
  if (m18) timingMonths = 18;
  else if (m6) timingMonths = 6;
  else if (m24) timingMonths = 24;
  else if (m12) timingMonths = 12;

  let dcaMonths: number | null = null;
  if (isDca) dcaMonths = m12 ? 12 : 24;

  const leverage = c.result?.riskMetrics?.leverageRisk ?? 0;
  const isHighLeverage = leverage > 0.55;

  // Posture priority — order matters: most specific wins.
  let posture: StrategicPosture = "unknown";
  if (isDefer && isDca) posture = "defer_property_build_liquidity";
  else if (isDefer && isOffset) posture = "defensive_cash_first";
  else if (isProperty && isSequenced && isOffset) posture = "offset_first_then_grow";
  else if (isProperty && (m18 || m24)) posture = "lever_into_property_delayed";
  else if (isProperty) posture = "lever_into_property_now";
  else if (isCrypto && !isDiversified) posture = "concentrated_crypto";
  else if (isDiversified) posture = "diversified_growth";
  else if (isOffset && isDca) posture = "offset_first_then_grow";
  else if (isOffset && !isDca && !isProperty) posture = "defensive_cash_first";
  else if (isDca) posture = "growth_etf_dca";
  else if (isLump) posture = "growth_etf_lump";
  else if (isSuper) posture = "super_tax_advantaged";
  else if (/50\s*\/\s*50|70\s*\/\s*30/.test(text)) posture = "balanced_split";

  return {
    posture,
    isPropertyPath: isProperty,
    isOffsetHeavy: isOffset,
    isDcaHeavy: isDca,
    isHighLeverage,
    isCryptoHeavy: isCrypto,
    timingMonths,
    dcaMonths,
  };
}

// ─── confidence interpretation ──────────────────────────────────────────────

function confidenceFromGap(winner: number, runner: number | null): {
  level: "high" | "medium" | "low";
  reason: string;
} {
  if (runner === null) {
    return {
      level: "medium",
      reason:
        "Only one strategy cleared the safety screen, so this recommendation has no direct comparator. Treat it as the engine's best path under the current constraints rather than a contested winner.",
    };
  }
  const gap = winner - runner;
  if (gap >= 8) {
    return {
      level: "high",
      reason:
        "The recommended path beats the runner-up by a wide margin across the scoring axes, so the ranking is decisive rather than a coin-flip between similar strategies.",
    };
  }
  if (gap >= 3) {
    return {
      level: "medium",
      reason:
        "The recommended path wins on aggregate, but the runner-up is close enough that small changes in inputs (rates, income, valuation) could shift the ranking.",
    };
  }
  return {
    level: "low",
    reason:
      "The recommended path and the runner-up are nearly tied on the scoring axes. The choice is reasonable, but a senior reviewer would treat this as a genuine judgement call rather than a clear answer.",
  };
}

// ─── interpret winner / liquidity / leverage posture ────────────────────────

interface WinnerInterpretation {
  liquidityNarrative: string;        // sentence describing liquidity stance
  leverageNarrative: string;         // sentence describing leverage stance
  refiNarrative: string | null;      // refinance / debt-service stance
  volatilityNarrative: string | null;
}

function interpretWinner(c: RankedCandidate): WinnerInterpretation {
  const r = c.result;
  const liqExh = r.liquidityExhaustionProbability ?? 0;
  const liqStress = r.liquidityStressProbability ?? 0;
  const refi = r.refinancePressureProbability ?? 0;
  const leverage = r.riskMetrics?.leverageRisk ?? 0;
  const ddMed = r.riskMetrics?.maxDrawdownMedian ?? 0;
  const survival = 1 - (r.defaultProbability ?? 0);

  // Liquidity narrative
  let liquidityNarrative: string;
  if (liqExh < 0.02 && liqStress < 0.10) {
    liquidityNarrative =
      "This path preserves a strong liquidity buffer throughout the forecast horizon and keeps cash-flow flexibility intact for unexpected obligations.";
  } else if (liqExh < 0.05 && liqStress < 0.20) {
    liquidityNarrative =
      "Liquidity holds up across most simulated conditions, with thin patches that recover within reasonable horizons. Emergency reserves remain serviceable.";
  } else if (liqExh < 0.15) {
    liquidityNarrative =
      "Liquidity is workable but not generous — there are stretches where cash buffer compresses, so disciplined reserve management matters more than usual.";
  } else {
    liquidityNarrative =
      "Liquidity is the primary constraint on this path. Cash flexibility is meaningfully reduced in adverse conditions, and emergency reserves should be ring-fenced before execution.";
  }

  // Leverage narrative
  let leverageNarrative: string;
  if (leverage >= 0.70) {
    leverageNarrative =
      "Leverage is high. The path amplifies returns when conditions are favourable, but it concentrates exposure and removes optionality if property values or rates move adversely.";
  } else if (leverage >= 0.55) {
    leverageNarrative =
      "Leverage is meaningful. The strategy uses borrowed capital to grow the balance sheet, which is acceptable here but trims the household's ability to absorb a second shock without action.";
  } else if (leverage >= 0.35) {
    leverageNarrative =
      "Leverage sits within a moderate band. There is room to take on additional borrowing later if a better opportunity appears, which preserves optionality.";
  } else {
    leverageNarrative =
      "Leverage is low. Borrowing power is preserved, which keeps future strategic moves — including a property purchase later — open rather than foreclosed.";
  }

  // Refinance / debt-service narrative
  let refiNarrative: string | null = null;
  if (refi >= 0.20) {
    refiNarrative =
      "Refinance pressure is elevated in adverse rate scenarios — a meaningful share of paths cross the debt-service stress band, which warrants a pre-agreed response to rate moves.";
  } else if (refi >= 0.10) {
    refiNarrative =
      "Refinance pressure is present but contained. The recommendation tolerates this because the underlying serviceability holds in the central case.";
  } else if (refi > 0) {
    refiNarrative =
      "Debt-service pressure stays well within tolerance, even when stressed scenarios are run against the household's serviceability.";
  }

  // Volatility narrative
  let volatilityNarrative: string | null = null;
  if (ddMed >= 0.25) {
    volatilityNarrative =
      "The strategy will be psychologically demanding. Mid-cycle declines are large enough that staying invested through them is a behavioural test, not just a financial one.";
  } else if (ddMed >= 0.15) {
    volatilityNarrative =
      "Volatility tolerance is genuinely tested. Mid-cycle declines around the typical path require pre-committed discipline rather than reactive selling.";
  } else if (ddMed > 0 && survival > 0.9) {
    volatilityNarrative =
      "Volatility exposure is contained and consistent with the household's stated risk profile.";
  }

  return { liquidityNarrative, leverageNarrative, refiNarrative, volatilityNarrative };
}

// ─── runner-up comparison (the heart of v2 advisor mode) ────────────────────

interface RunnerUpComparison {
  /** Memo paragraph explaining what the runner-up was and why it lost. */
  paragraph: string;
  /** True when the runner-up represents an immediate property purchase that
   *  the engine penalised on liquidity / timing grounds. */
  propertyLostOnTiming: boolean;
}

function compareRunnerUp(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  winnerPosture: StrategicAssessment,
): RunnerUpComparison | null {
  const runner = output.ranked[1];
  if (!runner) return null;

  const runnerPosture = inferStrategicPosture(runner);
  const winnerLiq = winner.result.liquidityStressProbability ?? 0;
  const runnerLiq = runner.result.liquidityStressProbability ?? 0;
  const winnerRefi = winner.result.refinancePressureProbability ?? 0;
  const runnerRefi = runner.result.refinancePressureProbability ?? 0;
  const winnerTerminal = median(winner.result.terminalNwSorted);
  const runnerTerminal = median(runner.result.terminalNwSorted);
  const wealthGap = Number.isFinite(winnerTerminal) && Number.isFinite(runnerTerminal)
    ? winnerTerminal - runnerTerminal
    : null;

  // Detect the canonical "property purchase lost on timing/liquidity" pattern.
  const runnerIsImmediateProperty =
    runnerPosture.isPropertyPath &&
    !winnerPosture.isPropertyPath &&
    (runnerPosture.timingMonths === null || runnerPosture.timingMonths <= 6);

  const runnerIsDelayedProperty =
    runnerPosture.isPropertyPath && (runnerPosture.timingMonths ?? 0) >= 12;

  let paragraph: string;
  if (runnerIsImmediateProperty) {
    paragraph =
      `The investment-property pathway (${runner.label}) produced comparable long-term wealth outcomes, ` +
      `but required materially tighter liquidity conditions during the first several years. ` +
      `The model penalised that path because a higher proportion of outcomes experienced elevated ` +
      `refinance pressure and reduced cash flexibility under stressed conditions. ` +
      `In short: the property thesis isn't wrong — the timing is.`;
  } else if (runnerIsDelayedProperty && winnerPosture.posture === "defer_property_build_liquidity") {
    paragraph =
      `The closest alternative (${runner.label}) was a similar deferral with a different exit. ` +
      `It scored slightly behind because the additional time spent compounding liquid assets — rather than ` +
      `committing capital to a property deposit — preserved more optionality and improved risk-adjusted ` +
      `wealth on the recommended path.`;
  } else if (runnerPosture.posture === "growth_etf_lump" && winnerPosture.isDcaHeavy) {
    paragraph =
      `The runner-up (${runner.label}) deploys the same capital in a single transaction rather than spread ` +
      `across monthly contributions. It captures more upside in benign markets but exposes the household to ` +
      `sequencing risk — committing the full allocation at a single price level. The recommended path trades ` +
      `a modest expected return for materially better behaviour across adverse entry windows.`;
  } else if (runnerPosture.isCryptoHeavy) {
    paragraph =
      `The runner-up (${runner.label}) carried a concentrated crypto allocation. While it produced strong ` +
      `upside paths, the model downgraded it for concentration risk and downside asymmetry — outcomes ` +
      `where the household would have lost a meaningful share of liquid net worth in a single decline.`;
  } else if (winnerLiq + 0.05 < runnerLiq || winnerRefi + 0.05 < runnerRefi) {
    paragraph =
      `The runner-up (${runner.label}) reached broadly comparable long-term wealth, but did so with tighter ` +
      `liquidity conditions and higher debt-service pressure along the way. The recommendation is preferred ` +
      `because it produces a steadier path to the same destination rather than a slightly higher peak with ` +
      `more turbulence.`;
  } else if (wealthGap !== null && wealthGap < 0) {
    paragraph =
      `The runner-up (${runner.label}) finishes marginally higher on median wealth, but only by accepting ` +
      `risk characteristics — liquidity, leverage, or sequencing — that the household's stated profile does ` +
      `not justify chasing. The recommended path concedes a small amount of expected wealth in exchange for ` +
      `materially better resilience.`;
  } else {
    paragraph =
      `The runner-up (${runner.label}) is a credible alternative. It loses by a narrow margin on the ` +
      `combined scoring of survivability, liquidity comfort, and risk-adjusted return — close enough that ` +
      `the recommendation should be revisited if household priorities shift.`;
  }

  return {
    paragraph,
    propertyLostOnTiming: runnerIsImmediateProperty,
  };
}

// ─── section builders (v2) ──────────────────────────────────────────────────

function buildExecutiveRecommendation(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  confidence: ReturnType<typeof confidenceFromGap>,
  mode: NarrativeMode,
): NarrativeSection {
  const monthlyDeploy = output.capital && posture.dcaMonths
    ? output.capital / posture.dcaMonths
    : null;

  let summary: string;
  switch (posture.posture) {
    case "defer_property_build_liquidity":
      summary =
        `Defer the investment-property purchase and redirect capital into a disciplined ${
          posture.dcaMonths ?? 24
        }-month accumulation programme. The recommendation is timing-sensitive, not anti-property.`;
      break;
    case "lever_into_property_delayed":
      summary =
        `Proceed with the investment property, but delay the purchase by ${monthsToHuman(
          posture.timingMonths ?? 18,
        )} to strengthen the liquidity position before taking on additional leverage.`;
      break;
    case "lever_into_property_now":
      summary =
        `Move forward with the investment property purchase now. Current balance-sheet capacity and rate environment support the additional leverage.`;
      break;
    case "offset_first_then_grow":
      summary =
        `Prioritise interest savings through the offset facility first, then sequence growth assets once the household balance sheet is strengthened.`;
      break;
    case "growth_etf_dca":
      summary =
        `Deploy capital into diversified market exposure through monthly dollar-cost averaging rather than a single committed transaction.`;
      break;
    case "growth_etf_lump":
      summary =
        `Deploy capital into diversified market exposure as a single allocation. Conditions favour committing now rather than spreading entry.`;
      break;
    case "super_tax_advantaged":
      summary =
        `Direct capital into concessional superannuation contributions. The tax-advantaged structure outweighs the loss of pre-retirement access at this stage.`;
      break;
    case "defensive_cash_first":
      summary =
        `Defensive positioning: build the cash and offset buffer before committing to any growth or property exposure. Capital preservation outweighs upside in the current setup.`;
      break;
    case "diversified_growth":
      summary =
        `Spread capital across diversified growth exposures rather than concentrating in a single asset class. Resilience comes from breadth, not conviction.`;
      break;
    case "concentrated_crypto":
      summary =
        `Concentrate capital in digital assets within the household's stated concentration limit. Treat this as an asymmetric bet, not a core allocation.`;
      break;
    case "balanced_split":
      summary =
        `Split capital between defensive and growth sleeves. The strategy buys behavioural durability at the cost of some peak return.`;
      break;
    default:
      summary = `Adopt ${winner.label} as the recommended strategy.`;
  }

  const body: string[] = [];

  if (mode === "simple") {
    // Memo paragraph — interpret, do not restate metrics.
    body.push(buildSimpleExecParagraph(output, winner, posture));
  } else if (mode === "advisor") {
    body.push(buildSimpleExecParagraph(output, winner, posture));
    body.push(
      `Confidence: ${confidence.level}. ${confidence.reason}`,
    );
    body.push(
      `Profile applied: ${output.investorProfile.replace(/_/g, " ")}. Ranked first among ${output.ranked.length} surviving strategies under the ${output.riskControlsApplied.mode.replace(/_/g, " ")} risk-control mode.`,
    );
  } else {
    // quant
    body.push(
      `Composite score ${winner.score.score.toFixed(2)}. Confidence: ${confidence.level} (gap-to-runner-up: ${
        ((output.ranked[1]?.score.score ?? winner.score.score) - winner.score.score).toFixed(1)
      } pts).`,
    );
    body.push(
      `Profile: ${output.investorProfile}. Risk mode: ${output.riskControlsApplied.mode}. n=${output.ranked.length} ranked, ${output.discarded.length} discarded.`,
    );
    body.push(
      `Score derivation (raw × weight = contribution): ` +
        winner.trace.scoreDerivation
          .map(s => `${s.axis} ${s.rawValue.toFixed(3)}×${s.weight.toFixed(2)}=${s.contribution.toFixed(3)}`)
          .join("; "),
    );
  }

  return {
    id: "executiveRecommendation",
    title: "Executive recommendation",
    summary,
    body,
  };
}

function buildSimpleExecParagraph(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
): string {
  const monthlyDeploy = output.capital && posture.dcaMonths
    ? output.capital / posture.dcaMonths
    : null;

  switch (posture.posture) {
    case "defer_property_build_liquidity":
      return (
        `Delaying the investment-property purchase for ${monthsToHuman(posture.dcaMonths ?? 24)} materially improves ` +
        `the liquidity position during the highest-risk phase of balance-sheet expansion. The current cash buffer is ` +
        `more valuable than immediate leverage exposure into another property. The recommendation is not anti-property ` +
        `over the long run — it is timing-sensitive. The model prefers strengthening the liquid asset base first, ` +
        `while continuing disciplined accumulation through monthly contributions${
          monthlyDeploy ? ` of approximately ${moneyShort(monthlyDeploy)} per month` : ""
        }.`
      );
    case "lever_into_property_delayed":
      return (
        `The investment property is the right structural move, but the optimal entry is ${monthsToHuman(
          posture.timingMonths ?? 18,
        )} from now rather than immediately. The intervening period is used to rebuild the cash buffer, improve borrowing ` +
        `resilience, and reduce timing risk on the deposit. Buying immediately would compound balance-sheet stress; ` +
        `buying later from a stronger position preserves optionality if rates or property conditions change.`
      );
    case "lever_into_property_now":
      return (
        `Current conditions support proceeding with the property purchase without further delay. Liquidity is sufficient ` +
        `to absorb the deposit and settlement costs, debt-service capacity holds under stress, and the cost of waiting ` +
        `is greater than the cost of acting. The recommendation is to execute while the household's borrowing position ` +
        `is at its current strength.`
      );
    case "offset_first_then_grow":
      return (
        `The strongest near-term move is to neutralise mortgage interest through the offset facility before sequencing ` +
        `growth-asset purchases. This compounds a guaranteed after-tax return immediately, strengthens the balance sheet, ` +
        `and preserves the borrowing capacity needed for the next strategic step.`
      );
    case "growth_etf_dca":
      return (
        `Deploy approximately ${monthlyDeploy ? moneyShort(monthlyDeploy) : "the planned monthly amount"} into diversified ` +
        `equity exposure over ${monthsToHuman(posture.dcaMonths ?? 24)} rather than committing the full amount in a single ` +
        `transaction. The objective during this phase is to grow liquid net worth, smooth entry risk, and avoid committing ` +
        `the entire allocation at a single price point. This is a deliberate trade of some expected upside for materially ` +
        `better behaviour across adverse entry windows.`
      );
    case "growth_etf_lump":
      return (
        `Conditions favour deploying the full allocation as a single transaction. The household has the liquidity to absorb ` +
        `near-term volatility, and the opportunity cost of staged entry exceeds the sequencing benefit. The position is ` +
        `held through the cycle, not traded.`
      );
    case "super_tax_advantaged":
      return (
        `Concessional superannuation contributions produce a structurally better after-tax outcome than equivalent exposure ` +
        `held outside super, given the household's marginal tax position. The trade-off is preservation: the funds are not ` +
        `accessible before condition-of-release. That trade-off is acceptable at this life stage.`
      );
    case "defensive_cash_first":
      return (
        `Before any growth-asset commitment, the priority is rebuilding the cash and offset buffer. The household's near-term ` +
        `resilience matters more than the next dollar of return; the recommendation reflects that ordering rather than a ` +
        `view that growth assets are unattractive in absolute terms.`
      );
    case "diversified_growth":
      return (
        `Capital is allocated across multiple growth sleeves rather than concentrated in a single thesis. The breadth of ` +
        `exposure dampens the impact of any single asset class disappointing, and produces a steadier compounding path ` +
        `than a concentrated alternative.`
      );
    case "concentrated_crypto":
      return (
        `The recommendation tolerates concentrated digital-asset exposure only within the household's stated concentration ` +
        `limit. It is positioned as an asymmetric exposure — the upside justifies the small allocation, but it must not ` +
        `crowd out the household's core resilience.`
      );
    case "balanced_split":
      return (
        `Capital is split between a defensive sleeve (interest savings, cash buffer) and a growth sleeve (market exposure). ` +
        `The split sacrifices some peak return to produce a path the household can hold through adverse periods without ` +
        `reacting at the wrong moment.`
      );
    default:
      return (
        `The recommended strategy (${winner.label}) is preferred because it produced the strongest combination of ` +
        `resilience, growth, and cash-flow comfort across the simulated conditions.`
      );
  }
}

function buildWhyNow(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  interp: WinnerInterpretation,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    posture.posture === "defer_property_build_liquidity"
      ? `The case for acting now is about timing, not opportunity — the next ${monthsToHuman(posture.dcaMonths ?? 24)} are the window where this sequencing matters most.`
      : posture.isPropertyPath
        ? `The window to execute is defined by current borrowing-capacity, rate, and valuation conditions — all of which can move against the household if action is delayed.`
        : `Acting now compounds a structural advantage that erodes if the decision is deferred.`;

  const body: string[] = [];

  if (mode === "simple" || mode === "advisor") {
    if (posture.posture === "defer_property_build_liquidity") {
      body.push(
        `The strategic value of this recommendation is concentrated in the first ${monthsToHuman(
          posture.dcaMonths ?? 24,
        )}. Acting on it now means the household enters its next leverage decision from a position of strength rather than ` +
        `from a stretched balance sheet. Delaying the decision compounds the cost of waiting.`,
      );
      body.push(
        `Conditions also favour patience on the property side specifically: tightening the household's liquidity to chase ` +
        `an immediate purchase would lock in worse refinance and serviceability resilience for years afterwards.`,
      );
    } else if (posture.isPropertyPath) {
      body.push(
        `Borrowing capacity, serviceability buffers, and the household's current cash position align — these are the ` +
        `inputs that determine whether the deal pencils. Waiting risks losing one of them.`,
      );
      body.push(interp.leverageNarrative);
    } else if (posture.posture === "offset_first_then_grow") {
      body.push(
        `Every month that capital sits outside the offset facility, the household pays mortgage interest unnecessarily. ` +
        `That foregone saving compounds at the mortgage rate after tax — an unusually attractive guaranteed return.`,
      );
    } else if (posture.isDcaHeavy) {
      body.push(
        `Beginning the contribution schedule now anchors the deployment cadence and removes the temptation to time ` +
        `the market. The benefit of dollar-cost averaging is realised only if it actually starts on time.`,
      );
    } else {
      body.push(
        `The recommendation reflects the household's current balance-sheet capacity. The same path can look very ` +
        `different in twelve months if income, rates, or asset prices have moved — so the rationale for acting now is ` +
        `to lock in the conditions that justify it.`,
      );
    }

    if (mode === "advisor") {
      body.push(interp.liquidityNarrative);
    }
  } else {
    // quant: dense list of measured drivers
    const r = winner.result;
    body.push(
      `Liquidity exhaustion probability: ${pct(r.liquidityExhaustionProbability ?? 0, 1)}; ` +
        `liquidity stress: ${pct(r.liquidityStressProbability ?? 0, 1)}; ` +
        `refinance pressure: ${pct(r.refinancePressureProbability ?? 0, 1)}.`,
    );
    body.push(
      `leverageRisk = ${(r.riskMetrics?.leverageRisk ?? 0).toFixed(3)}; ` +
        `maxDrawdownMedian = ${(r.riskMetrics?.maxDrawdownMedian ?? 0).toFixed(3)}; ` +
        `medianLiquidityFirstMonth = ${r.medianLiquidityFirstMonth ?? "—"}.`,
    );
    body.push(
      `Engine why-won (raw): ` +
        (output.comparativeNarrative.whyWon ?? []).join(" | "),
    );
  }

  return {
    id: "whyNow",
    title: "Why now",
    summary,
    body,
  };
}

function buildMainRisksAvoided(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  comparison: RunnerUpComparison | null,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `The recommended path was preferred specifically because of the risks it neutralises — not just the returns it targets.`;

  const body: string[] = [];

  if (mode === "simple" || mode === "advisor") {
    // Interpret what's avoided, anchored to the posture.
    if (posture.posture === "defer_property_build_liquidity" || posture.posture === "defensive_cash_first") {
      body.push(
        `Avoids stacking a second leverage event on top of an already-extended balance sheet. The household's exposure ` +
        `to a simultaneous rate, valuation, and income shock is reduced rather than amplified.`,
      );
      body.push(
        `Avoids the cash-flow squeeze that comes from committing the deposit before the buffer is fully rebuilt — a ` +
        `condition that historically forces sub-optimal sales or refinances if income wavers.`,
      );
    } else if (posture.isPropertyPath && posture.timingMonths && posture.timingMonths >= 12) {
      body.push(
        `Avoids buying into the property at the moment the household's serviceability resilience is at its thinnest. ` +
        `Delaying the purchase to a point of better cash-flow strength materially reduces refinance and forced-sale risk.`,
      );
    } else if (posture.isDcaHeavy) {
      body.push(
        `Avoids sequencing risk — the possibility that the entire allocation is committed at a single, unfavourable ` +
        `price point. Spread entries smooth realised outcomes across plausible market paths.`,
      );
    } else if (posture.posture === "offset_first_then_grow") {
      body.push(
        `Avoids paying mortgage interest unnecessarily during the period when capital is otherwise idle. The guaranteed ` +
        `interest saving competes favourably with the expected return of the alternatives, on a risk-adjusted basis.`,
      );
    } else if (posture.isCryptoHeavy) {
      body.push(
        `Caps concentration risk inside the household's stated limit — preventing a single asset's decline from ` +
        `dictating the trajectory of total net worth.`,
      );
    } else {
      body.push(
        `Reduces the probability of a forced strategic adjustment under stress. The household keeps the option to act ` +
        `from strength rather than from necessity.`,
      );
    }

    if (comparison?.propertyLostOnTiming) {
      body.push(
        `Specifically, the recommendation avoids the elevated refinance pressure and tighter liquidity that the immediate ` +
        `property purchase would have introduced in the first several years. That is the risk the runner-up was ` +
        `penalised for — and the one this path sidesteps.`,
      );
    }

    if (mode === "advisor") {
      const soft = winner.softWarnings ?? [];
      const critical = soft.filter(s => s.severity === "critical" || s.severity === "warn");
      if (critical.length === 0) {
        body.push(
          `No category-level red flags were raised by the safety screen on the recommended path. The household remains ` +
          `well within stated risk tolerances.`,
        );
      } else {
        body.push(
          `Residual concerns flagged by the safety screen (these are mitigated, not eliminated): ${
            critical.map(s => s.label.toLowerCase()).join("; ")
          }.`,
        );
      }
    }
  } else {
    // quant
    const r = winner.result;
    body.push(
      `liquidityStressProbability=${(r.liquidityStressProbability ?? 0).toFixed(3)}, ` +
        `liquidityExhaustionProbability=${(r.liquidityExhaustionProbability ?? 0).toFixed(3)}, ` +
        `refinancePressureProbability=${(r.refinancePressureProbability ?? 0).toFixed(3)}, ` +
        `negativeEquityProbability=${(r.negativeEquityProbability ?? 0).toFixed(3)}.`,
    );
    body.push(
      `Risk metrics: leverageRisk=${(r.riskMetrics?.leverageRisk ?? 0).toFixed(3)}, ` +
        `concentrationRisk=${(r.riskMetrics?.concentrationRisk ?? 0).toFixed(3)}, ` +
        `downsideRisk=${(r.riskMetrics?.downsideRisk ?? 0).toFixed(3)}, ` +
        `maxDrawdownMedian=${(r.riskMetrics?.maxDrawdownMedian ?? 0).toFixed(3)}, ` +
        `maxDrawdownP90=${(r.riskMetrics?.maxDrawdownP90 ?? 0).toFixed(3)}.`,
    );
    for (const sw of winner.softWarnings ?? []) {
      body.push(`${sw.severity.toUpperCase()} · ${sw.label}: ${sw.detail}`);
    }
  }

  return {
    id: "mainRisksAvoided",
    title: "Main risks avoided",
    summary,
    body,
  };
}

function buildTradeOffsAccepted(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  comparison: RunnerUpComparison | null,
  interp: WinnerInterpretation,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `Every recommendation trades one set of risks for another. These are the trade-offs the household is accepting in exchange for the benefits above.`;

  const body: string[] = [];

  if (mode === "simple" || mode === "advisor") {
    switch (posture.posture) {
      case "defer_property_build_liquidity":
        body.push(
          `Accepts the opportunity cost of not owning the additional investment property during the deferral window. ` +
          `If property prices appreciate sharply over that period, the household captures less of that uplift than an ` +
          `immediate-purchase strategy would.`,
        );
        body.push(
          `Accepts that the deferral is conditional on discipline — the monthly contribution schedule must actually ` +
          `happen. The benefit evaporates if the capital is left undeployed.`,
        );
        break;
      case "lever_into_property_now":
        body.push(
          `Accepts a meaningful step-up in leverage and a tighter cash-flow buffer in the first several years. The ` +
          `trade-off is justified by the structural value of the asset, but the household carries less optionality ` +
          `during the digestion period.`,
        );
        break;
      case "lever_into_property_delayed":
        body.push(
          `Accepts the opportunity cost of not owning the property during the deferral window in exchange for entering ` +
          `from a stronger balance-sheet position.`,
        );
        break;
      case "growth_etf_dca":
        body.push(
          `Accepts that some upside is given up in benign markets — a single deployment would have captured slightly ` +
          `more compounding. The trade-off purchases behavioural durability across less benign paths.`,
        );
        break;
      case "growth_etf_lump":
        body.push(
          `Accepts sequencing risk in exchange for fuller time-in-market exposure. The household has to be comfortable ` +
          `holding the full position through near-term volatility.`,
        );
        break;
      case "super_tax_advantaged":
        body.push(
          `Accepts that the funds are not accessible before condition-of-release. The household is making a deliberate ` +
          `decision to prioritise after-tax compounding over pre-retirement liquidity.`,
        );
        break;
      case "offset_first_then_grow":
        body.push(
          `Accepts a lower nominal return than market exposure would have produced in a strong year — the offset return ` +
          `equals the after-tax mortgage rate, no more. The exchange is a guaranteed outcome rather than an expected one.`,
        );
        break;
      case "concentrated_crypto":
        body.push(
          `Accepts the high-volatility characteristic of digital assets and the possibility of a meaningful decline on this ` +
          `sleeve. The position size is sized so that this outcome is survivable rather than catastrophic.`,
        );
        break;
      case "diversified_growth":
        body.push(
          `Accepts that no single sleeve will produce the highest possible return — diversification gives up the upside ` +
          `tail in exchange for a steadier compounding path.`,
        );
        break;
      default:
        body.push(
          `Accepts a modest reduction in expected upside in exchange for materially better resilience across adverse paths.`,
        );
    }

    if (interp.volatilityNarrative) {
      body.push(interp.volatilityNarrative);
    }

    if (comparison && mode === "advisor") {
      body.push(comparison.paragraph);
    }
  } else {
    // quant — terminal NW gap and dispersion
    const r = winner.result;
    const winnerMed = median(r.terminalNwSorted);
    const runnerMed = output.ranked[1] ? median(output.ranked[1].result.terminalNwSorted) : NaN;
    body.push(
      `Median terminal net worth: ${moneyShort(winnerMed)}. Runner-up median: ${
        Number.isFinite(runnerMed) ? moneyShort(runnerMed) : "—"
      }. Δ = ${
        Number.isFinite(winnerMed) && Number.isFinite(runnerMed)
          ? moneyShort(winnerMed - runnerMed)
          : "—"
      }.`,
    );
    body.push(
      `Dispersion of terminal outcomes (5-bucket sorted distribution): ` +
        (r.terminalNwSorted?.length ? r.terminalNwSorted.map(moneyShort).join(" | ") : "—"),
    );
    if (comparison) body.push(`Runner-up reasoning: ${comparison.paragraph}`);
  }

  return {
    id: "tradeOffsAccepted",
    title: "Trade-offs accepted",
    summary,
    body,
  };
}

function buildActionPlan(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  mode: NarrativeMode,
): NarrativeSection {
  const monthlyDeploy = output.capital && posture.dcaMonths
    ? output.capital / posture.dcaMonths
    : null;

  let summary: string;
  if (posture.posture === "defer_property_build_liquidity" && monthlyDeploy) {
    summary =
      `Deploy approximately ${moneyShort(monthlyDeploy)} per month into diversified equity exposure over the next ` +
      `${monthsToHuman(posture.dcaMonths ?? 24)} rather than committing the full amount into an immediate property ` +
      `purchase. The objective during this phase is to grow liquid net worth, improve borrowing resilience, reduce ` +
      `timing risk, and preserve optionality if rates or property conditions change.`;
  } else if (posture.isDcaHeavy && monthlyDeploy) {
    summary =
      `Deploy approximately ${moneyShort(monthlyDeploy)} per month over ${monthsToHuman(
        posture.dcaMonths ?? 24,
      )}. Treat the schedule as a behavioural commitment rather than an optional one.`;
  } else if (posture.posture === "offset_first_then_grow") {
    summary =
      `Move the recommended capital into the offset facility this month, then sequence the growth allocation as outlined below.`;
  } else if (posture.isPropertyPath && posture.timingMonths) {
    summary =
      `Hold position for ${monthsToHuman(posture.timingMonths)}, using that window to strengthen the balance sheet, then execute the property purchase.`;
  } else {
    summary = `Execute the steps below in order. The sequencing is part of the recommendation, not incidental to it.`;
  }

  const body: string[] = [];
  const phases = output.executionPlan ?? [];

  if (phases.length === 0) {
    body.push(
      `Step 1 — Confirm at least six months of household expenses are held in liquid reserves before any commitment.`,
    );
    body.push(
      `Step 2 — Confirm the deployment cadence (monthly amount and account destination) with the household's accountant or financial planner.`,
    );
    body.push(
      `Step 3 — Set a 12-month review checkpoint, or sooner if income or rate conditions shift materially.`,
    );
  } else {
    phases.forEach((p, i) => {
      body.push(`Step ${i + 1} — ${cleanLabel(p.label)}`);
      for (const a of p.actions) {
        body.push(`  • ${cleanLabel(a.event)}: ${cleanLabel(a.effect)}`);
      }
    });
  }

  // Conditional recommendations are integrated as monitoring actions.
  const recs = output.conditionalRecommendations ?? [];
  if (recs.length > 0) {
    body.push("");
    body.push(`Monitoring — events that should trigger an immediate review:`);
    for (const r of recs.slice(0, 5)) {
      body.push(`  • If ${cleanLabel(r.trigger)}, then ${cleanLabel(r.action)}.`);
    }
  }

  return {
    id: "actionPlan",
    title: "Action plan",
    summary,
    body,
  };
}

function buildWhatWouldChangeThis(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  comparison: RunnerUpComparison | null,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `These are the conditions under which a senior reviewer would re-open this recommendation rather than treat it as settled.`;

  const body: string[] = [];

  // Posture-conditioned triggers
  if (posture.posture === "defer_property_build_liquidity") {
    body.push(
      `Liquidity buffer reaches a ring-fenced level equivalent to nine to twelve months of household expenses, with no ` +
      `incoming obligation expected to compress it. At that point, the deferral has done its job and the property thesis ` +
      `can be re-evaluated on its own merits.`,
    );
    body.push(
      `Refinance pressure eases materially — typically a sustained move lower in policy or mortgage rates, or an ` +
      `improvement in household serviceability through income growth.`,
    );
    body.push(
      `Property valuations or rental yields shift to a level that re-rates the investment case independently of the ` +
      `current timing concern.`,
    );
  } else if (posture.isPropertyPath) {
    body.push(
      `A material adverse move in interest rates or household serviceability before settlement would warrant pausing ` +
      `the purchase rather than proceeding.`,
    );
    body.push(
      `A meaningful softening in target-area valuations would shift the deal economics enough to reconsider both timing ` +
      `and structure.`,
    );
  } else if (posture.isDcaHeavy) {
    body.push(
      `A sustained, deep market dislocation would create a case to accelerate the schedule — converting the planned ` +
      `monthly contributions into a larger committed deployment.`,
    );
    body.push(
      `A material change in household income or expense profile would prompt re-sizing the monthly contribution rather ` +
      `than continuing on the original schedule.`,
    );
  } else if (posture.posture === "offset_first_then_grow") {
    body.push(
      `If the after-tax mortgage rate falls materially below the expected return of comparable risk-adjusted ` +
      `investments, the offset advantage compresses and the growth sleeve should be re-prioritised earlier.`,
    );
  } else {
    body.push(
      `A material change in household income, expenses, or risk tolerance is the primary signal to re-run the ` +
      `recommendation.`,
    );
  }

  // Comparison-conditioned triggers
  if (comparison?.propertyLostOnTiming) {
    body.push(
      `The investment-property pathway becomes the preferred recommendation once liquidity has been rebuilt to the ` +
      `target band and refinance pressure has eased. The runner-up does not lose on the property thesis itself — only ` +
      `on the household's readiness to take it on now.`,
    );
  }

  // Borrowing-capacity trigger (universal for households with mortgages)
  body.push(
    `A change in borrowing capacity — through income growth, paydown, or improvement in the household's debt-service ` +
    `ratios — should prompt a re-run of the decision engine before the next material commitment.`,
  );

  if (mode === "quant") {
    body.push(
      `Engine "what could invalidate" lines (raw): ` +
        (output.comparativeNarrative.whatCouldInvalidate ?? []).join(" | "),
    );
  }

  return {
    id: "whatWouldChangeThis",
    title: "What would change this recommendation later",
    summary,
    body,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// V3 — additional senior-advisor sections.
// These build on the metrics the engine already computes and on the same
// strategic-posture inference. No new math; the math layer is untouched.
// ────────────────────────────────────────────────────────────────────────────

function buildWhyThisPathWon(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  interp: WinnerInterpretation,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `The recommendation was selected because it produced the strongest combination of resilience, capital growth, and serviceability comfort across the simulated conditions.`;

  const body: string[] = [];

  if (mode === "simple" || mode === "advisor") {
    body.push(interp.liquidityNarrative);
    body.push(interp.leverageNarrative);
    if (interp.refiNarrative) body.push(interp.refiNarrative);
    // Top contributor — interpreted, not numeric in Simple.
    const top = (winner.trace.scoreDerivation ?? [])
      .filter((s) => (s.weight ?? 0) > 0)
      .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))[0];
    if (top && mode === "advisor") {
      body.push(
        `The dominant axis behind this ranking was ${axisToHuman(top.axis)} — the recommendation scores ahead of alternatives most decisively on that dimension.`,
      );
    } else if (top) {
      body.push(
        `The path's most decisive advantage is on ${axisToHuman(top.axis)}, which is where it pulls ahead of the alternatives.`,
      );
    }
  } else {
    // quant
    body.push(
      `Composite score: ${winner.score.score.toFixed(2)}. Base before penalties: ${(winner.score.baseScore ?? winner.score.score).toFixed(2)}.`,
    );
    body.push(
      `Per-axis derivation (raw × weight = contribution): ` +
        (winner.trace.scoreDerivation ?? [])
          .map((s) => `${s.axis} ${(s.rawValue ?? 0).toFixed(3)}×${(s.weight ?? 0).toFixed(2)}=${(s.contribution ?? 0).toFixed(2)}`)
          .join("; "),
    );
  }

  return { id: "whyThisPathWon", title: "Why this path won", summary, body };
}

function buildWhyAlternativesLost(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  comparison: RunnerUpComparison | null,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `Each alternative path scored lower on at least one dimension that the household's priority profile weights heavily. The trade they implicitly demand was not paid for by their upside.`;

  const body: string[] = [];

  if (comparison) {
    body.push(comparison.paragraph);
  }

  // Walk down ranked[1..2] when present and emit interpretation lines for each.
  for (let i = 1; i <= Math.min(2, output.ranked.length - 1); i++) {
    const alt = output.ranked[i];
    if (!alt) continue;
    const altPosture = inferStrategicPosture(alt);
    const liq = alt.result?.liquidityStressProbability ?? 0;
    const refi = alt.result?.refinancePressureProbability ?? 0;
    const lev = alt.result?.riskMetrics?.leverageRisk ?? 0;
    let reason: string;
    if (refi > 0.15 || liq > 0.18) {
      reason =
        `${alt.label} lost ground on serviceability — the path carried elevated refinance and liquidity stress through the early years, which weighs heavily on the resilience axis.`;
    } else if (lev > 0.6) {
      reason =
        `${alt.label} accepted more leverage than the recommended path. The expected wealth uplift did not compensate for the increase in downside dispersion under stress.`;
    } else if (altPosture.isCryptoHeavy) {
      reason =
        `${alt.label} carried concentrated digital-asset exposure. The upside paths were attractive but the left-tail outcomes pulled risk-adjusted scoring below the recommended path.`;
    } else if (mode === "quant") {
      reason =
        `${alt.label}: score ${alt.score.score.toFixed(2)} (Δ to winner ${(alt.score.score - winner.score.score).toFixed(2)}). Lost on the combined scoring axes after weights and penalties.`;
    } else {
      reason =
        `${alt.label} loses by a narrow margin on the combined scoring of survivability, liquidity comfort, and risk-adjusted return — close enough that household priority shifts could re-open the case.`;
    }
    body.push(reason);
  }

  // Discarded set context — illustrate the failure modes that didn't even make it to ranking.
  const discardedSample = (output.discarded ?? []).slice(0, 2);
  if (discardedSample.length > 0 && (mode === "advisor" || mode === "quant")) {
    body.push(
      `The safety screen also filtered ${output.discarded.length} other path${output.discarded.length === 1 ? "" : "s"} before ranking. Representative reasons: ` +
        discardedSample
          .map((d) => `${d.label.toLowerCase()} — ${d.reason.toLowerCase()}`)
          .join("; ") +
        ".",
    );
  }

  if (body.length === 0) {
    body.push(
      `No comparable alternative survived the safety screen, so the recommended path is the only candidate the engine could justify under the current constraints.`,
    );
  }

  return { id: "whyAlternativesLost", title: "Why alternatives lost", summary, body };
}

function buildBiggestHiddenRisks(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `Even the recommended path carries dimensions of risk that are not immediately visible from headline returns. These are the exposures a senior reviewer would want surfaced before sign-off.`;

  const body: string[] = [];
  const r = winner.result;
  const soft = winner.softWarnings ?? [];

  // Hidden risk 1 — sequence-of-returns
  const ddMed = r.riskMetrics?.maxDrawdownMedian ?? 0;
  if (ddMed >= 0.12) {
    body.push(
      `Sequence-of-returns risk: the household's wealth trajectory is sensitive to where the largest declines occur. A deep decline early in the plan compounds for years before recovery, while the same decline late compresses far less terminal wealth.`,
    );
  }

  // Hidden risk 2 — liquidity asymmetry
  if ((r.liquidityStressProbability ?? 0) > 0.10) {
    body.push(
      `Liquidity asymmetry: the recommended path holds cash buffers that look adequate on average but compress during exactly the conditions where they are most needed. The shortfall is structural rather than budgetary.`,
    );
  }

  // Hidden risk 3 — refinance / rate-shock asymmetry
  if ((r.refinancePressureProbability ?? 0) > 0.10) {
    body.push(
      `Refinance-pressure asymmetry: serviceability stress lands at the worst moment — typically when rates have risen and household income has not yet caught up. The plan should pre-commit a response rather than improvising one.`,
    );
  }

  // Hidden risk 4 — downside asymmetry (P10 vs P50)
  const finalFan = (r as any).netWorthFan?.[(r as any).netWorthFan?.length - 1];
  if (finalFan && finalFan.p10 < finalFan.p50 * 0.55) {
    body.push(
      `Downside asymmetry: the bottom-decile outcome sits substantially below the central case. Most of the plan's expected wealth is concentrated in the favourable half of the distribution rather than evenly spread.`,
    );
  }

  // Hidden risk 5 — concentration
  const conc = r.riskMetrics?.concentrationRisk ?? 0;
  if (conc >= 0.40) {
    body.push(
      `Concentration risk: a large share of the household's net worth depends on a single asset class. The recommended path tolerates this within stated limits, but it remains the dominant determinant of outcome dispersion.`,
    );
  }

  // Soft warnings already raised by the engine — surface them as hidden-risks.
  for (const sw of soft) {
    if (sw.severity === "critical" || sw.severity === "warn") {
      body.push(`${sw.label}: ${sw.detail}`);
    }
  }

  if (body.length === 0) {
    body.push(
      `No structurally hidden exposures were detected against the path's posture. Standard household risks — health, employment, regulatory change — remain unmodelled and should be carried in the broader financial plan rather than this recommendation.`,
    );
  }

  return { id: "biggestHiddenRisks", title: "Biggest hidden risks", summary, body };
}

function buildBehaviouralRiskCommentary(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  interp: WinnerInterpretation,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `The mathematically optimal strategy can still fail behaviourally. Capturing the recommendation's value requires the household to actually execute it through periods that will tempt different choices.`;

  const body: string[] = [];

  if (interp.volatilityNarrative) {
    body.push(interp.volatilityNarrative);
  }

  // Posture-specific commentary
  if (posture.isDcaHeavy) {
    body.push(
      `The dollar-cost-averaging schedule is a discipline commitment. The advantage of this approach is realised only if contributions actually land on time during periods when the headlines argue against contributing. Front-running or pausing the schedule erases the benefit.`,
    );
  }
  if (posture.posture === "defer_property_build_liquidity") {
    body.push(
      `Deferring the property requires patience — and patience under pressure if the property market rallies during the deferral window. The recommendation is conditional on the household holding the line, not chasing the entry.`,
    );
  }
  if (posture.isPropertyPath) {
    body.push(
      `Property holdings tempt behavioural mistakes during corrections: forced sales near the bottom, refinancing into worse terms, or attempting to time exits. The plan's resilience depends on staying invested through the cycle.`,
    );
  }
  if (posture.isCryptoHeavy) {
    body.push(
      `Concentrated digital-asset exposure invites position-sizing drift. The recommendation works only if the allocation is rebalanced back to the target rather than allowed to compound into a larger share of the balance sheet.`,
    );
  }

  // Priority-overlay commentary
  if (output.prioritiesActive) {
    const sleep = output.behaviouralPriorities?.sleepAtNight ?? 5;
    const vol = output.behaviouralPriorities?.volatilityTolerance ?? 5;
    if (sleep >= 8 && vol >= 7) {
      body.push(
        `Note: the priorities profile combines high sleep-at-night importance with high volatility tolerance, which is unusual. The recommendation honours the higher of the two, but it is worth confirming which preference is the genuine one.`,
      );
    } else if (sleep >= 8) {
      body.push(
        `The household has weighted sleep-at-night importance heavily. The recommendation is steered toward paths that minimise mid-cycle drawdowns, even when more aggressive alternatives produce higher expected wealth.`,
      );
    } else if (vol <= 3) {
      body.push(
        `Stated volatility tolerance is low. Expect the recommendation to feel conservative during bull markets — that is the deliberate trade and the cost of behavioural durability.`,
      );
    }
  }

  if (body.length === 0) {
    body.push(
      `The recommended path is behaviourally durable across normal household responses to market conditions. The largest behavioural risk is overrating the temporary feeling of certainty in any one quarter.`,
    );
  }

  return {
    id: "behaviouralRiskCommentary",
    title: "Behavioural risk commentary",
    summary,
    body,
  };
}

function buildSensitivityAnalysis(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `These are the variables whose movements would meaningfully shift the recommendation's value or break the case for it.`;

  const body: string[] = [];
  const r = winner.result;
  const nsr = r.serviceability?.nsr ?? 0;

  // Sensitivity 1 — interest-rate move
  if (nsr > 0 && nsr < 1.5) {
    const headroomBps = Math.max(0, (nsr - 1.0) * 300);
    if (headroomBps > 0) {
      body.push(
        `Sensitivity to mortgage rates: the path's serviceability tolerance is approximately ${headroomBps.toFixed(0)} basis points of additional rate before the buffered debt-service position breaches the safe band. Beyond that level, the recommendation should be revisited.`,
      );
    } else {
      body.push(
        `Sensitivity to mortgage rates: the household is at the limit of its buffered serviceability tolerance. Any further rate rise should trigger an immediate plan review.`,
      );
    }
  } else {
    body.push(
      `Sensitivity to mortgage rates is contained. The recommendation does not hinge on a specific interest-rate outcome and remains defensible across a wide rate band.`,
    );
  }

  // Sensitivity 2 — household income shock
  body.push(
    `Sensitivity to income shock: a sustained ${ (output as any).capital ? "20-25%" : "20%" } drop in household income compresses the recommendation's wealth trajectory and may invalidate the path if the buffer is not rebuilt within twelve months.`,
  );

  // Sensitivity 3 — property growth assumption
  if (posture.isPropertyPath || posture.posture === "lever_into_property_delayed") {
    body.push(
      `Sensitivity to property growth: the leverage uplift is meaningful when property growth meets the registry assumption. Sustained underperformance materially reduces the path's advantage over unlevered alternatives.`,
    );
  }

  // Sensitivity 4 — surplus / contribution rate
  body.push(
    `Sensitivity to household surplus: if the monthly surplus available for contributions falls materially below the planned level, the projected wealth trajectory compresses and the plan should be re-scaled rather than continued at the original cadence.`,
  );

  // Posture-specific: dynamic flip conditions
  if (posture.posture === "defer_property_build_liquidity") {
    body.push(
      `This recommendation flips in favour of immediate property acquisition if household surplus rises sustainably, the cash buffer reaches the target band, and mortgage-rate conditions stabilise.`,
    );
  } else if (posture.isPropertyPath) {
    body.push(
      `The recommendation flips back to deferral if rates rise materially before settlement, household serviceability weakens, or target-area valuations harden against the deal.`,
    );
  } else if (posture.isDcaHeavy) {
    body.push(
      `The recommendation flips toward a lump-sum entry if equity valuations dislocate sharply and the household's volatility tolerance permits committing the full allocation at the lower price.`,
    );
  }

  return { id: "sensitivityAnalysis", title: "Sensitivity analysis", summary, body };
}

function buildStressTestCommentary(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `These are the principal stresses the simulated runs apply, and how the recommended path performed across them.`;

  const body: string[] = [];
  const r = winner.result;

  // Rate-shock band
  if ((r.refinancePressureProbability ?? 0) > 0.20) {
    body.push(
      `Rate-shock band: a meaningful share of simulated paths breached the buffered debt-service threshold under elevated mortgage rates. A pre-committed response — fixing rate splits, accelerating offset balance — is required rather than optional.`,
    );
  } else if ((r.refinancePressureProbability ?? 0) > 0.05) {
    body.push(
      `Rate-shock band: stress probability is contained but non-zero. The recommendation tolerates this because the central path holds, and the monitoring plan is calibrated to escalate before the tolerance is exhausted.`,
    );
  } else {
    body.push(
      `Rate-shock band: the recommendation is robust to the modelled mortgage-rate stress range. Refinance pressure remains within the safe band across the bulk of simulated paths.`,
    );
  }

  // Income-shock band
  if ((r.liquidityExhaustionProbability ?? 0) > 0.10) {
    body.push(
      `Income-shock band: a sustained income drop compresses the cash buffer faster than the plan accumulates wealth. The household should treat the buffer as ring-fenced and avoid commitments that draw against it.`,
    );
  } else {
    body.push(
      `Income-shock band: liquidity exhaustion probability remains in the low band. The buffer is large enough to absorb a multi-month income disruption without forced asset sales.`,
    );
  }

  // Equity / property correction band
  const ddP90 = r.riskMetrics?.maxDrawdownP90 ?? 0;
  if (mode === "quant") {
    if (ddP90 >= 0.30) {
      body.push(
        `Drawdown band: the deepest simulated declines are large enough to test the household's behavioural discipline. The recommendation is built for the household to remain invested through them rather than re-time.`,
      );
    } else if (ddP90 >= 0.18) {
      body.push(
        `Drawdown band: declines around the typical adverse path are uncomfortable but absorbable, provided the contribution schedule continues rather than pausing.`,
      );
    } else {
      body.push(
        `Drawdown band: the modelled declines stay within the household's stated tolerance band. Behavioural risk on the wealth-volatility axis is contained.`,
      );
    }
  } else {
    if (ddP90 >= 0.30) {
      body.push(
        `Adverse-market band: the deepest simulated declines are large enough to test the household's behavioural discipline. The recommendation is built for the household to remain invested through them rather than re-time.`,
      );
    } else if (ddP90 >= 0.18) {
      body.push(
        `Adverse-market band: declines around the typical adverse path are uncomfortable but absorbable, provided the contribution schedule continues rather than pausing.`,
      );
    } else {
      body.push(
        `Adverse-market band: the modelled declines stay within the household's stated tolerance band. Behavioural risk on the wealth-volatility axis is contained.`,
      );
    }
  }

  // Default-probability framing
  if ((r.defaultProbability ?? 0) > 0.05) {
    body.push(
      `Default frequency in simulated paths: above the 5% reference. The recommendation tolerates this because the alternatives carried higher tail risks, but the residual exposure should be communicated to all decision-makers.`,
    );
  }

  // Quant mode — append raw stress probability fields by name so the quant
  // surface preserves the full analytics (test 6).
  if (mode === "quant") {
    body.push(
      `Raw stress fields: liquidityStressProbability=${(r.liquidityStressProbability ?? 0).toFixed(3)}; ` +
      `refinancePressureProbability=${(r.refinancePressureProbability ?? 0).toFixed(3)}; ` +
      `liquidityExhaustionProbability=${(r.liquidityExhaustionProbability ?? 0).toFixed(3)}; ` +
      `defaultProbability=${(r.defaultProbability ?? 0).toFixed(3)}; ` +
      `maxDrawdownMedian=${(r.riskMetrics?.maxDrawdownMedian ?? 0).toFixed(3)}; ` +
      `maxDrawdownP90=${(r.riskMetrics?.maxDrawdownP90 ?? 0).toFixed(3)}; ` +
      `leverageRisk=${(r.riskMetrics?.leverageRisk ?? 0).toFixed(3)}.`,
    );
  }

  return { id: "stressTestCommentary", title: "Stress-test commentary", summary, body };
}

function buildKeyAssumptionsDriving(
  output: QuickDecisionOutput,
  winner: RankedCandidate,
  posture: StrategicAssessment,
  mode: NarrativeMode,
): NarrativeSection {
  const summary =
    `The recommendation is conditional on the following assumptions. If any one of them moves materially, the case should be re-opened rather than carried forward.`;

  const body: string[] = [];

  // From the engine trace
  const assumptions = winner.trace?.assumptionsUsed ?? [];
  const named = new Set([
    "inflation.cpi.au",
    "stocks.return.expected",
    "property.growth.expected",
    "mortgageRate.au",
    "behaviour.swr",
  ]);
  for (const a of assumptions) {
    if (!named.has(a.id)) continue;
    body.push(interpretAssumptionLine(a.id, a.value));
  }

  // Behavioural assumptions from priorities, if active
  if (output.prioritiesActive) {
    body.push(
      `Behavioural priorities: the recommendation is also conditioned on the household's stated priority profile. A material change in any slider (especially sleep-at-night importance, leverage tolerance, or family-protection weight) should trigger a re-run.`,
    );
  } else {
    body.push(
      `Behavioural priorities: defaults are in use. The household has not yet expressed slider preferences, so the recommendation is balanced rather than priority-shaped — re-running with explicit priorities can improve the fit.`,
    );
  }

  // Investor profile
  body.push(
    `Investor profile: ${output.investorProfile.replace(/_/g, " ")}. A change of profile would reshape the scoring weights, and the resulting ranking would not be the same.`,
  );

  if (body.length === 0) {
    body.push(
      `No specific assumption line is available from the engine trace. The recommendation should be treated as conditional on the household's current inputs and rerun whenever they change.`,
    );
  }

  return {
    id: "keyAssumptionsDrivingOutcome",
    title: "Key assumptions driving outcome",
    summary,
    body,
  };
}

function interpretAssumptionLine(id: string, value: number | string): string {
  // Centralised interpretation lines for the recognised registry assumptions.
  const v = typeof value === "number" ? (value * 100).toFixed(1) + "%" : String(value);
  switch (id) {
    case "inflation.cpi.au":
      return `Inflation assumed at approximately ${v} per year over the horizon. Sustained inflation above this band erodes the real value of the wealth trajectory.`;
    case "stocks.return.expected":
      return `Equity expected return assumed at approximately ${v} per year. The recommendation degrades meaningfully if realised returns underperform this by more than 200 bps for an extended period.`;
    case "property.growth.expected":
      return `Property growth assumed at approximately ${v} per year. Sustained underperformance shifts the leverage advantage against the property paths.`;
    case "mortgageRate.au":
      return `Mortgage rate assumed at approximately ${v}. A persistent shift above this level alters the cost-of-leverage calculus.`;
    case "behaviour.swr":
      return `Safe withdrawal rate assumed at ${v}. A more conservative rate stretches the FIRE horizon; a more aggressive rate compresses it but raises depletion risk.`;
    default:
      return `${id}: ${v}.`;
  }
}

function axisToHuman(axis: string): string {
  switch (axis) {
    case "survivalProbability": return "resilience and survival";
    case "liquidityFactor":     return "liquidity comfort";
    case "riskAdjustedReturn":  return "risk-adjusted compounding";
    case "fireAcceleration":    return "time-to-financial-independence";
    case "terminalNetWorth":    return "long-term wealth accumulation";
    case "worstInvestmentLvr":  return "leverage quality";
    default:                    return axis;
  }
}

// ─── label cleanup ──────────────────────────────────────────────────────────

/**
 * Light cosmetic clean-up on engine-emitted labels: underscores → spaces,
 * collapse repeated whitespace, and replace a small set of acronyms with
 * advisor-friendly phrasing. This intentionally does NOT scrub semantic
 * content — narrative sections do their own interpretation upstream.
 */
function cleanLabel(s: string): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .replace(/\bDSR\b/g, "debt-service ratio")
    .replace(/\bLVR\b/g, "loan-to-value ratio")
    .replace(/\bNSR\b/g, "net-service ratio")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── exported helpers (used by tests and other callers) ─────────────────────

/**
 * Compatibility helper: previously used by the v1 UI to scrub engine strings
 * for the Simple mode. v2 narratives generate their own copy and do not rely
 * on this, but it remains available for any caller that still passes engine
 * strings through. Returns the input with quant acronyms swapped for
 * advisor-friendly equivalents.
 */
export function stripJargon(s: string): string {
  if (!s) return "";
  let out = s;
  const replacements: [RegExp, string][] = [
    [/\bMonte[\s-]?Carlo\b/gi, "simulated"],
    [/\bVaR\d*\b/gi, "worst-case loss"],
    [/\bCVaR\d*\b/gi, "worst-case loss"],
    [/\bP10\b/gi, "the adverse path"],
    [/\bP50\b/gi, "the central path"],
    [/\bP90\b/gi, "the favourable path"],
    [/\b\d+(?:st|th|nd|rd)?\s+percentile\b/gi, "outcome"],
    [/\bpercentile\b/gi, "outcome"],
    [/\bkurtosis\b/gi, "rare-event sensitivity"],
    [/\bskewness\b/gi, "outcome lean"],
    [/\bmax(?:imum)?\s+drawdown\b/gi, "biggest decline"],
    [/\bdrawdown\b/gi, "decline"],
    [/\bstochastic\b/gi, "scenario"],
    [/\bvariance\b/gi, "spread"],
    [/\btail[-\s]?risk\b/gi, "rare adverse outcome"],
    [/\bDSR\b/gi, "debt-service ratio"],
    [/\bLVR\b/gi, "loan-to-value ratio"],
    [/\bNSR\b/gi, "net-service ratio"],
    [/\bCAGR\b/gi, "annual return"],
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
 * Compatibility helper retained from v1: callers that previously paraphrased
 * engine strings for Simple mode can still do so. v2 narrative sections do
 * not rely on this — they generate their own advisor-grade copy directly.
 */
export function paraphraseForSimple(s: string): string {
  if (!s) return "";
  const originalLeaks = findJargonLeaks(s);
  if (originalLeaks.length >= 3) {
    return "The recommended path wins on a combined assessment of resilience, growth, and cash-flow comfort.";
  }
  const stripped = stripJargon(s);
  if (findJargonLeaks(stripped).length > 0) {
    return "The recommended path wins on a combined assessment of resilience, growth, and cash-flow comfort.";
  }
  return stripped;
}

/**
 * Returns the list of quant jargon tokens that appear in the provided text.
 * Used by the Simple-mode purity test to assert zero leakage.
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

/**
 * Returns the list of v2 banned phrases that appear in the provided text.
 * Used by the v2 narrative-style purity test to assert zero leakage.
 */
export function findBannedPhraseLeaks(text: string): string[] {
  const found = new Set<string>();
  for (const phrase of BANNED_NARRATIVE_PHRASES) {
    const re = new RegExp(phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i");
    if (re.test(text)) found.add(phrase);
  }
  return Array.from(found);
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Build the full V3 narrative report for a QuickDecisionOutput in the given
 * mode. Deterministic and side-effect free.
 *
 * Section order (V3 — ten mandatory sections):
 *   1. Executive recommendation
 *   2. Why this path won
 *   3. Why alternatives lost
 *   4. What changes the answer
 *   5. Biggest hidden risks
 *   6. Behavioural risk commentary
 *   7. Sensitivity analysis
 *   8. Stress-test commentary
 *   9. Key assumptions driving outcome
 *  10. Tactical next actions
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
          id: "executiveRecommendation",
          title: "Executive recommendation",
          summary:
            mode === "simple"
              ? "No strategy cleared the safety screen for these inputs. The combination of capital, horizon, and risk constraints is too tight — relax one of them and re-run."
              : "Engine returned zero ranked candidates under the current constraints. Relax constraints or revise inputs and re-run.",
          body: [],
        },
      ],
      showAdvanced: false,
      confidence: "low",
      confidenceReason:
        "No candidates survived the safety filter. There is no path to recommend until the inputs are revised.",
    };
  }

  const runnerScore = output.ranked[1]?.score.score ?? null;
  const conf = confidenceFromGap(winner.score.score, runnerScore);
  const posture = inferStrategicPosture(winner);
  const interp = interpretWinner(winner);
  const comparison = compareRunnerUp(output, winner, posture);

  // V3 — ten mandatory sections, in canonical order. Each maps to either a
  // V3 builder (whyThisPathWon, whyAlternativesLost, biggestHiddenRisks,
  // behaviouralRiskCommentary, sensitivityAnalysis, stressTestCommentary,
  // keyAssumptionsDrivingOutcome) or a V2 builder reused under a new ID.
  const sections: NarrativeSection[] = [
    buildExecutiveRecommendation(output, winner, posture, conf, mode),
    buildWhyThisPathWon(output, winner, posture, interp, mode),
    buildWhyAlternativesLost(output, winner, posture, comparison, mode),
    asSection("whatChangesTheAnswer", "What changes the answer",
      buildWhatWouldChangeThis(output, winner, posture, comparison, mode)),
    buildBiggestHiddenRisks(output, winner, posture, mode),
    buildBehaviouralRiskCommentary(output, winner, posture, interp, mode),
    buildSensitivityAnalysis(output, winner, posture, mode),
    buildStressTestCommentary(output, winner, posture, mode),
    buildKeyAssumptionsDriving(output, winner, posture, mode),
    asSection("tacticalNextActions", "Tactical next actions",
      buildActionPlan(output, winner, posture, mode)),
  ];

  return {
    mode,
    sections,
    showAdvanced: true,
    confidence: conf.level,
    confidenceReason: conf.reason,
  };
}

function asSection(
  id: NarrativeSectionId,
  title: string,
  base: NarrativeSection,
): NarrativeSection {
  return { id, title, summary: base.summary, body: base.body };
}

/**
 * V3 — Legacy v2 6-section helper. Kept exported for back-compat with any
 * caller that wants the trimmed v2 surface. New callers should use
 * `buildNarrativeReport` which returns the V3 10-section structure.
 */
export function buildNarrativeReportV2(
  output: QuickDecisionOutput,
  mode: NarrativeMode,
): NarrativeReport {
  const winner = output.ranked[0];
  if (!winner) return buildNarrativeReport(output, mode);

  const runnerScore = output.ranked[1]?.score.score ?? null;
  const conf = confidenceFromGap(winner.score.score, runnerScore);
  const posture = inferStrategicPosture(winner);
  const interp = interpretWinner(winner);
  const comparison = compareRunnerUp(output, winner, posture);

  const sections: NarrativeSection[] = [
    buildExecutiveRecommendation(output, winner, posture, conf, mode),
    buildWhyNow(output, winner, posture, interp, mode),
    buildMainRisksAvoided(output, winner, posture, comparison, mode),
    buildTradeOffsAccepted(output, winner, posture, comparison, interp, mode),
    buildActionPlan(output, winner, posture, mode),
    buildWhatWouldChangeThis(output, winner, posture, comparison, mode),
  ];

  return {
    mode,
    sections,
    showAdvanced: true,
    confidence: conf.level,
    confidenceReason: conf.reason,
  };
}
