/**
 * Scenario Tree Engine — macro regime definitions and outputs.
 *
 * Used by the Future Worlds panel and to provide branch-level context to
 * Recommendation Engine V2 (e.g. tilt confidence under stress regimes).
 */

export type MacroRegimeId =
  | 'inflation_spike'
  | 'inflation_collapse'
  | 'rate_cuts'
  | 'rate_hikes'
  | 'recession'
  | 'stagflation'
  | 'ai_boom'
  | 'property_downturn'
  | 'property_supercycle'
  | 'equity_bull'
  | 'equity_crash'
  | 'crypto_winter'
  | 'crypto_supercycle'
  | 'employment_shock'
  | 'strong_wage_growth';

export interface MacroRegimeImpact {
  propertyGrowthDelta?: number;       // pp added to baseline growth
  rentGrowthDelta?: number;
  interestRateDelta?: number;
  etfReturnDelta?: number;
  cryptoReturnDelta?: number;
  inflationDelta?: number;
  expensesMultiplier?: number;        // e.g. 1.08 = +8% expense shock
  serviceabilityDelta?: number;       // pp serviceability headroom
  unemploymentProbDelta?: number;     // 0..1 added probability
  fireTimelineYearsDelta?: number;    // ± years to FIRE
  liquidityRiskDelta?: number;        // 0..1 added liquidity risk
}

export interface MacroRegimeDefinition {
  id: MacroRegimeId;
  label: string;
  description: string;
  defaultProbability: number;         // baseline probability 0..1
  impact: MacroRegimeImpact;
  keyDriver: string;
}

export interface ScenarioBranchInputs {
  baseNetWorth?: number;
  basePropertyGrowth?: number;        // 0..1
  baseEtfReturn?: number;
  baseCryptoReturn?: number;
  baseInflation?: number;
  baseMortgageRate?: number;
  baseMonthlyExpenses?: number;
  baseFireYears?: number;
  horizonYears?: number;
  // Optional probability overrides keyed by regime id (0..1).
  regimeProbabilities?: Partial<Record<MacroRegimeId, number>>;
}

export interface ScenarioBranch {
  id: MacroRegimeId;
  label: string;
  probability: number;                // 0..1, re-normalised
  expectedNetWorth?: number;
  fireYear?: number;
  liquidityRisk?: number;             // 0..1
  insolvencyRisk?: number;            // 0..1
  keyDriver: string;
  effectiveRates: {
    propertyGrowth: number;
    etfReturn: number;
    cryptoReturn: number;
    inflation: number;
    mortgageRate: number;
  };
  /** Confidence range for expected net worth (10/90). */
  netWorthBand?: { p10: number; p90: number };
  narrative: string;
}

export interface ScenarioTreeResult {
  baseProbabilityWeighted: {
    netWorth?: number;
    fireYear?: number;
    liquidityRisk?: number;
    insolvencyRisk?: number;
  };
  branches: ScenarioBranch[];
  regimeTimeline: Array<{ year: number; topRegimes: Array<{ id: MacroRegimeId; probability: number }> }>;
  generatedAt: string;
}
