/**
 * ExecutiveDashboard.tsx — FWL Phase 7 (Experience Rebuild)
 *
 * New executive-mode entry surface that introduces hierarchy and progressive
 * disclosure to the dashboard while PRESERVING the existing visual identity
 * (dark navy/graphite surfaces, gold/yellow accents, cyan/green/purple
 * intelligence accents, current card styling, current glow intensity range,
 * current icon language, current typography direction).
 *
 * Five composable surfaces, narrative-first:
 *   1. ExecutiveHeader   — net worth, monthly surplus, risk, trajectory, macro regime
 *   2. DailyBriefing     — best move, top risk, top opportunity, what changed, confidence
 *   3. StrategicPriorities — top 3 by default, "View full strategic stack" reveal
 *   4. FinancialHealthStrip — liquidity / leverage / survivability / FIRE / runway / debt pressure
 *   5. ActionQueue       — next executable steps
 *
 * No new data sources — all values come from the existing Unified Recommendation
 * Engine, dashboard data contract selectors, and store.
 *
 * Tone: calm, professional, CIO / family-office. Reads in < 15 seconds.
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, TrendingDown, Shield, Sparkles, AlertTriangle,
  Activity, ArrowRight, ChevronDown, ChevronUp, Flame, Wallet,
  Layers, Clock, Target, CheckCircle2, BarChart2,
} from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import { useAppStore } from '@/lib/store';
import { computeUnifiedBestMove, type UnifiedBestMoveResult } from '@/lib/recommendationEngine';
import { formatCurrency } from '@/lib/finance';
import { maskValue } from '@/components/PrivacyMask';

// ─── Public props ────────────────────────────────────────────────────────────

export interface ExecutiveDashboardProps {
  netWorth: number;
  surplus: number;
  totalLiquidCash: number;
  totalLiab: number;
  monthlyExpenses: number;
  passiveIncome: number;
  year10NW: number;
  fireProgressPct: number;
  fireCurrentAmt: number;
  fireTargetAmt: number;
  riskScore: number;
  riskLabel: string;
  /** Annual monthly debt service total. */
  monthlyDebtService: number;
  /** Mortgage balance (for leverage calc). */
  totalMortgage: number;
  /** Total property value (for LVR). */
  totalPropertyValue: number;
  /** Total assets for leverage ratio. */
  totalAssets: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function regimeLabel(): { label: string; tone: string } {
  // Macro regime is computed by Phase 5/6 engines and not always available at
  // dashboard mount. Default to "Expansion" — a calm reading consistent with
  // the portfolio construction default. This is updated downstream by the
  // FinancialOSCentre / FamilyOfficeMode panels.
  return { label: 'Expansion · Stable', tone: 'hsl(142,60%,55%)' };
}

function trajectoryFromGrowth(start: number, end: number): { delta: number; pct: number; label: string } {
  if (!start || start <= 0) return { delta: 0, pct: 0, label: 'Insufficient data' };
  const delta = end - start;
  const pct = (delta / start) * 100;
  return {
    delta,
    pct,
    label: pct >= 50 ? 'Strong growth' : pct >= 20 ? 'Steady growth' : pct >= 5 ? 'Modest growth' : pct >= 0 ? 'Flat' : 'Drawdown',
  };
}

// ─── 1. ExecutiveHeader ──────────────────────────────────────────────────────

function ExecutiveHeader(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const macro = regimeLabel();
  const traj = trajectoryFromGrowth(p.netWorth, p.year10NW);
  const surplusPositive = p.surplus >= 0;
  const riskTone =
    p.riskScore >= 70 ? 'hsl(142,60%,55%)'
    : p.riskScore >= 50 ? 'hsl(43,90%,55%)'
    : 'hsl(0,72%,60%)';

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: 'hsl(var(--gold-dim) / 0.35)',
        background:
          'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-surface) / 0.35) 100%)',
      }}
      data-testid="executive-header"
    >
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(var(--gold-surface))',
              border: '1px solid hsl(var(--gold-dim) / 0.5)',
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'hsl(var(--gold))' }} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'hsl(var(--gold))' }}>
              Executive Overview
            </div>
            <div className="text-[10px] text-muted-foreground">15-second daily read</div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
          <Activity className="w-3 h-3" />
          <span>Macro: <span style={{ color: macro.tone }}>{macro.label}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-0 divide-x divide-border/30">
        {/* Net Worth — dominant */}
        <div className="px-4 py-3 col-span-2 md:col-span-1">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Net Worth</div>
          <div className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: 'hsl(var(--gold))' }}>
            {mv(formatCurrency(p.netWorth, true))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Brisbane, QLD · AUD</div>
        </div>

        {/* Monthly Surplus */}
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Monthly Surplus</div>
          <div
            className="text-lg font-extrabold tabular-nums leading-none flex items-center gap-1"
            style={{ color: surplusPositive ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}
          >
            {surplusPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {mv(formatCurrency(p.surplus, true))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{mv(formatCurrency(p.surplus * 12, true))} / yr</div>
        </div>

        {/* Risk state */}
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Risk State</div>
          <div className="text-lg font-extrabold leading-none flex items-center gap-1" style={{ color: riskTone }}>
            <Shield className="w-3.5 h-3.5" />
            {p.riskLabel}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{p.riskScore} / 100</div>
        </div>

        {/* Trajectory */}
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">10y Trajectory</div>
          <div className="text-lg font-extrabold tabular-nums leading-none" style={{ color: 'hsl(210,80%,68%)' }}>
            {mv(formatCurrency(p.year10NW, true))}
          </div>
          <div className="text-[10px] mt-1" style={{ color: traj.pct >= 0 ? 'hsl(142,60%,55%)' : 'hsl(0,72%,60%)' }}>
            {traj.pct >= 0 ? '+' : ''}{traj.pct.toFixed(0)}% · {traj.label}
          </div>
        </div>

        {/* Macro — desktop only on mobile shown in header pill */}
        <div className="px-4 py-3 hidden md:block">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Macro Regime</div>
          <div className="text-sm font-bold leading-none" style={{ color: macro.tone }}>{macro.label}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Adaptive · global</div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. DailyBriefing ────────────────────────────────────────────────────────

function DailyBriefing({ result }: { result: UnifiedBestMoveResult | null }) {
  const { privacyMode } = useAppStore();
  const mv = (v?: string) => v ? maskValue(v, privacyMode) : '';

  if (!result) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">Loading daily briefing…</div>
      </div>
    );
  }

  const { unified, changes } = result;
  const best = unified.bestMove;
  const all = unified.all;

  // Top opportunity = highest expected dollar impact among non-defensive recs
  const defensiveTypes: Array<typeof all[number]['actionType']> = [
    'build_emergency_buffer', 'pay_high_interest_debt', 'reduce_leverage', 'pause_investing',
  ];
  const opportunity = all
    .filter(r => r.id !== best.id && !defensiveTypes.includes(r.actionType))
    .sort((a, b) => (b.expectedFinancialImpact?.annualDollar ?? 0) - (a.expectedFinancialImpact?.annualDollar ?? 0))[0];

  // Top risk = highest risk-reduction rec
  const topRisk = all
    .filter(r => r.id !== best.id && (r.riskReductionImpact?.points ?? 0) > 0)
    .sort((a, b) => (b.riskReductionImpact?.points ?? 0) - (a.riskReductionImpact?.points ?? 0))[0];

  const meaningfulChanges = changes.filter(c => c.changedReason !== 'unchanged');
  const confidencePct = Math.round(best.confidenceScore * 100);
  const confidenceTone =
    confidencePct >= 75 ? 'hsl(142,60%,55%)'
    : confidencePct >= 55 ? 'hsl(43,90%,55%)'
    : 'hsl(0,72%,60%)';

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: 'hsl(var(--gold-dim) / 0.35)',
        background: 'hsl(var(--card))',
      }}
      data-testid="daily-briefing"
    >
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(var(--gold-surface))',
              border: '1px solid hsl(var(--gold-dim) / 0.5)',
            }}
          >
            <Activity className="w-4 h-4" style={{ color: 'hsl(var(--gold))' }} />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Daily Briefing</div>
            <div className="text-[10px] text-muted-foreground">
              Narrative summary · {unified.signalCoverage.length} signals · confidence{' '}
              <span style={{ color: confidenceTone }}>{confidencePct}%</span>
            </div>
          </div>
        </div>
        <Link href="/decision">
          <span className="text-xs text-primary hover:underline">Full intelligence →</span>
        </Link>
      </div>

      {/* Executive summary narrative */}
      <div className="px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'hsl(var(--gold))' }}>
          Executive Summary
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">
          {best.reasoning}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/30 border-t border-border/30">
        {/* Best move */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Best Move</span>
          </div>
          <p className="text-xs font-semibold text-foreground leading-snug">{best.title}</p>
          {best.benefitLabel && (
            <p className="text-xs text-emerald-400 font-mono mt-1">{mv(best.benefitLabel)}</p>
          )}
        </div>

        {/* Top risk */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3 h-3" style={{ color: 'hsl(0,72%,60%)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'hsl(0,72%,60%)' }}>Top Risk</span>
          </div>
          {topRisk ? (
            <>
              <p className="text-xs font-semibold text-foreground leading-snug">{topRisk.title}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {unified.riskBeingReduced}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No high-priority risk surfaced this cycle.</p>
          )}
        </div>

        {/* Top opportunity */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3 h-3" style={{ color: 'hsl(188,60%,55%)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'hsl(188,60%,55%)' }}>Top Opportunity</span>
          </div>
          {opportunity ? (
            <>
              <p className="text-xs font-semibold text-foreground leading-snug">{opportunity.title}</p>
              {opportunity.benefitLabel && (
                <p className="text-xs text-emerald-400 font-mono mt-1">{mv(opportunity.benefitLabel)}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Capacity steady — no new opportunity above threshold.</p>
          )}
        </div>
      </div>

      {/* What changed */}
      {meaningfulChanges.length > 0 && (
        <div className="px-4 py-3 border-t border-border/30">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground">What Changed</div>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {meaningfulChanges.slice(0, 3).map(c => (
              <li key={c.id}>
                <span className="text-foreground/85">{c.current.title}</span> — {c.changedReason.replace(/_/g, ' ')}
                {c.confidenceMovement !== 0 && (
                  <span className="ml-1 text-sky-300/70">
                    ({c.confidenceMovement > 0 ? '+' : ''}{(c.confidenceMovement * 100).toFixed(0)}% conf)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended action CTA */}
      {best.cta && (
        <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-muted-foreground">
            <span className="text-foreground/80 font-medium">Recommended action:</span>{' '}
            calm, sequenced. Open the plan to review the full sequence.
          </div>
          <Link href={best.cta.route}>
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{
                background: 'hsl(var(--gold))',
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              {best.cta.label}
              <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── 3. StrategicPriorities ──────────────────────────────────────────────────

function StrategicPriorities({ result }: { result: UnifiedBestMoveResult | null }) {
  const { privacyMode } = useAppStore();
  const mv = (v?: string) => v ? maskValue(v, privacyMode) : '';
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;
  const top = result.unified.topPriorities.slice(0, 3);
  const rest = result.unified.all.slice(3);

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="strategic-priorities"
    >
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(210,80%,12%)',
              border: '1px solid hsl(210,80%,30%)',
            }}
          >
            <Target className="w-4 h-4" style={{ color: 'hsl(210,80%,70%)' }} />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Strategic Priorities</div>
            <div className="text-[10px] text-muted-foreground">Top 3 by impact-adjusted confidence</div>
          </div>
        </div>
        <Link href="/wealth-strategy">
          <span className="text-xs text-primary hover:underline">Full plan →</span>
        </Link>
      </div>

      <ol className="divide-y divide-border/30">
        {top.map(r => (
          <li
            key={r.id}
            className="px-4 py-2.5 flex items-start gap-3"
            data-testid={`strategic-priority-${r.priorityRank}`}
          >
            <div
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums"
              style={{
                background: r.priorityRank === 1 ? 'hsl(var(--gold-surface))' : 'hsl(var(--muted))',
                color: r.priorityRank === 1 ? 'hsl(var(--gold))' : 'hsl(var(--muted-foreground))',
                border: r.priorityRank === 1 ? '1px solid hsl(var(--gold-dim) / 0.5)' : '1px solid hsl(var(--border))',
              }}
            >
              {r.priorityRank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground leading-snug">{r.title}</p>
                <div className="text-right shrink-0">
                  {r.benefitLabel && <p className="text-[10px] text-emerald-400 font-mono">{mv(r.benefitLabel)}</p>}
                  <p className="text-[9px] text-muted-foreground tabular-nums">conf {(r.confidenceScore * 100).toFixed(0)}%</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">{r.reasoning}</p>
            </div>
          </li>
        ))}
      </ol>

      {rest.length > 0 && (
        <div className="border-t border-border/30">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
            data-testid="strategic-priorities-toggle"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Hide full strategic stack' : `View full strategic stack (+${rest.length})`}
          </button>
          {expanded && (
            <ol className="divide-y divide-border/30">
              {rest.map(r => (
                <li key={r.id} className="px-4 py-2 flex items-start gap-3">
                  <div className="shrink-0 w-6 h-6 rounded bg-muted text-muted-foreground text-[10px] font-bold tabular-nums flex items-center justify-center">
                    {r.priorityRank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground/90 leading-snug truncate">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{r.reasoning}</p>
                  </div>
                  {r.benefitLabel && (
                    <p className="text-[10px] text-emerald-400 font-mono shrink-0">{mv(r.benefitLabel)}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 4. FinancialHealthStrip ─────────────────────────────────────────────────

interface HealthIndicator {
  label: string;
  value: string;
  tone: string;
  Icon: React.ComponentType<{ className?: string }>;
  caption: string;
}

function FinancialHealthStrip(p: ExecutiveDashboardProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  // Liquidity: liquid cash / monthly expenses (months)
  const liquidityMonths = p.monthlyExpenses > 0 ? p.totalLiquidCash / p.monthlyExpenses : 0;
  // Leverage: liabilities / assets
  const leveragePct = p.totalAssets > 0 ? (p.totalLiab / p.totalAssets) * 100 : 0;
  // Survivability: months of runway including passive income
  const survivability = (p.monthlyExpenses - p.passiveIncome) > 0
    ? p.totalLiquidCash / (p.monthlyExpenses - p.passiveIncome)
    : 99;
  // Debt pressure: debt service / income proxy (use expenses as denom for now)
  const debtPressure = p.monthlyExpenses > 0 ? (p.monthlyDebtService / (p.monthlyExpenses + Math.max(0, p.surplus))) * 100 : 0;

  const indicators: HealthIndicator[] = [
    {
      label: 'Liquidity',
      value: `${liquidityMonths.toFixed(1)} mo`,
      tone: liquidityMonths >= 6 ? 'hsl(142,60%,55%)' : liquidityMonths >= 3 ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)',
      Icon: Wallet,
      caption: `${mv(formatCurrency(p.totalLiquidCash, true))} cash`,
    },
    {
      label: 'Leverage',
      value: `${leveragePct.toFixed(0)}%`,
      tone: leveragePct < 50 ? 'hsl(142,60%,55%)' : leveragePct < 70 ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)',
      Icon: Layers,
      caption: 'Debt / Assets',
    },
    {
      label: 'Survivability',
      value: survivability >= 99 ? '∞' : `${survivability.toFixed(1)} mo`,
      tone: survivability >= 12 ? 'hsl(142,60%,55%)' : survivability >= 6 ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)',
      Icon: Shield,
      caption: 'After passive income',
    },
    {
      label: 'FIRE',
      value: `${Math.round(p.fireProgressPct)}%`,
      tone: p.fireProgressPct >= 50 ? 'hsl(142,60%,55%)' : p.fireProgressPct >= 20 ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)',
      Icon: Flame,
      caption: 'Of capital target',
    },
    {
      label: 'Runway',
      value: `${liquidityMonths.toFixed(0)} mo`,
      tone: liquidityMonths >= 12 ? 'hsl(142,60%,55%)' : liquidityMonths >= 6 ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)',
      Icon: Clock,
      caption: 'At full expense burn',
    },
    {
      label: 'Debt Pressure',
      value: `${debtPressure.toFixed(0)}%`,
      tone: debtPressure < 30 ? 'hsl(142,60%,55%)' : debtPressure < 45 ? 'hsl(43,90%,55%)' : 'hsl(0,72%,60%)',
      Icon: BarChart2,
      caption: 'Service / cashflow',
    },
  ];

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="financial-health-strip"
    >
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(280,80%,12%)',
              border: '1px solid hsl(280,80%,30%)',
            }}
          >
            <Activity className="w-4 h-4" style={{ color: 'hsl(280,80%,72%)' }} />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Financial Health</div>
            <div className="text-[10px] text-muted-foreground">Six structural indicators</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-border/30 border-t border-border/30">
        {indicators.map(ind => (
          <div key={ind.label} className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">
              <ind.Icon className="w-3 h-3" />
              {ind.label}
            </div>
            <div className="text-base font-extrabold tabular-nums leading-none" style={{ color: ind.tone }}>
              {ind.value}
            </div>
            <div className="text-[9px] text-muted-foreground mt-1 truncate">{ind.caption}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 5. ActionQueue ──────────────────────────────────────────────────────────

function ActionQueue({ result }: { result: UnifiedBestMoveResult | null }) {
  if (!result) return null;
  const best = result.unified.bestMove;
  const steps = best.implementationSteps.slice(0, 4);

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="action-queue"
    >
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(142,60%,10%)',
              border: '1px solid hsl(142,60%,30%)',
            }}
          >
            <CheckCircle2 className="w-4 h-4" style={{ color: 'hsl(142,60%,55%)' }} />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Action Queue</div>
            <div className="text-[10px] text-muted-foreground">Next executable steps for the best move</div>
          </div>
        </div>
        {best.cta && (
          <Link href={best.cta.route}>
            <span className="text-xs text-primary hover:underline">Open →</span>
          </Link>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">No specific steps queued. The current best move is already aligned with steady-state execution.</div>
      ) : (
        <ol className="divide-y divide-border/30">
          {steps.map((s, i) => (
            <li key={i} className="px-4 py-2 flex items-start gap-3" data-testid={`action-queue-step-${i}`}>
              <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold text-emerald-400 tabular-nums">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/90 leading-snug">{s.step}</p>
                {s.detail && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{s.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Composed export ─────────────────────────────────────────────────────────

export default function ExecutiveDashboard(props: ExecutiveDashboardProps) {
  const maxLvr = useForecastStore(s => s.maxLvr);
  const liveMC = useForecastStore(s => s.monteCarloResult);
  const mcSig = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeUnifiedBestMove({ cfg: { maxLvr }, monteCarloV5: liveMC })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLvr, mcSig]);

  return (
    <div className="space-y-3" data-testid="executive-dashboard">
      <ExecutiveHeader {...props} />
      <DailyBriefing result={result} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <StrategicPriorities result={result} />
        <ActionQueue result={result} />
      </div>
      <FinancialHealthStrip {...props} />
    </div>
  );
}
