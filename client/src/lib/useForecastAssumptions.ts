/**
 * useForecastAssumptions.ts
 *
 * THE single source of truth for all growth-rate assumptions across the site.
 *
 * Every page that shows projections must call this hook instead of
 * hardcoding rates or reading from their own local state.
 *
 * Logic:
 *   mode = year-by-year  → returns per-year array from forecastStore
 *   mode = monte-carlo   → uses median/fan data from last MC run;
 *                          falls back to moderate profile if no MC result yet
 *   mode = profile       → returns profile preset (conservative/moderate/aggressive)
 *
 * Exports:
 *   useForecastAssumptions()   → hook for React components
 *   getYearRate()              → helper — picks the right rate for a given projection year
 */

import { useMemo } from 'react';
import { useForecastStore, PROFILE_DEFAULTS, generateYearlyFromProfile } from './forecastStore';
import type { YearAssumptions } from './forecastStore';

// ─── Resolved per-year assumptions ──────────────────────────────────────────

export interface ResolvedAssumptions {
  /** Effective flat rates for the "current year" (first projection year) */
  flat: {
    property_growth:  number;
    stocks_return:    number;
    crypto_return:    number;
    super_return:     number;
    cash_return:      number;
    inflation:        number;
    income_growth:    number;
    expense_growth:   number;
    interest_rate:    number;
    rent_growth:      number;
  };
  /** Full 10-year array 2026–2035, one row per year */
  yearly: YearAssumptions[];
  /** Active forecast mode — lets pages branch on monte-carlo vs others */
  mode: 'profile' | 'year-by-year' | 'monte-carlo';
  /** Active profile name */
  profile: 'conservative' | 'moderate' | 'aggressive';
  /** Whether MC result is available */
  hasMCResult: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useForecastAssumptions(): ResolvedAssumptions {
  const { forecastMode, profile, yearlyAssumptions, monteCarloResult } = useForecastStore();

  return useMemo((): ResolvedAssumptions => {
    const mode = forecastMode;

    // ── Year-by-Year mode ──────────────────────────────────────────────────
    if (mode === 'year-by-year' && yearlyAssumptions.length > 0) {
      const first = yearlyAssumptions[0];
      return {
        flat: {
          property_growth:  first.property_growth,
          stocks_return:    first.stocks_return,
          crypto_return:    first.crypto_return,
          super_return:     first.super_return,
          cash_return:      first.cash_return,
          inflation:        first.inflation,
          income_growth:    first.income_growth,
          expense_growth:   first.expense_growth,
          interest_rate:    first.interest_rate,
          rent_growth:      first.rent_growth,
        },
        yearly: yearlyAssumptions,
        mode,
        profile,
        hasMCResult: false,
      };
    }

    // ── Monte Carlo mode ───────────────────────────────────────────────────
    // Use moderate profile rates as the base assumption set;
    // the MC result is used for fan-chart display, not for the rate inputs.
    // (Pages that want to show P10/median/P90 read monteCarloResult directly
    //  from useForecastStore — this hook just supplies the growth rates.)
    if (mode === 'monte-carlo') {
      const base = PROFILE_DEFAULTS.moderate;
      // Build a 10-year array using moderate rates (the MC engine already ran
      // with these; using them here keeps individual-page projections consistent
      // with what the MC engine computed).
      const yearly = generateYearlyFromProfile('moderate');
      return {
        flat: {
          property_growth:  base.property_growth,
          stocks_return:    base.stocks_return,
          crypto_return:    base.crypto_return,
          super_return:     base.super_return,
          cash_return:      base.cash_return,
          inflation:        base.inflation,
          income_growth:    base.income_growth,
          expense_growth:   base.expense_growth,
          interest_rate:    base.interest_rate,
          rent_growth:      base.rent_growth,
        },
        yearly,
        mode,
        profile: 'moderate',
        hasMCResult: monteCarloResult !== null,
      };
    }

    // ── Profile mode (default) ─────────────────────────────────────────────
    const base = PROFILE_DEFAULTS[profile] ?? PROFILE_DEFAULTS.moderate;
    const yearly = generateYearlyFromProfile(profile);
    return {
      flat: {
        property_growth:  base.property_growth,
        stocks_return:    base.stocks_return,
        crypto_return:    base.crypto_return,
        super_return:     base.super_return,
        cash_return:      base.cash_return,
        inflation:        base.inflation,
        income_growth:    base.income_growth,
        expense_growth:   base.expense_growth,
        interest_rate:    base.interest_rate,
        rent_growth:      base.rent_growth,
      },
      yearly,
      mode,
      profile,
      hasMCResult: false,
    };
  }, [forecastMode, profile, yearlyAssumptions, monteCarloResult]);
}

// ─── getYearRate() helper ────────────────────────────────────────────────────
// Usage:  getYearRate(yearly, 2028, 'stocks_return')
// Returns the exact per-year value, or falls back to the first year if not found.

export function getYearRate(
  yearly: YearAssumptions[],
  year: number,
  field: keyof Omit<YearAssumptions, 'year'>
): number {
  const row = yearly.find(r => r.year === year) ?? yearly[0];
  return row ? row[field] : 0;
}
