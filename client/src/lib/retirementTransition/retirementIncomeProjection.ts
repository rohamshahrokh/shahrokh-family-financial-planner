/**
 * Sprint 20 PR-B P1-1.3 — Retirement income projection.
 *
 * Year-by-year 30-year projection of nominal income, after-tax income, real
 * PV income, withdrawal rate, and portfolio value. Uses the SWR band from
 * the income conversion plan and inflation/tax inputs from the household.
 *
 * Sequence-risk flag fires when the withdrawal rate breaches the band's high
 * end in the first 5 retirement years.
 */

import type {
  HouseholdProfile,
  IncomeConversionPlan,
  ProjectionYear,
  RetirementProjection,
} from "./types";

const HORIZON_YEARS = 30;
const REAL_RETURN_GROWTH_PCT = 0.045;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function projectRetirementIncome(
  startingPortfolioValue: number,
  conversion: IncomeConversionPlan,
  hh: HouseholdProfile,
): RetirementProjection {
  const startYear = Math.max(
    new Date().getFullYear() + 1,
    hh.targetFireYear,
  );
  const endYear = startYear + HORIZON_YEARS - 1;
  const swrBandLowPct = conversion.yieldRange.lowPct;
  const swrBandHighPct = conversion.yieldRange.highPct;
  const midYieldPct = (swrBandLowPct + swrBandHighPct) / 2;
  const inflation = hh.expectedInflationPct / 100;
  const tax = hh.effectiveTaxRate;

  const years: ProjectionYear[] = [];
  let portfolio = startingPortfolioValue;
  let monthlyTargetNominal = hh.targetMonthlyPassiveIncome;
  let shortfallYear: number | undefined;
  let sequenceRiskFlag = false;
  let sustainabilityHits = 0;

  for (let i = 0; i < HORIZON_YEARS; i++) {
    const year = startYear + i;
    const age = hh.currentAge + (year - new Date().getFullYear());
    const inflationFactor = Math.pow(1 + inflation, i);
    const targetIncomeForYear = monthlyTargetNominal * 12 * inflationFactor;
    const grossIncome = Math.min(
      targetIncomeForYear,
      (portfolio * midYieldPct) / 100,
    );
    const netAfterTax = grossIncome * (1 - tax);
    const realIncomePV = grossIncome / inflationFactor;
    const withdrawalRate = portfolio > 0 ? grossIncome / portfolio : 1;
    const growth = portfolio * REAL_RETURN_GROWTH_PCT * 0.4;
    portfolio = Math.max(0, portfolio + growth - grossIncome);

    if (i < 5 && withdrawalRate > swrBandHighPct / 100) {
      sequenceRiskFlag = true;
    }
    if (grossIncome >= targetIncomeForYear * 0.95) {
      sustainabilityHits++;
    } else if (shortfallYear === undefined && i > 0) {
      shortfallYear = year;
    }
    years.push({
      year,
      age,
      grossIncome,
      netAfterTax,
      realIncomePV,
      withdrawalRate,
      portfolioValueEoY: portfolio,
    });
  }

  const sustainabilityScore = clamp01(sustainabilityHits / HORIZON_YEARS);

  return {
    startYear,
    endYear,
    monthlyTargetNominal,
    years,
    sustainabilityScore,
    sequenceRiskFlag,
    shortfallYear,
    swrBandLowPct,
    swrBandHighPct,
  };
}
