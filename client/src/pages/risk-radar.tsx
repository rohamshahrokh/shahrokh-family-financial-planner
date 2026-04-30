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
import {
  Shield, AlertTriangle, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Info, TrendingDown, Zap,
} from 'lucide-react';
import { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';

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

  const { data: snap } = useQuery<any>({ queryKey: ['/api/snapshots/latest'] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ['/api/properties'] });
  const { data: expenses = [] } = useQuery<any[]>({ queryKey: ['/api/expenses'] });

  if (!snap) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-secondary/40 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  const input  = buildRiskInput(snap, properties, expenses);
  const result = computeRiskRadar(input);
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
          <div className={`text-3xl font-black ${levelCfg.text}`}>{overall_score}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">/ 100</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Risk Level</div>
          <div className={`text-base font-black ${levelCfg.text}`}>{overall_label}</div>
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
        {/* Category score pills */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {categories.map(c => {
            const ccfg = LEVEL_CFG[c.level];
            return (
              <div key={c.id} className={`rounded-xl p-2 border text-center ${ccfg.bg} ${ccfg.border}`}>
                <div className={`text-lg font-black ${ccfg.text}`}>{c.score}</div>
                <div className="text-[9px] text-muted-foreground leading-tight">{c.label.replace(' Risk', '')}</div>
                <div className={`text-[9px] font-semibold ${ccfg.text}`}>{ccfg.label}</div>
              </div>
            );
          })}
        </div>
      </div>

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
