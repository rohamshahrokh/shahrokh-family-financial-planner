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
  buildAllDecisionCandidateTraces,
  buildDecisionCandidateScoreTrace,
  buildDecisionCandidateComponentTrace,
  buildDecisionCandidatePenaltiesTrace,
  buildDecisionCandidateRationaleTrace,
  buildDecisionRankingLogicTrace,
  buildDecisionTradeoffsTrace,
  buildDecisionLensTrace,
  DECISION_WINNER_TRACE_IDS,
  DECISION_EXTENDED_TRACE_IDS,
  BESTMOVE_TRACE_IDS,
  type DecisionWinnerTraceArgs,
  type DecisionCandidateTraceArgs,
  type DecisionRankingLogicTraceArgs,
  type DecisionTradeoffsTraceArgs,
  type DecisionLensTraceArgs,
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
  buildLiveFinancialHealthTracesFromRiskRadar,
  FINANCIAL_HEALTH_TRACE_IDS,
  LEGACY_RISK_RADAR_TRACE_IDS,
} from './financialHealthTraces';

export {
  buildWealthStrategyTraces,
  buildCashBufferTrace,
  buildSavingsRateTrace,
  buildDebtToAssetsTrace,
  buildFreedomProgressTrace,
  buildNetPositionTrace,
  WEALTH_STRATEGY_TRACE_IDS,
  type WealthStrategyTraceArgs,
} from './wealthStrategyTraces';

export {
  buildAllPropertyPortfolioTraces,
  buildPropertyValueTrace,
  buildPropertyLoansTrace,
  buildPropertyPortfolioEquityTrace,
  buildPropertyLvrTrace,
  buildPropertyCashflowTrace,
  PROPERTY_TRACE_IDS,
  type PropertyPortfolioTraceArgs,
} from './propertyTraces';

export {
  buildAllFundingTraces,
  buildFundingSourceUsedTrace,
  buildCashImpactTrace,
  buildEquityReleaseTrace,
  buildEmergencyBufferTrace,
  buildNegativeGearingTrace,
  FUNDING_SOURCE_TRACE_IDS,
  type FundingTraceArgs,
} from './fundingSourceTraces';

export {
  buildCashflowYearTrace,
  cashflowYearTraceId,
  type CashflowYearTraceArgs,
} from './cashflowChartTraces';
