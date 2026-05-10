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

// ─── Server-side market-data snapshot ────────────────────────────────────────
//
// All upstream price/news/F&G/FX fetches go through our own serverless
// function /api/market-data (api/market-data.ts). That endpoint already
// implements Yahoo/Stooq/CoinGecko/Binance fallback, RSS, and per-symbol
// isolation, and runs server-side so there is NO browser CORS exposure.
//
// We share a single in-flight promise so dozens of fetchStockPrice() callers
// turn into ONE HTTP request, with a short memo (30s) on top of the server's
// own 2-5 min cache.

interface ServerSnapshot {
  prices: Record<string, { price: number; change: number; source: string }>;
  indices: Record<string, { price: number; change: number; source: string }>;
  news: Record<string, unknown[]>;
  fearGreed: number | null;
  fearGreedLabel: string;
  lastUpdated: string;
  dataStatus: 'live' | 'partial' | 'cached' | 'failed';
  stale: boolean;
  failedSymbols: string[];
}

const SNAPSHOT_MEMO_TTL = 30_000; // 30s — server already caches 2–5 min
let _snapshotMemo: { ts: number; data: ServerSnapshot } | null = null;
let _snapshotInflight: Promise<ServerSnapshot | null> | null = null;

async function fetchServerSnapshot(): Promise<ServerSnapshot | null> {
  // Reuse fresh memo
  if (_snapshotMemo && Date.now() - _snapshotMemo.ts < SNAPSHOT_MEMO_TTL) {
    return _snapshotMemo.data;
  }
  // Coalesce concurrent callers
  if (_snapshotInflight) return _snapshotInflight;

  _snapshotInflight = (async () => {
    try {
      const res = await fetch('/api/market-data', {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as ServerSnapshot;
      _snapshotMemo = { ts: Date.now(), data };
      return data;
    } catch {
      return null;
    } finally {
      _snapshotInflight = null;
    }
  })();
  return _snapshotInflight;
}

// ─── Stock price (via server proxy) ──────────────────────────────────────────

function snapshotPriceToEntry(
  p: { price: number; change: number; source: string } | undefined,
): PriceEntry | null {
  if (!p || !p.price || p.price <= 0) return null;
  return {
    price: p.price,
    change24h: p.change ?? 0,
    fetchedAt: Date.now(),
    source: p.source ?? 'server',
  };
}

/**
 * Fetch a single stock price via /api/market-data (server-side fallback chain).
 * Returns cached value if still fresh. Returns stale cache if the server
 * snapshot is unavailable (never blank).
 */
export async function fetchStockPrice(ticker: string): Promise<PriceEntry | null> {
  const cached = getCached(ticker);
  if (isFresh(cached, STOCK_TTL)) return cached;

  const snap = await fetchServerSnapshot();
  const entry = snapshotPriceToEntry(snap?.prices[ticker.toUpperCase()]);
  if (entry) {
    setCached(ticker, entry);
    return entry;
  }

  if (cached) {
    console.warn(
      `[MarketData] No live price for ${ticker} — using stale cache (${Math.round(
        (Date.now() - cached.fetchedAt) / 60000,
      )} min old)`,
    );
    return cached;
  }
  console.warn(`[MarketData] No data at all for ${ticker}`);
  return null;
}

// ─── Crypto price (via server proxy) ─────────────────────────────────────────

export async function fetchCryptoPrice(symbol: string): Promise<PriceEntry | null> {
  const cached = getCached(symbol);
  if (isFresh(cached, CRYPTO_TTL)) return cached;

  const snap = await fetchServerSnapshot();
  const entry = snapshotPriceToEntry(snap?.prices[symbol.toUpperCase()]);
  if (entry) {
    setCached(symbol, entry);
    return entry;
  }

  if (cached) {
    console.warn(
      `[MarketData] No live price for ${symbol} — using stale cache (${Math.round(
        (Date.now() - cached.fetchedAt) / 60000,
      )} min old)`,
    );
    return cached;
  }
  console.warn(`[MarketData] No crypto data at all for ${symbol}`);
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

// ─── Index fetch (via server proxy) ──────────────────────────────────────────

export async function fetchMarketIndices(): Promise<Record<string, PriceEntry>> {
  const results: Record<string, PriceEntry> = {};
  const keys = ['SP500', 'NASDAQ', 'DOW', 'VIX', 'GOLD', 'OIL', 'AUDUSD'];

  // Floor: last-known cache so UI never blanks during fetch
  for (const k of keys) {
    const cached = getCached(`IDX_${k}`);
    if (cached) results[k] = cached;
  }

  const snap = await fetchServerSnapshot();
  if (!snap) return results;

  for (const k of keys) {
    const entry = snapshotPriceToEntry(snap.indices[k]);
    if (entry) {
      setCached(`IDX_${k}`, entry);
      results[k] = entry;
    }
  }
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

  // Server proxy carries Fear & Greed in the same snapshot — no extra request.
  const snap = await fetchServerSnapshot();
  if (snap && snap.fearGreed != null) {
    const result = { value: snap.fearGreed, label: snap.fearGreedLabel || '' };
    try {
      localStorage.setItem(CACHE_KEY_FG, JSON.stringify({ data: result, ts: Date.now() }));
    } catch {}
    return result;
  }
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

  // AUDUSD comes back inside indices on the server proxy.
  const snap = await fetchServerSnapshot();
  const rate = snap?.indices?.AUDUSD?.price;
  if (rate && rate > 0) {
    try {
      localStorage.setItem(CACHE_KEY_FX, JSON.stringify({ rate, ts: Date.now() }));
    } catch {}
    return rate;
  }

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
