/**
 * Sprint 20 PR-B P1-1.2 — Income conversion strategy.
 *
 * Converts an accumulated capital base into projected passive income
 * streams via four strategies: ETF yield, dividend transition, bond ladder,
 * mixed income. Pure function.
 */

import type {
  ConversionStrategyKind,
  HouseholdProfile,
  IncomeConversionPlan,
} from "./types";

interface StrategyDef {
  kind: ConversionStrategyKind;
  label: string;
  lowPct: number;
  highPct: number;
  sustainabilityBase: number;
  rationale: string;
}

const STRATEGIES: StrategyDef[] = [
  {
    kind: 'etf_yield',
    label: 'Yield-focused ETF portfolio',
    lowPct: 4.5,
    highPct: 6.5,
    sustainabilityBase: 0.82,
    rationale: 'Diversified yield ETFs (e.g. VHY/IHD-style domestic + global income) target 4.5–6.5% gross with franking credits boosting tax-adjusted return',
  },
  {
    kind: 'dividend_transition',
    label: 'Growth-to-dividend transition',
    lowPct: 4.0,
    highPct: 5.5,
    sustainabilityBase: 0.78,
    rationale: 'Shift growth equities into dividend payers over 3–5 years to preserve capital while building reliable income',
  },
  {
    kind: 'bond_ladder',
    label: '5-year bond ladder',
    lowPct: 3.5,
    highPct: 4.8,
    sustainabilityBase: 0.88,
    rationale: 'Five-year laddered AGB/corporate bonds give principal certainty and predictable coupons — lowest sequence risk',
  },
  {
    kind: 'mixed_income',
    label: 'Blended income (60% ETFs / 30% bonds / 10% cash)',
    lowPct: 4.2,
    highPct: 5.8,
    sustainabilityBase: 0.85,
    rationale: 'Balanced sleeves cushion volatility while keeping enough growth tilt to defeat 2.5% inflation across 30 years',
  },
];

function inflationAdjustAt5Yr(monthly: number, inflationPct: number): number {
  return monthly / Math.pow(1 + inflationPct / 100, 5);
}

export function generateIncomeConversionPlans(
  capitalDeployed: number,
  hh: HouseholdProfile,
): IncomeConversionPlan[] {
  if (!Number.isFinite(capitalDeployed) || capitalDeployed <= 0) return [];
  const plans: IncomeConversionPlan[] = STRATEGIES.map((s) => {
    const midPct = (s.lowPct + s.highPct) / 2;
    const grossAnnual = (capitalDeployed * midPct) / 100;
    const projectedMonthlyIncome = grossAnnual / 12;
    const netAnnual = grossAnnual * (1 - hh.effectiveTaxRate);
    const taxAdjustedMonthlyIncome = netAnnual / 12;
    const inflationAdjustedAt5YearMonthly = inflationAdjustAt5Yr(
      taxAdjustedMonthlyIncome,
      hh.expectedInflationPct,
    );
    const gapVsTarget =
      hh.targetMonthlyPassiveIncome > 0
        ? Math.min(1, taxAdjustedMonthlyIncome / hh.targetMonthlyPassiveIncome)
        : 1;
    const sustainabilityScore = Math.max(
      0,
      Math.min(1, s.sustainabilityBase * gapVsTarget),
    );
    return {
      strategy: s.kind,
      label: s.label,
      capitalDeployed,
      projectedMonthlyIncome,
      yieldRange: { lowPct: s.lowPct, highPct: s.highPct },
      taxAdjustedMonthlyIncome,
      inflationAdjustedAt5YearMonthly,
      sustainabilityScore,
      rationale: s.rationale,
    };
  });
  plans.sort((a, b) => b.sustainabilityScore - a.sustainabilityScore);
  return plans;
}

export function selectPrimaryConversion(
  plans: IncomeConversionPlan[],
  preference?: 'safety' | 'income' | 'balanced',
): IncomeConversionPlan | null {
  if (!plans.length) return null;
  if (preference === 'safety') {
    return plans.find((p) => p.strategy === 'bond_ladder') ?? plans[0];
  }
  if (preference === 'income') {
    return plans.find((p) => p.strategy === 'etf_yield') ?? plans[0];
  }
  return plans.find((p) => p.strategy === 'mixed_income') ?? plans[0];
}
