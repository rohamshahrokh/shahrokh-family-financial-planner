/**
 * FWL-078 Phase A1 — Buy-IP-Now Winner Diagnostic Probe (READ-ONLY).
 *
 * Re-runs the Goal Lab orchestrator against canonical inputs and inspects
 * the `buy-ip-now` template's QuickDecisionOutput in detail. Surfaces exactly
 * why winner = defer_etf_super_50 instead of ip_now, by printing:
 *
 *   • Stage-1 (behavioural-realism) discards — pre-MC gate
 *   • Stage-2 (safety-ceiling) discards     — post-MC gate
 *   • Full ranked[] with score for every passing blueprint, ip_now position
 *   • Final orchestrator winner + intent-filter outcome
 *   • Template-gate evaluation (hasIpHeadroom)
 *
 * NO ENGINE CHANGES. NO PRODUCTION WRITES. Pure observation.
 */

import { createClient } from "@supabase/supabase-js";
import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { GoalProfileOverrides } from "../client/src/lib/goalLab/goalProfileStore";
import * as fs from "node:fs";
import * as path from "node:path";

const SUPABASE_URL = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

const buf: string[] = [];
const log = (s: string = "") => { console.log(s); buf.push(s); };

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

  log("═".repeat(96));
  log("  FWL-078 Phase A1 — Buy-IP-Now Winner Diagnostic Probe");
  log("═".repeat(96));
  log(`  Household:   shahrokh-family-main`);
  log(`  Generated:   ${new Date().toISOString()}`);
  log(`  Branch:      main`);
  log();

  // ── Run the orchestrator
  log("Running runGoalLabPlan (this takes ~30s for 200 simulations × templates) …");
  const plan = await runGoalLabPlan({
    ledger: inputs, profile,
    horizonYears: 25, simulationCount: 200, publishToAdapter: false,
  });
  log("Done.");
  log();

  // ── 1. Was buy-ip-now template even evaluated?
  const buyIpScenario = plan.rankedScenarios.find((s) => s.templateId === "buy-ip-now");
  log("─".repeat(96));
  log("  1. TEMPLATE-LEVEL: was buy-ip-now evaluated by the orchestrator?");
  log("─".repeat(96));
  if (!buyIpScenario) {
    log(`  ✗ buy-ip-now is NOT in rankedScenarios — it was gated out by its template.gate()`);
    log(`    (scenarioTemplates.ts:217 → hasIpHeadroom(profile))`);
    log(`  In that case the bug is purely cosmetic (template label shouldn't be picked up).`);
    log();
    const out = path.resolve(process.cwd(), "sprint_fwl078_buy_ip_now_probe.txt");
    fs.writeFileSync(out, buf.join("\n") + "\n");
    log(`Wrote ${out}`);
    return;
  }
  log(`  ✓ buy-ip-now appears in rankedScenarios.`);
  log(`    templateId:                       "${buyIpScenario.templateId}"`);
  log(`    winner.id (post-intent-filter):   "${buyIpScenario.winner?.id ?? "(none)"}"`);
  log(`    winnerSelectedByIntentFilter:     ${buyIpScenario.winnerSelectedByIntentFilter}`);
  log(`    engineTopWinner.id (pre-filter):  "${buyIpScenario.engineTopWinner?.id ?? "(none)"}"`);
  log();

  // ── 2. Inspect the raw QuickDecisionOutput for this template
  const raw = buyIpScenario.raw;
  log("─".repeat(96));
  log("  2. RANKED[] — every blueprint that passed both stages of generateQuickDecisionCandidates");
  log("─".repeat(96));
  log(`  Total in ranked[]: ${raw.ranked.length}`);
  raw.ranked.forEach((c, i) => {
    log(`    ${String(i + 1).padStart(2)}. ${c.id.padEnd(28)} score=${c.score.score.toFixed(2).padStart(6)}  isHighRisk=${c.isHighRisk}  events=${c.events.length}`);
  });
  log();
  const ipNowInRanked = raw.ranked.find((c) => c.id === "ip_now");
  if (ipNowInRanked) {
    log(`  ✓ ip_now IS in ranked[] — position ${raw.ranked.findIndex(c => c.id === "ip_now") + 1}`);
    log(`    score:    ${ipNowInRanked.score.score.toFixed(2)}`);
    log(`    events:   ${ipNowInRanked.events.length}`);
    log(`    headline: ${ipNowInRanked.headline}`);
    log(`    rationale: ${ipNowInRanked.rationale.slice(0, 2).join(" | ")}`);
    log();
    log(`  → Bug location: orchestrator intent-filter SHOULD have picked this candidate`);
    log(`    but instead winner = "${buyIpScenario.winner?.id}". Investigate id-string`);
    log(`    mismatch or filter regex.`);
  } else {
    log(`  ✗ ip_now is NOT in ranked[] — it was discarded somewhere upstream.`);
  }
  log();

  // ── 3. Inspect discarded[] — Stage 1 (behavioural) + Stage 2 (safety)
  log("─".repeat(96));
  log("  3. DISCARDED[] — every blueprint dropped by Stage 1 or Stage 2");
  log("─".repeat(96));
  log(`  Total discarded: ${raw.discarded.length}`);
  log();
  if (raw.discarded.length > 0) {
    log("  Blueprint id              Stage             Reason");
    log("  ────────────────────────  ────────────────  ──────────────────────────────────────");
    raw.discarded.forEach((d) => {
      log(`  ${d.id.padEnd(24)}  ${d.stage.padEnd(16)}  ${d.reason}`);
    });
    log();
  } else {
    log("  (no blueprints discarded — every one passed both stages)");
    log();
  }

  const ipNowDiscarded = raw.discarded.find((d) => d.id === "ip_now");
  if (ipNowDiscarded) {
    log("─".repeat(96));
    log("  4. ip_now DEEP-DIVE — why it was rejected");
    log("─".repeat(96));
    log(`    id:        ${ipNowDiscarded.id}`);
    log(`    label:     ${ipNowDiscarded.label}`);
    log(`    stage:     ${ipNowDiscarded.stage}     ← "behavioural" = pre-MC; "safety_ceiling" = post-MC`);
    log(`    severity:  ${ipNowDiscarded.severity}`);
    log(`    reason:    ${ipNowDiscarded.reason}`);
    log(`    detail:    ${ipNowDiscarded.detail}`);
    log(`    override:  ${JSON.stringify(ipNowDiscarded.override, null, 2).split("\n").map(l => "               " + l).join("\n").trim()}`);
    if (ipNowDiscarded.explanation) {
      log(`    explanation.headline:`);
      log(`      ${ipNowDiscarded.explanation.headline ?? "(none)"}`);
      if (ipNowDiscarded.explanation.bullets?.length) {
        log(`    explanation.bullets:`);
        ipNowDiscarded.explanation.bullets.forEach((b: string) => log(`      • ${b}`));
      }
    }
    if (ipNowDiscarded.recovery) {
      log(`    recovery analysis present:    ${JSON.stringify(ipNowDiscarded.recovery).slice(0, 200)}…`);
    }
    log();
  }

  // ── 5. Sanity — show what the winner actually is + its events
  log("─".repeat(96));
  log("  5. WINNER STATE — what the orchestrator picked for buy-ip-now");
  log("─".repeat(96));
  const w = buyIpScenario.winner;
  if (!w) {
    log("  (no winner — every candidate was discarded)");
  } else {
    log(`  winner.id:                  "${w.id}"`);
    log(`  winner.label:               "${w.label}"`);
    log(`  winner.score:               ${w.score.score.toFixed(2)}`);
    log(`  winner.events.length:       ${w.events.length}`);
    w.events.forEach((e: any, i: number) => {
      const p = e.params ?? {};
      const extra = [
        p.purchasePrice  ? `price=$${Math.round(p.purchasePrice).toLocaleString()}` : null,
        p.amount         ? `amount=$${Math.round(p.amount).toLocaleString()}` : null,
        p.extraDeposit   ? `deposit=$${Math.round(p.extraDeposit).toLocaleString()}` : null,
        p.targetAsset    ? `target=${p.targetAsset}` : null,
      ].filter(Boolean).join(" ");
      log(`    ${String(i + 1).padStart(2)}. [${e.activationMonth}] ${e.deltaType.padEnd(22)} ${extra}`);
    });
  }
  log();

  // ── 6. Headline & decision
  log("═".repeat(96));
  log("  DIAGNOSIS HEADLINE");
  log("═".repeat(96));
  if (ipNowInRanked && buyIpScenario.winner?.id !== "ip_now") {
    log(`  • ip_now IS scored and present in ranked[] but orchestrator picked "${buyIpScenario.winner?.id}".`);
    log(`  • winnerSelectedByIntentFilter = ${buyIpScenario.winnerSelectedByIntentFilter}`);
    log(`  • Fix: orchestrator.ts:296-302 intent-filter logic OR template intentFilter regex.`);
  } else if (ipNowDiscarded) {
    log(`  • ip_now was DISCARDED at stage "${ipNowDiscarded.stage}".`);
    log(`  • Reason: ${ipNowDiscarded.reason} — ${ipNowDiscarded.detail}`);
    if (ipNowDiscarded.stage === "behavioural") {
      log(`  • Fix path: behaviouralRealism check in candidateGenerator (Stage 1).`);
      log(`    If the failure is a true affordability problem, the right fix is to tighten`);
      log(`    the buy-ip-now template.gate() so the template isn't presented at all.`);
    } else {
      log(`  • Fix path: safetyCeilings post-MC check OR tighten the template.gate().`);
    }
  } else if (!ipNowInRanked) {
    log(`  • ip_now is NEITHER in ranked[] NOR discarded[]. This means it never entered Stage 1.`);
    log(`  • Fix: verify blueprintsForBuyProperty() emits "ip_now" (candidateGenerator.ts:868).`);
  } else {
    log(`  • ip_now IS the winner. No bug — re-check assumptions.`);
  }
  log();

  // ── Final winner classification across all top scenarios
  log("─".repeat(96));
  log("  Bonus: every template's intent-filter outcome");
  log("─".repeat(96));
  plan.rankedScenarios.forEach((s) => {
    log(
      `  ${s.templateId.padEnd(26)} winner=${(s.winner?.id ?? "(none)").padEnd(26)} ` +
      `intentFilterUsed=${s.winnerSelectedByIntentFilter}  ` +
      `engineTop=${s.engineTopWinner?.id ?? "(none)"}`,
    );
  });
  log();
  log("═".repeat(96));
  log("  END");
  log("═".repeat(96));

  const out = path.resolve(process.cwd(), "sprint_fwl078_buy_ip_now_probe.txt");
  fs.writeFileSync(out, buf.join("\n") + "\n");
  console.log(`\nWrote ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
