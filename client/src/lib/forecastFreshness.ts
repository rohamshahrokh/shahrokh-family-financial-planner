/**
 * forecastFreshness.ts — FWL Remediation Phase A-4.
 *
 * Every forecasted / probabilistic output (Monte Carlo runs, FIRE projections,
 * goal-solver outputs, scenario projections) needs to declare:
 *   - WHEN the run was last executed
 *   - WHICH snapshot of household data it was executed against
 *   - WHETHER that snapshot is still consistent with current data
 *
 * `evaluateFreshness()` is the canonical primitive. It returns a FRESH / STALE
 * / MISSING verdict plus the absolute ages, so UIs can render a banner like
 * "Forecast last run 5 days ago, snapshot updated yesterday — re-run to refresh".
 */

export type FreshnessStatus = "FRESH" | "STALE" | "MISSING";

export interface FreshnessMeta {
  runDate: string | null;
  sourceSnapshotDate: string | null;
  status: FreshnessStatus;
  /** Days the run is older than the snapshot (or older than maxAgeDays). Null when MISSING. */
  staleByDays: number | null;
  reason: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toIsoOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Decide whether a forecast run is still fresh relative to its source snapshot.
 *
 * Rules:
 *   - MISSING   if either runDate or snapshotDate is null/invalid.
 *   - STALE     if the snapshot was updated AFTER the run (household data
 *               changed since the last run).
 *   - STALE     if the run is older than maxAgeDays (default 7) regardless of
 *               the snapshot — long-stale runs lose signal even when nothing
 *               has changed in the data.
 *   - FRESH     otherwise.
 */
export function evaluateFreshness(
  runDate: Date | null,
  snapshotDate: Date | null,
  maxAgeDays: number = 7,
  now: Date = new Date(),
): FreshnessMeta {
  const runIso = toIsoOrNull(runDate);
  const snapIso = toIsoOrNull(snapshotDate);

  if (!runIso || !snapIso) {
    return {
      runDate: runIso,
      sourceSnapshotDate: snapIso,
      status: "MISSING",
      staleByDays: null,
      reason: !runIso && !snapIso
        ? "no forecast run and no source snapshot timestamp recorded"
        : !runIso
          ? "no forecast run timestamp — run a forecast to populate"
          : "no source snapshot timestamp — household data has no last-updated marker",
    };
  }

  const runMs = (runDate as Date).getTime();
  const snapMs = (snapshotDate as Date).getTime();
  const nowMs = now.getTime();

  if (snapMs > runMs) {
    const drift = Math.max(0, Math.ceil((snapMs - runMs) / MS_PER_DAY));
    return {
      runDate: runIso,
      sourceSnapshotDate: snapIso,
      status: "STALE",
      staleByDays: drift,
      reason: `source snapshot updated ${drift} day(s) after the last forecast run`,
    };
  }

  const ageDays = Math.max(0, Math.floor((nowMs - runMs) / MS_PER_DAY));
  if (ageDays > maxAgeDays) {
    return {
      runDate: runIso,
      sourceSnapshotDate: snapIso,
      status: "STALE",
      staleByDays: ageDays - maxAgeDays,
      reason: `forecast run is ${ageDays} day(s) old (max age ${maxAgeDays} days)`,
    };
  }

  return {
    runDate: runIso,
    sourceSnapshotDate: snapIso,
    status: "FRESH",
    staleByDays: null,
    reason: `forecast run ${ageDays} day(s) old; snapshot is older`,
  };
}
