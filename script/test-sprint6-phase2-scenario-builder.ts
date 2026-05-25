/**
 * test-sprint6-phase2-scenario-builder.ts
 *
 * Sprint 6 Phase 2 — Interactive Scenario Builder tests.
 *
 * What this proves
 * ----------------
 *   §1  Initial builder state has the six seeds + baseline = baseline seed
 *   §2  CRUD: create / clone / rename / delete / set-as-baseline reducers
 *   §3  Editable input mutators (property/investments/cashflow/goals)
 *   §4  Engine input mapping: scenario goals → goal-solver inputs
 *   §5  buildBuilderCompareResult mirrors Phase 1 engine outputs (no new
 *       financial formulas in the builder layer)
 *   §6  Baseline delta calculation = subtraction of two engine output values
 *   §7  Component renders editor cards, mode toggle, compare table, deltas
 *       with stable data-testid attributes
 *   §8  Graceful empty/incomplete states (no fabricated numbers)
 *   §9  Dashboard contract unchanged: canonical headline metrics still
 *       byte-equal between Phase 1 and Phase 2 paths
 *
 * Run with:  tsx script/test-sprint6-phase2-scenario-builder.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  makeInitialBuilderState,
  makeSeedScenarios,
  createScenario,
  cloneScenario,
  renameScenario,
  deleteScenario,
  setBaseline,
  setCompareMode,
  updatePropertyInputs,
  updateInvestmentInputs,
  updateCashflowInputs,
  updateGoalInputs,
  deriveGoalSolverInputs,
  hasEngineLimitedEdits,
  buildBuilderCompareResult,
  formatDelta,
  listMetricKeys,
  type BuilderState,
} from "../client/src/lib/scenarioBuilderWorkspace";
import { ScenarioBuilderWorkspace } from "../client/src/components/ScenarioBuilderWorkspace";
import { buildScenarioCompareWorkspace } from "../client/src/lib/scenarioCompareWorkspace";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

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

/* ─── Fixture (same household snapshot used by Sprint 6 Phase 1) ──────── */

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

console.log("\nSprint 6 Phase 2 — Interactive Scenario Builder\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Initial builder state
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("§1  Initial builder state");
{
  const s = makeInitialBuilderState();
  ok("six seed scenarios", s.scenarios.length === 6, { actual: s.scenarios.length });
  ok("all seeds flagged isSeed=true", s.scenarios.every(x => x.isSeed));
  ok("baseline id maps to seed-baseline", s.baselineScenarioId === "seed-baseline", { actual: s.baselineScenarioId });
  ok("compareMode defaults to side-by-side", s.compareMode === "side-by-side");

  const seeds = makeSeedScenarios();
  const ids = seeds.map(x => x.seedScenarioId).sort();
  ok("seed catalogue is the six Phase 1 ids", JSON.stringify(ids) === JSON.stringify(["baseline","buy-ip-2027","buy-ip-2028","etf-focus","hybrid-strategy","offset-focus"]), { ids });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — CRUD reducers (pure)
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§2  CRUD reducers");
{
  let s: BuilderState = makeInitialBuilderState();

  // create
  s = createScenario(s, { label: "Aggressive ETF" });
  ok("create adds a non-seed scenario", s.scenarios.length === 7 && !s.scenarios[6].isSeed);
  ok("created scenario has user-friendly label", s.scenarios[6].label === "Aggressive ETF");
  const createdId = s.scenarios[6].id;

  // rename
  s = renameScenario(s, createdId, "Aggressive ETF v2");
  ok("rename updates label", s.scenarios.find(x => x.id === createdId)?.label === "Aggressive ETF v2");

  s = renameScenario(s, createdId, "   ");
  ok("rename ignores blank input", s.scenarios.find(x => x.id === createdId)?.label === "Aggressive ETF v2");

  // clone
  s = cloneScenario(s, createdId);
  ok("clone adds copy", s.scenarios.length === 8);
  const clone = s.scenarios[7];
  ok("clone label has ' (copy)' suffix", clone.label === "Aggressive ETF v2 (copy)");
  ok("clone is not a seed", !clone.isSeed);

  // set baseline
  s = setBaseline(s, createdId);
  ok("setBaseline switches baselineScenarioId", s.baselineScenarioId === createdId);

  // delete blocked when target is baseline
  const beforeDelete = s.scenarios.length;
  s = deleteScenario(s, createdId);
  ok("delete blocked for current baseline", s.scenarios.length === beforeDelete);

  // switch baseline back to seed-baseline, then delete the user scenario
  s = setBaseline(s, "seed-baseline");
  s = deleteScenario(s, createdId);
  ok("delete removes user scenario", s.scenarios.length === beforeDelete - 1);

  // mode toggle
  s = setCompareMode(s, "vs-baseline");
  ok("setCompareMode switches mode", s.compareMode === "vs-baseline");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Editable input mutators
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§3  Editable input mutators");
{
  let s = makeInitialBuilderState();
  const target = s.scenarios[0].id; // seed-baseline

  s = updatePropertyInputs(s, target, { purchasePrice: 850_000, interestRate: 0.062, loanType: "IO", purchaseYear: 2027, deposit: 170_000, growthRate: 0.05, rentalYield: 0.045 });
  s = updateInvestmentInputs(s, target, { etfContribution: 2_000, stockContribution: 500, cryptoContribution: 200 });
  s = updateCashflowInputs(s, target, { surplusAllocation: 0.6, offsetAllocation: 0.3, debtRepaymentAllocation: 0.1 });
  s = updateGoalInputs(s, target, { fireTarget: 2_400_000, passiveIncomeTarget: 96_000, targetYear: 2040 });

  const scen = s.scenarios.find(x => x.id === target)!;
  ok("property purchasePrice stored", scen.inputs.property.purchasePrice === 850_000);
  ok("property loanType stored", scen.inputs.property.loanType === "IO");
  ok("investments etfContribution stored", scen.inputs.investments.etfContribution === 2_000);
  ok("cashflow surplusAllocation stored", scen.inputs.cashflow.surplusAllocation === 0.6);
  ok("goals fireTarget stored", scen.inputs.goals.fireTarget === 2_400_000);
  ok("goals targetYear stored", scen.inputs.goals.targetYear === 2040);

  ok("hasEngineLimitedEdits true after non-goal edits", hasEngineLimitedEdits(scen) === true);

  const onlyGoals = makeInitialBuilderState();
  const onlyGoalsScen = updateGoalInputs(onlyGoals, onlyGoals.scenarios[0].id, { passiveIncomeTarget: 80_000 });
  ok("hasEngineLimitedEdits false when only goals edited", hasEngineLimitedEdits(onlyGoalsScen.scenarios[0]) === false);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Engine input mapping
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§4  Engine input mapping (goals → goal-solver)");
{
  const s = makeInitialBuilderState();
  const target = s.scenarios[0].id;
  const s2 = updateGoalInputs(s, target, { fireTarget: 2_000_000, passiveIncomeTarget: 96_000, targetYear: 2040 });
  const gsi = deriveGoalSolverInputs(s2.scenarios[0]);
  ok("derives targetPortfolioValue from fireTarget", gsi?.targetPortfolioValue === 2_000_000);
  ok("derives targetPassiveIncome from passiveIncomeTarget", gsi?.targetPassiveIncome === 96_000);
  ok("derives targetFireDate from targetYear", gsi?.targetFireDate === "2040-12-31");

  const empty = deriveGoalSolverInputs(s.scenarios[0]);
  ok("returns undefined when no goals supplied", empty === undefined);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Builder compare result mirrors Phase 1 engine outputs
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§5  Builder compare result mirrors Phase 1 engine outputs");
{
  const s = makeInitialBuilderState();
  const r = buildBuilderCompareResult(s, FIXTURE);
  ok("not empty for valid ledger", !r.empty);
  ok("six scenario results", r.scenarios.length === 6);
  ok("baseline result present", r.baseline?.scenario.id === "seed-baseline");

  // Net worth from baseline result must equal canonical head.netWorth.
  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  ok(
    "baseline Net Worth equals canonical Net Worth",
    r.baseline?.row.metrics.netWorth.value === head.netWorth,
    { row: r.baseline?.row.metrics.netWorth.value, canonical: head.netWorth },
  );

  // Phase 1 + Phase 2 give the same per-scenario engine row when scenario inputs untouched.
  const phase1 = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  for (const r2 of r.scenarios) {
    const ref = phase1.rows.find(p => p.id === r2.scenario.seedScenarioId);
    if (!ref) continue;
    ok(
      `${r2.scenario.seedScenarioId} Net Worth matches Phase 1`,
      r2.row.metrics.netWorth.value === ref.metrics.netWorth.value,
      { phase2: r2.row.metrics.netWorth.value, phase1: ref.metrics.netWorth.value },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Baseline delta calculation = subtraction of engine output values
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§6  Baseline delta calculation = subtraction of engine output values");
{
  const s = makeInitialBuilderState();
  const r = buildBuilderCompareResult(s, FIXTURE);

  const baseline = r.baseline!;
  for (const entry of r.scenarios) {
    const deltas = r.deltasByScenarioId[entry.scenario.id];
    for (const key of listMetricKeys()) {
      const m = entry.row.metrics[key];
      const baseM = baseline.row.metrics[key];
      if (m.format === "text") {
        ok(`${entry.scenario.id} ${key} delta=null for text metric`, deltas[key].delta === null);
        continue;
      }
      const v = m.value;
      const b = baseM.value;
      if (v == null || b == null) {
        ok(`${entry.scenario.id} ${key} delta null when either side missing`, deltas[key].delta === null);
      } else {
        ok(`${entry.scenario.id} ${key} delta = value - baseline`, deltas[key].delta === v - b, { delta: deltas[key].delta, v, b });
      }
    }
  }

  // baseline scenario's own deltas should be 0 (numeric) or null (text)
  const baselineDeltas = r.deltasByScenarioId[baseline.scenario.id];
  for (const key of listMetricKeys()) {
    const cell = baselineDeltas[key];
    if (cell.format === "text") {
      ok(`baseline ${key} delta null (text)`, cell.delta === null);
    } else if (cell.delta != null) {
      ok(`baseline ${key} delta is 0`, cell.delta === 0, { actual: cell.delta });
    } else {
      ok(`baseline ${key} delta null when underlying value missing`, cell.delta === null);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Component renders editors, toggle, compare table, deltas (testids)
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§7  Component renders with stable data-testids");
{
  const initial = setCompareMode(makeInitialBuilderState(), "vs-baseline");
  const html = renderToStaticMarkup(
    React.createElement(ScenarioBuilderWorkspace, { canonicalLedger: FIXTURE, initialState: initial }),
  );

  ok("workspace root", hasTestId(html, "scenario-builder-workspace"));
  ok("title", hasTestId(html, "scenario-builder-workspace-title"));
  ok("create button", hasTestId(html, "scenario-builder-create"));
  ok("mode toggle group", hasTestId(html, "scenario-builder-mode-toggle"));
  ok("mode toggle side-by-side button", hasTestId(html, "scenario-builder-mode-side-by-side"));
  ok("mode toggle vs-baseline button", hasTestId(html, "scenario-builder-mode-vs-baseline"));

  // six editor cards
  ok("six editor cards", countTestIdMatches(html, "scenario-editor-seed-") >= 6, { count: countTestIdMatches(html, "scenario-editor-seed-") });
  // rename input on baseline editor
  ok("baseline editor rename input", hasTestId(html, "scenario-editor-seed-baseline-rename"));
  ok("baseline editor set-baseline button (disabled but present)", hasTestId(html, "scenario-editor-seed-baseline-set-baseline"));
  ok("baseline editor clone button", hasTestId(html, "scenario-editor-seed-baseline-clone"));
  ok("baseline editor delete button", hasTestId(html, "scenario-editor-seed-baseline-delete"));

  // input fields (property, investments, cashflow, goals)
  ok("property purchase year input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-purchase-year"));
  ok("property purchase price input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-purchase-price"));
  ok("property deposit input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-deposit"));
  ok("property interest rate input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-interest-rate"));
  ok("property growth rate input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-growth-rate"));
  ok("property rental yield input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-rental-yield"));
  ok("property loan type input present", hasTestId(html, "scenario-editor-seed-baseline-input-property-loan-type"));
  ok("investments ETF input present", hasTestId(html, "scenario-editor-seed-baseline-input-investments-etf"));
  ok("investments stock input present", hasTestId(html, "scenario-editor-seed-baseline-input-investments-stock"));
  ok("investments crypto input present", hasTestId(html, "scenario-editor-seed-baseline-input-investments-crypto"));
  ok("cashflow surplus input present", hasTestId(html, "scenario-editor-seed-baseline-input-cashflow-surplus"));
  ok("cashflow offset input present", hasTestId(html, "scenario-editor-seed-baseline-input-cashflow-offset"));
  ok("cashflow debt input present", hasTestId(html, "scenario-editor-seed-baseline-input-cashflow-debt"));
  ok("goals fire target input present", hasTestId(html, "scenario-editor-seed-baseline-input-goals-fire-target"));
  ok("goals passive target input present", hasTestId(html, "scenario-editor-seed-baseline-input-goals-passive-target"));
  ok("goals target year input present", hasTestId(html, "scenario-editor-seed-baseline-input-goals-target-year"));

  // compare table desktop
  ok("compare table wrapper", hasTestId(html, "scenario-builder-compare-table-wrapper"));
  ok("compare table", hasTestId(html, "scenario-builder-compare-table"));
  ok("compare-mode attribute reflects state", html.includes('data-compare-mode="vs-baseline"'));
  ok("baseline header carries baseline badge", hasTestId(html, "scenario-builder-compare-table-baseline-seed-baseline"));

  // every metric row + every cell
  for (const key of listMetricKeys()) {
    ok(`metric row ${key}`, hasTestId(html, `scenario-builder-compare-table-row-${key}`));
    ok(`cell baseline ${key}`, hasTestId(html, `scenario-builder-compare-table-cell-seed-baseline-${key}`));
    ok(`cell buy-ip-2027 ${key}`, hasTestId(html, `scenario-builder-compare-table-cell-seed-buy-ip-2027-${key}`));
    ok(`value cell baseline ${key}`, hasTestId(html, `scenario-builder-compare-table-value-seed-baseline-${key}`));
  }

  // deltas should render for non-baseline rows in vs-baseline mode (numeric metrics)
  ok("delta cell present for buy-ip-2027 netWorth in vs-baseline mode",
    hasTestId(html, "scenario-builder-compare-table-delta-seed-buy-ip-2027-netWorth"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Graceful empty / incomplete states
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§8  Graceful empty / incomplete state");
{
  const s = makeInitialBuilderState();
  const empty = buildBuilderCompareResult(s, EMPTY_LEDGER);
  ok("empty flag set for empty ledger", empty.empty === true);
  ok("emptyReason populated", typeof empty.emptyReason === "string" && empty.emptyReason.length > 0);
  ok("scenarios still listed (incomplete rows)", empty.scenarios.length === 6);
  ok("all scenario rows flagged incomplete", empty.scenarios.every(r => r.row.incomplete));
  ok("all metric values are null (no fabrication)", empty.scenarios.every(r =>
    Object.values(r.row.metrics).every(m => m.value === null),
  ));

  const html = renderToStaticMarkup(
    React.createElement(ScenarioBuilderWorkspace, { canonicalLedger: null, initialState: s }),
  );
  ok("empty-state container rendered", hasTestId(html, "scenario-builder-workspace-empty"));
  ok("empty-reason badge rendered", hasTestId(html, "scenario-builder-workspace-empty-reason"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Dashboard contract unchanged
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§9  Dashboard contract unchanged");
{
  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  const phase1 = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  const builder = buildBuilderCompareResult(makeInitialBuilderState(), FIXTURE);

  ok("Phase 1 baseline NW == canonical", phase1.rows.find(r => r.id === "baseline")?.metrics.netWorth.value === head.netWorth);
  ok("Phase 2 baseline NW == canonical", builder.baseline?.row.metrics.netWorth.value === head.netWorth);
  ok("Phase 2 baseline passive income == canonical", builder.baseline?.row.metrics.passiveIncome.value === head.passiveIncome);
  ok("Phase 2 baseline monthly surplus == canonical", builder.baseline?.row.metrics.monthlySurplus.value === head.monthlySurplus);

  ok(
    "Phase 1 head.netWorth == Phase 2 builder baseline NW (no drift)",
    phase1.bundle?.head.netWorth === builder.baseline?.row.metrics.netWorth.value,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — formatDelta presentation
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§10 formatDelta presentation");
{
  ok("currency >= 1M formatted with M", formatDelta({ key: "netWorth", delta: 1_500_000, format: "currency", incomplete: false }) === "+$1.50M");
  ok("currency >= 1k formatted with k", formatDelta({ key: "netWorth", delta: -25_000, format: "currency", incomplete: false }) === "−$25k");
  ok("percent in pp", formatDelta({ key: "monteCarloConfidence", delta: 0.07, format: "percent", incomplete: false }) === "+7pp");
  ok("text always —", formatDelta({ key: "recommendedAction", delta: null, format: "text", incomplete: true }) === "—");
  ok("null delta is —", formatDelta({ key: "netWorth", delta: null, format: "currency", incomplete: true }) === "—");
}

/* ─── Summary ──────────────────────────────────────────────────────────── */

console.log(`\n──────────────────────────────────────────────`);
console.log(` Passed: ${passed}`);
console.log(` Failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
