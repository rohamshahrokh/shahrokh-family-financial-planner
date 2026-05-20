/**
 * Executive Overview — Projection Cleanup validation tests.
 *
 * Runs the Information Architecture contract for the duplicate-wealth-projection
 * cleanup pass:
 *   • Only ONE primary strategic visualization on Executive Overview (the
 *     promoted Strategic Wealth Projection / Monte Carlo P10·P50·P90 chart).
 *   • The richer analytical table is the SINGLE table — Accessible NW, Total
 *     NW, CAGR, Growth, Cash, Liabilities, Property equity, Stocks, Crypto,
 *     Super.
 *   • The prior duplicate Wealth Decision Center "WEALTH" tab (which
 *     re-rendered the Monte Carlo chart + compact projection table) is
 *     removed.
 *   • The compact P50 projection table is fully removed from source.
 *   • Recently restored layers are not regressed: smart assumptions topbar,
 *     compact journey hero, family mission card, Events tab inside WDC,
 *     current/planned debt separation, /risk alias route, 5.82% live PPOR
 *     rate.
 *
 * Pure Node validation — runs via:
 *   npx tsx script/test-executive-overview-projection-cleanup.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

let failures = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}
function section(name: string) {
  console.log(`\n— ${name}`);
}

const execSrc = readFileSync(resolve(repoRoot, 'client/src/components/ExecutiveDashboard.tsx'), 'utf8');
const dashSrc = readFileSync(resolve(repoRoot, 'client/src/pages/dashboard.tsx'), 'utf8');
const wdcSrc  = readFileSync(resolve(repoRoot, 'client/src/components/WealthDecisionCenter.tsx'), 'utf8');
const appSrc  = readFileSync(resolve(repoRoot, 'client/src/App.tsx'), 'utf8');

// ─── 1. Upper duplicate Future Wealth Path block removed ────────────────────
section('Upper "Future Wealth Path" block + compact P50 projection table removed');

assert(
  'Legacy "Future Wealth Path" header label no longer rendered on Executive Overview',
  !/>\s*Future Wealth Path\s*</.test(execSrc),
);
assert(
  'Compact P50 projection table data-testid is gone',
  !execSrc.includes('data-testid="trajectory-projection-table"'),
);
assert(
  'Compact projection-table panel data-testid is gone',
  !execSrc.includes('data-testid="canonical-trajectory-panel"'),
);
assert(
  'Compact projection-table expand toggle is gone',
  !execSrc.includes('data-testid="trajectory-expand-range"'),
);
assert(
  'No CompactProjectionTable JSX usage left',
  !/<CompactProjectionTable\b/.test(execSrc),
);

// ─── 2. Single promoted Strategic Wealth Projection chart ───────────────────
section('Exactly ONE primary strategic visualization promoted higher on the page');

const mcRenderCount = (execSrc.match(/<MonteCarloTrajectoryChart\b/g) ?? []).length;
assert(
  'MonteCarloTrajectoryChart is rendered exactly once on Executive Overview',
  mcRenderCount === 1,
  `found ${mcRenderCount}`,
);
const mcChartTestIdCount = (execSrc.match(/data-testid="monte-carlo-trajectory-chart"/g) ?? []).length;
assert(
  'Single monte-carlo-trajectory-chart test id on Executive Overview',
  mcChartTestIdCount === 1,
  `found ${mcChartTestIdCount}`,
);
assert(
  'Probabilistic Projection (Monte Carlo Adjusted) title test id present',
  execSrc.includes('data-testid="probabilistic-projection-title"'),
);
assert(
  'Deterministic Projection (Assumption-Based) title test id present',
  execSrc.includes('data-testid="deterministic-projection-title"'),
);
assert(
  'Reconciliation card title present',
  execSrc.includes('data-testid="reconciliation-card-title"'),
);
assert(
  'Probabilistic chart positioned BEFORE the Wealth Decision Center',
  execSrc.indexOf('<MonteCarloTrajectoryChart') <
    execSrc.search(/<WealthDecisionCenter\b/),
);
assert(
  'Probabilistic chart positioned AFTER the Hero Snapshot',
  execSrc.indexOf('<ExecutiveHeroSnapshot') <
    execSrc.indexOf('<MonteCarloTrajectoryChart'),
);

// ─── 3. Richer analytical table is the single high-value table ──────────────
section('Richer Wealth Strategy yearly table replaces the compact P50 table');

assert(
  'WealthProjectionTable rendered as the single analytical table',
  /<WealthProjectionTable\b/.test(execSrc) &&
    execSrc.includes('data-testid="wealth-projection-table-panel"') &&
    execSrc.includes('data-testid="wealth-projection-table"'),
);
const requiredColumns = [
  { id: 'col-accessible-nw',  label: 'Accessible NW' },
  { id: 'col-total-nw',       label: 'Total NW' },
  { id: 'col-cagr',           label: 'CAGR' },
  { id: 'col-growth',         label: 'Growth' },
  { id: 'col-cash',           label: 'Cash' },
  { id: 'col-liabilities',    label: 'Liabilities' },
  { id: 'col-property-equity',label: 'Property equity' },
  { id: 'col-stocks',         label: 'Stocks' },
  { id: 'col-crypto',         label: 'Crypto' },
  { id: 'col-super',          label: 'Super' },
];
for (const { id, label } of requiredColumns) {
  assert(
    `Richer table exposes column id "${id}" with label "${label}"`,
    execSrc.includes(`data-testid="${id}"`) && execSrc.includes(`>${label}<`),
  );
}
// Architecture rebuild: Deterministic projection now comes FIRST, then the
// Reconciliation card, then the Probabilistic (Monte Carlo) chart. This
// matches the new canonical contract: "deterministic and probabilistic
// projections separated properly".
assert(
  'Deterministic table positioned BEFORE the Probabilistic (Monte Carlo) chart',
  execSrc.indexOf('<WealthProjectionTable') <
    execSrc.indexOf('<MonteCarloTrajectoryChart'),
);
assert(
  'Reconciliation card sits between the deterministic and probabilistic sections',
  execSrc.indexOf('<WealthProjectionTable') < execSrc.indexOf('<ReconciliationCard') &&
    execSrc.indexOf('<ReconciliationCard') < execSrc.indexOf('<MonteCarloTrajectoryChart'),
);
assert(
  'Deterministic table positioned BEFORE the Wealth Decision Center',
  execSrc.indexOf('<WealthProjectionTable') <
    execSrc.search(/<WealthDecisionCenter\b/),
);

// ─── 4. Projection rows wired from the canonical engine (no fabrication) ────
section('Richer table sources rows from the canonical projection engine');

assert(
  'ExecutiveDashboardProps exposes a `projectionRows` field',
  /projectionRows\??:\s*WealthProjectionRow\[\]/.test(execSrc),
);
assert(
  'WealthProjectionRow shape declares all required columns',
  /accessibleNetWorth:\s*number/.test(execSrc) &&
    /totalNetWorth:\s*number/.test(execSrc) &&
    /cagrPct:\s*number/.test(execSrc) &&
    /growth:\s*number/.test(execSrc) &&
    /cash:\s*number/.test(execSrc) &&
    /liabilities:\s*number/.test(execSrc) &&
    /propertyEquity:\s*number/.test(execSrc) &&
    /stocks:\s*number/.test(execSrc) &&
    /crypto:\s*number/.test(execSrc) &&
    /superTotal:\s*number/.test(execSrc),
);
assert(
  'Dashboard maps `projection` (canonical engine) rows into projectionRows',
  /projectionRows:\s*\(projection\s*\?\?\s*\[\]\)\.map/.test(dashSrc),
);
assert(
  'Dashboard reuses canonical accessibleNetWorth / endNetWorth / cagr / growth fields',
  /accessibleNetWorth:\s*row\.accessibleNetWorth/.test(dashSrc) &&
    /totalNetWorth:\s*row\.endNetWorth/.test(dashSrc) &&
    /cagrPct:\s*row\.cagr/.test(dashSrc) &&
    /growth:\s*row\.growth/.test(dashSrc),
);

// ─── 5. WDC no longer duplicates the Monte Carlo + projection table ─────────
section('Wealth Decision Center "WEALTH" duplicate tab removed');

assert(
  'WDC tab keys no longer include WEALTH',
  !/'CASH'\s*\|\s*'EVENTS'\s*\|\s*'WEALTH'\s*\|\s*'RISK'/.test(wdcSrc) &&
    !/key:\s*'WEALTH'/.test(wdcSrc),
);
assert(
  'WDC TAB_DEFS lists exactly CASH · EVENTS · RISK (3 entries)',
  ((wdcSrc.match(/key:\s*'(CASH|EVENTS|RISK)'/g) ?? []).length === 3) &&
    !/key:\s*'WEALTH'/.test(wdcSrc),
);
assert(
  'WDC WEALTH tab panel is removed from the body',
  !/data-testid="wdc-panel-wealth"/.test(wdcSrc) &&
    !/tab === 'WEALTH'/.test(wdcSrc),
);
assert(
  'WDC props no longer accept renderMonteCarlo / renderProjectionTable slots',
  !/renderMonteCarlo:\s*\(\)\s*=>\s*React\.ReactNode/.test(wdcSrc) &&
    !/renderProjectionTable:\s*\(\)\s*=>\s*React\.ReactNode/.test(wdcSrc),
);
assert(
  'ExecutiveDashboard no longer passes renderMonteCarlo / renderProjectionTable to WDC',
  !/renderMonteCarlo=\{/.test(execSrc) &&
    !/renderProjectionTable=\{/.test(execSrc),
);

// ─── 6. Layout sequence — recent restored top layers preserved ──────────────
section('Top sequence preserved — assumptions chip → journey hero → mission card → cockpit');

const idxAssumptions = dashSrc.indexOf('data-testid="badge-smart-assumptions"');
const idxJourney     = dashSrc.indexOf('data-testid="dashboard-journey-header"');
const idxMission     = dashSrc.indexOf('data-testid="dashboard-family-mission-card"');
const idxExec        = dashSrc.indexOf('data-testid="dashboard-executive-section"');

assert(
  'Smart-assumptions chip is still positioned first',
  idxAssumptions > 0 && idxAssumptions < idxJourney,
);
assert(
  'Journey hero header is still positioned before the family mission card',
  idxJourney > 0 && idxJourney < idxMission,
);
assert(
  'Family mission card is still positioned before the Executive Overview cockpit',
  idxMission > 0 && idxMission < idxExec,
);

// ─── 7. WDC restored fixes not regressed ────────────────────────────────────
section('WDC Events tab + current/planned debt separation preserved');

assert(
  'WDC Events tab panel is still rendered',
  /data-testid="wdc-panel-events"/.test(wdcSrc),
);
assert(
  'WDC Events timeline test id still rendered',
  /data-testid="wdc-events-timeline"/.test(wdcSrc),
);
// Architecture rebuild: the WDC Risk tab no longer renders a current-debt
// summary card — that duplication has been removed. The current debt
// breakdown is still surfaced on the Today snapshot and Strategic Debt
// Monitor; the Risk tab now hosts the canonical visual risk surface
// (radar + stress matrix + fragility gauge) only.
assert(
  'WDC Risk tab no longer duplicates the current-debt summary card',
  !/data-testid="wdc-risk-current-debt"/.test(wdcSrc),
);
assert(
  'WDC Risk tab renders the canonical visual risk surface',
  /CanonicalRiskSurface/.test(wdcSrc) &&
    /data-testid="wdc-panel-risk"/.test(wdcSrc),
);
assert(
  'Dashboard still wires CURRENT debt breakdown to the cockpit',
  /currentDebt:\s*\{/.test(dashSrc) &&
    /pporMortgage:\s*safeNum\(snap\.mortgage\)/.test(dashSrc),
);
assert(
  'Dashboard still wires PLANNED debt to the cockpit (Events tab only)',
  /plannedDebt:\s*ipLoanBalancePlanned/.test(dashSrc),
);

// ─── 8. /risk alias route preserved ─────────────────────────────────────────
section('Route alias /risk → Risk Radar preserved');

assert(
  '/risk route alias is registered in App.tsx',
  /path="\/risk"/.test(appSrc) && /component=\{RiskRadarPage\}/.test(appSrc),
);

// ─── 9. Live PPOR mortgage rate (5.82%) still flows ─────────────────────────
section('Live PPOR mortgage rate (Today snapshot) preserved');

assert(
  'Dashboard still feeds snap.mortgage_rate into the cockpit livePporRate prop',
  /livePporRate:\s*snap\.mortgage_rate/.test(dashSrc),
);
assert(
  'Hero still consumes livePporRate as the live current rate caption',
  /livePporRate/.test(execSrc) && /liveRate/.test(execSrc),
);

// ─── 10. Layout order inside cockpit ────────────────────────────────────────
section('Cockpit sequence — Hero → Deterministic → Reconciliation → Probabilistic → WDC → Health → Action → Deep');

const order = [
  '<ExecutiveHeroSnapshot',
  '<WealthProjectionTable',
  '<ReconciliationCard',
  '<MonteCarloTrajectoryChart',
  '<WealthDecisionCenter',
  '<ExecutiveHealthStrip',
  '<ExecutiveActionQueue',
  '<DeepAnalysisCards',
];
for (let i = 1; i < order.length; i++) {
  const prev = execSrc.indexOf(order[i - 1]);
  const cur  = execSrc.indexOf(order[i]);
  assert(
    `Cockpit order: ${order[i - 1]} precedes ${order[i]}`,
    prev > 0 && cur > 0 && prev < cur,
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} failures`}`);
process.exit(failures === 0 ? 0 : 1);
