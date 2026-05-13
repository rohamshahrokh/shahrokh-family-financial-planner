/**
 * supabaseClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight Supabase REST client — NO npm package needed.
 * Uses the public anon key + Supabase REST API directly via fetch().
 * This runs purely in the browser (static Vercel deployment, no Express).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL  = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

const BASE = `${SUPABASE_URL}/rest/v1`;

const HEADERS = {
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

// ─── Generic REST helpers ─────────────────────────────────────────────────────

async function sbGet(table: string, query = ""): Promise<any[]> {
  const res = await fetch(`${BASE}/${table}${query ? "?" + query : ""}`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`Supabase GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * sbGetAll — fetches ALL rows from a table using Range-based pagination.
 * Supabase REST API caps responses at 1000 rows by default.
 * This function loops in batches of 1000 until no more rows are returned.
 * Use this for any large table (expenses, income, transactions).
 */
async function sbGetAll(table: string, orderQuery = "order=date.asc"): Promise<any[]> {
  const BATCH = 1000;
  let allRows: any[] = [];
  let offset = 0;
  while (true) {
    const rangeStart = offset;
    const rangeEnd   = offset + BATCH - 1;
    const res = await fetch(`${BASE}/${table}?${orderQuery}`, {
      headers: {
        ...HEADERS,
        "Range": `${rangeStart}-${rangeEnd}`,
        "Range-Unit": "items",
        "Prefer": "count=none",
      },
    });
    // 206 Partial Content or 200 OK are both valid
    if (!res.ok && res.status !== 206) {
      throw new Error(`Supabase paginated GET ${table} (offset ${offset}): ${res.status} ${await res.text()}`);
    }
    const batch: any[] = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allRows = allRows.concat(batch);
    if (batch.length < BATCH) break; // last page
    offset += BATCH;
  }
  return allRows;
}

async function sbUpsert(table: string, data: object): Promise<any> {
  const res = await fetch(`${BASE}/${table}`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table}: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbInsert(table: string, data: object): Promise<any> {
  const res = await fetch(`${BASE}/${table}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${table}: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbUpdate(table: string, id: number | string, data: object): Promise<any> {
  const col = typeof id === "number" ? `id=eq.${id}` : `id=eq.${id}`;
  const res = await fetch(`${BASE}/${table}?${col}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table}: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbDelete(table: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`Supabase DELETE ${table}: ${res.status} ${await res.text()}`);
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

const SNAPSHOT_ID = "shahrokh-family-main";

// All snapshot columns that exist in sf_snapshot (Supabase).
// Any key NOT in this set is stripped before upsert to prevent PGRST204 errors.
// Update this list whenever a new column is added via migration.
const SF_SNAPSHOT_COLS = new Set([
  "id", "updated_at", "version",
  // Assets
  "ppor", "cash", "super_balance", "stocks", "crypto", "cars", "iran_property",
  "other_assets", "mortgage", "other_debts",
  // Cash split
  "offset_balance", "savings_cash", "emergency_cash", "other_cash",
  // Income (master + sub-fields)
  "monthly_income", "roham_monthly_income", "fara_monthly_income",
  "rental_income_total", "other_income",
  // Expenses (master + sub-fields)
  "monthly_expenses", "childcare_monthly", "insurance_monthly",
  "utilities_monthly", "subscriptions_monthly",
  // Goals
  "fire_target_age", "fire_target_monthly_income", "property_savings_monthly",
  // Super — Roham
  "roham_super_balance", "roham_super_salary", "roham_employer_contrib",
  "roham_salary_sacrifice", "roham_super_personal_contrib", "roham_super_annual_topup",
  "roham_super_growth_rate", "roham_super_fee_pct", "roham_super_insurance_pa",
  "roham_super_option", "roham_super_provider", "roham_retirement_age", "roham_super_contrib_freq",
  // Super — Fara
  "fara_super_balance", "fara_super_salary", "fara_employer_contrib",
  "fara_salary_sacrifice", "fara_super_personal_contrib", "fara_super_annual_topup",
  "fara_super_growth_rate", "fara_super_fee_pct", "fara_super_insurance_pa",
  "fara_super_option", "fara_super_provider", "fara_retirement_age", "fara_super_contrib_freq",
]);

function toSFSnapshot(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SF_SNAPSHOT_COLS.has(k)) out[k] = v;
  }
  return out;
}

export const sbSnapshot = {
  async get(): Promise<any | null> {
    try {
      const rows = await sbGet("sf_snapshot", `id=eq.${SNAPSHOT_ID}`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    // Strip unknown columns BEFORE sending to Supabase to prevent PGRST204 errors.
    const safe = toSFSnapshot(data as Record<string, any>);
    // Drop any client-supplied 'version' — the DB trigger is the source of truth
    // for monotonic version. Allowing the client to set it would defeat the purpose.
    delete (safe as any).version;
    // updated_at is also auto-set by the trigger; we still send a hint for cases
    // where the trigger is disabled, but the trigger overwrites it if active.
    return await sbUpsert("sf_snapshot", { id: SNAPSHOT_ID, ...safe, updated_at: new Date().toISOString() });
  },
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const sbExpenses = {
  async getAll(): Promise<any[]> {
    try { return await sbGetAll("sf_expenses", "order=date.asc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_expenses", { ...data, created_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_expenses", id, data); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_expenses", id); } catch {}
  },
  async bulkCreate(rows: object[]): Promise<any[]> {
    const stamped = rows.map(r => ({ ...r, created_at: new Date().toISOString() }));
    const res = await fetch(`${BASE}/sf_expenses`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(stamped),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase bulk insert sf_expenses failed (${res.status}): ${errText}`);
    }
    return res.json();
  },
};

// ─── Properties ───────────────────────────────────────────────────────────────

export const sbProperties = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_properties", "order=created_at.asc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_properties", { ...data, created_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_properties", id, data); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_properties", id); } catch {}
  },
};

// ─── Stocks ───────────────────────────────────────────────────────────────────

export const sbStocks = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_stocks", "order=created_at.asc"); } catch { return []; }
  },
  // No silent catch — throw so localStore can surface the real error to the UI
  async create(data: object): Promise<any> {
    return await sbInsert("sf_stocks", { ...data, created_at: new Date().toISOString() });
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_stocks", id, data); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_stocks", id); } catch {}
  },
};

// ─── Crypto ───────────────────────────────────────────────────────────────────

export const sbCrypto = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_crypto", "order=created_at.asc"); } catch { return []; }
  },
  // No silent catch — throw so localStore can surface the real error to the UI
  async create(data: object): Promise<any> {
    return await sbInsert("sf_crypto", { ...data, created_at: new Date().toISOString() });
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_crypto", id, data); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_crypto", id); } catch {}
  },
};

// ─── Timeline ─────────────────────────────────────────────────────────────────

export const sbTimeline = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_timeline", "order=year.asc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_timeline", { ...data, created_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_timeline", id, data); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_timeline", id); } catch {}
  },
};

// ─── Scenarios ────────────────────────────────────────────────────────────────

export const sbScenarios = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_scenarios", "order=created_at.asc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_scenarios", { ...data, created_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_scenarios", id); } catch {}
  },
};

// ─── Stock Transactions ───────────────────────────────────────────────────────

export const sbStockTx = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_stock_transactions", "order=transaction_date.desc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try {
      return await sbInsert("sf_stock_transactions", {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_stock_transactions", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_stock_transactions", id); } catch {}
  },
};

// ─── Income ─────────────────────────────────────────────────────────────────

export const sbIncome = {
  async getAll(): Promise<any[]> {
    try { return await sbGetAll("sf_income", "order=date.asc"); } catch { return []; }
  },
  // No silent catch — throw so localStore can surface the real error to the UI
  async create(data: object): Promise<any> {
    return await sbInsert("sf_income", {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_income", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_income", id); } catch {}
  },
  async bulkCreate(rows: object[]): Promise<any[]> {
    const stamped = rows.map(r => ({
      ...r,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const res = await fetch(`${BASE}/sf_income`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(stamped),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase bulk insert sf_income failed (${res.status}): ${errText}`);
    }
    return res.json();
  },
};

// ─── Stock DCA ───────────────────────────────────────────────────────────────

export const sbStockDCA = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_stock_dca", "order=created_at.asc"); } catch { return []; }
  },
  // No silent catch — throw so useMutation onError fires with real message
  async create(data: object): Promise<any> {
    return await sbInsert("sf_stock_dca", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  },
  async update(id: number, data: object): Promise<any> {
    return await sbUpdate("sf_stock_dca", id, { ...data, updated_at: new Date().toISOString() });
  },
  async delete(id: number): Promise<void> {
    await sbDelete("sf_stock_dca", id);
  },
};

// ─── Crypto DCA ───────────────────────────────────────────────────────────────

export const sbCryptoDCA = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_crypto_dca", "order=created_at.asc"); } catch { return []; }
  },
  // No silent catch — throw so useMutation onError fires with real message
  async create(data: object): Promise<any> {
    return await sbInsert("sf_crypto_dca", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  },
  async update(id: number, data: object): Promise<any> {
    return await sbUpdate("sf_crypto_dca", id, { ...data, updated_at: new Date().toISOString() });
  },
  async delete(id: number): Promise<void> {
    await sbDelete("sf_crypto_dca", id);
  },
};

// ─── Planned Investments ──────────────────────────────────────────────────────
// One-time planned buy/sell orders for both stocks and crypto.
// Table: sf_planned_investments, filtered by module='stock'|'crypto'

export const sbPlannedInvestments = {
  async getAll(module?: string): Promise<any[]> {
    const query = module
      ? `module=eq.${module}&order=planned_date.asc`
      : `order=planned_date.asc`;
    try { return await sbGet("sf_planned_investments", query); } catch { return []; }
  },
  async create(data: object): Promise<any> {
    return await sbInsert("sf_planned_investments", {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
  async update(id: number, data: object): Promise<any> {
    return await sbUpdate("sf_planned_investments", id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  },
  async delete(id: number): Promise<void> {
    await sbDelete("sf_planned_investments", id);
  },
};

// ─── Crypto Transactions ──────────────────────────────────────────────────────


export const sbCryptoTx = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_crypto_transactions", "order=transaction_date.desc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try {
      return await sbInsert("sf_crypto_transactions", {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_crypto_transactions", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_crypto_transactions", id); } catch {}
  },
};

// ─── Recurring Bills ──────────────────────────────────────────────────────────

export const sbBills = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_recurring_bills", "order=next_due_date.asc"); } catch { return []; }
  },
  // No silent catch — throw so useMutation onError fires with real message
  async create(data: object): Promise<any> {
    return await sbInsert("sf_recurring_bills", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  },
  async update(id: number, data: object): Promise<any> {
    return await sbUpdate("sf_recurring_bills", id, { ...data, updated_at: new Date().toISOString() });
  },
  async delete(id: number): Promise<void> {
    await sbDelete("sf_recurring_bills", id);
  },
};

// ─── Monthly Budgets ──────────────────────────────────────────────────────────

export const sbBudgets = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_monthly_budgets", "order=year.desc,month.desc,category.asc"); } catch { return []; }
  },
  async getForMonth(year: number, month: number): Promise<any[]> {
    try { return await sbGet("sf_monthly_budgets", `year=eq.${year}&month=eq.${month}&order=category.asc`); } catch { return []; }
  },
  async create(data: object): Promise<any> {
    return await sbInsert("sf_monthly_budgets", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  },
  // upsert used for POST /api/budgets (new row from form)
  async upsert(data: object): Promise<any> {
    return await sbUpsert("sf_monthly_budgets", { ...data, updated_at: new Date().toISOString() });
  },
  async update(id: number, data: object): Promise<any> {
    return await sbUpdate("sf_monthly_budgets", id, { ...data, updated_at: new Date().toISOString() });
  },
  async delete(id: number): Promise<void> {
    await sbDelete("sf_monthly_budgets", id);
  },
  async bulkCreate(rows: object[]): Promise<any[]> {
    const stamped = rows.map(r => ({ ...r, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
    const res = await fetch(`${BASE}/sf_monthly_budgets`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(stamped),
    });
    if (!res.ok) throw new Error(`bulk upsert sf_monthly_budgets: ${res.status} ${await res.text()}`);
    return res.json();
  },
};

// ─── Telegram Settings ────────────────────────────────────────────────────────

export const sbTelegramSettings = {
  async get(): Promise<any | null> {
    // Silent catch on GET is fine — returns null if missing
    try {
      const rows = await sbGet("sf_telegram_settings", "id=eq.shahrokh-family-main");
      return rows[0] ?? null;
    } catch { return null; }
  },
  // NO silent catch on upsert — throw so useMutation onError fires with real message
  async upsert(data: object): Promise<any> {
    // Strip any client-only or unknown fields before sending to Supabase
    const {
      id: _id,           // never send id in body (it's in the URL filter via sbUpsert)
      created_at: _ca,  // managed by DB
      ...rest
    } = data as any;
    return await sbUpsert("sf_telegram_settings", {
      id: "shahrokh-family-main",
      ...rest,
      updated_at: new Date().toISOString(),
    });
  },
};

// ─── Alert Logs ───────────────────────────────────────────────────────────────

export const sbAlertLogs = {
  async getRecent(limit = 50): Promise<any[]> {
    try { return await sbGet("sf_alert_logs", `order=created_at.desc&limit=${limit}`); } catch { return []; }
  },
};

// ─── Family Messages Log ──────────────────────────────────────────────────────

export const sbFamilyMsgLog = {
  async getRecent(limit = 30): Promise<any[]> {
    try { return await sbGet("sf_family_messages_log", `order=sent_at.desc&limit=${limit}`); } catch { return []; }
  },
};

// ─── App Settings (singleton, id='default') ───────────────────────────────────
// Persists all app-level settings: planning assumptions, user prefs, wealth
// strategy assumptions — anything previously stored in localStorage only.

export const sbAppSettings = {
  /** Load the singleton settings row. Returns {} if no row yet. */
  async get(): Promise<Record<string, any>> {
    try {
      const rows = await sbGet("sf_app_settings", "id=eq.default");
      return (rows[0]?.settings as Record<string, any>) ?? {};
    } catch {
      return {};
    }
  },

  /**
   * Merge-upsert: loads existing settings, merges partialData on top, saves.
   * Throws on failure (no silent catch) so onError fires correctly.
   */
  async merge(partialData: Record<string, any>): Promise<Record<string, any>> {
    const existing = await this.get();
    const merged = { ...existing, ...partialData };
    await sbUpsert("sf_app_settings", {
      id: "default",
      settings: merged,
      updated_at: new Date().toISOString(),
    });
    return merged;
  },

  /** Save a single named key inside the settings JSONB. */
  async saveKey(key: string, value: any): Promise<void> {
    await this.merge({ [key]: value });
  },
};

// ─── User Management (sf_users table) ────────────────────────────────────────
// Custom auth: username + password stored in Supabase.
// Passwords stored with "plain:" prefix — app is private/family-only.
// Future: migrate to bcrypt hash if needed.

export const sbUsers = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_users", "order=id.asc"); } catch { return []; }
  },

  async getByUsername(username: string): Promise<any | null> {
    try {
      const rows = await sbGet("sf_users", `username=eq.${encodeURIComponent(username)}&active=eq.true`);
      return rows[0] ?? null;
    } catch { return null; }
  },

  async updatePassword(id: number, newPassword: string): Promise<void> {
    await sbUpdate("sf_users", id, {
      password_hash: `plain:${newPassword}`,
      updated_at: new Date().toISOString(),
    });
  },

  async updateUser(id: number, data: { display_name?: string; role?: string; active?: boolean; notes?: string }): Promise<any> {
    return await sbUpdate("sf_users", id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  },

  async createUser(data: { username: string; display_name: string; password: string; role: string }): Promise<any> {
    return await sbInsert("sf_users", {
      username: data.username,
      display_name: data.display_name,
      password_hash: `plain:${data.password}`,
      role: data.role,
      active: true,
      notes: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },

  /** Verify login: returns user record if valid, null if invalid */
  async verifyLogin(username: string, password: string): Promise<any | null> {
    const user = await this.getByUsername(username);
    if (!user) return null;
    // Support "plain:PASSWORD" format
    const stored = user.password_hash ?? '';
    const match = stored.startsWith('plain:')
      ? stored.slice(6) === password
      : stored === password;
    return match ? user : null;
  },
};

// ─── FIRE Settings ────────────────────────────────────────────────────────────
//
// LEGACY: `sf_fire_settings` does NOT exist in production. The live FIRE
// settings are stored in `mc_fire_settings` (single row keyed by id).
// This shim preserves the public API but reads/writes the real table so the
// dashboard stops 404-ing while we migrate the calling code to sbMCFireSettings.

const FIRE_SETTINGS_ID = "shahrokh-family-main";

export const sbFireSettings = {
  async get(): Promise<any | null> {
    try {
      const rows = await sbGet("mc_fire_settings", `id=eq.${FIRE_SETTINGS_ID}`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    try {
      return await sbUpsert("mc_fire_settings", {
        id: FIRE_SETTINGS_ID,
        ...data,
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
  },
};

// ─── FIRE Scenario Config ─────────────────────────────────────────────────────
//
// LEGACY: `sf_fire_scenario_config` does NOT exist in production. The live
// FIRE flow uses Monte Carlo presets (`mc_fire_presets`) instead. We do NOT
// silently redirect writes here because the schemas differ — quietly mutating
// presets could corrupt MC behavior. Reads return [], writes are no-ops.
// The dashboard's FIREPathCard already tolerates an empty array.

export const sbFireScenarioConfig = {
  async getAll(): Promise<any[]> {
    return [];
  },
  async upsert(_data: { scenario_id: string; [key: string]: any }): Promise<any | null> {
    return null;
  },
  async upsertAll(_rows: any[]): Promise<void> {
    /* no-op: legacy table removed */
  },
};

// ─── FIRE Year Assumptions ────────────────────────────────────────────────────
//
// LEGACY: `sf_fire_year_assumptions` does NOT exist in production. Year-by-year
// assumptions live in `sf_forecast_assumptions` (which already has
// `assumption_year` and `record_owner` columns). We redirect READS so the
// dashboard renders. WRITES are intentionally no-ops to avoid mutating live
// forecast data through a legacy code path — forecast saves should go through
// forecastStore.sbSaveAssumptions.

export const sbFireYearAssumptions = {
  async getAll(): Promise<any[]> {
    try {
      return await sbGet(
        "sf_forecast_assumptions",
        `record_owner=eq.${FIRE_SETTINGS_ID}&order=assumption_year.asc`,
      );
    } catch { return []; }
  },
  async upsert(_data: { assumption_year: number; [key: string]: any }): Promise<any | null> {
    return null;
  },
  async upsertAll(_rows: any[]): Promise<void> {
    /* no-op: writes must go through forecastStore.sbSaveAssumptions */
  },
};

// ─── MC FIRE Settings ─────────────────────────────────────────────────────────
// ADD THIS BLOCK at the END of supabaseClient.ts (after sbFireYearAssumptions)

const MC_FIRE_ID = "shahrokh-family-main";

export const sbMCFireSettings = {
  async get(): Promise<any | null> {
    try {
      const rows = await sbGet("mc_fire_settings", `id=eq.${MC_FIRE_ID}`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    try {
      return await sbUpsert("mc_fire_settings", {
        id: MC_FIRE_ID,
        ...data,
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
  },
};

export const sbMCFireResults = {
  async get(): Promise<any | null> {
    try {
      const rows = await sbGet("mc_fire_results", `id=eq.${MC_FIRE_ID}`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    try {
      return await sbUpsert("mc_fire_results", {
        id: MC_FIRE_ID,
        ...data,
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
  },
};

export const sbMCFirePresets = {
  async getAll(): Promise<any[]> {
    try {
      return await sbGet("mc_fire_presets", `record_owner=eq.${MC_FIRE_ID}&order=id.asc`);
    } catch { return []; }
  },
};



// ─── Tax Profile ──────────────────────────────────────────────────────────────
// Persists tax calculator inputs to sf_tax_profile

export const sbTaxProfile = {
  async get(): Promise<any | null> {
    try {
      const rows = await sbGet('sf_tax_profile', 'owner_id=eq.shahrokh-family-main&limit=1');
      return rows[0] ?? null;
    } catch { return null; }
  },

  async upsert(data: any): Promise<any> {
    const payload = { ...data, owner_id: 'shahrokh-family-main' };
    const res = await fetch(`${BASE}/sf_tax_profile`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`sbTaxProfile.upsert failed: ${err}`);
    }
    const rows = await res.json();
    return rows[0];
  },
};

// ─── Household Permissions ────────────────────────────────────────────────────

const HOUSEHOLD_PERM_ID = "shahrokh-family-main";

export interface HouseholdPermissionSettings {
  id: string;
  partner_view_bulletin: boolean;
  partner_run_bulletin: boolean;
  partner_view_ai_insights: boolean;
  partner_receive_telegram: boolean;
  partner_edit_financial_plan: boolean;
  partner_edit_expenses: boolean;
  partner_edit_bills: boolean;
  telegram_roham_enabled: boolean;
  telegram_fara_enabled: boolean;
  updated_at?: string;
}

// ─── Scenario Engine V2 — Persistence ────────────────────────────────────────
//
// Two tables created via migration `v2_scenario_persistence`:
//   sf_v2_scenarios          — saved scenarios + last-run results
//   sf_v2_assumptions_preset — named assumption presets (+ last-used flag)
//
// Both are owner_id keyed for future multi-user. Anonymous Supabase access via
// app-level password gate; RLS policies are permissive but enabled.

const V2_OWNER = "shahrokh-family-main";

export interface V2ScenarioRow {
  id?: string;
  owner_id?: string;
  name: string;
  description?: string | null;
  status?: "draft" | "saved" | "archived";
  assumptions: Record<string, any>;
  deltas: any[];
  horizon_months: number;
  simulation_count: number;
  start_month: string;
  seed?: number | null;
  snapshot_hash?: string | null;
  assumptions_hash?: string | null;
  last_result?: Record<string, any> | null;
  last_run_at?: string | null;
  last_run_ms?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface V2AssumptionsPresetRow {
  id?: string;
  owner_id?: string;
  name: string;
  is_default?: boolean;
  payload: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export const sbV2Scenarios = {
  async getAll(): Promise<V2ScenarioRow[]> {
    try { return await sbGet("sf_v2_scenarios", `owner_id=eq.${V2_OWNER}&order=updated_at.desc`); } catch { return []; }
  },
  async getById(id: string): Promise<V2ScenarioRow | null> {
    try {
      const rows = await sbGet("sf_v2_scenarios", `id=eq.${id}&owner_id=eq.${V2_OWNER}`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async create(data: V2ScenarioRow): Promise<V2ScenarioRow> {
    return await sbInsert("sf_v2_scenarios", {
      ...data,
      owner_id: V2_OWNER,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
  async update(id: string, data: Partial<V2ScenarioRow>): Promise<V2ScenarioRow> {
    const res = await fetch(`${BASE}/sf_v2_scenarios?id=eq.${id}&owner_id=eq.${V2_OWNER}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Supabase PATCH sf_v2_scenarios: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async delete(id: string): Promise<void> {
    const res = await fetch(`${BASE}/sf_v2_scenarios?id=eq.${id}&owner_id=eq.${V2_OWNER}`, {
      method: "DELETE",
      headers: HEADERS,
    });
    if (!res.ok) throw new Error(`Supabase DELETE sf_v2_scenarios: ${res.status} ${await res.text()}`);
  },
};

export const sbV2AssumptionsPreset = {
  async getAll(): Promise<V2AssumptionsPresetRow[]> {
    try { return await sbGet("sf_v2_assumptions_preset", `owner_id=eq.${V2_OWNER}&order=updated_at.desc`); } catch { return []; }
  },
  async getDefault(): Promise<V2AssumptionsPresetRow | null> {
    try {
      const rows = await sbGet("sf_v2_assumptions_preset", `owner_id=eq.${V2_OWNER}&is_default=eq.true&limit=1`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async create(data: V2AssumptionsPresetRow): Promise<V2AssumptionsPresetRow> {
    return await sbInsert("sf_v2_assumptions_preset", {
      ...data,
      owner_id: V2_OWNER,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  },
  async update(id: string, data: Partial<V2AssumptionsPresetRow>): Promise<V2AssumptionsPresetRow> {
    const res = await fetch(`${BASE}/sf_v2_assumptions_preset?id=eq.${id}&owner_id=eq.${V2_OWNER}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Supabase PATCH sf_v2_assumptions_preset: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async setDefault(id: string): Promise<void> {
    // Clear all defaults first
    await fetch(`${BASE}/sf_v2_assumptions_preset?owner_id=eq.${V2_OWNER}&is_default=eq.true`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ is_default: false, updated_at: new Date().toISOString() }),
    });
    await this.update(id, { is_default: true });
  },
  async delete(id: string): Promise<void> {
    const res = await fetch(`${BASE}/sf_v2_assumptions_preset?id=eq.${id}&owner_id=eq.${V2_OWNER}`, {
      method: "DELETE",
      headers: HEADERS,
    });
    if (!res.ok) throw new Error(`Supabase DELETE sf_v2_assumptions_preset: ${res.status} ${await res.text()}`);
  },
};

// ─── Household Permissions ────────────────────────────────────────────────────

export const sbHouseholdPermissions = {
  async get(): Promise<HouseholdPermissionSettings | null> {
    try {
      const rows = await sbGet("sf_household_permissions", `id=eq.${HOUSEHOLD_PERM_ID}`);
      return rows[0] ?? null;
    } catch { return null; }
  },

  async upsert(data: Partial<Omit<HouseholdPermissionSettings, 'id'>>): Promise<HouseholdPermissionSettings | null> {
    try {
      return await sbUpsert("sf_household_permissions", {
        id: HOUSEHOLD_PERM_ID,
        ...data,
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
  },
};
