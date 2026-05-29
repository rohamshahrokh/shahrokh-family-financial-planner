/**
 * actionRoadmapBuilder.test.ts — Sprint 27.
 *
 * Honesty + reuse tests for the Action Roadmap builder. The builder must:
 *   1. Return null when there is no scenario / winner (NOT throw).
 *   2. Preserve activation-month order of engine events.
 *   3. Tag the first non-past milestone as "next" and earlier ones as "completed".
 *   4. Append a terminal FIRE milestone ONLY when both currentAge and
 *      goal.targetFireAge are present — never invent a year.
 *   5. Resolve template metadata from the engine templateId.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/actionRoadmapBuilder.test.ts
 */

import type { GoalLabRankedScenario } from "../../goalLab/orchestrator";
import type { ScenarioDelta } from "../../scenarioV2/types";
import { buildActionRoadmap } from "../actionRoadmapBuilder";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-29T00:00:00Z");

function delta(id: string, type: ScenarioDelta["deltaType"], month: string, params: Record<string, unknown> = {}, priority = 400): ScenarioDelta {
  return {
    id, scenarioId: "s1", deltaType: type, activationMonth: month,
    params, priority, idempotencyKey: `${id}-${month}`,
  };
}

function scenarioWith(events: ScenarioDelta[], templateId = "buy-ip-now"): GoalLabRankedScenario {
  return {
    templateId,
    templateLabel: "T",
    promise: "p",
    winner: {
      id: "ip_now",
      label: "Buy IP now",
      shortLabel: "IP",
      events,
      result: {} as never,
      score: {} as never,
      trace: {} as never,
      headline: "h",
      rationale: [],
      softWarnings: [],
      isHighRisk: false,
    } as never,
    alternates: [],
    probabilityP50: null,
    scoreP50: null,
    raw: {} as never,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\nactionRoadmapBuilder — honesty + reuse");

// 1. Null scenario → null roadmap, never throws
check("null scenario → null", buildActionRoadmap(null, { targetFireAge: 60 }, 40, NOW) === null);

// 2. Scenario with null winner → null
const noWinner = { ...scenarioWith([]), winner: null };
check("null winner → null", buildActionRoadmap(noWinner as never, { targetFireAge: 60 }, 40, NOW) === null);

// 3. Events preserved in activation-month order
const events = [
  delta("e2", "etf_dca", "2027-03", { amount: 2000 }),
  delta("e1", "offset_deposit", "2026-09", { amount: 50000 }),
  delta("e3", "buy_property", "2027-11", { purchasePrice: 700000 }),
];
const sc = scenarioWith(events);
const rm = buildActionRoadmap(sc, { targetFireAge: 60 }, 40, NOW);
check("returns roadmap (non-null)", rm !== null);
if (rm) {
  check("milestones sorted by activationMonth", rm.milestones[0].month === "2026-09" && rm.milestones[1].month === "2027-03" && rm.milestones[2].month === "2027-11");

  // 4. First non-past milestone is "next"; later upcoming are "upcoming"
  check("first future milestone is 'next'", rm.milestones[0].status === "next");
  check("second future milestone is 'upcoming'", rm.milestones[1].status === "upcoming");

  // 5. Terminal FIRE milestone present, year = 2026 + (60-40) = 2046
  const term = rm.milestones[rm.milestones.length - 1];
  check("terminal milestone is fire status", term.status === "fire");
  check("terminal fire year = currentYear + (target - currentAge)", term.year === 2046, `got ${term.year}`);

  // 6. hasEngineMilestones true
  check("hasEngineMilestones true with 3 events", rm.hasEngineMilestones === true);

  // 7. Template resolved to PROPERTY_PATH for buy-ip-now
  check("template resolves to PROPERTY_PATH", rm.template.id === "PROPERTY_PATH");

  // 8. Audit trace records eventsConsidered
  check("audit eventsConsidered = 3", rm.audit.eventsConsidered === 3);
}

// 9. Terminal milestone omitted when currentAge is null (honesty)
const rmNoAge = buildActionRoadmap(scenarioWith(events), { targetFireAge: 60 }, null, NOW);
if (rmNoAge) {
  const last = rmNoAge.milestones[rmNoAge.milestones.length - 1];
  check("no FIRE milestone when currentAge null", last.status !== "fire", `last status = ${last.status}`);
}

// 10. Terminal milestone omitted when targetFireAge is null
const rmNoTarget = buildActionRoadmap(scenarioWith(events), { targetFireAge: null }, 40, NOW);
if (rmNoTarget) {
  const last = rmNoTarget.milestones[rmNoTarget.milestones.length - 1];
  check("no FIRE milestone when targetFireAge null", last.status !== "fire", `last status = ${last.status}`);
}

// 11. Past events get "completed" status
const pastEvent = delta("p1", "offset_deposit", "2025-01", { amount: 10000 });
const rmMixed = buildActionRoadmap(scenarioWith([pastEvent, ...events]), { targetFireAge: 60 }, 40, NOW);
if (rmMixed) {
  check("past event → completed", rmMixed.milestones[0].status === "completed");
}

// 12. Unknown engine templateId falls back to CUSTOM_PATH
const rmCustom = buildActionRoadmap(scenarioWith(events, "unknown-template-xyz"), { targetFireAge: 60 }, 40, NOW);
check("unknown templateId → CUSTOM_PATH", rmCustom?.template.id === "CUSTOM_PATH");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
