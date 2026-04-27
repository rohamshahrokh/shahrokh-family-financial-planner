/**
 * queryClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TanStack Query client + unified API request function.
 *
 * On local dev (Express backend running on :5000) all /api/* calls hit the
 * real Express routes as before.
 *
 * On Vercel (static deployment, no Express) the same /api/* paths are
 * intercepted client-side and served directly from localStore (Supabase-first,
 * localStorage fallback). This means zero code changes are needed in any page
 * component — they all call apiRequest("/api/snapshot") etc. exactly as before.
 *
 * KEY CHANGE: All GET handlers now await localStore async methods, which
 * always read from Supabase first. staleTime is 0 so every navigation
 * re-fetches fresh data from the cloud.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { QueryClient } from "@tanstack/react-query";
import { localStore } from "./localStore";
import { sbAppSettings } from "./supabaseClient";
import { sbBills, sbBudgets, sbTelegramSettings, sbAlertLogs, sbFamilyMsgLog } from "./supabaseClient";

// ─── Detect deployment mode ───────────────────────────────────────────────────

function isStaticDeployment(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return false;
  }
  return true;
}

const USE_LOCAL_STORE = isStaticDeployment();

// ─── Local API handler ────────────────────────────────────────────────────────
// Maps every API endpoint to a localStore call.
// Returns the same shape the Express routes return.
// All methods in localStore are now async (Supabase-first reads + writes).

async function handleLocalRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const m = method.toUpperCase();

  // ── Snapshot ──────────────────────────────────────────────────────────────
  if (path === "/api/snapshot") {
    if (m === "GET") return await localStore.getSnapshot();
    if (m === "PUT") return await localStore.updateSnapshot(body as any);
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  if (path === "/api/expenses") {
    if (m === "GET") return await localStore.getExpenses();
    if (m === "POST") return await localStore.createExpense(body as any);
  }
  if (path === "/api/expenses/bulk") {
    if (m === "POST") {
      const { expenses } = body as any;
      const created = await localStore.bulkCreateExpenses(expenses);
      return { created: created.length, expenses: created };
    }
  }
  const expenseMatch = path.match(/^\/api\/expenses\/(\d+)$/);
  if (expenseMatch) {
    const id = parseInt(expenseMatch[1]);
    if (m === "PUT")    return await localStore.updateExpense(id, body as any);
    if (m === "DELETE") { await localStore.deleteExpense(id); return { success: true }; }
  }

  // ── Properties ────────────────────────────────────────────────────────────
  if (path === "/api/properties") {
    if (m === "GET")  return await localStore.getProperties();
    if (m === "POST") return await localStore.createProperty(body as any);
  }
  const propMatch = path.match(/^\/api\/properties\/(\d+)$/);
  if (propMatch) {
    const id = parseInt(propMatch[1]);
    if (m === "PUT")    return await localStore.updateProperty(id, body as any);
    if (m === "DELETE") { await localStore.deleteProperty(id); return { success: true }; }
  }

  // ── Stocks ────────────────────────────────────────────────────────────────
  if (path === "/api/stocks") {
    if (m === "GET")  return await localStore.getStocks();
    if (m === "POST") return await localStore.createStock(body as any);
  }
  const stockMatch = path.match(/^\/api\/stocks\/(\d+)$/);
  if (stockMatch) {
    const id = parseInt(stockMatch[1]);
    if (m === "PUT")    return await localStore.updateStock(id, body as any);
    if (m === "DELETE") { await localStore.deleteStock(id); return { success: true }; }
  }

  // ── Crypto ────────────────────────────────────────────────────────────────
  if (path === "/api/crypto") {
    if (m === "GET")  return await localStore.getCryptos();
    if (m === "POST") return await localStore.createCrypto(body as any);
  }
  const cryptoMatch = path.match(/^\/api\/crypto\/(\d+)$/);
  if (cryptoMatch) {
    const id = parseInt(cryptoMatch[1]);
    if (m === "PUT")    return await localStore.updateCrypto(id, body as any);
    if (m === "DELETE") { await localStore.deleteCrypto(id); return { success: true }; }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  if (path === "/api/timeline") {
    if (m === "GET")  return await localStore.getTimelineEvents();
    if (m === "POST") return await localStore.createTimelineEvent(body as any);
  }
  const timelineMatch = path.match(/^\/api\/timeline\/(\d+)$/);
  if (timelineMatch) {
    const id = parseInt(timelineMatch[1]);
    if (m === "PUT")    return await localStore.updateTimelineEvent(id, body as any);
    if (m === "DELETE") { await localStore.deleteTimelineEvent(id); return { success: true }; }
  }

  // ── Settings — Supabase-backed (was localStorage only, now persisted) ────────
  const settingsMatch = path.match(/^\/api\/settings\/(.+)$/);
  if (settingsMatch) {
    const key = settingsMatch[1];
    if (m === "GET") {
      // Load from Supabase, fall back to localStorage cache
      const all = await sbAppSettings.get();
      const value = all[key] ?? localStore.getSetting(key);
      return { key, value };
    }
    if (m === "PUT") {
      // Write to Supabase (throws on failure — no silent catch)
      const value = (body as any).value;
      await sbAppSettings.saveKey(key, value);
      // Mirror to localStorage as offline cache
      localStore.setSetting(key, value);
      return { success: true };
    }
  }

  // ── App Settings — full JSONB blob GET/PATCH ──────────────────────────────
  if (path === "/api/app-settings") {
    if (m === "GET") return await sbAppSettings.get();
    if (m === "PATCH") {
      // Merge-upsert partial settings — throws on failure
      return await sbAppSettings.merge(body as Record<string, any>);
    }
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────
  if (path === "/api/scenarios") {
    if (m === "GET")  return await localStore.getScenarios();
    if (m === "POST") return await localStore.createScenario(body as any);
  }
  const scenarioMatch = path.match(/^\/api\/scenarios\/(\d+)$/);
  if (scenarioMatch) {
    const id = parseInt(scenarioMatch[1]);
    if (m === "DELETE") { await localStore.deleteScenario(id); return { success: true }; }
  }

  // ── Stock transactions ─────────────────────────────────────────────────────
  if (path === "/api/stock-transactions") {
    if (m === "GET")  return await localStore.getStockTransactions();
    if (m === "POST") return await localStore.createStockTransaction(body as any);
  }
  const stockTxMatch = path.match(/^\/api\/stock-transactions\/(\d+)$/);
  if (stockTxMatch) {
    const id = parseInt(stockTxMatch[1]);
    if (m === "PUT")    return await localStore.updateStockTransaction(id, body as any);
    if (m === "DELETE") { await localStore.deleteStockTransaction(id); return { success: true }; }
  }

  // ── Crypto transactions ────────────────────────────────────────────────────
  if (path === "/api/crypto-transactions") {
    if (m === "GET")  return await localStore.getCryptoTransactions();
    if (m === "POST") return await localStore.createCryptoTransaction(body as any);
  }
  const cryptoTxMatch = path.match(/^\/api\/crypto-transactions\/(\d+)$/);
  if (cryptoTxMatch) {
    const id = parseInt(cryptoTxMatch[1]);
    if (m === "PUT")    return await localStore.updateCryptoTransaction(id, body as any);
    if (m === "DELETE") { await localStore.deleteCryptoTransaction(id); return { success: true }; }
  }

  // ── Stock DCA ──────────────────────────────────────────────────────────
  if (path === "/api/stock-dca") {
    if (m === "GET")  return await localStore.getStockDCASchedules();
    if (m === "POST") return await localStore.createStockDCASchedule(body as any);
  }
  const stockDCAMatch = path.match(/^\/api\/stock-dca\/(\d+)$/);
  if (stockDCAMatch) {
    const id = parseInt(stockDCAMatch[1]);
    if (m === "PUT")    return await localStore.updateStockDCASchedule(id, body as any);
    if (m === "DELETE") { await localStore.deleteStockDCASchedule(id); return { success: true }; }
  }

  // ── Crypto DCA ──────────────────────────────────────────────────────────
  if (path === "/api/crypto-dca") {
    if (m === "GET")  return await localStore.getCryptoDCASchedules();
    if (m === "POST") return await localStore.createCryptoDCASchedule(body as any);
  }
  const cryptoDCAMatch = path.match(/^\/api\/crypto-dca\/(\d+)$/);
  if (cryptoDCAMatch) {
    const id = parseInt(cryptoDCAMatch[1]);
    if (m === "PUT")    return await localStore.updateCryptoDCASchedule(id, body as any);
    if (m === "DELETE") { await localStore.deleteCryptoDCASchedule(id); return { success: true }; }
  }

  // ── Income ────────────────────────────────────────────────────────────────
  if (path === "/api/income") {
    if (m === "GET")  return await localStore.getIncomeRecords();
    if (m === "POST") return await localStore.createIncomeRecord(body as any);
  }
  if (path === "/api/income/bulk") {
    if (m === "POST") {
      const { records } = body as any;
      const created = await localStore.bulkCreateIncomeRecords(records);
      return { created: created.length, records: created };
    }
  }
  const incomeTxMatch = path.match(/^\/api\/income\/(\d+)$/);
  if (incomeTxMatch) {
    const id = parseInt(incomeTxMatch[1]);
    if (m === "PUT")    return await localStore.updateIncomeRecord(id, body as any);
    if (m === "DELETE") { await localStore.deleteIncomeRecord(id); return { success: true }; }
  }

  // ── Recurring Bills ───────────────────────────────────────────────────────
  if (path === "/api/bills") {
    if (m === "GET")  return await sbBills.getAll();
    if (m === "POST") return await sbBills.create(body as any);
  }
  const billMatch = path.match(/^\/api\/bills\/(\d+)$/);
  if (billMatch) {
    const id = parseInt(billMatch[1]);
    if (m === "PUT")    return await sbBills.update(id, body as any);
    if (m === "DELETE") { await sbBills.delete(id); return { success: true }; }
  }

  // ── Monthly Budgets ───────────────────────────────────────────────────────
  if (path === "/api/budgets") {
    if (m === "GET")  return await sbBudgets.getAll();
    if (m === "POST") return await sbBudgets.upsert(body as any);
  }
  if (path === "/api/budgets/bulk") {
    if (m === "POST") {
      const { budgets } = body as any;
      const created = await sbBudgets.bulkCreate(budgets);
      return { created: created.length, budgets: created };
    }
  }
  const budgetMonthMatch = path.match(/^\/api\/budgets\/(\d+)\/(\d+)$/);
  if (budgetMonthMatch) {
    const year = parseInt(budgetMonthMatch[1]);
    const month = parseInt(budgetMonthMatch[2]);
    if (m === "GET") return await sbBudgets.getForMonth(year, month);
  }
  const budgetMatch = path.match(/^\/api\/budgets\/id\/(\d+)$/);
  if (budgetMatch) {
    const id = parseInt(budgetMatch[1]);
    if (m === "PUT")    return await sbBudgets.update(id, body as any);
    if (m === "DELETE") { await sbBudgets.delete(id); return { success: true }; }
  }

  // ── Telegram Settings ─────────────────────────────────────────────────────
  if (path === "/api/telegram-settings") {
    if (m === "GET")  return await sbTelegramSettings.get();
    if (m === "PUT")  return await sbTelegramSettings.upsert(body as any);
  }

  // ── Alert Logs ────────────────────────────────────────────────────────────
  if (path === "/api/alert-logs") {
    if (m === "GET") return await sbAlertLogs.getRecent();
  }

  // ── Family Message Log ────────────────────────────────────────────────────
  if (path === "/api/family-msg-log") {
    if (m === "GET") return await sbFamilyMsgLog.getRecent();
  }

  // ─── Market Data (prices + news) — fetched server-side to avoid CORS ────
  if (path === "/api/market-data") {
    if (m === "GET") {
      // Returns: { prices: {...}, news: [...], fearGreed: number, lastUpdated: string }
      // Check localStorage cache first (45 min TTL)
      const CACHE_KEY = "sf_market_data_cache";
      const CACHE_TTL = 45 * 60 * 1000;
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) return data;
        }
      } catch {}

      const result: any = {
        prices: {},
        indices: {},
        news: {},
        fearGreed: null,
        lastUpdated: new Date().toISOString(),
      };

      // ── Crypto prices via CoinGecko (no CORS issues) ──
      try {
        const cgUrl = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
        const cgRes = await fetch(cgUrl);
        if (cgRes.ok) {
          const cg = await cgRes.json();
          result.prices.BTC = { price: cg.bitcoin?.usd ?? 0, change: cg.bitcoin?.usd_24h_change ?? 0 };
          result.prices.ETH = { price: cg.ethereum?.usd ?? 0, change: cg.ethereum?.usd_24h_change ?? 0 };
        }
      } catch {}

      // ── Watchlist prices via CoinGecko (BTC/ETH already done above) ──
      // For stocks (NVDA, GOOGL, MSFT, AVGO, CEG, CCJ, WPM) use Yahoo Finance via allorigins proxy
      const stockSymbols = ["NVDA", "GOOGL", "MSFT", "AVGO", "CEG", "CCJ", "WPM"];
      for (const sym of stockSymbols) {
        try {
          const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
          const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(yUrl)}`,
          ];
          let done = false;
          for (const proxy of proxies) {
            if (done) break;
            try {
              const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
              if (!res.ok) continue;
              const json = await res.json();
              const meta = json?.chart?.result?.[0]?.meta;
              if (meta) {
                const price = meta.regularMarketPrice ?? 0;
                const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
                const change = prev > 0 ? ((price - prev) / prev) * 100 : 0;
                result.prices[sym] = { price, change };
                done = true;
              }
            } catch {}
          }
          if (!result.prices[sym]) result.prices[sym] = { price: 0, change: 0 };
        } catch {}
      }

      // ── Market indices via Stooq CSV (open CORS) ──
      const indicesMap: Record<string, string> = {
        "SP500": "%5ESPX",
        "NASDAQ": "%5EIXIC",
        "DOW": "%5EDJI",
        "VIX": "%5EVIX",
        "GOLD": "GC.F",
        "OIL": "CL.F",
        "USDAUD": "AUDUSD",
      };
      for (const [key, sym] of Object.entries(indicesMap)) {
        try {
          const stooqUrl = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcvn&h&e=csv`;
          const res = await fetch(stooqUrl, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) continue;
          const csv = await res.text();
          const lines = csv.trim().split("\n");
          if (lines.length < 2) continue;
          const cols = lines[1].split(",");
          const close = parseFloat(cols[6] ?? "0");
          const open = parseFloat(cols[3] ?? "0");
          const change = open > 0 ? ((close - open) / open) * 100 : 0;
          result.indices[key] = { price: close, change };
        } catch {}
      }

      // ── Fear & Greed Index ──
      try {
        const fgRes = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5000) });
        if (fgRes.ok) {
          const fg = await fgRes.json();
          result.fearGreed = parseInt(fg?.data?.[0]?.value ?? "50");
          result.fearGreedLabel = fg?.data?.[0]?.value_classification ?? "";
        }
      } catch {}

      // ── News feeds via CORS proxies ──
      const RSS_FEEDS = {
        stocks: [
          "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ&region=US&lang=en-US",
          "https://www.cnbc.com/id/10001147/device/rss/rss.html",
        ],
        crypto: [
          "https://cointelegraph.com/rss",
          "https://cryptonews.com/news/feed/",
        ],
        tech: [
          "https://hnrss.org/frontpage",
          "https://techcrunch.com/feed/",
        ],
        macro: [
          "https://www.cnbc.com/id/20910258/device/rss/rss.html",
          "https://feeds.bloomberg.com/markets/news.rss",
        ],
        australia: [
          "https://www.rba.gov.au/rss/rss-cb-speeches.xml",
          "https://www.abc.net.au/news/feed/51120/rss.xml",
        ],
      };

      const PROXIES = [
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      ];

      async function fetchRSS(feedUrl: string): Promise<any[]> {
        for (const mkProxy of PROXIES) {
          try {
            const res = await fetch(mkProxy(feedUrl), { signal: AbortSignal.timeout(7000) });
            if (!res.ok) continue;
            const xml = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, "text/xml");
            const items = Array.from(doc.querySelectorAll("item")).slice(0, 8);
            if (items.length === 0) continue;
            return items.map((item) => ({
              title: item.querySelector("title")?.textContent?.trim() ?? "",
              link: item.querySelector("link")?.textContent?.trim() ?? "",
              pubDate: item.querySelector("pubDate")?.textContent?.trim() ?? "",
              description: (item.querySelector("description")?.textContent ?? "").replace(/<[^>]*>/g, "").substring(0, 160).trim(),
            })).filter(i => i.title);
          } catch {}
        }
        return [];
      }

      for (const [tab, feeds] of Object.entries(RSS_FEEDS)) {
        const articles: any[] = [];
        for (const feed of feeds) {
          const items = await fetchRSS(feed);
          articles.push(...items);
          if (articles.length >= 10) break;
        }
        result.news[tab] = articles.slice(0, 12);
      }

      result.lastUpdated = new Date().toISOString();

      // Cache it
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
      } catch {}

      return result;
    }
  }

  // ─── Market News cache ──────────────────────────────────────────────────
  if (path === "/api/market-news-cache") {
    const SB_URL  = "https://uoraduyyxhtzixcsaidg.supabase.co";
    const SB_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";
    const headers = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };
    if (m === "GET") {
      // Return the single cached row for the given cache_key (from URL ?cache_key=...)
      const r = await fetch(`${SB_URL}/rest/v1/sf_market_news_cache?select=*&order=fetched_at.desc&limit=1`, { headers });
      if (!r.ok) return [];
      return await r.json();
    }
    if (m === "POST") {
      // Upsert cache row
      const r = await fetch(`${SB_URL}/rest/v1/sf_market_news_cache`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(body),
      });
      if (!r.ok) return [];
      return await r.json();
    }
  }

  throw new Error(`[localStore] Unhandled: ${m} ${path}`);
}

// ─── Unified request function ─────────────────────────────────────────────────

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  // On Vercel static: serve from localStore (Supabase-first)
  // Errors from handleLocalRequest are re-thrown so TanStack Query onError fires correctly.
  if (USE_LOCAL_STORE) {
    const result = await handleLocalRequest(method, path, body);  // throws on Supabase error
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Local dev: hit the real Express backend
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res;
}

// ─── Default query function ───────────────────────────────────────────────────

async function defaultQueryFn({ queryKey }: { queryKey: readonly unknown[] }) {
  const path = Array.isArray(queryKey) ? queryKey[0] : queryKey;
  const res = await apiRequest("GET", path as string);
  return res.json();
}

// ─── Query Client ─────────────────────────────────────────────────────────────
// staleTime: 0  → every component mount / navigation triggers a Supabase fetch
// gcTime: 60s   → keep unused data in memory briefly to avoid double-fetching
//                 within the same page interaction

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 0,          // Always re-fetch from Supabase on mount
      gcTime: 1000 * 60,     // 1 minute garbage collection
      retry: 1,
      refetchOnWindowFocus: true,  // Re-fetch when user tabs back in
    },
  },
});
