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
}

export interface QuickDecisionOutput {
  question: QuickDecisionQuestionKind;
  capital?: number;
  /** Investor profile actually used for scoring (resolved from input or question preset). */
  investorProfile: InvestorProfile;
  ranked: RankedCandidate[];
  discarded: DiscardedCandidate[];
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
  if (result.defaultProbability > 0.20) {
    return {
      passed: false,
      reason: "High default probability",
      detail: `P(default within horizon) = ${(result.defaultProbability * 100).toFixed(1)}% — exceeds 20% acceptability bar.`,
      override: {
        possible: false,
        mechanism: "Institutional floor — paths with >20% default probability are not overridable in Quick Decision.",
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

export async function generateQuickDecisionCandidates(
  input: QuickDecisionInput,
): Promise<QuickDecisionOutput> {
  const constraints = { ...DEFAULT_CONSTRAINTS, ...(input.constraints ?? {}) };
  const horizonMonths = (input.horizonYears ?? 25) * 12;
  const simulationCount = input.simulationCount ?? QUICK_SIM_COUNT;
  const ctx = deriveCtx(input);

  // Resolve investor profile -> scoring weights
  // Falls back to the question's preset profile when caller omits one
  const profileId: InvestorProfile = input.investorProfile
    ?? QUESTION_PRESETS[input.question.kind].defaults.investorProfile;
  const profileWeights: ScoreWeights = getProfileWeights(profileId);

  // Build assumption set with registry defaults + overrides
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

  // Stage 1 — behavioural realism (cheap, runs before MC)
  const passingStage1: { bp: CandidateBlueprint; events: ScenarioDelta[] }[] = [];
  for (const blueprint of blueprints) {
    const beh = checkBehaviouralRealism(blueprint, ctx, constraints);
    if (!beh.passed) {
      discarded.push({
        id: blueprint.id, label: blueprint.label,
        stage: "behavioural",
        reason: beh.reason!, detail: beh.detail!,
        severity: "soft_warning",
        override: beh.override ?? { possible: false, mechanism: "Not overridable — behavioural-realism floor." },
        profileContext: profileId,
      });
      continue;
    }
    const events = buildBlueprintEvents(blueprint, ctx);
    if (events.length === 0) continue;
    passingStage1.push({ bp: blueprint, events });
  }

  // Stage 2 + scoring — run MC in parallel for performance
  const runs = await Promise.all(passingStage1.map(async ({ bp, events }) => {
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
    return { bp, events, result };
  }));

  for (const { bp: blueprint, events, result } of runs) {
    const safety = checkSafetyCeilings(blueprint, result, ctx, input.household, constraints);
    if (!safety.passed) {
      discarded.push({
        id: blueprint.id, label: blueprint.label,
        stage: "safety_ceiling",
        reason: safety.reason!, detail: safety.detail!,
        severity: "hard_blocker",
        override: safety.override ?? { possible: false, mechanism: "Hard institutional ceiling — not overridable in Quick Decision." },
        profileContext: profileId,
      });
      continue;
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
    });
  }

  ranked.sort((a, b) => b.score.score - a.score.score);

  // Comparative narrative
  const winner = ranked[0];
  const runnerUp = ranked[1] ?? null;
  const comparativeNarrative = {
    winnerId: winner?.id ?? "",
    runnerUpId: runnerUp?.id ?? null,
    whyWon: winner
      ? winner.rationale.slice(0, 3)
      : ["No candidate passed safety filters."],
    whatCouldInvalidate: winner
      ? buildInvalidationConditions(winner)
      : [],
    secondPlaceAndWhy: runnerUp
      ? `${runnerUp.shortLabel} placed second at ${runnerUp.score.score.toFixed(0)}/100 because ${
        runnerUp.score.score < winner.score.score - 5
          ? "it gave up significant ground on " + identifyGapAxis(winner, runnerUp)
          : "the gap to first is small — both are credible"
      }.`
      : "No runner-up — only one candidate cleared filters.",
  };

  // Phase 2.4 — build execution plan + conditional recs for the winner.
  const executionPlan = winner ? buildExecutionPlan(winner) : [];
  const conditionalRecommendations = winner ? buildConditionalRecommendations(winner) : [];

  return {
    question: input.question.kind,
    capital: input.question.capital,
    investorProfile: profileId,
    ranked,
    discarded,
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
