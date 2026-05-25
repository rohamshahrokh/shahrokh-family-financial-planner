/**
 * Sprint 11 — Decision Engine + Scenario Compare smoke test.
 *
 * Static-string checks across the Sprint 11 #6, #7, #8, #9, #10, #11, #12,
 * #13, #14, #15, #16 surfaces.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${msg}`);
  }
}

/* ─── Decision Engine ─────────────────────────────────────────────────── */

const decisionPage = read("client/src/pages/decision.tsx");
assert(decisionPage.includes("GoalSolverProTab"), "/decision imports GoalSolverProTab");
assert(decisionPage.includes('value="goal-solver"'), "/decision exposes goal-solver tab");
assert(decisionPage.includes('data-testid="decision-tab-goal-solver"'), "/decision goal-solver tab has testid (#12)");
assert(/setTab\([^)]*"goal-solver"/.test(decisionPage), "/decision defaults to goal-solver tab");

const tab = read("client/src/components/decisionEngine/GoalSolverProTab.tsx");
for (const tid of [
  "decision-goal-solver-tab",
  "decision-feasibility-hero",
  "decision-feasibility-status",
  "decision-feasibility-median",
  "decision-feasibility-best",
  "decision-feasibility-worst",
  "decision-required-vs-current",
  "decision-primary-action",
  "decision-primary-action-cta",
]) {
  assert(tab.includes(`data-testid="${tid}"`), `GoalSolverProTab exposes '${tid}'`);
}
assert(tab.includes("buildGoalSolverPro"), "GoalSolverProTab uses goalSolverPro engine (#13)");
assert(tab.includes("BarRow"), "GoalSolverProTab renders Required-vs-Current bars (#14)");
assert(tab.includes("actionPlan[0]"), "GoalSolverProTab promotes first actionPlan entry (#16)");

const goalSection = read("client/src/components/GoalSolverProSection.tsx");
assert(goalSection.includes("<AdvancedDisclosure"), "Goal Solver Pro audit trail demoted into AdvancedDisclosure (#15)");
assert(/auditMode\s*\?\s*\(/.test(goalSection), "Goal Solver Pro sourceStrategyId/inputField gated by audit mode (#15)");

/* ─── Scenario Compare ───────────────────────────────────────────────── */

const appTsx = read("client/src/App.tsx");
assert(
  /\/scenario-compare-workspace[\s\S]*Redirect to="\/scenario-compare-v2"/.test(appTsx),
  "/scenario-compare-workspace redirects to v2 (#10)",
);

const v2 = read("client/src/pages/scenario-compare-v2.tsx");
for (const tid of [
  "scenario-compare-winner-banner",
  "scenario-compare-winner-name",
  "scenario-compare-winner-delta",
  "scenario-compare-tabs",
  "scenario-compare-tab-net-worth",
  "scenario-compare-tab-passive-income",
  "scenario-compare-tab-fire-year",
  "scenario-compare-tab-cashflow",
  "scenario-compare-tab-probability",
  "scenario-compare-delta-table",
]) {
  assert(v2.includes(`data-testid="${tid}"`), `Scenario Compare V2 exposes '${tid}'`);
}
assert(v2.includes("narrative.winnerScenarioId"), "Winner banner pulls from narrative.winnerScenarioId (#9)");

const workspace = read("client/src/components/ScenarioCompareWorkspace.tsx");
assert(
  workspace.includes("Add a baseline snapshot from the Dashboard"),
  "Workspace empty-state uses action-oriented copy (#11)",
);
assert(
  !workspace.includes('data-testid="scenario-compare-workspace-empty-reason"'),
  "Workspace empty-reason monospace string removed (#11)",
);

if (process.exitCode) {
  console.error("Sprint 11 Decision + Scenario Compare smoke test FAILED");
} else {
  console.log("Sprint 11 Decision + Scenario Compare smoke test passed");
}
