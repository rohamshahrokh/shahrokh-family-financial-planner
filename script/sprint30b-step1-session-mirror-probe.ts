/**
 * Sprint 30B — Step 1 Session Mirror Probe (in-process)
 *
 * Verifies the goalLab sessionStorage mirror end-to-end WITHOUT spinning up a
 * browser. We:
 *
 *   1. Stub `globalThis.window.sessionStorage` with a Map-backed shim.
 *   2. Build a representative `GoalLabPlanOutput` that carries a non-empty
 *      `events: ScenarioEvent[]` on the recommended winner's result (we use
 *      the existing `buildEventStore` so the shape is real, not mocked).
 *   3. Call `setLatestGoalLabPlan` indirectly through the only writer
 *      surface available — `__resetGoalLabPlanCacheForTests` + a private
 *      writer simulation via the public `runGoalLabPlan` is not free in this
 *      script (it would require a real ledger). Instead, we mirror what
 *      the writer does by:
 *        a. calling the live `JSON.stringify` against our test plan
 *           and writing to the stub sessionStorage at the same key the
 *           module uses,
 *        b. resetting the module cache with `__resetGoalLabPlanCacheForTests`,
 *        c. calling `readLatestGoalLabPlan()` and asserting rehydration
 *           happens.
 *      This is the exact code path that runs in the browser when a user
 *      hits Cmd+R after Run Plan.
 *   4. Print PASS / FAIL for each assertion.
 *
 * NOTHING in this probe modifies the engine. NOTHING touches financial math.
 *
 * Run:  npx tsx script/sprint30b-step1-session-mirror-probe.ts
 */

// ── Step A — stub a sessionStorage backed by a Map ────────────────────────

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string): void { this.store.set(k, String(v)); }
  removeItem(k: string): void { this.store.delete(k); }
  clear(): void { this.store.clear(); }
  get length(): number { return this.store.size; }
  key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
}

const memSession = new MemoryStorage();
// Install a minimal `window` shim BEFORE importing the orchestrator so its
// `typeof window !== "undefined"` check sees us.
(globalThis as Record<string, unknown>).window = { sessionStorage: memSession };

// ── Step B — now import the module under test ─────────────────────────────

import {
  readLatestGoalLabPlan,
  readLatestGoalLabPlanGeneratedAt,
  clearLatestGoalLabPlan,
  __resetGoalLabPlanCacheForTests,
  type GoalLabPlanOutput,
} from "../client/src/lib/goalLab/orchestrator";
import { buildEventStore } from "../client/src/lib/scenarioV2/events";
import { translateDelta } from "../client/src/lib/scenarioV2/deltas";
import type { ScenarioDelta, ScenarioEvent, BasePlan } from "../client/src/lib/scenarioV2/types";

// ── helpers ────────────────────────────────────────────────────────────────

let _pass = 0;
let _fail = 0;
function assert(cond: boolean, label: string): void {
  if (cond) { console.log(`  [PASS] ${label}`); _pass++; }
  else      { console.log(`  [FAIL] ${label}`); _fail++; }
}
function banner(title: string): void {
  const line = "─".repeat(78);
  console.log("\n" + line);
  console.log("  " + title);
  console.log(line);
}

// ── Step C — build a realistic plan with non-empty events ─────────────────

function buildEventsFromDeltas(): ScenarioEvent[] {
  const month = "2026-06";
  const deltas: ScenarioDelta[] = [
    { id: "d1", deltaType: "etf_dca",                  activationMonth: month, params: { monthlyAmount: 2000, months: 24 }, idempotencyKey: "d1" },
    { id: "d2", deltaType: "buy_property",             activationMonth: "2027-01", params: { purchasePrice: 650_000, state: "QLD" }, idempotencyKey: "d2" },
    { id: "d3", deltaType: "extra_mortgage_repayment", activationMonth: "2026-08", params: { amount: 5000, targetPropertyId: "ppor" }, idempotencyKey: "d3" },
    { id: "d4", deltaType: "refinance",                activationMonth: "2026-10", params: { targetPropertyId: "ppor", newRate: 0.0545, newTermYears: 28 }, idempotencyKey: "d4" },
  ];
  const dummyPlan = { snapshotHash: "probe" } as unknown as BasePlan;
  return buildEventStore(dummyPlan, deltas, { startMonth: "2026-06", endMonth: "2036-06" });
}

function buildTestPlan(events: ScenarioEvent[]): GoalLabPlanOutput {
  // We build a structurally-valid GoalLabPlanOutput shaped like the real
  // pipeline. Fields not relevant to the reload chain are stubbed at the
  // minimum required by the type. We do NOT touch any math, only carry
  // the events array on the recommended winner's result.
  const fakeResult = {
    // ExtendedScenarioResult fields the Action Roadmap touches:
    netWorthFan: [],
    medianFinalState: null,
    events,
    // Everything else may be undefined; the consumer code defensively
    // destructures with `?? null`. We satisfy the structural shape only.
  };
  const fakeWinner = { result: fakeResult, events: [] /* deltas */ };
  const fakeRanked = { winner: fakeWinner, ranked: [fakeWinner] };
  return {
    profile: { resolved: {} } as unknown as GoalLabPlanOutput["profile"],
    rankedScenarios: [fakeRanked as unknown as GoalLabPlanOutput["rankedScenarios"][number]],
    picks: {
      recommended: fakeRanked as unknown as GoalLabPlanOutput["picks"]["recommended"],
      safest: null,
      fastest: null,
      highestProbability: null,
      bestCashflow: null,
      bestHybrid: null,
      recommendedRationale: null,
    },
    generatedAt: new Date().toISOString(),
    enginesUsed: {
      candidateGenerator: "scenarioV2/decisionEngine/candidateGenerator",
      scenarioRunner:    "scenarioV2/runScenarioV2",
      monteCarlo:        "scenarioV2/monteCarlo",
      canonicalAdapter:  "scenarioV2/decisionEngine/canonicalAdapter",
    },
    hasFeasibleScenario: true,
    templatesEvaluatedIds: ["probe"],
    metrics: { totalMs: 0, simulationCount: 500 } as unknown as GoalLabPlanOutput["metrics"],
  } as GoalLabPlanOutput;
}

// ── Step D — simulate "Run Plan" by writing directly to sessionStorage ────
//
// The production code writes to sessionStorage via `setLatestGoalLabPlan`,
// which is NOT exported. We simulate the same operation by writing to the
// SS_KEY directly with the exact JSON shape the writer uses. This is
// fair: the unit under test is the READ path (rehydrate on reload), which
// must work regardless of which writer set the key. After Step 1 ships,
// the production writer will populate the same key.

function simulateRunPlanWriteToStorage(plan: GoalLabPlanOutput): void {
  const SS_KEY = "fwl.goalLab.latestPlan.v1";
  memSession.setItem(SS_KEY, JSON.stringify(plan));
}

function simulatePageReload(): void {
  // Clear the in-memory module variable to mimic a fresh JS context.
  __resetGoalLabPlanCacheForTests();
}

// ── tests ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("");
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log("  Sprint 30B · Step 1 · Session Mirror Probe (in-process)");
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log("  No source files modified by this script. No financial math touched.");
  console.log("  Probe date: " + new Date().toISOString());

  // ── Pre-flight ──────────────────────────────────────────────────────────
  banner("Pre-flight: starting from a clean cache");
  __resetGoalLabPlanCacheForTests();
  memSession.clear();
  assert(readLatestGoalLabPlan() === null, "readLatestGoalLabPlan() === null when nothing was ever written");
  assert(readLatestGoalLabPlanGeneratedAt() === null, "readLatestGoalLabPlanGeneratedAt() === null when no plan");

  // ── Build the test data ─────────────────────────────────────────────────
  const events = buildEventsFromDeltas();
  assert(events.length > 0, `buildEventStore returned non-empty stream (${events.length} events)`);
  const plan = buildTestPlan(events);
  assert(plan.picks.recommended != null, "Test plan has a non-null recommended winner");

  // ── Simulate Run Plan ───────────────────────────────────────────────────
  banner("Simulate /decision-lab Run Plan (writes sessionStorage)");
  simulateRunPlanWriteToStorage(plan);
  const ss = memSession.getItem("fwl.goalLab.latestPlan.v1");
  assert(ss != null && ss.length > 100, `sessionStorage has plan JSON (${ss?.length ?? 0} chars)`);
  assert(ss!.includes('"events":['), "Serialised JSON contains an `events` array");

  // ── Simulate page reload ────────────────────────────────────────────────
  banner("Simulate Cmd+R / full page reload on /action-roadmap");
  simulatePageReload();
  // After reset, the in-memory variable is null. The next readLatestGoalLabPlan()
  // call must transparently rehydrate from sessionStorage.

  const rehydrated = readLatestGoalLabPlan();
  assert(rehydrated != null, "readLatestGoalLabPlan() rehydrated from sessionStorage");
  assert(rehydrated?.picks?.recommended != null, "rehydrated plan has non-null recommended");
  // Cast to access nested events the way action-roadmap.tsx:196 does.
  const rec = rehydrated?.picks?.recommended as unknown as {
    winner?: { result?: { events?: ScenarioEvent[] } };
  } | null;
  const rehydratedEvents = rec?.winner?.result?.events ?? [];
  assert(Array.isArray(rehydratedEvents), "winner.result.events is an array after rehydrate");
  assert(rehydratedEvents.length > 0, `winner.result.events.length > 0 after reload (${rehydratedEvents.length} events)`);
  assert(rehydratedEvents.length === events.length, `event count preserved exactly (${rehydratedEvents.length} === ${events.length})`);

  // Spot-check payload preservation (numbers survive JSON round-trip)
  const firstBuy = rehydratedEvents.find((e) => e.type === "asset.buy_property");
  const firstDca = rehydratedEvents.find((e) => e.type === "contribution.etf_dca");
  if (firstBuy) {
    const p = firstBuy.payload as Record<string, unknown>;
    assert(typeof p.purchasePrice === "number" && p.purchasePrice === 650_000, "asset.buy_property payload.purchasePrice preserved ($650,000)");
  }
  if (firstDca) {
    const p = firstDca.payload as Record<string, unknown>;
    assert(typeof p.amount === "number" && p.amount === 2000, "contribution.etf_dca payload.amount preserved ($2,000)");
  }

  // ── generatedAt round-trips ─────────────────────────────────────────────
  assert(readLatestGoalLabPlanGeneratedAt() === plan.generatedAt, "generatedAt timestamp preserved across reload");

  // ── Idempotent re-read ──────────────────────────────────────────────────
  banner("Subsequent reads return the same plan (no double rehydrate)");
  const second = readLatestGoalLabPlan();
  assert(second === rehydrated, "second read returns the same in-memory object (no JSON re-parse on hot cache)");

  // ── Clear removes from sessionStorage ───────────────────────────────────
  banner("clearLatestGoalLabPlan removes both in-memory and sessionStorage");
  clearLatestGoalLabPlan();
  assert(readLatestGoalLabPlan() === null, "in-memory cache cleared");
  assert(memSession.getItem("fwl.goalLab.latestPlan.v1") === null, "sessionStorage cleared");

  // ── Stale plans (> 24h) are dropped on rehydrate ───────────────────────
  banner("Stale plans are discarded by the age guard");
  __resetGoalLabPlanCacheForTests();
  const stale = buildTestPlan(events);
  stale.generatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
  simulateRunPlanWriteToStorage(stale);
  const staleResult = readLatestGoalLabPlan();
  assert(staleResult === null, "25h-old plan is NOT rehydrated");
  assert(memSession.getItem("fwl.goalLab.latestPlan.v1") === null, "stale plan was removed from sessionStorage");

  // ── Fresh plans (< 24h) ARE rehydrated ──────────────────────────────────
  banner("Plans newer than 24h ARE rehydrated");
  __resetGoalLabPlanCacheForTests();
  const fresh = buildTestPlan(events);
  fresh.generatedAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
  simulateRunPlanWriteToStorage(fresh);
  const freshResult = readLatestGoalLabPlan();
  assert(freshResult != null, "1-min-old plan IS rehydrated");

  // ── SSR-safety: simulate Node without window ───────────────────────────
  banner("SSR-safety: behaviour with no `window`");
  __resetGoalLabPlanCacheForTests();
  const savedWindow = (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).window;
  // With no window, read returns null (no rehydrate possible) AND does not throw.
  let threw = false;
  try { void readLatestGoalLabPlan(); } catch { threw = true; }
  assert(!threw, "readLatestGoalLabPlan does not throw when window is undefined");
  (globalThis as Record<string, unknown>).window = savedWindow;

  // ── Summary ─────────────────────────────────────────────────────────────
  banner("SUMMARY");
  console.log(`  ${_pass} passed · ${_fail} failed`);
  if (_fail > 0) {
    console.log("\n  ❌ FAILURES PRESENT — Step 1 NOT verified.");
    process.exit(1);
  } else {
    console.log("\n  All Step 1 assertions PASS.");
    console.log("  → sessionStorage mirror restores GoalLabPlanOutput across a simulated reload.");
    console.log("  → recommended.winner.result.events survives the round-trip intact.");
    console.log("  → No financial math was touched.");
  }
}

main();
