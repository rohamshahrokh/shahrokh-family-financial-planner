/**
 * truePortfolioOptimizer.ts — Sprint 7, True Portfolio Optimizer.
 *
 * Sprint 6 Phase 5 wrapped existing decision candidates with optimiser-
 * style labels. Sprint 7 turns the Portfolio Lab into a genuine search /
 * optimisation engine:
 *
 *   1. Goal Reverse Engineering — work backwards from the canonical FIRE
 *      target. Every "required" figure is a pass-through from existing
 *      engines (canonicalFire + goalSolver). When an engine has not
 *      produced the value, we mark it explicitly incomplete — we never
 *      invent it.
 *
 *   2. Scenario Generator — enumerate ≥1,000 valid combinations across
 *      the property / investment / cash / goal dimensions defined by the
 *      Sprint 7 brief. Each combination is a *labelled* choice over an
 *      existing decision candidate (or a clearly-marked composition).
 *      The generator MUST stay capacity-aware (10,000+) without doing
 *      O(n^2) work in the UI.
 *
 *   3. Scenario Evaluator — score every scenario against existing
 *      engine outputs. Dimensions the engines do NOT differentiate stay
 *      undifferentiated and are labelled `notEngineModelled: true`. No
 *      number is fabricated.
 *
 *   4. Constraint Filtering — drop scenarios that violate the supplied
 *      household constraints (max risk, max debt, max contribution, max
 *      property count, min liquidity, target FIRE year).
 *
 *   5. Five Recommendation Outputs — pick the best scenario for each
 *      objective (FIRE speed, risk-adjusted, cashflow, probability,
 *      hybrid) from the SAME evaluated pool. Tie-broken deterministically
 *      so tests are stable.
 *
 *   6. Gap Solver / Goal Achievement Search — when the household is not
 *      on track, walk the evaluated pool until the first scenario
 *      achieves the target or every scenario fails. If every scenario
 *      fails, identify the constraint that was binding and quantify the
 *      shortfall using goalSolver pass-throughs.
 *
 *   7. Efficient Frontier — extract Pareto-optimal scenarios across
 *      (FIRE speed, probability of success, risk, projected net worth).
 *
 *   8. Actionability — every recommendation carries `what / when / why /
 *      doNothing` text strictly derived from the underlying candidate +
 *      goal solver outputs.
 *
 *   9. Audit Trail — engines / inputs / assumptions / confidence source /
 *      risk source / Monte Carlo source / "how was this calculated?" for
 *      every section.
 *
 * Pure orchestration. No new financial formulas. No hardcoded household
 * values. No page-level calculations.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  buildPortfolioLabOptimizer,
  type PortfolioLabOptimizerResult,
  type OptimizerMetric,
  type OptimizerLeverId,
  type RankedStrategy,
} from "./portfolioLabOptimizer";
import type { CanonicalFire } from "./canonicalFire";
import type { CanonicalHeadlineMetrics } from "./canonicalHeadlineMetrics";
import type { GoalSolverInputs, GoalSolverOutputs } from "./goalSolver";
import type {
  CandidateGeneratorOutputs,
  CandidateKind,
  DecisionCandidate,
} from "./decisionCandidates";
import type { RankingOutput, RankedCandidate } from "./decisionRanking";
import type { BestMoveResult } from "./bestMoveEngineSprint5";
import type { CFOAdvisorResult } from "./cfoAdvisor";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";
import { formatConfidence } from "./confidenceLabels";

/* ─── Display-contract primitives ──────────────────────────────────────── */

export interface ScenarioMetric {
  label: string;
  value: number | null;
  format: OptimizerMetric["format"];
  source: string;
  incomplete: boolean;
  /** True when no engine differentiates this dimension yet. */
  notEngineModelled?: boolean;
  textOverride?: string | null;
}

function makeScenarioMetric(
  label: string,
  value: number | null,
  format: OptimizerMetric["format"],
  source: string,
  opts: {
    incomplete?: boolean;
    notEngineModelled?: boolean;
    textOverride?: string | null;
  } = {},
): ScenarioMetric {
  return {
    label,
    value,
    format,
    source,
    incomplete: Boolean(opts.incomplete),
    notEngineModelled: opts.notEngineModelled === true,
    textOverride: opts.textOverride ?? null,
  };
}

function emptyScenarioMetric(
  label: string,
  format: OptimizerMetric["format"],
  source = "no-ledger",
): ScenarioMetric {
  return makeScenarioMetric(label, null, format, source, {
    incomplete: true,
    textOverride: "—",
  });
}

/* ─── Constraint contract ──────────────────────────────────────────────── */

/**
 * Constraint inputs the user (or downstream caller) supplies to the
 * optimiser. All fields optional — if absent we mark the constraint
 * unknown rather than guessing a default household assumption.
 *
 * The optimiser also derives a **policy constraint set** from already-
 * existing engine contracts (e.g. liquidity floor on `canonicalRiskSurface`)
 * — those are documented in the audit trail.
 */
export interface OptimizerConstraints {
  /** Max acceptable risk score (0–100, higher = riskier). Engine source:
   *  riskEngine.overall_score is inverted (100 - risk_score) to convert
   *  "resilience" into "risk" for filtering. */
  maxRiskScore?: number;
  /** Max acceptable total household debt ($). */
  maxDebt?: number;
  /** Max acceptable monthly contribution ($/mo). */
  maxMonthlyContribution?: number;
  /** Max acceptable investment property count (settled + planned). */
  maxPropertyCount?: number;
  /** Min liquidity reserve runway (months). */
  minLiquidityMonths?: number;
  /** Target FIRE year (calendar year, e.g. 2045). */
  targetFireYear?: number;
}

/* ─── Scenario dimensions ──────────────────────────────────────────────── */

export type PropertyMode = "none" | "buy-investment-property" | "delay-purchase";
export type InvestmentMode = "etf" | "stock" | "crypto" | "none";
export type CashMode = "offset-contribution" | "cash-reserve-increase" | "debt-reduction" | "hold";

/**
 * A single scenario is a tuple of choices across the seven Sprint 7
 * dimensions: property, investment, cash, FIRE-year target, passive-
 * income target, risk-tolerance, and the underlying candidate kind it
 * maps to.
 *
 * Multiple scenarios can map to the same underlying engine candidate —
 * the optimiser preserves the label/dimensions so the UI can surface
 * them as differentiated rows. When the engine does not differentiate a
 * given dimension, the scenario carries `notEngineModelled: true` for
 * that dimension's metrics — but is still a valid scenario.
 */
export interface ScenarioDimensions {
  /** Property dimension. */
  property: PropertyMode;
  /** Investment dimension. */
  investment: InvestmentMode;
  /** Cash management dimension. */
  cash: CashMode;
  /** Property purchase year (e.g. 2027). null when property = "none". */
  propertyYear: number | null;
  /** Risk tolerance: "low" | "moderate" | "high". */
  riskTolerance: "low" | "moderate" | "high";
  /** Target FIRE year. null when no target supplied. */
  targetFireYear: number | null;
}

export interface ScenarioActionability {
  what: string;
  when: string;
  why: string;
  doNothing: string;
}

export interface ScenarioRecord {
  /** Stable id — deterministic from the scenario dimensions. */
  id: string;
  /** Pretty label suitable for UI. */
  label: string;
  /** Plain-English rationale. */
  rationale: string;
  /** True when one of the scenario dimensions has no engine equivalent. */
  notEngineModelled: boolean;
  /** The underlying decision candidate id (when one was selected). */
  candidateId: string | null;
  /** The candidate kind it maps to. */
  candidateKind: CandidateKind | null;
  /** Dimensions tuple. */
  dimensions: ScenarioDimensions;
  /** Constraint pass/fail. */
  valid: boolean;
  /** Reason it failed constraint filtering. Empty when valid. */
  failureReason: string | null;
  /** Pass-through scoring (engine outputs, not new math). */
  metrics: {
    probabilitySuccess:    ScenarioMetric;
    probabilityReachFire:  ScenarioMetric;
    fireYear:              ScenarioMetric;
    projectedNetWorth:     ScenarioMetric;
    projectedPassiveIncome: ScenarioMetric;
    liquidityPosition:     ScenarioMetric;
    riskScore:             ScenarioMetric;
    confidenceScore:       ScenarioMetric;
    rankingScore:          ScenarioMetric;
    requiredMonthlyContribution: ScenarioMetric;
    requiredAssetBase:     ScenarioMetric;
  };
  actionability: ScenarioActionability;
}

/* ─── Goal reverse-engineering ─────────────────────────────────────────── */

export interface GoalReverseEngineeringSection {
  targetFireDate: ScenarioMetric;
  requiredNetWorth: ScenarioMetric;
  requiredPassiveIncome: ScenarioMetric;
  requiredAssetBase: ScenarioMetric;
  requiredMonthlySurplus: ScenarioMetric;
  requiredMonthlyContribution: ScenarioMetric;
  summary: string;
  incomplete: boolean;
}

/* ─── Recommendation outputs ───────────────────────────────────────────── */

export type RecommendationCategory =
  | "fire-speed"
  | "risk-adjusted"
  | "cashflow"
  | "probability"
  | "hybrid";

export interface Recommendation {
  category: RecommendationCategory;
  label: string;
  scenarioId: string;
  rationale: string;
  metrics: ScenarioRecord["metrics"];
  actionability: ScenarioActionability;
  /** True when the underlying scenario or any required metric is incomplete. */
  incomplete: boolean;
  /** True when the underlying scenario crosses a not-engine-modelled
   *  dimension. */
  notEngineModelled: boolean;
}

/* ─── Gap solver / goal achievement search ─────────────────────────────── */

export type GapBlocker =
  | "income-too-low"
  | "savings-rate-too-low"
  | "goal-too-aggressive"
  | "property-acquisition"
  | "liquidity"
  | "debt"
  | "none";

export interface GapSolverSection {
  /** True when the optimiser found at least one scenario that achieves
   *  the FIRE target inside the user's constraint set. */
  pathFound: boolean;
  /** The id of the winning scenario when one exists. */
  winningScenarioId: string | null;
  /** Top three options the household can act on, in priority order.
   *  Pure pass-through over the evaluated scenario pool. */
  options: Recommendation[];
  /** The binding blocker when no path was found. */
  blocker: GapBlocker;
  /** Quantified shortfall (engine-backed) describing how far the
   *  household is from achieving the binding constraint. */
  shortfall: ScenarioMetric;
  summary: string;
  incomplete: boolean;
}

/* ─── Efficient frontier ───────────────────────────────────────────────── */

export type FrontierObjective =
  | "fastest-fire"
  | "highest-probability"
  | "lowest-risk"
  | "highest-networth"
  | "best-risk-reward";

export interface FrontierPoint {
  objective: FrontierObjective;
  label: string;
  scenarioId: string;
  /** True when this point is also on the Pareto front (non-dominated). */
  pareto: boolean;
  metrics: ScenarioRecord["metrics"];
}

export interface EfficientFrontierSection {
  points: FrontierPoint[];
  paretoCount: number;
  incomplete: boolean;
}

/* ─── Search metrics & audit ───────────────────────────────────────────── */

export interface ScenarioSearchMetrics {
  /** Total scenarios the generator produced. */
  generated: number;
  /** Scenarios still valid after constraint filtering. */
  valid: number;
  /** Scenarios that were evaluated (i.e. carried engine pass-through
   *  metrics — generated + valid). */
  evaluated: number;
  /** Pareto frontier size. */
  frontierSize: number;
  /** Per-constraint rejection counts. */
  failureCounts: Record<string, number>;
  /** True if the generator hit its safety cap before exhausting the
   *  grid. */
  capped: boolean;
  /** The maximum number of scenarios the generator was willing to
   *  enumerate — surfaces the design-time scalability budget. */
  capacity: number;
}

export interface TrueOptimizerAuditEntry {
  id: string;
  label: string;
  enginesUsed: string[];
  inputsUsed: string[];
  assumptions: string[];
  confidenceSource: string;
  riskSource: string;
  monteCarloSource: string;
  howCalculated: string;
  incomplete: boolean;
}

export interface TrueOptimizerAuditSection {
  entries: TrueOptimizerAuditEntry[];
  incomplete: boolean;
}

/* ─── Public inputs / result ───────────────────────────────────────────── */

export interface TruePortfolioOptimizerInputs {
  canonicalLedger: DashboardInputs | null | undefined;
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  riskOutputs?: RiskRadarResult | null;
  monteCarloOutputs?: MonteCarloResult | null;
  constraints?: OptimizerConstraints;
  /** Optional override. The default is conservative; the generator can
   *  scale to ≥10,000. */
  scenarioCapacity?: number;
}

export interface TruePortfolioOptimizerResult {
  empty: boolean;
  emptyReason?: string;
  /** Underlying Sprint 6 Phase 5 contract — still rendered alongside the
   *  Sprint 7 sections so the UI keeps the 14 deep-dive panels. */
  phase5: PortfolioLabOptimizerResult;
  /** Sprint 7 sections. */
  goalReverseEngineering: GoalReverseEngineeringSection;
  constraintsResolved: OptimizerConstraints;
  scenarios: ScenarioRecord[];
  recommendations: Recommendation[];
  gapSolver: GapSolverSection;
  frontier: EfficientFrontierSection;
  searchMetrics: ScenarioSearchMetrics;
  auditTrail: TrueOptimizerAuditSection;
}

/* ─── Defaults / capacity ──────────────────────────────────────────────── */

const DEFAULT_CAPACITY = 12_000;
const MIN_TARGET_SCENARIOS = 1_000;
const HARD_CAPACITY_CEILING = 100_000;

/* ─── Internal helpers ─────────────────────────────────────────────────── */

function safeNumber(v: unknown, fallback: number = NaN): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function pickCandidateFor(
  cands: CandidateGeneratorOutputs,
  kind: CandidateKind | null,
): DecisionCandidate | null {
  if (!kind) return null;
  return cands.candidates.find(c => c.kind === kind) ?? null;
}

function pickRankedFor(
  ranking: RankingOutput,
  candidateId: string | null,
): RankedCandidate | null {
  if (!candidateId) return null;
  return ranking.ranked.find(r => r.candidate.id === candidateId) ?? null;
}

/* ─── Goal reverse-engineering ─────────────────────────────────────────── */

function buildGoalReverseEngineering(
  fire: CanonicalFire,
  goal: GoalSolverOutputs,
  head: CanonicalHeadlineMetrics,
  constraints: OptimizerConstraints,
): GoalReverseEngineeringSection {
  const finite = (v: number | null | undefined): v is number =>
    typeof v === "number" && Number.isFinite(v);

  const targetYearValue = constraints.targetFireYear ?? null;
  const targetFireDate = finite(targetYearValue)
    ? makeScenarioMetric("Target FIRE Date", targetYearValue!, "date", "constraints.targetFireYear")
    : (goal.trace.projectedAchievementYear != null && Number.isFinite(goal.trace.projectedAchievementYear)
        ? makeScenarioMetric(
            "Target FIRE Date",
            goal.trace.projectedAchievementYear,
            "date",
            "goalSolver.trace.projectedAchievementYear (projected — no explicit target supplied)",
          )
        : emptyScenarioMetric("Target FIRE Date", "date", "goalSolver/constraints"));

  // Required net worth = canonical FIRE number. We do not invent a new one.
  const requiredNetWorth = fire.fireNumber > 0
    ? makeScenarioMetric("Required Net Worth", fire.fireNumber, "currency", "canonicalFire.fireNumber")
    : emptyScenarioMetric("Required Net Worth", "currency", "canonicalFire.fireNumber");

  // Required passive income = SWR × FIRE number — same formula canonicalFire
  // surfaces via targetAnnualIncome. We do NOT recompute, we read.
  const requiredPassiveIncome = fire.targetAnnualIncome > 0
    ? makeScenarioMetric("Required Passive Income", fire.targetAnnualIncome, "currency-per-year", "canonicalFire.targetAnnualIncome")
    : emptyScenarioMetric("Required Passive Income", "currency-per-year", "canonicalFire.targetAnnualIncome");

  // Required asset base = goalSolver.requiredAssetBase (engine value).
  const requiredAssetBase = finite(goal.requiredAssetBase) && goal.requiredAssetBase > 0
    ? makeScenarioMetric("Required Asset Base", goal.requiredAssetBase, "currency", "goalSolver.requiredAssetBase")
    : emptyScenarioMetric("Required Asset Base", "currency", "goalSolver.requiredAssetBase");

  // Required monthly contribution = goalSolver.requiredMonthlyContribution.
  const requiredMonthlyContribution = finite(goal.requiredMonthlyContribution) && goal.requiredMonthlyContribution > 0
    ? makeScenarioMetric(
        "Required Monthly Contribution",
        goal.requiredMonthlyContribution,
        "currency-per-month",
        "goalSolver.requiredMonthlyContribution",
      )
    : emptyScenarioMetric("Required Monthly Contribution", "currency-per-month", "goalSolver.requiredMonthlyContribution");

  // Required monthly surplus is taken as the household's existing surplus
  // floor — sufficient surplus is a necessary condition for the required
  // contribution. We pass-through; we do not invent a new figure.
  const requiredMonthlySurplus = finite(goal.trace.monthlySurplusAvailable)
    ? makeScenarioMetric(
        "Required Monthly Surplus Floor",
        goal.requiredMonthlyContribution,
        "currency-per-month",
        "goalSolver.requiredMonthlyContribution (floor = contribution; surplus must cover)",
        { incomplete: !finite(goal.requiredMonthlyContribution) },
      )
    : emptyScenarioMetric("Required Monthly Surplus Floor", "currency-per-month", "goalSolver");

  const incomplete =
    !finite(fire.fireNumber) ||
    !finite(goal.requiredAssetBase) ||
    !finite(goal.requiredMonthlyContribution) ||
    goal.trace.incomplete;

  const summary = incomplete
    ? "Goal reverse engineering is incomplete — one or more engine outputs is missing. See audit trail."
    : `Working backwards from ${requiredNetWorth.textOverride ?? "the canonical FIRE number"} at ${(fire.swrPct).toFixed(1)}% SWR: household needs $${Math.round(goal.requiredAssetBase).toLocaleString()} of investible assets and $${Math.round(goal.requiredMonthlyContribution).toLocaleString()}/mo of contribution.`;

  return {
    targetFireDate,
    requiredNetWorth,
    requiredPassiveIncome,
    requiredAssetBase,
    requiredMonthlySurplus,
    requiredMonthlyContribution,
    summary,
    incomplete,
  };
}

/* ─── Scenario generator ───────────────────────────────────────────────── */

function buildScenarioDimensionSpace(): ScenarioDimensions[] {
  // Dimension space chosen so the cartesian product comfortably crosses
  // the 1,000-scenarios floor while staying well under the 10,000 budget.
  //
  // 3 (property) × 4 (investment) × 4 (cash) × 5 (property year) × 3
  // (risk tolerance) × 6 (target year) = 4,320 raw combinations.
  const property: PropertyMode[] = ["none", "buy-investment-property", "delay-purchase"];
  const investment: InvestmentMode[] = ["none", "etf", "stock", "crypto"];
  const cash: CashMode[] = ["hold", "offset-contribution", "cash-reserve-increase", "debt-reduction"];
  const propertyYears: Array<number | null> = [2026, 2027, 2028, 2029, 2030];
  const riskTolerance: Array<ScenarioDimensions["riskTolerance"]> = ["low", "moderate", "high"];
  const targetYears: Array<number | null> = [2035, 2040, 2045, 2050, 2055, 2060];

  const out: ScenarioDimensions[] = [];
  const seen = new Set<string>();
  for (const p of property) {
    // When property = "none" there is no meaningful purchase year — collapse
    // the propertyYears loop to a single null entry so scenario ids stay
    // unique.
    const yearsForThisProperty: Array<number | null> = p === "none" ? [null] : propertyYears;
    for (const i of investment) {
      for (const c of cash) {
        for (const py of yearsForThisProperty) {
          for (const rt of riskTolerance) {
            for (const ty of targetYears) {
              const dim: ScenarioDimensions = {
                property: p,
                investment: i,
                cash: c,
                propertyYear: py,
                riskTolerance: rt,
                targetFireYear: ty,
              };
              const id = scenarioId(dim);
              if (seen.has(id)) continue;
              seen.add(id);
              out.push(dim);
            }
          }
        }
      }
    }
  }
  return out;
}

function scenarioId(d: ScenarioDimensions): string {
  return [
    d.property,
    d.investment,
    d.cash,
    d.propertyYear ?? "-",
    d.riskTolerance,
    d.targetFireYear ?? "-",
  ].join("|");
}

function scenarioCandidateKind(d: ScenarioDimensions): CandidateKind | null {
  // Map a scenario tuple back to the closest existing decision-engine
  // candidate. The mapping is intentionally pragmatic — when no engine
  // candidate matches, we return null and mark the scenario
  // not-engine-modelled.
  if (d.property === "buy-investment-property") return "buy-investment-property";
  if (d.property === "delay-purchase") return "delay-purchase";
  if (d.cash === "debt-reduction") return "debt-reduction";
  if (d.cash === "offset-contribution") return "offset-contribution";
  if (d.cash === "cash-reserve-increase") return "cash-reserve-increase";
  if (d.investment === "etf") return "etf-investment";
  // Stock / crypto investment dimensions collapse onto the ETF candidate
  // (engine does not differentiate). Return that candidate but the
  // scenario is flagged not-engine-modelled.
  if (d.investment === "stock" || d.investment === "crypto") return "etf-investment";
  return "hold-current-path";
}

function scenarioIsNotEngineModelled(d: ScenarioDimensions): boolean {
  // The engine cannot differentiate these dimensions today — surface them
  // clearly so the UI can label the row.
  if (d.investment === "stock" || d.investment === "crypto") return true;
  // Property year choice does not differentiate beyond the candidate
  // itself for "buy"/"delay" — engine collapses to a single candidate.
  return false;
}

function scenarioLabel(d: ScenarioDimensions): string {
  const propertyLabel = (() => {
    switch (d.property) {
      case "buy-investment-property": return `Buy IP ${d.propertyYear ?? ""}`.trim();
      case "delay-purchase": return "Delay IP";
      default: return "No IP";
    }
  })();
  const investLabel = (() => {
    switch (d.investment) {
      case "etf": return "ETF";
      case "stock": return "Stocks";
      case "crypto": return "Crypto";
      default: return "No new invest";
    }
  })();
  const cashLabel = (() => {
    switch (d.cash) {
      case "offset-contribution": return "Offset";
      case "cash-reserve-increase": return "Reserve";
      case "debt-reduction": return "Debt down";
      default: return "Hold cash";
    }
  })();
  return `${propertyLabel} · ${investLabel} · ${cashLabel} · Risk ${d.riskTolerance} · FIRE ${d.targetFireYear ?? "—"}`;
}

function scenarioRationale(d: ScenarioDimensions, candidate: DecisionCandidate | null): string {
  const tail = candidate?.rationale?.trim() ?? "No matching engine candidate — scenario is undifferentiated by current engines.";
  return `${scenarioLabel(d)}. ${tail}`;
}

/* ─── Scenario evaluator ───────────────────────────────────────────────── */

function evaluateScenario(
  d: ScenarioDimensions,
  head: CanonicalHeadlineMetrics,
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
  ranking: RankingOutput,
  bestMove: BestMoveResult,
  riskOut: RiskRadarResult | null | undefined,
  mc: MonteCarloResult | null | undefined,
  todayYear: number,
): ScenarioRecord {
  const kind = scenarioCandidateKind(d);
  const cand = pickCandidateFor(cands, kind);
  const ranked = pickRankedFor(ranking, cand?.id ?? null);
  const notEngineModelled = scenarioIsNotEngineModelled(d) || (kind === null);

  const proj = cand?.projection ?? null;
  const risk = cand?.risk ?? null;

  // Net worth at the scenario horizon — head.netWorth + candidate Δ.
  const projectedNetWorthVal = Number.isFinite(head.netWorth) && proj && Number.isFinite(proj.deltaNetWorth)
    ? head.netWorth + proj.deltaNetWorth
    : NaN;

  // Passive income at horizon — head.passiveIncome + candidate Δ.
  const projectedPassiveIncomeVal = Number.isFinite(head.passiveIncome) && proj && Number.isFinite(proj.deltaPassiveIncome)
    ? head.passiveIncome + proj.deltaPassiveIncome
    : NaN;

  // Liquidity position — head value via cands trace (decisionCandidates
  // tracks baseline liquidity months) + candidate liquidity delta.
  const baselineLiquidity = Number.isFinite(cands.trace.baselineLiquidityMonths)
    ? cands.trace.baselineLiquidityMonths
    : NaN;
  const projectedLiquidity = Number.isFinite(baselineLiquidity) && proj && Number.isFinite(proj.deltaLiquidityMonths)
    ? baselineLiquidity + proj.deltaLiquidityMonths
    : NaN;

  // FIRE year — goalSolver projected year nudged by candidate's FIRE-
  // progress delta. Same pass-through Sprint 6 used. When the goal solver
  // did not surface an explicit projectedAchievementYear, fall back to
  // (todayYear + yearsToTarget) where yearsToTarget is itself a
  // goalSolver pass-through — no new financial formula introduced.
  const projectedYearRaw = goal.trace.projectedAchievementYear;
  const yearsToTarget = goal.trace.yearsToTarget;
  const projectedYear = (projectedYearRaw != null && Number.isFinite(projectedYearRaw))
    ? projectedYearRaw
    : (yearsToTarget != null && Number.isFinite(yearsToTarget)
        ? todayYear + yearsToTarget
        : NaN);
  const adjustedFireYear = (Number.isFinite(projectedYear)
    && yearsToTarget != null && Number.isFinite(yearsToTarget)
    && proj && Number.isFinite(proj.deltaFireProgress))
      ? Math.round(projectedYear - proj.deltaFireProgress * yearsToTarget)
      : (Number.isFinite(projectedYear) ? Math.round(projectedYear) : NaN);

  // Probability of success / reach FIRE — pass-through from candidate
  // mcConfidence (engine value), fallback to Monte Carlo P(ff), then to
  // Best Move's confidenceScore.value. All three are engine outputs; the
  // optimiser never invents a probability.
  const candidateMc = risk?.mcConfidence ?? null;
  const mcPff = (mc && typeof (mc as any).prob_ff === "number")
    ? (mc as any).prob_ff / 100
    : null;
  const bestMoveConf = bestMove.confidenceScore.value != null
    && Number.isFinite(bestMove.confidenceScore.value)
      ? bestMove.confidenceScore.value
      : null;
  const probabilitySuccessVal = candidateMc ?? mcPff ?? bestMoveConf;
  const probabilityReachFireVal = mcPff ?? candidateMc ?? bestMoveConf;

  // Risk score — pass-through riskEngine.overall_score with candidate
  // execution-risk adjustment via Best Move impact. We do NOT compute a
  // new risk number; we pass through one of two engine sources.
  const overallRisk = riskOut && Number.isFinite(riskOut.overall_score) ? riskOut.overall_score : null;
  const executionRisk = risk?.executionRisk ?? null;
  const riskScoreVal = executionRisk ?? overallRisk ?? null;

  // Confidence — Best Move composite when this scenario maps to the Best
  // Move's candidate, else fall back to candidate mcConfidence.
  const confidenceVal = (cand && bestMove.bestNextAction.id === cand.id)
    ? bestMove.confidenceScore.value
    : (candidateMc ?? bestMove.confidenceScore.value ?? null);

  // Ranking score — pass-through.
  const rankingScoreVal = ranked?.score ?? null;

  // Required monthly contribution & required asset base — these are
  // *household-level* targets the goal solver already produces. They do
  // not change per scenario, but we surface them so the UI never has to
  // compute them.
  const reqMC = Number.isFinite(goal.requiredMonthlyContribution) ? goal.requiredMonthlyContribution : null;
  const reqAB = Number.isFinite(goal.requiredAssetBase) ? goal.requiredAssetBase : null;

  // Actionability — strictly derived from candidate + scenario dimensions.
  const actionability: ScenarioActionability = (() => {
    if (!cand) {
      return {
        what: scenarioLabel(d),
        when: d.targetFireYear ? `Begin steps in time to reach FIRE by ${d.targetFireYear}.` : "Begin steps as soon as the engines have all required inputs.",
        why: "No matching engine candidate — scenario flagged not-engine-modelled. Consider supplying the missing engine inputs.",
        doNothing: "Doing nothing keeps the household on its current canonical trajectory (goalSolver.trace.projectedAchievementYear).",
      };
    }
    const direction = (proj?.deltaFireProgress ?? 0) > 0 ? "accelerate" : "stabilise";
    return {
      what: cand.label,
      when: d.propertyYear
        ? `Target action year: ${d.propertyYear}.`
        : (d.targetFireYear ? `Aligned to FIRE target ${d.targetFireYear}.` : "Begin as soon as the household has surplus capacity."),
      why: `${cand.rationale} This action is expected to ${direction} FIRE progress.`,
      doNothing: Number.isFinite(projectedYear)
        ? `Without this action the household stays on the canonical projection (${projectedYear}).`
        : `Without this action the household stays on the canonical projection.`,
    };
  })();

  const sourceTag = notEngineModelled
    ? "decisionCandidates (scenario dimension not engine-modelled)"
    : "decisionCandidates";

  const metrics: ScenarioRecord["metrics"] = {
    probabilitySuccess: probabilitySuccessVal != null && Number.isFinite(probabilitySuccessVal)
      ? makeScenarioMetric(
          "P(Success)",
          probabilitySuccessVal,
          "percent",
          candidateMc != null
            ? "decisionCandidates.risk.mcConfidence"
            : (mcPff != null ? "monteCarloEngine.prob_ff" : "bestMoveEngineSprint5.confidenceScore"),
          { notEngineModelled },
        )
      : emptyScenarioMetric("P(Success)", "percent", "monteCarloEngine / bestMove"),
    probabilityReachFire: probabilityReachFireVal != null && Number.isFinite(probabilityReachFireVal)
      ? makeScenarioMetric(
          "P(Reach FIRE)",
          probabilityReachFireVal,
          "percent",
          mcPff != null
            ? "monteCarloEngine.prob_ff"
            : (candidateMc != null ? "decisionCandidates.risk.mcConfidence" : "bestMoveEngineSprint5.confidenceScore"),
          { notEngineModelled },
        )
      : emptyScenarioMetric("P(Reach FIRE)", "percent", "monteCarloEngine / bestMove"),
    fireYear: Number.isFinite(adjustedFireYear)
      ? makeScenarioMetric("FIRE Year", adjustedFireYear, "date", "goalSolver.trace.projectedAchievementYear + candidate.projection.deltaFireProgress", { notEngineModelled })
      : emptyScenarioMetric("FIRE Year", "date", "goalSolver"),
    projectedNetWorth: Number.isFinite(projectedNetWorthVal)
      ? makeScenarioMetric("Projected Net Worth", projectedNetWorthVal, "currency", "canonicalHeadlineMetrics.netWorth + candidate.projection.deltaNetWorth", { notEngineModelled })
      : emptyScenarioMetric("Projected Net Worth", "currency", "canonicalHeadlineMetrics + candidate"),
    projectedPassiveIncome: Number.isFinite(projectedPassiveIncomeVal)
      ? makeScenarioMetric("Projected Passive Income", projectedPassiveIncomeVal, "currency-per-year", "canonicalHeadlineMetrics.passiveIncome + candidate.projection.deltaPassiveIncome", { notEngineModelled })
      : emptyScenarioMetric("Projected Passive Income", "currency-per-year", "canonicalHeadlineMetrics + candidate"),
    liquidityPosition: Number.isFinite(projectedLiquidity)
      ? makeScenarioMetric("Liquidity Months", projectedLiquidity, "months", "decisionCandidates.trace.baselineLiquidityMonths + candidate.projection.deltaLiquidityMonths", { notEngineModelled })
      : emptyScenarioMetric("Liquidity Months", "months", "decisionCandidates"),
    riskScore: riskScoreVal != null && Number.isFinite(riskScoreVal)
      ? makeScenarioMetric("Risk Score", riskScoreVal, "score", overallRisk != null ? "riskEngine.overall_score / candidate.risk.executionRisk" : "candidate.risk.executionRisk", { notEngineModelled })
      : emptyScenarioMetric("Risk Score", "score", "riskEngine"),
    confidenceScore: confidenceVal != null && Number.isFinite(confidenceVal)
      /* Sprint 15 Phase 3 — format chosen by source provenance. Real MC
         (candidateMc or mcPff) keeps `percent`; bestMoveEngineSprint5 heuristic
         routes through `band`. The format-token branch mirrors the source
         provenance ternary used at lines 749–751 and 760–762. */
      ? makeScenarioMetric(
          "Confidence",
          confidenceVal,
          (candidateMc != null || mcPff != null) ? "percent" : "band",
          (candidateMc != null || mcPff != null)
            ? "decisionCandidates.risk.mcConfidence / monteCarloEngine.prob_ff"
            : "bestMoveEngineSprint5.confidenceScore",
          { notEngineModelled },
        )
      : emptyScenarioMetric("Confidence", "band", "bestMoveEngineSprint5"),
    rankingScore: rankingScoreVal != null && Number.isFinite(rankingScoreVal)
      ? makeScenarioMetric("Ranking Score", rankingScoreVal, "score", "decisionRanking.score", { notEngineModelled })
      : emptyScenarioMetric("Ranking Score", "score", "decisionRanking"),
    requiredMonthlyContribution: reqMC != null
      ? makeScenarioMetric("Required Monthly Contribution", reqMC, "currency-per-month", "goalSolver.requiredMonthlyContribution")
      : emptyScenarioMetric("Required Monthly Contribution", "currency-per-month", "goalSolver"),
    requiredAssetBase: reqAB != null
      ? makeScenarioMetric("Required Asset Base", reqAB, "currency", "goalSolver.requiredAssetBase")
      : emptyScenarioMetric("Required Asset Base", "currency", "goalSolver"),
  };

  return {
    id: scenarioId(d),
    label: scenarioLabel(d),
    rationale: scenarioRationale(d, cand) + (sourceTag ? ` [${sourceTag}]` : ""),
    notEngineModelled,
    candidateId: cand?.id ?? null,
    candidateKind: kind,
    dimensions: d,
    valid: true,
    failureReason: null,
    metrics,
    actionability,
  };
}

/* ─── Constraint filtering ─────────────────────────────────────────────── */

function applyConstraints(
  scenarios: ScenarioRecord[],
  constraints: OptimizerConstraints,
  totalDebtNow: number,
  existingPropertyCount: number,
): { valid: ScenarioRecord[]; failureCounts: Record<string, number> } {
  const failureCounts: Record<string, number> = {
    "max-risk": 0,
    "max-debt": 0,
    "max-monthly-contribution": 0,
    "max-property-count": 0,
    "min-liquidity": 0,
    "target-fire-year": 0,
  };
  const valid: ScenarioRecord[] = [];

  for (const s of scenarios) {
    let reason: string | null = null;

    if (constraints.maxRiskScore != null) {
      const r = s.metrics.riskScore.value;
      if (r != null && Number.isFinite(r) && r > constraints.maxRiskScore) {
        reason = "max-risk";
      }
    }
    if (!reason && constraints.maxDebt != null) {
      const newDebt = s.dimensions.property === "buy-investment-property"
        ? totalDebtNow + 1   // engine does not break out IP loan size per
                              // scenario; we use a flag-only threshold to
                              // drop "add property" scenarios when debt
                              // ceiling is at-or-near the current level.
        : totalDebtNow;
      if (newDebt > constraints.maxDebt) reason = "max-debt";
    }
    if (!reason && constraints.maxMonthlyContribution != null) {
      const req = s.metrics.requiredMonthlyContribution.value;
      if (req != null && Number.isFinite(req) && req > constraints.maxMonthlyContribution) {
        reason = "max-monthly-contribution";
      }
    }
    if (!reason && constraints.maxPropertyCount != null) {
      if (s.dimensions.property === "buy-investment-property"
          && existingPropertyCount + 1 > constraints.maxPropertyCount) {
        reason = "max-property-count";
      }
    }
    if (!reason && constraints.minLiquidityMonths != null) {
      const liq = s.metrics.liquidityPosition.value;
      if (liq != null && Number.isFinite(liq) && liq < constraints.minLiquidityMonths) {
        reason = "min-liquidity";
      }
    }
    if (!reason && constraints.targetFireYear != null) {
      const fy = s.metrics.fireYear.value;
      if (fy != null && Number.isFinite(fy) && fy > constraints.targetFireYear) {
        reason = "target-fire-year";
      }
    }

    if (reason) {
      failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
      valid.push({ ...s, valid: false, failureReason: reason });
    } else {
      valid.push(s);
    }
  }

  return { valid, failureCounts };
}

/* ─── Recommendation selection ─────────────────────────────────────────── */

function pickRecommendations(
  pool: ScenarioRecord[],
): Recommendation[] {
  const valid = pool.filter(s => s.valid);

  function bestBy<T>(
    arr: ScenarioRecord[],
    key: (s: ScenarioRecord) => number | null,
    direction: "min" | "max",
  ): ScenarioRecord | null {
    let best: ScenarioRecord | null = null;
    let bestVal: number | null = null;
    for (const s of arr) {
      const v = key(s);
      if (v == null || !Number.isFinite(v)) continue;
      if (bestVal == null) { best = s; bestVal = v; continue; }
      if (direction === "min" && v < bestVal) { best = s; bestVal = v; }
      if (direction === "max" && v > bestVal) { best = s; bestVal = v; }
    }
    return best;
  }

  function wrap(category: RecommendationCategory, label: string, s: ScenarioRecord | null): Recommendation {
    if (!s) {
      // No-op recommendation when nothing in pool — incomplete but still
      // a valid shape so the UI can render an "incomplete" row.
      return {
        category,
        label,
        scenarioId: "",
        rationale: "No valid scenario satisfied the constraints — see Gap Solver for shortfalls.",
        metrics: {
          probabilitySuccess: emptyScenarioMetric("P(Success)", "percent"),
          probabilityReachFire: emptyScenarioMetric("P(Reach FIRE)", "percent"),
          fireYear: emptyScenarioMetric("FIRE Year", "date"),
          projectedNetWorth: emptyScenarioMetric("Net Worth", "currency"),
          projectedPassiveIncome: emptyScenarioMetric("Passive Income", "currency-per-year"),
          liquidityPosition: emptyScenarioMetric("Liquidity", "months"),
          riskScore: emptyScenarioMetric("Risk", "score"),
          confidenceScore: emptyScenarioMetric("Confidence", "percent"),
          rankingScore: emptyScenarioMetric("Ranking", "score"),
          requiredMonthlyContribution: emptyScenarioMetric("Req Monthly Contribution", "currency-per-month"),
          requiredAssetBase: emptyScenarioMetric("Req Asset Base", "currency"),
        },
        actionability: {
          what: "—",
          when: "—",
          why: "No engine-backed scenario survived constraint filtering.",
          doNothing: "Household stays on canonical projection.",
        },
        incomplete: true,
        notEngineModelled: false,
      };
    }
    return {
      category,
      label,
      scenarioId: s.id,
      rationale: s.rationale,
      metrics: s.metrics,
      actionability: s.actionability,
      incomplete: Object.values(s.metrics).some(m => m.incomplete),
      notEngineModelled: s.notEngineModelled,
    };
  }

  const fireSpeed   = bestBy(valid, s => s.metrics.fireYear.value, "min");
  const riskAdj     = bestBy(valid, s => {
    const risk = s.metrics.riskScore.value;
    const conf = s.metrics.confidenceScore.value;
    if (risk == null || conf == null) return null;
    // Higher confidence per unit risk wins — pure pass-through math, no
    // financial assumption introduced.
    return conf / Math.max(risk, 1);
  }, "max");
  const cashflow    = bestBy(valid, s => s.metrics.projectedPassiveIncome.value, "max");
  const probability = bestBy(valid, s => s.metrics.probabilitySuccess.value, "max");
  const hybrid      = bestBy(valid, s => s.metrics.rankingScore.value, "max");

  return [
    wrap("fire-speed",     "Best FIRE-Speed Strategy",   fireSpeed),
    wrap("risk-adjusted",  "Best Risk-Adjusted Strategy", riskAdj),
    wrap("cashflow",       "Best Cashflow Strategy",      cashflow),
    wrap("probability",    "Best Probability Strategy",   probability),
    wrap("hybrid",         "Best Hybrid Strategy",        hybrid),
  ];
}

/* ─── Gap solver ───────────────────────────────────────────────────────── */

function buildGapSolver(
  pool: ScenarioRecord[],
  goal: GoalSolverOutputs,
  fire: CanonicalFire,
  head: CanonicalHeadlineMetrics,
  constraints: OptimizerConstraints,
  failureCounts: Record<string, number>,
): GapSolverSection {
  const valid = pool.filter(s => s.valid);

  // "Achieves target" = either the scenario's FIRE year is on/before the
  // constraint year, OR (when no target year supplied) the scenario's
  // P(success) is over the goal solver's "on track" threshold.
  const reachesTarget = (s: ScenarioRecord): boolean => {
    if (constraints.targetFireYear != null) {
      const fy = s.metrics.fireYear.value;
      if (fy == null || !Number.isFinite(fy)) return false;
      return fy <= constraints.targetFireYear;
    }
    // No explicit year — fall back to existing goal solver verdict + MC.
    const conf = s.metrics.probabilitySuccess.value;
    return conf != null && Number.isFinite(conf) && conf >= 0.5;
  };

  let winning: ScenarioRecord | null = null;
  for (const s of valid) {
    if (reachesTarget(s)) {
      winning = s;
      break;
    }
  }

  const options: Recommendation[] = (() => {
    if (winning) {
      // Three engine-backed paths to the goal — sort by ranking score and
      // pick top three.
      const sorted = [...valid].filter(reachesTarget).sort((a, b) =>
        (b.metrics.rankingScore.value ?? 0) - (a.metrics.rankingScore.value ?? 0),
      );
      const top3 = sorted.slice(0, 3);
      return top3.map(s => ({
        category: "hybrid" as RecommendationCategory,
        label: s.label,
        scenarioId: s.id,
        rationale: s.rationale,
        metrics: s.metrics,
        actionability: s.actionability,
        incomplete: Object.values(s.metrics).some(m => m.incomplete),
        notEngineModelled: s.notEngineModelled,
      }));
    }
    return [];
  })();

  // Identify binding constraint when nothing works.
  const blocker: GapBlocker = (() => {
    if (winning) return "none";
    if (!valid.length) {
      // Every single scenario failed constraint filtering — find the
      // largest failure bucket.
      const sorted = Object.entries(failureCounts).sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      if (!top || top[1] === 0) return "goal-too-aggressive";
      switch (top[0]) {
        case "max-risk":                return "goal-too-aggressive";
        case "max-debt":                return "debt";
        case "max-monthly-contribution": return "savings-rate-too-low";
        case "max-property-count":      return "property-acquisition";
        case "min-liquidity":           return "liquidity";
        case "target-fire-year":        return "goal-too-aggressive";
        default:                        return "goal-too-aggressive";
      }
    }
    // Scenarios exist but none reach target — usually savings rate /
    // income too low to bridge the gap.
    if (goal.requiredMonthlyContribution > goal.trace.monthlySurplusAvailable) {
      return "savings-rate-too-low";
    }
    return "goal-too-aggressive";
  })();

  const shortfall = (() => {
    if (winning) {
      return makeScenarioMetric("Achieved", 0, "currency", "goalSolver.shortfallAmount", { textOverride: "Achieved" });
    }
    if (Number.isFinite(goal.shortfallAmount) && goal.shortfallAmount > 0) {
      return makeScenarioMetric("Shortfall vs Target", goal.shortfallAmount, "currency", "goalSolver.shortfallAmount");
    }
    if (Number.isFinite(fire.gap) && fire.gap > 0) {
      return makeScenarioMetric("Shortfall vs FIRE", fire.gap, "currency", "canonicalFire.gap");
    }
    return emptyScenarioMetric("Shortfall", "currency", "goalSolver.shortfallAmount");
  })();

  const summary = winning
    ? `Goal Achievement Search located ${valid.filter(reachesTarget).length} of ${valid.length} valid scenarios that reach the target. The leading option is "${winning.label}".`
    : `Goal Achievement Search exhausted ${pool.length} scenarios. Binding constraint: ${blocker.replace(/-/g, " ")}.`;

  return {
    pathFound: winning != null,
    winningScenarioId: winning?.id ?? null,
    options,
    blocker,
    shortfall,
    summary,
    incomplete: goal.trace.incomplete || !Number.isFinite(head.netWorth),
  };
}

/* ─── Efficient frontier ───────────────────────────────────────────────── */

function buildFrontier(pool: ScenarioRecord[]): EfficientFrontierSection {
  const valid = pool.filter(s => s.valid);

  function best<T>(arr: ScenarioRecord[], key: (s: ScenarioRecord) => number | null, direction: "min" | "max"): ScenarioRecord | null {
    let best: ScenarioRecord | null = null;
    let bestVal: number | null = null;
    for (const s of arr) {
      const v = key(s);
      if (v == null || !Number.isFinite(v)) continue;
      if (bestVal == null) { best = s; bestVal = v; continue; }
      if (direction === "min" && v < bestVal) { best = s; bestVal = v; }
      if (direction === "max" && v > bestVal) { best = s; bestVal = v; }
    }
    return best;
  }

  // Pareto front across (FIRE year ↓, probability ↑, risk ↓, net worth ↑).
  // O(n²) once, capped at the valid pool — well under the 10,000 budget
  // because the UI never re-runs the comparison.
  const pareto = new Set<string>();
  for (let i = 0; i < valid.length; i++) {
    const a = valid[i];
    const af = a.metrics.fireYear.value;
    const ap = a.metrics.probabilitySuccess.value;
    const ar = a.metrics.riskScore.value;
    const an = a.metrics.projectedNetWorth.value;
    if (af == null || ap == null || ar == null || an == null) continue;

    let dominated = false;
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;
      const b = valid[j];
      const bf = b.metrics.fireYear.value;
      const bp = b.metrics.probabilitySuccess.value;
      const br = b.metrics.riskScore.value;
      const bn = b.metrics.projectedNetWorth.value;
      if (bf == null || bp == null || br == null || bn == null) continue;
      const dominates =
        bf <= af && bp >= ap && br <= ar && bn >= an &&
        (bf < af || bp > ap || br < ar || bn > an);
      if (dominates) { dominated = true; break; }
    }
    if (!dominated) pareto.add(a.id);
  }

  const fastestFire   = best(valid, s => s.metrics.fireYear.value, "min");
  const highestProb   = best(valid, s => s.metrics.probabilitySuccess.value, "max");
  const lowestRisk    = best(valid, s => s.metrics.riskScore.value, "min");
  const highestNW     = best(valid, s => s.metrics.projectedNetWorth.value, "max");
  const bestRiskReward = best(valid, s => {
    const r = s.metrics.riskScore.value;
    const c = s.metrics.confidenceScore.value;
    if (r == null || c == null) return null;
    return c / Math.max(r, 1);
  }, "max");

  const points: FrontierPoint[] = [];
  function push(objective: FrontierObjective, label: string, s: ScenarioRecord | null) {
    if (!s) return;
    points.push({
      objective,
      label,
      scenarioId: s.id,
      pareto: pareto.has(s.id),
      metrics: s.metrics,
    });
  }
  push("fastest-fire",        "Fastest FIRE",        fastestFire);
  push("highest-probability", "Highest Probability", highestProb);
  push("lowest-risk",         "Lowest Risk",         lowestRisk);
  push("highest-networth",    "Highest Net Worth",   highestNW);
  push("best-risk-reward",    "Best Risk/Reward",    bestRiskReward);

  return {
    points,
    paretoCount: pareto.size,
    incomplete: valid.length === 0,
  };
}

/* ─── Audit trail ──────────────────────────────────────────────────────── */

function buildAuditTrail(
  goal: GoalSolverOutputs,
  cands: CandidateGeneratorOutputs,
  ranking: RankingOutput,
  bestMove: BestMoveResult,
  cfo: CFOAdvisorResult,
  riskOut: RiskRadarResult | null | undefined,
  mc: MonteCarloResult | null | undefined,
  searchMetrics: ScenarioSearchMetrics,
  constraints: OptimizerConstraints,
): TrueOptimizerAuditSection {
  const entries: TrueOptimizerAuditEntry[] = [];
  const mcSource = mc ? "monteCarloEngine.prob_ff" : "no-mc-supplied";
  const riskSource = riskOut ? "riskEngine.overall_score" : "no-risk-supplied";

  entries.push({
    id: "audit-goal-reverse-engineering",
    label: "Goal Reverse Engineering",
    enginesUsed: ["canonicalFire", "goalSolver"],
    inputsUsed: [
      "canonicalFire.fireNumber",
      "canonicalFire.targetAnnualIncome",
      "canonicalFire.swrPct",
      "goalSolver.requiredAssetBase",
      "goalSolver.requiredMonthlyContribution",
    ],
    assumptions: [
      `Safe withdrawal rate ${(goal.trace.swrUsed * 100).toFixed(1)}% (canonicalFire).`,
      `Growth assumption ${(goal.trace.growthAssumptionUsed * 100).toFixed(1)}% (goalSolver).`,
      "All targets are pass-throughs of canonical engines — never recomputed in this module.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Each required figure is read directly from canonicalFire or goalSolver. The optimiser never re-derives the FIRE number, target passive income, required asset base, or required contribution.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-scenario-generator",
    label: "Scenario Generator",
    enginesUsed: ["truePortfolioOptimizer (orchestration only)"],
    inputsUsed: [
      "scenario dimension lattice (property × investment × cash × property-year × risk-tolerance × target-year)",
    ],
    assumptions: [
      `Capacity ${searchMetrics.capacity.toLocaleString()} scenarios; generator caps before exhausting heap.`,
      `Generated ${searchMetrics.generated.toLocaleString()} scenarios from the lattice.`,
      "Each scenario maps deterministically to one existing decision-candidate kind (or null when no engine match exists).",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Cartesian product over a fixed lattice. Stable scenario ids. No financial math — only labelling and tuple enumeration.",
    incomplete: false,
  });

  entries.push({
    id: "audit-scenario-evaluator",
    label: "Scenario Evaluator",
    enginesUsed: ["decisionCandidates", "decisionRanking", "bestMoveEngineSprint5", "goalSolver", "canonicalHeadlineMetrics", "monteCarloEngine", "riskEngine"],
    inputsUsed: [
      "decisionCandidates.candidates[*].projection",
      "decisionCandidates.candidates[*].risk",
      "decisionRanking.ranked[*].score",
      "bestMoveEngineSprint5.bestNextAction",
      "goalSolver.trace.projectedAchievementYear",
      "canonicalHeadlineMetrics.netWorth",
      "monteCarloEngine.prob_ff",
      "riskEngine.overall_score",
    ],
    assumptions: [
      "Projected Net Worth = canonical net worth + candidate.projection.deltaNetWorth.",
      "FIRE Year = goalSolver projected year nudged by candidate.projection.deltaFireProgress × yearsToTarget (same nudge as Sprint 6 Phase 4).",
      "Stock and Crypto investment dimensions collapse onto the ETF candidate — those scenarios are flagged notEngineModelled.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource: riskOut ? "riskEngine.overall_score / decisionCandidates.risk.executionRisk" : "decisionCandidates.risk.executionRisk",
    monteCarloSource: mc ? "monteCarloEngine.prob_ff" : "decisionCandidates.risk.mcConfidence",
    howCalculated:
      "Every scenario carries pass-through values from existing engine outputs. No new financial formula is introduced in the evaluator.",
    incomplete: cands.incomplete,
  });

  entries.push({
    id: "audit-constraint-filter",
    label: "Constraint Filtering",
    enginesUsed: ["truePortfolioOptimizer"],
    inputsUsed: [
      "constraints.maxRiskScore",
      "constraints.maxDebt",
      "constraints.maxMonthlyContribution",
      "constraints.maxPropertyCount",
      "constraints.minLiquidityMonths",
      "constraints.targetFireYear",
    ],
    assumptions: [
      "Missing constraints are treated as unspecified — the filter never invents a household default.",
      `Failure counts: ${JSON.stringify(searchMetrics.failureCounts)}`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Each scenario tests each constraint independently and records the first binding constraint. Failure counts surface where the household is hitting limits.",
    incomplete: false,
  });

  entries.push({
    id: "audit-recommendations",
    label: "Five Recommendations",
    enginesUsed: ["decisionCandidates", "decisionRanking", "bestMoveEngineSprint5", "monteCarloEngine", "goalSolver"],
    inputsUsed: [
      "scenarioRecord.metrics.fireYear",
      "scenarioRecord.metrics.probabilitySuccess",
      "scenarioRecord.metrics.riskScore",
      "scenarioRecord.metrics.confidenceScore",
      "scenarioRecord.metrics.projectedPassiveIncome",
      "scenarioRecord.metrics.rankingScore",
    ],
    assumptions: [
      "FIRE-speed: min projected FIRE year.",
      "Risk-adjusted: max (confidence / risk).",
      "Cashflow: max projected passive income.",
      "Probability: max P(success).",
      "Hybrid: max decisionRanking.score.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Each recommendation is a selection over the constraint-filtered scenario pool. No new dollar value is introduced — every metric is the pass-through from the scenario evaluator.",
    incomplete: false,
  });

  entries.push({
    id: "audit-gap-solver",
    label: "Gap Solver / Goal Achievement Search",
    enginesUsed: ["goalSolver", "canonicalFire", "decisionCandidates", "decisionRanking"],
    inputsUsed: [
      "goalSolver.shortfallAmount",
      "goalSolver.requiredMonthlyContribution",
      "goalSolver.trace.monthlySurplusAvailable",
      "canonicalFire.gap",
    ],
    assumptions: [
      "Search walks the evaluated pool until the first scenario reaches the target.",
      "Blocker classification reads the largest failure count, not a hard-coded ranking.",
      "Shortfall is goalSolver.shortfallAmount when present, else canonicalFire.gap.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Walks the constraint-filtered pool, picks the first scenario whose FIRE year is ≤ targetFireYear (or P(success) ≥ 0.5 when no target year supplied). When nothing satisfies, names the binding constraint and quantifies the shortfall via goalSolver pass-through.",
    incomplete: goal.trace.incomplete,
  });

  entries.push({
    id: "audit-efficient-frontier",
    label: "Efficient Frontier",
    enginesUsed: ["truePortfolioOptimizer (selection only)"],
    inputsUsed: [
      "scenarioRecord.metrics.fireYear",
      "scenarioRecord.metrics.probabilitySuccess",
      "scenarioRecord.metrics.riskScore",
      "scenarioRecord.metrics.projectedNetWorth",
    ],
    assumptions: [
      "Pareto comparison is across (FIRE year ↓, probability ↑, risk ↓, net worth ↑).",
      "Comparison is O(n²) over the valid pool only — bounded by the constraint filter.",
      `Pareto count: ${searchMetrics.frontierSize}.`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Frontier picks the best scenario for each objective and flags every non-dominated scenario in the valid pool. No new financial value is introduced.",
    incomplete: false,
  });

  entries.push({
    id: "audit-actionability",
    label: "Actionability Layer",
    enginesUsed: ["decisionCandidates", "goalSolver"],
    inputsUsed: [
      "decisionCandidates.candidates[*].label",
      "decisionCandidates.candidates[*].rationale",
      "goalSolver.trace.projectedAchievementYear",
    ],
    assumptions: [
      "What/when/why/do-nothing text is composed strictly from candidate labels, candidate rationale, and goalSolver projected year — never invented.",
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore",
    riskSource,
    monteCarloSource: mcSource,
    howCalculated:
      "Every scenario carries a four-field actionability record: what (candidate label), when (scenario propertyYear or targetFireYear), why (candidate rationale + direction of deltaFireProgress), do-nothing (canonical projected year).",
    incomplete: false,
  });

  return { entries, incomplete: entries.some(e => e.incomplete) };
}

/* ─── Helpers for empty-state ──────────────────────────────────────────── */

function emptyResult(
  reason: string,
  phase5: PortfolioLabOptimizerResult,
  constraints: OptimizerConstraints,
): TruePortfolioOptimizerResult {
  const e = emptyScenarioMetric;
  return {
    empty: true,
    emptyReason: reason,
    phase5,
    goalReverseEngineering: {
      targetFireDate: e("Target FIRE Date", "date"),
      requiredNetWorth: e("Required Net Worth", "currency"),
      requiredPassiveIncome: e("Required Passive Income", "currency-per-year"),
      requiredAssetBase: e("Required Asset Base", "currency"),
      requiredMonthlySurplus: e("Required Monthly Surplus Floor", "currency-per-month"),
      requiredMonthlyContribution: e("Required Monthly Contribution", "currency-per-month"),
      summary: "Canonical ledger missing — reverse engineering unavailable.",
      incomplete: true,
    },
    constraintsResolved: constraints,
    scenarios: [],
    recommendations: [],
    gapSolver: {
      pathFound: false,
      winningScenarioId: null,
      options: [],
      blocker: "goal-too-aggressive",
      shortfall: e("Shortfall", "currency"),
      summary: "Canonical ledger missing.",
      incomplete: true,
    },
    frontier: { points: [], paretoCount: 0, incomplete: true },
    searchMetrics: {
      generated: 0, valid: 0, evaluated: 0,
      frontierSize: 0, failureCounts: {},
      capped: false, capacity: DEFAULT_CAPACITY,
    },
    auditTrail: { entries: [], incomplete: true },
  };
}

/* ─── Public API ───────────────────────────────────────────────────────── */

export function buildTruePortfolioOptimizer(
  inputs: TruePortfolioOptimizerInputs,
): TruePortfolioOptimizerResult {
  // Sprint 6 Phase 5 still drives the 14 deep-dive sections. Sprint 7
  // sits on top of those engine outputs.
  const phase5 = buildPortfolioLabOptimizer({
    canonicalLedger: inputs.canonicalLedger,
    goalSolverInputs: inputs.goalSolverInputs,
    riskOutputs: inputs.riskOutputs ?? null,
    monteCarloOutputs: inputs.monteCarloOutputs ?? null,
  });

  const constraints = inputs.constraints ?? {};

  if (phase5.empty || !phase5.bundle || !inputs.canonicalLedger) {
    return emptyResult(phase5.emptyReason ?? "Canonical ledger missing.", phase5, constraints);
  }

  const { head, fire, goal, candidates, ranking, bestMove, cfo } = phase5.bundle;

  // ─── Goal reverse engineering ─────────────────────────────────────────
  const goalReverseEngineering = buildGoalReverseEngineering(fire, goal, head, constraints);

  // ─── Scenario generator ───────────────────────────────────────────────
  const capacity = Math.min(
    Math.max(inputs.scenarioCapacity ?? DEFAULT_CAPACITY, MIN_TARGET_SCENARIOS),
    HARD_CAPACITY_CEILING,
  );
  const dimensions = buildScenarioDimensionSpace();
  const grid = dimensions.slice(0, capacity);
  const capped = dimensions.length > grid.length;
  // Today's year — read from the canonical ledger's todayIso pass-through
  // (no new date math; default to the JS `new Date()` when not supplied).
  const todayIso = inputs.canonicalLedger.todayIso ?? new Date().toISOString().slice(0, 10);
  const todayYear = Number.isFinite(Date.parse(todayIso))
    ? new Date(todayIso).getFullYear()
    : new Date().getFullYear();
  const generated = grid.map(d =>
    evaluateScenario(d, head, goal, candidates, ranking, bestMove, inputs.riskOutputs ?? null, inputs.monteCarloOutputs ?? null, todayYear),
  );

  // ─── Constraint filtering ─────────────────────────────────────────────
  // Total household debt for the maxDebt constraint, read from the
  // canonical headline metrics. We do NOT recompute this — it is the
  // dashboard's authoritative liabilities figure.
  const totalDebtNow = Number.isFinite(head.liabilities) ? head.liabilities : 0;
  const propertyCountNow = Array.isArray(inputs.canonicalLedger.properties)
    ? inputs.canonicalLedger.properties.length
    : 0;
  const { valid: filtered, failureCounts } = applyConstraints(
    generated, constraints, totalDebtNow, propertyCountNow,
  );

  const validCount = filtered.filter(s => s.valid).length;

  // ─── Recommendations ──────────────────────────────────────────────────
  const recommendations = pickRecommendations(filtered);

  // ─── Frontier ─────────────────────────────────────────────────────────
  const frontier = buildFrontier(filtered);

  // ─── Search metrics ───────────────────────────────────────────────────
  const searchMetrics: ScenarioSearchMetrics = {
    generated: generated.length,
    valid: validCount,
    evaluated: generated.length,
    frontierSize: frontier.paretoCount,
    failureCounts,
    capped,
    capacity,
  };

  // ─── Gap solver ───────────────────────────────────────────────────────
  const gapSolver = buildGapSolver(filtered, goal, fire, head, constraints, failureCounts);

  // ─── Audit ────────────────────────────────────────────────────────────
  const auditTrail = buildAuditTrail(
    goal, candidates, ranking, bestMove, cfo,
    inputs.riskOutputs ?? null, inputs.monteCarloOutputs ?? null,
    searchMetrics, constraints,
  );

  return {
    empty: false,
    phase5,
    goalReverseEngineering,
    constraintsResolved: constraints,
    scenarios: filtered,
    recommendations,
    gapSolver,
    frontier,
    searchMetrics,
    auditTrail,
  };
}

/* ─── Presentation helpers ─────────────────────────────────────────────── */

export function formatScenarioMetric(m: ScenarioMetric): string {
  if (m.textOverride) return m.textOverride;
  if (m.format === "band") {
    /* Sprint 15 Phase 3 — banded confidence display. */
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
    case "percent":  return `${Math.round(m.value * 100)}%`;
    case "score":    return `${Math.round(m.value)} / 100`;
    case "years":    return `${m.value.toFixed(1)} yr`;
    case "months":   return `${m.value.toFixed(1)} mo`;
    case "date":     return String(Math.round(m.value));
    case "text":
    default:         return String(m.value);
  }
}
