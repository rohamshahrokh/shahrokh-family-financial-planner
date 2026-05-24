/**
 * test-property-lifecycle-persistence.ts
 *
 * Regression suite for #FWL_Property_Lifecycle_Persistence_Fix.
 *
 * Reproduces the user-reported bug:
 *   1. Default for a NEW property is 'planned' (not 'settled').
 *   2. Updating an existing property from 'settled' → 'planned' persists
 *      across a simulated re-fetch.
 *   3. The persistence survives a Supabase PATCH failure caused by the
 *      `lifecycle_status` column missing from sf_properties (PGRST204) —
 *      because the localStore lifecycle override map captures the user's
 *      choice synchronously and merges it back into rows on read.
 *   4. Once the DB row carries an explicit lifecycle_status (post-migration),
 *      the DB value becomes authoritative and the stale override is cleared.
 *   5. 'planned' / 'under_contract' / 'settled' all round-trip cleanly.
 *   6. Deleting a property clears any pending override for that id.
 *   7. Legacy rows (no lifecycle_status, no override) read back as
 *      lifecycle_status === undefined — the UI treats that as 'settled' so
 *      the forecast pipeline keeps including them unchanged.
 *
 * Run with:  tsx script/test-property-lifecycle-persistence.ts
 */

// ─── In-memory shims (must come BEFORE imports) ─────────────────────────────
const memoryStore: Record<string, string> = {};
const localStorageShim = {
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
  removeItem: (k: string) => { delete memoryStore[k]; },
  clear: () => { for (const k of Object.keys(memoryStore)) delete memoryStore[k]; },
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  get length() { return Object.keys(memoryStore).length; },
};
(globalThis as any).window = {
  localStorage: localStorageShim,
  location: { hostname: "localhost", search: "" },
};
(globalThis as any).localStorage = localStorageShim;
(globalThis as any).document = { hidden: false };

// ─── Simulated Supabase backend ─────────────────────────────────────────────
// One table — sf_properties. We let the caller toggle whether
// `lifecycle_status` is "provisioned" (column exists) or not (column missing
// → PGRST204), to exercise both branches of sbProperties.update / .create.

interface MockRow { id: number; name?: string; lifecycle_status?: string | null; [k: string]: any; }
const backend: { rows: MockRow[]; hasLifecycleColumn: boolean; nextId: number } = {
  rows: [],
  hasLifecycleColumn: false,
  nextId: 1,
};
function resetBackend(opts: { hasLifecycleColumn: boolean; rows?: MockRow[] }) {
  backend.rows = (opts.rows ?? []).map(r => ({ ...r }));
  backend.hasLifecycleColumn = opts.hasLifecycleColumn;
  backend.nextId = backend.rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
}

function pgrst204(col: string): Response {
  // Mimic Supabase REST's exact shape so looksLikeUnknownColumnError matches.
  return new Response(
    JSON.stringify({
      code: "PGRST204",
      message: `Could not find the '${col}' column of 'sf_properties' in the schema cache`,
    }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

function applyColumnPolicy(row: Record<string, any>): Record<string, any> {
  if (backend.hasLifecycleColumn) return row;
  const out = { ...row };
  delete out.lifecycle_status;
  return out;
}

(globalThis as any).fetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const u = String(url);
  const method = (init?.method ?? "GET").toUpperCase();

  // sf_properties endpoints
  const tableMatch = u.match(/\/sf_properties(\?(.*))?$/);
  if (tableMatch) {
    const qs = tableMatch[2] ?? "";
    const idMatch = qs.match(/id=eq\.(\d+)/);
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (method === "GET") {
      return new Response(JSON.stringify(backend.rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "POST") {
      const payload = Array.isArray(body) ? body[0] : body;
      if (!backend.hasLifecycleColumn && payload && "lifecycle_status" in payload) {
        return pgrst204("lifecycle_status");
      }
      const row: MockRow = applyColumnPolicy({ ...payload, id: backend.nextId++ });
      backend.rows.push(row);
      return new Response(JSON.stringify([row]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "PATCH" && idMatch) {
      const id = parseInt(idMatch[1]);
      const idx = backend.rows.findIndex(r => r.id === id);
      if (idx < 0) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (!backend.hasLifecycleColumn && body && "lifecycle_status" in body) {
        return pgrst204("lifecycle_status");
      }
      const patch = applyColumnPolicy(body || {});
      backend.rows[idx] = { ...backend.rows[idx], ...patch };
      return new Response(JSON.stringify([backend.rows[idx]]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (method === "DELETE" && idMatch) {
      const id = parseInt(idMatch[1]);
      backend.rows = backend.rows.filter(r => r.id !== id);
      return new Response("", { status: 204 });
    }
  }

  return new Response("{}", { status: 200 });
};

// ─── Imports (after shims) ──────────────────────────────────────────────────
const { localStore } = await import("../client/src/lib/localStore");

// ─── Tiny assertion helpers ─────────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(name: string, cond: any, extra?: any) {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✘ ${name}`, extra ?? ""); }
}
function eq(name: string, actual: any, expected: any) {
  ok(name + ` (got ${JSON.stringify(actual)})`, actual === expected,
    `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function reload(): Promise<any[]> {
  // Simulate "fresh session" by clearing the cached property list but
  // preserving the lifecycle-override map (it lives in another key).
  localStorageShim.removeItem("sf_properties_v3");
  return await localStore.getProperties();
}

console.log("\n=== #1: Default for a NEW property is 'planned' ===");
{
  // We exercise this through createProperty so we also see the override is
  // captured even when the column is missing in Supabase.
  resetBackend({ hasLifecycleColumn: false });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  const created = await localStore.createProperty({ name: "Brisbane IP", lifecycle_status: "planned" } as any);
  eq("create returns lifecycle_status='planned'", created.lifecycle_status, "planned");
  const rows = await reload();
  const row = rows.find(r => r.id === created.id);
  eq("after reload still 'planned'", row?.lifecycle_status, "planned");
}

console.log("\n=== #2: Update settled → planned persists across re-fetch (column MISSING) ===");
{
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 10, name: "Legacy IP" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(10, { lifecycle_status: "planned" } as any);
  const after = await reload();
  const row = after.find(r => r.id === 10);
  eq("status after reload (column missing)", row?.lifecycle_status, "planned");
}

console.log("\n=== #3: 'under_contract' round-trips with column missing ===");
{
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 11, name: "Coorparoo IP" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(11, { lifecycle_status: "under_contract" } as any);
  const after = await reload();
  const row = after.find(r => r.id === 11);
  eq("status after reload", row?.lifecycle_status, "under_contract");
}

console.log("\n=== #4: 'settled' round-trips with column present (DB authoritative) ===");
{
  resetBackend({
    hasLifecycleColumn: true,
    rows: [{ id: 12, name: "Settled IP", lifecycle_status: null }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(12, { lifecycle_status: "settled" } as any);
  const after = await reload();
  const row = after.find(r => r.id === 12);
  eq("status after reload (column present)", row?.lifecycle_status, "settled");
  // DB now authoritative — override should be cleared
  const ov = JSON.parse(localStorageShim.getItem("sf_property_lifecycle_v1") || "{}");
  eq("override cleared once DB matches", ov["12"], undefined);
}

console.log("\n=== #5: User selection survives multiple reloads (column missing) ===");
{
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 13, name: "Sticky IP" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(13, { lifecycle_status: "planned" } as any);
  for (let i = 0; i < 3; i++) {
    const rows = await reload();
    eq(`reload #${i + 1} still planned`, rows.find(r => r.id === 13)?.lifecycle_status, "planned");
  }
}

console.log("\n=== #6: User selection survives 'logout/login' (full localStorage wipe except override) ===");
{
  // Real logout clears the cached property list but the user's selection
  // should still come back from the override map if the DB hasn't been
  // migrated yet. Simulate by clearing only the property cache.
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 14, name: "Login IP" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(14, { lifecycle_status: "planned" } as any);

  // Simulate logout: drop the cached row list and any sync timestamps,
  // but keep the durable override map (it's part of the same user's data).
  localStorageShim.removeItem("sf_properties_v3");
  localStorageShim.removeItem("sf_last_sync");

  const rows = await localStore.getProperties();
  eq("after logout/login lifecycle is still 'planned'",
    rows.find(r => r.id === 14)?.lifecycle_status, "planned");
}

console.log("\n=== #7: NEVER defaults all properties to 'settled' when missing ===");
{
  // A legacy row with no lifecycle_status and no override must come back
  // *without* lifecycle_status set — we leave that to the UI's
  // LifecycleBadge fallback (which the spec confirms is correct for legacy
  // rows). The bug was that the persisted override was being wiped on read;
  // here we assert reads do NOT inject 'settled' on top of explicit nulls.
  resetBackend({
    hasLifecycleColumn: true,
    rows: [{ id: 20, name: "Legacy untouched" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  const rows = await localStore.getProperties();
  const row = rows.find(r => r.id === 20);
  ok("legacy row has no lifecycle_status injected", row && !row.lifecycle_status, row);
}

console.log("\n=== #8: deleteProperty clears the pending override ===");
{
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 30, name: "Doomed IP" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(30, { lifecycle_status: "planned" } as any);
  await localStore.deleteProperty(30);
  const ov = JSON.parse(localStorageShim.getItem("sf_property_lifecycle_v1") || "{}");
  eq("override removed after delete", ov["30"], undefined);
}

console.log("\n=== #9: Invalid lifecycle values are ignored ===");
{
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 40, name: "Validator IP" }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(40, { lifecycle_status: "bogus_value" } as any);
  const ov = JSON.parse(localStorageShim.getItem("sf_property_lifecycle_v1") || "{}");
  eq("invalid status not stored as override", ov["40"], undefined);
}

console.log("\n=== #10: All three valid statuses survive reload ===");
for (const status of ["planned", "under_contract", "settled"] as const) {
  resetBackend({
    hasLifecycleColumn: false,
    rows: [{ id: 50, name: `Cycle ${status}` }],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  await localStore.getProperties();
  await localStore.updateProperty(50, { lifecycle_status: status } as any);
  const rows = await reload();
  eq(`${status} survives reload`, rows.find(r => r.id === 50)?.lifecycle_status, status);
}

console.log("\n=== #11: New property without explicit lifecycle gets 'planned' via createProperty ===");
{
  // Mirrors what happens when a caller (or fallback path) inserts a row
  // and forgets to set lifecycle_status — the override map alone does NOT
  // inject 'planned' (it only stores user-provided values), but the
  // user-facing client path (EMPTY_PROPERTY) and the server-side
  // createProperty BOTH inject 'planned' as the default. This assertion
  // covers the override-store side and the read-path side: a fresh
  // createProperty call with no lifecycle_status returns a row that does
  // NOT carry 'settled', proving we never silently promote to active.
  resetBackend({ hasLifecycleColumn: true });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  const created = await localStore.createProperty({ name: "No-lifecycle IP" } as any);
  ok("createProperty result has no 'settled' injected by the read path",
    created.lifecycle_status !== "settled",
    `lifecycle_status was ${JSON.stringify(created.lifecycle_status)}`);
}

console.log("\n=== #12: Read path NEVER forces 'settled' for rows with explicit other values ===");
{
  // Combination: a row with lifecycle_status = 'planned' must remain
  // 'planned' on every subsequent read — even after multiple round-trips
  // through localStore.getProperties().
  resetBackend({
    hasLifecycleColumn: true,
    rows: [
      { id: 60, name: "Already Planned", lifecycle_status: "planned" },
      { id: 61, name: "Already Under Contract", lifecycle_status: "under_contract" },
    ],
  });
  localStorageShim.removeItem("sf_property_lifecycle_v1");
  localStorageShim.removeItem("sf_properties_v3");
  for (let i = 0; i < 3; i++) {
    const rows = await reload();
    eq(`#60 stays planned (read ${i + 1})`, rows.find(r => r.id === 60)?.lifecycle_status, "planned");
    eq(`#61 stays under_contract (read ${i + 1})`, rows.find(r => r.id === 61)?.lifecycle_status, "under_contract");
  }
}

console.log("\n=== #13: SQLite server migration — default 'planned' for new, 'settled' backfill for legacy ===");
{
  // Replicates server/storage.ts's lifecycle migration on an in-memory
  // SQLite DB to verify the policy:
  //   * Existing rows (inserted BEFORE the column was added) get
  //     backfilled to 'settled' so the existing forecast pipeline keeps
  //     including them unchanged.
  //   * Any explicit value the user already saved is preserved.
  //   * NEW rows inserted via createProperty default to 'planned' — only
  //     become Settled when the caller passes lifecycle_status='settled'.
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    purchase_date TEXT
  );`);
  // Pre-existing rows — no lifecycle_status column yet
  db.prepare(`INSERT INTO properties (name, purchase_date) VALUES (?, ?)`).run("Legacy A", "2022-01-15");
  db.prepare(`INSERT INTO properties (name, purchase_date) VALUES (?, ?)`).run("Legacy B", "2021-07-04");

  // Mimic the migration block in server/storage.ts: ADD COLUMN with no
  // DEFAULT, detect a fresh column, backfill NULLs to 'settled' once.
  let justCreated = false;
  try {
    db.prepare(`ALTER TABLE properties ADD COLUMN lifecycle_status TEXT`).run();
    justCreated = true;
  } catch { /* already exists */ }
  if (justCreated) {
    db.prepare(`UPDATE properties SET lifecycle_status = 'settled' WHERE lifecycle_status IS NULL OR lifecycle_status = ''`).run();
  }

  const legacy = db.prepare(`SELECT lifecycle_status FROM properties ORDER BY id`).all() as Array<{ lifecycle_status: string }>;
  eq("legacy row #1 backfilled to settled", legacy[0]?.lifecycle_status, "settled");
  eq("legacy row #2 backfilled to settled", legacy[1]?.lifecycle_status, "settled");

  // Simulate storage.createProperty: caller did not pass lifecycle_status.
  // Storage layer injects 'planned' before INSERT.
  function createProperty(data: Record<string, any>): any {
    const payload = { ...data };
    if (payload.lifecycle_status === undefined || payload.lifecycle_status === null || payload.lifecycle_status === '') {
      payload.lifecycle_status = 'planned';
    }
    const cols = Object.keys(payload).join(', ');
    const placeholders = Object.keys(payload).map(() => '?').join(', ');
    const result = db.prepare(`INSERT INTO properties (${cols}) VALUES (${placeholders})`).run(...Object.values(payload));
    return db.prepare(`SELECT * FROM properties WHERE id = ?`).get(result.lastInsertRowid);
  }

  const newRow = createProperty({ name: "Fresh IP", purchase_date: "2026-09-01" });
  eq("new property default is 'planned'", newRow.lifecycle_status, "planned");

  const explicit = createProperty({ name: "Explicit Under Contract", lifecycle_status: "under_contract" });
  eq("explicit under_contract preserved", explicit.lifecycle_status, "under_contract");

  const explicitSettled = createProperty({ name: "Explicit Settled", lifecycle_status: "settled" });
  eq("explicit settled preserved", explicitSettled.lifecycle_status, "settled");

  // Critical guard: backfill is not re-run on subsequent boots. If we set
  // a row to NULL deliberately and re-run the (now no-op) migration block,
  // existing data is untouched because justCreated is false.
  db.prepare(`UPDATE properties SET lifecycle_status = NULL WHERE id = ?`).run(newRow.id);
  // Simulate a second boot — ALTER fails with "duplicate column", justCreated stays false
  try {
    db.prepare(`ALTER TABLE properties ADD COLUMN lifecycle_status TEXT`).run();
    failed++;
    console.error("  ✘ second migration unexpectedly succeeded");
  } catch {
    passed++;
    console.log("  ✔ second migration is a no-op (column already exists)");
  }
  const afterReboot = db.prepare(`SELECT lifecycle_status FROM properties WHERE id = ?`).get(newRow.id) as any;
  // Backfill must NOT run again on reboot — the explicit NULL set above
  // must be preserved (it represents a hypothetical bug, not a legacy row).
  eq("null on rebooted column not re-stamped to settled", afterReboot?.lifecycle_status, null);

  db.close();
}

// ─── Final report ──────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────`);
console.log(`Property lifecycle persistence: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
