/**
 * Executive Overview FINAL Reconciliation Pass — validation tests.
 *
 * Pure Node validation suite — runs with:
 *   npx tsx script/test-executive-overview-rebuild.ts
 *
 * Asserts the cockpit contract for the Final Reconciliation Pass which
 * restored visual intelligence (Monte Carlo fan chart anchor, Deposit Power
 * & Cashflow operational motion, premium Deep Analysis navigation cards)
 * without returning the cluttered V1 stack. The cockpit IA is:
 *
 *   1. ExecutiveHeroSnapshot           — Net Worth, Surplus, Risk, FIRE + 1 Best Move
 *   2. MonteCarloTrajectoryChart       — main future visual anchor (P10/P50/P90)
 *   3. CompactProjectionTable          — Year · P50 · Confidence Range
 *   4. DepositPowerTrajectoryPanel     — annual cashflow / deposit power motion
 *   5. ExecutiveHealthStrip            — exactly 4 structural indicators
 *   6. ExecutiveActionQueue            — maximum 3 actionable items
 *   7. DeepAnalysisCards               — four premium navigation cards
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
  'MonteCarloTrajectoryChart is rendered (visual future anchor)',
  execSrc.includes('data-testid="monte-carlo-trajectory-chart"'),
);
assert(
  'WealthProjectionTable / strategic wealth projection panel is rendered (replaces compact P50 table)',
  execSrc.includes('data-testid="wealth-projection-table-panel"'),
);
assert(
  'DepositPowerTrajectoryPanel is rendered (operational motion)',
  execSrc.includes('data-testid="deposit-power-trajectory-panel"'),
);
assert(
  'ExecutiveHealthStrip is rendered',
  execSrc.includes('data-testid="executive-health-strip"'),
);
assert(
  'ExecutiveActionQueue is rendered',
  execSrc.includes('data-testid="executive-action-queue"'),
);
assert(
  'DeepAnalysisCards is rendered (premium navigation)',
  execSrc.includes('data-testid="deep-analysis-cards"'),
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

// Richer analytical table — decision-grade columns from canonical engine.
// (Replaces the prior compact Year · P50 · Confidence Range table — that
// duplicated the Monte Carlo fan above and was removed in the Executive
// Overview Projection Cleanup pass.)
assert(
  'Richer projection table data-testid is present',
  execSrc.includes('data-testid="wealth-projection-table"'),
);
const richColumnIds = [
  'col-accessible-nw',
  'col-total-nw',
  'col-cagr',
  'col-growth',
  'col-cash',
  'col-liabilities',
  'col-property-equity',
  'col-stocks',
  'col-crypto',
  'col-super',
];
for (const id of richColumnIds) {
  assert(
    `Richer table includes column "${id}"`,
    execSrc.includes(`data-testid="${id}"`),
  );
}
const richColumnLabels = [
  'Accessible NW',
  'Total NW',
  'CAGR',
  'Growth',
  'Cash',
  'Liabilities',
  'Property equity',
  'Stocks',
  'Crypto',
  'Super',
];
for (const label of richColumnLabels) {
  assert(
    `Richer table surfaces column label "${label}"`,
    execSrc.includes(`>${label}<`),
  );
}
assert(
  'Compact P50 projection table is no longer rendered on Executive Overview',
  !execSrc.includes('data-testid="trajectory-projection-table"') &&
    !execSrc.includes('data-testid="trajectory-expand-range"'),
);
assert(
  'Compact "Confidence Range" column header is no longer rendered',
  !/>Confidence Range</.test(execSrc),
);
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
  // NOTE: the Wealth Decision Center has been RESTORED inside the cockpit
  // (CASH / EVENTS / WEALTH / RISK tabs) per the FWL restore pass — it is
  // rendered by ExecutiveDashboard.tsx, never as a standalone homepage stack.
  // We therefore no longer assert its absence on the dashboard homepage.
  { name: 'Deterministic baseline table', pattern: /Deterministic baseline \(advanced\)/ },
  { name: 'Canonical MC Wealth Projection homepage block', pattern: /db-section-monte-carlo/ },
  // Visual-QA blocker fixes — the duplicate KPI stacks must not return. The
  // animated journey header (WealthFlowBanner) and the family welcome card
  // were INTENTIONALLY restored by the FWL Restore Hero Header Experience
  // pass and are now asserted to be present below — they no longer appear
  // in this "must not render" list.
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

// ─── FWL Restore Hero Header Experience — atmospheric top layer ─────────────
// The dashboard restores a compact animated journey hero/header and a family
// welcome/mission card ABOVE the Executive Overview, in this exact order:
//   1. Smart-Assumptions / Forecast pill
//   2. Compact animated journey hero (TODAY · PLAN · FUTURE · MOVE)
//   3. Welcome / family mission card
//   4. Executive Overview cockpit
section('FWL Restore — animated hero/header + family mission card');

assert(
  'Compact animated journey hero (WealthFlowBanner) renders on the dashboard',
  /<WealthFlowBanner\s*\/?>/.test(dashSrc),
);
assert(
  'Journey hero is wrapped with test id `dashboard-journey-header`',
  /data-testid="dashboard-journey-header"/.test(dashSrc),
);
assert(
  'Family mission / welcome card renders on the dashboard',
  /data-testid="dashboard-family-mission-card"/.test(dashSrc),
);
assert(
  'Family mission card surfaces the "Welcome Back" eyebrow',
  /data-testid="family-welcome-eyebrow"/.test(dashSrc) &&
    /Welcome Back/.test(dashSrc),
);
assert(
  'Family mission card surfaces the family identity (Fara & Roham)',
  /data-testid="family-identity-name"/.test(dashSrc) &&
    /Fara\s*&amp;\s*Roham/.test(dashSrc),
);
assert(
  'Family mission card surfaces the wealth mission subtitle',
  /Family Net Worth Command Center/.test(dashSrc) &&
    /Building wealth for the kids/.test(dashSrc),
);

// The canonical four journey labels + sublabels must be present in the
// rendered WealthFlowBanner stage definitions.
const wfbSrc = readFileSync(
  resolve(repoRoot, 'client/src/components/WealthFlowBanner.tsx'),
  'utf8',
);
for (const word of ['TODAY', 'PLAN', 'FUTURE', 'MOVE']) {
  assert(
    `WealthFlowBanner exposes canonical journey word "${word}"`,
    new RegExp(`word:\\s*"${word}"`).test(wfbSrc),
  );
}
for (const sub of ['Snapshot', 'Strategy', 'Forecast', 'Action']) {
  assert(
    `WealthFlowBanner exposes canonical journey sublabel "${sub}"`,
    new RegExp(`sub:\\s*"${sub}"`).test(wfbSrc),
  );
}

// Order assertion — journey header → mission card → Executive Overview.
const idxJourneyHeader = dashSrc.indexOf('data-testid="dashboard-journey-header"');
const idxMissionCard   = dashSrc.indexOf('data-testid="dashboard-family-mission-card"');
const idxExecSection   = dashSrc.indexOf('data-testid="dashboard-executive-section"');
assert(
  'Journey header appears BEFORE the family mission card in JSX order',
  idxJourneyHeader > 0 && idxMissionCard > idxJourneyHeader,
);
assert(
  'Family mission card appears BEFORE the Executive Overview in JSX order',
  idxMissionCard > 0 && idxExecSection > idxMissionCard,
);

// Order assertion — Executive Overview still hosts the promoted strategic
// visualization (now split into Deterministic + Probabilistic projection
// sections) and the Wealth Decision Center inside the cockpit. Both surfaces
// remain present so the cleanup is purely an IA reorganisation.
const execSrcForOrder = execSrc; // alias for clarity
const idxStrategicChart = execSrcForOrder.search(/Deterministic Projection|Probabilistic Projection/);
const idxDecisionCtr  = execSrcForOrder.search(/Wealth Decision Center|WealthDecisionCenter/);
assert(
  'Strategic projection surface (Deterministic + Probabilistic) is present inside the cockpit',
  idxStrategicChart > 0,
);
assert(
  'Wealth Decision Center remains present inside the Executive Overview cockpit',
  idxDecisionCtr > 0,
);

// The Final Reconciliation Pass replaces the weak "Explore" filter chip
// strip with a premium DeepAnalysisCards block rendered inside the cockpit.
// The old strip must NOT be present on the dashboard homepage.
assert(
  'Weak Explore filter chip strip is removed from the dashboard homepage',
  !/data-testid="executive-explore-strip"/.test(dashSrc),
);
assert(
  'Dashboard no longer renders per-link Explore filter chips',
  !/data-testid=\{`explore-link-/.test(dashSrc) &&
    !/data-testid="explore-link-forecast"/.test(dashSrc),
);

// Deep Analysis cards live inside the cockpit (ExecutiveDashboard) and must
// expose exactly four premium navigation surfaces.
assert(
  'Deep Analysis cards block is rendered inside the cockpit',
  execSrc.includes('data-testid="deep-analysis-cards"'),
);
const deepCardIds = ['forecast-engine', 'risk-radar', 'decision-engine', 'tax-strategy'];
for (const id of deepCardIds) {
  assert(
    `Deep Analysis cards include "${id}"`,
    new RegExp(`data-testid="deep-analysis-card-${id}"|id:\\s*'${id}'`).test(execSrc),
  );
}
const deepCardConfigCount = (execSrc.match(/id:\s*'(forecast-engine|risk-radar|decision-engine|tax-strategy)'/g) ?? []).length;
assert(
  'Deep Analysis cards has exactly four entries (no chip drift)',
  deepCardConfigCount === 4,
  `found ${deepCardConfigCount}`,
);

// ─── 7. Homepage flow — cockpit-only ────────────────────────────────────────
section('Homepage flow — Smart-assumptions chip → Executive cockpit');

assert(
  'Dashboard renders <ExecutiveDashboard …> exactly once',
  (dashSrc.match(/<ExecutiveDashboard\b/g) ?? []).length === 1,
);

// The homepage shows the assumptions chip first, then the Executive Overview
// cockpit which now hosts the DeepAnalysisCards block at its tail.
const idxAssumptions = dashSrc.indexOf('data-testid="badge-smart-assumptions"');
const idxExec = dashSrc.indexOf('data-testid="dashboard-executive-section"');
assert(
  'Smart-assumptions chip is positioned before the Executive cockpit',
  idxAssumptions > 0 && idxExec > idxAssumptions,
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

// The family mission subtitle ("Family Net Worth Command Center") is an
// intentional identity tagline, not a duplicate of the cockpit's "Net Worth"
// KPI tile. Strip just that phrase before counting so it doesn't trip the
// duplicate-label guard.
const dashStrippedForLabels = dashStripped.replace(
  /Family Net Worth Command Center/g,
  '',
);

assert(
  'Dashboard JSX no longer carries a "Net Worth" UI label',
  !/Net Worth/.test(dashStrippedForLabels),
);
assert(
  'Dashboard JSX no longer carries a "Monthly Surplus" UI label',
  !/Monthly Surplus/i.test(dashStripped),
);

const netWorthInExec = (execStripped.match(/Net Worth/g) ?? []).length;
const surplusInExec = (execStripped.match(/Monthly Surplus/g) ?? []).length;
// Hero shows "Net Worth"; the canonical wealth-layers strip exposes the four
// explicit layers (Gross NW, Accessible NW + tooltip references) — these are
// labels of the SAME canonical figure (computed once in canonicalWealth.ts),
// not duplicate surfaces fetching independent numbers.
assert(
  'Net Worth surface count stays within the canonical wealth-layers contract (≤ 5)',
  netWorthInExec >= 1 && netWorthInExec <= 5,
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

// ─── 11. Route registration — Deep Analysis surfaces never crash ─────────────
section('Route registration — Risk Radar & Tax Strategy targets resolved');

const appSrc = readFileSync(
  resolve(repoRoot, 'client/src/App.tsx'),
  'utf8',
);

assert(
  'Risk Radar page is imported in App.tsx',
  /import\s+RiskRadarPage\s+from\s+["']\.\/pages\/risk-radar["']/.test(appSrc),
);
assert(
  'Tax Strategy / Tax Alpha page is imported in App.tsx',
  /import\s+TaxAlphaPage\s+from\s+["']\.\/pages\/tax-alpha["']/.test(appSrc),
);
assert(
  'Risk Radar route /risk-radar is registered',
  /path="\/risk-radar"/.test(appSrc) && /component=\{RiskRadarPage\}/.test(appSrc),
);
assert(
  'Tax Strategy route /tax-alpha is registered',
  /path="\/tax-alpha"/.test(appSrc) && /component=\{TaxAlphaPage\}/.test(appSrc),
);
assert(
  'Tax Strategy alias /tax-strategy is registered',
  /path="\/tax-strategy"/.test(appSrc) && /component=\{TaxAlphaPage\}/.test(appSrc),
);

// ─── 12. Visual anchors — MC chart + Deposit Power presence ─────────────────
section('Visual anchors — Monte Carlo chart + Deposit Power chart visible');

assert(
  'Monte Carlo trajectory chart uses Recharts AreaChart',
  /<AreaChart\b[\s\S]*?dataKey="median"/.test(execSrc) ||
    /AreaChart[\s\S]{0,400}?median/.test(execSrc),
);
assert(
  'MC chart band uses P10 + P90 series',
  /dataKey="p10"/.test(execSrc) && /dataKey="p90"/.test(execSrc),
);
assert(
  'Deposit Power & Cashflow chart uses Recharts ComposedChart',
  /<ComposedChart\b/.test(execSrc),
);
assert(
  'Deposit Power chart wires cashBalance + netCashflow + taxRefund channels',
  /dataKey="cashBalance"/.test(execSrc) &&
    /dataKey="netCashflow"/.test(execSrc) &&
    /dataKey="taxRefund"/.test(execSrc),
);
assert(
  'MC pending state preserves the chart area / identity',
  /data-testid="trajectory-chart-pending"|trajectory-chart-area/.test(execSrc),
);

// ─── 12b. Chart hierarchy & purpose — single strategic visualization ─────────
section('Chart hierarchy — Deterministic + Probabilistic Projections (primary) + Plan Execution Capacity (operational)');

assert(
  'Probabilistic Projection (Monte Carlo Adjusted) title present',
  /Probabilistic Projection \(Monte Carlo Adjusted\)/.test(execSrc) &&
    /data-testid="probabilistic-projection-title"/.test(execSrc),
);
assert(
  'Probabilistic chart subtitle frames uncertainty / volatility / sequencing / tax-adjusted liquidation',
  /This model includes uncertainty, volatility, sequencing risk, and tax-adjusted liquidation effects\./.test(execSrc),
);
assert(
  'Legacy "Future Wealth Path" hero title removed from the cockpit display',
  !/>\s*Future Wealth Path\s*</.test(execSrc),
);
assert(
  'Operational chart renamed to "Plan Execution Capacity"',
  /Plan Execution Capacity/.test(execSrc),
);
assert(
  'Operational chart subtitle describes liquidity · deposit power · cashflow survivability',
  /Liquidity.*deposit power.*cashflow survivability/.test(execSrc),
);
assert(
  'Legacy "Wealth Trajectory" label no longer used as the hero chart title',
  !/>\s*Wealth Trajectory\s*</.test(execSrc),
);
assert(
  'Legacy "Deposit Power &amp; Cashflow" label no longer used as the operational chart title',
  !/>\s*Deposit Power &amp; Cashflow\s*</.test(execSrc),
);
assert(
  'Plan Execution Capacity panel feels operational — chart height reduced ~25% (≤230)',
  /data-testid="deposit-power-chart-area"[\s\S]{0,400}?<ResponsiveContainer[^>]*height=\{(?:1\d\d|2[0-2]\d)\}/.test(execSrc),
);
assert(
  'Probabilistic Projection keeps generous hero height (≥300)',
  /data-testid="trajectory-chart-area"[\s\S]{0,400}?<ResponsiveContainer[^>]*height=\{(?:3\d\d|4\d\d|5\d\d)\}/.test(execSrc),
);

// Exactly ONE primary strategic projection visualization remains.
const mcChartCount = (execSrc.match(/data-testid="monte-carlo-trajectory-chart"/g) ?? []).length;
const mcRenderCount = (execSrc.match(/<MonteCarloTrajectoryChart\b/g) ?? []).length;
assert(
  'Exactly one MonteCarloTrajectoryChart render site on Executive Overview',
  mcRenderCount === 1,
  `found ${mcRenderCount}`,
);
assert(
  'Strategic Wealth Projection chart is rendered exactly once (no upper/lower duplicate)',
  mcChartCount === 1,
  `found ${mcChartCount}`,
);

// ─── 13. Current vs forecast source separation ───────────────────────────────
section('Today snapshot uses live current values — not blended forecast');

assert(
  'Hero exposes a live PPOR mortgage rate prop',
  /livePporRate/.test(execSrc),
);
assert(
  'Dashboard passes the LIVE snap.mortgage_rate (today) into the cockpit',
  /livePporRate:\s*snap\.mortgage_rate/.test(dashSrc),
);
assert(
  'Today snapshot caption labels the live mortgage rate ("PPOR …%")',
  /PPOR \$\{liveRate\}%|PPOR \$\{liveRate\}\s*%|PPOR\s*\$\{liveRate\}%|PPOR.*liveRate/.test(execSrc) ||
    /PPOR\s+\$\{liveRate\}%/.test(execSrc),
);
assert(
  'Today snapshot copy frames cockpit as live / current (not forecast)',
  /Today snapshot|live current values/i.test(execSrc),
);

// ─── 13b. MC auto-run on dashboard mount ─────────────────────────────────────
section('Canonical MC auto-runs on dashboard mount when missing');

assert(
  'Dashboard imports buildCanonicalMonteCarloInput from the canonical mapper',
  /from\s+"@\/lib\/monteCarloCanonical"/.test(dashSrc),
);
assert(
  'Dashboard imports runMonteCarloV4 (same engine as Forecast Engine default)',
  /from\s+"@\/lib\/monteCarloV4\/engineV4"/.test(dashSrc),
);
assert(
  'Dashboard contains an MC auto-run useEffect gated on snapshot + monteCarloResult',
  /mcAutoRunFiredRef/.test(dashSrc) &&
    /if\s*\(monteCarloResult\)\s+return/.test(dashSrc) &&
    /runMonteCarloV4\s*\(\s*input/.test(dashSrc),
);
assert(
  'MC auto-run gate refuses to fire while another MC run is already in progress',
  /if\s*\(isRunningMC\)\s+return/.test(dashSrc),
);

// ─── 14. Cashflow trajectory wiring ──────────────────────────────────────────
section('Cashflow trajectory wired from canonical cashFlowAnnual');

assert(
  'Dashboard builds a cashflowTrajectory memo from cashFlowAnnual + equityTimeline',
  /cashflowTrajectory[\s\S]{0,400}?cashFlowAnnual/.test(dashSrc) &&
    /equityTimeline/.test(dashSrc),
);
assert(
  'Dashboard passes cashflowTrajectory to ExecutiveDashboard',
  /cashflowTrajectory,?$/m.test(dashSrc) || /cashflowTrajectory\s*[,}]/.test(dashSrc),
);
assert(
  'cashflowTrajectory shape carries cashBalance / netCashflow / taxRefund / totalDepositPower',
  /cashBalance:\s*cash/.test(dashSrc) &&
    /netCashflow:\s*a\.netCashFlow/.test(dashSrc) &&
    /taxRefund:\s*a\.ngTaxBenefit/.test(dashSrc) &&
    /totalDepositPower:\s*dp/.test(dashSrc),
);

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} failures`}`);
process.exit(failures === 0 ? 0 : 1);
