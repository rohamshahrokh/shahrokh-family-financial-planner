/**
 * script/screenshot-sprint12.ts
 *
 * SSR-render of the Sprint 12 advisor components (FireGapSummaryBlock,
 * Top3ActionsBlock, DecisionFrame, DecisionCard 5-card system, BlockerAnalysis,
 * GclSixOutputGrid, WinnerLoserDifferenceCards, ScenarioOutcomeComparisonChart)
 * and capture before/after screenshots with playwright-core (chromium already
 * installed at the path configured in env).
 *
 * Outputs into screenshots/sprint12/{empty,populated}/<component>_<bp>.png.
 *
 * This is a static SSR snapshot — no router, no live login. Matches the
 * approach used in script/screenshot-sprint-10.ts.
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
  selectFireGapSummary,
  selectTop3Actions,
  selectDoNothingComparison,
  selectRankedBlockers,
  selectPathRecommendations,
} from "../client/src/lib/goalSolverView";
import { FireGapSummaryBlock } from "../client/src/components/portfolio-lab/FireGapSummaryBlock";
import { Top3ActionsBlock } from "../client/src/components/portfolio-lab/Top3ActionsBlock";
import { DecisionFrame } from "../client/src/components/ui/DecisionFrame";
import { DecisionCard } from "../client/src/components/decision/DecisionCard";
import { BlockerAnalysisBlock } from "../client/src/components/decision/BlockerAnalysisBlock";
import { WinnerLoserDifferenceCards } from "../client/src/components/scenario-compare/WinnerLoserDifferenceCards";
import { formatCurrency } from "../client/src/lib/finance";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

const ROOT = path.resolve(process.cwd());
const SHOT_DIR = path.join(ROOT, "screenshots", "sprint12");
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

const GOAL_INPUTS = { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 };

function buildResult(targets: typeof EMPTY_GOAL_TARGETS) {
  const sprint7 = buildTruePortfolioOptimizer({
    canonicalLedger: FIXTURE_RICH,
    goalSolverInputs: GOAL_INPUTS,
  });
  const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
  const sprint9 = buildPathSimulationEngine({
    sprint7Result: sprint7,
    canonicalLedger: FIXTURE_RICH,
    seed: 42,
    simulationsPerStrategy: 500,
    maxStrategies: 3,
  });
  const canonicalFire = computeCanonicalFire(FIXTURE_RICH);
  return buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
  });
}

const cssFile = fs.readdirSync(CSS_DIR).find((f) => f.endsWith(".css"));
const CSS = cssFile ? fs.readFileSync(path.join(CSS_DIR, cssFile), "utf8") : "";

function wrap(content: string, dark = false, width = 1440): string {
  return `<!doctype html>
<html lang="en" class="${dark ? "dark" : ""}">
<head><meta charset="utf-8"/><title>S12 SSR</title>
<style>${CSS}</style>
<style>
  body { background: ${dark ? "#0b0f1a" : "#f8fafc"}; color: ${dark ? "#e2e8f0" : "#0f172a"}; margin:0; padding:24px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .stage { width: ${width - 48}px; max-width: ${width - 48}px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: ${dark ? "#94a3b8" : "#64748b"}; margin: 8px 0 4px; }
</style>
</head>
<body>
  <div class="stage">${content}</div>
</body></html>`;
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function shoot(name: string, html: string, viewport: { width: number; height: number }) {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: name, fullPage: true });
  } finally {
    await browser.close();
  }
}

async function main() {
  await ensureDir(SHOT_DIR);
  await ensureDir(path.join(SHOT_DIR, "empty"));
  await ensureDir(path.join(SHOT_DIR, "populated"));

  // Populated views
  const populated = buildResult({
    targetNetWorth: 5_000_000,
    targetFireYear: 2045,
    targetPassiveIncomeAnnual: 120_000,
  });
  const fireGap = selectFireGapSummary(populated);
  const top3 = selectTop3Actions(populated);
  const doNothing = selectDoNothingComparison(populated);
  const blockers = selectRankedBlockers(populated);
  const paths = selectPathRecommendations(populated);

  // Empty views
  const empty = buildResult(EMPTY_GOAL_TARGETS);
  const emptyFireGap = selectFireGapSummary(empty);
  const emptyTop3 = selectTop3Actions(empty);
  const emptyBlockers = selectRankedBlockers(empty);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const populatedContent = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement("div", { className: "label" }, "Portfolio Lab — FIRE Gap Summary"),
      React.createElement(FireGapSummaryBlock, { summary: fireGap }),
      React.createElement("div", { className: "label" }, "Portfolio Lab — Top-3 Actions"),
      React.createElement(Top3ActionsBlock, { actions: top3 }),
      React.createElement("div", { className: "label" }, "Portfolio Lab — DecisionFrame"),
      React.createElement(DecisionFrame, {
        testidPrefix: "portfolio-lab-decision-frame",
        title: "Your decision in one frame",
        currentPosition: {
          label: "Current Position",
          value: fireGap.currentNetWorth != null ? formatCurrency(fireGap.currentNetWorth, true) : undefined,
          subtitle: fireGap.currentPassiveIncome != null ? `${formatCurrency(fireGap.currentPassiveIncome, true)}/yr passive` : undefined,
          status: "at-risk",
        },
        targetPosition: {
          label: "Target Position",
          value: fireGap.targetNetWorth != null ? formatCurrency(fireGap.targetNetWorth, true) : undefined,
          subtitle: fireGap.targetFireYear != null ? `by ${fireGap.targetFireYear}` : undefined,
        },
        gap: {
          label: "Gap to close",
          value: fireGap.netWorthGap != null && fireGap.netWorthGap > 0 ? formatCurrency(fireGap.netWorthGap, true) : undefined,
          direction: "negative",
        },
        recommendedAction: {
          label: "Recommended Action",
          value: top3[0]?.label,
          subtitle: top3[0]?.dueYear ? `Due year: ${top3[0].dueYear}` : undefined,
          ctaHref: "/decision",
          ctaLabel: "Open Decision Engine",
        },
        expectedOutcome: {
          label: "Expected Outcome",
          value: top3[0]?.netWorthDelta != null && top3[0].netWorthDelta !== 0
            ? `+ ${formatCurrency(Math.abs(top3[0].netWorthDelta), true)} NW`
            : undefined,
        },
        doNothingOutcome: {
          label: "Do Nothing Outcome",
          value: doNothing.baselineNetWorth != null ? `End NW ${formatCurrency(doNothing.baselineNetWorth, true)}` : undefined,
        },
      }),
      React.createElement("div", { className: "label" }, "Decision Engine — 5-card system"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" } } as any,
        React.createElement(DecisionCard, {
          variant: "action",
          title: top3[0]?.label ?? "",
          subtitle: top3[0]?.dueYear ? `Due ${top3[0].dueYear}` : undefined,
          facts: [],
          ctaHref: "/portfolio-lab",
          ctaLabel: "Portfolio Lab",
        }),
        React.createElement(DecisionCard, {
          variant: "impact",
          title: "Expected impact",
          facts: [
            { label: "Net worth", value: top3[0]?.netWorthDelta != null && top3[0].netWorthDelta !== 0 ? `+ ${formatCurrency(Math.abs(top3[0].netWorthDelta), true)}` : null },
            { label: "Probability", value: top3[0]?.probabilityDelta != null && top3[0].probabilityDelta !== 0 ? `${top3[0].probabilityDelta > 0 ? "+" : "−"}${Math.round(Math.abs(top3[0].probabilityDelta) * 100)}%` : null },
          ],
        }),
        React.createElement(DecisionCard, {
          variant: "risk",
          title: blockers[0]?.label ?? "Top risks",
          subtitle: blockers[0]?.requiredChange ?? undefined,
          facts: blockers.slice(1, 3).map((b) => ({ label: b.label, value: b.requiredChange ?? "" })),
        }),
        React.createElement(DecisionCard, {
          variant: "alternative",
          title: paths[0]?.label ?? "Alternative",
          subtitle: paths[0]?.strategyLabel ?? undefined,
          facts: [
            { label: "FIRE year", value: paths[0]?.expectedFireYear ?? null },
            { label: "Probability", value: paths[0]?.probability != null ? `${Math.round(paths[0].probability * 100)}%` : null },
          ],
        }),
        React.createElement(DecisionCard, {
          variant: "do-nothing",
          title: "If you take no action",
          facts: [
            { label: "FIRE year (baseline)", value: doNothing.baselineFireYear ?? null },
            { label: "Net worth (baseline)", value: doNothing.baselineNetWorth != null ? formatCurrency(doNothing.baselineNetWorth, true) : null },
          ],
        }),
      ),
      React.createElement("div", { className: "label" }, "Decision Engine — Blocker Analysis"),
      React.createElement(BlockerAnalysisBlock, { blockers }),
      React.createElement("div", { className: "label" }, "Scenario Compare — Winner / Loser / Difference"),
      React.createElement(WinnerLoserDifferenceCards, {
        base: { scenarioId: "base", name: "Base Case", netWorthP50: 4_500_000, probability: 0.55 },
        winner: { scenarioId: "ip-2027", name: "IP 2027 + ETF", netWorthP50: 5_700_000, probability: 0.73 },
        loser: { scenarioId: "cash", name: "All Cash", netWorthP50: 3_900_000, probability: 0.32 },
      }),
    ),
  );

  const emptyContent = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement("div", { className: "label" }, "Portfolio Lab — FIRE Gap empty state"),
      React.createElement(FireGapSummaryBlock, { summary: emptyFireGap }),
      React.createElement("div", { className: "label" }, "Portfolio Lab — Top-3 Actions empty"),
      React.createElement(Top3ActionsBlock, { actions: emptyTop3 }),
      React.createElement("div", { className: "label" }, "Decision Engine — Blockers empty"),
      React.createElement(BlockerAnalysisBlock, { blockers: emptyBlockers }),
      React.createElement("div", { className: "label" }, "Scenario Compare — Cards empty"),
      React.createElement(WinnerLoserDifferenceCards, { base: null, winner: null, loser: null }),
    ),
  );

  const breakpoints: { name: string; viewport: { width: number; height: number } }[] = [
    { name: "1440x900", viewport: { width: 1440, height: 900 } },
    { name: "390x844", viewport: { width: 390, height: 844 } },
  ];
  const themes: { name: "light" | "dark"; dark: boolean }[] = [
    { name: "light", dark: false },
    { name: "dark", dark: true },
  ];

  let count = 0;
  for (const bp of breakpoints) {
    for (const t of themes) {
      const widthForLayout = bp.viewport.width;
      await shoot(
        path.join(SHOT_DIR, "populated", `sprint12-suite_${bp.name}_${t.name}.png`),
        wrap(populatedContent, t.dark, widthForLayout),
        bp.viewport,
      );
      count++;
      await shoot(
        path.join(SHOT_DIR, "empty", `sprint12-suite_${bp.name}_${t.name}.png`),
        wrap(emptyContent, t.dark, widthForLayout),
        bp.viewport,
      );
      count++;
    }
  }

  console.log(`Captured ${count} screenshots under ${SHOT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
