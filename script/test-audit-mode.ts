/**
 * Family Wealth Lab — Global Audit Mode / Calculation Trace test suite.
 *
 * Pure unit + static-grep tests (no DOM, no jsdom). Validates:
 *   1.  Registry behaviour (register/resolve/has/list/factory/reset)
 *   2.  Trace factories produce complete records with actual values
 *   3.  hashTraceInputs is deterministic + sensitive to order/value
 *   4.  Audit module surface: provider, hook, wrapper, panel, toggle
 *   5.  App.tsx mounts AuditModeProvider + CalculationTracePanel
 *   6.  Layout.tsx mounts AuditModeToggle in the header
 *   7.  ExecutiveDashboard wraps key metrics with AuditableMetric ids
 *   8.  ProjectionCardListMobile + CanonicalRiskSurface wrap their metrics
 *   9.  No engine math is duplicated in UI wrappers / trace factories
 *   10. Canonical engines (NW, wealth, risk, finance, tax) are untouched
 *
 * Run with:  tsx script/test-audit-mode.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  registerTrace, registerTraceFactory, resolveTrace, hasTrace,
  listTraceIds, unregisterTrace, __resetTraceRegistry,
} from '../client/src/lib/auditMode/auditRegistry';
import { hashTraceInputs, type CalculationTrace } from '../client/src/lib/auditMode/calculationTrace';
import {
  buildNetWorthTrace, buildMonthlySurplusTrace, buildFireNumberTrace,
  buildPropertyEquityTrace, buildCgtGrossGainTrace, buildProjectionRowTraces,
} from '../client/src/lib/auditMode/traceFactories';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' - ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n- ${n}`);
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

// 1 - Registry
section('Registry');
__resetTraceRegistry();
const base: CalculationTrace = {
  id: 't:a', label: 'A', finalValue: '$1', plainEnglish: 'a', formula: 'f', expanded: 'f = 1',
  inputs: [], assumptions: [], dataSource: 'd', sourceEngine: 'e', included: [], excluded: [],
  calculatedAt: '2026-01-01T00:00:00.000Z',
};
registerTrace(base);
assert('register + has', hasTrace('t:a'));
assert('resolve returns trace', resolveTrace('t:a')?.label === 'A');
assert('listTraceIds includes id', listTraceIds().includes('t:a'));
let calls = 0;
registerTraceFactory('t:b', () => { calls++; return { ...base, id: 't:b', label: 'B' }; });
assert('factory is lazy', calls === 0);
assert('factory resolves', resolveTrace('t:b')?.label === 'B');
assert('factory invoked once on first resolve', calls === 1);
resolveTrace('t:b');
assert('factory re-invoked on each resolve', calls === 2);
unregisterTrace('t:a');
assert('unregister removes', !hasTrace('t:a'));
assert('resolve returns null for missing', resolveTrace('missing') === null);
__resetTraceRegistry();
assert('reset clears all', listTraceIds().length === 0);

// 2 - Trace factories
section('Trace factories');
const nw = buildNetWorthTrace({
  netWorth: 1_000_000,
  components: {
    cashTotal: 250_000, superTotal: 200_000, ppor: 800_000, ips: 700_000,
    stocks: 100_000, crypto: 50_000, cars: 30_000, iranProperty: 20_000,
    otherAssets: 10_000, mortgage: 600_000, ipsLoans: 500_000, otherDebts: 60_000,
  },
  lastCalculatedAt: '2026-01-01T00:00:00.000Z',
});
const REQ: (keyof CalculationTrace)[] = [
  'id','label','finalValue','plainEnglish','formula','expanded',
  'inputs','assumptions','dataSource','sourceEngine','included','excluded','calculatedAt',
];
for (const f of REQ) assert(`NW trace has '${String(f)}'`, (nw as any)[f] !== undefined && (nw as any)[f] !== null);
assert('NW formula: Total Assets - Total Liabilities', /Total Assets[^]*Total Liabilities/.test(nw.formula));
assert('NW expanded substitutes actual values', /\$[\d.]+/.test(nw.expanded));
assert('NW includes decomposition lines', nw.included.length >= 3);
assert('NW excludes planned IP equity', nw.excluded.some(e => /planned/i.test(e.label)));
assert('NW sourceEngine references canonical', /canonical/i.test(nw.sourceEngine));

const surplus = buildMonthlySurplusTrace({
  monthlyIncome: 18_000, monthlyExpenses: 11_000, monthlyDebtService: 4_000,
  passiveIncome: 1_200, surplus: 5_000,
});
assert('Surplus formula matches required text',
  /Surplus[^]*Income[^]*Living Expenses[^]*Debt Repayments[^]*Investment Contributions/i.test(surplus.formula));
assert('Surplus expanded includes "= $5"', /= \$5/.test(surplus.expanded));

const fire = buildFireNumberTrace({ id: 'x:fire', label: 'FIRE Number', annualExpenses: 100_000, swrPct: 4 });
assert('FIRE formula: Annual Expenses / SWR', /Annual Expenses[^]*SWR/i.test(fire.formula));
assert('FIRE Number ~ $2.50M', /\$2\.50M/.test(String(fire.finalValue)));

const peq = buildPropertyEquityTrace({ id: 'x:peq', label: 'Property Equity', propertyValue: 1_200_000, loanBalance: 700_000 });
assert('Property Equity formula', /Property Value[^]*Loan Balance/i.test(peq.formula));
assert('Property Equity = $500K', /\$500K/.test(String(peq.finalValue)));

const cgt = buildCgtGrossGainTrace({ id: 'x:cgt', label: 'CGT Gross Gain', salePrice: 900_000, sellingCosts: 25_000, adjustedCostBase: 600_000 });
assert('CGT formula: Sale - Selling - ACB', /Sale Price[^]*Selling Costs[^]*Adjusted Cost Base/i.test(cgt.formula));
assert('CGT gain = $275K', /\$275K/.test(String(cgt.finalValue)));

const rows = buildProjectionRowTraces(
  [{
    year: 2030, accessibleNetWorth: 1_500_000, totalNetWorth: 2_000_000, cagrPct: 12.5,
    growth: 200_000, cash: 100_000, liabilities: 500_000, propertyEquity: 1_400_000,
    stocks: 200_000, crypto: 50_000, superTotal: 250_000,
  }],
  1_000_000,
  null,
);
const ids = rows.map(r => r.id);
assert('row -> Total NW trace', ids.includes('projection:total-nw:2030'));
assert('row -> CAGR trace', ids.includes('projection:cagr:2030'));
assert('row -> Growth trace', ids.includes('projection:growth:2030'));
assert('row -> Property Equity trace', ids.includes('projection:property-equity:2030'));
const cagrT = rows.find(r => r.id === 'projection:cagr:2030')!;
assert('CAGR canonical formula', /Final Value[^]*Starting Value[^]*1\s*\/\s*Years/i.test(cagrT.formula));

// 3 - hash
section('hashTraceInputs');
const h1 = hashTraceInputs([{ label: 'A', value: 1 }, { label: 'B', value: 2 }]);
const h2 = hashTraceInputs([{ label: 'A', value: 1 }, { label: 'B', value: 2 }]);
const h3 = hashTraceInputs([{ label: 'B', value: 2 }, { label: 'A', value: 1 }]);
const h4 = hashTraceInputs([{ label: 'A', value: 1 }, { label: 'B', value: 3 }]);
assert('deterministic', h1 === h2);
assert('order-sensitive', h1 !== h3);
assert('value-sensitive', h1 !== h4);

// 4 - Module surface
section('Audit module surface');
const ctxSrc = read('client/src/lib/auditMode/AuditModeContext.tsx');
assert('AuditModeProvider exported', /export\s+function\s+AuditModeProvider/.test(ctxSrc));
assert('useAuditMode exported', /export\s+function\s+useAuditMode/.test(ctxSrc));
assert('context: auditMode + openTrace + closeTrace + toggleAuditMode',
  /auditMode:/.test(ctxSrc) && /openTrace/.test(ctxSrc) && /closeTrace/.test(ctxSrc) && /toggleAuditMode/.test(ctxSrc));

const amSrc = read('client/src/components/auditMode/AuditableMetric.tsx');
assert('AuditableMetric exported', /export\s+const\s+AuditableMetric/.test(amSrc));
assert('AuditableMetric renders <span> when off', /data-audit-mode=\"off\"/.test(amSrc));
assert('AuditableMetric renders <button> when on', /<button[\s\S]*type=\"button\"/.test(amSrc));
assert('AuditableMetric has no click indicator when off', /if\s*\(\s*!auditMode\s*\)/.test(amSrc));

const panelSrc = read('client/src/components/auditMode/CalculationTracePanel.tsx');
const PANEL_SECTIONS = [
  'trace-final-value','trace-section-plain-english','trace-section-formula',
  'trace-section-expanded','trace-section-inputs','trace-section-assumptions',
  'trace-section-included','trace-section-excluded','trace-section-provenance',
];
for (const s of PANEL_SECTIONS) assert(`Trace Panel renders '${s}'`, panelSrc.includes(s));

const togSrc = read('client/src/components/auditMode/AuditModeToggle.tsx');
assert('Toggle has button-audit-mode-toggle testid', /data-testid=\"button-audit-mode-toggle\"/.test(togSrc));
assert('Toggle label mentions Audit', /Audit/.test(togSrc));

// 5 - App wiring
section('Global wiring');
const layoutSrc = read('client/src/components/Layout.tsx');
assert('Layout imports AuditModeToggle', /AuditModeToggle/.test(layoutSrc));
assert('Layout renders <AuditModeToggle />', /<AuditModeToggle\s*\/>/.test(layoutSrc));

const appSrc = read('client/src/App.tsx');
assert('App imports AuditModeProvider', /AuditModeProvider/.test(appSrc));
assert('App imports CalculationTracePanel', /CalculationTracePanel/.test(appSrc));
assert('Provider mounted exactly once', (appSrc.match(/<AuditModeProvider/g) ?? []).length === 1);
assert('Panel mounted exactly once', (appSrc.match(/<CalculationTracePanel\s*\/>/g) ?? []).length === 1);

// 6 - Dashboard wiring
section('Dashboard hero + projection wiring');
const dashSrc = read('client/src/components/ExecutiveDashboard.tsx');
for (const id of ['dashboard:net-worth','dashboard:monthly-surplus','dashboard:risk-state','dashboard:fire-timeline']) {
  assert(`Hero metric wired: ${id}`, dashSrc.includes(`traceId="${id}"`));
}
assert('Wealth-layer values wrapped', /traceId=\{`dashboard:wealth-layers:\$\{layer\.id\}`\}/.test(dashSrc));
assert('Projection Total NW wrapped per row', /traceId=\{`projection:total-nw:\$\{row\.year\}`\}/.test(dashSrc));
assert('Projection CAGR wrapped per row', /traceId=\{`projection:cagr:\$\{row\.year\}`\}/.test(dashSrc));
assert('Projection Growth wrapped per row', /traceId=\{`projection:growth:\$\{row\.year\}`\}/.test(dashSrc));
assert('Overall projection CAGR wrapped', /traceId=\"projection:cagr:overall\"/.test(dashSrc));
assert('Dashboard registers traces via registerTrace', /registerTrace\(/.test(dashSrc));

const mobSrc = read('client/src/components/ProjectionCardListMobile.tsx');
assert('Mobile cards import AuditableMetric', /AuditableMetric/.test(mobSrc));
assert('Mobile cards wrap Total NW', /traceId=\{`projection:total-nw:\$\{row\.year\}`\}/.test(mobSrc));
assert('Mobile cards wrap CAGR', /traceId=\{`projection:cagr:\$\{row\.year\}`\}/.test(mobSrc));

const riskSrc = read('client/src/components/CanonicalRiskSurface.tsx');
assert('Risk surface imports AuditableMetric', /AuditableMetric/.test(riskSrc));
assert('Risk surface wraps each axis score', /traceId=\{`risk:axis:\$\{p\.axis\.toLowerCase\(\)/.test(riskSrc));
assert('Risk surface wraps FIRE fragility', /traceId=\"risk:fire-fragility\"/.test(riskSrc));

// 7 - No duplication / engines untouched
section('No engine duplication in UI; canonical engines untouched');
const factSrc = read('client/src/lib/auditMode/traceFactories.ts');
assert('traceFactories imports CanonicalNetWorthResult as TYPE',
  /import\s+type\s+\{[^}]*CanonicalNetWorthResult/.test(factSrc));
assert('traceFactories imports WealthLayers as TYPE',
  /import\s+type\s+\{[^}]*WealthLayers/.test(factSrc));
assert('traceFactories does NOT call computeCanonicalNetWorth/computeWealthLayers',
  !/computeCanonicalNetWorth\(|computeWealthLayers\(/.test(factSrc));
assert('traceFactories does NOT call buildCanonicalRiskSurface/projectNetWorth',
  !/buildCanonicalRiskSurface\(|projectNetWorth\(/.test(factSrc));
for (const f of ['client/src/lib/canonicalNetWorth.ts','client/src/lib/canonicalWealth.ts',
                 'client/src/lib/canonicalRiskSurface.ts','client/src/lib/finance.ts',
                 'client/src/lib/australianTax.ts']) {
  assert(`${f} does not import auditMode`, !/auditMode/.test(read(f)));
}

console.log(`\n${failures === 0 ? 'OK' : 'FAIL'} Audit Mode tests: ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
