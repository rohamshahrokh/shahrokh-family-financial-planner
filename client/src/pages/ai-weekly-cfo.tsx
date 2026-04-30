/**
 * ai-weekly-cfo.tsx — Saturday Morning Financial Bulletin
 * Premium in-app viewer. 11 collapsible sections, 5-score rings, Run Now button.
 *
 * Uses CFOBulletin type (new engine). Fields accessed via nested objects:
 *   report.scores.*        report.snapshot.*     report.cashflow.*
 *   report.investment.*    report.fire.*         report.property_watch.*
 *   report.tax_alpha.*     report.risk_alerts    report.top_expenses
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCFOReports,
  generateCFOReport,
  saveCFOReport,
  type CFOBulletin,
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
  ChevronDown,
  History,
  Flame,
  DollarSign,
  Home,
  BarChart3,
  Zap,
  FileText,
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
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
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
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
  score, label, color, size = 64,
}: {
  score: number; label: string; color: string; size?: number;
}) {
  const c = Math.max(0, Math.min(100, score));
  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
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
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-black text-white" style={{ fontSize: size * 0.22 }}>{c}</span>
        </div>
      </div>
      <span className="text-slate-400 text-center" style={{ fontSize: 10 }}>{label}</span>
    </div>
  );
}

// ─── Collapsible section card ─────────────────────────────────────────────────
function Section({
  icon, title, accent = "blue", defaultOpen = true, badge, children,
}: {
  icon: React.ReactNode;
  title: string;
  accent?: "blue" | "orange" | "green" | "red" | "violet" | "cyan" | "amber";
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentClass: Record<string, string> = {
    blue:   "text-blue-400",
    orange: "text-orange-400",
    green:  "text-emerald-400",
    red:    "text-red-400",
    violet: "text-violet-400",
    cyan:   "text-cyan-400",
    amber:  "text-amber-400",
  };
  const borderClass: Record<string, string> = {
    blue:   "border-blue-900/40",
    orange: "border-orange-900/40",
    green:  "border-emerald-900/40",
    red:    "border-red-900/40",
    violet: "border-violet-900/40",
    cyan:   "border-cyan-900/40",
    amber:  "border-amber-900/40",
  };
  return (
    <div className={`rounded-2xl border bg-[#0d1421] mb-3 overflow-hidden ${borderClass[accent]}`}>
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`flex items-center gap-2 ${accentClass[accent]}`}>
          {icon}
          <span className="font-semibold text-sm text-white">{title}</span>
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-current/10 ${accentClass[accent]}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-slate-500 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({
  label, value, sub, color, accent,
}: {
  label: string; value: string; sub?: string; color?: string; accent?: string;
}) {
  return (
    <div className={`rounded-xl bg-white/[0.04] border p-3 ${accent ? accent : "border-white/[0.06]"}`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-base font-bold ${color ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

// ─── Traffic light dot ────────────────────────────────────────────────────────
function TrafficDot({ status }: { status: "green" | "amber" | "red" }) {
  const cls = status === "green"
    ? "bg-emerald-400"
    : status === "amber"
    ? "bg-amber-400"
    : "bg-red-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-1.5`} />;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({
  value, color = "#22d3ee", height = 6,
}: {
  value: number; color?: string; height?: number;
}) {
  return (
    <div className="w-full bg-white/[0.05] rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}

// ─── Main bulletin viewer ─────────────────────────────────────────────────────
function BulletinViewer({ report }: { report: CFOBulletin }) {
  const { privacyMode } = useAppStore();
  const mv = (val: string) => maskValue(val, privacyMode, "currency");

  const { scores, snapshot: snap, cashflow, investment, fire, property_watch: pw, tax_alpha, risk_alerts } = report;
  const nwUp     = snap.net_worth_delta >= 0;
  const surplusUp = snap.monthly_surplus >= 0;

  const scoreColor = scores.overall >= 75 ? "#22d3ee" : scores.overall >= 55 ? "#f59e0b" : "#f87171";
  const scoreLabel = scores.overall >= 75 ? "Excellent" : scores.overall >= 55 ? "Fair" : "Needs Attention";

  return (
    <div>

      {/* ── Executive Scoreboard ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-900/50 bg-gradient-to-br from-[#080f1c] to-[#0c1628] p-5 mb-4">
        <div className="flex items-center gap-2 mb-4 text-cyan-400">
          <BrainCircuit size={16} />
          <h3 className="font-semibold text-sm text-white">Executive Scoreboard</h3>
          <span className="ml-auto text-[11px] text-slate-500">Week of {fmtShort(report.week_date)}</span>
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          {/* Big overall score */}
          <div className="flex flex-col items-center min-w-[80px]">
            <div
              className="text-6xl font-black tabular-nums leading-none"
              style={{ color: scoreColor, textShadow: `0 0 32px ${scoreColor}50` }}
            >
              {scores.overall}
            </div>
            <div className="text-[11px] font-semibold mt-1" style={{ color: scoreColor }}>{scoreLabel}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">CFO Score</div>
          </div>

          <div className="w-px bg-white/[0.06] self-stretch hidden sm:block" />

          {/* 5 sub-scores */}
          <div className="flex gap-3 flex-wrap flex-1">
            <ScoreRing score={scores.wealth}      label="Wealth"      color="#22d3ee" size={60} />
            <ScoreRing score={scores.cashflow}    label="Cashflow"    color="#a78bfa" size={60} />
            <ScoreRing score={scores.risk}        label="Risk"        color="#34d399" size={60} />
            <ScoreRing score={scores.discipline}  label="Discipline"  color="#f59e0b" size={60} />
            <ScoreRing score={scores.opportunity} label="Opportunity" color="#f97316" size={60} />
          </div>
        </div>

        {/* CFO insight line */}
        {report.cfo_insight && (
          <div className="mt-4 border-t border-white/[0.05] pt-3">
            <p className="text-xs text-slate-400 italic leading-relaxed">
              <span className="text-cyan-400 not-italic font-medium mr-1">CFO:</span>
              {report.cfo_insight}
            </p>
          </div>
        )}
      </div>

      {/* ── Section 1: Weekly Snapshot ───────────────────────────────────── */}
      <Section icon={<TrendingUp size={15} />} title="1. Weekly Snapshot" accent="cyan" defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <KpiTile
            label="Net Worth"
            value={mv(fmt(snap.net_worth))}
            sub={`${nwUp ? "▲" : "▼"} ${mv(fmt(Math.abs(snap.net_worth_delta)))} vs last bulletin`}
            color={nwUp ? "text-emerald-400" : "text-red-400"}
          />
          <KpiTile
            label="Monthly Surplus"
            value={mv(fmt(snap.monthly_surplus))}
            color={surplusUp ? "text-emerald-400" : "text-red-400"}
            sub={`Debt ratio: ${(snap.debt_ratio * 100).toFixed(0)}%`}
          />
          <KpiTile
            label="Total Assets"
            value={mv(fmt(snap.total_assets))}
            sub={`Debt: ${mv(fmt(snap.total_debt))}`}
          />
          <KpiTile
            label="Portfolio (Stocks+Crypto)"
            value={mv(fmt(snap.portfolio_value))}
            sub={`Super: ${mv(fmt(snap.super_combined))}`}
            color="text-violet-400"
          />
        </div>

        {/* Cash breakdown */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Cash Breakdown</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: "Everyday", value: snap.cash_everyday },
              { label: "Savings", value: snap.cash_savings },
              { label: "Emergency", value: snap.cash_emergency },
              { label: "Other", value: snap.cash_other },
              { label: "Mortgage Offset", value: snap.offset_balance, color: "text-cyan-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                <div className={`text-sm font-bold ${color ?? "text-white"}`}>{mv(fmt(value))}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05] flex justify-between text-xs">
            <span className="text-slate-500">Total Liquid Cash</span>
            <span className="text-white font-semibold">{mv(fmt(snap.liquid_cash))}</span>
          </div>
          {snap.offset_interest_saving > 0 && (
            <div className="mt-1 text-[11px] text-emerald-400">
              Offset saves ~{mv(fmt(snap.offset_interest_saving))}/year in mortgage interest
            </div>
          )}
        </div>
      </Section>

      {/* ── Section 2: Top Expenses ──────────────────────────────────────── */}
      <Section
        icon={<Wallet size={15} />}
        title="2. Top Expenses This Week"
        accent="orange"
        badge={report.top_expenses.length > 0 ? `${report.top_expenses.length}` : undefined}
      >
        {report.top_expenses.length === 0 ? (
          <p className="text-slate-500 text-sm py-2">No expenses recorded in the last 7 days.</p>
        ) : (
          <div className="space-y-2">
            {report.top_expenses.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.05] px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
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
                  <div className="text-[10px] text-slate-500 mt-0.5">{e.member} · {e.date}</div>
                </div>
                <div className="text-base font-bold text-red-400 ml-4 shrink-0">{mv(fmt(e.amount))}</div>
              </div>
            ))}
          </div>
        )}
        {report.spending_insight && (
          <div className="mt-3 flex gap-2 items-start rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3">
            <Lightbulb size={13} className="text-violet-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-200 leading-relaxed">{report.spending_insight}</p>
          </div>
        )}
      </Section>

      {/* ── Section 3: 7-Day Cashflow ────────────────────────────────────── */}
      <Section icon={<Calendar size={15} />} title="3. Bills & Cashflow — Next 7 Days" accent="blue" defaultOpen>
        {/* Traffic-light summary */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <div className="rounded-xl bg-white/[0.04] border border-emerald-900/30 p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Income (7d)</div>
            <div className="text-base font-bold text-emerald-400">{mv(fmt(cashflow.income_expected))}</div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-red-900/30 p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Bills Due (7d)</div>
            <div className="text-base font-bold text-red-400">{mv(fmt(cashflow.bills_total))}</div>
          </div>
          <div
            className={`rounded-xl bg-white/[0.04] border p-3 text-center ${
              cashflow.status === "green"
                ? "border-emerald-900/50"
                : cashflow.status === "amber"
                ? "border-amber-900/50"
                : "border-red-900/50"
            }`}
          >
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Net (7d)</div>
            <div
              className={`text-base font-bold flex items-center justify-center gap-1 ${
                cashflow.status === "green"
                  ? "text-emerald-400"
                  : cashflow.status === "amber"
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              <TrafficDot status={cashflow.status} />
              {mv(fmt(cashflow.net_cashflow))}
            </div>
          </div>
        </div>

        {cashflow.bills.length === 0 ? (
          <p className="text-slate-500 text-sm">No bills due in the next 7 days.</p>
        ) : (
          <div className="space-y-1.5">
            {cashflow.bills.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.05] px-4 py-2.5"
              >
                <div>
                  <div className="text-xs font-medium text-white">{b.bill_name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {b.due_date}
                    {" · "}
                    {b.days_away === 0 ? (
                      <span className="text-amber-400 font-semibold">Due today</span>
                    ) : b.days_away === 1 ? (
                      <span className="text-amber-400">Tomorrow</span>
                    ) : (
                      `in ${b.days_away} days`
                    )}
                    {" · "}{b.frequency}
                  </div>
                </div>
                <div className="text-sm font-semibold text-orange-400 shrink-0 ml-4">{mv(fmt(b.amount))}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 4: Smart Action ──────────────────────────────────────── */}
      <Section icon={<Zap size={15} />} title="4. Smart Action of the Week" accent="cyan" defaultOpen>
        <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 px-4 py-4">
          <p className="text-sm font-semibold text-white leading-relaxed mb-2">{report.smart_action}</p>
          {report.smart_action_value && (
            <p className="text-xs text-cyan-300 font-medium">{report.smart_action_value}</p>
          )}
        </div>
        <p className="text-[11px] text-slate-600 mt-2">Highest-ROI single action for your household this week.</p>
      </Section>

      {/* ── Section 5: Property Watch ────────────────────────────────────── */}
      <Section icon={<Home size={15} />} title="5. Property Watch" accent="green" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="rounded-xl bg-white/[0.04] border border-emerald-900/30 p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Buy Signal</div>
            <div className="text-2xl font-black text-emerald-400">{pw.buy_score}<span className="text-sm font-normal text-slate-500">/10</span></div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-amber-900/30 p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Wait Signal</div>
            <div className="text-2xl font-black text-amber-400">{pw.wait_score}<span className="text-sm font-normal text-slate-500">/10</span></div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.05] p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Borrowing Power</div>
            <div className="text-base font-bold text-white">{mv(fmt(pw.borrowing_power))}</div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.05] p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Deposit Readiness</div>
            <div className="text-base font-bold text-white">{pw.deposit_ready.toFixed(0)}%</div>
            <ProgressBar value={pw.deposit_ready} color="#34d399" height={4} />
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-4 py-3">
          <p className="text-xs text-slate-300 leading-relaxed">{pw.market_summary}</p>
        </div>
      </Section>

      {/* ── Section 6: Investment Update ─────────────────────────────────── */}
      <Section icon={<BarChart3 size={15} />} title="6. Investment Update" accent="violet" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Stocks</div>
            <div className="text-base font-bold text-white">{mv(fmt(investment.stocks_value))}</div>
            {investment.stocks_delta !== 0 && (
              <div className={`text-xs mt-1 flex items-center gap-1 ${investment.stocks_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {investment.stocks_delta >= 0
                  ? <ArrowUpRight size={12} />
                  : <ArrowDownRight size={12} />}
                {mv(fmt(Math.abs(investment.stocks_delta)))}
                {" "}
                ({investment.stocks_delta_pct >= 0 ? "+" : ""}{investment.stocks_delta_pct.toFixed(1)}%)
              </div>
            )}
            {investment.best_stock && (
              <div className="text-[10px] text-emerald-400 mt-1">Best: {investment.best_stock}</div>
            )}
            {investment.worst_stock && investment.worst_stock !== investment.best_stock && (
              <div className="text-[10px] text-red-400">Worst: {investment.worst_stock}</div>
            )}
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Crypto</div>
            <div className="text-base font-bold text-white">{mv(fmt(investment.crypto_value))}</div>
            {investment.crypto_delta !== 0 && (
              <div className={`text-xs mt-1 flex items-center gap-1 ${investment.crypto_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {investment.crypto_delta >= 0
                  ? <ArrowUpRight size={12} />
                  : <ArrowDownRight size={12} />}
                {mv(fmt(Math.abs(investment.crypto_delta)))}
                {" "}
                ({investment.crypto_delta_pct >= 0 ? "+" : ""}{investment.crypto_delta_pct.toFixed(1)}%)
              </div>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500">Total Portfolio</span>
            <span className="font-bold text-violet-400">{mv(fmt(investment.portfolio_total))}</span>
          </div>
          {investment.dca_active.length > 0 && (
            <div className="text-[11px] text-slate-400 mt-1.5">
              <span className="text-slate-500">DCA active: </span>
              {investment.dca_active.join(", ")}
            </div>
          )}
          {investment.planned_buys.length > 0 && (
            <div className="text-[11px] text-slate-400 mt-1">
              <span className="text-slate-500">Planned buys (30d): </span>
              {investment.planned_buys.join(", ")}
            </div>
          )}
          {investment.dca_active.length === 0 && investment.planned_buys.length === 0 && (
            <div className="text-[11px] text-slate-500">No active DCA or upcoming planned investments.</div>
          )}
        </div>
      </Section>

      {/* ── Section 7: Risk Radar ────────────────────────────────────────── */}
      <Section
        icon={<AlertCircle size={15} />}
        title="7. Risk Radar"
        accent="red"
        badge={risk_alerts.length > 0 ? String(risk_alerts.length) : undefined}
        defaultOpen={risk_alerts.length > 0}
      >
        {risk_alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-400 py-2">
            <ShieldCheck size={16} />
            <p className="text-sm">No urgent risks detected — all metrics look healthy.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {risk_alerts.map((a, i) => (
              <div
                key={i}
                className="flex gap-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 px-4 py-3"
              >
                <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-200 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 8: FIRE Tracker ──────────────────────────────────────── */}
      <Section icon={<Flame size={15} />} title="8. FIRE Tracker" accent="amber" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
          <KpiTile
            label="FIRE Progress"
            value={`${fire.progress_pct.toFixed(0)}%`}
            sub={fire.on_track ? "✓ On track" : "⚠ Behind plan"}
            color={fire.on_track ? "text-emerald-400" : "text-amber-400"}
          />
          <KpiTile
            label="FIRE Year"
            value={String(fire.fire_year)}
            sub={`${fire.years_remaining.toFixed(1)}y remaining`}
            color="text-orange-400"
          />
          <KpiTile
            label="Semi-FIRE Year"
            value={String(fire.semi_fire_year)}
            sub="50% target"
            color="text-amber-400"
          />
          <KpiTile
            label="Investable Capital"
            value={mv(fmt(fire.investable))}
            sub={`Target: ${mv(fmt(fire.target_capital))}`}
          />
          <KpiTile
            label="Passive Income"
            value={mv(fmt(fire.current_passive_income)) + "/mo"}
            sub={`Target: ${mv(fmt(fire.target_passive_income))}/mo`}
          />
        </div>
        <div className="mb-2">
          <div className="flex justify-between text-[11px] text-slate-500 mb-1.5">
            <span>{mv(fmt(fire.investable))} of {mv(fmt(fire.target_capital))}</span>
            <span>{fire.progress_pct.toFixed(1)}%</span>
          </div>
          <ProgressBar
            value={fire.progress_pct}
            color={fire.progress_pct >= 70 ? "#22d3ee" : fire.progress_pct >= 40 ? "#f59e0b" : "#f97316"}
            height={8}
          />
        </div>
        {fire.accelerator && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 mt-2">
            <p className="text-xs text-amber-300 leading-relaxed">
              <span className="font-semibold text-amber-400">Accelerator: </span>
              {fire.accelerator}
            </p>
          </div>
        )}
      </Section>

      {/* ── Section 9: Tax Alpha ─────────────────────────────────────────── */}
      <Section icon={<FileText size={15} />} title="9. Tax Alpha (AUS)" accent="green" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {tax_alpha.neg_gearing_benefit > 0 && (
            <KpiTile
              label="Neg. Gearing Benefit"
              value={mv(fmt(tax_alpha.neg_gearing_benefit)) + "/yr"}
              color="text-emerald-400"
            />
          )}
          {tax_alpha.super_room_remaining > 0 && (
            <KpiTile
              label="Super Cap Remaining"
              value={mv(fmt(tax_alpha.super_room_remaining))}
              sub="Concessional ($30K cap)"
              color="text-cyan-400"
            />
          )}
          <KpiTile
            label="Est. Tax Benefit"
            value={mv(tax_alpha.estimated_refund)}
          />
        </div>
        {tax_alpha.tips.length > 0 && (
          <div className="space-y-1.5">
            {tax_alpha.tips.map((tip, i) => (
              <div
                key={i}
                className="flex gap-2 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 px-4 py-3"
              >
                <Lightbulb size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-200 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 10: Legacy Alerts / Opportunities ────────────────────── */}
      {report.opportunities && report.opportunities.length > 0 && (
        <Section icon={<Target size={15} />} title="10. Opportunities" accent="violet" defaultOpen={false}>
          <div className="space-y-1.5">
            {report.opportunities.map((o, i) => (
              <div
                key={i}
                className="flex gap-2.5 rounded-xl bg-violet-500/[0.08] border border-violet-500/20 px-4 py-3"
              >
                <ArrowUpRight size={13} className="text-violet-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-200 leading-relaxed">{o}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Section 11: Family CFO Insight ──────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.07] to-violet-500/[0.07] p-5 mt-1">
        <div className="flex items-center gap-2 mb-3 text-cyan-400">
          <MessageSquare size={15} />
          <h3 className="font-semibold text-sm text-white">11. Family CFO Insight</h3>
        </div>
        <p className="text-sm text-slate-100 leading-relaxed font-medium">{report.cfo_insight}</p>
        <p className="text-[11px] text-slate-600 mt-2">
          Generated {new Date(report.generated_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })} AEST
        </p>
      </div>
    </div>
  );
}

// ─── Legacy row normaliser ──────────────────────────────────────────────────
// Old CFOReport rows lack `scores`, `cashflow`, `fire` sub-objects.
// Promote flat fields so the viewer never crashes on stale DB data.
function normaliseBulletin(raw: any): CFOBulletin | null {
  if (!raw) return null;
  // Already new format
  if (raw.scores && typeof raw.scores.overall === 'number') return raw as CFOBulletin;
  // Legacy flat format — build a minimal CFOBulletin
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
      cash_savings:       0,
      cash_emergency:     0,
      cash_other:         0,
      offset_balance:     raw.snapshot?.offset_balance ?? 0,
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
      income_expected: 0,
      bills_total:     0,
      net_cashflow:    raw.cashflow_next14 ?? 0,
      status:          'green' as const,
      bills:           raw.bills_ahead ?? [],
    },
    investment: raw.investment ?? {
      stocks_value:     0, stocks_delta: 0, stocks_delta_pct: 0,
      best_stock: '', worst_stock: '',
      crypto_value:     0, crypto_delta: 0, crypto_delta_pct: 0,
      dca_active: [], planned_buys: [], portfolio_total: raw.portfolio_value ?? 0,
    },
    fire: raw.fire ?? {
      target_passive_income: 0, current_passive_income: 0,
      years_remaining: 0, progress_pct: raw.fire_progress ?? 0,
      fire_year: raw.fire_year ?? 0, semi_fire_year: 0,
      target_capital: 0, investable: 0, on_track: true, accelerator: '',
    },
    property_watch: raw.property_watch ?? {
      buy_score: 5, wait_score: 5, borrowing_power: 0,
      deposit_ready: 0, market_summary: '',
    },
    tax_alpha: raw.tax_alpha ?? {
      neg_gearing_benefit: 0, super_room_remaining: 0,
      estimated_refund: 'N/A', tips: [],
    },
    risk_alerts:      raw.risk_alerts      ?? raw.alerts        ?? [],
    top_expenses:     raw.top_expenses     ?? [],
    spending_insight: raw.spending_insight ?? '',
    smart_action:     raw.smart_action     ?? raw.best_move     ?? '',
    smart_action_value: raw.smart_action_value ?? '',
    cfo_insight:      raw.cfo_insight      ?? raw.summary       ?? '',
    opportunities:    raw.opportunities    ?? [],
  };
  return legacy;
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
    staleTime: 60_000,
  });

  // Pick which report to display
  const displayRow = selectedId
    ? rows.find((r: any) => r.id === selectedId)
    : rows[0];
  const report: CFOBulletin | null = normaliseBulletin(displayRow?.json_payload);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const newReport = await generateCFOReport("Balanced");
      await saveCFOReport(newReport, false);
      await qc.invalidateQueries({ queryKey: ["/api/cfo-reports"] });
      setSelectedId(null); // show latest
      toast({ title: "Bulletin generated", description: "Your Saturday Morning Bulletin is ready." });
    } catch (e: any) {
      toast({
        title: "Generation failed",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [qc, toast]);

  return (
    <div className="p-4 pb-20 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit size={20} className="text-cyan-400" />
            <h1 className="text-xl font-bold text-white">Saturday Morning Bulletin</h1>
          </div>
          <p className="text-sm text-slate-400">
            Automated weekly family financial briefing — every Saturday at 8:00 AM AEST.
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
        <div className="rounded-2xl border border-dashed border-cyan-900/60 bg-[#0d1421] p-10 text-center">
          <BrainCircuit size={38} className="mx-auto text-cyan-600 mb-3" />
          <h2 className="text-white font-semibold mb-2">No bulletins yet</h2>
          <p className="text-slate-400 text-sm mb-5 max-w-sm mx-auto">
            Run your first bulletin to get a premium 11-section financial briefing — scores,
            cash breakdown, 7-day cashflow, FIRE tracker, property watch, tax alpha, and more.
          </p>
          <Button
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <><Loader2 size={14} className="mr-2 animate-spin" />Generating…</>
            ) : (
              <><BrainCircuit size={14} className="mr-2" />Generate First Bulletin</>
            )}
          </Button>
        </div>
      )}

      {/* Main content */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* History sidebar */}
          {rows.length > 1 && (
            <div className="lg:w-44 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2 px-1">
                <History size={11} /> History
              </div>
              <div className="space-y-1">
                {rows.map((row: any) => {
                  const b = normaliseBulletin(row.json_payload);
                  const score = b ? b.scores?.overall : null;
                  const isActive = row.id === (selectedId ?? rows[0]?.id);
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 text-xs transition-colors ${
                        isActive
                          ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                          : "bg-white/[0.04] border border-transparent text-slate-400 hover:bg-white/[0.08]"
                      }`}
                    >
                      <div className="font-medium">{fmtShort(row.week_date)}</div>
                      {score !== null && score !== undefined && (
                        <div
                          className={`mt-0.5 font-bold text-[11px] ${
                            score >= 75 ? "text-emerald-400" : score >= 55 ? "text-amber-400" : "text-red-400"
                          }`}
                        >
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
