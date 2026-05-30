/**
 * Sprint 30B — Step 3 Differentiation Probe (READ-ONLY)
 *
 * Purpose: prove (or disprove) that the 7 candidate paths surfaced by
 * `runGoalLabPlan` actually produce materially different financial forecasts.
 *
 * Method:
 *   1. Build the demo-equivalent ledger + canonical goal profile (same
 *      `feasibleLedger` shape the existing goalLabValidation harness uses,
 *      tuned to match the demo persona Alex & Sara Johnson).
 *   2. Invoke `runGoalLabPlan` exactly as the UI does.
 *   3. For every ranked scenario dump:
 *        • Template id + label + investorProfile + riskMode
 *        • Winner blueprint id / label (from RankedCandidate)
 *        • Event stream: deltaType + activationMonth + key params
 *        • netWorthFan endpoints: month 0 / mid / final (p10/p50/p90)
 *        • Score axes (breakdown)
 *        • scoreP50 and probabilityP50
 *   4. Print a comparison table flagging templates whose winner events
 *      OR netWorthFan endpoints are within 1% of each other.
 *
 * No source files are modified. No financial math is changed.
 * Run:  npx tsx script/sprint30b-step3-differentiation-probe.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { GoalProfileOverrides } from "../client/src/lib/goalLab/goalProfileStore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "..", "sprint30b_step3_probe_output.txt");

const buf: string[] = [];
const log = (s: string = ""): void => {
  console.log(s);
  buf.push(s);
};
const banner = (title: string): void => {
  const line = "─".repeat(110);
  log("\n" + line);
  log("  " + title);
  log(line);
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString();
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}
function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

// ─── Demo ledger (Alex & Sara Johnson, Brisbane) ──────────────────────────
// Tuned to match the user's preview state: FIRE age 45, NW ~$2.7M, passive ~$109k.
function demoLedger(): DashboardInputs {
  return {
    snapshot: {
      ppor: 1_510_000,
      cash: 40_000,
      super_balance: 88_000,
      stocks: 25_000,
      crypto: 0,
      cars: 65_000,
      iran_property: 150_000,
      mortgage: 1_200_000,
      other_debts: 19_000,
      roham_monthly_income: 15_466.67,
      fara_monthly_income: 15_166.67,
      monthly_expenses: 15_000,
      rental_income_total: 0,
    },
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: "2026-05-29",
  } as unknown as DashboardInputs;
}

function demoFireRow() {
  return normalizeFireSettingsRow({
    current_age: 38,
    target_fire_age: 45,
    target_passive_monthly: 9_000,
    swr_pct: 4,
    goals_set: true,
  });
}

const AUTO_OVERRIDES: GoalProfileOverrides = {
  preferredEngine:    "auto",
  riskTolerance:      "auto",
  constraintOverride: "auto",
};

// ─── Run ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  banner("Sprint 30B — Step 3 — Scenario Differentiation Probe");

  const ledger  = demoLedger();
  const profile = buildCanonicalGoalProfile(demoFireRow(), ledger, AUTO_OVERRIDES);

  log(`  profile.resolved.preferredEngine = ${profile.resolved.preferredEngine}`);
  log(`  profile.resolved.riskTolerance   = ${profile.resolved.riskTolerance}`);
  log(`  profile.resolved.primaryConstraint = ${profile.resolved.primaryConstraint}`);
  log(`  fire.targetFireAge = ${profile.fire.targetFireAge}`);
  log(`  fire.currentAge    = ${profile.fire.currentAge}`);
  log(`  fire.swrPct        = ${profile.fire.swrPct}`);
  log(`  fire.targetPassiveAnnual = ${profile.fire.targetPassiveAnnual}`);

  log("\n  Running runGoalLabPlan() (publishToAdapter=false, 200 sims)…");
  const t0 = performance.now();
  const plan = await runGoalLabPlan({
    ledger,
    profile,
    horizonYears: 25,
    simulationCount: 200, // smaller for probe; same engine
    publishToAdapter: false,
  });
  const ms = performance.now() - t0;
  log(`  Done in ${Math.round(ms)} ms — ${plan.rankedScenarios.length} ranked scenarios.\n`);

  // ─── per-scenario dump ───────────────────────────────────────────────
  banner("Per-template winner detail");

  type Row = {
    tid: string;
    label: string;
    winnerId: string;
    eventCount: number;
    eventTypes: string;
    scoreP50: number | null;
    fanFirstP50: number | null;
    fanMidP50: number | null;
    fanFinalP50: number | null;
    fanFinalP10: number | null;
    fanFinalP90: number | null;
    survivalProb: number | null;
    probabilityP50: number | null;
  };
  const rows: Row[] = [];

  for (const s of plan.rankedScenarios) {
    log("─".repeat(110));
    log(`  Template:  ${s.templateId}  —  "${s.templateLabel}"`);
    log(`  Promise:   ${s.promise}`);
    if (!s.winner) {
      log(`  Winner:    (none — engine returned no ranked candidates)`);
      rows.push({
        tid: s.templateId, label: s.templateLabel, winnerId: "—",
        eventCount: 0, eventTypes: "—",
        scoreP50: null, fanFirstP50: null, fanMidP50: null,
        fanFinalP50: null, fanFinalP10: null, fanFinalP90: null,
        survivalProb: null, probabilityP50: null,
      });
      continue;
    }
    const w = s.winner;
    log(`  Winner:    ${w.id}  —  "${w.label}"`);
    log(`  Score:     ${fmt(w.score.score, 2)}   axes:`);
    for (const ax of w.score.breakdown ?? []) {
      log(`    • ${ax.axis.padEnd(28)}  value=${fmt((ax as any).value, 3)}  weight=${fmt((ax as any).weight, 2)}  contribution=${fmt((ax as any).contribution, 3)}`);
    }
    log(`  Events:    ${w.events.length}`);
    const typeCounts: Record<string, number> = {};
    for (const ev of w.events) {
      typeCounts[ev.deltaType] = (typeCounts[ev.deltaType] ?? 0) + 1;
      // Print up to 6 detailed events
      if (w.events.indexOf(ev) < 6) {
        const params = JSON.stringify(ev.params).slice(0, 160);
        log(`    [${ev.activationMonth}] ${ev.deltaType.padEnd(22)} ${params}`);
      }
    }
    if (w.events.length > 6) log(`    … (+${w.events.length - 6} more)`);
    const typesStr = Object.entries(typeCounts).map(([t, n]) => `${t}×${n}`).join(", ");
    log(`  Type mix:  ${typesStr}`);
    // netWorthFan
    const fan = w.result.netWorthFan;
    const first = fan[0];
    const mid   = fan[Math.floor(fan.length / 2)];
    const last  = fan[fan.length - 1];
    log(`  NW fan (P10/P50/P90):`);
    log(`    month 0:   ${fmtMoney(first?.p10)} / ${fmtMoney(first?.p50)} / ${fmtMoney(first?.p90)}`);
    log(`    midpoint:  ${fmtMoney(mid?.p10)} / ${fmtMoney(mid?.p50)} / ${fmtMoney(mid?.p90)}`);
    log(`    final:     ${fmtMoney(last?.p10)} / ${fmtMoney(last?.p50)} / ${fmtMoney(last?.p90)}`);
    // Survival prob (engine's per-result)
    const survival = (w.result as any).survivalProbability
                  ?? (w.result as any).probabilitySuccess
                  ?? null;
    log(`  result.survivalProbability:  ${fmtPct(survival)}`);
    log(`  probabilityP50:              ${fmtPct(s.probabilityP50)}`);
    log(`  scoreP50:                    ${fmt(s.scoreP50, 2)}`);

    rows.push({
      tid: s.templateId, label: s.templateLabel, winnerId: w.id,
      eventCount: w.events.length,
      eventTypes: typesStr || "(none)",
      scoreP50: s.scoreP50,
      fanFirstP50: first?.p50 ?? null,
      fanMidP50:   mid?.p50   ?? null,
      fanFinalP50: last?.p50  ?? null,
      fanFinalP10: last?.p10  ?? null,
      fanFinalP90: last?.p90  ?? null,
      survivalProb: typeof survival === "number" ? survival : null,
      probabilityP50: s.probabilityP50,
    });
  }

  // ─── differentiation matrix ──────────────────────────────────────────
  banner("Cross-template comparison (winner per template)");
  log("");
  log("  " + [
    "tid".padEnd(24),
    "winner".padEnd(28),
    "score".padStart(7),
    "NW final P50".padStart(16),
    "NW final P10".padStart(16),
    "NW final P90".padStart(16),
    "survival".padStart(10),
    "events".padStart(7),
  ].join("  "));
  log("  " + "─".repeat(110));
  for (const r of rows) {
    log("  " + [
      r.tid.padEnd(24),
      r.winnerId.padEnd(28),
      fmt(r.scoreP50, 2).padStart(7),
      fmtMoney(r.fanFinalP50).padStart(16),
      fmtMoney(r.fanFinalP10).padStart(16),
      fmtMoney(r.fanFinalP90).padStart(16),
      fmtPct(r.survivalProb).padStart(10),
      String(r.eventCount).padStart(7),
    ].join("  "));
  }

  // ─── convergence analysis ────────────────────────────────────────────
  banner("Convergence analysis");
  const scoreVals = rows.map((r) => r.scoreP50).filter((n): n is number => n != null);
  const finalNwVals = rows.map((r) => r.fanFinalP50).filter((n): n is number => n != null);
  const scoreSpread = scoreVals.length > 0
    ? (Math.max(...scoreVals) - Math.min(...scoreVals))
    : 0;
  const nwSpread = finalNwVals.length > 0
    ? (Math.max(...finalNwVals) - Math.min(...finalNwVals))
    : 0;
  const nwMid = finalNwVals.length > 0
    ? finalNwVals.reduce((a, b) => a + b, 0) / finalNwVals.length
    : 1;
  log(`  Score range across templates:        min=${fmt(Math.min(...scoreVals), 2)}  max=${fmt(Math.max(...scoreVals), 2)}  spread=${fmt(scoreSpread, 2)}`);
  log(`  NW@FIRE-horizon range:               min=${fmtMoney(Math.min(...finalNwVals))}  max=${fmtMoney(Math.max(...finalNwVals))}  spread=${fmtMoney(nwSpread)} (${fmtPct(nwSpread / Math.max(nwMid, 1))} of mean)`);

  // Pairwise duplicate detection — same winner id OR same event signature?
  const seenEventSigs = new Map<string, string[]>();
  for (const s of plan.rankedScenarios) {
    if (!s.winner) continue;
    const sig = s.winner.events.map((e) => `${e.deltaType}@${e.activationMonth}:${JSON.stringify(e.params)}`).sort().join("|");
    const bucket = seenEventSigs.get(sig) ?? [];
    bucket.push(`${s.templateId}/${s.winner.id}`);
    seenEventSigs.set(sig, bucket);
  }
  let dupCount = 0;
  log("\n  Event-signature collisions:");
  for (const [sig, group] of seenEventSigs.entries()) {
    if (group.length > 1) {
      dupCount += 1;
      log(`    DUPLICATE event stream shared by ${group.length} templates: ${group.join(", ")}`);
      log(`      signature (first 200 chars): ${sig.slice(0, 200)}`);
    }
  }
  if (dupCount === 0) log("    (none — every template's winner has a distinct event signature)");

  // Final-NW-P50 collisions within 1%
  const NW_TOL = 0.01;
  log("\n  Final-NW-P50 collisions (within 1%):");
  let nwDupCount = 0;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]!.fanFinalP50, b = rows[j]!.fanFinalP50;
      if (a == null || b == null) continue;
      if (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= NW_TOL) {
        nwDupCount += 1;
        log(`    ${rows[i]!.tid.padEnd(22)} ↔ ${rows[j]!.tid.padEnd(22)}  |Δ|/max = ${fmtPct(Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1), 2)}`);
      }
    }
  }
  if (nwDupCount === 0) log("    (none — every template's final-NW-P50 differs by >1%)");

  banner("Done");
  log("");
}

// ─── persist ──────────────────────────────────────────────────────────────
main()
  .then(() => {
    fs.writeFileSync(OUT_PATH, buf.join("\n") + "\n", "utf8");
    console.log("\n  wrote " + OUT_PATH);
  })
  .catch((err) => {
    console.error("PROBE FAILED:", err);
    buf.push("\nPROBE FAILED: " + (err instanceof Error ? err.stack : String(err)));
    fs.writeFileSync(OUT_PATH, buf.join("\n") + "\n", "utf8");
    process.exit(1);
  });
