/**
 * test-sprint5-decision-ranking.ts
 *
 * Sprint 5 Phase 2 — Candidate Generator & Decision Ranking Engine.
 *
 * Verifies the canonical engine produces:
 *   §1  Canonical-source guarantees      — no duplicated math, no hardcoded household values
 *   §2  Deterministic ordering           — same inputs → same ranked list
 *   §3  Score breakdown integrity        — score = Σ(component × weight) − penalty (× MC mult.)
 *   §4  Risk / liquidity penalties       — large penalty drops rank
 *   §5  Monte Carlo confidence weighting — low confidence dampens score
 *   §6  Missing / incomplete optional data — engine surfaces incomplete, never fabricates
 *   §7  Stable output for same inputs    — byte-identical re-run
 *   §8  Recommended option + plain-English reasoning
 *
 * Run with:  tsx script/test-sprint5-decision-ranking.ts
 */

import {
  generateDecisionCandidates,
  type CandidateGeneratorInputs,
  type CandidateGeneratorOutputs,
  type DecisionCandidate,
} from "../client/src/lib/decisionCandidates";
import {
  rankDecisionCandidates,
  DEFAULT_RANKING_WEIGHTS,
  type RankingOutput,
} from "../client/src/lib/decisionRanking";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import { computeCanonicalDebtService } from "../client/src/lib/canonicalDebtService";
import { computeCanonicalFire } from "../client/src/lib/canonicalFire";
import { solveGoalGap } from "../client/src/lib/goalSolver";
import type { MonteCarloResult } from "../client/src/lib/forecastStore";

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

const baseInputs = (): CandidateGeneratorInputs => ({
  canonicalLedger: FIXTURE_INPUTS,
});

console.log("\nSprint 5 Phase 2 — Candidate Generator & Decision Ranking Engine\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Canonical-source guarantees
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Canonical-source guarantees (no duplicated math, no hardcoded household values)");
{
  const out = generateDecisionCandidates(baseInputs());
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);

  ok(
    "trace.baseline == canonicalHeadlineMetrics",
    near(out.trace.baseline.netWorth, head.netWorth) &&
      near(out.trace.baseline.monthlySurplus, head.monthlySurplus) &&
      near(out.trace.baseline.passiveIncome, head.passiveIncome),
    {
      tNw: out.trace.baseline.netWorth,
      cNw: head.netWorth,
      tSur: out.trace.baseline.monthlySurplus,
      cSur: head.monthlySurplus,
    },
  );

  ok(
    "SWR used delegates to canonicalFire (not hardcoded)",
    near(out.trace.swrUsed, computeCanonicalFire(FIXTURE_INPUTS).swrPct / 100, 1e-4),
  );

  // The hold-current-path candidate is always present and is baseline.
  const hold = out.candidates.find(c => c.kind === "hold-current-path");
  ok("hold-current-path candidate present", !!hold);
  ok("hold-current-path isBaseline true", hold?.isBaseline === true);
  ok("hold-current-path projection all-zero", hold && allZeroProjection(hold));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Deterministic ordering
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Deterministic ordering");
{
  const g1 = generateDecisionCandidates(baseInputs());
  const g2 = generateDecisionCandidates(baseInputs());
  const r1 = rankDecisionCandidates({ candidateOutputs: g1 });
  const r2 = rankDecisionCandidates({ candidateOutputs: g2 });
  ok(
    "candidate generator deterministic — same ids in same order",
    JSON.stringify(g1.candidates.map(c => c.id)) ===
      JSON.stringify(g2.candidates.map(c => c.id)),
  );
  ok(
    "ranking deterministic — same ranked id sequence",
    JSON.stringify(r1.ranked.map(r => r.candidate.id)) ===
      JSON.stringify(r2.ranked.map(r => r.candidate.id)),
  );
  ok(
    "ranking deterministic — same scores",
    JSON.stringify(r1.ranked.map(r => r.score)) ===
      JSON.stringify(r2.ranked.map(r => r.score)),
  );

  // Tie-break check — synthesise two zero-score candidates to assert stable id ordering.
  const tieG: CandidateGeneratorOutputs = {
    candidates: [
      stubCandidate("z-cand"),
      stubCandidate("a-cand"),
    ],
    incomplete: false,
    trace: g1.trace,
  };
  const tieR = rankDecisionCandidates({ candidateOutputs: tieG });
  ok(
    "tie-break stable on id ascending",
    tieR.ranked[0].candidate.id === "a-cand",
    tieR.ranked.map(r => r.candidate.id),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Score breakdown integrity
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Score breakdown integrity");
{
  const g = generateDecisionCandidates(baseInputs());
  const r = rankDecisionCandidates({ candidateOutputs: g });

  for (const ranked of r.ranked) {
    const upside = ranked.breakdown
      .filter(b =>
        ["netWorth", "passiveIncome", "monthlySurplus", "fireProgress", "goalShortfall"].includes(
          b.dimension,
        ),
      )
      .reduce((s, b) => s + b.contribution, 0);
    const penalty = ranked.breakdown
      .filter(b => b.dimension === "executionRisk" || b.dimension === "liquidityRisk")
      .reduce((s, b) => s + b.contribution, 0);
    const mc = ranked.breakdown.find(b => b.dimension === "mcConfidence");
    const expected = mc ? (upside - penalty) * mc.contribution : upside - penalty;
    ok(
      `score = Σ(upside) − penalty (× MC) for ${ranked.candidate.id}`,
      near(expected, ranked.score, 1e-5),
      { upside, penalty, mc: mc?.contribution, expected, actual: ranked.score },
    );
    // Component weights match the default ranking weights.
    const nw = ranked.breakdown.find(b => b.dimension === "netWorth");
    ok(
      `${ranked.candidate.id}: netWorth weight = DEFAULT_RANKING_WEIGHTS.netWorth`,
      nw?.weight === DEFAULT_RANKING_WEIGHTS.netWorth,
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Risk / liquidity penalties
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Risk / liquidity penalties");
{
  // Build a candidate set with two synthetic candidates: identical upside,
  // different risk profiles. The lower-risk one MUST rank first.
  const safeCand = stubCandidate("synth-safe", {
    deltaNetWorth: 50_000,
    executionRisk: 5,
    liquidityRisk: 5,
  });
  const riskyCand = stubCandidate("synth-risky", {
    deltaNetWorth: 50_000,
    executionRisk: 90,
    liquidityRisk: 90,
  });
  const g: CandidateGeneratorOutputs = {
    candidates: [riskyCand, safeCand],
    incomplete: false,
    trace: generateDecisionCandidates(baseInputs()).trace,
  };
  const r = rankDecisionCandidates({ candidateOutputs: g });
  ok(
    "lower-risk candidate ranked first when upside equal",
    r.ranked[0].candidate.id === "synth-safe",
    r.ranked.map(x => x.candidate.id),
  );
  // Penalty contribution should be non-trivial and signed positive on the
  // risky one (penalty is subtracted, so a positive contribution value
  // means real downward pressure).
  const riskyExec = r.ranked
    .find(x => x.candidate.id === "synth-risky")!
    .breakdown.find(b => b.dimension === "executionRisk")!;
  ok(
    "high execution risk produces material penalty contribution",
    riskyExec.contribution > 0.05,
    riskyExec.contribution,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Monte Carlo confidence weighting
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Monte Carlo confidence weighting");
{
  // Confidence multiplier in [0.5, 1.0]. High confidence preserves the score,
  // low confidence dampens it. Same upside, different MC.
  const high = stubCandidate("mc-high", { deltaNetWorth: 80_000, mcConfidence: 0.95 });
  const low  = stubCandidate("mc-low",  { deltaNetWorth: 80_000, mcConfidence: 0.10 });
  const g: CandidateGeneratorOutputs = {
    candidates: [low, high],
    incomplete: false,
    trace: generateDecisionCandidates(baseInputs()).trace,
  };
  const r = rankDecisionCandidates({ candidateOutputs: g });
  ok(
    "high-confidence candidate ranks first",
    r.ranked[0].candidate.id === "mc-high",
    r.ranked.map(x => x.candidate.id),
  );
  // Score(low) ≈ score(high) × (0.5 + 0.5×0.10) / (0.5 + 0.5×0.95)
  const sHigh = r.ranked.find(x => x.candidate.id === "mc-high")!.score;
  const sLow  = r.ranked.find(x => x.candidate.id === "mc-low")!.score;
  const expectedRatio = (0.5 + 0.5 * 0.10) / (0.5 + 0.5 * 0.95);
  ok(
    "low-confidence score ≈ high × multiplier ratio",
    near(sLow / sHigh, expectedRatio, 1e-3),
    { sHigh, sLow, expectedRatio, observed: sLow / sHigh },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Missing / incomplete optional data
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Missing / incomplete optional data");
{
  // Strip surplus to zero — every contribution-based candidate must surface
  // as incomplete, never fabricated.
  const noSurplusSnapshot = {
    ...FIXTURE_SNAPSHOT,
    monthly_expenses: 32_000, // > combined income → negative surplus
    expenses_includes_debt: true,
  };
  const noSurplusInputs: DashboardInputs = {
    ...FIXTURE_INPUTS,
    snapshot: noSurplusSnapshot,
  };
  const out = generateDecisionCandidates({ canonicalLedger: noSurplusInputs });
  const debtRed = out.candidates.find(c => c.kind === "debt-reduction");
  const offset = out.candidates.find(c => c.kind === "offset-contribution");
  // These candidates SHOULD still be generated but flagged incomplete.
  ok("debt-reduction returned when surplus ≤ 0", !!debtRed);
  ok("debt-reduction flagged incomplete when surplus ≤ 0", debtRed?.incomplete === true);
  ok("offset-contribution flagged incomplete when surplus ≤ 0", offset?.incomplete === true);
  // ETF must be SKIPPED (no surplus to allocate, no proposed override).
  const etf = out.candidates.find(c => c.kind === "etf-investment");
  ok("etf-investment skipped when no surplus and no proposed contribution", !etf);

  // hold-current-path is ALWAYS present, even with no income data.
  const empty: CandidateGeneratorInputs = {
    canonicalLedger: {
      snapshot: {},
      properties: [],
      stocks: [],
      cryptos: [],
      holdingsRaw: [],
      incomeRecords: [],
      expenses: [],
      todayIso: "2026-05-24",
    },
  };
  const emptyOut = generateDecisionCandidates(empty);
  ok(
    "hold-current-path always returned even with empty data",
    emptyOut.candidates.some(c => c.kind === "hold-current-path"),
  );

  // No hardcoded household values — buy-IP candidate uses canonical income,
  // so an empty household produces no buy-IP candidate.
  ok(
    "no buy-IP candidate when income == 0 (no fabricated household values)",
    !emptyOut.candidates.some(c => c.kind === "buy-investment-property"),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Stable output for same inputs (byte-identical re-run)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Stable output for same inputs");
{
  const a = generateDecisionCandidates(baseInputs());
  const b = generateDecisionCandidates(baseInputs());
  ok("byte-identical candidate output", JSON.stringify(a) === JSON.stringify(b));
  const ra = rankDecisionCandidates({ candidateOutputs: a });
  const rb = rankDecisionCandidates({ candidateOutputs: b });
  ok("byte-identical ranked output", JSON.stringify(ra) === JSON.stringify(rb));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Recommended option + plain-English reasoning
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Recommended option + reasoning");
{
  const out = generateDecisionCandidates(baseInputs());
  const r: RankingOutput = rankDecisionCandidates({ candidateOutputs: out });
  ok("recommended option present", !!r.recommended);
  ok("recommended has rank 1", r.recommended?.rank === 1);
  ok(
    "recommended has plain-English reasoning",
    typeof r.recommended?.reasoning === "string" &&
      (r.recommended?.reasoning?.length ?? 0) > 20,
  );
  ok(
    "candidate carries plain-English rationale",
    typeof r.recommended?.candidate.rationale === "string" &&
      r.recommended!.candidate.rationale.length > 20,
  );
  ok(
    "every ranked candidate has unique rank",
    new Set(r.ranked.map(x => x.rank)).size === r.ranked.length,
  );

  // Integration with goalSolver — when a target is supplied, every candidate
  // that materially advances NW MUST report a non-null goalShortfall delta.
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const target = Math.round(head.netWorth * 1.5);
  const goalOut = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: target,
    targetFireDate: "2046-05-24",
  });
  const withGoals = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
    goalSolverOutputs: goalOut,
  });
  const offsetWithGoal = withGoals.candidates.find(c => c.kind === "offset-contribution");
  ok(
    "candidate goalShortfall non-null when goalSolver shortfall > 0",
    offsetWithGoal?.projection.deltaGoalShortfall != null,
    offsetWithGoal?.projection.deltaGoalShortfall,
  );

  // Monte Carlo integration end-to-end.
  const mc: MonteCarloResult = {
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
  const withMc = generateDecisionCandidates({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: mc,
  });
  const rMc = rankDecisionCandidates({ candidateOutputs: withMc });
  ok(
    "ranked output threads MC confidence into breakdown",
    rMc.ranked.every(rr => rr.breakdown.some(b => b.dimension === "mcConfidence")),
  );
}

/* ─── Synthetic helpers ────────────────────────────────────────────────── */

function allZeroProjection(c: DecisionCandidate): boolean {
  const p = c.projection;
  return (
    p.deltaNetWorth === 0 &&
    p.deltaPassiveIncome === 0 &&
    p.deltaMonthlySurplus === 0 &&
    p.deltaMonthlyDebtService === 0 &&
    p.deltaLiquidityMonths === 0 &&
    p.deltaFireProgress === 0
  );
}

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
    rationale: "synthetic candidate for ranking test",
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

/* ─── Summary ───────────────────────────────────────────────────────────── */

console.log(`\nSprint 5 Phase 2 results: ${passed} passed, ${failed} failed`);
// Surface a non-zero exit when any assertion failed so npm script wiring
// (and CI) treats the suite as a failure.
if (failed > 0) {
  process.exit(1);
}

// Silence the unused-import warnings TS surfaces when the test relies on the
// type guarantees alone.
void computeCanonicalDebtService;
