/**
 * capture-sprint8-artifacts.ts
 *
 * Server-side renders the Sprint 8 Assumption Uncertainty Engine on top
 * of the Sprint 7 True Portfolio Optimizer at both desktop and mobile
 * containers, and writes the HTML and JSON payloads to
 * `screenshots/sprint8/`. Pure SSR — no headless browser required.
 *
 * Run with: tsx script/capture-sprint8-artifacts.ts
 */

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildTruePortfolioOptimizer } from "../client/src/lib/truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "../client/src/lib/probabilisticWealthEngine";
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

const outDir = path.resolve(process.cwd(), "screenshots/sprint8");
fs.mkdirSync(outDir, { recursive: true });

function frame(title: string, body: string, mobile: boolean): string {
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
  frame("Sprint 8 — Assumption Uncertainty Engine (desktop)", html, false),
);
fs.writeFileSync(
  path.join(outDir, "mobile.html"),
  frame("Sprint 8 — Assumption Uncertainty Engine (mobile)", html, true),
);

const s7 = buildTruePortfolioOptimizer({
  canonicalLedger: FIXTURE,
  goalSolverInputs: GOAL_INPUTS,
});
const s8 = buildProbabilisticWealthEngine({ sprint7Result: s7, seed: 8, simulationsPerStrategy: 1_000 });

const payloadSlim = {
  empty: s8.empty,
  metadata: s8.auditTrail.metadata,
  bestStrategy: s8.bestStrategy ? {
    scenarioId: s8.bestStrategy.scenarioId,
    label: s8.bestStrategy.label,
    category: s8.bestStrategy.category,
    probabilityFireSuccess: s8.bestStrategy.probabilityFireSuccess,
    probabilityLiquidityStress: s8.bestStrategy.probabilityLiquidityStress,
    probabilityNegativeCashflow: s8.bestStrategy.probabilityNegativeCashflow,
    probabilityForcedSale: s8.bestStrategy.probabilityForcedSale,
    netWorthBand: s8.bestStrategy.netWorthBand,
    passiveIncomeBand: s8.bestStrategy.passiveIncomeBand,
    fireYearBand: s8.bestStrategy.fireYearBand,
    requiredMonthlyContributionBand: s8.bestStrategy.requiredMonthlyContributionBand,
    deterministicScore: s8.bestStrategy.deterministicScore,
    monteCarloConfidence: s8.bestStrategy.monteCarloConfidence,
    robustScore: s8.bestStrategy.robustScore,
    whyRobust: s8.bestStrategy.whyRobust,
    whatBreaks: s8.bestStrategy.whatBreaks,
  } : null,
  robustRanking: s8.robustRanking.map(s => ({
    label: s.label,
    deterministicScore: s.deterministicScore,
    monteCarloConfidence: s.monteCarloConfidence,
    robustScore: s.robustScore,
    probabilityFireSuccess: s.probabilityFireSuccess,
  })),
  sensitivity: s8.sensitivity,
  assumptionSet: s8.assumptionSet,
  audit: s8.auditTrail.entries.map(e => ({
    id: e.id, label: e.label,
    enginesUsed: e.enginesUsed,
    inputsUsed: e.inputsUsed,
    confidenceSource: e.confidenceSource,
    riskSource: e.riskSource,
    monteCarloSource: e.monteCarloSource,
    howCalculated: e.howCalculated,
    assumptions: e.assumptions,
  })),
};
fs.writeFileSync(path.join(outDir, "payload.json"), JSON.stringify(payloadSlim, null, 2));

console.log("Sprint 8 artifacts written to", outDir);
console.log("  desktop.html  =>", `${html.length} bytes`);
console.log("  mobile.html   =>", `${html.length} bytes`);
console.log("  payload.json  =>", `${JSON.stringify(payloadSlim).length} bytes`);
console.log("\nSimulation metadata:");
console.log("  strategiesSimulated  :", s8.auditTrail.metadata.strategiesSimulated);
console.log("  simulationsPerStrategy:", s8.auditTrail.metadata.simulationsPerStrategy);
console.log("  totalSimulations     :", s8.auditTrail.metadata.totalSimulations);
console.log("  seed                 :", s8.auditTrail.metadata.seed);
console.log("  assumptionSetVersion :", s8.auditTrail.metadata.assumptionSetVersion);
