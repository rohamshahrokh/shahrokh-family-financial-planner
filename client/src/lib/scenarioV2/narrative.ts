/**
 * Scenario Engine V2 — Narrative Engine
 * ────────────────────────────────────────────────────────────────────────────
 * Turns ExtendedScenarioResult arrays into plain-English stories that a
 * non-quant family member can read on a phone.
 *
 * Outputs (per scenario):
 *   - headline           (one-line punch)
 *   - story              (1–2 paragraph narrative)
 *   - keyMoves           (3–5 bullet "what happens" lines)
 *   - whyItWorks         (positive driver explanation)
 *   - whatCouldGoWrong   (risk in plain words)
 *   - confidence         (0–100, derived from MC dispersion + sims count)
 *
 * Outputs (overall):
 *   - recommendation     (long, advisor-grade — used in PDF too)
 *   - tldr               (one sentence — used in hero card)
 *   - confidenceOverall  (0–100)
 *   - winnerScenarioId
 */

import type { ExtendedScenarioResult } from "./runScenario";

export interface ScenarioNarrative {
  scenarioId: string;
  name: string;
  headline: string;
  story: string;
  keyMoves: string[];
  whyItWorks: string;
  whatCouldGoWrong: string;
  confidence: number; // 0..100
}

export interface ComparisonNarrative {
  tldr: string;
  recommendation: string;
  winnerScenarioId: string;
  confidenceOverall: number; // 0..100
  scenarios: ScenarioNarrative[];
}

interface NarrativeInputs {
  results: ExtendedScenarioResult[];
  horizonYears: number;
  simulationCount: number;
  capital: number;
  propertyGrowthPct: number;
  cryptoVolPct: number;
  cashAprPct: number;
  mortgageRatePct: number;
}

const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const fmt$k = (n: number) => `$${(Math.round(n / 1000)).toLocaleString("en-AU")}k`;
const fmt$M = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${(Math.round(n / 1000))}k`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function pickBand(serv: any): string {
  return (serv?.band as string) ?? "manageable";
}

function endFan(r: ExtendedScenarioResult) {
  return r.netWorthFan[r.netWorthFan.length - 1];
}
function endCash(r: ExtendedScenarioResult) {
  return r.cashFan[r.cashFan.length - 1];
}

/** Confidence drops with high CV, high downside, low sim count, weak band. */
function scenarioConfidence(r: ExtendedScenarioResult, sims: number): number {
  const cv = r.sequenceDispersion?.cv ?? 0.2;
  const downside = r.riskMetrics?.downsideRisk ?? 0.2;
  const lvr = r.serviceability?.lvr ?? 0;
  const negEq = r.negativeEquityProbability ?? 0;
  const liq = r.liquidityStressProbability ?? 0;

  // Base 100, subtract penalties
  let c = 100;
  c -= Math.min(35, cv * 100);          // up to -35 for high dispersion
  c -= Math.min(25, downside * 50);     // up to -25 for downside
  c -= Math.min(15, lvr * 20);          // up to -15 for high LVR
  c -= Math.min(15, negEq * 50);        // up to -15 for neg-equity P
  c -= Math.min(10, liq * 30);          // up to -10 for liquidity stress
  // Bonus / penalty from sims count (relative to 500 baseline)
  c -= Math.max(0, (500 - sims) / 25);  // small penalty if <500 sims
  return Math.max(15, Math.min(99, Math.round(c)));
}

function scenarioTypeFromId(id: string): "base" | "property" | "crypto" | "cash" | "custom" {
  if (id === "base") return "base";
  if (id.includes("property")) return "property";
  if (id.includes("crypto")) return "crypto";
  if (id.includes("cash")) return "cash";
  return "custom";
}

// ─── Per-scenario narrative ───────────────────────────────────────────────────

function buildScenarioNarrative(
  r: ExtendedScenarioResult,
  inputs: NarrativeInputs,
  base?: ExtendedScenarioResult,
): ScenarioNarrative {
  const t = scenarioTypeFromId(r.scenarioId);
  const fan = endFan(r);
  const cashEnd = endCash(r);
  const yrs = inputs.horizonYears;
  const downsidePct = (r.riskMetrics.downsideRisk * 100).toFixed(0);
  const volPct = (r.riskMetrics.volatility * 100).toFixed(0);
  const cv = (r.sequenceDispersion.cv * 100).toFixed(0);
  const negEq = (r.negativeEquityProbability * 100).toFixed(0);
  const liq = (r.liquidityStressProbability * 100).toFixed(0);
  const band = pickBand(r.serviceability);
  const lvr = pct(r.serviceability?.lvr ?? 0);
  const dsr = pct(r.serviceability?.dsr ?? 0);
  const deltaVsBase = base ? fan.p50 - endFan(base).p50 : 0;
  const deltaPct = base && endFan(base).p50 > 0 ? (deltaVsBase / endFan(base).p50) * 100 : 0;

  let headline: string, story: string, whyItWorks: string, whatCouldGoWrong: string;
  let keyMoves: string[] = [];

  // ── Base ────────────────────────────────────────────────────────────────────
  if (t === "base") {
    headline = `Stay the course → ${fmt$M(fan.p50)} median net worth in ${yrs} years.`;
    story =
      `Your current trajectory — no new ${fmt$k(inputs.capital)} deployment — lands at a median ` +
      `${fmt$M(fan.p50)} net worth over ${yrs} years (10th-90th percentile: ${fmt$M(fan.p10)} ` +
      `to ${fmt$M(fan.p90)}). This is the benchmark every other path is measured against.`;
    keyMoves = [
      `No new asset purchases or lump-sum allocations`,
      `Existing mortgage + offset continue under base assumptions`,
      `Super + ETF DCA continue at ledger rate`,
      `Cash buffer compounds at ${inputs.cashAprPct.toFixed(2)}% APR`,
    ];
    whyItWorks = `Lowest friction path. Preserves all optionality. No leverage shock.`;
    whatCouldGoWrong =
      `Real returns on idle cash typically trail property and equities long-term — opportunity cost ` +
      `is your main risk here, not capital loss.`;
  }

  // ── Property ────────────────────────────────────────────────────────────────
  else if (t === "property") {
    const leveragedPurchase = inputs.capital * 5;
    headline = base && deltaVsBase > 0
      ? `Leverage the ${fmt$k(inputs.capital)} into a ${fmt$M(leveragedPurchase)} property → +${fmt$M(deltaVsBase)} net worth.`
      : `Leverage the ${fmt$k(inputs.capital)} into property → ${fmt$M(fan.p50)} median net worth.`;
    story =
      `Use the ${fmt$k(inputs.capital)} as a 20% deposit on a ${fmt$M(leveragedPurchase)} investment ` +
      `property at ${inputs.mortgageRatePct.toFixed(2)}% mortgage. Median outcome: ${fmt$M(fan.p50)} ` +
      `net worth in ${yrs} years, with 10th-90th percentile of ${fmt$M(fan.p10)} → ${fmt$M(fan.p90)}. ` +
      `Serviceability sits in the "${band}" band (LVR ${lvr}, DSR ${dsr}). Negative-equity probability ` +
      `is ${negEq}% and liquidity stress is ${liq}%.`;
    keyMoves = [
      `Deposit ${fmt$k(inputs.capital)} on a ${fmt$M(leveragedPurchase)} property`,
      `Take a ${fmt$M(leveragedPurchase * 0.8)} mortgage at ${inputs.mortgageRatePct.toFixed(2)}% over 30 years`,
      `Collect rent net of vacancy (4%) + management (8%)`,
      `Capital growth assumed at ${inputs.propertyGrowthPct.toFixed(1)}%/yr`,
      `Mortgage principal compounds your equity each month`,
    ];
    whyItWorks =
      `Leverage on a hard asset: a ${inputs.propertyGrowthPct.toFixed(1)}%/yr capital growth on the full ` +
      `${fmt$M(leveragedPurchase)} purchase price flows back to your equity, not just to the ${fmt$k(inputs.capital)} deposit.`;
    whatCouldGoWrong =
      `Property is illiquid and leveraged — a rate spike or vacancy run could push DSR above tolerance ` +
      `and force a sale at a bad price. Refinance pressure probability over the horizon is ` +
      `${(r.refinancePressureProbability * 100).toFixed(0)}%.`;
  }

  // ── Crypto ──────────────────────────────────────────────────────────────────
  else if (t === "crypto") {
    headline = base && deltaVsBase > 0
      ? `Lump ${fmt$k(inputs.capital)} into BTC → +${fmt$M(deltaVsBase)} median (but ${downsidePct}% downside).`
      : `Lump ${fmt$k(inputs.capital)} into BTC → ${fmt$M(fan.p50)} median, ${downsidePct}% downside.`;
    story =
      `Deploy the full ${fmt$k(inputs.capital)} as a one-shot BTC purchase. Median outcome: ` +
      `${fmt$M(fan.p50)} net worth at ${yrs} years, but the dispersion is wide: 10th-90th percentile ` +
      `runs ${fmt$M(fan.p10)} → ${fmt$M(fan.p90)}. Sequence dispersion (CV) is ${cv}% — among the ` +
      `widest of any path here. Under your ${inputs.cryptoVolPct.toFixed(0)}% volatility assumption, ` +
      `this is a barbell bet, not a core allocation.`;
    keyMoves = [
      `One-shot ${fmt$k(inputs.capital)} BTC purchase at today's price`,
      `No rebalancing — hold for ${yrs} years`,
      `Captures fat-tailed up-moves (Student-t v=3 + jump diffusion)`,
      `No leverage, no serviceability impact`,
    ];
    whyItWorks =
      `Highest expected return per dollar over long horizons under your assumptions. Zero leverage ` +
      `means no margin call risk and no impact on home-loan serviceability.`;
    whatCouldGoWrong =
      `Volatility is ${volPct}% per year — a 50-70% drawdown is fully inside the modeled distribution. ` +
      `The downside (P10 vs P50) is ${downsidePct}%, meaning a bad sequence of outcomes can wipe out ` +
      `the deployment entirely. Treat this as a high-conviction satellite, not a core holding.`;
  }

  // ── Cash ────────────────────────────────────────────────────────────────────
  else if (t === "cash") {
    headline = `Hold ${fmt$k(inputs.capital)} as cash → ${fmt$M(fan.p50)} median, ${fmt$M(cashEnd.p50)} liquid.`;
    story =
      `Park the ${fmt$k(inputs.capital)} in offset / high-interest cash at ${inputs.cashAprPct.toFixed(2)}% ` +
      `APR. Median outcome: ${fmt$M(fan.p50)} net worth in ${yrs} years, with ${fmt$M(cashEnd.p50)} ` +
      `of that sitting as accessible cash at the end. Dispersion (CV) is just ${cv}% — by far the ` +
      `tightest band of any option, since there is essentially no market risk.`;
    keyMoves = [
      `Move ${fmt$k(inputs.capital)} into offset / HISA at ${inputs.cashAprPct.toFixed(2)}% APR`,
      `Compound monthly, no taxable events`,
      `Full optionality — redeploy any month`,
      `Cuts mortgage interest dollar-for-dollar (if in offset)`,
    ];
    whyItWorks =
      `Lowest variance path. Tightest P10–P90 band of any scenario. Preserves optionality so you can ` +
      `redeploy as conditions change.`;
    whatCouldGoWrong =
      `Real (after-inflation) return is small — at ${inputs.cashAprPct.toFixed(2)}% APR vs likely 3% CPI, ` +
      `your purchasing power barely grows. Over ${yrs} years the opportunity cost vs property or equity ` +
      `is meaningful (${deltaPct < 0 ? Math.abs(deltaPct).toFixed(0) : 0}% lower median than the leader).`;
  }

  // ── Custom delta-driven scenario ────────────────────────────────────────────
  else {
    headline = `${r.name} → ${fmt$M(fan.p50)} median net worth in ${yrs} years.`;
    story =
      `Custom scenario "${r.name}" produces a median ${fmt$M(fan.p50)} net worth ` +
      `(P10–P90: ${fmt$M(fan.p10)} → ${fmt$M(fan.p90)}) with serviceability in the "${band}" band.`;
    keyMoves = r.serviceability?.rationale?.slice(0, 4) ?? [];
    whyItWorks = `Risk-adjusted NW lands at ${fmt$M(r.riskMetrics.riskAdjustedNw)} after ${downsidePct}% downside penalty.`;
    whatCouldGoWrong =
      `Sequence dispersion is ${cv}%, downside (P10 vs P50) is ${downsidePct}%, ` +
      `liquidity stress probability is ${liq}%.`;
  }

  return {
    scenarioId: r.scenarioId,
    name: r.name,
    headline,
    story,
    keyMoves,
    whyItWorks,
    whatCouldGoWrong,
    confidence: scenarioConfidence(r, inputs.simulationCount),
  };
}

// ─── Overall comparison narrative + recommendation ────────────────────────────

export function buildComparisonNarrative(inputs: NarrativeInputs): ComparisonNarrative {
  const { results, capital, horizonYears, simulationCount } = inputs;
  if (results.length === 0) {
    return {
      tldr: "Run the engine to see your decision.",
      recommendation: "No results yet — tune assumptions and press Run.",
      winnerScenarioId: "base",
      confidenceOverall: 0,
      scenarios: [],
    };
  }

  const base = results.find(r => r.scenarioId === "base");

  // Risk-adjusted is the primary winner (it already balances NW + downside)
  const winner = [...results].sort(
    (a, b) => b.riskMetrics.riskAdjustedNw - a.riskMetrics.riskAdjustedNw,
  )[0];
  const byNw = [...results].sort((a, b) => endFan(b).p50 - endFan(a).p50)[0];

  const winnerNw = endFan(winner);
  const winnerCash = endCash(winner);
  const winnerDelta = base ? winnerNw.p50 - endFan(base).p50 : 0;
  const winnerConfidence = scenarioConfidence(winner, simulationCount);

  // TLDR — one sentence
  const tldr = winner.scenarioId === "base"
    ? `Keep the ${fmt$k(capital)} deployed as today — no allocation beats your current path on a risk-adjusted basis.`
    : `Deploy the ${fmt$k(capital)} via "${winner.name}" — best risk-adjusted outcome at ${fmt$M(winnerNw.p50)} ` +
      `median NW (${winnerDelta >= 0 ? "+" : ""}${fmt$M(winnerDelta)} vs base), ${winnerConfidence}% confidence.`;

  // Long-form recommendation
  let rec =
    `Across ${results.length} paths and ${simulationCount.toLocaleString()} Monte Carlo simulations, ` +
    `the highest risk-adjusted outcome for your ${fmt$(capital)} is "${winner.name}". ` +
    `It produces ${fmt$M(winnerNw.p50)} median net worth in ${horizonYears} years ` +
    `(P10–P90: ${fmt$M(winnerNw.p10)} → ${fmt$M(winnerNw.p90)}), with ` +
    `${fmt$M(winnerCash.p50)} median terminal cash and a serviceability band of ` +
    `"${pickBand(winner.serviceability)}". Downside (P10 vs P50) is ` +
    `${(winner.riskMetrics.downsideRisk * 100).toFixed(1)}%.\n\n`;

  if (byNw.scenarioId !== winner.scenarioId) {
    const byNwFan = endFan(byNw);
    rec +=
      `"${byNw.name}" has a higher raw median NW (${fmt$M(byNwFan.p50)}) but its ` +
      `${(byNw.riskMetrics.downsideRisk * 100).toFixed(1)}% downside makes the risk-adjusted call ` +
      `favour "${winner.name}" instead. If you are willing to accept the additional downside in ` +
      `exchange for higher upside, "${byNw.name}" remains a defensible choice.\n\n`;
  }

  // Add risk caveats
  const worst = [...results].sort(
    (a, b) => b.riskMetrics.downsideRisk - a.riskMetrics.downsideRisk,
  )[0];
  if (worst.scenarioId.includes("crypto")) {
    rec +=
      `Crypto shows the widest dispersion (CV ${(worst.sequenceDispersion.cv * 100).toFixed(0)}%) — ` +
      `treat it as a barbell allocation, not a core holding. `;
  }
  if (worst.scenarioId.includes("property")) {
    rec +=
      `Property carries leverage and illiquidity risk — confirm serviceability holds under a +1.5% ` +
      `rate shock before committing. `;
  }

  const liqWinner = [...results].sort(
    (a, b) => endCash(b).p50 - endCash(a).p50,
  )[0];
  if (liqWinner.scenarioId.includes("cash") && winner.scenarioId !== liqWinner.scenarioId) {
    rec +=
      `Cash preserves the most optionality (highest terminal liquidity at ${fmt$M(endCash(liqWinner).p50)}) ` +
      `but at the cost of long-run net worth. Consider splitting: deploy a portion via "${winner.name}" ` +
      `and keep a portion as cash for the next opportunity.\n\n`;
  }

  rec +=
    `This is generated from your live ledger and the assumptions you set. It is not personal financial ` +
    `advice. Re-run with different assumptions to stress-test the conclusion.`;

  // Overall confidence = simple average of all scenario confidences
  const confidenceOverall = Math.round(
    results.reduce((s, r) => s + scenarioConfidence(r, simulationCount), 0) / results.length,
  );

  return {
    tldr,
    recommendation: rec,
    winnerScenarioId: winner.scenarioId,
    confidenceOverall,
    scenarios: results.map(r => buildScenarioNarrative(r, inputs, base)),
  };
}
