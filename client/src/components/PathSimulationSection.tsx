/**
 * PathSimulationSection.tsx — Sprint 9 presentational shell.
 *
 * Consumes the `PathSimulationResult` produced by
 * `client/src/lib/pathSimulationEngine.ts`. This component does no
 * financial calculations of its own — every value rendered is a
 * pass-through from the path simulation engine.
 *
 * Required sections (Sprint 9 brief):
 *   1.  Confidence summary
 *   2.  Strategy ranking
 *   3.  P(FIRE) probabilities table
 *   4.  Net worth fan chart
 *   5.  FIRE year histogram
 *   6.  Probability curve
 *   7.  Scenario heatmap
 *   8.  Representative paths
 *   9.  Driver sensitivity
 *  10.  Audit trail
 *
 * Every interactive value uses a `path-sim-*` testid for regression coverage.
 */

import * as React from "react";
import {
  formatPathProbability,
  formatPathBand,
  type PathSimulationResult,
  type PathStrategyResult,
  type PathSimulationBand,
  type PathYearBand,
  type FireYearHistogramBin,
  type ProbabilityCurvePoint,
  type ScenarioHeatmapCell,
  type DriverSensitivityRow,
  type PathSampleSummary,
  type PathSimulationAuditEntry,
} from "@/lib/pathSimulationEngine";

export interface PathSimulationSectionProps {
  result: PathSimulationResult;
  className?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function Pill({
  tone,
  children,
  testid,
}: {
  tone: "ok" | "watch" | "fragile" | "default";
  children: React.ReactNode;
  testid?: string;
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : tone === "watch"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : tone === "fragile"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
      : "bg-muted/40 text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
      data-testid={testid}
    >
      {children}
    </span>
  );
}

function toneForProb(p: number | null, kind: "success" | "risk"): "ok" | "watch" | "fragile" | "default" {
  if (p == null || !Number.isFinite(p)) return "default";
  const pct = p * 100;
  if (kind === "success") {
    if (pct >= 70) return "ok";
    if (pct >= 40) return "watch";
    return "fragile";
  }
  if (pct < 10) return "ok";
  if (pct < 25) return "watch";
  return "fragile";
}

function fmtCurrency(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return "$" + Math.round(v).toLocaleString();
}

function fmtCurrencyPerYear(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return "$" + Math.round(v).toLocaleString() + "/yr";
}

function fmtYear(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(Math.round(v));
}

function BandCell({
  band,
  fmt,
  testid,
}: {
  band: PathSimulationBand;
  fmt: "currency" | "currency-per-year" | "year";
  testid: string;
}) {
  return (
    <span
      className="text-xs tabular-nums text-foreground"
      data-testid={testid}
      title={band.source}
    >
      {formatPathBand(band, fmt)}
      {band.incomplete ? (
        <span
          className="ml-1 text-[10px] italic text-amber-500"
          data-testid={`${testid}-incomplete`}
        >
          (incomplete)
        </span>
      ) : null}
    </span>
  );
}

/* ─── 1. Confidence Summary ───────────────────────────────────────────── */

function ConfidenceSummary({ result }: { result: PathSimulationResult }) {
  const meta = result.auditTrail.metadata;
  const best = result.bestStrategy;
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-confidence-summary"
    >
      <header className="mb-3">
        <h2
          className="text-base font-semibold text-foreground"
          data-testid="path-sim-confidence-summary-title"
        >
          Path Simulation Confidence Summary
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Full-life-path simulation across {meta.strategiesSimulated.toLocaleString()} strategies,{" "}
          {meta.simulationsPerStrategy.toLocaleString()} paths each (
          {meta.totalSimulations.toLocaleString()} total). Horizon {meta.horizonYears}y · Seed {meta.seed} ·{" "}
          {meta.runtimeMs.toLocaleString()}ms.
        </p>
      </header>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Detail
          label="Best strategy"
          value={best?.label ?? "—"}
          testid="path-sim-summary-best-label"
        />
        <Detail
          label="Target year"
          value={best?.targetFireYear != null ? String(best.targetFireYear) : "—"}
          testid="path-sim-summary-target-year"
        />
        <Detail
          label="P(FIRE by target)"
          value={best ? formatPathProbability(best.probabilityFireByTarget) : "—"}
          testid="path-sim-summary-prob-fire"
        />
        <Detail
          label="Robust score"
          value={best?.robustScore != null ? `${Math.round(best.robustScore)}/100` : "—"}
          testid="path-sim-summary-robust-score"
        />
      </dl>
    </section>
  );
}

/* ─── 2. Strategy Ranking ─────────────────────────────────────────────── */

function StrategyRanking({ result }: { result: PathSimulationResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-strategy-ranking"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-strategy-ranking-title">
          Strategy Ranking (by robust score)
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Composite of P(FIRE by target), shortfall avoidance, cashflow stability, and net worth strength.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums" data-testid="path-sim-strategy-ranking-table">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-medium py-1 pr-3">#</th>
              <th className="font-medium py-1 pr-3">Strategy</th>
              <th className="font-medium py-1 pr-3">P(FIRE)</th>
              <th className="font-medium py-1 pr-3">P(miss)</th>
              <th className="font-medium py-1 pr-3">P(neg cashflow)</th>
              <th className="font-medium py-1 pr-3">Robust score</th>
            </tr>
          </thead>
          <tbody>
            {result.ranking.map((s, i) => (
              <tr key={s.scenarioId} className="border-t border-border/60" data-testid={`path-sim-rank-row-${i}`}>
                <td className="py-1 pr-3 text-muted-foreground">{i + 1}</td>
                <td className="py-1 pr-3 text-foreground" data-testid={`path-sim-rank-label-${i}`}>
                  {s.label}
                  {s.notEngineModelled ? (
                    <span className="ml-1 text-[10px] italic text-amber-500">(not engine-modelled)</span>
                  ) : null}
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-rank-pfire-${i}`}>
                  <Pill tone={toneForProb(s.probabilityFireByTarget, "success")}>
                    {formatPathProbability(s.probabilityFireByTarget)}
                  </Pill>
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-rank-pmiss-${i}`}>
                  <Pill tone={toneForProb(s.probabilityMissFire, "risk")}>
                    {formatPathProbability(s.probabilityMissFire)}
                  </Pill>
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-rank-pnegcf-${i}`}>
                  <Pill tone={toneForProb(s.probabilityNegativeCashflow, "risk")}>
                    {formatPathProbability(s.probabilityNegativeCashflow)}
                  </Pill>
                </td>
                <td className="py-1 pr-3 text-foreground" data-testid={`path-sim-rank-score-${i}`}>
                  {s.robustScore != null ? Math.round(s.robustScore) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 3. Probability Table ────────────────────────────────────────────── */

function ProbabilityTable({ result }: { result: PathSimulationResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-probability-table"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-probability-table-title">
          P(FIRE) Probabilities
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Per-strategy probabilities of hitting FIRE by, before, or missing the target year.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums" data-testid="path-sim-probability-table-grid">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-medium py-1 pr-3">Strategy</th>
              <th className="font-medium py-1 pr-3">By target</th>
              <th className="font-medium py-1 pr-3">Before target</th>
              <th className="font-medium py-1 pr-3">Miss</th>
              <th className="font-medium py-1 pr-3">Cash shortfall</th>
            </tr>
          </thead>
          <tbody>
            {result.strategies.map((s, i) => (
              <tr key={s.scenarioId} className="border-t border-border/60" data-testid={`path-sim-prob-row-${i}`}>
                <td className="py-1 pr-3 text-foreground">{s.label}</td>
                <td className="py-1 pr-3" data-testid={`path-sim-prob-by-${i}`}>
                  {formatPathProbability(s.probabilityFireByTarget)}
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-prob-before-${i}`}>
                  {formatPathProbability(s.probabilityFireBeforeTarget)}
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-prob-miss-${i}`}>
                  {formatPathProbability(s.probabilityMissFire)}
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-prob-cash-${i}`}>
                  {formatPathProbability(s.probabilityCashShortfall)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 4. Net Worth Fan Chart ──────────────────────────────────────────── */

function NetWorthFan({ result }: { result: PathSimulationResult }) {
  const best = result.bestStrategy;
  const fan = best?.netWorthFan ?? [];
  const maxV = fan.reduce((m, b) => Math.max(m, b.p90 ?? 0), 0);
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-net-worth-fan"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-net-worth-fan-title">
          Net Worth Confidence Fan
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Per-year P10–P90 projected net worth for the best strategy ({best?.label ?? "—"}).
        </p>
      </header>
      {fan.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="path-sim-net-worth-fan-empty">
          No fan data available.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums" data-testid="path-sim-net-worth-fan-table">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-medium py-1 pr-3">Year</th>
                <th className="font-medium py-1 pr-3">P10</th>
                <th className="font-medium py-1 pr-3">P25</th>
                <th className="font-medium py-1 pr-3">P50</th>
                <th className="font-medium py-1 pr-3">P75</th>
                <th className="font-medium py-1 pr-3">P90</th>
                <th className="font-medium py-1 pr-3 w-48">Range</th>
              </tr>
            </thead>
            <tbody>
              {fan.map((b: PathYearBand, i) => {
                const widthP10 = maxV > 0 && b.p10 != null ? (b.p10 / maxV) * 100 : 0;
                const widthP90 = maxV > 0 && b.p90 != null ? (b.p90 / maxV) * 100 : 0;
                const widthP50 = maxV > 0 && b.p50 != null ? (b.p50 / maxV) * 100 : 0;
                return (
                  <tr key={b.year} className="border-t border-border/60" data-testid={`path-sim-fan-row-${i}`}>
                    <td className="py-1 pr-3 text-muted-foreground">{b.year}</td>
                    <td className="py-1 pr-3" data-testid={`path-sim-fan-p10-${i}`}>{fmtCurrency(b.p10)}</td>
                    <td className="py-1 pr-3">{fmtCurrency(b.p25)}</td>
                    <td className="py-1 pr-3 text-foreground" data-testid={`path-sim-fan-p50-${i}`}>{fmtCurrency(b.p50)}</td>
                    <td className="py-1 pr-3">{fmtCurrency(b.p75)}</td>
                    <td className="py-1 pr-3" data-testid={`path-sim-fan-p90-${i}`}>{fmtCurrency(b.p90)}</td>
                    <td className="py-1 pr-3">
                      <div className="relative h-2 bg-muted/30 rounded" title={`P10 ${fmtCurrency(b.p10)} – P90 ${fmtCurrency(b.p90)}`}>
                        <div
                          className="absolute top-0 h-2 bg-blue-400/40 rounded"
                          style={{ left: `${widthP10}%`, width: `${Math.max(0, widthP90 - widthP10)}%` }}
                        />
                        <div
                          className="absolute top-0 h-2 w-0.5 bg-blue-700"
                          style={{ left: `${widthP50}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ─── 5. FIRE Year Histogram ──────────────────────────────────────────── */

function FireYearHistogram({ result }: { result: PathSimulationResult }) {
  const best = result.bestStrategy;
  const hist = best?.fireYearHistogram ?? [];
  const maxP = hist.reduce((m, b) => Math.max(m, b.probability), 0);
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-fire-year-histogram"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-fire-year-histogram-title">
          FIRE Year Distribution
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Probability mass over the year FIRE is hit, across {best?.simulationsRun.toLocaleString() ?? 0} simulated paths.
        </p>
      </header>
      {hist.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="path-sim-fire-year-histogram-empty">
          No FIRE-year mass — no path reached FIRE within horizon.
        </p>
      ) : (
        <div className="flex flex-col gap-1" data-testid="path-sim-fire-year-histogram-bars">
          {hist.map((bin: FireYearHistogramBin, i) => {
            const w = maxP > 0 ? (bin.probability / maxP) * 100 : 0;
            return (
              <div
                key={bin.year}
                className="grid grid-cols-[60px_1fr_60px] gap-2 items-center text-[11px] tabular-nums"
                data-testid={`path-sim-fire-year-bar-${i}`}
              >
                <span className="text-muted-foreground">{bin.year}</span>
                <div className="h-2 bg-muted/30 rounded overflow-hidden">
                  <div className="h-2 bg-emerald-500/50 rounded" style={{ width: `${w}%` }} />
                </div>
                <span className="text-foreground text-right">{(bin.probability * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─── 6. Probability Curve ────────────────────────────────────────────── */

function ProbabilityCurve({ result }: { result: PathSimulationResult }) {
  const best = result.bestStrategy;
  const curve = best?.probabilityCurve ?? [];
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-probability-curve"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-probability-curve-title">
          Cumulative P(FIRE) Curve
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Probability that FIRE has been hit by each year — best strategy ({best?.label ?? "—"}).
        </p>
      </header>
      {curve.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="path-sim-probability-curve-empty">
          No curve data available.
        </p>
      ) : (
        <div className="flex flex-col gap-1" data-testid="path-sim-probability-curve-points">
          {curve.map((p: ProbabilityCurvePoint, i) => (
            <div
              key={p.year}
              className="grid grid-cols-[60px_1fr_60px] gap-2 items-center text-[11px] tabular-nums"
              data-testid={`path-sim-curve-point-${i}`}
            >
              <span className="text-muted-foreground">{p.year}</span>
              <div className="h-2 bg-muted/30 rounded overflow-hidden">
                <div className="h-2 bg-blue-500/60 rounded" style={{ width: `${Math.max(0, Math.min(100, p.probability * 100))}%` }} />
              </div>
              <span className="text-foreground text-right" data-testid={`path-sim-curve-prob-${i}`}>
                {(p.probability * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── 7. Scenario Heatmap ─────────────────────────────────────────────── */

function ScenarioHeatmap({ result }: { result: PathSimulationResult }) {
  // Group cells by year then strategy.
  const cells: ScenarioHeatmapCell[] = result.scenarioHeatmap;
  const strategyIds = result.strategies.map((s) => s.scenarioId);
  const strategyLabels = new Map(result.strategies.map((s) => [s.scenarioId, s.label]));
  const years = Array.from(new Set(cells.map((c) => c.year))).sort((a, b) => a - b);

  const key = (sid: string, y: number) => `${sid}:${y}`;
  const map = new Map(cells.map((c) => [key(c.scenarioId, c.year), c.probability]));

  function heatColor(p: number): string {
    // 0 -> rose, 0.5 -> amber, 1 -> emerald
    if (p < 0.34) return "bg-rose-500/30 text-rose-900 dark:text-rose-100";
    if (p < 0.67) return "bg-amber-500/30 text-amber-900 dark:text-amber-100";
    return "bg-emerald-500/40 text-emerald-900 dark:text-emerald-100";
  }

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-scenario-heatmap"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-scenario-heatmap-title">
          Scenario Heatmap
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          P(FIRE) over time per strategy — green = high confidence, red = low.
        </p>
      </header>
      {strategyIds.length === 0 || years.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="path-sim-scenario-heatmap-empty">
          No heatmap data.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-[10px] tabular-nums" data-testid="path-sim-scenario-heatmap-table">
            <thead>
              <tr>
                <th className="text-left font-medium py-1 pr-3 text-muted-foreground">Strategy / Year</th>
                {years.map((y) => (
                  <th key={y} className="px-1 py-1 text-muted-foreground font-medium">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strategyIds.map((sid, si) => (
                <tr key={sid} data-testid={`path-sim-heatmap-row-${si}`}>
                  <td className="text-left py-1 pr-3 text-foreground whitespace-nowrap">{strategyLabels.get(sid)}</td>
                  {years.map((y) => {
                    const p = map.get(key(sid, y)) ?? 0;
                    return (
                      <td
                        key={y}
                        className={`px-1 py-1 text-center ${heatColor(p)}`}
                        data-testid={`path-sim-heatmap-cell-${si}-${y}`}
                        title={`${strategyLabels.get(sid)} · ${y} · ${(p * 100).toFixed(0)}%`}
                      >
                        {(p * 100).toFixed(0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ─── 8. Representative Paths ─────────────────────────────────────────── */

function RepresentativePaths({ result }: { result: PathSimulationResult }) {
  const best = result.bestStrategy;
  const paths = best?.representativePaths ?? [];
  const labelMap: Record<PathSampleSummary["label"], string> = {
    most_likely: "Most likely (P50)",
    optimistic: "Optimistic (P75)",
    conservative: "Conservative (P25)",
    worst_reasonable: "Worst reasonable (P10)",
  };
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-representative-paths"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-representative-paths-title">
          Representative Paths
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Real sample paths at key percentiles — best strategy ({best?.label ?? "—"}).
        </p>
      </header>
      {paths.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="path-sim-representative-paths-empty">
          No representative paths available.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paths.map((p: PathSampleSummary, i) => (
            <div
              key={p.label}
              className="rounded border border-border bg-background/50 p-3"
              data-testid={`path-sim-rep-path-${p.label}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">{labelMap[p.label]}</span>
                <span className="text-[10px] text-muted-foreground">#{p.sourceIndex}</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                <div>
                  <dt className="text-muted-foreground">FIRE year</dt>
                  <dd className="text-foreground" data-testid={`path-sim-rep-fire-${i}`}>
                    {p.fireYear != null ? p.fireYear : <span className="italic text-muted-foreground">never</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Final NW</dt>
                  <dd className="text-foreground" data-testid={`path-sim-rep-nw-${i}`}>
                    {fmtCurrency(p.finalNetWorth)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Final passive income</dt>
                  <dd className="text-foreground" data-testid={`path-sim-rep-passive-${i}`}>
                    {fmtCurrencyPerYear(p.finalPassiveIncome)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── 9. Driver Sensitivity ───────────────────────────────────────────── */

function DriverSensitivity({ result }: { result: PathSimulationResult }) {
  const rows = result.driverSensitivityRanking;
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-driver-sensitivity"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-driver-sensitivity-title">
          Key Driver Sensitivity
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          One-at-a-time vol perturbation — sorted by impact on P(FIRE by target).
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums" data-testid="path-sim-driver-sensitivity-table">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-medium py-1 pr-3">Driver</th>
              <th className="font-medium py-1 pr-3">Δ P(FIRE) pp</th>
              <th className="font-medium py-1 pr-3">Δ median FIRE yr</th>
              <th className="font-medium py-1 pr-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: DriverSensitivityRow, i) => (
              <tr key={r.driver} className="border-t border-border/60" data-testid={`path-sim-driver-row-${i}`}>
                <td className="py-1 pr-3 text-foreground" data-testid={`path-sim-driver-label-${i}`}>
                  {r.label}
                  {r.notEngineModelled ? (
                    <span className="ml-1 text-[10px] italic text-amber-500">(not engine-modelled)</span>
                  ) : null}
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-driver-delta-pfire-${i}`}>
                  {r.deltaProbFireByTargetPct != null ? `${r.deltaProbFireByTargetPct.toFixed(1)} pp` : "—"}
                </td>
                <td className="py-1 pr-3" data-testid={`path-sim-driver-delta-fire-${i}`}>
                  {r.deltaMedianFireYears != null ? `${r.deltaMedianFireYears.toFixed(1)} y` : "—"}
                </td>
                <td className="py-1 pr-3 text-muted-foreground">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 10. Audit Trail ─────────────────────────────────────────────────── */

function AuditTrail({ result }: { result: PathSimulationResult }) {
  const entries = result.auditTrail.entries;
  const meta = result.auditTrail.metadata;
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="path-sim-audit-trail"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid="path-sim-audit-trail-title">
          Audit Trail — How This Was Calculated
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Engine v{meta.engineVersion} · seed {meta.seed} · {meta.totalSimulations.toLocaleString()} total paths.
        </p>
      </header>
      <dl className="flex flex-col gap-3 text-xs">
        {entries.map((e: PathSimulationAuditEntry, i) => (
          <div
            key={e.id}
            className="rounded border border-border bg-background/40 p-3"
            data-testid={`path-sim-audit-entry-${i}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-foreground" data-testid={`path-sim-audit-entry-label-${i}`}>
                {e.label}
              </span>
              {e.incomplete ? <Pill tone="watch">incomplete</Pill> : null}
            </div>
            <Detail label="Engines" value={e.enginesUsed.join(", ")} testid={`path-sim-audit-engines-${i}`} />
            <Detail label="Inputs" value={e.inputsUsed.join(", ")} testid={`path-sim-audit-inputs-${i}`} />
            <Detail label="Assumptions" value={e.assumptions.join(" · ")} testid={`path-sim-audit-assumptions-${i}`} />
            <Detail label="Calc" value={e.howCalculated} testid={`path-sim-audit-howcalc-${i}`} />
          </div>
        ))}
      </dl>
    </section>
  );
}

function Detail({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2" data-testid={testid}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-muted-foreground leading-relaxed">{value || "—"}</dd>
    </div>
  );
}

/* ─── Main entry ──────────────────────────────────────────────────────── */

export function PathSimulationSection(props: PathSimulationSectionProps) {
  const { result } = props;
  if (result.empty) {
    return (
      <section
        className={`rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm ${props.className ?? ""}`}
        data-testid="path-sim-empty"
      >
        <h2 className="text-base font-semibold text-foreground">Path-Based Wealth Simulation</h2>
        <p className="text-xs text-muted-foreground mt-1" data-testid="path-sim-empty-reason">
          {result.emptyReason ?? "Sprint 7 produced no candidates — nothing to simulate."}
        </p>
      </section>
    );
  }
  return (
    <div
      className={`flex flex-col gap-4 sm:gap-5 ${props.className ?? ""}`}
      data-testid="path-sim-root"
    >
      <ConfidenceSummary result={result} />
      <StrategyRanking result={result} />
      <ProbabilityTable result={result} />
      <NetWorthFan result={result} />
      <FireYearHistogram result={result} />
      <ProbabilityCurve result={result} />
      <ScenarioHeatmap result={result} />
      <RepresentativePaths result={result} />
      <DriverSensitivity result={result} />
      <AuditTrail result={result} />
    </div>
  );
}
