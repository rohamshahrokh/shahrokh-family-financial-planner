import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  formatCurrency,
  safeNum,
  calcSavingsRate,
  projectNetWorth,
  buildCashFlowSeries,
  aggregateCashFlowToAnnual,
} from "@/lib/finance";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import familyImg from "@assets/family.jpeg";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import { Link } from "wouter";
import { useForecastStore } from "@/lib/forecastStore";

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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient();
  const { chartView, privacyMode, togglePrivacy } = useAppStore();
  const { forecastMode, profile, monteCarloResult } = useForecastStore();

  const [editSnap, setEditSnap] = useState(false);
  const [snapDraft, setSnapDraft] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync);
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
  };

  // ─── Derived values ───────────────────────────────────────────────────────
  const totalAssets      = snap.ppor + snap.cash + snap.super_balance + snap.stocks + snap.crypto + snap.cars + snap.iran_property;
  const totalLiabilities = snap.mortgage + snap.other_debts;
  const netWorth         = totalAssets - totalLiabilities;
  const surplus          = snap.monthly_income - snap.monthly_expenses;
  const savingsRate      = calcSavingsRate(snap.monthly_income, snap.monthly_expenses);
  const propertyEquity   = snap.ppor - snap.mortgage;

  const stocksTotal    = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
  const cryptoTotal    = cryptos.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);
  const totalInvestments = stocksTotal + cryptoTotal;

  // Planned transactions only — actuals are already counted in expenses
  const plannedStockTx = useMemo(
    () => (stockTransactionsRaw as any[]).filter((t: any) => t.status === 'planned'),
    [stockTransactionsRaw]
  );
  const plannedCryptoTx = useMemo(
    () => (cryptoTransactionsRaw as any[]).filter((t: any) => t.status === 'planned'),
    [cryptoTransactionsRaw]
  );

  // ─── 10-year projection ───────────────────────────────────────────────────
  const projection = useMemo(
    () => projectNetWorth({ snapshot: snap, properties, stocks, cryptos, stockTransactions: plannedStockTx, cryptoTransactions: plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, years: 10 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, properties, stocks, cryptos, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders]
  );

  const year10NW      = projection[9]?.endNetWorth || netWorth;
  const passiveIncome = projection[0]?.passiveIncome || 0;

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
    { name: "Cash",          value: snap.cash },
    { name: "Super",         value: snap.super_balance },
    { name: "Cars",          value: snap.cars },
    { name: "Iran Property", value: snap.iran_property },
    { name: "Stocks",        value: stocksTotal + snap.stocks },
    { name: "Crypto",        value: cryptoTotal + snap.crypto },
  ].filter((d) => d.value > 0);

  const cashFlowData = [
    { month: "Income",   value: snap.monthly_income,   fill: "hsl(142,60%,45%)" },
    { month: "Expenses", value: snap.monthly_expenses, fill: "hsl(0,72%,51%)" },
    { month: "Surplus",  value: surplus,               fill: "hsl(43,85%,55%)" },
  ];

  // ─── Master Cash Flow Series (2025 → 2035) ────────────────────────────────
  const cashFlowSeries = useMemo(
    () => buildCashFlowSeries({ snapshot: snap, expenses: expenses as any[], properties: properties as any[], stockTransactions: plannedStockTx, cryptoTransactions: plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders]
  );

  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

  // ─── Wealth Strategy Summary Cards ───────────────────────────────────────
  const wealthCards = useMemo(() => {
    // FIRE progress
    const currentInvestable = snap.cash + snap.super_balance + snap.stocks + snap.crypto + stocksTotal + cryptoTotal;
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
    const depositReady = Math.min(100, Math.round((snap.cash * 0.7 / depositNeeded) * 100));

    // Retirement age estimate (rough)
    const currentInvestable2 = snap.cash + snap.super_balance + snap.stocks + snap.crypto + stocksTotal + cryptoTotal;
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
        label:     y.year.toString(),
        income:    y.income,
        expenses:  y.totalExpenses,
        mortgage:  y.mortgageRepayment,
        rental:    y.rentalIncome,
        netCF:     y.netCashFlow,
        balance:   y.endingBalance,
        hasActuals: y.hasActualMonths > 0,
      }));
    } else {
      return cashFlowSeries.map((m) => ({
        label:     m.label,
        income:    m.income,
        expenses:  m.totalExpenses,
        mortgage:  m.mortgageRepayment,
        rental:    m.rentalIncome,
        netCF:     m.netCashFlow,
        balance:   m.cumulativeBalance,
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
    { label: "PPOR",             key: "ppor",             group: "asset" },
    { label: "Cash",             key: "cash",             group: "asset" },
    { label: "Super",            key: "super_balance",    group: "asset" },
    { label: "Cars",             key: "cars",             group: "asset" },
    { label: "Iran Property",    key: "iran_property",    group: "asset" },
    { label: "Mortgage",         key: "mortgage",         group: "liability" },
    { label: "Other Debts",      key: "other_debts",      group: "liability" },
    { label: "Monthly Income",   key: "monthly_income",   group: "income" },
    { label: "Monthly Expenses", key: "monthly_expenses", group: "expense" },
  ] as const;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-8">

      {/* ─── Forecast Mode Banner ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Forecast mode:</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            forecastMode === 'monte-carlo'  ? 'bg-purple-900/40 text-purple-300 border border-purple-700/30' :
            forecastMode === 'year-by-year' ? 'bg-blue-900/40 text-blue-300 border border-blue-700/30' :
            'bg-primary/10 text-primary border border-primary/20'
          }`}>
            {forecastMode === 'monte-carlo'  ? 'Monte Carlo' :
             forecastMode === 'year-by-year' ? 'Year-by-Year' :
             `Profile — ${profile.charAt(0).toUpperCase() + profile.slice(1)}`}
          </span>
        </div>
        {forecastMode === 'monte-carlo' && monteCarloResult && (
          <>
            <span className="text-xs text-muted-foreground">Median 2035:</span>
            <span className="text-xs font-bold num-display text-emerald-400">{formatCurrency(monteCarloResult.median, true)}</span>
            <span className="text-xs text-muted-foreground">Range:</span>
            <span className="text-xs num-display text-muted-foreground">{formatCurrency(monteCarloResult.p10, true)} – {formatCurrency(monteCarloResult.p90, true)}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-900/30 text-amber-300 border border-amber-700/30">
              {monteCarloResult.prob_ff}% financial freedom
            </span>
          </>
        )}
        <Link href="/ai-forecast-engine" className="ml-auto text-xs text-primary hover:underline">
          Configure →
        </Link>
      </div>

      {/* ─── Hero Section ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ border: "1px solid rgba(196,165,90,0.2)" }}
      >
        <div className="absolute inset-0">
          <img
            src={familyImg}
            alt="Shahrokh Family"
            className="w-full h-full object-cover object-top opacity-15"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, hsl(224,40%,10%) 0%, hsl(224,20%,12%) 100%)" }}
          />
        </div>
        <div className="relative z-10 p-6 lg:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <img
            src={familyImg}
            alt=""
            className="w-16 h-16 rounded-xl object-cover object-top shrink-0 ring-2 ring-primary/40"
          />
          <div className="flex-1">
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em] mb-1"
              style={{ color: "hsl(43,85%,65%)" }}
            >
              Welcome Back
            </p>
            <h1 className="text-xl font-bold text-foreground">Fara &amp; Roham</h1>
            <p className="text-muted-foreground text-sm">Family Net Worth Command Center</p>
            <p className="text-xs mt-1" style={{ color: "hsl(43,85%,55%)" }}>
              Building Wealth for Yara &amp; Jana
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Estimated Net Worth</p>
            <div className="text-2xl font-bold num-display" style={{ color: "hsl(43,85%,65%)" }}>
              {maskValue(formatCurrency(netWorth), privacyMode, "currency")}
            </div>
            <p className="text-xs text-muted-foreground">Brisbane, QLD · AUD</p>
            <div className="flex gap-1.5 mt-2 justify-end">
              {/* Privacy toggle — redundant with header, kept for discoverability */}
              <Button
                size="sm"
                variant="outline"
                onClick={togglePrivacy}
                className="h-7 text-xs gap-1.5"
                style={{ borderColor: "rgba(196,165,90,0.3)", color: "hsl(43,85%,65%)" }}
              >
                {privacyMode ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {privacyMode ? "Show Values" : "Hide Values"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncFromCloud}
                disabled={syncing}
                className="h-7 text-xs gap-1.5"
                style={{ borderColor: "rgba(196,165,90,0.3)", color: "hsl(43,85%,65%)" }}
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync From Cloud"}
              </Button>
            </div>
            {lastSync && (
              <p className="text-xs text-muted-foreground mt-1 text-right">
                Last synced:{" "}
                {new Date(lastSync).toLocaleString("en-AU", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Income Source Badge ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
          useIncomeTracker
            ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-400'
            : 'border-amber-700/40 bg-amber-950/20 text-amber-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            useIncomeTracker ? 'bg-emerald-400' : 'bg-amber-400'
          }`} />
          Income source: {incomeSource}
          {useIncomeTracker && (
            <span className="opacity-70 ml-0.5">({activeStreamsCount} active source{activeStreamsCount !== 1 ? 's' : ''} · {formatCurrency(incomeTrackerMonthly, true)}/mo)</span>
          )}
        </span>
      </div>

      {/* ─── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Net Worth"
          value={maskValue(formatCurrency(netWorth, true), privacyMode, "currency")}
          subValue={maskValue(`${savingsRate.toFixed(0)}% savings rate`, privacyMode, "pct")}
          trend={1}
          icon={<DollarSign />}
        />
        <KpiCard
          label="Monthly Surplus"
          value={maskValue(formatCurrency(surplus), privacyMode, "currency")}
          subValue={maskValue(`${formatCurrency(surplus * 12)} / year`, privacyMode, "currency")}
          trend={1}
          icon={<TrendingUp />}
        />
        <KpiCard
          label="Total Investments"
          value={maskValue(formatCurrency(totalInvestments, true), privacyMode, "currency")}
          subValue="Stocks + Crypto"
          trend={totalInvestments > 0 ? 1 : 0}
          icon={<Layers />}
          accent="hsl(188,60%,48%)"
        />
        <KpiCard
          label="Property Equity"
          value={maskValue(formatCurrency(propertyEquity, true), privacyMode, "currency")}
          subValue={maskValue(
            `${(snap.ppor > 0 ? (propertyEquity / snap.ppor) * 100 : 0).toFixed(0)}% LVR met`,
            privacyMode,
            "pct"
          )}
          trend={1}
          icon={<Home />}
          accent="hsl(142,60%,45%)"
        />
        <KpiCard
          label="Debt Balance"
          value={maskValue(formatCurrency(totalLiabilities, true), privacyMode, "currency")}
          subValue="Mortgage + Debts"
          trend={-1}
          icon={<CreditCard />}
          accent="hsl(0,72%,51%)"
        />
        <KpiCard
          label="10-Year Forecast"
          value={maskValue(formatCurrency(year10NW, true), privacyMode, "currency")}
          subValue={maskValue(`From ${formatCurrency(netWorth, true)} today`, privacyMode, "currency")}
          trend={1}
          icon={<Calendar />}
          accent="hsl(270,60%,60%)"
        />
        <KpiCard
          label="Passive Income"
          value={maskValue(formatCurrency(passiveIncome, true), privacyMode, "currency")}
          subValue="Rental + Dividends"
          trend={passiveIncome > 0 ? 1 : 0}
          icon={<PiggyBank />}
          accent="hsl(43,85%,55%)"
        />
        <KpiCard
          label="Savings Rate"
          value={maskValue(`${savingsRate.toFixed(1)}%`, privacyMode, "pct")}
          subValue={maskValue(`${formatCurrency(surplus * 12)} saved / yr`, privacyMode, "currency")}
          trend={savingsRate > 20 ? 1 : savingsRate > 0 ? 0 : -1}
          icon={<Target />}
          accent="hsl(20,80%,55%)"
        />
      </div>


      {/* ─── Smart CFO Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Upcoming Bills */}
        <Link href="/recurring-bills">
          <div className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(196,165,90,0.12)' }}>
                <Receipt className="w-3.5 h-3.5" style={{ color: 'hsl(43,85%,65%)' }} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Upcoming Bills</span>
            </div>
            <p className="text-2xl font-bold num-display" style={{ color: billsDueCount > 0 ? 'hsl(43,85%,65%)' : undefined }}>
              {billsDueCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{nextBillLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">due in 30 days</p>
          </div>
        </Link>

        {/* Budget Status */}
        <Link href="/budget">
          <div className={`bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors group ${
            categoriesOverBudget > 0 ? 'border-red-800/50' : 'border-border'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: categoriesOverBudget > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.10)' }}>
                <Target className="w-3.5 h-3.5" style={{ color: categoriesOverBudget > 0 ? 'hsl(0,72%,60%)' : 'hsl(142,60%,50%)' }} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Budget Status</span>
            </div>
            <p className="text-2xl font-bold num-display" style={{ color: categoriesOverBudget > 0 ? 'hsl(0,72%,60%)' : 'hsl(142,60%,50%)' }}>
              {categoriesOverBudget}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {categoriesOverBudget === 0
                ? (budgetsThisMonth.length > 0 ? 'All categories on track' : 'No budgets set')
                : `categor${categoriesOverBudget === 1 ? 'y' : 'ies'} over budget`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">this month</p>
          </div>
        </Link>

        {/* Alerts Sent */}
        <Link href="/settings">
          <div className={`bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors group ${
            recentAlerts > 0 ? 'border-amber-800/40' : 'border-border'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: recentAlerts > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(96,165,250,0.10)' }}>
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: recentAlerts > 0 ? 'hsl(38,92%,60%)' : 'hsl(188,60%,48%)' }} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Alerts Sent</span>
            </div>
            <p className="text-2xl font-bold num-display" style={{ color: recentAlerts > 0 ? 'hsl(38,92%,60%)' : undefined }}>
              {recentAlerts}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">in last 24 hours</p>
            <p className="text-xs text-muted-foreground mt-0.5">via Telegram / Push</p>
          </div>
        </Link>

        {/* Cash After Bills */}
        <Link href="/recurring-bills">
          <div className={`bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors group ${
            cashAfterBills < 0 ? 'border-red-800/50' : 'border-border'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: cashAfterBills >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.12)' }}>
                <DollarSign className="w-3.5 h-3.5" style={{ color: cashAfterBills >= 0 ? 'hsl(142,60%,50%)' : 'hsl(0,72%,60%)' }} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Cash After Bills</span>
            </div>
            <p className="text-2xl font-bold num-display" style={{ color: cashAfterBills >= 0 ? 'hsl(142,60%,50%)' : 'hsl(0,72%,60%)' }}>
              {maskValue(formatCurrency(cashAfterBills), privacyMode, "currency")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {maskValue(formatCurrency(billMonthlyTotal), privacyMode, "currency")} fixed/mo
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">from recurring bills</p>
          </div>
        </Link>
      </div>

      {/* ─── Wealth Strategy Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {wealthCards.map(card => (
          <Link key={card.label} href={`/wealth-strategy`}>
            <div className={`bg-card border rounded-xl p-3 cursor-pointer hover:border-primary/50 transition-colors ${card.alert ? 'border-red-800/50' : 'border-border'}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <card.Icon className={`w-3.5 h-3.5 ${card.alert ? 'text-red-400' : 'text-primary'}`} />
                <span className="text-xs text-muted-foreground truncate">{card.label}</span>
              </div>
              <p className={`text-sm font-bold leading-none ${card.alert ? 'text-red-400' : ''}`}>{card.value}</p>
              {card.sub && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{card.sub}</p>}
            </div>
          </Link>
        ))}
      </div>

      {/* ─── Financial Snapshot Edit ───────────────────────────────────────── */}
      {/*
        snapContainerRef is attached here so that pressing Enter inside any
        input field (but not a textarea) calls handleSaveSnapCallback while
        editSnap is true. The useSaveOnEnter hook manages the keydown listener
        and 300 ms leading-edge debounce automatically.
      */}
      <div
        className="rounded-xl border border-border bg-card p-5"
        ref={snapContainerRef}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">Financial Snapshot</h2>
          <div className="flex gap-2">
            {editSnap ? (
              <>
                <SaveButton label="Save Dashboard Snapshot" onSave={handleSaveSnap} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditSnap(false);
                    setSnapDraft(null);
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditSnap(true);
                  setSnapDraft({ ...snap });
                }}
              >
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {snapFields.map(({ label, key, group }) => (
            <div key={key} className="rounded-lg p-3 bg-secondary/40">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              {editSnap && snapDraft ? (
                <Input
                  type="number"
                  value={snapDraft[key]}
                  onChange={(e) =>
                    setSnapDraft({ ...snapDraft, [key]: parseFloat(e.target.value) || 0 })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSaveSnap();
                    }
                  }}
                  className="h-7 text-sm num-display font-semibold"
                />
              ) : (
                <p
                  className={`text-sm font-bold num-display ${
                    group === "liability" || group === "expense"
                      ? "text-red-400"
                      : group === "income"
                      ? "text-emerald-400"
                      : "text-foreground"
                  }`}
                >
                  {maskValue(
                    formatCurrency((snap as any)[key] || 0),
                    privacyMode,
                    "currency"
                  )}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="text-sm font-bold text-emerald-400 num-display">
              {maskValue(formatCurrency(totalAssets), privacyMode, "currency")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Liabilities</p>
            <p className="text-sm font-bold text-red-400 num-display">
              {maskValue(formatCurrency(totalLiabilities), privacyMode, "currency")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Net Worth</p>
            <p className="text-sm font-bold num-display" style={{ color: "hsl(43,85%,65%)" }}>
              {maskValue(formatCurrency(netWorth), privacyMode, "currency")}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Charts Row ───────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Net Worth Growth */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">10-Year Net Worth Growth</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={nwGrowthData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "hsl(220,10%,55%)" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(220,10%,55%)" }}
                tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke="hsl(43,85%,55%)"
                fill="url(#nwGrad)"
                strokeWidth={2}
                name="Net Worth"
              />
              <Area
                type="monotone"
                dataKey="assets"
                stroke="hsl(142,60%,45%)"
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                name="Assets"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Asset Allocation */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Asset Allocation</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie
                  data={assetData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {assetData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {assetData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold num-display">
                    {((d.value / totalAssets) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Cash Flow + Expenses ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Monthly Cash Flow */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Monthly Cash Flow</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cashFlowData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220,10%,55%)" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(220,10%,55%)" }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]}>
                {cashFlowData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border text-center">
            <div>
              <p className="text-xs text-muted-foreground">Income</p>
              <p className="text-xs font-bold text-emerald-400 num-display">
                {maskValue(formatCurrency(snap.monthly_income), privacyMode, "currency")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="text-xs font-bold text-red-400 num-display">
                {maskValue(formatCurrency(snap.monthly_expenses), privacyMode, "currency")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Surplus</p>
              <p
                className="text-xs font-bold num-display"
                style={{ color: "hsl(43,85%,65%)" }}
              >
                {maskValue(formatCurrency(surplus), privacyMode, "currency")}
              </p>
            </div>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Expense Breakdown</h3>
          {expensePieData.length > 0 ? (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie
                    data={expensePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expensePieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 text-xs">
                {expensePieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate max-w-[80px]">
                        {d.name}
                      </span>
                    </div>
                    <span className="font-semibold num-display">
                      {maskValue(formatCurrency(d.value, true), privacyMode, "currency")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
              <TrendingUp className="w-8 h-8 opacity-30" />
              <p>No expenses tracked yet</p>
              <p className="text-xs">Add expenses in the Expense Tracker</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Master Cash Flow Chart 2025–2035 ────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold">Master Cash Flow Forecast</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actual expenses (tracked) + forecast (snapshot) · 2025 – 2035
            </p>
          </div>
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-secondary capitalize">
            {cashFlowView} view · toggle in header
          </span>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-3 flex-wrap">
          {[
            { color: "hsl(142,60%,45%)", label: "Income" },
            { color: "hsl(0,72%,51%)",   label: "Expenses" },
            { color: "hsl(43,85%,55%)",  label: "Net CF" },
            { color: "hsl(188,60%,48%)", label: "Balance (right axis)", dashed: true },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color, opacity: (l as any).dashed ? 0.7 : 1 }} />
              {l.label}
            </div>
          ))}
          {settlementAnnotations.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
              Property Settlement
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={masterCFData} margin={{ top: 5, right: 60, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }}
              interval={cashFlowView === "annual" ? 0 : "preserveStartEnd"}
              angle={cashFlowView === "monthly" ? -30 : 0}
              textAnchor={cashFlowView === "monthly" ? "end" : "middle"}
              height={cashFlowView === "monthly" ? 40 : 20}
            />
            {/* Left axis: Income / Expenses / Net CF — monthly scale */}
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }}
              tickFormatter={(v) => {
                const abs = Math.abs(v);
                if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                if (abs >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
                return `$${v}`;
              }}
            />
            {/* Right axis: Balance — cumulative scale (much larger) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 9, fill: "hsl(188,60%,48%)" }}
              tickFormatter={(v) => {
                const abs = Math.abs(v);
                if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                if (abs >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
                return `$${v}`;
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const ann = settlementAnnotations.find(a => a.label === label);
                return (
                  <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl max-w-[220px]">
                    <p className="text-muted-foreground mb-1 font-semibold">{label}</p>
                    {ann && (
                      <p className="text-amber-400 mb-1 font-semibold">🏠 {ann.name} settlement{ann.amount > 0 ? ` (${formatCurrency(ann.amount, true)})` : ''}</p>
                    )}
                    {payload.map((p: any, i: number) => (
                      <p key={i} style={{ color: p.color }}>
                        {p.name}: {formatCurrency(p.value, true)}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {/* Property settlement reference lines */}
            {settlementAnnotations.map((ann, i) => (
              <ReferenceLine
                key={i}
                yAxisId="left"
                x={ann.label}
                stroke="hsl(43,85%,55%)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{
                  value: `🏠 ${ann.name.length > 14 ? ann.name.slice(0, 14) + '…' : ann.name}`,
                  position: 'insideTopRight',
                  fill: 'hsl(43,85%,55%)',
                  fontSize: 9,
                  fontWeight: 600,
                }}
              />
            ))}
            <Line
              yAxisId="left"
              type="monotone" dataKey="income"
              stroke="hsl(142,60%,45%)" strokeWidth={1.5} dot={false} name="Income"
            />
            <Line
              yAxisId="left"
              type="monotone" dataKey="expenses"
              stroke="hsl(0,72%,51%)" strokeWidth={1.5} dot={false} name="Expenses"
            />
            <Line
              yAxisId="left"
              type="monotone" dataKey="netCF"
              stroke="hsl(43,85%,55%)" strokeWidth={2} dot={false} name="Net CF"
            />
            <Line
              yAxisId="right"
              type="monotone" dataKey="balance"
              stroke="hsl(188,60%,48%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Balance"
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Summary row — values masked when privacyMode is on */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border text-center text-xs">
          {(() => {
            const latest = cashFlowAnnual.find((y) => y.year === new Date().getFullYear()) || cashFlowAnnual[0];
            const yr2035 = cashFlowAnnual[cashFlowAnnual.length - 1];
            return [
              {
                label: `${new Date().getFullYear()} Net CF`,
                raw:   latest?.netCashFlow || 0,
                color: (latest?.netCashFlow || 0) >= 0 ? "text-emerald-400" : "text-red-400",
              },
              {
                label: `${new Date().getFullYear()} Balance`,
                raw:   latest?.endingBalance || 0,
                color: "text-primary",
              },
              {
                label: "2035 Net CF",
                raw:   yr2035?.netCashFlow || 0,
                color: (yr2035?.netCashFlow || 0) >= 0 ? "text-emerald-400" : "text-red-400",
              },
              {
                label: "2035 Balance",
                raw:   yr2035?.endingBalance || 0,
                color: "num-display",
              },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-muted-foreground">{s.label}</p>
                <p className={`font-bold num-display mt-0.5 ${s.color}`}>
                  {maskValue(formatCurrency(s.raw, true), privacyMode, "currency")}
                </p>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* ─── 10-Year Net Worth Table ───────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Year-by-Year Net Worth Projection</h3>
          <span className="text-xs text-muted-foreground">10-Year Forecast</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {[
                  "Year", "Start NW", "Income", "Expenses", "Prop. Value",
                  "Prop. Loans", "Equity", "Stocks", "Crypto", "Cash",
                  "Total Assets", "Liabilities", "End NW", "Growth",
                  "Passive Income", "Mthly CF",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 pr-4 font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.map((p, i) => (
                <tr
                  key={p.year}
                  className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${
                    i === 9 ? "font-bold" : ""
                  }`}
                >
                  <td className="py-2 pr-4 font-semibold text-primary">{p.year}</td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.startNetWorth, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display text-emerald-400">
                    {maskValue(formatCurrency(p.income, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display text-red-400">
                    {maskValue(formatCurrency(p.expenses, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.propertyValue, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display text-red-400">
                    {maskValue(formatCurrency(p.propertyLoans, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display text-emerald-400">
                    {maskValue(formatCurrency(p.propertyEquity, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.stockValue, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.cryptoValue, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.cash, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display text-emerald-400">
                    {maskValue(formatCurrency(p.totalAssets, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display text-red-400">
                    {maskValue(formatCurrency(p.totalLiabilities, true), privacyMode, "currency")}
                  </td>
                  <td
                    className="py-2 pr-4 num-display font-bold"
                    style={{ color: "hsl(43,85%,65%)" }}
                  >
                    {maskValue(formatCurrency(p.endNetWorth, true), privacyMode, "currency")}
                  </td>
                  <td
                    className={`py-2 pr-4 num-display ${
                      p.growth >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    +{maskValue(formatCurrency(p.growth, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.passiveIncome, true), privacyMode, "currency")}
                  </td>
                  <td className="py-2 pr-4 num-display">
                    {maskValue(formatCurrency(p.monthlyCashFlow, true), privacyMode, "currency")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Portfolio Live Return ──────────────────────────────────────── */}
      <PortfolioLiveReturn />

      {/* ─── AI Insights ─────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="dashboard"
        pageLabel="Overall Financial Health"
        getData={() => ({
          netWorth: snapshot?.net_worth,
          monthlyIncome: snap.monthly_income, // uses Income Tracker if records exist
          incomeSource: incomeSource,
          monthlyExpenses: snapshot?.monthly_expenses,
          monthlySurplus: snapshot?.monthly_surplus,
          savingsRate: snapshot?.savings_rate,
          totalDebt: snapshot?.total_debt,
          totalAssets: snapshot?.total_assets,
          cashFlow: snapshot?.cash_flow,
        })}
      />
    </div>
  );
}
