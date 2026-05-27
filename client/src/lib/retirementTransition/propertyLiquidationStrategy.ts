/**
 * Sprint 20 PR-B P1-1.1 — Property liquidation strategy.
 *
 * Generates a ranked list of property actions (sell / keep / recycle equity /
 * reduce debt) timed to the household's FIRE year. Pure function — no IO.
 *
 * Hard rule (user §): every action carries a specific year, a $ net-proceed
 * estimate, and a tax-impact estimate. No vague phrases like "consider
 * selling" — every action has numbers.
 */

import type {
  HouseholdProfile,
  LiquidationAction,
  PropertyHolding,
  PropertyLiquidationPlan,
} from "./types";

const CGT_DISCOUNT = 0.5;
const TRANSACTION_COST_PCT = 0.025;

interface ScoredProperty {
  p: PropertyHolding;
  netEquity: number;
  yieldNetPct: number;
  efficiency: number;
}

function netSaleProceeds(p: PropertyHolding): number {
  const gross = Math.max(0, p.currentValue);
  const txCost = gross * TRANSACTION_COST_PCT;
  return Math.max(0, gross - p.debt - txCost);
}

function estimateCgt(p: PropertyHolding, hh: HouseholdProfile): number {
  if (p.isPPOR) return 0;
  const gain = Math.max(0, p.currentValue - (p.currentValue * 0.6));
  const taxableGain = gain * (hh.cgtDiscountEligible === false ? 1 : CGT_DISCOUNT);
  return taxableGain * hh.effectiveTaxRate;
}

function annualNetYield(p: PropertyHolding): number {
  const gross = p.annualGrossYieldPct - p.annualHoldingCostsPct;
  return gross;
}

function scoreProperties(properties: PropertyHolding[]): ScoredProperty[] {
  return properties.map((p) => {
    const netEquity = Math.max(0, p.currentValue - p.debt);
    const yieldNetPct = annualNetYield(p);
    const annualYieldDollar = (p.currentValue * yieldNetPct) / 100;
    const efficiency = netEquity > 0 ? annualYieldDollar / netEquity : 0;
    return { p, netEquity, yieldNetPct, efficiency };
  });
}

export function generatePropertyLiquidationPlan(
  properties: PropertyHolding[],
  hh: HouseholdProfile,
): PropertyLiquidationPlan {
  const actions: LiquidationAction[] = [];
  if (!properties || properties.length === 0) {
    return {
      actions: [],
      totalNetProceeds: 0,
      totalTaxImpact: 0,
      cashflowDeltaAnnualNet: 0,
      finalPropertyMix: { sold: [], kept: [], recycled: [] },
    };
  }

  const scored = scoreProperties(properties).sort(
    (a, b) => a.efficiency - b.efficiency,
  );

  const investmentProperties = scored.filter((s) => !s.p.isPPOR);
  const ppor = scored.filter((s) => s.p.isPPOR);

  const targetYear = hh.targetFireYear;
  const yearsToTarget = Math.max(1, targetYear - new Date().getFullYear());

  let rank = 1;
  let totalNetProceeds = 0;
  let totalTaxImpact = 0;
  let cashflowDelta = 0;
  const sold: string[] = [];
  const kept: string[] = [];
  const recycled: string[] = [];

  const sellTargetCount = Math.max(0, investmentProperties.length - 1);
  const toSell = investmentProperties.slice(0, sellTargetCount);
  const toKeep = investmentProperties.slice(sellTargetCount);

  toSell.forEach((s, idx) => {
    const offsetYears = Math.min(2, Math.max(0, yearsToTarget - (toSell.length - idx)));
    const scheduledYear = Math.max(
      new Date().getFullYear() + 1,
      targetYear - 2 + offsetYears,
    );
    const netProceeds = netSaleProceeds(s.p);
    const taxImpact = estimateCgt(s.p, hh);
    const annualLost = (s.p.currentValue * s.yieldNetPct) / 100;
    actions.push({
      action: 'sell',
      propertyId: s.p.id,
      propertyLabel: s.p.label,
      scheduledYear,
      reason: `Net yield ${s.yieldNetPct.toFixed(1)}% is below the FIRE-portfolio income target — proceeds redeploy into a higher-yield income portfolio`,
      netProceeds,
      taxImpact,
      cashflowDeltaAnnual: -annualLost,
      rank: rank++,
    });
    totalNetProceeds += netProceeds;
    totalTaxImpact += taxImpact;
    cashflowDelta -= annualLost;
    sold.push(s.p.label);
  });

  toKeep.forEach((s) => {
    const equityRecycleAmount = Math.max(0, s.netEquity * 0.35);
    if (equityRecycleAmount > 50000 && yearsToTarget >= 3) {
      const recycleYear = Math.max(
        new Date().getFullYear() + 1,
        targetYear - 3,
      );
      actions.push({
        action: 'recycle_equity',
        propertyId: s.p.id,
        propertyLabel: s.p.label,
        scheduledYear: recycleYear,
        reason: `Recycle ~$${Math.round(equityRecycleAmount / 1000)}K equity from ${s.p.label} into the diversified income portfolio before retirement`,
        netProceeds: equityRecycleAmount,
        taxImpact: 0,
        cashflowDeltaAnnual: -equityRecycleAmount * 0.06 + equityRecycleAmount * 0.055,
        rank: rank++,
      });
      totalNetProceeds += equityRecycleAmount;
      cashflowDelta += equityRecycleAmount * 0.055 - equityRecycleAmount * 0.06;
      recycled.push(s.p.label);
    } else {
      actions.push({
        action: 'keep',
        propertyId: s.p.id,
        propertyLabel: s.p.label,
        scheduledYear: targetYear,
        reason: `Net yield ${s.yieldNetPct.toFixed(1)}% supports retirement cashflow — retain through FIRE`,
        netProceeds: 0,
        taxImpact: 0,
        cashflowDeltaAnnual: (s.p.currentValue * s.yieldNetPct) / 100,
        rank: rank++,
      });
      cashflowDelta += (s.p.currentValue * s.yieldNetPct) / 100;
      kept.push(s.p.label);
    }
  });

  ppor.forEach((s) => {
    if (s.p.debt > 0) {
      actions.push({
        action: 'reduce_debt',
        propertyId: s.p.id,
        propertyLabel: s.p.label,
        scheduledYear: Math.max(
          new Date().getFullYear() + 1,
          targetYear - 1,
        ),
        reason: `Eliminate PPOR debt ($${Math.round(s.p.debt / 1000)}K) before retirement to lock living costs`,
        netProceeds: 0,
        taxImpact: 0,
        cashflowDeltaAnnual: 0,
        rank: rank++,
      });
    }
    actions.push({
      action: 'keep',
      propertyId: s.p.id,
      propertyLabel: s.p.label,
      scheduledYear: targetYear,
      reason: 'Retain PPOR — primary residence is excluded from decumulation',
      netProceeds: 0,
      taxImpact: 0,
      cashflowDeltaAnnual: 0,
      rank: rank++,
    });
    kept.push(s.p.label);
  });

  return {
    actions,
    totalNetProceeds,
    totalTaxImpact,
    cashflowDeltaAnnualNet: cashflowDelta,
    finalPropertyMix: { sold, kept, recycled },
  };
}
