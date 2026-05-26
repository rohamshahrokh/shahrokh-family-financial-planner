/**
 * script/screenshot-sprint13.ts
 *
 * Sprint 13 SSR screenshot harness. Renders the universal 4-section
 * decision layout for each of the four target screens (Portfolio Lab,
 * /decision, Goal Closure Lab, Scenario Compare) at a 1440x900
 * viewport and saves the above-fold capture plus a full-page capture.
 *
 * No router, no API — uses the same fixture pattern as
 * screenshot-sprint12.ts and feeds the canonical S7/8/9/10 chain
 * directly into the Sprint 13 selectors.
 *
 * Outputs:
 *   script/sprint13-screenshots/<screen>-above-fold.png
 *   script/sprint13-screenshots/<screen>-full.png
 *   script/sprint13-screenshots/above-fold-measurements.json
 */

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";

import { buildTruePortfolioOptimizer } from "../client/src/lib/truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "../client/src/lib/probabilisticWealthEngine";
import { buildPathSimulationEngine } from "../client/src/lib/pathSimulationEngine";
import { computeCanonicalFire } from "../client/src/lib/canonicalFire";
import { buildGoalSolverPro, EMPTY_GOAL_TARGETS } from "../client/src/lib/goalSolverPro";
import {
  selectFireCommandCenterData,
  selectTop3ActionsDetailed,
  selectRankedBlockersDetailed,
  selectDoNothingOutcome,
} from "../client/src/lib/goalSolverView";
import { FireCommandCenter } from "../client/src/components/decision-system/FireCommandCenter";
import { Top3ActionsSection } from "../client/src/components/decision-system/Top3ActionsSection";
import { BiggestBlockersSection } from "../client/src/components/decision-system/BiggestBlockersSection";
import { DoNothingOutcomeSection } from "../client/src/components/decision-system/DoNothingOutcomeSection";
import { RecommendedVsDoNothingChart } from "../client/src/components/decision-system/RecommendedVsDoNothingChart";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

const ROOT = path.resolve(process.cwd());
const SHOT_DIR = path.join(ROOT, "script", "sprint13-screenshots");
const CSS_DIR = path.join(ROOT, "dist/public/assets");
const CHROMIUM_PATH = "/home/user/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";

const FIXTURE_SNAPSHOT_RICH = {
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

const FIXTURE_RICH: DashboardInputs = {
  snapshot: FIXTURE_SNAPSHOT_RICH,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

function buildAll() {
  const sprint7 = buildTruePortfolioOptimizer({
    canonicalLedger: FIXTURE_RICH,
    goalSolverInputs: { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 },
  });
  const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
  const sprint9 = buildPathSimulationEngine({
    sprint7Result: sprint7,
    canonicalLedger: FIXTURE_RICH,
    seed: 42,
    simulationsPerStrategy: 300,
    maxStrategies: 3,
  });
  const canonicalFire = computeCanonicalFire(FIXTURE_RICH);
  const result = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: {
      targetNetWorth: 5_000_000,
      targetFireYear: 2045,
      targetPassiveIncomeAnnual: 120_000,
    },
  });
  return {
    fireCommand: selectFireCommandCenterData(result),
    top3: selectTop3ActionsDetailed(result),
    blockers: selectRankedBlockersDetailed(result),
    doNothing: selectDoNothingOutcome(result),
    fan: (sprint9.bestStrategy?.netWorthFan ?? sprint9.strategies[0]?.netWorthFan ?? []) as Array<{ year: number; p50: number }>,
    baselineNW: canonicalFire.netWorthNow,
  };
}

const cssFile = fs.readdirSync(CSS_DIR).find((f) => f.endsWith(".css"));
const CSS = cssFile ? fs.readFileSync(path.join(CSS_DIR, cssFile), "utf8") : "";

function wrap(content: string, screen: string, width = 1440): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>S13 ${screen} SSR</title>
  <style>${CSS}</style>
  <style>
    body { background: #f8fafc; color: #0f172a; margin:0; padding:24px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .stage { width: ${width - 48}px; max-width: ${width - 48}px; margin: 0 auto;
      display: flex; flex-direction: column; gap: 16px; }
    .heading { font-size: 18px; font-weight: 600; }
    .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="stage">
    <div>
      <div class="heading">${screen}</div>
      <div class="sub">Sprint 13 universal 4-section reality-check layout (SSR)</div>
    </div>
    ${content}
  </div>
</body></html>`;
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function captureScreen(
  browser: import("playwright-core").Browser,
  screenName: string,
  testidPrefix: string,
  data: ReturnType<typeof buildAll>,
): Promise<{ aboveFoldHeight: number }> {
  const fragment = renderToStaticMarkup(
    React.createElement(
      "div",
      { className: "space-y-4" },
      React.createElement(FireCommandCenter, { data: data.fireCommand, testidPrefix: `${testidPrefix}-fire-command-center` }),
      React.createElement(Top3ActionsSection, { actions: data.top3, testidPrefix: `${testidPrefix}-top3-actions` }),
      React.createElement(BiggestBlockersSection, { blockers: data.blockers, testidPrefix: `${testidPrefix}-biggest-blockers` }),
      React.createElement(DoNothingOutcomeSection, { outcome: data.doNothing, testidPrefix: `${testidPrefix}-do-nothing-outcome` }),
      React.createElement(RecommendedVsDoNothingChart, {
        netWorthFan: data.fan,
        doNothingNetWorth: data.baselineNW,
        recommendedFireYear: data.fireCommand.medianFireYear,
        doNothingFireYear: data.doNothing.expectedFireYear,
        testidPrefix: `${testidPrefix}-rec-vs-donothing-chart`,
      }),
    ),
  );
  const html = wrap(fragment, screenName, 1440);

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  // Measure the y-extent occupied by the 4-section + chart block
  const aboveFoldHeight = await page.evaluate(() => {
    const chart = document.querySelector('[data-testid$="-rec-vs-donothing-chart"]') as HTMLElement | null;
    if (!chart) return -1;
    const rect = chart.getBoundingClientRect();
    return Math.ceil(rect.bottom + window.scrollY);
  });

  await page.screenshot({
    path: path.join(SHOT_DIR, `${screenName}-above-fold.png`),
    clip: { x: 0, y: 0, width: 1440, height: 900 },
  });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${screenName}-full.png`),
    fullPage: true,
  });
  await page.close();
  return { aboveFoldHeight };
}

async function main() {
  await ensureDir(SHOT_DIR);
  const data = buildAll();

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const screens: Array<{ name: string; testidPrefix: string }> = [
    { name: "portfolio-lab", testidPrefix: "s13-portfolio-lab" },
    { name: "decision", testidPrefix: "s13-decision" },
    { name: "goal-closure-lab", testidPrefix: "s13-gcl" },
    { name: "scenario-compare", testidPrefix: "s13-scenario-compare" },
  ];

  const measurements: Record<string, number> = {};
  for (const s of screens) {
    process.stdout.write(`Capturing ${s.name}... `);
    const r = await captureScreen(browser, s.name, s.testidPrefix, data);
    measurements[s.name] = r.aboveFoldHeight;
    process.stdout.write(`above-fold height = ${r.aboveFoldHeight}px\n`);
  }

  await browser.close();

  fs.writeFileSync(
    path.join(SHOT_DIR, "above-fold-measurements.json"),
    JSON.stringify(measurements, null, 2),
  );
  console.log("\nSaved measurements to script/sprint13-screenshots/above-fold-measurements.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
