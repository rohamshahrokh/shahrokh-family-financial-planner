/**
 * recommendationExplanation.ts — Sprint 30B Step 2.
 *
 * Pure selector that turns the existing GoalLabPlanOutput into an
 * "explainability" view-model for the new Recommendation Explainability
 * panel. NO engine re-run, NO new math, NO new scoring. Every field is
 * a re-projection of values already present on the plan object.
 *
 * Goals (per user directive):
 *   1. Surface the RAW optimizer winner (top of rankedScenarios).
 *   2. Surface the FINAL selected recommendation (picks.recommended).
 *   3. Detect whether a Safety Override was applied (final ≠ raw top).
 *   4. Produce a ranked table with: score, FIRE age, NW at FIRE, passive
 *      income, liquidity / risk / borrowing score axes, final status.
 *   5. Carry the override-rationale string the orchestrator already
 *      produced (orchestrator.ts:643-677).
 *   6. Carry "why selected" / "why rejected" / "what changed the ranking"
 *      strings synthesised deterministically from the data — NEVER paraphrased
 *      by any AI/language model.
 *
 * Single source: every consumer (Action Roadmap, Decision Lab, Goal Lab)
 * MUST call buildRecommendationExplanation(plan) on the same plan object so
 * the surfaces agree by construction.
 */

import type {
  GoalLabPlanOutput,
  GoalLabRankedScenario,
} from "@/lib/goalLab/orchestrator";
import { selectMonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import type { FanPoint } from "@/lib/scenarioV2/types";

// ─── View-model types ──────────────────────────────────────────────────────

export type RecommendationSource = "optimizerSelected" | "safetyOverride";

/**
 * Identifies the override rule that fired in pickNamedPaths(). Strings match
 * the comments in orchestrator.ts so the audit trail is grep-able.
 */
export type OverrideRule =
  | "none"
  | "rule1_safety_override"
  | "rule2_savings_weak_override"
  | "rule3_aggressive_default_with_rationale";

/**
 * Per-path row for the explainability table. Every field is sourced from
 * the engine; nothing is invented here.
 */
export interface ExplanationPathRow {
  rank: number;                    // 1-based position in rankedScenarios
  templateId: string;
  templateLabel: string;
  promise: string;
  investorProfile: string;         // engine's resolved investor profile
  isAggressive: boolean;           // matches orchestrator AGGRESSIVE_TEMPLATE_IDS
  isSafe: boolean;                 // matches orchestrator SAFE_TEMPLATE_IDS
  score: number | null;            // 0..100 composite, or null
  probabilityP50: number | null;   // engine survivability P50
  fireAgeP50: number | null;       // derived from this template's MC fan
  netWorthAtFireP50: number | null;
  passiveIncomeAtFireP50: number | null;
  liquidityAxis: number | null;    // normalised 0..100 (weight × norm × 100 not used; raw normalised)
  riskAdjustedAxis: number | null; // same — survivability is the closest "risk" axis but we also surface risk-adjusted CAGR
  survivalAxis: number | null;     // primary "risk" proxy (survivability)
  leverageAxis: number | null;     // leverage-quality axis (worstIpLvr)
  finalStatus: "selected" | "rejected" | "alternate";
  rejectionReason: string | null;  // null when selected; deterministic string when rejected
  /**
   * Sprint 30B Step 3 — winner-event signature collision metadata. When
   * non-empty, this row produces an IDENTICAL Monte Carlo forecast to the
   * listed sibling templates because they all select the same blueprint with
   * the same params. The UI uses this to add an "Equivalent to: X" chip so
   * users see that scores/NW matching across rows is honest, not a bug.
   */
  equivalentTemplateIds: string[];
  /**
   * Sprint 30B Step 3 — true when the template's intent filter selected a
   * blueprint other than the engine's raw `ranked[0]`. When false, the
   * winner is either the raw engine top OR fell back to it because no
   * candidate matched the template's intent. The UI shows a small "intent-
   * filtered" chip on rows where this is true.
   */
  winnerSelectedByIntentFilter: boolean;
}

export interface RecommendationExplanation {
  /** Whether anything could be computed. False when plan is null. */
  available: boolean;
  /** The raw optimizer winner (rankedScenarios[0]) — null when no plan. */
  optimizerWinner: ExplanationPathRow | null;
  /** The final selected recommendation (picks.recommended). */
  finalRecommendation: ExplanationPathRow | null;
  /** True iff final differs from optimizer top. */
  overrideApplied: boolean;
  /** Which rule fired in pickNamedPaths. */
  overrideRule: OverrideRule;
  /** Plain-English rationale (sourced from orchestrator.recommendedRationale or synthesised). */
  overrideRationale: string | null;
  /** Full ranked table. */
  rankedTable: ExplanationPathRow[];
  /** Plain-English: why was the final pick selected? */
  whySelected: string | null;
  /** Why the optimizer top was rejected if it was. Null when no override. */
  whyRejected: string | null;
  /** What changed the ranking (deterministic — describes which rule fired). */
  whatChangedRanking: string | null;
  /** Diagnostic signals from the canonical goal profile that drove Rule 1/2. */
  signals: {
    riskTolerance: string | null;       // "low" | "moderate" | "high" | null
    liquidityStressBand: string | null; // "green" | "amber" | "red" | null
    savingsConsistencyBand: string | null;
    leveragePressureBand: string | null;
  };
}

// ─── Constants mirrored from orchestrator (read-only re-statement) ─────────
// Keep in sync with orchestrator.ts. Mirroring instead of importing avoids a
// circular dependency between actionRoadmap selectors and goalLab.

const SAFE_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "delay-ip",
  "debt-reduction",
  "liquidity-preservation",
  "offset-optimisation",
  "lower-target-or-extend",
]);

const AGGRESSIVE_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "buy-ip-now",
  "etf-acceleration",
  "debt-recycling",
]);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Pull a single ScoreBreakdownEntry off a winner. Defensive: many shapes. */
function axisFromBreakdown(
  scenario: GoalLabRankedScenario | null,
  axis: string,
): number | null {
  const breakdown = scenario?.winner?.score?.breakdown;
  if (!Array.isArray(breakdown)) return null;
  const entry = breakdown.find((b) => b.axis === axis);
  if (!entry) return null;
  // Surface the normalised 0..1 value × 100 so the panel can show 0..100.
  const n = entry.normalisedValue;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Derive FIRE-age / NW@FIRE / passive-income for a given scenario from its own fan. */
function projectScenarioTiles(
  scenario: GoalLabRankedScenario,
  inputs: {
    startAge: number | null;
    fireTarget: number | null;
    swrPct: number | null;
    simulationCount: number;
  },
): { fireAge: number | null; netWorth: number | null; passive: number | null } {
  const fan = (scenario.winner?.result?.netWorthFan as FanPoint[] | undefined) ?? [];
  if (!fan.length || inputs.fireTarget == null || inputs.startAge == null) {
    return { fireAge: null, netWorth: null, passive: null };
  }
  const proj = selectMonteCarloProjection({
    fan,
    startAge: inputs.startAge,
    fireTarget: inputs.fireTarget,
    swrPct: inputs.swrPct,
    simulationCount: inputs.simulationCount,
  });
  return {
    fireAge: proj.fireAge.p50,
    netWorth: proj.netWorthAtFire.p50,
    passive: proj.passiveIncomeAtFire.p50,
  };
}

function buildRow(
  scenario: GoalLabRankedScenario,
  rank: number,
  finalSelectedId: string | null,
  inputs: {
    startAge: number | null;
    fireTarget: number | null;
    swrPct: number | null;
    simulationCount: number;
  },
): ExplanationPathRow {
  const id = scenario.templateId;
  const isAggressive = AGGRESSIVE_TEMPLATE_IDS.has(id);
  const isSafe = SAFE_TEMPLATE_IDS.has(id);

  const tiles = projectScenarioTiles(scenario, inputs);

  const liquidityAxis = axisFromBreakdown(scenario, "liquidityFactor");
  const survivalAxis = axisFromBreakdown(scenario, "survivalProbability");
  const riskAdjustedAxis = axisFromBreakdown(scenario, "riskAdjustedReturn");
  const leverageAxis = axisFromBreakdown(scenario, "worstInvestmentLvr");

  // Final status — exactly one path is "selected"; the optimizer top stays as
  // "rejected" iff it was overridden, otherwise "alternate".
  let finalStatus: ExplanationPathRow["finalStatus"];
  if (id === finalSelectedId) {
    finalStatus = "selected";
  } else if (rank === 1) {
    finalStatus = "rejected"; // Optimizer top got overridden
  } else {
    finalStatus = "alternate";
  }

  // Deterministic rejection reason. Only filled for the optimizer top when
  // overridden; alternates use "alternate" as their status, not a rejection.
  let rejectionReason: string | null = null;
  if (finalStatus === "rejected") {
    rejectionReason = isAggressive
      ? "Optimizer top scorer, but flagged aggressive — replaced by a safer path under override rule."
      : "Optimizer top scorer, replaced by an alternate path under override rule.";
  }

  return {
    rank,
    templateId: id,
    templateLabel: scenario.templateLabel,
    promise: scenario.promise,
    investorProfile: scenario.raw?.investorProfile ?? "unknown",
    isAggressive,
    isSafe,
    score: scenario.scoreP50,
    probabilityP50: scenario.probabilityP50,
    fireAgeP50: tiles.fireAge,
    netWorthAtFireP50: tiles.netWorth,
    passiveIncomeAtFireP50: tiles.passive,
    liquidityAxis,
    riskAdjustedAxis,
    survivalAxis,
    leverageAxis,
    finalStatus,
    rejectionReason,
    // Sprint 30B Step 3 — pass through orchestrator-stamped differentiation
    // metadata. Defensive defaults preserve the contract when an older
    // scenario shape is rehydrated.
    equivalentTemplateIds: Array.isArray(scenario.equivalentTemplateIds)
      ? scenario.equivalentTemplateIds
      : [],
    winnerSelectedByIntentFilter: Boolean(scenario.winnerSelectedByIntentFilter),
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

const EMPTY: RecommendationExplanation = {
  available: false,
  optimizerWinner: null,
  finalRecommendation: null,
  overrideApplied: false,
  overrideRule: "none",
  overrideRationale: null,
  rankedTable: [],
  whySelected: null,
  whyRejected: null,
  whatChangedRanking: null,
  signals: {
    riskTolerance: null,
    liquidityStressBand: null,
    savingsConsistencyBand: null,
    leveragePressureBand: null,
  },
};

export interface BuildExplanationInputs {
  /** The single source-of-truth plan object (Goal Lab orchestrator output). */
  plan: GoalLabPlanOutput | null | undefined;
  /** Optional inputs used to derive each path's tile values from its own fan. */
  startAge: number | null;
  fireTarget: number | null;
  swrPct: number | null;
}

/**
 * Pure selector. Deterministic given (plan, startAge, fireTarget, swrPct).
 *
 * Returns the EMPTY explanation when no plan is available. Surfaces should
 * render their existing "Not modelled yet" placeholders in that case.
 */
export function buildRecommendationExplanation(
  args: BuildExplanationInputs,
): RecommendationExplanation {
  const { plan, startAge, fireTarget, swrPct } = args;
  if (!plan || !Array.isArray(plan.rankedScenarios) || plan.rankedScenarios.length === 0) {
    return EMPTY;
  }

  const simulationCount = plan.metrics?.simulationCount ?? 0;
  const ranked = plan.rankedScenarios;
  const optimizerTop = ranked[0] ?? null;
  const finalPick = plan.picks?.recommended ?? null;
  const finalId = finalPick?.templateId ?? null;
  const optimizerTopId = optimizerTop?.templateId ?? null;

  const overrideApplied =
    !!finalId && !!optimizerTopId && finalId !== optimizerTopId;

  // Pull signals used by the override rules (best-effort, defensive).
  const pv =
    (plan.profile as unknown as {
      inferences?: {
        preferenceVector?: {
          signals?: {
            liquidityStressBand?: string;
            savingsConsistencyBand?: string;
            leveragePressureBand?: string;
          };
        };
      };
      resolved?: { riskTolerance?: string };
    }) ?? {};
  const riskTolerance = pv.resolved?.riskTolerance ?? null;
  const liq = pv.inferences?.preferenceVector?.signals?.liquidityStressBand ?? null;
  const sav = pv.inferences?.preferenceVector?.signals?.savingsConsistencyBand ?? null;
  const lev = pv.inferences?.preferenceVector?.signals?.leveragePressureBand ?? null;

  const lowRisk = riskTolerance === "low";
  const liquidityWeak = liq === "red" || liq === "amber";
  const savingsWeak = sav === "low";
  const topIsAggressive = !!optimizerTopId && AGGRESSIVE_TEMPLATE_IDS.has(optimizerTopId);

  // Decide which rule fired. This is deterministic from the orchestrator's
  // own logic — we are NOT re-deciding, just recording which branch matched.
  let overrideRule: OverrideRule = "none";
  if (overrideApplied) {
    if ((lowRisk || liquidityWeak) && topIsAggressive && finalId && SAFE_TEMPLATE_IDS.has(finalId)) {
      overrideRule = "rule1_safety_override";
    } else if (lowRisk && savingsWeak && (finalId === "liquidity-preservation" || finalId === "debt-reduction")) {
      overrideRule = "rule2_savings_weak_override";
    } else {
      // Fallback when the orchestrator picked something we can't classify by
      // signal alone. Still an override, just not a categorised one.
      overrideRule = "rule3_aggressive_default_with_rationale";
    }
  } else if (topIsAggressive) {
    overrideRule = "rule3_aggressive_default_with_rationale";
  }

  const tileInputs = { startAge, fireTarget, swrPct, simulationCount };

  const rankedTable: ExplanationPathRow[] = ranked.map((scen, i) =>
    buildRow(scen, i + 1, finalId, tileInputs),
  );

  const optimizerWinnerRow = rankedTable[0] ?? null;
  const finalRow = finalId
    ? (rankedTable.find((r) => r.templateId === finalId) ?? null)
    : optimizerWinnerRow;

  // ── Narrative strings (deterministic, NO LLM) ───────────────────────────
  const overrideRationale = plan.picks?.recommendedRationale ?? null;

  let whySelected: string | null = null;
  let whyRejected: string | null = null;
  let whatChangedRanking: string | null = null;

  if (finalRow) {
    if (!overrideApplied) {
      whySelected =
        `Selected as the optimizer's top scorer (${finalRow.score?.toFixed(1) ?? "n/a"} / 100). ` +
        `Investor profile: ${finalRow.investorProfile}. No safety override was triggered.`;
      whatChangedRanking =
        `Nothing — the recommendation matches the raw optimizer ranking.`;
    } else if (overrideRule === "rule1_safety_override") {
      whySelected =
        `Promoted by Safety Override (Rule 1). The optimizer's top scorer ${
          optimizerWinnerRow?.templateLabel
            ? `("${optimizerWinnerRow.templateLabel}", ${optimizerWinnerRow.score?.toFixed(1) ?? "n/a"} / 100)`
            : ""
        } was aggressive, and household signals (` +
        [
          lowRisk ? "risk tolerance Low" : null,
          liq === "red" ? "liquidity buffer Red" : liq === "amber" ? "liquidity buffer Amber" : null,
          lev === "red" ? "leverage Red" : lev === "amber" ? "leverage Amber" : null,
        ]
          .filter(Boolean)
          .join(", ") +
        `) made a safer path the responsible primary recommendation.`;
      whyRejected = optimizerWinnerRow
        ? `Rejected because it is an aggressive template ("${optimizerWinnerRow.templateLabel}") and the household's safety signals demanded a safer alternative. It remains visible under "Fastest" for comparison.`
        : null;
      whatChangedRanking =
        `Safety Override (Rule 1) of pickNamedPaths() reordered the recommendation. ` +
        `Composite scores were not changed — only which path is surfaced as "Recommended".`;
    } else if (overrideRule === "rule2_savings_weak_override") {
      whySelected =
        `Promoted by Savings-Weak Override (Rule 2). Risk tolerance is Low and savings consistency is weak — building cash buffer or reducing debt is the safer next move.`;
      whyRejected = optimizerWinnerRow
        ? `Rejected because the household's savings consistency is too weak to support the optimizer's top path. It remains visible under "Fastest".`
        : null;
      whatChangedRanking =
        `Savings-Weak Override (Rule 2) of pickNamedPaths() promoted a liquidity/debt-reduction path above the optimizer's top scorer.`;
    } else {
      whySelected =
        `Surfaced as the recommendation. Composite score ${finalRow.score?.toFixed(1) ?? "n/a"} / 100.`;
      whatChangedRanking = overrideApplied
        ? `pickNamedPaths() selected a path other than the raw top scorer; rule attribution could not be uniquely determined from signal bands alone.`
        : `Nothing — recommendation matches the raw optimizer ranking.`;
    }
  }

  return {
    available: true,
    optimizerWinner: optimizerWinnerRow,
    finalRecommendation: finalRow,
    overrideApplied,
    overrideRule,
    overrideRationale,
    rankedTable,
    whySelected,
    whyRejected,
    whatChangedRanking,
    signals: {
      riskTolerance,
      liquidityStressBand: liq,
      savingsConsistencyBand: sav,
      leveragePressureBand: lev,
    },
  };
}

/** Convenience for surfaces that want a stable label even when no plan loaded. */
export function recommendationDisplayLabel(
  explanation: RecommendationExplanation | null | undefined,
): string {
  return explanation?.finalRecommendation?.templateLabel ?? "Not modelled yet";
}
