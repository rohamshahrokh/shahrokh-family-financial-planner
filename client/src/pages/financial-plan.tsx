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
 *  2. Liabilities (mortgage, personal loan, credit card)
 *  3. Income (Roham salary, Fara salary, rental income, other income)
 *  4. Monthly Expenses (living, childcare, insurance, utilities, subscriptions, debt repayments)
 *  5. Investing (stock DCA, crypto DCA, property savings target, FIRE target)
 *  6. Plan Validation + Timeline (read-only summary)
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { localStore } from "@/lib/localStore";
import { useLocation } from "wouter";
import AssumptionsPanel from "@/components/AssumptionsPanel";
import { formatCurrency, safeNum } from "@/lib/finance";
// Income engine — Financial Plan registers the live trace on mount and wraps
// the three income cards in <AuditableMetric> so the native UI opens the
// populated `dashboard:income-engine` trace (rather than the architecture
// placeholder that Audit Coverage shows before any page registers it).
import { AuditableMetric } from "@/components/auditMode/AuditableMetric";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { registerTrace as registerAuditTrace } from "@/lib/auditMode/auditRegistry";
import {
  buildIncomeClassificationTrace,
  INCOME_ENGINE_TRACE_ID,
} from "@/lib/auditMode/engineTraces";
import { Search } from "lucide-react";
// Single-source-of-truth selectors. Financial Plan now DISPLAYS derived values
// (income from ledger, expenses from budget, mortgage repayment from debt
// module, combined super) and only allows manual entry when the user
// explicitly toggles "Override". See docs/DASHBOARD_DATA_CONTRACT.md.
import {
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMortgageRepayment,
  selectSuperCombined,
  selectCashToday,
  selectIncomeAggregate,
  SOURCE_OF_TRUTH,
  type DashboardInputs,
} from "@/lib/dashboardDataContract";
// Sprint 4A Final Closure — canonical headline figures so the plan page's
// net worth / surplus / debt service totals stay in lockstep with the
// Dashboard / Reports / Wealth Strategy / Timeline / Risk pages.
import {
  computeCanonicalHeadlineFigures,
  buildCanonicalAuditTrace,
} from "@/lib/canonicalLedger";
// Sprint 4D Visible UI Reconciliation — the KPI strip on this page renders
// the same nine headline metrics every other surface renders. All values
// come from this single service so net worth, assets, liabilities and
// monthly surplus cannot drift between pages.
import {
  computeCanonicalHeadlineMetrics,
} from "@/lib/canonicalHeadlineMetrics";
import SaveButton from "@/components/SaveButton";
import {
  ClipboardList, Home, TrendingUp, Bitcoin, Calendar, CheckCircle, AlertCircle,
  ArrowRight, DollarSign, RefreshCw, Wallet, Building, Car, CreditCard,
  Briefcase, PiggyBank, Globe, ChevronDown, ChevronRight, Edit3, Target,
  ShieldCheck, BarChart2, Lock, Unlock, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  CashAllocationSection,
  SuperSection as SuperAllocationSection,
} from "@/components/financial-plan/CashAndSuperSections";

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

/**
 * Read-only display for a derived (single-source-of-truth) value, with an
 * "Edit in X" deep-link AND an optional manual-override toggle. When the user
 * flips the toggle, an editable input appears — the override value writes
 * to its own column on the snapshot (consumed only when the SoT source is
 * empty).
 */
function DerivedFieldRow({
  label,
  derivedValue,
  sourceLabel,
  editHref,
  overrideKey,
  draft,
  upd,
  hint,
  navigate,
}: {
  label: string;
  derivedValue: number;
  sourceLabel: string;          // e.g. "Auto-calculated from Monthly Budget"
  editHref?: string;            // route to deep-link, e.g. "/budget"
  overrideKey?: keyof SnapshotDraft; // when present, an override toggle is shown
  draft: SnapshotDraft;
  upd: (k: keyof SnapshotDraft) => (v: string) => void;
  hint?: string;
  navigate: (to: string) => void;
}) {
  const overrideVal = overrideKey ? safeNum(draft[overrideKey] as any) : 0;
  const [override, setOverride] = useState(overrideKey ? overrideVal > 0 : false);
  return (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 items-center gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            {sourceLabel}
          </p>
          {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        <div className="col-span-1 sm:col-span-2">
          {!override ? (
            <div className="flex items-center gap-2 justify-end">
              <span className="text-sm font-mono text-foreground">{formatCurrency(derivedValue, true)}</span>
              {editHref && (
                <button
                  type="button"
                  onClick={() => navigate(editHref)}
                  className="text-[10px] underline text-muted-foreground hover:text-foreground"
                >
                  edit source
                </button>
              )}
              {overrideKey && (
                <button
                  type="button"
                  onClick={() => setOverride(true)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
                  title="Enable manual override"
                >
                  <Unlock className="w-2.5 h-2.5" /> override
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-xs text-amber-400 shrink-0">override</span>
              <span className="text-xs text-muted-foreground w-4 shrink-0">$</span>
              <Input
                type="number"
                value={overrideKey ? (draft[overrideKey] as any) : 0}
                onChange={e => overrideKey && upd(overrideKey)(e.target.value)}
                className="h-8 text-sm text-right font-mono max-w-[140px]"
              />
              <button
                type="button"
                onClick={() => { setOverride(false); if (overrideKey) upd(overrideKey)("0"); }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            </div>
          )}
        </div>
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

// ─── Native Audit Mode affordance for the Income engine ──────────────────────
// A small icon button sits beside each income-card heading. Audit Mode OFF →
// clicking still opens the trace panel (so the affordance is discoverable
// independent of the global toggle). Audit Mode ON → the wrapped numeric
// value is also clickable via <AuditableMetric>. Both paths resolve the same
// `dashboard:income-engine` trace which Financial Plan registers on mount.
function IncomeEngineTraceButton({
  openTrace,
  testId,
}: {
  openTrace: (id: string) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openTrace(INCOME_ENGINE_TRACE_ID)}
      className="inline-flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
      title="Open Income Engine audit trace"
      aria-label="Open Income Engine audit trace"
      data-testid={testId}
      data-audit-affordance="income-engine"
      data-audit-trace-id={INCOME_ENGINE_TRACE_ID}
    >
      <Search className="w-3 h-3" />
    </button>
  );
}

// ─── FIRE Goal panel ───────────────────────────────────────────────────────
//
// Sprint 14.1-B. Reads and writes the canonical mc_fire_settings row through
// the same /api/mc-fire-settings access path the rest of the codebase uses.
// Writing here flips goals_set=true (and stamps goal_set_timestamp) so the
// Action Centre's section B switches from "Goal not set" to a summary card.
//
// IMPORTANT: this panel does NOT touch any forecast / Monte Carlo / FIRE
// calculation logic. It only mutates the four input fields on mc_fire_settings.
//
function FireGoalPanel() {
  const qc = useQueryClient();
  const { auditMode } = useAuditMode();
  const { toast } = useToast();

  const { data: mcSettings, isLoading } = useQuery<any>({
    queryKey: ["/api/mc-fire-settings"],
    queryFn: () => apiRequest("GET", "/api/mc-fire-settings").then(r => r.json()),
  });

  // Local form state hydrated from the canonical row.
  const [targetAge,     setTargetAge]     = useState<string>("");
  const [passiveMonth,  setPassiveMonth]  = useState<string>("");
  const [swrPct,        setSwrPct]        = useState<string>("");
  const [hydrated,      setHydrated]      = useState(false);

  useEffect(() => {
    if (hydrated || !mcSettings) return;
    if (typeof mcSettings === "object") {
      const r = mcSettings as any;
      if (typeof r.target_fire_age === "number")        setTargetAge(String(r.target_fire_age));
      if (typeof r.target_passive_monthly === "number") setPassiveMonth(String(r.target_passive_monthly));
      if (typeof r.swr_pct === "number")                setSwrPct(String(r.swr_pct));
      setHydrated(true);
    }
  }, [mcSettings, hydrated]);

  const ageNum     = Number(targetAge);
  const passiveNum = Number(passiveMonth);
  const swrNum     = Number(swrPct);
  const ageValid     = Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 80;
  const passiveValid = Number.isFinite(passiveNum) && passiveNum > 0;
  const swrValid     = Number.isFinite(swrNum) && swrNum >= 1 && swrNum <= 10;
  const allValid     = ageValid && passiveValid && swrValid;

  // Already-saved flag drives the Action Centre's "Goal set" summary.
  const alreadyGoalsSet = !!(mcSettings as any)?.goals_set;

  const onSave = async () => {
    if (!allValid) {
      toast({
        title: "Check your FIRE goal inputs",
        description: "Age 18–80, passive income > 0, SWR 1–10%.",
        variant: "destructive",
      });
      return;
    }
    try {
      await apiRequest("PUT", "/api/mc-fire-settings", {
        target_fire_age: ageNum,
        target_passive_monthly: passiveNum,
        swr_pct: swrNum,
        goals_set: true,
        goal_set_timestamp: new Date().toISOString(),
      });
      // Invalidate so Action Centre's `useCanonicalGoal` re-fetches and Section B
      // flips from "Goal not set" to the summary card without a hard reload.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/mc-fire-settings"] }),
        qc.invalidateQueries({ queryKey: ["/api/canonical-goal"] }),
      ]);
      toast({ title: "FIRE goal saved", description: "Your Action Centre is now using these targets." });
    } catch (err: any) {
      toast({
        title: "Could not save FIRE goal",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <section id="fire-goal" data-testid="fp-fire-goal-panel">
      <SectionCard title="FIRE Goal" icon={<Target className="w-4 h-4 text-amber-400" />}>
        <div className="pt-3 space-y-3">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              <p>
                Set the retirement target the Action Centre and the unified
                recommendation engine read from.
              </p>
              {auditMode && (
                <p className="mt-1 text-[10px]">
                  Writes to <code>mc_fire_settings</code>{" "}
                  (target_fire_age, target_passive_monthly, swr_pct,
                  goals_set, goal_set_timestamp).
                </p>
              )}
            </div>
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading FIRE goal…</p>
          ) : (
            <>
              <FieldRow
                label="Target FIRE age"
                value={targetAge}
                onChange={setTargetAge}
                prefix=""
                suffix="yrs"
                hint="When you want to be financially independent (18–80)"
              />
              <FieldRow
                label="Target passive income (monthly)"
                value={passiveMonth}
                onChange={setPassiveMonth}
                hint="The monthly spending you want passive income to cover"
              />
              <FieldRow
                label="Safe withdrawal rate (SWR)"
                value={swrPct}
                onChange={setSwrPct}
                prefix=""
                suffix="%"
                hint="Typical range 3–5%. The Action Centre uses this to size the FIRE number."
              />

              <div className="mt-2 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {alreadyGoalsSet
                    ? "Goal is currently set — saving updates it."
                    : "Saving will mark this goal as set."}
                </div>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={!allValid}
                  data-testid="fp-fire-goal-save"
                  className="gap-1.5"
                >
                  <Target className="w-3.5 h-3.5" />
                  {alreadyGoalsSet ? "Update FIRE goal" : "Save FIRE goal"}
                </Button>
              </div>

              {!allValid && (
                <p className="text-[10px] text-amber-400">
                  {!ageValid && "Age must be between 18 and 80. "}
                  {!passiveValid && "Passive income must be positive. "}
                  {!swrValid && "SWR must be between 1 and 10%."}
                </p>
              )}
            </>
          )}
        </div>
      </SectionCard>
    </section>
  );
}

// On mount, if the URL hash points to #fire-goal, scroll the panel into view.
// Used by the Action Centre CTA: /financial-plan#fire-goal.
function useScrollToFireGoalHash() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#fire-goal") return;
    // Defer until the panel has rendered.
    const t = window.setTimeout(() => {
      const el = document.getElementById("fire-goal");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, []);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MyFinancialPlan() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { openTrace } = useAuditMode();
  useScrollToFireGoalHash();

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
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()),
  });
  // Sprint 4D — fetch the same investment/holdings inputs Dashboard uses so
  // the canonical headline metrics this page renders match the Dashboard
  // dollar-for-dollar. Previously this page wired `stocks: [], cryptos: [],
  // holdingsRaw: []` to the canonical layer, which silently chose the manual
  // snapshot value via `Math.max(live, ticker, manual)` while Dashboard saw
  // the live values — that is one of the three sources of the $12k drift.
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()).catch(() => []),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/cryptos"],
    queryFn: () => apiRequest("GET", "/api/cryptos").then(r => r.json()).catch(() => []),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then(r => r.json()).catch(() => []),
  });

  // ── Snapshot draft state ────────────────────────────────────────────────────
  const [draft, setDraft] = useState<SnapshotDraft | null>(null);

  // Populate draft from snapshot on first load (only once)
  const snapshotLoaded = useRef(false);
  if (snapshot && !snapshotLoaded.current) {
    snapshotLoaded.current = true;
    // Round all numeric values on load — eliminates display of floats like 32652.2566...
    // that may be stored from old saves before this fix was applied.
    // ri: parse value, use fallback ONLY if val is null/undefined (not if val is 0)
    // IMPORTANT: parseFloat("0") || fallback would incorrectly use fallback for zero values.
    // We use val ?? fallback so that explicit zeros from the ledger are preserved.
    const ri = (val: any, fallback: number): number => {
      const parsed = parseFloat(String(val ?? fallback));
      return isNaN(parsed) ? fallback : Math.round(parsed);
    };
    setDraft({
      cash:                       ri(snapshot.cash,                       0),
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

  // ─── Single-source-of-truth derived values ────────────────────────────
  // These are the canonical values the Dashboard reads. Financial Plan now
  // surfaces them as read-only displays so the user can verify them in one
  // place — manual override toggles are provided for cases where the ledger
  // is sparse and the user wants to inject an assumption.
  const sotInputs = useMemo<DashboardInputs>(() => ({
    snapshot, properties, stocks, cryptos, holdingsRaw,
    incomeRecords, expenses,
  }), [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);
  // Sprint 4A Final Closure — canonical headline figures.
  // These are the SAME numbers every other surface reads (Dashboard / Reports
  // / Wealth Strategy / Timeline / Risk), guaranteeing the plan page can never
  // drift on net worth / income / expenses / surplus / debt service / liquidity.
  const canonicalHead = useMemo(
    () => computeCanonicalHeadlineFigures(sotInputs),
    [sotInputs],
  );
  const canonicalAudit = useMemo(
    () => buildCanonicalAuditTrace(sotInputs),
    [sotInputs],
  );
  void canonicalAudit;
  // Sprint 4D — the single visible-truth headline metrics object this page
  // renders in its KPI strip. The local `draftCanonical` /
  // `totalIncome - totalExpenses` math below is retained for the live editor
  // sub-card preview only and MUST NOT be read into the rendered KPI strip.
  const headline = useMemo(
    () => computeCanonicalHeadlineMetrics(sotInputs),
    [sotInputs],
  );
  const sotMonthlyIncome    = selectMonthlyIncome(sotInputs);
  // Income engine refactor — recurring vs one-off breakdown surfaced as
  // three cards (Recurring Monthly / One-Off last 12 months / Total
  // historical), replacing the legacy single "Monthly Income (single
  // source of truth)" row.
  const sotIncomeAggregate  = selectIncomeAggregate(sotInputs);

  // Register the live Income Engine audit trace AS SOON AS this page mounts.
  // The Audit Coverage manifest can already advertise the
  // `dashboard:income-engine` trace id before any page renders, but resolves
  // to the architecture-placeholder until a host registers a populated
  // trace. Doing it here means: the moment the user navigates to Financial
  // Plan (where the three income cards live), the placeholder is replaced
  // with the live, populated trace — Audit Mode click targets and the
  // explicit "Audit Trace" affordance both open the real values.
  useEffect(() => {
    registerAuditTrace(
      buildIncomeClassificationTrace({
        aggregate: sotIncomeAggregate,
        asOf: new Date().toISOString(),
      }),
    );
  }, [sotIncomeAggregate]);
  const sotMonthlyExpenses  = selectMonthlyExpensesLedger(sotInputs);
  const sotMortgageRepayment = selectMortgageRepayment(sotInputs);
  const sotSuperCombined    = selectSuperCombined(sotInputs);
  const sotCashToday        = selectCashToday(sotInputs);

  // Derived totals.
  //
  // SOURCE-OF-TRUTH: the live "Net Worth" preview reads from the canonical
  // selector applied to the in-progress draft (so the preview reflects pending
  // edits) — NOT a separate hand-rolled sum. This is the same code path the
  // dashboard, reports, and timeline use, so the four NW numbers stay
  // identical. Local "totalLiquidAssets / totalExpenses" remain because the
  // editor card needs the sub-totals for individual cells.
  const d = draft;
  const totalIncome = d
    ? safeNum(d.roham_monthly_income) + safeNum(d.fara_monthly_income) + safeNum(d.rental_income_total) + safeNum(d.other_income)
    : 0;
  const totalLiquidCash = d
    ? safeNum(d.cash) + safeNum(d.savings_cash ?? 0) + safeNum(d.emergency_cash ?? 0) + safeNum(d.other_cash ?? 0) + safeNum(d.offset_balance)
    : 0;
  const totalLiquidAssets = d
    ? totalLiquidCash + safeNum(d.stocks) + safeNum(d.crypto)
    : 0;
  const totalExpenses = d
    ? safeNum(d.monthly_expenses) + safeNum(d.childcare_monthly) + safeNum(d.insurance_monthly) + safeNum(d.utilities_monthly) + safeNum(d.subscriptions_monthly)
    : 0;
  // Sprint 4D Visible UI Reconciliation — the KPI strip below renders the
  // canonical headline metrics (`headline.*`) so it matches Dashboard /
  // Reports / Wealth Strategy / Timeline / Risk to within $1. The legacy
  // `draftCanonical` block below remained the source of a $12k variance
  // between Financial Plan and Dashboard because it was computed against the
  // editable `draft` snapshot with `stocks: []`/`cryptos: []`/`holdingsRaw: []`
  // — different inputs than Dashboard hands the canonical layer. It is gone.
  const totalLiabilities = headline.liabilities;
  const totalAssets      = headline.assets;
  const netWorth         = headline.netWorth;
  const monthlySurplus   = headline.monthlySurplus;

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
          Cash Allocation — moved out of Settings (canonical input surface).
      ═══════════════════════════════════════════════════════════════════ */}
      <CashAllocationSection />

      {/* ═══════════════════════════════════════════════════════════════════
          Superannuation — moved out of Settings (canonical input surface).
      ═══════════════════════════════════════════════════════════════════ */}
      <SuperAllocationSection />

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — Assets
      ═══════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Assets" icon={<Wallet className="w-4 h-4 text-primary" />}>
        <div className="pt-3">
          {/* SoT advisory — Settings no longer hosts financial inputs. */}
          <div className="mb-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-2.5 text-[11px] text-sky-100/90 flex gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-300" />
            <span>
              Cash buckets <strong>Savings / Emergency / Other</strong> live in the
              <strong> Cash Allocation</strong> card on this page (below) — Settings is now
              for non-financial preferences only.
            </span>
          </div>

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Liquid Cash</p>
          <FieldRow label="Cash / Transaction Account" value={draft.cash} onChange={upd("cash")} hint="Checking only — savings/emergency/other are in the Cash Allocation card below" />
          <FieldRow label="Offset Account Balance" value={draft.offset_balance} onChange={upd("offset_balance")} hint="Mortgage offset account" />

          {/* Read-only total cash (derived) so the user sees the single number
              the Dashboard will show — reads sf_snapshot.{cash, savings_cash,
              emergency_cash, other_cash, offset_balance}. */}
          <div className="mt-1 mb-2 rounded-md bg-secondary/30 p-2 text-[11px] flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              Cash Today (all buckets + offset)
            </span>
            <span className="font-mono text-foreground">{formatCurrency(sotCashToday, true)}</span>
          </div>

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Property</p>
          <FieldRow label="PPOR Market Value" value={draft.ppor} onChange={upd("ppor")} hint="Principal place of residence" />
          <FieldRow label="Overseas Property Value" value={draft.iran_property} onChange={upd("iran_property")} hint="Iran or other offshore property (AUD)" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Investments</p>
          <FieldRow label="Stocks / ETFs (manual override)" value={draft.stocks} onChange={upd("stocks")} hint="Used when no holdings table exists" />
          <FieldRow label="Crypto (manual override)" value={draft.crypto} onChange={upd("crypto")} hint="Used when no holdings table exists" />

          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 mt-4">Superannuation</p>
          {/* SoT rule: combined super = roham_super + fara_super. The legacy
              `super_balance` master column is now a fallback only. */}
          <div className="mb-2 rounded-md bg-secondary/30 p-2 text-[11px] flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              Super (combined) — auto-calculated from Roham + Fara
            </span>
            <span className="font-mono text-foreground">{formatCurrency(sotSuperCombined, true)}</span>
          </div>
          <FieldRow label="Roham — Super Balance" value={draft.roham_super_balance} onChange={upd("roham_super_balance")} hint="Roham's super fund balance (single source of truth)" />
          <FieldRow label="Fara — Super Balance" value={draft.fara_super_balance} onChange={upd("fara_super_balance")} hint="Fara's super fund balance (single source of truth)" />

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
                // SoT rule: super_balance is DERIVED from per-person fields.
                // Always overwrite the legacy master column to keep it in sync.
                super_balance:        safeNum(draft.roham_super_balance) + safeNum(draft.fara_super_balance),
                roham_super_balance:  draft.roham_super_balance,
                fara_super_balance:   draft.fara_super_balance,
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
          <div className="mb-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-2.5 text-[11px] text-sky-100/90 flex gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-300" />
            <span>
              Mortgage balance and rate/term are owned by the <strong>Debt Module</strong>.
              Edit here for convenience; the canonical source is <strong>Debt Strategy</strong>.
            </span>
          </div>
          <FieldRow label="Mortgage (PPOR)" value={draft.mortgage} onChange={upd("mortgage")} hint="Outstanding PPOR mortgage balance" />
          <FieldRow label="Other Debts (car, personal, CC)" value={draft.other_debts} onChange={upd("other_debts")} hint="Combined other liabilities" />

          {/* Read-only mortgage repayment (PMT) so the user can see what the
              Dashboard surplus calculation will deduct each month. */}
          <div className="mt-1 mb-2 rounded-md bg-secondary/30 p-2 text-[11px] flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-emerald-400" />
              Estimated monthly repayment (P&amp;I)
            </span>
            <span className="font-mono text-foreground">{formatCurrency(Math.round(sotMortgageRepayment), true)} /mo</span>
          </div>

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
          {/* SoT advisory: the Income Tracker (sf_income ledger) is the primary
              source. Manual sub-fields are fallbacks only. The master
              `monthly_income` column is a last-resort override and should
              normally be left at 0 once the ledger has data. */}
          <div className="mb-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-2.5 text-[11px] text-sky-100/90 flex gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-300" />
            <span>
              The Dashboard prefers the <strong>Income Tracker</strong> ledger
              (last 6mo). Manual fields below are <em>fallbacks</em> used only
              when the ledger is empty.
            </span>
          </div>
          {/* Income engine refactor — three-card breakdown replaces the
              single "Monthly Income (single source of truth)" row. The
              recurring figure is what feeds Forecast / Monte Carlo /
              Deposit Power / Affordability — see
              `incomeClassificationEngine.ts`.

              Each card's value is wrapped in <AuditableMetric> so Audit
              Mode opens the live `dashboard:income-engine` trace (registered
              on mount in the effect below). A small "Audit Trace" affordance
              sits beside the heading so the trace is also discoverable when
              Audit Mode is off. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3" data-testid="income-engine-cards">
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-emerald-300/80 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  Recurring Monthly Income
                </span>
                <IncomeEngineTraceButton openTrace={openTrace} testId="income-engine-trace-recurring" />
              </div>
              <div className="text-base font-mono font-semibold text-foreground mt-1">
                <AuditableMetric traceId={INCOME_ENGINE_TRACE_ID} testId="recurring-monthly-income-value">
                  {formatCurrency(sotIncomeAggregate.recurringMonthlyIncome || sotMonthlyIncome, true)}
                </AuditableMetric>
                <span className="text-[10px] text-muted-foreground font-normal"> /mo</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Salary + rental + dividends + interest + recurring business income.
                Feeds Forecast, Monte Carlo, Deposit Power, Serviceability.
              </div>
            </div>
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-amber-300/80 flex items-center justify-between gap-1">
                <span>One-Off Income (last 12 months)</span>
                <IncomeEngineTraceButton openTrace={openTrace} testId="income-engine-trace-oneoff" />
              </div>
              <div className="text-base font-mono font-semibold text-foreground mt-1">
                <AuditableMetric traceId={INCOME_ENGINE_TRACE_ID} testId="one-off-income-12mo-value">
                  {formatCurrency(sotIncomeAggregate.oneOffIncomeLast12Months, true)}
                </AuditableMetric>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Bonuses, tax refunds, asset sales, gifts / inheritance.
                Cash events only — never inflate recurring income.
              </div>
            </div>
            <div className="rounded-md bg-sky-500/10 border border-sky-500/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-sky-300/80 flex items-center justify-between gap-1">
                <span>Total Income (historical)</span>
                <IncomeEngineTraceButton openTrace={openTrace} testId="income-engine-trace-total" />
              </div>
              <div className="text-base font-mono font-semibold text-foreground mt-1">
                <AuditableMetric traceId={INCOME_ENGINE_TRACE_ID} testId="total-income-historical-value">
                  {formatCurrency(sotIncomeAggregate.totalHistoricalIncome, true)}
                </AuditableMetric>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Every income record on the ledger, ever.
              </div>
            </div>
          </div>
          <FieldRow label="Combined Monthly Income" value={draft.monthly_income} onChange={upd("monthly_income")} hint="Master fallback — only used when ledger + sub-fields are empty" />
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
          {/* SoT advisory: Monthly Budget is the canonical source. This bug-fix
              prevents the May-2026 "$17K surplus" regression, where a stale
              manual \$4,500 override silently won over the \~\$15K/mo ledger. */}
          <div className="mb-3 rounded-md border border-sky-500/30 bg-sky-500/10 p-2.5 text-[11px] text-sky-100/90 flex gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-300" />
            <span>
              Core expenses are owned by the <strong>Monthly Budget / Ledger</strong>
              (sf_expenses). The Dashboard reads the trailing 6mo average. Use
              the override below ONLY if your ledger is empty or incomplete.
            </span>
          </div>
          <DerivedFieldRow
            label="Core Living Expenses"
            derivedValue={sotMonthlyExpenses}
            sourceLabel="Auto-calculated from Monthly Budget (6mo avg)"
            editHref="/budget"
            overrideKey="monthly_expenses"
            draft={draft}
            upd={upd}
            hint="Override only when ledger is sparse"
            navigate={navigate}
          />
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
          Sprint 14.1-B — Canonical FIRE Goal panel
          Writes to mc_fire_settings; flips goals_set so Action Centre updates.
      ═══════════════════════════════════════════════════════════════════ */}
      <FireGoalPanel />

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

      {/* Audit fix P1.4: full assumption transparency on the financial plan surface. */}
      <AssumptionsPanel mode="compact" />
    </div>
  );
}
