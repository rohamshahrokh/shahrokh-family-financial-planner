/**
 * localStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained localStorage data layer.
 * Used on Vercel (static deployment) where no Express/SQLite backend is present.
 * All data is persisted in localStorage under namespaced keys.
 * Seeded with the Shahrokh family default financial snapshot on first load.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked — silently ignore
  }
}

function nextId(items: { id: number }[]): number {
  return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1;
}

// ─── Types (mirror shared/schema.ts select types) ─────────────────────────────

export interface Snapshot {
  id: number;
  ppor: number;
  cash: number;
  super_: number;
  stocks: number;
  crypto: number;
  cars: number;
  iranProperty: number;
  otherAssets: number;
  mortgage: number;
  otherDebts: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  updatedAt: string;
}

export interface Expense {
  id: number;
  date: string;
  amount: number;
  category: string;
  subCategory: string | null;
  description: string | null;
  paymentMethod: string | null;
  member: string | null;
  isRecurring: boolean;
  createdAt: string;
}

export interface Property {
  id: number;
  name: string;
  type: string;
  currentValue: number;
  purchasePrice: number;
  purchaseDate: string | null;
  loanBalance: number;
  interestRate: number;
  loanTermYears: number;
  weeklyRent: number;
  annualExpenses: number;
  growthRate: number;
  createdAt: string;
}

export interface Stock {
  id: number;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  expectedReturn: number;
  monthlyDca: number;
  currency: string;
  createdAt: string;
}

export interface Crypto {
  id: number;
  symbol: string;
  name: string;
  holdings: number;
  avgCost: number;
  currentPrice: number;
  expectedReturn: number;
  monthlyDca: number;
  createdAt: string;
}

export interface TimelineEvent {
  id: number;
  year: number;
  title: string;
  description: string | null;
  type: string;
  amount: number | null;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Scenario {
  id: number;
  name: string;
  data: string;
  createdAt: string;
}

// ─── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_SNAPSHOT: Snapshot = {
  id: 1,
  ppor: 1510000,
  cash: 220000,
  super_: 85000,
  stocks: 0,
  crypto: 0,
  cars: 65000,
  iranProperty: 150000,
  otherAssets: 0,
  mortgage: 1200000,
  otherDebts: 19000,
  monthlyIncome: 22000,
  monthlyExpenses: 14540,
  updatedAt: new Date().toISOString(),
};

const DEFAULT_STOCKS: Omit<Stock, "id" | "createdAt">[] = [
  { ticker: "NVDA",    name: "NVIDIA Corporation",     shares: 0, avgCost: 0, currentPrice: 950,  expectedReturn: 20, monthlyDca: 0, currency: "USD" },
  { ticker: "GOOGL",   name: "Alphabet Inc.",           shares: 0, avgCost: 0, currentPrice: 175,  expectedReturn: 15, monthlyDca: 0, currency: "USD" },
  { ticker: "MSFT",    name: "Microsoft Corporation",   shares: 0, avgCost: 0, currentPrice: 415,  expectedReturn: 14, monthlyDca: 0, currency: "USD" },
  { ticker: "AVGO",    name: "Broadcom Inc.",           shares: 0, avgCost: 0, currentPrice: 185,  expectedReturn: 16, monthlyDca: 0, currency: "USD" },
  { ticker: "CEG",     name: "Constellation Energy",   shares: 0, avgCost: 0, currentPrice: 240,  expectedReturn: 18, monthlyDca: 0, currency: "USD" },
  { ticker: "STCK.TO", name: "Stack Capital (CA)",      shares: 0, avgCost: 0, currentPrice: 45,   expectedReturn: 12, monthlyDca: 0, currency: "CAD" },
  { ticker: "ANET",    name: "Arista Networks",         shares: 0, avgCost: 0, currentPrice: 335,  expectedReturn: 16, monthlyDca: 0, currency: "USD" },
  { ticker: "TSLA",    name: "Tesla Inc.",              shares: 0, avgCost: 0, currentPrice: 285,  expectedReturn: 18, monthlyDca: 0, currency: "USD" },
  { ticker: "OKLO",    name: "Oklo Inc.",               shares: 0, avgCost: 0, currentPrice: 35,   expectedReturn: 25, monthlyDca: 0, currency: "USD" },
];

const DEFAULT_CRYPTOS: Omit<Crypto, "id" | "createdAt">[] = [
  { symbol: "BTC", name: "Bitcoin",  holdings: 0, avgCost: 0, currentPrice: 95000, expectedReturn: 40, monthlyDca: 0 },
  { symbol: "ETH", name: "Ethereum", holdings: 0, avgCost: 0, currentPrice: 3200,  expectedReturn: 35, monthlyDca: 0 },
];

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEYS = {
  snapshot:  "sf_snapshot",
  expenses:  "sf_expenses",
  properties:"sf_properties",
  stocks:    "sf_stocks",
  crypto:    "sf_crypto",
  timeline:  "sf_timeline",
  settings:  "sf_settings",
  scenarios: "sf_scenarios",
  seeded:    "sf_seeded",
};

// ─── Seed on first load ───────────────────────────────────────────────────────

function seed() {
  if (lsGet<boolean>(KEYS.seeded)) return;

  lsSet(KEYS.snapshot, DEFAULT_SNAPSHOT);
  lsSet(KEYS.expenses, []);
  lsSet(KEYS.properties, []);
  lsSet(
    KEYS.stocks,
    DEFAULT_STOCKS.map((s, i) => ({
      ...s,
      id: i + 1,
      createdAt: new Date().toISOString(),
    }))
  );
  lsSet(
    KEYS.crypto,
    DEFAULT_CRYPTOS.map((c, i) => ({
      ...c,
      id: i + 1,
      createdAt: new Date().toISOString(),
    }))
  );
  lsSet(KEYS.timeline, []);
  lsSet(KEYS.settings, []);
  lsSet(KEYS.scenarios, []);
  lsSet(KEYS.seeded, true);
}

seed();

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export const localStore = {
  // Snapshot
  getSnapshot(): Snapshot {
    return lsGet<Snapshot>(KEYS.snapshot) ?? DEFAULT_SNAPSHOT;
  },
  updateSnapshot(data: Partial<Snapshot>): Snapshot {
    const current = this.getSnapshot();
    const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
    lsSet(KEYS.snapshot, updated);
    return updated;
  },

  // Expenses
  getExpenses(): Expense[] {
    return lsGet<Expense[]>(KEYS.expenses) ?? [];
  },
  createExpense(data: Omit<Expense, "id" | "createdAt">): Expense {
    const items = this.getExpenses();
    const item: Expense = { ...data, id: nextId(items), createdAt: new Date().toISOString() } as Expense;
    lsSet(KEYS.expenses, [...items, item]);
    return item;
  },
  updateExpense(id: number, data: Partial<Expense>): Expense {
    const items = this.getExpenses().map((i) => (i.id === id ? { ...i, ...data } : i));
    lsSet(KEYS.expenses, items);
    return items.find((i) => i.id === id)!;
  },
  deleteExpense(id: number): void {
    lsSet(KEYS.expenses, this.getExpenses().filter((i) => i.id !== id));
  },
  bulkCreateExpenses(rows: Omit<Expense, "id" | "createdAt">[]): Expense[] {
    const created = rows.map((r) => this.createExpense(r));
    return created;
  },

  // Properties
  getProperties(): Property[] {
    return lsGet<Property[]>(KEYS.properties) ?? [];
  },
  createProperty(data: Omit<Property, "id" | "createdAt">): Property {
    const items = this.getProperties();
    const item: Property = { ...data, id: nextId(items), createdAt: new Date().toISOString() } as Property;
    lsSet(KEYS.properties, [...items, item]);
    return item;
  },
  updateProperty(id: number, data: Partial<Property>): Property {
    const items = this.getProperties().map((i) => (i.id === id ? { ...i, ...data } : i));
    lsSet(KEYS.properties, items);
    return items.find((i) => i.id === id)!;
  },
  deleteProperty(id: number): void {
    lsSet(KEYS.properties, this.getProperties().filter((i) => i.id !== id));
  },

  // Stocks
  getStocks(): Stock[] {
    return lsGet<Stock[]>(KEYS.stocks) ?? [];
  },
  createStock(data: Omit<Stock, "id" | "createdAt">): Stock {
    const items = this.getStocks();
    const item: Stock = { ...data, id: nextId(items), createdAt: new Date().toISOString() } as Stock;
    lsSet(KEYS.stocks, [...items, item]);
    return item;
  },
  updateStock(id: number, data: Partial<Stock>): Stock {
    const items = this.getStocks().map((i) => (i.id === id ? { ...i, ...data } : i));
    lsSet(KEYS.stocks, items);
    return items.find((i) => i.id === id)!;
  },
  deleteStock(id: number): void {
    lsSet(KEYS.stocks, this.getStocks().filter((i) => i.id !== id));
  },

  // Crypto
  getCryptos(): Crypto[] {
    return lsGet<Crypto[]>(KEYS.crypto) ?? [];
  },
  createCrypto(data: Omit<Crypto, "id" | "createdAt">): Crypto {
    const items = this.getCryptos();
    const item: Crypto = { ...data, id: nextId(items), createdAt: new Date().toISOString() } as Crypto;
    lsSet(KEYS.crypto, [...items, item]);
    return item;
  },
  updateCrypto(id: number, data: Partial<Crypto>): Crypto {
    const items = this.getCryptos().map((i) => (i.id === id ? { ...i, ...data } : i));
    lsSet(KEYS.crypto, items);
    return items.find((i) => i.id === id)!;
  },
  deleteCrypto(id: number): void {
    lsSet(KEYS.crypto, this.getCryptos().filter((i) => i.id !== id));
  },

  // Timeline
  getTimelineEvents(): TimelineEvent[] {
    return lsGet<TimelineEvent[]>(KEYS.timeline) ?? [];
  },
  createTimelineEvent(data: Omit<TimelineEvent, "id" | "createdAt">): TimelineEvent {
    const items = this.getTimelineEvents();
    const item: TimelineEvent = { ...data, id: nextId(items), createdAt: new Date().toISOString() } as TimelineEvent;
    lsSet(KEYS.timeline, [...items, item]);
    return item;
  },
  updateTimelineEvent(id: number, data: Partial<TimelineEvent>): TimelineEvent {
    const items = this.getTimelineEvents().map((i) => (i.id === id ? { ...i, ...data } : i));
    lsSet(KEYS.timeline, items);
    return items.find((i) => i.id === id)!;
  },
  deleteTimelineEvent(id: number): void {
    lsSet(KEYS.timeline, this.getTimelineEvents().filter((i) => i.id !== id));
  },

  // Settings
  getSetting(key: string): string | null {
    const settings = lsGet<Record<string, string>>(KEYS.settings) ?? {};
    return settings[key] ?? null;
  },
  setSetting(key: string, value: string): void {
    const settings = lsGet<Record<string, string>>(KEYS.settings) ?? {};
    lsSet(KEYS.settings, { ...settings, [key]: value });
  },

  // Scenarios
  getScenarios(): Scenario[] {
    return lsGet<Scenario[]>(KEYS.scenarios) ?? [];
  },
  createScenario(data: Omit<Scenario, "id" | "createdAt">): Scenario {
    const items = this.getScenarios();
    const item: Scenario = { ...data, id: nextId(items), createdAt: new Date().toISOString() } as Scenario;
    lsSet(KEYS.scenarios, [...items, item]);
    return item;
  },
  deleteScenario(id: number): void {
    lsSet(KEYS.scenarios, this.getScenarios().filter((i) => i.id !== id));
  },
};
