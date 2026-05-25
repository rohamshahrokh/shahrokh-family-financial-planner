/**
 * capture-sprint7-artifacts.ts
 *
 * Server-side renders the Sprint 7 True Portfolio Optimizer at both
 * desktop and mobile root containers and writes the HTML and JSON
 * payloads to `screenshots/sprint7/`. These are the deployment-ready
 * artifact snapshots for the PR. Pure SSR — no headless browser
 * required.
 *
 * Run with: tsx script/capture-sprint7-artifacts.ts
 */

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildTruePortfolioOptimizer,
  formatScenarioMetric,
} from "../client/src/lib/truePortfolioOptimizer";
import { TruePortfolioOptimizer } from "../client/src/components/TruePortfolioOptimizer";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

const SNAPSHOT_RICH = {
  ppor: 1_510_000, cash: 40_000, offset_balance: 222_000, super_balance: 88_000,
  stocks: 0, crypto: 0, cars: 65_000, iran_property: 150_000,
  mortgage: 1_200_000, mortgage_rate: 5.85, mortgage_term_years: 28, mortgage_loan_type: "PI",
  other_debts: 19_000, roham_monthly_income: 15_466.67, fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000, expenses_includes_debt: true, rental_income_total: 0,
  fire_target_monthly_income: 8_000, safe_withdrawal_rate: 4,
};
const FIXTURE: DashboardInputs = {
  snapshot: SNAPSHOT_RICH,
  properties: [], stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
  todayIso: "2026-05-25",
};
const GOAL_INPUTS = { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 };

const outDir = path.resolve(process.cwd(), "screenshots/sprint7");
fs.mkdirSync(outDir, { recursive: true });

function frame(title: string, body: string, mobile: boolean): string {
  // Minimal Tailwind-compatible reset + scope. The artifact is for audit
  // review of the SSR markup, not a pixel-perfect screenshot — but the
  // testids and structure match what production renders.
  const viewport = mobile ? "width=375" : "width=1440";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="${viewport}, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { background: #0d1117; color: #e6edf3; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; }
    .container { ${mobile ? "max-width: 375px;" : "max-width: 1280px;"} margin: 0 auto; padding: 16px; }
    h1, h2, h3 { color: #f0f6fc; }
    a { color: #58a6ff; }
    section, article { border: 1px solid #30363d; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #161b22; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #30363d; font-size: 12px; }
    input { background: #0d1117; color: #e6edf3; border: 1px solid #30363d; padding: 4px 8px; border-radius: 4px; }
    .text-foreground, .font-semibold { color: #f0f6fc; }
    .text-muted-foreground { color: #8b949e; }
    .text-emerald-700 { color: #2ea043; }
    .text-amber-500, .text-amber-700 { color: #d29922; }
    .text-rose-700 { color: #f85149; }
    .opacity-70 { opacity: 0.7; }
    .opacity-80 { opacity: 0.8; }
    .italic { font-style: italic; }
    .tabular-nums { font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

const html = renderToStaticMarkup(
  React.createElement(TruePortfolioOptimizer, {
    canonicalLedger: FIXTURE,
    goalSolverInputs: GOAL_INPUTS,
  } as any),
);

fs.writeFileSync(
  path.join(outDir, "desktop.html"),
  frame("Sprint 7 — True Portfolio Optimizer (desktop)", html, false),
);
fs.writeFileSync(
  path.join(outDir, "mobile.html"),
  frame("Sprint 7 — True Portfolio Optimizer (mobile)", html, true),
);

// Also capture the JSON payload so reviewers can audit numbers.
const payload = buildTruePortfolioOptimizer({
  canonicalLedger: FIXTURE,
  goalSolverInputs: GOAL_INPUTS,
});
const payloadSlim = {
  empty: payload.empty,
  searchMetrics: payload.searchMetrics,
  constraintsResolved: payload.constraintsResolved,
  goalReverseEngineering: {
    summary: payload.goalReverseEngineering.summary,
    requiredNetWorth: formatScenarioMetric(payload.goalReverseEngineering.requiredNetWorth),
    requiredAssetBase: formatScenarioMetric(payload.goalReverseEngineering.requiredAssetBase),
    requiredMonthlyContribution: formatScenarioMetric(payload.goalReverseEngineering.requiredMonthlyContribution),
    requiredPassiveIncome: formatScenarioMetric(payload.goalReverseEngineering.requiredPassiveIncome),
    targetFireDate: formatScenarioMetric(payload.goalReverseEngineering.targetFireDate),
    incomplete: payload.goalReverseEngineering.incomplete,
  },
  recommendations: payload.recommendations.map(r => ({
    category: r.category,
    label: r.label,
    fireYear: formatScenarioMetric(r.metrics.fireYear),
    probabilitySuccess: formatScenarioMetric(r.metrics.probabilitySuccess),
    projectedNetWorth: formatScenarioMetric(r.metrics.projectedNetWorth),
    projectedPassiveIncome: formatScenarioMetric(r.metrics.projectedPassiveIncome),
    riskScore: formatScenarioMetric(r.metrics.riskScore),
    confidenceScore: formatScenarioMetric(r.metrics.confidenceScore),
    notEngineModelled: r.notEngineModelled,
    incomplete: r.incomplete,
    actionability: r.actionability,
  })),
  gapSolver: {
    pathFound: payload.gapSolver.pathFound,
    blocker: payload.gapSolver.blocker,
    summary: payload.gapSolver.summary,
    shortfall: formatScenarioMetric(payload.gapSolver.shortfall),
    optionCount: payload.gapSolver.options.length,
  },
  frontier: {
    paretoCount: payload.frontier.paretoCount,
    points: payload.frontier.points.map(p => ({
      objective: p.objective,
      label: p.label,
      pareto: p.pareto,
      fireYear: formatScenarioMetric(p.metrics.fireYear),
      probabilitySuccess: formatScenarioMetric(p.metrics.probabilitySuccess),
      riskScore: formatScenarioMetric(p.metrics.riskScore),
      projectedNetWorth: formatScenarioMetric(p.metrics.projectedNetWorth),
    })),
  },
  audit: payload.auditTrail.entries.map(e => ({
    id: e.id,
    label: e.label,
    enginesUsed: e.enginesUsed,
    inputsUsed: e.inputsUsed,
    confidenceSource: e.confidenceSource,
    riskSource: e.riskSource,
    monteCarloSource: e.monteCarloSource,
    howCalculated: e.howCalculated,
  })),
};
fs.writeFileSync(
  path.join(outDir, "payload.json"),
  JSON.stringify(payloadSlim, null, 2),
);

console.log("Sprint 7 artifacts written to", outDir);
console.log("  desktop.html  =>", `${html.length} bytes (rendered)`);
console.log("  mobile.html   =>", `${html.length} bytes (rendered)`);
console.log("  payload.json  =>", `${JSON.stringify(payloadSlim).length} bytes`);
console.log("\nSearch metrics:");
console.log("  generated   :", payload.searchMetrics.generated);
console.log("  valid       :", payload.searchMetrics.valid);
console.log("  evaluated   :", payload.searchMetrics.evaluated);
console.log("  frontier    :", payload.searchMetrics.frontierSize);
console.log("  capacity    :", payload.searchMetrics.capacity);
console.log("  failure     :", JSON.stringify(payload.searchMetrics.failureCounts));
