/**
 * Sprint 31A — Property Acquisition Probe (READ-ONLY)
 *
 * Runs the full Goal Lab plan for the demo Brisbane household, then for EACH
 * ranked scenario:
 *   1. Dumps the winning blueprint id + raw deltas.
 *   2. Feeds the deltas into `planAcquisitions(...)` to print the structured
 *      acquisition schedule (buy / refi / equity-release / portfolio-expansion).
 *   3. Cross-checks against `selectYearByYearRoadmap(...)` to confirm the
 *      year-by-year cards surface the same events.
 *
 * Pass criteria (Sprint 31A):
 *   • The 5 required pathway templates are present in `rankedScenarios`:
 *       buy-ip-now, delay-ip, equity-release-ip, refinance-rate-save, multi-property-ladder
 *   • At least one scenario produces a non-empty AcquisitionPlan
 *   • Equity-release and multi-property scenarios produce equity_release events
 *
 * Run:  npx tsx script/sprint31a-acquisition-probe.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import { selectYearByYearRoadmap } from "../client/src/lib/actionRoadmap/yearByYearRoadmap";
import {
  planAcquisitions,
  type PlannerContext,
} from "../client/src/lib/scenarioV2/decisionEngine/propertyAcquisitionPlanner";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { GoalProfileOverrides } from "../client/src/lib/goalLab/goalProfileStore";
import type { FanPoint, ScenarioDelta } from "../client/src/lib/scenarioV2/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "..", "sprint31a_acquisition_probe_output.txt");

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
    todayIso: "2026-05-30",
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
  preferredEngine:    "property",
  riskTolerance:      "moderate",
  constraintOverride: "auto",
};

const REQUIRED_TEMPLATES = [
  "buy-ip-now",
  "delay-ip",
  "equity-release-ip",
  "refinance-rate-save",
  "multi-property-ladder",
] as const;

async function main(): Promise<void> {
  banner("Sprint 31A — Property Acquisition Probe");

  const ledger  = demoLedger();
  const profile = buildCanonicalGoalProfile(demoFireRow(), ledger, AUTO_OVERRIDES);

  // Derive planner context once for the household (same numbers every
  // scenario sees at planning time).
  const snap = ledger.snapshot as unknown as {
    ppor: number; mortgage: number; cash: number;
    roham_monthly_income: number; fara_monthly_income: number;
    monthly_expenses: number;
  };
  const monthlyIncome = (snap.roham_monthly_income ?? 0) + (snap.fara_monthly_income ?? 0);
  const monthlyExpenses = snap.monthly_expenses ?? 0;
  const pporEquity = Math.max(0, snap.ppor - snap.mortgage);
  const pporUseable = Math.max(0, 0.80 * snap.ppor - snap.mortgage);
  const pporLvr = snap.ppor > 0 ? snap.mortgage / snap.ppor : 0;
  // NSR approx: (income - expenses) / debt_service_monthly
  // For demo: mortgage repayment estimate at 6.5% over 30y on $1.2M ≈ $7,584/mo
  const approxDebtService = (snap.mortgage * (0.065 / 12) * Math.pow(1 + 0.065 / 12, 360)) /
    (Math.pow(1 + 0.065 / 12, 360) - 1);
  const nsr = approxDebtService > 0 ? monthlyIncome / approxDebtService : 0;

  const plannerCtx: PlannerContext = {
    cashToday: snap.cash,
    monthlyExpenses,
    monthlyIncome,
    pporValue: snap.ppor,
    pporUseableEquityAt80Lvr: pporUseable,
    pporLvr,
    ipLvr: 0,            // no IPs yet
    nsr,
  };

  log("  Household snapshot:");
  log(`    PPOR value           = ${fmtMoney(snap.ppor)}`);
  log(`    PPOR mortgage        = ${fmtMoney(snap.mortgage)}`);
  log(`    PPOR raw equity      = ${fmtMoney(pporEquity)}`);
  log(`    PPOR useable @ 80%   = ${fmtMoney(pporUseable)}`);
  log(`    PPOR LVR             = ${(pporLvr * 100).toFixed(1)}%`);
  log(`    Cash today           = ${fmtMoney(snap.cash)}`);
  log(`    Monthly income       = ${fmtMoney(monthlyIncome)}`);
  log(`    Monthly expenses     = ${fmtMoney(monthlyExpenses)}`);
  log(`    Approx debt service  = ${fmtMoney(approxDebtService)}`);
  log(`    Approx NSR           = ${nsr.toFixed(2)}`);

  log("\n  Running runGoalLabPlan() (publishToAdapter=false, 200 sims, preferredEngine=property)…");
  const t0 = performance.now();
  const plan = await runGoalLabPlan({
    ledger,
    profile,
    horizonYears: 25,
    simulationCount: 200,
    publishToAdapter: false,
  });
  const ms = performance.now() - t0;
  log(`  Done in ${Math.round(ms)} ms — ${plan.rankedScenarios.length} ranked scenarios.`);

  banner("Ranked scenarios (templates that ran)");
  const templatesFound = new Set<string>();
  for (const s of plan.rankedScenarios) {
    templatesFound.add(s.templateId);
    const w = s.winner;
    const winnerId = w ? (w as any).blueprintId ?? "(none)" : "(no winner)";
    log(`  • ${s.templateId.padEnd(26)} → winner=${winnerId.padEnd(26)} score=${w?.score.score.toFixed(3) ?? "—"}`);
  }

  banner("Required-pathway coverage");
  let missing = 0;
  for (const id of REQUIRED_TEMPLATES) {
    const present = templatesFound.has(id);
    if (!present) missing += 1;
    log(`  [${present ? "✓" : "✗"}] ${id}`);
  }
  if (missing > 0) {
    log(`\n  ⚠️  ${missing} required template(s) missing from rankedScenarios.`);
  }

  // ─── Per-scenario acquisition schedules ───────────────────────────
  banner("Acquisition schedule per scenario (2026–2032)");
  const now = new Date("2026-05-30T00:00:00Z");
  let nonEmptyPlans = 0;
  let equityReleaseHits = 0;
  let portfolioExpansionHits = 0;

  for (const s of plan.rankedScenarios) {
    if (!s.winner) continue;
    const deltas = (s.winner.events as ScenarioDelta[] | undefined) ?? [];
    const acq = planAcquisitions(deltas, plannerCtx);

    log("");
    log(`  ── ${s.templateId}  (${s.templateLabel})`);
    log(`     winner blueprintId = ${(s.winner as any).blueprintId ?? "(none)"}`);
    log(`     winner deltas      = ${deltas.length}`);

    if (acq.empty) {
      log(`     (no acquisitions: ${acq.emptyReason ?? "—"})`);
      continue;
    }
    nonEmptyPlans += 1;
    for (const e of acq.events) {
      if (e.type === "equity_release") equityReleaseHits += 1;
      if (e.type === "portfolio_expansion") portfolioExpansionHits += 1;
      log(`     • [${e.month}] [${e.type.padEnd(20)}] ${e.label}`);
      log(`        reason: ${e.reason}`);
      for (const t of e.triggers) {
        log(`        trigger: ${t}`);
      }
    }
  }

  // ─── Year-by-year cross-check on the top-ranked scenario ─────────
  banner("Year-by-Year cross-check (top-ranked scenario)");
  const top = plan.rankedScenarios[0];
  if (top && top.winner) {
    const deltas = (top.winner.events as ScenarioDelta[] | undefined) ?? [];
    const fan: FanPoint[] = (top.winner.result?.netWorthFan as FanPoint[] | undefined) ?? [];
    const targetPassive = profile.fire.targetPassiveAnnual != null
      ? profile.fire.targetPassiveAnnual / 12
      : null;
    const fireNumber = profile.fire.targetPassiveAnnual != null && (profile.fire.swrPct ?? 4) > 0
      ? profile.fire.targetPassiveAnnual / ((profile.fire.swrPct ?? 4) / 100)
      : null;

    const yby = selectYearByYearRoadmap({
      events: deltas,
      fan,
      startMonth: fan[0]?.month ?? "2026-05",
      fireNumber,
      swrPct: profile.fire.swrPct ?? 4,
      targetPassiveMonthly: targetPassive,
      now,
    });

    log(`  Top scenario: ${top.templateId}`);
    log(`  Years rendered: ${yby.years.length}`);
    for (const yc of yby.years) {
      const acqMilestones = yc.milestones.filter((m) =>
        m.category === "acquisition" || m.category === "refinance" || m.category === "equity_release",
      );
      if (acqMilestones.length === 0) continue;
      log(`  ${yc.year}:`);
      for (const m of acqMilestones) {
        log(`     • [${m.category.padEnd(15)}] ${m.label}`);
      }
    }
  } else {
    log("  (no top-ranked scenario with a winner — skipped)");
  }

  // ─── Summary + exit code ──────────────────────────────────────────
  banner("Summary");
  log(`  Ranked scenarios:            ${plan.rankedScenarios.length}`);
  log(`  Required templates present:  ${REQUIRED_TEMPLATES.length - missing} / ${REQUIRED_TEMPLATES.length}`);
  log(`  Scenarios with acquisitions: ${nonEmptyPlans}`);
  log(`  Equity-release events seen:  ${equityReleaseHits}`);
  log(`  Portfolio-expansion events:  ${portfolioExpansionHits}`);

  fs.writeFileSync(OUT_PATH, buf.join("\n"));
  log(`\n  Probe output written to ${OUT_PATH}`);

  const pass =
    missing === 0 &&
    nonEmptyPlans > 0 &&
    equityReleaseHits > 0;
  if (pass) {
    log("  ✅ Probe PASSED");
    process.exit(0);
  } else {
    log("  ⚠️  Probe partial (see counts above)");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
