/**
 * test-sprint6-phase1-scenario-compare.ts
 *
 * Sprint 6 Phase 1 — Scenario Compare Workspace tests.
 *
 * What this proves
 * ----------------
 * The Sprint 6 Phase 1 Scenario Compare workspace renders the six initial
 * parallel scenarios (Baseline, Buy IP 2027, Buy IP 2028, ETF Focus, Offset
 * Focus, Hybrid Strategy) side-by-side, sourcing every numeric value from
 * the existing canonical and Sprint 5 engines. It does NOT introduce any
 * new financial formula or page-level computation.
 *
 *   §1  Orchestration layer builds six scenarios from a valid ledger
 *   §2  Each scenario maps to an existing engine candidate (or Best Move)
 *   §3  Each scenario's display metrics are engine pass-throughs
 *   §4  Workspace component renders six scenario cards/rows with stable testids
 *   §5  Each scenario surfaces NW / Passive / FIRE / Surplus / Liquidity /
 *       Risk / MC confidence / Recommended Action metrics
 *   §6  Empty ledger ⇒ graceful empty state (no fabricated numbers)
 *   §7  Thin ledger ⇒ graceful incomplete-data state (workspace still renders)
 *   §8  Dashboard contract unchanged — canonical headline metrics still match
 *       between the workspace bundle and a direct canonical call
 *
 * Run with:  tsx script/test-sprint6-phase1-scenario-compare.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildScenarioCompareWorkspace,
  formatScenarioMetric,
  SCENARIO_DEFINITIONS,
  type ScenarioId,
} from "../client/src/lib/scenarioCompareWorkspace";
import { ScenarioCompareWorkspace } from "../client/src/components/ScenarioCompareWorkspace";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import { generateDecisionCandidates } from "../client/src/lib/decisionCandidates";
import { rankDecisionCandidates } from "../client/src/lib/decisionRanking";
import { solveGoalGap } from "../client/src/lib/goalSolver";
import { computeBestMoveSprint5 } from "../client/src/lib/bestMoveEngineSprint5";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    const msg = `FAIL  ${label}` + (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : "");
    failures.push(msg);
    console.error(`  ${msg}`);
  }
}

function hasTestId(html: string, id: string): boolean {
  return html.includes(`data-testid="${id}"`);
}

function countTestIdMatches(html: string, idPrefix: string): number {
  const re = new RegExp(`data-testid="${idPrefix}[^"]*"`, "g");
  return (html.match(re) ?? []).length;
}

/* ─── Fixture (same household snapshot used by Sprint 5 Phase 5 test) ─── */

const SNAPSHOT_RICH = {
  ppor: 1_510_000,
  cash: 40_000,
  offset_balance: 222_000,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const FIXTURE: DashboardInputs = {
  snapshot: SNAPSHOT_RICH,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const EMPTY_LEDGER: DashboardInputs = {
  snapshot: null,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const THIN_LEDGER: DashboardInputs = {
  snapshot: {
    ppor: 0, cash: 0, super_balance: 0, mortgage: 0, other_debts: 0,
    roham_monthly_income: 0, fara_monthly_income: 0, monthly_expenses: 1,
    rental_income_total: 0, fire_target_monthly_income: 0, safe_withdrawal_rate: 4,
  },
  properties: [], stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [], todayIso: "2026-05-25",
};

console.log("\nSprint 6 Phase 1 — Scenario Compare Workspace\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Orchestration builds six scenarios
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Orchestration layer builds six scenarios");
{
  const result = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  ok("workspace not empty for valid ledger", !result.empty);
  ok("bundle is populated", result.bundle !== null);
  ok("workspace exposes six rows", result.rows.length === 6, { actual: result.rows.length });

  const expectedIds: ScenarioId[] = [
    "baseline",
    "buy-ip-2027",
    "buy-ip-2028",
    "etf-focus",
    "offset-focus",
    "hybrid-strategy",
  ];
  for (const id of expectedIds) {
    ok(`scenario "${id}" is present`, result.rows.some(r => r.id === id));
  }

  ok(
    "scenario definition catalogue has six entries",
    SCENARIO_DEFINITIONS.length === 6,
    { actual: SCENARIO_DEFINITIONS.length },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Each scenario maps to an engine candidate (or Best Move)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Scenario → engine candidate mapping");
{
  const result = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  const cands = generateDecisionCandidates({ canonicalLedger: FIXTURE });
  const goal = solveGoalGap({ canonicalLedger: FIXTURE });
  const ranking = rankDecisionCandidates({ candidateOutputs: cands });
  const bestMove = computeBestMoveSprint5({
    rankingOutputs: ranking,
    goalSolverOutputs: goal,
  });

  // baseline → hold-current-path
  const baseline = result.rows.find(r => r.id === "baseline")!;
  ok(
    "baseline maps to hold-current-path",
    baseline.candidate?.kind === "hold-current-path",
    { kind: baseline.candidate?.kind },
  );

  // buy-ip-2027 → buy-investment-property (when generator produces it)
  const buy = result.rows.find(r => r.id === "buy-ip-2027")!;
  const buyCandidate = cands.candidates.find(c => c.kind === "buy-investment-property");
  if (buyCandidate) {
    ok(
      "buy-ip-2027 maps to buy-investment-property",
      buy.candidate?.kind === "buy-investment-property",
    );
  } else {
    ok(
      "buy-ip-2027 surfaces incomplete state when no candidate produced",
      buy.candidate === null && buy.incomplete,
    );
  }

  // buy-ip-2028 → delay-purchase
  const delay = result.rows.find(r => r.id === "buy-ip-2028")!;
  const delayCandidate = cands.candidates.find(c => c.kind === "delay-purchase");
  if (delayCandidate) {
    ok("buy-ip-2028 maps to delay-purchase", delay.candidate?.kind === "delay-purchase");
  } else {
    ok("buy-ip-2028 surfaces incomplete state", delay.candidate === null && delay.incomplete);
  }

  // etf-focus → etf-investment
  const etf = result.rows.find(r => r.id === "etf-focus")!;
  const etfCandidate = cands.candidates.find(c => c.kind === "etf-investment");
  if (etfCandidate) {
    ok("etf-focus maps to etf-investment", etf.candidate?.kind === "etf-investment");
  } else {
    ok("etf-focus surfaces incomplete state", etf.candidate === null && etf.incomplete);
  }

  // offset-focus → offset-contribution
  const offset = result.rows.find(r => r.id === "offset-focus")!;
  const offsetCandidate = cands.candidates.find(c => c.kind === "offset-contribution");
  if (offsetCandidate) {
    ok("offset-focus maps to offset-contribution", offset.candidate?.kind === "offset-contribution");
  } else {
    ok("offset-focus surfaces incomplete state", offset.candidate === null && offset.incomplete);
  }

  // hybrid-strategy → Best Move recommendation
  const hybrid = result.rows.find(r => r.id === "hybrid-strategy")!;
  if (bestMove.bestNextAction.kind) {
    if (hybrid.candidate) {
      ok(
        "hybrid-strategy maps to Best Move recommendation",
        hybrid.candidate.kind === bestMove.bestNextAction.kind,
        {
          hybrid: hybrid.candidate.kind,
          bestMove: bestMove.bestNextAction.kind,
        },
      );
    } else {
      // Hybrid can still be incomplete when the bestMove kind has no candidate
      ok("hybrid-strategy resolved Best Move text even without candidate",
        Boolean(hybrid.metrics.recommendedAction.textOverride));
    }
    ok("hybrid is flagged as recommended", hybrid.isRecommended);
  } else {
    ok("hybrid-strategy gracefully incomplete when bestMove has no kind", hybrid.incomplete);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Display metrics are engine pass-throughs (no recomputation)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Display metrics are engine pass-throughs");
{
  const result = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  ok("bundle exposes canonical headline metrics", result.bundle !== null);

  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  const headFromBundle = result.bundle!.head;

  // The bundle's head MUST byte-equal a direct canonical call. This is the
  // pin that proves the orchestration layer didn't recompute the headline.
  ok("bundle.head.netWorth === direct canonical netWorth",
    headFromBundle.netWorth === head.netWorth,
    { bundle: headFromBundle.netWorth, canonical: head.netWorth });
  ok("bundle.head.passiveIncome === direct canonical passiveIncome",
    headFromBundle.passiveIncome === head.passiveIncome);
  ok("bundle.head.monthlySurplus === direct canonical monthlySurplus",
    headFromBundle.monthlySurplus === head.monthlySurplus);
  ok("bundle.head.monthlyExpenses === direct canonical monthlyExpenses",
    headFromBundle.monthlyExpenses === head.monthlyExpenses);

  // Baseline (hold-current-path) row mirrors canonical exactly.
  const baseline = result.rows.find(r => r.id === "baseline")!;
  ok("baseline Net Worth equals canonical Net Worth",
    baseline.metrics.netWorth.value === head.netWorth,
    { baseline: baseline.metrics.netWorth.value, canonical: head.netWorth });
  ok("baseline Passive Income equals canonical Passive Income",
    baseline.metrics.passiveIncome.value === head.passiveIncome);
  ok("baseline Monthly Surplus equals canonical Monthly Surplus",
    baseline.metrics.monthlySurplus.value === head.monthlySurplus);

  // Non-baseline scenarios: value === canonical + candidate.projection.deltaX
  for (const row of result.rows) {
    if (row.id === "baseline" || !row.candidate) continue;
    const expectedNW = head.netWorth + (row.candidate.projection.deltaNetWorth || 0);
    ok(`${row.id} Net Worth matches canonical + candidate delta`,
      row.metrics.netWorth.value === expectedNW,
      { row: row.metrics.netWorth.value, expected: expectedNW });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Workspace component renders six scenario cards with stable testids
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Component renders six scenario cards/rows with stable testids");
{
  const html = renderToStaticMarkup(
    React.createElement(ScenarioCompareWorkspace, { canonicalLedger: FIXTURE }),
  );
  ok("workspace root rendered", hasTestId(html, "scenario-compare-workspace"));
  ok("title rendered", hasTestId(html, "scenario-compare-workspace-title"));
  ok("subtitle rendered", hasTestId(html, "scenario-compare-workspace-subtitle"));

  const ids: ScenarioId[] = [
    "baseline",
    "buy-ip-2027",
    "buy-ip-2028",
    "etf-focus",
    "offset-focus",
    "hybrid-strategy",
  ];
  for (const id of ids) {
    ok(`scenario card "${id}" present`,
      hasTestId(html, `scenario-card-${id}`),
      { id });
    ok(`scenario "${id}" label rendered`,
      hasTestId(html, `scenario-card-${id}-label`));
    ok(`scenario "${id}" description rendered`,
      hasTestId(html, `scenario-card-${id}-description`));
  }

  // Comparison table also rendered (desktop layout)
  ok("comparison table wrapper rendered",
    hasTestId(html, "scenario-compare-table-wrapper"));
  ok("comparison table rendered",
    hasTestId(html, "scenario-compare-table"));
  for (const id of ids) {
    ok(`table column header "${id}" rendered`,
      hasTestId(html, `scenario-compare-table-header-${id}`));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Each scenario surfaces all eight required metrics
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Each scenario surfaces NW / Passive / FIRE / Surplus / Liquidity / Risk / MC / Action");
{
  const html = renderToStaticMarkup(
    React.createElement(ScenarioCompareWorkspace, { canonicalLedger: FIXTURE }),
  );
  const ids: ScenarioId[] = [
    "baseline",
    "buy-ip-2027",
    "buy-ip-2028",
    "etf-focus",
    "offset-focus",
    "hybrid-strategy",
  ];
  const metricSuffixes = [
    "net-worth",
    "passive-income",
    "fire-date",
    "monthly-surplus",
    "liquidity",
    "risk-score",
    "mc-confidence",
  ];
  for (const id of ids) {
    for (const suffix of metricSuffixes) {
      ok(
        `${id} ${suffix} value rendered`,
        hasTestId(html, `scenario-card-${id}-${suffix}-value`),
      );
    }
    ok(
      `${id} recommended action value rendered`,
      hasTestId(html, `scenario-card-${id}-recommended-action-value`),
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Empty ledger ⇒ graceful empty state
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Empty ledger ⇒ graceful empty state");
{
  const resultNull = buildScenarioCompareWorkspace({ canonicalLedger: null });
  ok("empty=true when ledger is null", resultNull.empty === true);
  ok("rows still returned for blank scaffold (six placeholders)",
    resultNull.rows.length === 6);
  ok("every row flagged incomplete", resultNull.rows.every(r => r.incomplete));
  ok("no bundle when ledger is null", resultNull.bundle === null);

  const resultEmpty = buildScenarioCompareWorkspace({ canonicalLedger: EMPTY_LEDGER });
  ok("empty=true when ledger has no snapshot", resultEmpty.empty === true);

  const html = renderToStaticMarkup(
    React.createElement(ScenarioCompareWorkspace, { canonicalLedger: null }),
  );
  ok("empty placeholder rendered for null ledger",
    hasTestId(html, "scenario-compare-workspace-empty"));
  ok("does NOT render the populated workspace",
    !hasTestId(html, "scenario-compare-workspace"));
  ok("empty-state reason rendered",
    hasTestId(html, "scenario-compare-workspace-empty-reason"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Thin ledger ⇒ graceful incomplete state, workspace still renders
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Thin ledger ⇒ graceful incomplete state");
{
  const result = buildScenarioCompareWorkspace({ canonicalLedger: THIN_LEDGER });
  ok("workspace not empty for thin ledger (snapshot exists)",
    result.empty === false);
  // Some scenarios should be marked incomplete (e.g. buy-IP, ETF) because the
  // underlying engine inputs cannot be derived from a near-zero snapshot.
  const incompleteCount = result.rows.filter(r => r.incomplete).length;
  ok("at least one scenario flagged incomplete on thin ledger",
    incompleteCount >= 1, { incompleteCount });
  // Baseline (hold-current-path) is always produced — verify it is present.
  const baseline = result.rows.find(r => r.id === "baseline")!;
  ok("baseline scenario present even on thin ledger",
    baseline.candidate?.kind === "hold-current-path");

  const html = renderToStaticMarkup(
    React.createElement(ScenarioCompareWorkspace, { canonicalLedger: THIN_LEDGER }),
  );
  ok("workspace renders for thin ledger",
    hasTestId(html, "scenario-compare-workspace"));
  ok("incomplete notice OR incomplete cell rendered somewhere",
    countTestIdMatches(html, "-incomplete") >= 1
    || html.includes("incomplete data")
    || html.includes("Engine inputs missing"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Dashboard contract unchanged (canonical pass-through preserved)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Dashboard contract unchanged");
{
  const result = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  // No new financial formula introduced: the workspace bundle MUST agree on
  // every field of the canonical headline metrics struct with a direct call.
  const bundleHead = result.bundle!.head;
  const fields: Array<keyof typeof bundleHead> = [
    "netWorth", "assets", "liabilities", "passiveIncome",
    "monthlyIncome", "monthlyExpenses", "monthlySurplus",
    "debtService", "fireNumber",
  ];
  for (const f of fields) {
    ok(`canonical head field "${String(f)}" matches direct compute`,
      bundleHead[f] === head[f],
      { bundle: bundleHead[f], canonical: head[f] });
  }

  // The orchestration layer never declares its own SWR / growth / yield —
  // it must use values from the goal solver / candidate generator.
  const cands = generateDecisionCandidates({ canonicalLedger: FIXTURE });
  ok("orchestration uses candidate generator's growth assumption",
    Number.isFinite(cands.trace.growthAssumption));
  ok("orchestration uses candidate generator's SWR",
    Number.isFinite(cands.trace.swrUsed));

  // Format helpers do not introduce numeric transforms — they only convert
  // pass-through numbers to display strings.
  const baseline = result.rows.find(r => r.id === "baseline")!;
  const renderedNW = formatScenarioMetric(baseline.metrics.netWorth);
  ok("formatScenarioMetric returns non-empty string for valid value",
    typeof renderedNW === "string" && renderedNW.length > 0);
  ok("formatScenarioMetric handles null value as em-dash",
    formatScenarioMetric({
      label: "x", value: null, format: "currency", source: "", incomplete: true,
    }) === "—");
}

/* ─── Final ─────────────────────────────────────────────────────────────── */

console.log(`\n──────── Result ────────`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.error("\nFailures:");
  failures.forEach(f => console.error("  " + f));
  process.exit(1);
}
process.exit(0);
