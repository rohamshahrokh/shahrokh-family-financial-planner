/**
 * strategyIntelligence.ts — discovery-layer intelligence derivation
 *
 * Transforms a `RankedCandidate` + the baseline `ExtendedScenarioResult`
 * (user's no-change path) into the interpretable "investment committee"
 * surface used by the upgraded strategy cards:
 *
 *   • identityLabel          — Growth Tilt / Defensive FIRE / etc.
 *   • narrative              — why this ranks (strengths) + weaknesses
 *   • tradeOffs              — six 0..1 axes for compact bars
 *   • bestFor / avoidIf      — contextual intelligence
 *   • baselineDelta          — vs user's current no-change path
 *   • stress                 — recession / inflation / rate / job-loss resilience
 *
 * Everything is RULE-BASED and deterministic — derived from engine outputs.
 * No layout or financial logic changes; this is a derivation layer only.
 *
 * (An optional LLM polish hook lives in `polishNarrativeWithAi.ts` and reads
 * the same fields produced here — never replaces them, just rephrases.)
 */

import type {
  RankedCandidate,
} from "./candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";

// ─── Public types ────────────────────────────────────────────────────────────

export interface StrategyTradeOffs {
  returnPotential: number;     // 0..1
  liquidity: number;           // 0..1 — higher = more accessible cash
  cashflowSafety: number;      // 0..1 — DSR / NSR / liquidity-floor proxy
  taxEfficiency: number;       // 0..1
  riskExposure: number;        // 0..1 — higher = MORE risk (volatility + drawdown)
  volatilityTolerance: number; // 0..1 — required user tolerance (alias of risk)
}

export interface StrategyBaselineDelta {
  netWorthDelta: number;        // $ — candidate P50 − baseline P50
  netWorthDeltaPct: number;     // fraction
  fireYearsDelta: number;       // negative = faster (years pulled in)
  drawdownDeltaPct: number;     // candidate − baseline (positive = deeper)
  liquidityDeltaPct: number;    // candidate − baseline liquidity ratio
  bullets: string[];            // human-readable "+ $420k, − 14% drawdown" lines
}

export interface StressResilience {
  recession:   { level: ResilienceLevel; detail: string };
  inflation:   { level: ResilienceLevel; detail: string };
  rateShock:   { level: ResilienceLevel; detail: string };
  jobLoss:     { level: ResilienceLevel; detail: string; months: number | null };
}

export type ResilienceLevel = "strong" | "moderate" | "weak";

export interface StrategyNarrative {
  identityLabel: string;        // "Growth Tilt", "Defensive FIRE", etc.
  identityHint: string;         // 1-line subtitle
  strengths: string[];          // "Why this ranks well" bullets (rule-based)
  weaknesses: string[];         // "Main weaknesses" bullets
  bestFor: string[];
  avoidIf: string[];
}

export interface StrategyIntelligence {
  narrative: StrategyNarrative;
  tradeOffs: StrategyTradeOffs;
  baselineDelta: StrategyBaselineDelta;
  stress: StressResilience;
}

// ─── Allocation classification ────────────────────────────────────────────────

/**
 * Classify a candidate from its `id` / `label`. The blueprint's allocation
 * axis isn't on `RankedCandidate` directly, so we infer from the label
 * which is deterministic from the blueprint.
 */
function classifyAllocation(label: string, id: string): {
  category:
    | "etf"
    | "etf_lump"
    | "etf_dca"
    | "super"
    | "offset"
    | "property"
    | "crypto"
    | "diversified"
    | "split"
    | "sequenced";
  growthTilt: number;     // 0..1 — how aggressive
  taxAdvantage: number;   // 0..1 — concessional/offset > taxable
  liquidityProfile: number; // 0..1 — how accessible the deployed capital is
  sequencing: boolean;
} {
  const text = `${label} ${id}`.toLowerCase();
  const composite = text.includes("→") || /sequenc|then/.test(text);

  if (text.includes("crypto") && !text.includes("/")) {
    return { category: "crypto", growthTilt: 1.0, taxAdvantage: 0.2, liquidityProfile: 0.7, sequencing: composite };
  }
  if (text.includes("40/40/20") || text.includes("diversified") || text.includes("etf40_super40_crypto20")) {
    return { category: "diversified", growthTilt: 0.85, taxAdvantage: 0.65, liquidityProfile: 0.5, sequencing: composite };
  }
  if (text.includes("ip ") || text.includes("property") || text.includes("ip_")) {
    return { category: "property", growthTilt: 0.85, taxAdvantage: 0.55, liquidityProfile: 0.15, sequencing: composite };
  }
  if (text.includes("offset") && text.includes("etf")) {
    return { category: "split", growthTilt: 0.55, taxAdvantage: 0.6, liquidityProfile: 0.7, sequencing: composite };
  }
  if (text.includes("super") && text.includes("etf")) {
    return { category: "split", growthTilt: 0.75, taxAdvantage: 0.85, liquidityProfile: 0.3, sequencing: composite };
  }
  if (text.includes("super")) {
    return { category: "super", growthTilt: 0.7, taxAdvantage: 1.0, liquidityProfile: 0.1, sequencing: composite };
  }
  if (text.includes("dca")) {
    return { category: "etf_dca", growthTilt: 0.75, taxAdvantage: 0.4, liquidityProfile: 0.85, sequencing: composite };
  }
  if (text.includes("etf") && text.includes("lump")) {
    return { category: "etf_lump", growthTilt: 0.8, taxAdvantage: 0.4, liquidityProfile: 0.85, sequencing: composite };
  }
  if (text.includes("etf")) {
    return { category: "etf", growthTilt: 0.75, taxAdvantage: 0.4, liquidityProfile: 0.85, sequencing: composite };
  }
  if (text.includes("offset")) {
    return { category: "offset", growthTilt: 0.25, taxAdvantage: 0.7, liquidityProfile: 0.95, sequencing: composite };
  }
  return { category: "split", growthTilt: 0.55, taxAdvantage: 0.5, liquidityProfile: 0.5, sequencing: composite };
}

// ─── Identity labels ─────────────────────────────────────────────────────────

function deriveIdentityLabel(
  candidate: RankedCandidate,
  alloc: ReturnType<typeof classifyAllocation>,
): { identityLabel: string; identityHint: string } {
  const ddP90 = candidate.result.riskMetrics?.maxDrawdownP90 ?? 0;
  const concentration = candidate.result.riskMetrics?.concentrationRisk ?? 0;
  const survival = 1 - (candidate.result.defaultProbability ?? 0);
  const liquidityWeak = (candidate.result.riskMetrics?.liquidityRisk ?? 0) > 0.5;

  // Specificity ordering matters — most distinctive first.
  if (alloc.category === "crypto") {
    return { identityLabel: "High-Conviction Growth", identityHint: "Concentrated growth, accept large drawdowns" };
  }
  if (alloc.category === "property") {
    return { identityLabel: "Leveraged Property", identityHint: "Long-term leveraged growth, low near-term liquidity" };
  }
  if (alloc.category === "super") {
    return { identityLabel: "Tax-Optimised Accumulator", identityHint: "Concessional super — locked but tax-advantaged" };
  }
  if (alloc.category === "offset") {
    return { identityLabel: "Cashflow Shield", identityHint: "Defensive — pay down mortgage drag, preserve liquidity" };
  }
  if (alloc.category === "diversified") {
    return { identityLabel: "Diversified", identityHint: "Balanced across growth and tax-defended buckets" };
  }
  if (alloc.category === "etf_dca") {
    return { identityLabel: "Time-Diversified Growth", identityHint: "DCA into ETF to soften sequence risk" };
  }
  if (alloc.category === "etf" || alloc.category === "etf_lump") {
    if (ddP90 > 0.35 || concentration > 0.6) {
      return { identityLabel: "Growth Tilt", identityHint: "ETF-heavy, accept deeper drawdowns for higher CAGR" };
    }
    return { identityLabel: "Growth Tilt", identityHint: "ETF-heavy, growth-leaning accumulation" };
  }
  // Splits / sequenced / fallback
  if (alloc.sequencing) {
    return { identityLabel: "Sequenced Plan", identityHint: "Multi-stage path with timed handoffs" };
  }
  if (liquidityWeak && survival >= 0.95) {
    return { identityLabel: "Defensive FIRE", identityHint: "Tilted toward survivability and liquidity" };
  }
  return { identityLabel: "Balanced Strategy", identityHint: "Mix of growth and defensive buckets" };
}

// ─── Trade-off axes ──────────────────────────────────────────────────────────

function deriveTradeOffs(candidate: RankedCandidate): StrategyTradeOffs {
  const r = candidate.result;
  const m = r.riskMetrics;

  const initial = Math.max(1, r.initialNetWorth);
  const finalP50 = r.netWorthFan[r.netWorthFan.length - 1]?.p50 ?? initial;
  const years = (r.horizonMonths ?? 120) / 12;
  const cagr = years > 0 && finalP50 > 0 ? Math.pow(finalP50 / initial, 1 / years) - 1 : 0;

  // Return potential: 0% → 0, 10% → 1
  const returnPotential = clamp01(cagr / 0.10);

  // Liquidity: 1 − liquidityRisk (already 0..1 in engine)
  const liquidity = clamp01(1 - (m?.liquidityRisk ?? 0));

  // Cashflow safety: blend of survival, refinance band, and liquidity buffer.
  const survival = clamp01(1 - (r.defaultProbability ?? 0));
  const refiPenalty =
    r.refinancePressureProbability >= 0.5 ? 0.2 :
    r.refinancePressureProbability >= 0.25 ? 0.5 :
    r.refinancePressureProbability >= 0.10 ? 0.75 : 1.0;
  const liquidityStressOk = 1 - clamp01(r.liquidityStressProbability ?? 0);
  const cashflowSafety = clamp01(0.5 * survival + 0.25 * refiPenalty + 0.25 * liquidityStressOk);

  // Tax efficiency: from allocation hint
  const alloc = classifyAllocation(candidate.label, candidate.id);
  const taxEfficiency = clamp01(alloc.taxAdvantage);

  // Risk exposure (HIGHER = MORE risk): max drawdown P90 + downside risk + volatility
  const dd = clamp01((m?.maxDrawdownP90 ?? 0) / 0.6);   // 60% DD = full bar
  const downside = clamp01((m?.downsideRisk ?? 0) / 0.6);
  const vol = clamp01((m?.volatility ?? 0) / 0.6);
  const riskExposure = clamp01(0.5 * dd + 0.3 * downside + 0.2 * vol);

  // Volatility tolerance required (same direction as risk, slightly amplified)
  const volatilityTolerance = clamp01(0.6 * riskExposure + 0.4 * vol);

  return {
    returnPotential,
    liquidity,
    cashflowSafety,
    taxEfficiency,
    riskExposure,
    volatilityTolerance,
  };
}

// ─── Best-for / Avoid-if ─────────────────────────────────────────────────────

function deriveBestForAvoid(
  candidate: RankedCandidate,
  alloc: ReturnType<typeof classifyAllocation>,
  tradeOffs: StrategyTradeOffs,
): { bestFor: string[]; avoidIf: string[] } {
  const bestFor: string[] = [];
  const avoidIf: string[] = [];

  // Best for
  if (tradeOffs.returnPotential >= 0.6 && alloc.growthTilt >= 0.7) {
    bestFor.push("Long-term accumulators (10+ year horizon)");
  }
  if (alloc.taxAdvantage >= 0.7) {
    bestFor.push("High-income earners optimising marginal tax rate");
  }
  if (tradeOffs.cashflowSafety >= 0.7 && tradeOffs.liquidity >= 0.6) {
    bestFor.push("Households needing a strong defensive base");
  }
  if (alloc.category === "property") {
    bestFor.push("Investors comfortable with leverage and time-in-market");
  }
  if (alloc.category === "offset") {
    bestFor.push("Mortgage holders prioritising immediate cashflow safety");
  }
  if (alloc.category === "etf_dca" || alloc.category === "etf") {
    bestFor.push("Users wanting transparent, liquid, market-exposure");
  }
  if (alloc.category === "diversified") {
    bestFor.push("Users wanting a balanced default that hedges across regimes");
  }
  if (bestFor.length === 0) {
    bestFor.push("Balanced households with a 7–10 year horizon");
  }

  // Avoid if
  if (tradeOffs.riskExposure >= 0.55) {
    avoidIf.push("You are within 5 years of retirement");
  }
  if (tradeOffs.liquidity <= 0.35 || alloc.liquidityProfile <= 0.25) {
    avoidIf.push("You are planning a large near-term purchase");
  }
  if (alloc.taxAdvantage >= 0.85) {
    avoidIf.push("You may need access to funds before preservation age");
  }
  if (alloc.category === "crypto" || (candidate.result.riskMetrics?.concentrationRisk ?? 0) > 0.5) {
    avoidIf.push("You cannot tolerate a 40%+ peak-to-trough drawdown");
  }
  if (alloc.category === "property" && candidate.result.refinancePressureProbability > 0.2) {
    avoidIf.push("Your income is volatile or refinance windows fall in years 2–4");
  }
  if (tradeOffs.cashflowSafety <= 0.5) {
    avoidIf.push("Your emergency reserves are below 3 months of expenses");
  }
  if (avoidIf.length === 0) {
    avoidIf.push("You require guaranteed capital preservation");
  }

  return { bestFor: bestFor.slice(0, 3), avoidIf: avoidIf.slice(0, 3) };
}

// ─── Strengths / weaknesses (rule-based "Why this ranks") ────────────────────

function deriveStrengthsWeaknesses(
  candidate: RankedCandidate,
  baseline: ExtendedScenarioResult,
  alloc: ReturnType<typeof classifyAllocation>,
  tradeOffs: StrategyTradeOffs,
): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const r = candidate.result;
  const m = r.riskMetrics;

  const survival = 1 - (r.defaultProbability ?? 0);
  const initial = Math.max(1, r.initialNetWorth);
  const finalP50 = r.netWorthFan[r.netWorthFan.length - 1]?.p50 ?? initial;
  const baseFinalP50 = baseline.netWorthFan[baseline.netWorthFan.length - 1]?.p50 ?? initial;
  const cagr = (r.horizonMonths ?? 120) > 0 && finalP50 > 0
    ? Math.pow(finalP50 / initial, 12 / (r.horizonMonths ?? 120)) - 1
    : 0;
  const nwGainPct = (finalP50 - baseFinalP50) / Math.max(1, Math.abs(baseFinalP50));

  // Strengths
  if (cagr >= 0.07) {
    strengths.push(`Strong projected CAGR (${(cagr * 100).toFixed(1)}%) over the horizon.`);
  } else if (cagr >= 0.05) {
    strengths.push(`Solid projected CAGR (${(cagr * 100).toFixed(1)}%).`);
  }
  if (nwGainPct > 0.05) {
    strengths.push(`Projects ${formatPct(nwGainPct)} more terminal net worth vs. your current path.`);
  }
  if (survival >= 0.95) {
    strengths.push(`Strong survivability (${(survival * 100).toFixed(0)}%) across Monte Carlo stress paths.`);
  } else if (survival >= 0.90) {
    strengths.push(`Solid survivability (${(survival * 100).toFixed(0)}%) under simulated stress.`);
  }
  if (tradeOffs.taxEfficiency >= 0.75) {
    strengths.push("Tax-efficient — uses concessional/offset envelopes to reduce drag.");
  }
  if (alloc.category === "diversified") {
    strengths.push("Diversified across growth, super and (small) crypto — hedges across regimes.");
  }
  if (tradeOffs.liquidity >= 0.7) {
    strengths.push("Maintains a healthy liquidity buffer through the horizon.");
  }
  if (candidate.score.penalties.length === 0) {
    strengths.push("No engine penalties — passes all hard safety constraints.");
  }
  if (strengths.length === 0 && candidate.rationale.length > 0) {
    strengths.push(...candidate.rationale.slice(0, 2));
  }

  // Weaknesses
  if ((m?.maxDrawdownP90 ?? 0) >= 0.30) {
    weaknesses.push(`Larger drawdowns in stress paths (P90 max drawdown ${(m!.maxDrawdownP90 * 100).toFixed(0)}%).`);
  }
  if ((m?.liquidityRisk ?? 0) >= 0.4) {
    weaknesses.push("Lower liquidity in the early years of the plan.");
  }
  if ((m?.concentrationRisk ?? 0) >= 0.5) {
    weaknesses.push(`Concentrated exposure (${((m!.concentrationRisk) * 100).toFixed(0)}% in a single asset class).`);
  }
  if (alloc.category === "crypto") {
    weaknesses.push("Crypto concentration introduces jump-risk and sharp left-tail outcomes.");
  }
  if (candidate.result.refinancePressureProbability >= 0.20) {
    weaknesses.push(`Refinance pressure: ${(candidate.result.refinancePressureProbability * 100).toFixed(0)}% of paths see elevated mortgage stress.`);
  }
  if (candidate.softWarnings.length > 0) {
    for (const w of candidate.softWarnings.slice(0, 2)) {
      weaknesses.push(w.label);
    }
  }
  if (alloc.taxAdvantage >= 0.85 && alloc.liquidityProfile <= 0.2) {
    weaknesses.push("Funds locked until preservation age — limited optionality if plans change.");
  }
  if (weaknesses.length === 0) {
    weaknesses.push("No notable weaknesses surfaced by the engine — review fit against personal goals.");
  }

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
  };
}

// ─── Baseline delta ──────────────────────────────────────────────────────────

function deriveBaselineDelta(
  candidate: RankedCandidate,
  baseline: ExtendedScenarioResult,
): StrategyBaselineDelta {
  const r = candidate.result;
  const cFinalP50 = r.netWorthFan[r.netWorthFan.length - 1]?.p50 ?? r.initialNetWorth;
  const bFinalP50 = baseline.netWorthFan[baseline.netWorthFan.length - 1]?.p50 ?? baseline.initialNetWorth;
  const netWorthDelta = cFinalP50 - bFinalP50;
  const netWorthDeltaPct = netWorthDelta / Math.max(1, Math.abs(bFinalP50));

  // FIRE years delta from the score input — already calculated against base.
  const fireBreakdown = candidate.score.breakdown.find(b => b.axis === "fireAcceleration");
  // The fireAcceleration raw value is already in years pulled in (positive = earlier).
  // Negative delta = years SAVED (FIRE earlier).
  const fireYearsDelta = -(fireBreakdown?.rawValue ?? 0);

  const cDd = r.riskMetrics?.maxDrawdownP90 ?? 0;
  const bDd = baseline.riskMetrics?.maxDrawdownP90 ?? 0;
  const drawdownDeltaPct = cDd - bDd;

  const cLiq = 1 - (r.riskMetrics?.liquidityRisk ?? 0);
  const bLiq = 1 - (baseline.riskMetrics?.liquidityRisk ?? 0);
  const liquidityDeltaPct = cLiq - bLiq;

  const bullets: string[] = [];
  bullets.push(`${signed$(netWorthDelta)} projected net worth (P50)`);
  if (Math.abs(fireYearsDelta) >= 0.1) {
    bullets.push(`FIRE ${Math.abs(fireYearsDelta).toFixed(1)} years ${fireYearsDelta < 0 ? "earlier" : "later"}`);
  }
  if (Math.abs(drawdownDeltaPct) >= 0.02) {
    bullets.push(`${signedPct(drawdownDeltaPct)} deeper drawdowns in stress paths`);
  }
  if (Math.abs(liquidityDeltaPct) >= 0.05) {
    bullets.push(`${signedPct(liquidityDeltaPct)} liquidity buffer through horizon`);
  }

  return {
    netWorthDelta,
    netWorthDeltaPct,
    fireYearsDelta,
    drawdownDeltaPct,
    liquidityDeltaPct,
    bullets,
  };
}

// ─── Stress / resilience ─────────────────────────────────────────────────────

function deriveStress(candidate: RankedCandidate): StressResilience {
  const r = candidate.result;
  const m = r.riskMetrics;

  // Recession resilience: blend of survival + drawdown P90
  const survival = 1 - (r.defaultProbability ?? 0);
  const recessionScore = 0.6 * survival + 0.4 * (1 - clamp01((m?.maxDrawdownP90 ?? 0) / 0.5));
  const recessionLevel: ResilienceLevel = recessionScore >= 0.75 ? "strong" : recessionScore >= 0.55 ? "moderate" : "weak";

  // Inflation resilience: property + ETF heavy → higher; cash/offset heavy → weaker real return
  const alloc = classifyAllocation(candidate.label, candidate.id);
  let inflationScore = 0.55;
  if (alloc.category === "property" || alloc.category === "etf" || alloc.category === "etf_lump" ||
      alloc.category === "etf_dca" || alloc.category === "diversified") inflationScore = 0.8;
  if (alloc.category === "offset") inflationScore = 0.4;
  if (alloc.category === "super") inflationScore = 0.7;
  const inflationLevel: ResilienceLevel = inflationScore >= 0.75 ? "strong" : inflationScore >= 0.5 ? "moderate" : "weak";

  // Rate-shock resilience: inverse of refinance pressure probability + leverage
  const refiPressure = r.refinancePressureProbability ?? 0;
  const lev = m?.leverageRisk ?? 0;
  const rateScore = (1 - clamp01(refiPressure / 0.5)) * 0.6 + (1 - clamp01(lev / 0.8)) * 0.4;
  const rateLevel: ResilienceLevel = rateScore >= 0.75 ? "strong" : rateScore >= 0.5 ? "moderate" : "weak";

  // Job-loss survivability: cash runway months — from liquidityRisk + monthly expenses proxy
  // liquidityRisk = 1 - min(cashP10 / (6mo expenses), 1) → so months ≈ 6 * (1 - liquidityRisk)
  const months = m && Number.isFinite(m.liquidityRisk)
    ? Math.round(6 * (1 - clamp01(m.liquidityRisk)) * 4) // amplify to actual months (engine clips at 6mo)
    : null;
  const jobScore = months === null ? 0.5 : clamp01(months / 12);
  const jobLevel: ResilienceLevel = jobScore >= 0.75 ? "strong" : jobScore >= 0.4 ? "moderate" : "weak";

  return {
    recession: {
      level: recessionLevel,
      detail: `${(survival * 100).toFixed(0)}% survival across stress paths; P90 drawdown ${((m?.maxDrawdownP90 ?? 0) * 100).toFixed(0)}%.`,
    },
    inflation: {
      level: inflationLevel,
      detail: alloc.category === "offset"
        ? "Cash/offset exposure loses real value in high-inflation regimes."
        : "Real-asset / equity tilt provides inflation hedge through the horizon.",
    },
    rateShock: {
      level: rateLevel,
      detail: refiPressure > 0.1
        ? `${(refiPressure * 100).toFixed(0)}% of paths show elevated refinance pressure.`
        : "Low rate-shock exposure given leverage profile.",
    },
    jobLoss: {
      level: jobLevel,
      months,
      detail: months !== null
        ? `Projected cash runway: ~${months} months at current expense profile.`
        : "Cash runway not estimable from current outputs.",
    },
  };
}

// ─── Public entrypoint ───────────────────────────────────────────────────────

export function buildStrategyIntelligence(
  candidate: RankedCandidate,
  baseline: ExtendedScenarioResult,
): StrategyIntelligence {
  const alloc = classifyAllocation(candidate.label, candidate.id);
  const identity = deriveIdentityLabel(candidate, alloc);
  const tradeOffs = deriveTradeOffs(candidate);
  const { bestFor, avoidIf } = deriveBestForAvoid(candidate, alloc, tradeOffs);
  const { strengths, weaknesses } = deriveStrengthsWeaknesses(candidate, baseline, alloc, tradeOffs);
  const baselineDelta = deriveBaselineDelta(candidate, baseline);
  const stress = deriveStress(candidate);

  return {
    narrative: {
      identityLabel: identity.identityLabel,
      identityHint: identity.identityHint,
      strengths,
      weaknesses,
      bestFor,
      avoidIf,
    },
    tradeOffs,
    baselineDelta,
    stress,
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function signed$(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function signedPct(p: number): string {
  if (!Number.isFinite(p)) return "0%";
  const sign = p >= 0 ? "+" : "−";
  return `${sign}${(Math.abs(p) * 100).toFixed(0)}%`;
}

function formatPct(p: number): string {
  if (!Number.isFinite(p)) return "0%";
  const sign = p >= 0 ? "+" : "−";
  return `${sign}${(Math.abs(p) * 100).toFixed(0)}%`;
}
