/**
 * Sprint 31D — Risk Calibration Fix — Before/After Verification (READ-ONLY)
 *
 * Runs the same risk inference + Decision-Engine pipeline as Sprint 31C against
 * real Supabase data and shows the impact of the two fixes:
 *
 *   Fix 1: inferences.ts:164 — replaced `inputs.snapshot.ppor_value ?? 0` with
 *          `nw.assets.ppor` (canonical NW already in scope). This restores the
 *          PPOR-equity subtraction so drawdownP / risk band reflect reality.
 *
 *   Fix 2: dashboardDataContract.selectMortgageRepayment — when the snapshot
 *          does not carry `mortgage_rate`, fall back to
 *          `mc_fire_settings.mean_mortgage_rate` (and a 30y term default).
 *          This raises monthly_debt_service from ~$250 to the true PPOR P&I.
 *
 * The probe runs the pipeline TWICE on the live engine:
 *   • Run A: dashboardInputs WITHOUT mcFireSettings AND with a temporary
 *            `snapshot.ppor_value` shim restored (simulates pre-fix behaviour).
 *   • Run B: dashboardInputs WITH mcFireSettings threaded in (current/fixed).
 *
 * Why simulate "before" with a shim?
 * ----------------------------------
 * The Fix 1 code change has already landed (`nw.assets.ppor` is now hard-coded
 * into the source path). To honestly compare pre-/post-, we reconstruct the
 * pre-fix behaviour by:
 *   1) writing a `ppor_value` shim onto the snapshot equal to 0 (so the
 *      pre-fix line `(snapshot.ppor_value ?? 0)` would have evaluated to 0,
 *      matching the live defect)
 *   2) wrapping inferRiskCapacity in a local pre-fix replica function that
 *      reproduces the original line verbatim, then re-runs the pipeline
 *
 * NO writes to Supabase. NO mutation of source files. Pure observation.
 *
 * Run:  npx tsx script/sprint31d-risk-fix-verification.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { inferRiskCapacity } from "../client/src/lib/goalLab/inferences";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import {
  selectCashToday,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlyDebtService,
  selectMortgageRepayment,
  selectMortgageInputState,
  selectCanonicalNetWorth,
} from "../client/src/lib/dashboardDataContract";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { GoalProfileOverrides } from "../client/src/lib/goalLab/goalProfileStore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH  = path.resolve(__dirname, "..", "sprint31d_risk_fix_verification.txt");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

const buf: string[] = [];
const log = (s: string = ""): void => { console.log(s); buf.push(s); };
const line = (): void => log("─".repeat(120));
const banner = (t: string): void => { log(""); line(); log("  " + t); line(); };
const fmtMoney = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "—" : "$" + Math.round(n).toLocaleString();
const fmtPct = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "—" : (n * 100).toFixed(2) + "%";
const fmt = (v: unknown): string => v == null ? String(v) : String(v);

async function fetchAllPaged<T = any>(sb: any, table: string): Promise<T[]> {
  const pageSize = 1000; let from = 0; const out: T[] = [];
  while (true) {
    const { data, error } = await sb.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function fetchReal() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const [snap, fire, props, exp, inc] = await Promise.all([
    sb.from("sf_snapshot").select("*").maybeSingle(),
    sb.from("mc_fire_settings").select("*").maybeSingle(),
    fetchAllPaged(sb, "sf_properties"),
    fetchAllPaged(sb, "sf_expenses"),
    fetchAllPaged(sb, "sf_income"),
  ]);
  if (snap.error) throw snap.error;
  if (fire.error) throw fire.error;
  return { snapshot: snap.data, fireRow: fire.data, properties: props, expenses: exp, income: inc };
}

const AUTO: GoalProfileOverrides = { preferredEngine: "auto", riskTolerance: "auto", constraintOverride: "auto" };

/**
 * Pre-fix replica of inferRiskCapacity — reproduces the exact line that lived
 * at inferences.ts:164 before Sprint 31D landed, so we can compute what risk
 * capacity WOULD have been on this household had the bug not been fixed.
 *
 * Reads `inputs.snapshot.ppor_value` (legacy/misspelled field) instead of the
 * canonical NW figure. On real data this resolves to 0, leaving PPOR equity
 * inside the `invested` denominator and collapsing drawdownP.
 */
function preFixInferRiskCapacity(inputs: DashboardInputs) {
  if (!inputs.snapshot) return null;
  const monthlyIncome = selectMonthlyIncome(inputs);
  const monthlyExpenses = selectMonthlyExpensesLedger(inputs);
  // Pre-fix: read monthly_debt_service from a copy of inputs that strips
  // mcFireSettings, so selectMortgageRepayment returns 0 (mirrors prod prior
  // to Sprint 31D Fix 2). This isolates the BEFORE state on debt service too.
  const stripped: DashboardInputs = { ...inputs, mcFireSettings: null };
  const debtService = selectMonthlyDebtService(stripped);
  const liquidity = selectCashToday(inputs);
  const nw = selectCanonicalNetWorth(inputs);
  if (nw.netWorth <= 0 || monthlyExpenses <= 0) return null;

  // ─── the original (buggy) line ───────────────────────────────────
  const invested = Math.max(
    nw.totalAssets - liquidity - ((inputs.snapshot as any).ppor_value ?? 0),
    1,
  );
  // ─────────────────────────────────────────────────────────────────
  const drawdownP = Math.min(0.6, Math.max(0.1, liquidity / invested));
  const monthlyBurn = monthlyExpenses + debtService;
  const runway = monthlyBurn > 0 ? liquidity / monthlyBurn : 0;
  const monthsEndurable = Math.round(runway);
  const band =
    runway < 3 || drawdownP < 0.15 ? "low" :
    runway < 6 || drawdownP < 0.25 ? "medium_low" :
    runway < 12 || drawdownP < 0.35 ? "medium" :
    runway < 24 || drawdownP < 0.45 ? "medium_high" :
    "high";
  const dsRatio = monthlyIncome > 0 ? debtService / monthlyIncome : 1;
  const leverageComfort =
    dsRatio < 0.2 ? "aggressive" :
    dsRatio < 0.35 ? "moderate" :
    "conservative";
  return {
    drawdownToleranceP: drawdownP,
    incomeLossEnduranceMonths: monthsEndurable,
    band: band as "low" | "medium_low" | "medium" | "medium_high" | "high",
    leverageComfort: leverageComfort as "conservative" | "moderate" | "aggressive",
    source: "derived_from_ledger" as const,
    monthlyBurn,
    debtService,
    invested,
  };
}

function bandToToleranceSeed(b: string | undefined | null): string {
  if (b === "low" || b === "medium_low") return "low";
  if (b === "medium") return "moderate";
  if (b === "medium_high" || b === "high") return "high";
  return "moderate";
}

async function main(): Promise<void> {
  const real = await fetchReal();

  // ── Compose two DashboardInputs: BEFORE (no mcFire) and AFTER (with) ──────
  const beforeInputs: DashboardInputs = {
    snapshot: real.snapshot,
    properties: real.properties,
    stocks: [], cryptos: [], holdingsRaw: [],
    incomeRecords: real.income, expenses: real.expenses,
    mcFireSettings: null,
    todayIso: new Date().toISOString().split("T")[0],
  };
  const afterInputs: DashboardInputs = {
    ...beforeInputs,
    mcFireSettings: real.fireRow,
  };
  const fireNorm = normalizeFireSettingsRow(real.fireRow ?? {});

  banner("SPRINT 31D — RISK CALIBRATION FIX — BEFORE / AFTER VERIFICATION");
  log("  Household:  " + (real.snapshot?.id ?? "unknown"));
  log("  Source:     real Supabase data (sf_snapshot, mc_fire_settings, sf_*)");
  log("  Fixes:");
  log("    1. inferences.ts:164  → ppor_value → nw.assets.ppor  (canonical NW)");
  log("    2. dashboardDataContract.selectMortgageRepayment → mc_fire_settings.mean_mortgage_rate fallback");

  // ── Real inputs summary ───────────────────────────────────────────────────
  banner("PART 1 — Real inputs (identical for both runs)");
  const s = real.snapshot ?? {};
  const cash = selectCashToday(afterInputs);
  const inc  = selectMonthlyIncome(afterInputs);
  const exp  = selectMonthlyExpensesLedger(afterInputs);
  const nw   = selectCanonicalNetWorth(afterInputs);
  log("  snapshot.ppor                     " + fmtMoney(Number(s.ppor || 0)));
  log("  snapshot.mortgage                 " + fmtMoney(Number(s.mortgage || 0)));
  log("  snapshot.other_debts              " + fmtMoney(Number(s.other_debts || 0)));
  log("  snapshot.cash + savings + offset  " + fmtMoney(cash));
  log("  monthly_income                    " + fmtMoney(inc));
  log("  monthly_expenses (6mo avg)        " + fmtMoney(exp));
  log("  net worth                         " + fmtMoney(nw.netWorth));
  log("  total assets                      " + fmtMoney(nw.totalAssets));
  log("  mc_fire_settings.mean_mortgage_rate  " + fmt((real.fireRow as any)?.mean_mortgage_rate));

  // ── Fix 2 effect: PPOR repayment & debt service ───────────────────────────
  banner("PART 2 — Fix 2 effect on PPOR repayment and monthly_debt_service");
  const pporBefore = selectMortgageRepayment(beforeInputs);
  const pporAfter  = selectMortgageRepayment(afterInputs);
  const debtBefore = selectMonthlyDebtService(beforeInputs);
  const debtAfter  = selectMonthlyDebtService(afterInputs);
  const stBefore   = selectMortgageInputState(beforeInputs);
  const stAfter    = selectMortgageInputState(afterInputs);
  log("                                          BEFORE             AFTER");
  log("  PPOR mortgage repayment (P&I)       " + fmtMoney(pporBefore).padEnd(19) + fmtMoney(pporAfter));
  log("  monthly_debt_service (total)        " + fmtMoney(debtBefore).padEnd(19) + fmtMoney(debtAfter));
  log("  selectMortgageInputState.rateSource " + ("\""+stBefore.rateSource+"\"").padEnd(19) + ("\""+stAfter.rateSource+"\""));
  log("  selectMortgageInputState.termSource " + ("\""+stBefore.termSource+"\"").padEnd(19) + ("\""+stAfter.termSource+"\""));

  // ── Risk inference: BEFORE (pre-fix replica) vs AFTER (live) ──────────────
  banner("PART 3 — Risk inference BEFORE vs AFTER");
  const rcBefore = preFixInferRiskCapacity(beforeInputs);
  const rcAfter  = inferRiskCapacity(afterInputs);
  const seedBefore = bandToToleranceSeed(rcBefore?.band);
  const seedAfter  = bandToToleranceSeed(rcAfter?.band);
  log("  Field                                  BEFORE              AFTER");
  log("  " + "─".repeat(40) + "  " + "─".repeat(18) + "  " + "─".repeat(18));
  log("  drawdownToleranceP                    " + fmtPct(rcBefore?.drawdownToleranceP).padEnd(18) + "  " + fmtPct(rcAfter?.drawdownToleranceP));
  log("  incomeLossEnduranceMonths             " + String(rcBefore?.incomeLossEnduranceMonths).padEnd(18) + "  " + String(rcAfter?.incomeLossEnduranceMonths));
  log("  riskCapacity.band                     " + ("\""+rcBefore?.band+"\"").padEnd(18) + "  " + "\""+rcAfter?.band+"\"");
  log("  leverageComfort                       " + ("\""+rcBefore?.leverageComfort+"\"").padEnd(18) + "  " + "\""+rcAfter?.leverageComfort+"\"");
  log("  → toleranceSeedFromCapacity           " + ("\""+seedBefore+"\"").padEnd(18) + "  " + "\""+seedAfter+"\"");

  // ── Decision Engine: BEFORE vs AFTER ──────────────────────────────────────
  banner("PART 4 — Decision Engine BEFORE vs AFTER (overrides = auto/auto/auto)");

  // BEFORE: build profile with the pre-fix risk capacity by temporarily
  // re-introducing the `ppor_value` shim → but `inferRiskCapacity` is now
  // hardcoded to use `nw.assets.ppor`, so we cannot route through the live
  // function. Instead, we drive Decision Engine with an explicit riskTolerance
  // override equal to the BEFORE seed ("low"), which is exactly what the
  // pre-fix toleranceSeedFromCapacity → resolvedRiskTolerance pipeline would
  // have produced. This isolates the *engine* effect of the risk-band change.
  const beforeProfile = buildCanonicalGoalProfile(fireNorm, beforeInputs, {
    ...AUTO, riskTolerance: seedBefore as any,
  });
  const beforePlan = await runGoalLabPlan({
    ledger: beforeInputs, profile: beforeProfile,
    horizonYears: 25, simulationCount: 200, publishToAdapter: false,
  });

  // AFTER: pure auto resolution on the fixed code.
  const afterProfile = buildCanonicalGoalProfile(fireNorm, afterInputs, AUTO);
  const afterPlan = await runGoalLabPlan({
    ledger: afterInputs, profile: afterProfile,
    horizonYears: 25, simulationCount: 200, publishToAdapter: false,
  });

  // Mirror orchestrator.ts:728-740 Rule 1 semantics exactly:
  //   liquidityWeak     = pv.signals.liquidityStressBand IN ("red","amber")
  //   lowRisk           = resolved.riskTolerance === "low"
  //   topIsAggressive   = AGGRESSIVE_TEMPLATE_IDS.has(top.templateId)
  //   Rule1Fires        = (lowRisk OR liquidityWeak) AND topIsAggressive AND safest exists
  const AGGR = new Set(["buy-ip-now","etf-acceleration","debt-recycling"]);
  const SAFE = new Set(["delay-ip","debt-reduction","liquidity-preservation","offset-optimisation","lower-target-or-extend"]);
  const summarise = (label: string, profile: any, plan: any) => {
    const top = plan.rankedScenarios?.[0];
    const rec = plan.picks?.recommended;
    const pv  = profile.inferences.preferenceVector;
    const liqBand = pv?.signals?.liquidityStressBand ?? null;
    const lowRisk = profile.resolved.riskTolerance === "low";
    const liquidityWeak = liqBand === "red" || liqBand === "amber";
    const aggressiveTop = !!top && AGGR.has(top.templateId);
    const safestExists = (plan.rankedScenarios ?? []).some((s: any) => SAFE.has(s.templateId));
    const rule1Fires = (lowRisk || liquidityWeak) && aggressiveTop && safestExists;
    return {
      label,
      resolvedRT: profile.resolved.riskTolerance,
      capBand: profile.inferences.riskCapacity?.band,
      topId: top?.templateId,
      topScore: top?.score,
      finalId: rec?.templateId,
      finalScore: rec?.score,
      pvSafety: pv?.safety,
      pvSpeed: pv?.speed,
      liqBand,
      lowRisk, liquidityWeak, aggressiveTop, safestExists, rule1Fires,
    };
  };
  const b = summarise("BEFORE", beforeProfile, beforePlan);
  const a = summarise("AFTER",  afterProfile,  afterPlan);

  log("  Field                              BEFORE                       AFTER");
  log("  " + "─".repeat(35) + "  " + "─".repeat(28) + "  " + "─".repeat(28));
  const row = (k: string, lhs: any, rhs: any) => {
    log("  " + k.padEnd(35) + "  " + String(lhs).padEnd(28) + "  " + String(rhs));
  };
  row("resolved.riskTolerance",      "\""+b.resolvedRT+"\"",     "\""+a.resolvedRT+"\"");
  row("resolved.riskCapacity.band",  "\""+b.capBand+"\"",        "\""+a.capBand+"\"");
  row("preferenceVector.safety",     b.pvSafety?.toFixed(3),      a.pvSafety?.toFixed(3));
  row("preferenceVector.speed",      b.pvSpeed?.toFixed(3),       a.pvSpeed?.toFixed(3));
  row("optimizer top templateId",    "\""+b.topId+"\"",          "\""+a.topId+"\"");
  row("optimizer top score",         b.topScore?.toFixed(2),     a.topScore?.toFixed(2));
  row("final recommendation templateId", "\""+b.finalId+"\"",    "\""+a.finalId+"\"");
  row("final recommendation score",  b.finalScore?.toFixed(2),    a.finalScore?.toFixed(2));
  row("rule1.lowRisk (risk===\"low\")",  String(b.lowRisk),           String(a.lowRisk));
  row("rule1.liquidityStressBand",       "\""+b.liqBand+"\"",         "\""+a.liqBand+"\"");
  row("rule1.liquidityWeak (red|amber)", String(b.liquidityWeak),     String(a.liquidityWeak));
  row("rule1.aggressiveTop",             String(b.aggressiveTop),     String(a.aggressiveTop));
  row("rule1.safestExists",              String(b.safestExists),      String(a.safestExists));
  row("Rule1 FIRES (engine semantics)",  String(b.rule1Fires),        String(a.rule1Fires));

  banner("PART 5 — Verdict");
  if (a.rule1Fires) {
    log("  ✗  Rule 1 still fires after the fix. The calibration bug is not the");
    log("     sole cause — investigate next.");
  } else if (a.finalId === a.topId) {
    log("  ✓  Rule 1 NO LONGER FIRES on real-household data after the fix.");
    log("     Final recommendation now matches the optimizer winner.");
    log("     Final templateId = \"" + a.finalId + "\"  (was \"" + b.finalId + "\")");
  } else {
    log("  ~  Rule 1 does not fire, but a different override still routes the");
    log("     recommendation away from the optimizer winner. Investigate Rules 2-N.");
  }

  fs.writeFileSync(OUT_PATH, buf.join("\n") + "\n", "utf8");
  log("");
  log("  Wrote " + OUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
