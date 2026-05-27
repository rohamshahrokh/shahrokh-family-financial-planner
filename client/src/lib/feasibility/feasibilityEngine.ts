/**
 * Sprint 18 Phase 18.2 — Feasibility engine.
 *
 * Entry points:
 *   - evaluateRecommendationFeasibility(rec, ctx)
 *   - evaluatePathFeasibility(path, ctx)
 *
 * Hard rule (user §2): if the action is not currently feasible, the
 * feasibility result MUST say so explicitly — "Not currently feasible" or
 * "Feasible after X months of saving" or "Feasible only if borrowing
 * capacity supports ~$X". The explanation layer reads `summary` verbatim.
 */

import type { Recommendation } from "../recommendationEngine/types";
import type { RecommendationContext } from "../recommendationContext/types";
import type { OptimisedPath } from "../recommendationOptimization/pathTypes";
import type {
  FeasibilityBlocker,
  FeasibilityResult,
  FeasibilityVerdict,
} from "./feasibilityTypes";
import { computeBorrowingCapacity } from "./borrowingCapacity";
import { assessDebtServiceability } from "./debtServiceability";
import { assessLiquidityBuffer } from "./liquidityBuffer";
import { estimateTransactionCosts } from "./transactionCosts";
import { estimateTaxFriction } from "./taxFriction";

const MIN_MONTHLY_SURPLUS = 200;

function neutralFeasibility(reason = "No feasibility constraints detected."): FeasibilityResult {
  return {
    feasible: true,
    verdict: "feasible",
    feasibilityScore: 1.0,
    blockers: [],
    requiredConditions: [],
    estimatedMonthsUntilFeasible: null,
    monthlySurplusImpact: 0,
    liquidityBufferImpact: 0,
    summary: reason,
    assumptions: {},
  };
}

function summariseInfeasible(blockers: FeasibilityBlocker[], monthsToFeasible: number | null): string {
  if (monthsToFeasible != null && monthsToFeasible > 0) {
    return `Not currently feasible — feasible after approximately ${Math.round(monthsToFeasible)} months of saving. Blockers: ${blockers
      .map((b) => b.reason)
      .join("; ")}.`;
  }
  return `Not currently feasible. Blockers: ${blockers.map((b) => b.reason).join("; ")}.`;
}

function summariseConditional(conditions: string[]): string {
  return `Feasible only if: ${conditions.join("; ")}.`;
}

function evaluatePropertyFeasibility(
  rec: Recommendation,
  ctx: RecommendationContext,
): FeasibilityResult {
  const t = ctx.today;
  const snapshot = t.ledger?.snapshot ?? {};
  const grossAnnualIncome = Number(snapshot.roham_gross_annual ?? snapshot.monthly_income * 12 ?? t.cashflow.monthlyIncome * 12);
  const monthlyExpenses = t.cashflow.monthlyExpenses;
  const monthlySurplus = t.cashflow.monthlySurplus;
  const dependents = Number(snapshot.num_dependents ?? 0);
  const cashAvailable = Math.max(0, t.netWorth.cash);
  const state = String(snapshot.state ?? "QLD").toUpperCase();

  // Inferred target purchase price — heuristic from existing PPOR or 6× income
  const inferredPurchasePrice =
    Number(snapshot.target_property_price)
    || Math.min(Math.max(grossAnnualIncome * 5, 600_000), 1_500_000);

  // Borrowing capacity check
  const borrowing = computeBorrowingCapacity({
    grossAnnualIncome,
    monthlyDebtRepayments: snapshot.monthly_debt_repayments ?? 0,
    monthlyLivingExpenses: monthlyExpenses,
    dependents,
  });

  // Required loan = price − cash − sellable equity (we ignore sellable for safety)
  const requiredDeposit = inferredPurchasePrice * 0.20;
  const requiredLoan = Math.max(0, inferredPurchasePrice - cashAvailable);

  // Transaction costs
  const tx = estimateTransactionCosts({
    purchasePriceAud: inferredPurchasePrice,
    depositAud: Math.min(cashAvailable, requiredDeposit),
    state,
    firstHomeBuyer: !snapshot.ppor || snapshot.ppor === 0,
  });

  const cashRequiredAtSettlement = requiredDeposit + tx.total;
  const cashShortfall = Math.max(0, cashRequiredAtSettlement - cashAvailable);

  // Servicing
  const service = assessDebtServiceability({
    loanAud: requiredLoan,
    ratePct: snapshot.mortgage_rate ?? 0.0582,
    monthlySurplus,
    existingMonthlyRepayments: snapshot.monthly_debt_repayments ?? 0,
  });

  // Post-purchase liquidity
  const liquidity = assessLiquidityBuffer({
    cashAud: cashAvailable,
    outflowAud: cashRequiredAtSettlement,
    monthlyExpenses,
  });

  const blockers: FeasibilityBlocker[] = [];
  const requiredConditions: string[] = [];

  let monthsToFeasible: number | null = null;
  if (cashShortfall > 0) {
    const months = monthlySurplus > 0 ? Math.ceil(cashShortfall / monthlySurplus) : null;
    monthsToFeasible = months;
    blockers.push({
      id: "deposit_shortfall",
      reason: `Deposit + costs shortfall ~$${Math.round(cashShortfall)} (need $${Math.round(cashRequiredAtSettlement)}, have $${Math.round(cashAvailable)}).`,
      severity: "critical",
      estimatedMonthsToResolve: months ?? undefined,
    });
  }
  if (requiredLoan > borrowing.maxBorrowAud) {
    blockers.push({
      id: "borrowing_capacity",
      reason: `Borrowing capacity ~$${Math.round(borrowing.maxBorrowAud)} below required loan ~$${Math.round(requiredLoan)}.`,
      severity: "critical",
    });
    requiredConditions.push(`Increase income or reduce target price below ~$${Math.round(borrowing.maxBorrowAud + cashAvailable)}.`);
  }
  if (!service.passes) {
    blockers.push({
      id: "serviceability",
      reason: service.failureReason ?? "Mortgage servicing fails stress test.",
      severity: "critical",
    });
  }
  if (!liquidity.meetsMinimum) {
    blockers.push({
      id: "post_settlement_liquidity",
      reason: `Post-settlement runway falls to ${liquidity.monthsRunwayAfter} months (target ≥ 3).`,
      severity: "warning",
    });
    requiredConditions.push("Top up cash buffer to ≥ 3 months expenses before settlement.");
  }
  if (rec.actionType === "proceed_property_purchase" && dependents > 0 && monthlySurplus < 1500) {
    blockers.push({
      id: "family_pressure",
      reason: "Monthly surplus < $1,500 with dependents — limited headroom for rate shocks.",
      severity: "warning",
    });
  }

  let feasible = blockers.filter((b) => b.severity === "critical").length === 0;
  let verdict: FeasibilityVerdict = feasible
    ? requiredConditions.length === 0 ? "feasible" : "feasible_with_conditions"
    : monthsToFeasible != null && monthsToFeasible > 0 ? "feasible_after_saving" : "not_currently_feasible";

  const feasibilityScore = feasible
    ? Math.max(0.55, 1 - blockers.length * 0.1 - requiredConditions.length * 0.05)
    : Math.max(0.05, 0.3 - blockers.length * 0.05);

  const summary = feasible
    ? requiredConditions.length === 0
      ? `Currently feasible — required cash $${Math.round(cashRequiredAtSettlement)}, servicing passes +2% stress.`
      : summariseConditional(requiredConditions)
    : summariseInfeasible(blockers, monthsToFeasible);

  return {
    feasible,
    verdict,
    feasibilityScore,
    blockers,
    requiredConditions,
    estimatedMonthsUntilFeasible: monthsToFeasible,
    monthlySurplusImpact: -service.monthlyRepayment,
    liquidityBufferImpact: liquidity.monthsRunwayBefore - liquidity.monthsRunwayAfter,
    summary,
    assumptions: {
      inferredPurchasePrice,
      requiredDeposit,
      stampDutyAUD: tx.stampDuty,
      stampDutyState: tx.stateUsed,
      borrowingCapacityAUD: borrowing.maxBorrowAud,
      stressedRepaymentAUD: service.monthlyRepaymentStressed,
      stressedRatePct: 6.5,
    },
  };
}

function evaluateInvestmentFeasibility(
  rec: Recommendation,
  ctx: RecommendationContext,
): FeasibilityResult {
  const surplus = ctx.today.cashflow.monthlySurplus;
  const target = rec.expectedFinancialImpact?.annualDollar ?? 0;
  const monthlyDeploy = Math.abs(target) / 12;
  const cashRunway = ctx.today.cashflow.monthlyExpenses > 0
    ? ctx.today.netWorth.cash / ctx.today.cashflow.monthlyExpenses
    : Infinity;

  const blockers: FeasibilityBlocker[] = [];
  const requiredConditions: string[] = [];

  if (surplus < MIN_MONTHLY_SURPLUS) {
    blockers.push({
      id: "negative_or_thin_surplus",
      reason: `Monthly surplus ${surplus < 0 ? "negative" : "below $200 floor"} — cannot sustain DCA.`,
      severity: surplus < 0 ? "critical" : "warning",
    });
  }
  if (cashRunway < 1) {
    blockers.push({
      id: "no_emergency_buffer",
      reason: "Less than 1 month of expenses in cash — buffer must precede investment.",
      severity: "critical",
    });
    requiredConditions.push("Build at least 1-month emergency buffer before deploying surplus.");
  }
  if (monthlyDeploy > surplus * 0.9) {
    requiredConditions.push("Reduce monthly deployment to ≤ 70% of surplus.");
  }

  const feasible = blockers.filter((b) => b.severity === "critical").length === 0;
  const feasibilityScore = feasible
    ? Math.max(0.7, 1 - requiredConditions.length * 0.08)
    : 0.2;
  const verdict: FeasibilityVerdict = feasible
    ? requiredConditions.length === 0 ? "feasible" : "feasible_with_conditions"
    : "not_currently_feasible";

  return {
    feasible,
    verdict,
    feasibilityScore,
    blockers,
    requiredConditions,
    estimatedMonthsUntilFeasible: surplus < 0 ? null : (cashRunway < 1 ? 6 : null),
    monthlySurplusImpact: -monthlyDeploy,
    liquidityBufferImpact: 0,
    summary: feasible
      ? requiredConditions.length === 0
        ? `Feasible — deploy ~$${Math.round(monthlyDeploy)}/mo against current $${Math.round(surplus)}/mo surplus.`
        : summariseConditional(requiredConditions)
      : summariseInfeasible(blockers, null),
    assumptions: {
      surplusObserved: surplus,
      cashRunwayMonths: Number(cashRunway.toFixed(1)),
      annualTarget: target,
    },
  };
}

function evaluateDebtPaydownFeasibility(
  _rec: Recommendation,
  ctx: RecommendationContext,
): FeasibilityResult {
  const surplus = ctx.today.cashflow.monthlySurplus;
  if (surplus < MIN_MONTHLY_SURPLUS) {
    return {
      feasible: false,
      verdict: "not_currently_feasible",
      feasibilityScore: 0.2,
      blockers: [{
        id: "surplus_too_thin",
        reason: `Monthly surplus $${Math.round(surplus)} insufficient to accelerate debt paydown above minimums.`,
        severity: "critical",
      }],
      requiredConditions: ["Improve cashflow before accelerating principal payments."],
      estimatedMonthsUntilFeasible: null,
      monthlySurplusImpact: 0,
      liquidityBufferImpact: 0,
      summary: "Not currently feasible — surplus too thin to accelerate paydown.",
      assumptions: { surplus },
    };
  }
  return neutralFeasibility(
    `Feasible — surplus $${Math.round(surplus)}/mo can be redirected to debt principal.`,
  );
}

function evaluateCryptoFeasibility(
  _rec: Recommendation,
  ctx: RecommendationContext,
): FeasibilityResult {
  const cryptoPct = ctx.today.netWorth.total > 0
    ? ctx.today.netWorth.crypto / ctx.today.netWorth.total
    : 0;
  if (cryptoPct > 0.30) {
    return {
      feasible: false,
      verdict: "not_currently_feasible",
      feasibilityScore: 0.25,
      blockers: [{
        id: "crypto_concentration",
        reason: `Crypto already ${(cryptoPct * 100).toFixed(0)}% of net worth — adding more breaches concentration limits.`,
        severity: "critical",
      }],
      requiredConditions: ["Reduce crypto to ≤ 20% of NW before further accumulation."],
      estimatedMonthsUntilFeasible: null,
      monthlySurplusImpact: 0,
      liquidityBufferImpact: 0,
      summary: `Not currently feasible — crypto concentration at ${(cryptoPct * 100).toFixed(0)}% already breaches safety limit.`,
      assumptions: { cryptoPct: Number(cryptoPct.toFixed(3)) },
    };
  }
  return neutralFeasibility("Crypto exposure below concentration limit; DCA acceptable.");
}

export function evaluateRecommendationFeasibility(
  rec: Recommendation,
  ctx: RecommendationContext,
): FeasibilityResult {
  switch (rec.actionType) {
    case "proceed_property_purchase":
    case "delay_property_purchase":
      return evaluatePropertyFeasibility(rec, ctx);
    case "etf_dca":
    case "fire_acceleration":
    case "increase_super":
      return evaluateInvestmentFeasibility(rec, ctx);
    case "pay_high_interest_debt":
    case "reduce_leverage":
      return evaluateDebtPaydownFeasibility(rec, ctx);
    case "crypto_dca":
      return evaluateCryptoFeasibility(rec, ctx);
    default:
      return neutralFeasibility();
  }
}

export function evaluatePathFeasibility(
  path: OptimisedPath,
  ctx: RecommendationContext,
): OptimisedPath {
  // Aggregate feasibility across path steps. A path is infeasible if ANY
  // step has a critical blocker that can't be resolved by an earlier step.
  const stepResults = path.steps.map((step) => {
    const synthetic = {
      id: step.actionType,
      actionType: step.actionType,
      expectedFinancialImpact: { annualDollar: (step.estimatedMonthlyAmount ?? 0) * 12 },
    } as unknown as Recommendation;
    return evaluateRecommendationFeasibility(synthetic, ctx);
  });

  const criticalBlockers = stepResults.flatMap((r) => r.blockers.filter((b) => b.severity === "critical"));
  const requiredConditions = Array.from(new Set(stepResults.flatMap((r) => r.requiredConditions)));
  const feasible = criticalBlockers.length === 0;

  return {
    ...path,
    feasibility: {
      feasible,
      blockers: criticalBlockers.map((b) => b.reason),
      requiredConditions,
    },
  };
}
