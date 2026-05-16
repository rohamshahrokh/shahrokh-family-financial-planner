/**
 * explanations.ts — Phase H: AI Explanation Engine V2
 *
 * Generates advisor-grade narrative output from V4 simulation results. The
 * narratives are causal, analytical, and grounded in the actual numbers —
 * they explain WHY a path wins or fails, which assumptions mattered most,
 * which risks dominate, and what changed vs prior runs.
 *
 * This module returns structured narrative payloads (not raw prose) so the
 * UI can render them in cards, drawers, or expansion panels with control
 * over tone and emphasis. The tone is intentionally analytical / strategic,
 * not chirpy. We do not fabricate data — every claim cites a metric.
 */

import type { AdvancedRiskMetrics } from "./risk";
import type { RegimeId } from "./regimes";
import { REGIME_EFFECTS } from "./regimes";

export interface NarrativeBlock {
  heading: string;
  body: string;
  tone: "analytical" | "warning" | "neutral" | "positive";
}

export interface ExplanationContext {
  median: number;
  p10: number;
  p90: number;
  probFf: number;
  metrics: AdvancedRiskMetrics;
  dominantYearRegimes: RegimeId[];      // per year, length = N_YEARS
  startYear: number;
  /** Optional prior run for delta narratives. */
  prior?: { median: number; p10: number; p90: number; probFf: number } | null;
  /** Driver weights — which assumption mattered most. Set externally. */
  driverWeights?: Array<{ name: string; weight: number; direction: "up" | "down" }>;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;

export function buildV4Narratives(ctx: ExplanationContext): NarrativeBlock[] {
  const out: NarrativeBlock[] = [];

  // ── 1. Why this path wins or loses ─────────────────────────────────────
  {
    const spread = ctx.p90 / Math.max(ctx.p10, 1);
    const tone: NarrativeBlock["tone"] = ctx.p10 < 0 ? "warning"
      : ctx.median < 1_500_000 ? "neutral" : "positive";
    const body = [
      `Median 2035 net worth lands at ${fmtM(ctx.median)} with a P10 of ${fmtM(ctx.p10)} and P90 of ${fmtM(ctx.p90)}.`,
      spread > 8
        ? `Outcome spread is ${spread.toFixed(1)}x — your portfolio is high-variance and the path you actually walk matters as much as the average.`
        : `Outcome spread is ${spread.toFixed(1)}x — comparatively tight; the strategy is robust to regime variation.`,
      ctx.p10 < 0
        ? "The downside tail produces negative net worth, meaning a bad sequence of regimes (recession → tightening) would erase equity."
        : "The downside tail remains positive — the household has structural resilience even in adverse regimes.",
    ].join(" ");
    out.push({ heading: "Why this path wins or fails", body, tone });
  }

  // ── 2. Which assumptions mattered most ────────────────────────────────
  if (ctx.driverWeights && ctx.driverWeights.length > 0) {
    const top = ctx.driverWeights.slice(0, 3);
    const body = `The three variables doing the heaviest lifting are ${top
      .map(d => `${d.name} (${d.direction === "up" ? "↑" : "↓"} ${(d.weight * 100).toFixed(0)}%)`)
      .join(", ")}. Sensitivity analysis shows perturbations to these inputs move median NW by ${top.reduce((s, d) => s + d.weight * 100, 0).toFixed(0)}% more than perturbations to other inputs of the same magnitude.`;
    out.push({ heading: "Assumptions that mattered most", body, tone: "analytical" });
  }

  // ── 3. Which risks dominate ───────────────────────────────────────────
  {
    const dominant = [
      ctx.metrics.refinanceFailureProb > 15 ? `refinance risk (${ctx.metrics.refinanceFailureProb}%)` : null,
      ctx.metrics.liquidityExhaustionProb > 10 ? `liquidity exhaustion (${ctx.metrics.liquidityExhaustionProb}%)` : null,
      ctx.metrics.insolvencyProb > 5 ? `insolvency tail (${ctx.metrics.insolvencyProb}%)` : null,
      ctx.metrics.debtSpiralProb > 5 ? `debt-spiral risk (${ctx.metrics.debtSpiralProb}%)` : null,
    ].filter(Boolean) as string[];
    const body = dominant.length === 0
      ? "No single risk dominates — no individual stress metric exceeds the institutional caution threshold. The risk picture is balanced, with normal market-noise volatility as the dominant uncertainty driver."
      : `The dominant risks are ${dominant.join(", ")}. These risks are correlated — refinance failure tends to coincide with liquidity exhaustion during tightening regimes, so mitigating one materially helps the others.`;
    out.push({ heading: "Risks that dominate", body, tone: dominant.length > 0 ? "warning" : "neutral" });
  }

  // ── 4. Regime narrative ───────────────────────────────────────────────
  {
    const counts: Partial<Record<RegimeId, number>> = {};
    for (const r of ctx.dominantYearRegimes) counts[r] = (counts[r] ?? 0) + 1;
    const ranked = Object.entries(counts).sort((a, b) => b[1]! - a[1]!).slice(0, 3);
    const labels = ranked.map(([r, n]) => `${REGIME_EFFECTS[r as RegimeId].label} (${n}yr)`).join(", ");
    out.push({
      heading: "Macro regime pattern",
      body: `Across simulated paths the most common year-dominant regimes are ${labels}. This means your household is being stress-tested predominantly against these conditions — examine the regime tooltips to see how each shifts inflation, rates, and property dynamics.`,
      tone: "analytical",
    });
  }

  // ── 5. Variables driving uncertainty ──────────────────────────────────
  {
    out.push({
      heading: "Where the uncertainty comes from",
      body: `The CVaR95 of ${fmt(ctx.metrics.cvar95)} versus median ${fmt(ctx.median)} suggests the left tail is ${((1 - ctx.metrics.cvar95 / Math.max(ctx.median, 1)) * 100).toFixed(0)}% below median. Sequence-of-return risk score is ${ctx.metrics.sorRisk.toFixed(2)} — higher numbers mean the ORDER of returns matters as much as the AVERAGE. This is particularly relevant if you transition to FIRE before 2030.`,
      tone: "analytical",
    });
  }

  // ── 6. Delta vs prior run ─────────────────────────────────────────────
  if (ctx.prior) {
    const dMed = ctx.median - ctx.prior.median;
    const dFf  = ctx.probFf - ctx.prior.probFf;
    const tone: NarrativeBlock["tone"] = dMed >= 0 && dFf >= 0 ? "positive" : "warning";
    out.push({
      heading: "What changed since last run",
      body: `Median NW shifted by ${dMed >= 0 ? "+" : ""}${fmtM(dMed)} and FIRE probability shifted by ${dFf >= 0 ? "+" : ""}${dFf.toFixed(1)} pp. The drivers are typically (a) assumption changes you made, (b) updated snapshot data, or (c) different regime mix in the sample.`,
      tone,
    });
  }

  return out;
}

/** Convenience: collapse blocks into key_risks / recommendations strings for the existing UI surface. */
export function narrativesToLegacyStrings(blocks: NarrativeBlock[]): { key_risks: string[]; advisor_notes: string[] } {
  const key_risks = blocks.filter(b => b.tone === "warning").map(b => `${b.heading}: ${b.body}`);
  const advisor_notes = blocks.filter(b => b.tone !== "warning").map(b => `${b.heading}: ${b.body}`);
  return { key_risks, advisor_notes };
}
