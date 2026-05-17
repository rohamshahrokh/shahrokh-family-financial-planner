/**
 * Adaptive Learning Layer — types
 *
 * Deterministic — not LLM, not stochastic. Adjusts ranking, urgency, risk
 * scoring and behavioural weighting from observable in-memory events.
 *
 * No localStorage / IndexedDB / cookies are written by this layer. Persistence
 * is the host application's responsibility — this module exposes pure
 * functions over an `AdaptiveState` value object.
 */

export type AdaptiveEventType =
  | 'recommendation_accepted'
  | 'recommendation_ignored'
  | 'recommendation_dismissed'
  | 'assumption_changed'
  | 'spending_increased'
  | 'spending_decreased'
  | 'risk_pref_changed'
  | 'asset_pref_changed'
  | 'drawdown_reaction'
  | 'leverage_increased'
  | 'leverage_decreased'
  | 'liquidity_increased'
  | 'liquidity_decreased';

export interface AdaptiveEvent {
  type: AdaptiveEventType;
  /** ISO timestamp. */
  at: string;
  /** Optional reference (e.g. recommendation id). */
  ref?: string;
  /** Optional numeric magnitude (-1..+1 or context-specific). */
  magnitude?: number;
  /** Optional metadata. */
  meta?: Record<string, unknown>;
}

export interface AdaptiveCounters {
  acceptedByActionType: Record<string, number>;
  ignoredByActionType: Record<string, number>;
  dismissedByActionType: Record<string, number>;
}

export interface AdaptiveState {
  events: AdaptiveEvent[];
  counters: AdaptiveCounters;
  /** Aggregate behavioural deltas inferred from events. */
  inferred: {
    /** -1 risk averse / +1 risk loving. */
    riskShift: number;
    /** -1 deleverage / +1 leverage. */
    leverageShift: number;
    /** -1 deploy cash / +1 hoard. */
    liquidityShift: number;
    /** -1 cash heavy / +1 invest heavy. */
    investingShift: number;
    /** 0..1 — how panicked user gets on drawdowns. */
    panicScore: number;
    /** -1..+1 — moving away (-) or toward (+) FIRE urgency. */
    fireShift: number;
  };
  /** Last update ISO. */
  updatedAt: string;
}

export interface AdaptiveAdjustments {
  /** Multiplier applied to candidate ranking scores by actionType. */
  rankingMultiplierByActionType: Record<string, number>;
  /** Multiplier applied to recommendation urgency strength 0.5..2. */
  urgencyMultiplier: number;
  /** Soft tilt to risk scoring (-0.5..+0.5). */
  riskScoreTilt: number;
  /** Soft tilt to behavioural weight applied to leverage/liquidity pillars. */
  pillarWeights: Partial<Record<string, number>>;
  /** Multiplier applied to Monte Carlo result prioritisation 0.5..2 (boost severe stress). */
  monteCarloPriorityMultiplier: number;
  /** Sentence to slot into a strategy explanation when adjustments differ from baseline. */
  explanation: string;
}

export interface AdaptiveLearningResult {
  state: AdaptiveState;
  adjustments: AdaptiveAdjustments;
}
