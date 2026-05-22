/**
 * test-persistent-user-defaults.ts
 *
 * Regression suite for #FWL_Persistent_UserDefaults_ScenarioOverride.
 *
 * Verifies:
 *   1. Resolver priority: scenario override > user default > system default
 *   2. Every required setting saves + reloads (simulating a page reload by
 *      re-creating the store from the localStorage shim)
 *   3. Tax regime persists when user picks PROPOSED_2027_REFORM (does not
 *      reset to AUTO_DETECT on reload)
 *   4. IP2 funding source persists as Equity Release
 *   5. Property growth saved as 10 % survives reload
 *   6. projection mode saved as a non-default value survives reload
 *   7. Audit trace renders: current value, source, savedAt, applied module
 *   8. saveUserDefault mirrors taxPolicyRegime into the legacy
 *      activeRegimeStore so engines that already read it keep working
 *   9. Reset to system defaults wipes user layer but does NOT touch
 *      scenario overrides
 *
 * Run with:  tsx script/test-persistent-user-defaults.ts
 */

// ─── localStorage shim (must come BEFORE Zustand persist initialises) ────────
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
// document is touched by some imports (not by our code path); provide a stub
(globalThis as any).document = (globalThis as any).document ?? { hidden: false };

// Fetch stub — the resolver fires off pushUserDefaultsToServer() in the
// background after each saveUserDefault(). In these unit tests we don't
// need that to actually succeed; we just need it to NOT crash. Backend
// round-trip is exercised separately by test-persistent-user-defaults-backend.ts.
const _fetchLog: Array<{ url: string; init?: RequestInit }> = [];
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  _fetchLog.push({ url: String(url), init });
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
};

const {
  useUserDefaultsStore,
  SYSTEM_DEFAULTS,
  USER_DEFAULTS_LS_KEY,
} = await import('../client/src/lib/persistentUserDefaults');
const {
  resolveSetting,
  resolveAllSettings,
  applyScenarioOverride,
  extractScenarioOverrides,
  saveUserDefault,
  resetAllUserDefaults,
  sourceLabel,
} = await import('../client/src/lib/scenarioSettingsResolver');
const {
  buildUserDefaultTrace,
  registerUserDefaultsTraces,
} = await import('../client/src/lib/auditMode/engineTraces/userDefaultsTraces');
const {
  resolveTrace,
  hasTrace,
  __resetTraceRegistry,
} = await import('../client/src/lib/auditMode/auditRegistry');
const {
  setActiveRegime,
  resetActiveRegime,
  getActiveRegime,
} = await import('../client/src/lib/activeRegimeStore');
const {
  usePropertyFundingStore,
} = await import('../client/src/lib/propertyFundingStore');

let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n— ${n}`);

function fullReset() {
  resetAllUserDefaults();
  resetActiveRegime();
  usePropertyFundingStore.getState().hydrate({});
  __resetTraceRegistry();
}

// ─── 1. Strict resolver priority ─────────────────────────────────────────────
section('1. Strict resolver priority (scenario > user > system)');
fullReset();

{
  // No user, no scenario → system
  const r = resolveSetting('projectionMode');
  assert('System default returned when nothing saved',
    r.source === 'system' && r.value === SYSTEM_DEFAULTS.projectionMode);

  // User default → user
  saveUserDefault('projectionMode', 'optimistic');
  const r2 = resolveSetting('projectionMode');
  assert('User default returned when set',
    r2.source === 'user' && r2.value === 'optimistic');
  assert('User default carries savedAt timestamp', !!r2.savedAt);

  // Scenario override → scenario (wins over user)
  const overrides: any = {
    projectionMode: 'conservative',
    savedAt: { projectionMode: new Date('2026-05-22T12:00:00Z').toISOString() },
  };
  const r3 = resolveSetting('projectionMode', overrides);
  assert('Scenario override wins over user default',
    r3.source === 'scenario' && r3.value === 'conservative');
  assert('Scenario override surfaces its savedAt',
    r3.savedAt === '2026-05-22T12:00:00.000Z');
}

// ─── 2. Persistence across reload (localStorage rehydration) ─────────────────
section('2. Persistence across reload — required settings');
fullReset();

{
  // Save every required key
  saveUserDefault('projectionMode',           'optimistic');
  saveUserDefault('monteCarloEnabled',        true);
  saveUserDefault('taxPolicyRegime',          'PROPOSED_2027_REFORM');
  saveUserDefault('propertyGrowthAssumption', 10);
  saveUserDefault('scenarioAssumptionSet',    'aggressive');
  saveUserDefault('riskProfile',              'aggressive');
  saveUserDefault('investorProfile',          'wealth_max');
  saveUserDefault('strategyLens',             'cashflow');
  saveUserDefault('activeScenarioId',         'proposed_reform');
  saveUserDefault('activeHouseholdFinancialStateId', 'snapshot_42');

  // Verify localStorage was written
  const raw = localStorageShim.getItem(USER_DEFAULTS_LS_KEY);
  assert('User defaults written to localStorage key fwl.userDefaults.v1', !!raw);

  // Simulate reload by parsing the persisted JSON and asserting all values
  const parsed = JSON.parse(raw!);
  const state = parsed?.state ?? parsed; // Zustand persist wraps in { state }
  assert('projectionMode persists as optimistic',
    state.projectionMode === 'optimistic');
  assert('monteCarloEnabled persists as true',
    state.monteCarloEnabled === true);
  assert('taxPolicyRegime persists as PROPOSED_2027_REFORM',
    state.taxPolicyRegime === 'PROPOSED_2027_REFORM');
  assert('propertyGrowthAssumption persists as 10',
    state.propertyGrowthAssumption === 10);
  assert('scenarioAssumptionSet persists as aggressive',
    state.scenarioAssumptionSet === 'aggressive');
  assert('riskProfile persists as aggressive',
    state.riskProfile === 'aggressive');
  assert('investorProfile persists as wealth_max',
    state.investorProfile === 'wealth_max');
  assert('strategyLens persists as cashflow',
    state.strategyLens === 'cashflow');
  assert('activeScenarioId persists as proposed_reform',
    state.activeScenarioId === 'proposed_reform');
  assert('activeHouseholdFinancialStateId persists as snapshot_42',
    state.activeHouseholdFinancialStateId === 'snapshot_42');
  assert('savedAt map present for every key',
    state.savedAt && Object.keys(state.savedAt).length === 10);

  // Tax regime side-channel: legacy store should mirror selection
  assert('saveUserDefault(taxPolicyRegime, PROPOSED_2027_REFORM) propagates to activeRegimeStore',
    getActiveRegime().selector === 'PROPOSED_2027_REFORM');
}

// ─── 3. Reload behaviour: rehydrating from localStorage ──────────────────────
section('3. Reload behaviour — rehydration restores user choices');
{
  // Simulate "reload" by rebuilding the store state from JSON we already
  // wrote to localStorage in section 2. Zustand persist will hydrate on
  // any access; we mimic that by reading the same JSON manually.
  const raw = localStorageShim.getItem(USER_DEFAULTS_LS_KEY)!;
  const parsed = JSON.parse(raw);
  const persisted = parsed.state ?? parsed;
  useUserDefaultsStore.setState({ ...persisted } as any);

  const r1 = resolveSetting('taxPolicyRegime');
  assert('Tax regime resolves to PROPOSED_2027_REFORM after reload',
    r1.value === 'PROPOSED_2027_REFORM' && r1.source === 'user');
  const r2 = resolveSetting('propertyGrowthAssumption');
  assert('Property growth resolves to 10 after reload',
    r2.value === 10 && r2.source === 'user');
  const r3 = resolveSetting('projectionMode');
  assert('Projection mode resolves to optimistic after reload',
    r3.value === 'optimistic' && r3.source === 'user');
  const r4 = resolveSetting('activeScenarioId');
  assert('Active scenario id resolves to proposed_reform after reload',
    r4.value === 'proposed_reform' && r4.source === 'user');
}

// ─── 4. IP2 funding source persists as Equity Release ────────────────────────
section('4. IP2 funding source persistence');
fullReset();
{
  usePropertyFundingStore.getState().setChoice('2', { source: 'equity-release' });
  const r = resolveSetting('fundingSourceByProperty');
  assert('Funding map resolves from propertyFundingStore as user layer',
    r.source === 'user' && (r.value as any)?.['2']?.source === 'equity-release');
  assert('Funding choice updatedAt is present',
    !!(r.value as any)?.['2']?.updatedAt);

  // Reload — propertyFundingStore is persisted via localStorage key fwl.propertyFunding
  const raw = localStorageShim.getItem('fwl.propertyFunding');
  assert('Funding store written to localStorage',
    !!raw && raw.includes('equity-release'));
}

// ─── 5. Tax regime never resets to AUTO_DETECT if user selected reform ───────
section('5. Tax regime stable across resolveSetting calls');
fullReset();
{
  // User selects reform via the legacy activeRegimeStore (existing UI path)
  setActiveRegime({ selector: 'PROPOSED_2027_REFORM' });
  const r1 = resolveSetting('taxPolicyRegime');
  assert('Resolver returns PROPOSED_2027_REFORM via activeRegimeStore',
    r1.value === 'PROPOSED_2027_REFORM' && r1.source === 'user');
  // After multiple reads it remains user-sourced, never reverts to system
  for (let i = 0; i < 5; i++) {
    const r = resolveSetting('taxPolicyRegime');
    if (r.source !== 'user' || r.value !== 'PROPOSED_2027_REFORM') {
      failures++;
      console.error(`  ✗ Tax regime drifted on read ${i}: ${r.source}/${r.value}`);
    }
  }
  console.log('  ✓ Tax regime stable across 5 reads');
}

// ─── 6. Scenario overrides round-trip via JSON ───────────────────────────────
section('6. Scenario JSON round-trip');
fullReset();
{
  const json = applyScenarioOverride(null, {
    projectionMode: 'conservative',
    taxPolicyRegime: 'CURRENT_RULES',
    propertyGrowthAssumption: 4,
  });
  const overrides = extractScenarioOverrides(json);
  assert('extractScenarioOverrides returns the saved values',
    overrides?.projectionMode === 'conservative' &&
    overrides?.taxPolicyRegime === 'CURRENT_RULES' &&
    overrides?.propertyGrowthAssumption === 4);
  assert('savedAt timestamps recorded per key',
    typeof overrides?.savedAt?.projectionMode === 'string' &&
    typeof overrides?.savedAt?.taxPolicyRegime === 'string');

  // User defaults remain untouched by scenario writes
  saveUserDefault('projectionMode', 'optimistic');
  const r = resolveSetting('projectionMode', overrides);
  assert('Scenario override beats user default',
    r.source === 'scenario' && r.value === 'conservative');

  // Without overrides, user default returns
  const r2 = resolveSetting('projectionMode');
  assert('User default returns when no overrides are passed',
    r2.source === 'user' && r2.value === 'optimistic');
}

// ─── 7. Audit trace exposes current value, source, savedAt, applied module ───
section('7. Audit trace fields');
fullReset();
{
  saveUserDefault('taxPolicyRegime', 'PROPOSED_2027_REFORM');
  saveUserDefault('projectionMode', 'optimistic');
  saveUserDefault('propertyGrowthAssumption', 10);
  usePropertyFundingStore.getState().setChoice('2', { source: 'equity-release' });

  registerUserDefaultsTraces();
  assert('Registry contains user-default:taxPolicyRegime',
    hasTrace('user-default:taxPolicyRegime'));
  assert('Registry contains user-default:projectionMode',
    hasTrace('user-default:projectionMode'));
  assert('Registry contains user-default:propertyGrowthAssumption',
    hasTrace('user-default:propertyGrowthAssumption'));
  assert('Registry contains user-default:fundingSourceByProperty',
    hasTrace('user-default:fundingSourceByProperty'));

  const taxTrace = resolveTrace('user-default:taxPolicyRegime')!;
  assert('Tax-regime trace finalValue is PROPOSED_2027_REFORM',
    String(taxTrace.finalValue) === 'PROPOSED_2027_REFORM');
  assert('Tax-regime trace inputs include Current value, Source, Saved at, Applied to',
    taxTrace.inputs.length >= 4 &&
    taxTrace.inputs.some(i => i.label === 'Current value') &&
    taxTrace.inputs.some(i => i.label === 'Source') &&
    taxTrace.inputs.some(i => i.label === 'Saved at') &&
    taxTrace.inputs.some(i => i.label === 'Applied to'));
  assert('Tax-regime trace Source starts with "User Default"',
    String(taxTrace.inputs.find(i => i.label === 'Source')?.value ?? '').startsWith('User Default'));
  assert('Tax-regime trace Applied to lists Tax Alpha Engine',
    String(taxTrace.inputs.find(i => i.label === 'Applied to')?.value).includes('Tax Alpha Engine'));

  const projTrace = resolveTrace('user-default:projectionMode')!;
  assert('Projection trace finalValue is optimistic',
    String(projTrace.finalValue) === 'optimistic');
  assert('Projection trace Applied to includes Monte Carlo V5',
    String(projTrace.inputs.find(i => i.label === 'Applied to')?.value).includes('Monte Carlo V5'));

  const propTrace = resolveTrace('user-default:propertyGrowthAssumption')!;
  assert('Property growth trace finalValue is 10',
    String(propTrace.finalValue) === '10');

  const fundingTrace = resolveTrace('user-default:fundingSourceByProperty')!;
  assert('Funding trace Source starts with "User Default"',
    String(fundingTrace.inputs.find(i => i.label === 'Source')?.value ?? '').startsWith('User Default'));
  assert('Funding trace finalValue contains equity-release',
    String(fundingTrace.finalValue).includes('equity-release'));
}

// ─── 8. Reset wipes user layer but preserves scenario overrides ──────────────
section('8. Reset behaviour');
{
  // Build state
  fullReset();
  saveUserDefault('projectionMode', 'optimistic');
  saveUserDefault('taxPolicyRegime', 'PROPOSED_2027_REFORM');
  const scenarioJson = applyScenarioOverride(null, { projectionMode: 'conservative' });
  const overrides = extractScenarioOverrides(scenarioJson)!;

  resetAllUserDefaults();
  const r1 = resolveSetting('projectionMode');
  assert('After reset, projectionMode returns to system default',
    r1.source === 'system' && r1.value === SYSTEM_DEFAULTS.projectionMode);
  const r2 = resolveSetting('taxPolicyRegime');
  assert('After reset, taxPolicyRegime returns to AUTO_DETECT system default',
    r2.source === 'system' && r2.value === 'AUTO_DETECT');

  // Scenario overrides untouched
  const r3 = resolveSetting('projectionMode', overrides);
  assert('Reset does NOT wipe scenario overrides',
    r3.source === 'scenario' && r3.value === 'conservative');
}

// ─── 9. resolveAllSettings returns every key with a source label ─────────────
section('9. resolveAllSettings + source labels');
fullReset();
{
  saveUserDefault('taxPolicyRegime', 'CURRENT_RULES');
  const all = resolveAllSettings();
  assert('All required keys resolved',
    !!(all.projectionMode && all.monteCarloEnabled && all.taxPolicyRegime &&
       all.propertyGrowthAssumption && all.fundingSourceByProperty &&
       all.scenarioAssumptionSet && all.riskProfile && all.investorProfile &&
       all.strategyLens && all.activeScenarioId && all.activeHouseholdFinancialStateId));
  assert('Tax regime row is user-sourced after save',
    all.taxPolicyRegime.source === 'user' &&
    sourceLabel(all.taxPolicyRegime.source) === 'User Default');
  assert('Other rows fall back to system',
    all.projectionMode.source === 'system' &&
    sourceLabel(all.projectionMode.source) === 'System Default');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────');
if (failures === 0) {
  console.log('  ALL TESTS PASSED  (persistent user defaults + resolver)');
  process.exit(0);
} else {
  console.error(`  ${failures} TEST FAILURE(S)`);
  process.exit(1);
}
