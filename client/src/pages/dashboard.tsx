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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import familyImg from "@assets/family.jpeg";

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

  const [editSnap, setEditSnap] = useState(false);
  const [snapDraft, setSnapDraft] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync);
  const [cashFlowView, setCashFlowView] = useState<"monthly" | "annual">("annual");

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

  const updateSnap = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/snapshot", data).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/snapshot"] }),
  });

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
    monthly_income:   safeNum(snapshot?.monthly_income)   || 22000,
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

  // ─── 10-year projection ───────────────────────────────────────────────────
  const projection = useMemo(
    () => projectNetWorth({ snapshot: snap, properties, stocks, cryptos, years: 10 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, properties, stocks, cryptos]
  );

  const year10NW      = projection[9]?.endNetWorth || netWorth;
  const passiveIncome = projection[0]?.passiveIncome || 0;

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
    () => buildCashFlowSeries({ snapshot: snap, expenses: expenses as any[], properties: properties as any[] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, expenses, properties]
  );

  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

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
      const now          = new Date();
      const cutoffStart  = new Date(now.getFullYear() - 1, now.getMonth() - 11, 1);
      const cutoffEnd    = new Date(now.getFullYear() + 1, now.getMonth() + 11, 1);
      return cashFlowSeries
        .filter((m) => {
          const d = new Date(m.year, m.month - 1, 1);
          return d >= cutoffStart && d <= cutoffEnd;
        })
        .map((m) => ({
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
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setCashFlowView("monthly")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                cashFlowView === "monthly"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCashFlowView("annual")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                cashFlowView === "annual"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-3 flex-wrap">
          {[
            { color: "hsl(142,60%,45%)", label: "Income" },
            { color: "hsl(0,72%,51%)",   label: "Expenses" },
            { color: "hsl(43,85%,55%)",  label: "Net CF" },
            { color: "hsl(188,60%,48%)", label: "Balance" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={masterCFData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }}
              interval={cashFlowView === "annual" ? 0 : "preserveStartEnd"}
              angle={cashFlowView === "monthly" ? -30 : 0}
              textAnchor={cashFlowView === "monthly" ? "end" : "middle"}
              height={cashFlowView === "monthly" ? 40 : 20}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }}
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
                return (
                  <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
                    <p className="text-muted-foreground mb-1 font-semibold">{label}</p>
                    {payload.map((p: any, i: number) => (
                      <p key={i} style={{ color: p.color }}>
                        {p.name}: {formatCurrency(p.value, true)}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Line
              type="monotone" dataKey="income"
              stroke="hsl(142,60%,45%)" strokeWidth={1.5} dot={false} name="Income"
            />
            <Line
              type="monotone" dataKey="expenses"
              stroke="hsl(0,72%,51%)" strokeWidth={1.5} dot={false} name="Expenses"
            />
            <Line
              type="monotone" dataKey="netCF"
              stroke="hsl(43,85%,55%)" strokeWidth={2} dot={false} name="Net CF"
            />
            <Line
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
    </div>
  );
}
