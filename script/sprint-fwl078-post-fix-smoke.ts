/**
 * Sprint FWL-078 Phase A — Post-fix Production Smoke
 *
 * Reproduces the runtime wiring of /action-roadmap (page) end-to-end:
 *   1. Pull canonical ledger from Supabase (shahrokh-family-main)
 *   2. Build canonical goal profile (override = auto)
 *   3. Run runGoalLabPlan
 *   4. Use plan.picks.recommended as the canonical "recommended scenario"
 *   5. Build the four Roadmap/Timeline/Actions selectors that the page uses
 *
 * Reports all 6 acceptance metrics for Phase A:
 *   1. recommended template (templateId + templateLabel)
 *   2. winner candidate (id, score, P50, alignment flag)
 *   3. winner events (full dump)
 *   4. Roadmap item count        ← buildActionRoadmap → milestones.length
 *   5. Timeline item count       ← selectYearByYearRoadmap → years × milestones, plus selectEngineEventLanes lane count
 *   6. Actions item count        ← buildNextActions → next30Days + next90Days + next12Months
 *
 * READ-ONLY: no Supabase writes, no adapter publication.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import { selectCanonicalFire } from "../client/src/lib/canonicalFire";
import { buildActionRoadmap } from "../client/src/lib/actionRoadmap/actionRoadmapBuilder";
import { selectYearByYearRoadmap } from "../client/src/lib/actionRoadmap/yearByYearRoadmap";
import { selectEngineEventLanes } from "../client/src/lib/actionRoadmap/engineEventLanes";
import { buildNextActions } from "../client/src/lib/actionRoadmap/nextActionsBuilder";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { GoalProfileOverrides } from "../client/src/lib/goalLab/goalProfileStore";
import type { FanPoint } from "../client/src/lib/forecastEngine/types";

const SUPABASE_URL = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

const buf: string[] = [];
const log = (s = "") => { console.log(s); buf.push(s); };
const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

async function fetchAll<T = any>(sb: any, table: string): Promise<T[]> {
  const out: T[] = []; let from = 0; const ps = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select("*").range(from, from + ps - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < ps) break;
    from += ps;
  }
  return out;
}

function describeEvent(d: any, i: number): string {
  const date = d.activationMonth ?? d.startDate ?? d.date ?? "?";
  const kind = String(d.deltaType ?? d.kind ?? d.type ?? "?").padEnd(28);
  const id = String(d.id ?? d.idempotencyKey ?? "?").padEnd(36);
  const p = d.params ?? {};
  const bits: string[] = [];
  if (p.purchasePrice)    bits.push(`price=${fmt(Number(p.purchasePrice))}`);
  if (p.extraDeposit)     bits.push(`deposit=${fmt(Number(p.extraDeposit))}`);
  if (p.amount)           bits.push(`amount=${fmt(Number(p.amount))}`);
  if (p.cashOut)          bits.push(`cashOut=${fmt(Number(p.cashOut))}`);
  if (p.newRate)          bits.push(`rate=${(Number(p.newRate) * 100).toFixed(2)}%`);
  if (p.targetAsset)      bits.push(`target=${p.targetAsset}`);
  if (p.targetPropertyId) bits.push(`propId=${p.targetPropertyId}`);
  const extras = bits.length ? "  " + bits.join("  ") : "";
  return `  ${String(i + 1).padStart(2)}. [${date}]  ${kind}  ${id}${extras}`;
}

(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const [snap, fireRow, props, exp, inc] = await Promise.all([
    sb.from("sf_snapshot").select("*").maybeSingle(),
    sb.from("mc_fire_settings").select("*").maybeSingle(),
    fetchAll(sb, "sf_properties"),
    fetchAll(sb, "sf_expenses"),
    fetchAll(sb, "sf_income"),
  ]);

  const inputs: DashboardInputs = {
    snapshot: snap.data,
    properties: props,
    stocks: [], cryptos: [], holdingsRaw: [],
    incomeRecords: inc, expenses: exp,
    mcFireSettings: fireRow.data,
    todayIso: new Date().toISOString().split("T")[0],
  } as any;

  const fireNorm = normalizeFireSettingsRow(fireRow.data ?? {});

  log("═".repeat(100));
  log("  FWL-078 PHASE A — POST-FIX PRODUCTION SMOKE");
  log("═".repeat(100));
  log(`  Household:  shahrokh-family-main`);
  log(`  Generated:  ${new Date().toISOString()}`);
  log(`  Branch:     fix/fwl078-phase-a-intent-filter-drop  (working tree, pre-commit)`);
  log(`  Fix under test:  orchestrator.ts — drop scenario when intent blueprints are hard-blocked`);
  log();

  /* ── Build profile + run engine ───────────────────────────────────────── */
  const AUTO: GoalProfileOverrides = {
    preferredEngine:    "auto",
    riskTolerance:      "auto",
    constraintOverride: "auto",
  };
  const profile = buildCanonicalGoalProfile(fireNorm, inputs, AUTO);

  const plan = await runGoalLabPlan({
    ledger: inputs,
    profile,
    horizonYears:    25,
    simulationCount: 200,
    publishToAdapter: false,
  });

  /* ── Page-equivalent inputs ───────────────────────────────────────────── */
  const goal: any = undefined; // selectCanonicalFire handles undefined goal
  const fire = selectCanonicalFire(inputs, goal);
  const fireNumber = fire?.fireNumber ?? null;
  const swrPct = fire?.swrPct ?? null;
  const targetPassiveMonthly = fire?.targetMonthlyIncome ?? null;
  const currentAge = Number.isFinite(Number(fireRow.data?.current_age)) && Number(fireRow.data?.current_age) > 0
    ? Number(fireRow.data?.current_age)
    : null;
  const targetFireAge: number | null = (profile.fire?.targetFireAge ?? null) as number | null;

  const recommended = plan.picks?.recommended ?? null;

  /* ── METRIC 1: recommended template ───────────────────────────────────── */
  log("─".repeat(100));
  log("  METRIC 1 — RECOMMENDED TEMPLATE");
  log("─".repeat(100));
  if (!recommended) {
    log("  (no recommended scenario)");
  } else {
    log(`  templateId         "${recommended.templateId}"`);
    log(`  templateLabel      "${recommended.templateLabel}"`);
    log(`  promise            "${(recommended as any).promise ?? ""}"`);
    log(`  scoreP50           ${recommended.scoreP50?.toFixed(2) ?? "?"}`);
    log(`  probabilityP50     ${recommended.probabilityP50 != null ? (recommended.probabilityP50 * 100).toFixed(1) + "%" : "—"}`);
    log(`  rationale          ${(plan.picks as any)?.recommendedRationale ?? "(none)"}`);
  }
  log();

  // Top 12 ranked summary, with alignment flag visible for every survivor
  log(`  All ranked scenarios (${plan.rankedScenarios?.length ?? 0}):`);
  (plan.rankedScenarios ?? []).forEach((r: any, i: number) => {
    const aligned = (r as any).winnerSelectedByIntentFilter;
    const tag = aligned === true ? "ALIGN✓" : aligned === false ? "ALIGN✗" : "n/a";
    log(`    ${String(i + 1).padStart(2)}. ${(r.templateId as string).padEnd(28)} score=${(r.scoreP50 ?? 0).toFixed(2).padStart(6)}  winner=${(r.winner?.id ?? "?").padEnd(30)}  [${tag}]`);
  });
  log();

  /* ── METRIC 2: winner candidate ───────────────────────────────────────── */
  log("─".repeat(100));
  log("  METRIC 2 — WINNER CANDIDATE (of recommended template)");
  log("─".repeat(100));
  const winner = recommended?.winner ?? null;
  if (!winner) {
    log("  (no winner candidate on recommended scenario)");
  } else {
    log(`  winner.id                              "${winner.id}"`);
    log(`  winner.score                           ${(winner as any).score?.score?.toFixed?.(2) ?? "?"}`);
    log(`  winner P50                             ${winner.probabilityP50 != null ? (winner.probabilityP50 * 100).toFixed(1) + "%" : "—"}`);
    log(`  winnerSelectedByIntentFilter           ${(recommended as any).winnerSelectedByIntentFilter}`);
    log(`  recommended.templateId === winner-aligned for intent?   ` +
        `${(recommended as any).winnerSelectedByIntentFilter === true ? "✓ YES" : "✗ NO"}`);
  }
  log();

  /* ── METRIC 3: winner events (full dump) ──────────────────────────────── */
  log("─".repeat(100));
  log("  METRIC 3 — WINNER EVENTS (full dump)");
  log("─".repeat(100));
  const winnerEvents = (winner?.events ?? []) as any[];
  log(`  Total events on winner: ${winnerEvents.length}`);
  log();
  if (winnerEvents.length === 0) {
    log("  (no events scheduled on winner)");
  } else {
    log("  Index  Activation  DeltaType                       Id");
    log("  ─────  ──────────  ──────────────────────────────  ────────────────────────────────────");
    winnerEvents.forEach((d, i) => log(describeEvent(d, i)));
  }
  log();

  // Also dump engine events (scenarioEvent shape, distinct from deltas) for lane builder
  const engineEvents = (winner?.result?.events ?? []) as any[];
  log(`  Engine events (winner.result.events used by selectEngineEventLanes): ${engineEvents.length}`);
  if (engineEvents.length > 0) {
    engineEvents.forEach((e, i) => {
      const t = String((e as any).type ?? "?").padEnd(28);
      const m = (e as any).activationMonth ?? (e as any).startDate ?? "?";
      log(`    ${String(i + 1).padStart(2)}. [${m}]  ${t}  id=${(e as any).id ?? "?"}`);
    });
  }
  log();

  /* ── Build selector inputs (mirror /action-roadmap page exactly) ──────── */
  const fan: FanPoint[] = ((winner?.result as any)?.netWorthFan as FanPoint[] | undefined) ?? [];
  const finalState = ((winner?.result as any)?.medianFinalState as { cash?: number | null } | undefined) ?? null;
  const startMonth = fan[0]?.month ?? new Date().toISOString().slice(0, 7);

  /* ── METRIC 4: Roadmap item count ─────────────────────────────────────── */
  log("─".repeat(100));
  log("  METRIC 4 — ROADMAP ITEM COUNT  (buildActionRoadmap → milestones)");
  log("─".repeat(100));
  const roadmap = recommended
    ? buildActionRoadmap(recommended, { targetFireAge }, currentAge)
    : null;
  const roadmapCount = roadmap?.milestones?.length ?? 0;
  log(`  buildActionRoadmap(recommended, { targetFireAge: ${targetFireAge} }, currentAge=${currentAge})`);
  log(`  → roadmap.milestones.length = ${roadmapCount}`);
  if (roadmap && roadmap.milestones.length > 0) {
    roadmap.milestones.forEach((m, i) => {
      log(`    ${String(i + 1).padStart(2)}. [${m.month ?? "—"}]  status=${m.status.padEnd(10)}  ${m.label}`);
    });
  }
  log();

  /* ── METRIC 5: Timeline item count ────────────────────────────────────── */
  log("─".repeat(100));
  log("  METRIC 5 — TIMELINE ITEM COUNT  (selectYearByYearRoadmap + selectEngineEventLanes)");
  log("─".repeat(100));
  const yearByYear = selectYearByYearRoadmap({
    events: (winner?.events ?? []) as any,
    fan,
    startMonth,
    fireNumber,
    swrPct,
    targetPassiveMonthly,
    now: new Date(),
  });
  const yearCardCount = yearByYear.years.length;
  const yearMilestoneCount = yearByYear.years.reduce((s, y) => s + (y.milestones?.length ?? 0), 0);
  log(`  selectYearByYearRoadmap(...) → years=${yearCardCount}, total milestones inside year-cards=${yearMilestoneCount}`);
  if (yearByYear.reason) log(`  reason: ${yearByYear.reason}`);
  yearByYear.years.forEach((y, i) => {
    log(`    Year ${String(i + 1).padStart(2)}  year=${y.year}  milestones=${y.milestones?.length ?? 0}`);
    (y.milestones ?? []).forEach((m: any, j: number) => {
      log(`        ${j + 1}. ${String(m.category ?? "?").padEnd(16)}  ${m.label ?? ""}`);
    });
  });
  log();

  const lanes = selectEngineEventLanes({
    events: engineEvents as any,
    fan,
    startMonth,
    fireNumber,
    swrPct,
    medianFinalState: finalState ?? undefined,
  });
  log(`  selectEngineEventLanes(...) → laneEvents=${lanes.length}  (Gantt rows on Timeline tab)`);
  lanes.forEach((e, i) => log(`    ${String(i + 1).padStart(2)}. lane=${String(e.lane ?? "?").padEnd(18)}  ${e.label ?? ""}`));
  log();

  /* ── METRIC 6: Actions item count ─────────────────────────────────────── */
  log("─".repeat(100));
  log("  METRIC 6 — ACTIONS ITEM COUNT  (buildNextActions → next30 + next90 + next12mo)");
  log("─".repeat(100));
  const nextActions = buildNextActions({
    milestones: roadmap?.milestones ?? [],
    today: new Date(),
  });
  const n30 = nextActions.next30Days.length;
  const n90 = nextActions.next90Days.length;
  const n12 = nextActions.next12Months.length;
  const total = n30 + n90 + n12;
  log(`  next30Days:    ${n30}`);
  log(`  next90Days:    ${n90}`);
  log(`  next12Months:  ${n12}`);
  log(`  ─ total actions ─ ${total}`);
  log();
  if (n30 + n90 + n12 > 0) {
    log("  Detail:");
    nextActions.next30Days.forEach((a, i) => log(`    [30d] ${i + 1}. ${a.title}  (due ${a.due})`));
    nextActions.next90Days.forEach((a, i) => log(`    [90d] ${i + 1}. ${a.title}  (due ${a.due})`));
    nextActions.next12Months.forEach((a, i) => log(`    [12m] ${i + 1}. ${a.title}  (due ${a.due})`));
  }
  log();

  /* ── Phase A SUMMARY ──────────────────────────────────────────────────── */
  log("═".repeat(100));
  log("  PHASE A SUMMARY — 6 acceptance metrics");
  log("═".repeat(100));
  log(`  1. Recommended template ........ "${recommended?.templateId ?? "—"}"`);
  log(`  2. Winner candidate ............ "${winner?.id ?? "—"}"   [aligned=${(recommended as any)?.winnerSelectedByIntentFilter}]`);
  log(`  3. Winner events ............... ${winnerEvents.length}`);
  log(`  4. Roadmap item count .......... ${roadmapCount}`);
  log(`  5. Timeline item count ......... ${yearCardCount} year-cards (${yearMilestoneCount} embedded milestones) + ${lanes.length} Gantt lanes`);
  log(`  6. Actions item count .......... ${total}  (30d=${n30}, 90d=${n90}, 12m=${n12})`);
  log();
  log(`  Buy-IP-now in ranked? ${(plan.rankedScenarios ?? []).some((r: any) => r.templateId === "buy-ip-now") ? "YES (regression!)" : "NO ✓ (dropped as expected)"}`);
  log(`  Equity-release-IP in ranked? ${(plan.rankedScenarios ?? []).some((r: any) => r.templateId === "equity-release-ip") ? "YES (regression!)" : "NO ✓ (dropped as expected)"}`);
  log(`  All survivors aligned? ${(plan.rankedScenarios ?? []).every((r: any) => (r as any).winnerSelectedByIntentFilter === true) ? "YES ✓" : "NO ✗"}`);
  log("═".repeat(100));

  const outPath = path.resolve(process.cwd(), "sprint_fwl078_post_fix_smoke.txt");
  fs.writeFileSync(outPath, buf.join("\n") + "\n");
  console.log(`\nWrote ${outPath}`);
})().catch((e) => { console.error(e); process.exit(1); });
