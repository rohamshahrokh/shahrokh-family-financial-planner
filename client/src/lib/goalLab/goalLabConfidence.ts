/**
 * goalLabConfidence.ts — Sprint 26 P1
 *
 * Pure, deterministic confidence model for the Goal Lab "Trust score". Six
 * signals are evaluated against existing canonical data; each contributes a
 * fixed weight to the 0–100 score. The score is then bucketed into a band:
 *
 *   High   ≥ 80
 *   Medium 60–79
 *   Low    <  60
 *
 * Critical honesty rules:
 *
 *   1. No fabricated probability. If the orchestrator has not produced a real
 *      MC P50 yet, the "Probability availability" signal returns ok=false and
 *      contributes 0 to the score. We do NOT pretend a number exists.
 *
 *   2. All inputs are observed values from canonical hooks/selectors — this
 *      module never reads from the DOM, never makes HTTP requests, never
 *      mutates anything. It is a pure derivation.
 *
 *   3. The implementation has no Goal-Lab UI imports — this lets the score be
 *      consumed from anywhere (MOVE landing, dashboard tiles, etc.) without
 *      pulling the heavy goal-lab page module.
 */

import type { CanonicalGoal } from "../useCanonicalGoal";
import type { GoalLabPlanOutput } from "./orchestrator";

/** Weight contributions (sum = 100). */
export const CONFIDENCE_WEIGHTS = {
  goalProfile:      20, // user has explicitly saved a FIRE goal
  ledger:           20, // ledger has net worth + monthly cashflow signals
  dataCompleteness: 15, // optional cards confirmed (Q3–Q6 inferred or confirmed)
  scenarioCoverage: 15, // orchestrator evaluated at least N templates
  recommendation:   15, // a recommended path exists AND has score
  probability:      15, // a real survivability P50 was produced (NOT fabricated)
} as const;

export type ConfidenceBand = "High" | "Medium" | "Low";

export interface ConfidenceSignal {
  /** Stable id, e.g. "goal-profile". */
  id:
    | "goal-profile"
    | "ledger"
    | "data-completeness"
    | "scenario-coverage"
    | "recommendation"
    | "probability";
  /** Human label shown next to the tick/X mark. */
  label: string;
  /** True when the signal contributes its full weight. */
  ok: boolean;
  /** Sub-line one-liner explaining the verdict (always present, even on fail). */
  detail: string;
  /** Points contributed (0..weight). */
  contribution: number;
  /** Max points the signal can contribute. */
  weight: number;
}

export interface ConfidenceResult {
  /** Integer 0–100. */
  score: number;
  /** Band derived from score. */
  band: ConfidenceBand;
  /** Per-signal breakdown, in display order. */
  signals: ConfidenceSignal[];
  /** Convenience: signals with ok=true, in display order. */
  okSignals: ConfidenceSignal[];
  /** Convenience: signals with ok=false, in display order. */
  failingSignals: ConfidenceSignal[];
}

export interface ConfidenceInputs {
  /** Canonical FIRE goal (from useCanonicalGoal). */
  goal: CanonicalGoal | null | undefined;
  /** Has the ledger been loaded and is it non-empty? */
  hasLedger: boolean;
  /** Net worth from canonicalHeadlineMetrics; null when ledger missing. */
  netWorth: number | null;
  /** Monthly surplus / fuel; null when not computable. */
  monthlySurplus: number | null;
  /**
   * Goal-Lab card confirmation map (Q1–Q6 → confirmed?). When the user has
   * locked in their answers this drives the "data completeness" signal.
   */
  confirmed: Partial<Record<"Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6", boolean>>;
  /** Orchestrator result, or null when not run yet. */
  plan: GoalLabPlanOutput | null;
}

/** Map score → band. */
export function bandFromScore(score: number): ConfidenceBand {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

/**
 * Pure scorer. Returns a stable, deterministic ConfidenceResult given inputs.
 */
export function computeGoalLabConfidence(input: ConfidenceInputs): ConfidenceResult {
  const signals: ConfidenceSignal[] = [];

  /* ── 1. Goal profile ─────────────────────────────────────────────────── */
  const goalSet = !!input.goal && input.goal.status === "SET";
  signals.push({
    id: "goal-profile",
    label: "Goal defined",
    ok: goalSet,
    detail: goalSet
      ? `Target age ${input.goal!.status === "SET" ? input.goal!.targetFireAge : "?"}, ` +
        `$${Math.round((input.goal!.status === "SET" ? input.goal!.targetPassiveMonthly : 0)).toLocaleString()}/mo passive`
      : "Set your FIRE age and passive income target in Q1",
    contribution: goalSet ? CONFIDENCE_WEIGHTS.goalProfile : 0,
    weight: CONFIDENCE_WEIGHTS.goalProfile,
  });

  /* ── 2. Ledger completeness ──────────────────────────────────────────── */
  const ledgerOk =
    !!input.hasLedger &&
    input.netWorth !== null &&
    input.monthlySurplus !== null;
  signals.push({
    id: "ledger",
    label: "Ledger complete",
    ok: ledgerOk,
    detail: ledgerOk
      ? "Net worth and monthly cashflow are available from canonical selectors"
      : !input.hasLedger
        ? "Ledger snapshot not loaded"
        : input.netWorth === null
          ? "Net worth not computable yet"
          : "Monthly surplus not computable yet",
    contribution: ledgerOk ? CONFIDENCE_WEIGHTS.ledger : 0,
    weight: CONFIDENCE_WEIGHTS.ledger,
  });

  /* ── 3. Data completeness (Q3–Q6 inferred/confirmed) ─────────────────── */
  // Q1 + Q2 are already covered by goalProfile + ledger. We score Q3–Q6 as
  // the "additional context" cards. Linear: 4/4 = full weight, 3/4 = 75%, …
  const optionalCards: Array<"Q3" | "Q4" | "Q5" | "Q6"> = ["Q3", "Q4", "Q5", "Q6"];
  const confirmedCount = optionalCards.filter((k) => input.confirmed[k]).length;
  const dataPct = confirmedCount / optionalCards.length;
  const dataPoints = Math.round(CONFIDENCE_WEIGHTS.dataCompleteness * dataPct);
  signals.push({
    id: "data-completeness",
    label: confirmedCount === optionalCards.length
      ? "All context cards confirmed"
      : confirmedCount > 0
        ? `${confirmedCount}/4 context cards confirmed`
        : "Context cards not yet confirmed",
    ok: confirmedCount >= 3, // require ≥3 of 4 to count as "ok"
    detail: confirmedCount >= 3
      ? "Capital structure, wealth engine, risk capacity and blocker are locked in"
      : "Confirm Q3–Q6 to give the engine your full profile",
    contribution: dataPoints,
    weight: CONFIDENCE_WEIGHTS.dataCompleteness,
  });

  /* ── 4. Scenario coverage (orchestrator templates evaluated) ─────────── */
  const templatesCount = input.plan?.templatesEvaluatedIds?.length ?? 0;
  // 5+ templates = strong, 3-4 = partial, <3 = weak.
  const scenarioOk = templatesCount >= 5;
  const scenarioPct =
    templatesCount >= 5 ? 1 :
    templatesCount >= 3 ? 0.66 :
    templatesCount >= 1 ? 0.33 : 0;
  const scenarioPoints = Math.round(CONFIDENCE_WEIGHTS.scenarioCoverage * scenarioPct);
  signals.push({
    id: "scenario-coverage",
    label: scenarioOk
      ? "Scenario coverage strong"
      : templatesCount > 0
        ? "Scenario coverage partial"
        : "No scenarios evaluated yet",
    ok: scenarioOk,
    detail: templatesCount > 0
      ? `Goal Lab evaluated ${templatesCount} scenario${templatesCount === 1 ? "" : "s"} for your profile`
      : "Click Run plan in Decision Lab to evaluate scenarios",
    contribution: scenarioPoints,
    weight: CONFIDENCE_WEIGHTS.scenarioCoverage,
  });

  /* ── 5. Recommendation stability ─────────────────────────────────────── */
  // "Stable" here means: a recommended pick exists AND has a non-null
  // composite score (recommendation engine produced a ranked result). We
  // can't measure run-to-run stability without re-running — but a missing
  // pick or a null score is a hard signal that the recommendation is shaky.
  const rec = input.plan?.picks?.recommended ?? null;
  const hasScore = rec !== null && rec.scoreP50 !== null && rec.scoreP50 !== undefined;
  const rankedCount = input.plan?.rankedScenarios?.length ?? 0;
  signals.push({
    id: "recommendation",
    label: hasScore ? "Recommendation stable" : "Recommendation pending",
    ok: hasScore,
    detail: hasScore
      ? `Ranked ${rankedCount} candidate path${rankedCount === 1 ? "" : "s"}; top score ${rec!.scoreP50!.toFixed(0)}`
      : rec === null
        ? "No path survived safety ceilings — revisit risk tolerance"
        : "Composite score not produced",
    contribution: hasScore ? CONFIDENCE_WEIGHTS.recommendation : 0,
    weight: CONFIDENCE_WEIGHTS.recommendation,
  });

  /* ── 6. Probability availability (HONESTY GATE) ──────────────────────── */
  // The orchestrator may produce a recommended pick whose Monte Carlo P50 is
  // null (engine returned no probabilistic verdict). The brief is explicit:
  // "Do not fabricate probability values." If P50 is null we score zero and
  // tell the user truthfully.
  const p50 = rec?.probabilityP50 ?? null;
  const probabilityOk = p50 !== null && p50 !== undefined && Number.isFinite(p50);
  signals.push({
    id: "probability",
    label: probabilityOk ? "Probability available" : "Probability unavailable",
    ok: probabilityOk,
    detail: probabilityOk
      ? `Monte Carlo survivability ${(p50! * 100).toFixed(0)}% (P50)`
      : "Scenario confidence not yet modelled for this path",
    contribution: probabilityOk ? CONFIDENCE_WEIGHTS.probability : 0,
    weight: CONFIDENCE_WEIGHTS.probability,
  });

  const score = signals.reduce((acc, s) => acc + s.contribution, 0);
  const band = bandFromScore(score);

  return {
    score,
    band,
    signals,
    okSignals: signals.filter((s) => s.ok),
    failingSignals: signals.filter((s) => !s.ok),
  };
}
