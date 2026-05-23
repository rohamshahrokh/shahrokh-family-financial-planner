/**
 * fundingResolutionAdvisor.ts — Funding Gap Resolution Advisor.
 *
 * Advisory layer that extends Plan Feasibility (`planFeasibility.ts`). Only
 * activates when Funding Gap < 0. Generates concrete candidate ways to close
 * the gap, ranks them by (1) lowest disruption, (2) lowest long-term wealth
 * impact, (3) highest practicality, and surfaces the best-ranked option as
 * the recommendation.
 *
 * #FWL_Funding_Gap_Resolution_Advisor
 *
 * NO ENGINE CALCULATION LIVES HERE. This file:
 *   - imports nothing from /lib/finance, /lib/forecastEngine, /lib/monteCarloEngine,
 *     /lib/firePathEngine, /lib/canonicalRiskSurface, /lib/recommendationEngine.
 *   - never runs a cashflow / forecast / Monte Carlo / FIRE simulation.
 *   - never blocks any save / forecast / analysis action.
 *
 * Inputs are pass-through values the dashboard already has (planned stock
 * buys, planned crypto buys, DCA outflows, IP deposit, available equity
 * release headroom, stocks / crypto balances, monthly savings surplus). A
 * candidate is OMITTED rather than faked when the data it would need is
 * unavailable or zero.
 */

export type ResolutionCandidateKind =
  | "reduce-planned-investment"
  | "delay-investment"
  | "use-equity-release"
  | "use-asset-sale"
  | "delay-property-or-increase-savings"
  | "reduce-deposit";

/** Per-attribute score (0–10; higher = better outcome on that axis). */
export interface ResolutionScores {
  liquidityImprovement: number; // how much of the gap this option resolves
  wealthImpact: number;         // 10 = neutral / improves wealth; lower = worse for long-term wealth
  debtImpact: number;           // 10 = no new debt; lower = adds debt
  complexity: number;           // 10 = trivial; lower = harder to execute
}

export interface ResolutionCandidate {
  kind: ResolutionCandidateKind;
  /** Human-readable title rendered as the recommendation / list label. */
  title: string;
  /** Sub-line shown next to the title in the list. */
  detail: string;
  /** Dollar amount this option contributes toward closing the gap. */
  gapClosure: number;
  /** Status the gap would reach after applying this option (signed). */
  resultingGap: number;
  /** Plain-English trade-off summary. */
  tradeOff: string;
  /** Source data the option was derived from — surfaced in the audit trace. */
  sourceNote: string;
  scores: ResolutionScores;
  /** Composite ranking score (0–10). Higher = better. */
  rank: number;
}

export interface FundingResolutionResult {
  fundingGap: number;                   // negative when a gap exists
  hasGap: boolean;                      // true when fundingGap < 0
  recommendation: ResolutionCandidate | null;
  alternatives: ResolutionCandidate[];  // recommendation + alternatives, sorted by rank desc
  unavailable: Array<{ kind: ResolutionCandidateKind; reason: string }>;
  /** Diagnostic — used by the audit trace + test guard. */
  rankingFormula: string;
}

export interface FundingResolutionInputs {
  /** Funding Gap from Plan Feasibility (signed; negative = shortfall). */
  fundingGap: number;
  /** Planned stock lump-sum BUY total over the horizon. */
  plannedStockBuy: number;
  /** Planned crypto lump-sum BUY total over the horizon. */
  plannedCryptoBuy: number;
  /** Stock DCA annual contribution within horizon. */
  stockDcaAnnual: number;
  /** Crypto DCA annual contribution within horizon. */
  cryptoDcaAnnual: number;
  /** Cash-like deposit committed by IP acquisitions in horizon. */
  acquisitionCashUsed: number;
  /** Stamp duty + buying costs of IP acquisitions in horizon. */
  acquisitionBuyingCosts: number;
  /** Equity-release headroom currently available ($) — pass 0 when unknown. */
  availableEquityRelease: number;
  /** Stocks balance available to liquidate ($). */
  stocksBalance: number;
  /** Crypto balance available to liquidate ($). */
  cryptoBalance: number;
  /** Monthly operating surplus available to accumulate cash ($/month). */
  monthlySavings: number;
}

const ROUND = (n: number) => Math.round(n);
const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n));

const RANKING_FORMULA =
  "rank = 0.40 × complexity + 0.30 × wealthImpact + 0.20 × debtImpact + 0.10 × (liquidityImprovement / 10 × 10). " +
  "Weights bias toward (1) lowest disruption — complexity is the strongest term, " +
  "(2) lowest long-term wealth impact — wealthImpact next, " +
  "(3) highest practicality — debtImpact + sufficiency next. " +
  "Tie-breaker: full-gap-resolving options outrank partial-resolving ones.";

function composite(s: ResolutionScores): number {
  // Each axis is on the same 0–10 scale; weights sum to 1.0.
  return (
    0.40 * s.complexity
    + 0.30 * s.wealthImpact
    + 0.20 * s.debtImpact
    + 0.10 * s.liquidityImprovement
  );
}

/**
 * Build the candidate set for the active gap. Each generator only emits a
 * candidate when the required input is present (> 0) and the option could
 * meaningfully contribute to closing the gap. Missing options are reported
 * in `unavailable` with a reason so the audit trace can show why.
 */
export function computeFundingResolution(inputs: FundingResolutionInputs): FundingResolutionResult {
  const gap = ROUND(inputs.fundingGap);
  const hasGap = gap < 0;
  const shortfall = Math.abs(gap);

  const candidates: ResolutionCandidate[] = [];
  const unavailable: FundingResolutionResult["unavailable"] = [];

  if (!hasGap) {
    return {
      fundingGap: gap,
      hasGap: false,
      recommendation: null,
      alternatives: [],
      unavailable: [],
      rankingFormula: RANKING_FORMULA,
    };
  }

  // 1. REDUCE PLANNED INVESTMENT — favour reducing the largest lump-sum buy
  //    because that is the single biggest "knob" most users have. Prefer
  //    crypto (typically higher volatility / opportunity cost is lower than
  //    delaying a deliberate equity allocation, and users often size crypto
  //    speculatively). Only emit if the chosen line >= shortfall OR full line
  //    is non-trivial.
  const reduceTargets = [
    { name: "BTC / crypto purchase", line: inputs.plannedCryptoBuy, kindNote: "Planned Crypto Purchases" },
    { name: "stock purchase",        line: inputs.plannedStockBuy,  kindNote: "Planned Stock Purchases" },
  ].sort((a, b) => b.line - a.line);
  for (const t of reduceTargets) {
    if (t.line <= 0) continue;
    const reduceBy = Math.min(t.line, shortfall);
    if (reduceBy < 500) continue; // ignore noise
    const closesFully = reduceBy >= shortfall - 1;
    candidates.push({
      kind: "reduce-planned-investment",
      title: `Reduce ${t.name} by $${reduceBy.toLocaleString()}`,
      detail: closesFully
        ? `Brings Funding Gap to $0 without new debt or liquidation.`
        : `Closes $${reduceBy.toLocaleString()} of the gap (full line is $${t.line.toLocaleString()}).`,
      gapClosure: reduceBy,
      resultingGap: gap + reduceBy,
      tradeOff:
        "Forgone investment exposure — long-term wealth growth may slow if the asset outperforms cash.",
      sourceNote: `CashFlowYear.${t.kindNote === "Planned Crypto Purchases" ? "plannedCryptoBuy" : "plannedStockBuy"} (${t.kindNote})`,
      scores: {
        liquidityImprovement: closesFully ? 10 : clamp((reduceBy / shortfall) * 10),
        wealthImpact: 6,   // forgone upside
        debtImpact: 10,    // no new debt
        complexity: 9,     // trivial — edit one planned-order row
      },
      rank: 0,
    });
    // Only emit one reduce candidate (the largest line) by default — the
    // second line shows up as a delay candidate below instead, to keep the
    // shortlist readable.
    break;
  }

  // 2. DELAY INVESTMENT — push planned stock + crypto buys by 6 months (or to
  //    next year). Preserves the investment but defers the cash outflow.
  if (inputs.plannedStockBuy > 0) {
    const delayBy = Math.min(inputs.plannedStockBuy, shortfall);
    candidates.push({
      kind: "delay-investment",
      title: `Delay stock purchase by 6 months`,
      detail: `Defers $${inputs.plannedStockBuy.toLocaleString()} of planned stock buys; ${
        delayBy >= shortfall ? "fully closes" : "narrows"
      } the gap until savings catch up.`,
      gapClosure: delayBy,
      resultingGap: gap + delayBy,
      tradeOff: "Delayed market exposure — long-term wealth impact is small if the asset trends sideways for 6 months.",
      sourceNote: "CashFlowYear.plannedStockBuy + sf_planned_investments planned_date",
      scores: {
        liquidityImprovement: delayBy >= shortfall ? 10 : clamp((delayBy / shortfall) * 10),
        wealthImpact: 8,   // delayed, not forgone
        debtImpact: 10,    // no new debt
        complexity: 9,     // edit planned_date
      },
      rank: 0,
    });
  } else if (inputs.plannedCryptoBuy > 0) {
    const delayBy = Math.min(inputs.plannedCryptoBuy, shortfall);
    candidates.push({
      kind: "delay-investment",
      title: `Delay crypto purchase to next year`,
      detail: `Defers $${inputs.plannedCryptoBuy.toLocaleString()} of planned crypto buys to ${
        new Date().getFullYear() + 1
      }.`,
      gapClosure: delayBy,
      resultingGap: gap + delayBy,
      tradeOff: "Delayed crypto exposure — high-volatility asset; deferring 12 months has a similar expected return to deferring 6 months in equities.",
      sourceNote: "CashFlowYear.plannedCryptoBuy + sf_planned_investments planned_date",
      scores: {
        liquidityImprovement: delayBy >= shortfall ? 10 : clamp((delayBy / shortfall) * 10),
        wealthImpact: 8,
        debtImpact: 10,
        complexity: 9,
      },
      rank: 0,
    });
  } else {
    unavailable.push({
      kind: "delay-investment",
      reason: "No planned stock or crypto purchases in the horizon — nothing to delay.",
    });
  }

  // 3. USE EQUITY RELEASE — only when equity is genuinely available. We do
  //    not call any refinance engine; the headroom value is passed in from
  //    the dashboard (max LVR × property value − current debt).
  if (inputs.availableEquityRelease > 0) {
    const release = Math.min(inputs.availableEquityRelease, Math.max(50_000, shortfall));
    candidates.push({
      kind: "use-equity-release",
      title: `Release $${release.toLocaleString()} of equity from existing property`,
      detail: `Funds the shortfall via a top-up loan instead of cutting investments.`,
      gapClosure: Math.min(release, shortfall),
      resultingGap: gap + Math.min(release, shortfall),
      tradeOff:
        "Adds long-term debt + interest expense; preserves the investment plan and asset allocation.",
      sourceNote: "max(0, (PPOR + IP value) × maxRefinanceLVR − total mortgage)",
      scores: {
        liquidityImprovement: 10,
        wealthImpact: 7,   // preserves exposure, but interest drags long-term NW
        debtImpact: 3,     // adds new debt
        complexity: 5,     // refinance / cash-out → broker + valuation
      },
      rank: 0,
    });
  } else {
    unavailable.push({
      kind: "use-equity-release",
      reason: "No equity-release headroom in the current refinance LVR ceiling. Increase the cap on the property page or pay down existing debt first.",
    });
  }

  // 4. USE ASSET SALE — sell existing stocks or crypto to cover the shortfall.
  //    Prefer crypto first (higher volatility = lower regret if mis-timed),
  //    then stocks. Only emit when a balance covers something material.
  const assetTargets = [
    { name: "crypto", balance: inputs.cryptoBalance },
    { name: "stocks", balance: inputs.stocksBalance },
  ].filter((a) => a.balance > 500);
  if (assetTargets.length > 0) {
    const t = assetTargets.sort((a, b) => b.balance - a.balance)[0];
    const sellAmt = Math.min(t.balance, shortfall);
    candidates.push({
      kind: "use-asset-sale",
      title: `Sell $${sellAmt.toLocaleString()} of existing ${t.name}`,
      detail: sellAmt >= shortfall
        ? `Brings Funding Gap to $0 by liquidating part of the existing ${t.name} balance.`
        : `Closes $${sellAmt.toLocaleString()} of the gap (full ${t.name} balance is $${t.balance.toLocaleString()}).`,
      gapClosure: sellAmt,
      resultingGap: gap + sellAmt,
      tradeOff:
        "Realised CGT + lost future compounding on the sold parcel. Use FIFO/Specific Identification for the lowest tax outcome.",
      sourceNote: `Live ${t.name} holdings value`,
      scores: {
        liquidityImprovement: sellAmt >= shortfall ? 10 : clamp((sellAmt / shortfall) * 10),
        wealthImpact: 5,   // lost compounding + potential CGT
        debtImpact: 10,    // no new debt
        complexity: 7,     // sell trades + tax accounting
      },
      rank: 0,
    });
  } else {
    unavailable.push({
      kind: "use-asset-sale",
      reason: "No material existing stocks or crypto balance to liquidate.",
    });
  }

  // 5. DELAY PROPERTY / INCREASE SAVINGS — push the IP settlement out so
  //    monthly surplus accumulates more cash. Only emit when there's both an
  //    acquisition in the horizon AND a positive monthly surplus.
  if (
    inputs.acquisitionCashUsed > 0
    && inputs.monthlySavings > 0
  ) {
    const months = Math.max(3, Math.ceil(shortfall / Math.max(inputs.monthlySavings, 1)));
    const accumulated = months * inputs.monthlySavings;
    candidates.push({
      kind: "delay-property-or-increase-savings",
      title: `Delay property purchase by ${months} months (accumulate $${ROUND(accumulated).toLocaleString()})`,
      detail:
        months <= 6
          ? `Accrues $${ROUND(accumulated).toLocaleString()} of operating surplus before settlement — fully closes the gap.`
          : `Accrues $${ROUND(accumulated).toLocaleString()} of operating surplus over ${months} months.`,
      gapClosure: Math.min(accumulated, shortfall),
      resultingGap: gap + Math.min(accumulated, shortfall),
      tradeOff:
        "Delayed property exposure and rental income; lower deposit pressure; rate / market conditions may shift.",
      sourceNote:
        "monthly surplus (selectMonthlySurplus from dashboardDataContract) × months until settlement",
      scores: {
        liquidityImprovement: accumulated >= shortfall ? 10 : clamp((accumulated / shortfall) * 10),
        wealthImpact: 7,   // delayed cap growth on the IP
        debtImpact: 10,    // unchanged
        complexity: 6,     // changes the settlement date
      },
      rank: 0,
    });
  } else {
    unavailable.push({
      kind: "delay-property-or-increase-savings",
      reason: inputs.acquisitionCashUsed <= 0
        ? "No IP acquisition in the horizon to delay."
        : "No positive monthly surplus to accumulate — investigate the cashflow first.",
    });
  }

  // 6. REDUCE DEPOSIT — trade cash-out-of-pocket for a higher LVR (and likely
  //    LMI). Only emit when an IP acquisition is in the horizon and the
  //    deposit can absorb the shortfall.
  if (inputs.acquisitionCashUsed >= 10_000) {
    const reduceBy = Math.min(inputs.acquisitionCashUsed - 1, shortfall); // never zero the deposit completely
    if (reduceBy >= 1_000) {
      candidates.push({
        kind: "reduce-deposit",
        title: `Reduce deposit by $${ROUND(reduceBy).toLocaleString()}`,
        detail: `Lower upfront cash; trade-off is higher LVR + likely LMI on the new loan.`,
        gapClosure: reduceBy,
        resultingGap: gap + reduceBy,
        tradeOff:
          "Higher LVR (above 80% triggers Lenders Mortgage Insurance — typically $5k–$25k); higher monthly interest on the larger loan.",
        sourceNote: "CashFlowYear.propertyPurchaseCashUsed (cash-like deposit portion)",
        scores: {
          liquidityImprovement: reduceBy >= shortfall ? 10 : clamp((reduceBy / shortfall) * 10),
          wealthImpact: 6,   // LMI + interest drag
          debtImpact: 4,     // bigger loan, possibly LMI
          complexity: 5,     // re-quote loan + lender approval
        },
        rank: 0,
      });
    }
  } else {
    unavailable.push({
      kind: "reduce-deposit",
      reason: "No IP acquisition with a material cash deposit in the horizon.",
    });
  }

  // ── Compute composite rank + sort. Tie-breaker: full-gap-resolving options
  //    outrank partial-resolving ones (same rank → resolvesFully wins).
  for (const c of candidates) {
    c.rank = Math.round(composite(c.scores) * 100) / 100;
  }
  candidates.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const aFull = a.gapClosure >= shortfall - 1 ? 1 : 0;
    const bFull = b.gapClosure >= shortfall - 1 ? 1 : 0;
    if (aFull !== bFull) return bFull - aFull;
    return b.gapClosure - a.gapClosure;
  });

  return {
    fundingGap: gap,
    hasGap: true,
    recommendation: candidates[0] ?? null,
    alternatives: candidates,
    unavailable,
    rankingFormula: RANKING_FORMULA,
  };
}

// Public so the audit trace and tests can assert the exact ranking text.
export const FUNDING_RESOLUTION_RANKING_FORMULA = RANKING_FORMULA;
