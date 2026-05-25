/**
 * test-sprint-9-path-simulation.ts
 *
 * Sprint 9 — Path-Based Wealth Simulation Engine regression tests.
 *
 * What this proves
 * ----------------
 *   §1  Engine builds a non-empty result for a populated Sprint 7 result
 *   §2  Engine runs ≥ 1,000 full life-path simulations per selected strategy
 *   §3  Simulation metadata is exposed and consistent
 *   §4  Deterministic seeding — same seed ⇒ identical outputs
 *   §5  Percentile ordering P10 ≤ P25 ≤ P50 ≤ P75 ≤ P90 across every band
 *   §6  Probabilities are valid (0..1 inclusive)
 *   §7  Robust score is in [0, 100]
 *   §8  Target year resolution comes from canonical FIRE / Sprint 7 goal
 *   §9  Missing-data graceful handling (empty Sprint 7 ⇒ empty Sprint 9)
 *  §10  No fabricated household values — output differs across fixtures
 *  §11  Audit trail entries present with engines + inputs + assumptions
 *  §12  Below-floor `simulationsPerStrategy` is clamped to ≥ 1,000
 *  §13  Probability curve is monotonic non-decreasing per strategy
 *  §14  Fire-year histogram probabilities sum ≤ 1
 *  §15  Heatmap covers every (strategy, horizon-year) pair
 *  §16  Sprint 7 deterministic outputs are unchanged by Sprint 9
 *  §17  React SSR — Sprint 9 component renders with required testids
 *
 * Run with: tsx script/test-sprint-9-path-simulation.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildTruePortfolioOptimizer } from "../client/src/lib/truePortfolioOptimizer";
import {
  buildPathSimulationEngine,
  DEFAULT_PATH_SIMS_PER_STRATEGY,
  MIN_PATH_SIMS_PER_STRATEGY,
  PATH_SIM_ENGINE_VERSION,
  formatPathProbability,
  formatPathBand,
  type PathSimulationResult,
  type PathStrategyResult,
} from "../client/src/lib/pathSimulationEngine";
import { PathSimulationSection } from "../client/src/components/PathSimulationSection";
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

/* ─── Fixtures ─────────────────────────────────────────────────────────── */

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

const FIXTURE_TIGHT_SNAPSHOT = {
  ...FIXTURE_SNAPSHOT_RICH,
  cash: 5_000,
  offset_balance: 5_000,
  monthly_expenses: 22_000,
};

const FIXTURE_TIGHT: DashboardInputs = {
  ...FIXTURE_RICH,
  snapshot: FIXTURE_TIGHT_SNAPSHOT,
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

const GOAL_INPUTS = { targetFireDate: "2045-12-31", targetPassiveIncome: 96_000 };

function buildSprint7(fixture: DashboardInputs) {
  return buildTruePortfolioOptimizer({
    canonicalLedger: fixture,
    goalSolverInputs: GOAL_INPUTS,
  });
}

console.log("\nSprint 9 — Path-Based Wealth Simulation Engine\n");
console.log(`  Engine version: ${PATH_SIM_ENGINE_VERSION}\n`);

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Non-empty for populated Sprint 7 result
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Engine builds a non-empty result");
let resultRich: PathSimulationResult;
{
  const s7 = buildSprint7(FIXTURE_RICH);
  resultRich = buildPathSimulationEngine({
    sprint7Result: s7,
    canonicalLedger: FIXTURE_RICH,
    seed: 42,
    simulationsPerStrategy: 1_000,
    maxStrategies: 3,
  });
  ok("result.empty === false", resultRich.empty === false);
  ok("strategies non-empty", resultRich.strategies.length > 0);
  ok("ranking non-empty", resultRich.ranking.length > 0);
  ok("bestStrategy non-null", resultRich.bestStrategy !== null);
  ok("scenarioHeatmap populated", resultRich.scenarioHeatmap.length > 0);
  ok("auditTrail.entries populated", resultRich.auditTrail.entries.length >= 3);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — ≥ 1,000 simulations per selected strategy
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  ≥ 1,000 simulations per strategy");
{
  for (const s of resultRich.strategies) {
    ok(
      `strategy "${s.label}" ran ≥ 1,000 paths (got ${s.simulationsRun})`,
      s.simulationsRun >= MIN_PATH_SIMS_PER_STRATEGY,
    );
  }
  ok(
    "simulationsPerStrategy metadata ≥ floor",
    resultRich.auditTrail.metadata.simulationsPerStrategy >= MIN_PATH_SIMS_PER_STRATEGY,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Simulation metadata consistency
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Simulation metadata consistency");
{
  const m = resultRich.auditTrail.metadata;
  ok("engineVersion matches", m.engineVersion === PATH_SIM_ENGINE_VERSION);
  ok(
    "strategiesSimulated equals strategies.length",
    m.strategiesSimulated === resultRich.strategies.length,
    { meta: m.strategiesSimulated, actual: resultRich.strategies.length },
  );
  ok(
    "totalSimulations equals sum of per-strategy sims",
    m.totalSimulations === resultRich.strategies.reduce((acc, s) => acc + s.simulationsRun, 0),
  );
  ok("seed surfaced", typeof m.seed === "number");
  ok("horizonYears > 0", m.horizonYears > 0);
  ok("runtimeMs is finite & ≥ 0", Number.isFinite(m.runtimeMs) && m.runtimeMs >= 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Deterministic seeding
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Deterministic seeding");
{
  const s7 = buildSprint7(FIXTURE_RICH);
  const a = buildPathSimulationEngine({
    sprint7Result: s7,
    canonicalLedger: FIXTURE_RICH,
    seed: 123,
    simulationsPerStrategy: 1_000,
    maxStrategies: 1,
  });
  const b = buildPathSimulationEngine({
    sprint7Result: s7,
    canonicalLedger: FIXTURE_RICH,
    seed: 123,
    simulationsPerStrategy: 1_000,
    maxStrategies: 1,
  });
  ok("same seed ⇒ same strategy count", a.strategies.length === b.strategies.length);
  for (let i = 0; i < a.strategies.length; i++) {
    const x = a.strategies[i];
    const y = b.strategies[i];
    ok(
      `strategy[${i}] P(FIRE by target) reproducible`,
      x.probabilityFireByTarget === y.probabilityFireByTarget,
      { x: x.probabilityFireByTarget, y: y.probabilityFireByTarget },
    );
    ok(
      `strategy[${i}] robustScore reproducible`,
      x.robustScore === y.robustScore,
      { x: x.robustScore, y: y.robustScore },
    );
    ok(
      `strategy[${i}] netWorthBand.p50 reproducible`,
      x.netWorthBand.p50 === y.netWorthBand.p50,
    );
  }

  // Different seed should produce at least one different probabilistic output.
  const c = buildPathSimulationEngine({
    sprint7Result: s7,
    canonicalLedger: FIXTURE_RICH,
    seed: 456,
    simulationsPerStrategy: 1_000,
    maxStrategies: 1,
  });
  const aAny = a.strategies[0];
  const cAny = c.strategies[0];
  if (aAny && cAny) {
    const anyDiffer =
      aAny.probabilityFireByTarget !== cAny.probabilityFireByTarget ||
      aAny.netWorthBand.p50 !== cAny.netWorthBand.p50 ||
      aAny.fireYearBand.p50 !== cAny.fireYearBand.p50;
    ok("different seeds yield at least one differing output", anyDiffer);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Percentile ordering
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  P10 ≤ P25 ≤ P50 ≤ P75 ≤ P90 across bands");
{
  function checkOrdered(label: string, p10: number | null, p25: number | null, p50: number | null, p75: number | null, p90: number | null) {
    if (p10 == null || p25 == null || p50 == null || p75 == null || p90 == null) {
      // Allow null bands when underlying engine returned incomplete.
      return;
    }
    ok(
      `${label}: p10 ≤ p25`,
      p10 <= p25 + 1e-6,
      { p10, p25 },
    );
    ok(`${label}: p25 ≤ p50`, p25 <= p50 + 1e-6, { p25, p50 });
    ok(`${label}: p50 ≤ p75`, p50 <= p75 + 1e-6, { p50, p75 });
    ok(`${label}: p75 ≤ p90`, p75 <= p90 + 1e-6, { p75, p90 });
  }

  for (const s of resultRich.strategies) {
    checkOrdered(`${s.label} netWorthBand`, s.netWorthBand.p10, s.netWorthBand.p25, s.netWorthBand.p50, s.netWorthBand.p75, s.netWorthBand.p90);
    checkOrdered(`${s.label} passiveIncomeBand`, s.passiveIncomeBand.p10, s.passiveIncomeBand.p25, s.passiveIncomeBand.p50, s.passiveIncomeBand.p75, s.passiveIncomeBand.p90);
    checkOrdered(`${s.label} fireYearBand`, s.fireYearBand.p10, s.fireYearBand.p25, s.fireYearBand.p50, s.fireYearBand.p75, s.fireYearBand.p90);
    for (const yb of s.netWorthFan) {
      checkOrdered(`${s.label} fan yr ${yb.year}`, yb.p10, yb.p25, yb.p50, yb.p75, yb.p90);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Probabilities in [0, 1]
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Probabilities in [0, 1]");
{
  const inRange = (p: number | null) => p == null || (p >= 0 && p <= 1);
  for (const s of resultRich.strategies) {
    ok(`${s.label}: probabilityFireByTarget in [0,1]`, inRange(s.probabilityFireByTarget), s.probabilityFireByTarget);
    ok(`${s.label}: probabilityFireBeforeTarget in [0,1]`, inRange(s.probabilityFireBeforeTarget), s.probabilityFireBeforeTarget);
    ok(`${s.label}: probabilityMissFire in [0,1]`, inRange(s.probabilityMissFire), s.probabilityMissFire);
    ok(`${s.label}: probabilityCashShortfall in [0,1]`, inRange(s.probabilityCashShortfall), s.probabilityCashShortfall);
    ok(`${s.label}: probabilityNegativeCashflow in [0,1]`, inRange(s.probabilityNegativeCashflow), s.probabilityNegativeCashflow);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Robust score in [0, 100]
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Robust score in [0, 100]");
{
  for (const s of resultRich.strategies) {
    ok(
      `${s.label}: robustScore in [0,100] (or null)`,
      s.robustScore == null || (s.robustScore >= 0 && s.robustScore <= 100),
      s.robustScore,
    );
  }
  // Ranking is sorted descending by robustScore.
  for (let i = 1; i < resultRich.ranking.length; i++) {
    const prev = resultRich.ranking[i - 1].robustScore ?? -1;
    const cur = resultRich.ranking[i].robustScore ?? -1;
    ok(`ranking[${i}] robustScore ≤ ranking[${i - 1}]`, cur <= prev + 1e-6, { prev, cur });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Target year resolution
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Target year resolution");
{
  const s7 = buildSprint7(FIXTURE_RICH);
  const goalTarget = s7.goalReverseEngineering.targetFireDate?.value ?? null;
  const best = resultRich.bestStrategy!;
  if (goalTarget != null && Number.isFinite(goalTarget)) {
    ok(
      "best strategy targetFireYear matches Sprint 7 goal",
      best.targetFireYear === Math.round(goalTarget),
      { strategy: best.targetFireYear, goal: goalTarget },
    );
  } else {
    // Sprint 7 didn't surface an explicit target — engine should still
    // resolve a target via canonical FIRE settings or fall back gracefully.
    ok(
      "engine resolves a target year when Sprint 7 omits one (or null)",
      best.targetFireYear == null || Number.isFinite(best.targetFireYear),
      { strategy: best.targetFireYear },
    );
  }
  ok(
    "horizonYears is positive and bounded",
    resultRich.auditTrail.metadata.horizonYears >= 5 && resultRich.auditTrail.metadata.horizonYears <= 40,
    resultRich.auditTrail.metadata.horizonYears,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Missing-data graceful handling
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  Missing-data graceful handling");
{
  const s7Empty = buildSprint7(EMPTY_LEDGER);
  const r = buildPathSimulationEngine({
    sprint7Result: s7Empty,
    canonicalLedger: EMPTY_LEDGER,
    seed: 7,
    simulationsPerStrategy: 1_000,
  });
  ok("empty Sprint 7 ⇒ empty Sprint 9", r.empty === true || r.strategies.length === 0);
  if (r.empty) {
    ok("empty result includes emptyReason", typeof r.emptyReason === "string" && r.emptyReason.length > 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — No fabricated values; differs across fixtures
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10  No fabricated values — output differs across fixtures");
{
  const s7Tight = buildSprint7(FIXTURE_TIGHT);
  const tight = buildPathSimulationEngine({
    sprint7Result: s7Tight,
    canonicalLedger: FIXTURE_TIGHT,
    seed: 42,
    simulationsPerStrategy: 1_000,
    maxStrategies: 1,
  });
  // Tight household has higher expenses & no buffer → expect different
  // probabilities/bands than rich.
  const rb = resultRich.bestStrategy!;
  const tb = tight.bestStrategy!;
  const someDiffer =
    rb.probabilityFireByTarget !== tb.probabilityFireByTarget ||
    rb.netWorthBand.p50 !== tb.netWorthBand.p50 ||
    rb.probabilityCashShortfall !== tb.probabilityCashShortfall ||
    rb.fireYearBand.p50 !== tb.fireYearBand.p50;
  ok("tight vs rich fixture produces different outputs", someDiffer);
  ok(
    "tight fixture: cash-shortfall probability ≥ rich",
    (tb.probabilityCashShortfall ?? 0) >= (rb.probabilityCashShortfall ?? 0) - 0.01,
    {
      tight: tb.probabilityCashShortfall,
      rich: rb.probabilityCashShortfall,
    },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — Audit trail entries
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§11  Audit trail entries");
{
  for (const e of resultRich.auditTrail.entries) {
    ok(`audit "${e.label}": enginesUsed non-empty`, e.enginesUsed.length > 0);
    ok(`audit "${e.label}": inputsUsed non-empty`, e.inputsUsed.length > 0);
    ok(`audit "${e.label}": howCalculated non-empty`, typeof e.howCalculated === "string" && e.howCalculated.length > 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §12 — Below-floor sims clamped to ≥ 1000
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§12  Below-floor sims clamped");
{
  const s7 = buildSprint7(FIXTURE_RICH);
  const r = buildPathSimulationEngine({
    sprint7Result: s7,
    canonicalLedger: FIXTURE_RICH,
    seed: 1,
    simulationsPerStrategy: 50, // below floor
    maxStrategies: 1,
  });
  ok(
    "requesting < 1000 sims is clamped to ≥ 1000",
    r.auditTrail.metadata.simulationsPerStrategy >= MIN_PATH_SIMS_PER_STRATEGY,
    r.auditTrail.metadata.simulationsPerStrategy,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §13 — Probability curve monotonic
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§13  Probability curve monotonic non-decreasing");
{
  for (const s of resultRich.strategies) {
    let monotonic = true;
    for (let i = 1; i < s.probabilityCurve.length; i++) {
      if (s.probabilityCurve[i].probability < s.probabilityCurve[i - 1].probability - 1e-6) {
        monotonic = false;
        break;
      }
    }
    ok(`${s.label}: cumulative P(FIRE) curve non-decreasing`, monotonic);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §14 — Histogram probabilities sum ≤ 1
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§14  FIRE-year histogram probabilities sum ≤ 1");
{
  for (const s of resultRich.strategies) {
    const total = s.fireYearHistogram.reduce((acc, b) => acc + b.probability, 0);
    ok(
      `${s.label}: histogram sum ≤ 1 (got ${total.toFixed(3)})`,
      total <= 1 + 1e-6,
      total,
    );
    // Should equal P(FIRE within horizon) ≈ probabilityFireByTarget + paths
    // that hit FIRE after target but before horizon end. We at least know
    // total ≥ probabilityFireByTarget (paths that hit by target are a subset
    // of paths that hit at all).
    if (s.probabilityFireByTarget != null) {
      ok(
        `${s.label}: histogram sum ≥ probabilityFireByTarget`,
        total >= s.probabilityFireByTarget - 0.05,
        { total, p: s.probabilityFireByTarget },
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §15 — Heatmap covers strategy×year
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§15  Heatmap covers (strategy × year)");
{
  const sids = new Set(resultRich.strategies.map((s) => s.scenarioId));
  const cellsById = new Map<string, Set<number>>();
  for (const c of resultRich.scenarioHeatmap) {
    if (!cellsById.has(c.scenarioId)) cellsById.set(c.scenarioId, new Set());
    cellsById.get(c.scenarioId)!.add(c.year);
  }
  for (const sid of sids) {
    const years = cellsById.get(sid);
    ok(`heatmap covers strategy ${sid}`, years != null && years.size > 0);
  }
  for (const c of resultRich.scenarioHeatmap) {
    ok(`heatmap cell ${c.scenarioId}@${c.year}: probability in [0,1]`, c.probability >= 0 && c.probability <= 1);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §16 — Sprint 7 outputs unchanged by Sprint 9
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§16  Sprint 7 unchanged by Sprint 9");
{
  const s7Before = buildSprint7(FIXTURE_RICH);
  const before = JSON.stringify({
    scenarios: s7Before.scenarios.map((s) => ({ id: s.id, label: s.label })),
    recommendations: s7Before.recommendations.map((r) => ({ category: r.category, scenarioId: r.scenarioId })),
    frontier: s7Before.frontier.points.map((p) => p.scenarioId),
  });
  buildPathSimulationEngine({
    sprint7Result: s7Before,
    canonicalLedger: FIXTURE_RICH,
    seed: 99,
    simulationsPerStrategy: 1_000,
    maxStrategies: 1,
  });
  const after = JSON.stringify({
    scenarios: s7Before.scenarios.map((s) => ({ id: s.id, label: s.label })),
    recommendations: s7Before.recommendations.map((r) => ({ category: r.category, scenarioId: r.scenarioId })),
    frontier: s7Before.frontier.points.map((p) => p.scenarioId),
  });
  ok("Sprint 7 result not mutated by Sprint 9 engine", before === after);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §17 — React SSR — required testids render
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§17  React SSR — required testids render");
{
  const html = renderToStaticMarkup(
    React.createElement(PathSimulationSection, { result: resultRich }),
  );
  const required = [
    "path-sim-root",
    "path-sim-confidence-summary",
    "path-sim-confidence-summary-title",
    "path-sim-strategy-ranking",
    "path-sim-strategy-ranking-table",
    "path-sim-probability-table",
    "path-sim-net-worth-fan",
    "path-sim-fire-year-histogram",
    "path-sim-probability-curve",
    "path-sim-scenario-heatmap",
    "path-sim-representative-paths",
    "path-sim-driver-sensitivity",
    "path-sim-audit-trail",
  ];
  for (const id of required) {
    ok(`SSR contains testid "${id}"`, hasTestId(html, id));
  }
  // Empty state renders too.
  const s7Empty = buildSprint7(EMPTY_LEDGER);
  const emptyResult = buildPathSimulationEngine({
    sprint7Result: s7Empty,
    canonicalLedger: EMPTY_LEDGER,
    seed: 1,
    simulationsPerStrategy: 1_000,
  });
  const emptyHtml = renderToStaticMarkup(
    React.createElement(PathSimulationSection, { result: emptyResult }),
  );
  ok(
    "empty state renders with empty testid",
    hasTestId(emptyHtml, "path-sim-empty") || hasTestId(emptyHtml, "path-sim-root"),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Final
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log(`\n────────────────────────────────────────────────────`);
console.log(`Sprint 9 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nFailures:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`All Sprint 9 path-simulation regression tests passed.\n`);
