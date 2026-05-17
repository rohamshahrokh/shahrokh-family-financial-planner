/**
 * Narrative Intelligence V2 — decorates Recommendation V2 outputs.
 *
 * Pure functions only — operates entirely on already-produced engine outputs.
 */

import type { CIOMemo, NarrativeContext } from './types';

function fmtMoney(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const PILLAR_THEME: Record<string, string> = {
  prevent_failure: 'capital preservation',
  protect_liquidity: 'liquidity defence',
  reduce_high_interest_debt: 'guaranteed compounding via debt retirement',
  stabilise_leverage: 'leverage discipline',
  preserve_tax_efficiency: 'after-tax compounding',
  maintain_investing_discipline: 'invested discipline',
  improve_fire_timeline: 'time-to-independence',
  maximise_wealth: 'long-run wealth maximisation',
};

export function buildCIOMemo(ctx: NarrativeContext): CIOMemo {
  const rec = ctx.recommendation;
  const theme = PILLAR_THEME[rec.pillar] ?? 'risk-adjusted return';
  const benefit = rec.expectedFinancialImpact.annualDollar;
  const confidence = rec.confidenceScore;
  const oc = rec.opportunityCost;

  const headline = `${rec.title} — ${theme}.`;

  const rationaleParts: string[] = [];
  rationaleParts.push(`Across the available signals, the dominant trade-off is ${theme}.`);
  if (benefit != null) {
    rationaleParts.push(`Best estimate of annual benefit ${fmtMoney(benefit)} at ${(confidence * 100).toFixed(0)}% confidence.`);
  } else {
    rationaleParts.push(`Confidence band ~${(confidence * 100).toFixed(0)}%.`);
  }
  if (ctx.portfolio) {
    rationaleParts.push(`Portfolio is in "${ctx.portfolio.modelLabel}" mode (Sharpe ~${ctx.portfolio.metrics.sharpeApprox.toFixed(2)}).`);
  }
  const rationale = rationaleParts.join(' ');

  const tradeoffs: string[] = [];
  if (rec.fireImpact?.yearsDelta != null) {
    const yd = rec.fireImpact.yearsDelta;
    tradeoffs.push(yd >= 0
      ? `Brings FIRE forward by ~${yd.toFixed(1)} year(s).`
      : `Delays FIRE by ~${Math.abs(yd).toFixed(1)} year(s).`);
  }
  if (rec.liquidityImpact?.deltaDeployableCash != null && rec.liquidityImpact.deltaDeployableCash !== 0) {
    tradeoffs.push(`Liquidity changes by ${fmtMoney(rec.liquidityImpact.deltaDeployableCash)} — affects optionality if surprises emerge.`);
  }
  if (rec.riskReductionImpact?.points) {
    tradeoffs.push(`Reduces risk score by ~${rec.riskReductionImpact.points} points across ${rec.riskReductionImpact.categoriesAffected.join(', ')}.`);
  }
  if (ctx.lifePlan?.summary.fireYearDelayEstimate && ctx.lifePlan.summary.fireYearDelayEstimate > 0.5) {
    tradeoffs.push(`Pending life events add ~${ctx.lifePlan.summary.fireYearDelayEstimate.toFixed(1)} year(s) of FIRE drag — favour reversible moves.`);
  }
  if (tradeoffs.length === 0) tradeoffs.push('Tradeoffs are limited — this is a low-regret action under current signals.');

  const opportunityCost = oc?.description
    ? `${oc.description}${oc.annualDollar ? ` (~${fmtMoney(oc.annualDollar)}/yr foregone).` : '.'}`
    : 'No material opportunity cost vs the next-best alternative.';

  const timing = (() => {
    const urgency = rec.urgency;
    const review = rec.reviewTrigger.reviewByISO;
    if (urgency === 'immediate') return 'Move now — delaying is the costly option.';
    if (urgency === 'this_quarter') return 'Best to act this quarter while inputs remain stable.';
    if (urgency === 'this_year') return 'Execute within 12 months; re-evaluate at the next major signal change.';
    return review ? `Monitor — reassess by ${review.slice(0, 10)}.` : 'Monitor — no immediate action required.';
  })();

  const uncertainty = (() => {
    const factors: string[] = [];
    if (ctx.stressPressure != null && ctx.stressPressure > 0.3) factors.push('Monte Carlo stress pressure is elevated');
    if (ctx.macroRegime && ctx.macroRegime !== 'expansion') factors.push(`macro regime is "${ctx.macroRegime}"`);
    const what = rec.whatCouldChangeRecommendation.slice(0, 2).map(s => s.toLowerCase()).join('; ');
    return `Confidence ${(confidence * 100).toFixed(0)}%. Largest sources of error: ${factors.length ? factors.join(', ') : 'modest'}. Items that would flip this view: ${what}.`;
  })();

  const downsidePath = (() => {
    switch (rec.pillar) {
      case 'prevent_failure':           return 'In the downside path, missing this step risks forced asset sales at the worst price.';
      case 'protect_liquidity':         return 'Without this buffer, a 6-month income shock would force borrowing at 15%+ APR.';
      case 'reduce_high_interest_debt': return 'High-APR debt compounds against you — every month delayed is a month of guaranteed loss.';
      case 'stabilise_leverage':        return 'Stress-test downside: rising rates + valuation re-pricing could trigger LVR breach.';
      case 'preserve_tax_efficiency':   return 'Tax drag silently steals years from a FIRE date — the loss is invisible until it compounds.';
      case 'maintain_investing_discipline': return 'Idle-cash drag in a 6%+ inflation regime is a real ~$4-6k/yr loss on $100k.';
      case 'improve_fire_timeline':     return 'Without action, FIRE date slips ~6-18 months for each 12 months of inaction.';
      case 'maximise_wealth':           return 'Suboptimal allocation costs ~1-2% CAGR — large in 20-year terms but invisible in 1-year terms.';
      default:                          return 'Inaction has slow but compounding costs.';
    }
  })();

  const riskAsymmetry = (() => {
    if (rec.pillar === 'prevent_failure' || rec.pillar === 'protect_liquidity') {
      return 'Asymmetric: small ongoing cost; protects against catastrophic, irreversible outcomes.';
    }
    if (rec.pillar === 'reduce_high_interest_debt') {
      return 'Asymmetric: certain, guaranteed return; no market risk; no downside.';
    }
    if (rec.actionType === 'crypto_dca') {
      return 'Highly asymmetric — small position size capped, but vol of returns is large in both directions.';
    }
    return 'Modestly favourable risk/reward — expected upside exceeds expected downside by ~2:1 under base assumptions.';
  })();

  return {
    headline,
    rationale,
    tradeoffs,
    opportunityCost,
    timing,
    uncertainty,
    downsidePath,
    riskAsymmetry,
    whatChangesRec: rec.whatCouldChangeRecommendation,
  };
}

/**
 * Generate a one-paragraph "private CIO memo" block — useful where a single
 * narrative block is preferable over the structured CIOMemo.
 */
export function buildCIOParagraph(ctx: NarrativeContext): string {
  const memo = buildCIOMemo(ctx);
  return `${memo.headline} ${memo.rationale} ${memo.tradeoffs[0] ?? ''} ${memo.timing} ${memo.uncertainty}`.trim();
}
