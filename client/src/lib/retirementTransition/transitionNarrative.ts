/**
 * Sprint 20 PR-B P1-1.5 — Transition narrative.
 *
 * Composes the advisor narrative from the four sub-outputs: property
 * liquidation plan, primary income conversion, projection, decumulation
 * plan. Every milestone carries at least one specific number (year, %, $,
 * months).
 *
 * Banned phrases (enforced by sanitiser): "delay property purchase",
 * "hold cash", "review SWR", "diversify your portfolio", "consider your
 * options".
 */

import type { HouseholdLifeStage } from "../householdState/types";
import type {
  DecumulationPlan,
  HouseholdProfile,
  IncomeConversionPlan,
  PropertyLiquidationPlan,
  RetirementProjection,
  TransitionMilestone,
  TransitionNarrative,
} from "./types";

const BANNED_FRAGMENTS = [
  'delay property purchase',
  'hold cash',
  'review swr',
  'review your strategy',
  'consider your options',
  'consult an advisor',
  'diversify your portfolio',
];

function dollars(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function sanitise(line: string): string {
  const lower = line.toLowerCase();
  if (BANNED_FRAGMENTS.some((b) => lower.includes(b))) {
    return line.replace(/delay property purchase|hold cash|review swr|review your strategy|consider your options|consult an advisor|diversify your portfolio/gi, '[removed-vague-phrase]');
  }
  return line;
}

export function composeTransitionNarrative(
  liquidationPlan: PropertyLiquidationPlan,
  primaryConversion: IncomeConversionPlan,
  projection: RetirementProjection,
  decumulationPlan: DecumulationPlan,
  hh: HouseholdProfile,
  lifeStage: HouseholdLifeStage,
): TransitionNarrative {
  const targetMonthly = hh.targetMonthlyPassiveIncome;
  const targetYear = hh.targetFireYear;
  const soldList = liquidationPlan.finalPropertyMix.sold;
  const yieldLow = primaryConversion.yieldRange.lowPct.toFixed(1);
  const yieldHigh = primaryConversion.yieldRange.highPct.toFixed(1);

  const headlineRaw =
    soldList.length > 0
      ? `To safely generate ${dollars(targetMonthly)}/month by ${targetYear}, the engine recommends selling ${soldList.length} investment ${soldList.length === 1 ? 'property' : 'properties'} between ${Math.min(...liquidationPlan.actions.filter(a => a.action === 'sell').map(a => a.scheduledYear))}–${Math.max(...liquidationPlan.actions.filter(a => a.action === 'sell').map(a => a.scheduledYear))} and reallocating approximately ${dollars(liquidationPlan.totalNetProceeds)} into a ${primaryConversion.label.toLowerCase()} targeting ${yieldLow}–${yieldHigh}% gross annual yield.`
      : `To safely generate ${dollars(targetMonthly)}/month by ${targetYear}, the engine recommends a ${primaryConversion.label.toLowerCase()} targeting ${yieldLow}–${yieldHigh}% gross annual yield, with a ${decumulationPlan.sequence.replace('_', '-')} drawdown sequence.`;
  const headline = sanitise(headlineRaw);

  const bodyParagraphs: string[] = [];
  bodyParagraphs.push(
    sanitise(
      `Projected monthly income at retirement: ${dollars(primaryConversion.projectedMonthlyIncome)} gross / ${dollars(primaryConversion.taxAdjustedMonthlyIncome)} after tax at a ${(hh.effectiveTaxRate * 100).toFixed(0)}% effective tax rate. Sustainability score: ${(primaryConversion.sustainabilityScore * 100).toFixed(0)}%.`,
    ),
  );
  bodyParagraphs.push(
    sanitise(
      `Inflation-adjusted income at year 5 in today's dollars: ${dollars(primaryConversion.inflationAdjustedAt5YearMonthly)}/month (assumes ${hh.expectedInflationPct.toFixed(1)}% inflation). 30-year projection sustainability: ${(projection.sustainabilityScore * 100).toFixed(0)}%${projection.sequenceRiskFlag ? ', sequence-risk flag active in first 5 years' : ''}.`,
    ),
  );
  bodyParagraphs.push(
    sanitise(
      `Recommended drawdown order: ${decumulationPlan.sequence.replace('_', '-')} — ${decumulationPlan.rationale}. Cash buffer: ${decumulationPlan.bufferMonths} months.`,
    ),
  );
  if (lifeStage === 'STATE_C_NEAR_FIRE' || lifeStage === 'STATE_D_FIRE_ACHIEVED' || lifeStage === 'STATE_E_DECUMULATION') {
    bodyParagraphs.push(
      sanitise(
        `Life stage ${lifeStage.replace('STATE_', '').replace('_', ' ').toLowerCase()} — decumulation, glidepath, and income-conversion strategies outrank further accumulation; sequence-risk control is the primary objective.`,
      ),
    );
  }

  const milestones: TransitionMilestone[] = [];
  liquidationPlan.actions.forEach((a) => {
    if (a.action === 'sell') {
      milestones.push({
        year: a.scheduledYear,
        label: `Sell ${a.propertyLabel}`,
        detail: `Net proceeds ${dollars(a.netProceeds)}, CGT impact ${dollars(a.taxImpact)}.`,
      });
    } else if (a.action === 'recycle_equity') {
      milestones.push({
        year: a.scheduledYear,
        label: `Recycle equity from ${a.propertyLabel}`,
        detail: `Redeploy ${dollars(a.netProceeds)} into income portfolio.`,
      });
    } else if (a.action === 'reduce_debt') {
      milestones.push({
        year: a.scheduledYear,
        label: `Eliminate ${a.propertyLabel} debt`,
        detail: 'Lock living costs before retirement.',
      });
    }
  });
  milestones.push({
    year: targetYear,
    label: 'Activate income portfolio',
    detail: `Deploy ${dollars(primaryConversion.capitalDeployed)} into ${primaryConversion.label} (target ${yieldLow}–${yieldHigh}% gross).`,
  });
  if (projection.shortfallYear) {
    milestones.push({
      year: projection.shortfallYear,
      label: 'Shortfall checkpoint',
      detail: `Withdrawal rate breaches band high (${primaryConversion.yieldRange.highPct.toFixed(1)}%) — top-up review required.`,
    });
  }
  milestones.sort((a, b) => a.year - b.year);

  const assumptions: string[] = [
    `Effective tax rate ${(hh.effectiveTaxRate * 100).toFixed(0)}%`,
    `Inflation ${hh.expectedInflationPct.toFixed(1)}% pa`,
    `Yield band ${yieldLow}–${yieldHigh}% gross (mid used for projection)`,
    `30-year horizon starting ${projection.startYear}`,
    `${decumulationPlan.bufferMonths}-month liquidity buffer maintained at all times`,
  ];

  return {
    headline,
    bodyParagraphs,
    milestones,
    assumptions,
    liquidationPlan,
    primaryConversion,
    projection,
    decumulationPlan,
  };
}

export const BANNED_NARRATIVE_FRAGMENTS = BANNED_FRAGMENTS;
