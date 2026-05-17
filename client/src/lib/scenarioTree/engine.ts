/**
 * Scenario Tree Engine — builds probability-weighted future branches.
 *
 * Deterministic compounding model — not a Monte Carlo replacement. Used to
 * surface the Future Worlds panel and feed regime-aware context into
 * Recommendation Engine V2 ranking (via signals, not parallel advice).
 */

import { MACRO_REGIMES } from './regimes';
import type {
  MacroRegimeDefinition,
  MacroRegimeId,
  ScenarioBranch,
  ScenarioBranchInputs,
  ScenarioTreeResult,
} from './types';

const PANEL_BRANCHES: MacroRegimeId[] = [
  'rate_cuts',        // Base / supportive
  'ai_boom',          // Bull
  'equity_crash',     // Bear
  'inflation_spike',  // Inflation
  'property_downturn',// Property crash
  'rate_hikes',       // Rate-hike stress
  'recession',
  'stagflation',
  'property_supercycle',
  'employment_shock',
  'strong_wage_growth',
  'crypto_supercycle',
  'crypto_winter',
  'equity_bull',
  'inflation_collapse',
];

const PANEL_FAVOURITE: MacroRegimeId[] = [
  'rate_cuts', 'ai_boom', 'equity_crash', 'inflation_spike', 'property_downturn', 'rate_hikes',
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function compoundNetWorth(
  base: number,
  effective: ScenarioBranch['effectiveRates'],
  horizon: number,
): number {
  // Weighted blended growth — rough approximation across asset mix.
  const blend = 0.5 * effective.etfReturn + 0.4 * effective.propertyGrowth + 0.1 * effective.cryptoReturn;
  const real = blend - effective.inflation * 0.4;
  const factor = Math.pow(1 + real, horizon);
  return Math.round(base * factor);
}

function buildBranch(
  regime: MacroRegimeDefinition,
  probability: number,
  i: Required<ScenarioBranchInputs>,
): ScenarioBranch {
  const eff = {
    propertyGrowth: i.basePropertyGrowth + (regime.impact.propertyGrowthDelta ?? 0),
    etfReturn: i.baseEtfReturn + (regime.impact.etfReturnDelta ?? 0),
    cryptoReturn: i.baseCryptoReturn + (regime.impact.cryptoReturnDelta ?? 0),
    inflation: Math.max(0, i.baseInflation + (regime.impact.inflationDelta ?? 0)),
    mortgageRate: Math.max(0, i.baseMortgageRate + (regime.impact.interestRateDelta ?? 0)),
  };
  const expectedNetWorth = i.baseNetWorth > 0 ? compoundNetWorth(i.baseNetWorth, eff, i.horizonYears) : undefined;
  const fireYearDelta = regime.impact.fireTimelineYearsDelta ?? 0;
  const liquidityRisk = clamp(0.1 + (regime.impact.liquidityRiskDelta ?? 0), 0, 1);
  const unemploymentBoost = regime.impact.unemploymentProbDelta ?? 0;
  const insolvencyRisk = clamp(liquidityRisk * 0.3 + unemploymentBoost * 0.6, 0, 1);

  const band = expectedNetWorth != null ? {
    p10: Math.round(expectedNetWorth * 0.7),
    p90: Math.round(expectedNetWorth * 1.3),
  } : undefined;

  return {
    id: regime.id,
    label: regime.label,
    probability,
    expectedNetWorth,
    fireYear: i.baseFireYears != null ? Math.max(0, i.baseFireYears + fireYearDelta) : undefined,
    liquidityRisk,
    insolvencyRisk,
    keyDriver: regime.keyDriver,
    effectiveRates: eff,
    netWorthBand: band,
    narrative: `${regime.description} Real return blend ${(eff.etfReturn * 100).toFixed(1)}% ETF / ${(eff.propertyGrowth * 100).toFixed(1)}% property after ${i.horizonYears}yr.`,
  };
}

const DEFAULT_INPUTS: Required<ScenarioBranchInputs> = {
  baseNetWorth: 0,
  basePropertyGrowth: 0.05,
  baseEtfReturn: 0.07,
  baseCryptoReturn: 0.12,
  baseInflation: 0.025,
  baseMortgageRate: 0.06,
  baseMonthlyExpenses: 0,
  baseFireYears: 15,
  horizonYears: 10,
  regimeProbabilities: {},
};

function fillInputs(i: ScenarioBranchInputs | undefined | null): Required<ScenarioBranchInputs> {
  return {
    ...DEFAULT_INPUTS,
    ...(i ?? {}),
    regimeProbabilities: i?.regimeProbabilities ?? {},
  };
}

export function buildScenarioTree(
  inputs: ScenarioBranchInputs | undefined | null,
  regimeIds: MacroRegimeId[] = PANEL_BRANCHES,
): ScenarioTreeResult {
  const i = fillInputs(inputs);
  const defs = regimeIds.map((id) => MACRO_REGIMES[id]).filter(Boolean);
  const rawProbs = defs.map((d) => i.regimeProbabilities[d.id] ?? d.defaultProbability);
  const total = rawProbs.reduce((a, b) => a + b, 0) || 1;
  const norm = rawProbs.map((p) => p / total);

  const branches = defs.map((d, idx) => buildBranch(d, norm[idx], i));
  branches.sort((a, b) => b.probability - a.probability);

  const probWeighted = {
    netWorth: branches.reduce((a, b) => a + (b.expectedNetWorth ?? 0) * b.probability, 0),
    fireYear: branches.reduce((a, b) => a + (b.fireYear ?? 0) * b.probability, 0),
    liquidityRisk: branches.reduce((a, b) => a + (b.liquidityRisk ?? 0) * b.probability, 0),
    insolvencyRisk: branches.reduce((a, b) => a + (b.insolvencyRisk ?? 0) * b.probability, 0),
  };

  const regimeTimeline: ScenarioTreeResult['regimeTimeline'] = [];
  for (let y = 1; y <= Math.min(i.horizonYears, 10); y++) {
    const topRegimes = [...branches]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3)
      .map((b) => ({ id: b.id, probability: b.probability }));
    regimeTimeline.push({ year: y, topRegimes });
  }

  return {
    baseProbabilityWeighted: probWeighted,
    branches,
    regimeTimeline,
    generatedAt: new Date().toISOString(),
  };
}

/** Compact list for the UI panel. */
export function futureWorldsPanel(inputs: ScenarioBranchInputs | undefined | null): ScenarioBranch[] {
  const r = buildScenarioTree(inputs, PANEL_FAVOURITE);
  return r.branches;
}

export { MACRO_REGIMES, PANEL_BRANCHES, PANEL_FAVOURITE };
