/**
 * test-user-defaults-audit-affordance.ts
 *
 * #FWL_Persistent_UserDefaults_ScenarioOverride — audit-mode discoverability.
 *
 * Verifies the QA gap raised against PR #49 commit a004e57:
 *   "user-default-specific audit traces exist in code/tests but are not
 *    discoverable as standalone trace panels from Settings or Audit Coverage."
 *
 * Static + behavioural checks (no jsdom):
 *   1. UserDefaultsSection wraps each row's source chip in AuditableMetric
 *      with traceId = `user-default:<key>`.
 *   2. UserDefaultsSection renders a TraceAffordance (button with
 *      data-audit-trace-id) gated by useAuditMode().auditMode === true.
 *   3. coverageManifest declares the `user_defaults` engine key + label.
 *   4. COVERAGE_MANIFEST contains every required `user-default:<key>` id
 *      and they're marked required.
 *   5. App.tsx registers registerUserDefaultsTraces() at boot so trace
 *      panels resolve even before Settings has mounted.
 *   6. Behavioural: registerUserDefaultsTraces() emits a trace for every
 *      manifest user-default id, and each trace's `Source` input mentions
 *      the resolved tier (User Default … / System Default / Scenario
 *      Override).
 *
 * Run with: tsx script/test-user-defaults-audit-affordance.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(__filename, "../..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
};
const section = (n: string) => console.log(`\n— ${n}`);

// ── 1. UserDefaultsSection wires AuditableMetric on the source chip ─────────
section("1. UserDefaultsSection wires AuditableMetric on the source chip");
const udSrc = read("client/src/components/UserDefaultsSection.tsx");

assert("Imports AuditableMetric",
  /import\s+\{\s*AuditableMetric\s*\}\s+from\s+["']@\/components\/auditMode\/AuditableMetric["']/.test(udSrc));
assert("Imports useAuditMode",
  /import\s+\{\s*useAuditMode\s*\}\s+from\s+["']@\/lib\/auditMode\/AuditModeContext["']/.test(udSrc));
// SourceChip defines `const traceId = \`user-default:${resolved.key as UserDefaultsKey}\``
// and then renders `<AuditableMetric traceId={traceId} ...>` — accept either form.
assert("SourceChip builds traceId from resolved.key",
  /const\s+traceId\s*=\s*`user-default:\$\{resolved\.key\s+as\s+UserDefaultsKey\}`/.test(udSrc));
assert("SourceChip renders <AuditableMetric traceId={traceId} ...>",
  /<AuditableMetric[\s\S]{0,200}traceId=\{(?:traceId|`user-default:\$\{resolved\.key)/.test(udSrc));
assert("Source chip's AuditableMetric carries testId user-default-source-chip-<key>",
  /testId=\{`user-default-source-chip-\$\{resolved\.key\}`\}/.test(udSrc));

// ── 2. TraceAffordance button is rendered per row when Audit Mode is ON ────
section("2. Per-row TraceAffordance gated by useAuditMode().auditMode");
assert("TraceAffordance helper defined",
  /function\s+TraceAffordance\s*\(/.test(udSrc));
assert("TraceAffordance returns null when auditMode is OFF",
  /if\s*\(!auditMode\)\s+return\s+null/.test(udSrc));
assert("TraceAffordance opens the user-default:<key> trace",
  /openTrace\(`user-default:\$\{resolvedKey\}`\)/.test(udSrc) ||
  /openTrace\(traceId\)/.test(udSrc));
assert("TraceAffordance exposes data-audit-trace-id (literal or via local traceId)",
  /data-audit-trace-id=\{(?:traceId|`user-default:\$\{resolvedKey\}`)\}/.test(udSrc));
assert("TraceAffordance has data-testid user-default-trace-<key>",
  /data-testid=\{`user-default-trace-\$\{resolvedKey\}`\}/.test(udSrc));
assert("DefaultRow mounts <TraceAffordance resolvedKey=… />",
  /<TraceAffordance\s+resolvedKey=/.test(udSrc));
assert("DefaultRow buttons row carries data-audit-trace-id for parent grouping",
  /data-audit-trace-id=\{`user-default:\$\{resolved\.key/.test(udSrc) &&
  /data-testid=\{`user-default-row-\$\{resolved\.key/.test(udSrc));

// ── 3. coverageManifest declares user_defaults engine ──────────────────────
section("3. coverageManifest declares user_defaults engine key + label");
const manifestSrc = read("client/src/lib/auditMode/coverageManifest.ts");

assert("EngineSourceKey union includes 'user_defaults'",
  /\|\s+'user_defaults'/.test(manifestSrc));
assert("ENGINE_LABELS maps user_defaults → 'Persistent User Defaults'",
  /user_defaults:\s*'Persistent User Defaults'/.test(manifestSrc));
assert("USER_DEFAULT_TRACE_IDS is exported",
  /export\s+const\s+USER_DEFAULT_TRACE_IDS/.test(manifestSrc));
assert("Manifest appends user-default entries via USER_DEFAULT_TRACE_IDS",
  /USER_DEFAULT_TRACE_IDS\.map<CoverageEntry>/.test(manifestSrc));

// ── 4. Manifest contains every required user-default:<key> id ──────────────
section("4. COVERAGE_MANIFEST enumerates every required user-default key");
const {
  COVERAGE_MANIFEST,
  USER_DEFAULT_TRACE_IDS,
  REQUIRED_TRACE_IDS,
  ENGINE_LABELS,
} = await import("../client/src/lib/auditMode/coverageManifest");

const REQUIRED_KEYS = [
  "projectionMode", "monteCarloEnabled", "taxPolicyRegime",
  "propertyGrowthAssumption", "fundingSourceByProperty",
  "scenarioAssumptionSet", "riskProfile", "investorProfile",
  "strategyLens", "activeScenarioId", "activeHouseholdFinancialStateId",
];
for (const k of REQUIRED_KEYS) {
  const id = `user-default:${k}`;
  assert(`USER_DEFAULT_TRACE_IDS contains ${id}`,
    USER_DEFAULT_TRACE_IDS.includes(id));
  assert(`COVERAGE_MANIFEST has entry ${id}`,
    COVERAGE_MANIFEST.some(e => e.id === id));
  assert(`REQUIRED_TRACE_IDS lists ${id}`,
    REQUIRED_TRACE_IDS.includes(id));
}

for (const entry of COVERAGE_MANIFEST.filter(e => e.id.startsWith("user-default:"))) {
  assert(`${entry.id}: engine = user_defaults`,
    entry.engine === "user_defaults");
  assert(`${entry.id}: surface points at the Settings card`,
    entry.surface.includes("settings.tsx") && entry.surface.includes("User Defaults"));
  assert(`${entry.id}: required = true`, entry.required === true);
}

assert("ENGINE_LABELS.user_defaults is friendly",
  ENGINE_LABELS.user_defaults === "Persistent User Defaults");

// ── 5. App.tsx registers user-default traces at boot ──────────────────────
section("5. App.tsx registers user-default traces at boot");
const appSrc = read("client/src/App.tsx");
assert("App.tsx imports registerUserDefaultsTraces",
  /import\s+\{\s*registerUserDefaultsTraces\s*\}\s+from\s+["']@\/lib\/auditMode\/engineTraces["']/.test(appSrc));
assert("App.tsx calls registerUserDefaultsTraces() at module-load",
  /\nregisterUserDefaultsTraces\(\);/.test(appSrc));
assert("App.tsx calls registerUserDefaultsTraces BEFORE hydrateUserDefaultsFromServer",
  appSrc.indexOf("registerUserDefaultsTraces();") <
  appSrc.indexOf("hydrateUserDefaultsFromServer("));

// ── 6. Behavioural: factories produce a real trace for every id ────────────
section("6. Behavioural: every user-default:<key> resolves a real trace");

// localStorage + fetch shims so the modules under test don't crash on import.
const memoryStore: Record<string, string> = {};
(globalThis as any).window = (globalThis as any).window ?? {
  localStorage: {
    getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
    setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
    removeItem: (k: string) => { delete memoryStore[k]; },
    clear: () => { for (const k of Object.keys(memoryStore)) delete memoryStore[k]; },
    key: (i: number) => Object.keys(memoryStore)[i] ?? null,
    get length() { return Object.keys(memoryStore).length; },
  },
  location: { hostname: "localhost", search: "" },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;
(globalThis as any).document = (globalThis as any).document ?? { hidden: false };
(globalThis as any).fetch = (globalThis as any).fetch ?? (async () =>
  new Response(JSON.stringify({}), { status: 200 }));

const { registerUserDefaultsTraces } = await import(
  "../client/src/lib/auditMode/engineTraces/userDefaultsTraces"
);
const { resolveTrace, hasTrace, __resetTraceRegistry } = await import(
  "../client/src/lib/auditMode/auditRegistry"
);

__resetTraceRegistry();
registerUserDefaultsTraces();

for (const id of USER_DEFAULT_TRACE_IDS) {
  assert(`Registry hasTrace(${id})`, hasTrace(id));
  const t = resolveTrace(id);
  assert(`resolveTrace(${id}) returns a CalculationTrace`, !!t);
  if (!t) continue;
  // Required fields from the spec
  assert(`${id}: has finalValue`, t.finalValue !== undefined && t.finalValue !== null);
  const sourceInput = t.inputs.find(i => i.label === "Source");
  assert(`${id}: Source input present`, !!sourceInput);
  assert(`${id}: Source input mentions one of the layer labels`,
    sourceInput ? /User Default|System Default|Scenario Override/.test(String(sourceInput.value)) : false);
  assert(`${id}: Saved at input present`,
    !!t.inputs.find(i => i.label === "Saved at"));
  assert(`${id}: Applied to input present`,
    !!t.inputs.find(i => i.label === "Applied to"));
  assert(`${id}: included[] lists at least one applied module`,
    Array.isArray(t.included) && t.included.length > 0);
  assert(`${id}: sourceEngine = scenarioSettingsResolver`,
    t.sourceEngine === "scenarioSettingsResolver");
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log("\n────────────────────────────────────────────────");
if (failures === 0) {
  console.log("  ALL TESTS PASSED  (user-default audit affordance discoverability)");
  process.exit(0);
} else {
  console.error(`  ${failures} TEST FAILURE(S)`);
  process.exit(1);
}
