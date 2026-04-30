/**
 * RiskRadarCard.tsx — Dashboard compact card for Risk Radar Engine
 *
 * Shows overall risk score + radar chart + top 3 risks.
 * Links to full analysis inside /dashboard (Risk tab) or wealth-strategy page.
 */

import { useQuery } from '@tanstack/react-query';
import { computeRiskRadar, buildRiskInput, type RiskLevel } from '@/lib/riskEngine';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import { Link } from 'wouter';
import {
  Shield, AlertTriangle, CheckCircle2, ChevronRight,
  AlertCircle, TrendingDown,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';

// ─── Level badge ─────────────────────────────────────────────────────────────

const LEVEL_CFG: Record<RiskLevel, { label: string; cls: string; scoreCls: string; ringCls: string; Icon: any }> = {
  green: {
    label: 'Low Risk',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    scoreCls: 'text-emerald-400',
    ringCls: 'stroke-emerald-400',
    Icon: CheckCircle2,
  },
  amber: {
    label: 'Moderate Risk',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    scoreCls: 'text-amber-400',
    ringCls: 'stroke-amber-400',
    Icon: AlertTriangle,
  },
  red: {
    label: 'High Risk',
    cls: 'bg-red-500/15 text-red-300 border-red-500/30',
    scoreCls: 'text-red-400',
    ringCls: 'stroke-red-400',
    Icon: AlertCircle,
  },
};

function ScoreDial({ score, level }: { score: number; level: RiskLevel }) {
  const cfg = LEVEL_CFG[level];
  const circumference = 2 * Math.PI * 38;
  const dash = (score / 100) * circumference;

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="38" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <circle
          cx="44" cy="44" r="38" fill="none"
          stroke={level === 'green' ? '#34d399' : level === 'amber' ? '#fbbf24' : '#f87171'}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black tabular-nums leading-none ${cfg.scoreCls}`}>{score}</span>
        <span className="text-[9px] text-muted-foreground mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export default function RiskRadarCard() {
  const privacyMode = useAppStore(s => s.privacyMode);
  const mv = (v: string) => maskValue(v, privacyMode);

  const { data: snap } = useQuery<any>({ queryKey: ['/api/snapshot'] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ['/api/properties'] });
  const { data: expenses = [] } = useQuery<any[]>({ queryKey: ['/api/expenses'] });

  if (!snap) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="h-4 bg-secondary rounded animate-pulse w-1/2 mb-3" />
        <div className="h-3 bg-secondary rounded animate-pulse w-3/4" />
      </div>
    );
  }

  const input  = buildRiskInput(snap, properties, expenses);
  const result = computeRiskRadar(input);
  const { overall_score, overall_level, overall_label, top_risks, radar_data, alerts } = result;

  const cfg = LEVEL_CFG[overall_level];
  const LevelIcon = cfg.Icon;
  const criticals = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 2);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${cfg.cls}`}>
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">Risk Radar</div>
            <div className="text-[10px] text-muted-foreground">Financial Fragility Engine</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${cfg.cls}`}>
          <LevelIcon className="w-2.5 h-2.5" />
          {overall_label}
        </span>
      </div>

      {/* Score dial + radar chart */}
      <div className="flex items-center gap-4">
        <ScoreDial score={overall_score} level={overall_level} />
        <div className="flex-1 min-w-0 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radar_data} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke={overall_level === 'green' ? '#34d399' : overall_level === 'amber' ? '#fbbf24' : '#f87171'}
                fill={overall_level === 'green' ? '#34d399' : overall_level === 'amber' ? '#fbbf24' : '#f87171'}
                fillOpacity={0.15}
              />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v}/100`, 'Safety Score']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category scores */}
      <div className="grid grid-cols-4 gap-1.5">
        {result.categories.map(c => {
          const ccfg = LEVEL_CFG[c.level];
          return (
            <div key={c.id} className={`rounded-xl p-2 border text-center ${ccfg.cls}`}>
              <div className="text-xs font-black">{c.score}</div>
              <div className="text-[9px] font-medium leading-tight mt-0.5 opacity-80">{c.label.replace(' Risk', '')}</div>
            </div>
          );
        })}
      </div>

      {/* Top risks */}
      {top_risks.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Top Risks</div>
          {top_risks.map(r => (
            <div key={r.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${
              r.level === 'red' ? 'bg-red-500/8 border-red-500/20' :
              r.level === 'amber' ? 'bg-amber-500/8 border-amber-500/20' :
              'bg-emerald-500/8 border-emerald-500/20'
            }`}>
              <TrendingDown className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                r.level === 'red' ? 'text-red-400' : r.level === 'amber' ? 'text-amber-400' : 'text-emerald-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-foreground">{r.label} — <span className={
                  r.level === 'red' ? 'text-red-400' : r.level === 'amber' ? 'text-amber-400' : 'text-emerald-400'
                }>{r.value}</span></div>
                <div className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{r.action}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <Link href="/wealth-strategy">
        <button
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/60 hover:bg-secondary border border-border text-foreground text-xs font-semibold transition-all"
          onClick={() => sessionStorage.setItem('wealth-strategy-tab', 'risk-radar')}
        >
          <Shield className="w-3.5 h-3.5" />
          Full Risk Breakdown
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </Link>

    </div>
  );
}
