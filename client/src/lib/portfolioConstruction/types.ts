/**
 * Portfolio Construction Engine — types
 *
 * Determines optimal target allocation across PPOR, IP, ETF, crypto, cash,
 * offset, debt-pay-down and superannuation. Decorates Recommendation Engine
 * V2 via soft tilts — never overrides the hard safety pillars.
 *
 * Pure, deterministic, optional-input. Designed to degrade gracefully.
 */

export type AssetClass =
  | 'cash'
  | 'offset'
  | 'debtPaydown'
  | 'etf'
  | 'crypto'
  | 'super'
  | 'ppor'
  | 'investmentProperty';

export type AllocationModel =
  | 'aggressive_growth'
  | 'balanced'
  | 'defensive'
  | 'fire_first'
  | 'property_heavy'
  | 'etf_heavy'
  | 'debt_minimising'
  | 'cashflow_safe'
  | 'anti_fragile';

export interface PortfolioInputs {
  /** Current $ in each asset class. */
  current?: Partial<Record<AssetClass, number>>;
  /** Behavioural / preference signals. */
  riskTolerance?: number;          // -1..+1
  leverageTolerance?: number;      // 0..1
  liquidityNeed?: number;          // 0..1 — higher means more cash demanded
  drawdownPanicThreshold?: number; // 0..1 — lower means defensive
  propertyBias?: number;           // -1..+1
  etfBias?: number;                // -1..+1
  cryptoBias?: number;             // -1..+1
  fireUrgency?: number;            // 0..1
  taxOptimisation?: number;        // 0..1
  /** Monte Carlo derived risk pressure 0..1 (1 = severe stress). */
  mcStressPressure?: number;
  /** Survival probability 0..1. */
  mcSurvivalProbability?: number;
  /** FIRE timeline. */
  fireYearsToTarget?: number;
  /** Life stage hint: 'accumulator' | 'consolidator' | 'preserver' */
  lifeStage?: 'accumulator' | 'consolidator' | 'preserver';
  /** Income volatility 0..1. */
  incomeVolatility?: number;
  /** Macro regime hint. */
  macroRegime?: 'expansion' | 'late_cycle' | 'recession' | 'recovery' | 'stagflation' | 'crisis';
  /** Marginal tax rate, used for tax-efficiency scoring. */
  marginalTaxRate?: number;
  /** Expected nominal return assumptions. */
  expectedReturns?: Partial<Record<AssetClass, number>>;
  /** Expected vol per class. */
  expectedVol?: Partial<Record<AssetClass, number>>;
  /** Override model. */
  forceModel?: AllocationModel;
  /** Mortgage interest rate (decimal). */
  mortgageRate?: number;
  /** Other debt rate (decimal). */
  personalDebtRate?: number;
  /** Annual super cap remaining $. */
  superCapRemaining?: number;
  /** Emergency buffer target $. */
  emergencyBufferTarget?: number;
}

export interface AllocationTarget {
  asset: AssetClass;
  /** Target allocation in 0..1 fraction. */
  target: number;
  /** Current allocation in 0..1 fraction. */
  current: number;
  /** Drift (current - target) in absolute points (positive = overweight). */
  drift: number;
  /** Drift band: <2% none, 2-5% mild, 5-10% notable, >10% urgent. */
  driftBand: 'none' | 'mild' | 'notable' | 'urgent';
  /** Recommended action label. */
  action: 'hold' | 'add' | 'trim' | 'pause_contributions';
}

export interface RebalanceMove {
  from: AssetClass;
  to: AssetClass;
  amount: number;     // approximate $ to move
  rationale: string;
}

export interface PortfolioMetrics {
  expectedReturn: number;     // annualised, decimal
  expectedVol: number;        // annualised, decimal
  sharpeApprox: number;
  downsideProbability: number; // 0..1 — rough chance of negative year
  liquidityScore: number;     // 0..100 — higher means more deployable
  taxEfficiencyScore: number; // 0..100
  leverageProxy: number;      // debt / net wealth, 0..1+
  fireFitScore: number;       // 0..100 alignment with FIRE urgency
}

export interface PortfolioConstructionResult {
  model: AllocationModel;
  modelLabel: string;
  modelRationale: string;
  targets: AllocationTarget[];
  rebalanceMoves: RebalanceMove[];
  metrics: PortfolioMetrics;
  /** Total tracked net deployable wealth used for % math. */
  totalTracked: number;
  /** Soft tilts to feed into Recommendation Engine. */
  tilts: {
    etfPush?: number;
    propertyPush?: number;
    cashHold?: number;
    debtPay?: number;
    superPush?: number;
    cryptoTrim?: number;
  };
  /** Top-line narrative. */
  narrative: string;
  /** Generated at ISO. */
  generatedAt: string;
}
