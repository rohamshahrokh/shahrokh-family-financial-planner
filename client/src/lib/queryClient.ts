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

  // ── Settings ──────────────────────────────────────────────────────────────
  const settingsMatch = path.match(/^\/api\/settings\/(.+)$/);
  if (settingsMatch) {
    const key = settingsMatch[1];
    if (m === "GET") return { key, value: localStore.getSetting(key) };
    if (m === "PUT") { localStore.setSetting(key, (body as any).value); return { success: true }; }
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

  throw new Error(`[localStore] Unhandled: ${m} ${path}`);
}

// ─── Unified request function ─────────────────────────────────────────────────

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  // On Vercel static: serve from localStore (Supabase-first), return a fake Response
  if (USE_LOCAL_STORE) {
    try {
      const result = await handleLocalRequest(method, path, body);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ message: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
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
