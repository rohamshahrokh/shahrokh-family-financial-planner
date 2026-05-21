/**
 * ExecutiveDashboard.tsx — FWL Executive Overview FINAL Reconciliation Pass
 *
 * The Executive Overview is the family cockpit. It restores visual intelligence
 * and operational identity without returning to clutter, duplicated analytics
 * or repeated recommendation systems. The information architecture is:
 *
 *     1. Hero Snapshot               → Net Worth · Surplus · Risk · FIRE · 1 Best Move
 *     2. Future Wealth Path          → Strategic future-wealth engine (Monte Carlo P10/P50/P90)
 *     3. Compact Projection Table    → Year · P50 · Confidence Range (P10/P90 expand)
 *     4. Plan Execution Capacity     → Operational execution engine (liquidity · deposit power · cashflow)
 *     5. Financial Health            → Exactly four structural indicators
 *     6. Action Queue                → Maximum 3 actions, calm operational rhythm
 *     7. Deep Analysis Cards         → Four premium navigation cards (no chips)
 *
 * Visual hierarchy contract:
 *   • Future Wealth Path is the dashboard hero — large, aspirational, premium.
 *   • Plan Execution Capacity is operational/tactical — compact, grounded, secondary.
 *   • Together they form one strategic future engine + one operational execution engine.
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
  TrendingUp, TrendingDown, Shield, Sparkles, Activity, ArrowRight,
  Flame, Wallet, Layers, Target, CheckCircle2, BarChart2, Coins, Compass, Scale, Calculator,
  DollarSign, Unlock, Lock,
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Bar, Line, LineChart, XAxis, YAxis, Cell,
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
import WealthDecisionCenter from '@/components/WealthDecisionCenter';
import ProjectionCardListMobile from '@/components/ProjectionCardListMobile';
import type { CanonicalRiskSurface as CanonicalRiskSurfaceData } from '@/lib/canonicalRiskSurface';
import type { WealthLayers } from '@/lib/canonicalWealth';

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

/** Mini summary metrics surfaced above the Deposit Power & Cashflow chart. */
export interface DepositPowerSummary {
  pporLvrPct?: number | null;
  ipReadinessPct?: number | null;
  annualNetCashflow?: number | null;
  taxRefundPerYear?: number | null;
  cashToday?: number | null;
  readyNow?: boolean | null;
  totalDepositPower?: number | null;
  isEquityRichCashPoor?: boolean | null;
  /** Live Cash + Offset (single liquidity line below the readiness summary). */
  cashAndOffset?: number | null;
  /** Last-year cash (e.g. "2035 Cash") — read from end of cashflow series. */
  finalYearCash?: number | null;
  finalYearLabel?: string | null;
  /** PPOR usable equity (80% of value − mortgage), used in the breakdown table. */
  pporUsableEquity?: number | null;
  /** IP usable equity across settled IPs (80% of value − loan), breakdown table. */
  ipUsableEquity?: number | null;
  /** Gross total (cash + offset + PPOR equity + IP equity), pre-buffer deduction. */
  grossTotal?: number | null;
  /** Emergency buffer applied to the deposit power calculation. */
  emergencyBuffer?: number | null;
}

/** A single planned-roadmap event surfaced inside the Events tab timeline. */
export interface RoadmapEvent {
  id: string;
  /** Year marker for the timeline (e.g. "2026", "2027 Q3"). */
  year: string;
  /** "deposit-build" | "ip-purchase" | "stock-dca" | "crypto-buy" | "refinance" | "debt-reduction" | "fire-target" | etc. */
  kind: string;
  title: string;
  description: string;
  /** Planned dollar figure attached to the event (deposit, loan, allocation). */
  amount?: number | null;
  /** Free-text amount label (e.g. "Plan loan $720K @ 80% LVR"). */
  amountLabel?: string | null;
  status: 'planned' | 'active' | 'completed';
}

export type CashflowChartMode = 'combo' | 'line' | 'candlestick';
export type CashflowViewMode = 'cash' | 'equity' | 'deposit';
export type CashflowGranularity = 'annual' | 'monthly';
export type NgRefundMode = 'lump-sum' | 'payg';

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
  /** Annual cashflow / deposit-power trajectory (10y, condensed). */
  cashflowTrajectory?: CashflowTrajectoryPoint[] | null;
  /** Full canonical master cashflow data (annual or monthly per granularity). */
  cashflowMaster?: any[] | null;
  /** Master granularity in current state. */
  cashflowGranularity?: CashflowGranularity;
  setCashflowGranularity?: (g: CashflowGranularity) => void;
  /** Refund mode controls negative-gearing refund spread. */
  ngRefundMode?: NgRefundMode;
  setNgRefundMode?: (m: NgRefundMode) => void;
  /** Chart mode toggle (Combo / Line / Candlestick). */
  cashflowChartMode?: CashflowChartMode;
  setCashflowChartMode?: (m: CashflowChartMode) => void;
  /** Series view mode (Cash / Equity / Deposit Power). */
  cashflowViewMode?: CashflowViewMode;
  setCashflowViewMode?: (m: CashflowViewMode) => void;
  /** Mini summary metrics above the Deposit Power & Cashflow chart. */
  depositPowerSummary?: DepositPowerSummary | null;
  /**
   * Planned-roadmap events for the EVENTS tab in the Wealth Decision Center.
   * When omitted, the WDC derives a minimal deterministic roadmap from the
   * snapshot (deposit-build, IP buys, DCA, FIRE target).
   */
  roadmapEvents?: RoadmapEvent[] | null;
  /**
   * CURRENT debt breakdown for the Today snapshot context. Must include ONLY
   * settled liabilities (PPOR mortgage + settled IP loans + other debts).
   * Never include planned IP loans, forecast leverage, or Monte Carlo debt.
   */
  currentDebt?: {
    pporMortgage: number;
    settledIpLoans: number;
    otherDebts: number;
    total: number;
  } | null;
  /**
   * PLANNED debt (sum of future / not-yet-settled liabilities). Surfaced ONLY
   * inside the Events / Forecast tabs, never in Today snapshot.
   */
  plannedDebt?: number | null;
  /**
   * Canonical year-by-year wealth projection rows (10 years). Used by the
   * Strategic Wealth Projection panel as the single richer analytical table.
   * Sourced from `projectNetWorth` in /lib/finance — same engine the Wealth
   * Strategy hub uses. Avoids fabricating column values.
   */
  projectionRows?: WealthProjectionRow[] | null;
  /**
   * Live planned property acquisitions (rows with contract / settlement /
   * purchase date in the future). The Events tab Timeline derives IP2 /
   * IP3 year markers from THIS list — never from a static +3y assumption —
   * so the timeline always reflects the actual property plan. Required by
   * FWL_TAX_REFORM_INTEGRITY_FIX.
   */
  plannedAcquisitions?: Array<{
    id?: number | string;
    name?: string;
    contract_date?: string | null;
    settlement_date?: string | null;
    purchase_date?: string | null;
    purchase_price?: number | null;
    property_type?: string | null;
    type?: string | null;
  }> | null;

  /**
   * FOLLOW_UP: explicit roadmap-derived second IP year. Used as the IP2
   * fallback when `plannedAcquisitions` has fewer than 2 entries (e.g. the
   * live demo only has 1 IP row in /api/properties). Sourced from the
   * execution roadmap / fire-scenario `ip_target_year` field by the host
   * page so the EVENTS tab still surfaces the Second IP year the engine
   * knows about — never a static +3y guess.
   */
  roadmapSecondIpYear?: number | null;

  // ─── Canonical dashboard/risk architecture ─────────────────────────────────
  /** Four canonical wealth layers (Gross / Accessible / Liquidatable / FIRE). */
  wealthLayers?: WealthLayers | null;
  /** 8-axis radar + stress matrix + FIRE fragility — Risk tab consumes this. */
  riskSurface?: CanonicalRiskSurfaceData | null;
  /** Active tax scenario flowing through every widget on this dashboard. */
  activeScenario?: 'current_law' | 'proposed_reform' | 'custom';
}

/**
 * Decision-grade yearly progression row consumed by the Strategic Wealth
 * Projection table. Each field maps 1:1 to a column header in the UI.
 */
export interface WealthProjectionRow {
  year: number;
  accessibleNetWorth: number;
  totalNetWorth: number;
  cagrPct: number;
  growth: number;
  cash: number;
  liabilities: number;
  propertyEquity: number;
  stocks: number;
  crypto: number;
  superTotal: number;
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
// Probabilistic Projection (Monte Carlo Adjusted). P10/P50/P90 confidence band
// with shaded confidence area, smooth spline lines, year-focus vertical marker,
// dynamic legend, institutional grid. The deterministic projection above has
// a separate clearly-labelled section; this is the probabilistic surface only.

const PROBABILISTIC_EXPLANATION = 'This model includes uncertainty, volatility, sequencing risk, and tax-adjusted liquidation effects.';

function MonteCarloTrajectoryChart(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const fan = p.monteCarloFanData;
  const hasMc = !!fan && fan.length > 0;
  const hasMcTrajectory = typeof p.trajectoryP50 === 'number' && Number.isFinite(p.trajectoryP50);
  const traj = hasMcTrajectory
    ? trajectoryFromGrowth(p.netWorth, p.trajectoryP50 as number)
    : { pct: 0, label: 'Monte Carlo pending' };
  const focusYear = hasMcTrajectory && p.trajectoryYear ? p.trajectoryYear : null;
  const trajectoryYearLabel = focusYear
    ? `${focusYear} P50`
    : `${new Date().getFullYear() + 9} horizon`;

  // Composite series — feeds the band as p90 minus p10 so recharts can render
  // the shaded confidence area natively without stacked layering tricks.
  const series = useMemo(() => {
    if (!fan || fan.length === 0) return [] as any[];
    return fan.map(row => ({
      year: row.year,
      p10:    row.p10,
      median: row.median,
      p90:    row.p90,
      // Band lower edge as p10, shaded span as (p90 − p10) used by the
      // confidence area stack for visual depth.
      bandBase: row.p10,
      bandSpan: Math.max(0, row.p90 - row.p10),
    }));
  }, [fan]);

  const finalRow = fan && fan.length > 0 ? fan[fan.length - 1] : null;

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="monte-carlo-trajectory-chart"
      aria-label="Probabilistic Projection (Monte Carlo Adjusted)"
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
            <h2 className="text-base md:text-lg font-bold text-foreground flex items-center gap-1.5" data-testid="probabilistic-projection-title">
              Probabilistic Projection (Monte Carlo Adjusted)
              <MetricExplainer metricId="monte-carlo-probability" size={11} />
            </h2>
            <p className="text-[11px] text-muted-foreground" data-testid="probabilistic-projection-explanation">
              {PROBABILISTIC_EXPLANATION}
            </p>
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

      {/* Chart area — P10/P50/P90 fan. Shaded confidence band, smooth spline,
          year-focus marker, dynamic legend. */}
      <div className="px-2 pb-4 border-t border-border/30 pt-3" data-testid="trajectory-chart-area">
        {hasMc ? (
          <>
          <ResponsiveContainer width="100%" height={340} minHeight={300}>
            <AreaChart data={series} margin={{ top: 14, right: 18, left: 0, bottom: 6 }}>
              <defs>
                <linearGradient id="mcConfidenceBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="hsl(280,80%,68%)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(280,80%,68%)" stopOpacity={0.06} />
                </linearGradient>
                <linearGradient id="mcP90Stroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="hsl(142,60%,55%)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(142,60%,55%)" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="mcP10Stroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="hsl(0,72%,60%)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(0,72%,60%)" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.32)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border) / 0.5)' }}
                interval={0}
              />
              <YAxis
                tickFormatter={(v) => fmtCompact(v)}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={58}
              />
              <Tooltip content={<CalmChartTooltip />} cursor={{ stroke: 'hsl(280,80%,55%)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              {/* Shaded confidence band: stacked invisible base + visible span. */}
              <Area
                type="monotone"
                dataKey="bandBase"
                stackId="confidence"
                stroke="none"
                fill="transparent"
                fillOpacity={0}
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="bandSpan"
                stackId="confidence"
                name="P10 – P90 band"
                stroke="hsl(280,80%,60%)"
                strokeWidth={0}
                fill="url(#mcConfidenceBand)"
                fillOpacity={1}
                isAnimationActive={false}
              />
              {/* P90 bull line — smooth spline */}
              <Area
                type="monotone"
                dataKey="p90"
                name="Bull · P90"
                stroke="url(#mcP90Stroke)"
                strokeWidth={1.4}
                fill="transparent"
                isAnimationActive={false}
                dot={false}
              />
              {/* P10 bear line — smooth spline */}
              <Area
                type="monotone"
                dataKey="p10"
                name="Bear · P10"
                stroke="url(#mcP10Stroke)"
                strokeWidth={1.4}
                fill="transparent"
                isAnimationActive={false}
                dot={false}
              />
              {/* P50 median — bold institutional gold */}
              <Area
                type="monotone"
                dataKey="median"
                name="Median · P50"
                stroke="hsl(43,90%,60%)"
                strokeWidth={2.6}
                fill="none"
                isAnimationActive={false}
                dot={{ r: 2, fill: 'hsl(43,90%,60%)', stroke: 'hsl(43,90%,60%)' }}
                activeDot={{ r: 4.5, fill: 'hsl(43,90%,60%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
              <ReferenceLine
                y={p.netWorth}
                stroke="hsl(var(--muted-foreground) / 0.45)"
                strokeDasharray="2 3"
                label={{ value: `Today · ${fmtCompact(p.netWorth)}`, position: 'insideTopLeft', fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
              />
              {focusYear && (
                <ReferenceLine
                  x={focusYear}
                  stroke="hsl(43,90%,55%)"
                  strokeDasharray="4 3"
                  strokeOpacity={0.55}
                  label={{ value: `${focusYear} focus`, position: 'top', fontSize: 9, fill: 'hsl(43,90%,55%)', fontWeight: 700 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>

          {/* Dynamic legend — colour-keyed to the series with live final-row values. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 pt-3 pb-1 border-t border-border/25 mt-1">
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(43,90%,62%)' }}>
              <span className="inline-block w-6 h-0.5 rounded" style={{ background: 'hsl(43,90%,60%)' }} />
              Median · P50
              {finalRow && <span className="opacity-70 ml-1 tabular-nums font-mono">{mv(formatCurrency(finalRow.median, true))}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(142,60%,55%)' }}>
              <span className="inline-block w-6 h-0.5 rounded" style={{ background: 'hsl(142,60%,55%)' }} />
              Bull · P90
              {finalRow && <span className="opacity-70 ml-1 tabular-nums font-mono">{mv(formatCurrency(finalRow.p90, true))}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(0,72%,60%)' }}>
              <span className="inline-block w-6 h-0.5 rounded" style={{ background: 'hsl(0,72%,60%)' }} />
              Bear · P10
              {finalRow && <span className="opacity-70 ml-1 tabular-nums font-mono">{mv(formatCurrency(finalRow.p10, true))}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-block w-4 h-2 rounded-sm" style={{ background: 'hsl(280,80%,60% / 0.25)', border: '1px solid hsl(280,80%,60% / 0.45)' }} />
              Confidence band
            </div>
            <div className="ml-auto text-[10px] text-muted-foreground">
              {p.monteCarloSimulations
                ? `${p.monteCarloSimulations.toLocaleString()} sims · canonical engine`
                : 'Canonical engine'}
            </div>
          </div>
          </>
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

// ─── 3. WealthProjectionTable ────────────────────────────────────────────────
// Richer decision-grade year-by-year analytical table. Columns surface the
// canonical projection breakdown (Accessible NW, Total NW, CAGR, Growth, Cash,
// Liabilities, Property equity, Stocks, Crypto, Super). Sourced from the same
// `projectNetWorth` engine the Wealth Strategy hub uses — no parallel maths.
//
// Replaces the prior CompactProjectionTable (Year · P50 · Confidence Range)
// which duplicated the Monte Carlo fan. The fan chart above already carries
// the probabilistic story; this table carries the deterministic asset-mix
// progression decision-makers need.

function WealthProjectionTable(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const rows = p.projectionRows;
  if (!rows || rows.length === 0) {
    return (
      <section
        className="rounded-2xl border border-border bg-card overflow-hidden"
        data-testid="wealth-projection-table-panel"
        aria-label="Deterministic Projection (Assumption-Based)"
      >
        <header className="px-5 pt-4 pb-3 border-b border-border/30">
          <h2 className="text-sm font-bold text-foreground">Deterministic Projection (Assumption-Based)</h2>
          <p className="text-[11px] text-muted-foreground">Year-by-year canonical asset breakdown · Total NW · Accessible NW · Liquid · Property · Super · Debt · CAGR</p>
        </header>
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Projection data is not yet available. Open the snapshot to populate it.
        </div>
      </section>
    );
  }

  // CAGR from today → final row (Total NW).
  const startNW = p.netWorth;
  const finalRow = rows[rows.length - 1];
  const cagrYears = finalRow.year - new Date().getFullYear();
  const cagrFinal =
    startNW > 0 && cagrYears > 0
      ? (Math.pow(finalRow.totalNetWorth / startNW, 1 / cagrYears) - 1) * 100
      : 0;

  // Canonical wealth layers (Gross / Accessible / Liquidatable / FIRE).
  const layers = p.wealthLayers ?? null;

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="wealth-projection-table-panel"
      aria-label="Deterministic Projection (Assumption-Based)"
    >
      <header className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2 border-b border-border/30">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5" data-testid="deterministic-projection-title">
            Deterministic Projection (Assumption-Based)
            <MetricExplainer metricId="net-worth-reconciliation" size={11} />
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Single assumption set · Total NW · Accessible NW · Liquid Capital · Property Equity · Super · Debt · CAGR
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums" data-testid="deterministic-projection-cagr">
          CAGR {cagrFinal.toFixed(2)}% · {cagrYears} yr
        </span>
      </header>

      {/* Four canonical wealth layers — single source of truth used by every
          surface on this page. Mobile: 2×2 metric grid. Desktop (md+): 1×4. */}
      {layers && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-border/25 border-b border-border/30"
          data-testid="wealth-layers-strip"
        >
          {[
            { id: 'gross', label: 'Gross Net Worth', value: layers.grossNetWorth, blurb: 'Raw assets − debt' },
            { id: 'accessible', label: 'Accessible NW', value: layers.accessibleNetWorth, blurb: 'Excludes super / Iran property / cars' },
            { id: 'liquidatable', label: 'Liquidatable Wealth', value: layers.liquidatableWealth, blurb: 'After ~3.5% property selling cost' },
            { id: 'fire', label: 'FIRE Capital', value: layers.fireCapital, blurb: 'Post-CGT · post-regime drag' },
          ].map((layer, i) => (
            <div
              key={layer.id}
              className={
                // Mobile: 2×2 grid with per-cell borders so rows/cols separate cleanly.
                // Desktop (md+): dividers come from the row-level `md:divide-x`.
                `px-4 py-3 ` +
                `${i % 2 === 0 ? 'border-r border-border/25 md:border-r-0' : ''} ` +
                `${i < 2 ? 'border-b border-border/25 md:border-b-0' : ''}`
              }
              data-testid={`wealth-layer-${layer.id}`}
            >
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{layer.label}</p>
              <p className="text-lg font-extrabold tabular-nums leading-tight mt-1" style={{ color: 'hsl(var(--gold))' }} data-testid={`wealth-layer-${layer.id}-value`}>
                {mv(formatCurrency(layer.value, true))}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{layer.blurb}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mobile (<md): dedicated card-list experience — NOT a compressed
          table. Implemented as a separate component (ProjectionCardListMobile)
          that consumes the same canonical `projectionRows` + `wealthLayers`
          the desktop table reads. No parallel maths in that component. */}
      <div className="block md:hidden" data-testid="wealth-projection-mobile-wrapper">
        <ProjectionCardListMobile
          rows={rows}
          layers={layers}
          startNW={startNW}
        />
      </div>
      {/* Desktop (md+): original full-width analytical table, untouched. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs" data-testid="wealth-projection-table">
          <thead>
            <tr className="border-b border-border/40 bg-muted/10">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest">Year</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-accessible-nw">Accessible NW</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-total-nw">Total NW</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-cagr">CAGR</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-growth">Growth</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-cash">Cash</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-liabilities">Liabilities</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-property-equity">Property equity</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-stocks">Stocks</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-crypto">Crypto</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap text-[10px] uppercase tracking-widest" data-testid="col-super">Super</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.year}
                className={`border-b border-border/20 hover:bg-amber-500/[0.04] ${idx === 0 ? 'bg-amber-500/[0.03]' : ''}`}
                data-testid={`wealth-projection-row-${row.year}`}
              >
                <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">
                  {row.year}{idx === 0 ? ' ★' : ''}
                </td>
                <td className="px-3 py-2 font-mono font-bold tabular-nums whitespace-nowrap text-right" style={{ color: 'hsl(195,80%,68%)' }}>
                  {mv(formatCurrency(row.accessibleNetWorth, true))}
                </td>
                <td className="px-3 py-2 font-mono font-bold tabular-nums whitespace-nowrap text-right" style={{ color: 'hsl(43,90%,62%)' }}>
                  {mv(formatCurrency(row.totalNetWorth, true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right" style={{ color: row.cagrPct >= 0 ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}>
                  {row.cagrPct.toFixed(2)}%
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right" style={{ color: row.growth >= 0 ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}>
                  {row.growth >= 0 ? '+' : ''}{mv(formatCurrency(row.growth, true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right text-foreground">
                  {mv(formatCurrency(row.cash, true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right" style={{ color: 'hsl(0,72%,60%)' }}>
                  −{mv(formatCurrency(Math.abs(row.liabilities), true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right text-foreground">
                  {mv(formatCurrency(row.propertyEquity, true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right text-foreground">
                  {mv(formatCurrency(row.stocks, true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right text-foreground">
                  {mv(formatCurrency(row.crypto, true))}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-right text-foreground">
                  {mv(formatCurrency(row.superTotal, true))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2 border-t border-border/30 bg-muted/[0.04] text-[10px] text-muted-foreground">
        Accessible NW excludes Super · CAGR compounded from today · canonical projection engine
      </div>
    </section>
  );
}

// ─── 3b. ReconciliationCard ──────────────────────────────────────────────────
// Title required exactly: "Why are the numbers different?". Surfaces the
// deterministic NW vs Monte Carlo Median and decomposes the gap into
// transparent reconciliation drivers derived from canonical inputs (volatility
// adjustment, CGT/tax reform drag, liquidity discount, sequencing risk,
// interest-rate uncertainty). Drivers are labelled "reconciliation drivers,
// not engine outputs" because they are computed on top of canonical values
// rather than fetched from a parallel engine.

function ReconciliationCard(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const detRows = p.projectionRows ?? [];
  const finalDetYear = detRows[detRows.length - 1]?.year ?? null;
  const detFinalTotal = detRows[detRows.length - 1]?.totalNetWorth ?? null;

  const fan = p.monteCarloFanData ?? null;
  const finalFan = fan && fan.length > 0 ? fan[fan.length - 1] : null;
  const mcMedian = finalFan?.median ?? null;

  if (detFinalTotal == null || mcMedian == null || finalFan == null) {
    return (
      <section
        className="rounded-2xl border border-border bg-card overflow-hidden"
        data-testid="reconciliation-card"
      >
        <header className="px-5 pt-4 pb-3 border-b border-border/30">
          <h2 className="text-sm font-bold text-foreground" data-testid="reconciliation-card-title">
            Why are the numbers different?
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Once both projections are available, the reconciliation drivers appear here.
          </p>
        </header>
        <div className="px-5 py-6 text-xs text-muted-foreground text-center">
          Run the Monte Carlo simulation to compare it against the deterministic baseline.
        </div>
      </section>
    );
  }

  const delta = detFinalTotal - mcMedian; // positive when det > MC (typical)
  const layers = p.wealthLayers;
  const scenario = p.activeScenario ?? 'current_law';

  // Reconciliation drivers — computed from canonical inputs. These are
  // approximations layered on top of canonical values to explain the gap
  // visually, NOT raw engine outputs.
  const volatilityAdj = Math.abs(finalFan.p90 - finalFan.p10) * 0.18; // span of band
  const sequencingRisk = Math.max(0, mcMedian * 0.025);
  const interestRateUncertainty = Math.max(0, mcMedian * 0.02);
  const cgtDrag = layers?.drivers.cgtOnIp ?? 0;
  const liquidityDiscount = layers?.drivers.sellingCost ?? 0;
  const reformDrag = scenario === 'proposed_reform' ? (layers?.drivers.reformDrag ?? 0) : 0;
  const forcedSale = Math.max(0, (layers?.drivers.ipEquity ?? 0) * 0.015);

  const drivers: { id: string; label: string; value: number; tone: 'reduce' | 'increase' }[] = [
    { id: 'volatility', label: 'Market volatility adjustment', value: volatilityAdj, tone: 'reduce' },
    { id: 'cgt', label: scenario === 'proposed_reform' ? 'Tax reform / CGT drag' : 'CGT drag on IP liquidation', value: cgtDrag, tone: 'reduce' },
    { id: 'liquidity', label: 'Liquidity / selling-cost discount', value: liquidityDiscount, tone: 'reduce' },
    { id: 'forced-sale', label: 'Forced-sale assumption (1.5% of IP equity)', value: forcedSale, tone: 'reduce' },
    { id: 'sequencing', label: 'Sequencing risk', value: sequencingRisk, tone: 'reduce' },
    { id: 'rates', label: 'Interest-rate uncertainty', value: interestRateUncertainty, tone: 'reduce' },
  ];
  if (scenario === 'proposed_reform' && reformDrag > 0) {
    drivers.splice(1, 0, { id: 'reform', label: 'Reform regime drag (loss-bank quarantine)', value: reformDrag, tone: 'reduce' });
  }

  const reducingSum = drivers.reduce((s, d) => s + d.value, 0);
  const residual = delta - reducingSum;

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="reconciliation-card"
    >
      <header className="px-5 pt-4 pb-3 border-b border-border/30">
        <h2 className="text-sm font-bold text-foreground" data-testid="reconciliation-card-title">
          Why are the numbers different?
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Reconciliation drivers — derived from canonical wealth state, NOT engine outputs.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-0 divide-x divide-border/25 border-b border-border/30">
        <div className="px-4 py-3" data-testid="reconciliation-deterministic">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Deterministic · {finalDetYear}
          </p>
          <p className="text-xl font-extrabold tabular-nums leading-tight mt-1" style={{ color: 'hsl(43,90%,62%)' }}>
            {mv(formatCurrency(detFinalTotal, true))}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Assumption-based Total NW</p>
        </div>
        <div className="px-4 py-3" data-testid="reconciliation-mc-median">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Monte Carlo Median (P50) · {finalDetYear}
          </p>
          <p className="text-xl font-extrabold tabular-nums leading-tight mt-1" style={{ color: 'hsl(210,80%,68%)' }}>
            {mv(formatCurrency(mcMedian, true))}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Probabilistic median outcome</p>
        </div>
        <div className="px-4 py-3 col-span-2 md:col-span-1" data-testid="reconciliation-delta">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Difference (Det − MC)
          </p>
          <p
            className="text-xl font-extrabold tabular-nums leading-tight mt-1"
            style={{ color: delta >= 0 ? 'hsl(0,72%,62%)' : 'hsl(142,60%,55%)' }}
          >
            {delta >= 0 ? '+' : '−'}{mv(formatCurrency(Math.abs(delta), true))}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {delta >= 0 ? 'Deterministic above median — drivers below close the gap' : 'Median above deterministic — favourable variance'}
          </p>
        </div>
      </div>

      <ul
        className="divide-y divide-border/20"
        data-testid="reconciliation-drivers"
      >
        {drivers.map(d => (
          <li
            key={d.id}
            className="flex items-center justify-between px-5 py-2"
            data-testid={`reconciliation-driver-${d.id}`}
          >
            <span className="text-[11.5px] text-foreground/85">{d.label}</span>
            <span className="text-[11.5px] font-mono tabular-nums" style={{ color: 'hsl(0,72%,62%)' }}>
              −{mv(formatCurrency(d.value, true))}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between px-5 py-2 bg-muted/[0.04]" data-testid="reconciliation-driver-residual">
          <span className="text-[11.5px] text-muted-foreground italic">
            Residual (unexplained by drivers)
          </span>
          <span className="text-[11.5px] font-mono tabular-nums text-muted-foreground">
            {residual >= 0 ? '−' : '+'}{mv(formatCurrency(Math.abs(residual), true))}
          </span>
        </li>
      </ul>
      <p className="px-5 py-2 text-[10px] text-muted-foreground border-t border-border/30">
        Drivers are transparent reconciliation approximations layered on canonical inputs — they are not separate engine outputs. Active regime: {scenario === 'proposed_reform' ? 'Proposed 2027 Reform' : scenario === 'custom' ? 'Custom' : 'Current Law'}.
      </p>
    </section>
  );
}

// ─── 4. PlanExecutionCapacityPanel (DepositPowerTrajectoryPanel) ─────────────
// Operational execution engine — secondary to Future Wealth Path. Same canonical
// Deposit Power & Cashflow surface, but tightened spacing and ~25% smaller
// chart so the dashboard reads as "1 strategic engine + 1 operational engine"
// instead of two competing forecast widgets:
//   • Mini summary metrics row (PPOR LVR, IP readiness, annual net CF, tax
//     refund/year, cash today, ready-now state).
//   • Granularity (Annual / Monthly), Refund mode (Lump-sum / PAYG),
//     View mode (Cash / + Equity / Deposit Power) and Chart mode
//     (Combo / Line / Candlestick) toggles — exposed to the parent via
//     props so dashboard.tsx remains the canonical state owner.
//   • Blue cash balance line, green positive net CF bars, red negative net
//     CF bars, gold tax refund bars, yearly liquidity evolution.
//   • Dynamic legend, institutional grid, calm tooltip, responsive scaling.

function DepositPowerTrajectoryPanel(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  // Local state fallbacks so the panel works even if dashboard.tsx hasn't
  // wired up the setter props yet — the canonical contract still hands the
  // state up to dashboard.tsx when those setters are provided.
  const [_localChartMode,  _setLocalChartMode]  = useState<CashflowChartMode>(p.cashflowChartMode  ?? 'combo');
  const [_localViewMode,   _setLocalViewMode]   = useState<CashflowViewMode>(p.cashflowViewMode    ?? 'cash');
  const [_localGran,       _setLocalGran]       = useState<CashflowGranularity>(p.cashflowGranularity ?? 'annual');
  const [_localRefund,     _setLocalRefund]     = useState<NgRefundMode>(p.ngRefundMode            ?? 'lump-sum');

  const chartMode = p.cashflowChartMode  ?? _localChartMode;
  const viewMode  = p.cashflowViewMode   ?? _localViewMode;
  const gran      = p.cashflowGranularity ?? _localGran;
  const refund    = p.ngRefundMode       ?? _localRefund;
  const setChartMode = p.setCashflowChartMode ?? _setLocalChartMode;
  const setViewMode  = p.setCashflowViewMode  ?? _setLocalViewMode;
  const setGran      = p.setCashflowGranularity ?? _setLocalGran;
  const setRefund    = p.ngRefundMode !== undefined && p.setNgRefundMode ? p.setNgRefundMode : _setLocalRefund;

  // Prefer the rich master data when supplied (full per-period rows with
  // pporUsableEquity / ipUsableEquity / totalDepositPower etc). Fall back to
  // the condensed trajectory contract for backwards compatibility.
  const masterData = p.cashflowMaster && p.cashflowMaster.length > 0 ? p.cashflowMaster : null;
  const trajData   = p.cashflowTrajectory ?? null;
  const chartData: any[] = useMemo(() => {
    if (masterData) {
      return masterData.map((d: any) => ({
        ...d,
        // Normalise field names so the chart can render either shape.
        cashBalance:       d.cashBalance       ?? d.balance              ?? 0,
        netCashflow:       d.netCashflow       ?? d.netCF                ?? 0,
        taxRefund:         d.taxRefund         ?? d.ngRefund             ?? 0,
        usableEquity:      d.usableEquity      ?? ((d.pporUsableEquity ?? 0) + (d.ipUsableEquity ?? 0)),
        totalDepositPower: d.totalDepositPower ?? 0,
      }));
    }
    if (trajData) {
      return trajData.map((d) => ({
        label:             d.label,
        cashBalance:       d.cashBalance,
        balance:           d.cashBalance,
        netCashflow:       d.netCashflow,
        netCF:             d.netCashflow,
        taxRefund:         d.taxRefund,
        ngRefund:          d.taxRefund,
        usableEquity:      d.usableEquity,
        totalDepositPower: d.totalDepositPower,
      }));
    }
    return [];
  }, [masterData, trajData]);
  const hasData = chartData.length > 0;

  // Mini summary metrics — prefer explicit summary props, else derive from
  // the canonical data series so the row never reads zeros when the engine
  // has run.
  const firstRow = hasData ? chartData[0] : null;
  const lastRow  = hasData ? chartData[chartData.length - 1] : null;
  const sum = p.depositPowerSummary ?? {};
  const annualNetCF = sum.annualNetCashflow ?? firstRow?.netCashflow ?? firstRow?.netCF ?? 0;
  const taxRefundPerYear = sum.taxRefundPerYear ?? firstRow?.taxRefund ?? firstRow?.ngRefund ?? 0;
  const cashTodayVal = sum.cashToday ?? p.totalLiquidCash ?? 0;
  const totalDepositPowerNow = sum.totalDepositPower ?? firstRow?.totalDepositPower ?? 0;
  const pporLvrPct = sum.pporLvrPct;
  const ipReadinessPct = sum.ipReadinessPct;
  const readyNow = sum.readyNow ?? false;
  const equityRichCashPoor = !!sum.isEquityRichCashPoor;
  // Cash + Offset — the live liquidity figure. Falls back to cashTodayVal
  // when no explicit value is supplied so the row never reads blank.
  const cashAndOffsetVal = sum.cashAndOffset ?? cashTodayVal;
  // Final-year cash for the 2x2 grid (matches the reference label "{YYYY} Cash").
  // For annual granularity we read the last row's cashBalance directly. For
  // monthly granularity we still surface the final period as the future-cash
  // anchor so the metric stays informative.
  const finalYearCash: number = sum.finalYearCash ?? (lastRow?.cashBalance ?? lastRow?.balance ?? 0);
  const finalYearLabel: string = sum.finalYearLabel ?? (lastRow?.label
    ? (gran === 'monthly'
        // Monthly labels look like "Jan 2035"; show year only on the tile.
        ? (String(lastRow.label).match(/\d{4}/)?.[0] ?? String(lastRow.label))
        : String(lastRow.label))
    : `${new Date().getFullYear() + 9}`);

  const todayPower = hasData ? (chartData[0].totalDepositPower ?? 0) : 0;
  const yr5Power   = hasData && chartData.length >= 5 ? (chartData[4].totalDepositPower ?? null) : null;

  return (
    <section
      className="rounded-2xl border border-border/80 bg-card/95 overflow-hidden"
      data-testid="deposit-power-trajectory-panel"
      aria-label="Plan Execution Capacity"
    >
      <header className="px-4 pt-3.5 pb-2 flex items-center justify-between flex-wrap gap-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'hsl(188,60%,10%)', border: '1px solid hsl(188,60%,28%)' }}
          >
            <BarChart2 className="w-3.5 h-3.5" style={{ color: 'hsl(188,60%,65%)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Plan Execution Capacity
              <MetricExplainer metricId="cashflow-resilience" size={11} />
            </h2>
            <p className="text-[10px] text-muted-foreground">Liquidity · deposit power · cashflow survivability</p>
          </div>
        </div>
        {hasData && yr5Power !== null && (
          <div className="flex items-center gap-4 text-[11px]" data-testid="deposit-power-header-meta">
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Today</span>
              <span className="tabular-nums font-mono" style={{ color: 'hsl(188,60%,72%)' }} data-testid="deposit-power-today">
                {mv(formatCurrency(todayPower, true))}
              </span>
            </div>
            <div className="w-px h-7 bg-border/40" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">5 yr</span>
              <span className="tabular-nums font-mono" style={{ color: 'hsl(142,60%,60%)' }} data-testid="deposit-power-5yr">
                {mv(formatCurrency(yr5Power, true))}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* ── Readiness summary — two-tile row matching the canonical reference.
            Left tile: large IP-readiness %, full-width progress bar.
            Right tile: Ready Now headline + "Deposit ready" subtitle.
            Followed by a single Cash + Offset line in blue. */}
      <div
        className="px-3 pt-2 pb-1 grid grid-cols-2 gap-2"
        data-testid="deposit-power-readiness-row"
      >
        <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
          <div className="text-base sm:text-lg font-extrabold tabular-nums leading-none"
            style={{ color: (ipReadinessPct ?? 0) >= 100 ? 'hsl(142,60%,55%)' : 'hsl(43,90%,58%)' }}
            data-testid="dp-ip-readiness"
          >
            {typeof ipReadinessPct === 'number' && Number.isFinite(ipReadinessPct) ? `${Math.round(ipReadinessPct)}%` : '—'}
          </div>
          <div className="h-1 rounded-full bg-border mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.max(0, ipReadinessPct ?? 0))}%`,
                background: (ipReadinessPct ?? 0) >= 100 ? 'hsl(142,55%,45%)' : 'hsl(43,85%,55%)',
              }}
            />
          </div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
          <div
            className="text-sm sm:text-base font-extrabold leading-tight"
            style={{ color: equityRichCashPoor ? 'hsl(43,90%,60%)' : readyNow ? 'hsl(142,60%,55%)' : 'hsl(215,15%,65%)' }}
            data-testid="dp-ready-now"
          >
            {equityRichCashPoor ? '⚠ Equity Rich' : readyNow ? 'Ready Now' : 'Building'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {equityRichCashPoor ? '/ Cash Poor — release equity' : readyNow ? 'Deposit ready' : 'Approaching deposit'}
          </div>
        </div>
      </div>

      {/* Cash / Offset liquidity line — single-row info strip, blue accent. */}
      <div
        className="px-3 pt-1.5 pb-0.5 flex items-center gap-1.5 text-[11px] flex-wrap"
        style={{ color: 'hsl(210,80%,68%)' }}
        data-testid="dp-cash-offset"
      >
        <DollarSign className="w-3 h-3" />
        <span className="font-semibold">Cash / Offset:</span>
        <span className="tabular-nums font-mono font-semibold">{mv(formatCurrency(cashAndOffsetVal, true))}</span>
        <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
          PPOR LVR {typeof pporLvrPct === 'number' && Number.isFinite(pporLvrPct) ? `${Math.round(pporLvrPct)}%` : '—'}
          {' · '}
          Total deposit power {mv(formatCurrency(totalDepositPowerNow, true))}
        </span>
      </div>

      {/* 2×2 summary metric grid — Cash Today · Final-year Cash · Net CF · Tax Refund. */}
      <div
        className="px-3 pt-1.5 pb-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5"
        data-testid="deposit-power-summary-row"
      >
        <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
          <div className="text-[10px] text-muted-foreground mb-0.5">Cash Today</div>
          <div className="text-sm sm:text-[15px] font-extrabold tabular-nums leading-tight" style={{ color: 'hsl(210,80%,68%)' }} data-testid="dp-cash-today">
            {mv(formatCurrency(cashTodayVal, true))}
          </div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
          <div className="text-[10px] text-muted-foreground mb-0.5">{finalYearLabel} Cash</div>
          <div
            className="text-sm sm:text-[15px] font-extrabold tabular-nums leading-tight"
            style={{ color: (finalYearCash ?? 0) >= 0 ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}
            data-testid="dp-final-year-cash"
          >
            {mv(formatCurrency(finalYearCash ?? 0, true))}
          </div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
          <div className="text-[10px] text-muted-foreground mb-0.5">{gran === 'monthly' ? 'Monthly Net CF' : 'Annual Net CF'}</div>
          <div
            className="text-sm sm:text-[15px] font-extrabold tabular-nums leading-tight"
            style={{ color: annualNetCF >= 0 ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}
            data-testid="dp-net-cf"
          >
            {mv(formatCurrency(annualNetCF, true))}
          </div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border px-2.5 py-1.5">
          <div className="text-[10px] text-muted-foreground mb-0.5">Tax Refund/yr</div>
          <div className="text-sm sm:text-[15px] font-extrabold tabular-nums leading-tight" style={{ color: 'hsl(43,90%,58%)' }} data-testid="dp-tax-refund">
            +{mv(formatCurrency(taxRefundPerYear, true))}
          </div>
        </div>
      </div>

      {/* Toggle bar — Granularity · Refund · View · Chart type */}
      <div className="px-3 pt-1 pb-1.5 flex flex-wrap items-center gap-1.5">
        <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40" data-testid="dp-gran-toggle">
          {([['annual','Annual'],['monthly','Monthly']] as const).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => setGran(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                gran === m
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`dp-gran-${m}`}
            >{lbl}</button>
          ))}
        </div>
        <div className="w-px h-4 bg-border/60" />
        <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40" data-testid="dp-refund-toggle">
          {([['lump-sum','Lump-sum'],['payg','PAYG']] as const).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => setRefund(m as NgRefundMode)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                refund === m
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`dp-refund-${m}`}
            >{lbl}</button>
          ))}
        </div>
        <div className="w-px h-4 bg-border/60" />
        <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40" data-testid="dp-view-toggle">
          {([['cash','Cash'],['equity','+ Equity'],['deposit','Deposit Power']] as const).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                viewMode === m
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`dp-view-${m}`}
            >{lbl}</button>
          ))}
        </div>
        <div className="w-px h-4 bg-border/60" />
        <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40" data-testid="dp-chart-toggle">
          {([['combo','Combo'],['line','Line'],['candlestick','Candlestick']] as const).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                chartMode === m
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`dp-chart-${m}`}
            >{lbl}</button>
          ))}
        </div>
        <span className="ml-2 text-[10px] text-muted-foreground hidden sm:inline">
          {chartMode === 'combo' ? 'Balance line + Net CF bars' : chartMode === 'line' ? 'Cash balance only' : 'OHLC balance movement'}
        </span>
      </div>

      <div className="px-2 pb-2" data-testid="deposit-power-chart-area" style={{ touchAction: 'pan-y', userSelect: 'none' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={225} minHeight={205}>
            {chartMode === 'line' ? (
              <LineChart data={chartData} margin={{ top: 12, right: 18, left: 0, bottom: 6 }}>
                <defs>
                  <linearGradient id="dpCashLineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="hsl(210,80%,62%)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(210,80%,62%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.32)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border) / 0.5)' }}
                  interval={gran === 'monthly' ? Math.max(0, Math.floor(chartData.length / 8)) : 0}
                />
                <YAxis yAxisId="bal" tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<CalmChartTooltip />} cursor={{ stroke: 'hsl(210,80%,55%)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Line yAxisId="bal" type="monotone" dataKey="cashBalance" name="Cash Balance"
                  stroke="hsl(210,80%,68%)" strokeWidth={2.6} dot={false}
                  activeDot={{ r: 4.5, fill: 'hsl(210,80%,68%)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                {viewMode !== 'cash' && (
                  <Line yAxisId="bal" type="monotone" dataKey="usableEquity" name="Usable Equity"
                    stroke="hsl(188,60%,55%)" strokeWidth={1.8} dot={false} strokeDasharray="5 3" isAnimationActive={false}
                  />
                )}
                {viewMode === 'deposit' && (
                  <Line yAxisId="bal" type="monotone" dataKey="totalDepositPower" name="Deposit Power"
                    stroke="hsl(43,90%,60%)" strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                )}
              </LineChart>
            ) : chartMode === 'candlestick' ? (
              <ComposedChart
                data={chartData.map((d: any, i: number) => {
                  const prev = i === 0 ? d.cashBalance : chartData[i-1].cashBalance;
                  return { ...d, _prevBal: prev, _isUp: d.cashBalance >= prev };
                })}
                margin={{ top: 12, right: 18, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.32)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border) / 0.5)' }}
                  interval={gran === 'monthly' ? Math.max(0, Math.floor(chartData.length / 8)) : 0}
                />
                <YAxis yAxisId="bal" tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<CalmChartTooltip />} cursor={{ fill: 'hsl(222,15%,16%)', fillOpacity: 0.4 }} />
                <Bar yAxisId="bal" dataKey="cashBalance" name="Cash Balance" radius={[3,3,0,0]} maxBarSize={28} isAnimationActive={false}>
                  {chartData.map((d: any, i: number) => {
                    const prev = i === 0 ? d.cashBalance : chartData[i-1].cashBalance;
                    const isUp = d.cashBalance >= prev;
                    return <Cell key={i} fill={isUp ? 'hsl(142,55%,45%)' : 'hsl(0,65%,55%)'} fillOpacity={0.85} />;
                  })}
                </Bar>
                <Line yAxisId="bal" type="monotone" dataKey="cashBalance" name="Trend"
                  stroke="hsl(210,80%,68%)" strokeWidth={1.5} dot={false} strokeDasharray="3 3" strokeOpacity={0.45} isAnimationActive={false}
                />
                <ReferenceLine yAxisId="bal" y={0} stroke="hsl(var(--border) / 0.6)" />
              </ComposedChart>
            ) : (
              // DEFAULT: Combo — Balance line (with circular markers) + Net CF
              // bars + gold vertical dashed tax-refund markers per year. Dual
              // y-axis (balance left, cashflow right) so the institutional
              // chrome matches the canonical reference.
              <ComposedChart data={chartData} margin={{ top: 12, right: 18, left: 0, bottom: 6 }}>
                <defs>
                  <linearGradient id="dpComboBalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="hsl(210,80%,62%)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="hsl(210,80%,62%)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.32)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border) / 0.5)' }}
                  interval={gran === 'monthly' ? Math.max(0, Math.floor(chartData.length / 8)) : 0}
                />
                <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={56} />
                <YAxis yAxisId="cf"  orientation="right" tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<CalmChartTooltip />} cursor={{ fill: 'hsl(222,15%,16%)', fillOpacity: 0.4 }} />
                <ReferenceLine yAxisId="cf" y={0} stroke="hsl(var(--border) / 0.55)" strokeDasharray="3 3" />
                {/* Gold vertical dashed tax-refund markers per year — only
                    drawn where a refund actually lands. */}
                {chartData.map((d: any) => (
                  (d.taxRefund ?? d.ngRefund ?? 0) > 0 ? (
                    <ReferenceLine
                      key={`tr-${d.label}`}
                      yAxisId="cf"
                      x={d.label}
                      stroke="hsl(43,90%,55%)"
                      strokeDasharray="4 3"
                      strokeOpacity={0.55}
                      strokeWidth={1}
                    />
                  ) : null
                ))}
                <Bar yAxisId="cf" dataKey="netCashflow" name="Net Cashflow" radius={[3,3,0,0]} maxBarSize={32} isAnimationActive={false}>
                  {chartData.map((d: any, i: number) => (
                    <Cell key={i} fill={(d.netCashflow ?? 0) >= 0 ? 'hsl(142,55%,45%)' : 'hsl(0,65%,55%)'} fillOpacity={0.78} />
                  ))}
                </Bar>
                {/* Tax refund — small gold tick bars that pair with the dashed
                    vertical markers above. Preserves the canonical refund
                    channel + lets the legend chip reference the same series. */}
                <Bar yAxisId="cf" dataKey="taxRefund" name="Tax Refund" fill="hsl(43,90%,55%)" fillOpacity={0.95} radius={[2,2,0,0]} maxBarSize={6} isAnimationActive={false} />
                {/* Cash balance — line with gold circular markers, light blue
                    gradient fill below. Matches the reference verbatim. */}
                <Area yAxisId="bal" type="monotone" dataKey="cashBalance" name="Cash Balance"
                  stroke="hsl(210,80%,68%)" strokeWidth={2.6} fill="url(#dpComboBalFill)" isAnimationActive={false}
                  dot={{ r: 4, fill: 'hsl(43,90%,55%)', stroke: 'hsl(210,80%,68%)', strokeWidth: 1.8 }}
                  activeDot={{ r: 5.5, fill: 'hsl(43,90%,55%)', stroke: 'hsl(210,80%,68%)', strokeWidth: 2 }}
                />
                {viewMode !== 'cash' && (
                  <Line yAxisId="bal" type="monotone" dataKey="usableEquity" name="Usable Equity"
                    stroke="hsl(188,60%,55%)" strokeWidth={1.8} dot={false} strokeDasharray="5 3" isAnimationActive={false}
                  />
                )}
                {viewMode === 'deposit' && (
                  <Line yAxisId="bal" type="monotone" dataKey="totalDepositPower" name="Deposit Power"
                    stroke="hsl(43,90%,60%)" strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            )}
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

        {/* Dynamic legend row 1 — chart series. */}
        {hasData && (
          <div className="px-3 pt-2 mt-0.5 border-t border-border/25 space-y-1" data-testid="dp-legend">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(210,80%,68%)' }}>
                <span className="inline-block w-6 h-0.5 rounded" style={{ background: 'hsl(210,80%,68%)' }} />Cash Balance
              </div>
              {viewMode !== 'cash' && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(188,60%,60%)' }}>
                  <span className="inline-block w-6 h-0.5 rounded border-current" style={{ borderStyle: 'dashed', borderTopWidth: 2 }} />Usable Equity
                </div>
              )}
              {viewMode === 'deposit' && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'hsl(43,90%,60%)' }}>
                  <span className="inline-block w-6 h-0.5 rounded" style={{ background: 'hsl(43,90%,60%)' }} />Deposit Power
                </div>
              )}
              {chartMode !== 'line' && (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'hsl(142,55%,45%)', opacity: 0.85 }} />{chartMode === 'candlestick' ? 'Up year' : 'Net CF +'}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'hsl(0,65%,55%)', opacity: 0.85 }} />{chartMode === 'candlestick' ? 'Down year' : 'Net CF −'}
                  </div>
                </>
              )}
            </div>
            {/* Legend row 2 — event/category brand chips matching the canonical reference. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(188,65%,55%)' }}>
                <span>🏠</span><span style={{ opacity: 0.85 }}>Property</span>
              </div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(210,80%,68%)' }}>
                <span>📈</span><span style={{ opacity: 0.85 }}>Stocks</span>
              </div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(262,70%,68%)' }}>
                <span>₿</span><span style={{ opacity: 0.85 }}>Crypto</span>
              </div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(43,90%,58%)' }}>
                <span>💰</span><span style={{ opacity: 0.85 }}>Tax Refund</span>
              </div>
              <div className="ml-auto text-[10px] text-muted-foreground">
                {gran === 'monthly' ? 'Monthly granularity · responsive' : 'Annual granularity · 10-year horizon'}
              </div>
            </div>
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
      {/* 1. Hero Snapshot — Today snapshot, live current values only. */}
      <ExecutiveHeroSnapshot {...resolved} result={result} />
      {/* 2. Deterministic Projection (Assumption-Based) — the canonical
            year-by-year asset breakdown PLUS the four canonical wealth layers
            (Gross / Accessible / Liquidatable / FIRE). Single assumption set. */}
      <WealthProjectionTable {...resolved} />
      {/* 3. Reconciliation card — bridges the two projections. Transparent
            drivers derived from canonical wealth state, not engine outputs. */}
      <ReconciliationCard {...resolved} />
      {/* 4. Probabilistic Projection (Monte Carlo Adjusted) — P10/P50/P90 fan
            with the canonical explanation text. */}
      <MonteCarloTrajectoryChart {...resolved} />
      {/* 5. Wealth Decision Center — operational tabs (CASH/EVENTS/RISK).
            Risk tab renders the canonical 8-axis radar + stress matrix +
            FIRE fragility gauge (no duplicated cards). */}
      <WealthDecisionCenter
        defaultTab="CASH"
        executiveProps={resolved}
        renderDepositPowerChart={() => <DepositPowerTrajectoryPanel {...resolved} />}
      />
      {/* 6. Financial Health — exactly 4 structural indicators. */}
      <ExecutiveHealthStrip {...resolved} />
      {/* 7. Action Queue — max 3 next-step items. */}
      <ExecutiveActionQueue result={result} />
      {/* 8. Deep Analysis Cards — four navigation surfaces (no chips). */}
      <DeepAnalysisCards />
    </div>
  );
}

export { fmtCompact as __fmtCompactForTests };
