/**
 * goalSolverPro.ts — Sprint 10 orchestrator.
 *
 * Pure orchestration on top of Sprint 7 (TruePortfolioOptimizer), Sprint 8
 * (ProbabilisticWealthEngine) and Sprint 9 (PathSimulationEngine). NO new
 * financial formulas. Every output traces back to an existing canonical
 * engine field.
 *
 * Algorithm:
 *   1.  Goal Feasibility       — Read Sprint 9.bestStrategy probabilities
 *   2.  Goal Gap Analysis      — Shortfalls vs Sprint 9.bestStrategy bands
 *   3.  Reverse Engineering    — Find Sprint 7 strategy satisfying targets
 *   4.  Constraint Solver      — Filter Sprint 7 candidates by constraints
 *   5.  Optimization Search    — Selector functions over Sprint 9 outputs
 *   6.  Action Plan Engine     — Read year-by-year from strategy + netWorthFan
 *   7.  Audit Trail            — Every output ties to source engine + field
 *
 * Engine version: sprint-10.goal-solver.v1
 * Default seed: 10
 */

import type {
  TruePortfolioOptimizerResult,
  ScenarioRecord,
} from "./truePortfolioOptimizer";
import type {
  PathSimulationResult,
  PathStrategyResult,
  PathYearBand,
} from "./pathSimulationEngine";
import type { ProbabilisticWealthEngineResult } from "./probabilisticWealthEngine";
import type { CanonicalFire } from "./canonicalFire";
import type { DashboardInputs } from "./dashboardDataContract";
import type { FireMCPlanInput, FireMCSettings } from "./fireMonteCarlo";

export const PATH_GOAL_SOLVER_VERSION = "sprint-10.goal-solver.v1";
export const DEFAULT_GOAL_SOLVER_SEED = 10;

/* ─── User targets ──────────────────────────────────────────────────── */

export interface GoalSolverProTargets {
  targetFireYear?: number | null;
  targetNetWorth?: number | null;
  targetPassiveIncomeAnnual?: number | null;
  targetPassiveIncomeMonthly?: number | null;
  targetPropertyCount?: number | null;
  targetPortfolioValue?: number | null;
  targetDebtCeiling?: number | null;
  targetMonthlyContributionLimit?: number | null;
  targetRiskLimit?: number | null;
  targetLiquidityMinimum?: number | null;
  targetRetirementYear?: number | null;
}

export const EMPTY_GOAL_TARGETS: GoalSolverProTargets = {};

/* ─── Output types ──────────────────────────────────────────────────── */

export type FeasibilityStatus = "ACHIEVABLE" | "STRETCH" | "UNLIKELY" | "IMPOSSIBLE";

export interface AuditFields {
  enginesUsed: string[];
  inputsUsed: string[];
  assumptionsUsed: string[];
  probabilitySource: string;
  pathSource: string;
  constraintSource: string;
  confidenceSource: string;
  howCalculated: string;
}

export interface FeasibilitySection {
  status: FeasibilityStatus;
  /** Sprint 9 best strategy probability of FIRE by target year. */
  probabilityOfSuccess: number | null;
  /** Sprint 9 best strategy median FIRE year. */
  medianFireYear: number | null;
  /** Sprint 9 best strategy P10 (optimistic) FIRE year. */
  bestCaseFireYear: number | null;
  /** Sprint 9 best strategy P90 (worst-reasonable) FIRE year. */
  worstCaseFireYear: number | null;
  /** Sprint 9 best strategy expected FIRE year (median). */
  expectedFireYear: number | null;
  audit: AuditFields;
}

export type GapField =
  | "netWorth"
  | "passiveIncomeAnnual"
  | "passiveIncomeMonthly"
  | "fireYear"
  | "propertyCount"
  | "portfolioValue"
  | "debt"
  | "monthlyContribution"
  | "risk"
  | "liquidity"
  | "retirementYear";

export interface GapEntry {
  field: GapField;
  label: string;
  target: number;
  actual: number | null;
  shortfall: number;
  unit: string;
  status: "met" | "shortfall" | "incomplete";
  audit: AuditFields;
}

export interface GapSection {
  entries: GapEntry[];
  /** True when any required engine output is missing. */
  incomplete: boolean;
  blockers: string[];
  audit: AuditFields;
}

export interface RequiredInputsSection {
  requiredMonthlyDCA: number | null;
  requiredAdditionalCapital: number | null;
  requiredAdditionalProperties: number | null;
  requiredSavingsRate: number | null;
  requiredFireNumber: number | null;
  /** Sprint 7 strategy id that produced these values. */
  sourceStrategyId: string | null;
  sourceStrategyLabel: string | null;
  audit: AuditFields;
}

export interface ConstraintCheck {
  constraint: string;
  value: number | null;
  limit: number | null;
  pass: boolean;
  /** When false, identifies which engine field exposed the violation. */
  violationSource: string | null;
  audit: AuditFields;
}

export interface ConstraintsSection {
  checks: ConstraintCheck[];
  passed: number;
  failed: number;
  /** Total Sprint 7 strategies considered. */
  candidatesEvaluated: number;
  /** Sprint 7 strategies that pass every user constraint. */
  candidatesPassing: number;
  audit: AuditFields;
}

export interface BlockerEntry {
  constraint: string;
  reason: string;
  strategiesEliminated: string[];
  audit: AuditFields;
}

export interface PathCandidate {
  /** Sprint 7 strategy id (no synthesised strategies). */
  strategyId: string;
  /** Sprint 7 label. */
  label: string;
  /** Sprint 9 outputs for this strategy. */
  probabilityFireByTarget: number | null;
  medianFireYear: number | null;
  netWorthP50: number | null;
  passiveIncomeP50: number | null;
  probabilityCashShortfall: number | null;
  probabilityNegativeCashflow: number | null;
  robustScore: number | null;
  /** Strategy's settled+planned property count, read from Sprint 7 dimensions. */
  propertyCount: number;
  /** Required monthly contribution from Sprint 7 metrics. */
  requiredMonthlyContribution: number | null;
  audit: AuditFields;
}

export type OptimizationObjective =
  | "fastestFire"
  | "highestProbability"
  | "lowestRisk"
  | "bestHybrid"
  | "highestNetWorth"
  | "bestPassiveIncome"
  | "bestDebtAdjusted"
  | "bestLiquidityAdjusted";

export interface OptimizationResult {
  objective: OptimizationObjective;
  label: string;
  path: PathCandidate | null;
  /** The selector value computed for this objective. */
  score: number | null;
  audit: AuditFields;
}

export interface ActionPlanEntry {
  year: number;
  action: string;
  /** Sprint 7 strategy id this entry traces to. */
  sourceStrategyId: string;
  /** Input field that drove the action (e.g. "dimensions.propertyYear"). */
  inputField: string;
  enginesUsed: string[];
  inputsUsed: string[];
  auditNote: string;
}

export interface AuditEntry {
  id: string;
  label: string;
  enginesUsed: string[];
  inputsUsed: string[];
  assumptionsUsed: string[];
  probabilitySource: string;
  pathSource: string;
  constraintSource: string;
  confidenceSource: string;
  howCalculated: string;
}

export interface GoalSolverProResult {
  empty: boolean;
  emptyReason?: string;
  engineVersion: string;
  seed: number;
  targets: GoalSolverProTargets;
  feasibility: FeasibilitySection;
  gap: GapSection;
  requiredInputs: RequiredInputsSection;
  constraints: ConstraintsSection;
  blockers: BlockerEntry[];
  bestPath: PathCandidate | null;
  alternativePaths: OptimizationResult[];
  actionPlan: ActionPlanEntry[];
  auditTrail: AuditEntry[];
}

/* ─── Inputs ────────────────────────────────────────────────────────── */

export interface GoalSolverProInputs {
  canonicalLedger: DashboardInputs | null | undefined;
  canonicalFire: CanonicalFire;
  sprint7Result: TruePortfolioOptimizerResult;
  sprint8Result?: ProbabilisticWealthEngineResult | null;
  sprint9Result: PathSimulationResult;
  planInput?: FireMCPlanInput | null;
  mcSettings?: Partial<FireMCSettings>;
  targets: GoalSolverProTargets;
  seed?: number;
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

const ENGINE_LIST = [
  "truePortfolioOptimizer (Sprint 7)",
  "probabilisticWealthEngine (Sprint 8)",
  "pathSimulationEngine (Sprint 9)",
  "canonicalFire",
];

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function getYearBand(fan: PathYearBand[], year: number | null): PathYearBand | null {
  if (year == null) return null;
  return fan.find((b) => b.year === year) ?? null;
}

function strategyPropertyCount(s: ScenarioRecord): number {
  // Read from Sprint 7 dimensions — no inference.
  if (s.dimensions.property === "buy-investment-property") return 1;
  return 0;
}

function strategyRequiredMonthlyContribution(s: ScenarioRecord): number | null {
  const v = s.metrics.requiredMonthlyContribution.value;
  return finite(v) ? v : null;
}

function strategyRequiredAssetBase(s: ScenarioRecord): number | null {
  const v = s.metrics.requiredAssetBase.value;
  return finite(v) ? v : null;
}

function strategyRiskScore(s: ScenarioRecord): number | null {
  const v = s.metrics.riskScore.value;
  return finite(v) ? v : null;
}

function strategyLiquidityPosition(s: ScenarioRecord): number | null {
  const v = s.metrics.liquidityPosition.value;
  return finite(v) ? v : null;
}

function pathStrategyOf(
  sprint9: PathSimulationResult,
  strategyId: string,
): PathStrategyResult | null {
  return sprint9.strategies.find((p) => p.scenarioId === strategyId) ?? null;
}

function defaultAudit(extra: Partial<AuditFields> = {}): AuditFields {
  return {
    enginesUsed: ENGINE_LIST.slice(),
    inputsUsed: ["targets", "sprint7Result.scenarios", "sprint9Result.strategies"],
    assumptionsUsed: [
      "Sprint 7 strategies are authoritative — no synthesised scenarios",
      "Sprint 9 P(FIRE) and net-worth bands are authoritative",
      "Risk/liquidity ceilings sourced from Sprint 7 metrics",
    ],
    probabilitySource: "pathSimulationEngine.strategies[*].probabilityFireByTarget",
    pathSource: "pathSimulationEngine.strategies[*].netWorthFan",
    constraintSource: "user targets + truePortfolioOptimizer.scenarios[*].metrics",
    confidenceSource: "pathSimulationEngine.strategies[*].robustScore",
    howCalculated: "Pure orchestration over Sprint 7/8/9 outputs — no recomputation",
    ...extra,
  };
}

/* ─── Step 1: Feasibility ───────────────────────────────────────────── */

function classifyStatus(
  prob: number | null,
  hardConstraintViolated: boolean,
): FeasibilityStatus {
  if (hardConstraintViolated) return "IMPOSSIBLE";
  if (prob == null || !Number.isFinite(prob)) return "UNLIKELY";
  if (prob >= 0.70) return "ACHIEVABLE";
  if (prob >= 0.40) return "STRETCH";
  if (prob >= 0.10) return "UNLIKELY";
  return "IMPOSSIBLE";
}

function buildFeasibility(
  sprint9: PathSimulationResult,
  targets: GoalSolverProTargets,
  hardConstraintViolated: boolean,
): FeasibilitySection {
  const best = sprint9.bestStrategy;
  const noTargets = Object.values(targets).every(
    (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)),
  );
  if (best == null) {
    return {
      status: noTargets ? "ACHIEVABLE" : "UNLIKELY",
      probabilityOfSuccess: null,
      medianFireYear: null,
      bestCaseFireYear: null,
      worstCaseFireYear: null,
      expectedFireYear: null,
      audit: defaultAudit({
        howCalculated: "No Sprint 9 best strategy available — empty feasibility",
      }),
    };
  }

  const prob = best.probabilityFireByTarget;
  const median = best.fireYearBand.p50;
  const optimistic = best.fireYearBand.p10;
  const pessimistic = best.fireYearBand.p90;

  let status: FeasibilityStatus;
  if (noTargets) {
    status = "ACHIEVABLE";
  } else {
    status = classifyStatus(prob, hardConstraintViolated);
  }

  return {
    status,
    probabilityOfSuccess: prob,
    medianFireYear: median,
    bestCaseFireYear: optimistic,
    worstCaseFireYear: pessimistic,
    expectedFireYear: median,
    audit: defaultAudit({
      howCalculated: `Status from Sprint 9 P(FIRE)=${prob ?? "n/a"} thresholded at 0.70/0.40/0.10; ${hardConstraintViolated ? "IMPOSSIBLE forced by hard-constraint violation" : "no hard violation"}`,
      probabilitySource: `pathSimulationEngine.bestStrategy.probabilityFireByTarget = ${prob}`,
    }),
  };
}

/* ─── Step 2: Gap Analysis ──────────────────────────────────────────── */

function gapEntry(
  field: GapField,
  label: string,
  target: number,
  actual: number | null,
  unit: string,
  audit: AuditFields,
  invert = false,
): GapEntry {
  if (!finite(actual)) {
    return { field, label, target, actual, shortfall: 0, unit, status: "incomplete", audit };
  }
  // "shortfall" is non-negative. For "more is better" fields, shortfall = max(0, target - actual).
  // For "less is better" fields (debt, risk), shortfall = max(0, actual - target).
  const raw = invert ? actual - target : target - actual;
  const shortfall = Math.max(0, raw);
  return {
    field,
    label,
    target,
    actual,
    shortfall,
    unit,
    status: shortfall > 0 ? "shortfall" : "met",
    audit,
  };
}

function buildGap(
  sprint9: PathSimulationResult,
  sprint7: TruePortfolioOptimizerResult,
  canonicalLedger: DashboardInputs | null | undefined,
  targets: GoalSolverProTargets,
): GapSection {
  const entries: GapEntry[] = [];
  const blockers: string[] = [];
  const best = sprint9.bestStrategy;
  const targetYear = targets.targetFireYear ?? targets.targetRetirementYear ?? null;

  if (finite(targets.targetNetWorth)) {
    const yearBand =
      targetYear != null ? getYearBand(best?.netWorthFan ?? [], targetYear) : null;
    const actual = yearBand?.p50 ?? best?.netWorthBand?.p50 ?? null;
    entries.push(
      gapEntry(
        "netWorth",
        "Target Net Worth",
        targets.targetNetWorth as number,
        actual,
        "$",
        defaultAudit({
          howCalculated: `Sprint 9 netWorth P50 ${targetYear != null ? `@ year ${targetYear}` : "at horizon"}`,
          pathSource: `pathSimulationEngine.bestStrategy.netWorthFan[year=${targetYear}].p50`,
        }),
      ),
    );
  }

  if (finite(targets.targetPassiveIncomeAnnual)) {
    const actual = best?.passiveIncomeBand?.p50 ?? null;
    entries.push(
      gapEntry(
        "passiveIncomeAnnual",
        "Target Passive Income (annual)",
        targets.targetPassiveIncomeAnnual as number,
        actual,
        "$/yr",
        defaultAudit({
          howCalculated: "Sprint 9 passiveIncomeBand P50",
          pathSource: "pathSimulationEngine.bestStrategy.passiveIncomeBand.p50",
        }),
      ),
    );
  }

  if (finite(targets.targetPassiveIncomeMonthly)) {
    const annualP50 = best?.passiveIncomeBand?.p50 ?? null;
    const actual = finite(annualP50) ? annualP50 / 12 : null;
    entries.push(
      gapEntry(
        "passiveIncomeMonthly",
        "Target Monthly Passive Income",
        targets.targetPassiveIncomeMonthly as number,
        actual,
        "$/mo",
        defaultAudit({
          howCalculated: "Sprint 9 passiveIncomeBand P50 / 12",
          pathSource: "pathSimulationEngine.bestStrategy.passiveIncomeBand.p50",
        }),
      ),
    );
  }

  if (finite(targets.targetFireYear)) {
    const actual = best?.fireYearBand?.p50 ?? null;
    // FIRE year is "less is better" (earlier is better).
    entries.push(
      gapEntry(
        "fireYear",
        "Target FIRE Year",
        targets.targetFireYear as number,
        actual,
        "year",
        defaultAudit({
          howCalculated: "Sprint 9 fireYearBand P50",
          pathSource: "pathSimulationEngine.bestStrategy.fireYearBand.p50",
        }),
        true,
      ),
    );
  }

  if (finite(targets.targetPropertyCount)) {
    const winningScenario = sprint7.recommendations[0]?.scenarioId ?? null;
    const sr = winningScenario
      ? sprint7.scenarios.find((s) => s.id === winningScenario)
      : sprint7.scenarios[0];
    const actual = sr ? strategyPropertyCount(sr) : null;
    entries.push(
      gapEntry(
        "propertyCount",
        "Target Property Count",
        targets.targetPropertyCount as number,
        actual,
        "props",
        defaultAudit({
          howCalculated: "Sprint 7 best scenario dimensions.property",
          constraintSource: "truePortfolioOptimizer.scenarios[*].dimensions.property",
        }),
      ),
    );
  }

  if (finite(targets.targetPortfolioValue)) {
    // Portfolio value ≈ net worth excluding PPOR — but we DON'T invent a new
    // formula here. We surface Sprint 9 netWorthBand.p50 as the engine-backed
    // closest portfolio-aggregate. If a user wants strict portfolio, they
    // can rely on Sprint 9 fan; otherwise this is incomplete.
    const actual = best?.netWorthBand?.p50 ?? null;
    entries.push(
      gapEntry(
        "portfolioValue",
        "Target Portfolio Value",
        targets.targetPortfolioValue as number,
        actual,
        "$",
        defaultAudit({
          howCalculated: "Sprint 9 netWorth P50 used as portfolio-aggregate proxy",
          pathSource: "pathSimulationEngine.bestStrategy.netWorthBand.p50",
        }),
      ),
    );
  }

  if (finite(targets.targetDebtCeiling) && canonicalLedger?.snapshot) {
    const snap = canonicalLedger.snapshot as Record<string, unknown>;
    const mortgage = Number(snap["mortgage"] ?? 0);
    const other = Number(snap["other_debts"] ?? 0);
    const debt =
      (Number.isFinite(mortgage) ? mortgage : 0) + (Number.isFinite(other) ? other : 0);
    entries.push(
      gapEntry(
        "debt",
        "Debt Ceiling",
        targets.targetDebtCeiling as number,
        debt,
        "$",
        defaultAudit({
          howCalculated: "canonical ledger mortgage + other_debts",
          constraintSource: "canonicalLedger.snapshot.{mortgage,other_debts}",
        }),
        true,
      ),
    );
    if (debt > (targets.targetDebtCeiling as number)) {
      blockers.push("debt");
    }
  }

  if (finite(targets.targetMonthlyContributionLimit)) {
    const winning = sprint7.recommendations[0]?.scenarioId ?? null;
    const sr = winning
      ? sprint7.scenarios.find((s) => s.id === winning)
      : sprint7.scenarios[0];
    const required = sr ? strategyRequiredMonthlyContribution(sr) : null;
    entries.push(
      gapEntry(
        "monthlyContribution",
        "Monthly Contribution Limit",
        targets.targetMonthlyContributionLimit as number,
        required,
        "$/mo",
        defaultAudit({
          howCalculated: "Sprint 7 scenario.metrics.requiredMonthlyContribution",
          constraintSource: "truePortfolioOptimizer.scenarios[*].metrics.requiredMonthlyContribution",
        }),
        true,
      ),
    );
  }

  if (finite(targets.targetRiskLimit)) {
    const winning = sprint7.recommendations[0]?.scenarioId ?? null;
    const sr = winning
      ? sprint7.scenarios.find((s) => s.id === winning)
      : sprint7.scenarios[0];
    const risk = sr ? strategyRiskScore(sr) : null;
    entries.push(
      gapEntry(
        "risk",
        "Risk Limit",
        targets.targetRiskLimit as number,
        risk,
        "score",
        defaultAudit({
          howCalculated: "Sprint 7 scenario.metrics.riskScore",
          constraintSource: "truePortfolioOptimizer.scenarios[*].metrics.riskScore",
        }),
        true,
      ),
    );
  }

  if (finite(targets.targetLiquidityMinimum)) {
    const winning = sprint7.recommendations[0]?.scenarioId ?? null;
    const sr = winning
      ? sprint7.scenarios.find((s) => s.id === winning)
      : sprint7.scenarios[0];
    const liq = sr ? strategyLiquidityPosition(sr) : null;
    entries.push(
      gapEntry(
        "liquidity",
        "Liquidity Minimum",
        targets.targetLiquidityMinimum as number,
        liq,
        "months",
        defaultAudit({
          howCalculated: "Sprint 7 scenario.metrics.liquidityPosition",
          constraintSource: "truePortfolioOptimizer.scenarios[*].metrics.liquidityPosition",
        }),
      ),
    );
  }

  if (finite(targets.targetRetirementYear)) {
    const actual = best?.fireYearBand?.p50 ?? null;
    entries.push(
      gapEntry(
        "retirementYear",
        "Retirement Year",
        targets.targetRetirementYear as number,
        actual,
        "year",
        defaultAudit({
          howCalculated: "Sprint 9 fireYearBand P50 used as retirement-year proxy",
          pathSource: "pathSimulationEngine.bestStrategy.fireYearBand.p50",
        }),
        true,
      ),
    );
  }

  const incomplete = entries.some((e) => e.status === "incomplete");

  return {
    entries,
    incomplete,
    blockers,
    audit: defaultAudit({
      howCalculated: "Per-target gap = max(0, target − actual) (or actual − target for less-is-better)",
    }),
  };
}

/* ─── Step 3: Reverse Engineering ───────────────────────────────────── */

function findSatisfyingStrategy(
  sprint7: TruePortfolioOptimizerResult,
  sprint9: PathSimulationResult,
  targets: GoalSolverProTargets,
): ScenarioRecord | null {
  // Search across Sprint 7 ranked scenarios. Read each one's Sprint 9 output
  // if available; pick the first that satisfies targets.
  const scenarios = sprint7.scenarios.filter((s) => s.valid);
  for (const s of scenarios) {
    const p9 = pathStrategyOf(sprint9, s.id);
    let ok = true;
    if (finite(targets.targetNetWorth) && finite(p9?.netWorthBand?.p50 ?? null)) {
      if ((p9!.netWorthBand.p50 as number) < (targets.targetNetWorth as number)) ok = false;
    }
    if (
      ok &&
      finite(targets.targetPassiveIncomeAnnual) &&
      finite(p9?.passiveIncomeBand?.p50 ?? null)
    ) {
      if ((p9!.passiveIncomeBand.p50 as number) < (targets.targetPassiveIncomeAnnual as number))
        ok = false;
    }
    if (ok && finite(targets.targetFireYear) && finite(p9?.fireYearBand?.p50 ?? null)) {
      if ((p9!.fireYearBand.p50 as number) > (targets.targetFireYear as number)) ok = false;
    }
    if (ok) return s;
  }
  return null;
}

function buildRequiredInputs(
  sprint7: TruePortfolioOptimizerResult,
  sprint9: PathSimulationResult,
  canonicalFire: CanonicalFire,
  canonicalLedger: DashboardInputs | null | undefined,
  targets: GoalSolverProTargets,
): RequiredInputsSection {
  let source = findSatisfyingStrategy(sprint7, sprint9, targets);
  if (!source) {
    // Fall back to Sprint 7's primary recommendation — still a real strategy.
    const winningId = sprint7.recommendations[0]?.scenarioId ?? null;
    source = (winningId && sprint7.scenarios.find((s) => s.id === winningId)) || null;
  }
  if (!source) {
    return {
      requiredMonthlyDCA: null,
      requiredAdditionalCapital: null,
      requiredAdditionalProperties: null,
      requiredSavingsRate: null,
      requiredFireNumber: canonicalFire.fireNumber || null,
      sourceStrategyId: null,
      sourceStrategyLabel: null,
      audit: defaultAudit({
        howCalculated: "No Sprint 7 strategy available — required inputs incomplete",
      }),
    };
  }

  const requiredMonthlyDCA = strategyRequiredMonthlyContribution(source);
  const requiredAssetBase = strategyRequiredAssetBase(source);
  const currentNW = canonicalFire.netWorthNow || 0;
  const requiredAdditionalCapital = finite(requiredAssetBase)
    ? Math.max(0, requiredAssetBase - currentNW)
    : null;

  const targetProps = finite(targets.targetPropertyCount) ? (targets.targetPropertyCount as number) : 0;
  const currentProps = strategyPropertyCount(source);
  const requiredAdditionalProperties = Math.max(0, targetProps - currentProps);

  // Savings rate is read from canonical ledger income vs strategy required DCA.
  // We do NOT compute a new savings rate; we surface the ratio.
  let requiredSavingsRate: number | null = null;
  if (canonicalLedger?.snapshot && finite(requiredMonthlyDCA)) {
    const snap = canonicalLedger.snapshot as Record<string, unknown>;
    const rohamInc = Number(snap["roham_monthly_income"] ?? 0);
    const faraInc = Number(snap["fara_monthly_income"] ?? 0);
    const monthlyIncome =
      (Number.isFinite(rohamInc) ? rohamInc : 0) + (Number.isFinite(faraInc) ? faraInc : 0);
    if (monthlyIncome > 0) {
      requiredSavingsRate = Math.max(0, Math.min(1, (requiredMonthlyDCA as number) / monthlyIncome));
    }
  }

  return {
    requiredMonthlyDCA,
    requiredAdditionalCapital,
    requiredAdditionalProperties,
    requiredSavingsRate,
    requiredFireNumber: canonicalFire.fireNumber || null,
    sourceStrategyId: source.id,
    sourceStrategyLabel: source.label,
    audit: defaultAudit({
      howCalculated: `Reverse-engineering: scanned Sprint 7 scenarios, picked id=${source.id} ("${source.label}"). Values read from its existing metrics — no new math.`,
      inputsUsed: [
        "sprint7Result.scenarios[id=" + source.id + "].metrics.requiredMonthlyContribution",
        "sprint7Result.scenarios[id=" + source.id + "].metrics.requiredAssetBase",
        "canonicalFire.netWorthNow",
        "canonicalLedger.snapshot.{roham_monthly_income,fara_monthly_income}",
      ],
    }),
  };
}

/* ─── Step 4: Constraint Solver ─────────────────────────────────────── */

function buildConstraints(
  sprint7: TruePortfolioOptimizerResult,
  sprint9: PathSimulationResult,
  canonicalLedger: DashboardInputs | null | undefined,
  targets: GoalSolverProTargets,
): { section: ConstraintsSection; passingStrategies: ScenarioRecord[]; blockers: BlockerEntry[] } {
  const checks: ConstraintCheck[] = [];
  const blockers: BlockerEntry[] = [];

  // Aggregate household debt from canonical ledger (read, never invent).
  let currentDebt = 0;
  if (canonicalLedger?.snapshot) {
    const snap = canonicalLedger.snapshot as Record<string, unknown>;
    const mortgage = Number(snap["mortgage"] ?? 0);
    const other = Number(snap["other_debts"] ?? 0);
    currentDebt =
      (Number.isFinite(mortgage) ? mortgage : 0) + (Number.isFinite(other) ? other : 0);
  }

  if (finite(targets.targetDebtCeiling)) {
    const limit = targets.targetDebtCeiling as number;
    const pass = currentDebt <= limit;
    checks.push({
      constraint: "Max Debt",
      value: currentDebt,
      limit,
      pass,
      violationSource: pass ? null : "canonicalLedger.snapshot.{mortgage,other_debts}",
      audit: defaultAudit({
        howCalculated: `currentDebt ${pass ? "≤" : ">"} target ${limit}`,
        constraintSource: "canonicalLedger.snapshot.mortgage + other_debts vs targetDebtCeiling",
      }),
    });
  }

  // Property count, monthly contribution, risk, liquidity — evaluated per strategy
  // and used to filter candidates.
  const scenarios = sprint7.scenarios.filter((s) => s.valid);
  const passing: ScenarioRecord[] = [];
  const eliminations: Record<string, string[]> = {
    "Max Property Count": [],
    "Max Monthly Contribution": [],
    "Max Risk": [],
    "Min Liquidity": [],
    "Max Debt": [],
    "Retirement Year": [],
  };
  for (const s of scenarios) {
    let strategyOk = true;
    if (finite(targets.targetPropertyCount)) {
      const pc = strategyPropertyCount(s);
      if (pc > (targets.targetPropertyCount as number)) {
        strategyOk = false;
        eliminations["Max Property Count"].push(s.id);
      }
    }
    if (finite(targets.targetMonthlyContributionLimit)) {
      const dca = strategyRequiredMonthlyContribution(s);
      if (finite(dca) && (dca as number) > (targets.targetMonthlyContributionLimit as number)) {
        strategyOk = false;
        eliminations["Max Monthly Contribution"].push(s.id);
      }
    }
    if (finite(targets.targetRiskLimit)) {
      const r = strategyRiskScore(s);
      if (finite(r) && (r as number) > (targets.targetRiskLimit as number)) {
        strategyOk = false;
        eliminations["Max Risk"].push(s.id);
      }
    }
    if (finite(targets.targetLiquidityMinimum)) {
      const l = strategyLiquidityPosition(s);
      if (finite(l) && (l as number) < (targets.targetLiquidityMinimum as number)) {
        strategyOk = false;
        eliminations["Min Liquidity"].push(s.id);
      }
    }
    if (finite(targets.targetDebtCeiling) && currentDebt > (targets.targetDebtCeiling as number)) {
      strategyOk = false;
      eliminations["Max Debt"].push(s.id);
    }
    if (finite(targets.targetRetirementYear)) {
      const p9 = pathStrategyOf(sprint9, s.id);
      const median = p9?.fireYearBand?.p50 ?? null;
      if (finite(median) && (median as number) > (targets.targetRetirementYear as number)) {
        strategyOk = false;
        eliminations["Retirement Year"].push(s.id);
      }
    }
    if (strategyOk) passing.push(s);
  }

  // Aggregate per-constraint pass/fail checks.
  const constraintPairs: Array<[keyof typeof eliminations, number | null]> = [
    ["Max Property Count", finite(targets.targetPropertyCount) ? (targets.targetPropertyCount as number) : null],
    ["Max Monthly Contribution", finite(targets.targetMonthlyContributionLimit) ? (targets.targetMonthlyContributionLimit as number) : null],
    ["Max Risk", finite(targets.targetRiskLimit) ? (targets.targetRiskLimit as number) : null],
    ["Min Liquidity", finite(targets.targetLiquidityMinimum) ? (targets.targetLiquidityMinimum as number) : null],
    ["Retirement Year", finite(targets.targetRetirementYear) ? (targets.targetRetirementYear as number) : null],
  ];
  for (const [name, limit] of constraintPairs) {
    if (limit == null) continue;
    const elim = eliminations[name];
    const pass = elim.length === 0 && passing.length > 0;
    checks.push({
      constraint: name,
      value: elim.length,
      limit,
      pass,
      violationSource: pass ? null : `truePortfolioOptimizer.scenarios filtered out ${elim.length} candidate(s)`,
      audit: defaultAudit({
        howCalculated: `${elim.length} candidate strategies failed ${name} limit ${limit}`,
        constraintSource: `truePortfolioOptimizer.scenarios[*].metrics or .dimensions vs ${name}`,
      }),
    });
    if (elim.length > 0) {
      blockers.push({
        constraint: name,
        reason: `${elim.length} strategies eliminated by ${name} limit ${limit}`,
        strategiesEliminated: elim.slice(0, 8),
        audit: defaultAudit({
          howCalculated: `Filtered Sprint 7 scenarios where strategy violated ${name}`,
          constraintSource: `truePortfolioOptimizer.scenarios[*]`,
        }),
      });
    }
  }

  // Hard violation: zero strategies pass.
  if (scenarios.length > 0 && passing.length === 0) {
    blockers.push({
      constraint: "Zero feasible strategies",
      reason: "No Sprint 7 strategy passes the supplied constraint set",
      strategiesEliminated: scenarios.map((s) => s.id),
      audit: defaultAudit({
        howCalculated: "Constraint intersection eliminated every Sprint 7 candidate",
        constraintSource: "user targets ∩ truePortfolioOptimizer.scenarios",
      }),
    });
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;

  return {
    section: {
      checks,
      passed,
      failed,
      candidatesEvaluated: scenarios.length,
      candidatesPassing: passing.length,
      audit: defaultAudit({
        howCalculated: `${scenarios.length} candidates evaluated; ${passing.length} pass every supplied constraint`,
      }),
    },
    passingStrategies: passing,
    blockers,
  };
}

/* ─── Step 5: Optimization Search ───────────────────────────────────── */

function toCandidate(
  s: ScenarioRecord,
  p9: PathStrategyResult | null,
): PathCandidate {
  return {
    strategyId: s.id,
    label: s.label,
    probabilityFireByTarget: p9?.probabilityFireByTarget ?? null,
    medianFireYear: p9?.fireYearBand?.p50 ?? null,
    netWorthP50: p9?.netWorthBand?.p50 ?? null,
    passiveIncomeP50: p9?.passiveIncomeBand?.p50 ?? null,
    probabilityCashShortfall: p9?.probabilityCashShortfall ?? null,
    probabilityNegativeCashflow: p9?.probabilityNegativeCashflow ?? null,
    robustScore: p9?.robustScore ?? null,
    propertyCount: strategyPropertyCount(s),
    requiredMonthlyContribution: strategyRequiredMonthlyContribution(s),
    audit: defaultAudit({
      howCalculated: `Candidate built from Sprint 7 scenario id=${s.id} ⨯ Sprint 9 strategy id=${s.id}`,
      inputsUsed: [
        `sprint7Result.scenarios[id=${s.id}]`,
        `sprint9Result.strategies[scenarioId=${s.id}]`,
      ],
    }),
  };
}

function optimizationSearch(
  candidates: PathCandidate[],
  sprint7: TruePortfolioOptimizerResult,
  canonicalLedger: DashboardInputs | null | undefined,
): { best: PathCandidate | null; alternatives: OptimizationResult[] } {
  const finitePathProp = (c: PathCandidate, key: keyof PathCandidate): number | null => {
    const v = c[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  function maxBy(score: (c: PathCandidate) => number | null) {
    let best: PathCandidate | null = null;
    let bestScore: number | null = null;
    for (const c of candidates) {
      const s = score(c);
      if (s == null || !Number.isFinite(s)) continue;
      if (bestScore == null || s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return { best, score: bestScore };
  }
  function minBy(score: (c: PathCandidate) => number | null) {
    let best: PathCandidate | null = null;
    let bestScore: number | null = null;
    for (const c of candidates) {
      const s = score(c);
      if (s == null || !Number.isFinite(s)) continue;
      if (bestScore == null || s < bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return { best, score: bestScore };
  }

  let mortgage = 0;
  let other = 0;
  if (canonicalLedger?.snapshot) {
    const snap = canonicalLedger.snapshot as Record<string, unknown>;
    mortgage = Number(snap["mortgage"] ?? 0);
    other = Number(snap["other_debts"] ?? 0);
    if (!Number.isFinite(mortgage)) mortgage = 0;
    if (!Number.isFinite(other)) other = 0;
  }
  const householdDebt = mortgage + other;

  const fastest = minBy((c) => finitePathProp(c, "medianFireYear"));
  const highestProb = maxBy((c) => finitePathProp(c, "probabilityFireByTarget"));
  const lowestRisk = minBy((c) => {
    const a = finitePathProp(c, "probabilityCashShortfall");
    const b = finitePathProp(c, "probabilityNegativeCashflow");
    if (a == null && b == null) return null;
    return (a ?? 0) + (b ?? 0);
  });
  const highestNW = maxBy((c) => finitePathProp(c, "netWorthP50"));
  const bestIncome = maxBy((c) => finitePathProp(c, "passiveIncomeP50"));
  const debtAdj = maxBy((c) => {
    const nw = finitePathProp(c, "netWorthP50");
    if (nw == null) return null;
    return nw / Math.max(1, householdDebt);
  });
  const liqAdj = maxBy((c) => {
    const nw = finitePathProp(c, "netWorthP50");
    if (nw == null) return null;
    const liq = (() => {
      const sr = sprint7.scenarios.find((s) => s.id === c.strategyId);
      return sr ? strategyLiquidityPosition(sr) : null;
    })();
    if (!finite(liq) || (liq as number) <= 0) return null;
    return nw / (liq as number);
  });
  const hybrid = maxBy((c) => {
    const rs = finitePathProp(c, "robustScore");
    const p = finitePathProp(c, "probabilityFireByTarget");
    if (rs == null || p == null) return null;
    return rs * p;
  });

  const alts: OptimizationResult[] = [
    {
      objective: "fastestFire",
      label: "Fastest FIRE",
      path: fastest.best,
      score: fastest.score,
      audit: defaultAudit({
        howCalculated: "min(medianFireYear) over passing Sprint 7 strategies",
        probabilitySource: "pathSimulationEngine.strategies[*].fireYearBand.p50",
      }),
    },
    {
      objective: "highestProbability",
      label: "Highest Probability",
      path: highestProb.best,
      score: highestProb.score,
      audit: defaultAudit({
        howCalculated: "max(probabilityFireByTarget) over passing Sprint 7 strategies",
        probabilitySource: "pathSimulationEngine.strategies[*].probabilityFireByTarget",
      }),
    },
    {
      objective: "lowestRisk",
      label: "Lowest Risk",
      path: lowestRisk.best,
      score: lowestRisk.score,
      audit: defaultAudit({
        howCalculated: "min(probCashShortfall + probNegCashflow)",
        probabilitySource: "pathSimulationEngine.strategies[*].{probabilityCashShortfall,probabilityNegativeCashflow}",
      }),
    },
    {
      objective: "bestHybrid",
      label: "Best Hybrid",
      path: hybrid.best,
      score: hybrid.score,
      audit: defaultAudit({
        howCalculated: "max(robustScore × probabilityFireByTarget)",
        confidenceSource: "pathSimulationEngine.strategies[*].robustScore",
      }),
    },
    {
      objective: "highestNetWorth",
      label: "Highest Net Worth",
      path: highestNW.best,
      score: highestNW.score,
      audit: defaultAudit({
        howCalculated: "max(netWorthBand.p50)",
        pathSource: "pathSimulationEngine.strategies[*].netWorthBand.p50",
      }),
    },
    {
      objective: "bestPassiveIncome",
      label: "Best Passive Income",
      path: bestIncome.best,
      score: bestIncome.score,
      audit: defaultAudit({
        howCalculated: "max(passiveIncomeBand.p50)",
        pathSource: "pathSimulationEngine.strategies[*].passiveIncomeBand.p50",
      }),
    },
    {
      objective: "bestDebtAdjusted",
      label: "Best Debt-Adjusted",
      path: debtAdj.best,
      score: debtAdj.score,
      audit: defaultAudit({
        howCalculated: "max(netWorthP50 / householdDebt)",
        constraintSource: "canonicalLedger.snapshot.{mortgage,other_debts}",
      }),
    },
    {
      objective: "bestLiquidityAdjusted",
      label: "Best Liquidity-Adjusted",
      path: liqAdj.best,
      score: liqAdj.score,
      audit: defaultAudit({
        howCalculated: "max(netWorthP50 / liquidityPosition)",
        constraintSource: "truePortfolioOptimizer.scenarios[*].metrics.liquidityPosition",
      }),
    },
  ];

  return { best: hybrid.best, alternatives: alts };
}

/* ─── Step 6: Action Plan ───────────────────────────────────────────── */

function buildActionPlan(
  best: PathCandidate | null,
  sprint7: TruePortfolioOptimizerResult,
  sprint9: PathSimulationResult,
  planInput: FireMCPlanInput | null | undefined,
): ActionPlanEntry[] {
  if (!best) return [];
  const sr = sprint7.scenarios.find((s) => s.id === best.strategyId);
  if (!sr) return [];
  const p9 = pathStrategyOf(sprint9, best.strategyId);
  const entries: ActionPlanEntry[] = [];

  // (a) Property purchase year, when the strategy includes one.
  if (sr.dimensions.property === "buy-investment-property" && sr.dimensions.propertyYear != null) {
    entries.push({
      year: sr.dimensions.propertyYear,
      action: `Acquire investment property #1 (strategy "${sr.label}")`,
      sourceStrategyId: sr.id,
      inputField: "scenarios.dimensions.propertyYear",
      enginesUsed: ["truePortfolioOptimizer (Sprint 7)"],
      inputsUsed: [`sprint7Result.scenarios[id=${sr.id}].dimensions.propertyYear`],
      auditNote: "Year read directly from Sprint 7 scenario dimensions — not invented",
    });
  } else if (sr.dimensions.property === "delay-purchase" && sr.dimensions.propertyYear != null) {
    entries.push({
      year: sr.dimensions.propertyYear,
      action: `Delay investment property purchase to ${sr.dimensions.propertyYear}`,
      sourceStrategyId: sr.id,
      inputField: "scenarios.dimensions.propertyYear",
      enginesUsed: ["truePortfolioOptimizer (Sprint 7)"],
      inputsUsed: [`sprint7Result.scenarios[id=${sr.id}].dimensions.propertyYear`],
      auditNote: "Year read from Sprint 7 scenario dimensions",
    });
  }

  // (b) Required monthly DCA — emitted as a "from now" action.
  const dca = strategyRequiredMonthlyContribution(sr);
  if (finite(dca) && dca > 0) {
    const today = new Date();
    entries.push({
      year: today.getFullYear(),
      action: `Set monthly contribution to $${Math.round(dca).toLocaleString()}/mo`,
      sourceStrategyId: sr.id,
      inputField: "scenarios.metrics.requiredMonthlyContribution",
      enginesUsed: ["truePortfolioOptimizer (Sprint 7)"],
      inputsUsed: [`sprint7Result.scenarios[id=${sr.id}].metrics.requiredMonthlyContribution`],
      auditNote: "Required DCA read from Sprint 7 scenario metrics",
    });
  }

  // (c) Year-by-year net-worth milestones (P50) from Sprint 9 fan.
  if (p9 && p9.netWorthFan.length > 0) {
    const fan = p9.netWorthFan;
    const todayYear = fan[0].year;
    // Emit one entry every ~5 years across the fan to keep the timeline tight.
    for (let i = 4; i < fan.length; i += 5) {
      const yb = fan[i];
      if (!finite(yb.p50)) continue;
      entries.push({
        year: yb.year,
        action: `Median net worth checkpoint: $${Math.round(yb.p50 as number).toLocaleString()}`,
        sourceStrategyId: sr.id,
        inputField: "pathSim.netWorthFan",
        enginesUsed: ["pathSimulationEngine (Sprint 9)"],
        inputsUsed: [`sprint9Result.strategies[scenarioId=${sr.id}].netWorthFan[year=${yb.year}].p50`],
        auditNote: "Year-by-year P50 checkpoint — direct read of Sprint 9 fan",
      });
    }

    // FIRE year milestone (median).
    if (finite(p9.fireYearBand.p50)) {
      entries.push({
        year: p9.fireYearBand.p50 as number,
        action: `Projected FIRE year (median): ${p9.fireYearBand.p50}`,
        sourceStrategyId: sr.id,
        inputField: "pathSim.fireYearBand.p50",
        enginesUsed: ["pathSimulationEngine (Sprint 9)"],
        inputsUsed: [`sprint9Result.strategies[scenarioId=${sr.id}].fireYearBand.p50`],
        auditNote: "Median FIRE year read from Sprint 9",
      });
    }
  }

  // (d) Planned orders / DCA changes from planInput, if supplied.
  if (planInput) {
    for (const dcaItem of planInput.stockDCASchedules ?? []) {
      const startStr = (dcaItem as any).start_date ?? (dcaItem as any).startDate ?? null;
      if (startStr) {
        const y = parseInt(String(startStr).slice(0, 4), 10);
        if (Number.isFinite(y)) {
          entries.push({
            year: y,
            action: `Stock DCA scheduled to begin`,
            sourceStrategyId: sr.id,
            inputField: "planInput.stockDCASchedules",
            enginesUsed: ["fireMonteCarlo planInput"],
            inputsUsed: ["planInput.stockDCASchedules"],
            auditNote: "Date read directly from planInput — not invented",
          });
        }
      }
    }
  }

  // Sort ascending by year for clean timeline.
  entries.sort((a, b) => a.year - b.year);
  return entries;
}

/* ─── Audit Trail ───────────────────────────────────────────────────── */

function buildAuditTrail(
  feasibility: FeasibilitySection,
  gap: GapSection,
  required: RequiredInputsSection,
  constraints: ConstraintsSection,
  blockers: BlockerEntry[],
  alternatives: OptimizationResult[],
  bestPath: PathCandidate | null,
  actionPlan: ActionPlanEntry[],
): AuditEntry[] {
  const baseProb = "pathSimulationEngine.bestStrategy.probabilityFireByTarget";
  const basePath = "pathSimulationEngine.bestStrategy.netWorthFan";
  const baseConstraint = "user targets + truePortfolioOptimizer.scenarios";
  const baseConf = "pathSimulationEngine.bestStrategy.robustScore";

  const entries: AuditEntry[] = [];

  entries.push({
    id: "feasibility",
    label: "Goal Feasibility",
    enginesUsed: feasibility.audit.enginesUsed,
    inputsUsed: feasibility.audit.inputsUsed,
    assumptionsUsed: feasibility.audit.assumptionsUsed,
    probabilitySource: feasibility.audit.probabilitySource,
    pathSource: feasibility.audit.pathSource,
    constraintSource: feasibility.audit.constraintSource,
    confidenceSource: feasibility.audit.confidenceSource,
    howCalculated: feasibility.audit.howCalculated,
  });

  entries.push({
    id: "gap-analysis",
    label: "Gap Analysis",
    enginesUsed: gap.audit.enginesUsed,
    inputsUsed: gap.audit.inputsUsed,
    assumptionsUsed: gap.audit.assumptionsUsed,
    probabilitySource: gap.audit.probabilitySource,
    pathSource: gap.audit.pathSource,
    constraintSource: gap.audit.constraintSource,
    confidenceSource: gap.audit.confidenceSource,
    howCalculated: gap.audit.howCalculated,
  });

  entries.push({
    id: "required-inputs",
    label: "Reverse-Engineered Required Inputs",
    enginesUsed: required.audit.enginesUsed,
    inputsUsed: required.audit.inputsUsed,
    assumptionsUsed: required.audit.assumptionsUsed,
    probabilitySource: required.audit.probabilitySource,
    pathSource: required.audit.pathSource,
    constraintSource: required.audit.constraintSource,
    confidenceSource: required.audit.confidenceSource,
    howCalculated: required.audit.howCalculated,
  });

  entries.push({
    id: "constraints",
    label: "Constraint Solver",
    enginesUsed: constraints.audit.enginesUsed,
    inputsUsed: constraints.audit.inputsUsed,
    assumptionsUsed: constraints.audit.assumptionsUsed,
    probabilitySource: constraints.audit.probabilitySource,
    pathSource: constraints.audit.pathSource,
    constraintSource: constraints.audit.constraintSource,
    confidenceSource: constraints.audit.confidenceSource,
    howCalculated: constraints.audit.howCalculated,
  });

  for (const alt of alternatives) {
    entries.push({
      id: `objective-${alt.objective}`,
      label: `Objective: ${alt.label}`,
      enginesUsed: alt.audit.enginesUsed,
      inputsUsed: alt.audit.inputsUsed,
      assumptionsUsed: alt.audit.assumptionsUsed,
      probabilitySource: alt.audit.probabilitySource,
      pathSource: alt.audit.pathSource,
      constraintSource: alt.audit.constraintSource,
      confidenceSource: alt.audit.confidenceSource,
      howCalculated: alt.audit.howCalculated,
    });
  }

  if (bestPath) {
    entries.push({
      id: "best-path",
      label: `Best Path: ${bestPath.label}`,
      enginesUsed: bestPath.audit.enginesUsed,
      inputsUsed: bestPath.audit.inputsUsed,
      assumptionsUsed: bestPath.audit.assumptionsUsed,
      probabilitySource: bestPath.audit.probabilitySource,
      pathSource: bestPath.audit.pathSource,
      constraintSource: bestPath.audit.constraintSource,
      confidenceSource: bestPath.audit.confidenceSource,
      howCalculated: bestPath.audit.howCalculated,
    });
  }

  if (actionPlan.length > 0) {
    entries.push({
      id: "action-plan",
      label: "Action Plan",
      enginesUsed: ["truePortfolioOptimizer (Sprint 7)", "pathSimulationEngine (Sprint 9)"],
      inputsUsed: [
        "sprint7Result.scenarios[best].dimensions",
        "sprint7Result.scenarios[best].metrics.requiredMonthlyContribution",
        "sprint9Result.bestStrategy.netWorthFan",
      ],
      assumptionsUsed: ["Years read directly from Sprint 7/9 — never invented"],
      probabilitySource: baseProb,
      pathSource: basePath,
      constraintSource: baseConstraint,
      confidenceSource: baseConf,
      howCalculated: `Action plan synthesised from best path "${bestPath?.label ?? "n/a"}" — every entry traces to a Sprint 7 dimension or Sprint 9 fan year`,
    });
  }

  if (blockers.length > 0) {
    entries.push({
      id: "blockers",
      label: "Constraint Blockers",
      enginesUsed: ["truePortfolioOptimizer (Sprint 7)"],
      inputsUsed: ["sprint7Result.scenarios[*]"],
      assumptionsUsed: ["A blocker = a constraint that eliminated ≥1 strategy"],
      probabilitySource: baseProb,
      pathSource: basePath,
      constraintSource: baseConstraint,
      confidenceSource: baseConf,
      howCalculated: `${blockers.length} blocker(s) recorded`,
    });
  }

  return entries;
}

/* ─── Main entry point ──────────────────────────────────────────────── */

export function buildGoalSolverPro(inputs: GoalSolverProInputs): GoalSolverProResult {
  const seed = inputs.seed ?? DEFAULT_GOAL_SOLVER_SEED;
  const targets = inputs.targets ?? {};
  const sprint7 = inputs.sprint7Result;
  const sprint9 = inputs.sprint9Result;
  const canonicalFire = inputs.canonicalFire;

  // Detect empty inputs early.
  const noTargets = Object.values(targets).every(
    (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)),
  );
  const emptySprint9 =
    sprint9.empty === true || sprint9.strategies.length === 0 || sprint9.bestStrategy == null;

  if (emptySprint9 && noTargets) {
    return {
      empty: true,
      emptyReason: "No Sprint 9 result and no targets supplied",
      engineVersion: PATH_GOAL_SOLVER_VERSION,
      seed,
      targets,
      feasibility: {
        status: "ACHIEVABLE",
        probabilityOfSuccess: null,
        medianFireYear: null,
        bestCaseFireYear: null,
        worstCaseFireYear: null,
        expectedFireYear: null,
        audit: defaultAudit({
          howCalculated: "Empty Sprint 9 + empty targets ⇒ trivially ACHIEVABLE (no requirements)",
        }),
      },
      gap: {
        entries: [],
        incomplete: true,
        blockers: [],
        audit: defaultAudit({
          howCalculated: "Empty Sprint 9 + empty targets ⇒ empty gap section",
        }),
      },
      requiredInputs: {
        requiredMonthlyDCA: null,
        requiredAdditionalCapital: null,
        requiredAdditionalProperties: null,
        requiredSavingsRate: null,
        requiredFireNumber: canonicalFire.fireNumber || null,
        sourceStrategyId: null,
        sourceStrategyLabel: null,
        audit: defaultAudit({
          howCalculated: "Empty Sprint 9 + empty targets ⇒ no reverse engineering performed",
        }),
      },
      constraints: {
        checks: [],
        passed: 0,
        failed: 0,
        candidatesEvaluated: 0,
        candidatesPassing: 0,
        audit: defaultAudit({ howCalculated: "Empty Sprint 9 + empty targets" }),
      },
      blockers: [],
      bestPath: null,
      alternativePaths: [],
      actionPlan: [],
      auditTrail: [],
    };
  }

  // 4. Constraint solver first — knows what passes.
  const constraintResult = buildConstraints(sprint7, sprint9, inputs.canonicalLedger, targets);

  const hardViolation =
    constraintResult.section.candidatesEvaluated > 0 &&
    constraintResult.section.candidatesPassing === 0;

  // 1. Feasibility
  const feasibility = buildFeasibility(sprint9, targets, hardViolation);

  // 2. Gap analysis
  const gap = buildGap(sprint9, sprint7, inputs.canonicalLedger, targets);
  // Add debt blocker bubbled from gap analysis to the blockers list (dedup).
  for (const b of gap.blockers) {
    if (b === "debt" && !constraintResult.blockers.some((x) => x.constraint === "Max Debt")) {
      constraintResult.blockers.push({
        constraint: "Max Debt",
        reason: "Current household debt exceeds the supplied debt ceiling",
        strategiesEliminated: [],
        audit: defaultAudit({
          howCalculated: "canonicalLedger debt > targetDebtCeiling",
          constraintSource: "canonicalLedger.snapshot.{mortgage,other_debts}",
        }),
      });
    }
  }

  // 3. Required inputs (reverse engineering)
  const required = buildRequiredInputs(
    sprint7,
    sprint9,
    canonicalFire,
    inputs.canonicalLedger,
    targets,
  );

  // 5. Optimization search across passing candidates
  const passingCandidates: PathCandidate[] = constraintResult.passingStrategies.map((s) =>
    toCandidate(s, pathStrategyOf(sprint9, s.id)),
  );
  // If no constraints were supplied (no candidates filtered), fall back to all
  // Sprint 7 ranked strategies for the optimization search.
  const candidatePool: PathCandidate[] =
    passingCandidates.length > 0
      ? passingCandidates
      : sprint7.scenarios
          .filter((s) => s.valid)
          .map((s) => toCandidate(s, pathStrategyOf(sprint9, s.id)));

  const opt = optimizationSearch(candidatePool, sprint7, inputs.canonicalLedger);
  let bestPath = opt.best;
  // If hybrid found nothing, fall back to highestProbability, then to the
  // first candidate in the pool.
  if (!bestPath) {
    bestPath = opt.alternatives.find((a) => a.path)?.path ?? candidatePool[0] ?? null;
  }

  // 6. Action plan
  const actionPlan = buildActionPlan(bestPath, sprint7, sprint9, inputs.planInput ?? null);

  // 7. Audit trail
  const auditTrail = buildAuditTrail(
    feasibility,
    gap,
    required,
    constraintResult.section,
    constraintResult.blockers,
    opt.alternatives,
    bestPath,
    actionPlan,
  );

  return {
    empty: false,
    engineVersion: PATH_GOAL_SOLVER_VERSION,
    seed,
    targets,
    feasibility,
    gap,
    requiredInputs: required,
    constraints: constraintResult.section,
    blockers: constraintResult.blockers,
    bestPath,
    alternativePaths: opt.alternatives,
    actionPlan,
    auditTrail,
  };
}

/* ─── Formatters (for UI / tests) ───────────────────────────────────── */

export function formatGoalSolverProbability(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

export function formatGoalSolverDollars(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

export function formatGoalSolverYear(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}`;
}
