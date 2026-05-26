/**
 * doNothingForecast.ts — FWL Remediation Phase B-3.
 *
 * The PortfolioLab "Path vs Baseline" chart previously rendered the Do-Nothing
 * series as a flat constant equal to current NW. That made every comparison
 * look catastrophic — the Recommended path ramped while baseline never moved.
 *
 * `buildDoNothingForecast()` projects current ledger NW forward over the same
 * years as the Recommended fan, using:
 *
 *   - the current portfolio's asset-weighted expected return (from
 *     DEFAULT_EXPECTED_RETURNS, weighted by stocks/super/crypto/property),
 *   - a flat annual contribution stream sourced from `sf_planned_investments`
 *     totals on the canonical ledger (caller supplies a single annual figure;
 *     we don't reinterpret cash-flow timing here),
 *   - NO scenario optimizations, NO rebalancing, NO new strategies.
 *
 * Pure function — no fetches, no state. Used by PortfolioLabCharts.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  selectCanonicalNetWorth,
  selectStocksTotal,
  selectCryptoTotal,
  selectSuperCombined,
  selectIpCurrentValueSettled,
} from "./dashboardDataContract";
import { DEFAULT_EXPECTED_RETURNS } from "./forecastStore";

export interface DoNothingPoint {
  year: number;
  netWorth: number;
}

export interface DoNothingForecastInputs {
  ledger: DashboardInputs;
  years: number[];
  /** Optional override for annual contribution; default 0 (no new contributions). */
  annualContribution?: number;
}

/**
 * Asset-weighted expected return from DEFAULT_EXPECTED_RETURNS, using the
 * current asset mix. Falls back to a 6.5% blended assumption when total
 * exposed assets are zero.
 */
export function blendedExpectedReturnPct(ledger: DashboardInputs): number {
  const stocks = selectStocksTotal(ledger);
  const crypto = selectCryptoTotal(ledger);
  const supr = selectSuperCombined(ledger);
  const ip = selectIpCurrentValueSettled(ledger);
  const total = stocks + crypto + supr + ip;
  if (total <= 0) return 6.5;
  const r =
    (stocks / total) * DEFAULT_EXPECTED_RETURNS.stocks +
    (crypto / total) * DEFAULT_EXPECTED_RETURNS.crypto +
    (supr / total) * DEFAULT_EXPECTED_RETURNS.super +
    (ip / total) * DEFAULT_EXPECTED_RETURNS.property;
  return r;
}

/**
 * Project ledger NW forward, year by year, with no rebalancing and no
 * scenario optimizations. Returns one point per supplied year, anchored to
 * the FIRST year in `years` as the starting NW (i.e. `years[0]` carries the
 * current ledger NW; subsequent years compound from there).
 */
export function buildDoNothingForecast(inputs: DoNothingForecastInputs): DoNothingPoint[] {
  const { ledger, years, annualContribution = 0 } = inputs;
  if (!Array.isArray(years) || years.length === 0) return [];
  const sorted = [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (!sorted.length) return [];

  const startNw = selectCanonicalNetWorth(ledger).netWorth;
  const r = blendedExpectedReturnPct(ledger) / 100;
  const out: DoNothingPoint[] = [];
  const startYear = sorted[0];

  let runningNw = startNw;
  let prevYear = startYear;
  out.push({ year: startYear, netWorth: Math.round(startNw) });
  for (let i = 1; i < sorted.length; i++) {
    const y = sorted[i];
    const dy = Math.max(0, y - prevYear);
    for (let k = 0; k < dy; k++) {
      runningNw = runningNw * (1 + r) + annualContribution;
    }
    out.push({ year: y, netWorth: Math.round(runningNw) });
    prevYear = y;
  }
  return out;
}
