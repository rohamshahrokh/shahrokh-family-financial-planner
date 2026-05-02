import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";

// ─── Supabase helpers (server-side) ────────────────────────────────────────────
// These mirror the client-side supabaseClient.ts so the server can also read/write
// the sf_snapshot table directly — enabling cold-start hydration and dual writes.
const SUPABASE_URL = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";
const SNAPSHOT_ID  = "shahrokh-family-main";
const SB_HEADERS   = {
  "apikey":        SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type":  "application/json",
};

async function sbGetSnapshot(): Promise<Record<string, any> | null> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/sf_snapshot?id=eq.${SNAPSHOT_ID}&limit=1`;
    const res  = await fetch(url, { headers: SB_HEADERS });
    if (!res.ok) return null;
    const rows = (await res.json()) as any[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

async function sbUpsertSnapshot(data: Record<string, any>): Promise<void> {
  try {
    const body = JSON.stringify({
      id: SNAPSHOT_ID,
      ...data,
      updated_at: new Date().toISOString(),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/sf_snapshot`, {
      method:  "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body,
    });
  } catch (err) {
    console.warn("[server] Supabase snapshot upsert failed:", err);
  }
}

// ─── Cold-start hydration ──────────────────────────────────────────────────────
// On every server start, pull the real Supabase snapshot into SQLite.
// This means after any redeploy / restart, user data is immediately restored
// instead of falling back to hardcoded seed defaults.
sbGetSnapshot()
  .then(row => {
    if (row) {
      storage.updateSnapshot(row);
      console.log("[server] ✔ SQLite hydrated from Supabase snapshot");
    } else {
      console.warn("[server] Supabase snapshot not found — using seed defaults");
    }
  })
  .catch(err => console.warn("[server] Cold-start hydration error:", err));

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─── Financial Snapshot ────────────────────────────────────────────────────
  // Architecture: Supabase (sf_snapshot) is the source of truth.
  //   GET  → serve from SQLite (pre-hydrated from Supabase on startup)
  //   PUT  → write to SQLite (instant reactive) + Supabase (permanent)
  //   POST → alias of PUT (upsert)

  app.get("/api/snapshot", (req, res) => {
    const data = storage.getSnapshot();
    res.json(data || {});
  });

  app.put("/api/snapshot", (req, res) => {
    // 1. Write to SQLite — makes all useQuery(["/api/snapshot"]) hooks react instantly
    const data = storage.updateSnapshot(req.body);
    // 2. Write to Supabase — permanent, survives restart (fire-and-forget, don't block response)
    sbUpsertSnapshot(req.body).catch(() => {});
    res.json(data);
  });

  // POST alias for snapshot — same as PUT
  app.post("/api/snapshot", (req, res) => {
    const data = storage.updateSnapshot(req.body);
    sbUpsertSnapshot(req.body).catch(() => {});
    res.json(data);
  });

  // ─── Expenses ──────────────────────────────────────────────────────
  app.get("/api/expenses", (req, res) => {
    res.json(storage.getExpenses());
  });

  app.post("/api/expenses", (req, res) => {
    const expense = storage.createExpense(req.body);
    res.json(expense);
  });

  app.put("/api/expenses/:id", (req, res) => {
    const expense = storage.updateExpense(parseInt(req.params.id), req.body);
    res.json(expense);
  });

  app.delete("/api/expenses/:id", (req, res) => {
    storage.deleteExpense(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Bulk import expenses
  app.post("/api/expenses/bulk", (req, res) => {
    const { expenses } = req.body;
    const created = [];
    for (const e of expenses) {
      try {
        created.push(storage.createExpense(e));
      } catch (err) { /* skip invalid */ }
    }
    res.json({ created: created.length, expenses: created });
  });

  // ─── Properties ────────────────────────────────────────────────────
  app.get("/api/properties", (req, res) => {
    res.json(storage.getProperties());
  });

  app.post("/api/properties", (req, res) => {
    const prop = storage.createProperty(req.body);
    res.json(prop);
  });

  app.put("/api/properties/:id", (req, res) => {
    const prop = storage.updateProperty(parseInt(req.params.id), req.body);
    res.json(prop);
  });

  app.delete("/api/properties/:id", (req, res) => {
    storage.deleteProperty(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ─── Stocks ────────────────────────────────────────────────────────
  app.get("/api/stocks", (req, res) => {
    res.json(storage.getStocks());
  });

  app.post("/api/stocks", (req, res) => {
    const stock = storage.createStock(req.body);
    res.json(stock);
  });

  app.put("/api/stocks/:id", (req, res) => {
    const stock = storage.updateStock(parseInt(req.params.id), req.body);
    res.json(stock);
  });

  app.delete("/api/stocks/:id", (req, res) => {
    storage.deleteStock(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ─── Crypto ────────────────────────────────────────────────────────
  app.get("/api/crypto", (req, res) => {
    res.json(storage.getCryptos());
  });

  app.post("/api/crypto", (req, res) => {
    const crypto = storage.createCrypto(req.body);
    res.json(crypto);
  });

  app.put("/api/crypto/:id", (req, res) => {
    const crypto = storage.updateCrypto(parseInt(req.params.id), req.body);
    res.json(crypto);
  });

  app.delete("/api/crypto/:id", (req, res) => {
    storage.deleteCrypto(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ─── Timeline Events ───────────────────────────────────────────────
  app.get("/api/timeline", (req, res) => {
    res.json(storage.getTimelineEvents());
  });

  app.post("/api/timeline", (req, res) => {
    const event = storage.createTimelineEvent(req.body);
    res.json(event);
  });

  app.put("/api/timeline/:id", (req, res) => {
    const event = storage.updateTimelineEvent(parseInt(req.params.id), req.body);
    res.json(event);
  });

  app.delete("/api/timeline/:id", (req, res) => {
    storage.deleteTimelineEvent(parseInt(req.params.id));
    res.json({ success: true });
  });

  // ─── Settings ──────────────────────────────────────────────────────
  app.get("/api/settings/:key", (req, res) => {
    const value = storage.getSetting(req.params.key);
    res.json({ key: req.params.key, value });
  });

  app.put("/api/settings/:key", (req, res) => {
    storage.setSetting(req.params.key, req.body.value);
    res.json({ success: true });
  });

  // ─── Scenarios ─────────────────────────────────────────────────────
  app.get("/api/scenarios", (req, res) => {
    res.json(storage.getScenarios());
  });

  app.post("/api/scenarios", (req, res) => {
    const scenario = storage.createScenario(req.body);
    res.json(scenario);
  });

  app.delete("/api/scenarios/:id", (req, res) => {
    storage.deleteScenario(parseInt(req.params.id));
    res.json({ success: true });
  });

  return httpServer;
}
