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
import { runCashEngine, getCashKPICards, type CashEvent } from "@/lib/cashEngine";
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
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
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
  Briefcase,
  Calendar,
  Landmark,
  TrendingDown,
  Star,
  Activity,
  Info,
  CheckCircle2,
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
    { label: "Salary / Income",     value: d.income    ?? 0, color: "hsl(142,60%,45%)" },
    { label: "Rental Income",       value: d.rental    ?? 0, color: "hsl(188,60%,48%)" },
    { label: "Living Expenses",     value: -(d.expenses ?? 0), color: "hsl(0,72%,51%)" },
    { label: "Mortgage Repayments", value: -(d.mortgage ?? 0), color: "hsl(20,80%,55%)" },
    { label: "NG Tax Refund",       value: d.ngRefund  ?? 0, color: "hsl(43,85%,55%)" },
    { label: "Net Cashflow",        value: d.netCF     ?? 0, color: (d.netCF ?? 0) >= 0 ? "hsl(142,60%,45%)" : "hsl(0,72%,51%)" },
    { label: "Ending Cash Balance", value: d.balance   ?? 0, color: "hsl(270,60%,60%)" },
  ].filter(r => r.value !== 0);
  return (
    <div className="db-tooltip" style={{ minWidth: 220 }}>
      <p className="db-tooltip-label">{label}</p>
      {rows.map((r, i) => (
        <div key={i} className="db-tooltip-row" style={{ color: r.color, display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span>{r.label}</span>
          <span className="font-mono">{r.value >= 0 ? "+" : ""}{formatCurrency(r.value, true)}</span>
        </div>
      ))}
      {d._events?.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid hsl(222 15% 22%)" }}>
          {d._events.map((ev: string, i: number) => (
            <div key={i} style={{ fontSize: 10, color: "hsl(42,80%,60%)", marginTop: 2 }}>⚡ {ev}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const DonutTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="db-tooltip">
      <p className="db-tooltip-label">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }} className="db-tooltip-row">
        {formatCurrency(payload[0].value, true)} ({payload[0].payload.pct?.toFixed(1)}%)
      </p>
    </div>
  );
};

// ─── Custom event dot for CF chart ───────────────────────────────────────────
const EventDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload?._hasEvent) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="hsl(42,80%,52%)" stroke="hsl(222,22%,7%)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={3} fill="hsl(222,22%,7%)" />
    </g>
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
  const [mainChartMode, setMainChartMode] = useState<"networth" | "cashflow">("cashflow");
  const [cfChartAnnotations, setCfChartAnnotations] = useState(true);
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

  const { data: snapshot, isLoading: snapLoading } = useQuery({
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
  const { data: ordersRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-orders"],
    queryFn: () => apiRequest("GET", "/api/stock-orders").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoOrdersRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-orders"],
    queryFn: () => apiRequest("GET", "/api/crypto-orders").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then((r) => r.json()),
    staleTime: 0,
  });

  const updateSnap = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/snapshot", data).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/snapshot"] }),
  });

  // ─── Derived data ─────────────────────────────────────────────────────────
  const plannedStockTx = useMemo(() => (stockTransactionsRaw ?? []).filter((t: any) => t.status === "planned"), [stockTransactionsRaw]);
  const plannedCryptoTx = useMemo(() => (cryptoTransactionsRaw ?? []).filter((t: any) => t.status === "planned"), [cryptoTransactionsRaw]);
  const plannedStockOrders = useMemo(() => (ordersRaw ?? []).filter((o: any) => o.status !== "cancelled"), [ordersRaw]);
  const plannedCryptoOrders = useMemo(() => (cryptoOrdersRaw ?? []).filter((o: any) => o.status !== "cancelled"), [cryptoOrdersRaw]);

  const snap = useMemo(() => {
    const s = snapshot ?? {};
    return {
      ppor:             safeNum(s.ppor),
      cash:             safeNum(s.cash),
      offset_balance:   safeNum(s.offset_balance),
      super_balance:    safeNum(s.super_balance),
      super_roham:      safeNum(s.super_roham ?? s.super_balance),
      super_fara:       safeNum(s.super_fara),
      cars:             safeNum(s.cars),
      iran_property:    safeNum(s.iran_property),
      mortgage:         safeNum(s.mortgage),
      other_debts:      safeNum(s.other_debts),
      monthly_income:   safeNum(s.monthly_income),
      monthly_expenses: safeNum(s.monthly_expenses),
      mortgage_rate:    safeNum(s.mortgage_rate) || 6.5,
      mortgage_term_years: safeNum(s.mortgage_term_years) || 30,
    };
  }, [snapshot]);

  // Live stocks / crypto from holdings
  const liveStocks = useMemo(() =>
    (holdingsRaw ?? []).filter((h: any) => h.asset_type === "stock").reduce((sum: number, h: any) => sum + safeNum(h.current_value), 0),
    [holdingsRaw]);
  const liveCrypto = useMemo(() =>
    (holdingsRaw ?? []).filter((h: any) => h.asset_type === "crypto").reduce((sum: number, h: any) => sum + safeNum(h.current_value), 0),
    [holdingsRaw]);
  const stocksTotal = liveStocks || (stocks ?? []).reduce((s: number, x: any) => s + safeNum(x.current_value), 0);
  const cryptoTotal = liveCrypto || (cryptos ?? []).reduce((s: number, x: any) => s + safeNum(x.current_value), 0);

  const _totalSuperNow = snap.super_roham + snap.super_fara;

  // ─── Core financials ──────────────────────────────────────────────────────
  const totalAssets   = snap.ppor + snap.cash + snap.offset_balance + _totalSuperNow + stocksTotal + cryptoTotal + snap.cars + snap.iran_property;
  const totalLiab     = snap.mortgage + snap.other_debts;
  const netWorth      = totalAssets - totalLiab;
  const propertyEquity = snap.ppor - snap.mortgage;
  const surplus       = snap.monthly_income - snap.monthly_expenses - (snap.mortgage / 12);
  const savingsRate   = calcSavingsRate(snap.monthly_income, surplus);

  // ─── NG Summary ───────────────────────────────────────────────────────────
  const ngSummary = useMemo<NGSummary>(() =>
    calcNegativeGearing({ properties, annualSalaryIncome: snap.monthly_income * 12, refundMode: ngRefundMode }),
    [properties, snap.monthly_income, ngRefundMode]
  );

  // ─── Projection ───────────────────────────────────────────────────────────
  const projection = useMemo(() =>
    projectNetWorth({
      snap: { ...snap, offset_balance: snap.offset_balance },
      expenses, properties, stocks: stocksTotal, crypto: cryptoTotal,
      plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules,
      plannedStockOrders, plannedCryptoOrders, fa,
      ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
    }),
    [snap, properties, stocks, cryptos, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, expenses, billsRaw, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );
  const year10NW      = projection[9]?.endNetWorth || netWorth;
  const passiveIncome = projection[0]?.passiveIncome || 0;

  // ─── Cash engine with events ──────────────────────────────────────────────
  const cashEngineResult = useMemo(() => {
    try {
      return runCashEngine({
        snap, expenses, properties,
        plannedStockTx, plannedCryptoTx,
        stockDCASchedules, cryptoDCASchedules,
        plannedStockOrders, plannedCryptoOrders,
        fa, ngRefundMode,
        ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      });
    } catch { return null; }
  }, [snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);

  // ─── NW chart data ────────────────────────────────────────────────────────
  const nwGrowthData = useMemo(() => {
    const now = new Date().getFullYear();
    return projection.map((p: any, i: number) => ({
      year: String(now + i),
      netWorth: p.endNetWorth,
      assets: p.endAssets ?? (p.endNetWorth + snap.mortgage),
    }));
  }, [projection, snap.mortgage]);

  const filteredNWData = useMemo(() => {
    const now = new Date().getFullYear();
    if (chartRange === "1Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 1);
    if (chartRange === "3Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 3);
    return nwGrowthData;
  }, [nwGrowthData, chartRange]);

  // ─── Cashflow series ──────────────────────────────────────────────────────
  const cashFlowSeries = useMemo(
    () => buildCashFlowSeries({
      snap, expenses, properties,
      plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules,
      plannedStockOrders, plannedCryptoOrders, fa,
      ngRefundMode, ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
    }),
    [snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]
  );
  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

  // ─── Master CF data with event markers ───────────────────────────────────
  // Build a lookup of monthKey → [event labels] from the cash engine events
  const eventsByMonthKey = useMemo<Record<string, string[]>>(() => {
    const events: CashEvent[] = cashEngineResult?.events ?? [];
    const lookup: Record<string, string[]> = {};
    const SHOW_TYPES = new Set(["property_purchase", "tax_refund", "rental_income"]);
    for (const ev of events) {
      if (!SHOW_TYPES.has(ev.type)) continue;
      if (!lookup[ev.monthKey]) lookup[ev.monthKey] = [];
      lookup[ev.monthKey].push(ev.label);
    }
    return lookup;
  }, [cashEngineResult]);

  const masterCFData = useMemo(() => {
    if (cashFlowView === "annual") {
      return cashFlowAnnual.map((a: any) => ({
        label:    a.year ? String(a.year) : a.label,
        income:   a.income ?? 0,
        expenses: a.totalExpenses ?? 0,
        mortgage: a.mortgageRepayment ?? 0,
        rental:   a.rentalIncome ?? 0,
        ngRefund: a.ngTaxBenefit ?? 0,
        netCF:    a.netCashFlow ?? 0,
        balance:  a.endingBalance ?? 0,
        _hasEvent: false,
        _events:   [] as string[],
      }));
    }
    return cashFlowSeries.map((m: any) => {
      const key = m.monthKey ?? m.label;
      const evts = eventsByMonthKey[key] ?? [];
      return {
        label:    m.label,
        income:   m.income   ?? 0,
        expenses: m.totalExpenses ?? 0,
        mortgage: m.mortgageRepayment ?? 0,
        rental:   m.rentalIncome ?? 0,
        ngRefund: m.ngTaxBenefit ?? 0,
        netCF:    m.netCashFlow ?? 0,
        balance:  m.cumulativeBalance ?? m.endingBalance ?? 0,
        _hasEvent: evts.length > 0,
        _events:   evts,
      };
    });
  }, [cashFlowView, cashFlowAnnual, cashFlowSeries, eventsByMonthKey]);

  // ─── Property purchase event reference lines ──────────────────────────────
  const propertyEventLines = useMemo(() => {
    if (cashFlowView === "annual" || !cfChartAnnotations) return [];
    const lines: Array<{ index: number; label: string; color: string }> = [];
    masterCFData.forEach((d: any, i: number) => {
      if (d._hasEvent) {
        const isIP = d._events.some((e: string) => e.toLowerCase().includes("purchase") || e.toLowerCase().includes("ip") || e.toLowerCase().includes("settlement"));
        const isTax = d._events.some((e: string) => e.toLowerCase().includes("tax") || e.toLowerCase().includes("refund"));
        const isRental = d._events.some((e: string) => e.toLowerCase().includes("rental") || e.toLowerCase().includes("rent"));
        lines.push({
          index: i,
          label: d._events[0],
          color: isIP ? "hsl(188,60%,48%)" : isTax ? "hsl(43,85%,55%)" : isRental ? "hsl(145,55%,42%)" : "hsl(260,60%,58%)",
        });
      }
    });
    return lines.slice(0, 8); // cap at 8 markers
  }, [masterCFData, cashFlowView, cfChartAnnotations]);

  // ─── Wealth cards ─────────────────────────────────────────────────────────
  const wealthCards = useMemo(() => {
    const currentInvestable = snap.cash + snap.offset_balance + _totalSuperNow + stocksTotal + cryptoTotal;
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
    const currentInvestable2 = snap.cash + snap.offset_balance + _totalSuperNow + stocksTotal + cryptoTotal;
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
  }, [snap, surplus, savingsRate, stocksTotal, cryptoTotal]);

  const fireCard        = wealthCards.find(c => c.label === "FIRE Age");
  const fireProgress    = wealthCards.find(c => c.label === "FIRE Progress");
  const emergencyCard   = wealthCards.find(c => c.label === "Emergency");
  const debtCard        = wealthCards.find(c => c.label === "Total Debt");
  const ipCard          = wealthCards.find(c => c.label === "IP Readiness");
  const depositPct      = parseInt(ipCard?.value ?? "0");
  const firePct         = parseInt(String((fireProgress as any)?._pct ?? "0"));
  const srPct           = savingsRate;

  // ─── Mission ──────────────────────────────────────────────────────────────
  const missionLabel    = depositPct >= 80 ? "Prepare for IP #2 Settlement" : depositPct >= 50 ? "Build deposit for next IP" : "Grow wealth base & cashflow";
  const missionMonths   = Math.max(1, Math.round((100 - depositPct) * 1.8));
  const missionContrib  = Math.round(surplus * 0.7);

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

  // ─── Asset allocation donut data ──────────────────────────────────────────
  const assetAllocData = useMemo(() => {
    const items = [
      { name: "PPOR",    value: snap.ppor,            fill: "hsl(188,60%,48%)" },
      { name: "Cash",    value: snap.cash + snap.offset_balance, fill: "hsl(210,75%,52%)" },
      { name: "Super",   value: _totalSuperNow,       fill: "hsl(43,85%,55%)" },
      { name: "Stocks",  value: stocksTotal,          fill: "hsl(145,55%,42%)" },
      { name: "Crypto",  value: cryptoTotal,          fill: "hsl(260,60%,58%)" },
      { name: "Other",   value: snap.cars + snap.iran_property, fill: "hsl(222,15%,40%)" },
    ].filter(x => x.value > 0);
    return items.map(x => ({ ...x, pct: (x.value / (totalAssets || 1)) * 100 }));
  }, [snap, _totalSuperNow, stocksTotal, cryptoTotal, totalAssets]);

  // ─── Expense breakdown data ───────────────────────────────────────────────
  const expenseBreakdown = useMemo(() => {
    const cats: Record<string, number> = {};
    (expenses ?? []).forEach((e: any) => {
      const cat = e.category || "Other";
      cats[cat] = (cats[cat] || 0) + safeNum(e.monthly_amount || e.amount);
    });
    if (snap.mortgage > 0) cats["Mortgage"] = (cats["Mortgage"] || 0) + snap.mortgage / 12;
    return Object.entries(cats).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [expenses, snap.mortgage]);

  // ─── NG per-property display ──────────────────────────────────────────────
  const ngProperties = useMemo(() => {
    return (ngSummary.perProperty ?? []).map((p: any) => ({
      name: p.name || "Property",
      annualBenefit: p.annualTaxBenefit ?? 0,
      monthlyHolding: p.monthlyAfterTaxCost ?? 0,
      rentalYield: p.grossRentalYield ?? 0,
    }));
  }, [ngSummary]);

  // ─── FIRE calc ────────────────────────────────────────────────────────────
  const fireTargetAmt = (8000 * 12) / 0.04;
  const fireCurrentAmt = snap.cash + snap.offset_balance + _totalSuperNow + stocksTotal + cryptoTotal;
  const fireProgressPct = Math.min(100, (fireCurrentAmt / fireTargetAmt) * 100);
  const fireGap = Math.max(0, fireTargetAmt - fireCurrentAmt);
  const fireMonthlyNeeded = fireGap > 0 ? Math.round(fireGap * 0.07 / 12 / ((Math.pow(1.07 / 12 + 1, Math.max(1, (parseInt(fireCard?.value?.replace("~", "") ?? "55")) * 12 - 36 * 12)) - 1) / (0.07 / 12))) : 0;

  // ─── Year-by-year table ───────────────────────────────────────────────────
  const yrRows = useMemo(() => {
    const now = new Date().getFullYear();
    return projection.slice(0, 10).map((p: any, i: number) => ({
      year: now + i,
      nw:   p.endNetWorth,
      assets: p.endAssets ?? (p.endNetWorth + snap.mortgage * Math.pow(0.97, i)),
      liab:  p.endLiabilities ?? (snap.mortgage * Math.pow(0.97, i)),
      passive: p.passiveIncome ?? 0,
      surplus:  p.yearlySurplus ?? (surplus * 12),
    }));
  }, [projection, snap.mortgage, surplus]);

  // ─── Loading guard (MUST come after ALL hooks) ───────────────────────────
  if (snapLoading || !snapshot) {
    return (
      <div className="db-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ textAlign: "center", color: "hsl(215 12% 48%)" }}>
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: "hsl(var(--gold))" }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Loading your wealth data…</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Connecting to Supabase</div>
        </div>
      </div>
    );
  }

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
            <span className="db-kpi-lbl">Total Investments</span>
            <span className="db-kpi-val val-gold">{maskValue(formatCurrency(stocksTotal + cryptoTotal, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Property Equity</span>
            <span className="db-kpi-val val-blue">{maskValue(formatCurrency(propertyEquity, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Debt Balance</span>
            <span className="db-kpi-val val-red">{maskValue(formatCurrency(totalLiab, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">2035 Forecast</span>
            <span className="db-kpi-val val-blue">{maskValue(formatCurrency(year10NW, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Passive Income</span>
            <span className="db-kpi-val" style={{ color: "hsl(260,60%,68%)" }}>{maskValue(formatCurrency(passiveIncome, true), privacyMode)}/yr</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Super</span>
            <span className="db-kpi-val val-gold">{maskValue(formatCurrency(_totalSuperNow, true), privacyMode)}</span>
          </div>
          <div className="db-hero-sep" />
          <div className="db-hero-kpi">
            <span className="db-kpi-lbl">Savings Rate</span>
            <span className={`db-kpi-val ${savingsRate >= 20 ? "val-green" : "val-gold"}`}>{savingsRate.toFixed(0)}%</span>
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
          ROW 2 — MAIN GRID (70/30)
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
              <div className="db-toggle-group">
                <button className={`db-toggle-btn ${mainChartMode === "networth" ? "active" : ""}`} onClick={() => setMainChartMode("networth")}>Net Worth</button>
                <button className={`db-toggle-btn ${mainChartMode === "cashflow" ? "active" : ""}`} onClick={() => setMainChartMode("cashflow")}>Cashflow</button>
              </div>
              {mainChartMode === "networth" && (
                <div className="db-toggle-group">
                  {(["1Y","3Y","10Y","Scenario"] as const).map(r => (
                    <button key={r} className={`db-toggle-btn ${chartRange === r ? "active" : ""}`} onClick={() => setChartRange(r)}>{r}</button>
                  ))}
                </div>
              )}
              {mainChartMode === "cashflow" && (
                <button
                  className={`db-toggle-btn ${cfChartAnnotations ? "active" : ""}`}
                  onClick={() => setCfChartAnnotations(v => !v)}
                  title="Toggle event markers"
                  style={{ fontSize: 10, padding: "2px 8px" }}
                >
                  Events
                </button>
              )}
              <Link href="/reports">
                <button className="db-expand-btn" title="Expand"><Maximize2 className="w-3.5 h-3.5" /></button>
              </Link>
            </div>
          </div>

          {/* Chart */}
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
                <LineChart
                  data={masterCFData.slice(0, cashFlowView === "annual" ? 10 : 24)}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "hsl(215 12% 48%)" }}
                    axisLine={false} tickLine={false}
                    interval={cashFlowView === "annual" ? 0 : 2}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }}
                    axisLine={false} tickLine={false} width={52}
                  />
                  <Tooltip content={<CashflowTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(222 15% 25%)" strokeDasharray="2 2" />
                  {/* Event reference lines */}
                  {cfChartAnnotations && propertyEventLines.map((ev, i) => (
                    <ReferenceLine
                      key={i}
                      x={masterCFData[ev.index]?.label}
                      stroke={ev.color}
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                      label={{ value: ev.label.length > 14 ? ev.label.slice(0, 14) + "…" : ev.label, position: "insideTopRight", fontSize: 8, fill: ev.color }}
                    />
                  ))}
                  <Line type="monotone" dataKey="income"   name="Income"          stroke="hsl(145,55%,48%)" strokeWidth={2}   dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="expenses" name="Living Expenses"  stroke="hsl(5,70%,52%)"   strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="mortgage" name="Mortgage"         stroke="hsl(20,80%,55%)"  strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                  <Line type="monotone" dataKey="rental"   name="Rental Income"   stroke="hsl(188,60%,48%)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="ngRefund" name="NG Refund"        stroke="hsl(43,85%,55%)"  strokeWidth={1.5} dot={false} strokeDasharray="2 3" />
                  <Line type="monotone" dataKey="netCF"    name="Net Cashflow"    stroke="hsl(260,60%,58%)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="balance"  name="Cash Balance"    stroke="hsl(210,75%,60%)" strokeWidth={2}   dot={<EventDot />} strokeDasharray="6 2" />
                </LineChart>
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
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(145,55%,48%)" }} />Income</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(5,70%,52%)" }} />Expenses</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(20,80%,55%)" }} />Mortgage</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(188,60%,48%)" }} />Rental</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(43,85%,55%)" }} />NG Refund</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(260,60%,58%)" }} />Net CF</div>
                <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(210,75%,60%)" }} />Cash Balance</div>
                {cfChartAnnotations && <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(42,80%,52%)", borderRadius: 0, width: 10, height: 2 }} />Events</div>}
              </>
            )}
          </div>

          {/* Notes */}
          <div className="db-chart-notes">
            <span>Savings Rate <strong className={savingsRate >= 20 ? "text-green" : "text-gold"}>{savingsRate.toFixed(0)}%</strong></span>
            <span>Passive Income <strong className="val-blue">{maskValue(formatCurrency(passiveIncome, true), privacyMode)}/yr</strong></span>
            <span>Property Equity <strong>{maskValue(formatCurrency(propertyEquity, true), privacyMode)}</strong></span>
            {ngSummary.totalAnnualTaxBenefit > 0 && (
              <span>NG Benefit <strong className="val-green">{formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}/yr</strong></span>
            )}
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
          ROW 3 — QUICK INSIGHTS (6 cards)
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
              <span className={`db-ic-badge ${snap.cash > snap.monthly_expenses * 3 ? "badge-ok" : "badge-warn"}`}>{snap.cash > snap.monthly_expenses * 3 ? "Healthy" : "Low"}</span>
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

          {/* 5 — Tax / NG */}
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
          ROW 4 — WEALTH PROJECTION + ASSET ALLOCATION (MID SECTION)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-section-head">
          <span className="db-section-lbl">Wealth Projection &amp; Allocation</span>
          <Link href="/reports"><span className="db-section-link">Full Report →</span></Link>
        </div>
        <div className="db-projection-row">

          {/* Large projection chart */}
          <div className="db-proj-chart-card">
            <div className="db-proj-chart-head">
              <div>
                <div className="db-proj-title">10-Year Wealth Trajectory</div>
                <div className="db-proj-sub">
                  From {maskValue(formatCurrency(netWorth, true), privacyMode)} → {maskValue(formatCurrency(year10NW, true), privacyMode)} · {forecastMode === "monte-carlo" ? "Monte Carlo" : "Deterministic"}
                </div>
              </div>
              <div className="db-toggle-group">
                {(["1Y","3Y","10Y"] as const).map(r => (
                  <button key={r} className={`db-toggle-btn ${chartRange === r ? "active" : ""}`} onClick={() => setChartRange(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredNWData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gProjNW2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(210,75%,52%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gProjAssets2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(145,55%,42%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={54} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="assets"   name="Total Assets" stroke="hsl(145,55%,42%)" strokeWidth={1.5} fill="url(#gProjAssets2)" dot={false} />
                  <Area type="monotone" dataKey="netWorth" name="Net Worth"     stroke="hsl(210,75%,52%)" strokeWidth={2.5} fill="url(#gProjNW2)"    dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Projection milestones */}
            <div className="db-proj-milestones">
              {yrRows.filter((_, i) => i === 2 || i === 4 || i === 9).map((r) => (
                <div key={r.year} className="db-proj-milestone">
                  <div className="db-pm-year">{r.year}</div>
                  <div className="db-pm-val">{maskValue(formatCurrency(r.nw, true), privacyMode)}</div>
                  <div className="db-pm-sub">Net Worth</div>
                </div>
              ))}
            </div>
          </div>

          {/* Asset allocation donut */}
          <div className="db-alloc-card">
            <div className="db-alloc-head">
              <div className="db-proj-title">Asset Allocation</div>
              <div className="db-proj-sub">{maskValue(formatCurrency(totalAssets, true), privacyMode)} total</div>
            </div>
            <div style={{ position: "relative", height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={assetAllocData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={74}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {assetAllocData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "hsl(215 20% 88%)" }}>{maskValue(formatCurrency(totalAssets, true), privacyMode)}</div>
                <div style={{ fontSize: 9, color: "hsl(215 12% 48%)" }}>Total Assets</div>
              </div>
            </div>
            {/* Legend */}
            <div className="db-alloc-legend">
              {assetAllocData.map((d) => (
                <div key={d.name} className="db-alloc-leg-row">
                  <span className="db-alloc-dot" style={{ background: d.fill }} />
                  <span className="db-alloc-name">{d.name}</span>
                  <span className="db-alloc-pct">{d.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 5 — MASTER CASHFLOW FORECAST (full-width with event markers)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-section-head">
          <span className="db-section-lbl">Master Cash Flow Forecast</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={`db-toggle-btn ${cfChartAnnotations ? "active" : ""}`}
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={() => setCfChartAnnotations(v => !v)}
            >
              {cfChartAnnotations ? "Events On" : "Events Off"}
            </button>
            <Link href="/reports"><span className="db-section-link">Deep Dive →</span></Link>
          </div>
        </div>

        {/* Event chips */}
        {cfChartAnnotations && propertyEventLines.length > 0 && (
          <div className="db-cf-event-chips">
            {propertyEventLines.map((ev, i) => (
              <div key={i} className="db-cf-event-chip" style={{ borderColor: ev.color, color: ev.color }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: ev.color, display: "inline-block", marginRight: 4, flexShrink: 0 }} />
                {ev.label}
              </div>
            ))}
          </div>
        )}

        <div className="db-master-cf-card">
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={masterCFData.slice(0, cashFlowView === "annual" ? 10 : 36)}
                margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "hsl(215 12% 48%)" }}
                  axisLine={false} tickLine={false}
                  interval={cashFlowView === "annual" ? 0 : 3}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }}
                  axisLine={false} tickLine={false} width={54}
                />
                <Tooltip content={<CashflowTooltip />} />
                <ReferenceLine y={0} stroke="hsl(222 15% 25%)" strokeDasharray="2 2" />
                {/* IP purchase / settlement vertical markers */}
                {cfChartAnnotations && propertyEventLines.map((ev, i) => (
                  <ReferenceLine
                    key={i}
                    x={masterCFData[ev.index]?.label}
                    stroke={ev.color}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: "⚡", position: "top", fontSize: 10, fill: ev.color }}
                  />
                ))}
                <Line type="monotone" dataKey="income"   name="Income"         stroke="hsl(145,55%,48%)" strokeWidth={2}   dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="expenses" name="Living Expenses" stroke="hsl(5,70%,52%)"   strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="mortgage" name="Mortgage"        stroke="hsl(20,80%,55%)"  strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
                <Line type="monotone" dataKey="rental"   name="Rental"         stroke="hsl(188,60%,48%)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="ngRefund" name="NG Refund"       stroke="hsl(43,85%,55%)"  strokeWidth={1.5} dot={false} strokeDasharray="2 3" />
                <Line type="monotone" dataKey="netCF"    name="Net Cashflow"   stroke="hsl(260,60%,58%)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="balance"  name="Cash Balance"   stroke="hsl(210,75%,60%)" strokeWidth={2}   dot={<EventDot />} strokeDasharray="6 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Legend row */}
          <div className="db-chart-legend" style={{ marginTop: 8 }}>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(145,55%,48%)" }} />Income</div>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(5,70%,52%)" }} />Expenses</div>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(20,80%,55%)" }} />Mortgage</div>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(188,60%,48%)" }} />Rental</div>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(43,85%,55%)" }} />NG Refund</div>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(260,60%,58%)" }} />Net CF</div>
            <div className="db-leg-item"><span className="db-leg-dot" style={{ background: "hsl(210,75%,60%)" }} />Cash Balance</div>
            {cfChartAnnotations && <div className="db-leg-item" style={{ color: "hsl(42,80%,60%)" }}>⚡ IP Purchase · Tax Refund · Rental Start</div>}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 6 — NEGATIVE GEARING + TAX ALPHA + EXPENSE BREAKDOWN
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-three-col-wide">

          {/* Negative Gearing Panel */}
          <div className="db-ng-card">
            <div className="db-ng-head">
              <div className="db-card-eyebrow" style={{ color: "hsl(43,85%,60%)" }}>Negative Gearing Engine</div>
              <div className="db-ng-refund-toggle">
                <button className={`db-toggle-btn ${ngRefundMode === "lump-sum" ? "active" : ""}`} style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => setNgRefundMode("lump-sum")}>Lump Sum</button>
                <button className={`db-toggle-btn ${ngRefundMode === "payg" ? "active" : ""}`} style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => setNgRefundMode("payg")}>PAYG</button>
              </div>
            </div>
            {/* Portfolio total */}
            <div className="db-ng-total-row">
              <div className="db-ng-total-card">
                <div className="db-ng-total-label">Annual Tax Refund</div>
                <div className="db-ng-total-val" style={{ color: "hsl(145,55%,48%)" }}>{formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}</div>
              </div>
              <div className="db-ng-total-card">
                <div className="db-ng-total-label">Monthly Benefit</div>
                <div className="db-ng-total-val" style={{ color: "hsl(210,75%,52%)" }}>{formatCurrency(ngSummary.totalAnnualTaxBenefit / 12, true)}</div>
              </div>
              <div className="db-ng-total-card">
                <div className="db-ng-total-label">Tax Bracket Effect</div>
                <div className="db-ng-total-val" style={{ color: "hsl(43,85%,55%)" }}>
                  {snap.monthly_income * 12 > 180000 ? "45%" : snap.monthly_income * 12 > 120000 ? "37%" : snap.monthly_income * 12 > 45000 ? "32.5%" : "19%"}
                </div>
              </div>
            </div>
            {/* Per-property breakdown */}
            {ngProperties.length > 0 ? (
              <div className="db-ng-props">
                {ngProperties.map((p: any, i: number) => (
                  <div key={i} className="db-ng-prop-row">
                    <Home className="w-3 h-3 shrink-0" style={{ color: "hsl(188,60%,48%)" }} />
                    <span className="db-ng-prop-name">{p.name}</span>
                    <span className="db-ng-prop-val val-green">+{formatCurrency(p.annualBenefit, true)}/yr</span>
                    <span className="db-ng-prop-hold" style={{ color: "hsl(5,70%,52%)" }}>Hold {formatCurrency(p.monthlyHolding, true)}/mo</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="db-ng-empty">
                <span style={{ fontSize: 10, color: "hsl(215 12% 48%)" }}>Add investment properties to see NG breakdown</span>
                <Link href="/property"><span className="db-section-link" style={{ fontSize: 10 }}>Add Property →</span></Link>
              </div>
            )}
            <Link href="/tax"><button className="db-card-cta" style={{ marginTop: 8 }}>Tax Strategy →</button></Link>
          </div>

          {/* Expense Breakdown */}
          <div className="db-expense-card">
            <div className="db-card-eyebrow" style={{ color: "hsl(5,70%,52%)" }}>Monthly Expenses</div>
            <div className="db-expense-total">
              {maskValue(formatCurrency(snap.monthly_expenses + snap.mortgage / 12, true), privacyMode)}/mo
            </div>
            <div className="db-expense-sub">Living + Mortgage</div>
            {expenseBreakdown.length > 0 ? (
              <div style={{ height: 120, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseBreakdown} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9, fill: "hsl(215 12% 52%)" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => [`${formatCurrency(v, true)}/mo`, ""]} />
                    <Bar dataKey="value" fill="hsl(5,70%,52%)" radius={[0, 3, 3, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="db-ng-empty" style={{ marginTop: 16 }}>
                <span style={{ fontSize: 10, color: "hsl(215 12% 48%)" }}>No expense categories yet</span>
                <Link href="/expenses"><span className="db-section-link" style={{ fontSize: 10 }}>Add Expenses →</span></Link>
              </div>
            )}
            <Link href="/expenses"><button className="db-card-cta" style={{ marginTop: 8 }}>Expenses →</button></Link>
          </div>

          {/* Monthly Cash Flow Summary */}
          <div className="db-mcf-card">
            <div className="db-card-eyebrow" style={{ color: "hsl(260,60%,68%)" }}>Monthly Cash Flow</div>
            <div className="db-mcf-rows">
              <div className="db-mcf-row">
                <span className="db-mcf-lbl">Total Income</span>
                <span className="db-mcf-val val-green">+{maskValue(formatCurrency(snap.monthly_income, true), privacyMode)}</span>
              </div>
              <div className="db-mcf-row">
                <span className="db-mcf-lbl">Living Expenses</span>
                <span className="db-mcf-val val-red">−{maskValue(formatCurrency(snap.monthly_expenses, true), privacyMode)}</span>
              </div>
              <div className="db-mcf-row">
                <span className="db-mcf-lbl">Mortgage Repayment</span>
                <span className="db-mcf-val val-red">−{maskValue(formatCurrency(snap.mortgage / 12, true), privacyMode)}</span>
              </div>
              {(masterCFData[0]?.rental ?? 0) > 0 && (
                <div className="db-mcf-row">
                  <span className="db-mcf-lbl">Rental Income</span>
                  <span className="db-mcf-val val-green">+{maskValue(formatCurrency(masterCFData[0]?.rental ?? 0, true), privacyMode)}</span>
                </div>
              )}
              {ngSummary.totalAnnualTaxBenefit > 0 && (
                <div className="db-mcf-row">
                  <span className="db-mcf-lbl">NG Refund {ngRefundMode === "payg" ? "(PAYG)" : "(Annual)"}</span>
                  <span className="db-mcf-val val-gold">+{formatCurrency(ngSummary.totalAnnualTaxBenefit / (ngRefundMode === "payg" ? 12 : 1), true)}{ngRefundMode === "lump-sum" ? "/yr" : "/mo"}</span>
                </div>
              )}
              <div className="db-mcf-divider" />
              <div className="db-mcf-row db-mcf-total">
                <span className="db-mcf-lbl">Net Surplus</span>
                <span className={`db-mcf-val ${surplus >= 0 ? "val-green" : "val-red"}`} style={{ fontSize: 15, fontWeight: 700 }}>
                  {surplus >= 0 ? "+" : ""}{maskValue(formatCurrency(surplus, true), privacyMode)}/mo
                </span>
              </div>
              <div className="db-mcf-row">
                <span className="db-mcf-lbl">Annual Surplus</span>
                <span className="db-mcf-val val-blue">{maskValue(formatCurrency(surplus * 12, true), privacyMode)}/yr</span>
              </div>
            </div>
            <Link href="/budget"><button className="db-card-cta" style={{ marginTop: 8 }}>Full Budget →</button></Link>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 7 — FIRE PROGRESS + ACTION CENTER + BALANCE SHEET
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-fire-action-row">

          {/* FIRE Progress */}
          <div className="db-fire-card">
            <div className="db-card-eyebrow" style={{ color: "hsl(22,90%,55%)" }}>
              <Flame className="w-3 h-3 inline mr-1" />FIRE Progress
            </div>
            <div className="db-fire-main">
              {/* Large ring */}
              <svg viewBox="0 0 100 100" className="db-fire-ring">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(222 15% 16%)" strokeWidth="7" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="hsl(22,90%,55%)" strokeWidth="7"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - fireProgressPct / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{ filter: "drop-shadow(0 0 6px hsl(22 90% 55% / 0.5))" }}
                />
                <text x="50" y="44" textAnchor="middle" fontSize="15" fontWeight="800" fill="hsl(215 20% 88%)">{fireProgressPct.toFixed(0)}%</text>
                <text x="50" y="58" textAnchor="middle" fontSize="8" fill="hsl(215 12% 48%)">of target</text>
              </svg>
              <div className="db-fire-stats">
                <div className="db-fire-stat">
                  <span className="db-fs-lbl">Current</span>
                  <span className="db-fs-val">{maskValue(formatCurrency(fireCurrentAmt, true), privacyMode)}</span>
                </div>
                <div className="db-fire-stat">
                  <span className="db-fs-lbl">Target ($2.4M)</span>
                  <span className="db-fs-val">{maskValue(formatCurrency(fireTargetAmt, true), privacyMode)}</span>
                </div>
                <div className="db-fire-stat">
                  <span className="db-fs-lbl">Gap</span>
                  <span className="db-fs-val val-gold">{maskValue(formatCurrency(fireGap, true), privacyMode)}</span>
                </div>
                <div className="db-fire-stat">
                  <span className="db-fs-lbl">FIRE Age</span>
                  <span className="db-fs-val" style={{ color: "hsl(22,90%,55%)" }}>{fireCard?.value ?? "—"}</span>
                </div>
                <div className="db-fire-stat">
                  <span className="db-fs-lbl">Save / Month</span>
                  <span className="db-fs-val val-blue">{maskValue(formatCurrency(Math.min(surplus, fireMonthlyNeeded || surplus), true), privacyMode)}</span>
                </div>
              </div>
            </div>
            <div className="db-fire-bar-track">
              <div className="db-fire-bar-fill" style={{ width: `${fireProgressPct}%` }} />
            </div>
            <Link href="/wealth-strategy"><button className="db-card-cta" style={{ marginTop: 10 }}>FIRE Strategy →</button></Link>
          </div>

          {/* Smart Actions */}
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

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 8 — BALANCE SHEET + AI INSIGHTS CARD
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-two-col">

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
                    ["Stocks",       stocksTotal],
                    ["Crypto",       cryptoTotal],
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

          {/* AI Insights */}
          <AIInsightsCard
            pageKey="dashboard"
            pageLabel="Dashboard Overview"
            getData={() => ({
              netWorth, surplus, savingsRate, propertyEquity,
              totalDebt: totalLiab, passiveIncome,
              fireProgress: fireProgressPct.toFixed(0),
              year10NW, ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
              riskScore, riskLabel,
            })}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 9 — YEAR-BY-YEAR PROJECTION TABLE
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section">
        <div className="db-section-head">
          <span className="db-section-lbl">Year-by-Year Projection</span>
          <Link href="/timeline"><span className="db-section-link">Full Timeline →</span></Link>
        </div>
        <div className="db-ybyr-card">
          <table className="db-ybyr-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Net Worth</th>
                <th>Total Assets</th>
                <th>Liabilities</th>
                <th>Passive Income</th>
                <th>Annual Surplus</th>
                <th>FIRE Progress</th>
              </tr>
            </thead>
            <tbody>
              {yrRows.map((r, idx) => {
                const fp = Math.min(100, (r.nw / fireTargetAmt) * 100);
                return (
                  <tr key={r.year} className={idx === 0 ? "db-ybyr-current" : ""}>
                    <td className="db-ybyr-year">{r.year}{idx === 0 ? " ★" : ""}</td>
                    <td className="db-ybyr-nw">{maskValue(formatCurrency(r.nw, true), privacyMode)}</td>
                    <td style={{ color: "hsl(145,55%,48%)", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{maskValue(formatCurrency(r.assets, true), privacyMode)}</td>
                    <td style={{ color: "hsl(5,70%,52%)", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{maskValue(formatCurrency(r.liab, true), privacyMode)}</td>
                    <td style={{ color: "hsl(260,60%,68%)", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{maskValue(formatCurrency(r.passive, true), privacyMode)}/yr</td>
                    <td style={{ color: r.surplus >= 0 ? "hsl(145,55%,48%)" : "hsl(5,70%,52%)", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>{r.surplus >= 0 ? "+" : ""}{maskValue(formatCurrency(r.surplus, true), privacyMode)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: "hsl(222 15% 18%)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${fp}%`, height: "100%", background: fp >= 80 ? "hsl(145,55%,42%)" : fp >= 50 ? "hsl(22,90%,55%)" : "hsl(42,80%,52%)", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, color: "hsl(215 12% 52%)", minWidth: 28 }}>{fp.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ROW 10 — MODULES + LIVE WIDGETS + SAT BULLETIN SHORTCUT
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

        {/* Live widgets + Saturday Bulletin shortcut */}
        <div className="db-widgets-row">
          <PortfolioLiveReturn />
          <CFODashboardWidget />
          {/* Saturday Bulletin quick link */}
          <Link href="/ai-weekly-cfo" style={{ textDecoration: "none" }}>
            <div className="db-bulletin-tile">
              <div className="db-bulletin-icon">📰</div>
              <div>
                <div className="db-bulletin-title">Saturday Bulletin</div>
                <div className="db-bulletin-sub">Weekly AI wealth brief</div>
              </div>
              <ChevronRight className="w-4 h-4 ml-auto shrink-0" style={{ color: "hsl(43,85%,55%)" }} />
            </div>
          </Link>
        </div>
      </div>

    </div>
  );
}
