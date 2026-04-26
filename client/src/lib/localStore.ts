/**
 * localStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Data layer for the static Vercel deployment.
 *
 * SOURCE OF TRUTH: Supabase (cloud database)
 * CACHE:           localStorage (fallback + offline support)
 *
 * Strategy on every READ:
 *   1. Return localStorage cache immediately (fast, no flash)
 *   2. Fetch from Supabase in background and update cache
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

// ─── Seed on first load (localStorage only — Supabase already seeded via migration) ──

async function seedIfNeeded() {
  if (lsGet<boolean>(KEYS.seeded)) return;

  // Try to pull from Supabase first
  const sbSnap = await sbSnapshot.get();
  if (sbSnap) {
    // Supabase has data — populate local cache from cloud
    lsSet(KEYS.snapshot, normaliseSnapshot(sbSnap));
  } else {
    // Nothing in Supabase either — seed both
    const defaultSnap = { ...DEFAULT_SNAPSHOT };
    lsSet(KEYS.snapshot, defaultSnap);
    await sbSnapshot.upsert(defaultSnap);
  }

  // Seed stocks cache from Supabase or defaults
  const sbStocksData = await sbStocks.getAll();
  if (sbStocksData.length > 0) {
    lsSet(KEYS.stocks, sbStocksData);
  } else {
    const defaultStocks = DEFAULT_STOCKS.map((s, i) => ({ ...s, id: i + 1, created_at: new Date().toISOString() }));
    lsSet(KEYS.stocks, defaultStocks);
    for (const s of DEFAULT_STOCKS) await sbStocks.create(s);
  }

  // Seed cryptos cache from Supabase or defaults
  const sbCryptoData = await sbCrypto.getAll();
  if (sbCryptoData.length > 0) {
    lsSet(KEYS.crypto, sbCryptoData);
  } else {
    const defaultCryptos = DEFAULT_CRYPTOS.map((c, i) => ({ ...c, id: i + 1, created_at: new Date().toISOString() }));
    lsSet(KEYS.crypto, defaultCryptos);
    for (const c of DEFAULT_CRYPTOS) await sbCrypto.create(c);
  }

  // Other collections default to empty
  lsSet(KEYS.expenses,   []);
  lsSet(KEYS.properties, []);
  lsSet(KEYS.timeline,   []);
  lsSet(KEYS.scenarios,  []);

  lsSet(KEYS.seeded, true);
  setLastSync();
}

// Kick off seed asynchronously — doesn't block first render
seedIfNeeded().catch(() => {});

// ─── Cloud sync — pull everything from Supabase into cache ───────────────────

export async function syncFromCloud(): Promise<void> {
  const [snap, expenses, props, stocks, cryptos, timeline, scenarios] = await Promise.all([
    sbSnapshot.get(),
    sbExpenses.getAll(),
    sbProperties.getAll(),
    sbStocks.getAll(),
    sbCrypto.getAll(),
    sbTimeline.getAll(),
    sbScenarios.getAll(),
  ]);

  if (snap) lsSet(KEYS.snapshot,   normaliseSnapshot(snap));
  lsSet(KEYS.expenses,   expenses);
  lsSet(KEYS.properties, props);
  lsSet(KEYS.stocks,     stocks);
  lsSet(KEYS.crypto,     cryptos);
  lsSet(KEYS.timeline,   timeline);
  lsSet(KEYS.scenarios,  scenarios);
  setLastSync();
}

// ─── Public data store ────────────────────────────────────────────────────────

export const localStore = {

  // ── Snapshot ───────────────────────────────────────────────────────────────

  getSnapshot(): Snapshot {
    const raw = lsGet<any>(KEYS.snapshot);
    if (!raw) return { ...DEFAULT_SNAPSHOT };
    return normaliseSnapshot(raw);
  },

  async updateSnapshot(data: Partial<Snapshot>): Promise<Snapshot> {
    const current = this.getSnapshot();
    const merged = normaliseSnapshot({ ...current, ...data, updated_at: new Date().toISOString() });

    // 1. Save to Supabase (source of truth)
    const saved = await sbSnapshot.upsert(merged);
    const result = saved ? normaliseSnapshot(saved) : merged;

    // 2. Update local cache
    lsSet(KEYS.snapshot, result);
    setLastSync();
    return result;
  },

  // ── Expenses ───────────────────────────────────────────────────────────────

  getExpenses(): Expense[] {
    return lsGet<Expense[]>(KEYS.expenses) ?? [];
  },

  async createExpense(data: Omit<Expense, "id" | "created_at">): Promise<Expense> {
    const saved = await sbExpenses.create(data);
    if (saved) {
      const items = this.getExpenses();
      lsSet(KEYS.expenses, [saved, ...items]);
      return saved;
    }
    // fallback: local only
    const items = this.getExpenses();
    const item: Expense = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Expense;
    lsSet(KEYS.expenses, [item, ...items]);
    return item;
  },

  async updateExpense(id: number, data: Partial<Expense>): Promise<Expense> {
    const saved = await sbExpenses.update(id, data);
    const items = this.getExpenses().map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.expenses, items);
    return items.find((i) => i.id === id)!;
  },

  async deleteExpense(id: number): Promise<void> {
    await sbExpenses.delete(id);
    lsSet(KEYS.expenses, this.getExpenses().filter((i) => i.id !== id));
  },

  async bulkCreateExpenses(rows: Omit<Expense, "id" | "created_at">[]): Promise<Expense[]> {
    const saved = await sbExpenses.bulkCreate(rows);
    if (saved.length > 0) {
      const items = this.getExpenses();
      lsSet(KEYS.expenses, [...saved, ...items]);
      return saved;
    }
    return Promise.all(rows.map((r) => this.createExpense(r)));
  },

  // ── Properties ─────────────────────────────────────────────────────────────

  getProperties(): Property[] {
    return lsGet<Property[]>(KEYS.properties) ?? [];
  },

  async createProperty(data: Omit<Property, "id" | "created_at">): Promise<Property> {
    const saved = await sbProperties.create(data);
    if (saved) {
      const items = this.getProperties();
      lsSet(KEYS.properties, [...items, saved]);
      return saved;
    }
    const items = this.getProperties();
    const item: Property = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Property;
    lsSet(KEYS.properties, [...items, item]);
    return item;
  },

  async updateProperty(id: number, data: Partial<Property>): Promise<Property> {
    const saved = await sbProperties.update(id, data);
    const items = this.getProperties().map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.properties, items);
    return items.find((i) => i.id === id)!;
  },

  async deleteProperty(id: number): Promise<void> {
    await sbProperties.delete(id);
    lsSet(KEYS.properties, this.getProperties().filter((i) => i.id !== id));
  },

  // ── Stocks ─────────────────────────────────────────────────────────────────

  getStocks(): Stock[] {
    return lsGet<Stock[]>(KEYS.stocks) ?? [];
  },

  async createStock(data: Omit<Stock, "id" | "created_at">): Promise<Stock> {
    const saved = await sbStocks.create(data);
    if (saved) {
      const items = this.getStocks();
      lsSet(KEYS.stocks, [...items, saved]);
      return saved;
    }
    const items = this.getStocks();
    const item: Stock = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Stock;
    lsSet(KEYS.stocks, [...items, item]);
    return item;
  },

  async updateStock(id: number, data: Partial<Stock>): Promise<Stock> {
    const saved = await sbStocks.update(id, data);
    const items = this.getStocks().map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.stocks, items);
    return items.find((i) => i.id === id)!;
  },

  async deleteStock(id: number): Promise<void> {
    await sbStocks.delete(id);
    lsSet(KEYS.stocks, this.getStocks().filter((i) => i.id !== id));
  },

  // ── Crypto ─────────────────────────────────────────────────────────────────

  getCryptos(): Crypto[] {
    return lsGet<Crypto[]>(KEYS.crypto) ?? [];
  },

  async createCrypto(data: Omit<Crypto, "id" | "created_at">): Promise<Crypto> {
    const saved = await sbCrypto.create(data);
    if (saved) {
      const items = this.getCryptos();
      lsSet(KEYS.crypto, [...items, saved]);
      return saved;
    }
    const items = this.getCryptos();
    const item: Crypto = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Crypto;
    lsSet(KEYS.crypto, [...items, item]);
    return item;
  },

  async updateCrypto(id: number, data: Partial<Crypto>): Promise<Crypto> {
    const saved = await sbCrypto.update(id, data);
    const items = this.getCryptos().map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.crypto, items);
    return items.find((i) => i.id === id)!;
  },

  async deleteCrypto(id: number): Promise<void> {
    await sbCrypto.delete(id);
    lsSet(KEYS.crypto, this.getCryptos().filter((i) => i.id !== id));
  },

  // ── Timeline ───────────────────────────────────────────────────────────────

  getTimelineEvents(): TimelineEvent[] {
    return lsGet<TimelineEvent[]>(KEYS.timeline) ?? [];
  },

  async createTimelineEvent(data: Omit<TimelineEvent, "id" | "created_at">): Promise<TimelineEvent> {
    const saved = await sbTimeline.create(data);
    if (saved) {
      const items = this.getTimelineEvents();
      lsSet(KEYS.timeline, [...items, saved]);
      return saved;
    }
    const items = this.getTimelineEvents();
    const item: TimelineEvent = { ...data, id: nextId(items), created_at: new Date().toISOString() } as TimelineEvent;
    lsSet(KEYS.timeline, [...items, item]);
    return item;
  },

  async updateTimelineEvent(id: number, data: Partial<TimelineEvent>): Promise<TimelineEvent> {
    const saved = await sbTimeline.update(id, data);
    const items = this.getTimelineEvents().map((i) => (i.id === id ? { ...i, ...(saved ?? data) } : i));
    lsSet(KEYS.timeline, items);
    return items.find((i) => i.id === id)!;
  },

  async deleteTimelineEvent(id: number): Promise<void> {
    await sbTimeline.delete(id);
    lsSet(KEYS.timeline, this.getTimelineEvents().filter((i) => i.id !== id));
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

  getScenarios(): Scenario[] {
    return lsGet<Scenario[]>(KEYS.scenarios) ?? [];
  },

  async createScenario(data: Omit<Scenario, "id" | "created_at">): Promise<Scenario> {
    const saved = await sbScenarios.create(data);
    if (saved) {
      const items = this.getScenarios();
      lsSet(KEYS.scenarios, [...items, saved]);
      return saved;
    }
    const items = this.getScenarios();
    const item: Scenario = { ...data, id: nextId(items), created_at: new Date().toISOString() } as Scenario;
    lsSet(KEYS.scenarios, [...items, item]);
    return item;
  },

  async deleteScenario(id: number): Promise<void> {
    await sbScenarios.delete(id);
    lsSet(KEYS.scenarios, this.getScenarios().filter((i) => i.id !== id));
  },
};
