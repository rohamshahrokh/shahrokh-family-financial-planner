/**
 * ProbabilisticWealthSection.tsx — Sprint 8 presentational shell.
 *
 * Consumes Sprint 7's `TruePortfolioOptimizerResult` and the orchestration
 * output of `probabilisticWealthEngine.ts`. This component does no
 * financial calculations of its own — every value rendered here is
 * pass-through from either Sprint 7 or the Sprint 8 simulation engine.
 *
 * Required 12 sections (Sprint 8 brief):
 *   1.  Monte Carlo Confidence Summary
 *   2.  Strategy Success Probability
 *   3.  P10 / P50 / P90 Net Worth
 *   4.  P10 / P50 / P90 Passive Income
 *   5.  FIRE Date Confidence Range
 *   6.  Liquidity Stress Probability
 *   7.  Downside Risk Explanation
 *   8.  Robust Strategy Ranking
 *   9.  Why This Strategy Wins Under Uncertainty
 *  10.  What Could Break This Plan
 *  11.  Assumption Sensitivity Table
 *  12.  Audit Trail / How This Was Calculated
 */

import * as React from "react";
import {
  formatConfidenceBand,
  formatProbabilityPct,
  type ProbabilisticWealthEngineResult,
  type StrategySimulationResult,
  type AssumptionSensitivityRow,
  type ProbabilisticAuditEntry,
  type ConfidenceBand,
} from "@/lib/probabilisticWealthEngine";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";

export interface ProbabilisticWealthSectionProps {
  result: ProbabilisticWealthEngineResult;
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

function toneForProbability(p: number | null, kind: "success" | "risk"): "ok" | "watch" | "fragile" | "default" {
  if (p == null) return "default";
  if (kind === "success") {
    if (p >= 70) return "ok";
    if (p >= 40) return "watch";
    return "fragile";
  }
  if (p < 10) return "ok";
  if (p < 25) return "watch";
  return "fragile";
}

function BandCell({
  band,
  fmt,
  testid,
}: {
  band: ConfidenceBand;
  fmt: "currency" | "currency-per-year" | "currency-per-month" | "year";
  testid: string;
}) {
  const { auditMode } = useAuditMode();
  return (
    <span
      className="text-xs tabular-nums text-foreground"
      data-testid={testid}
      {...(auditMode ? { title: band.source } : {})}
    >
      {formatConfidenceBand(band, fmt)}
      {band.notEngineModelled ? (
        <span
          className="ml-1 text-[10px] italic text-amber-500"
          data-testid={`${testid}-not-engine-modelled`}
        >
          (not engine-modelled)
        </span>
      ) : null}
    </span>
  );
}

/* ─── 1. Monte Carlo Confidence Summary ────────────────────────────────── */

function ConfidenceSummary({
  result,
}: {
  result: ProbabilisticWealthEngineResult;
}) {
  const meta = result.auditTrail.metadata;
  const best = result.bestStrategy;
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-confidence-summary"
    >
      <header className="mb-3">
        <h2
          className="text-base font-semibold text-foreground"
          data-testid="prob-engine-confidence-summary-title"
        >
          Monte Carlo Confidence Summary
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each strategy was simulated under {meta.simulationsPerStrategy.toLocaleString()} draws across {Object.keys(result.assumptionSet).length - 1} assumption drivers.
          Total simulations: <span className="font-semibold text-foreground" data-testid="prob-engine-total-sims">{meta.totalSimulations.toLocaleString()}</span>.
          Seed <span className="font-mono" data-testid="prob-engine-seed">{meta.seed}</span> · Assumption set <span className="font-mono" data-testid="prob-engine-assumption-version">{meta.assumptionSetVersion}</span>.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat label="Strategies simulated" value={String(meta.strategiesSimulated)} testid="prob-engine-stat-strategies" />
        <SummaryStat label="Sims per strategy" value={meta.simulationsPerStrategy.toLocaleString()} testid="prob-engine-stat-sims-per-strategy" />
        <SummaryStat
          label="Best P(FIRE success)"
          value={formatProbabilityPct(best?.probabilityFireSuccess ?? null)}
          testid="prob-engine-stat-best-success"
        />
        <SummaryStat
          label="Best robust score"
          value={best?.robustScore != null ? `${best.robustScore} / 100` : "—"}
          testid="prob-engine-stat-best-robust"
        />
      </div>
      {best ? (
        <p
          className="mt-3 text-xs text-muted-foreground italic"
          data-testid="prob-engine-confidence-summary-narrative"
        >
          Leading strategy under uncertainty: <span className="font-semibold text-foreground">{best.label}</span>.
        </p>
      ) : null}
    </section>
  );
}

function SummaryStat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div
      className="rounded-md border border-border bg-background/40 p-3"
      data-testid={testid}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

/* ─── 2. Strategy Success Probability ──────────────────────────────────── */

function StrategySuccessProbability({ result }: { result: ProbabilisticWealthEngineResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-strategy-success"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-strategy-success-title">
          Strategy Success Probability
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Per-strategy probability of reaching FIRE on schedule under varied assumptions.
        </p>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {result.strategies.map(s => (
          <li
            key={s.scenarioId}
            className="rounded-md border border-border bg-background/40 p-3"
            data-testid={`prob-engine-success-${s.scenarioId}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 flex items-center justify-between">
              <span
                className="text-lg font-semibold tabular-nums text-foreground"
                data-testid={`prob-engine-success-${s.scenarioId}-value`}
              >
                {formatProbabilityPct(s.probabilityFireSuccess)}
              </span>
              <Pill
                tone={toneForProbability(s.probabilityFireSuccess, "success")}
                testid={`prob-engine-success-${s.scenarioId}-pill`}
              >
                {s.probabilityFireSuccess != null
                  ? s.probabilityFireSuccess >= 70 ? "Robust"
                    : s.probabilityFireSuccess >= 40 ? "Watch"
                    : "Fragile"
                  : "Incomplete"}
              </Pill>
            </div>
            {s.notEngineModelled ? (
              <p
                className="mt-1 text-[10px] italic text-amber-500"
                data-testid={`prob-engine-success-${s.scenarioId}-not-engine-modelled`}
              >
                Includes not-engine-modelled dimensions
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── 3–5. P10/P50/P90 bands ───────────────────────────────────────────── */

function ConfidenceBandsTable({
  result,
  field,
  fmt,
  title,
  testid,
  description,
}: {
  result: ProbabilisticWealthEngineResult;
  field: "netWorthBand" | "passiveIncomeBand" | "fireYearBand";
  fmt: "currency" | "currency-per-year" | "year";
  title: string;
  testid: string;
  description: string;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid={testid}
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid={`${testid}-title`}>
          {title}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3">Strategy</th>
              <th className="py-1.5 pr-3">P10</th>
              <th className="py-1.5 pr-3">P50</th>
              <th className="py-1.5 pr-3">P90</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {result.strategies.map(s => {
              const band = s[field] as ConfidenceBand;
              const baseId = `${testid}-row-${s.scenarioId}`;
              return (
                <tr key={s.scenarioId} className="border-t border-border/50" data-testid={baseId}>
                  <td className="py-1.5 pr-3 text-foreground/90">{s.label}</td>
                  <td className="py-1.5 pr-3" data-testid={`${baseId}-p10`}>
                    {band.p10 != null ? fmt === "year" ? band.p10 : fmtCurrency(band.p10, fmt) : "—"}
                  </td>
                  <td className="py-1.5 pr-3" data-testid={`${baseId}-p50`}>
                    {band.p50 != null ? fmt === "year" ? band.p50 : fmtCurrency(band.p50, fmt) : "—"}
                  </td>
                  <td className="py-1.5 pr-3" data-testid={`${baseId}-p90`}>
                    {band.p90 != null ? fmt === "year" ? band.p90 : fmtCurrency(band.p90, fmt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function fmtCurrency(v: number, fmt: "currency" | "currency-per-year"): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const suffix = fmt === "currency-per-year" ? "/yr" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M${suffix}`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k${suffix}`;
  return `${sign}$${Math.round(abs)}${suffix}`;
}

/* ─── 6. Liquidity Stress Probability ──────────────────────────────────── */

function LiquidityStressSection({ result }: { result: ProbabilisticWealthEngineResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-liquidity-stress"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-liquidity-stress-title">
          Liquidity Stress Probability
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Share of simulations where liquidity runway falls below the canonical liquidity floor (3 months).
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {result.strategies.map(s => (
          <div
            key={s.scenarioId}
            className="rounded-md border border-border bg-background/40 p-3"
            data-testid={`prob-engine-liquidity-${s.scenarioId}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="mt-1 flex items-center justify-between">
              <span
                className="text-lg font-semibold tabular-nums text-foreground"
                data-testid={`prob-engine-liquidity-${s.scenarioId}-value`}
              >
                {formatProbabilityPct(s.probabilityLiquidityStress)}
              </span>
              <Pill tone={toneForProbability(s.probabilityLiquidityStress, "risk")}>
                {s.probabilityLiquidityStress != null
                  ? s.probabilityLiquidityStress < 10 ? "Stable"
                    : s.probabilityLiquidityStress < 25 ? "Watch"
                    : "Stressed"
                  : "Incomplete"}
              </Pill>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
              <div data-testid={`prob-engine-negcf-${s.scenarioId}`}>
                Negative cashflow: <span className="font-semibold text-foreground">{formatProbabilityPct(s.probabilityNegativeCashflow)}</span>
              </div>
              <div data-testid={`prob-engine-forced-${s.scenarioId}`}>
                Forced sale: <span className="font-semibold text-foreground">{formatProbabilityPct(s.probabilityForcedSale)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── 7. Downside Risk Explanation ─────────────────────────────────────── */

function DownsideRiskExplanation({ result }: { result: ProbabilisticWealthEngineResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-downside-risk"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-downside-risk-title">
          Downside Risk Explanation
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Composite Monte Carlo confidence = P(FIRE) − ½·P(liq) − ½·P(neg cashflow) − ½·P(forced sale).
        </p>
      </header>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {result.strategies.map(s => (
          <li
            key={s.scenarioId}
            className="rounded-md border border-border bg-background/40 p-3 text-xs leading-relaxed"
            data-testid={`prob-engine-downside-${s.scenarioId}`}
          >
            <div className="font-semibold text-foreground">{s.label}</div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
              <Pill tone="default">P(FIRE) {formatProbabilityPct(s.probabilityFireSuccess)}</Pill>
              <Pill tone={toneForProbability(s.probabilityLiquidityStress, "risk")}>Liq {formatProbabilityPct(s.probabilityLiquidityStress)}</Pill>
              <Pill tone={toneForProbability(s.probabilityNegativeCashflow, "risk")}>Neg CF {formatProbabilityPct(s.probabilityNegativeCashflow)}</Pill>
              <Pill tone={toneForProbability(s.probabilityForcedSale, "risk")}>Forced sale {formatProbabilityPct(s.probabilityForcedSale)}</Pill>
            </div>
            <p className="mt-2 text-muted-foreground">{s.whatBreaks}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── 8. Robust Strategy Ranking ───────────────────────────────────────── */

function RobustRanking({ result }: { result: ProbabilisticWealthEngineResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-robust-ranking"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-robust-ranking-title">
          Robust Strategy Ranking
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Robust score = 0.5 × deterministic ranking + 0.5 × Monte Carlo confidence. Higher is better.
        </p>
        {/* REMEDIATION B-2: not persisted to sf_scenario_results — recomputed
            every render from the canonical engines. Phase B did not wire the
            strategy ↔ scenario-id mapping required to durably save these. */}
        <p
          className="mt-1 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400"
          data-testid="prob-engine-robust-ranking-transient"
        >
          Transient — not persisted (in-memory only)
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3">#</th>
              <th className="py-1.5 pr-3">Strategy</th>
              <th className="py-1.5 pr-3">Deterministic</th>
              <th className="py-1.5 pr-3">MC Confidence</th>
              <th className="py-1.5 pr-3">Robust Score</th>
              <th className="py-1.5 pr-3">P(FIRE)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {result.robustRanking.map((s, idx) => (
              <tr
                key={s.scenarioId}
                className={`border-t border-border/50${idx === 0 ? " bg-emerald-500/5" : ""}`}
                data-testid={`prob-engine-robust-row-${s.scenarioId}`}
              >
                <td className="py-1.5 pr-3 text-muted-foreground">{idx + 1}</td>
                <td className="py-1.5 pr-3 text-foreground/90">{s.label}</td>
                <td className="py-1.5 pr-3" data-testid={`prob-engine-robust-${s.scenarioId}-det`}>{s.deterministicScore != null ? Math.round(s.deterministicScore) : "—"}</td>
                <td className="py-1.5 pr-3" data-testid={`prob-engine-robust-${s.scenarioId}-mc`}>{s.monteCarloConfidence != null ? Math.round(s.monteCarloConfidence) : "—"}</td>
                <td
                  className="py-1.5 pr-3 font-semibold text-foreground"
                  data-testid={`prob-engine-robust-${s.scenarioId}-score`}
                >
                  {s.robustScore != null ? Math.round(s.robustScore) : "—"}
                </td>
                <td className="py-1.5 pr-3" data-testid={`prob-engine-robust-${s.scenarioId}-pfire`}>
                  {formatProbabilityPct(s.probabilityFireSuccess)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 9. Why This Strategy Wins / 10. What Could Break ─────────────────── */

function WhyAndWhatBreaks({ result }: { result: ProbabilisticWealthEngineResult }) {
  const best = result.bestStrategy;
  return (
    <section
      className="grid grid-cols-1 lg:grid-cols-2 gap-3"
      data-testid="prob-engine-why-and-what"
    >
      <article
        className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
        data-testid="prob-engine-why-this-wins"
      >
        <header className="mb-2">
          <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-why-this-wins-title">
            Why This Strategy Wins Under Uncertainty
          </h2>
        </header>
        {best ? (
          <p className="text-sm text-foreground/90 leading-relaxed" data-testid="prob-engine-why-this-wins-text">
            {best.whyRobust}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No strategy could be ranked — Sprint 7 produced no candidates.</p>
        )}
      </article>
      <article
        className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
        data-testid="prob-engine-what-could-break"
      >
        <header className="mb-2">
          <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-what-could-break-title">
            What Could Break This Plan
          </h2>
        </header>
        {best ? (
          <p className="text-sm text-foreground/90 leading-relaxed" data-testid="prob-engine-what-could-break-text">
            {best.whatBreaks}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No simulated strategy available.</p>
        )}
      </article>
    </section>
  );
}

/* ─── 11. Assumption Sensitivity Table ─────────────────────────────────── */

function SensitivityTable({ result }: { result: ProbabilisticWealthEngineResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-sensitivity"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-sensitivity-title">
          Assumption Sensitivity Table
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Δ shown vs the baseline assumption set with the named driver's σ doubled. Run against the leading strategy.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3">Driver</th>
              <th className="py-1.5 pr-3">Δ P(FIRE)</th>
              <th className="py-1.5 pr-3">Δ P50 net worth</th>
              <th className="py-1.5 pr-3">Engine-modelled?</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {result.sensitivity.map((row: AssumptionSensitivityRow) => (
              <tr
                key={row.driver}
                className="border-t border-border/50"
                data-testid={`prob-engine-sensitivity-row-${row.driver}`}
              >
                <td className="py-1.5 pr-3 text-foreground/90">{row.label}</td>
                <td className="py-1.5 pr-3" data-testid={`prob-engine-sensitivity-${row.driver}-dpct`}>
                  {row.deltaProbabilityFireSuccessPct != null
                    ? `${row.deltaProbabilityFireSuccessPct >= 0 ? "+" : ""}${row.deltaProbabilityFireSuccessPct}%`
                    : "—"}
                </td>
                <td className="py-1.5 pr-3" data-testid={`prob-engine-sensitivity-${row.driver}-dnw`}>
                  {row.deltaP50NetWorth != null ? fmtCurrency(row.deltaP50NetWorth, "currency") : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {row.notEngineModelled
                    ? <span className="text-amber-500 italic" data-testid={`prob-engine-sensitivity-${row.driver}-not-engine-modelled`}>not engine-modelled</span>
                    : <span className="text-muted-foreground">engine-modelled</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 12. Audit Trail ──────────────────────────────────────────────────── */

function AuditTrail({ result }: { result: ProbabilisticWealthEngineResult }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm"
      data-testid="prob-engine-audit-trail"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="prob-engine-audit-trail-title">
          Audit Trail · How This Was Calculated
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Engines, inputs, assumption ranges, and seed/version stamps for the Sprint 8 simulation.
        </p>
      </header>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {result.auditTrail.entries.map(entry => (
          <AuditEntry key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function AuditEntry({ entry }: { entry: ProbabilisticAuditEntry }) {
  return (
    <li
      className="rounded-md border border-border bg-background/50 p-3 text-xs"
      data-testid={`prob-engine-audit-${entry.id}`}
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">{entry.label}</h3>
      <dl className="grid grid-cols-1 gap-1">
        <Detail label="Engines used" testid={`prob-engine-audit-${entry.id}-engines`} value={entry.enginesUsed.join(", ") || "—"} />
        <Detail label="Inputs used"  testid={`prob-engine-audit-${entry.id}-inputs`}  value={entry.inputsUsed.join(", ") || "—"} />
        <Detail label="Assumptions"  testid={`prob-engine-audit-${entry.id}-assumptions`} value={entry.assumptions.join(" • ") || "—"} />
        <Detail label="Confidence source" testid={`prob-engine-audit-${entry.id}-confidence`} value={entry.confidenceSource} />
        <Detail label="Risk source"  testid={`prob-engine-audit-${entry.id}-risk`}    value={entry.riskSource} />
        <Detail label="Monte Carlo source" testid={`prob-engine-audit-${entry.id}-mc`} value={entry.monteCarloSource} />
        <Detail label="How was this calculated?" testid={`prob-engine-audit-${entry.id}-how`} value={entry.howCalculated} />
      </dl>
    </li>
  );
}

function Detail({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2" data-testid={testid}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-muted-foreground leading-relaxed">{value}</dd>
    </div>
  );
}

/* ─── Main entry ───────────────────────────────────────────────────────── */

export function ProbabilisticWealthSection(props: ProbabilisticWealthSectionProps) {
  const { result } = props;
  if (result.empty) {
    return (
      <section
        className={`rounded-lg border border-border bg-card p-4 sm:p-5 shadow-sm ${props.className ?? ""}`}
        data-testid="prob-engine-empty"
      >
        <h2 className="text-base font-semibold text-foreground">Assumption Uncertainty Engine</h2>
        <p className="text-xs text-muted-foreground mt-1" data-testid="prob-engine-empty-reason">
          {result.emptyReason ?? "Sprint 7 produced no candidates — nothing to simulate."}
        </p>
      </section>
    );
  }
  return (
    <div
      className={`flex flex-col gap-4 sm:gap-5 ${props.className ?? ""}`}
      data-testid="prob-engine-root"
    >
      <ConfidenceSummary result={result} />
      <StrategySuccessProbability result={result} />
      <ConfidenceBandsTable
        result={result}
        field="netWorthBand"
        fmt="currency"
        title="P10 / P50 / P90 Net Worth"
        testid="prob-engine-net-worth-bands"
        description="Confidence range for projected net worth at the scenario horizon — built from Sprint 7 projected net worth × assumption draws."
      />
      <ConfidenceBandsTable
        result={result}
        field="passiveIncomeBand"
        fmt="currency-per-year"
        title="P10 / P50 / P90 Passive Income"
        testid="prob-engine-passive-income-bands"
        description="Confidence range for projected passive income — Sprint 7 passive income × rent/vacancy/tax/ETF draws."
      />
      <ConfidenceBandsTable
        result={result}
        field="fireYearBand"
        fmt="year"
        title="FIRE Date Confidence Range"
        testid="prob-engine-fire-year-bands"
        description="Confidence range for the year FIRE is achieved — Sprint 7 fire-year baseline × composite draw."
      />
      <LiquidityStressSection result={result} />
      <DownsideRiskExplanation result={result} />
      <RobustRanking result={result} />
      <WhyAndWhatBreaks result={result} />
      <SensitivityTable result={result} />
      <AuditTrail result={result} />
    </div>
  );
}
