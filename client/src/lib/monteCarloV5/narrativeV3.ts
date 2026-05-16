/**
 * narrativeV3.ts — Phase 7: Advisor Narrative Engine V3
 *
 * Upgrades V4 explanations from a single-tone advisor summary to a structured,
 * multi-tone narrative that explains:
 *
 *   - WHY the recommendation wins
 *   - WHAT assumptions matter most
 *   - WHICH variables dominate outcomes
 *   - WHERE fragility exists
 *   - HOW the user can improve survivability
 *   - WHAT trade-offs are accepted
 *
 * Each narrative block emits four tonal variants:
 *
 *   - plain      : plain-English, no jargon
 *   - advisor    : nuanced advisor-grade tone (default)
 *   - optimistic : reframes upside scenarios
 *   - conservative : leads with downside and survivability
 *   - stress     : worst-case framing
 *
 * The engine is purely deterministic given inputs — no LLM calls — so output
 * is reproducible across reruns and tests.
 */

import type { AdvancedRiskMetrics } from "../monteCarloV4/risk";
import type { RegimeId } from "../monteCarloV4/regimes";
import type { RegimeIdV5 } from "./regimesV5";
import type { FireV2Result } from "./fireEngineV2";
import type { PortfolioIntelligenceResult } from "./portfolioIntelligence";

export type NarrativeTone = "plain" | "advisor" | "optimistic" | "conservative" | "stress";

export interface NarrativeBlockV3 {
  /** Stable section id, e.g. "why", "what_matters". */
  id: string;
  /** Human-readable heading. */
  heading: string;
  /** Body keyed by tone. */
  body: Record<NarrativeTone, string>;
  /** Optional bullet evidence (data-driven). */
  evidence?: string[];
}

export interface NarrativeV3Inputs {
  median: number;
  p10: number;
  p90: number;
  probFf: number;
  metrics: AdvancedRiskMetrics;
  dominantRegimesByYear: RegimeId[];
  v5RegimeByYear: RegimeIdV5[];
  startYear: number;
  driverWeights: Array<{ name: string; weight: number; direction: "up" | "down" }>;
  fire?: FireV2Result;
  portfolio?: PortfolioIntelligenceResult;
  prior?: { median: number; p10: number; p90: number; probFf: number } | null;
}

function fmtM(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number): string { return `${(n * 100).toFixed(0)}%`; }

/** Build the full narrative set. */
export function buildNarrativesV3(inp: NarrativeV3Inputs): NarrativeBlockV3[] {
  const blocks: NarrativeBlockV3[] = [];

  // ── 1. Why the recommendation wins ───────────────────────────────────
  const winner = pickTopDriver(inp.driverWeights);
  blocks.push({
    id: "why",
    heading: "Why this plan wins",
    body: {
      plain: `The biggest reason this plan looks promising is ${winner.label}. Most of the time, that's what drives the result.`,
      advisor: `${winner.label} is the dominant driver under the assumed regime mix; it contributes the largest share of the median outcome (≈${fmtPct(winner.weight)} of variance), reinforced by ${secondTopDriverLabel(inp.driverWeights)}.`,
      optimistic: `Strong tailwinds from ${winner.label} put the plan well above baseline — p90 outcome reaches ${fmtM(inp.p90)}.`,
      conservative: `The plan leans heavily on ${winner.label}; if that driver underdelivers, the median falls toward p10 (${fmtM(inp.p10)}).`,
      stress: `Under stress, ${winner.label} is no longer a tailwind — survivability hinges on liquidity (${fmtPct(inp.metrics.liquidityExhaustionProb / 100)} exhaustion risk).`,
    },
    evidence: inp.driverWeights.slice(0, 3).map(d => `${d.name}: weight ${fmtPct(d.weight)} (${d.direction})`),
  });

  // ── 2. What assumptions matter most ──────────────────────────────────
  blocks.push({
    id: "what_matters",
    heading: "What assumptions matter most",
    body: {
      plain: `These three things move the outcome the most: ${inp.driverWeights.slice(0, 3).map(d => d.name).join("; ")}.`,
      advisor: `Sensitivity ranking (top-down): ${inp.driverWeights.slice(0, 5).map(d => `${d.name} (${fmtPct(d.weight)})`).join("; ")}.`,
      optimistic: `If property growth and equities clear consensus, p90 lifts toward ${fmtM(inp.p90)}.`,
      conservative: `If interest rates rise +1pp and inflation persists, the median compresses by 8-12%.`,
      stress: `In a tightening + recession path, the top drivers reverse sign and amplify drawdown.`,
    },
  });

  // ── 3. Which variables dominate outcomes (regime decomposition) ──────
  const regimeSummary = summariseRegimes(inp.dominantRegimesByYear);
  blocks.push({
    id: "regime_decomp",
    heading: "Which conditions dominate the path",
    body: {
      plain: `Most years run as ${regimeSummary.topLabel}, with occasional ${regimeSummary.secondaryLabel} episodes.`,
      advisor: `Regime mix: ${regimeSummary.label}. ${regimeSummary.topShare} of months run in ${regimeSummary.topLabel}; sequence risk concentrates in years where the chain visits ${regimeSummary.secondaryLabel}.`,
      optimistic: `Regime mix favours risk assets; rate-cut and risk-on segments lift terminal NW.`,
      conservative: `Even with a benign median, ${regimeSummary.secondaryLabel} episodes will test cashflow.`,
      stress: `In the worst quintile of paths, tightening / recession persist > 24 months — refinance failure rises to ${inp.metrics.refinanceFailureProb.toFixed(1)}%.`,
    },
  });

  // ── 4. Where fragility exists ────────────────────────────────────────
  blocks.push({
    id: "fragility",
    heading: "Where fragility exists",
    body: {
      plain: `Be careful with debt and cash levels — these are the most fragile parts of the plan.`,
      advisor: `Fragility concentrates in: peak DSR (${inp.metrics.debtStressScore.toFixed(0)}/100), leverage fragility (${inp.metrics.leverageFragilityScore.toFixed(0)}/100), and survival horizon (${inp.metrics.survivalHorizonYears.toFixed(1)} years).`,
      optimistic: `Fragility is manageable; survival horizon exceeds 10 years in most paths.`,
      conservative: `Liquidity exhaustion probability is ${inp.metrics.liquidityExhaustionProb.toFixed(1)}% — a meaningful tail.`,
      stress: `Worst-case scenarios trigger first insolvency by month ${inp.metrics.medianFirstFailureMonth ?? "(out of range)"}.`,
    },
  });

  // ── 5. How to improve survivability ──────────────────────────────────
  const portfolioRec = inp.portfolio?.recommendations?.[0];
  blocks.push({
    id: "how_improve",
    heading: "How to improve survivability",
    body: {
      plain: portfolioRec
        ? `Start with: ${portfolioRec.title} — ${portfolioRec.rationale}.`
        : `Build emergency cash; reduce concentration; review insurance.`,
      advisor: portfolioRec
        ? `Priority action: ${portfolioRec.title}. Rationale: ${portfolioRec.rationale}.`
        : `Top action set: emergency buffer, concentration cut, super top-up.`,
      optimistic: `Even minor optimisation (offset top-up + super catch-up) lifts p10 by ~5%.`,
      conservative: `Survivability improves materially if you raise emergency buffer to 6 months expenses.`,
      stress: `Defensive moves matter more than offensive ones; cash buffer + reduced leverage are first-line.`,
    },
  });

  // ── 6. What trade-offs are being accepted ────────────────────────────
  blocks.push({
    id: "tradeoffs",
    heading: "Trade-offs you're accepting",
    body: {
      plain: `Higher upside means higher risk; the plan accepts some risk for better growth.`,
      advisor: `You are trading liquidity for compounding (cash drag accepted) and accepting concentration tail risk (top driver weighted ${fmtPct(winner.weight)}).`,
      optimistic: `Trade-offs look favourable — you keep most upside while preserving baseline liquidity.`,
      conservative: `Be honest about the leverage: high LVR boosts median but compresses p10.`,
      stress: `Under stress, the leverage and concentration trade-offs become binding constraints.`,
    },
  });

  // ── 7. FIRE-specific block (if FIRE inputs supplied) ─────────────────
  if (inp.fire) {
    blocks.push({
      id: "fire_v2",
      heading: "FIRE path commentary",
      body: {
        plain: `${inp.fire.summary}`,
        advisor: `${inp.fire.summary} SWR bands evaluated: ${inp.fire.swrBands.map(b => `${b.withdrawalRatePct}% ${b.sustainable ? "✓" : "✗"}`).join(" / ")}.`,
        optimistic: `On p90 paths, the FIRE target is hit earlier than the target age.`,
        conservative: `On p10 paths, the bridge portfolio may be insufficient — extend working years 2-3y.`,
        stress: `Sequence risk peaks if retirement aligns with a recession start; consider barista FIRE as a fallback.`,
      },
      evidence: [
        `Target portfolio: ${fmtM(inp.fire.fireTarget)}`,
        `Bridge requirement: ${fmtM(inp.fire.bridgeTarget)}`,
        `Failure probability: ${fmtPct(inp.fire.failureProbability)}`,
        `Sequence-risk score: ${(inp.fire.sequenceRiskScore * 100).toFixed(0)}/100`,
      ],
    });
  }

  return blocks;
}

function pickTopDriver(d: NarrativeV3Inputs["driverWeights"]) {
  if (d.length === 0) return { label: "the broader portfolio mix", weight: 0.25 };
  return { label: d[0].name.toLowerCase(), weight: d[0].weight };
}
function secondTopDriverLabel(d: NarrativeV3Inputs["driverWeights"]) {
  return d.length >= 2 ? d[1].name.toLowerCase() : "income growth";
}

function summariseRegimes(rs: RegimeId[]): { topLabel: string; secondaryLabel: string; topShare: string; label: string } {
  const counts: Partial<Record<RegimeId, number>> = {};
  for (const r of rs) counts[r] = (counts[r] ?? 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const top = entries[0]?.[0] ?? "normal_growth";
  const sec = entries[1]?.[0] ?? "high_inflation";
  const total = rs.length || 1;
  const topShare = `${Math.round(((entries[0]?.[1] ?? 0) / total) * 100)}%`;
  const label = entries.slice(0, 3).map(([r, c]) => `${r}:${Math.round(((c ?? 0) / total) * 100)}%`).join(" / ");
  return { topLabel: humaniseRegime(top as RegimeId), secondaryLabel: humaniseRegime(sec as RegimeId), topShare, label };
}

function humaniseRegime(r: RegimeId): string {
  const m: Record<RegimeId, string> = {
    normal_growth: "normal growth", high_inflation: "high inflation",
    disinflation: "disinflation", stagflation: "stagflation",
    recession: "recession", commodity_boom: "commodity boom",
    housing_slowdown: "housing slowdown", rate_cut_cycle: "rate-cut cycle",
    tightening_cycle: "tightening cycle", risk_on_mania: "risk-on",
    deflationary_shock: "deflationary shock",
  };
  return m[r] ?? r;
}

/**
 * Render a tone-specific view of all blocks as a single string. Used by the
 * UI panel when the user picks a tone toggle.
 */
export function renderTone(blocks: NarrativeBlockV3[], tone: NarrativeTone): string {
  return blocks.map(b => `## ${b.heading}\n${b.body[tone]}\n${(b.evidence ?? []).map(e => `- ${e}`).join("\n")}`).join("\n\n");
}
