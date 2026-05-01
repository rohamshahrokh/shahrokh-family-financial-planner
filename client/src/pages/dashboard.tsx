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
import SaveButton, { useSaveOnEnter } from "@/components/SaveButton";
import { useState, useMemo, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Home,
  CreditCard,
  PiggyBank,
  Target,
  Edit2,
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
  ChevronRight,
  Zap,
  Maximize2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import CFODashboardWidget from "@/components/CFODashboardWidget";
import { Link } from "wouter";
import { useForecastStore } from "@/lib/forecastStore";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";

// ─── Chart tooltips ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="db-tooltip">
        <p className="db-tooltip-label">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="db-tooltip-row">
            {p.name}: {formatCurrency(p.value, true)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CashflowTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  const rows = [
    { label: "Salary / Income",          value: d.income   ?? 0, color: "hsl(142,60%,45%)" },
    { label: "Rental Income",            value: d.rental   ?? 0, color: "hsl(188,60%,48%)" },
    { label: "Living Expenses",          value: -(d.expenses ?? 0), color: "hsl(0,72%,51%)" },
    { label: "Mortgage Repayments",      value: -(d.mortgage ?? 0), color: "hsl(20,80%,55%)" },
    { label: "NG Tax Refund",            value: d.ngRefund  ?? 0, color: "hsl(43,85%,55%)" },
    { label: "Net Cashflow",             value: d.netCF    ?? 0, color: (d.netCF ?? 0) >= 0 ? "hsl(142,60%,45%)" : "hsl(0,72%,51%)" },
    { label: "Ending Cash Balance",      value: d.balance  ?? 0, color: "hsl(270,60%,60%)" },
  ].filter(r => r.value !== 0);
  return (
    <div className="db-tooltip" style={{ minWidth: 220 }}>
      <p className="db-tooltip-label">{label}</p>
      {rows.map((r, i) => (
        <div key={i} className="db-tooltip-row" style={{ color: r.color }}>
          <span>{r.label}</span>
          <span className="font-mono">{r.value >= 0 ? "+" : ""}{formatCurrency(r.value, true)}</span>
        </div>
      ))}
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
  const [ngRefundMode, setNgRefundMode] = useState<"lump-sum" | "payg">("lump-sum");
  const [chartRange, setChartRange] = useState<"1Y" | "3Y" | "10Y" | "Scenario">("10Y");
  const [mainChartMode, setMainChartMode] = useState<"networth" | "cashflow">("networth");
  const cashFlowView = chartView;

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSaveSnapCallback = useCallback(async () => {
    if (!snapDraft) return;
    if (saveDebounceRef.current) return;
    saveDebounceRef.current = setTimeout(() => { saveDebounceRef.current = null; }, 300);
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

  // ─── Income ──────────────────────────────────────────────────────────────
  const FREQ_MULT: Record<string, number> = {
    Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
    Quarterly: 4 / 12, Annual: 1 / 12, "One-off": 0,
  };

  const activeIncomeStreams = useMemo(() => {
    const streamMap = new Map<string, any>();
    const sorted = [...(incomeRecords as any[])]
      .filter((r: any) => r.frequency !== "One-off")
      .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
    for (const r of sorted) {
      const key = [(r.member||"").toLowerCase().trim(),(r.source||"").toLowerCase().trim(),(r.description||"").toLowerCase().trim()].join("|");
      if (!streamMap.has(key)) streamMap.set(key, r);
    }
    return Array.from(streamMap.values());
  }, [incomeRecords]);

  const incomeTrackerMonthly = useMemo(() =>
    activeIncomeStreams.reduce((sum: number, r: any) => sum + safeNum(r.amount) * (FREQ_MULT[r.frequency] ?? 1), 0),
  [activeIncomeStreams]);

  const useIncomeTracker = incomeRecords.length > 0;

  // ─── Snapshot ─────────────────────────────────────────────────────────────
  const snap = {
    ppor:             safeNum(snapshot?.ppor)             || 1510000,
    cash:             safeNum(snapshot?.cash)             || 220000,
    offset_balance:   safeNum(snapshot?.offset_balance),
    super_balance:    safeNum(snapshot?.super_balance)    || 85000,
    stocks:           safeNum(snapshot?.stocks),
    crypto:           safeNum(snapshot?.crypto),
    cars:             safeNum(snapshot?.cars)             || 65000,
    iran_property:    safeNum(snapshot?.iran_property)    || 150000,
    mortgage:         safeNum(snapshot?.mortgage)         || 1200000,
    other_debts:      safeNum(snapshot?.other_debts)      || 19000,
    monthly_income:   useIncomeTracker ? incomeTrackerMonthly : safeNum(snapshot?.monthly_income) || 22000,
    monthly_expenses: safeNum(snapshot?.monthly_expenses) || 14540,
    roham_super_balance:          safeNum(snapshot?.roham_super_balance),
    roham_super_salary:           safeNum(snapshot?.roham_super_salary),
    roham_employer_contrib:       safeNum(snapshot?.roham_employer_contrib)       || 11.5,
    roham_salary_sacrifice:       safeNum(snapshot?.roham_salary_sacrifice),
    roham_super_personal_contrib: safeNum(snapshot?.roham_super_personal_contrib),
    roham_super_annual_topup:     safeNum(snapshot?.roham_super_annual_topup),
    roham_super_growth_rate:      safeNum(snapshot?.roham_super_growth_rate)      || 8.0,
    roham_super_fee_pct:          safeNum(snapshot?.roham_super_fee_pct)          || 0.5,
    roham_super_insurance_pa:     safeNum(snapshot?.roham_super_insurance_pa),
    roham_super_option:           (snapshot?.roham_super_option  as string)       || "High Growth",
    roham_super_provider:         (snapshot?.roham_super_provider as string)      || "",
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
    fara_super_option:            (snapshot?.fara_super_option  as string)        || "High Growth",
    fara_super_provider:          (snapshot?.fara_super_provider as string)       || "",
    fara_retirement_age:          safeNum(snapshot?.fara_retirement_age)          || 60,
  };

  // ─── Derived values ───────────────────────────────────────────────────────
  const stocksTotal    = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
  const cryptoTotal    = cryptos.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);
  const liveStocks  = stocksTotal  > 0 ? stocksTotal  : snap.stocks;
  const liveCrypto  = cryptoTotal  > 0 ? cryptoTotal  : snap.crypto;

  const _superRohamNow = snap.roham_super_balance > 0 ? snap.roham_super_balance : snap.super_balance * 0.6;
  const _superFaraNow  = snap.fara_super_balance  > 0 ? snap.fara_super_balance  : snap.super_balance * 0.4;
  const _totalSuperNow = _superRohamNow + _superFaraNow;

  const totalAssets      = snap.ppor + snap.cash + snap.offset_balance + _totalSuperNow + liveStocks + liveCrypto + snap.cars + snap.iran_property;
  const totalLiabilities = snap.mortgage + snap.other_debts;
  const netWorth         = totalAssets - totalLiabilities;
  const surplus          = snap.monthly_income - snap.monthly_expenses;
  const savingsRate      = calcSavingsRate(snap.monthly_income, snap.monthly_expenses);
  const propertyEquity   = snap.ppor - snap.mortgage;

  const plannedStockTx = useMemo(
    () => (stockTransactionsRaw as any[]).filter((t: any) => t.status === "planned"),
    [stockTransactionsRaw]
  );
  const plannedCryptoTx = useMemo(
    () => (cryptoTransactionsRaw as any[]).filter((t: any) => t.status === "planned"),
    [cryptoTransactionsRaw]
  );

  const ngSummary = useMemo<NGSummary>(() =>
    calcNegativeGearing({
      properties: properties as any[],
      annualSalaryIncome: safeNum(snap.monthly_income) * 12,
      refundMode: ngRefundMode,
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [properties, snap.monthly_income, ngRefundMode]);

  // ─── Projection ───────────────────────────────────────────────────────────
  const projection = useMemo(
    () => projectNetWorth({
      snapshot: snap, properties, stocks, cryptos,
      liveStocksValue: liveStocks, liveCryptoValue: liveCrypto,
      stockTransactions: plannedStockTx, cryptoTransactions: plannedCryptoTx,
      stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders,
      years: 10, inflation: fa.flat.inflation, ppor_growth: fa.flat.property_growth,
      yearlyAssumptions: fa.yearly, expenses: expenses as any[],
      bills: billsRaw as any[], ngRefundMode,
      ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      annualSalaryIncome: safeNum(snap.monthly_income) * 12,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, properties, stocks, cryptos, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, expenses, billsRaw, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );

  const year10NW      = projection[9]?.endNetWorth || netWorth;
  const passiveIncome = projection[0]?.passiveIncome || 0;

  const currentSuperRoham = snap.roham_super_balance || snap.super_balance * 0.6;
  const currentSuperFara  = snap.fara_super_balance  || snap.super_balance * 0.4;
  const currentTotalSuper = currentSuperRoham + currentSuperFara;

  // ─── Bills ────────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeBills = useMemo(() => {
    return (billsRaw as any[])
      .filter((b: any) => b.active !== false)
      .sort((a: any, b: any) => {
        const da = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity;
        const db = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity;
        return da - db;
      });
  }, [billsRaw]);

  // ─── Cashflow series ──────────────────────────────────────────────────────
  const cashFlowSeries = useMemo(
    () => buildCashFlowSeries({
      snapshot: snap, expenses: expenses as any[], properties: properties as any[],
      stockTransactions: plannedStockTx, cryptoTransactions: plannedCryptoTx,
      stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders,
      inflationRate: fa.flat.inflation, incomeGrowthRate: fa.flat.income_growth,
      ngRefundMode, ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      annualSalaryIncome: safeNum(snap.monthly_income) * 12,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );

  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

  const masterCFData = useMemo(() => {
    if (cashFlowView === "annual") {
      return cashFlowAnnual.map((y) => ({
        label: y.year.toString(), income: y.income, expenses: y.totalExpenses,
        mortgage: y.mortgageRepayment, rental: y.rentalIncome, ngRefund: y.ngTaxBenefit,
        netCF: y.netCashFlow, balance: y.endingBalance, hasActuals: y.hasActualMonths > 0,
      }));
    }
    return cashFlowSeries.map((m) => ({
      label: m.label, income: m.income, expenses: m.totalExpenses,
      mortgage: m.mortgageRepayment, rental: m.rentalIncome, ngRefund: m.ngTaxBenefit,
      netCF: m.netCashFlow, balance: m.cumulativeBalance, hasActuals: m.isActual,
    }));
  }, [cashFlowView, cashFlowAnnual, cashFlowSeries]);

  // ─── Net worth chart ──────────────────────────────────────────────────────
  const nwGrowthData = projection.map((p) => ({
    year: p.year.toString(), netWorth: p.endNetWorth,
    assets: p.totalAssets, liabilities: p.totalLiabilities,
  }));

  const filteredNWData = useMemo(() => {
    const now = new Date().getFullYear();
    if (chartRange === "1Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 1);
    if (chartRange === "3Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 3);
    return nwGrowthData;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nwGrowthData, chartRange]);

  // ─── Wealth cards ─────────────────────────────────────────────────────────
  const wealthCards = useMemo(() => {
    const currentInvestable = snap.cash + snap.offset_balance + snap.super_balance + liveStocks + liveCrypto;
    const requiredFIRE = (10000 * 12) / 0.04;
    const fireProgress = Math.min(100, Math.round((currentInvestable / requiredFIRE) * 100));
    const totalMonthly = snap.monthly_expenses + snap.mortgage / 12;
    const monthsCovered = snap.cash / totalMonthly;
    const emergencyScore = Math.min(100, Math.round((monthsCovered / 6) * 100));
    const totalDebt = snap.mortgage + snap.other_debts;
    const debtToIncome = totalDebt / (snap.monthly_income * 12);
    const targetIP = 750000;
    const depositNeeded = targetIP * 0.2 + targetIP * 0.035;
    const depositReady = Math.min(100, Math.round(((snap.cash + snap.offset_balance) * 0.7 / depositNeeded) * 100));
    const currentInvestable2 = snap.cash + snap.offset_balance + snap.super_balance + liveStocks + liveCrypto;
    const targetFIRE = (8000 * 12) / 0.04;
    const monthlySaving = Math.max(surplus, 100);
    const r = 0.07 / 12;
    let months = 0;
    let accum = currentInvestable2;
    while (accum < targetFIRE && months < 600) { accum = accum * (1 + r) + monthlySaving; months++; }
    const fireAge = 36 + Math.round(months / 12);
    const hiddenMonthly = Math.round(snap.other_debts * 0.15 / 12 + Math.max(0, snap.cash - snap.monthly_expenses * 6) * 0.04 / 12);
    return [
      { label: "FIRE Progress", value: `${fireProgress}%`, sub: "of target capital", Icon: Flame, alert: fireProgress < 20, _pct: fireProgress },
      { label: "Emergency",     value: `${emergencyScore}/100`, sub: `${Math.round(monthsCovered)}mo covered`, Icon: Shield, alert: emergencyScore < 50 },
      { label: "Total Debt",    value: formatCurrency(totalDebt, true), sub: debtToIncome > 5 ? "High debt ratio" : "Manageable", Icon: Sword, alert: debtToIncome > 5 },
      { label: "IP Readiness",  value: `${depositReady}%`, sub: "deposit ready", Icon: Building2, alert: depositReady < 30, _pct: depositReady },
      { label: "FIRE Age",      value: `~${fireAge}`, sub: "est. financial freedom", Icon: Clock, alert: fireAge > 60 },
      { label: "Hidden Money",  value: `${formatCurrency(hiddenMonthly * 12, true)}/yr`, sub: "potential savings", Icon: Eye, alert: hiddenMonthly > 500 },
      { label: "Savings Rate",  value: `${savingsRate.toFixed(0)}%`, sub: savingsRate < 20 ? "Below target" : "On track", Icon: AlertTriangle, alert: savingsRate < 20 },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, surplus, savingsRate, stocksTotal, cryptoTotal]);

  const fireCard        = wealthCards.find(c => c.label === "FIRE Age");
  const fireProgress    = wealthCards.find(c => c.label === "FIRE Progress");
  const emergencyCard   = wealthCards.find(c => c.label === "Emergency");
  const debtCard        = wealthCards.find(c => c.label === "Total Debt");
  const ipCard          = wealthCards.find(c => c.label === "IP Readiness");
  const depositPct      = parseInt(ipCard?.value ?? "0");
  const firePct         = parseInt((fireProgress as any)?._pct ?? "0");
  const srPct           = savingsRate;

  // ─── Mission ──────────────────────────────────────────────────────────────
  const missionLabel = depositPct >= 80 ? "Prepare for IP #2 Settlement" : depositPct >= 50 ? "Build deposit for next IP" : "Grow wealth base & cashflow";
  const missionMonths = Math.max(1, Math.round((100 - depositPct) * 1.8));
  const missionContrib = Math.round(surplus * 0.7);

  // ─── Best move ────────────────────────────────────────────────────────────
  const offsetBalance = snap.offset_balance;
  const savingsIdleForOffset = snap.cash > snap.monthly_expenses * 6 ? snap.cash - snap.monthly_expenses * 6 : 0;
  const bestMoveTitle = offsetBalance > 0 && snap.mortgage > 0
    ? `Move $${Math.round(savingsIdleForOffset / 1000)}k to offset`
    : surplus > 4000 ? "Increase IP deposit savings" : "Review expense categories";
  const bestMoveImpact = offsetBalance > 0
    ? `Save ~$${Math.round(savingsIdleForOffset * 0.065 / 1000)}k/yr interest`
    : `$${Math.round(surplus * 0.3 / 1000)}k additional savings`;
  const bestMoveUrgency = surplus < 2000 ? "High" : "Medium";
  const bestMoveHref = snap.mortgage > 0 ? "/debt-strategy" : "/wealth-strategy";

  // ─── Risk score ───────────────────────────────────────────────────────────
  const riskScore = Math.min(100, Math.max(0, Math.round(
    50 + (savingsRate - 20) * 1.5 - (snap.other_debts > 50000 ? 15 : 0) + (firePct - 20) * 0.5
  )));
  const riskLabel = riskScore >= 70 ? "Strong" : riskScore >= 50 ? "Moderate" : "Watch";

  // ─── Smart actions ────────────────────────────────────────────────────────
  const smartActions = [
    offsetBalance > 0 && savingsIdleForOffset > 20000
      ? { rank: 1, title: `Offset $${Math.round(savingsIdleForOffset / 1000)}k → save $${Math.round(savingsIdleForOffset * 0.065 / 1000)}k/yr`, impact: `$${Math.round(savingsIdleForOffset * 0.065 / 1000)}k/yr interest saved`, difficulty: "Easy", time: "1 day", href: "/debt-strategy", priority: "high" as const }
      : null,
    surplus > 2000
      ? { rank: 2, title: `Extra $${Math.round(Math.min(surplus * 0.4, 2000)).toLocaleString()} mortgage → FIRE −2 yrs`, impact: "Reduce loan term, save interest", difficulty: "Easy", time: "1 week", href: "/debt-strategy", priority: "medium" as const }
      : null,
    { rank: 3, title: "Buy ETF monthly $2,000 DCA", impact: "Projected +$180k over 10 years", difficulty: "Easy", time: "Ongoing", href: "/stocks", priority: "medium" as const },
    emergencyCard?.alert
      ? { rank: 4, title: "Build emergency fund to 6mo", impact: `Currently ${emergencyCard?.sub}`, difficulty: "Medium", time: "6–12mo", href: "/expenses", priority: "high" as const }
      : { rank: 4, title: "Review recurring subscriptions", impact: "Potential $200–$500/mo savings", difficulty: "Easy", time: "1 hour", href: "/recurring-bills", priority: "low" as const },
    { rank: 5, title: "Refinance mortgage rate review", impact: "Current rates may save $3k–$8k/yr", difficulty: "Medium", time: "2–4 weeks", href: "/property", priority: "strategic" as const },
  ].filter(Boolean) as Array<{ rank: number; title: string; impact: string; difficulty: string; time: string; href: string; priority: string }>;

  // ─── Module tiles ─────────────────────────────────────────────────────────
  const deepModules = [
    { label: "Property",  href: "/property",         color: "hsl(188,60%,48%)", icon: "🏠" },
    { label: "Stocks",    href: "/stocks",            color: "hsl(43,85%,55%)",  icon: "📈" },
    { label: "Crypto",    href: "/crypto",            color: "hsl(260,60%,58%)", icon: "₿"  },
    { label: "Tax",       href: "/tax",               color: "hsl(145,55%,42%)", icon: "🧾" },
    { label: "Reports",   href: "/reports",           color: "hsl(210,75%,52%)", icon: "📊" },
    { label: "Scenarios", href: "/wealth-strategy",   color: "hsl(260,60%,58%)", icon: "🔮" },
    { label: "Expenses",  href: "/expenses",          color: "hsl(188,60%,48%)", icon: "💳" },
    { label: "Bills",     href: "/recurring-bills",   color: "hsl(5,70%,52%)",   icon: "📅" },
    { label: "AI Coach",  href: "/ai-insights",       color: "hsl(42,80%,52%)",  icon: "🤖" },
  ];

  // ─── Balance Sheet fields ─────────────────────────────────────────────────
  const snapFields = [
    { label: "PPOR",             key: "ppor",             group: "asset" },
    { label: "Cash (Everyday)",  key: "cash",             group: "asset" },
    { label: "Offset Balance",   key: "offset_balance",   group: "asset" },
    { label: "Super",            key: "super_balance",    group: "asset" },
    { label: "Cars",             key: "cars",             group: "asset" },
    { label: "Iran Property",    key: "iran_property",    group: "asset" },
    { label: "Mortgage",         key: "mortgage",         group: "liability" },
    { label: "Other Debts",      key: "other_debts",      group: "liability" },
    { label: "Monthly Income",   key: "monthly_income",   group: "income" },
    { label: "Monthly Expenses", key: "monthly_expenses", group: "expense" },
  ] as const;

  const handleSaveSnap = async () => {
    if (snapDraft) {
      await updateSnap.mutateAsync(snapDraft);
      setEditSnap(false);
      setSnapDraft(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="db-root">

      {/* ══════════════════════════════════════════════════════════════════
          ROW 1 — HERO BAR
          Slim premium strip: greeting · 5 KPIs · controls
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-hero">
        {/* Greeting */}
        <div className="db-hero-greeting">
          <span className="db-hero-hello">Hello,</span>
          <span className="db-hero-name">{currentUser === "Fara" ? "Fara" : "Roham"}</span>
          <span className={`db-hero-status ${savingsRate >= 20 ? "status-ok" : surplus > 0 ? "status-warn" : "status-alert"}`}>
            <span className="db-hero-dot" />
            {savingsRate >= 20 ? "On Track" : surplus > 0 ? "Watch" : "Attention"}
          </span>
        </div>

        {/* KPIs */}
        <div className="db-hero-kpis">
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Net Worth</span>
            <span className="db-kpi-val">{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Monthly Surplus</span>
            <span className={`db-kpi-val ${surplus >= 0 ? "val-green" : "val-red"}`}>
              {maskValue(formatCurrency(surplus, true), privacyMode)}
            </span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">2035 Projection</span>
            <span className="db-kpi-val val-blue">{maskValue(formatCurrency(year10NW, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">FIRE Age</span>
            <span className="db-kpi-val val-gold">{fireCard?.value ?? "—"}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Risk Score</span>
            <span className={`db-kpi-val ${riskScore >= 70 ? "val-green" : riskScore >= 50 ? "val-gold" : "val-red"}`}>
              {riskScore} <span className="db-kpi-sub-inline">{riskLabel}</span>
            </span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Best Move</span>
            <span className="db-kpi-val db-kpi-bestmove">{bestMoveTitle}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="db-hero-controls">
          <span className="db-hero-badge">
            {forecastMode === "monte-carlo" ? "Monte Carlo" : forecastMode === "year-by-year" ? "YoY" : profile.charAt(0).toUpperCase() + profile.slice(1)}
          </span>
          <button className="db-ctrl-btn" onClick={handleSyncFromCloud} disabled={syncing} title="Sync">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
          <button className="db-ctrl-btn" onClick={togglePrivacy} title={privacyMode ? "Show" : "Hide"}>
            {privacyMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 2 — MAIN GRID
          LEFT 70%: Chart card  |  RIGHT 30%: 3 stacked equal cards
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-main-grid">

        {/* LEFT — Wealth Intelligence Panel */}
        <div className="db-chart-card">
          {/* Header */}
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">
                {mainChartMode === "networth" ? "Net Worth Growth" : "Cashflow Forecast"}
              </div>
              <div className="db-chart-sub">
                {mainChartMode === "networth"
                  ? `${formatCurrency(netWorth, true)} → ${formatCurrency(year10NW, true)} projected`
                  : `Monthly surplus: ${maskValue(formatCurrency(surplus, true), privacyMode)}`
                }
              </div>
            </div>
            <div className="db-chart-controls">
              {/* Mode toggle */}
              <div className="db-toggle-group">
                <button className={`db-toggle-btn ${mainChartMode === "networth" ? "active" : ""}`} onClick={() => setMainChartMode("networth")}>Net Worth</button>
                <button className={`db-toggle-btn ${mainChartMode === "cashflow" ? "active" : ""}`} onClick={() => setMainChartMode("cashflow")}>Cashflow</button>
              </div>
              {/* Range (NW only) */}
              {mainChartMode === "networth" && (
                <div className="db-toggle-group">
                  {(["1Y","3Y","10Y","Scenario"] as const).map(r => (
                    <button key={r} className={`db-toggle-btn ${chartRange === r ? "active" : ""}`} onClick={() => setChartRange(r)}>{r}</button>
                  ))}
                </div>
              )}
              <Link href="/reports">
                <button className="db-expand-btn" title="Expand"><Maximize2 className="w-3.5 h-3.5" /></button>
              </Link>
            </div>
          </div>

          {/* Chart — fills card height */}
          <div className="db-chart-body">
            {mainChartMode === "networth" ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredNWData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gNW" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(210,75%,52%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAssets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(145,55%,42%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="assets"   name="Total Assets" stroke="hsl(145,55%,42%)" strokeWidth={1.5} fill="url(#gAssets)" dot={false} />
                  <Area type="monotone" dataKey="netWorth" name="Net Worth"     stroke="hsl(210,75%,52%)" strokeWidth={2.5} fill="url(#gNW)"     dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={masterCFData.slice(0, cashFlowView === "annual" ? 10 : 24)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cfI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(145,55%,42%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cfB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(260,60%,58%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(260,60%,58%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<CashflowTooltip />} />
                  <Area type="monotone" dataKey="income"   name="Income"       stroke="hsl(145,55%,42%)" strokeWidth={1.5} fill="url(#cfI)" dot={false} />
                  <Area type="monotone" dataKey="expenses" name="Expenses"     stroke="hsl(5,70%,52%)"   strokeWidth={1.5} fill="none"       dot={false} />
                  <Area type="monotone" dataKey="balance"  name="Cash Balance" stroke="hsl(260,60%,58%)" strokeWidth={2.5} fill="url(#cfB)" dot={false} />
                  <ReferenceLine y={0} stroke="hsl(222 15% 25%)" strokeDasharray="2 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend */}
          <div className="db-chart-legend">
            {mainChartMode === "networth" ? (
              <>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(210,75%,52%)" }} />Net Worth</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(145,55%,42%)" }} />Total Assets</div>
              </>
            ) : (
              <>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(145,55%,42%)" }} />Income</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(5,70%,52%)" }} />Expenses</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(260,60%,58%)" }} />Cash Balance</div>
              </>
            )}
          </div>

          {/* Notes below chart */}
          <div className="db-chart-notes">
            <span>Savings Rate <strong className={savingsRate >= 20 ? "text-green" : "text-gold"}>{savingsRate.toFixed(0)}%</strong></span>
            <span>Passive Income <strong className="val-blue">{maskValue(formatCurrency(passiveIncome, true), privacyMode)}/yr</strong></span>
            <span>Property Equity <strong>{maskValue(formatCurrency(propertyEquity, true), privacyMode)}</strong></span>
          </div>
        </div>

        {/* RIGHT — 3 stacked equal cards */}
        <div className="db-right-stack">

          {/* Card A — Current Mission */}
          <div className="db-stack-card db-mission-card">
            <div className="db-card-eyebrow">Active Mission</div>
            <div className="db-mission-title">{missionLabel}</div>
            <div className="db-mission-ring-row">
              <svg viewBox="0 0 64 64" className="db-ring-svg">
                <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(222 15% 18%)" strokeWidth="5" />
                <circle
                  cx="32" cy="32" r="26" fill="none"
                  stroke="hsl(42,80%,52%)" strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 26}`}
                  strokeDashoffset={`${2 * Math.PI * 26 * (1 - depositPct / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 32 32)"
                  style={{ filter: "drop-shadow(0 0 5px hsl(42 80% 52% / 0.5))" }}
                />
                <text x="32" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(215 20% 88%)">{depositPct}%</text>
                <text x="32" y="42" textAnchor="middle" fontSize="7" fill="hsl(215 12% 48%)">Deposit</text>
              </svg>
              <div className="db-mission-stats">
                <div className="db-mstat"><span className="db-mstat-lbl">Timeline</span><span className="db-mstat-val">{missionMonths}mo</span></div>
                <div className="db-mstat"><span className="db-mstat-lbl">Contribution</span><span className="db-mstat-val">{maskValue(formatCurrency(missionContrib, true), privacyMode)}/mo</span></div>
                <div className="db-mstat"><span className="db-mstat-lbl">Status</span><span className="db-mstat-val" style={{ color: depositPct >= 70 ? "hsl(145,55%,42%)" : "hsl(42,80%,52%)" }}>{depositPct >= 80 ? "Ready" : depositPct >= 50 ? "Near" : "Building"}</span></div>
              </div>
            </div>
            <Link href="/financial-plan"><button className="db-card-cta">View Plan →</button></Link>
          </div>

          {/* Card B — Best Move */}
          <div className="db-stack-card db-bestmove-card">
            <div className="db-card-eyebrow db-eyebrow-green">Best Move Now</div>
            <div className="db-bm-move-row">
              <Zap className="db-bm-zap" />
              <span className="db-bm-title">{bestMoveTitle}</span>
            </div>
            <div className="db-bm-impact">
              <span className="db-bm-impact-lbl">Impact</span>
              <span className="db-bm-impact-val">{maskValue(bestMoveImpact, privacyMode)}</span>
            </div>
            <div className="db-bm-meta-row">
              <div className="db-bm-chip">
                <span>Urgency</span>
                <strong className={bestMoveUrgency === "High" ? "val-red" : "val-gold"}>{bestMoveUrgency}</strong>
              </div>
              <div className="db-bm-chip">
                <span>Difficulty</span>
                <strong style={{ color: "hsl(215 12% 65%)" }}>Easy</strong>
              </div>
            </div>
            <Link href={bestMoveHref}><button className="db-card-cta db-cta-green">Take Action →</button></Link>
          </div>

          {/* Card C — Risk Status */}
          <div className="db-stack-card db-risk-card">
            <div className="db-card-eyebrow">Risk Status</div>
            <div className="db-risk-score-row">
              <span className="db-risk-number" style={{ color: riskScore >= 70 ? "hsl(145,55%,42%)" : riskScore >= 50 ? "hsl(42,80%,52%)" : "hsl(5,70%,52%)" }}>{riskScore}</span>
              <span className="db-risk-label" style={{ color: riskScore >= 70 ? "hsl(145,55%,42%)" : riskScore >= 50 ? "hsl(42,80%,52%)" : "hsl(5,70%,52%)" }}>{riskLabel}</span>
            </div>
            {/* Risk bar */}
            <div className="db-risk-track"><div className="db-risk-fill" style={{ width: `${riskScore}%`, background: riskScore >= 70 ? "hsl(145,55%,42%)" : riskScore >= 50 ? "hsl(42,80%,52%)" : "hsl(5,70%,52%)" }} /></div>
            <div className="db-risk-factors">
              <div className="db-rfactor"><span className="db-rfact-lbl">Savings Rate</span><span className={savingsRate >= 20 ? "val-green db-rfact-val" : "val-red db-rfact-val"}>{savingsRate.toFixed(0)}%</span></div>
              <div className="db-rfactor"><span className="db-rfact-lbl">Emergency Fund</span><span className={!emergencyCard?.alert ? "val-green db-rfact-val" : "val-red db-rfact-val"}>{emergencyCard?.sub}</span></div>
              <div className="db-rfactor"><span className="db-rfact-lbl">Debt Ratio</span><span className={!debtCard?.alert ? "val-green db-rfact-val" : "val-red db-rfact-val"}>{debtCard?.sub}</span></div>
            </div>
            <Link href="/wealth-strategy"><button className="db-card-cta">Risk Report →</button></Link>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 3 — QUICK INSIGHTS
          6 same-size compact metric cards
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-section-head">
          <span className="db-section-lbl">Wealth Intelligence</span>
          <Link href="/data-health"><span className="db-section-link">Data Health →</span></Link>
        </div>
        <div className="db-insights-grid">

          {/* 1 — Cash */}
          <div className="db-insight-card">
            <div className="db-ic-header">
              <DollarSign className="db-ic-icon" style={{ color: "hsl(210,75%,52%)" }} />
              <span className="db-ic-title">Cash Position</span>
              <span className={`db-ic-badge ${snap.cash > snap.monthly_expenses * 3 ? "badge-ok" : "badge-warn"}`}>
                {snap.cash > snap.monthly_expenses * 3 ? "Healthy" : "Low"}
              </span>
            </div>
            <div className="db-ic-value">{maskValue(formatCurrency(snap.cash + snap.offset_balance, true), privacyMode)}</div>
            <div className="db-ic-sub">Cash + {formatCurrency(snap.offset_balance, true)} offset</div>
            <div className="db-ic-bar-wrap">
              <div className="db-ic-bar-track"><div className="db-ic-bar-fill" style={{ width: `${Math.min(100, (snap.cash / (snap.monthly_expenses * 6)) * 100)}%`, background: "hsl(210,75%,52%)" }} /></div>
              <span className="db-ic-bar-lbl">{Math.round(snap.cash / (snap.monthly_expenses || 1))}mo buffer</span>
            </div>
          </div>

          {/* 2 — Debt */}
          <div className="db-insight-card">
            <div className="db-ic-header">
              <CreditCard className="db-ic-icon" style={{ color: debtCard?.alert ? "hsl(5,70%,52%)" : "hsl(145,55%,42%)" }} />
              <span className="db-ic-title">Debt Health</span>
              <span className={`db-ic-badge ${debtCard?.alert ? "badge-warn" : "badge-ok"}`}>{debtCard?.alert ? "High" : "OK"}</span>
            </div>
            <div className="db-ic-value">{maskValue(formatCurrency(snap.mortgage + snap.other_debts, true), privacyMode)}</div>
            <div className="db-ic-sub">Mortgage + {formatCurrency(snap.other_debts, true)} other</div>
            <div className="db-ic-bar-wrap">
              <div className="db-ic-bar-track"><div className="db-ic-bar-fill" style={{ width: `${Math.min(100, (snap.mortgage / (totalAssets || 1)) * 100)}%`, background: debtCard?.alert ? "hsl(5,70%,52%)" : "hsl(145,55%,42%)" }} /></div>
              <span className="db-ic-bar-lbl">{Math.round((snap.mortgage / (totalAssets || 1)) * 100)}% LVR</span>
            </div>
          </div>

          {/* 3 — Savings Rate */}
          <div className="db-insight-card">
            <div className="db-ic-header">
              <PiggyBank className="db-ic-icon" style={{ color: savingsRate >= 20 ? "hsl(145,55%,42%)" : "hsl(42,80%,52%)" }} />
              <span className="db-ic-title">Savings Rate</span>
              <span className={`db-ic-badge ${savingsRate >= 20 ? "badge-ok" : "badge-warn"}`}>{savingsRate >= 20 ? "On Track" : "Below"}</span>
            </div>
            <div className="db-ic-value" style={{ color: savingsRate >= 20 ? "hsl(145,55%,42%)" : "hsl(42,80%,52%)" }}>{savingsRate.toFixed(1)}%</div>
            <div className="db-ic-sub">{maskValue(formatCurrency(surplus, true), privacyMode)}/mo surplus · target 20%</div>
            <div className="db-ic-bar-wrap">
              <div className="db-ic-bar-track"><div className="db-ic-bar-fill" style={{ width: `${Math.min(100, savingsRate * 3)}%`, background: savingsRate >= 20 ? "hsl(145,55%,42%)" : "hsl(42,80%,52%)" }} /></div>
              <span className="db-ic-bar-lbl">{savingsRate.toFixed(0)}% of 33% max</span>
            </div>
          </div>

          {/* 4 — Property Equity */}
          <div className="db-insight-card">
            <div className="db-ic-header">
              <Home className="db-ic-icon" style={{ color: "hsl(188,60%,48%)" }} />
              <span className="db-ic-title">Property Equity</span>
              <span className={`db-ic-badge ${propertyEquity > 0 ? "badge-ok" : "badge-warn"}`}>{propertyEquity > 0 ? "Positive" : "Negative"}</span>
            </div>
            <div className="db-ic-value">{maskValue(formatCurrency(propertyEquity, true), privacyMode)}</div>
            <div className="db-ic-sub">PPOR {maskValue(formatCurrency(snap.ppor, true), privacyMode)} − Mortgage {maskValue(formatCurrency(snap.mortgage, true), privacyMode)}</div>
            <div className="db-ic-bar-wrap">
              <div className="db-ic-bar-track"><div className="db-ic-bar-fill" style={{ width: `${Math.min(100, Math.max(0, (propertyEquity / snap.ppor) * 100))}%`, background: "hsl(188,60%,48%)" }} /></div>
              <span className="db-ic-bar-lbl">{Math.round((propertyEquity / (snap.ppor || 1)) * 100)}% owned</span>
            </div>
          </div>

          {/* 5 — Tax Savings */}
          <div className="db-insight-card">
            <div className="db-ic-header">
              <Receipt className="db-ic-icon" style={{ color: "hsl(145,55%,42%)" }} />
              <span className="db-ic-title">Tax Savings</span>
              <span className="db-ic-badge badge-ok">Active</span>
            </div>
            <div className="db-ic-value val-green">{formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}/yr</div>
            <div className="db-ic-sub">Negative gearing tax benefit</div>
            <div className="db-ic-bar-wrap">
              <div className="db-ic-bar-track"><div className="db-ic-bar-fill" style={{ width: `${Math.min(100, (ngSummary.totalAnnualTaxBenefit / 20000) * 100)}%`, background: "hsl(145,55%,42%)" }} /></div>
              <span className="db-ic-bar-lbl">NG benefit</span>
            </div>
          </div>

          {/* 6 — Passive Income */}
          <div className="db-insight-card">
            <div className="db-ic-header">
              <TrendingUp className="db-ic-icon" style={{ color: "hsl(260,60%,58%)" }} />
              <span className="db-ic-title">Passive Income</span>
              <span className={`db-ic-badge ${passiveIncome > 0 ? "badge-ok" : "badge-neutral"}`}>{passiveIncome > 0 ? "Active" : "Building"}</span>
            </div>
            <div className="db-ic-value" style={{ color: "hsl(260,60%,58%)" }}>{maskValue(formatCurrency(passiveIncome, true), privacyMode)}/yr</div>
            <div className="db-ic-sub">Rental + dividends · target $120k/yr</div>
            <div className="db-ic-bar-wrap">
              <div className="db-ic-bar-track"><div className="db-ic-bar-fill" style={{ width: `${Math.min(100, (passiveIncome / 120000) * 100)}%`, background: "hsl(260,60%,58%)" }} /></div>
              <span className="db-ic-bar-lbl">{Math.round((passiveIncome / 120000) * 100)}% of FIRE income</span>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 4 — ACTION CENTER + BALANCE SHEET
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-two-col">

          {/* Smart Actions Table */}
          <div className="db-actions-card">
            <div className="db-actions-head">
              <div>
                <div className="db-actions-title">Action Center</div>
                <div className="db-actions-sub">Top opportunities ranked by ROI</div>
              </div>
              <Link href="/ai-insights"><span className="db-section-link">AI Insights →</span></Link>
            </div>
            <table className="db-action-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Impact</th>
                  <th>Difficulty</th>
                  <th>Time</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {smartActions.map((action, idx) => (
                  <tr key={idx} className={`db-action-row priority-${action.priority}`} onClick={() => window.location.hash = `#${action.href}`} style={{ cursor: "pointer" }}>
                    <td className="db-act-rank">{idx + 1}</td>
                    <td className="db-act-title">{action.title}</td>
                    <td className="db-act-impact">{action.impact}</td>
                    <td className="db-act-meta">{action.difficulty}</td>
                    <td className="db-act-meta">{action.time}</td>
                    <td><span className={`db-priority-badge priority-badge-${action.priority}`}>{action.priority}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Balance Sheet */}
          <div className="db-balance-card" ref={snapContainerRef}>
            <div className="db-balance-head">
              <div>
                <div className="db-balance-title">Balance Sheet</div>
                <div className="db-balance-sub">Net Worth: {maskValue(formatCurrency(netWorth, true), privacyMode)}</div>
              </div>
              <button
                className="db-edit-btn"
                onClick={() => { setEditSnap(!editSnap); if (!editSnap && !snapDraft) setSnapDraft({ ...snap }); }}
              >
                <Edit2 className="w-3 h-3 mr-1" />{editSnap ? "Cancel" : "Edit"}
              </button>
            </div>
            {!editSnap ? (
              <div className="db-bs-grid">
                <div>
                  <div className="db-bs-section-lbl">Assets</div>
                  {[
                    ["PPOR",         snap.ppor],
                    ["Cash + Offset", snap.cash + snap.offset_balance],
                    ["Super",        _totalSuperNow],
                    ["Stocks",       liveStocks],
                    ["Crypto",       liveCrypto],
                    ["Other",        snap.cars + snap.iran_property],
                  ].filter(([,v]) => (v as number) > 0).map(([label, value]) => (
                    <div key={label as string} className="db-bs-row">
                      <span className="db-bs-lbl">{label as string}</span>
                      <span className="db-bs-val">{maskValue(formatCurrency(value as number, true), privacyMode)}</span>
                    </div>
                  ))}
                  <div className="db-bs-total">
                    <span>Total Assets</span>
                    <span>{maskValue(formatCurrency(totalAssets, true), privacyMode)}</span>
                  </div>
                </div>
                <div>
                  <div className="db-bs-section-lbl db-bs-liab-lbl">Liabilities</div>
                  {[
                    ["Mortgage",    snap.mortgage],
                    ["Other Debts", snap.other_debts],
                  ].filter(([,v]) => (v as number) > 0).map(([label, value]) => (
                    <div key={label as string} className="db-bs-row">
                      <span className="db-bs-lbl">{label as string}</span>
                      <span className="db-bs-val val-red">{maskValue(formatCurrency(value as number, true), privacyMode)}</span>
                    </div>
                  ))}
                  <div className="db-bs-total db-bs-nw-total">
                    <span>Net Worth</span>
                    <span className="val-blue">{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="db-snap-edit-grid">
                {snapFields.map(({ label, key }) => (
                  <div key={key} className="db-snap-field">
                    <label className="db-snap-lbl">{label}</label>
                    <Input
                      type="number"
                      className="h-7 text-xs"
                      value={snapDraft?.[key] ?? ""}
                      onChange={(e) => setSnapDraft((d: any) => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                ))}
                <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                  <SaveButton onSave={handleSaveSnap} className="h-7 text-xs" />
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 5 — MODULE ACCESS + WIDGETS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-section-head">
          <span className="db-section-lbl">Modules</span>
        </div>
        <div className="db-modules-grid">
          {deepModules.map((mod) => (
            <Link key={mod.href} href={mod.href}>
              <div className="db-mod-tile">
                <span className="db-mod-icon" style={{ color: mod.color }}>{mod.icon}</span>
                <span className="db-mod-label">{mod.label}</span>
                <ChevronRight className="db-mod-arrow" />
              </div>
            </Link>
          ))}
        </div>

        {/* Live widgets row */}
        <div className="db-widgets-row">
          <PortfolioLiveReturn />
          <CFODashboardWidget />
        </div>
      </div>

    </div>
  );
}
