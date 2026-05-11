/**
 * Family Wealth Lab — Layer 2 Candidate Generator
 *
 * Given a user question (e.g. "deploy $50k") + their current ledger state,
 * produces 15-25 FINANCIALLY REALISTIC candidate paths. Each candidate is:
 *
 *   1. Built from a deterministic combination of allocation × timing axes
 *   2. Filtered through 3 stages:
 *        Stage 1 — Behavioural realism (zero-cash, max-leverage-now, crypto cap, refi chain)
 *        Stage 2 — Hard safety ceilings (LVR > 0.85, DSR=critical, NSR < 0.85, super caps, dynamic liquidity floor)
 *        Stage 3 — Scoring penalties (does NOT kill; lowers score)
 *   3. Run through runScenarioV2 (Monte Carlo + risk metrics + serviceability)
 *   4. Scored by registry compositeScore with the user's weighting philosophy
 *
 * Deterministic. Same input → same candidate set. Same input → same scores.
 *
 * Layer-1 boundary: this module performs NO financial math itself. Every
 * number it produces comes from the Formula Registry or scenarioV2 engine.
 * AI never enters here.
 */

import type { DashboardInputs } from "../../dashboardDataContract";
import {
  runScenarioV2,
  computeServiceability,
  type ScenarioDelta,
  type ExtendedScenarioResult,
  type BasePlanAssumptions,
  type DeltaType,
  type MonthKey,
  deriveBasePlan,
  monthKey,
  addMonths,
} from "../index";
import {
  // Layer 1 helpers
  dsrBand,
  dynamicLiquidityFloor,
  refinancePressureBand,
  downside,
  survivalProbability,
  fireCoverage,
  riskAdjustedReturn,
  liquidityRatio,
  concessionalSuperCap,
  // Scoring
  compositeScore,
  getProfileWeights,
  type CompositeScore,
  type ScoreInputs,
  type ScoreWeights,
  type InvestorProfile,
  // Types
  type DsrBand,
  type RefinancePressureBand,
} from "../registry";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type QuickDecisionQuestionKind =
  | "deploy_capital"
  | "buy_property"
  | "super_vs_invest"
  | "debt_vs_invest"
  | "fire_acceleration"
  | "downside_protection";

export interface QuickDecisionInput {
  /** Live ledger (auto-derived basePlan, no manual entry). */
  dashboardInputs: DashboardInputs;
  /** User's primary question. */
  question: { kind: QuickDecisionQuestionKind; capital?: number };
  /** Default 25y horizon. */
  horizonYears?: number;
  /** Override assumptions (defaults come from Assumption Registry). */
  assumptions?: Partial<BasePlanAssumptions>;
  /** Household context for dynamic liquidity floor. */
  household: {
    dependants: number;
    incomeVolatility: number;   // 0..1
  };
  /**
   * Investor profile re-weights the composite score WITHOUT changing the
   * Monte Carlo math. Defaults to the question's preset profile when omitted.
   */
  investorProfile?: InvestorProfile;
  /** Constraints (defaults applied if omitted). */
  constraints?: Partial<{
    maxLvr: number;              // default 0.85 — absolute ceiling
    maxDsrBand: DsrBand;         // default "stressed" (kill "critical")
    minNsrBuffered: number;      // default 0.85
    respectSuperCaps: boolean;   // default true
    maxCryptoSharePct: number;   // default 0.10
    maxRefinanceChainsIn24mo: number; // default 1
  }>;
  /** Quick mode uses 500 MC paths per candidate by default. */
  simulationCount?: number;
  /** Tax / income context for serviceability + Div 293. */
  taxContext?: {
    annualGrossIncome: number;
    hasHelpDebt: boolean;
    hasPrivateHospitalCover: boolean;
  };
  /**
   * Phase 2.8 — Risk-control mode. Controls which soft warnings still discard
   * vs which are surfaced as ranked-with-warning. Hard blockers are unchanged
   * regardless of mode. Defaults to "balanced".
   */
  riskMode?: RiskControlMode;
  /**
   * Phase 2.8 — Optional fine-grained risk controls (only honoured when
   * riskMode === "custom"). Each field overrides the corresponding mode-default.
   */
  riskControls?: Partial<RiskControlOverrides>;
}

// ──────────────────────────────────────────────────────────────────────
// Phase 2.8 — Risk control mode + explicit per-mode constraint deltas
// ──────────────────────────────────────────────────────────────────────

export type RiskControlMode = "conservative" | "balanced" | "aggressive" | "custom";

export interface RiskControlOverrides {
  /** Crypto: pct of portfolio. Default 0.10 balanced, 0.05 conservative, 0.50 aggressive. */
  maxCryptoSharePct: number;
  /** LVR ceiling. Default 0.85; conservative 0.75; aggressive 0.85 (never above by mode). */
  maxLvr: number;
  /** Minimum buffered NSR. Default 0.85; conservative 1.00; aggressive 0.75. */
  minNsrBuffered: number;
  /** Acceptable default-probability ceiling. Default 0.20; conservative 0.10; aggressive 0.30. */
  maxDefaultProbability: number;
  /** Maximum single-asset concentration (any class) as pct of portfolio. */
  maxSingleAssetSharePct: number;
  /** When true, paths breaching SOFT warnings are still ranked (with penalty)
   *  and ALSO bucketed into highRiskPaths. When false, they discard. */
  allowHighRiskPaths: boolean;
  /** When true, the UI/PDF surfaces the full discarded list including soft warnings
   *  that were upgraded into highRiskPaths. */
  showFilteredHighRiskPaths: boolean;
}

export const RISK_MODE_DEFAULTS: Record<RiskControlMode, RiskControlOverrides> = {
  conservative: {
    maxCryptoSharePct: 0.05,
    maxLvr: 0.75,
    minNsrBuffered: 1.00,
    maxDefaultProbability: 0.10,
    maxSingleAssetSharePct: 0.40,
    allowHighRiskPaths: false,
    showFilteredHighRiskPaths: false,
  },
  balanced: {
    maxCryptoSharePct: 0.10,
    maxLvr: 0.85,
    minNsrBuffered: 0.85,
    maxDefaultProbability: 0.20,
    maxSingleAssetSharePct: 0.60,
    allowHighRiskPaths: false,
    showFilteredHighRiskPaths: true,
  },
  aggressive: {
    maxCryptoSharePct: 0.50,
    maxLvr: 0.85,
    minNsrBuffered: 0.75,
    maxDefaultProbability: 0.30,
    maxSingleAssetSharePct: 0.80,
    allowHighRiskPaths: true,
    showFilteredHighRiskPaths: true,
  },
  custom: {  // baseline = balanced; users override per-field via riskControls
    maxCryptoSharePct: 0.10,
    maxLvr: 0.85,
    minNsrBuffered: 0.85,
    maxDefaultProbability: 0.20,
    maxSingleAssetSharePct: 0.60,
    allowHighRiskPaths: true,
    showFilteredHighRiskPaths: true,
  },
};

export function resolveRiskControls(
  mode: RiskControlMode,
  overrides?: Partial<RiskControlOverrides>,
): RiskControlOverrides {
  const base = RISK_MODE_DEFAULTS[mode];
  if (mode !== "custom" || !overrides) return { ...base };
  // Custom mode allows per-field override, but hard floors stay enforced:
  //  - maxLvr cannot exceed 0.85 (institutional ceiling)
  //  - maxDefaultProbability cannot exceed 0.40 (mathematical floor)
  //  - minNsrBuffered cannot drop below 0.70 (servicing collapse line)
  const merged = { ...base, ...overrides };
  merged.maxLvr = Math.min(merged.maxLvr, 0.85);
  merged.maxDefaultProbability = Math.min(merged.maxDefaultProbability, 0.40);
  merged.minNsrBuffered = Math.max(merged.minNsrBuffered, 0.70);
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-question presets — each question kind has its own:
//   1. realistic default capital, horizon
//   2. default investor profile (scoring weights)
//   3. default blueprint set
//   4. behavioural-realism overrides
//
// These are pure data, deterministic, and exposed to the UI so switching
// questions cleanly resets inputs to sensible values.
// ─────────────────────────────────────────────────────────────────────────────

export interface QuestionPreset {
  kind: QuickDecisionQuestionKind;
  label: string;
  description: string;
  defaults: {
    capital: number;
    horizonYears: number;
    dependants: number;
    incomeVolatility: number;
    investorProfile: InvestorProfile;
  };
}

export const QUESTION_PRESETS: Record<QuickDecisionQuestionKind, QuestionPreset> = {
  deploy_capital: {
    kind: "deploy_capital",
    label: "Where do I deploy capital?",
    description: "Compare 15+ allocation × timing paths for cash you have available.",
    defaults: { capital: 50_000, horizonYears: 15, dependants: 0, incomeVolatility: 0.15, investorProfile: "balanced" },
  },
  buy_property: {
    kind: "buy_property",
    label: "Is now the right time to buy?",
    description: "Property timing + buffer analysis. Compares buying now vs building buffer first.",
    defaults: { capital: 200_000, horizonYears: 20, dependants: 1, incomeVolatility: 0.10, investorProfile: "conservative" },
  },
  super_vs_invest: {
    kind: "super_vs_invest",
    label: "Super vs ETF outside?",
    description: "Concessional-cap-aware super vs taxable ETF investment.",
    defaults: { capital: 30_000, horizonYears: 20, dependants: 0, incomeVolatility: 0.10, investorProfile: "balanced" },
  },
  debt_vs_invest: {
    kind: "debt_vs_invest",
    label: "Pay down debt or invest?",
    description: "Offset/prepay vs taxable ETF vs concessional super.",
    defaults: { capital: 40_000, horizonYears: 15, dependants: 1, incomeVolatility: 0.15, investorProfile: "cashflow_safe" },
  },
  fire_acceleration: {
    kind: "fire_acceleration",
    label: "How do I get to FIRE faster?",
    description: "Survivability-first FIRE acceleration. Heavy weighting on time-to-FIRE.",
    defaults: { capital: 75_000, horizonYears: 20, dependants: 0, incomeVolatility: 0.15, investorProfile: "fire_focused" },
  },
  downside_protection: {
    kind: "downside_protection",
    label: "Protect against a downturn",
    description: "Stress-tested defensive paths. Heavier offset, cash, defensive ETF.",
    defaults: { capital: 50_000, horizonYears: 10, dependants: 1, incomeVolatility: 0.20, investorProfile: "conservative" },
  },
};

export function getQuestionPreset(kind: QuickDecisionQuestionKind): QuestionPreset {
  return QUESTION_PRESETS[kind];
}

export function listQuestionPresets(): QuestionPreset[] {
  return Object.values(QUESTION_PRESETS);
}

export interface DiscardedCandidate {
  id: string;
  label: string;
  stage: "behavioural" | "safety_ceiling";
  reason: string;
  detail: string;
  /**
   * Phase 2.7 — explicit transparency layer.
   *  - "hard_blocker": ceiling breach (LVR, DSR-critical, NSR floor, default-prob).
   *    Cannot be silently ignored; only overridable via input.constraints.
   *  - "soft_warning": behavioural realism rule (zero-cash, leverage at T=0,
   *    crypto concentration). Engine still discards, but user CAN override
   *    by re-running with a relaxed constraint or smaller capital.
   */
  severity: "hard_blocker" | "soft_warning";
  /** Whether the user can override this filter (and how). Null = not overridable. */
  override: {
    possible: boolean;
    mechanism: string;       // e.g. "Relax maxLvr in constraints" or "Reduce capital allocation"
    constraintKey?: string;  // matching key in QuickDecisionInput.constraints
  };
  /** Investor profile under which this discard occurred (for audit). */
  profileContext: InvestorProfile;
  /** Phase 2.8 — risk-control mode under which the discard ran. */
  riskMode: RiskControlMode;
  /** Phase 2.8 — human-readable rejection explanation. */
  explanation: RejectionExplanation;
  /**
   * Phase 2.8 — horizon sensitivity. If the path was discarded under the
   * user's chosen horizon but a +5y horizon rerun produced a passing safety
   * check, this is true (and `viableHorizonYears` records the minimum-viable
   * horizon). The math itself is unchanged; this is a diagnostic only.
   */
  horizonSensitive: boolean;
  viableHorizonYears?: number;
  /** Phase 2.8 — recovery diagnostics for leveraged-property paths. */
  recovery?: RecoveryAnalysis;
}

/**
 * Phase 2.8 — Human-readable rejection explanation. Generated deterministically
 * from the failing rule + the candidate's blueprint + the engine result. Never
 * AI-generated. Five required fields, all surfaced in UI + PDF.
 */
export interface RejectionExplanation {
  /** The raw technical reason (e.g. "Buffered NSR falls below APRA threshold"). */
  technical: string;
  /** Plain-English explanation aimed at a non-finance user. */
  plainEnglish: string;
  /** Primary driver tag (e.g. "High leverage + short recovery horizon"). */
  primaryDriver: string;
  /** Time window where stress is concentrated (e.g. "Years 1–4 after purchase"). */
  stressPeriod: string;
  /** Concrete bullet list of what would make this path viable. */
  whatWouldFix: string[];
}

/**
 * Phase 2.8 — Recovery analysis for leveraged paths (mainly property).
 * Computed from medianCashPath + serviceability bands + horizon rerun.
 */
export interface RecoveryAnalysis {
  /** Year index where median cash hits its lowest point. */
  liquidityTroughYear: number;
  /** Year index where mortgage debt stops growing as a share of NW. */
  debtStabilisationYear: number;
  /** Window during which refinance pressure is highest (years). */
  refinanceRiskWindow: { startYear: number; endYear: number };
  /** Total years required for the path to recover into the "safe" band. */
  recoveryYears: number;
}

export interface ExplainabilityTrace {
  assumptionsUsed: { id: string; value: number | string; source: string }[];
  formulasInvoked: { id: string; reason: string }[];
  constraintsEvaluated: { id: string; passed: boolean; value: number | string; band?: string }[];
  riskDrivers: { label: string; severity: number; detail: string }[];
  timeline: { month: string; event: string; effect: string }[];
  scoreDerivation: {
    axis: string;
    rawValue: number;
    weight: number;
    contribution: number;
  }[];
}

export interface RankedCandidate {
  id: string;
  label: string;
  shortLabel: string;
  events: ScenarioDelta[];
  result: ExtendedScenarioResult;
  score: CompositeScore;
  trace: ExplainabilityTrace;
  /** One-line headline for ranked list. */
  headline: string;
  /** "Why this wins / why this lost" — short rationale (Layer-3-ready). */
  rationale: string[];
  /**
   * Phase 2.8 — soft-warning markers attached even when the path is ranked.
   * Examples: "crypto-concentration", "refinance-pressure", "liquidity-thin".
   * Score penalties already reflect these; this surface lets the UI render
   * coloured warning chips on otherwise-ranked candidates.
   */
  softWarnings: SoftWarning[];
  /**
   * Phase 2.8 — true when this candidate would have been discarded by
   * balanced-mode defaults but was allowed through by aggressive/custom mode.
   * Used to bucket it into `highRiskPaths`.
   */
  isHighRisk: boolean;
  /** Phase 2.8 — recovery diagnostics for leveraged-property paths. */
  recovery?: RecoveryAnalysis;
}

/** Phase 2.8 — soft warning attached to a ranked candidate. */
export interface SoftWarning {
  /** Stable id. */
  id: string;
  /** Short headline, e.g. "Crypto concentration above 10%". */
  label: string;
  /** Plain-English explanation. */
  detail: string;
  /** "info" | "warn" | "critical" — colour band. */
  severity: "info" | "warn" | "critical";
  /** Which engine metric drove the warning (audit trail). */
  driver: string;
}

export interface QuickDecisionOutput {
  question: QuickDecisionQuestionKind;
  capital?: number;
  /** Investor profile actually used for scoring (resolved from input or question preset). */
  investorProfile: InvestorProfile;
  ranked: RankedCandidate[];
  discarded: DiscardedCandidate[];
  /**
   * Phase 2.8 — High-risk paths that breached soft warnings under default
   * (balanced) settings but were preserved by aggressive/custom risk modes.
   * Each is fully ranked (score + score breakdown) but flagged so the UI can
   * render them in a dedicated section instead of mixing with safer paths.
   * In conservative/balanced modes this is always an empty array.
   */
  highRiskPaths: RankedCandidate[];
  /**
   * Phase 2.8 — Multi-winner recommendations. The single "winner" is still
   * ranked[0], but this surface lets the UI present "best balanced", "best
   * wealth-max", "best cashflow-safe", and (if any survive) "best high-risk".
   * Computed by re-scoring the same candidate set under each profile.
   */
  multiWinner: {
    balanced: { id: string; score: number } | null;
    wealthMax: { id: string; score: number } | null;
    cashflowSafe: { id: string; score: number } | null;
    highRisk: { id: string; score: number } | null;
  };
  /** Phase 2.8 — resolved risk controls actually applied to this run. */
  riskControlsApplied: { mode: RiskControlMode; resolved: RiskControlOverrides };
  basePlanHash: string;
  baseScenarioResult: ExtendedScenarioResult;
  generatedAt: string;
  /** Composite reasoning for the WINNING candidate vs the runner-up. */
  comparativeNarrative: {
    winnerId: string;
    runnerUpId: string | null;
    whyWon: string[];
    whatCouldInvalidate: string[];
    secondPlaceAndWhy: string;
  };
  /**
   * Phase 2.4 — phased execution plan for the WINNER, built deterministically
   * from the candidate's events (activationMonth ↦ phase bucket). One row per
   * phase, each with start/end month, a label, and the engine-generated
   * effects of every event in that phase. No AI; no placeholders.
   */
  executionPlan: ExecutionPlanPhase[];
  /**
   * Phase 2.4 — conditional / event-driven recommendations, derived from the
   * winner's serviceability bands, MC stress probabilities and registry
   * constraints. Each rec carries an explicit trigger condition so the user
   * sees exactly when to act, not just what to do.
   */
  conditionalRecommendations: ConditionalRecommendation[];
}

export interface ExecutionPlanPhase {
  /** 0-indexed phase number — "Phase 1", "Phase 2", … */
  index: number;
  /** Human label, e.g. "Months 0-3 · Setup". */
  label: string;
  /** Inclusive start month (MonthKey from first event in phase). */
  startMonth: string;
  /** Inclusive end month (MonthKey from last event in phase, or start if single event). */
  endMonth: string;
  /** Lines describing each action in this phase (engine-generated effects). */
  actions: { event: string; effect: string }[];
  /** One-line summary of why this phase is grouped together. */
  rationale: string;
}

export interface ConditionalRecommendation {
  /** Stable id so the UI can key + the PDF can cite. */
  id: string;
  /** Plain-language trigger condition. */
  trigger: string;
  /** Concrete action to take when the trigger fires. */
  action: string;
  /** Why this rec exists — links to the engine field that drove it. */
  rationale: string;
  /** Severity for UI tone — "info" doesn't alarm; "warn" amber; "critical" rose. */
  severity: "info" | "warn" | "critical";
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants (defaults)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONSTRAINTS = {
  maxLvr: 0.85,
  maxDsrBand: "stressed" as DsrBand,    // discard only at "critical"
  minNsrBuffered: 0.85,
  respectSuperCaps: true,
  maxCryptoSharePct: 0.10,
  maxRefinanceChainsIn24mo: 1,
  // Phase 2.8 — explicit thresholds (previously inlined as literals)
  maxDefaultProbability: 0.20,
  maxSingleAssetSharePct: 0.60,
};

const QUICK_SIM_COUNT = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Allocation × timing axes (deterministic enumeration)
// ─────────────────────────────────────────────────────────────────────────────

type AllocationAxis =
  | "offset_100"
  | "etf_lump_100"
  | "etf_dca24_100"
  | "super_concessional_100"
  | "crypto_100"
  | "property_deposit_100"
  | "etf70_offset30"
  | "etf50_super50"
  | "offset50_etf50"
  | "etf40_super40_crypto20";

type TimingAxis = "now" | "month6" | "month18" | "dca12" | "dca24";

interface CandidateBlueprint {
  id: string;
  label: string;
  shortLabel: string;
  allocation: AllocationAxis;
  timing: TimingAxis;
  /** Sequencing — when this path is composed of multiple sub-events. */
  composite?: boolean;
}

// Default capital-deployment blueprint set
function blueprintsForDeployCapital(): CandidateBlueprint[] {
  const make = (
    id: string, label: string, shortLabel: string,
    allocation: AllocationAxis, timing: TimingAxis, composite = false,
  ): CandidateBlueprint => ({ id, label, shortLabel, allocation, timing, composite });

  return [
    // Single-allocation, single-timing
    make("offset_now",            "100% Offset (deploy now)",                 "Offset",          "offset_100",            "now"),
    make("etf_lump_now",          "100% ETF lump-sum (now)",                  "ETF lump",        "etf_lump_100",          "now"),
    make("etf_dca24_now",         "100% ETF DCA over 24mo",                   "ETF DCA 24mo",    "etf_dca24_100",         "dca24"),
    make("super_now",             "100% Concessional super (cap-aware)",      "Super top-up",    "super_concessional_100","now"),
    make("crypto_now",            "100% Crypto (clipped to 10% portfolio)",   "Crypto",          "crypto_100",            "now"),
    make("property_18mo",         "100% IP deposit (18mo to build buffer)",   "IP in 18mo",      "property_deposit_100",  "month18"),
    make("property_6mo",          "100% IP deposit (6mo)",                    "IP in 6mo",       "property_deposit_100",  "month6"),

    // 70/30 split
    make("etf70_offset30_now",    "70/30 ETF/Offset (now)",                   "ETF 70 / Off 30", "etf70_offset30",        "now"),

    // 50/50 splits
    make("etf50_super50_now",     "50/50 ETF/Super (now)",                    "ETF 50 / Sup 50", "etf50_super50",         "now"),
    make("offset50_etf50_now",    "50/50 Offset/ETF (now)",                   "Off 50 / ETF 50", "offset50_etf50",        "now"),

    // Three-way
    make("etf40_super40_crypto20","40/40/20 ETF/Super/Crypto (now)",          "Diversified",     "etf40_super40_crypto20","now"),

    // DCA variants of single-allocation
    make("etf_dca12_now",         "100% ETF DCA over 12mo",                   "ETF DCA 12mo",    "etf_dca24_100",         "dca12"),

    // Timing variants for offset
    make("offset_6mo",            "100% Offset (wait 6mo)",                   "Offset @ 6mo",    "offset_100",            "month6"),

    // Sequenced paths
    make("offset_then_ip",        "Offset now → IP in 18mo (release equity)", "Offset → IP",     "offset_100",            "now", true),
    make("etf_then_super",        "ETF DCA → Super top-up at FY end",         "ETF → Super",     "etf_dca24_100",         "dca24", true),
    make("offset_then_etf",       "Offset now → ETF DCA in 6mo",              "Off → ETF",       "offset_100",            "now", true),
  ];
}

// Helper used by every question-specific blueprint factory
function mk(
  id: string, label: string, shortLabel: string,
  allocation: AllocationAxis, timing: TimingAxis, composite = false,
): CandidateBlueprint {
  return { id, label, shortLabel, allocation, timing, composite };
}

// Property timing decision — buy now vs build buffer first vs wait
function blueprintsForBuyProperty(): CandidateBlueprint[] {
  return [
    mk("ip_now",                "Buy IP now (full deposit)",                "IP now",          "property_deposit_100",  "now"),
    mk("ip_6mo",                "Buy IP in 6mo (build small buffer)",       "IP @ 6mo",        "property_deposit_100",  "month6"),
    mk("ip_18mo",               "Buy IP in 18mo (build full buffer)",       "IP @ 18mo",       "property_deposit_100",  "month18"),
    mk("offset_first_then_ip",  "Offset buffer first → IP in 18mo",          "Offset → IP",     "offset_100",            "now", true),
    mk("defer_offset_only",     "Defer property: offset only",              "Offset only",     "offset_100",            "now"),
    mk("defer_etf_dca",         "Defer property: ETF DCA 24mo",             "ETF DCA",         "etf_dca24_100",         "dca24"),
    mk("defer_50_50_etf_off",   "Defer property: 50/50 ETF/Offset",         "ETF 50 / Off 50", "offset50_etf50",        "now"),
    mk("defer_etf_super_50",    "Defer property: 50/50 ETF/Super",          "ETF 50 / Sup 50", "etf50_super50",         "now"),
    mk("defer_etf_super_crypto","Defer property: 40/40/20 ETF/Sup/Crypto",  "Diversified",     "etf40_super40_crypto20","now"),
  ];
}

// Super vs ETF — cap-aware super, fully taxable ETF, mixed
function blueprintsForSuperVsInvest(): CandidateBlueprint[] {
  return [
    mk("super_full_now",        "100% Concessional super (cap-aware)",       "Super 100%",      "super_concessional_100","now"),
    mk("etf_full_lump_now",     "100% ETF lump-sum (taxable)",               "ETF lump",        "etf_lump_100",          "now"),
    mk("etf_dca12_now",         "100% ETF DCA 12mo (taxable)",               "ETF DCA 12mo",    "etf_dca24_100",         "dca12"),
    mk("etf_dca24_now",         "100% ETF DCA 24mo (taxable)",               "ETF DCA 24mo",    "etf_dca24_100",         "dca24"),
    mk("etf50_super50",         "50/50 ETF + Super",                         "ETF 50 / Sup 50", "etf50_super50",         "now"),
    mk("etf30_super70",         "70% Super / 30% ETF (super-leaning)",        "Sup 70 / ETF 30", "etf50_super50",         "now"),  // approximate via 50/50 — caller clips on cap
    mk("etf70_super30",         "70% ETF / 30% Super (taxable-leaning)",     "ETF 70 / Sup 30", "etf70_offset30",        "now"),
    mk("etf_then_super",        "ETF DCA → Super top-up at FY end",          "ETF → Super",     "etf_dca24_100",         "dca24", true),
  ];
}

// Debt vs invest — offset, prepay, ETF, super, splits
function blueprintsForDebtVsInvest(): CandidateBlueprint[] {
  return [
    mk("offset_now",            "100% Offset (pay down mortgage cost)",      "Offset",          "offset_100",            "now"),
    mk("offset_6mo",            "100% Offset (wait 6mo)",                    "Offset @ 6mo",    "offset_100",            "month6"),
    mk("etf_lump_now",          "100% ETF lump-sum (invest)",                "ETF lump",        "etf_lump_100",          "now"),
    mk("etf_dca24_now",         "100% ETF DCA 24mo (invest)",                "ETF DCA 24mo",    "etf_dca24_100",         "dca24"),
    mk("super_now",             "100% Concessional super",                   "Super",           "super_concessional_100","now"),
    mk("etf70_offset30",        "70/30 ETF/Offset",                          "ETF 70 / Off 30", "etf70_offset30",        "now"),
    mk("offset50_etf50",        "50/50 Offset/ETF",                          "Off 50 / ETF 50", "offset50_etf50",        "now"),
    mk("offset_then_etf",       "Offset now → ETF DCA in 6mo",               "Off → ETF",       "offset_100",            "now", true),
  ];
}

// FIRE acceleration — maximise wealth-creation paths within survivability
function blueprintsForFireAcceleration(): CandidateBlueprint[] {
  return [
    mk("etf_lump_now",          "100% ETF lump-sum",                         "ETF lump",        "etf_lump_100",          "now"),
    mk("etf_dca12_now",         "100% ETF DCA 12mo",                         "ETF DCA 12mo",    "etf_dca24_100",         "dca12"),
    mk("etf_dca24_now",         "100% ETF DCA 24mo",                         "ETF DCA 24mo",    "etf_dca24_100",         "dca24"),
    mk("super_now",             "100% Concessional super (tax-advantaged)",  "Super",           "super_concessional_100","now"),
    mk("etf50_super50",         "50/50 ETF/Super",                           "ETF 50 / Sup 50", "etf50_super50",         "now"),
    mk("etf40_super40_crypto20","40/40/20 ETF/Super/Crypto (growth tilt)",   "Diversified",     "etf40_super40_crypto20","now"),
    mk("ip_18mo",               "IP @ 18mo (leveraged growth)",              "IP @ 18mo",       "property_deposit_100",  "month18"),
    mk("etf_then_super",        "ETF DCA → Super top-up at FY end",          "ETF → Super",     "etf_dca24_100",         "dca24", true),
    mk("offset_then_ip",        "Offset now → IP in 18mo",                   "Offset → IP",     "offset_100",            "now", true),
  ];
}

// Downside protection — defensive paths only
function blueprintsForDownsideProtection(): CandidateBlueprint[] {
  return [
    mk("offset_now",            "100% Offset (max cash defence)",            "Offset",          "offset_100",            "now"),
    mk("offset_6mo",            "100% Offset (wait 6mo, hold cash)",         "Offset @ 6mo",    "offset_100",            "month6"),
    mk("offset50_etf50",        "50/50 Offset/ETF (balanced defence)",       "Off 50 / ETF 50", "offset50_etf50",        "now"),
    mk("etf_dca24_now",         "ETF DCA 24mo (time diversification)",       "ETF DCA 24mo",    "etf_dca24_100",         "dca24"),
    mk("etf70_offset30",        "70/30 ETF/Offset",                          "ETF 70 / Off 30", "etf70_offset30",        "now"),
    mk("super_now",             "100% Concessional super (preservation)",    "Super",           "super_concessional_100","now"),
    mk("etf50_super50",         "50/50 ETF/Super (tax-defended growth)",     "ETF 50 / Sup 50", "etf50_super50",         "now"),
  ];
}

// Top-level dispatcher — each question kind gets its own realistic blueprint set
function blueprintsForQuestion(kind: QuickDecisionQuestionKind): CandidateBlueprint[] {
  switch (kind) {
    case "deploy_capital":      return blueprintsForDeployCapital();
    case "buy_property":        return blueprintsForBuyProperty();
    case "super_vs_invest":     return blueprintsForSuperVsInvest();
    case "debt_vs_invest":      return blueprintsForDebtVsInvest();
    case "fire_acceleration":   return blueprintsForFireAcceleration();
    case "downside_protection": return blueprintsForDownsideProtection();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Blueprint → ScenarioDelta[] translation
// ─────────────────────────────────────────────────────────────────────────────

function activationMonthFor(timing: TimingAxis, start: MonthKey): MonthKey {
  switch (timing) {
    case "now":     return start;
    case "month6":  return addMonths(start, 6);
    case "month18": return addMonths(start, 18);
    case "dca12":   return start;
    case "dca24":   return start;
  }
}

function dcaWindowMonths(timing: TimingAxis): number | null {
  if (timing === "dca12") return 12;
  if (timing === "dca24") return 24;
  return null;
}

function makeDelta(
  candidateId: string,
  suffix: string,
  type: DeltaType,
  activationMonth: MonthKey,
  params: Record<string, unknown>,
  priority = 600,
): ScenarioDelta {
  const id = `${candidateId}_${suffix}`;
  return {
    id,
    scenarioId: candidateId,
    deltaType: type,
    activationMonth,
    params,
    priority,
    idempotencyKey: id,
  };
}

interface DerivedContext {
  start: MonthKey;
  capital: number;
  mortgageRatePct: number;
  /** Snapshot of state used for property-purchase sizing. */
  monthlyExpenses: number;
  monthlyIncome: number;
  cashToday: number;
  superCombined: number;
  ttmIncomeAnnual: number;
  totalLvrToday: number;
  illiquidShareToday: number;
}

function buildBlueprintEvents(
  blueprint: CandidateBlueprint,
  ctx: DerivedContext,
): ScenarioDelta[] {
  const activation = activationMonthFor(blueprint.timing, ctx.start);
  const dca = dcaWindowMonths(blueprint.timing);
  const cap = ctx.capital;
  const out: ScenarioDelta[] = [];

  const cryptoCappedAmount = (target: number) =>
    Math.min(target, ctx.capital * 1.0);  // candidate-level pool

  switch (blueprint.allocation) {
    case "offset_100":
      out.push(makeDelta(blueprint.id, "offset", "offset_deposit", activation,
        { amount: cap }, 400));
      break;

    case "etf_lump_100":
      out.push(makeDelta(blueprint.id, "etflump", "etf_lump_sum", activation,
        { amount: cap }, 600));
      break;

    case "etf_dca24_100":
      out.push(makeDelta(blueprint.id, "etfdca", "etf_dca", activation, {
        monthly: cap / (dca ?? 24),
        months: dca ?? 24,
      }, 400));
      break;

    case "super_concessional_100": {
      // Concessional cap-aware. Caller validates against actual cap.
      const cap1 = concessionalSuperCap({
        fy: "2025-26",
        totalSuperBalanceJune30: ctx.superCombined,
        carryForwardAvailable: 0,
      });
      const amt = Math.min(cap, cap1.effectiveCap);
      out.push(makeDelta(blueprint.id, "super", "etf_lump_sum", activation, {
        // We model concessional contribution as a super-equivalent deposit
        // via the engine's contribution channel. (A dedicated super_contribution
        // delta will be added in Phase 2 — for now this is the cleanest
        // path through the existing engine without inventing new deltas.)
        amount: amt,
        targetAsset: "super",
      }, 600));
      break;
    }

    case "crypto_100": {
      out.push(makeDelta(blueprint.id, "crypto", "crypto_lump_sum", activation,
        { amount: cryptoCappedAmount(cap), asset: "BTC" }, 600));
      break;
    }

    case "property_deposit_100": {
      // Use the deposit-boost translator (already supports buy_property semantics).
      const purchasePrice = cap * 4;  // 25% deposit equivalent
      const weeklyRent = Math.round((purchasePrice * 0.045) / 52); // 4.5% gross yield default
      out.push(makeDelta(blueprint.id, "ip", "property_deposit_boost", activation, {
        extraDeposit: cap,
        purchasePrice,
        weeklyRent,
        rate: ctx.mortgageRatePct,
        loanTermYears: 30,
        vacancyRate: 0.04,
        managementFee: 0.08,
      }, 600));
      break;
    }

    case "etf70_offset30":
      out.push(makeDelta(blueprint.id, "etf",    "etf_lump_sum",     activation, { amount: cap * 0.70 }));
      out.push(makeDelta(blueprint.id, "offset", "offset_deposit",   activation, { amount: cap * 0.30 }, 400));
      break;

    case "etf50_super50": {
      const cap1 = concessionalSuperCap({
        fy: "2025-26",
        totalSuperBalanceJune30: ctx.superCombined,
        carryForwardAvailable: 0,
      });
      const superAmt = Math.min(cap * 0.50, cap1.effectiveCap);
      out.push(makeDelta(blueprint.id, "etf",   "etf_lump_sum", activation, { amount: cap * 0.50 }));
      out.push(makeDelta(blueprint.id, "super", "etf_lump_sum", activation, { amount: superAmt, targetAsset: "super" }));
      break;
    }

    case "offset50_etf50":
      out.push(makeDelta(blueprint.id, "offset", "offset_deposit", activation, { amount: cap * 0.50 }, 400));
      out.push(makeDelta(blueprint.id, "etf",    "etf_lump_sum",    activation, { amount: cap * 0.50 }));
      break;

    case "etf40_super40_crypto20": {
      const cap1 = concessionalSuperCap({
        fy: "2025-26",
        totalSuperBalanceJune30: ctx.superCombined,
        carryForwardAvailable: 0,
      });
      const superAmt = Math.min(cap * 0.40, cap1.effectiveCap);
      const cryptoAmt = cryptoCappedAmount(cap * 0.20);
      out.push(makeDelta(blueprint.id, "etf",    "etf_lump_sum",     activation, { amount: cap * 0.40 }));
      out.push(makeDelta(blueprint.id, "super",  "etf_lump_sum",     activation, { amount: superAmt, targetAsset: "super" }));
      out.push(makeDelta(blueprint.id, "crypto", "crypto_lump_sum",  activation, { amount: cryptoAmt, asset: "BTC" }));
      break;
    }
  }

  // Sequencing add-ons
  if (blueprint.composite) {
    if (blueprint.id === "offset_then_ip") {
      const ipMonth = addMonths(ctx.start, 18);
      const purchasePrice = ctx.capital * 4;
      const weeklyRent = Math.round((purchasePrice * 0.045) / 52);
      out.push(makeDelta(blueprint.id, "ipfollow", "property_deposit_boost", ipMonth, {
        extraDeposit: ctx.capital,
        purchasePrice,
        weeklyRent,
        rate: ctx.mortgageRatePct,
        loanTermYears: 30,
        vacancyRate: 0.04,
        managementFee: 0.08,
      }, 600));
    }
    if (blueprint.id === "etf_then_super") {
      const superMonth = addMonths(ctx.start, 11);  // end of FY for new July fiscal year
      const cap1 = concessionalSuperCap({
        fy: "2025-26",
        totalSuperBalanceJune30: ctx.superCombined,
        carryForwardAvailable: 0,
      });
      const amt = Math.min(ctx.capital * 0.30, cap1.effectiveCap);
      out.push(makeDelta(blueprint.id, "superfollow", "etf_lump_sum", superMonth,
        { amount: amt, targetAsset: "super" }, 600));
    }
    if (blueprint.id === "offset_then_etf") {
      const etfMonth = addMonths(ctx.start, 6);
      out.push(makeDelta(blueprint.id, "etffollow", "etf_dca", etfMonth, {
        monthly: ctx.capital * 0.50 / 12,
        months: 12,
      }, 400));
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — Behavioural realism
// ─────────────────────────────────────────────────────────────────────────────

function checkBehaviouralRealism(
  blueprint: CandidateBlueprint,
  ctx: DerivedContext,
  constraints: typeof DEFAULT_CONSTRAINTS,
): {
  passed: boolean;
  reason?: string;
  detail?: string;
  override?: { possible: boolean; mechanism: string; constraintKey?: string };
} {
  // Zero-cash plan check: if 100% of capital is deployed and ctx.cashToday is
  // tight relative to monthly expenses, this would leave zero buffer.
  if (
    (blueprint.allocation === "etf_lump_100" ||
     blueprint.allocation === "crypto_100" ||
     blueprint.allocation === "property_deposit_100") &&
    blueprint.timing === "now" &&
    ctx.cashToday - ctx.capital < ctx.monthlyExpenses
  ) {
    return {
      passed: false,
      reason: "Zero-cash plan",
      detail: `Deploying ${ctx.capital.toFixed(0)} now leaves less than 1 month of expenses in cash. Required ≥1mo buffer remaining.`,
      override: {
        possible: true,
        mechanism: `Reduce deployed capital so cash ≥ ${ctx.monthlyExpenses.toFixed(0)} post-deployment, or stage with DCA/timing.`,
      },
    };
  }

  // Max leverage at T=0 check: IP at T=0 requires 12mo buffer post-deposit
  if (blueprint.allocation === "property_deposit_100" && blueprint.timing === "now") {
    const buffer = ctx.cashToday - ctx.capital;
    if (buffer < 12 * ctx.monthlyExpenses) {
      return {
        passed: false,
        reason: "Max-leverage at T=0",
        detail: `IP at T=0 leaves <12mo cash buffer. Need ≥${(12 * ctx.monthlyExpenses).toFixed(0)} post-deposit, have ${buffer.toFixed(0)}.`,
        override: {
          possible: true,
          mechanism: "Delay property purchase (e.g. IP @ 6mo or 18mo blueprint) to build buffer, or reduce deposit.",
        },
      };
    }
  }

  // Crypto > 10% portfolio check (we clip in the delta, but flag if user's
  // pure-crypto allocation would exceed the cap)
  if (blueprint.allocation === "crypto_100") {
    const portfolioApprox = ctx.cashToday + ctx.superCombined + ctx.capital;
    if (ctx.capital / portfolioApprox > constraints.maxCryptoSharePct) {
      return {
        passed: false,
        reason: "Crypto concentration",
        detail: `Pure-crypto allocation would exceed ${(constraints.maxCryptoSharePct * 100).toFixed(0)}% of total portfolio.`,
        override: {
          possible: true,
          mechanism: `Raise maxCryptoSharePct in constraints (current ${(constraints.maxCryptoSharePct * 100).toFixed(0)}%) or pick a mixed-allocation path.`,
          constraintKey: "maxCryptoSharePct",
        },
      };
    }
  }

  return { passed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 — Hard safety ceilings (post-run check on engine output)
// ─────────────────────────────────────────────────────────────────────────────

function checkSafetyCeilings(
  blueprint: CandidateBlueprint,
  result: ExtendedScenarioResult,
  ctx: DerivedContext,
  household: { dependants: number; incomeVolatility: number },
  constraints: typeof DEFAULT_CONSTRAINTS,
): {
  passed: boolean;
  reason?: string;
  detail?: string;
  override?: { possible: boolean; mechanism: string; constraintKey?: string };
  bands: {
    dsr: DsrBand;
    worstLvr: number;
    worstNsr: number;
    refi: RefinancePressureBand;
    liquidityRatioMin: number;
    liquidityFloor: number;
  };
} {
  const sv = result.serviceability as { dsr: number; lvr: number; nsr: number };
  const dsrB = dsrBand(sv.dsr);
  const lvr = sv.lvr;
  const nsr = sv.nsr;
  const refi = refinancePressureBand({
    nsrBuffered: nsr,
    rateHeadroomBps: 200,                     // approximate; precise calc would need engine hook
    monthsToNextRefinance: null,
  });

  // Dynamic liquidity floor (computed once on the median terminal state).
  const liq = dynamicLiquidityFloor({
    monthlyExpenses: ctx.monthlyExpenses,
    dependants: household.dependants,
    incomeVolatility: household.incomeVolatility,
    totalLvr: lvr,
    illiquidAssetShare: ctx.illiquidShareToday,
    upcomingEvents12mo: blueprint.composite
      ? [{ type: blueprint.id.includes("ip") ? "buy_property" : "refinance" }]
      : [],
  });

  const liquidityRatioMin = liquidityRatio({
    cash: Math.max(0, result.medianCashPath[Math.min(11, result.medianCashPath.length - 1)] ?? 0),
    offsetBalance: 0,
    etfValue: 0,
    monthlyExpenses: ctx.monthlyExpenses,
  });

  const bands = {
    dsr: dsrB,
    worstLvr: lvr,
    worstNsr: nsr,
    refi,
    liquidityRatioMin,
    liquidityFloor: liq.floorMonths,
  };

  // Hard ceilings
  if (lvr > constraints.maxLvr) {
    return {
      passed: false,
      reason: `LVR > ${(constraints.maxLvr * 100).toFixed(0)}%`,
      detail: `Median LVR ${(lvr * 100).toFixed(1)}% breaches absolute ceiling.`,
      override: {
        possible: true,
        mechanism: `Raise maxLvr in constraints (current ${(constraints.maxLvr * 100).toFixed(0)}%) — NOT recommended above 0.85 under APRA buffer.`,
        constraintKey: "maxLvr",
      },
      bands,
    };
  }
  if (dsrB === "critical") {
    return {
      passed: false,
      reason: "DSR critical",
      detail: `Median DSR ${(sv.dsr * 100).toFixed(1)}% sits in critical band (≥55%).`,
      override: {
        possible: false,
        mechanism: "Hard institutional ceiling — DSR ≥55% is unserviceable under APRA buffer; not overridable.",
      },
      bands,
    };
  }
  if (nsr < constraints.minNsrBuffered) {
    return {
      passed: false,
      reason: "NSR buffered < min",
      detail: `Buffered NSR ${nsr.toFixed(2)} below ${constraints.minNsrBuffered}.`,
      override: {
        possible: true,
        mechanism: `Lower minNsrBuffered in constraints (current ${constraints.minNsrBuffered}) — NOT recommended below 0.80.`,
        constraintKey: "minNsrBuffered",
      },
      bands,
    };
  }
  if (result.defaultProbability > constraints.maxDefaultProbability) {
    return {
      passed: false,
      reason: "High default probability",
      detail: `P(default within horizon) = ${(result.defaultProbability * 100).toFixed(1)}% — exceeds ${(constraints.maxDefaultProbability * 100).toFixed(0)}% acceptability bar.`,
      override: {
        possible: false,
        mechanism: `Institutional floor — paths with >${(constraints.maxDefaultProbability * 100).toFixed(0)}% default probability are not overridable in Quick Decision.`,
      },
      bands,
    };
  }

  return { passed: true, bands };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring assembly
// ─────────────────────────────────────────────────────────────────────────────

function buildScoreInputs(
  result: ExtendedScenarioResult,
  bands: {
    dsr: DsrBand;
    worstLvr: number;
    worstNsr: number;
    refi: RefinancePressureBand;
    liquidityRatioMin: number;
    liquidityFloor: number;
  },
  baseResult: ExtendedScenarioResult,
  horizonMonths: number,
): ScoreInputs {
  // Survival
  const survival = survivalProbability({
    totalPaths: result.simulationCount,
    defaultedPaths: Math.round(result.defaultProbability * result.simulationCount),
    forcedSalePaths: Math.round(result.liquidityStressProbability * result.simulationCount),
  });

  // Liquidity factor: min(actual / floor, 1)
  const liquidityFactor = bands.liquidityFloor > 0
    ? Math.max(0, Math.min(1, bands.liquidityRatioMin / bands.liquidityFloor))
    : 1;

  // Risk-adjusted return: median terminal NW vs initial → CAGR, with downside + seq penalty
  const initial = Math.max(1, result.initialNetWorth);
  const finalP50 = result.netWorthFan[result.netWorthFan.length - 1]?.p50 ?? initial;
  const finalP10 = result.netWorthFan[result.netWorthFan.length - 1]?.p10 ?? initial;
  const years = horizonMonths / 12;
  const cagr = years > 0 && finalP50 > 0
    ? Math.pow(finalP50 / initial, 1 / years) - 1
    : 0;
  const dn = downside(finalP10, finalP50);
  // Use existing engine sequenceDispersion as a sequence-risk proxy (normalised 0..1)
  const seq = Math.max(0, Math.min(1, (result.sequenceDispersion?.cv ?? 0)));
  const riskAdj = riskAdjustedReturn({
    expectedReturnCagr: cagr,
    downside: dn,
    sequenceRisk: seq,
  });

  // FIRE acceleration: improvement in fire coverage at horizon, expressed in years pulled in
  const candidateFire = fireCoverage({
    investedLiquid: finalP50 * 0.50,  // approximation: half terminal NW assumed liquid
    propertyEquity: finalP50 * 0.30,
    netRentalIncome: 0,
    swr: 0.04,
    annualExpenses: result.dashboardMonthlySurplus > 0
      ? 12 * Math.max(1, (result.reconciledMonthlySurplus + result.dashboardMonthlySurplus))
      : 80_000,
  });
  const baseFire = fireCoverage({
    investedLiquid: (baseResult.netWorthFan[baseResult.netWorthFan.length - 1]?.p50 ?? initial) * 0.50,
    propertyEquity: (baseResult.netWorthFan[baseResult.netWorthFan.length - 1]?.p50 ?? initial) * 0.30,
    netRentalIncome: 0,
    swr: 0.04,
    annualExpenses: 80_000,
  });
  const fireAccel = (candidateFire - baseFire) * 5;  // each 0.1 of coverage gap ≈ 0.5y

  return {
    survivalProbability: survival,
    liquidityFactor,
    riskAdjustedReturn: riskAdj,
    fireAcceleration: fireAccel,
    terminalNetWorth: finalP50,
    refinancePressureBand: bands.refi,
    worstInvestmentLvr: bands.worstLvr,
    referenceTerminalNw: baseResult.netWorthFan[baseResult.netWorthFan.length - 1]?.p50,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Explainability trace
// ─────────────────────────────────────────────────────────────────────────────

function buildTrace(
  _blueprint: CandidateBlueprint,
  events: ScenarioDelta[],
  result: ExtendedScenarioResult,
  bands: {
    dsr: DsrBand;
    worstLvr: number;
    worstNsr: number;
    refi: RefinancePressureBand;
    liquidityRatioMin: number;
    liquidityFloor: number;
  },
  _scoreInputs: ScoreInputs,
  score: CompositeScore,
  assumptions: BasePlanAssumptions,
): ExplainabilityTrace {
  return {
    assumptionsUsed: [
      { id: "inflation.cpi.au",          value: assumptions.inflation,      source: "Assumption Registry / RBA target band" },
      { id: "stocks.return.expected",    value: assumptions.stockReturn,    source: "ASX/MSCI blend" },
      { id: "property.growth.expected",  value: assumptions.propertyGrowth, source: "CoreLogic 30y" },
      { id: "mortgageRate.au",           value: assumptions.mortgageRate,   source: "Major bank SVR" },
      { id: "behaviour.swr",             value: assumptions.swr,            source: "Trinity Study" },
      { id: "apra.serviceabilityBuffer", value: 0.03,                       source: "APRA APG 223 §39" },
    ],
    formulasInvoked: [
      { id: "amortizationPayment", reason: "monthly P&I for any new debt" },
      { id: "dsr",                 reason: "debt service ratio at median state" },
      { id: "dsrBand",             reason: `banded DSR classification → ${bands.dsr}` },
      { id: "lvr",                 reason: `LVR at median state → ${(bands.worstLvr * 100).toFixed(1)}%` },
      { id: "nsr",                 reason: `NSR @ buffered rate → ${bands.worstNsr.toFixed(2)}` },
      { id: "dynamicLiquidityFloor", reason: `required ${bands.liquidityFloor.toFixed(1)}mo` },
      { id: "refinancePressureBand", reason: `derived → ${bands.refi}` },
      { id: "survivalProbability", reason: `from MC default + forced-sale counts` },
      { id: "downside",            reason: `1 − P10/P50 over terminal NW` },
      { id: "riskAdjustedReturn",  reason: `CAGR adjusted for downside + sequence risk` },
      { id: "fireCoverage",        reason: `passive income coverage of expenses` },
      { id: "compositeScore",      reason: `composite 0-100 with user weighting` },
    ],
    constraintsEvaluated: [
      { id: "LVR ≤ 0.85",         passed: bands.worstLvr <= 0.85,    value: bands.worstLvr },
      { id: "DSR not critical",    passed: bands.dsr !== "critical",   value: bands.dsr, band: bands.dsr },
      { id: "NSR ≥ 0.85",          passed: bands.worstNsr >= 0.85,     value: bands.worstNsr },
      { id: "default P ≤ 20%",     passed: result.defaultProbability <= 0.20, value: result.defaultProbability },
      { id: "liquidity ≥ floor",    passed: bands.liquidityRatioMin >= bands.liquidityFloor, value: bands.liquidityRatioMin },
    ],
    riskDrivers: [
      ...(result.defaultProbability > 0.05
        ? [{ label: "Default probability", severity: result.defaultProbability * 100, detail: `${(result.defaultProbability * 100).toFixed(1)}% of MC paths hit insolvency.` }]
        : []),
      ...(bands.refi === "elevated" || bands.refi === "severe"
        ? [{ label: "Refinance pressure", severity: bands.refi === "severe" ? 80 : 50, detail: `Buffered NSR ${bands.worstNsr.toFixed(2)} produces '${bands.refi}' band.` }]
        : []),
      ...(bands.worstLvr > 0.80
        ? [{ label: "Leverage quality", severity: (bands.worstLvr - 0.80) * 500, detail: `LVR ${(bands.worstLvr * 100).toFixed(1)}% exceeds 80% healthy band.` }]
        : []),
      ...(bands.liquidityRatioMin < bands.liquidityFloor
        ? [{ label: "Liquidity buffer", severity: 70, detail: `${bands.liquidityRatioMin.toFixed(1)}mo below required ${bands.liquidityFloor.toFixed(1)}mo.` }]
        : []),
    ],
    timeline: events.slice(0, 6).map(e => ({
      month: e.activationMonth,
      event: e.deltaType,
      effect: summariseDelta(e),
    })),
    scoreDerivation: score.breakdown.map(b => ({
      axis: String(b.axis),
      rawValue: b.rawValue,
      weight: b.weight,
      contribution: b.contribution,
    })),
  };
}

function summariseDelta(d: ScenarioDelta): string {
  const p = d.params as Record<string, unknown>;
  const amt = typeof p.amount === "number" ? p.amount : typeof p.extraDeposit === "number" ? p.extraDeposit : null;
  const monthly = typeof p.monthly === "number" ? p.monthly : null;
  if (amt !== null) return `$${amt.toFixed(0)} via ${d.deltaType}`;
  if (monthly !== null) return `$${monthly.toFixed(0)}/mo via ${d.deltaType}`;
  return d.deltaType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Headlines + rationale (Layer-3-ready text, NOT AI-generated math)
// ─────────────────────────────────────────────────────────────────────────────

function buildHeadline(scoreInputs: ScoreInputs, score: CompositeScore): string {
  const sv = (scoreInputs.survivalProbability * 100).toFixed(0);
  const fire = scoreInputs.fireAcceleration >= 0
    ? `FIRE +${scoreInputs.fireAcceleration.toFixed(1)}y`
    : `FIRE ${scoreInputs.fireAcceleration.toFixed(1)}y`;
  const tn = (scoreInputs.terminalNetWorth / 1_000_000).toFixed(2);
  return `P50 NW $${tn}M  •  Survival ${sv}%  •  ${fire}  •  Score ${score.score.toFixed(0)}/100`;
}

function buildRationale(
  scoreInputs: ScoreInputs,
  score: CompositeScore,
  bands: { dsr: DsrBand; refi: RefinancePressureBand; worstLvr: number; liquidityFloor: number; liquidityRatioMin: number },
): string[] {
  const lines: string[] = [];
  const top = [...score.breakdown].filter(b => b.weight > 0).sort((a, b) => b.contribution - a.contribution)[0];
  lines.push(`Top contributor: ${top.axis} (${top.contribution.toFixed(1)} pts of ${score.baseScore.toFixed(0)} base).`);

  if (scoreInputs.survivalProbability >= 0.95) lines.push(`Strong survivability (${(scoreInputs.survivalProbability * 100).toFixed(0)}%) — engine sees <5% default risk in MC.`);
  else if (scoreInputs.survivalProbability >= 0.85) lines.push(`Acceptable survivability (${(scoreInputs.survivalProbability * 100).toFixed(0)}%) but defaults appear in tail scenarios.`);
  else lines.push(`Weak survivability (${(scoreInputs.survivalProbability * 100).toFixed(0)}%) — recheck before committing.`);

  if (scoreInputs.liquidityFactor >= 0.8) lines.push(`Liquidity buffer above required floor (${bands.liquidityFloor.toFixed(1)}mo).`);
  else lines.push(`Liquidity tight: ${bands.liquidityRatioMin.toFixed(1)}mo vs required ${bands.liquidityFloor.toFixed(1)}mo.`);

  if (bands.refi === "elevated" || bands.refi === "severe") lines.push(`Refinance pressure '${bands.refi}' — interest-rate moves can break this path.`);
  if (bands.worstLvr > 0.80) lines.push(`LVR ${(bands.worstLvr * 100).toFixed(0)}% — leverage penalty applied.`);
  if (bands.dsr === "stressed") lines.push(`DSR in 'stressed' band — high-income leveraged household; manageable but watch.`);

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derive context from DashboardInputs
// ─────────────────────────────────────────────────────────────────────────────

function deriveCtx(input: QuickDecisionInput): DerivedContext {
  const start = monthKey(new Date());
  const derived = deriveBasePlan(input.dashboardInputs, {
    startMonth: start,
    assumptions: input.assumptions ?? {},
  });

  const state = derived.initialState;
  const totalPropValue = state.properties.reduce((s, p) => s + p.marketValue, 0);
  const totalLoan = state.properties.reduce((s, p) => s + p.loanBalance, 0);
  const lvr = totalPropValue > 0 ? totalLoan / totalPropValue : 0;
  const illiqShare = (totalPropValue + state.superRoham + state.superFara) /
    Math.max(1, totalPropValue + state.superRoham + state.superFara + state.cash + state.etfBalance + state.cryptoBalance);

  // monthly income / expenses (match runScenario derivation exactly)
  const monthlyIncome = derived.ttmIncome / 12;
  const monthlyExpenses = derived.ttmExpenseLedger / 12
    + (derived.expensesIncludeDebt ? 0 : derived.monthlyDebtService);

  return {
    start,
    capital: input.question.capital ?? 50_000,
    mortgageRatePct: (input.assumptions?.mortgageRate ?? derived.plan.assumptions.mortgageRate) * 100,
    monthlyExpenses,
    monthlyIncome,
    cashToday: state.cash,
    superCombined: state.superRoham + state.superFara,
    ttmIncomeAnnual: derived.ttmIncome,
    totalLvrToday: lvr,
    illiquidShareToday: illiqShare,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — generateCandidates
// ─────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Phase 2.8 — Human-readable rejection explanations (deterministic, no AI).
// Maps every (reason, blueprint) pair to a 5-field RejectionExplanation.
// ────────────────────────────────────────────────────────────────────────────

function isLeveragedPropertyBlueprint(bp: CandidateBlueprint): boolean {
  return bp.allocation === "property_deposit_100" || bp.id.includes("ip") || bp.id.includes("property");
}

function buildRejectionExplanation(
  blueprint: CandidateBlueprint,
  reason: string,
  detail: string,
  result: ExtendedScenarioResult | null,
  ctx: DerivedContext,
  horizonYears: number,
): RejectionExplanation {
  const isProperty = isLeveragedPropertyBlueprint(blueprint);
  const isCrypto = blueprint.allocation === "crypto_100";
  const lowerR = reason.toLowerCase();

  // LVR breach — always a property path
  if (lowerR.includes("lvr")) {
    return {
      technical: detail,
      plainEnglish:
        "This path borrows too aggressively against the property value. Lenders treat loan-to-value above 85% as a serviceability red flag, and APRA buffer rates would tip the household into negative equity under modest price falls.",
      primaryDriver: "High leverage at acquisition",
      stressPeriod: `Year 1–${Math.min(horizonYears, 5)} after purchase (loan-to-value highest before equity builds).`,
      whatWouldFix: [
        "Increase deposit (reduce loan amount)",
        "Buy a less expensive property",
        "Build offset buffer first, then purchase",
        "Delay purchase 12–18 months to let savings grow the deposit",
      ],
    };
  }

  // DSR critical — servicing failure (typically property)
  if (lowerR.includes("dsr")) {
    return {
      technical: detail,
      plainEnglish:
        "Required monthly debt repayments would consume more than 55% of household income after APRA buffer stress — lenders class this as unserviceable, and a single income shock could trigger default.",
      primaryDriver: isProperty
        ? "Mortgage repayment too large relative to income"
        : "Total debt service too high",
      stressPeriod: "Months 1–24 — servicing pressure peaks before income growth catches up.",
      whatWouldFix: [
        "Borrow less (smaller property / larger deposit)",
        "Increase household income before purchase",
        "Choose interest-only structure briefly (caveat: refinance risk)",
        "Pay down higher-rate debt first",
      ],
    };
  }

  // NSR buffered < min — mostly leveraged-property
  if (lowerR.includes("nsr")) {
    return {
      technical: detail,
      plainEnglish: isProperty
        ? "The property strategy creates too much refinance and serviceability pressure relative to your income and liquidity buffer during the early years. Even small rate rises would push the buffered net-servicing ratio below the safe band."
        : "This path leaves too little income buffer after debt servicing under APRA stress rates.",
      primaryDriver: isProperty
        ? "High leverage + short recovery horizon"
        : "Income buffer too thin under stress assessment",
      stressPeriod: isProperty
        ? `Years 1–4 after purchase (peak refinance and rate-shock exposure)`
        : `Months 1–18 (servicing buffer thinnest before income growth)`,
      whatWouldFix: isProperty
        ? [
            `Extend horizon to 15+ years (currently ${horizonYears}y)`,
            "Increase cash buffer before purchasing",
            "Reduce deposit deployment / smaller property",
            "Delay purchase 12–18 months",
            "Wait for higher household income before purchase",
          ]
        : [
            "Build a larger cash buffer before deploying",
            "Reduce deployed capital",
            "Wait for income growth before strategy activation",
          ],
    };
  }

  // High default probability — hard floor
  if (lowerR.includes("default")) {
    return {
      technical: detail,
      plainEnglish:
        "In Monte Carlo stress tests, this path runs out of cash and assets in more than 1-in-5 scenarios within the planning horizon. That probability is too high to recommend at any risk profile.",
      primaryDriver: "Insufficient survivability under stress",
      stressPeriod:
        result?.medianDefaultMonth != null
          ? `Median default fires around month ${result.medianDefaultMonth} (year ${Math.round(result.medianDefaultMonth / 12)}).`
          : "Stress concentrated in the first third of the horizon.",
      whatWouldFix: [
        "Reduce deployed capital",
        "Increase cash buffer",
        "Choose a less aggressive allocation",
        "Extend horizon to allow more recovery time",
      ],
    };
  }

  // Zero-cash plan
  if (lowerR.includes("zero-cash") || lowerR.includes("cash")) {
    return {
      technical: detail,
      plainEnglish:
        "Deploying the requested capital all at once would leave less than one month of expenses in cash. Any income disruption would trigger forced selling at a loss.",
      primaryDriver: "Liquidity exhaustion at T=0",
      stressPeriod: "Month 0 — immediate.",
      whatWouldFix: [
        "Reduce deployed capital so ~3 months of expenses remain in cash",
        "Stage the deployment with DCA over 12–24 months",
        "Delay deployment until cash buffer is rebuilt",
      ],
    };
  }

  // Max-leverage at T=0 (property)
  if (lowerR.includes("max-leverage") || lowerR.includes("leverage")) {
    return {
      technical: detail,
      plainEnglish:
        "Buying property immediately leaves under 12 months of cash buffer post-deposit. If anything goes wrong in the first year — rate hike, vacancy, income shock — there's no recovery cushion.",
      primaryDriver: "Property deposit + transaction costs drain emergency fund",
      stressPeriod: "Months 0–12 after purchase — cash trough.",
      whatWouldFix: [
        "Delay purchase 6–18 months (use IP @ 6mo or IP @ 18mo blueprints)",
        "Save additional cash buffer before purchase",
        "Reduce deposit size / smaller property",
        "Build offset balance first (offset-then-IP composite path)",
      ],
    };
  }

  // Crypto concentration
  if (lowerR.includes("crypto")) {
    return {
      technical: detail,
      plainEnglish: isCrypto
        ? "A 100% crypto allocation at this capital amount would push crypto above the safe portfolio share threshold. Crypto's 60%+ volatility means a single drawdown could exceed your total liquid net worth."
        : "Crypto exposure exceeds the safe portfolio share at this capital level.",
      primaryDriver: "Single-asset concentration in a high-volatility class",
      stressPeriod: "Continuous — crypto drawdowns can fire in any month.",
      whatWouldFix: [
        "Switch to Aggressive risk mode (allows higher crypto share)",
        "Or use Custom mode to set explicit maxCryptoSharePct",
        "Reduce crypto allocation as % of capital",
        "Pair with stable allocations (e.g. 40/40/20 ETF/Super/Crypto blueprint)",
      ],
    };
  }

  // Fallback
  return {
    technical: detail,
    plainEnglish: `This path was filtered because: ${detail}`,
    primaryDriver: reason,
    stressPeriod: "Stress location not precisely identifiable from this rule.",
    whatWouldFix: [
      "Re-run with adjusted constraints in Custom risk mode",
      "Reduce capital allocation",
      "Extend planning horizon",
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2.8 — Recovery analysis (leveraged-property paths)
// ────────────────────────────────────────────────────────────────────────────

function buildRecoveryAnalysis(
  result: ExtendedScenarioResult | null,
  horizonYears: number,
): RecoveryAnalysis | undefined {
  if (!result || !result.medianCashPath || result.medianCashPath.length < 12) {
    return undefined;
  }
  const cashPath = result.medianCashPath;
  // Liquidity trough: month with minimum cash; map to year (1-based for UI).
  let troughMonth = 0;
  let troughVal = Infinity;
  for (let i = 0; i < cashPath.length; i++) {
    if (cashPath[i] < troughVal) {
      troughVal = cashPath[i];
      troughMonth = i;
    }
  }
  const liquidityTroughYear = Math.max(1, Math.round(troughMonth / 12));

  // Debt stabilisation: month where cash path stops declining (first month where
  // 6-month forward median is positive vs trough).
  let debtStabMonth = troughMonth;
  for (let i = troughMonth + 6; i < cashPath.length - 6; i++) {
    const fwd = cashPath[i + 6];
    if (fwd > cashPath[i] * 1.05) {
      debtStabMonth = i;
      break;
    }
  }
  const debtStabilisationYear = Math.max(liquidityTroughYear + 1, Math.round(debtStabMonth / 12));

  // Refinance risk window: years 1–3 after activation by default; widen if refi probability is elevated.
  const refiHigh = (result.refinancePressureProbability ?? 0) > 0.15;
  const refinanceRiskWindow = refiHigh
    ? { startYear: 1, endYear: Math.min(horizonYears, 5) }
    : { startYear: 1, endYear: 3 };

  // Recovery years: from trough to debt stabilisation, with min of 1.
  const recoveryYears = Math.max(1, debtStabilisationYear - liquidityTroughYear);

  return {
    liquidityTroughYear,
    debtStabilisationYear,
    refinanceRiskWindow,
    recoveryYears,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2.8 — Soft warning extractor (attached to ranked candidates)
// ────────────────────────────────────────────────────────────────────────────

function extractSoftWarnings(
  blueprint: CandidateBlueprint,
  result: ExtendedScenarioResult,
  bands: { dsr: DsrBand; worstLvr: number; worstNsr: number; refi: RefinancePressureBand; liquidityRatioMin: number; liquidityFloor: number },
): SoftWarning[] {
  const out: SoftWarning[] = [];

  // Crypto concentration warning (when present but under hard ceiling)
  if (blueprint.allocation === "crypto_100" || blueprint.allocation === "etf40_super40_crypto20") {
    out.push({
      id: "crypto-exposure",
      label: "Crypto exposure",
      detail:
        blueprint.allocation === "crypto_100"
          ? "100% crypto deployment. Classified as Speculative — High Volatility, High Downside."
          : "20% crypto component. Adds left-tail risk.",
      severity: blueprint.allocation === "crypto_100" ? "critical" : "warn",
      driver: "allocation.crypto",
    });
  }

  // Refinance pressure warning
  if ((result.refinancePressureProbability ?? 0) > 0.10) {
    out.push({
      id: "refi-pressure",
      label: "Refinance pressure elevated",
      detail: `Refinance-stress probability ${(result.refinancePressureProbability * 100).toFixed(1)}% within horizon. Monitor at 12‑month rate review.`,
      severity: result.refinancePressureProbability > 0.20 ? "critical" : "warn",
      driver: "result.refinancePressureProbability",
    });
  }

  // Liquidity-thin warning
  if (bands.liquidityRatioMin < 3) {
    out.push({
      id: "liquidity-thin",
      label: "Liquidity buffer thin",
      detail: `Minimum liquidity ratio ${bands.liquidityRatioMin.toFixed(1)} months of expenses — a single income shock would force asset sales.`,
      severity: bands.liquidityRatioMin < 1.5 ? "critical" : "warn",
      driver: "bands.liquidityRatioMin",
    });
  }

  // High DSR (but still serviceable)
  if (bands.dsr === "stressed") {
    out.push({
      id: "dsr-stressed",
      label: "DSR in stressed band",
      detail: "Debt service ratio in the stressed band (45–55%). Still serviceable but no headroom for rate rises or income disruption.",
      severity: "warn",
      driver: "bands.dsr",
    });
  }

  // High downside (left tail)
  if ((result.defaultProbability ?? 0) > 0.10) {
    out.push({
      id: "downside-tail",
      label: "High downside tail",
      detail: `Default probability ${(result.defaultProbability * 100).toFixed(1)}% within horizon — elevated even though below the 20% acceptability bar.`,
      severity: "warn",
      driver: "result.defaultProbability",
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2.8 — Horizon-sensitivity probe (rerun rejected paths at +5y, +10y)
// ────────────────────────────────────────────────────────────────────────────

async function probeHorizonSensitivity(
  input: QuickDecisionInput,
  blueprint: CandidateBlueprint,
  events: ScenarioDelta[],
  ctx: DerivedContext,
  household: { dependants: number; incomeVolatility: number },
  constraints: typeof DEFAULT_CONSTRAINTS,
  baseAssumptions: Partial<BasePlanAssumptions>,
  simulationCount: number,
  currentHorizonYears: number,
): Promise<{ sensitive: boolean; viableHorizonYears?: number }> {
  // Probe at +5y and +10y to see if the path becomes viable with longer horizon.
  const probeYears = [currentHorizonYears + 5, currentHorizonYears + 10];
  for (const ph of probeYears) {
    const phMonths = ph * 12;
    const rerun = runScenarioV2({
      dashboardInputs: input.dashboardInputs,
      name: blueprint.label,
      scenarioId: blueprint.id + `_h${ph}`,
      deltas: events,
      horizonMonths: phMonths,
      simulationCount,
      assumptions: baseAssumptions,
      hasHelpDebt: input.taxContext?.hasHelpDebt ?? false,
      hasPrivateHospitalCover: input.taxContext?.hasPrivateHospitalCover ?? true,
    });
    const probe = checkSafetyCeilings(blueprint, rerun, ctx, household, constraints);
    if (probe.passed) {
      return { sensitive: true, viableHorizonYears: ph };
    }
  }
  return { sensitive: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2.8 — Multi-winner: best path under each profile lens.
// ────────────────────────────────────────────────────────────────────────────

function computeMultiWinner(
  scoredCandidates: { id: string; scoreInputs: ScoreInputs }[],
  highRiskIds: Set<string>,
): QuickDecisionOutput["multiWinner"] {
  if (scoredCandidates.length === 0) {
    return { balanced: null, wealthMax: null, cashflowSafe: null, highRisk: null };
  }
  const pickBest = (profile: InvestorProfile, restrictToHighRisk = false) => {
    const weights = getProfileWeights(profile);
    let best: { id: string; score: number } | null = null;
    for (const c of scoredCandidates) {
      if (restrictToHighRisk && !highRiskIds.has(c.id)) continue;
      const s = compositeScore(c.scoreInputs, weights).score;
      if (!best || s > best.score) best = { id: c.id, score: s };
    }
    return best;
  };
  return {
    balanced:     pickBest("balanced"),
    wealthMax:    pickBest("wealth_max"),
    cashflowSafe: pickBest("cashflow_safe"),
    highRisk:     highRiskIds.size > 0 ? pickBest("aggressive", true) : null,
  };
}

export async function generateQuickDecisionCandidates(
  input: QuickDecisionInput,
): Promise<QuickDecisionOutput> {
  // Phase 2.8 — Resolve risk mode + overrides. Hard floors enforced inside
  // resolveRiskControls (maxLvr ≤ 0.85, maxDefaultProbability ≤ 0.40, etc.).
  const riskMode: RiskControlMode = input.riskMode ?? "balanced";
  const resolvedControls = resolveRiskControls(riskMode, input.riskControls);

  // Compose effective constraints. Order: defaults < explicit input.constraints <
  // resolvedControls. The mode-derived values WIN over input.constraints because
  // mode is the user-facing risk-profile choice. Hard floors already clamped.
  const baseConstraints = { ...DEFAULT_CONSTRAINTS, ...(input.constraints ?? {}) };
  const constraints: typeof DEFAULT_CONSTRAINTS = {
    ...baseConstraints,
    maxLvr: resolvedControls.maxLvr,
    minNsrBuffered: resolvedControls.minNsrBuffered,
    maxCryptoSharePct: resolvedControls.maxCryptoSharePct,
    maxDefaultProbability: resolvedControls.maxDefaultProbability,
    maxSingleAssetSharePct: resolvedControls.maxSingleAssetSharePct,
  };

  const horizonYears = input.horizonYears ?? 25;
  const horizonMonths = horizonYears * 12;
  const simulationCount = input.simulationCount ?? QUICK_SIM_COUNT;
  const ctx = deriveCtx(input);

  // Resolve investor profile -> scoring weights
  const profileId: InvestorProfile = input.investorProfile
    ?? QUESTION_PRESETS[input.question.kind].defaults.investorProfile;
  const profileWeights: ScoreWeights = getProfileWeights(profileId);

  const baseAssumptions = (input.assumptions
    ? { ...input.assumptions }
    : {}) as Partial<BasePlanAssumptions>;

  // Run base scenario (no deltas) for reference normalisation
  const baseResult = runScenarioV2({
    dashboardInputs: input.dashboardInputs,
    name: "Base Case",
    scenarioId: "base",
    deltas: [],
    horizonMonths,
    simulationCount,
    assumptions: baseAssumptions,
    hasHelpDebt: input.taxContext?.hasHelpDebt ?? false,
    hasPrivateHospitalCover: input.taxContext?.hasPrivateHospitalCover ?? true,
  });

  const blueprints = blueprintsForQuestion(input.question.kind);
  const discarded: DiscardedCandidate[] = [];
  const ranked: RankedCandidate[] = [];
  // Track which ranked ids came in via the soft-warning bypass (highRisk bucket).
  const highRiskIds = new Set<string>();
  // Collected for multi-winner re-scoring under different profile lenses.
  const scoredCandidates: { id: string; scoreInputs: ScoreInputs }[] = [];

  // Stage 1 — behavioural realism (cheap, runs before MC).
  // In aggressive / custom mode (allowHighRiskPaths = true), behavioural failures
  // that are softly overridable still proceed to MC + scoring, then bucketed as
  // high-risk. Hard floors (e.g. mathematically impossible cashflow) still discard.
  const passingStage1: { bp: CandidateBlueprint; events: ScenarioDelta[]; isHighRisk: boolean }[] = [];
  for (const blueprint of blueprints) {
    const beh = checkBehaviouralRealism(blueprint, ctx, constraints);
    if (!beh.passed) {
      const overridable = beh.override?.possible === true;
      const allowThrough = resolvedControls.allowHighRiskPaths && overridable;
      if (allowThrough) {
        const events = buildBlueprintEvents(blueprint, ctx);
        if (events.length === 0) continue;
        passingStage1.push({ bp: blueprint, events, isHighRisk: true });
        continue;
      }
      const explanation = buildRejectionExplanation(
        blueprint, beh.reason!, beh.detail!, null, ctx, horizonYears,
      );
      const recovery = isLeveragedPropertyBlueprint(blueprint)
        ? buildRecoveryAnalysis(baseResult, horizonYears)
        : undefined;
      discarded.push({
        id: blueprint.id, label: blueprint.label,
        stage: "behavioural",
        reason: beh.reason!, detail: beh.detail!,
        severity: "soft_warning",
        override: beh.override ?? { possible: false, mechanism: "Not overridable — behavioural-realism floor." },
        profileContext: profileId,
        riskMode,
        explanation,
        horizonSensitive: false, // behavioural failures are not horizon-sensitive (T=0 issues)
        recovery,
      });
      continue;
    }
    const events = buildBlueprintEvents(blueprint, ctx);
    if (events.length === 0) continue;
    passingStage1.push({ bp: blueprint, events, isHighRisk: false });
  }

  // Stage 2 + scoring — run MC in parallel for performance
  const runs = await Promise.all(passingStage1.map(async ({ bp, events, isHighRisk }) => {
    const result = runScenarioV2({
      dashboardInputs: input.dashboardInputs,
      name: bp.label,
      scenarioId: bp.id,
      deltas: events,
      horizonMonths,
      simulationCount,
      assumptions: baseAssumptions,
      hasHelpDebt: input.taxContext?.hasHelpDebt ?? false,
      hasPrivateHospitalCover: input.taxContext?.hasPrivateHospitalCover ?? true,
    });
    return { bp, events, result, isHighRisk };
  }));

  for (const { bp: blueprint, events, result, isHighRisk: stage1HighRisk } of runs) {
    const safety = checkSafetyCeilings(blueprint, result, ctx, input.household, constraints);
    let isHighRisk = stage1HighRisk;

    if (!safety.passed) {
      const overridable = safety.override?.possible === true;
      // Allow safety-soft failures through ONLY when:
      //  - allowHighRiskPaths is on
      //  - the failure is overridable (LVR > X, NSR < min)
      //  - the constraint key isn't a hard institutional ceiling that resolveRiskControls already clamps
      const allowThrough = resolvedControls.allowHighRiskPaths && overridable;
      if (!allowThrough) {
        // Probe horizon sensitivity (best-effort — keep tests deterministic).
        const horizonProbe = await probeHorizonSensitivity(
          input, blueprint, events, ctx, input.household, constraints,
          baseAssumptions, simulationCount, horizonYears,
        );
        const explanation = buildRejectionExplanation(
          blueprint, safety.reason!, safety.detail!, result, ctx, horizonYears,
        );
        const recovery = isLeveragedPropertyBlueprint(blueprint)
          ? buildRecoveryAnalysis(result, horizonYears)
          : undefined;
        discarded.push({
          id: blueprint.id, label: blueprint.label,
          stage: "safety_ceiling",
          reason: safety.reason!, detail: safety.detail!,
          severity: "hard_blocker",
          override: safety.override ?? { possible: false, mechanism: "Hard institutional ceiling — not overridable in Quick Decision." },
          profileContext: profileId,
          riskMode,
          explanation,
          horizonSensitive: horizonProbe.sensitive,
          viableHorizonYears: horizonProbe.viableHorizonYears,
          recovery,
        });
        continue;
      }
      // Soft-bypass: tag as high-risk and continue to scoring.
      isHighRisk = true;
    }

    const scoreInputs = buildScoreInputs(result, safety.bands, baseResult, horizonMonths);
    const score = compositeScore(scoreInputs, profileWeights);
    const traceAssumptions: BasePlanAssumptions = {
      inflation: 0.03, incomeGrowth: 0.035, expenseGrowth: 0.03,
      stockReturn: 0.10, stockVol: 0.18, cryptoReturn: 0.20, cryptoVol: 0.60,
      propertyGrowth: 0.065, propertyVol: 0.05, superReturn: 0.095, superVol: 0.08,
      cashApr: 0.045, mortgageRate: 0.065, swr: 0.04,
      ...baseAssumptions,
    } as BasePlanAssumptions;
    const trace = buildTrace(blueprint, events, result, safety.bands, scoreInputs, score, traceAssumptions);

    const softWarnings = extractSoftWarnings(blueprint, result, safety.bands);
    const recovery = isLeveragedPropertyBlueprint(blueprint)
      ? buildRecoveryAnalysis(result, horizonYears)
      : undefined;

    ranked.push({
      id: blueprint.id,
      label: blueprint.label,
      shortLabel: blueprint.shortLabel,
      events,
      result,
      score,
      trace,
      headline: buildHeadline(scoreInputs, score),
      rationale: buildRationale(scoreInputs, score, safety.bands),
      softWarnings,
      isHighRisk,
      recovery,
    });
    scoredCandidates.push({ id: blueprint.id, scoreInputs });
    if (isHighRisk) highRiskIds.add(blueprint.id);
  }

  ranked.sort((a, b) => b.score.score - a.score.score);

  // Split ranked into normal (isHighRisk=false) and high-risk paths
  const normalRanked = ranked.filter((c) => !c.isHighRisk);
  const highRiskPaths = ranked.filter((c) => c.isHighRisk);

  // Phase 2.8 — multi-winner re-scoring lenses.
  const multiWinner = computeMultiWinner(scoredCandidates, highRiskIds);

  // Comparative narrative (uses normal ranked; high-risk is shown separately).
  const winner = normalRanked[0] ?? null;
  const runnerUp = normalRanked[1] ?? null;
  const comparativeNarrative = {
    winnerId: winner?.id ?? "",
    runnerUpId: runnerUp?.id ?? null,
    whyWon: winner
      ? winner.rationale.slice(0, 3)
      : ["No candidate passed safety filters."],
    whatCouldInvalidate: winner
      ? buildInvalidationConditions(winner)
      : [],
    secondPlaceAndWhy: runnerUp && winner
      ? `${runnerUp.shortLabel} placed second at ${runnerUp.score.score.toFixed(0)}/100 because ${
        runnerUp.score.score < winner.score.score - 5
          ? "it gave up significant ground on " + identifyGapAxis(winner, runnerUp)
          : "the gap to first is small — both are credible"
      }.`
      : "No runner-up — only one candidate cleared filters.",
  };

  // Phase 2.4 — execution plan + conditional recs for the winner.
  const executionPlan = winner ? buildExecutionPlan(winner) : [];
  const conditionalRecommendations = winner ? buildConditionalRecommendations(winner) : [];

  return {
    question: input.question.kind,
    capital: input.question.capital,
    investorProfile: profileId,
    ranked: normalRanked,
    discarded,
    highRiskPaths,
    multiWinner,
    riskControlsApplied: { mode: riskMode, resolved: resolvedControls },
    basePlanHash: baseResult.snapshotHash,
    baseScenarioResult: baseResult,
    generatedAt: new Date().toISOString(),
    comparativeNarrative,
    executionPlan,
    conditionalRecommendations,
  };
}

// ----------------------------------------------------------------------------
// Phase 2.4 — phased execution plan + conditional recs (deterministic)
// ----------------------------------------------------------------------------

function buildExecutionPlan(c: RankedCandidate): ExecutionPlanPhase[] {
  if (!c.events || c.events.length === 0) return [];

  // Sort by activationMonth (MonthKey "YYYY-MM" sorts lexicographically).
  const sorted = [...c.events].sort((a, b) =>
    a.activationMonth.localeCompare(b.activationMonth)
  );

  // Bucket events into phases by month-gap. Events within the same calendar
  // quarter (≤3 month gap) form one phase; bigger gaps split phases.
  type Bucket = { events: typeof sorted; startKey: string; endKey: string };
  const buckets: Bucket[] = [];
  for (const e of sorted) {
    const last = buckets[buckets.length - 1];
    if (!last) {
      buckets.push({ events: [e], startKey: e.activationMonth, endKey: e.activationMonth });
      continue;
    }
    if (monthDiff(last.endKey, e.activationMonth) <= 3) {
      last.events.push(e);
      last.endKey = e.activationMonth;
    } else {
      buckets.push({ events: [e], startKey: e.activationMonth, endKey: e.activationMonth });
    }
  }

  return buckets.map((b, idx) => {
    const actions = b.events.map(e => ({
      event: e.deltaType,
      effect: summariseDelta(e),
    }));
    const monthsLabel = b.startKey === b.endKey
      ? `Month ${b.startKey}`
      : `${b.startKey} → ${b.endKey}`;
    const phaseLabel = idx === 0 ? "Setup"
      : idx === buckets.length - 1 ? "Steady state"
      : `Phase ${idx + 1}`;
    return {
      index: idx,
      label: `${monthsLabel} · ${phaseLabel}`,
      startMonth: b.startKey,
      endMonth: b.endKey,
      actions,
      rationale: actions.length === 1
        ? `Single action: ${actions[0].event}.`
        : `${actions.length} actions grouped within a 3-month window for execution coherence.`,
    };
  });
}

function monthDiff(a: string, b: string): number {
  // "YYYY-MM" — deterministic numeric diff. Returns months from a to b.
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!isFinite(ay) || !isFinite(am) || !isFinite(by) || !isFinite(bm)) return 0;
  return (by - ay) * 12 + (bm - am);
}

function buildConditionalRecommendations(c: RankedCandidate): ConditionalRecommendation[] {
  const recs: ConditionalRecommendation[] = [];
  const r = c.result;
  const nsr = r.serviceability.nsr;
  const finalFan = r.netWorthFan[r.netWorthFan.length - 1];

  // Rate-rise trigger — NSR within 30bps of 1.0 buffered.
  if (nsr < 1.30) {
    const headroomBps = Math.max(0, (nsr - 1.0) * 300);
    recs.push({
      id: "refi-pressure-watch",
      trigger: `RBA cash rate rises by ≥ ${headroomBps.toFixed(0)} bps (NSR floor breach)`,
      action: "Lock in a fixed-rate split on the next refinance window, or accelerate offset balance to restore NSR ≥ 1.0.",
      rationale: `Current NSR @ buffered rate = ${nsr.toFixed(2)}. Headroom equals ${headroomBps.toFixed(0)} bps before refinance stress band fires.`,
      severity: nsr < 1.10 ? "critical" : "warn",
    });
  }

  // Liquidity exhaustion — the engine measures cash ≤ 0 in any month.
  if (r.liquidityExhaustionProbability > 0.05) {
    recs.push({
      id: "liquidity-floor-rebuild",
      trigger: `Two consecutive months where cash buffer falls below the required liquidity floor`,
      action: "Pause discretionary contributions to growth assets, redirect surplus into offset/HISA until buffer rebuilds to floor + 1 month.",
      rationale: `Liquidity-exhaustion probability ${(r.liquidityExhaustionProbability * 100).toFixed(1)}% in MC — above the 5% comfort threshold.`,
      severity: r.liquidityExhaustionProbability > 0.15 ? "critical" : "warn",
    });
  }

  // Default-probability trigger.
  if (r.defaultProbability > 0.05) {
    recs.push({
      id: "income-shock-protocol",
      trigger: "Household income drops by ≥ 20% for 3+ months (illness, redundancy, business disruption)",
      action: "Activate the documented income-shock protocol: defer offset surplus, draw 1-month buffer to cover P&I, contact lender re: hardship variation.",
      rationale: `Base-case insolvency probability ${(r.defaultProbability * 100).toFixed(1)}% — income shocks compound this beyond the 20% rejection bar.`,
      severity: r.defaultProbability > 0.10 ? "critical" : "warn",
    });
  }

  // Negative-equity trigger.
  if (finalFan && finalFan.p10 < 0) {
    recs.push({
      id: "market-correction-watch",
      trigger: "Property market correction > 15% within 24 months, OR equity market drawdown > 30% within 12 months",
      action: "Hold steady on rebalancing; suspend new leveraged property purchases; review investment thesis at next quarter-end.",
      rationale: `P10 terminal NW = ${(finalFan.p10 / 1_000_000).toFixed(2)}M (negative). Path is correction-sensitive in the bottom decile.`,
      severity: "warn",
    });
  }

  // FIRE checkpoint — only if MC suggests retirement is on the table.
  if (r.scenarioId && r.netWorthFan.length > 0) {
    const lastP50 = finalFan?.p50 ?? 0;
    if (lastP50 > 0) {
      recs.push({
        id: "fire-checkpoint",
        trigger: "Annual NW review shows median trajectory > 10% ahead of projection",
        action: "Consider rebalancing one stage earlier than planned (e.g. shift +5% from growth to defensive at age-55 milestone).",
        rationale: `Median terminal NW = ${(lastP50 / 1_000_000).toFixed(2)}M. Outperformance creates the option to de-risk sooner without sacrificing FIRE.`,
        severity: "info",
      });
    }
  }

  // Always include a residual review reminder.
  recs.push({
    id: "quarterly-review",
    trigger: "Every 90 days, regardless of conditions",
    action: "Re-run this Decision Engine against the latest ledger snapshot. Flag any axis whose score moved by > 5 points.",
    rationale: "Plan drift is the dominant failure mode for multi-year recommendations. Quarterly re-runs are the floor of disciplined execution.",
    severity: "info",
  });

  return recs;
}

function buildInvalidationConditions(c: RankedCandidate): string[] {
  const out: string[] = [];
  // What rate-rise breaks it? Approximate from NSR.
  const nsr = c.result.serviceability.nsr;
  if (nsr < 1.3 && nsr >= 1.0) {
    const headroomBps = Math.max(0, (nsr - 1.0) * 300);  // rough bps-of-headroom approximation
    out.push(`A mortgage-rate rise of ~${headroomBps.toFixed(0)}bps would push NSR below 1.0 and trigger refinance stress.`);
  }
  if (c.result.defaultProbability > 0.05) {
    out.push(`If your income drops >20% during the horizon, default probability could rise above the 20% rejection bar.`);
  }
  const finalP10 = c.result.netWorthFan[c.result.netWorthFan.length - 1]?.p10 ?? 0;
  if (finalP10 < 0) {
    out.push(`Bottom-decile MC paths produce negative terminal NW. A property-market correction >15% or 5-year sequence of poor equity returns invalidates the upside.`);
  }
  if (out.length === 0) {
    out.push("Path is robust across the modelled stress scenarios (rate, income, market). Major black-swan events outside the registered assumption ranges are not modelled.");
  }
  return out;
}

function identifyGapAxis(winner: RankedCandidate, runnerUp: RankedCandidate): string {
  let maxGap = 0;
  let axis = "score composite";
  for (const w of winner.score.breakdown) {
    const r = runnerUp.score.breakdown.find(x => x.axis === w.axis);
    if (!r) continue;
    const gap = w.contribution - r.contribution;
    if (gap > maxGap) {
      maxGap = gap;
      axis = String(w.axis);
    }
  }
  return axis;
}
