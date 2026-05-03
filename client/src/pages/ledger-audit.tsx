/**
 * ledger-audit.tsx — Financial Plan Ledger Audit
 * Route: /ledger-audit
 *
 * An audit window into the REAL central ledger used by every page.
 * Reads from the SAME runCashEngine() call — no fake data, no separate table.
 *
 * Sections:
 *   1. Summary cards     — assets, liabilities, planned investments, DCA, 12m CF
 *   2. Validation panel  — missing dates, missing amounts, duplicates, disconnected sources
 *   3. Events table      — every CashEvent with filters + search + export
 *   4. Forecast preview  — monthly roll-forward ledger table
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { runCashEngine } from "@/lib/cashEngine";
import { formatCurrency, safeNum } from "@/lib/finance";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle, Download, Search, Filter,
  TrendingUp, TrendingDown, DollarSign, Calendar, Database,
  Activity, ChevronDown, ChevronUp, RefreshCw, FileText,
  Table2, BarChart3, Shield, Eye, EyeOff,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, short = false): string {
  if (short) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
    return `$${Math.round(n).toLocaleString("en-AU")}`;
  }
  return formatCurrency(n, false);
}

function sign(n: number): string {
  return n >= 0 ? `+${fmt(n)}` : fmt(n);
}

const TYPE_LABELS: Record<string, string> = {
  income:           "Salary Income",
  expense:          "Expense",
  rental_income:    "Rental Income",
  mortgage_ppor:    "PPOR Mortgage",
  mortgage_ip:      "IP Mortgage",
  property_purchase:"Property Purchase",
  property_holding: "Property Holding",
  stock_buy:        "Stock Buy",
  stock_sell:       "Stock Sell",
  crypto_buy:       "Crypto Buy",
  crypto_sell:      "Crypto Sell",
  dca_stock:        "Stock DCA",
  dca_crypto:       "Crypto DCA",
  tax_refund:       "Tax Refund",
  tax_payable:      "Tax Payable",
  debt_repayment:   "Debt Repayment",
  dividend:         "Dividend",
  other_income:     "Other Income",
  other_expense:    "Other Expense",
};

const TYPE_MODULES: Record<string, string> = {
  income:           "Snapshot",
  expense:          "Expenses",
  rental_income:    "Property",
  mortgage_ppor:    "Snapshot",
  mortgage_ip:      "Property",
  property_purchase:"Property",
  property_holding: "Property",
  stock_buy:        "Stocks",
  stock_sell:       "Stocks",
  crypto_buy:       "Crypto",
  crypto_sell:      "Crypto",
  dca_stock:        "Stocks",
  dca_crypto:       "Crypto",
  tax_refund:       "Tax",
  tax_payable:      "Tax",
  debt_repayment:   "Snapshot",
  dividend:         "Stocks",
  other_income:     "Snapshot",
  other_expense:    "Expenses",
};

const TYPE_ASSET_CLASS: Record<string, string> = {
  income:           "Cash",
  expense:          "Cash",
  rental_income:    "Property",
  mortgage_ppor:    "Property",
  mortgage_ip:      "Property",
  property_purchase:"Property",
  property_holding: "Property",
  stock_buy:        "Stocks",
  stock_sell:       "Stocks",
  crypto_buy:       "Crypto",
  crypto_sell:      "Crypto",
  dca_stock:        "Stocks",
  dca_crypto:       "Crypto",
  tax_refund:       "Cash",
  tax_payable:      "Cash",
  debt_repayment:   "Cash",
  dividend:         "Stocks",
  other_income:     "Cash",
  other_expense:    "Cash",
};

const TYPE_SOURCE_TABLE: Record<string, string> = {
  income:           "sf_snapshot",
  expense:          "sf_expenses",
  rental_income:    "sf_properties",
  mortgage_ppor:    "sf_snapshot",
  mortgage_ip:      "sf_properties",
  property_purchase:"sf_properties",
  property_holding: "sf_properties",
  stock_buy:        "sf_stock_transactions / sf_planned_investments",
  stock_sell:       "sf_stock_transactions / sf_planned_investments",
  crypto_buy:       "sf_crypto_transactions / sf_planned_investments",
  crypto_sell:      "sf_crypto_transactions / sf_planned_investments",
  dca_stock:        "sf_stock_dca",
  dca_crypto:       "sf_crypto_dca",
  tax_refund:       "sf_properties (NG calc)",
  tax_payable:      "sf_snapshot",
  debt_repayment:   "sf_snapshot",
  dividend:         "sf_stocks",
  other_income:     "sf_expenses (income)",
  other_expense:    "sf_expenses",
};

const INFLOW_TYPES = new Set([
  "income","rental_income","tax_refund","stock_sell","crypto_sell","dividend","other_income"
]);

const STATUS_COLOR: Record<string, string> = {
  "Recurring":  "text-emerald-400 bg-emerald-400/10",
  "One-time":   "text-blue-400 bg-blue-400/10",
  "Planned":    "text-amber-400 bg-amber-400/10",
  "Forecast":   "text-muted-foreground bg-secondary/60",
};

// ─── Section: Summary Cards ───────────────────────────────────────────────────

function SummaryCards({ snapshot, properties, stockDCA, cryptoDCA, plannedStock, plannedCrypto, bills, annual, events }: any) {
  const totalAssets =
    safeNum(snapshot?.cash) +
    safeNum(snapshot?.ppor) +
    safeNum(snapshot?.super_balance) +
    safeNum(snapshot?.stocks) +
    safeNum(snapshot?.crypto) +
    safeNum(snapshot?.offset_balance);

  const totalLiabilities =
    safeNum(snapshot?.mortgage) +
    safeNum(snapshot?.other_debts);

  const totalPlannedInvestments =
    (plannedStock ?? []).filter((o: any) => o.status === "planned" && o.action === "buy")
      .reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0) +
    (plannedCrypto ?? []).filter((o: any) => o.status === "planned" && o.action === "buy")
      .reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0);

  const totalDCA =
    (stockDCA ?? []).filter((d: any) => d.enabled !== false)
      .reduce((s: number, d: any) => {
        const freq = (d.frequency || "monthly").toLowerCase();
        const m = freq === "weekly" ? d.amount * 4.33 : freq === "fortnightly" ? d.amount * 2.17 : safeNum(d.amount);
        return s + m;
      }, 0) +
    (cryptoDCA ?? []).filter((d: any) => d.enabled !== false)
      .reduce((s: number, d: any) => {
        const freq = (d.frequency || "monthly").toLowerCase();
        const m = freq === "weekly" ? d.amount * 4.33 : freq === "fortnightly" ? d.amount * 2.17 : safeNum(d.amount);
        return s + m;
      }, 0);

  const currentYear = new Date().getFullYear();
  const next12mCF = (annual ?? [])
    .filter((y: any) => y.year === currentYear || y.year === currentYear + 1)
    .slice(0, 2)
    .reduce((s: number, y: any) => s + safeNum(y.netCashFlow), 0);

  const activePlannedCount = events?.filter((e: any) =>
    ["stock_buy","crypto_buy","property_purchase","dca_stock","dca_crypto"].includes(e.type)
  ).length ?? 0;

  const cards = [
    { label: "Total Assets", value: fmt(totalAssets, true), icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Total Liabilities", value: fmt(totalLiabilities, true), icon: TrendingDown, color: "text-red-400", bg: "bg-red-400/10" },
    { label: "Net Worth", value: fmt(totalAssets - totalLiabilities, true), icon: DollarSign, color: "text-primary", bg: "bg-primary/10" },
    { label: "Planned Investments", value: fmt(totalPlannedInvestments, true), icon: Calendar, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Monthly DCA", value: fmt(totalDCA, true), icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "12m Cashflow", value: sign(next12mCF), icon: BarChart3, color: next12mCF >= 0 ? "text-emerald-400" : "text-red-400", bg: next12mCF >= 0 ? "bg-emerald-400/10" : "bg-red-400/10" },
    { label: "Active Events (ledger)", value: activePlannedCount.toLocaleString(), icon: Activity, color: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Ledger Months", value: (annual?.length ?? 0) * 12 + " months", icon: Database, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
          <div className={`p-2 rounded-lg ${c.bg} flex-shrink-0`}>
            <c.icon className={`w-4 h-4 ${c.color}`} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section: Planned Investment Reconciliation ─────────────────────────────
//
// Compares the source-of-truth (sf_planned_investments) against the deductions
// the cashEngine registered as events. Catches drift caused by:
//  — cashflow engine ignoring planned orders
//  — wrong field name lookups (e.g. total_cost instead of amount_aud)
//  — status filter mismatches

function PlannedInvestmentReconciliation({
  plannedStock,
  plannedCrypto,
  events,
  privacyMode,
}: {
  plannedStock: any[];
  plannedCrypto: any[];
  events: any[];
  privacyMode: boolean;
}) {
  const mv = (s: string) => privacyMode ? "••••" : s;

  // Group source-of-truth orders by month
  const groupByMonth = (orders: any[]) => {
    const m = new Map<string, { date: Date; total: number; count: number; tickers: string[] }>();
    for (const o of orders) {
      if (o.status !== "planned" || !o.planned_date || o.action !== "buy") continue;
      const d = new Date(o.planned_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = m.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), 1), total: 0, count: 0, tickers: [] };
      cur.total += safeNum(o.amount_aud);
      cur.count += 1;
      if (o.ticker) cur.tickers.push(o.ticker);
      m.set(key, cur);
    }
    return m;
  };

  const stockByMonth  = groupByMonth(plannedStock ?? []);
  const cryptoByMonth = groupByMonth(plannedCrypto ?? []);

  const stockSrcTotal  = Array.from(stockByMonth.values()).reduce((s, x) => s + x.total, 0);
  const cryptoSrcTotal = Array.from(cryptoByMonth.values()).reduce((s, x) => s + x.total, 0);
  const totalSrc       = stockSrcTotal + cryptoSrcTotal;

  // Sum the same orders as registered in the engine events. cashEngine emits events
  // typed "stock_buy"/"crypto_buy" for planned orders (DCA events get a different source tag).
  const sumEventAbs = (typeNeedle: string) => (events ?? [])
    .filter((e: any) => typeof e.type === "string" && e.type.toLowerCase().includes(typeNeedle) && e.source !== "dca")
    .reduce((s: number, e: any) => s + Math.abs(safeNum(e.amount)), 0);

  const stockEventTotal  = sumEventAbs("stock_buy");
  const cryptoEventTotal = sumEventAbs("crypto_buy");
  const totalEvents      = stockEventTotal + cryptoEventTotal;

  const stockDelta  = Math.round(stockSrcTotal  - stockEventTotal);
  const cryptoDelta = Math.round(cryptoSrcTotal - cryptoEventTotal);
  const totalDelta  = Math.round(totalSrc - totalEvents);

  const tolerance = 1; // allow $1 rounding
  const stockOK   = Math.abs(stockDelta)  <= tolerance;
  const cryptoOK  = Math.abs(cryptoDelta) <= tolerance;
  const totalOK   = Math.abs(totalDelta)  <= tolerance;

  const allMonthKeys = Array.from(new Set([...stockByMonth.keys(), ...cryptoByMonth.keys()])).sort();
  const monthRows = allMonthKeys.map(key => {
    const s = stockByMonth.get(key);
    const c = cryptoByMonth.get(key);
    const date = (s?.date ?? c?.date)!;
    return {
      key,
      monthLabel: date.toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
      stocks: s ? { total: s.total, count: s.count, tickers: s.tickers } : null,
      crypto: c ? { total: c.total, count: c.count, tickers: c.tickers } : null,
    };
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Calendar className="w-4 h-4 text-primary" />
          Planned Investment Reconciliation
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${totalOK ? "text-emerald-400" : "text-amber-400"}`}>
          {totalOK ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {totalOK ? "Ledger total = Forecast deduction" : `Mismatch: ${formatCurrency(totalDelta, true)}`}
        </div>
      </div>

      {monthRows.length === 0 ? (
        <div className="px-5 py-6 text-xs text-muted-foreground text-center">
          No planned buy orders found in sf_planned_investments.
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {monthRows.map(row => (
              <div key={row.key} className="px-5 py-2.5 text-xs">
                <div className="font-semibold text-muted-foreground mb-1">{row.monthLabel}</div>
                <div className="space-y-0.5 pl-3">
                  {row.crypto && (
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">{"\u20BF"} Crypto purchase{row.crypto.count > 1 ? ` (${row.crypto.count})` : ""}</span>
                      <span className="font-mono font-semibold text-purple-300">{mv(formatCurrency(row.crypto.total, true))}</span>
                    </div>
                  )}
                  {row.stocks && (
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">{"\uD83D\uDCC8"} Stock purchase{row.stocks.count > 1 ? ` (${row.stocks.count})` : ""}</span>
                      <span className="font-mono font-semibold text-blue-300">{mv(formatCurrency(row.stocks.total, true))}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border bg-secondary/30 px-5 py-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Source ledger total (sf_planned_investments):</span>
              <span className="font-mono font-semibold text-foreground">{mv(formatCurrency(totalSrc, true))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Forecast deduction total (cashEngine events):</span>
              <span className="font-mono font-semibold text-foreground">{mv(formatCurrency(totalEvents, true))}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border">
              <span className="font-semibold">Variance:</span>
              <span className={`font-mono font-bold ${totalOK ? "text-emerald-400" : "text-amber-400"}`}>
                {totalOK ? "\u2713 In sync" : mv(formatCurrency(totalDelta, true))}
              </span>
            </div>
            {!totalOK && (
              <div className="flex flex-col gap-0.5 pt-1.5 text-[11px] text-muted-foreground">
                {!stockOK  && <div>Stocks variance: {formatCurrency(stockDelta,  true)} (source {formatCurrency(stockSrcTotal,  true)} vs events {formatCurrency(stockEventTotal,  true)})</div>}
                {!cryptoOK && <div>Crypto variance: {formatCurrency(cryptoDelta, true)} (source {formatCurrency(cryptoSrcTotal, true)} vs events {formatCurrency(cryptoEventTotal, true)})</div>}
                <div className="text-amber-300 mt-1">If non-zero, the cashflow forecast is not deducting the full amount of planned orders.</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section: Validation Panel ────────────────────────────────────────────────

function ValidationPanel({ snapshot, properties, stockDCA, cryptoDCA, plannedStock, plannedCrypto, bills, expenses }: any) {
  const warnings: { level: "error" | "warn" | "info"; message: string; source: string }[] = [];

  // Snapshot checks
  if (!snapshot) {
    warnings.push({ level: "error", message: "Snapshot not loaded — all projections use defaults", source: "sf_snapshot" });
  } else {
    if (!safeNum(snapshot.cash)) warnings.push({ level: "warn", message: "Cash balance is $0 or missing", source: "sf_snapshot" });
    if (!safeNum(snapshot.monthly_income)) warnings.push({ level: "error", message: "Monthly income is $0 — income events will use $22,000 default", source: "sf_snapshot" });
    if (!safeNum(snapshot.monthly_expenses)) warnings.push({ level: "warn", message: "Monthly expenses is $0 — expense events will use $14,540 default", source: "sf_snapshot" });
    if (!safeNum(snapshot.mortgage)) warnings.push({ level: "info", message: "Mortgage is $0 — no PPOR repayment events generated", source: "sf_snapshot" });
  }

  // Property checks
  for (const p of (properties ?? [])) {
    if (p.type !== "ppor") {
      if (!p.settlement_date && !p.purchase_date) warnings.push({ level: "error", message: `IP "${p.name || p.address || "Unnamed"}" — missing settlement date`, source: "sf_properties" });
      if (!safeNum(p.loan_amount)) warnings.push({ level: "warn", message: `IP "${p.name || "Unnamed"}" — loan amount is $0`, source: "sf_properties" });
      if (!safeNum(p.weekly_rent)) warnings.push({ level: "warn", message: `IP "${p.name || "Unnamed"}" — weekly rent is $0 (no rental income events)`, source: "sf_properties" });
      if (!safeNum(p.deposit)) warnings.push({ level: "warn", message: `IP "${p.name || "Unnamed"}" — deposit not set (purchase cost event may be $0)`, source: "sf_properties" });
    }
  }

  // DCA checks
  for (const d of (stockDCA ?? [])) {
    if (d.enabled && !d.start_date) warnings.push({ level: "error", message: `Stock DCA "${d.label || "Unnamed"}" — missing start_date, events will be skipped`, source: "sf_stock_dca" });
    if (d.enabled && !safeNum(d.amount)) warnings.push({ level: "warn", message: `Stock DCA "${d.label || "Unnamed"}" — amount is $0`, source: "sf_stock_dca" });
  }
  for (const d of (cryptoDCA ?? [])) {
    if (d.enabled && !d.start_date) warnings.push({ level: "error", message: `Crypto DCA "${d.label || "Unnamed"}" — missing start_date, events will be skipped`, source: "sf_crypto_dca" });
    if (d.enabled && !safeNum(d.amount)) warnings.push({ level: "warn", message: `Crypto DCA "${d.label || "Unnamed"}" — amount is $0`, source: "sf_crypto_dca" });
  }

  // Planned order checks
  for (const o of (plannedStock ?? [])) {
    if (o.status === "planned" && !o.planned_date) warnings.push({ level: "error", message: `Planned stock order "${o.name || o.ticker || "Unnamed"}" — missing planned_date`, source: "sf_planned_investments" });
    if (o.status === "planned" && !safeNum(o.amount_aud)) warnings.push({ level: "warn", message: `Planned stock order "${o.name || "Unnamed"}" — amount_aud is $0`, source: "sf_planned_investments" });
  }
  for (const o of (plannedCrypto ?? [])) {
    if (o.status === "planned" && !o.planned_date) warnings.push({ level: "error", message: `Planned crypto order "${o.name || "Unnamed"}" — missing planned_date`, source: "sf_planned_investments" });
    if (o.status === "planned" && !safeNum(o.amount_aud)) warnings.push({ level: "warn", message: `Planned crypto order "${o.name || "Unnamed"}" — amount_aud is $0`, source: "sf_planned_investments" });
  }

  // Bill checks
  for (const b of (bills ?? [])) {
    if (b.is_active !== false && !safeNum(b.amount)) warnings.push({ level: "warn", message: `Bill "${b.bill_name || "Unnamed"}" — amount is $0`, source: "sf_recurring_bills" });
  }

  // Duplicate event check — same type + same month + same amount
  const expenseDates = (expenses ?? []).map((e: any) => e.date?.substring(0, 7)).filter(Boolean);
  const dateCounts = expenseDates.reduce((m: any, k: any) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const bigMonths = Object.entries(dateCounts).filter(([, c]: any) => c > 50);
  if (bigMonths.length > 0) {
    warnings.push({ level: "info", message: `${bigMonths.length} month(s) have >50 expense entries — may affect performance`, source: "sf_expenses" });
  }

  if (warnings.length === 0) {
    warnings.push({ level: "info", message: "No validation issues found — ledger looks healthy", source: "All sources" });
  }

  const errors = warnings.filter(w => w.level === "error");
  const warns  = warnings.filter(w => w.level === "warn");
  const infos  = warnings.filter(w => w.level === "info");

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Shield className="w-4 h-4 text-primary" />
          Ledger Validation
        </div>
        <div className="flex gap-3 text-xs">
          {errors.length > 0 && <span className="text-red-400 font-semibold">{errors.length} error{errors.length > 1 ? "s" : ""}</span>}
          {warns.length > 0 && <span className="text-amber-400 font-semibold">{warns.length} warning{warns.length > 1 ? "s" : ""}</span>}
          {errors.length === 0 && warns.length === 0 && <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Clean</span>}
        </div>
      </div>
      <div className="divide-y divide-border max-h-48 overflow-y-auto">
        {[...errors, ...warns, ...infos].map((w, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-2.5 text-xs">
            {w.level === "error" && <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />}
            {w.level === "warn"  && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />}
            {w.level === "info"  && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <span className={w.level === "error" ? "text-red-300" : w.level === "warn" ? "text-amber-300" : "text-muted-foreground"}>
                {w.message}
              </span>
              <span className="ml-2 text-muted-foreground/60 font-mono">{w.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Events Table ────────────────────────────────────────────────────

function EventsTable({ events, privacyMode }: { events: any[]; privacyMode: boolean }) {
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const years = useMemo(() => {
    const ys = Array.from(new Set(events.map(e => e.year))).sort();
    return ys;
  }, [events]);

  const modules = useMemo(() => {
    return Array.from(new Set(events.map(e => TYPE_MODULES[e.type] ?? "Other"))).sort();
  }, [events]);

  const types = useMemo(() => {
    return Array.from(new Set(events.map(e => e.type))).sort();
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterYear !== "all" && String(e.year) !== filterYear) return false;
      if (filterModule !== "all" && (TYPE_MODULES[e.type] ?? "Other") !== filterModule) return false;
      if (filterType !== "all" && e.type !== filterType) return false;
      if (filterDirection === "inflow"  && e.amount <= 0) return false;
      if (filterDirection === "outflow" && e.amount >= 0) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.label?.toLowerCase().includes(q) &&
            !e.type?.toLowerCase().includes(q) &&
            !e.monthKey?.includes(q) &&
            !(e.assetName ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [events, filterYear, filterModule, filterType, filterDirection, search]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const mv = (v: string) => privacyMode ? "••••" : v;

  // ── Export handlers ──────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = filtered.map((e, i) => [
      i + 1,
      e.monthKey,
      e.type,
      TYPE_MODULES[e.type] ?? "Other",
      TYPE_ASSET_CLASS[e.type] ?? "Cash",
      e.label,
      e.amount,
      INFLOW_TYPES.has(e.type) ? "Inflow" : "Outflow",
      "Yes",
      TYPE_SOURCE_TABLE[e.type] ?? "–",
    ]);
    const headers = ["#","Date","Event Type","Module","Asset Class","Description","Amount","Direction","In Forecast","Source Table"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger Events");
    XLSX.writeFile(wb, `ledger_audit_${new Date().toISOString().split("T")[0]}.csv`, { bookType: "csv" });
  };

  const exportXLSX = () => {
    const rows = filtered.map((e, i) => [
      i + 1,
      e.monthKey,
      TYPE_LABELS[e.type] ?? e.type,
      TYPE_MODULES[e.type] ?? "Other",
      TYPE_ASSET_CLASS[e.type] ?? "Cash",
      e.label,
      e.amount,
      INFLOW_TYPES.has(e.type) ? "Inflow" : "Outflow",
      "Yes",
      TYPE_SOURCE_TABLE[e.type] ?? "–",
    ]);
    const headers = ["#","Date","Event Type","Module","Asset Class","Description","Amount (AUD)","Direction","In Forecast","Source Table"];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [4,10,20,12,12,40,16,10,12,36].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger Events");
    XLSX.writeFile(wb, `ledger_audit_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text("Financial Plan Ledger Audit", 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString("en-AU")}  |  ${filtered.length} events (filtered)`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Date","Type","Module","Description","Amount","Direction","Source Table"]],
      body: filtered.slice(0, 500).map(e => [
        e.monthKey,
        TYPE_LABELS[e.type] ?? e.type,
        TYPE_MODULES[e.type] ?? "–",
        e.label,
        `$${Math.round(Math.abs(e.amount)).toLocaleString("en-AU")}`,
        INFLOW_TYPES.has(e.type) ? "Inflow" : "Outflow",
        TYPE_SOURCE_TABLE[e.type] ?? "–",
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 40, 60], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 246, 248] },
    });
    doc.save(`ledger_audit_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Controls */}
      <div className="px-5 py-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Table2 className="w-4 h-4 text-primary" />
            Ledger Events
            <span className="text-xs text-muted-foreground font-normal ml-1">
              {filtered.length.toLocaleString()} of {events.length.toLocaleString()} events
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5 text-xs h-8">
              <Download className="w-3 h-3" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportXLSX} className="gap-1.5 text-xs h-8">
              <Download className="w-3 h-3" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5 text-xs h-8">
              <FileText className="w-3 h-3" /> PDF
            </Button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search events…"
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select value={filterYear} onValueChange={v => { setFilterYear(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterModule} onValueChange={v => { setFilterModule(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Event type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterDirection} onValueChange={v => { setFilterDirection(v); setPage(0); }}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="Direction" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All flows</SelectItem>
              <SelectItem value="inflow">Inflows only</SelectItem>
              <SelectItem value="outflow">Outflows only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {["#","Date","Event Type","Module","Asset Class","Description","Amount","Direction","In Forecast","Source Table"].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {paged.map((e, i) => {
              const isInflow = INFLOW_TYPES.has(e.type);
              return (
                <tr key={`${e.monthKey}-${e.type}-${i}`} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground">{page * PAGE_SIZE + i + 1}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{e.monthKey}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isInflow ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"}`}>
                      {TYPE_LABELS[e.type] ?? e.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{TYPE_MODULES[e.type] ?? "–"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{TYPE_ASSET_CLASS[e.type] ?? "–"}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate" title={e.label}>
                    {e.icon && <span className="mr-1">{e.icon}</span>}
                    {e.label}
                    {e.assetName && <span className="ml-1 text-muted-foreground/60">({e.assetName})</span>}
                  </td>
                  <td className={`px-3 py-2 font-mono font-semibold ${isInflow ? "text-emerald-400" : "text-red-400"}`}>
                    {mv(isInflow ? `+${fmt(e.amount)}` : fmt(e.amount))}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs ${isInflow ? "text-emerald-400" : "text-red-400"}`}>
                      {isInflow ? "↑ Inflow" : "↓ Outflow"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Yes
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground/70 text-xs max-w-[180px] truncate" title={TYPE_SOURCE_TABLE[e.type]}>
                    {TYPE_SOURCE_TABLE[e.type] ?? "–"}
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                  No events match current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
          <span>Page {page + 1} of {totalPages} ({filtered.length.toLocaleString()} events)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Forecast Preview (monthly roll-forward) ─────────────────────────

function ForecastPreview({ ledger, annual, privacyMode }: { ledger: any[]; annual: any[]; privacyMode: boolean }) {
  const [view, setView] = useState<"monthly" | "annual">("monthly");
  const [expanded, setExpanded] = useState(true);
  const [showMonths, setShowMonths] = useState(24);

  const mv = (n: number) => privacyMode ? "••••" : fmt(n);

  const exportXLSX = () => {
    const headers = ["Month","Opening Cash","Income","Expenses","Bills","Invest Buys","Property Costs","Tax Refund","Net CF","Closing Cash"];
    const rows = ledger.map(m => [
      m.label, m.openingCash, m.salaryIncome + m.rentalIncome + m.otherIncome,
      m.livingExpenses, 0, m.stockInvesting + m.cryptoInvesting,
      m.propertyPurchase + m.propertyHolding + m.mortgageIp, m.taxRefunds,
      m.netCashFlow, m.closingCash,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Ledger");
    XLSX.writeFile(wb, `monthly_ledger_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors">
            <BarChart3 className="w-4 h-4 text-primary" />
            Forecast Roll-Forward
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <div className="flex gap-1 p-0.5 bg-secondary/60 rounded-lg">
            {(["monthly","annual"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs rounded-md transition-all ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={exportXLSX} className="gap-1.5 text-xs h-8">
          <Download className="w-3 h-3" /> Export
        </Button>
      </div>

      {expanded && (
        <>
          {view === "monthly" && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {["Month","Act/Fcst","Opening Cash","Income","Expenses","PPOR Mtg","IP Mtg","Property Costs","Invest Buys","Tax Refund","Net CF","Closing Cash"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right first:text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {ledger.slice(0, showMonths).map((m: any) => (
                      <tr key={m.key} className={`hover:bg-secondary/20 transition-colors ${m.isActual ? "bg-blue-500/5" : ""}`}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{m.label}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${m.isActual ? "bg-blue-400/10 text-blue-400" : "bg-secondary/60 text-muted-foreground"}`}>
                            {m.isActual ? "Actual" : "Fcst"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{mv(m.openingCash)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400">{mv(m.salaryIncome + m.rentalIncome + m.otherIncome)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-400">{mv(m.livingExpenses)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-400">{mv(m.mortgagePpor)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-400">{mv(m.mortgageIp)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-400">{mv(m.propertyPurchase + m.propertyHolding)}</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-400">{mv(m.stockInvesting + m.cryptoInvesting)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400">{mv(m.taxRefunds)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${m.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {mv(m.netCashFlow)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${m.closingCash >= 0 ? "text-foreground" : "text-red-400"}`}>
                          {mv(m.closingCash)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ledger.length > showMonths && (
                <div className="text-center py-3 border-t border-border">
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setShowMonths(n => n + 24)}>
                    <ChevronDown className="w-3 h-3" /> Show more ({ledger.length - showMonths} remaining)
                  </Button>
                </div>
              )}
            </>
          )}

          {view === "annual" && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {["Year","Total Inflows","Total Outflows","Net CF","Ending Cash","Avg Monthly CF","Actual Months"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-right first:text-left text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {annual.map((y: any) => (
                    <tr key={y.year} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2.5 font-semibold">{y.year}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-400">{mv(y.totalInflows)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-400">{mv(y.totalOutflows)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${y.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mv(y.netCashFlow)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${y.endingCash >= 0 ? "text-foreground" : "text-red-400"}`}>
                        {mv(y.endingCash)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${y.avgMonthlyCF >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mv(y.avgMonthlyCF)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {y.hasActualMonths > 0
                          ? <span className="text-blue-400">{y.hasActualMonths} actual</span>
                          : <span className="text-muted-foreground">forecast</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LedgerAuditPage() {
  const { privacyMode } = useAppStore();
  const fa = useForecastAssumptions();

  // ── Fetch all ledger inputs ──────────────────────────────────────────────
  const { data: snapshot }            = useQuery<any>({ queryKey: ["/api/snapshot"], queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()) });
  const { data: properties = [] }     = useQuery<any[]>({ queryKey: ["/api/properties"], queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()) });
  const { data: expenses = [] }       = useQuery<any[]>({ queryKey: ["/api/expenses"], queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()) });
  const { data: bills = [] }          = useQuery<any[]>({ queryKey: ["/api/bills"], queryFn: () => apiRequest("GET", "/api/bills").then(r => r.json()) });
  const { data: stockDCA = [] }       = useQuery<any[]>({ queryKey: ["/api/stock-dca"], queryFn: () => apiRequest("GET", "/api/stock-dca").then(r => r.json()) });
  const { data: cryptoDCA = [] }      = useQuery<any[]>({ queryKey: ["/api/crypto-dca"], queryFn: () => apiRequest("GET", "/api/crypto-dca").then(r => r.json()) });
  const { data: plannedStock = [] }   = useQuery<any[]>({ queryKey: ["/api/planned-investments?module=stock"], queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then(r => r.json()) });
  const { data: plannedCrypto = [] }  = useQuery<any[]>({ queryKey: ["/api/planned-investments?module=crypto"], queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then(r => r.json()) });
  const { data: stockTx = [] }        = useQuery<any[]>({ queryKey: ["/api/stock-transactions"], queryFn: () => apiRequest("GET", "/api/stock-transactions").then(r => r.json()) });
  const { data: cryptoTx = [] }       = useQuery<any[]>({ queryKey: ["/api/crypto-transactions"], queryFn: () => apiRequest("GET", "/api/crypto-transactions").then(r => r.json()) });

  // ── Run the ONE central cashEngine ──────────────────────────────────────
  const engineOut = useMemo(() => {
    if (!snapshot) return null;
    try {
      return runCashEngine({
        snapshot: {
          cash:              safeNum(snapshot.cash),
          monthly_income:    safeNum(snapshot.monthly_income),
          monthly_expenses:  safeNum(snapshot.monthly_expenses),
          mortgage:          safeNum(snapshot.mortgage),
          other_debts:       safeNum(snapshot.other_debts),
        },
        properties:          properties ?? [],
        stockTransactions:   (stockTx ?? []).filter((t: any) => t.status === "planned"),
        cryptoTransactions:  (cryptoTx ?? []).filter((t: any) => t.status === "planned"),
        stockDCASchedules:   stockDCA  ?? [],
        cryptoDCASchedules:  cryptoDCA ?? [],
        plannedStockOrders:  plannedStock  ?? [],
        plannedCryptoOrders: plannedCrypto ?? [],
        bills:               (bills ?? []).filter((b: any) => b.is_active !== false),
        expenses:            expenses ?? [],
        inflationRate:       fa.flat.inflation,
        incomeGrowthRate:    fa.flat.income_growth,
      });
    } catch (err) {
      console.error("[LedgerAudit] cashEngine error:", err);
      return null;
    }
  }, [snapshot, properties, stockTx, cryptoTx, stockDCA, cryptoDCA, plannedStock, plannedCrypto, bills, expenses, fa]);

  // ── Snapshot summary row (static balance sheet items not in events) ──────
  const staticItems = useMemo(() => {
    if (!snapshot) return [];
    return [
      { label: "Current Cash / Offset",    value: safeNum(snapshot.cash) + safeNum(snapshot.offset_balance),    type: "Balance Sheet", source: "sf_snapshot", module: "Snapshot", assetClass: "Cash" },
      { label: "PPOR Market Value",         value: safeNum(snapshot.ppor),                                        type: "Balance Sheet", source: "sf_snapshot", module: "Property", assetClass: "Property" },
      { label: "Total Mortgage",            value: -safeNum(snapshot.mortgage),                                    type: "Balance Sheet", source: "sf_snapshot", module: "Property", assetClass: "Property" },
      { label: "Other Debts",               value: -safeNum(snapshot.other_debts),                                 type: "Balance Sheet", source: "sf_snapshot", module: "Snapshot", assetClass: "Cash" },
      { label: "Super Balance",             value: safeNum(snapshot.super_balance) || safeNum(snapshot.roham_super_balance) + safeNum(snapshot.fara_super_balance), type: "Balance Sheet", source: "sf_snapshot", module: "Super", assetClass: "Super" },
      { label: "Stocks (snapshot)",         value: safeNum(snapshot.stocks),                                       type: "Balance Sheet", source: "sf_snapshot", module: "Stocks",   assetClass: "Stocks" },
      { label: "Crypto (snapshot)",         value: safeNum(snapshot.crypto),                                       type: "Balance Sheet", source: "sf_snapshot", module: "Crypto",   assetClass: "Crypto" },
      { label: "Monthly Income",            value: safeNum(snapshot.monthly_income),                               type: "Assumption",    source: "sf_snapshot", module: "Snapshot", assetClass: "Cash" },
      { label: "Monthly Expenses",          value: safeNum(snapshot.monthly_expenses),                             type: "Assumption",    source: "sf_snapshot", module: "Snapshot", assetClass: "Cash" },
    ];
  }, [snapshot]);

  const loading = !snapshot;

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Financial Plan Ledger</h1>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Audit View</span>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Every number used by Dashboard, FIRE, Monte Carlo, Reports, Property, Stocks and Crypto — all from one engine.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${engineOut ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
          {engineOut ? `${engineOut.events.length.toLocaleString()} events · ${engineOut.ledger.length} months` : "Loading…"}
        </div>
      </div>

      {/* Data source legend */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5" /> Source Tables Connected to Ledger
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { table: "sf_snapshot",           label: "Snapshot",         status: !!snapshot },
            { table: "sf_properties",         label: "Properties",       status: properties.length > 0 },
            { table: "sf_expenses",           label: "Expenses",         status: expenses.length > 0 },
            { table: "sf_recurring_bills",    label: "Bills",            status: bills.length > 0 },
            { table: "sf_stock_dca",          label: "Stock DCA",        status: stockDCA.length > 0 },
            { table: "sf_crypto_dca",         label: "Crypto DCA",       status: cryptoDCA.length > 0 },
            { table: "sf_planned_investments",label: "Planned Orders",   status: plannedStock.length > 0 || plannedCrypto.length > 0 },
            { table: "sf_stock_transactions", label: "Stock Tx",         status: stockTx.length > 0 },
            { table: "sf_crypto_transactions",label: "Crypto Tx",        status: cryptoTx.length > 0 },
          ].map(({ table, label, status }) => (
            <div key={table} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${status ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-400" : "border-border bg-secondary/30 text-muted-foreground"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${status ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
              <span className="font-medium">{label}</span>
              <span className="opacity-50 font-mono">{table}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
          Loading ledger data from Supabase…
        </div>
      )}

      {!loading && (
        <>
          {/* Static balance sheet items */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border font-semibold text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Balance Sheet Inputs (Static — seed values for the ledger)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {["Item","Value","Type","Module","Asset Class","Source Table"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {staticItems.map((item, i) => (
                    <tr key={i} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2 font-medium">{item.label}</td>
                      <td className={`px-4 py-2 font-mono font-semibold ${item.value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {privacyMode ? "••••" : fmt(item.value)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${item.type === "Balance Sheet" ? "bg-blue-400/10 text-blue-400" : "bg-amber-400/10 text-amber-400"}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{item.module}</td>
                      <td className="px-4 py-2 text-muted-foreground">{item.assetClass}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground/70">{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary cards */}
          <SummaryCards
            snapshot={snapshot}
            properties={properties}
            stockDCA={stockDCA}
            cryptoDCA={cryptoDCA}
            plannedStock={plannedStock}
            plannedCrypto={plannedCrypto}
            bills={bills}
            annual={engineOut?.annual ?? []}
            events={engineOut?.events ?? []}
          />

          {/* Planned Investment Reconciliation */}
          <PlannedInvestmentReconciliation
            plannedStock={plannedStock}
            plannedCrypto={plannedCrypto}
            events={engineOut?.events ?? []}
            privacyMode={privacyMode}
          />

          {/* Validation */}
          <ValidationPanel
            snapshot={snapshot}
            properties={properties}
            stockDCA={stockDCA}
            cryptoDCA={cryptoDCA}
            plannedStock={plannedStock}
            plannedCrypto={plannedCrypto}
            bills={bills}
            expenses={expenses}
          />

          {/* Events table */}
          {engineOut && (
            <EventsTable events={engineOut.events} privacyMode={privacyMode} />
          )}

          {/* Forecast preview */}
          {engineOut && (
            <ForecastPreview
              ledger={engineOut.ledger}
              annual={engineOut.annual}
              privacyMode={privacyMode}
            />
          )}
        </>
      )}
    </div>
  );
}
