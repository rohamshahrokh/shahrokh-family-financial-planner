/**
 * Autonomous Financial OS — Phase 3 type surface.
 *
 * The Autonomous Layer is a deterministic interpretive overlay sitting on
 * top of the Financial Intelligence Layer and Decision Engine. It produces
 * a single AutonomousReport that the UI renders as the proactive advisor /
 * family-office terminal.
 *
 * Design rules:
 *   - Pure functions. No randomness. No fetches. No hidden globals.
 *   - Reads existing engine outputs (QuickDecisionOutput, RankedCandidate,
 *     ExtendedScenarioResult, FinancialIntelligenceReport) plus optional
 *     longitudinal history + strategic-memory context.
 *   - Never fabricates precise historical numbers — when no history is
 *     available, surfaces `needsHistory` states so the UI is honest.
 *   - Severity uniform across modules so the UI can sort/filter.
 */

import type { InsightSeverity } from "../intelligence/types";

// ─── Time + freshness ────────────────────────────────────────────────────────

export type IsoDate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

// ─── Longitudinal history (PART 1, PART 5, PART 10) ──────────────────────────

export interface LedgerSnapshot {
  /** Calendar month for this snapshot. */
  month: MonthKey;
  /** Realised monthly surplus (income minus expenses minus debt service). */
  monthlySurplus: number;
  /** Realised monthly income (gross or net — caller chooses; must be consistent). */
  monthlyIncome: number;
  /** Realised monthly expenses. */
  monthlyExpenses: number;
  /** Net worth at snapshot. */
  netWorth: number;
  /** Liquid cash + offset balances. */
  liquidCash: number;
  /** Sum of all debt balances. */
  totalDebt: number;
  /** Engine-projected FIRE years away at snapshot time. */
  fireYearsAway?: number;
  /** Loan-to-value ratio at snapshot. */
  lvr?: number;
  /** Optional asset-class allocation snapshot (shares, 0..1). */
  allocation?: AllocationSnapshot;
  /** Defensive: arbitrary user notes the system may surface. */
  note?: string;
}

export interface AllocationSnapshot {
  cash: number;
  equities: number;
  property: number;
  super: number;
  crypto: number;
  other: number;
}

// ─── Strategic memory (PART 12) ──────────────────────────────────────────────

export type LeverageTolerance = "low" | "moderate" | "high";
export type LiquidityPreference = "thin" | "balanced" | "deep";
export type InvestmentPhilosophy =
  | "preserve-first"
  | "balanced-growth"
  | "compound-growth"
  | "aggressive-growth"
  | "income-focused";

export interface StrategicMemoryInput {
  /** Stable user identifier the UI persists locally (no PII required). */
  userId?: string;
  /** Self-reported / inferred risk tolerance. */
  leverageTolerance?: LeverageTolerance;
  /** Self-reported liquidity preference. */
  liquidityPreference?: LiquidityPreference;
  /** Investment philosophy. */
  philosophy?: InvestmentPhilosophy;
  /** Recommendation IDs the user has explicitly rejected previously. */
  rejectedPaths?: string[];
  /** Recommendation IDs the user has previously executed / preferred. */
  preferredPaths?: string[];
  /** Free-text constraints the system should respect. */
  constraints?: string[];
  /** Last-known recommendation id (used by recommendation evolution). */
  lastWinnerId?: string;
  /** Last-known recommendation label. */
  lastWinnerLabel?: string;
  /** ISO date when memory was last refreshed. */
  lastUpdated?: IsoDate;
}

// ─── Macro regime classifier (PART 3) ────────────────────────────────────────

export type MacroRegime =
  | "falling-rates"
  | "rising-rates"
  | "recession"
  | "liquidity-crisis"
  | "inflationary-boom"
  | "disinflation"
  | "property-boom"
  | "equity-bear-market"
  | "volatility-spike"
  | "credit-tightening"
  | "neutral";

export interface MacroRegimeSignals {
  /** Annualised cash / policy rate, e.g. 0.04. */
  policyRate?: number;
  /** Trailing CPI inflation, e.g. 0.034. */
  inflation?: number;
  /** Recent mortgage rate, e.g. 0.063. */
  mortgageRate?: number;
  /** Equity drawdown from peak (0..1). */
  equityDrawdown?: number;
  /** Property growth YoY. */
  propertyYoy?: number;
  /** Rate-change direction over last 12mo: -1 falling, 0 flat, +1 rising. */
  rateDirection?: -1 | 0 | 1;
  /** Optional implied volatility proxy (0..1). */
  vix?: number;
  /** Caller-supplied note for transparency. */
  note?: string;
}

export interface RegimeClassification {
  regime: MacroRegime;
  label: string;
  /** 0..1 confidence in the classification. */
  confidence: number;
  /** Plain-English rationale referencing observed signals. */
  rationale: string;
  /** Strategy implications under this regime. */
  implications: string[];
  /** Signals that drove the classification. */
  drivers: string[];
}

// ─── Continuous Strategy Monitoring (PART 1) ────────────────────────────────

export type MonitoringDimension =
  | "balance-sheet"
  | "cashflow"
  | "leverage"
  | "liquidity"
  | "debt-serviceability"
  | "fire-trajectory"
  | "risk-drift"
  | "market-sensitivity"
  | "asset-concentration"
  | "behaviour-drift";

export type MonitoringDirection = "improving" | "stable" | "deteriorating" | "needs-history";

export interface MonitoringSignal {
  id: string;
  dimension: MonitoringDimension;
  label: string;
  direction: MonitoringDirection;
  severity: InsightSeverity;
  /** Plain-English summary. */
  summary: string;
  /** Optional numeric delta when safely derivable. */
  delta?: { label: string; value: number; unit: string };
  /** Engine / history fields used. */
  drivers: string[];
  /** True when comparison required a baseline that does not yet exist. */
  needsHistory: boolean;
}

// ─── Opportunity Detection (PART 4) ─────────────────────────────────────────

export type OpportunityKind =
  | "attractive-entry"
  | "idle-liquidity"
  | "refinance-window"
  | "tax-optimisation"
  | "debt-restructure"
  | "rebalance-window"
  | "super-contribution";

export interface OpportunityWindow {
  id: string;
  kind: OpportunityKind;
  title: string;
  body: string;
  severity: InsightSeverity;
  /** Suggested user action. */
  suggestedAction: string;
  /** Optional quantified hint (e.g. "$48k idle cash above safety floor"). */
  quant?: { label: string; value: number; unit: string };
  /** Engine/state fields used. */
  drivers: string[];
}

// ─── Trajectory drift (PART 5) ──────────────────────────────────────────────

export type DriftKind =
  | "fire-delay"
  | "savings-rate-deterioration"
  | "spending-creep"
  | "leverage-acceleration"
  | "liquidity-compression"
  | "dependency-risk"
  | "survivability-deterioration";

export interface TrajectoryDrift {
  id: string;
  kind: DriftKind;
  description: string;
  severity: InsightSeverity;
  /** When derivable from history, the magnitude (e.g. "+3.1 years"). */
  magnitude?: { label: string; value: number; unit: string };
  needsHistory: boolean;
  drivers: string[];
}

// ─── Dynamic priority stack (PART 6) ────────────────────────────────────────

export type PriorityUrgency = "immediate" | "near-term" | "ongoing" | "long-term";

export interface PriorityItem {
  rank: number;
  id: string;
  title: string;
  rationale: string;
  urgency: PriorityUrgency;
  suggestedAction: string;
  /** Optional deep link path (route within the app). */
  deepLink?: string;
  /** Engine drivers that put this priority on the stack. */
  drivers: string[];
}

// ─── Rebalancing intelligence (PART 7) ──────────────────────────────────────

export type RebalanceKind =
  | "over-allocation"
  | "under-allocation"
  | "concentration-drift"
  | "volatility-imbalance"
  | "liquidity-imbalance"
  | "tax-aware-timing";

export interface RebalanceSignal {
  id: string;
  kind: RebalanceKind;
  assetClass: keyof AllocationSnapshot | "portfolio";
  description: string;
  severity: InsightSeverity;
  /** Suggested target share or action. */
  suggestedAction: string;
  /** Magnitude when safely derivable (e.g. "+8 pp above preferred"). */
  magnitude?: { label: string; value: number; unit: string };
  drivers: string[];
}

// ─── Life-event simulation (PART 8) ─────────────────────────────────────────

export type LifeEventKind =
  | "child-arrival"
  | "single-income-transition"
  | "job-loss"
  | "salary-increase"
  | "relocation"
  | "school-costs"
  | "retirement-transition"
  | "inheritance"
  | "major-asset-sale";

export interface LifeEventImpact {
  id: string;
  kind: LifeEventKind;
  label: string;
  /** Short qualitative summary. */
  summary: string;
  /** Direction of impact on resilience. */
  direction: "improves" | "neutral" | "deteriorates";
  /** Quantified projected impact when safely derivable. */
  estimate?: { label: string; value: number; unit: string };
  /** Where the user would see deeper modelling (e.g. /what-if-scenarios). */
  deepLink?: string;
  drivers: string[];
}

// ─── Autonomous alerts (PART 9) ─────────────────────────────────────────────

export type AlertChannel =
  | "warning"
  | "opportunity"
  | "structural"
  | "risk"
  | "execution-reminder";

export interface AutonomousAlert {
  id: string;
  channel: AlertChannel;
  title: string;
  body: string;
  severity: InsightSeverity;
  /** Plain-English breakpoint when relevant. */
  threshold?: { label: string; value?: number; unit?: string };
  /** Optional CTA / suggested next step. */
  suggestedAction?: string;
  drivers: string[];
}

// ─── Longitudinal intelligence (PART 10) ────────────────────────────────────

export interface LongitudinalComparison {
  /** Window compared (e.g. "vs 6 months ago"). */
  window: string;
  /** Whether history was sufficient to produce real comparisons. */
  hasHistory: boolean;
  /** Plain-English summary lines. */
  summary: string[];
  /** Derivable deltas. */
  deltas: Array<{
    metric: "netWorth" | "liquidCash" | "totalDebt" | "monthlySurplus" | "fireYearsAway";
    label: string;
    value: number;
    unit: string;
    direction: "up" | "down" | "flat";
  }>;
}

// ─── Rolling roadmap (PART 11) ──────────────────────────────────────────────

export type RoadmapHorizon = "3m" | "12m" | "3y" | "10y";

export interface RoadmapHorizonPlan {
  horizon: RoadmapHorizon;
  label: string;
  theme: string;
  actions: string[];
  /** Conditions that, if true, unlock follow-on actions. */
  conditions?: string[];
}

// ─── Why-this-changed engine (PART 13) ──────────────────────────────────────

export interface ChangeNarrative {
  /** True when a recommendation change was detected versus prior. */
  changed: boolean;
  /** Plain-English reason for the change, or baseline note when unchanged. */
  reason: string;
  /** Specific contributing factors. */
  factors: string[];
  previousLabel: string | null;
  currentLabel: string;
}

// ─── Advanced visualisations (PART 14) ──────────────────────────────────────

export interface ChartSeriesPoint {
  /** Calendar month or label. */
  x: string;
  y: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  /** Brief description of what this series represents. */
  description: string;
  /** Whether full history exists; UI shows baseline state when false. */
  hasHistory: boolean;
  /** Data points (may be empty when hasHistory=false). */
  data: ChartSeriesPoint[];
  /** Optional Y-axis unit ("$", "years", "%", "ratio"). */
  unit?: string;
}

export interface VisualisationsBundle {
  trajectoryDrift: ChartSeries;
  fragilityMap: Array<{ label: string; weight: number; severity: InsightSeverity }>;
  dependencyMap: Array<{ label: string; weight: number; severity: InsightSeverity }>;
  priorityEvolution: ChartSeries;
  recommendationEvolution: ChartSeries;
  regimeMap: Array<{ regime: MacroRegime; label: string; performance: "strong" | "neutral" | "weak" | "fragile" }>;
  allocationDrift: ChartSeries;
  survivabilityTrend: ChartSeries;
}

// ─── Top-level autonomous report ────────────────────────────────────────────

export interface AutonomousReport {
  generatedAt: IsoDate;
  /** Snapshot identifier of the engine output used (for audit). */
  scenarioId: string;
  /** PART 1 — continuous strategy monitoring signals. */
  monitoring: MonitoringSignal[];
  /** PART 2 + PART 13 — recommendation evolution narrative. */
  recommendationChange: ChangeNarrative;
  /** PART 3 — macro regime classification. */
  regime: RegimeClassification;
  /** PART 4 — opportunity windows. */
  opportunities: OpportunityWindow[];
  /** PART 5 — trajectory drift findings. */
  drift: TrajectoryDrift[];
  /** PART 6 — dynamic priority stack. */
  priorities: PriorityItem[];
  /** PART 7 — rebalancing signals. */
  rebalancing: RebalanceSignal[];
  /** PART 8 — life-event impact simulations. */
  lifeEvents: LifeEventImpact[];
  /** PART 9 — autonomous alerts. */
  alerts: AutonomousAlert[];
  /** PART 10 — longitudinal comparison summary. */
  longitudinal: LongitudinalComparison;
  /** PART 11 — rolling strategic roadmap. */
  roadmap: RoadmapHorizonPlan[];
  /** PART 12 — strategic memory echo (read-back of stored preferences). */
  strategicMemory: {
    hasMemory: boolean;
    summary: string[];
    activeConstraints: string[];
  };
  /** PART 14 — advanced visualisations bundle. */
  visuals: VisualisationsBundle;
  /** Critical findings (top items from monitoring + alerts + priorities). */
  criticalFindings: Array<{
    id: string;
    title: string;
    body: string;
    severity: InsightSeverity;
    source: "monitoring" | "alert" | "priority" | "opportunity" | "drift";
  }>;
  /** Metadata for the UI hint line. */
  meta: {
    hasHistory: boolean;
    isBaselineRecommendation: boolean;
    regimeNote: string;
    memoryActive: boolean;
  };
}
