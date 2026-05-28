/**
 * property/leverage.ts — Sprint 20 PR-F2.
 *
 * Property leverage as a single, deterministic ratio.
 *
 * Formula (per Sprint 20 PR-F2 charter Section 4.2):
 *
 *     propertyLeverage = totalPropertyLoans / totalPropertyValue
 *
 * Inputs are restricted to PROPERTY records only — ETF margin, business
 * debt, credit cards, and any other non-property liability are explicitly
 * NOT included. Only `lifecycle === "settled"` rows contribute; planned and
 * historical rows are modelled but do not affect current-period leverage.
 *
 * Surface: `householdSnapshot.derived.propertyLeverage` is the one canonical
 * path. UI surfaces MUST read from this single field rather than recomputing
 * leverage locally.
 */

import type { CanonicalProperty } from "./types";

/** Settled-only filter (planned / historical excluded). */
export function selectSettledProperties(
  properties: ReadonlyArray<CanonicalProperty>,
): CanonicalProperty[] {
  return properties.filter(p => p.lifecycle === "settled");
}

/** Sum of `loanBalance` across settled properties only. */
export function totalPropertyLoans(
  properties: ReadonlyArray<CanonicalProperty>,
): number {
  return selectSettledProperties(properties).reduce((s, p) => s + p.loanBalance, 0);
}

/** Sum of `currentValue` across settled properties only. */
export function totalPropertyValue(
  properties: ReadonlyArray<CanonicalProperty>,
): number {
  return selectSettledProperties(properties).reduce((s, p) => s + p.currentValue, 0);
}

/**
 * Canonical property-leverage ratio.
 *
 *   leverage = totalPropertyLoans / totalPropertyValue
 *
 * Returns 0 when total value is 0 (no settled property = no leverage).
 * The ratio is unbounded above when loans exceed value (negative equity).
 */
export function propertyLeverage(
  properties: ReadonlyArray<CanonicalProperty>,
): number {
  const value = totalPropertyValue(properties);
  if (value <= 0) return 0;
  const loans = totalPropertyLoans(properties);
  return loans / value;
}

/**
 * Surfaces the leverage along with the two source numbers used to derive
 * it — useful for audit panels and for the `RankedMove.leverageDelta`
 * calculation, which needs the before/after pair of loan and value totals.
 */
export interface PropertyLeverageBreakdown {
  leverage: number;
  totalLoans: number;
  totalValue: number;
}

export function propertyLeverageBreakdown(
  properties: ReadonlyArray<CanonicalProperty>,
): PropertyLeverageBreakdown {
  return {
    leverage: propertyLeverage(properties),
    totalLoans: totalPropertyLoans(properties),
    totalValue: totalPropertyValue(properties),
  };
}
