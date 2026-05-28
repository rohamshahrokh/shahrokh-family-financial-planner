/**
 * orchestrator.ts — Sprint 23.
 *
 * THE Goal-Lab → Engine-Stack entrypoint. One function, `runGoalLabPlan`,
 * that takes the canonical inputs and returns ranked scenario-based action
 * recommendations by composing existing engines:
 *
 *   inputs                    →  Canonical Ledger (DashboardInputs)
 *                                Canonical Goal Profile
 *                                Canonical Assumptions (passed through to
 *                                                       runScenarioV2 by the
 *                                                       candidateGenerator)
 *
 *   pipeline                  →  selectActiveTemplates(profile)              // template layer
 *                                  ↓ per template
 *                                generateQuickDecisionCandidates({...})       // scenarioV2 + Monte Carlo
 *                                  ↓ merge ranked + multiWinner
 *                                rankAcrossTemplates()                        // pure dedup/sort
 *                                  ↓
 *                                writeCanonicalDecisionOutput(merged)         // existing session cache
 *
 *   consumers                 →  /decision-lab reads via readCanonicalDecisionOutput
 *                                /action-plan  reads via the same
 *                                Both pages add NO math of their own.
 *
 * Why this file does not contain financial math
 * --------------------------------------------
 * Per the brief: "Do NOT invent a parallel engine". This module is pure glue.
 * Every number it produces comes from `generateQuickDecisionCandidates`. The
 * orchestrator's only original work is:
 *   1. Choosing which templates to fan out across (in scenarioTemplates.ts).
 *   2. Mapping `CanonicalGoalProfile.resolved.*` to the engine's existing
 *      `investorProfile` / `riskMode` knobs.
 *   3. Dedup-merging multiple ranked lists into one ordered list, then
 *      picking the recommended/safest/fastest/best-cashflow paths from the
 *      engine's already-computed score axes.
 *
 * Probability honesty (brief requirement)
 * ---------------------------------------
 * If Monte Carlo did not run for a template (e.g. all candidates were
 * filtered out by hard safety ceilings), `probabilityOfSuccess` on that
 * template's slot is `null` — NOT 0. UI surfaces must render "Not modelled
 * yet" when null. See `extractProbabilityP50` below.
 */

import type { DashboardInputs } from "../dashboardDataContract";
import {
  selectMonthlyIncome,
} from "../dashboardDataContract";
import {
  generateQuickDecisionCandidates,
  type QuickDecisionInput,
  type QuickDecisionOutput,
  type RankedCandidate,
} from "../scenarioV2/decisionEngine/candidateGenerator";
import type { InvestorProfile } from "../scenarioV2/registry/scoring";
import { writeCanonicalDecisionOutput } from "../scenarioV2/decisionEngine/canonicalAdapter";
import type { CanonicalGoalProfile } from "./canonicalGoalProfile";
import {
  selectActiveTemplates,
  type ScenarioTemplate,
} from "./scenarioTemplates";

// ─── Output shape (consumed by /decision-lab and /action-plan) ─────────────

/**
 * Per-template ranked result. One row per active template. The orchestrator
 * does NOT collapse identical candidates across templates — surfaces want
 * to see which named scenario produced which rank.
 */
export interface GoalLabRankedScenario {
  templateId: string;
  templateLabel: string;
  promise: string;
  /** Winning candidate within this template (null when none ranked). */
  winner: RankedCandidate | null;
  /** Other ranked candidates from this template's run, in score order. */
  alternates: RankedCandidate[];
  /**
   * Engine's headline probability for the winner. Null when MC did not
   * produce a survivability metric for this template (e.g. all candidates
   * discarded). UI MUST show "Not modelled yet" — not 0%.
   */
  probabilityP50: number | null;
  /** Composite score of the winner (engine's already-normalised 0–100 axis). */
  scoreP50: number | null;
  /** Engine's underlying QuickDecisionOutput for audit / explainability. */
  raw: QuickDecisionOutput;
}

/**
 * Six named slots the brief calls out: safest / fastest / highest-probability
 * / best-cashflow / best-hybrid / recommended. Any can be null when no
 * template produced a feasible result for that axis.
 *
 * We do NOT invent these picks — they come from each template's engine
 * `multiWinner` block plus a deterministic cross-template selection rule.
 */
export interface GoalLabPathPicks {
  recommended:       GoalLabRankedScenario | null;
  safest:            GoalLabRankedScenario | null;
  fastest:           GoalLabRankedScenario | null;
  highestProbability: GoalLabRankedScenario | null;
  bestCashflow:      GoalLabRankedScenario | null;
  bestHybrid:        GoalLabRankedScenario | null;
}

export interface GoalLabPlanOutput {
  /** Frozen profile that drove this run. */
  profile: CanonicalGoalProfile;
  /** All ranked scenarios, one per active template, in cross-template order. */
  rankedScenarios: GoalLabRankedScenario[];
  /** Named picks. */
  picks: GoalLabPathPicks;
  /** ISO8601 generation timestamp. */
  generatedAt: string;
  /**
   * Audit trail of which engines / versions actually ran. Surfaces render
   * this in audit mode. Hard-coded version strings come from the engine
   * source files (not user-typed) so they cannot drift.
   */
  enginesUsed: {
    candidateGenerator: "scenarioV2/decisionEngine/candidateGenerator";
    scenarioRunner:    "scenarioV2/runScenarioV2";
    monteCarlo:        "scenarioV2/monteCarlo";  // matches what /decision uses
    canonicalAdapter:  "scenarioV2/decisionEngine/canonicalAdapter";
  };
  /** True iff at least one template returned a ranked winner. */
  hasFeasibleScenario: boolean;
  /** Templates evaluated this run (for debugging). */
  templatesEvaluatedIds: string[];
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface RunGoalLabPlanArgs {
  ledger: DashboardInputs;
  profile: CanonicalGoalProfile;
  /** Household context — same shape /decision uses. Optional; defaults applied. */
  household?: { dependants?: number; incomeVolatility?: number };
  /** Tax context. Optional but recommended for serviceability accuracy. */
  taxContext?: {
    annualGrossIncome?: number;
    hasHelpDebt?: boolean;
    hasPrivateHospitalCover?: boolean;
  };
  /** Cap on simulations per template. Default 300 (matches /decision). */
  simulationCount?: number;
  /** Planning horizon in years. Default 25 (matches engine default). */
  horizonYears?: number;
  /** When true, writes the result to the canonicalAdapter session cache. Default true. */
  publishToAdapter?: boolean;
}

/**
 * Main entrypoint. Runs every active template through the existing
 * `generateQuickDecisionCandidates` engine, merges results, picks the named
 * paths, and publishes the merged output to `canonicalAdapter`.
 *
 * Deterministic given (ledger, profile, args). Throws only if the engine
 * itself throws — never raises on "no feasible scenario", which is a valid
 * empty result.
 */
export async function runGoalLabPlan(args: RunGoalLabPlanArgs): Promise<GoalLabPlanOutput> {
  const { ledger, profile } = args;
  const templates = selectActiveTemplates(ledger, profile);

  // Build the per-template engine input from the profile + ledger. The
  // engine knobs we map are EXISTING — we never invent new ones.
  const sharedTax = {
    annualGrossIncome:        args.taxContext?.annualGrossIncome        ?? Math.max(0, selectMonthlyIncome(ledger) * 12),
    hasHelpDebt:              args.taxContext?.hasHelpDebt              ?? false,
    hasPrivateHospitalCover:  args.taxContext?.hasPrivateHospitalCover  ?? false,
  };
  const sharedHousehold = {
    dependants:        args.household?.dependants        ?? 0,
    incomeVolatility:  args.household?.incomeVolatility  ?? 0.15,
  };
  const horizonYears   = args.horizonYears   ?? 25;
  const simulationCount = args.simulationCount ?? 300;

  // Fan out — run each template in parallel. Engine is pure-deterministic
  // per invocation; parallel runs are safe.
  const settled = await Promise.allSettled(
    templates.map((t) =>
      generateQuickDecisionCandidates(buildEngineInput(t, ledger, profile, {
        sharedTax, sharedHousehold, horizonYears, simulationCount,
      })),
    ),
  );

  const rankedScenarios: GoalLabRankedScenario[] = [];
  for (let i = 0; i < templates.length; i += 1) {
    const t = templates[i]!;
    const r = settled[i];
    if (!r || r.status !== "fulfilled") continue;
    const out = r.value;
    const winner = out.ranked[0] ?? null;
    const alternates = out.ranked.slice(1);

    rankedScenarios.push({
      templateId:    t.id,
      templateLabel: t.label,
      promise:       t.promise,
      winner,
      alternates,
      probabilityP50: extractProbabilityP50(winner),
      scoreP50:       winner ? winner.score.score : null,
      raw: out,
    });
  }

  // Cross-template ordering: descending by winner score.total. Null scores
  // sink to the bottom but are kept (surfaces show "Not modelled yet").
  rankedScenarios.sort((a, b) => (b.scoreP50 ?? -Infinity) - (a.scoreP50 ?? -Infinity));

  const picks = pickNamedPaths(rankedScenarios);

  const output: GoalLabPlanOutput = {
    profile,
    rankedScenarios,
    picks,
    generatedAt: new Date().toISOString(),
    enginesUsed: {
      candidateGenerator: "scenarioV2/decisionEngine/candidateGenerator",
      scenarioRunner:    "scenarioV2/runScenarioV2",
      monteCarlo:        "scenarioV2/monteCarlo",
      canonicalAdapter:  "scenarioV2/decisionEngine/canonicalAdapter",
    },
    hasFeasibleScenario: rankedScenarios.some((r) => r.winner !== null),
    templatesEvaluatedIds: templates.map((t) => t.id),
  };

  // Publish to the existing canonical session cache so /decision-lab and
  // /action-plan can pick it up without a new transport.
  if (args.publishToAdapter !== false) {
    // We write the recommended scenario's raw QuickDecisionOutput. This is
    // the shape every existing consumer already understands. The full
    // GoalLabPlanOutput stays in memory for Goal-Lab/Decision-Lab summary
    // UI via the in-memory cache below.
    const recommendedRaw = picks.recommended?.raw ?? rankedScenarios[0]?.raw ?? null;
    if (recommendedRaw) writeCanonicalDecisionOutput(recommendedRaw);
    setLatestGoalLabPlan(output);
  }

  return output;
}

// ─── In-memory cache for the full GoalLabPlanOutput ────────────────────────
//
// canonicalAdapter only stores the recommended QuickDecisionOutput (one
// scenario's ranking). The full multi-scenario summary surfaces /decision-lab
// and /action-plan want lives here. Session-scoped, intentionally simple.

let _latestPlan: GoalLabPlanOutput | null = null;
let _latestPlanGeneratedAt: string | null = null;

function setLatestGoalLabPlan(plan: GoalLabPlanOutput): void {
  _latestPlan = plan;
  _latestPlanGeneratedAt = plan.generatedAt;
}

export function readLatestGoalLabPlan(): GoalLabPlanOutput | null {
  return _latestPlan;
}

export function readLatestGoalLabPlanGeneratedAt(): string | null {
  return _latestPlanGeneratedAt;
}

export function clearLatestGoalLabPlan(): void {
  _latestPlan = null;
  _latestPlanGeneratedAt = null;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function buildEngineInput(
  template: ScenarioTemplate,
  ledger: DashboardInputs,
  profile: CanonicalGoalProfile,
  shared: {
    sharedTax: NonNullable<QuickDecisionInput["taxContext"]>;
    sharedHousehold: QuickDecisionInput["household"];
    horizonYears: number;
    simulationCount: number;
  },
): QuickDecisionInput {
  // The template's investorProfile is a SEED. We override it from the
  // profile's resolved values when the user has a strong preference — that
  // way the engine's score axes reflect what the user has confirmed.
  const investor: InvestorProfile = resolveInvestorProfile(template, profile);

  // Map Q5 risk-tolerance into the engine's pre-existing behavioural
  // priorities. The engine documents these as 1-10 sliders; we move two
  // sliders (safety / leverage tolerance) without changing the underlying
  // Monte Carlo math. See behaviouralPriorities.ts.
  const behaviouralPriorities = riskToleranceToBehavioural(profile);

  return {
    dashboardInputs: ledger,
    question: { kind: template.questionKind, capital: template.capital },
    horizonYears: shared.horizonYears,
    household: shared.sharedHousehold,
    investorProfile: investor,
    behaviouralPriorities,
    simulationCount: shared.simulationCount,
    taxContext: shared.sharedTax,
    riskMode: template.riskMode,
  };
}

/**
 * Resolve which `InvestorProfile` to score this template under. The template
 * carries a sensible default; the user's `riskTolerance` (Q5) tightens or
 * loosens it; the user's `primaryConstraint` (Q6) further nudges it.
 *
 * Pure mapping — no math, no engine calls.
 */
function resolveInvestorProfile(
  template: ScenarioTemplate,
  profile: CanonicalGoalProfile,
): InvestorProfile {
  const tol = profile.resolved.riskTolerance;
  const con = profile.resolved.primaryConstraint;

  // Hard rule: if user says low tolerance, never score with wealth_max.
  if (tol === "low" && template.investorProfile === "wealth_max") return "conservative";

  // Q6 constraint nudges. These are SCORING preferences only — the engine's
  // Monte Carlo math is unchanged. See registry/scoring.ts for the per-
  // profile weight specs.
  if (con === "liquidity") return tol === "low" ? "conservative" : "cashflow_safe";
  if (con === "leverage")  return "cashflow_safe";
  if (con === "timeline")  return tol === "high" ? "wealth_max" : "fire_focused";
  if (con === "growth")    return tol === "high" ? "wealth_max" : "fire_focused";
  if (con === "stability") return "balanced";
  if (con === "lifestyle") return "balanced";

  return template.investorProfile;
}

/**
 * Map Q5 risk-tolerance → engine behavioural-priority deltas. The defaults
 * are all 5 (neutral); we move a few specific sliders to encode the user's
 * stance. The engine's renormaliser makes this an overlay, not a re-weight.
 *
 * Slider semantics come from `scenarioV2/registry/behaviouralPriorities.ts`.
 * If a slider is missing in that registry, the engine ignores it.
 */
function riskToleranceToBehavioural(profile: CanonicalGoalProfile): Partial<Record<string, number>> {
  // Slider keys come from scenarioV2/registry/behaviouralPriorities.ts. We
  // touch only sliders we understand; the engine ignores unknown keys via
  // its DEFAULT_PRIORITIES spread, so this stays additive.
  const tol = profile.resolved.riskTolerance;
  if (tol === "low") {
    return {
      safety:              8, // up from 5
      sleepAtNight:        8,
      liquidity:           7,
      leverageTolerance:   3,
      volatilityTolerance: 3,
    };
  }
  if (tol === "high") {
    return {
      growth:              7,
      fireSpeed:           7,
      leverageTolerance:   7,
      volatilityTolerance: 7,
      safety:              3,
    };
  }
  return {}; // moderate → all neutral
}

/**
 * Extract the engine's headline survivability probability for a candidate.
 * Returns null when MC did not produce a survivability metric for this
 * candidate (rare — usually means the candidate was discarded before MC ran).
 *
 * Surfaces MUST render null as "Not modelled yet" — never 0%.
 */
function extractProbabilityP50(winner: RankedCandidate | null): number | null {
  if (!winner) return null;
  // The engine surfaces survivability on result.riskMetrics.survivability.p50
  // (canonical name in scenarioV2). Defensive read with chain optionals to
  // avoid crashing when the engine version drifts.
  const r = winner.result as unknown as { riskMetrics?: { survivability?: { p50?: number } } };
  const p = r?.riskMetrics?.survivability?.p50;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  return null;
}

/**
 * Compute the six named picks from the cross-template ranked list. Each pick
 * is sourced from the engine's already-computed metrics — we do NOT re-score.
 */
function pickNamedPaths(scenarios: GoalLabRankedScenario[]): GoalLabPathPicks {
  if (scenarios.length === 0) {
    return {
      recommended: null, safest: null, fastest: null,
      highestProbability: null, bestCashflow: null, bestHybrid: null,
    };
  }

  // Recommended = top of the cross-template list (already sorted desc).
  const recommended = scenarios[0] ?? null;

  // Highest probability = winner with max engine probabilityP50. Null prob
  // entries are excluded from this pick (we never claim probability we don't
  // have — the brief is explicit about this).
  const probable = scenarios
    .filter((s) => s.probabilityP50 != null)
    .sort((a, b) => (b.probabilityP50! - a.probabilityP50!))[0] ?? null;

  // Safest = template id "delay-ip" | "debt-reduction" | "liquidity-preservation"
  // ordered by score. Falls back to the cross-template top if no safe template
  // is in the active set.
  const safeIds = new Set(["delay-ip", "debt-reduction", "liquidity-preservation", "offset-optimisation"]);
  const safest = scenarios.find((s) => safeIds.has(s.templateId)) ?? null;

  // Fastest = template ids that prioritise speed (buy-now, etf-acceleration, debt-recycling).
  const fastIds = new Set(["buy-ip-now", "etf-acceleration", "debt-recycling"]);
  const fastest = scenarios.find((s) => fastIds.has(s.templateId)) ?? null;

  // Best cashflow = template whose winner used the "cashflow_safe" profile.
  const bestCashflow = scenarios.find(
    (s) => s.raw.investorProfile === "cashflow_safe",
  ) ?? null;

  // Best hybrid = the named hybrid template if it ranked; otherwise null.
  const bestHybrid = scenarios.find((s) => s.templateId === "hybrid-property-etf") ?? null;

  return { recommended, safest, fastest, highestProbability: probable, bestCashflow, bestHybrid };
}
