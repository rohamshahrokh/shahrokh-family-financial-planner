/**
 * ExecutiveDashboard.tsx — FWL Executive Overview FINAL Reconciliation Pass
 *
 * The Executive Overview is the family cockpit. It restores visual intelligence
 * and operational identity without returning to clutter, duplicated analytics
 * or repeated recommendation systems. The information architecture is:
 *
 *     1. Hero Snapshot               → Net Worth · Surplus · Risk · FIRE · 1 Best Move
 *     2. Monte Carlo Trajectory      → MAIN future visual anchor (P10/P50/P90 band)
 *     3. Compact Projection Table    → Year · P50 · Confidence Range (P10/P90 expand)
 *     4. Deposit Power & Cashflow    → Liquidity / equity / tax-refund operational motion
 *     5. Financial Health            → Exactly four structural indicators
 *     6. Action Queue                → Maximum 3 actions, calm operational rhythm
 *     7. Deep Analysis Cards         → Four premium navigation cards (no chips)
 *
 * Source-of-truth invariants preserved:
 *   • Monte Carlo P50 is the ONLY canonical trajectory representation. The
 *     deterministic baseline is NEVER shown as the official trajectory; when
 *     MC has not run we render a refined pending state that keeps the chart
 *     area / identity and CTAs to the Forecast Engine.
 *   • Today snapshot reads live current values (snap.mortgage, snap.mortgage_rate)
 *     not future / blended forecast assumptions. The cockpit surfaces the live
 *     PPOR rate so the audience can see the "today" inputs unambiguously.
 *   • The Hero Best Move and the Action Queue both flow from the single
 *     `computeUnifiedBestMove` source — no parallel recommendation surfaces.
 *
 * Visual contract:
 *   • Dark navy/graphite cards · restrained gold for the primary signal ·
 *     cyan/green/purple intelligence accents for trajectory, health and
 *     deep-analysis surfaces. Premium, calm, institutional.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, TrendingDown, Shield, Sparkles, Activity, ArrowRight, ChevronDown, ChevronUp,
  Flame, Wallet, Layers, Target, CheckCircle2, BarChart2, Coins, Compass, Scale, Calculator,
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { useForecastStore } from '@/lib/forecastStore';
import { useAppStore } from '@/lib/store';
import { computeUnifiedBestMove, type UnifiedBestMoveResult } from '@/lib/recommendationEngine';
import { formatCurrency } from '@/lib/finance';
import { maskValue } from '@/components/PrivacyMask';
import { MetricExplainer } from '@/components/intelligence/MetricExplainer';
import { readMetric, getMetricExplanation, type MetricReading } from '@/lib/metricExplanations';
import type { MonteCarloFanPoint } from '@/lib/forecastStore';

// ─── Public props ────────────────────────────────────────────────────────────

export interface CashflowTrajectoryPoint {
  /** Year label, e.g. "2026". */
  label: string;
  /** End-of-year liquid cash balance (closing cash). */
  cashBalance: number;
  /** Net cashflow for the year (income − expenses − debt service − purchases). */
  netCashflow: number;
  /** Tax refund amount for the year (negative gearing benefit etc.). */
  taxRefund: number;
  /** Usable equity (PPOR + IP) — feeds deposit power readiness. */
  usableEquity: number;
  /** Total deposit power for the year (cash + usable equity − buffer). */
  totalDepositPower: number;
}

export interface ExecutiveDashboardProps {
  netWorth: number;
  surplus: number;
  totalLiquidCash: number;
  totalLiab: number;
  monthlyExpenses: number;
  passiveIncome: number;
  /** Deterministic 10y net worth — compatibility only, never rendered as primary. */
  year10NW: number;
  /** Canonical Monte Carlo P50 (median) net worth at the selected horizon. */
  trajectoryP50?: number | null;
  /** Year that `trajectoryP50` represents (e.g. 2035). */
  trajectoryYear?: number | null;
  fireProgressPct: number;
  fireCurrentAmt: number;
  fireTargetAmt: number;
  riskScore: number;
  riskLabel: string;
  monthlyDebtService: number;
  totalMortgage: number;
  totalPropertyValue: number;
  totalAssets: number;
  /** Live PPOR mortgage rate (%, e.g. 5.82). Surfaced in Hero "today" snapshot. */
  livePporRate?: number | null;
  /** Canonical Monte Carlo fan data — the only future trajectory representation. */
  monteCarloFanData?: MonteCarloFanPoint[] | null;
  monteCarloSimulations?: number | null;
  /** Annual cashflow / deposit-power trajectory (10y). */
  cashflowTrajectory?: CashflowTrajectoryPoint[] | null;
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

// Calm tooltip used by both Monte Carlo and Cashflow charts — institutional,
// no recharts default chrome.
function CalmChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-xl"
      style={{ borderColor: 'hsl(var(--border) / 0.7)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">{label}</p>
      {payload.map((row: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5" style={{ color: row.color ?? row.stroke ?? 'hsl(var(--foreground))' }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: row.color ?? row.stroke }} />
            {row.name}
          </span>
          <span className="tabular-nums font-mono text-foreground">{fmtCompact(row.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 1. ExecutiveHeroSnapshot ────────────────────────────────────────────────
// "Where am I now?" — Today snapshot. Live values only. No forecast / planned
// leverage. Net Worth · Monthly Surplus · Risk State · FIRE Timeline + 1 Best
// Move. The PPOR rate caption explicitly anchors the "today" reading.

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

  const fireYears: number | null = (() => {
    if (p.fireProgressPct >= 100) return 0;
    if (p.surplus <= 0 || p.fireTargetAmt <= 0) return null;
    const annualSavings = p.surplus * 12;
    const gap = Math.max(0, p.fireTargetAmt - p.fireCurrentAmt);
    if (gap <= 0) return 0;
    const naiveYears = gap / annualSavings;
    if (!Number.isFinite(naiveYears) || naiveYears <= 0) return null;
    return Math.round(naiveYears);
  })();

  const fireAge: number | null = fireYears !== null
    ? Math.round(40 + fireYears)
    : null;

  const best = p.result?.unified.bestMove;
  const liveRate = typeof p.livePporRate === 'number' && Number.isFinite(p.livePporRate)
    ? p.livePporRate.toFixed(2)
    : null;

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: 'hsl(var(--gold-dim) / 0.35)',
        background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-surface) / 0.30) 100%)',
      }}
      data-testid="executive-hero-snapshot"
    >
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(var(--gold-surface))', border: '1px solid hsl(var(--gold-dim) / 0.5)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'hsl(var(--gold))' }} />
          </div>
          <div>
            <h1 className="text-[11px] uppercase tracking-widest font-bold" style={{ color: 'hsl(var(--gold))' }}>
              Executive Overview
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Today snapshot · live current values
              {liveRate ? ` · PPOR ${liveRate}%` : ''}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-border/25 border-t border-border/30">
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

// ─── 2. MonteCarloTrajectoryChart ────────────────────────────────────────────
// The main future visual anchor on the cockpit. A calm P10/P50/P90 confidence
// band — institutional, premium, dominant. No trading-terminal chrome.

function MonteCarloTrajectoryChart(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

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
      data-testid="monte-carlo-trajectory-chart"
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
            <p className="text-[11px] text-muted-foreground">Monte Carlo · canonical forecast · P10 / P50 / P90 band</p>
          </div>
        </div>
        <Link href="/ai-forecast-engine">
          <span className="text-xs text-primary hover:underline">Open Forecast Engine →</span>
        </Link>
      </header>

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

      {/* Chart area — P10/P50/P90 fan. Calm, restrained chrome. */}
      <div className="px-2 pb-3 border-t border-border/30 pt-2" data-testid="trajectory-chart-area">
        {hasMc ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={fan!} margin={{ top: 12, right: 18, left: 0, bottom: 6 }}>
              <defs>
                <linearGradient id="mcConfidence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="hsl(280,80%,68%)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(280,80%,68%)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.35)" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
              />
              <YAxis
                tickFormatter={(v) => fmtCompact(v)}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<CalmChartTooltip />} cursor={{ stroke: 'hsl(280,80%,55%)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              {/* Confidence band rendered as P90 area minus P10 area — Recharts layers them stacked. */}
              <Area
                type="monotone"
                dataKey="p90"
                name="Bull · P90"
                stroke="hsl(142,60%,55%)"
                strokeWidth={1}
                fill="url(#mcConfidence)"
                fillOpacity={1}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="p10"
                name="Bear · P10"
                stroke="hsl(0,72%,60%)"
                strokeWidth={1}
                fill="hsl(var(--card))"
                fillOpacity={1}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="median"
                name="Median · P50"
                stroke="hsl(43,90%,60%)"
                strokeWidth={2.5}
                fill="none"
                isAnimationActive={false}
              />
              <ReferenceLine y={p.netWorth} stroke="hsl(var(--muted-foreground) / 0.5)" strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopLeft', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="h-48 mx-3 my-3 rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ borderColor: 'hsl(280,80%,28%)', background: 'hsl(280,80%,7%) / 0.25' }}
            data-testid="trajectory-chart-pending"
          >
            <Activity className="w-6 h-6 opacity-50" style={{ color: 'hsl(280,80%,68%)' }} />
            <p className="text-xs text-muted-foreground max-w-xs">
              The canonical Monte Carlo fan has not been computed yet. Open the Forecast Engine to run the simulation —
              the deterministic baseline is not displayed here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 3. CompactProjectionTable ───────────────────────────────────────────────
// Year · P50 · Confidence Range (P10/P90 columns behind expand).

function CompactProjectionTable(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const [expandedRange, setExpandedRange] = useState(false);
  const fan = p.monteCarloFanData;
  if (!fan || fan.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="canonical-trajectory-panel"
    >
      <header className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2 border-b border-border/30">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            Projection Table
            <MetricExplainer metricId="p10-p50-p90" size={11} />
          </h2>
          <p className="text-[11px] text-muted-foreground">Year-by-year Monte Carlo · canonical fan</p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {p.monteCarloSimulations
            ? `${p.monteCarloSimulations.toLocaleString()} simulations`
            : 'Canonical forecast'}
        </span>
      </header>
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
            {fan.map((row, idx) => {
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
      </div>
    </section>
  );
}

// ─── 4. DepositPowerTrajectoryPanel ──────────────────────────────────────────
// "Where does our operational financial motion go?" — annual cashflow combo
// chart with cash balance trajectory, net cashflow bars, and tax refund as a
// dedicated channel. Premium, calm, institutional.

function DepositPowerTrajectoryPanel(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const data = p.cashflowTrajectory;
  const hasData = !!data && data.length > 0;

  const todayPower = hasData ? data![0].totalDepositPower : 0;
  const yr5Power   = hasData && data!.length >= 5 ? data![4].totalDepositPower : null;

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="deposit-power-trajectory-panel"
    >
      <header className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(188,60%,10%)', border: '1px solid hsl(188,60%,28%)' }}
          >
            <BarChart2 className="w-4 h-4" style={{ color: 'hsl(188,60%,65%)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Deposit Power &amp; Cashflow
              <MetricExplainer metricId="cashflow-resilience" size={11} />
            </h2>
            <p className="text-[11px] text-muted-foreground">Annual liquidity · net cashflow · tax refund</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Today</span>
            <span className="tabular-nums font-mono" style={{ color: 'hsl(188,60%,72%)' }} data-testid="deposit-power-today">
              {mv(formatCurrency(todayPower, true))}
            </span>
          </div>
          {yr5Power !== null && (
            <>
              <div className="w-px h-7 bg-border/40" />
              <div className="flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">5 yr</span>
                <span className="tabular-nums font-mono" style={{ color: 'hsl(142,60%,60%)' }} data-testid="deposit-power-5yr">
                  {mv(formatCurrency(yr5Power, true))}
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="px-2 py-3" data-testid="deposit-power-chart-area">
        {hasData ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data!} margin={{ top: 12, right: 18, left: 0, bottom: 6 }}>
              <defs>
                <linearGradient id="dpCashFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="hsl(188,60%,55%)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(188,60%,55%)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.35)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border) / 0.6)' }}
              />
              <YAxis
                tickFormatter={(v) => fmtCompact(v)}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<CalmChartTooltip />} cursor={{ stroke: 'hsl(188,60%,55%)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Bar dataKey="netCashflow" name="Net Cashflow" fill="hsl(210,80%,55%)" fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} barSize={14} />
              <Bar dataKey="taxRefund" name="Tax Refund" fill="hsl(43,90%,58%)" fillOpacity={0.85} radius={[3, 3, 0, 0]} isAnimationActive={false} barSize={10} />
              <Area type="monotone" dataKey="cashBalance" name="Cash Balance" stroke="hsl(188,60%,65%)" strokeWidth={2.5} fill="url(#dpCashFill)" fillOpacity={1} isAnimationActive={false} />
              <Line type="monotone" dataKey="totalDepositPower" name="Deposit Power" stroke="hsl(142,60%,55%)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine y={0} stroke="hsl(var(--border) / 0.6)" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="h-48 mx-3 my-3 rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ borderColor: 'hsl(188,60%,28%)', background: 'hsl(188,60%,7%) / 0.2' }}
            data-testid="deposit-power-pending"
          >
            <BarChart2 className="w-6 h-6 opacity-50" style={{ color: 'hsl(188,60%,65%)' }} />
            <p className="text-xs text-muted-foreground max-w-xs">
              Cashflow trajectory will populate once snapshot, expenses and forecast inputs are available.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 5. ExecutiveHealthStrip ─────────────────────────────────────────────────
// Exactly four structural indicators: Liquidity · Leverage · Cashflow · FIRE.
// Restored separator weight, clearer hierarchy, stronger card rhythm.

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

function toneSurface(tone: HealthIndicator['tone']): string {
  return tone === 'healthy' ? 'hsl(142,60%,10%)' : tone === 'caution' ? 'hsl(43,90%,10%)' : 'hsl(0,72%,10%)';
}

function ExecutiveHealthStrip(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const liquidityMonths = p.monthlyExpenses > 0 ? p.totalLiquidCash / p.monthlyExpenses : 0;
  const leveragePct = p.totalAssets > 0 ? (p.totalLiab / p.totalAssets) * 100 : 0;
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
      <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-border/30">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3">
        {indicators.map((ind) => (
          <div
            key={ind.label}
            className="rounded-xl border p-4 flex flex-col gap-2 transition-colors"
            style={{
              borderColor: `${toneColor(ind.tone)} / 0.28`.replace(' / ', ' / '),
              borderWidth: 1,
              background: `linear-gradient(135deg, hsl(var(--card)) 0%, ${toneSurface(ind.tone)} 100%)`,
            }}
            data-testid={`health-${ind.metricId}`}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md"
                  style={{ background: toneSurface(ind.tone), border: `1px solid ${toneColor(ind.tone)}` }}
                >
                  <ind.Icon className="w-3 h-3" />
                </span>
                {ind.label}
              </span>
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
                size={12}
              />
            </div>
            <div className="text-2xl md:text-[28px] font-extrabold tabular-nums leading-none" style={{ color: toneColor(ind.tone) }}>
              {ind.value}
            </div>
            <div className="text-[10px] text-muted-foreground">{ind.caption}</div>
            <p className="text-[11px] text-foreground/75 leading-snug mt-1">{ind.meaning}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 6. ExecutiveActionQueue ─────────────────────────────────────────────────
// Maximum 3 actions. Tighter padding, calm rhythm.

function ExecutiveActionQueue({ result }: { result: UnifiedBestMoveResult | null }) {
  if (!result) return null;
  const best = result.unified.bestMove;
  const steps = best.implementationSteps.slice(0, 3);

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="executive-action-queue"
    >
      <header className="px-5 pt-4 pb-2.5 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(142,60%,10%)', border: '1px solid hsl(142,60%,28%)' }}
          >
            <CheckCircle2 className="w-4 h-4" style={{ color: 'hsl(142,60%,55%)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Action Queue</h2>
            <p className="text-[10px] text-muted-foreground">Up to 3 next steps</p>
          </div>
        </div>
        {best.cta && (
          <Link href={best.cta.route}>
            <span className="text-xs text-primary hover:underline">Open plan →</span>
          </Link>
        )}
      </header>

      {steps.length === 0 ? (
        <div className="px-5 py-3 text-xs text-muted-foreground">
          No specific steps queued — current posture is already aligned with steady-state execution.
        </div>
      ) : (
        <ol className="divide-y divide-border/25" data-testid="action-queue-list">
          {steps.map((s, i) => (
            <li
              key={i}
              className="px-5 py-2.5 flex items-start gap-3"
              data-testid={`action-queue-step-${i}`}
            >
              <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold text-emerald-400 tabular-nums">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-foreground/90 leading-snug">{s.step}</p>
                {s.detail && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{s.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ─── 7. DeepAnalysisCards ────────────────────────────────────────────────────
// Four premium navigation cards. Replaces the weak filter chips. Each card
// owns: icon · short label · one-line description · arrow CTA.

interface DeepAnalysisCardConfig {
  id: string;
  label: string;
  description: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
  surface: string;
}

const DEEP_ANALYSIS_CARDS: DeepAnalysisCardConfig[] = [
  {
    id: 'forecast-engine',
    label: 'Forecast Engine',
    description: 'Monte Carlo, Year-by-Year & future-worlds scenarios.',
    href: '/ai-forecast-engine',
    Icon: Compass,
    accent: 'hsl(280,80%,68%)',
    surface: 'hsl(280,80%,10%)',
  },
  {
    id: 'risk-radar',
    label: 'Risk Radar',
    description: 'Macro, liquidity, leverage & sequence-of-returns signals.',
    href: '/risk-radar',
    Icon: Scale,
    accent: 'hsl(0,72%,65%)',
    surface: 'hsl(0,72%,10%)',
  },
  {
    id: 'decision-engine',
    label: 'Decision Engine',
    description: 'Trade-offs, allocation moves & next-action ranking.',
    href: '/decision',
    Icon: Coins,
    accent: 'hsl(43,90%,60%)',
    surface: 'hsl(43,90%,10%)',
  },
  {
    id: 'tax-strategy',
    label: 'Tax Strategy',
    description: 'Tax alpha, negative gearing, CGT timing & franking.',
    href: '/tax-alpha',
    Icon: Calculator,
    accent: 'hsl(142,60%,60%)',
    surface: 'hsl(142,60%,10%)',
  },
];

export function DeepAnalysisCards() {
  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="deep-analysis-cards"
      aria-label="Deep Analysis"
    >
      <header className="px-5 pt-4 pb-2.5 border-b border-border/30">
        <h2 className="text-sm font-bold text-foreground">Deep Analysis</h2>
        <p className="text-[11px] text-muted-foreground">Premium analytical surfaces</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3">
        {DEEP_ANALYSIS_CARDS.map((c) => (
          <Link key={c.id} href={c.href}>
            <div
              className="group cursor-pointer rounded-xl border p-4 flex flex-col gap-2 h-full hover:border-primary/50 transition-all hover:translate-y-[-1px]"
              style={{
                borderColor: `${c.accent}40`,
                background: `linear-gradient(135deg, hsl(var(--card)) 0%, ${c.surface} 100%)`,
              }}
              data-testid={`deep-analysis-card-${c.id}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
                  style={{ background: c.surface, border: `1px solid ${c.accent}55` }}
                >
                  <c.Icon className="w-4 h-4" />
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-foreground mt-1" style={{ color: c.accent }}>
                {c.label}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {c.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Composed export ─────────────────────────────────────────────────────────

export default function ExecutiveDashboard(props: ExecutiveDashboardProps) {
  const maxLvr = useForecastStore(s => s.maxLvr);
  const liveMC = useForecastStore(s => s.monteCarloResult);
  const mcSig = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

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
      <MonteCarloTrajectoryChart {...resolved} />
      <CompactProjectionTable {...resolved} />
      <DepositPowerTrajectoryPanel {...resolved} />
      <ExecutiveHealthStrip {...resolved} />
      <ExecutiveActionQueue result={result} />
      <DeepAnalysisCards />
    </div>
  );
}

export { fmtCompact as __fmtCompactForTests };
