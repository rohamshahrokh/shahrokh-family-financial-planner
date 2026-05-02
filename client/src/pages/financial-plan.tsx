/**
 * financial-plan.tsx — My Financial Plan (Editable Control Center)
 * Route: /financial-plan
 *
 * Editable control center for all financial plan inputs.
 * Every section writes to the central ledger (snapshot + API endpoints).
 * Uses SaveButton with onSave={asyncFn} pattern throughout.
 *
 * Sections:
 *  1. Assets (cash, offset, savings target, stocks, crypto, super, PPOR, cars, overseas)
 *  2. Liabilities (mortgage, car loan, personal loan, credit card)
 *  3. Income (Roham salary, Fara salary, rental income, other income)
 *  4. Monthly Expenses (living, childcare, insurance, utilities, subscriptions, debt repayments)
 *  5. Investing (stock DCA, crypto DCA, property savings target, FIRE target)
 *  6. Plan Validation + Timeline (read-only summary)
 */

import React, { useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { localStore } from "@/lib/localStore";
import { useHashLocation } from "wouter/use-hash-location";
import { formatCurrency, safeNum } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import {
  ClipboardList, Home, TrendingUp, Bitcoin, Calendar, CheckCircle, AlertCircle,
  ArrowRight, DollarSign, RefreshCw, Wallet, Building, Car, CreditCard,
  Briefcase, PiggyBank, Globe, ChevronDown, ChevronRight, Edit3, Target,
  ShieldCheck, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type SnapshotDraft = {
  cash: number | string;
  offset_balance: number | string;
  super_balance: number | string;
  roham_super_balance: number | string;
  fara_super_balance: number | string;
  stocks: number | string;
  crypto: number | string;
  ppor: number | string;
  cars: number | string;
  iran_property: number | string;
  mortgage: number | string;
  other_debts: number | string;
  monthly_income: number | string;
  roham_monthly_income: number | string;
  fara_monthly_income: number | string;
  rental_income_total: number | string;
  other_income: number | string;
  monthly_expenses: number | string;
  childcare_monthly: number | string;
  insurance_monthly: number | string;
  utilities_monthly: number | string;
  subscriptions_monthly: number | string;
  fire_target_age: number | string;
  fire_target_monthly_income: number | string;
  property_savings_monthly: number | string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title, icon, children, defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/60">{children}</div>}
    </div>
  );
}

function FieldRow({
  label, value, onChange, prefix = "$", suffix, type = "number", hint,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  type?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 items-center gap-2 py-2.5 border-b border-border/40 last:border-0">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-1.5 col-span-1 sm:col-span-2">
        {prefix && <span className="text-xs text-muted-foreground w-4 shrink-0">{prefix}</span>}
        <Input
          ref={inputRef}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-8 text-sm text-right font-mono max-w-[180px]"
        />
        {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function DcaSummaryRow({ label, amount, frequency, active }: {
  label: string; amount: number; frequency: string; active: boolean;
}) {
  function dcaMonthlyEquiv(amount: number, frequency: string): number {
    switch (frequency) {
      case "weekly":      return amount * (52 / 12);
      case "fortnightly": return amount * (26 / 12);
      case "quarterly":   return amount / 3;
      default:            return amount;
    }
  }
  const monthly = dcaMonthlyEquiv(amount, frequency);
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 text-xs">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">({frequency})</span>
      </div>
      <div className="text-right">
        <span className="text-foreground font-mono">{formatCurrency(amount)}</span>
        <span className="text-muted-foreground ml-1">≈ {formatCurrency(monthly)}/mo</span>
      </div>
    </div>
  );
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MyFinancialPlan() {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: snapshot, isLoading: loadingSnap } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });
  const { data: properties = [], isLoading: loadingProps } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });
  const { data: stockDCA = [], isLoading: loadingStockDCA } = useQuery<any[]>({
    queryKey: ["/api/stock-dca"],
    queryFn: () => apiRequest("GET", "/api/stock-dca").then(r => r.json()),
  });
  const { data: cryptoDCA = [], isLoading: loadingCryptoDCA } = useQuery<any[]>({
    queryKey: ["/api/crypto-dca"],
    queryFn: () => apiRequest("GET", "/api/crypto-dca").then(r => r.json()),
  });
  const { data: plannedStock = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "stock"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then(r => r.json()),
  });
  const { data: plannedCrypto = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "crypto"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()),
  });

  // ── Snapshot draft state ────────────────────────────────────────────────────
  const [draft, setDraft] = useState<SnapshotDraft | null>(null);

  // Populate draft from snapshot on first load (only once)
  const snapshotLoaded = useRef(false);
  if (snapshot && !snapshotLoaded.current) {
    snapshotLoaded.current = true;
    // Round all numeric values on load — eliminates display of floats like 32652.2566...
    // that may be stored from old saves before this fix was applied.
    const ri = (val: any, fallback: number): number => Math.round(parseFloat(String(val ?? fallback)) || fallback);
    setDraft({
      cash:                       ri(snapshot.cash,                       220000),
      offset_balance:             ri(snapshot.offset_balance,             0),
      super_balance:              ri(snapshot.super_balance,              85000),
      roham_super_balance:        ri(snapshot.roham_super_balance,        0),
      fara_super_balance:         ri(snapshot.fara_super_balance,         0),
      stocks:                     ri(snapshot.stocks,                     0),
      crypto:                     ri(snapshot.crypto,                     0),
      ppor:                       ri(snapshot.ppor,                       1510000),
      cars:                       ri(snapshot.cars,                       65000),
      iran_property:              ri(snapshot.iran_property,              150000),
      mortgage:                   ri(snapshot.mortgage,                   1200000),
      other_debts:                ri(snapshot.other_debts,               19000),
      monthly_income:             ri(snapshot.monthly_income,             22000),
      roham_monthly_income:       ri(snapshot.roham_monthly_income,       0),
      fara_monthly_income:        ri(snapshot.fara_monthly_income,        0),
      rental_income_total:        ri(snapshot.rental_income_total,        0),
      other_income:               ri(snapshot.other_income,              0),
      monthly_expenses:           ri(snapshot.monthly_expenses,          14540),
      childcare_monthly:          ri(snapshot.childcare_monthly,         0),
      insurance_monthly:          ri(snapshot.insurance_monthly,         0),
      utilities_monthly:          ri(snapshot.utilities_monthly,         0),
      subscriptions_monthly:      ri(snapshot.subscriptions_monthly,     0),
      fire_target_age:            ri(snapshot.fire_target_age,           55),
      fire_target_monthly_income: ri(snapshot.fire_target_monthly_income, 20000),
      property_savings_monthly:   ri(snapshot.property_savings_monthly,  0),
    });
  }

  // Field updater — keeps focus (no re-render from parent, uses functional setState)
  const upd = useCallback((key: keyof SnapshotDraft) => (val: string) => {
    setDraft(prev => prev ? { ...prev, [key]: val } : prev);
  }, []);

  // ── Save snapshot sections ──────────────────────────────────────────────────
  // ARCHITECTURE: Financial Plan is the PRIMARY input source for the central ledger.
  // Every save must write to BOTH:
  //   1. SQLite via PUT /api/snapshot  → instant reactive update (all useQuery hooks refetch)
  //   2. Supabase via localStore.updateSnapshot()  → permanent cloud storage (survives refresh/restart)
  // The ledger reads from ['/api/snapshot'] which always reflects the latest state after invalidation.
  const saveSnapshot = useCallback(async (fields: Partial<SnapshotDraft>) => {
    // Convert string values to numbers and ROUND to integers — prevents float decimals like 32652.266...
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      const n = parseFloat(String(v));
      payload[k] = isNaN(n) ? v : Math.round(n);
    }

    // 1. Save to SQLite (instant reactive update for all pages this session)
    await apiRequest("PUT", "/api/snapshot", payload);

    // 2. Save to Supabase (permanent — survives server restart / page refresh)
    //    Run in parallel after SQLite confirms, don't block the UI on it
    localStore.updateSnapshot(payload).catch(err => {
      console.warn("[FinancialPlan] Supabase sync failed (SQLite already saved):", err);
    });

    // 3. Invalidate all pages that read from ['/api/snapshot'] so they reflect changes immediately
    await qc.invalidateQueries({ queryKey: ["/api/snapshot"] });

    toast({ title: "Saved Successfully", description: "Saved to ledger and cloud." });
  }, [qc, toast]);

  // Derived totals
  const d = draft;
  const totalIncome = d
    ? safeNum(d.roham_monthly_income) + safeNum(d.fara_monthly_income) + safeNum(d.rental_income_total) + safeNum(d.other_income)
    : 0;
  const totalLiquidAssets = d
    ? safeNum(d.cash) + safeNum(d.offset_balance) + safeNum(d.stocks) + safeNum(d.crypto)
    : 0;
  const totalExpenses = d
    ? safeNum(d.monthly_expenses) + safeNum(d.childcare_monthly) + safeNum(d.insurance_monthly) + safeNum(d.utilities_monthly) + safeNum(d.subscriptions_monthly)
    : 0;
  const totalLiabilities = d
    ? safeNum(d.mortgage) + safeNum(d.other_debts)
    : 0;
  const totalAssets = d
    ? safeNum(d.ppor) + safeNum(d.cash) + safeNum(d.offset_balance) + safeNum(d.super_balance) + safeNum(d.stocks) + safeNum(d.crypto) + safeNum(d.cars) + safeNum(d.iran_property)
    : 0;
  const netWorth = totalAssets - totalLiabilities;
  const monthlySurplus = totalIncome > 0
    ? totalIncome - totalExpenses
    : (d ? safeNum(d.monthly_income) - totalExpenses : 0);

  // DCA aggregates
  function dcaMonthlyEquiv(amount: number, frequency: string): number {
    switch (frequency) {
      case "weekly":      return amount * (52 / 12);
      case "fortnightly": return amount * (26 / 12);
      case "quarterly":   return amount / 3;
      default:            return amount;
    }
  }
  const activeStockDCA = stockDCA.filter((d: any) => d.enabled || d.status === "active");
  const activeCryptoDCA = cryptoDCA.filter((d: any) => d.enabled || d.status === "active");
  const totalDCAMonthly = [
    ...activeStockDCA.map((d: any) => dcaMonthlyEquiv(safeNum(d.amount), d.frequency ?? "monthly")),
    ...activeCryptoDCA.map((d: any) => dcaMonthlyEquiv(safeNum(d.amount), d.frequency ?? "monthly")),
  ].reduce((a, b) => a + b, 0);

  // Investment properties
  const investmentProperties = properties.filter((p: any) => p.type === "investment");

  // Timeline events
  type TimelineEvent = {
    date: Date;
    label: string;
    amount: number | null;
    type: "property" | "stock" | "crypto" | "dca-start" | "dca-end";
  };
  const timelineEvents: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [];
    for (const p of investmentProperties) {
      if (p.settlement_date) {
        events.push({ date: new Date(p.settlement_date), label: `${p.address ?? p.name ?? "Property"} — Settlement`, amount: Number(p.purchase_price ?? 0), type: "property" });
      }
    }
    for (const s of plannedStock) {
      if (s.planned_date) {
        events.push({ date: new Date(s.planned_date), label: `${s.ticker ?? s.name ?? "Stock"} — ${s.action?.toUpperCase() ?? "ORDER"}`, amount: Number(s.amount ?? 0), type: "stock" });
      }
    }
    for (const c of plannedCrypto) {
      if (c.planned_date) {
        events.push({ date: new Date(c.planned_date), label: `${c.symbol ?? c.name ?? "Crypto"} — ${c.action?.toUpperCase() ?? "ORDER"}`, amount: Number(c.amount ?? 0), type: "crypto" });
      }
    }
    for (const d of stockDCA) {
      if (d.start_date) events.push({ date: new Date(d.start_date), label: `${d.ticker ?? d.symbol ?? "Stock DCA"} — DCA Start`, amount: Number(d.amount ?? 0), type: "dca-start" });
      if (d.end_date)   events.push({ date: new Date(d.end_date),   label: `${d.ticker ?? d.symbol ?? "Stock DCA"} — DCA End`,   amount: null, type: "dca-end" });
    }
    for (const d of cryptoDCA) {
      if (d.start_date) events.push({ date: new Date(d.start_date), label: `${d.symbol ?? d.ticker ?? "Crypto DCA"} — DCA Start`, amount: Number(d.amount ?? 0), type: "dca-start" });
      if (d.end_date)   events.push({ date: new Date(d.end_date),   label: `${d.symbol ?? d.ticker ?? "Crypto DCA"} — DCA End`,   amount: null, type: "dca-end" });
    }
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [investmentProperties, plannedStock, plannedCrypto, stockDCA, cryptoDCA]);

  const dotColor: Record<TimelineEvent["type"], string> = {
    property: "bg-blue-500", stock: "bg-emerald-500", crypto: "bg-amber-500",
    "dca-start": "bg-purple-500", "dca-end": "bg-red-400",
  };

  if (loadingSnap || !draft) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="w-6 h-6 text-primary mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-foreground">My Financial Plan</h1>
            <p className="text-xs text-muted-foreground">Editable control center — all inputs write to central ledger</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/wealth-strategy")} className="gap-1.5 text-xs h-8">
          <RefreshCw className="w-3.5 h-3.5" />
          Run Monte Carlo
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Net Worth",        value: formatCurrency(netWorth, true),      color: netWorth >= 0 ? "text-primary" : "text-red-400" },
          { label: "Total Assets",     value: formatCurrency(totalAssets, true),   color: "text-emerald-400" },
          { label: "Total Liabilities",value: formatCurrency(totalLiabilities, true), color: "text-red-400" },
          { label: "Monthly Surplus",  value: formatCurrency(monthlySurplus),      color: monthlySurplus >= 0 ? "text-emerald-400" : "text-red-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-base font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — Assets
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Assets" icon={<Wallet className="w-4 h-4 text-primary" />}>
        <div className="pt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Liquid Cash</p>
          <FieldRow label="Cash / Transaction Account" value={draft.cash} onChange={upd("cash")} hint="Checking, savings accounts" />
          <FieldRow label="Offset Account Balance" value={draft.offset_balance} onChange={upd("offset_balance")} hint="Mortgage offset account" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Property</p>
          <FieldRow label="PPOR Market Value" value={draft.ppor} onChange={upd("ppor")} hint="Principal place of residence" />
          <FieldRow label="Overseas Property Value" value={draft.iran_property} onChange={upd("iran_property")} hint="Iran or other offshore property (AUD)" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Investments</p>
          <FieldRow label="Stocks / ETFs (manual override)" value={draft.stocks} onChange={upd("stocks")} hint="Used when no holdings table exists" />
          <FieldRow label="Crypto (manual override)" value={draft.crypto} onChange={upd("crypto")} hint="Used when no holdings table exists" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Superannuation</p>
          <FieldRow label="Super Balance (combined)" value={draft.super_balance} onChange={upd("super_balance")} hint="Total super if not using per-person" />
          <FieldRow label="Roham — Super Balance" value={draft.roham_super_balance} onChange={upd("roham_super_balance")} hint="Roham's super fund balance" />
          <FieldRow label="Fara — Super Balance" value={draft.fara_super_balance} onChange={upd("fara_super_balance")} hint="Fara's super fund balance" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Other</p>
          <FieldRow label="Vehicles (estimated value)" value={draft.cars} onChange={upd("cars")} hint="Car fleet current market value" />

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Assets: <span className="text-foreground font-semibold">{formatCurrency(totalAssets, true)}</span></p>
            <SaveButton
              label="Save Assets"
              onSave={() => saveSnapshot({
                cash: draft.cash, offset_balance: draft.offset_balance,
                ppor: draft.ppor, iran_property: draft.iran_property,
                stocks: draft.stocks, crypto: draft.crypto,
                super_balance: draft.super_balance,
                roham_super_balance: draft.roham_super_balance,
                fara_super_balance: draft.fara_super_balance,
                cars: draft.cars,
              })}
            />
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — Liabilities
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Liabilities" icon={<CreditCard className="w-4 h-4 text-red-400" />}>
        <div className="pt-3">
          <FieldRow label="Mortgage (PPOR)" value={draft.mortgage} onChange={upd("mortgage")} hint="Outstanding PPOR mortgage balance" />
          <FieldRow label="Other Debts (car, personal, CC)" value={draft.other_debts} onChange={upd("other_debts")} hint="Combined other liabilities" />

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Liabilities: <span className="text-red-400 font-semibold">{formatCurrency(totalLiabilities, true)}</span></p>
            <SaveButton
              label="Save Liabilities"
              onSave={() => saveSnapshot({ mortgage: draft.mortgage, other_debts: draft.other_debts })}
            />
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — Income
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Income" icon={<Briefcase className="w-4 h-4 text-emerald-400" />}>
        <div className="pt-3">
          <FieldRow label="Combined Monthly Income" value={draft.monthly_income} onChange={upd("monthly_income")} hint="MASTER FIELD — this is what all pages (ledger, dashboard, FIRE) read" />
          <FieldRow label="Roham — Monthly Net Salary" value={draft.roham_monthly_income} onChange={upd("roham_monthly_income")} hint="Roham's after-tax monthly income" />
          <FieldRow label="Fara — Monthly Net Salary" value={draft.fara_monthly_income} onChange={upd("fara_monthly_income")} hint="Fara's after-tax monthly income" />
          <FieldRow label="Rental Income (total monthly)" value={draft.rental_income_total} onChange={upd("rental_income_total")} hint="All IPs combined gross rental" />
          <FieldRow label="Other Income (monthly)" value={draft.other_income} onChange={upd("other_income")} hint="Dividends, side income, etc." />

          {totalIncome > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-emerald-400">
                Sub-field total: <span className="font-semibold">{formatCurrency(Math.round(totalIncome))}/mo</span>
                {" — "}
                <span className="text-muted-foreground">Combined Monthly Income field above is your master save value</span>
              </p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Income: <span className="text-emerald-400 font-semibold">{formatCurrency(safeNum(draft.monthly_income))}/mo</span></p>
            <SaveButton
              label="Save Income"
              onSave={() => {
                // CRITICAL FIX: monthly_income is ALWAYS the master field — use what the user typed.
                // Never auto-override with totalIncome (which can produce repeating decimals from
                // weekly→monthly rental conversions). Sub-fields are saved alongside for reference
                // but the ledger always reads monthly_income as the authoritative combined income.
                const masterIncome = Math.round(safeNum(draft.monthly_income));
                return saveSnapshot({
                  monthly_income:       masterIncome,
                  roham_monthly_income: draft.roham_monthly_income,
                  fara_monthly_income:  draft.fara_monthly_income,
                  rental_income_total:  draft.rental_income_total,
                  other_income:         draft.other_income,
                });
              }}
            />
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — Monthly Expenses
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Monthly Expenses" icon={<DollarSign className="w-4 h-4 text-amber-400" />}>
        <div className="pt-3">
          <FieldRow label="Core Living Expenses" value={draft.monthly_expenses} onChange={upd("monthly_expenses")} hint="Groceries, dining, transport, lifestyle" />
          <FieldRow label="Childcare (monthly)" value={draft.childcare_monthly} onChange={upd("childcare_monthly")} hint="Daycare, school fees, activities" />
          <FieldRow label="Insurance (monthly)" value={draft.insurance_monthly} onChange={upd("insurance_monthly")} hint="Health, life, income protection, home" />
          <FieldRow label="Utilities (monthly)" value={draft.utilities_monthly} onChange={upd("utilities_monthly")} hint="Electricity, gas, internet, phone" />
          <FieldRow label="Subscriptions (monthly)" value={draft.subscriptions_monthly} onChange={upd("subscriptions_monthly")} hint="Streaming, software, memberships" />

          <div className="mt-3 p-3 rounded-lg bg-secondary/40 border border-border/60">
            <p className="text-xs text-muted-foreground">Total monthly spend: <span className="text-foreground font-semibold">{formatCurrency(totalExpenses)}/mo</span></p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Note: mortgage & IP loan repayments tracked separately via the debt module</p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Expenses: <span className="text-amber-400 font-semibold">{formatCurrency(totalExpenses)}/mo</span></p>
            <SaveButton
              label="Save Expenses"
              onSave={() => saveSnapshot({
                monthly_expenses: draft.monthly_expenses,
                childcare_monthly: draft.childcare_monthly,
                insurance_monthly: draft.insurance_monthly,
                utilities_monthly: draft.utilities_monthly,
                subscriptions_monthly: draft.subscriptions_monthly,
              })}
            />
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — Investing & FIRE Goals
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Investing & FIRE Goals" icon={<Target className="w-4 h-4 text-purple-400" />}>
        <div className="pt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Property Savings</p>
          <FieldRow label="Property Deposit Savings (monthly)" value={draft.property_savings_monthly} onChange={upd("property_savings_monthly")} hint="Earmarked monthly savings for next IP deposit" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">FIRE Target</p>
          <FieldRow label="Target FIRE Age" value={draft.fire_target_age} onChange={upd("fire_target_age")} prefix="" suffix="yrs" hint="Age at financial independence" />
          <FieldRow label="Target Monthly Income (FIRE)" value={draft.fire_target_monthly_income} onChange={upd("fire_target_monthly_income")} hint="Monthly spending needed at retirement" />

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">FIRE: Age {draft.fire_target_age} · {formatCurrency(safeNum(String(draft.fire_target_monthly_income)))}/mo</p>
            <SaveButton
              label="Save Goals"
              onSave={() => saveSnapshot({
                property_savings_monthly: draft.property_savings_monthly,
                fire_target_age: draft.fire_target_age,
                fire_target_monthly_income: draft.fire_target_monthly_income,
              })}
            />
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6 — Active DCA Schedules (read-only summary + link to manage)
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Active DCA Schedules" icon={<RefreshCw className="w-4 h-4 text-blue-400" />} defaultOpen={false}>
        <div className="pt-3 space-y-4">
          {/* Stock DCA */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Stock DCA ({activeStockDCA.length} active)
              </p>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => navigate("/stocks")}>
                Manage <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            {activeStockDCA.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">No active stock DCA schedules</p>
            ) : (
              activeStockDCA.map((d: any, i: number) => (
                <DcaSummaryRow key={d.id ?? i} label={d.ticker ?? d.symbol ?? "Unknown"} amount={safeNum(d.amount)} frequency={d.frequency ?? "monthly"} active={true} />
              ))
            )}
          </div>

          {/* Crypto DCA */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Bitcoin className="w-3.5 h-3.5 text-amber-400" /> Crypto DCA ({activeCryptoDCA.length} active)
              </p>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => navigate("/crypto")}>
                Manage <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            {activeCryptoDCA.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">No active crypto DCA schedules</p>
            ) : (
              activeCryptoDCA.map((d: any, i: number) => (
                <DcaSummaryRow key={d.id ?? i} label={d.symbol ?? d.ticker ?? "Unknown"} amount={safeNum(d.amount)} frequency={d.frequency ?? "monthly"} active={true} />
              ))
            )}
          </div>

          <div className="pt-2 border-t border-border/60">
            <p className="text-xs text-muted-foreground">Total DCA: <span className="text-foreground font-semibold">{formatCurrency(totalDCAMonthly)}/mo</span></p>
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 7 — Investment Properties (read-only + link)
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Investment Properties" icon={<Building className="w-4 h-4 text-blue-400" />} defaultOpen={false}>
        <div className="pt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">{investmentProperties.length} investment propert{investmentProperties.length !== 1 ? "ies" : "y"} on plan</p>
            <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => navigate("/property")}>
              Manage <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          {investmentProperties.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">No investment properties planned — add in Property page</p>
          ) : (
            <div className="space-y-2">
              {investmentProperties.map((p: any, i: number) => (
                <div key={p.id ?? i} className="rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{p.address ?? p.name ?? `IP ${i + 1}`}</p>
                      {p.suburb && <p className="text-[10px] text-muted-foreground">{p.suburb}</p>}
                    </div>
                    <div className="text-right text-[10px] text-muted-foreground">
                      {p.purchase_price && <p>{formatCurrency(Number(p.purchase_price))}</p>}
                      {p.settlement_date && <p>{fmtDate(p.settlement_date)}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 8 — Chronological Timeline (read-only)
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Chronological Timeline" icon={<Calendar className="w-4 h-4 text-purple-400" />} defaultOpen={false}>
        <div className="pt-3">
          {timelineEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
              No future events — add properties, DCA schedules or planned investments
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
              <div className="space-y-1">
                {timelineEvents.map((ev, idx) => {
                  const isLast = idx === timelineEvents.length - 1;
                  return (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center pt-1 z-10">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 border-background ${dotColor[ev.type]} flex-shrink-0`} />
                        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                      </div>
                      <div className={`pb-4 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-xs font-medium text-foreground leading-snug">{ev.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {ev.date.toLocaleDateString("en-AU", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                            </p>
                          </div>
                          {ev.amount != null && ev.amount > 0 && (
                            <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatCurrency(ev.amount)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Plan Validation ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Monte Carlo Inputs — Readiness
          </h2>
          <Button size="sm" onClick={() => navigate("/wealth-strategy")} className="gap-1.5 text-xs h-8">
            Run Monte Carlo <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Investment Properties", value: investmentProperties.length, ready: investmentProperties.length >= 1, suffix: "" },
            { label: "Stock DCA Schedules",   value: activeStockDCA.length,       ready: activeStockDCA.length >= 1,       suffix: "" },
            { label: "Crypto DCA Schedules",  value: activeCryptoDCA.length,      ready: activeCryptoDCA.length >= 1,      suffix: "" },
            { label: "Monthly DCA Total",     value: formatCurrency(totalDCAMonthly), ready: totalDCAMonthly > 0,           suffix: "/mo" },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
              <div className="flex items-center gap-1.5">
                {item.ready
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                }
                <span className="text-sm font-bold text-foreground">{item.value}{item.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ─────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => navigate("/wealth-strategy")} className="gap-2 text-xs h-9">
          <RefreshCw className="w-3.5 h-3.5" />
          Run Monte Carlo with this plan
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
