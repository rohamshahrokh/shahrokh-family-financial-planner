/**
 * api/market-data.ts
 * Vercel Serverless Function — GET /api/market-data
 *
 * Multi-source market data with fallback chain:
 *   Stocks  → Yahoo Finance v8 (server-side, no CORS) → Stooq CSV fallback
 *   Crypto  → CoinGecko → Binance fallback
 *   Indices → Yahoo Finance v8 → Stooq CSV fallback
 *   News    → RSS feeds (Yahoo, CNBC, CoinTelegraph, Reuters, ABC)
 *   F&G     → alternative.me
 *
 * Cache: in-process Map keyed by type, TTLs:
 *   Stocks/indices: 5 min
 *   Crypto:         2 min
 *   News:           30 min
 *   Fear & Greed:   60 min
 *
 * Per-symbol isolation: one symbol failing never blocks others.
 * Stale data is returned with a `stale: true` flag if live fetch fails.
 */

type VercelRequest  = import("http").IncomingMessage & { body?: any; query: Record<string, string | string[]> };
type VercelResponse = import("http").ServerResponse  & { status: (c: number) => VercelResponse; json: (b: any) => void; end: () => VercelResponse; setHeader: (k: string, v: string) => VercelResponse };

// ─── In-process cache ─────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  ts: number;   // Date.now()
  stale?: boolean;
}

const CACHE = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string, ttlMs: number): { hit: true; data: T; stale: boolean } | { hit: false } {
  const entry = CACHE.get(key) as CacheEntry<T> | undefined;
  if (!entry) return { hit: false };
  const age = Date.now() - entry.ts;
  if (age < ttlMs) return { hit: true, data: entry.data, stale: false };
  // Return stale data if it exists — better than nothing
  return { hit: true, data: entry.data, stale: true };
}

function setCache<T>(key: string, data: T): void {
  CACHE.set(key, { data, ts: Date.now() });
}

// ─── TTLs ─────────────────────────────────────────────────────────────────────

const TTL = {
  stock:  5  * 60 * 1000,   // 5 min
  crypto: 2  * 60 * 1000,   // 2 min
  news:   30 * 60 * 1000,   // 30 min
  fg:     60 * 60 * 1000,   // 60 min
  index:  5  * 60 * 1000,   // 5 min
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ─── Stock price: Yahoo Finance v8 ───────────────────────────────────────────

async function fetchYahooPrice(symbol: string): Promise<{ price: number; change: number; name?: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetchWithTimeout(url, 7000);
    if (!res.ok) return null;
    const json = await res.json() as any;
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { price, change, name: meta.shortName ?? meta.longName };
  } catch {
    return null;
  }
}

// ─── Stock price: Stooq CSV fallback ─────────────────────────────────────────

async function fetchStooqPrice(stooqSym: string): Promise<{ price: number; change: number } | null> {
  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcvn&h&e=csv`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    const close = parseFloat(cols[6] ?? "0");
    const open  = parseFloat(cols[3] ?? "0");
    if (!close || !open) return null;
    const change = open > 0 ? ((close - open) / open) * 100 : 0;
    return { price: close, change };
  } catch {
    return null;
  }
}

// Stooq symbol mappings for stocks
const STOOQ_STOCK_MAP: Record<string, string> = {
  NVDA: "nvda.us", GOOGL: "googl.us", MSFT: "msft.us", AVGO: "avgo.us",
  CEG: "ceg.us",   CCJ: "ccj.us",    WPM: "wpm.us",   TSLA: "tsla.us",
  OKLO: "oklo.us", ANET: "anet.us",
};

async function fetchStockPrice(symbol: string): Promise<{ price: number; change: number; source: string }> {
  // 1. Try Yahoo
  const yahoo = await fetchYahooPrice(symbol);
  if (yahoo && yahoo.price > 0) return { ...yahoo, source: "yahoo" };

  // 2. Try Stooq
  const stooqSym = STOOQ_STOCK_MAP[symbol];
  if (stooqSym) {
    const stooq = await fetchStooqPrice(stooqSym);
    if (stooq && stooq.price > 0) return { ...stooq, source: "stooq" };
  }

  return { price: 0, change: 0, source: "none" };
}

// ─── Crypto: CoinGecko → Binance ─────────────────────────────────────────────

async function fetchCryptoPrices(): Promise<Record<string, { price: number; change: number; source: string }>> {
  // Try CoinGecko
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    const res = await fetchWithTimeout(url, 8000);
    if (res.ok) {
      const cg = await res.json() as any;
      if (cg.bitcoin?.usd) {
        return {
          BTC: { price: cg.bitcoin.usd, change: cg.bitcoin.usd_24h_change ?? 0, source: "coingecko" },
          ETH: { price: cg.ethereum?.usd ?? 0, change: cg.ethereum?.usd_24h_change ?? 0, source: "coingecko" },
        };
      }
    }
  } catch {}

  // Binance fallback
  const result: Record<string, { price: number; change: number; source: string }> = {};
  for (const [coin, binanceSym] of [["BTC", "BTCUSDT"], ["ETH", "ETHUSDT"]] as const) {
    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSym}`;
      const res = await fetchWithTimeout(url, 6000);
      if (res.ok) {
        const b = await res.json() as any;
        result[coin] = {
          price: parseFloat(b.lastPrice ?? "0"),
          change: parseFloat(b.priceChangePercent ?? "0"),
          source: "binance",
        };
      }
    } catch {}
  }
  return result;
}

// ─── Indices: Yahoo → Stooq ──────────────────────────────────────────────────

const INDEX_MAP: Record<string, { yahoo: string; stooq: string; label: string }> = {
  SP500:  { yahoo: "^GSPC",  stooq: "%5ESPX",  label: "S&P 500" },
  NASDAQ: { yahoo: "^IXIC",  stooq: "%5EIXIC", label: "Nasdaq"  },
  DOW:    { yahoo: "^DJI",   stooq: "%5EDJI",  label: "Dow"     },
  VIX:    { yahoo: "^VIX",   stooq: "%5EVIX",  label: "VIX"     },
  GOLD:   { yahoo: "GC=F",   stooq: "GC.F",    label: "Gold"    },
  OIL:    { yahoo: "CL=F",   stooq: "CL.F",    label: "Oil"     },
  AUDUSD: { yahoo: "AUDUSD=X", stooq: "AUDUSD", label: "AUD/USD" },
};

async function fetchIndex(key: string): Promise<{ price: number; change: number; label: string; source: string }> {
  const cfg = INDEX_MAP[key];
  if (!cfg) return { price: 0, change: 0, label: key, source: "none" };

  // Try Yahoo
  const yahoo = await fetchYahooPrice(cfg.yahoo);
  if (yahoo && yahoo.price > 0) return { ...yahoo, label: cfg.label, source: "yahoo" };

  // Stooq fallback
  const stooq = await fetchStooqPrice(cfg.stooq);
  if (stooq && stooq.price > 0) return { ...stooq, label: cfg.label, source: "stooq" };

  return { price: 0, change: 0, label: cfg.label, source: "none" };
}

// ─── Fear & Greed ─────────────────────────────────────────────────────────────

async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetchWithTimeout("https://api.alternative.me/fng/?limit=1", 6000);
    if (!res.ok) return null;
    const json = await res.json() as any;
    return {
      value: parseInt(json?.data?.[0]?.value ?? "50"),
      label: json?.data?.[0]?.value_classification ?? "Neutral",
    };
  } catch {
    return null;
  }
}

// ─── News: RSS feeds ─────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

const RSS_FEEDS: Record<string, Array<{ url: string; source: string }>> = {
  stocks: [
    { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,NVDA,MSFT&region=US&lang=en-US", source: "Yahoo Finance" },
    { url: "https://www.cnbc.com/id/10001147/device/rss/rss.html", source: "CNBC" },
    { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
    { url: "https://www.reuters.com/business/markets/rss", source: "Reuters" },
  ],
  crypto: [
    { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
    { url: "https://coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
    { url: "https://cryptonews.com/news/feed/", source: "CryptoNews" },
  ],
  tech: [
    { url: "https://hnrss.org/frontpage", source: "Hacker News" },
    { url: "https://feeds.feedburner.com/TechCrunch/", source: "TechCrunch" },
    { url: "https://www.wired.com/feed/rss", source: "Wired" },
  ],
  macro: [
    { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC Markets" },
    { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EVIX&region=US&lang=en-US", source: "Yahoo Macro" },
    { url: "https://www.ft.com/rss/home/us", source: "FT" },
  ],
  australia: [
    { url: "https://www.rba.gov.au/rss/rss-cb-speeches.xml", source: "RBA" },
    { url: "https://www.abc.net.au/news/feed/51120/rss.xml", source: "ABC News AU" },
    { url: "https://www.afr.com/rss", source: "AFR" },
  ],
};

function parseRSSXML(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  // Simple regex-based parser (no DOM in Node.js serverless)
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  for (const item of itemMatches.slice(0, 10)) {
    const title = (item.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) 
      ?? item.match(/<title[^>]*>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? "";
    const link = (item.match(/<link>([\s\S]*?)<\/link>/) 
      ?? item.match(/<link[^>]*href="([^"]+)"/))?.[1]?.trim() ?? "";
    const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? "";
    const desc = ((item.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) 
      ?? item.match(/<description[^>]*>([\s\S]*?)<\/description>/))?.[1] ?? "")
      .replace(/<[^>]*>/g, "").substring(0, 200).trim();
    if (title) items.push({ title, link, pubDate, description: desc, source: sourceName });
  }
  return items;
}

async function fetchRSSFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSXML(xml, source);
  } catch {
    return [];
  }
}

async function fetchNewsCategory(feeds: Array<{ url: string; source: string }>): Promise<NewsItem[]> {
  const articles: NewsItem[] = [];
  // Fetch feeds in parallel, stop once we have ≥10 articles
  const results = await Promise.allSettled(
    feeds.map(f => fetchRSSFeed(f.url, f.source))
  );
  for (const r of results) {
    if (r.status === "fulfilled") articles.push(...r.value);
    if (articles.length >= 12) break;
  }
  // Deduplicate by title
  const seen = new Set<string>();
  return articles.filter(a => {
    const key = a.title.toLowerCase().substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

const STOCK_SYMBOLS = ["NVDA", "GOOGL", "MSFT", "AVGO", "CEG", "CCJ", "WPM", "TSLA", "OKLO", "ANET"];
const INDEX_KEYS    = ["SP500", "NASDAQ", "DOW", "VIX", "GOLD", "OIL", "AUDUSD"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for same-origin Vercel deployment
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();

  // ── Prices (stocks + crypto + indices) ─────────────────────────────────────

  const pricesCacheKey = "prices_v2";
  const pricesCache = getCache<Record<string, any>>(pricesCacheKey, TTL.stock);

  let prices: Record<string, any>;
  let indices: Record<string, any>;
  let pricesStale = false;

  if (pricesCache.hit && !pricesCache.stale) {
    prices  = (pricesCache.data as any).prices;
    indices = (pricesCache.data as any).indices;
  } else {
    // Fetch stocks in parallel — per-symbol isolation
    const stockResults = await Promise.allSettled(
      STOCK_SYMBOLS.map(sym => fetchStockPrice(sym))
    );
    prices = {};
    for (let i = 0; i < STOCK_SYMBOLS.length; i++) {
      const r = stockResults[i];
      if (r.status === "fulfilled") {
        prices[STOCK_SYMBOLS[i]] = r.value;
      } else {
        prices[STOCK_SYMBOLS[i]] = { price: 0, change: 0, source: "none" };
      }
    }

    // Crypto
    const crypto = await fetchCryptoPrices();
    Object.assign(prices, crypto);

    // Indices in parallel
    const indexResults = await Promise.allSettled(
      INDEX_KEYS.map(k => fetchIndex(k))
    );
    indices = {};
    for (let i = 0; i < INDEX_KEYS.length; i++) {
      const r = indexResults[i];
      if (r.status === "fulfilled") indices[INDEX_KEYS[i]] = r.value;
    }

    const pricesPayload = { prices, indices };

    // If we got any real data, cache it
    const anyReal = Object.values(prices).some((p: any) => p.price > 0);
    if (anyReal) {
      setCache(pricesCacheKey, pricesPayload);
    } else if (pricesCache.hit) {
      // All fetches failed — serve stale
      prices  = (pricesCache.data as any).prices;
      indices = (pricesCache.data as any).indices;
      pricesStale = true;
    }
  }

  // ── Fear & Greed ────────────────────────────────────────────────────────────

  let fearGreed: number | null = null;
  let fearGreedLabel = "";
  const fgCache = getCache<{ value: number; label: string }>("fg", TTL.fg);
  if (fgCache.hit && !fgCache.stale) {
    fearGreed      = fgCache.data.value;
    fearGreedLabel = fgCache.data.label;
  } else {
    const fg = await fetchFearGreed();
    if (fg) {
      fearGreed      = fg.value;
      fearGreedLabel = fg.label;
      setCache("fg", fg);
    } else if (fgCache.hit) {
      fearGreed      = fgCache.data.value;
      fearGreedLabel = fgCache.data.label;
    }
  }

  // ── News ────────────────────────────────────────────────────────────────────

  const newsCacheKey = "news_v2";
  const newsCache = getCache<Record<string, NewsItem[]>>(newsCacheKey, TTL.news);
  let news: Record<string, NewsItem[]>;
  let newsStale = false;

  if (newsCache.hit && !newsCache.stale) {
    news = newsCache.data;
  } else {
    // Fetch all categories in parallel
    const categories = Object.keys(RSS_FEEDS);
    const newsResults = await Promise.allSettled(
      categories.map(cat => fetchNewsCategory(RSS_FEEDS[cat]))
    );
    news = {};
    let anyNews = false;
    for (let i = 0; i < categories.length; i++) {
      const r = newsResults[i];
      news[categories[i]] = r.status === "fulfilled" ? r.value : [];
      if (news[categories[i]].length > 0) anyNews = true;
    }
    if (anyNews) {
      setCache(newsCacheKey, news);
    } else if (newsCache.hit) {
      news = newsCache.data;
      newsStale = true;
    }
  }

  // ── Status summary ──────────────────────────────────────────────────────────

  const failedSymbols = Object.entries(prices)
    .filter(([, v]: any) => v.source === "none" || v.price === 0)
    .map(([k]) => k);

  const dataStatus = failedSymbols.length === 0 
    ? "live" 
    : failedSymbols.length < STOCK_SYMBOLS.length / 2 
      ? "partial" 
      : pricesStale ? "cached" : "partial";

  return res.status(200).json({
    prices,
    indices,
    news,
    fearGreed,
    fearGreedLabel,
    lastUpdated: new Date().toISOString(),
    dataStatus,           // "live" | "partial" | "cached" | "failed"
    stale: pricesStale || newsStale,
    failedSymbols,
  });
}
