/**
 * engineTraces/index.ts — Barrel for engine-adjacent audit trace factories.
 *
 * UI surfaces import factories + id constants from this barrel; the audit
 * coverage report imports the id constants directly to enumerate canonical
 * coverage requirements.
 */

export {
  buildAllMonteCarloTraces,
  buildMcP10NwTrace,
  buildMcP50NwTrace,
  buildMcP90NwTrace,
  buildMcConfidenceBandTrace,
  buildMcFireProbabilityTrace,
  buildMcReachGoalProbabilitiesTrace,
  buildMcNegCashflowRiskTrace,
  buildMcCashShortfallRiskTrace,
  buildMcFinancialFreedomTrace,
  buildMcMedianFireYearTrace,
  buildMcP10FireYearTrace,
  buildMcP90FireYearTrace,
  MONTE_CARLO_TRACE_IDS,
} from './monteCarloTraces';

export {
  buildAllDecisionWinnerTraces,
  buildDecisionTotalScoreTrace,
  buildDecisionComponentScoresTrace,
  buildDecisionWeightingsTrace,
  buildDecisionPenaltiesTrace,
  buildDecisionWhyThisRanksTrace,
  buildDecisionWhyNotRankedHigherTrace,
  buildDecisionRecommendationLogicTrace,
  buildAllBestMoveTraces,
  DECISION_WINNER_TRACE_IDS,
  BESTMOVE_TRACE_IDS,
  type DecisionWinnerTraceArgs,
} from './decisionTraces';

export {
  buildAllFireTraces,
  buildFireDateTrace,
  buildFireCapitalTargetTrace,
  buildFireSwrTrace,
  buildFirePassiveGapTrace,
  buildFireTimeSavedLostTrace,
  FIRE_TRACE_IDS,
} from './fireTraces';

export {
  buildAllForecastHeadlineTraces,
  buildForecastNetWorthTrace,
  buildForecastAccessibleNetWorthTrace,
  buildForecastFireCapitalTrace,
  buildForecastLiquidatableWealthTrace,
  buildForecastPropertyEquityTrace,
  buildForecastCashflowTrace,
  buildForecastCagrTrace,
  FORECAST_TRACE_IDS,
  type ForecastHeadlineArgs,
} from './forecastTraces';

export {
  buildAllFinancialHealthTraces,
  buildFinancialHealthLiquidityTrace,
  buildFinancialHealthLeverageTrace,
  buildFinancialHealthCashflowTrace,
  buildFinancialHealthFireProgressTrace,
  buildFinancialHealthOverallTrace,
  buildLegacyRiskCategoryTraces,
  buildLegacyRiskOverallTrace,
  FINANCIAL_HEALTH_TRACE_IDS,
  LEGACY_RISK_RADAR_TRACE_IDS,
} from './financialHealthTraces';

export {
  buildWealthStrategyTraces,
  buildCashBufferTrace,
  buildSavingsRateTrace,
  buildDebtToAssetsTrace,
  buildFreedomProgressTrace,
  WEALTH_STRATEGY_TRACE_IDS,
  type WealthStrategyTraceArgs,
} from './wealthStrategyTraces';
