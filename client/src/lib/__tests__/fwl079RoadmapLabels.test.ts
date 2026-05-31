/**
 * fwl079RoadmapLabels.test.ts — FWL-079 roadmap/timeline label regression guard.
 *
 * Locks down the FWL-079 fix that re-labels `property_deposit_boost` deltas
 * to reflect their actual role inside the winning candidate's event stream.
 *
 * Background: the candidate generator emits `property_deposit_boost` both as
 * the PRIMARY property purchase (the deposit-boost translator doubles as the
 * buy-property emitter — see lib/scenarioV2/deltas.ts:29-31) AND as a
 * genuine deposit top-up inside multi-IP-ladder strategies. The role is
 * encoded in the delta id suffix:
 *
 *   _ip            primary IP purchase (delay-ip / buy-ip-now / hybrid)
 *   _ipfollow     IP after offset buffer (offset_then_ip)
 *   _ipfromequity  IP funded by equity-release refi
 *   _ip2           second IP in multi_ip_ladder
 *   <other>        genuine deposit top-up
 *
 * Before this fix the label-mappers literally translated the delta as
 * "Top up property deposit" / "Deposit boost", losing the semantic. The bug
 * was a label defect, not a wiring defect — all surfaces correctly read the
 * same `recommended.winner` object.
 *
 * Invariants:
 *   1. delay-ip / `_ip` primary purchase 6 months out → Action Roadmap label
 *      reads "Acquire investment property in 6 months".
 *   2. buy-ip-now / `_ip` primary purchase this month → "Acquire investment
 *      property" (no months phrase).
 *   3. equity_release_ip → equity-funded IP reads "Acquire investment property
 *      (equity-funded)"; the refinance milestone keeps "Refinance mortgage".
 *   4. multi_ip_ladder `_ip2` second IP → "Acquire second investment property
 *      (equity-funded)".
 *   5. Year-by-year roadmap milestone for primary IP reads
 *      "Buy investment property — $<purchasePrice>" (not "Deposit boost").
 *   6. Next-actions builder maps the new label to the three verb-led prep
 *      actions ("Speak with mortgage broker", "Validate borrowing capacity",
 *      "Build deposit structure") — i.e. the fallback "Review milestone: ..."
 *      is NOT used for primary IP purchases.
 *
 * Pure unit tests — no engine math, no schema or UI changes.
 */

import { buildActionRoadmap } from "../actionRoadmap/actionRoadmapBuilder";
import { selectYearByYearRoadmap } from "../actionRoadmap/yearByYearRoadmap";
import { buildNextActions } from "../actionRoadmap/nextActionsBuilder";
import type { ScenarioDelta } from "../scenarioV2/types";
import type { GoalLabRankedScenario } from "../goalLab/orchestrator";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

console.log("\nfwl079RoadmapLabels — roadmap/timeline label regression guard");

// ─── Fixture helpers ───────────────────────────────────────────────────────

const NOW = new Date("2026-05-01T00:00:00Z"); // matches todayKey "2026-05"

function makeBoostDelta(opts: {
  id: string;
  activationMonth: string;
  purchasePrice?: number;
  extraDeposit?: number;
}): ScenarioDelta {
  return {
    id: opts.id,
    scenarioId: "test",
    deltaType: "property_deposit_boost",
    activationMonth: opts.activationMonth as ScenarioDelta["activationMonth"],
    params: {
      extraDeposit: opts.extraDeposit ?? 290_472,
      purchasePrice: opts.purchasePrice ?? 1_161_888,
      weeklyRent: 700,
      rate: 0.065,
      loanTermYears: 30,
      vacancyRate: 0.04,
      managementFee: 0.08,
    },
    priority: 600,
    idempotencyKey: `${opts.id}/key`,
  };
}

function makeRefinanceDelta(opts: {
  id: string;
  activationMonth: string;
  cashOut?: number;
}): ScenarioDelta {
  return {
    id: opts.id,
    scenarioId: "test",
    deltaType: "refinance",
    activationMonth: opts.activationMonth as ScenarioDelta["activationMonth"],
    params: {
      cashOut: opts.cashOut ?? 150_000,
    },
    priority: 590,
    idempotencyKey: `${opts.id}/key`,
  };
}

function makeScenario(
  templateId: string,
  candidateId: string,
  events: ScenarioDelta[],
): GoalLabRankedScenario {
  // The builders under test only read `templateId`, `winner.id` and
  // `winner.events`. Cast the partial fixture through `unknown` so we
  // don't have to populate ExtendedScenarioResult / CompositeScore /
  // ExplainabilityTrace just to assert label outputs.
  return {
    templateId,
    templateLabel: templateId,
    promise: "test",
    winner: {
      id: candidateId,
      label: candidateId,
      shortLabel: candidateId,
      events,
      headline: "",
      rationale: [],
      softWarnings: [],
      isHighRisk: false,
    } as unknown as GoalLabRankedScenario["winner"],
    alternates: [],
    probabilityP50: null,
    scoreP50: null,
    winnerSelectedByIntentFilter: true,
    engineTopWinner: null,
    eventSignature: "test-sig",
  } as unknown as GoalLabRankedScenario;
}

// ─── Invariant 1: delay-ip — primary purchase 6 months out ─────────────────
{
  const delta = makeBoostDelta({
    id: "delay-ip_ip",
    activationMonth: "2026-11",                  // 6 months past "2026-05"
  });
  const scenario = makeScenario("delay-ip", "delay-ip", [delta]);
  const roadmap = buildActionRoadmap(scenario, null, null, NOW);

  const ms = roadmap?.milestones[0];
  check(
    `delay-ip primary IP (6mo): label is "Acquire investment property in 6 months"`,
    ms?.label === "Acquire investment property in 6 months",
    `got "${ms?.label}"`,
  );
  check(
    `delay-ip primary IP: effect mentions purchase price`,
    typeof ms?.effect === "string" && /\$1,161,888/.test(ms!.effect),
    `got "${ms?.effect}"`,
  );
}

// ─── Invariant 2: buy-ip-now — primary purchase this month ─────────────────
{
  const delta = makeBoostDelta({
    id: "buy-ip-now_ip",
    activationMonth: "2026-05",                  // same as todayKey → 0 months
  });
  const scenario = makeScenario("buy-ip-now", "buy-ip-now", [delta]);
  const roadmap = buildActionRoadmap(scenario, null, null, NOW);
  const ms = roadmap?.milestones[0];
  check(
    `buy-ip-now primary IP (0mo): label is "Acquire investment property"`,
    ms?.label === "Acquire investment property",
    `got "${ms?.label}"`,
  );
}

// ─── Invariant 3: equity_release_ip — refinance + equity-funded IP ─────────
{
  const refi = makeRefinanceDelta({
    id: "equity_release_ip_refi",
    activationMonth: "2026-08",
  });
  const ip = makeBoostDelta({
    id: "equity_release_ip_ipfromequity",
    activationMonth: "2026-09",
  });
  const scenario = makeScenario(
    "equity_release_ip",
    "equity_release_ip",
    [refi, ip],
  );
  const roadmap = buildActionRoadmap(scenario, null, null, NOW);

  const refiMs = roadmap?.milestones.find((m) => m.id === "equity_release_ip_refi");
  const ipMs = roadmap?.milestones.find((m) => m.id === "equity_release_ip_ipfromequity");

  check(
    `equity_release_ip: refinance milestone keeps "Refinance mortgage"`,
    refiMs?.label === "Refinance mortgage",
    `got "${refiMs?.label}"`,
  );
  check(
    `equity_release_ip: IP milestone is "Acquire investment property (equity-funded)"`,
    ipMs?.label === "Acquire investment property (equity-funded)",
    `got "${ipMs?.label}"`,
  );
}

// ─── Invariant 4: multi_ip_ladder — _ip2 second IP ─────────────────────────
{
  const ip1 = makeBoostDelta({
    id: "multi_ip_ladder_ip",
    activationMonth: "2026-11",
  });
  const ip2 = makeBoostDelta({
    id: "multi_ip_ladder_ip2",
    activationMonth: "2029-11",
    purchasePrice: 1_300_000,
    extraDeposit: 325_000,
  });
  const scenario = makeScenario(
    "multi_ip_ladder",
    "multi_ip_ladder",
    [ip1, ip2],
  );
  const roadmap = buildActionRoadmap(scenario, null, null, NOW);

  const ms2 = roadmap?.milestones.find((m) => m.id === "multi_ip_ladder_ip2");
  check(
    `multi_ip_ladder _ip2: label is "Acquire second investment property (equity-funded)"`,
    ms2?.label === "Acquire second investment property (equity-funded)",
    `got "${ms2?.label}"`,
  );
}

// ─── Invariant 5: year-by-year roadmap for primary IP ──────────────────────
{
  const delta = makeBoostDelta({
    id: "delay-ip_ip",
    activationMonth: "2026-11",
  });
  // selectYearByYearRoadmap requires a non-empty fan series. Provide a
  // single-point fan inside the 7-year window so the function actually
  // walks events instead of short-circuiting on the empty-fan branch.
  const fan = [
    { month: "2026-05", p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 },
    { month: "2026-11", p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 },
  ];
  const out = selectYearByYearRoadmap({
    events: [delta],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fan: fan as any,
    startMonth: "2026-05" as ScenarioDelta["activationMonth"],
    fireNumber: null,
    swrPct: null,
    targetPassiveMonthly: null,
    now: NOW,
  });

  const year2026 = out.years.find((y) => y.year === 2026);
  const cardMilestone = year2026?.milestones.find(
    (m) => m.sourceDeltaId === "delay-ip_ip",
  );
  check(
    `year-by-year: delay-ip primary IP card label is "Buy investment property — $1,161,888"`,
    cardMilestone?.label === "Buy investment property — $1,161,888",
    `got "${cardMilestone?.label}"`,
  );
  check(
    `year-by-year: category is "acquisition" for primary IP (not "debt")`,
    cardMilestone?.category === "acquisition",
    `got "${cardMilestone?.category}"`,
  );
}

// ─── Invariant 6: next-actions builder ─────────────────────────────────────
{
  const delta = makeBoostDelta({
    id: "delay-ip_ip",
    activationMonth: "2026-11",
  });
  const scenario = makeScenario("delay-ip", "delay-ip", [delta]);
  const roadmap = buildActionRoadmap(scenario, null, null, NOW)!;
  const buckets = buildNextActions({
    milestones: roadmap.milestones,
    today: NOW,
  });
  const all = [
    ...buckets.next30Days,
    ...buckets.next90Days,
    ...buckets.next12Months,
  ];
  const titles = all.map((a) => a.title);

  check(
    `next-actions: includes "Speak with mortgage broker"`,
    titles.includes("Speak with mortgage broker"),
    `got titles=${JSON.stringify(titles)}`,
  );
  check(
    `next-actions: includes "Validate borrowing capacity"`,
    titles.includes("Validate borrowing capacity"),
    `got titles=${JSON.stringify(titles)}`,
  );
  check(
    `next-actions: includes "Build deposit structure"`,
    titles.includes("Build deposit structure"),
    `got titles=${JSON.stringify(titles)}`,
  );
  check(
    `next-actions: does NOT fall back to "Review milestone: ..." for primary IP`,
    !titles.some((t) => /^Review milestone:/.test(t)),
    `got titles=${JSON.stringify(titles)}`,
  );
}

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
