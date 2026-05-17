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
  | 'maintain_interest_free_debt'    // 0% / interest-free — keep liquidity / offset positioning
  | 'monitor_strategic_debt'          // tax-deductible / strategic — non-urgent monitor
  | 'plan_promo_expiry'               // 0% promo with upcoming cliff → timed warning
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
  | 'investor_preference'
  | 'behavioural_profile'
  | 'autonomous_os'
  | 'scenario_tree';

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

  /**
   * Structured rationale rendered by the "Why this recommendation exists"
   * panel for debt actions. Only populated for debt-related recommendations
   * (pay_high_interest_debt, maintain_interest_free_debt, monitor_strategic_debt,
   * plan_promo_expiry). Surfacing these as structured data — rather than
   * weaving them into prose — lets the UI render them deterministically.
   */
  debtRationale?: {
    classification: string;          // class label e.g. "High-APR consumer debt"
    aprPct: number | null;           // effective APR % (null when unknown)
    balance: number;
    annualInterestCost: number;      // $ / year if not paid down
    guaranteedReturnPct: number | null; // payoff yield equivalent (= APR)
    pillarRank: number;              // 1 = top priority pillar
    /** Trigger that *would* upgrade the recommendation to urgent payoff. */
    triggers?: {
      expiryDateISO?: string;
      daysToExpiry?: number;
      liquidityStress?: boolean;
      minimumRepaymentMissed?: boolean;
    };
    /** Plain-English "what would change this advice". */
    whatChangesThis?: string[];
  };
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

  /**
   * Classified debt portfolio — single source of truth for debt advice.
   * When provided, the recommendation engine uses this instead of the legacy
   * `otherDebts × personalDebtRate` heuristic. Drives Best Move, Action Queue,
   * Daily Briefing, Executive Overview and Monte Carlo overlays.
   *
   * Kept as `any[]` here to avoid a load-order coupling with debtClassification.ts;
   * the engine narrows it to `ClassifiedDebt[] | DebtRecord[]` at use.
   */
  debtPortfolio?: Array<{
    id: string;
    name: string;
    balance: number;
    ratePct: number | null | undefined;
    minPaymentMonthly?: number;
    type?: string;
    expiryDateISO?: string;
    taxDeductible?: boolean;
  }>;

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

  /**
   * Phase 5 — Behavioural Engine summary. Used for *soft* tilts inside a
   * pillar; never overrides hard safety pillars. Shape kept loose to avoid a
   * cross-package type dependency.
   */
  behaviouralProfile?: {
    primary?: string;
    secondary?: string;
    primaryLabel?: string;
    scores?: Partial<{
      leveragePreference: number;
      liquidityPreference: number;
      volatilityTolerance: number;
      fireUrgency: number;
      debtAversion: number;
      propertyBias: number;
      etfBias: number;
      cryptoBias: number;
      cashSafetyPreference: number;
      drawdownPanicThreshold: number;
      lifestyleFlexibility: number;
      spendingRigidity: number;
      retirementAggressiveness: number;
    }>;
    confidence?: number;
  };

  /**
   * Phase 5 — Autonomous OS findings as derived signals only. The engine may
   * use these for ranking nudges (e.g. boost refinance during opportunity
   * window) but never as direct advice. All on-screen advice still flows
   * through this engine's recommendations.
   */
  osFindings?: Array<{
    id: string;
    detector: string;
    severity: 'info' | 'watch' | 'elevated' | 'critical';
    actionTypeHint?: string;
    pillarHint?: string;
    confidence?: number;
  }>;

  /**
   * Phase 5 — Scenario Tree context. Probability-weighted regime metrics that
   * help tilt confidence and urgency under macro stress regimes.
   */
  scenarioContext?: {
    probWeightedInsolvencyRisk?: number;
    probWeightedLiquidityRisk?: number;
    probWeightedFireYear?: number;
    dominantRegime?: string;
  };

  /**
   * Phase 6 — Portfolio Construction soft tilts. Per-action multipliers in
   * 0..0.25 range applied INSIDE the same pillar only. They never override
   * hard safety pillars.
   */
  portfolioTilts?: {
    etfPush?: number;
    propertyPush?: number;
    cashHold?: number;
    debtPay?: number;
    superPush?: number;
    cryptoTrim?: number;
    modelLabel?: string;
    liquidityScore?: number;       // 0..100
    taxEfficiencyScore?: number;   // 0..100
  };

  /**
   * Phase 6 — Life Planning context. Major life-event horizon stress that
   * pushes urgency on liquidity / buffer items.
   */
  lifeContext?: {
    fireYearDelayEstimate?: number;
    averageAnnualDrag?: number;
    stressProbability?: number;
    liquidityStressMonths?: number;
    upcomingEventCount?: number;
  };

  /**
   * Phase 6 — Tax Intelligence overlay. Tilts ranking toward tax-efficient
   * actions; never replaces tax-pillar recommendations.
   */
  taxContext?: {
    totalEstimatedSaving?: number;
    longTermTaxDragPct?: number;
    fireWithdrawalEfficiencyScore?: number;
    topStrategyId?: string;
  };

  /**
   * Phase 6 — Execution OS readiness summary.
   */
  executionContext?: {
    overallReadinessPct?: number;
    topBlocker?: string;
  };

  /**
   * Phase 6 — Adaptive Learning soft adjustments. Multipliers/tilts derived
   * deterministically from observed user behaviour.
   */
  adaptive?: {
    rankingMultiplierByActionType?: Record<string, number>;
    urgencyMultiplier?: number;
    riskScoreTilt?: number;
    pillarWeights?: Partial<Record<StrategicPillar, number>>;
    monteCarloPriorityMultiplier?: number;
    explanation?: string;
  };

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
