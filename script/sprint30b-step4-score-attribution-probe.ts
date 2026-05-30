/**
 * Sprint 30B — Step 4 — Decision Engine Score Attribution Probe
 *
 * For every template's winning candidate, dump the FULL score breakdown:
 *   - axis name + source engine + source selector
 *   - rawValue, normalisedValue, weight, contribution
 *   - penalties applied
 *   - the engine inputs that feed each axis
 */
import path from "node:path";
import fs from "node:fs";

import { runGoalLabPlan } from "../client/src/lib/goalLab/orchestrator";
import { buildCanonicalGoalProfile, type GoalProfileOverrides } from "../client/src/lib/goalLab/canonicalGoalProfile";
import { normalizeFireSettingsRow } from "../client/src/lib/fireGoalCanonical";
import { PROFILE_REGISTRY } from "../client/src/lib/scenarioV2/registry/scoring";
import type { DashboardInputs } from "../client/src/types/dashboard";

const OUT = path.resolve(process.cwd(), "sprint30b_step4_score_attribution.txt");
const lines: string[] = [];
const log = (s: string = ""): void => { lines.push(s); console.log(s); };
const banner = (title: string): void => {
  const line = "─".repeat(110);
  log("\n" + line);
  log("  " + title);
  log(line);
};

function fmt(n: number | null | undefined, digits = 3): string {
  return n == null || !Number.isFinite(n) ? "—" : (n as number).toFixed(digits);
}
function fmtMoney(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : "$" + Math.round(n as number).toLocaleString();
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  return n == null || !Number.isFinite(n) ? "—" : ((n as number) * 100).toFixed(digits) + "%";
}

// Mirror of Step 3's demoLedger — same financial profile so we can compare apples-to-apples.
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
  preferredEngine: "auto",
  riskTolerance: "auto",
  constraintOverride: "auto",
};

async function main() {
  banner("Sprint 30B — Step 4 — Decision Engine Score Attribution Audit");
  const ledger = demoLedger();
  const profile = buildCanonicalGoalProfile(demoFireRow(), ledger, AUTO_OVERRIDES);

  log(`  profile.resolved.preferredEngine = ${profile.resolved.preferredEngine}`);
  log(`  profile.resolved.riskTolerance   = ${profile.resolved.riskTolerance}`);
  log(`  profile.resolved.primaryConstraint = ${profile.resolved.primaryConstraint}`);
  log(`  fire.targetFireAge = ${profile.fire.targetFireAge}`);
  log(`  fire.currentAge    = ${profile.fire.currentAge}`);
  log(`  fire.swrPct        = ${profile.fire.swrPct}`);

  log("\n  Running runGoalLabPlan() (publishToAdapter=false, 200 sims)…");
  const t0 = performance.now();
  const plan = await runGoalLabPlan({
    ledger,
    profile,
    horizonYears: 25,
    simulationCount: 200,
    publishToAdapter: false,
  });
  log(`  Done in ${Math.round(performance.now() - t0)} ms — ${plan.rankedScenarios.length} ranked scenarios.`);

  // ─── 1. Profile registry dump ──────────────────────────────────────────────
  banner("1. Investor profile registry — weight vectors that turn axes into contributions");
  log(`  Source file: client/src/lib/scenarioV2/registry/scoring.ts (PROFILE_REGISTRY).`);
  for (const spec of Object.values(PROFILE_REGISTRY)) {
    const w = spec.weights;
    log(`  ${spec.id.padEnd(15)}  conv: surv=${w.survival.toFixed(2)} liq=${w.liquidity.toFixed(2)} riskAdj=${w.riskAdjusted.toFixed(2)} fire=${w.fire.toFixed(2)} terminalNw=${w.terminalNw.toFixed(2)}  ;  pen: refi=${w.refinancePenalty.toFixed(2)} lev=${w.leveragePenalty.toFixed(2)}`);
  }

  // ─── 2. Axis source map ────────────────────────────────────────────────────
  banner("2. Score-axis source map");
  const axisSources: Record<string, { engine: string; selector: string }> = {
    survivalProbability: {
      engine: "MonteCarloEngine",
      selector: "candidateGenerator.ts:1352  survivalProbability({ totalPaths=simulationCount, defaultedPaths=defaultProb*N, forcedSalePaths=liquidityStressProb*N })",
    },
    liquidityFactor: {
      engine: "Risk-band aggregator (derived from MC)",
      selector: "candidateGenerator.ts:1359  min(bands.liquidityRatioMin / bands.liquidityFloor, 1)",
    },
    riskAdjustedReturn: {
      engine: "MC NW fan + downside()",
      selector: "candidateGenerator.ts:1374  riskAdjustedReturn({ cagr=(P50/initial)^(1/y)-1, downside=downside(P10,P50), sequenceRisk=sequenceDispersion.cv })",
    },
    fireAcceleration: {
      engine: "fireCoverage() formula (synth from MC NW fan)",
      selector: "candidateGenerator.ts:1381  (candidateFire − baseFire) × 5,  invested≈P50×0.5, propertyEquity≈P50×0.3, swr=0.04, expenses=12×surplus or $80k",
    },
    terminalNetWorth: {
      engine: "MC NW fan, final P50",
      selector: "candidateGenerator.ts:1404  result.netWorthFan[last].p50",
    },
    worstInvestmentLvr: {
      engine: "Risk-band aggregator",
      selector: "candidateGenerator.ts:1406  bands.worstLvr  (weight=0 by design — surfaces via leveragePenalty)",
    },
  };
  for (const [a, src] of Object.entries(axisSources)) {
    log(`  ${a.padEnd(22)}  engine: ${src.engine}`);
    log(`  ${" ".repeat(22)}  selector: ${src.selector}`);
  }

  // ─── 3. Per-template per-axis full attribution ─────────────────────────────
  banner("3. Per-template winner — full score decomposition");
  for (const s of plan.rankedScenarios) {
    log("─".repeat(110));
    log(`  Template: ${s.templateId.padEnd(28)}  →  Winner: ${s.winner?.id ?? "—"}`);
    if (!s.winner) continue;
    log(`  Score: ${fmt(s.winner.score.score, 2)}   BaseScore (pre-penalty): ${fmt(s.winner.score.baseScore, 2)}`);
    log(`  Investor profile applied: "${(s as any).raw?.investorProfile ?? "(default balanced)"}"`);

    log("");
    log("  axis                    | rawValue        | normalised | weight  | contribution | source engine");
    log("  " + "-".repeat(108));
    for (const b of s.winner.score.breakdown ?? []) {
      const src = axisSources[b.axis] ?? { engine: "?", selector: "?" };
      const rawStr =
        b.axis === "terminalNetWorth" ? fmtMoney(b.rawValue) :
        b.axis === "fireAcceleration" ? `${fmt(b.rawValue, 2)}y` :
        (b.axis === "worstInvestmentLvr" || b.axis === "survivalProbability" || b.axis === "liquidityFactor")
          ? fmtPct(b.rawValue) :
        fmt(b.rawValue, 4);
      log(
        "  " + b.axis.padEnd(22) + "  | " +
        rawStr.padEnd(15) + " | " +
        fmt(b.normalisedValue, 4).padEnd(10) + " | " +
        fmt(b.weight, 2).padEnd(6) + "  | " +
        fmt(b.contribution, 3).padEnd(12) + " | " +
        src.engine,
      );
    }
    log("\n  Penalties:");
    for (const p of s.winner.score.penalties ?? []) {
      log(`    [${p.id}]  band=${p.band ?? "n/a"}  value=${p.value != null ? fmt(p.value, 3) : "n/a"}  magnitude=−${fmt(p.magnitude, 2)} pts  reason=${p.reason}`);
    }

    const r: any = s.winner.result;
    log("\n  Engine inputs that produced these rawValues:");
    log(`    simulationCount               = ${r.simulationCount}`);
    log(`    defaultProbability            = ${fmtPct(r.defaultProbability)}   (defaultedPaths ≈ ${Math.round((r.defaultProbability ?? 0) * (r.simulationCount ?? 0))})`);
    log(`    liquidityStressProbability    = ${fmtPct(r.liquidityStressProbability)}   (forcedSalePaths ≈ ${Math.round((r.liquidityStressProbability ?? 0) * (r.simulationCount ?? 0))})`);
    log(`    sequenceDispersion.cv         = ${fmt(r.sequenceDispersion?.cv, 4)}`);
    log(`    initialNetWorth               = ${fmtMoney(r.initialNetWorth)}`);
    const fan = r.netWorthFan ?? [];
    const last = fan[fan.length - 1];
    log(`    netWorthFan[last] P10/P50/P90 = ${fmtMoney(last?.p10)} / ${fmtMoney(last?.p50)} / ${fmtMoney(last?.p90)}`);
    log(`    reconciledMonthlySurplus      = ${fmtMoney(r.reconciledMonthlySurplus)}`);
    log(`    dashboardMonthlySurplus       = ${fmtMoney(r.dashboardMonthlySurplus)}`);
    log("");
  }

  // ─── 4. Axis-level activity audit ──────────────────────────────────────────
  banner("4. Axis activity audit across all winners");
  const axisIds = ["survivalProbability", "liquidityFactor", "riskAdjustedReturn", "fireAcceleration", "terminalNetWorth", "worstInvestmentLvr"] as const;
  for (const axis of axisIds) {
    const raws: number[] = [];
    const norms: number[] = [];
    const contribs: number[] = [];
    const weights: number[] = [];
    for (const s of plan.rankedScenarios) {
      const b = s.winner?.score?.breakdown?.find((x: any) => x.axis === axis);
      if (!b) continue;
      if (Number.isFinite(b.rawValue)) raws.push(b.rawValue);
      if (Number.isFinite(b.normalisedValue)) norms.push(b.normalisedValue);
      if (Number.isFinite(b.weight)) weights.push(b.weight);
      if (Number.isFinite(b.contribution)) contribs.push(b.contribution);
    }
    if (raws.length === 0) {
      log(`  ${axis.padEnd(22)}  STATUS: MISSING from every breakdown`);
      continue;
    }
    const mn = Math.min(...raws), mx = Math.max(...raws);
    const nmn = Math.min(...norms), nmx = Math.max(...norms);
    const cmn = Math.min(...contribs), cmx = Math.max(...contribs);
    const w0 = weights[0] ?? 0;
    let status: string;
    if (w0 === 0) status = "WEIGHT=0 — intentional (penalty-only axis)";
    else if (nmx === 0) status = "NORMALISED=0 on every row — axis live but pinned to zero by normaliser bounds";
    else if (Math.abs(nmx - nmn) < 1e-9 && Math.abs(nmx - 0.5) < 1e-9) status = "NEUTRAL — norm=0.5 on every row";
    else if (cmx - cmn < 0.01) status = "ACTIVE but FLAT (raw outputs barely vary across candidates)";
    else status = "ACTIVE and DIFFERENTIATING";
    const rawShown =
      axis === "terminalNetWorth" ? `${fmtMoney(mn)}..${fmtMoney(mx)}` :
      axis === "fireAcceleration" ? `${fmt(mn, 2)}y..${fmt(mx, 2)}y` :
      (axis === "survivalProbability" || axis === "liquidityFactor" || axis === "worstInvestmentLvr")
        ? `${fmtPct(mn)}..${fmtPct(mx)}` :
      `${fmt(mn, 4)}..${fmt(mx, 4)}`;
    log(`  ${axis.padEnd(22)}  raw[${rawShown}]   norm[${fmt(nmn, 3)}..${fmt(nmx, 3)}]   weight=${fmt(w0, 2)}   contrib[${fmt(cmn, 3)}..${fmt(cmx, 3)}]   →  ${status}`);
  }

  // ─── 5. fireAcceleration deep-dive ─────────────────────────────────────────
  banner("5. fireAcceleration deep-dive — why contribution = 0 across the board?");
  log("  Formula: rawValue = (candidateFire − baseFire) × 5   ;   norm = clamp01((years + 5) / 10)");
  log("  → norm = 0 requires `years` ≤ −5  ⇔  candidateFire ≤ baseFire − 1.0  (coverage gap of 1.0).");
  log("");
  for (const s of plan.rankedScenarios) {
    const fa = s.winner?.score?.breakdown?.find((b: any) => b.axis === "fireAcceleration");
    if (!fa) continue;
    log(`  ${s.templateId.padEnd(28)}  rawValue=${fmt(fa.rawValue, 3)}y  norm=${fmt(fa.normalisedValue, 3)}  weight=${fmt(fa.weight, 2)}  contribution=${fmt(fa.contribution, 3)}`);
  }

  // ─── Persist ───────────────────────────────────────────────────────────────
  banner("Done");
  fs.writeFileSync(OUT, lines.join("\n"));
  log(`\n  wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
