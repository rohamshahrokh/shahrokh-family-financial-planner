/**
 * test-fwl-restore-events-debt-logic.ts
 *
 * Validation suite for the FWL_RESTORE_EVENTS_AND_FIX_DEBT_LOGIC pass:
 *
 *   1. Executive Overview section order is:
 *        Hero · Future Wealth Path · Projection Table · Wealth Decision Center
 *        · Financial Health · Action Queue · Deep Analysis Cards
 *   2. Wealth Decision Center renders the four canonical tabs CASH / EVENTS /
 *      WEALTH / RISK, plus a Deposit Power breakdown table with the canonical
 *      rows and an Events timeline that renders roadmap items.
 *   3. CURRENT debt logic excludes planned IP loans and forecast leverage.
 *      The recommendation engine partitions CURRENT vs PLANNED debt and the
 *      Strategic Debt Monitor never sums planned/forecast records.
 *   4. Best Move / Today snapshot uses the live 5.82% PPOR rate (no
 *      6.24/6.25% blended forecast rate leaks into the Today snapshot).
 *   5. App.tsx registers /risk-radar, /tax, /tax-alpha, /tax-strategy routes
 *      so the Risk Radar / Tax Strategy cards never produce router errors.
 *
 * Pure source-level checks — no DOM, no Supabase.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');

let pass = 0, fail = 0;
function assert(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++; }
}
function section(name: string) { console.log(`\n— ${name}`); }

const execSrc = read('client/src/components/ExecutiveDashboard.tsx');
const wdcSrc = read('client/src/components/WealthDecisionCenter.tsx');
const appSrc = read('client/src/App.tsx');
const engineSrc = read('client/src/lib/recommendationEngine/engine.ts');
const debtClassSrc = read('client/src/lib/recommendationEngine/debtClassification.ts');
const bestMoveSrc = read('client/src/lib/bestMoveEngine.ts');
const dashSrc = read('client/src/pages/dashboard.tsx');

// ─── 1. Executive Overview section order ─────────────────────────────────────
section('Executive Overview — final section order');

// Order is asserted by reading the final composition block in ExecutiveDashboard.tsx
// (the `return ( <div ... ) part of the default export). Each section renders
// a known component name in a strict order: Hero · MonteCarloTrajectoryChart ·
// WealthProjectionTable (richer analytical table, post Projection Cleanup) ·
// WealthDecisionCenter · ExecutiveHealthStrip · ExecutiveActionQueue ·
// DeepAnalysisCards.
// Canonical dashboard rebuild: Deterministic projection now precedes the
// Probabilistic (Monte Carlo) chart, with a Reconciliation card between.
const orderedRenders = [
  '<ExecutiveHeroSnapshot',
  '<WealthProjectionTable',
  '<ReconciliationCard',
  '<MonteCarloTrajectoryChart',
  '<WealthDecisionCenter',
  '<ExecutiveHealthStrip',
  '<ExecutiveActionQueue',
  '<DeepAnalysisCards',
];
// Look only at the default-export composition (after the line `return ( <div`)
const composition = execSrc.slice(execSrc.lastIndexOf('return ('));
const positions = orderedRenders.map(name => composition.indexOf(name));
assert(
  'All seven cockpit sections are present in the default-export composition',
  positions.every(p => p > -1),
  `missing: ${orderedRenders.filter((_, i) => positions[i] < 0).join(', ')}`,
);
let ordered = true;
for (let i = 1; i < positions.length; i++) {
  if (positions[i] < positions[i - 1]) { ordered = false; break; }
}
assert(
  'Section order: Hero → Deterministic → Reconciliation → Probabilistic → WDC → Health → Action → Deep',
  ordered,
);

// Canonical projection split: Deterministic (assumption-based) and
// Probabilistic (Monte Carlo Adjusted) are now separate, reconciled visuals.
assert(
  'Probabilistic Projection (Monte Carlo Adjusted) label is present',
  /Probabilistic Projection \(Monte Carlo Adjusted\)/.test(execSrc),
);
assert(
  'Deterministic Projection (Assumption-Based) label is present',
  /Deterministic Projection \(Assumption-Based\)/.test(execSrc),
);
assert(
  'Plan Execution Capacity label preserved (inside Wealth Decision Center CASH tab)',
  /Plan Execution Capacity/.test(execSrc),
);

// ─── 2. Wealth Decision Center — operational tabs + breakdown + events ──────
section('Wealth Decision Center — tabs / breakdown table / events timeline');

// After the Executive Overview Projection Cleanup, the WDC keeps the three
// operational tabs (CASH · EVENTS · RISK). The old WEALTH tab — which
// re-rendered the Monte Carlo chart + compact projection table — is removed
// because the promoted Strategic Wealth Projection above is now the single
// primary strategic surface.
const tabIds = ['CASH', 'EVENTS', 'RISK'];
assert(
  'WDC uses a template-literal data-testid for each tab (wdc-tab-${t.key})',
  /data-testid=\{`wdc-tab-\$\{t\.key\}`\}/.test(wdcSrc),
);
for (const t of tabIds) {
  // Each tab must be declared in the TAB_DEFS table so it renders.
  assert(
    `WDC tab ${t} is declared in TAB_DEFS`,
    new RegExp(`key:\\s*'${t}'`).test(wdcSrc),
  );
}
for (const t of tabIds) {
  assert(
    `WDC renders panel for ${t}`,
    new RegExp(`data-testid="wdc-panel-${t.toLowerCase()}"`).test(wdcSrc),
  );
}

const breakdownRows = [
  'Cash + Offset',
  'PPOR Usable Equity',
  'IP Usable Equity',
  'Gross Total',
  'Emergency Buffer',
  'Total Deposit Power',
];
for (const row of breakdownRows) {
  assert(
    `Deposit Power breakdown row "${row}" present`,
    wdcSrc.includes(row),
  );
}
assert(
  'Events timeline renders roadmap items',
  /data-testid="wdc-events-timeline"/.test(wdcSrc) &&
    /data-testid="wdc-events-list"/.test(wdcSrc) &&
    /data-testid=\{`wdc-event-\$\{e\.id\}`/.test(wdcSrc.replace(/\s+/g, ' ')),
);
assert(
  'Events timeline supports planned / active / completed status',
  /STATUS_CFG/.test(wdcSrc) && /planned/.test(wdcSrc) && /active/.test(wdcSrc) && /completed/.test(wdcSrc),
);

// Plan Execution Capacity chart controls preserved inside CASH tab (sourced
// from the existing DepositPowerTrajectoryPanel — not duplicated).
assert(
  'WDC reuses DepositPowerTrajectoryPanel for the CASH tab chart',
  execSrc.includes('renderDepositPowerChart={() => <DepositPowerTrajectoryPanel'),
);

// ─── 3. Current debt logic — strict CURRENT vs PLANNED partition ────────────
section('Current debt logic — CURRENT excludes planned / forecast leverage');

assert(
  'debtClassification.ts exposes isPlannedDebt() helper',
  /export function isPlannedDebt\(/.test(debtClassSrc),
);
assert(
  'debtClassification.ts exposes partitionCurrentVsPlanned() helper',
  /export function partitionCurrentVsPlanned\(/.test(debtClassSrc),
);
assert(
  'debtClassification.ts exposes classifyCurrentDebtPortfolio() helper',
  /export function classifyCurrentDebtPortfolio\(/.test(debtClassSrc),
);
assert(
  'engine.ts uses classifyCurrentDebtPortfolio (not raw classifyDebtPortfolio) to build Best Move portfolio',
  /classifyCurrentDebtPortfolio\(records\)/.test(engineSrc),
);
assert(
  'engine.ts deduplicates s.mortgage when debtPortfolio already carries a mortgage line',
  /portfolioCarriesMortgage/.test(engineSrc),
);
assert(
  'fromDebtPrefsDebts adapter preserves planned/settlementDateISO markers',
  /planned:.*d\.planned/.test(read('client/src/lib/recommendationEngine/adapters.ts')),
);
assert(
  'Dashboard exposes currentDebt prop computed from settled liabilities only',
  /currentDebt:\s*\{[\s\S]*pporMortgage[\s\S]*settledIpLoans[\s\S]*otherDebts[\s\S]*total/.test(dashSrc),
);
assert(
  'Dashboard exposes plannedDebt prop separately — never folded into currentDebt',
  /plannedDebt:\s*ipLoanBalancePlanned/.test(dashSrc),
);
assert(
  'Wealth Decision Center surfaces planned debt only in the Events tab',
  /wdc-events-planned-debt-banner/.test(wdcSrc),
);
// Canonical dashboard rebuild: the WDC Risk tab no longer renders a duplicate
// current-debt summary card. Risk is now the single canonical visual surface
// (radar + stress + fragility); the current-debt total is still surfaced on
// the Today snapshot and Strategic Debt Monitor.
assert(
  'WDC Risk tab no longer duplicates the current-debt summary card',
  !/wdc-risk-current-debt-total/.test(wdcSrc),
);

// Defensive: the literal "$2.40M" must NOT be hard-coded anywhere as a debt label.
const forbiddenDebtStrings = ['$2.40M', '2,400,000', '2400000'];
for (const f of forbiddenDebtStrings) {
  assert(
    `No hard-coded "${f}" current-debt artefact in cockpit / WDC`,
    !execSrc.includes(f) && !wdcSrc.includes(f),
  );
}

// ─── 4. Live 5.82% PPOR rate — no 6.24/6.25 forecast leak ───────────────────
section('Mortgage rate — live 5.82%, no forecast/blended leak in Today snapshot');

assert(
  'Best Move engine default rate is the live 5.82% (decimal 0.0582)',
  /mortgageRate:\s*cfg\.mortgageRate\s*\?\?\s*0\.0582/.test(bestMoveSrc),
);
assert(
  'Best Move ledger reads snap.mortgage_rate (live) when available',
  /snap\.mortgage_rate[\s\S]{0,400}return live/.test(bestMoveSrc),
);
assert(
  'bestMoveBridge default rate updated to live 5.82%',
  /mortgageRate:\s*0\.0582/.test(read('client/src/lib/recommendationEngine/bestMoveBridge.ts')),
);
// Today snapshot caption uses livePporRate (= snap.mortgage_rate). The legacy
// blended forecast rates 6.24% and 6.25% must NOT appear in the cockpit /
// WDC / Best Move ledger anywhere they would be presented as the live rate.
assert(
  'Today snapshot uses snap.mortgage_rate (livePporRate) — not a blended forecast',
  /livePporRate:\s*snap\.mortgage_rate/.test(dashSrc),
);
// The cockpit source must not declare a hard-coded forecast rate as the
// today value. (6.5 still appears in the dashboard as a fallback for older
// equity / mortgage repayment maths — that is OK because it is never shown
// as the live rate. We only assert it on the cockpit + WDC + Best Move.)
const noForecastInTodaySurfaces = !/6\.24|6\.25/.test(execSrc + wdcSrc);
assert(
  'No 6.24/6.25% forecast/blended rate leaks into the Executive Overview / WDC',
  noForecastInTodaySurfaces,
);

// ─── 5. Router — Risk Radar / Tax / Tax Alpha / Tax Strategy registered ─────
section('Routes — Risk Radar / Tax / Tax Alpha / Tax Strategy never produce router errors');

const routePaths = [
  { path: '/risk',       name: 'Risk short alias' },
  { path: '/risk-radar', name: 'Risk Radar' },
  { path: '/tax',        name: 'Tax' },
  { path: '/tax-alpha',  name: 'Tax Alpha' },
  { path: '/tax-strategy', name: 'Tax Strategy alias' },
];
for (const r of routePaths) {
  assert(
    `App.tsx registers ${r.name} route ${r.path}`,
    new RegExp(`<Route path="${r.path.replace(/[/-]/g, m => '\\' + m)}">`).test(appSrc),
  );
}
// The /risk short alias must resolve to the same RiskRadarPage component as
// /risk-radar so QA cannot land on the 404 page by typing the short URL.
assert(
  '/risk alias targets RiskRadarPage (same component as /risk-radar)',
  /<Route path="\/risk">\s*<ProtectedRoute component=\{RiskRadarPage\}/.test(appSrc),
);
// The four Deep Analysis cards must point to LIVE routes (no 404 placeholders).
const cardRoutes = ['/ai-forecast-engine', '/risk-radar', '/decision', '/tax-alpha'];
for (const r of cardRoutes) {
  assert(
    `Deep Analysis card target ${r} is wired through ExecutiveDashboard`,
    execSrc.includes(`href: '${r}'`),
  );
  assert(
    `Card target ${r} resolves to a registered route in App.tsx`,
    new RegExp(`<Route path="${r.replace(/[/-]/g, m => '\\' + m)}">`).test(appSrc),
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✓ all checks passed' : `✗ ${fail} failures`} (${pass} passed)`);
if (fail > 0) process.exit(1);
