/**
 * Family Wealth Lab — Scoring Framework (Layer 1 → Layer 2 bridge)
 *
 * Deterministic composite score [0..100] over a scenario's MC + risk outputs.
 *
 * Weighting philosophy (per user direction 2026-05-11):
 *   1. Survivability  — bankruptcy is unrecoverable
 *   2. Liquidity      — exhaustion forces fire-sales
 *   3. Risk-adjusted compounding
 *   4. FIRE acceleration
 *   5. Terminal NW    — intentionally smallest weight
 *
 * Penalties (subtracted, not weighted into the convex combo):
 *   - Refinance pressure band beyond "mild"
 *   - LVR > 80% (the leverageQuality penalty)
 *
 * The score is **purely deterministic** from Layer 1 outputs. Layer 2 ranks
 * by it. Layer 3 AI narrator EXPLAINS it but cannot OVERRIDE it.
 */

import type { RefinancePressureBand } from "./formulas";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreInputs {
  /** 1 − P(default) − 0.5·P(forced sale). Range [0,1]. HEAVIEST weight. */
  survivalProbability: number;
  /** min(liquidityRatio / dynamicFloor) across horizon, normalised [0,1]. */
  liquidityFactor: number;
  /** Risk-adjusted return as decimal (e.g. 0.06 = 6% adj CAGR). */
  riskAdjustedReturn: number;
  /** Years pulled in vs base plan. Can be negative. Normalised internally. */
  fireAcceleration: number;
  /** P50 terminal NW in AUD. Normalised against a reference internally. */
  terminalNetWorth: number;
  /** Categorical refinance pressure (penalty). */
  refinancePressureBand: RefinancePressureBand;
  /** Worst IP LVR seen in horizon (0..1). Penalises >0.80. */
  worstInvestmentLvr: number;
  /** Reference terminal NW for normalisation (typically base-plan P50 NW). */
  referenceTerminalNw?: number;
}

export interface ScoreWeights {
  survival: number;
  liquidity: number;
  riskAdjusted: number;
  fire: number;
  terminalNw: number;
  refinancePenalty: number;
  leveragePenalty: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  survival:         0.35,
  liquidity:        0.25,
  riskAdjusted:     0.20,
  fire:             0.12,
  terminalNw:       0.08,
  refinancePenalty: 0.10,  // multiplied by band step beyond "mild"
  leveragePenalty:  0.15,  // multiplied by max(0, worstIpLvr − 0.80) × 10
};

// ─────────────────────────────────────────────────────────────────────────────
// Investor profiles — re-weight scoring without touching deterministic math
//
// Profiles change RANKING ORDER, PENALTY SEVERITY, and NARRATIVE
// Profiles DO NOT change Monte Carlo outputs, simulation paths, or hard math.
// ─────────────────────────────────────────────────────────────────────────────

export type InvestorProfile =
  | "balanced"        // engine default — survivability first, balanced
  | "conservative"    // survivability + liquidity heavy
  | "aggressive"      // risk-adjusted CAGR + terminal NW
  | "fire_focused"    // FIRE accel heavy, downside hard-penalised
  | "wealth_max"      // terminal NW heavy, accepts more vol
  | "cashflow_safe";  // liquidity + DSR + leverage penalties strongest

export interface InvestorProfileSpec {
  id: InvestorProfile;
  label: string;
  description: string;
  weights: ScoreWeights;
  /** When true, this profile applies sterner LVR / DSR / liquidity penalties. */
  sternerPenalties?: boolean;
}

export const PROFILE_REGISTRY: Record<InvestorProfile, InvestorProfileSpec> = {
  balanced: {
    id: "balanced",
    label: "Balanced (engine default)",
    description: "Survivability-first, then liquidity, risk-adjusted return, FIRE, terminal NW.",
    weights: { ...DEFAULT_SCORE_WEIGHTS },
  },
  conservative: {
    id: "conservative",
    label: "Conservative",
    description: "Heavy survival + liquidity. Penalises leverage and refi pressure more.",
    weights: {
      survival:         0.40,
      liquidity:        0.30,
      riskAdjusted:     0.15,
      fire:             0.05,
      terminalNw:       0.10,
      refinancePenalty: 0.15,
      leveragePenalty:  0.20,
    },
    sternerPenalties: true,
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    description: "Maximises risk-adjusted CAGR and terminal NW. Accepts more volatility but keeps the LVR ceiling.",
    weights: {
      survival:         0.20,
      liquidity:        0.10,
      riskAdjusted:     0.35,
      fire:             0.15,
      terminalNw:       0.20,
      refinancePenalty: 0.05,
      leveragePenalty:  0.08,
    },
  },
  fire_focused: {
    id: "fire_focused",
    label: "FIRE-focused",
    description: "Pulls retirement date forward. Downside heavily penalised; liquidity floor stricter.",
    weights: {
      survival:         0.30,
      liquidity:        0.20,
      riskAdjusted:     0.15,
      fire:             0.25,
      terminalNw:       0.10,
      refinancePenalty: 0.10,
      leveragePenalty:  0.15,
    },
    sternerPenalties: true,
  },
  wealth_max: {
    id: "wealth_max",
    label: "Wealth-max",
    description: "Optimises terminal net worth. Accepts more leverage and volatility within hard ceilings.",
    weights: {
      survival:         0.20,
      liquidity:        0.10,
      riskAdjusted:     0.20,
      fire:             0.10,
      terminalNw:       0.40,
      refinancePenalty: 0.06,
      leveragePenalty:  0.10,
    },
  },
  cashflow_safe: {
    id: "cashflow_safe",
    label: "Cashflow-safe",
    description: "Strong liquidity + DSR/leverage penalties. Best for variable-income or single-earner households.",
    weights: {
      survival:         0.30,
      liquidity:        0.35,
      riskAdjusted:     0.15,
      fire:             0.05,
      terminalNw:       0.15,
      refinancePenalty: 0.20,
      leveragePenalty:  0.25,
    },
    sternerPenalties: true,
  },
};

export function getProfileWeights(profile: InvestorProfile): ScoreWeights {
  return { ...PROFILE_REGISTRY[profile].weights };
}

export function listInvestorProfiles(): InvestorProfileSpec[] {
  return Object.values(PROFILE_REGISTRY);
}

// Validate every profile's weights at module-load time so a typo can't ship.
Object.values(PROFILE_REGISTRY).forEach(p => {
  const convex = p.weights.survival + p.weights.liquidity + p.weights.riskAdjusted +
                 p.weights.fire + p.weights.terminalNw;
  if (Math.abs(convex - 1.0) > 1e-6) {
    throw new Error(
      `Profile '${p.id}' convex weights must sum to 1.0, got ${convex.toFixed(6)}`,
    );
  }
});

export interface ScoreBreakdownEntry {
  axis: keyof Omit<ScoreInputs, "refinancePressureBand" | "referenceTerminalNw">;
  rawValue: number;
  normalisedValue: number;
  weight: number;
  contribution: number;          // weight × normalisedValue × 100
}

export interface PenaltyEntry {
  id: "refinancePressure" | "leverageQuality";
  band?: RefinancePressureBand;
  value?: number;
  magnitude: number;             // points subtracted from base score
  reason: string;
}

export interface CompositeScore {
  score: number;                 // 0..100
  baseScore: number;             // 0..100 before penalties
  weights: ScoreWeights;
  breakdown: ScoreBreakdownEntry[];
  penalties: PenaltyEntry[];
  rationale: string[];           // human-readable bullets for narrator
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers — push each raw axis into [0,1]
// ─────────────────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normaliseRiskAdjusted(r: number): number {
  // 0% return = 0; 10% adj CAGR = 1; -5% = 0. Linear in between.
  return clamp01((r - 0) / 0.10);
}

function normaliseFireAcceleration(years: number): number {
  // -5y (worse) = 0; 0y = 0.5 (neutral); +5y = 1
  if (!Number.isFinite(years)) return 0.5;
  return clamp01((years + 5) / 10);
}

function normaliseTerminalNw(nw: number, reference?: number): number {
  if (!Number.isFinite(nw)) return 0;
  // If we have a reference base-plan NW, score relative to it (0.5 = parity).
  if (reference && Number.isFinite(reference) && reference !== 0) {
    return clamp01((nw / Math.abs(reference)) * 0.5);
  }
  // Otherwise absolute: $0 = 0, $5M = 1.
  return clamp01(nw / 5_000_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Penalty calculation
// ─────────────────────────────────────────────────────────────────────────────

const REFI_BAND_STEPS: Record<RefinancePressureBand, number> = {
  none: 0, mild: 0, elevated: 1, severe: 2,
};

function refinancePenalty(band: RefinancePressureBand, weight: number): PenaltyEntry {
  const steps = REFI_BAND_STEPS[band];
  const magnitude = steps * weight * 100;  // 0, 10, 20 with default weight
  return {
    id: "refinancePressure",
    band,
    magnitude,
    reason: band === "none" || band === "mild"
      ? "no penalty (band ≤ mild)"
      : `refinance pressure '${band}' — ${steps} × ${(weight * 100).toFixed(0)} = −${magnitude.toFixed(0)} pts`,
  };
}

function leveragePenalty(worstIpLvr: number, weight: number): PenaltyEntry {
  const over = Math.max(0, worstIpLvr - 0.80);
  // 0.80 LVR = 0 penalty, 0.85 LVR = 0.05 × 10 × weight × 100 = ~7.5 pts at default
  const magnitude = over * 10 * weight * 100;
  return {
    id: "leverageQuality",
    value: worstIpLvr,
    magnitude,
    reason: over === 0
      ? `IP LVR ${(worstIpLvr * 100).toFixed(0)}% — within healthy band (≤80%)`
      : `IP LVR ${(worstIpLvr * 100).toFixed(0)}% — exceeds 80% by ${(over * 100).toFixed(0)}pp, −${magnitude.toFixed(1)} pts`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function compositeScore(
  inputs: ScoreInputs,
  weightsIn?: Partial<ScoreWeights>,
): CompositeScore {
  const w: ScoreWeights = { ...DEFAULT_SCORE_WEIGHTS, ...(weightsIn ?? {}) };

  // Validate convex-combo weights sum to ~1.0 (excludes penalty weights)
  const convexSum = w.survival + w.liquidity + w.riskAdjusted + w.fire + w.terminalNw;
  if (Math.abs(convexSum - 1.0) > 1e-6) {
    throw new Error(
      `ScoreWeights convex sum must equal 1.0, got ${convexSum.toFixed(6)}. ` +
      `(survival+liquidity+riskAdjusted+fire+terminalNw)`,
    );
  }

  const breakdown: ScoreBreakdownEntry[] = [
    {
      axis: "survivalProbability",
      rawValue: inputs.survivalProbability,
      normalisedValue: clamp01(inputs.survivalProbability),
      weight: w.survival,
      contribution: w.survival * clamp01(inputs.survivalProbability) * 100,
    },
    {
      axis: "liquidityFactor",
      rawValue: inputs.liquidityFactor,
      normalisedValue: clamp01(inputs.liquidityFactor),
      weight: w.liquidity,
      contribution: w.liquidity * clamp01(inputs.liquidityFactor) * 100,
    },
    {
      axis: "riskAdjustedReturn",
      rawValue: inputs.riskAdjustedReturn,
      normalisedValue: normaliseRiskAdjusted(inputs.riskAdjustedReturn),
      weight: w.riskAdjusted,
      contribution: w.riskAdjusted * normaliseRiskAdjusted(inputs.riskAdjustedReturn) * 100,
    },
    {
      axis: "fireAcceleration",
      rawValue: inputs.fireAcceleration,
      normalisedValue: normaliseFireAcceleration(inputs.fireAcceleration),
      weight: w.fire,
      contribution: w.fire * normaliseFireAcceleration(inputs.fireAcceleration) * 100,
    },
    {
      axis: "terminalNetWorth",
      rawValue: inputs.terminalNetWorth,
      normalisedValue: normaliseTerminalNw(inputs.terminalNetWorth, inputs.referenceTerminalNw),
      weight: w.terminalNw,
      contribution: w.terminalNw * normaliseTerminalNw(inputs.terminalNetWorth, inputs.referenceTerminalNw) * 100,
    },
    {
      axis: "worstInvestmentLvr",
      rawValue: inputs.worstInvestmentLvr,
      // leverageQuality is a derived "passing" view (1 = LVR ≤ 80%, 0 = LVR ≥ 95%)
      normalisedValue: clamp01(1 - Math.max(0, inputs.worstInvestmentLvr - 0.80) / 0.15),
      weight: 0,           // expressed entirely via penalty, not convex weight
      contribution: 0,
    },
  ];

  const baseScore = breakdown.reduce((s, b) => s + b.contribution, 0);

  const penalties: PenaltyEntry[] = [
    refinancePenalty(inputs.refinancePressureBand, w.refinancePenalty),
    leveragePenalty(inputs.worstInvestmentLvr, w.leveragePenalty),
  ];

  const totalPenalty = penalties.reduce((s, p) => s + p.magnitude, 0);
  const score = Math.max(0, Math.min(100, baseScore - totalPenalty));

  const rationale: string[] = [];
  // Sort breakdown by contribution desc; produce top-3 reasons
  const ranked = [...breakdown]
    .filter(b => b.weight > 0)
    .sort((a, b) => b.contribution - a.contribution);
  rationale.push(`Top driver: ${labelFor(ranked[0].axis)} contributes ${ranked[0].contribution.toFixed(1)} pts.`);
  if (ranked[1]) rationale.push(`Then ${labelFor(ranked[1].axis)} adds ${ranked[1].contribution.toFixed(1)} pts.`);
  if (totalPenalty > 0.5) {
    rationale.push(`Penalties: −${totalPenalty.toFixed(1)} pts (${penalties.filter(p => p.magnitude > 0).map(p => p.id).join(", ")}).`);
  } else {
    rationale.push("No material penalties triggered.");
  }

  return { score, baseScore, weights: w, breakdown, penalties, rationale };
}

function labelFor(axis: ScoreBreakdownEntry["axis"]): string {
  switch (axis) {
    case "survivalProbability": return "survival probability";
    case "liquidityFactor":     return "liquidity";
    case "riskAdjustedReturn":  return "risk-adjusted return";
    case "fireAcceleration":    return "FIRE acceleration";
    case "terminalNetWorth":    return "terminal net worth";
    case "worstInvestmentLvr":  return "leverage quality";
  }
}

/**
 * Convenience: validate ScoreWeights without computing a score.
 * Throws on mis-sum. Useful for UI sliders that let users retune weights.
 */
export function validateScoreWeights(w: ScoreWeights): void {
  const convex = w.survival + w.liquidity + w.riskAdjusted + w.fire + w.terminalNw;
  if (Math.abs(convex - 1.0) > 1e-6) {
    throw new Error(`Convex weights must sum to 1.0, got ${convex.toFixed(6)}`);
  }
  if (w.refinancePenalty < 0 || w.leveragePenalty < 0) {
    throw new Error("Penalty weights must be ≥ 0");
  }
}
