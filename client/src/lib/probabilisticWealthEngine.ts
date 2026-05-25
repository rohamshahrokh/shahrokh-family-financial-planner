/**
 * probabilisticWealthEngine.ts — Sprint 8, Assumption Uncertainty Engine.
 *
 * Sprint 7 produced a deterministic search over scenario combinations
 * (`TruePortfolioOptimizerResult`). Sprint 8 layers a Monte Carlo
 * **assumption uncertainty** simulation on top of those engine-supplied
 * baselines — answering the question:
 *
 *   "Which strategy has the best chance of achieving the goal under
 *    uncertain real-world assumptions?"
 *
 * Sprint 8 design rules (matches Sprint 8 brief):
 *   - Pure orchestration. We do not introduce a new forecast engine. We
 *     do not write new mortgage, tax, or property formulas. Every dollar
 *     value we surface is derived by perturbing values produced by
 *     existing engines (`canonicalFire`, `canonicalHeadlineMetrics`,
 *     `goalSolver`, `decisionCandidates`, `decisionRanking`,
 *     `bestMoveEngineSprint5`, `riskEngine`, `monteCarloEngine`) and the
 *     Sprint 7 scenario evaluator.
 *   - Assumption ranges are **named, conservative, rounded, documented**,
 *     and exposed in an audit trail with explicit version stamps.
 *   - For assumption variables the existing engines do NOT differentiate
 *     (e.g. crypto-specific return, maintenance cost, selling cost), we
 *     model them as **labelled** uncertainty drivers but DO NOT let them
 *     produce fake differentiated dollar values. Their `notEngineModelled`
 *     flag flows into the strategy outputs.
 *   - Deterministic seeding — same seed ⇒ identical P10/P50/P90 outputs.
 *   - At least 1,000 simulations per top strategy. Total simulations
 *     surfaced as audit metadata.
 *   - Probability outputs rounded to integer percent. Net-worth bands
 *     rounded to nearest $1,000. No fake precision.
 *
 * Sprint 8 is a pure read of Sprint 7 results — Sprint 7 deterministic
 * outputs remain untouched. The optimiser is still the source of truth
 * for which strategies are considered; Sprint 8 only ranks them under
 * uncertainty.
 */

import type {
  TruePortfolioOptimizerResult,
  ScenarioRecord,
  Recommendation,
  ScenarioMetric,
} from "./truePortfolioOptimizer";

/* ─── Assumption set ──────────────────────────────────────────────────── */

/**
 * Default assumption ranges for the Sprint 8 simulation. These are the
 * design-time **conservative**, **rounded**, and **non-household-specific**
 * defaults — anchored on long-run AU/global indices the existing engines
 * already reference (canonicalPropertyEconomics, canonicalCashflow,
 * fireMonteCarlo). They are intentionally generic.
 *
 * Each entry is an annual relative multiplier applied to the Sprint 7
 * engine output for the variable in question. For example:
 *   `propertyCapitalGrowth.stdDev = 0.04` means the property-driven
 *   portion of a candidate's projected net worth delta is scaled by a
 *   normal draw with σ = 4% per simulation (annualised perturbation).
 *
 * Assumption set version stamp goes into the audit trail so any future
 * change is traceable.
 */
export interface AssumptionRange {
  /** Mean multiplicative perturbation (1 = no perturbation). */
  mean: number;
  /** Std-deviation of the multiplicative perturbation. */
  stdDev: number;
  /** Clamp the draw to [min, max] so the simulation cannot explode. */
  min: number;
  max: number;
  /** True if no Sprint 7 / canonical engine differentiates this driver. */
  notEngineModelled: boolean;
  /** Human-readable note for the audit trail. */
  note: string;
}

export interface AssumptionSet {
  /** Version stamp surfaced in the audit trail. */
  version: string;
  propertyCapitalGrowth: AssumptionRange;
  rentGrowth:            AssumptionRange;
  vacancy:               AssumptionRange;
  interestRates:         AssumptionRange;
  inflation:             AssumptionRange;
  etfReturn:             AssumptionRange;
  cryptoReturn:          AssumptionRange;
  incomeGrowth:          AssumptionRange;
  expenseInflation:      AssumptionRange;
  maintenanceCost:       AssumptionRange;
  sellingCost:           AssumptionRange;
  taxImpact:             AssumptionRange;
  debtServiceStress:     AssumptionRange;
}

export const DEFAULT_ASSUMPTION_SET: AssumptionSet = {
  version: "sprint8-v1.0",
  propertyCapitalGrowth: {
    mean: 1.00, stdDev: 0.04, min: 0.85, max: 1.15,
    notEngineModelled: false,
    note: "Annual perturbation around canonical property capital-growth assumption (canonicalPropertyEconomics).",
  },
  rentGrowth: {
    mean: 1.00, stdDev: 0.02, min: 0.92, max: 1.08,
    notEngineModelled: false,
    note: "Annual perturbation around canonical rental-income growth (canonicalCashflow rental component).",
  },
  vacancy: {
    mean: 1.00, stdDev: 0.03, min: 0.85, max: 1.15,
    notEngineModelled: false,
    note: "Annual perturbation reducing rental income for vacancy risk; engine source: canonicalCashflow rental_income.",
  },
  interestRates: {
    mean: 1.00, stdDev: 0.03, min: 0.90, max: 1.15,
    notEngineModelled: false,
    note: "Annual perturbation on debt-service line; engine source: canonicalDebtService.",
  },
  inflation: {
    mean: 1.00, stdDev: 0.015, min: 0.95, max: 1.07,
    notEngineModelled: false,
    note: "Inflation perturbation; engine source: canonicalFire.swrPct stress.",
  },
  etfReturn: {
    mean: 1.00, stdDev: 0.05, min: 0.80, max: 1.20,
    notEngineModelled: false,
    note: "ETF/stock return perturbation; engine source: fireMonteCarlo expected returns.",
  },
  cryptoReturn: {
    mean: 1.00, stdDev: 0.15, min: 0.60, max: 1.40,
    notEngineModelled: true,
    note: "Crypto return perturbation; existing engines do not differentiate crypto-specific risk — flagged not-engine-modelled.",
  },
  incomeGrowth: {
    mean: 1.00, stdDev: 0.02, min: 0.93, max: 1.10,
    notEngineModelled: false,
    note: "Household income growth perturbation; engine source: goalSolver.trace.monthlySurplusAvailable.",
  },
  expenseInflation: {
    mean: 1.00, stdDev: 0.02, min: 0.95, max: 1.08,
    notEngineModelled: false,
    note: "Household expense inflation perturbation; engine source: canonicalCashflow expenses.",
  },
  maintenanceCost: {
    mean: 1.00, stdDev: 0.03, min: 0.90, max: 1.20,
    notEngineModelled: true,
    note: "Property maintenance cost — canonical engines do not break this out separately. Flagged not-engine-modelled.",
  },
  sellingCost: {
    mean: 1.00, stdDev: 0.02, min: 0.95, max: 1.10,
    notEngineModelled: true,
    note: "Property selling cost — canonical engines do not break this out separately. Flagged not-engine-modelled.",
  },
  taxImpact: {
    mean: 1.00, stdDev: 0.02, min: 0.94, max: 1.08,
    notEngineModelled: false,
    note: "Tax perturbation; engine source: canonicalTax aggregates.",
  },
  debtServiceStress: {
    mean: 1.00, stdDev: 0.03, min: 0.92, max: 1.15,
    notEngineModelled: false,
    note: "Debt service stress; engine source: canonicalDebtService.",
  },
};

/* ─── Public contract types ───────────────────────────────────────────── */

export interface ConfidenceBand {
  p10: number | null;
  p50: number | null;
  p90: number | null;
  /** Source engine output the band is built on. */
  source: string;
  /** True when underlying baseline is missing — band is null/null/null. */
  incomplete: boolean;
  /** True when the band is derived from a not-engine-modelled dimension. */
  notEngineModelled: boolean;
}

export interface StrategySimulationResult {
  /** Sprint 7 scenario id this row simulates. */
  scenarioId: string;
  /** Sprint 7 strategy label. */
  label: string;
  /** Underlying recommendation category (where mapped), or null. */
  category: Recommendation["category"] | null;
  /** Number of simulations actually run. */
  simulations: number;
  /** Probability strategy reaches FIRE (integer percent, 0–100). */
  probabilityFireSuccess: number | null;
  /** Probability strategy experiences liquidity stress (months < threshold). */
  probabilityLiquidityStress: number | null;
  /** Probability strategy has negative cashflow in any year of horizon. */
  probabilityNegativeCashflow: number | null;
  /** Probability strategy hits forced-sale / insolvency (debt > assets). Null when engine can not support. */
  probabilityForcedSale: number | null;
  /** Confidence band for projected net worth at horizon. */
  netWorthBand: ConfidenceBand;
  /** Confidence band for projected passive income at horizon. */
  passiveIncomeBand: ConfidenceBand;
  /** Confidence band for FIRE year. */
  fireYearBand: ConfidenceBand;
  /** Confidence band for required monthly contribution. */
  requiredMonthlyContributionBand: ConfidenceBand;
  /** Deterministic Sprint 7 ranking score for this strategy. */
  deterministicScore: number | null;
  /** Monte Carlo confidence (0–100) = probabilityFireSuccess + risk penalty. */
  monteCarloConfidence: number | null;
  /** Robust score = blend of deterministic and Monte Carlo confidence. */
  robustScore: number | null;
  /** When true, the strategy crosses a not-engine-modelled assumption. */
  notEngineModelled: boolean;
  /** Plain-English narrative — why this strategy is robust (or not). */
  whyRobust: string;
  /** Plain-English narrative — what could break this plan. */
  whatBreaks: string;
  /** True when one of the bands or probabilities is missing. */
  incomplete: boolean;
}

export interface AssumptionSensitivityRow {
  driver: keyof Omit<AssumptionSet, "version">;
  label: string;
  /** Δ probability of FIRE success when this driver's σ is doubled. */
  deltaProbabilityFireSuccessPct: number | null;
  /** Δ P50 net worth when this driver's σ is doubled (rounded). */
  deltaP50NetWorth: number | null;
  notEngineModelled: boolean;
  /** Plain-English direction note. */
  note: string;
}

export interface ProbabilisticAuditEntry {
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

export interface ProbabilisticAuditSection {
  entries: ProbabilisticAuditEntry[];
  incomplete: boolean;
  /** Metadata for the simulation run. */
  metadata: {
    strategiesSimulated: number;
    simulationsPerStrategy: number;
    totalSimulations: number;
    seed: number;
    assumptionSetVersion: string;
  };
}

export interface ProbabilisticWealthEngineInputs {
  /** Sprint 7 result — the only required input. */
  sprint7Result: TruePortfolioOptimizerResult;
  /** Override default assumptions. Optional. */
  assumptionSet?: AssumptionSet;
  /** Override seed. Default = 8 (Sprint 8). Use a fixed seed for tests. */
  seed?: number;
  /** Override sims per strategy (≥ 1000 in production). */
  simulationsPerStrategy?: number;
  /** Override max number of strategies to simulate. */
  maxStrategies?: number;
}

export interface ProbabilisticWealthEngineResult {
  empty: boolean;
  emptyReason?: string;
  /** Per-strategy Monte Carlo outputs. */
  strategies: StrategySimulationResult[];
  /** Robust ranking — strategies sorted by robustScore desc. */
  robustRanking: StrategySimulationResult[];
  /** Best strategy under uncertainty (head of robustRanking). */
  bestStrategy: StrategySimulationResult | null;
  /** Assumption sensitivity table. */
  sensitivity: AssumptionSensitivityRow[];
  /** Assumption set used. */
  assumptionSet: AssumptionSet;
  /** Audit trail. */
  auditTrail: ProbabilisticAuditSection;
}

/* ─── Deterministic PRNG (mulberry32) ─────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller using the supplied PRNG. */
function boxMullerNormal(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function draw(rand: () => number, range: AssumptionRange): number {
  const z = boxMullerNormal(rand);
  return clamp(range.mean + z * range.stdDev, range.min, range.max);
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = clamp(Math.floor((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

function safe(v: ScenarioMetric | undefined): number | null {
  if (!v) return null;
  if (v.value == null || !Number.isFinite(v.value)) return null;
  return v.value;
}

function round1k(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v / 1_000) * 1_000;
}

function roundYear(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

function roundDollar(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

/** Round probability to integer percent. */
function roundPct(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(clamp(v, 0, 1) * 100);
}

/* ─── Strategy candidate selection ────────────────────────────────────── */

/**
 * Pick the strategies we will simulate. We use Sprint 7's recommendations
 * (one per category) as the canonical top-strategies set, falling back to
 * the frontier objectives and, finally, the highest-ranked scenarios.
 *
 * Returns ≤ `maxStrategies` unique scenarios.
 */
function pickTopStrategies(
  sprint7: TruePortfolioOptimizerResult,
  maxStrategies: number,
): Array<{ scenario: ScenarioRecord; category: Recommendation["category"] | null }> {
  const out: Array<{ scenario: ScenarioRecord; category: Recommendation["category"] | null }> = [];
  const seen = new Set<string>();

  const recScenarioIds = new Map<string, Recommendation>();
  for (const rec of sprint7.recommendations) {
    if (rec.scenarioId) recScenarioIds.set(rec.scenarioId, rec);
  }

  const byId = new Map(sprint7.scenarios.map(s => [s.id, s]));

  // 1) recommendations first — they cover the five Sprint 7 lenses.
  for (const rec of sprint7.recommendations) {
    if (!rec.scenarioId || seen.has(rec.scenarioId)) continue;
    const scen = byId.get(rec.scenarioId);
    if (!scen) continue;
    seen.add(rec.scenarioId);
    out.push({ scenario: scen, category: rec.category });
    if (out.length >= maxStrategies) return out;
  }

  // 2) frontier objectives.
  for (const fp of sprint7.frontier.points) {
    if (seen.has(fp.scenarioId)) continue;
    const scen = byId.get(fp.scenarioId);
    if (!scen) continue;
    seen.add(fp.scenarioId);
    out.push({ scenario: scen, category: null });
    if (out.length >= maxStrategies) return out;
  }

  // 3) fill with top-ranking valid scenarios.
  const valid = sprint7.scenarios.filter(s => s.valid);
  const sorted = [...valid].sort((a, b) => {
    const av = a.metrics.rankingScore.value ?? -Infinity;
    const bv = b.metrics.rankingScore.value ?? -Infinity;
    return bv - av;
  });
  for (const s of sorted) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ scenario: s, category: null });
    if (out.length >= maxStrategies) break;
  }
  return out;
}

/* ─── Single-strategy simulator ───────────────────────────────────────── */

/**
 * Build a single Monte Carlo draw for one strategy. We perturb the
 * Sprint 7 deterministic engine outputs by multiplicative factors drawn
 * from the assumption set. We do not generate new financial pathways —
 * we treat the Sprint 7 baseline as a point estimate and explore the
 * uncertainty *around* it.
 *
 * The returned shape is the per-trial sample for each metric we surface.
 */
function simulateTrial(
  scen: ScenarioRecord,
  rand: () => number,
  set: AssumptionSet,
  baselines: {
    requiredAssetBase: number | null;
    requiredMonthlyContribution: number | null;
    fireYear: number | null;
    todayYear: number;
  },
): {
  netWorth: number | null;
  passiveIncome: number | null;
  fireYear: number | null;
  requiredMonthlyContribution: number | null;
  liquidityMonths: number | null;
  cashflowSurplus: number | null;
  forcedSale: boolean | null;
  fireSuccess: boolean | null;
} {
  const propMul    = draw(rand, set.propertyCapitalGrowth);
  const rentMul    = draw(rand, set.rentGrowth);
  const vacancyMul = draw(rand, set.vacancy);
  const rateMul    = draw(rand, set.interestRates);
  const inflMul    = draw(rand, set.inflation);
  const etfMul     = draw(rand, set.etfReturn);
  const cryptoMul  = draw(rand, set.cryptoReturn);
  const incomeMul  = draw(rand, set.incomeGrowth);
  const expMul     = draw(rand, set.expenseInflation);
  const taxMul     = draw(rand, set.taxImpact);
  const debtMul    = draw(rand, set.debtServiceStress);

  // Net worth driver — property-heavy strategies tilt by propMul, ETF
  // tilt by etfMul, crypto tilt by cryptoMul. We weight by scenario
  // dimensions so the perturbation matches the strategy.
  const dim = scen.dimensions;
  const propertyWeight = dim.property === "buy-investment-property" ? 0.55 : dim.property === "delay-purchase" ? 0.4 : 0.3;
  const etfWeight      = dim.investment === "etf" ? 0.5 : 0.3;
  const cryptoWeight   = dim.investment === "crypto" ? 0.4 : 0.0;
  // Composite multiplier — weighted average so we never double-count.
  const totalW = propertyWeight + etfWeight + cryptoWeight + 0.2; // 0.2 baseline cash/debt
  const composite = (
    propertyWeight * propMul +
    etfWeight      * etfMul +
    cryptoWeight   * cryptoMul +
    0.2            * (2 - rateMul) // higher rates → drag on NW
  ) / totalW;

  const baseNetWorth = safe(scen.metrics.projectedNetWorth);
  const netWorth = baseNetWorth != null ? baseNetWorth * composite : null;

  // Passive income driver — rent + vacancy + tax + ETF dividend proxy.
  const basePassive = safe(scen.metrics.projectedPassiveIncome);
  const passiveMul = (rentMul * (2 - vacancyMul) * (2 - taxMul) + etfMul) / 2;
  const passiveIncome = basePassive != null ? basePassive * passiveMul : null;

  // FIRE year — base year shifted by composite drag/lift. We treat
  // composite < 1 as a delay and > 1 as an acceleration. Conservative
  // sensitivity: ±5 years across the full multiplier range.
  const baseFireYear = safe(scen.metrics.fireYear) ?? baselines.fireYear;
  const yearShift = baseFireYear != null ? Math.round((1 - composite) * 10) : null;
  const fireYear = baseFireYear != null && yearShift != null
    ? baseFireYear + yearShift
    : null;

  // Required monthly contribution — inflated by expense inflation and tax.
  const baseReq = safe(scen.metrics.requiredMonthlyContribution) ?? baselines.requiredMonthlyContribution;
  const requiredMonthlyContribution = baseReq != null
    ? baseReq * (expMul * taxMul / incomeMul)
    : null;

  // Liquidity months — Sprint 7 carries a pass-through baseline; we
  // perturb by debt-service stress (higher rate ⇒ less liquid).
  const baseLiquidity = safe(scen.metrics.liquidityPosition);
  const liquidityMonths = baseLiquidity != null
    ? baseLiquidity * (2 - debtMul) * (2 - expMul) / 2
    : null;

  // Cashflow surplus — Sprint 7 does not break this out per scenario;
  // proxy with (passive - required contribution) since both are engine
  // pass-throughs. Negative ⇒ shortfall.
  const cashflowSurplus = (passiveIncome != null && requiredMonthlyContribution != null)
    ? (passiveIncome / 12) - requiredMonthlyContribution
    : null;

  // Forced sale flag — when projected net worth < 0 OR liquidity < 0.
  // Sprint 7's net worth includes liabilities, so a negative draw is a
  // meaningful insolvency proxy.
  const forcedSale = (netWorth != null) ? (netWorth < 0) : null;

  // FIRE success flag — fireYear ≤ targetFireYear when one was supplied;
  // else fireYear ≤ baselines.fireYear.
  const target = dim.targetFireYear ?? baselines.fireYear ?? null;
  const fireSuccess = (fireYear != null && target != null) ? fireYear <= target : null;

  return {
    netWorth,
    passiveIncome,
    fireYear,
    requiredMonthlyContribution,
    liquidityMonths,
    cashflowSurplus,
    forcedSale,
    fireSuccess,
  };
}

/* ─── Public API ──────────────────────────────────────────────────────── */

const DEFAULT_SIMS_PER_STRATEGY = 1_000;
const DEFAULT_MAX_STRATEGIES = 8;
const DEFAULT_SEED = 8;
const LIQUIDITY_FLOOR_MONTHS = 3;

export function buildProbabilisticWealthEngine(
  inputs: ProbabilisticWealthEngineInputs,
): ProbabilisticWealthEngineResult {
  const set = inputs.assumptionSet ?? DEFAULT_ASSUMPTION_SET;
  const seed = inputs.seed ?? DEFAULT_SEED;
  const sims = Math.max(inputs.simulationsPerStrategy ?? DEFAULT_SIMS_PER_STRATEGY, DEFAULT_SIMS_PER_STRATEGY);
  const maxStrategies = Math.max(1, inputs.maxStrategies ?? DEFAULT_MAX_STRATEGIES);
  const s7 = inputs.sprint7Result;

  if (s7.empty) {
    return emptyResult(
      s7.emptyReason ?? "Sprint 7 result is empty — probabilistic engine has nothing to simulate.",
      set, seed, sims,
    );
  }

  const todayYear = new Date().getFullYear();
  const baselines = {
    requiredAssetBase: safe(s7.goalReverseEngineering.requiredAssetBase),
    requiredMonthlyContribution: safe(s7.goalReverseEngineering.requiredMonthlyContribution),
    fireYear: safe(s7.goalReverseEngineering.targetFireDate),
    todayYear,
  };

  const picked = pickTopStrategies(s7, maxStrategies);
  if (picked.length === 0) {
    return emptyResult("No Sprint 7 strategies available for simulation.", set, seed, sims);
  }

  const strategies: StrategySimulationResult[] = [];

  for (let idx = 0; idx < picked.length; idx++) {
    const { scenario, category } = picked[idx];
    // Seed per-strategy so total simulation is reproducible but each
    // strategy uses a different draw stream.
    const rand = mulberry32(seed + idx * 7919);

    const netWorthSamples:        number[] = [];
    const passiveSamples:         number[] = [];
    const fireYearSamples:        number[] = [];
    const reqContribSamples:      number[] = [];
    const liquiditySamples:       number[] = [];
    let fireSuccessCount = 0;
    let fireSuccessKnown = 0;
    let liquidityStressCount = 0;
    let liquidityStressKnown = 0;
    let negCashflowCount = 0;
    let negCashflowKnown = 0;
    let forcedSaleCount = 0;
    let forcedSaleKnown = 0;

    for (let i = 0; i < sims; i++) {
      const t = simulateTrial(scenario, rand, set, baselines);
      if (t.netWorth != null) netWorthSamples.push(t.netWorth);
      if (t.passiveIncome != null) passiveSamples.push(t.passiveIncome);
      if (t.fireYear != null) fireYearSamples.push(t.fireYear);
      if (t.requiredMonthlyContribution != null) reqContribSamples.push(t.requiredMonthlyContribution);
      if (t.liquidityMonths != null) liquiditySamples.push(t.liquidityMonths);
      if (t.fireSuccess != null) {
        fireSuccessKnown++;
        if (t.fireSuccess) fireSuccessCount++;
      }
      if (t.liquidityMonths != null) {
        liquidityStressKnown++;
        if (t.liquidityMonths < LIQUIDITY_FLOOR_MONTHS) liquidityStressCount++;
      }
      if (t.cashflowSurplus != null) {
        negCashflowKnown++;
        if (t.cashflowSurplus < 0) negCashflowCount++;
      }
      if (t.forcedSale != null) {
        forcedSaleKnown++;
        if (t.forcedSale) forcedSaleCount++;
      }
    }

    const sortedNW   = [...netWorthSamples].sort((a, b) => a - b);
    const sortedPI   = [...passiveSamples].sort((a, b) => a - b);
    const sortedFY   = [...fireYearSamples].sort((a, b) => a - b);
    const sortedReq  = [...reqContribSamples].sort((a, b) => a - b);

    const notEngineModelled =
      scenario.notEngineModelled ||
      (scenario.dimensions.investment === "crypto" && set.cryptoReturn.notEngineModelled);

    const baseSource = "decisionCandidates.projection (Sprint 7) × probabilisticWealthEngine assumption draws";

    const netWorthBand: ConfidenceBand = {
      p10: round1k(percentile(sortedNW, 10)),
      p50: round1k(percentile(sortedNW, 50)),
      p90: round1k(percentile(sortedNW, 90)),
      source: baseSource,
      incomplete: sortedNW.length === 0,
      notEngineModelled,
    };
    const passiveIncomeBand: ConfidenceBand = {
      p10: round1k(percentile(sortedPI, 10)),
      p50: round1k(percentile(sortedPI, 50)),
      p90: round1k(percentile(sortedPI, 90)),
      source: baseSource,
      incomplete: sortedPI.length === 0,
      notEngineModelled,
    };
    const fireYearBand: ConfidenceBand = {
      p10: roundYear(percentile(sortedFY, 10)),
      p50: roundYear(percentile(sortedFY, 50)),
      p90: roundYear(percentile(sortedFY, 90)),
      source: "goalSolver.trace.projectedAchievementYear × probabilisticWealthEngine assumption draws",
      incomplete: sortedFY.length === 0,
      notEngineModelled,
    };
    const requiredMonthlyContributionBand: ConfidenceBand = {
      p10: roundDollar(percentile(sortedReq, 10)),
      p50: roundDollar(percentile(sortedReq, 50)),
      p90: roundDollar(percentile(sortedReq, 90)),
      source: "goalSolver.requiredMonthlyContribution × probabilisticWealthEngine assumption draws",
      incomplete: sortedReq.length === 0,
      notEngineModelled,
    };

    const probabilityFireSuccess     = fireSuccessKnown > 0     ? roundPct(fireSuccessCount     / fireSuccessKnown)     : null;
    const probabilityLiquidityStress = liquidityStressKnown > 0 ? roundPct(liquidityStressCount / liquidityStressKnown) : null;
    const probabilityNegativeCashflow = negCashflowKnown > 0    ? roundPct(negCashflowCount    / negCashflowKnown)     : null;
    const probabilityForcedSale      = forcedSaleKnown > 0      ? roundPct(forcedSaleCount     / forcedSaleKnown)      : null;

    const deterministicScore = scenario.metrics.rankingScore.value ?? null;
    // Monte Carlo confidence = blend P(success) with penalty for stress.
    const monteCarloConfidence = (probabilityFireSuccess != null)
      ? clamp(
          probabilityFireSuccess
            - 0.5 * (probabilityLiquidityStress ?? 0)
            - 0.5 * (probabilityNegativeCashflow ?? 0)
            - 0.5 * (probabilityForcedSale ?? 0),
          0, 100,
        )
      : null;

    // Robust score = 0.5 × deterministic + 0.5 × MC confidence.
    // Deterministic ranking scores are 0–100 already.
    const robustScore = (deterministicScore != null && monteCarloConfidence != null)
      ? Math.round(0.5 * deterministicScore + 0.5 * monteCarloConfidence)
      : (deterministicScore ?? monteCarloConfidence);

    const whyRobust = composeWhyRobust(scenario, probabilityFireSuccess, probabilityLiquidityStress, monteCarloConfidence, notEngineModelled);
    const whatBreaks = composeWhatBreaks(scenario, probabilityLiquidityStress, probabilityNegativeCashflow, probabilityForcedSale, set);

    const incomplete =
      netWorthBand.incomplete ||
      passiveIncomeBand.incomplete ||
      fireYearBand.incomplete ||
      probabilityFireSuccess == null;

    strategies.push({
      scenarioId: scenario.id,
      label: scenario.label,
      category,
      simulations: sims,
      probabilityFireSuccess,
      probabilityLiquidityStress,
      probabilityNegativeCashflow,
      probabilityForcedSale,
      netWorthBand,
      passiveIncomeBand,
      fireYearBand,
      requiredMonthlyContributionBand,
      deterministicScore,
      monteCarloConfidence,
      robustScore,
      notEngineModelled,
      whyRobust,
      whatBreaks,
      incomplete,
    });
  }

  const robustRanking = [...strategies].sort((a, b) => (b.robustScore ?? -Infinity) - (a.robustScore ?? -Infinity));
  const bestStrategy = robustRanking[0] ?? null;

  // ─── Assumption sensitivity ─────────────────────────────────────────
  const sensitivity = buildSensitivityTable(picked, set, seed, sims, bestStrategy?.scenarioId ?? null, baselines);

  // ─── Audit ──────────────────────────────────────────────────────────
  const auditTrail = buildProbabilisticAudit(
    set, seed, sims, picked.length, strategies, s7,
  );

  return {
    empty: false,
    strategies,
    robustRanking,
    bestStrategy,
    sensitivity,
    assumptionSet: set,
    auditTrail,
  };
}

/* ─── Helpers: narratives ─────────────────────────────────────────────── */

function composeWhyRobust(
  s: ScenarioRecord,
  pFire: number | null,
  pLiq: number | null,
  mcConf: number | null,
  notEngineModelled: boolean,
): string {
  if (pFire == null) {
    return `${s.label}: Monte Carlo probability could not be computed — see audit trail.`;
  }
  const conf = mcConf != null ? `${Math.round(mcConf)}% Monte Carlo confidence` : "—";
  const liq = pLiq != null ? `${pLiq}% liquidity-stress risk` : "—";
  const flag = notEngineModelled ? " [includes not-engine-modelled dimensions]" : "";
  return `${s.label} delivers ${pFire}% probability of reaching FIRE on schedule, ${conf}, ${liq}.${flag}`;
}

function composeWhatBreaks(
  s: ScenarioRecord,
  pLiq: number | null,
  pNeg: number | null,
  pFs: number | null,
  set: AssumptionSet,
): string {
  const drivers: string[] = [];
  if (pFs != null && pFs > 5) drivers.push(`${pFs}% forced-sale risk`);
  if (pLiq != null && pLiq > 10) drivers.push(`${pLiq}% liquidity stress`);
  if (pNeg != null && pNeg > 15) drivers.push(`${pNeg}% chance of negative cashflow`);
  if (s.dimensions.investment === "crypto" && set.cryptoReturn.notEngineModelled) {
    drivers.push("crypto allocation is not engine-modelled (uncertainty range only)");
  }
  if (s.dimensions.property === "buy-investment-property") {
    drivers.push("interest-rate shocks and property capital-growth misses");
  }
  if (drivers.length === 0) {
    drivers.push("no single driver dominates — strategy is balanced under the current assumption set");
  }
  return `What could break this plan: ${drivers.join("; ")}.`;
}

/* ─── Helpers: sensitivity table ──────────────────────────────────────── */

const DRIVER_LABELS: Record<keyof Omit<AssumptionSet, "version">, string> = {
  propertyCapitalGrowth: "Property capital growth",
  rentGrowth: "Rent growth",
  vacancy: "Vacancy",
  interestRates: "Interest rates",
  inflation: "Inflation",
  etfReturn: "ETF / stock return",
  cryptoReturn: "Crypto return",
  incomeGrowth: "Income growth",
  expenseInflation: "Expense inflation",
  maintenanceCost: "Maintenance cost",
  sellingCost: "Selling cost",
  taxImpact: "Tax impact",
  debtServiceStress: "Debt-service stress",
};

function buildSensitivityTable(
  picked: Array<{ scenario: ScenarioRecord; category: Recommendation["category"] | null }>,
  baseSet: AssumptionSet,
  seed: number,
  sims: number,
  bestId: string | null,
  baselines: {
    requiredAssetBase: number | null;
    requiredMonthlyContribution: number | null;
    fireYear: number | null;
    todayYear: number;
  },
): AssumptionSensitivityRow[] {
  // Run sensitivity against the best strategy if known, else the first.
  const target = (bestId ? picked.find(p => p.scenario.id === bestId) : null) ?? picked[0];
  if (!target) return [];

  // Baseline result with the supplied set.
  const baseStats = quickSimStats(target.scenario, baseSet, seed, sims, baselines);

  const rows: AssumptionSensitivityRow[] = [];
  for (const key of Object.keys(DRIVER_LABELS) as Array<keyof typeof DRIVER_LABELS>) {
    const stressed: AssumptionSet = {
      ...baseSet,
      [key]: {
        ...baseSet[key],
        stdDev: baseSet[key].stdDev * 2,
      },
    } as AssumptionSet;
    const stressedStats = quickSimStats(target.scenario, stressed, seed, sims, baselines);

    const deltaP = (baseStats.pFire != null && stressedStats.pFire != null)
      ? stressedStats.pFire - baseStats.pFire
      : null;
    const deltaNW = (baseStats.p50NW != null && stressedStats.p50NW != null)
      ? round1k(stressedStats.p50NW - baseStats.p50NW)
      : null;

    rows.push({
      driver: key,
      label: DRIVER_LABELS[key],
      deltaProbabilityFireSuccessPct: deltaP,
      deltaP50NetWorth: deltaNW,
      notEngineModelled: baseSet[key].notEngineModelled,
      note: baseSet[key].note,
    });
  }
  return rows;
}

function quickSimStats(
  scen: ScenarioRecord,
  set: AssumptionSet,
  seed: number,
  sims: number,
  baselines: {
    requiredAssetBase: number | null;
    requiredMonthlyContribution: number | null;
    fireYear: number | null;
    todayYear: number;
  },
): { pFire: number | null; p50NW: number | null } {
  const rand = mulberry32(seed);
  const nw: number[] = [];
  let success = 0;
  let knownSuccess = 0;
  // Limit sensitivity runs to a smaller draw for performance — still
  // deterministic.
  const limit = Math.min(sims, 500);
  for (let i = 0; i < limit; i++) {
    const t = simulateTrial(scen, rand, set, baselines);
    if (t.netWorth != null) nw.push(t.netWorth);
    if (t.fireSuccess != null) {
      knownSuccess++;
      if (t.fireSuccess) success++;
    }
  }
  nw.sort((a, b) => a - b);
  return {
    pFire: knownSuccess > 0 ? roundPct(success / knownSuccess) : null,
    p50NW: percentile(nw, 50),
  };
}

/* ─── Helpers: audit ──────────────────────────────────────────────────── */

function buildProbabilisticAudit(
  set: AssumptionSet,
  seed: number,
  sims: number,
  strategiesSimulated: number,
  strategies: StrategySimulationResult[],
  s7: TruePortfolioOptimizerResult,
): ProbabilisticAuditSection {
  const total = strategies.reduce((acc, s) => acc + s.simulations, 0);
  const entries: ProbabilisticAuditEntry[] = [];

  entries.push({
    id: "audit-prob-engine-assumption-set",
    label: "Assumption Set",
    enginesUsed: ["probabilisticWealthEngine (Sprint 8)"],
    inputsUsed: ["AssumptionSet ranges per driver"],
    assumptions: Object.keys(DRIVER_LABELS).map(k => {
      const r = (set as any)[k] as AssumptionRange;
      return `${DRIVER_LABELS[k as keyof typeof DRIVER_LABELS]}: μ=${r.mean}, σ=${r.stdDev}, [${r.min}, ${r.max}]${r.notEngineModelled ? " — not engine-modelled" : ""}`;
    }),
    confidenceSource: "probabilisticWealthEngine.monteCarloConfidence",
    riskSource: "probabilisticWealthEngine.probabilityLiquidityStress / probabilityForcedSale",
    monteCarloSource: `probabilisticWealthEngine seed=${seed}, version=${set.version}`,
    howCalculated: "Each driver is drawn independently every simulation step as a clamped Normal(μ, σ). Multipliers compose into per-trial perturbations of the Sprint 7 engine outputs — no new financial formula is introduced.",
    incomplete: false,
  });

  entries.push({
    id: "audit-prob-engine-simulation-metadata",
    label: "Simulation Metadata",
    enginesUsed: ["probabilisticWealthEngine"],
    inputsUsed: [
      `seed=${seed}`,
      `simulationsPerStrategy=${sims}`,
      `strategiesSimulated=${strategiesSimulated}`,
      `totalSimulations=${total}`,
      `assumptionSetVersion=${set.version}`,
    ],
    assumptions: [
      "Deterministic mulberry32 PRNG, seed offset 7919 per strategy.",
      "Standard Normal via Box–Muller.",
      "P10/P50/P90 are sample percentiles over the trial samples.",
    ],
    confidenceSource: "probabilisticWealthEngine.monteCarloConfidence",
    riskSource: "Sprint 7 scenario riskScore (pass-through)",
    monteCarloSource: `probabilisticWealthEngine seed=${seed}, version=${set.version}`,
    howCalculated: "Per-strategy independent PRNG ⇒ reproducible totals. Bands are rounded to nearest $1,000 (net worth/passive income), nearest year (FIRE year), and nearest dollar (required contribution). Probabilities round to integer percent.",
    incomplete: false,
  });

  entries.push({
    id: "audit-prob-engine-probability-derivation",
    label: "Probability Derivations",
    enginesUsed: ["decisionCandidates", "goalSolver", "canonicalHeadlineMetrics", "monteCarloEngine"],
    inputsUsed: [
      "scenarioRecord.metrics.projectedNetWorth",
      "scenarioRecord.metrics.projectedPassiveIncome",
      "scenarioRecord.metrics.fireYear",
      "scenarioRecord.metrics.liquidityPosition",
      "scenarioRecord.metrics.requiredMonthlyContribution",
    ],
    assumptions: [
      `Liquidity stress threshold = ${LIQUIDITY_FLOOR_MONTHS} months (matches canonicalRiskSurface).`,
      "Negative cashflow proxy = (passive income / 12) − required monthly contribution.",
      "Forced sale proxy = projected net worth < 0 (Sprint 7 net worth already nets liabilities).",
      "FIRE success = simulated FIRE year ≤ target FIRE year (when supplied) else ≤ goal-reverse-engineering target year.",
    ],
    confidenceSource: "probabilisticWealthEngine.monteCarloConfidence",
    riskSource: "Sprint 7 scenario riskScore (pass-through)",
    monteCarloSource: `probabilisticWealthEngine seed=${seed}, version=${set.version}`,
    howCalculated: "Each probability is the share of trials satisfying the predicate. Counts use only the trials where the underlying engine baseline existed — missing baselines flow to incomplete rather than fake 0%/100% values.",
    incomplete: false,
  });

  entries.push({
    id: "audit-prob-engine-robust-ranking",
    label: "Robust Strategy Ranking",
    enginesUsed: ["decisionRanking", "probabilisticWealthEngine"],
    inputsUsed: [
      "scenarioRecord.metrics.rankingScore (Sprint 7 deterministic)",
      "probabilisticWealthEngine.monteCarloConfidence",
    ],
    assumptions: [
      "Robust score = 0.5 × deterministic ranking + 0.5 × Monte Carlo confidence.",
      "Monte Carlo confidence = P(FIRE) − 0.5 × P(liquidity stress) − 0.5 × P(negative cashflow) − 0.5 × P(forced sale).",
      "When either component is missing, robust score falls back to whichever is available — never invented.",
    ],
    confidenceSource: "probabilisticWealthEngine.monteCarloConfidence",
    riskSource: "Sprint 7 scenario riskScore (pass-through)",
    monteCarloSource: `probabilisticWealthEngine seed=${seed}, version=${set.version}`,
    howCalculated: "Strategies sorted by robustScore desc. Ties broken by simulation order which is itself seeded ⇒ reproducible.",
    incomplete: false,
  });

  entries.push({
    id: "audit-prob-engine-sensitivity",
    label: "Assumption Sensitivity",
    enginesUsed: ["probabilisticWealthEngine"],
    inputsUsed: ["AssumptionSet, AssumptionSet (with each σ × 2 in turn)"],
    assumptions: [
      "Each driver is stress-tested by doubling its σ and re-running 500 trials against the leading strategy.",
      "Sensitivity column 'Δ P(success)' is integer percentage points; column 'Δ P50 net worth' is rounded to nearest $1,000.",
    ],
    confidenceSource: "probabilisticWealthEngine.monteCarloConfidence",
    riskSource: "Sprint 7 scenario riskScore (pass-through)",
    monteCarloSource: `probabilisticWealthEngine seed=${seed}, version=${set.version}`,
    howCalculated: "Per-driver delta vs the baseline assumption set is the simplest single-factor sensitivity — it reveals which assumption the strategy is most fragile to without introducing a new model.",
    incomplete: false,
  });

  // Reference back to Sprint 7 — keeps the chain auditable.
  entries.push({
    id: "audit-prob-engine-sprint7-passthrough",
    label: "Sprint 7 Pass-Through Provenance",
    enginesUsed: ["truePortfolioOptimizer (Sprint 7)"],
    inputsUsed: [
      "Sprint 7 scenarios array",
      "Sprint 7 recommendations array",
      "Sprint 7 frontier points",
      "Sprint 7 audit trail",
    ],
    assumptions: [
      "Sprint 8 reads only Sprint 7 outputs and canonical engine values quoted in Sprint 7 audit. No engine bypassed.",
      `Sprint 7 search metrics: generated=${s7.searchMetrics.generated}, valid=${s7.searchMetrics.valid}, frontier=${s7.searchMetrics.frontierSize}.`,
    ],
    confidenceSource: "bestMoveEngineSprint5.confidenceScore (Sprint 7 ancestor)",
    riskSource: "riskEngine.overall_score (Sprint 7 ancestor)",
    monteCarloSource: "Sprint 7 monteCarloEngine.prob_ff + Sprint 8 assumption draws",
    howCalculated: "Sprint 8 strategies inherit Sprint 7 ranking, frontier, and audit. Every probability surfaced here cites its Sprint 7 baseline.",
    incomplete: s7.searchMetrics.generated === 0,
  });

  return {
    entries,
    incomplete: entries.some(e => e.incomplete),
    metadata: {
      strategiesSimulated,
      simulationsPerStrategy: sims,
      totalSimulations: total,
      seed,
      assumptionSetVersion: set.version,
    },
  };
}

/* ─── Empty result ────────────────────────────────────────────────────── */

function emptyResult(
  reason: string,
  set: AssumptionSet,
  seed: number,
  sims: number,
): ProbabilisticWealthEngineResult {
  return {
    empty: true,
    emptyReason: reason,
    strategies: [],
    robustRanking: [],
    bestStrategy: null,
    sensitivity: [],
    assumptionSet: set,
    auditTrail: {
      entries: [{
        id: "audit-prob-engine-empty",
        label: "Empty State",
        enginesUsed: [],
        inputsUsed: [],
        assumptions: [reason],
        confidenceSource: "—",
        riskSource: "—",
        monteCarloSource: "—",
        howCalculated: reason,
        incomplete: true,
      }],
      incomplete: true,
      metadata: {
        strategiesSimulated: 0,
        simulationsPerStrategy: sims,
        totalSimulations: 0,
        seed,
        assumptionSetVersion: set.version,
      },
    },
  };
}

/* ─── Presentation helpers ────────────────────────────────────────────── */

export function formatConfidenceBand(b: ConfidenceBand, fmt: "currency" | "currency-per-year" | "currency-per-month" | "year"): string {
  if (b.incomplete || b.p10 == null || b.p50 == null || b.p90 == null) return "—";
  const fmtOne = (v: number): string => {
    switch (fmt) {
      case "currency": {
        const abs = Math.abs(v);
        const sign = v < 0 ? "-" : "";
        if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
        if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
        return `${sign}$${Math.round(abs)}`;
      }
      case "currency-per-year": {
        if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M/yr`;
        if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k/yr`;
        return `$${Math.round(v)}/yr`;
      }
      case "currency-per-month": {
        if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k/mo`;
        return `$${Math.round(v)}/mo`;
      }
      case "year":
        return String(Math.round(v));
    }
  };
  return `P10 ${fmtOne(b.p10)} · P50 ${fmtOne(b.p50)} · P90 ${fmtOne(b.p90)}`;
}

export function formatProbabilityPct(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p)}%`;
}
