import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  
  // ─── Financial Snapshot ────────────────────────────────────────────
  app.get("/api/snapshot", (req, res) => {
    const data = storage.getSnapshot();
    res.json(data || {});
  });
  
  app.put("/api/snapshot", (req, res) => {
    const data = storage.updateSnapshot(req.body);
    res.json(data);
  });

  // POST alias for snapshot — same as PUT (upsert)
  app.post("/api/snapshot", (req, res) => {
    const data = storage.updateSnapshot(req.body);
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
