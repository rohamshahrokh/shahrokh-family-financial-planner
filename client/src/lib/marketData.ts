/**
 * marketData.ts — Multi-source fallback pricing engine
 *
 * STOCKS:  Primary → Yahoo Finance (allorigins proxy)
 *          Fallback → Yahoo Finance (corsproxy.io)
 *          Fallback2 → Stooq CSV
 *
 * CRYPTO:  Primary → CoinGecko
 *          Fallback → Binance Public API
 *
 * INDEXES: Yahoo Finance (^GSPC, ^IXIC, ^DJI) via Stooq CSV fallback
 *
 * FEAR & GREED: alternative.me
 *
 * Rules:
 * - Per-symbol isolation: one failure never blocks others
 * - 5-min TTL for stocks, 2-min TTL for crypto
 * - Retry once on timeout (AbortSignal.timeout)
 * - Show last-updated timestamp
 * - Stale badge after 15 min
 * - Never show blank — return last cached value on failure
 * - Log failed symbols to console
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceEntry {
  price: number;        // in USD (stocks) or USD (crypto)
  change24h: number;    // % change
  fetchedAt: number;    // timestamp ms
  source: string;       // which provider succeeded
}

export interface MarketSnapshot {
  prices: Record<string, PriceEntry>;   // ticker → price (stocks + crypto)
  indices: Record<string, PriceEntry>;  // SP500, NASDAQ, DOW
  fearGreed: number | null;
  fearGreedLabel: string;
  lastUpdated: string;                  // ISO timestamp of last successful fetch
  staleTickers: string[];               // tickers that used stale cache
}

// ─── Cache Config ─────────────────────────────────────────────────────────────

const CACHE_KEY   = "sf_mkt_v2";          // localStorage key
const STOCK_TTL   =  5 * 60 * 1000;       // 5 min
const CRYPTO_TTL  =  2 * 60 * 1000;       // 2 min
const STALE_AFTER = 15 * 60 * 1000;       // badge after 15 min
const FETCH_TIMEOUT = 8_000;              // ms per request

// ─── Ticker symbol maps ───────────────────────────────────────────────────────

/** Yahoo Finance ticker → exactly as Yahoo expects */
const YAHOO_TICKER_MAP: Record<string, string> = {
  // ASX stocks (add .AX suffix if needed — but watchlist is US)
  NVDA: "NVDA", GOOGL: "GOOGL", MSFT: "MSFT", AVGO: "AVGO",
  CEG:  "CEG",  CCJ:  "CCJ",   WPM:  "WPM",
  AAPL: "AAPL", AMZN: "AMZN", META: "META", TSLA: "TSLA",
  AMD:  "AMD",  INTC: "INTC", NFLX: "NFLX", CRM: "CRM",
  JPM:  "JPM",  BAC:  "BAC",  GS:  "GS",
  // Index ETFs
  SPY: "SPY", QQQ: "QQQ", VTI: "VTI",
  // Commodities / indices
  "^GSPC": "%5EGSPC", "^IXIC": "%5EIXIC", "^DJI": "%5EDJI",
};

/** CoinGecko symbol → CoinGecko API ID */
const COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  ADA: "cardano", XRP: "ripple",  DOGE: "dogecoin", AVAX: "avalanche-2",
  DOT: "polkadot", MATIC: "matic-network", LINK: "chainlink", LTC: "litecoin",
  UNI: "uniswap",  ATOM: "cosmos",  FIL: "filecoin",  NEAR: "near",
  APT: "aptos", ARB: "arbitrum", OP: "optimism", INJ: "injective-protocol",
  SHIB: "shiba-inu", PEPE: "pepe",
};

/** Binance trading pair (fallback for crypto) */
const BINANCE_PAIR: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", BNB: "BNBUSDT",
  ADA: "ADAUSDT", XRP: "XRPUSDT", DOGE: "DOGEUSDT", AVAX: "AVAXUSDT",
  DOT: "DOTUSDT", MATIC: "MATICUSDT", LINK: "LINKUSDT", LTC: "LTCUSDT",
  UNI: "UNIUSDT", ATOM: "ATOMUSDT", NEAR: "NEARUSDT",
  ARB: "ARBUSDT", OP: "OPUSDT",
};

// ─── Cache helpers ────────────────────────────────────────────────────────────

function loadCache(): Record<string, PriceEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(cache: Record<string, PriceEntry>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

let _memCache: Record<string, PriceEntry> = loadCache();

function getCached(symbol: string): PriceEntry | null {
  return _memCache[symbol.toUpperCase()] ?? null;
}

function setCached(symbol: string, entry: PriceEntry) {
  _memCache[symbol.toUpperCase()] = entry;
  saveCache(_memCache);
}

export function isStale(entry: PriceEntry | null): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > STALE_AFTER;
}

export function isFresh(entry: PriceEntry | null, ttl: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttl;
}

// ─── Proxy helpers ────────────────────────────────────────────────────────────

const PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

async function fetchWithProxy(url: string, parseJson = true): Promise<any | null> {
  for (const mkProxy of PROXIES) {
    const proxy = mkProxy(url);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(proxy, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        if (!res.ok) continue;
        if (parseJson) return await res.json();
        return await res.text();
      } catch { /* try next */ }
    }
  }
  return null;
}

// ─── Stock price fetchers ─────────────────────────────────────────────────────

async function fetchStockYahoo(ticker: string): Promise<PriceEntry | null> {
  const sym = YAHOO_TICKER_MAP[ticker] ?? ticker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
  const data = await fetchWithProxy(url, true);
  if (!data) return null;
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice ?? 0;
  if (!price) return null;
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change24h = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return { price, change24h, fetchedAt: Date.now(), source: "yahoo" };
}

async function fetchStockStooq(ticker: string): Promise<PriceEntry | null> {
  // Stooq uses lowercase symbols
  const sym = ticker.toLowerCase();
  const url = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcvn&h&e=csv`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    const price = parseFloat(cols[6] ?? "0");
    const open  = parseFloat(cols[3] ?? "0");
    if (!price) return null;
    const change24h = open > 0 ? ((price - open) / open) * 100 : 0;
    return { price, change24h, fetchedAt: Date.now(), source: "stooq" };
  } catch { return null; }
}

/**
 * Fetch a single stock price with multi-source fallback.
 * Returns cached value if still fresh.
 * Returns stale cache if all sources fail (never blank).
 */
export async function fetchStockPrice(ticker: string): Promise<PriceEntry | null> {
  const cached = getCached(ticker);
  if (isFresh(cached, STOCK_TTL)) return cached;

  const sources = [
    () => fetchStockYahoo(ticker),
    () => fetchStockStooq(ticker),
  ];

  for (const src of sources) {
    try {
      const result = await src();
      if (result) {
        setCached(ticker, result);
        return result;
      }
    } catch { /* try next */ }
  }

  // All sources failed — return stale cache if available
  if (cached) {
    console.warn(`[MarketData] All sources failed for ${ticker} — using stale cache (${Math.round((Date.now() - cached.fetchedAt) / 60000)} min old)`);
    return cached;
  }
  console.error(`[MarketData] No data at all for ${ticker}`);
  return null;
}

// ─── Crypto price fetchers ────────────────────────────────────────────────────

async function fetchCryptoCoinGecko(symbol: string): Promise<PriceEntry | null> {
  const id = COINGECKO_ID[symbol.toUpperCase()] ?? symbol.toLowerCase();
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error("coingecko failed");
    const data = await res.json();
    const entry = data[id];
    if (!entry?.usd) return null;
    return {
      price: entry.usd,
      change24h: entry.usd_24h_change ?? 0,
      fetchedAt: Date.now(),
      source: "coingecko",
    };
  } catch { return null; }
}

async function fetchCryptoBinance(symbol: string): Promise<PriceEntry | null> {
  const pair = BINANCE_PAIR[symbol.toUpperCase()];
  if (!pair) return null;
  try {
    const ticker24h = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
    );
    if (!ticker24h.ok) return null;
    const d = await ticker24h.json();
    const price = parseFloat(d.lastPrice ?? "0");
    if (!price) return null;
    const change24h = parseFloat(d.priceChangePercent ?? "0");
    return { price, change24h, fetchedAt: Date.now(), source: "binance" };
  } catch { return null; }
}

export async function fetchCryptoPrice(symbol: string): Promise<PriceEntry | null> {
  const cached = getCached(symbol);
  if (isFresh(cached, CRYPTO_TTL)) return cached;

  const sources = [
    () => fetchCryptoCoinGecko(symbol),
    () => fetchCryptoBinance(symbol),
  ];

  for (const src of sources) {
    try {
      const result = await src();
      if (result) {
        setCached(symbol, result);
        return result;
      }
    } catch { /* try next */ }
  }

  if (cached) {
    console.warn(`[MarketData] All sources failed for ${symbol} — using stale cache (${Math.round((Date.now() - cached.fetchedAt) / 60000)} min old)`);
    return cached;
  }
  console.error(`[MarketData] No crypto data at all for ${symbol}`);
  return null;
}

// ─── Batch stock fetch (per-symbol isolated) ──────────────────────────────────

export async function fetchAllStockPrices(
  tickers: string[],
  onUpdate?: (ticker: string, entry: PriceEntry) => void
): Promise<Record<string, PriceEntry>> {
  const results: Record<string, PriceEntry> = {};

  // Return cached immediately so UI never blanks
  for (const t of tickers) {
    const c = getCached(t);
    if (c) results[t] = c;
  }

  // Fetch each symbol independently
  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const entry = await fetchStockPrice(ticker);
      if (entry) {
        results[ticker] = entry;
        onUpdate?.(ticker, entry);
      }
    })
  );

  return results;
}

export async function fetchAllCryptoPrices(
  symbols: string[],
  onUpdate?: (symbol: string, entry: PriceEntry) => void
): Promise<Record<string, PriceEntry>> {
  const results: Record<string, PriceEntry> = {};

  for (const s of symbols) {
    const c = getCached(s);
    if (c) results[s] = c;
  }

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      const entry = await fetchCryptoPrice(symbol);
      if (entry) {
        results[symbol] = entry;
        onUpdate?.(symbol, entry);
      }
    })
  );

  return results;
}

// ─── Index fetch ──────────────────────────────────────────────────────────────

const INDEX_SYMBOLS: Record<string, string> = {
  SP500:  "%5EGSPC",
  NASDAQ: "%5EIXIC",
  DOW:    "%5EDJI",
};

export async function fetchMarketIndices(): Promise<Record<string, PriceEntry>> {
  const results: Record<string, PriceEntry> = {};

  await Promise.allSettled(
    Object.entries(INDEX_SYMBOLS).map(async ([key, stooqSym]) => {
      // Try Yahoo first
      const yahooTicker = key === "SP500" ? "^GSPC" : key === "NASDAQ" ? "^IXIC" : "^DJI";
      const cacheKey = `IDX_${key}`;
      const cached = getCached(cacheKey);
      if (isFresh(cached, STOCK_TTL)) { results[key] = cached!; return; }

      // Primary: Yahoo via proxy
      const yEntry = await fetchStockYahoo(yahooTicker);
      if (yEntry) {
        setCached(cacheKey, yEntry);
        results[key] = yEntry;
        return;
      }

      // Fallback: Stooq CSV
      try {
        const url = `https://stooq.com/q/l/?s=${stooqSym}&f=sd2t2ohlcvn&h&e=csv`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const csv = await res.text();
          const lines = csv.trim().split("\n");
          if (lines.length >= 2) {
            const cols = lines[1].split(",");
            const price = parseFloat(cols[6] ?? "0");
            const open  = parseFloat(cols[3] ?? "0");
            if (price) {
              const change24h = open > 0 ? ((price - open) / open) * 100 : 0;
              const entry: PriceEntry = { price, change24h, fetchedAt: Date.now(), source: "stooq" };
              setCached(cacheKey, entry);
              results[key] = entry;
              return;
            }
          }
        }
      } catch {}

      if (cached) results[key] = cached;
    })
  );

  return results;
}

// ─── Fear & Greed ─────────────────────────────────────────────────────────────

interface FearGreedResult { value: number; label: string; }

export async function fetchFearGreed(): Promise<FearGreedResult> {
  const CACHE_KEY_FG = "sf_fg";
  const FG_TTL = 30 * 60 * 1000; // 30 min
  try {
    const raw = localStorage.getItem(CACHE_KEY_FG);
    if (raw) {
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < FG_TTL) return data;
    }
  } catch {}

  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const fg = await res.json();
      const value = parseInt(fg?.data?.[0]?.value ?? "50");
      const label = fg?.data?.[0]?.value_classification ?? "";
      const result = { value, label };
      try { localStorage.setItem(CACHE_KEY_FG, JSON.stringify({ data: result, ts: Date.now() })); } catch {}
      return result;
    }
  } catch {}
  return { value: 50, label: "Neutral" };
}

// ─── AUD/USD rate ─────────────────────────────────────────────────────────────

export async function fetchAudUsdRate(): Promise<number> {
  const CACHE_KEY_FX = "sf_audusd";
  const FX_TTL = 60 * 60 * 1000; // 1 hour
  try {
    const raw = localStorage.getItem(CACHE_KEY_FX);
    if (raw) {
      const { rate, ts } = JSON.parse(raw);
      if (Date.now() - ts < FX_TTL && rate > 0) return rate;
    }
  } catch {}

  try {
    // Stooq AUDUSD
    const res = await fetch("https://stooq.com/q/l/?s=audusd&f=sd2t2ohlcvn&h&e=csv", {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const csv = await res.text();
      const lines = csv.trim().split("\n");
      if (lines.length >= 2) {
        const cols = lines[1].split(",");
        const rate = parseFloat(cols[6] ?? "0");
        if (rate > 0) {
          try { localStorage.setItem(CACHE_KEY_FX, JSON.stringify({ rate, ts: Date.now() })); } catch {}
          return rate;
        }
      }
    }
  } catch {}

  return 0.65; // fallback
}

// ─── Utility: USD → AUD conversion ───────────────────────────────────────────

export function usdToAud(usd: number, rate: number): number {
  if (!rate || rate <= 0) return usd / 0.65;
  return usd / rate; // rate = AUD/USD (e.g. 0.64 means 1 AUD = 0.64 USD → $1 USD = 1/0.64 AUD)
}

// ─── Formatted last-updated display ──────────────────────────────────────────

export function formatLastUpdated(fetchedAt: number): string {
  if (!fetchedAt) return "—";
  const age = Date.now() - fetchedAt;
  if (age < 60_000) return "just now";
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} min ago`;
  return new Date(fetchedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

export function isStaleByAge(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > STALE_AFTER;
}
