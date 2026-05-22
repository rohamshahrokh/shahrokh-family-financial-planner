/**
 * userDefaultsApi.ts — Server-backed persistence for User Defaults.
 *
 * #FWL_Persistent_UserDefaults_ScenarioOverride (server tier)
 *
 * Why this file exists
 * --------------------
 * `persistentUserDefaults.ts` is a Zustand store with `localStorage`
 * persistence. localStorage is per-browser and per-domain. That is enough
 * for "same-browser reload" but NOT for the user's actual requirement:
 *
 *   • Choices must survive on a new browser / preview / production deploy.
 *   • The platform should behave like a real financial planner, not a
 *     temporary calculator.
 *
 * This module is the durable tier:
 *   1. On app boot, hydrate the local store from the server payload.
 *   2. After every save, push the local payload to the server.
 *   3. Track which keys are currently server-backed vs local-only so the
 *      audit trace can label them accurately.
 *
 * Storage path
 * ------------
 * Uses the existing `/api/settings/:key` route. In local dev that hits the
 * Express `storage.setSetting` (SQLite). In Vercel/static deploy, the
 * queryClient intercepts that path and routes to Supabase
 * `sf_app_settings.settings[...]` via `sbAppSettings.saveKey()`. No new
 * tables, no schema changes.
 *
 * Backend key
 * -----------
 * A single key (`SETTINGS_KEY = "fwl.userDefaults.v1"`) holds the entire
 * blob. That matches the existing localStorage layout exactly, so the
 * server payload IS the localStorage payload — they round-trip without
 * remapping.
 */

import {
  useUserDefaultsStore,
  USER_DEFAULTS_LS_KEY,
  type UserDefaultsState,
  type UserDefaultsKey,
} from "./persistentUserDefaults";
import { setActiveRegime } from "./activeRegimeStore";
import { usePropertyFundingStore } from "./propertyFundingStore";

/**
 * Lazy import for `apiRequest`. Importing `queryClient` eagerly pulls in
 * `window.location` reads at module-load time which crashes existing
 * Node-based regression tests that don't shim `window.location`. Loading
 * it on first use isolates the side-effect to the (server-only) path.
 */
async function getApiRequest() {
  const mod = await import("./queryClient");
  return mod.apiRequest;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Backend settings key. Reuses the same name as the localStorage key so a
 * developer can see at a glance that the two stores carry identical
 * payloads. Bumping the version (v1 → v2) is the migration path if the
 * shape ever changes.
 */
export const SETTINGS_KEY = USER_DEFAULTS_LS_KEY;

// ─── Server sync state (read by audit traces) ────────────────────────────────

/**
 * Tracks whether the local store has been successfully synced to the
 * server in the current session. Audit traces read this to label values
 * "server-backed" vs "local fallback".
 */
export interface ServerSyncState {
  /** True once an initial GET succeeded (even with an empty body). */
  hydrated: boolean;
  /** True if the most recent PUT succeeded. */
  lastWriteOk: boolean;
  /** ISO timestamp of the most recent successful GET. */
  lastReadAt?: string;
  /** ISO timestamp of the most recent successful PUT. */
  lastWriteAt?: string;
  /** Error message from the most recent failed attempt, if any. */
  lastError?: string;
  /**
   * Set of keys whose latest value was last persisted to the server (i.e.
   * confirmed in the last successful PUT). When the user makes an offline
   * change, the key moves to `pendingKeys` until the next successful PUT.
   */
  serverBackedKeys: Set<UserDefaultsKey>;
  /** Keys with unsynced local edits. */
  pendingKeys: Set<UserDefaultsKey>;
}

const _state: ServerSyncState = {
  hydrated: false,
  lastWriteOk: false,
  serverBackedKeys: new Set(),
  pendingKeys: new Set(),
};

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => { try { fn(); } catch {} }); }

/** Read a snapshot of the sync state. */
export function getServerSyncState(): Readonly<ServerSyncState> {
  return _state;
}

/** Subscribe to changes — used by audit traces and the Settings card. */
export function subscribeServerSync(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/** Returns true if the key's current value matches what we last pushed/loaded from the server. */
export function isKeyServerBacked(key: UserDefaultsKey): boolean {
  return _state.serverBackedKeys.has(key);
}

// ─── Hydration (app boot) ────────────────────────────────────────────────────

/**
 * Fetch the persisted user-defaults blob from the server and merge it into
 * the local store. Runs on app boot. If the server has a value, that
 * value WINS over any stale localStorage cache (the server is the
 * source-of-truth across browsers/deploys).
 *
 * Failure modes:
 *   • Network error or non-2xx response → log, fall back to whatever the
 *     local store already has (existing localStorage rehydration).
 *   • Empty/missing key → no-op. Local store remains as-is. First save
 *     will push it to the server.
 *
 * Returns the merged state so callers can use it for trace logging.
 */
export async function hydrateUserDefaultsFromServer(): Promise<{
  ok: boolean;
  source: "server" | "local" | "empty";
  hydratedKeys: UserDefaultsKey[];
  error?: string;
}> {
  try {
    const apiRequest = await getApiRequest();
    const res = await apiRequest("GET", `/api/settings/${encodeURIComponent(SETTINGS_KEY)}`);
    const payload = await res.json();
    const rawValue = payload?.value;

    // No row yet — server is empty; keep local store intact.
    if (rawValue == null || rawValue === "" || rawValue === "{}") {
      _state.hydrated = true;
      _state.lastReadAt = new Date().toISOString();
      notify();
      return { ok: true, source: "empty", hydratedKeys: [] };
    }

    // Server value may be either the raw object (when it came from the
    // Supabase JSONB blob) or a JSON string (when it came from the SQLite
    // settings table). Handle both.
    let parsed: any;
    if (typeof rawValue === "string") {
      try { parsed = JSON.parse(rawValue); } catch { parsed = null; }
    } else if (typeof rawValue === "object") {
      parsed = rawValue;
    }

    if (!parsed || typeof parsed !== "object") {
      _state.hydrated = true;
      _state.lastReadAt = new Date().toISOString();
      _state.lastError = "Server payload was not valid JSON";
      notify();
      return { ok: false, source: "local", hydratedKeys: [], error: _state.lastError };
    }

    // Apply server state. Server wins over local. We rebuild the state
    // explicitly so unset keys on the server don't drag local stale
    // values forward across browsers.
    const dataKeys: UserDefaultsKey[] = [
      "projectionMode", "monteCarloEnabled", "taxPolicyRegime",
      "propertyGrowthAssumption", "fundingSourceByProperty",
      "scenarioAssumptionSet", "riskProfile", "investorProfile",
      "strategyLens", "activeScenarioId", "activeHouseholdFinancialStateId",
    ];

    const nextState: any = { savedAt: parsed.savedAt ?? {} };
    const hydratedKeys: UserDefaultsKey[] = [];
    for (const k of dataKeys) {
      if (parsed[k] !== undefined) {
        nextState[k] = parsed[k];
        hydratedKeys.push(k);
      } else {
        // Explicitly mark absent — Zustand's `set` merges, so we must
        // remove keys not present on the server.
        nextState[k] = undefined;
      }
    }
    useUserDefaultsStore.setState(nextState);

    // Propagate hydrated values into the legacy single-purpose stores so
    // every engine that reads them (Tax Alpha, Cash Engine, Property
    // page, etc.) sees the server-restored state without any per-engine
    // refactor. Pure mirror — the resolver still delegates to these
    // stores for tax + funding source.
    if (parsed.taxPolicyRegime !== undefined) {
      try { setActiveRegime({ selector: parsed.taxPolicyRegime }); } catch { /* ignore */ }
    }
    if (parsed.fundingSourceByProperty && typeof parsed.fundingSourceByProperty === "object") {
      try { usePropertyFundingStore.getState().hydrate(parsed.fundingSourceByProperty); }
      catch { /* ignore */ }
    }

    _state.hydrated = true;
    _state.lastReadAt = new Date().toISOString();
    _state.lastError = undefined;
    _state.serverBackedKeys = new Set(hydratedKeys);
    _state.pendingKeys = new Set();
    notify();
    return { ok: true, source: "server", hydratedKeys };
  } catch (err: any) {
    _state.lastError = String(err?.message ?? err);
    _state.hydrated = true; // mark hydrated=true so app doesn't block forever
    notify();
    return { ok: false, source: "local", hydratedKeys: [], error: _state.lastError };
  }
}

// ─── Push (after every save) ─────────────────────────────────────────────────

let _pushTimer: ReturnType<typeof setTimeout> | null = null;
let _pushInFlight = false;

/**
 * Push the current local user-defaults state to the server. Debounced by
 * default so a flurry of saves (e.g. dragging a slider) coalesce into a
 * single network round-trip.
 *
 * When `immediate` is true (used by tests), the push runs synchronously
 * via `await pushUserDefaultsToServer({ immediate: true })`.
 */
export async function pushUserDefaultsToServer(opts?: {
  immediate?: boolean;
  /** Override the payload — primarily for tests. */
  payload?: Partial<UserDefaultsState>;
}): Promise<{ ok: boolean; error?: string }> {
  const run = async () => {
    if (_pushInFlight) return { ok: true };
    _pushInFlight = true;
    try {
      const snapshot = opts?.payload ?? useUserDefaultsStore.getState();
      // Strip actions/functions — only serialise data fields + savedAt map.
      const dataKeys: UserDefaultsKey[] = [
        "projectionMode", "monteCarloEnabled", "taxPolicyRegime",
        "propertyGrowthAssumption", "fundingSourceByProperty",
        "scenarioAssumptionSet", "riskProfile", "investorProfile",
        "strategyLens", "activeScenarioId", "activeHouseholdFinancialStateId",
      ];
      const body: any = { savedAt: (snapshot as any).savedAt ?? {} };
      for (const k of dataKeys) {
        const v = (snapshot as any)[k];
        if (v !== undefined) body[k] = v;
      }

      // Both the Express SQLite path and the Supabase static path accept a
      // string value. We send the serialised JSON so SQLite stores it
      // verbatim; Supabase will see it as a JSON-string-in-JSONB which
      // round-trips identically.
      const serialised = JSON.stringify(body);
      const apiRequest = await getApiRequest();
      const res = await apiRequest("PUT", `/api/settings/${encodeURIComponent(SETTINGS_KEY)}`, { value: serialised });
      if (!res.ok && res.status >= 400) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }

      _state.lastWriteOk = true;
      _state.lastWriteAt = new Date().toISOString();
      _state.lastError = undefined;
      // A successful PUT proves the backend is reachable, so even if the
      // initial GET never ran we can treat the client as hydrated against
      // the value we just wrote.
      _state.hydrated = true;
      // After a successful PUT, every populated key is server-backed.
      _state.serverBackedKeys = new Set(Object.keys(body).filter(k => k !== "savedAt") as UserDefaultsKey[]);
      _state.pendingKeys = new Set();
      notify();
      return { ok: true };
    } catch (err: any) {
      _state.lastWriteOk = false;
      _state.lastError = String(err?.message ?? err);
      notify();
      return { ok: false, error: _state.lastError };
    } finally {
      _pushInFlight = false;
    }
  };

  if (opts?.immediate) {
    if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
    return await run();
  }

  // Debounced (300ms — coalesces typical UI flurries without feeling laggy).
  return new Promise(resolve => {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(async () => {
      _pushTimer = null;
      resolve(await run());
    }, 300);
  });
}

/**
 * Mark a key as having a pending (unsynced) edit. Called from
 * `saveUserDefault` immediately after the local Zustand update, before the
 * debounced server push fires. Lets the audit trace render
 * "User Default (local pending sync)" until the PUT completes.
 */
export function markKeyPending(key: UserDefaultsKey): void {
  _state.serverBackedKeys.delete(key);
  _state.pendingKeys.add(key);
  notify();
}

/**
 * Reset the in-memory sync state — tests only. Does NOT touch the actual
 * Zustand store.
 */
export function __resetServerSyncState(): void {
  _state.hydrated = false;
  _state.lastWriteOk = false;
  _state.lastReadAt = undefined;
  _state.lastWriteAt = undefined;
  _state.lastError = undefined;
  _state.serverBackedKeys = new Set();
  _state.pendingKeys = new Set();
  if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
  _pushInFlight = false;
  notify();
}
