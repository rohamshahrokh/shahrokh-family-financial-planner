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
    try { return await sbGet("sf_expenses", "order=date.desc"); } catch { return []; }
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
    try {
      const stamped = rows.map(r => ({ ...r, created_at: new Date().toISOString() }));
      const res = await fetch(`${BASE}/sf_expenses`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(stamped),
      });
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
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
