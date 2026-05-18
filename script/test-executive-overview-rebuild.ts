/**
 * Executive Overview Rebuild V2 — validation tests.
 *
 * Pure Node validation suite — runs with:
 *   npx tsx script/test-executive-overview-rebuild.ts
 *
 * Asserts the contract of the Executive Overview rebuild without requiring
 * a DOM. The rebuild replaces the prior Phase-7 Executive Dashboard
 * (Header + Daily Briefing + Strategic Priorities + 6-metric Health Strip
 * + Action Queue) with a tighter four-section IA:
 *
 *   1. ExecutiveHeroSnapshot      — Net Worth, Surplus, Risk, FIRE + 1 Best Move
 *   2. CanonicalTrajectoryPanel   — Monte Carlo P50 + compact P10/P50/P90 table
 *   3. ExecutiveHealthStrip       — exactly 4 metrics (liquidity, leverage,
 *                                    cashflow, fire-progress)
 *   4. ExecutiveActionQueue       — maximum 3 actionable items
 *
 * Contracts validated:
 *   • Only one Best Move surface on Executive Overview (no duplicated
 *     recommendation systems).
 *   • Health Strip is exactly 4 canonical metrics — NOT 6 like the prior
 *     iteration (no survivability / runway / debt-pressure on homepage).
 *   • Trajectory uses Monte Carlo P50; deterministic year10NW is NEVER
 *     rendered as the primary trajectory.
 *   • Action Queue caps at 3 items.
 *   • The MC projection table on the homepage shows Year, P50, Confidence
 *     Range as default columns; P10/P90 are behind an expand control.
 *   • Deep modules (FinancialOSCentre, FamilyOfficeMode, FutureWorldsPanel,
 *     ROI Action Table, Net Worth Reconciliation, Ledger Audit, deterministic
 *     baseline, deep MC Wealth Projection block, Wealth Decision Center)
 *     no longer render on the dashboard homepage.
 *   • Every Executive Overview metric has a global MetricExplainer tooltip
 *     (no browser-native `title="..."` tooltips on key metric chrome).
 *   • The required new tooltip ids exist in the metric explanation registry.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMetricExplanation } from '../client/src/lib/metricExplanations';

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

const execSrc = readFileSync(
  resolve(repoRoot, 'client/src/components/ExecutiveDashboard.tsx'),
  'utf8',
);
const dashSrc = readFileSync(
  resolve(repoRoot, 'client/src/pages/dashboard.tsx'),
  'utf8',
);

// ─── 1. Information Architecture — four sections only ────────────────────────
section('Executive Overview — four-section IA');

assert(
  'ExecutiveHeroSnapshot is rendered',
  execSrc.includes('data-testid="executive-hero-snapshot"'),
);
assert(
  'CanonicalTrajectoryPanel is rendered',
  execSrc.includes('data-testid="canonical-trajectory-panel"'),
);
assert(
  'ExecutiveHealthStrip is rendered',
  execSrc.includes('data-testid="executive-health-strip"'),
);
assert(
  'ExecutiveActionQueue is rendered',
  execSrc.includes('data-testid="executive-action-queue"'),
);

// Old phase-7 sections must be removed — they violated the new IA.
assert(
  'Daily Briefing section is no longer on the Executive Overview',
  !execSrc.includes('data-testid="daily-briefing"'),
);
assert(
  'Strategic Priorities section is no longer on the Executive Overview',
  !execSrc.includes('data-testid="strategic-priorities"'),
);

// Single Best Move surface — no duplicated recommendation systems.
const bestMoveSurfaces = (execSrc.match(/data-testid="hero-best-move"/g) ?? []).length;
assert(
  'Exactly one Best Move surface on Executive Overview',
  bestMoveSurfaces === 1,
  `found ${bestMoveSurfaces}`,
);

// ─── 2. Hero — exactly the essential orientation metrics ─────────────────────
section('ExecutiveHeroSnapshot — essential signals only');

assert('Hero shows Net Worth metric',         execSrc.includes('Net Worth'));
assert('Hero shows Monthly Surplus metric',    execSrc.includes('Monthly Surplus'));
assert('Hero shows Risk State metric',         execSrc.includes('Risk State'));
assert('Hero shows FIRE Timeline metric',      execSrc.includes('FIRE Timeline'));
assert(
  'Hero exposes a primary Best Move CTA',
  execSrc.includes('data-testid="hero-best-move-cta"') ||
    execSrc.includes('data-testid="hero-best-move-title"'),
);

// The hero must NOT carry the prior macro regime / signal-coverage strip —
// those were narrative overload, not orientation signals.
assert(
  'Hero no longer shows Macro Regime tile',
  !/Macro Regime/.test(execSrc),
);
assert(
  'Hero no longer references signalCoverage',
  !/signalCoverage/.test(execSrc),
);

// ─── 3. Trajectory — Monte Carlo P50 only ────────────────────────────────────
section('CanonicalTrajectoryPanel — canonical wealth trajectory');

assert(
  'Trajectory references Monte Carlo P50 as primary',
  execSrc.includes('data-testid="trajectory-p50-value"') &&
    /P50.*?median|median.*?P50/i.test(execSrc),
);
assert(
  'Trajectory renders neutral pending state when MC unavailable',
  execSrc.includes('data-testid="trajectory-pending"') &&
    execSrc.includes('Monte Carlo pending'),
);
assert(
  'Trajectory does NOT render deterministic year10NW as the official trajectory',
  !/data-testid="trajectory-deterministic"/.test(execSrc),
);

// Compact projection table — Year, P50, Confidence Range by default.
assert(
  'Projection table data-testid is present',
  execSrc.includes('data-testid="trajectory-projection-table"'),
);
assert(
  'Projection table has a P50 column header',
  /P50\s*\(median\)|P50 — most-likely|P50 \(median\)/i.test(execSrc),
);
assert(
  'Projection table has a Confidence Range column header',
  /Confidence Range/.test(execSrc),
);
assert(
  'P10 / P90 columns are hidden behind an expand toggle',
  execSrc.includes('data-testid="trajectory-expand-range"') &&
    /Show P10 \/ P90 columns|Hide P10 \/ P90 columns/.test(execSrc),
);

// No deep diagnostics on the projection table (key-risk column, audit copy).
assert(
  'Projection table no longer shows the "Key risk" audit column',
  !/Key risk\b/.test(execSrc),
);

// ─── 4. Health Strip — exactly four canonical metrics ────────────────────────
section('ExecutiveHealthStrip — exactly four metrics');

const healthIds = ['liquidity', 'leverage', 'cashflow-resilience', 'fire-progress'];
for (const id of healthIds) {
  // The data-testid is a template string `health-${ind.metricId}` in source —
  // verify the metric id is wired into the indicators array.
  assert(
    `Health strip includes "${id}"`,
    new RegExp(`metricId:\\s*'${id}'`).test(execSrc),
  );
}

// Old six-metric health strip — survivability, runway, debt-pressure — must
// no longer appear on the Executive Overview.
const removedHealthIds = ['survivability', 'runway', 'debt-pressure'];
for (const id of removedHealthIds) {
  assert(
    `Health strip no longer shows "${id}"`,
    !execSrc.includes(`data-testid="health-${id}"`),
  );
}

// ─── 5. Action Queue — capped at 3 ───────────────────────────────────────────
section('ExecutiveActionQueue — maximum 3 actions');

assert(
  'Action Queue slices to 3 implementation steps (not 4)',
  /implementationSteps\.slice\(0,\s*3\)/.test(execSrc),
);
assert(
  'Action Queue exposes action-queue-step-* test ids',
  /data-testid=\{`action-queue-step-\$\{i\}`\}/.test(execSrc),
);
assert(
  'Action Queue does NOT render a 4th step',
  !execSrc.includes('action-queue-step-3'),
);

// ─── 6. Dashboard homepage — deep modules removed ────────────────────────────
section('Dashboard homepage — deep modules removed from render path');

const deepModuleSignals = [
  { name: 'FinancialOSCentre',         pattern: /<FinancialOSCentre\s*\/?>/ },
  { name: 'FamilyOfficeMode',          pattern: /<FamilyOfficeMode\s*\/?>/ },
  { name: 'FutureWorldsPanel',         pattern: /<FutureWorldsPanel\s*\/?>/ },
  { name: 'ActionCentre',              pattern: /<ActionCentre\s*\/?>/ },
  { name: 'BestMoveCard',              pattern: /<BestMoveCard\s*\/?>/ },
  { name: 'DepositPowerCard',          pattern: /<DepositPowerCard[^/]*\/?>/ },
  { name: 'FIREPathCard',              pattern: /<FIREPathCard\s*\/?>/ },
  { name: 'PortfolioLiveReturn',       pattern: /<PortfolioLiveReturn\s*\/?>/ },
  { name: 'DeepDiveSection accordion', pattern: /<DeepDiveSection/ },
  { name: 'AIInsightsCard module',     pattern: /<AIInsightsCard\b/ },
  { name: 'Ledger Audit section',      pattern: /db-section-ledger/ },
  { name: 'ROI Action Table',          pattern: /ROI Action Table/ },
  { name: 'Net Worth Reconciliation',  pattern: /Net Worth Reconciliation/ },
  { name: 'Wealth Decision Center',    pattern: /Wealth Decision Center/ },
  { name: 'Deterministic baseline table', pattern: /Deterministic baseline \(advanced\)/ },
  { name: 'Canonical MC Wealth Projection homepage block', pattern: /db-section-monte-carlo/ },
  // Visual-QA blocker fixes — the duplicate welcome / KPI / journey stack
  // must no longer render on the homepage.
  { name: 'WealthFlowBanner journey header', pattern: /<WealthFlowBanner\s*\/?>/ },
  { name: 'Welcome / family-identity card',  pattern: /Welcome Back/ },
  { name: 'Estimated Net Worth duplicate card', pattern: /Estimated Net Worth/ },
  { name: 'KpiCard render (MONTHLY SURPLUS / TOTAL INVESTMENTS / etc.)', pattern: /<KpiCard\b/ },
  { name: 'Accessible Wealth / Locked Retirement Wealth strip', pattern: /Accessible Wealth/ },
  { name: 'Locked Retirement Wealth tile',  pattern: /Locked Retirement Wealth/ },
  { name: 'Wealth Health Cards strip',      pattern: /WEALTH HEALTH CARDS/ },
  { name: 'Alerts / quick-stats KPI strip', pattern: /Cash After Bills/ },
];
for (const { name, pattern } of deepModuleSignals) {
  assert(`${name} no longer renders on the dashboard homepage`, !pattern.test(dashSrc));
}

// Replacement strip must exist so the deep modules remain reachable.
assert(
  'Dashboard exposes an Explore deeper-analysis strip',
  dashSrc.includes('data-testid="executive-explore-strip"'),
);
// And the strip must be slim subordinate nav, not a content module.
assert(
  'Explore strip is rendered as a <nav> element (slim subordinate nav)',
  /<nav[^>]*data-testid="executive-explore-strip"/.test(dashSrc),
);
assert(
  'Explore strip exposes per-link test ids',
  /data-testid=\{`explore-link-/.test(dashSrc) ||
    /data-testid="explore-link-forecast"/.test(dashSrc),
);
assert(
  'Explore strip does NOT carry "module" header / body copy',
  !/cockpit stays calm/.test(dashSrc) &&
    !/Every deep view lives on its own page/.test(dashSrc),
);

// ─── 7. Homepage flow — cockpit-only ────────────────────────────────────────
section('Homepage flow — Smart-assumptions chip → Executive cockpit → Explore');

assert(
  'Dashboard renders <ExecutiveDashboard …> exactly once',
  (dashSrc.match(/<ExecutiveDashboard\b/g) ?? []).length === 1,
);

// The homepage shows the assumptions chip first, then the Executive Overview
// cockpit, then the Explore strip — no extra content between them.
const idxAssumptions = dashSrc.indexOf('data-testid="badge-smart-assumptions"');
const idxExec = dashSrc.indexOf('data-testid="dashboard-executive-section"');
const idxExplore = dashSrc.indexOf('data-testid="executive-explore-strip"');
assert(
  'Smart-assumptions chip is positioned before the Executive cockpit',
  idxAssumptions > 0 && idxExec > idxAssumptions,
);
assert(
  'Executive cockpit is positioned before the Explore strip',
  idxExec > 0 && idxExplore > idxExec,
);

// ─── 7b. Exactly one Net Worth / Monthly Surplus surface ────────────────────
section('No duplicate Net Worth / Monthly Surplus surfaces on the homepage');

// Strip comments before counting label occurrences so source-level comments
// (e.g. `// MONTHLY SURPLUS — derivation`) don't leak into the UI label
// count. The cockpit's hero owns these labels — they must appear once each
// in ExecutiveDashboard and zero times as a UI label in dashboard.tsx.
function stripJsComments(s: string): string {
  // Remove /* … */ blocks then //... line comments.
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const dashStripped = stripJsComments(dashSrc);
const execStripped = stripJsComments(execSrc);

assert(
  'Dashboard JSX no longer carries a "Net Worth" UI label',
  !/Net Worth/.test(dashStripped),
);
assert(
  'Dashboard JSX no longer carries a "Monthly Surplus" UI label',
  !/Monthly Surplus/i.test(dashStripped),
);

const netWorthInExec = (execStripped.match(/Net Worth/g) ?? []).length;
const surplusInExec = (execStripped.match(/Monthly Surplus/g) ?? []).length;
assert(
  'Exactly one "Net Worth" surface in the Executive Overview source',
  netWorthInExec === 1,
  `found ${netWorthInExec}`,
);
assert(
  'Exactly one "Monthly Surplus" surface in the Executive Overview source',
  surplusInExec === 1,
  `found ${surplusInExec}`,
);

// ─── 8. Canonical data wiring — engines, not UI math ─────────────────────────
section('Canonical data wiring — single source of truth');

assert(
  'Executive uses the canonical Monte Carlo trajectoryP50 prop',
  execSrc.includes('trajectoryP50') && execSrc.includes('monteCarloFanData'),
);
assert(
  'Dashboard passes monteCarloFanData to ExecutiveDashboard',
  /monteCarloFanData:\s*monteCarloResult\?\.fan_data/.test(dashSrc),
);
assert(
  'Dashboard passes monteCarloSimulations to ExecutiveDashboard',
  /monteCarloSimulations:\s*monteCarloResult\?\.simulations/.test(dashSrc),
);
assert(
  'Recommendation engine is the single Best Move source',
  /computeUnifiedBestMove/.test(execSrc),
);

// No parallel deterministic forecast wiring — deterministic year10NW remains
// in the props only as a compatibility shim, but is never rendered as the
// primary trajectory.
assert(
  'No deterministic trajectory rendering anywhere in Executive',
  !/year10NW.*?primary|primary.*?year10NW/i.test(execSrc),
);

// ─── 9. Explainability — every essential metric has a global tooltip ─────────
section('Global tooltip explainability');

// Confirm the registry holds the required ids — we will rely on the global
// MetricExplainer component to render the popup for each.
const requiredTooltipIds = [
  'net-worth-reconciliation',
  'dca-recommendation',
  'risk-state',
  'fire-progress',
  'monte-carlo-probability',
  'p10-p50-p90',
  'liquidity',
  'leverage',
  'cashflow-resilience',
  'best-move',
];
for (const id of requiredTooltipIds) {
  assert(`Metric registry has "${id}"`, !!getMetricExplanation(id));
}

assert(
  'Every Hero metric uses MetricExplainer (not native title=)',
  /MetricExplainer metricId="net-worth-reconciliation"/.test(execSrc) &&
    /MetricExplainer metricId="dca-recommendation"/.test(execSrc) &&
    /MetricExplainer\s+metricId="risk-state"/.test(execSrc) &&
    /MetricExplainer metricId="fire-progress"/.test(execSrc),
);
assert(
  'Trajectory tooltip uses MetricExplainer (Monte Carlo + P10/P50/P90)',
  /MetricExplainer metricId="monte-carlo-probability"/.test(execSrc) &&
    /MetricExplainer metricId="p10-p50-p90"/.test(execSrc),
);
assert(
  'Best Move tooltip uses MetricExplainer',
  /MetricExplainer metricId="best-move"/.test(execSrc),
);
assert(
  'Executive Overview source never sets a browser-native title= tooltip',
  !/\btitle="/.test(execSrc),
);

// ─── 10. Visual identity — preserved ─────────────────────────────────────────
section('Visual identity — gold / navy / cyan palette preserved');

assert(
  'Gold accent variable still used for primary signals',
  /hsl\(var\(--gold\)\)/.test(execSrc),
);
assert(
  'Card surface uses the canonical --card var',
  /hsl\(var\(--card\)\)/.test(execSrc),
);
assert(
  'Trajectory uses purple intelligence accent',
  /hsl\(280,80%/.test(execSrc),
);
assert(
  'Health strip uses cyan intelligence accent',
  /hsl\(188,60%/.test(execSrc),
);

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} failures`}`);
process.exit(failures === 0 ? 0 : 1);
