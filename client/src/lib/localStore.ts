/**
 * localStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Data layer for the static Vercel deployment.
 *
 * SOURCE OF TRUTH: Supabase (cloud database)
 * CACHE:           localStorage (fallback + offline support)
 *
 * Strategy on every READ:
 *   1. Fetch from Supabase first (always, no seeded gate)
 *   2. On success → update localStorage cache, return Supabase data
 *   3. On failure → fall back to localStorage cache
 *   4. Log every outcome with [SF] prefix
 *
 * Strategy on every WRITE (Save button):
 *   1. Save to Supabase first
 *   2. Update localStorage cache with the returned value
 *   3. If Supabase fails, fall back to localStorage only
 *
 * "Sync From Cloud" button: force-fetches Supabase and overwrites all cache.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  sbSnapshot, sbExpenses, sbProperties, sbStocks, sbCrypto, sbTimeline, sbScenarios,
  sbStockTx, sbCryptoTx,
} from "./supabaseClient";

// ─── Safe number helper ───────────────────────────────────────────────────────

export function safeNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function lsSet<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function nextId(items: { id: number }[]): number {
  return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Snapshot {
  id: any;
  ppor: number; cash: number; super_balance: number;
  stocks: number; crypto: number; cars: number;
  iran_property: number; other_assets: number;
  mortgage: number; other_debts: number;
  monthly_income: number; monthly_expenses: number;
  updated_at: string;
}
export interface Expense {
  id: number; date: string; amount: number; category: string;
  source_code: string;                         // expense source/type code (e.g. D, T, M)
  subcategory: string | null; description: string | null;
  payment_method: string | null; family_member: string | null;
  recurring: boolean; notes: string | null; created_at: string;
}
export interface Property {
  id: number; name: string; type: string;
  purchase_price: number; current_value: number; purchase_date: string | null;
  loan_amount: number; interest_rate: number; loan_type: string; loan_term: number;
  weekly_rent: number; rental_growth: number; vacancy_rate: number; management_fee: number;
  council_rates: number; insurance: number; maintenance: number; capital_growth: number;
  deposit: number; stamp_duty: number; legal_fees: number; selling_costs: number;
  projection_years: number; notes: string | null; created_at: string;
}
export interface Stock {
  id: number; ticker: string; name: string;
  current_price: number; current_holding: number; allocation_pct: number;
  expected_return: number; monthly_dca: number; annual_lump_sum: number;
  projection_years: number; created_at: string;
}
export interface Crypto {
  id: number; symbol: string; name: string;
  current_price: number; current_holding: number;
  expected_return: number; monthly_dca: number; lump_sum_amount: number;
  projection_years: number; created_at: string;
}
export interface TimelineEvent {
  id: number; year: number; title: string;
  description: string | null; type: string; amount: number | null; created_at: string;
}
export interface Scenario {
  id: number; name: string; data: string; created_at: string;
}

export interface StockTransaction {
  id: number;
  created_at: string;
  updated_at: string;
  transaction_type: 'buy' | 'sell';
  status: 'actual' | 'planned';
  transaction_date: string; // YYYY-MM-DD
  ticker: string;
  asset_name: string;
  units: number;
  price_per_unit: number;
  total_amount: number;
  brokerage_fee: number;
  notes: string;
  created_by: string;
}

export interface CryptoTransaction {
  id: number;
  created_at: string;
  updated_at: string;
  transaction_type: 'buy' | 'sell';
  status: 'actual' | 'planned';
  transaction_date: string; // YYYY-MM-DD
  symbol: string;
  asset_name: string;
  units: number;
  price_per_unit: number;
  total_amount: number;
  fee: number;
  notes: string;
  created_by: string;
}

// ─── Default seed values ──────────────────────────────────────────────────────

const DEFAULT_SNAPSHOT: Snapshot = {
  id: "shahrokh-family-main",
  ppor: 1510000, cash: 220000, super_balance: 85000,
  stocks: 0, crypto: 0, cars: 65000,
  iran_property: 150000, other_assets: 0,
  mortgage: 1200000, other_debts: 19000,
  monthly_income: 22000, monthly_expenses: 14540,
  updated_at: new Date().toISOString(),
};

const DEFAULT_STOCKS: Omit<Stock, "id" | "created_at">[] = [
  { ticker: "NVDA",    name: "NVIDIA Corporation",   current_price: 950, current_holding: 0, allocation_pct: 0, expected_return: 20, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "GOOGL",   name: "Alphabet Inc.",         current_price: 175, current_holding: 0, allocation_pct: 0, expected_return: 15, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "MSFT",    name: "Microsoft Corporation", current_price: 415, current_holding: 0, allocation_pct: 0, expected_return: 14, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "AVGO",    name: "Broadcom Inc.",         current_price: 185, current_holding: 0, allocation_pct: 0, expected_return: 16, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "CEG",     name: "Constellation Energy",  current_price: 240, current_holding: 0, allocation_pct: 0, expected_return: 18, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "ANET",    name: "Arista Networks",       current_price: 335, current_holding: 0, allocation_pct: 0, expected_return: 16, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "TSLA",    name: "Tesla Inc.",            current_price: 285, current_holding: 0, allocation_pct: 0, expected_return: 18, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
  { ticker: "OKLO",    name: "Oklo Inc.",             current_price: 35,  current_holding: 0, allocation_pct: 0, expected_return: 25, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 },
];

const DEFAULT_CRYPTOS: Omit<Crypto, "id" | "created_at">[] = [
  { symbol: "BTC", name: "Bitcoin",  current_price: 95000, current_holding: 0, expected_return: 40, monthly_dca: 0, lump_sum_amount: 0, projection_years: 10 },
  { symbol: "ETH", name: "Ethereum", current_price: 3200,  current_holding: 0, expected_return: 35, monthly_dca: 0, lump_sum_amount: 0, projection_years: 10 },
];

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  snapshot:   "sf_snapshot_v3",  // v3 — Supabase era
  expenses:   "sf_expenses_v3",
  properties: "sf_properties_v3",
  stocks:     "sf_stocks_v3",
  crypto:     "sf_crypto_v3",
  timeline:   "sf_timeline_v3",
  scenarios:  "sf_scenarios_v3",
  seeded:     "sf_seeded_v3",
  lastSync:   "sf_last_sync",
  stockTx:    "sf_stock_tx_v1",
  cryptoTx:   "sf_crypto_tx_v1",
};

// ─── Last sync timestamp (shown in UI) ───────────────────────────────────────

export function getLastSync(): string | null {
  return lsGet<string>(KEYS.lastSync);
}

function setLastSync() {
  lsSet(KEYS.lastSync, new Date().toISOString());
}

// ─── Snapshot normaliser ──────────────────────────────────────────────────────

function normaliseSnapshot(raw: any): Snapshot {
  return {
    id:               raw?.id ?? "shahrokh-family-main",
    ppor:             safeNum(raw?.ppor),
    cash:             safeNum(raw?.cash),
    super_balance:    safeNum(raw?.super_balance),
    stocks:           safeNum(raw?.stocks),
    crypto:           safeNum(raw?.crypto),
    cars:             safeNum(raw?.cars),
    iran_property:    safeNum(raw?.iran_property),
    other_assets:     safeNum(raw?.other_assets),
    mortgage:         safeNum(raw?.mortgage),
    other_debts:      safeNum(raw?.other_debts),
    monthly_income:   safeNum(raw?.monthly_income),
    monthly_expenses: safeNum(raw?.monthly_expenses),
    updated_at:       raw?.updated_at ?? new Date().toISOString(),
  };
}

// ─── Initial seed — ONLY seeds empty Supabase tables, no localStorage gate ───
// This runs once on first load. It will NOT block reads — reads always go to
// Supabase regardless. This only seeds Supabase if it is completely empty.

async function seedSupabaseIfEmpty() {
  try {
    const sbSnap = await sbSnapshot.get();
    if (!sbSnap) {
      console.log("[SF] Supabase snapshot empty — seeding defaults");
      await sbSnapshot.upsert({ ...DEFAULT_SNAPSHOT });
    }

    const sbStocksData = await sbStocks.getAll();
    if (sbStocksData.length === 0) {
      console.log("[SF] Supabase stocks empty — seeding defaults");
      for (const s of DEFAULT_STOCKS) await sbStocks.create(s);
    }

    const sbCryptoData = await sbCrypto.getAll();
    if (sbCryptoData.length === 0) {
      console.log("[SF] Supabase crypto empty — seeding defaults");
      for (const c of DEFAULT_CRYPTOS) await sbCrypto.create(c);
    }
  } catch (err) {
    console.warn("[SF] Seed check failed (non-fatal):", err);
  }
}

// Kick off seed check asynchronously — doesn't block first render
seedSupabaseIfEmpty().catch(() => {});

// ─── Cloud sync — pull everything from Supabase into cache ───────────────────

export async function syncFromCloud(): Promise<void> {
  console.log("[SF] syncFromCloud: pulling all data from Supabase...");
  const [snap, expenses, props, stocks, cryptos, timeline, scenarios, stockTxs, cryptoTxs] = await Promise.all([
    sbSnapshot.get(),
    sbExpenses.getAll(),
    sbProperties.getAll(),
    sbStocks.getAll(),
    sbCrypto.getAll(),
    sbTimeline.getAll(),
    sbScenarios.getAll(),
    sbStockTx.getAll(),
    sbCryptoTx.getAll(),
  ]);

  if (snap) {
    lsSet(KEYS.snapshot,   normaliseSnapshot(snap));
    console.log("[SF] Loaded from Supabase: snapshot", snap);
  }
  lsSet(KEYS.expenses,   expenses);
  lsSet(KEYS.properties, props);
  lsSet(KEYS.stocks,     stocks);
  lsSet(KEYS.crypto,     cryptos);
  lsSet(KEYS.timeline,   timeline);
  lsSet(KEYS.scenarios,  scenarios);
  lsSet(KEYS.stockTx,    stockTxs);
  lsSet(KEYS.cryptoTx,   cryptoTxs);
  setLastSync();
  console.log("[SF] syncFromCloud complete. Rows:", {
    expenses: expenses.length,
    props: props.length,
    stocks: stocks.length,
    cryptos: cryptos.length,
    timeline: timeline.length,
    scenarios: scenarios.length,
    stockTxs: stockTxs.length,
    cryptoTxs: cryptoTxs.length,
  });
}

// ─── Public data store ────────────────────────────────────────────────────────

export const localStore = {

  // ── Snapshot ───────────────────────────────────────────────────────────────

  async getSnapshot(): Promise<Snapshot> {
    try {
      const sbSnap = await sbSnapshot.get();
      if (sbSnap) {
        const result = normaliseSnapshot(sbSnap);
        lsSet(KEYS.snapshot, result);
        console.log("[SF] Loaded from Supabase: snapshot", result);
        return result;
      }
      // Supabase returned null — fall back to cache
      const cached = lsGet<any>(KEYS.snapshot);
      if (cached) {
        console.log("[SF] Fallback to local cache: snapshot");
        return normaliseSnapshot(cached);
      }
      console.log("[SF] No data anywhere — using defaults: snapshot");
      return { ...DEFAULT_SNAPSHOT };
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: snapshot", err);
      const cached = lsGet<any>(KEYS.snapshot);
      return cached ? normaliseSnapshot(cached) : { ...DEFAULT_SNAPSHOT };
    }
  },

  async updateSnapshot(data: Partial<Snapshot>): Promise<Snapshot> {
    // Read current from cache (avoids a second Supabase round-trip)
    const cached = lsGet<any>(KEYS.snapshot);
    const current = cached ? normaliseSnapshot(cached) : { ...DEFAULT_SNAPSHOT };
    const merged = normaliseSnapshot({ ...current, ...data, updated_at: new Date().toISOString() });

    // 1. Save to Supabase (source of truth)
    const saved = await sbSnapshot.upsert(merged);
    const result = saved ? normaliseSnapshot(saved) : merged;

    // 2. Update local cache
    lsSet(KEYS.snapshot, result);
    setLastSync();
    console.log("[SF] Saved to Supabase: snapshot", result);
    return result;
  },

  // ── Expenses ───────────────────────────────────────────────────────────────

  async getExpenses(): Promise<Expense[]> {
    try {
      const rows = await sbExpenses.getAll();
      lsSet(KEYS.expenses, rows);
      console.log("[SF] Loaded from Supabase: expenses", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: expenses", err);
      return lsGet<Expense[]>(KEYS.expenses) ?? [];
    }
  },

  async createExpense(data: Omit<Expense, "id" | "created_at">): Promise<Expense> {
    const saved = await sbExpenses.create(data);
    if (saved) {
      const items = lsGet<Expense[]>(KEYS.expenses) ?? [];
      lsSet(KEYS.expenses, [saved, ...items]);
      console.log("[SF] Saved to Supabase: expense created", saved.id);
      return saved;
    }
    // fallback: local only
    const items = lsGet<Expense[]>(KEYS.expenses) ?? [];
    const item: Expense = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Expense;
    lsSet(KEYS.expenses, [item, ...items]);
    console.log("[SF] Fallback to local cache: expense created locally", item.id);
    return item;
  },

  async updateExpense(id: number, data: Partial<Expense>): Promise<Expense> {
    const saved = await sbExpenses.update(id, data);
    const items = (lsGet<Expense[]>(KEYS.expenses) ?? []).map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.expenses, items);
    console.log("[SF] Saved to Supabase: expense updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteExpense(id: number): Promise<void> {
    await sbExpenses.delete(id);
    lsSet(KEYS.expenses, (lsGet<Expense[]>(KEYS.expenses) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: expense deleted", id);
  },

  async bulkCreateExpenses(rows: Omit<Expense, "id" | "created_at">[]): Promise<Expense[]> {
    const saved = await sbExpenses.bulkCreate(rows);
    if (saved.length > 0) {
      const items = lsGet<Expense[]>(KEYS.expenses) ?? [];
      lsSet(KEYS.expenses, [...saved, ...items]);
      console.log("[SF] Saved to Supabase: bulk expenses created", saved.length);
      return saved;
    }
    return Promise.all(rows.map((r) => this.createExpense(r)));
  },

  // ── Properties ─────────────────────────────────────────────────────────────

  async getProperties(): Promise<Property[]> {
    try {
      const rows = await sbProperties.getAll();
      lsSet(KEYS.properties, rows);
      console.log("[SF] Loaded from Supabase: properties", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: properties", err);
      return lsGet<Property[]>(KEYS.properties) ?? [];
    }
  },

  async createProperty(data: Omit<Property, "id" | "created_at">): Promise<Property> {
    const saved = await sbProperties.create(data);
    if (saved) {
      const items = lsGet<Property[]>(KEYS.properties) ?? [];
      lsSet(KEYS.properties, [...items, saved]);
      console.log("[SF] Saved to Supabase: property created", saved.id);
      return saved;
    }
    const items = lsGet<Property[]>(KEYS.properties) ?? [];
    const item: Property = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Property;
    lsSet(KEYS.properties, [...items, item]);
    console.log("[SF] Fallback to local cache: property created locally", item.id);
    return item;
  },

  async updateProperty(id: number, data: Partial<Property>): Promise<Property> {
    const saved = await sbProperties.update(id, data);
    const items = (lsGet<Property[]>(KEYS.properties) ?? []).map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.properties, items);
    console.log("[SF] Saved to Supabase: property updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteProperty(id: number): Promise<void> {
    await sbProperties.delete(id);
    lsSet(KEYS.properties, (lsGet<Property[]>(KEYS.properties) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: property deleted", id);
  },

  // ── Stocks ─────────────────────────────────────────────────────────────────

  async getStocks(): Promise<Stock[]> {
    try {
      const rows = await sbStocks.getAll();
      lsSet(KEYS.stocks, rows);
      console.log("[SF] Loaded from Supabase: stocks", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: stocks", err);
      return lsGet<Stock[]>(KEYS.stocks) ?? [];
    }
  },

  async createStock(data: Omit<Stock, "id" | "created_at">): Promise<Stock> {
    const saved = await sbStocks.create(data);
    if (saved) {
      const items = lsGet<Stock[]>(KEYS.stocks) ?? [];
      lsSet(KEYS.stocks, [...items, saved]);
      console.log("[SF] Saved to Supabase: stock created", saved.id);
      return saved;
    }
    const items = lsGet<Stock[]>(KEYS.stocks) ?? [];
    const item: Stock = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Stock;
    lsSet(KEYS.stocks, [...items, item]);
    console.log("[SF] Fallback to local cache: stock created locally", item.id);
    return item;
  },

  async updateStock(id: number, data: Partial<Stock>): Promise<Stock> {
    const saved = await sbStocks.update(id, data);
    const items = (lsGet<Stock[]>(KEYS.stocks) ?? []).map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.stocks, items);
    console.log("[SF] Saved to Supabase: stock updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteStock(id: number): Promise<void> {
    await sbStocks.delete(id);
    lsSet(KEYS.stocks, (lsGet<Stock[]>(KEYS.stocks) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: stock deleted", id);
  },

  // ── Crypto ─────────────────────────────────────────────────────────────────

  async getCryptos(): Promise<Crypto[]> {
    try {
      const rows = await sbCrypto.getAll();
      lsSet(KEYS.crypto, rows);
      console.log("[SF] Loaded from Supabase: crypto", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: crypto", err);
      return lsGet<Crypto[]>(KEYS.crypto) ?? [];
    }
  },

  async createCrypto(data: Omit<Crypto, "id" | "created_at">): Promise<Crypto> {
    const saved = await sbCrypto.create(data);
    if (saved) {
      const items = lsGet<Crypto[]>(KEYS.crypto) ?? [];
      lsSet(KEYS.crypto, [...items, saved]);
      console.log("[SF] Saved to Supabase: crypto created", saved.id);
      return saved;
    }
    const items = lsGet<Crypto[]>(KEYS.crypto) ?? [];
    const item: Crypto = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Crypto;
    lsSet(KEYS.crypto, [...items, item]);
    console.log("[SF] Fallback to local cache: crypto created locally", item.id);
    return item;
  },

  async updateCrypto(id: number, data: Partial<Crypto>): Promise<Crypto> {
    const saved = await sbCrypto.update(id, data);
    const items = (lsGet<Crypto[]>(KEYS.crypto) ?? []).map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.crypto, items);
    console.log("[SF] Saved to Supabase: crypto updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteCrypto(id: number): Promise<void> {
    await sbCrypto.delete(id);
    lsSet(KEYS.crypto, (lsGet<Crypto[]>(KEYS.crypto) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: crypto deleted", id);
  },

  // ── Timeline ───────────────────────────────────────────────────────────────

  async getTimelineEvents(): Promise<TimelineEvent[]> {
    try {
      const rows = await sbTimeline.getAll();
      lsSet(KEYS.timeline, rows);
      console.log("[SF] Loaded from Supabase: timeline", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: timeline", err);
      return lsGet<TimelineEvent[]>(KEYS.timeline) ?? [];
    }
  },

  async createTimelineEvent(data: Omit<TimelineEvent, "id" | "created_at">): Promise<TimelineEvent> {
    const saved = await sbTimeline.create(data);
    if (saved) {
      const items = lsGet<TimelineEvent[]>(KEYS.timeline) ?? [];
      lsSet(KEYS.timeline, [...items, saved]);
      console.log("[SF] Saved to Supabase: timeline event created", saved.id);
      return saved;
    }
    const items = lsGet<TimelineEvent[]>(KEYS.timeline) ?? [];
    const item: TimelineEvent = { ...data, id: nextId(items), created_at: new Date().toISOString() } as TimelineEvent;
    lsSet(KEYS.timeline, [...items, item]);
    console.log("[SF] Fallback to local cache: timeline event created locally", item.id);
    return item;
  },

  async updateTimelineEvent(id: number, data: Partial<TimelineEvent>): Promise<TimelineEvent> {
    const saved = await sbTimeline.update(id, data);
    const items = (lsGet<TimelineEvent[]>(KEYS.timeline) ?? []).map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.timeline, items);
    console.log("[SF] Saved to Supabase: timeline event updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteTimelineEvent(id: number): Promise<void> {
    await sbTimeline.delete(id);
    lsSet(KEYS.timeline, (lsGet<TimelineEvent[]>(KEYS.timeline) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: timeline event deleted", id);
  },

  // ── Settings (localStorage only — not synced, device preference) ───────────

  getSetting(key: string): string | null {
    const settings = lsGet<Record<string, string>>("sf_settings") ?? {};
    return settings[key] ?? null;
  },
  setSetting(key: string, value: string): void {
    const settings = lsGet<Record<string, string>>("sf_settings") ?? {};
    lsSet("sf_settings", { ...settings, [key]: value });
  },

  // ── Scenarios ──────────────────────────────────────────────────────────────

  async getScenarios(): Promise<Scenario[]> {
    try {
      const rows = await sbScenarios.getAll();
      lsSet(KEYS.scenarios, rows);
      console.log("[SF] Loaded from Supabase: scenarios", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: scenarios", err);
      return lsGet<Scenario[]>(KEYS.scenarios) ?? [];
    }
  },

  async createScenario(data: Omit<Scenario, "id" | "created_at">): Promise<Scenario> {
    const saved = await sbScenarios.create(data);
    if (saved) {
      const items = lsGet<Scenario[]>(KEYS.scenarios) ?? [];
      lsSet(KEYS.scenarios, [...items, saved]);
      console.log("[SF] Saved to Supabase: scenario created", saved.id);
      return saved;
    }
    const items = lsGet<Scenario[]>(KEYS.scenarios) ?? [];
    const item: Scenario = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Scenario;
    lsSet(KEYS.scenarios, [...items, item]);
    console.log("[SF] Fallback to local cache: scenario created locally", item.id);
    return item;
  },

  async deleteScenario(id: number): Promise<void> {
    await sbScenarios.delete(id);
    lsSet(KEYS.scenarios, (lsGet<Scenario[]>(KEYS.scenarios) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: scenario deleted", id);
  },

  // ── Stock Transactions ─────────────────────────────────────────────────────

  async getStockTransactions(): Promise<StockTransaction[]> {
    try {
      const rows = await sbStockTx.getAll();
      lsSet(KEYS.stockTx, rows);
      console.log("[SF] Loaded from Supabase: stock transactions", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: stock transactions", err);
      return lsGet<StockTransaction[]>(KEYS.stockTx) ?? [];
    }
  },

  async createStockTransaction(data: Omit<StockTransaction, "id" | "created_at" | "updated_at">): Promise<StockTransaction> {
    const saved = await sbStockTx.create(data);
    if (saved) {
      const items = lsGet<StockTransaction[]>(KEYS.stockTx) ?? [];
      lsSet(KEYS.stockTx, [saved, ...items]);
      console.log("[SF] Saved to Supabase: stock transaction created", saved.id);
      return saved;
    }
    const items = lsGet<StockTransaction[]>(KEYS.stockTx) ?? [];
    const now = new Date().toISOString();
    const item: StockTransaction = {
      ...data,
      id: nextId(items),
      created_at: now,
      updated_at: now,
    } as StockTransaction;
    lsSet(KEYS.stockTx, [item, ...items]);
    console.log("[SF] Fallback to local cache: stock transaction created locally", item.id);
    return item;
  },

  async updateStockTransaction(id: number, data: Partial<StockTransaction>): Promise<StockTransaction> {
    const saved = await sbStockTx.update(id, data);
    const items = (lsGet<StockTransaction[]>(KEYS.stockTx) ?? []).map(
      (i) => (i.id === id ? { ...i, ...(saved ?? data) } : i)
    );
    lsSet(KEYS.stockTx, items);
    console.log("[SF] Saved to Supabase: stock transaction updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteStockTransaction(id: number): Promise<void> {
    await sbStockTx.delete(id);
    lsSet(KEYS.stockTx, (lsGet<StockTransaction[]>(KEYS.stockTx) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: stock transaction deleted", id);
  },

  // ── Crypto Transactions ────────────────────────────────────────────────────

  async getCryptoTransactions(): Promise<CryptoTransaction[]> {
    try {
      const rows = await sbCryptoTx.getAll();
      lsSet(KEYS.cryptoTx, rows);
      console.log("[SF] Loaded from Supabase: crypto transactions", rows.length, "rows");
      return rows;
    } catch (err) {
      console.warn("[SF] Supabase error, fallback to local cache: crypto transactions", err);
      return lsGet<CryptoTransaction[]>(KEYS.cryptoTx) ?? [];
    }
  },

  async createCryptoTransaction(data: Omit<CryptoTransaction, "id" | "created_at" | "updated_at">): Promise<CryptoTransaction> {
    const saved = await sbCryptoTx.create(data);
    if (saved) {
      const items = lsGet<CryptoTransaction[]>(KEYS.cryptoTx) ?? [];
      lsSet(KEYS.cryptoTx, [saved, ...items]);
      console.log("[SF] Saved to Supabase: crypto transaction created", saved.id);
      return saved;
    }
    const items = lsGet<CryptoTransaction[]>(KEYS.cryptoTx) ?? [];
    const now = new Date().toISOString();
    const item: CryptoTransaction = {
      ...data,
      id: nextId(items),
      created_at: now,
      updated_at: now,
    } as CryptoTransaction;
    lsSet(KEYS.cryptoTx, [item, ...items]);
    console.log("[SF] Fallback to local cache: crypto transaction created locally", item.id);
    return item;
  },

  async updateCryptoTransaction(id: number, data: Partial<CryptoTransaction>): Promise<CryptoTransaction> {
    const saved = await sbCryptoTx.update(id, data);
    const items = (lsGet<CryptoTransaction[]>(KEYS.cryptoTx) ?? []).map(
      (i) => (i.id === id ? { ...i, ...(saved ?? data) } : i)
    );
    lsSet(KEYS.cryptoTx, items);
    console.log("[SF] Saved to Supabase: crypto transaction updated", id);
    return items.find((i) => i.id === id)!;
  },

  async deleteCryptoTransaction(id: number): Promise<void> {
    await sbCryptoTx.delete(id);
    lsSet(KEYS.cryptoTx, (lsGet<CryptoTransaction[]>(KEYS.cryptoTx) ?? []).filter((i) => i.id !== id));
    console.log("[SF] Saved to Supabase: crypto transaction deleted", id);
  },
};
