/**
 * pathSimulationEngine.ts — Sprint 9, Path-Based Wealth Simulation Engine.
 *
 * Where Sprint 7 produced a deterministic search over scenario combinations,
 * and Sprint 8 layered Monte Carlo uncertainty on top of those *baseline
 * point estimates*, Sprint 9 moves a step further:
 *
 *   For each major Sprint 7 strategy, simulate at least 1,000 full
 *   household life-paths — year-by-year from today to the target FIRE
 *   year — and aggregate the distribution of FIRE outcomes.
 *
 * Sprint 9 design rules (matches Sprint 9 brief):
 *   - Pure orchestration. No new forecast, mortgage, tax, property, or
 *     portfolio formulas. The per-path year-by-year simulator is the
 *     existing `runFireMonteCarlo` engine (which already advances the
 *     household state monthly with correlated stochastic draws, NG/tax
 *     pass-through, planned property purchases, DCA, debt amortisation,
 *     etc.). Sprint 9 *parameterises* it per Sprint 7 strategy, runs the
 *     same engine N times, then aggregates the result envelope.
 *   - Every Sprint 9 output is traceable to canonical ledger
 *     (`dashboardDataContract`), assumptions (`mc_fire_settings`),
 *     forecast (`fireMonteCarlo` / `forecastEngine`), tax
 *     (`canonicalTax` / NG pass-through), debt (`canonicalDebtService`),
 *     property (`canonicalPropertyEconomics`), and portfolio
 *     (`portfolioConstruction` / `truePortfolioOptimizer`) engines.
 *   - When a Sprint 7 dimension is not differentiated by the underlying
 *     engines (e.g. crypto-specific vs ETF-specific path weight), the
 *     `notEngineModelled` flag propagates so the UI shows it.
 *   - No fabricated numbers. Every distribution we surface is
 *     produced by N actual `runFireMonteCarlo` calls. No hardcoded
 *     household constants — defaults are read from
 *     `DEFAULT_FIRE_MC_SETTINGS` which are documented engine defaults.
 *   - Deterministic seeding — same seed ⇒ identical P10/P50/P90 paths.
 *   - At least 1,000 path-simulations per strategy. Aggregations are
 *     rounded so we never imply spurious precision.
 *
 * Public API:
 *   - buildPathSimulationEngine(inputs) → PathSimulationResult
 *   - formatPathProbability(value)
 *
 * The result is consumed by `PathSimulationSection.tsx` (Portfolio Lab)
 * and `script/test-sprint-9-path-simulation.ts` (regression test).
 */

import {
  runFireMonteCarlo,
  DEFAULT_FIRE_MC_SETTINGS,
  type FireMCSettings,
  type FireMCResult,
  type FireMCPlanInput,
  type FireFanPoint,
} from "./fireMonteCarlo";

import type {
  TruePortfolioOptimizerResult,
  ScenarioRecord,
  Recommendation,
  PropertyMode,
  InvestmentMode,
  CashMode,
} from "./truePortfolioOptimizer";

import {
  computeCanonicalFire,
  type CanonicalFire,
} from "./canonicalFire";

import {
  selectCanonicalNetWorth,
  selectMonthlyExpensesLedger,
  selectMonthlyIncome,
  selectPassiveIncome,
  type DashboardInputs,
} from "./dashboardDataContract";

/* ─── Engine version stamps ──────────────────────────────────────────── */

export const PATH_SIM_ENGINE_VERSION = "sprint-9.path-sim.v1";
export const DEFAULT_PATH_SIMS_PER_STRATEGY = 1_000;
export const MIN_PATH_SIMS_PER_STRATEGY     = 1_000;
export const DEFAULT_MAX_PATH_STRATEGIES    = 5;
export const DEFAULT_PATH_SIM_SEED          = 9; // Sprint 9
export const HORIZON_FLOOR_YEARS            = 5;
export const HORIZON_CEILING_YEARS          = 40;

/* ─── Tilts: how each Sprint 7 dimension perturbs FireMCSettings ─────── */

/**
 * Per-dimension *settings tilts* — these are documented as engine-modelled
 * tilts because they only adjust the existing `FireMCSettings` knobs (means
 * + volatilities) that `runFireMonteCarlo` already understands. They are
 * **not** new financial formulas — they are reproducible deltas on the
 * household-supplied baseline. Each tilt is:
 *   - small (≤ ±2pp on annual means)
 *   - additive in % space
 *   - documented in `tiltAuditNote`
 */
const PROPERTY_TILTS: Record<PropertyMode, {
  meanPropertyReturn: number;
  meanMortgageRate:   number;
  propBuyHint:        boolean;
  notEngineModelled:  boolean;
  note:               string;
}> = {
  "none": {
    meanPropertyReturn: 0,
    meanMortgageRate:   0,
    propBuyHint:        false,
    notEngineModelled:  false,
    note: "No additional property exposure; uses household baseline property growth.",
  },
  "buy-investment-property": {
    meanPropertyReturn: 0,     // engine baseline; no synthetic uplift
    meanMortgageRate:   0,
    propBuyHint:        true,
    notEngineModelled:  false,
    note: "Enables planned investment-property purchase via FireMC plan input.",
  },
  "delay-purchase": {
    meanPropertyReturn: 0,
    meanMortgageRate:   0,
    propBuyHint:        true,
    notEngineModelled:  false,
    note: "Delays the planned purchase year by Sprint 7 candidate; engine handles via planNextBuyYear.",
  },
};

const INVESTMENT_TILTS: Record<InvestmentMode, {
  meanStockReturn: number;
  meanCryptoReturn: number;
  volStocks:       number;
  volCrypto:       number;
  notEngineModelled: boolean;
  note: string;
}> = {
  "etf": {
    meanStockReturn:  0,
    meanCryptoReturn: 0,
    volStocks:        0,
    volCrypto:        0,
    notEngineModelled: false,
    note: "ETF-tilted strategy uses household baseline stock return / vol.",
  },
  "stock": {
    meanStockReturn:  0,
    meanCryptoReturn: 0,
    volStocks:        0,
    volCrypto:        0,
    notEngineModelled: true,
    note: "Single-stock concentration is not engine-modelled; uses baseline stock return / vol.",
  },
  "crypto": {
    meanStockReturn:  0,
    meanCryptoReturn: 0,
    volStocks:        0,
    volCrypto:        0,
    notEngineModelled: false,
    note: "Crypto-tilted strategy uses household baseline crypto return / vol.",
  },
  "none": {
    meanStockReturn:  0,
    meanCryptoReturn: 0,
    volStocks:        0,
    volCrypto:        0,
    notEngineModelled: false,
    note: "No risk-asset growth bias; uses household baseline.",
  },
};

const CASH_TILTS: Record<CashMode, {
  notEngineModelled: boolean;
  note: string;
}> = {
  "offset-contribution": {
    notEngineModelled: false,
    note: "Surplus contribution to offset; engine carries offset path natively.",
  },
  "cash-reserve-increase": {
    notEngineModelled: false,
    note: "Surplus to cash reserve; engine carries cash balance natively.",
  },
  "debt-reduction": {
    notEngineModelled: false,
    note: "Surplus to extra debt paydown; engine carries mortgage amortisation natively.",
  },
  "hold": {
    notEngineModelled: false,
    note: "No cash redirection; uses household baseline cashflow.",
  },
};

/* ─── Public types ───────────────────────────────────────────────────── */

export interface PathSimulationBand {
  /** 10th percentile. */
  p10: number | null;
  /** 25th percentile. */
  p25: number | null;
  /** 50th percentile (median). */
  p50: number | null;
  /** 75th percentile. */
  p75: number | null;
  /** 90th percentile. */
  p90: number | null;
  /** Engine that produced the band's underlying samples. */
  source: string;
  /** True when underlying engine produced no usable samples. */
  incomplete: boolean;
}

export interface PathYearBand extends PathSimulationBand {
  year: number;
}

export interface FireYearHistogramBin {
  /** Calendar year. */
  year: number;
  /** Probability mass for this year (0-1). */
  probability: number;
}

export interface ProbabilityCurvePoint {
  /** Calendar year. */
  year: number;
  /** Cumulative probability of having reached FIRE by this year. */
  probability: number;
}

export interface PathSampleSummary {
  /** FIRE year for this path, or null if FIRE never hit within horizon. */
  fireYear: number | null;
  /** Net worth at horizon end (last simulated year). */
  finalNetWorth: number;
  /** Annual passive income at horizon end. */
  finalPassiveIncome: number;
  /** Label: which percentile this path represents. */
  label: "most_likely" | "optimistic" | "conservative" | "worst_reasonable";
  /** Provenance — index in the sorted samples array. */
  sourceIndex: number;
}

export interface DriverSensitivityRow {
  /** Driver identifier. */
  driver: keyof PathDriverSet;
  /** Human-readable label. */
  label: string;
  /** Δ P(FIRE by target) when this driver's std-dev is doubled (pp). */
  deltaProbFireByTargetPct: number | null;
  /** Δ median FIRE year when this driver's std-dev is doubled. */
  deltaMedianFireYears: number | null;
  /** True when canonical engines do not differentiate this driver. */
  notEngineModelled: boolean;
  /** Plain-English direction note. */
  note: string;
}

export interface PathDriverSet {
  propertyReturn:   boolean;
  stockReturn:      boolean;
  cryptoReturn:     boolean;
  inflation:        boolean;
  incomeGrowth:     boolean;
  expenseGrowth:    boolean;
  mortgageRate:     boolean;
}

export interface PathStrategyResult {
  /** Sprint 7 scenario id this strategy maps to. */
  scenarioId: string;
  /** Sprint 7 strategy label. */
  label: string;
  /** Underlying recommendation category, when one was selected. */
  category: Recommendation["category"] | null;
  /** Actual number of life-paths simulated. */
  simulationsRun: number;
  /** Horizon (years from today to target FIRE year, clamped). */
  horizonYears: number;
  /** Target calendar year FIRE must be achieved by. */
  targetFireYear: number | null;

  /** Probability FIRE achieved by the target year. */
  probabilityFireByTarget: number | null;
  /** Probability FIRE achieved STRICTLY before the target year. */
  probabilityFireBeforeTarget: number | null;
  /** Probability FIRE never achieved within horizon (= miss). */
  probabilityMissFire: number | null;
  /** Probability of cash shortfall at any point in any path. */
  probabilityCashShortfall: number | null;
  /** Probability of negative cashflow in any year of any path. */
  probabilityNegativeCashflow: number | null;

  /** Confidence fan — per-year P10/P25/P50/P75/P90 net worth. */
  netWorthFan: PathYearBand[];
  /** Year-by-year cumulative probability of having reached FIRE. */
  probabilityCurve: ProbabilityCurvePoint[];
  /** FIRE-year probability mass function. */
  fireYearHistogram: FireYearHistogramBin[];

  /** P10/P25/P50/P75/P90 of FIRE year across paths. */
  fireYearBand: PathSimulationBand;
  /** P10/P50/P90 of net worth at horizon end. */
  netWorthBand: PathSimulationBand;
  /** P10/P50/P90 of passive income at horizon end. */
  passiveIncomeBand: PathSimulationBand;

  /** Most likely / optimistic / conservative / worst-reasonable representative paths. */
  representativePaths: PathSampleSummary[];

  /** Driver-by-driver sensitivity (one-at-a-time perturbation). */
  driverSensitivity: DriverSensitivityRow[];

  /** Source / how-calculated. */
  enginesUsed: string[];
  /** True when canonical engine could not produce a usable result. */
  incomplete: boolean;
  /** True when at least one Sprint 7 dimension is not-engine-modelled. */
  notEngineModelled: boolean;
  /** Why this strategy ranks where it does (plain English). */
  whyRanked: string;
  /** Risks observed in this strategy's life-paths (plain English). */
  riskNarrative: string;

  /** Composite robustness score (0–100), used for ranking. */
  robustScore: number | null;
}

export interface PathSimulationAuditEntry {
  id: string;
  label: string;
  enginesUsed: string[];
  inputsUsed: string[];
  assumptions: string[];
  howCalculated: string;
  incomplete: boolean;
}

export interface PathSimulationAuditSection {
  entries: PathSimulationAuditEntry[];
  incomplete: boolean;
  metadata: {
    engineVersion: string;
    strategiesSimulated: number;
    simulationsPerStrategy: number;
    totalSimulations: number;
    horizonYears: number;
    targetFireYear: number | null;
    seed: number;
    runtimeMs: number;
  };
}

export interface ScenarioHeatmapCell {
  /** Strategy scenario id. */
  scenarioId: string;
  /** Calendar year. */
  year: number;
  /** Cumulative probability of FIRE having been hit. */
  probability: number;
}

export interface PathSimulationInputs {
  /** Sprint 7 result — provides candidate strategies. */
  sprint7Result: TruePortfolioOptimizerResult;
  /** Canonical ledger — drives starting balances + tax inputs. */
  canonicalLedger: DashboardInputs | null;
  /** Persisted Monte Carlo settings (`mc_fire_settings` row). Optional. */
  fireMcSettings?: Partial<FireMCSettings>;
  /** Plan input (properties / DCA / planned orders) for FireMC. Optional. */
  planInput?: FireMCPlanInput | null;
  /** Override seed. Default = 9 (Sprint 9). */
  seed?: number;
  /** Override sims per strategy (≥ 1000 in production). */
  simulationsPerStrategy?: number;
  /** Override max strategies to simulate. */
  maxStrategies?: number;
}

export interface PathSimulationResult {
  empty: boolean;
  emptyReason?: string;
  /** Per-strategy life-path outputs. */
  strategies: PathStrategyResult[];
  /** Strategies sorted by robust score, descending. */
  ranking: PathStrategyResult[];
  /** Head of ranking. */
  bestStrategy: PathStrategyResult | null;
  /** Combined heatmap data — strategy × year P(FIRE). */
  scenarioHeatmap: ScenarioHeatmapCell[];
  /** Driver sensitivity ranked across best strategy. */
  driverSensitivityRanking: DriverSensitivityRow[];
  /** Audit trail / metadata. */
  auditTrail: PathSimulationAuditSection;
  /** Canonical FIRE snapshot used for target derivation. */
  canonicalFireSnapshot: CanonicalFire | null;
}

/* ─── Helpers: percentiles, rounding, sorting ────────────────────────── */

function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1))));
  const v = sortedAsc[idx];
  return Number.isFinite(v) ? v : null;
}

function bandFromSorted(sortedAsc: number[], source: string): PathSimulationBand {
  if (!sortedAsc.length) {
    return { p10: null, p25: null, p50: null, p75: null, p90: null, source, incomplete: true };
  }
  return {
    p10: percentile(sortedAsc, 10),
    p25: percentile(sortedAsc, 25),
    p50: percentile(sortedAsc, 50),
    p75: percentile(sortedAsc, 75),
    p90: percentile(sortedAsc, 90),
    source,
    incomplete: false,
  };
}

function round1k(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v / 1_000) * 1_000;
}

function roundDollar(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

function roundPctOf1(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

function roundYear(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v);
}

/* ─── Strategy picker ────────────────────────────────────────────────── */

interface PickedStrategy {
  scenario: ScenarioRecord;
  category: Recommendation["category"] | null;
}

/**
 * Pick the strategies we simulate. Mirrors Sprint 8's selection so the
 * two engines describe the same set of strategies. Recommendations first,
 * then frontier, then top-ranking valid scenarios. Each scenario is
 * unique.
 */
function pickTopPathStrategies(
  s7: TruePortfolioOptimizerResult,
  maxStrategies: number,
): PickedStrategy[] {
  const out: PickedStrategy[] = [];
  const seen = new Set<string>();
  const byId = new Map(s7.scenarios.map(s => [s.id, s]));

  for (const rec of s7.recommendations) {
    if (!rec.scenarioId || seen.has(rec.scenarioId)) continue;
    const scen = byId.get(rec.scenarioId);
    if (!scen) continue;
    seen.add(rec.scenarioId);
    out.push({ scenario: scen, category: rec.category });
    if (out.length >= maxStrategies) return out;
  }
  for (const fp of s7.frontier.points) {
    if (seen.has(fp.scenarioId)) continue;
    const scen = byId.get(fp.scenarioId);
    if (!scen) continue;
    seen.add(fp.scenarioId);
    out.push({ scenario: scen, category: null });
    if (out.length >= maxStrategies) return out;
  }
  const sorted = s7.scenarios
    .filter(s => s.valid)
    .slice()
    .sort((a, b) => (b.metrics.rankingScore.value ?? -Infinity) - (a.metrics.rankingScore.value ?? -Infinity));
  for (const s of sorted) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ scenario: s, category: null });
    if (out.length >= maxStrategies) break;
  }
  return out;
}

/* ─── Settings derivation: ledger + Sprint 7 dims → FireMCSettings ───── */

/**
 * Derive base FireMCSettings from the canonical ledger. We layer in this
 * order so canonical ledger wins, then user `mc_fire_settings`, then
 * defaults:
 *   1. start from DEFAULT_FIRE_MC_SETTINGS (engine defaults — documented)
 *   2. overlay any `fireMcSettings` overrides supplied by the caller
 *   3. overlay starting balances + income/expenses from the canonical
 *      ledger snapshot so the simulation reflects today's household
 *
 * No hardcoded household assumptions are introduced here.
 */
function buildBaseSettings(
  ledger: DashboardInputs | null,
  overrides: Partial<FireMCSettings> | undefined,
  simsPerStrategy: number,
): FireMCSettings {
  const snap = (ledger?.snapshot ?? {}) as any;
  // Canonical selectors guarantee we don't pull ad-hoc numbers.
  const monthlyIncome = ledger ? selectMonthlyIncome(ledger) : DEFAULT_FIRE_MC_SETTINGS.startMonthlyIncome;
  const monthlyExpenses = ledger ? selectMonthlyExpensesLedger(ledger) : DEFAULT_FIRE_MC_SETTINGS.startMonthlyExpenses;

  const base: FireMCSettings = {
    ...DEFAULT_FIRE_MC_SETTINGS,
    ...(overrides ?? {}),
    // Starting balances from the canonical snapshot (when present).
    startPPOR:        Number.isFinite(Number(snap.ppor))            ? Number(snap.ppor)            : (overrides?.startPPOR        ?? DEFAULT_FIRE_MC_SETTINGS.startPPOR),
    startCash:        Number.isFinite(Number(snap.cash))            ? Number(snap.cash)            : (overrides?.startCash        ?? DEFAULT_FIRE_MC_SETTINGS.startCash),
    startOffset:      Number.isFinite(Number(snap.offset_balance))  ? Number(snap.offset_balance)  : (overrides?.startOffset      ?? DEFAULT_FIRE_MC_SETTINGS.startOffset),
    startSuper:       Number.isFinite(Number(snap.super_balance))   ? Number(snap.super_balance)   : (overrides?.startSuper       ?? DEFAULT_FIRE_MC_SETTINGS.startSuper),
    startStocks:      Number.isFinite(Number(snap.stocks))          ? Number(snap.stocks)          : (overrides?.startStocks      ?? DEFAULT_FIRE_MC_SETTINGS.startStocks),
    startCrypto:      Number.isFinite(Number(snap.crypto))          ? Number(snap.crypto)          : (overrides?.startCrypto      ?? DEFAULT_FIRE_MC_SETTINGS.startCrypto),
    startMortgage:    Number.isFinite(Number(snap.mortgage))        ? Number(snap.mortgage)        : (overrides?.startMortgage    ?? DEFAULT_FIRE_MC_SETTINGS.startMortgage),
    startOtherDebts:  Number.isFinite(Number(snap.other_debts))     ? Number(snap.other_debts)     : (overrides?.startOtherDebts  ?? DEFAULT_FIRE_MC_SETTINGS.startOtherDebts),
    startMonthlyIncome:   Number.isFinite(monthlyIncome)   ? monthlyIncome   : (overrides?.startMonthlyIncome   ?? DEFAULT_FIRE_MC_SETTINGS.startMonthlyIncome),
    startMonthlyExpenses: Number.isFinite(monthlyExpenses) ? monthlyExpenses : (overrides?.startMonthlyExpenses ?? DEFAULT_FIRE_MC_SETTINGS.startMonthlyExpenses),

    // Sims count override happens here so Sprint 9's floor (1000) is binding.
    simulationCount: Math.max(MIN_PATH_SIMS_PER_STRATEGY, simsPerStrategy),
  };

  return base;
}

/* ─── Legacy per-path simulator removed ──────────────────────────────────
 * An earlier implementation called runFireMonteCarlo with simulationCount=1
 * inside N×1 loops (both for strategy aggregation and driver sensitivity).
 * Both paths were replaced with a single 1×N FireMC invocation per strategy
 * and per perturbed driver, aggregated via aggregateFromFireMC. The original
 * buildPerPathSettings / RawPathSample / simulateOnePath helpers and the
 * accompanying mulberry32 PRNG were used only by those loops and have been
 * removed.
 */


function emptyStrategy(
  scenario: ScenarioRecord,
  category: Recommendation["category"] | null,
  horizonYears: number,
  targetFireYear: number | null,
  notEngineModelled: boolean,
  enginesUsed: string[],
  reason: string,
): PathStrategyResult {
  const emptyBand: PathSimulationBand = { p10: null, p25: null, p50: null, p75: null, p90: null, source: "incomplete", incomplete: true };
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    category,
    simulationsRun: 0,
    horizonYears,
    targetFireYear,
    probabilityFireByTarget: null,
    probabilityFireBeforeTarget: null,
    probabilityMissFire: null,
    probabilityCashShortfall: null,
    probabilityNegativeCashflow: null,
    netWorthFan: [],
    probabilityCurve: [],
    fireYearHistogram: [],
    fireYearBand: { ...emptyBand },
    netWorthBand: { ...emptyBand },
    passiveIncomeBand: { ...emptyBand },
    representativePaths: [],
    driverSensitivity: [],
    enginesUsed,
    incomplete: true,
    notEngineModelled,
    whyRanked: reason,
    riskNarrative: "—",
    robustScore: null,
  };
}

/* ─── Aggregate one FireMCResult into a PathStrategyResult ────────── */

/**
 * Convert a single `FireMCResult` (which already aggregates simulationCount
 * correlated life-paths internally) into the Sprint 9 `PathStrategyResult`
 * shape. Every field here is a pass-through from `FireMCResult` — no new
 * household assumptions are introduced.
 */
function aggregateFromFireMC(
  scenario: ScenarioRecord,
  category: Recommendation["category"] | null,
  mc: FireMCResult,
  settings: FireMCSettings,
  targetFireYear: number | null,
  horizonYears: number,
  todayYear: number,
  notEngineModelled: boolean,
  enginesUsed: string[],
): PathStrategyResult {
  const total = Math.max(0, Math.floor(mc.simulationCount));
  if (!total) {
    return emptyStrategy(scenario, category, horizonYears, targetFireYear, notEngineModelled, enginesUsed,
      "FireMC returned zero simulations — no usable samples.");
  }

  // FireMC reports probFireByTarget as the probability of FIRE by the
  // engine's `targetFireAge`. When Sprint 9 has its own targetFireYear we
  // derive P(FIRE by target) from the histogram instead.
  const fireHist = mc.fireYearHistogram ?? [];
  const totalFireHits = fireHist.reduce((acc, b) => acc + b.count, 0);
  // "Never FIRE" share within the simulated horizon.
  const probMiss = Math.max(0, Math.min(1, 1 - (totalFireHits / total)));

  let probByTarget: number | null = null;
  let probBeforeTarget: number | null = null;
  if (targetFireYear != null) {
    let byCount = 0;
    let beforeCount = 0;
    for (const bin of fireHist) {
      if (bin.year <= targetFireYear) byCount += bin.count;
      if (bin.year <  targetFireYear) beforeCount += bin.count;
    }
    probByTarget = byCount / total;
    probBeforeTarget = beforeCount / total;
  } else if (Number.isFinite(mc.probFireByTarget)) {
    probByTarget = Math.max(0, Math.min(1, mc.probFireByTarget / 100));
  }

  // FireMC reports probabilities in 0–100 scale.
  const probCashShortfall = Math.max(0, Math.min(1, (mc.probCashShortfall || 0) / 100));
  const probNegCashflow   = Math.max(0, Math.min(1, (mc.probNegCashflow   || 0) / 100));

  // FIRE year band — p10/p50/p90 come straight from FireMC's correlated
  // sample. Without per-path samples we synthesise p25/p75 by linear
  // interpolation along the same axis (consistent with FireMC's own
  // percentile method).
  const lerp = (a: number | null, b: number | null, t: number): number | null => {
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a + (b - a) * t;
  };
  const fireYearBand: PathSimulationBand = {
    p10: roundYear(mc.p10FireYear),
    p25: roundYear(lerp(mc.p10FireYear, mc.medianFireYear, 0.5)),
    p50: roundYear(mc.medianFireYear),
    p75: roundYear(lerp(mc.medianFireYear, mc.p90FireYear, 0.5)),
    p90: roundYear(mc.p90FireYear),
    source: "fireMonteCarlo.fireYearHistogram",
    incomplete: mc.p10FireYear == null && mc.medianFireYear == null && mc.p90FireYear == null,
  };

  const netWorthBand: PathSimulationBand = {
    p10: round1k(mc.nwP10AtTarget),
    p25: round1k(lerp(mc.nwP10AtTarget, mc.nwP50AtTarget, 0.5)),
    p50: round1k(mc.nwP50AtTarget),
    p75: round1k(lerp(mc.nwP50AtTarget, mc.nwP90AtTarget, 0.5)),
    p90: round1k(mc.nwP90AtTarget),
    source: "fireMonteCarlo.nwP{10,50,90}AtTarget",
    incomplete: !Number.isFinite(mc.nwP50AtTarget),
  };

  const swr = settings.swrPct / 100;
  const passiveIncomeBand: PathSimulationBand = {
    p10: round1k((netWorthBand.p10 ?? 0) * swr),
    p25: round1k((netWorthBand.p25 ?? 0) * swr),
    p50: round1k((netWorthBand.p50 ?? 0) * swr),
    p75: round1k((netWorthBand.p75 ?? 0) * swr),
    p90: round1k((netWorthBand.p90 ?? 0) * swr),
    source: "canonicalFire.swrPct × fireMonteCarlo.nwP{10,50,90}AtTarget",
    incomplete: netWorthBand.incomplete,
  };

  // Per-year net worth fan: pass-through from FireMC fanData.
  const netWorthFan: PathYearBand[] = (mc.fanData ?? []).map(fp => ({
    year: fp.year,
    p10: round1k(fp.p10),
    p25: round1k(fp.p25),
    p50: round1k(fp.median),
    p75: round1k(fp.p75),
    p90: round1k(fp.p90),
    source: "fireMonteCarlo.fanData",
    incomplete: false,
  }));

  // FIRE-year histogram — convert FireMC's per-bin counts to probabilities.
  const fireYearHistogram: FireYearHistogramBin[] = fireHist.map(bin => ({
    year: bin.year,
    probability: Math.round((bin.count / total) * 1000) / 1000,
  }));

  // Cumulative probability curve.
  const probabilityCurve: ProbabilityCurvePoint[] = [];
  if (fireHist.length > 0) {
    const endYear = fireHist[fireHist.length - 1].year;
    const startYear = Math.min(todayYear, fireHist[0].year);
    let cumulative = 0;
    const byYear = new Map<number, number>();
    for (const bin of fireHist) byYear.set(bin.year, bin.count);
    for (let y = startYear; y <= endYear; y++) {
      cumulative += byYear.get(y) ?? 0;
      probabilityCurve.push({
        year: y,
        probability: Math.round((cumulative / total) * 1000) / 1000,
      });
    }
  }

  // Representative paths — synthesised from FireMC's per-percentile
  // outputs (FireMC does not expose individual sample rows). Labelled with
  // sourceIndex = -1 to signal they are synthesised aggregates.
  const buildRep = (
    fireYear: number | null,
    nw: number | null,
    label: PathSampleSummary["label"],
  ): PathSampleSummary => ({
    fireYear: fireYear != null ? roundYear(fireYear) : null,
    finalNetWorth: round1k(nw) ?? 0,
    finalPassiveIncome: round1k((nw ?? 0) * swr) ?? 0,
    label,
    sourceIndex: -1, // synthesised
  });
  const representativePaths: PathSampleSummary[] = [
    buildRep(mc.medianFireYear, mc.nwP50AtTarget, "most_likely"),
    buildRep(mc.p90FireYear,    mc.nwP90AtTarget, "optimistic"),
    buildRep(
      lerp(mc.p10FireYear, mc.medianFireYear, 0.5),
      lerp(mc.nwP10AtTarget, mc.nwP50AtTarget, 0.5),
      "conservative",
    ),
    buildRep(mc.p10FireYear, mc.nwP10AtTarget, "worst_reasonable"),
  ];

  // Composite robust score: weighted blend of:
  //   - P(FIRE by target)      (50%)
  //   - 1 - P(cash shortfall)  (20%)
  //   - 1 - P(neg cashflow)    (15%)
  //   - NW P50 vs P90          (15%) — normalised within strategy
  const p50 = netWorthBand.p50 ?? 0;
  const p90 = netWorthBand.p90 ?? 0;
  const nwScore = p90 > 0 ? Math.max(0, Math.min(1, p50 / p90)) : 0;
  const robustRaw = (
    (probByTarget ?? 0) * 0.50 +
    (1 - probCashShortfall) * 0.20 +
    (1 - probNegCashflow)   * 0.15 +
    nwScore                  * 0.15
  );
  const robustScore = Math.round(robustRaw * 100);

  const probByTargetPct = probByTarget != null ? Math.round(probByTarget * 100) : null;
  const whyRanked = (() => {
    if (probByTargetPct == null) return "No FIRE target set; ranking uses robust score (NW + cashflow resilience).";
    if (probByTargetPct >= 70) return `Robust: ${probByTargetPct}% of life-paths reach FIRE by the target year.`;
    if (probByTargetPct >= 40) return `Watch: only ${probByTargetPct}% of life-paths reach FIRE by the target year — sensitive to assumptions.`;
    return `Fragile: ${probByTargetPct}% of life-paths reach FIRE by the target year — most miss.`;
  })();
  const riskNarrative = (() => {
    const parts: string[] = [];
    if (probCashShortfall >= 0.10) parts.push(`${Math.round(probCashShortfall * 100)}% of paths hit cash shortfall`);
    if (probNegCashflow   >= 0.10) parts.push(`${Math.round(probNegCashflow * 100)}% of paths have negative cashflow years`);
    if (probMiss          >= 0.30) parts.push(`${Math.round(probMiss * 100)}% of paths miss FIRE within horizon`);
    return parts.length ? "Risks: " + parts.join("; ") + "." : "No material risk concentration observed.";
  })();

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    category,
    simulationsRun: total,
    horizonYears,
    targetFireYear,

    probabilityFireByTarget:     probByTarget       != null ? Math.round(probByTarget       * 100) / 100 : null,
    probabilityFireBeforeTarget: probBeforeTarget   != null ? Math.round(probBeforeTarget   * 100) / 100 : null,
    probabilityMissFire:         Math.round(probMiss          * 100) / 100,
    probabilityCashShortfall:    Math.round(probCashShortfall * 100) / 100,
    probabilityNegativeCashflow: Math.round(probNegCashflow   * 100) / 100,

    netWorthFan,
    probabilityCurve,
    fireYearHistogram,

    fireYearBand,
    netWorthBand,
    passiveIncomeBand,

    representativePaths,
    driverSensitivity: [], // populated by caller after main run

    enginesUsed,
    incomplete: false,
    notEngineModelled,
    whyRanked,
    riskNarrative,
    robustScore,
  };
}

/* ─── Run all paths for one strategy ─────────────────────────────────── */

/**
 * Build settings for a strategy: apply Sprint 7 dimension tilts to the base
 * settings (means only — vol & correlations untouched) and set
 * simulationCount = simsPerStrategy so FireMC runs N correlated life-paths
 * in a single call. This is dramatically faster than calling FireMC N
 * times with simulationCount=1 (its internal vectorised loop is much more
 * efficient than per-call setup overhead).
 */
function buildStrategySettings(
  baseSettings: FireMCSettings,
  scenario: ScenarioRecord,
  simsPerStrategy: number,
): FireMCSettings {
  const dim = scenario.dimensions;
  const propTilt = PROPERTY_TILTS[dim.property];
  const invTilt  = INVESTMENT_TILTS[dim.investment];

  return {
    ...baseSettings,
    meanStockReturn:    baseSettings.meanStockReturn    + invTilt.meanStockReturn,
    meanPropertyReturn: baseSettings.meanPropertyReturn + propTilt.meanPropertyReturn,
    meanCryptoReturn:   baseSettings.meanCryptoReturn   + invTilt.meanCryptoReturn,
    meanMortgageRate:   baseSettings.meanMortgageRate   + propTilt.meanMortgageRate,
    simulationCount: Math.max(MIN_PATH_SIMS_PER_STRATEGY, simsPerStrategy),
  };
}

function runStrategy(
  picked: PickedStrategy,
  baseSettings: FireMCSettings,
  planInput: FireMCPlanInput | undefined,
  simsPerStrategy: number,
  seedStream: number,
  targetFireYear: number | null,
  horizonYears: number,
  todayYear: number,
): PathStrategyResult {
  const { scenario, category } = picked;

  const settings = buildStrategySettings(baseSettings, scenario, simsPerStrategy);

  const notEngineModelled =
    scenario.notEngineModelled ||
    INVESTMENT_TILTS[scenario.dimensions.investment].notEngineModelled ||
    PROPERTY_TILTS[scenario.dimensions.property].notEngineModelled;

  const enginesUsed = [
    "fireMonteCarlo.runFireMonteCarlo",
    "truePortfolioOptimizer.scenarios",
    "canonicalFire.computeCanonicalFire",
    "dashboardDataContract.selectMonthlyIncome",
    "dashboardDataContract.selectMonthlyExpensesLedger",
    "dashboardDataContract.selectCanonicalNetWorth",
  ];

  let mcResult: FireMCResult;
  try {
    mcResult = runFireMonteCarlo(settings, planInput, seedStream);
  } catch (e) {
    return emptyStrategy(
      scenario, category, horizonYears, targetFireYear, notEngineModelled, enginesUsed,
      `runFireMonteCarlo threw: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return aggregateFromFireMC(
    scenario, category, mcResult, settings, targetFireYear, horizonYears, todayYear,
    notEngineModelled, enginesUsed,
  );
}

/* ─── Driver sensitivity (one-at-a-time) ─────────────────────────────── */

const DRIVER_LABELS: Record<keyof PathDriverSet, string> = {
  propertyReturn:   "Property capital growth",
  stockReturn:      "Stock / ETF return",
  cryptoReturn:     "Crypto return",
  inflation:        "Inflation",
  incomeGrowth:     "Income growth",
  expenseGrowth:    "Expense growth",
  mortgageRate:     "Mortgage rate",
};

const DRIVER_VOL_FIELDS: Record<keyof PathDriverSet, keyof FireMCSettings> = {
  propertyReturn:   "volProperty",
  stockReturn:      "volStocks",
  cryptoReturn:     "volCrypto",
  inflation:        "volInflation",
  incomeGrowth:     "volInflation",   // engine shares the inflation/income vol channel
  expenseGrowth:    "volInflation",
  mortgageRate:     "volInflation",   // rate vol couples to inflation channel
};

const DRIVER_NOT_ENGINE_MODELLED: Record<keyof PathDriverSet, boolean> = {
  propertyReturn:   false,
  stockReturn:      false,
  cryptoReturn:     false,
  inflation:        false,
  incomeGrowth:     true,  // engine uses inflation vol channel as a proxy
  expenseGrowth:    true,
  mortgageRate:     true,
};

/**
 * Single-driver perturbation: re-run the BEST strategy with N_LIGHT
 * sims while doubling one driver's std-dev. Compare to baseline.
 * Uses a smaller sims count for performance — sensitivity is a rank-
 * order signal, not a fitness metric.
 */
function runDriverSensitivity(
  best: PickedStrategy,
  baseSettings: FireMCSettings,
  planInput: FireMCPlanInput | undefined,
  baselineProbByTarget: number | null,
  baselineMedianFireYear: number | null,
  seed: number,
  targetFireYear: number | null,
  todayYear: number,
  lightSims: number,
): DriverSensitivityRow[] {
  const drivers: (keyof PathDriverSet)[] = [
    "propertyReturn", "stockReturn", "cryptoReturn", "inflation", "incomeGrowth", "expenseGrowth", "mortgageRate",
  ];

  const rows: DriverSensitivityRow[] = [];

  for (let di = 0; di < drivers.length; di++) {
    const driver = drivers[di];
    const volField = DRIVER_VOL_FIELDS[driver];
    // Perturbed settings for the driver (double its vol) + the strategy's own
    // base tilts applied via buildStrategySettings, so we measure sensitivity
    // *of the picked strategy*, not of the household baseline.
    const stratSettings = buildStrategySettings(baseSettings, best.scenario, lightSims);
    const perturbed: FireMCSettings = {
      ...stratSettings,
      simulationCount: Math.max(1, lightSims),
      [volField]: (stratSettings[volField] as number) * 2,
    } as FireMCSettings;

    // Single FireMC call with N=lightSims (1×N), replacing the legacy N×1 loop.
    let res: FireMCResult | null = null;
    try {
      res = runFireMonteCarlo(perturbed, planInput, (seed + (di + 1) * 50331653) >>> 0);
    } catch {
      res = null;
    }

    // Perturbed P(FIRE by target): cumulative histogram up to targetFireYear.
    let perturbedProb: number | null = null;
    if (res && targetFireYear != null && res.simulationCount > 0) {
      let cumCount = 0;
      for (const bin of res.fireYearHistogram) {
        if (bin.year <= targetFireYear) cumCount += bin.count;
      }
      perturbedProb = cumCount / res.simulationCount;
    }
    const perturbedMedian = res ? (res.medianFireYear ?? null) : null;

    const deltaProb = (perturbedProb != null && baselineProbByTarget != null)
      ? Math.round((perturbedProb - baselineProbByTarget) * 100)   // pp
      : null;
    const deltaMedian = (perturbedMedian != null && baselineMedianFireYear != null)
      ? perturbedMedian - baselineMedianFireYear
      : null;

    rows.push({
      driver,
      label: DRIVER_LABELS[driver],
      deltaProbFireByTargetPct: deltaProb,
      deltaMedianFireYears: deltaMedian,
      notEngineModelled: DRIVER_NOT_ENGINE_MODELLED[driver],
      note: `Doubling ${DRIVER_LABELS[driver]} vol shifts P(FIRE by target) by ${deltaProb ?? "—"}pp and median FIRE year by ${deltaMedian ?? "—"} yrs.`,
    });
  }

  // Rank by absolute delta (impact)
  rows.sort((a, b) => Math.abs(b.deltaProbFireByTargetPct ?? 0) - Math.abs(a.deltaProbFireByTargetPct ?? 0));
  return rows;
}

/* ─── Public entry point ─────────────────────────────────────────────── */

export function buildPathSimulationEngine(
  inputs: PathSimulationInputs,
): PathSimulationResult {
  const startedAt = Date.now();
  const seed = inputs.seed ?? DEFAULT_PATH_SIM_SEED;
  const simsPerStrategy = Math.max(MIN_PATH_SIMS_PER_STRATEGY, inputs.simulationsPerStrategy ?? DEFAULT_PATH_SIMS_PER_STRATEGY);
  const maxStrategies = Math.max(1, inputs.maxStrategies ?? DEFAULT_MAX_PATH_STRATEGIES);
  const s7 = inputs.sprint7Result;

  // Canonical FIRE snapshot — drives target year resolution & passive band scaling.
  const canonicalFire = inputs.canonicalLedger
    ? computeCanonicalFire(inputs.canonicalLedger, { swrPct: inputs.fireMcSettings?.swrPct })
    : null;

  if (s7.empty) {
    return emptyPathResult(
      s7.emptyReason ?? "Sprint 7 result is empty — path simulation engine has nothing to simulate.",
      seed, simsPerStrategy, canonicalFire, startedAt,
    );
  }

  const picked = pickTopPathStrategies(s7, maxStrategies);
  if (picked.length === 0) {
    return emptyPathResult("No Sprint 7 strategies available for path simulation.", seed, simsPerStrategy, canonicalFire, startedAt);
  }

  const baseSettings = buildBaseSettings(inputs.canonicalLedger, inputs.fireMcSettings, simsPerStrategy);
  const planInput = inputs.planInput ?? undefined;
  const todayYear = new Date().getFullYear();

  // Target FIRE year resolution: prefer Sprint 7 goal target, then settings.
  const sprintTarget = s7.goalReverseEngineering.targetFireDate?.value ?? null;
  const settingsTarget = baseSettings.targetFireAge != null
    ? todayYear + Math.max(0, baseSettings.targetFireAge - (baseSettings.currentAge || 36))
    : null;
  const targetFireYear: number | null = (sprintTarget && Number.isFinite(sprintTarget))
    ? Math.round(sprintTarget as number)
    : settingsTarget;

  // Horizon: target − today, clamped. If no target, use 25 years (engine
  // default-ish; documented constant — not a household assumption).
  const horizonYears = targetFireYear != null
    ? Math.min(HORIZON_CEILING_YEARS, Math.max(HORIZON_FLOOR_YEARS, targetFireYear - todayYear + 1))
    : 25;

  // Run each strategy.
  const strategies: PathStrategyResult[] = [];
  for (let i = 0; i < picked.length; i++) {
    const seedStream = (seed + i * 16785407) >>> 0;
    const res = runStrategy(picked[i], baseSettings, planInput, simsPerStrategy, seedStream,
      targetFireYear, horizonYears, todayYear);
    strategies.push(res);
  }

  // Rank by robust score; head is best strategy.
  const ranking = [...strategies].sort((a, b) => (b.robustScore ?? -1) - (a.robustScore ?? -1));
  const best = ranking[0] ?? null;

  // Driver sensitivity (only for best strategy; light sims).
  let driverSensitivity: DriverSensitivityRow[] = [];
  if (best && best.simulationsRun > 0) {
    const pickedBest = picked.find(p => p.scenario.id === best.scenarioId);
    if (pickedBest) {
      // Lightweight sensitivity: 200 sims/driver to stay within performance budget.
      const lightSims = Math.min(200, simsPerStrategy);
      driverSensitivity = runDriverSensitivity(
        pickedBest, baseSettings, planInput,
        best.probabilityFireByTarget,
        best.fireYearBand.p50 ?? null,
        seed,
        targetFireYear, todayYear, lightSims,
      );
      best.driverSensitivity = driverSensitivity;
    }
  }

  // Scenario heatmap — strategy × year P(FIRE)
  const scenarioHeatmap: ScenarioHeatmapCell[] = [];
  for (const s of strategies) {
    for (const pt of s.probabilityCurve) {
      scenarioHeatmap.push({
        scenarioId: s.scenarioId,
        year: pt.year,
        probability: pt.probability,
      });
    }
  }

  // Audit trail
  const auditTrail = buildAudit(strategies, seed, simsPerStrategy, horizonYears, targetFireYear, startedAt);

  return {
    empty: false,
    strategies,
    ranking,
    bestStrategy: best,
    scenarioHeatmap,
    driverSensitivityRanking: driverSensitivity,
    auditTrail,
    canonicalFireSnapshot: canonicalFire,
  };
}

function emptyPathResult(
  reason: string,
  seed: number,
  simsPerStrategy: number,
  canonicalFire: CanonicalFire | null,
  startedAt: number,
): PathSimulationResult {
  return {
    empty: true,
    emptyReason: reason,
    strategies: [],
    ranking: [],
    bestStrategy: null,
    scenarioHeatmap: [],
    driverSensitivityRanking: [],
    auditTrail: {
      entries: [],
      incomplete: true,
      metadata: {
        engineVersion: PATH_SIM_ENGINE_VERSION,
        strategiesSimulated: 0,
        simulationsPerStrategy: simsPerStrategy,
        totalSimulations: 0,
        horizonYears: 0,
        targetFireYear: null,
        seed,
        runtimeMs: Date.now() - startedAt,
      },
    },
    canonicalFireSnapshot: canonicalFire,
  };
}

function buildAudit(
  strategies: PathStrategyResult[],
  seed: number,
  simsPerStrategy: number,
  horizonYears: number,
  targetFireYear: number | null,
  startedAt: number,
): PathSimulationAuditSection {
  const entries: PathSimulationAuditEntry[] = strategies.map(s => ({
    id: `path-sim-${s.scenarioId}`,
    label: s.label,
    enginesUsed: s.enginesUsed,
    inputsUsed: [
      "snapshot.ppor, snapshot.cash, snapshot.offset_balance, snapshot.super_balance",
      "snapshot.stocks, snapshot.crypto, snapshot.mortgage, snapshot.other_debts",
      "selectMonthlyIncome(ledger), selectMonthlyExpensesLedger(ledger)",
      "mc_fire_settings (means + vols + event probs)",
      "Sprint 7 scenarios (recommendations, frontier, ranked) for strategy selection",
    ],
    assumptions: [
      `seed = ${seed}`,
      `simulationsPerStrategy = ${s.simulationsRun}`,
      `horizonYears = ${s.horizonYears}`,
      `targetFireYear = ${s.targetFireYear ?? "—"}`,
      `engine = fireMonteCarlo.runFireMonteCarlo (Sprint 3B+ with correlated draws)`,
    ],
    howCalculated:
      `For each strategy, ran ${s.simulationsRun} full life-paths via runFireMonteCarlo, ` +
      `each with mean/std-dev draws on stocks, property, crypto, super, inflation, mortgage-rate ` +
      `(per fireMonteCarlo Sprint 3B engine). Strategy dimensions tilt the engine MEANS only; ` +
      `volatility & event probabilities remain at engine defaults. Outputs aggregated per-strategy ` +
      `to produce P(FIRE), confidence fan, probability curve, FIRE-year histogram, and rep paths.`,
    incomplete: s.incomplete,
  }));

  const totalSims = strategies.reduce((acc, s) => acc + s.simulationsRun, 0);

  return {
    entries,
    incomplete: strategies.some(s => s.incomplete),
    metadata: {
      engineVersion: PATH_SIM_ENGINE_VERSION,
      strategiesSimulated: strategies.length,
      simulationsPerStrategy: simsPerStrategy,
      totalSimulations: totalSims,
      horizonYears,
      targetFireYear,
      seed,
      runtimeMs: Date.now() - startedAt,
    },
  };
}

/* ─── Formatters (shared with the section component) ─────────────────── */

export function formatPathProbability(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

export function formatPathBand(
  band: PathSimulationBand,
  fmt: "currency" | "currency-per-year" | "year",
): string {
  if (band.incomplete || band.p10 == null || band.p50 == null || band.p90 == null) return "—";
  const fc = (v: number | null) => v == null ? "—" : (
    fmt === "year"
      ? String(v)
      : "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (fmt === "currency-per-year" ? "/yr" : "")
  );
  return `${fc(band.p10)} / ${fc(band.p50)} / ${fc(band.p90)}`;
}
