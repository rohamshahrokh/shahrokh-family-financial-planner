/**
 * Sprint 17 Phase 17.1 — Quality Score rubric tests.
 *
 * Run: npx tsx client/src/lib/__tests__/qualityScore.test.ts
 */

import { computeQualityScore } from "../recommendationEngine/qualityScore";
import { RULE_REGISTRY } from "../recommendationEngine/rules/registry";
import { buildRecommendationContext } from "../recommendationContext/buildContext";
import type { Recommendation, UnifiedSignals } from "../recommendationEngine/types";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

function makeRec(overrides: Partial<Recommendation>): Recommendation {
  return {
    id: "etf_dca",
    title: "ETF DCA",
    actionType: "etf_dca",
    pillar: "improve_fire_timeline",
    priorityRank: 0,
    confidenceScore: 0.6,
    urgency: "this_quarter",
    riskLevel: "Med",
    expectedFinancialImpact: { annualDollar: 20_000, confidence: 0.6 },
    implementationSteps: [],
    whatCouldChangeRecommendation: [],
    alternativeOptions: [],
    reviewTrigger: { condition: "" },
    sourceSignalsUsed: [],
    surfaces: [],
    reasoning: "",
    ...overrides,
  };
}

// 1. Output is 0..100
{
  const rec = makeRec({});
  const signals: UnifiedSignals = { monthlySurplus: 2000, etfExpectedReturn: 0.07 };
  const q = computeQualityScore(rec, signals);
  assert(q.total >= 0 && q.total <= 100, `total ${q.total} in [0,100]`);
}

// 2. Feasibility hard floor — negative surplus zeros out etf_dca
{
  const rec = makeRec({ actionType: "etf_dca" });
  const signals: UnifiedSignals = { monthlySurplus: -500 };
  const q = computeQualityScore(rec, signals);
  assert(q.feasibilityScore === 0, "negative surplus → feasibility 0");
  assert(q.total === 0, "feasibility 0 → total 0");
}

// 3. Stable for fixed inputs
{
  const rec = makeRec({});
  const signals: UnifiedSignals = { monthlySurplus: 3000 };
  const a = computeQualityScore(rec, signals);
  const b = computeQualityScore(rec, signals);
  assert(a.total === b.total, "deterministic total");
  assert(a.impactScore === b.impactScore, "deterministic impact");
}

// 4. Penalties accumulate
{
  const rec = makeRec({ actionType: "proceed_property_purchase", riskLevel: "High" });
  const signals: UnifiedSignals = {
    monthlySurplus: 2000,
    serviceabilityHeadroomMonthly: 500,
    postPurchaseBufferMonths: 2,
    mortgage: 800_000,
    ppor: 900_000,
    concentrationFlags: [
      { kind: "property_over_80", severity: "critical", observedPct: 85, thresholdPct: 80, affectedAssets: [], remediation: "" },
    ],
  };
  const q = computeQualityScore(rec, signals);
  assert(q.concentrationPenalty > 0, "property concentration penalises property purchase");
  assert(q.leveragePenalty > 0, "high LVR penalises property purchase");
  assert(q.riskPenalty >= 10, "high risk -> penalty");
}

// 5. Every existing rule has metadata
{
  const ids = [
    "build_emergency_buffer", "pay_high_interest_debt", "maintain_interest_free_debt",
    "monitor_strategic_debt", "plan_promo_expiry", "hold_cash_offset", "increase_super",
    "proceed_property_purchase", "delay_property_purchase", "etf_dca", "fire_acceleration",
    "reduce_leverage", "rebalance_portfolio", "hold_cash_fallback",
  ];
  for (const id of ids) {
    assert(RULE_REGISTRY[id] != null, `metadata exists for ${id}`);
  }
}

// 6. State gating — increase_super zeroes in STATE_C
{
  const inputs = { snapshot: { cash: 1_500_000, monthly_income: 8000, monthly_expenses: 5000, current_age: 50 } };
  const goal = { status: "SET", targetFireAge: 55, targetPassiveMonthly: 5000, swrPct: 0.04, targetPassiveAnnual: 60000, targetNetWorth: 1_500_000, goalSetTimestamp: "", source: "mc_fire_settings" };
  const ctx = buildRecommendationContext(inputs as any, goal as any);
  const rec = makeRec({ id: "increase_super", actionType: "increase_super", pillar: "preserve_tax_efficiency" });
  const signals: UnifiedSignals = { monthlySurplus: 2000, superCapRemaining: 5000, marginalTaxRate: 0.4 };
  const q = computeQualityScore(rec, signals, ctx);
  // ctx.lifeStage will be C or D — both suppress increase_super
  assert(q.total === 0, `state-gated increase_super zeros in ${ctx.lifeStage}`);
}

console.log(process.exitCode ? "FAILED" : "PASSED");
