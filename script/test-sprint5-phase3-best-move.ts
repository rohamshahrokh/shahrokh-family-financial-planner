/**
 * test-sprint5-phase3-best-move.ts
 *
 * Sprint 5 Phase 3 — Best Move Engine.
 *
 * Verifies the Best Move engine produces:
 *   §1  Highest-ranked candidate is selected           — top of decisionRanking == bestNextAction
 *   §2  Explanation contains runner-up comparison      — whyThisBeatsAlternatives.runnerUp + decisiveFactors
 *   §3  Goal Solver influence                          — goalSolver shortfall threads through ExpectedImpact
 *   §4  Risk Engine influence                          — data_coverage threads into confidenceScore
 *   §5  Monte Carlo confidence influence               — mcConfidence threads into confidenceScore and band
 *   §6  Liquidity Impact surfaced                      — baseline + delta + post-move runway populated
 *   §7  Incomplete / missing optional data handling    — engine returns result, marks trace.incomplete
 *   §8  Deterministic output stability                 — byte-identical re-run
 *   §9  No hardcoded household fallback                — empty ledger ⇒ hold-current-path baseline only
 *   §10 Stable output for same inputs across calls     — repeat-call equivalence
 *
 * Run with:  tsx script/test-sprint5-phase3-best-move.ts
 */

import {
  computeBestMoveSprint5,
  type BestMoveResult,
} from "../client/src/lib/bestMoveEngineSprint5";
import {
  generateDecisionCandidates,
  type CandidateGeneratorInputs,
  type CandidateGeneratorOutputs,
  type DecisionCandidate,
} from "../client/src/lib/decisionCandidates";
import {
  rankDecisionCandidates,
  DEFAULT_RANKING_WEIGHTS,
} from "../client/src/lib/decisionRanking";
import { solveGoalGap } from "../client/src/lib/goalSolver";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { MonteCarloResult } from "../client/src/lib/forecastStore";
import type { RiskRadarResult } from "../client/src/lib/riskEngine";

let passed = 0;
let failed = 0;
function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(
      `  FAIL  ${label}` +
        (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""),
    );
  }
}
function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

/* ─── Fixture — realistic Shahrokh-family household ──────────────────────── */

const FIXTURE_SNAPSHOT = {
  ppor: 1_510_000,
  cash: 40_000,
  savings_cash: 0,
  emergency_cash: 0,
  other_cash: 0,
  offset_balance: 222_000,
  roham_super_balance: 49_500,
  fara_super_balance: 38_500,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  other_assets: 0,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  other_income: 0,
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const SETTLED_IP = {
  id: "ip-1",
  type: "investment",
  lifecycle_status: "settled",
  settlement_date: "2024-06-01",
  purchase_date: "2024-06-01",
  current_value: 720_000,
  loan_amount: 540_000,
  interest_rate: 6.15,
  loan_term: 30,
  loan_type: "PI",
  weekly_rent: 650,
  vacancy_rate: 4,
  management_fee: 7,
  name: "Brisbane IP",
};

const FIXTURE_INPUTS: DashboardInputs = {
  snapshot: FIXTURE_SNAPSHOT,
  properties: [SETTLED_IP],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-24",
};

const FIXTURE_MC: MonteCarloResult = {
  p10: 100, p25: 200, median: 500, p75: 800, p90: 1000,
  prob_ff: 80,
  prob_3m: 60, prob_5m: 40, prob_10m: 20,
  prob_neg_cf: 5, prob_cash_shortfall: 5,
  lowest_cash_median: 10_000, highest_risk_year: 2030,
  biggest_risk_driver: "test",
  fan_data: [],
  key_risks: [],
  recommended_actions: [],
  ran_at: "2026-05-24T00:00:00Z",
  simulations: 1000,
};

const FIXTURE_RISK_FULL: RiskRadarResult = {
  overall_score: 72,
  overall_level: "amber",
  overall_label: "Moderate Risk",
  categories: [],
  top_risks: [],
  top_mitigations: [],
  alerts: [],
  radar_data: [],
  fragility_index: 28,
  data_coverage: "full",
};

console.log("\nSprint 5 Phase 3 — Best Move Engine\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Highest-ranked candidate is selected
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Highest-ranked candidate is selected");
{
  const candidates = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
  });
  const ranked = rankDecisionCandidates({ candidateOutputs: candidates });
  const out = computeBestMoveSprint5({ rankingOutputs: ranked });

  ok(
    "bestNextAction.id == ranked.recommended.id",
    out.bestNextAction.id === ranked.recommended!.candidate.id,
    { best: out.bestNextAction.id, recommended: ranked.recommended!.candidate.id },
  );
  ok(
    "bestNextAction.score == recommended.score",
    near(out.bestNextAction.score, ranked.recommended!.score, 1e-5),
  );
  ok("bestNextAction.rank == 1", out.bestNextAction.rank === 1);
  ok(
    "trace.candidatesEvaluated == ranked.ranked.length",
    out.trace.candidatesEvaluated === ranked.ranked.length,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Explanation contains runner-up comparison
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Explanation contains runner-up comparison");
{
  const candidates = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
  });
  const out = computeBestMoveSprint5({ candidateOutputs: candidates });

  ok(
    "whyThisBeatsAlternatives.narrative is a non-trivial string",
    typeof out.whyThisBeatsAlternatives.narrative === "string" &&
      out.whyThisBeatsAlternatives.narrative.length > 20,
    out.whyThisBeatsAlternatives.narrative,
  );

  if (candidates.candidates.length > 1) {
    ok(
      "runnerUp present when ≥2 candidates exist",
      out.whyThisBeatsAlternatives.runnerUp !== null,
    );
    if (out.whyThisBeatsAlternatives.runnerUp) {
      ok(
        "runnerUp scoreMargin = best.score − runnerUp.score",
        near(
          out.whyThisBeatsAlternatives.runnerUp.scoreMargin,
          out.bestNextAction.score - out.whyThisBeatsAlternatives.runnerUp.score,
          1e-5,
        ),
      );
      ok(
        "runnerUp.id differs from best.id",
        out.whyThisBeatsAlternatives.runnerUp.id !== out.bestNextAction.id,
      );
    }
    ok(
      "decisiveFactors populated when runnerUp present",
      out.whyThisBeatsAlternatives.decisiveFactors.length > 0,
      out.whyThisBeatsAlternatives.decisiveFactors,
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Goal Solver influence
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Goal Solver influence on best move");
{
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const target = Math.round(head.netWorth * 1.5);
  const goal = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2046-05-24",
  });
  const cands = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
    goalSolverOutputs: goal,
  });
  const withGoal = computeBestMoveSprint5({ candidateOutputs: cands });

  ok(
    "goal-solver supplied ⇒ trace.goalSolverConsumed true",
    withGoal.trace.goalSolverConsumed === true,
  );

  // At least one candidate moves goalShortfall (non-null) when goal solver
  // produced a shortfall.
  const anyHasGoalDelta = cands.candidates.some(
    c => c.projection.deltaGoalShortfall != null,
  );
  ok(
    "goal-shortfall delta exposed when goal solver runs with shortfall",
    anyHasGoalDelta,
  );

  // Without goal solver target, expected impact should still resolve.
  const cands0 = generateDecisionCandidates({ canonicalLedger: FIXTURE_INPUTS });
  const noGoal = computeBestMoveSprint5({ candidateOutputs: cands0 });
  ok(
    "best move resolves with no explicit goal targets",
    !!noGoal.bestNextAction.id,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Risk Engine influence on confidence
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Risk Engine influence on confidence");
{
  const cands = generateDecisionCandidates({ canonicalLedger: FIXTURE_INPUTS });
  const noRisk = computeBestMoveSprint5({ candidateOutputs: cands });
  const fullRisk = computeBestMoveSprint5({
    candidateOutputs: cands,
    riskOutputs: FIXTURE_RISK_FULL,
  });

  ok(
    "full-coverage risk surface yields higher (or equal) confidence",
    fullRisk.confidenceScore.value >= noRisk.confidenceScore.value,
    {
      noRisk: noRisk.confidenceScore.value,
      fullRisk: fullRisk.confidenceScore.value,
    },
  );
  ok(
    "confidence components reflect dataCoverage",
    fullRisk.confidenceScore.components.dataCoverage === "full",
  );
  ok(
    "no risk supplied ⇒ trace.riskSupplied false",
    noRisk.trace.riskSupplied === false,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Monte Carlo confidence influence
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Monte Carlo confidence influence");
{
  const cands = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
  });
  const out = computeBestMoveSprint5({
    candidateOutputs: cands,
    monteCarloOutputs: FIXTURE_MC,
  });

  ok(
    "mcConfidence threaded into riskImpact when MC supplied",
    out.riskImpact.mcConfidence != null,
    out.riskImpact.mcConfidence,
  );
  ok(
    "confidenceScore.components.mcConfidence populated",
    out.confidenceScore.components.mcConfidence != null,
  );

  // Engine without MC must have null mc in confidence components.
  const noMcCands = generateDecisionCandidates({ canonicalLedger: FIXTURE_INPUTS });
  const noMc = computeBestMoveSprint5({ candidateOutputs: noMcCands });
  ok(
    "no MC ⇒ confidenceScore.components.mcConfidence == null",
    noMc.confidenceScore.components.mcConfidence === null,
  );
  ok(
    "no MC ⇒ trace.monteCarloSupplied false",
    noMc.trace.monteCarloSupplied === false,
  );

  // Confidence band lookup is deterministic for fabricated MC values.
  // Use a synthetic ranking with controlled mcConfidence so we can pin band.
  const synth = stubCandidate("synth-best", {
    deltaNetWorth: 100_000,
    mcConfidence: 0.95,
  });
  const synthOther = stubCandidate("synth-runner", {
    deltaNetWorth: 50_000,
    mcConfidence: 0.95,
  });
  const synthGen: CandidateGeneratorOutputs = {
    candidates: [synth, synthOther],
    incomplete: false,
    trace: cands.trace,
  };
  const synthOut = computeBestMoveSprint5({
    candidateOutputs: synthGen,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK_FULL,
  });
  ok(
    "high MC + full coverage ⇒ confidence band high or moderate",
    synthOut.confidenceScore.band === "high" ||
      synthOut.confidenceScore.band === "moderate",
    synthOut.confidenceScore,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Liquidity Impact surfaced
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Liquidity Impact surfaced");
{
  const cands = generateDecisionCandidates({ canonicalLedger: FIXTURE_INPUTS });
  const out = computeBestMoveSprint5({ candidateOutputs: cands });

  ok(
    "baselineRunwayMonths matches candidate generator trace",
    near(
      out.liquidityImpact.baselineRunwayMonths,
      cands.trace.baselineLiquidityMonths,
      0.01,
    ),
    {
      best: out.liquidityImpact.baselineRunwayMonths,
      gen: cands.trace.baselineLiquidityMonths,
    },
  );
  ok(
    "postMoveRunwayMonths == baseline + delta",
    near(
      out.liquidityImpact.postMoveRunwayMonths,
      out.liquidityImpact.baselineRunwayMonths +
        out.liquidityImpact.deltaRunwayMonths,
      0.01,
    ),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Incomplete / missing optional data handling
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Incomplete / missing optional data handling");
{
  // No optional engine outputs at all — engine must still return a result.
  const out = computeBestMoveSprint5({ canonicalLedger: FIXTURE_INPUTS });
  ok("engine returns a result with only canonicalLedger", !!out.bestNextAction.id);
  ok(
    "trace.monteCarloSupplied == false when MC omitted",
    out.trace.monteCarloSupplied === false,
  );
  ok(
    "trace.riskSupplied == false when risk omitted",
    out.trace.riskSupplied === false,
  );

  // Empty ledger should not throw.
  const empty: DashboardInputs = {
    snapshot: {},
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: "2026-05-24",
  };
  const emptyOut = computeBestMoveSprint5({ canonicalLedger: empty });
  ok(
    "engine returns a result for empty ledger (no throw)",
    !!emptyOut.bestNextAction.id,
  );
  // With empty ledger, only the hold-current-path candidate is generated,
  // so the engine MUST recommend the baseline (no fabricated household
  // values).
  ok(
    "empty ledger ⇒ best move is hold-current-path baseline",
    emptyOut.bestNextAction.isHoldBaseline === true,
    emptyOut.bestNextAction.kind,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Deterministic output stability
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Deterministic output stability");
{
  const cands = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
  });
  const a = computeBestMoveSprint5({
    candidateOutputs: cands,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK_FULL,
  });
  const b = computeBestMoveSprint5({
    candidateOutputs: cands,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK_FULL,
  });
  ok(
    "byte-identical engine result for same inputs",
    JSON.stringify(a) === JSON.stringify(b),
  );

  const c = computeBestMoveSprint5({ canonicalLedger: FIXTURE_INPUTS });
  const d = computeBestMoveSprint5({ canonicalLedger: FIXTURE_INPUTS });
  ok(
    "byte-identical engine result when generating internally",
    JSON.stringify(c) === JSON.stringify(d),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — No hardcoded household fallback
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  No hardcoded household fallback");
{
  // An empty ledger must NOT inject default monthly income / NW / surplus
  // and offer a fabricated recommendation. Verified by re-using the empty
  // ledger from §7 and asserting the recommendation is the deterministic
  // hold-current-path baseline.
  const empty: DashboardInputs = {
    snapshot: {},
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: "2026-05-24",
  };
  const emptyOut = computeBestMoveSprint5({ canonicalLedger: empty });
  ok(
    "no buy-IP recommendation from empty ledger (no fabricated income)",
    emptyOut.bestNextAction.kind !== "buy-investment-property",
  );
  ok(
    "expectedImpact deltaNetWorth == 0 on empty ledger",
    emptyOut.expectedImpact.deltaNetWorth === 0,
  );
  ok(
    "expectedImpact deltaMonthlySurplus == 0 on empty ledger",
    emptyOut.expectedImpact.deltaMonthlySurplus === 0,
  );

  // Independently: the engine's weight surface defaults to DEFAULT_RANKING_WEIGHTS,
  // and the trace must carry those exact weights — no fabricated overrides.
  ok(
    "default weights propagated verbatim into trace",
    JSON.stringify(emptyOut.trace.weightsUsed) ===
      JSON.stringify(DEFAULT_RANKING_WEIGHTS),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — Stable output for same inputs across calls
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10 Stable output for same inputs across calls");
{
  // Run the engine three times with the same canonical inputs and assert
  // the BestNextAction id and the score are stable.
  const a = computeBestMoveSprint5({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK_FULL,
  });
  const b = computeBestMoveSprint5({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK_FULL,
  });
  const c = computeBestMoveSprint5({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK_FULL,
  });
  ok("stable id across calls", a.bestNextAction.id === b.bestNextAction.id && b.bestNextAction.id === c.bestNextAction.id);
  ok(
    "stable score across calls",
    near(a.bestNextAction.score, b.bestNextAction.score, 1e-6) &&
      near(b.bestNextAction.score, c.bestNextAction.score, 1e-6),
  );
  ok(
    "stable confidenceScore across calls",
    near(a.confidenceScore.value, b.confidenceScore.value, 1e-6) &&
      near(b.confidenceScore.value, c.confidenceScore.value, 1e-6),
  );
}

/* ─── Synthetic helpers ─────────────────────────────────────────────────── */

interface StubOverrides {
  deltaNetWorth?: number;
  deltaPassiveIncome?: number;
  deltaMonthlySurplus?: number;
  deltaMonthlyDebtService?: number;
  deltaLiquidityMonths?: number;
  deltaFireProgress?: number;
  deltaGoalShortfall?: number | null;
  executionRisk?: number;
  liquidityRisk?: number;
  mcConfidence?: number | null;
}

function stubCandidate(id: string, ov: StubOverrides = {}): DecisionCandidate {
  return {
    id,
    kind: "hold-current-path",
    label: id,
    rationale: "synthetic candidate for best-move test",
    isBaseline: false,
    magnitude: 0,
    projection: {
      deltaNetWorth: ov.deltaNetWorth ?? 0,
      deltaPassiveIncome: ov.deltaPassiveIncome ?? 0,
      deltaMonthlySurplus: ov.deltaMonthlySurplus ?? 0,
      deltaMonthlyDebtService: ov.deltaMonthlyDebtService ?? 0,
      deltaLiquidityMonths: ov.deltaLiquidityMonths ?? 0,
      deltaFireProgress: ov.deltaFireProgress ?? 0,
      deltaGoalShortfall: ov.deltaGoalShortfall ?? null,
    },
    risk: {
      executionRisk: ov.executionRisk ?? 0,
      liquidityRisk: ov.liquidityRisk ?? 0,
      mcConfidence: ov.mcConfidence ?? null,
    },
    incomplete: false,
  };
}

console.log(
  `\nResults: ${passed} passed, ${failed} failed.${failed > 0 ? "  (failed)" : ""}\n`,
);
if (failed > 0) process.exit(1);

// Silence unused-import warning for BestMoveResult — used for type-checking.
const _typeProbe: BestMoveResult | undefined = undefined;
void _typeProbe;
