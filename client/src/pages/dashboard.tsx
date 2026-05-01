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
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import CFODashboardWidget from "@/components/CFODashboardWidget";
import BestMoveCard from "@/components/BestMoveCard";
import FIREPathCard from "@/components/FIREPathCard";
import TaxAlphaCard from "@/components/TaxAlphaCard";
import RiskRadarCard from "@/components/RiskRadarCard";
import KpiCard from "@/components/KpiCard";
import { Link } from "wouter";
import { useForecastStore } from "@/lib/forecastStore";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import familyImg from "@assets/family.jpeg";

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

  const SNAP_ZERO = {
    ppor: 0, cash: 0, offset_balance: 0, super_balance: 0,
    super_roham: 0, super_fara: 0, cars: 0, iran_property: 0,
    mortgage: 0, other_debts: 0, monthly_income: 0, monthly_expenses: 0,
    mortgage_rate: 6.5, mortgage_term_years: 30,
  };

  const snap = useMemo(() => {
    if (!snapshot) return SNAP_ZERO;
    const s = snapshot;
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
  // Mortgage is already included in monthly_expenses — do not deduct again
  const monthlyMortgageRepay = 0;
  const surplus       = snap.monthly_income - snap.monthly_expenses;
  const totalMonthlyOutgoings = snap.monthly_expenses;
  const savingsRate   = calcSavingsRate(snap.monthly_income, snap.monthly_expenses);

  // ─── NG Summary ───────────────────────────────────────────────────────────
  const ngSummary = useMemo<NGSummary>(() => {
    if (!snapshot) return { totalAnnualTaxBenefit: 0, perProperty: [] } as NGSummary;
    return calcNegativeGearing({ properties, annualSalaryIncome: snap.monthly_income * 12, refundMode: ngRefundMode });
  }, [snapshot, properties, snap.monthly_income, ngRefundMode]);

  // ─── Projection ───────────────────────────────────────────────────────────
  const projection = useMemo(() => {
    if (!snapshot) return [];
    return projectNetWorth({
      snapshot: { ...snap, offset_balance: snap.offset_balance },
      expenses, properties,
      stocks: stocks ?? [],
      cryptos: cryptos ?? [],
      liveStocksValue: stocksTotal,
      liveCryptoValue: cryptoTotal,
      stockTransactions:  plannedStockTx,
      cryptoTransactions: plannedCryptoTx,
      stockDCASchedules, cryptoDCASchedules,
      plannedStockOrders, plannedCryptoOrders,
      ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
    });
  }, [snapshot, snap, properties, stocks, cryptos, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, expenses, billsRaw, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);
  const year10NW      = projection[9]?.endNetWorth || netWorth;
  // Passive income: only count properties already settled + actual stock/crypto dividends today
  // projection[0] includes future planned properties (e.g. July IP) which inflates today's figure
  const todayStr = new Date().toISOString().split('T')[0];
  const passiveIncome = useMemo(() => {
    const settledProperties = (properties ?? []).filter((p: any) =>
      p.type !== 'ppor' && p.settlement_date && p.settlement_date <= todayStr
    );
    const annualRental = settledProperties.reduce((sum: number, p: any) => {
      const wRent = safeNum(p.weekly_rent);
      const vacancy = safeNum(p.vacancy_rate) || 0;
      const mgmt = safeNum(p.management_fee) || 0;
      return sum + wRent * 52 * (1 - vacancy / 100) * (1 - mgmt / 100);
    }, 0);
    const annualDividends = stocksTotal * 0.02 + cryptoTotal * 0.01;
    return Math.round(annualRental + annualDividends);
  }, [properties, stocksTotal, cryptoTotal, todayStr]);

  // ─── Cash engine with events ──────────────────────────────────────────────
  const cashEngineResult = useMemo(() => {
    if (!snapshot) return null;
    try {
      return runCashEngine({
        snapshot: {
          cash:             snap.cash,
          offset_balance:   snap.offset_balance,  // total liquid = cash + offset
          monthly_income:   snap.monthly_income,
          monthly_expenses: snap.monthly_expenses,
          mortgage:         snap.mortgage,
          other_debts:      snap.other_debts,
        },
        expenses, properties,
        stockTransactions:  plannedStockTx,
        cryptoTransactions: plannedCryptoTx,
        stockDCASchedules, cryptoDCASchedules,
        plannedStockOrders, plannedCryptoOrders,
        ngRefundMode,
        ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      });
    } catch { return null; }
  }, [snapshot, snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);

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
  const cashFlowSeries = useMemo(() => {
    if (!snapshot) return [];
    return buildCashFlowSeries({
      snapshot: {
        monthly_income:   snap.monthly_income,
        monthly_expenses: snap.monthly_expenses,
        mortgage:         snap.mortgage,
        other_debts:      snap.other_debts,
        cash:             snap.cash + snap.offset_balance,
      },
      expenses, properties,
      stockTransactions:  plannedStockTx,
      cryptoTransactions: plannedCryptoTx,
      stockDCASchedules, cryptoDCASchedules,
      plannedStockOrders, plannedCryptoOrders,
      ngRefundMode, ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
    });
  }, [snapshot, snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);
  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

  // ─── Master CF data with event markers ───────────────────────────────────
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
    return lines.slice(0, 8);
  }, [masterCFData, cashFlowView, cfChartAnnotations]);

  // ─── Wealth cards ─────────────────────────────────────────────────────────
  const wealthCards = useMemo(() => {
    if (!snapshot) return [];
    const currentInvestable = snap.cash + snap.offset_balance + _totalSuperNow + stocksTotal + cryptoTotal;
    const requiredFIRE = (10000 * 12) / 0.04;
    const fireProgress = Math.min(100, Math.round((currentInvestable / requiredFIRE) * 100));
    const totalMonthly = snap.monthly_expenses + monthlyMortgageRepay;
    const monthsCovered = (snap.cash + snap.offset_balance) / totalMonthly;
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
  const totalLiquid = snap.cash + snap.offset_balance;
  const savingsIdleForOffset = totalLiquid > snap.monthly_expenses * 6 ? totalLiquid - snap.monthly_expenses * 6 : 0;
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
    if (!snapshot) return [];
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
    if (!snapshot) return [];
    const cats: Record<string, number> = {};
    (expenses ?? []).forEach((e: any) => {
      const cat = e.category || "Other";
      cats[cat] = (cats[cat] || 0) + safeNum(e.monthly_amount || e.amount);
    });
    if (snap.mortgage > 0) cats["Mortgage"] = (cats["Mortgage"] || 0) + monthlyMortgageRepay;
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
    if (!snapshot) return [];
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

  // ─── Full year-by-year rows ───────────────────────────────────────────────
  const yrRowsFull = useMemo(() => {
    if (!snapshot) return [];
    return projection.slice(0, 10).map((p: any) => ({
      year: p.year,
      startNW: p.startNetWorth,
      income: p.income,
      expenses: p.expenses,
      propValue: p.propertyValue,
      propLoans: p.propertyLoans,
      equity: p.propertyEquity,
      stocks: p.stockValue,
      crypto: p.cryptoValue,
      cash: p.cash,
      totalAssets: p.totalAssets,
      liab: p.totalLiabilities,
      endNW: p.endNetWorth,
      growth: p.growth,
      passive: p.passiveIncome,
      monthlyCF: p.monthlyCashFlow,
    }));
  }, [projection, snapshot]);

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

  // ─── Computed values for new layout ──────────────────────────────────────
  const accessibleNW = netWorth - _totalSuperNow;
  const lockedNW = _totalSuperNow;
  const forecast2030 = projection.find((p: any) => p.year === 2030)?.cash ?? 0;
  const forecast2035 = projection.find((p: any) => p.year === 2035)?.cash ?? 0;
  const allFutureCash = projection.map((p: any) => p.cash);
  const lowestFutureCash = allFutureCash.length > 0 ? Math.min(...allFutureCash) : 0;
  const nextPropEvent = (cashEngineResult?.events ?? []).find((e: any) => e.type === "property_purchase" || e.type === "settlement");

  const negativeCashMonths = (cashEngineResult?.ledger ?? [])
    .filter((m: any) => m.closingCash < 0)
    .slice(0, 5)
    .map((m: any) => m.label || m.monthKey);
  const hasLiquidityStress = negativeCashMonths.length > 0;

  const upcomingBillsCount = (billsRaw ?? []).filter((b: any) => {
    if (!b.next_due_date) return false;
    const due = new Date(b.next_due_date);
    const today = new Date();
    const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const budgetsSetCount = (budgetsRaw ?? []).length;
  const alertsSent24h = (alertLogsRaw ?? []).filter((a: any) => {
    const ts = new Date(a.sent_at || a.created_at).getTime();
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  }).length;

  const cashAfterBills = (snap.cash + snap.offset_balance) - (billsRaw ?? [])
    .filter((b: any) => {
      if (!b.next_due_date) return false;
      const due = new Date(b.next_due_date);
      const today = new Date();
      return (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 7;
    })
    .reduce((sum: number, b: any) => sum + safeNum(b.amount), 0);

  const monthlyCFBarData = [
    { name: "Income", value: snap.monthly_income },
    { name: "Expenses", value: snap.monthly_expenses + monthlyMortgageRepay },
    { name: "Surplus", value: Math.max(0, surplus) },
  ];
  const MONTHLY_CF_COLORS = ["hsl(142,60%,45%)", "hsl(0,72%,51%)", "hsl(43,85%,55%)"];

  const cfFirst = masterCFData.find((d: any) => d.label && d.label.includes("2026")) ?? masterCFData[0] ?? {};
  const cfLast = masterCFData[masterCFData.length - 1] ?? {};

  // Active income sources count
  const activeIncomeSources = (incomeRecords ?? []).filter((r: any) => r.is_active !== false).length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground pb-16">

      {/* ══════════════════════════════════════════════════════════════════
          HERO SECTION
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">

          {/* Left — Family welcome card */}
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 flex gap-4 items-center min-w-0">
            {/* Family photo */}
            <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-amber-500/30">
              <img src={familyImg} alt="Family" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-0.5">Welcome Back</div>
              <div className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">Fara &amp; Roham</div>
              <div className="text-sm font-semibold text-muted-foreground mt-0.5">Family Net Worth Command Center</div>
              <div className="text-xs text-muted-foreground/70 mt-0.5">Building Wealth for Yara &amp; Jana</div>
            </div>
          </div>

          {/* Right — Net worth + controls */}
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between min-w-[260px]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Estimated Net Worth</div>
              <div className="text-4xl font-extrabold text-amber-400 tabular-nums leading-none mb-1">
                {maskValue(formatCurrency(netWorth, true), privacyMode)}
              </div>
              <div className="text-xs text-muted-foreground">Brisbane, QLD · AUD</div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={togglePrivacy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                {privacyMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {privacyMode ? "Show Values" : "Hide Values"}
              </button>
              <button
                onClick={handleSyncFromCloud}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync From Cloud
              </button>
            </div>
          </div>
        </div>

        {/* Income source badge */}
        <div className="mt-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Income source: Income Tracker ({activeIncomeSources > 0 ? activeIncomeSources : 3} active sources · {formatCurrency(snap.monthly_income, true)}/mo)
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          8 KPI CARDS (4-column grid, 2 rows)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="NET WORTH"
            value={maskValue(formatCurrency(netWorth, true), privacyMode)}
            subValue={`Accessible: ${maskValue(formatCurrency(accessibleNW, true), privacyMode)}`}
            icon={<TrendingUp />}
            accent="hsl(43,85%,55%)"
          />
          <KpiCard
            label="MONTHLY SURPLUS"
            value={maskValue(formatCurrency(surplus, true), privacyMode)}
            subValue={`${maskValue(formatCurrency(surplus * 12, true), privacyMode)} / year`}
            trend={surplus >= 0 ? 1 : -1}
            icon={<PiggyBank />}
            accent="hsl(142,60%,45%)"
          />
          <KpiCard
            label="TOTAL INVESTMENTS"
            value={maskValue(formatCurrency(stocksTotal + cryptoTotal, true), privacyMode)}
            subValue={stocksTotal + cryptoTotal === 0 ? "— Stocks + Crypto" : `Stocks: ${formatCurrency(stocksTotal, true)}`}
            icon={<BarChart2 />}
            accent="hsl(210,75%,52%)"
          />
          <KpiCard
            label="PROPERTY EQUITY"
            value={maskValue(formatCurrency(propertyEquity, true), privacyMode)}
            subValue={`${Math.round((propertyEquity / (snap.ppor || 1)) * 100)}% LVR met`}
            icon={<Home />}
            accent="hsl(188,60%,48%)"
          />
          <KpiCard
            label="DEBT BALANCE"
            value={maskValue(formatCurrency(totalLiab, true), privacyMode)}
            subValue="Mortgage + Debts"
            trend={-1}
            icon={<CreditCard />}
            accent="hsl(5,70%,52%)"
          />
          <KpiCard
            label="10-YEAR FORECAST"
            value={maskValue(formatCurrency(year10NW, true), privacyMode)}
            subValue={`From ${maskValue(formatCurrency(netWorth, true), privacyMode)} today`}
            trend={1}
            icon={<Target />}
            accent="hsl(260,60%,58%)"
          />
          <KpiCard
            label="PASSIVE INCOME"
            value={maskValue(formatCurrency(passiveIncome, true), privacyMode)}
            subValue="Rental + Dividends"
            icon={<Landmark />}
            accent="hsl(145,55%,42%)"
          />
          <KpiCard
            label="SUPER (COMBINED)"
            value={maskValue(formatCurrency(_totalSuperNow, true), privacyMode)}
            subValue={`At 60: ${maskValue(formatCurrency(_totalSuperNow * Math.pow(1.07, 24), true), privacyMode)}`}
            icon={<Briefcase />}
            accent="hsl(43,85%,55%)"
          />
        </div>

        {/* Savings Rate — full-width banner card */}
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Savings Rate</span>
            <span className="text-2xl font-extrabold text-amber-400 tabular-nums">{savingsRate.toFixed(1)}%</span>
          </div>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm text-muted-foreground">{maskValue(formatCurrency(surplus * 12, true), privacyMode)} saved / yr</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden ml-2">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{ width: `${Math.min(100, savingsRate * 1.5)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ACCESSIBLE / LOCKED / TOTAL NET WORTH + CASH PROJECTIONS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pt-4 pb-2">
        {/* 3 wealth split cards */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Accessible Wealth</div>
            <div className="text-xl font-bold text-foreground tabular-nums">{maskValue(formatCurrency(accessibleNW, true), privacyMode)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Available now ex-super</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Locked Retirement Wealth</div>
            <div className="text-xl font-bold text-amber-400 tabular-nums">{maskValue(formatCurrency(lockedNW, true), privacyMode)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Superannuation — access at 60</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total Net Worth</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">{maskValue(formatCurrency(netWorth, true), privacyMode)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Accessible + Super combined</div>
          </div>
        </div>

        {/* 6 cash projection cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Current Cash</div>
            <div className="text-lg font-bold text-foreground tabular-nums">{maskValue(formatCurrency(snap.cash + snap.offset_balance, true), privacyMode)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Forecast Cash 2030</div>
            <div className={`text-lg font-bold tabular-nums ${forecast2030 < 0 ? "text-red-400" : "text-foreground"}`}>
              {maskValue(formatCurrency(forecast2030, true), privacyMode)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Forecast Cash 2035</div>
            <div className={`text-lg font-bold tabular-nums ${forecast2035 < 0 ? "text-red-400" : "text-foreground"}`}>
              {maskValue(formatCurrency(forecast2035, true), privacyMode)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Lowest Future Cash</div>
            <div className={`text-lg font-bold tabular-nums ${lowestFutureCash < 0 ? "text-red-400" : "text-foreground"}`}>
              {maskValue(formatCurrency(lowestFutureCash, true), privacyMode)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Next Major Event</div>
            <div className="text-sm font-bold text-amber-400 truncate">
              {nextPropEvent ? nextPropEvent.label : "No events scheduled"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {nextPropEvent ? nextPropEvent.monthKey : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Emergency Buffer</div>
            <div className={`text-sm font-bold ${(snap.cash + snap.offset_balance) >= snap.monthly_expenses * 3 ? "text-emerald-400" : "text-red-400"}`}>
              {(snap.cash + snap.offset_balance) >= snap.monthly_expenses * 3 ? "Buffer healthy" : "Buffer low"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              ${Math.round(snap.monthly_expenses * 3 / 1000)}k reserve target
            </div>
          </div>
        </div>

        {/* Liquidity stress alert */}
        {hasLiquidityStress && (
          <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/8 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm font-bold text-red-400">Liquidity Stress Detected</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Cash goes negative in: {negativeCashMonths.join(", ")}
            </div>
          </div>
        )}

        {/* 4 quick metric tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground tabular-nums">{upcomingBillsCount}</div>
              <div className="text-xs text-muted-foreground">Upcoming Bills</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground tabular-nums">{budgetsSetCount}</div>
              <div className="text-xs text-muted-foreground">Budget Status</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground tabular-nums">{alertsSent24h}</div>
              <div className="text-xs text-muted-foreground">Alerts Sent</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground tabular-nums">{maskValue(formatCurrency(cashAfterBills, true), privacyMode)}</div>
              <div className="text-xs text-muted-foreground">Cash After Bills</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          WEALTH HEALTH CARDS (8 cards)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {wealthCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border p-4 bg-card ${card.alert ? "border-red-500/30" : "border-border"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
                <card.Icon className={`w-3.5 h-3.5 ${card.alert ? "text-red-400" : "text-muted-foreground"}`} />
              </div>
              <div className={`text-lg font-bold tabular-nums ${card.alert ? "text-red-400" : "text-foreground"}`}>
                {card.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FINANCIAL SNAPSHOT SECTION
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="rounded-2xl border border-border bg-card p-5" ref={snapContainerRef}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground">Financial Snapshot</h2>
            <button
              onClick={() => { setEditSnap(!editSnap); if (!editSnap && !snapDraft) setSnapDraft({ ...snap }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
            >
              <Edit2 className="w-3 h-3" />{editSnap ? "Cancel" : "Edit"}
            </button>
          </div>

          {!editSnap ? (
            <>
              {/* Individual field cards in 4-column grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {[
                  { label: "PPOR", value: snap.ppor, isLiab: false },
                  { label: "Cash (Everyday)", value: snap.cash, isLiab: false },
                  { label: "Cash (Savings)", value: snap.offset_balance, isLiab: false },
                  { label: "Cash (Emergency)", value: 0, isLiab: false },
                  { label: "Cash (Other)", value: 0, isLiab: false },
                  { label: "Offset Balance", value: snap.offset_balance, isLiab: false },
                  { label: "Super", value: _totalSuperNow, isLiab: false },
                  { label: "Cars", value: snap.cars, isLiab: false },
                  { label: "Iran Property", value: snap.iran_property, isLiab: false },
                  { label: "Mortgage", value: snap.mortgage, isLiab: true },
                  { label: "Other Debts", value: snap.other_debts, isLiab: true },
                  { label: "Monthly Income", value: snap.monthly_income, isLiab: false },
                  { label: "Monthly Expenses", value: snap.monthly_expenses, isLiab: false },
                ].map((f) => (
                  <div key={f.label} className="rounded-lg border border-border bg-background/50 px-3 py-2">
                    <div className="text-xs text-muted-foreground mb-0.5">{f.label}</div>
                    <div className={`text-sm font-bold tabular-nums ${f.isLiab ? "text-red-400" : "text-foreground"}`}>
                      {maskValue(formatCurrency(f.value, true), privacyMode)}
                    </div>
                  </div>
                ))}
              </div>
              {/* Totals row */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">Total Assets</div>
                  <div className="text-base font-bold text-emerald-400 tabular-nums">{maskValue(formatCurrency(totalAssets, true), privacyMode)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">Total Liabilities</div>
                  <div className="text-base font-bold text-red-400 tabular-nums">{maskValue(formatCurrency(totalLiab, true), privacyMode)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">Net Worth</div>
                  <div className="text-base font-bold text-amber-400 tabular-nums">{maskValue(formatCurrency(netWorth, true), privacyMode)}</div>
                </div>
              </div>
            </>
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

      {/* ══════════════════════════════════════════════════════════════════
          10-YEAR NW CHART + ASSET ALLOCATION DONUT
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* 10-Year Net Worth Growth chart (~60%) */}
          <div className="flex-[3] rounded-2xl border border-border bg-card p-5 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-bold text-foreground">10-Year Net Worth Growth</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {maskValue(formatCurrency(netWorth, true), privacyMode)} → {maskValue(formatCurrency(year10NW, true), privacyMode)} projected
                </div>
              </div>
              <div className="flex gap-1">
                {(["1Y","3Y","10Y"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${chartRange === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground border border-border"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredNWData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gNWMain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(210,75%,52%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAssetsMain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(145,55%,42%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(145,55%,42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="assets"   name="Total Assets" stroke="hsl(145,55%,42%)" strokeWidth={1.5} fill="url(#gAssetsMain)" dot={false} />
                  <Area type="monotone" dataKey="netWorth" name="Net Worth"     stroke="hsl(210,75%,52%)" strokeWidth={2.5} fill="url(#gNWMain)"    dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />Net Worth</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Total Assets</div>
            </div>
          </div>

          {/* Asset Allocation donut (~40%) */}
          <div className="flex-[2] rounded-2xl border border-border bg-card p-5 min-w-0">
            <div className="text-base font-bold text-foreground mb-1">Asset Allocation</div>
            <div className="text-xs text-muted-foreground mb-3">{maskValue(formatCurrency(totalAssets, true), privacyMode)} total</div>
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
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "hsl(215 20% 88%)" }}>{maskValue(formatCurrency(totalAssets, true), privacyMode)}</div>
                <div style={{ fontSize: 9, color: "hsl(215 12% 48%)" }}>Total Assets</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {assetAllocData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                  <span className="text-xs font-semibold text-foreground tabular-nums">{d.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MONTHLY CASHFLOW BAR + EXPENSE BREAKDOWN DONUT
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="flex flex-col md:flex-row gap-4">

          {/* Monthly Cash Flow bar chart (~50%) */}
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 min-w-0">
            <div className="text-base font-bold text-foreground mb-1">Monthly Cash Flow</div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyCFBarData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 18% / 0.5)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "hsl(215 12% 48%)" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v: any) => [formatCurrency(v, true), ""]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {monthlyCFBarData.map((_, i) => (
                      <Cell key={i} fill={MONTHLY_CF_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Income</div>
                <div className="text-sm font-bold text-emerald-400 tabular-nums">{maskValue(formatCurrency(snap.monthly_income, true), privacyMode)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Expenses</div>
                <div className="text-sm font-bold text-red-400 tabular-nums">{maskValue(formatCurrency(snap.monthly_expenses + monthlyMortgageRepay, true), privacyMode)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Surplus</div>
                <div className={`text-sm font-bold tabular-nums ${surplus >= 0 ? "text-amber-400" : "text-red-400"}`}>{maskValue(formatCurrency(surplus, true), privacyMode)}</div>
              </div>
            </div>
          </div>

          {/* Expense Breakdown donut (~50%) */}
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 min-w-0">
            <div className="text-base font-bold text-foreground mb-1">Expense Breakdown</div>
            <div className="text-xs text-muted-foreground mb-2">{maskValue(formatCurrency(snap.monthly_expenses + monthlyMortgageRepay, true), privacyMode)}/mo total</div>
            {expenseBreakdown.length > 0 ? (
              <div style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      cx="50%" cy="50%"
                      innerRadius={40} outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {expenseBreakdown.map((_, i) => (
                        <Cell key={i} fill={["hsl(5,70%,52%)","hsl(20,80%,55%)","hsl(40,85%,55%)","hsl(188,60%,48%)","hsl(260,60%,58%)","hsl(145,55%,42%)","hsl(210,75%,52%)"][i % 7]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => [formatCurrency(v, true) + "/mo", ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No expense categories</div>
            )}
            <div className="mt-2 space-y-1">
              {expenseBreakdown.slice(0, 5).map((e, i) => (
                <div key={e.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ["hsl(5,70%,52%)","hsl(20,80%,55%)","hsl(40,85%,55%)","hsl(188,60%,48%)","hsl(260,60%,58%)"][i] }} />
                  <span className="text-xs text-muted-foreground flex-1">{e.name}</span>
                  <span className="text-xs font-semibold tabular-nums">{maskValue(formatCurrency(e.value, true), privacyMode)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MASTER CASHFLOW FORECAST (full-width)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
            <div className="flex-1">
              <div className="text-base font-bold text-foreground">Master Cash Flow Forecast</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Australian Negative Gearing Active · {ngProperties.length} negatively geared {ngProperties.length === 1 ? "property" : "properties"} · Marginal rate: {snap.monthly_income * 12 > 180000 ? "47%" : snap.monthly_income * 12 > 120000 ? "37%" : "32.5%"}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <button
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${ngRefundMode === "lump-sum" ? "bg-primary text-primary-foreground" : "text-muted-foreground border border-border hover:text-foreground"}`}
                onClick={() => setNgRefundMode("lump-sum")}
              >
                Lump-sum (Aug)
              </button>
              <button
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${ngRefundMode === "payg" ? "bg-primary text-primary-foreground" : "text-muted-foreground border border-border hover:text-foreground"}`}
                onClick={() => setNgRefundMode("payg")}
              >
                PAYG
              </button>
              <button
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${cfChartAnnotations ? "bg-primary text-primary-foreground" : "text-muted-foreground border border-border hover:text-foreground"}`}
                onClick={() => setCfChartAnnotations(v => !v)}
              >
                Events
              </button>
              <Link href="/reports"><span className="text-xs text-primary hover:underline ml-1">Deep Dive →</span></Link>
            </div>
          </div>

          {/* NG summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-background/60 border border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Monthly Cash Loss</div>
              <div className="text-sm font-bold text-red-400 tabular-nums">{formatCurrency(-(snap.monthly_expenses + monthlyMortgageRepay - snap.monthly_income), true)}</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Est. Annual Tax Refund</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">+{formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Net After-Tax Cost/mo</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(surplus - ngSummary.totalAnnualTaxBenefit / 12, true)}</div>
            </div>
            <div className="rounded-lg bg-background/60 border border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Refund Mode</div>
              <div className="text-sm font-bold text-amber-400">{ngRefundMode === "lump-sum" ? "Lump-sum (Aug)" : "PAYG"}</div>
            </div>
          </div>

          {/* Chart */}
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

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2 mb-3">
            {[
              { label: "Income", color: "hsl(145,55%,48%)" },
              { label: "Expenses", color: "hsl(5,70%,52%)" },
              { label: "Mortgage", color: "hsl(20,80%,55%)" },
              { label: "Rental", color: "hsl(188,60%,48%)" },
              { label: "NG Refund", color: "hsl(43,85%,55%)" },
              { label: "Net CF", color: "hsl(260,60%,58%)" },
              { label: "Cash Balance", color: "hsl(210,75%,60%)" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
            <div>
              <div className="text-xs text-muted-foreground">2026 Net CF</div>
              <div className={`text-sm font-bold tabular-nums ${(cfFirst.netCF ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(cfFirst.netCF ?? 0, true)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">2026 Balance</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(cfFirst.balance ?? 0, true)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">2035 Net CF</div>
              <div className={`text-sm font-bold tabular-nums ${(cfLast.netCF ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(cfLast.netCF ?? 0, true)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">2035 Balance</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(cfLast.balance ?? 0, true)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          YEAR-BY-YEAR TABLE
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Year-by-Year Projection</h2>
          <Link href="/timeline"><span className="text-xs text-primary hover:underline">Full Timeline →</span></Link>
        </div>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="db-action-table-wrap overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Year","Start NW","Income","Expenses","Prop. Value","Prop. Loans","Equity","Stocks","Crypto","Cash","Total Assets","Liabilities","End NW","Growth","Passive Income","Mthly CF"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yrRowsFull.map((r, idx) => (
                  <tr key={r.year} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx === 0 ? "bg-amber-500/5" : ""}`}>
                    <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">{r.year}{idx === 0 ? " ★" : ""}</td>
                    <td className="px-3 py-2 font-mono text-foreground tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.startNW ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.income ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-red-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.expenses ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-foreground tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.propValue ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-red-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.propLoans ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.equity ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-blue-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.stocks ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-purple-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.crypto ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-foreground tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.cash ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.totalAssets ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-red-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.liab ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono text-amber-400 font-bold tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.endNW ?? 0, true), privacyMode)}</td>
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap" style={{ color: (r.growth ?? 0) >= 0 ? "hsl(142,60%,45%)" : "hsl(5,70%,52%)" }}>
                      {(r.growth ?? 0) >= 0 ? "+" : ""}{((r.growth ?? 0) * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 font-mono text-purple-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.passive ?? 0, true), privacyMode)}/yr</td>
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap" style={{ color: (r.monthlyCF ?? 0) >= 0 ? "hsl(142,60%,45%)" : "hsl(5,70%,52%)" }}>
                      {maskValue(formatCurrency(r.monthlyCF ?? 0, true), privacyMode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SATURDAY MORNING BULLETIN + BEST MOVE
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-[3] min-w-0">
            <CFODashboardWidget />
          </div>
          <div className="flex-[2] min-w-0">
            <BestMoveCard />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FIRE PATH OPTIMIZER + PORTFOLIO LIVE RETURN
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <FIREPathCard />
      </div>

      <div className="px-4 pb-4">
        <PortfolioLiveReturn />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ACTION CENTER (smart actions table)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-bold text-foreground">Action Center</div>
              <div className="text-xs text-muted-foreground mt-0.5">Top opportunities ranked by ROI</div>
            </div>
            <Link href="/ai-insights"><span className="text-xs text-primary hover:underline">AI Insights →</span></Link>
          </div>
          <div className="db-action-table-wrap overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Action</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Impact</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Difficulty</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Time</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Priority</th>
                </tr>
              </thead>
              <tbody>
                {smartActions.map((action, idx) => (
                  <tr
                    key={idx}
                    className={`db-action-row priority-${action.priority} border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer`}
                    onClick={() => window.location.hash = `#${action.href}`}
                  >
                    <td className="px-3 py-2 font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{action.title}</td>
                    <td className="px-3 py-2 text-emerald-400">{action.impact}</td>
                    <td className="px-3 py-2 text-muted-foreground">{action.difficulty}</td>
                    <td className="px-3 py-2 text-muted-foreground">{action.time}</td>
                    <td className="px-3 py-2">
                      <span className={`db-priority-badge priority-badge-${action.priority} inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        action.priority === "high" ? "bg-red-500/15 text-red-400" :
                        action.priority === "medium" ? "bg-amber-500/15 text-amber-400" :
                        action.priority === "strategic" ? "bg-blue-500/15 text-blue-400" :
                        "bg-muted text-muted-foreground"
                      }`}>{action.priority}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          AI INSIGHTS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
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
  );
}
