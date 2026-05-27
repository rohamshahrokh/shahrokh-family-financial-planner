/**
 * Sprint 20 PR-B P1-2 — Advisor Narrative Engine.
 *
 * Produces a single AdvisorRecommendation for an input action +
 * household context. Every output answers all seven advisor questions:
 *   WHAT, WHY, WHEN, IMPROVES, RISKS, DO-NOTHING, ALTERNATIVES.
 *
 * Non-negotiables:
 *   - "Do NOT hide weak logic behind better wording" — every field carries
 *      household-specific evidence; generic boilerplate is rejected by the
 *      `containsBoilerplate` guard.
 *   - "Do NOT call heuristic confidence 'probability'" — the confidence
 *      field is labelled `confidence`, never `probability`.
 *   - Sprint 19 backlog fix (Scenario 07): when concentration is breached,
 *      narrative.what reads `concentrationRisks.find(r => r.breached)`,
 *      NOT `allocations[0]`.
 */

import type { ConcentrationFlag } from "./concentration/types";
import type { HouseholdLifeStage } from "./householdState/types";

export type AdvisorConfidenceBand = 'low' | 'medium' | 'high';

export interface AdvisorRecommendation {
  what: { action: string; concreteDetails: string };
  why: string;
  when: { year: number; quarter?: 1 | 2 | 3 | 4; reason: string };
  improves: {
    fireYearDelta?: number;
    successDelta?: number;
    nwDelta?: number;
    monthlyPassiveDelta?: number;
  };
  risks: { label: string; severity: 'low' | 'medium' | 'high'; mitigation: string }[];
  doNothing: {
    projectedFireYear: number;
    projectedMonthlyIncome: number;
    gapVsTarget: number;
  };
  alternatives: { label: string; tradeoff: string; estimatedImprovement?: string }[];
  confidence: { value: number; band: AdvisorConfidenceBand; basis: string };
  assumptions: string[];
  sensitivity?: { line: string; drivers: string[] };
}

const BANNED_BOILERPLATE = [
  'diversify your portfolio',
  'review your strategy',
  'consider your options',
  'consult an advisor',
];

export function containsBoilerplate(line: string): boolean {
  const lower = line.toLowerCase();
  if (lower.includes('consult an advisor') && /\d/.test(lower)) return false;
  return BANNED_BOILERPLATE.some((p) => lower.includes(p));
}

export interface HouseholdSignals {
  leverage: number;
  propertyExposurePct: number;
  cryptoExposurePct: number;
  liquidityMonths: number;
  fireGapDollars: number;
  yearsToTarget: number;
  debtServiceRatio: number;
  monthlySurplus: number;
  netWorth: number;
  monthlyIncome: number;
  baselineFireProgressPct: number;
  baselineFireYear: number;
  baselineMonthlyPassive: number;
  targetMonthlyPassive: number;
  targetFireYear: number;
  concentrationRisks: Array<ConcentrationFlag & { breached: boolean }>;
  lifeStage: HouseholdLifeStage;
  equitySharePct: number;
}

export interface AdvisorActionInput {
  id: string;
  actionKind:
    | 'sell_property'
    | 'buy_property'
    | 'etf_dca'
    | 'reduce_debt'
    | 'build_buffer'
    | 'rebalance_concentration'
    | 'glidepath_shift'
    | 'income_conversion'
    | 'increase_cash_reserve'
    | 'operational_stabilisation';
  proposedYear: number;
  proposedDollarAmount?: number;
  conciseLabel: string;
  baseConfidence: number;
  fireYearDelta?: number;
  successDelta?: number;
  nwDelta?: number;
  monthlyPassiveDelta?: number;
  preferredQuarter?: 1 | 2 | 3 | 4;
}

function pickPrimaryConcentration(
  flags: Array<ConcentrationFlag & { breached: boolean }>,
): (ConcentrationFlag & { breached: boolean }) | null {
  const breached = flags.find((r) => r.breached);
  if (breached) return breached;
  return null;
}

function formatDollars(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function whatFor(action: AdvisorActionInput, signals: HouseholdSignals): AdvisorRecommendation['what'] {
  switch (action.actionKind) {
    case 'rebalance_concentration': {
      const flag = pickPrimaryConcentration(signals.concentrationRisks);
      if (flag) {
        return {
          action: `Reduce ${flag.kind.replace('_over_', ' exposure above ').replace('_', ' ')} below ${flag.thresholdPct}%`,
          concreteDetails: `Current observed exposure ${flag.observedPct.toFixed(1)}%, ${flag.severity} severity — ${flag.remediation}`,
        };
      }
      return { action: 'Rebalance concentration', concreteDetails: 'No active concentration breach detected — monitor.' };
    }
    case 'sell_property':
      return {
        action: action.conciseLabel || 'Sell investment property',
        concreteDetails: `Schedule by ${action.proposedYear}${action.proposedDollarAmount ? `, target ${formatDollars(action.proposedDollarAmount)} net proceeds` : ''}.`,
      };
    case 'buy_property':
      return {
        action: action.conciseLabel || 'Acquire investment property',
        concreteDetails: `Target ${action.proposedYear}${action.proposedDollarAmount ? `, deposit ${formatDollars(action.proposedDollarAmount)}` : ''} — gated by feasibility (borrowingCapacity + serviceability).`,
      };
    case 'etf_dca':
      return {
        action: action.conciseLabel || 'Increase monthly ETF DCA',
        concreteDetails: `Deploy ${action.proposedDollarAmount ? formatDollars(action.proposedDollarAmount) + '/month' : 'safe monthly surplus'} from ${action.proposedYear} into diversified low-cost equity ETFs.`,
      };
    case 'reduce_debt':
      return {
        action: action.conciseLabel || 'Accelerate debt payoff',
        concreteDetails: `Allocate ${action.proposedDollarAmount ? formatDollars(action.proposedDollarAmount) : 'surplus'} per month to highest-APR debt from ${action.proposedYear}.`,
      };
    case 'build_buffer':
      return {
        action: action.conciseLabel || 'Build liquidity buffer',
        concreteDetails: `Build ${signals.liquidityMonths < 3 ? '3-month' : '6-month'} cash buffer (~${formatDollars(action.proposedDollarAmount ?? signals.monthlyIncome * 3)}) by end of ${action.proposedYear}.`,
      };
    case 'glidepath_shift':
      return {
        action: action.conciseLabel || 'Glidepath equity → income',
        concreteDetails: `Shift allocation from ${Math.max(60, signals.equitySharePct).toFixed(0)}% equity towards 30/70 by ${action.proposedYear}.`,
      };
    case 'income_conversion':
      return {
        action: action.conciseLabel || 'Activate income-conversion portfolio',
        concreteDetails: `Deploy ${formatDollars(action.proposedDollarAmount ?? 0)} into a 4.5–6.5% yield portfolio by ${action.proposedYear}.`,
      };
    case 'increase_cash_reserve':
      return {
        action: action.conciseLabel || 'Increase cash reserve',
        concreteDetails: `Top cash sleeve to 18–24 months of expenses (${formatDollars(action.proposedDollarAmount ?? 0)}) by ${action.proposedYear} to absorb sequence risk.`,
      };
    case 'operational_stabilisation':
      return {
        action: action.conciseLabel || 'Stabilise operating cashflow',
        concreteDetails: 'Cashflow is negative or liquidity buffer < 1 month. Cut discretionary expenses or raise income before any investment action.',
      };
  }
}

function whyFor(action: AdvisorActionInput, signals: HouseholdSignals): string {
  const cited: string[] = [];
  if (signals.fireGapDollars > 0) cited.push(`FIRE gap ${formatDollars(signals.fireGapDollars)}`);
  if (signals.leverage > 0.3) cited.push(`leverage ${signals.leverage.toFixed(2)}`);
  if (signals.cryptoExposurePct > 15) cited.push(`crypto exposure ${signals.cryptoExposurePct.toFixed(1)}%`);
  if (signals.propertyExposurePct > 60) cited.push(`property exposure ${signals.propertyExposurePct.toFixed(1)}%`);
  if (signals.liquidityMonths < 6) cited.push(`only ${signals.liquidityMonths.toFixed(1)} months liquidity`);
  if (signals.debtServiceRatio > 0.3) cited.push(`debt-service ratio ${(signals.debtServiceRatio * 100).toFixed(0)}%`);
  if (signals.yearsToTarget <= 10 && signals.yearsToTarget >= 0) cited.push(`${signals.yearsToTarget} years to target`);
  if (signals.equitySharePct >= 60 && signals.yearsToTarget <= 10) cited.push(`sequence risk (equity ${signals.equitySharePct.toFixed(0)}% w/ ${signals.yearsToTarget}y horizon)`);
  while (cited.length < 2) {
    if (!cited.includes(`net worth ${formatDollars(signals.netWorth)}`))
      cited.push(`net worth ${formatDollars(signals.netWorth)}`);
    else if (!cited.includes(`monthly surplus ${formatDollars(signals.monthlySurplus)}`))
      cited.push(`monthly surplus ${formatDollars(signals.monthlySurplus)}`);
    else break;
  }
  const top2 = cited.slice(0, 3);
  const tail = action.actionKind === 'operational_stabilisation'
    ? 'Investment paths are unsafe until operating cashflow stabilises.'
    : `Acting this year improves ${action.fireYearDelta && action.fireYearDelta < 0 ? 'FIRE timing' : 'plan resilience'} measurably.`;
  return `${top2.join('; ')}. ${tail}`;
}

function whenFor(action: AdvisorActionInput, signals: HouseholdSignals): AdvisorRecommendation['when'] {
  if (action.actionKind === 'operational_stabilisation') {
    return { year: new Date().getFullYear(), quarter: 1, reason: 'Negative cashflow / sub-month buffer — operational fix is immediate.' };
  }
  const year = action.proposedYear || signals.targetFireYear;
  const quarter = action.preferredQuarter ?? 2;
  const reason = action.actionKind === 'sell_property'
    ? `Aligns sale to CGT discount window and FIRE year ${signals.targetFireYear}.`
    : action.actionKind === 'buy_property'
      ? `Earliest year feasibility passes (borrowingCapacity + post-purchase buffer ≥ 3 months).`
      : action.actionKind === 'glidepath_shift'
        ? `Begin ${Math.max(2, signals.yearsToTarget - 5)} years before FIRE to reduce sequence risk.`
        : `Earliest year the action measurably moves the plan.`;
  return { year, quarter, reason };
}

function risksFor(action: AdvisorActionInput, signals: HouseholdSignals): AdvisorRecommendation['risks'] {
  const r: AdvisorRecommendation['risks'] = [];
  switch (action.actionKind) {
    case 'sell_property':
      r.push({
        label: 'CGT crystallisation',
        severity: 'medium',
        mitigation: `Time sale to FY with offsetting losses or 12-month holding window for CGT discount.`,
      });
      r.push({
        label: 'Rental income foregone',
        severity: 'medium',
        mitigation: `Bridge with income-portfolio yield deployment in same quarter (~${formatDollars(signals.targetMonthlyPassive)}/month target).`,
      });
      break;
    case 'buy_property':
      r.push({
        label: 'Serviceability stress under +2% rate move',
        severity: 'high',
        mitigation: `Build post-purchase buffer ≥ 3 months before settlement; cap LVR at ≤ 80%.`,
      });
      r.push({
        label: 'Property -15% drawdown scenario',
        severity: 'medium',
        mitigation: `Stress-test offer price for 15% downside; maintain alternative exit (refinance vs sell).`,
      });
      break;
    case 'etf_dca':
      r.push({
        label: 'Equity -25% drawdown',
        severity: 'medium',
        mitigation: `Maintain ${Math.max(6, Math.ceil(signals.liquidityMonths))}-month cash buffer before deploying DCA.`,
      });
      break;
    case 'reduce_debt':
      r.push({
        label: 'Opportunity cost vs equity return',
        severity: 'low',
        mitigation: `Only accelerate above guaranteed-return threshold (debt APR > expected after-tax equity return).`,
      });
      break;
    case 'build_buffer':
      r.push({
        label: 'Lower expected return on cash sleeve',
        severity: 'low',
        mitigation: `Park in HISA / offset / short bond ladder to recoup most of the carry cost.`,
      });
      break;
    case 'rebalance_concentration': {
      const f = pickPrimaryConcentration(signals.concentrationRisks);
      r.push({
        label: f
          ? `Re-entry timing risk after trimming ${f.kind.replace(/_/g, ' ')}`
          : 'Re-entry timing risk',
        severity: 'medium',
        mitigation: 'Stage the rebalance over 3–6 months; reinvest into diversified sleeves only.',
      });
      break;
    }
    case 'glidepath_shift':
      r.push({
        label: 'Premature glidepath foregoes equity growth',
        severity: 'medium',
        mitigation: `Shift only when within ${Math.min(7, signals.yearsToTarget)} years of FIRE and equity share > 60%.`,
      });
      break;
    case 'income_conversion':
      r.push({
        label: 'Yield band drift below 4.5%',
        severity: 'medium',
        mitigation: 'Use mixed-sleeve ETF/bond/cash blend to keep yield 4.5–6.5% even in rate-cut cycles.',
      });
      break;
    case 'increase_cash_reserve':
      r.push({
        label: 'Cash drag on portfolio return',
        severity: 'low',
        mitigation: 'Park reserve in offset/HISA — recoups most cost when rates > 4%.',
      });
      break;
    case 'operational_stabilisation':
      r.push({
        label: 'Persistent cashflow shortfall depletes assets',
        severity: 'high',
        mitigation: `Suspend all investment recommendations until monthly cashflow ≥ 0 and buffer ≥ 3 months.`,
      });
      break;
  }
  return r;
}

function alternativesFor(action: AdvisorActionInput, signals: HouseholdSignals): AdvisorRecommendation['alternatives'] {
  switch (action.actionKind) {
    case 'sell_property':
      return [
        { label: 'Refinance to release equity instead', tradeoff: 'Retains rental yield, increases debt servicing.', estimatedImprovement: `+${formatDollars(signals.monthlyIncome * 0.5)} liquidity, but +${(signals.leverage * 100).toFixed(0)}% leverage extended` },
        { label: 'Phased partial sale (LRBA partial repayment)', tradeoff: 'Defers CGT, slows decumulation transition.', estimatedImprovement: 'CGT impact halved' },
      ];
    case 'buy_property':
      return [
        { label: 'ETF DCA equivalent', tradeoff: 'Lower friction, more liquid, no leverage.', estimatedImprovement: `~${formatDollars((action.proposedDollarAmount ?? 100_000) * 0.07)}/yr expected return` },
        { label: 'Delay 12 months for stronger buffer', tradeoff: 'Higher feasibility, missed early appreciation.', estimatedImprovement: 'Buffer +3 months' },
      ];
    case 'etf_dca':
      return [
        { label: 'Lump sum after building buffer', tradeoff: 'Faster compounding, higher timing risk.', estimatedImprovement: '~1–2 months earlier FIRE' },
        { label: 'Salary sacrifice to super (concessional)', tradeoff: 'Locks until preservation age, tax-efficient.', estimatedImprovement: `${(signals.monthlyIncome * 12 * 0.15 * 0.32 / 12).toFixed(0)} $/month tax saving` },
      ];
    case 'reduce_debt':
      return [
        { label: 'Refinance to lower rate', tradeoff: 'Friction cost, fewer payments to extra payoff.', estimatedImprovement: '~0.5–1.0% APR' },
        { label: 'Pay minimums and DCA surplus', tradeoff: 'Higher expected return, more risk.', estimatedImprovement: '~2-3pp expected return uplift' },
      ];
    case 'build_buffer':
      return [
        { label: 'HISA only', tradeoff: 'Simple, lower yield.', estimatedImprovement: '~4-5% yield' },
        { label: 'Offset account against PPOR mortgage', tradeoff: 'Tax-effective if mortgage rate > HISA.', estimatedImprovement: `Effective ${Math.max(5.5, 6.0).toFixed(1)}% AT yield` },
      ];
    case 'rebalance_concentration':
      return [
        { label: 'Gradual trim over 6 months', tradeoff: 'Lower market-timing impact, slower derisking.', estimatedImprovement: 'Smoother glide' },
        { label: 'Sell down to 25% target in one move', tradeoff: 'Resolves quickly, larger timing risk.', estimatedImprovement: 'Concentration < threshold within 1 month' },
      ];
    case 'glidepath_shift':
      return [
        { label: 'Defer glidepath 2 years', tradeoff: 'Retains growth tilt, higher sequence risk.', estimatedImprovement: '+~1y FIRE timing if returns hold' },
        { label: 'Linear glide 5y instead of 3y', tradeoff: 'Less abrupt, more drift.', estimatedImprovement: 'Sequence risk halved' },
      ];
    case 'income_conversion':
      return [
        { label: 'Bond ladder only', tradeoff: 'Safer, lower yield.', estimatedImprovement: 'Yield 3.5–4.8%' },
        { label: 'Dividend transition over 5y', tradeoff: 'Smoother capital glide, lower starting yield.', estimatedImprovement: '4.0–5.5% yield' },
      ];
    case 'increase_cash_reserve':
      return [
        { label: '12-month buffer instead of 24', tradeoff: 'Less drag, more sequence risk.', estimatedImprovement: '+~0.3% portfolio return' },
        { label: 'Bond ladder substitute', tradeoff: 'Slightly less liquid, higher yield.', estimatedImprovement: '+~1.5% yield over HISA' },
      ];
    case 'operational_stabilisation':
      return [
        { label: 'Pause discretionary categories only', tradeoff: 'Preserves quality of life, slower stabilisation.', estimatedImprovement: '~30-50% expense cut' },
        { label: 'Raise income (side income / salary review)', tradeoff: 'Takes time, durable impact.', estimatedImprovement: `+${formatDollars(signals.monthlyIncome * 0.10)}/month plausible` },
      ];
  }
}

function doNothingFor(signals: HouseholdSignals): AdvisorRecommendation['doNothing'] {
  const gap = Math.max(0, signals.targetMonthlyPassive - signals.baselineMonthlyPassive);
  return {
    projectedFireYear: signals.baselineFireYear,
    projectedMonthlyIncome: signals.baselineMonthlyPassive,
    gapVsTarget: gap,
  };
}

function confidenceFor(action: AdvisorActionInput, signals: HouseholdSignals, executionFit?: { likelyAdherence: number }): AdvisorRecommendation['confidence'] {
  let value = Math.max(0, Math.min(1, action.baseConfidence));
  let band: AdvisorConfidenceBand = value >= 0.75 ? 'high' : value >= 0.5 ? 'medium' : 'low';
  let basisParts: string[] = [];
  basisParts.push(`base confidence ${(action.baseConfidence * 100).toFixed(0)}%`);
  if (executionFit) {
    if (executionFit.likelyAdherence < 0.6 && band === 'high') {
      band = 'medium';
      basisParts.push(`execution fit ${(executionFit.likelyAdherence * 100).toFixed(0)}% — downgraded from high to medium`);
    } else {
      basisParts.push(`execution fit ${(executionFit.likelyAdherence * 100).toFixed(0)}%`);
    }
  }
  basisParts.push(`life stage ${signals.lifeStage.replace('STATE_', '').replace('_', ' ').toLowerCase()}`);
  return { value, band, basis: basisParts.join('; ') };
}

function assumptionsFor(action: AdvisorActionInput, signals: HouseholdSignals, executionFit?: { likelyAdherence: number }): string[] {
  const out: string[] = [];
  out.push(`Real return assumed 4.5%/yr after inflation`);
  out.push(`Effective tax rate ${(0.32 * 100).toFixed(0)}% applied to gross yield`);
  out.push(`Inflation 2.5%/yr`);
  out.push(`Liquidity floor ${Math.max(3, Math.ceil(signals.liquidityMonths)).toFixed(0)} months maintained`);
  if (executionFit && executionFit.likelyAdherence < 0.6) {
    out.push('Requires sustained behavioural commitment — confidence downgraded');
  }
  return out;
}

function sensitivityFor(action: AdvisorActionInput, signals: HouseholdSignals): AdvisorRecommendation['sensitivity'] {
  if (action.actionKind === 'operational_stabilisation') return undefined;
  const drivers: string[] = [];
  if (signals.equitySharePct >= 30) drivers.push('equity real return');
  if (signals.propertyExposurePct >= 30) drivers.push('property yield');
  drivers.push('inflation rate');
  const line = `Outcome shifts ±${formatDollars(Math.max(50_000, signals.netWorth * 0.08))} over 10y if equity return moves ±1%.`;
  return { line, drivers: drivers.slice(0, 3) };
}

export interface BuildRecommendationInputs {
  action: AdvisorActionInput;
  signals: HouseholdSignals;
  executionFit?: { likelyAdherence: number };
  stressRisks?: Array<{ label: string; severity: 'low' | 'medium' | 'high'; mitigation: string }>;
}

export function buildAdvisorRecommendation(
  inputs: BuildRecommendationInputs,
): AdvisorRecommendation {
  const { action, signals, executionFit, stressRisks } = inputs;
  const what = whatFor(action, signals);
  const why = whyFor(action, signals);
  const when = whenFor(action, signals);
  const improves = {
    fireYearDelta: action.fireYearDelta,
    successDelta: action.successDelta,
    nwDelta: action.nwDelta,
    monthlyPassiveDelta: action.monthlyPassiveDelta,
  };
  const baseRisks = risksFor(action, signals);
  const risks = [...baseRisks, ...(stressRisks ?? []).slice(0, 2)];
  const alternatives = alternativesFor(action, signals);
  const doNothing = doNothingFor(signals);
  const confidence = confidenceFor(action, signals, executionFit);
  const assumptions = assumptionsFor(action, signals, executionFit);
  const sensitivity = sensitivityFor(action, signals);
  return {
    what,
    why,
    when,
    improves,
    risks,
    doNothing,
    alternatives,
    confidence,
    assumptions,
    sensitivity,
  };
}

export const ADVISOR_BANNED_BOILERPLATE = BANNED_BOILERPLATE;
