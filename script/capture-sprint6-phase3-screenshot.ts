/**
 * capture-sprint6-phase3-screenshot.ts
 *
 * Sprint 6 Phase 3 — render the Scenario Builder workspace WITH the new
 * persistence panel via `renderToStaticMarkup` and save the HTML preview to
 * disk so it can be inspected without a running dev server. Used as a
 * screenshot substitute when local dev/production build is blocked.
 *
 * Output: /tmp/sprint6-phase3-scenario-persistence.html
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
  buildBuilderCompareResult,
} from "../client/src/lib/scenarioBuilderWorkspace";
import {
  createScenarioRecord,
  captureSnapshot,
  appendSnapshot,
  buildAssumptionsSummary,
  type ScenarioRecord,
} from "../client/src/lib/scenarioPersistence";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { UseScenarioPersistenceResult } from "../client/src/hooks/useScenarioPersistence";

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

// Build state with mid-session edits + a custom scenario.
let state = makeInitialBuilderState();
state = createScenario(state, { label: "Aggressive ETF" });
state = renameScenario(state, state.scenarios[state.scenarios.length - 1].id, "Aggressive ETF v2");
state = updateGoalInputs(state, "seed-baseline", { fireTarget: 2_400_000, passiveIncomeTarget: 96_000, targetYear: 2040 });
state = updatePropertyInputs(state, "seed-buy-ip-2027", { purchasePrice: 850_000, interestRate: 0.062, deposit: 170_000, loanType: "IO", purchaseYear: 2027, growthRate: 0.05, rentalYield: 0.045 });

const NOW = "2026-05-25T10:00:00.000Z";
const LATER = "2026-05-25T10:05:00.000Z";

// Build saved records for baseline + ETF focus, plus one snapshot.
const baselineScenario = state.scenarios[0];
let baselineRecord = createScenarioRecord({
  scenario: baselineScenario,
  tags: ["Property", "FIRE"],
  notes: "Mortgage refinance scheduled mid-FY27 — baseline assumes current PI loan.",
  isBaseline: true,
  now: NOW,
  recordId: `record-${baselineScenario.id}`,
});
const compareResult = buildBuilderCompareResult(state, FIXTURE);
const baselineEntry = compareResult.scenarios.find(r => r.scenario.id === baselineScenario.id)!;
const snapshot = captureSnapshot({
  record: baselineRecord,
  builderResult: baselineEntry,
  now: LATER,
  comment: "Initial baseline capture",
  assumptions: buildAssumptionsSummary({ scenario: baselineScenario }),
});
baselineRecord = appendSnapshot(baselineRecord, snapshot, LATER);

const etfScenario = state.scenarios.find(s => s.seedScenarioId === "etf-focus")!;
const etfRecord = createScenarioRecord({
  scenario: etfScenario,
  tags: ["ETF", "Hybrid"],
  notes: "What-if: pause IP for 18 months and double-down on global ETF DCA.",
  now: NOW,
  recordId: `record-${etfScenario.id}`,
});

const SAVED_PERSISTENCE: UseScenarioPersistenceResult = {
  status: "saved",
  errorMessage: null,
  records: [baselineRecord, etfRecord],
  bundle: { records: [baselineRecord, etfRecord], fallback: false, errorReason: null },
  hasRemote: true,
  fallback: false,
  refresh: async () => {},
  saveScenario: async (s) => baselineRecord,
  snapshotScenario: async () => snapshot,
  archiveScenario: async () => null,
  restoreScenario: async () => null,
  hydrateState: (s) => s,
  buildAssumptions: (s) => buildAssumptionsSummary({ scenario: s }),
};

const FALLBACK_PERSISTENCE: UseScenarioPersistenceResult = {
  status: "fallback",
  errorMessage: null,
  records: [],
  bundle: { records: [], fallback: true, errorReason: null },
  hasRemote: false,
  fallback: true,
  refresh: async () => {},
  saveScenario: async () => null,
  snapshotScenario: async () => null,
  archiveScenario: async () => null,
  restoreScenario: async () => null,
  hydrateState: (s) => s,
  buildAssumptions: () => [],
};

const savedHtml = renderToStaticMarkup(
  React.createElement(ScenarioBuilderWorkspace, {
    canonicalLedger: FIXTURE,
    initialState: state,
    persistenceOverride: SAVED_PERSISTENCE,
    skipPersistenceAutoLoad: true,
  }),
);

const vsBaselineHtml = renderToStaticMarkup(
  React.createElement(ScenarioBuilderWorkspace, {
    canonicalLedger: FIXTURE,
    initialState: setCompareMode(state, "vs-baseline"),
    persistenceOverride: SAVED_PERSISTENCE,
    skipPersistenceAutoLoad: true,
  }),
);

const fallbackHtml = renderToStaticMarkup(
  React.createElement(ScenarioBuilderWorkspace, {
    canonicalLedger: FIXTURE,
    initialState: makeInitialBuilderState(),
    persistenceOverride: FALLBACK_PERSISTENCE,
    skipPersistenceAutoLoad: true,
  }),
);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sprint 6 Phase 3 — Scenario Persistence preview</title>
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
  <h1 class="preview-header">Sprint 6 Phase 3 — Scenario Persistence preview</h1>
  <p style="padding: 0 2rem; color: #475569; max-width: 960px;">
    Rendered via <code>renderToStaticMarkup</code> with two saved records (baseline + ETF focus),
    one snapshot, and the new persistence bar visible at the top. All numeric values come from
    the canonical engines — the persistence layer never recomputes finance.
  </p>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Desktop — Saved (Supabase synced) · side-by-side</h2>
    ${savedHtml}
  </div>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Desktop — Compare vs Baseline · with persistence</h2>
    ${vsBaselineHtml}
  </div>

  <div class="dark-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Dark mode — Saved (Supabase synced)</h2>
    ${savedHtml}
  </div>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Mobile / stacked — Saved (Supabase synced)</h2>
    <div class="mobile-frame">
      ${savedHtml}
    </div>
  </div>

  <div class="light-section">
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 1rem;">Fallback / local-only state (Supabase unavailable)</h2>
    ${fallbackHtml}
  </div>
</body>
</html>`;

const out = "/tmp/sprint6-phase3-scenario-persistence.html";
writeFileSync(out, html, "utf8");
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} kB)`);
