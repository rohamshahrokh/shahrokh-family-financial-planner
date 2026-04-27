import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Newspaper,
  Bitcoin,
  BarChart2,
  Cpu,
  Globe,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Clock,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY = "sf_market_news_cache";
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes

// Multiple CORS proxies — tried in order until one works
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "all" | "stocks" | "crypto" | "ai-tech" | "macro";
type Language = "en" | "fa" | "both";
type Sentiment = "positive" | "neutral" | "negative";

interface NewsItem {
  id: string;
  title: string;
  title_fa?: string;
  summary: string;
  summary_fa?: string;
  source: string;
  url: string;
  published: string;
  section: "stocks" | "crypto" | "ai-tech" | "macro";
  sentiment: Sentiment;
  impact: string[];
  imageUrl?: string;
}

interface MarketPrices {
  sp500: number;
  sp500_chg: number;
  nasdaq: number;
  nasdaq_chg: number;
  dow: number;
  dow_chg: number;
  btc_aud: number;
  btc_chg: number;
  eth_aud: number;
  eth_chg: number;
  fear_greed: number;
  fear_greed_label: string;
  fetched_at: string;
}

interface NewsCache {
  items: NewsItem[];
  prices: MarketPrices;
  ai_summary: string[];
  fetched_at: string;
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

function loadCache(): NewsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewsCache;
    if (Date.now() - new Date(parsed.fetched_at).getTime() > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(data: NewsCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// ─── Sentiment Detection ──────────────────────────────────────────────────────

function detectSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();
  const pos = [
    "surge", "rally", "gain", "rise", "bull", "record", "high", "beat",
    "growth", "strong", "profit", "boost", "jump", "soar", "climb", "up",
    "breakthrough", "positive", "recover", "rebound", "outperform",
  ];
  const neg = [
    "crash", "fall", "drop", "bear", "loss", "decline", "sell-off", "fear",
    "risk", "recession", "weak", "cut", "plunge", "slump", "down", "warning",
    "concern", "trouble", "crisis", "collapse", "worst", "miss",
  ];
  const posCount = pos.filter((w) => lower.includes(w)).length;
  const negCount = neg.filter((w) => lower.includes(w)).length;
  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
}

// ─── Impact Tags ──────────────────────────────────────────────────────────────

function detectImpact(text: string): string[] {
  const lower = text.toLowerCase();
  const impacts: string[] = [];
  if (/stock|equity|s&p|nasdaq|dow|share|earnings|asx|dividend/.test(lower)) impacts.push("Stocks");
  if (/bitcoin|btc|ethereum|eth|crypto|defi|nft|blockchain|altcoin/.test(lower)) impacts.push("Crypto");
  if (/property|real estate|housing|mortgage|rba|rate|inflation|rent/.test(lower)) impacts.push("Property");
  if (/ai|artificial intelligence|nvidia|openai|gpt|llm|chip|semiconductor|machine learning/.test(lower)) impacts.push("AI");
  if (/economy|gdp|fed|reserve|macro|dollar|aud|usd|trade|tariff|bond|yield/.test(lower)) impacts.push("Economy");
  return impacts.length > 0 ? impacts : ["General"];
}

// ─── Approximate Persian Translations (word-substitution only) ────────────────

const FA_GLOSSARY: [RegExp, string][] = [
  [/\bstocks?\b/gi, "سهام"],
  [/\bmarkets?\b/gi, "بازار"],
  [/\bcrypto(currency)?\b/gi, "رمزارز"],
  [/\bbitcoin\b/gi, "بیتکوین"],
  [/\bethereum\b/gi, "اتریوم"],
  [/\binterest rates?\b/gi, "نرخ بهره"],
  [/\binflation\b/gi, "تورم"],
  [/\brecession\b/gi, "رکود"],
  [/\bgrowth\b/gi, "رشد"],
  [/\binvestors?\b/gi, "سرمایه‌گذار"],
  [/\btech(nology)?\b/gi, "فناوری"],
  [/\beconomy\b/gi, "اقتصاد"],
  [/\bfed(eral reserve)?\b/gi, "فدرال رزرو"],
  [/\bsurge\b/gi, "جهش"],
  [/\bcrash\b/gi, "سقوط"],
  [/\bdrop\b/gi, "افت"],
  [/\bgains?\b/gi, "سود"],
  [/\blosses?\b/gi, "زیان"],
  [/\bAI\b/g, "هوش مصنوعی"],
  [/\bproperty\b/gi, "ملک"],
  [/\bhousing\b/gi, "مسکن"],
  [/\bshares?\b/gi, "سهام"],
  [/\bdividend\b/gi, "سود سهام"],
  [/\bportfolio\b/gi, "سبد سرمایه‌گذاری"],
  [/\bRBA\b/g, "بانک مرکزی استرالیا"],
  [/\bASX\b/g, "بورس استرالیا"],
  [/\bNasdaq\b/gi, "نزدک"],
  [/\bS&P\b/gi, "اس‌اندپی"],
];

function approximatePersian(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FA_GLOSSARY) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// ─── RSS Parser ───────────────────────────────────────────────────────────────

function parseRSS(
  xmlText: string,
  section: NewsItem["section"],
  source: string,
  maxItems = 8
): NewsItem[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, maxItems);

    return items.map((item, i) => {
      const title = item.querySelector("title")?.textContent?.trim() ?? "Untitled";
      const link = item.querySelector("link")?.textContent?.trim() ??
        item.querySelector("guid")?.textContent?.trim() ?? "#";
      const desc = item.querySelector("description")?.textContent?.trim() ?? "";
      const pubDate = item.querySelector("pubDate")?.textContent?.trim() ?? new Date().toISOString();
      const imgEl = item.querySelector("enclosure[type^='image']");
      const imageUrl = imgEl?.getAttribute("url") ?? undefined;

      // Strip HTML from description
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = desc;
      const cleanDesc = (tempDiv.textContent ?? "").slice(0, 200).trim();
      const summary = cleanDesc || title;

      const sentiment = detectSentiment(title + " " + cleanDesc);
      const impact = detectImpact(title + " " + cleanDesc);

      const id = btoa(link + i).slice(0, 16).replace(/[^a-zA-Z0-9]/g, "_");

      return {
        id,
        title,
        title_fa: approximatePersian(title),
        summary,
        summary_fa: approximatePersian(summary),
        source,
        url: link,
        published: new Date(pubDate).toISOString(),
        section,
        sentiment,
        impact,
        imageUrl,
      } satisfies NewsItem;
    });
  } catch {
    return [];
  }
}

// ─── Fetch via CORS proxy with automatic fallback ───────────────────────────
// Tries each proxy in order; returns raw text content on success.

async function fetchProxied(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (const makeProxy of CORS_PROXIES) {
    try {
      const proxyUrl = makeProxy(url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      // allorigins wraps in JSON {contents:...}; others return raw text
      try {
        const json = JSON.parse(text);
        if (json?.contents) return json.contents as string;
      } catch { /* not JSON — return raw */ }
      if (text && text.length > 50) return text;
    } catch (e: any) {
      lastError = e;
    }
  }
  throw lastError ?? new Error(`All proxies failed for: ${url}`);
}

// ─── Fetch market price for a single ticker ───────────────────────────────────

async function fetchYahooTicker(
  ticker: string
): Promise<{ price: number; change: number }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const text = await fetchProxied(url);
    const json = JSON.parse(text);
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return { price: 0, change: 0 };
    return {
      price: meta.regularMarketPrice ?? 0,
      change: meta.regularMarketChangePercent ?? 0,
    };
  } catch {
    return { price: 0, change: 0 };
  }
}

// ─── Generate AI-style summary bullets ───────────────────────────────────────

function generateSummaryBullets(
  items: NewsItem[],
  prices: MarketPrices
): string[] {
  const bullets: string[] = [];

  // Price summary
  if (prices.sp500 > 0) {
    const dir = prices.sp500_chg >= 0 ? "▲" : "▼";
    bullets.push(
      `S&P 500 ${dir} ${Math.abs(prices.sp500_chg).toFixed(2)}% — markets ${prices.sp500_chg >= 0 ? "opened higher amid optimism" : "under pressure as investors reassess risk"}.`
    );
  }
  if (prices.btc_aud > 0) {
    const dir = prices.btc_chg >= 0 ? "▲" : "▼";
    bullets.push(
      `Bitcoin ${dir} ${Math.abs(prices.btc_chg).toFixed(2)}% in AUD — crypto sentiment ${prices.btc_chg >= 0 ? "bullish" : "bearish"}, Fear & Greed index at ${prices.fear_greed} (${prices.fear_greed_label}).`
    );
  }

  // Top news bullets by section
  const bySection: Record<string, NewsItem[]> = {
    stocks: [],
    crypto: [],
    "ai-tech": [],
    macro: [],
  };
  for (const item of items) {
    if (bySection[item.section]) bySection[item.section].push(item);
  }

  const topStocks = bySection.stocks[0];
  if (topStocks) {
    bullets.push(`📈 Stocks: "${topStocks.title.slice(0, 90)}" — ${topStocks.sentiment} signal.`);
  }

  const topCrypto = bySection.crypto[0];
  if (topCrypto) {
    bullets.push(`₿ Crypto: "${topCrypto.title.slice(0, 90)}" — watch for volatility.`);
  }

  const topAI = bySection["ai-tech"][0];
  if (topAI) {
    bullets.push(`🤖 AI/Tech: "${topAI.title.slice(0, 90)}" — relevant to tech holdings.`);
  }

  const topMacro = bySection.macro[0];
  if (topMacro) {
    bullets.push(`🌐 Macro: "${topMacro.title.slice(0, 90)}" — macro conditions shifting.`);
  }

  // Personalised note
  if (prices.fear_greed < 30) {
    bullets.push("Extreme fear in markets — historically a buying opportunity for long-term investors.");
  } else if (prices.fear_greed > 70) {
    bullets.push("Extreme greed detected — consider reviewing portfolio risk levels.");
  }

  return bullets.slice(0, 7);
}

// ─── "Why It Matters To Me" Insights ─────────────────────────────────────────

function generatePersonalInsights(
  items: NewsItem[],
  prices: MarketPrices
): { icon: string; color: string; text: string }[] {
  const insights: { icon: string; color: string; text: string }[] = [];

  // AI/Tech holdings
  const aiItems = items.filter((i) => i.impact.includes("AI") || i.section === "ai-tech");
  if (aiItems.length > 0) {
    insights.push({
      icon: "🤖",
      color: "text-purple-400",
      text: `${aiItems.length} AI/tech stories today — monitor Nvidia, AI ETF positions for potential moves.`,
    });
  }

  // Crypto
  if (prices.btc_aud > 0) {
    const sentiment = prices.btc_chg >= 0 ? "positive momentum" : "downward pressure";
    insights.push({
      icon: "₿",
      color: "text-amber-400",
      text: `BTC ${prices.btc_chg >= 0 ? "+" : ""}${prices.btc_chg.toFixed(1)}% — ${sentiment}. ETH ${prices.eth_aud > 0 ? (prices.eth_aud > 3000 ? "trading above" : "below") + " key levels" : "data unavailable"}.`,
    });
  }

  // Property / RBA
  const macroItems = items.filter((i) => i.section === "macro" || i.impact.includes("Property"));
  if (macroItems.length > 0) {
    insights.push({
      icon: "🏠",
      color: "text-blue-400",
      text: `${macroItems.length} macro/property stories — RBA rate path and AUD moves affect your PPOR valuation.`,
    });
  }

  // Stock market
  if (prices.sp500 > 0) {
    const dir = prices.sp500_chg >= 0 ? "up" : "down";
    insights.push({
      icon: "📊",
      color: "text-emerald-400",
      text: `S&P 500 ${dir} ${Math.abs(prices.sp500_chg).toFixed(1)}% — global equity sentiment affects ASX-listed positions and ETFs.`,
    });
  }

  // Fear & Greed
  if (prices.fear_greed > 0) {
    const label = prices.fear_greed < 25
      ? "Extreme fear — DCA opportunity for long-term positions"
      : prices.fear_greed > 75
      ? "Extreme greed — consider trimming overweight positions"
      : `Neutral sentiment (${prices.fear_greed}/100) — no immediate action needed`;
    insights.push({
      icon: "⚖️",
      color: "text-muted-foreground",
      text: label,
    });
  }

  return insights.slice(0, 5);
}

// ─── Main data fetch ──────────────────────────────────────────────────────────

async function fetchAllMarketData(): Promise<NewsCache> {
  // 1. Fetch prices in parallel
  const [sp500, nasdaq, dow, btcAud, ethAud, fearGreedRes] = await Promise.allSettled([
    fetchYahooTicker("%5EGSPC"),
    fetchYahooTicker("%5EIXIC"),
    fetchYahooTicker("%5EDJI"),
    fetchYahooTicker("BTC-AUD"),
    fetchYahooTicker("ETH-AUD"),
    fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .catch(() => null),
  ]);

  const sp500Data = sp500.status === "fulfilled" ? sp500.value : { price: 0, change: 0 };
  const nasdaqData = nasdaq.status === "fulfilled" ? nasdaq.value : { price: 0, change: 0 };
  const dowData = dow.status === "fulfilled" ? dow.value : { price: 0, change: 0 };
  const btcData = btcAud.status === "fulfilled" ? btcAud.value : { price: 0, change: 0 };
  const ethData = ethAud.status === "fulfilled" ? ethAud.value : { price: 0, change: 0 };

  let fearGreedVal = 50;
  let fearGreedLabel = "Neutral";
  if (fearGreedRes.status === "fulfilled" && fearGreedRes.value) {
    const fng = fearGreedRes.value?.data?.[0];
    if (fng) {
      fearGreedVal = parseInt(fng.value ?? "50", 10);
      fearGreedLabel = fng.value_classification ?? "Neutral";
    }
  }

  const prices: MarketPrices = {
    sp500: sp500Data.price,
    sp500_chg: sp500Data.change,
    nasdaq: nasdaqData.price,
    nasdaq_chg: nasdaqData.change,
    dow: dowData.price,
    dow_chg: dowData.change,
    btc_aud: btcData.price,
    btc_chg: btcData.change,
    eth_aud: ethData.price,
    eth_chg: ethData.change,
    fear_greed: fearGreedVal,
    fear_greed_label: fearGreedLabel,
    fetched_at: new Date().toISOString(),
  };

  // 2. Fetch CoinGecko crypto news directly (no proxy needed — open CORS)
  const cryptoItemsPromise: Promise<NewsItem[]> = fetch(
    "https://api.coingecko.com/api/v3/news?per_page=8",
    { signal: AbortSignal.timeout(8000) }
  )
    .then((r) => r.json())
    .then((data: any) => {
      const items: any[] = data?.data ?? data?.results ?? [];
      return items.slice(0, 8).map((n: any, i: number) => {
        const title = n.title ?? n.name ?? "Crypto News";
        const url   = n.url ?? n.news_url ?? "#";
        const desc  = n.description ?? n.text ?? title;
        return {
          id: btoa(url + i).slice(0, 16).replace(/[^a-zA-Z0-9]/g, "_"),
          title,
          title_fa: approximatePersian(title),
          summary: desc.slice(0, 200),
          summary_fa: approximatePersian(desc.slice(0, 200)),
          source: n.source?.name ?? n.source ?? "CoinGecko",
          url,
          published: n.updated_at ? new Date(n.updated_at * 1000).toISOString() : new Date().toISOString(),
          section: "crypto" as const,
          sentiment: detectSentiment(title + " " + desc),
          impact: detectImpact(title + " " + desc),
          imageUrl: n.thumb_2x ?? n.large ?? undefined,
        } satisfies NewsItem;
      });
    })
    .catch(() => [] as NewsItem[]);

  // 3. Fetch RSS feeds in parallel — multiple sources per section for resilience
  const RSS_FEEDS: { url: string; section: NewsItem["section"]; source: string }[] = [
    // Stocks — try MarketWatch first (reliable), Yahoo Finance as fallback
    { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",       section: "stocks",  source: "MarketWatch" },
    { url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",      section: "stocks",  source: "MarketWatch" },
    // AI / Tech — Hacker News + TechCrunch
    { url: "https://hnrss.org/frontpage",                                        section: "ai-tech", source: "Hacker News" },
    { url: "https://techcrunch.com/feed/",                                       section: "ai-tech", source: "TechCrunch" },
    // Macro — RBA + Reuters economy
    { url: "https://www.rba.gov.au/rss/rss-cb-speeches.xml",                   section: "macro",   source: "RBA" },
    { url: "https://feeds.reuters.com/reuters/businessNews",                    section: "macro",   source: "Reuters" },
  ];

  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map((feed) =>
      fetchProxied(feed.url).then((xml) =>
        parseRSS(xml, feed.section, feed.source, 10)
      )
    )
  );

  // 4. Combine all items (RSS feeds + CoinGecko crypto)
  const allItems: NewsItem[] = [];
  const seenUrls = new Set<string>();

  // Add RSS feed items
  feedResults.forEach((result) => {
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allItems.push(item);
        }
      }
    }
  });

  // Add CoinGecko crypto items (deduplicated)
  const cryptoItems = await cryptoItemsPromise;
  for (const item of cryptoItems) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      allItems.push(item);
    }
  }

  // Fallback: if feeds mostly failed, add placeholder items so page is never empty
  if (allItems.length < 3) {
    const fallbackItems: NewsItem[] = [
      {
        id: "fallback_1",
        title: "Markets Update: News feeds loading — click Refresh to retry",
        title_fa: "بروزرسانی بازار: داده‌های زنده موقتاً در دسترس نیست",
        summary: "News feeds could not be reached (CORS proxy may be rate-limited). Crypto data from CoinGecko should still load. Click Refresh to try again.",
        summary_fa: "دریافت اخبار بازار ممکن نشد. لطفاً چند دقیقه دیگر دوباره تلاش کنید.",
        source: "System",
        url: "#",
        published: new Date().toISOString(),
        section: "stocks",
        sentiment: "neutral",
        impact: ["General"],
      },
    ];
    allItems.push(...fallbackItems);
  }

  // 4. Sort by published date descending
  allItems.sort(
    (a, b) => new Date(b.published).getTime() - new Date(a.published).getTime()
  );

  // 5. Generate summary bullets
  const ai_summary = generateSummaryBullets(allItems, prices);

  const cache: NewsCache = {
    items: allItems,
    prices,
    ai_summary,
    fetched_at: new Date().toISOString(),
  };

  return cache;
}

// ─── Time Ago Formatter ───────────────────────────────────────────────────────

function timeAgo(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

// ─── Minutes until next refresh ──────────────────────────────────────────────

function minsUntilRefresh(fetchedAt: string): number {
  try {
    const elapsed = Date.now() - new Date(fetchedAt).getTime();
    const remaining = CACHE_TTL_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / 60000));
  } catch {
    return 0;
  }
}

// ─── Section Config ───────────────────────────────────────────────────────────

const SECTION_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bgClass: string; textClass: string }
> = {
  stocks: {
    label: "Stocks",
    icon: <BarChart2 size={12} />,
    color: "hsl(210,80%,60%)",
    bgClass: "bg-blue-500/15 border-blue-500/30",
    textClass: "text-blue-400",
  },
  crypto: {
    label: "Crypto",
    icon: <Bitcoin size={12} />,
    color: "hsl(38,92%,60%)",
    bgClass: "bg-amber-500/15 border-amber-500/30",
    textClass: "text-amber-400",
  },
  "ai-tech": {
    label: "AI & Tech",
    icon: <Cpu size={12} />,
    color: "hsl(280,60%,65%)",
    bgClass: "bg-purple-500/15 border-purple-500/30",
    textClass: "text-purple-400",
  },
  macro: {
    label: "Macro",
    icon: <Globe size={12} />,
    color: "hsl(142,60%,50%)",
    bgClass: "bg-emerald-500/15 border-emerald-500/30",
    textClass: "text-emerald-400",
  },
};

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 bg-muted/50 rounded-full" />
        <div className="h-2 w-2 bg-muted/50 rounded-full" />
      </div>
      <div className="h-4 bg-muted/50 rounded mb-2 w-full" />
      <div className="h-4 bg-muted/50 rounded mb-3 w-3/4" />
      <div className="h-3 bg-muted/30 rounded mb-1 w-full" />
      <div className="h-3 bg-muted/30 rounded mb-4 w-5/6" />
      <div className="flex items-center gap-2">
        <div className="h-5 w-14 bg-muted/30 rounded-full" />
        <div className="h-5 w-14 bg-muted/30 rounded-full" />
        <div className="ml-auto h-3 w-16 bg-muted/20 rounded" />
      </div>
    </div>
  );
}

// ─── Price Chip ───────────────────────────────────────────────────────────────

interface PriceChipProps {
  label: string;
  price: number | string;
  change?: number;
  isFearGreed?: boolean;
  value?: number;
  privacyMode: boolean;
}

function PriceChip({ label, price, change, isFearGreed, value, privacyMode }: PriceChipProps) {
  const isPositive = (change ?? 0) >= 0;
  const ChgIcon = isPositive ? TrendingUp : TrendingDown;
  const chgColor = isPositive ? "text-emerald-400" : "text-red-400";

  const fearGreedColor =
    (value ?? 50) < 30
      ? "text-red-400"
      : (value ?? 50) > 70
      ? "text-emerald-400"
      : "text-amber-400";

  const displayPrice = privacyMode
    ? "••••"
    : typeof price === "number"
    ? formatCurrency(price)
    : price;

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 flex flex-col gap-0.5 min-w-[110px]">
      <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{displayPrice}</span>
      {change !== undefined && !isFearGreed && (
        <span className={`flex items-center gap-0.5 text-[11px] font-medium ${chgColor}`}>
          <ChgIcon size={10} />
          {isPositive ? "+" : ""}{change.toFixed(2)}%
        </span>
      )}
      {isFearGreed && (
        <span className={`text-[11px] font-medium ${fearGreedColor}`}>
          {price}
        </span>
      )}
    </div>
  );
}

// ─── News Card ────────────────────────────────────────────────────────────────

interface NewsCardProps {
  item: NewsItem;
  language: Language;
}

function NewsCard({ item, language }: NewsCardProps) {
  const cfg = SECTION_CONFIG[item.section] ?? SECTION_CONFIG.stocks;
  const sentimentDot =
    item.sentiment === "positive"
      ? "bg-emerald-400"
      : item.sentiment === "negative"
      ? "bg-red-400"
      : "bg-yellow-400";

  const showFa = language === "fa" || language === "both";
  const showEn = language === "en" || language === "both";

  const handleClick = () => {
    if (item.url && item.url !== "#") {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      onClick={handleClick}
      className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-foreground/20 transition-all duration-200 hover:shadow-lg group"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bgClass} ${cfg.textClass}`}
        >
          {cfg.icon}
          {cfg.label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${sentimentDot}`}
          title={`Sentiment: ${item.sentiment}`}
        />
        <ExternalLink
          size={12}
          className="ml-auto text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
        />
      </div>

      {/* Title */}
      {showEn && (
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug mb-1">
          {item.title}
        </h3>
      )}
      {showFa && item.title_fa && (
        <h3
          className="text-sm font-semibold text-foreground line-clamp-2 leading-snug mb-1"
          dir="rtl"
          lang="fa"
        >
          {item.title_fa}
        </h3>
      )}

      {/* Summary */}
      {showEn && item.summary && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-2">
          {item.summary}
        </p>
      )}
      {showFa && item.summary_fa && (
        <p
          className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-2"
          dir="rtl"
          lang="fa"
        >
          {item.summary_fa}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
        {item.impact.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-1.5 py-0.5 bg-muted/40 rounded text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {item.source} · {timeAgo(item.published)}
        </span>
      </div>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function MarketNewsPage() {
  const privacyMode = useAppStore((s) => s.privacyMode);
  const { toast } = useToast();

  const [activeSection, setActiveSection] = useState<Section>("all");
  const [language, setLanguage] = useState<Language>("en");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newsCache, setNewsCache] = useState<NewsCache | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(45);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    const cached = loadCache();
    if (cached) {
      setNewsCache(cached);
      setLoadingInitial(false);
      startCountdown(cached.fetched_at);
    } else {
      // No valid cache — fetch immediately
      doFetch(true).finally(() => setLoadingInitial(false));
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  function startCountdown(fetchedAt: string) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(minsUntilRefresh(fetchedAt));
    countdownRef.current = setInterval(() => {
      const mins = minsUntilRefresh(fetchedAt);
      setCountdown(mins);
      if (mins <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 30000);
  }

  // ─── Fetch handler ─────────────────────────────────────────────────────
  const doFetch = useCallback(
    async (silent = false) => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      setFetchError(null);
      try {
        const data = await fetchAllMarketData();
        setNewsCache(data);
        saveCache(data);
        startCountdown(data.fetched_at);

        // Optionally upsert to Supabase (fire-and-forget)
        try {
          apiRequest("POST", "/api/market-news-cache", {
            fetched_at: data.fetched_at,
            item_count: data.items.length,
            prices: data.prices,
          }).catch(() => {});
        } catch {}

        if (!silent) {
          toast({
            title: "Market data refreshed",
            description: `${data.items.length} stories loaded.`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setFetchError(msg);
        if (!silent) {
          toast({
            title: "Refresh failed",
            description: "Could not load market data. Showing cached data if available.",
            variant: "destructive",
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [isRefreshing, toast]
  );

  const handleRefresh = useCallback(() => {
    if (!isRefreshing) doFetch(false);
  }, [isRefreshing, doFetch]);

  // ─── Derived data ──────────────────────────────────────────────────────
  const filteredItems =
    newsCache?.items.filter((item) =>
      activeSection === "all" ? true : item.section === activeSection
    ) ?? [];

  const personalInsights = newsCache
    ? generatePersonalInsights(newsCache.items, newsCache.prices)
    : [];

  const prices = newsCache?.prices;

  // ─── Section tabs config ───────────────────────────────────────────────
  const sectionTabs: { key: Section; label: string }[] = [
    { key: "all", label: "All" },
    { key: "stocks", label: "Stocks" },
    { key: "crypto", label: "Crypto" },
    { key: "ai-tech", label: "AI & Tech" },
    { key: "macro", label: "Macro" },
  ];

  // ─── Language labels ───────────────────────────────────────────────────
  const langOptions: { key: Language; label: string }[] = [
    { key: "en", label: "EN" },
    { key: "fa", label: "فا" },
    { key: "both", label: "EN+فا" },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Newspaper size={20} className="text-amber-400" />
            Market News &amp; Daily Brief
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live market signals and news for informed decisions
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Language toggle */}
          <div className="flex items-center bg-muted/30 border border-border rounded-lg p-0.5">
            {langOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setLanguage(opt.key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors font-medium ${
                  language === opt.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs gap-1.5"
          >
            <RefreshCw
              size={13}
              className={isRefreshing ? "animate-spin" : ""}
            />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Persian warning */}
      {language !== "en" && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 text-xs text-amber-300">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Persian summaries are AI-translated approximations using keyword substitution — not professional translations.
        </div>
      )}

      {/* ── AI Summary Card (Gold) ───────────────────────────────────── */}
      <div
        className="rounded-xl border p-4 md:p-5"
        style={{
          background:
            "linear-gradient(135deg, hsl(43,85%,10%) 0%, hsl(43,60%,7%) 100%)",
          borderColor: "hsl(43,85%,30%)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 text-amber-300">
            <Sparkles size={14} />
            Today's Key Market Signals
          </h2>
          <div className="flex items-center gap-3 text-[10px] text-amber-400/60">
            {newsCache && (
              <>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  Updated {timeAgo(newsCache.fetched_at)}
                </span>
                {countdown > 0 && (
                  <span>Next refresh in {countdown}m</span>
                )}
              </>
            )}
          </div>
        </div>

        {loadingInitial ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-amber-500/10 rounded animate-pulse" />
            ))}
          </div>
        ) : newsCache?.ai_summary?.length ? (
          <ul className="space-y-2">
            {newsCache.ai_summary.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-100/80 leading-relaxed">
                <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                {bullet}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-amber-400/60">No summary available. Try refreshing.</p>
        )}
      </div>

      {/* ── Market Price Ticker Bar ──────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Live Market Prices
        </h2>
        {loadingInitial ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-16 w-28 shrink-0 bg-card border border-border rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : prices ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <PriceChip
              label="S&P 500"
              price={prices.sp500}
              change={prices.sp500_chg}
              privacyMode={privacyMode}
            />
            <PriceChip
              label="Nasdaq"
              price={prices.nasdaq}
              change={prices.nasdaq_chg}
              privacyMode={privacyMode}
            />
            <PriceChip
              label="Dow Jones"
              price={prices.dow}
              change={prices.dow_chg}
              privacyMode={privacyMode}
            />
            <PriceChip
              label="BTC / AUD"
              price={prices.btc_aud}
              change={prices.btc_chg}
              privacyMode={privacyMode}
            />
            <PriceChip
              label="ETH / AUD"
              price={prices.eth_aud}
              change={prices.eth_chg}
              privacyMode={privacyMode}
            />
            <PriceChip
              label="Fear & Greed"
              price={`${prices.fear_greed} – ${prices.fear_greed_label}`}
              isFearGreed
              value={prices.fear_greed}
              privacyMode={false}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-3">
            <AlertCircle size={13} />
            Price data unavailable — check connection and refresh.
          </div>
        )}
      </div>

      {/* ── Why It Matters To Me ─────────────────────────────────────── */}
      {personalInsights.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Why It Matters To Me
          </h2>
          <ul className="space-y-2">
            {personalInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="text-base leading-none shrink-0">{insight.icon}</span>
                <span className={insight.color}>{insight.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Section Filter Tabs ──────────────────────────────────────── */}
      <div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {sectionTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap font-medium transition-colors ${
                activeSection === tab.key
                  ? "bg-foreground/10 text-foreground border border-foreground/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {tab.label}
              {tab.key !== "all" && newsCache && (
                <span className="ml-1 text-[10px] text-muted-foreground/50">
                  ({newsCache.items.filter((i) => i.section === tab.key).length})
                </span>
              )}
              {tab.key === "all" && newsCache && (
                <span className="ml-1 text-[10px] text-muted-foreground/50">
                  ({newsCache.items.length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── News Cards Grid ──────────────────────────────────────────── */}
      {loadingInitial ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : fetchError && !newsCache ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <AlertCircle size={36} className="text-red-400/60" />
          <div>
            <p className="text-sm font-medium text-foreground">Failed to load market data</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">{fetchError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw size={13} />
            Try Again
          </Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Newspaper size={32} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No news available. Try refreshing.</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw size={13} />
            Refresh
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => (
            <NewsCard key={item.id} item={item} language={language} />
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="pt-2 pb-4 text-center">
        <p className="text-[10px] text-muted-foreground/40">
          Market data for informational purposes only. Not financial advice.
          Data sourced from Yahoo Finance, CoinGecko, and Alternative.me via public APIs.
        </p>
      </div>
    </div>
  );
}
