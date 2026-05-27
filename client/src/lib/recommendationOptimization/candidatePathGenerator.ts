/**
 * Sprint 18 Phase 18.1 — Candidate Path Generator.
 *
 * Generates 5 archetype paths per household:
 *   - debt_first       : pay down high-interest debt first, then invest
 *   - property_led     : prioritise PPOR/IP acquisition over liquid growth
 *   - liquid_growth    : ETF/super DCA-led accumulation
 *   - risk_reduction   : buffer up + de-leverage + diversify first
 *   - fire_protection  : preserve, glidepath, SWR discipline (late-stage)
 *
 * Paths are deterministic from the RecommendationContext. Each path has
 * 2–4 sequenced steps with estimated time-from-start in months.
 */

import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath, PathStep } from "./pathTypes";

function step(o: Partial<PathStep>): PathStep {
  return {
    order: 0,
    actionType: "etf_dca",
    title: "",
    description: "",
    pillar: "maintain_investing_discipline",
    estimatedMonthsFromStart: 0,
    evidence: [],
    ...o,
  };
}

function emptyPath(
  id: string,
  archetype: OptimisedPath["archetype"],
  title: string,
  summary: string,
  steps: PathStep[],
): OptimisedPath {
  return {
    id,
    archetype,
    title,
    summary,
    steps,
    score: 0,
    scoreComponents: {
      fireAccelerationScore: 0,
      successProbabilityScore: 0,
      riskAdjustedReturnScore: 0,
      feasibilityScore: 0,
      liquiditySafetyScore: 0,
      behaviouralFitScore: 0,
      taxEfficiencyScore: 0,
      penalties: 0,
    },
    expectedFireDeltaMonths: null,
    expectedSuccessProbabilityDelta: null,
    expectedNetWorthDelta: null,
    feasibility: { feasible: true, blockers: [], requiredConditions: [] },
    behaviouralNote: "",
    reasoning: "",
    finalised: false,
  };
}

export function generateCandidatePaths(ctx: RecommendationContext): OptimisedPath[] {
  const t = ctx.today;
  const lifeStage = ctx.lifeStage ?? "STATE_A_ACCUMULATION";
  const hasMortgage = (t.netWorth.debt ?? 0) > 0 || (t.ledger?.snapshot?.mortgage ?? 0) > 0;
  const hasCrypto = t.netWorth.crypto > 0;
  const cashRunwayMonths = t.cashflow.monthlyExpenses > 0
    ? t.netWorth.cash / t.cashflow.monthlyExpenses
    : 0;
  const lowLiquidity = cashRunwayMonths < 3;
  const surplus = t.cashflow.monthlySurplus;
  const dcaCap = Math.max(0, Math.min(surplus * 0.7, 6000));

  const paths: OptimisedPath[] = [];

  // ─── 1. Debt-first ───────────────────────────────────────────────────────
  if (hasMortgage || (t.ledger?.snapshot?.other_debts ?? 0) > 0) {
    paths.push(emptyPath(
      "path_debt_first",
      "debt_first",
      "Debt-first path",
      "Knock out high-interest debt before scaling investments, then accelerate when freed up.",
      [
        step({
          order: 1,
          actionType: "pay_high_interest_debt",
          title: "Clear high-interest debt",
          description: "Direct surplus toward consumer/personal debt above ~7% APR.",
          pillar: "reduce_high_interest_debt",
          estimatedMonthsFromStart: 0,
          estimatedMonthlyAmount: Math.max(surplus * 0.6, 500),
          evidence: ["debt_balances"],
        }),
        step({
          order: 2,
          actionType: "build_emergency_buffer",
          title: "Top up emergency buffer to 6 months expenses",
          description: "Once debt is cleared, redirect freed cashflow to a liquid buffer.",
          pillar: "protect_liquidity",
          estimatedMonthsFromStart: 8,
          evidence: ["ledger_income_expense"],
        }),
        step({
          order: 3,
          actionType: "etf_dca",
          title: "Resume ETF DCA at higher rate",
          description: "Reinvest the now-larger surplus into diversified ETFs.",
          pillar: "maintain_investing_discipline",
          estimatedMonthsFromStart: 14,
          estimatedMonthlyAmount: dcaCap,
          evidence: ["ledger_income_expense"],
        }),
      ],
    ));
  }

  // ─── 2. Property-led ─────────────────────────────────────────────────────
  if (ctx.plan.ownershipGoals?.allowInvestmentProperty || !hasMortgage) {
    paths.push(emptyPath(
      "path_property_led",
      "property_led",
      "Property-led path",
      "Anchor wealth in property (PPOR or IP) before scaling other assets.",
      [
        step({
          order: 1,
          actionType: "build_emergency_buffer",
          title: "Build 4-month liquidity buffer pre-settlement",
          description: "Lenders and serviceability stress tests need a real cash buffer.",
          pillar: "protect_liquidity",
          estimatedMonthsFromStart: 0,
          evidence: ["ledger_income_expense"],
        }),
        step({
          order: 2,
          actionType: hasMortgage ? "hold_cash_offset" : "proceed_property_purchase",
          title: hasMortgage ? "Use offset against mortgage" : "Proceed with property purchase",
          description: hasMortgage
            ? "Park surplus in offset until next property step is ready."
            : "Secure deposit + stamp duty, then purchase within feasibility limits.",
          pillar: "maximise_wealth",
          estimatedMonthsFromStart: 6,
          evidence: ["snapshot", "property_readiness"],
        }),
        step({
          order: 3,
          actionType: "etf_dca",
          title: "Resume smaller ETF DCA",
          description: "Add equity exposure alongside property to avoid single-asset risk.",
          pillar: "maintain_investing_discipline",
          estimatedMonthsFromStart: 18,
          estimatedMonthlyAmount: Math.min(dcaCap, 1500),
          evidence: ["ledger_income_expense"],
        }),
      ],
    ));
  }

  // ─── 3. Liquid growth ─────────────────────────────────────────────────────
  if (lifeStage === "STATE_A_ACCUMULATION" || lifeStage === "STATE_B_ACCELERATING") {
    paths.push(emptyPath(
      "path_liquid_growth",
      "liquid_growth",
      "Liquid-growth path",
      "Maximise diversified ETF + super contributions without locking up cash.",
      [
        step({
          order: 1,
          actionType: "etf_dca",
          title: "Set up ETF DCA at safe cap",
          description: "DCA into a diversified ETF basket up to safe deployable surplus.",
          pillar: "maintain_investing_discipline",
          estimatedMonthsFromStart: 0,
          estimatedMonthlyAmount: dcaCap,
          evidence: ["ledger_income_expense"],
        }),
        step({
          order: 2,
          actionType: "increase_super",
          title: "Top up concessional super contributions",
          description: "Capture the tax wedge on remaining concessional cap.",
          pillar: "preserve_tax_efficiency",
          estimatedMonthsFromStart: 3,
          estimatedMonthlyAmount: Math.max(0, Math.min(1500, surplus * 0.2)),
          evidence: ["household_tax"],
        }),
        step({
          order: 3,
          actionType: "fire_acceleration",
          title: "Compound to FIRE target",
          description: "Continue DCA at scale; rebalance annually.",
          pillar: "improve_fire_timeline",
          estimatedMonthsFromStart: 12,
          evidence: ["fire_engine"],
        }),
      ],
    ));
  }

  // ─── 4. Risk reduction ───────────────────────────────────────────────────
  if (lowLiquidity || hasCrypto || (t.ledger?.snapshot?.mortgage ?? 0) > 0) {
    paths.push(emptyPath(
      "path_risk_reduction",
      "risk_reduction",
      "Risk-reduction path",
      "Stabilise before scaling: buffer, de-leverage, then diversify.",
      [
        step({
          order: 1,
          actionType: "build_emergency_buffer",
          title: "Build 6-month emergency buffer",
          description: "Cash buffer first; investment risk should never be taken on no liquidity.",
          pillar: "protect_liquidity",
          estimatedMonthsFromStart: 0,
          evidence: ["ledger_income_expense"],
        }),
        step({
          order: 2,
          actionType: hasCrypto ? "rebalance_concentration" : "reduce_leverage",
          title: hasCrypto
            ? "Trim concentrated crypto exposure"
            : "Reduce mortgage / leverage stress",
          description: hasCrypto
            ? "DCA out of single-asset concentration toward diversified ETFs."
            : "Pay down principal or refinance to reduce serviceability stress.",
          pillar: "stabilise_leverage",
          estimatedMonthsFromStart: 6,
          evidence: ["concentration_detector"],
        }),
        step({
          order: 3,
          actionType: "etf_dca",
          title: "Resume diversified DCA",
          description: "Steady, broad-market accumulation after de-risking the portfolio.",
          pillar: "maintain_investing_discipline",
          estimatedMonthsFromStart: 12,
          estimatedMonthlyAmount: dcaCap * 0.8,
          evidence: ["ledger_income_expense"],
        }),
      ],
    ));
  }

  // ─── 5. FIRE protection / preservation ───────────────────────────────────
  if (
    lifeStage === "STATE_C_NEAR_FIRE" ||
    lifeStage === "STATE_D_FIRE_ACHIEVED" ||
    lifeStage === "STATE_E_DECUMULATION"
  ) {
    paths.push(emptyPath(
      "path_fire_protection",
      "fire_protection",
      "FIRE-protection path",
      "Lock in success: glidepath, cash reserve, SWR discipline.",
      [
        step({
          order: 1,
          actionType: "glidepath_shift",
          title: "Shift to age-appropriate equity glidepath",
          description: "Reduce equity allocation toward the de-risked retirement model.",
          pillar: "decumulate_safely",
          estimatedMonthsFromStart: 0,
          evidence: ["portfolio_construction"],
        }),
        step({
          order: 2,
          actionType: "increase_cash_reserve",
          title: "Hold 24 months of expenses in cash/bonds",
          description: "Sequence-of-returns insurance for the first decade of drawdown.",
          pillar: "protect_liquidity",
          estimatedMonthsFromStart: 3,
          evidence: ["ledger_income_expense"],
        }),
        step({
          order: 3,
          actionType: "swr_review",
          title: "Review safe withdrawal rate annually",
          description: "Adjust SWR if MC success drops below target.",
          pillar: "decumulate_safely",
          estimatedMonthsFromStart: 12,
          evidence: ["monte_carlo_v4"],
        }),
      ],
    ));
  } else {
    // Always provide a fire-protection path placeholder for comparison even
    // pre-retirement, so the optimiser can show why it isn't ranked first.
    paths.push(emptyPath(
      "path_fire_protection",
      "fire_protection",
      "FIRE-protection (pre-emptive)",
      "Insurance + income protection now so future you isn't exposed.",
      [
        step({
          order: 1,
          actionType: "income_protection",
          title: "Lock in income protection insurance",
          description: "Cover single-income or self-employed households against earnings shock.",
          pillar: "prevent_failure",
          estimatedMonthsFromStart: 0,
          evidence: ["snapshot"],
        }),
        step({
          order: 2,
          actionType: "build_emergency_buffer",
          title: "Buffer up to 6 months of expenses",
          description: "Reduce sequence risk before the accumulation phase ends.",
          pillar: "protect_liquidity",
          estimatedMonthsFromStart: 3,
          evidence: ["ledger_income_expense"],
        }),
      ],
    ));
  }

  // Ensure at least 2 paths even on minimal-input households
  if (paths.length < 2) {
    paths.push(emptyPath(
      "path_liquid_growth",
      "liquid_growth",
      "Liquid-growth path (fallback)",
      "Steady ETF DCA at safe surplus.",
      [
        step({
          order: 1,
          actionType: "etf_dca",
          title: "Start ETF DCA at safe cap",
          description: "Build long-term equity exposure with monthly DCA.",
          pillar: "maintain_investing_discipline",
          estimatedMonthsFromStart: 0,
          estimatedMonthlyAmount: dcaCap,
          evidence: ["ledger_income_expense"],
        }),
      ],
    ));
  }

  return paths;
}
