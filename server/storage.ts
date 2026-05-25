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

// ─── Property lifecycle migration ─────────────────────────────────────────
// Enum: 'planned' | 'under_contract' | 'settled'.
//
// Default policy:
//   • New rows default to 'planned'. A property only becomes 'settled' when
//     the user explicitly selects Settled and saves (matches the product
//     spec). The default is enforced at the application layer in
//     createProperty() because SQLite's ALTER TABLE ADD COLUMN applies the
//     declared DEFAULT to every existing row, which would retroactively
//     stamp legacy rows the wrong way.
//   • Legacy rows that existed BEFORE this migration ran are backfilled
//     to 'settled' EXACTLY ONCE, because the existing forecast / debt /
//     rental / expense pipeline aggregates every row in `properties` as
//     if it were active. The backfill only touches NULL/empty values, so
//     it never overwrites an explicit user choice and never re-runs.
let lifecycleColumnJustCreated = false;
try {
  // No DEFAULT clause — existing rows get NULL so the backfill can
  // distinguish them from rows the user inserts after this migration.
  sqlite.prepare(`ALTER TABLE properties ADD COLUMN lifecycle_status TEXT`).run();
  lifecycleColumnJustCreated = true;
  console.log(`[storage] ✔ Added column: properties.lifecycle_status`);
} catch {
  // Column already exists — ignore
}
// One-shot legacy-row backfill. Only runs when the column was just created
// (or in the defensive case where an older client added it without a
// default and left rows as NULL/empty). After this point every existing
// row carries an explicit value, so the UPDATE becomes a no-op on
// subsequent boots.
if (lifecycleColumnJustCreated) {
  try {
    sqlite.prepare(`UPDATE properties SET lifecycle_status = 'settled' WHERE lifecycle_status IS NULL OR lifecycle_status = ''`).run();
  } catch { /* ignore */ }
}

// ─── Schema migrations — add missing columns (try/catch per column; SQLite doesn't support ADD COLUMN IF NOT EXISTS)
const _missingCols: Array<[string, string]> = [
  ["offset_balance",              "REAL DEFAULT 0"],
  ["roham_monthly_income",        "REAL DEFAULT 0"],
  ["fara_monthly_income",         "REAL DEFAULT 0"],
  ["rental_income_total",         "REAL DEFAULT 0"],
  ["other_income",                "REAL DEFAULT 0"],
  ["childcare_monthly",           "REAL DEFAULT 0"],
  ["insurance_monthly",           "REAL DEFAULT 0"],
  ["utilities_monthly",           "REAL DEFAULT 0"],
  ["subscriptions_monthly",       "REAL DEFAULT 0"],
  ["fire_target_age",             "REAL DEFAULT 55"],
  ["fire_target_monthly_income",  "REAL DEFAULT 20000"],
  ["property_savings_monthly",    "REAL DEFAULT 0"],
  ["roham_super_balance",         "REAL DEFAULT 0"],
  ["fara_super_balance",          "REAL DEFAULT 0"],
  // Cash breakdown sub-fields (split of snap.cash into named buckets)
  ["savings_cash",               "REAL DEFAULT 0"],
  ["emergency_cash",             "REAL DEFAULT 0"],
  ["other_cash",                 "REAL DEFAULT 0"],
];
for (const [col, def] of _missingCols) {
  try {
    sqlite.prepare(`ALTER TABLE financial_snapshot ADD COLUMN ${col} ${def}`).run();
    console.log(`[storage] ✔ Added column: financial_snapshot.${col}`);
  } catch {
    // Column already exists — safe to ignore
  }
}

// ─── Sprint 6 Phase 3 — Scenario Persistence tables ─────────────────────────
// Additive only. Existing `scenarios` table is untouched. These three tables
// back the Scenario Builder workspace (records, immutable version history,
// snapshots of engine output at save time).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sf_scenario_records (
    record_id        TEXT PRIMARY KEY,
    scenario_id      TEXT NOT NULL,
    label            TEXT NOT NULL,
    description      TEXT DEFAULT '',
    seed_scenario_id TEXT,
    is_seed          INTEGER DEFAULT 0,
    is_baseline      INTEGER DEFAULT 0,
    tags             TEXT DEFAULT '[]',
    notes            TEXT DEFAULT '',
    current_version  INTEGER DEFAULT 0,
    archived_at      TEXT,
    archived_reason  TEXT,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS sf_scenario_records_scenario_id_idx ON sf_scenario_records (scenario_id);
  CREATE INDEX IF NOT EXISTS sf_scenario_records_archived_idx ON sf_scenario_records (archived_at);

  CREATE TABLE IF NOT EXISTS sf_scenario_record_versions (
    version_id         TEXT PRIMARY KEY,
    scenario_record_id TEXT NOT NULL,
    version_number     INTEGER NOT NULL,
    payload            TEXT NOT NULL,
    comment            TEXT,
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scenario_record_id, version_number),
    FOREIGN KEY (scenario_record_id) REFERENCES sf_scenario_records(record_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS sf_scenario_record_versions_record_idx ON sf_scenario_record_versions (scenario_record_id);

  CREATE TABLE IF NOT EXISTS sf_scenario_snapshots (
    snapshot_id        TEXT PRIMARY KEY,
    scenario_record_id TEXT NOT NULL,
    version_number     INTEGER,
    label              TEXT NOT NULL,
    comment            TEXT,
    payload            TEXT NOT NULL,
    metrics            TEXT NOT NULL,
    assumptions        TEXT DEFAULT '[]',
    engine_limited     INTEGER DEFAULT 0,
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scenario_record_id) REFERENCES sf_scenario_records(record_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS sf_scenario_snapshots_record_idx ON sf_scenario_snapshots (scenario_record_id);
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
  settleProperty(id: number, overrides?: Partial<InsertProperty>): Property | undefined;

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
    // Default lifecycle_status to 'planned' for newly created rows. The
    // SQLite column has no DEFAULT clause (see migration above), so we
    // enforce the default here instead of at the schema level. This keeps
    // legacy rows — which were backfilled to 'settled' by the migration
    // — untouched, while every new property starts as Planned per the
    // product spec.
    const payload: Record<string, any> = { ...data };
    if (payload.lifecycle_status === undefined || payload.lifecycle_status === null || payload.lifecycle_status === '') {
      payload.lifecycle_status = 'planned';
    }
    const cols = Object.keys(payload).join(', ');
    const placeholders = Object.keys(payload).map(() => '?').join(', ');
    const result = sqlite.prepare(`INSERT INTO properties (${cols}) VALUES (${placeholders})`).run(...Object.values(payload));
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

  /**
   * Settle a planned property — convert it into an active settled record.
   *
   * Behaviour (minimal, no new forecasting engine):
   *   • Marks lifecycle_status = 'settled' on the row.
   *   • Applies any caller overrides (purchase_date, loan_amount, weekly_rent,
   *     current_value, etc.) so the same row carries the active values used
   *     by the existing forecast / debt / rental pipeline.
   *   • De-dupes by `name`: if another settled row already exists with the
   *     same name, we update THAT row instead of leaving two siblings, and
   *     delete the planned source row.
   *
   * The active forecast engine, debt totals, rental income and property
   * expenses already aggregate every row from /api/properties — so setting
   * lifecycle_status = 'settled' is enough to flow the property through the
   * existing pipeline (no new engine, no new tables).
   */
  settleProperty(id: number, overrides: Partial<InsertProperty> = {}): Property | undefined {
    const row = sqlite.prepare("SELECT * FROM properties WHERE id = ?").get(id) as any;
    if (!row) return undefined;
    const merged: Record<string, any> = { ...row, ...overrides, lifecycle_status: 'settled' };
    // Strip id / created_at so we never try to update PK columns
    delete merged.id;
    delete merged.created_at;

    // De-dupe: look for an existing settled row with same name (case-insensitive),
    // excluding the source row itself.
    const dupe = sqlite.prepare(
      `SELECT * FROM properties
        WHERE id != ?
          AND lifecycle_status = 'settled'
          AND lower(coalesce(name,'')) = lower(?)`
    ).get(id, String(merged.name ?? '')) as any | undefined;

    if (dupe) {
      // Update the existing active record with the merged values, then drop
      // the planned source row. This guarantees no duplicate active assets.
      const updFields = Object.keys(merged).map(k => `${k} = ?`).join(', ');
      sqlite.prepare(`UPDATE properties SET ${updFields} WHERE id = ?`).run(...Object.values(merged), dupe.id);
      sqlite.prepare("DELETE FROM properties WHERE id = ?").run(id);
      return sqlite.prepare("SELECT * FROM properties WHERE id = ?").get(dupe.id) as Property;
    }

    // No dupe — promote the planned row in-place to 'settled' with overrides.
    const updFields = Object.keys(merged).map(k => `${k} = ?`).join(', ');
    sqlite.prepare(`UPDATE properties SET ${updFields} WHERE id = ?`).run(...Object.values(merged), id);
    return sqlite.prepare("SELECT * FROM properties WHERE id = ?").get(id) as Property;
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

  // ─── Sprint 6 Phase 3 — Scenario Records / Versions / Snapshots ─────
  // All payloads are stored as JSON-encoded TEXT. The server treats them
  // as opaque blobs; validation lives in the client (scenarioPersistence.ts).

  listScenarioRecords(includeArchived = false): any[] {
    const rows = (includeArchived
      ? sqlite.prepare(`SELECT * FROM sf_scenario_records ORDER BY updated_at DESC`).all()
      : sqlite.prepare(`SELECT * FROM sf_scenario_records WHERE archived_at IS NULL ORDER BY updated_at DESC`).all()
    ) as any[];
    return rows.map(r => this._inflateScenarioRecord(r));
  }

  getScenarioRecord(recordId: string): any | null {
    const row = sqlite.prepare(`SELECT * FROM sf_scenario_records WHERE record_id = ?`).get(recordId) as any | undefined;
    if (!row) return null;
    return this._inflateScenarioRecord(row);
  }

  upsertScenarioRecord(record: any): any {
    if (!record || typeof record.recordId !== "string") {
      throw new Error("upsertScenarioRecord requires recordId");
    }
    const now = new Date().toISOString();
    const existing = sqlite.prepare(`SELECT record_id FROM sf_scenario_records WHERE record_id = ?`).get(record.recordId);
    const tagsJson = JSON.stringify(Array.isArray(record.tags) ? record.tags : []);
    if (existing) {
      sqlite.prepare(`
        UPDATE sf_scenario_records SET
          scenario_id = ?, label = ?, description = ?, seed_scenario_id = ?,
          is_seed = ?, is_baseline = ?, tags = ?, notes = ?,
          current_version = ?, archived_at = ?, archived_reason = ?,
          updated_at = ?
        WHERE record_id = ?
      `).run(
        record.scenarioId,
        record.label,
        record.description ?? "",
        record.seedScenarioId ?? null,
        record.isSeed ? 1 : 0,
        record.isBaseline ? 1 : 0,
        tagsJson,
        record.notes ?? "",
        record.currentVersion ?? 0,
        record.archivedAt ?? null,
        record.archivedReason ?? null,
        now,
        record.recordId,
      );
    } else {
      sqlite.prepare(`
        INSERT INTO sf_scenario_records (
          record_id, scenario_id, label, description, seed_scenario_id,
          is_seed, is_baseline, tags, notes, current_version,
          archived_at, archived_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.recordId,
        record.scenarioId,
        record.label,
        record.description ?? "",
        record.seedScenarioId ?? null,
        record.isSeed ? 1 : 0,
        record.isBaseline ? 1 : 0,
        tagsJson,
        record.notes ?? "",
        record.currentVersion ?? 0,
        record.archivedAt ?? null,
        record.archivedReason ?? null,
        record.createdAt ?? now,
        record.updatedAt ?? now,
      );
    }

    // Versions — only insert ones we haven't seen.
    if (Array.isArray(record.versions)) {
      const haveVersion = sqlite.prepare(`SELECT 1 FROM sf_scenario_record_versions WHERE version_id = ?`);
      const insertVersion = sqlite.prepare(`
        INSERT INTO sf_scenario_record_versions
          (version_id, scenario_record_id, version_number, payload, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const v of record.versions) {
        if (!v || !v.versionId) continue;
        if (haveVersion.get(v.versionId)) continue;
        insertVersion.run(
          v.versionId,
          record.recordId,
          v.versionNumber,
          JSON.stringify(v.payload ?? {}),
          v.comment ?? null,
          v.createdAt ?? now,
        );
      }
    }

    // Snapshots — only insert new ones.
    if (Array.isArray(record.snapshots)) {
      const haveSnap = sqlite.prepare(`SELECT 1 FROM sf_scenario_snapshots WHERE snapshot_id = ?`);
      const insertSnap = sqlite.prepare(`
        INSERT INTO sf_scenario_snapshots
          (snapshot_id, scenario_record_id, version_number, label, comment, payload, metrics, assumptions, engine_limited, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const snap of record.snapshots) {
        if (!snap || !snap.snapshotId) continue;
        if (haveSnap.get(snap.snapshotId)) continue;
        insertSnap.run(
          snap.snapshotId,
          record.recordId,
          snap.versionNumber ?? null,
          snap.label ?? "Snapshot",
          snap.comment ?? null,
          JSON.stringify(snap.payload ?? {}),
          JSON.stringify(snap.metrics ?? []),
          JSON.stringify(snap.assumptions ?? []),
          snap.engineLimited ? 1 : 0,
          snap.createdAt ?? now,
        );
      }
    }

    return this.getScenarioRecord(record.recordId);
  }

  archiveScenarioRecord(recordId: string, reason: string | null = null): any | null {
    const now = new Date().toISOString();
    sqlite.prepare(`
      UPDATE sf_scenario_records SET archived_at = ?, archived_reason = ?, updated_at = ?
      WHERE record_id = ?
    `).run(now, reason, now, recordId);
    return this.getScenarioRecord(recordId);
  }

  restoreScenarioRecord(recordId: string): any | null {
    const now = new Date().toISOString();
    sqlite.prepare(`
      UPDATE sf_scenario_records SET archived_at = NULL, archived_reason = NULL, updated_at = ?
      WHERE record_id = ?
    `).run(now, recordId);
    return this.getScenarioRecord(recordId);
  }

  private _inflateScenarioRecord(row: any): any {
    const versions = (sqlite.prepare(`
      SELECT * FROM sf_scenario_record_versions
      WHERE scenario_record_id = ?
      ORDER BY version_number ASC
    `).all(row.record_id) as any[]).map(v => ({
      versionId: v.version_id,
      scenarioRecordId: v.scenario_record_id,
      versionNumber: v.version_number,
      payload: safeParseJSON(v.payload, {}),
      comment: v.comment ?? null,
      createdAt: v.created_at,
    }));
    const snapshots = (sqlite.prepare(`
      SELECT * FROM sf_scenario_snapshots
      WHERE scenario_record_id = ?
      ORDER BY created_at ASC
    `).all(row.record_id) as any[]).map(s => ({
      snapshotId: s.snapshot_id,
      scenarioRecordId: s.scenario_record_id,
      versionNumber: s.version_number ?? null,
      label: s.label,
      comment: s.comment ?? null,
      createdAt: s.created_at,
      payload: safeParseJSON(s.payload, {}),
      metrics: safeParseJSON(s.metrics, []),
      assumptions: safeParseJSON(s.assumptions, []),
      engineLimited: !!s.engine_limited,
    }));
    return {
      recordId: row.record_id,
      scenarioId: row.scenario_id,
      label: row.label,
      description: row.description ?? "",
      seedScenarioId: row.seed_scenario_id ?? null,
      isSeed: !!row.is_seed,
      isBaseline: !!row.is_baseline,
      tags: safeParseJSON(row.tags, []),
      notes: row.notes ?? "",
      currentVersion: row.current_version ?? 0,
      versions,
      snapshots,
      archivedAt: row.archived_at ?? null,
      archivedReason: row.archived_reason ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function safeParseJSON<T>(value: any, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export const storage = new Storage();
