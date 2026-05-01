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
  const [chartRange, setChartRange] = useState<"1Y"|"3Y"|"10Y"|"Scenario">("10Y");
  const [mainChartMode, setMainChartMode] = useState<"networth"|"cashflow">("networth");
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



  // ─── Chart range filter ──────────────────────────────────────────────────
  const filteredNWData = useMemo(() => {
    const now = new Date().getFullYear();
    if (chartRange === "1Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 1);
    if (chartRange === "3Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 3);
    return nwGrowthData;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nwGrowthData, chartRange]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const fireCard = wealthCards.find(c => c.label === "FIRE Age");
  const fireProgress = wealthCards.find(c => c.label === "FIRE Progress");
  const savingsRateCard = wealthCards.find(c => c.label === "Savings Rate");
  const emergencyCard = wealthCards.find(c => c.label === "Emergency");
  const debtCard = wealthCards.find(c => c.label === "Total Debt");
  const ipCard = wealthCards.find(c => c.label === "IP Readiness");
  const hiddenCard = wealthCards.find(c => c.label === "Hidden Money");

  // Deposit readiness % from IP card
  const depositPct = parseInt(ipCard?.value ?? "0");
  // FIRE progress %
  const firePct = parseInt(fireProgress?.value ?? "0");
  // Savings rate %
  const srPct = savingsRate;

  // Mission: derive from deposit readiness
  const missionLabel = depositPct >= 80
    ? "Prepare for IP #2 Settlement"
    : depositPct >= 50
    ? "Build deposit for next IP"
    : "Grow wealth base & cashflow";
  const missionMonths = Math.max(1, Math.round((100 - depositPct) * 1.8));
  const missionContrib = Math.round(surplus * 0.7);

  // Best move (top action from BestMove engine — derived simply)
  const offsetBalance = snap.offset_balance;
  const savingsIdleForOffset = snap.cash > snap.monthly_expenses * 6 ? snap.cash - snap.monthly_expenses * 6 : 0;
  const bestMoveTitle = offsetBalance > 0 && snap.mortgage > 0
    ? `Move $${Math.round(savingsIdleForOffset / 1000)}k to offset`
    : surplus > 4000
    ? "Increase IP deposit savings"
    : "Review expense categories";
  const bestMoveImpact = offsetBalance > 0
    ? `Save ~$${Math.round(savingsIdleForOffset * 0.065 / 1000)}k/yr interest`
    : `$${Math.round(surplus * 0.3 / 1000)}k additional savings`;
  const bestMoveUrgency = surplus < 2000 ? "High" : "Medium";
  const bestMoveHref = snap.mortgage > 0 ? "/debt-strategy" : "/wealth-strategy";

  // NW 30d trend (rough estimate: surplus/30)
  const nwTrend30d = surplus > 0 ? `+${formatCurrency(surplus, true)}/mo` : formatCurrency(surplus, true);

  // Risk score (0-100 simplified)
  const riskScore = Math.min(100, Math.max(0, Math.round(
    50 + (savingsRate - 20) * 1.5 - (snap.other_debts > 50000 ? 15 : 0) + (firePct - 20) * 0.5
  )));
  const riskLabel = riskScore >= 70 ? "Strong" : riskScore >= 50 ? "Moderate" : "Watch";

  // Top 5 smart actions (ROI-ranked)
  const smartActions = [
    offsetBalance > 0 && savingsIdleForOffset > 20000
      ? {
          rank: 1,
          title: `Offset $${Math.round(savingsIdleForOffset / 1000)}k → save $${Math.round(savingsIdleForOffset * 0.065 / 1000)}k/yr`,
          impact: `$${Math.round(savingsIdleForOffset * 0.065 / 1000)}k/yr interest saved`,
          href: "/debt-strategy",
          priority: "high" as const,
        }
      : null,
    surplus > 2000
      ? {
          rank: 2,
          title: `Extra $${Math.round(Math.min(surplus * 0.4, 2000)).toLocaleString()} mortgage → FIRE −2 yrs`,
          impact: "Reduce loan term, save interest",
          href: "/debt-strategy",
          priority: "medium" as const,
        }
      : null,
    {
      rank: 3,
      title: "Buy ETF monthly $2,000 DCA",
      impact: "Projected +$180k over 10 years",
      href: "/stocks",
      priority: "medium" as const,
    },
    emergencyCard?.alert
      ? {
          rank: 4,
          title: "Build emergency fund to 6mo",
          impact: `Currently ${emergencyCard?.sub}`,
          href: "/expenses",
          priority: "high" as const,
        }
      : {
          rank: 4,
          title: "Review recurring subscriptions",
          impact: "Potential $200–$500/mo savings",
          href: "/recurring-bills",
          priority: "low" as const,
        },
    {
      rank: 5,
      title: "Refinance mortgage rate review",
      impact: "Current rates may save $3k–$8k/yr",
      href: "/property",
      priority: "strategic" as const,
    },
  ].filter(Boolean) as Array<{ rank: number; title: string; impact: string; href: string; priority: string }>;

  // Deep modules
  const deepModules = [
    { label: "Stocks", href: "/stocks", color: "hsl(43,85%,55%)", icon: "📈" },
    { label: "Crypto", href: "/crypto", color: "hsl(260,60%,58%)", icon: "₿" },
    { label: "Property", href: "/property", color: "hsl(188,60%,48%)", icon: "🏠" },
    { label: "Tax", href: "/tax", color: "hsl(145,55%,42%)", icon: "🧾" },
    { label: "Reports", href: "/reports", color: "hsl(210,75%,52%)", icon: "📊" },
    { label: "Scenarios", href: "/wealth-strategy", color: "hsl(260,60%,58%)", icon: "🔮" },
    { label: "Bills", href: "/recurring-bills", color: "hsl(5,70%,52%)", icon: "📅" },
    { label: "Expenses", href: "/expenses", color: "hsl(188,60%,48%)", icon: "💳" },
    { label: "AI Coach", href: "/ai-insights", color: "hsl(42,80%,52%)", icon: "🤖" },
  ];

  // NW chart data — projection
  const nwChartData = projection.map((p) => ({
    year: p.year.toString(),
    netWorth: p.endNetWorth,
    assets: p.totalAssets,
    liabilities: p.totalLiabilities,
  }));

  // Chart range filter



  return (
    <div className="elite-dashboard">

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO COMMAND BAR
          Full-width intelligence strip with greeting, KPIs, controls
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="elite-hero-bar">
        {/* Left — greeting + status */}
        <div className="ehb-left">
          <div className="ehb-greeting">
            Hello, <span className="ehb-name">{currentUser === "Fara" ? "Fara" : "Roham"}</span>
          </div>
          <div className={`ehb-status ${savingsRate >= 20 ? "on-track" : surplus > 0 ? "watch" : "alert"}`}>
            {savingsRate >= 20 ? "● On Track" : surplus > 0 ? "● Watch" : "● Needs Attention"}
          </div>
        </div>

        {/* Center — 5 KPI metrics */}
        <div className="ehb-kpis">
          <div className="ehb-kpi">
            <span className="ehb-kpi-label">Net Worth</span>
            <span className="ehb-kpi-value">{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
          </div>
          <div className="ehb-kpi-sep" />
          <div className="ehb-kpi">
            <span className="ehb-kpi-label">Monthly Surplus</span>
            <span className={`ehb-kpi-value ${surplus >= 0 ? "ehb-positive" : "ehb-negative"}`}>
              {maskValue(formatCurrency(surplus, true), privacyMode)}
            </span>
          </div>
          <div className="ehb-kpi-sep" />
          <div className="ehb-kpi">
            <span className="ehb-kpi-label">2035 Projection</span>
            <span className="ehb-kpi-value ehb-forecast">{maskValue(formatCurrency(year10NW, true), privacyMode)}</span>
          </div>
          <div className="ehb-kpi-sep" />
          <div className="ehb-kpi">
            <span className="ehb-kpi-label">FIRE Age</span>
            <span className="ehb-kpi-value ehb-forecast">{fireCard?.value ?? "—"}</span>
          </div>
          <div className="ehb-kpi-sep" />
          <div className="ehb-kpi">
            <span className="ehb-kpi-label">Risk Score</span>
            <span className={`ehb-kpi-value ${riskScore >= 70 ? "ehb-positive" : riskScore >= 50 ? "ehb-gold" : "ehb-negative"}`}>
              {riskScore} <span style={{fontSize:"10px",fontWeight:500,opacity:0.7}}>{riskLabel}</span>
            </span>
          </div>
        </div>

        {/* Right — controls */}
        <div className="ehb-right">
          <span className="ehb-mode-badge">
            {forecastMode === "monte-carlo" ? "Monte Carlo" : forecastMode === "year-by-year" ? "YoY" : profile.charAt(0).toUpperCase() + profile.slice(1)}
          </span>
          <button
            className="ehb-btn"
            onClick={handleSyncFromCloud}
            title="Sync from cloud"
            disabled={syncing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
          <button className="ehb-btn" onClick={togglePrivacy} title={privacyMode ? "Show values" : "Hide values"}>
            {privacyMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — PRIMARY COMMAND CENTER
          3-column: Main Chart (60%) · Mission (20%) · Best Move (20%)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="elite-command-center">
        {/* LEFT — Main Wealth Chart */}
        <div className="ecc-chart-card">
          <div className="ecc-chart-header">
            <div>
              <div className="ecc-chart-title">
                {mainChartMode === "networth" ? "Net Worth Growth" : "Cashflow Forecast"}
              </div>
              <div className="ecc-chart-sub">
                {mainChartMode === "networth"
                  ? `From ${formatCurrency(netWorth, true)} → ${formatCurrency(year10NW, true)} projected`
                  : `Monthly surplus: ${formatCurrency(surplus, true)}`
                }
              </div>
            </div>
            <div className="ecc-chart-controls">
              {/* Chart mode toggle */}
              <div className="ecc-mode-toggle">
                <button className={`ecc-mode-btn ${mainChartMode === "networth" ? "active" : ""}`} onClick={() => setMainChartMode("networth")}>Net Worth</button>
                <button className={`ecc-mode-btn ${mainChartMode === "cashflow" ? "active" : ""}`} onClick={() => setMainChartMode("cashflow")}>Cashflow</button>
              </div>
              {/* Range filter */}
              {mainChartMode === "networth" && (
                <div className="ecc-range-toggle">
                  {(["1Y","3Y","10Y","Scenario"] as const).map(r => (
                    <button key={r} className={`ecc-range-btn ${chartRange === r ? "active" : ""}`} onClick={() => setChartRange(r)}>{r}</button>
                  ))}
                </div>
              )}
              <Link href="/reports">
                <button className="ecc-expand-btn" title="Expand"><Maximize2 className="w-3 h-3" /></button>
              </Link>
            </div>
          </div>

          {/* Chart */}
          <div style={{ height: 240, marginTop: 8 }}>
            {mainChartMode === "networth" ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredNWData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gwNW" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(210,75%,52%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gwAssets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(145,55%,42%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.6)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="assets" name="Total Assets" stroke="hsl(145,55%,42%)" strokeWidth={1.5} fill="url(#gwAssets)" dot={false} />
                  <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="hsl(210,75%,52%)" strokeWidth={2} fill="url(#gwNW)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={masterCFData.slice(0, cashFlowView === "annual" ? 10 : 24)} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cfIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(145,55%,42%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cfBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(260,60%,58%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(260,60%,58%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.6)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<CashflowTooltip />} />
                  <Area type="monotone" dataKey="income" name="Income" stroke="hsl(145,55%,42%)" strokeWidth={1.5} fill="url(#cfIncome)" dot={false} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(5,70%,52%)" strokeWidth={1.5} fill="none" dot={false} />
                  <Area type="monotone" dataKey="balance" name="Cash Balance" stroke="hsl(260,60%,58%)" strokeWidth={2} fill="url(#cfBalance)" dot={false} />
                  <ReferenceLine y={0} stroke="hsl(222 15% 25%)" strokeDasharray="2 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart footer legend */}
          <div className="ecc-chart-legend">
            {mainChartMode === "networth" ? (
              <>
                <div className="ecc-leg-item"><div className="ecc-leg-dot" style={{background:"hsl(210,75%,52%)"}} /><span>Net Worth</span></div>
                <div className="ecc-leg-item"><div className="ecc-leg-dot" style={{background:"hsl(145,55%,42%)"}} /><span>Total Assets</span></div>
              </>
            ) : (
              <>
                <div className="ecc-leg-item"><div className="ecc-leg-dot" style={{background:"hsl(145,55%,42%)"}} /><span>Income</span></div>
                <div className="ecc-leg-item"><div className="ecc-leg-dot" style={{background:"hsl(5,70%,52%)"}} /><span>Expenses</span></div>
                <div className="ecc-leg-item"><div className="ecc-leg-dot" style={{background:"hsl(260,60%,58%)"}} /><span>Cash Balance</span></div>
              </>
            )}
          </div>
        </div>

        {/* CENTER — Mission Card */}
        <div className="ecc-mission-card">
          <div className="ecc-card-eyebrow plan">2 · Plan</div>
          <div className="ecc-mission-label">Active Mission</div>
          <div className="ecc-mission-text">{missionLabel}</div>

          {/* Progress ring */}
          <div className="ecc-ring-center">
            <svg className="ecc-ring-svg" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(222 15% 18%)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke="hsl(42,80%,52%)" strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - depositPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ filter: "drop-shadow(0 0 6px hsl(42 80% 52% / 0.4))" }}
              />
              <text x="40" y="38" textAnchor="middle" fontSize="14" fontWeight="700" fill="hsl(215 20% 88%)">{depositPct}%</text>
              <text x="40" y="52" textAnchor="middle" fontSize="8" fill="hsl(215 12% 48%)">Deposit</text>
            </svg>
          </div>

          <div className="ecc-mission-stats">
            <div className="ecc-mstat">
              <span className="ecc-mstat-label">Time</span>
              <span className="ecc-mstat-value">{missionMonths}mo</span>
            </div>
            <div className="ecc-mstat">
              <span className="ecc-mstat-label">Contribution</span>
              <span className="ecc-mstat-value">{maskValue(formatCurrency(missionContrib, true), privacyMode)}/mo</span>
            </div>
            <div className="ecc-mstat">
              <span className="ecc-mstat-label">Readiness</span>
              <span className="ecc-mstat-value" style={{color: depositPct >= 70 ? "hsl(145,55%,42%)" : "hsl(42,80%,52%)"}}>
                {depositPct >= 80 ? "Ready" : depositPct >= 50 ? "Near" : "Building"}
              </span>
            </div>
          </div>

          <Link href="/financial-plan">
            <button className="ecc-mission-cta">View Plan →</button>
          </Link>
        </div>

        {/* RIGHT — Best Move Card */}
        <div className="ecc-bestmove-card">
          <div className="ecc-card-eyebrow action">4 · Action</div>
          <div className="ecc-bm-label">Best Move Now</div>

          <div className="ecc-bm-move">
            <Zap className="ecc-bm-zap" />
            <span className="ecc-bm-title">{bestMoveTitle}</span>
          </div>

          <div className="ecc-bm-impact">
            <span className="ecc-bm-impact-label">Impact</span>
            <span className="ecc-bm-impact-value" style={{color:"hsl(145,55%,42%)"}}>
              {maskValue(bestMoveImpact, privacyMode)}
            </span>
          </div>

          <div className="ecc-bm-meta">
            <div className="ecc-bm-meta-item">
              <span className="ecc-bm-meta-label">Urgency</span>
              <span className={`ecc-bm-meta-val ${bestMoveUrgency === "High" ? "ecc-bm-high" : "ecc-bm-med"}`}>{bestMoveUrgency}</span>
            </div>
            <div className="ecc-bm-meta-item">
              <span className="ecc-bm-meta-label">Difficulty</span>
              <span className="ecc-bm-meta-val" style={{color:"hsl(215 12% 48%)"}}>Easy</span>
            </div>
          </div>

          <BestMoveCard />

          <Link href={bestMoveHref}>
            <button className="ecc-bm-cta">Take Action →</button>
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — INSIGHT GRID
          6 compact premium insight cards
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="elite-section-wrap">
        <div className="elite-section-header">
          <span className="elite-section-label">Wealth Intelligence</span>
          <Link href="/data-health"><span className="elite-section-link">Data Health →</span></Link>
        </div>
        <div className="elite-insight-grid">
          {/* 1. Cash Position */}
          <div className="eig-card">
            <div className="eig-header">
              <DollarSign className="eig-icon" style={{color:"hsl(210,75%,52%)"}} />
              <span className="eig-title">Cash Position</span>
              <span className={`eig-badge ${snap.cash > snap.monthly_expenses * 3 ? "ok" : "warn"}`}>
                {snap.cash > snap.monthly_expenses * 3 ? "Healthy" : "Low"}
              </span>
            </div>
            <div className="eig-value">{maskValue(formatCurrency(snap.cash + snap.offset_balance, true), privacyMode)}</div>
            <div className="eig-sub">Cash + {formatCurrency(snap.offset_balance, true)} offset</div>
            <div className="eig-bar-row">
              <div className="eig-bar-track">
                <div className="eig-bar-fill" style={{width:`${Math.min(100, (snap.cash/(snap.monthly_expenses*6))*100)}%`, background:"hsl(210,75%,52%)"}} />
              </div>
              <span className="eig-bar-label">{Math.round((snap.cash/(snap.monthly_expenses||1))/0.06)}% buffer</span>
            </div>
          </div>

          {/* 2. Debt Health */}
          <div className="eig-card">
            <div className="eig-header">
              <CreditCard className="eig-icon" style={{color:debtCard?.alert ? "hsl(5,70%,52%)" : "hsl(145,55%,42%)"}} />
              <span className="eig-title">Debt Health</span>
              <span className={`eig-badge ${debtCard?.alert ? "warn" : "ok"}`}>{debtCard?.alert ? "High" : "OK"}</span>
            </div>
            <div className="eig-value">{maskValue(formatCurrency(snap.mortgage + snap.other_debts, true), privacyMode)}</div>
            <div className="eig-sub">Mortgage + {formatCurrency(snap.other_debts, true)} other</div>
            <div className="eig-bar-row">
              <div className="eig-bar-track">
                <div className="eig-bar-fill" style={{width:`${Math.min(100, (snap.mortgage/(totalAssets||1))*100)}%`, background: debtCard?.alert ? "hsl(5,70%,52%)" : "hsl(145,55%,42%)"}} />
              </div>
              <span className="eig-bar-label">{Math.round((snap.mortgage/(totalAssets||1))*100)}% LVR</span>
            </div>
          </div>

          {/* 3. FIRE Progress */}
          <div className="eig-card">
            <div className="eig-header">
              <Flame className="eig-icon" style={{color:"hsl(42,80%,52%)"}} />
              <span className="eig-title">FIRE Progress</span>
              <span className={`eig-badge ${firePct >= 50 ? "ok" : "warn"}`}>{fireCard?.value ?? "—"} est.</span>
            </div>
            <div className="eig-value">{firePct}%</div>
            <div className="eig-sub">of $3M FIRE target · {Math.round((100-firePct)*1.2)} months</div>
            <div className="eig-bar-row">
              <div className="eig-bar-track">
                <div className="eig-bar-fill" style={{width:`${firePct}%`, background:"hsl(42,80%,52%)"}} />
              </div>
              <span className="eig-bar-label">{firePct}%</span>
            </div>
          </div>

          {/* 4. Property Readiness */}
          <div className="eig-card">
            <div className="eig-header">
              <Building2 className="eig-icon" style={{color:"hsl(188,60%,48%)"}} />
              <span className="eig-title">IP Readiness</span>
              <span className={`eig-badge ${depositPct >= 60 ? "ok" : "warn"}`}>{depositPct}%</span>
            </div>
            <div className="eig-value">{maskValue(formatCurrency((snap.cash + snap.offset_balance) * 0.7, true), privacyMode)}</div>
            <div className="eig-sub">Available for deposit · need ~$200k</div>
            <div className="eig-bar-row">
              <div className="eig-bar-track">
                <div className="eig-bar-fill" style={{width:`${depositPct}%`, background:"hsl(188,60%,48%)"}} />
              </div>
              <span className="eig-bar-label">{depositPct}%</span>
            </div>
          </div>

          {/* 5. Tax Alpha */}
          <div className="eig-card">
            <div className="eig-header">
              <Receipt className="eig-icon" style={{color:"hsl(145,55%,42%)"}} />
              <span className="eig-title">Tax Alpha</span>
              <span className="eig-badge ok">Active</span>
            </div>
            <TaxAlphaCard />
          </div>

          {/* 6. Risk Radar */}
          <div className="eig-card">
            <div className="eig-header">
              <Shield className="eig-icon" style={{color: riskScore >= 70 ? "hsl(145,55%,42%)" : riskScore >= 50 ? "hsl(42,80%,52%)" : "hsl(5,70%,52%)"}} />
              <span className="eig-title">Risk Radar</span>
              <span className={`eig-badge ${riskScore >= 70 ? "ok" : riskScore >= 50 ? "neutral" : "warn"}`}>{riskLabel}</span>
            </div>
            <RiskRadarCard />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — SMART ACTIONS
          Accordion ranked action list + Balance Sheet
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="elite-section-wrap">
        <div className="elite-two-col">
          {/* Smart Actions */}
          <div className="elite-actions-panel">
            <div className="eap-header">
              <div>
                <div className="eap-title">Smart Actions</div>
                <div className="eap-sub">Top opportunities ranked by ROI</div>
              </div>
              <Link href="/ai-insights"><span className="elite-section-link">AI Insights →</span></Link>
            </div>
            <div className="eap-list">
              {smartActions.map((action, idx) => (
                <Link key={idx} href={action.href}>
                  <div className={`eap-item eap-${action.priority}`}>
                    <div className="eap-rank">{idx + 1}</div>
                    <div className="eap-content">
                      <div className="eap-title-text">{action.title}</div>
                      <div className="eap-impact">{action.impact}</div>
                    </div>
                    <ChevronRight className="eap-arrow" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Balance Sheet */}
          <div className="chart-panel" ref={snapContainerRef}>
            <div className="chart-panel-header">
              <div>
                <p className="chart-panel-title">Balance Sheet</p>
                <p className="chart-panel-sub">Net Worth: {maskValue(formatCurrency(netWorth, true), privacyMode)}</p>
              </div>
              <button
                className="panel-edit-btn"
                onClick={() => { setEditSnap(!editSnap); if (!editSnap && !snapDraft) setSnapDraft({ ...snap }); }}
              >
                {editSnap ? "Cancel" : "Edit"}
              </button>
            </div>

            {!editSnap ? (
              <div className="bs-grid">
                <div className="bs-section">
                  <div className="bs-section-label">Assets</div>
                  {[
                    ["PPOR", snap.ppor],
                    ["Cash + Offset", snap.cash + snap.offset_balance],
                    ["Super", _totalSuperNow],
                    ["Stocks", liveStocks],
                    ["Crypto", liveCrypto],
                    ["Other", snap.cars + snap.iran_property],
                  ].filter(([,v]) => (v as number) > 0).map(([label, value]) => (
                    <div key={label as string} className="bs-row">
                      <span className="bs-label">{label as string}</span>
                      <span className="bs-value">{maskValue(formatCurrency(value as number, true), privacyMode)}</span>
                    </div>
                  ))}
                  <div className="bs-total">
                    <span>Total Assets</span>
                    <span>{maskValue(formatCurrency(totalAssets, true), privacyMode)}</span>
                  </div>
                </div>
                <div className="bs-section">
                  <div className="bs-section-label">Liabilities</div>
                  {[
                    ["Mortgage", snap.mortgage],
                    ["Other Debts", snap.other_debts],
                  ].filter(([,v]) => (v as number) > 0).map(([label, value]) => (
                    <div key={label as string} className="bs-row">
                      <span className="bs-label">{label as string}</span>
                      <span className="bs-value" style={{color:"hsl(5,70%,52%)"}}>{maskValue(formatCurrency(value as number, true), privacyMode)}</span>
                    </div>
                  ))}
                  <div className="bs-total">
                    <span>Net Worth</span>
                    <span style={{color:"hsl(210,75%,52%)"}}>{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="snap-edit-grid">
                {snapFields.map(({ label, key }) => (
                  <div key={key} className="snap-field">
                    <label className="snap-field-label">{label}</label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={snapDraft?.[key] ?? ""}
                      onChange={(e) => setSnapDraft((d: any) => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                ))}
                <div className="snap-edit-actions">
                  <SaveButton onSave={handleSaveSnap} className="h-7 text-xs" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — DEEP MODULE ACCESS
          Small elegant tiles + CFO widget + Portfolio Live Return
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="elite-section-wrap">
        <div className="elite-section-header">
          <span className="elite-section-label">Modules</span>
        </div>
        <div className="elite-modules-grid">
          {deepModules.map((mod) => (
            <Link key={mod.href} href={mod.href}>
              <div className="emod-tile">
                <span className="emod-icon">{mod.icon}</span>
                <span className="emod-label">{mod.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Portfolio live + CFO below */}
        <div className="elite-bottom-widgets">
          <PortfolioLiveReturn />
          <CFODashboardWidget />
        </div>
      </div>

    </div>
  );
}
