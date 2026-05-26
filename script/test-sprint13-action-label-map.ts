/**
 * test-sprint13-action-label-map.ts
 *
 * Sprint 13 — actionLabelMap rewrites + internal-action filter.
 *
 * Validates:
 *   §1 median_net_worth_checkpoint is classified as internal and filtered
 *   §2 Stock DCA → "Increase stock investing by $X/month" rewrite
 *   §3 Acquire investment property year interpolation
 *   §4 Delay property purchase rewrite preserves year
 *   §5 filterAndRewriteActionPlan drops internal checkpoints
 *   §6 Unknown action types fall back to titleCase of raw string
 *
 * Run: tsx script/test-sprint13-action-label-map.ts
 */

import {
  classifyAction,
  rewriteAction,
  isInternalAction,
  filterAndRewriteActionPlan,
} from "../client/src/lib/actionLabelMap";
import type { ActionPlanEntry } from "../client/src/lib/goalSolverPro";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: unknown) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

console.log("\nSprint 13 — actionLabelMap\n");

/* §1 Internal checkpoint filtering */
{
  const raw = "Median net worth checkpoint: $1,250,000";
  const c = classifyAction(raw);
  ok("§1.a classifies median checkpoint as internal type", c.type === "median_net_worth_checkpoint");
  ok("§1.b extracts amount param", c.params.amount === 1250000);
  ok("§1.c isInternalAction returns true", isInternalAction(raw) === true);
  const rw = rewriteAction(raw);
  ok("§1.d rewriteAction marks internal=true", rw.internal === true);
}

/* §2 Stock DCA rewrite */
{
  const raw = "Set monthly contribution to $4,500/mo";
  const c = classifyAction(raw);
  ok("§2.a classifies as increase_dca", c.type === "increase_dca");
  ok("§2.b extracts amount", c.params.amount === 4500);
  const rw = rewriteAction(raw);
  ok(
    `§2.c rewrites to user-facing label (got: ${rw.label})`,
    rw.label === "Increase stock investing by $4,500/month",
  );
  ok("§2.d internal=false", rw.internal === false);
}

/* §3 Acquire investment property */
{
  const raw = `Acquire investment property #1 (strategy "fastest-fire-balanced")`;
  const c = classifyAction(raw);
  ok("§3.a classifies as buy_ip", c.type === "buy_ip");
  const rw = rewriteAction(raw);
  ok(`§3.b rewrites to 'Buy investment property' (got: ${rw.label})`, rw.label === "Buy investment property");
}

/* §4 Delay property purchase preserves year */
{
  const raw = "Delay investment property purchase to 2029";
  const c = classifyAction(raw);
  ok("§4.a classifies as delay_property_purchase", c.type === "delay_property_purchase");
  ok("§4.b extracts year", c.params.year === 2029);
  const rw = rewriteAction(raw);
  ok(
    `§4.c rewrites with year interpolation (got: ${rw.label})`,
    rw.label === "Delay property purchase to 2029",
  );
}

/* §5 filterAndRewriteActionPlan drops internal entries */
{
  const entries: ActionPlanEntry[] = [
    {
      year: 2026,
      action: "Set monthly contribution to $4,500/mo",
      sourceStrategyId: "s1",
      inputField: "x",
      enginesUsed: [],
      inputsUsed: [],
      auditNote: "audit-1",
    },
    {
      year: 2030,
      action: "Median net worth checkpoint: $1,250,000",
      sourceStrategyId: "s1",
      inputField: "x",
      enginesUsed: [],
      inputsUsed: [],
      auditNote: "audit-2",
    },
    {
      year: 2027,
      action: `Acquire investment property #1 (strategy "balanced")`,
      sourceStrategyId: "s1",
      inputField: "x",
      enginesUsed: [],
      inputsUsed: [],
      auditNote: "audit-3",
    },
    {
      year: 2040,
      action: "Projected FIRE year (median): 2040",
      sourceStrategyId: "s1",
      inputField: "x",
      enginesUsed: [],
      inputsUsed: [],
      auditNote: "audit-4",
    },
  ];
  const result = filterAndRewriteActionPlan(entries);
  ok(`§5.a filters to 2 user-facing entries (got: ${result.length})`, result.length === 2);
  ok(
    "§5.b no entry has an internal-classified action surviving",
    result.every((r) => !r.rewritten.internal),
  );
  ok(
    "§5.c no surviving label contains 'checkpoint'",
    result.every((r) => !/checkpoint/i.test(r.rewritten.label)),
  );
  ok(
    "§5.d no surviving label contains 'Projected FIRE year'",
    result.every((r) => !/Projected FIRE year/i.test(r.rewritten.label)),
  );
  ok(
    "§5.e first surviving entry is the DCA rewrite",
    result[0]?.rewritten.label === "Increase stock investing by $4,500/month",
  );
}

/* §6 Unknown fallback */
{
  const raw = "rebalance_portfolio";
  const c = classifyAction(raw);
  ok("§6.a recognises rebalance_portfolio pattern", c.type === "rebalance_portfolio");
  const rw = rewriteAction(raw);
  ok(`§6.b rewrites to user-facing (got: ${rw.label})`, rw.label === "Rebalance portfolio");

  const raw2 = "tax_optimisation";
  const rw2 = rewriteAction(raw2);
  ok(`§6.c unknown raw is titleCased fallback (got: ${rw2.label})`, rw2.label === "Tax Optimisation");
}

/* Report */
console.log(`\n  PASS ${passed}  FAIL ${failed}`);
if (failed > 0) {
  console.error("\nFailures:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
process.exit(0);
