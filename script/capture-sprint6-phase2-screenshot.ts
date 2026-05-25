/**
 * capture-sprint6-phase2-screenshot.ts
 *
 * Sprint 6 Phase 2 — render the Scenario Builder workspace via
 * `renderToStaticMarkup` and save the HTML + Tailwind preview to disk so it
 * can be inspected without a running dev server. Used as a screenshot
 * substitute when the local dev/production build is blocked.
 *
 * Output: /tmp/sprint6-phase2-scenario-builder.html
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "fs";

import { ScenarioBuilderWorkspace } from "../client/src/components/ScenarioBuilderWorkspace";
import {
  makeInitialBuilderState,
  setCompareMode,
  createScenario,
  renameScenario,
  updateGoalInputs,
  updatePropertyInputs,
} from "../client/src/lib/scenarioBuilderWorkspace";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

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

// Build a state that exercises a CRUD + edit + mode-toggle journey.
let state = makeInitialBuilderState();
state = createScenario(state, { label: "Aggressive ETF" });
state = renameScenario(state, state.scenarios[state.scenarios.length - 1].id, "Aggressive ETF v2");
state = updateGoalInputs(state, "seed-baseline", { fireTarget: 2_400_000, passiveIncomeTarget: 96_000, targetYear: 2040 });
state = updatePropertyInputs(state, "seed-buy-ip-2027", { purchasePrice: 850_000, interestRate: 0.062, deposit: 170_000, loanType: "IO", purchaseYear: 2027, growthRate: 0.05, rentalYield: 0.045 });

const sideBySide = renderToStaticMarkup(
  React.createElement(ScenarioBuilderWorkspace, { canonicalLedger: FIXTURE, initialState: state }),
);

const vsBaselineState = setCompareMode(state, "vs-baseline");
const vsBaseline = renderToStaticMarkup(
  React.createElement(ScenarioBuilderWorkspace, { canonicalLedger: FIXTURE, initialState: vsBaselineState }),
);

const emptyHtml = renderToStaticMarkup(
  React.createElement(ScenarioBuilderWorkspace, { canonicalLedger: null, initialState: makeInitialBuilderState() }),
);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sprint 6 Phase 2 — Scenario Builder preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root {
    --background: #ffffff;
    --foreground: #0f172a;
    --card: #ffffff;
    --border: #e5e7eb;
    --muted: #f8fafc;
    --muted-foreground: #64748b;
  }
  .dark-section {
    --background: #0b1220;
    --foreground: #e5e7eb;
    --card: #111827;
    --border: #1f2937;
    --muted: #0f172a;
    --muted-foreground: #94a3b8;
    background: var(--background);
    color: var(--foreground);
    padding: 2rem;
  }
  .light-section { padding: 2rem; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; background: #f1f5f9; }
  .bg-card { background-color: var(--card); }
  .bg-background { background-color: var(--background); }
  .bg-muted { background-color: var(--muted); }
  .bg-muted\\/40 { background-color: color-mix(in srgb, var(--muted) 40%, transparent); }
  .bg-muted\\/60 { background-color: color-mix(in srgb, var(--muted) 60%, transparent); }
  .text-foreground { color: var(--foreground); }
  .text-muted-foreground { color: var(--muted-foreground); }
  .border-border { border-color: var(--border); }
  h1.preview-header { font-size: 1.5rem; font-weight: 700; padding: 1rem 2rem 0; }
  .mobile-frame { max-width: 420px; margin: 1rem auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 1rem; background: var(--card); }
  details > summary { user-select: none; }
</style>
</head>
<body>
  <h1 class="preview-header">Sprint 6 Phase 2 — Interactive Scenario Builder preview</h1>
  <p style="padding: 0 2rem; color: #475569; max-width: 960px;">
    Rendered via <code>renderToStaticMarkup</code> with the same canonical fixture used by
    the Sprint 6 Phase 2 test suite. State exercises a CRUD journey:
    create a new scenario, rename it, edit baseline goals + buy-IP-2027 property inputs.
    Local <code>npm run build</code> succeeds for the client bundle; preview is provided
    in addition for parity with Phase 1's SSR snapshot.
  </p>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Desktop — Side-by-side mode</h2>
    ${sideBySide}
  </div>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Desktop — Compare vs Baseline mode (Δ cells visible)</h2>
    ${vsBaseline}
  </div>

  <div class="dark-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Dark mode</h2>
    ${sideBySide}
  </div>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Mobile / stacked</h2>
    <div class="mobile-frame">
      ${sideBySide}
    </div>
  </div>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Empty / no-ledger state</h2>
    ${emptyHtml}
  </div>
</body>
</html>`;

const out = "/tmp/sprint6-phase2-scenario-builder.html";
writeFileSync(out, html, "utf8");
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} kB)`);
