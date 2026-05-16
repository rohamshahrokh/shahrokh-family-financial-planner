/**
 * Financial Intelligence Layer V1 — public types.
 *
 * The Intelligence Layer reads existing engine outputs (RankedCandidate,
 * QuickDecisionOutput, ExtendedScenarioResult) and produces interpretive
 * overlays: turning points, fragility, dependencies, weak points, regime
 * dependency, behavioural risk, robustness, drift, and an explainability
 * surface.
 *
 * Design rules:
 *   - Deterministic. No AI. No randomness.
 *   - Reads existing engine fields only — never invents precision.
 *   - Returns structured `InsightCard`s the UI can render uniformly.
 *   - Severity is uniform across all modules so the UI can sort/filter.
 */

/** Severity tones — match existing soft-warning palette. */
export type InsightSeverity = "info" | "watch" | "warn" | "critical";

/** Confidence in a quantitative threshold or impact estimate. */
export type InsightConfidence = "high" | "medium" | "low" | "qualitative";

/** Category drives icon + colour band in the UI. */
export type InsightCategory =
  | "turning-point"
  | "fragility"
  | "assumption"
  | "weak-point"
  | "regime"
  | "behavioural"
  | "robustness"
  | "drift"
  | "opportunity"
  | "liquidity"
  | "leverage"
  | "concentration"
  | "tax"
  | "explainability";

/** Stable kind tags used by tests + UI for the insight-card taxonomy. */
export type InsightKind =
  | "fragility-alert"
  | "regime-dependency"
  | "leverage-pressure"
  | "fire-delay-risk"
  | "behavioural-risk"
  | "liquidity-compression"
  | "opportunity-window"
  | "assumption-dependency"
  | "turning-point-warning"
  | "strategy-drift"
  | "sequence-risk"
  | "refinance-risk"
  | "inflation-exposure"
  | "concentration-risk"
  | "cashflow-compression"
  | "weakest-link"
  | "robustness-summary"
  | "recommendation-change"
  | "explainability";

export interface InsightThreshold {
  /** Plain-English description of the threshold ("rates < 5.3%", "LVR > 82%"). */
  label: string;
  /** Optional numeric value when available. */
  value?: number;
  /** Unit string ("%", "$/mo", "months", "years"). */
  unit?: string;
  /** How confident this threshold is. */
  confidence: InsightConfidence;
}

export interface InsightCard {
  /** Stable identifier — stable across deterministic runs on identical inputs. */
  id: string;
  kind: InsightKind;
  category: InsightCategory;
  severity: InsightSeverity;
  /** Short headline (mobile-friendly, < ~80 chars). */
  title: string;
  /** 1–2 sentence interpretation — institutional advisor tone. */
  body: string;
  /** Optional quantitative trigger / breakpoint. */
  threshold?: InsightThreshold;
  /** Optional supporting bullets — never more than 4 in the UI. */
  details?: string[];
  /** Driver field(s) on the engine result that drove this insight (audit trail). */
  drivers: string[];
  /** Tags for filtering / grouping in the UI. */
  tags?: string[];
}

// ─── Turning-Point Engine ────────────────────────────────────────────────────

export interface TurningPoint {
  id: string;
  /** Internal kind for testing / filtering. */
  kind:
    | "recommendation-flip"
    | "risk-acceleration"
    | "leverage-unsafe"
    | "fire-collapse"
    | "liquidity-stress"
    | "debt-dominant"
    | "serviceability-weak"
    | "volatility-intolerance";
  /** Plain-English description ("Recommendation flips from … to …"). */
  description: string;
  threshold: InsightThreshold;
  severity: InsightSeverity;
  /** Engine fields that drove this turning point. */
  drivers: string[];
}

// ─── Fragility Scanner ───────────────────────────────────────────────────────

export type FragilityKind =
  | "property-growth-dependence"
  | "dual-income-dependence"
  | "leverage-dependence"
  | "concentration"
  | "liquidity-illusion"
  | "refinancing-dependency"
  | "sequence-risk"
  | "tax-dependency"
  | "inflation-sensitivity"
  | "behavioural-fragility";

export interface FragilityFinding {
  id: string;
  kind: FragilityKind;
  description: string;
  /** Relative weight 0..1 — how concentrated the dependency is. */
  weight: number;
  severity: InsightSeverity;
  drivers: string[];
}

// ─── Critical Assumption Dependency Analysis ─────────────────────────────────

export type AssumptionKey =
  | "propertyGrowth"
  | "incomeGrowth"
  | "interestRates"
  | "cashBuffer"
  | "dcaConsistency"
  | "inflation"
  | "stockReturn"
  | "cryptoReturn"
  | "superReturn"
  | "dualIncome";

export type AssumptionImpactBand = "high" | "medium" | "low";

export interface AssumptionImpact {
  key: AssumptionKey;
  label: string;
  /** Higher = more sensitive. 0..1 normalised. */
  sensitivity: number;
  impactBand: AssumptionImpactBand;
  /** Plain-English impact phrasing when safe to quantify; else qualitative. */
  impactDescription: string;
  /** Optional quant impact ("$X NW", "Y years FIRE"). Only populated when safely derivable. */
  quant?: { label: string; value: number; unit: string };
}

// ─── Strategic Weakest Link ──────────────────────────────────────────────────

export interface WeakestLink {
  /** Primary fragile point. */
  primary: string;
  /** Bottleneck preventing acceleration. */
  bottleneck: string;
  /** Dominant risk factor (most concentrated risk). */
  dominantRisk: string;
  /** Constraint blocking FIRE if applicable. */
  fireBlocker: string | null;
}

// ─── Regime Detection ────────────────────────────────────────────────────────

export type Regime =
  | "high-inflation"
  | "high-rates"
  | "falling-rates"
  | "property-boom"
  | "equity-bull"
  | "equity-bear"
  | "recession"
  | "stagflation"
  | "low-growth"
  | "liquidity-crisis";

export type RegimePerformance = "strong" | "neutral" | "weak" | "fragile";

export interface RegimeDependency {
  regime: Regime;
  label: string;
  performance: RegimePerformance;
  rationale: string;
}

// ─── Behavioural Survivability ───────────────────────────────────────────────

export type BehaviouralAxis =
  | "volatility-intolerance"
  | "leverage-stress"
  | "panic-selling"
  | "inconsistency"
  | "over-aggression"
  | "strategy-abandonment";

export interface BehaviouralFinding {
  axis: BehaviouralAxis;
  /** 0..1 — higher = more behavioural risk. */
  risk: number;
  severity: InsightSeverity;
  description: string;
}

// ─── Path Robustness ─────────────────────────────────────────────────────────

export interface PathRobustness {
  /** 0..1 — higher = more robust across stress conditions. */
  robustnessScore: number;
  /** 0..1 — higher = stronger raw return. */
  returnScore: number;
  /** Synthesised label. */
  classification:
    | "high-return-fragile"
    | "balanced"
    | "lower-return-robust"
    | "high-return-robust"
    | "high-return-acceptable"
    | "moderate";
  /** Tradeoff summary ("sacrifices ~6% terminal wealth for stability"). */
  tradeoff: string;
  /** Why this ranks where it does. */
  rationale: string[];
}

// ─── Adaptive Recommendation / Drift ─────────────────────────────────────────

export interface RecommendationDelta {
  /** Stable id of previous winner, if any. */
  previousWinnerId: string | null;
  previousLabel: string | null;
  currentWinnerId: string;
  currentLabel: string;
  changed: boolean;
  /** Plain-English reason if changed; "Baseline (no prior recommendation)" if not. */
  reason: string;
  /** Diffs between previous and current winner. */
  diffs: string[];
}

export interface DriftFinding {
  /** Type of drift detected. */
  kind:
    | "spending-creep"
    | "savings-rate-decline"
    | "leverage-increase"
    | "fire-delay"
    | "liquidity-deterioration"
    | "cashflow-weakening";
  description: string;
  severity: InsightSeverity;
  /** True when we lack historical data for this dimension. */
  needsHistory: boolean;
}

// ─── Explainability ─────────────────────────────────────────────────────────

export interface ExplainabilityAnswers {
  whyThisWon: string;
  whyOthersLost: string;
  whatChangesTheAnswer: string;
  whatBreaksTheStrategy: string;
  whatAssumptionsMatter: string;
  whatEnvironmentItNeeds: string;
  howRobustItIs: string;
  howBehaviourallyRealistic: string;
}

// ─── Top-level Intelligence Report ───────────────────────────────────────────

export interface FinancialIntelligenceReport {
  /** Ranked turning points (most material first). */
  turningPoints: TurningPoint[];
  /** Fragility scanner findings. */
  fragility: FragilityFinding[];
  /** Top assumption dependencies. */
  assumptions: AssumptionImpact[];
  /** Strategic weakest link analysis. */
  weakestLink: WeakestLink;
  /** Regime dependency map. */
  regime: RegimeDependency[];
  /** Behavioural survivability axes. */
  behavioural: BehaviouralFinding[];
  /** Path robustness scoring. */
  robustness: PathRobustness;
  /** Recommendation change vs prior baseline (neutral if no history). */
  recommendationDelta: RecommendationDelta;
  /** Financial drift signals from current ledger. */
  drift: DriftFinding[];
  /** Explainability answers for the winning recommendation. */
  explainability: ExplainabilityAnswers;
  /** Reusable insight cards aggregated from all modules. */
  insightCards: InsightCard[];
  /** Critical findings summary — top N most material insights for the UI hero. */
  criticalFindings: InsightCard[];
  /** Generation context — useful for the UI hint line. */
  meta: {
    winnerId: string;
    winnerLabel: string;
    /** True when no prior recommendation existed (recommendation-change is baseline). */
    isBaselineRecommendation: boolean;
    /** True when ledger history was not available for drift detection. */
    historyAvailable: boolean;
  };
}

/** Optional input used by adaptive-recommendation / drift modules. */
export interface PriorContext {
  previousWinnerId: string | null;
  previousLabel: string | null;
  /** Optional historical ledger snapshots. Each entry is a {month, surplus, nw} sample. */
  history?: Array<{
    month: string; // YYYY-MM
    monthlySurplus: number;
    netWorth: number;
    cash: number;
    debt: number;
    fireYearsAway?: number;
  }>;
}
