/**
 * script/screenshot-sprint-9.ts
 *
 * Renders the Sprint 9 PathSimulationSection to static HTML using the same
 * fixture as the regression test (§17), wraps it in the production CSS
 * bundle, and uses playwright-core (already-installed Chromium) to capture
 * full-page screenshots.
 *
 * Outputs:
 *   screenshots/sprint-9-rich.png    (populated state)
 *   screenshots/sprint-9-empty.png   (empty Sprint 7 ⇒ empty Sprint 9)
 *
 * This is a static SSR snapshot — it does not exercise client-side
 * interactivity, only the visual shell.
 */

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";

import { buildTruePortfolioOptimizer } from "../client/src/lib/truePortfolioOptimizer";
import { buildPathSimulationEngine } from "../client/src/lib/pathSimulationEngine";
import { PathSimulationSection } from "../client/src/components/PathSimulationSection";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

const ROOT = path.resolve(process.cwd());
const SHOT_DIR = path.join(ROOT, "screenshots");
const CSS_PATH = path.join(ROOT, "dist/public/assets/index-CHDO9mj9.css");

const FIXTURE_SNAPSHOT = {
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
  snapshot: FIXTURE_SNAPSHOT,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const EMPTY_LEDGER: DashboardInputs = {
  ...FIXTURE,
  snapshot: null,
};

const GOAL = { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 };

function wrapHtml(body: string, css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1440, initial-scale=1" />
<title>Sprint 9 — Path-Based Wealth Simulation</title>
<style>${css}</style>
<style>
  body { margin: 0; padding: 24px; background: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
  #root { max-width: 1392px; margin: 0 auto; }
</style>
</head>
<body><div id="root">${body}</div></body>
</html>`;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const css = fs.existsSync(CSS_PATH) ? fs.readFileSync(CSS_PATH, "utf8") : "";
  if (!css) console.warn("WARN: production CSS not found at", CSS_PATH);

  // Build the populated result.
  const s7 = buildTruePortfolioOptimizer({ canonicalLedger: FIXTURE, goalSolverInputs: GOAL });
  const richResult = buildPathSimulationEngine({
    sprint7Result: s7,
    canonicalLedger: FIXTURE,
    seed: 42,
    simulationsPerStrategy: 1_000,
    maxStrategies: 3,
  });
  const richHtml = renderToStaticMarkup(
    React.createElement(PathSimulationSection, { result: richResult }),
  );

  const s7Empty = buildTruePortfolioOptimizer({ canonicalLedger: EMPTY_LEDGER, goalSolverInputs: GOAL });
  const emptyResult = buildPathSimulationEngine({
    sprint7Result: s7Empty,
    canonicalLedger: EMPTY_LEDGER,
    seed: 1,
    simulationsPerStrategy: 1_000,
  });
  const emptyHtml = renderToStaticMarkup(
    React.createElement(PathSimulationSection, { result: emptyResult }),
  );

  const richDoc = wrapHtml(richHtml, css);
  const emptyDoc = wrapHtml(emptyHtml, css);

  fs.writeFileSync(path.join(SHOT_DIR, "sprint-9-rich.html"), richDoc);
  fs.writeFileSync(path.join(SHOT_DIR, "sprint-9-empty.html"), emptyDoc);

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`;

  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  for (const [name, doc] of [
    ["sprint-9-rich", richDoc],
    ["sprint-9-empty", emptyDoc],
  ] as const) {
    await page.setContent(doc, { waitUntil: "networkidle" });
    const outPath = path.join(SHOT_DIR, `${name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    const stat = fs.statSync(outPath);
    console.log(`Wrote ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  await browser.close();
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
