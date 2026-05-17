/**
 * Life Planning Engine — modelLifePlan + helpers.
 */

import type {
  LifeEventInstance,
  LifeImpactSummary,
  LifePlanInputs,
  LifePlanResult,
  YearlyLifeImpact,
} from './types';
import { LIFE_EVENT_TEMPLATES } from './templates';

function startYear(iso: string, fallback: number): number {
  const parsed = Date.parse(iso.length === 7 ? `${iso}-01` : iso);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).getFullYear();
}

function eventEffective(e: LifeEventInstance) {
  const tpl = LIFE_EVENT_TEMPLATES[e.templateId];
  return {
    monthlyExpenseDelta: e.monthlyExpenseDelta ?? tpl.defaultMonthlyExpenseDelta,
    annualIncomeDelta: e.annualIncomeDelta ?? tpl.defaultAnnualIncomeDelta,
    oneTimeCost: e.oneTimeCost ?? tpl.defaultOneTimeCost,
    durationMonths: e.durationMonths ?? tpl.defaultDurationMonths,
    probability: e.probability ?? tpl.stressProbability,
  };
}

export function modelLifePlan(inputs: LifePlanInputs): LifePlanResult {
  const baseYear = inputs.baseYear ?? new Date().getFullYear();
  const horizon = inputs.horizonYears ?? 35;
  const enabled = inputs.events.filter(e => e.enabled !== false);

  const yearly: YearlyLifeImpact[] = [];
  for (let y = 0; y < horizon; y++) {
    const year = baseYear + y;
    const row: YearlyLifeImpact = {
      year,
      cashflowDelta: 0,
      expenseDelta: 0,
      incomeDelta: 0,
      oneTimeCosts: 0,
      activeEvents: [],
    };

    for (const e of enabled) {
      const eff = eventEffective(e);
      const sy = startYear(e.startISO, baseYear);
      const totalMonths = Math.max(1, eff.durationMonths || 1);
      const endMonth = eff.durationMonths > 0 ? sy * 12 + totalMonths : Number.POSITIVE_INFINITY;
      // months active in this year
      const yearStart = year * 12;
      const yearEnd = year * 12 + 12;
      const startMonth = sy * 12;
      const activeStart = Math.max(yearStart, startMonth);
      const activeEnd = Math.min(yearEnd, endMonth);
      const activeMonths = Math.max(0, activeEnd - activeStart);
      if (activeMonths <= 0 && year !== sy) continue;

      if (activeMonths > 0) {
        row.expenseDelta += eff.monthlyExpenseDelta * activeMonths;
        row.incomeDelta += eff.annualIncomeDelta * (activeMonths / 12);
        row.activeEvents.push(e.templateId);
      }
      // One-time cost in the start year only
      if (year === sy) {
        row.oneTimeCosts += eff.oneTimeCost;
        if (activeMonths <= 0) row.activeEvents.push(e.templateId);
      }
    }
    row.cashflowDelta = row.incomeDelta - row.expenseDelta - row.oneTimeCosts;
    yearly.push(row);
  }

  const summary = summarise(yearly, inputs);
  return {
    events: enabled,
    yearly,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

function summarise(yearly: YearlyLifeImpact[], inputs: LifePlanInputs): LifeImpactSummary {
  if (yearly.length === 0) {
    return {
      totalLifetimeNetCost: 0,
      worstYear: null,
      bestYear: null,
      affectedYears: [],
      averageAnnualDrag: 0,
      fireYearDelayEstimate: 0,
      borrowingPowerImpact: 0,
      liquidityStressMonths: 0,
      stressProbability: 0,
      narrative: 'No life events configured.',
    };
  }
  const totalLifetimeNetCost = yearly.reduce((acc, y) => acc - y.cashflowDelta, 0);
  const affected = yearly.filter(y => y.activeEvents.length > 0);
  const worstYear = affected.length ? affected.reduce((a, b) => a.cashflowDelta < b.cashflowDelta ? a : b) : null;
  const bestYear = affected.length ? affected.reduce((a, b) => a.cashflowDelta > b.cashflowDelta ? a : b) : null;

  const horizon = yearly.length;
  const averageAnnualDrag = -totalLifetimeNetCost / Math.max(1, horizon);

  // FIRE delay: rough — net lifetime cost / monthlySurplus*12 → years.
  const surplus = (inputs.monthlySurplus ?? 0) * 12;
  const fireYearDelayEstimate = surplus > 0 ? Math.max(0, totalLifetimeNetCost / surplus) : 0;

  // Borrowing power impact: every $10k of annual income lost ≈ ~$80k borrowing capacity (very rough).
  const peakIncomeLoss = Math.min(0, ...yearly.map(y => y.incomeDelta));
  const borrowingPowerImpact = Math.round(peakIncomeLoss * 8);

  // Liquidity stress months: worst year cashflow swing vs monthly surplus.
  const monthlySurplus = inputs.monthlySurplus ?? 0;
  const worst = worstYear?.cashflowDelta ?? 0;
  const liquidityStressMonths = monthlySurplus > 0 ? Math.max(0, Math.round(-worst / monthlySurplus)) : Math.abs(worst) > 0 ? 24 : 0;

  // Stress probability — join probabilities of events (independent assumption).
  const probs = inputs.events.map(e => (e.probability ?? LIFE_EVENT_TEMPLATES[e.templateId].stressProbability));
  const joint = probs.length === 0 ? 0 : 1 - probs.reduce((acc, p) => acc * (1 - p), 1);

  const buffer = inputs.emergencyBuffer ?? 0;
  const bufferShortfall = Math.max(0, -worst - buffer);
  const adjustedStressProb = Math.min(1, joint * (bufferShortfall > 0 ? 1.2 : 0.7));

  const parts: string[] = [];
  parts.push(`${affected.length} year(s) affected over the horizon.`);
  if (worstYear) parts.push(`Worst year ${worstYear.year}: net cashflow impact ${Math.round(worstYear.cashflowDelta).toLocaleString()}.`);
  parts.push(`Estimated FIRE delay ~${fireYearDelayEstimate.toFixed(1)} year(s).`);
  if (bufferShortfall > 0) parts.push(`Buffer would be ${Math.round(bufferShortfall).toLocaleString()} short in the peak stress year.`);

  return {
    totalLifetimeNetCost,
    worstYear,
    bestYear,
    affectedYears: affected,
    averageAnnualDrag,
    fireYearDelayEstimate,
    borrowingPowerImpact,
    liquidityStressMonths,
    stressProbability: adjustedStressProb,
    narrative: parts.join(' '),
  };
}

/** Convenience: build the default life-event instance from a template. */
export function instanceFromTemplate(
  templateId: LifeEventInstance['templateId'],
  startISO: string,
  overrides?: Partial<LifeEventInstance>,
): LifeEventInstance {
  return {
    id: `${templateId}-${startISO}`,
    templateId,
    startISO,
    enabled: true,
    ...overrides,
  };
}
