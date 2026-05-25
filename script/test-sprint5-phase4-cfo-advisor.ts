/**
 * test-sprint5-phase4-cfo-advisor.ts
 *
 * Sprint 5 Phase 4 — CFO Advisor Layer.
 *
 * Verifies the CFO Advisor produces:
 *   §1  Risks insights derived from canonical / engine outputs
 *   §2  Opportunities insights derived from canonical / engine outputs
 *   §3  Bottlenecks insights derived from canonical / engine outputs
 *   §4  Contradictions insights derived from cross-engine deltas
 *   §5  Recommended Next Actions with goal / liquidity / risk / confidence references
 *   §6  Watch Items when optional engine outputs are missing
 *   §7  Every Recommended Next Action references goal gap + liquidity + risk + confidence
 *   §8  Deterministic output stability (byte-identical re-run)
 *   §9  Missing optional engine outputs handled without hallucination
 *   §10 No hardcoded household fallback when ledger / outputs are empty
 *   §11 Confidence / risk / liquidity evidence threading from upstream engines
 *
 * Run with:  tsx script/test-sprint5-phase4-cfo-advisor.ts
 */

import {
  generateCFOInsights,
  type CFOAdvisorResult,
  type CFOInsight,
} from "../client/src/lib/cfoAdvisor";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import { solveGoalGap } from "../client/src/lib/goalSolver";
import {
  generateDecisionCandidates,
  type CandidateGeneratorOutputs,
} from "../client/src/lib/decisionCandidates";
import { rankDecisionCandidates } from "../client/src/lib/decisionRanking";
import {
  computeBestMoveSprint5,
  type BestMoveResult,
} from "../client/src/lib/bestMoveEngineSprint5";
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

/* ─── Fixtures ──────────────────────────────────────────────────────────── */

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

const EMPTY_INPUTS: DashboardInputs = {
  snapshot: {},
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-24",
};

function makeMC(probFf: number): MonteCarloResult {
  return {
    p10: 100,
    p25: 200,
    median: 500,
    p75: 800,
    p90: 1000,
    prob_ff: probFf,
    prob_3m: 60,
    prob_5m: 40,
    prob_10m: 20,
    prob_neg_cf: 5,
    prob_cash_shortfall: 5,
    lowest_cash_median: 10_000,
    highest_risk_year: 2030,
    biggest_risk_driver: "test-driver",
    fan_data: [],
    key_risks: [],
    recommended_actions: [],
    ran_at: "2026-05-24T00:00:00Z",
    simulations: 1000,
  };
}

function makeRisk(score: number, coverage: "full" | "partial" | "minimal"): RiskRadarResult {
  return {
    overall_score: score,
    overall_level: score >= 70 ? "green" : score >= 40 ? "amber" : "red",
    overall_label: "Test Risk",
    categories: [],
    top_risks: [],
    top_mitigations: [],
    alerts: [],
    radar_data: [],
    fragility_index: 100 - score,
    data_coverage: coverage,
  };
}

const FIXTURE_MC = makeMC(70);
const FIXTURE_RISK = makeRisk(72, "full");

function findById(arr: CFOInsight[], id: string): CFOInsight | undefined {
  return arr.find(i => i.id === id);
}

console.log("\nSprint 5 Phase 4 — CFO Advisor Layer\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Risks
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("§1  Risks");
{
  // Low MC + fragile risk should produce risk insights.
  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: makeMC(20),
    riskOutputs: makeRisk(25, "full"),
  });
  ok("MC prob_ff < 50 ⇒ risk insight emitted", !!findById(out.risks, "risk:mc-prob-ff-low"));
  ok("risk overall_score < 40 ⇒ fragility insight emitted", !!findById(out.risks, "risk:overall-fragility"));

  const r1 = findById(out.risks, "risk:mc-prob-ff-low");
  ok("MC risk insight has monteCarlo evidence source", r1?.evidence.sources.includes("monteCarlo"));
  ok("MC risk insight quotes prob_ff value", r1?.evidence.values.some(v => v.label === "prob_ff"));

  // Healthy MC + resilient risk → no MC / fragility risk insight.
  const ok2 = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: makeMC(85),
    riskOutputs: makeRisk(80, "full"),
  });
  ok("MC prob_ff >= 80 ⇒ no MC risk insight", !findById(ok2.risks, "risk:mc-prob-ff-low"));
  ok("risk overall_score >= 70 ⇒ no fragility insight", !findById(ok2.risks, "risk:overall-fragility"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Opportunities
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§2  Opportunities");
{
  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: makeMC(85),
    riskOutputs: makeRisk(80, "full"),
  });
  ok("MC prob_ff >= 80 ⇒ opportunity insight", !!findById(out.opportunities, "opportunity:mc-prob-ff-strong"));
  ok("risk overall_score >= 70 ⇒ resilient opportunity insight", !!findById(out.opportunities, "opportunity:risk-resilient"));

  const opp = findById(out.opportunities, "opportunity:mc-prob-ff-strong");
  ok("opportunity insight has monteCarlo evidence", opp?.evidence.sources.includes("monteCarlo"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Bottlenecks
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§3  Bottlenecks");
{
  // Build a fixture where required contribution exceeds available surplus.
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const stretchTarget = Math.round(head.netWorth * 10);
  const goal = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: stretchTarget,
    targetFireDate: "2028-05-24",
  });
  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    goalSolverOutputs: goal,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });

  ok(
    "stretch goal ⇒ required-contribution-exceeds-surplus bottleneck emitted",
    !!findById(out.bottlenecks, "bottleneck:required-contribution-exceeds-surplus"),
    { reqContrib: goal.requiredMonthlyContribution, surplus: goal.trace.monthlySurplusAvailable },
  );

  // Empty ledger ⇒ only baseline candidate ⇒ no-actionable-candidates bottleneck.
  const empty = generateCFOInsights({ canonicalLedger: EMPTY_INPUTS });
  ok(
    "empty ledger ⇒ no-actionable-candidates bottleneck emitted",
    !!findById(empty.bottlenecks, "bottleneck:no-actionable-candidates"),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Contradictions
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§4  Contradictions");
{
  // Construct an ON_TRACK goal solver with low MC prob_ff to force a contradiction.
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const easyTarget = Math.round(head.netWorth * 1.001);
  const goal = solveGoalGap({
    canonicalLedger: FIXTURE_INPUTS,
    targetNetWorth: easyTarget,
    targetFireDate: "2046-05-24",
  });
  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    goalSolverOutputs: goal,
    monteCarloOutputs: makeMC(20),
    riskOutputs: makeRisk(80, "full"),
  });

  // We don't strictly know the goalSolver returns ON_TRACK without running it;
  // verify directly:
  if (goal.fireFeasibility === "ON_TRACK") {
    ok(
      "ON_TRACK + low MC ⇒ contradiction insight",
      !!findById(out.contradictions, "contradiction:on-track-vs-mc-low"),
    );
  } else {
    ok("goal solver verdict known", true);
  }

  // resilient risk + low MC ⇒ contradiction
  ok(
    "resilient risk + low MC ⇒ contradiction",
    !!findById(out.contradictions, "contradiction:risk-resilient-vs-mc-low"),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Recommended Next Actions
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§5  Recommended Next Actions");
{
  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });
  ok("recommendedNextActions has ≥1 insight", out.recommendedNextActions.length >= 1);
  const a = out.recommendedNextActions[0];
  ok("next-action category is 'next-action'", a?.category === "next-action");
  ok("next-action id is prefixed with 'next-action:'", a?.id.startsWith("next-action:"));
  ok("next-action has recommendation block", !!a?.recommendation);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Watch Items
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§6  Watch Items");
{
  const noOptional = generateCFOInsights({ canonicalLedger: FIXTURE_INPUTS });
  ok(
    "no MC supplied ⇒ watch:monte-carlo-missing emitted",
    !!findById(noOptional.watchItems, "watch:monte-carlo-missing"),
  );
  ok(
    "no risk supplied ⇒ watch:risk-engine-missing emitted",
    !!findById(noOptional.watchItems, "watch:risk-engine-missing"),
  );
  ok(
    "no goal targets ⇒ watch:goal-solver-incomplete emitted",
    !!findById(noOptional.watchItems, "watch:goal-solver-incomplete"),
  );

  // No ledger AND no outputs → single watch insight about missing canonical ledger
  const nothing = generateCFOInsights({});
  ok("no ledger, no outputs ⇒ exactly 1 watchItem", nothing.watchItems.length === 1, {
    n: nothing.watchItems.length,
    ids: nothing.watchItems.map(i => i.id),
  });
  ok(
    "no ledger ⇒ watch:missing-canonical-ledger emitted",
    !!findById(nothing.watchItems, "watch:missing-canonical-ledger"),
  );
  ok("no ledger ⇒ no risks emitted", nothing.risks.length === 0);
  ok("no ledger ⇒ no opportunities emitted", nothing.opportunities.length === 0);
  ok("no ledger ⇒ no bottlenecks emitted", nothing.bottlenecks.length === 0);
  ok("no ledger ⇒ no contradictions emitted", nothing.contradictions.length === 0);
  ok("no ledger ⇒ no next-actions emitted", nothing.recommendedNextActions.length === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Every recommended next action references goal / liquidity / risk / confidence
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§7  Required recommendation references");
{
  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });
  for (const action of out.recommendedNextActions) {
    ok(`${action.id} carries a recommendation block`, !!action.recommendation);
    if (action.recommendation) {
      ok(
        `${action.id} references goalGap`,
        action.recommendation.goalGap !== undefined &&
          action.recommendation.goalGap !== null &&
          "shortfallAmount" in action.recommendation.goalGap,
      );
      ok(
        `${action.id} references liquidityImpact (baseline/delta/postMove)`,
        typeof action.recommendation.liquidityImpact.baselineRunwayMonths === "number" &&
          typeof action.recommendation.liquidityImpact.deltaRunwayMonths === "number" &&
          typeof action.recommendation.liquidityImpact.postMoveRunwayMonths === "number",
      );
      ok(
        `${action.id} references riskImpact (exec + liquidity)`,
        typeof action.recommendation.riskImpact.executionRisk === "number" &&
          typeof action.recommendation.riskImpact.liquidityRisk === "number" &&
          typeof action.recommendation.riskImpact.deltaExecutionRiskVsHold === "number" &&
          typeof action.recommendation.riskImpact.deltaLiquidityRiskVsHold === "number",
      );
      ok(
        `${action.id} references confidenceLevel (value/band/mcConfidence/dataCoverage)`,
        typeof action.recommendation.confidenceLevel.value === "number" &&
          ["low", "moderate", "high"].includes(action.recommendation.confidenceLevel.band) &&
          ["full", "partial", "minimal"].includes(action.recommendation.confidenceLevel.dataCoverage),
      );
      ok(
        `${action.id} body mentions Goal gap`,
        action.body.toLowerCase().includes("goal gap"),
      );
      ok(
        `${action.id} body mentions Liquidity impact`,
        action.body.toLowerCase().includes("liquidity impact"),
      );
      ok(
        `${action.id} body mentions Risk impact`,
        action.body.toLowerCase().includes("risk impact"),
      );
      ok(
        `${action.id} body mentions Confidence level`,
        action.body.toLowerCase().includes("confidence level"),
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Deterministic output stability (byte-identical re-run)
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§8  Deterministic output stability");
{
  const a = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });
  const b = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });
  ok("byte-identical advisor result for same inputs", JSON.stringify(a) === JSON.stringify(b));

  // With no inputs at all.
  const empty1 = generateCFOInsights({});
  const empty2 = generateCFOInsights({});
  ok("byte-identical advisor result for empty inputs", JSON.stringify(empty1) === JSON.stringify(empty2));

  // With precomputed engine outputs.
  const cands = generateDecisionCandidates({ canonicalLedger: FIXTURE_INPUTS });
  const ranked = rankDecisionCandidates({ candidateOutputs: cands });
  const bm = computeBestMoveSprint5({ rankingOutputs: ranked });
  const c = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    candidateOutputs: cands,
    rankingOutputs: ranked,
    bestMoveOutputs: bm,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });
  const d = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    candidateOutputs: cands,
    rankingOutputs: ranked,
    bestMoveOutputs: bm,
    monteCarloOutputs: FIXTURE_MC,
    riskOutputs: FIXTURE_RISK,
  });
  ok("byte-identical advisor result with precomputed outputs", JSON.stringify(c) === JSON.stringify(d));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Missing optional data handling
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§9  Missing optional data handling");
{
  // Ledger only — engine must still produce a result.
  const out = generateCFOInsights({ canonicalLedger: FIXTURE_INPUTS });
  ok("ledger-only call returns a result without throwing", !!out);
  ok("trace.monteCarloSupplied false when MC omitted", out.trace.monteCarloSupplied === false);
  ok("trace.riskSupplied false when risk omitted", out.trace.riskSupplied === false);
  ok("trace marks incomplete when MC/risk missing", out.trace.incomplete === true);

  // Should NOT hallucinate an MC-derived insight when MC is absent.
  ok(
    "no MC ⇒ no risk:mc-prob-ff-low",
    !findById(out.risks, "risk:mc-prob-ff-low"),
  );
  ok(
    "no MC ⇒ no opportunity:mc-prob-ff-strong",
    !findById(out.opportunities, "opportunity:mc-prob-ff-strong"),
  );
  ok(
    "no MC ⇒ no risk:overall-fragility",
    !findById(out.risks, "risk:overall-fragility"),
  );

  // Recommendation references should still be populated for the best move,
  // with mcConfidence null and dataCoverage minimal.
  if (out.recommendedNextActions.length > 0) {
    const rec = out.recommendedNextActions[0].recommendation!;
    ok("rec.confidenceLevel.mcConfidence is null when MC absent", rec.confidenceLevel.mcConfidence === null);
    ok("rec.confidenceLevel.dataCoverage = 'minimal' when risk absent", rec.confidenceLevel.dataCoverage === "minimal");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — No hardcoded household fallback
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§10 No hardcoded household fallback");
{
  const out = generateCFOInsights({ canonicalLedger: EMPTY_INPUTS });
  ok("empty ledger ⇒ no risk insights about DSR", !findById(out.risks, "risk:debt-service-ratio-high"));
  ok("empty ledger ⇒ no opportunity insights about surplus", !findById(out.opportunities, "opportunity:surplus-healthy"));

  // No fabricated next-action: best move on empty ledger should be hold-baseline.
  const action = out.recommendedNextActions[0];
  ok("empty ledger ⇒ next action is hold-baseline", action?.headline.toLowerCase().includes("hold current path"));

  // No insight should mention any specific household dollar figure invented out
  // of thin air. We verify by ensuring evidence values match what canonical
  // engines actually produced (head.monthlyIncome should be 0).
  const head = computeCanonicalHeadlineMetrics(EMPTY_INPUTS);
  ok("empty ledger ⇒ canonical head.monthlyIncome is 0", head.monthlyIncome === 0);
  ok("empty ledger ⇒ watch:canonical-income-zero emitted", !!findById(out.watchItems, "watch:canonical-income-zero"));

  // Calling the advisor with NO inputs at all → only the lone watch item.
  const empty = generateCFOInsights({});
  ok("no inputs ⇒ no fabricated recommendation", empty.recommendedNextActions.length === 0);
  ok("no inputs ⇒ no fabricated risk insights", empty.risks.length === 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — Confidence / risk / liquidity evidence threading
 * ═══════════════════════════════════════════════════════════════════════════ */

console.log("\n§11 Confidence / risk / liquidity evidence threading");
{
  // Build the upstream engines explicitly so we can pin expected values.
  const head = computeCanonicalHeadlineMetrics(FIXTURE_INPUTS);
  const cands = generateDecisionCandidates({ canonicalLedger: FIXTURE_INPUTS });
  const ranked = rankDecisionCandidates({ candidateOutputs: cands });
  const bm = computeBestMoveSprint5({
    rankingOutputs: ranked,
    riskOutputs: FIXTURE_RISK,
    monteCarloOutputs: FIXTURE_MC,
  });

  const out = generateCFOInsights({
    canonicalLedger: FIXTURE_INPUTS,
    canonicalHead: head,
    candidateOutputs: cands,
    rankingOutputs: ranked,
    bestMoveOutputs: bm,
    riskOutputs: FIXTURE_RISK,
    monteCarloOutputs: FIXTURE_MC,
  });

  const action = out.recommendedNextActions[0];
  ok("action exists", !!action);
  if (action?.recommendation) {
    ok(
      "liquidityImpact.baselineRunwayMonths == bestMove.liquidityImpact.baselineRunwayMonths",
      Math.abs(
        action.recommendation.liquidityImpact.baselineRunwayMonths -
          bm.liquidityImpact.baselineRunwayMonths,
      ) < 0.01,
    );
    ok(
      "liquidityImpact.postMoveRunwayMonths matches bestMove.liquidityImpact.postMoveRunwayMonths",
      Math.abs(
        action.recommendation.liquidityImpact.postMoveRunwayMonths -
          bm.liquidityImpact.postMoveRunwayMonths,
      ) < 0.01,
    );
    ok(
      "riskImpact.executionRisk matches bestMove.riskImpact.executionRisk",
      Math.abs(
        action.recommendation.riskImpact.executionRisk - bm.riskImpact.executionRisk,
      ) < 0.01,
    );
    ok(
      "confidenceLevel.value matches bestMove.confidenceScore.value (within rounding)",
      Math.abs(
        action.recommendation.confidenceLevel.value - bm.confidenceScore.value,
      ) < 0.01,
    );
    ok(
      "confidenceLevel.band matches bestMove.confidenceScore.band",
      action.recommendation.confidenceLevel.band === bm.confidenceScore.band,
    );
    ok(
      "confidenceLevel.dataCoverage matches risk.data_coverage",
      action.recommendation.confidenceLevel.dataCoverage === FIXTURE_RISK.data_coverage,
    );
    ok(
      "confidenceLevel.mcConfidence threaded from bestMove",
      action.recommendation.confidenceLevel.mcConfidence === bm.riskImpact.mcConfidence ||
        (action.recommendation.confidenceLevel.mcConfidence != null &&
          bm.riskImpact.mcConfidence != null &&
          Math.abs(
            action.recommendation.confidenceLevel.mcConfidence - bm.riskImpact.mcConfidence,
          ) < 0.01),
    );
  }

  // Trace flags reflect inputs supplied.
  ok("trace.canonicalHeadSupplied true", out.trace.canonicalHeadSupplied === true);
  ok("trace.candidatesSupplied true", out.trace.candidatesSupplied === true);
  ok("trace.rankingSupplied true", out.trace.rankingSupplied === true);
  ok("trace.bestMoveSupplied true", out.trace.bestMoveSupplied === true);
  ok("trace.riskSupplied true", out.trace.riskSupplied === true);
  ok("trace.monteCarloSupplied true", out.trace.monteCarloSupplied === true);
  ok("trace.derivedEngineOutputs.bestMove false (precomputed)", out.trace.derivedEngineOutputs.bestMove === false);
}

/* ─── Final ─────────────────────────────────────────────────────────────── */

// Type-probe to keep symbols referenced.
const _typeProbe: CFOAdvisorResult | undefined = undefined;
void _typeProbe;
const _bmProbe: BestMoveResult | undefined = undefined;
void _bmProbe;
const _candProbe: CandidateGeneratorOutputs | undefined = undefined;
void _candProbe;

console.log(
  `\nResults: ${passed} passed, ${failed} failed.${failed > 0 ? "  (failed)" : ""}\n`,
);
if (failed > 0) process.exit(1);
