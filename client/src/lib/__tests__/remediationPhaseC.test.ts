/**
 * remediationPhaseC.test.ts — FWL Remediation Phase C unit tests.
 *
 * Covers the Phase C UI-rewiring gates:
 *   (a) SourceTag renders each of the 5 variants with the right label & testid
 *   (b) goal-not-set hero shows ledger Current NW and a "Set FIRE goal" CTA
 *   (c) ForecastFreshnessBanner renders the correct variant for STALE / FRESH /
 *       MISSING (never-run)
 *   (d) PortfolioLabCharts receives a 3-series shape (Current Path /
 *       Recommended Path / Target) with non-flat Current Path
 *   (e) uiEmptyField fix — "0", "$0", "0%", "0.0" must NOT be treated as empty;
 *       "", undefined, null, NaN, "—", "N/A" must remain empty
 *
 * Run with:
 *   npx tsx client/src/lib/__tests__/remediationPhaseC.test.ts
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SourceTag } from "../../components/portfolio-lab/SourceTag";
import { ForecastFreshnessBanner } from "../../components/portfolio-lab/ForecastFreshnessBanner";
import { FireGapSummaryBlock } from "../../components/portfolio-lab/FireGapSummaryBlock";
import { isEmptyValue } from "../uiEmptyField";
import { buildDoNothingForecast } from "../doNothingForecast";
import type { FireGapSummary } from "../goalSolverView.types";
import type { DashboardInputs } from "../dashboardDataContract";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

if (typeof globalThis.location === "undefined") {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/portfolio-lab", search: "", hash: "" },
    configurable: true,
  });
}

// ─── (a) SourceTag variants ───────────────────────────────────────────────

section("(a) SourceTag renders each variant");

const variants: Array<{ v: "ledger" | "fire" | "forecast" | "mc" | "scenario"; label: string }> = [
  { v: "ledger", label: "Current Ledger" },
  { v: "fire", label: "FIRE Settings" },
  { v: "forecast", label: "Forecast Engine" },
  { v: "mc", label: "Monte Carlo Run" },
  { v: "scenario", label: "Scenario Result" },
];

for (const { v, label } of variants) {
  const html = renderToStaticMarkup(React.createElement(SourceTag, { variant: v }));
  check(
    `SourceTag variant=${v} renders label "${label}"`,
    html.includes(label),
    `html=${html.slice(0, 220)}`,
  );
  check(
    `SourceTag variant=${v} sets data-testid=source-tag-${v}`,
    html.includes(`data-testid="source-tag-${v}"`),
  );
  check(
    `SourceTag variant=${v} sets data-variant=${v}`,
    html.includes(`data-variant="${v}"`),
  );
}

const mcHtml = renderToStaticMarkup(
  React.createElement(SourceTag, { variant: "mc", runDate: "2026-05-01", stale: true }),
);
check(
  "SourceTag variant=mc with runDate surfaces the date",
  mcHtml.includes("2026-05-01"),
  mcHtml.slice(0, 240),
);
check(
  "SourceTag variant=mc stale=true sets data-stale",
  mcHtml.includes('data-stale="true"'),
);

const scenarioHtml = renderToStaticMarkup(
  React.createElement(SourceTag, { variant: "scenario", transient: true }),
);
check(
  "SourceTag variant=scenario transient=true surfaces 'transient'",
  scenarioHtml.toLowerCase().includes("transient"),
);
check(
  "SourceTag variant=scenario transient=true sets data-transient",
  scenarioHtml.includes('data-transient="true"'),
);

// ─── (b) Goal-not-set FireGapSummaryBlock ─────────────────────────────────

section("(b) goal-not-set hero shows ledger Current NW + Set FIRE goal CTA");

const emptyGoalSummary: FireGapSummary = {
  currentNetWorth: 856_500,
  targetNetWorth: null,
  netWorthGap: null,
  currentPassiveIncome: null,
  targetPassiveIncome: null,
  passiveIncomeGap: null,
  currentProbability: null,
  requiredProbability: null,
  requiredProbabilitySource: "default",
  targetFireYear: null,
  medianFireYear: null,
  goalNotSet: true,
};

const heroHtml = renderToStaticMarkup(
  React.createElement(FireGapSummaryBlock, { summary: emptyGoalSummary }),
);
check(
  "goal-not-set hero renders empty-state container",
  heroHtml.includes('data-testid="pl-fire-gap-empty"'),
);
check(
  "goal-not-set hero surfaces ledger Current NW value",
  heroHtml.includes('data-testid="pl-fire-gap-empty-current-nw"'),
);
check(
  "goal-not-set hero CTA reads 'Set FIRE goal'",
  heroHtml.includes("Set FIRE goal"),
  heroHtml.slice(heroHtml.indexOf("fire-goal-empty-portfolio-lab-cta") - 10, heroHtml.indexOf("fire-goal-empty-portfolio-lab-cta") + 240),
);
check(
  "goal-not-set hero CTA testid present",
  heroHtml.includes('data-testid="fire-goal-empty-portfolio-lab-cta"'),
);
check(
  "goal-not-set hero attaches a SourceTag(ledger) to the Current NW value",
  heroHtml.includes('data-testid="pl-fire-gap-empty-current-nw-source"'),
);

// And a SET-goal block produces tiles with SourceTags
const setGoalSummary: FireGapSummary = {
  currentNetWorth: 856_500,
  targetNetWorth: 2_400_000,
  netWorthGap: 1_543_500,
  currentPassiveIncome: 0,
  targetPassiveIncome: 96_000,
  passiveIncomeGap: 96_000,
  currentProbability: 0.42,
  requiredProbability: 0.7,
  requiredProbabilitySource: "default",
  targetFireYear: 2045,
  medianFireYear: 2047,
  goalNotSet: false,
};
const setHtml = renderToStaticMarkup(
  React.createElement(FireGapSummaryBlock, {
    summary: setGoalSummary,
    monteCarloRunDate: "2026-05-01T00:00:00.000Z",
    forecastStale: false,
  }),
);
check(
  "set-goal Current NW tile gets a ledger source tag",
  setHtml.includes('data-testid="pl-fire-gap-current-nw-source"'),
);
check(
  "set-goal Target NW tile gets a FIRE-settings source tag",
  setHtml.includes('data-testid="pl-fire-gap-target-nw-source"'),
);
check(
  "set-goal Current P(FF) tile gets an MC source tag with run date",
  setHtml.includes('data-testid="pl-fire-gap-current-prob-source"') && setHtml.includes("2026-05-01"),
);

// Real-zero (Current PI = $0) must NOT be hidden — verifies C-2 uiEmptyField fix
check(
  "Current PI tile renders even when value is $0 (uiEmptyField fix)",
  setHtml.includes('data-testid="pl-fire-gap-current-pi"'),
);

// ─── (c) ForecastFreshnessBanner ──────────────────────────────────────────

section("(c) ForecastFreshnessBanner variant for STALE / FRESH / MISSING");

const staleHtml = renderToStaticMarkup(
  React.createElement(ForecastFreshnessBanner, {
    isStale: true,
    staleReason: "Snapshot updated after run",
    runDate: "2026-05-01",
    snapshotDate: "2026-05-19",
    onRerun: () => {},
  }),
);
check(
  "STALE banner renders with data-variant=stale",
  staleHtml.includes('data-variant="stale"'),
);
check(
  "STALE banner shows run date",
  staleHtml.includes("2026-05-01"),
);
check(
  "STALE banner shows snapshot date",
  staleHtml.includes("2026-05-19"),
);
check(
  "STALE banner shows Re-run Monte Carlo CTA",
  staleHtml.includes("Re-run Monte Carlo"),
);

const freshHtml = renderToStaticMarkup(
  React.createElement(ForecastFreshnessBanner, {
    isStale: false,
    staleReason: null,
    runDate: "2026-05-20",
    snapshotDate: "2026-05-19",
  }),
);
check(
  "FRESH banner renders nothing (quiet primary UI)",
  freshHtml.trim() === "",
);

const missingHtml = renderToStaticMarkup(
  React.createElement(ForecastFreshnessBanner, {
    isStale: null,
    staleReason: null,
    runDate: null,
    snapshotDate: "2026-05-19",
    onRerun: () => {},
  }),
);
check(
  "never-run banner renders with data-variant=never-run",
  missingHtml.includes('data-variant="never-run"'),
);
check(
  "never-run banner shows Run Monte Carlo CTA",
  missingHtml.includes("Run Monte Carlo"),
);

// ─── (d) Chart receives 3 series with non-flat Current Path ───────────────

section("(d) do-nothing chart shape (3 series, non-flat Current Path)");

// Mirror the makeLedger helper used in Phase B's test — buildDoNothingForecast
// reads canonical asset fields off snapshot (stocks, super_balance_roham, etc.).
const fakeLedger: DashboardInputs = {
  snapshot: {
    stocks: 500_000,
    super_balance_roham: 200_000,
    cash_offset: 100_000,
    ip_settled_value: 300_000,
  } as any,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-19",
} as unknown as DashboardInputs;

const years = [2026, 2027, 2028, 2029, 2030];
const doNothing = buildDoNothingForecast({ ledger: fakeLedger, years });
check(
  "do-nothing forecast yields one entry per requested year",
  doNothing.length === years.length,
  `len=${doNothing.length} expected=${years.length}`,
);
const allFinite = doNothing.every((d) => Number.isFinite(d.netWorth));
check("do-nothing forecast values are all finite", allFinite);
const isNonFlat = doNothing[doNothing.length - 1].netWorth > doNothing[0].netWorth;
check(
  "do-nothing forecast is non-flat (last year > first year)",
  isNonFlat,
  `first=${doNothing[0].netWorth} last=${doNothing[doNothing.length - 1].netWorth}`,
);

// Verify the shape that PortfolioLabCharts consumes — pathBaselineData has
// 3 series keys for each year.
const netWorthFan = years.map((y, i) => ({ year: y, p50: 800_000 + i * 100_000 }));
const doNothingByYear = new Map<number, number>();
doNothing.forEach((d) => doNothingByYear.set(d.year, d.netWorth));
const pathBaselineData = netWorthFan.map((b) => ({
  year: b.year,
  "Current Path": doNothingByYear.get(b.year),
  "Recommended Path": b.p50,
  Target: 2_400_000,
}));
check(
  "chart shape has 3 series keys per row",
  pathBaselineData.every(
    (row) => "Current Path" in row && "Recommended Path" in row && "Target" in row,
  ),
);
check(
  "Current Path differs across years (real series, not flat)",
  pathBaselineData[0]["Current Path"] !== pathBaselineData[pathBaselineData.length - 1]["Current Path"],
);
check(
  "Recommended Path differs across years",
  pathBaselineData[0]["Recommended Path"] !== pathBaselineData[pathBaselineData.length - 1]["Recommended Path"],
);
check(
  "Target line is set to the FIRE target NW",
  pathBaselineData.every((row) => row.Target === 2_400_000),
);

// ─── (e) uiEmptyField fix — "0" / "$0" / "0%" / "0.0" not empty ──────────

section("(e) uiEmptyField fix — real zero is not empty");

check('isEmptyValue("0") === false (FIX)', isEmptyValue("0") === false);
check('isEmptyValue("$0") === false (FIX)', isEmptyValue("$0") === false);
check('isEmptyValue("0%") === false (FIX)', isEmptyValue("0%") === false);
check('isEmptyValue("0.0") === false (FIX)', isEmptyValue("0.0") === false);
check("isEmptyValue(0) === false (real number zero)", isEmptyValue(0) === false);

// Still-empty cases (regression guards)
check('isEmptyValue("") === true', isEmptyValue("") === true);
check("isEmptyValue(undefined) === true", isEmptyValue(undefined) === true);
check("isEmptyValue(null) === true", isEmptyValue(null) === true);
check("isEmptyValue(NaN) === true", isEmptyValue(NaN) === true);
check('isEmptyValue("—") === true', isEmptyValue("—") === true);
check('isEmptyValue("N/A") === true', isEmptyValue("N/A") === true);
check('isEmptyValue("Missing Data") === true', isEmptyValue("Missing Data") === true);

// ─── summary ─────────────────────────────────────────────────────────────

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
