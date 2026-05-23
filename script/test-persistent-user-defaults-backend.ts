/**
 * test-persistent-user-defaults-backend.ts
 *
 * Backend-tier regression suite for #FWL_Persistent_UserDefaults_ScenarioOverride.
 *
 * Verifies the SERVER-backed persistence path, on top of the
 * localStorage-only suite (`test-persistent-user-defaults.ts`):
 *
 *   1. saveUserDefault → debounced push to /api/settings/:key
 *      (immediate flag for tests).
 *   2. Backend round-trip: GET after PUT returns the same payload.
 *   3. Tax regime saved as PROPOSED_2027_REFORM persists across a
 *      simulated redeploy (localStorage cleared, fresh in-memory store)
 *      and re-hydrates from the backend.
 *   4. propertyGrowthAssumption=10 survives the same redeploy.
 *   5. projectionMode=optimistic survives the same redeploy.
 *   6. fundingSourceByProperty (IP2 = equity-release) survives the same
 *      redeploy.
 *   7. Backend-hydrated value beats local stale value: stale localStorage
 *      says "AUTO_DETECT" but backend says "PROPOSED_2027_REFORM" → resolver
 *      returns the backend value with userTier = "server-backed".
 *   8. Audit trace labels reflect persistence tier accurately
 *      ("User Default (server-backed)" vs "(local fallback)").
 *   9. Sync failure (5xx) drops the key to local-pending without losing
 *      the local value.
 *  10. Reset propagates to the server (PUT with cleared payload).
 *
 * Run with:  tsx script/test-persistent-user-defaults-backend.ts
 */

// ─── Environment shims (must come BEFORE any module imports) ─────────────────

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

// ─── Mock backend ────────────────────────────────────────────────────────────
//
// Simulates the existing /api/settings/:key endpoint with a single in-memory
// row. We intercept window.fetch which is what the dev queryClient path
// ends up calling (apiRequest → fetch(path, …)). This is the SAME contract
// the Express server / Supabase static path use.

interface BackendState {
  table: Record<string, string>;
  getCount: number;
  putCount: number;
  failNextPut?: boolean;
}
const backend: BackendState = { table: {}, getCount: 0, putCount: 0 };

(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const u = String(url);
  const settingsMatch = u.match(/\/api\/settings\/(.+)$/);
  if (!settingsMatch) {
    return new Response("{}", { status: 200 });
  }
  const key = decodeURIComponent(settingsMatch[1]);
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET") {
    backend.getCount++;
    const value = backend.table[key] ?? null;
    return new Response(JSON.stringify({ key, value }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (method === "PUT") {
    backend.putCount++;
    if (backend.failNextPut) {
      backend.failNextPut = false;
      return new Response("Simulated 500", { status: 500 });
    }
    const body = init?.body ? JSON.parse(init.body as string) : {};
    backend.table[key] = String(body.value ?? "");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("{}", { status: 200 });
};

// ─── Module imports (must come AFTER shims) ──────────────────────────────────

const {
  useUserDefaultsStore,
  SYSTEM_DEFAULTS,
  USER_DEFAULTS_LS_KEY,
} = await import("../client/src/lib/persistentUserDefaults");
const {
  resolveSetting,
  saveUserDefault,
  resetAllUserDefaults,
  fullSourceLabel,
} = await import("../client/src/lib/scenarioSettingsResolver");
const {
  hydrateUserDefaultsFromServer,
  pushUserDefaultsToServer,
  getServerSyncState,
  __resetServerSyncState,
  SETTINGS_KEY,
} = await import("../client/src/lib/userDefaultsApi");
const {
  registerUserDefaultsTraces,
  buildUserDefaultTrace,
} = await import("../client/src/lib/auditMode/engineTraces/userDefaultsTraces");
const {
  resolveTrace,
  __resetTraceRegistry,
} = await import("../client/src/lib/auditMode/auditRegistry");
const {
  resetActiveRegime,
} = await import("../client/src/lib/activeRegimeStore");
const {
  usePropertyFundingStore,
} = await import("../client/src/lib/propertyFundingStore");

let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n— ${n}`);

function fullLocalReset() {
  // Wipe every in-process layer EXCEPT the backend. This is what a fresh
  // browser / new device / post-redeploy load looks like.
  // Strip every Zustand-tracked key off the user defaults store (Zustand
  // `set` merges, so simply assigning {savedAt:{}} would leave prior keys
  // intact — we must explicitly mark each as undefined).
  const blank: any = {
    savedAt: {},
    projectionMode: undefined, monteCarloEnabled: undefined,
    taxPolicyRegime: undefined, propertyGrowthAssumption: undefined,
    fundingSourceByProperty: undefined, scenarioAssumptionSet: undefined,
    riskProfile: undefined, investorProfile: undefined,
    strategyLens: undefined, activeScenarioId: undefined,
    activeHouseholdFinancialStateId: undefined,
  };
  useUserDefaultsStore.setState(blank);
  resetActiveRegime();
  usePropertyFundingStore.getState().hydrate({});
  __resetServerSyncState();
  __resetTraceRegistry();
  // Clear localStorage AFTER the in-memory resets — Zustand persist may
  // write to localStorage as a side-effect of those setState calls.
  for (const k of Object.keys(memoryStore)) delete memoryStore[k];
}

function fullSystemReset() {
  // Same as above + also clear backend (true clean slate).
  fullLocalReset();
  backend.table = {};
  backend.getCount = 0;
  backend.putCount = 0;
  backend.failNextPut = false;
}

// ─── 1. Save round-trips through the backend ─────────────────────────────────
section("1. saveUserDefault pushes payload to backend");
fullSystemReset();
{
  saveUserDefault("taxPolicyRegime", "PROPOSED_2027_REFORM");
  // Force-flush the debounced push so the test can assert synchronously.
  await pushUserDefaultsToServer({ immediate: true });

  assert("Backend received at least one PUT", backend.putCount >= 1);
  assert("Backend row stored under fwl.userDefaults.v1 key",
    SETTINGS_KEY in backend.table);
  const stored = JSON.parse(backend.table[SETTINGS_KEY]);
  assert("Backend payload contains taxPolicyRegime=PROPOSED_2027_REFORM",
    stored.taxPolicyRegime === "PROPOSED_2027_REFORM");
  assert("Backend payload contains savedAt timestamp for taxPolicyRegime",
    typeof stored.savedAt?.taxPolicyRegime === "string");

  const sync = getServerSyncState();
  assert("Sync state reports lastWriteOk = true after successful PUT",
    sync.lastWriteOk === true);
  assert("Sync state lists taxPolicyRegime as server-backed",
    sync.serverBackedKeys.has("taxPolicyRegime"));
  assert("Sync state pendingKeys is now empty",
    sync.pendingKeys.size === 0);
}

// ─── 2. GET-after-PUT returns identical payload ──────────────────────────────
section("2. Backend round-trip: GET after PUT returns the same payload");
{
  __resetServerSyncState();
  // Wipe local Zustand state — we want to prove the GET re-populates it.
  useUserDefaultsStore.setState({ savedAt: {} } as any);
  resetActiveRegime();

  const result = await hydrateUserDefaultsFromServer();
  assert("Hydration source is 'server'",
    result.source === "server", `actual: ${result.source}`);
  assert("Hydration returned taxPolicyRegime in hydratedKeys",
    result.hydratedKeys.includes("taxPolicyRegime"));

  const r = resolveSetting("taxPolicyRegime");
  assert("After hydrate, resolver returns PROPOSED_2027_REFORM",
    r.value === "PROPOSED_2027_REFORM");
  assert("After hydrate, resolver reports userTier = 'server-backed'",
    r.userTier === "server-backed");
  assert("After hydrate, fullSourceLabel reads 'User Default (server-backed)'",
    fullSourceLabel(r) === "User Default (server-backed)");
}

// ─── 3-6. SIMULATED REDEPLOY — backend payload survives fresh client ─────────
section("3. Simulated redeploy: tax regime + projection + prop growth + IP2 funding all persist");
fullSystemReset();
{
  // Same user, populating their defaults on the first browser:
  saveUserDefault("taxPolicyRegime",          "PROPOSED_2027_REFORM");
  saveUserDefault("projectionMode",           "optimistic");
  saveUserDefault("propertyGrowthAssumption", 10);
  saveUserDefault("monteCarloEnabled",        true);
  saveUserDefault("activeScenarioId",         "proposed_reform");
  saveUserDefault("activeHouseholdFinancialStateId", "snapshot_42");
  usePropertyFundingStore.getState().setChoice("2", { source: "equity-release" });
  saveUserDefault("fundingSourceByProperty", usePropertyFundingStore.getState().choices as any);
  await pushUserDefaultsToServer({ immediate: true });

  // Snapshot the backend (mimics what a Vercel deploy preserves).
  const backendBefore = JSON.parse(backend.table[SETTINGS_KEY]);
  assert("Backend captured tax = PROPOSED_2027_REFORM",
    backendBefore.taxPolicyRegime === "PROPOSED_2027_REFORM");
  assert("Backend captured projectionMode = optimistic",
    backendBefore.projectionMode === "optimistic");
  assert("Backend captured propertyGrowthAssumption = 10",
    backendBefore.propertyGrowthAssumption === 10);
  assert("Backend captured activeScenarioId = proposed_reform",
    backendBefore.activeScenarioId === "proposed_reform");
  assert("Backend captured activeHouseholdFinancialStateId = snapshot_42",
    backendBefore.activeHouseholdFinancialStateId === "snapshot_42");
  assert("Backend captured fundingSourceByProperty['2'] = equity-release",
    backendBefore.fundingSourceByProperty?.["2"]?.source === "equity-release");

  // SIMULATE REDEPLOY — wipe every client-side cache (new browser, new
  // device, or new bundle after a deploy) but keep the backend intact.
  fullLocalReset();
  // Sanity: localStorage is now empty.
  assert("localStorage is empty after simulated redeploy",
    !memoryStore[USER_DEFAULTS_LS_KEY] && !memoryStore["fwl.activeRegime"] &&
    !memoryStore["fwl.propertyFunding"]);
  // Sanity: resolver returns system defaults before hydration.
  assert("Before hydrate, resolver returns SYSTEM tax regime (AUTO_DETECT)",
    resolveSetting("taxPolicyRegime").source === "system");
  assert("Before hydrate, resolver returns SYSTEM projection mode",
    resolveSetting("projectionMode").source === "system");

  // Run hydration — this is the App-boot path.
  const hyd = await hydrateUserDefaultsFromServer();
  assert("Hydration after redeploy returned source = server",
    hyd.source === "server");

  // Now every key must resolve to the user-saved value, server-backed.
  const taxR        = resolveSetting("taxPolicyRegime");
  const projR       = resolveSetting("projectionMode");
  const propR       = resolveSetting("propertyGrowthAssumption");
  const mcR         = resolveSetting("monteCarloEnabled");
  const scenR       = resolveSetting("activeScenarioId");
  const hhR         = resolveSetting("activeHouseholdFinancialStateId");

  // funding source still needs to be hydrated separately into the funding
  // store, since it lives in its own Zustand store (the resolver delegates
  // to it). hydrateUserDefaultsFromServer re-populates the central store;
  // here we forward the funding map into the legacy funding store.
  const fmap = (resolveSetting("fundingSourceByProperty").value ?? {}) as any;
  usePropertyFundingStore.getState().hydrate(fmap);
  const fundR = resolveSetting("fundingSourceByProperty");

  assert("After redeploy + hydrate: taxPolicyRegime = PROPOSED_2027_REFORM",
    taxR.value === "PROPOSED_2027_REFORM");
  assert("After redeploy + hydrate: taxPolicyRegime tier = server-backed",
    taxR.userTier === "server-backed");
  assert("After redeploy + hydrate: projectionMode = optimistic, server-backed",
    projR.value === "optimistic" && projR.userTier === "server-backed");
  assert("After redeploy + hydrate: propertyGrowthAssumption = 10, server-backed",
    propR.value === 10 && propR.userTier === "server-backed");
  assert("After redeploy + hydrate: monteCarloEnabled = true",
    mcR.value === true);
  assert("After redeploy + hydrate: activeScenarioId = proposed_reform",
    scenR.value === "proposed_reform");
  assert("After redeploy + hydrate: activeHouseholdFinancialStateId = snapshot_42",
    hhR.value === "snapshot_42");
  assert("After redeploy + hydrate: IP2 funding = equity-release",
    (fundR.value as any)?.["2"]?.source === "equity-release");
}

// ─── 7. Backend-hydrated value beats stale local value ───────────────────────
section("7. Backend-hydrated value beats stale local value");
fullSystemReset();
{
  // Pretend localStorage has a stale "Smart Auto-Detect" record (e.g. a
  // device that didn't get the recent change). Backend has the truth.
  memoryStore[USER_DEFAULTS_LS_KEY] = JSON.stringify({
    state: { taxPolicyRegime: "AUTO_DETECT", savedAt: { taxPolicyRegime: "2026-01-01T00:00:00.000Z" } },
    version: 1,
  });
  backend.table[SETTINGS_KEY] = JSON.stringify({
    taxPolicyRegime: "PROPOSED_2027_REFORM",
    savedAt: { taxPolicyRegime: "2026-05-22T12:00:00.000Z" },
  });

  // Force the store to rehydrate from localStorage (Zustand does this on
  // initial creation; here we mimic it manually by replaying the parsed
  // state — same as Zustand's persist middleware does on construction).
  const stale = JSON.parse(memoryStore[USER_DEFAULTS_LS_KEY]).state;
  useUserDefaultsStore.setState(stale);
  __resetServerSyncState();

  // Confirm stale state is the local truth right now.
  const before = resolveSetting("taxPolicyRegime");
  assert("Before hydrate, resolver sees stale local AUTO_DETECT (or system fallback)",
    before.value === "AUTO_DETECT" ||
    (before.source === "system" && before.value === "AUTO_DETECT"));

  // App boot: hydrate from the backend.
  await hydrateUserDefaultsFromServer();
  const after = resolveSetting("taxPolicyRegime");
  assert("After hydrate, resolver returns backend PROPOSED_2027_REFORM",
    after.value === "PROPOSED_2027_REFORM");
  assert("After hydrate, source = user / tier = server-backed",
    after.source === "user" && after.userTier === "server-backed");
}

// ─── 8. Audit trace labels reflect persistence tier ──────────────────────────
section("8. Audit trace labels: server-backed vs local fallback");
fullSystemReset();
{
  saveUserDefault("propertyGrowthAssumption", 10);
  await pushUserDefaultsToServer({ immediate: true });
  registerUserDefaultsTraces();

  const trace = resolveTrace("user-default:propertyGrowthAssumption")!;
  const sourceInput = trace.inputs.find(i => i.label === "Source");
  assert("Trace Source label says 'User Default (server-backed)' after successful PUT",
    String(sourceInput?.value).includes("server-backed"),
    `actual: ${sourceInput?.value}`);
  const backendInput = trace.inputs.find(i => i.label === "Backend sync");
  assert("Trace exposes Backend sync row showing OK",
    backendInput && String(backendInput.value).startsWith("OK"));

  // Now simulate a backend outage and a fresh save → tier becomes
  // local-pending (push fails, value remains).
  backend.failNextPut = true;
  saveUserDefault("propertyGrowthAssumption", 12);
  const pushRes = await pushUserDefaultsToServer({ immediate: true });
  assert("Push reports failure when backend returns 500",
    pushRes.ok === false);
  __resetTraceRegistry();
  registerUserDefaultsTraces();
  const traceAfter = resolveTrace("user-default:propertyGrowthAssumption")!;
  const sourceAfter = String(traceAfter.inputs.find(i => i.label === "Source")?.value ?? "");
  assert("After failed push, trace Source contains 'local pending' or 'local fallback'",
    sourceAfter.includes("local pending") || sourceAfter.includes("local fallback"),
    `actual: ${sourceAfter}`);
  // Crucially, the local value did NOT regress.
  assert("After failed push, resolver still returns the new local value (12)",
    resolveSetting("propertyGrowthAssumption").value === 12);
}

// ─── 9. Reset propagates to backend ──────────────────────────────────────────
section("9. Reset propagates to backend");
fullSystemReset();
{
  saveUserDefault("taxPolicyRegime", "PROPOSED_2027_REFORM");
  saveUserDefault("propertyGrowthAssumption", 10);
  await pushUserDefaultsToServer({ immediate: true });
  const putsBefore = backend.putCount;

  resetAllUserDefaults();
  await pushUserDefaultsToServer({ immediate: true });
  assert("Reset triggers at least one additional backend PUT",
    backend.putCount > putsBefore);
  const after = JSON.parse(backend.table[SETTINGS_KEY]);
  assert("After reset, backend payload no longer contains taxPolicyRegime override",
    after.taxPolicyRegime === undefined);
  assert("After reset, backend payload no longer contains propertyGrowthAssumption override",
    after.propertyGrowthAssumption === undefined);
}

// ─── 10. Offline graceful degradation ────────────────────────────────────────
section("10. Offline graceful degradation");
fullSystemReset();
{
  // Replace fetch with one that always throws — pretend the backend is
  // completely unreachable (no DNS, captive portal, etc.).
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => { throw new Error("Network down"); };
  __resetServerSyncState();

  saveUserDefault("taxPolicyRegime", "CURRENT_RULES");
  const pushRes = await pushUserDefaultsToServer({ immediate: true });
  assert("Offline push returns ok=false with error message",
    pushRes.ok === false && typeof pushRes.error === "string");

  // Local value is still resolvable.
  const r = resolveSetting("taxPolicyRegime");
  assert("Offline: resolver still returns the local value",
    r.value === "CURRENT_RULES");
  assert("Offline: userTier reports 'local-pending' or 'local-fallback'",
    r.userTier === "local-pending" || r.userTier === "local-fallback");

  // Hydrate also fails gracefully.
  __resetServerSyncState();
  const hyd = await hydrateUserDefaultsFromServer();
  assert("Offline hydrate returns ok=false, source=local",
    hyd.ok === false && hyd.source === "local");

  (globalThis as any).fetch = originalFetch;
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n────────────────────────────────────────────────");
if (failures === 0) {
  console.log("  ALL TESTS PASSED  (server-backed user defaults round-trip)");
  process.exit(0);
} else {
  console.error(`  ${failures} TEST FAILURE(S)`);
  process.exit(1);
}
