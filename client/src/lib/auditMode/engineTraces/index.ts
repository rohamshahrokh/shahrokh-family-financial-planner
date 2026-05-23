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
  CASHFLOW_PLAN_EXECUTION_TRACE_IDS,
  CASHFLOW_PLAN_EXECUTION_YEAR_RANGE,
  type CashflowYearTraceArgs,
} from './cashflowChartTraces';

export {
  buildCashflowReconciliationTrace,
  cashflowReconciliationTraceId,
  CASHFLOW_RECONCILIATION_TRACE_IDS,
  CASHFLOW_RECONCILIATION_YEAR_RANGE,
  type CashflowReconciliationTraceArgs,
} from './cashflowReconciliationTraces';

export {
  buildPlanFeasibilityTrace,
  PLAN_FEASIBILITY_TRACE_ID,
  type PlanFeasibilityTraceArgs,
} from './planFeasibilityTraces';

export {
  buildFundingResolutionTrace,
  FUNDING_RESOLUTION_TRACE_ID,
  type FundingResolutionTraceArgs,
} from './fundingResolutionTraces';

export {
  buildUserDefaultTrace,
  registerUserDefaultsTraces,
} from './userDefaultsTraces';

export {
  buildIncomeClassificationTrace,
  INCOME_ENGINE_TRACE_ID,
  INCOME_ENGINE_APPLIED_MODULES,
  type IncomeEngineTraceArgs,
} from './incomeClassificationTraces';
