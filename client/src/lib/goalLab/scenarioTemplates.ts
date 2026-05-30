/**
 * scenarioTemplates.ts — Sprint 23.
 *
 * Thin template layer that maps the brief's named scenarios onto the EXISTING
 * `QuickDecisionInput` shape consumed by
 * `scenarioV2/decisionEngine/candidateGenerator.ts`. No financial math lives
 * here — these templates compile down to existing `QuickDecisionQuestionKind`
 * + `investorProfile` + `behaviouralPriorities` + `riskMode` combinations.
 *
 * Why a separate file?
 * --------------------
 * The brief lists ~11 named scenarios (buy IP now, delay, ETF acceleration,
 * debt reduction, offset, super, hybrid, lower target, liquidity preservation,
 * debt recycling). The existing `candidateGenerator` produces many candidates
 * but does not guarantee those eleven *named* paths appear deterministically.
 * Wrapping the engine with templates means:
 *
 *   1. Goal Lab can guarantee the named paths show up in the ranking when
 *      they are feasible for the household.
 *   2. The engine itself stays unchanged — we just call it multiple times
 *      with different `question.kind` framings and merge the outputs.
 *   3. The user's `CanonicalGoalProfile.resolved.preferredEngine` /
 *      `riskTolerance` / `primaryConstraint` decides WHICH templates run and
 *      WHICH investor profile scores them — that's how Q4/Q5/Q6 become
 *      engine-consequential without inventing new math.
 *
 * Inputs the engine already understands:
 *   • question.kind     — pre-existing `QuickDecisionQuestionKind` strings
 *   • investorProfile   — pre-existing `InvestorProfile` registry
 *   • riskMode          — pre-existing `RiskControlMode`
 *   • behaviouralPriorities — pre-existing 1-10 sliders
 *
 * The templates below ONLY mix and match these existing knobs.
 */

import type { DashboardInputs } from "../dashboardDataContract";
import type {
  QuickDecisionQuestionKind,
  RiskControlMode,
} from "../scenarioV2/decisionEngine/candidateGenerator";
import type { InvestorProfile } from "../scenarioV2/registry/scoring";
import type { CanonicalGoalProfile } from "./canonicalGoalProfile";

// ─── Template type ──────────────────────────────────────────────────────────

/**
 * A named scenario template. Compiles down to one `generateQuickDecisionCandidates`
 * call. The `gate` returns true when the template is feasible for this
 * household — infeasible templates are skipped so the user never sees
 * "impossible" labels rendered as "0%". Per the brief: "do not fake 0%".
 */
export interface ScenarioTemplate {
  /** Stable id used as cache key + UI react-key. */
  id: string;
  /** User-facing label (shown above the ranked card). */
  label: string;
  /** Short rationale shown before the engine result loads. */
  promise: string;
  /** Existing engine question kind this template invokes. */
  questionKind: QuickDecisionQuestionKind;
  /** Investor profile to score the candidates under. */
  investorProfile: InvestorProfile;
  /** Risk-control mode for hard ceilings. */
  riskMode: RiskControlMode;
  /** Optional capital amount for capital-allocation questions. */
  capital?: number;
  /**
   * Household-feasibility gate. The orchestrator runs the template only when
   * this returns true. Implementations MUST be pure and side-effect-free.
   */
  gate: (inputs: DashboardInputs, profile: CanonicalGoalProfile) => boolean;
  /**
   * Sprint 30B Step 3 — winner-intent filter.
   *
   * The candidate generator returns a ranked list of blueprints scored by
   * survival + liquidity + risk-adjusted return. Without an intent filter,
   * the orchestrator blindly takes `ranked[0]` — which on a healthy household
   * is almost always the highest-survival path (a $30k super top-up). The
   * result is that templates with very different promises ("debt reduction",
   * "offset optimisation", "liquidity preservation") all win on the same
   * super-top-up blueprint, collapsing the ranked table.
   *
   * `intentFilter` accepts a candidate id and returns true when that blueprint
   * faithfully expresses the template's promise. The orchestrator picks the
   * highest-scoring candidate that passes; if NONE pass, it falls back to
   * `ranked[0]` and flags the scenario with `winnerSelectedByIntentFilter:
   * false` so explainability can disclose the fallback.
   *
   * This is a pure post-filter over already-scored candidates. No new math,
   * no new MC runs, no change to the engine itself.
   */
  intentFilter?: (candidateId: string) => boolean;
}

// ─── Intent-filter helpers (pure id-substring matchers) ────────────────────

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

// ─── Tiny pure gate helpers (read canonical selectors only) ─────────────────

const hasIpHeadroom = (p: CanonicalGoalProfile) => {
  const cap = p.inferences.capitalStructure;
  // No IPs yet OR LVR with room → buying-IP templates are feasible.
  return !cap || cap.leverage < 0.65;
};

const hasInvestableCash = (p: CanonicalGoalProfile) => {
  const cap = p.inferences.capitalStructure;
  // ETF-acceleration / DCA templates need some cash above 3-month runway.
  // We don't compute runway here — capitalStructure.liquidity > 0 is the
  // floor; the engine itself will surface a critical liquidity warning if
  // the buffer is too thin.
  return !!cap && cap.liquidity > 0;
};

const hasDebtToReduce = (p: CanonicalGoalProfile) => {
  const cap = p.inferences.capitalStructure;
  return !!cap && cap.totalLiabilities > 0;
};

const hasIpsForRecycling = (p: CanonicalGoalProfile) => {
  // Debt-recycle requires existing IP debt + investable income. Conservative
  // gate: same as hasIpHeadroom for now.
  const cap = p.inferences.capitalStructure;
  return !!cap && cap.totalLiabilities > 0 && cap.totalAssets > cap.totalLiabilities;
};

// ─── Template registry ──────────────────────────────────────────────────────

/**
 * Master list of named scenarios. Order = display order when ranked scores
 * are equal (deterministic tie-breaker). The orchestrator further filters by
 * `gate()` + by `preferredEngine` bias (see `selectActiveTemplates`).
 */
export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "current-plan",
    label: "Current plan — no action",
    promise: "Baseline against which every other scenario is compared.",
    questionKind: "weakest_financial_point",
    investorProfile: "balanced",
    riskMode: "balanced",
    gate: () => true,
    // Baseline = hold offset / status-quo. Accept any pure-offset path.
    intentFilter: (id) => id === "offset_now" || id.startsWith("offset_now"),
  },
  {
    id: "buy-ip-now",
    label: "Buy investment property now",
    promise: "Lever current borrowing capacity into a new IP this year.",
    questionKind: "buy_now_or_buffer",
    investorProfile: "wealth_max",
    riskMode: "balanced",
    gate: (_inputs, p) => hasIpHeadroom(p),
    intentFilter: (id) => id === "ip_now",
  },
  {
    id: "delay-ip",
    label: "Delay property 6–12 months",
    promise: "Build cash buffer first, then re-test borrowing capacity.",
    questionKind: "buy_now_or_buffer",
    investorProfile: "cashflow_safe",
    riskMode: "conservative",
    gate: (_inputs, p) => hasIpHeadroom(p),
    intentFilter: (id) => id === "ip_6mo" || id === "ip_18mo" || id === "offset_first_then_ip",
  },
  {
    id: "etf-acceleration",
    label: "ETF / stocks acceleration",
    promise: "Direct monthly surplus into a broad-market ETF allocation.",
    questionKind: "lump_sum_vs_dca",
    investorProfile: "fire_focused",
    riskMode: "balanced",
    gate: (_inputs, p) => hasInvestableCash(p),
    // Must be ETF-heavy: lump, DCA, or 70/30 ETF tilt. Exclude pure-super.
    intentFilter: (id) => includesAny(id, ["etf_lump", "etf_dca", "etf70_offset30", "etf_then"]),
  },
  {
    id: "debt-reduction",
    label: "Debt reduction first",
    promise: "Eliminate non-deductible debt before adding new positions.",
    questionKind: "debt_vs_invest",
    investorProfile: "cashflow_safe",
    riskMode: "conservative",
    gate: (_inputs, p) => hasDebtToReduce(p),
    // Must be offset-heavy (offset funnels into mortgage). Reject pure super/ETF.
    intentFilter: (id) => includesAny(id, ["offset_now", "offset_6mo", "offset_then"]),
  },
  {
    id: "offset-optimisation",
    label: "Offset optimisation",
    promise: "Park surplus in offset to reduce interest before allocating.",
    questionKind: "debt_recycle_vs_offset",
    investorProfile: "balanced",
    riskMode: "conservative",
    gate: (_inputs, p) => hasDebtToReduce(p),
    intentFilter: (id) => includesAny(id, ["offset_now", "offset50_etf50", "offset_then"]),
  },
  {
    id: "super-contributions",
    label: "Super contribution increase",
    promise: "Use concessional caps to compound inside super.",
    questionKind: "super_vs_invest",
    investorProfile: "fire_focused",
    riskMode: "balanced",
    gate: () => true,
    intentFilter: (id) => includesAny(id, ["super_full", "super_now", "etf30_super70", "etf50_super50"]),
  },
  {
    id: "hybrid-property-etf",
    label: "Hybrid: property + ETF",
    promise: "Split surplus between IP deposit build-up and ETF DCA.",
    questionKind: "property_vs_etf_vs_offset",
    investorProfile: "balanced",
    riskMode: "balanced",
    gate: (_inputs, p) => hasInvestableCash(p) || hasIpHeadroom(p),
    // Hybrid = property AND ETF in the same path → sequenced offset→IP, or
    // a multi-allocation candidate that explicitly mixes asset classes.
    intentFilter: (id) => includesAny(id, ["offset_then_ip", "property_18mo", "etf70_offset30", "etf40_super40_crypto20"]),
  },
  {
    id: "lower-target-or-extend",
    label: "Lower target / extend timeline",
    promise: "Test a softer FIRE target to recover feasibility headroom.",
    questionKind: "min_viable_fire",
    investorProfile: "conservative",
    riskMode: "conservative",
    gate: () => true,
    // Softer target = conservative DCA / offset blends rather than max-growth.
    intentFilter: (id) => includesAny(id, ["etf_dca24", "offset50_etf50", "super_now"]),
  },
  {
    id: "liquidity-preservation",
    label: "Liquidity preservation",
    promise: "Hold investable cash; defer commitments until buffers thicken.",
    questionKind: "cash_optionality",
    investorProfile: "cashflow_safe",
    riskMode: "conservative",
    gate: () => true,
    // Liquidity-first = pure offset (offset balance IS the cash buffer).
    intentFilter: (id) => includesAny(id, ["offset_now", "offset_6mo"]),
  },
  {
    id: "debt-recycling",
    label: "Debt recycling",
    promise: "Convert non-deductible debt to deductible via ETF re-borrow.",
    questionKind: "debt_recycle_vs_direct",
    investorProfile: "wealth_max",
    riskMode: "balanced",
    gate: (_inputs, p) => hasIpsForRecycling(p),
    intentFilter: (id) => includesAny(id, ["etf_lump", "etf_dca", "offset_then_etf"]),
  },
];

// ─── Template selection (driven by Goal Profile) ────────────────────────────

/**
 * Decide which templates to run for THIS Goal Profile. The "current-plan"
 * baseline is always included. Other templates are included when:
 *   • They pass their household feasibility gate, AND
 *   • They align with the user's `preferredEngine` choice (Q4), OR the user
 *     left Q4 on "auto" (in which case all gate-passing templates run).
 *
 * The user's `riskTolerance` (Q5) ALSO biases template selection — "low" risk
 * tolerance suppresses leveraged-property templates; "high" includes
 * aggressive paths. This is intentional: tolerance is the user's stated
 * comfort, and the engine should respect it.
 */
export function selectActiveTemplates(
  inputs: DashboardInputs,
  profile: CanonicalGoalProfile,
): ScenarioTemplate[] {
  const out: ScenarioTemplate[] = [];

  for (const t of SCENARIO_TEMPLATES) {
    if (!t.gate(inputs, profile)) continue;
    if (!matchesPreferredEngine(t, profile)) continue;
    if (!matchesRiskTolerance(t, profile)) continue;
    out.push(t);
  }

  // Always guarantee the baseline is present.
  if (!out.find((t) => t.id === "current-plan")) {
    const baseline = SCENARIO_TEMPLATES.find((t) => t.id === "current-plan");
    if (baseline) out.unshift(baseline);
  }

  return out;
}

function matchesPreferredEngine(t: ScenarioTemplate, p: CanonicalGoalProfile): boolean {
  const pref = p.resolved.preferredEngine;
  // "unsure" — user explicitly does not have a preference → run everything
  // that passes other gates. The engine ranking will pick.
  if (pref === "unsure" || pref === "hybrid") return true;

  // Hard exclusions when the user has a clear preference.
  if (pref === "property") {
    return ["current-plan", "buy-ip-now", "delay-ip", "hybrid-property-etf",
            "debt-reduction", "offset-optimisation", "debt-recycling",
            "lower-target-or-extend", "liquidity-preservation"].includes(t.id);
  }
  if (pref === "etf-stocks") {
    return ["current-plan", "etf-acceleration", "super-contributions",
            "hybrid-property-etf", "lower-target-or-extend",
            "liquidity-preservation", "debt-reduction"].includes(t.id);
  }
  if (pref === "debt-reduction") {
    return ["current-plan", "debt-reduction", "offset-optimisation",
            "debt-recycling", "liquidity-preservation",
            "lower-target-or-extend"].includes(t.id);
  }
  return true;
}

function matchesRiskTolerance(t: ScenarioTemplate, p: CanonicalGoalProfile): boolean {
  const tol = p.resolved.riskTolerance;
  if (tol === "low") {
    // Suppress wealth_max + aggressive paths.
    return t.investorProfile !== "wealth_max" && t.investorProfile !== "aggressive";
  }
  if (tol === "high") {
    // Allow everything.
    return true;
  }
  // "moderate" — no extra restriction.
  return true;
}
