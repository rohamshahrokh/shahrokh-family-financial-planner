/**
 * market-news.tsx — Wall Street Terminal
 * Dark terminal aesthetic, dense data layout.
 * Data fetched via /api/market-data (client-side, cached 45 min in localStorage)
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  Activity,
  Newspaper,
  BarChart2,
  Zap,
  Globe,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/finance";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PriceEntry {
  price: number;
  change: number;
}

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

interface MarketData {
  prices: Record<string, PriceEntry>;
  indices: Record<string, PriceEntry>;
  news: Record<string, NewsArticle[]>;
  fearGreed: number | null;
  fearGreedLabel?: string;
  lastUpdated: string;
  dataStatus?: string;        // "live" | "partial" | "cached" | "failed"
  stale?: boolean;            // true when served from localStorage fallback
  staleAgeMin?: number;       // minutes since cache was written
  failedSymbols?: string[];   // symbols that returned no data
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WATCHLIST_ASSETS = [
  { symbol: "NVDA", name: "NVIDIA", sector: "AI Chips" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Mega-cap Tech" },
  { symbol: "MSFT", name: "Microsoft", sector: "Mega-cap Tech" },
  { symbol: "AVGO", name: "Broadcom", sector: "AI Chips" },
  { symbol: "CEG", name: "Constellation Energy", sector: "Nuclear/Energy" },
  { symbol: "CCJ", name: "Cameco", sector: "Uranium" },
  { symbol: "WPM", name: "Wheaton Precious Metals", sector: "Precious Metals" },
  { symbol: "BTC", name: "Bitcoin", sector: "Crypto" },
  { symbol: "ETH", name: "Ethereum", sector: "Crypto" },
];

const PULSE_CARDS = [
  { label: "S&P 500", key: "SP500", source: "indices", decimals: 2 },
  { label: "Nasdaq", key: "NASDAQ", source: "indices", decimals: 2 },
  { label: "Dow", key: "DOW", source: "indices", decimals: 0 },
  { label: "VIX", key: "VIX", source: "indices", decimals: 2 },
  { label: "USD/AUD", key: "USDAUD", source: "indices", decimals: 4 },
  { label: "Gold", key: "GOLD", source: "indices", decimals: 2 },
  { label: "Oil", key: "OIL", source: "indices", decimals: 2 },
  { label: "BTC", key: "BTC", source: "prices", decimals: 0 },
  { label: "ETH", key: "ETH", source: "prices", decimals: 2 },
] as const;

const NEWS_TABS = [
  { key: "stocks", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "tech", label: "AI & Tech" },
  { key: "macro", label: "Macro" },
  { key: "australia", label: "Australia" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function getSignal(change: number): { label: string; color: string; bg: string } {
  if (change > 2) return { label: "Strong Buy", color: "text-emerald-400", bg: "bg-emerald-900/40 border-emerald-700" };
  if (change > 0) return { label: "Buy", color: "text-green-400", bg: "bg-green-900/40 border-green-700" };
  if (change > -2) return { label: "Hold", color: "text-amber-400", bg: "bg-amber-900/40 border-amber-700" };
  if (change > -5) return { label: "Watch", color: "text-orange-400", bg: "bg-orange-900/40 border-orange-700" };
  return { label: "Risk", color: "text-red-400", bg: "bg-red-900/40 border-red-700" };
}

function formatPubDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

function fgColor(val: number): string {
  if (val <= 25) return "text-red-500";
  if (val <= 45) return "text-orange-400";
  if (val <= 55) return "text-amber-400";
  if (val <= 75) return "text-green-400";
  return "text-emerald-400";
}

function fgBg(val: number): string {
  if (val <= 25) return "bg-red-500";
  if (val <= 45) return "bg-orange-400";
  if (val <= 55) return "bg-amber-400";
  if (val <= 75) return "bg-green-400";
  return "bg-emerald-400";
}

function fgLabel(val: number): string {
  if (val <= 25) return "Extreme Fear";
  if (val <= 45) return "Fear";
  if (val <= 55) return "Neutral";
  if (val <= 75) return "Greed";
  return "Extreme Greed";
}

function formatPrice(val: number, decimals: number): string {
  if (!val && val !== 0) return "—";
  if (decimals === 0) return val.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  return val.toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (module-level to prevent focus loss)
// ─────────────────────────────────────────────────────────────────────────────

function PulseCard({
  label,
  price,
  change,
  decimals,
}: {
  label: string;
  price: number;
  change: number;
  decimals: number;
}) {
  const isPos = change >= 0;
  const hasData = price > 0;
  return (
    <div className="flex-shrink-0 min-w-[120px] bg-card border border-border rounded-lg p-3 hover:border-primary/40 transition-colors">
      <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-bold text-zinc-100 font-mono">
        {hasData ? formatPrice(price, decimals) : <span className="text-zinc-600">—</span>}
      </div>
      {hasData ? (
        <div className={`flex items-center gap-0.5 mt-1 text-xs font-mono ${isPos ? "text-emerald-400" : "text-red-400"}`}>
          {isPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {isPos ? "+" : ""}{change.toFixed(2)}%
        </div>
      ) : (
        <div className="text-xs text-zinc-600 mt-1 font-mono">loading…</div>
      )}
    </div>
  );
}

function WatchlistRow({
  asset,
  priceData,
  privacyMode,
}: {
  asset: typeof WATCHLIST_ASSETS[number];
  priceData: PriceEntry | undefined;
  privacyMode: boolean;
}) {
  const price = priceData?.price ?? 0;
  const change = priceData?.change ?? 0;
  const hasData = price > 0;
  const signal = getSignal(change);
  const isPos = change >= 0;

  const formatAssetPrice = (sym: string, p: number) => {
    if (!hasData) return "—";
    if (sym === "BTC") return p.toLocaleString("en-AU", { maximumFractionDigits: 0 });
    if (sym === "ETH") return p.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return p.toFixed(2);
  };

  return (
    <tr className="border-b border-border hover:bg-secondary/20 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono font-bold text-zinc-100 text-sm">{asset.symbol}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-zinc-400 text-sm">{asset.name}</span>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-zinc-100 text-sm">
          {privacyMode ? "••••" : (hasData ? `$${formatAssetPrice(asset.symbol, price)}` : "—")}
        </span>
      </td>
      <td className="px-4 py-3">
        {hasData ? (
          <div className={`flex items-center gap-1 font-mono text-sm ${isPos ? "text-emerald-400" : "text-red-400"}`}>
            {isPos ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {isPos ? "+" : ""}{change.toFixed(2)}%
          </div>
        ) : (
          <span className="text-zinc-600 text-sm font-mono">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-1 rounded border ${signal.bg} ${signal.color}`}>
          {signal.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">{asset.sector}</span>
      </td>
    </tr>
  );
}

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <div className="border-b border-border py-3 hover:bg-secondary/20 transition-colors px-2 -mx-2 rounded">
      <a
        href={article.link || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-zinc-100 text-sm hover:text-blue-400 transition-colors leading-snug block mb-1"
      >
        {article.title}
      </a>
      {article.description && (
        <p className="text-xs text-zinc-400 leading-relaxed mb-1 line-clamp-2">{article.description}</p>
      )}
      {article.pubDate && (
        <span className="text-xs text-zinc-600 font-mono">{formatPubDate(article.pubDate)}</span>
      )}
    </div>
  );
}

function SectorTile({
  name,
  mood,
}: {
  name: string;
  mood: "Bullish" | "Neutral" | "Bearish" | "Risk" | "High Risk" | "Elevated" | "Normal";
}) {
  const moodConfig = {
    Bullish: { bg: "bg-emerald-900/40 border-emerald-700", badge: "bg-emerald-700 text-emerald-100", dot: "bg-emerald-400" },
    Neutral: { bg: "bg-amber-900/30 border-amber-800", badge: "bg-amber-700 text-amber-100", dot: "bg-amber-400" },
    Bearish: { bg: "bg-red-900/30 border-red-800", badge: "bg-red-800 text-red-100", dot: "bg-red-400" },
    Risk: { bg: "bg-orange-900/30 border-orange-800", badge: "bg-orange-700 text-orange-100", dot: "bg-orange-400" },
    "High Risk": { bg: "bg-red-900/50 border-red-700", badge: "bg-red-700 text-red-100", dot: "bg-red-400" },
    Elevated: { bg: "bg-orange-900/40 border-orange-800", badge: "bg-orange-700 text-orange-100", dot: "bg-orange-400" },
    Normal: { bg: "bg-green-900/30 border-green-800", badge: "bg-green-800 text-green-100", dot: "bg-green-400" },
  };
  const cfg = moodConfig[mood] ?? moodConfig.Neutral;

  return (
    <div className={`border rounded-lg p-4 ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className="text-sm font-semibold text-zinc-200">{name}</span>
      </div>
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{mood}</span>
    </div>
  );
}

function SignalBadge({ type }: { type: "buy" | "alert" | "risk" | "breakout" | "info" }) {
  const configs = {
    buy: "bg-emerald-900/40 border-emerald-700 text-emerald-400",
    alert: "bg-red-900/40 border-red-700 text-red-400",
    risk: "bg-orange-900/40 border-orange-700 text-orange-400",
    breakout: "bg-blue-900/40 border-blue-700 text-blue-400",
    info: "bg-secondary border-border text-muted-foreground",
  };
  const icons = {
    buy: <TrendingUp size={14} />,
    alert: <AlertTriangle size={14} />,
    risk: <Activity size={14} />,
    breakout: <Zap size={14} />,
    info: <Minus size={14} />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-semibold ${configs[type]}`}>
      {icons[type]}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-zinc-400 font-mono text-lg tracking-wide">Loading market data…</span>
      </div>
      <div className="w-full max-w-4xl space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-secondary/60 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function MarketNewsPage() {
  const { privacyMode, togglePrivacy } = useAppStore();
  const { toast } = useToast();
  const [activeNewsTab, setActiveNewsTab] = useState<string>("stocks");

  const { data: marketData, isLoading, error, refetch } = useQuery<MarketData>({
    queryKey: ["/api/market-data"],
    queryFn: () => apiRequest("GET", "/api/market-data").then((r) => r.json()),
    staleTime: 45 * 60 * 1000,
    retry: 2,
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const prices = marketData?.prices ?? {};
  const indices = marketData?.indices ?? {};
  const news = marketData?.news ?? {};
  const fearGreed = marketData?.fearGreed ?? null;
  const fearGreedLabel = marketData?.fearGreedLabel ?? (fearGreed !== null ? fgLabel(fearGreed) : "");

  // Signals
  const signals = useMemo(() => {
    const list: { type: "buy" | "alert" | "risk" | "breakout" | "info"; text: string }[] = [];
    for (const asset of WATCHLIST_ASSETS) {
      const p = prices[asset.symbol];
      if (!p) continue;
      if (p.change > 3) list.push({ type: "buy", text: `Buy Zone — ${asset.symbol} up +${p.change.toFixed(1)}%` });
      if (p.change < -5) list.push({ type: "alert", text: `Portfolio Alert — ${asset.symbol} down ${p.change.toFixed(1)}%` });
    }
    const vix = indices["VIX"];
    if (vix && vix.price > 25) list.push({ type: "risk", text: `Macro Risk — VIX elevated at ${vix.price.toFixed(1)}` });
    const btc = prices["BTC"];
    if (btc && btc.change > 5) list.push({ type: "breakout", text: `Crypto Breakout — BTC up +${btc.change.toFixed(1)}%` });
    if (list.length === 0) list.push({ type: "info", text: "No active signals" });
    return list;
  }, [prices, indices]);

  // Sector moods
  const sectorMoods = useMemo(() => {
    const avgChange = (syms: string[]) => {
      const vals = syms.map((s) => prices[s]?.change).filter((v) => v !== undefined) as number[];
      if (vals.length === 0) return 0;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const mood = (avg: number): "Bullish" | "Neutral" | "Bearish" => {
      if (avg > 1) return "Bullish";
      if (avg > -1) return "Neutral";
      return "Bearish";
    };
    const vixPrice = indices["VIX"]?.price ?? 0;
    const macroMood = vixPrice > 25 ? "High Risk" : vixPrice > 20 ? "Elevated" : "Normal";

    return [
      { name: "AI Stocks", mood: mood(avgChange(["NVDA", "AVGO"])) },
      { name: "Mega-cap Tech", mood: mood(avgChange(["GOOGL", "MSFT"])) },
      { name: "Crypto", mood: mood(avgChange(["BTC", "ETH"])) },
      { name: "Uranium / Energy", mood: mood(avgChange(["CEG", "CCJ"])) },
      { name: "Precious Metals", mood: mood(avgChange(["WPM"])) },
      { name: "Macro Risk", mood: macroMood },
    ] as { name: string; mood: "Bullish" | "Neutral" | "Bearish" | "Risk" | "High Risk" | "Elevated" | "Normal" }[];
  }, [prices, indices]);

  // AI brief
  const marketBrief = useMemo(() => {
    if (!marketData) return null;
    const sp = indices["SP500"];
    const nas = indices["NASDAQ"];
    const dow = indices["DOW"];
    const spStr = sp ? `S&P 500 ${sp.change >= 0 ? "+" : ""}${sp.change.toFixed(2)}%` : null;
    const nasStr = nas ? `Nasdaq ${nas.change >= 0 ? "+" : ""}${nas.change.toFixed(2)}%` : null;
    const dowStr = dow ? `Dow ${dow.change >= 0 ? "+" : ""}${dow.change.toFixed(2)}%` : null;
    const indexSummary = [spStr, nasStr, dowStr].filter(Boolean).join(", ") || "Index data unavailable";

    const topMovers = WATCHLIST_ASSETS
      .map((a) => ({ ...a, change: prices[a.symbol]?.change ?? 0 }))
      .filter((a) => a.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 3);

    const topMoverStr = topMovers.length
      ? topMovers.map((a) => `${a.symbol} ${a.change >= 0 ? "+" : ""}${a.change.toFixed(1)}%`).join(", ")
      : "No significant movers";

    const actionSignals = signals.filter((s) => s.type !== "info");
    const actionStr = actionSignals.length
      ? actionSignals.map((s) => s.text).join("; ")
      : "Markets steady, no urgent action signals";

    return { indexSummary, topMoverStr, actionStr };
  }, [marketData, indices, prices, signals]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRefresh = () => {
    try {
      localStorage.removeItem("sf_market_data_cache");
      localStorage.removeItem("sf_market_data_cache_v2");
    } catch {}
    refetch();
    toast({ title: "Refreshing market data…", description: "Cache cleared. Fetching fresh data." });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton />;

  if (error && !marketData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-100">Failed to load market data</h2>
          <p className="text-zinc-400 text-sm">{String(error)}</p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 mx-auto bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors font-semibold"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Status helpers ─────────────────────────────────────────────────────────
  const isStale = marketData?.stale === true;
  const staleAge = marketData?.staleAgeMin ?? 0;
  const dataStatus = marketData?.dataStatus ?? (isStale ? "cached" : "live");
  const failedSymbols = marketData?.failedSymbols ?? [];

  const statusBadge = (() => {
    if (isStale) return { label: `Cached ${staleAge > 0 ? `(${staleAge}m ago)` : ""}`, cls: "bg-amber-900/40 border-amber-700 text-amber-400" };
    if (dataStatus === "partial") return { label: "Partial", cls: "bg-amber-900/40 border-amber-700 text-amber-400" };
    if (dataStatus === "failed")  return { label: "Failed",  cls: "bg-red-900/40 border-red-700 text-red-400" };
    return { label: "Live", cls: "bg-emerald-900/40 border-emerald-700 text-emerald-400" };
  })();

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-900/40 border border-emerald-700 p-2 rounded-lg">
              <TrendingUp className="text-emerald-400 w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Wall Street Terminal</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {marketData?.lastUpdated && (
                  <p className="text-xs text-zinc-500 font-mono">
                    Updated {new Date(marketData.lastUpdated).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
                {marketData && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${statusBadge.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isStale || dataStatus === "failed" ? "bg-amber-400" :
                      dataStatus === "partial" ? "bg-amber-400" : "bg-emerald-400"
                    } animate-pulse`} />
                    {statusBadge.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => togglePrivacy()}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors font-semibold ${
                privacyMode
                  ? "bg-amber-900/40 border-amber-700 text-amber-400"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {privacyMode ? <EyeOff size={13} /> : <Eye size={13} />}
              {privacyMode ? "Private" : "Public"}
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-xs bg-secondary hover:bg-secondary/70 border border-border text-foreground px-3 py-1.5 rounded-lg transition-colors font-semibold"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Stale / degraded banner ── */}
      {isStale && (
        <div className="bg-amber-900/30 border-b border-amber-800/60 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
              <AlertTriangle size={13} />
              Showing cached data{staleAge > 0 ? ` from ${staleAge} minute${staleAge !== 1 ? "s" : ""} ago` : ""} — live feed unavailable.
              {failedSymbols.length > 0 && (
                <span className="text-amber-500/80 font-mono ml-1">(failed: {failedSymbols.join(", ")})</span>
              )}
            </div>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 text-xs bg-amber-800/40 hover:bg-amber-700/60 border border-amber-700 text-amber-300 px-2.5 py-1 rounded transition-colors font-semibold"
            >
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        </div>
      )}
      {!isStale && dataStatus === "partial" && failedSymbols.length > 0 && (
        <div className="bg-amber-900/20 border-b border-amber-900/40 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-500 text-xs">
            <AlertTriangle size={12} />
            Partial data — some symbols unavailable: <span className="font-mono">{failedSymbols.join(", ")}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 pt-6 space-y-8">

        {/* ── Market Pulse ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="text-emerald-400 w-4 h-4" />
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Market Pulse</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            {PULSE_CARDS.map((card) => {
              const src = card.source === "indices" ? indices : prices;
              const entry = src[card.key as string];
              return (
                <PulseCard
                  key={card.key}
                  label={card.label}
                  price={entry?.price ?? 0}
                  change={entry?.change ?? 0}
                  decimals={card.decimals}
                />
              );
            })}
          </div>
        </section>

        {/* ── Main grid: Watchlist + Fear&Greed ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Watchlist — 2 columns wide */}
          <section className="xl:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="text-blue-400 w-4 h-4" />
              <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Portfolio Watchlist</h2>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-4 py-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">Symbol</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">Price</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">24h</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wider">Signal</th>
                    <th className="px-4 py-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {WATCHLIST_ASSETS.map((asset) => (
                    <WatchlistRow
                      key={asset.symbol}
                      asset={asset}
                      priceData={prices[asset.symbol]}
                      privacyMode={privacyMode}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Fear & Greed + Signals */}
          <div className="space-y-6">
            {/* Fear & Greed */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="text-amber-400 w-4 h-4" />
                <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Fear & Greed</h2>
              </div>
              <div className="bg-card border border-border rounded-xl p-6 text-center">
                {fearGreed !== null ? (
                  <>
                    <div className={`text-6xl font-black font-mono mb-2 ${fgColor(fearGreed)}`}>
                      {fearGreed}
                    </div>
                    <div className={`text-sm font-bold mb-4 ${fgColor(fearGreed)}`}>
                      {fearGreedLabel || fgLabel(fearGreed)}
                    </div>
                    {/* Bar */}
                    <div className="relative h-3 bg-secondary rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all ${fgBg(fearGreed)}`}
                        style={{ width: `${fearGreed}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-zinc-600 font-mono">
                      <span>0 Fear</span>
                      <span>100 Greed</span>
                    </div>
                    {/* Scale labels */}
                    <div className="grid grid-cols-5 gap-0.5 mt-3 text-xs">
                      {["Ext. Fear", "Fear", "Neutral", "Greed", "Ext. Greed"].map((l, i) => (
                        <div key={l} className={`text-center py-1 rounded text-xs font-mono ${
                          fearGreed <= 25 && i === 0 ? "bg-red-700 text-red-100" :
                          fearGreed > 25 && fearGreed <= 45 && i === 1 ? "bg-orange-700 text-orange-100" :
                          fearGreed > 45 && fearGreed <= 55 && i === 2 ? "bg-amber-700 text-amber-100" :
                          fearGreed > 55 && fearGreed <= 75 && i === 3 ? "bg-green-700 text-green-100" :
                          fearGreed > 75 && i === 4 ? "bg-emerald-700 text-emerald-100" :
                          "text-zinc-600"
                        }`}>
                          {l}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-zinc-600 font-mono py-8">Data unavailable</div>
                )}
              </div>
            </section>

            {/* Signals & Alerts */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="text-orange-400 w-4 h-4" />
                <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Signals & Alerts</h2>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                {signals.map((sig, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <SignalBadge type={sig.type} />
                    <div>
                      <p className="text-sm text-zinc-200">{sig.text}</p>
                      <p className="text-xs text-zinc-600 font-mono mt-0.5">
                        {new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ── Heat Map + AI Brief ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Sector Heat Map */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="text-purple-400 w-4 h-4" />
              <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Sector Mood</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sectorMoods.map((s) => (
                <SectorTile key={s.name} name={s.name} mood={s.mood} />
              ))}
            </div>
          </section>

          {/* AI Market Brief */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="text-blue-400 w-4 h-4" />
              <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Daily Market Brief</h2>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              {marketBrief ? (
                <>
                  <div>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">What happened</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{marketBrief.indexSummary}</p>
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Portfolio focus</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{marketBrief.topMoverStr}</p>
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Action</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{marketBrief.actionStr}</p>
                  </div>
                </>
              ) : (
                <p className="text-zinc-600 font-mono text-sm">Loading brief…</p>
              )}
            </div>
          </section>
        </div>

        {/* ── News Intelligence ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Newspaper className="text-zinc-400 w-4 h-4" />
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">News Intelligence</h2>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-4 overflow-x-auto border-b border-border pb-px">
            {NEWS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveNewsTab(tab.key)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${
                  activeNewsTab === tab.key
                    ? "border-emerald-500 text-emerald-400 bg-emerald-900/20"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Article list */}
          <div className="bg-card border border-border rounded-xl p-4">
            {(() => {
              const articles = news[activeNewsTab] ?? [];
              if (articles.length === 0) {
                return (
                  <div className="text-center py-12 text-zinc-600">
                    <Globe className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="font-mono text-sm">No articles loaded for this feed.</p>
                    <p className="text-xs mt-1">RSS feeds may be blocked by CORS proxy. Try refreshing.</p>
                  </div>
                );
              }
              return (
                <div className="space-y-0 divide-y divide-zinc-800">
                  {articles.map((article, i) => (
                    <ArticleCard key={`${activeNewsTab}-${i}`} article={article} />
                  ))}
                </div>
              );
            })()}
          </div>
        </section>

      </div>
    </div>
  );
}
