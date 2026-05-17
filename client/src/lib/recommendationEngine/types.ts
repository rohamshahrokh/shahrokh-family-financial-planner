/**
 * Recommendation System V2 — Unified Strategic Brain
 *
 * Canonical TypeScript contract for cross-surface recommendations. Every
 * surface (Best Move, Action Centre, FIRE Optimizer, Risk Radar, Deposit
 * Power) consumes records that satisfy this contract so advice is never
 * contradictory across the app.
 *
 * Design intent:
 *   - Optional fields throughout. Real inputs come from canonical selectors,
 *     ledger snapshot, Monte Carlo V4/V5 and the Decision Engine — but each
 *     of those may be unwired at call-time. The engine degrades gracefully.
 *   - Hard safety constraints (priority stack) always apply, regardless of
 *     investor preference weighting.
 */

export type ActionType =
  | 'build_emergency_buffer'
  | 'pay_high_interest_debt'
  | 'hold_cash_offset'
  | 'etf_dca'
  | 'crypto_dca'
  | 'increase_super'
  | 'delay_property_purchase'
  | 'proceed_property_purchase'
  | 'refinance_restructure'
  | 'reduce_leverage'
  | 'rebalance_portfolio'
  | 'pause_investing'
  | 'improve_cashflow'
  | 'tax_optimisation'
  | 'fire_acceleration';

export type Urgency = 'immediate' | 'this_quarter' | 'this_year' | 'monitor';

export type RiskLevel = 'Low' | 'Med' | 'High';

export type StrategicPillar =
  | 'prevent_failure'        // catastrophic risk: insolvency, foreclosure
  | 'protect_liquidity'      // emergency buffer, cash runway
  | 'reduce_high_interest_debt'
  | 'stabilise_leverage'     // serviceability, LVR
  | 'preserve_tax_efficiency'
  | 'maintain_investing_discipline'
  | 'improve_fire_timeline'
  | 'maximise_wealth';

export type SourceSignal =
  | 'snapshot'
  | 'ledger_income_expense'
  | 'debt_balances'
  | 'cash_offset'
  | 'property_readiness'
  | 'monte_carlo_v4'
  | 'monte_carlo_v5'
  | 'decision_engine'
  | 'fire_engine'
  | 'risk_engine'
  | 'household_tax'
  | 'investor_preference';

export interface QuantifiedImpact {
  /** Expected annual $ benefit (positive) or $ cost (negative). */
  annualDollar?: number;
  /** % expected return for the action where applicable (e.g. ETF DCA). */
  expectedReturnPct?: number;
  /** After-tax expected return where computable. */
  afterTaxReturnPct?: number;
  /** Confidence band 0-1. */
  confidence?: number;
  /** Human-readable label e.g. "$8,400/yr guaranteed". */
  label?: string;
}

export interface LiquidityImpact {
  /** Net change to deployable cash. Negative = locks cash up. */
  deltaDeployableCash?: number;
  /** Months of runway change. */
  deltaRunwayMonths?: number;
}

export interface RecommendationStep {
  step: string;
  detail?: string;
  route?: string;
}

export interface AlternativeOption {
  title: string;
  whyAlternative: string;
  tradeoff: string;
}

export interface ReviewTrigger {
  /** Trigger condition in plain English. */
  condition: string;
  /** Earliest date to re-evaluate (ISO). */
  reviewByISO?: string;
  /** Signal IDs that, when changed, should re-run the engine. */
  watchSignals?: SourceSignal[];
}

export interface Recommendation {
  id: string;
  title: string;
  actionType: ActionType;
  pillar: StrategicPillar;

  /** Numeric rank — lower = more important. Hard safety wins always rank 1-2. */
  priorityRank: number;
  /** 0-1, derived from signal coverage + magnitude of supporting evidence. */
  confidenceScore: number;
  urgency: Urgency;
  riskLevel: RiskLevel;

  /** What changes if the user does this. */
  expectedFinancialImpact: QuantifiedImpact;
  /** Liquidity / cash runway effect. */
  liquidityImpact?: LiquidityImpact;
  /** Years sooner/later to FIRE (positive = sooner). */
  fireImpact?: { yearsDelta?: number; probabilityDelta?: number };
  /** $ delta to net worth over a defined horizon. */
  netWorthImpact?: { horizonYears: number; delta: number };
  /** Risk-radar score improvement (0-100 points). */
  riskReductionImpact?: { points: number; categoriesAffected: string[] };
  /** What you give up by acting. */
  opportunityCost?: { description: string; annualDollar?: number };

  implementationSteps: RecommendationStep[];
  whatCouldChangeRecommendation: string[];
  alternativeOptions: AlternativeOption[];
  reviewTrigger: ReviewTrigger;

  /** Which signals the engine actually had access to when forming this. */
  sourceSignalsUsed: SourceSignal[];

  /** Surfaces this rec is appropriate for (used to filter UI). */
  surfaces: Array<'best_move' | 'action_centre' | 'fire' | 'risk' | 'property' | 'debt' | 'tax'>;

  /** Plain-English reasoning shown to the user. */
  reasoning: string;
  /** Short subtitle/benefit pill — e.g. "$8.4k/yr guaranteed". */
  benefitLabel?: string;
  /** Optional CTA. */
  cta?: { label: string; route: string };
}

export interface InvestorPreference {
  /** -1 (very conservative) to +1 (very aggressive). */
  riskTolerance?: number;
  /** Property-vs-ETF lean: -1 strong ETF / +1 strong property. */
  propertyBias?: number;
  /** Cares strongly about FIRE date. */
  fireUrgency?: number; // 0-1
  /** Cares strongly about tax efficiency. */
  taxOptimisation?: number; // 0-1
}

export interface UnifiedSignals {
  /** Canonical snapshot derived numbers. */
  cashOutsideOffset?: number;
  offsetBalance?: number;
  mortgage?: number;
  otherDebts?: number;
  ppor?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlySurplus?: number;
  rohamGrossAnnual?: number;
  superContribAnnualised?: number;
  superCapRemaining?: number;
  emergencyBufferTarget?: number;
  upcomingBills12mo?: number;

  /** Deposit / property readiness. */
  depositPower?: number;
  depositReadinessPct?: number;
  serviceabilityHeadroomMonthly?: number; // surplus left after a new IP mortgage
  postPurchaseBufferMonths?: number;

  /** Monte Carlo. */
  mcSurvivalProbability?: number;   // 0-1, fire survival/safety
  mcShortfallSeverity?: number;     // 0-1, downside magnitude
  mcRateStressActive?: boolean;
  mcStressFlag?: 'none' | 'moderate' | 'severe';

  /** Decision Engine. */
  decisionTopAction?: string;
  decisionConfidence?: number;

  /** FIRE engine. */
  fireYearsToTarget?: number;
  fireProgressPct?: number;
  fireMonthlyInvestmentRequired?: number;

  /** Risk Radar. */
  riskOverallScore?: number;    // 0-100
  riskLiquidityScore?: number;
  riskDebtScore?: number;
  riskCashflowScore?: number;
  topRiskFactor?: { id: string; label: string; action: string };
  secondRiskFactor?: { id: string; label: string; action: string };

  /** Returns assumed. */
  etfExpectedReturn?: number;
  cryptoExpectedReturn?: number;
  propertyCagr?: number;
  mortgageRate?: number;
  personalDebtRate?: number;
  marginalTaxRate?: number;
  cashHisaReturn?: number;

  /** Behavioural / investor profile. */
  preference?: InvestorPreference;

  /** Diagnostic: which signal groups were available. */
  availableSignals?: SourceSignal[];
}

export interface UnifiedRecommendationResult {
  /** Single best move with strongest safety + impact tradeoff. */
  bestMove: Recommendation;
  /** Top 3 priorities including bestMove. */
  topPriorities: Recommendation[];
  /** Full ranked list of all candidates. */
  all: Recommendation[];
  /** Plain-English risk being most reduced by topPriorities[0]. */
  riskBeingReduced: string;
  /** Signal coverage. */
  signalCoverage: SourceSignal[];
  /** When this run was produced (ISO). */
  generatedAt: string;
}
