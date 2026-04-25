/**
 * localStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained localStorage data layer.
 * Used on Vercel (static deployment) where no Express/SQLite backend is present.
 *
 * IMPORTANT: All Snapshot field names exactly match what the Express/SQLite
 * backend returns (snake_case) so that dashboard.tsx and finance.ts work
 * identically whether the app is running locally or on Vercel.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Safe number helper ───────────────────────────────────────────────────────
// Converts undefined, null, NaN, empty string → 0. Preserves valid numbers.

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

// ─── Types ────────────────────────────────────────────────────────────────────
// Field names deliberately match the SQLite/Express schema (snake_case) so all
// existing page components work without any changes.

export interface Snapshot {
  id: number;
  ppor: number;
  cash: number;
  super_balance: number;   // was super_ — fixed to match dashboard/finance.ts
  stocks: number;
  crypto: number;
  cars: number;
  iran_property: number;   // was iranProperty — fixed
  other_assets: number;
  mortgage: number;
  other_debts: number;     // was otherDebts — fixed
  monthly_income: number;  // was monthlyIncome — fixed
  monthly_expenses: number;// was monthlyExpenses — fixed
  updated_at: string;
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

export interface Scenario {
  id: number;
  name: string;
  data: string;
  createdAt: string;
}

// ─── Default seed — exact Shahrokh family values ──────────────────────────────

const DEFAULT_SNAPSHOT: Snapshot = {
  id: 1,
  ppor: 1510000,
  cash: 220000,
  super_balance: 85000,
  stocks: 0,
  crypto: 0,
  cars: 65000,
  iran_property: 150000,
  other_assets: 0,
  mortgage: 1200000,
  other_debts: 19000,
  monthly_income: 22000,
  monthly_expenses: 14540,
  updated_at: new Date().toISOString(),
};

// Calculated values from defaults (sanity check):
// Total Assets     = 1510000 + 220000 + 85000 + 0 + 0 + 65000 + 150000 = 2,030,000 ✓
// Total Liabilities = 1200000 + 19000 = 1,219,000 ✓
// Net Worth        = 2030000 - 1219000 = 811,000 ✓
// Monthly Surplus  = 22000 - 14540 = 7,460 ✓

const DEFAULT_STOCKS: Omit<Stock, "id" | "createdAt">[] = [
  { ticker: "NVDA",    name: "NVIDIA Corporation",   shares: 0, avgCost: 0, currentPrice: 950,  expectedReturn: 20, monthlyDca: 0, currency: "USD" },
  { ticker: "GOOGL",   name: "Alphabet Inc.",         shares: 0, avgCost: 0, currentPrice: 175,  expectedReturn: 15, monthlyDca: 0, currency: "USD" },
  { ticker: "MSFT",    name: "Microsoft Corporation", shares: 0, avgCost: 0, currentPrice: 415,  expectedReturn: 14, monthlyDca: 0, currency: "USD" },
  { ticker: "AVGO",    name: "Broadcom Inc.",         shares: 0, avgCost: 0, currentPrice: 185,  expectedReturn: 16, monthlyDca: 0, currency: "USD" },
  { ticker: "CEG",     name: "Constellation Energy",  shares: 0, avgCost: 0, currentPrice: 240,  expectedReturn: 18, monthlyDca: 0, currency: "USD" },
  { ticker: "STCK.TO", name: "Stack Capital (CA)",    shares: 0, avgCost: 0, currentPrice: 45,   expectedReturn: 12, monthlyDca: 0, currency: "CAD" },
  { ticker: "ANET",    name: "Arista Networks",       shares: 0, avgCost: 0, currentPrice: 335,  expectedReturn: 16, monthlyDca: 0, currency: "USD" },
  { ticker: "TSLA",    name: "Tesla Inc.",            shares: 0, avgCost: 0, currentPrice: 285,  expectedReturn: 18, monthlyDca: 0, currency: "USD" },
  { ticker: "OKLO",    name: "Oklo Inc.",             shares: 0, avgCost: 0, currentPrice: 35,   expectedReturn: 25, monthlyDca: 0, currency: "USD" },
];

const DEFAULT_CRYPTOS: Omit<Crypto, "id" | "createdAt">[] = [
  { symbol: "BTC", name: "Bitcoin",  holdings: 0, avgCost: 0, currentPrice: 95000, expectedReturn: 40, monthlyDca: 0 },
  { symbol: "ETH", name: "Ethereum", holdings: 0, avgCost: 0, currentPrice: 3200,  expectedReturn: 35, monthlyDca: 0 },
];

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  snapshot:   "sf_snapshot",
  expenses:   "sf_expenses",
  properties: "sf_properties",
  stocks:     "sf_stocks",
  crypto:     "sf_crypto",
  timeline:   "sf_timeline",
  settings:   "sf_settings",
  scenarios:  "sf_scenarios",
  seeded:     "sf_seeded_v2",  // v2 — forces re-seed if old camelCase data exists
};

// ─── Seed on first load ───────────────────────────────────────────────────────

function seed() {
  if (lsGet<boolean>(KEYS.seeded)) return;

  lsSet(KEYS.snapshot, DEFAULT_SNAPSHOT);
  lsSet(KEYS.expenses, []);
  lsSet(KEYS.properties, []);
  lsSet(KEYS.stocks, DEFAULT_STOCKS.map((s, i) => ({ ...s, id: i + 1, createdAt: new Date().toISOString() })));
  lsSet(KEYS.crypto, DEFAULT_CRYPTOS.map((c, i) => ({ ...c, id: i + 1, createdAt: new Date().toISOString() })));
  lsSet(KEYS.timeline, []);
  lsSet(KEYS.settings, {});
  lsSet(KEYS.scenarios, []);
  lsSet(KEYS.seeded, true);
}

seed();

// ─── Snapshot normaliser ──────────────────────────────────────────────────────
// Guards every numeric field so nothing coming out of localStorage can be NaN.

function normaliseSnapshot(raw: any): Snapshot {
  return {
    id:               safeNum(raw?.id) || 1,
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

// ─── Public data store ────────────────────────────────────────────────────────

export const localStore = {

  // ── Snapshot ───────────────────────────────────────────────────────────────

  getSnapshot(): Snapshot {
    const raw = lsGet<any>(KEYS.snapshot);
    // If nothing in localStorage yet, return the default
    if (!raw) return { ...DEFAULT_SNAPSHOT };
    // Normalise to ensure no NaN values survive
    return normaliseSnapshot(raw);
  },

  updateSnapshot(data: Partial<Snapshot>): Snapshot {
    const current = this.getSnapshot();
    // Normalise the incoming data before merging
    const sanitised: Partial<Snapshot> = {};
    for (const [k, v] of Object.entries(data)) {
      (sanitised as any)[k] = typeof v === "number" ? safeNum(v) : v;
    }
    const updated = normaliseSnapshot({ ...current, ...sanitised, updated_at: new Date().toISOString() });
    lsSet(KEYS.snapshot, updated);
    return updated;
  },

  // ── Expenses ───────────────────────────────────────────────────────────────

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
    return rows.map((r) => this.createExpense(r));
  },

  // ── Properties ─────────────────────────────────────────────────────────────

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

  // ── Stocks ─────────────────────────────────────────────────────────────────

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

  // ── Crypto ─────────────────────────────────────────────────────────────────

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

  // ── Timeline ───────────────────────────────────────────────────────────────

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

  // ── Settings ───────────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const settings = lsGet<Record<string, string>>(KEYS.settings) ?? {};
    return settings[key] ?? null;
  },
  setSetting(key: string, value: string): void {
    const settings = lsGet<Record<string, string>>(KEYS.settings) ?? {};
    lsSet(KEYS.settings, { ...settings, [key]: value });
  },

  // ── Scenarios ──────────────────────────────────────────────────────────────

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
