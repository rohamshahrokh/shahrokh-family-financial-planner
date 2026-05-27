/**
 * portfolioLabOptimizer.ts — Sprint 6 Phase 5, Portfolio Lab Optimizer
 * orchestration.
 *
 * Pure orchestration layer over existing canonical and Sprint 5 engines.
 * This module DOES NOT introduce any new financial formula, household
 * value, growth/SWR/yield assumption, or page-specific calculation.
 *
 * It assembles the Portfolio Lab Optimizer display contract by mapping
 * the outputs of:
 *
 *   - canonical headline metrics (Sprint 4D)
 *   - canonical FIRE facade (Sprint 4D)
 *   - canonical risk surface / risk engine (Sprint 3)
 *   - Monte Carlo result (canonical MC)
 *   - goal solver (Sprint 5 Phase 1)
 *   - decision candidate generator (Sprint 5 Phase 2)
 *   - decision ranking (Sprint 5 Phase 2)
 *   - best move engine (Sprint 5 Phase 3)
 *   - CFO advisor (Sprint 5 Phase 4)
 *
 * Every numeric field on the contract is sourced from one of those
 * engines. When a supporting engine output is missing the field is
 * surfaced as `value: null, incomplete: true` rather than fabricated.
 *
 * The Top 10 ranked strategies are produced from existing decision
 * candidates and (optionally) two compositions that the engines today
 * do not model directly — those compositions are marked explicitly with
 * `notEngineModelled: true` and carry only the pass-through engine
 * deltas of their constituent candidate, never invented numbers.
 *
 * The Probability of Success card and Portfolio Stress Test card derive
 * purely from Monte Carlo and Risk Engine outputs respectively, and
 * display an explicit "incomplete" state when the engine output is
 * missing.
 *
 * Strategic / qualitative ideas live on the same `StrategicIdea` shape
 * used in Sprint 6 Phase 4 — numeric-free, labelled "Not engine-
 * modelled".
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  type CanonicalHeadlineMetrics,
} from "./canonicalHeadlineMetrics";
import { computeCanonicalFire, type CanonicalFire } from "./canonicalFire";
import {
  solveGoalGap,
  type GoalSolverInputs,
  type GoalSolverOutputs,
} from "./goalSolver";
import {
  generateDecisionCandidates,
  type CandidateGeneratorOutputs,
  type CandidateKind,
  type DecisionCandidate,
} from "./decisionCandidates";
import {
  rankDecisionCandidates,
  type RankingOutput,
  type RankedCandidate,
} from "./decisionRanking";
import {
  computeBestMoveSprint5,
  type BestMoveResult,
} from "./bestMoveEngineSprint5";
import {
  generateCFOInsights,
  type CFOAdvisorResult,
} from "./cfoAdvisor";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";
import { formatConfidence } from "./confidenceLabels";

/* ─── Display contract primitives ──────────────────────────────────────── */

/**
 * A single labelled metric, paired with its source engine for the audit
 * trail. `value: null` plus `incomplete: true` is the canonical "missing
 * data" affordance.
 */
export interface OptimizerMetric {
  label: string;
  value: number | null;
  format:
    | "currency"
    | "currency-per-year"
    | "currency-per-month"
    | "percent"
    | "band"
    | "score"
    | "years"
    | "months"
    | "date"
    | "text";
  textOverride?: string | null;
  /** Source engine identifier (audit trail). */
  source: string;
  /** True when the supporting engine output is missing or flagged incomplete. */
  incomplete: boolean;
}

/**
 * Sprint 15 Phase 3 — pick a format token for a Confidence metric based on
 * source provenance. Real MC stays as `"percent"`; everything else routes
 * through the banded display.
 */
function formatForConfidenceSource(source: string): OptimizerMetric["format"] {
  return /montecarlo|monte_carlo|prob_ff/i.test(source) ? "percent" : "band";
}

function makeMetric(
  label: string,
  value: number | null,
  format: OptimizerMetric["format"],
  source: string,
  opts: { incomplete?: boolean; textOverride?: string | null } = {},
): OptimizerMetric {
  return {
    label,
    value,
    format,
    textOverride: opts.textOverride ?? null,
    source,
    incomplete: Boolean(opts.incomplete),
  };
}

function emptyMetric(
  label: string,
  format: OptimizerMetric["format"],
  source = "no-ledger",
): OptimizerMetric {
  return makeMetric(label, null, format, source, {
    incomplete: true,
    textOverride: "—",
  });
}

/* ─── Section 1 — Current Position ─────────────────────────────────────── */

export interface CurrentPositionSection {
  netWorth:        OptimizerMetric;
  assets:          OptimizerMetric;
  liabilities:     OptimizerMetric;
  passiveIncome:   OptimizerMetric;
  monthlyIncome:   OptimizerMetric;
  monthlyExpenses: OptimizerMetric;
  monthlySurplus:  OptimizerMetric;
  /** Investible (non-PPOR, non-car, non-Iran-property) base — pass-through
   *  from goalSolver.trace.currentInvestibleBase. */
  investibleBase:  OptimizerMetric;
  /** Cash + offset runway in months — from decisionCandidates.trace. */
  liquidityRunway: OptimizerMetric;
  incomplete: boolean;
}

/* ─── Section 2 — Target Position ──────────────────────────────────────── */

export interface TargetPositionSection {
  fireNumber:               OptimizerMetric;
  targetPassiveIncome:      OptimizerMetric;
  requiredAssetBase:        OptimizerMetric;
  requiredMonthlyContribution: OptimizerMetric;
  requiredPortfolioGrowth:  OptimizerMetric;
  safeWithdrawalRate:       OptimizerMetric;
  incomplete: boolean;
}

/* ─── Section 3 — Gap To Target ────────────────────────────────────────── */

export interface GapToTargetSection {
  netWorthGap:                OptimizerMetric;
  assetBaseGap:               OptimizerMetric;
  passiveIncomeGap:           OptimizerMetric;
  monthlyContributionGap:     OptimizerMetric;
  /** Years ahead or behind the target — goalSolver.yearsAheadOrBehind. */
  yearsAheadBehind:           OptimizerMetric;
  feasibility: OptimizerFeasibility;
  feasibilityLabel: string;
  /** Plain-English summary of what makes the gap close — pass-through from
   *  goalSolver.trace.reasoning. */
  summary: string;
  incomplete: boolean;
}

export type OptimizerFeasibility =
  | "ON_TRACK"
  | "STRETCH"
  | "UNREALISTIC"
  | "IMPOSSIBLE"
  | "UNKNOWN";

/* ─── Section 4 — Portfolio Optimization Engine ────────────────────────── */

/**
 * The full set of optimizer levers required by the Sprint 6 Phase 5 brief.
 * Each lever is a *label* over an existing decision candidate or a
 * combination of candidates. The orchestration layer NEVER invents
 * financial outcomes for a lever.
 *
 * Hybrid levers (e.g. ETF + property, debt + offset) are explicitly
 * marked `notEngineModelled: true` until the engine layer differentiates
 * them — the UI renders them with a "Not engine-modelled yet" label and
 * uses only the deltas of the constituent candidate it does map to.
 */
export type OptimizerLeverId =
  | "additional-property"
  | "earlier-property"
  | "delayed-property"
  | "etf-increase"
  | "stock-increase"
  | "crypto-increase"
  | "debt-reduction"
  | "offset-allocation"
  | "surplus-allocation"
  | "hybrid-property-etf"
  | "hybrid-debt-offset";

export interface OptimizerLeverDefinition {
  id: OptimizerLeverId;
  label: string;
  description: string;
  /** The Sprint 5 candidate kind this lever resolves to. `null` means the
   *  lever is composite and the engines do not model it directly today. */
  candidateKind: CandidateKind | null;
  /** True when the engine layer does not currently differentiate this
   *  lever from an existing candidate — the UI surfaces this clearly. */
  notEngineModelled: boolean;
}

export const OPTIMIZER_LEVER_DEFINITIONS: OptimizerLeverDefinition[] = [
  {
    id: "additional-property",
    label: "Additional Property",
    description: "Add another investment property on top of the current plan.",
    candidateKind: "buy-investment-property",
    // Engine does not differentiate "another" property vs first property
    // purchase — surfaced as not-yet-modelled to avoid fabricating.
    notEngineModelled: true,
  },
  {
    id: "earlier-property",
    label: "Earlier Property",
    description: "Bring forward the next investment property purchase.",
    candidateKind: "buy-investment-property",
    notEngineModelled: false,
  },
  {
    id: "delayed-property",
    label: "Delayed Property",
    description: "Push the next investment property purchase later.",
    candidateKind: "delay-purchase",
    notEngineModelled: false,
  },
  {
    id: "etf-increase",
    label: "ETF Increase",
    description: "Direct more monthly surplus into ETF / index contributions.",
    candidateKind: "etf-investment",
    notEngineModelled: false,
  },
  {
    id: "stock-increase",
    label: "Stock Increase",
    description: "Increase contributions into the share portfolio.",
    candidateKind: "etf-investment",
    // Engine collapses individual stock vs ETF contributions today.
    notEngineModelled: true,
  },
  {
    id: "crypto-increase",
    label: "Crypto Increase",
    description: "Increase contributions into the crypto portfolio.",
    candidateKind: "etf-investment",
    // Engine does not produce a differentiated crypto allocation candidate.
    notEngineModelled: true,
  },
  {
    id: "debt-reduction",
    label: "Debt Reduction",
    description: "Channel surplus into accelerated debt repayment.",
    candidateKind: "debt-reduction",
    notEngineModelled: false,
  },
  {
    id: "offset-allocation",
    label: "Offset Allocation",
    description: "Move surplus cash into the mortgage offset account.",
    candidateKind: "offset-contribution",
    notEngineModelled: false,
  },
  {
    id: "surplus-allocation",
    label: "Surplus Allocation",
    description: "Park surplus into the cash reserve buffer.",
    candidateKind: "cash-reserve-increase",
    notEngineModelled: false,
  },
  {
    id: "hybrid-property-etf",
    label: "Hybrid Property + ETF",
    description: "Blend a property purchase with ongoing ETF contributions.",
    candidateKind: null,
    notEngineModelled: true,
  },
  {
    id: "hybrid-debt-offset",
    label: "Hybrid Debt + Offset",
    description: "Combine accelerated debt reduction with offset top-ups.",
    candidateKind: null,
    notEngineModelled: true,
  },
];

export interface OptimizerLeverRow {
  id: OptimizerLeverId;
  definition: OptimizerLeverDefinition;
  /** Underlying candidate the lever was mapped to (when one was produced). */
  candidate: DecisionCandidate | null;
  /** Ranked row for that candidate (when present). */
  ranked: RankedCandidate | null;
  /** True when this lever's underlying engine output is missing. */
  incomplete: boolean;
  /** Pass-through delta on a single canonical dimension, per lever. */
  metrics: {
    deltaNetWorth:           OptimizerMetric;
    deltaPassiveIncome:      OptimizerMetric;
    deltaMonthlySurplus:     OptimizerMetric;
    deltaLiquidityMonths:    OptimizerMetric;
    deltaFireProgress:       OptimizerMetric;
    rankingScore:            OptimizerMetric;
    monteCarloProbability:   OptimizerMetric;
    confidence:              OptimizerMetric;
  };
}

export interface OptimizationEngineSection {
  levers: OptimizerLeverRow[];
  incomplete: boolean;
}

/* ─── Section 5 — Ranked Portfolio Strategies (Top 10) ─────────────────── */

/**
 * A single ranked strategy.
 *
 * A strategy is a labelled wrapper over an existing decision-engine
 * candidate (or, in the case of "compositions", a clearly-marked
 * not-engine-modelled overlay on top of a candidate). It carries
 * pass-through deltas only — no engine-side number is invented here.
 */
export interface RankedStrategy {
  /** 1..10 — display rank from the engine output. */
  rank: number;
  /** Composite ranking score from decisionRanking. */
  score: number;
  /** Engine candidate id this strategy is wrapping. */
  candidateId: string;
  candidateKind: CandidateKind;
  /** Human-readable label for the strategy. */
  label: string;
  /** Plain-English rationale — pass-through from candidate.rationale +
   *  ranking.reasoning. */
  rationale: string;
  /** True when the strategy is the engine's recommended Best Move. */
  isRecommended: boolean;
  /** True when this strategy is a not-engine-modelled composition. The UI
   *  is required to render the "Not engine-modelled" label on this row. */
  notEngineModelled: boolean;
  /** Pass-through projection deltas. */
  metrics: {
    deltaNetWorth:         OptimizerMetric;
    deltaPassiveIncome:    OptimizerMetric;
    deltaMonthlySurplus:   OptimizerMetric;
    deltaFireProgress:     OptimizerMetric;
    monteCarloProbability: OptimizerMetric;
    executionRisk:         OptimizerMetric;
    liquidityRisk:         OptimizerMetric;
  };
}

export interface RankedStrategiesSection {
  /** Up to ten ranked strategies — fewer when the engine produced fewer
   *  candidates. */
  strategies: RankedStrategy[];
  /** True when fewer than 10 candidates were available, OR any underlying
   *  candidate was flagged incomplete. */
  incomplete: boolean;
}

/* ─── Section 6 — Probability Of Success ───────────────────────────────── */

export interface ProbabilityOfSuccessSection {
  /** Best Move confidence value 0..1 — bestMoveEngineSprint5.confidenceScore. */
  bestMoveConfidence: OptimizerMetric;
  /** Best Move confidence band — pass-through. */
  bestMoveBand: string;
  /** Monte Carlo P(financial freedom) in 0..1 — pass-through from
   *  monteCarloEngine.prob_ff/100. null when MC missing. */
  monteCarloProbability: OptimizerMetric;
  /** Per-strategy MC confidence quoted from the top candidate. */
  recommendedStrategyMc: OptimizerMetric;
  incomplete: boolean;
  /** Plain-English summary describing the data sources or absence. */
  summary: string;
}

/* ─── Section 7 — Time To FIRE ─────────────────────────────────────────── */

export interface TimeToFireSection {
  /** goalSolver.trace.projectedAchievementYear pass-through. */
  projectedAchievementYear: OptimizerMetric;
  /** goalSolver.trace.yearsToTarget pass-through. */
  yearsToTarget: OptimizerMetric;
  /** goalSolver.yearsAheadOrBehind pass-through. */
  yearsAheadBehind: OptimizerMetric;
  /** Best-Move adjusted achievement year — projected year nudged by
   *  candidate.projection.deltaFireProgress × yearsToTarget, same
   *  pass-through pattern used by Phase 4. */
  bestMoveAchievementYear: OptimizerMetric;
  incomplete: boolean;
}

/* ─── Section 8 — Required Monthly Contribution ────────────────────────── */

export interface RequiredMonthlyContributionSection {
  /** goalSolver.requiredMonthlyContribution. */
  required: OptimizerMetric;
  /** goalSolver.trace.monthlySurplusAvailable. */
  available: OptimizerMetric;
  /** Difference (required − available). */
  gap: OptimizerMetric;
  /** Coverage ratio (available / required) — 0..1+. */
  coverage: OptimizerMetric;
  incomplete: boolean;
}

/* ─── Section 9 — Required Asset Base ──────────────────────────────────── */

export interface RequiredAssetBaseSection {
  /** goalSolver.requiredAssetBase. */
  required: OptimizerMetric;
  /** goalSolver.trace.currentInvestibleBase. */
  current: OptimizerMetric;
  /** Difference (required − current). */
  gap: OptimizerMetric;
  /** Coverage ratio (current / required). */
  coverage: OptimizerMetric;
  /** Required CAGR to reach the asset base — goalSolver.requiredPortfolioGrowth. */
  requiredGrowth: OptimizerMetric;
  incomplete: boolean;
}

/* ─── Section 10 — Portfolio Stress Test ───────────────────────────────── */

export interface StressTestRow {
  /** Stable id for tests. */
  id: string;
  /** Human-readable scenario label — pass-through from riskEngine fields. */
  label: string;
  /** Pass-through score / value. */
  metric: OptimizerMetric;
  /** Severity band — pass-through from risk engine. */
  band: "ok" | "watch" | "fragile" | "unknown";
}

export interface PortfolioStressTestSection {
  /** riskEngine.overall_score (0..100). */
  overallRiskScore: OptimizerMetric;
  /** monteCarloEngine.prob_neg_cf when present. */
  probNegativeCashflow: OptimizerMetric;
  /** Per-driver stress rows. */
  rows: StressTestRow[];
  incomplete: boolean;
}

/* ─── Section 11 — Why This Strategy Wins ──────────────────────────────── */

export interface WhyThisWinsSection {
  /** bestMoveEngineSprint5.bestNextAction.label. */
  strategyLabel: string;
  /** bestMoveEngineSprint5.whyThisBeatsAlternatives.narrative. */
  narrative: string;
  /** Decisive factors — pass-through from bestMoveEngineSprint5. */
  decisiveFactors: Array<{
    dimension: string;
    bestContribution: number;
    runnerUpContribution: number;
    contributionGap: number;
  }>;
  /** Confidence of the winning strategy — bestMoveEngineSprint5.confidenceScore. */
  confidence: OptimizerMetric;
  incomplete: boolean;
}

/* ─── Section 12 — What Could Cause Failure ────────────────────────────── */

export interface FailureMode {
  id: string;
  /** Plain-English failure description — pass-through from cfoAdvisor /
   *  riskEngine. Never invents new dollar figures. */
  description: string;
  /** Source engine (audit trail). */
  source: string;
  /** Severity — pass-through from cfo advisor / risk engine; falls back to
   *  "moderate" when no severity band is supplied. */
  severity: "low" | "moderate" | "high" | "critical";
}

export interface WhatCouldFailSection {
  failureModes: FailureMode[];
  incomplete: boolean;
}

/* ─── Section 13 — Audit Trail ─────────────────────────────────────────── */

export interface OptimizerAuditEntry {
  id: string;
  label: string;
  /** Engines consulted. */
  enginesUsed: string[];
  /** Inputs consulted (names only). */
  inputsUsed: string[];
  /** Assumption identifiers. */
  assumptions: string[];
  /** Source of the confidence value attached to this section. */
  confidenceSource: string;
  /** Source of the risk score attached to this section. */
  riskSource: string;
  /** Source of the Monte Carlo probability attached to this section. */
  monteCarloSource: string;
  /** Plain-English "how was this calculated?" expansion. */
  howCalculated: string;
  incomplete: boolean;
}

export interface OptimizerAuditTrailSection {
  entries: OptimizerAuditEntry[];
  incomplete: boolean;
}

/* ─── Section 14 — Confidence Report ───────────────────────────────────── */

export interface ConfidenceReportSection {
  /** Overall confidence — Best Move composite. */
  overall: OptimizerMetric;
  /** Best Move band ("low" | "moderate" | "high"). */
  band: string;
  /** Component contributions — Monte Carlo, margin, data coverage. */
  components: {
    monteCarlo:   OptimizerMetric;
    scoreMargin:  OptimizerMetric;
    dataCoverage: OptimizerMetric;
  };
  /** Plain-English summary. */
  summary: string;
  incomplete: boolean;
}

/* ─── Strategic Ideas (Phase 4 shape, numeric-free) ────────────────────── */

export interface StrategicIdea {
  id: string;
  title: string;
  body: string;
  /** Always true. Tests pin this so the field cannot drift. */
  notEngineModelled: true;
}

export interface StrategicIdeasSection {
  ideas: StrategicIdea[];
}

const STRATEGIC_IDEAS_CATALOGUE: StrategicIdea[] = [
  {
    id: "debt-recycle",
    title: "Debt recycling",
    body:
      "Convert non-deductible home-loan debt into deductible investment debt as principal is repaid. Requires a structured borrowing strategy and tax review.",
    notEngineModelled: true,
  },
  {
    id: "refinance",
    title: "Refinance to a sharper product",
    body:
      "Move the mortgage to a better-priced product or a lender with stronger offset rules. Requires lender comparison and conveyancing.",
    notEngineModelled: true,
  },
  {
    id: "increase-income",
    title: "Increase household income",
    body:
      "Negotiate, change roles, add a side income stream, or restructure entitlements. Lifts every other lever in the plan.",
    notEngineModelled: true,
  },
  {
    id: "higher-yield-property",
    title: "Higher-yield property strategy",
    body:
      "Target sub-markets with stronger gross yield or cashflow-positive structures. Requires acquisition discipline and research.",
    notEngineModelled: true,
  },
  {
    id: "reduce-expenses",
    title: "Reduce household expenses",
    body:
      "Audit recurring spending, subscriptions, insurance, utilities. Lifts surplus, which every downstream engine consumes.",
    notEngineModelled: true,
  },
  {
    id: "asset-rotation",
    title: "Asset rotation",
    body:
      "Rebalance between under-performing and higher-conviction assets without changing the structural shape of the portfolio.",
    notEngineModelled: true,
  },
];

/* ─── Inputs / Result ──────────────────────────────────────────────────── */

export interface PortfolioLabOptimizerInputs {
  canonicalLedger: DashboardInputs | null | undefined;
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
}

export interface PortfolioLabOptimizerResult {
  /** True when the canonical ledger is missing — every section renders empty. */
  empty: boolean;
  emptyReason?: string;
  currentPosition:    CurrentPositionSection;
  targetPosition:     TargetPositionSection;
  gapToTarget:        GapToTargetSection;
  optimization:       OptimizationEngineSection;
  rankedStrategies:   RankedStrategiesSection;
  probabilityOfSuccess: ProbabilityOfSuccessSection;
  timeToFire:         TimeToFireSection;
  requiredMonthlyContribution: RequiredMonthlyContributionSection;
  requiredAssetBase:  RequiredAssetBaseSection;
  portfolioStressTest: PortfolioStressTestSection;
  whyThisWins:        WhyThisWinsSection;
  whatCouldFail:      WhatCouldFailSection;
  auditTrail:         OptimizerAuditTrailSection;
  confidenceReport:   ConfidenceReportSection;
  strategicIdeas:     StrategicIdeasSection;
  /** Engine bundle the sections were built from (audit / tests). */
  bundle: {
    head: CanonicalHeadlineMetrics;
    fire: CanonicalFire;
    goal: GoalSolverOutputs;
    candidates: CandidateGeneratorOutputs;
    ranking: RankingOutput;
    bestMove: BestMoveResult;
    cfo: CFOAdvisorResult;
  } | null;
}

/* ─── Empty-state factories ────────────────────────────────────────────── */

function emptyResult(reason: string): PortfolioLabOptimizerResult {
  const emptyOptimizationLevers: OptimizerLeverRow[] =
    OPTIMIZER_LEVER_DEFINITIONS.map(def => ({
      id: def.id,
      definition: def,
      candidate: null,
      ranked: null,
      incomplete: true,
      metrics: {
        deltaNetWorth:         emptyMetric("Δ Net Worth", "currency"),
        deltaPassiveIncome:    emptyMetric("Δ Passive Income", "currency-per-year"),
        deltaMonthlySurplus:   emptyMetric("Δ Monthly Surplus", "currency-per-month"),
        deltaLiquidityMonths:  emptyMetric("Δ Liquidity", "months"),
        deltaFireProgress:     emptyMetric("Δ FIRE Progress", "percent"),
        rankingScore:          emptyMetric("Ranking Score", "score"),
        monteCarloProbability: emptyMetric("Monte Carlo", "percent"),
        confidence:            emptyMetric("Confidence", "percent"),
      },
    }));

  return {
    empty: true,
    emptyReason: reason,
    currentPosition: {
      netWorth:        emptyMetric("Net Worth", "currency"),
      assets:          emptyMetric("Total Assets", "currency"),
      liabilities:     emptyMetric("Total Liabilities", "currency"),
      passiveIncome:   emptyMetric("Passive Income", "currency-per-year"),
      monthlyIncome:   emptyMetric("Monthly Income", "currency-per-month"),
      monthlyExpenses: emptyMetric("Monthly Expenses", "currency-per-month"),
      monthlySurplus:  emptyMetric("Monthly Surplus", "currency-per-month"),
      investibleBase:  emptyMetric("Investible Base", "currency"),
      liquidityRunway: emptyMetric("Liquidity Runway", "months"),
      incomplete: true,
    },
    targetPosition: {
      fireNumber:                  emptyMetric("FIRE Number", "currency"),
      targetPassiveIncome:         emptyMetric("Target Passive Income", "currency-per-year"),
      requiredAssetBase:           emptyMetric("Required Asset Base", "currency"),
      requiredMonthlyContribution: emptyMetric("Required Monthly Contribution", "currency-per-month"),
      requiredPortfolioGrowth:     emptyMetric("Required Portfolio Growth", "percent"),
      safeWithdrawalRate:          emptyMetric("Safe Withdrawal Rate", "percent"),
      incomplete: true,
    },
    gapToTarget: {
      netWorthGap:                emptyMetric("Net Worth Gap", "currency"),
      assetBaseGap:               emptyMetric("Asset Base Gap", "currency"),
      passiveIncomeGap:           emptyMetric("Passive Income Gap", "currency-per-year"),
      monthlyContributionGap:     emptyMetric("Monthly Contribution Gap", "currency-per-month"),
      yearsAheadBehind:           emptyMetric("Years Ahead/Behind", "years"),
      feasibility: "UNKNOWN",
      feasibilityLabel: "Awaiting data",
      summary: "Canonical ledger is missing — feasibility analysis unavailable.",
      incomplete: true,
    },
    optimization: { levers: emptyOptimizationLevers, incomplete: true },
    rankedStrategies: { strategies: [], incomplete: true },
    probabilityOfSuccess: {
      bestMoveConfidence:    emptyMetric("Best Move Confidence", "percent"),
      bestMoveBand: "—",
      monteCarloProbability: emptyMetric("Monte Carlo P(success)", "percent"),
      recommendedStrategyMc: emptyMetric("Top Strategy MC", "percent"),
      incomplete: true,
      summary: "Canonical ledger missing — no probability available.",
    },
    timeToFire: {
      projectedAchievementYear: emptyMetric("Projected Year", "date"),
      yearsToTarget:            emptyMetric("Years To Target", "years"),
      yearsAheadBehind:         emptyMetric("Years Ahead/Behind", "years"),
      bestMoveAchievementYear:  emptyMetric("Best Move Year", "date"),
      incomplete: true,
    },
    requiredMonthlyContribution: {
      required:  emptyMetric("Required Monthly Contribution", "currency-per-month"),
      available: emptyMetric("Available Surplus", "currency-per-month"),
      gap:       emptyMetric("Contribution Gap", "currency-per-month"),
      coverage:  emptyMetric("Coverage Ratio", "percent"),
      incomplete: true,
    },
    requiredAssetBase: {
      required:       emptyMetric("Required Asset Base", "currency"),
      current:        emptyMetric("Current Investible Base", "currency"),
      gap:            emptyMetric("Asset Base Gap", "currency"),
      coverage:       emptyMetric("Coverage Ratio", "percent"),
      requiredGrowth: emptyMetric("Required Growth", "percent"),
      incomplete: true,
    },
    portfolioStressTest: {
      overallRiskScore:     emptyMetric("Overall Risk Score", "score"),
      probNegativeCashflow: emptyMetric("P(Negative Cashflow)", "percent"),
      rows: [],
      incomplete: true,
    },
    whyThisWins: {
      strategyLabel: "Awaiting data",
      narrative: "Run the engines once a ledger is loaded.",
      decisiveFactors: [],
      confidence: emptyMetric("Confidence", "percent"),
      incomplete: true,
    },
    whatCouldFail: { failureModes: [], incomplete: true },
    auditTrail:    { entries: [], incomplete: true },
    confidenceReport: {
      overall:  emptyMetric("Overall Confidence", "percent"),
      band: "—",
      components: {
        monteCarlo:   emptyMetric("Monte Carlo Component", "percent"),
        scoreMargin:  emptyMetric("Score Margin", "percent"),
        dataCoverage: emptyMetric("Data Coverage", "score"),
      },
      summary: "Confidence components unavailable until canonical ledger is loaded.",
      incomplete: true,
    },
    strategicIdeas: { ideas: STRATEGIC_IDEAS_CATALOGUE },
    bundle: null,
  };
}

/* ─── Section builders ─────────────────────────────────────────────────── */

function buildCurrentPosition(
  head: CanonicalHeadlineMetrics,
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
): CurrentPositionSection {
  const finite = (v: number) => Number.isFinite(v);
  return {
    netWorth: finite(head.netWorth)
      ? makeMetric("Net Worth", head.netWorth, "currency", "canonicalHeadlineMetrics.netWorth")
      : emptyMetric("Net Worth", "currency", "canonicalHeadlineMetrics.netWorth"),
    assets: finite(head.assets)
      ? makeMetric("Total Assets", head.assets, "currency", "canonicalHeadlineMetrics.assets")
      : emptyMetric("Total Assets", "currency", "canonicalHeadlineMetrics.assets"),
    liabilities: finite(head.liabilities)
      ? makeMetric("Total Liabilities", head.liabilities, "currency", "canonicalHeadlineMetrics.liabilities")
      : emptyMetric("Total Liabilities", "currency", "canonicalHeadlineMetrics.liabilities"),
    passiveIncome: finite(head.passiveIncome)
      ? makeMetric("Passive Income", head.passiveIncome, "currency-per-year", "canonicalHeadlineMetrics.passiveIncome")
      : emptyMetric("Passive Income", "currency-per-year", "canonicalHeadlineMetrics.passiveIncome"),
    monthlyIncome: finite(head.monthlyIncome)
      ? makeMetric("Monthly Income", head.monthlyIncome, "currency-per-month", "canonicalHeadlineMetrics.monthlyIncome")
      : emptyMetric("Monthly Income", "currency-per-month", "canonicalHeadlineMetrics.monthlyIncome"),
    monthlyExpenses: finite(head.monthlyExpenses)
      ? makeMetric("Monthly Expenses", head.monthlyExpenses, "currency-per-month", "canonicalHeadlineMetrics.monthlyExpenses")
      : emptyMetric("Monthly Expenses", "currency-per-month", "canonicalHeadlineMetrics.monthlyExpenses"),
    monthlySurplus: finite(head.monthlySurplus)
      ? makeMetric("Monthly Surplus", head.monthlySurplus, "currency-per-month", "canonicalHeadlineMetrics.monthlySurplus")
      : emptyMetric("Monthly Surplus", "currency-per-month", "canonicalHeadlineMetrics.monthlySurplus"),
    investibleBase: finite(goal.trace.currentInvestibleBase)
      ? makeMetric("Investible Base", goal.trace.currentInvestibleBase, "currency", "goalSolver.trace.currentInvestibleBase")
      : emptyMetric("Investible Base", "currency", "goalSolver.trace.currentInvestibleBase"),
    liquidityRunway: finite(cands.trace.baselineLiquidityMonths)
      ? makeMetric("Liquidity Runway", cands.trace.baselineLiquidityMonths, "months", "decisionCandidates.trace.baselineLiquidityMonths")
      : emptyMetric("Liquidity Runway", "months", "decisionCandidates.trace.baselineLiquidityMonths"),
    incomplete:
      !finite(head.netWorth) ||
      !finite(head.passiveIncome) ||
      !finite(goal.trace.currentInvestibleBase),
  };
}

function buildTargetPosition(
  fire: CanonicalFire,
  goal: GoalSolverOutputs,
): TargetPositionSection {
  const finite = (v: number) => Number.isFinite(v);
  const targetPassive = finite(fire.fireNumber) && fire.swrPct > 0
    ? (fire.fireNumber * fire.swrPct) / 100
    : NaN;

  return {
    fireNumber: fire.fireNumber > 0
      ? makeMetric("FIRE Number", fire.fireNumber, "currency", "canonicalFire.fireNumber")
      : makeMetric("FIRE Number", null, "currency", "canonicalFire.fireNumber", {
          incomplete: true,
          textOverride: "Set a FIRE target",
        }),
    targetPassiveIncome: Number.isFinite(targetPassive) && targetPassive > 0
      ? makeMetric("Target Passive Income", targetPassive, "currency-per-year", "canonicalFire.fireNumber × swrPct")
      : makeMetric("Target Passive Income", null, "currency-per-year", "canonicalFire", { incomplete: true }),
    requiredAssetBase: finite(goal.requiredAssetBase)
      ? makeMetric(
          "Required Asset Base",
          goal.requiredAssetBase,
          "currency",
          "goalSolver.requiredAssetBase",
          { incomplete: goal.requiredAssetBase <= 0 },
        )
      : makeMetric("Required Asset Base", null, "currency", "goalSolver.requiredAssetBase", { incomplete: true }),
    requiredMonthlyContribution: finite(goal.requiredMonthlyContribution)
      ? makeMetric(
          "Required Monthly Contribution",
          goal.requiredMonthlyContribution,
          "currency-per-month",
          "goalSolver.requiredMonthlyContribution",
          { incomplete: goal.requiredMonthlyContribution <= 0 },
        )
      : makeMetric("Required Monthly Contribution", null, "currency-per-month", "goalSolver.requiredMonthlyContribution", { incomplete: true }),
    requiredPortfolioGrowth: goal.requiredPortfolioGrowth != null && Number.isFinite(goal.requiredPortfolioGrowth)
      ? makeMetric("Required Portfolio Growth", goal.requiredPortfolioGrowth, "percent", "goalSolver.requiredPortfolioGrowth")
      : makeMetric("Required Portfolio Growth", null, "percent", "goalSolver.requiredPortfolioGrowth", { incomplete: true }),
    safeWithdrawalRate: fire.swrPct > 0
      ? makeMetric("Safe Withdrawal Rate", fire.swrPct / 100, "percent", "canonicalFire.swrPct")
      : makeMetric("Safe Withdrawal Rate", null, "percent", "canonicalFire.swrPct", { incomplete: true }),
    incomplete:
      !(fire.fireNumber > 0) ||
      !finite(goal.requiredAssetBase) ||
      goal.trace.incomplete,
  };
}

function buildGapToTarget(
  head: CanonicalHeadlineMetrics,
  fire: CanonicalFire,
  goal: GoalSolverOutputs,
): GapToTargetSection {
  const finite = (v: number) => Number.isFinite(v);
  const assetBaseGap = finite(goal.requiredAssetBase) && finite(goal.trace.currentInvestibleBase)
    ? Math.max(0, goal.requiredAssetBase - goal.trace.currentInvestibleBase)
    : NaN;

  const monthlyContributionGap = finite(goal.requiredMonthlyContribution)
    && finite(goal.trace.monthlySurplusAvailable)
    ? Math.max(0, goal.requiredMonthlyContribution - goal.trace.monthlySurplusAvailable)
    : NaN;

  const feasibility: OptimizerFeasibility = goal.fireFeasibility ?? "UNKNOWN";
  const feasibilityLabel = (() => {
    switch (feasibility) {
      case "ON_TRACK":     return "On track";
      case "STRETCH":      return "Stretch";
      case "UNREALISTIC":  return "Unrealistic";
      case "IMPOSSIBLE":   return "Impossible without change";
      default:             return "Awaiting data";
    }
  })();

  return {
    netWorthGap: finite(fire.gap)
      ? makeMetric("Net Worth Gap", fire.gap, "currency", "canonicalFire.gap")
      : makeMetric("Net Worth Gap", null, "currency", "canonicalFire.gap", { incomplete: true }),
    assetBaseGap: Number.isFinite(assetBaseGap)
      ? makeMetric("Asset Base Gap", assetBaseGap, "currency", "goalSolver.requiredAssetBase − goalSolver.trace.currentInvestibleBase")
      : makeMetric("Asset Base Gap", null, "currency", "goalSolver.requiredAssetBase", { incomplete: true }),
    passiveIncomeGap: goal.requiredPassiveIncomeGap > 0
      ? makeMetric("Passive Income Gap", goal.requiredPassiveIncomeGap, "currency-per-year", "goalSolver.requiredPassiveIncomeGap")
      : makeMetric("Passive Income Gap", 0, "currency-per-year", "goalSolver.requiredPassiveIncomeGap", { textOverride: "On target" }),
    monthlyContributionGap: Number.isFinite(monthlyContributionGap)
      ? makeMetric("Monthly Contribution Gap", monthlyContributionGap, "currency-per-month", "goalSolver.requiredMonthlyContribution − goalSolver.trace.monthlySurplusAvailable")
      : makeMetric("Monthly Contribution Gap", null, "currency-per-month", "goalSolver", { incomplete: true }),
    yearsAheadBehind: goal.yearsAheadOrBehind == null
      ? makeMetric("Years Ahead/Behind", null, "years", "goalSolver.yearsAheadOrBehind", {
          incomplete: true,
          textOverride: "Not projected",
        })
      : makeMetric(
          "Years Ahead/Behind",
          goal.yearsAheadOrBehind,
          "years",
          "goalSolver.yearsAheadOrBehind",
          { textOverride: goal.yearsAheadOrBehind >= 0
              ? `${goal.yearsAheadOrBehind.toFixed(1)} ahead`
              : `${Math.abs(goal.yearsAheadOrBehind).toFixed(1)} behind` },
        ),
    feasibility,
    feasibilityLabel,
    summary: goal.trace.reasoning && goal.trace.reasoning.length
      ? goal.trace.reasoning
      : "Engine derived the feasibility verdict from the canonical FIRE target, current projection, and surplus.",
    incomplete:
      goal.trace.incomplete ||
      !finite(head.netWorth) ||
      !finite(fire.gap),
  };
}

function buildOptimization(
  cands: CandidateGeneratorOutputs,
  ranking: RankingOutput,
  bestMove: BestMoveResult,
): OptimizationEngineSection {
  const usedIds = new Set<string>();
  const levers: OptimizerLeverRow[] = OPTIMIZER_LEVER_DEFINITIONS.map(def => {
    let candidate: DecisionCandidate | null = null;
    if (def.candidateKind) {
      // Prefer a candidate we haven't already mapped to a lever, but fall
      // back to any matching candidate so multi-lever mappings still work.
      candidate = cands.candidates.find(c => c.kind === def.candidateKind && !usedIds.has(c.id))
        ?? cands.candidates.find(c => c.kind === def.candidateKind)
        ?? null;
    } else if (def.id === "hybrid-property-etf") {
      candidate = cands.candidates.find(c => c.kind === "buy-investment-property") ?? null;
    } else if (def.id === "hybrid-debt-offset") {
      candidate = cands.candidates.find(c => c.kind === "debt-reduction")
        ?? cands.candidates.find(c => c.kind === "offset-contribution")
        ?? null;
    }
    if (candidate) usedIds.add(candidate.id);

    const ranked = candidate
      ? ranking.ranked.find(r => r.candidate.id === candidate!.id) ?? null
      : null;

    const incomplete =
      !candidate ||
      candidate.incomplete ||
      def.notEngineModelled;

    const reason = candidate
      ? def.notEngineModelled
        ? "decisionCandidates (composition — not engine-modelled)"
        : "decisionCandidates"
      : "no-candidate";

    const proj = candidate?.projection;
    const risk = candidate?.risk;

    return {
      id: def.id,
      definition: def,
      candidate,
      ranked,
      incomplete,
      metrics: {
        deltaNetWorth: proj
          ? makeMetric("Δ Net Worth", proj.deltaNetWorth, "currency", `${reason}.projection.deltaNetWorth`, { incomplete })
          : emptyMetric("Δ Net Worth", "currency", "no-candidate"),
        deltaPassiveIncome: proj
          ? makeMetric("Δ Passive Income", proj.deltaPassiveIncome, "currency-per-year", `${reason}.projection.deltaPassiveIncome`, { incomplete })
          : emptyMetric("Δ Passive Income", "currency-per-year", "no-candidate"),
        deltaMonthlySurplus: proj
          ? makeMetric("Δ Monthly Surplus", proj.deltaMonthlySurplus, "currency-per-month", `${reason}.projection.deltaMonthlySurplus`, { incomplete })
          : emptyMetric("Δ Monthly Surplus", "currency-per-month", "no-candidate"),
        deltaLiquidityMonths: proj
          ? makeMetric("Δ Liquidity", proj.deltaLiquidityMonths, "months", `${reason}.projection.deltaLiquidityMonths`, { incomplete })
          : emptyMetric("Δ Liquidity", "months", "no-candidate"),
        deltaFireProgress: proj
          ? makeMetric("Δ FIRE Progress", proj.deltaFireProgress, "percent", `${reason}.projection.deltaFireProgress`, { incomplete })
          : emptyMetric("Δ FIRE Progress", "percent", "no-candidate"),
        rankingScore: ranked
          ? makeMetric("Ranking Score", ranked.score, "score", "decisionRanking.score", { incomplete })
          : emptyMetric("Ranking Score", "score", "decisionRanking"),
        monteCarloProbability: risk && risk.mcConfidence != null
          ? makeMetric("Monte Carlo", risk.mcConfidence, "percent", "decisionCandidates.risk.mcConfidence", { incomplete })
          : emptyMetric("Monte Carlo", "percent", "decisionCandidates.risk.mcConfidence"),
        confidence: candidate && bestMove.bestNextAction.id === candidate.id
          ? makeMetric(
              "Confidence",
              bestMove.confidenceScore.value,
              formatForConfidenceSource("bestMoveEngineSprint5.confidenceScore"),
              "bestMoveEngineSprint5.confidenceScore",
              { incomplete },
            )
          : (risk && risk.mcConfidence != null
              ? makeMetric(
                  "Confidence",
                  risk.mcConfidence,
                  formatForConfidenceSource("decisionCandidates.risk.mcConfidence"),
                  "decisionCandidates.risk.mcConfidence",
                  { incomplete },
                )
              : emptyMetric("Confidence", "band", "bestMoveEngineSprint5.confidenceScore")),
      },
    };
  });

  return {
    levers,
    incomplete: levers.some(l => l.incomplete),
  };
}

function buildRankedStrategies(
  ranking: RankingOutput,
  bestMove: BestMoveResult,
): RankedStrategiesSection {
  // We pull from the existing ranked output directly. If the engine
  // produces fewer than 10 candidates, we surface only those that exist
  // (incomplete=true) — we do NOT fabricate filler rows.
  const ranked = ranking.ranked.slice(0, 10);
  const recommendedId = bestMove.bestNextAction.id;

  const strategies: RankedStrategy[] = ranked.map((r, idx) => {
    const c = r.candidate;
    const proj = c.projection;
    const risk = c.risk;
    return {
      rank: idx + 1,
      score: r.score,
      candidateId: c.id,
      candidateKind: c.kind,
      label: c.label,
      rationale:
        (c.rationale || "").trim() +
        (r.reasoning ? `\n\n${r.reasoning.trim()}` : ""),
      isRecommended: c.id === recommendedId,
      notEngineModelled: false,
      metrics: {
        deltaNetWorth: makeMetric(
          "Δ Net Worth",
          proj.deltaNetWorth,
          "currency",
          "decisionCandidates.projection.deltaNetWorth",
          { incomplete: c.incomplete },
        ),
        deltaPassiveIncome: makeMetric(
          "Δ Passive Income",
          proj.deltaPassiveIncome,
          "currency-per-year",
          "decisionCandidates.projection.deltaPassiveIncome",
          { incomplete: c.incomplete },
        ),
        deltaMonthlySurplus: makeMetric(
          "Δ Monthly Surplus",
          proj.deltaMonthlySurplus,
          "currency-per-month",
          "decisionCandidates.projection.deltaMonthlySurplus",
          { incomplete: c.incomplete },
        ),
        deltaFireProgress: makeMetric(
          "Δ FIRE Progress",
          proj.deltaFireProgress,
          "percent",
          "decisionCandidates.projection.deltaFireProgress",
          { incomplete: c.incomplete },
        ),
        monteCarloProbability: risk.mcConfidence != null
          ? makeMetric("Monte Carlo", risk.mcConfidence, "percent", "decisionCandidates.risk.mcConfidence", { incomplete: c.incomplete })
          : emptyMetric("Monte Carlo", "percent", "decisionCandidates.risk.mcConfidence"),
        executionRisk: makeMetric(
          "Execution Risk",
          risk.executionRisk,
          "score",
          "decisionCandidates.risk.executionRisk",
          { incomplete: c.incomplete },
        ),
        liquidityRisk: makeMetric(
          "Liquidity Risk",
          risk.liquidityRisk,
          "score",
          "decisionCandidates.risk.liquidityRisk",
          { incomplete: c.incomplete },
        ),
      },
    };
  });

  return {
    strategies,
    incomplete: strategies.length < 10 || strategies.some(s => s.metrics.deltaNetWorth.incomplete),
  };
}

function buildProbabilityOfSuccess(
  bestMove: BestMoveResult,
  ranking: RankingOutput,
  mc: MonteCarloResult | null | undefined,
): ProbabilityOfSuccessSection {
  /* Sprint 15 Phase 3 — Best Move confidence is the Sprint 5 heuristic blend,
     not a calibrated MC probability. Route through the `band` format token. */
  const bestMoveConfidence = bestMove.confidenceScore.value != null && Number.isFinite(bestMove.confidenceScore.value)
    ? makeMetric(
        "Best Move Confidence",
        bestMove.confidenceScore.value,
        formatForConfidenceSource("bestMoveEngineSprint5.confidenceScore"),
        "bestMoveEngineSprint5.confidenceScore",
      )
    : emptyMetric("Best Move Confidence", "band", "bestMoveEngineSprint5.confidenceScore");

  const monteCarloProbability = mc && typeof (mc as any).prob_ff === "number"
    ? makeMetric("Monte Carlo P(success)", (mc as any).prob_ff / 100, "percent", "monteCarloEngine.prob_ff")
    : makeMetric("Monte Carlo P(success)", null, "percent", "monteCarloEngine.prob_ff", {
        incomplete: true,
        textOverride: "Monte Carlo output unavailable",
      });

  const topRanked = ranking.recommended;
  const recommendedStrategyMc = topRanked && topRanked.candidate.risk.mcConfidence != null
    ? makeMetric(
        "Top Strategy MC",
        topRanked.candidate.risk.mcConfidence,
        formatForConfidenceSource("decisionCandidates.risk.mcConfidence"),
        "decisionCandidates.risk.mcConfidence",
      )
    : emptyMetric("Top Strategy MC", "band", "decisionCandidates.risk.mcConfidence");

  const summary = (() => {
    const bits: string[] = [];
    if (!bestMoveConfidence.incomplete) bits.push(`Best Move confidence: ${bestMove.confidenceScore.band}`);
    if (!monteCarloProbability.incomplete) bits.push("Monte Carlo P(financial freedom) from canonical MC");
    if (!recommendedStrategyMc.incomplete) bits.push("Top strategy MC: pass-through from candidate risk profile");
    if (!bits.length) return "Probability of success unavailable until Monte Carlo and decision engines run.";
    return bits.join(". ") + ".";
  })();

  return {
    bestMoveConfidence,
    bestMoveBand: bestMove.confidenceScore.band ?? "—",
    monteCarloProbability,
    recommendedStrategyMc,
    incomplete: bestMoveConfidence.incomplete || monteCarloProbability.incomplete,
    summary,
  };
}

function buildTimeToFire(
  goal: GoalSolverOutputs,
  bestMove: BestMoveResult,
  candidates: CandidateGeneratorOutputs,
): TimeToFireSection {
  const projectedYear = goal.trace.projectedAchievementYear;
  const projectedAchievementYear = projectedYear != null && Number.isFinite(projectedYear)
    ? makeMetric("Projected Year", projectedYear, "date", "goalSolver.trace.projectedAchievementYear")
    : makeMetric("Projected Year", null, "date", "goalSolver.trace.projectedAchievementYear", {
        incomplete: true,
        textOverride: "Not projected",
      });

  const yearsToTarget = goal.trace.yearsToTarget != null && Number.isFinite(goal.trace.yearsToTarget)
    ? makeMetric("Years To Target", goal.trace.yearsToTarget, "years", "goalSolver.trace.yearsToTarget")
    : makeMetric("Years To Target", null, "years", "goalSolver.trace.yearsToTarget", { incomplete: true, textOverride: "—" });

  const yearsAheadBehind = goal.yearsAheadOrBehind == null
    ? makeMetric("Years Ahead/Behind", null, "years", "goalSolver.yearsAheadOrBehind", { incomplete: true, textOverride: "Not projected" })
    : makeMetric("Years Ahead/Behind", goal.yearsAheadOrBehind, "years", "goalSolver.yearsAheadOrBehind");

  // Best-move adjusted projected achievement year — same pass-through nudge
  // used by Phase 4 Path Comparison fireAge.
  const bm = bestMove.bestNextAction;
  const bestCandidate = candidates.candidates.find(c => c.id === bm.id) ?? null;
  let bestYear: number | null = null;
  let bestYearText: string = "—";
  let bestYearIncomplete = true;
  if (projectedYear != null && Number.isFinite(projectedYear) && bestCandidate && goal.trace.yearsToTarget != null) {
    const adj = Math.round(projectedYear - bestCandidate.projection.deltaFireProgress * goal.trace.yearsToTarget);
    bestYear = adj;
    bestYearText = String(adj);
    bestYearIncomplete = bestCandidate.incomplete;
  } else if (projectedYear != null && Number.isFinite(projectedYear)) {
    bestYear = projectedYear;
    bestYearText = String(projectedYear);
    bestYearIncomplete = goal.trace.incomplete;
  }

  return {
    projectedAchievementYear,
    yearsToTarget,
    yearsAheadBehind,
    bestMoveAchievementYear: makeMetric(
      "Best Move Year",
      bestYear,
      "date",
      "goalSolver.trace.projectedAchievementYear + bestMoveEngineSprint5.bestNextAction",
      { incomplete: bestYearIncomplete, textOverride: bestYearText },
    ),
    incomplete: projectedAchievementYear.incomplete || yearsToTarget.incomplete,
  };
}

function buildRequiredMonthlyContribution(
  goal: GoalSolverOutputs,
): RequiredMonthlyContributionSection {
  const req = goal.requiredMonthlyContribution;
  const avail = goal.trace.monthlySurplusAvailable;
  const finite = (v: number) => Number.isFinite(v);

  const required = finite(req)
    ? makeMetric(
        "Required Monthly Contribution",
        req,
        "currency-per-month",
        "goalSolver.requiredMonthlyContribution",
        { incomplete: req <= 0 },
      )
    : makeMetric("Required Monthly Contribution", null, "currency-per-month", "goalSolver.requiredMonthlyContribution", { incomplete: true });

  const available = finite(avail)
    ? makeMetric("Available Surplus", avail, "currency-per-month", "goalSolver.trace.monthlySurplusAvailable")
    : makeMetric("Available Surplus", null, "currency-per-month", "goalSolver.trace.monthlySurplusAvailable", { incomplete: true });

  const gap = finite(req) && finite(avail)
    ? makeMetric("Contribution Gap", Math.max(0, req - avail), "currency-per-month", "goalSolver.requiredMonthlyContribution − goalSolver.trace.monthlySurplusAvailable")
    : makeMetric("Contribution Gap", null, "currency-per-month", "goalSolver", { incomplete: true });

  const coverage = finite(req) && req > 0 && finite(avail)
    ? makeMetric("Coverage Ratio", avail / req, "percent", "goalSolver.trace.monthlySurplusAvailable / goalSolver.requiredMonthlyContribution")
    : (finite(req) && req === 0
        ? makeMetric("Coverage Ratio", 1, "percent", "goalSolver", { textOverride: "On target" })
        : makeMetric("Coverage Ratio", null, "percent", "goalSolver", { incomplete: true }));

  return {
    required,
    available,
    gap,
    coverage,
    incomplete: required.incomplete || available.incomplete,
  };
}

function buildRequiredAssetBase(
  goal: GoalSolverOutputs,
): RequiredAssetBaseSection {
  const req = goal.requiredAssetBase;
  const cur = goal.trace.currentInvestibleBase;
  const finite = (v: number) => Number.isFinite(v);

  const required = finite(req)
    ? makeMetric(
        "Required Asset Base",
        req,
        "currency",
        "goalSolver.requiredAssetBase",
        { incomplete: req <= 0 },
      )
    : makeMetric("Required Asset Base", null, "currency", "goalSolver.requiredAssetBase", { incomplete: true });

  const current = finite(cur)
    ? makeMetric("Current Investible Base", cur, "currency", "goalSolver.trace.currentInvestibleBase")
    : makeMetric("Current Investible Base", null, "currency", "goalSolver.trace.currentInvestibleBase", { incomplete: true });

  const gap = finite(req) && finite(cur)
    ? makeMetric(
        "Asset Base Gap",
        Math.max(0, req - cur),
        "currency",
        "goalSolver.requiredAssetBase − goalSolver.trace.currentInvestibleBase",
        { incomplete: req <= 0 },
      )
    : makeMetric("Asset Base Gap", null, "currency", "goalSolver", { incomplete: true });

  const coverage = finite(req) && req > 0 && finite(cur)
    ? makeMetric("Coverage Ratio", cur / req, "percent", "goalSolver.trace.currentInvestibleBase / goalSolver.requiredAssetBase")
    : makeMetric("Coverage Ratio", null, "percent", "goalSolver", { incomplete: true });

  const requiredGrowth = goal.requiredPortfolioGrowth != null && Number.isFinite(goal.requiredPortfolioGrowth)
    ? makeMetric("Required Growth", goal.requiredPortfolioGrowth, "percent", "goalSolver.requiredPortfolioGrowth")
    : makeMetric("Required Growth", null, "percent", "goalSolver.requiredPortfolioGrowth", { incomplete: true });

  return {
    required,
    current,
    gap,
    coverage,
    requiredGrowth,
    incomplete: required.incomplete || current.incomplete,
  };
}

function buildPortfolioStressTest(
  risk: RiskRadarResult | null | undefined,
  mc: MonteCarloResult | null | undefined,
  bestMove: BestMoveResult,
): PortfolioStressTestSection {
  const overallRiskScore = risk && Number.isFinite(risk.overall_score)
    ? makeMetric("Overall Risk Score", risk.overall_score, "score", "riskEngine.overall_score")
    : makeMetric("Overall Risk Score", null, "score", "riskEngine.overall_score", {
        incomplete: true,
        textOverride: "Risk engine not run",
      });

  const probNegativeCashflow = mc && typeof (mc as any).prob_neg_cf === "number"
    ? makeMetric("P(Negative Cashflow)", (mc as any).prob_neg_cf / 100, "percent", "monteCarloEngine.prob_neg_cf")
    : makeMetric("P(Negative Cashflow)", null, "percent", "monteCarloEngine.prob_neg_cf", { incomplete: true });

  // Per-row stress signals come from the Best Move risk impact + risk engine
  // overall score. We translate execution / liquidity risk deltas (vs hold)
  // into rows the UI can render — these are pass-through values, not new
  // calculations.
  const rows: StressTestRow[] = [];
  const bandFromScore = (val: number): StressTestRow["band"] => {
    if (val >= 65) return "ok";
    if (val >= 40) return "watch";
    return "fragile";
  };
  if (risk && Number.isFinite(risk.overall_score)) {
    rows.push({
      id: "overall-risk",
      label: "Overall Risk Surface",
      metric: makeMetric("Overall Risk", risk.overall_score, "score", "riskEngine.overall_score"),
      band: bandFromScore(risk.overall_score),
    });
  }
  if (Number.isFinite(bestMove.riskImpact.executionRisk)) {
    const v = bestMove.riskImpact.executionRisk;
    rows.push({
      id: "execution-risk",
      label: "Execution Risk (Best Move)",
      metric: makeMetric("Execution Risk", v, "score", "bestMoveEngineSprint5.riskImpact.executionRisk"),
      band: v <= 30 ? "ok" : v <= 60 ? "watch" : "fragile",
    });
  }
  if (Number.isFinite(bestMove.riskImpact.liquidityRisk)) {
    const v = bestMove.riskImpact.liquidityRisk;
    rows.push({
      id: "liquidity-risk",
      label: "Liquidity Risk (Best Move)",
      metric: makeMetric("Liquidity Risk", v, "score", "bestMoveEngineSprint5.riskImpact.liquidityRisk"),
      band: v <= 30 ? "ok" : v <= 60 ? "watch" : "fragile",
    });
  }
  if (Number.isFinite(bestMove.liquidityImpact.postMoveRunwayMonths)) {
    const r = bestMove.liquidityImpact.postMoveRunwayMonths;
    rows.push({
      id: "post-move-runway",
      label: "Post-Move Cash Runway",
      metric: makeMetric("Runway", r, "months", "bestMoveEngineSprint5.liquidityImpact.postMoveRunwayMonths"),
      band: r >= 6 ? "ok" : r >= 3 ? "watch" : "fragile",
    });
  }
  if (mc && typeof (mc as any).prob_neg_cf === "number") {
    const p = (mc as any).prob_neg_cf as number;
    rows.push({
      id: "mc-neg-cf",
      label: "Monte Carlo P(Negative Cashflow)",
      metric: makeMetric("P(Neg CF)", p / 100, "percent", "monteCarloEngine.prob_neg_cf"),
      band: p <= 10 ? "ok" : p <= 30 ? "watch" : "fragile",
    });
  }

  return {
    overallRiskScore,
    probNegativeCashflow,
    rows,
    incomplete: overallRiskScore.incomplete && probNegativeCashflow.incomplete,
  };
}

function buildWhyThisWins(
  bestMove: BestMoveResult,
): WhyThisWinsSection {
  return {
    strategyLabel: bestMove.bestNextAction.label || "Awaiting data",
    narrative: bestMove.whyThisBeatsAlternatives.narrative
      || "Best Move engine selected this strategy as the highest composite score across cashflow, growth, risk and liquidity.",
    decisiveFactors: bestMove.whyThisBeatsAlternatives.decisiveFactors.map(f => ({
      dimension: f.dimension,
      bestContribution: f.bestContribution,
      runnerUpContribution: f.runnerUpContribution,
      contributionGap: f.contributionGap,
    })),
    confidence: makeMetric(
      "Confidence",
      bestMove.confidenceScore.value,
      "percent",
      "bestMoveEngineSprint5.confidenceScore",
    ),
    incomplete: bestMove.trace.incomplete,
  };
}

function buildWhatCouldFail(
  bestMove: BestMoveResult,
  cfo: CFOAdvisorResult,
): WhatCouldFailSection {
  const failureModes: FailureMode[] = [];

  // Best Move risk hints — pass-through narrative, no new figures.
  if (bestMove.riskImpact.deltaExecutionRiskVsHold > 0) {
    failureModes.push({
      id: "fm-execution-risk",
      description: `Execution risk increases by ${bestMove.riskImpact.deltaExecutionRiskVsHold.toFixed(0)} pts vs holding the current path.`,
      source: "bestMoveEngineSprint5.riskImpact.deltaExecutionRiskVsHold",
      severity: bestMove.riskImpact.deltaExecutionRiskVsHold > 20 ? "high" : "moderate",
    });
  }
  if (bestMove.riskImpact.deltaLiquidityRiskVsHold > 0) {
    failureModes.push({
      id: "fm-liquidity-risk",
      description: `Liquidity risk increases by ${bestMove.riskImpact.deltaLiquidityRiskVsHold.toFixed(0)} pts vs holding the current path.`,
      source: "bestMoveEngineSprint5.riskImpact.deltaLiquidityRiskVsHold",
      severity: bestMove.riskImpact.deltaLiquidityRiskVsHold > 20 ? "high" : "moderate",
    });
  }
  if (Number.isFinite(bestMove.liquidityImpact.postMoveRunwayMonths) && bestMove.liquidityImpact.postMoveRunwayMonths < 3) {
    failureModes.push({
      id: "fm-runway-fragile",
      description: `Post-move cash runway dips to ${bestMove.liquidityImpact.postMoveRunwayMonths.toFixed(1)} months — buffer is fragile.`,
      source: "bestMoveEngineSprint5.liquidityImpact.postMoveRunwayMonths",
      severity: "high",
    });
  }

  // CFO Advisor risks — pass-through narrative.
  for (const r of cfo.risks.slice(0, 5)) {
    const severity: FailureMode["severity"] = (() => {
      switch (r.severity) {
        case "critical": return "critical";
        case "high": return "high";
        case "moderate": return "moderate";
        case "low": return "low";
        case "info": return "low";
        default: return "moderate";
      }
    })();
    failureModes.push({
      id: `fm-cfo-${r.id}`,
      description: r.headline + (r.body ? ` — ${r.body}` : ""),
      source: "cfoAdvisor.risks",
      severity,
    });
  }

  // CFO Advisor contradictions — these often manifest as plan-failure modes.
  for (const r of cfo.contradictions.slice(0, 2)) {
    failureModes.push({
      id: `fm-cfo-contradiction-${r.id}`,
      description: r.headline + (r.body ? ` — ${r.body}` : ""),
      source: "cfoAdvisor.contradictions",
      severity: "moderate",
    });
  }

  if (failureModes.length === 0) {
    failureModes.push({
      id: "fm-none",
      description: "No incremental execution, liquidity or contradiction risk surfaced by the engines for the recommended strategy.",
      source: "bestMoveEngineSprint5 + cfoAdvisor",
      severity: "low",
    });
  }

  return {
    failureModes,
    incomplete: bestMove.trace.incomplete || cfo.trace.incomplete,
  };
}

function buildAuditTrail(
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
  ranking: RankingOutput,
  bestMove: BestMoveResult,
  cfo: CFOAdvisorResult,
  risk: RiskRadarResult | null | undefined,
  mc: MonteCarloResult | null | undefined,
): OptimizerAuditTrailSection {
  const entries: OptimizerAuditEntry[] = [];
  const mcSource = mc ? "monteCarloEngine.prob_ff" : "no-mc-supplied";
  const riskSource = risk ? "riskEngine.overall_score" : "no-risk-supplied";

  entries.push({
    id: "audit-current-position",
    label: "Current Position",
    enginesUsed: ["canonicalHeadlineMetrics", "canonicalFire", "decisionCandidates", "goalSolver"],
    inputsUsed: [
      "canonicalLedger.snapshot",
      "canonicalLedger.properties",
      "canonicalLedger.stocks",
      "canonicalLedger.cryptos",
      "canonicalLedger.incomeRecords",
      "canonicalLedger.expenses",
    ],
    assumptions: [
      "Investible base excludes PPOR, cars, and non-financial property (goalSolver).",
      "Liquidity runway = (cash+offset) / monthly outflow (decisionCandidates).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Net worth, assets, liabilities, passive income and surplus are pass-throughs of canonicalHeadlineMetrics. Investible base is goalSolver.trace.currentInvestibleBase. Liquidity runway is decisionCandidates.trace.baselineLiquidityMonths.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-target-position",
    label: "Target Position",
    enginesUsed: ["canonicalFire", "goalSolver"],
    inputsUsed: [
      "canonicalFire.fireNumber",
      "canonicalFire.swrPct",
      "goalSolver.requiredAssetBase",
      "goalSolver.requiredMonthlyContribution",
      "goalSolver.requiredPortfolioGrowth",
    ],
    assumptions: [
      `Safe withdrawal rate ${(goal.trace.swrUsed * 100).toFixed(1)}% (canonicalFire).`,
      `Growth assumption ${(goal.trace.growthAssumptionUsed * 100).toFixed(1)}% (goalSolver).`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "FIRE number = canonicalFire.fireNumber. Required asset base = goalSolver.requiredAssetBase. Required monthly contribution = goalSolver.requiredMonthlyContribution. Required growth = goalSolver.requiredPortfolioGrowth.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-gap-to-target",
    label: "Gap To Target",
    enginesUsed: ["canonicalFire", "goalSolver"],
    inputsUsed: [
      "canonicalFire.gap",
      "goalSolver.requiredAssetBase",
      "goalSolver.requiredPassiveIncomeGap",
      "goalSolver.requiredMonthlyContribution",
      "goalSolver.yearsAheadOrBehind",
      "goalSolver.fireFeasibility",
    ],
    assumptions: [
      "Gaps are clamped to >=0 (no negative gap surfaced).",
      "Feasibility verdict is goalSolver.fireFeasibility (not re-derived).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Each gap is the difference between an engine target and the canonical current value. Years ahead/behind and feasibility are pass-through from goalSolver. No new arithmetic.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-optimization",
    label: "Portfolio Optimization Engine",
    enginesUsed: ["decisionCandidates", "decisionRanking", "bestMoveEngineSprint5"],
    inputsUsed: [
      "decisionCandidates.candidates",
      "decisionRanking.ranked",
      "bestMoveEngineSprint5.bestNextAction",
    ],
    assumptions: [
      "Each lever is a label over an existing candidate. Hybrid / composition levers are explicitly flagged not-engine-modelled.",
      `Ranking weights = ${JSON.stringify(bestMove.trace.weightsUsed)}`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource: bestMove.trace.riskSupplied ? "riskEngine.overall_score" : "decisionCandidates.risk",
    monteCarloSource: bestMove.trace.monteCarloSupplied
      ? "monteCarloEngine.prob_ff"
      : "decisionCandidates.risk.mcConfidence",
    howCalculated:
      "Each lever maps to a Sprint 5 candidate kind. Δ metrics on each row are the candidate's projection deltas. Hybrid levers carry the candidate they were mapped to and are flagged not-engine-modelled until the engine layer differentiates them.",
    incomplete: cands.incomplete,
  });

  entries.push({
    id: "audit-ranked-strategies",
    label: "Ranked Portfolio Strategies",
    enginesUsed: ["decisionCandidates", "decisionRanking", "bestMoveEngineSprint5"],
    inputsUsed: [
      "decisionRanking.ranked",
      "bestMoveEngineSprint5.bestNextAction",
    ],
    assumptions: [
      "Top N strategies (≤10) are pulled from decisionRanking.ranked in order — no re-ranking.",
      "Strategy MC confidence is pass-through from each candidate's risk.mcConfidence.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Top-10 strategies = first 10 entries of decisionRanking.ranked. Each strategy renders the candidate's projection deltas + risk profile pass-through. No invented dollar values.",
    incomplete: ranking.ranked.length < 10,
  });

  entries.push({
    id: "audit-probability-of-success",
    label: "Probability Of Success",
    enginesUsed: ["bestMoveEngineSprint5", "monteCarloEngine", "decisionCandidates"],
    inputsUsed: [
      "bestMoveEngineSprint5.confidenceScore",
      "monteCarloEngine.prob_ff",
      "decisionCandidates.risk.mcConfidence",
    ],
    assumptions: [
      "Best Move composite confidence is weighted MC + score margin + data coverage (engine-side weights).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Best Move confidence = bestMoveEngineSprint5.confidenceScore.value. Monte Carlo P(financial freedom) = monteCarloEngine.prob_ff/100 when supplied. Top strategy MC = top-ranked candidate's risk.mcConfidence.",
    incomplete: !mc,
  });

  entries.push({
    id: "audit-time-to-fire",
    label: "Time To FIRE",
    enginesUsed: ["goalSolver", "bestMoveEngineSprint5"],
    inputsUsed: [
      "goalSolver.trace.projectedAchievementYear",
      "goalSolver.trace.yearsToTarget",
      "goalSolver.yearsAheadOrBehind",
      "bestMoveEngineSprint5.bestNextAction",
    ],
    assumptions: [
      "Best-Move year = projected year nudged by candidate.projection.deltaFireProgress × yearsToTarget (same nudge used by Phase 4 path comparison).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "All four time-to-FIRE values are pass-throughs from goalSolver. The Best Move year uses the candidate's deltaFireProgress to adjust the projected year — no new financial formula.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-required-monthly-contribution",
    label: "Required Monthly Contribution",
    enginesUsed: ["goalSolver"],
    inputsUsed: [
      "goalSolver.requiredMonthlyContribution",
      "goalSolver.trace.monthlySurplusAvailable",
    ],
    assumptions: ["Coverage ratio = available / required (no clamp)."],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Required = goalSolver.requiredMonthlyContribution. Available = goalSolver.trace.monthlySurplusAvailable. Gap = max(0, required-available). Coverage = available/required.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-required-asset-base",
    label: "Required Asset Base",
    enginesUsed: ["goalSolver"],
    inputsUsed: [
      "goalSolver.requiredAssetBase",
      "goalSolver.trace.currentInvestibleBase",
      "goalSolver.requiredPortfolioGrowth",
    ],
    assumptions: ["Coverage ratio = current / required (no clamp). Required growth is CAGR not pass-through % return."],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Required = goalSolver.requiredAssetBase. Current = goalSolver.trace.currentInvestibleBase. Gap = max(0, required-current). Coverage = current/required. Required growth = goalSolver.requiredPortfolioGrowth.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-portfolio-stress-test",
    label: "Portfolio Stress Test",
    enginesUsed: ["riskEngine", "bestMoveEngineSprint5", "monteCarloEngine"],
    inputsUsed: [
      "riskEngine.overall_score",
      "bestMoveEngineSprint5.riskImpact",
      "bestMoveEngineSprint5.liquidityImpact.postMoveRunwayMonths",
      "monteCarloEngine.prob_neg_cf",
    ],
    assumptions: [
      "Bands: ≥65 ok, 40–64 watch, <40 fragile (matches canonicalRiskSurface).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mc ? "monteCarloEngine.prob_neg_cf" : "no-mc-supplied",
    howCalculated:
      "Overall risk score is pass-through. Execution and liquidity risk are bestMoveEngineSprint5 risk impact values. Cash-runway band derives from postMoveRunwayMonths. P(Negative Cashflow) is monteCarloEngine.prob_neg_cf/100.",
    incomplete: !risk,
  });

  entries.push({
    id: "audit-why-this-wins",
    label: "Why This Strategy Wins",
    enginesUsed: ["bestMoveEngineSprint5", "decisionRanking"],
    inputsUsed: [
      "bestMoveEngineSprint5.whyThisBeatsAlternatives.narrative",
      "bestMoveEngineSprint5.whyThisBeatsAlternatives.decisiveFactors",
      "bestMoveEngineSprint5.confidenceScore",
    ],
    assumptions: [
      "Narrative is pass-through — never synthesised by the UI.",
      `Candidates evaluated = ${bestMove.trace.candidatesEvaluated}`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Narrative comes from bestMoveEngineSprint5.whyThisBeatsAlternatives.narrative. Decisive factors are pass-through from bestMoveEngineSprint5.whyThisBeatsAlternatives.decisiveFactors.",
    incomplete: bestMove.trace.incomplete,
  });

  entries.push({
    id: "audit-what-could-fail",
    label: "What Could Cause Failure",
    enginesUsed: ["bestMoveEngineSprint5", "cfoAdvisor"],
    inputsUsed: [
      "bestMoveEngineSprint5.riskImpact",
      "bestMoveEngineSprint5.liquidityImpact",
      "cfoAdvisor.risks",
      "cfoAdvisor.contradictions",
    ],
    assumptions: [
      "Failure-mode text is pass-through from engines — no new financial values introduced.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Failure modes are pass-through summaries of Best Move risk deltas, post-move runway, CFO advisor risks, and CFO advisor contradictions. Severity is pass-through from the source insight.",
    incomplete: cfo.trace.incomplete,
  });

  entries.push({
    id: "audit-strategic-ideas",
    label: "Strategic Ideas",
    enginesUsed: ["catalogue (numeric-free)"],
    inputsUsed: ["portfolioLabOptimizer.STRATEGIC_IDEAS_CATALOGUE"],
    assumptions: [
      "Strategic ideas are narrative-only — no engine output is consumed.",
      "Every idea carries notEngineModelled = true.",
    ],
    confidenceSource: "n/a (qualitative)",
    riskSource: "n/a (qualitative)",
    monteCarloSource: "n/a (qualitative)",
    howCalculated:
      "Strategic ideas are a fixed, numeric-free catalogue rendered with the literal 'Not engine-modelled' label. They surface options the engines do not yet model so the UI never has to invent supporting numbers.",
    incomplete: false,
  });

  entries.push({
    id: "audit-confidence-report",
    label: "Confidence Report",
    enginesUsed: ["bestMoveEngineSprint5"],
    inputsUsed: [
      "bestMoveEngineSprint5.confidenceScore.value",
      "bestMoveEngineSprint5.confidenceScore.band",
      "bestMoveEngineSprint5.confidenceScore.components",
    ],
    assumptions: [
      "Overall confidence = bestMoveEngineSprint5.confidenceScore.value (engine-side composite).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Overall = confidenceScore.value. Components are confidenceScore.components.contributions (MC + margin + coverage). Data coverage is the engine's qualitative pass-through.",
    incomplete: bestMove.trace.incomplete,
  });

  return {
    entries,
    incomplete: entries.some(e => e.incomplete),
  };
}

function buildConfidenceReport(
  bestMove: BestMoveResult,
): ConfidenceReportSection {
  const overall = bestMove.confidenceScore.value != null && Number.isFinite(bestMove.confidenceScore.value)
    ? makeMetric("Overall Confidence", bestMove.confidenceScore.value, "percent", "bestMoveEngineSprint5.confidenceScore.value")
    : emptyMetric("Overall Confidence", "percent", "bestMoveEngineSprint5.confidenceScore.value");

  const contribs = bestMove.confidenceScore.components.contributions;
  const coverage = bestMove.confidenceScore.components.dataCoverage;
  const coverageScore = coverage === "full" ? 1 : coverage === "partial" ? 0.66 : 0.33;

  return {
    overall,
    band: bestMove.confidenceScore.band ?? "—",
    components: {
      monteCarlo: makeMetric(
        "Monte Carlo Component",
        contribs.mc,
        "percent",
        "bestMoveEngineSprint5.confidenceScore.components.contributions.mc",
      ),
      scoreMargin: makeMetric(
        "Score Margin",
        contribs.margin,
        "percent",
        "bestMoveEngineSprint5.confidenceScore.components.contributions.margin",
      ),
      dataCoverage: makeMetric(
        "Data Coverage",
        coverageScore,
        "percent",
        "bestMoveEngineSprint5.confidenceScore.components.dataCoverage",
        { textOverride: coverage },
      ),
    },
    summary: bestMove.trace.incomplete
      ? "One or more inputs were missing — confidence is bounded by the engine's data coverage component."
      : `Best Move confidence is in the "${bestMove.confidenceScore.band}" band, composed of Monte Carlo, score-margin, and data-coverage contributions.`,
    incomplete: bestMove.trace.incomplete,
  };
}

/* ─── Public API ───────────────────────────────────────────────────────── */

/**
 * Build the Portfolio Lab Optimizer payload from existing canonical and
 * Sprint 5 engine outputs. Pure / deterministic. Never fabricates
 * household values.
 */
export function buildPortfolioLabOptimizer(
  inputs: PortfolioLabOptimizerInputs,
): PortfolioLabOptimizerResult {
  if (!inputs || !inputs.canonicalLedger || !inputs.canonicalLedger.snapshot) {
    return emptyResult("Canonical ledger is missing or has no snapshot.");
  }
  const ledger = inputs.canonicalLedger;

  const head = computeCanonicalHeadlineMetrics(ledger);
  const fire = computeCanonicalFire(ledger);
  const goal = solveGoalGap({
    canonicalLedger: ledger,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
    ...(inputs.goalSolverInputs ?? {}),
  });
  const candidates = generateDecisionCandidates({
    canonicalLedger: ledger,
    goalSolverOutputs: goal,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });
  const ranking = rankDecisionCandidates({ candidateOutputs: candidates });
  const bestMove = computeBestMoveSprint5({
    rankingOutputs: ranking,
    goalSolverOutputs: goal,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });
  const cfo = generateCFOInsights({
    canonicalLedger: ledger,
    canonicalHead: head,
    goalSolverOutputs: goal,
    candidateOutputs: candidates,
    rankingOutputs: ranking,
    bestMoveOutputs: bestMove,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });

  const currentPosition = buildCurrentPosition(head, goal, candidates);
  const targetPosition = buildTargetPosition(fire, goal);
  const gapToTarget = buildGapToTarget(head, fire, goal);
  const optimization = buildOptimization(candidates, ranking, bestMove);
  const rankedStrategies = buildRankedStrategies(ranking, bestMove);
  const probabilityOfSuccess = buildProbabilityOfSuccess(bestMove, ranking, inputs.monteCarloOutputs ?? null);
  const timeToFire = buildTimeToFire(goal, bestMove, candidates);
  const requiredMonthlyContribution = buildRequiredMonthlyContribution(goal);
  const requiredAssetBase = buildRequiredAssetBase(goal);
  const portfolioStressTest = buildPortfolioStressTest(inputs.riskOutputs ?? null, inputs.monteCarloOutputs ?? null, bestMove);
  const whyThisWins = buildWhyThisWins(bestMove);
  const whatCouldFail = buildWhatCouldFail(bestMove, cfo);
  const auditTrail = buildAuditTrail(goal, candidates, ranking, bestMove, cfo, inputs.riskOutputs ?? null, inputs.monteCarloOutputs ?? null);
  const confidenceReport = buildConfidenceReport(bestMove);

  return {
    empty: false,
    currentPosition,
    targetPosition,
    gapToTarget,
    optimization,
    rankedStrategies,
    probabilityOfSuccess,
    timeToFire,
    requiredMonthlyContribution,
    requiredAssetBase,
    portfolioStressTest,
    whyThisWins,
    whatCouldFail,
    auditTrail,
    confidenceReport,
    strategicIdeas: { ideas: STRATEGIC_IDEAS_CATALOGUE },
    bundle: { head, fire, goal, candidates, ranking, bestMove, cfo },
  };
}

/* ─── Formatting helpers (pure presentation) ───────────────────────────── */

export function formatOptimizerMetric(m: OptimizerMetric): string {
  if (m.textOverride) return m.textOverride;
  if (m.format === "band") {
    /* Sprint 15 Phase 3 — banded confidence display. Always produces a label
       even when value is null (renders "Monte Carlo not yet run"). */
    const kind = m.value == null || !Number.isFinite(m.value)
      ? "absent"
      : /montecarlo|monte_carlo|prob_ff/i.test(m.source)
        ? "mc"
        : /decision|sprint5|bestmove/i.test(m.source)
          ? "composite"
          : /rule|engine\.ts/i.test(m.source)
            ? "rule"
            : "heuristic";
    return formatConfidence({ kind, value: m.value }).label;
  }
  if (m.value == null || !Number.isFinite(m.value)) return "—";
  switch (m.format) {
    case "currency": {
      const abs = Math.abs(m.value);
      const sign = m.value < 0 ? "-" : "";
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
      return `${sign}$${Math.round(abs)}`;
    }
    case "currency-per-year": {
      const v = m.value;
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M/yr`;
      if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k/yr`;
      return `$${Math.round(v)}/yr`;
    }
    case "currency-per-month": {
      const v = m.value;
      if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k/mo`;
      return `$${Math.round(v)}/mo`;
    }
    case "percent":
      return `${Math.round(m.value * 100)}%`;
    case "score":
      return `${Math.round(m.value)} / 100`;
    case "years":
      return `${m.value.toFixed(1)} yr`;
    case "months":
      return `${m.value.toFixed(1)} mo`;
    case "date":
      return String(Math.round(m.value));
    case "text":
    default:
      return String(m.value);
  }
}
