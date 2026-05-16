/**
 * V3 — Investor Behaviour & Priorities (Layer 1 → Layer 2 bridge)
 *
 * Eleven 1-10 sliders that re-weight the composite score WITHOUT touching
 * deterministic math (Monte Carlo, serviceability, LVR, DSR, etc.). Sliders
 * default to neutral (5) so existing users see no behaviour change. As a
 * slider moves away from 5, its corresponding scoring axis is amplified or
 * dampened with a small, bounded delta. The final convex weights are still
 * renormalised so the math stays well-formed.
 *
 * The system is intentionally additive on top of the profile selection:
 *   final = renormalise( profileWeights ⊕ priorityDeltas )
 *
 * It exists so a household can say "I care a lot about sleep-at-night" or
 * "I weight liquidity heavily" without choosing a coarse preset.
 */

import type { ScoreWeights } from "./scoring";

// ─────────────────────────────────────────────────────────────────────────────
// Slider identity + metadata
// ─────────────────────────────────────────────────────────────────────────────

export type PriorityKey =
  | "growth"
  | "safety"
  | "liquidity"
  | "fireSpeed"
  | "sleepAtNight"
  | "volatilityTolerance"
  | "leverageTolerance"
  | "cashflowStability"
  | "familyProtection"
  | "flexibility"
  | "taxEfficiency";

export interface PrioritySpec {
  key: PriorityKey;
  label: string;
  /** One-sentence explanation suitable for a tooltip. */
  description: string;
  /** What raising the slider does (plain English, no jargon). */
  whatHigherDoes: string;
  /** What lowering the slider does. */
  whatLowerDoes: string;
  /** UI grouping — affects ordering only. */
  group: "growth" | "safety" | "liquidity_flex" | "tax_family";
}

export const PRIORITY_REGISTRY: Record<PriorityKey, PrioritySpec> = {
  growth: {
    key: "growth", group: "growth",
    label: "Growth priority",
    description:
      "How much you care about compounding wealth to the highest level over the horizon.",
    whatHigherDoes:
      "Favours paths that produce the largest expected terminal net worth, including more aggressive allocations.",
    whatLowerDoes:
      "De-emphasises peak wealth in favour of resilience and steadier compounding.",
  },
  safety: {
    key: "safety", group: "safety",
    label: "Safety priority",
    description:
      "How much you weight not losing capital relative to chasing higher returns.",
    whatHigherDoes:
      "Promotes paths with stronger downside protection and lower default probability.",
    whatLowerDoes:
      "Accepts more downside dispersion in exchange for higher expected returns.",
  },
  liquidity: {
    key: "liquidity", group: "liquidity_flex",
    label: "Liquidity importance",
    description:
      "How important it is to keep cash and easily-sellable assets available.",
    whatHigherDoes:
      "Penalises paths that lock capital into illiquid assets (property, super) or deplete buffers.",
    whatLowerDoes:
      "Allows more capital to sit in long-duration, less-liquid assets.",
  },
  fireSpeed: {
    key: "fireSpeed", group: "growth",
    label: "FIRE speed importance",
    description:
      "How important it is to reach financial independence as soon as possible.",
    whatHigherDoes:
      "Pulls the recommendation toward paths that compress the time-to-FIRE — typically higher growth, higher leverage.",
    whatLowerDoes:
      "Lets the FIRE horizon stretch in exchange for a smoother, safer path.",
  },
  sleepAtNight: {
    key: "sleepAtNight", group: "safety",
    label: "Sleep-at-night importance",
    description:
      "How much short-term volatility and leverage exposure you want to avoid for psychological reasons.",
    whatHigherDoes:
      "Heavily penalises leveraged and high-volatility paths, even when their expected returns are higher.",
    whatLowerDoes:
      "Allows leverage and volatility provided the math works on a multi-year basis.",
  },
  volatilityTolerance: {
    key: "volatilityTolerance", group: "growth",
    label: "Volatility tolerance",
    description:
      "How comfortable you are watching the portfolio decline during a downturn.",
    whatHigherDoes:
      "Reduces drawdown penalties — accepts deeper mid-cycle declines for higher expected returns.",
    whatLowerDoes:
      "Strengthens drawdown penalties — prefers smoother paths even at the cost of expected return.",
  },
  leverageTolerance: {
    key: "leverageTolerance", group: "growth",
    label: "Leverage tolerance",
    description:
      "How comfortable you are using borrowed capital to grow the balance sheet.",
    whatHigherDoes:
      "Softens leverage penalties — leveraged property and debt-funded paths score higher.",
    whatLowerDoes:
      "Strengthens leverage penalties — unlevered paths and offset-heavy paths rise in ranking.",
  },
  cashflowStability: {
    key: "cashflowStability", group: "safety",
    label: "Cashflow stability importance",
    description:
      "How much you value monthly cash-flow stability and serviceability headroom.",
    whatHigherDoes:
      "Strengthens refinance and DSR penalties — prefers paths with low monthly cash-flow stress.",
    whatLowerDoes:
      "Accepts more cash-flow variability in exchange for better long-term outcomes.",
  },
  familyProtection: {
    key: "familyProtection", group: "safety",
    label: "Family protection importance",
    description:
      "How important it is to protect dependants against income shock and asset loss.",
    whatHigherDoes:
      "Increases liquidity and survival weighting — keeps a larger emergency buffer.",
    whatLowerDoes:
      "Allows tighter buffers in exchange for higher returns when dependants are not vulnerable.",
  },
  flexibility: {
    key: "flexibility", group: "liquidity_flex",
    label: "Flexibility importance",
    description:
      "How much you value the option to change plans (move country, change career, switch investments) later.",
    whatHigherDoes:
      "Penalises paths that lock the household into specific assets or structures for the long term.",
    whatLowerDoes:
      "Accepts long-duration commitments (property holds, super contributions) in exchange for after-tax efficiency.",
  },
  taxEfficiency: {
    key: "taxEfficiency", group: "tax_family",
    label: "Tax efficiency importance",
    description:
      "How much you weight after-tax outcomes vs gross outcomes.",
    whatHigherDoes:
      "Favours concessional super, trust structures, and debt-recycling paths where tax wedge is meaningful.",
    whatLowerDoes:
      "Treats paths primarily on gross return and ease of execution.",
  },
};

export function listPriorities(): PrioritySpec[] {
  return Object.values(PRIORITY_REGISTRY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Behavioural priorities — record of slider values (1-10, default 5)
// ─────────────────────────────────────────────────────────────────────────────

export type BehaviouralPriorities = Record<PriorityKey, number>;

/**
 * The default settings — all sliders at 5 (neutral). When every slider is at
 * its default, the priority overlay is a no-op and scoring matches the
 * pre-V3 behaviour exactly. The tests assert that explicitly.
 */
export const DEFAULT_PRIORITIES: BehaviouralPriorities = {
  growth: 5,
  safety: 5,
  liquidity: 5,
  fireSpeed: 5,
  sleepAtNight: 5,
  volatilityTolerance: 5,
  leverageTolerance: 5,
  cashflowStability: 5,
  familyProtection: 5,
  flexibility: 5,
  taxEfficiency: 5,
};

export function isDefaultPriorities(p: BehaviouralPriorities | undefined): boolean {
  if (!p) return true;
  for (const k of Object.keys(DEFAULT_PRIORITIES) as PriorityKey[]) {
    if ((p[k] ?? 5) !== 5) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map priorities → score-weight deltas (capped, bounded, then renormalised)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-slider influence on the composite weights. Positive numbers in this
 * table mean "raising the slider raises the corresponding axis". The actual
 * delta applied to a weight is `(slider - 5) / 5 * MAX_AXIS_DELTA * influence`.
 *
 * MAX_AXIS_DELTA bounds any single axis's adjustment to ±25% of its base
 * weight — enough to produce visible re-ordering but not enough to flip the
 * profile entirely. After applying deltas the convex axes are renormalised
 * so they sum to 1.0 and the original profile shape is preserved.
 *
 * Each entry's row sums to a small magnitude so a maxed-out slider does not
 * dominate the others.
 */
type AxisKey = keyof Omit<ScoreWeights, "refinancePenalty" | "leveragePenalty">;
type PenaltyKey = "refinancePenalty" | "leveragePenalty";

const MAX_AXIS_DELTA = 0.25;          // ≤ ±25% of base axis weight
const MAX_PENALTY_DELTA = 0.50;       // penalties can move up to ±50%

interface PriorityInfluence {
  axes: Partial<Record<AxisKey, number>>;
  penalties?: Partial<Record<PenaltyKey, number>>;
}

const INFLUENCE: Record<PriorityKey, PriorityInfluence> = {
  growth: {
    axes: { riskAdjusted: +0.6, terminalNw: +0.8, survival: -0.3 },
  },
  safety: {
    axes: { survival: +0.8, liquidity: +0.3, terminalNw: -0.3 },
    penalties: { leveragePenalty: +0.3, refinancePenalty: +0.2 },
  },
  liquidity: {
    axes: { liquidity: +1.0, terminalNw: -0.2 },
  },
  fireSpeed: {
    axes: { fire: +1.0, terminalNw: +0.2, survival: -0.2 },
  },
  sleepAtNight: {
    axes: { survival: +0.4, liquidity: +0.2, terminalNw: -0.2 },
    penalties: { leveragePenalty: +0.6, refinancePenalty: +0.4 },
  },
  volatilityTolerance: {
    // Higher tolerance softens penalties / lifts riskAdjusted weighting.
    axes: { riskAdjusted: +0.3 },
    penalties: { leveragePenalty: -0.3, refinancePenalty: -0.2 },
  },
  leverageTolerance: {
    // Higher tolerance reduces leverage penalty.
    axes: { terminalNw: +0.3 },
    penalties: { leveragePenalty: -0.6, refinancePenalty: -0.2 },
  },
  cashflowStability: {
    axes: { liquidity: +0.3, survival: +0.2 },
    penalties: { refinancePenalty: +0.6 },
  },
  familyProtection: {
    axes: { survival: +0.5, liquidity: +0.5 },
    penalties: { leveragePenalty: +0.2 },
  },
  flexibility: {
    // Flexibility = liquidity + lower commitment in long-duration assets.
    axes: { liquidity: +0.5, terminalNw: -0.2, fire: -0.2 },
  },
  taxEfficiency: {
    // Tax-efficient paths route through super/concessional structures, which
    // the engine already represents as risk-adjusted return delta. We nudge
    // riskAdjusted slightly without rewriting the underlying math.
    axes: { riskAdjusted: +0.2, fire: +0.2 },
  },
};

function normalisedSlider(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const clamped = Math.max(1, Math.min(10, v));
  return (clamped - 5) / 5;            // -0.8 .. +1.0
}

/**
 * Apply a behavioural-priorities overlay on top of a base ScoreWeights spec.
 * Returns a renormalised ScoreWeights where the convex axes still sum to 1.
 *
 * Determinism: same inputs ⇒ same outputs. No randomness, no allocation
 * besides the returned object.
 */
export function applyPrioritiesToWeights(
  base: ScoreWeights,
  priorities: BehaviouralPriorities,
): ScoreWeights {
  // Fast path: defaults ⇒ identity. Critical for stability when users have not
  // configured their priorities, so old plans keep matching old scores.
  if (isDefaultPriorities(priorities)) return { ...base };

  const axisDelta: Record<AxisKey, number> = {
    survival: 0, liquidity: 0, riskAdjusted: 0, fire: 0, terminalNw: 0,
  };
  const penaltyDelta: Record<PenaltyKey, number> = {
    refinancePenalty: 0, leveragePenalty: 0,
  };

  for (const key of Object.keys(priorities) as PriorityKey[]) {
    const n = normalisedSlider(priorities[key] ?? 5);
    if (n === 0) continue;
    const inf = INFLUENCE[key];
    for (const ax of Object.keys(inf.axes) as AxisKey[]) {
      axisDelta[ax] += n * (inf.axes[ax] ?? 0) * MAX_AXIS_DELTA;
    }
    if (inf.penalties) {
      for (const pk of Object.keys(inf.penalties) as PenaltyKey[]) {
        penaltyDelta[pk] += n * (inf.penalties[pk] ?? 0) * MAX_PENALTY_DELTA;
      }
    }
  }

  // Apply multiplicatively so a low base weight cannot go negative. We bound
  // each axis to [0.05·base, 4·base] then renormalise convex axes to sum to 1.
  const raw: Record<AxisKey, number> = {
    survival:     Math.max(0.0001, base.survival     * (1 + axisDelta.survival)),
    liquidity:    Math.max(0.0001, base.liquidity    * (1 + axisDelta.liquidity)),
    riskAdjusted: Math.max(0.0001, base.riskAdjusted * (1 + axisDelta.riskAdjusted)),
    fire:         Math.max(0.0001, base.fire         * (1 + axisDelta.fire)),
    terminalNw:   Math.max(0.0001, base.terminalNw   * (1 + axisDelta.terminalNw)),
  };
  const sum = raw.survival + raw.liquidity + raw.riskAdjusted + raw.fire + raw.terminalNw;
  const norm = (x: number) => x / sum;

  return {
    survival:         norm(raw.survival),
    liquidity:        norm(raw.liquidity),
    riskAdjusted:     norm(raw.riskAdjusted),
    fire:             norm(raw.fire),
    terminalNw:       norm(raw.terminalNw),
    refinancePenalty: Math.max(0, base.refinancePenalty * (1 + penaltyDelta.refinancePenalty)),
    leveragePenalty:  Math.max(0, base.leveragePenalty  * (1 + penaltyDelta.leveragePenalty)),
  };
}

/**
 * Returns a small text summary of which sliders are non-default — useful
 * for the narrative layer and for the PDF export. Deterministic, no AI.
 */
export function summarisePriorities(p: BehaviouralPriorities): string {
  if (isDefaultPriorities(p)) return "Default neutral priority profile.";
  const high: string[] = [];
  const low: string[] = [];
  for (const key of Object.keys(p) as PriorityKey[]) {
    const v = p[key] ?? 5;
    if (v >= 8) high.push(PRIORITY_REGISTRY[key].label);
    else if (v <= 2) low.push(PRIORITY_REGISTRY[key].label);
  }
  const parts: string[] = [];
  if (high.length) parts.push(`heavy emphasis on ${high.join(", ").toLowerCase()}`);
  if (low.length) parts.push(`de-emphasis on ${low.join(", ").toLowerCase()}`);
  return parts.length ? `Priority overlay: ${parts.join("; ")}.` : "Mild priority adjustments applied.";
}
