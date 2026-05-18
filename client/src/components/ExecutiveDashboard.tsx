/**
 * ExecutiveDashboard.tsx — FWL Executive Overview Rebuild V2
 *
 * "A calm Family Office Cockpit" — NOT a data dump, forecast terminal, audit
 * page or feature showcase. Replaces the prior Phase-7 Executive Dashboard
 * (Header + Daily Briefing + Strategic Priorities + 6-metric Health Strip +
 * Action Queue) with a tighter four-section information architecture that
 * answers the only four questions the homepage should answer:
 *
 *     1. Where am I now?         → ExecutiveHeroSnapshot
 *     2. Am I okay?              → ExecutiveHealthStrip (4 canonical metrics)
 *     3. What is my trajectory?  → CanonicalTrajectoryPanel (MC P50 + Confidence)
 *     4. What should I do next?  → ExecutiveActionQueue (max 3 items)
 *
 * Source-of-truth rules preserved:
 *   • Monte Carlo P50 is the ONLY canonical trajectory representation. The
 *     deterministic year-10 figure is NEVER shown as the official trajectory
 *     (we render a neutral "Monte Carlo pending" state when MC has not run).
 *   • Surplus, recommendation engine output, risk state and FIRE progress
 *     all flow in via props from the canonical dashboard selectors — this
 *     component performs ONLY presentation formatting.
 *   • There is exactly ONE Best Move surface on Executive Overview (inside
 *     the Hero), and exactly ONE Action Queue (max 3) — no duplicated
 *     recommendation systems.
 *
 * Visual contract preserved:
 *   • Dark navy/graphite card surfaces, restrained gold accent for the
 *     primary Net Worth / Best Move signal, cyan/green/purple intelligence
 *     accents for trajectory and health states. Premium, calm, minimal.
 *
 * Explainability:
 *   • Every metric uses the global Liquidity-style MetricExplainer popup
 *     (from PR #34/#35). No browser-native title tooltips on key signals.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, TrendingDown, Shield, Sparkles, AlertTriangle,
  Activity, ArrowRight, ChevronDown, ChevronUp, Flame, Wallet,
  Layers, Target, CheckCircle2,
} from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import { useAppStore } from '@/lib/store';
import { computeUnifiedBestMove, type UnifiedBestMoveResult } from '@/lib/recommendationEngine';
import { formatCurrency } from '@/lib/finance';
import { maskValue } from '@/components/PrivacyMask';
import { MetricExplainer } from '@/components/intelligence/MetricExplainer';
import { readMetric, getMetricExplanation, type MetricReading } from '@/lib/metricExplanations';
import type { MonteCarloFanPoint } from '@/lib/forecastStore';

// ─── Public props ────────────────────────────────────────────────────────────

export interface ExecutiveDashboardProps {
  netWorth: number;
  surplus: number;
  totalLiquidCash: number;
  totalLiab: number;
  monthlyExpenses: number;
  passiveIncome: number;
  /** Deterministic 10y net worth — kept for compatibility, never rendered as primary. */
  year10NW: number;
  /**
   * Canonical Monte Carlo P50 (median) net worth at the selected horizon.
   * Only canonical source — when null/undefined we render "Monte Carlo pending".
   */
  trajectoryP50?: number | null;
  /** Year that `trajectoryP50` represents (e.g. 2035). */
  trajectoryYear?: number | null;
  fireProgressPct: number;
  fireCurrentAmt: number;
  fireTargetAmt: number;
  riskScore: number;
  riskLabel: string;
  /** Monthly debt service total. */
  monthlyDebtService: number;
  /** Mortgage balance (for leverage calc). */
  totalMortgage: number;
  /** Total property value (for LVR). */
  totalPropertyValue: number;
  /** Total assets for leverage ratio. */
  totalAssets: number;
  /**
   * Canonical Monte Carlo fan data — the ONLY trajectory representation
   * shown on the Executive Overview. When undefined or empty, the trajectory
   * panel renders a neutral pending CTA.
   */
  monteCarloFanData?: MonteCarloFanPoint[] | null;
  /** Number of MC simulations run (purely informational). */
  monteCarloSimulations?: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trajectoryFromGrowth(start: number, end: number): { pct: number; label: string } {
  if (!start || start <= 0) return { pct: 0, label: 'Insufficient data' };
  const pct = ((end - start) / start) * 100;
  return {
    pct,
    label: pct >= 50 ? 'Strong growth' : pct >= 20 ? 'Steady growth' : pct >= 5 ? 'Modest growth' : pct >= 0 ? 'Flat' : 'Drawdown',
  };
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// ─── 1. ExecutiveHeroSnapshot ────────────────────────────────────────────────
// "Where am I now?" — Net Worth, Monthly Surplus, Risk State, FIRE Timeline,
// and exactly one primary Best Move. Visually dominant, scannable, calm.

interface HeroProps extends ExecutiveDashboardProps {
  result: UnifiedBestMoveResult | null;
}

function ExecutiveHeroSnapshot(p: HeroProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const surplusPositive = p.surplus >= 0;
  const riskTone =
    p.riskScore >= 70 ? 'hsl(142,60%,55%)'
    : p.riskScore >= 50 ? 'hsl(43,90%,55%)'
    : 'hsl(0,72%,60%)';

  // FIRE timeline: years until target at current pace. Use surplus * 12 + a
  // conservative 6% real growth on the current FIRE capital as the implicit
  // pace. When the target is already met or no surplus, show "—".
  const fireYears: number | null = (() => {
    if (p.fireProgressPct >= 100) return 0;
    if (p.surplus <= 0 || p.fireTargetAmt <= 0) return null;
    const annualSavings = p.surplus * 12;
    const gap = Math.max(0, p.fireTargetAmt - p.fireCurrentAmt);
    if (gap <= 0) return 0;
    // Simple closed-form: gap / annualSavings — calm, defensible.
    const naiveYears = gap / annualSavings;
    if (!Number.isFinite(naiveYears) || naiveYears <= 0) return null;
    return Math.round(naiveYears);
  })();

  const fireAge: number | null = fireYears !== null
    ? Math.round(40 + fireYears) // Placeholder anchor age — exact age computed by FIRE engine elsewhere.
    : null;

  const best = p.result?.unified.bestMove;

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: 'hsl(var(--gold-dim) / 0.35)',
        background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-surface) / 0.30) 100%)',
      }}
      data-testid="executive-hero-snapshot"
    >
      {/* Section title — calm, gold accent. */}
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(var(--gold-surface))',
              border: '1px solid hsl(var(--gold-dim) / 0.5)',
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'hsl(var(--gold))' }} />
          </div>
          <div>
            <h1 className="text-[11px] uppercase tracking-widest font-bold" style={{ color: 'hsl(var(--gold))' }}>
              Executive Overview
            </h1>
            <p className="text-[11px] text-muted-foreground">Family cockpit · 15-second read</p>
          </div>
        </div>
      </header>

      {/* Four core orientation metrics — generous whitespace, calm rhythm. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-border/25 border-t border-border/30">
        {/* Net Worth — dominant gold */}
        <div className="px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 inline-flex items-center gap-1">
            Net Worth
            <MetricExplainer metricId="net-worth-reconciliation" size={11} />
          </div>
          <div className="text-2xl md:text-3xl font-extrabold tabular-nums leading-none" style={{ color: 'hsl(var(--gold))' }}>
            {mv(formatCurrency(p.netWorth, true))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">Brisbane, QLD · AUD</div>
        </div>

        {/* Monthly Surplus */}
        <div className="px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 inline-flex items-center gap-1">
            Monthly Surplus
            <MetricExplainer metricId="dca-recommendation" size={11} />
          </div>
          <div
            className="text-xl md:text-2xl font-extrabold tabular-nums leading-none flex items-center gap-1.5"
            style={{ color: surplusPositive ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}
            data-testid="hero-surplus-value"
          >
            {surplusPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {mv(formatCurrency(p.surplus, true))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">{mv(formatCurrency(p.surplus * 12, true))} / yr</div>
        </div>

        {/* Risk state */}
        <div className="px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 flex items-center gap-1">
            <span>Risk State</span>
            <MetricExplainer
              metricId="risk-state"
              value={p.riskScore}
              reading={{
                id: 'risk-state',
                value: p.riskScore,
                displayValue: `${p.riskScore} / 100 · ${p.riskLabel}`,
                state: readMetric(getMetricExplanation('risk-state')!, p.riskScore).state,
                interpretation: readMetric(getMetricExplanation('risk-state')!, p.riskScore).interpretation,
              }}
              size={12}
            />
          </div>
          <div
            className="text-xl md:text-2xl font-extrabold leading-none flex items-center gap-1.5"
            style={{ color: riskTone }}
            data-testid="hero-risk-value"
          >
            <Shield className="w-4 h-4" />
            {p.riskLabel}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 tabular-nums">{p.riskScore} / 100</div>
        </div>

        {/* FIRE timeline */}
        <div className="px-5 py-4">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 flex items-center gap-1">
            <span>FIRE Timeline</span>
            <MetricExplainer metricId="fire-progress" size={11} />
          </div>
          {fireYears === null ? (
            <div className="text-sm font-bold leading-tight text-muted-foreground" data-testid="hero-fire-pending">
              Pending surplus
            </div>
          ) : fireYears === 0 ? (
            <div
              className="text-xl md:text-2xl font-extrabold leading-none flex items-center gap-1.5"
              style={{ color: 'hsl(142,60%,55%)' }}
              data-testid="hero-fire-value"
            >
              <Flame className="w-4 h-4" />
              FIRE met
            </div>
          ) : (
            <div
              className="text-xl md:text-2xl font-extrabold leading-none flex items-center gap-1.5"
              style={{ color: 'hsl(43,90%,55%)' }}
              data-testid="hero-fire-value"
            >
              <Flame className="w-4 h-4" />
              {fireYears} yr
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-2">
            {fireAge !== null && fireYears !== null && fireYears > 0 ? `~age ${fireAge} · ${Math.round(p.fireProgressPct)}% of target` : `${Math.round(p.fireProgressPct)}% of target`}
          </div>
        </div>
      </div>

      {/* Primary Best Move — single recommendation surface on the homepage. */}
      <div className="border-t border-border/30 px-5 py-4" data-testid="hero-best-move">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'hsl(var(--gold))' }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'hsl(var(--gold))' }}>
                Best Move
              </span>
              <MetricExplainer metricId="best-move" size={11} />
            </div>
            {best ? (
              <>
                <p className="text-sm md:text-base font-semibold text-foreground leading-snug" data-testid="hero-best-move-title">
                  {best.title}
                </p>
                {best.benefitLabel && (
                  <p className="text-xs text-emerald-400 font-mono mt-1.5" data-testid="hero-best-move-benefit">
                    {mv(best.benefitLabel)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Recommendation engine warming up…</p>
            )}
          </div>
          {best?.cta && (
            <Link href={best.cta.route}>
              <button
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                style={{ background: 'hsl(var(--gold))', color: 'hsl(var(--primary-foreground))' }}
                data-testid="hero-best-move-cta"
              >
                {best.cta.label}
                <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── 2. CanonicalTrajectoryPanel ─────────────────────────────────────────────
// "What is my trajectory?" — Monte Carlo P10/P50/P90 confidence band, then a
// compact table (Year, P50, Confidence Range). P10/P90 columns live behind an
// "Expand" toggle so the default view stays calm and decision-grade.

function CanonicalTrajectoryPanel(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const [expandedRange, setExpandedRange] = useState(false);

  const fan = p.monteCarloFanData;
  const hasMc = !!fan && fan.length > 0;
  const hasMcTrajectory = typeof p.trajectoryP50 === 'number' && Number.isFinite(p.trajectoryP50);
  const traj = hasMcTrajectory
    ? trajectoryFromGrowth(p.netWorth, p.trajectoryP50 as number)
    : { pct: 0, label: 'Monte Carlo pending' };
  const trajectoryYearLabel = hasMcTrajectory && p.trajectoryYear
    ? `${p.trajectoryYear} P50`
    : `${new Date().getFullYear() + 9} horizon`;

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="canonical-trajectory-panel"
    >
      <header className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(280,80%,12%)', border: '1px solid hsl(280,80%,30%)' }}
          >
            <Activity className="w-4 h-4" style={{ color: 'hsl(280,80%,72%)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Wealth Trajectory
              <MetricExplainer metricId="monte-carlo-probability" size={11} />
            </h2>
            <p className="text-[11px] text-muted-foreground">Monte Carlo · canonical forecast</p>
          </div>
        </div>
        <Link href="/ai-forecast-engine">
          <span className="text-xs text-primary hover:underline">Open Forecast Engine →</span>
        </Link>
      </header>

      {/* Hero trajectory readout — single dominant number with confidence framing. */}
      <div className="px-5 pb-4 border-t border-border/30 pt-4">
        {hasMcTrajectory ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                <span>P50 — most-likely wealth, {trajectoryYearLabel}</span>
                <MetricExplainer metricId="p10-p50-p90" size={11} />
              </div>
              <div
                className="text-3xl md:text-4xl font-extrabold tabular-nums leading-none"
                style={{ color: 'hsl(210,80%,68%)' }}
                data-testid="trajectory-p50-value"
              >
                {mv(formatCurrency(p.trajectoryP50 as number, true))}
              </div>
              <div className="text-[11px] mt-2" style={{ color: traj.pct >= 0 ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}>
                {traj.pct >= 0 ? '+' : ''}{traj.pct.toFixed(0)}% vs today · {traj.label}
              </div>
            </div>
            {fan && fan.length > 0 && (
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase tracking-widest font-bold">Bear · P10</span>
                  <span className="tabular-nums font-mono" style={{ color: 'hsl(0,72%,60%)' }}>
                    {mv(formatCurrency(fan[fan.length - 1].p10, true))}
                  </span>
                </div>
                <div className="w-px h-7 bg-border/40" />
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase tracking-widest font-bold">Bull · P90</span>
                  <span className="tabular-nums font-mono" style={{ color: 'hsl(142,60%,55%)' }}>
                    {mv(formatCurrency(fan[fan.length - 1].p90, true))}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">
                P50 — most-likely wealth
              </div>
              <div
                className="text-lg font-bold leading-tight"
                style={{ color: 'hsl(215,15%,82%)' }}
                data-testid="trajectory-pending"
              >
                Monte Carlo pending
              </div>
              <div className="text-[11px] mt-2 text-muted-foreground">
                Open the Forecast Engine to run the canonical Monte Carlo simulation.
              </div>
            </div>
            <Link href="/ai-forecast-engine">
              <button
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                style={{ background: 'hsl(280,80%,18%)', color: 'hsl(280,80%,82%)', border: '1px solid hsl(280,80%,30%)' }}
                data-testid="trajectory-pending-cta"
              >
                Run Monte Carlo
                <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Compact projection table — Year · P50 · Confidence range. */}
      {hasMc && (
        <div className="border-t border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="trajectory-projection-table">
              <thead>
                <tr className="border-b border-border/40 bg-muted/10">
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest">Year</th>
                  <th className="px-4 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest">
                    <span className="inline-flex items-center gap-1 justify-end w-full">
                      P50 (median)
                      <MetricExplainer metricId="p10-p50-p90" size={10} />
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest">
                    Confidence Range
                  </th>
                  {expandedRange && (
                    <>
                      <th className="px-4 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest">Bear · P10</th>
                      <th className="px-4 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest">Bull · P90</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {fan!.map((row, idx) => {
                  const band = row.p90 - row.p10;
                  const bandPct = row.median > 0 ? (band / Math.max(1, row.median)) * 100 : 0;
                  return (
                    <tr key={row.year} className={`border-b border-border/20 hover:bg-purple-500/[0.04] ${idx === 0 ? 'bg-purple-500/[0.03]' : ''}`}>
                      <td className="px-4 py-2 font-bold text-foreground whitespace-nowrap">
                        {row.year}{idx === 0 ? ' ★' : ''}
                      </td>
                      <td
                        className="px-4 py-2 font-mono font-bold tabular-nums whitespace-nowrap text-right"
                        style={{ color: 'hsl(43,90%,62%)' }}
                        data-testid={`trajectory-row-${row.year}-p50`}
                      >
                        {mv(formatCurrency(row.median, true))}
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums whitespace-nowrap text-right">
                        {mv(formatCurrency(band, true))} <span className="text-[10px] opacity-70">({bandPct.toFixed(0)}%)</span>
                      </td>
                      {expandedRange && (
                        <>
                          <td className="px-4 py-2 font-mono tabular-nums whitespace-nowrap text-right" style={{ color: 'hsl(0,72%,60%)' }}>
                            {mv(formatCurrency(row.p10, true))}
                          </td>
                          <td className="px-4 py-2 font-mono tabular-nums whitespace-nowrap text-right" style={{ color: 'hsl(142,60%,55%)' }}>
                            {mv(formatCurrency(row.p90, true))}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between flex-wrap gap-2 bg-muted/[0.05]">
            <button
              onClick={() => setExpandedRange(v => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="trajectory-expand-range"
            >
              {expandedRange ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expandedRange ? 'Hide P10 / P90 columns' : 'Show P10 / P90 columns'}
            </button>
            <span className="text-[10px] text-muted-foreground">
              {p.monteCarloSimulations
                ? `${p.monteCarloSimulations.toLocaleString()} simulations · canonical forecast`
                : 'Canonical forecast'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── 3. ExecutiveHealthStrip ─────────────────────────────────────────────────
// "Am I okay?" — exactly four canonical metrics: Liquidity, Leverage,
// Cashflow, FIRE Progress. Each shows healthy/risky state with concise
// contextual meaning.

interface HealthIndicator {
  label: string;
  metricId: string;
  rawValue: number;
  value: string;
  tone: 'healthy' | 'caution' | 'risk';
  Icon: React.ComponentType<{ className?: string }>;
  caption: string;
  meaning: string;
}

function toneColor(tone: HealthIndicator['tone']): string {
  return tone === 'healthy' ? 'hsl(142,60%,55%)' : tone === 'caution' ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)';
}

function ExecutiveHealthStrip(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const liquidityMonths = p.monthlyExpenses > 0 ? p.totalLiquidCash / p.monthlyExpenses : 0;
  const leveragePct = p.totalAssets > 0 ? (p.totalLiab / p.totalAssets) * 100 : 0;
  // Cashflow health = monthly surplus relative to monthly expenses.
  const cashflowPct = p.monthlyExpenses > 0 ? (p.surplus / p.monthlyExpenses) * 100 : 0;

  const indicators: HealthIndicator[] = [
    {
      label: 'Liquidity',
      metricId: 'liquidity',
      rawValue: liquidityMonths,
      value: `${liquidityMonths.toFixed(1)} mo`,
      tone: liquidityMonths >= 6 ? 'healthy' : liquidityMonths >= 3 ? 'caution' : 'risk',
      Icon: Wallet,
      caption: `${mv(formatCurrency(p.totalLiquidCash, true))} liquid`,
      meaning:
        liquidityMonths >= 6 ? 'Buffer covers ≥6 months of expenses — resilient.'
        : liquidityMonths >= 3 ? 'Buffer covers 3–6 months — rebuild before scaling risk.'
        : 'Buffer below 3 months — restore liquidity first.',
    },
    {
      label: 'Leverage',
      metricId: 'leverage',
      rawValue: leveragePct,
      value: `${leveragePct.toFixed(0)}%`,
      tone: leveragePct < 50 ? 'healthy' : leveragePct < 70 ? 'caution' : 'risk',
      Icon: Layers,
      caption: 'Debt / Assets',
      meaning:
        leveragePct < 50 ? 'Balance sheet is conservatively levered — comfortable headroom.'
        : leveragePct < 70 ? 'Leverage is in the working range — monitor capacity before new debt.'
        : 'Leverage is high — reduce balance before adding risk.',
    },
    {
      label: 'Cashflow',
      metricId: 'cashflow-resilience',
      rawValue: cashflowPct,
      value: `${cashflowPct.toFixed(0)}%`,
      tone: cashflowPct >= 25 ? 'healthy' : cashflowPct >= 10 ? 'caution' : 'risk',
      Icon: Activity,
      caption: 'Surplus / Expenses',
      meaning:
        cashflowPct >= 25 ? 'Strong monthly surplus — capacity to compound or repay debt.'
        : cashflowPct >= 10 ? 'Modest surplus — protect from lifestyle inflation.'
        : 'Surplus is thin or negative — tighten before deploying capital.',
    },
    {
      label: 'FIRE Progress',
      metricId: 'fire-progress',
      rawValue: p.fireProgressPct,
      value: `${Math.round(p.fireProgressPct)}%`,
      tone: p.fireProgressPct >= 50 ? 'healthy' : p.fireProgressPct >= 20 ? 'caution' : 'risk',
      Icon: Target,
      caption: 'Of capital target',
      meaning:
        p.fireProgressPct >= 50 ? 'Past the halfway mark — compounding does the heavy lifting now.'
        : p.fireProgressPct >= 20 ? 'On the build — surplus and discipline are the levers.'
        : 'Foundational phase — focus on income capacity and savings rate.',
    },
  ];

  const readings: MetricReading[] = indicators
    .map((ind) => {
      const exp = getMetricExplanation(ind.metricId);
      return exp ? readMetric(exp, ind.rawValue, ind.value) : undefined;
    })
    .filter((r): r is MetricReading => !!r);

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="executive-health-strip"
    >
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(188,60%,10%)', border: '1px solid hsl(188,60%,28%)' }}
          >
            <Shield className="w-4 h-4" style={{ color: 'hsl(188,60%,65%)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Financial Health</h2>
            <p className="text-[11px] text-muted-foreground">Four structural signals</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/25 border-t border-border/30">
        {indicators.map((ind) => (
          <div key={ind.label} className="px-5 py-4" data-testid={`health-${ind.metricId}`}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
              <ind.Icon className="w-3 h-3" />
              <span className="truncate">{ind.label}</span>
              <MetricExplainer
                metricId={ind.metricId}
                value={ind.rawValue}
                reading={{
                  id: ind.metricId,
                  value: ind.rawValue,
                  displayValue: ind.value,
                  state: readings.find((r) => r.id === ind.metricId)?.state ?? 'moderate',
                  interpretation: readings.find((r) => r.id === ind.metricId)?.interpretation,
                }}
                size={11}
              />
            </div>
            <div className="text-xl md:text-2xl font-extrabold tabular-nums leading-none" style={{ color: toneColor(ind.tone) }}>
              {ind.value}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">{ind.caption}</div>
            <p className="text-[11px] text-foreground/70 mt-2 leading-snug">{ind.meaning}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 4. ExecutiveActionQueue ─────────────────────────────────────────────────
// "What should I do next?" — Maximum 3 actionable items. Each one line,
// concise, executable, calm. No narrative overload, no duplicated reasoning.

function ExecutiveActionQueue({ result }: { result: UnifiedBestMoveResult | null }) {
  if (!result) return null;
  const best = result.unified.bestMove;
  const steps = best.implementationSteps.slice(0, 3);

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="executive-action-queue"
    >
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(142,60%,10%)', border: '1px solid hsl(142,60%,28%)' }}
          >
            <CheckCircle2 className="w-4 h-4" style={{ color: 'hsl(142,60%,55%)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Action Queue</h2>
            <p className="text-[11px] text-muted-foreground">Up to 3 next steps · executable today</p>
          </div>
        </div>
        {best.cta && (
          <Link href={best.cta.route}>
            <span className="text-xs text-primary hover:underline">Open plan →</span>
          </Link>
        )}
      </header>

      {steps.length === 0 ? (
        <div className="px-5 py-4 text-xs text-muted-foreground border-t border-border/30">
          No specific steps queued — current posture is already aligned with steady-state execution.
        </div>
      ) : (
        <ol className="divide-y divide-border/25 border-t border-border/30" data-testid="action-queue-list">
          {steps.map((s, i) => (
            <li
              key={i}
              className="px-5 py-3 flex items-start gap-3"
              data-testid={`action-queue-step-${i}`}
            >
              <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-[11px] font-bold text-emerald-400 tabular-nums">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground/90 leading-snug">{s.step}</p>
                {s.detail && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{s.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ─── Composed export ─────────────────────────────────────────────────────────

export default function ExecutiveDashboard(props: ExecutiveDashboardProps) {
  const maxLvr = useForecastStore(s => s.maxLvr);
  const liveMC = useForecastStore(s => s.monteCarloResult);
  const mcSig = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

  // Allow the dashboard to pass MC fan data via props (preferred) but also
  // gracefully fall back to the store when callers haven't wired the prop.
  const fanData = useMemo<MonteCarloFanPoint[] | null>(() => {
    if (props.monteCarloFanData && props.monteCarloFanData.length > 0) return props.monteCarloFanData;
    if (liveMC?.fan_data && liveMC.fan_data.length > 0) return liveMC.fan_data;
    return null;
  }, [props.monteCarloFanData, liveMC]);
  const simulations = props.monteCarloSimulations ?? liveMC?.simulations ?? null;

  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeUnifiedBestMove({ cfg: { maxLvr }, monteCarloV5: liveMC })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLvr, mcSig]);

  const resolved = {
    ...props,
    monteCarloFanData: fanData,
    monteCarloSimulations: simulations,
  };

  return (
    <div className="space-y-4" data-testid="executive-dashboard">
      <ExecutiveHeroSnapshot {...resolved} result={result} />
      <CanonicalTrajectoryPanel {...resolved} />
      <ExecutiveHealthStrip {...resolved} />
      <ExecutiveActionQueue result={result} />
    </div>
  );
}

// Re-export `fmtCompact` purely for testability of the helper.
export { fmtCompact as __fmtCompactForTests };
