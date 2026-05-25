/**
 * test-sprint6-phase5-portfolio-lab-optimizer.ts
 *
 * Sprint 6 Phase 5 — Portfolio Lab Optimizer tests.
 *
 * What this proves
 * ----------------
 *   §1  Orchestration layer builds all 14 required sections from a valid ledger
 *   §2  Portfolio Optimization Engine surfaces all 11 required levers
 *   §3  Display metrics are engine pass-throughs (no recomputation)
 *   §4  Top 10 ranked strategies render when engine candidates/rankings exist
 *   §5  Recommendation responds to input changes
 *   §6  Empty ledger ⇒ graceful empty state (no fabricated numbers)
 *   §7  Audit trail references existing engines (≥14 entries)
 *   §8  Strategic ideas carry no numbers and are labelled Not engine-modelled
 *   §9  Dashboard contract unchanged — canonical headline metrics still match
 *  §10  SSR rendering — all 14 sections + key testids present
 *  §11  UI does not recalculate headline metrics or import financial engines
 *  §12  No hardcoded household values (output varies with ledger inputs)
 *  §13  No fabricated dollar figures for not-engine-modelled levers
 *  §14  Mobile responsive markup contract present
 *
 * Run with:  tsx script/test-sprint6-phase5-portfolio-lab-optimizer.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";

import {
  buildPortfolioLabOptimizer,
  formatOptimizerMetric,
  OPTIMIZER_LEVER_DEFINITIONS,
  type OptimizerLeverId,
} from "../client/src/lib/portfolioLabOptimizer";
import { PortfolioLab } from "../client/src/components/PortfolioLab";
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

console.log("\nSprint 6 Phase 5 — Portfolio Lab Optimizer\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Orchestration builds every required section
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Orchestration builds all 14 required sections");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  ok("result is non-empty", !result.empty);
  ok("bundle is populated", result.bundle !== null);
  ok("currentPosition present",            result.currentPosition != null);
  ok("targetPosition present",             result.targetPosition != null);
  ok("gapToTarget present",                result.gapToTarget != null);
  ok("optimization present",               result.optimization != null);
  ok("rankedStrategies present",           result.rankedStrategies != null);
  ok("probabilityOfSuccess present",       result.probabilityOfSuccess != null);
  ok("timeToFire present",                 result.timeToFire != null);
  ok("requiredMonthlyContribution present", result.requiredMonthlyContribution != null);
  ok("requiredAssetBase present",          result.requiredAssetBase != null);
  ok("portfolioStressTest present",        result.portfolioStressTest != null);
  ok("whyThisWins present",                result.whyThisWins != null);
  ok("whatCouldFail present",              result.whatCouldFail != null);
  ok("auditTrail present",                 result.auditTrail != null);
  ok("confidenceReport present",           result.confidenceReport != null);
  ok("strategicIdeas present",             result.strategicIdeas != null);

  const validFeasibility = ["ON_TRACK", "STRETCH", "UNREALISTIC", "IMPOSSIBLE", "UNKNOWN"];
  ok(
    "gapToTarget.feasibility is a recognised verdict",
    validFeasibility.includes(result.gapToTarget.feasibility),
    { feasibility: result.gapToTarget.feasibility },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Optimization Engine — all 11 required levers
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Portfolio Optimization Engine — all 11 required levers");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  const requiredLevers: OptimizerLeverId[] = [
    "additional-property",
    "earlier-property",
    "delayed-property",
    "etf-increase",
    "stock-increase",
    "crypto-increase",
    "debt-reduction",
    "offset-allocation",
    "surplus-allocation",
    "hybrid-property-etf",
    "hybrid-debt-offset",
  ];
  ok(`engine exposes ${requiredLevers.length} lever definitions`,
     OPTIMIZER_LEVER_DEFINITIONS.length === requiredLevers.length);
  ok(`engine emits ${requiredLevers.length} lever rows`,
     result.optimization.levers.length === requiredLevers.length);
  for (const id of requiredLevers) {
    ok(`lever "${id}" is present`, result.optimization.levers.some(l => l.id === id));
  }

  // Hybrid / composition levers must be marked not-engine-modelled.
  const hybridA = result.optimization.levers.find(l => l.id === "hybrid-property-etf")!;
  const hybridB = result.optimization.levers.find(l => l.id === "hybrid-debt-offset")!;
  ok("hybrid-property-etf is marked notEngineModelled", hybridA.definition.notEngineModelled === true);
  ok("hybrid-debt-offset is marked notEngineModelled", hybridB.definition.notEngineModelled === true);

  // Each row must carry the eight required metric keys.
  for (const row of result.optimization.levers) {
    const m = row.metrics;
    const keys = [
      "deltaNetWorth", "deltaPassiveIncome", "deltaMonthlySurplus",
      "deltaLiquidityMonths", "deltaFireProgress",
      "rankingScore", "monteCarloProbability", "confidence",
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
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  const head = computeCanonicalHeadlineMetrics(FIXTURE);

  ok("currentPosition.netWorth == canonical head.netWorth",
     result.currentPosition.netWorth.value === head.netWorth,
     { uiValue: result.currentPosition.netWorth.value, canon: head.netWorth });

  ok("currentPosition.assets == canonical head.assets",
     result.currentPosition.assets.value === head.assets);

  ok("currentPosition.liabilities == canonical head.liabilities",
     result.currentPosition.liabilities.value === head.liabilities);

  ok("targetPosition.fireNumber == bundle.fire.fireNumber",
     result.targetPosition.fireNumber.value === result.bundle!.fire.fireNumber);

  ok("targetPosition.requiredAssetBase == bundle.goal.requiredAssetBase",
     result.targetPosition.requiredAssetBase.value === result.bundle!.goal.requiredAssetBase);

  ok("gapToTarget.netWorthGap == bundle.fire.gap",
     result.gapToTarget.netWorthGap.value === result.bundle!.fire.gap);

  ok("requiredMonthlyContribution.required == bundle.goal.requiredMonthlyContribution",
     result.requiredMonthlyContribution.required.value === result.bundle!.goal.requiredMonthlyContribution);

  ok("requiredAssetBase.required == bundle.goal.requiredAssetBase",
     result.requiredAssetBase.required.value === result.bundle!.goal.requiredAssetBase);

  ok("requiredAssetBase.current == bundle.goal.trace.currentInvestibleBase",
     result.requiredAssetBase.current.value === result.bundle!.goal.trace.currentInvestibleBase);

  // Top-1 strategy must equal the best move's bestNextAction id.
  if (result.rankedStrategies.strategies.length > 0) {
    const top = result.rankedStrategies.strategies[0];
    ok("top-ranked strategy == bundle.ranking.recommended.candidate.id",
       top.candidateId === result.bundle!.ranking.recommended!.candidate.id,
       { top: top.candidateId, recommended: result.bundle!.ranking.recommended?.candidate.id });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Top 10 ranked strategies
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Ranked strategies — up to top 10 from engine ranking");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  const expected = Math.min(10, result.bundle!.ranking.ranked.length);
  ok("strategies count matches ranking length (≤10)",
     result.rankedStrategies.strategies.length === expected,
     { strategies: result.rankedStrategies.strategies.length, ranking: result.bundle!.ranking.ranked.length });

  // Each strategy must carry pass-through deltas, not invented numbers.
  for (const s of result.rankedStrategies.strategies) {
    const c = result.bundle!.candidates.candidates.find(cc => cc.id === s.candidateId);
    ok(`strategy #${s.rank} resolves to a real candidate`, c != null);
    if (c) {
      ok(`strategy #${s.rank} deltaNetWorth == candidate.projection.deltaNetWorth`,
         s.metrics.deltaNetWorth.value === c.projection.deltaNetWorth);
      ok(`strategy #${s.rank} executionRisk == candidate.risk.executionRisk`,
         s.metrics.executionRisk.value === c.risk.executionRisk);
    }
  }

  // The recommended strategy must be flagged.
  const recommended = result.rankedStrategies.strategies.find(s => s.isRecommended);
  ok("at least one strategy is flagged as recommended",
     recommended != null,
     { ranked: result.rankedStrategies.strategies.map(s => ({ rank: s.rank, recommended: s.isRecommended })) });

  // Strategies must be in ascending rank order.
  let ascending = true;
  for (let i = 1; i < result.rankedStrategies.strategies.length; i++) {
    if (result.rankedStrategies.strategies[i].rank !== result.rankedStrategies.strategies[i - 1].rank + 1) {
      ascending = false;
      break;
    }
  }
  ok("strategies are in ascending rank order", ascending);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Recommendation changes when ledger inputs change
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Recommendation responds to input changes");
{
  const a = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });

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
  const b = buildPortfolioLabOptimizer({ canonicalLedger: HIGH_SURPLUS_FIXTURE });

  ok("high-surplus run has a non-null Best Move",
     b.bundle?.bestMove.bestNextAction.kind != null);

  // The two runs must differ in at least one of: best kind / Δ NW / confidence.
  const differ =
    a.bundle?.bestMove.bestNextAction.kind !== b.bundle?.bestMove.bestNextAction.kind
    || a.bundle?.bestMove.expectedImpact.deltaNetWorth !== b.bundle?.bestMove.expectedImpact.deltaNetWorth
    || a.bundle?.bestMove.confidenceScore.value !== b.bundle?.bestMove.confidenceScore.value;
  ok("Best Move output changes when ledger materially changes", differ);

  // Current position rises with the wealthier ledger.
  ok("current-position netWorth rises with high-surplus ledger",
     (b.currentPosition.netWorth.value ?? 0) > (a.currentPosition.netWorth.value ?? 0));

  // The Top-1 ranked strategy's deltaNetWorth (or score) should not be identical
  // across the two runs.
  if (a.rankedStrategies.strategies.length > 0 && b.rankedStrategies.strategies.length > 0) {
    const t1 = a.rankedStrategies.strategies[0];
    const t2 = b.rankedStrategies.strategies[0];
    const same =
      t1.candidateId === t2.candidateId
      && t1.metrics.deltaNetWorth.value === t2.metrics.deltaNetWorth.value
      && t1.score === t2.score;
    ok("top-ranked strategy differs across the two ledgers", !same);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Empty / thin ledger handled gracefully
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Empty ledger handled gracefully");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: EMPTY_LEDGER });
  ok("empty=true", result.empty);
  ok("bundle is null", result.bundle === null);
  ok("strategies empty", result.rankedStrategies.strategies.length === 0);
  ok("all 11 lever rows still rendered (incomplete)",
     result.optimization.levers.length === 11);
  ok("netWorth metric is null on empty",
     result.currentPosition.netWorth.value == null);
  ok("currentProjection on probabilityOfSuccess is incomplete",
     result.probabilityOfSuccess.bestMoveConfidence.incomplete);
  // Even on empty, strategic ideas catalogue is returned.
  ok("strategic ideas catalogue returned on empty",
     result.strategicIdeas.ideas.length > 0);
}

console.log("\n§6b Thin ledger renders without fabricating values");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: THIN_LEDGER });
  ok("thin ledger not flagged empty", !result.empty);
  ok("audit trail has entries", result.auditTrail.entries.length >= 10);
  // Some metrics MUST be flagged incomplete because there is no income.
  const someIncomplete =
    result.gapToTarget.incomplete
    || result.currentPosition.incomplete
    || result.optimization.incomplete;
  ok("thin ledger flagged incomplete somewhere", someIncomplete);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Audit trail references real engines
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Audit trail references existing engines (≥ 14 entries)");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  ok("audit trail has at least 14 entries",
     result.auditTrail.entries.length >= 14,
     { count: result.auditTrail.entries.length });

  const allEngines = new Set<string>();
  for (const e of result.auditTrail.entries) {
    for (const en of e.enginesUsed) allEngines.add(en);
    ok(`entry "${e.id}" references at least one engine`, e.enginesUsed.length > 0);
    ok(`entry "${e.id}" has inputsUsed list`, Array.isArray(e.inputsUsed) && e.inputsUsed.length > 0);
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
 * §8 — Strategic ideas — numeric-free + "Not engine-modelled" label
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Strategic ideas — no numbers, labelled Not engine-modelled");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  ok("strategic ideas non-empty", result.strategicIdeas.ideas.length >= 6);
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
 * §9 — Dashboard contract unchanged
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  Dashboard contract — canonical headline metrics unchanged");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  ok("bundle.head.netWorth == canonical head.netWorth",
     result.bundle!.head.netWorth === head.netWorth);
  ok("bundle.head.assets == canonical head.assets",
     result.bundle!.head.assets === head.assets);
  ok("bundle.head.liabilities == canonical head.liabilities",
     result.bundle!.head.liabilities === head.liabilities);
  ok("bundle.head.passiveIncome == canonical head.passiveIncome",
     result.bundle!.head.passiveIncome === head.passiveIncome);
  ok("bundle.head.monthlySurplus == canonical head.monthlySurplus",
     result.bundle!.head.monthlySurplus === head.monthlySurplus);
  ok("bundle.head.fireNumber == canonical head.fireNumber",
     result.bundle!.head.fireNumber === head.fireNumber);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — SSR rendering: structure + data-testids
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10 SSR rendering — markup contract");
{
  const html = renderToStaticMarkup(
    React.createElement(PortfolioLab, { canonicalLedger: FIXTURE }),
  );

  // Root
  ok("root testid present", hasTestId(html, "portfolio-lab-root"));

  // All 14 required section testids
  const sectionTestIds = [
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
  for (const tid of sectionTestIds) {
    ok(`section testid "${tid}" present`, hasTestId(html, tid));
  }
  // Strategic ideas section (carried over from Phase 4)
  ok("strategic-ideas testid present", hasTestId(html, "portfolio-lab-strategic-ideas"));

  // 11 lever rows
  ok("eleven optimization-lever rows in markup",
     countTestIdMatches(html, "portfolio-lab-lever-") >= 11,
     { count: countTestIdMatches(html, "portfolio-lab-lever-") });

  // Audit toggles
  ok("at least 14 audit toggles", countTestIdMatches(html, "portfolio-lab-audit-") >= 14);

  // Strategic ideas labels rendered
  ok("strategic ideas labelled Not engine-modelled",
     html.includes("Not engine-modelled"));

  // No fabricated dollar amounts inside strategic ideas section.
  const ideasStart = html.indexOf('data-testid="portfolio-lab-strategic-ideas"');
  const ideasEnd = html.indexOf("</section>", ideasStart);
  const ideasMarkup = html.slice(ideasStart, ideasEnd);
  ok("strategic ideas markup has no $-amount",
     !/\$\s*\d/.test(ideasMarkup));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — UI does not recalculate headline metrics
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§11 UI does not recalculate headline metrics");
{
  const componentSource = fs.readFileSync(
    "client/src/components/PortfolioLab.tsx",
    "utf-8",
  );
  ok("component does not import canonicalNetWorth",
     !componentSource.includes("canonicalNetWorth"));
  ok("component does not import canonicalHeadlineMetrics computer",
     !componentSource.includes("computeCanonicalHeadlineMetrics"));
  ok("component does not import canonicalFire computer",
     !componentSource.includes("computeCanonicalFire"));
  ok("component does not import decisionCandidates generator",
     !componentSource.includes("generateDecisionCandidates"));
  ok("component does not import decisionRanking",
     !componentSource.includes("rankDecisionCandidates"));
  ok("component does not import bestMoveEngine",
     !componentSource.includes("computeBestMoveSprint5"));
  ok("component does not import goalSolver",
     !componentSource.includes("solveGoalGap"));
  ok("component does not import cfoAdvisor",
     !componentSource.includes("generateCFOInsights"));
  // Page must not bypass the orchestration layer either.
  const pageSource = fs.readFileSync(
    "client/src/pages/portfolio-lab.tsx",
    "utf-8",
  );
  ok("page does not import canonicalHeadlineMetrics",
     !pageSource.includes("computeCanonicalHeadlineMetrics"));
  ok("page does not import decisionCandidates",
     !pageSource.includes("generateDecisionCandidates"));
  ok("page does not import bestMoveEngine",
     !pageSource.includes("computeBestMoveSprint5"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §12 — No hardcoded household values
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§12 No hardcoded household values");
{
  // Two distinct ledgers MUST produce distinct headline outputs in the
  // optimizer. If outputs are identical, the orchestrator is masking a
  // hardcoded value somewhere.
  const a = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });
  const ALT_FIXTURE: DashboardInputs = {
    ...FIXTURE,
    snapshot: {
      ...SNAPSHOT_RICH,
      ppor: 800_000,
      cash: 10_000,
      mortgage: 600_000,
      roham_monthly_income: 8_000,
      fara_monthly_income: 7_000,
      monthly_expenses: 11_000,
      fire_target_monthly_income: 6_000,
    },
  };
  const b = buildPortfolioLabOptimizer({ canonicalLedger: ALT_FIXTURE });

  const diffNetWorth = a.currentPosition.netWorth.value !== b.currentPosition.netWorth.value;
  ok("netWorth differs across distinct ledgers", diffNetWorth);

  const diffFire = a.targetPosition.fireNumber.value !== b.targetPosition.fireNumber.value;
  ok("FIRE number differs across distinct ledgers", diffFire);

  const diffGap = a.gapToTarget.netWorthGap.value !== b.gapToTarget.netWorthGap.value;
  ok("net-worth gap differs across distinct ledgers", diffGap);

  // No metric source should literally be the string "hardcoded".
  for (const e of a.auditTrail.entries) {
    ok(`audit "${e.id}" does not cite "hardcoded"`,
       !e.howCalculated.toLowerCase().includes("hardcoded")
       && !e.confidenceSource.toLowerCase().includes("hardcoded")
       && !e.riskSource.toLowerCase().includes("hardcoded"));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §13 — No fabricated dollar figures for not-engine-modelled levers
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§13 Not-engine-modelled levers: no fabricated dollar values");
{
  const result = buildPortfolioLabOptimizer({ canonicalLedger: FIXTURE });

  // Composition levers without an underlying candidate must surface "—"
  // in their formatted output rather than a number.
  const hybridB = result.optimization.levers.find(l => l.id === "hybrid-debt-offset")!;
  // hybrid-debt-offset maps to debt-reduction candidate when present (pass-
  // through). When NO candidate matches the lever, the row must surface
  // null+incomplete.
  if (!hybridB.candidate) {
    ok("hybrid-debt-offset deltaNetWorth is null when no candidate matched",
       hybridB.metrics.deltaNetWorth.value == null);
    ok("hybrid-debt-offset deltaNetWorth renders as '—'",
       formatOptimizerMetric(hybridB.metrics.deltaNetWorth) === "—");
  } else {
    // When a candidate is matched, the row carries the candidate's deltas
    // — but the lever is still marked notEngineModelled so the UI shows
    // the disclaimer.
    ok("hybrid-debt-offset is marked notEngineModelled even when candidate matched",
       hybridB.definition.notEngineModelled === true);
    ok("hybrid-debt-offset deltaNetWorth comes from the candidate, not invented",
       hybridB.metrics.deltaNetWorth.value === hybridB.candidate.projection.deltaNetWorth);
  }

  // Same check for hybrid-property-etf.
  const hybridA = result.optimization.levers.find(l => l.id === "hybrid-property-etf")!;
  if (hybridA.candidate) {
    ok("hybrid-property-etf deltaNetWorth == its mapped candidate",
       hybridA.metrics.deltaNetWorth.value === hybridA.candidate.projection.deltaNetWorth);
  } else {
    ok("hybrid-property-etf deltaNetWorth is null without candidate",
       hybridA.metrics.deltaNetWorth.value == null);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §14 — Mobile responsive markup contract
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§14 Mobile responsive markup contract");
{
  const html = renderToStaticMarkup(
    React.createElement(PortfolioLab, { canonicalLedger: FIXTURE }),
  );
  // The root must use a flex column container so it stacks on mobile.
  ok("root uses flex-col layout", /class="[^"]*flex flex-col/.test(html));
  // Each card grid uses responsive breakpoints (sm:/lg:).
  ok("at least one section grid uses sm:grid-cols-* breakpoint", /sm:grid-cols-\d/.test(html));
  ok("at least one section grid uses lg:grid-cols-* breakpoint", /lg:grid-cols-\d/.test(html));
  // Padding scales between mobile and sm.
  ok("padding uses responsive sm:p-* utility", /sm:p-\d/.test(html));
}

/* ─── Summary ──────────────────────────────────────────────────────────── */

console.log(`\n────────────────────────────────────────`);
console.log(`Sprint 6 Phase 5 — Portfolio Lab Optimizer`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
} else {
  console.log(`All Portfolio Lab Optimizer tests passed.`);
  process.exit(0);
}
