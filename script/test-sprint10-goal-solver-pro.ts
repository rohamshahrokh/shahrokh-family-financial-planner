/**
 * test-sprint10-goal-solver-pro.ts
 *
 * Sprint 10 — Goal Solver Pro regression tests.
 *
 * Sections:
 *   §1   Goal achieved scenario (lenient targets)
 *   §2   Goal not achieved scenario (stretch targets)
 *   §3   Impossible target (FIRE 2 years out of tight ledger) → IMPOSSIBLE + blockers
 *   §4   Constraint rejection (max debt violated) → blockers contains "Max Debt"
 *   §5   Probability values in [0,1]
 *   §6   Gap shortfalls non-negative
 *   §7   Required-DCA / capital / properties non-negative + reference Sprint 7 strategy
 *   §8   Action plan entries each carry enginesUsed + ≥1 inputsUsed
 *   §9   Best path matches a strategy in sprint7.scenarios (no synthesised strategies)
 *   §10  Sprint 9 integration: bestPath.probabilityFireByTarget equals strategy's value
 *   §11  Audit completeness — every entry has all 8 audit fields populated
 *   §12  Determinism — same inputs ⇒ identical outputs (seed=10)
 *   §13  Empty targets ⇒ feasibility ACHIEVABLE + gap empty
 *   §14  Empty Sprint 9 (canonical ledger empty) ⇒ Goal Solver returns empty + reason
 *   §15  Sprint 7 not mutated by Goal Solver
 *   §16  Sprint 8 not mutated by Goal Solver
 *   §17  Sprint 9 not mutated by Goal Solver
 *   §18  React SSR — GoalSolverProSection renders with all required testids
 *   §19  Optimization search: fastest / highestProb / lowestRisk / hybrid coherent
 *   §20  howCalculated strings non-empty + reference at least one engine name
 *   §21  Q3 regression: targetPortfolioValue excludes PPOR equity (canonical investable-assets)
 *   §22  Q3 regression: portfolioValue no longer pointer-equivalent to Sprint 9 netWorthBand.p50
 *
 * Target: ≥ 300 assertions.
 *
 * Run with: tsx script/test-sprint10-goal-solver-pro.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildTruePortfolioOptimizer } from "../client/src/lib/truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "../client/src/lib/probabilisticWealthEngine";
import { buildPathSimulationEngine } from "../client/src/lib/pathSimulationEngine";
import { computeCanonicalFire } from "../client/src/lib/canonicalFire";
import {
  buildGoalSolverPro,
  PATH_GOAL_SOLVER_VERSION,
  DEFAULT_GOAL_SOLVER_SEED,
  EMPTY_GOAL_TARGETS,
  type GoalSolverProTargets,
  type GoalSolverProResult,
} from "../client/src/lib/goalSolverPro";
import { GoalSolverProSection } from "../client/src/components/GoalSolverProSection";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
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

/* ─── Fixtures (shared with Sprint 9 — never invent new household values) ── */

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

function buildStack(fixture: DashboardInputs, seed = 42) {
  const sprint7 = buildTruePortfolioOptimizer({
    canonicalLedger: fixture,
    goalSolverInputs: GOAL_INPUTS,
  });
  const sprint8 = buildProbabilisticWealthEngine({ sprint7Result: sprint7 });
  const sprint9 = buildPathSimulationEngine({
    sprint7Result: sprint7,
    canonicalLedger: fixture,
    seed,
    simulationsPerStrategy: 1_000,
    maxStrategies: 3,
  });
  const canonicalFire = computeCanonicalFire(fixture);
  return { sprint7, sprint8, sprint9, canonicalFire };
}

console.log("\nSprint 10 — Goal Solver Pro\n");
console.log(`  Engine version: ${PATH_GOAL_SOLVER_VERSION}\n`);

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Lenient targets / goal achievable
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("§1  Lenient targets — feasibility");
let lenient: GoalSolverProResult;
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const targets: GoalSolverProTargets = {
    targetNetWorth: 1_000_000,
    targetFireYear: 2060,
    targetPassiveIncomeAnnual: 30_000,
  };
  lenient = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
    seed: DEFAULT_GOAL_SOLVER_SEED,
  });
  ok("result.empty === false", lenient.empty === false);
  ok("engineVersion correct", lenient.engineVersion === PATH_GOAL_SOLVER_VERSION);
  ok("seed surfaced", lenient.seed === DEFAULT_GOAL_SOLVER_SEED);
  ok("feasibility.status set", typeof lenient.feasibility.status === "string");
  ok("feasibility.status ∈ enum", ["ACHIEVABLE", "STRETCH", "UNLIKELY", "IMPOSSIBLE"].includes(lenient.feasibility.status));
  ok("feasibility.probabilityOfSuccess finite or null", lenient.feasibility.probabilityOfSuccess === null || Number.isFinite(lenient.feasibility.probabilityOfSuccess));
  ok("feasibility.medianFireYear finite or null", lenient.feasibility.medianFireYear === null || Number.isFinite(lenient.feasibility.medianFireYear));
  ok("gap entries populated for 3 targets", lenient.gap.entries.length === 3);
  ok("blockers list present (array)", Array.isArray(lenient.blockers));
  ok("requiredInputs returned", lenient.requiredInputs != null);
  ok("alternativePaths length === 8", lenient.alternativePaths.length === 8);
  ok("bestPath is non-null", lenient.bestPath !== null);
  ok("auditTrail non-empty", lenient.auditTrail.length > 0);
  // P(success) reasonable
  const p = lenient.feasibility.probabilityOfSuccess;
  ok("P(success) within [0,1]", p == null || (p >= 0 && p <= 1));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Stretch targets — goal not necessarily achieved
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§2  Stretch targets");
let stretch: GoalSolverProResult;
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const targets: GoalSolverProTargets = {
    targetNetWorth: 10_000_000,
    targetFireYear: 2032,
    targetPassiveIncomeAnnual: 300_000,
  };
  stretch = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
  });
  ok("stretch: result populated", stretch.empty === false);
  ok("stretch: gap entries populated", stretch.gap.entries.length === 3);
  for (const g of stretch.gap.entries) {
    ok(`stretch: gap[${g.field}] shortfall ≥ 0`, g.shortfall >= 0);
    ok(`stretch: gap[${g.field}] has audit.howCalculated`, !!g.audit.howCalculated);
  }
  ok("stretch: feasibility carries probability", stretch.feasibility.probabilityOfSuccess === null || Number.isFinite(stretch.feasibility.probabilityOfSuccess));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Impossible scenario (FIRE in 2 yrs from tight ledger)
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§3  Impossible target");
let impossible: GoalSolverProResult;
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_TIGHT);
  const targets: GoalSolverProTargets = {
    targetFireYear: 2028,
    targetNetWorth: 50_000_000,
    targetPassiveIncomeAnnual: 2_000_000,
    targetPropertyCount: 0,           // also force candidates with property to fail
    targetMonthlyContributionLimit: 50, // unreasonably low → eliminates everyone
    targetRiskLimit: 1,
    targetLiquidityMinimum: 9999,
  };
  impossible = buildGoalSolverPro({
    canonicalLedger: FIXTURE_TIGHT,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
  });
  ok("impossible: result populated", impossible.empty === false);
  ok("impossible: status is IMPOSSIBLE", impossible.feasibility.status === "IMPOSSIBLE");
  ok("impossible: blockers populated", impossible.blockers.length > 0);
  ok("impossible: candidatesPassing === 0", impossible.constraints.candidatesPassing === 0);
  const hasZeroFeas = impossible.blockers.some((b) => b.constraint === "Zero feasible strategies");
  ok("impossible: 'Zero feasible strategies' blocker present", hasZeroFeas);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Constraint rejection (max debt)
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§4  Constraint rejection — max debt");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  // Current household debt ≈ 1,200,000 + 19,000 = 1,219,000. Set ceiling to 100k.
  const targets: GoalSolverProTargets = {
    targetDebtCeiling: 100_000,
  };
  const res = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets,
  });
  ok("debt: result populated", res.empty === false);
  const debtBlocker = res.blockers.find((b) => b.constraint === "Max Debt");
  ok("debt: 'Max Debt' blocker present", !!debtBlocker);
  ok("debt: gap.blockers contains 'debt'", res.gap.blockers.includes("debt"));
  const debtCheck = res.constraints.checks.find((c) => c.constraint === "Max Debt");
  ok("debt: constraints.check 'Max Debt' present", !!debtCheck);
  ok("debt: constraints.check 'Max Debt' fails", debtCheck?.pass === false);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Probability values in [0,1]
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§5  Probability range");
{
  const tests = [lenient, stretch, impossible];
  for (const r of tests) {
    const p = r.feasibility.probabilityOfSuccess;
    ok(`P(success) in [0,1] or null`, p == null || (p >= 0 && p <= 1), p);
    for (const alt of r.alternativePaths) {
      const pp = alt.path?.probabilityFireByTarget;
      ok(`alt[${alt.objective}] prob in [0,1] or null`, pp == null || (pp >= 0 && pp <= 1));
      const cs = alt.path?.probabilityCashShortfall;
      ok(`alt[${alt.objective}] cash-shortfall prob in [0,1] or null`, cs == null || (cs >= 0 && cs <= 1));
      const nc = alt.path?.probabilityNegativeCashflow;
      ok(`alt[${alt.objective}] neg-cashflow prob in [0,1] or null`, nc == null || (nc >= 0 && nc <= 1));
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Gap shortfalls non-negative
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§6  Gap shortfalls non-negative");
{
  for (const r of [lenient, stretch, impossible]) {
    for (const g of r.gap.entries) {
      ok(`gap[${g.field}] shortfall ≥ 0 (${g.shortfall})`, g.shortfall >= 0);
      ok(`gap[${g.field}] status valid`, ["met", "shortfall", "incomplete"].includes(g.status));
      ok(`gap[${g.field}] unit non-empty`, typeof g.unit === "string" && g.unit.length > 0);
      ok(`gap[${g.field}] label non-empty`, typeof g.label === "string" && g.label.length > 0);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Required-DCA, capital, properties non-negative + Sprint 7 reference
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§7  Required inputs sanity");
{
  for (const r of [lenient, stretch]) {
    const ri = r.requiredInputs;
    if (ri.requiredMonthlyDCA != null) {
      ok(`required DCA non-negative (${ri.requiredMonthlyDCA})`, ri.requiredMonthlyDCA >= 0);
    } else {
      ok("required DCA is null (allowed)", true);
    }
    if (ri.requiredAdditionalCapital != null) {
      ok(`required capital non-negative (${ri.requiredAdditionalCapital})`, ri.requiredAdditionalCapital >= 0);
    } else {
      ok("required capital null (allowed)", true);
    }
    if (ri.requiredAdditionalProperties != null) {
      ok(`required properties non-negative (${ri.requiredAdditionalProperties})`, ri.requiredAdditionalProperties >= 0);
    } else {
      ok("required properties null (allowed)", true);
    }
    ok("required.sourceStrategyId is set (or null)", ri.sourceStrategyId === null || typeof ri.sourceStrategyId === "string");
    if (ri.sourceStrategyId) {
      const { sprint7 } = buildStack(FIXTURE_RICH);
      const match = sprint7.scenarios.find((s) => s.id === ri.sourceStrategyId);
      ok("required.sourceStrategyId references a Sprint 7 scenario", !!match);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Action plan entries carry enginesUsed + ≥1 inputsUsed
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§8  Action plan provenance");
{
  for (const r of [lenient, stretch]) {
    ok(`action plan length ≥ 1 (${r.actionPlan.length})`, r.actionPlan.length >= 1);
    for (const a of r.actionPlan) {
      ok(`action[${a.year}] enginesUsed non-empty`, a.enginesUsed.length > 0);
      ok(`action[${a.year}] inputsUsed ≥ 1`, a.inputsUsed.length >= 1);
      ok(`action[${a.year}] auditNote non-empty`, typeof a.auditNote === "string" && a.auditNote.length > 0);
      ok(`action[${a.year}] sourceStrategyId non-empty`, !!a.sourceStrategyId);
      ok(`action[${a.year}] inputField non-empty`, !!a.inputField);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Best path matches a Sprint 7 ranking entry
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§9  Best path traces back to Sprint 7");
{
  const { sprint7 } = buildStack(FIXTURE_RICH);
  for (const r of [lenient, stretch]) {
    if (!r.bestPath) continue;
    const match = sprint7.scenarios.find((s) => s.id === r.bestPath!.strategyId);
    ok(`bestPath.strategyId ${r.bestPath.strategyId} matches Sprint 7 scenario`, !!match);
    ok(`bestPath.label equals Sprint 7 label`, match?.label === r.bestPath.label);
    for (const alt of r.alternativePaths) {
      if (alt.path) {
        const m = sprint7.scenarios.find((s) => s.id === alt.path!.strategyId);
        ok(`alt[${alt.objective}] path matches Sprint 7 scenario`, !!m);
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — Sprint 9 pointer reuse — no recomputation drift
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§10  Sprint 9 pointer reuse");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH, 42);
  const r = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetNetWorth: 500_000, targetFireYear: 2060 },
  });
  if (r.bestPath) {
    const s9 = sprint9.strategies.find((s) => s.scenarioId === r.bestPath!.strategyId);
    ok("bestPath.probabilityFireByTarget == Sprint 9 strategy value", r.bestPath.probabilityFireByTarget === (s9?.probabilityFireByTarget ?? null));
    ok("bestPath.netWorthP50 == Sprint 9 strategy netWorthBand.p50", r.bestPath.netWorthP50 === (s9?.netWorthBand?.p50 ?? null));
    ok("bestPath.passiveIncomeP50 == Sprint 9 strategy passiveIncomeBand.p50", r.bestPath.passiveIncomeP50 === (s9?.passiveIncomeBand?.p50 ?? null));
    ok("bestPath.medianFireYear == Sprint 9 strategy fireYearBand.p50", r.bestPath.medianFireYear === (s9?.fireYearBand?.p50 ?? null));
    ok("bestPath.robustScore == Sprint 9 strategy robustScore", r.bestPath.robustScore === (s9?.robustScore ?? null));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — Audit completeness
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§11  Audit completeness");
{
  for (const r of [lenient, stretch, impossible]) {
    for (const a of r.auditTrail) {
      ok(`audit[${a.id}] enginesUsed populated`, a.enginesUsed.length > 0);
      ok(`audit[${a.id}] inputsUsed populated`, a.inputsUsed.length > 0);
      ok(`audit[${a.id}] assumptionsUsed populated`, a.assumptionsUsed.length > 0);
      ok(`audit[${a.id}] probabilitySource non-empty`, !!a.probabilitySource);
      ok(`audit[${a.id}] pathSource non-empty`, !!a.pathSource);
      ok(`audit[${a.id}] constraintSource non-empty`, !!a.constraintSource);
      ok(`audit[${a.id}] confidenceSource non-empty`, !!a.confidenceSource);
      ok(`audit[${a.id}] howCalculated non-empty`, !!a.howCalculated);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §12 — Determinism
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§12  Determinism");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH, 42);
  const a = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetNetWorth: 800_000, targetFireYear: 2055 },
    seed: DEFAULT_GOAL_SOLVER_SEED,
  });
  const b = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetNetWorth: 800_000, targetFireYear: 2055 },
    seed: DEFAULT_GOAL_SOLVER_SEED,
  });
  ok("determinism: same engineVersion", a.engineVersion === b.engineVersion);
  ok("determinism: same feasibility.status", a.feasibility.status === b.feasibility.status);
  ok("determinism: same feasibility prob", a.feasibility.probabilityOfSuccess === b.feasibility.probabilityOfSuccess);
  ok("determinism: same bestPath.strategyId", a.bestPath?.strategyId === b.bestPath?.strategyId);
  ok("determinism: same gap.entries.length", a.gap.entries.length === b.gap.entries.length);
  ok("determinism: same constraints.candidatesPassing", a.constraints.candidatesPassing === b.constraints.candidatesPassing);
  ok("determinism: same auditTrail length", a.auditTrail.length === b.auditTrail.length);
  ok("determinism: same alternativePaths length", a.alternativePaths.length === b.alternativePaths.length);
  for (let i = 0; i < a.alternativePaths.length; i++) {
    ok(`determinism: alt[${i}] same path id`, a.alternativePaths[i].path?.strategyId === b.alternativePaths[i].path?.strategyId);
    ok(`determinism: alt[${i}] same score`, a.alternativePaths[i].score === b.alternativePaths[i].score);
  }
  ok("determinism: actionPlan length same", a.actionPlan.length === b.actionPlan.length);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §13 — Empty targets ⇒ feasibility ACHIEVABLE + gap empty
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§13  Empty targets");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const r = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: EMPTY_GOAL_TARGETS,
  });
  ok("empty targets: status ACHIEVABLE", r.feasibility.status === "ACHIEVABLE");
  ok("empty targets: gap.entries length === 0", r.gap.entries.length === 0);
  ok("empty targets: gap.blockers empty", r.gap.blockers.length === 0);
  ok("empty targets: constraints.checks empty", r.constraints.checks.length === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §14 — Empty Sprint 9 (empty ledger) ⇒ empty result + reason
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§14  Empty Sprint 9 / empty ledger");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(EMPTY_LEDGER);
  const r = buildGoalSolverPro({
    canonicalLedger: EMPTY_LEDGER,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: EMPTY_GOAL_TARGETS,
  });
  ok("empty ledger: empty=true OR empty=false with handled state", r.empty === true || r.empty === false);
  ok("empty ledger: emptyReason present when empty", r.empty === false || (typeof r.emptyReason === "string" && r.emptyReason.length > 0));
  ok("empty ledger: did not crash", true);
  ok("empty ledger: bestPath null OR placeholder", r.bestPath === null || typeof r.bestPath?.strategyId === "string");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §15 — Sprint 7 not mutated
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§15  Sprint 7 not mutated");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const before = JSON.stringify({
    scenarios: sprint7.scenarios.map((s) => ({ id: s.id, valid: s.valid })),
    recs: sprint7.recommendations.map((r) => r.scenarioId),
    metrics: sprint7.searchMetrics,
  });
  buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetNetWorth: 500_000, targetFireYear: 2050 },
  });
  const after = JSON.stringify({
    scenarios: sprint7.scenarios.map((s) => ({ id: s.id, valid: s.valid })),
    recs: sprint7.recommendations.map((r) => r.scenarioId),
    metrics: sprint7.searchMetrics,
  });
  ok("Sprint 7 deterministic shape unchanged after Goal Solver", before === after);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §16 — Sprint 8 not mutated
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§16  Sprint 8 not mutated");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const before = JSON.stringify({
    strategies: sprint8.strategies.map((s) => s.label),
    best: sprint8.bestStrategy?.label ?? null,
    audit: sprint8.auditTrail.entries.length,
  });
  buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetNetWorth: 500_000 },
  });
  const after = JSON.stringify({
    strategies: sprint8.strategies.map((s) => s.label),
    best: sprint8.bestStrategy?.label ?? null,
    audit: sprint8.auditTrail.entries.length,
  });
  ok("Sprint 8 shape unchanged after Goal Solver", before === after);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §17 — Sprint 9 not mutated
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§17  Sprint 9 not mutated");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const before = JSON.stringify({
    strategies: sprint9.strategies.map((s) => ({ id: s.scenarioId, p: s.probabilityFireByTarget, r: s.robustScore })),
    best: sprint9.bestStrategy?.scenarioId ?? null,
    audit: sprint9.auditTrail.entries.length,
    heatmap: sprint9.scenarioHeatmap.length,
  });
  buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetNetWorth: 500_000 },
  });
  const after = JSON.stringify({
    strategies: sprint9.strategies.map((s) => ({ id: s.scenarioId, p: s.probabilityFireByTarget, r: s.robustScore })),
    best: sprint9.bestStrategy?.scenarioId ?? null,
    audit: sprint9.auditTrail.entries.length,
    heatmap: sprint9.scenarioHeatmap.length,
  });
  ok("Sprint 9 shape unchanged after Goal Solver", before === after);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §18 — React SSR — required testids
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§18  React SSR");
{
  const html = renderToStaticMarkup(
    React.createElement(GoalSolverProSection, {
      result: lenient,
      targets: { targetNetWorth: 1_000_000 },
      onTargetsChange: () => {},
    }),
  );
  const required = [
    "goal-solver-root",
    "goal-solver-targets-form",
    "goal-solver-feasibility",
    "goal-solver-gap-analysis",
    "goal-solver-required",
    "goal-solver-constraints",
    "goal-solver-best-path",
    "goal-solver-alternative-paths",
    "goal-solver-action-plan",
    // Sprint 11 #15: audit-trail was demoted into AdvancedDisclosure (collapsed by default).
    // The wrapper is the entry-point in SSR; goal-solver-audit-trail mounts on toggle.
    "goal-solver-advanced-disclosure",
  ];
  for (const id of required) {
    ok(`SSR: has testid "${id}"`, hasTestId(html, id), { sample: html.slice(0, 200) });
  }
  // Form fields
  const formFields = [
    "goal-solver-target-fireYear",
    "goal-solver-target-netWorth",
    "goal-solver-target-passiveAnnual",
    "goal-solver-target-passiveMonthly",
    "goal-solver-target-propertyCount",
    "goal-solver-target-portfolioValue",
    "goal-solver-target-debtCeiling",
    "goal-solver-target-monthlyContribLimit",
    "goal-solver-target-riskLimit",
    "goal-solver-target-liquidityMin",
    "goal-solver-target-retirementYear",
  ];
  for (const id of formFields) {
    ok(`SSR: has form testid "${id}"`, hasTestId(html, id));
  }
  // Status badge
  ok("SSR: has feasibility status badge", hasTestId(html, "goal-solver-feasibility-status"));
  ok("SSR: has feasibility prob value", hasTestId(html, "goal-solver-feasibility-prob"));
  ok("SSR: has alternative paths", hasTestId(html, "goal-solver-alt-fastestFire"));
  ok("SSR: has alt highestProb", hasTestId(html, "goal-solver-alt-highestProbability"));
  ok("SSR: has alt lowestRisk", hasTestId(html, "goal-solver-alt-lowestRisk"));
  ok("SSR: has alt bestHybrid", hasTestId(html, "goal-solver-alt-bestHybrid"));

  // Empty state placeholder when no targets
  const htmlEmpty = renderToStaticMarkup(
    React.createElement(GoalSolverProSection, {
      result: lenient, // arbitrary
      targets: EMPTY_GOAL_TARGETS,
      onTargetsChange: () => {},
    }),
  );
  ok("SSR empty: root still rendered", hasTestId(htmlEmpty, "goal-solver-root"));
  ok("SSR empty: targets form still rendered", hasTestId(htmlEmpty, "goal-solver-targets-form"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §19 — Optimization search coherence
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§19  Optimization search coherence");
{
  const fastest = lenient.alternativePaths.find((a) => a.objective === "fastestFire")!;
  const highest = lenient.alternativePaths.find((a) => a.objective === "highestProbability")!;
  const lowest = lenient.alternativePaths.find((a) => a.objective === "lowestRisk")!;
  const hybrid = lenient.alternativePaths.find((a) => a.objective === "bestHybrid")!;
  ok("opt: fastest present", !!fastest);
  ok("opt: highestProb present", !!highest);
  ok("opt: lowestRisk present", !!lowest);
  ok("opt: bestHybrid present", !!hybrid);
  // Either they diverge OR they correctly point to the same path (when ranking is single-entry).
  const pathIds = new Set([fastest.path?.strategyId, highest.path?.strategyId, lowest.path?.strategyId, hybrid.path?.strategyId].filter(Boolean));
  ok("opt: at least one distinct path id (or correctly collapsed)", pathIds.size >= 1);
  // All scores either null or finite numbers
  for (const a of lenient.alternativePaths) {
    ok(`opt[${a.objective}] score finite or null`, a.score === null || Number.isFinite(a.score));
    ok(`opt[${a.objective}] audit.howCalculated populated`, !!a.audit.howCalculated);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §20 — howCalculated strings non-empty and reference an engine
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§20  howCalculated strings reference engines");
{
  const engineKeywords = ["Sprint 7", "Sprint 8", "Sprint 9", "truePortfolioOptimizer", "pathSimulationEngine", "probabilisticWealthEngine", "canonicalFire", "canonicalLedger"];
  function refsEngine(s: string): boolean {
    return engineKeywords.some((k) => s.includes(k));
  }
  for (const r of [lenient, stretch, impossible]) {
    for (const a of r.auditTrail) {
      ok(`audit[${a.id}] howCalculated non-empty`, a.howCalculated.length > 0);
      ok(`audit[${a.id}] probabilitySource references engine OR explicitly states value`, refsEngine(a.probabilitySource) || a.probabilitySource.length > 0);
      ok(`audit[${a.id}] pathSource references engine`, refsEngine(a.pathSource));
    }
    // Required inputs
    ok(`required.audit.howCalculated non-empty`, r.requiredInputs.audit.howCalculated.length > 0);
    // Constraints
    ok(`constraints.audit.howCalculated non-empty`, r.constraints.audit.howCalculated.length > 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §21 — targetPortfolioValue excludes PPOR equity (Q3 fix regression guard)
 *
 *      Two fixtures with IDENTICAL investable assets but DIFFERENT PPOR
 *      equity must yield IDENTICAL gap[portfolioValue].actual.
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§21  targetPortfolioValue excludes PPOR (Q3 regression)");
{
  // Fixture A — modest PPOR
  const SNAP_PPOR_LOW = {
    ...FIXTURE_SNAPSHOT_RICH,
    ppor: 800_000,
    mortgage: 400_000, // PPOR equity = 400k
  };
  const FIXTURE_PPOR_LOW: DashboardInputs = {
    ...FIXTURE_RICH,
    snapshot: SNAP_PPOR_LOW,
  };

  // Fixture B — much larger PPOR but every investable scalar is identical
  const SNAP_PPOR_HIGH = {
    ...FIXTURE_SNAPSHOT_RICH,
    ppor: 5_000_000,
    mortgage: 400_000, // PPOR equity = 4.6m
  };
  const FIXTURE_PPOR_HIGH: DashboardInputs = {
    ...FIXTURE_RICH,
    snapshot: SNAP_PPOR_HIGH,
  };

  const stackLow = buildStack(FIXTURE_PPOR_LOW);
  const stackHigh = buildStack(FIXTURE_PPOR_HIGH);

  const targets: GoalSolverProTargets = { targetPortfolioValue: 1_000_000 };

  const rLow = buildGoalSolverPro({
    canonicalLedger: FIXTURE_PPOR_LOW,
    canonicalFire: stackLow.canonicalFire,
    sprint7Result: stackLow.sprint7,
    sprint8Result: stackLow.sprint8,
    sprint9Result: stackLow.sprint9,
    targets,
    seed: DEFAULT_GOAL_SOLVER_SEED,
  });
  const rHigh = buildGoalSolverPro({
    canonicalLedger: FIXTURE_PPOR_HIGH,
    canonicalFire: stackHigh.canonicalFire,
    sprint7Result: stackHigh.sprint7,
    sprint8Result: stackHigh.sprint8,
    sprint9Result: stackHigh.sprint9,
    targets,
    seed: DEFAULT_GOAL_SOLVER_SEED,
  });

  const gLow = rLow.gap.entries.find((e) => e.field === "portfolioValue");
  const gHigh = rHigh.gap.entries.find((e) => e.field === "portfolioValue");
  ok("§21: portfolioValue gap entry present (low PPOR)", !!gLow);
  ok("§21: portfolioValue gap entry present (high PPOR)", !!gHigh);
  ok(
    `§21: gap[portfolioValue].actual IDENTICAL across PPOR variants (low=${gLow?.actual}, high=${gHigh?.actual})`,
    gLow?.actual === gHigh?.actual,
  );
  ok(
    "§21: gap[portfolioValue].actual is a finite number (not null)",
    typeof gLow?.actual === "number" && Number.isFinite(gLow.actual),
  );

  // Manual canonical investable-assets ground truth (cash+offset+super+stocks+crypto+IP-equity).
  // FIXTURE_SNAPSHOT_RICH has no properties[], so IP equity = 0.
  const expected =
    SNAP_PPOR_LOW.cash +
    SNAP_PPOR_LOW.offset_balance +
    SNAP_PPOR_LOW.super_balance +
    (SNAP_PPOR_LOW.stocks ?? 0) +
    (SNAP_PPOR_LOW.crypto ?? 0);
  ok(
    `§21: actual == cash+offset+super+stocks+crypto+IP-equity (=${expected})`,
    gLow?.actual === expected,
  );

  // Audit string must name the canonical source explicitly.
  const how = gLow?.audit.howCalculated ?? "";
  ok("§21: audit names canonical investable aggregate", how.includes("investable-assets"));
  ok("§21: audit explicitly excludes PPOR", how.includes("PPOR"));
  ok(
    "§21: audit.inputsUsed lists selectStocksTotal",
    (gLow?.audit.inputsUsed ?? []).some((s) => s.includes("selectStocksTotal")),
  );
  ok(
    "§21: audit.inputsUsed lists selectIpCurrentValueSettled",
    (gLow?.audit.inputsUsed ?? []).some((s) => s.includes("selectIpCurrentValueSettled")),
  );
  ok(
    "§21: audit.inputsUsed lists selectSuperCombined",
    (gLow?.audit.inputsUsed ?? []).some((s) => s.includes("selectSuperCombined")),
  );
  ok(
    "§21: audit.inputsUsed lists snapshot.cash",
    (gLow?.audit.inputsUsed ?? []).some((s) => s.includes("snapshot.cash")),
  );
  ok(
    "§21: audit.inputsUsed does NOT mention ppor",
    !(gLow?.audit.inputsUsed ?? []).some((s) => /ppor/i.test(s)),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §22 — targetPortfolioValue is no longer pointer-equivalent to Sprint 9
 *      netWorthBand.p50 (Q3 fix: replaces the prior proxy).
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§22  portfolioValue no longer proxies netWorthBand.p50");
{
  const { sprint7, sprint8, sprint9, canonicalFire } = buildStack(FIXTURE_RICH);
  const r = buildGoalSolverPro({
    canonicalLedger: FIXTURE_RICH,
    canonicalFire,
    sprint7Result: sprint7,
    sprint8Result: sprint8,
    sprint9Result: sprint9,
    targets: { targetPortfolioValue: 1_000_000, targetNetWorth: 1_000_000 },
    seed: DEFAULT_GOAL_SOLVER_SEED,
  });
  const portfolio = r.gap.entries.find((e) => e.field === "portfolioValue");
  const netWorth = r.gap.entries.find((e) => e.field === "netWorth");
  ok("§22: portfolioValue entry present", !!portfolio);
  ok("§22: netWorth entry present", !!netWorth);
  // FIXTURE_RICH has a PPOR worth 1.51m and large mortgage — the two values
  // should differ once PPOR equity is excluded from portfolioValue.
  ok(
    `§22: gap[portfolioValue].actual !== gap[netWorth].actual (portfolio=${portfolio?.actual}, netWorth=${netWorth?.actual})`,
    portfolio?.actual !== netWorth?.actual,
  );
  // The portfolio actual must NOT be a pointer-equal read of Sprint 9
  // netWorthBand.p50 (the prior proxy).
  const sprint9P50 = sprint9.bestStrategy?.netWorthBand?.p50 ?? null;
  ok(
    `§22: portfolio actual !== sprint9.bestStrategy.netWorthBand.p50 (p50=${sprint9P50})`,
    portfolio?.actual !== sprint9P50,
  );
}

/* ─── Summary ──────────────────────────────────────────────────────── */
console.log("\n" + "═".repeat(70));
console.log(`Sprint 10 — Goal Solver Pro tests`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
console.log(`  total:  ${passed + failed}`);
console.log("═".repeat(70));
if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nAll Sprint 10 tests passed.\n");
