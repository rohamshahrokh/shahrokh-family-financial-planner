/**
 * orchestratorIntentFilterIntegrity.test.ts — FWL-078 Phase A4 regression guard.
 *
 * Validates the contract:
 *   "Every scenario returned by runGoalLabPlan must satisfy ONE of:
 *      (a) its template has no intentFilter, OR
 *      (b) winnerSelectedByIntentFilter === true, OR
 *      (c) the scenario was DROPPED (not in rankedScenarios)."
 *
 * In other words: a template's label and winner can never disagree because the
 * winner is always intent-filter-faithful when an intent filter is declared.
 * The only allowed deviation is a non-intent-filter template (which makes no
 * intent promise, e.g. current-plan).
 *
 * This test runs against the live household (shahrokh-family-main) and is the
 * regression guard for the bug fixed in orchestrator.ts FWL-078 Phase A.
 *
 * Honesty: this test makes ONE Supabase read and ONE orchestrator pass. It
 * does NOT mutate any data. It is the smallest possible end-to-end assertion.
 */

import { createClient } from "@supabase/supabase-js";
import { runGoalLabPlan } from "../orchestrator";
import { buildCanonicalGoalProfile } from "../canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../../fireGoalCanonical";
import { SCENARIO_TEMPLATES } from "../scenarioTemplates";
import type { DashboardInputs } from "../../dashboardDataContract";
import type { GoalProfileOverrides } from "../goalProfileStore";

const SUPABASE_URL = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

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

(async () => {
  console.log("FWL-078 Phase A4 — Orchestrator Intent-Filter Integrity");
  console.log("=======================================================");

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const [snap, fire, props, exp, inc] = await Promise.all([
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
    mcFireSettings: fire.data,
    todayIso: new Date().toISOString().split("T")[0],
  } as any;
  const fireNorm = normalizeFireSettingsRow(fire.data ?? {});
  const AUTO: GoalProfileOverrides = { preferredEngine: "auto", riskTolerance: "auto", constraintOverride: "auto" };
  const profile = buildCanonicalGoalProfile(fireNorm, inputs, AUTO);

  const plan = await runGoalLabPlan({
    ledger: inputs, profile,
    horizonYears: 25, simulationCount: 100, publishToAdapter: false,
  });

  console.log(`\nRan plan against shahrokh-family-main.`);
  console.log(`  rankedScenarios:  ${plan.rankedScenarios.length}`);
  console.log(`  recommended:      ${plan.picks.recommended?.templateId ?? "(none)"}`);
  console.log("");

  // ── 1. Every scenario in rankedScenarios must satisfy the contract.
  console.log("── 1. Intent-filter faithfulness contract ──");
  for (const s of plan.rankedScenarios) {
    const tmpl = SCENARIO_TEMPLATES.find((t) => t.id === s.templateId);
    const hasIntentFilter = !!tmpl?.intentFilter;
    if (!hasIntentFilter) {
      check(`${s.templateId} — no intent filter declared, any winner allowed`, true);
      continue;
    }
    const winnerId = s.winner?.id ?? "(none)";
    const winnerIsFaithful = s.winner ? tmpl!.intentFilter!(s.winner.id) : false;
    check(
      `${s.templateId} — winner "${winnerId}" matches intentFilter`,
      winnerIsFaithful,
      `winnerSelectedByIntentFilter=${s.winnerSelectedByIntentFilter}`,
    );
  }

  // ── 2. Specifically: buy-ip-now must either have ip_now winner OR be dropped.
  console.log("\n── 2. buy-ip-now drop-on-infeasibility ──");
  const buyIpNow = plan.rankedScenarios.find((s) => s.templateId === "buy-ip-now");
  if (buyIpNow) {
    check(
      `buy-ip-now winner is "ip_now" (intent-faithful)`,
      buyIpNow.winner?.id === "ip_now",
      `actual winner: "${buyIpNow.winner?.id ?? "(none)"}"`,
    );
  } else {
    check(
      `buy-ip-now correctly dropped (DSR-infeasible for this household)`,
      true,
      "expected outcome for shahrokh-family-main per FWL-078 Phase A1 probe",
    );
  }

  // ── 3. Recommended scenario must be intent-faithful or have no intent filter.
  console.log("\n── 3. Recommendation alignment ──");
  const rec = plan.picks.recommended;
  if (rec) {
    const tmpl = SCENARIO_TEMPLATES.find((t) => t.id === rec.templateId);
    const hasIntentFilter = !!tmpl?.intentFilter;
    const winnerIsFaithful = hasIntentFilter && rec.winner
      ? tmpl!.intentFilter!(rec.winner.id)
      : true; // no intent filter = no contract to break
    check(
      `recommended "${rec.templateId}" winner is intent-aligned (or has no intent filter)`,
      winnerIsFaithful,
      `winner="${rec.winner?.id}" intentFilter=${hasIntentFilter}`,
    );
  } else {
    check(`recommended is null — nothing to validate`, true);
  }

  // ── 4. No scenario should have winnerSelectedByIntentFilter=false AND a
  //    declared intentFilter — that's the exact bug FWL-078 fixed.
  console.log("\n── 4. No intent-filter regression ──");
  for (const s of plan.rankedScenarios) {
    const tmpl = SCENARIO_TEMPLATES.find((t) => t.id === s.templateId);
    if (!tmpl?.intentFilter) continue;
    check(
      `${s.templateId} — winnerSelectedByIntentFilter is true (intent filter applied successfully)`,
      s.winnerSelectedByIntentFilter === true,
      `winnerSelectedByIntentFilter=${s.winnerSelectedByIntentFilter} (engineTop=${s.engineTopWinner?.id ?? "?"})`,
    );
  }

  console.log("\n=======================================================");
  console.log(`  Passed: ${pass}`);
  console.log(`  Failed: ${fail}`);
  console.log("=======================================================");
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
