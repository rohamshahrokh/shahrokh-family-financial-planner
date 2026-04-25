import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  financialSnapshot, expenseEntries, expenseCategories,
  properties, stocks, cryptoAssets, incomeSources,
  scenarios, settings, timelineEvents,
  type Expense, type InsertExpense,
  type Property, type InsertProperty,
  type Stock, type InsertStock,
  type Crypto, type InsertCrypto,
  type TimelineEvent, type InsertTimelineEvent,
} from "../shared/schema";

const sqlite = new Database("data.db");
export const db = drizzle(sqlite);

// Migrations
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS financial_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ppor REAL DEFAULT 1510000,
    cash REAL DEFAULT 220000,
    super_balance REAL DEFAULT 85000,
    stocks REAL DEFAULT 0,
    crypto REAL DEFAULT 0,
    cars REAL DEFAULT 65000,
    iran_property REAL DEFAULT 150000,
    mortgage REAL DEFAULT 1200000,
    other_debts REAL DEFAULT 19000,
    monthly_income REAL DEFAULT 22000,
    monthly_expenses REAL DEFAULT 14540,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#C4A55A',
    icon TEXT DEFAULT 'circle'
  );

  CREATE TABLE IF NOT EXISTS expense_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT DEFAULT '',
    description TEXT DEFAULT '',
    payment_method TEXT DEFAULT '',
    family_member TEXT DEFAULT '',
    recurring INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'investment',
    purchase_price REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    purchase_date TEXT DEFAULT '',
    loan_amount REAL DEFAULT 0,
    interest_rate REAL DEFAULT 6.0,
    loan_type TEXT DEFAULT 'PI',
    loan_term INTEGER DEFAULT 30,
    weekly_rent REAL DEFAULT 0,
    rental_growth REAL DEFAULT 3.0,
    vacancy_rate REAL DEFAULT 2.0,
    management_fee REAL DEFAULT 8.0,
    council_rates REAL DEFAULT 2000,
    insurance REAL DEFAULT 2000,
    maintenance REAL DEFAULT 2000,
    capital_growth REAL DEFAULT 6.0,
    deposit REAL DEFAULT 0,
    stamp_duty REAL DEFAULT 0,
    legal_fees REAL DEFAULT 2000,
    selling_costs REAL DEFAULT 2.5,
    projection_years INTEGER DEFAULT 10,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    name TEXT DEFAULT '',
    current_price REAL DEFAULT 0,
    current_holding REAL DEFAULT 0,
    allocation_pct REAL DEFAULT 0,
    expected_return REAL DEFAULT 10,
    start_date TEXT DEFAULT '',
    monthly_dca REAL DEFAULT 0,
    dca_start_date TEXT DEFAULT '',
    dca_end_date TEXT DEFAULT '',
    annual_lump_sum REAL DEFAULT 0,
    lump_sum_date TEXT DEFAULT '',
    projection_years INTEGER DEFAULT 10,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crypto_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    current_price REAL DEFAULT 0,
    current_holding REAL DEFAULT 0,
    allocation_pct REAL DEFAULT 0,
    expected_return REAL DEFAULT 20,
    start_date TEXT DEFAULT '',
    monthly_dca REAL DEFAULT 0,
    dca_start TEXT DEFAULT '',
    dca_end TEXT DEFAULT '',
    lump_sum_amount REAL DEFAULT 0,
    lump_sum_date TEXT DEFAULT '',
    projection_years INTEGER DEFAULT 10,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS income_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    family_member TEXT DEFAULT '',
    amount REAL NOT NULL,
    frequency TEXT DEFAULT 'monthly',
    type TEXT DEFAULT 'salary',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'general',
    data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    event_date TEXT NOT NULL,
    type TEXT DEFAULT 'general',
    amount REAL DEFAULT 0,
    impact TEXT DEFAULT 'positive',
    category TEXT DEFAULT 'other',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default snapshot if empty
const snapshotCount = sqlite.prepare("SELECT COUNT(*) as c FROM financial_snapshot").get() as { c: number };
if (snapshotCount.c === 0) {
  sqlite.prepare(`INSERT INTO financial_snapshot (ppor, cash, super_balance, stocks, crypto, cars, iran_property, mortgage, other_debts, monthly_income, monthly_expenses) VALUES (1510000, 220000, 85000, 0, 0, 65000, 150000, 1200000, 19000, 22000, 14540)`).run();
}

// Seed default stocks
const stockCount = sqlite.prepare("SELECT COUNT(*) as c FROM stocks").get() as { c: number };
if (stockCount.c === 0) {
  const defaultStocks = [
    { ticker: 'NVDA', name: 'NVIDIA Corporation', expected_return: 20, current_price: 950 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', expected_return: 15, current_price: 175 },
    { ticker: 'MSFT', name: 'Microsoft Corporation', expected_return: 14, current_price: 415 },
    { ticker: 'AVGO', name: 'Broadcom Inc.', expected_return: 16, current_price: 185 },
    { ticker: 'CEG', name: 'Constellation Energy', expected_return: 18, current_price: 240 },
    { ticker: 'STCK.TO', name: 'Stockpile ETF', expected_return: 12, current_price: 45 },
    { ticker: 'ANET', name: 'Arista Networks', expected_return: 17, current_price: 335 },
    { ticker: 'TSLA', name: 'Tesla Inc.', expected_return: 15, current_price: 285 },
    { ticker: 'OKLO', name: 'Oklo Inc.', expected_return: 25, current_price: 35 },
  ];
  for (const s of defaultStocks) {
    sqlite.prepare(`INSERT INTO stocks (ticker, name, expected_return, current_price, projection_years) VALUES (?, ?, ?, ?, 10)`).run(s.ticker, s.name, s.expected_return, s.current_price);
  }
}

// Seed default crypto
const cryptoCount = sqlite.prepare("SELECT COUNT(*) as c FROM crypto_assets").get() as { c: number };
if (cryptoCount.c === 0) {
  sqlite.prepare(`INSERT INTO crypto_assets (name, symbol, current_price, expected_return, projection_years) VALUES ('Bitcoin', 'BTC', 95000, 30, 10)`).run();
  sqlite.prepare(`INSERT INTO crypto_assets (name, symbol, current_price, expected_return, projection_years) VALUES ('Ethereum', 'ETH', 3200, 35, 10)`).run();
}

export interface IStorage {
  // Snapshot
  getSnapshot(): any;
  updateSnapshot(data: any): any;

  // Expenses
  getExpenses(): Expense[];
  createExpense(data: InsertExpense): Expense;
  updateExpense(id: number, data: Partial<InsertExpense>): Expense | undefined;
  deleteExpense(id: number): void;

  // Properties
  getProperties(): Property[];
  createProperty(data: InsertProperty): Property;
  updateProperty(id: number, data: Partial<InsertProperty>): Property | undefined;
  deleteProperty(id: number): void;

  // Stocks
  getStocks(): Stock[];
  createStock(data: InsertStock): Stock;
  updateStock(id: number, data: Partial<InsertStock>): Stock | undefined;
  deleteStock(id: number): void;

  // Crypto
  getCryptos(): Crypto[];
  createCrypto(data: InsertCrypto): Crypto;
  updateCrypto(id: number, data: Partial<InsertCrypto>): Crypto | undefined;
  deleteCrypto(id: number): void;

  // Timeline
  getTimelineEvents(): TimelineEvent[];
  createTimelineEvent(data: InsertTimelineEvent): TimelineEvent;
  updateTimelineEvent(id: number, data: Partial<InsertTimelineEvent>): TimelineEvent | undefined;
  deleteTimelineEvent(id: number): void;

  // Settings
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;

  // Scenarios
  getScenarios(): any[];
  createScenario(data: any): any;
  deleteScenario(id: number): void;
}

export class Storage implements IStorage {
  // ─── Snapshot ──────────────────────────────────────────────────────
  getSnapshot() {
    return sqlite.prepare("SELECT * FROM financial_snapshot ORDER BY id DESC LIMIT 1").get();
  }
  updateSnapshot(data: any) {
    const existing = this.getSnapshot() as any;
    if (existing) {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(data), existing.id];
      sqlite.prepare(`UPDATE financial_snapshot SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values);
    } else {
      sqlite.prepare(`INSERT INTO financial_snapshot (ppor, cash, super_balance, stocks, crypto, cars, iran_property, mortgage, other_debts, monthly_income, monthly_expenses) VALUES (1510000, 220000, 85000, 0, 0, 65000, 150000, 1200000, 19000, 22000, 14540)`).run();
    }
    return this.getSnapshot();
  }

  // ─── Expenses ──────────────────────────────────────────────────────
  getExpenses(): Expense[] {
    return sqlite.prepare("SELECT * FROM expense_entries ORDER BY date DESC").all() as Expense[];
  }
  createExpense(data: InsertExpense): Expense {
    const result = sqlite.prepare(
      `INSERT INTO expense_entries (date, amount, category, subcategory, description, payment_method, family_member, recurring, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(data.date, data.amount, data.category, data.subcategory || '', data.description || '', data.payment_method || '', data.family_member || '', data.recurring ? 1 : 0, data.notes || '');
    return sqlite.prepare("SELECT * FROM expense_entries WHERE id = ?").get(result.lastInsertRowid) as Expense;
  }
  updateExpense(id: number, data: Partial<InsertExpense>): Expense | undefined {
    if (Object.keys(data).length === 0) return undefined;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), id];
    sqlite.prepare(`UPDATE expense_entries SET ${fields} WHERE id = ?`).run(...values);
    return sqlite.prepare("SELECT * FROM expense_entries WHERE id = ?").get(id) as Expense;
  }
  deleteExpense(id: number): void {
    sqlite.prepare("DELETE FROM expense_entries WHERE id = ?").run(id);
  }

  // ─── Properties ────────────────────────────────────────────────────
  getProperties(): Property[] {
    return sqlite.prepare("SELECT * FROM properties ORDER BY created_at ASC").all() as Property[];
  }
  createProperty(data: InsertProperty): Property {
    const cols = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const result = sqlite.prepare(`INSERT INTO properties (${cols}) VALUES (${placeholders})`).run(...Object.values(data));
    return sqlite.prepare("SELECT * FROM properties WHERE id = ?").get(result.lastInsertRowid) as Property;
  }
  updateProperty(id: number, data: Partial<InsertProperty>): Property | undefined {
    if (Object.keys(data).length === 0) return undefined;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    sqlite.prepare(`UPDATE properties SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return sqlite.prepare("SELECT * FROM properties WHERE id = ?").get(id) as Property;
  }
  deleteProperty(id: number): void {
    sqlite.prepare("DELETE FROM properties WHERE id = ?").run(id);
  }

  // ─── Stocks ────────────────────────────────────────────────────────
  getStocks(): Stock[] {
    return sqlite.prepare("SELECT * FROM stocks ORDER BY created_at ASC").all() as Stock[];
  }
  createStock(data: InsertStock): Stock {
    const cols = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const result = sqlite.prepare(`INSERT INTO stocks (${cols}) VALUES (${placeholders})`).run(...Object.values(data));
    return sqlite.prepare("SELECT * FROM stocks WHERE id = ?").get(result.lastInsertRowid) as Stock;
  }
  updateStock(id: number, data: Partial<InsertStock>): Stock | undefined {
    if (Object.keys(data).length === 0) return undefined;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    sqlite.prepare(`UPDATE stocks SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return sqlite.prepare("SELECT * FROM stocks WHERE id = ?").get(id) as Stock;
  }
  deleteStock(id: number): void {
    sqlite.prepare("DELETE FROM stocks WHERE id = ?").run(id);
  }

  // ─── Crypto ────────────────────────────────────────────────────────
  getCryptos(): Crypto[] {
    return sqlite.prepare("SELECT * FROM crypto_assets ORDER BY created_at ASC").all() as Crypto[];
  }
  createCrypto(data: InsertCrypto): Crypto {
    const cols = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const result = sqlite.prepare(`INSERT INTO crypto_assets (${cols}) VALUES (${placeholders})`).run(...Object.values(data));
    return sqlite.prepare("SELECT * FROM crypto_assets WHERE id = ?").get(result.lastInsertRowid) as Crypto;
  }
  updateCrypto(id: number, data: Partial<InsertCrypto>): Crypto | undefined {
    if (Object.keys(data).length === 0) return undefined;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    sqlite.prepare(`UPDATE crypto_assets SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return sqlite.prepare("SELECT * FROM crypto_assets WHERE id = ?").get(id) as Crypto;
  }
  deleteCrypto(id: number): void {
    sqlite.prepare("DELETE FROM crypto_assets WHERE id = ?").run(id);
  }

  // ─── Timeline ──────────────────────────────────────────────────────
  getTimelineEvents(): TimelineEvent[] {
    return sqlite.prepare("SELECT * FROM timeline_events ORDER BY event_date ASC").all() as TimelineEvent[];
  }
  createTimelineEvent(data: InsertTimelineEvent): TimelineEvent {
    const result = sqlite.prepare(
      `INSERT INTO timeline_events (title, description, event_date, type, amount, impact, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(data.title, data.description || '', data.event_date, data.type || 'general', data.amount || 0, data.impact || 'positive', data.category || 'other');
    return sqlite.prepare("SELECT * FROM timeline_events WHERE id = ?").get(result.lastInsertRowid) as TimelineEvent;
  }
  updateTimelineEvent(id: number, data: Partial<InsertTimelineEvent>): TimelineEvent | undefined {
    if (Object.keys(data).length === 0) return undefined;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    sqlite.prepare(`UPDATE timeline_events SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return sqlite.prepare("SELECT * FROM timeline_events WHERE id = ?").get(id) as TimelineEvent;
  }
  deleteTimelineEvent(id: number): void {
    sqlite.prepare("DELETE FROM timeline_events WHERE id = ?").run(id);
  }

  // ─── Settings ──────────────────────────────────────────────────────
  getSetting(key: string): string | null {
    const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }
  setSetting(key: string, value: string): void {
    sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, value);
  }

  // ─── Scenarios ─────────────────────────────────────────────────────
  getScenarios(): any[] {
    return sqlite.prepare("SELECT * FROM scenarios ORDER BY created_at DESC").all();
  }
  createScenario(data: any): any {
    const result = sqlite.prepare(
      `INSERT INTO scenarios (name, description, type, data) VALUES (?, ?, ?, ?)`
    ).run(data.name, data.description || '', data.type || 'general', JSON.stringify(data.data || {}));
    return sqlite.prepare("SELECT * FROM scenarios WHERE id = ?").get(result.lastInsertRowid);
  }
  deleteScenario(id: number): void {
    sqlite.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
  }
}

export const storage = new Storage();
