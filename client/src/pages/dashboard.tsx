import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  formatCurrency,
  safeNum,
  calcSavingsRate,
  projectNetWorth,
  buildCashFlowSeries,
  aggregateCashFlowToAnnual,
  calcNegativeGearing,
  type NGSummary,
} from "@/lib/finance";
import { runCashEngine, getCashKPICards } from "@/lib/cashEngine";
import { syncFromCloud, getLastSync } from "@/lib/localStore";
import { useAppStore } from "@/lib/store";
import { maskValue } from "@/components/PrivacyMask";
import KpiCard from "@/components/KpiCard";
import SaveButton, { useSaveOnEnter } from "@/components/SaveButton";
import { useState, useMemo, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Home,
  CreditCard,
  PiggyBank,
  Calendar,
  Layers,
  Target,
  Edit2,
  Check,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  Flame,
  Shield,
  Sword,
  Building2,
  Clock,
  AlertTriangle,
  Receipt,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import familyImg from "@assets/family.jpeg";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import CFODashboardWidget from "@/components/CFODashboardWidget";
import BestMoveCard from "@/components/BestMoveCard";
import TaxAlphaCard from "@/components/TaxAlphaCard";
import RiskRadarCard from "@/components/RiskRadarCard";
import FIREPathCard from "@/components/FIREPathCard";
import { Link } from "wouter";
import { useForecastStore } from "@/lib/forecastStore";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";

// ─── Chart colours ────────────────────────────────────────────────────────────
const COLORS = [
  "hsl(43,85%,55%)",
  "hsl(188,60%,48%)",
  "hsl(142,60%,45%)",
  "hsl(20,80%,55%)",
  "hsl(270,60%,60%)",
  "hsl(0,72%,51%)",
];

// ─── Shared tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value, true)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Cashflow tooltip with NG refund line ───────────────────────────────────
const CashflowTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: 'Salary / Income',            value: d.income   ?? 0, color: 'hsl(142,60%,45%)' },
    { label: 'Rental Income',              value: d.rental   ?? 0, color: 'hsl(188,60%,48%)' },
    { label: 'Living Expenses',            value: -(d.expenses ?? 0), color: 'hsl(0,72%,51%)' },
    { label: 'Mortgage / Loan Repayments', value: -(d.mortgage ?? 0), color: 'hsl(20,80%,55%)' },
    { label: 'NG Tax Refund',              value: d.ngRefund  ?? 0, color: 'hsl(43,85%,55%)' },
    { label: 'Net Cashflow',               value: d.netCF    ?? 0, color: (d.netCF ?? 0) >= 0 ? 'hsl(142,60%,45%)' : 'hsl(0,72%,51%)' },
    { label: 'Ending Cash Balance',        value: d.balance  ?? 0, color: 'hsl(270,60%,60%)' },
  ].filter(r => r.value !== 0);
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 shadow-xl text-xs min-w-[220px]">
      <p className="text-muted-foreground font-semibold mb-2">{label}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: r.color }}>{r.label}</span>
          <span style={{ color: r.color }} className="font-mono tabular-nums">
            {r.value >= 0 ? '+' : ''}{formatCurrency(r.value, true)}
          </span>
        </div>
      ))}
      {(d.ngRefund ?? 0) > 0 && (
        <p className="text-yellow-400 text-[10px] mt-1.5 border-t border-border pt-1">
          ✓ Negative Gearing Tax Refund
        </p>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient();
  const { chartView, privacyMode, togglePrivacy, currentUser } = useAppStore();
  const { forecastMode, profile, monteCarloResult } = useForecastStore();
  const fa = useForecastAssumptions();

  const [editSnap, setEditSnap] = useState(false);
  const [snapDraft, setSnapDraft] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync);
  const [ngRefundMode, setNgRefundMode] = useState<'lump-sum' | 'payg'>('lump-sum');
  // Wire cash flow chart to global chartView from the header toggle
  const cashFlowView = chartView;

  // Debounce ref — prevents double saves triggered by fast Enter presses
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── useSaveOnEnter — attach to the snapshot edit container ──────────────
  const handleSaveSnapCallback = useCallback(async () => {
    if (!snapDraft) return;
    // Debounce guard: ignore if a save is already pending within 300 ms
    if (saveDebounceRef.current) return;
    saveDebounceRef.current = setTimeout(() => {
      saveDebounceRef.current = null;
    }, 300);
    await updateSnap.mutateAsync(snapDraft);
    setEditSnap(false);
    setSnapDraft(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapDraft]);

  const snapContainerRef = useSaveOnEnter(handleSaveSnapCallback, editSnap);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const handleSyncFromCloud = useCallback(async () => {
    setSyncing(true);
    try {
      await syncFromCloud();
      await qc.invalidateQueries();
      setLastSync(getLastSync());
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  const { data: snapshot } = useQuery({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then((r) => r.json()),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then((r) => r.json()),
  });
  const { data: stocks = [] } = useQuery({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then((r) => r.json()),
  });
  const { data: cryptos = [] } = useQuery({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then((r) => r.json()),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then((r) => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then((r) => r.json()),
  });
  // ─── CFO: bills, budgets, alert-logs ───────────────────────────────────
  const { data: billsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/bills"],
    queryFn: () => apiRequest("GET", "/api/bills").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: budgetsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/budgets"],
    queryFn: () => apiRequest("GET", "/api/budgets").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: alertLogsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/alert-logs"],
    queryFn: () => apiRequest("GET", "/api/alert-logs").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: stockTransactionsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-transactions"],
    queryFn: () => apiRequest("GET", "/api/stock-transactions").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoTransactionsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-transactions"],
    queryFn: () => apiRequest("GET", "/api/crypto-transactions").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: stockDCASchedules = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-dca"],
    queryFn: () => apiRequest("GET", "/api/stock-dca").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoDCASchedules = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-dca"],
    queryFn: () => apiRequest("GET", "/api/crypto-dca").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: plannedStockOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "stock"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: plannedCryptoOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "crypto"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then((r) => r.json()),
    staleTime: 0,
  });

  const updateSnap = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/snapshot", data).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/snapshot"] }),
  });

  // ─── Income Tracker: monthly equivalent sum ─────────────────────────────
  // Frequency → monthly multiplier
  const FREQ_MULT: Record<string, number> = {
    Weekly:      52 / 12,
    Fortnightly: 26 / 12,
    Monthly:     1,
    Quarterly:   4 / 12,
    Annual:      1 / 12,
    "One-off":   0,
  };
  // ─── Active recurring income streams ────────────────────────────────────
  // Deduplicate by: member × source × description ONLY.
  // Frequency is intentionally excluded from the key — a salary stream that
  // switched from Fortnightly → Monthly is the SAME stream; the most-recent
  // record carries the current frequency and amount.
  // One-off records are excluded from monthly recurring total.
  const activeIncomeStreams = useMemo(() => {
    const streamMap = new Map<string, any>();
    const sorted = [...(incomeRecords as any[])]
      .filter((r: any) => r.frequency !== 'One-off')
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
    for (const r of sorted) {
      const key = [
        (r.member      || '').toLowerCase().trim(),
        (r.source      || '').toLowerCase().trim(),
        (r.description || '').toLowerCase().trim(),
      ].join('|');
      if (!streamMap.has(key)) streamMap.set(key, r);
    }
    return Array.from(streamMap.values());
  }, [incomeRecords]);

  const incomeTrackerMonthly = useMemo(() => {
    return activeIncomeStreams.reduce((sum: number, r: any) => {
      const mult = FREQ_MULT[r.frequency] ?? 1;
      return sum + safeNum(r.amount) * mult;
    }, 0);
  }, [activeIncomeStreams]);

  const activeStreamsCount = activeIncomeStreams.length;
  const useIncomeTracker = incomeRecords.length > 0;
  const incomeSource = useIncomeTracker ? "Income Tracker" : "Snapshot fallback";

  // ─── Snapshot defaults ────────────────────────────────────────────────────
  // safeNum() converts undefined / null / NaN / "" → 0 so no arithmetic
  // can ever produce NaN regardless of what the API or localStorage returns.
  const snap = {
    ppor:             safeNum(snapshot?.ppor)             || 1510000,
    cash:             safeNum(snapshot?.cash)             || 220000,
    offset_balance:   safeNum(snapshot?.offset_balance),   // mortgage offset account
    super_balance:    safeNum(snapshot?.super_balance)    || 85000,
    stocks:           safeNum(snapshot?.stocks),
    crypto:           safeNum(snapshot?.crypto),
    cars:             safeNum(snapshot?.cars)             || 65000,
    iran_property:    safeNum(snapshot?.iran_property)    || 150000,
    mortgage:         safeNum(snapshot?.mortgage)         || 1200000,
    other_debts:      safeNum(snapshot?.other_debts)      || 19000,
    monthly_income:   useIncomeTracker
      ? incomeTrackerMonthly
      : safeNum(snapshot?.monthly_income)   || 22000,
    monthly_expenses: safeNum(snapshot?.monthly_expenses) || 14540,
    // ── Super per-person fields (passed through to finance engine) ──
    roham_super_balance:          safeNum(snapshot?.roham_super_balance),
    roham_super_salary:           safeNum(snapshot?.roham_super_salary),
    roham_employer_contrib:       safeNum(snapshot?.roham_employer_contrib)       || 11.5,
    roham_salary_sacrifice:       safeNum(snapshot?.roham_salary_sacrifice),
    roham_super_personal_contrib: safeNum(snapshot?.roham_super_personal_contrib),
    roham_super_annual_topup:     safeNum(snapshot?.roham_super_annual_topup),
    roham_super_growth_rate:      safeNum(snapshot?.roham_super_growth_rate)      || 8.0,
    roham_super_fee_pct:          safeNum(snapshot?.roham_super_fee_pct)          || 0.5,
    roham_super_insurance_pa:     safeNum(snapshot?.roham_super_insurance_pa),
    roham_super_option:           (snapshot?.roham_super_option  as string)       || 'High Growth',
    roham_super_provider:         (snapshot?.roham_super_provider as string)      || '',
    roham_retirement_age:         safeNum(snapshot?.roham_retirement_age)         || 60,
    fara_super_balance:           safeNum(snapshot?.fara_super_balance),
    fara_super_salary:            safeNum(snapshot?.fara_super_salary),
    fara_employer_contrib:        safeNum(snapshot?.fara_employer_contrib)        || 11.5,
    fara_salary_sacrifice:        safeNum(snapshot?.fara_salary_sacrifice),
    fara_super_personal_contrib:  safeNum(snapshot?.fara_super_personal_contrib),
    fara_super_annual_topup:      safeNum(snapshot?.fara_super_annual_topup),
    fara_super_growth_rate:       safeNum(snapshot?.fara_super_growth_rate)       || 8.0,
    fara_super_fee_pct:           safeNum(snapshot?.fara_super_fee_pct)           || 0.5,
    fara_super_insurance_pa:      safeNum(snapshot?.fara_super_insurance_pa),
    fara_super_option:            (snapshot?.fara_super_option  as string)        || 'High Growth',
    fara_super_provider:          (snapshot?.fara_super_provider as string)       || '',
    fara_retirement_age:          safeNum(snapshot?.fara_retirement_age)          || 60,
  };

  // ─── Derived values ───────────────────────────────────────────────────────
  const stocksTotal    = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
  const cryptoTotal    = cryptos.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);
  const totalInvestments = stocksTotal + cryptoTotal;

  // Use live holdings for stocks/crypto (from DB), add offset_balance alongside cash.
  // snap.stocks / snap.crypto are snapshot fallbacks — do NOT add both or you double-count.
  const liveStocks  = stocksTotal  > 0 ? stocksTotal  : snap.stocks;
  const liveCrypto  = cryptoTotal  > 0 ? cryptoTotal  : snap.crypto;

  // Super: use per-person balances if entered, else fall back to legacy super_balance field.
  // NOTE: currentTotalSuper is also declared below (line ~421) from the same logic —
  // we use a single constant here so totalAssets is computed before the projection block.
  const _superRohamNow = snap.roham_super_balance > 0 ? snap.roham_super_balance : snap.super_balance * 0.6;
  const _superFaraNow  = snap.fara_super_balance  > 0 ? snap.fara_super_balance  : snap.super_balance * 0.4;
  const _totalSuperNow = _superRohamNow + _superFaraNow;

  const totalAssets      = snap.ppor + snap.cash + snap.offset_balance + _totalSuperNow + liveStocks + liveCrypto + snap.cars + snap.iran_property;
  const totalLiabilities = snap.mortgage + snap.other_debts;
  const netWorth         = totalAssets - totalLiabilities;
  // Accessible vs Locked wealth split
  const lockedWealth     = _totalSuperNow;            // super is locked until preservation age
  const accessibleWealth = netWorth - lockedWealth;   // total NW excluding super
  const surplus          = snap.monthly_income - snap.monthly_expenses;
  const savingsRate      = calcSavingsRate(snap.monthly_income, snap.monthly_expenses);
  const propertyEquity   = snap.ppor - snap.mortgage;

  // Planned transactions only — actuals are already counted in expenses
  const plannedStockTx = useMemo(
    () => (stockTransactionsRaw as any[]).filter((t: any) => t.status === 'planned'),
    [stockTransactionsRaw]
  );
  const plannedCryptoTx = useMemo(
    () => (cryptoTransactionsRaw as any[]).filter((t: any) => t.status === 'planned'),
    [cryptoTransactionsRaw]
  );

  // ─── Negative Gearing Analysis (must come before projection — used in its deps) ────
  const ngSummary = useMemo<NGSummary>(() =>
    calcNegativeGearing({
      properties: properties as any[],
      annualSalaryIncome: safeNum(snap.monthly_income) * 12,
      refundMode: ngRefundMode,
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [properties, snap.monthly_income, ngRefundMode]);

  // ─── 10-year projection ───────────────────────────────────────────────────
  const projection = useMemo(
    () => projectNetWorth({
      snapshot: snap,
      properties,
      stocks,
      cryptos,
      // Pass live holdings values so projection starts from actual portfolio,
      // not the potentially-stale snapshot.stocks / snapshot.crypto field.
      liveStocksValue: liveStocks,
      liveCryptoValue: liveCrypto,
      stockTransactions:   plannedStockTx,
      cryptoTransactions:  plannedCryptoTx,
      stockDCASchedules,
      cryptoDCASchedules,
      plannedStockOrders,
      plannedCryptoOrders,
      years:               10,
      inflation:           fa.flat.inflation,
      ppor_growth:         fa.flat.property_growth,
      yearlyAssumptions:   fa.yearly,
      // Central Cash Engine — real monthly cash balance replaces 50% shortcut
      expenses:            expenses as any[],
      bills:               billsRaw as any[],
      ngRefundMode,
      ngAnnualBenefit:     ngSummary.totalAnnualTaxBenefit,
      annualSalaryIncome:  safeNum(snap.monthly_income) * 12,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, properties, stocks, cryptos, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, expenses, billsRaw, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );

  const year10NW      = projection[9]?.endNetWorth || netWorth;
  const passiveIncome = projection[0]?.passiveIncome || 0;

  // ─── Super KPI values ────────────────────────────────────────────────────
  // Current super = per-person if available, else fall back to legacy super_balance
  const currentSuperRoham = snap.roham_super_balance || snap.super_balance * 0.6;
  const currentSuperFara  = snap.fara_super_balance  || snap.super_balance * 0.4;
  const currentTotalSuper = currentSuperRoham + currentSuperFara;
  // 10-year projected super from projection engine
  const super10Year = projection[9]?.totalSuper || currentTotalSuper;
  // Projected super at Roham age 60 (born ~1987 → 2047 = ~21 years from 2026)
  // projection only runs 10 years on the dashboard; use year 10 as best available proxy
  const superAt60Idx = Math.min(20, projection.length - 1);
  // Estimate at 60 by compounding year-10 super forward at 8% p.a. for remaining years
  const super10SuperVal = projection[Math.min(9, projection.length - 1)]?.totalSuper || currentTotalSuper;
  const yearsToSixty = Math.max(0, 2047 - (2026 + Math.min(9, projection.length - 1)));
  const superAt60 = projection[superAt60Idx]?.totalSuper
    || Math.round(super10SuperVal * Math.pow(1.08, yearsToSixty));

  // ─── CFO card computed values ─────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Bills: active bills only, sorted by next_due_date ascending
  const activeBills = useMemo(() => {
    return (billsRaw as any[])
      .filter((b: any) => b.active !== false)
      .sort((a: any, b: any) => {
        const da = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity;
        const db = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity;
        return da - db;
      });
  }, [billsRaw]);

  const billsDueCount = activeBills.filter((b: any) => {
    if (!b.next_due_date) return false;
    const due = new Date(b.next_due_date);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 30;
  }).length;

  const nextBill = activeBills.find((b: any) => {
    if (!b.next_due_date) return false;
    const due = new Date(b.next_due_date);
    due.setHours(0, 0, 0, 0);
    return due.getTime() >= today.getTime();
  });

  const nextBillLabel = nextBill
    ? (() => {
        const due = new Date(nextBill.next_due_date);
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
        if (diffDays === 0) return `${nextBill.bill_name} today`;
        if (diffDays === 1) return `${nextBill.bill_name} tomorrow`;
        return `${nextBill.bill_name} in ${diffDays}d`;
      })()
    : activeBills.length > 0 ? `${activeBills.length} bills tracked` : "No bills";

  // Monthly fixed costs from active bills (converted to monthly)
  const billMonthlyTotal = useMemo(() => {
    const FREQ: Record<string, number> = {
      Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
      Quarterly: 4 / 12, "Semi-Annual": 2 / 12, Annual: 1 / 12,
    };
    return activeBills.reduce((sum: number, b: any) => {
      const mult = FREQ[b.frequency] ?? 1;
      return sum + safeNum(b.amount) * mult;
    }, 0);
  }, [activeBills]);

  const cashAfterBills = snap.monthly_income - billMonthlyTotal;

  // Budgets: categories over budget this month
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const budgetsThisMonth = useMemo(() => {
    return (budgetsRaw as any[]).filter((b: any) =>
      String(b.year) === String(today.getFullYear()) &&
      String(b.month).padStart(2, "0") === String(today.getMonth() + 1).padStart(2, "0")
    );
  }, [budgetsRaw]);

  const expensesThisMonth = useMemo(() => {
    return (expenses as any[]).filter((e: any) =>
      (e.date || e.expense_date || "").startsWith(thisMonth)
    );
  }, [expenses, thisMonth]);

  const categoriesOverBudget = useMemo(() => {
    return budgetsThisMonth.filter((b: any) => {
      const actual = expensesThisMonth
        .filter((e: any) => e.category === b.category)
        .reduce((s: number, e: any) => s + safeNum(e.amount), 0);
      return actual > safeNum(b.budget_amount);
    }).length;
  }, [budgetsThisMonth, expensesThisMonth]);

  // Alert logs: unresolved from last 24 hours
  const recentAlerts = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (alertLogsRaw as any[]).filter((a: any) => {
      const ts = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      return ts > cutoff;
    }).length;
  }, [alertLogsRaw]);

  // ─── Chart data ───────────────────────────────────────────────────────────
  const assetData = [
    { name: "PPOR",          value: snap.ppor },
    { name: "Cash",          value: snap.cash + snap.offset_balance },
    { name: "Super",         value: snap.super_balance },
    { name: "Cars",          value: snap.cars },
    { name: "Iran Property", value: snap.iran_property },
    { name: "Stocks",        value: liveStocks },
    { name: "Crypto",        value: liveCrypto },
  ].filter((d) => d.value > 0);

  const cashFlowData = [
    { month: "Income",   value: snap.monthly_income,   fill: "hsl(142,60%,45%)" },
    { month: "Expenses", value: snap.monthly_expenses, fill: "hsl(0,72%,51%)" },
    { month: "Surplus",  value: surplus,               fill: "hsl(43,85%,55%)" },
  ];


  // ─── Master Cash Flow Series (2025 → 2035) ────────────────────────────────
  const cashFlowSeries = useMemo(
    () => buildCashFlowSeries({
      snapshot: snap,
      expenses: expenses as any[],
      properties: properties as any[],
      stockTransactions: plannedStockTx,
      cryptoTransactions: plannedCryptoTx,
      stockDCASchedules,
      cryptoDCASchedules,
      plannedStockOrders,
      plannedCryptoOrders,
      inflationRate: fa.flat.inflation,
      incomeGrowthRate: fa.flat.income_growth,
      ngRefundMode,
      ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      annualSalaryIncome: safeNum(snap.monthly_income) * 12,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );

  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

  // ─── Central Cash Engine (professional monthly ledger + liquidity analysis) ───
  const cashEngineOut = useMemo(() => runCashEngine({
    snapshot: snap,
    properties:          properties as any[],
    stockTransactions:   plannedStockTx,
    cryptoTransactions:  plannedCryptoTx,
    stockDCASchedules,
    cryptoDCASchedules,
    plannedStockOrders,
    plannedCryptoOrders,
    bills:               billsRaw as any[],
    expenses:            expenses as any[],
    inflationRate:       fa.flat.inflation,
    incomeGrowthRate:    fa.flat.income_growth,
    ngRefundMode,
    ngAnnualBenefit:     ngSummary.totalAnnualTaxBenefit,
    annualSalaryIncome:  safeNum(snap.monthly_income) * 12,
    reservedCash:        30_000,
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [snap, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, billsRaw, expenses, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );
  const cashKPIs = useMemo(() => getCashKPICards(cashEngineOut, safeNum(snap.cash)), [cashEngineOut, snap.cash]);
  const liquidityWarnings = cashEngineOut.liquidity.warnings.filter(w => w.level === 'warning' || w.level === 'critical');

  // ─── Wealth Strategy Summary Cards ───────────────────────────────────────
  const wealthCards = useMemo(() => {
    // FIRE progress — use liveStocks/liveCrypto (no double-count), include offset_balance
    const currentInvestable = snap.cash + snap.offset_balance + snap.super_balance + liveStocks + liveCrypto;
    const requiredFIRE = (10000 * 12) / 0.04; // default: $10k/mo at 4% SWR
    const fireProgress = Math.min(100, Math.round((currentInvestable / requiredFIRE) * 100));

    // Emergency score
    const totalMonthly = snap.monthly_expenses + snap.mortgage / 12;
    const monthsCovered = snap.cash / totalMonthly;
    const emergencyScore = Math.min(100, Math.round((monthsCovered / 6) * 100));
    const emergencyAlert = emergencyScore < 50;

    // Debt priority
    const totalDebt = snap.mortgage + snap.other_debts;
    const debtToIncome = totalDebt / (snap.monthly_income * 12);
    const debtAlert = debtToIncome > 5;

    // Property readiness (rough)
    const targetIP = 750000;
    const depositNeeded = targetIP * 0.2 + targetIP * 0.035; // 20% + stamp duty
    const depositReady = Math.min(100, Math.round(((snap.cash + snap.offset_balance) * 0.7 / depositNeeded) * 100));

    // Retirement age estimate (rough)
    const currentInvestable2 = snap.cash + snap.offset_balance + snap.super_balance + liveStocks + liveCrypto;
    const targetFIRE = (8000 * 12) / 0.04;
    const monthlySaving = Math.max(surplus, 100);
    const r = 0.07 / 12;
    let months = 0;
    let accum = currentInvestable2;
    while (accum < targetFIRE && months < 600) {
      accum = accum * (1 + r) + monthlySaving;
      months++;
    }
    const fireAge = 36 + Math.round(months / 12); // default current age 36

    // Hidden money (simple estimate)
    const hiddenMonthly = Math.round(snap.other_debts * 0.15 / 12 + Math.max(0, snap.cash - snap.monthly_expenses * 6) * 0.04 / 12);

    return [
      { label: "FIRE Progress", value: `${fireProgress}%`, sub: "of target capital", Icon: Flame, alert: fireProgress < 20 },
      { label: "Emergency", value: `${emergencyScore}/100`, sub: `${Math.round(monthsCovered)}mo covered`, Icon: Shield, alert: emergencyAlert },
      { label: "Total Debt", value: formatCurrency(totalDebt, true), sub: debtAlert ? "High debt ratio" : "Manageable", Icon: Sword, alert: debtAlert },
      { label: "IP Readiness", value: `${depositReady}%`, sub: "deposit ready", Icon: Building2, alert: depositReady < 30 },
      { label: "FIRE Age", value: `~${fireAge}`, sub: "est. financial freedom", Icon: Clock, alert: fireAge > 60 },
      { label: "Hidden Money", value: `${formatCurrency(hiddenMonthly * 12, true)}/yr`, sub: "potential savings", Icon: Eye, alert: hiddenMonthly > 500 },
      { label: "Savings Rate", value: `${savingsRate.toFixed(0)}%`, sub: savingsRate < 20 ? "Below target" : "On track", Icon: AlertTriangle, alert: savingsRate < 20 },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, surplus, savingsRate, stocksTotal, cryptoTotal]);

  // Detect property settlement months for chart annotations
  const settlementAnnotations = useMemo(() => {
    const annotations: Array<{ label: string; name: string; amount: number }> = [];
    const investProps = (properties as any[]).filter(p => p.type !== 'ppor');
    for (const prop of investProps) {
      const settleDateStr = prop.settlement_date || prop.purchase_date;
      if (!settleDateStr) continue;
      const d = new Date(settleDateStr);
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      const cost = safeNum(prop.deposit) + safeNum(prop.stamp_duty) + safeNum(prop.legal_fees)
        + safeNum(prop.renovation_costs) + safeNum(prop.building_inspection) + safeNum(prop.loan_setup_fees);
      const name = prop.address || prop.suburb || prop.name || 'Investment Property';
      annotations.push({ label, name, amount: cost });
    }
    return annotations;
  }, [properties]);

  const masterCFData = useMemo(() => {
    if (cashFlowView === "annual") {
      return cashFlowAnnual.map((y) => ({
        label:      y.year.toString(),
        income:     y.income,
        expenses:   y.totalExpenses,
        mortgage:   y.mortgageRepayment,
        rental:     y.rentalIncome,
        ngRefund:   y.ngTaxBenefit,
        netCF:      y.netCashFlow,
        balance:    y.endingBalance,
        hasActuals: y.hasActualMonths > 0,
      }));
    } else {
      return cashFlowSeries.map((m) => ({
        label:      m.label,
        income:     m.income,
        expenses:   m.totalExpenses,
        mortgage:   m.mortgageRepayment,
        rental:     m.rentalIncome,
        ngRefund:   m.ngTaxBenefit,
        netCF:      m.netCashFlow,
        balance:    m.cumulativeBalance,
        hasActuals: m.isActual,
      }));
    }
  }, [cashFlowView, cashFlowAnnual, cashFlowSeries]);

  // Net worth growth chart
  const nwGrowthData = projection.map((p) => ({
    year:        p.year.toString(),
    netWorth:    p.endNetWorth,
    assets:      p.totalAssets,
    liabilities: p.totalLiabilities,
  }));

  // Expense categories
  const expensesByCategory = expenses.reduce((acc: any, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const expensePieData = Object.entries(expensesByCategory)
    .slice(0, 7)
    .map(([name, value]) => ({ name, value: value as number }));

  // ─── Save handler ─────────────────────────────────────────────────────────
  const handleSaveSnap = async () => {
    if (snapDraft) {
      await updateSnap.mutateAsync(snapDraft);
      setEditSnap(false);
      setSnapDraft(null);
    }
  };

  // ─── Snapshot field config ───────────────────────────────────────────────
  const snapFields = [
    { label: "PPOR",                key: "ppor",             group: "asset" },
    { label: "Cash (Everyday)",     key: "cash",             group: "asset" },
    { label: "Cash (Savings)",      key: "savings_cash",     group: "cash_alloc" },
    { label: "Cash (Emergency)",    key: "emergency_cash",   group: "cash_alloc" },
    { label: "Cash (Other)",        key: "other_cash",       group: "cash_alloc" },
    { label: "Offset Balance",      key: "offset_balance",   group: "asset" },
    { label: "Super",               key: "super_balance",    group: "asset" },
    { label: "Cars",                key: "cars",             group: "asset" },
    { label: "Iran Property",       key: "iran_property",    group: "asset" },
    { label: "Mortgage",            key: "mortgage",         group: "liability" },
    { label: "Other Debts",         key: "other_debts",      group: "liability" },
    { label: "Monthly Income",      key: "monthly_income",   group: "income" },
    { label: "Monthly Expenses",    key: "monthly_expenses", group: "expense" },
  ] as const;

  // ─── Render ───────────────────────────────────────────────────────────────

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8 animate-fade-up">

      {/* ═══════════════════════════════════════════════════════════════════
          NARRATIVE INTELLIGENCE BANNER
          ════════════════════════════════════════════════════════════════ */}
      <div className="narrative-banner">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold mb-1">
              Wealth Intelligence
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-bold">{currentUser === "Fara" ? "Fara" : "Roham"},</span>{" "}
              your net worth is{" "}
              <span className="font-bold text-gold num-display">{formatCurrency(netWorth, true)}</span>
              {savingsRate >= 20
                ? " — you're saving well and building momentum."
                : surplus > 0
                  ? " — surplus is positive but savings rate has room to grow."
                  : " — expenses currently exceed income. Review your cashflow."}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
              <span className="text-xs text-muted-foreground">
                Projected 2035:{" "}
                <span className="font-bold text-forecast-l num-display">
                  {formatCurrency(year10NW, true)}
                </span>
              </span>
              {forecastMode === "monte-carlo" && monteCarloResult && (
                <span className="text-xs text-muted-foreground">
                  MC Median 2035:{" "}
                  <span className="font-bold text-forecast-l num-display">
                    {formatCurrency(monteCarloResult.median, true)}
                  </span>
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Monthly surplus:{" "}
                <span className={`font-bold num-display ${surplus >= 0 ? "text-success-l" : "text-danger-l"}`}>
                  {formatCurrency(surplus, true)}
                </span>
              </span>
              {liquidityWarnings.length > 0 && (
                <span className="text-xs text-danger-l font-semibold">
                  {liquidityWarnings.length} liquidity warning{liquidityWarnings.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Forecast mode badge */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                forecastMode === "monte-carlo"
                  ? "bg-forecast-surface text-forecast-l border-forecast/20"
                  : forecastMode === "year-by-year"
                    ? "bg-intel-surface text-intel-l border-intelligence/20"
                    : "bg-gold-surface text-gold border-gold/20"
              }`}
            >
              {forecastMode === "monte-carlo"
                ? "Monte Carlo"
                : forecastMode === "year-by-year"
                  ? "Year-by-Year"
                  : `Profile · ${profile.charAt(0).toUpperCase() + profile.slice(1)}`}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO STATS — TODAY / PLAN / FUTURE / ACTION
          4-column grid matching the 4 master steps
          ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">

        {/* A — TODAY */}
        <div className="hero-stat-card col-span-2 lg:col-span-1">
          <p className="hero-stat-label" style={{ color: "hsl(var(--intelligence-light))" }}>
            1 · Today
          </p>
          <p className="hero-stat-value num-display">
            {maskValue(formatCurrency(netWorth, true), privacyMode)}
          </p>
          <p className="hero-stat-sub">Net Worth</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="kpi-pill neutral">
              Cash {maskValue(formatCurrency(snap.cash, true), privacyMode)}
            </span>
            <span className="kpi-pill negative">
              Debt {maskValue(formatCurrency(totalLiabilities, true), privacyMode)}
            </span>
          </div>
        </div>

        {/* B — PLAN */}
        <div className="hero-stat-card">
          <p className="hero-stat-label" style={{ color: "hsl(var(--gold-light))" }}>
            2 · Plan
          </p>
          <p className="text-sm font-semibold text-foreground leading-snug">
            {snap.cash + snap.offset_balance > 150000
              ? "Building deposit for next IP"
              : surplus > 3000
                ? "Maximise DCA & super"
                : "Reduce expenses first"}
          </p>
          <p className="hero-stat-sub mt-1">Active strategy</p>
          <div className="mt-2">
            <span className={`kpi-pill ${savingsRate >= 20 ? "positive" : "negative"}`}>
              SR {savingsRate.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* C — FUTURE */}
        <div className="hero-stat-card">
          <p className="hero-stat-label" style={{ color: "hsl(var(--forecast-light))" }}>
            3 · Future
          </p>
          <p className="hero-stat-value num-display" style={{ color: "hsl(var(--forecast-light))" }}>
            {maskValue(formatCurrency(year10NW, true), privacyMode)}
          </p>
          <p className="hero-stat-sub">Proj. 2035</p>
          <div className="mt-2">
            <span className="kpi-pill neutral">
              FIRE ~age {wealthCards.find(c => c.label === "FIRE Age")?.value ?? "?"}
            </span>
          </div>
        </div>

        {/* D — ACTION */}
        <div className="hero-stat-card" style={{ borderColor: "hsl(var(--gold-dim) / 0.6)" }}>
          <p className="hero-stat-label" style={{ color: "hsl(var(--success-light))" }}>
            4 · Action
          </p>
          <div className="flex-1">
            <BestMoveCard compact />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI STRIP — 6 key metrics across in a horizontal strip
          ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          {
            label: "Total Assets",
            value: formatCurrency(totalAssets, true),
            color: "hsl(var(--success-light))",
            bg: "hsl(var(--success-surface))",
          },
          {
            label: "Liabilities",
            value: formatCurrency(totalLiabilities, true),
            color: "hsl(var(--danger-light))",
            bg: "hsl(var(--danger-surface))",
          },
          {
            label: "Monthly Income",
            value: formatCurrency(snap.monthly_income, true),
            color: "hsl(var(--gold-light))",
            bg: "hsl(var(--gold-surface))",
          },
          {
            label: "Monthly Expenses",
            value: formatCurrency(snap.monthly_expenses, true),
            color: "hsl(var(--muted-foreground))",
            bg: "hsl(var(--muted))",
          },
          {
            label: "Super (Total)",
            value: formatCurrency(currentTotalSuper, true),
            color: "hsl(var(--intelligence-light))",
            bg: "hsl(var(--intelligence-surface))",
          },
          {
            label: "Passive Income",
            value: formatCurrency(passiveIncome, true) + "/yr",
            color: "hsl(var(--forecast-light))",
            bg: "hsl(var(--forecast-surface))",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg px-3 py-2.5 flex flex-col gap-0.5"
            style={{ background: kpi.bg, border: "1px solid hsl(var(--border))" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </p>
            <p
              className="text-sm font-bold num-display"
              style={{ color: kpi.color }}
            >
              {maskValue(kpi.value, privacyMode)}
            </p>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TWO-COLUMN MAIN AREA
          Left: Charts + Financials  |  Right: AI + Widgets
          ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ── LEFT: 2/3 width ─────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-5">

          {/* ── WEALTH PROJECTION CHART ── */}
          <CollapsibleSection
            title="Wealth Projection"
            subtitle={`Net worth from ${new Date().getFullYear()} → ${new Date().getFullYear() + 10}`}
            accentColor="hsl(var(--forecast-light))"
            defaultOpen
          >
            <div className="p-4 pt-2">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={nwGrowthData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(260,60%,58%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(260,60%,58%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(145,55%,42%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="assets"      name="Total Assets"      stroke="hsl(145,55%,42%)"  strokeWidth={1.5} fill="url(#assetsGrad)" />
                  <Area type="monotone" dataKey="liabilities" name="Liabilities"        stroke="hsl(5,70%,52%)"    strokeWidth={1.5} fill="none" strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="netWorth"    name="Net Worth"          stroke="hsl(260,60%,62%)"  strokeWidth={2.5} fill="url(#nwGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CollapsibleSection>

          {/* ── CASHFLOW CHART ── */}
          <CollapsibleSection
            title="Cashflow Forecast"
            subtitle={cashFlowView === "annual" ? "Annual view" : "Monthly view"}
            accentColor="hsl(var(--intelligence-light))"
            defaultOpen
          >
            <div className="p-4 pt-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={masterCFData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1_000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={44} />
                  <Tooltip content={<CashflowTooltip />} />
                  <Bar dataKey="income"   name="Income"   fill="hsl(145,55%,42%)" radius={[3,3,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(5,70%,52%)"   radius={[3,3,0,0]} opacity={0.8} />
                  <Bar dataKey="netCF"    name="Net CF"   fill="hsl(210,75%,52%)" radius={[3,3,0,0]} />
                  {settlementAnnotations.map((ann) => (
                    <ReferenceLine key={ann.label} x={ann.label} stroke="hsl(42,80%,52%)" strokeDasharray="4 2" label={{ value: ann.name.substring(0, 8), position: "top", fontSize: 9, fill: "hsl(42,80%,52%)" }} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              {ngSummary.totalAnnualTaxBenefit > 0 && (
                <div className="mt-2 px-3 py-1.5 rounded-lg bg-gold-surface border border-gold/20 text-xs text-gold">
                  Negative gearing benefit: {formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}/yr included
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* ── SNAPSHOT EDIT + ASSET ALLOCATION ── */}
          <CollapsibleSection
            title="Financial Snapshot"
            subtitle="Current balance sheet"
            accentColor="hsl(var(--gold-light))"
            defaultOpen={false}
            headerExtra={
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditSnap(!editSnap); if (!editSnap && !snapDraft) setSnapDraft({ ...snap }); }}
                className="h-7 text-xs px-2.5"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                data-testid="button-edit-snapshot"
              >
                {editSnap ? "Cancel" : "Edit"}
              </Button>
            }
          >
            <div className="p-4" ref={snapContainerRef}>
              {!editSnap ? (
                /* READ MODE — clean 2-column grid */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: "PPOR",          value: snap.ppor,             group: "asset" },
                    { label: "Cash",           value: snap.cash,             group: "asset" },
                    { label: "Offset",         value: snap.offset_balance,   group: "asset" },
                    { label: "Super",          value: currentTotalSuper,     group: "asset" },
                    { label: "Stocks",         value: liveStocks,            group: "asset" },
                    { label: "Crypto",         value: liveCrypto,            group: "asset" },
                    { label: "Cars",           value: snap.cars,             group: "asset" },
                    { label: "Iran Property",  value: snap.iran_property,    group: "asset" },
                    { label: "Mortgage",       value: snap.mortgage,         group: "liability" },
                    { label: "Other Debts",    value: snap.other_debts,      group: "liability" },
                  ].filter(f => f.value > 0).map((f) => (
                    <div key={f.label} className="rounded-lg p-2.5"
                      style={{
                        background: f.group === "liability"
                          ? "hsl(var(--danger-surface))"
                          : "hsl(var(--secondary))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    >
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{f.label}</p>
                      <p className={`text-sm font-bold num-display mt-0.5 ${f.group === "liability" ? "text-danger-l" : "text-foreground"}`}>
                        {maskValue(formatCurrency(f.value, true), privacyMode)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                /* EDIT MODE */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {snapFields.map(({ label, key }) => (
                    <div key={key}>
                      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                      <Input
                        type="number"
                        value={snapDraft?.[key] ?? ""}
                        onChange={(e) =>
                          setSnapDraft((prev: any) => ({ ...prev, [key]: Number(e.target.value) }))
                        }
                        className="h-8 text-sm num-display"
                        data-testid={`input-snap-${key}`}
                      />
                    </div>
                  ))}
                  <div className="col-span-full flex gap-2 pt-1">
                    <SaveButton
                      onSave={handleSaveSnap}
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setEditSnap(false); setSnapDraft(null); }}
                      className="h-8 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* ── EXPENSE BREAKDOWN ── */}
          {expensePieData.length > 0 && (
            <CollapsibleSection
              title="Expense Breakdown"
              subtitle="Actual tracked expenses by category"
              accentColor="hsl(var(--danger-light))"
              defaultOpen={false}
            >
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={expensePieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {expensePieData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {expensePieData.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-medium num-display">{formatCurrency(d.value, true)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* ── LIQUIDITY WARNINGS ── */}
          {liquidityWarnings.length > 0 && (
            <CollapsibleSection
              title="Liquidity Warnings"
              subtitle={`${liquidityWarnings.length} cashflow risk${liquidityWarnings.length > 1 ? "s" : ""} detected`}
              accentColor="hsl(var(--danger-light))"
              defaultOpen
            >
              <div className="p-4 space-y-2">
                {liquidityWarnings.slice(0, 5).map((w, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg p-2.5"
                    style={{
                      background: w.level === "critical"
                        ? "hsl(var(--danger-surface))"
                        : "hsl(var(--gold-surface))",
                      border: `1px solid ${w.level === "critical" ? "hsl(var(--danger) / 0.3)" : "hsl(var(--gold-dim) / 0.3)"}`,
                    }}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: w.level === "critical" ? "hsl(var(--danger-light))" : "hsl(var(--gold))" }}
                    />
                    <p className="text-xs text-foreground">{w.message}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>

        {/* ── RIGHT: 1/3 width — widgets ─────────────────────── */}
        <div className="space-y-4">

          {/* AI Insights */}
          <AIInsightsCard />

          {/* CFO Weekly Bulletin */}
          <CFODashboardWidget />

          {/* Tax Alpha */}
          <TaxAlphaCard />

          {/* FIRE Path */}
          <FIREPathCard />

          {/* Risk Radar */}
          <RiskRadarCard />

          {/* Portfolio Live Returns */}
          <PortfolioLiveReturn />

          {/* ── WEALTH STRATEGY CARDS ── */}
          <div
            className="rounded-xl p-4"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          >
            <p className="section-label">Health Indicators</p>
            <div className="space-y-2">
              {wealthCards.map((card) => (
                <div
                  key={card.label}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{
                    background: card.alert
                      ? "hsl(var(--danger-surface))"
                      : "hsl(var(--secondary))",
                    border: `1px solid ${card.alert ? "hsl(var(--danger) / 0.2)" : "hsl(var(--border))"}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <card.Icon
                      className="w-3.5 h-3.5 shrink-0"
                      style={{
                        color: card.alert
                          ? "hsl(var(--danger-light))"
                          : "hsl(var(--muted-foreground))",
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{card.label}</span>
                  </div>
                  <span
                    className="text-xs font-bold num-display"
                    style={{
                      color: card.alert
                        ? "hsl(var(--danger-light))"
                        : "hsl(var(--foreground))",
                    }}
                  >
                    {maskValue(card.value, privacyMode)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── BILLS OVERVIEW ── */}
          <div
            className="rounded-xl p-4"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="section-label mb-0">Bills Tracker</p>
              <Link href="/recurring-bills">
                <span className="text-[11px] text-gold hover:underline cursor-pointer">View all</span>
              </Link>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Monthly fixed costs</span>
                <span className="font-bold num-display text-foreground">
                  {maskValue(formatCurrency(billMonthlyTotal, true), privacyMode)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Due in 30 days</span>
                <span className={`font-bold ${billsDueCount > 0 ? "text-gold" : "text-success-l"}`}>
                  {billsDueCount} bill{billsDueCount !== 1 ? "s" : ""}
                </span>
              </div>
              {nextBill && (
                <div className="mt-2 rounded-lg px-2.5 py-2 bg-gold-surface border border-gold/20">
                  <p className="text-[11px] text-gold font-medium">{nextBillLabel}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(safeNum(nextBill.amount), true)}</p>
                </div>
              )}
              {categoriesOverBudget > 0 && (
                <div className="mt-1.5 rounded-lg px-2.5 py-1.5 bg-danger-surface border border-danger/20">
                  <p className="text-[11px] text-danger-l">
                    {categoriesOverBudget} budget categor{categoriesOverBudget > 1 ? "ies" : "y"} over limit
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── CASH ENGINE KPIs ── */}
          {cashKPIs.length > 0 && (
            <div
              className="rounded-xl p-4"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              <p className="section-label">Cash Engine</p>
              <div className="space-y-1.5">
                {cashKPIs.slice(0, 4).map((kpi: any) => (
                  <div key={kpi.label} className="flex justify-between text-xs items-center">
                    <span className="text-muted-foreground">{kpi.label}</span>
                    <span
                      className="font-bold num-display"
                      style={{ color: kpi.delta >= 0 ? "hsl(var(--success-light))" : "hsl(var(--danger-light))" }}
                    >
                      {maskValue(formatCurrency(kpi.value, true), privacyMode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SYNC STATUS ── */}
          <div
            className="rounded-xl p-4"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {lastSync ? `Synced ${lastSync}` : "Not synced yet"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncFromCloud}
                disabled={syncing}
                className="h-7 text-xs px-2.5"
                data-testid="button-sync"
              >
                <RefreshCw className={`w-3 h-3 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync"}
              </Button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  subtitle,
  accentColor,
  defaultOpen = true,
  children,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-section">
      <div
        className="collapsible-header"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold leading-none"
            style={{ color: open && accentColor ? accentColor : undefined }}
          >
            {title}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <ChevronDown
            className="w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </div>
      </div>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
}
