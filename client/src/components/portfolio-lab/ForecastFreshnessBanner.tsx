/**
 * ForecastFreshnessBanner — FWL Remediation Phase C-3.
 *
 * Renders a top-of-page banner reflecting the freshness verdict emitted by
 * Phase B's engine wiring (`GoalSolverProResult.isStale` / `staleReason`).
 *
 *   - STALE     → amber banner with "Re-run Monte Carlo" CTA
 *   - MISSING   → blue informational "No Monte Carlo run yet" + CTA
 *   - FRESH     → renders nothing (the timestamp is surfaced inside
 *                 AdvancedDisclosure elsewhere — keep the primary UI quiet
 *                 when everything is current)
 */

import * as React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ForecastFreshnessBannerProps {
  /**
   * From `GoalSolverProResult.isStale`:
   *   - `true`  → stale
   *   - `false` → fresh
   *   - `null`  → no freshness signal (treated as MISSING when runDate is also null)
   */
  isStale: boolean | null;
  staleReason: string | null;
  runDate: string | null;
  snapshotDate: string | null;
  /**
   * Optional re-run handler. When omitted, the "Re-run Monte Carlo" / "Run
   * Monte Carlo" button is NOT rendered (see L73-82, L108-118).
   *
   * KI-17: production parents (e.g. TruePortfolioOptimizer) intentionally omit
   * this until the `/api/mc/run` endpoint exists. Do not stub a placeholder
   * handler — showing a button that does nothing is worse than showing none.
   */
  onRerun?: () => void;
  className?: string;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function ForecastFreshnessBanner({
  isStale,
  staleReason,
  runDate,
  snapshotDate,
  onRerun,
  className,
}: ForecastFreshnessBannerProps) {
  const runStr = fmtDate(runDate);
  const snapStr = fmtDate(snapshotDate);
  const neverRun = !runStr && isStale !== false;

  if (neverRun) {
    return (
      <div
        className={[
          "rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100",
          "px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2",
          className ?? "",
        ].filter(Boolean).join(" ")}
        data-testid="forecast-freshness-banner"
        data-variant="never-run"
        role="status"
      >
        <Info className="h-4 w-4 text-blue-600 shrink-0" aria-hidden />
        <div className="text-xs flex-1">
          <span className="font-medium">No Monte Carlo run yet.</span>{" "}
          <span className="opacity-90">
            Run one to get probability-of-FIRE estimates and forecast bands.
          </span>
        </div>
        {onRerun ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onRerun}
            data-testid="forecast-freshness-banner-cta"
          >
            Run Monte Carlo
          </Button>
        ) : null}
      </div>
    );
  }

  if (isStale === true) {
    return (
      <div
        className={[
          "rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
          "px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2",
          className ?? "",
        ].filter(Boolean).join(" ")}
        data-testid="forecast-freshness-banner"
        data-variant="stale"
        role="alert"
      >
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden />
        <div className="text-xs flex-1">
          <span className="font-medium">
            Forecast last run {runStr ?? "(unknown)"}, snapshot updated {snapStr ?? "(unknown)"}.
          </span>{" "}
          <span className="opacity-90">
            {staleReason ?? "Numbers may be outdated."}
          </span>
        </div>
        {onRerun ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onRerun}
            data-testid="forecast-freshness-banner-cta"
          >
            Re-run Monte Carlo
          </Button>
        ) : null}
      </div>
    );
  }

  // FRESH → render nothing in the primary UI. A subtle timestamp lives in
  // AdvancedDisclosure on the parent page if needed.
  return null;
}

export default ForecastFreshnessBanner;
