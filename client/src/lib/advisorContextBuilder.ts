/**
 * Sprint 20 PR-B P1-5 — Advisor context builder.
 *
 * Derives the HouseholdSignals input for the advisor narrative engine from
 * canonical ledger + canonical FIRE + concentration flags + life stage. This
 * is the single bridge between "raw canonical data" and "advisor narrative".
 *
 * Hard rule: WHY field must cite at least 2 household-specific signals with
 * values — `buildAdvisorSignals` populates the named numeric properties so
 * `advisorNarrativeEngine.whyFor` can always select ≥ 2 specifics.
 */

import type { ConcentrationFlag } from "./concentration/types";
import type { HouseholdLifeStage } from "./householdState/types";
import type { HouseholdSignals } from "./advisorNarrativeEngine";

export interface BuildSignalsInputs {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  netWorth: number;
  totalDebt: number;
  totalAssets: number;
  propertyValue: number;
  cryptoValue: number;
  equityValue: number;
  liquidCash: number;
  targetFireYear: number;
  targetMonthlyPassive: number;
  baselineFireYear: number;
  baselineMonthlyPassive: number;
  baselineFireProgressPct: number;
  lifeStage: HouseholdLifeStage;
  concentrationFlags: ConcentrationFlag[];
}

function safe(n: number | null | undefined, fallback = 0): number {
  return Number.isFinite(n as number) ? (n as number) : fallback;
}

export function buildAdvisorSignals(inp: BuildSignalsInputs): HouseholdSignals {
  const assets = Math.max(1, safe(inp.totalAssets));
  const leverage = safe(inp.totalDebt) / assets;
  const propertyExposurePct = (safe(inp.propertyValue) / assets) * 100;
  const cryptoExposurePct = (safe(inp.cryptoValue) / assets) * 100;
  const equitySharePct =
    ((safe(inp.equityValue) + safe(inp.cryptoValue)) /
      Math.max(1, safe(inp.netWorth))) * 100;
  const monthlyExpenses = Math.max(1, safe(inp.monthlyExpenses));
  const liquidityMonths = safe(inp.liquidCash) / monthlyExpenses;
  const debtServiceRatio =
    safe(inp.totalDebt) > 0 && safe(inp.monthlyIncome) > 0
      ? (safe(inp.totalDebt) * 0.005) / safe(inp.monthlyIncome)
      : 0;
  const yearsToTarget = Math.max(
    0,
    inp.targetFireYear - new Date().getFullYear(),
  );
  const annualPassiveTarget = safe(inp.targetMonthlyPassive) * 12;
  const fireNumber = annualPassiveTarget / 0.04;
  const fireGapDollars = Math.max(0, fireNumber - safe(inp.netWorth));
  const concentrationRisks = inp.concentrationFlags.map((f) => ({
    ...f,
    breached: f.observedPct >= f.thresholdPct,
  }));
  return {
    leverage,
    propertyExposurePct,
    cryptoExposurePct,
    liquidityMonths,
    fireGapDollars,
    yearsToTarget,
    debtServiceRatio,
    monthlySurplus: safe(inp.monthlySurplus),
    netWorth: safe(inp.netWorth),
    monthlyIncome: safe(inp.monthlyIncome),
    baselineFireProgressPct: safe(inp.baselineFireProgressPct),
    baselineFireYear: inp.baselineFireYear,
    baselineMonthlyPassive: safe(inp.baselineMonthlyPassive),
    targetMonthlyPassive: safe(inp.targetMonthlyPassive),
    targetFireYear: inp.targetFireYear,
    concentrationRisks,
    lifeStage: inp.lifeStage,
    equitySharePct,
  };
}
