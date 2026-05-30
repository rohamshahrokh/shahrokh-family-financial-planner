/**
 * Sprint 30C — Year-by-Year Roadmap Probe (READ-ONLY)
 *
 * Purpose: prove that the new `selectYearByYearRoadmap` selector produces
 * 7 populated year cards (2026..2032) with real milestones for the demo
 * Brisbane household.
 *
 * Run:  npx tsx script/sprint30c-yearbyyear-probe.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import { selectYearByYearRoadmap } from "../client/src/lib/actionRoadmap/yearByYearRoadmap";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { GoalProfileOverrides } from "../client/src/lib/goalLab/goalProfileStore";
import type { FanPoint, ScenarioDelta } from "../client/src/lib/scenarioV2/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "..", "sprint30c_yearbyyear_probe_output.txt");

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
function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}

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

async function main(): Promise<void> {
  banner("Sprint 30C — Year-by-Year Roadmap Probe");

  const ledger  = demoLedger();
  const profile = buildCanonicalGoalProfile(demoFireRow(), ledger, AUTO_OVERRIDES);

  const swrPct = profile.fire.swrPct ?? 4;
  const fireNumber = profile.fire.targetPassiveAnnual != null && swrPct > 0
    ? profile.fire.targetPassiveAnnual / (swrPct / 100)
    : null;
  log(`  fireNumber (derived)     = ${fmtMoney(fireNumber)}`);
  log(`  profile.fire.swrPct      = ${swrPct}`);
  log(`  profile.fire.targetPassiveAnnual = ${fmtMoney(profile.fire.targetPassiveAnnual)}`);
  log(`  profile.fire.currentAge  = ${profile.fire.currentAge}`);
  log(`  profile.fire.targetFireAge = ${profile.fire.targetFireAge}`);

  log("\n  Running runGoalLabPlan() (publishToAdapter=false, 200 sims)…");
  const t0 = performance.now();
  const plan = await runGoalLabPlan({
    ledger,
    profile,
    horizonYears: 25,
    simulationCount: 200,
    publishToAdapter: false,
  });
  const ms = performance.now() - t0;
  log(`  Done in ${Math.round(ms)} ms — ${plan.rankedScenarios.length} ranked scenarios.\n`);

  const recommended = plan.picks?.recommended ?? null;
  if (!recommended) {
    log("  ❌ No recommended winner — cannot probe year-by-year.");
    fs.writeFileSync(OUT_PATH, buf.join("\n"));
    process.exit(2);
  }

  const winner = recommended.winner;
  if (!winner) {
    log("  ❌ recommended.winner is null—cannot probe.");
    fs.writeFileSync(OUT_PATH, buf.join("\n"));
    process.exit(2);
  }
  log(`  Winner blueprint = ${(winner as any).blueprintId ?? "(none)"} (template ${recommended.templateId})`);
  log(`  Winner deltas count = ${(winner.events as ScenarioDelta[] | undefined)?.length ?? 0}`);
  const fan: FanPoint[] = (winner.result?.netWorthFan as FanPoint[] | undefined) ?? [];
  log(`  netWorthFan length = ${fan.length} months`);
  log(`  startMonth = ${fan[0]?.month ?? "—"}`);

  // Dump raw deltas with activation month + key params.
  banner("Raw winner deltas");
  const deltas = (winner.events as ScenarioDelta[] | undefined) ?? [];
  for (const d of deltas) {
    const paramsStr = JSON.stringify(d.params);
    log(`  ${d.activationMonth.padEnd(8)} ${d.deltaType.padEnd(28)} ${paramsStr}`);
  }

  // ─── Year-by-year selector ──────────────────────────────────────
  banner("selectYearByYearRoadmap output");
  const targetPassive = profile.fire.targetPassiveAnnual != null ? profile.fire.targetPassiveAnnual / 12 : null;

  // Force "now" to 2026-05-30 so the year window is 2026..2032 deterministically.
  const now = new Date("2026-05-30T00:00:00Z");

  const result = selectYearByYearRoadmap({
    events: deltas,
    fan,
    startMonth: fan[0]?.month ?? "2026-05",
    fireNumber: fireNumber ?? null,
    swrPct,
    targetPassiveMonthly: targetPassive,
    now,
  });

  if (result.years.length === 0) {
    log(`  ❌ Empty roadmap. Reason: ${result.reason ?? "(none)"}`);
    fs.writeFileSync(OUT_PATH, buf.join("\n"));
    process.exit(3);
  }

  for (const yc of result.years) {
    log("");
    log(`  ━━━ ${yc.year} ${yc.isFireYear ? "[FIRE YEAR]" : ""}`);
    log(`      EOY NW = ${fmtMoney(yc.netWorthEoy)}   Passive/mo = ${fmtMoney(yc.passiveIncomeMonthlyEoy)}   FIRE = ${fmtPct(yc.fireProgress)}`);
    if (yc.noMilestones) {
      log(`      (no engine-modelled milestones — background growth only)`);
      continue;
    }
    for (const m of yc.milestones) {
      log(`      • [${m.category.padEnd(15)}] ${m.label}`);
      log(`         reason: ${m.reason}`);
    }
  }

  // ─── Coverage assertions ──────────────────────────────────────
  banner("Coverage check");
  const yearsCovered = result.years.length;
  const yearsWithMilestones = result.years.filter((y) => !y.noMilestones).length;
  const yearsWithNW = result.years.filter((y) => y.netWorthEoy != null).length;
  const fireYears = result.years.filter((y) => y.isFireYear).length;
  log(`  Years rendered:           ${yearsCovered} / 7`);
  log(`  Years with milestones:    ${yearsWithMilestones}`);
  log(`  Years with EOY NW value:  ${yearsWithNW}`);
  log(`  FIRE-crossing years:      ${fireYears}`);

  const categoryCounts: Record<string, number> = {};
  for (const yc of result.years) {
    for (const m of yc.milestones) {
      categoryCounts[m.category] = (categoryCounts[m.category] ?? 0) + 1;
    }
  }
  log(`  Milestones by category:`);
  for (const [cat, n] of Object.entries(categoryCounts)) {
    log(`    ${cat.padEnd(16)} ${n}`);
  }

  fs.writeFileSync(OUT_PATH, buf.join("\n"));
  log(`\n  Probe output written to ${OUT_PATH}`);

  // Exit code reflects health.
  if (yearsCovered === 7 && yearsWithNW >= 7) {
    log("  ✅ Probe PASSED");
    process.exit(0);
  } else {
    log("  ⚠️  Probe partial (missing years or NW gaps)");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
