/**
 * V3 — Behavioural Priorities Test Suite
 *
 * Proves that the 11-slider behavioural-priorities overlay:
 *   1. Is a strict no-op when every slider is at its neutral value (5).
 *   2. Renormalises convex weights to sum to 1.0 in every configuration.
 *   3. Re-weights weights directionally:
 *        - high liquidity slider raises the liquidity weight
 *        - high fireSpeed slider raises the fire weight
 *        - high sleepAtNight slider raises survival weight + penalties
 *        - high leverageTolerance slider lowers the leverage penalty
 *   4. End-to-end: with the real engine, priorities shift the ranking when
 *      they are extreme — same Monte Carlo math, different scoring weights.
 *
 * Run with:  tsx script/test-behavioural-priorities.ts
 * Exit 0 on all pass, 1 on any failure.
 */

import {
  applyPrioritiesToWeights,
  DEFAULT_PRIORITIES,
  PROFILE_REGISTRY,
  isDefaultPriorities,
  type BehaviouralPriorities,
} from "../client/src/lib/scenarioV2/registry";
import { generateQuickDecisionCandidates } from "../client/src/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; process.stdout.write(`  ✓ ${name}\n`); }
  else { fail++; process.stdout.write(`  ✗ ${name}${detail ? `  — ${detail}` : ""}\n`); }
}
function section(n: string) { process.stdout.write(`\n${n}\n`); }

// ─── healthy fixture for end-to-end runs ────────────────────────────────────
function healthy(): DashboardInputs {
  return {
    snapshot: {
      owner_id: "test-priorities",
      cash: 80_000,
      savings_cash: 200_000,
      emergency_cash: 80_000,
      other_cash: 40_000,
      offset_balance: 0,
      ppor: 1_510_000,
      mortgage: 800_000,
      mortgage_rate: 6.5,
      mortgage_term_years: 30,
      other_debts: 0,
      stocks: 200_000,
      crypto: 30_000,
      ppor_value: 1_510_000,
      roham_super_balance: 200_000,
      fara_super_balance: 150_000,
      roham_monthly_income: 14_000,
      fara_monthly_income: 7_940,
      rental_income_total: 0,
      other_income: 0,
      monthly_expenses: 14_000,
      expenses_includes_debt: true,
    },
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: "2026-05-16",
  } as any;
}

(async () => {
  const base = PROFILE_REGISTRY.balanced.weights;

  // ─── 1. neutral → identity ─────────────────────────────────────────────────
  section("1. Default priorities behave as identity");
  {
    const w = applyPrioritiesToWeights(base, DEFAULT_PRIORITIES);
    const same = (Object.keys(base) as (keyof typeof base)[]).every(k =>
      Math.abs((w as any)[k] - (base as any)[k]) < 1e-9
    );
    assert("Neutral priorities produce identical ScoreWeights", same);
    assert("isDefaultPriorities() returns true for the default", isDefaultPriorities(DEFAULT_PRIORITIES));
  }

  // ─── 2. renormalisation ────────────────────────────────────────────────────
  section("2. Convex weights renormalise to 1.0 across all configurations");
  {
    const configs: BehaviouralPriorities[] = [
      { ...DEFAULT_PRIORITIES, liquidity: 10 },
      { ...DEFAULT_PRIORITIES, fireSpeed: 10, growth: 10 },
      { ...DEFAULT_PRIORITIES, sleepAtNight: 10, leverageTolerance: 1 },
      { ...DEFAULT_PRIORITIES, safety: 10, growth: 1 },
      // extreme corner — every slider maxed
      Object.fromEntries(Object.keys(DEFAULT_PRIORITIES).map(k => [k, 10])) as BehaviouralPriorities,
      // extreme corner — every slider at 1
      Object.fromEntries(Object.keys(DEFAULT_PRIORITIES).map(k => [k, 1])) as BehaviouralPriorities,
    ];
    for (const cfg of configs) {
      const w = applyPrioritiesToWeights(base, cfg);
      const sum = w.survival + w.liquidity + w.riskAdjusted + w.fire + w.terminalNw;
      assert(`Convex sum ≈ 1.0 for ${JSON.stringify(cfg).slice(0, 60)}…`, Math.abs(sum - 1.0) < 1e-6, `sum=${sum.toFixed(6)}`);
      assert(`All convex weights ≥ 0`, w.survival >= 0 && w.liquidity >= 0 && w.riskAdjusted >= 0 && w.fire >= 0 && w.terminalNw >= 0);
    }
  }

  // ─── 3. directional re-weighting ──────────────────────────────────────────
  section("3. Sliders affect weights in the expected direction");
  {
    const liqHi = applyPrioritiesToWeights(base, { ...DEFAULT_PRIORITIES, liquidity: 10 });
    assert("High liquidity slider raises liquidity weight", liqHi.liquidity > base.liquidity);

    const fireHi = applyPrioritiesToWeights(base, { ...DEFAULT_PRIORITIES, fireSpeed: 10 });
    assert("High fireSpeed slider raises fire weight", fireHi.fire > base.fire);

    const sleepHi = applyPrioritiesToWeights(base, { ...DEFAULT_PRIORITIES, sleepAtNight: 10 });
    assert("High sleepAtNight slider raises survival weight", sleepHi.survival > base.survival);
    assert("High sleepAtNight slider raises leverage penalty", sleepHi.leveragePenalty > base.leveragePenalty);

    const levTol = applyPrioritiesToWeights(base, { ...DEFAULT_PRIORITIES, leverageTolerance: 10 });
    assert("High leverageTolerance slider lowers leverage penalty", levTol.leveragePenalty < base.leveragePenalty);

    const growthLo = applyPrioritiesToWeights(base, { ...DEFAULT_PRIORITIES, growth: 1 });
    assert("Low growth slider lowers terminalNw weight (renormalised)", growthLo.terminalNw < base.terminalNw);
  }

  // ─── 4. end-to-end — priorities re-shape ranking ───────────────────────────
  section("4. End-to-end: priorities re-shape the ranking under the real engine");
  {
    const common = {
      dashboardInputs: healthy(),
      question: { kind: "deploy_capital" as const, capital: 75_000 },
      horizonYears: 15,
      household: { dependants: 0, incomeVolatility: 0.15 },
      simulationCount: 80,
      taxContext: {
        annualGrossIncome: (14_000 + 7_940) * 12,
        hasHelpDebt: false,
        hasPrivateHospitalCover: true,
      },
    };
    const neutral = await generateQuickDecisionCandidates({
      ...common,
      behaviouralPriorities: DEFAULT_PRIORITIES,
    });
    const liqHeavy = await generateQuickDecisionCandidates({
      ...common,
      behaviouralPriorities: { ...DEFAULT_PRIORITIES, liquidity: 10, safety: 10, fireSpeed: 1, growth: 1 },
    });
    const growthHeavy = await generateQuickDecisionCandidates({
      ...common,
      behaviouralPriorities: { ...DEFAULT_PRIORITIES, growth: 10, fireSpeed: 10, liquidity: 1, safety: 1, leverageTolerance: 9 },
    });

    assert(
      "Engine returns ranked output for each priority configuration",
      neutral.ranked.length > 0 && liqHeavy.ranked.length > 0 && growthHeavy.ranked.length > 0,
    );

    assert(
      "Engine echoes behaviouralPriorities in the output",
      JSON.stringify(liqHeavy.behaviouralPriorities) !== JSON.stringify(growthHeavy.behaviouralPriorities),
    );

    assert(
      "prioritiesActive flag is true when sliders are non-default",
      liqHeavy.prioritiesActive === true && growthHeavy.prioritiesActive === true,
    );
    assert(
      "prioritiesActive flag is false when sliders are default",
      neutral.prioritiesActive === false,
    );

    // The basePlan hash should match across runs because the underlying
    // deterministic math (Monte Carlo, serviceability, basePlan) is unchanged.
    assert(
      "basePlanHash is stable across priority configurations (math unchanged)",
      neutral.basePlanHash === liqHeavy.basePlanHash && liqHeavy.basePlanHash === growthHeavy.basePlanHash,
    );

    // The ranking order should differ between extreme configurations, or at
    // minimum the scores should not all match. We accept either a different
    // ordering of the first three ids OR a non-trivial composite-score gap on
    // shared ids.
    const neutralTop = neutral.ranked.slice(0, 3).map(c => c.id).join("|");
    const liqTop     = liqHeavy.ranked.slice(0, 3).map(c => c.id).join("|");
    const growthTop  = growthHeavy.ranked.slice(0, 3).map(c => c.id).join("|");
    const allSame = neutralTop === liqTop && liqTop === growthTop;
    if (allSame) {
      // Fall back to score-gap check on the same set of top-3 candidates.
      const sample = neutral.ranked.slice(0, 3).map(c => c.id);
      const score = (out: typeof neutral, id: string) =>
        out.ranked.find(r => r.id === id)?.score.score ?? 0;
      const meanAbsGap =
        sample.reduce(
          (s, id) => s + Math.abs(score(liqHeavy, id) - score(growthHeavy, id)),
          0,
        ) / sample.length;
      assert(
        "Extreme priority shifts move composite scores by >1pt on shared candidates",
        meanAbsGap > 1.0,
        `mean |Δscore|=${meanAbsGap.toFixed(2)}`,
      );
    } else {
      assert(
        "Extreme priority shifts re-order the top three candidates",
        true,
      );
    }
  }

  process.stdout.write(`\n${pass} pass / ${fail} fail\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  process.stderr.write(`FATAL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
