/**
 * Behavioural Finance Engine — types
 *
 * Adaptive profiles distilled from observable user choices across the app:
 * Decision Engine selections, scenario picks, custom thresholds, MC stress
 * choices, allocation preferences, rejected recommendations, FIRE choices,
 * buffer preferences. All inputs are optional — the engine degrades to a
 * neutral profile when nothing is observed.
 */

export type BehaviouralProfileId =
  | 'conservative_protector'
  | 'balanced_optimiser'
  | 'aggressive_compounder'
  | 'fire_accelerator'
  | 'cashflow_defender'
  | 'opportunistic_investor'
  | 'anti_debt'
  | 'leverage_maximiser'
  | 'volatility_sensitive'
  | 'drawdown_tolerant';

export interface BehaviouralProfileDefinition {
  id: BehaviouralProfileId;
  label: string;
  description: string;
}

export interface BehaviouralInputs {
  /** Decision Engine choice IDs the user has selected over time. */
  decisionChoices?: Array<{ id: string; weight?: number; at?: string }>;
  /** Scenarios that user explicitly chose / saved (Scenario v2). */
  scenarioSelections?: Array<{ id: string; tags?: string[] }>;
  /** Custom thresholds the user set in Risk Radar / Assumptions. */
  customThresholds?: {
    drawdownPanicPct?: number;       // % drawdown at which user wants alerts
    minimumBufferMonths?: number;    // user-set min buffer in months
    maxLVRPct?: number;              // self-imposed leverage cap
    cashFloorDollars?: number;       // never go below this in cash
  };
  /** -1..+1 risk lever from settings (matches InvestorPreference.riskTolerance). */
  riskTolerance?: number;
  /** Recent debt actions: pay-down vs extend / refi vs leverage. */
  debtActions?: Array<'paydown' | 'extend' | 'refi' | 'new_debt' | 'consolidate'>;
  /** MC variants the user clicks into / accepts. */
  monteCarloChoices?: Array<{ variant: 'base' | 'bull' | 'bear' | 'inflation' | 'crash' | 'ai_boom'; saved?: boolean }>;
  /** Asset preference signals from allocations adjustments. */
  allocationPreferences?: {
    etfTiltPct?: number;       // -1 ETF-light, +1 ETF-heavy
    propertyTiltPct?: number;  // -1 / +1
    cryptoTiltPct?: number;    // -1 / +1
    cashTiltPct?: number;      // -1 / +1
  };
  /** Recommendations the user has dismissed or explicitly declined. */
  rejectedRecommendations?: Array<{ actionType: string; at?: string; reason?: string }>;
  /** FIRE target choices: age, lifestyle, geographic arbitrage. */
  fireChoices?: {
    targetAge?: number;
    targetAnnualExpenses?: number;
    geoArbitrage?: boolean;
    leanFire?: boolean;
    fatFire?: boolean;
  };
  /** Buffer preferences (cash floor). */
  bufferPreferences?: {
    targetMonths?: number;
    preferOffsetOverHisa?: boolean;
  };
}

export interface BehaviouralScores {
  leveragePreference: number;     // -1 deleverage / +1 leverage maximiser
  liquidityPreference: number;    // -1 deploy / +1 hoard
  volatilityTolerance: number;    // -1 sensitive / +1 tolerant
  fireUrgency: number;            // 0..1
  debtAversion: number;           // 0..1
  propertyBias: number;           // -1 ETF / +1 property
  etfBias: number;                // -1 avoid / +1 strong
  cryptoBias: number;             // -1 avoid / +1 strong
  cashSafetyPreference: number;   // 0..1
  drawdownPanicThreshold: number; // % drop where user panics, 0..1
  lifestyleFlexibility: number;   // 0..1 (1 = adaptable, 0 = rigid)
  spendingRigidity: number;       // 0..1
  retirementAggressiveness: number; // 0..1
}

export interface BehaviouralProfile {
  primary: BehaviouralProfileId;
  secondary?: BehaviouralProfileId;
  primaryLabel: string;
  scores: BehaviouralScores;
  /** Strength of the inferred profile (0..1) — proxy for input coverage. */
  confidence: number;
  /** Subset of fields the engine had access to. */
  inputsObserved: string[];
  /** Human-readable summary. */
  narrative: string;
}

export const PROFILE_DEFINITIONS: Record<BehaviouralProfileId, BehaviouralProfileDefinition> = {
  conservative_protector: {
    id: 'conservative_protector',
    label: 'Conservative Protector',
    description: 'Prioritises liquidity, safety and capital preservation over growth.',
  },
  balanced_optimiser: {
    id: 'balanced_optimiser',
    label: 'Balanced Optimiser',
    description: 'Seeks measured growth with consistent buffers and disciplined investing.',
  },
  aggressive_compounder: {
    id: 'aggressive_compounder',
    label: 'Aggressive Compounder',
    description: 'High volatility tolerance, maximises long-horizon compounding.',
  },
  fire_accelerator: {
    id: 'fire_accelerator',
    label: 'FIRE Accelerator',
    description: 'Optimises every decision around shortening time-to-FIRE.',
  },
  cashflow_defender: {
    id: 'cashflow_defender',
    label: 'Cashflow Defender',
    description: 'Protects monthly surplus and resilience before chasing returns.',
  },
  opportunistic_investor: {
    id: 'opportunistic_investor',
    label: 'Opportunistic Investor',
    description: 'Leans into regime changes — buys weakness, rotates aggressively.',
  },
  anti_debt: {
    id: 'anti_debt',
    label: 'Anti-Debt',
    description: 'Strong preference for paying down debt before deploying to risk assets.',
  },
  leverage_maximiser: {
    id: 'leverage_maximiser',
    label: 'Leverage Maximiser',
    description: 'Comfortable using leverage to accelerate wealth — needs guardrails.',
  },
  volatility_sensitive: {
    id: 'volatility_sensitive',
    label: 'Volatility Sensitive',
    description: 'Loss-averse to drawdowns — prefers smoother equity curves.',
  },
  drawdown_tolerant: {
    id: 'drawdown_tolerant',
    label: 'Drawdown Tolerant',
    description: 'Stays the course through deep drawdowns — long-horizon mindset.',
  },
};
