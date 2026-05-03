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
import { sbBills, sbBudgets, sbTelegramSettings, sbAlertLogs, sbFamilyMsgLog, sbPlannedInvestments, sbUsers } from "./supabaseClient";
import { sbFireSettings, sbFireScenarioConfig, sbFireYearAssumptions } from "./supabaseClient";
import { sbTaxProfile } from "./supabaseClient";
import { sbMCFireSettings, sbMCFireResults, sbMCFirePresets } from "./supabaseClient";
import {
  getDemoDataset,
  DEMO_FIRE_SETTINGS, DEMO_APP_SETTINGS, DEMO_TAX_PROFILE,
  DEMO_ALERT_LOGS, DEMO_FAMILY_MSG, DEMO_PLANNED_INVESTMENTS, DEMO_SCENARIOS,
} from "./demoData";

// ─── Detect deployment mode ───────────────────────────────────────────────────

function isStaticDeployment(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return false;
  }
  return true;
}

const USE_LOCAL_STORE = isStaticDeployment();

// ─── Demo Mode helper ─────────────────────────────────────────────────────────
// Check the Zustand persisted store without importing the hook (safe outside React)
function isDemoMode(): boolean {
  try {
    const raw = localStorage.getItem("shahrokh-app-state");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.state?.isDemo === true;
  } catch { return false; }
}

// In-memory mutable demo store (so edits during demo session feel live but never persist)
let _demoStore: ReturnType<typeof getDemoDataset> | null = null;
function getDemoStore() {
  if (!_demoStore) _demoStore = getDemoDataset();
  return _demoStore;
}
export function resetDemoStore() {
  _demoStore = getDemoDataset();
}

// ─── Demo request handler ─────────────────────────────────────────────────────
// Intercepts ALL API calls in demo mode. Reads return demo constants.
// Writes mutate the in-memory _demoStore only — Supabase is never touched.
async function handleDemoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const m   = method.toUpperCase();
  const ds  = getDemoStore();

  // ── Snapshot
  if (path === "/api/snapshot") {
    if (m === "GET") return ds.snapshot;
    if (m === "PUT") { Object.assign(ds.snapshot, body as any); return ds.snapshot; }
  }

  // ── Expenses
  if (path === "/api/expenses") {
    if (m === "GET")  return ds.expenses;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.expenses.push(item); return item; }
  }
  if (path === "/api/expenses/bulk") {
    if (m === "POST") { const { expenses } = body as any; const created = expenses.map((e: any, i: number) => ({ ...e, id: Date.now()+i, created_at: new Date().toISOString() })); ds.expenses.push(...created); return { created: created.length, expenses: created }; }
  }
  const expMatch = path.match(/^\/api\/expenses\/(\d+)$/);
  if (expMatch) {
    const id = parseInt(expMatch[1]);
    if (m === "PUT")    { const i = ds.expenses.findIndex((e: any) => e.id === id); if (i >= 0) ds.expenses[i] = { ...ds.expenses[i], ...(body as any) }; return ds.expenses[i]; }
    if (m === "DELETE") { ds.expenses = ds.expenses.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Properties
  if (path === "/api/properties") {
    if (m === "GET")  return ds.properties;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.properties.push(item); return item; }
  }
  const propMatch2 = path.match(/^\/api\/properties\/(\d+)$/);
  if (propMatch2) {
    const id = parseInt(propMatch2[1]);
    if (m === "PUT")    { const i = ds.properties.findIndex((e: any) => e.id === id); if (i >= 0) ds.properties[i] = { ...ds.properties[i], ...(body as any) }; return ds.properties[i]; }
    if (m === "DELETE") { ds.properties = ds.properties.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Stocks
  if (path === "/api/stocks") {
    if (m === "GET")  return ds.stocks;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.stocks.push(item); return item; }
  }
  const stockMatch2 = path.match(/^\/api\/stocks\/(\d+)$/);
  if (stockMatch2) {
    const id = parseInt(stockMatch2[1]);
    if (m === "PUT")    { const i = ds.stocks.findIndex((e: any) => e.id === id); if (i >= 0) ds.stocks[i] = { ...ds.stocks[i], ...(body as any) }; return ds.stocks[i]; }
    if (m === "DELETE") { ds.stocks = ds.stocks.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Crypto
  if (path === "/api/crypto") {
    if (m === "GET")  return ds.cryptos;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.cryptos.push(item); return item; }
  }
  const cryptoMatch2 = path.match(/^\/api\/crypto\/(\d+)$/);
  if (cryptoMatch2) {
    const id = parseInt(cryptoMatch2[1]);
    if (m === "PUT")    { const i = ds.cryptos.findIndex((e: any) => e.id === id); if (i >= 0) ds.cryptos[i] = { ...ds.cryptos[i], ...(body as any) }; return ds.cryptos[i]; }
    if (m === "DELETE") { ds.cryptos = ds.cryptos.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Timeline
  if (path === "/api/timeline") {
    if (m === "GET")  return ds.timeline;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.timeline.push(item); return item; }
  }
  const tlMatch2 = path.match(/^\/api\/timeline\/(\d+)$/);
  if (tlMatch2) {
    const id = parseInt(tlMatch2[1]);
    if (m === "PUT")    { const i = ds.timeline.findIndex((e: any) => e.id === id); if (i >= 0) ds.timeline[i] = { ...ds.timeline[i], ...(body as any) }; return ds.timeline[i]; }
    if (m === "DELETE") { ds.timeline = ds.timeline.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Stock transactions
  if (path === "/api/stock-transactions") {
    if (m === "GET")  return ds.stockTransactions;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; ds.stockTransactions.push(item); return item; }
  }
  const stxMatch2 = path.match(/^\/api\/stock-transactions\/(\d+)$/);
  if (stxMatch2) {
    const id = parseInt(stxMatch2[1]);
    if (m === "PUT")    { const i = ds.stockTransactions.findIndex((e: any) => e.id === id); if (i >= 0) ds.stockTransactions[i] = { ...ds.stockTransactions[i], ...(body as any) }; return ds.stockTransactions[i]; }
    if (m === "DELETE") { ds.stockTransactions = ds.stockTransactions.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Crypto transactions
  if (path === "/api/crypto-transactions") {
    if (m === "GET")  return ds.cryptoTransactions;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; ds.cryptoTransactions.push(item); return item; }
  }
  const ctxMatch2 = path.match(/^\/api\/crypto-transactions\/(\d+)$/);
  if (ctxMatch2) {
    const id = parseInt(ctxMatch2[1]);
    if (m === "PUT")    { const i = ds.cryptoTransactions.findIndex((e: any) => e.id === id); if (i >= 0) ds.cryptoTransactions[i] = { ...ds.cryptoTransactions[i], ...(body as any) }; return ds.cryptoTransactions[i]; }
    if (m === "DELETE") { ds.cryptoTransactions = ds.cryptoTransactions.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Stock DCA
  if (path === "/api/stock-dca") {
    if (m === "GET")  return ds.stockDCA;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; ds.stockDCA.push(item); return item; }
  }
  const sdcaMatch2 = path.match(/^\/api\/stock-dca\/(\d+)$/);
  if (sdcaMatch2) {
    const id = parseInt(sdcaMatch2[1]);
    if (m === "PUT")    { const i = ds.stockDCA.findIndex((e: any) => e.id === id); if (i >= 0) ds.stockDCA[i] = { ...ds.stockDCA[i], ...(body as any) }; return ds.stockDCA[i]; }
    if (m === "DELETE") { ds.stockDCA = ds.stockDCA.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Crypto DCA
  if (path === "/api/crypto-dca") {
    if (m === "GET")  return ds.cryptoDCA;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; ds.cryptoDCA.push(item); return item; }
  }
  const cdcaMatch2 = path.match(/^\/api\/crypto-dca\/(\d+)$/);
  if (cdcaMatch2) {
    const id = parseInt(cdcaMatch2[1]);
    if (m === "PUT")    { const i = ds.cryptoDCA.findIndex((e: any) => e.id === id); if (i >= 0) ds.cryptoDCA[i] = { ...ds.cryptoDCA[i], ...(body as any) }; return ds.cryptoDCA[i]; }
    if (m === "DELETE") { ds.cryptoDCA = ds.cryptoDCA.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Income
  if (path === "/api/income") {
    if (m === "GET")  return ds.income;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; ds.income.push(item); return item; }
  }
  if (path === "/api/income/bulk") {
    if (m === "POST") { const { records } = body as any; const created = records.map((r: any, i: number) => ({ ...r, id: Date.now()+i, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })); ds.income.push(...created); return { created: created.length, records: created }; }
  }
  const incMatch2 = path.match(/^\/api\/income\/(\d+)$/);
  if (incMatch2) {
    const id = parseInt(incMatch2[1]);
    if (m === "PUT")    { const i = ds.income.findIndex((e: any) => e.id === id); if (i >= 0) ds.income[i] = { ...ds.income[i], ...(body as any) }; return ds.income[i]; }
    if (m === "DELETE") { ds.income = ds.income.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Bills
  if (path === "/api/bills") {
    if (m === "GET")  return ds.bills;
    if (m === "POST") { const item = { ...(body as any), id: Date.now() }; ds.bills.push(item); return item; }
  }
  const billMatch2 = path.match(/^\/api\/bills\/(\d+)$/);
  if (billMatch2) {
    const id = parseInt(billMatch2[1]);
    if (m === "PUT")    { const i = ds.bills.findIndex((e: any) => e.id === id); if (i >= 0) ds.bills[i] = { ...ds.bills[i], ...(body as any) }; return ds.bills[i]; }
    if (m === "DELETE") { ds.bills = ds.bills.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Budgets
  if (path === "/api/budgets") {
    if (m === "GET")  return ds.budgets;
    if (m === "POST") { const item = { ...(body as any), id: Date.now() }; ds.budgets.push(item); return item; }
  }
  if (path === "/api/budgets/bulk") {
    if (m === "POST") { const { budgets } = body as any; const created = budgets.map((b: any, i: number) => ({ ...b, id: Date.now()+i })); ds.budgets.push(...created); return { created: created.length, budgets: created }; }
  }
  const budgetMonthMatch2 = path.match(/^\/api\/budgets\/(\d+)\/(\d+)$/);
  if (budgetMonthMatch2) {
    const year = parseInt(budgetMonthMatch2[1]), month = parseInt(budgetMonthMatch2[2]);
    if (m === "GET") return ds.budgets.filter((b: any) => b.year === year && b.month === month);
  }
  const budgetMatch2 = path.match(/^\/api\/budgets\/id\/(\d+)$/);
  if (budgetMatch2) {
    const id = parseInt(budgetMatch2[1]);
    if (m === "PUT")    { const i = ds.budgets.findIndex((e: any) => e.id === id); if (i >= 0) ds.budgets[i] = { ...ds.budgets[i], ...(body as any) }; return ds.budgets[i]; }
    if (m === "DELETE") { ds.budgets = ds.budgets.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Planned investments
  if (path === "/api/planned-investments" || path.startsWith("/api/planned-investments?")) {
    if (m === "GET") {
      const moduleParam = path.includes("?module=") ? path.split("?module=")[1].split("&")[0] : undefined;
      return moduleParam ? ds.plannedInvestments.filter((p: any) => p.module === moduleParam) : ds.plannedInvestments;
    }
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.plannedInvestments.push(item); return item; }
  }
  const piMatch2 = path.match(/^\/api\/planned-investments\/(\d+)$/);
  if (piMatch2) {
    const id = parseInt(piMatch2[1]);
    if (m === "PUT")    { const i = ds.plannedInvestments.findIndex((e: any) => e.id === id); if (i >= 0) ds.plannedInvestments[i] = { ...ds.plannedInvestments[i], ...(body as any) }; return ds.plannedInvestments[i]; }
    if (m === "DELETE") { ds.plannedInvestments = ds.plannedInvestments.filter((e: any) => e.id !== id); return { success: true }; }
  }

  // ── Scenarios
  if (path === "/api/scenarios") {
    if (m === "GET")  return ds.scenarios;
    if (m === "POST") { const item = { ...(body as any), id: Date.now(), created_at: new Date().toISOString() }; ds.scenarios.push(item); return item; }
  }

  // ── Settings
  const settingsMatch2 = path.match(/^\/api\/settings\/(.+)$/);
  if (settingsMatch2) {
    const key = settingsMatch2[1];
    if (m === "GET") return { key, value: ds.appSettings[key] ?? null };
    if (m === "PUT") { ds.appSettings[key] = (body as any).value; return { success: true }; }
  }
  if (path === "/api/app-settings") {
    if (m === "GET")   return { ...DEMO_APP_SETTINGS };
    if (m === "PATCH") { Object.assign(ds.appSettings, body as any); return ds.appSettings; }
  }

  // ── Tax profile
  if (path === "/api/tax-profile") {
    if (m === "GET" || m === "POST" || m === "PUT") {
      if (m !== "GET") Object.assign(ds.taxProfile ?? DEMO_TAX_PROFILE, body as any);
      return ds.taxProfile ?? DEMO_TAX_PROFILE;
    }
  }

  // ── FIRE Settings
  if (path === "/api/fire-settings") {
    if (m === "GET") return DEMO_FIRE_SETTINGS;
    if (m === "PUT") return DEMO_FIRE_SETTINGS;
  }
  if (path === "/api/fire-scenario-config") {
    if (m === "GET") return [];
    if (m === "PUT") return { success: true };
  }
  if (path === "/api/fire-year-assumptions") {
    if (m === "GET") return [];
    if (m === "PUT") return { success: true };
  }
  if (path === "/api/mc-fire-settings") {
    if (m === "GET") return {};
    if (m === "PUT") return {};
  }
  if (path === "/api/mc-fire-results") {
    if (m === "GET") return null;
    if (m === "PUT") return {};
  }
  if (path === "/api/mc-fire-presets") {
    if (m === "GET") return [];
  }

  // ── Telegram / Alert Logs / Family Msg — stub
  if (path === "/api/telegram-settings") {
    if (m === "GET") return {};
    if (m === "PUT") return { success: true };
  }
  if (path === "/api/alert-logs")    { if (m === "GET") return DEMO_ALERT_LOGS; }
  if (path === "/api/family-msg-log") { if (m === "GET") return DEMO_FAMILY_MSG; }

  // ── Users stub
  if (path === "/api/users") {
    if (m === "GET")  return [{ id: 99, display_name: "Alex Johnson", role: "demo", email: "" }];
    if (m === "POST") return { success: true };
  }

  // ── Market data — still live (no real financial data exposed)
  if (path === "/api/market-data" || path === "/api/market-news-cache") {
    return null; // market data is public prices — safe to show live
  }

  // ── Any unhandled path — return empty / success silently
  return null;
}

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

  // ── Planned Investments — one-time bulk buy/sell orders ——————————————————
  if (path === "/api/planned-investments" || path.startsWith("/api/planned-investments?")) {
    if (m === "GET") {
      // Support ?module=stock or ?module=crypto filter
      const moduleParam = path.includes("?module=")
        ? path.split("?module=")[1].split("&")[0]
        : undefined;
      return await sbPlannedInvestments.getAll(moduleParam);
    }
    if (m === "POST") return await sbPlannedInvestments.create(body as any);
  }
  const plannedInvMatch = path.match(/^\/api\/planned-investments\/(\d+)$/);
  if (plannedInvMatch) {
    const id = parseInt(plannedInvMatch[1]);
    if (m === "PUT")    return await sbPlannedInvestments.update(id, body as any);
    if (m === "DELETE") { await sbPlannedInvestments.delete(id); return { success: true }; }
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

  // ── Tax Profile ──────────────────────────────────────────────────────────
  if (path === "/api/tax-profile") {
    if (m === "GET")  return (await sbTaxProfile.get()) ?? null;
    if (m === "POST") return await sbTaxProfile.upsert(body as any);
    if (m === "PUT")  return await sbTaxProfile.upsert(body as any);
  }

  // ── FIRE Settings ──────────────────────────────────────────────────────────
  if (path === "/api/fire-settings") {
    if (m === "GET")  return (await sbFireSettings.get()) ?? {};
    if (m === "PUT")  return await sbFireSettings.upsert(body as any);
  }

  // ── FIRE Scenario Config ──────────────────────────────────────────────────
  if (path === "/api/fire-scenario-config") {
    if (m === "GET")  return await sbFireScenarioConfig.getAll();
    if (m === "PUT")  { await sbFireScenarioConfig.upsertAll(body as any[]); return { success: true }; }
  }
  const fireScenarioMatch = path.match(/^\/api\/fire-scenario-config\/([a-z]+)$/);
  if (fireScenarioMatch) {
    const scenId = fireScenarioMatch[1];
    if (m === "PUT")  return await sbFireScenarioConfig.upsert({ scenario_id: scenId, ...(body as any) });
  }

  // ── FIRE Year Assumptions ────────────────────────────────────────────────
  if (path === "/api/fire-year-assumptions") {
    if (m === "GET")  return await sbFireYearAssumptions.getAll();
    if (m === "PUT")  { await sbFireYearAssumptions.upsertAll(body as any[]); return { success: true }; }
  }

  // ── MC FIRE Settings ────────────────────────────────────────────────────
  if (path === "/api/mc-fire-settings") {
    if (m === "GET")  return (await sbMCFireSettings.get()) ?? {};
    if (m === "PUT")  return await sbMCFireSettings.upsert(body as any);
  }

  // ── MC FIRE Results ─────────────────────────────────────────────────────
  if (path === "/api/mc-fire-results") {
    if (m === "GET")  return (await sbMCFireResults.get()) ?? null;
    if (m === "PUT")  return await sbMCFireResults.upsert(body as any);
  }

  // ── MC FIRE Presets ─────────────────────────────────────────────────────
  if (path === "/api/mc-fire-presets") {
    if (m === "GET")  return await sbMCFirePresets.getAll();
  }

  // ─── Market Data (prices + news) — fetched server-side to avoid CORS ────
  if (path === "/api/market-data") {
    if (m === "GET") {
      // ── Market Data: delegate to /api/market-data Vercel serverless function ──
      // Falls back to localStorage cache if the server call fails.
      // Cache TTL: 5 min for live data, serve stale indefinitely on failure.
      const CACHE_KEY  = "sf_market_data_cache_v2";
      const LIVE_TTL   = 5 * 60 * 1000;   // 5 min
      const STALE_TTL  = 30 * 60 * 1000;  // show stale badge after 30 min

      // Read existing cache
      let cached: { data: any; ts: number } | null = null;
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) cached = JSON.parse(raw);
      } catch {}

      // If cache is fresh, return it immediately
      if (cached && Date.now() - cached.ts < LIVE_TTL) {
        return { ...cached.data, stale: false };
      }

      // Try the Vercel serverless API (server-side fetches, no CORS issues)
      try {
        const apiBase = window.location.origin;
        const res = await fetch(`${apiBase}/api/market-data`, {
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) {
          const data = await res.json();
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
          return { ...data, stale: false };
        }
      } catch {}

      // Server call failed — return stale cache with stale flag
      if (cached) {
        const ageMin = Math.round((Date.now() - cached.ts) / 60_000);
        return { ...cached.data, stale: true, staleAgeMin: ageMin };
      }

      // Nothing at all — return empty skeleton
      return {
        prices: {}, indices: {}, news: {}, fearGreed: null, fearGreedLabel: "",
        lastUpdated: new Date().toISOString(), dataStatus: "failed", stale: true,
      };
    }
  }

  // ── User Management ──────────────────────────────────────────────────────
  if (path === "/api/users") {
    if (m === "GET")  return await sbUsers.getAll();
    if (m === "POST") return await sbUsers.createUser(body as any);
  }
  const userMatch = path.match(/^\/api\/users\/(\d+)$/);
  if (userMatch) {
    const id = parseInt(userMatch[1]);
    if (m === "PUT") {
      const { password, ...rest } = body as any;
      // Update user fields
      if (Object.keys(rest).length > 0) await sbUsers.updateUser(id, rest);
      // Update password separately if provided
      if (password) await sbUsers.updatePassword(id, password);
      return await sbUsers.getAll().then(all => all.find((u: any) => u.id === id) ?? { id });
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
  // ── Demo mode: serve from in-memory demo constants — NEVER touch Supabase
  if (isDemoMode()) {
    const result = await handleDemoRequest(method, path, body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

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
