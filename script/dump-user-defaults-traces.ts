/**
 * dump-user-defaults-traces.ts
 *
 * Prints the audit-trace payload for each persisted user default, in the
 * exact scenario from the bug report (tax = Proposed 2027 Reform,
 * projection = optimistic, property growth = 10%, IP2 funding = Equity
 * Release). Used to capture sample traces for the PR description.
 *
 * Run with:  tsx script/dump-user-defaults-traces.ts
 */

// localStorage shim
const memoryStore: Record<string, string> = {};
const localStorageShim = {
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
  removeItem: (k: string) => { delete memoryStore[k]; },
  clear: () => { for (const k of Object.keys(memoryStore)) delete memoryStore[k]; },
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  get length() { return Object.keys(memoryStore).length; },
};
(globalThis as any).window = { localStorage: localStorageShim };
(globalThis as any).localStorage = localStorageShim;

const { saveUserDefault } = await import('../client/src/lib/scenarioSettingsResolver');
const { usePropertyFundingStore } = await import('../client/src/lib/propertyFundingStore');
const { resolveTrace } = await import('../client/src/lib/auditMode/auditRegistry');
const { registerUserDefaultsTraces } = await import('../client/src/lib/auditMode/engineTraces/userDefaultsTraces');

saveUserDefault('taxPolicyRegime', 'PROPOSED_2027_REFORM');
saveUserDefault('projectionMode', 'optimistic');
saveUserDefault('propertyGrowthAssumption', 10);
saveUserDefault('monteCarloEnabled', true);
usePropertyFundingStore.getState().setChoice('2', { source: 'equity-release' });

registerUserDefaultsTraces();

const ids = [
  'user-default:taxPolicyRegime',
  'user-default:projectionMode',
  'user-default:propertyGrowthAssumption',
  'user-default:fundingSourceByProperty',
];

for (const id of ids) {
  const t = resolveTrace(id)!;
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`Trace id:       ${t.id}`);
  console.log(`Label:          ${t.label}`);
  console.log(`Final value:    ${t.finalValue}`);
  console.log(`Source engine:  ${t.sourceEngine}`);
  console.log(`Data source:    ${t.dataSource}`);
  console.log(`Plain English:  ${t.plainEnglish}`);
  console.log(`Formula:        ${t.formula}`);
  console.log(`Expanded:       ${t.expanded}`);
  console.log(`Inputs:`);
  for (const i of t.inputs) {
    console.log(`  · ${i.label}: ${i.value}   ← ${i.source ?? ''}`);
  }
  console.log(`Assumptions:`);
  for (const a of t.assumptions) {
    console.log(`  · ${a.label}: ${a.value ?? ''}   ← ${a.source ?? ''}`);
  }
  console.log(`Applied to (included modules):`);
  for (const inc of t.included) {
    console.log(`  · ${inc.label} — ${inc.reason ?? ''}`);
  }
  console.log(`Notes:`);
  for (const n of t.notes ?? []) console.log(`  · ${n}`);
}
