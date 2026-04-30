/**
 * CFODashboardWidget.tsx
 * Saturday Morning Bulletin — compact dashboard card.
 *
 * Shows: score, snapshot KPIs, spending insight, top alert, best move.
 * Links to the full bulletin page.
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  getCFOReports,
  generateCFOReport,
  saveCFOReport,
  type CFOReport,
} from "@/lib/cfoEngine";
import {
  BrainCircuit,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Target,
  ChevronRight,
  RefreshCw,
  Loader2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, label, icon: Icon, color }: {
  score: number; label: string; icon: React.ElementType; color: string;
}) {
  const c    = Math.max(0, Math.min(100, score));
  const circ = 2 * Math.PI * 20;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (c / 100) * circ}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{c}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Icon size={10} style={{ color }} />
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────
export default function CFODashboardWidget() {
  const { privacyMode } = useAppStore();
  const mv = (val: string) => maskValue(val, privacyMode, "currency");

  const [report, setReport] = useState<CFOReport | null>(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getCFOReports(1);
      setReport(rows?.[0]?.report_json as CFOReport ?? null);
    } catch {
      setError("Could not load bulletin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await generateCFOReport("Balanced");
      await saveCFOReport(r, false);
      setReport(r);
    } catch {
      setError("Failed to generate bulletin. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, []);

  const overallScore = report
    ? Math.round((report.wealth_score + report.cashflow_score + report.risk_score + report.discipline_score) / 4)
    : 0;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f1724] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f1724] p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
        </div>
        <div className="flex items-center gap-2 text-red-400 text-sm mb-3">
          <AlertCircle size={13} />
          <span>{error}</span>
        </div>
        <Button size="sm" variant="outline" className="text-xs" onClick={fetchLatest}>
          <RefreshCw size={12} className="mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // ── No report yet ────────────────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-cyan-900/60 bg-[#0f1724] p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          No bulletin generated yet. Run your first weekly briefing to see your financial score, top expenses, bills ahead, and best move.
        </p>
        <Button
          size="sm"
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-xs"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <><Loader2 size={12} className="mr-1 animate-spin" /> Generating…</>
            : <><BrainCircuit size={12} className="mr-1" /> Generate First Bulletin</>}
        </Button>
      </div>
    );
  }

  // ── Report present ───────────────────────────────────────────────────────────
  const snap   = report.snapshot;
  const nwUp   = snap.net_worth_delta >= 0;
  const scoreColor = overallScore >= 75 ? "#22d3ee" : overallScore >= 50 ? "#f59e0b" : "#f87171";

  return (
    <div className="rounded-2xl border border-cyan-900/40 bg-[#0a1420] mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
          <span className="text-[10px] text-slate-500 ml-1">Week of {fmtDate(report.week_date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-cyan-400 transition-colors"
            onClick={handleGenerate}
            disabled={generating}
            title="Regenerate bulletin"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <Link href="/ai-weekly-cfo">
            <button className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
              Full Bulletin <ChevronRight size={12} />
            </button>
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <div className="flex items-stretch gap-5 flex-wrap sm:flex-nowrap">
          {/* Left: overall score */}
          <div className="flex flex-col items-center justify-center min-w-[90px]">
            <div
              className="text-5xl font-black tabular-nums"
              style={{ color: scoreColor, textShadow: `0 0 24px ${scoreColor}40` }}
            >
              {overallScore}
            </div>
            <div className="text-[10px] font-semibold mt-0.5" style={{ color: scoreColor }}>
              {overallScore >= 75 ? "Excellent" : overallScore >= 50 ? "Fair" : "Needs Attention"}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">CFO Score</div>
          </div>

          {/* Divider */}
          <div className="w-px bg-white/5 self-stretch hidden sm:block" />

          {/* Centre: sub-scores + snapshot */}
          <div className="flex-1 min-w-0">
            {/* Score rings */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <ScoreRing score={report.wealth_score}    label="Wealth"     icon={TrendingUp}  color="#22d3ee" />
              <ScoreRing score={report.cashflow_score}  label="Cashflow"   icon={Wallet}      color="#a78bfa" />
              <ScoreRing score={report.risk_score}      label="Risk"       icon={ShieldCheck} color="#34d399" />
              <ScoreRing score={report.discipline_score} label="Discipline" icon={Target}      color="#f59e0b" />
            </div>

            {/* Snapshot row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Net Worth</div>
                <div className="text-xs font-bold text-white mt-0.5">{mv(fmt(snap.net_worth))}</div>
                <div className={`text-[10px] mt-0.5 ${nwUp ? "text-emerald-400" : "text-red-400"}`}>
                  {nwUp ? "▲" : "▼"} {mv(fmt(Math.abs(snap.net_worth_delta)))}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Cash</div>
                <div className="text-xs font-bold text-white mt-0.5">{mv(fmt(snap.cash))}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Offset: {mv(fmt(snap.offset_balance))}</div>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">FIRE</div>
                <div className="text-xs font-bold text-orange-400 mt-0.5">{snap.fire.progress_pct.toFixed(0)}%</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Target: {snap.fire.fire_year}</div>
              </div>
            </div>

            {/* Best Move */}
            {report.best_move && (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-3 py-2">
                <div className="flex items-start gap-2">
                  <Target size={12} className="text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider mb-0.5">
                      Best Move This Week
                    </div>
                    <div className="text-xs text-slate-200 leading-relaxed">{report.best_move}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Spending insight */}
        {report.spending_insight && (
          <div className="mt-3 text-xs text-slate-400 border-t border-white/5 pt-3">
            <span className="text-violet-400 font-medium">Insight: </span>
            {report.spending_insight}
          </div>
        )}

        {/* Top alert */}
        {report.alerts && report.alerts.length > 0 && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-400">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{report.alerts[0]}</span>
          </div>
        )}

        {/* Bills count */}
        {report.bills_ahead && report.bills_ahead.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
            <Calendar size={12} className="shrink-0" />
            <span>{report.bills_ahead.length} bill{report.bills_ahead.length !== 1 ? "s" : ""} due in next 14 days — total {mv(fmt(report.bills_ahead.reduce((s, b) => s + b.amount, 0)))}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          {report.alerts?.length ?? 0} alert{(report.alerts?.length ?? 0) !== 1 ? "s" : ""} · {" "}
          {report.top_expenses?.length ?? 0} top expense{(report.top_expenses?.length ?? 0) !== 1 ? "s" : ""}
        </span>
        <Link href="/ai-weekly-cfo">
          <button className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
            View full bulletin <ChevronRight size={12} />
          </button>
        </Link>
      </div>
    </div>
  );
}
