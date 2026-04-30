/**
 * CFODashboardWidget.tsx — Saturday Morning Bulletin executive card for Dashboard.
 *
 * Uses CFOBulletin type (new engine). Shows:
 *   - Overall CFO score (large) + 5 sub-score rings
 *   - Snapshot: Net Worth delta, Liquid Cash, Monthly Surplus, FIRE %
 *   - Smart action of the week
 *   - Top risk alert
 *   - 7-day cashflow status
 *   - "Full Bulletin" link
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  getCFOReports,
  generateCFOReport,
  saveCFOReport,
  type CFOBulletin,
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
  Zap,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({
  score, label, color, size = 52,
}: {
  score: number; label: string; color: string; size?: number;
}) {
  const c = Math.max(0, Math.min(100, score));
  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          style={{ width: size, height: size }}
          className="-rotate-90"
          viewBox="0 0 48 48"
        >
          <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle
            cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (c / 100) * circ}
            style={{ transition: "stroke-dashoffset 0.7s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-black text-white">{c}</span>
        </div>
      </div>
      <span className="text-[9px] text-slate-500 text-center">{label}</span>
    </div>
  );
}

// ─── Legacy row normaliser ─────────────────────────────────────────────────────
function normaliseBulletin(raw: any): CFOBulletin | null {
  if (!raw) return null;
  if (raw.scores && typeof raw.scores.overall === 'number') return raw as CFOBulletin;
  // Legacy flat format
  const legacy: CFOBulletin = {
    ...raw,
    week_date:    raw.week_date    ?? new Date().toISOString().split('T')[0],
    generated_at: raw.generated_at ?? raw.week_date ?? new Date().toISOString(),
    scores: {
      wealth:      raw.wealth_score      ?? 0,
      cashflow:    raw.cashflow_score    ?? 0,
      risk:        raw.risk_score        ?? 0,
      discipline:  raw.discipline_score  ?? 0,
      opportunity: 0,
      overall: Math.round(((raw.wealth_score ?? 0) + (raw.cashflow_score ?? 0) + (raw.risk_score ?? 0) + (raw.discipline_score ?? 0)) / 4),
    },
    snapshot: raw.snapshot ?? {
      net_worth:          raw.networth         ?? 0,
      net_worth_delta:    raw.networth_delta   ?? 0,
      cash_everyday:      raw.cash             ?? 0,
      cash_savings:       0, cash_emergency: 0, cash_other: 0,
      offset_balance:     0,
      liquid_cash:        raw.cash             ?? 0,
      offset_interest_saving: 0,
      monthly_surplus:    raw.monthly_surplus  ?? 0,
      debt_ratio:         0,
      fire_progress_pct:  raw.fire_progress    ?? 0,
      years_to_fire:      0,
      fire_year:          raw.fire_year        ?? 0,
      fire_on_track:      true,
      total_assets:       0,
      total_debt:         raw.debt_total       ?? 0,
      portfolio_value:    raw.portfolio_value  ?? 0,
      super_combined:     0,
    },
    cashflow: raw.cashflow ?? {
      income_expected: 0, bills_total: 0,
      net_cashflow: raw.cashflow_next14 ?? 0,
      status: 'green' as const,
      bills: raw.bills_ahead ?? [],
    },
    investment: raw.investment ?? {
      stocks_value: 0, stocks_delta: 0, stocks_delta_pct: 0,
      best_stock: '', worst_stock: '',
      crypto_value: 0, crypto_delta: 0, crypto_delta_pct: 0,
      dca_active: [], planned_buys: [], portfolio_total: raw.portfolio_value ?? 0,
    },
    fire: raw.fire ?? {
      target_passive_income: 0, current_passive_income: 0,
      years_remaining: 0, progress_pct: raw.fire_progress ?? 0,
      fire_year: raw.fire_year ?? 0, semi_fire_year: 0,
      target_capital: 0, investable: 0, on_track: true, accelerator: '',
    },
    property_watch: raw.property_watch ?? {
      buy_score: 5, wait_score: 5, borrowing_power: 0, deposit_ready: 0, market_summary: '',
    },
    tax_alpha: raw.tax_alpha ?? {
      neg_gearing_benefit: 0, super_room_remaining: 0, estimated_refund: 'N/A', tips: [],
    },
    risk_alerts:        raw.risk_alerts       ?? raw.alerts ?? [],
    top_expenses:       raw.top_expenses      ?? [],
    spending_insight:   raw.spending_insight  ?? '',
    smart_action:       raw.smart_action      ?? raw.best_move ?? '',
    smart_action_value: raw.smart_action_value ?? '',
    cfo_insight:        raw.cfo_insight       ?? raw.summary ?? '',
    opportunities:      raw.opportunities     ?? [],
  };
  return legacy;
}

// ─── Traffic dot ──────────────────────────────────────────────────────────────
function TrafficDot({ status }: { status: "green" | "amber" | "red" }) {
  const cls = status === "green" ? "bg-emerald-400" : status === "amber" ? "bg-amber-400" : "bg-red-400";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls} mr-1`} />;
}

// ─── Widget ───────────────────────────────────────────────────────────────────
export default function CFODashboardWidget() {
  const { privacyMode } = useAppStore();
  const mv = (val: string) => maskValue(val, privacyMode, "currency");

  const [report, setReport]       = useState<CFOBulletin | null>(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getCFOReports(1);
      setReport(normaliseBulletin(rows?.[0]?.json_payload));
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

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0d1421] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit size={17} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={22} className="animate-spin text-cyan-400" />
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0d1421] p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit size={17} className="text-cyan-400" />
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
      <div className="rounded-2xl border border-dashed border-cyan-900/60 bg-[#0d1421] p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BrainCircuit size={17} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          No bulletin generated yet. Run your first weekly briefing to see your financial score,
          cash breakdown, 7-day cashflow, FIRE tracker, and your best move.
        </p>
        <Button
          size="sm"
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-xs"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <><Loader2 size={12} className="mr-1.5 animate-spin" />Generating…</>
            : <><BrainCircuit size={12} className="mr-1.5" />Generate First Bulletin</>}
        </Button>
      </div>
    );
  }

  // ── Report present ───────────────────────────────────────────────────────────
  const { scores, snapshot: snap, cashflow } = report;
  const nwUp       = snap.net_worth_delta >= 0;
  const surplusUp  = snap.monthly_surplus >= 0;
  const scoreColor = scores.overall >= 75 ? "#22d3ee" : scores.overall >= 55 ? "#f59e0b" : "#f87171";
  const scoreLabel = scores.overall >= 75 ? "Excellent" : scores.overall >= 55 ? "Fair" : "Needs Attention";

  return (
    <div className="rounded-2xl border border-cyan-900/40 bg-[#090e1a] mb-6 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <BrainCircuit size={17} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Saturday Morning Bulletin</span>
          <span className="text-[10px] text-slate-600 ml-1">
            Week of {fmtShort(report.week_date)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-cyan-400 transition-colors"
            onClick={handleGenerate}
            disabled={generating}
            title="Regenerate bulletin"
          >
            {generating
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />}
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
        <div className="flex items-stretch gap-4 flex-wrap sm:flex-nowrap">

          {/* Left: overall score */}
          <div className="flex flex-col items-center justify-center min-w-[80px]">
            <div
              className="text-5xl font-black tabular-nums leading-none"
              style={{ color: scoreColor, textShadow: `0 0 28px ${scoreColor}50` }}
            >
              {scores.overall}
            </div>
            <div className="text-[10px] font-semibold mt-1" style={{ color: scoreColor }}>
              {scoreLabel}
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">CFO Score</div>
          </div>

          {/* Divider */}
          <div className="w-px bg-white/[0.05] self-stretch hidden sm:block" />

          {/* Centre: 5 score rings + snapshot */}
          <div className="flex-1 min-w-0">
            {/* Score rings — 5 */}
            <div className="flex gap-2.5 mb-3.5 flex-wrap">
              <ScoreRing score={scores.wealth}      label="Wealth"      color="#22d3ee" />
              <ScoreRing score={scores.cashflow}    label="Cashflow"    color="#a78bfa" />
              <ScoreRing score={scores.risk}        label="Risk"        color="#34d399" />
              <ScoreRing score={scores.discipline}  label="Discipline"  color="#f59e0b" />
              <ScoreRing score={scores.opportunity} label="Opportunity" color="#f97316" />
            </div>

            {/* Snapshot row */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {/* Net Worth */}
              <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Net Worth</div>
                <div className="text-xs font-bold text-white mt-0.5">{mv(fmt(snap.net_worth))}</div>
                <div className={`text-[10px] mt-0.5 ${nwUp ? "text-emerald-400" : "text-red-400"}`}>
                  {nwUp ? "▲" : "▼"} {mv(fmt(Math.abs(snap.net_worth_delta)))}
                </div>
              </div>
              {/* Liquid Cash */}
              <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Liquid Cash</div>
                <div className="text-xs font-bold text-white mt-0.5">{mv(fmt(snap.liquid_cash))}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Offset: {mv(fmt(snap.offset_balance))}</div>
              </div>
              {/* Surplus */}
              <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Surplus/mo</div>
                <div className={`text-xs font-bold mt-0.5 ${surplusUp ? "text-emerald-400" : "text-red-400"}`}>
                  {mv(fmt(snap.monthly_surplus))}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Debt: {(snap.debt_ratio * 100).toFixed(0)}%</div>
              </div>
              {/* FIRE */}
              <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">FIRE</div>
                <div className="text-xs font-bold text-orange-400 mt-0.5">{snap.fire_progress_pct.toFixed(0)}%</div>
                <div className="text-[10px] text-slate-500 mt-0.5">FY {snap.fire_year}</div>
              </div>
            </div>

            {/* Smart action */}
            {report.smart_action && (
              <div className="rounded-xl bg-cyan-500/[0.08] border border-cyan-500/20 px-3 py-2">
                <div className="flex items-start gap-2">
                  <Zap size={11} className="text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider mb-0.5">
                      Smart Action
                    </div>
                    <div className="text-xs text-slate-200 leading-snug">{report.smart_action}</div>
                    {report.smart_action_value && (
                      <div className="text-[10px] text-cyan-300/70 mt-0.5">{report.smart_action_value}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CFO insight */}
        {report.cfo_insight && (
          <div className="mt-3 text-xs text-slate-400 border-t border-white/[0.04] pt-3">
            <span className="text-violet-400 font-medium">CFO: </span>
            {report.cfo_insight}
          </div>
        )}

        {/* Top risk alert */}
        {report.risk_alerts && report.risk_alerts.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-400">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{report.risk_alerts[0]}</span>
          </div>
        )}

        {/* 7-day cashflow status */}
        {cashflow && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <Calendar size={11} className="text-blue-400 shrink-0" />
            <TrafficDot status={cashflow.status} />
            <span className="text-slate-400">
              {cashflow.bills.length} bill{cashflow.bills.length !== 1 ? "s" : ""} due (7d)
              {" — "}net{" "}
              <span className={cashflow.net_cashflow >= 0 ? "text-emerald-400" : "text-red-400"}>
                {mv(fmt(cashflow.net_cashflow))}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          {report.risk_alerts?.length ?? 0} alert{(report.risk_alerts?.length ?? 0) !== 1 ? "s" : ""}
          {" · "}
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
