/**
 * test-funding-resolution.ts
 *
 * Regression tests for the Funding Gap Resolution Advisor.
 *
 * The advisor is an advisory / planning-validation layer on top of Plan
 * Feasibility. It MUST NOT change any canonical engine. These tests verify:
 *   1. Only emits candidates when fundingGap < 0.
 *   2. Active-2026 style scenario produces every supported candidate type
 *      whose required input is present.
 *   3. Ranking ordering follows the spec (lowest disruption first, then
 *      long-term wealth impact, then practicality).
 *   4. Unavailable options are listed with a reason rather than faked.
 *   5. Audit trace surfaces Funding Gap, candidate list, ranking logic,
 *      and the selected recommendation; declares the formula.
 *   6. Inform-only — no engine entry-point is imported or invoked.
 *   7. Coverage manifest contains `dashboard:funding-resolution`.
 *   8. Dashboard wires resolution into phase7ExecProps and renders the
 *      section inside the Plan Feasibility card.
 *
 * Run with:  tsx script/test-funding-resolution.ts
 */

// ─── Shim localStorage (some dependencies read at import) ────────────────────
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

const {
  computeFundingResolution,
  FUNDING_RESOLUTION_RANKING_FORMULA,
} = await import('../client/src/lib/fundingResolutionAdvisor');
const {
  buildFundingResolutionTrace,
  FUNDING_RESOLUTION_TRACE_ID,
} = await import('../client/src/lib/auditMode/engineTraces');
const { COVERAGE_MANIFEST, REQUIRED_TRACE_IDS } =
  await import('../client/src/lib/auditMode/coverageManifest');

let failures = 0;
const assert = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const section = (n: string) => console.log(`\n— ${n}`);

// Active 2026 style inputs (mirrors the prior PR sample).
const ACTIVE_2026: Parameters<typeof computeFundingResolution>[0] = {
  fundingGap:             -43_066,
  plannedStockBuy:         40_400,
  plannedCryptoBuy:        80_000,
  stockDcaAnnual:             991,
  cryptoDcaAnnual:          2_600,
  acquisitionCashUsed:    150_000,
  acquisitionBuyingCosts:  31_075,
  availableEquityRelease: 200_000,
  stocksBalance:          120_000,
  cryptoBalance:           85_000,
  monthlySavings:           7_000,
};

// ─── 1. No-gap behaviour ─────────────────────────────────────────────────────

section('1. No-gap: advisor stays inactive');
{
  const r = computeFundingResolution({ ...ACTIVE_2026, fundingGap: 25_000 });
  assert('fundingGap >= 0 → hasGap = false',  r.hasGap === false);
  assert('No recommendation when no gap',     r.recommendation === null);
  assert('No alternatives emitted',           r.alternatives.length === 0);
  const trace = buildFundingResolutionTrace({
    result: r, availableLiquidity: 280_000, requiredLiquidity: 255_000,
  });
  assert('No-gap trace finalValue says "No gap"',
    String(trace.finalValue) === 'No gap — no resolution required');
  assert('No-gap trace formula references Required − Available',
    /Required Liquidity\s*[-−]\s*Available Liquidity/i.test(trace.formula));
}

// ─── 2. Active 2026 — every available option is generated ────────────────────

section('2. Active 2026: every available option generates a candidate');
{
  const r = computeFundingResolution(ACTIVE_2026);
  assert('hasGap = true',                         r.hasGap === true);
  assert('Recommendation populated',              r.recommendation !== null);
  // Every option type whose required input is present should appear.
  const kinds = r.alternatives.map(c => c.kind);
  for (const k of [
    'reduce-planned-investment',
    'delay-investment',
    'use-equity-release',
    'use-asset-sale',
    'delay-property-or-increase-savings',
    'reduce-deposit',
  ]) {
    assert(`Candidate kind "${k}" generated`, kinds.includes(k as any));
  }
  // None of the options should be marked unavailable in this scenario.
  assert('No unavailable options when every input is positive',
    r.unavailable.length === 0,
    `got: ${r.unavailable.map(u => u.kind).join(', ')}`);
  // Every candidate has a non-empty title, detail, trade-off, source note,
  // and 4 scoring attributes.
  for (const c of r.alternatives) {
    assert(`Candidate "${c.kind}" has non-empty title`, c.title.length > 0);
    assert(`Candidate "${c.kind}" has non-empty detail`, c.detail.length > 0);
    assert(`Candidate "${c.kind}" has non-empty trade-off`, c.tradeOff.length > 0);
    assert(`Candidate "${c.kind}" has non-empty sourceNote`, c.sourceNote.length > 0);
    assert(`Candidate "${c.kind}" has 4 scoring attributes`,
      typeof c.scores.liquidityImprovement === 'number'
        && typeof c.scores.wealthImpact === 'number'
        && typeof c.scores.debtImpact === 'number'
        && typeof c.scores.complexity === 'number');
    assert(`Candidate "${c.kind}" rank > 0`,
      c.rank > 0 && c.rank <= 10);
  }
}

// ─── 3. Ranking + recommendation logic ───────────────────────────────────────

section('3. Ranking: alternatives sorted by composite score (desc)');
{
  const r = computeFundingResolution(ACTIVE_2026);
  for (let i = 1; i < r.alternatives.length; i++) {
    const prev = r.alternatives[i - 1];
    const cur  = r.alternatives[i];
    assert(`Rank ${i - 1} (${prev.rank.toFixed(2)}) ≥ Rank ${i} (${cur.rank.toFixed(2)})`,
      prev.rank >= cur.rank);
  }
  assert('Recommendation === alternatives[0]',
    r.recommendation === r.alternatives[0]);
  // Spec: lowest disruption first → the top recommendation should have a high
  // complexity score (10 = trivial). For ACTIVE_2026 the top option will be
  // either Reduce or Delay Investment, both at complexity = 9.
  assert(`Top option scores ≥ 8 on complexity (got ${r.recommendation!.scores.complexity})`,
    r.recommendation!.scores.complexity >= 8);
  // Spec: lowest long-term wealth impact next → top option's wealthImpact
  // should be at least ≥ debtImpact OR the option avoids new debt entirely.
  assert(`Top option debtImpact = 10 (no new debt) or wealthImpact ≥ debtImpact`,
    r.recommendation!.scores.debtImpact === 10
      || r.recommendation!.scores.wealthImpact >= r.recommendation!.scores.debtImpact);
  // Equity release adds debt → its debt-impact score is the lowest.
  const equity = r.alternatives.find(c => c.kind === 'use-equity-release')!;
  const reduce = r.alternatives.find(c => c.kind === 'reduce-planned-investment')!;
  const delay  = r.alternatives.find(c => c.kind === 'delay-investment')!;
  assert(`Equity Release debt-impact (${equity.scores.debtImpact}) < Reduce/Delay debt-impact (${reduce.scores.debtImpact}/${delay.scores.debtImpact})`,
    equity.scores.debtImpact < reduce.scores.debtImpact
      && equity.scores.debtImpact < delay.scores.debtImpact);
  assert(`Equity Release rank (${equity.rank.toFixed(2)}) < top rank (${r.recommendation!.rank.toFixed(2)})`,
    equity.rank < r.recommendation!.rank);
  // The recommendation must be the best-ranked feasible option. It does not
  // have to close the gap fully (e.g. for ACTIVE_2026 the planned stock buy
  // of $40,400 is the largest low-disruption knob even though it leaves a
  // small residual). At minimum it must close more than half the shortfall
  // — otherwise the advisor would not be useful.
  const shortfall = Math.abs(ACTIVE_2026.fundingGap);
  assert(`Top option closes > 50% of the shortfall (closes $${r.recommendation!.gapClosure}, shortfall $${shortfall})`,
    r.recommendation!.gapClosure > shortfall * 0.5);
  // ALSO: there must exist at least one alternative that DOES close the gap
  // fully (e.g. crypto reduce / equity release / asset sale) — the advisor
  // is not useful if every option is partial.
  const fullyResolving = r.alternatives.filter(c => c.gapClosure >= shortfall - 1);
  assert(`At least one alternative closes the gap fully (got ${fullyResolving.length}: ${fullyResolving.map(c => c.kind).join(', ')})`,
    fullyResolving.length >= 1);
}

// ─── 4. Unavailable options — listed with a reason ───────────────────────────

section('4. Unavailable options: emitted with a reason instead of faked');
{
  const r = computeFundingResolution({
    ...ACTIVE_2026,
    // Strip every "could draw on it" source.
    plannedStockBuy: 0, plannedCryptoBuy: 0,
    availableEquityRelease: 0,
    stocksBalance: 0, cryptoBalance: 0,
    acquisitionCashUsed: 0, acquisitionBuyingCosts: 0,
    monthlySavings: 0,
  });
  assert('hasGap still true',     r.hasGap === true);
  assert('No candidates when no input is available',  r.alternatives.length === 0);
  assert('No recommendation when no candidates',      r.recommendation === null);
  // Each missing input should appear as an unavailable option with a reason.
  const unavailKinds = r.unavailable.map(u => u.kind);
  for (const k of [
    'delay-investment',
    'use-equity-release',
    'use-asset-sale',
    'delay-property-or-increase-savings',
    'reduce-deposit',
  ]) {
    assert(`Unavailable kind "${k}" listed with reason`,
      unavailKinds.includes(k as any)
        && (r.unavailable.find(u => u.kind === k)?.reason ?? '').length > 0);
  }
}

// ─── 5. Audit trace — formula + candidates + ranking + recommendation ────────

section('5. Audit trace surfaces every required element');
{
  const r = computeFundingResolution(ACTIVE_2026);
  const trace = buildFundingResolutionTrace({
    result: r, availableLiquidity: 262_000, requiredLiquidity: 305_066,
  });
  assert('Trace id matches FUNDING_RESOLUTION_TRACE_ID',
    trace.id === FUNDING_RESOLUTION_TRACE_ID && trace.id === 'dashboard:funding-resolution');
  assert('Trace label = "Funding Gap Resolution"',
    trace.label === 'Funding Gap Resolution');
  assert('Trace finalValue mentions the recommendation',
    /Recommended:/.test(String(trace.finalValue)));
  // Spec: Formula: Funding Gap = Required Liquidity - Available Liquidity.
  assert('Trace formula spells out Funding Gap = Required − Available',
    /Funding Gap\s*=\s*Required Liquidity\s*[-−]\s*Available Liquidity/.test(trace.formula));
  assert('Trace formula includes the candidate-ranking formula',
    /complexity/.test(trace.formula)
      && /wealthImpact/.test(trace.formula)
      && /debtImpact/.test(trace.formula)
      && /liquidityImprovement/.test(trace.formula));
  // Section headers — must include every required block.
  const labels = trace.inputs.map(i => i.label);
  for (const h of [
    '─ Funding Gap ─',
    '─ Selected Recommendation ─',
    '─ Candidate Solutions ─',
    '─ Ranking Logic ─',
    '─ Behaviour ─',
  ]) {
    assert(`Trace contains section "${h}"`, labels.includes(h));
  }
  // Recommended Solution row carries the title from r.recommendation.
  const recRow = trace.inputs.find(i => i.label === 'Recommended Solution');
  assert('Trace "Recommended Solution" row matches r.recommendation.title',
    String(recRow?.value ?? '') === r.recommendation!.title);
  // Behaviour row says inform-only.
  const behaviour = trace.inputs.find(i => i.label === 'No-block');
  assert('Trace Behaviour row says inform-only',
    /Inform only/i.test(String(behaviour?.value ?? ''))
      && /not blocked/i.test(String(behaviour?.value ?? '')));
  // The first candidate in the candidates section is marked with ★.
  const starRow = trace.inputs.find(i => /^★ Recommended/.test(i.label));
  assert('Top candidate row is marked with ★',
    !!starRow && starRow.label.includes(r.recommendation!.title));
  // Every alternative shows up; per-candidate scoring rows are present.
  for (const c of r.alternatives) {
    assert(`Trace lists candidate "${c.kind}" by title`,
      trace.inputs.some(i => i.label.includes(c.title)));
  }
  assert('Trace surfaces "  · Liquidity Improvement" sub-row',
    labels.includes('  · Liquidity Improvement'));
  assert('Trace surfaces "  · Wealth Impact" sub-row',
    labels.includes('  · Wealth Impact'));
  assert('Trace surfaces "  · Debt Impact" sub-row',
    labels.includes('  · Debt Impact'));
  assert('Trace surfaces "  · Complexity" sub-row',
    labels.includes('  · Complexity'));
  assert('Trace surfaces "  · Composite rank" sub-row',
    labels.includes('  · Composite rank'));
  // Ranking-formula row matches the public constant.
  const rankRow = trace.inputs.find(i => i.label === 'Ranking formula');
  assert('Trace Ranking-formula row matches the public constant',
    String(rankRow?.value ?? '') === FUNDING_RESOLUTION_RANKING_FORMULA);
  // Notes contain the funding-gap headline + recommendation + no-block.
  const noteJoin = (trace.notes ?? []).join('\n');
  assert('Trace notes mention Resolution Advisor generated N candidates',
    /Resolution Advisor generated \d+ candidate/i.test(noteJoin));
  assert('Trace notes mention the recommendation',
    new RegExp(`Recommendation:\\s*${r.recommendation!.title.replace(/[$.,]/g, c => `\\${c}`)}`).test(noteJoin));
  assert('Trace notes mention inform-only / no-block',
    /Inform only|no engine.*blocked/i.test(noteJoin));
}

// ─── 6. Audit trace — Unavailable-options branch ─────────────────────────────

section('6. Audit trace — unavailable options surfaced with reasons');
{
  const r = computeFundingResolution({
    ...ACTIVE_2026,
    plannedStockBuy: 0, plannedCryptoBuy: 0,
    availableEquityRelease: 0,
    stocksBalance: 0, cryptoBalance: 0,
    acquisitionCashUsed: 0, acquisitionBuyingCosts: 0,
    monthlySavings: 0,
  });
  const trace = buildFundingResolutionTrace({
    result: r, availableLiquidity: 50_000, requiredLiquidity: 93_066,
  });
  assert('Trace finalValue handles "No candidate options available" path',
    String(trace.finalValue) === 'No candidate options available');
  const labels = trace.inputs.map(i => i.label);
  assert('Trace lists "Options not available" section',
    labels.includes('─ Options not available (data missing / zero) ─'));
  assert('Unavailable rows carry a reason',
    r.unavailable.every(u =>
      labels.includes(`  · ${u.kind} — not available`)
        && (trace.inputs.find(i => i.label === `  · ${u.kind} — not available`)?.value ?? '').length > 0));
}

// ─── 7. Coverage manifest registers dashboard:funding-resolution ─────────────

section('7. Coverage manifest registers dashboard:funding-resolution');
{
  const entry = COVERAGE_MANIFEST.find(e => e.id === FUNDING_RESOLUTION_TRACE_ID);
  assert('Funding Resolution id present in COVERAGE_MANIFEST',  !!entry);
  assert('Surface mentions Plan Feasibility card',
    !!entry?.surface && /Plan Feasibility card/i.test(entry.surface));
  assert('Description references Candidate solutions / ranking / recommendation',
    !!entry?.description
      && /Candidate solutions/i.test(entry.description)
      && /ranking/i.test(entry.description)
      && /recommendation/i.test(entry.description));
  assert('Entry is required',  entry?.required === true);
  assert('REQUIRED_TRACE_IDS includes dashboard:funding-resolution',
    REQUIRED_TRACE_IDS.includes(FUNDING_RESOLUTION_TRACE_ID));
}

// ─── 8. Engine guard — advisor + trace have no engine imports ────────────────

section('8. Engine guard — advisory layer has no engine imports');
{
  const fs = await import('node:fs');
  const helperSrc = await fs.promises.readFile('client/src/lib/fundingResolutionAdvisor.ts', 'utf8');
  const helperImports = helperSrc.split('\n').filter(l => /^\s*import\b/.test(l)).join('\n');
  assert('fundingResolutionAdvisor.ts has zero imports (pure derivation)',
    helperImports.trim().length === 0,
    `imports found: ${helperImports || '<none>'}`);
  const helperCode = helperSrc
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  assert('Advisor code does NOT invoke any canonical engine entry-point',
    !/\bbuildCashFlowSeries\s*\(/.test(helperCode)
      && !/\bprojectNetWorth\s*\(/.test(helperCode)
      && !/\brunMonteCarlo\s*\(/.test(helperCode)
      && !/\bcomputeFireProjection\s*\(/.test(helperCode));

  const traceSrc = await fs.promises.readFile(
    'client/src/lib/auditMode/engineTraces/fundingResolutionTraces.ts', 'utf8');
  const traceImports = traceSrc.split('\n').filter(l => /^\s*import\b/.test(l)).join('\n');
  assert('Trace file imports nothing from /lib/finance, forecastEngine, Monte Carlo, FIRE, recommendation engine',
    !/from\s+['"][^'"]*\/(finance|forecastEngine|monteCarloEngine|forecastEngineRegimeAware|firePathEngine|recommendationEngine|canonicalRiskSurface)['"]/.test(traceImports));
  const traceCode = traceSrc
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  assert('Trace code does NOT invoke any canonical engine entry-point',
    !/\bbuildCashFlowSeries\s*\(/.test(traceCode)
      && !/\bprojectNetWorth\s*\(/.test(traceCode)
      && !/\brunMonteCarlo\s*\(/.test(traceCode));
}

// ─── 9. Dashboard + ExecutiveDashboard wiring (string-grep) ──────────────────

section('9. Dashboard + ExecutiveDashboard wire Funding Resolution correctly');
{
  const fs = await import('node:fs');
  const dashSrc = await fs.promises.readFile('client/src/pages/dashboard.tsx', 'utf8');
  assert('dashboard.tsx imports computeFundingResolution + buildFundingResolutionTrace',
    /computeFundingResolution/.test(dashSrc)
      && /buildFundingResolutionTrace/.test(dashSrc));
  assert('dashboard.tsx computes fundingResolution in a useMemo + registers the audit trace',
    /computeFundingResolution\(/.test(dashSrc)
      && /registerAuditTrace\(\s*buildFundingResolutionTrace\(/.test(dashSrc.replace(/\s+/g, ' ')));
  assert('dashboard.tsx forwards fundingResolution into phase7ExecProps',
    /fundingResolution\s*,/.test(dashSrc));
  assert('dashboard.tsx wires availableEquityRelease from refinance LVR + property value − total debt',
    /availableEquityRelease/.test(dashSrc)
      && /maxRefinanceLVR/.test(dashSrc));
  assert('dashboard.tsx forwards stocksBalance / cryptoBalance / monthlySavings to the advisor',
    /stocksBalance:\s*stocksTotal/.test(dashSrc)
      && /cryptoBalance:\s*cryptoTotal/.test(dashSrc)
      && /monthlySavings:\s*Math\.max\(0,\s*surplus\)/.test(dashSrc));

  const execSrc = await fs.promises.readFile('client/src/components/ExecutiveDashboard.tsx', 'utf8');
  assert('ExecutiveDashboard imports FUNDING_RESOLUTION_TRACE_ID + FundingResolutionResult',
    /FUNDING_RESOLUTION_TRACE_ID/.test(execSrc)
      && /FundingResolutionResult/.test(execSrc));
  assert('ExecutiveDashboardProps exposes fundingResolution prop',
    /fundingResolution\?:\s*FundingResolutionResult/.test(execSrc));
  assert('PlanFeasibilityCard accepts a resolution prop',
    /PlanFeasibilityCard\(\{\s*\n?\s*feasibility,\s*\n?\s*resolution,/.test(execSrc));
  assert('FundingResolutionSection is conditionally rendered when hasFundingGap + resolution.hasGap',
    /feasibility\.hasFundingGap[\s\S]*resolution[\s\S]*resolution\.hasGap[\s\S]*<FundingResolutionSection/.test(execSrc));
  assert('FundingResolutionSection has data-testid="funding-resolution-section"',
    /data-testid="funding-resolution-section"/.test(execSrc));
  // The required sub-testids all exist for the recommendation, alternatives,
  // and no-block note.
  for (const t of [
    'funding-resolution-gap',
    'funding-resolution-recommendation',
    'funding-resolution-recommendation-title',
    'funding-resolution-recommendation-detail',
    'funding-resolution-alternatives',
    'funding-resolution-no-block-note',
  ]) {
    assert(`Resolution section exposes data-testid="${t}"`,
      execSrc.includes(`data-testid="${t}"`));
  }
  assert('Resolution audit chip opens dashboard:funding-resolution via openTrace',
    /openTrace\(\s*FUNDING_RESOLUTION_TRACE_ID/.test(execSrc));
  // Inform-only — no disabled / aria-disabled tied to a resolution flag.
  assert('Resolution section never sets disabled / aria-disabled on save / forecast controls',
    !/disabled=\{.*fundingResolution/.test(execSrc)
      && !/aria-disabled=\{.*fundingResolution/.test(execSrc));
}

// ─── Done ────────────────────────────────────────────────────────────────────

if (failures === 0) {
  console.log('\n✓ All Funding Gap Resolution regression checks passed');
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}
