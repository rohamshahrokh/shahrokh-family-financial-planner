/**
 * doNothingBaseline.ts — Sprint 13 P0-4.
 *
 * Produces a year-by-year "Do Nothing" net-worth forecast for the chart at
 * `pl-chart-path-vs-baseline`. Prior to Sprint 13, that line was a flat
 * constant (PortfolioLabCharts.tsx:108) which the audit flagged as
 * misleading.
 *
 * The "do nothing" projection is the canonical NW at year 0 compounded
 * by the canonical nominal growth rate (the same rate
 * decisionCandidates.deriveInvestibleBase + the canonical 7% default uses)
 * with NO action applied, NO scenario modification, and NO new
 * contributions overlaid (consistent with "if I do nothing").
 *
 * If the breakdown is not reconciled, or NW can't be derived, the
 * function returns null and the chart MUST be hidden.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import { selectCanonicalNetWorthBreakdown } from "./netWorthBreakdown";

/**
 * Canonical nominal growth rate — matches the value used by
 * decisionCandidates.buildDelayPurchase (clamped 0.02..0.15, default 0.07).
 */
export const DO_NOTHING_GROWTH_RATE = 0.07;

export interface DoNothingForecastPoint {
  year: number;
  netWorth: number;
}

export interface DoNothingForecast {
  points: DoNothingForecastPoint[];
  /** Starting NW at year 0 (matches breakdown.netWorth when reconciled). */
  startNetWorth: number;
  /** Growth rate used. */
  growthRate: number;
  /** Engine source tag for the chart's audit attribution. */
  sourceEngine: string;
  /** Formula string for audit panel. */
  formula: string;
}

/**
 * Build a "do nothing" baseline.
 *
 * @param inputs Canonical ledger.
 * @param years Number of horizon years (e.g. derived from the Sprint 9 fan
 *              the chart already shows so the X axes line up).
 * @param startYear First year on the X axis. Defaults to current calendar year.
 */
export function selectDoNothingBaseline(
  inputs: DashboardInputs | null | undefined,
  years: number,
  startYear?: number,
): DoNothingForecast | null {
  if (!inputs) return null;
  const breakdown = selectCanonicalNetWorthBreakdown(inputs);
  if (!breakdown.reconciled) return null;
  if (!Number.isFinite(years) || years <= 0) return null;
  const start = breakdown.netWorth;
  if (!Number.isFinite(start)) return null;
  const y0 =
    startYear ?? (inputs.todayIso
      ? new Date(inputs.todayIso).getFullYear()
      : new Date().getFullYear());
  const growth = DO_NOTHING_GROWTH_RATE;
  const points: DoNothingForecastPoint[] = [];
  for (let i = 0; i < years; i++) {
    points.push({
      year: y0 + i,
      netWorth: Math.round(start * Math.pow(1 + growth, i)),
    });
  }
  return {
    points,
    startNetWorth: start,
    growthRate: growth,
    sourceEngine: "Canonical Ledger × growth(0.07)",
    formula: "netWorth_y = canonical.netWorth × (1 + 0.07)^y  (no actions, no scenario)",
  };
}

export const DO_NOTHING_UNAVAILABLE_TEXT =
  "Do-Nothing baseline unavailable — forecast engine returned no data.";
