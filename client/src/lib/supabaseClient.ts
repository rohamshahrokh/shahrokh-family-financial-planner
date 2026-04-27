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

export const sbSnapshot = {
  async get(): Promise<any | null> {
    try {
      const rows = await sbGet("sf_snapshot", `id=eq.${SNAPSHOT_ID}`);
      return rows[0] ?? null;
    } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    try {
      return await sbUpsert("sf_snapshot", { id: SNAPSHOT_ID, ...data, updated_at: new Date().toISOString() });
    } catch { return null; }
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
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_stocks", { ...data, created_at: new Date().toISOString() }); } catch { return null; }
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
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_crypto", { ...data, created_at: new Date().toISOString() }); } catch { return null; }
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
  async create(data: object): Promise<any | null> {
    try {
      return await sbInsert("sf_income", {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch { return null; }
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
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_stock_dca", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_stock_dca", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_stock_dca", id); } catch {}
  },
};

// ─── Crypto DCA ───────────────────────────────────────────────────────────────

export const sbCryptoDCA = {
  async getAll(): Promise<any[]> {
    try { return await sbGet("sf_crypto_dca", "order=created_at.asc"); } catch { return []; }
  },
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_crypto_dca", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_crypto_dca", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_crypto_dca", id); } catch {}
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
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_recurring_bills", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_recurring_bills", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_recurring_bills", id); } catch {}
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
  async create(data: object): Promise<any | null> {
    try { return await sbInsert("sf_monthly_budgets", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    try { return await sbUpsert("sf_monthly_budgets", { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async update(id: number, data: object): Promise<any | null> {
    try { return await sbUpdate("sf_monthly_budgets", id, { ...data, updated_at: new Date().toISOString() }); } catch { return null; }
  },
  async delete(id: number): Promise<void> {
    try { await sbDelete("sf_monthly_budgets", id); } catch {}
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
    try {
      const rows = await sbGet("sf_telegram_settings", "id=eq.shahrokh-family-main");
      return rows[0] ?? null;
    } catch { return null; }
  },
  async upsert(data: object): Promise<any | null> {
    try { return await sbUpsert("sf_telegram_settings", { id: "shahrokh-family-main", ...data, updated_at: new Date().toISOString() }); } catch { return null; }
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
