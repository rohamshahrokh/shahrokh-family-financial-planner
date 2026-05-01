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
  TrendingDown,
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
  Zap,
  Maximize2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
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
  return (
    <div className="dashboard-root">

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — COMMAND STRIP
          One-line executive intelligence bar, always visible at top
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="cmd-strip">
        <div className="cmd-strip-inner">
          {/* Left: greeting + status */}
          <div className="cmd-left">
            <span className="cmd-name">{currentUser === "Fara" ? "Fara" : "Roham"}</span>
            <span className="cmd-dot" />
            <span className={`cmd-status ${savingsRate >= 20 ? "on-track" : surplus > 0 ? "watch" : "alert"}`}>
              {savingsRate >= 20 ? "On Track" : surplus > 0 ? "Watch" : "Needs Attention"}
            </span>
          </div>

          {/* Center: 4 key KPIs */}
          <div className="cmd-kpis">
            <div className="cmd-kpi">
              <span className="cmd-kpi-label">Net Worth</span>
              <span className="cmd-kpi-value">{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
            </div>
            <div className="cmd-kpi-divider" />
            <div className="cmd-kpi">
              <span className="cmd-kpi-label">2035 Projection</span>
              <span className="cmd-kpi-value forecast">{maskValue(formatCurrency(year10NW, true), privacyMode)}</span>
            </div>
            <div className="cmd-kpi-divider" />
            <div className="cmd-kpi">
              <span className="cmd-kpi-label">Monthly Surplus</span>
              <span className={`cmd-kpi-value ${surplus >= 0 ? "positive" : "negative"}`}>
                {maskValue(formatCurrency(surplus, true), privacyMode)}
              </span>
            </div>
            <div className="cmd-kpi-divider" />
            <div className="cmd-kpi">
              <span className="cmd-kpi-label">FIRE Age</span>
              <span className="cmd-kpi-value forecast">
                {wealthCards.find(c => c.label === "FIRE Age")?.value ?? "—"}
              </span>
            </div>
          </div>

          {/* Right: forecast mode + sync */}
          <div className="cmd-right">
            <span className={`cmd-mode-badge ${forecastMode === "monte-carlo" ? "mc" : forecastMode === "year-by-year" ? "yby" : "profile"}`}>
              {forecastMode === "monte-carlo" ? "Monte Carlo" :
               forecastMode === "year-by-year" ? "Year-by-Year" :
               `${profile.charAt(0).toUpperCase() + profile.slice(1)}`}
            </span>
            <button
              className="cmd-sync-btn"
              onClick={handleSyncFromCloud}
              disabled={syncing}
              data-testid="button-sync"
              title="Sync from cloud"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — FOUR CORE CARDS
          Today / Plan / Future / Action — equal width, premium balance
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="core-grid">

        {/* ─── 1 · TODAY — executive snapshot ─────────────────────────────── */}
        <div className="core-card core-today">
          <div className="core-card-header">
            <span className="core-step-num today-num">1</span>
            <span className="core-step-label">Today</span>
            {surplus >= 0
              ? <ArrowUpRight className="cc-trend-icon positive" />
              : <ArrowDownRight className="cc-trend-icon negative" />}
          </div>

          {/* Primary KPI */}
          <div className="cc-primary-row">
            <div>
              <div className="cc-big-num">{maskValue(formatCurrency(netWorth, true), privacyMode)}</div>
              <div className="cc-big-label">Net Worth</div>
            </div>
            <div className={`cc-delta-badge ${surplus >= 0 ? "up" : "down"}`}>
              {surplus >= 0 ? "+" : ""}{maskValue(formatCurrency(surplus, true), privacyMode)}/mo
            </div>
          </div>

          {/* Data rows */}
          <div className="cc-rows">
            <div className="cc-row">
              <span className="cc-row-label">Cash + Offset</span>
              <span className="cc-row-val positive">{maskValue(formatCurrency(snap.cash + snap.offset_balance, true), privacyMode)}</span>
            </div>
            <div className="cc-row">
              <span className="cc-row-label">Total Debt</span>
              <span className="cc-row-val negative">{maskValue(formatCurrency(totalLiabilities, true), privacyMode)}</span>
            </div>
            <div className="cc-row">
              <span className="cc-row-label">Monthly Surplus</span>
              <span className={`cc-row-val ${surplus >= 0 ? "positive" : "negative"}`}>
                {maskValue(formatCurrency(surplus, true), privacyMode)}
              </span>
            </div>
            <div className="cc-row">
              <span className="cc-row-label">Assets</span>
              <span className="cc-row-val">{maskValue(formatCurrency(totalAssets, true), privacyMode)}</span>
            </div>
          </div>

          {/* Savings rate bar */}
          <div className="cc-bar-section">
            <div className="cc-bar-header">
              <span className="cc-bar-label">Savings Rate</span>
              <span className={`cc-bar-pct ${savingsRate >= 20 ? "positive" : "gold"}`}>{savingsRate.toFixed(0)}%</span>
            </div>
            <div className="cc-bar-track">
              <div className="cc-bar-fill" style={{ width: `${Math.min(100, savingsRate)}%`, background: savingsRate >= 20 ? "hsl(145,55%,42%)" : "hsl(42,80%,52%)" }} />
              <div className="cc-bar-target" style={{ left: "20%" }} title="20% target" />
            </div>
          </div>
        </div>

        {/* ─── 2 · PLAN — mission & milestones ────────────────────────────── */}
        <div className="core-card core-plan">
          <div className="core-card-header">
            <span className="core-step-num plan-num">2</span>
            <span className="core-step-label">Plan</span>
          </div>

          {/* Mission */}
          <div className="cc-mission">
            {snap.cash + snap.offset_balance > 150000
              ? "Build deposit for next IP"
              : surplus > 3000
                ? "Maximise DCA & super"
                : "Cut expenses first"}
          </div>

          {/* Deposit progress ring + pct */}
          {(() => {
            const ipPct = parseInt(wealthCards.find(c => c.label === "IP Readiness")?.value ?? "0");
            const targetIP = 750000;
            const depositNeeded = targetIP * 0.235;
            const monthsLeft = surplus > 0
              ? Math.ceil(Math.max(0, depositNeeded - (snap.cash + snap.offset_balance) * 0.7) / surplus)
              : 99;
            const goalYear = new Date().getFullYear() + Math.ceil(monthsLeft / 12);
            return (
              <div className="cc-plan-body">
                <div className="cc-ring-wrap">
                  <svg viewBox="0 0 44 44" className="cc-ring">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--border))" strokeWidth="4"/>
                    <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(42,80%,52%)" strokeWidth="4"
                      strokeDasharray={`${Math.min(100, ipPct) * 1.131} 113.1`}
                      strokeLinecap="round"
                      transform="rotate(-90 22 22)"
                    />
                    <text x="22" y="26" textAnchor="middle" fontSize="9" fontWeight="700" fill="hsl(42,85%,65%)">{ipPct}%</text>
                  </svg>
                  <span className="cc-ring-label">IP Deposit</span>
                </div>
                <div className="cc-plan-rows">
                  <div className="cc-row">
                    <span className="cc-row-label">Months to goal</span>
                    <span className="cc-row-val gold">{monthsLeft >= 99 ? "—" : `${monthsLeft}mo`}</span>
                  </div>
                  <div className="cc-row">
                    <span className="cc-row-label">Goal year</span>
                    <span className="cc-row-val gold">{monthsLeft >= 99 ? "—" : goalYear}</span>
                  </div>
                  <div className="cc-row">
                    <span className="cc-row-label">Monthly contrib.</span>
                    <span className="cc-row-val">{maskValue(formatCurrency(Math.max(0, surplus), true), privacyMode)}</span>
                  </div>
                  <div className="cc-row">
                    <span className="cc-row-label">Emergency fund</span>
                    <span className={`cc-row-val ${wealthCards.find(c => c.label === "Emergency")?.alert ? "negative" : "positive"}`}>
                      {wealthCards.find(c => c.label === "Emergency")?.sub ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ─── 3 · FUTURE — projections ───────────────────────────────────── */}
        <div className="core-card core-future">
          <div className="core-card-header">
            <span className="core-step-num future-num">3</span>
            <span className="core-step-label">Future</span>
          </div>

          {/* Primary: 2035 projection */}
          <div className="cc-primary-row">
            <div>
              <div className="cc-big-num forecast">{maskValue(formatCurrency(year10NW, true), privacyMode)}</div>
              <div className="cc-big-label">2035 Net Worth</div>
            </div>
            {(() => {
              const pct = netWorth > 0 ? Math.round(((year10NW - netWorth) / netWorth) * 100) : 0;
              return <div className="cc-delta-badge up forecast-badge">+{pct}%</div>;
            })()}
          </div>

          <div className="cc-rows">
            <div className="cc-row">
              <span className="cc-row-label">2030 NW</span>
              <span className="cc-row-val forecast">{maskValue(formatCurrency(projection[4]?.endNetWorth ?? netWorth, true), privacyMode)}</span>
            </div>
            <div className="cc-row">
              <span className="cc-row-label">FIRE Age</span>
              <span className="cc-row-val forecast">{wealthCards.find(c => c.label === "FIRE Age")?.value ?? "—"}</span>
            </div>
            <div className="cc-row">
              <span className="cc-row-label">Super @60</span>
              <span className="cc-row-val forecast">{maskValue(formatCurrency(superAt60, true), privacyMode)}</span>
            </div>
          </div>

          {/* Confidence / scenario strip */}
          <div className="cc-scenario-strip">
            {forecastMode === "monte-carlo" && monteCarloResult ? (
              <>
                <div className="cc-scenario worst">
                  <span className="cc-scenario-label">Worst</span>
                  <span className="cc-scenario-val">{maskValue(formatCurrency(monteCarloResult.p10, true), privacyMode)}</span>
                </div>
                <div className="cc-scenario base">
                  <span className="cc-scenario-label">Base</span>
                  <span className="cc-scenario-val">{maskValue(formatCurrency(monteCarloResult.median, true), privacyMode)}</span>
                </div>
                <div className="cc-scenario best">
                  <span className="cc-scenario-label">Best</span>
                  <span className="cc-scenario-val">{maskValue(formatCurrency(monteCarloResult.p90, true), privacyMode)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="cc-scenario worst">
                  <span className="cc-scenario-label">Conservative</span>
                  <span className="cc-scenario-val">{maskValue(formatCurrency(Math.round(year10NW * 0.72), true), privacyMode)}</span>
                </div>
                <div className="cc-scenario base">
                  <span className="cc-scenario-label">Base</span>
                  <span className="cc-scenario-val forecast">{maskValue(formatCurrency(year10NW, true), privacyMode)}</span>
                </div>
                <div className="cc-scenario best">
                  <span className="cc-scenario-label">Upside</span>
                  <span className="cc-scenario-val positive">{maskValue(formatCurrency(Math.round(year10NW * 1.28), true), privacyMode)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── 4 · ACTION — best move summary ─────────────────────────────── */}
        <div className="core-card core-action">
          <div className="core-card-header">
            <span className="core-step-num action-num">4</span>
            <span className="core-step-label">Best Move</span>
          </div>
          <div className="core-action-body">
            <BestMoveCard />
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — MAIN TWO-COLUMN GRID
          Left 65%: Forecast Intelligence  |  Right 35%: Decision Center
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="main-grid">

        {/* ── LEFT COLUMN — Forecast Intelligence ──────────────────────────── */}
        <div className="main-left">

          {/* A — Net Worth Projection */}
          <div className="chart-panel chart-panel-expandable">
            <div className="chart-panel-header">
              <div>
                <h3 className="chart-panel-title">Wealth Projection</h3>
                <p className="chart-panel-sub">Net worth trajectory 2026 → 2036</p>
              </div>
              <div className="chart-panel-actions">
                <div className="chart-legend">
                  <span className="legend-dot" style={{ background: "hsl(260,60%,62%)" }} />
                  <span className="legend-label">Net Worth</span>
                  <span className="legend-dot" style={{ background: "hsl(145,55%,42%)", opacity: 0.7 }} />
                  <span className="legend-label">Assets</span>
                  <span className="legend-dot" style={{ background: "hsl(5,70%,52%)", opacity: 0.7 }} />
                  <span className="legend-label">Debt</span>
                </div>
                <Link href="/reports">
                  <button className="chart-expand-btn" title="Open full Wealth Projection">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={nwGrowthData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(260,60%,62%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(260,60%,62%)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="assFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(145,55%,42%)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.35} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={48} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="assets"      name="Total Assets" stroke="hsl(145,55%,42%)"  strokeWidth={1.5} fill="url(#assFill)" />
                <Area type="monotone" dataKey="liabilities" name="Debt"          stroke="hsl(5,70%,52%)"   strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
                <Area type="monotone" dataKey="netWorth"    name="Net Worth"     stroke="hsl(260,60%,65%)" strokeWidth={2.5} fill="url(#nwFill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* B — Cashflow Intelligence (premium multi-line area) */}
          <div className="chart-panel chart-panel-expandable">
            <div className="chart-panel-header">
              <div>
                <h3 className="chart-panel-title">Cashflow Intelligence</h3>
                <p className="chart-panel-sub">
                  {cashFlowView === "annual" ? "Annual income, expenses & balance" : "Monthly cashflow breakdown"}
                </p>
              </div>
              <div className="chart-panel-actions">
                {ngSummary.totalAnnualTaxBenefit > 0 && (
                  <span className="ng-badge">
                    NG {maskValue(formatCurrency(ngSummary.totalAnnualTaxBenefit, true), privacyMode)}/yr
                  </span>
                )}
                <Link href="/reports">
                  <button className="chart-expand-btn" title="Open full Cashflow Intelligence">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </div>
            </div>

            {/* Chart overlay legend */}
            <div className="cf-legend">
              {[
                { color: "hsl(145,55%,42%)",  label: "Income" },
                { color: "hsl(5,65%,52%)",    label: "Expenses" },
                { color: "hsl(210,70%,55%)",  label: "Net CF" },
                { color: "hsl(260,60%,62%)",  label: "Balance" },
              ].map(({ color, label }) => (
                <span key={label} className="cf-legend-item">
                  <span className="cf-legend-dot" style={{ background: color }} />
                  <span className="cf-legend-label">{label}</span>
                </span>
              ))}
              {settlementAnnotations.length > 0 && (
                <span className="cf-legend-item">
                  <span className="cf-legend-dot" style={{ background: "hsl(42,80%,52%)", borderRadius: 0 }} />
                  <span className="cf-legend-label">IP Settlement</span>
                </span>
              )}
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={masterCFData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cfIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(145,55%,42%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="cfExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(5,65%,52%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(5,65%,52%)" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="cfBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(260,60%,62%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(260,60%,62%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `$${(v/1_000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={42} axisLine={false} tickLine={false} />
                <Tooltip content={<CashflowTooltip />} />
                <Area type="monotone" dataKey="income"   name="Income"       stroke="hsl(145,55%,42%)" strokeWidth={2}   fill="url(#cfIncome)"   dot={false} />
                <Area type="monotone" dataKey="expenses" name="Expenses"     stroke="hsl(5,65%,52%)"  strokeWidth={1.5} fill="url(#cfExpenses)" dot={false} />
                <Area type="monotone" dataKey="netCF"    name="Net CF"       stroke="hsl(210,70%,55%)" strokeWidth={2}   fill="none" strokeDasharray="5 3" dot={false} />
                <Area type="monotone" dataKey="balance"  name="Cash Balance" stroke="hsl(260,60%,62%)" strokeWidth={1.5} fill="url(#cfBalance)"  dot={false} />
                {settlementAnnotations.map((ann) => (
                  <ReferenceLine key={ann.label} x={ann.label} stroke="hsl(42,80%,52%)" strokeDasharray="3 3" strokeWidth={1.5}
                    label={{ value: "↓ IP", position: "top", fontSize: 9, fill: "hsl(42,85%,65%)" }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* C — Asset Allocation + Snapshot inline */}
          <div className="twin-panel">

            {/* Asset Pie */}
            <div className="chart-panel twin-child">
              <div className="chart-panel-header">
                <h3 className="chart-panel-title">Asset Allocation</h3>
              </div>
              <div className="asset-alloc-body">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={assetData} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={2}>
                      {assetData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => maskValue(formatCurrency(v, true), privacyMode)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="alloc-legend">
                  {assetData.slice(0, 6).map((d: any, i: number) => (
                    <div key={d.name} className="alloc-item">
                      <span className="alloc-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="alloc-name">{d.name}</span>
                      <span className="alloc-val">{maskValue(formatCurrency(d.value, true), privacyMode)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Balance Sheet */}
            <div className="chart-panel twin-child">
              <div className="chart-panel-header">
                <h3 className="chart-panel-title">Balance Sheet</h3>
                <button
                  className="panel-edit-btn"
                  onClick={() => { setEditSnap(!editSnap); if (!editSnap && !snapDraft) setSnapDraft({ ...snap }); }}
                  data-testid="button-edit-snapshot"
                >
                  {editSnap ? "Cancel" : "Edit"}
                </button>
              </div>
              {!editSnap ? (
                <div className="bs-grid" ref={snapContainerRef}>
                  <div className="bs-section">
                    <div className="bs-section-label">Assets</div>
                    {[
                      { l: "PPOR",          v: snap.ppor },
                      { l: "Cash + Offset", v: snap.cash + snap.offset_balance },
                      { l: "Super",         v: currentTotalSuper },
                      { l: "Stocks",        v: liveStocks },
                      { l: "Crypto",        v: liveCrypto },
                      { l: "Cars / Other",  v: snap.cars + snap.iran_property },
                    ].filter(f => f.v > 0).map(f => (
                      <div key={f.l} className="bs-row">
                        <span className="bs-label">{f.l}</span>
                        <span className="bs-value">{maskValue(formatCurrency(f.v, true), privacyMode)}</span>
                      </div>
                    ))}
                    <div className="bs-total">
                      <span>Total Assets</span>
                      <span className="positive">{maskValue(formatCurrency(totalAssets, true), privacyMode)}</span>
                    </div>
                  </div>
                  <div className="bs-section">
                    <div className="bs-section-label">Liabilities</div>
                    {[
                      { l: "Mortgage",     v: snap.mortgage },
                      { l: "Other Debts",  v: snap.other_debts },
                    ].filter(f => f.v > 0).map(f => (
                      <div key={f.l} className="bs-row">
                        <span className="bs-label">{f.l}</span>
                        <span className="bs-value negative">{maskValue(formatCurrency(f.v, true), privacyMode)}</span>
                      </div>
                    ))}
                    <div className="bs-total">
                      <span>Net Worth</span>
                      <span className="forecast">{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="snap-edit-grid" ref={snapContainerRef}>
                  {snapFields.map(({ label, key }) => (
                    <div key={key} className="snap-field">
                      <label className="snap-field-label">{label}</label>
                      <Input
                        type="number"
                        value={snapDraft?.[key] ?? ""}
                        onChange={(e) => setSnapDraft((prev: any) => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="h-7 text-xs num-display"
                        data-testid={`input-snap-${key}`}
                      />
                    </div>
                  ))}
                  <div className="snap-edit-actions">
                    <SaveButton onSave={handleSaveSnap} className="h-7 text-xs" />
                    <Button variant="outline" size="sm" onClick={() => { setEditSnap(false); setSnapDraft(null); }} className="h-7 text-xs">Cancel</Button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 4 — ACTION CENTER
              ═══════════════════════════════════════════════════════════════ */}
          <div className="action-center">
            <div className="action-center-header">
              <div>
                <h2 className="action-center-title">Action Center</h2>
                <p className="action-center-sub">Your prioritised financial moves, ranked by impact</p>
              </div>
              <span className="action-priority-badge">
                AI Priority Score: {savingsRate >= 25 && surplus > 3000 ? "A+" : savingsRate >= 15 ? "B+" : "C — needs review"}
              </span>
            </div>

            <div className="action-grid">

              {/* Column 1: Immediate (7 days) */}
              <div className="action-col">
                <div className="action-col-header immediate">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Immediate — 7 Days</span>
                </div>
                <div className="action-items">
                  {snap.offset_balance < snap.cash * 0.5 && snap.cash > 50000 && (
                    <div className="action-item high">
                      <div className="action-item-dot high" />
                      <div className="action-item-content">
                        <span className="action-item-title">Move cash to offset account</span>
                        <span className="action-item-desc">
                          {maskValue(formatCurrency(Math.round(snap.cash * 0.4), true), privacyMode)} could save ~{maskValue(formatCurrency(Math.round(snap.cash * 0.4 * 0.06 / 12), true), privacyMode)}/mo in interest
                        </span>
                      </div>
                      <Link href="/expenses"><span className="action-cta">Act</span></Link>
                    </div>
                  )}
                  {savingsRate < 20 && (
                    <div className="action-item high">
                      <div className="action-item-dot high" />
                      <div className="action-item-content">
                        <span className="action-item-title">Review discretionary spending</span>
                        <span className="action-item-desc">
                          Savings rate {savingsRate.toFixed(0)}% — target 20%+. Cut ~{maskValue(formatCurrency(Math.max(0, snap.monthly_income * 0.2 - surplus), true), privacyMode)}/mo
                        </span>
                      </div>
                      <Link href="/expenses"><span className="action-cta">Act</span></Link>
                    </div>
                  )}
                  {liquidityWarnings.length > 0 && (
                    <div className="action-item critical">
                      <div className="action-item-dot critical" />
                      <div className="action-item-content">
                        <span className="action-item-title">Cashflow risk detected</span>
                        <span className="action-item-desc">{liquidityWarnings[0].message.substring(0, 80)}</span>
                      </div>
                      <Link href="/reports"><span className="action-cta">Review</span></Link>
                    </div>
                  )}
                  {billsDueCount > 0 && (
                    <div className="action-item medium">
                      <div className="action-item-dot medium" />
                      <div className="action-item-content">
                        <span className="action-item-title">{billsDueCount} bill{billsDueCount > 1 ? "s" : ""} due this month</span>
                        <span className="action-item-desc">{nextBillLabel} · {maskValue(formatCurrency(safeNum(nextBill?.amount), true), privacyMode)}</span>
                      </div>
                      <Link href="/recurring-bills"><span className="action-cta">View</span></Link>
                    </div>
                  )}
                  {savingsRate >= 20 && liquidityWarnings.length === 0 && (
                    <div className="action-item positive">
                      <div className="action-item-dot positive" />
                      <div className="action-item-content">
                        <span className="action-item-title">Cashflow is healthy</span>
                        <span className="action-item-desc">No immediate actions required. Surplus {maskValue(formatCurrency(surplus, true), privacyMode)}/mo</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: This Month */}
              <div className="action-col">
                <div className="action-col-header thismonth">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>This Month</span>
                </div>
                <div className="action-items">
                  <div className="action-item medium">
                    <div className="action-item-dot medium" />
                    <div className="action-item-content">
                      <span className="action-item-title">Save & invest surplus</span>
                      <span className="action-item-desc">
                        Deploy {maskValue(formatCurrency(Math.max(0, surplus), true), privacyMode)} — split between offset + ETF DCA
                      </span>
                    </div>
                    <Link href="/stocks"><span className="action-cta">Plan</span></Link>
                  </div>
                  {categoriesOverBudget > 0 && (
                    <div className="action-item medium">
                      <div className="action-item-dot medium" />
                      <div className="action-item-content">
                        <span className="action-item-title">{categoriesOverBudget} budget categor{categoriesOverBudget > 1 ? "ies" : "y"} over limit</span>
                        <span className="action-item-desc">Review and reduce before month end</span>
                      </div>
                      <Link href="/budget"><span className="action-cta">Fix</span></Link>
                    </div>
                  )}
                  {snap.roham_salary_sacrifice === 0 && (
                    <div className="action-item medium">
                      <div className="action-item-dot medium" />
                      <div className="action-item-content">
                        <span className="action-item-title">Consider salary sacrifice to super</span>
                        <span className="action-item-desc">Tax-effective way to build retirement wealth</span>
                      </div>
                      <Link href="/tax"><span className="action-cta">Calc</span></Link>
                    </div>
                  )}
                  <div className="action-item low">
                    <div className="action-item-dot low" />
                    <div className="action-item-content">
                      <span className="action-item-title">Update income & tax records</span>
                      <span className="action-item-desc">Keep ledger current for accurate FIRE projections</span>
                    </div>
                    <Link href="/financial-plan"><span className="action-cta">Log</span></Link>
                  </div>
                </div>
              </div>

              {/* Column 3: Strategic Moves */}
              <div className="action-col">
                <div className="action-col-header strategic">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Strategic Moves</span>
                </div>
                <div className="action-items">
                  {parseInt(wealthCards.find(c => c.label === "IP Readiness")?.value ?? "0") >= 50 && (
                    <div className="action-item strategic">
                      <div className="action-item-dot strategic" />
                      <div className="action-item-content">
                        <span className="action-item-title">Investment property acquisition</span>
                        <span className="action-item-desc">
                          Deposit {wealthCards.find(c => c.label === "IP Readiness")?.value ?? "—"} ready. Negative gearing {maskValue(formatCurrency(ngSummary.totalAnnualTaxBenefit, true), privacyMode)}/yr benefit available
                        </span>
                      </div>
                      <Link href="/property"><span className="action-cta">Plan</span></Link>
                    </div>
                  )}
                  <div className="action-item strategic">
                    <div className="action-item-dot strategic" />
                    <div className="action-item-content">
                      <span className="action-item-title">Debt recycling strategy</span>
                      <span className="action-item-desc">Convert non-deductible mortgage to deductible investment debt</span>
                    </div>
                    <Link href="/debt-strategy"><span className="action-cta">Setup</span></Link>
                  </div>
                  <div className="action-item strategic">
                    <div className="action-item-dot strategic" />
                    <div className="action-item-content">
                      <span className="action-item-title">Super contribution split</span>
                      <span className="action-item-desc">Optimise Roham + Fara super split for tax efficiency</span>
                    </div>
                    <Link href="/tax"><span className="action-cta">Model</span></Link>
                  </div>
                </div>
              </div>

              {/* Column 4: Missed Opportunities */}
              <div className="action-col">
                <div className="action-col-header missed">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Missed Opportunities</span>
                </div>
                <div className="action-items">
                  {snap.cash > snap.monthly_expenses * 6 && (
                    <div className="action-item missed">
                      <div className="action-item-dot missed" />
                      <div className="action-item-content">
                        <span className="action-item-title">Idle cash above 6-month buffer</span>
                        <span className="action-item-desc">
                          ~{maskValue(formatCurrency(snap.cash - snap.monthly_expenses * 6, true), privacyMode)} idle.
                          Annual cost: ~{maskValue(formatCurrency(Math.round((snap.cash - snap.monthly_expenses * 6) * 0.055), true), privacyMode)} in opportunity cost
                        </span>
                      </div>
                      <Link href="/wealth-strategy"><span className="action-cta">Deploy</span></Link>
                    </div>
                  )}
                  {ngSummary.totalAnnualTaxBenefit > 0 && (
                    <div className="action-item missed">
                      <div className="action-item-dot missed" />
                      <div className="action-item-content">
                        <span className="action-item-title">Tax refund optimisation</span>
                        <span className="action-item-desc">
                          {maskValue(formatCurrency(ngSummary.totalAnnualTaxBenefit, true), privacyMode)}/yr negative gearing benefit — ensure PAYG withholding variation filed
                        </span>
                      </div>
                      <Link href="/tax"><span className="action-cta">File</span></Link>
                    </div>
                  )}
                  {liveStocks < 50000 && surplus > 2000 && (
                    <div className="action-item missed">
                      <div className="action-item-dot missed" />
                      <div className="action-item-content">
                        <span className="action-item-title">Low equity market exposure</span>
                        <span className="action-item-desc">
                          Portfolio under-allocated to equities. Start DCA from surplus {maskValue(formatCurrency(Math.round(surplus * 0.3), true), privacyMode)}/mo
                        </span>
                      </div>
                      <Link href="/stocks"><span className="action-cta">Start</span></Link>
                    </div>
                  )}
                  {wealthCards.find(c => c.label === "Emergency")?.alert && (
                    <div className="action-item missed">
                      <div className="action-item-dot missed" />
                      <div className="action-item-content">
                        <span className="action-item-title">Emergency fund below target</span>
                        <span className="action-item-desc">
                          Build to {maskValue(formatCurrency(snap.monthly_expenses * 6, true), privacyMode)} (6 months expenses)
                        </span>
                      </div>
                      <Link href="/budget"><span className="action-cta">Build</span></Link>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN — Decision Center (sticky) ──────────────────────── */}
        <div className="main-right">
          <div className="decision-center">

            {/* Header */}
            <div className="dc-header">
              <span className="dc-title">Decision Center</span>
              <span className="dc-sub">Live signals</span>
            </div>

            {/* Health Score Row */}
            <div className="dc-health-row">
              {[
                { label: "FIRE", value: wealthCards.find(c => c.label === "FIRE Progress")?.value ?? "—", alert: wealthCards.find(c => c.label === "FIRE Progress")?.alert },
                { label: "Safety", value: wealthCards.find(c => c.label === "Emergency")?.value?.split("/")[0] ?? "—", alert: wealthCards.find(c => c.label === "Emergency")?.alert },
                { label: "SR", value: `${savingsRate.toFixed(0)}%`, alert: savingsRate < 20 },
                { label: "Debt", value: `${Math.round(totalLiabilities / (snap.monthly_income * 12))}x`, alert: totalLiabilities / (snap.monthly_income * 12) > 5 },
              ].map(h => (
                <div key={h.label} className={`dc-health-chip ${h.alert ? "alert" : "ok"}`}>
                  <span className="dc-health-val">{h.value}</span>
                  <span className="dc-health-label">{h.label}</span>
                </div>
              ))}
            </div>

            {/* Risk Radar widget */}
            <div className="dc-widget">
              <RiskRadarCard />
            </div>

            {/* Tax Alpha widget */}
            <div className="dc-widget">
              <TaxAlphaCard />
            </div>

            {/* FIRE Path widget */}
            <div className="dc-widget">
              <FIREPathCard />
            </div>

            {/* Portfolio Returns widget */}
            <div className="dc-widget">
              <PortfolioLiveReturn />
            </div>

            {/* AI Weekly CFO */}
            <div className="dc-widget">
              <CFODashboardWidget />
            </div>

            {/* Bills compact widget */}
            <div className="dc-bills">
              <div className="dc-bills-header">
                <span className="dc-widget-title">Bills</span>
                <Link href="/recurring-bills"><span className="dc-link">All</span></Link>
              </div>
              <div className="dc-bills-row">
                <span className="dc-bills-label">Monthly fixed</span>
                <span className="dc-bills-value">{maskValue(formatCurrency(billMonthlyTotal, true), privacyMode)}</span>
              </div>
              <div className="dc-bills-row">
                <span className="dc-bills-label">Due in 30d</span>
                <span className={`dc-bills-value ${billsDueCount > 0 ? "gold" : "positive"}`}>
                  {billsDueCount} due
                </span>
              </div>
              {nextBill && (
                <div className="dc-bills-next">
                  <span className="dc-bills-next-name">{nextBillLabel}</span>
                  <span className="dc-bills-next-val">{maskValue(formatCurrency(safeNum(nextBill.amount), true), privacyMode)}</span>
                </div>
              )}
            </div>

            {/* AI Insights compact */}
            <div className="dc-widget dc-ai">
              <AIInsightsCard />
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
