/**
 * ai-weekly-cfo.tsx
 * Saturday Morning Financial Bulletin — full in-app viewer.
 *
 * Shows the 7-section bulletin with history list and a "Run Now" button.
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCFOReports,
  generateCFOReport,
  saveCFOReport,
  type CFOReport,
  type BulletinBillAhead,
  type BulletinExpense,
} from "@/lib/cfoEngine";
import {
  BrainCircuit,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  ShieldCheck,
  Target,
  Calendar,
  AlertCircle,
  ChevronRight,
  History,
  Flame,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const c = Math.max(0, Math.min(100, score));
  const circ = 2 * Math.PI * 20;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (c / 100) * circ}
            style={{ transition: "stroke-dashoffset 0.7s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{c}</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  icon,
  title,
  children,
  accent = "blue",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: "blue" | "orange" | "green" | "red" | "violet" | "cyan";
}) {
  const accents: Record<string, string> = {
    blue:   "text-blue-400",
    orange: "text-orange-400",
    green:  "text-emerald-400",
    red:    "text-red-400",
    violet: "text-violet-400",
    cyan:   "text-cyan-400",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1724] p-5 mb-4">
      <div className={`flex items-center gap-2 mb-4 ${accents[accent]}`}>
        {icon}
        <h3 className="font-semibold text-sm text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold ${color ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main bulletin viewer ─────────────────────────────────────────────────────
function BulletinViewer({ report }: { report: CFOReport }) {
  const { privacyMode } = useAppStore();
  const mv = (val: string) => maskValue(val, privacyMode, "currency");

  const snap  = report.snapshot;
  const nwUp  = snap.net_worth_delta >= 0;
  const surplusUp = snap.monthly_surplus >= 0;
  const overallScore = Math.round(
    (report.wealth_score + report.cashflow_score + report.risk_score + report.discipline_score) / 4
  );

  return (
    <div>
      {/* ── Score banner ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-900/40 bg-gradient-to-br from-[#0a1420] to-[#0d1a2d] p-5 mb-4">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Overall score */}
          <div className="flex flex-col items-center justify-center min-w-[80px]">
            <div
              className="text-5xl font-black"
              style={{
                color: overallScore >= 75 ? "#22d3ee" : overallScore >= 50 ? "#f59e0b" : "#f87171",
                textShadow: `0 0 24px ${overallScore >= 75 ? "#22d3ee40" : "#f59e0b40"}`,
              }}
            >
              {overallScore}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">CFO Score</div>
            <div className="text-[10px] text-slate-600">Week of {fmtDate(report.week_date)}</div>
          </div>
          <div className="w-px bg-white/5 self-stretch hidden sm:block" />
          {/* Sub-scores */}
          <div className="flex gap-4 flex-wrap">
            <ScoreRing score={report.wealth_score}    label="Wealth"     color="#22d3ee" />
            <ScoreRing score={report.cashflow_score}  label="Cashflow"   color="#a78bfa" />
            <ScoreRing score={report.risk_score}      label="Risk"       color="#34d399" />
            <ScoreRing score={report.discipline_score} label="Discipline" color="#f59e0b" />
          </div>
        </div>
      </div>

      {/* ── Section 1: Weekly Snapshot ─────────────────────────────────────── */}
      <SectionCard icon={<TrendingUp size={16} />} title="1. Weekly Snapshot" accent="cyan">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            label="Net Worth"
            value={mv(fmt(snap.net_worth))}
            sub={`${nwUp ? "▲" : "▼"} ${mv(fmt(Math.abs(snap.net_worth_delta)))} vs last bulletin`}
            color={nwUp ? "text-emerald-400" : "text-red-400"}
          />
          <KpiTile
            label="Cash"
            value={mv(fmt(snap.cash))}
            sub={`Offset: ${mv(fmt(snap.offset_balance))}`}
          />
          <KpiTile
            label="Monthly Surplus"
            value={mv(fmt(snap.monthly_surplus))}
            color={surplusUp ? "text-emerald-400" : "text-red-400"}
          />
          <KpiTile
            label="FIRE Progress"
            value={`${snap.fire.progress_pct.toFixed(0)}%`}
            sub={`Target: ${snap.fire.fire_year} (${snap.fire.years_away > 0 ? `${snap.fire.years_away.toFixed(1)}y away` : "Reached!"})`}
            color="text-orange-400"
          />
        </div>
        {/* FIRE progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>FIRE: {mv(fmt(snap.fire.investable))} of {mv(fmt(snap.fire.target_capital))}</span>
            <span className={snap.fire.on_track ? "text-emerald-400" : "text-amber-400"}>
              {snap.fire.on_track ? "✓ On track" : "⚠ Behind plan"}
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
              style={{ width: `${Math.min(100, snap.fire.progress_pct)}%`, transition: "width 0.6s ease" }}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Section 2: Top 3 Expenses ──────────────────────────────────────── */}
      <SectionCard icon={<Wallet size={16} />} title="2. Top 3 Expenses This Week" accent="orange">
        {report.top_expenses.length === 0 ? (
          <p className="text-slate-500 text-sm">No expense records found for this week.</p>
        ) : (
          <div className="space-y-2">
            {report.top_expenses.map((e: BulletinExpense, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{e.category}</span>
                    {e.flag !== "normal" && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          e.flag === "unusual"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {e.flag === "unusual" ? "Unusual" : "High"}
                      </span>
                    )}
                  </div>
                  {e.description && (
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">{e.description}</div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {e.member} · {e.date}
                  </div>
                </div>
                <div className="text-base font-bold text-red-400 ml-4">{mv(fmt(e.amount))}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Section 3: Spending Insight ────────────────────────────────────── */}
      <SectionCard icon={<ArrowUpRight size={16} />} title="3. Spending Insight" accent="violet">
        <p className="text-sm text-slate-200 leading-relaxed">{report.spending_insight}</p>
      </SectionCard>

      {/* ── Section 4: Bills & Cashflow Ahead ─────────────────────────────── */}
      <SectionCard icon={<Calendar size={16} />} title="4. Bills & Cashflow Ahead (14 days)" accent="blue">
        {report.bills_ahead.length === 0 ? (
          <p className="text-slate-500 text-sm">No bills due in the next 14 days.</p>
        ) : (
          <>
            <div className="space-y-2 mb-3">
              {report.bills_ahead.map((b: BulletinBillAhead, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5 border border-white/5"
                >
                  <div>
                    <div className="text-xs font-medium text-white">{b.bill_name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {b.due_date} · {b.days_away === 0 ? "Due today" : `in ${b.days_away} days`} · {b.frequency}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-orange-400">{mv(fmt(b.amount))}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5 border border-cyan-900/30 text-xs">
              <span className="text-slate-400">Estimated net cashflow (14 days)</span>
              <span className={`font-bold ${report.cashflow_next14 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {mv(fmt(report.cashflow_next14))}
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Section 5: Investment Update ───────────────────────────────────── */}
      <SectionCard icon={<TrendingUp size={16} />} title="5. Investment Update" accent="green">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl bg-white/5 border border-white/5 p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Stocks</div>
            <div className="text-lg font-bold text-white">{mv(fmt(report.investment.stocks_value))}</div>
            {report.investment.stocks_change !== 0 && (
              <div className={`text-xs mt-0.5 ${report.investment.stocks_change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {report.investment.stocks_change >= 0 ? "▲" : "▼"} {mv(fmt(Math.abs(report.investment.stocks_change)))}
              </div>
            )}
          </div>
          <div className="rounded-xl bg-white/5 border border-white/5 p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Crypto</div>
            <div className="text-lg font-bold text-white">{mv(fmt(report.investment.crypto_value))}</div>
            {report.investment.crypto_change !== 0 && (
              <div className={`text-xs mt-0.5 ${report.investment.crypto_change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {report.investment.crypto_change >= 0 ? "▲" : "▼"} {mv(fmt(Math.abs(report.investment.crypto_change)))}
              </div>
            )}
          </div>
        </div>
        {report.investment.dca_scheduled.length > 0 && (
          <div className="text-xs text-slate-400 mb-1.5">
            <span className="text-slate-500">DCA active: </span>
            {report.investment.dca_scheduled.join(", ")}
          </div>
        )}
        {report.investment.planned_buys.length > 0 && (
          <div className="text-xs text-slate-400">
            <span className="text-slate-500">Planned (30d): </span>
            {report.investment.planned_buys.join(", ")}
          </div>
        )}
        {report.investment.dca_scheduled.length === 0 && report.investment.planned_buys.length === 0 && (
          <div className="text-xs text-slate-500">No active DCA plans or upcoming purchases.</div>
        )}
      </SectionCard>

      {/* ── Section 6: Risk / Opportunity ──────────────────────────────────── */}
      <SectionCard icon={<AlertCircle size={16} />} title="6. Risk & Opportunity Alert" accent="orange">
        {report.alerts.length === 0 ? (
          <p className="text-sm text-emerald-400">No urgent alerts — all metrics look healthy.</p>
        ) : (
          <div className="space-y-2">
            {report.alerts.map((a: string, i: number) => (
              <div
                key={i}
                className="flex gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3"
              >
                <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-200 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Section 7: Best Move ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-5 mb-4">
        <div className="flex items-center gap-2 mb-3 text-cyan-400">
          <Target size={16} />
          <h3 className="font-semibold text-sm text-white">7. Best Move This Week</h3>
        </div>
        <p className="text-base font-medium text-white leading-relaxed">{report.best_move}</p>
        <p className="text-xs text-slate-500 mt-2">If you do one thing this week, do this.</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AIWeeklyCFOPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/cfo-reports"],
    queryFn: () => getCFOReports(20),
  });

  // Pick which report to display
  const displayRow = selectedId
    ? rows.find((r: any) => r.id === selectedId)
    : rows[0];
  const report: CFOReport | null = displayRow?.json_payload ?? null;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const newReport = await generateCFOReport("Balanced");
      await saveCFOReport(newReport, false);
      await qc.invalidateQueries({ queryKey: ["/api/cfo-reports"] });
      setSelectedId(null); // show latest
      toast({ title: "Bulletin generated", description: "Your Saturday Morning Bulletin is ready." });
    } catch (e: any) {
      toast({ title: "Generation failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [qc, toast]);

  return (
    <div className="p-4 pb-16 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit size={20} className="text-cyan-400" />
            <h1 className="text-xl font-bold text-white">Saturday Morning Bulletin</h1>
          </div>
          <p className="text-sm text-slate-400">
            Automated weekly financial briefing — every Saturday at 8:00 AM AEST.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-xs shrink-0"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <><Loader2 size={13} className="mr-1.5 animate-spin" /> Generating…</>
          ) : (
            <><RefreshCw size={13} className="mr-1.5" /> Run Now</>
          )}
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* No reports yet */}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-cyan-900/60 bg-[#0f1724] p-10 text-center">
          <BrainCircuit size={36} className="mx-auto text-cyan-600 mb-3" />
          <h2 className="text-white font-semibold mb-2">No bulletins yet</h2>
          <p className="text-slate-400 text-sm mb-5 max-w-sm mx-auto">
            Run your first bulletin to get a full weekly financial briefing with scores, expenses, cashflow, and your best move.
          </p>
          <Button
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <><Loader2 size={14} className="mr-2 animate-spin" />Generating…</> : "Generate First Bulletin"}
          </Button>
        </div>
      )}

      {/* Main content — bulletin + history */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* History sidebar */}
          {rows.length > 1 && (
            <div className="lg:w-48 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2 px-1">
                <History size={12} /> History
              </div>
              <div className="space-y-1">
                {rows.map((row: any) => {
                  const r: CFOReport | null = row.json_payload;
                  const score = r
                    ? Math.round((r.wealth_score + r.cashflow_score + r.risk_score + r.discipline_score) / 4)
                    : null;
                  const isActive = row.id === (selectedId ?? rows[0]?.id);
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 text-xs transition-colors ${
                        isActive
                          ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                          : "bg-white/5 border border-transparent text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      <div className="font-medium">{fmtDate(row.week_date)}</div>
                      {score !== null && (
                        <div className={`mt-0.5 font-bold ${score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>
                          {score}/100
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bulletin viewer */}
          <div className="flex-1 min-w-0">
            {report ? (
              <BulletinViewer report={report} />
            ) : (
              <div className="text-slate-500 text-sm text-center py-10">
                Select a bulletin from the history to view it.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
