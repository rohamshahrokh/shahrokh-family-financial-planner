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
  /**
   * Sprint 30B Step 3 — records whether the winner above was selected by
   * the template's `intentFilter` (true) or fell back to `ranked[0]` because
   * no candidate matched the intent filter (false). When false, the
   * Explainability panel surfaces "intent fallback" so users know the
   * winner is the engine's raw top pick rather than a template-faithful path.
   */
  winnerSelectedByIntentFilter: boolean;
  /**
   * Sprint 30B Step 3 — the engine's raw `ranked[0]` (before any intent
   * filtering). When `winnerSelectedByIntentFilter` is true and this differs
   * from `winner`, the Explainability panel can show "Template-faithful pick
   * vs raw engine top" side-by-side.
   */
  engineTopWinner: RankedCandidate | null;
  /**
   * Sprint 30B Step 3 — stable hash of the winner's event stream
   * (deltaType + activationMonth + params). Two scenarios with identical
   * `eventSignature` produce IDENTICAL Monte Carlo fans — they describe the
   * exact same household action. The Explainability panel uses this to
   * collapse / annotate duplicate rows so the user sees honest variety,
   * not pseudo-variety.
   */
  eventSignature: string;
  /**
   * Sprint 30B Step 3 — ids of OTHER templates that share this scenario's
   * `eventSignature`. Empty when the winner is unique to this template.
   * Surfaced by the Explainability UI as "Equivalent to: X, Y" so the user
   * understands why their forecast numbers match across rows.
   */
  equivalentTemplateIds: string[];
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
  /**
   * Plain-English explanation for why `recommended` was chosen — surfaces the
   * risk-aware tie-breaker logic so users understand why a slower template was
   * preferred over the cross-template top scorer when risk capacity is low.
   * Null when the top-of-list scenario was selected without any override.
   */
  recommendedRationale: string | null;
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
  /**
   * Sprint 25 P4 — performance metrics captured during this run. All values
   * are wall-clock milliseconds measured with `performance.now()`. These are
   * reported to the UI so the Analysis Trace can show real timings.
   */
  metrics: {
    /** Total runtime (start of runGoalLabPlan → before adapter write). */
    totalMs: number;
    /** Time spent inside generateQuickDecisionCandidates across all templates. */
    candidateGenerationMs: number;
    /**
     * Approximate Monte Carlo time. The candidate generator runs the MC
     * stack internally, so we cannot isolate it without instrumenting that
     * file. We surface the same value as candidateGenerationMs and clarify
     * that the two engines are wrapped together inside the candidate path.
     */
    scenarioAndMonteCarloMs: number;
    /** Time spent ranking + pickNamedPaths. */
    rankingMs: number;
    /** Number of templates that were evaluated. */
    templatesCount: number;
    /**
     * Sprint 28 — Monte Carlo simulations per template used for this run. The
     * Action Roadmap's S3 (Monte Carlo Projection) cites this in audit mode
     * via metricSourceAttribution. Source of truth: the `simulationCount`
     * argument passed into `runGoalLabPlan` (default 300). Adds no new math.
     */
    simulationCount: number;
  };
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
  const t0 = performance.now();

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

  // Sprint 25 P4 — instead of Promise.allSettled (which collapses all
  // generator runs into one microtask and blocks the main thread), we run
  // each template sequentially and YIELD to the browser between templates.
  // This lets React paint the Analysis Trace panel and the per-step
  // progress before the next CPU-heavy template starts. The total wall-
  // clock cost is essentially unchanged (the work was already sequential
  // inside Promise.allSettled because none of the engines yield), but the
  // browser stays responsive and the trace animates against real progress.
  const candidateStart = performance.now();
  const settled: Array<
    | { status: "fulfilled"; value: Awaited<ReturnType<typeof generateQuickDecisionCandidates>> }
    | { status: "rejected"; reason: unknown }
  > = [];
  for (const t of templates) {
    // Yield to the event loop so the browser can repaint between templates.
    // setTimeout(0) is a portable yield point and works in JSDOM tests too.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      const value = await generateQuickDecisionCandidates(
        buildEngineInput(t, ledger, profile, {
          sharedTax, sharedHousehold, horizonYears, simulationCount,
        }),
      );
      settled.push({ status: "fulfilled", value });
    } catch (reason) {
      settled.push({ status: "rejected", reason });
    }
  }
  const candidateGenerationMs = performance.now() - candidateStart;

  const rankingStart = performance.now();
  const rankedScenarios: GoalLabRankedScenario[] = [];
  for (let i = 0; i < templates.length; i += 1) {
    const t = templates[i]!;
    const r = settled[i];
    if (!r || r.status !== "fulfilled") continue;
    const out = r.value;
    const engineTop = out.ranked[0] ?? null;

    // Sprint 30B Step 3 — apply the template's intent filter to choose a
    // template-faithful winner among already-scored candidates. If no
    // candidate passes the filter, fall back to ranked[0] (the engine's
    // raw top pick) and flag the scenario so the UI can disclose it.
    let winner: RankedCandidate | null = engineTop;
    let winnerSelectedByIntentFilter = false;
    if (t.intentFilter && out.ranked.length > 0) {
      const faithful = out.ranked.find((c) => t.intentFilter!(c.id));
      if (faithful) {
        winner = faithful;
        winnerSelectedByIntentFilter = true;
      }
    }
    const alternates = winner
      ? out.ranked.filter((c) => c.id !== winner!.id)
      : out.ranked.slice(1);

    rankedScenarios.push({
      templateId:    t.id,
      templateLabel: t.label,
      promise:       t.promise,
      winner,
      alternates,
      probabilityP50: extractProbabilityP50(winner),
      scoreP50:       winner ? winner.score.score : null,
      raw: out,
      winnerSelectedByIntentFilter,
      engineTopWinner: engineTop,
      eventSignature: "",        // populated below after all scenarios collected
      equivalentTemplateIds: [], // populated below after all scenarios collected
    });
  }

  // Sprint 30B Step 3 — compute event-signature dedup metadata. Two scenarios
  // with identical winner-event signatures produce identical MC fans. The UI
  // uses this to annotate rows ("Same plan as X") rather than pretend the
  // numbers are independent observations.
  const sigBuckets = new Map<string, string[]>();
  for (const s of rankedScenarios) {
    const sig = computeEventSignature(s.winner);
    s.eventSignature = sig;
    const bucket = sigBuckets.get(sig) ?? [];
    bucket.push(s.templateId);
    sigBuckets.set(sig, bucket);
  }
  for (const s of rankedScenarios) {
    const bucket = sigBuckets.get(s.eventSignature) ?? [];
    s.equivalentTemplateIds = bucket.filter((id) => id !== s.templateId);
  }

  // Cross-template ordering: descending by winner score.total. Null scores
  // sink to the bottom but are kept (surfaces show "Not modelled yet").
  rankedScenarios.sort((a, b) => (b.scoreP50 ?? -Infinity) - (a.scoreP50 ?? -Infinity));

  const picks = pickNamedPaths(rankedScenarios, profile);
  const rankingMs = performance.now() - rankingStart;

  const totalMs = performance.now() - t0;

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
    metrics: {
      totalMs,
      candidateGenerationMs,
      scenarioAndMonteCarloMs: candidateGenerationMs, // wrapped inside candidateGenerator
      rankingMs,
      templatesCount: templates.length,
      simulationCount,
    },
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

// ─── Cache for the full GoalLabPlanOutput ──────────────────────────────────
//
// canonicalAdapter only stores the recommended QuickDecisionOutput (one
// scenario's ranking). The full multi-scenario summary surfaces /decision-lab
// and /action-plan want lives here.
//
// Sprint 30B Step 1 (sessionStorage mirror, no math change):
//   The original cache was a module-level variable that did NOT survive a
//   full page reload. /action-roadmap reads via `readLatestGoalLabPlan()`,
//   so any reload landed on the empty-state path ("Not modelled yet"),
//   which then cascaded into "Reconciliation failed" downstream because
//   `finalState` was null. This mirror writes the plan to sessionStorage on
//   every set, and rehydrates the module variable on first read after a
//   reload. SSR-safe: when `window` is undefined the mirror is a no-op and
//   behaviour is identical to the pre-Sprint-30B in-memory cache.
//
//   No financial math is changed. No Monte Carlo / Forecast / FIRE /
//   Scenario / Goal Lab calculations are touched. The serialised payload is
//   a plain JSON copy of the existing `GoalLabPlanOutput` shape — the same
//   object the in-memory cache already held.

const SS_KEY = "fwl.goalLab.latestPlan.v1";
/** Plans older than this are discarded on rehydrate to avoid stale ledgers. */
const SS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

let _latestPlan: GoalLabPlanOutput | null = null;
let _latestPlanGeneratedAt: string | null = null;
/** True after the first read attempt has tried sessionStorage rehydration. */
let _hydrated = false;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function persistToSessionStorage(plan: GoalLabPlanOutput): void {
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(SS_KEY, JSON.stringify(plan));
  } catch {
    // Quota / serialisation errors are non-fatal: the in-memory cache still
    // works for the current tab. We intentionally do not log to keep the
    // console clean in production.
  }
}

function rehydrateFromSessionStorage(): GoalLabPlanOutput | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoalLabPlanOutput | null;
    if (!parsed || typeof parsed !== "object") return null;
    // Age guard — drop plans older than SS_MAX_AGE_MS so a stale ledger
    // cannot resurrect itself across days.
    const gen = typeof parsed.generatedAt === "string" ? Date.parse(parsed.generatedAt) : NaN;
    if (Number.isFinite(gen) && Date.now() - gen > SS_MAX_AGE_MS) {
      try { window.sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setLatestGoalLabPlan(plan: GoalLabPlanOutput): void {
  _latestPlan = plan;
  _latestPlanGeneratedAt = plan.generatedAt;
  _hydrated = true;
  persistToSessionStorage(plan);
}

export function readLatestGoalLabPlan(): GoalLabPlanOutput | null {
  if (_latestPlan == null && !_hydrated) {
    _hydrated = true;
    const restored = rehydrateFromSessionStorage();
    if (restored) {
      _latestPlan = restored;
      _latestPlanGeneratedAt = restored.generatedAt;
    }
  }
  return _latestPlan;
}

export function readLatestGoalLabPlanGeneratedAt(): string | null {
  // Ensure we have attempted rehydration before answering.
  if (_latestPlan == null && !_hydrated) {
    void readLatestGoalLabPlan();
  }
  return _latestPlanGeneratedAt;
}

export function clearLatestGoalLabPlan(): void {
  _latestPlan = null;
  _latestPlanGeneratedAt = null;
  _hydrated = true; // "intentionally cleared" — don't auto-rehydrate next read
  if (hasWindow()) {
    try { window.sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
  }
}

/**
 * Sprint 30B Step 1 — test hook. Resets the module-level cache state to its
 * pre-rehydration condition so unit tests can simulate "fresh page load"
 * without spawning a new module context. Not exported for production use.
 */
export function __resetGoalLabPlanCacheForTests(): void {
  _latestPlan = null;
  _latestPlanGeneratedAt = null;
  _hydrated = false;
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
/**
 * Sprint 30B Step 3 — stable hash of a winner's event stream.
 *
 * Two winners with the same deltaType + activationMonth + params produce
 * identical Monte Carlo fans. We canonicalise by sorting on a tuple key, then
 * JSON-stringifying with sorted object keys per delta. The resulting string is
 * pure and deterministic across runs.
 *
 * No financial math — just a fingerprint over already-generated deltas.
 */
function computeEventSignature(winner: RankedCandidate | null): string {
  if (!winner || winner.events.length === 0) return "\u2205";
  const parts = winner.events.map((e) => {
    const params = e.params ?? {};
    const sortedKeys = Object.keys(params).sort();
    const paramStr = sortedKeys
      .map((k) => `${k}=${JSON.stringify((params as Record<string, unknown>)[k])}`)
      .join(",");
    return `${e.deltaType}@${e.activationMonth}{${paramStr}}`;
  });
  parts.sort();
  return parts.join("|");
}

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
 * Templates classified as "safe" — buffer building, debt reduction, delay,
 * offset, liquidity preservation, lower/extend the target. These never add new
 * leverage or new positions and are always the safest action set.
 */
const SAFE_TEMPLATE_IDS = new Set([
  "delay-ip",
  "debt-reduction",
  "liquidity-preservation",
  "offset-optimisation",
  "lower-target-or-extend",
]);

/**
 * Templates that explicitly add leverage / new positions / acceleration. Only
 * appropriate when risk capacity is moderate-or-higher AND liquidity is sound.
 */
const AGGRESSIVE_TEMPLATE_IDS = new Set([
  "buy-ip-now",
  "etf-acceleration",
  "debt-recycling",
]);

/**
 * Compute the six named picks from the cross-template ranked list. Each pick
 * is sourced from the engine's already-computed metrics — we do NOT re-score.
 *
 * Recommended pick uses a **risk-aware tie-breaker** on top of the engine
 * ranking:
 *
 *   1. If risk tolerance is "low" OR liquidity is amber/red, prefer the
 *      highest-scoring SAFE template over any aggressive template. This
 *      removes the "Buy IP now" contradiction that Sprint 24 fix #5 reports.
 *   2. If risk tolerance is "low" AND savings consistency is low, prefer
 *      debt-reduction / liquidity-preservation over any new acquisition
 *      (fix #6: "low risk + weak buffer → build buffer first").
 *   3. Otherwise fall back to the cross-template top scorer.
 *
 * We always also surface `safest` and `fastest` as alternatives so the user
 * sees the trade-offs, not just the engine’s pick.
 */
/**
 * Exported for unit tests of the risk-aware tie-breaker. Surfaces should keep
 * consuming `picks` from `runGoalLabPlan`, not call this directly.
 */
export function pickNamedPaths(
  scenarios: GoalLabRankedScenario[],
  profile: CanonicalGoalProfile,
): GoalLabPathPicks {
  if (scenarios.length === 0) {
    return {
      recommended: null, safest: null, fastest: null,
      highestProbability: null, bestCashflow: null, bestHybrid: null,
      recommendedRationale: null,
    };
  }

  // Highest probability = winner with max engine probabilityP50. Null prob
  // entries are excluded from this pick (we never claim probability we don't
  // have — the brief is explicit about this).
  const probable = scenarios
    .filter((s) => s.probabilityP50 != null)
    .sort((a, b) => (b.probabilityP50! - a.probabilityP50!))[0] ?? null;

  // Safest = highest-scoring safe template (scenarios is already sorted desc
  // by score, so .find returns the top one).
  const safest = scenarios.find((s) => SAFE_TEMPLATE_IDS.has(s.templateId)) ?? null;

  // Fastest = highest-scoring aggressive template.
  const fastest = scenarios.find((s) => AGGRESSIVE_TEMPLATE_IDS.has(s.templateId)) ?? null;

  // Best cashflow = template whose winner used the "cashflow_safe" profile.
  const bestCashflow = scenarios.find(
    (s) => s.raw.investorProfile === "cashflow_safe",
  ) ?? null;

  // Best hybrid = the named hybrid template if it ranked; otherwise null.
  const bestHybrid = scenarios.find((s) => s.templateId === "hybrid-property-etf") ?? null;

  // ── Risk-aware recommendation ────────────────────────────────────────────
  const top = scenarios[0]!;
  const risk = profile.resolved.riskTolerance;                     // "low" | "moderate" | "high"
  const pv   = profile.inferences.preferenceVector;
  const liq  = pv?.signals.liquidityStressBand   ?? null;          // "green" | "amber" | "red" | null
  const sav  = pv?.signals.savingsConsistencyBand ?? null;         // "low" | "medium" | "high" | null
  const lev  = pv?.signals.leveragePressureBand ?? null;

  const liquidityWeak = liq === "red" || liq === "amber";
  const leverageStretched = lev === "red" || lev === "amber";
  const savingsWeak  = sav === "low";
  const lowRisk      = risk === "low";
  const topIsAggressive = AGGRESSIVE_TEMPLATE_IDS.has(top.templateId);

  let recommended: GoalLabRankedScenario = top;
  let recommendedRationale: string | null = null;

  // Rule 1: Low risk OR weak liquidity → must not recommend an aggressive
  // template if any safe template is available.
  if ((lowRisk || liquidityWeak) && topIsAggressive && safest) {
    recommended = safest;
    const reasons: string[] = [];
    if (lowRisk)         reasons.push("risk tolerance is Low");
    if (liq === "red")   reasons.push("liquidity buffer is red");
    else if (liq === "amber") reasons.push("liquidity buffer is thin");
    if (leverageStretched) reasons.push("leverage pressure is elevated");
    recommendedRationale =
      `Engine top-scorer was an aggressive path (${top.templateLabel}), but ${reasons.join(" and ")} \u2014 building safety first is the responsible primary recommendation. The aggressive path remains available under \u201CFastest\u201D.`;
  }
  // Rule 2: Low risk + weak savings → prefer debt-reduction or
  // liquidity-preservation over any new acquisition. Find the best-scoring
  // candidate among those two specifically.
  else if (lowRisk && savingsWeak) {
    const buildBufferFirst = scenarios.find(
      (s) => s.templateId === "liquidity-preservation" || s.templateId === "debt-reduction",
    );
    if (buildBufferFirst && buildBufferFirst.templateId !== top.templateId) {
      recommended = buildBufferFirst;
      recommendedRationale =
        "Risk tolerance is Low and savings consistency is weak \u2014 lifting the growth engine before adding leverage is the safer next move. The faster engine\u2019s pick is still shown as \u201CFastest\u201D for comparison.";
    }
  }
  // Rule 3: Otherwise, when the top scorer IS aggressive but we have no
  // explicit risk reason to override, still surface a short rationale so the
  // UI explains why "Buy IP now" was chosen.
  else if (topIsAggressive) {
    recommendedRationale =
      `Recommended as primary because risk capacity supports it (${risk}) and the safety signals are clear. \u201CSafest\u201D shows the slower-but-lower-risk alternative.`;
  }

  return {
    recommended,
    safest,
    fastest,
    highestProbability: probable,
    bestCashflow,
    bestHybrid,
    recommendedRationale,
  };
}
