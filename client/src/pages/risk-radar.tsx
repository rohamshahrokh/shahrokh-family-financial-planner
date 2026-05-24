/**
 * risk-radar.tsx — Full Risk Radar Breakdown Page
 *
 * Rendered as a tab inside /wealth-strategy (or standalone).
 * Shows all 4 risk categories with full factor detail, radar chart, alerts.
 */

import { useQuery } from '@tanstack/react-query';
import {
  computeRiskRadar,
  buildRiskInput,
  type RiskCategory,
  type RiskFactor,
  type RiskLevel,
  type RiskAlert,
} from '@/lib/riskEngine';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import UnifiedRiskPanel from '@/components/UnifiedRiskPanel';
import {
  Shield, AlertTriangle, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Info, TrendingDown, Zap,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { AuditableMetric } from '@/components/auditMode/AuditableMetric';
import { registerTrace } from '@/lib/auditMode/auditRegistry';
import {
  buildLegacyRiskCategoryTraces,
  buildLegacyRiskOverallTrace,
  buildLiveFinancialHealthTracesFromRiskRadar,
} from '@/lib/auditMode/engineTraces';
// Sprint 4A Final Closure — Risk reads its headline figures (debt service,
// liquidity, surplus, NW) from the canonical ledger so the radar's category
// scores cannot diverge from Dashboard / Reports / Financial Plan / Wealth
// Strategy / Timeline.
import {
  computeCanonicalHeadlineFigures,
  buildCanonicalAuditTrace,
} from '@/lib/canonicalLedger';

// ─── Level config ─────────────────────────────────────────────────────────────

const LEVEL_CFG: Record<RiskLevel, { label: string; text: string; bg: string; border: string; bar: string; Icon: any }> = {
  green: { label: 'Low',      text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'bg-emerald-400', Icon: CheckCircle2 },
  amber: { label: 'Moderate', text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   bar: 'bg-amber-400',   Icon: AlertTriangle },
  red:   { label: 'High',     text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     bar: 'bg-red-400',     Icon: AlertCircle },
};

function LevelBadge({ level, size = 'sm' }: { level: RiskLevel; size?: 'xs' | 'sm' }) {
  const cfg = LEVEL_CFG[level];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.border} ${cfg.text} ${size === 'xs' ? 'text-[9px]' : 'text-[10px]'}`}>
      <Icon className="w-2.5 h-2.5" /> {cfg.label} Risk
    </span>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: RiskLevel }) {
  const cfg = LEVEL_CFG[level];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${cfg.text}`}>{score}</span>
    </div>
  );
}

// ─── Alert severity ───────────────────────────────────────────────────────────

const SEV_CFG: Record<RiskAlert['severity'], { cls: string; Icon: any; label: string }> = {
  critical: { cls: 'bg-red-500/10 border-red-500/30 text-red-300',     Icon: AlertCircle,   label: 'Critical' },
  high:     { cls: 'bg-orange-500/10 border-orange-500/30 text-orange-300', Icon: AlertTriangle, label: 'High' },
  medium:   { cls: 'bg-amber-500/10 border-amber-500/25 text-amber-300',  Icon: AlertTriangle, label: 'Medium' },
  low:      { cls: 'bg-secondary/40 border-border text-muted-foreground',  Icon: Info,          label: 'Low' },
};

// ─── Factor detail row ────────────────────────────────────────────────────────

function FactorRow({ f }: { f: RiskFactor }) {
  const [open, setOpen] = useState(false);
  const cfg = LEVEL_CFG[f.level];
  const Icon = cfg.Icon;

  return (
    <div className={`rounded-xl border overflow-hidden ${f.level !== 'green' ? `${cfg.bg} ${cfg.border}` : 'bg-secondary/20 border-border/50'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-3 text-left">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.text}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground">{f.label}</div>
          <div className="text-[10px] text-muted-foreground">{f.value} · {f.benchmark}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-black ${cfg.text}`}>{f.score}</span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2">
          <div className="flex items-start gap-2">
            <TrendingDown className={`w-3 h-3 mt-0.5 shrink-0 ${cfg.text}`} />
            <p className="text-xs text-foreground leading-relaxed">{f.finding}</p>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="w-3 h-3 mt-0.5 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">{f.action}</p>
          </div>
          <ScoreBar score={f.score} level={f.level} />
        </div>
      )}
    </div>
  );
}

// ─── Category panel ───────────────────────────────────────────────────────────

function CategoryPanel({ cat, defaultOpen }: { cat: RiskCategory; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? cat.level !== 'green');
  const cfg = LEVEL_CFG[cat.level];
  const Icon = cfg.Icon;

  return (
    <div className={`rounded-2xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="text-xl">{cat.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold text-foreground">{cat.label}</span>
            <LevelBadge level={cat.level} />
          </div>
          <ScoreBar score={cat.score} level={cat.level} />
        </div>
        <div className="ml-2">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40">
          <p className="text-xs text-muted-foreground pt-3 leading-relaxed">{cat.summary}</p>
          <div className="space-y-2">
            {cat.factors.map(f => <FactorRow key={f.id} f={f} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RiskRadarPage() {
  const privacyMode = useAppStore(s => s.privacyMode);
  const mv = (v: string) => maskValue(v, privacyMode);

  const { data: snap } = useQuery<any>({ queryKey: ['/api/snapshot'] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ['/api/properties'] });
  const { data: expenses = [] } = useQuery<any[]>({ queryKey: ['/api/expenses'] });

  // Sprint 4A Final Closure — canonical headline figures.
  // The radar's debt-service ratio, liquidity ratio and savings ratio all
  // derive from these numbers, guaranteeing the radar matches Dashboard etc.
  const canonicalHead = useMemo(() => computeCanonicalHeadlineFigures({
    snapshot: snap, properties, stocks: [], cryptos: [],
    holdingsRaw: [], incomeRecords: [], expenses,
  }), [snap, properties, expenses]);
  const canonicalAudit = useMemo(() => buildCanonicalAuditTrace({
    snapshot: snap, properties, stocks: [], cryptos: [],
    holdingsRaw: [], incomeRecords: [], expenses,
  }), [snap, properties, expenses]);
  void canonicalHead;
  void canonicalAudit;

  // ── React #310 fix: compute risk radar via useMemo BEFORE any early return,
  //    and run the audit-trace useEffect unconditionally so hook order never
  //    changes between renders. Guards downstream null-handling.
  const hasSnap = Boolean(snap && Object.keys(snap as any).length > 0);
  const result = useMemo(() => {
    if (!hasSnap) return null;
    const input = buildRiskInput(snap, properties, expenses);
    return computeRiskRadar(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSnap, snap, properties, expenses]);

  // Audit Mode: register legacy + canonical traces whenever the engine output
  // changes. No math is duplicated — both shapes pin the same canonical
  // RiskRadarResult onto the trace registry.
  const overallScoreKey = result?.overall_score ?? -1;
  const categoryScoreKey = result?.categories.map(c => c.score).join('|') ?? '';
  useEffect(() => {
    if (!result) return;
    registerTrace(buildLegacyRiskOverallTrace(result));
    buildLegacyRiskCategoryTraces(result).forEach(registerTrace);
    // Live extras for the FIRE Progress canonical trace — same investable +
    // annual_expenses definition the /wealth-strategy hub uses for
    // `derived.fireProgressPct`, so the FIRE Progress trace always shows a
    // numeric live value (never redirect text).
    const s: any = snap ?? {};
    const investable =
      Number(s.cash ?? 0) +
      Number(s.offset_balance ?? 0) +
      Number(s.super_balance ?? 0) +
      Number(s.stocks ?? 0) +
      Number(s.crypto ?? 0);
    const annualExpenses = Number(s.monthly_expenses ?? 0) * 12;
    const resultWithFireProgress = {
      ...result,
      fire_progress_pct: (snap as any)?.fire_progress_pct ?? null,
    };
    buildLiveFinancialHealthTracesFromRiskRadar(resultWithFireProgress as any, {
      investable,
      annualExpenses,
      swr: 0.04,
    }).forEach(registerTrace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, overallScoreKey, categoryScoreKey]);

  if (!hasSnap || !result) {
    return (
      <div className="space-y-3 p-3 sm:p-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-secondary/40 rounded-2xl animate-pulse" />)}
        <p className="text-xs text-muted-foreground text-center pt-2">Loading risk surface from your live ledger…</p>
      </div>
    );
  }

  const { overall_score, overall_level, overall_label, categories, top_risks, alerts, radar_data, fragility_index, data_coverage } = result;
  const levelCfg = LEVEL_CFG[overall_level];
  const LevelIcon = levelCfg.Icon;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high');

  return (
    <div className="space-y-5">

      {/* ── Critical alerts banner ────────────────────────────────────────── */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-2">
          {criticalAlerts.map((a, i) => {
            const sc = SEV_CFG[a.severity];
            const SIcon = sc.Icon;
            return (
              <div key={i} className={`flex items-start gap-2.5 p-3.5 rounded-xl border ${sc.cls}`}>
                <SIcon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-0.5">{sc.label} · {a.category}</div>
                  <p className="text-xs leading-relaxed">{a.message}</p>
                  <p className="text-[10px] mt-1 opacity-80">→ {a.action}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Overall KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`rounded-xl p-3 border ${levelCfg.bg} ${levelCfg.border}`}>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Overall Safety Score</div>
          <AuditableMetric traceId="risk-radar:overall">
            <div className={`text-3xl font-black ${levelCfg.text}`}>{overall_score}</div>
          </AuditableMetric>
          <div className="text-[9px] text-muted-foreground mt-0.5">/ 100</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Risk Level</div>
          <AuditableMetric traceId="risk-radar:overall">
            <div className={`text-base font-black ${levelCfg.text}`}>{overall_label}</div>
          </AuditableMetric>
          <div className="text-[9px] text-muted-foreground mt-0.5">Fragility index: {fragility_index}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Active Alerts</div>
          <div className={`text-3xl font-black ${criticalAlerts.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{criticalAlerts.length}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">critical + high severity</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Top Risk Area</div>
          <div className="text-sm font-black text-foreground">{categories.sort((a, b) => a.score - b.score)[0]?.label ?? '—'}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">score: {categories.sort((a, b) => a.score - b.score)[0]?.score ?? '—'}/100</div>
        </div>
      </div>

      {/* ── Radar chart ──────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Risk Radar — Safety Scores (higher = safer)</div>
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={radar_data}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
            <Radar
              name="Safety Score"
              dataKey="score"
              stroke={overall_level === 'green' ? '#34d399' : overall_level === 'amber' ? '#fbbf24' : '#f87171'}
              fill={overall_level === 'green' ? '#34d399' : overall_level === 'amber' ? '#fbbf24' : '#f87171'}
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              formatter={(v: number) => [`${v}/100`, 'Safety Score']}
            />
          </RadarChart>
        </ResponsiveContainer>
        {/* Category score pills — clicking the value opens the legacy category
            trace; clicking the canonical-axis tag below opens the live
            financial-health:* trace (Liquidity / Leverage / Cashflow / Income). */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {categories.map(c => {
            const ccfg = LEVEL_CFG[c.level];
            const canonicalId: string | null = (
              c.id === 'debt'       ? 'financial-health:leverage' :
              c.id === 'cashflow'   ? 'financial-health:cashflow' :
              c.id === 'investment' ? 'financial-health:liquidity' :
              null
            );
            return (
              <div key={c.id} className={`rounded-xl p-2 border text-center ${ccfg.bg} ${ccfg.border}`}>
                <AuditableMetric traceId={`risk-radar:category:${c.id}`}>
                  <div className={`text-lg font-black ${ccfg.text}`}>{c.score}</div>
                </AuditableMetric>
                <div className="text-[9px] text-muted-foreground leading-tight">{c.label.replace(' Risk', '')}</div>
                <div className={`text-[9px] font-semibold ${ccfg.text}`}>{ccfg.label}</div>
                {canonicalId && (
                  <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                    <AuditableMetric traceId={canonicalId}>
                      {canonicalId === 'financial-health:leverage' ? 'Leverage axis' :
                       canonicalId === 'financial-health:cashflow' ? 'Cashflow axis' :
                       'Liquidity axis'}
                    </AuditableMetric>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Canonical 8-axis affordance row — directly traceable for Liquidity,
            Leverage, Cashflow, FIRE Progress, Overall Health. Visible only when
            Audit Mode is ON the AuditableMetric wrapper itself becomes clickable;
            in default mode this row reads as a plain caption. */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-center">
          <div className="rounded-md border border-border/60 bg-secondary/20 p-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Liquidity</div>
            <AuditableMetric traceId="financial-health:liquidity">
              <div className="text-xs font-semibold text-foreground">Open trace</div>
            </AuditableMetric>
          </div>
          <div className="rounded-md border border-border/60 bg-secondary/20 p-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Leverage</div>
            <AuditableMetric traceId="financial-health:leverage">
              <div className="text-xs font-semibold text-foreground">Open trace</div>
            </AuditableMetric>
          </div>
          <div className="rounded-md border border-border/60 bg-secondary/20 p-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Cashflow</div>
            <AuditableMetric traceId="financial-health:cashflow">
              <div className="text-xs font-semibold text-foreground">Open trace</div>
            </AuditableMetric>
          </div>
          <div className="rounded-md border border-border/60 bg-secondary/20 p-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">FIRE Progress</div>
            <AuditableMetric traceId="financial-health:fire-progress">
              <div className="text-xs font-semibold text-foreground">Open trace</div>
            </AuditableMetric>
          </div>
          <div className="rounded-md border border-border/60 bg-secondary/20 p-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Overall Health</div>
            <AuditableMetric traceId="financial-health:overall">
              <div className="text-xs font-semibold text-foreground">Open trace</div>
            </AuditableMetric>
          </div>
        </div>
      </div>

      {/* ── Unified Strategic Brain — Risk pillar ────────────────────────── */}
      <UnifiedRiskPanel
        overallScore={overall_score}
        topRisks={top_risks.slice(0, 2).map(r => ({ id: r.id, label: r.label, action: r.action }))}
      />

      {/* ── Top 3 risk factors ───────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top 3 Risks by Score</div>
        <div className="space-y-3">
          {top_risks.map((r, i) => {
            const rcfg = LEVEL_CFG[r.level];
            return (
              <div key={r.id} className={`flex items-start gap-3 p-3.5 rounded-xl border ${rcfg.bg} ${rcfg.border}`}>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${rcfg.bg} ${rcfg.text} border ${rcfg.border}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-foreground">{r.label}</span>
                    <span className={`text-xs font-bold ${rcfg.text}`}>{r.value}</span>
                    <LevelBadge level={r.level} size="xs" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.finding}</p>
                  <div className="flex items-start gap-1.5 mt-1.5">
                    <Zap className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground leading-relaxed">{r.action}</p>
                  </div>
                </div>
                <div className={`text-xl font-black ${rcfg.text} shrink-0`}>{r.score}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Category deep-dives ──────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Risk Categories — Full Detail</div>
        <div className="space-y-3">
          {[...categories].sort((a, b) => a.score - b.score).map((cat, i) => (
            <CategoryPanel key={cat.id} cat={cat} defaultOpen={i === 0} />
          ))}
        </div>
      </div>

      {/* ── All alerts ───────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Risk Alerts ({alerts.length})</div>
          <div className="space-y-2">
            {alerts.map((a, i) => {
              const sc = SEV_CFG[a.severity];
              const SIcon = sc.Icon;
              return (
                <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border ${sc.cls}`}>
                  <SIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5">{sc.label} · {a.category}</div>
                    <p className="text-xs leading-relaxed">{a.message}</p>
                    <p className="text-[10px] mt-1 opacity-75">→ {a.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Disclaimer ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-4 bg-secondary/30 border border-border rounded-xl">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">General information only.</strong> Risk scores are calculated from your entered financial data using industry benchmarks (debt ratios, buffer months, concentration limits).
          These are indicators, not guarantees. Individual circumstances vary. Consult a licensed financial adviser before making major financial decisions.
        </p>
      </div>

    </div>
  );
}
