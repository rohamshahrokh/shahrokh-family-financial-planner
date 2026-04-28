/**
 * PortfolioLiveReturn.tsx
 *
 * Premium widget: Portfolio Weighted Live Return
 * Shows real daily P&L, weighted by actual holdings + live prices.
 *
 * Data sources:
 *   stocks   → sf_stocks  (current_holding = units, annual_lump_sum = avg buy price, current_price = last known)
 *   crypto   → sf_crypto  (current_holding = units, lump_sum_amount  = avg buy price, current_price = last known)
 *   snapshot → cash, ppor (optional)
 *
 * Live prices fetched via marketData.ts multi-source engine.
 * Refresh every 5 minutes. AUD conversion applied.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import PrivacyMask from "@/components/PrivacyMask";
import {
  TrendingUp, TrendingDown, RefreshCw, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Activity, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";
import {
  fetchAllStockPrices, fetchAllCryptoPrices, fetchAudUsdRate,
  formatLastUpdated, isStaleByAge,
  type PriceEntry,
} from "@/lib/marketData";
import { safeNum, formatCurrency, formatPct } from "@/lib/finance";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HoldingCalc {
  symbol: string;
  name: string;
  type: "stock" | "crypto";
  units: number;
  avgBuyPrice: number;        // USD
  currentPriceUSD: number;    // live USD price
  currentPriceAUD: number;    // live AUD price
  currentValueAUD: number;
  costBasisAUD: number;
  dailyChangeAUD: number;     // today's $ contribution
  totalPnlAUD: number;        // unrealised gain/loss vs avg buy
  dailyChangePct: number;     // asset's own 24h %
  weightPct: number;          // portfolio weight
  stale: boolean;
}

interface PortfolioStats {
  totalValueAUD: number;
  totalCostAUD: number;
  totalPnlAUD: number;
  totalPnlPct: number;
  dailyReturnAUD: number;     // sum of weighted daily moves
  dailyReturnPct: number;
  cashAUD: number;
  netWorthAUD: number;        // portfolio + cash
  bestContributors: HoldingCalc[];
  worstContributors: HoldingCalc[];
  holdings: HoldingCalc[];
}

// ─── Chart data (simulated intraday approximation) ────────────────────────────
// We don't have tick data, so we build a plausible intraday curve
// from yesterday close → current value using live 24h change.
function buildIntradayChart(stats: PortfolioStats): { t: string; value: number }[] {
  const points: { t: string; value: number }[] = [];
  const endVal = stats.totalValueAUD;
  const startVal = endVal - stats.dailyReturnAUD;
  const hours = 8; // market hours 10am–6pm
  for (let i = 0; i <= hours; i++) {
    const progress = i / hours;
    // Smooth S-curve approximation
    const smooth = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const value = startVal + (endVal - startVal) * smooth;
    const hour = 10 + i;
    points.push({ t: `${hour}:00`, value: Math.round(value) });
  }
  return points;
}

// ─── Smart insight generator ──────────────────────────────────────────────────
function generateInsight(stats: PortfolioStats): string {
  if (stats.holdings.length === 0) return "Add holdings to see portfolio insights.";
  const positive = stats.dailyReturnAUD >= 0;
  const top = stats.bestContributors[0];
  const worst = stats.worstContributors[0];

  if (positive) {
    const drivers = stats.bestContributors.slice(0, 2).map(h => h.name).join(" and ");
    if (stats.dailyReturnPct > 1.5) {
      return `Strong day. Gains driven mainly by ${drivers} strength. Portfolio up ${formatPct(stats.dailyReturnPct)} today.`;
    }
    if (worst && worst.dailyChangeAUD < -100) {
      return `Portfolio advanced despite drag from ${worst.name}. ${top?.name ?? "Top holding"} led gains.`;
    }
    return `Portfolio edging higher, supported by ${drivers}. Steady momentum across holdings.`;
  } else {
    const laggards = stats.worstContributors.slice(0, 2).map(h => h.name).join(" and ");
    if (stats.dailyReturnPct < -1.5) {
      return `Portfolio declined ${formatPct(Math.abs(stats.dailyReturnPct))} today due to ${laggards} weakness.`;
    }
    return `Minor pullback led by ${laggards}. Core portfolio value remains intact.`;
  }
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
const gain = "text-emerald-400";
const loss  = "text-red-400";
const neutral = "text-foreground";
const gainBg = "bg-emerald-500/10 border-emerald-500/20";
const lossBg  = "bg-red-500/10 border-red-500/20";

function signed(n: number) { return n >= 0 ? gain : loss; }
function signedBg(n: number) { return n >= 0 ? gainBg : lossBg; }

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  compact?: boolean;  // compact mode for stocks/crypto page sidebars
}

export default function PortfolioLiveReturn({ compact = false }: Props) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => <PrivacyMask value={v} isHidden={privacyMode} />;

  const [livePrices, setLivePrices] = useState<Record<string, PriceEntry>>({});
  const [audRate, setAudRate] = useState(0.65);
  const [fetching, setFetching] = useState(false);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(!compact);
  const [showChart, setShowChart] = useState(false);
  const [chartRange, setChartRange] = useState<"1D" | "1W" | "1M" | "YTD">("1D");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
    staleTime: 0,
  });

  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
    staleTime: 0,
  });

  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
    staleTime: 0,
  });

  const cashAUD = safeNum(snapshot?.cash);

  // ── Live price fetch ────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (fetching) return;
    if (stocks.length === 0 && cryptos.length === 0) return;
    setFetching(true);

    try {
      const [rate, stockResult, cryptoResult] = await Promise.all([
        fetchAudUsdRate(),
        fetchAllStockPrices(
          stocks.map((s: any) => s.ticker),
          (ticker, entry) => setLivePrices(prev => ({ ...prev, [ticker]: entry }))
        ),
        fetchAllCryptoPrices(
          cryptos.map((c: any) => c.symbol),
          (sym, entry) => setLivePrices(prev => ({ ...prev, [sym.toUpperCase()]: entry }))
        ),
      ]);

      setAudRate(rate);
      setLivePrices(prev => ({
        ...prev,
        ...stockResult,
        ...Object.fromEntries(Object.entries(cryptoResult).map(([k, v]) => [k.toUpperCase(), v])),
      }));
      setLastFetch(Date.now());
    } finally {
      setFetching(false);
    }
  }, [stocks, cryptos, fetching]);

  // Auto-refresh on mount + every 5 min
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 5 * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [stocks.length, cryptos.length]); // re-init when holdings change

  // ── Portfolio calculations ──────────────────────────────────────────────────
  const stats: PortfolioStats = useMemo(() => {
    const holdings: HoldingCalc[] = [];

    // Stocks
    for (const s of stocks) {
      const ticker = (s.ticker ?? "").toUpperCase();
      const units = safeNum(s.current_holding);
      if (units <= 0) continue;
      const avgBuyPrice = safeNum(s.annual_lump_sum); // stored avg buy price
      const liveEntry = livePrices[ticker];
      // Use live price if available, else fall back to stored current_price
      const currentPriceUSD = liveEntry?.price || safeNum(s.current_price);
      const change24h = liveEntry?.change24h ?? 0;
      const prevPriceUSD = currentPriceUSD / (1 + change24h / 100);
      const currentPriceAUD = currentPriceUSD / audRate;
      const prevPriceAUD    = prevPriceUSD / audRate;
      const currentValueAUD = units * currentPriceAUD;
      const costBasisAUD    = avgBuyPrice > 0 ? units * (avgBuyPrice / audRate) : 0;
      const dailyChangeAUD  = units * (currentPriceAUD - prevPriceAUD);
      const totalPnlAUD     = costBasisAUD > 0 ? currentValueAUD - costBasisAUD : 0;

      holdings.push({
        symbol: ticker, name: s.name ?? ticker, type: "stock",
        units, avgBuyPrice, currentPriceUSD, currentPriceAUD,
        currentValueAUD, costBasisAUD, dailyChangeAUD, totalPnlAUD,
        dailyChangePct: change24h, weightPct: 0,
        stale: liveEntry ? isStaleByAge(liveEntry.fetchedAt) : true,
      });
    }

    // Crypto
    for (const c of cryptos) {
      const sym = (c.symbol ?? "").toUpperCase();
      const units = safeNum(c.current_holding);
      if (units <= 0) continue;
      const avgBuyPrice = safeNum(c.lump_sum_amount);
      const liveEntry = livePrices[sym];
      const currentPriceUSD = liveEntry?.price || safeNum(c.current_price);
      const change24h = liveEntry?.change24h ?? 0;
      const prevPriceUSD = currentPriceUSD / (1 + change24h / 100);
      const currentPriceAUD = currentPriceUSD / audRate;
      const prevPriceAUD    = prevPriceUSD / audRate;
      const currentValueAUD = units * currentPriceAUD;
      const costBasisAUD    = avgBuyPrice > 0 ? units * (avgBuyPrice / audRate) : 0;
      const dailyChangeAUD  = units * (currentPriceAUD - prevPriceAUD);
      const totalPnlAUD     = costBasisAUD > 0 ? currentValueAUD - costBasisAUD : 0;

      holdings.push({
        symbol: sym, name: c.name ?? sym, type: "crypto",
        units, avgBuyPrice, currentPriceUSD, currentPriceAUD,
        currentValueAUD, costBasisAUD, dailyChangeAUD, totalPnlAUD,
        dailyChangePct: change24h, weightPct: 0,
        stale: liveEntry ? isStaleByAge(liveEntry.fetchedAt) : true,
      });
    }

    const totalValueAUD = holdings.reduce((s, h) => s + h.currentValueAUD, 0);
    const totalCostAUD  = holdings.reduce((s, h) => s + h.costBasisAUD, 0);
    const totalPnlAUD   = totalValueAUD - totalCostAUD;
    const totalPnlPct   = totalCostAUD > 0 ? (totalPnlAUD / totalCostAUD) * 100 : 0;
    const dailyReturnAUD = holdings.reduce((s, h) => s + h.dailyChangeAUD, 0);
    const prevTotalAUD   = totalValueAUD - dailyReturnAUD;
    const dailyReturnPct = prevTotalAUD > 0 ? (dailyReturnAUD / prevTotalAUD) * 100 : 0;

    // Weights
    if (totalValueAUD > 0) {
      for (const h of holdings) {
        h.weightPct = (h.currentValueAUD / totalValueAUD) * 100;
      }
    }

    const sorted = [...holdings].sort((a, b) => b.dailyChangeAUD - a.dailyChangeAUD);
    const bestContributors  = sorted.filter(h => h.dailyChangeAUD > 0).slice(0, 3);
    const worstContributors = sorted.filter(h => h.dailyChangeAUD < 0).reverse().slice(0, 3);

    return {
      totalValueAUD, totalCostAUD, totalPnlAUD, totalPnlPct,
      dailyReturnAUD, dailyReturnPct,
      cashAUD,
      netWorthAUD: totalValueAUD + cashAUD,
      bestContributors, worstContributors,
      holdings,
    };
  }, [stocks, cryptos, livePrices, audRate, cashAUD]);

  const chartData = useMemo(() => buildIntradayChart(stats), [stats]);
  const insight   = useMemo(() => generateInsight(stats), [stats]);
  const anyStale  = stats.holdings.some(h => h.stale);
  const isEmpty   = stats.holdings.length === 0;
  const isUp      = stats.dailyReturnAUD >= 0;

  // ── No holdings state ────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Portfolio Live Return</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Add stock and crypto holdings to see your real-time weighted return here.
        </p>
      </div>
    );
  }

  // ── Compact mode (for sidebar/smaller sections) ───────────────────────────
  if (compact) {
    return (
      <div className={`rounded-xl border p-4 space-y-3 ${signedBg(stats.dailyReturnAUD)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold">Live Return</span>
            {anyStale && <AlertTriangle className="w-3 h-3 text-amber-400" title="Some prices are stale" />}
          </div>
          <button
            onClick={refresh}
            disabled={fetching}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh prices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <div className={`text-xl font-bold font-mono ${signed(stats.dailyReturnAUD)}`}>
              {mv(`${isUp ? "+" : ""}${formatCurrency(stats.dailyReturnAUD)}`)}
            </div>
            <div className={`text-xs font-mono ${signed(stats.dailyReturnPct)}`}>
              {formatPct(stats.dailyReturnPct)} today
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">Portfolio</div>
            <div className="text-sm font-semibold">{mv(formatCurrency(stats.totalValueAUD))}</div>
          </div>
        </div>

        {lastFetch && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatLastUpdated(lastFetch)}
          </div>
        )}
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-border/50">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "hsl(43,85%,55%)" }}
        >
          <Activity className="w-3.5 h-3.5" style={{ color: "hsl(224,40%,8%)" }} />
        </div>
        <div>
          <h2 className="text-sm font-bold leading-none">Portfolio Weighted Live Return</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Real holdings · Live prices · AUD weighted</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {anyStale && (
            <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> Stale data
            </span>
          )}
          {lastFetch && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />{formatLastUpdated(lastFetch)}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={fetching}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Updating..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Today Return — largest */}
        <div className={`md:col-span-1 rounded-xl border p-4 ${signedBg(stats.dailyReturnAUD)}`}>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            {isUp ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
            Today Return
          </div>
          <div className={`text-2xl font-bold font-mono ${signed(stats.dailyReturnAUD)}`}>
            {mv(`${isUp ? "+" : ""}${formatCurrency(stats.dailyReturnAUD)}`)}
          </div>
          <div className={`text-sm font-mono mt-0.5 ${signed(stats.dailyReturnPct)}`}>
            {formatPct(stats.dailyReturnPct)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Since yesterday close</div>
        </div>

        {/* Portfolio Value */}
        <div className="rounded-xl border border-border bg-secondary/20 p-4">
          <div className="text-xs text-muted-foreground mb-1">Portfolio Value</div>
          <div className="text-xl font-bold font-mono">{mv(formatCurrency(stats.totalValueAUD))}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.holdings.length} positions · {stats.holdings.filter(h => h.type === "stock").length}S {stats.holdings.filter(h => h.type === "crypto").length}C
          </div>
        </div>

        {/* Net Invested */}
        <div className="rounded-xl border border-border bg-secondary/20 p-4">
          <div className="text-xs text-muted-foreground mb-1">Net Invested</div>
          <div className="text-xl font-bold font-mono">{mv(formatCurrency(stats.totalCostAUD))}</div>
          <div className={`text-xs font-mono mt-1 ${signed(stats.totalPnlAUD)}`}>
            {stats.totalPnlAUD >= 0 ? "+" : ""}{formatCurrency(stats.totalPnlAUD)} ({formatPct(stats.totalPnlPct)})
          </div>
        </div>

        {/* Total Gain/Loss */}
        <div className={`rounded-xl border p-4 ${signedBg(stats.totalPnlAUD)}`}>
          <div className="text-xs text-muted-foreground mb-1">Total Unrealised P&amp;L</div>
          <div className={`text-xl font-bold font-mono ${signed(stats.totalPnlAUD)}`}>
            {mv(`${stats.totalPnlAUD >= 0 ? "+" : ""}${formatCurrency(stats.totalPnlAUD)}`)}
          </div>
          <div className={`text-sm font-mono ${signed(stats.totalPnlPct)}`}>
            {formatPct(stats.totalPnlPct)} on cost
          </div>
        </div>

        {/* Cash */}
        <div className="rounded-xl border border-border bg-secondary/20 p-4">
          <div className="text-xs text-muted-foreground mb-1">Cash (Snapshot)</div>
          <div className="text-xl font-bold font-mono">{mv(formatCurrency(cashAUD))}</div>
          <div className="text-xs text-muted-foreground mt-1">From financial snapshot</div>
        </div>

        {/* Net Worth */}
        <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
          <div className="text-xs text-muted-foreground mb-1">Investments + Cash</div>
          <div className="text-xl font-bold font-mono">{mv(formatCurrency(stats.netWorthAUD))}</div>
          <div className="text-xs text-muted-foreground mt-1">Excludes property</div>
        </div>
      </div>

      {/* Smart Insight */}
      <div className="mx-5 mb-4 rounded-lg bg-secondary/40 border border-border/50 px-4 py-3 flex items-start gap-2">
        <Zap className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
      </div>

      {/* Breakdown toggle */}
      <button
        className="w-full flex items-center justify-between px-5 py-3 border-t border-border/50 hover:bg-secondary/20 transition-colors"
        onClick={() => setShowBreakdown(s => !s)}
      >
        <span className="text-xs font-semibold">Position Breakdown &amp; Contributors</span>
        {showBreakdown ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {showBreakdown && (
        <div className="px-5 pb-5 space-y-4">
          {/* Best / Worst contributors */}
          <div className="grid grid-cols-2 gap-4">
            {/* Best */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Best Today
              </p>
              {stats.bestContributors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No gains today</p>
              ) : stats.bestContributors.map(h => (
                <div key={h.symbol} className="flex items-center justify-between py-1 px-2 rounded bg-emerald-500/8">
                  <span className="text-xs font-mono font-semibold">{h.symbol}</span>
                  <span className="text-xs font-mono text-emerald-400">
                    {mv(`+${formatCurrency(h.dailyChangeAUD)}`)}
                  </span>
                </div>
              ))}
            </div>
            {/* Worst */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Worst Today
              </p>
              {stats.worstContributors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No losses today</p>
              ) : stats.worstContributors.map(h => (
                <div key={h.symbol} className="flex items-center justify-between py-1 px-2 rounded bg-red-500/8">
                  <span className="text-xs font-mono font-semibold">{h.symbol}</span>
                  <span className="text-xs font-mono text-red-400">
                    {mv(formatCurrency(h.dailyChangeAUD))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Full holdings table */}
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Symbol</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Weight</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Value (AUD)</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Today</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">24h %</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Total P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.holdings].sort((a, b) => b.currentValueAUD - a.currentValueAUD).map(h => (
                  <tr key={h.symbol} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold">{h.symbol}</span>
                      {h.stale && <span className="ml-1 text-amber-400 text-xs" title="Stale price">⚠</span>}
                      <span className="ml-1 text-muted-foreground capitalize text-xs opacity-60">{h.type[0]}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground font-mono">
                      {h.weightPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {mv(formatCurrency(h.currentValueAUD))}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${signed(h.dailyChangeAUD)}`}>
                      {mv(`${h.dailyChangeAUD >= 0 ? "+" : ""}${formatCurrency(h.dailyChangeAUD)}`)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${signed(h.dailyChangePct)}`}>
                      {formatPct(h.dailyChangePct)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${signed(h.totalPnlAUD)}`}>
                      {mv(`${h.totalPnlAUD >= 0 ? "+" : ""}${formatCurrency(h.totalPnlAUD)}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-secondary/30 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">100%</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {mv(formatCurrency(stats.totalValueAUD))}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${signed(stats.dailyReturnAUD)}`}>
                    {mv(`${isUp ? "+" : ""}${formatCurrency(stats.dailyReturnAUD)}`)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${signed(stats.dailyReturnPct)}`}>
                    {formatPct(stats.dailyReturnPct)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${signed(stats.totalPnlAUD)}`}>
                    {mv(`${stats.totalPnlAUD >= 0 ? "+" : ""}${formatCurrency(stats.totalPnlAUD)}`)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Chart toggle */}
      <button
        className="w-full flex items-center justify-between px-5 py-3 border-t border-border/50 hover:bg-secondary/20 transition-colors"
        onClick={() => setShowChart(s => !s)}
      >
        <span className="text-xs font-semibold">Portfolio Value Chart</span>
        {showChart ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {showChart && (
        <div className="px-5 pb-5">
          {/* Range picker */}
          <div className="flex gap-1 mb-4">
            {(["1D", "1W", "1M", "YTD"] as const).map(r => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  chartRange === r
                    ? "text-background font-semibold"
                    : "text-muted-foreground hover:text-foreground bg-secondary/50"
                }`}
                style={chartRange === r ? { background: "hsl(43,85%,55%)", color: "hsl(224,40%,8%)" } : {}}
              >
                {r}
              </button>
            ))}
          </div>
          {/* Note for non-1D ranges */}
          {chartRange !== "1D" && (
            <div className="text-xs text-muted-foreground mb-3 bg-secondary/30 rounded px-3 py-2">
              Historical chart requires connected price history data. Showing today's estimated intraday curve.
            </div>
          )}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: any) => [`$${Number(v).toLocaleString("en-AU")}`, "Portfolio"]}
                />
                <ReferenceLine
                  y={stats.totalValueAUD - stats.dailyReturnAUD}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={isUp ? "#34d399" : "#f87171"}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Estimated intraday · Based on 24h price moves · Actual prices from live sources
          </p>
        </div>
      )}
    </div>
  );
}
