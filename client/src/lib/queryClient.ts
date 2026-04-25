/**
 * queryClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TanStack Query client + unified API request function.
 *
 * On local dev (Express backend running on :5000) all /api/* calls hit the
 * real Express routes as before.
 *
 * On Vercel (static deployment, no Express) the same /api/* paths are
 * intercepted client-side and served directly from localStore (localStorage).
 * This means zero code changes are needed in any page component — they all
 * call apiRequest("/api/snapshot") etc. exactly as before.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { QueryClient } from "@tanstack/react-query";
import { localStore } from "./localStore";

// ─── Detect deployment mode ───────────────────────────────────────────────────
// When running on Vercel there is no Express server, so we intercept API calls.
// We detect this by checking if the Vite-injected port proxy token is present.
// In production builds __PORT_5000__ is replaced with the actual proxy path.
// On Vercel static hosting the token replacement never happens, so it stays as
// the literal string — meaning there is no backend to call.

function isStaticDeployment(): boolean {
  // On local dev: window.location.port is "5000" (Express serves everything)
  // On Vercel static: no port, no Express — we serve from localStorage
  if (typeof window === "undefined") return false;
  // If we're on localhost we always go to the real API
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return false;
  }
  return true;
}

const USE_LOCAL_STORE = isStaticDeployment();

// ─── Local API handler ────────────────────────────────────────────────────────
// Maps every API endpoint to a localStore call.
// Returns the same shape the Express routes return.

function handleLocalRequest(method: string, path: string, body?: unknown): unknown {
  const m = method.toUpperCase();

  // ── Snapshot ──────────────────────────────────────────────────────────────
  if (path === "/api/snapshot") {
    if (m === "GET") return localStore.getSnapshot();
    if (m === "PUT") return localStore.updateSnapshot(body as any);
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  if (path === "/api/expenses") {
    if (m === "GET") return localStore.getExpenses();
    if (m === "POST") return localStore.createExpense(body as any);
  }
  if (path === "/api/expenses/bulk") {
    if (m === "POST") {
      const { expenses } = body as any;
      const created = localStore.bulkCreateExpenses(expenses);
      return { created: created.length, expenses: created };
    }
  }
  const expenseMatch = path.match(/^\/api\/expenses\/(\d+)$/);
  if (expenseMatch) {
    const id = parseInt(expenseMatch[1]);
    if (m === "PUT")    return localStore.updateExpense(id, body as any);
    if (m === "DELETE") { localStore.deleteExpense(id); return { success: true }; }
  }

  // ── Properties ────────────────────────────────────────────────────────────
  if (path === "/api/properties") {
    if (m === "GET")  return localStore.getProperties();
    if (m === "POST") return localStore.createProperty(body as any);
  }
  const propMatch = path.match(/^\/api\/properties\/(\d+)$/);
  if (propMatch) {
    const id = parseInt(propMatch[1]);
    if (m === "PUT")    return localStore.updateProperty(id, body as any);
    if (m === "DELETE") { localStore.deleteProperty(id); return { success: true }; }
  }

  // ── Stocks ────────────────────────────────────────────────────────────────
  if (path === "/api/stocks") {
    if (m === "GET")  return localStore.getStocks();
    if (m === "POST") return localStore.createStock(body as any);
  }
  const stockMatch = path.match(/^\/api\/stocks\/(\d+)$/);
  if (stockMatch) {
    const id = parseInt(stockMatch[1]);
    if (m === "PUT")    return localStore.updateStock(id, body as any);
    if (m === "DELETE") { localStore.deleteStock(id); return { success: true }; }
  }

  // ── Crypto ────────────────────────────────────────────────────────────────
  if (path === "/api/crypto") {
    if (m === "GET")  return localStore.getCryptos();
    if (m === "POST") return localStore.createCrypto(body as any);
  }
  const cryptoMatch = path.match(/^\/api\/crypto\/(\d+)$/);
  if (cryptoMatch) {
    const id = parseInt(cryptoMatch[1]);
    if (m === "PUT")    return localStore.updateCrypto(id, body as any);
    if (m === "DELETE") { localStore.deleteCrypto(id); return { success: true }; }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  if (path === "/api/timeline") {
    if (m === "GET")  return localStore.getTimelineEvents();
    if (m === "POST") return localStore.createTimelineEvent(body as any);
  }
  const timelineMatch = path.match(/^\/api\/timeline\/(\d+)$/);
  if (timelineMatch) {
    const id = parseInt(timelineMatch[1]);
    if (m === "PUT")    return localStore.updateTimelineEvent(id, body as any);
    if (m === "DELETE") { localStore.deleteTimelineEvent(id); return { success: true }; }
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
    if (m === "GET")  return localStore.getScenarios();
    if (m === "POST") return localStore.createScenario(body as any);
  }
  const scenarioMatch = path.match(/^\/api\/scenarios\/(\d+)$/);
  if (scenarioMatch) {
    const id = parseInt(scenarioMatch[1]);
    if (m === "DELETE") { localStore.deleteScenario(id); return { success: true }; }
  }

  throw new Error(`[localStore] Unhandled: ${m} ${path}`);
}

// ─── Unified request function ─────────────────────────────────────────────────

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  // On Vercel static: serve from localStorage synchronously, return a fake Response
  if (USE_LOCAL_STORE) {
    try {
      const result = handleLocalRequest(method, path, body);
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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});
