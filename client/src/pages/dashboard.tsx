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
  ComposedChart,
  type TooltipProps,
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
import WealthFlowBanner from "@/components/WealthFlowBanner";
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

// ─── Executive Cashflow Tooltip ──────────────────────────────────────────────
const CashflowTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  const rows = [
    { label: "Cash Balance",        value: d.balance   ?? 0, color: "hsl(210,80%,65%)",  bold: true },
    { label: "Income",              value: d.income    ?? 0, color: "hsl(142,60%,52%)" },
    { label: "Expenses",            value: -(d.expenses ?? 0), color: "hsl(0,72%,58%)" },
    { label: "Debt Payments",       value: -(d.mortgage ?? 0), color: "hsl(20,75%,58%)" },
    { label: "Investments",         value: -(d.investments ?? 0), color: "hsl(262,60%,65%)" },
    { label: "Tax Refund",          value: d.ngRefund  ?? 0, color: "hsl(43,90%,58%)" },
    { label: "Net Cashflow",        value: d.netCF     ?? 0, color: (d.netCF ?? 0) >= 0 ? "hsl(142,60%,52%)" : "hsl(0,72%,58%)", bold: true },
  ].filter(r => Math.abs(r.value) > 0);
  const milestones: { icon: string; text: string }[] = d._milestones ?? [];
  return (
    <div className="db-tooltip" style={{ minWidth: 240, background: "hsl(222,22%,9%)", border: "1px solid hsl(222,15%,22%)", borderRadius: 10, padding: "10px 14px" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "hsl(215,20%,80%)", marginBottom: 8, letterSpacing: "0.03em" }}>{label}</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3, color: r.color, fontWeight: r.bold ? 700 : 400, fontSize: r.bold ? 12 : 11 }}>
          <span style={{ opacity: r.bold ? 1 : 0.85 }}>{r.label}</span>
          <span style={{ fontFamily: "monospace" }}>{r.value >= 0 ? "+" : ""}{formatCurrency(r.value, true)}</span>
        </div>
      ))}
      {milestones.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid hsl(222,15%,22%)" }}>
          {milestones.map((m, i) => (
            <div key={i} style={{ fontSize: 11, color: "hsl(43,90%,62%)", marginTop: 3 }}>{m.icon} {m.text}</div>
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

// ─── Milestone dot for executive CF chart ─────────────────────────────────────
const MilestoneDot = (props: any) => {
  const { cx, cy, payload } = props;
  const ms: any[] = payload?._milestones ?? [];
  if (!ms.length) return null;
  const isIP     = ms.some((m: any) => m.type === "property");
  const isStock  = ms.some((m: any) => m.type === "stock");
  const isCrypto = ms.some((m: any) => m.type === "crypto");
  const isTax    = ms.some((m: any) => m.type === "tax");
  const isDebt   = ms.some((m: any) => m.type === "debt");
  const color = isIP ? "hsl(188,65%,52%)" : isStock ? "hsl(210,80%,65%)" : isCrypto ? "hsl(262,70%,65%)" : isTax ? "hsl(43,90%,58%)" : isDebt ? "hsl(142,60%,52%)" : "hsl(42,80%,52%)";
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
    </g>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient();
  const { chartView, setChartView, privacyMode, togglePrivacy, currentUser } = useAppStore();
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
  const [wdcTab, setWdcTab] = useState<"CASH" | "EVENTS" | "WEALTH" | "RISK">("CASH");
  const [wdcChartType, setWdcChartType] = useState<"combo" | "line" | "candlestick">("combo");
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
    queryKey: ["/api/planned-investments", "stock"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoOrdersRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "crypto"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then((r) => r.json()),
    staleTime: 0,
  });

  const updateSnap = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/snapshot", data).then((r) => r.json()),
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

  // ─── Build milestone map keyed by year (for annual chart) ──────────────────
  const milestonesPerYear = useMemo(() => {
    const map = new Map<number, Array<{ icon: string; text: string; type: string }>>();
    const add = (year: number, m: { icon: string; text: string; type: string }) => {
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(m);
    };
    // Investment properties
    (properties as any[]).forEach((p: any) => {
      if (p.type === "ppor" || !p.settlement_date) return;
      const yr = new Date(p.settlement_date).getFullYear();
      const name = p.address?.split(" ").slice(-2).join(" ") || p.label || "IP";
      add(yr, { icon: "🏠", text: `${name} Settlement`, type: "property" });
    });
    // Planned stock orders — collapse per year (Fix 3: no duplicate labels)
    const stockByYear = new Map<number, { count: number; totalAmt: number }>();
    (ordersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date).forEach((o: any) => {
      const yr = new Date(o.planned_date).getFullYear();
      const amt = o.total_cost ?? o.amount ?? 0;
      const existing = stockByYear.get(yr) ?? { count: 0, totalAmt: 0 };
      stockByYear.set(yr, { count: existing.count + 1, totalAmt: existing.totalAmt + amt });
    });
    stockByYear.forEach(({ count, totalAmt }, yr) => {
      const label = count > 1
        ? `📈 Multiple Stock Buys ($${Math.round(totalAmt / 1000)}k)`
        : `📈 Stock Buy ($${Math.round(totalAmt / 1000)}k)`;
      add(yr, { icon: "📈", text: label.replace("📈 ", ""), type: "stock" });
    });
    // Planned crypto orders — collapse per year (Fix 3)
    const cryptoByYear = new Map<number, { count: number; totalAmt: number }>();
    (cryptoOrdersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date).forEach((o: any) => {
      const yr = new Date(o.planned_date).getFullYear();
      const amt = o.total_cost ?? o.amount ?? 0;
      const existing = cryptoByYear.get(yr) ?? { count: 0, totalAmt: 0 };
      cryptoByYear.set(yr, { count: existing.count + 1, totalAmt: existing.totalAmt + amt });
    });
    cryptoByYear.forEach(({ count, totalAmt }, yr) => {
      const label = count > 1
        ? `Multiple Crypto Buys ($${Math.round(totalAmt / 1000)}k)`
        : `Crypto Buy ($${Math.round(totalAmt / 1000)}k)`;
      add(yr, { icon: "₿", text: label, type: "crypto" });
    });
    // NG tax refund years (any year that has negatively geared properties settled)
    if (ngSummary.totalAnnualTaxBenefit > 0) {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y <= currentYear + 9; y++) {
        add(y, { icon: "💰", text: `Tax Refund ~$${Math.round(ngSummary.totalAnnualTaxBenefit / 1000)}k`, type: "tax" });
      }
    }
    return map;
  }, [properties, ordersRaw, cryptoOrdersRaw, ngSummary]);

  const masterCFData = useMemo(() => {
    if (cashFlowView === "monthly") {
      // ── MONTHLY mode: use monthly cashFlowSeries ──────────────────────────
      return cashFlowSeries.map((m: any) => {
        // For monthly data, attach milestone for that month's year only once
        // (we attach milestones on the first month of each year that has them)
        const isJan = m.month === 1;
        const ms = isJan ? (milestonesPerYear.get(m.year) ?? []) : [];
        return {
          label:       m.label,          // "Jan 2026", "Feb 2026", …
          income:      m.income ?? 0,
          expenses:    m.totalExpenses ?? 0,
          mortgage:    m.mortgageRepayment ?? 0,
          rental:      m.rentalIncome ?? 0,
          ngRefund:    m.ngTaxBenefit ?? 0,
          netCF:       m.netCashFlow ?? 0,
          balance:     m.cumulativeBalance ?? 0,
          investments: 0,
          _milestones: ms,
        };
      });
    }
    // ── ANNUAL mode (default) ─────────────────────────────────────────────
    return cashFlowAnnual.map((a: any) => {
      const yr = a.year as number;
      const ms = milestonesPerYear.get(yr) ?? [];
      // Deduplicate milestones by type (keep only first tax refund per year)
      const seen = new Set<string>();
      const dedupMs = ms.filter(m => {
        if (m.type === "tax") { if (seen.has("tax")) return false; seen.add("tax"); }
        return true;
      });
      return {
        label:       String(yr),
        income:      a.income ?? 0,
        expenses:    a.totalExpenses ?? 0,
        mortgage:    a.mortgageRepayment ?? 0,
        rental:      a.rentalIncome ?? 0,
        ngRefund:    a.ngTaxBenefit ?? 0,
        netCF:       a.netCashFlow ?? 0,
        balance:     a.endingBalance ?? 0,
        investments: 0,
        _milestones: dedupMs,
      };
    });
  }, [cashFlowView, cashFlowSeries, cashFlowAnnual, milestonesPerYear]);

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
      { label: "IP Readiness",  value: `${depositReady}%`, sub: "deposit ready", Icon: Building2, alert: depositReady < 30, _pct: depositReady },
      { label: "FIRE Age",      value: `~${fireAge}`, sub: "est. financial freedom", Icon: Clock, alert: fireAge > 60 },
      { label: "Hidden Money",  value: `${formatCurrency(hiddenMonthly * 12, true)}/yr`, sub: "potential savings", Icon: Eye, alert: hiddenMonthly > 500 },
    ];
  }, [snap, surplus, savingsRate, stocksTotal, cryptoTotal]);

  const fireCard        = wealthCards.find(c => c.label === "FIRE Age");
  const fireProgress    = wealthCards.find(c => c.label === "FIRE Progress");
  const emergencyCard   = wealthCards.find(c => c.label === "Emergency");
  const ipCard          = wealthCards.find(c => c.label === "IP Readiness");
  const depositPct      = parseInt(ipCard?.value ?? "0");
  const firePct         = parseInt(String((fireProgress as any)?._pct ?? "0"));

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
          WEALTH FLOW BANNER
          ═════════════════════════════════════════════════════════════════ */}
      <WealthFlowBanner />

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
          KPI CARDS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

        {/* cash projection cards */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Current Cash</div>
            <div className="text-lg font-bold text-foreground tabular-nums">{maskValue(formatCurrency(snap.cash + snap.offset_balance, true), privacyMode)}</div>
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
          WEALTH HEALTH CARDS (6 cards — paired evenly on mobile & desktop)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          {/* Emergency Buffer — moved here so it pairs with Hidden Money on mobile */}
          <div className={`rounded-xl border p-4 bg-card ${(snap.cash + snap.offset_balance) < snap.monthly_expenses * 3 ? "border-red-500/30" : "border-border"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emergency Buffer</span>
              <Shield className={`w-3.5 h-3.5 ${(snap.cash + snap.offset_balance) < snap.monthly_expenses * 3 ? "text-red-400" : "text-muted-foreground"}`} />
            </div>
            <div className={`text-lg font-bold ${(snap.cash + snap.offset_balance) >= snap.monthly_expenses * 3 ? "text-emerald-400" : "text-red-400"}`}>
              {(snap.cash + snap.offset_balance) >= snap.monthly_expenses * 3 ? "Healthy" : "Low"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">${Math.round(snap.monthly_expenses * 3 / 1000)}k reserve target</div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          WEALTH DECISION CENTER
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4">
        {/* Section header */}
        <div className="mb-4">
          <div className="text-lg font-bold text-foreground tracking-tight">Wealth Decision Center</div>
          <div className="text-xs text-muted-foreground mt-0.5">Your money today, future path, and next best moves.</div>
        </div>

        {/* Main layout: 70% chart + 30% panel */}
        <div className="flex flex-col lg:flex-row gap-4">

          {/* LEFT: Interactive Smart Chart — Fix 7: overflow-hidden prevents mobile bleed */}
          <div className="flex-[7] min-w-0 rounded-2xl border border-border bg-card p-5 overflow-hidden">

            {/* Tab bar */}
            <div className="flex gap-1 mb-4 flex-wrap">
              {(["CASH","EVENTS","WEALTH","RISK"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setWdcTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    wdcTab === tab
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground border border-transparent hover:text-foreground hover:border-border"
                  }`}
                >
                  {tab}
                </button>
              ))}
              {wdcTab === "CASH" && (
                <div className="ml-auto flex gap-1.5 items-center flex-wrap">
                  {/* Monthly / Annual toggle — Fix 2: drives masterCFData switch */}
                  <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40">
                    <button
                      className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                        cashFlowView === "annual"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setChartView("annual")}
                    >Annual</button>
                    <button
                      className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                        cashFlowView === "monthly"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setChartView("monthly")}
                    >Monthly</button>
                  </div>
                  <div className="w-px h-4 bg-border/60" />
                  <button
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${ngRefundMode === "lump-sum" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground border border-border hover:text-foreground"}`}
                    onClick={() => setNgRefundMode("lump-sum")}
                  >Lump-sum</button>
                  <button
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${ngRefundMode === "payg" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground border border-border hover:text-foreground"}`}
                    onClick={() => setNgRefundMode("payg")}
                  >PAYG</button>
                </div>
              )}
              {wdcTab === "WEALTH" && (
                <div className="ml-auto flex gap-1">
                  {(["1Y","3Y","10Y"] as const).map(r => (
                    <button key={r} onClick={() => setChartRange(r)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-all ${chartRange === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground border border-border"}`}
                    >{r}</button>
                  ))}
                </div>
              )}
            </div>

            {/* TAB: CASH */}
            {wdcTab === "CASH" && (
              <>
                {/* KPI chips */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: cashFlowView === "monthly" ? "Cash Today" : "Cash Today",      val: formatCurrency(cfFirst.balance ?? 0, true), color: "hsl(210,80%,65%)" },
                    { label: cashFlowView === "monthly" ? `${cashFlowSeries[cashFlowSeries.length-1]?.label ?? "Future"} Cash` : `${new Date().getFullYear()+9} Cash`, val: formatCurrency(cfLast.balance ?? 0, true), color: "hsl(142,60%,52%)" },
                    { label: cashFlowView === "monthly" ? "Monthly Net CF" : "Annual Net CF", val: formatCurrency(cfFirst.netCF ?? 0, true), color: (cfFirst.netCF??0)>=0?"hsl(142,60%,52%)":"hsl(0,72%,58%)" },
                    { label: "Tax Refund/yr", val: `+${formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}`, color: "hsl(43,90%,58%)" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">{k.label}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: k.color }}>{maskValue(k.val, privacyMode)}</div>
                    </div>
                  ))}
                </div>

                {/* Chart type toggle — Fix 5 */}
                <div className="flex items-center gap-1 mb-3">
                  {(["combo", "line", "candlestick"] as const).map(ct => (
                    <button
                      key={ct}
                      onClick={() => setWdcChartType(ct)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        wdcChartType === ct
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "text-muted-foreground border border-border/50 hover:text-foreground"
                      }`}
                    >
                      {ct === "combo" ? "Combo" : ct === "line" ? "Line" : "Candlestick"}
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {wdcChartType === "combo" ? "Balance line + Net CF bars" : wdcChartType === "line" ? "Cash balance only" : "OHLC balance movement"}
                  </span>
                </div>

                {/* Chart — Fix 1: increased height to 360px, Fix 7: responsive */}
                <div className="w-full" style={{ height: 360 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {wdcChartType === "line" ? (
                      <LineChart data={masterCFData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="wdcBalGradLine" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="hsl(210,80%,62%)" stopOpacity={0.20} />
                            <stop offset="100%" stopColor="hsl(210,80%,62%)" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)", fontWeight: 600 }} axisLine={false} tickLine={false}
                          interval={cashFlowView === "monthly" ? Math.floor(masterCFData.length / 8) : 0} />
                        <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip content={<CashflowTooltip />} cursor={{ stroke: "hsl(215,12%,40%)", strokeWidth: 1 }} />
                        {masterCFData.map((d: any) =>
                          d._milestones?.length > 0 ? (
                            <ReferenceLine key={d.label} yAxisId="bal" x={d.label}
                              stroke="hsl(43,80%,50%)" strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1} />
                          ) : null
                        )}
                        <Line yAxisId="bal" type="monotone" dataKey="balance" name="Cash Balance"
                          stroke="hsl(210,80%,65%)" strokeWidth={2.5}
                          dot={<MilestoneDot />} activeDot={{ r: 5, fill: "hsl(210,80%,65%)", strokeWidth: 0 }} />
                      </LineChart>
                    ) : wdcChartType === "candlestick" ? (
                      // Candlestick — use ComposedChart with a custom Bar showing OHLC-style balance movement
                      // open = prev year balance, close = this year balance, bar height = |close-open|
                      <ComposedChart
                        data={masterCFData.map((d: any, i: number) => ({
                          ...d,
                          open:   i === 0 ? d.balance : (masterCFData[i-1] as any).balance,
                          close:  d.balance,
                          high:   Math.max(d.balance, i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                          low:    Math.min(d.balance, i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                          barY:   Math.min(d.balance, i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                          barH:   Math.abs(d.balance - (i === 0 ? d.balance : (masterCFData[i-1] as any).balance)),
                          isUp:   d.balance >= (i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                        }))}
                        margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)", fontWeight: 600 }} axisLine={false} tickLine={false}
                          interval={cashFlowView === "monthly" ? Math.floor(masterCFData.length / 8) : 0} />
                        <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip content={<CashflowTooltip />} cursor={{ fill: "hsl(222,15%,16%)", fillOpacity: 0.5 }} />
                        {masterCFData.map((d: any) =>
                          d._milestones?.length > 0 ? (
                            <ReferenceLine key={d.label} yAxisId="bal" x={d.label}
                              stroke="hsl(43,80%,50%)" strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1} />
                          ) : null
                        )}
                        {/* Candlestick body bar */}
                        <Bar yAxisId="bal" dataKey="balance" name="Cash Balance" radius={[3,3,0,0]} maxBarSize={28}>
                          {masterCFData.map((d: any, i: number) => {
                            const prevBal = i === 0 ? d.balance : (masterCFData[i-1] as any).balance;
                            const isUp = d.balance >= prevBal;
                            return <Cell key={i} fill={isUp ? "hsl(142,55%,40%)" : "hsl(0,65%,50%)"} fillOpacity={0.85} />;
                          })}
                        </Bar>
                        {/* Wick line rendered as an Area with near-zero width */}
                        <Line yAxisId="bal" type="monotone" dataKey="balance" name="Trend"
                          stroke="hsl(210,80%,65%)" strokeWidth={1.5} dot={false} strokeDasharray="3 3" strokeOpacity={0.4} />
                      </ComposedChart>
                    ) : (
                      // DEFAULT: Combo — Balance area + Net CF bars
                      <ComposedChart data={masterCFData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="wdcBalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="hsl(210,80%,62%)" stopOpacity={0.20} />
                            <stop offset="100%" stopColor="hsl(210,80%,62%)" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)", fontWeight: 600 }} axisLine={false} tickLine={false}
                          interval={cashFlowView === "monthly" ? Math.floor(masterCFData.length / 8) : 0} />
                        <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                        <YAxis yAxisId="cf" orientation="right" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip content={<CashflowTooltip />} cursor={{ fill: "hsl(222,15%,16%)", fillOpacity: 0.6 }} />
                        <ReferenceLine yAxisId="cf" y={0} stroke="hsl(222,15%,26%)" strokeDasharray="3 3" />
                        {masterCFData.map((d: any) =>
                          d._milestones?.length > 0 ? (
                            <ReferenceLine key={d.label} yAxisId="bal" x={d.label}
                              stroke="hsl(43,80%,50%)" strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1} />
                          ) : null
                        )}
                        <Bar yAxisId="cf" dataKey="netCF" name="Net Cashflow" radius={[3,3,0,0]} maxBarSize={32}>
                          {masterCFData.map((d: any, i: number) => (
                            <Cell key={i} fill={(d.netCF??0)>=0 ? "hsl(142,55%,40%)" : "hsl(0,65%,50%)"} fillOpacity={0.7} />
                          ))}
                        </Bar>
                        <Area yAxisId="bal" type="monotone" dataKey="balance" name="Cash Balance"
                          stroke="hsl(210,80%,65%)" strokeWidth={2.5} fill="url(#wdcBalGrad)"
                          dot={<MilestoneDot />} activeDot={{ r: 5, fill: "hsl(210,80%,65%)", strokeWidth: 0 }} />
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* Legend row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-6 h-0.5 rounded" style={{ background: "hsl(210,80%,65%)" }} />Cash Balance
                  </div>
                  {wdcChartType !== "line" && (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(142,55%,40%)", opacity: 0.8 }} />{wdcChartType === "candlestick" ? "Up" : "Net CF +"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(0,65%,50%)", opacity: 0.8 }} />{wdcChartType === "candlestick" ? "Down" : "Net CF −"}
                      </div>
                    </>
                  )}
                  <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1">
                    {[
                      { icon: "🏠", label: "Property",   color: "hsl(188,65%,52%)" },
                      { icon: "📈", label: "Stocks",     color: "hsl(210,80%,65%)" },
                      { icon: "₿",  label: "Crypto",     color: "hsl(262,70%,65%)" },
                      { icon: "💰", label: "Tax Refund", color: "hsl(43,90%,58%)"  },
                    ].map(m => (
                      <div key={m.label} className="flex items-center gap-1 text-xs" style={{ color: m.color }}>
                        <span>{m.icon}</span><span style={{ opacity: 0.8 }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* TAB: EVENTS */}
            {wdcTab === "EVENTS" && (
              <div className="py-1">
                <div className="text-xs text-muted-foreground mb-5">Milestone timeline — your wealth journey mapped out</div>
                <div className="relative">
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-0">
                    {[
                      { year: new Date().getFullYear(), icon: "📍", label: "Deposit Build", sub: `${maskValue(formatCurrency(snap.cash + snap.offset_balance, true), privacyMode)} liquid today`, color: "hsl(210,80%,65%)", active: true },
                      ...((properties as any[]).filter((p: any) => p.type !== "ppor" && p.settlement_date).map((p: any) => ({
                        year: new Date(p.settlement_date).getFullYear(),
                        icon: "🏠",
                        label: `Buy IP — ${p.label || (p.address ?? "").split(",")[0] || "Investment Property"}`,
                        sub: `Deposit ~${maskValue(formatCurrency(p.deposit ?? 0, true), privacyMode)} · Loan ${maskValue(formatCurrency(p.loan_amount ?? 0, true), privacyMode)}`,
                        color: "hsl(188,65%,52%)",
                        active: false,
                      }))),
                      ...((ordersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date).slice(0,2).map((o: any) => ({
                        year: new Date(o.planned_date).getFullYear(),
                        icon: "📈",
                        label: `Stocks — ${maskValue(formatCurrency(o.total_cost ?? o.amount ?? 0, true), privacyMode)}`,
                        sub: new Date(o.planned_date).toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
                        color: "hsl(210,80%,65%)",
                        active: false,
                      }))),
                      ...((cryptoOrdersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date).slice(0,2).map((o: any) => ({
                        year: new Date(o.planned_date).getFullYear(),
                        icon: "₿",
                        label: `Crypto — ${maskValue(formatCurrency(o.total_cost ?? o.amount ?? 0, true), privacyMode)}`,
                        sub: new Date(o.planned_date).toLocaleDateString("en-AU", { month: "short", year: "numeric" }),
                        color: "hsl(262,70%,65%)",
                        active: false,
                      }))),
                      { year: new Date().getFullYear()+4, icon: "🔄", label: "Refinance", sub: "Review loan structure", color: "hsl(43,90%,58%)", active: false },
                      { year: new Date().getFullYear()+6, icon: "✅", label: "Debt Reduction", sub: "Aggressive paydown begins", color: "hsl(142,60%,52%)", active: false },
                      { year: parseInt(fireCard?.value?.replace("~","") ?? String(new Date().getFullYear()+9)), icon: "🔥", label: "FIRE Ready", sub: `Target age ${fireCard?.value ?? "—"} · ${maskValue(formatCurrency(fireTargetAmt, true), privacyMode)} portfolio`, color: "hsl(20,90%,60%)", active: false },
                    ]
                    .sort((a, b) => a.year - b.year)
                    .map((ev, i) => (
                      <div key={i} className="flex items-start gap-4 pb-6 last:pb-0 relative">
                        <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 border-2 ${ev.active ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                          {ev.icon}
                        </div>
                        <div className="pt-1.5 flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold tabular-nums" style={{ color: ev.color }}>{ev.year}</span>
                            <span className="text-sm font-semibold text-foreground truncate">{ev.label}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{ev.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: WEALTH */}
            {wdcTab === "WEALTH" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: "Net Worth Now",   val: formatCurrency(netWorth, true),    color: "hsl(210,80%,65%)" },
                    { label: "Total Assets",    val: formatCurrency(totalAssets, true), color: "hsl(142,60%,52%)" },
                    { label: "Total Debt",      val: formatCurrency(totalLiab, true),   color: "hsl(0,72%,58%)"   },
                    { label: `${new Date().getFullYear()+9} NW`, val: formatCurrency(year10NW, true), color: "hsl(43,90%,58%)" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">{k.label}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: k.color }}>{maskValue(k.val, privacyMode)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredNWData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wdcNWGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(210,75%,55%)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="hsl(210,75%,55%)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="wdcAssetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(142,55%,42%)" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="hsl(142,55%,42%)" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="nw" orientation="left" tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                      <YAxis yAxisId="debt" orientation="right" tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={44} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar yAxisId="debt" dataKey="liabilities" name="Debt" fill="hsl(0,65%,50%)" fillOpacity={0.45} radius={[2,2,0,0]} maxBarSize={20} />
                      <Area yAxisId="nw" type="monotone" dataKey="assets" name="Total Assets" stroke="hsl(142,55%,42%)" strokeWidth={1.5} fill="url(#wdcAssetGrad)" dot={false} />
                      <Area yAxisId="nw" type="monotone" dataKey="netWorth" name="Net Worth" stroke="hsl(210,75%,60%)" strokeWidth={2.5} fill="url(#wdcNWGrad)" dot={false} activeDot={{ r: 5, fill: "hsl(210,75%,60%)", strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
                  {assetAllocData.map((d: any) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                      {d.name} <span className="font-semibold text-foreground">{d.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TAB: RISK */}
            {wdcTab === "RISK" && (() => {
              const liquidCash = snap.cash + snap.offset_balance;
              const totalMonthlyOut = snap.monthly_expenses + monthlyMortgageRepay;
              const monthsCov = totalMonthlyOut > 0 ? liquidCash / totalMonthlyOut : 0;
              const debtRatio = snap.monthly_income > 0 ? totalLiab / (snap.monthly_income * 12) : 0;
              const propPct = totalAssets > 0 ? (snap.ppor / totalAssets) * 100 : 0;
              const mktPct = totalAssets > 0 ? ((stocksTotal + cryptoTotal) / totalAssets) * 100 : 0;
              const risks = [
                { label: "Liquidity Risk",         score: monthsCov >= 6 ? 10 : monthsCov >= 3 ? 40 : monthsCov >= 1 ? 70 : 95, detail: `${monthsCov.toFixed(1)} months covered`,         color: monthsCov >= 6 ? "hsl(142,55%,45%)" : monthsCov >= 3 ? "hsl(43,90%,52%)" : "hsl(0,72%,55%)",   rating: monthsCov >= 6 ? "Low" : monthsCov >= 3 ? "Moderate" : "High" },
                { label: "Debt Risk",               score: debtRatio <= 3 ? 15 : debtRatio <= 5 ? 40 : debtRatio <= 8 ? 65 : 90, detail: `Debt/income: ${debtRatio.toFixed(1)}×`,         color: debtRatio <= 3 ? "hsl(142,55%,45%)" : debtRatio <= 5 ? "hsl(43,90%,52%)" : "hsl(0,72%,55%)",    rating: debtRatio <= 3 ? "Low" : debtRatio <= 5 ? "Moderate" : "High" },
                { label: "Income Dependency",       score: 65,                                                                    detail: "Single primary income source",                  color: "hsl(43,90%,52%)",                                                                                 rating: "Moderate" },
                { label: "Property Concentration",  score: propPct >= 70 ? 75 : propPct >= 50 ? 50 : 20,                         detail: `${propPct.toFixed(0)}% of assets in property`,  color: propPct >= 70 ? "hsl(0,72%,55%)" : propPct >= 50 ? "hsl(43,90%,52%)" : "hsl(142,55%,45%)",       rating: propPct >= 70 ? "High" : propPct >= 50 ? "Moderate" : "Low" },
                { label: "Market Risk",             score: mktPct >= 30 ? 60 : mktPct >= 15 ? 35 : 15,                          detail: `${mktPct.toFixed(0)}% in stocks & crypto`,      color: mktPct >= 30 ? "hsl(43,90%,52%)" : "hsl(142,55%,45%)",                                            rating: mktPct >= 30 ? "Moderate" : "Low" },
              ];
              const overallScore = Math.round(risks.reduce((s, r) => s + r.score, 0) / risks.length);
              const overallColor = overallScore >= 60 ? "hsl(0,72%,55%)" : overallScore >= 35 ? "hsl(43,90%,52%)" : "hsl(142,55%,45%)";
              const overallRating = overallScore >= 60 ? "High" : overallScore >= 35 ? "Moderate" : "Low";
              return (
                <>
                  <div className="flex items-center gap-4 mb-5 px-4 py-3 rounded-xl border border-border bg-background/60">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Overall Risk Score</div>
                      <div className="text-2xl font-bold tabular-nums" style={{ color: overallColor }}>{overallScore}<span className="text-sm font-normal text-muted-foreground ml-0.5">/100</span></div>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Rating</div>
                      <div className="text-base font-bold" style={{ color: overallColor }}>{overallRating} Risk</div>
                    </div>
                    <div className="ml-auto flex-1 max-w-[160px]">
                      <div className="h-2 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${overallScore}%`, background: overallColor }} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {risks.map(r => (
                      <div key={r.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{r.label}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: `${r.color}22`, color: r.color }}>{r.rating}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{r.detail}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-border overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

          </div>

          {/* RIGHT: Decision Cards */}
          <div className="flex-[3] min-w-0 flex flex-col gap-3">

            {/* 1. BEST MOVE NOW */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Best Move Now</span>
              </div>
              <div className="text-sm font-semibold text-foreground leading-snug mb-1">{bestMoveTitle}</div>
              <div className="text-xs text-muted-foreground">{bestMoveImpact}</div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${bestMoveUrgency === "High" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>{bestMoveUrgency} Priority</span>
                <Link href={bestMoveHref}><span className="text-xs text-primary hover:underline">Take Action →</span></Link>
              </div>
            </div>

            {/* 2. NEXT MAJOR EVENT */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-sky-400">Next Major Event</span>
              </div>
              {nextPropEvent ? (
                <>
                  <div className="text-sm font-semibold text-foreground mb-0.5">{nextPropEvent.label}</div>
                  <div className="text-xs text-muted-foreground">{nextPropEvent.monthKey}</div>
                  <div className="mt-2.5"><Link href="/financial-plan"><span className="text-xs text-primary hover:underline">View Plan →</span></Link></div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">No upcoming events scheduled</div>
              )}
            </div>

            {/* 3. CASH WARNING */}
            <div className={`rounded-2xl border p-4 ${lowestFutureCash < 20000 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${lowestFutureCash < 20000 ? "bg-red-500/15" : "bg-emerald-500/15"}`}>
                  <AlertTriangle className={`w-3.5 h-3.5 ${lowestFutureCash < 20000 ? "text-red-400" : "text-emerald-400"}`} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${lowestFutureCash < 20000 ? "text-red-400" : "text-emerald-400"}`}>Cash {lowestFutureCash < 20000 ? "Warning" : "Health"}</span>
              </div>
              <div className="text-sm font-semibold text-foreground mb-0.5">Lowest projected: {maskValue(formatCurrency(lowestFutureCash, true), privacyMode)}</div>
              <div className="text-xs text-muted-foreground">{lowestFutureCash < 5000 ? "⚠️ Critical — review purchase timing" : lowestFutureCash < 20000 ? "Monitor closely around major purchases" : "Comfortable buffer maintained"}</div>
            </div>

            {/* 4. OPPORTUNITY */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Opportunity</span>
              </div>
              <div className="text-sm font-semibold text-foreground mb-0.5">Tax refund: {maskValue(`+${formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}/yr`, privacyMode)}</div>
              <div className="text-xs text-muted-foreground">{ngProperties.length > 0 ? `${ngProperties.length} negatively geared ${ngProperties.length === 1 ? "property" : "properties"} active` : "Add IPs to unlock NG benefits"}</div>
              <div className="mt-2.5"><Link href="/tax-strategy"><span className="text-xs text-primary hover:underline">Tax Strategy →</span></Link></div>
            </div>

            {/* 5. FIRE TRACKER */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-orange-400">FIRE Tracker</span>
              </div>
              <div className="text-sm font-semibold text-foreground mb-0.5">Target age: {fireCard?.value ?? "—"}</div>
              <div className="text-xs text-muted-foreground mb-2">{maskValue(formatCurrency(fireCurrentAmt, true), privacyMode)} of {maskValue(formatCurrency(fireTargetAmt, true), privacyMode)} target</div>
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${Math.min(100, fireProgressPct)}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-muted-foreground">{fireProgressPct.toFixed(0)}% funded</span>
                <Link href="/wealth-strategy"><span className="text-xs text-primary hover:underline">FIRE Plan →</span></Link>
              </div>
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

      {/* BEST MOVE CARD — Saturday Morning Bulletin removed from homepage (lives in Actions menu) */}
      <div className="px-4 pb-4">
        <BestMoveCard />
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
