/**
 * ai-weekly-cfo.tsx
 * AI Weekly CFO — Full page: report viewer, history, scores, manual run.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BrainCircuit, RefreshCw, ChevronRight, ChevronDown, AlertTriangle,
  TrendingUp, TrendingDown, Zap, Target, Shield, DollarSign,
  Calendar, CheckCircle2, XCircle, Clock, Flame, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { generateCFOReport, saveCFOReport, getCFOReports, getCFOSettings, type CFOReport, type CFOSettings } from '@/lib/cfoEngine';
import { formatCFOTelegram } from '@/lib/cfoEngine';
import { getTelegramSettings, sendWeeklySummary } from '@/lib/notifications';
import { useToast } from '@/hooks/use-toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(dec)}K`;
  return `$${n.toFixed(dec)}`;
}

function scoreBand(n: number): { color: string; label: string } {
  if (n >= 80) return { color: 'text-emerald-400', label: 'Excellent' };
  if (n >= 65) return { color: 'text-green-400',   label: 'Good' };
  if (n >= 50) return { color: 'text-amber-400',   label: 'Fair' };
  return            { color: 'text-red-400',        label: 'Needs Work' };
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#334155" strokeWidth="5" />
          <circle cx="32" cy="32" r={r} fill="none"
            stroke="currentColor" strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color}`}>
          {score}
        </span>
      </div>
      <span className="text-[10px] text-zinc-400 text-center leading-tight">{label}</span>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-zinc-400 text-xs flex items-center gap-0.5"><Minus className="w-3 h-3" />—</span>;
  const positive = delta > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {positive ? '+' : ''}{fmt(delta)}
    </span>
  );
}

// ─── Report card (history list item) ─────────────────────────────────────────

function ReportCard({ report, onSelect, selected }: { report: any; onSelect: () => void; selected: boolean }) {
  const overall = Math.round(((report.wealth_score ?? 70) + (report.cashflow_score ?? 70) + (report.risk_score ?? 70) + (report.discipline_score ?? 70)) / 4);
  const band = scoreBand(overall);
  const delta = report.networth_delta ?? 0;
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        selected ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{report.week_date}</p>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{report.summary?.slice(0, 70)}…</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-bold ${band.color}`}>{overall}/100</span>
          <DeltaBadge delta={delta} />
        </div>
      </div>
    </button>
  );
}

// ─── Full report viewer ───────────────────────────────────────────────────────

function ReportViewer({ report }: { report: any }) {
  const kpis = report.json_payload?.kpis ?? {};
  const fire = report.json_payload?.fire ?? {};
  const lookahead: any[] = report.json_payload?.lookahead ?? [];
  const alerts: string[]  = report.alerts ?? [];
  const opps: string[]    = report.opportunities ?? [];
  const [showFull, setShowFull] = useState(true);

  const overall = Math.round(((report.wealth_score ?? 70) + (report.cashflow_score ?? 70) + (report.risk_score ?? 70) + (report.discipline_score ?? 70)) / 4);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-bold text-white">AI Weekly CFO Report</h2>
            </div>
            <p className="text-xs text-zinc-400">{report.week_date}</p>
          </div>
          <div className="flex items-center gap-3">
            {report.telegram_sent && <span className="text-xs text-zinc-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Telegram sent</span>}
            <span className={`text-2xl font-black ${scoreBand(overall).color}`}>{overall}<span className="text-sm font-normal text-zinc-500">/100</span></span>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{report.summary}</p>
      </div>

      {/* Score rings */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Scores</p>
        <div className="flex justify-around flex-wrap gap-4">
          <ScoreRing score={report.wealth_score ?? 0}     label="Wealth"     color={scoreBand(report.wealth_score ?? 0).color} />
          <ScoreRing score={report.cashflow_score ?? 0}   label="Cashflow"   color={scoreBand(report.cashflow_score ?? 0).color} />
          <ScoreRing score={report.risk_score ?? 0}       label="Risk"       color={scoreBand(report.risk_score ?? 0).color} />
          <ScoreRing score={report.discipline_score ?? 0} label="Discipline" color={scoreBand(report.discipline_score ?? 0).color} />
        </div>
      </div>

      {/* KPI grid */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">KPI Snapshot</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Net Worth',       val: fmt(report.networth ?? 0),         sub: <DeltaBadge delta={report.networth_delta ?? 0} /> },
            { label: 'Cash Available',  val: fmt(report.cash ?? 0),             sub: null },
            { label: 'Monthly Surplus', val: fmt(report.monthly_surplus ?? 0),  sub: null },
            { label: 'Portfolio Value', val: fmt(report.portfolio_value ?? 0),  sub: null },
            { label: 'Total Debt',      val: fmt(report.debt_total ?? 0),       sub: null },
            { label: 'Super Combined',  val: fmt(kpis.super_combined ?? 0),     sub: null },
            { label: 'Offset Balance',  val: fmt(kpis.offset_balance ?? 0),     sub: kpis.offset_annual_saving ? <span className="text-emerald-400 text-xs">{fmt(kpis.offset_annual_saving)}/yr saved</span> : null },
            { label: 'FIRE Progress',   val: `${(report.fire_progress ?? 0).toFixed(1)}%`, sub: null },
            { label: 'FIRE Year',       val: String(report.fire_year ?? '—'),   sub: null },
          ].map(({ label, val, sub }) => (
            <div key={label} className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-bold text-white mt-0.5">{val}</p>
              {sub && <div className="mt-0.5">{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Best Move */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-bold text-amber-300">Best Move This Week</p>
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed">{report.best_move}</p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <p className="text-sm font-bold text-white">Alerts & Risks</p>
            <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{alerts.length}</span>
          </div>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-red-400 mt-0.5 shrink-0">•</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {opps.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-bold text-white">Opportunities</p>
          </div>
          <ul className="space-y-2">
            {opps.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-emerald-400 mt-0.5 shrink-0">→</span>{o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FIRE section */}
      {fire.fire_year && (
        <div className="rounded-xl border border-orange-500/20 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-orange-400" />
            <p className="text-sm font-bold text-white">FIRE Tracker</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">Target Capital</p>
              <p className="text-sm font-bold text-white">{fmt(fire.target_capital ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">Current Investable</p>
              <p className="text-sm font-bold text-white">{fmt(fire.current_investable ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">FIRE Year</p>
              <p className="text-sm font-bold text-orange-400">{fire.fire_year}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-[10px] text-zinc-500 uppercase">Semi-FIRE Year</p>
              <p className="text-sm font-bold text-zinc-200">{fire.semi_fire_year}</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Progress</span>
              <span>{(fire.progress_pct ?? 0).toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all"
                style={{ width: `${Math.min(100, fire.progress_pct ?? 0)}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            {fire.on_track ? '✅ On track' : '⚠️ Behind plan'} — {fire.accelerator}
          </p>
        </div>
      )}

      {/* 30-day lookahead */}
      {lookahead.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-400" />
            <p className="text-sm font-bold text-white">Next 30 Days</p>
          </div>
          <ul className="space-y-2">
            {lookahead.slice(0, 8).map((item, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.type === 'bill' ? 'bg-red-400' : item.type === 'income' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                  <span className="text-zinc-300">{item.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  {item.amount && <span className={`text-xs font-mono ${item.type === 'income' ? 'text-emerald-400' : 'text-zinc-400'}`}>{item.type === 'income' ? '+' : '-'}{fmt(item.amount)}</span>}
                  <span className="text-xs text-zinc-500">{item.date}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AIWeeklyCFOPage() {
  const { privacyMode } = useAppStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['/api/cfo-reports'],
    queryFn: () => getCFOReports(12),
  });

  const { data: cfoSettings } = useQuery<CFOSettings>({
    queryKey: ['/api/cfo-settings'],
    queryFn: getCFOSettings,
  });

  // Auto-select latest report
  useEffect(() => {
    if (reports.length > 0 && !selectedId) {
      setSelectedId(reports[0].id);
    }
  }, [reports]);

  const selectedReport = reports.find((r: any) => r.id === selectedId) ?? reports[0] ?? null;

  const handleRunNow = async () => {
    setRunning(true);
    try {
      toast({ title: 'Generating CFO Report…', description: 'Analysing all financial data' });
      const report = await generateCFOReport(cfoSettings?.tone ?? 'Balanced');

      // Try Telegram
      let telegramSent = false;
      if (cfoSettings?.telegram_enabled !== false) {
        try {
          const tgSettings = await getTelegramSettings();
          if (tgSettings?.enabled && tgSettings.bot_token) {
            const msg = formatCFOTelegram(report);
            const res = await fetch(
              `https://api.telegram.org/bot${tgSettings.bot_token}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: tgSettings.roham_chat_id,
                  text: msg,
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                }),
              }
            );
            telegramSent = res.ok;
          }
        } catch {}
      }

      await saveCFOReport(report, telegramSent);
      await qc.invalidateQueries({ queryKey: ['/api/cfo-reports'] });

      toast({
        title: '✅ CFO Report Generated',
        description: `${telegramSent ? 'Sent via Telegram. ' : ''}Saved to history.`,
      });
    } catch (err: any) {
      toast({ title: 'Report Failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const lastRun  = cfoSettings?.last_run_at;
  const nextSat  = (() => {
    const d = new Date();
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(8, 0, 0, 0);
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  })();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
            <BrainCircuit className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI Weekly CFO</h1>
            <p className="text-xs text-zinc-400">Private financial intelligence briefing</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-zinc-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Next: {cfoSettings?.delivery_day ?? 'Saturday'} {cfoSettings?.delivery_time ?? '08:00'} AEST ({nextSat})
          </div>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Generating…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 mb-6 flex flex-wrap gap-4 items-center text-xs text-zinc-400">
        <span className={`flex items-center gap-1 ${cfoSettings?.enabled !== false ? 'text-emerald-400' : 'text-red-400'}`}>
          {cfoSettings?.enabled !== false ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {cfoSettings?.enabled !== false ? 'Enabled' : 'Disabled'}
        </span>
        <span className="flex items-center gap-1">
          <span className={cfoSettings?.telegram_enabled ? 'text-blue-400' : 'text-zinc-600'}>Telegram {cfoSettings?.telegram_enabled ? '✓' : '✗'}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className={cfoSettings?.email_enabled ? 'text-blue-400' : 'text-zinc-600'}>Email {cfoSettings?.email_enabled ? '✓' : '✗'}</span>
        </span>
        <span>Tone: <span className="text-white">{cfoSettings?.tone ?? 'Balanced'}</span></span>
        {lastRun && <span>Last run: <span className="text-zinc-300">{new Date(lastRun).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>}
        <span className="ml-auto">{reports.length} report{reports.length !== 1 ? 's' : ''} saved</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading reports…
        </div>
      )}

      {!isLoading && reports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BrainCircuit className="w-12 h-12 text-violet-400/40 mb-4" />
          <p className="text-zinc-400 text-lg font-semibold mb-1">No CFO reports yet</p>
          <p className="text-zinc-600 text-sm mb-6">Reports run automatically every Saturday at 8:00 AM.<br />Click "Run Now" to generate your first briefing.</p>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold disabled:opacity-50 transition-colors"
          >
            <Zap className="w-4 h-4" />
            {running ? 'Generating…' : 'Generate First Report'}
          </button>
        </div>
      )}

      {!isLoading && reports.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
          {/* Report history list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide px-1 mb-2">Report History</p>
            {reports.map((r: any) => (
              <ReportCard
                key={r.id}
                report={r}
                selected={r.id === (selectedReport?.id)}
                onSelect={() => setSelectedId(r.id)}
              />
            ))}
          </div>

          {/* Report viewer */}
          <div>
            {selectedReport ? (
              <ReportViewer report={selectedReport} />
            ) : (
              <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
                Select a report to view
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
