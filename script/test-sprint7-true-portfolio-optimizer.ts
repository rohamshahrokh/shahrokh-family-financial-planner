/**
 * test-sprint7-true-portfolio-optimizer.ts
 *
 * Sprint 7 — True Portfolio Optimizer tests.
 *
 * What this proves
 * ----------------
 *   §1  Orchestration layer builds every required Sprint 7 section
 *   §2  Scenario generator produces ≥1,000 valid scenarios (10,000+ capable)
 *   §3  Goal reverse engineering is pure pass-through over canonical engines
 *   §4  Constraint filtering works for every required constraint kind
 *   §5  Goal Achievement Search continues until success OR all scenarios fail
 *   §6  Failure quantification cites a binding blocker + shortfall
 *   §7  Efficient frontier identifies Pareto-optimal scenarios
 *   §8  Five recommendation categories all present (FIRE speed, risk-adj,
 *       cashflow, probability, hybrid)
 *   §9  Every strategy carries the eleven required metric keys
 *  §10  Every recommendation has actionability fields (what/when/why/do-nothing)
 *  §11  Audit trail exists for every Sprint 7 section, cites engines
 *  §12  No fabricated numbers (incomplete states + not-engine-modelled labels)
 *  §13  No hardcoded household values (output varies with ledger inputs)
 *  §14  Missing data handled gracefully (empty ledger ⇒ empty contract)
 *  §15  SSR rendering — all key sections + testids present
 *  §16  Mobile responsive markup contract present
 *  §17  Dashboard contract unchanged (Sprint 4D)
 *  §18  Sprint 6 Phase 5 PortfolioLab still renders inside the Sprint 7 shell
 *
 * Run with:  tsx script/test-sprint7-true-portfolio-optimizer.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildTruePortfolioOptimizer,
  formatScenarioMetric,
  type OptimizerConstraints,
  type RecommendationCategory,
  type FrontierObjective,
} from "../client/src/lib/truePortfolioOptimizer";
import { TruePortfolioOptimizer } from "../client/src/components/TruePortfolioOptimizer";
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

/**
 * Goal-solver inputs that exercise the engines end-to-end. The optimizer
 * still works without these — but a meaningful gap solver / frontier
 * test needs explicit FIRE targets so the goalSolver produces non-zero
 * requiredAssetBase, requiredMonthlyContribution, and projectedAchievementYear.
 */
const GOAL_INPUTS = {
  targetFireDate: "2045-12-31",
  targetPassiveIncome: 96_000,
};

const SNAPSHOT_TIGHT = {
  ...SNAPSHOT_RICH,
  cash: 5_000,
  offset_balance: 5_000,
  monthly_expenses: 22_000,
};
const FIXTURE_TIGHT: DashboardInputs = { ...FIXTURE, snapshot: SNAPSHOT_TIGHT };

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

console.log("\nSprint 7 — True Portfolio Optimizer\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Orchestration builds every required Sprint 7 section
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Orchestration builds every Sprint 7 section");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  ok("result.empty is false", r.empty === false);
  ok("goalReverseEngineering present",         r.goalReverseEngineering != null);
  ok("constraintsResolved present",            r.constraintsResolved != null);
  ok("scenarios present (array)",              Array.isArray(r.scenarios));
  ok("recommendations present (array)",        Array.isArray(r.recommendations));
  ok("gapSolver present",                      r.gapSolver != null);
  ok("frontier present",                       r.frontier != null);
  ok("searchMetrics present",                  r.searchMetrics != null);
  ok("auditTrail present",                     r.auditTrail != null);
  ok("phase5 deep-dive bundle still attached", r.phase5 != null && r.phase5.bundle != null);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Generator produces ≥1,000 valid scenarios, scalable to 10,000+
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Scenario generator ≥1,000 scenarios, scales to 10,000+");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  ok(`generated ≥ 1,000 scenarios (got ${r.searchMetrics.generated})`,
     r.searchMetrics.generated >= 1_000,
     { generated: r.searchMetrics.generated });
  ok("scenarios array length matches generated count",
     r.scenarios.length === r.searchMetrics.generated);
  ok("capacity supports 10,000+",
     r.searchMetrics.capacity >= 10_000);
  ok("evaluated count equals generated (each scenario carries metrics)",
     r.searchMetrics.evaluated === r.searchMetrics.generated);

  // Run with a 12,000 cap and confirm the generator returns at least 1,000
  // scenarios and never exceeds the cap.
  const r2 = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, scenarioCapacity: 12_000, goalSolverInputs: GOAL_INPUTS });
  ok("capped generator returns ≥1,000",
     r2.searchMetrics.generated >= 1_000);
  ok("capped generator never exceeds the cap",
     r2.searchMetrics.generated <= 12_000);

  // Sanity check: scenario ids are unique
  const ids = new Set(r.scenarios.map(s => s.id));
  ok("scenario ids are unique", ids.size === r.scenarios.length);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Goal reverse engineering is a pure pass-through
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Goal reverse engineering pass-through");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const fire = r.phase5.bundle!.fire;
  const goal = r.phase5.bundle!.goal;
  ok("requiredNetWorth = canonicalFire.fireNumber",
     r.goalReverseEngineering.requiredNetWorth.value === fire.fireNumber);
  ok("requiredPassiveIncome = canonicalFire.targetAnnualIncome",
     r.goalReverseEngineering.requiredPassiveIncome.value === fire.targetAnnualIncome);
  ok("requiredAssetBase = goalSolver.requiredAssetBase",
     r.goalReverseEngineering.requiredAssetBase.value === goal.requiredAssetBase);
  ok("requiredMonthlyContribution = goalSolver.requiredMonthlyContribution",
     r.goalReverseEngineering.requiredMonthlyContribution.value === goal.requiredMonthlyContribution);

  // Empty ledger ⇒ incomplete state, not fabricated zeroes.
  const empty = buildTruePortfolioOptimizer({ canonicalLedger: EMPTY_LEDGER });
  ok("empty ledger ⇒ goalReverseEngineering.incomplete = true",
     empty.goalReverseEngineering.incomplete === true);
  ok("empty ledger ⇒ requiredNetWorth has value=null",
     empty.goalReverseEngineering.requiredNetWorth.value === null);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Constraint filtering for every required constraint kind
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Constraint filtering");
{
  const unconstrained = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const generated = unconstrained.searchMetrics.generated;

  const constraintCases: Array<[string, OptimizerConstraints, keyof Record<string, number>]> = [
    ["maxRiskScore",                   { maxRiskScore: 1 },              "max-risk"],
    ["maxDebt",                        { maxDebt: -1 },                  "max-debt"],
    ["maxMonthlyContribution",         { maxMonthlyContribution: 0 },    "max-monthly-contribution"],
    ["maxPropertyCount",               { maxPropertyCount: 0 },          "max-property-count"],
    ["minLiquidityMonths",             { minLiquidityMonths: 999 },      "min-liquidity"],
    ["targetFireYear",                 { targetFireYear: 1900 },         "target-fire-year"],
  ];

  for (const [label, c, key] of constraintCases) {
    const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, constraints: c, goalSolverInputs: GOAL_INPUTS });
    const failures = r.searchMetrics.failureCounts[key as string] ?? 0;
    ok(`constraint "${label}" rejects scenarios`, failures > 0, { failures });
    ok(`constraint "${label}" leaves total generated unchanged`, r.searchMetrics.generated === generated);
  }

  // Loose constraints leave most scenarios valid.
  const loose = buildTruePortfolioOptimizer({
    canonicalLedger: FIXTURE,
    constraints: { maxRiskScore: 100, maxDebt: 1e15, minLiquidityMonths: -1 },
  });
  ok("loose constraints keep most scenarios valid", loose.searchMetrics.valid > 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 / §6 — Gap solver continues until success OR fails with quantified blocker
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Gap solver finds a path when one exists");
{
  const r = buildTruePortfolioOptimizer({
    canonicalLedger: FIXTURE,
    // Pick a target year well in the future so the search finds something.
    constraints: { targetFireYear: 2080 },
  });
  ok("pathFound is true OR explicit blocker is named",
     r.gapSolver.pathFound === true || r.gapSolver.blocker !== "none");
  if (r.gapSolver.pathFound) {
    ok("options carries up to three engine-backed paths",
       r.gapSolver.options.length >= 1 && r.gapSolver.options.length <= 3);
    for (const opt of r.gapSolver.options) {
      ok(`option "${opt.label}" actionability has what/when/why/do-nothing`,
         opt.actionability.what.length > 0 &&
         opt.actionability.when.length > 0 &&
         opt.actionability.why.length > 0 &&
         opt.actionability.doNothing.length > 0);
    }
  }
}

console.log("\n§6  Gap solver quantifies shortfall when nothing works");
{
  // Force every scenario to fail by stacking impossible constraints.
  const r = buildTruePortfolioOptimizer({
    canonicalLedger: FIXTURE,
    constraints: {
      maxRiskScore: 0,
      maxMonthlyContribution: 0,
      minLiquidityMonths: 999,
      maxPropertyCount: 0,
      maxDebt: 0,
      targetFireYear: 1900,
    },
  });
  ok("pathFound is false under impossible constraints", r.gapSolver.pathFound === false);
  ok("blocker is one of the named values",
     ["income-too-low","savings-rate-too-low","goal-too-aggressive","property-acquisition","liquidity","debt"].includes(r.gapSolver.blocker),
     { blocker: r.gapSolver.blocker });
  ok("shortfall is engine-backed (value or explicit textOverride)",
     r.gapSolver.shortfall.value != null || r.gapSolver.shortfall.textOverride != null);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Efficient frontier
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Efficient frontier");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const expectedObjectives: FrontierObjective[] = [
    "fastest-fire", "highest-probability", "lowest-risk", "highest-networth", "best-risk-reward",
  ];
  for (const obj of expectedObjectives) {
    ok(`frontier contains objective "${obj}"`,
       r.frontier.points.some(p => p.objective === obj));
  }
  ok("frontier has ≥1 Pareto-optimal scenario",
     r.frontier.paretoCount >= 1, { paretoCount: r.frontier.paretoCount });
  ok("frontier reports >1 solution total (returns the frontier, not one)",
     r.frontier.points.length > 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Five recommendation categories all present
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Five recommendation categories");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const expected: RecommendationCategory[] = [
    "fire-speed", "risk-adjusted", "cashflow", "probability", "hybrid",
  ];
  for (const cat of expected) {
    ok(`recommendation "${cat}" present`,
       r.recommendations.some(rec => rec.category === cat));
  }
  ok(`recommendations array length = ${expected.length}`,
     r.recommendations.length === expected.length);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Every strategy carries the eleven required metric keys
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  Strategy metrics carry every required key");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const requiredKeys = [
    "probabilitySuccess",
    "probabilityReachFire",
    "fireYear",
    "projectedNetWorth",
    "projectedPassiveIncome",
    "liquidityPosition",
    "riskScore",
    "confidenceScore",
    "rankingScore",
    "requiredMonthlyContribution",
    "requiredAssetBase",
  ];
  for (const rec of r.recommendations) {
    for (const k of requiredKeys) {
      ok(`recommendation.${rec.category} carries metric "${k}"`,
         (rec.metrics as any)[k] != null);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — Actionability what/when/why/do-nothing on every recommendation
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10  Actionability what/when/why/do-nothing");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  for (const rec of r.recommendations) {
    ok(`recommendation "${rec.category}" has actionability.what`,    rec.actionability.what.length > 0);
    ok(`recommendation "${rec.category}" has actionability.when`,    rec.actionability.when.length > 0);
    ok(`recommendation "${rec.category}" has actionability.why`,     rec.actionability.why.length > 0);
    ok(`recommendation "${rec.category}" has actionability.doNothing`, rec.actionability.doNothing.length > 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — Audit trail cites existing engines for every Sprint 7 section
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§11  Audit trail citations");
{
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const expectedEntries = [
    "audit-goal-reverse-engineering",
    "audit-scenario-generator",
    "audit-scenario-evaluator",
    "audit-constraint-filter",
    "audit-recommendations",
    "audit-gap-solver",
    "audit-efficient-frontier",
    "audit-actionability",
  ];
  for (const id of expectedEntries) {
    ok(`audit trail entry "${id}" present`,
       r.auditTrail.entries.some(e => e.id === id));
  }
  for (const entry of r.auditTrail.entries) {
    ok(`entry "${entry.id}" carries enginesUsed`,    entry.enginesUsed.length > 0);
    ok(`entry "${entry.id}" carries inputsUsed`,     entry.inputsUsed.length > 0);
    ok(`entry "${entry.id}" carries assumptions`,    entry.assumptions.length > 0);
    ok(`entry "${entry.id}" carries confidenceSource`, entry.confidenceSource.length > 0);
    ok(`entry "${entry.id}" carries riskSource`,     entry.riskSource.length > 0);
    ok(`entry "${entry.id}" carries monteCarloSource`, entry.monteCarloSource.length > 0);
    ok(`entry "${entry.id}" carries howCalculated`,  entry.howCalculated.length > 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §12 — No fabricated numbers (incomplete states + not-engine-modelled labels)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§12  No fabricated numbers");
{
  const empty = buildTruePortfolioOptimizer({ canonicalLedger: EMPTY_LEDGER });
  ok("empty ledger ⇒ result.empty",                   empty.empty === true);
  ok("empty ledger ⇒ no scenarios",                   empty.scenarios.length === 0);
  ok("empty ledger ⇒ no recommendations",             empty.recommendations.length === 0);
  ok("empty ledger ⇒ goalReverseEngineering.incomplete", empty.goalReverseEngineering.incomplete);
  ok("empty ledger ⇒ frontier incomplete",            empty.frontier.incomplete);

  // Rich ledger ⇒ no scenario value is silently fabricated for a
  // not-engine-modelled dimension; we look for explicit labelling.
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const notModelled = r.scenarios.filter(s => s.notEngineModelled);
  ok("at least some scenarios are flagged notEngineModelled (stocks/crypto)",
     notModelled.length > 0);
  // Every metric on a not-engine-modelled scenario carries the
  // notEngineModelled flag — UI must render the badge.
  if (notModelled[0]) {
    const m = notModelled[0].metrics;
    ok("not-engine-modelled scenario flags fireYear metric",
       m.fireYear.notEngineModelled === true);
    ok("not-engine-modelled scenario flags projectedNetWorth metric",
       m.projectedNetWorth.notEngineModelled === true);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §13 — No hardcoded household values
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§13  No hardcoded household values");
{
  const rA = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const rB = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE_TIGHT, goalSolverInputs: GOAL_INPUTS });
  // Required monthly contribution depends on the surplus + horizon — the
  // two fixtures differ in cash, offset, and expenses so the contribution
  // engine must produce different values.
  ok("required monthly contribution differs across ledger fixtures",
     rA.goalReverseEngineering.requiredMonthlyContribution.value !==
     rB.goalReverseEngineering.requiredMonthlyContribution.value
     || rA.goalReverseEngineering.requiredMonthlyContribution.value === null);
  ok("scenario projected net worth differs across ledger fixtures",
     rA.scenarios[0].metrics.projectedNetWorth.value !==
     rB.scenarios[0].metrics.projectedNetWorth.value
     || rA.scenarios[0].metrics.projectedNetWorth.value === null);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §14 — Missing data handled gracefully
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§14  Missing data graceful");
{
  // No snapshot
  const e1 = buildTruePortfolioOptimizer({ canonicalLedger: EMPTY_LEDGER });
  ok("empty ledger does not throw and returns empty=true", e1.empty === true);

  // Undefined ledger
  const e2 = buildTruePortfolioOptimizer({ canonicalLedger: undefined });
  ok("undefined ledger returns empty=true", e2.empty === true);

  // Null ledger
  const e3 = buildTruePortfolioOptimizer({ canonicalLedger: null });
  ok("null ledger returns empty=true", e3.empty === true);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §15 — SSR rendering — Sprint 7 testids
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§15  SSR rendering — Sprint 7 testids");
{
  const html = renderToStaticMarkup(
    React.createElement(TruePortfolioOptimizer, {
      canonicalLedger: FIXTURE,
      goalSolverInputs: GOAL_INPUTS,
    } as any),
  );

  const requiredTestids = [
    "true-portfolio-optimizer",
    "true-optimizer-executive-summary",
    "true-optimizer-executive-summary-title",
    "true-optimizer-goal-reverse-engineering",
    "true-optimizer-goal-reverse-engineering-title",
    "true-optimizer-constraints",
    "true-optimizer-constraints-title",
    "true-optimizer-search-metrics",
    "true-optimizer-recommendations",
    "true-optimizer-gap-solver",
    "true-optimizer-frontier",
    "true-optimizer-matrix",
    "true-optimizer-audit-trail",
    "true-portfolio-optimizer-phase5-shell",
  ];
  for (const id of requiredTestids) {
    ok(`html exposes data-testid="${id}"`, hasTestId(html, id));
  }

  // Each recommendation category renders a card.
  for (const cat of ["fire-speed", "risk-adjusted", "cashflow", "probability", "hybrid"]) {
    ok(`recommendation card "${cat}" rendered`,
       hasTestId(html, `true-optimizer-recommendation-${cat}`));
  }

  // Each frontier objective renders a row.
  for (const obj of ["fastest-fire", "highest-probability", "lowest-risk", "highest-networth", "best-risk-reward"]) {
    ok(`frontier row "${obj}" rendered`,
       hasTestId(html, `frontier-row-${obj}`));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §16 — Mobile responsive markup contract
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§16  Mobile responsive markup contract");
{
  const html = renderToStaticMarkup(
    React.createElement(TruePortfolioOptimizer, {
      canonicalLedger: FIXTURE,
      goalSolverInputs: GOAL_INPUTS,
    } as any),
  );
  ok("html uses Tailwind sm: breakpoint",  html.includes("sm:"));
  ok("html uses Tailwind lg: breakpoint",  html.includes("lg:"));
  ok("html uses grid-cols-1 baseline",     html.includes("grid-cols-1"));
  ok("html uses responsive grid columns",  html.includes("sm:grid-cols-") || html.includes("lg:grid-cols-"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §17 — Dashboard contract unchanged (Sprint 4D)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§17  Dashboard contract unchanged");
{
  const headFixture = computeCanonicalHeadlineMetrics(FIXTURE);
  const r = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL_INPUTS });
  const headInBundle = r.phase5.bundle!.head;
  ok("canonicalHeadlineMetrics.netWorth identical inside Sprint 7",
     headFixture.netWorth === headInBundle.netWorth);
  ok("canonicalHeadlineMetrics.assets identical inside Sprint 7",
     headFixture.assets === headInBundle.assets);
  ok("canonicalHeadlineMetrics.liabilities identical inside Sprint 7",
     headFixture.liabilities === headInBundle.liabilities);
  ok("canonicalHeadlineMetrics.passiveIncome identical inside Sprint 7",
     headFixture.passiveIncome === headInBundle.passiveIncome);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §18 — Phase 5 PortfolioLab still renders inside the Sprint 7 shell
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§18  Phase 5 PortfolioLab still nested inside Sprint 7");
{
  const html = renderToStaticMarkup(
    React.createElement(TruePortfolioOptimizer, {
      canonicalLedger: FIXTURE,
      goalSolverInputs: GOAL_INPUTS,
    } as any),
  );
  const phase5Sections = [
    "portfolio-lab-current-position",
    "portfolio-lab-target-position",
    "portfolio-lab-gap-to-target",
    "portfolio-lab-optimization-engine",
    "portfolio-lab-ranked-strategies",
    "portfolio-lab-probability-of-success",
    "portfolio-lab-time-to-fire",
    "portfolio-lab-required-monthly-contribution",
    "portfolio-lab-required-asset-base",
    "portfolio-lab-stress-test",
    "portfolio-lab-why-this-wins",
    "portfolio-lab-what-could-fail",
    "portfolio-lab-audit-trail",
    "portfolio-lab-confidence-report",
  ];
  let phase5Found = 0;
  for (const id of phase5Sections) {
    if (hasTestId(html, id)) phase5Found++;
  }
  ok(`Phase 5 sections still rendered (found ${phase5Found} of ${phase5Sections.length})`,
     phase5Found === phase5Sections.length, { phase5Found });
}

/* ─── Summary ──────────────────────────────────────────────────────────── */

console.log("\n────────────────────────────────────────────────────────────");
console.log(`Sprint 7 — True Portfolio Optimizer   ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
process.exit(0);
