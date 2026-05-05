/**
 * ai-weekly-cfo.tsx — Saturday Morning Financial Bulletin
 * Premium in-app viewer. 11 collapsible sections, 5-score rings, Run Now button.
 *
 * Uses CFOBulletin type (new engine). Fields accessed via nested objects:
 *   report.scores.*        report.snapshot.*     report.cashflow.*
 *   report.investment.*    report.fire.*         report.property_watch.*
 *   report.tax_alpha.*     report.risk_alerts    report.risk_radar.*   report.fire_path.*   report.top_expenses
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
          <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
          <circle
            cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (c / 100) * circ}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-black text-foreground" style={{ fontSize: size * 0.22 }}>{c}</span>
        </div>
      </div>
      <span className="text-muted-foreground text-center" style={{ fontSize: 10 }}>{label}</span>
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
    <div className={`rounded-2xl border bg-card mb-3 overflow-hidden ${borderClass[accent]}`}>
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`flex items-center gap-2 ${accentClass[accent]}`}>
          {icon}
          <span className="font-semibold text-sm text-foreground">{title}</span>
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-current/10 ${accentClass[accent]}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
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
    <div className={`rounded-xl bg-secondary/30 border p-3 ${accent ? accent : "border-border/40"}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-base font-bold ${color ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{sub}</div>}
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
    <div className="w-full bg-secondary/40 rounded-full overflow-hidden" style={{ height }}>
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
  const [showAllBills, setShowAllBills] = useState(false);

  const { scores, snapshot: snap, cashflow, investment, fire, property_watch: pw, tax_alpha, risk_alerts, risk_radar, fire_path } = report;
  const nwUp     = snap.net_worth_delta >= 0;
  const surplusUp = snap.monthly_surplus >= 0;

  const scoreColor = scores.overall >= 75 ? "#22d3ee" : scores.overall >= 55 ? "#f59e0b" : "#f87171";
  const scoreLabel = scores.overall >= 75 ? "Excellent" : scores.overall >= 55 ? "Fair" : "Needs Attention";

  return (
    <div>

      {/* ── Executive Scoreboard ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-900/50 bg-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-4 text-cyan-400">
          <BrainCircuit size={16} />
          <h3 className="font-semibold text-sm text-foreground">Executive Scoreboard</h3>
          <span className="ml-auto text-[11px] text-muted-foreground">Week of {fmtShort(report.week_date)}</span>
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
            <div className="text-[10px] text-muted-foreground mt-0.5">CFO Score</div>
          </div>

          <div className="w-px bg-border self-stretch hidden sm:block" />

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
          <div className="mt-4 border-t border-border/40 pt-3">
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              <span className="text-cyan-400 not-italic font-medium mr-1">CFO:</span>
              {report.cfo_insight}
            </p>
          </div>
        )}
      </div>

      {/* ── Section 1: Weekly Snapshot ───────────────────────────────────── */}
      <Section icon={<TrendingUp size={15} />} title="1. Weekly Snapshot" accent="cyan" defaultOpen>
        {/* 8-KPI grid: Net Worth, Weekly Change, Liquid Cash, Offset Balance,
            Monthly Surplus, Debt Ratio, FIRE %, Years to Freedom */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          {/* KPI 1: Net Worth */}
          <KpiTile
            label="Net Worth"
            value={mv(fmt(snap.net_worth))}
            sub={`${nwUp ? "▲" : "▼"} ${mv(fmt(Math.abs(snap.net_worth_delta)))} vs last week`}
            color={nwUp ? "text-emerald-400" : "text-red-400"}
            accent={nwUp ? "border-emerald-900/40" : "border-red-900/40"}
          />
          {/* KPI 2: Weekly Change */}
          <KpiTile
            label="Weekly Change"
            value={`${nwUp ? "+" : ""}${mv(fmt(snap.net_worth_delta))}`}
            sub={snap.net_worth_delta !== 0
              ? `${((Math.abs(snap.net_worth_delta) / Math.max(snap.net_worth - snap.net_worth_delta, 1)) * 100).toFixed(1)}% move`
              : "No prior bulletin"}
            color={nwUp ? "text-emerald-400" : snap.net_worth_delta === 0 ? "text-muted-foreground" : "text-red-400"}
          />
          {/* KPI 3: Liquid Cash */}
          <KpiTile
            label="Liquid Cash"
            value={mv(fmt(snap.liquid_cash))}
            sub={`Everyday: ${mv(fmt(snap.cash_everyday))}`}
            color="text-foreground"
          />
          {/* KPI 4: Offset Balance */}
          <KpiTile
            label="Offset Balance"
            value={mv(fmt(snap.offset_balance))}
            sub={snap.offset_interest_saving > 0 ? `Saves ~${mv(fmt(snap.offset_interest_saving))}/yr` : "Offset account"}
            color="text-cyan-400"
            accent="border-cyan-900/40"
          />
          {/* KPI 5: Monthly Surplus — with income/expense breakdown as subtitle */}
          <div className={`rounded-xl bg-secondary/30 border p-3 ${surplusUp ? "border-emerald-900/40" : "border-red-900/40"}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Monthly Surplus</div>
            <div className={`text-base font-bold ${surplusUp ? "text-emerald-400" : "text-red-400"}`}>
              {mv(fmt(snap.monthly_surplus))}
            </div>
            {/* Only show income/expense breakdown if both values are available */}
            {snap.monthly_income > 0 ? (
              <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug" title="Income minus Expenses (matches Dashboard calculation)">
                {mv(fmt(snap.monthly_income))}&nbsp;in&nbsp;−&nbsp;{mv(fmt(snap.monthly_expenses))}&nbsp;out
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground mt-0.5">Regenerate for breakdown</div>
            )}
          </div>
          {/* KPI 6: Debt Ratio */}
          <KpiTile
            label="Debt Ratio"
            value={`${(snap.debt_ratio * 100).toFixed(0)}%`}
            sub={`${mv(fmt(snap.total_debt))} debt vs ${mv(fmt(snap.total_assets))} assets`}
            color={snap.debt_ratio < 0.4 ? "text-emerald-400" : snap.debt_ratio < 0.6 ? "text-amber-400" : "text-red-400"}
          />
          {/* KPI 7: FIRE % */}
          <KpiTile
            label="FIRE Progress"
            value={`${snap.fire_progress_pct.toFixed(0)}%`}
            sub={`Target ${snap.fire_year}`}
            color={snap.fire_progress_pct >= 75 ? "text-emerald-400" : snap.fire_progress_pct >= 40 ? "text-amber-400" : "text-orange-400"}
          />
          {/* KPI 8: Years to Freedom */}
          <KpiTile
            label="Years to Freedom"
            value={snap.years_to_fire > 0 ? `${snap.years_to_fire.toFixed(1)}y` : "Achieved"}
            sub={snap.years_to_fire > 0 ? `Est. FIRE in ${snap.fire_year}` : "FIRE target reached"}
            color={snap.years_to_fire <= 5 ? "text-emerald-400" : snap.years_to_fire <= 15 ? "text-amber-400" : "text-foreground"}
          />
        </div>

        {/* Cash breakdown */}
        <div className="rounded-xl bg-secondary/20 border border-border/40 p-3.5 mb-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Cash Allocation Breakdown</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: "Everyday", value: snap.cash_everyday },
              { label: "Savings", value: snap.cash_savings },
              { label: "Emergency", value: snap.cash_emergency },
              { label: "Other", value: snap.cash_other },
              { label: "Mortgage Offset", value: snap.offset_balance, color: "text-cyan-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
                <div className={`text-sm font-bold ${color ?? "text-foreground"}`}>{mv(fmt(value))}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border/40 flex justify-between text-xs">
            <span className="text-muted-foreground">Total Liquid Cash</span>
            <span className="text-foreground font-semibold">{mv(fmt(snap.liquid_cash))}</span>
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
          <p className="text-muted-foreground text-sm py-2">No expenses recorded in the last 7 days.</p>
        ) : (
          <div className="space-y-2">
            {report.top_expenses.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-secondary/20 border border-border/40 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{e.category}</span>
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
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.description}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{e.member} · {e.date}</div>
                </div>
                <div className="text-base font-bold text-red-400 ml-4 shrink-0">{mv(fmt(e.amount))}</div>
              </div>
            ))}
          </div>
        )}
        {report.spending_insight && (
          <div className="mt-3 flex gap-2 items-start rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3">
            <Lightbulb size={13} className="text-violet-400 mt-0.5 shrink-0" />
            <p className="text-xs text-foreground/90 leading-relaxed">{report.spending_insight}</p>
          </div>
        )}
      </Section>

      {/* ── Section 3: 7-Day Cashflow ────────────────────────────────────── */}
      <Section icon={<Calendar size={15} />} title="3. Bills & Cashflow — Next 7 Days" accent="blue" defaultOpen>
        {/* Traffic-light summary */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <div className="rounded-xl bg-secondary/30 border border-emerald-900/30 p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Income (7d)</div>
            <div className="text-base font-bold text-emerald-400">{mv(fmt(cashflow.income_expected))}</div>
          </div>
          <div className="rounded-xl bg-secondary/30 border border-red-900/30 p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Bills Due (7d)</div>
            <div className="text-base font-bold text-red-400">{mv(fmt(cashflow.bills_total))}</div>
          </div>
          <div
            className={`rounded-xl bg-secondary/30 border p-3 text-center ${
              cashflow.status === "green"
                ? "border-emerald-900/50"
                : cashflow.status === "amber"
                ? "border-amber-900/50"
                : "border-red-900/50"
            }`}
          >
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net (7d)</div>
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
          <p className="text-muted-foreground text-sm">No bills due in the next 7 days.</p>
        ) : (
          <div className="space-y-1.5">
            {(showAllBills ? cashflow.bills : cashflow.bills.slice(0, 6)).map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl bg-secondary/20 border border-border/40 px-4 py-2.5"
              >
                <div>
                  <div className="text-xs font-medium text-foreground">{b.bill_name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
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
            {cashflow.bills.length > 6 && (
              <button
                onClick={() => setShowAllBills(v => !v)}
                className="w-full mt-1 py-2 text-xs text-muted-foreground hover:text-foreground rounded-xl border border-border/40 bg-secondary/20 hover:bg-secondary/40 transition-colors"
              >
                {showAllBills
                  ? "Show less"
                  : `Show ${cashflow.bills.length - 6} more bill${cashflow.bills.length - 6 !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        )}
      </Section>

      {/* ── Section 4: Smart Action ──────────────────────────────────────── */}
      <Section icon={<Zap size={15} />} title="4. Smart Action of the Week" accent="cyan" defaultOpen>
        <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 px-4 py-4">
          <p className="text-sm font-semibold text-foreground leading-relaxed mb-2">{report.smart_action}</p>
          {report.smart_action_value && (
            <p className="text-xs text-cyan-300 font-medium">{report.smart_action_value}</p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Highest-ROI single action for your household this week.</p>
      </Section>

      {/* ── Section 4b: Best Move Right Now ───────────────────────────────── */}
      {(report as any).best_move?.action && (report as any).best_move.action !== 'Data unavailable' && (
        <Section icon={<span className="text-amber-400">⚡</span>} title="Best Move Right Now" accent="amber" defaultOpen>
          <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 px-4 py-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-bold text-foreground leading-snug flex-1">{(report as any).best_move.action}</p>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide border ${
                (report as any).best_move.risk === 'Low' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : (report as any).best_move.risk === 'Med' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}>{(report as any).best_move.risk} Risk</span>
            </div>
            <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-0.5 mb-3">
              <span className="text-xs font-semibold text-emerald-400 font-mono">{mv((report as any).best_move.benefit_label)}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{(report as any).best_move.reason}</p>
            {(report as any).best_move.alternatives?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Alternative options</p>
                {(report as any).best_move.alternatives.slice(0, 3).map((alt: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-xs text-foreground/80">{alt.action}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-mono text-emerald-400">{mv(alt.benefit_label)}</span>
                      <span className={`text-[10px] font-semibold ${
                        alt.risk === 'Low' ? 'text-emerald-400' : alt.risk === 'Med' ? 'text-amber-400' : 'text-red-400'
                      }`}>{alt.risk}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Ranked by risk-adjusted annual benefit across 8 action types.</p>
        </Section>
      )}

      {/* ── Section 5: Property Watch ────────────────────────────────────── */}
      <Section icon={<Home size={15} />} title="5. Property Watch" accent="green" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="rounded-xl bg-secondary/30 border border-emerald-900/30 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Buy Signal</div>
            <div className="text-2xl font-black text-emerald-400">{pw.buy_score}<span className="text-sm font-normal text-muted-foreground">/10</span></div>
          </div>
          <div className="rounded-xl bg-secondary/30 border border-amber-900/30 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Wait Signal</div>
            <div className="text-2xl font-black text-amber-400">{pw.wait_score}<span className="text-sm font-normal text-muted-foreground">/10</span></div>
          </div>
          <div className="rounded-xl bg-secondary/30 border border-border/40 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Borrowing Power</div>
            <div className="text-base font-bold text-muted-foreground">{pw.borrowing_power === -1 ? 'Needs setup' : mv(fmt(pw.borrowing_power))}</div>
          </div>
          <div className="rounded-xl bg-secondary/30 border border-border/40 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Deposit Readiness</div>
            <div className="text-base font-bold text-foreground">{pw.deposit_ready.toFixed(0)}%</div>
            <ProgressBar value={pw.deposit_ready} color="#34d399" height={4} />
          </div>
        </div>
        <div className="rounded-xl bg-secondary/20 border border-border/40 px-4 py-3">
          <p className="text-xs text-foreground/80 leading-relaxed">{pw.market_summary}</p>
        </div>
      </Section>

      {/* ── Section 6: Investment Update ─────────────────────────────────── */}
      <Section icon={<BarChart3 size={15} />} title="6. Investment Update" accent="violet" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="rounded-xl bg-secondary/30 border border-border/40 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Stocks</div>
            <div className="text-base font-bold text-foreground">{mv(fmt(investment.stocks_value))}</div>
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
          <div className="rounded-xl bg-secondary/30 border border-border/40 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Crypto</div>
            <div className="text-base font-bold text-foreground">{mv(fmt(investment.crypto_value))}</div>
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
        <div className="rounded-xl bg-secondary/20 border border-border/40 p-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Total Portfolio</span>
            <span className="font-bold text-violet-400">{mv(fmt(investment.portfolio_total))}</span>
          </div>
          {investment.dca_active.length > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1.5">
              <span className="text-muted-foreground">DCA active: </span>
              {investment.dca_active.join(", ")}
            </div>
          )}
          {investment.planned_buys.length > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1">
              <span className="text-muted-foreground">Planned buys (30d): </span>
              {investment.planned_buys.join(", ")}
            </div>
          )}
          {investment.dca_active.length === 0 && investment.planned_buys.length === 0 && (
            <div className="text-[11px] text-muted-foreground">No active DCA or upcoming planned investments.</div>
          )}
        </div>
      </Section>

      {/* ── Section 7: Risk Radar ────────────────────────────────────────── */}
      <Section
        icon={<ShieldCheck size={15} />}
        title="7. Risk Radar"
        accent="red"
        badge={risk_radar?.overall_label ?? (risk_alerts.length > 0 ? String(risk_alerts.length) : undefined)}
        defaultOpen={(risk_radar?.overall_level === 'red') || risk_alerts.length > 0}
      >
        {risk_radar ? (
          <div className="space-y-4">
            {/* Overall score row */}
            <div className="flex items-center gap-3 py-2">
              <div
                className="flex items-center justify-center w-14 h-14 rounded-2xl font-bold text-xl shrink-0"
                style={{
                  background: risk_radar.overall_level === 'green'
                    ? 'rgba(34,197,94,0.12)'
                    : risk_radar.overall_level === 'amber'
                    ? 'rgba(245,158,11,0.12)'
                    : 'rgba(239,68,68,0.12)',
                  color: risk_radar.overall_level === 'green' ? '#22c55e'
                    : risk_radar.overall_level === 'amber' ? '#f59e0b' : '#ef4444',
                  border: `1.5px solid ${risk_radar.overall_level === 'green' ? 'rgba(34,197,94,0.25)' : risk_radar.overall_level === 'amber' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}
              >
                {risk_radar.overall_score}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{risk_radar.overall_label}</p>
                <p className="text-[11px] text-muted-foreground">Fragility index: {risk_radar.fragility_index} / 100 · Lower is safer</p>
              </div>
            </div>

            {/* Category score pills */}
            <div className="grid grid-cols-2 gap-2">
              {risk_radar.categories.map(cat => (
                <div
                  key={cat.id}
                  className="rounded-xl px-3 py-2.5"
                  style={{
                    background: cat.level === 'green'
                      ? 'rgba(34,197,94,0.07)'
                      : cat.level === 'amber'
                      ? 'rgba(245,158,11,0.07)'
                      : 'rgba(239,68,68,0.07)',
                    border: `1px solid ${cat.level === 'green' ? 'rgba(34,197,94,0.18)' : cat.level === 'amber' ? 'rgba(245,158,11,0.18)' : 'rgba(239,68,68,0.18)'}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">{cat.icon} {cat.label}</span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: cat.level === 'green' ? '#22c55e' : cat.level === 'amber' ? '#f59e0b' : '#ef4444' }}
                    >
                      {cat.score}
                    </span>
                  </div>
                  {/* Score bar */}
                  <div className="h-1 rounded-full bg-secondary/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${cat.score}%`,
                        background: cat.level === 'green' ? '#22c55e' : cat.level === 'amber' ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">{cat.summary}</p>
                </div>
              ))}
            </div>

            {/* Top 3 risks */}
            {risk_radar.top_risks.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Risks</p>
                <div className="space-y-2">
                  {risk_radar.top_risks.map((r, i) => (
                    <div
                      key={i}
                      className="rounded-xl px-3.5 py-3"
                      style={{
                        background: r.level === 'red'
                          ? 'rgba(239,68,68,0.07)'
                          : 'rgba(245,158,11,0.07)',
                        border: `1px solid ${r.level === 'red' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground/90">{r.label}</span>
                        <span
                          className="text-[11px] font-mono font-bold"
                          style={{ color: r.level === 'red' ? '#ef4444' : '#f59e0b' }}
                        >
                          {mv(r.value)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{r.finding}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">→ {r.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy alerts (extra context from spend spikes / bills) */}
            {risk_alerts.filter(a => !risk_radar.top_risks.some(r => a.includes(r.label))).length > 0 && (
              <div className="space-y-1.5">
                {risk_alerts.filter(a => !risk_radar.top_risks.some(r => a.includes(r.label))).map((a, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 px-3.5 py-2.5"
                  >
                    <AlertCircle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-foreground/80 leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : risk_alerts.length === 0 ? (
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
                <p className="text-xs text-foreground/90 leading-relaxed">{a}</p>
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
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
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

        {/* FIRE Path Optimizer callout */}
        {fire_path && (
          <div
            className="mt-4 rounded-xl px-4 py-3"
            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.22)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap size={12} className="text-orange-400" />
              <p className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Fastest Path to FIRE</p>
            </div>
            <p className="text-xs font-bold text-foreground mb-1">
              Option {fire_path.best_scenario === 'etf' ? 'B' : fire_path.best_scenario === 'property' ? 'A' : fire_path.best_scenario === 'mixed' ? 'C' : 'D'} — {fire_path.best_label} → FIRE in {fire_path.best_fire_year}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{fire_path.recommendation}</p>
            <div className="grid grid-cols-2 gap-2">
              {(fire_path.scenarios as any[]).map((s: any, i: number) => {
                const letters = ['A','B','C','D'];
                const colors = ['#f59e0b','#22c55e','#38bdf8','#a855f7'];
                const isBest = s.id === fire_path.best_scenario;
                return (
                  <div
                    key={s.id}
                    className="rounded-lg px-2.5 py-2"
                    style={{
                      background: isBest ? 'rgba(249,115,22,0.10)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isBest ? 'rgba(249,115,22,0.30)' : 'rgba(255,255,255,0.07)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{letters[i]}. {s.label}</span>
                      {isBest && <span className="text-[8px] text-orange-400 font-bold">⚡</span>}
                    </div>
                    <p className="text-sm font-bold" style={{ color: isBest ? '#f97316' : colors[i] }}>{s.fire_year}</p>
                    <p className="text-[9px] text-muted-foreground">{s.risk_level} risk</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 9: Tax Alpha ─────────────────────────────────────────── */}
      <Section icon={<FileText size={15} />} title="9. Tax Alpha (AUS)" accent="green" defaultOpen={false}>
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <KpiTile
            label="Total Potential Saving"
            value={mv(tax_alpha.total_saving_label ?? tax_alpha.estimated_refund)}
            color="text-emerald-400"
          />
          <KpiTile
            label="Household Tax Now"
            value={mv(fmt(tax_alpha.household_tax_now ?? 0)) + '/yr'}
            sub="PAYG + Medicare"
          />
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
              color="text-violet-400"
            />
          )}
        </div>
        {/* Top strategies */}
        {(tax_alpha.top_strategies ?? []).length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Top Actions</p>
            {(tax_alpha.top_strategies ?? []).map((s: any, i: number) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">{s.title}</p>
                  <p className="text-xs text-foreground/90 leading-snug mt-0.5">{s.action}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-emerald-400">{mv(s.annual_saving_label)}</p>
                  <p className="text-[9px] text-muted-foreground">{s.risk} risk</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Legacy tips fallback */}
        {(tax_alpha.top_strategies ?? []).length === 0 && tax_alpha.tips.length > 0 && (
          <div className="space-y-1.5">
            {tax_alpha.tips.map((tip: string, i: number) => (
              <div key={i} className="flex gap-2 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 px-4 py-3">
                <Lightbulb size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-foreground/90 leading-relaxed">{tip}</p>
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
                <p className="text-xs text-foreground/90 leading-relaxed">{o}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Section 11: Family CFO Insight ──────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/[0.07] to-violet-500/[0.07] p-5 mt-1">
        <div className="flex items-center gap-2 mb-3 text-cyan-400">
          <MessageSquare size={15} />
          <h3 className="font-semibold text-sm text-foreground">11. Family CFO Insight</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed font-medium">{report.cfo_insight}</p>
        <p className="text-[11px] text-muted-foreground mt-2">
          Generated {new Date(report.generated_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })} AEST
        </p>
      </div>
    </div>
  );
}

// ─── Legacy row normaliser ──────────────────────────────────────────────────
// Handles BOTH old CFOReport rows (flat fields, nested fire inside snapshot)
// AND new CFOBulletin rows. Fully reconstructs every sub-object from any source.
function normaliseBulletin(raw: any): CFOBulletin | null {
  if (!raw) return null;

  const n = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const s = (v: any) => (typeof v === 'string' ? v : '');
  const b = (v: any) => (typeof v === 'boolean' ? v : true);

  // Fast-path: only trust as complete if ALL key KPI fields are non-zero
  // Specifically: total_assets must be present (old snapshots have 0 here)
  // and monthly_income must be present (old snapshots omit this field)
  if (
    raw.scores && typeof raw.scores.overall === 'number' &&
    raw.snapshot && typeof raw.snapshot.debt_ratio === 'number' &&
    n(raw.snapshot.total_assets) > 0 &&
    n(raw.snapshot.monthly_income) > 0
  ) return raw as CFOBulletin;

  // Full reconstruction — handles old format AND new format with missing fields
  // Old snapshot shape: { cash, net_worth, offset_balance, monthly_surplus, fire: { ... } }
  // Flat DB columns available: networth, debt_total, portfolio_value, monthly_surplus, fire_year, fire_progress, cash
  const oldSnap = raw.snapshot ?? {};
  const oldFire = oldSnap.fire ?? {};

  // Reconstruct core values from every possible source
  const nw         = n(oldSnap.net_worth         ?? raw.networth);
  const totalDebt  = n(oldSnap.total_debt        ?? raw.debt_total);
  // If total_assets not stored, derive: assets = net_worth + debt
  const storedTA   = n(oldSnap.total_assets);
  const totalAssets = storedTA > 0 ? storedTA : (nw + totalDebt > 0 ? nw + totalDebt : 0);
  // Derive debt_ratio from reconstructed values — never trust stored 0
  const debtRatio  = totalAssets > 0 ? totalDebt / totalAssets : n(oldSnap.debt_ratio);

  // Surplus: stored monthly_surplus is the best single number we have
  const surplus    = n(oldSnap.monthly_surplus ?? raw.monthly_surplus);
  // monthly_income / expenses: if stored use them, otherwise they're unknown from old format
  const mIncome    = n(oldSnap.monthly_income  ?? raw.monthly_income);
  const mExpenses  = n(oldSnap.monthly_expenses ?? raw.monthly_expenses);

  const snapshot = {
    net_worth:              nw,
    net_worth_delta:        n(oldSnap.net_worth_delta   ?? raw.networth_delta),
    cash_everyday:          n(oldSnap.cash_everyday     ?? oldSnap.cash ?? raw.cash),
    cash_savings:           n(oldSnap.cash_savings),
    cash_emergency:         n(oldSnap.cash_emergency),
    cash_other:             n(oldSnap.cash_other),
    offset_balance:         n(oldSnap.offset_balance),
    liquid_cash:            n(oldSnap.liquid_cash       ?? oldSnap.cash ?? raw.cash),
    offset_interest_saving: n(oldSnap.offset_interest_saving),
    monthly_income:         mIncome,
    monthly_expenses:       mExpenses,
    monthly_surplus:        surplus,
    debt_ratio:             debtRatio,
    fire_progress_pct:      n(oldSnap.fire_progress_pct ?? oldFire.progress_pct ?? raw.fire_progress),
    years_to_fire:          n(oldSnap.years_to_fire     ?? oldFire.years_away),
    fire_year:              n(oldSnap.fire_year         ?? oldFire.fire_year    ?? raw.fire_year),
    fire_on_track:          b(oldSnap.fire_on_track     ?? oldFire.on_track),
    total_assets:           totalAssets,
    total_debt:             totalDebt,
    portfolio_value:        n(oldSnap.portfolio_value   ?? raw.portfolio_value),
    super_combined:         n(oldSnap.super_combined),
  };

  const oldCF = raw.cashflow ?? {};
  const cashflow = {
    income_expected: n(oldCF.income_expected),
    bills_total:     n(oldCF.bills_total),
    net_cashflow:    n(oldCF.net_cashflow ?? raw.cashflow_next14),
    status: (['green','amber','red'].includes(oldCF.status) ? oldCF.status : 'green') as 'green'|'amber'|'red',
    bills: Array.isArray(oldCF.bills) ? oldCF.bills : (Array.isArray(raw.bills_ahead) ? raw.bills_ahead : []),
  };

  const oldInv = raw.investment ?? {};
  const investment = {
    stocks_value:     n(oldInv.stocks_value),
    stocks_delta:     n(oldInv.stocks_delta     ?? oldInv.stocks_change),
    stocks_delta_pct: n(oldInv.stocks_delta_pct),
    best_stock:       s(oldInv.best_stock),
    worst_stock:      s(oldInv.worst_stock),
    crypto_value:     n(oldInv.crypto_value),
    crypto_delta:     n(oldInv.crypto_delta     ?? oldInv.crypto_change),
    crypto_delta_pct: n(oldInv.crypto_delta_pct),
    dca_active:       Array.isArray(oldInv.dca_active)   ? oldInv.dca_active   : (Array.isArray(oldInv.dca_scheduled) ? oldInv.dca_scheduled : []),
    planned_buys:     Array.isArray(oldInv.planned_buys) ? oldInv.planned_buys : [],
    portfolio_total:  n(oldInv.portfolio_total  ?? raw.portfolio_value),
  };

  const oldF = raw.fire ?? {};
  const fire = {
    target_passive_income:  n(oldF.target_passive_income),
    current_passive_income: n(oldF.current_passive_income),
    years_remaining:        n(oldF.years_remaining ?? oldF.years_away  ?? oldFire.years_away),
    progress_pct:           n(oldF.progress_pct    ?? oldFire.progress_pct ?? raw.fire_progress),
    fire_year:              n(oldF.fire_year        ?? oldFire.fire_year   ?? raw.fire_year),
    semi_fire_year:         n(oldF.semi_fire_year),
    target_capital:         n(oldF.target_capital  ?? oldFire.target_capital),
    investable:             n(oldF.investable       ?? oldFire.investable),
    on_track:               b(oldF.on_track         ?? oldFire.on_track),
    accelerator:            s(oldF.accelerator),
  };

  const oldPW = raw.property_watch ?? {};
  const property_watch = {
    buy_score:       n(oldPW.buy_score ?? 5),
    wait_score:      n(oldPW.wait_score ?? 5),
    borrowing_power: n(oldPW.borrowing_power),
    deposit_ready:   n(oldPW.deposit_ready),
    market_summary:  s(oldPW.market_summary),
  };

  const oldTA = raw.tax_alpha ?? {};
  const tax_alpha = {
    neg_gearing_benefit:  n(oldTA.neg_gearing_benefit),
    super_room_remaining: n(oldTA.super_room_remaining),
    estimated_refund:     s(oldTA.estimated_refund) || 'N/A',
    tips:                 Array.isArray(oldTA.tips) ? oldTA.tips : [],
    // Extended Tax Alpha fields (may not exist in older saved reports)
    total_annual_saving:  n(oldTA.total_annual_saving),
    total_saving_label:   s(oldTA.total_saving_label) || s(oldTA.estimated_refund) || 'N/A',
    household_tax_now:    n(oldTA.household_tax_now),
    top_strategies:       Array.isArray(oldTA.top_strategies) ? oldTA.top_strategies : [],
  };

  const wS = n(raw.wealth_score      ?? raw.scores?.wealth);
  const cS = n(raw.cashflow_score    ?? raw.scores?.cashflow);
  const rS = n(raw.risk_score        ?? raw.scores?.risk);
  const dS = n(raw.discipline_score  ?? raw.scores?.discipline);
  const scores = {
    wealth:      n(raw.scores?.wealth      ?? wS),
    cashflow:    n(raw.scores?.cashflow    ?? cS),
    risk:        n(raw.scores?.risk        ?? rS),
    discipline:  n(raw.scores?.discipline  ?? dS),
    opportunity: n(raw.scores?.opportunity),
    overall:     n(raw.scores?.overall     ?? Math.round((wS + cS + rS + dS) / 4)),
  };

  return {
    ...raw,
    week_date:    s(raw.week_date)    || new Date().toISOString().split('T')[0],
    generated_at: s(raw.generated_at) || s(raw.week_date) || new Date().toISOString(),
    scores,
    snapshot,
    cashflow,
    investment,
    fire,
    property_watch,
    tax_alpha,
    risk_alerts:        Array.isArray(raw.risk_alerts)  ? raw.risk_alerts  : (Array.isArray(raw.alerts) ? raw.alerts : []),
    risk_radar:         raw.risk_radar ?? null,
    fire_path:          raw.fire_path ?? null,
    top_expenses:       Array.isArray(raw.top_expenses) ? raw.top_expenses : [],
    spending_insight:   s(raw.spending_insight),
    smart_action:       s(raw.smart_action      ?? raw.best_move),
    smart_action_value: s(raw.smart_action_value),
    cfo_insight:        s(raw.cfo_insight        ?? raw.summary),
    opportunities:      Array.isArray(raw.opportunities) ? raw.opportunities : [],
  } as CFOBulletin;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AIWeeklyCFOPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // ── Permission guard ───────────────────────────────────────────────────────
  const { hasPermission, householdRole, currentUser } = useAppStore();
  const canView = hasPermission('view_bulletin');
  const canRun  = hasPermission('run_bulletin');

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <BrainCircuit className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Saturday Bulletin</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          You do not have access to this section.<br />
          Ask the household owner to enable bulletin access in Settings → Family Access.
        </p>
      </div>
    );
  }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/cfo-reports"],
    queryFn: () => getCFOReports(20),
    staleTime: 60_000,
  });

  // Pick which report to display
  const displayRow = selectedId
    ? rows.find((r: any) => r.id === selectedId)
    : rows[0];
  // Pass BOTH the json_payload AND the flat DB row columns so normaliseBulletin
  // can fall back to flat columns (debt_total, networth, wealth_score etc.) when
  // the json_payload is an old-format object missing those fields.
  const report: CFOBulletin | null = normaliseBulletin(
    displayRow ? { ...displayRow, ...(displayRow.json_payload ?? {}) } : null
  );

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
    <div className="p-4 pb-20 max-w-3xl mx-auto bg-background min-h-screen">
      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit size={20} className="text-cyan-400" />
            <h1 className="text-xl font-bold text-foreground">Saturday Morning Bulletin</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Automated weekly family financial briefing — every Saturday at 8:00 AM AEST.
          </p>
        </div>
        {canRun ? (
          <Button
            size="sm"
            className="bg-cyan-500 hover:bg-cyan-400 text-background font-semibold text-xs shrink-0"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <><Loader2 size={13} className="mr-1.5 animate-spin" /> Generating…</>
            ) : (
              <><RefreshCw size={13} className="mr-1.5" /> Run Now</>
            )}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground italic">View only</span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* No reports yet */}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <BrainCircuit size={38} className="mx-auto text-cyan-600 mb-3" />
          <h2 className="text-foreground font-semibold mb-2">No bulletins yet</h2>
          <p className="text-muted-foreground text-sm mb-5 max-w-sm mx-auto">
            Run your first bulletin to get a premium 11-section financial briefing — scores,
            cash breakdown, 7-day cashflow, FIRE tracker, property watch, tax alpha, and more.
          </p>
          {canRun ? (
            <Button
              className="bg-cyan-500 hover:bg-cyan-400 text-background font-semibold"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Generating…</>
              ) : (
                <><BrainCircuit size={14} className="mr-2" />Generate First Bulletin</>
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground italic">View only — ask the household owner to run the first bulletin.</p>
          )}
        </div>
      )}

      {/* Main content */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* History sidebar */}
          {rows.length > 1 && (
            <div className="lg:w-44 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2 px-1">
                <History size={11} /> History
              </div>
              <div className="space-y-1">
                {rows.map((row: any) => {
                  const b = normaliseBulletin({ ...row, ...(row.json_payload ?? {}) });
                  const score = b ? b.scores?.overall : null;
                  const isActive = row.id === (selectedId ?? rows[0]?.id);
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 text-xs transition-colors ${
                        isActive
                          ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                          : "bg-secondary/30 border border-transparent text-muted-foreground hover:bg-secondary/50"
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
              <div className="text-muted-foreground text-sm text-center py-10">
                Select a bulletin from the history to view it.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
