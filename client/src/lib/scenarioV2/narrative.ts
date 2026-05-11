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

export interface FailureDriver {
  /** Human-readable label, e.g. "Default probability" */
  label: string;
  /** Severity 0..1 (used for ranking) */
  severity: number;
  /** One-line plain-English explanation incl. numbers */
  detail: string;
}

export interface ScenarioAttribution {
  /** Top 3 risk drivers ranked by severity */
  failureDrivers: FailureDriver[];
  /** Break-even line: what would need to change for this scenario to beat base */
  breakEven: string | null;
  /** When liquidity stress / default / negative-equity events first fire (median month, human-readable) */
  timing: string | null;
  /** Safe leverage / yield range string (property scenarios only) */
  safeRange: string | null;
  /** Headline verdict: "FAILS" / "AT RISK" / "VIABLE" / "STRONG" */
  verdict: "FAILS" | "AT RISK" | "VIABLE" | "STRONG";
}

export interface ScenarioNarrative {
  scenarioId: string;
  name: string;
  headline: string;
  story: string;
  keyMoves: string[];
  whyItWorks: string;
  whatCouldGoWrong: string;
  confidence: number; // 0..100
  /** Deep failure-attribution layer (Session 4) */
  attribution: ScenarioAttribution;
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

/** Confidence drops with high CV, high downside, low sim count, weak band,
 *  HARDER for insolvency / negative-NW outcomes. Coherent with outputs. */
function scenarioConfidence(r: ExtendedScenarioResult, sims: number): number {
  const cv = r.sequenceDispersion?.cv ?? 0.2;
  const downside = r.riskMetrics?.downsideRisk ?? 0.2;
  const lvr = r.serviceability?.lvr ?? 0;
  const negEq = r.negativeEquityProbability ?? 0;
  const liq = r.liquidityStressProbability ?? 0;
  const def = r.defaultProbability ?? 0;
  const fan = r.netWorthFan[r.netWorthFan.length - 1];
  const terminalP50 = fan.p50;
  const terminalP10 = fan.p10;
  const initial = r.initialNetWorth;

  // Base 100, subtract penalties
  let c = 100;
  c -= Math.min(30, cv * 100);          // up to -30 for high dispersion
  c -= Math.min(20, downside * 40);     // up to -20 for downside
  c -= Math.min(10, lvr * 14);          // up to -10 for high LVR
  c -= Math.min(15, negEq * 50);        // up to -15 for neg-equity P
  c -= Math.min(15, liq * 45);          // up to -15 for liquidity stress
  // HARD penalty for default risk — confidence must reflect insolvency
  c -= Math.min(40, def * 80);          // up to -40 for default probability
  // HARD penalty when median outcome destroys capital
  if (terminalP50 < initial * 0.5) c -= 25; // outright wealth destruction
  if (terminalP50 < 0) c -= 25;         // negative median NW — catastrophic
  if (terminalP10 < 0) c -= 10;         // tail risk of negative NW
  // Bonus / penalty from sims count (relative to 500 baseline)
  c -= Math.max(0, (500 - sims) / 25);  // small penalty if <500 sims
  return Math.max(5, Math.min(99, Math.round(c)));
}

function scenarioTypeFromId(id: string): "base" | "property" | "crypto" | "cash" | "custom" {
  if (id === "base") return "base";
  if (id.includes("property")) return "property";
  if (id.includes("crypto")) return "crypto";
  if (id.includes("cash")) return "cash";
  return "custom";
}

// ─── Failure attribution layer ───────────────────────────────────────────────

/** Convert month index → "around year X month Y" or "in year X" human text. */
function monthToHuman(m: number | null): string | null {
  if (m == null) return null;
  const year = Math.floor(m / 12);
  const month = m % 12;
  if (year === 0) return `month ${month + 1}`;
  if (month <= 1) return `year ${year + 1}`;
  return `year ${year + 1}, month ${month + 1}`;
}

function verdictFor(r: ExtendedScenarioResult, base?: ExtendedScenarioResult): ScenarioAttribution["verdict"] {
  const def = r.defaultProbability ?? 0;
  const negEq = r.negativeEquityProbability ?? 0;
  const liq = r.liquidityStressProbability ?? 0;
  const fan = endFan(r);
  const init = r.initialNetWorth;
  // Catastrophic: default ≥30% or median NW destruction below half of starting
  if (def >= 0.3 || fan.p50 < 0 || fan.p50 < init * 0.4) return "FAILS";
  // At risk: meaningful default/neg-eq/liq probability
  if (def >= 0.1 || negEq >= 0.25 || liq >= 0.5) return "AT RISK";
  // Strong: beats base by 20%+ AND low risk
  if (base && fan.p50 > endFan(base).p50 * 1.2 && def < 0.05 && liq < 0.25) return "STRONG";
  return "VIABLE";
}

function failureDriversFor(
  r: ExtendedScenarioResult,
  inputs: NarrativeInputs,
  base?: ExtendedScenarioResult,
): FailureDriver[] {
  const drivers: FailureDriver[] = [];
  const def = r.defaultProbability ?? 0;
  const negEq = r.negativeEquityProbability ?? 0;
  const liq = r.liquidityStressProbability ?? 0;
  const refi = r.refinancePressureProbability ?? 0;
  const downside = r.riskMetrics?.downsideRisk ?? 0;
  const cv = r.sequenceDispersion?.cv ?? 0;
  const lvr = r.serviceability?.lvr ?? 0;
  const dsr = r.serviceability?.dsr ?? 0;
  const fan = endFan(r);
  const init = r.initialNetWorth;

  if (def > 0.05) {
    const when = monthToHuman(r.medianDefaultMonth);
    drivers.push({
      label: "Insolvency risk",
      severity: Math.min(1, def * 2),
      detail: when
        ? `${(def * 100).toFixed(0)}% of paths hit default — typically around ${when}, after cash and offset reserves run out and forced asset sales fail to cover repayments.`
        : `${(def * 100).toFixed(0)}% of simulated paths exhaust cash reserves and trigger forced liquidation before horizon.`,
    });
  }
  if (liq > 0.25) {
    const when = monthToHuman(r.medianLiquidityFirstMonth);
    drivers.push({
      label: "Liquidity exhaustion",
      severity: Math.min(1, liq),
      detail: when
        ? `${(liq * 100).toFixed(0)}% of paths drop below a 3-month expense buffer for at least 2 months — first fires ${when}.`
        : `${(liq * 100).toFixed(0)}% of paths drop below a 3-month expense buffer, forcing offset draw-downs or asset sales at potentially bad prices.`,
    });
  }
  if (negEq > 0.15) {
    const when = monthToHuman(r.medianNegEquityFirstMonth);
    drivers.push({
      label: "Negative equity",
      severity: Math.min(1, negEq * 1.5),
      detail: when
        ? `${(negEq * 100).toFixed(0)}% of paths fall into negative equity — first appears ${when} under property-price stress.`
        : `${(negEq * 100).toFixed(0)}% of paths see total property loans exceed market values at some point, blocking refinance and forced-sale options.`,
    });
  }
  if (refi > 0.25) {
    drivers.push({
      label: "Refinance pressure",
      severity: Math.min(1, refi),
      detail: `${(refi * 100).toFixed(0)}% of paths see DSR push above lender tolerance, raising the risk that fixed-rate roll-overs or top-ups get declined.`,
    });
  }
  if (downside > 0.4) {
    drivers.push({
      label: "Tail risk",
      severity: Math.min(1, downside),
      detail: `P10 outcome is ${(downside * 100).toFixed(0)}% below P50 (${fmt$M(fan.p10)} vs ${fmt$M(fan.p50)}) — a bad sequence of returns destroys most of the upside.`,
    });
  }
  if (cv > 0.6) {
    drivers.push({
      label: "Sequence dispersion",
      severity: Math.min(1, cv),
      detail: `Terminal NW coefficient of variation is ${(cv * 100).toFixed(0)}% — outcomes are heavily path-dependent, so timing of returns matters more than long-run averages.`,
    });
  }
  if (lvr > 0.75 && r.scenarioId.includes("property")) {
    drivers.push({
      label: "High leverage",
      severity: Math.min(1, (lvr - 0.6) * 2),
      detail: `Loan-to-value lands at ${(lvr * 100).toFixed(0)}% under median outcomes — limited equity buffer to absorb a price correction.`,
    });
  }
  if (dsr > 0.4) {
    drivers.push({
      label: "Debt-service stress",
      severity: Math.min(1, dsr),
      detail: `Debt-to-income ratio reaches ${(dsr * 100).toFixed(0)}% — well above the 30-35% APRA comfort band; sustained at this level for years is fragile.`,
    });
  }
  // Wealth destruction relative to base
  if (base && fan.p50 < endFan(base).p50 * 0.7) {
    const lostPct = ((endFan(base).p50 - fan.p50) / endFan(base).p50) * 100;
    drivers.push({
      label: "Opportunity cost vs base",
      severity: Math.min(1, lostPct / 100),
      detail: `Median NW lands ${lostPct.toFixed(0)}% below the do-nothing baseline — the allocation actively destroys value vs holding course.`,
    });
  }
  // Capital destruction in absolute terms
  if (fan.p50 < init * 0.6) {
    drivers.push({
      label: "Capital destruction",
      severity: 1,
      detail: `Median terminal NW (${fmt$M(fan.p50)}) is below 60% of starting NW (${fmt$M(init)}). The path destroys wealth, not creates it.`,
    });
  }

  // Return top 3 by severity
  drivers.sort((a, b) => b.severity - a.severity);
  return drivers.slice(0, 3);
}

function breakEvenFor(
  r: ExtendedScenarioResult,
  inputs: NarrativeInputs,
  base?: ExtendedScenarioResult,
): string | null {
  if (!base) return null;
  const fan = endFan(r);
  const baseFan = endFan(base);
  const t = scenarioTypeFromId(r.scenarioId);
  // If scenario already beats base by 5%+ → no break-even needed
  if (fan.p50 >= baseFan.p50 * 1.05) return null;

  const gapPct = ((baseFan.p50 - fan.p50) / Math.abs(baseFan.p50 || 1)) * 100;

  if (t === "property") {
    // Required additional yearly capital growth to close gap over horizon
    const years = inputs.horizonYears;
    const propValue = inputs.capital * 4;
    const extraGrowthAnnual = Math.pow(1 + Math.max(0, (baseFan.p50 - fan.p50)) / propValue, 1 / years) - 1;
    return `To match the base path you would need property capital growth around ${(inputs.propertyGrowthPct + extraGrowthAnnual * 100).toFixed(1)}%/yr (vs ${inputs.propertyGrowthPct.toFixed(1)}% assumed) or net rent yield about ${Math.max(3, 4 + extraGrowthAnnual * 100 * 0.5).toFixed(1)}% gross — current closing gap is ${gapPct.toFixed(0)}%.`;
  }
  if (t === "crypto") {
    const years = inputs.horizonYears;
    const requiredCagr = Math.pow(Math.max(1, baseFan.p50 / Math.max(1, fan.p50)), 1 / years) - 1;
    return `Crypto would need to deliver roughly ${(requiredCagr * 100 + 8).toFixed(0)}%/yr CAGR (currently modelled near 8-12% mean) to close the ${gapPct.toFixed(0)}% gap to base.`;
  }
  if (t === "cash") {
    return `Cash APR would need to rise to roughly ${(inputs.cashAprPct + 3).toFixed(1)}%+ to match the do-nothing path — implausible under current rate regime.`;
  }
  return `This path trails the base by ${gapPct.toFixed(0)}% on median NW — adjust assumptions or pick a different allocation.`;
}

function timingFor(r: ExtendedScenarioResult): string | null {
  const parts: string[] = [];
  const liq = monthToHuman(r.medianLiquidityFirstMonth);
  const neg = monthToHuman(r.medianNegEquityFirstMonth);
  const def = monthToHuman(r.medianDefaultMonth);
  if (liq && (r.liquidityStressProbability ?? 0) > 0.1) parts.push(`liquidity strain first appears ${liq}`);
  if (neg && (r.negativeEquityProbability ?? 0) > 0.1) parts.push(`negative equity first appears ${neg}`);
  if (def && (r.defaultProbability ?? 0) > 0.05) parts.push(`default fires around ${def}`);
  if (parts.length === 0) return null;
  return `Median timing: ${parts.join("; ")}.`;
}

function safeRangeFor(r: ExtendedScenarioResult, inputs: NarrativeInputs): string | null {
  const t = scenarioTypeFromId(r.scenarioId);
  if (t !== "property") return null;
  const lvr = r.serviceability?.lvr ?? 0;
  const dsr = r.serviceability?.dsr ?? 0;
  // Safe leverage = LVR ≤ 0.70, DSR ≤ 0.35; convert into deposit guidance
  const safeMaxLoan = inputs.capital * 4 * 0.7;
  return `Safe range under your serviceability: LVR ≤ 70% (currently ${(lvr * 100).toFixed(0)}%), DSR ≤ 35% (currently ${(dsr * 100).toFixed(0)}%). At ${inputs.mortgageRatePct.toFixed(2)}% mortgage, the safe maximum loan is around ${fmt$M(safeMaxLoan)}; a higher deposit or smaller purchase price brings the path inside the safe envelope.`;
}

function buildAttribution(
  r: ExtendedScenarioResult,
  inputs: NarrativeInputs,
  base?: ExtendedScenarioResult,
): ScenarioAttribution {
  return {
    failureDrivers: failureDriversFor(r, inputs, base),
    breakEven: breakEvenFor(r, inputs, base),
    timing: timingFor(r),
    safeRange: safeRangeFor(r, inputs),
    verdict: verdictFor(r, base),
  };
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
    const leveragedPurchase = inputs.capital * 4;
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
    attribution: buildAttribution(r, inputs, base),
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

  // ── Failure attribution at comparison level ─────────────────────────────────
  const failing = results.filter(r => {
    const v = verdictFor(r, base);
    return v === "FAILS" || v === "AT RISK";
  });
  if (failing.length > 0) {
    const names = failing.map(r => `"${r.name}"`).join(", ");
    rec += `\nRisk attribution: ${names} ${failing.length === 1 ? "shows" : "show"} elevated stress markers — see the per-scenario breakdown for the top 3 drivers (insolvency, liquidity, negative equity, or refinance pressure) and the median month each one first fires.\n\n`;
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
