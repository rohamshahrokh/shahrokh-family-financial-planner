/**
 * projectionModes.ts — Phase 10: Dashboard Consolidation Helpers
 *
 * The Dashboard already has ONE canonical projection table sourced from
 * `monteCarloResult.fan_data` (enforced by `test-projection-consistency.ts`).
 * V5 adds a mode-selector utility that lets the UI pick which derived view
 * to render from the SAME canonical fan_data — no second table, no
 * competing sources.
 *
 * Modes:
 *   - median       : show p50 of the fan
 *   - conservative : show p10 (downside)
 *   - optimistic   : show p90 (upside)
 *   - deterministic_overlay : annotate p50 with the deterministic projection
 *                              as a thin overlay (still sourced from V3
 *                              canonical, demoted per PR #26).
 *
 * This is purely a SELECTOR over an existing canonical array. It does not
 * mutate state and does not introduce a parallel forecast engine.
 */

export type ProjectionMode = "median" | "conservative" | "optimistic" | "deterministic_overlay";

export interface FanDatum {
  year: number;
  p5?: number;
  p10: number;
  p25?: number;
  median: number;
  p75?: number;
  p90: number;
  p95?: number;
}

export interface DeterministicDatum {
  year: number;
  netWorth: number;
}

export interface CanonicalProjectionRow {
  year: number;
  primary: number;          // value to show as the canonical line in this mode
  lower: number;            // shaded fan lower bound (p10)
  upper: number;            // shaded fan upper bound (p90)
  median: number;           // always include p50 for reference
  modeLabel: string;        // human-readable mode label
  overlay?: number;         // optional deterministic overlay (mode === deterministic_overlay)
}

const MODE_LABELS: Record<ProjectionMode, string> = {
  median: "Median (P50)",
  conservative: "Conservative (P10)",
  optimistic: "Optimistic (P90)",
  deterministic_overlay: "Median with deterministic overlay",
};

export function pickProjectionValue(d: FanDatum, mode: ProjectionMode): number {
  switch (mode) {
    case "conservative":            return d.p10;
    case "optimistic":              return d.p90;
    case "median":
    case "deterministic_overlay":
    default:                        return d.median;
  }
}

export function buildCanonicalProjection(
  fan: FanDatum[],
  mode: ProjectionMode,
  deterministic?: DeterministicDatum[],
): CanonicalProjectionRow[] {
  const detByYear = new Map<number, number>();
  if (deterministic) for (const d of deterministic) detByYear.set(d.year, d.netWorth);

  return fan.map(d => ({
    year: d.year,
    primary: pickProjectionValue(d, mode),
    lower: d.p10,
    upper: d.p90,
    median: d.median,
    modeLabel: MODE_LABELS[mode],
    overlay: mode === "deterministic_overlay" ? detByYear.get(d.year) : undefined,
  }));
}

/**
 * Assert that the SAME fan_data source feeds every projection row. This is a
 * runtime sanity check that the dashboard never accidentally interleaves two
 * sources.
 */
export function assertSingleProjectionSource(
  fan: FanDatum[],
  rows: CanonicalProjectionRow[],
): { ok: boolean; reason?: string } {
  if (rows.length !== fan.length) {
    return { ok: false, reason: `row count ${rows.length} != fan length ${fan.length}` };
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].year !== fan[i].year) {
      return { ok: false, reason: `year mismatch at i=${i}: ${rows[i].year} vs ${fan[i].year}` };
    }
    if (rows[i].median !== fan[i].median) {
      return { ok: false, reason: `median mismatch at year ${fan[i].year}` };
    }
  }
  return { ok: true };
}
