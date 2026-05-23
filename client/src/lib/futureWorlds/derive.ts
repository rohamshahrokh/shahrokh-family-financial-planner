/**
 * Future Worlds — derivation layer (presentation only).
 *
 * Folds the raw scenario-tree branches produced by the Scenario Tree engine
 * into the three macro worlds (Bear / Base / Bull) plus the executive
 * summary and sensitivity map that the Future Worlds panel renders.
 *
 * This module NEVER recalculates portfolio outputs — it consumes the
 * canonical `ScenarioTreeResult` and re-shapes it for human consumption.
 * No engine math is duplicated; no Monte Carlo paths are generated.
 */
import type {
  MacroRegimeId,
  ScenarioBranch,
  ScenarioTreeResult,
} from '@/lib/scenarioTree';

export type WorldKind = 'bear' | 'base' | 'bull';

export interface DerivedWorld {
  kind: WorldKind;
  metricId: 'bear-world' | 'base-world' | 'bull-world';
  label: string;
  probability: number;                 // 0..1
  expectedNetWorth?: number;
  fireYear?: number;
  stressLevel: number;                 // 0..100
  liquidityRisk?: number;              // 0..1
  insolvencyRisk?: number;             // 0..1
  keyDriver: string;
  posture: string;
  whatChanges: string;
  underTheHood: string[];              // "mortgage rates +1.5%", etc.
  netWorthBand?: { p10: number; p90: number };
  contributingRegimes: Array<{ id: MacroRegimeId; label: string; probability: number }>;
}

export type SensitivityLevel = 'High' | 'Medium' | 'Low';

export interface SensitivityRow {
  id: 'rates' | 'property' | 'equity' | 'inflation' | 'employment';
  metricId: 'portfolio-sensitivity';
  label: string;
  level: SensitivityLevel;
  why: string;
}

export interface ExecutiveSummary {
  commentary: string;
  strongestTailwind?: { label: string; probability: number };
  largestVulnerability?: { label: string; probability: number };
  resilience: { score: number; band: 'Strong' | 'Sound' | 'Workable' | 'Fragile' | 'Brittle' };
  dominantCluster: WorldKind;
}

export interface FutureWorldsModel {
  summary: ExecutiveSummary;
  worlds: { bear: DerivedWorld; base: DerivedWorld; bull: DerivedWorld };
  sensitivity: SensitivityRow[];
  weightedNetWorth?: number;
  horizonYears?: number;
}

// Regime → world mapping. Each branch contributes to exactly one cluster.
// "Base" carries the mild / soft regimes that don't materially shift the plan.
const BEAR_REGIMES: MacroRegimeId[] = [
  'recession',
  'stagflation',
  'inflation_spike',
  'equity_crash',
  'crypto_winter',
  'property_downturn',
  'employment_shock',
];
const BULL_REGIMES: MacroRegimeId[] = [
  'ai_boom',
  'equity_bull',
  'crypto_supercycle',
  'property_supercycle',
];
const BASE_REGIMES: MacroRegimeId[] = [
  'rate_cuts',
  'rate_hikes',
  'inflation_collapse',
  'strong_wage_growth',
];

function classifyRegime(id: MacroRegimeId): WorldKind {
  if (BEAR_REGIMES.includes(id)) return 'bear';
  if (BULL_REGIMES.includes(id)) return 'bull';
  if (BASE_REGIMES.includes(id)) return 'base';
  return 'base';
}

function safeRound(n: number | undefined): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function probabilityWeightedAverage(
  branches: ScenarioBranch[],
  pick: (b: ScenarioBranch) => number | undefined,
): number | undefined {
  let pSum = 0;
  let acc = 0;
  for (const b of branches) {
    const v = pick(b);
    if (v == null || !Number.isFinite(v)) continue;
    acc += v * b.probability;
    pSum += b.probability;
  }
  if (pSum <= 0) return undefined;
  return acc / pSum;
}

function aggregateCluster(
  branches: ScenarioBranch[],
  kind: WorldKind,
  /** Carried for callers when the tree contains zero matching regimes — never preempts a real total. */
  fallbackProbability: number,
): {
  branches: ScenarioBranch[];
  probability: number;
  expectedNetWorth?: number;
  fireYear?: number;
  liquidityRisk?: number;
  insolvencyRisk?: number;
  netWorthBand?: { p10: number; p90: number };
  dominant?: ScenarioBranch;
  effectiveRates?: ScenarioBranch['effectiveRates'];
} {
  const members = branches.filter((b) => classifyRegime(b.id) === kind);
  if (members.length === 0) {
    return {
      branches: [],
      probability: fallbackProbability,
    };
  }
  const probability = members.reduce((a, b) => a + b.probability, 0);
  const expectedNetWorth = safeRound(probabilityWeightedAverage(members, (b) => b.expectedNetWorth));
  const fireYear = probabilityWeightedAverage(members, (b) => b.fireYear);
  const liquidityRisk = probabilityWeightedAverage(members, (b) => b.liquidityRisk);
  const insolvencyRisk = probabilityWeightedAverage(members, (b) => b.insolvencyRisk);
  const effRates = {
    propertyGrowth: probabilityWeightedAverage(members, (b) => b.effectiveRates.propertyGrowth) ?? 0,
    etfReturn: probabilityWeightedAverage(members, (b) => b.effectiveRates.etfReturn) ?? 0,
    cryptoReturn: probabilityWeightedAverage(members, (b) => b.effectiveRates.cryptoReturn) ?? 0,
    inflation: probabilityWeightedAverage(members, (b) => b.effectiveRates.inflation) ?? 0,
    mortgageRate: probabilityWeightedAverage(members, (b) => b.effectiveRates.mortgageRate) ?? 0,
  };
  let band: { p10: number; p90: number } | undefined;
  if (expectedNetWorth != null) {
    const p10s = members.map((b) => b.netWorthBand?.p10).filter((v): v is number => v != null);
    const p90s = members.map((b) => b.netWorthBand?.p90).filter((v): v is number => v != null);
    if (p10s.length > 0 && p90s.length > 0) {
      band = { p10: Math.min(...p10s), p90: Math.max(...p90s) };
    }
  }
  const dominant = [...members].sort((a, b) => b.probability - a.probability)[0];
  return {
    branches: members,
    probability,
    expectedNetWorth,
    fireYear,
    liquidityRisk,
    insolvencyRisk,
    netWorthBand: band,
    dominant,
    effectiveRates: effRates,
  };
}

const WORLD_LABEL: Record<WorldKind, string> = {
  bear: 'Bear World',
  base: 'Base World',
  bull: 'Bull World',
};

const WORLD_POSTURE: Record<WorldKind, string> = {
  bear: 'Maintain higher offset liquidity. Defer non-essential growth deployments until the regime confirms.',
  base: 'Continue balanced DCA at safe-surplus cap. Hold target allocation; rebalance on drift, not on news.',
  bull: 'Accelerate growth allocation incrementally. Avoid chasing — let pre-defined rules deploy dry powder.',
};

const WORLD_WHAT_CHANGES: Record<WorldKind, string> = {
  bear: 'Returns compress, debt servicing tightens and the FIRE timeline drifts. The plan still survives if buffer holds.',
  base: 'Inputs evolve close to today\'s assumptions. The plan tracks toward goal without a regime change.',
  bull: 'Returns compound above trend. The plan pulls forward — but the worst mistake is over-extrapolating from one regime.',
};

function describeUnderTheHood(
  kind: WorldKind,
  base: ScenarioBranch['effectiveRates'] | undefined,
  cluster: ScenarioBranch['effectiveRates'] | undefined,
): string[] {
  if (!base || !cluster) {
    return defaultUnderTheHood(kind);
  }
  const items: string[] = [];
  const pp = (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`;
  const dRate = cluster.mortgageRate - base.mortgageRate;
  if (Math.abs(dRate) >= 0.0025) items.push(`mortgage rates ${pp(dRate)}`);
  const dProp = cluster.propertyGrowth - base.propertyGrowth;
  if (Math.abs(dProp) >= 0.0025) items.push(`property growth ${pp(dProp)}`);
  const dEtf = cluster.etfReturn - base.etfReturn;
  if (Math.abs(dEtf) >= 0.0025) items.push(`ETF expected return ${pp(dEtf)}`);
  const dInf = cluster.inflation - base.inflation;
  if (Math.abs(dInf) >= 0.0025) items.push(`inflation ${pp(dInf)}`);
  const dCry = cluster.cryptoReturn - base.cryptoReturn;
  if (Math.abs(dCry) >= 0.005) items.push(`crypto expected return ${pp(dCry)}`);
  if (items.length === 0) return defaultUnderTheHood(kind);
  if (kind === 'bear') {
    items.push('serviceability buffer widened');
  } else if (kind === 'bull') {
    items.push('serviceability buffer narrowed to release deployable surplus');
  }
  return items;
}

function defaultUnderTheHood(kind: WorldKind): string[] {
  if (kind === 'bear') {
    return [
      'mortgage rates +1.5pp',
      'property growth reduced toward 2%',
      'ETF expected return reduced toward 5%',
      'unemployment risk widened',
      'serviceability buffer widened',
    ];
  }
  if (kind === 'bull') {
    return [
      'mortgage rates -1.0pp',
      'property growth lifted toward 7%',
      'ETF expected return lifted toward 10%',
      'serviceability buffer narrowed to release deployable surplus',
    ];
  }
  return [
    'no regime change vs today',
    'rates, growth and inflation evolve to long-run averages',
    'serviceability and buffer assumptions unchanged',
  ];
}

function clusterStress(
  kind: WorldKind,
  liquidityRisk?: number,
  insolvencyRisk?: number,
  rateMove?: number,
): number {
  const baseStress = kind === 'bear' ? 50 : kind === 'base' ? 22 : 12;
  const liq = (liquidityRisk ?? 0) * 100;
  const ins = (insolvencyRisk ?? 0) * 100;
  const rate = Math.max(0, (rateMove ?? 0)) * 600;
  return Math.max(0, Math.min(100, Math.round(baseStress * 0.6 + liq * 0.25 + ins * 0.25 + rate)));
}

function buildWorld(
  tree: ScenarioTreeResult,
  baseRates: ScenarioBranch['effectiveRates'] | undefined,
  kind: WorldKind,
): DerivedWorld {
  const cluster = aggregateCluster(tree.branches, kind, kind === 'base' ? 0.5 : 0.25);
  const rateMove = cluster.effectiveRates && baseRates
    ? cluster.effectiveRates.mortgageRate - baseRates.mortgageRate
    : 0;
  const stress = clusterStress(kind, cluster.liquidityRisk, cluster.insolvencyRisk, rateMove);
  const dominant = cluster.dominant;
  const keyDriver = dominant?.keyDriver ?? (
    kind === 'bear' ? 'compounded macro stress' :
      kind === 'bull' ? 'supportive macro tailwind' :
        'baseline regime continues'
  );

  return {
    kind,
    metricId: kind === 'bear' ? 'bear-world' : kind === 'bull' ? 'bull-world' : 'base-world',
    label: WORLD_LABEL[kind],
    probability: cluster.probability,
    expectedNetWorth: cluster.expectedNetWorth,
    fireYear: cluster.fireYear != null ? Math.round(cluster.fireYear) : undefined,
    stressLevel: stress,
    liquidityRisk: cluster.liquidityRisk,
    insolvencyRisk: cluster.insolvencyRisk,
    keyDriver,
    posture: WORLD_POSTURE[kind],
    whatChanges: WORLD_WHAT_CHANGES[kind],
    underTheHood: describeUnderTheHood(kind, baseRates, cluster.effectiveRates),
    netWorthBand: cluster.netWorthBand,
    contributingRegimes: cluster.branches
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 4)
      .map((b) => ({ id: b.id, label: b.label, probability: b.probability })),
  };
}

export interface DerivationContext {
  /** Today's net worth — drives sensitivity calls when available. */
  baseNetWorth?: number;
  /** Mortgage balance (any currency unit — used relative to net worth). */
  mortgageBalance?: number;
  /** Property weight in the portfolio (0..1). */
  propertyWeight?: number;
  /** Equity / ETF weight (0..1). */
  equityWeight?: number;
  /** Crypto weight (0..1). */
  cryptoWeight?: number;
  /** Months of expenses currently covered by liquid buffer. */
  bufferMonths?: number;
  /** Income concentration — share of household income from the single largest source (0..1). */
  incomeConcentration?: number;
}

function bandFor(score: number): ExecutiveSummary['resilience']['band'] {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Sound';
  if (score >= 40) return 'Workable';
  if (score >= 20) return 'Fragile';
  return 'Brittle';
}

function level(
  score: number,
  highAt: number,
  mediumAt: number,
): SensitivityLevel {
  if (score >= highAt) return 'High';
  if (score >= mediumAt) return 'Medium';
  return 'Low';
}

function buildSensitivity(ctx: DerivationContext | undefined): SensitivityRow[] {
  const leverage = (() => {
    if (!ctx?.baseNetWorth || !ctx.mortgageBalance) return undefined;
    if (ctx.baseNetWorth <= 0) return undefined;
    return ctx.mortgageBalance / ctx.baseNetWorth;
  })();
  const propertyWeight = ctx?.propertyWeight;
  const equityWeight = ctx?.equityWeight;
  const buffer = ctx?.bufferMonths;
  const incomeConc = ctx?.incomeConcentration;

  const rateScore = leverage != null ? leverage : 1.0;
  const propertyScore = propertyWeight != null ? propertyWeight : 0.55;
  const equityScore = equityWeight != null ? equityWeight : 0.25;
  const inflationScore = leverage != null ? leverage * 0.6 : 0.55;
  const employmentScore = (() => {
    const incomeFactor = incomeConc != null ? incomeConc : 0.85;
    const bufferFactor = buffer != null ? Math.max(0, Math.min(1, 1 - buffer / 6)) : 0.55;
    return Math.min(1, 0.5 * incomeFactor + 0.5 * bufferFactor);
  })();

  return [
    {
      id: 'rates',
      metricId: 'portfolio-sensitivity',
      label: 'Interest rates',
      level: level(rateScore, 1.0, 0.45),
      why: leverage != null
        ? `Mortgage equal to ~${(leverage * 100).toFixed(0)}% of net worth — each +1pp on the rate compresses serviceability and net worth growth.`
        : 'Significant household leverage means rate persistence is the dominant variable for serviceability and net worth growth.',
    },
    {
      id: 'property',
      metricId: 'portfolio-sensitivity',
      label: 'Property cycle',
      level: level(propertyScore, 0.55, 0.30),
      why: propertyWeight != null
        ? `Property accounts for ~${(propertyWeight * 100).toFixed(0)}% of the asset base — a multi-year correction would drag household compounding.`
        : 'Property is the largest single asset class — a downturn weakens the household balance sheet and PPOR equity.',
    },
    {
      id: 'equity',
      metricId: 'portfolio-sensitivity',
      label: 'Equity market',
      level: level(equityScore, 0.50, 0.20),
      why: equityWeight != null
        ? `Equities at ~${(equityWeight * 100).toFixed(0)}% of the portfolio — drawdowns hit the liquid sleeve but not serviceability.`
        : 'The equity sleeve is sized for compounding, not income — drawdowns hurt morale more than cashflow.',
    },
    {
      id: 'inflation',
      metricId: 'portfolio-sensitivity',
      label: 'Inflation',
      level: level(inflationScore, 0.70, 0.35),
      why: 'Persistent CPI lifts mortgage rates and expense base. Real assets (property + equities) partially hedge — cash holdings do not.',
    },
    {
      id: 'employment',
      metricId: 'portfolio-sensitivity',
      label: 'Employment shock',
      level: level(employmentScore, 0.65, 0.35),
      why: buffer != null
        ? `Liquid buffer covers ~${buffer.toFixed(1)} months of expenses — anything below 6 months leaves the plan exposed to extended income disruption.`
        : 'Income concentration in a single household source increases exposure to extended unemployment or income disruption.',
    },
  ];
}

function buildExecutiveSummary(
  worlds: { bear: DerivedWorld; base: DerivedWorld; bull: DerivedWorld },
  sensitivity: SensitivityRow[],
  ctx: DerivationContext | undefined,
): ExecutiveSummary {
  const sortedWorlds = [worlds.base, worlds.bull, worlds.bear].sort((a, b) => b.probability - a.probability);
  const dominantWorld = sortedWorlds[0].kind;

  const baseNw = ctx?.baseNetWorth ?? 0;
  const bearNw = worlds.bear.expectedNetWorth ?? baseNw;
  const drawdown = baseNw > 0 ? Math.max(0, (baseNw - bearNw) / baseNw) : 0.25;
  const bufferMonths = ctx?.bufferMonths ?? 3;
  const liquidityScore = Math.max(0, Math.min(100, (bufferMonths / 6) * 100));
  const drawdownScore = Math.max(0, Math.min(100, (1 - Math.min(drawdown, 0.6) / 0.6) * 100));
  const probScore = (worlds.base.probability + worlds.bull.probability * 0.5) * 100;
  const resilienceScore = Math.round(0.5 * drawdownScore + 0.3 * liquidityScore + 0.2 * probScore);

  const highSens = sensitivity.filter((s) => s.level === 'High').map((s) => s.label.toLowerCase());
  const vulnLabel = highSens[0]
    ?? sensitivity.filter((s) => s.level === 'Medium')[0]?.label.toLowerCase()
    ?? 'interest-rate shocks';
  const tailwindLabel = worlds.bull.contributingRegimes[0]?.label?.toLowerCase() ?? 'supportive policy backdrop';

  const commentary = (() => {
    if (dominantWorld === 'bear') {
      return `Plan is most sensitive to ${vulnLabel} and leverage compression. Bear cluster carries the dominant probability — keep buffer high and avoid new long-duration risk.`;
    }
    if (dominantWorld === 'bull') {
      return `Portfolio is positioned to capture ${tailwindLabel}, with residual exposure to ${vulnLabel}. Pre-stage the growth posture without abandoning the base plan.`;
    }
    return `Base case continues to compound through ${tailwindLabel}; the largest single vulnerability remains ${vulnLabel}. Stay disciplined; mitigate the dominant exposure before optimising.`;
  })();

  const tailwindContrib = worlds.bull.contributingRegimes[0];
  const vulnContrib = worlds.bear.contributingRegimes[0];

  return {
    commentary,
    strongestTailwind: tailwindContrib
      ? { label: tailwindContrib.label, probability: tailwindContrib.probability }
      : undefined,
    largestVulnerability: vulnContrib
      ? { label: vulnContrib.label, probability: vulnContrib.probability }
      : undefined,
    resilience: { score: resilienceScore, band: bandFor(resilienceScore) },
    dominantCluster: dominantWorld,
  };
}

export function deriveFutureWorlds(
  tree: ScenarioTreeResult,
  ctx?: DerivationContext,
  baseRates?: ScenarioBranch['effectiveRates'],
): FutureWorldsModel {
  const resolvedBase = baseRates ?? inferBaseRates(tree);

  const bear = buildWorld(tree, resolvedBase, 'bear');
  const base = buildWorld(tree, resolvedBase, 'base');
  const bull = buildWorld(tree, resolvedBase, 'bull');

  // Probabilities must sum to 1.0 — if the base cluster has zero matching
  // regimes (engine subset call), top it up so the three cards still sum.
  const total = bear.probability + base.probability + bull.probability;
  if (total > 0 && Math.abs(total - 1) > 1e-6) {
    const scale = 1 / total;
    bear.probability *= scale;
    base.probability *= scale;
    bull.probability *= scale;
  }

  const worlds = { bear, base, bull };
  const sensitivity = buildSensitivity(ctx);
  const summary = buildExecutiveSummary(worlds, sensitivity, ctx);

  return {
    summary,
    worlds,
    sensitivity,
    weightedNetWorth: tree.baseProbabilityWeighted.netWorth,
  };
}

/**
 * Recover the baseline effective rates by averaging across all branches with
 * their probability weights — used when the caller doesn't pass an explicit
 * baseline. The result is the "neutral" macro path the cluster deltas are
 * measured against.
 */
function inferBaseRates(tree: ScenarioTreeResult): ScenarioBranch['effectiveRates'] {
  const pick = (k: keyof ScenarioBranch['effectiveRates']) =>
    probabilityWeightedAverage(tree.branches, (b) => b.effectiveRates[k]) ?? 0;
  return {
    propertyGrowth: pick('propertyGrowth'),
    etfReturn: pick('etfReturn'),
    cryptoReturn: pick('cryptoReturn'),
    inflation: pick('inflation'),
    mortgageRate: pick('mortgageRate'),
  };
}
