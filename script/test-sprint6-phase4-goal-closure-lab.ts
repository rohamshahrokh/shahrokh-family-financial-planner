/**
 * test-sprint6-phase4-goal-closure-lab.ts
 *
 * Sprint 6 Phase 4 — Goal Closure Lab tests.
 *
 * What this proves
 * ----------------
 *   §1  Orchestration layer builds every required section from a valid ledger
 *   §2  Path Comparison surfaces all seven required paths
 *   §3  Display metrics are engine pass-throughs (no recomputation)
 *   §4  Recommendation changes when engine inputs change
 *   §5  Empty ledger ⇒ graceful empty state (no fabricated numbers)
 *   §6  Audit trail is present and references real engines
 *   §7  Strategic ideas carry no numbers and are labelled Not engine-modelled
 *   §8  Dashboard contract unchanged — canonical headline metrics still match
 *       between the closure-lab bundle and a direct canonical call
 *   §9  SSR rendering works (mobile-friendly markup, all major data-testids)
 *
 * Run with:  tsx script/test-sprint6-phase4-goal-closure-lab.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";

import {
  buildGoalClosureLab,
  formatClosureMetric,
  CLOSURE_PATH_DEFINITIONS,
  type ClosurePathId,
} from "../client/src/lib/goalClosureLab";
import { GoalClosureLab } from "../client/src/components/GoalClosureLab";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";

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

/* ─── Fixtures ─────────────────────────────────────────────────────────── */

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

console.log("\nSprint 6 Phase 4 — Goal Closure Lab\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Orchestration builds every required section
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Orchestration builds every required section");
{
  const result = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  ok("result is non-empty", !result.empty);
  ok("bundle is populated", result.bundle !== null);
  ok("goal status present", result.goalStatus != null);
  ok("gap analysis present", result.gapAnalysis != null);
  ok("path comparison present", Array.isArray(result.pathComparison));
  ok("best path present", result.bestPath != null);
  ok("action plan present", result.actionPlan != null);
  ok("audit trail present", result.auditTrail != null);
  ok("strategic ideas present", result.strategicIdeas != null);

  // Status must come from goal-solver feasibility (or UNKNOWN), not invented.
  const validStatuses = ["ON_TRACK", "STRETCH", "UNREALISTIC", "IMPOSSIBLE", "UNKNOWN"];
  ok(
    "goalStatus.status is a recognised feasibility value",
    validStatuses.includes(result.goalStatus.status),
    { status: result.goalStatus.status },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Path Comparison surfaces all seven required paths
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Path Comparison — seven required paths");
{
  const result = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  const expectedIds: ClosurePathId[] = [
    "current-plan",
    "etf-increase",
    "earlier-property",
    "additional-property",
    "hybrid-property-etf",
    "debt-reduction",
    "delayed-fire",
  ];
  ok("seven path definitions exposed", CLOSURE_PATH_DEFINITIONS.length === 7);
  ok("seven path rows produced", result.pathComparison.length === 7);
  for (const id of expectedIds) {
    ok(`path "${id}" is present`, result.pathComparison.some(r => r.id === id));
  }

  // Each row must carry the eight required display metric keys.
  for (const row of result.pathComparison) {
    const m = row.metrics;
    const keys = [
      "fireAge", "netWorth", "passiveIncome", "monthlySurplus",
      "liquidityImpact", "riskScore", "monteCarloProbability", "confidence",
    ] as const;
    for (const k of keys) {
      ok(`row "${row.id}" exposes metric "${k}"`, (m as any)[k] != null);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Display metrics are engine pass-throughs
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Display metrics are engine pass-throughs");
{
  const result = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  const head = computeCanonicalHeadlineMetrics(FIXTURE);

  // Goal status: target == canonicalFire.fireNumber
  ok(
    "goalStatus.target == bundle.fire.fireNumber",
    result.goalStatus.target.value === result.bundle!.fire.fireNumber,
    { target: result.goalStatus.target.value, fireNumber: result.bundle!.fire.fireNumber },
  );

  // Goal status: currentProjection == canonicalHeadlineMetrics.netWorth (==head.netWorth)
  ok(
    "goalStatus.currentProjection == canonical head.netWorth",
    result.goalStatus.currentProjection.value === head.netWorth,
    {
      uiValue: result.goalStatus.currentProjection.value,
      canonicalNetWorth: head.netWorth,
    },
  );

  // Gap analysis: passive income gap == goalSolver.requiredPassiveIncomeGap
  ok(
    "gapAnalysis.passiveIncomeGap == goal.requiredPassiveIncomeGap",
    result.gapAnalysis.passiveIncomeGap.value === result.bundle!.goal.requiredPassiveIncomeGap
      || (result.gapAnalysis.passiveIncomeGap.value === 0
          && result.bundle!.goal.requiredPassiveIncomeGap <= 0),
    {
      uiValue: result.gapAnalysis.passiveIncomeGap.value,
      goalSolver: result.bundle!.goal.requiredPassiveIncomeGap,
    },
  );

  // Current-plan path == hold-current-path candidate (no delta vs baseline)
  const currentPlan = result.pathComparison.find(r => r.id === "current-plan")!;
  ok(
    "current-plan maps to hold-current-path",
    currentPlan.candidate?.kind === "hold-current-path",
  );
  ok(
    "current-plan netWorth == canonical head.netWorth",
    currentPlan.metrics.netWorth.value === head.netWorth,
    { row: currentPlan.metrics.netWorth.value, head: head.netWorth },
  );

  // Best Path expectedImpact references the Best Move engine outputs verbatim.
  const bestPath = result.bestPath;
  const expectedImpact = result.bundle!.bestMove.expectedImpact;
  const deltaNw = bestPath.expectedImpact.find(m => m.label === "Δ Net Worth");
  ok(
    "bestPath Δ Net Worth == bestMove.expectedImpact.deltaNetWorth",
    deltaNw?.value === expectedImpact.deltaNetWorth,
    { deltaNw: deltaNw?.value, bm: expectedImpact.deltaNetWorth },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Recommendation changes when engine inputs change
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Recommendation responds to input changes");
{
  // Two ledgers with materially different surplus + assets — the Best Move
  // engine output should differ.
  const a = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  const HIGH_SURPLUS_FIXTURE: DashboardInputs = {
    ...FIXTURE,
    snapshot: {
      ...SNAPSHOT_RICH,
      roham_monthly_income: 30_000,
      fara_monthly_income: 25_000,
      monthly_expenses: 8_000,
      cash: 500_000,
    },
  };
  const b = buildGoalClosureLab({ canonicalLedger: HIGH_SURPLUS_FIXTURE });

  ok(
    "high-surplus run has a non-null Best Move",
    b.bundle?.bestMove.bestNextAction.kind != null,
  );

  // The two runs must differ in at least one of: bestNextAction.kind,
  // expectedImpact.deltaNetWorth, or confidenceScore.value.
  const differ =
    a.bundle?.bestMove.bestNextAction.kind !== b.bundle?.bestMove.bestNextAction.kind
    || a.bundle?.bestMove.expectedImpact.deltaNetWorth
       !== b.bundle?.bestMove.expectedImpact.deltaNetWorth
    || a.bundle?.bestMove.confidenceScore.value
       !== b.bundle?.bestMove.confidenceScore.value;
  ok("Best Move output changes when ledger materially changes", differ, {
    a_kind: a.bundle?.bestMove.bestNextAction.kind,
    b_kind: b.bundle?.bestMove.bestNextAction.kind,
    a_delta: a.bundle?.bestMove.expectedImpact.deltaNetWorth,
    b_delta: b.bundle?.bestMove.expectedImpact.deltaNetWorth,
  });

  // Goal Status — the high-surplus ledger has more current NW, so the
  // currentProjection value should be strictly larger.
  ok(
    "goalStatus.currentProjection rises with high-surplus ledger",
    (b.goalStatus.currentProjection.value ?? 0)
      > (a.goalStatus.currentProjection.value ?? 0),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Empty ledger ⇒ graceful empty state (no fabricated numbers)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Empty ledger handled gracefully");
{
  const result = buildGoalClosureLab({ canonicalLedger: EMPTY_LEDGER });
  ok("empty=true", result.empty);
  ok("bundle is null", result.bundle === null);
  ok("seven path rows still rendered (incomplete)", result.pathComparison.length === 7);
  ok("every metric on the empty status is null", result.goalStatus.target.value == null);
  ok("currentProjection is null", result.goalStatus.currentProjection.value == null);
  // Even on empty, strategic ideas catalogue is returned.
  ok("strategic ideas catalogue returned on empty", result.strategicIdeas.ideas.length > 0);
}

console.log("\n§5b Thin ledger renders without fabricating values");
{
  const result = buildGoalClosureLab({ canonicalLedger: THIN_LEDGER });
  ok("thin ledger not flagged empty", !result.empty);
  ok("audit trail has entries", result.auditTrail.entries.length >= 4);
  // Some metrics MUST be flagged incomplete because the household has no
  // income / no investible base.
  const someIncomplete =
    result.gapAnalysis.incomplete
    || result.goalStatus.incomplete
    || result.pathComparison.some(r => r.incomplete);
  ok("thin ledger flagged incomplete somewhere", someIncomplete);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Audit trail references real engines
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Audit trail references existing engines");
{
  const result = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  ok("audit trail has at least 5 entries", result.auditTrail.entries.length >= 5);
  const allEngines = new Set<string>();
  for (const e of result.auditTrail.entries) {
    for (const en of e.enginesUsed) allEngines.add(en);
    ok(`entry "${e.id}" references at least one engine`, e.enginesUsed.length > 0);
    ok(`entry "${e.id}" has assumptions list`, Array.isArray(e.assumptions));
    ok(`entry "${e.id}" has howCalculated text`, e.howCalculated.length > 30);
    ok(`entry "${e.id}" has confidenceSource`, e.confidenceSource.length > 0);
    ok(`entry "${e.id}" has riskSource`, e.riskSource.length > 0);
    ok(`entry "${e.id}" has monteCarloSource`, e.monteCarloSource.length > 0);
  }
  // Required engines must be cited somewhere in the audit trail.
  const expectedEngines = [
    "canonicalHeadlineMetrics",
    "canonicalFire",
    "goalSolver",
    "decisionCandidates",
    "decisionRanking",
    "bestMoveEngineSprint5",
    "cfoAdvisor",
  ];
  for (const en of expectedEngines) {
    ok(`audit trail cites "${en}"`, allEngines.has(en), { allEngines: [...allEngines] });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Strategic ideas: no numbers + Not engine-modelled label
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Strategic ideas — no numbers, labelled Not engine-modelled");
{
  const result = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  ok("strategic ideas non-empty", result.strategicIdeas.ideas.length >= 6);
  // None of the ideas can carry a numeric value field of any kind.
  // The shape doesn't include `value` — assert the body string also has no
  // monetary amounts.
  const dollarRe = /\$\s*\d/;
  const numRe = /\b\d+(?:\.\d+)?\s*(?:%|k|K|M|million|years?|months?|mo)\b/;
  for (const idea of result.strategicIdeas.ideas) {
    ok(`idea "${idea.id}" carries notEngineModelled=true`, idea.notEngineModelled === true);
    ok(`idea "${idea.id}" body has no $-amount`, !dollarRe.test(idea.body), { body: idea.body });
    ok(`idea "${idea.id}" body has no monetary unit number`, !numRe.test(idea.body), { body: idea.body });
    ok(`idea "${idea.id}" title has no $-amount`, !dollarRe.test(idea.title));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Dashboard contract unchanged
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Dashboard contract — canonical headline metrics unchanged");
{
  const result = buildGoalClosureLab({ canonicalLedger: FIXTURE });
  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  ok("bundle.head.netWorth == canonical head.netWorth", result.bundle!.head.netWorth === head.netWorth);
  ok("bundle.head.assets == canonical head.assets", result.bundle!.head.assets === head.assets);
  ok("bundle.head.liabilities == canonical head.liabilities", result.bundle!.head.liabilities === head.liabilities);
  ok("bundle.head.passiveIncome == canonical head.passiveIncome", result.bundle!.head.passiveIncome === head.passiveIncome);
  ok("bundle.head.monthlySurplus == canonical head.monthlySurplus", result.bundle!.head.monthlySurplus === head.monthlySurplus);
  ok("bundle.head.fireNumber == canonical head.fireNumber", result.bundle!.head.fireNumber === head.fireNumber);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — SSR rendering: structure + data-testids
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  SSR rendering — markup contract");
{
  const html = renderToStaticMarkup(
    React.createElement(GoalClosureLab, { canonicalLedger: FIXTURE }),
  );

  // Root + 7 major sections
  ok("root testid present", hasTestId(html, "closure-lab-root"));
  ok("goal status testid present", hasTestId(html, "closure-lab-goal-status"));
  ok("gap analysis testid present", hasTestId(html, "closure-lab-gap-analysis"));
  ok("path comparison testid present", hasTestId(html, "closure-lab-path-comparison"));
  ok("best path testid present", hasTestId(html, "closure-lab-best-path"));
  ok("action plan testid present", hasTestId(html, "closure-lab-action-plan"));
  ok("audit trail testid present", hasTestId(html, "closure-lab-audit-trail"));
  ok("strategic ideas testid present", hasTestId(html, "closure-lab-strategic-ideas"));

  // Path rows rendered with testids
  ok("seven closure-lab-path-* rows in markup", countTestIdMatches(html, "closure-lab-path-") >= 7);

  // Audit expanders rendered (5 entries minimum)
  ok("at least five audit toggles", countTestIdMatches(html, "closure-lab-audit-") >= 5);

  // Strategic idea labels rendered
  ok(
    "strategic ideas labelled Not engine-modelled",
    html.includes("Not engine-modelled"),
  );

  // No fabricated dollar amounts inside strategic ideas section.
  const ideasStart = html.indexOf('data-testid="closure-lab-strategic-ideas"');
  const ideasEnd = html.indexOf("</section>", ideasStart);
  const ideasMarkup = html.slice(ideasStart, ideasEnd);
  ok(
    "strategic ideas markup has no $-amount",
    !/\$\s*\d/.test(ideasMarkup),
  );

  // Action items rendered
  ok("action this-month group rendered", hasTestId(html, "closure-lab-action-this-month"));
  ok("action next-3-months group rendered", hasTestId(html, "closure-lab-action-next-3-months"));
  ok("action next-12-months group rendered", hasTestId(html, "closure-lab-action-next-12-months"));
  ok("action major-milestones group rendered", hasTestId(html, "closure-lab-action-major-milestones"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — UI does not recalculate headline metrics
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10 UI does not recalculate headline metrics");
{
  // The component must not import canonicalNetWorth / passive income
  // selectors directly. The only metric source allowed is goalClosureLab.ts.
  const componentSource = fs.readFileSync(
    "client/src/components/GoalClosureLab.tsx",
    "utf-8",
  );
  ok(
    "component does not import canonicalNetWorth",
    !componentSource.includes("canonicalNetWorth"),
  );
  ok(
    "component does not import canonicalHeadlineMetrics",
    !componentSource.includes("computeCanonicalHeadlineMetrics"),
  );
  ok(
    "component does not import canonicalFire",
    !componentSource.includes("computeCanonicalFire"),
  );
  ok(
    "component does not import decisionCandidates",
    !componentSource.includes("generateDecisionCandidates"),
  );
  ok(
    "component does not import bestMoveEngine",
    !componentSource.includes("computeBestMoveSprint5"),
  );
}

/* ─── Summary ──────────────────────────────────────────────────────────── */

console.log(`\n────────────────────────────────────────`);
console.log(`Sprint 6 Phase 4 — Goal Closure Lab`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
} else {
  console.log(`All Goal Closure Lab tests passed.`);
  process.exit(0);
}
